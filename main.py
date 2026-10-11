import json
import os
from typing import Any, Dict

import decky

SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")

DEFAULTS: Dict[str, Any] = {
    "version": 3,
    "enabled": True,
    "minPlaytimeMinutes": 0,
    "maxVisible": 12,
    "keepRowIfEmpty": True,
    "hiddenAppIds": [],
    "shownAppIds": [],
    "hiddenCollectionIds": [],
}


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


class Plugin:
    async def get_settings(self) -> Dict[str, Any]:
        return _read()

    async def save_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        saved = _write(settings)
        decky.logger.info("Settings saved")
        return saved

    async def _main(self):
        decky.logger.info("Recents Filter loaded")

    async def _unload(self):
        decky.logger.info("Recents Filter unloaded")

    async def _uninstall(self):
        decky.logger.info("Recents Filter uninstalled")
