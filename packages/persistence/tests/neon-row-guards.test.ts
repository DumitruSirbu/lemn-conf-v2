import { describe, expect, it } from "vitest";

import {
  isCount,
  isMissingGrantOrTable,
  isRecord,
  pagedRowsFrom,
} from "../src/neon-row-guards.js";

const PAGE_SIZE = 3;

describe("isRecord", () => {
  it.each([
    ["a plain object", {}, true],
    ["null", null, false],
    ["an array", [], false],
    ["text", "row", false],
  ])("answers for %s", (_label, value, expected) => {
    expect(isRecord(value)).toBe(expected);
  });
});

describe("isCount", () => {
  it.each([
    ["zero", 0, true],
    ["a whole number", 61, true],
    ["a negative number", -1, false],
    ["a fraction", 1.5, false],
    ["text", "61", false],
    ["not a number", Number.NaN, false],
  ])("answers for %s", (_label, value, expected) => {
    expect(isCount(value)).toBe(expected);
  });
});

describe("isMissingGrantOrTable", () => {
  it.each([
    ["42501", true],
    ["42P01", true],
    ["42P02", false],
    ["22012", false],
    [undefined, false],
  ])("answers for SQLSTATE %s", (sqlState, expected) => {
    expect(isMissingGrantOrTable(sqlState)).toBe(expected);
  });
});

describe("pagedRowsFrom", () => {
  const item = (id: string) => ({ total: 7, id });

  it("returns the total and the rows that name an item", () => {
    const rows = [item("a"), item("b")];

    expect(pagedRowsFrom(rows, PAGE_SIZE)).toEqual({ total: 7, found: rows });
  });

  it("reads one row with no id as an empty page that still reports the total", () => {
    expect(pagedRowsFrom([{ total: 7, id: null }], PAGE_SIZE)).toEqual({
      total: 7,
      found: [],
    });
  });

  it("accepts a page of exactly its size and refuses one more", () => {
    const full = [item("a"), item("b"), item("c")];

    expect(pagedRowsFrom(full, PAGE_SIZE)?.found).toHaveLength(PAGE_SIZE);
    expect(pagedRowsFrom([...full, item("d")], PAGE_SIZE)).toBeUndefined();
  });

  it.each([
    ["no rows", []],
    ["a total that is not a count", [{ total: "7", id: "a" }]],
    ["an empty-page row beside an item", [item("a"), { total: 7, id: null }]],
    [
      "two empty-page rows",
      [
        { total: 7, id: null },
        { total: 7, id: null },
      ],
    ],
  ])("refuses %s", (_label, rows) => {
    expect(pagedRowsFrom(rows, PAGE_SIZE)).toBeUndefined();
  });
});
