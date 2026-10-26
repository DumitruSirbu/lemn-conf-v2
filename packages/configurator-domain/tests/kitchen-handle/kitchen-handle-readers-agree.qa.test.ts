// **Wave H1b QA (M10): the readers are held to a rule written out from its words, not to each other.**
//
// `kitchen-handle-readers-agree.property.test.ts` asks the price, the panel and the record whether they agree. Three
// readers sharing one wrong resolver would still agree, so this file adds the independent half: an oracle written
// here (own handle, else the kitchen's below the top row, else steel; the top row is push at the literal 2200 mm line;
// a body that takes no handle never wears one) that the price's latch count, the panel's marked chip and the record's
// answer are each held to, with floors dealt around the line (2199 / 2200 / 2201), and the one derivation of the
// line held to the floor the scene reads (`toMillimetres(frame.y0)`) at every whole millimetre around it.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import {
  countHardwareMechanisms,
  derivePlacementRecords,
  describeSelection,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  kitchenHandleSettingsOf,
  ownHandleOf,
  projectDesignForDisplay,
  resolvedHandleAt,
  toMillimetres,
  type BodyCatalog,
  type Design,
  type DesignPlacement,
  type DisplayEntry,
  type Handle,
  type PlacementRecord,
} from "../../src/index.js";
import {
  documentsWithNoKitchenHandle,
  type NamedDocument,
} from "./handle-document-facts.js";

/** §6.5's module line, written out: the oracle must not read the constant under test. */
const MODULE_LINE_MM = 2_200;
const POOL: readonly NamedDocument[] = documentsWithNoKitchenHandle();
const HANDLE_CHOICES: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];
const handleChoice = fc.constantFrom<Handle | undefined>(...HANDLE_CHOICES);
const floorChoice = fc.constantFrom<number | undefined>(
  undefined,
  MODULE_LINE_MM - 1,
  MODULE_LINE_MM,
  MODULE_LINE_MM + 1,
);

interface Variation {
  readonly document: NamedDocument;
  readonly own: readonly (Handle | undefined)[];
  readonly floors: readonly (number | undefined)[];
  readonly kitchen: Handle | undefined;
}

const variation = fc.record({
  document: fc.constantFrom(...POOL),
  own: fc.array(handleChoice, { minLength: 1, maxLength: 9 }),
  floors: fc.array(floorChoice, { minLength: 1, maxLength: 7 }),
  kitchen: handleChoice,
});

function designOf({ document, own, floors, kitchen }: Variation): Design {
  const placements = document.design.placements.map((placement, index) => {
    const ownHandle = own[index % own.length] ?? placement.body.handle;
    const floor = floors[index % floors.length];
    return {
      ...placement,
      ...(floor === undefined ? {} : { y0Mm: floor }),
      body:
        ownHandle === undefined
          ? placement.body
          : { ...placement.body, handle: ownHandle },
    };
  });
  const settings =
    kitchen === undefined
      ? document.design.settings
      : { ...document.design.settings, handle: kitchen };
  return {
    ...document.design,
    placements,
    ...(settings === undefined ? {} : { settings }),
  };
}

/** What this body wears, from the rule's words; `undefined` where it takes no handle at all. */
function oracleWears(
  placement: DesignPlacement,
  canHandle: boolean,
  kitchen: Handle | undefined,
): Handle | undefined {
  if (!canHandle) return undefined;
  const isTopRow = placement.y0Mm >= MODULE_LINE_MM;
  return placement.body.handle ?? (isTopRow ? "push" : (kitchen ?? "steel"));
}

function oracleLatches(placement: DesignPlacement, wears: Handle | undefined) {
  return wears === undefined
    ? placement.y0Mm >= MODULE_LINE_MM
    : wears === "push";
}

function entriesOf(design: Design, catalog: BodyCatalog): DisplayEntry[] {
  return projectDesignForDisplay(design, catalog).flatMap(
    (group) => group.entries,
  );
}

function frontsOf(entry: DisplayEntry, catalog: BodyCatalog): number {
  const query = frontPopulationQueryFor({
    body: entry,
    definition: catalog.get(entry.buildId) ?? {},
  });
  return doorLeafHeightsMm(query).length + drawerCount(query);
}

function canHandleOf(buildId: string, catalog: BodyCatalog): boolean {
  return catalog.get(buildId)?.canHandle === true;
}

describe("the readers are held to the rule written out, not to each other", () => {
  propertyTest.prop([variation])(
    "the hardware line's latch count is the oracle's, with floors dealt around the module line",
    (vary) => {
      const design = designOf(vary);
      const { catalog } = vary.document;

      const expected = design.placements.reduce((total, placement) => {
        const entry = entriesOf(design, catalog).find(
          (candidate) => candidate.placementId === placement.id,
        );
        if (!entry) throw new Error(`no entry for "${placement.id}"`);
        const wears = oracleWears(
          placement,
          canHandleOf(placement.body.buildId, catalog),
          vary.kitchen,
        );
        return oracleLatches(placement, wears)
          ? total + frontsOf(entry, catalog)
          : total;
      }, 0);

      expect(
        countHardwareMechanisms(entriesOf(design, catalog), catalog).pushToOpen,
      ).toBe(expected);
    },
  );

  propertyTest.prop([variation])(
    "the panel marks, and the record resolves, what the oracle says each body wears",
    (vary) => {
      const design = designOf(vary);
      const { catalog } = vary.document;
      const records = derivePlacementRecords(design, catalog);
      const wrong: string[] = [];

      for (const placement of design.placements) {
        const record = records.find(
          (candidate) => candidate.id === placement.id,
        );
        if (!record) throw new Error(`no record for "${placement.id}"`);
        const canHandle = canHandleOf(placement.body.buildId, catalog);
        const expected = oracleWears(placement, canHandle, vary.kitchen);
        const meta = describeSelection({
          records,
          voids: [],
          catalog,
          target: { kind: "placement", id: placement.id },
          kitchenSettings: kitchenHandleSettingsOf(design.settings),
        });
        const marked = canHandle
          ? (meta?.handle ?? meta?.defaultHandle)
          : undefined;
        const recorded = resolvedHandleAt({
          y0Mm: toMillimetres(record.frame.y0),
          recordedHandle: record.handleMode,
          kitchenSettings: record.kitchenSettings,
          canHandle: record.canHandle,
        });
        if (marked !== expected || recorded !== expected) {
          wrong.push(
            `${placement.id} (${placement.body.buildId} @ ${String(placement.y0Mm)}): oracle ${String(expected)}, panel ${String(marked)}, record ${String(recorded)}`,
          );
        }
      }

      expect(wrong).toEqual([]);
    },
  );

  propertyTest.prop([variation])(
    "a top-row body that chose none is billed the same under every kitchen handle",
    (vary) => {
      const design = designOf(vary);
      const { catalog } = vary.document;
      const settingsWith = (kitchen: Handle | undefined) =>
        kitchen === undefined
          ? vary.document.design.settings
          : { ...vary.document.design.settings, handle: kitchen };

      for (const placement of design.placements) {
        if (placement.y0Mm < MODULE_LINE_MM) continue;
        if (placement.body.handle !== undefined) continue;
        const latchesUnder = (kitchen: Handle | undefined) =>
          countHardwareMechanisms(
            entriesOf(
              {
                ...design,
                placements: [placement],
                settings: settingsWith(kitchen),
              },
              catalog,
            ),
            catalog,
          );

        for (const kitchen of HANDLE_CHOICES) {
          expect(latchesUnder(kitchen)).toEqual(latchesUnder(undefined));
        }
      }
    },
  );
});

describe("the floor the scene and the panel read is the floor the price reads", () => {
  const FLOORS_MM = Array.from(
    { length: 601 },
    (_, offset) => MODULE_LINE_MM - 300 + offset,
  );

  function soloAt(buildId: string, y0Mm: number, catalog: BodyCatalog): Design {
    const definition = catalog.get(buildId);
    return {
      ...KITCHEN_L_DESIGN,
      placements: [
        {
          id: "solo",
          wall: "A",
          alongMm: 300,
          y0Mm,
          body: {
            buildId,
            widthMm: definition?.sizesMm?.[0] ?? 600,
            heightMm: definition?.nominalHeightMm ?? 700,
          },
        },
      ],
    };
  }

  it("toMillimetres(frame.y0) is the placement's y0Mm at every whole millimetre within 300 mm of the line, on every catalogue row", () => {
    const catalog = buildKitchenLBodyCatalog(600);
    const drifted: string[] = [];

    for (const buildId of catalog.keys()) {
      for (const y0Mm of FLOORS_MM) {
        const record: PlacementRecord | undefined = derivePlacementRecords(
          soloAt(buildId, y0Mm, catalog),
          catalog,
        )[0];
        const floorTheSceneReads = record
          ? toMillimetres(record.frame.y0)
          : undefined;
        if (floorTheSceneReads !== y0Mm) {
          drifted.push(
            `${buildId} @ ${String(y0Mm)} read as ${String(floorTheSceneReads)}`,
          );
        }
      }
    }

    expect(drifted).toEqual([]);
  });
});

describe("the builders' two small functions", () => {
  it.each(["steel", "black", "push"] as const)(
    "ownHandleOf keeps a recorded %s",
    (handle) => {
      expect(ownHandleOf(handle)).toBe(handle);
    },
  );

  it("ownHandleOf reads an absent own handle and a legacy null as no choice", () => {
    expect(ownHandleOf(undefined)).toBeUndefined();
    expect(ownHandleOf(null as unknown as Handle)).toBeUndefined();
  });

  it("kitchenHandleSettingsOf carries the handle alone, whatever else the settings hold", () => {
    expect(kitchenHandleSettingsOf(undefined)).toEqual({});
    expect(kitchenHandleSettingsOf({})).toEqual({});
    expect(
      kitchenHandleSettingsOf({ handle: "black", cabinetDepthMm: 600 }),
    ).toStrictEqual({ handle: "black" });
  });

  it("kitchenHandleSettingsOf never states an absent handle as a key", () => {
    expect("handle" in kitchenHandleSettingsOf({ cabinetDepthMm: 600 })).toBe(
      false,
    );
  });
});

describe("a legacy null own handle reaches no reader as a choice", () => {
  const nulled = (design: Design): Design => ({
    ...design,
    placements: design.placements.map((placement) => ({
      ...placement,
      body: { ...placement.body, handle: null as unknown as Handle },
    })),
  });

  it.each(HANDLE_CHOICES)(
    "under kitchen %s every body follows the kitchen as if the key were absent, in the record, the entry and the count",
    (kitchen) => {
      const document = POOL[0];
      if (!document) throw new Error("empty pool");
      const absent: Design =
        kitchen === undefined
          ? document.design
          : {
              ...document.design,
              settings: { ...document.design.settings, handle: kitchen },
            };

      expect(derivePlacementRecords(nulled(absent), document.catalog)).toEqual(
        derivePlacementRecords(absent, document.catalog),
      );
      expect(entriesOf(nulled(absent), document.catalog)).toEqual(
        entriesOf(absent, document.catalog),
      );
      expect(
        countHardwareMechanisms(
          entriesOf(nulled(absent), document.catalog),
          document.catalog,
        ),
      ).toEqual(
        countHardwareMechanisms(
          entriesOf(absent, document.catalog),
          document.catalog,
        ),
      );
    },
  );
});
