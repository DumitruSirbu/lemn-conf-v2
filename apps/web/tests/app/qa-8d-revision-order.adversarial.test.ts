// Which of two revisions is the greater, as the review's hydrator decides it, against the same question asked of
// `BigInt`: the two must agree for every pair of revisions a server can hold, and a value that is not a revision
// must never be called the greater.
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isGreaterRevision } from "@/store/revision-order";

const revision = fc.oneof(
  fc.bigInt({ min: 1n, max: 30n }),
  fc.bigInt({ min: 1n, max: 10n ** 6n }),
  fc.bigInt({ min: 2n ** 53n - 3n, max: 2n ** 53n + 3n }),
  fc.bigInt({ min: 2n ** 63n - 3n, max: 2n ** 63n - 1n }),
);

describe("the order of two revisions", () => {
  test.prop([revision, revision], { numRuns: 2000 })(
    "is the order of the whole numbers they spell",
    (candidate, held) => {
      expect(isGreaterRevision(String(candidate), String(held))).toBe(
        candidate > held,
      );
    },
  );

  it.each([
    ["10", "9", true],
    ["9", "10", false],
    ["100", "99", true],
    ["99", "100", false],
    ["9007199254740993", "9007199254740992", true],
    ["9007199254740992", "9007199254740993", false],
    ["7", "7", false],
  ])("calls %s greater than %s: %s", (candidate, held, expected) => {
    expect(isGreaterRevision(candidate, held)).toBe(expected);
  });

  it.each([
    "",
    "0",
    "010",
    "-1",
    "1.5",
    "1e3",
    " 10",
    "10 ",
    "١٠",
    "ten",
    "NaN",
    "Infinity",
    "0x10",
    "10n",
  ])("never calls %j the greater, nor anything greater than it", (strange) => {
    expect(isGreaterRevision(strange, "1")).toBe(false);
    expect(isGreaterRevision("999", strange)).toBe(false);
  });

  it("takes the page's copy when the store holds no revision at all", () => {
    expect(isGreaterRevision("1", null)).toBe(true);
  });
});
