import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  isSameAddress,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { planRestoreToDraft } from "@/lib/server/price-dashboard/restore-plan";

import { deleting } from "../../support/planted-draft";

// A restore keeps the deletion of a row the archived version prices and changes nothing on that row, so the refused
// draft `[delete T, rate on T]` never arises.

const OTHER_ROW = "cabinet.base-sink";
const OTHER_ROW_ADDRESS = {
  kind: "cabinet",
  ruleId: OTHER_ROW,
  field: "anchorMinor",
} as const;
const PLINTH_LIGHT_ID = "plinth-light";

const ACTIVE: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    {
      accessoryId: PLINTH_LIGHT_ID,
      ruleId: `accessory.${PLINTH_LIGHT_ID}`,
      linkedBuildId: "base-3drawer",
      perUnitMinor: 1_000,
      name: "Soclu luminos",
    },
  ],
};

const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PREMIUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const PLINTH_LIGHT: ItemRef = {
  kind: "accessory",
  accessoryId: PLINTH_LIGHT_ID,
};
const DELETABLE_ROWS: readonly { name: string; item: ItemRef }[] = [
  { name: "a material", item: VENEER },
  { name: "a hardware class", item: PREMIUM },
  { name: "a linked accessory", item: PLINTH_LIGHT },
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

/** The book with the prices of one row moved: what an archived version that priced the row differently states. */
function withRowRepriced(book: PriceBook, item: ItemRef): PriceBook {
  switch (item.kind) {
    case "material":
      return {
        ...book,
        material: {
          ...book.material,
          tiers: book.material.tiers.map((tier) =>
            tier.tierId === item.tierId
              ? { ...tier, percentOfCabinets: tier.percentOfCabinets - 5 }
              : tier,
          ),
        },
      };
    case "hardware":
      return {
        ...book,
        hardware: {
          ...book.hardware,
          tiers: book.hardware.tiers.map((tier) =>
            tier.tierId === item.tierId
              ? {
                  ...tier,
                  perHingeMinor: tier.perHingeMinor + 100,
                  perDrawerMinor: tier.perDrawerMinor + 100,
                }
              : tier,
          ),
        },
      };
    case "accessory":
      return {
        ...book,
        linkedAccessories: book.linkedAccessories.map((linked) =>
          linked.accessoryId === item.accessoryId
            ? { ...linked, perUnitMinor: linked.perUnitMinor + 500 }
            : linked,
        ),
      };
    default:
      throw new Error(`${item.kind} rows carry no price`);
  }
}

function namesRow(change: DraftChange, item: ItemRef): boolean {
  const { address } = change;
  switch (address.kind) {
    case "hardware":
    case "material":
      return item.kind === address.kind && item.tierId === address.tierId;
    case "accessory":
      return (
        item.kind === "accessory" && item.accessoryId === address.accessoryId
      );
    default:
      return false;
  }
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

      expect(plan.draft.some((change) => namesRow(change, item))).toBe(true);
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

    expect(plan.draft.filter((change) => namesRow(change, VENEER))).toEqual([]);
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

/** A pending change to one of the row's own prices, as a draft holds one before the row is deleted. */
function pendingChangeTo(item: ItemRef): DraftChange {
  switch (item.kind) {
    case "material":
      return {
        address: {
          kind: "material",
          tierId: item.tierId,
          field: "percentOfCabinets",
        },
        value: 33,
      };
    case "hardware":
      return {
        address: {
          kind: "hardware",
          tierId: item.tierId,
          field: "perHingeMinor",
        },
        value: 9_000,
      };
    case "accessory":
      return {
        address: {
          kind: "accessory",
          accessoryId: item.accessoryId,
          field: "perUnitMinor",
        },
        value: 2_000,
      };
    default:
      throw new Error(`${item.kind} rows carry no price`);
  }
}
