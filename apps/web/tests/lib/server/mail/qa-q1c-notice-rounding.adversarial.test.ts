// Adversarial QA for M10 Q1c on the shop's notice (text part and HTML part). The notice prints the review of the STORED
// snapshot: each appendix row at its stored line's amount to the ten lei, and the one figure at the thousand round-up of
// the stored total. The expected side is BigInt arithmetic written here; every printed cell is also read back (spaces
// stripped, times a hundred) and compared with the stored amount. Stored lines that are not a multiple of ten lei (a
// snapshot written by another build) must round UP to the next ten lei, in both parts.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  type PriceLine,
  type PricedDesign,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { composeLeadNotice } from "@/lib/server/mail/lead-notification";

import { builtDeep, required } from "../../../support/deep-priced-kitchens";
import { ro } from "../../../support/romanian-content";
import { VARIED_L_ARM, VARIED_U_ARM } from "../../../support/varied-kitchens";
import {
  designSubmission,
  noticeInput,
  sendableKitchensOf,
  snapshotOf,
} from "./lead-notice-fixtures";
import { ownTextOf, parseNotice } from "./notice-html-dom-support";

const PROPERTY_SEED = 8_102_811;
const KITCHENS_PER_ARM = 10;
const BANI_PER_LEU = 100;
const BANI_PER_TEN_LEI = 1_000;

function grouped(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function toTenLei(bani: number): string {
  return grouped(String(((BigInt(bani) + 999n) / 1_000n) * 10n));
}

function toThousandLei(bani: number): string {
  return grouped(String(((BigInt(bani) + 99_999n) / 100_000n) * 1000n));
}

function baniOf(text: string): number {
  return Number(text.replaceAll(" ", "")) * BANI_PER_LEU;
}

function expectedCell(line: PriceLine): string {
  if (line.kind === "cabinet" && line.suppliedBy === "customer") {
    return ro.priceBreakdown.notIncluded;
  }
  return line.amountMinor === 0
    ? ro.priceBreakdown.included
    : toTenLei(line.amountMinor);
}

function noticeOf(snapshot: SubmissionSnapshot): {
  text: string;
  html: string;
} {
  const message = composeLeadNotice(
    noticeInput(designSubmission({ snapshot })),
  );
  if (message.html === undefined) throw new Error("expected an HTML part");
  return { text: message.text, html: message.html };
}

/** The appendix of the text part: every row line after the heading that is not indented, as its value. */
function textValues(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.indexOf(ro.leadNotice.appendixHeading);
  expect(start).toBeGreaterThan(0);
  return lines
    .slice(start + 1)
    .filter((line) => !line.startsWith(" ") && line.includes(": "))
    .map((line) => line.slice(line.lastIndexOf(": ") + 2));
}

/** The amount cells of the HTML appendix, in document order. */
function htmlValues(html: string): string[] {
  const { document } = parseNotice(html);
  const heading = [...document.querySelectorAll("h3")].find(
    (candidate) => ownTextOf(candidate) === ro.leadNotice.appendixHeading,
  );
  expect(heading).toBeDefined();
  return [
    ...(heading?.nextElementSibling?.querySelectorAll('td[align="right"]') ??
      []),
  ].map((cell) => cell.textContent);
}

function figureLineOf(totalMinor: number): string {
  return ro.leadNotice.line(
    ro.leadNotice.labels.price,
    ro.leadNotice.figure(
      ro.price.startingPrefix,
      ro.price.amountWithCurrency(toThousandLei(totalMinor)),
    ),
  );
}

function expectNoticeToPrintTheStoredLines(snapshot: SubmissionSnapshot): void {
  const { priced } = snapshot;
  const { text, html } = noticeOf(snapshot);
  const expected = priced.lines.map(expectedCell).sort();

  expect([...textValues(text)].sort()).toEqual(expected);
  expect([...htmlValues(html)].sort()).toEqual(expected);
  expect(text.split("\n")).toContain(figureLineOf(priced.totalMinor));
  expect(html).toContain(
    ro.price.amountWithCurrency(toThousandLei(priced.totalMinor)),
  );
}

function withPriced(
  snapshot: SubmissionSnapshot,
  priced: PricedDesign,
): SubmissionSnapshot {
  return { ...snapshot, priced };
}

function kitchensOf(arm: typeof VARIED_L_ARM): SubmissionSnapshot[] {
  return sendableKitchensOf(arm)
    .slice(0, KITCHENS_PER_ARM)
    .flatMap(({ design }) => {
      const flat = snapshotOf(design);
      const deep = snapshotOf(builtDeep(design));
      return [flat, deep].flatMap((snapshot) =>
        snapshot === undefined ? [] : [snapshot],
      );
    });
}

const SNAPSHOTS = [...kitchensOf(VARIED_L_ARM), ...kitchensOf(VARIED_U_ARM)];

describe("the notice, over stored kitchens priced by the domain", () => {
  it("has kitchens to print", () => {
    expect(SNAPSHOTS.length).toBeGreaterThanOrEqual(10);
    expect(
      SNAPSHOTS.some((snapshot) =>
        snapshot.priced.lines.some((line) => line.kind === "depth"),
      ),
    ).toBe(true);
  });

  it("prints every appendix cell, in both parts, as the stored line to the ten lei, and the figure at the thousand", () => {
    for (const snapshot of SNAPSHOTS)
      expectNoticeToPrintTheStoredLines(snapshot);
  });

  it("prints a positive cell that is the stored amount exactly, and sums nothing: lines and figure differ", () => {
    let differing = 0;
    for (const snapshot of SNAPSHOTS) {
      const { text } = noticeOf(snapshot);
      const numeric = textValues(text).filter((value) => /^\d/.test(value));
      const stored = snapshot.priced.lines
        .filter(
          (line) =>
            line.amountMinor > 0 &&
            !(line.kind === "cabinet" && line.suppliedBy === "customer"),
        )
        .map((line) => line.amountMinor)
        .sort((first, second) => first - second);

      expect(numeric.map(baniOf).sort((a, b) => a - b)).toEqual(stored);
      if (numeric.some((value) => baniOf(value) % (BANI_PER_LEU * 1000) !== 0))
        differing += 1;
    }
    expect(differing).toBeGreaterThan(SNAPSHOTS.length / 2);
  });
});

describe("the notice, over stored lines that are not a multiple of ten lei", () => {
  const BASE = required(
    SNAPSHOTS.find((snapshot) =>
      snapshot.priced.lines.some((line) => line.kind === "depth"),
    ),
    "a kitchen with a depth line",
  );

  function restoredWith(
    amounts: readonly number[],
    totalMinor: number,
  ): SubmissionSnapshot {
    return withPriced(BASE, {
      ...BASE.priced,
      totalMinor,
      lines: BASE.priced.lines.map(
        (line, index): PriceLine => ({
          ...line,
          amountMinor: amounts[index % amounts.length] ?? 0,
        }),
      ),
    });
  }

  const storedAmount = fc.oneof(
    { arbitrary: fc.constant(0), weight: 1 },
    { arbitrary: fc.integer({ min: 1, max: 2_500 }), weight: 4 },
    { arbitrary: fc.integer({ min: 0, max: 50_000_000 }), weight: 2 },
  );

  propertyTest.prop(
    [
      fc.array(storedAmount, { minLength: 1, maxLength: 30 }),
      fc.integer({ min: 0, max: 900_000_000 }),
    ],
    { numRuns: 150, seed: PROPERTY_SEED },
  )(
    "rounds each UP to the next ten lei in the text and the HTML, never below the stored amount and never with bani",
    (amounts, totalMinor) => {
      const snapshot = restoredWith(amounts, totalMinor);
      const { text, html } = noticeOf(snapshot);

      expectNoticeToPrintTheStoredLines(snapshot);
      for (const value of [...textValues(text), ...htmlValues(html)]) {
        if (!/^\d/.test(value)) continue;
        expect(value).toMatch(/^[1-9]\d{0,2}( \d{3})*$/);
        expect(baniOf(value) % BANI_PER_TEN_LEI).toBe(0);
      }
    },
  );

  it.each([
    [1, "10"],
    [999, "10"],
    [1_001, "20"],
    [12_345, "130"],
  ])(
    "prints a stored %i bani on every manufacturer cabinet as %s, in both parts, not as free and not at the thousand",
    (bani, shown) => {
      const snapshot = restoredWith([bani], 1);
      const { text, html } = noticeOf(snapshot);
      const cabinets = snapshot.priced.lines.filter(
        (line) => line.kind === "cabinet" && line.suppliedBy !== "customer",
      );

      expect(
        textValues(text).filter((value) => value === shown).length,
      ).toBeGreaterThanOrEqual(cabinets.length);
      expect(
        htmlValues(html).filter((value) => value === shown).length,
      ).toBeGreaterThanOrEqual(cabinets.length);
      expect(textValues(text)).not.toContain(ro.priceBreakdown.included);
      expect(textValues(text)).not.toContain("1 000");
    },
  );

  it("prints the figure from the stored total, not from the lines", () => {
    const snapshot = restoredWith([123_456], 7_777_777);

    expect(noticeOf(snapshot).text.split("\n")).toContain(
      figureLineOf(7_777_777),
    );
    expect(figureLineOf(7_777_777)).toContain("78 000");
  });
});
