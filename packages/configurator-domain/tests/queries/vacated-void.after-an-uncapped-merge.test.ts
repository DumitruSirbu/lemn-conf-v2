// 8U criterion 12, domain half: a delete whose freed column merges past 800 mm selects the merged opening, though
// the key the body was filed under no longer exists. The tap across the merged box is
// `packages/three-adapter/tests/picking.merged-void.test.ts`.
//
// R6, through mocked copies of src: `findVacatedVoid` without its geometric fallback selects nothing; the editor's
// merge capped at 800 keeps the body's own column, so the vacated key survives and the test is red.
import { describe, expect, it } from "vitest";

import { reconcileSuccessfulCommandResult } from "../../src/commands/reconcile-command-result.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { DesignSchema, type Design } from "../../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import { toMetres, toMillimetres } from "../../src/millimetres.js";
import { findVacatedVoid } from "../../src/queries/vacated-void.js";
import {
  derivePlacementRecords,
  deriveRecordedColumns,
} from "../../src/void-engine.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-10-16T12:00:00.000Z";
const SPACE = { leftMm: 1200, widthMm: 800 } as const;
const BODY = { leftMm: 2000, widthMm: 600 } as const;
const FULL_HEIGHT = { y0Mm: 0, topMm: 2600, depthMm: 580 } as const;

describe("after a delete that merges its column with an 800 mm space (8U criterion 12)", () => {
  it("selects the merged 1400 mm base opening, whose interval encloses the vacated frame, though the body's key is gone", () => {
    const design = designWithSpaceBesideABase();
    const records = derivePlacementRecords(design, CATALOG);
    const result = removePlacement({
      design,
      catalog: CATALOG,
      target: { kind: "placement", id: "p" },
      occurredAt: NOW,
    });
    if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
    const reconciled = reconcileSuccessfulCommandResult({
      result,
      catalog: CATALOG,
      previousRecordedColumns: deriveRecordedColumns(
        records,
        design,
        toMetres(design.room.widthMm),
      ),
    });

    const selected = findVacatedVoid(reconciled.voids, result.effect.vacated);

    expect(reconciled.columns.has(result.effect.vacated.col)).toBe(false);
    expect(selected && intervalMm(selected)).toEqual({
      col: "A|1.90",
      leftMm: SPACE.leftMm,
      rightMm: BODY.leftMm + BODY.widthMm,
      y0Mm: 0,
    });
  });
});

function intervalMm(record: {
  readonly col: string;
  readonly x: number;
  readonly w: number;
  readonly y0: number;
}) {
  return {
    col: record.col,
    leftMm: toMillimetres(record.x - record.w / 2),
    rightMm: toMillimetres(record.x + record.w / 2),
    y0Mm: toMillimetres(record.y0),
  };
}

/** An 800 mm stored space at 1200-2000 beside a 600 mm base whose frozen extent agrees with it, so the delete frees a
 *  column the merge joins to the space. */
function designWithSpaceBesideABase(): Design {
  return DesignSchema.parse({
    room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [
      {
        id: "p",
        wall: "A",
        alongMm: BODY.leftMm + BODY.widthMm / 2,
        y0Mm: 0,
        body: {
          buildId: "base-drawer3-600",
          widthMm: BODY.widthMm,
          heightMm: 820,
        },
      },
    ],
    emptyColumns: [
      {
        wall: "A",
        alongMm: SPACE.leftMm + SPACE.widthMm / 2,
        widthMm: SPACE.widthMm,
        ...FULL_HEIGHT,
      },
    ],
    columnExtents: [
      {
        wall: "A",
        alongMm: BODY.leftMm + BODY.widthMm / 2,
        widthMm: BODY.widthMm,
        ...FULL_HEIGHT,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  });
}
