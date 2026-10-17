// Known defect, awaiting a backlog row; no wave owns it yet. A depth change and its undo (600 -> 700 -> 600) leave
// the generated L's fridge and oven-tower columns deeper than they started, so cleared spaces stop agreeing. Each
// test pins today's drift and goes red when it is fixed: then restate it as the round trip restoring 620.
import { describe, expect, it } from "vitest";

import { reconcileSuccessfulCommandResult } from "../../src/commands/reconcile-command-result.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import type { CommandResult } from "../../src/commands/command-result.js";
import {
  cabinetDepthMmOf,
  type Design,
  type EmptyColumn,
} from "../../src/design.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import { toMetres, toMillimetres } from "../../src/millimetres.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
} from "../../src/void-engine.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-10-16T12:00:00.000Z";
const probeAt = createFakeProbeFactory();

/** The owner's room (8U criterion 6), composed at the 600 mm default. */
const OWNERS_ROOM = {
  shape: "L",
  widthMm: 4100,
  depthMm: 3300,
  heightMm: 2600,
} as const;

/** The fridge's column on wall B and the oven tower's on wall A; the rows of the run the customer clears below. */
const FRIDGE_COLUMN = "B|2.45";
const TOWER_COLUMN = "A|3.30";
const WALL_B_RUN_AROUND_THE_FRIDGE = ["n7", "n13", "n19", "n0"];

describe("known defect, awaiting a backlog row: a cabinet-depth round trip drifts the published depths", () => {
  it("publishes the fridge column at 742 mm and the tower column at 638 mm after 600 -> 700 -> 600, both 620 before", () => {
    const composed = ownersKitchen();

    const roundTripped = atDepth(atDepth(composed, 700), 600);

    expect(publishedDepthsMm(composed)).toEqual({ fridge: 620, tower: 620 });
    expect(publishedDepthsMm(roundTripped)).toEqual({
      fridge: 742,
      tower: 638,
    });
  });

  it("leaves three spaces of 600, 700 (742 deep) and 400 where the cleared run around the fridge was one of 1700", () => {
    const composed = ownersKitchen();

    const fresh = clearedAroundTheFridge(composed);
    const afterRoundTrip = clearedAroundTheFridge(
      atDepth(atDepth(composed, 700), 600),
    );

    expect(wallBSpaces(fresh)).toEqual(["2350 w1700 d620"]);
    expect(wallBSpaces(afterRoundTrip)).toEqual([
      "1800 w600 d620",
      "2450 w700 d742",
      "3000 w400 d620",
    ]);
  });
});

function ownersKitchen(): Design {
  const result = generateKitchen({
    room: OWNERS_ROOM,
    occurredAt: OCCURRED_AT,
    probeAt,
  });
  if (!result.ok) throw new Error("the owner's room did not compose");
  return result.design;
}

/** The command and the store's own reconcile, at the catalogue of the depth it lands on. */
function atDepth(design: Design, cabinetDepthMm: number): Design {
  return reconciled(
    design,
    setCabinetDepth({
      design,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm,
      probeAt,
      occurredAt: OCCURRED_AT,
    }),
  );
}

function clearedAroundTheFridge(start: Design): Design {
  return WALL_B_RUN_AROUND_THE_FRIDGE.reduce((design, id) => {
    const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
    return reconciled(
      design,
      removePlacement({
        design,
        catalog,
        target: { kind: "placement", id },
        occurredAt: OCCURRED_AT,
      }),
    );
  }, start);
}

function reconciled(before: Design, result: CommandResult): Design {
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  const previousCatalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(before));
  const previousRecordedColumns = deriveRecordedColumns(
    derivePlacementRecords(before, previousCatalog),
    before,
    toMetres(before.room.widthMm),
  );
  return reconcileSuccessfulCommandResult({
    result,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design)),
    previousRecordedColumns,
  }).design;
}

function publishedDepthsMm(design: Design): { fridge: number; tower: number } {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const columns = deriveColumns(
    derivePlacementRecords(design, catalog),
    design,
    design.room,
  );
  const depthOf = (key: string) => {
    const column = columns.get(key);
    if (!column) throw new Error(`no published column ${key}`);
    return toMillimetres(column.d);
  };
  return { fridge: depthOf(FRIDGE_COLUMN), tower: depthOf(TOWER_COLUMN) };
}

function wallBSpaces(design: Design): string[] {
  return (design.emptyColumns ?? [])
    .filter((space: EmptyColumn) => space.wall === "B")
    .map(
      (space) =>
        `${String(space.alongMm)} w${String(space.widthMm)} d${String(space.depthMm)}`,
    );
}
