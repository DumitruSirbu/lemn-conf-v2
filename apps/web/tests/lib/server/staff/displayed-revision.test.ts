import { describe, expect, it } from "vitest";

import { judgeDisplayedRevision } from "@/lib/server/staff/displayed-revision";

const WIDEST_REVISION = "9223372036854775807";

describe("a displayed revision that is a revision", () => {
  it.each([
    "1",
    "10",
    "123456789",
    "1000000000000000000",
    "9223372036854775806",
    WIDEST_REVISION,
  ])("accepts %s unchanged", (revision) => {
    expect(judgeDisplayedRevision(revision)).toEqual({ ok: true, revision });
  });
});

describe("a displayed revision that is not a revision", () => {
  it.each([
    ["zero", "0"],
    ["a leading zero", "01"],
    ["an empty string", ""],
    ["a leading space", " 1"],
    ["a trailing newline", "1\n"],
    ["an exponent", "1e3"],
    ["a sign", "-1"],
    ["a decimal point", "1.0"],
    ["an Arabic-Indic digit", "٣"],
    ["twenty digits", "10000000000000000000"],
    ["one above the widest bigint", "9223372036854775808"],
    ["nineteen nines", "9999999999999999999"],
  ])("refuses %s as NOT_A_REVISION", (_name, value) => {
    expect(judgeDisplayedRevision(value)).toEqual({
      ok: false,
      code: "NOT_A_REVISION",
    });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 5],
    ["a bigint", 5n],
    ["an object", {}],
    ["an array of text", ["5"]],
  ])("refuses %s as MISSING_VALUE, because it is not text", (_name, value) => {
    expect(judgeDisplayedRevision(value)).toEqual({
      ok: false,
      code: "MISSING_VALUE",
    });
  });
});
