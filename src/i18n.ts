type Lang = "en" | "es";

const STRINGS = {
  en: {
    enable: "Enable",
    enableDesc: "Filter the Recently Played row",
    visibleGames: "Visible games",
    showingOf: (shown: number, target: number) => `Showing ${shown} of ${target}`,
    minPlaytime: "Minimum playtime",
    minPlaytimeOff: "Off · every session counts",
    minPlaytimeValue: (min: number) => `Hide games played less than ${min} min`,
    filters: "Filters",
    collections: "Collections",
    collectionsNone: "No collections",
    collectionsAll: "All shown",
    collectionsSome: (shown: number, total: number) => `${shown} of ${total} shown`,
    collectionsTitle: "Collections in Recents",
    collectionsHint: "Turn a collection off to hide its games from Recently Played.",
    collectionsEmpty: "You have no collections. Create them in your Steam library.",
    gameCount: (n: number) => (n === 1 ? "1 game" : `${n} games`),
    hiddenByStart: "Hidden with Start",
    hiddenNone: "None",
    hiddenTitle: "Hidden with Start",
    hiddenHint: "Turn a game on to show it in Recently Played again.",
    hiddenEmpty: "No games hidden from the Start menu.",
    edit: "Edit",
    view: "View",
    refresh: "Refresh",
    reactivate: "Re-enable filter",
    crashed: "Filter paused after an error",
    menuHide: "Hide from Recently Played",
    menuShow: "Show in Recently Played",
  },
  es: {
    enable: "Activar",
    enableDesc: "Filtra la fila de jugados recientemente",
    visibleGames: "Juegos visibles",
    showingOf: (shown: number, target: number) => `Mostrando ${shown} de ${target}`,
    minPlaytime: "Tiempo mínimo de juego",
    minPlaytimeOff: "Desactivado · cuenta cualquier partida",
    minPlaytimeValue: (min: number) => `Oculta juegos con menos de ${min} min`,
    filters: "Filtros",
    collections: "Colecciones",
    collectionsNone: "Sin colecciones",
    collectionsAll: "Todas visibles",
    collectionsSome: (shown: number, total: number) => `${shown} de ${total} visibles`,
    collectionsTitle: "Colecciones en recientes",
    collectionsHint: "Desactiva una colección para ocultar sus juegos de recientes.",
    collectionsEmpty: "No tienes colecciones. Créalas en la biblioteca de Steam.",
    gameCount: (n: number) => (n === 1 ? "1 juego" : `${n} juegos`),
    hiddenByStart: "Ocultos con Start",
    hiddenNone: "Ninguno",
    hiddenTitle: "Ocultos con Start",
    hiddenHint: "Activa un juego para volver a mostrarlo en recientes.",
    hiddenEmpty: "No hay juegos ocultos desde el menú Start.",
    edit: "Editar",
    view: "Ver",
    refresh: "Refrescar",
    reactivate: "Reactivar filtro",
    crashed: "Filtro en pausa tras un error",
    menuHide: "Ocultar de recientes",
    menuShow: "Mostrar en recientes",
  },
} as const;

function normalize(locale: unknown): Lang | null {
  if (typeof locale !== "string" || !locale) return null;
  const value = locale.toLowerCase();
  if (value.startsWith("es") || value === "spanish" || value === "latam") return "es";
  return "en";
}

function detectLang(): Lang {
  try {
    const manager = (globalThis as any).LocalizationManager;
    const fromSteam = normalize(manager?.m_rgLocalesToUse?.[0]);
    if (fromSteam) return fromSteam;
  } catch {
    /* ignore */
  }
  return normalize(globalThis.navigator?.language) ?? "en";
}

export function t() {
  return STRINGS[detectLang()];
}
