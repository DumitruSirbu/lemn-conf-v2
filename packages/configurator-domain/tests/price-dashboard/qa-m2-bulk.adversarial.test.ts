// M10 M2 adversarial QA, the bulk percentage (M2-a; ADR 0177 A-14, A-5, A-7b; the planner R2's bulk route runs).
// Counter-examples sought: a rounding that is not r10 half-up in integers, a bulk that moves anything but a manufacturer
// cabinet amount, a scope that counts wrongly, a percentage the bound or whole-number rule lets through, and a plan that
// leaves the book pricing a body at or below zero (or above what a cabinet may cost).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_BULK_PERCENT,
  MIN_BULK_PERCENT,
  planBulkChange,
  scaledAmountMinor,
  type BulkPlan,
  type BulkTarget,
  type PlannedCabinetPrice,
} from "../../src/price-dashboard/bulk-change.js";
import { applyChanges } from "../../src/price-dashboard/apply-changes.js";
import { changeFromReading } from "../../src/price-dashboard/editable-fields.js";
import { judgeBookAgainstCatalog } from "../../src/price-dashboard/judge-book.js";
import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/book-reading.js";
import { MAX_CABINET_AMOUNT_MINOR } from "../../src/pricing/percentage-lines.js";
import type {
  CabinetPriceRule,
  PriceBook,
} from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import type { PriceGroupCode } from "../../src/staff/dashboard-audit-action.js";

import { required } from "./qa-m2-required.js";
import { CATALOG, ruleOf, withFormula } from "./m2-support.js";

const NUM_RUNS = 150;
const GROUPS: readonly PriceGroupCode[] = ["base", "wall", "tall", "corner"];
const TEN_LEI_MINOR = 1_000n;

/** r10(x × (100 + p) / 100) from A-14 alone, in BigInt, for a non-negative x. */
function oracleScaledMinor(amountMinor: number, percent: number): number {
  const numerator = BigInt(amountMinor) * BigInt(100 + percent);
  return Number(((numerator + 50_000n) / 100_000n) * TEN_LEI_MINOR);
}

function gcd(left: number, right: number): number {
  return right === 0 ? left : gcd(right, left % right);
}

/** A tie x × factor = 50 000 × odd exists only when factor / gcd(factor, 50 000) is odd. */
function hasConstructibleTie(factor: number): boolean {
  return (factor / gcd(factor, 50_000)) % 2 === 1;
}

function planOf(
  target: BulkTarget,
  percent: number,
  book: PriceBook = SAMPLE_PRICE_BOOK,
): BulkPlan {
  return planBulkChange({ book, catalog: CATALOG, target, percent });
}

function changesOf(plan: BulkPlan): readonly PlannedCabinetPrice[] {
  if (plan.kind !== "planned") throw new Error(`Refused: ${plan.code}`);
  return plan.changes;
}

function appliedBook(
  book: PriceBook,
  changes: readonly PlannedCabinetPrice[],
): PriceBook {
  const applied = applyChanges(book, changes.map(changeFromReading));
  if (!applied.ok) throw new Error("The plan does not apply to its own book");
  return applied.book;
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const manufacturerRules = SAMPLE_PRICE_BOOK.cabinetRules.filter(
  ({ suppliedBy }) => suppliedBy !== "customer",
);

/** An anchored rule whose price is `anchorMinor` at every width (no step), so only the anchor moves with a percentage. */
function flatAnchorBook(buildId: string, anchorMinor: number): PriceBook {
  return withFormula(SAMPLE_PRICE_BOOK, buildId, {
    shape: "anchored-width",
    anchorWidthMm: 600,
    anchorMinor,
    perStepWiderMinor: 0,
    perStepNarrowerMinor: 0,
  });
}

describe("the rounding is r10 half-up in integers, at every magnitude a book may hold", () => {
  // `fc.integer` cannot reach a tie at a large magnitude by chance, so the ties are built: x × (100 + p) = 50 000 × odd
  // is a tie, and its x is (50 000 / g) × t for odd t, with g = gcd(100 + p, 50 000), when (100 + p) / g is odd.
  const largeTie = fc
    .tuple(
      fc.integer({ min: MIN_BULK_PERCENT, max: MAX_BULK_PERCENT }),
      fc.nat({ max: 2_000_000 }),
    )
    .filter(([percent]) => percent !== 0 && hasConstructibleTie(100 + percent))
    .map(([percent, half]) => ({
      percent,
      amountMinor: (50_000 / gcd(100 + percent, 50_000)) * (2 * half + 1),
    }))
    .filter(({ amountMinor }) => amountMinor <= MAX_PRICE_COEFFICIENT_MINOR);

  it("rounds a constructed exact tie up at magnitudes up to the coefficient bound", () => {
    fc.assert(
      fc.property(largeTie, ({ percent, amountMinor }) => {
        const numerator = BigInt(amountMinor) * BigInt(100 + percent);

        expect(numerator % 100_000n).toBe(50_000n);
        expect(scaledAmountMinor(amountMinor, percent)).toBe(
          oracleScaledMinor(amountMinor, percent),
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("equals the exact oracle for any amount up to the coefficient bound and every percentage in the bulk bound", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_PRICE_COEFFICIENT_MINOR }),
        fc.integer({ min: MIN_BULK_PERCENT, max: MAX_BULK_PERCENT }),
        (amountMinor, percent) => {
          expect(scaledAmountMinor(amountMinor, percent)).toBe(
            oracleScaledMinor(amountMinor, percent),
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("separates r10 half-up from a multiplier in floating point on a tie (the mockup's r10(a*1.05) shape)", () => {
    // 5 000 × 10 / 100 = 500: a tie, which half-up takes to 1 000. A float multiplier `1 + p / 100` lands under it.
    expect(scaledAmountMinor(5_000, -90)).toBe(1_000);
    expect(scaledAmountMinor(50_000, -71)).toBe(15_000);
    expect(scaledAmountMinor(4_577_500, -80)).toBe(916_000);
    expect(scaledAmountMinor(17_762_500, 176)).toBe(49_025_000);
  });

  it("refuses an amount or a percentage it cannot hold exactly instead of rounding it in floating point", () => {
    // A float `Math.round(amount × (100 + p) / 100 000) × 1 000` is the same value on every whole input below 2 ** 53, so
    // what tells it from the integer seam is that the seam throws where the float would answer.
    expect(() => scaledAmountMinor(1.5, 5)).toThrow();
    expect(() => scaledAmountMinor(1_001, 0.5)).toThrow();
    expect(() => scaledAmountMinor(Number.MAX_SAFE_INTEGER, 300)).toThrow();
    expect(() => scaledAmountMinor(Number.NaN, 5)).toThrow();
    expect(() => scaledAmountMinor(Number.POSITIVE_INFINITY, 5)).toThrow();
  });

  it("is monotone in the percentage and in the amount, and never below zero for a non-negative amount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50_000_000 }),
        fc.integer({ min: MIN_BULK_PERCENT, max: MAX_BULK_PERCENT - 1 }),
        (amountMinor, percent) => {
          expect(
            scaledAmountMinor(amountMinor, percent),
          ).toBeGreaterThanOrEqual(0);
          expect(
            scaledAmountMinor(amountMinor, percent + 1),
          ).toBeGreaterThanOrEqual(scaledAmountMinor(amountMinor, percent));
          expect(
            scaledAmountMinor(amountMinor + 1, percent),
          ).toBeGreaterThanOrEqual(scaledAmountMinor(amountMinor, percent));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("what a bulk change moves, and what it never moves (M2-a must-not)", () => {
  it("leaves every part of the book but the in-scope manufacturer cabinet amounts as it was, for every percentage in the bound", () => {
    for (
      let percent = MIN_BULK_PERCENT;
      percent <= MAX_BULK_PERCENT;
      percent += 1
    ) {
      if (percent === 0) continue;
      const plan = planOf({ scope: "all" }, percent);
      if (plan.kind === "refused") continue;

      const after = appliedBook(SAMPLE_PRICE_BOOK, plan.changes);

      expect({ ...after, cabinetRules: [] }).toEqual({
        ...SAMPLE_PRICE_BOOK,
        cabinetRules: [],
      });
      expect(after.cabinetRules.map(({ ruleId }) => ruleId)).toEqual(
        SAMPLE_PRICE_BOOK.cabinetRules.map(({ ruleId }) => ruleId),
      );
    }
  });

  it("leaves a customer-supplied rule, and every rule outside the scope, deep-equal; inside it only amounts move", () => {
    const target: BulkTarget = { scope: "group", groupCode: "wall" };
    const plan = planOf(target, 7);
    const after = appliedBook(SAMPLE_PRICE_BOOK, changesOf(plan));
    const touched = new Set(
      changesOf(plan).map(({ address }) => address.ruleId),
    );

    after.cabinetRules.forEach((rule, index) => {
      const before = required(SAMPLE_PRICE_BOOK.cabinetRules[index]);
      if (!touched.has(rule.ruleId)) {
        expect(rule).toEqual(before);
        return;
      }
      expect(rule.suppliedBy).toBe(before.suppliedBy);
      expect(rule.buildId).toBe(before.buildId);
      expect(namesOfNonAmountMembers(rule)).toEqual(
        namesOfNonAmountMembers(before),
      );
    });
    expect(touched.has(ruleOf("hood").ruleId)).toBe(false);
  });

  it("never plans an address that is not a cabinet amount of a manufacturer rule", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_BULK_PERCENT, max: MAX_BULK_PERCENT }),
        fc.constantFrom<BulkTarget>(
          { scope: "all" },
          { scope: "group", groupCode: "base" },
          { scope: "group", groupCode: "wall" },
          { scope: "group", groupCode: "tall" },
          { scope: "group", groupCode: "corner" },
        ),
        (percent, target) => {
          const plan = planOf(target, percent);
          if (plan.kind === "refused") return;
          for (const { address } of plan.changes) {
            expect(["cabinet", "cabinet-size"]).toContain(address.kind);
            const rule = SAMPLE_PRICE_BOOK.cabinetRules.find(
              ({ ruleId }) => ruleId === address.ruleId,
            );
            expect(rule?.suppliedBy).not.toBe("customer");
            if (address.kind === "cabinet") {
              expect(address.field).toMatch(/Minor$/);
            }
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("is a pure function of its inputs: a frozen book is not touched and the same call answers the same plan", () => {
    const frozen = deepFreeze(structuredClone(SAMPLE_PRICE_BOOK));

    const first = planOf({ scope: "all" }, 13, frozen);
    const second = planOf({ scope: "all" }, 13, frozen);

    expect(second).toEqual(first);
    expect(frozen).toEqual(SAMPLE_PRICE_BOOK);
  });

  it("is idempotent as a set of absolute values: applying the same plan twice is applying it once", () => {
    const changes = changesOf(planOf({ scope: "all" }, 9));

    const once = appliedBook(SAMPLE_PRICE_BOOK, changes);
    const twice = appliedBook(once, changes);

    expect(twice).toEqual(once);
  });
});

describe("the plan's result is a book that still prices every cabinet (never at or below zero, never above the bound)", () => {
  it("is a book the catalogue judgement accepts, for a planned percentage of every integer in the bound and every scope", () => {
    const targets: readonly BulkTarget[] = [
      { scope: "all" },
      ...GROUPS.map((groupCode) => ({ scope: "group", groupCode }) as const),
    ];
    let plannedCount = 0;

    for (const target of targets) {
      for (
        let percent = MIN_BULK_PERCENT;
        percent <= MAX_BULK_PERCENT;
        percent += 1
      ) {
        if (percent === 0) continue;
        const plan = planOf(target, percent);
        if (plan.kind !== "planned") continue;
        plannedCount += 1;
        expect(
          judgeBookAgainstCatalog(
            appliedBook(SAMPLE_PRICE_BOOK, plan.changes),
            CATALOG,
          ),
        ).toEqual({ ok: true });
      }
    }

    expect(plannedCount).toBeGreaterThan(1_000);
  });

  it("refuses exactly when the scaled rule would price a body at or below zero, and says PRICE_WOULD_BE_NEGATIVE", () => {
    // 64 000 - 6 x 6 000 = 28 000 at the narrowest width today; the rounding of the step and of the anchor decides which
    // percentages leave it at or below zero, so the oracle book is judged for every one of them.
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-3drawer", {
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 64_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 6_000,
    });
    const target: BulkTarget = {
      scope: "selection",
      ruleIds: [ruleOf("base-3drawer").ruleId],
    };
    const outcomes = new Set<string>();

    for (
      let percent = MIN_BULK_PERCENT;
      percent <= MAX_BULK_PERCENT;
      percent += 1
    ) {
      if (percent === 0) continue;
      const plan = planOf(target, percent, book);
      const judged = judgeBookAgainstCatalog(
        appliedBook(book, scaledChangesOf(book, "base-3drawer", percent)),
        CATALOG,
      );

      expect(plan.kind === "planned").toBe(judged.ok);
      outcomes.add(plan.kind);
      if (plan.kind === "refused") {
        expect(plan.code).toBe("PRICE_WOULD_BE_NEGATIVE");
      }
    }

    expect(outcomes).toEqual(new Set(["planned", "refused"]));
  });

  it("refuses an anchor that rounds to zero", () => {
    const book = flatAnchorBook("base-3drawer", 400);
    const target: BulkTarget = {
      scope: "selection",
      ruleIds: [ruleOf("base-3drawer").ruleId],
    };

    expect(planOf(target, -90, book)).toEqual({
      kind: "refused",
      code: "PRICE_WOULD_BE_NEGATIVE",
    });
  });

  it("refuses a listed size that rounds to zero", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-dishwasher", {
      shape: "price-per-size",
      sizes: [
        { widthMm: 450, amountMinor: 275_000 },
        { widthMm: 600, amountMinor: 1_000 },
      ],
    });
    const target: BulkTarget = {
      scope: "selection",
      ruleIds: [ruleOf("base-dishwasher").ruleId],
    };

    expect(planOf(target, -90, book)).toEqual({
      kind: "refused",
      code: "PRICE_WOULD_BE_NEGATIVE",
    });
  });

  it("refuses a corner whose one listed price rounds to zero", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-corner-return-320", {
      shape: "price-per-size",
      sizes: [{ widthMm: 350, amountMinor: 1_000 }],
    });

    expect(planOf({ scope: "group", groupCode: "corner" }, -90, book)).toEqual({
      kind: "refused",
      code: "PRICE_WOULD_BE_NEGATIVE",
    });
  });

  it("refuses a price that only the shortest opening of a height-built row drives to zero", () => {
    // Every width prices alike (no width step), so the anchor height is fine, and only a 400 mm opening (six height steps
    // below the 700 mm anchor) is at zero after -90 %: 60 000 - 6 x 9 000 = 6 000 becomes 6 000 - 6 x 1 000 = 0.
    const book = withFormula(SAMPLE_PRICE_BOOK, "wall-lift", {
      shape: "anchored-width-and-height",
      anchorWidthMm: 600,
      anchorHeightMm: 700,
      anchorMinor: 60_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
      perHeightStepMinor: 9_000,
    });
    const target: BulkTarget = {
      scope: "selection",
      ruleIds: [ruleOf("wall-lift").ruleId],
    };

    expect(judgeBookAgainstCatalog(book, CATALOG)).toEqual({ ok: true });
    expect(planOf(target, -90, book)).toEqual({
      kind: "refused",
      code: "PRICE_WOULD_BE_NEGATIVE",
    });
  });

  it("holds the price a cabinet may cost to the bound exactly: the greatest multiple of ten lei passes, one more is refused", () => {
    const largest = Math.floor(MAX_CABINET_AMOUNT_MINOR / 1_000) * 1_000;
    const target: BulkTarget = {
      scope: "selection",
      ruleIds: [ruleOf("base-3drawer").ruleId],
    };

    const atBound = planOf(
      target,
      100,
      flatAnchorBook("base-3drawer", largest / 2),
    );
    const pastBound = planOf(
      target,
      100,
      flatAnchorBook("base-3drawer", (largest + 1_000) / 2),
    );

    expect(atBound.kind).toBe("planned");
    expect(pastBound).toEqual({
      kind: "refused",
      code: "PERCENT_OUT_OF_RANGE",
    });
  });

  it("refuses an amount scaled past what the book may hold at all, however far under the cabinet bound the row sits", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-dishwasher", {
      shape: "price-per-size",
      sizes: [
        { widthMm: 450, amountMinor: 275_000 },
        { widthMm: 600, amountMinor: MAX_PRICE_COEFFICIENT_MINOR },
      ],
    });
    const target: BulkTarget = {
      scope: "selection",
      ruleIds: [ruleOf("base-dishwasher").ruleId],
    };

    expect(planOf(target, MAX_BULK_PERCENT, book)).toEqual({
      kind: "refused",
      code: "PERCENT_OUT_OF_RANGE",
    });
  });

  // FAILING ON PURPOSE if `refusalOfScaledRule` keeps reading only the first refusal `judgeRuleAgainstCatalog` finds: a
  // structural fault (here an anchor at 650, not the catalogue's 600) is listed before the price check, so a price the
  // percentage drives to zero on such a rule is never seen.
  it("refuses a price the percentage drives to zero even on a rule that already has a structural fault", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-3drawer", {
      shape: "anchored-width",
      anchorWidthMm: 650,
      anchorMinor: 64_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 6_000,
    });
    const target: BulkTarget = {
      scope: "selection",
      ruleIds: [ruleOf("base-3drawer").ruleId],
    };

    const plan = planOf(target, -90, book);

    expect(plan).toEqual({ kind: "refused", code: "PRICE_WOULD_BE_NEGATIVE" });
  });
});

describe("the scopes count what they touch", () => {
  const amountsIn = (rule: CabinetPriceRule) =>
    rule.formula.shape === "price-per-size"
      ? rule.formula.sizes.length
      : Object.keys(rule.formula).filter((member) => member.endsWith("Minor"))
          .length;

  it("counts all, per group, and the groups together equal all, with no rule in two groups", () => {
    const all = planOf({ scope: "all" }, 5);
    const perGroup = GROUPS.map((groupCode) =>
      planOf({ scope: "group", groupCode }, 5),
    );

    const ruleIdsPerGroup = perGroup.map(
      (plan) => new Set(changesOf(plan).map(({ address }) => address.ruleId)),
    );
    const union = new Set(ruleIdsPerGroup.flatMap((ids) => [...ids]));
    expect(union).toEqual(
      new Set(manufacturerRules.map(({ ruleId }) => ruleId)),
    );
    expect(ruleIdsPerGroup.reduce((sum, ids) => sum + ids.size, 0)).toBe(
      union.size,
    );
    expect(all).toMatchObject({
      scope: {
        ruleCount: manufacturerRules.length,
        amountCount: manufacturerRules.reduce(
          (sum, rule) => sum + amountsIn(rule),
          0,
        ),
      },
    });
    perGroup.forEach((plan, index) => {
      const ids = required(ruleIdsPerGroup[index]);
      expect(plan).toMatchObject({
        scope: {
          ruleCount: ids.size,
          amountCount: manufacturerRules
            .filter(({ ruleId }) => ids.has(ruleId))
            .reduce((sum, rule) => sum + amountsIn(rule), 0),
        },
      });
    });
  });

  it("counts a selection once per rule however the ids are repeated or ordered, and drops a customer rule from it", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(
          manufacturerRules.map(({ ruleId }) => ruleId),
          { minLength: 1 },
        ),
        fc.boolean(),
        (ruleIds, isRepeated) => {
          const named = [
            ...ruleIds,
            ...(isRepeated ? ruleIds : []),
            ruleOf("hood").ruleId,
          ];

          const plan = planOf({ scope: "selection", ruleIds: named }, 5);
          const reference = planOf(
            { scope: "selection", ruleIds: [...ruleIds].sort() },
            5,
          );

          expect(plan.kind).toBe("planned");
          expect(plan).toMatchObject({
            scope: { ruleCount: ruleIds.length },
          });
          expect([...changesOf(plan)].sort(byAddressKey)).toEqual(
            [...changesOf(reference)].sort(byAddressKey),
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("counts as changed exactly the amounts whose scaled value differs from the current one", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: MIN_BULK_PERCENT, max: MAX_BULK_PERCENT })
          .filter((percent) => percent !== 0),
        (percent) => {
          const plan = planOf({ scope: "all" }, percent);
          if (plan.kind === "refused") return;
          const differing = plan.changes.filter(
            (change) => change.value !== currentAmountMinor(change),
          );

          expect(plan.changed.amountCount).toBe(differing.length);
          expect(plan.changed.ruleCount).toBe(
            new Set(differing.map(({ address }) => address.ruleId)).size,
          );
          expect(plan.changed.amountCount).toBeLessThanOrEqual(
            plan.scope.amountCount,
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("is a no-op, listed and counted as nothing changed, on a book whose every amount a percentage rounds back", () => {
    // An amount of 1 000 at 1 % is 1 010 and rounds to 1 000: every in-scope amount is its own scaled value.
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-3drawer", {
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 1_000,
      perStepWiderMinor: 1_000,
      perStepNarrowerMinor: 0,
    });
    const target: BulkTarget = {
      scope: "selection",
      ruleIds: [ruleOf("base-3drawer").ruleId],
    };

    const plan = planOf(target, 1, book);

    expect(plan).toMatchObject({
      kind: "planned",
      scope: { ruleCount: 1, amountCount: 3 },
      changed: { ruleCount: 0, amountCount: 0 },
    });
    expect(appliedBook(book, changesOf(plan))).toEqual(book);
  });

  it("refuses a selection naming no rule, a group the book has no cabinet of, and a book with no cabinet rule", () => {
    const noCabinets: PriceBook = { ...SAMPLE_PRICE_BOOK, cabinetRules: [] };

    expect(planOf({ scope: "selection", ruleIds: [] }, 5)).toEqual({
      kind: "refused",
      code: "NO_CABINETS_SELECTED",
    });
    expect(planOf({ scope: "all" }, 5, noCabinets)).toEqual({
      kind: "refused",
      code: "NO_CABINETS_SELECTED",
    });
    expect(
      planOf({ scope: "group", groupCode: "base" }, 5, noCabinets),
    ).toEqual({
      kind: "refused",
      code: "NO_CABINETS_SELECTED",
    });
  });

  it("refuses a selection that names one rule it holds and one it does not, planning nothing for the first", () => {
    const plan = planOf(
      {
        scope: "selection",
        ruleIds: [ruleOf("base-sink").ruleId, "cabinet.nothing"],
      },
      5,
    );

    expect(plan).toEqual({ kind: "refused", code: "UNKNOWN_RULE" });
  });
});

describe("the percentage", () => {
  it("is the bound the plan names, -90 to 300, and not a number the module holds for itself", () => {
    expect(MIN_BULK_PERCENT).toBe(-90);
    expect(MAX_BULK_PERCENT).toBe(300);
  });

  it("is refused or planned by the bound alone: every integer from 110 under to 100 over decides as the plan's -90 to 300 says", () => {
    for (let percent = -200; percent <= 400; percent += 1) {
      const plan = planOf({ scope: "group", groupCode: "tall" }, percent);

      const isInBound = percent >= -90 && percent <= 300 && percent !== 0;
      if (!isInBound) {
        expect(plan).toEqual({ kind: "refused", code: "PERCENT_OUT_OF_RANGE" });
      } else {
        expect(plan.kind).toBe("planned");
      }
    }
  });

  it.each([
    ["a half", 0.5],
    ["minus a half", -0.5],
    ["a tiny fraction", 1e-9],
    ["just over a whole", 100.000001],
    ["NaN", Number.NaN],
    ["a string of a whole number", "5"],
    ["null", null],
    ["undefined", undefined],
    ["a boolean", true],
  ])(
    "refuses %s as not a whole number, before the range is judged",
    (_name, percent) => {
      expect(planOf({ scope: "all" }, percent as number)).toEqual({
        kind: "refused",
        code: "NOT_A_WHOLE_NUMBER",
      });
    },
  );

  it.each([
    ["the greatest safe integer", Number.MAX_SAFE_INTEGER],
    ["a number past the safe range that is whole", 1e21],
    ["minus infinity is not whole", Number.NEGATIVE_INFINITY],
    ["-100, which would price everything at 0", -100],
  ])("refuses %s", (_name, percent) => {
    const plan = planOf({ scope: "all" }, percent);

    expect(plan.kind).toBe("refused");
  });

  it("answers the same refusal for the same hostile percentage whichever scope it comes with", () => {
    const targets: readonly BulkTarget[] = [
      { scope: "all" },
      { scope: "group", groupCode: "base" },
      { scope: "selection", ruleIds: [ruleOf("base-sink").ruleId] },
      { scope: "selection", ruleIds: ["cabinet.nothing"] },
    ];

    for (const target of targets) {
      expect(planOf(target, 0)).toEqual({
        kind: "refused",
        code: "PERCENT_OUT_OF_RANGE",
      });
      expect(planOf(target, -0)).toEqual({
        kind: "refused",
        code: "PERCENT_OUT_OF_RANGE",
      });
      expect(planOf(target, 1.5)).toEqual({
        kind: "refused",
        code: "NOT_A_WHOLE_NUMBER",
      });
    }
  });

  it("never writes a -0 (a value of 0 is refused before it could be written)", () => {
    for (
      let percent = MIN_BULK_PERCENT;
      percent <= MAX_BULK_PERCENT;
      percent += 1
    ) {
      const plan = planOf({ scope: "all" }, percent);
      if (plan.kind === "refused") continue;
      for (const { value } of plan.changes) {
        expect(Object.is(value, -0)).toBe(false);
      }
    }
  });
});

// Helpers

function namesOfNonAmountMembers(rule: CabinetPriceRule): readonly string[] {
  return Object.keys(rule.formula)
    .filter((member) => !member.endsWith("Minor") && member !== "sizes")
    .sort()
    .map((member) => `${member}=${String(Reflect.get(rule.formula, member))}`);
}

function byAddressKey(
  left: PlannedCabinetPrice,
  right: PlannedCabinetPrice,
): number {
  return JSON.stringify(left.address).localeCompare(
    JSON.stringify(right.address),
  );
}

/** The amount a planned change replaces, read from the sample book directly. */
function currentAmountMinor({ address }: PlannedCabinetPrice): number {
  const formula = SAMPLE_PRICE_BOOK.cabinetRules.find(
    ({ ruleId }) => ruleId === address.ruleId,
  )?.formula;
  if (formula === undefined) throw new Error("No such rule");
  if (address.kind === "cabinet-size") {
    if (formula.shape !== "price-per-size") throw new Error("Not fixed-size");
    return (
      formula.sizes.find(({ widthMm }) => widthMm === address.widthMm)
        ?.amountMinor ?? Number.NaN
    );
  }
  return Reflect.get(formula, address.field) as number;
}

/** The scaling of one rule's every amount by the oracle alone, so the book it makes is judged without the planner. */
function scaledChangesOf(
  book: PriceBook,
  buildId: string,
  percent: number,
): readonly PlannedCabinetPrice[] {
  const rule = ruleOf(buildId, book);
  const { formula } = rule;
  if (formula.shape === "price-per-size") {
    return formula.sizes.map((size) => ({
      address: {
        kind: "cabinet-size",
        ruleId: rule.ruleId,
        widthMm: size.widthMm,
      },
      value: oracleScaledMinor(size.amountMinor, percent),
    }));
  }
  return CABINET_AMOUNT_FIELDS.flatMap((field) => {
    const amount: number | undefined = Reflect.get(formula, field);
    return amount === undefined
      ? []
      : [
          {
            address: { kind: "cabinet" as const, ruleId: rule.ruleId, field },
            value: oracleScaledMinor(amount, percent),
          },
        ];
  });
}

const CABINET_AMOUNT_FIELDS = [
  "anchorMinor",
  "perStepWiderMinor",
  "perStepNarrowerMinor",
  "perExtraDoorLeafMinor",
  "perHeightStepMinor",
] as const;
