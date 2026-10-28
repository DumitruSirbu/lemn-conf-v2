import { describe, expect, it } from "vitest";

import {
  VERSION_LABEL_MAX_LENGTH,
  VERSION_NOTE_MAX_LENGTH,
  judgeVersionLabel,
  judgeVersionNote,
} from "../../src/price-dashboard/index.js";

const ASTRAL_CHARACTER = "\u{1F373}";
const LONE_HIGH_SURROGATE = "\uD800";
const COMBINING_ACUTE = "́";
const PRECOMPOSED_E_ACUTE = "é";
const ZERO_WIDTH_SPACE = "​";
const RIGHT_TO_LEFT_OVERRIDE = "‮";
const LINE_SEPARATOR = " ";

function labelCode(raw: unknown): string | undefined {
  const judgement = judgeVersionLabel(raw);
  return judgement.ok ? undefined : judgement.code;
}

function noteCode(raw: unknown): string | undefined {
  const judgement = judgeVersionNote(raw);
  return judgement.ok ? undefined : judgement.code;
}

function labelOf(raw: unknown): string {
  const judgement = judgeVersionLabel(raw);
  if (!judgement.ok) throw new Error(`label refused as ${judgement.code}`);
  return judgement.text;
}

function noteOf(raw: unknown): string {
  const judgement = judgeVersionNote(raw);
  if (!judgement.ok) throw new Error(`note refused as ${judgement.code}`);
  return judgement.text;
}

describe("judgeVersionLabel: the name a published version carries", () => {
  it("is bounded at 80 code points and the note at 240", () => {
    expect(VERSION_LABEL_MAX_LENGTH).toBe(80);
    expect(VERSION_NOTE_MAX_LENGTH).toBe(240);
  });

  it.each([
    ["undefined", undefined],
    ["the empty string", ""],
    ["spaces", "   "],
    ["format characters alone", `${ZERO_WIDTH_SPACE}${RIGHT_TO_LEFT_OVERRIDE}`],
  ])("requires a label: %s is REQUIRED", (_title, raw) => {
    expect(labelCode(raw)).toBe("REQUIRED");
  });

  it.each([
    ["null", null],
    ["a number", 12],
    ["an array", ["Prices"]],
  ])("refuses %s as not text", (_title, raw) => {
    expect(labelCode(raw)).toBe("NOT_TEXT");
  });

  it("counts code points: 80 astral characters (160 UTF-16 units) fit and 81 do not", () => {
    expect(labelOf(ASTRAL_CHARACTER.repeat(80))).toBe(
      ASTRAL_CHARACTER.repeat(80),
    );
    expect(labelCode(ASTRAL_CHARACTER.repeat(81))).toBe("TOO_LONG");
  });

  it("composes to NFC before counting", () => {
    expect(labelOf(`e${COMBINING_ACUTE}`)).toBe(PRECOMPOSED_E_ACUTE);
    expect(labelOf(`e${COMBINING_ACUTE}`.repeat(80))).toBe(
      PRECOMPOSED_E_ACUTE.repeat(80),
    );
    expect(labelCode(`e${COMBINING_ACUTE}`.repeat(81))).toBe("TOO_LONG");
  });

  it("strips format characters, bidi overrides included, instead of refusing them", () => {
    expect(labelOf(`Pri${ZERO_WIDTH_SPACE}ces${RIGHT_TO_LEFT_OVERRIDE}`)).toBe(
      "Prices",
    );
  });

  it("trims the ends and keeps the interior", () => {
    expect(labelOf("  Autumn  prices ")).toBe("Autumn  prices");
  });

  it.each([
    ["a line feed", "Prices\nnew"],
    ["a NUL", "Prices\u0000"],
    ["a line separator", `Prices${LINE_SEPARATOR}new`],
    ["a lone surrogate", `Prices${LONE_HIGH_SURROGATE}`],
  ])("refuses %s", (_title, raw) => {
    expect(labelCode(raw)).toBe("FORBIDDEN_CHARACTER");
  });
});

describe("judgeVersionNote: the optional line beside a version", () => {
  it.each([
    ["undefined", undefined],
    ["the empty string", ""],
    ["spaces", "  "],
  ])("accepts %s as an empty note", (_title, raw) => {
    expect(noteOf(raw)).toBe("");
  });

  it("allows 240 code points and refuses 241", () => {
    expect(noteOf("a".repeat(240))).toBe("a".repeat(240));
    expect(noteCode("a".repeat(241))).toBe("TOO_LONG");
    expect(noteOf(ASTRAL_CHARACTER.repeat(240))).toBe(
      ASTRAL_CHARACTER.repeat(240),
    );
  });

  it("applies the label's text rule: NFC, format characters stripped, control characters refused", () => {
    expect(noteOf(`e${COMBINING_ACUTE}${ZERO_WIDTH_SPACE}`)).toBe(
      PRECOMPOSED_E_ACUTE,
    );
    expect(noteCode("one\ntwo")).toBe("FORBIDDEN_CHARACTER");
    expect(noteCode(`x${LONE_HIGH_SURROGATE}`)).toBe("FORBIDDEN_CHARACTER");
    expect(noteCode(7)).toBe("NOT_TEXT");
  });
});
