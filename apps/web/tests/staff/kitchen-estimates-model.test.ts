import { fc, test as propertyTest } from "@fast-check/vitest";
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  copiesRelationOf,
  describePriceCard,
  type CopiesRelation,
} from "@/staff/kitchen-estimates-model";
import type {
  StaffEstimateWire,
  StaffKitchenEstimatesWire,
} from "@/staff/staff-kitchens-wire-contract";

// The price card decides "same / different / not comparable" from the exact totals, never from the figures a surface
// prints: both figures round up to the thousand, so totals up to 990 MDL apart print alike (ADR 0185 decision 5).

const BANI_PER_MDL = 100;
const TEN_LEI_MINOR = 10 * BANI_PER_MDL;
const SENT_MINOR = 5_612_000;
const anyTotalMinor = fc.integer({ min: 0, max: 100_000_000 });

function total(totalMinor: number): StaffEstimateWire {
  return { totalMinor, currency: "MDL" };
}

function estimates(
  sent: StaffEstimateWire | null,
  current: StaffKitchenEstimatesWire["currentEstimate"],
): StaffKitchenEstimatesWire {
  return { sentEstimate: sent, currentEstimate: current };
}

function cardOf(sentMinor: number, currentMinor: number) {
  return describePriceCard(
    estimates(total(sentMinor), total(currentMinor)),
    "changed",
  );
}

describe("a price card from two exact totals", () => {
  it("is the same when the totals are equal to the minor unit", () => {
    expect(cardOf(SENT_MINOR, SENT_MINOR).kind).toBe("same");
  });

  it.each([
    ["one bani", 1],
    ["ten lei", TEN_LEI_MINOR],
    ["990 MDL, which prints alike", 990 * BANI_PER_MDL],
    ["1 000 MDL, one printed step", 1_000 * BANI_PER_MDL],
  ])(
    "differs by %s, in both directions, with the exact signed difference",
    (_name, delta) => {
      const up = cardOf(SENT_MINOR, SENT_MINOR + delta);
      const down = cardOf(SENT_MINOR + delta, SENT_MINOR);

      expect(up).toMatchObject({ kind: "different", differenceMinor: delta });
      expect(down).toMatchObject({
        kind: "different",
        differenceMinor: -delta,
      });
    },
  );

  it("reads the owner's case, 56 120 against 56 830 MDL, as +710 MDL", () => {
    expect(cardOf(5_612_000, 5_683_000)).toMatchObject({
      kind: "different",
      differenceMinor: 71_000,
    });
  });

  const anySentEstimate = fc.option(
    fc.record({
      totalMinor: anyTotalMinor,
      currency: fc.constantFrom("MDL", "EUR"),
    }),
    { nil: null },
  );
  const anyCurrentEstimate = fc.oneof(
    fc.record({
      totalMinor: anyTotalMinor,
      currency: fc.constantFrom("MDL", "EUR"),
    }),
    fc.constant({ refused: "UNKNOWN_BODY" }),
    fc.constant({ empty: true }),
  );

  // The second estimate is often built from the first, or two independent totals would almost never be equal and the
  // "same" side of the iff would not run. The currency is cast past the type: the price book names one today.
  propertyTest.prop([anySentEstimate, anyCurrentEstimate, fc.boolean()])(
    "is the same iff both exist in one currency with equal totals, different iff they exist in one currency and are not, else not comparable",
    (sent, independentCurrent, isCurrentCopiedFromSent) => {
      const current =
        sent !== null && isCurrentCopiedFromSent
          ? { ...sent }
          : independentCurrent;
      const wire = estimates(
        sent as StaffEstimateWire | null,
        current as StaffKitchenEstimatesWire["currentEstimate"],
      );

      const card = describePriceCard(wire, "changed");

      const isComparable =
        sent !== null &&
        "totalMinor" in current &&
        sent.currency === current.currency;
      const isEqual = isComparable && sent.totalMinor === current.totalMinor;
      expect(card.kind === "same").toBe(isEqual);
      expect(card.kind === "different").toBe(isComparable && !isEqual);
      expect(card.kind === "not-comparable").toBe(!isComparable);
      if (
        card.kind === "different" &&
        sent !== null &&
        "totalMinor" in current
      ) {
        expect(card.differenceMinor).toBe(current.totalMinor - sent.totalMinor);
      }
    },
  );
});

describe("a price card that cannot compare", () => {
  const priced = total(SENT_MINOR);

  it("keeps both estimates when the sent total is missing", () => {
    const card = describePriceCard(estimates(null, priced), "changed");

    expect(card).toEqual({
      kind: "not-comparable",
      sent: null,
      current: priced,
    });
  });

  it.each([
    ["refused", { refused: "UNKNOWN_BODY" }],
    ["empty", { empty: true }],
  ] as const)(
    "keeps both estimates when the current one is %s",
    (_name, current) => {
      const card = describePriceCard(estimates(priced, current), "changed");

      expect(card).toEqual({ kind: "not-comparable", sent: priced, current });
    },
  );

  it("is not comparable across currencies, even for equal totals", () => {
    // The price book names one currency today, so a second can only be built past the type.
    const foreign = {
      totalMinor: SENT_MINOR,
      currency: "EUR",
    } as unknown as StaffEstimateWire;

    const card = describePriceCard(estimates(priced, foreign), "changed");

    expect(card.kind).toBe("not-comparable");
  });
});

describe("the cause the note names", () => {
  it.each<CopiesRelation>(["changed", "unchanged", "unknown"])(
    "is carried from the %s relation of the copies onto a different price",
    (relation) => {
      const card = describePriceCard(
        estimates(total(SENT_MINOR), total(SENT_MINOR + TEN_LEI_MINOR)),
        relation,
      );

      expect(card).toMatchObject({ kind: "different", noteCause: relation });
    },
  );
});

describe("the relation of the two copies of a kitchen", () => {
  const sent = KITCHEN_L_DESIGN;
  const [, ...fewerPlacements] = KITCHEN_L_DESIGN.placements;
  const edited = { ...KITCHEN_L_DESIGN, placements: fewerPlacements };

  it("is changed when the copies differ, which is when `versionsOf` has an answer", () => {
    const versions = { sent, current: edited };

    expect(copiesRelationOf({ versions, asSent: sent, design: edited })).toBe(
      "changed",
    );
  });

  it("is unchanged only when both copies were read and are the same kitchen", () => {
    expect(
      copiesRelationOf({ versions: undefined, asSent: sent, design: sent }),
    ).toBe("unchanged");
  });

  it.each([
    ["the sent copy", null, sent],
    ["the current copy", sent, null],
    ["both copies", null, null],
  ])(
    "is unknown, never unchanged, when %s cannot be read",
    (_name, asSent, design) => {
      expect(copiesRelationOf({ versions: undefined, asSent, design })).toBe(
        "unknown",
      );
    },
  );
});
