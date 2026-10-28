import {
  applyChanges,
  isSameAddress,
  readEditableFields,
  type AppliedAddress,
  type DraftBulk,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import roMessages from "@/messages/ro.json";

import { sampleVersionIdOf } from "./publish-sample-client";
import type {
  PriceVersionSummaryWire,
  PriceVersionWire,
} from "./price-dashboard-wire-contract";
import type { PublishPageInput, VersionDetailInput } from "./publish-model";

// Invented data for builds that show samples; every book goes through `applyChanges`. Reached only through the sources.

/**
 * The book the application's own root reads in a build that shows samples. It is the active version exactly as it
 * stands (percentage form, fixed-size rows kept fixed-size); the earlier versions are derived from it by `applyChanges`,
 * so no module here restates the sample's figures. Read through the one root, so this module names no book of its own.
 */
const ROOT_BOOK: PriceBook = await readRootBook();

async function readRootBook(): Promise<PriceBook> {
  const root = await readActivePriceBook();
  if (root.kind !== "active") {
    throw new Error("the application's own root holds no book to show");
  }
  return root.book;
}

const BULK_ROUNDING_MINOR = 100;
const BULK_PERCENT = 5;
const PAGE_SIZE = 20;

/** How the history differs from the root: it is the root walked backwards, so the active version stays the root. The
 *  drawer rate stood above the root at version 3; the others stood below it. */
const DRAWER_ABOVE_ROOT_AT_V3_MINOR = 5_000;
const MDF_PERCENT_BELOW_ROOT_AT_V2 = 3;
const MDF_PERCENT_BELOW_ROOT_AT_V1 = 8;
const BASE_ANCHOR_BELOW_ROOT_AT_V2_MINOR = 10_000;

/** The pending draft: figures chosen to show a rise, a cut and a new depth rule beside one bulk action. */
const DRAFT_ANCHOR_ABOVE_ROOT_MINOR = 6_000;
const DRAFT_DEPTH_PERCENT = 18;
const DRAFT_MDF_PERCENT = 30;
const DRAFT_BLUM_HINGE_MINOR = 4_500;
const DRAFT_DRYING_RACK_MINOR = 65_000;

const BASE_CABINET_RULE_ID = "cabinet.base-cabinet";

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

/** The id of the root's tier at this position in its group. */
function tierIdAt(group: "hardware" | "material", index: number): string {
  const tier = ROOT_BOOK[group].tiers[index];
  if (tier === undefined) {
    throw new Error(`the sample book has no ${group} tier ${String(index)}`);
  }
  return tier.tierId;
}

/** The three kinds of address the history edits, each of which takes a whole number. */
type NumberAddress = Extract<
  AppliedAddress,
  { readonly kind: "cabinet" | "material" | "hardware" }
>;

const BASE_ANCHOR: NumberAddress = {
  kind: "cabinet",
  ruleId: BASE_CABINET_RULE_ID,
  field: "anchorMinor",
};
const SECOND_MATERIAL_PERCENT: NumberAddress = {
  kind: "material",
  tierId: tierIdAt("material", 1),
  field: "percentOfCabinets",
};
const SECOND_HARDWARE_DRAWER: NumberAddress = {
  kind: "hardware",
  tierId: tierIdAt("hardware", 1),
  field: "perDrawerMinor",
};

/** The union of `DraftChange` pairs each kind with its own value type; every kind in `NumberAddress` takes a number. */
function changeTo(address: NumberAddress, value: number): DraftChange {
  return { address, value } as DraftChange;
}

function rootValueOffsetBy(address: NumberAddress, offset: number): number {
  return valueAt(ROOT_BOOK, address) + offset;
}

// Newest first. Each version's changes stand right before the book that version published, which is also the book the
// next version started from.
const FOURTH_CHANGES: readonly DraftChange[] = [
  changeTo(
    SECOND_HARDWARE_DRAWER,
    rootValueOffsetBy(SECOND_HARDWARE_DRAWER, 0),
  ),
];

const THIRD_CHANGES: readonly DraftChange[] = [
  changeTo(
    SECOND_MATERIAL_PERCENT,
    rootValueOffsetBy(SECOND_MATERIAL_PERCENT, 0),
  ),
  changeTo(BASE_ANCHOR, rootValueOffsetBy(BASE_ANCHOR, 0)),
];
const THIRD_BOOK = bookAfter(ROOT_BOOK, [
  changeTo(
    SECOND_HARDWARE_DRAWER,
    rootValueOffsetBy(SECOND_HARDWARE_DRAWER, DRAWER_ABOVE_ROOT_AT_V3_MINOR),
  ),
]);

const SECOND_CHANGES: readonly DraftChange[] = [
  changeTo(
    SECOND_MATERIAL_PERCENT,
    rootValueOffsetBy(SECOND_MATERIAL_PERCENT, -MDF_PERCENT_BELOW_ROOT_AT_V2),
  ),
];
const SECOND_BOOK = bookAfter(THIRD_BOOK, [
  ...SECOND_CHANGES,
  changeTo(
    BASE_ANCHOR,
    rootValueOffsetBy(BASE_ANCHOR, -BASE_ANCHOR_BELOW_ROOT_AT_V2_MINOR),
  ),
]);

const FIRST_BOOK = bookAfter(SECOND_BOOK, [
  changeTo(
    SECOND_MATERIAL_PERCENT,
    rootValueOffsetBy(SECOND_MATERIAL_PERCENT, -MDF_PERCENT_BELOW_ROOT_AT_V1),
  ),
]);

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

const BULK_CHANGES: readonly DraftChange[] = (
  ["perStepWiderMinor", "perStepNarrowerMinor"] as const
).map((field): DraftChange => {
  const address = {
    kind: "cabinet",
    ruleId: BASE_CABINET_RULE_ID,
    field,
  } as const;
  return {
    address,
    value: scaledByBulkPercent(valueAt(ROOT_BOOK, address)),
    groupId: BULK_GROUP_ID,
    bulk: BULK,
  };
});

const SAMPLE_DRAFT_CHANGES: readonly DraftChange[] = [
  changeTo(
    BASE_ANCHOR,
    rootValueOffsetBy(BASE_ANCHOR, DRAFT_ANCHOR_ABOVE_ROOT_MINOR),
  ),
  ...BULK_CHANGES,
  { address: { kind: "depth-rule" }, value: DRAFT_DEPTH_PERCENT },
  changeTo(SECOND_MATERIAL_PERCENT, DRAFT_MDF_PERCENT),
  {
    address: {
      kind: "hardware",
      tierId: tierIdAt("hardware", 2),
      field: "perHingeMinor",
    },
    value: DRAFT_BLUM_HINGE_MINOR,
  },
  {
    address: {
      kind: "accessory",
      accessoryId: "dishDryingRack",
      field: "perUnitMinor",
    },
    value: DRAFT_DRYING_RACK_MINOR,
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
  { book: ROOT_BOOK, changes: FOURTH_CHANGES },
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
      book: ROOT_BOOK,
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
      book: ROOT_BOOK,
    },
    draft: SAMPLE_PUBLISH_PAGE.state.draft,
    cabinetNames: CABINET_NAMES,
  };
}
