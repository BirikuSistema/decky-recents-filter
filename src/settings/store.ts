import { callable } from "@decky/api";
import { appInHiddenCollections } from "../steam/collections";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type RecentsFilterSettings,
} from "./schema";

const getSettingsBackend = callable<[], RecentsFilterSettings>("get_settings");
const saveSettingsBackend = callable<
  [settings: RecentsFilterSettings],
  RecentsFilterSettings
>("save_settings");

let current = { ...DEFAULT_SETTINGS };
const listeners = new Set<() => void>();

export function getCurrentSettings(): RecentsFilterSettings {
  return current;
}

export function subscribeSettings(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch (err) {
      console.error("[RecentsFilter] settings listener failed", err);
    }
  }
}

export async function loadSettings(): Promise<RecentsFilterSettings> {
  try {
    current = normalizeSettings(await getSettingsBackend());
  } catch (err) {
    console.error("[RecentsFilter] failed to load settings", err);
    current = { ...DEFAULT_SETTINGS };
  }
  notify();
  return current;
}

let saveSeq = 0;

export async function updateSettings(
  patch: Partial<RecentsFilterSettings>,
): Promise<RecentsFilterSettings> {
  const next = normalizeSettings({ ...current, ...patch });
  current = next;
  notify();
  const seq = ++saveSeq;
  try {
    const saved = normalizeSettings(await saveSettingsBackend(next));
    // Only the newest save may touch the in-memory state, and only if it differs.
    if (seq === saveSeq && JSON.stringify(saved) !== JSON.stringify(current)) {
      current = saved;
      notify();
    }
  } catch (err) {
    console.error("[RecentsFilter] failed to save settings", err);
  }
  return current;
}

export function toggleIdInList(
  list: number[],
  appId: number,
  enabled: boolean,
): number[] {
  const set = new Set(list);
  if (enabled) set.add(appId);
  else set.delete(appId);
  return [...set];
}

export function toggleStringInList(
  list: string[],
  value: string,
  enabled: boolean,
): string[] {
  const set = new Set(list);
  if (enabled) set.add(value);
  else set.delete(value);
  return [...set];
}

export async function setAppHiddenFromRecents(
  appId: number,
  hide: boolean,
): Promise<RecentsFilterSettings> {
  if (hide) {
    const hiddenByCollection = appInHiddenCollections(appId, current.hiddenCollectionIds);
    return updateSettings({
      shownAppIds: toggleIdInList(current.shownAppIds, appId, false),
      hiddenAppIds: toggleIdInList(current.hiddenAppIds, appId, !hiddenByCollection),
    });
  }
  return updateSettings({
    hiddenAppIds: toggleIdInList(current.hiddenAppIds, appId, false),
    shownAppIds: toggleIdInList(current.shownAppIds, appId, true),
  });
}
