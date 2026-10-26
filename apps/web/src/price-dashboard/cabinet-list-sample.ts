import type {
  DraftChange,
  PriceGroupCode,
} from "@lemnaria/configurator-domain";

import roMessages from "@/messages/ro.json";

import type {
  CabinetDefaultPrice,
  CabinetListInput,
  CabinetRuleFacts,
  CabinetWidthFacts,
} from "./cabinet-list-model";

// Invented facts for the list while nothing supplies the real ones. Every figure is made up, like `SAMPLE_PRICE_BOOK`'s,
// and every name is the catalogue's Romanian one, read from the message file. It stands behind `readCabinetList` outside a
// production build only, and goes with that stub.

type CatalogEntryId = keyof typeof roMessages.catalog.entries;

const CORNER_KINDS = roMessages.catalog.kinds;
const STRUCTURAL_WALL_ROW_HEIGHT_MM = 350;
const WALL_ROW_HEIGHT_MM = 700;

function nameOfEntry(buildId: CatalogEntryId): string {
  return roMessages.catalog.entries[buildId];
}

function rangeOf(
  minMm: number,
  maxMm: number,
  defaultMm: number,
  options: Partial<CabinetWidthFacts> = {},
): CabinetWidthFacts {
  return {
    range: { kind: "range", minMm, maxMm },
    defaultMm,
    isDefaultFollowingBase: false,
    isDefaultProposed: false,
    ...options,
  };
}

function fixedOf(...widthsMm: number[]): CabinetWidthFacts {
  return {
    range: { kind: "fixed", widthsMm },
    defaultMm: widthsMm.at(-1) ?? 0,
    isDefaultFollowingBase: false,
    isDefaultProposed: false,
  };
}

function priceOf(
  widthMm: number,
  activeMinor: number,
  options: { pendingMinor?: number; heightMm?: number } = {},
): CabinetDefaultPrice {
  return {
    widthMm,
    activeMinor,
    pendingMinor: options.pendingMinor ?? activeMinor,
    ...(options.heightMm === undefined ? {} : { heightMm: options.heightMm }),
  };
}

interface SampleCabinet {
  readonly buildId: string;
  readonly name: string;
  readonly group: PriceGroupCode;
  readonly widths: CabinetWidthFacts;
  readonly price?: CabinetDefaultPrice;
  readonly isStructural?: boolean;
  readonly isCustomerSupplied?: boolean;
}

function ruleOf(cabinet: SampleCabinet): CabinetRuleFacts {
  return {
    ruleId: `cabinet.${cabinet.buildId}`,
    buildId: cabinet.buildId,
    name: cabinet.name,
    group: cabinet.group,
    widths: cabinet.widths,
    isStructural: cabinet.isStructural ?? false,
    isCustomerSupplied: cabinet.isCustomerSupplied ?? false,
    ...(cabinet.price === undefined ? {} : { price: cabinet.price }),
  };
}

const SAMPLE_CABINETS: readonly SampleCabinet[] = [
  {
    buildId: "base-cabinet",
    name: nameOfEntry("base-cabinet"),
    group: "base",
    widths: rangeOf(200, 800, 600),
    price: priceOf(600, 145_000, { pendingMinor: 150_000 }),
  },
  {
    buildId: "base-3drawer",
    name: nameOfEntry("base-3drawer"),
    group: "base",
    widths: rangeOf(300, 800, 600),
    price: priceOf(600, 210_000),
  },
  {
    buildId: "base-panbank",
    name: nameOfEntry("base-panbank"),
    group: "base",
    widths: rangeOf(300, 800, 600, { isDefaultProposed: true }),
    price: priceOf(600, 200_000),
  },
  {
    buildId: "base-hob-2drawer",
    name: nameOfEntry("base-hob-2drawer"),
    group: "base",
    widths: fixedOf(600),
    price: priceOf(600, 240_000),
  },
  {
    buildId: "base-hob-oven",
    name: nameOfEntry("base-hob-oven"),
    group: "base",
    widths: fixedOf(600),
    price: priceOf(600, 130_000),
  },
  {
    buildId: "base-bottle-cargo",
    name: nameOfEntry("base-bottle-cargo"),
    group: "base",
    widths: fixedOf(200, 300),
    price: priceOf(300, 290_000),
  },
  {
    buildId: "base-sink",
    name: nameOfEntry("base-sink"),
    group: "base",
    widths: rangeOf(560, 800, 600),
    price: priceOf(600, 140_000),
  },
  {
    buildId: "base-dishwasher",
    name: nameOfEntry("base-dishwasher"),
    group: "base",
    widths: fixedOf(450, 600),
    price: priceOf(600, 80_000),
  },
  {
    buildId: "wall-cabinet",
    name: nameOfEntry("wall-cabinet"),
    group: "wall",
    widths: rangeOf(200, 800, 600, { isDefaultFollowingBase: true }),
    price: priceOf(600, 95_000, { heightMm: WALL_ROW_HEIGHT_MM }),
  },
  {
    buildId: "wall-lift",
    name: nameOfEntry("wall-lift"),
    group: "wall",
    widths: rangeOf(300, 800, 600, { isDefaultProposed: true }),
    price: priceOf(600, 170_000, { heightMm: WALL_ROW_HEIGHT_MM }),
  },
  {
    buildId: "open-shelf",
    name: nameOfEntry("open-shelf"),
    group: "wall",
    widths: rangeOf(300, 800, 600, { isDefaultProposed: true }),
    price: priceOf(600, 60_000, { heightMm: WALL_ROW_HEIGHT_MM }),
  },
  {
    buildId: "hood",
    name: nameOfEntry("hood"),
    group: "wall",
    widths: rangeOf(600, 800, 600, { isDefaultProposed: true }),
    isCustomerSupplied: true,
  },
  {
    buildId: "tall-pantry",
    name: nameOfEntry("tall-pantry"),
    group: "tall",
    widths: rangeOf(400, 800, 600),
    price: priceOf(600, 420_000),
  },
  {
    buildId: "tall-oven-tower",
    name: nameOfEntry("tall-oven-tower"),
    group: "tall",
    widths: fixedOf(600),
    price: priceOf(600, 520_000),
  },
  {
    buildId: "tall-fridge-housing",
    name: nameOfEntry("tall-fridge-housing"),
    group: "tall",
    widths: fixedOf(600),
    price: priceOf(600, 390_000),
  },
  {
    buildId: "fridge-free",
    name: nameOfEntry("fridge-free"),
    group: "tall",
    widths: fixedOf(700),
    isCustomerSupplied: true,
  },
  {
    buildId: "base-corner-x-900",
    name: `${CORNER_KINDS.corner_base_x} 900`,
    group: "corner",
    widths: fixedOf(900),
    isStructural: true,
    price: priceOf(900, 320_000),
  },
  {
    buildId: "base-corner-return-320",
    name: `${CORNER_KINDS.corner_base_return} 320`,
    group: "corner",
    widths: fixedOf(320),
    isStructural: true,
    price: priceOf(320, 50_000),
  },
  {
    buildId: "wall-corner-return-570",
    name: `${CORNER_KINDS.corner_wall_return} 570`,
    group: "corner",
    widths: fixedOf(570),
    isStructural: true,
    price: priceOf(570, 150_000, { heightMm: WALL_ROW_HEIGHT_MM }),
  },
  {
    buildId: "wall-corner-return-570-top",
    name: `${CORNER_KINDS.corner_wall_return} 570 / ${String(STRUCTURAL_WALL_ROW_HEIGHT_MM)}`,
    group: "corner",
    widths: fixedOf(570),
    isStructural: true,
    price: priceOf(570, 90_000, { heightMm: STRUCTURAL_WALL_ROW_HEIGHT_MM }),
  },
  {
    buildId: "wall-corner-x-900",
    name: `${CORNER_KINDS.corner_wall_return} 900`,
    group: "corner",
    widths: fixedOf(900),
    isStructural: true,
    price: priceOf(900, 200_000, { heightMm: WALL_ROW_HEIGHT_MM }),
  },
  {
    buildId: "wall-corner-x-900-top",
    name: `${CORNER_KINDS.corner_wall_return} 900 / ${String(STRUCTURAL_WALL_ROW_HEIGHT_MM)}`,
    group: "corner",
    widths: fixedOf(900),
    isStructural: true,
    price: priceOf(900, 120_000, { heightMm: STRUCTURAL_WALL_ROW_HEIGHT_MM }),
  },
];

const RULES: readonly CabinetRuleFacts[] = SAMPLE_CABINETS.map(ruleOf);

const DRAFT_CHANGES: readonly DraftChange[] = [
  {
    address: {
      kind: "cabinet",
      ruleId: "cabinet.base-cabinet",
      field: "anchorMinor",
    },
    value: 150_000,
  },
  {
    address: {
      kind: "cabinet",
      ruleId: "cabinet.base-cabinet",
      field: "perStepWiderMinor",
    },
    value: 9_000,
  },
];

export const SAMPLE_CABINET_LIST: CabinetListInput = {
  rules: RULES,
  draft: { draftRevision: "1", changes: DRAFT_CHANGES },
};
