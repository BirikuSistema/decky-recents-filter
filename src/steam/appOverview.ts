export const EAppType = {
  Game: 1,
  Application: 2,
  Tool: 4,
  Demo: 8,
  Video: 2048,
  Music: 8192,
  Shortcut: 1073741824,
} as const;

export type SteamOverview = {
  appid?: number;
  app_type?: number;
  display_name?: string;
  minutes_playtime_forever?: number;
  rt_last_time_played?: number;
  strShortcutExe?: string;
  strShortcutLaunchOptions?: string;
  strShortcutStartDir?: string;
  strFlatpakAppID?: string;
};

export type ShortcutBits = {
  exe: string;
  launch: string;
  startDir: string;
  flatpak: string;
  name: string;
};

function store(): any {
  return (globalThis as any).appStore;
}

function detailsStore(): any {
  return (globalThis as any).appDetailsStore;
}

export function getOverview(appId: number): SteamOverview | null {
  try {
    const ov = store()?.GetAppOverviewByAppID?.(appId);
    return ov ?? null;
  } catch {
    return null;
  }
}

export function getAppName(appId: number): string {
  return getOverview(appId)?.display_name?.trim() || `#${appId}`;
}

export function getShortcutBits(appId: number, overview?: SteamOverview | null): ShortcutBits {
  const ov = overview ?? getOverview(appId);
  let details: any = null;
  try {
    details = detailsStore()?.GetAppDetails?.(appId);
  } catch {
    details = null;
  }

  return {
    name: ov?.display_name ?? "",
    exe:
      details?.strShortcutExe ||
      ov?.strShortcutExe ||
      details?.strExe ||
      "",
    launch:
      details?.strShortcutLaunchOptions ||
      ov?.strShortcutLaunchOptions ||
      details?.strLaunchOptions ||
      "",
    startDir:
      details?.strShortcutStartDir ||
      ov?.strShortcutStartDir ||
      "",
    flatpak: details?.strFlatpakAppID || ov?.strFlatpakAppID || "",
  };
}

export function isShortcutType(overview: SteamOverview | null): boolean {
  if (!overview) return false;
  return overview.app_type === EAppType.Shortcut;
}

const RENDERABLE_APP_TYPES = new Set<number>([EAppType.Game, EAppType.Application, EAppType.Shortcut]);

function collectionOverviews(collection: any): any[] {
  // Same fields TabMaster relies on: `visibleApps` / `allApps` are arrays of overviews.
  const list = collection?.visibleApps ?? collection?.allApps;
  if (Array.isArray(list)) return list;
  const apps = collection?.apps;
  if (apps && typeof apps.values === "function") {
    try {
      return [...apps.values()];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Apps the real library shows: games and software (no tools, music, videos),
 * excluding anything hidden in Steam. Empty while the stores are still loading.
 */
function libraryOverviews(): Map<number, any> {
  const out = new Map<number, any>();
  const cs = (globalThis as any).collectionStore;
  if (!cs) return out;

  const sources: any[] = [];
  try {
    const byType = cs.appTypeCollectionMap;
    if (byType && typeof byType.get === "function") {
      sources.push(byType.get("type-games"), byType.get("type-software"));
    }
  } catch {
    /* ignore */
  }
  // Union of every visible-library list so a real game is never dropped by mistake;
  // entries Steam keeps in memory but no collection lists (stale shortcuts) are in none.
  sources.push(cs.allGamesCollection, cs.allAppsCollection);

  for (const source of sources) {
    for (const overview of collectionOverviews(source)) {
      const id = Number(overview?.appid);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!RENDERABLE_APP_TYPES.has(Number(overview.app_type))) continue;
      if (overview.visible_in_game_list === false) continue;
      out.set(id, overview);
    }
  }
  return out;
}

/** Drops ids that are not part of the visible library (stale shortcuts, runtimes, hidden apps). */
export function keepLibraryApps(appIds: number[]): number[] {
  const library = libraryOverviews();
  if (library.size === 0) return appIds;
  return appIds.filter((id) => library.has(id));
}

export function listRecentlyPlayedAppIds(limit = 80): number[] {
  const scored: Array<{ id: number; time: number }> = [];
  for (const [id, overview] of libraryOverviews()) {
    const time = Number(overview.rt_last_time_played ?? 0);
    if (time > 0) scored.push({ id, time });
  }
  scored.sort((a, b) => b.time - a.time);
  return scored.slice(0, limit).map((item) => item.id);
}
