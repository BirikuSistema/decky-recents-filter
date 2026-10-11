import { filterAppIds, sameIdList } from "../filters/engine";
import { getCurrentSettings, subscribeSettings } from "../settings/store";
import { keepLibraryApps, listRecentlyPlayedAppIds } from "../steam/appOverview";
import { resetDiagnostics, setDiagnostics } from "./diagnostics";
import { findInReactTree, patchElementType, releaseAllPatches } from "./reactTree";
import { setNativeRecents } from "./snapshot";

type PatchHandle = { uninstall: () => void };

const CRASH_WINDOW_MS = 10000;
const CRASH_THRESHOLD = 5;

let silentPatchFailures = 0;
let crashed = false;
let crashCount = 0;
let crashWindowStart = 0;
let refreshGeneration = 0;
let appliedRefreshGeneration = -1;

function log(...args: unknown[]): void {
  console.log("[RecentsFilter]", ...args);
}

function asAppIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value
    .map((item) => {
      if (typeof item === "number") return item;
      if (item && typeof item === "object") {
        const rec = item as { appid?: number; nAppID?: number };
        return Number(rec.appid ?? rec.nAppID);
      }
      return Number(item);
    })
    .filter((id) => Number.isFinite(id) && id > 0);
  return ids;
}

function findRecentsNode(tree: unknown): any | null {
  try {
    return (
      findInReactTree(
        tree,
        (x: any) => x?.props && "autoFocus" in x.props && "showBackground" in x.props,
      ) ?? null
    );
  } catch {
    return null;
  }
}

function findGamesHolder(tree: unknown): { node: any; key: "games" | "apps" } | null {
  try {
    const gamesNode = findInReactTree(
      tree,
      (x: any) =>
        Array.isArray(x?.props?.games) && typeof x?.props?.onItemFocus === "function",
    );
    if (gamesNode) return { node: gamesNode, key: "games" };

    const appsNode = findInReactTree(
      tree,
      (x: any) =>
        Array.isArray(x?.props?.apps) && typeof x?.props?.onItemFocus === "function",
    );
    if (appsNode) return { node: appsNode, key: "apps" };

    const gamesOnly = findInReactTree(tree, (x: any) => Array.isArray(x?.props?.games));
    if (gamesOnly) return { node: gamesOnly, key: "games" };
  } catch {
    return null;
  }
  return null;
}

function applyFilterToHolder(holder: { node: any; key: "games" | "apps" }): boolean {
  const nativeIds = asAppIds(holder.node.props[holder.key]);
  if (!nativeIds) return false;

  setNativeRecents(nativeIds);
  const settings = getCurrentSettings();
  if (!settings.enabled) {
    setDiagnostics({
      status: "disabled",
      lastNativeCount: nativeIds.length,
      lastVisibleCount: nativeIds.length,
      lastHiddenCount: 0,
    });
    return true;
  }

  const extras = listRecentlyPlayedAppIds(Math.max(80, settings.maxVisible * 4));
  const libraryNative = keepLibraryApps(nativeIds);
  const filtered = filterAppIds(libraryNative, settings, extras);
  if (nativeIds.length !== libraryNative.length) {
    log("dropped non-library entries", nativeIds.filter((id) => !libraryNative.includes(id)));
  }
  if (filtered.length === 0) return true;
  setDiagnostics({
    status: "ok",
    error: null,
    lastNativeCount: nativeIds.length,
    lastVisibleCount: filtered.length,
    lastHiddenCount: Math.max(0, nativeIds.length - filtered.length),
  });

  const forceWrite = appliedRefreshGeneration !== refreshGeneration;
  if (forceWrite || !sameIdList(nativeIds, filtered)) {
    holder.node.props[holder.key] = filtered.slice();
    appliedRefreshGeneration = refreshGeneration;
  }
  return true;
}

function tryFilterTree(tree: unknown): boolean {
  const holder = findGamesHolder(tree);
  if (!holder) return false;
  return applyFilterToHolder(holder);
}

function markCrashed(reason: string): void {
  if (crashed) return;
  crashed = true;
  setDiagnostics({ status: "crashed", error: reason.slice(0, 200) });
  log("kill switch:", reason);
}

function isCrashFingerprint(msg: string): boolean {
  if (!msg) return false;
  if (msg.includes("Cannot read properties of undefined") && msg.includes("values")) return true;
  if (msg.includes("SystemCollectionIdToName") || msg.includes("recentAppsCollection")) return true;
  if (msg.includes("Minified React error #301")) return true;
  if (msg.includes("Maximum update depth")) return true;
  return false;
}

function extractErrorMessage(evt: any): string {
  const cands = [evt?.error?.message, evt?.message, evt?.reason?.message, evt?.reason];
  for (const cand of cands) {
    if (cand) return `${String(cand)}\n${String(evt?.error?.stack ?? evt?.reason?.stack ?? "")}`;
  }
  return "";
}

function installGlobalErrorTrap(): () => void {
  const handler = (evt: any) => {
    if (crashed || !getCurrentSettings().enabled) return;
    const msg = extractErrorMessage(evt);
    if (!isCrashFingerprint(msg)) return;
    const now = Date.now();
    if (now - crashWindowStart > CRASH_WINDOW_MS) {
      crashCount = 0;
      crashWindowStart = now;
    }
    crashCount += 1;
    if (crashCount >= CRASH_THRESHOLD) markCrashed(msg.slice(0, 160));
  };
  globalThis.addEventListener?.("error", handler, true);
  globalThis.addEventListener?.("unhandledrejection", handler, true);
  return () => {
    globalThis.removeEventListener?.("error", handler, true);
    globalThis.removeEventListener?.("unhandledrejection", handler, true);
  };
}

function firstChild(props: { children?: unknown }): any {
  const children = props?.children;
  if (Array.isArray(children)) return children[0];
  return children;
}

function patchLayer(node: any, onRender: (ret: any) => any): void {
  if (!node) return;
  patchElementType(node, (ret) => {
    if (!ret || crashed) return ret;
    try {
      return onRender(ret) ?? ret;
    } catch (err) {
      log("layer failed", err);
      markCrashed(`layer: ${String(err)}`);
      return ret;
    }
  });
}

export function resetCrashState(): void {
  crashed = false;
  crashCount = 0;
  crashWindowStart = 0;
  silentPatchFailures = 0;
  resetDiagnostics();
}

function remountHome(): void {
  try {
    const win: any = globalThis;
    if (win?.history?.state !== undefined) {
      win.history.replaceState(win.history.state, "", win.location.href);
      win.dispatchEvent(new Event("popstate"));
    }
  } catch (err) {
    log("remount failed", err);
  }
}

let uiHolds = 0;
let pendingRemount = false;
let remountTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRemount(delayMs: number): void {
  if (remountTimer) clearTimeout(remountTimer);
  remountTimer = setTimeout(() => {
    remountTimer = null;
    // Remount right away; if our panel/modal is covering the home, repeat once
    // when it closes (see holdRecentsRefresh) in case Steam skipped the render.
    pendingRemount = uiHolds > 0;
    refreshGeneration += 1;
    remountHome();
  }, delayMs);
}

/** While the QAM panel or one of our modals is open, remember to remount again on close. */
export function holdRecentsRefresh(): () => void {
  uiHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    uiHolds = Math.max(0, uiHolds - 1);
    if (uiHolds === 0 && pendingRemount) scheduleRemount(250);
  };
}

export function requestRecentsRefresh(): void {
  if (remountTimer) clearTimeout(remountTimer);
  remountTimer = null;
  pendingRemount = uiHolds > 0;
  refreshGeneration += 1;
  remountHome();
}

export function installRecentsFilter(routerHook: any): PatchHandle | null {
  if (!routerHook?.addPatch) {
    log("routerHook.addPatch unavailable");
    return null;
  }

  const uninstallErrorTrap = installGlobalErrorTrap();

  const patchFn = (props: { children?: unknown }) => {
    try {
      if (crashed) return props;
      const child = firstChild(props);
      if (!child?.type) return props;

      patchLayer(child, (ret) => {
        if (tryFilterTree(ret)) {
          silentPatchFailures = 0;
          return ret;
        }

        patchLayer(ret, (ret2) => {
          if (tryFilterTree(ret2)) {
            silentPatchFailures = 0;
            return ret2;
          }

          const recents = findRecentsNode(ret2);
          if (!recents) {
            silentPatchFailures += 1;
            if (silentPatchFailures >= 20) {
              setDiagnostics({ status: "missing-recents" });
            }
            return ret2;
          }

          patchLayer(recents, (ret3) => {
            if (tryFilterTree(ret3) || tryFilterTree(ret2)) {
              silentPatchFailures = 0;
              return ret3;
            }
            silentPatchFailures += 1;
            if (silentPatchFailures >= 20) {
              setDiagnostics({ status: "missing-holder" });
            }
            return ret3;
          });
          return ret2;
        });
        return ret;
      });
    } catch (err) {
      log("outer patch failed", err);
      markCrashed(`outer: ${String(err)}`);
    }
    return props;
  };

  let patch: unknown = null;
  try {
    patch = routerHook.addPatch("/library/home", patchFn);
  } catch (err) {
    log("addPatch failed", err);
    markCrashed(`addPatch: ${String(err)}`);
    return null;
  }

  log("installed");

  // Wait for the context menu / modal that triggered the change to finish closing.
  const unsubSettings = subscribeSettings(() => scheduleRemount(350));

  return {
    uninstall() {
      try {
        routerHook.removePatch?.("/library/home", patch);
      } catch {
        /* ignore */
      }
      if (remountTimer) clearTimeout(remountTimer);
      remountTimer = null;
      pendingRemount = false;
      unsubSettings();
      releaseAllPatches();
      uninstallErrorTrap();
      resetCrashState();
      log("uninstalled");
    },
  };
}
