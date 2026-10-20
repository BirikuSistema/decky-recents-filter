/** Lightweight pub/sub so patched React components can re-render when settings change. */

const listeners = new Set<() => void>();
let generation = 0;

export function getRefreshGeneration(): number {
  return generation;
}

export function notifyRecentsRefresh(): void {
  generation += 1;
  for (const cb of listeners) {
    try {
      cb();
    } catch (err) {
      console.error("[RecentsFilter] refresh listener failed", err);
    }
  }
}

export function subscribeRecentsRefresh(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
