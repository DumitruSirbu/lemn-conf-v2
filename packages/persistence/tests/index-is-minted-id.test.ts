import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isMintedId as isMintedIdOfShapes } from "../src/dashboard-store-shapes.js";
import { isMintedId } from "../src/index.js";

/**
 * The package exports the store's own `isMintedId`, not a copy, so a route checks exactly the shape the store will; the
 * table's check
 * (`^[A-Za-z0-9_-]{21}$`, `0012`, `0015`) is its whole meaning.
 */
const TABLE_CHECK = /^[A-Za-z0-9_-]{21}$/;
const NEAR_MISS_UNITS = ["a", "Z", "0", "9", "_", "-", "\n", ".", " ", "é"];

describe("the package's isMintedId", () => {
  it("is the very function the stores call", () => {
    expect(isMintedId).toBe(isMintedIdOfShapes);
  });

  it.each([
    ["21 alphanumerics", "A".repeat(21), true],
    ["the whole alphabet's edges", "aZ09_-aZ09_-aZ09_-aZ0", true],
    ["20 characters", "A".repeat(20), false],
    ["22 characters", "A".repeat(22), false],
    ["empty", "", false],
    ["a trailing line feed", `${"A".repeat(21)}\n`, false],
    ["a leading space", ` ${"A".repeat(20)}`, false],
    ["a 21-character id with a dot", `${"A".repeat(20)}.`, false],
    ["a full-width letter", `${"A".repeat(20)}Ａ`, false],
    ["a four-byte character counted once", `${"A".repeat(20)}🥬`, false],
    ["an embedded NUL", `${"A".repeat(20)}\0`, false],
  ])("%s", (_label, candidate, expected) => {
    expect(isMintedId(candidate)).toBe(expected);
  });

  it.each([null, undefined, 21, {}, [], ["A".repeat(21)], true, Symbol("id")])(
    "a value that is not text (%s) is not an id and does not throw",
    (candidate) => {
      expect(isMintedId(candidate)).toBe(false);
    },
  );

  propertyTest.prop([fc.string({ maxLength: 30 })])(
    "agrees with the table's check on any string",
    (candidate) => {
      expect(isMintedId(candidate)).toBe(TABLE_CHECK.test(candidate));
    },
  );

  propertyTest.prop([
    fc.string({
      unit: fc.constantFrom(...NEAR_MISS_UNITS),
      minLength: 19,
      maxLength: 23,
    }),
  ])(
    "agrees with the table's check on strings that nearly are one",
    (candidate) => {
      expect(isMintedId(candidate)).toBe(TABLE_CHECK.test(candidate));
    },
  );
});
