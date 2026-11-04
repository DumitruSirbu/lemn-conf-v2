import {
  buildIdsPricedAs,
  distinctItemsInOrder,
  isBuiltInAccessoryId,
  usesItem,
} from "@lemnaria/configurator-domain";
import type {
  BodyCatalog,
  ItemRef,
  PriceBook,
} from "@lemnaria/configurator-domain";

import type { ItemUsageProbe } from "./m10-ports.js";

/** What says how a kitchen uses an item: the catalogue of bodies, and the book whose fallback tiers and linked
 *  accessories are asked. The active book at the moment the count is for. */
export interface ItemUsageBasis {
  readonly catalog: BodyCatalog;
  readonly book: PriceBook;
}

/**
 * The probes that count the kitchens using each item, one per distinct item in the domain's order, ready for
 * `KitchenUsageReader.countEach`. Every fact a probe carries is the domain's: a tier is the fallback when it is the book's
 * default, a linked accessory is given the build ids priced as the row it is linked to (`buildIdsPricedAs`), and the
 * rest are counted by `usesItem` itself. So the count and the lifecycle rules that judge it read one predicate.
 */
export function usageProbesFor(
  items: readonly ItemRef[],
  basis: ItemUsageBasis,
): readonly ItemUsageProbe[] {
  return distinctItemsInOrder(items).map((item) => probeFor(item, basis));
}

function probeFor(item: ItemRef, basis: ItemUsageBasis): ItemUsageProbe {
  switch (item.kind) {
    case "material":
      return {
        via: "settings-tier",
        item,
        isFallback: basis.book.material.defaultTierId === item.tierId,
      };
    case "hardware":
      return {
        via: "settings-tier",
        item,
        isFallback: basis.book.hardware.defaultTierId === item.tierId,
      };
    case "finish":
    case "handle":
      return migratedDesignProbe(item, basis);
    case "accessory":
      return accessoryProbe(item, basis);
  }
}

function accessoryProbe(
  item: Extract<ItemRef, { readonly kind: "accessory" }>,
  basis: ItemUsageBasis,
): ItemUsageProbe {
  if (isBuiltInAccessoryId(item.accessoryId)) {
    return migratedDesignProbe(item, basis);
  }
  const rule = basis.book.linkedAccessories.find(
    ({ accessoryId }) => accessoryId === item.accessoryId,
  );
  return {
    via: "placed-bodies",
    item,
    buildIds:
      rule === undefined
        ? []
        : buildIdsPricedAs(basis.catalog, rule.linkedBuildId),
  };
}

function migratedDesignProbe(
  item: ItemRef,
  { catalog, book }: ItemUsageBasis,
): ItemUsageProbe {
  return {
    via: "migrated-design",
    item,
    isUsedBy: (design) => usesItem({ design, item, catalog, book }),
  };
}
