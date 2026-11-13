import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { artworkSiblingScore, shortcutSortKey } from "./srmDedup";

describe("shortcutSortKey", () => {
  it("prefers sort_as when present", () => {
    assert.equal(
      shortcutSortKey({ sort_as: "Metal Slug Anthology", display_name: "Other" }),
      "metal slug anthology",
    );
  });

  it("falls back to normalized display_name", () => {
    assert.equal(
      shortcutSortKey({ display_name: "Prince of Persia: The Sands of Time" }),
      "prince of persia the sands of time",
    );
  });
});

describe("artworkSiblingScore", () => {
  it("ranks played artwork above never-played artwork", () => {
    const played = artworkSiblingScore({
      minutes_playtime_forever: 10,
      rt_custom_image_mtime: 100,
    });
    const fresh = artworkSiblingScore({
      minutes_playtime_forever: 0,
      rt_custom_image_mtime: 999999,
    });
    assert.ok(played > fresh);
  });

  it("does not treat sentinel mru_index (-1 or 0xFFFFFFFF) as played", () => {
    const sentinelNeg = artworkSiblingScore({
      mru_index: -1,
      minutes_playtime_forever: 0,
      rt_custom_image_mtime: 100,
    });
    const sentinelMax = artworkSiblingScore({
      mru_index: 4294967295,
      minutes_playtime_forever: 0,
      rt_custom_image_mtime: 100,
    });
    const validMru = artworkSiblingScore({
      mru_index: 0,
      minutes_playtime_forever: 0,
      rt_custom_image_mtime: 100,
    });
    assert.equal(sentinelNeg, 100);
    assert.equal(sentinelMax, 100);
    assert.ok(validMru > sentinelNeg);
  });
});
