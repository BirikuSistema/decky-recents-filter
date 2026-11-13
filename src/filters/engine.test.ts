import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../settings/schema";
import { EAppType, keepLibraryApps, listRecentlyPlayedAppIds } from "../steam/appOverview";
import { filterAppIds, sameIdList } from "./engine";

describe("filterAppIds", () => {
  it("keeps the original list when disabled", () => {
    const ids = [1, 2, 3];
    const result = filterAppIds(ids, { ...DEFAULT_SETTINGS, enabled: false });
    assert.deepEqual(result, ids);
  });

  it("hides manual denylist ids and backfills to native target", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hiddenAppIds: [2],
    };
    // Target stays at native size (3): drop 2, pull 4 from extras.
    assert.deepEqual(filterAppIds([1, 2, 3], settings, [4, 5], 3), [1, 3, 4]);
  });

  it("shown ids win over the denylist", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hiddenAppIds: [2],
      shownAppIds: [2],
    };
    assert.deepEqual(filterAppIds([1, 2, 3], settings, [], 3), [1, 2, 3]);
  });

  it("may shrink when there are not enough extras to backfill", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hiddenAppIds: [1, 2],
    };
    assert.deepEqual(filterAppIds([1, 2, 3], settings, [], 3), [3]);
  });

  it("backfills extras to keep the native visible count", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hiddenAppIds: [2],
    };
    assert.deepEqual(filterAppIds([1, 2, 3], settings, [4, 5], 3), [1, 3, 4]);
  });

  it("can return empty when everything is filtered and extras are also hidden", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hiddenAppIds: [1, 2, 3, 4],
    };
    assert.deepEqual(filterAppIds([1, 2, 3], settings, [4], 3), []);
  });

  it("ignores overlapping extras and uses new library ids to reach target", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hiddenAppIds: [2, 3],
    };
    const stats = {
      sourceKept: 0,
      sourceHidden: 0,
      extrasTotal: 0,
      extrasOverlap: 0,
      extrasNew: 0,
      extrasKept: 0,
      extrasHidden: 0,
    };
    // Source overlaps with extras; only 10..19 are new backfill candidates.
    const extras = [1, 2, 3, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const result = filterAppIds([1, 2, 3], settings, extras, 5, stats);
    assert.deepEqual(result, [1, 10, 11, 12, 13]);
    assert.equal(stats.sourceKept, 1);
    assert.equal(stats.extrasOverlap, 3);
    assert.equal(stats.extrasKept, 4);
  });
});

describe("sameIdList", () => {
  it("compares order-sensitive lists", () => {
    assert.equal(sameIdList([1, 2], [1, 2]), true);
    assert.equal(sameIdList([1, 2], [2, 1]), false);
  });
});

describe("minPlaytimeMinutes and SRM ghost filtering", () => {
  const prevAppStore = (globalThis as any).appStore;
  const prevCollectionStore = (globalThis as any).collectionStore;

  afterEach(() => {
    (globalThis as any).appStore = prevAppStore;
    (globalThis as any).collectionStore = prevCollectionStore;
  });

  it("filters games below minPlaytimeMinutes and respects updated playtime", () => {
    const overviews = new Map<number, any>([
      [101, { appid: 101, app_type: EAppType.Game, minutes_playtime_forever: 0 }],
      [102, { appid: 102, app_type: EAppType.Game, minutes_playtime_forever: 9 }],
      [103, { appid: 103, app_type: EAppType.Game, minutes_playtime_forever: 10 }],
      [104, { appid: 104, app_type: EAppType.Game }], // undefined playtime -> 0
    ]);
    (globalThis as any).appStore = {
      GetAppOverviewByAppID: (id: number) => overviews.get(id) ?? null,
    };

    const settings = { ...DEFAULT_SETTINGS, minPlaytimeMinutes: 10 };
    assert.deepEqual(filterAppIds([101, 102, 103, 104], settings, [], 4), [103]);

    // Playtime increases for 101 — must not be stuck on a stale cache.
    overviews.set(101, { appid: 101, app_type: EAppType.Game, minutes_playtime_forever: 15 });
    assert.deepEqual(filterAppIds([101, 102, 103, 104], settings, [], 4), [101, 103]);
  });

  it("drops SRM garbage shortcuts with mru_index=-1 or no art & no playtime", () => {
    const ghostNegMru = {
      appid: 201,
      app_type: EAppType.Shortcut,
      mru_index: -1,
      minutes_playtime_forever: 0,
      rt_last_time_locally_played: 0,
    };
    const ghostNoArtMru0 = {
      appid: 202,
      app_type: EAppType.Shortcut,
      mru_index: 0,
      minutes_playtime_forever: 0,
      rt_last_time_locally_played: 0,
    };
    const realPlayedShortcut = {
      appid: 203,
      app_type: EAppType.Shortcut,
      mru_index: 1,
      minutes_playtime_forever: 25,
      rt_last_time_locally_played: 1700000000,
    };
    const realSteamGame = {
      appid: 204,
      app_type: EAppType.Game,
      minutes_playtime_forever: 60,
      rt_last_time_locally_played: 1700000500,
    };

    const all = [ghostNegMru, ghostNoArtMru0, realPlayedShortcut, realSteamGame];
    const map = new Map(all.map((o) => [o.appid, o]));
    (globalThis as any).appStore = {
      GetAppOverviewByAppID: (id: number) => map.get(id) ?? null,
    };
    (globalThis as any).collectionStore = {
      allGamesCollection: { visibleApps: all },
      allAppsCollection: { visibleApps: all },
    };

    assert.deepEqual(keepLibraryApps([201, 202, 203, 204]), [203, 204]);
    assert.deepEqual(listRecentlyPlayedAppIds(10), [203, 204]);
  });
});
