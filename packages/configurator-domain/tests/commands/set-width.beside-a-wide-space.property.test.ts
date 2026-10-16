// 8U criterion 11 over a swept total: a shrink beside a stored space gives one column of the summed width, at or
// over 800 mm, and a growth funded by that space is the arithmetic it always was, up to the cabinet ceiling. The
// seeded kitchen cannot reach a space over 800 beside a resizable body (ADR 0093), so the space is stored.
//
// Only even widths are drawn: an odd space has half-millimetre edges (8U §6.2) and cannot abut the pantry's
// whole-millimetre edge, so no odd total exists here. ADR 0122's asymmetric guard is pinned by its own tap
// enumeration in `qa-w5c.enumeration.test.ts`, which this leaves untouched.
//
// R6, through mocked copies of src: the editor's merge capped at 800 turns the shrink arm red at totals over 800; a
// growth that spends 50 mm more than it takes turns the growth arm red; accepting any width turns the ceiling red.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { CABINETRY_MAX_WIDTH_MM } from "../../src/catalog.js";
import { reconcileSuccessfulCommandResult } from "../../src/commands/reconcile-command-result.js";
import { setWidth } from "../../src/commands/set-width.js";
import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { toMetres } from "../../src/millimetres.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
} from "../../src/void-engine.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  isWholeMillimetre,
  memberlessSpaces,
} from "../support/merge-oracle.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-10-16T12:00:00.000Z";
const PROBE = createFakeProbe({ catalog: CATALOG });
const RUNS = 200;
/** The pantry `p6` stands at 1500-2100 on wall B with the fridge `p7` on its right, so only the left side funds. */
const PANTRY_LEFT_EDGE_MM = 1500;
const PANTRY_RIGHT_EDGE_MM = 2100;
const PANTRY_WIDTH_MM = 600;
const WIDEST_SPACE_MM = PANTRY_LEFT_EDGE_MM;
const PANTRY_STEPS_MM = [400, 450, 500, 550, 650, 700, 750, 800] as const;

const evenSpaceWidthMm = fc
  .integer({ min: 1, max: WIDEST_SPACE_MM / 2 })
  .map((half) => half * 2);

describe("a pantry resized beside a stored space on its left (8U criterion 11, E9)", () => {
  it("leaves one member-less column from the space's left edge to the pantry's new left edge, at any total, or refuses a growth the space cannot fund", () => {
    const reach = { overACabinet: 0, grown: 0, consumedExactly: 0, refused: 0 };

    fc.assert(
      fc.property(
        evenSpaceWidthMm,
        fc.constantFrom(...PANTRY_STEPS_MM),
        (spaceWidthMm, pantryWidthMm) => {
          const outcome = resizedPantry(spaceWidthMm, pantryWidthMm);
          const growthMm = pantryWidthMm - PANTRY_WIDTH_MM;

          if (growthMm > spaceWidthMm) {
            expect(outcome).toBe("NO_EMPTY_SPACE");
            reach.refused += 1;
            return;
          }
          const leftMm = PANTRY_LEFT_EDGE_MM - spaceWidthMm;
          const rightMm = PANTRY_RIGHT_EDGE_MM - pantryWidthMm;
          expect(outcome).toEqual(
            rightMm > leftMm ? [{ wall: "B", leftMm, rightMm }] : [],
          );
          if (rightMm - leftMm > CABINETRY_MAX_WIDTH_MM)
            reach.overACabinet += 1;
          if (growthMm > 0) reach.grown += 1;
          if (rightMm === leftMm) reach.consumedExactly += 1;
        },
      ),
      {
        numRuns: RUNS,
        examples: [
          [800, 400],
          [50, 650],
        ],
      },
    );

    expect(reach.overACabinet).toBeGreaterThan(0);
    expect(reach.grown).toBeGreaterThan(0);
    expect(reach.consumedExactly).toBeGreaterThan(0);
    expect(reach.refused).toBeGreaterThan(0);
  });

  it("refuses a growth past the cabinet ceiling with WIDTH_NOT_SUPPORTED however wide the space beside it", () => {
    fc.assert(
      fc.property(evenSpaceWidthMm, (spaceWidthMm) => {
        expect(resizedPantry(spaceWidthMm, CABINETRY_MAX_WIDTH_MM + 50)).toBe(
          "WIDTH_NOT_SUPPORTED",
        );
      }),
      { numRuns: 50, examples: [[WIDEST_SPACE_MM]] },
    );
  });
});

interface SpanMm {
  readonly wall: string;
  readonly leftMm: number;
  readonly rightMm: number;
}

/** `setWidth` on the pantry, then the store's reconcile: the member-less spans, or the refusal code. */
function resizedPantry(
  spaceWidthMm: number,
  pantryWidthMm: number,
): SpanMm[] | string {
  const design = withSpaceLeftOfThePantry(spaceWidthMm);
  const records = derivePlacementRecords(design, CATALOG);
  const result = setWidth({
    design,
    catalog: CATALOG,
    columns: deriveColumns(records, design, design.room),
    target: { kind: "placement", id: "p6" },
    widthMm: pantryWidthMm,
    probe: PROBE,
    occurredAt: NOW,
  });
  if (!result.ok) return result.reason.code;
  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog: CATALOG,
    previousRecordedColumns: deriveRecordedColumns(
      records,
      design,
      toMetres(design.room.widthMm),
    ),
  });
  return memberlessSpaces(reconciled.columns, reconciled.records).map(
    ({ wall, leftMm, rightMm }) => ({
      wall,
      leftMm: wholeMillimetres(leftMm),
      rightMm: wholeMillimetres(rightMm),
    }),
  );
}

/** Metre-float noise removed, and nothing more: an edge off the millimetre grid stays visible as itself. */
function wholeMillimetres(valueMm: number): number {
  return isWholeMillimetre(valueMm) ? Math.round(valueMm) : valueMm;
}

function withSpaceLeftOfThePantry(spaceWidthMm: number): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter((placement) =>
      ["p6", "p7"].includes(placement.id),
    ),
    emptyColumns: [
      {
        wall: "B",
        alongMm: PANTRY_LEFT_EDGE_MM - spaceWidthMm / 2,
        widthMm: spaceWidthMm,
        y0Mm: 0,
        topMm: 2200,
        depthMm: 600,
      },
    ],
  };
}
