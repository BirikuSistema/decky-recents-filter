# Recents Filter

[![Latest release](https://img.shields.io/github/v/release/BirikuSistema/decky-recents-filter?label=release)](https://github.com/BirikuSistema/decky-recents-filter/releases/latest)
[![License](https://img.shields.io/github/license/BirikuSistema/decky-recents-filter)](LICENSE)

Plugin de [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) para Steam Deck / SteamOS.

Filtra qué aparece en la fila **Jugados recientemente** (Recently Played) de Game Mode: colecciones, categorías de biblioteca, tiempo mínimo, juegos ocultos a mano y duplicados fantasma de Steam ROM Manager.

Steam sigue registrando las sesiones con normalidad. El plugin solo decide qué carátulas se muestran en esa fila.

---

## Características

- **Activar / desactivar** el filtro sin desinstalar
- **Ocultar el título** «Jugados recientemente» (las carátulas se quedan en su sitio)
- **Categorías de biblioteca**: no instalados, bandas sonoras, vídeos, demos, sin categoría, ocultos en Steam
- **Colecciones propias** (incluidas carpetas de SRM / EmuDeck): actívalas o desactívalas una a una
- **Tiempo mínimo jugado** (0 / 1 / 3 / 5 / 10 / 20 / 30 min)
- **Ocultar juegos** desde el menú Start de cada título
- **Tamaño de fila nativo** de Steam: si ocultas juegos, rellena con otros recientes
- **Carátulas fantasma SRM**: si hay dos shortcuts del mismo juego, prefiere el que tiene arte custom
- **Actualizaciones OTA** desde GitHub Releases (botón en el panel del plugin)

## Instalación

1. Instala [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) si aún no lo tienes.
2. Descarga `decky-recents-filter.zip` de la [última release](https://github.com/BirikuSistema/decky-recents-filter/releases/latest).
3. En Game Mode: **Decky → Ajustes (engranaje) → Developer → Install Plugin from ZIP**.
4. Abre el menú Decky → **Recents Filter**.

Para actualizar: usa **Buscar actualizaciones** en el propio panel, o instala el ZIP nuevo de la misma forma.

## Uso rápido

1. Activa el filtro.
2. En **Colecciones y categorías**, desactiva lo que no quieras ver en recientes (p. ej. APPs, no instalados…).
3. Revisa **Juegos ocultos** (los que ocultaste con Start).
4. Ajusta el **tiempo mínimo** si quieres filtrar partidas muy cortas.
5. Pulsa **Refrescar fila** o vuelve a Home si la fila no se actualiza al momento.

> **Nota:** categorías grandes como «Sin categoría» pueden ocultar casi toda la fila. El plugin evita dejarla completamente vacía.

## Requisitos

- Steam Deck (o PC con GamepadUI / Game Mode)
- Decky Loader reciente
- Red para comprobar / instalar actualizaciones desde GitHub

## Desarrollo

```bash
pnpm install
pnpm test
pnpm run build
```

Empaquetado manual (mismo layout que las releases):

```bash
mkdir -p decky-recents-filter/dist
cp plugin.json package.json main.py README.md LICENSE decky-recents-filter/
cp dist/index.js decky-recents-filter/dist/
zip -r decky-recents-filter.zip decky-recents-filter
```

Las releases se publican automáticamente al crear un tag `v*` (workflow de GitHub Actions).

## Privacidad y seguridad

- No envía telemetría.
- Las actualizaciones OTA solo descargan el ZIP de **GitHub Releases** de este repositorio.
- Ajustes guardados en el directorio de settings de Decky.

## Licencia

[BSD-3-Clause](LICENSE) — basado en la plantilla de Steam Deck Homebrew.

## Enlaces

- [Releases](https://github.com/BirikuSistema/decky-recents-filter/releases)
- [Issues](https://github.com/BirikuSistema/decky-recents-filter/issues)
- [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)
