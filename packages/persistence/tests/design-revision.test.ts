// The boundary of the one string the revision contract accepts.
//
// It exists because the anchoring is the sort of thing a reader "corrects" from memory: in Perl,
// PCRE, Python and Ruby, `$` matches before a final newline, so `isDesignRevision("1\n")` would be
// true there and the doc comment would be a lie. In JavaScript without the `m` flag it does not.
// That is a language guarantee rather than a lucky accident, and it is the sort of guarantee worth
// asserting rather than believing (review finding F5).
import { describe, expect, it } from "vitest";

import { isDesignRevision } from "../src/design-revision.js";

describe("isDesignRevision", () => {
  it.each(["1", "2", "10", "9007199254740993", "9".repeat(19)])(
    "accepts %s",
    (value) => {
      expect(isDesignRevision(value)).toBe(true);
    },
  );

  it.each([
    { name: "an empty string", value: "" },
    { name: "a leading zero", value: "01" },
    { name: "a bare zero", value: "0" },
    { name: "a negative number", value: "-1" },
    { name: "scientific notation", value: "1e3" },
    { name: "a decimal", value: "1.0" },
    { name: "a leading space", value: " 1" },
    { name: "a trailing space", value: "1 " },
    { name: "a SQL tautology", value: "' or '1'='1" },
    { name: "twenty digits, wider than bigint", value: "9".repeat(20) },
  ])("refuses $name", ({ value }) => {
    expect(isDesignRevision(value)).toBe(false);
  });

  // The anchoring cases, separated because they are the ones a dialect assumption gets wrong.
  it.each([
    { name: "a trailing newline", value: "1\n" },
    { name: "a trailing carriage return", value: "1\r" },
    { name: "a leading newline", value: "\n1" },
    { name: "a digit run on a second line", value: "9\n1" },
    { name: "a digit run on a first line", value: "1\n9" },
  ])("refuses a revision with $name", ({ value }) => {
    expect(isDesignRevision(value)).toBe(false);
  });
});
