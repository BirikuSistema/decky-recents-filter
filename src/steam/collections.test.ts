import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FILTER_DEMOS, FILTER_NOT_INSTALLED } from "./collections";

describe("system filter ids", () => {
  it("uses stable virtual ids for plugin-owned filters", () => {
    assert.equal(FILTER_NOT_INSTALLED, "rf-not-installed");
    assert.equal(FILTER_DEMOS, "rf-demos");
  });
});
