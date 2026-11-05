// The designs, books and items the usage read is held against `usesItem` over, and a reader that evaluates the probes a
// route builds over real designs. The walked probes run their own predicate; the two SQL ones (a tier, a linked
// accessory) are a model of the statement's condition, not the SQL.
import { fc } from "@fast-check/vitest";

import {
  KITCHEN_L_DESIGN,
  PALETTE_ENTRY_IDS,
  SAMPLE_PRICE_BOOK,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  paletteFinish,
  pricedAsBuildId,
  isBuiltInAccessoryId,
  isItemStated,
  usesItem,
  type Design,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { ItemUsageProbe, KitchenUsageReader } from "@lemnaria/persistence";

export const CATALOG_AT_600 = buildKitchenLBodyCatalog(600);
export const MATERIAL_TIERS = SAMPLE_PRICE_BOOK.material.tiers.map(
  ({ tierId }) => tierId,
);
export const HARDWARE_TIERS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  ({ tierId }) => tierId,
);
export const TIER_THE_BOOK_LACKS = "tier.gone";
export const LINKED_IDS = ["linked-a", "linked-b", "linked-c"] as const;
export const BUILT_IN_ACCESSORIES = [
  "sinkProtectiveCover",
  "dishDryingRack",
] as const;
export const ROWS = [
  ...new Set(
    [...CATALOG_AT_600.keys()].map((buildId) =>
      pricedAsBuildId(CATALOG_AT_600, buildId),
    ),
  ),
];
export const ROW_WITH_SEEDED_EQUIVALENT = KITCHEN_L_DESIGN.placements
  .map(({ body }) => pricedAsBuildId(CATALOG_AT_600, body.buildId))
  .find(
    (row, position) =>
      row !== KITCHEN_L_DESIGN.placements[position]?.body.buildId,
  );
export const CUSTOMISABLE_PLACEMENT_ID = KITCHEN_L_DESIGN.placements.find(
  ({ body }) => CATALOG_AT_600.get(body.buildId)?.canFinish === true,
)?.id;
export const PLACEMENT_IDS = KITCHEN_L_DESIGN.placements.map(({ id }) => id);
export const HANDLES = ["steel", "black", "push"] as const;

// ---------------------------------------------------------------------------------------------------------------------
// What is generated

type PaletteEntryId = (typeof PALETTE_ENTRY_IDS)[number];

export interface DesignRecipe {
  readonly depthMm: 600 | 700;
  readonly hasSettings: boolean;
  readonly materialTierId: string | undefined;
  readonly hardwareTierId: string | undefined;
  readonly kitchenFinish: PaletteEntryId | undefined;
  readonly kitchenHandle: (typeof HANDLES)[number] | undefined;
  readonly cabinetFinish: PaletteEntryId | undefined;
  readonly removedPlacementIds: readonly string[];
}

export const aDesignRecipe: fc.Arbitrary<DesignRecipe> = fc.record({
  depthMm: fc.constantFrom(600 as const, 700 as const),
  hasSettings: fc.boolean(),
  materialTierId: fc.constantFrom(
    undefined,
    ...MATERIAL_TIERS,
    TIER_THE_BOOK_LACKS,
  ),
  hardwareTierId: fc.constantFrom(
    undefined,
    ...HARDWARE_TIERS,
    TIER_THE_BOOK_LACKS,
  ),
  kitchenFinish: fc.constantFrom(undefined, ...PALETTE_ENTRY_IDS),
  kitchenHandle: fc.constantFrom(undefined, ...HANDLES),
  cabinetFinish: fc.constantFrom(undefined, ...PALETTE_ENTRY_IDS),
  removedPlacementIds: fc.oneof(
    fc.constant<string[]>([]),
    fc.subarray(PLACEMENT_IDS, { maxLength: 3 }),
    fc.subarray(PLACEMENT_IDS),
  ),
});

export function designOf(recipe: DesignRecipe): Design {
  const placements = KITCHEN_L_DESIGN.placements
    .filter(({ id }) => !recipe.removedPlacementIds.includes(id))
    .map((placement) =>
      placement.id === CUSTOMISABLE_PLACEMENT_ID &&
      recipe.cabinetFinish !== undefined
        ? {
            ...placement,
            body: {
              ...placement.body,
              finish: paletteFinish(recipe.cabinetFinish),
            },
          }
        : placement,
    );
  if (!recipe.hasSettings) {
    return { ...KITCHEN_L_DESIGN, placements, settings: undefined };
  }
  return {
    ...KITCHEN_L_DESIGN,
    placements,
    settings: {
      cabinetDepthMm: recipe.depthMm,
      ...(recipe.materialTierId === undefined
        ? {}
        : { materialTierId: recipe.materialTierId }),
      ...(recipe.hardwareTierId === undefined
        ? {}
        : { hardwareTierId: recipe.hardwareTierId }),
      ...(recipe.kitchenFinish === undefined
        ? {}
        : { finish: paletteFinish(recipe.kitchenFinish) }),
      ...(recipe.kitchenHandle === undefined
        ? {}
        : { handle: recipe.kitchenHandle }),
    },
  };
}

export interface BookRecipe {
  readonly materialDefault: string;
  readonly hardwareDefault: string;
  readonly linked: readonly { readonly id: string; readonly row: string }[];
}

export const aBookRecipe: fc.Arbitrary<BookRecipe> = fc.record({
  materialDefault: fc.constantFrom(...MATERIAL_TIERS),
  hardwareDefault: fc.constantFrom(...HARDWARE_TIERS),
  linked: fc.uniqueArray(
    fc.record({
      id: fc.constantFrom(...LINKED_IDS),
      row: fc.constantFrom(...ROWS),
    }),
    { selector: ({ id }) => id, maxLength: LINKED_IDS.length },
  ),
});

export function bookOf(
  recipe: BookRecipe,
  base: PriceBook = SAMPLE_PRICE_BOOK,
): PriceBook {
  return {
    ...base,
    material: {
      ...base.material,
      defaultTierId: recipe.materialDefault,
    },
    hardware: {
      ...base.hardware,
      defaultTierId: recipe.hardwareDefault,
    },
    linkedAccessories: recipe.linked.map(({ id, row }) => ({
      accessoryId: id,
      ruleId: `accessory.${id}`,
      linkedBuildId: row,
      perUnitMinor: 1_000,
      name: id,
    })),
  };
}

export const ITEM_POOL: readonly ItemRef[] = [
  ...[...MATERIAL_TIERS, TIER_THE_BOOK_LACKS].map(
    (tierId): ItemRef => ({ kind: "material", tierId }),
  ),
  ...[...HARDWARE_TIERS, TIER_THE_BOOK_LACKS].map(
    (tierId): ItemRef => ({ kind: "hardware", tierId }),
  ),
  ...PALETTE_ENTRY_IDS.map(
    (finishId): ItemRef => ({ kind: "finish", finishId }),
  ),
  ...HANDLES.map((handle): ItemRef => ({ kind: "handle", handle })),
  ...[...BUILT_IN_ACCESSORIES, ...LINKED_IDS, "accessory-the-book-lacks"].map(
    (accessoryId): ItemRef => ({ kind: "accessory", accessoryId }),
  ),
];

export const someItems = fc.array(fc.constantFrom(...ITEM_POOL), {
  minLength: 1,
  maxLength: 12,
});

// ---------------------------------------------------------------------------------------------------------------------
// The reader under test, and the oracle

export function holds(probe: ItemUsageProbe, design: Design): boolean {
  switch (probe.via) {
    case "settings-tier": {
      const key =
        probe.item.kind === "material" ? "materialTierId" : "hardwareTierId";
      const stored = design.settings?.[key];
      return stored === undefined
        ? probe.isFallback
        : stored === probe.item.tierId;
    }
    case "placed-bodies":
      return design.placements.some(({ body }) =>
        probe.buildIds.includes(body.buildId),
      );
    case "migrated-design":
      return probe.isUsedBy(design);
  }
}

export function readerOver(designs: readonly Design[]): KitchenUsageReader {
  return {
    countEach: (probes) =>
      Promise.resolve({
        counts: probes.map((probe) => ({
          item: probe.item,
          designCount: designs.filter((design) => holds(probe, design)).length,
        })),
        unreadableDesigns: 0,
      }),
  };
}

/** A tier or a linked accessory the book does not state: the route answers 0 for it and asks the reader nothing. */
export function isUnstatedTierOrLinkedAccessory(
  item: ItemRef,
  book: PriceBook,
): boolean {
  const isTierOrLinked =
    item.kind === "material" ||
    item.kind === "hardware" ||
    (item.kind === "accessory" && !isBuiltInAccessoryId(item.accessoryId));
  return isTierOrLinked && !isItemStated(item, book);
}

/** `undefined` when the domain itself cannot answer for the design, which no reader could be held to. */
export function oracleCount(
  designs: readonly Design[],
  item: ItemRef,
  book: PriceBook,
): number | undefined {
  if (isUnstatedTierOrLinkedAccessory(item, book)) return 0;
  try {
    return designs.filter((design) =>
      usesItem({
        design,
        item,
        catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
        book,
      }),
    ).length;
  } catch {
    return undefined;
  }
}
