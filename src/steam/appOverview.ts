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
  rt_last_time_locally_played?: number;
  mru_index?: number;
  visible_in_game_list?: boolean;
  BIsShortcut?: () => boolean;
  BIsVisibleInMRUList?: () => boolean;
};

function store(): any {
  return (globalThis as any).appStore;
}

function collectionStore(): any {
  return (globalThis as any).collectionStore;
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

export function isShortcutType(overview: SteamOverview | null): boolean {
  if (!overview) return false;
  try {
    if (typeof overview.BIsShortcut === "function") return !!overview.BIsShortcut();
  } catch {
    /* fall through */
  }
  return overview.app_type === EAppType.Shortcut;
}

const RENDERABLE_APP_TYPES = new Set<number>([EAppType.Game, EAppType.Application, EAppType.Shortcut]);

function collectionOverviews(collection: any): any[] {
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

function isHiddenInSteam(overview: any, appId: number): boolean {
  try {
    if (overview?.visible_in_game_list === false) return true;
    const cs = collectionStore();
    if (typeof cs?.BIsHidden === "function" && cs.BIsHidden(appId)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Real play activity — mirrors what Steam uses for recentApps / localPlayed. */
function hasRealPlayActivity(overview: any): boolean {
  if (!overview) return false;
  try {
    if (overview.mru_index !== undefined && overview.mru_index !== null) return true;
  } catch {
    /* ignore */
  }
  if (Number(overview.rt_last_time_locally_played ?? 0) > 0) return true;
  if (Number(overview.minutes_playtime_forever ?? 0) > 0) return true;
  try {
    if (typeof overview.BIsVisibleInMRUList === "function" && overview.BIsVisibleInMRUList()) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Shortcuts without real play activity are often stale Steam ROM Manager /
 * EmuDeck entries that Steam itself never shows in Recents or the Games tab.
 */
function isEligibleLibraryApp(overview: any, appId: number): boolean {
  if (!overview) return false;
  if (!RENDERABLE_APP_TYPES.has(Number(overview.app_type))) return false;
  if (isHiddenInSteam(overview, appId)) return false;
  if (isShortcutType(overview) && !hasRealPlayActivity(overview)) return false;
  return true;
}

function recentActivityOverviews(): any[] {
  const cs = collectionStore();
  if (!cs) return [];
  const out: any[] = [];
  const seen = new Set<number>();

  const pushAll = (collection: any) => {
    for (const overview of collectionOverviews(collection)) {
      const id = Number(overview?.appid);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      if (!isEligibleLibraryApp(overview, id)) continue;
      seen.add(id);
      out.push(overview);
    }
  };

  try {
    pushAll(cs.recentAppsCollection);
  } catch {
    /* ignore */
  }
  try {
    pushAll(cs.localPlayedGamesCollection);
  } catch {
    /* ignore */
  }

  // Fallbacks by collection id used across Steam builds.
  try {
    pushAll(cs.GetCollection?.("recent"));
    pushAll(cs.GetCollection?.("local-played"));
  } catch {
    /* ignore */
  }

  return out;
}

/**
 * Apps the real library shows: games and software (no tools, music, videos),
 * excluding Steam-hidden entries and orphan shortcuts that were never played.
 */
function libraryOverviews(): Map<number, any> {
  const out = new Map<number, any>();
  const cs = collectionStore();
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
  sources.push(cs.allGamesCollection, cs.allAppsCollection);

  for (const source of sources) {
    for (const overview of collectionOverviews(source)) {
      const id = Number(overview?.appid);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!isEligibleLibraryApp(overview, id)) continue;
      out.set(id, overview);
    }
  }
  return out;
}

/** Drops ids that are not part of the visible library (stale shortcuts, runtimes, hidden apps). */
export function keepLibraryApps(appIds: number[]): number[] {
  const library = libraryOverviews();
  if (library.size === 0) {
    // Stores still loading — only drop obvious shortcut ghosts we can detect per-id.
    return appIds.filter((id) => {
      const ov = getOverview(id);
      if (!ov) return true;
      return isEligibleLibraryApp(ov, id);
    });
  }
  return appIds.filter((id) => library.has(id));
}

/**
 * Candidates used to backfill the Recents row after filtering.
 * Prefer Steam's real MRU collections so orphan shortcuts never appear.
 */
export function listRecentlyPlayedAppIds(limit = 80): number[] {
  const fromMru = recentActivityOverviews();
  if (fromMru.length > 0) {
    const scored = fromMru.map((overview) => {
      const id = Number(overview.appid);
      const time = Math.max(
        Number(overview.rt_last_time_locally_played ?? 0),
        Number(overview.rt_last_time_played ?? 0),
        overview.mru_index != null ? Number.MAX_SAFE_INTEGER - Number(overview.mru_index) : 0,
      );
      return { id, time };
    });
    scored.sort((a, b) => b.time - a.time);
    return scored.slice(0, limit).map((item) => item.id);
  }

  // Fallback while MRU collections are unavailable: library apps with real activity only.
  const scored: Array<{ id: number; time: number }> = [];
  for (const [id, overview] of libraryOverviews()) {
    if (!hasRealPlayActivity(overview)) continue;
    const time = Math.max(
      Number(overview.rt_last_time_locally_played ?? 0),
      Number(overview.rt_last_time_played ?? 0),
    );
    if (time > 0) scored.push({ id, time });
  }
  scored.sort((a, b) => b.time - a.time);
  return scored.slice(0, limit).map((item) => item.id);
}
