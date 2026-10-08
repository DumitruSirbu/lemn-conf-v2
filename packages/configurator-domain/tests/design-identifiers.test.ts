import { describe, expect, it } from "vitest";

import { isDesignId, isDesignRevisionShape } from "../src/repository.js";

describe("isDesignId", () => {
  it.each([
    "abcdefghijklmnopqrstu",
    "Az09_-Az09_-Az09_-Az0",
    "_".repeat(21),
    "-".repeat(21),
  ])("accepts %s", (id) => {
    expect(isDesignId(id)).toBe(true);
  });

  it.each([
    ["twenty characters", "a".repeat(20)],
    ["twenty-two characters", "a".repeat(22)],
    ["empty", ""],
    ["a trailing line feed", `${"a".repeat(21)}\n`],
    ["a space", `${"a".repeat(20)} `],
    ["a character outside the alphabet", `${"a".repeat(20)}.`],
    ["a non-ASCII letter", `${"a".repeat(20)}\u00e9`],
  ])("refuses %s", (_name, id) => {
    expect(isDesignId(id)).toBe(false);
  });
});

describe("isDesignRevisionShape", () => {
  it.each(["1", "9", "10", "9007199254740993", "9".repeat(19)])(
    "accepts %s",
    (revision) => {
      expect(isDesignRevisionShape(revision)).toBe(true);
    },
  );

  it.each([
    "",
    "0",
    "01",
    "1e3",
    " 1",
    "1 ",
    "1\n",
    "-1",
    "1.5",
    "9".repeat(20),
  ])("refuses %j", (revision) => {
    expect(isDesignRevisionShape(revision)).toBe(false);
  });
});
