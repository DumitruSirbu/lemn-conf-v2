// The items a design names that availability can switch off (ADR 0062 Amendment 3 and the 2026-10-26 Amendment, A-16,
// A-17). The one list both `priceDesign`, which refuses on it, and `replacementsRequired`, which builds the sheet from
// it, read, so the refusal and the sheet cannot drift apart.
//
// A design names a tier by choosing it or, when it chose none, by being priced at the book's fallback tier (A-9): a
// switched-off fallback is as unpriceable as a switched-off choice. It names a colour or a handle only by storing one
// (`coloursAndHandlesNamedBy`). An accessory is never named by a design and never needs replacing: a switched-off one
// is simply not billed (`earned-accessories.ts`).
//
// A tier the book does not hold is not listed, and a design that chose one is refused no replacement at all: that is
// `UNKNOWN_TIER`'s. The order is the items' own (`distinctItemsInOrder`), so it does not depend on how the design or
// `availability.disabled` was ordered.
import type { Design } from "../design.js";

import {
  coloursAndHandlesNamedBy,
  distinctItemsInOrder,
  isItemDisabled,
  type CatalogueAvailability,
  type CustomisableBodies,
  type ItemRef,
} from "./catalogue-availability.js";
import type { PriceBook, TierGroup, TierIdentity } from "./price-book.js";

/** The whole-kitchen tiers a caller chose: the structural twin of `WholeKitchenSelections`, which this module may not
 *  import (`price-design.ts` imports this module). */
export interface ChosenTiers {
  readonly hardwareTierId?: string | undefined;
  readonly materialTierId?: string | undefined;
}

/** What names items: the design, the catalogue that says which bodies carry a colour or a handle, the book whose
 *  fallback tiers a choice-less design is priced at, and the tiers the caller chose (priced as chosen, as
 *  `priceDesign`'s `selections` are; absent, the fallbacks). */
export interface ItemSelectionQuery {
  readonly design: Design;
  readonly catalog: CustomisableBodies;
  readonly book: PriceBook;
  readonly chosen?: ChosenTiers | undefined;
}

/** Every switchable item the design names, once each, in `distinctItemsInOrder`'s order. */
export function itemsNamedBy(query: ItemSelectionQuery): readonly ItemRef[] {
  const { book, chosen } = query;
  return distinctItemsInOrder([
    ...tierItem(book.material, chosen?.materialTierId, "material"),
    ...tierItem(book.hardware, chosen?.hardwareTierId, "hardware"),
    ...coloursAndHandlesNamedBy(query.design, query.catalog),
  ]);
}

/**
 * The items the design names that `availability` switches off, once each, in `distinctItemsInOrder`'s order. The items
 * returned are the design's own references, so a result cannot carry anything availability merely lists.
 *
 * Empty for a design whose chosen tier the book does not hold, whatever is switched off: that design is `UNKNOWN_TIER`'s
 * (the recovery path of ADR 0072), and a replacement sheet for it could not be built, since its options are read from
 * the tiers and the material it names.
 */
export function disabledItemsNamedBy(
  query: ItemSelectionQuery,
  availability: CatalogueAvailability,
): readonly ItemRef[] {
  if (namesATierTheBookDoesNotHold(query)) return [];
  return itemsNamedBy(query).filter((item) =>
    isItemDisabled(availability, item),
  );
}

function namesATierTheBookDoesNotHold({
  book,
  chosen,
}: ItemSelectionQuery): boolean {
  return (
    !holdsTier(book.material, chosen?.materialTierId) ||
    !holdsTier(book.hardware, chosen?.hardwareTierId)
  );
}

function holdsTier(
  group: TierGroup<TierIdentity>,
  chosenTierId: string | undefined,
): boolean {
  const tierId = chosenTierId ?? group.defaultTierId;
  return group.tiers.some((tier) => tier.tierId === tierId);
}

/** The tier a design is priced at, as an item, when the book holds it. */
function tierItem(
  group: TierGroup<TierIdentity>,
  chosenTierId: string | undefined,
  kind: "hardware" | "material",
): readonly ItemRef[] {
  const tierId = chosenTierId ?? group.defaultTierId;
  return holdsTier(group, chosenTierId) ? [{ kind, tierId }] : [];
}
