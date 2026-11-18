export const SETTINGS_VERSION = 4;

export const PLAYTIME_STEPS = [0, 1, 3, 5, 10, 20, 30] as const;
export const MIN_VISIBLE = 5;
export const MAX_VISIBLE = 20;
export const DEFAULT_VISIBLE = 12;

export const MAX_SESSION_HOLD_MS = PLAYTIME_STEPS[PLAYTIME_STEPS.length - 1] * 60_000;
const MAX_SESSION_HOLDS = 40;

export interface SessionHold {
  predecessors: number[];
  durationMs: number;
}

export interface RecentsFilterSettings {
  version: number;
  enabled: boolean;
  hideRecentsHeader: boolean;
  minPlaytimeMinutes: number;
  maxVisible: number;
  keepRowIfEmpty: boolean;
  hiddenAppIds: number[];
  shownAppIds: number[];
  hiddenCollectionIds: string[];
  sessionHolds: Record<string, SessionHold>;
}

export const DEFAULT_SETTINGS: RecentsFilterSettings = {
  version: SETTINGS_VERSION,
  enabled: true,
  hideRecentsHeader: false,
  minPlaytimeMinutes: 0,
  maxVisible: DEFAULT_VISIBLE,
  keepRowIfEmpty: true,
  hiddenAppIds: [],
  shownAppIds: [],
  hiddenCollectionIds: [],
  sessionHolds: {},
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
    hideRecentsHeader: Boolean((input as RecentsFilterSettings).hideRecentsHeader),
    keepRowIfEmpty: input.keepRowIfEmpty !== false,
    version: SETTINGS_VERSION,
    minPlaytimeMinutes: snapPlaytimeMinutes(Number(input.minPlaytimeMinutes) || 0),
    maxVisible: clampVisibleCount(Number((input as RecentsFilterSettings).maxVisible) || DEFAULT_VISIBLE),
    hiddenAppIds: uniquePositiveIds(input.hiddenAppIds),
    shownAppIds: uniquePositiveIds(
      Array.isArray(input.shownAppIds) ? input.shownAppIds : shownFromLegacy,
    ),
    hiddenCollectionIds: uniqueStrings(input.hiddenCollectionIds),
    sessionHolds: normalizeSessionHolds((input as RecentsFilterSettings).sessionHolds),
  };
}

function normalizeSessionHolds(raw: unknown): Record<string, SessionHold> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries: Array<[string, SessionHold]> = [];
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const id = Math.floor(Number(key));
    if (!Number.isFinite(id) || id <= 0 || !val || typeof val !== "object") continue;
    const rec = val as Record<string, unknown>;
    const rawPredecessors = Array.isArray(rec.predecessors)
      ? rec.predecessors.map((n) => Math.floor(Number(n)))
      : [];
    const predecessors = uniquePositiveIds(rawPredecessors).filter((p) => p !== id);
    const durationMs = Number(rec.durationMs);
    if (predecessors.length === 0 || !Number.isFinite(durationMs) || durationMs < 0) continue;
    entries.push([String(id), { predecessors, durationMs }]);
  }
  const capped = entries.length > MAX_SESSION_HOLDS ? entries.slice(-MAX_SESSION_HOLDS) : entries;
  return Object.fromEntries(capped);
}

function uniquePositiveIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}
