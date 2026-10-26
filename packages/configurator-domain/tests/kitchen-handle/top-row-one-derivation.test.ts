// Wave H1b (M10): "is this body on the top row" is derived in one domain function, `isTopRowFloorMm`, and the
// price, the panel and the record the scene resolves from all ask it. Before H1b `push-to-open.ts` compared
// millimetres and `describe-selection.ts` compared metres, two comparisons that agreed only while a sweep said so.
//
// The oracle is the module line written out as a literal, never the constant under test, and the sweep is
// every catalogue row at every floor within 1 mm of the line, so a reader that moved the boundary, or
// rounded a floor to the other side of it, disagrees with the literal on some row.
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
  isPushToOpen,
  isTopRowFloorMm,
  projectDesignForDisplay,
  type BodyCatalog,
  type Design,
} from "../../src/index.js";

const MODULE_LINE_MM = 2_200;
const FLOORS_AROUND_THE_LINE: readonly number[] = [
  0,
  900,
  1_500,
  MODULE_LINE_MM - 2,
  MODULE_LINE_MM - 1,
  MODULE_LINE_MM,
  MODULE_LINE_MM + 1,
  MODULE_LINE_MM + 2,
  2_600,
];

const CATALOG: BodyCatalog = buildKitchenLBodyCatalog(600);

function oneBodyAt(buildId: string, y0Mm: number): Design {
  const definition = CATALOG.get(buildId);
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, handle: "steel" },
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

function fronts(design: Design): number {
  const entry = projectDesignForDisplay(design, CATALOG)[0]?.entries[0];
  if (!entry) throw new Error("no entry");
  const query = frontPopulationQueryFor({
    body: entry,
    definition: CATALOG.get(entry.buildId) ?? {},
  });
  return doorLeafHeightsMm(query).length + drawerCount(query);
}

describe("the module line is one function", () => {
  it.each(FLOORS_AROUND_THE_LINE)(
    "isTopRowFloorMm(%s) is the literal line",
    (y0Mm) => {
      expect(isTopRowFloorMm(y0Mm)).toBe(y0Mm >= MODULE_LINE_MM);
    },
  );

  it("is exercised by a catalogue worth sweeping", () => {
    expect([...CATALOG.keys()].length).toBeGreaterThan(20);
  });
});

describe("every reader agrees with the line, on every catalogue row, within 1 mm of it", () => {
  for (const [buildId] of CATALOG) {
    it(`${buildId}: price, panel and push-to-open all flip at ${String(MODULE_LINE_MM)}`, () => {
      const disagreements: string[] = [];

      for (const y0Mm of FLOORS_AROUND_THE_LINE) {
        const design = oneBodyAt(buildId, y0Mm);
        const record = derivePlacementRecords(design, CATALOG)[0];
        const entry = projectDesignForDisplay(design, CATALOG)[0]?.entries[0];
        if (!record || !entry) throw new Error("no record");
        const onTopRow = y0Mm >= MODULE_LINE_MM;
        const meta = describeSelection({
          records: [record],
          voids: [],
          catalog: CATALOG,
          target: { kind: "placement", id: "solo" },
          kitchenSettings: { handle: "steel" },
        });
        const panelSaysTopRow = meta?.defaultHandle === "push";
        const latched =
          countHardwareMechanisms([entry], CATALOG).pushToOpen > 0;
        const query = {
          y0Mm,
          recordedHandle: undefined,
          kitchenSettings: { handle: "steel" as const },
          canHandle: record.canHandle,
        };
        const answers = {
          panel: panelSaysTopRow,
          pushToOpen: isPushToOpen(query),
          ...(fronts(design) > 0 ? { price: latched } : {}),
        };
        for (const [reader, answer] of Object.entries(answers)) {
          if (answer !== onTopRow) {
            disagreements.push(
              `${reader} at ${String(y0Mm)} mm said ${String(answer)}`,
            );
          }
        }
      }

      expect(disagreements).toEqual([]);
    });
  }
});
