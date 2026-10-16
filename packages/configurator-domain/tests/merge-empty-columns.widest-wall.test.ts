// 8U §12, restated for the bounds that exist: the widest wall a document may declare is `MAX_ROOM_WIDTH_MM` (6300),
// not §12's 10 000, and the widest the generator accepts is the approved linear maximum (6000). Cleared end to end,
// each is one space, and the document that records it stays inside the schema and the empty-column bound.
//
// R6, through a mocked copy of the merge: the editor capped at 800 turns both red.
import { describe, expect, it } from "vitest";

import { reconcileSuccessfulCommandResult } from "../src/commands/reconcile-command-result.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import { MAX_ROOM_WIDTH_MM } from "../src/design-bounds.js";
import {
  cabinetDepthMmOf,
  DesignSchema,
  type Design,
  type EmptyColumn,
} from "../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
} from "../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../src/generation/generate-kitchen.js";
import { toMetres } from "../src/millimetres.js";
import { APPROVED_ROOM_POLICY } from "../src/room/approved-room-policy.js";
import { validateRoomInput } from "../src/room/validate-room.js";
import {
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  projectFrozenMap,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
} from "../src/void-engine.js";
import { createFakeProbeFactory } from "./support/fake-probe.js";
import { memberlessSpaces } from "./support/merge-oracle.js";

const NOW = "2026-10-16T12:00:00.000Z";
/** The narrowest tile whose 10 mm-bucket keys stay distinct: its centres fall 20 mm apart. */
const TILE_WIDTH_MM = 20;
const WIDEST_GENERATED_WALL_MM = widestApprovedLinearWallMm();

interface Cleared {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly records: readonly PlacementRecord[];
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly columns: ReadonlyMap<string, Column>;
}

describe("the widest wall, cleared end to end (8U §12)", () => {
  it("loads a 6300 mm wall stored as 315 abutting 20 mm spaces as one space over the whole wall, recorded as one entry", () => {
    const tileCount = MAX_ROOM_WIDTH_MM / TILE_WIDTH_MM;
    const design = tiledWall(tileCount);
    const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);

    const columns = deriveColumns(records, design, design.room);

    expect(spansOf(columns, records)).toEqual([[0, MAX_ROOM_WIDTH_MM]]);
    expect(projectFrozenMap(columns, records).emptyColumns).toEqual([
      expect.objectContaining({
        alongMm: MAX_ROOM_WIDTH_MM / 2,
        widthMm: MAX_ROOM_WIDTH_MM,
      }),
    ]);
  });

  it("clears the widest generated linear kitchen body by body into one space over the whole wall, in a document the write seam accepts", () => {
    const cleared = clearedEndToEnd(generatedLinearKitchen());

    expect(cleared.records).toEqual([]);
    expect(spansOf(cleared.columns, cleared.records)).toEqual([
      [0, WIDEST_GENERATED_WALL_MM],
    ]);
    expect(cleared.design.emptyColumns).toHaveLength(1);
    expect(DesignSchema.safeParse(cleared.design).success).toBe(true);
    expect(
      fatalDesignValidationIssues(
        validateDesignForCatalog(cleared.design, cleared.catalog),
      ),
    ).toEqual([]);
  });
});

function tiledWall(tileCount: number): Design {
  const tiles = Array.from(
    { length: tileCount },
    (_, index): EmptyColumn => ({
      wall: "A",
      alongMm: TILE_WIDTH_MM * index + TILE_WIDTH_MM / 2,
      widthMm: TILE_WIDTH_MM,
      y0Mm: 0,
      topMm: 2600,
      depthMm: 580,
    }),
  );
  return DesignSchema.parse({
    room: {
      shape: "linear",
      widthMm: MAX_ROOM_WIDTH_MM,
      depthMm: 2400,
      heightMm: 2600,
    },
    presetId: null,
    placements: [],
    emptyColumns: tiles,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function generatedLinearKitchen(): Cleared {
  const accepted = validateRoomInput(
    { shape: "linear", wallAMm: WIDEST_GENERATED_WALL_MM, heightMm: 2600 },
    APPROVED_ROOM_POLICY,
  );
  if (!accepted.ok) throw new Error("the widest linear room was refused");
  const generated = generateKitchen({
    room: accepted.room,
    occurredAt: NOW,
    probeAt: createFakeProbeFactory(),
  });
  if (!generated.ok) throw new Error("the widest linear room did not compose");
  const { design } = generated;
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  const records = derivePlacementRecords(design, catalog);
  return {
    design,
    catalog,
    records,
    recordedColumns: deriveRecordedColumns(
      records,
      design,
      toMetres(design.room.widthMm),
    ),
    columns: deriveColumns(records, design, design.room),
  };
}

/** Every body removed through `removePlacement` and the store's reconcile, first record first. */
function clearedEndToEnd(start: Cleared): Cleared {
  let world = start;
  for (let [next] = world.records; next; [next] = world.records) {
    const result = removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: next.id },
      occurredAt: NOW,
    });
    if (!result.ok)
      throw new Error(`removing ${next.id} refused: ${result.reason.code}`);
    const reconciled = reconcileSuccessfulCommandResult({
      result,
      catalog: world.catalog,
      previousRecordedColumns: world.recordedColumns,
    });
    world = { ...world, ...reconciled };
  }
  return world;
}

function spansOf(
  columns: ReadonlyMap<string, Column>,
  records: readonly PlacementRecord[],
): [number, number][] {
  return memberlessSpaces(columns, records).map((space) => [
    Math.round(space.leftMm),
    Math.round(space.rightMm),
  ]);
}

function widestApprovedLinearWallMm(): number {
  const linear = APPROVED_ROOM_POLICY.buildableShapes.linear;
  if (!linear) throw new Error("the approved policy builds no linear room");
  return linear.wallA.maxMm;
}
