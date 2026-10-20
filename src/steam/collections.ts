export interface SteamCollectionInfo {
  id: string;
  name: string;
  count: number;
}

/** Internal Steam / GamepadUI collections that must never appear as user toggles. */
const SYSTEM_COLLECTION_IDS = new Set([
  "local-install",
  "type-music",
  "uncategorized",
  "hidden",
  "recent",
  "recent-games",
  "local-played",
  "deck-games",
  "all-games",
  "type-games",
  "type-software",
  "type-tools",
  "type-videos",
  "type-demos",
  "shared-library",
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

function isSystemCollection(id: string): boolean {
  if (!id) return true;
  if (SYSTEM_COLLECTION_IDS.has(id)) return true;
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
      asCollectionList(s.userCollections).find((item) => asId(item?.id ?? item?.m_strId) === id) ||
      null
    );
  } catch {
    return null;
  }
}

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
      if (!id || seen.has(id) || isSystemCollection(id)) continue;
      seen.add(id);
      out.push({ id, name: asName(collection, id), count: appCount(collection) });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return out;
  } catch (err) {
    console.error("[RecentsFilter] failed to list collections", err);
    return [];
  }
}

export function collectionContainsApp(collectionId: string, appId: number): boolean {
  try {
    const collection = collectionFromStore(collectionId);
    if (!collection) return false;
    if (collection.apps && typeof collection.apps.has === "function" && collection.apps.has(appId)) {
      return true;
    }
    const all = collection.allApps;
    if (Array.isArray(all)) return all.some((item) => Number(item?.appid ?? item) === appId);
  } catch {
    return false;
  }
  return false;
}

export function appInHiddenCollections(appId: number, hiddenCollectionIds: string[]): boolean {
  if (!hiddenCollectionIds.length) return false;
  return hiddenCollectionIds.some((id) => collectionContainsApp(id, appId));
}
