// Wave H1b (M10): the kitchen handle reaches every reader together. Price (`countHardwareMechanisms`), panel
// (`describeSelection`) and the record the scene resolves from (`derivePlacementRecords`) are asked, for every
// placement of a random design under every kitchen handle, what that body wears. ADR 0092 Amendment C: they
// must never split. The scene's own half is measured on meshes in `three-adapter/tests`.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  countHardwareMechanisms,
  derivePlacementRecords,
  describeSelection,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  kitchenHandleSettingsOf,
  projectDesignForDisplay,
  resolvedHandleAt,
  type BodyCatalog,
  type Design,
  type DisplayEntry,
  type Handle,
  type PlacementRecord,
  type SelectionMeta,
} from "../../src/index.js";
import {
  documentsWithNoKitchenHandle,
  type NamedDocument,
} from "./handle-document-facts.js";

const POOL: readonly NamedDocument[] = documentsWithNoKitchenHandle().filter(
  (document) => !document.name.endsWith("+own-handles"),
);
const EVERY_KITCHEN_HANDLE: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];
const OWN_CHOICES = fc.constantFrom<Handle | undefined>(
  undefined,
  "steel",
  "black",
  "push",
);
const KITCHEN_CHOICES = fc.constantFrom<Handle | undefined>(
  ...EVERY_KITCHEN_HANDLE,
);

/** §6.5's module line, written out as a literal: the oracle must not read the constant under test. */
const TOP_ROW_FLOOR_MM = 2_200;

function withKitchenHandle(design: Design, handle: Handle | undefined): Design {
  if (handle === undefined) return design;
  return { ...design, settings: { ...design.settings, handle } };
}

function withOwnHandles(
  design: Design,
  choices: readonly (Handle | undefined)[],
): Design {
  const placements = design.placements.map((placement, index) => {
    const own = choices[index % choices.length];
    if (own === undefined) return placement;
    return { ...placement, body: { ...placement.body, handle: own } };
  });
  return { ...design, placements };
}

function entriesOf(design: Design, catalog: BodyCatalog): DisplayEntry[] {
  return projectDesignForDisplay(design, catalog).flatMap(
    (group) => group.entries,
  );
}

function recordsOf(design: Design, catalog: BodyCatalog): PlacementRecord[] {
  return derivePlacementRecords(design, catalog);
}

function metaOf(
  design: Design,
  catalog: BodyCatalog,
  record: PlacementRecord,
): SelectionMeta {
  const meta = describeSelection({
    records: recordsOf(design, catalog),
    voids: [],
    catalog,
    target: { kind: "placement", id: record.id },
    kitchenSettings: kitchenHandleSettingsOf(design.settings),
  });
  if (!meta) throw new Error(`no meta for "${record.id}"`);
  return meta;
}

function frontsOf(entry: DisplayEntry, catalog: BodyCatalog): number {
  const query = frontPopulationQueryFor({
    body: entry,
    definition: catalog.get(entry.buildId) ?? {},
  });
  return doorLeafHeightsMm(query).length + drawerCount(query);
}

/** What the price says: this one body is billed a latch. */
function priceLatches(entry: DisplayEntry, catalog: BodyCatalog): boolean {
  return countHardwareMechanisms([entry], catalog).pushToOpen > 0;
}

/** What the panel says the body wears: the chip it marks, which is the cabinet's own handle, else what it
 *  follows. A body that takes no handle is marked with the slot's default. */
function panelWears(meta: SelectionMeta): Handle {
  return meta.canHandle
    ? (meta.handle ?? meta.defaultHandle)
    : meta.defaultHandle;
}

/** What a mounted scene reads, minus the meshes: the record's own handle and the settings it carries. */
function recordWears(record: PlacementRecord): Handle | undefined {
  return resolvedHandleAt({
    y0Mm: Math.round(record.frame.y0 * 1000),
    recordedHandle: record.handleMode,
    kitchenSettings: record.kitchenSettings,
    canHandle: record.canHandle,
  });
}

const randomDesign = fc.record({
  document: fc.constantFrom(...POOL),
  own: fc.array(OWN_CHOICES, { minLength: 1, maxLength: 12 }),
  kitchen: KITCHEN_CHOICES,
});

describe("price, panel and scene name the same handle for every body", () => {
  propertyTest.prop([randomDesign])(
    "the latch the price bills is the push the panel marks, and the record resolves the same",
    ({ document, own, kitchen }) => {
      const design = withKitchenHandle(
        withOwnHandles(document.design, own),
        kitchen,
      );
      const disagreements: string[] = [];

      for (const record of recordsOf(design, document.catalog)) {
        const entry = entriesOf(design, document.catalog).find(
          (candidate) => candidate.placementId === record.id,
        );
        if (!entry) throw new Error(`no entry for "${record.id}"`);
        if (frontsOf(entry, document.catalog) === 0) continue;
        const meta = metaOf(design, document.catalog, record);
        const latched = priceLatches(entry, document.catalog);
        const marksPush = panelWears(meta) === "push";
        const recordHides =
          recordWears(record) === "push" ||
          (recordWears(record) === undefined &&
            Math.round(record.frame.y0 * 1000) >= TOP_ROW_FLOOR_MM);
        if (latched !== marksPush || latched !== recordHides) {
          disagreements.push(
            `${record.id}: price ${String(latched)}, panel ${String(marksPush)}, record ${String(recordHides)}`,
          );
        }
      }

      expect(disagreements).toEqual([]);
    },
  );

  propertyTest.prop([randomDesign])(
    "a body taking a handle wears the panel's chip in the record too, and the black one is the same body",
    ({ document, own, kitchen }) => {
      const design = withKitchenHandle(
        withOwnHandles(document.design, own),
        kitchen,
      );

      const disagreeing = recordsOf(design, document.catalog)
        .filter((record) => record.canHandle)
        .filter(
          (record) =>
            recordWears(record) !==
            panelWears(metaOf(design, document.catalog, record)),
        )
        .map((record) => record.id);

      expect(disagreeing).toEqual([]);
    },
  );

  it("swept over the pool, each handle moves the three readers on some body (the property is not vacuous)", () => {
    for (const handle of ["push", "black"] as const) {
      const document = POOL[0];
      if (!document) throw new Error("empty pool");
      const design = withKitchenHandle(document.design, handle);
      const followers = recordsOf(design, document.catalog).filter(
        (record) =>
          record.canHandle &&
          record.handleMode === undefined &&
          Math.round(record.frame.y0 * 1000) < TOP_ROW_FLOOR_MM,
      );

      expect(followers.length).toBeGreaterThan(0);
      for (const record of followers) {
        expect(recordWears(record)).toBe(handle);
        expect(panelWears(metaOf(design, document.catalog, record))).toBe(
          handle,
        );
      }
    }
  });
});

describe("a kitchen handle is followed by a cabinet that chose none, below the top row, and by no one else", () => {
  propertyTest.prop([randomDesign])(
    "the record keeps the cabinet's own handle, and the top row never wears the kitchen's",
    ({ document, own, kitchen }) => {
      const base = withOwnHandles(document.design, own);
      const design = withKitchenHandle(base, kitchen);
      const baseRecords = recordsOf(base, document.catalog);

      const records = recordsOf(design, document.catalog);

      expect(records.map((record) => record.handleMode)).toEqual(
        baseRecords.map((record) => record.handleMode),
      );
      for (const record of records) {
        const isTopRow = Math.round(record.frame.y0 * 1000) >= TOP_ROW_FLOOR_MM;
        if (isTopRow && record.canHandle && record.handleMode === undefined) {
          expect(recordWears(record)).toBe("push");
        }
      }
    },
  );
});

describe("a legacy null own handle behaves exactly like an absent one", () => {
  propertyTest.prop([randomDesign])(
    "resolves, prices and describes the same, under any kitchen handle",
    ({ document, own, kitchen }) => {
      const withAbsent = withKitchenHandle(
        withOwnHandles(document.design, own),
        kitchen,
      );
      const nulled = nullTheAbsent(withAbsent);

      expect(recordsOf(nulled, document.catalog)).toEqual(
        recordsOf(withAbsent, document.catalog),
      );
      expect(entriesOf(nulled, document.catalog)).toEqual(
        entriesOf(withAbsent, document.catalog),
      );
      expect(
        countHardwareMechanisms(
          entriesOf(nulled, document.catalog),
          document.catalog,
        ),
      ).toEqual(
        countHardwareMechanisms(
          entriesOf(withAbsent, document.catalog),
          document.catalog,
        ),
      );
      for (const record of recordsOf(nulled, document.catalog)) {
        expect(metaOf(nulled, document.catalog, record)).toEqual(
          metaOf(withAbsent, document.catalog, record),
        );
      }
    },
  );

  it("a null on a seeded body reads as the kitchen's handle, not as a recorded one", () => {
    const document = POOL[0];
    if (!document) throw new Error("empty pool");
    const nulled = nullTheAbsent(withKitchenHandle(document.design, "push"));

    const record = recordsOf(nulled, document.catalog).find(
      (candidate) =>
        candidate.canHandle &&
        Math.round(candidate.frame.y0 * 1000) < TOP_ROW_FLOOR_MM,
    );

    expect(record?.handleMode).toBeUndefined();
    expect(record && "handleMode" in record).toBe(false);
  });
});

/** Writes `handle: null` onto every placement whose body carries no handle, the shape a legacy document can have. */
function nullTheAbsent(design: Design): Design {
  const placements = design.placements.map((placement) =>
    placement.body.handle === undefined
      ? {
          ...placement,
          body: { ...placement.body, handle: null as unknown as Handle },
        }
      : placement,
  );
  return { ...design, placements };
}
