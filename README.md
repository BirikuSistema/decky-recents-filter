# Recents Filter

Plugin de [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) para SteamOS. Filtra qué aplicaciones aparecen en la fila **Jugados recientemente** de Game Mode.

Steam sigue registrando las sesiones. El plugin solo oculta tiles en esa fila.

## Uso

1. Game Mode → menú Decky → **Recents Filter**.
2. Activa el filtro y, si quieres, oculta el título «Jugados recientemente».
3. Elige cuántos juegos mostrar y qué **colecciones** siguen visibles.
4. Ajusta el tiempo mínimo (Sin mínimo, 1, 3, 5, 10, 20 o 30 min).
5. En un juego, pulsa **Start** para ocultarlo o mostrarlo en recientes.
6. Si hay una versión nueva en GitHub, el plugin te avisa y puedes actualizar desde el panel.

## Instalación

1. Descarga el ZIP de la [última release](https://github.com/BirikuSistema/decky-recents-filter/releases/latest).
2. Decky → Ajustes → Developer → Install Plugin from ZIP.

## Desarrollo

```bash
pnpm i
pnpm test
pnpm run build
```

Al publicar un tag `vX.Y.Z`, GitHub Actions compila el plugin y crea la release con el ZIP listo para Decky.

## Licencia

BSD-3-Clause
