// M10 M2 (1), M2-a: a bulk percentage over the cabinets' prices (ADR 0177 A-14; frame D2D).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_BULK_PERCENT,
  MIN_BULK_PERCENT,
  planBulkChange,
  priceGroupOf,
  scaledAmountMinor,
  type BulkPlan,
  type BulkTarget,
  type PlannedCabinetPrice,
} from "../../src/price-dashboard/bulk-change.js";
import { pricedRowOf } from "../../src/price-dashboard/priced-row.js";
import type { PriceBook, PriceFormula } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import type { PriceGroupCode } from "../../src/staff/dashboard-audit-action.js";

import { CATALOG, ruleOf, withFormula } from "./m2-support.js";

const NUM_RUNS = 200;
const TEN_LEI_MINOR = 1_000n;

/** The oracle, from A-14 alone and in exact integers: `r10(x × (100 + p) / 100)`, half up, for a non-negative x. */
function oracleScaledMinor(amountMinor: number, percent: number): number {
  const numerator = BigInt(amountMinor) * BigInt(100 + percent);
  const tenLeiUnits = (numerator + 50_000n) / 100_000n;
  return Number(tenLeiUnits * TEN_LEI_MINOR);
}

const wholePercent = fc
  .integer({ min: MIN_BULK_PERCENT, max: MAX_BULK_PERCENT })
  .filter((percent) => percent !== 0);

function plannedChanges(plan: BulkPlan): readonly PlannedCabinetPrice[] {
  if (plan.kind !== "planned") throw new Error(`Refused: ${plan.code}`);
  return plan.changes;
}

function planOf(
  target: BulkTarget,
  percent: number,
  book: PriceBook = SAMPLE_PRICE_BOOK,
): BulkPlan {
  return planBulkChange({ book, catalog: CATALOG, target, percent });
}

/** The amount a change replaces, read from the book directly (not through the module under test). */
function currentAmountMinor(
  book: PriceBook,
  { address }: PlannedCabinetPrice,
): number {
  const rule = book.cabinetRules.find(
    ({ ruleId }) => ruleId === address.ruleId,
  );
  const formula = rule?.formula;
  if (formula === undefined) throw new Error("No such rule");
  if (address.kind === "cabinet-size") {
    if (formula.shape !== "price-per-size") throw new Error("Not fixed-size");
    const size = formula.sizes.find(
      ({ widthMm }) => widthMm === address.widthMm,
    );
    return size?.amountMinor ?? Number.NaN;
  }
  return Reflect.get(formula, address.field) as number;
}

describe("scaledAmountMinor", () => {
  it("scales by the whole percentage and rounds half up to ten lei", () => {
    expect(scaledAmountMinor(145_000, 5)).toBe(152_000); // 152 250
    expect(scaledAmountMinor(1_000, 50)).toBe(2_000); // 1 500 is a tie: up
    expect(scaledAmountMinor(1_000, -50)).toBe(1_000); // 500 is a tie: up
    expect(scaledAmountMinor(396_000, -90)).toBe(40_000); // 39 600
  });

  it("rounds every exact tie up, for every percentage in the bound", () => {
    const ties: [number, number][] = [];
    for (
      let percent = MIN_BULK_PERCENT;
      percent <= MAX_BULK_PERCENT;
      percent += 1
    ) {
      for (let odd = 1; odd <= 41; odd += 2) {
        const numerator = 50_000 * odd; // x × (100 + p) / 100 is then halfway between two ten-lei
        const factor = 100 + percent;
        if (percent !== 0 && numerator % factor === 0)
          ties.push([numerator / factor, percent]);
      }
    }

    expect(ties.length).toBeGreaterThan(400);
    for (const [amountMinor, percent] of ties) {
      const scaled = scaledAmountMinor(amountMinor, percent);
      expect((amountMinor * (100 + percent)) % 100_000).toBe(50_000);
      expect(scaled).toBe(oracleScaledMinor(amountMinor, percent));
    }
  });

  it("answers a plain zero, never -0, for an amount that rounds away", () => {
    expect(Object.is(scaledAmountMinor(400, -90), 0)).toBe(true);
    expect(Object.is(scaledAmountMinor(0, -50), 0)).toBe(true);
  });

  it("is a multiple of 1 000 equal to r10(x × (100 + p) / 100) for any p in the bulk bound (M2-a)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 600_000_000 }),
        wholePercent,
        (amountMinor, percent) => {
          const scaled = scaledAmountMinor(amountMinor, percent);

          expect(scaled % 1_000).toBe(0);
          expect(scaled).toBe(oracleScaledMinor(amountMinor, percent));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe("planBulkChange over the sample book", () => {
  it("scales every amount a manufacturer cabinet price is made of, and nothing else (M2-a must-not)", () => {
    fc.assert(
      fc.property(wholePercent, (percent) => {
        const plan = planOf({ scope: "all" }, percent);
        if (plan.kind === "refused") {
          expect(["PRICE_WOULD_BE_NEGATIVE", "PERCENT_OUT_OF_RANGE"]).toContain(
            plan.code,
          );
          return;
        }
        const customerRuleIds = new Set(
          SAMPLE_PRICE_BOOK.cabinetRules
            .filter(({ suppliedBy }) => suppliedBy === "customer")
            .map(({ ruleId }) => ruleId),
        );
        for (const change of plan.changes) {
          expect(["cabinet", "cabinet-size"]).toContain(change.address.kind);
          expect(customerRuleIds.has(change.address.ruleId)).toBe(false);
          expect(change.value).toBe(
            oracleScaledMinor(
              currentAmountMinor(SAMPLE_PRICE_BOOK, change),
              percent,
            ),
          );
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("counts the cabinets and the prices in scope, as the dialog's preview names them", () => {
    const plan = planOf({ scope: "all" }, 5);

    const manufacturerRules = SAMPLE_PRICE_BOOK.cabinetRules.filter(
      ({ suppliedBy }) => suppliedBy !== "customer",
    );
    const amountsInBook = manufacturerRules.reduce(
      (total, { formula }) => total + amountsOf(formula),
      0,
    );
    expect(plan).toMatchObject({
      kind: "planned",
      scope: {
        ruleCount: manufacturerRules.length,
        amountCount: amountsInBook,
      },
    });
    expect(plannedChanges(plan)).toHaveLength(amountsInBook);
  });

  it("lists an amount that rounds back to itself, and leaves it out of the changed counts", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-3drawer", {
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 1_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
    });
    const ruleId = ruleOf("base-3drawer", book).ruleId;

    const plan = planOf({ scope: "selection", ruleIds: [ruleId] }, 1, book);

    expect(plannedChanges(plan)).toHaveLength(3);
    expect(plan).toMatchObject({
      scope: { ruleCount: 1, amountCount: 3 },
      changed: { ruleCount: 0, amountCount: 0 },
    });
  });

  it("scales a fixed-size row's every listed size", () => {
    const rule = ruleOf("base-dishwasher");

    const plan = planOf({ scope: "selection", ruleIds: [rule.ruleId] }, 10);

    expect(plannedChanges(plan).map(({ address }) => address)).toEqual([
      { kind: "cabinet-size", ruleId: rule.ruleId, widthMm: 450 },
      { kind: "cabinet-size", ruleId: rule.ruleId, widthMm: 600 },
    ]);
  });

  it("changes the fields a rule's shape reads: the door leaf and the height step too", () => {
    const rule = ruleOf("wall-cabinet");

    const plan = planOf({ scope: "selection", ruleIds: [rule.ruleId] }, 10);

    expect(
      plannedChanges(plan).map(({ address }) =>
        address.kind === "cabinet" ? address.field : address.kind,
      ),
    ).toEqual([
      "anchorMinor",
      "perStepWiderMinor",
      "perStepNarrowerMinor",
      "perExtraDoorLeafMinor",
      "perHeightStepMinor",
    ]);
  });
});

describe("the scopes", () => {
  const ruleIdsOf = (plan: BulkPlan) =>
    new Set(plannedChanges(plan).map(({ address }) => address.ruleId));

  it.each<[PriceGroupCode, readonly string[]]>([
    [
      "corner",
      [
        "base-corner-x-900",
        "base-corner-return-320",
        "wall-corner-return-570",
        "wall-corner-return-570-top",
        "wall-corner-x-900",
        "wall-corner-x-900-top",
      ],
    ],
    ["tall", ["tall-pantry", "tall-oven-tower", "tall-fridge-housing"]],
    ["wall", ["wall-cabinet", "wall-lift", "open-shelf"]],
    [
      "base",
      [
        "base-cabinet",
        "base-3drawer",
        "base-panbank",
        "base-hob-2drawer",
        "base-hob-oven",
        "base-bottle-cargo",
        "base-sink",
        "base-dishwasher",
      ],
    ],
  ])("a group takes its own manufacturer rows: %s", (groupCode, buildIds) => {
    const plan = planOf({ scope: "group", groupCode }, 5);

    expect(ruleIdsOf(plan)).toEqual(
      new Set(buildIds.map((buildId) => ruleOf(buildId).ruleId)),
    );
  });

  it("derives the group from the catalogue band and structural-ness, for every row it holds", () => {
    const groups = new Map(
      SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => [
        rule.buildId,
        priceGroupOf(requiredRow(rule.buildId)),
      ]),
    );

    expect(groups.get("hood")).toBe("wall");
    expect(groups.get("fridge-free")).toBe("tall");
    expect(groups.get("wall-corner-x-900-top")).toBe("corner");
    expect(groups.get("tall-pantry")).toBe("tall");
    expect(groups.get("base-sink")).toBe("base");
  });

  it("a selection takes the rules it names", () => {
    const names = [ruleOf("base-sink").ruleId, ruleOf("tall-pantry").ruleId];

    const plan = planOf({ scope: "selection", ruleIds: names }, 5);

    expect(ruleIdsOf(plan)).toEqual(new Set(names));
  });

  it("refuses a selection naming a rule the book does not hold", () => {
    expect(
      planOf({ scope: "selection", ruleIds: ["cabinet.nothing"] }, 5),
    ).toEqual({ kind: "refused", code: "UNKNOWN_RULE" });
  });

  it("refuses a selection of customer-supplied rows only, which have no price to scale", () => {
    const plan = planOf(
      { scope: "selection", ruleIds: [ruleOf("hood").ruleId] },
      5,
    );

    expect(plan).toEqual({ kind: "refused", code: "NO_CABINETS_SELECTED" });
  });
});

describe("the percentage", () => {
  it.each([
    ["0", 0],
    ["-0", -0],
    ["one past the least", MIN_BULK_PERCENT - 1],
    ["one past the greatest", MAX_BULK_PERCENT + 1],
  ])("refuses %s as out of range", (_name, percent) => {
    expect(planOf({ scope: "all" }, percent)).toEqual({
      kind: "refused",
      code: "PERCENT_OUT_OF_RANGE",
    });
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %s as not whole",
    (percent) => {
      expect(planOf({ scope: "all" }, percent)).toEqual({
        kind: "refused",
        code: "NOT_A_WHOLE_NUMBER",
      });
    },
  );

  it("accepts the bound's own ends on a book they leave priced", () => {
    const small = planOf(
      { scope: "group", groupCode: "tall" },
      MAX_BULK_PERCENT,
    );
    const negative = planOf(
      { scope: "group", groupCode: "tall" },
      MIN_BULK_PERCENT,
    );

    expect(small.kind).toBe("planned");
    expect(negative.kind).toBe("planned");
  });

  it("refuses a percentage that would leave a cabinet at or below zero at its narrowest width (D3C)", () => {
    // 60 000 − 6 × 9 000 = 6 000 today; at −90 % the anchor is 6 000 and the step 1 000, so the 300 mm price is 0.
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-3drawer", {
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 60_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 9_000,
    });
    const ruleId = ruleOf("base-3drawer", book).ruleId;

    const plan = planOf({ scope: "selection", ruleIds: [ruleId] }, -90, book);

    expect(plan).toEqual({ kind: "refused", code: "PRICE_WOULD_BE_NEGATIVE" });
  });

  it("leaves a fault the rule already had to the judgement of the book: a fixed-size rule short of a size does not throw", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-dishwasher", {
      shape: "price-per-size",
      sizes: [{ widthMm: 450, amountMinor: 275_000 }],
    });
    const ruleId = ruleOf("base-dishwasher", book).ruleId;

    const plan = planOf({ scope: "selection", ruleIds: [ruleId] }, 5, book);

    expect(plan.kind).toBe("planned");
  });

  it("refuses a percentage that would take a price past what a cabinet may cost", () => {
    const book = withFormula(SAMPLE_PRICE_BOOK, "base-3drawer", {
      shape: "anchored-width",
      anchorWidthMm: 600,
      anchorMinor: 400_000_000,
      perStepWiderMinor: 0,
      perStepNarrowerMinor: 0,
    });
    const ruleId = ruleOf("base-3drawer", book).ruleId;

    const plan = planOf(
      { scope: "selection", ruleIds: [ruleId] },
      MAX_BULK_PERCENT,
      book,
    );

    expect(plan).toEqual({ kind: "refused", code: "PERCENT_OUT_OF_RANGE" });
  });
});

// Helpers

function requiredRow(buildId: string) {
  const row = pricedRowOf(CATALOG, buildId);
  if (row === undefined) throw new Error(`The catalogue has no ${buildId}`);
  return row;
}

/** How many amounts a formula states, counted from its own members rather than through the module under test. */
function amountsOf(formula: PriceFormula): number {
  if (formula.shape === "price-per-size") return formula.sizes.length;
  return Object.keys(formula).filter((member) => member.endsWith("Minor"))
    .length;
}
