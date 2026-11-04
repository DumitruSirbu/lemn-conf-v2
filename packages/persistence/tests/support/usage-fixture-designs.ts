import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  PALETTE_ENTRY_IDS,
  SAMPLE_PRICE_BOOK,
  buildIdsPricedAs,
  paletteFinish,
  pricedAsBuildId,
} from "@lemnaria/configurator-domain";
import type {
  Design,
  ItemRef,
  LinkedAccessoryRule,
  PriceBook,
} from "@lemnaria/configurator-domain";

import type { ItemUsageBasis } from "../../src/item-usage-probes.js";

// The designs the usage reader's counts are checked against `usesItem` over, the basis they are counted under, and the
// items asked about. Shared by the offline parity test, which feeds the reader these rows through a recording driver, and
// by the live one, which writes them to the test database.

export interface UsageFixtureDesign {
  readonly name: string;
  readonly schemaVersion: number;
  /** The stored document: JSON, as the column holds it. */
  readonly document: unknown;
  readonly isDeletedByClient: boolean;
}

const CATALOG = KITCHEN_L_BODY_CATALOG;
const DEPTH_MM = 600;

function documentOf(design: Design): unknown {
  return JSON.parse(JSON.stringify(design)) as unknown;
}

function firstPlacementWhere(
  canFinish: boolean,
  canHandle: boolean,
): Design["placements"][number] {
  const found = KITCHEN_L_DESIGN.placements.find((placement) => {
    const definition = CATALOG.get(placement.body.buildId);
    return (
      definition?.canFinish === canFinish && definition.canHandle === canHandle
    );
  });
  if (found === undefined) throw new Error("the seeded kitchen lacks a body");
  return found;
}

const CUSTOMISABLE_PLACEMENT_ID = firstPlacementWhere(true, true).id;
const PLAIN_PLACEMENT_ID = firstPlacementWhere(false, false).id;

function withSettings(settings: NonNullable<Design["settings"]>): Design {
  return { ...KITCHEN_L_DESIGN, settings };
}

function withBodyOf(
  placementId: string,
  amendment: Partial<Design["placements"][number]["body"]>,
  base: Design = KITCHEN_L_DESIGN,
): Design {
  return {
    ...base,
    placements: base.placements.map((placement) =>
      placement.id === placementId
        ? { ...placement, body: { ...placement.body, ...amendment } }
        : placement,
    ),
  };
}

/** `JSON.stringify` leaves out a key that is `undefined`, as the stored document of the earliest versions did. */
function withoutSettings(design: Design): unknown {
  return documentOf({ ...design, settings: undefined });
}

/** A body the catalogue prices as another row: a placement of it earns what a placement of that row earns. */
const SEEDED_PLACEMENT = KITCHEN_L_DESIGN.placements.find(
  (placement) =>
    pricedAsBuildId(CATALOG, placement.body.buildId) !== placement.body.buildId,
);
if (SEEDED_PLACEMENT === undefined) {
  throw new Error("the seeded kitchen places no body priced as an equivalent");
}
const EQUIVALENT_ROW_ID = pricedAsBuildId(
  CATALOG,
  SEEDED_PLACEMENT.body.buildId,
);
const UNPLACED_ROW_ID = [...CATALOG.keys()].find(
  (buildId) =>
    !KITCHEN_L_DESIGN.placements.some(
      ({ body }) => pricedAsBuildId(CATALOG, body.buildId) === buildId,
    ),
);
if (UNPLACED_ROW_ID === undefined) {
  throw new Error("the seeded kitchen places a body of every row");
}

function linkedRule(
  accessoryId: string,
  linkedBuildId: string,
): LinkedAccessoryRule {
  return {
    accessoryId,
    ruleId: `accessory.${accessoryId}`,
    linkedBuildId,
    perUnitMinor: 12_345,
    name: `Accesoriu ${accessoryId}`,
  };
}

/** A linked accessory earned through a seeded body's equivalent, and one linked to a row no fixture places. */
export const LINKED_THROUGH_EQUIVALENT = "linked-through-equivalent";
export const LINKED_TO_AN_UNPLACED_ROW = "linked-to-an-unplaced-row";
/** An accessory id the book does not state. */
export const NOT_IN_THE_BOOK = "accessory-the-book-lacks";
/** A tier id a stored design names though the book holds no such tier. */
export const TIER_THE_BOOK_LACKS = "material.gone";

const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    linkedRule(LINKED_THROUGH_EQUIVALENT, EQUIVALENT_ROW_ID),
    linkedRule(LINKED_TO_AN_UNPLACED_ROW, UNPLACED_ROW_ID),
  ],
};

export const USAGE_BASIS: ItemUsageBasis = { catalog: CATALOG, book: BOOK };

/** The build ids a linked accessory is counted through, as the domain computes them. */
export const BUILD_IDS_OF_THE_EQUIVALENT_ROW = buildIdsPricedAs(
  CATALOG,
  EQUIVALENT_ROW_ID,
);

export const USAGE_FIXTURES: readonly UsageFixtureDesign[] = [
  {
    name: "the shipped kitchen, which names nothing",
    schemaVersion: 5,
    document: documentOf(KITCHEN_L_DESIGN),
    isDeletedByClient: false,
  },
  {
    name: "a kitchen that names a tier, a colour and handles at both levels",
    schemaVersion: 5,
    document: documentOf(
      withBodyOf(
        CUSTOMISABLE_PLACEMENT_ID,
        { finish: paletteFinish("veneer.stejar"), handle: "push" },
        withSettings({
          cabinetDepthMm: DEPTH_MM,
          materialTierId: "material.veneer",
          hardwareTierId: "hardware.premium",
          finish: paletteFinish("veneer.nuc"),
          handle: "black",
          topRowHandle: "steel",
        }),
      ),
    ),
    isDeletedByClient: false,
  },
  {
    name: "a kitchen whose only colour is one cabinet's own override",
    schemaVersion: 5,
    document: documentOf(
      withBodyOf(CUSTOMISABLE_PLACEMENT_ID, {
        finish: paletteFinish("veneer.stejar"),
      }),
    ),
    isDeletedByClient: false,
  },
  {
    name: "a colour written on a cabinet that cannot wear one",
    schemaVersion: 5,
    document: documentOf(
      withBodyOf(PLAIN_PLACEMENT_ID, { finish: paletteFinish("veneer.nuc") }),
    ),
    isDeletedByClient: false,
  },
  {
    name: "a kitchen that names a tier the book no longer holds",
    schemaVersion: 5,
    document: documentOf(
      withSettings({
        cabinetDepthMm: DEPTH_MM,
        materialTierId: TIER_THE_BOOK_LACKS,
      }),
    ),
    isDeletedByClient: false,
  },
  {
    name: "a kitchen of the earliest settings, with none stored",
    schemaVersion: 3,
    document: withoutSettings(KITCHEN_L_DESIGN),
    isDeletedByClient: false,
  },
  {
    name: "a kitchen that stored a legacy colour name on a cabinet",
    schemaVersion: 4,
    document: documentOf(
      withBodyOf(CUSTOMISABLE_PLACEMENT_ID, {
        finish:
          "white" as unknown as Design["placements"][number]["body"]["finish"],
      }),
    ),
    isDeletedByClient: false,
  },
  {
    name: "a kitchen with no cabinets",
    schemaVersion: 5,
    document: documentOf({ ...KITCHEN_L_DESIGN, placements: [] }),
    isDeletedByClient: false,
  },
  {
    name: "a deleted kitchen that names everything",
    schemaVersion: 5,
    document: documentOf(
      withSettings({
        cabinetDepthMm: DEPTH_MM,
        materialTierId: "material.veneer",
        hardwareTierId: "hardware.premium",
        finish: paletteFinish("veneer.nuc"),
        handle: "black",
      }),
    ),
    isDeletedByClient: true,
  },
];

/** Every item the parity checks ask about, one of each distinct kind of answer a book and a catalogue can give. */
export const USAGE_ITEMS: readonly ItemRef[] = [
  ...BOOK.material.tiers.map(
    ({ tierId }): ItemRef => ({ kind: "material", tierId }),
  ),
  { kind: "material", tierId: TIER_THE_BOOK_LACKS },
  ...BOOK.hardware.tiers.map(
    ({ tierId }): ItemRef => ({ kind: "hardware", tierId }),
  ),
  ...PALETTE_ENTRY_IDS.map(
    (finishId): ItemRef => ({ kind: "finish", finishId }),
  ),
  { kind: "handle", handle: "steel" },
  { kind: "handle", handle: "black" },
  { kind: "handle", handle: "push" },
  { kind: "accessory", accessoryId: "sinkProtectiveCover" },
  { kind: "accessory", accessoryId: "dishDryingRack" },
  { kind: "accessory", accessoryId: LINKED_THROUGH_EQUIVALENT },
  { kind: "accessory", accessoryId: LINKED_TO_AN_UNPLACED_ROW },
  { kind: "accessory", accessoryId: NOT_IN_THE_BOOK },
];
