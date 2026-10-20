import hashlib
import json
import os
import re
import shutil
import ssl
import tempfile
import urllib.error
import urllib.request
import zipfile
from typing import Any, Dict, Optional

import decky

SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")
PACKAGE_JSON = os.path.join(decky.DECKY_PLUGIN_DIR, "package.json")
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


def _ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    for candidate in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ssl/cert.pem"):
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


def _pick_zip_asset(release: Dict[str, Any]) -> Optional[str]:
    assets = release.get("assets")
    if not isinstance(assets, list):
        return None
    preferred = None
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        name = str(asset.get("name") or "")
        url = str(asset.get("browser_download_url") or "")
        if not name.lower().endswith(".zip") or not url:
            continue
        lower = name.lower()
        if "recents" in lower or "decky-recents-filter" in lower:
            return url
        if preferred is None:
            preferred = url
    return preferred


def _download(url: str, dest: str) -> None:
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


def _validate_zip(path: str) -> Optional[str]:
    """Return the root folder name inside the zip, or None if invalid."""
    try:
        with zipfile.ZipFile(path, "r") as zf:
            names = zf.namelist()
            if not names:
                return None
            roots = {name.split("/", 1)[0] for name in names if name and not name.startswith("__")}
            roots = {r for r in roots if r and not r.endswith(".json")}
            # Accept either a single top-level folder or flat files at root.
            plugin_json = [n for n in names if n.endswith("plugin.json") and n.count("/") <= 1]
            main_py = [n for n in names if n.endswith("main.py") and n.count("/") <= 1]
            index_js = [n for n in names if n.endswith("dist/index.js") or n == "dist/index.js"]
            if not plugin_json or not main_py or not index_js:
                return None
            if len(roots) == 1:
                return next(iter(roots))
            return ""
    except Exception as exc:
        decky.logger.error(f"Invalid update zip: {exc}")
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

        # Copy over files; never touch the separate settings directory.
        for dirpath, _dirnames, filenames in os.walk(source):
            rel = os.path.relpath(dirpath, source)
            target_dir = plugin_dir if rel == "." else os.path.join(plugin_dir, rel)
            os.makedirs(target_dir, exist_ok=True)
            for name in filenames:
                src_file = os.path.join(dirpath, name)
                dst_file = os.path.join(target_dir, name)
                shutil.copy2(src_file, dst_file)


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
            download = _pick_zip_asset(release)
            html_url = release.get("html_url")
            return {
                "hasUpdate": _is_newer(tag, current),
                "currentVersion": current,
                "latestVersion": tag,
                "downloadUrl": download,
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

    async def install_update(self, download_url: str) -> Dict[str, Any]:
        url = str(download_url or "").strip()
        if not url or not _is_allowed_download_url(url):
            return {"ok": False, "error": "invalid_url"}
        if GITHUB_OWNER.lower() not in url.lower() and "githubusercontent.com" not in url.lower():
            # browser_download_url always points at githubusercontent after redirect;
            # still require github hosts via _is_allowed_download_url.
            pass

        runtime = decky.DECKY_PLUGIN_RUNTIME_DIR
        os.makedirs(runtime, exist_ok=True)
        zip_path = os.path.join(runtime, "update-download.zip")
        try:
            if os.path.exists(zip_path):
                os.remove(zip_path)
            decky.logger.info(f"Downloading update from {url}")
            _download(url, zip_path)
            digest = hashlib.sha256()
            with open(zip_path, "rb") as handle:
                for chunk in iter(lambda: handle.read(65536), b""):
                    digest.update(chunk)
            decky.logger.info(f"Update sha256={digest.hexdigest()}")
            _install_from_zip(zip_path)
            decky.logger.info("Update installed")
            return {"ok": True}
        except Exception as exc:
            decky.logger.error(f"Update install failed: {exc}")
            return {"ok": False, "error": str(exc)}
        finally:
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
            except Exception:
                pass

    async def _main(self):
        decky.logger.info("Recents Filter loaded")

    async def _unload(self):
        decky.logger.info("Recents Filter unloaded")

    async def _uninstall(self):
        decky.logger.info("Recents Filter uninstalled")
