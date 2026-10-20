import { filterAppIds, sameIdList } from "../filters/engine";
import { getCurrentSettings, subscribeSettings } from "../settings/store";
import {
  getNativeRowTarget,
  getSteamRecentAppIds,
  listRecentlyPlayedAppIds,
} from "../steam/appOverview";
import { resetDiagnostics, setDiagnostics } from "./diagnostics";
import { findInReactTree, patchElementType, releaseAllPatches } from "./reactTree";
import { notifyRecentsRefresh, subscribeRecentsRefresh } from "./refreshBus";

type PatchHandle = { uninstall: () => void };

const CRASH_WINDOW_MS = 10000;
const CRASH_THRESHOLD = 5;
const HEADER_STYLE_ID = "recents-filter-header-style";

/** Steam CSS module hashes for RecentGamesHeader / RecentGamesHeaderLabel (stable across recent builds). */
const HEADER_CLASS_FRAGMENTS = [
  "RecentGamesHeader",
  "_35iRep_MLGWeAmkLbeny7R",
  "_1KKWf5v5FhqL_NrtrGZPzG",
  "gamepadhomerecentgames_RecentGamesHeader",
];

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

function classNameOf(node: any): string {
  const raw = node?.props?.className ?? node?.props?.class;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string").join(" ");
  return "";
}

function isHeaderNode(node: any): boolean {
  const cls = classNameOf(node);
  if (!cls) return false;
  return HEADER_CLASS_FRAGMENTS.some((frag) => cls.includes(frag));
}

/** Hide the "Recently Played" label while keeping its layout height. */
function applyHeaderVisibility(tree: unknown): void {
  const settings = getCurrentSettings();
  const hide = settings.enabled && settings.hideRecentsHeader;
  try {
    const headers: any[] = [];
    const walk = (node: unknown, depth: number) => {
      if (!node || typeof node !== "object" || depth > 12) return;
      if (isHeaderNode(node)) headers.push(node);
      const rec = node as Record<string, unknown>;
      const children = (rec as any)?.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) walk(child, depth + 1);
      } else if (children) {
        walk(children, depth + 1);
      }
    };
    walk(tree, 0);
    for (const header of headers) {
      const prev = header.props.style && typeof header.props.style === "object" ? header.props.style : {};
      if (hide) {
        header.props.style = {
          ...prev,
          visibility: "hidden",
          pointerEvents: "none",
        };
      } else if (prev.visibility === "hidden") {
        const next = { ...prev };
        delete next.visibility;
        delete next.pointerEvents;
        header.props.style = next;
      }
    }
  } catch (err) {
    log("header visibility failed", err);
  }
}

function gamepadDocuments(): Document[] {
  const docs: Document[] = [];
  const seen = new Set<Document>();
  const push = (doc: Document | null | undefined) => {
    if (!doc || seen.has(doc)) return;
    seen.add(doc);
    docs.push(doc);
  };
  try {
    push(document);
  } catch {
    /* ignore */
  }
  try {
    const win =
      (globalThis as any)?.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow ??
      (globalThis as any)?.Router?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow ??
      null;
    push(win?.document);
  } catch {
    /* ignore */
  }
  return docs;
}

function syncHeaderCss(): void {
  const settings = getCurrentSettings();
  const hide = settings.enabled && settings.hideRecentsHeader;
  const css = hide
    ? `
      [class*="RecentGamesHeader"],
      [class*="_35iRep_MLGWeAmkLbeny7R"],
      [class*="gamepadhomerecentgames_RecentGamesHeader"] {
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `
    : "";

  for (const doc of gamepadDocuments()) {
    try {
      let el = doc.getElementById(HEADER_STYLE_ID) as HTMLStyleElement | null;
      if (!css) {
        el?.remove();
        continue;
      }
      if (!el) {
        el = doc.createElement("style");
        el.id = HEADER_STYLE_ID;
        doc.head?.appendChild(el);
      }
      if (el.textContent !== css) el.textContent = css;
    } catch (err) {
      log("header css failed", err);
    }
  }
}

function clearHeaderCss(): void {
  for (const doc of gamepadDocuments()) {
    try {
      doc.getElementById(HEADER_STYLE_ID)?.remove();
    } catch {
      /* ignore */
    }
  }
}

function applyFilterToHolder(holder: { node: any; key: "games" | "apps" }): boolean {
  const propsIds = asAppIds(holder.node.props[holder.key]);
  if (!propsIds) return false;

  const settings = getCurrentSettings();
  // Prefer Steam's collection (immutable) over mutated React props — fixes slider/native drift.
  const steamSource = getSteamRecentAppIds();
  const sourceIds = steamSource.length > 0 ? steamSource : propsIds;
  const target = getNativeRowTarget(sourceIds.length || propsIds.length || 12);

  if (!settings.enabled) {
    setDiagnostics({
      status: "disabled",
      lastNativeCount: sourceIds.length,
      lastVisibleCount: propsIds.length,
      lastHiddenCount: 0,
      lastTarget: target,
    });
    return true;
  }

  const extras = listRecentlyPlayedAppIds(Math.max(120, target * 6));
  const filtered = filterAppIds(sourceIds, settings, extras, target);

  const forceWrite = appliedRefreshGeneration !== refreshGeneration;
  const same = sameIdList(propsIds, filtered);
  const willWrite = forceWrite || !same;
  if (willWrite) {
    holder.node.props[holder.key] = filtered.slice();
    appliedRefreshGeneration = refreshGeneration;
  }

  setDiagnostics({
    status: "ok",
    error: null,
    lastNativeCount: sourceIds.length,
    lastVisibleCount: filtered.length,
    lastHiddenCount: Math.max(0, sourceIds.length - filtered.length),
    lastTarget: target,
  });
  return true;
}

function tryFilterTree(tree: unknown): boolean {
  applyHeaderVisibility(tree);
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
  notifyRecentsRefresh();
}

/** Kept for API compatibility — QAM/modals no longer need to gate remounts. */
export function holdRecentsRefresh(): () => void {
  return () => undefined;
}

export function requestRecentsRefresh(): void {
  refreshGeneration += 1;
  syncHeaderCss();
  notifyRecentsRefresh();
  // Soft fallback: ask Decky's router to re-render if nothing is subscribed yet.
  try {
    (globalThis as any).__ROUTER_HOOK_INSTANCE?.routerState?.notifyUpdate?.();
  } catch {
    /* ignore */
  }
}

export function installRecentsFilter(routerHook: any): PatchHandle | null {
  if (!routerHook?.addPatch) {
    log("routerHook.addPatch unavailable");
    return null;
  }

  const uninstallErrorTrap = installGlobalErrorTrap();
  syncHeaderCss();

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

  const unsubSettings = subscribeSettings(() => {
    refreshGeneration += 1;
    syncHeaderCss();
    notifyRecentsRefresh();
  });
  const unsubRefresh = subscribeRecentsRefresh(() => {
    /* generation already bumped by requestRecentsRefresh / settings */
  });

  return {
    uninstall() {
      try {
        routerHook.removePatch?.("/library/home", patch);
      } catch {
        /* ignore */
      }
      unsubSettings();
      unsubRefresh();
      releaseAllPatches();
      uninstallErrorTrap();
      clearHeaderCss();
      resetCrashState();
      log("uninstalled");
    },
  };
}
