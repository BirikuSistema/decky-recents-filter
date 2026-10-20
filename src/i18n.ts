type Lang = "en" | "es";

const STRINGS = {
  en: {
    pluginName: "Recents Filter",
    enable: "Enable filter",
    enableDesc: "Filter the Recently Played row on the home screen",
    hideHeader: 'Hide "Recently Played" title',
    hideHeaderDesc: "Removes the label while keeping cover art in place",
    visibleGames: "Games in the row",
    showingOf: (shown: number, target: number) => `Showing ${shown} of ${target}`,
    rowSizeHint: (n: number) =>
      n > 0 ? `Keeps Steam’s row size (${n}) and backfills when you hide games` : "Keeps Steam’s native row size and backfills when you hide games",
    cannotHideAllTitle: "Can't hide everything",
    cannotHideAllBody:
      "That would leave the Recently Played row empty. Show at least one game, or turn filters off.",
    minPlaytime: "Minimum playtime",
    minPlaytimeOff: "No minimum",
    minPlaytimeValue: (min: number) => `Hide games under ${min} min`,
    filters: "Filters",
    collections: "Collections",
    collectionsNone: "No collections",
    collectionsAll: "All visible",
    collectionsSome: (shown: number, total: number) => `${shown} of ${total} visible`,
    collectionsHiddenCount: (n: number) => (n === 1 ? "1 hidden" : `${n} hidden`),
    collectionsTitle: "Collections in Recents",
    collectionsHint: "Turn a collection off to hide its games from Recently Played.",
    collectionsEmpty: "You have no collections. Create them in your Steam library.",
    collectionsShowAll: "Show all",
    gameCount: (n: number) => (n === 1 ? "1 game" : `${n} games`),
    hiddenByStart: "Hidden games",
    hiddenNone: "None",
    hiddenTitle: "Hidden games",
    hiddenHint: "Games you hid manually from the Start menu.",
    hiddenEmpty: "No games hidden from the Start menu.",
    hiddenManual: "Hidden with Start",
    summaryIdle: "No active filters",
    summaryActive: (collections: number, games: number) => {
      const parts: string[] = [];
      if (collections > 0) parts.push(collections === 1 ? "1 collection" : `${collections} collections`);
      if (games > 0) parts.push(games === 1 ? "1 hidden game" : `${games} hidden games`);
      return parts.join(" · ") || "No active filters";
    },
    edit: "Edit",
    view: "View",
    refresh: "Refresh row",
    reactivate: "Re-enable filter",
    crashed: "Filter paused after an error",
    menuHide: "Hide from Recently Played",
    menuShow: "Show in Recently Played",
    versionLabel: (v: string) => `Version ${v}`,
    checkUpdates: "Check for updates",
    checkingUpdates: "Checking…",
    noUpdates: "No updates available",
    upToDate: "You're up to date",
    updateAvailable: (v: string) => `Update available: v${v}`,
    updateNow: (v: string) => `Update to v${v}`,
    updateAvailableToast: (v: string) => `Version ${v} is available`,
    updateInstalling: (v: string) => `Installing v${v}…`,
    updateInstalled: (v: string) => `Updated to v${v}`,
    updateFailed: "Update failed. Try again later.",
    updateFailedDetail: (detail: string) => `Update failed: ${detail}`,
  },
  es: {
    pluginName: "Recents Filter",
    enable: "Activar filtro",
    enableDesc: "Filtra la fila de jugados recientemente en la pantalla de inicio",
    hideHeader: 'Ocultar título "Jugados recientemente"',
    hideHeaderDesc: "Elimina el texto manteniendo la posición de las portadas",
    visibleGames: "Juegos en la fila",
    showingOf: (shown: number, target: number) => `Mostrando ${shown} de ${target}`,
    rowSizeHint: (n: number) =>
      n > 0
        ? `Mantiene el tamaño nativo de Steam (${n}) y rellena al ocultar juegos`
        : "Mantiene el tamaño nativo de Steam y rellena al ocultar juegos",
    cannotHideAllTitle: "No se puede ocultar todo",
    cannotHideAllBody:
      "Eso dejaría vacía la fila de jugados recientemente. Deja al menos un juego visible o desactiva los filtros.",
    minPlaytime: "Tiempo mínimo jugado",
    minPlaytimeOff: "Sin mínimo",
    minPlaytimeValue: (min: number) => `Oculta juegos con menos de ${min} min`,
    filters: "Filtros",
    collections: "Colecciones",
    collectionsNone: "Sin colecciones",
    collectionsAll: "Todas visibles",
    collectionsSome: (shown: number, total: number) => `${shown} de ${total} visibles`,
    collectionsHiddenCount: (n: number) => (n === 1 ? "1 oculta" : `${n} ocultas`),
    collectionsTitle: "Colecciones en recientes",
    collectionsHint: "Desactiva una colección para ocultar sus juegos de recientes.",
    collectionsEmpty: "No tienes colecciones. Créalas en la biblioteca de Steam.",
    collectionsShowAll: "Mostrar todas",
    gameCount: (n: number) => (n === 1 ? "1 juego" : `${n} juegos`),
    hiddenByStart: "Juegos ocultos",
    hiddenNone: "Ninguno",
    hiddenTitle: "Juegos ocultos",
    hiddenHint: "Juegos que has ocultado manualmente desde el menú Start.",
    hiddenEmpty: "No hay juegos ocultos desde el menú Start.",
    hiddenManual: "Oculto con Start",
    summaryIdle: "Sin filtros activos",
    summaryActive: (collections: number, games: number) => {
      const parts: string[] = [];
      if (collections > 0) parts.push(collections === 1 ? "1 colección" : `${collections} colecciones`);
      if (games > 0) parts.push(games === 1 ? "1 juego oculto" : `${games} juegos ocultos`);
      return parts.join(" · ") || "Sin filtros activos";
    },
    edit: "Editar",
    view: "Ver",
    refresh: "Refrescar fila",
    reactivate: "Reactivar filtro",
    crashed: "Filtro en pausa tras un error",
    menuHide: "Ocultar de recientes",
    menuShow: "Mostrar en recientes",
    versionLabel: (v: string) => `Versión ${v}`,
    checkUpdates: "Buscar actualizaciones",
    checkingUpdates: "Buscando…",
    noUpdates: "No hay actualizaciones",
    upToDate: "Estás al día",
    updateAvailable: (v: string) => `Actualización disponible: v${v}`,
    updateNow: (v: string) => `Actualizar a v${v}`,
    updateAvailableToast: (v: string) => `La versión ${v} está disponible`,
    updateInstalling: (v: string) => `Instalando v${v}…`,
    updateInstalled: (v: string) => `Actualizado a v${v}`,
    updateFailed: "La actualización falló. Inténtalo más tarde.",
    updateFailedDetail: (detail: string) => `Falló la actualización: ${detail}`,
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
