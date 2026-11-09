// The items a design names that availability can switch off (ADR 0062 Amendment 3, A-16, A-17). The one list both `priceDesign`, which refuses on it, and `replacementsRequired`, which builds the sheet from
// it, read, so the refusal and the sheet cannot drift apart.
//
// A design names a tier by choosing it or, when it chose none, by being priced at the book's fallback tier (A-9): a
// switched-off fallback is as unpriceable as a switched-off choice. It names a colour or a handle only by storing one
// (`coloursAndHandlesNamedBy`). An accessory is never named by a design and never needs replacing: a switched-off one
// is simply not billed (`earned-accessories.ts`).
//
// A tier the design chose that the book no longer holds is listed too (see ADR 0178 decision 1); a choice-less design
// priced at a fallback the book lacks is a book fault and stays `UNKNOWN_TIER`'s. The order is the items' own
// (`distinctItemsInOrder`), so it does not depend on how the design or `availability.disabled` was ordered.
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
 * `availability` switches off, and a material or hardware tier the design chose that the book does not hold. The items
 * returned are the design's own references, so a result cannot carry anything availability merely lists.
 *
 * A colour of a vanished material needs no row: the material change resets the colour (ADR 0057, 0081), and palette
 * ids are namespaced by material, so none of that palette is on offer for the new one.
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
    ...dropColoursOfVanishedMaterial(switchedOff, vanished),
  ]);
}

function dropColoursOfVanishedMaterial(
  switchedOff: readonly ItemRef[],
  vanished: readonly ItemRef[],
): readonly ItemRef[] {
  const isMaterialVanished = vanished.some((item) => item.kind === "material");
  return isMaterialVanished ? withoutColours(switchedOff) : switchedOff;
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
