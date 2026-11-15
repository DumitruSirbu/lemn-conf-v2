import { fc, test as propertyTest } from "@fast-check/vitest";
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  describeAddedAmount,
  describeLineAmount,
  describeSignedDifference,
  describeSignedLineAmount,
  describeStartingPrice,
  describeTotalAmount,
} from "@/price/starting-price";
import {
  copiesRelationOf,
  describePriceCard,
} from "@/staff/kitchen-estimates-model";
import { versionsOf } from "@/staff/staff-kitchen-facts";
import type {
  StaffEstimateWire,
  StaffKitchenEstimatesWire,
} from "@/staff/staff-kitchens-wire-contract";

import { resolveStaffChangesCopy } from "@/i18n/content";

import {
  CATALOGUES,
  contentFor,
  leafAt,
  translatorFor,
} from "../support/catalogues";

// Adversarial QA of M12 W6b (ADR 0185 decision 5): the price card's decision, the signed ten-lei difference, and the
// words that name why the price now differs.

const BANI_PER_MDL = 100n;
const TEN_LEI_BANI = 1_000n;
const MINUS_SIGN = "−";
const SIGNED_AMOUNT_SHAPE = /^[+−]\d{1,3}( \d{3})*$/u;

function total(totalMinor: number): StaffEstimateWire {
  return { totalMinor, currency: "MDL" };
}

function magnitudeOf(signedText: string): bigint {
  return BigInt(signedText.slice(1).replaceAll(" ", ""));
}

describe("the signed ten-lei difference, swept", () => {
  const anyDifference = fc.integer({
    min: -Number.MAX_SAFE_INTEGER,
    max: Number.MAX_SAFE_INTEGER,
  });

  propertyTest.prop([anyDifference])(
    "is the same magnitude as a priced line of that size, which is what ADR 0185 d5 names (describeLineAmount)",
    (differenceMinor) => {
      fc.pre(differenceMinor !== 0);

      const text = describeSignedLineAmount(differenceMinor);

      expect(text.slice(1)).toBe(describeLineAmount(Math.abs(differenceMinor)));
    },
  );

  propertyTest.prop([anyDifference])(
    "is grouped by threes with a space, signed, over the whole safe range, and is the least ten-lei step not below the exact size",
    (differenceMinor) => {
      fc.pre(differenceMinor !== 0);

      const text = describeSignedLineAmount(differenceMinor);

      expect(text).toMatch(SIGNED_AMOUNT_SHAPE);
      const shownBani = magnitudeOf(text) * BANI_PER_MDL;
      const exactBani = BigInt(Math.abs(differenceMinor));
      expect(shownBani >= exactBani).toBe(true);
      expect(shownBani - exactBani < TEN_LEI_BANI).toBe(true);
    },
  );

  propertyTest.prop([anyDifference])(
    "is antisymmetric: the fall is the rise with the arithmetic minus",
    (differenceMinor) => {
      fc.pre(differenceMinor !== 0);

      const rise = describeSignedLineAmount(Math.abs(differenceMinor));
      const fall = describeSignedLineAmount(-Math.abs(differenceMinor));

      expect(fall).toBe(`${MINUS_SIGN}${rise.slice(1)}`);
    },
  );

  propertyTest.prop([
    fc.integer({ min: 1, max: 10_000_000 }),
    fc.integer({ min: 0, max: 5_000 }),
  ])(
    "never shrinks as the exact difference grows",
    (smallerMinor, extraMinor) => {
      const smaller = magnitudeOf(describeSignedLineAmount(smallerMinor));
      const larger = magnitudeOf(
        describeSignedLineAmount(smallerMinor + extraMinor),
      );

      expect(larger >= smaller).toBe(true);
    },
  );

  it("steps at every ten-lei boundary: 1 000 bani is +10, 1 001 bani is +20", () => {
    expect(describeSignedLineAmount(1_000)).toBe("+10");
    expect(describeSignedLineAmount(1_001)).toBe("+20");
    expect(describeSignedLineAmount(999)).toBe("+10");
    expect(describeSignedLineAmount(-1_001)).toBe(`${MINUS_SIGN}20`);
  });

  it("prints the largest safe difference without throwing or losing a step", () => {
    const largest = describeSignedLineAmount(Number.MAX_SAFE_INTEGER);

    expect(largest).toMatch(SIGNED_AMOUNT_SHAPE);
    expect(describeSignedLineAmount(-Number.MAX_SAFE_INTEGER)).toBe(
      `${MINUS_SIGN}${largest.slice(1)}`,
    );
  });

  it("does not throw for any difference of two valid totals, however far apart", () => {
    const farthest = describePriceCard(
      {
        sentEstimate: total(0),
        currentEstimate: total(Number.MAX_SAFE_INTEGER),
      },
      "changed",
    );

    expect(farthest.kind).toBe("different");
    if (farthest.kind === "different") {
      expect(() =>
        describeSignedLineAmount(farthest.differenceMinor),
      ).not.toThrow();
    }
  });

  it("matches the owner's case through the card: both totals print 57 000 and the difference is +710", () => {
    const { price } = contentFor("ro", CATALOGUES[0][1]);
    const card = describePriceCard(
      { sentEstimate: total(5_612_000), currentEstimate: total(5_683_000) },
      "changed",
    );

    expect(card.kind).toBe("different");
    if (card.kind !== "different") return;
    expect(
      describeStartingPrice({ totalMinor: card.sent.totalMinor, copy: price }),
    ).toEqual(
      describeStartingPrice({
        totalMinor: card.current.totalMinor,
        copy: price,
      }),
    );
    expect(
      describeSignedDifference({
        differenceMinor: card.differenceMinor,
        copy: price,
      }),
    ).toBe("+710 MDL");
  });

  it("is negative for a price that fell although both totals round to the same thousand", () => {
    const { price } = contentFor("ru", CATALOGUES[1][1]);
    const card = describePriceCard(
      { sentEstimate: total(5_683_000), currentEstimate: total(5_612_000) },
      "unchanged",
    );

    expect(card).toMatchObject({ kind: "different", differenceMinor: -71_000 });
    if (card.kind === "different") {
      expect(
        describeSignedDifference({
          differenceMinor: card.differenceMinor,
          copy: price,
        }),
      ).toBe(`${MINUS_SIGN}710 MDL`);
    }
  });
});

describe("the signed amount keeps every other amount's rules", () => {
  it("still refuses a negative line, total and added amount: the signed one is the only that may be negative", () => {
    expect(() => describeLineAmount(-1)).toThrow(RangeError);
    expect(() => describeTotalAmount(-1)).toThrow(RangeError);
    expect(() => describeAddedAmount(-1)).toThrow(RangeError);
  });

  it("leaves describeLineAmount, describeTotalAmount and describeAddedAmount reading as before", () => {
    expect(describeLineAmount(0)).toBe("0");
    expect(describeLineAmount(71_000)).toBe("710");
    expect(describeLineAmount(1_001)).toBe("20");
    expect(describeTotalAmount(5_612_000)).toBe("57 000");
    expect(describeTotalAmount(0)).toBe("0");
    expect(describeAddedAmount(900_000)).toBe("+9 000");
  });

  it.each([Number.NaN, Number.NEGATIVE_INFINITY, 0.5, -0.5, 2 ** 53])(
    "refuses %s with the operation named in the message",
    (garbled) => {
      expect(() => describeSignedLineAmount(garbled)).toThrow(/difference/u);
    },
  );
});

describe("the price card from hostile totals", () => {
  // The reader (`staff-kitchens-marks-reading.ts`, `isCount`) refuses these before the model sees them. These pin what
  // the model does if one gets through: it answers "different" with a non-whole difference, and rendering that throws a
  // RangeError in `describeSignedLineAmount`. Informational: nothing reaches it today.
  it.each([
    ["NaN against NaN", Number.NaN, Number.NaN],
    ["a fraction against a whole", 5_612_000.5, 5_612_000],
  ])(
    "answers a different price with a non-whole difference for %s, which the formatter refuses",
    (_name, sentMinor, currentMinor) => {
      const card = describePriceCard(
        {
          sentEstimate: total(sentMinor),
          currentEstimate: total(currentMinor),
        },
        "changed",
      );

      expect(card.kind).toBe("different");
      if (card.kind === "different") {
        expect(Number.isSafeInteger(card.differenceMinor)).toBe(false);
        expect(() => describeSignedLineAmount(card.differenceMinor)).toThrow(
          RangeError,
        );
      }
    },
  );

  it("treats a currency written in another case as another currency, never as a difference", () => {
    const lower = {
      totalMinor: 100,
      currency: "mdl",
    } as unknown as StaffEstimateWire;

    const card = describePriceCard(
      { sentEstimate: lower, currentEstimate: total(200) },
      "changed",
    );

    expect(card.kind).toBe("not-comparable");
  });

  it("is not comparable when a priced total also carries a refusal: the refusal wins, never a figure", () => {
    const refusedWithTotal = {
      totalMinor: 100,
      currency: "MDL",
      refused: "UNKNOWN_BODY",
    } as unknown as StaffKitchenEstimatesWire["currentEstimate"];

    const card = describePriceCard(
      { sentEstimate: total(200), currentEstimate: refusedWithTotal },
      "changed",
    );

    expect(card.kind).toBe("not-comparable");
  });

  it("is not comparable when a priced total also carries `empty`", () => {
    const emptyWithTotal = {
      totalMinor: 100,
      currency: "MDL",
      empty: true,
    } as unknown as StaffKitchenEstimatesWire["currentEstimate"];

    const card = describePriceCard(
      { sentEstimate: total(200), currentEstimate: emptyWithTotal },
      "changed",
    );

    expect(card.kind).toBe("not-comparable");
  });
});

describe("the relation of the copies, through the real `versionsOf`", () => {
  const sent = KITCHEN_L_DESIGN;
  const [, ...fewerPlacements] = KITCHEN_L_DESIGN.placements;
  const edited = { ...KITCHEN_L_DESIGN, placements: fewerPlacements };

  function relationOf(asSent: typeof sent | null, design: typeof sent | null) {
    return copiesRelationOf({
      versions: versionsOf({ asSent, design }),
      asSent,
      design,
    });
  }

  it.each([
    ["the client removed a body", sent, edited, "changed"],
    [
      "the copies are the same document",
      sent,
      structuredClone(sent),
      "unchanged",
    ],
    ["the sent copy is unreadable", null, sent, "unknown"],
    ["the current copy is unreadable", sent, null, "unknown"],
    ["neither copy is readable", null, null, "unknown"],
  ] as const)(
    "is decided by what is known when %s",
    (_name, asSent, design, expected) => {
      expect(relationOf(asSent, design)).toBe(expected);
    },
  );

  it("is unchanged, not changed, when only the fields `versionsOf` ignores differ (timestamps, preset)", () => {
    const touched = { ...sent, updatedAt: "2030-01-01T00:00:00.000Z" };

    expect(relationOf(sent, touched)).toBe("unchanged");
  });

  it("is symmetric in the copies", () => {
    expect(relationOf(sent, edited)).toBe(relationOf(edited, sent));
  });
});

describe.each(CATALOGUES)(
  "the words of the price card in %s",
  (locale, messages) => {
    const notes = {
      same: leafAt(messages, "staffChanges.estimateNoteSame"),
      changed: leafAt(messages, "staffChanges.estimateNoteClientChanged"),
      unchanged: leafAt(messages, "staffChanges.estimateNoteUnchanged"),
      unknown: leafAt(messages, "staffChanges.estimateNoteUnknown"),
    };
    const CLIENT_CHANGED_STEM =
      locale === "ro" ? /Clientul a modificat/u : /Клиент изменил/u;
    const KITCHEN_UNCHANGED_STEM =
      locale === "ro" ? /nu s-a schimbat/u : /не менял/u;

    it("has a sentence for every cause", () => {
      for (const sentence of Object.values(notes)) {
        expect(sentence).toBeTruthy();
      }
    });

    it("says the client changed the kitchen only in the changed note", () => {
      expect(notes.changed).toMatch(CLIENT_CHANGED_STEM);
      expect(notes.unchanged).not.toMatch(CLIENT_CHANGED_STEM);
      expect(notes.unknown).not.toMatch(CLIENT_CHANGED_STEM);
      expect(notes.same).not.toMatch(CLIENT_CHANGED_STEM);
    });

    it("says the kitchen is unchanged only when it knows, never in the unknown note", () => {
      expect(notes.unchanged).toMatch(KITCHEN_UNCHANGED_STEM);
      expect(notes.unknown).not.toMatch(KITCHEN_UNCHANGED_STEM);
    });

    it("names today's prices and rules in both notes that do not blame the client", () => {
      const todaysStem = locale === "ro" ? /de azi/u : /сегодняшн/u;

      expect(notes.unchanged).toMatch(todaysStem);
      expect(notes.unknown).toMatch(todaysStem);
      expect(notes.changed).not.toMatch(todaysStem);
    });

    it("reads the difference sentence with the amount verbatim, sign included, and no hyphen-minus", () => {
      const staffChanges = resolveStaffChangesCopy(
        translatorFor(locale, messages),
      );
      const sentence = staffChanges.estimate.difference(
        `${MINUS_SIGN}1 710 MDL`,
      );

      expect(sentence).toContain(`${MINUS_SIGN}1 710 MDL`);
      expect(sentence).not.toContain("-");
    });

    it("has one distinct word for each row label, so the rows never read alike", () => {
      const labels = [
        "estimateSameLabel",
        "estimateAtSendingLabel",
        "estimateNowLabel",
        "estimateSent",
        "estimateCurrent",
      ].map((key) => leafAt(messages, `staffChanges.${key}`));

      expect(new Set(labels).size).toBe(labels.length);
    });
  },
);
