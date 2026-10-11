import { getOverview } from "../steam/appOverview";
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

export function filterAppIds(
  appIds: number[],
  settings: RecentsFilterSettings,
  extraIds: number[] = [],
): number[] {
  if (!settings.enabled) return appIds;

  const target = Math.max(1, settings.maxVisible || appIds.length);
  const visible: number[] = [];
  const seen = new Set<number>();

  for (const id of [...appIds, ...extraIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (!shouldShowApp(id, settings)) continue;
    visible.push(id);
    if (visible.length >= target) break;
  }

  if (visible.length === 0 && settings.keepRowIfEmpty) return appIds;
  return visible;
}

export function sameIdList(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
