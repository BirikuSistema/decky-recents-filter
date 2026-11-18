import { MAX_SESSION_HOLD_MS, type RecentsFilterSettings, type SessionHold } from "../settings/schema";
import { preferArtworkShortcut } from "../steam/srmDedup";

type ActiveSession = {
  rawAppId: number;
  canonicalId: number;
  startedAt: number;
  predecessors: number[];
};

export interface SessionTrackerDeps {
  getSettings: () => RecentsFilterSettings;
  saveHolds: (sessionHolds: Record<string, SessionHold>) => Promise<unknown> | void;
  requestRefresh: () => void;
}

let currentOrder: number[] = [];
let previousOrder: number[] = [];
const activeSessions = new Map<number, ActiveSession>();

export function recordRenderedOrder(ids: number[]): void {
  const next = ids.filter((id) => Number.isFinite(id) && id > 0);
  if (currentOrder.length > 0 && next.length > 0 && next[0] !== currentOrder[0]) {
    previousOrder = currentOrder;
  }
  currentOrder = next;
}

function getPreLaunchOrder(appId: number, canonicalId: number): number[] {
  if (
    currentOrder.length > 0 &&
    (currentOrder[0] === appId || currentOrder[0] === canonicalId) &&
    previousOrder.length > 0 &&
    previousOrder[0] !== appId &&
    previousOrder[0] !== canonicalId
  ) {
    return previousOrder;
  }
  return currentOrder;
}

export function getActiveSessionHolds(): Record<string, SessionHold> {
  if (activeSessions.size === 0) return {};
  const now = Date.now();
  const holds: Record<string, SessionHold> = {};
  for (const session of activeSessions.values()) {
    if (session.predecessors.length === 0) continue;
    const hold: SessionHold = {
      predecessors: session.predecessors,
      durationMs: Math.max(0, now - session.startedAt),
    };
    holds[String(session.canonicalId)] = hold;
    if (session.rawAppId !== session.canonicalId) {
      holds[String(session.rawAppId)] = hold;
    }
  }
  return holds;
}

function findActiveSession(rawAppId: number, canonicalId: number): ActiveSession | null {
  const direct = activeSessions.get(canonicalId);
  if (direct) return direct;
  for (const session of activeSessions.values()) {
    if (session.rawAppId === rawAppId || session.canonicalId === canonicalId) {
      return session;
    }
  }
  return null;
}

export function installSessionTracker(deps: SessionTrackerDeps): { uninstall: () => void } {
  const gameSessions = (globalThis as any)?.SteamClient?.GameSessions;
  if (typeof gameSessions?.RegisterForAppLifetimeNotifications !== "function") {
    console.log("[RecentsFilter] GameSessions notifications unavailable");
    return {
      uninstall() {
        activeSessions.clear();
        currentOrder = [];
        previousOrder = [];
      },
    };
  }

  let registration: { unregister?: () => void } | null = null;
  try {
    registration = gameSessions.RegisterForAppLifetimeNotifications((data: any) => {
      try {
        const rawAppId = Math.floor(Number(data?.unAppID ?? data?.nAppID ?? data?.appid ?? 0));
        if (!Number.isFinite(rawAppId) || rawAppId <= 0) return;

        const running = Boolean(data?.bRunning);
        const canonicalId = preferArtworkShortcut(rawAppId);

        if (running) {
          if (findActiveSession(rawAppId, canonicalId)) return;
          const order = getPreLaunchOrder(rawAppId, canonicalId);
          let idx = order.indexOf(canonicalId);
          if (idx === -1 && rawAppId !== canonicalId) idx = order.indexOf(rawAppId);
          const predecessors = idx === 0 ? [] : idx > 0 ? order.slice(0, idx) : order.slice();
          activeSessions.set(canonicalId, {
            rawAppId,
            canonicalId,
            startedAt: Date.now(),
            predecessors,
          });
          if (predecessors.length > 0 && deps.getSettings().minPlaytimeMinutes > 0) {
            deps.requestRefresh();
          }
          return;
        }

        const session = findActiveSession(rawAppId, canonicalId);
        if (!session) return;
        activeSessions.delete(session.canonicalId);

        const durationMs = Math.max(0, Date.now() - session.startedAt);
        const settings = deps.getSettings();
        const thresholdMs = settings.minPlaytimeMinutes * 60_000;
        const nextHolds: Record<string, SessionHold> = { ...(settings.sessionHolds ?? {}) };

        if (
          session.predecessors.length === 0 ||
          durationMs >= MAX_SESSION_HOLD_MS ||
          (settings.minPlaytimeMinutes > 0 && durationMs >= thresholdMs)
        ) {
          delete nextHolds[String(session.canonicalId)];
          delete nextHolds[String(session.rawAppId)];
        } else {
          const hold: SessionHold = {
            predecessors: session.predecessors,
            durationMs,
          };
          nextHolds[String(session.canonicalId)] = hold;
          if (session.rawAppId !== session.canonicalId) {
            nextHolds[String(session.rawAppId)] = hold;
          }
        }

        void deps.saveHolds(nextHolds);
        deps.requestRefresh();
      } catch (err) {
        console.error("[RecentsFilter] session lifetime handler failed", err);
      }
    });
  } catch (err) {
    console.error("[RecentsFilter] failed to register session tracker", err);
  }

  return {
    uninstall() {
      try {
        registration?.unregister?.();
      } catch {
        /* ignore */
      }
      activeSessions.clear();
      currentOrder = [];
      previousOrder = [];
    },
  };
}
