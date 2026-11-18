import { getActiveSessionHolds } from "../recents/sessionTracker";
import { getSteamRecentAppIds, listRecentlyPlayedAppIds } from "../steam/appOverview";
import { preferArtworkShortcut } from "../steam/srmDedup";
import { appInHiddenCollections } from "../steam/collections";
import type { RecentsFilterSettings, SessionHold } from "../settings/schema";

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

  return { show: true };
}

export function shouldShowApp(
  appId: number,
  settings: RecentsFilterSettings,
): boolean {
  return decideAppVisibility(appId, settings).show;
}

function shouldKeepPair(
  rawId: number,
  id: number,
  settings: RecentsFilterSettings,
): boolean {
  if (rawId === id) return decideAppVisibility(id, settings).show;
  const rawDec = decideAppVisibility(rawId, settings);
  const idDec = decideAppVisibility(id, settings);
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

function mergeSessionHolds(
  settings: RecentsFilterSettings,
  extraHolds?: Record<string, SessionHold>,
): Record<string, SessionHold> {
  return {
    ...(settings.sessionHolds ?? {}),
    ...(extraHolds ?? {}),
  };
}

function isHoldActive(hold: SessionHold | undefined, thresholdMs: number): hold is SessionHold {
  return Boolean(hold && hold.durationMs < thresholdMs && hold.predecessors.length > 0);
}

/**
 * Prevent games whose last session was shorter than `minPlaytimeMinutes`
 * from jumping ahead of apps that previously preceded them.
 */
export function applySessionHolds(
  candidates: number[],
  settings: RecentsFilterSettings,
  extraHolds?: Record<string, SessionHold>,
): number[] {
  if (settings.minPlaytimeMinutes <= 0 || candidates.length <= 1) return candidates;

  const thresholdMs = settings.minPlaytimeMinutes * 60_000;
  const holds = mergeSessionHolds(settings, extraHolds);
  const working: number[] = [];
  const held: Array<{ id: number; hold: SessionHold }> = [];

  for (const id of candidates) {
    const hold = holds[String(id)];
    if (isHoldActive(hold, thresholdMs)) {
      held.push({ id, hold });
    } else {
      working.push(id);
    }
  }

  if (held.length === 0) return candidates;

  held.sort((a, b) => a.hold.predecessors.length - b.hold.predecessors.length);

  for (const { id, hold } of held) {
    const predSet = new Set(hold.predecessors);
    let lastPredIdx = -1;
    for (let i = 0; i < working.length; i++) {
      if (predSet.has(working[i])) lastPredIdx = i;
    }
    if (lastPredIdx === -1) {
      working.unshift(id);
    } else {
      working.splice(lastPredIdx + 1, 0, id);
    }
  }

  return working;
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
 * Build the Recents row: keep Steam order (with session holds), drop hidden apps,
 * backfill from extras until `target` (native Steam row length). Never uses maxVisible.
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
  const activeHolds = getActiveSessionHolds();
  let activeHoldCount = 0;
  if (settings.minPlaytimeMinutes > 0) {
    const thresholdMs = settings.minPlaytimeMinutes * 60_000;
    const allHolds = mergeSessionHolds(settings, activeHolds);
    for (const hold of Object.values(allHolds)) {
      if (isHoldActive(hold, thresholdMs)) activeHoldCount += 1;
    }
  }
  const collectLimit = goal + activeHoldCount;

  const visible: number[] = [];
  const seen = new Set<number>();
  const sourceSet = new Set(appIds);

  let sourceKept = 0;
  let sourceHidden = 0;
  let extrasOverlap = 0;
  let extrasNew = 0;
  let extrasKept = 0;
  let extrasHidden = 0;

  for (const rawId of appIds) {
    const id = preferArtworkShortcut(rawId);
    if (seen.has(id)) continue;
    if (!shouldKeepPair(rawId, id, settings)) {
      sourceHidden += 1;
      continue;
    }
    seen.add(id);
    sourceKept += 1;
    visible.push(id);
    if (visible.length >= collectLimit) break;
  }

  for (const rawId of extraIds) {
    if (visible.length >= collectLimit) break;
    const id = preferArtworkShortcut(rawId);
    if (sourceSet.has(rawId) || sourceSet.has(id)) {
      extrasOverlap += 1;
      continue;
    }
    extrasNew += 1;
    if (seen.has(id)) continue;
    if (!shouldKeepPair(rawId, id, settings)) {
      extrasHidden += 1;
      continue;
    }
    seen.add(id);
    extrasKept += 1;
    visible.push(id);
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

  return applySessionHolds(visible, settings, activeHolds).slice(0, goal);
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
