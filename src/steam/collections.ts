import { EAppType, getOverview } from "./appOverview";

export interface SteamCollectionInfo {
  id: string;
  name: string;
  count: number;
  /** Steam/system library buckets vs user-created collections. */
  kind: "system" | "user";
}

/** Virtual filter ids owned by this plugin (not real Steam collection ids). */
export const FILTER_NOT_INSTALLED = "rf-not-installed";
export const FILTER_DEMOS = "rf-demos";

/**
 * Curated Steam / virtual filters the user can hide from Recents.
 * Excludes traps like type-games (would wipe the whole row) and type-tools
 * (Steam's Tool bucket is mostly dedicated servers / SDKs — not Deck apps
 * like Dolphin; those live in user collections such as "APPs").
 */
const SYSTEM_FILTER_IDS: readonly string[] = [
  FILTER_NOT_INSTALLED,
  "type-music",
  "type-videos",
  FILTER_DEMOS,
  "uncategorized",
  "hidden",
];

/** Internal Steam collections that must never appear as user toggles. */
const BLOCKED_USER_COLLECTION_IDS = new Set([
  "local-install",
  "type-music",
  "type-videos",
  "type-tools",
  "type-software",
  "type-games",
  "type-demos",
  "uncategorized",
  "hidden",
  "favorite",
  "recent",
  "recent-games",
  "local-played",
  "deck-games",
  "all-games",
  "shared-library",
  FILTER_NOT_INSTALLED,
  FILTER_DEMOS,
]);

function appCount(collection: any): number {
  const list = collection?.visibleApps ?? collection?.allApps;
  const n = Number(Array.isArray(list) ? list.length : collection?.apps?.size ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function store(): any {
  return (globalThis as any).collectionStore;
}

function asId(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function asName(collection: any, id: string): string {
  return String(
    collection?.displayName ||
      collection?.name ||
      collection?.m_strName ||
      collection?.label ||
      id,
  );
}

function asCollectionList(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof (raw as any)[Symbol.iterator] === "function") {
    try {
      return [...(raw as Iterable<any>)];
    } catch {
      return [];
    }
  }
  if (typeof (raw as any).values === "function") {
    try {
      return [...(raw as any).values()];
    } catch {
      return [];
    }
  }
  return [];
}

function isBlockedUserCollection(id: string): boolean {
  if (!id) return true;
  if (BLOCKED_USER_COLLECTION_IDS.has(id)) return true;
  if (id.startsWith("type-")) return true;
  return false;
}

function collectionFromStore(id: string): any | null {
  const s = store();
  if (!s || !id) return null;
  try {
    return (
      s.GetCollection?.(id) ||
      s.GetCollectionByID?.(id) ||
      s.appTypeCollectionMap?.get?.(id) ||
      asCollectionList(s.userCollections).find((item) => asId(item?.id ?? item?.m_strId) === id) ||
      null
    );
  } catch {
    return null;
  }
}

function countDemos(): number {
  const sources = [
    collectionFromStore("type-games"),
    collectionFromStore("type-demos"),
    store()?.allAppsCollection,
  ];
  const seen = new Set<number>();
  let n = 0;
  for (const col of sources) {
    for (const ov of asCollectionList(col?.visibleApps ?? col?.allApps ?? col?.apps)) {
      const id = Number(ov?.appid ?? ov);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      if (Number(ov?.app_type ?? getOverview(id)?.app_type ?? 0) !== EAppType.Demo) continue;
      seen.add(id);
      n += 1;
    }
  }
  return n;
}

function countNotInstalled(): number {
  const installed = collectionFromStore("local-install");
  const installedSet = new Set<number>();
  try {
    if (installed?.apps && typeof installed.apps.keys === "function") {
      for (const id of installed.apps.keys()) {
        const n = Number(id);
        if (Number.isFinite(n) && n > 0) installedSet.add(n);
      }
    } else {
      for (const ov of asCollectionList(installed?.visibleApps ?? installed?.allApps)) {
        const id = Number(ov?.appid ?? ov);
        if (Number.isFinite(id) && id > 0) installedSet.add(id);
      }
    }
  } catch {
    /* ignore */
  }

  const games = collectionFromStore("type-games") || store()?.allGamesCollection;
  let n = 0;
  const seen = new Set<number>();
  for (const ov of asCollectionList(games?.visibleApps ?? games?.allApps ?? games?.apps)) {
    const id = Number(ov?.appid ?? ov);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    if (!installedSet.has(id)) n += 1;
  }
  return n;
}

function systemFilterFallbackName(id: string): string {
  switch (id) {
    case FILTER_NOT_INSTALLED:
      return "Not installed";
    case FILTER_DEMOS:
      return "Demos";
    case "type-music":
      return "Soundtracks";
    case "type-videos":
      return "Videos";
    case "uncategorized":
      return "Uncategorized";
    case "hidden":
      return "Hidden";
    default:
      return id;
  }
}

export function listSystemHideableFilters(): SteamCollectionInfo[] {
  const out: SteamCollectionInfo[] = [];
  for (const id of SYSTEM_FILTER_IDS) {
    if (id === FILTER_NOT_INSTALLED) {
      out.push({
        id,
        name: systemFilterFallbackName(id),
        count: countNotInstalled(),
        kind: "system",
      });
      continue;
    }
    if (id === FILTER_DEMOS) {
      out.push({
        id,
        name: systemFilterFallbackName(id),
        count: countDemos(),
        kind: "system",
      });
      continue;
    }
    const collection = collectionFromStore(id);
    out.push({
      id,
      name: collection ? asName(collection, id) : systemFilterFallbackName(id),
      count: collection ? appCount(collection) : 0,
      kind: "system",
    });
  }
  return out;
}

/** User-created collections only (SRM folders, custom groups, …). */
export function listHideableCollections(): SteamCollectionInfo[] {
  try {
    const s = store();
    if (!s) return [];
    const raw =
      s.userCollections ??
      s.GetUserCollections?.() ??
      s.deckUserCollections ??
      [];
    const seen = new Set<string>();
    const out: SteamCollectionInfo[] = [];
    for (const collection of asCollectionList(raw)) {
      const id = asId(collection?.id ?? collection?.m_strId ?? collection?.strId);
      if (!id || seen.has(id) || isBlockedUserCollection(id)) continue;
      seen.add(id);
      out.push({ id, name: asName(collection, id), count: appCount(collection), kind: "user" });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return out;
  } catch (err) {
    console.error("[RecentsFilter] failed to list collections", err);
    return [];
  }
}

/** System library filters + user collections (modal / QAM summary). */
export function listAllHideableFilters(): SteamCollectionInfo[] {
  return [...listSystemHideableFilters(), ...listHideableCollections()];
}

export function collectionContainsApp(collectionId: string, appId: number): boolean {
  try {
    const collection = collectionFromStore(collectionId);
    if (!collection) return false;
    if (collection.apps && typeof collection.apps.has === "function" && collection.apps.has(appId)) {
      return true;
    }
    const all = collection.allApps ?? collection.visibleApps;
    if (Array.isArray(all)) return all.some((item) => Number(item?.appid ?? item) === appId);
  } catch {
    return false;
  }
  return false;
}

export function appMatchesHiddenFilter(appId: number, filterId: string): boolean {
  if (!filterId) return false;
  if (filterId === FILTER_NOT_INSTALLED) {
    return !collectionContainsApp("local-install", appId);
  }
  if (filterId === FILTER_DEMOS) {
    return Number(getOverview(appId)?.app_type ?? 0) === EAppType.Demo;
  }
  return collectionContainsApp(filterId, appId);
}

export function appInHiddenCollections(appId: number, hiddenCollectionIds: string[]): boolean {
  if (!hiddenCollectionIds.length) return false;
  return hiddenCollectionIds.some((id) => appMatchesHiddenFilter(appId, id));
}
