// Adversarial QA of M10 wave U3, the order a Save writes in (`plannedWritesOf`). The developer pins one pair of fields of
// the base cabinet. This sweeps every manufacturer rule, every amount from zero through values that break a width, and a
// draft that already holds changes, and states what must hold of the plan for any of them: it is a permutation of the
// changed fields (none dropped, none sent twice), a revert is exactly a write of the active amount, and, whenever the
// typed amounts make a rule a publish would take, every prefix of the plan is a rule a publish would take too, so that a
// failure at any position leaves the draft holding no price that is not a price. It also records, from a probe over the
// same range, that a safe order exists wherever a safe end state does: the plan's `Math.max(0, findIndex(...))` fallback
// to the first write is never reached for a state a person can type.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  isSameAddress,
  judgePricesOfRule,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { deriveCabinetDetail } from "@/price-dashboard/cabinet-detail-model";
import {
  bookWithTyped,
  fieldStatesOf,
  type TypedTexts,
} from "@/price-dashboard/cabinet-detail-fields";
import {
  plannedWritesOf,
  type PlannedWrite,
} from "@/price-dashboard/cabinet-write-plan";

import { pageOf } from "./dashboard-state-fixture";
import {
  ALL_RULE_IDS,
  INDEPENDENT_CATALOGUE,
  ruleIn,
} from "./qa-m10-u3-support";

const BANI_PER_LEU = 100;
const MULTI_FIELD_RULE_IDS = ALL_RULE_IDS.filter((ruleId) => {
  const detail = deriveCabinetDetail(pageOf(), ruleId);
  return detail.kind === "ready" && detail.fields.length >= 2;
});

/** Whole tens of lei, from nothing to well past what the sample's prices are: around every threshold a width breaks at. */
const tensOfLei = fc
  .tuple(
    fc.constantFrom(0, 1, 2, 3, 5, 8, 12, 20, 40, 100, 300),
    fc.integer({ min: 0, max: 9 }),
  )
  .map(([scale, offset]) => String((scale + offset) * 10));

function isRulePublishable(book: PriceBook, ruleId: string): boolean {
  return (
    judgePricesOfRule(ruleIn(book, ruleId), INDEPENDENT_CATALOGUE) === undefined
  );
}

function bookAfter(
  start: PriceBook,
  writes: readonly PlannedWrite[],
): PriceBook | undefined {
  let book = start;
  for (const write of writes) {
    const applied = applyChanges(book, [
      { address: write.address, value: write.value } as DraftChange,
    ]);
    if (!applied.ok) return undefined;
    book = applied.book;
  }
  return book;
}

function isEveryPrefixPublishable(
  start: PriceBook,
  ruleId: string,
  plan: readonly PlannedWrite[],
): boolean {
  return plan.every((_write, length) => {
    const book = bookAfter(start, plan.slice(0, length + 1));
    return book !== undefined && isRulePublishable(book, ruleId);
  });
}

describe("the sweep's own reach", () => {
  it("covers rules that take two or more fields, of more than one shape", () => {
    const shapes = new Set(
      MULTI_FIELD_RULE_IDS.map(
        (ruleId) => ruleIn(SAMPLE_PRICE_BOOK, ruleId).formula.shape,
      ),
    );

    expect(MULTI_FIELD_RULE_IDS.length).toBeGreaterThan(5);
    expect(shapes.size).toBeGreaterThanOrEqual(3);
  });
});

describe("the writes of a Save, over every rule and a draft that already holds changes", () => {
  propertyTest.prop(
    [
      fc.constantFrom(...MULTI_FIELD_RULE_IDS),
      fc.array(tensOfLei, { minLength: 6, maxLength: 6 }),
      fc.array(tensOfLei, { minLength: 6, maxLength: 6 }),
    ],
    { numRuns: 1500 },
  )(
    "is a permutation of the changed fields, reverts exactly the active amounts, and leaves every prefix publishable when the end state is",
    (ruleId, draftTexts, typedTexts) => {
      const first = deriveCabinetDetail(pageOf(), ruleId);
      if (first.kind !== "ready") throw new Error(ruleId);
      const draftedStates = fieldStatesOf(
        first.fields,
        textsFor(first.fields, draftTexts),
      );
      const draftedBook = bookWithTyped(first.candidate, draftedStates);
      if (
        draftedBook === undefined ||
        !isRulePublishable(draftedBook, ruleId)
      ) {
        return;
      }
      const draftChanges = draftedStates.flatMap(({ field, effectiveMinor }) =>
        effectiveMinor === field.activeMinor
          ? []
          : [{ address: field.address, value: effectiveMinor } as DraftChange],
      );
      const detail = deriveCabinetDetail(pageOf(draftChanges), ruleId);
      if (detail.kind !== "ready") throw new Error(ruleId);
      const states = fieldStatesOf(
        detail.fields,
        textsFor(detail.fields, typedTexts),
      );
      const endBook = bookWithTyped(detail.candidate, states);
      if (endBook === undefined || !isRulePublishable(endBook, ruleId)) return;

      const plan = plannedWritesOf(detail.candidate, ruleId, states);

      const changed = states.filter(
        ({ field, effectiveMinor }) => effectiveMinor !== field.pendingMinor,
      );
      expect(plan).toHaveLength(changed.length);
      for (const { field, effectiveMinor } of changed) {
        const writes = plan.filter((write) =>
          isSameAddress(write.address, field.address),
        );
        expect(writes, "one write for each changed field").toHaveLength(1);
        expect(writes[0]?.value).toBe(effectiveMinor);
        expect(writes[0]?.value === writes[0]?.activeMinor).toBe(
          effectiveMinor === field.activeMinor,
        );
      }
      expect(
        isEveryPrefixPublishable(detail.candidate, ruleId, plan),
        `${ruleId}: a prefix of the plan leaves a price that is not one (draft ${JSON.stringify(draftTexts)}, typed ${JSON.stringify(typedTexts)})`,
      ).toBe(true);
    },
  );

  it("plans nothing for nothing changed", () => {
    for (const ruleId of MULTI_FIELD_RULE_IDS) {
      const detail = deriveCabinetDetail(pageOf(), ruleId);
      if (detail.kind !== "ready") throw new Error(ruleId);

      expect(
        plannedWritesOf(
          detail.candidate,
          ruleId,
          fieldStatesOf(detail.fields, {}),
        ),
      ).toEqual([]);
    }
  });
});

describe("the draft never passes through a rule that cannot be published (the base cabinet's pair, both ways)", () => {
  function planFor(texts: TypedTexts) {
    const detail = deriveCabinetDetail(pageOf(), "cabinet.base-cabinet");
    if (detail.kind !== "ready") throw new Error("base cabinet");
    const states = fieldStatesOf(detail.fields, texts);
    return {
      detail,
      plan: plannedWritesOf(detail.candidate, "cabinet.base-cabinet", states),
    };
  }

  it.each([
    [
      "anchor down, the minus step down",
      { anchorMinor: "1500", perStepNarrowerMinor: "0" },
    ],
    [
      "the minus step up, the anchor up",
      { anchorMinor: "9000", perStepNarrowerMinor: "400" },
    ],
  ])("%s: every prefix of the plan is publishable", (_name, texts) => {
    const { detail, plan } = planFor(texts);

    expect(plan).toHaveLength(2);
    expect(
      isEveryPrefixPublishable(detail.candidate, "cabinet.base-cabinet", plan),
    ).toBe(true);
  });

  it("states the amounts it was given in bani, not lei", () => {
    const { plan } = planFor({ anchorMinor: "1500" });

    expect(plan.map(({ value }) => value)).toEqual([1500 * BANI_PER_LEU]);
  });
});

function textsFor(
  fields: readonly { readonly key: string }[],
  texts: readonly string[],
): TypedTexts {
  return Object.fromEntries(
    fields.map(({ key }, index) => [key, texts[index] ?? "0"]),
  );
}
