import { getOverview, getSteamRecentAppIds, listRecentlyPlayedAppIds } from "../steam/appOverview";
import { preferArtworkShortcut } from "../steam/srmDedup";
import { appInHiddenCollections } from "../steam/collections";
import type { RecentsFilterSettings } from "../settings/schema";

type OverviewCache = Map<number, ReturnType<typeof getOverview>>;

export type FilterDecision = {
  show: boolean;
  reason?: string;
};

function cachedOverview(appId: number, cache?: OverviewCache): ReturnType<typeof getOverview> {
  if (!cache) return getOverview(appId);
  if (cache.has(appId)) return cache.get(appId) ?? null;
  const overview = getOverview(appId);
  cache.set(appId, overview);
  return overview;
}

export function decideAppVisibility(
  appId: number,
  settings: RecentsFilterSettings,
  cache?: OverviewCache,
): FilterDecision {
  if (!settings.enabled) return { show: true, reason: "disabled" };
  if (settings.shownAppIds.includes(appId)) return { show: true, reason: "shown" };
  if (settings.hiddenAppIds.includes(appId)) return { show: false, reason: "manual" };
  if (appInHiddenCollections(appId, settings.hiddenCollectionIds)) {
    return { show: false, reason: "collection" };
  }

  const overview = cachedOverview(appId, cache);
  if (!overview) return { show: true, reason: "unknown" };

  const rawPlaytime = Number(overview.minutes_playtime_forever ?? 0);
  const playtime = Number.isFinite(rawPlaytime) && rawPlaytime > 0 ? rawPlaytime : 0;
  if (settings.minPlaytimeMinutes > 0 && playtime < settings.minPlaytimeMinutes) {
    return { show: false, reason: "playtime" };
  }

  return { show: true };
}

export function shouldShowApp(
  appId: number,
  settings: RecentsFilterSettings,
  cache?: OverviewCache,
): boolean {
  return decideAppVisibility(appId, settings, cache).show;
}

function shouldKeepPair(
  rawId: number,
  id: number,
  settings: RecentsFilterSettings,
  cache: OverviewCache,
): boolean {
  if (rawId === id) return decideAppVisibility(id, settings, cache).show;
  const rawDec = decideAppVisibility(rawId, settings, cache);
  const idDec = decideAppVisibility(id, settings, cache);
  if (rawDec.reason === "shown" || idDec.reason === "shown") return true;
  if (
    rawDec.reason === "manual" ||
    rawDec.reason === "collection" ||
    idDec.reason === "manual" ||
    idDec.reason === "collection"
  ) {
    return false;
  }
  return rawDec.show || idDec.show;
}

export type FilterStats = {
  sourceKept: number;
  sourceHidden: number;
  extrasTotal: number;
  extrasOverlap: number;
  extrasNew: number;
  extrasKept: number;
  extrasHidden: number;
};

/**
 * Build the Recents row: keep Steam order, drop hidden apps, backfill from extras
 * until `target` (native Steam row length). Never uses maxVisible.
 */
export function filterAppIds(
  appIds: number[],
  settings: RecentsFilterSettings,
  extraIds: number[] = [],
  target?: number,
  statsOut?: FilterStats,
): number[] {
  if (!settings.enabled) return appIds;

  const goal = Math.max(1, target ?? appIds.length);
  const visible: number[] = [];
  const seen = new Set<number>();
  const sourceSet = new Set(appIds);
  const cache: OverviewCache = new Map();

  let sourceKept = 0;
  let sourceHidden = 0;
  let extrasOverlap = 0;
  let extrasNew = 0;
  let extrasKept = 0;
  let extrasHidden = 0;

  const writeStats = () => {
    if (!statsOut) return;
    Object.assign(statsOut, {
      sourceKept,
      sourceHidden,
      extrasTotal: extraIds.length,
      extrasOverlap,
      extrasNew,
      extrasKept,
      extrasHidden,
    });
  };

  for (const rawId of appIds) {
    const id = preferArtworkShortcut(rawId);
    if (seen.has(id)) continue;
    if (!shouldKeepPair(rawId, id, settings, cache)) {
      sourceHidden += 1;
      continue;
    }
    seen.add(id);
    sourceKept += 1;
    visible.push(id);
    if (visible.length >= goal) {
      writeStats();
      return visible;
    }
  }

  for (const rawId of extraIds) {
    if (visible.length >= goal) break;
    const id = preferArtworkShortcut(rawId);
    if (sourceSet.has(rawId) || sourceSet.has(id)) {
      extrasOverlap += 1;
      continue;
    }
    extrasNew += 1;
    if (seen.has(id)) continue;
    if (!shouldKeepPair(rawId, id, settings, cache)) {
      extrasHidden += 1;
      continue;
    }
    seen.add(id);
    extrasKept += 1;
    visible.push(id);
  }

  writeStats();
  return visible;
}

/** How many apps would remain visible with these settings (Steam source + backfill). */
export function countVisibleRecents(
  settings: RecentsFilterSettings,
  target?: number,
): { count: number; sourceLen: number; extrasLen: number; target: number } {
  const source = getSteamRecentAppIds();
  const goal = Math.max(1, target ?? (source.length > 0 ? source.length : 1));
  const extras = listRecentlyPlayedAppIds(Math.max(120, goal * 6));
  const filtered = filterAppIds(source, settings, extras, goal);
  return {
    count: filtered.length,
    sourceLen: source.length,
    extrasLen: extras.length,
    target: goal,
  };
}

/** True when applying `settings` would leave the Recents row with zero games. */
export function wouldEmptyRecents(settings: RecentsFilterSettings, target?: number): boolean {
  if (!settings.enabled) return false;
  return countVisibleRecents(settings, target).count === 0;
}

export function sameIdList(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
