import hashlib
import json
import os
import re
import shutil
import ssl
import subprocess
import tempfile
import urllib.error
import urllib.request
import zipfile
from typing import Any, Dict, List, Optional, Tuple

import decky

SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")
PACKAGE_JSON = os.path.join(decky.DECKY_PLUGIN_DIR, "package.json")
UPDATE_LOG = os.path.join(decky.DECKY_PLUGIN_LOG_DIR, "update-debug.log")
GITHUB_OWNER = "BirikuSistema"
GITHUB_REPO = "decky-recents-filter"
GITHUB_API_LATEST = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"
USER_AGENT = "Recents-Filter-Decky"

DEFAULTS: Dict[str, Any] = {
    "version": 4,
    "enabled": True,
    "hideRecentsHeader": False,
    "minPlaytimeMinutes": 0,
    "maxVisible": 12,
    "keepRowIfEmpty": True,
    "hiddenAppIds": [],
    "shownAppIds": [],
    "hiddenCollectionIds": [],
}

_RELEASE_HOSTS = (
    "github.com",
    "api.github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
)


def _ulog(msg: str) -> None:
    try:
        os.makedirs(decky.DECKY_PLUGIN_LOG_DIR, exist_ok=True)
        with open(UPDATE_LOG, "a", encoding="utf-8") as handle:
            handle.write(msg.rstrip() + "\n")
    except Exception:
        pass
    try:
        decky.logger.info(msg)
    except Exception:
        pass


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    for candidate in (
        "/etc/ssl/certs/ca-certificates.crt",
        "/etc/ssl/cert.pem",
        "/var/lib/ca-certificates/ca-bundle.pem",
        "/etc/pki/tls/certs/ca-bundle.crt",
    ):
        if os.path.exists(candidate):
            try:
                ctx.load_verify_locations(cafile=candidate)
            except Exception:
                pass
            break
    return ctx


def _merge(defaults: Dict[str, Any], stored: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(defaults)
    for key, value in stored.items():
        if key in defaults:
            merged[key] = value
    if "shownAppIds" in defaults and not merged.get("shownAppIds") and isinstance(stored.get("pinnedAppIds"), list):
        merged["shownAppIds"] = stored["pinnedAppIds"]
    merged["version"] = DEFAULTS["version"]
    return merged


def _read() -> Dict[str, Any]:
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as handle:
            stored = json.load(handle)
        if isinstance(stored, dict):
            return _merge(DEFAULTS, stored)
    except FileNotFoundError:
        pass
    except Exception as exc:
        decky.logger.error(f"Failed to read settings: {exc}")
    return dict(DEFAULTS)


def _write(settings: Dict[str, Any]) -> Dict[str, Any]:
    os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
    merged = _merge(DEFAULTS, settings if isinstance(settings, dict) else {})
    with open(SETTINGS_FILE, "w", encoding="utf-8") as handle:
        json.dump(merged, handle, indent=2)
    return merged


def _read_installed_version() -> str:
    try:
        with open(PACKAGE_JSON, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        version = str(data.get("version") or "").strip()
        if version:
            return version
    except Exception as exc:
        decky.logger.error(f"Failed to read package.json version: {exc}")
    return "0.0.0"


def _parse_semver(value: str) -> tuple:
    raw = re.sub(r"^v", "", (value or "").strip(), flags=re.IGNORECASE)
    core, _, pre = raw.partition("-")
    nums = []
    for part in core.split("."):
        try:
            nums.append(int(part))
        except ValueError:
            nums.append(0)
    while len(nums) < 3:
        nums.append(0)
    return (tuple(nums[:3]), pre)


def _is_newer(latest: str, current: str) -> bool:
    try:
        return _parse_semver(latest) > _parse_semver(current)
    except Exception:
        return False


def _is_allowed_download_url(url: str) -> bool:
    try:
        from urllib.parse import urlsplit

        parts = urlsplit(url)
        host = (parts.hostname or "").lower()
        if parts.scheme != "https":
            return False
        if host in _RELEASE_HOSTS or host.endswith(".githubusercontent.com"):
            return True
        return False
    except Exception:
        return False


def _http_json(url: str) -> Optional[Dict[str, Any]]:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=12, context=_ssl_context()) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload if isinstance(payload, dict) else None


def _pick_zip_asset(release: Dict[str, Any]) -> Tuple[Optional[str], Optional[int]]:
    assets = release.get("assets")
    if not isinstance(assets, list):
        return None, None
    preferred_url = None
    preferred_id = None
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        name = str(asset.get("name") or "")
        url = str(asset.get("browser_download_url") or "")
        asset_id = asset.get("id")
        if not name.lower().endswith(".zip") or not url:
            continue
        lower = name.lower()
        if "recents" in lower or "decky-recents-filter" in lower:
            return url, int(asset_id) if asset_id is not None else None
        if preferred_url is None:
            preferred_url = url
            preferred_id = int(asset_id) if asset_id is not None else None
    return preferred_url, preferred_id


def _download_urllib(url: str, dest: str) -> None:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/octet-stream",
            "User-Agent": USER_AGENT,
        },
    )
    tmp = dest + ".part"
    with urllib.request.urlopen(req, timeout=90, context=_ssl_context()) as resp, open(tmp, "wb") as handle:
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            handle.write(chunk)
    os.replace(tmp, dest)


def _download_curl(url: str, dest: str) -> None:
    tmp = dest + ".part"
    cmd = [
        "curl",
        "-fsSL",
        "--connect-timeout",
        "20",
        "--max-time",
        "120",
        "-A",
        USER_AGENT,
        "-o",
        tmp,
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"curl_failed:{result.returncode}:{result.stderr[-200:]}")
    os.replace(tmp, dest)


def _download(url: str, dest: str) -> str:
    """Try urllib then curl. Returns method used."""
    errors: List[str] = []
    try:
        _download_urllib(url, dest)
        return "urllib"
    except Exception as exc:
        errors.append(f"urllib:{exc}")
        _ulog(f"urllib download failed: {exc}")
    try:
        _download_curl(url, dest)
        return "curl"
    except Exception as exc:
        errors.append(f"curl:{exc}")
        _ulog(f"curl download failed: {exc}")
    raise RuntimeError("download_failed:" + " | ".join(errors))


def _validate_zip(path: str) -> Optional[str]:
    """Return the root folder name inside the zip, or None if invalid."""
    try:
        with zipfile.ZipFile(path, "r") as zf:
            names = zf.namelist()
            if not names:
                return None
            roots = {name.split("/", 1)[0] for name in names if name and not name.startswith("__")}
            roots = {r for r in roots if r and not r.endswith(".json")}
            plugin_json = [n for n in names if n.endswith("plugin.json") and n.count("/") <= 1]
            main_py = [n for n in names if n.endswith("main.py") and n.count("/") <= 1]
            index_js = [n for n in names if n.endswith("dist/index.js") or n == "dist/index.js"]
            if not plugin_json or not main_py or not index_js:
                return None
            if len(roots) == 1:
                return next(iter(roots))
            return ""
    except Exception as exc:
        _ulog(f"Invalid update zip: {exc}")
        return None


def _safe_extract(zf: zipfile.ZipFile, dest_dir: str) -> None:
    dest_dir = os.path.realpath(dest_dir)
    for member in zf.infolist():
        target = os.path.realpath(os.path.join(dest_dir, member.filename))
        if not target.startswith(dest_dir + os.sep) and target != dest_dir:
            raise RuntimeError(f"Zip slip blocked: {member.filename}")
    zf.extractall(dest_dir)


def _install_from_zip(zip_path: str) -> None:
    root = _validate_zip(zip_path)
    if root is None:
        raise RuntimeError("Update zip is missing required plugin files")

    plugin_dir = os.path.realpath(decky.DECKY_PLUGIN_DIR)
    with tempfile.TemporaryDirectory(prefix="rf-update-") as tmp:
        with zipfile.ZipFile(zip_path, "r") as zf:
            _safe_extract(zf, tmp)
        source = os.path.join(tmp, root) if root else tmp
        if not os.path.isdir(source):
            raise RuntimeError("Update zip root folder missing")

        for dirpath, _dirnames, filenames in os.walk(source):
            rel = os.path.relpath(dirpath, source)
            target_dir = plugin_dir if rel == "." else os.path.join(plugin_dir, rel)
            os.makedirs(target_dir, exist_ok=True)
            for name in filenames:
                # Source maps are optional and large; skip if copy fails.
                src_file = os.path.join(dirpath, name)
                dst_file = os.path.join(target_dir, name)
                try:
                    shutil.copy2(src_file, dst_file)
                except Exception as exc:
                    if name.endswith(".map"):
                        _ulog(f"skip map {name}: {exc}")
                        continue
                    raise


def _coerce_url(download_url: Any, args: tuple, kwargs: dict) -> str:
    candidates: List[Any] = [download_url, kwargs.get("download_url"), kwargs.get("url")]
    if args:
        candidates.extend(args)
    for cand in candidates:
        if isinstance(cand, str) and cand.strip():
            return cand.strip()
        if isinstance(cand, dict):
            nested = cand.get("downloadUrl") or cand.get("download_url") or cand.get("url")
            if isinstance(nested, str) and nested.strip():
                return nested.strip()
    return ""


class Plugin:
    async def get_settings(self) -> Dict[str, Any]:
        return _read()

    async def save_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        saved = _write(settings)
        decky.logger.info("Settings saved")
        return saved

    async def get_plugin_version(self) -> str:
        return _read_installed_version()

    async def check_for_update(self) -> Dict[str, Any]:
        current = _read_installed_version()
        empty = {
            "hasUpdate": False,
            "currentVersion": current,
            "latestVersion": None,
            "downloadUrl": None,
            "assetApiUrl": None,
            "htmlUrl": None,
            "error": None,
        }
        try:
            release = _http_json(GITHUB_API_LATEST)
            if not release:
                empty["error"] = "empty_response"
                return empty
            tag = str(release.get("tag_name") or "").lstrip("vV")
            if not tag:
                empty["error"] = "no_tag"
                return empty
            download, asset_id = _pick_zip_asset(release)
            html_url = release.get("html_url")
            asset_api = (
                f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/assets/{asset_id}"
                if asset_id
                else None
            )
            return {
                "hasUpdate": _is_newer(tag, current),
                "currentVersion": current,
                "latestVersion": tag,
                "downloadUrl": download,
                "assetApiUrl": asset_api,
                "htmlUrl": html_url if isinstance(html_url, str) else None,
                "error": None if download else "no_zip_asset",
            }
        except urllib.error.HTTPError as exc:
            decky.logger.error(f"Update check HTTP error: {exc}")
            empty["error"] = f"http_{exc.code}"
            return empty
        except Exception as exc:
            decky.logger.error(f"Update check failed: {exc}")
            empty["error"] = str(exc)
            return empty

    async def install_update(self, download_url: Any = "", *args: Any, **kwargs: Any) -> Dict[str, Any]:
        try:
            if os.path.exists(UPDATE_LOG):
                os.remove(UPDATE_LOG)
        except Exception:
            pass

        url = _coerce_url(download_url, args, kwargs)
        asset_api = ""
        if isinstance(download_url, dict):
            asset_api = str(download_url.get("assetApiUrl") or "")
        asset_api = str(kwargs.get("assetApiUrl") or asset_api or "").strip()

        _ulog(f"install_update start url={url!r} asset_api={asset_api!r} args={args!r}")
        _ulog(f"plugin_dir={decky.DECKY_PLUGIN_DIR} runtime={decky.DECKY_PLUGIN_RUNTIME_DIR}")

        if not url or not _is_allowed_download_url(url):
            _ulog("invalid_url")
            return {"ok": False, "error": "invalid_url", "stage": "validate_url"}

        runtime = decky.DECKY_PLUGIN_RUNTIME_DIR
        try:
            os.makedirs(runtime, exist_ok=True)
        except Exception as exc:
            return {"ok": False, "error": f"runtime_dir:{exc}", "stage": "runtime_dir"}

        zip_path = os.path.join(runtime, "update-download.zip")
        try:
            if os.path.exists(zip_path):
                os.remove(zip_path)

            urls_to_try = [url]
            if asset_api and asset_api not in urls_to_try and _is_allowed_download_url(asset_api):
                urls_to_try.append(asset_api)

            last_err = "download_failed"
            method = ""
            for candidate in urls_to_try:
                try:
                    _ulog(f"downloading {candidate}")
                    method = _download(candidate, zip_path)
                    last_err = ""
                    break
                except Exception as exc:
                    last_err = str(exc)
                    _ulog(f"download attempt failed: {exc}")

            if last_err or not os.path.exists(zip_path):
                return {"ok": False, "error": last_err or "download_failed", "stage": "download"}

            size = os.path.getsize(zip_path)
            digest = hashlib.sha256()
            with open(zip_path, "rb") as handle:
                for chunk in iter(lambda: handle.read(65536), b""):
                    digest.update(chunk)
            _ulog(f"downloaded method={method} size={size} sha256={digest.hexdigest()}")

            if size < 1000:
                return {"ok": False, "error": f"zip_too_small:{size}", "stage": "download"}

            root = _validate_zip(zip_path)
            if root is None:
                return {"ok": False, "error": "invalid_zip_contents", "stage": "validate_zip"}
            _ulog(f"zip root={root!r}")

            _install_from_zip(zip_path)
            new_ver = _read_installed_version()
            _ulog(f"installed ok version={new_ver}")
            return {"ok": True, "version": new_ver, "method": method}
        except Exception as exc:
            _ulog(f"install failed: {exc}")
            return {"ok": False, "error": str(exc), "stage": "install"}
        finally:
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
            except Exception:
                pass

    async def get_update_debug_log(self) -> str:
        try:
            with open(UPDATE_LOG, "r", encoding="utf-8") as handle:
                return handle.read()[-8000:]
        except FileNotFoundError:
            return ""
        except Exception as exc:
            return f"error:{exc}"

    async def _main(self):
        decky.logger.info("Recents Filter loaded")

    async def _unload(self):
        decky.logger.info("Recents Filter unloaded")

    async def _uninstall(self):
        decky.logger.info("Recents Filter uninstalled")
