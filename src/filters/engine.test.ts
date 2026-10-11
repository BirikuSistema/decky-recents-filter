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

  it("hides manual denylist ids", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hiddenAppIds: [2],
      keepRowIfEmpty: false,
    };
    assert.deepEqual(filterAppIds([1, 2, 3], settings), [1, 3]);
  });

  it("shown ids win over the denylist", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hiddenAppIds: [2],
      shownAppIds: [2],
    };
    assert.deepEqual(filterAppIds([1, 2, 3], settings), [1, 2, 3]);
  });

  it("keeps the native row when the filter would empty it", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hiddenAppIds: [1, 2],
      keepRowIfEmpty: true,
    };
    assert.deepEqual(filterAppIds([1, 2], settings), [1, 2]);
  });

  it("backfills extras to keep the requested visible count", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      hiddenAppIds: [2],
      maxVisible: 3,
      keepRowIfEmpty: false,
    };
    assert.deepEqual(filterAppIds([1, 2, 3], settings, [4, 5]), [1, 3, 4]);
  });
});

describe("sameIdList", () => {
  it("compares order-sensitive lists", () => {
    assert.equal(sameIdList([1, 2], [1, 2]), true);
    assert.equal(sameIdList([1, 2], [2, 1]), false);
  });
});
