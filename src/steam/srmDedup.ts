import { getOverview, isShortcutType } from "./appOverview";

function collectionStore(): any {
  return (globalThis as any).collectionStore;
}

function collectionOverviews(collection: any): any[] {
  const list = collection?.visibleApps ?? collection?.allApps;
  if (Array.isArray(list)) return list;
  const apps = collection?.apps;
  if (apps && typeof apps.values === "function") {
    try {
      return [...apps.values()];
    } catch {
      return [];
    }
  }
  return [];
}

export function hasCustomImages(overview: any): boolean {
  if (!overview) return false;
  try {
    if (typeof overview.BHasCustomImages === "function") return !!overview.BHasCustomImages();
  } catch {
    /* ignore */
  }
  return Number(overview?.rt_custom_image_mtime ?? 0) > 0;
}

/** Stable key for SRM duplicate grouping (same title → same key). */
export function shortcutSortKey(overview: any): string {
  const sortAs = String(overview?.sort_as ?? "")
    .trim()
    .toLowerCase();
  if (sortAs) return sortAs;
  return String(overview?.display_name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type ArtIndex = {
  /** sortKey → preferred appid with custom artwork (if any) */
  preferred: Map<string, number>;
  /** appids that lack artwork while a same-key sibling has it */
  ghosts: Set<number>;
};

let cached: { at: number; index: ArtIndex } | null = null;
const CACHE_MS = 4000;

/** Higher is better. Only call for shortcuts that already have custom art. */
export function artworkSiblingScore(overview: any): number {
  if (!overview) return 0;
  const played =
    Number(overview.minutes_playtime_forever ?? 0) > 0 ||
    Number(overview.rt_last_time_locally_played ?? 0) > 0 ||
    (overview.mru_index !== undefined && overview.mru_index !== null)
      ? 1_000_000_000_000
      : 0;
  const mtime = Number(overview.rt_custom_image_mtime ?? 0);
  // Prefer played+art, then newest grid art, then stable lower appid tie-break via caller.
  return played + (Number.isFinite(mtime) ? mtime : 0);
}

function buildArtIndex(): ArtIndex {
  const preferred = new Map<string, number>();
  const preferredScore = new Map<string, number>();
  const groups = new Map<string, number[]>();

  const consider = (overview: any) => {
    if (!isShortcutType(overview)) return;
    const id = Number(overview?.appid);
    if (!Number.isFinite(id) || id <= 0) return;
    const key = shortcutSortKey(overview);
    if (!key) return;
    const list = groups.get(key) ?? [];
    if (!list.includes(id)) list.push(id);
    groups.set(key, list);
    if (!hasCustomImages(overview)) return;
    const score = artworkSiblingScore(overview);
    const prev = preferredScore.get(key);
    // No substitute path: preferred is only set when at least one sibling has art.
    if (prev == null || score > prev || (score === prev && id < (preferred.get(key) ?? id))) {
      preferred.set(key, id);
      preferredScore.set(key, score);
    }
  };

  const cs = collectionStore();
  if (cs) {
    for (const col of [
      cs.allAppsCollection,
      cs.allGamesCollection,
      cs.appTypeCollectionMap?.get?.("type-games"),
      cs.appTypeCollectionMap?.get?.("type-software"),
    ]) {
      for (const ov of collectionOverviews(col)) consider(ov);
    }
  }

  const ghosts = new Set<number>();
  for (const [key, ids] of groups) {
    const pref = preferred.get(key);
    // No artwork sibling anywhere in the group → do nothing (keep originals).
    if (pref == null) continue;
    for (const id of ids) {
      if (id === pref) continue;
      const ov = getOverview(id);
      // Only the no-art duplicates are ghosts; other art copies are left alone
      // (dedupe in the Recents row happens via preferArtworkShortcut + seen set).
      if (!hasCustomImages(ov)) ghosts.add(id);
    }
  }

  return { preferred, ghosts };
}

function artIndex(): ArtIndex {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.index;
  const index = buildArtIndex();
  cached = { at: now, index };
  return index;
}

export function invalidateSrmDedupCache(): void {
  cached = null;
}

/**
 * SRM often leaves two shortcuts with the same title: one with SteamGridDB art
 * (never launched) and one without art that still carries playtime/MRU.
 * Prefer the artwork sibling so Recents shows a real cover and launches the
 * maintained shortcut.
 *
 * Fallbacks (safe no-ops):
 * - not a shortcut → unchanged
 * - already has custom art → unchanged
 * - no same-title sibling with art → unchanged (orphan "blank" tile stays)
 * - preferred id missing from index → unchanged (`?? appId`)
 */
export function preferArtworkShortcut(appId: number): number {
  const overview = getOverview(appId);
  if (!isShortcutType(overview)) return appId;
  if (hasCustomImages(overview)) return appId;
  const key = shortcutSortKey(overview);
  if (!key) return appId;
  const index = artIndex();
  if (!index.ghosts.has(appId)) return appId;
  return index.preferred.get(key) ?? appId;
}
