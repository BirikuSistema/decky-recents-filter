# Recents Filter

[![Latest release](https://img.shields.io/github/v/release/BirikuSistema/decky-recents-filter?label=release)](https://github.com/BirikuSistema/decky-recents-filter/releases/latest)
[![License](https://img.shields.io/github/license/BirikuSistema/decky-recents-filter)](LICENSE)

A [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin for Steam Deck / SteamOS.

Filters which titles appear in Game Mode’s **Recently Played** row: library categories, your collections, minimum playtime, manually hidden games, and Steam ROM Manager “ghost” duplicate covers.

Steam still records play sessions as usual. This plugin only controls which tiles are shown in that row.

---

## Features

- Enable or disable the filter without uninstalling
- Optionally hide the **Recently Played** header label (covers stay in place)
- Library categories: not installed, soundtracks, videos, demos, uncategorized, Steam-hidden
- Your collections (including SRM / EmuDeck folders), toggled one by one
- Minimum playtime (0 / 1 / 3 / 5 / 10 / 20 / 30 minutes)
- Hide or show a game from its Start menu
- Keeps Steam’s native row length and backfills when games are hidden
- SRM ghost covers: if two shortcuts share a title, prefer the one with custom artwork
- Optional updates from this repo’s GitHub Releases

## Install

1. Install [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) if needed.
2. Download `decky-recents-filter.zip` from the [latest release](https://github.com/BirikuSistema/decky-recents-filter/releases/latest).
3. In Game Mode: **Decky → Settings (gear) → Developer → Install Plugin from ZIP**.
4. Open the Decky menu → **Recents Filter**.

To update later: use **Check for updates** in the plugin panel, or install a newer ZIP the same way.

## Quick start

1. Turn the filter on.
2. Under **Collections & categories**, turn off anything you do not want in Recents (e.g. an Apps folder, not installed).
3. Review **Hidden games** (titles you hid from the Start menu).
4. Set a **minimum playtime** if you want to drop very short sessions.
5. Use **Refresh row** or return to Home if the row does not update immediately.

> **Note:** Broad categories such as **Uncategorized** can hide most of the row. The plugin refuses settings that would leave Recents completely empty.

## Requirements

- Steam Deck (or a PC running GamepadUI / Game Mode)
- A recent Decky Loader build
- Network access only if you use in-plugin updates from GitHub

## Development

```bash
pnpm install
pnpm test
pnpm run build
```

Manual package (same layout as releases):

```bash
mkdir -p decky-recents-filter/dist
cp plugin.json package.json main.py README.md LICENSE decky-recents-filter/
cp dist/index.js decky-recents-filter/dist/
zip -r decky-recents-filter.zip decky-recents-filter
```

Tagged releases (`v*`) are built and published by GitHub Actions.

## Privacy

- No telemetry.
- Optional updates download only the release ZIP from this GitHub repository.
- Settings are stored in Decky’s plugin settings directory.

## License

[MIT](LICENSE) for this plugin’s code. The original Steam Deck Homebrew template notice remains under BSD-3-Clause in the same file.

## Links

- [Releases](https://github.com/BirikuSistema/decky-recents-filter/releases)
- [Issues](https://github.com/BirikuSistema/decky-recents-filter/issues)
- [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)
