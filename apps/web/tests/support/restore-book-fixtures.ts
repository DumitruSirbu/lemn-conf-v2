import {
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";

// The books, rows and changes the restore plan's tests build their cases from: the active book (the sample book with one
// linked accessory), the three deletable kinds it holds, a version of it that prices one row differently, and the draft
// changes that name a row.

export const PLINTH_LIGHT_ID = "plinth-light";
export const BASE_RULE_ID = "cabinet.base-3drawer";

export const ACTIVE: PriceBook = {
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

export const VENEER = {
  kind: "material",
  tierId: "material.veneer",
} as const satisfies ItemRef;
export const PAINTED = {
  kind: "material",
  tierId: "material.painted-mdf",
} as const satisfies ItemRef;
export const PREMIUM = {
  kind: "hardware",
  tierId: "hardware.premium",
} as const satisfies ItemRef;
export const SOFT_CLOSE = {
  kind: "hardware",
  tierId: "hardware.soft-close",
} as const satisfies ItemRef;
export const PLINTH = {
  kind: "accessory",
  accessoryId: PLINTH_LIGHT_ID,
} as const satisfies ItemRef;

export const ANCHOR_ADDRESS = {
  kind: "cabinet",
  ruleId: BASE_RULE_ID,
  field: "anchorMinor",
} as const;

/** The book with the prices of one row moved: what an archived version that priced the row differently states. */
export function withRowRepriced(book: PriceBook, item: ItemRef): PriceBook {
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

/** The book with the anchor of the base cabinet's rule set to `anchorMinor`. */
export function withAnchor(book: PriceBook, anchorMinor: number): PriceBook {
  return {
    ...book,
    cabinetRules: book.cabinetRules.map((rule) =>
      rule.ruleId === BASE_RULE_ID && "anchorMinor" in rule.formula
        ? { ...rule, formula: { ...rule.formula, anchorMinor } }
        : rule,
    ),
  };
}

export function asChange(change: {
  address: unknown;
  value: unknown;
}): DraftChange {
  return change as unknown as DraftChange;
}

export function anchorChange(value: number): DraftChange {
  return asChange({ address: ANCHOR_ADDRESS, value });
}

/** A change to one of the row's own prices, as a draft holds one before the row is deleted. */
export function pendingOn(item: ItemRef, value: number): DraftChange {
  switch (item.kind) {
    case "material":
      return asChange({
        address: {
          kind: "material",
          tierId: item.tierId,
          field: "percentOfCabinets",
        },
        value,
      });
    case "hardware":
      return asChange({
        address: {
          kind: "hardware",
          tierId: item.tierId,
          field: "perHingeMinor",
        },
        value,
      });
    case "accessory":
      return asChange({
        address: {
          kind: "accessory",
          accessoryId: item.accessoryId,
          field: "perUnitMinor",
        },
        value,
      });
    default:
      throw new Error(`${item.kind} rows carry no price`);
  }
}

/** Whether the change sets a price of the row (a deletion, a creation and a row's words are not prices). */
export function isOnRow(change: DraftChange, item: ItemRef): boolean {
  const { address } = change;
  switch (address.kind) {
    case "hardware":
    case "material":
      return (
        (item.kind === "hardware" || item.kind === "material") &&
        item.kind === address.kind &&
        item.tierId === address.tierId
      );
    case "accessory":
      return (
        item.kind === "accessory" && item.accessoryId === address.accessoryId
      );
    default:
      return false;
  }
}

export function stateOf(
  book: PriceBook,
  changes: readonly DraftChange[],
): ActiveDashboardState {
  return {
    book,
    draft: { draftRevision: "7", changes },
  } as unknown as ActiveDashboardState;
}
