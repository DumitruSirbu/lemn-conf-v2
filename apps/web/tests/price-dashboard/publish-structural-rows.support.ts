// The books and drafts the tests of the created, deleted, reworded and relinked rows share. The books are the sample's, and
// every change goes through `applyChanges`, so a draft here is one the domain accepts.
import {
  applyChanges,
  hardwareRatesOf,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";

export const ACTIVE: PriceBook = SAMPLE_PUBLISH_PAGE.state.active.book;
export const CABINET_NAMES = SAMPLE_PUBLISH_PAGE.cabinetNames;

export const NEW_TIER = "hardware.economy";
export const NEW_TIER_NAME = "Economic";
export const NEW_TIER_DESCRIPTION = "Glisiere simple.";
export const NEW_ACCESSORY = "plinth-light";
export const NEW_ACCESSORY_NAME = "Soclu luminos";

export function change(
  address: DraftChange["address"],
  value: unknown,
): DraftChange {
  return { address, value } as DraftChange;
}

/** The creation of a hardware class and a rate for each mechanism the book prices: a draft that applies. */
export function createTierChanges(book: PriceBook = ACTIVE): DraftChange[] {
  return [
    change(
      { kind: "hardware-tier-created", tierId: NEW_TIER },
      { name: NEW_TIER_NAME, description: NEW_TIER_DESCRIPTION },
    ),
    ...hardwareRatesOf(book).map((field, index) =>
      change(
        { kind: "hardware", tierId: NEW_TIER, field },
        1_000 * (index + 1),
      ),
    ),
  ];
}

export function createAccessoryChange(linkedBuildId: string): DraftChange {
  return change(
    { kind: "accessory-created", accessoryId: NEW_ACCESSORY },
    {
      linkedBuildId,
      perUnitMinor: 7_000,
      name: NEW_ACCESSORY_NAME,
      description: "Banda de lumina pentru soclu.",
    },
  );
}

export function applied(
  book: PriceBook,
  changes: readonly DraftChange[],
): PriceBook {
  const result = applyChanges(book, changes);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.book;
}

/** A catalogue row that the sample's `cabinetNames` names, for a link to follow. */
export function firstNamedBuildId(): string {
  const buildId = Object.keys(CABINET_NAMES)[0];
  if (buildId === undefined) throw new Error("the sample names no cabinet");
  return buildId;
}
