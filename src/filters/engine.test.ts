import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../settings/schema";
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
