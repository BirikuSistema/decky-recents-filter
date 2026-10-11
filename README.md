# Recents Filter

Plugin de [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) para SteamOS. Filtra qué aplicaciones aparecen en la fila **Jugados recientemente** de Game Mode.

Steam sigue registrando las sesiones. El plugin solo oculta tiles en esa fila.

## Uso

1. Game Mode → menú Decky → **Recents Filter**.
2. Elige cuántos juegos mostrar y qué **colecciones** siguen visibles (● visible, ○ oculta).
3. Ajusta el tiempo mínimo (Off, 1, 3, 5, 10, 20 o 30 min).
4. Pulsa **REFRESH** si la home no se actualiza al momento.
5. En un juego, pulsa **Start** para ocultarlo o mostrarlo en recientes.

Si un update de Steam rompe el árbol React, el plugin se desactiva solo y deja Recents nativos.

## Instalación (desarrollo)

```bash
pnpm i
pnpm run build
```

Empaqueta el ZIP e instálalo desde Decky → Ajustes → Developer → Install Plugin from ZIP.

## Licencia

BSD-3-Clause
