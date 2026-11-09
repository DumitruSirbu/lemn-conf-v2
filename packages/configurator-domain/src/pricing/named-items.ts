// The items a design names that availability can switch off (ADR 0062 Amendment 3 and the 2026-10-26 Amendment, A-16,
// A-17). The one list both `priceDesign`, which refuses on it, and `replacementsRequired`, which builds the sheet from
// it, read, so the refusal and the sheet cannot drift apart.
//
// A design names a tier by choosing it or, when it chose none, by being priced at the book's fallback tier (A-9): a
// switched-off fallback is as unpriceable as a switched-off choice. It names a colour or a handle only by storing one
// (`coloursAndHandlesNamedBy`). An accessory is never named by a design and never needs replacing: a switched-off one
// is simply not billed (`earned-accessories.ts`).
//
// While the design's material is a vanished one, its colours are not listed (ADR 0057: a material change resets the
// colour; Q5 owns the reset).
//
// A tier the book does not hold is not a switchable item (`itemsNamedBy` leaves it out), but a design that CHOSE one
// names an item that is no longer offered, and `disabledItemsNamedBy` lists it beside the switched-off ones: it is a
// replacement like any other (ADR 0178, Amendment of 2026-11-04, decision 1). A design that chose nothing, priced at a
// fallback the book does not hold, names no choice that vanished: that is a book fault, and stays `UNKNOWN_TIER`'s. The
// order is the items' own (`distinctItemsInOrder`), so it does not depend on how the design or `availability.disabled`
// was ordered.
import type { Design } from "../design.js";

import {
  coloursAndHandlesNamedBy,
  distinctItemsInOrder,
  isItemDisabled,
  tierRef,
  type CatalogueAvailability,
  type CustomisableBodies,
  type ItemRef,
  type TierKind,
  withoutColours,
} from "./catalogue-availability.js";
import type { PriceBook, TierGroup, TierIdentity } from "./price-book.js";
import type { WholeKitchenSelections } from "./whole-kitchen-selections.js";

/** What names items: the design, the catalogue that says which bodies carry a colour or a handle, the book whose
 *  fallback tiers a choice-less design is priced at, and the tiers the caller chose (priced as chosen, as
 *  `priceDesign`'s `selections` are; absent, the fallbacks). */
export interface NamedItemsQuery {
  readonly design: Design;
  readonly catalog: CustomisableBodies;
  readonly book: PriceBook;
  readonly chosen?: WholeKitchenSelections | undefined;
}

/** Every switchable item the design names, once each, in `distinctItemsInOrder`'s order. */
export function itemsNamedBy(query: NamedItemsQuery): readonly ItemRef[] {
  const { book, chosen } = query;
  return distinctItemsInOrder([
    ...tierItem(book.material, chosen?.materialTierId, "material"),
    ...tierItem(book.hardware, chosen?.hardwareTierId, "hardware"),
    ...coloursAndHandlesNamedBy(query.design, query.catalog),
  ]);
}

/**
 * The items the design names that must be replaced, once each, in `distinctItemsInOrder`'s order: the ones
 * `availability` switches off, and a material or hardware tier the design chose that the book does not hold (deleted
 * since the customer chose it). The items returned are the design's own references, so a result cannot carry anything
 * availability merely lists.
 *
 * A colour is left out while the design's material is one the book no longer holds: the colour is a palette entry of a
 * material that is gone, so the sheet has no group to offer it a replacement from, and replacing the material resets
 * the colour (ADR 0057), which the customer then chooses afresh.
 *
 * A design that chose no tier, whose fallback the book does not hold, lists no tier: that is a malformed book, not a
 * choice that vanished, and `priceDesign` answers it `UNKNOWN_TIER`.
 */
export function disabledItemsNamedBy(
  query: NamedItemsQuery,
  availability: CatalogueAvailability,
): readonly ItemRef[] {
  const vanished = vanishedTiersChosenBy(query);
  const switchedOff = itemsNamedBy(query).filter((item) =>
    isItemDisabled(availability, item),
  );
  return distinctItemsInOrder([
    ...vanished,
    ...(vanished.some(isMaterialItem)
      ? withoutColours(switchedOff)
      : switchedOff),
  ]);
}

function isMaterialItem(item: ItemRef): boolean {
  return item.kind === "material";
}

function vanishedTiersChosenBy({
  book,
  chosen,
}: NamedItemsQuery): readonly ItemRef[] {
  return [
    ...vanishedTier(book.material, chosen?.materialTierId, "material"),
    ...vanishedTier(book.hardware, chosen?.hardwareTierId, "hardware"),
  ];
}

/** The chosen tier as an item when the group does not hold it; nothing when none was chosen, whatever the fallback. */
function vanishedTier(
  group: TierGroup<TierIdentity>,
  chosenTierId: string | undefined,
  kind: TierKind,
): readonly ItemRef[] {
  if (chosenTierId === undefined || holdsTier(group, chosenTierId)) return [];
  return [tierRef(kind, chosenTierId)];
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
  kind: TierKind,
): readonly ItemRef[] {
  const tierId = chosenTierId ?? group.defaultTierId;
  return holdsTier(group, chosenTierId) ? [tierRef(kind, tierId)] : [];
}
