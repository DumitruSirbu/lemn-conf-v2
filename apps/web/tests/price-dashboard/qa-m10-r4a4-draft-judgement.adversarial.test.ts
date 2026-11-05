import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  applyChanges,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { judgeDraft } from "@/price-dashboard/draft-judgement";

// Whose fault a refusal is, when a write puts several changes at once. The cause the person corrects is named over the
// bookkeeping refusal that a class lacks a rate, and for writes that hold no creation the first refusal by position is
// named exactly as before.

const TIER = "hardware.created-for-judging";
const STORED_HINGE_TIER = SAMPLE_PRICE_BOOK.hardware.tiers[0]?.tierId ?? "";

const creation: DraftChange = {
  address: { kind: "hardware-tier-created", tierId: TIER },
  value: { name: "Clasa", description: "" },
} as DraftChange;

const rate = (field: string, value: unknown): DraftChange =>
  ({
    address: { kind: "hardware", tierId: TIER, field },
    value,
  }) as DraftChange;

const completeRates = (): DraftChange[] =>
  HARDWARE_RATE_FIELDS.map((field) => rate(field, 1_000));

function newIndexesOf(changes: readonly DraftChange[]): ReadonlySet<number> {
  return new Set(changes.map((_, index) => index));
}

describe("a class put with its rates", () => {
  it("names the refused rate, not the missing rates the refusal of that rate causes", () => {
    const changes = [
      creation,
      ...completeRates().map((change) =>
        change.address.kind === "hardware" &&
        change.address.field === "perPushRunnerMinor"
          ? rate("perPushRunnerMinor", 0)
          : change,
      ),
    ];

    const judgement = judgeDraft({
      book: SAMPLE_PRICE_BOOK,
      changes,
      newIndexes: newIndexesOf(changes),
      stored: [],
    });

    expect(judgement).toEqual({ kind: "refused-new-change", code: "ZERO" });
  });

  it("names the missing rates when nothing else is wrong", () => {
    const changes = [creation, rate("perHingeMinor", 1_000)];

    const judgement = judgeDraft({
      book: SAMPLE_PRICE_BOOK,
      changes,
      newIndexes: newIndexesOf(changes),
      stored: [],
    });

    expect(judgement).toEqual({
      kind: "refused-new-change",
      code: "CREATED_TIER_RATES_MISSING",
    });
  });

  it("does not blame a stale class for rates a write elsewhere did not touch", () => {
    const stored = [creation];
    const later = {
      address: { kind: "provisional" },
      value: false,
    } as DraftChange;
    const changes = [...stored, later];

    const judgement = judgeDraft({
      book: SAMPLE_PRICE_BOOK,
      changes,
      newIndexes: new Set([1]),
      stored,
    });

    expect(judgement.kind).toBe("applies");
  });
});

describe("a write with no creation in it", () => {
  const badChanges: DraftChange[] = [
    { address: { kind: "provisional" }, value: 5 },
    rate("perHingeMinor", -1),
    rate("perHingeMinor", 1.5),
    { address: { kind: "provisional" }, value: null },
    {
      address: {
        kind: "hardware",
        tierId: STORED_HINGE_TIER,
        field: "perHingeMinor",
      },
      value: -1,
    },
    {
      address: {
        kind: "hardware",
        tierId: STORED_HINGE_TIER,
        field: "perHingeMinor",
      },
      value: "7",
    },
  ] as DraftChange[];

  propertyTest.prop([fc.shuffledSubarray(badChanges, { minLength: 1 })], {
    numRuns: 200,
  })(
    "names the first refusal by position, which is the one applyChanges lists first",
    (changes) => {
      const applied = applyChanges(SAMPLE_PRICE_BOOK, changes);
      if (applied.ok || applied.reason !== "changes-refused") {
        throw new Error("a bad change was accepted");
      }
      const firstRefusal = applied.refusals[0];

      const judgement = judgeDraft({
        book: SAMPLE_PRICE_BOOK,
        changes,
        newIndexes: newIndexesOf(changes),
        stored: [],
      });

      expect(judgement).toEqual({
        kind: "refused-new-change",
        code: firstRefusal?.code,
      });
    },
  );
});
