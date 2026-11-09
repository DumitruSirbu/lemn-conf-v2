import { describe, expect, it } from "vitest";

import {
  applyChanges,
  isSameAddress,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { planRestoreToDraft } from "@/lib/server/price-dashboard/restore-plan";

import { deleting } from "../../support/planted-draft";
import {
  ACTIVE,
  PLINTH,
  PREMIUM,
  VENEER,
  isOnRow,
  pendingOn,
  withRowRepriced,
} from "../../support/restore-book-fixtures";

// A restore keeps the deletion of a row the archived version prices and changes nothing on that row, so the refused
// draft `[delete T, rate on T]` never arises.

const OTHER_ROW = "cabinet.base-sink";
const OTHER_ROW_ADDRESS = {
  kind: "cabinet",
  ruleId: OTHER_ROW,
  field: "anchorMinor",
} as const;
const DELETABLE_ROWS: readonly { name: string; item: ItemRef }[] = [
  { name: "a material", item: VENEER },
  { name: "a hardware class", item: PREMIUM },
  { name: "a linked accessory", item: PLINTH },
];

function anchorOf(book: PriceBook, ruleId: string): number {
  const formula = book.cabinetRules.find(
    (rule) => rule.ruleId === ruleId,
  )?.formula;
  if (formula === undefined || !("anchorMinor" in formula)) {
    throw new Error(`${ruleId} has no anchor`);
  }
  return formula.anchorMinor;
}

function withAnchorMoved(book: PriceBook): PriceBook {
  const moved = anchorOf(book, OTHER_ROW) + 50_000;
  return {
    ...book,
    cabinetRules: book.cabinetRules.map((rule) =>
      rule.ruleId === OTHER_ROW && "anchorMinor" in rule.formula
        ? { ...rule, formula: { ...rule.formula, anchorMinor: moved } }
        : rule,
    ),
  };
}

describe.each(DELETABLE_ROWS)(
  "a restore of a version that prices $name the draft deletes",
  ({ item }) => {
    const archivedPricingTheRow = withAnchorMoved(
      withRowRepriced(ACTIVE, item),
    );
    const deletion = deleting(item);

    it("is the control: with no deletion in the draft the restore does add changes to that row", () => {
      const plan = planRestoreToDraft({
        archived: archivedPricingTheRow,
        active: ACTIVE,
        draft: [],
      });

      expect(plan.draft.some((change) => isOnRow(change, item))).toBe(true);
    });

    it("keeps the deletion and adds no change addressed to the row", () => {
      const plan = planRestoreToDraft({
        archived: archivedPricingTheRow,
        active: ACTIVE,
        draft: deletion,
      });

      expect(plan.draft).toEqual([
        ...deletion,
        {
          address: OTHER_ROW_ADDRESS,
          value: anchorOf(archivedPricingTheRow, OTHER_ROW),
        },
      ]);
      expect(plan).toMatchObject({ addedChangeCount: 1, differingCount: 1 });
    });

    it("leaves a draft that `applyChanges` accepts", () => {
      const plan = planRestoreToDraft({
        archived: archivedPricingTheRow,
        active: ACTIVE,
        draft: deletion,
      });

      expect(applyChanges(ACTIVE, plan.draft).ok).toBe(true);
    });

    it("counts nothing when the row is the only difference, so the restore is nothing-differs", () => {
      const plan = planRestoreToDraft({
        archived: withRowRepriced(ACTIVE, item),
        active: ACTIVE,
        draft: deletion,
      });

      expect(plan).toEqual({
        draft: deletion,
        addedChangeCount: 0,
        differingCount: 0,
      });
    });

    it("keeps a pending change the draft made to the row before deleting it, as it keeps the row", () => {
      const pending = pendingChangeTo(item);

      const plan = planRestoreToDraft({
        archived: archivedPricingTheRow,
        active: ACTIVE,
        draft: [pending, ...deletion],
      });

      expect(plan.draft.slice(0, 2)).toEqual([pending, ...deletion]);
      expect(applyChanges(ACTIVE, plan.draft).ok).toBe(true);
    });
  },
);

describe("a restore beside a draft that deletes one row and prices another", () => {
  it("replaces the pending price of the row it does not delete, and leaves the deleted row alone", () => {
    const archived = withRowRepriced(withRowRepriced(ACTIVE, VENEER), PREMIUM);
    const pendingPremium: DraftChange = {
      address: {
        kind: "hardware",
        tierId: PREMIUM.tierId,
        field: "perHingeMinor",
      },
      value: 9_999,
    };

    const plan = planRestoreToDraft({
      archived,
      active: ACTIVE,
      draft: [...deleting(VENEER), pendingPremium],
    });

    expect(plan.draft.filter((change) => isOnRow(change, VENEER))).toEqual([]);
    expect(plan.draft).toEqual(expect.arrayContaining(deleting(VENEER)));
    expect(
      plan.draft.some(({ address }) =>
        isSameAddress(address, pendingPremium.address),
      ),
    ).toBe(true);
    expect(
      plan.draft.find(({ address }) =>
        isSameAddress(address, pendingPremium.address),
      )?.value,
    ).toBe(
      archived.hardware.tiers.find(({ tierId }) => tierId === PREMIUM.tierId)
        ?.perHingeMinor,
    );
    expect(applyChanges(ACTIVE, plan.draft).ok).toBe(true);
  });
});

const PENDING_MATERIAL_PERCENT = 33;
const PENDING_HARDWARE_RATE_MINOR = 9_000;
const PENDING_ACCESSORY_PRICE_MINOR = 2_000;

function pendingChangeTo(item: ItemRef): DraftChange {
  if (item.kind === "material") {
    return pendingOn(item, PENDING_MATERIAL_PERCENT);
  }
  return pendingOn(
    item,
    item.kind === "hardware"
      ? PENDING_HARDWARE_RATE_MINOR
      : PENDING_ACCESSORY_PRICE_MINOR,
  );
}
