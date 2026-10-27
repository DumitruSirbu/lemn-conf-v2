import {
  applyChanges,
  isSameAddress,
  readEditableFields,
  type AppliedAddress,
  type CabinetPriceRule,
  type DraftBulk,
  type DraftChange,
  type PercentageMaterialTier,
  type PriceBook,
  type TierIdentity,
} from "@lemnaria/configurator-domain";

import { shippedPriceBook } from "@/lib/server/shipped-price-book";
import roMessages from "@/messages/ro.json";

import { sampleVersionIdOf } from "./publish-sample-client";
import type {
  PriceVersionSummaryWire,
  PriceVersionWire,
} from "./price-dashboard-wire-contract";
import type { PublishPageInput, VersionDetailInput } from "./publish-model";

// Invented data for builds that show samples; every book goes through `applyChanges`. Reached only through the sources.

/** The book the application ships, in its flat form: what the sample restates in the percentage form. */
const FLAT_BOOK: PriceBook = shippedPriceBook();

const ANCHOR_WIDTH_MM = 600;
const FIRST_ANCHOR_MINOR = 100_000;
const ANCHOR_STEP_BETWEEN_RULES_MINOR = 10_000;
const STEP_WIDER_MINOR = 8_000;
const STEP_NARROWER_MINOR = 6_000;
const MATERIAL_PERCENTS = [0, 25, 60] as const;
const DEEP_CABINET_PERCENT = 15;
const BULK_ROUNDING_MINOR = 100;
const BULK_PERCENT = 5;
const PAGE_SIZE = 20;

function anchoredRuleOf(
  rule: CabinetPriceRule,
  index: number,
): CabinetPriceRule {
  if (rule.suppliedBy === "customer") return rule;
  return {
    ...rule,
    formula: {
      shape: "anchored-width",
      anchorWidthMm: ANCHOR_WIDTH_MM,
      anchorMinor: FIRST_ANCHOR_MINOR + index * ANCHOR_STEP_BETWEEN_RULES_MINOR,
      perStepWiderMinor: STEP_WIDER_MINOR,
      perStepNarrowerMinor: STEP_NARROWER_MINOR,
    },
  };
}

function percentageTierOf(
  tier: TierIdentity,
  percentOfCabinets: number,
): PercentageMaterialTier {
  return {
    tierId: tier.tierId,
    ruleId: tier.ruleId,
    name: tier.name,
    description: tier.description,
    nameKey: tier.nameKey,
    descriptionKey: tier.descriptionKey,
    percentOfCabinets,
  };
}

/** The sample book restated in the percentage form, the only form whose cabinet, material and depth fields are editable. */
const FIRST_BOOK: PriceBook = {
  ...FLAT_BOOK,
  amountsProvisional: true,
  cabinetRules: FLAT_BOOK.cabinetRules.map(anchoredRuleOf),
  material: {
    defaultTierId: FLAT_BOOK.material.defaultTierId,
    tiers: FLAT_BOOK.material.tiers.map((tier, index) =>
      percentageTierOf(tier, MATERIAL_PERCENTS[index] ?? 0),
    ),
  },
  depthRule: { deepCabinetPercent: DEEP_CABINET_PERCENT },
};

function valueAt(book: PriceBook, address: AppliedAddress): number {
  const reading = readEditableFields(book).find((row) =>
    isSameAddress(row.address, address),
  );
  if (typeof reading?.value !== "number") {
    throw new Error("the sample book has no such number");
  }
  return reading.value;
}

function bookAfter(
  book: PriceBook,
  changes: readonly DraftChange[],
): PriceBook {
  const applied = applyChanges(book, changes);
  if (!applied.ok) throw new Error("the sample changes do not make a book");
  return applied.book;
}

function secondMaterialTierId(): string {
  const tier = FLAT_BOOK.material.tiers[1];
  if (tier === undefined) throw new Error("the sample book has no upgrade");
  return tier.tierId;
}

function hardwareTierId(index: number): string {
  const tier = FLAT_BOOK.hardware.tiers[index];
  if (tier === undefined) throw new Error("the sample book lacks a class");
  return tier.tierId;
}

function firstAnchorChange(buildId: string, value: number): DraftChange {
  return {
    address: {
      kind: "cabinet",
      ruleId: `cabinet.${buildId}`,
      field: "anchorMinor",
    },
    value,
  };
}

const SECOND_CHANGES: readonly DraftChange[] = [
  {
    address: {
      kind: "material",
      tierId: secondMaterialTierId(),
      field: "percentOfCabinets",
    },
    value: 20,
  },
];
const SECOND_BOOK = bookAfter(FIRST_BOOK, SECOND_CHANGES);

const THIRD_CHANGES: readonly DraftChange[] = [
  {
    address: {
      kind: "material",
      tierId: secondMaterialTierId(),
      field: "percentOfCabinets",
    },
    value: 25,
  },
  firstAnchorChange("base-cabinet", 145_000),
];
const THIRD_BOOK = bookAfter(SECOND_BOOK, THIRD_CHANGES);

const FOURTH_CHANGES: readonly DraftChange[] = [
  {
    address: {
      kind: "hardware",
      tierId: hardwareTierId(1),
      field: "perDrawerMinor",
    },
    value: 11_000,
  },
];
const ACTIVE_BOOK = bookAfter(THIRD_BOOK, FOURTH_CHANGES);

function roundedToBulkUnit(minor: number): number {
  const remainder = minor % BULK_ROUNDING_MINOR;
  const lower = minor - remainder;
  return remainder * 2 >= BULK_ROUNDING_MINOR
    ? lower + BULK_ROUNDING_MINOR
    : lower;
}

function scaledByBulkPercent(minor: number): number {
  return roundedToBulkUnit((minor * (100 + BULK_PERCENT)) / 100);
}

/**
 * The one bulk action of the sample covers one cabinet, the base cabinet, beside a single change of its price: the cabinet
 * list draws its rows from the same draft and marks as modified every cabinet a change names, so a wider scope would mark
 * cabinets its facts give no new price.
 */
const BULK: DraftBulk = { percent: BULK_PERCENT, scope: "selection" };
const BULK_GROUP_ID = "bulk-sample-base";
const BULK_CABINET_RULE_ID = "cabinet.base-cabinet";

const BULK_CHANGES: readonly DraftChange[] = (
  ["perStepWiderMinor", "perStepNarrowerMinor"] as const
).map((field): DraftChange => {
  const address = {
    kind: "cabinet",
    ruleId: BULK_CABINET_RULE_ID,
    field,
  } as const;
  return {
    address,
    value: scaledByBulkPercent(valueAt(ACTIVE_BOOK, address)),
    groupId: BULK_GROUP_ID,
    bulk: BULK,
  };
});

const SAMPLE_DRAFT_CHANGES: readonly DraftChange[] = [
  firstAnchorChange("base-cabinet", 150_000),
  ...BULK_CHANGES,
  { address: { kind: "depth-rule" }, value: 18 },
  {
    address: {
      kind: "material",
      tierId: secondMaterialTierId(),
      field: "percentOfCabinets",
    },
    value: 30,
  },
  {
    address: {
      kind: "hardware",
      tierId: hardwareTierId(2),
      field: "perHingeMinor",
    },
    value: 4_500,
  },
  {
    address: {
      kind: "accessory",
      accessoryId: "dishDryingRack",
      field: "perUnitMinor",
    },
    value: 65_000,
  },
  { address: { kind: "provisional" }, value: false },
];

interface SampleVersion {
  readonly summary: PriceVersionSummaryWire;
  readonly note: string;
  readonly book: PriceBook;
  readonly changes: readonly DraftChange[];
}

function versionOf(
  sequenceNumber: number,
  published: { label: string; publishedAt: string; isActive: boolean },
  content: {
    book: PriceBook;
    changes: readonly DraftChange[];
  },
): SampleVersion {
  return {
    summary: {
      versionId: sampleVersionIdOf(sequenceNumber),
      sequenceNumber,
      label: published.label,
      state: published.isActive ? "active" : "archived",
      publishedAt: published.publishedAt,
      changeCount: content.changes.length,
    },
    note: "",
    book: content.book,
    changes: content.changes,
  };
}

const ACTIVE_VERSION = versionOf(
  4,
  {
    label: "Feronerie Blum, tarife noi",
    publishedAt: "2026-10-20T08:00:00.000Z",
    isActive: true,
  },
  { book: ACTIVE_BOOK, changes: FOURTH_CHANGES },
);

/** Oldest first. The last is the active version. */
const VERSIONS: readonly SampleVersion[] = [
  versionOf(
    1,
    {
      label: "Lista completa",
      publishedAt: "2026-07-24T08:00:00.000Z",
      isActive: false,
    },
    { book: FIRST_BOOK, changes: [] },
  ),
  versionOf(
    2,
    {
      label: "Material MDF",
      publishedAt: "2026-09-18T08:00:00.000Z",
      isActive: false,
    },
    { book: SECOND_BOOK, changes: SECOND_CHANGES },
  ),
  versionOf(
    3,
    {
      label: "Scumpire MDF",
      publishedAt: "2026-10-06T08:00:00.000Z",
      isActive: false,
    },
    { book: THIRD_BOOK, changes: THIRD_CHANGES },
  ),
  ACTIVE_VERSION,
];

const CABINET_NAMES: Readonly<Record<string, string>> =
  roMessages.catalog.entries;

export const SAMPLE_PUBLISH_PAGE: PublishPageInput = {
  state: {
    active: {
      versionId: ACTIVE_VERSION.summary.versionId,
      book: ACTIVE_BOOK,
      availability: { revision: "0", disabled: [] },
      sequenceNumber: ACTIVE_VERSION.summary.sequenceNumber,
      label: ACTIVE_VERSION.summary.label,
      publishedAt: ACTIVE_VERSION.summary.publishedAt,
    },
    draft: { draftRevision: "1", changes: SAMPLE_DRAFT_CHANGES },
  },
  versions: {
    total: VERSIONS.length,
    page: 1,
    pageSize: PAGE_SIZE,
    versions: VERSIONS.map((version) => version.summary).reverse(),
  },
  cabinetNames: CABINET_NAMES,
};

/** The sample version with this id, read with its predecessor and the active version; absent for an id nobody holds. */
export function sampleVersionDetail(
  versionId: string,
): VersionDetailInput | undefined {
  const index = VERSIONS.findIndex(
    (version) => version.summary.versionId === versionId,
  );
  const held = VERSIONS[index];
  if (held === undefined) return undefined;
  const predecessor = VERSIONS[index - 1];
  const {
    versionId: id,
    sequenceNumber,
    label,
    state,
    publishedAt,
  } = held.summary;
  const version: PriceVersionWire = {
    versionId: id,
    sequenceNumber,
    label,
    state,
    publishedAt,
    note: held.note,
    book: held.book,
    changes: held.changes,
  };
  return {
    version,
    predecessor:
      predecessor === undefined
        ? undefined
        : {
            sequenceNumber: predecessor.summary.sequenceNumber,
            book: predecessor.book,
          },
    active: {
      sequenceNumber: ACTIVE_VERSION.summary.sequenceNumber,
      book: ACTIVE_BOOK,
    },
    draft: SAMPLE_PUBLISH_PAGE.state.draft,
    cabinetNames: CABINET_NAMES,
  };
}
