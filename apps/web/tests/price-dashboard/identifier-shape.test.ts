import { describe, expect, it } from "vitest";

import { isVersionId } from "@/lib/server/price-dashboard/identifier-shape";

/** A path's version id is judged by the characters a store mints, before any store is asked. */

describe("isVersionId", () => {
  it("accepts an id as a store mints one: 21 characters of the nanoid alphabet", () => {
    expect(isVersionId("V1StGXR8_Z5jdHi6B-myT")).toBe(true);
  });

  it("accepts an id of the longest length the identifier bound allows, and refuses one character more", () => {
    expect(isVersionId("a".repeat(64))).toBe(true);
    expect(isVersionId("a".repeat(65))).toBe(false);
  });

  it("refuses an empty id and a value that is not text", () => {
    expect(isVersionId("")).toBe(false);
    expect(isVersionId(undefined)).toBe(false);
    expect(isVersionId(21)).toBe(false);
  });

  it.each([
    ["a NUL", "\u0000"],
    ["a line feed at the end", "abc\n"],
    ["a DEL", "\u007f"],
    ["a C1 control", "\u0085"],
    ["a path", "../etc/passwd"],
    ["a space", "a b"],
    ["a letter outside the alphabet", "café"],
  ])("refuses an id with %s", (_title, id) => {
    expect(isVersionId(id)).toBe(false);
  });
});
