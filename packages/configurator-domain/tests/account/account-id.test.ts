import { describe, expect, it } from "vitest";

import { isAccountId } from "../../src/index.js";

describe("isAccountId", () => {
  it.each([
    "A1b2C3d4E5f6G7h8I9j0_",
    "_____________________",
    "---------------------",
    "abcdefghijklmnopqrstu",
  ])("accepts %s", (text) => {
    expect(isAccountId(text)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["twenty characters", "A1b2C3d4E5f6G7h8I9j0"],
    ["twenty-two characters", "A1b2C3d4E5f6G7h8I9j0_x"],
    ["a full stop", "A1b2C3d4E5f6G7h8I9j0."],
    ["a space", "A1b2C3d4E5f6G7h8I9j0 "],
    ["a line break at the end", "A1b2C3d4E5f6G7h8I9j0_\n"],
    ["a non-ASCII letter", "A1b2C3d4E5f6G7h8I9j0é"],
    ["an e-mail address", "operator@example.test"],
  ])("refuses %s", (_title, text) => {
    expect(isAccountId(text)).toBe(false);
  });
});
