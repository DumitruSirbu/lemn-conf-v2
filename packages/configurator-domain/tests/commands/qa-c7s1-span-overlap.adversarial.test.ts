// M7C wave C7 slice S1 adversarial QA (M7-FB-013): a wall cabinet is built deep only where its span truly
// overlaps a full-height member — on generating a kitchen and on inserting, replacing and resizing in the
// editor (owner, 2026-10-02: *"just fix this wrong depth on generating new kitchen and inserting cabinets"*).
//
// The oracle everywhere is plain interval arithmetic on whole-millimetre spans read off the document, never
// the predicate under test. Editor states go through the store's own path (recorded columns, published
// voids, `reconcileSuccessfulCommandResult`).
import { describe, expect, it } from "vitest";

import type { CommandResult } from "../../src/commands/command-result.js";
import { insertBody } from "../../src/commands/insert-body.js";
import { reconcileSuccessfulCommandResult } from "../../src/commands/reconcile-command-result.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { setWidth } from "../../src/commands/set-width.js";
import {
  cabinetDepthMmOf,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
} from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import { toMetres } from "../../src/millimetres.js";
import { widthOptionsFor } from "../../src/queries/width-options.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import {
  deriveColumns,
  derivePlacementRecords,
  deriveRecordedColumns,
  overlapsAlongWall,
  recomputeVoids,
  type BodyCatalog,
  type Column,
  type PlacementRecord,
  type VoidRecord,
} from "../../src/void-engine.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import {
  CAPPED_DOORLESS_SEAT_MM,
  CAPPED_SEAT_AT_600_MM,
  CAPPED_SEAT_MM,
  extentOver,
  LIFTED_SEAT_AT_600_MM,
  LIFTED_SEAT_MM,
  recordOver,
  spansOverlapByMoreThanNothing,
  WALLS,
  type Run,
} from "../support/span-overlap-fixtures.js";

const OCCURRED_AT = "2026-10-02T12:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;
const WALL_ROW_FLOOR_MM = 1500;
const TOP_ROW_FLOOR_MM = 2200;

const DOORLESS_BUILD_ID = "open-shelf";

const probeAt = createFakeProbeFactory();

// -------------------------------------------------------------------------------------------------
// The predicate alone, against interval arithmetic.
// -------------------------------------------------------------------------------------------------

const MEMBER_WIDTHS_MM = [450, 600, 700, 900];
const COLUMN_WIDTHS_MM = [200, 300, 400, 450, 600, 700, 800, 900];
const MEMBER_START_MM = 1500;

describe("overlapsAlongWall against interval arithmetic", () => {
  it.each(WALLS)(
    "answers every member and column width at every 10 mm on wall %s, in either order",
    (wall) => {
      const wrong: string[] = [];
      let asked = 0;
      for (const memberWidthMm of MEMBER_WIDTHS_MM) {
        const member = {
          startMm: MEMBER_START_MM,
          endMm: MEMBER_START_MM + memberWidthMm,
        };
        for (const columnWidthMm of COLUMN_WIDTHS_MM) {
          for (let startMm = 400; startMm <= 2600; startMm += 10) {
            const column = { startMm, endMm: startMm + columnWidthMm };
            const expected = spansOverlapByMoreThanNothing(member, column);
            const forward = overlapsAlongWall(
              recordOver(wall, member),
              extentOver(wall, column),
            );
            const reversed = overlapsAlongWall(
              recordOver(wall, column),
              extentOver(wall, member),
            );
            asked += 2;
            if (forward !== expected || reversed !== expected) {
              wrong.push(
                `${String(memberWidthMm)} at ${String(MEMBER_START_MM)} against ${String(columnWidthMm)} at ${String(startMm)}`,
              );
            }
          }
        }
      }

      expect(asked).toBe(2 * 4 * 8 * 221);
      expect(wrong).toEqual([]);
    },
  );

  it.each(WALLS)(
    "calls two runs that meet on a line beside each other, and a millimetre in over, on wall %s",
    (wall) => {
      for (const memberWidthMm of MEMBER_WIDTHS_MM) {
        for (const columnWidthMm of COLUMN_WIDTHS_MM) {
          const member = { startMm: 1500, endMm: 1500 + memberWidthMm };
          const after = (offsetMm: number) =>
            extentOver(wall, {
              startMm: member.endMm + offsetMm,
              endMm: member.endMm + offsetMm + columnWidthMm,
            });
          const before = (offsetMm: number) =>
            extentOver(wall, {
              startMm: member.startMm - columnWidthMm + offsetMm,
              endMm: member.startMm + offsetMm,
            });
          const record = recordOver(wall, member);

          expect([
            overlapsAlongWall(record, after(0)),
            overlapsAlongWall(record, after(1)),
            overlapsAlongWall(record, after(-1)),
            overlapsAlongWall(record, before(0)),
            overlapsAlongWall(record, before(-1)),
            overlapsAlongWall(record, before(1)),
          ]).toEqual([false, false, true, false, false, true]);
        }
      }
    },
  );
});

// -------------------------------------------------------------------------------------------------
// The store's path, and the audit: every wall-row and top-row body against the full-height members.
// -------------------------------------------------------------------------------------------------

interface World {
  readonly design: Design;
  readonly catalog: BodyCatalog;
  readonly records: readonly PlacementRecord[];
  readonly columns: ReadonlyMap<string, Column>;
  readonly recordedColumns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
  readonly cabinetDepthMm: number;
}

function worldOf(design: Design): World {
  const cabinetDepthMm = cabinetDepthMmOf(design);
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const records = derivePlacementRecords(design, catalog);
  const stored = {
    emptyColumns: design.emptyColumns,
    columnExtents: design.columnExtents,
  };
  const columns = deriveColumns(records, stored, design.room);
  return {
    design,
    catalog,
    records,
    columns,
    recordedColumns: deriveRecordedColumns(
      records,
      stored,
      toMetres(design.room.widthMm),
    ),
    voids: recomputeVoids(records, columns),
    cabinetDepthMm,
  };
}

function applied(world: World, result: CommandResult): World {
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(result.design));
  const reconciled = reconcileSuccessfulCommandResult({
    result,
    catalog,
    previousRecordedColumns: world.recordedColumns,
  });
  return {
    design: reconciled.design,
    catalog,
    records: reconciled.records,
    columns: reconciled.columns,
    recordedColumns: reconciled.recordedColumns,
    voids: reconciled.voids,
    cabinetDepthMm: cabinetDepthMmOf(reconciled.design),
  };
}

function generated(room: DesignRoom): World {
  const result = generateKitchen({ room, occurredAt: OCCURRED_AT, probeAt });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return worldOf(result.design);
}

function atDepth(world: World, cabinetDepthMm: number): World {
  return applied(
    world,
    setCabinetDepth({
      design: world.design,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm,
      probeAt,
      occurredAt: OCCURRED_AT,
    }),
  );
}

function spanOf(placement: DesignPlacement): Run {
  return {
    startMm: placement.alongMm - placement.body.widthMm / 2,
    endMm: placement.alongMm + placement.body.widthMm / 2,
  };
}

function seatMmOf(world: World, placement: DesignPlacement): number {
  const record = world.records.find(
    (candidate) => candidate.id === placement.id,
  );
  if (!record) throw new Error(`no record for ${placement.id}`);
  return Math.round(record.frame.d * 1000);
}

function fullHeightMembersOf(world: World): DesignPlacement[] {
  return world.design.placements.filter(
    (placement) =>
      world.records.find((record) => record.id === placement.id)?.band ===
      "column",
  );
}

/** The ordinary wall-row and top-row bodies: not a hood (its own depth), not a corner piece (its own). */
function hungBodiesOf(world: World): DesignPlacement[] {
  return world.design.placements.filter(
    (placement) =>
      placement.y0Mm >= WALL_ROW_FLOOR_MM &&
      !placement.body.buildId.includes("corner") &&
      !placement.body.buildId.startsWith("hood"),
  );
}

function isOverAFullHeightMember(
  world: World,
  placement: DesignPlacement,
): boolean {
  return fullHeightMembersOf(world).some(
    (member) =>
      member.wall === placement.wall &&
      spansOverlapByMoreThanNothing(spanOf(member), spanOf(placement)),
  );
}

function seatAt(
  seats: Readonly<Record<number, number>>,
  cabinetDepthMm: number,
): number {
  const seatMm = seats[cabinetDepthMm];
  if (seatMm === undefined) {
    throw new Error(`no seat is established at ${String(cabinetDepthMm)}`);
  }
  return seatMm;
}

function owedSeatMm(world: World, placement: DesignPlacement): number {
  if (isOverAFullHeightMember(world, placement)) {
    if (placement.body.buildId === DOORLESS_BUILD_ID) {
      throw new Error("no lifted seat is established for an open shelf");
    }
    return seatAt(LIFTED_SEAT_MM, world.cabinetDepthMm);
  }
  const capped =
    placement.body.buildId === DOORLESS_BUILD_ID
      ? CAPPED_DOORLESS_SEAT_MM
      : CAPPED_SEAT_MM;
  return seatAt(capped, world.cabinetDepthMm);
}

/** Every hung body whose seat is not the one its position owes: lifted over a member, capped beside. */
function wronglySeated(world: World): string[] {
  return hungBodiesOf(world).flatMap((placement) => {
    const owedMm = owedSeatMm(world, placement);
    const seatMm = seatMmOf(world, placement);
    const span = spanOf(placement);
    return seatMm === owedMm
      ? []
      : [
          `${placement.body.buildId} ${placement.wall} ${String(span.startMm)}-${String(span.endMm)} y${String(placement.y0Mm)}: seat ${String(seatMm)}, owed ${String(owedMm)}`,
        ];
  });
}

const STRAIGHT_2500: DesignRoom = {
  shape: "linear",
  widthMm: 2500,
  depthMm: 3400,
  heightMm: 2600,
};
const STRAIGHT_3600: DesignRoom = { ...STRAIGHT_2500, widthMm: 3600 };
const L_900_3500: DesignRoom = {
  shape: "L",
  widthMm: 900,
  depthMm: 3500,
  heightMm: 2600,
};

const GENERATED_ROOMS: readonly DesignRoom[] = [
  STRAIGHT_2500,
  STRAIGHT_3600,
  { ...STRAIGHT_2500, widthMm: 1900 },
  { ...STRAIGHT_2500, widthMm: 6000 },
  L_900_3500,
  { ...L_900_3500, cornerDirection: "right" },
  { shape: "L", widthMm: 3400, depthMm: 1000, heightMm: 2600 },
  { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 },
  { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 2600 },
  { shape: "U", widthMm: 3000, depthMm: 2400, wallCMm: 2600, heightMm: 2600 },
  { shape: "U", widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
];

describe("a generated kitchen builds no wall cabinet deep beside a full-height member", () => {
  it.each(GENERATED_ROOMS)(
    "seats every wall-row and top-row body at the wall depth in %o, at 2400 and 2600, at 600 and after 700",
    (room) => {
      for (const heightMm of [2400, 2600]) {
        const shallow = generated({ ...room, heightMm });
        const deep = atDepth(shallow, DEEP_MM);

        expect(hungBodiesOf(shallow).length).toBeGreaterThan(0);
        expect(wronglySeated(shallow)).toEqual([]);
        expect(wronglySeated(deep)).toEqual([]);
        expect(wronglySeated(atDepth(deep, SHALLOW_MM))).toEqual([]);
      }
    },
  );

  it.each([
    [STRAIGHT_2500, "A", 700],
    [L_900_3500, "B", 1600],
  ] as const)(
    "the witness %o: the cabinet beside the 700 fridge and the top on it are 291, the fridge abutting them",
    (room, wall, startMm) => {
      const world = generated(room);
      const fridge = fullHeightMembersOf(world).find(
        (member) => member.body.buildId === "fridge-free",
      );
      const beside = hungBodiesOf(world).filter(
        (placement) =>
          placement.wall === wall && spanOf(placement).startMm === startMm,
      );

      expect(fridge && spanOf(fridge).endMm).toBe(startMm);
      expect(fridge?.body.widthMm).toBe(700);
      expect(beside.map((placement) => placement.y0Mm)).toEqual([
        WALL_ROW_FLOOR_MM,
        TOP_ROW_FLOOR_MM,
      ]);
      expect(beside.map((placement) => seatMmOf(world, placement))).toEqual([
        CAPPED_SEAT_AT_600_MM,
        CAPPED_SEAT_AT_600_MM,
      ]);
    },
  );
});

// -------------------------------------------------------------------------------------------------
// The editor: beside stays at the wall depth, over is built deep, by insert, replace and resize.
// -------------------------------------------------------------------------------------------------

function bodyAt(
  world: World,
  wall: DesignWall,
  y0Mm: number,
  startMm: number,
): DesignPlacement {
  const found = world.design.placements.find(
    (placement) =>
      placement.wall === wall &&
      placement.y0Mm === y0Mm &&
      spanOf(placement).startMm === startMm,
  );
  if (!found) throw new Error(`no body at ${wall} ${String(startMm)}`);
  return found;
}

function without(world: World, placement: DesignPlacement): World {
  return applied(
    world,
    removePlacement({
      design: world.design,
      catalog: world.catalog,
      target: { kind: "placement", id: placement.id },
      occurredAt: OCCURRED_AT,
    }),
  );
}

function openingAt(
  world: World,
  wall: DesignWall,
  y0Mm: number,
  startMm: number,
): VoidRecord {
  const found = world.voids.find(
    (gap) =>
      gap.wall === wall &&
      Math.abs(gap.y0 - toMetres(y0Mm)) < 1e-6 &&
      Math.abs(((wall === "A" ? gap.x : gap.z) - gap.w / 2) * 1000 - startMm) <
        0.5,
  );
  if (!found) throw new Error(`no opening at ${wall} ${String(startMm)}`);
  return found;
}

function withInserted(world: World, opening: VoidRecord, buildId: string) {
  return probeAt(world.cabinetDepthMm).use((probe) =>
    applied(
      world,
      insertBody({
        design: world.design,
        columns: world.recordedColumns,
        voids: world.voids,
        target: { kind: "void", id: opening.id },
        catalog: world.catalog,
        buildId,
        probe,
        occurredAt: OCCURRED_AT,
      }),
    ),
  );
}

function withReplaced(
  world: World,
  placement: DesignPlacement,
  buildId: string,
) {
  return probeAt(world.cabinetDepthMm).use((probe) =>
    applied(
      world,
      insertBody({
        design: world.design,
        columns: world.recordedColumns,
        voids: world.voids,
        target: { kind: "placement", id: placement.id },
        catalog: world.catalog,
        buildId,
        probe,
        occurredAt: OCCURRED_AT,
      }),
    ),
  );
}

describe("the editor beside a full-height member, at 600 and at 700", () => {
  it.each([SHALLOW_MM, DEEP_MM])(
    "inserts and replaces every wall body beside the 700 fridge at the wall depth, at %i",
    (cabinetDepthMm) => {
      const start =
        cabinetDepthMm === SHALLOW_MM
          ? generated(STRAIGHT_3600)
          : atDepth(generated(STRAIGHT_3600), cabinetDepthMm);
      const cleared = without(
        without(start, bodyAt(start, "A", TOP_ROW_FLOOR_MM, 700)),
        bodyAt(start, "A", WALL_ROW_FLOOR_MM, 700),
      );

      for (const buildId of ["wall-cabinet", "wall-lift", "open-shelf"]) {
        const inserted = withInserted(
          cleared,
          openingAt(cleared, "A", WALL_ROW_FLOOR_MM, 700),
          buildId,
        );
        const replaced = withReplaced(
          start,
          bodyAt(start, "A", WALL_ROW_FLOOR_MM, 700),
          buildId,
        );

        expect([buildId, wronglySeated(inserted)]).toEqual([buildId, []]);
        expect([buildId, wronglySeated(replaced)]).toEqual([buildId, []]);
      }
    },
  );

  it("re-plans nothing above the neighbouring column when a 700 fridge or pantry replaces a 600 tower beside it", () => {
    const start = generated(STRAIGHT_3600);
    const fridge = bodyAt(start, "A", 0, 0);
    const withATower = withReplaced(start, fridge, "tall-oven-tower");
    const tower = bodyAt(withATower, "A", 0, 0);

    expect(tower.body.widthMm).toBe(600);
    expect(wronglySeated(withATower)).toEqual([]);
    for (const buildId of ["tall-pantry", "fridge-free"]) {
      const widened = withReplaced(start, fridge, buildId);

      expect(bodyAt(widened, "A", 0, 0).body.widthMm).toBe(700);
      expect([buildId, wronglySeated(widened)]).toEqual([buildId, []]);
    }
  });
});

describe("the editor over a full-height member", () => {
  /** A straight kitchen with one column cleared from the floor to 2200, its top cabinet left standing. */
  function withAColumnClearedUnderItsTop(): World {
    const start = generated(STRAIGHT_3600);
    const lessTheUpper = without(
      start,
      bodyAt(start, "A", WALL_ROW_FLOOR_MM, 1300),
    );
    return without(lessTheUpper, bodyAt(lessTheUpper, "A", 0, 1300));
  }

  it.each(["tall-pantry", "tall-oven-tower"])(
    "lifts exactly the top standing over an inserted %s, and no neighbour's",
    (buildId) => {
      const cleared = withAColumnClearedUnderItsTop();
      const under = withInserted(
        cleared,
        openingAt(cleared, "A", 0, 1300),
        buildId,
      );
      const standing = bodyAt(under, "A", TOP_ROW_FLOOR_MM, 1300);

      expect(seatMmOf(under, standing)).toBe(LIFTED_SEAT_MM[SHALLOW_MM]);
      expect(wronglySeated(under)).toEqual([]);
      expect(
        hungBodiesOf(under).filter(
          (placement) =>
            seatMmOf(under, placement) === LIFTED_SEAT_MM[SHALLOW_MM],
        ),
      ).toEqual([standing]);
    },
  );

  it("keeps the top deep through every narrower width of the pantry beneath it, the top narrowing with it", () => {
    const cleared = withAColumnClearedUnderItsTop();
    const under = withInserted(
      cleared,
      openingAt(cleared, "A", 0, 1300),
      "tall-pantry",
    );
    const pantry = bodyAt(under, "A", 0, 1300);
    const widths = probeAt(under.cabinetDepthMm).use((probe) =>
      widthOptionsFor({
        design: under.design,
        catalog: under.catalog,
        target: { kind: "placement", id: pantry.id },
        columns: under.recordedColumns,
        probe,
      })
        .filter((option) => option.verdict.status === "available")
        .map((option) => option.widthMm),
    );

    expect(widths.length).toBeGreaterThan(0);
    for (const widthMm of widths) {
      const resized = probeAt(under.cabinetDepthMm).use((probe) =>
        applied(
          under,
          setWidth({
            design: under.design,
            columns: under.recordedColumns,
            target: { kind: "placement", id: pantry.id },
            catalog: under.catalog,
            widthMm,
            probe,
            occurredAt: OCCURRED_AT,
          }),
        ),
      );

      expect([widthMm, wronglySeated(resized)]).toEqual([widthMm, []]);
      expect(bodyAt(resized, "A", TOP_ROW_FLOOR_MM, 1300).body.widthMm).toBe(
        widthMm,
      );
    }
  });
});

describe("a resize that leaves a narrow column beside a narrowed full-height member (the seeded kitchen)", () => {
  /** The seeded pantry `p6` (wall B, 1500–2100) with its deep top `p23` replaced by an ordinary wall
   *  cabinet and that column narrowed to 400: the pantry and the cabinet over it now stand at 1500–1900,
   *  and 1900–2100 is a 200 mm column of its own beside them — unequal widths, abutting. */
  function narrowedPantryColumn(): World {
    const start = worldOf(KITCHEN_L_DESIGN);
    const cleared = without(start, bodyAt(start, "B", TOP_ROW_FLOOR_MM, 1500));
    const refilled = withInserted(
      cleared,
      openingAt(cleared, "B", TOP_ROW_FLOOR_MM, 1500),
      "wall-cabinet",
    );
    const top = bodyAt(refilled, "B", TOP_ROW_FLOOR_MM, 1500);
    return probeAt(refilled.cabinetDepthMm).use((probe) =>
      applied(
        refilled,
        setWidth({
          design: refilled.design,
          columns: refilled.recordedColumns,
          target: { kind: "placement", id: top.id },
          catalog: refilled.catalog,
          widthMm: 400,
          probe,
          occurredAt: OCCURRED_AT,
        }),
      ),
    );
  }

  it("narrows the pantry with the cabinet over it, which stays deep", () => {
    const narrowed = narrowedPantryColumn();
    const pantry = bodyAt(narrowed, "B", 0, 1500);
    const top = bodyAt(narrowed, "B", TOP_ROW_FLOOR_MM, 1500);

    expect([pantry.body.widthMm, top.body.widthMm]).toEqual([400, 400]);
    expect(seatMmOf(narrowed, top)).toBe(LIFTED_SEAT_MM[SHALLOW_MM]);
  });

  it.each([WALL_ROW_FLOOR_MM, TOP_ROW_FLOOR_MM])(
    "builds a wall cabinet inserted at %i in the 200 mm column beside it at the wall depth",
    (y0Mm) => {
      const narrowed = narrowedPantryColumn();
      const inserted = withInserted(
        narrowed,
        openingAt(narrowed, "B", y0Mm, 1900),
        "wall-cabinet",
      );
      const beside = bodyAt(inserted, "B", y0Mm, 1900);

      expect(beside.body.widthMm).toBe(200);
      expect(isOverAFullHeightMember(inserted, beside)).toBe(false);
      expect(seatMmOf(inserted, beside)).toBe(CAPPED_SEAT_MM[SHALLOW_MM]);
      expect(
        validateDesignForCatalog(inserted.design, inserted.catalog),
      ).toEqual([]);
    },
  );
});

describe("the seeded kitchen keeps its three deep tops, each over a full-height member of its own width", () => {
  it("answers full-height-under for exactly the three columns that hold a full-height member", () => {
    const world = worldOf(KITCHEN_L_DESIGN);
    const lifted = [...world.columns.values()]
      .filter((column) => column.hasFullHeightUnder)
      .map((column) => column.key)
      .sort();
    const holdingAMember = [
      ...new Set(
        world.records
          .filter((record) => record.band === "column")
          .map((record) => record.col),
      ),
    ].sort();

    expect(lifted).toEqual(holdingAMember);
    expect(lifted).toHaveLength(3);
    expect(
      ["p22", "p23", "p24"].map((id) =>
        seatMmOf(
          world,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- the seeded ids are fixed
          world.design.placements.find((placement) => placement.id === id)!,
        ),
      ),
    ).toEqual([
      LIFTED_SEAT_AT_600_MM,
      LIFTED_SEAT_AT_600_MM,
      LIFTED_SEAT_AT_600_MM,
    ]);
  });
});
