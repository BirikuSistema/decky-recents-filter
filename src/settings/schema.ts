export const SETTINGS_VERSION = 3;

export const PLAYTIME_STEPS = [0, 1, 3, 5, 10, 20, 30] as const;
export const MIN_VISIBLE = 5;
export const MAX_VISIBLE = 20;
export const DEFAULT_VISIBLE = 12;

export interface RecentsFilterSettings {
  version: number;
  enabled: boolean;
  minPlaytimeMinutes: number;
  maxVisible: number;
  keepRowIfEmpty: boolean;
  hiddenAppIds: number[];
  shownAppIds: number[];
  hiddenCollectionIds: string[];
}

export const DEFAULT_SETTINGS: RecentsFilterSettings = {
  version: SETTINGS_VERSION,
  enabled: true,
  minPlaytimeMinutes: 0,
  maxVisible: DEFAULT_VISIBLE,
  keepRowIfEmpty: true,
  hiddenAppIds: [],
  shownAppIds: [],
  hiddenCollectionIds: [],
};

export function clampVisibleCount(value: number): number {
  const n = Math.round(Number(value) || DEFAULT_VISIBLE);
  return Math.min(MAX_VISIBLE, Math.max(MIN_VISIBLE, n));
}

export function snapPlaytimeMinutes(value: number): number {
  const minutes = Number.isFinite(value) ? value : 0;
  let best: number = PLAYTIME_STEPS[0];
  let dist = Infinity;
  for (const step of PLAYTIME_STEPS) {
    const d = Math.abs(step - minutes);
    if (d < dist) {
      dist = d;
      best = step;
    }
  }
  return best;
}

export function playtimeStepIndex(minutes: number): number {
  const snapped = snapPlaytimeMinutes(minutes);
  return Math.max(0, PLAYTIME_STEPS.indexOf(snapped as (typeof PLAYTIME_STEPS)[number]));
}

export function normalizeSettings(
  raw?: Partial<RecentsFilterSettings> | Record<string, unknown> | null,
): RecentsFilterSettings {
  const input = raw ?? {};
  const shownFromLegacy = Array.isArray((input as { pinnedAppIds?: number[] }).pinnedAppIds)
    ? (input as { pinnedAppIds: number[] }).pinnedAppIds
    : [];

  return {
    ...DEFAULT_SETTINGS,
    enabled: input.enabled !== false,
    keepRowIfEmpty: input.keepRowIfEmpty !== false,
    version: SETTINGS_VERSION,
    minPlaytimeMinutes: snapPlaytimeMinutes(Number(input.minPlaytimeMinutes) || 0),
    maxVisible: clampVisibleCount(Number((input as RecentsFilterSettings).maxVisible) || DEFAULT_VISIBLE),
    hiddenAppIds: uniquePositiveIds(input.hiddenAppIds),
    shownAppIds: uniquePositiveIds(
      Array.isArray(input.shownAppIds) ? input.shownAppIds : shownFromLegacy,
    ),
    hiddenCollectionIds: uniqueStrings(input.hiddenCollectionIds),
  };
}

function uniquePositiveIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}
