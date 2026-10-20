import { getOverview, getSteamRecentAppIds, listRecentlyPlayedAppIds } from "../steam/appOverview";
import { appInHiddenCollections } from "../steam/collections";
import type { RecentsFilterSettings } from "../settings/schema";

export type FilterDecision = {
  show: boolean;
  reason?: string;
};

export function decideAppVisibility(
  appId: number,
  settings: RecentsFilterSettings,
): FilterDecision {
  if (!settings.enabled) return { show: true, reason: "disabled" };
  if (settings.shownAppIds.includes(appId)) return { show: true, reason: "shown" };
  if (settings.hiddenAppIds.includes(appId)) return { show: false, reason: "manual" };
  if (appInHiddenCollections(appId, settings.hiddenCollectionIds)) {
    return { show: false, reason: "collection" };
  }

  const overview = getOverview(appId);
  if (!overview) return { show: true, reason: "unknown" };

  if (
    settings.minPlaytimeMinutes > 0 &&
    (overview.minutes_playtime_forever ?? 0) < settings.minPlaytimeMinutes
  ) {
    return { show: false, reason: "playtime" };
  }

  return { show: true };
}

export function shouldShowApp(appId: number, settings: RecentsFilterSettings): boolean {
  return decideAppVisibility(appId, settings).show;
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

  let sourceKept = 0;
  let sourceHidden = 0;
  let extrasOverlap = 0;
  let extrasNew = 0;
  let extrasKept = 0;
  let extrasHidden = 0;

  for (const id of appIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (!shouldShowApp(id, settings)) {
      sourceHidden += 1;
      continue;
    }
    sourceKept += 1;
    visible.push(id);
    if (visible.length >= goal) {
      if (statsOut) {
        Object.assign(statsOut, {
          sourceKept,
          sourceHidden,
          extrasTotal: extraIds.length,
          extrasOverlap,
          extrasNew,
          extrasKept,
          extrasHidden,
        });
      }
      return visible;
    }
  }

  for (const id of extraIds) {
    if (sourceSet.has(id)) {
      extrasOverlap += 1;
      continue;
    }
    extrasNew += 1;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!shouldShowApp(id, settings)) {
      extrasHidden += 1;
      continue;
    }
    extrasKept += 1;
    visible.push(id);
    if (visible.length >= goal) break;
  }

  if (statsOut) {
    Object.assign(statsOut, {
      sourceKept,
      sourceHidden,
      extrasTotal: extraIds.length,
      extrasOverlap,
      extrasNew,
      extrasKept,
      extrasHidden,
    });
  }

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
