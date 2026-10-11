import { getAppName } from "../steam/appOverview";
import { decideAppVisibility } from "../filters/engine";
import { getCurrentSettings } from "../settings/store";

export interface RecentsEntry {
  appId: number;
  name: string;
  hidden: boolean;
  reason?: string;
  pinned: boolean;
}

let lastNativeIds: number[] = [];

const listeners = new Set<() => void>();

export function setNativeRecents(ids: number[]): void {
  lastNativeIds = ids.slice();
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeSnapshot(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getRecentsSnapshot(): RecentsEntry[] {
  const settings = getCurrentSettings();
  return lastNativeIds.map((appId) => {
    const decision = decideAppVisibility(appId, settings);
    return {
      appId,
      name: getAppName(appId),
      hidden: !decision.show,
      reason: decision.reason,
      pinned: settings.shownAppIds.includes(appId),
    };
  });
}
