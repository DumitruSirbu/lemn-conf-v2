import { STAFF_AUDIT_ACTIONS } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { STORED_ACTION_SHAPE } from "../src/staff-audit-store.js";

describe("the domain's audit actions against the table's action shape", () => {
  it.each(STAFF_AUDIT_ACTIONS)(
    "%s is a code the table accepts, so the live store can write it",
    (action) => {
      expect(STORED_ACTION_SHAPE.test(action)).toBe(true);
    },
  );

  it("is not vacuous: the shape refuses a code one character past its limit", () => {
    expect(STORED_ACTION_SHAPE.test("a".repeat(32))).toBe(true);
    expect(STORED_ACTION_SHAPE.test("a".repeat(33))).toBe(false);
  });
});
