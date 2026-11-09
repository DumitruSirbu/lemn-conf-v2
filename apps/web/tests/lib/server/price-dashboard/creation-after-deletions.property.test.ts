import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  hardwareRatesOf,
  parsePriceBook,
  type DraftChange,
  type HardwareRateField,
  type HardwareTier,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { planHardwareClassCreation } from "@/lib/server/price-dashboard/creation-plans";
import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";

import { deleting } from "../../../support/planted-draft";

// A class can be created beside a draft that deletes classes. The creation's rates come from the active book and the
// created class's own from the running candidate, so they differ when a deleted class alone stated a rate. The parser
// leaves three of the five rates optional per class: the property holds where every class states one set of them.

const OPTIONAL_RATES = [
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
] as const satisfies readonly HardwareRateField[];
const WORDS = { name: "GTV Economic", description: "Mecanisme simple" };
const MOST_CLASSES = 20;
const OTHER_CLASSES = 5;

/** Which of the three optional rates a class states, in `OPTIONAL_RATES` order. */
type RateShape = readonly boolean[];

const rateShape: fc.Arbitrary<RateShape> = fc.array(fc.boolean(), {
  minLength: OPTIONAL_RATES.length,
  maxLength: OPTIONAL_RATES.length,
});
const otherClassCount = fc.integer({ min: 0, max: OTHER_CLASSES });
const deletionFlags = fc.array(fc.boolean(), {
  minLength: OTHER_CLASSES,
  maxLength: OTHER_CLASSES,
});

function bookWithClasses(shapes: readonly RateShape[]): PriceBook {
  const [template] = SAMPLE_PRICE_BOOK.hardware.tiers;
  if (template === undefined) throw new Error("the sample book has no class");
  const tiers = shapes.map((shape, index) =>
    classOf(template, `hardware.class-${String(index)}`, shape),
  );
  return {
    ...SAMPLE_PRICE_BOOK,
    hardware: { defaultTierId: tiers[0]?.tierId ?? "", tiers },
  };
}

function classOf(
  template: HardwareTier,
  tierId: string,
  shape: RateShape,
): HardwareTier {
  const withheld: readonly string[] = OPTIONAL_RATES.filter(
    (_, index) => !shape[index],
  );
  const stated = Object.entries(template).filter(
    ([member]) => !withheld.includes(member),
  );
  return {
    ...Object.fromEntries(stated),
    tierId,
    ruleId: tierId,
    name: tierId,
    description: tierId,
  } as unknown as HardwareTier;
}

/** The classes after the default one that `flags` pick, deleted by the draft. */
function deletionsOfClasses(book: PriceBook, flags: readonly boolean[]) {
  return deleting(
    ...book.hardware.tiers
      .slice(1)
      .filter((_, index) => flags[index] === true)
      .map(({ tierId }) => ({ kind: "hardware" as const, tierId })),
  );
}

function stateOf(
  book: PriceBook,
  changes: readonly DraftChange[],
): ActiveDashboardState {
  return {
    book,
    draft: { draftRevision: "1", changes },
  } as unknown as ActiveDashboardState;
}

/** The plan of a person's creation: the page sends the rates the active book's classes state. */
function planCreation(book: PriceBook, changes: readonly DraftChange[]) {
  const rates = Object.fromEntries(
    hardwareRatesOf(book).map((field) => [field, 2_000]),
  );
  return planHardwareClassCreation(
    { expectedDraftRevision: "1", value: WORDS, rates },
    stateOf(book, changes),
  );
}

function expectCreationPossible(book: PriceBook, changes: DraftChange[]) {
  const plan = planCreation(book, changes);
  expect(plan.kind).toBe("write");
  if (plan.kind === "write") {
    expect(applyChanges(book, plan.changes).ok).toBe(true);
  }
}

describe("creating a hardware class beside a draft that deletes classes", () => {
  it("is possible for any draft of deletions, in a book whose classes state one set of rates (property)", () => {
    fc.assert(
      fc.property(
        rateShape,
        otherClassCount,
        deletionFlags,
        (shape, others, flags) => {
          const book = bookWithClasses(
            Array.from({ length: 1 + others }, () => shape),
          );
          fc.pre(parsePriceBook(book).ok);
          const deletions = deletionsOfClasses(book, flags);
          fc.pre(applyChanges(book, deletions).ok);
          fc.pre(book.hardware.tiers.length < MOST_CLASSES);

          expectCreationPossible(book, deletions);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("is possible in the shipped book when the draft deletes every class it may", () => {
    const deletions = deletionsOfClasses(
      SAMPLE_PRICE_BOOK,
      SAMPLE_PRICE_BOOK.hardware.tiers.slice(1).map(() => true),
    );

    expectCreationPossible(SAMPLE_PRICE_BOOK, deletions);
  });

  // The counterexample the property finds when the classes may state different sets of rates, kept as its smallest case:
  // the default class states neither optional rate, a second class states `perDrawerMinor`, and the draft deletes the
  // second. The active book's rates then include `perDrawerMinor` and the candidate's do not. It flips to `it` when the
  // creation reads one book for its rates (it needs `apply-changes.ts` to hand the base book to `prepareStructuralWrite`,
  // beyond R4c1's files).
  it.fails(
    "KNOWN DEFECT (ruling 14, closed as unreachable for stored data; the Z gate's parse-every-version pass re-checks it): is possible in a parsed book where only a class the draft deletes stated a rate",
    () => {
      const book = bookWithClasses([
        [false, false, false],
        [false, true, false],
      ]);
      expect(parsePriceBook(book).ok).toBe(true);
      const deletions = deletionsOfClasses(book, [true]);
      expect(applyChanges(book, deletions).ok).toBe(true);

      expectCreationPossible(book, deletions);
    },
  );
});
