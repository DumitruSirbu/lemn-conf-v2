// 8U §12, ADR 0090 Amendment B: a merged space wider than any cabinet at a wall's end is clipped where it is
// published when the wall is shortened, and recorded whole, so a command at the short wall stores it untruncated and
// restoring the wall publishes it as it was.
//
// R6: projecting the published face into the document instead of the recorded one turns the round trip red.
import { describe, expect, it } from "vitest";

import { reconcileSuccessfulCommandResult } from "../src/commands/reconcile-command-result.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import { DesignSchema, type Design } from "../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../src/fixtures/kitchen-l-design.js";
import { toMetres } from "../src/millimetres.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  type Column,
  type PlacementRecord,
} from "../src/void-engine.js";
import { memberlessSpaces } from "./support/merge-oracle.js";

const CATALOG = KITCHEN_L_BODY_CATALOG;
const NOW = "2026-10-16T12:00:00.000Z";
const WALL_A_MM = 4200;
const SHORTENED_WALL_A_MM = 3700;
const SPACE_LEFT_EDGE_MM = 2200;
const FULL_HEIGHT = { y0Mm: 0, topMm: 2600, depthMm: 580 } as const;

interface Faces {
  readonly records: readonly PlacementRecord[];
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly columns: ReadonlyMap<string, Column>;
}

describe("a merged 2000 mm space at wall A's end, across a wall shortened and restored (ADR 0090 Amendment B)", () => {
  it("publishes it clipped to the short wall while recording it whole", () => {
    const faces = facesOf(withWallA(storedDesign(), SHORTENED_WALL_A_MM));

    expect(wallASpansOf(faces.columns, faces.records)).toEqual([
      [SPACE_LEFT_EDGE_MM, SHORTENED_WALL_A_MM],
    ]);
    expect(wallASpansOf(faces.recordedColumns, faces.records)).toEqual([
      [SPACE_LEFT_EDGE_MM, WALL_A_MM],
    ]);
  });

  it("stores it untruncated after a command at the short wall, and publishes it whole once the wall is restored", () => {
    const shortened = withWallA(storedDesign(), SHORTENED_WALL_A_MM);
    const afterCommand = removedThroughTheStore(shortened, "elsewhere");

    const restored = facesOf(withWallA(afterCommand, WALL_A_MM));

    expect(
      afterCommand.emptyColumns?.filter((entry) => entry.wall === "A"),
    ).toEqual([{ wall: "A", alongMm: 3200, widthMm: 2000, ...FULL_HEIGHT }]);
    expect(wallASpansOf(restored.columns, restored.records)).toEqual([
      [SPACE_LEFT_EDGE_MM, WALL_A_MM],
    ]);
  });
});

/** An 800 and a 1200 mm space abutting at 3000 and reaching wall A's end, which load as one 2000 mm column, and one
 *  body on wall B for the command to remove. */
function storedDesign(): Design {
  return DesignSchema.parse({
    room: { shape: "L", widthMm: WALL_A_MM, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [
      {
        id: "elsewhere",
        wall: "B",
        alongMm: 1500,
        y0Mm: 0,
        body: { buildId: "base-drawer3-600", widthMm: 600, heightMm: 820 },
      },
    ],
    emptyColumns: [
      { wall: "A", alongMm: 2600, widthMm: 800, ...FULL_HEIGHT },
      { wall: "A", alongMm: 3600, widthMm: 1200, ...FULL_HEIGHT },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function withWallA(design: Design, widthMm: number): Design {
  return { ...design, room: { ...design.room, widthMm } };
}

/** The store's two faces of one document (`configurator-store.ts`, `deriveGeometry`). */
function facesOf(design: Design): Faces {
  const records = derivePlacementRecords(design, CATALOG);
  return {
    records,
    recordedColumns: deriveRecordedColumns(
      records,
      design,
      toMetres(design.room.widthMm),
    ),
    columns: deriveColumns(records, design, design.room),
  };
}

function removedThroughTheStore(design: Design, id: string): Design {
  const result = removePlacement({
    design,
    catalog: CATALOG,
    target: { kind: "placement", id },
    occurredAt: NOW,
  });
  if (!result.ok)
    throw new Error(`removing ${id} refused: ${result.reason.code}`);
  return reconcileSuccessfulCommandResult({
    result,
    catalog: CATALOG,
    previousRecordedColumns: facesOf(design).recordedColumns,
  }).design;
}

function wallASpansOf(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): [number, number][] {
  return memberlessSpaces(columns, records)
    .filter((space) => space.wall === "A")
    .map((space) => [Math.round(space.leftMm), Math.round(space.rightMm)]);
}
