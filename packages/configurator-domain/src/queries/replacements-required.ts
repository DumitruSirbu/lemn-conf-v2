// What a customer must replace before a kitchen has a price, and what they may replace it with (ADR 0062 Amendment 3,
// A-16, A-17): one row per switched-off item the kitchen names, and per material or hardware tier it chose that the
// book no longer holds (ADR 0178, Amendment of 2026-11-04), each with the options that remain.
//
// It sits beside the other queries, not under `pricing/`, because the colours a material offers are the palette's
// (`materials.ts`), which nothing under `pricing/` may import (ADR 0071 decision 1). What it asks of pricing is the one
// list `priceDesign` refuses on (`disabledItemsNamedBy`), so the refusal's items and this query's rows are the same
// set.
//
// It never offers a switched-off item, and it never produces a row with nothing to choose: the dashboard refuses to
// switch off the last active option of a group (A-17), so an empty set is a defect, thrown, and never an empty sheet.
import type { Design } from "../design.js";
import {
  declaredOptionsOfGroup,
  finishItems,
  isItemDisabled,
  type CatalogueAvailability,
  type ItemRef,
} from "../pricing/catalogue-availability.js";
import type { PriceBook } from "../pricing/price-book.js";
import { disabledItemsNamedBy } from "../pricing/named-items.js";
import { lookUpMaterial, paletteEntriesOf } from "../materials.js";
import type { BodyCatalog } from "../void-engine.js";

/** One row of the replacement sheet: a switched-off item the kitchen names, or a tier it chose that the book no longer
 *  holds, and every active item that can stand in. */
export interface ReplacementRequired {
  readonly item: ItemRef;
  /** In the order each group declares its options, never containing a switched-off item, never empty. */
  readonly remaining: readonly ItemRef[];
}

/** A row with nothing to choose. Unreachable while the last active option of a group cannot be switched off; thrown so
 *  that a breach of that guard is loud and not a sheet with no way forward. */
export class NoReplacementOptionError extends Error {
  readonly item: ItemRef;

  constructor(item: ItemRef) {
    super(
      `No active option remains to replace the switched-off ${item.kind}: ${JSON.stringify(item)}`,
    );
    this.name = "NoReplacementOptionError";
    this.item = item;
  }
}

/** What the sheet is built from: the design, the book whose tiers are on offer, what is switched off, and the
 *  catalogue that says which bodies carry a colour or a handle. */
export interface ReplacementsRequiredRequest {
  readonly design: Design;
  readonly book: PriceBook;
  readonly availability: CatalogueAvailability;
  readonly catalog: BodyCatalog;
}

/**
 * The switched-off items this design names (material, hardware class, colour, handle) and the chosen tiers the book no
 * longer holds, each with its remaining options (a tier's are its group's active tiers, whatever the design chose), in
 * the order `priceDesign` lists them. Empty when the design names none. A colour's options are the active entries of
 * the design's own material: a customer replaces a colour within the material they are on.
 */
export function replacementsRequired({
  design,
  book,
  availability,
  catalog,
}: ReplacementsRequiredRequest): readonly ReplacementRequired[] {
  const items = disabledItemsNamedBy(
    { design, catalog, book, chosen: design.settings },
    availability,
  );
  return items.map((item) => ({
    item,
    remaining: activeOptionsReplacing(item, {
      declared: declaredOptionsFor(item, design, book),
      availability,
    }),
  }));
}

function activeOptionsReplacing(
  item: ItemRef,
  options: {
    readonly declared: readonly ItemRef[];
    readonly availability: CatalogueAvailability;
  },
): readonly ItemRef[] {
  const remaining = options.declared.filter(
    (option) => !isItemDisabled(options.availability, option),
  );
  if (remaining.length === 0) throw new NoReplacementOptionError(item);
  return remaining;
}

/** Every option the item's group declares, active or not, in the group's own order. */
function declaredOptionsFor(
  item: ItemRef,
  design: Design,
  book: PriceBook,
): readonly ItemRef[] {
  return declaredOptionsOfGroup(item, book, () =>
    coloursOfTheDesignsMaterial(design, book),
  );
}

/** The palette entries the design's material offers; none for a material that offers no entries (a free-colour picker)
 *  or that no declaration names. */
function coloursOfTheDesignsMaterial(
  design: Design,
  book: PriceBook,
): readonly ItemRef[] {
  const lookup = lookUpMaterial(
    design.settings?.materialTierId ?? book.material.defaultTierId,
  );
  if (lookup.kind === "undeclared") return [];
  return finishItems(paletteEntriesOf(lookup.material));
}
