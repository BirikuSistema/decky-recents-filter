export type PatchStatus =
  | "idle"
  | "ok"
  | "missing-recents"
  | "missing-holder"
  | "crashed"
  | "disabled";

export interface PatchDiagnostics {
  status: PatchStatus;
  error: string | null;
  lastNativeCount: number;
  lastVisibleCount: number;
  lastHiddenCount: number;
}

const listeners = new Set<() => void>();

let state: PatchDiagnostics = {
  status: "idle",
  error: null,
  lastNativeCount: 0,
  lastVisibleCount: 0,
  lastHiddenCount: 0,
};

export function getDiagnostics(): PatchDiagnostics {
  return state;
}

export function subscribeDiagnostics(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

export function setDiagnostics(patch: Partial<PatchDiagnostics>): void {
  state = { ...state, ...patch };
  notify();
}

export function resetDiagnostics(): void {
  state = {
    status: "idle",
    error: null,
    lastNativeCount: 0,
    lastVisibleCount: 0,
    lastHiddenCount: 0,
  };
  notify();
}
