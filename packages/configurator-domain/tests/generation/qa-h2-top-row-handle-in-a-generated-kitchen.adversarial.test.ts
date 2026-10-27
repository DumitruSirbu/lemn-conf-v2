// **Wave H2 QA (M10): the handle a new kitchen is stamped with is the handle its readers bill, name and mark.**
//
// The H1b/H2 reader suites deal handles onto documents that were built without any. This file starts where the product
// starts: it asks `generateKitchen` for a kitchen stamped with `handle` and `topRowHandle`, at both depths, in every
// shape, and holds three readers (the hardware line's latch count, the worn handle each list entry names, the panel's
// marked default) to an oracle written here from the rule's words. The module line is the literal 2200.
//
// The rule: a body that takes no handle never wears one, but a top-row body with a front that opens is latched anyway
// (`wall-corner-return-570-top`); a body that takes one wears its own, else (top row) the kitchen's top-row handle else
// push, else (below) the kitchen's handle else steel; and a latched body with no front that opens wears nothing.
import { describe, expect, it } from "vitest";

import {
  countHardwareMechanisms,
  derivePlacementRecords,
  describeSelection,
  doorLeafHeightsMm,
  drawerCount,
  frontPopulationQueryFor,
  generateKitchen,
  kitchenHandleSettingsOf,
  projectDesignForDisplay,
  type BodyCatalog,
  type Design,
  type DesignRoom,
  type DisplayEntry,
  type Handle,
  type NewKitchenSettings,
} from "../../src/index.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-10-27T09:30:00.000Z";
const MODULE_LINE_MM = 2_200;
const ROOMS: readonly DesignRoom[] = [
  { shape: "L", widthMm: 3600, depthMm: 3000, heightMm: 3900 },
  { shape: "linear", widthMm: 3300, depthMm: 2400, heightMm: 2600 },
  { shape: "U", widthMm: 4200, depthMm: 3600, heightMm: 2600, wallCMm: 3000 },
];
const HANDLES: readonly (Handle | undefined)[] = [
  undefined,
  "steel",
  "black",
  "push",
];

function stampedKitchen(
  room: DesignRoom,
  newKitchenSettings: NewKitchenSettings,
): Design {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
    newKitchenSettings,
  });
  if (!result.ok) throw new Error(`room refused: ${result.reason.code}`);
  return result.design;
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

interface Oracle {
  readonly wears: Handle | undefined;
  readonly isLatched: boolean;
}

function oracleOf(input: {
  readonly y0Mm: number;
  readonly canHandle: boolean;
  readonly fronts: number;
  readonly kitchen: NewKitchenSettings;
}): Oracle {
  const { y0Mm, canHandle, fronts, kitchen } = input;
  const isTopRow = y0Mm >= MODULE_LINE_MM;
  if (!canHandle) {
    return {
      wears: isTopRow && fronts > 0 ? "push" : undefined,
      isLatched: isTopRow && fronts > 0,
    };
  }
  const wears = isTopRow
    ? (kitchen.topRowHandle ?? "push")
    : (kitchen.handle ?? "steel");
  return { wears, isLatched: wears === "push" && fronts > 0 };
}

describe("a generated kitchen stamped with a handle and a top-row handle is read as the rule says", () => {
  it.each([600, 700])(
    "bills, names and marks what the oracle says, at depth %i, for every pair of kitchen handles in every shape",
    (cabinetDepthMm) => {
      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      let topRowBodiesSeen = 0;
      let latchedTopRowBodiesSeen = 0;
      let unlatchedTopRowBodiesSeen = 0;

      for (const room of ROOMS) {
        for (const handle of HANDLES) {
          for (const topRowHandle of HANDLES) {
            const kitchen: NewKitchenSettings = {
              cabinetDepthMm,
              ...(handle === undefined ? {} : { handle }),
              ...(topRowHandle === undefined ? {} : { topRowHandle }),
            };
            const design = stampedKitchen(room, kitchen);
            const entries = entriesOf(design, catalog);
            const records = derivePlacementRecords(design, catalog);
            const label = `${room.shape} ${JSON.stringify(kitchen)}`;

            let expectedLatches = 0;
            for (const placement of design.placements) {
              const entry = entries.find(
                (candidate) => candidate.placementId === placement.id,
              );
              if (entry === undefined)
                throw new Error(`no entry ${placement.id}`);
              const fronts = frontsOf(entry, catalog);
              const oracle = oracleOf({
                y0Mm: placement.y0Mm,
                canHandle:
                  catalog.get(placement.body.buildId)?.canHandle === true,
                fronts,
                kitchen,
              });
              if (oracle.isLatched) expectedLatches += fronts;
              if (placement.y0Mm >= MODULE_LINE_MM) {
                topRowBodiesSeen += 1;
                if (oracle.isLatched) latchedTopRowBodiesSeen += 1;
                else unlatchedTopRowBodiesSeen += 1;
              }

              const where = `${label} ${placement.id} ${placement.body.buildId} @ ${String(placement.y0Mm)}`;
              expect(entry.wornHandle, where).toBe(oracle.wears);
              const record = records.find((r) => r.id === placement.id);
              const meta = describeSelection({
                records,
                voids: [],
                catalog,
                target: { kind: "placement", id: placement.id },
                kitchenSettings: kitchenHandleSettingsOf(design.settings),
              });
              if (record?.canHandle === true) {
                expect(meta?.handle ?? meta?.defaultHandle, where).toBe(
                  oracle.wears,
                );
              }
            }

            expect(
              countHardwareMechanisms(entries, catalog).pushToOpen,
              label,
            ).toBe(expectedLatches);
          }
        }
      }

      expect(topRowBodiesSeen).toBeGreaterThan(100);
      expect(latchedTopRowBodiesSeen).toBeGreaterThan(30);
      expect(unlatchedTopRowBodiesSeen).toBeGreaterThan(30);
    },
  );

  it("moves no top-row body when only the kitchen handle changes, and no lower body when only the top-row handle does", () => {
    const catalog = buildKitchenLBodyCatalog(700);
    const wornBy = (design: Design) =>
      new Map(
        entriesOf(design, catalog).map((entry) => [
          entry.placementId,
          { y0Mm: entry.y0Mm, worn: entry.wornHandle },
        ]),
      );

    for (const room of ROOMS) {
      const base = wornBy(
        stampedKitchen(room, {
          cabinetDepthMm: 700,
          handle: "steel",
          topRowHandle: "steel",
        }),
      );
      const kitchenMoved = wornBy(
        stampedKitchen(room, {
          cabinetDepthMm: 700,
          handle: "black",
          topRowHandle: "steel",
        }),
      );
      const topRowMoved = wornBy(
        stampedKitchen(room, {
          cabinetDepthMm: 700,
          handle: "steel",
          topRowHandle: "black",
        }),
      );

      for (const [id, { y0Mm, worn }] of base) {
        const isTopRow = y0Mm >= MODULE_LINE_MM;
        if (isTopRow) expect(kitchenMoved.get(id)?.worn, id).toBe(worn);
        else expect(topRowMoved.get(id)?.worn, id).toBe(worn);
      }
      expect(
        [...base].filter(
          ([id]) => kitchenMoved.get(id)?.worn !== base.get(id)?.worn,
        ).length,
        room.shape,
      ).toBeGreaterThan(0);
      expect(
        [...base].filter(
          ([id]) => topRowMoved.get(id)?.worn !== base.get(id)?.worn,
        ).length,
        room.shape,
      ).toBeGreaterThan(0);
    }
  });
});
