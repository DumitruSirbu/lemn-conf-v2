// Adversarial QA of M10 wave U2, the readers of what a person types (`price-field-input.ts`). `price-field-input.test.ts` holds
// hand-picked refusals and two sweeps over well-formed text. It never types Unicode digits or separators of other scripts,
// never pastes text a spreadsheet or a phone keyboard makes, never asks what the field does with an amount the book itself
// refuses, and its oracle for an accepted amount is the reader's own arithmetic. Here the oracle is BigInt on the digits,
// the alphabet includes the characters that look like digits, and "accepted" is followed into the consumer that receives it:
// the draft's own judgement (`applyChanges`) and the list built from the draft that results.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  MAX_BULK_PERCENT,
  MAX_DEEP_CABINET_PERCENT,
  MIN_BULK_PERCENT,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { deriveCabinetList } from "@/price-dashboard/cabinet-list-facts";
import {
  readBulkPercentInput,
  readDepthPercentInput,
  readLeiInput,
} from "@/price-dashboard/price-field-input";

import { cabinetNamesOf, stateOf } from "./dashboard-state-fixture";

const BASE_ANCHOR = {
  kind: "cabinet",
  ruleId: "cabinet.base-cabinet",
  field: "anchorMinor",
} as const;

// Characters a person can paste that are not the ASCII digits the readers accept: other scripts' digits, fullwidth digits,
// superscripts, the several minus signs and plus signs, separators of other locales, zero-width and bidirectional marks.
const LOOK_ALIKES = [
  "٣", // Arabic-Indic three
  "۳", // Extended Arabic-Indic three
  "३", // Devanagari three
  "３", // fullwidth three
  "²", // superscript two
  "①", // circled one
  "⁄", // fraction slash
  "‒", // figure dash
  "–", // en dash
  "—", // em dash
  "﹣", // small hyphen-minus
  "－", // fullwidth hyphen-minus
  "＋", // fullwidth plus
  "،", // Arabic comma
  "٫", // Arabic decimal separator
  "٬", // Arabic thousands separator
  "’", // apostrophe as thousands separator (Swiss)
  "​", // zero-width space
  "‌", // zero-width non-joiner
  "‎", // left-to-right mark
  "‪", // left-to-right embedding
  "﻿", // BOM, which `\s` does strip
  "\u0000",
  "\t",
  "\n",
];

/** The greatest anchor the draft's judgement accepts and the least it refuses, found by asking it (no constant copied). */
function theBooksLimitForAnAnchor(): { accepted: number; refused: number } {
  const isAccepted = (minor: number) =>
    applyChanges(SAMPLE_PRICE_BOOK, [
      { address: BASE_ANCHOR, value: minor },
    ] as unknown as DraftChange[]).ok;
  let accepted = 1_000;
  let refused = 1_000_000_000_000_000;
  while (refused - accepted > 1_000) {
    const middle = Math.floor((accepted + refused) / 2_000) * 1_000;
    if (isAccepted(middle)) accepted = middle;
    else refused = middle;
  }
  return { accepted, refused };
}

/** Any text, and whole numbers around every bound of both percentages, written plainly or padded, so the edges are met. */
function typedPercent() {
  return fc.oneof(
    fc.string({ maxLength: 12 }),
    fc
      .tuple(
        fc.integer({ min: -400, max: 400 }),
        fc.constantFrom("", " ", "0", "+", "\u2212"),
      )
      .map(([value, decoration]) =>
        value < 0
          ? `${decoration === "\u2212" ? "\u2212" : "-"}${decoration === "0" ? "0" : ""}${String(-value)}`
          : `${decoration === "+" ? "+" : ""}${decoration === "0" ? "0" : ""}${decoration === " " ? " " : ""}${String(value)}`,
      ),
  );
}

describe("an amount in lei typed with characters that only look like the ones the field takes", () => {
  propertyTest.prop(
    [
      fc.array(
        fc.oneof(
          fc.constantFrom(...LOOK_ALIKES),
          fc.constantFrom(..."0123456789,.- +−  ".split("")),
        ),
        { maxLength: 24 },
      ),
    ],
    { numRuns: 4000 },
  )(
    "refuses or reads, never throws, and an amount it reads is the digits' own value in whole tens of lei",
    (parts) => {
      const typed = parts.join("");

      const reading = readLeiInput(typed);

      if (reading.kind === "amount") {
        const bare = typed.replace(/\s/g, "");
        const shape = /^(\d+)(?:[.,](\d{0,2}))?$/.exec(bare);
        expect(
          shape,
          `${JSON.stringify(typed)} read as an amount`,
        ).not.toBeNull();
        const [, whole = "", fraction = ""] = shape ?? [];
        const expected =
          BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
        expect(BigInt(reading.minor)).toBe(expected);
        expect(reading.minor % 1_000).toBe(0);
        expect(Number.isSafeInteger(reading.minor)).toBe(true);
      }
    },
  );
});

describe("an amount in lei that is very large", () => {
  it("is refused, never read, when its digits would not be a safe count of bani, however many zeros lead it", () => {
    for (const zeros of [0, 1, 5, 400]) {
      for (const digits of [13, 14, 15, 16, 17, 40, 400]) {
        const typed = `${"0".repeat(zeros)}${"9".repeat(digits)}0`;

        const reading = readLeiInput(typed);

        if (reading.kind === "amount") {
          expect(Number.isSafeInteger(reading.minor), typed.slice(0, 30)).toBe(
            true,
          );
          expect(BigInt(reading.minor)).toBe(BigInt(typed) * 100n);
        }
      }
    }
  });

  it("reads 13 nines and a trailing zero as a refusal and not as a rounded figure", () => {
    expect(readLeiInput("99999999999990").kind).toBe("refused");
  });

  it("is, when the field reads it, an amount the draft's own judgement accepts (U2-a: nothing the field lets through is a value the book itself refuses)", () => {
    // The book's greatest anchor is found by asking the book, so no constant is copied. The field's own greatest is thirteen
    // digits of lei; between the two lies a range of amounts the field reads, the screen sends, and the server refuses
    // (TOO_LARGE): a request for a value the screen could have known was invalid.
    const { refused } = theBooksLimitForAnAnchor();

    const typed = String(refused / 100);

    expect(
      readLeiInput(typed).kind,
      `${typed} lei is the least amount the draft's own judgement refuses as TOO_LARGE, and the field (whose greatest is 13 digits of lei) reads it`,
    ).toBe("refused");
  });
});

describe("an amount the field reads, followed into the list that is drawn from the draft it makes", () => {
  it("keeps the list drawn and the price button on the row, for 0 and for every tens-of-lei amount the book takes, across the book's range", () => {
    const amounts = [
      0,
      1_000,
      10_000,
      396_000,
      1_000_000,
      100_000_000,
      538_000_000,
      theBooksLimitForAnAnchor().accepted,
    ];
    for (const minor of amounts) {
      const typed = String(minor / 100);
      const reading = readLeiInput(typed);
      expect(reading).toEqual({ kind: "amount", minor });
      const changes = [
        { address: BASE_ANCHOR, value: minor },
      ] as unknown as DraftChange[];

      const derived = deriveCabinetList({
        state: stateOf(changes),
        cabinetNames: cabinetNamesOf(SAMPLE_PRICE_BOOK),
      });

      expect(derived.kind, `${typed} lei`).toBe("ready");
      if (derived.kind !== "ready") continue;
      const row = derived.input.rules.find(
        ({ ruleId }) => ruleId === "cabinet.base-cabinet",
      );
      expect(row?.anchorField?.pendingMinor).toBe(minor);
    }
  });
});

describe("the depth rule's percentage typed oddly", () => {
  const depthAccepted = (typed: string) => readDepthPercentInput(typed);

  it.each([
    ["+5", "notWhole"],
    ["5%", "notWhole"],
    ["5,0", "notWhole"],
    ["5.0", "notWhole"],
    ["0x10", "notWhole"],
    ["1e1", "notWhole"],
    ["٥", "notWhole"],
    ["５", "notWhole"],
    ["−0", "negative"],
    ["-0", "negative"],
    ["101", "tooBig"],
    ["99999999999999999999999", "tooBig"],
  ])("refuses %j as %s", (typed, refusal) => {
    expect(depthAccepted(typed)).toEqual({ kind: "refused", refusal });
  });

  it("is the greatest the book allows at 100 and refused at 101, and the bound is the domain's", () => {
    expect(MAX_DEEP_CABINET_PERCENT).toBe(100);
    expect(depthAccepted("100")).toEqual({ kind: "percent", percent: 100 });
    expect(depthAccepted("101").kind).toBe("refused");
    expect(depthAccepted("0")).toEqual({ kind: "percent", percent: 0 });
    expect(depthAccepted("000")).toEqual({ kind: "percent", percent: 0 });
  });

  propertyTest.prop([typedPercent()], { numRuns: 3000 })(
    "reads a percentage only when the text, once its whitespace is gone, is ASCII digits within 0 to 100",
    (typed) => {
      const reading = depthAccepted(typed);
      const bare = typed.replace(/\s/g, "");
      const isExpected = /^\d+$/.test(bare) && BigInt(bare) <= 100n;

      expect(reading.kind === "percent").toBe(isExpected);
    },
  );
});

describe("the bulk percentage typed oddly", () => {
  it.each([
    ["+-5", "notWhole"],
    ["--5", "notWhole"],
    ["5-", "notWhole"],
    ["5%", "notWhole"],
    ["3,5", "notWhole"],
    ["٥", "notWhole"],
    ["﹣5", "notWhole"],
    ["－5", "notWhole"],
    ["+0", "zero"],
    ["-0", "zero"],
    ["−0", "zero"],
    ["000", "zero"],
    ["301", "outOfRange"],
    ["-91", "outOfRange"],
    ["−91", "outOfRange"],
    ["99999999999999999999999", "outOfRange"],
    ["-99999999999999999999999", "outOfRange"],
  ])("refuses %j as %s", (typed, refusal) => {
    expect(readBulkPercentInput(typed)).toEqual({ kind: "refused", refusal });
  });

  it("reads the same percentage with its sign as the ASCII or the true minus, spaces anywhere, and never -0", () => {
    for (const percent of [-90, -1, 1, 300]) {
      const magnitude = String(Math.abs(percent));
      const signs = percent < 0 ? ["-", "−"] : ["", "+"];
      for (const sign of signs) {
        for (const typed of [
          `${sign}${magnitude}`,
          ` ${sign} ${magnitude} `,
          `${sign}0${magnitude}`,
        ]) {
          const reading = readBulkPercentInput(typed);
          expect(reading, JSON.stringify(typed)).toEqual({
            kind: "percent",
            percent,
          });
          if (reading.kind === "percent")
            expect(Object.is(reading.percent, -0)).toBe(false);
        }
      }
    }
  });

  propertyTest.prop([typedPercent()], { numRuns: 3000 })(
    "reads a percentage only when the text is an optionally signed ASCII whole number, not 0, within the bounds",
    (typed) => {
      const reading = readBulkPercentInput(typed);
      const bare = typed.replace(/\s/g, "");
      const shape = /^([-−+])?(\d+)$/.exec(bare);
      const value =
        shape === null
          ? undefined
          : (shape[1] === "-" || shape[1] === "−" ? -1n : 1n) *
            BigInt(shape[2] ?? "0");
      const isExpected =
        value !== undefined &&
        value !== 0n &&
        value >= BigInt(MIN_BULK_PERCENT) &&
        value <= BigInt(MAX_BULK_PERCENT);

      expect(reading.kind === "percent").toBe(isExpected);
      if (reading.kind === "percent")
        expect(BigInt(reading.percent)).toBe(value);
    },
  );
});
