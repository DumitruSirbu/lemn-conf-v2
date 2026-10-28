// Which saved kitchens use a switchable item, and the counts the lifecycle rules judge by (ADR 0062 Amendment 3: deleting
// a used item is forbidden, disabling one warns with the count; A-17, A-18).
//
// This module is the predicate the persistence usage reader's SQL must agree with. It adds no reading of its own: a
// colour or a handle is *used* exactly when the design *names* it (`coloursAndHandlesNamedBy`, the list the refusal and
// the replacement sheet are built from), and an accessory when the kitchen earns it (`earnedAccessoryIds`, the list the
// price bills and the removal notice names). So "used", "priced" and "must be replaced" cannot drift apart.
//
// Counts are an input. The domain reads no store; the reader that counts designs arrives with S3.
import { pricedAsBuildId } from "../catalog.js";
import type { Design } from "../design.js";
import {
  coloursAndHandlesNamedBy,
  isSameItem,
  type ItemRef,
} from "../pricing/catalogue-availability.js";
import { earnedAccessoryIds } from "../pricing/earned-accessories.js";
import type { PriceBook } from "../pricing/price-book.js";
import { projectDesignForDisplay } from "../queries/design-projection.js";
import type { BodyCatalog } from "../void-engine.js";

/** The design asked about, the item, the catalogue that says what each body is, and the book whose fallback tiers a
 *  choice-less design is priced at and whose linked accessories are asked. */
export interface ItemUsageQuery {
  readonly design: Design;
  readonly item: ItemRef;
  readonly catalog: BodyCatalog;
  readonly book: PriceBook;
}

/**
 * Whether the design uses the item.
 *
 * - A material or hardware class: the design chose it, or chose none and is priced at the book's fallback tier (A-9). A
 *   stored tier id the book no longer holds is still used, whatever the book says.
 * - A colour or a handle: the design names it, at the kitchen level or on a cabinet that can wear one. What a design
 *   follows without storing (a material's default colour, the slot's default handle) is not used.
 * - An accessory: the kitchen earns at least one, built-in (named by its book field) or linked (by its own id). One the
 *   book does not state is never used.
 *
 * Throws `UnknownBodyError` for a built-in or linked accessory asked of a design placing a body the catalogue does not
 * hold, as `removedAccessoriesSince` does: whether a kitchen earns a sink cover is a fact about its bodies.
 */
export function usesItem(query: ItemUsageQuery): boolean {
  const { design, item, catalog, book } = query;
  switch (item.kind) {
    case "material":
      return (
        (design.settings?.materialTierId ?? book.material.defaultTierId) ===
        item.tierId
      );
    case "hardware":
      return (
        (design.settings?.hardwareTierId ?? book.hardware.defaultTierId) ===
        item.tierId
      );
    case "finish":
    case "handle":
      return coloursAndHandlesNamedBy(design, catalog).some((named) =>
        isSameItem(named, item),
      );
    case "accessory":
      return earnsAccessory(query, item.accessoryId);
  }
}

function earnsAccessory(
  { design, catalog, book }: ItemUsageQuery,
  accessoryId: string,
): boolean {
  const entries = projectDesignForDisplay(design, catalog).flatMap(
    (group) => group.entries,
  );
  return earnedAccessoryIds({ entries, catalog, book }).includes(accessoryId);
}

/**
 * The catalogue rows whose placements earn a linked accessory: every row priced as `linkedBuildId`, itself included
 * (ADR 0022). A seeded body counts through the row it is priced as and a body with no equivalent through its own id, so
 * this is the set the usage reader's SQL is given, never a hand-kept list (S3). In the catalogue's order.
 */
export function buildIdsPricedAs(
  catalog: BodyCatalog,
  linkedBuildId: string,
): readonly string[] {
  return [...catalog.keys()].filter(
    (buildId) => pricedAsBuildId(catalog, buildId) === linkedBuildId,
  );
}

/** How many saved designs use one item. */
export interface ItemUsage {
  readonly item: ItemRef;
  readonly designCount: number;
}

/** The counts a judgement is made against, one entry per item asked about. */
export type ItemUsageCounts = readonly ItemUsage[];

/** An item the judgement needed was not counted, or was counted as something that is not a number of designs. Thrown,
 *  never read as zero: a missing count that read as "unused" would let a used item be deleted. */
export class UsageNotCountedError extends Error {
  readonly item: ItemRef;

  constructor(item: ItemRef, reason: string) {
    super(
      `No usable count of the designs using ${JSON.stringify(item)}: ${reason}`,
    );
    this.name = "UsageNotCountedError";
    this.item = item;
  }
}

/** The number of designs using the item. Throws `UsageNotCountedError` when `counts` holds no entry for it, or one that
 *  is not a non-negative whole number. */
export function usageCountOf(counts: ItemUsageCounts, item: ItemRef): number {
  const counted = counts.find((usage) => isSameItem(usage.item, item));
  if (counted === undefined)
    throw new UsageNotCountedError(item, "not counted");
  if (!Number.isSafeInteger(counted.designCount) || counted.designCount < 0) {
    throw new UsageNotCountedError(
      item,
      `${String(counted.designCount)} is not a number of designs`,
    );
  }
  return counted.designCount;
}
