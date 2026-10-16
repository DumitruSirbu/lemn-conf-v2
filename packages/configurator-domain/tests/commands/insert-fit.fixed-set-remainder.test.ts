// 8U §12, the fixed-set half of "insert at every band into 1200": `insert-fit.at-its-maximum.test.ts` judges the one
// remainder after the reconcile for `'fit'` rows only. A fixed-set row (dishwasher, bottle cargo, oven tower, fridge
// housing, free fridge) sits flush left, and the rest of a 1200 mm opening is one space.
//
// R6: a seat centred in its opening turns every row red; the merge capped at 800 turns bottle cargo's red.
import { describe, expect, it } from "vitest";

import { listInsertableBodies } from "../../src/catalog.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { reconcileSuccessfulCommandResult } from "../../src/commands/reconcile-command-result.js";
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import { toExactMillimetres, toMillimetres } from "../../src/millimetres.js";
import type { VoidRecord } from "../../src/void-engine.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  COLUMN_SHAPES,
  isFitEntry,
  OPENING_LEFT_EDGE_MM,
  openingWorld,
  type ColumnShape,
  type OpeningWorld,
} from "../support/fit-sweep.js";
import { memberlessSpaces } from "../support/merge-oracle.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-10-16T12:00:00.000Z";
const OPENING_WIDTH_MM = 1200;
const SHAPES = Object.keys(COLUMN_SHAPES) as ColumnShape[];
const FIXED_SET_ROWS = listInsertableBodies(CATALOG).filter(
  (body) => !isFitEntry(body),
);

describe("a fixed-set row into a 1200 mm opening (8U §12, criterion 9)", () => {
  it.each(FIXED_SET_ROWS.map((body) => body.buildId))(
    "builds %s flush left, with the rest of the opening one member-less space, at every level it is accepted",
    (buildId) => {
      let accepted = 0;
      for (const shape of SHAPES) {
        const world = openingWorld(shape, OPENING_WIDTH_MM);
        for (const record of world.voids) {
          const placed = insertedAndReconciled(world, record, buildId);
          if (!placed) continue;
          accepted += 1;
          const label = [shape, toMillimetres(record.y0)];

          expect([label, placed.leftMm]).toEqual([label, OPENING_LEFT_EDGE_MM]);
          expect([label, placed.spaces]).toEqual([
            label,
            [
              [
                OPENING_LEFT_EDGE_MM + placed.widthMm,
                OPENING_LEFT_EDGE_MM + OPENING_WIDTH_MM,
              ],
            ],
          ]);
        }
      }

      expect(accepted).toBeGreaterThan(0);
    },
  );
});

interface Placed {
  readonly leftMm: number;
  readonly widthMm: number;
  readonly spaces: readonly (readonly [number, number])[];
}

function insertedAndReconciled(
  world: OpeningWorld,
  record: VoidRecord,
  buildId: string,
): Placed | undefined {
  const result = insertBody({
    design: world.design,
    catalog: world.catalog,
    columns: world.columns,
    voids: world.voids,
    target: { kind: "void", id: record.id },
    buildId,
    probe: createFakeProbe({ catalog: world.catalog }),
    occurredAt: NOW,
  });
  if (!result.ok) return undefined;
  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog: world.catalog,
    previousRecordedColumns: world.columns,
  });
  const [placement] = reconciled.design.placements;
  if (!placement) throw new Error(`${buildId} was accepted and placed nothing`);
  return {
    leftMm: placement.alongMm - placement.body.widthMm / 2,
    widthMm: placement.body.widthMm,
    spaces: memberlessSpaces(reconciled.columns, reconciled.records).map(
      (space) =>
        [
          wholeMillimetres(space.leftMm),
          wholeMillimetres(space.rightMm),
        ] as const,
    ),
  };
}

function wholeMillimetres(valueMm: number): number {
  return toExactMillimetres(valueMm / 1000) ?? valueMm;
}
