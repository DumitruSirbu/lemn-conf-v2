// M7C wave C7 slice S1 (M7-FB-013), at the editor: a wall-row body is built DEEP only where its span truly
// overlaps a full-height member's, and gets the wall depth where it merely stands beside one.
//
// `overlapsAlongWall` used to read each run's centre as its start, so a 700 fridge and the 600 column beside
// it overlapped by 50 mm and the cabinet inserted there was built 600 deep (seat 561), 270 mm proud of its
// row; and a narrow column over the low end of a wider tall member read as clear of it and was built shallow.
// Each case is by insert, by replace (a swap in place), and by the re-plan an insert beneath triggers. A resize is
// not covered: it spends empty space and does not re-plan the cabinets above a neighbour, so it cannot make or
// end a depth change (a test of it stays green under the old predicate).
import { describe, expect, it } from "vitest";

import type { DesignPlacement } from "../../src/design.js";
import { clearBodies, insertInto } from "../support/commands.js";
import {
  advance,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import {
  CAPPED_SEAT_AT_600_MM,
  LIFTED_SEAT_AT_600_MM,
} from "../support/span-overlap-fixtures.js";
import { syntheticWorld } from "../support/synthetic-world.js";

const WALL_ROW_FLOOR_M = 1.5;
const TOP_ROW_FLOOR_M = 2.2;
const FRIDGE_WIDTH_MM = 700;
const NEIGHBOUR_WIDTH_MM = 600;

interface BodySpec {
  readonly id: string;
  readonly buildId: string;
  readonly startMm: number;
  readonly widthMm: number;
  readonly y0Mm: number;
  readonly heightMm: number;
}

function body({
  id,
  buildId,
  startMm,
  widthMm,
  y0Mm,
  heightMm,
}: BodySpec): DesignPlacement {
  return {
    id,
    wall: "A",
    alongMm: startMm + widthMm / 2,
    y0Mm,
    body: { buildId, widthMm, heightMm },
  };
}

function fridge(startMm: number, widthMm = FRIDGE_WIDTH_MM): DesignPlacement {
  return body({
    id: "fridge",
    buildId: "fridge-free",
    startMm,
    widthMm,
    y0Mm: 0,
    heightMm: 1850,
  });
}

function base(id: string, startMm: number, widthMm: number): DesignPlacement {
  return body({
    id,
    buildId: "base-drawer2-600",
    startMm,
    widthMm,
    y0Mm: 0,
    heightMm: 820,
  });
}

/** A column's base with its wall and top rows cleared: ADR 0011 Gap D freezes an extent at load, so the
 *  space above the base is an opening only because something stood there first. */
function openColumn(
  idPrefix: string,
  startMm: number,
  widthMm: number,
): readonly DesignPlacement[] {
  return [
    base(`${idPrefix}-base`, startMm, widthMm),
    body({
      id: `${idPrefix}-wall`,
      buildId: "wall-cabinet",
      startMm,
      widthMm,
      y0Mm: 1500,
      heightMm: 700,
    }),
    body({
      id: `${idPrefix}-top`,
      buildId: "wall-cabinet",
      startMm,
      widthMm,
      y0Mm: 2200,
      heightMm: 400,
    }),
  ];
}

function worldWithOpenColumns(
  placements: readonly DesignPlacement[],
): KitchenWorld {
  return clearBodies(
    syntheticWorld(placements),
    placements
      .filter(
        (placement) =>
          placement.id.endsWith("-wall") || placement.id.endsWith("-top"),
      )
      .map((placement) => placement.id),
  );
}

function seatOf(world: KitchenWorld, id: string): number | undefined {
  return world.design.placements.find((placement) => placement.id === id)?.body
    .seatDepthMm;
}

function insertedSeat(
  world: KitchenWorld,
  column: string,
  y0M: number,
  buildId: string,
): number | undefined {
  const result = insertInto(
    world,
    { kind: "void", id: voidAt(world, column, y0M).id },
    buildId,
  );
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return advance(world, result.design).design.placements.find(
    (placement) => placement.id === result.effect.placementId,
  )?.body.seatDepthMm;
}

describe("beside a full-height member the wall depth is kept (insert)", () => {
  // The neighbour column [700, 1300] stands next to a 700 fridge [0, 700] on its left, and the mirror image
  // puts an 800 tall member [1300, 2100] on its right: unequal widths either way, abutting exactly.
  const withFridgeOnTheLeft = worldWithOpenColumns([
    fridge(0),
    ...openColumn("near", 700, NEIGHBOUR_WIDTH_MM),
  ]);
  const withTallOnTheRight = worldWithOpenColumns([
    ...openColumn("near", 700, NEIGHBOUR_WIDTH_MM),
    fridge(1300, 800),
  ]);
  const alone = worldWithOpenColumns(
    openColumn("near", 700, NEIGHBOUR_WIDTH_MM),
  );

  it.each(["wall-cabinet", "wall-lift", "open-shelf"])(
    "builds a %s in the column next to the fridge exactly as it is built with nothing beside it",
    (buildId) => {
      const expected = insertedSeat(alone, "A|1.00", WALL_ROW_FLOOR_M, buildId);

      expect(expected).toBeDefined();
      expect(
        insertedSeat(withFridgeOnTheLeft, "A|1.00", WALL_ROW_FLOOR_M, buildId),
      ).toBe(expected);
      expect(
        insertedSeat(withTallOnTheRight, "A|1.00", WALL_ROW_FLOOR_M, buildId),
      ).toBe(expected);
    },
  );

  it("builds a top cabinet in that column at the wall depth too", () => {
    expect(
      insertedSeat(
        withFridgeOnTheLeft,
        "A|1.00",
        TOP_ROW_FLOOR_M,
        "wall-cabinet",
      ),
    ).toBe(CAPPED_SEAT_AT_600_MM);
  });
});

describe("over a full-height member the body is built deep (insert)", () => {
  // A 200 mm column over the LOW end of an 800 tall member: its span [0, 200] lies inside [0, 800], and the
  // centre-read overlap saw it clear ([400, 1200] against [100, 300]).
  const underATallMember = worldWithOpenColumns([
    fridge(0, 800),
    ...openColumn("narrow", 0, 200),
  ]);

  it("builds a wall cabinet over the low end of a wider tall member at the deep seat", () => {
    expect(
      insertedSeat(
        underATallMember,
        "A|0.10",
        WALL_ROW_FLOOR_M,
        "wall-cabinet",
      ),
    ).toBe(LIFTED_SEAT_AT_600_MM);
  });
});

describe("a tall body inserted beneath standing cabinets re-plans exactly the columns its span crosses", () => {
  const WALL_CABINET = "wall-cabinet";

  /** A frozen empty full-height slot [200, 800], with a cabinet stack over [600, 1200] (crossed by the slot
   *  by 200 mm) and one over [1200, 1800] (not crossed). */
  function slotWithTwoStacks(): KitchenWorld {
    return clearBodies(
      syntheticWorld([
        body({
          id: "placeholder",
          buildId: "tall-oven-tower-600",
          startMm: 200,
          widthMm: 600,
          y0Mm: 0,
          heightMm: 2200,
        }),
        base("base-near", 600, 600),
        body({
          id: "upper-near",
          buildId: WALL_CABINET,
          startMm: 600,
          widthMm: 600,
          y0Mm: 1500,
          heightMm: 700,
        }),
        base("base-far", 1200, 600),
        body({
          id: "upper-far",
          buildId: WALL_CABINET,
          startMm: 1200,
          widthMm: 600,
          y0Mm: 1500,
          heightMm: 700,
        }),
      ]),
      ["placeholder"],
    );
  }

  it("lifts the stack the tall body overlaps, and leaves the one beside it as it was", () => {
    const world = slotWithTwoStacks();
    const result = insertInto(
      world,
      { kind: "void", id: voidAt(world, "A|0.50", 0).id },
      "tall-pantry",
    );
    if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
    const after = advance(world, result.design);

    expect(seatOf(after, "upper-near")).toBe(LIFTED_SEAT_AT_600_MM);
    expect(after.design.placements.find((p) => p.id === "upper-far")).toBe(
      world.design.placements.find((p) => p.id === "upper-far"),
    );
  });

  it("re-plans nothing when the tall body only abuts the stack: a 700 fridge beside a 600 column", () => {
    const world = clearBodies(
      syntheticWorld([
        fridge(0),
        base("base", 700, NEIGHBOUR_WIDTH_MM),
        body({
          id: "upper",
          buildId: WALL_CABINET,
          startMm: 700,
          widthMm: NEIGHBOUR_WIDTH_MM,
          y0Mm: 1500,
          heightMm: 700,
        }),
      ]),
      ["fridge"],
    );
    const result = insertInto(
      world,
      { kind: "void", id: voidAt(world, "A|0.35", 0).id },
      "fridge-free",
    );
    if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
    const after = advance(world, result.design);

    expect(after.design.placements.find((p) => p.id === "upper")).toBe(
      world.design.placements.find((p) => p.id === "upper"),
    );
  });
});

describe("replace, beside and over", () => {
  /** Swaps `placementId` for `buildId` in place, and reads the seat the replacement stands at. */
  function swappedSeat(
    world: KitchenWorld,
    placementId: string,
    buildId: string,
  ): number | undefined {
    const result = insertInto(
      world,
      { kind: "placement", id: placementId },
      buildId,
    );
    if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
    const standing = world.design.placements.find(
      (placement) => placement.id === placementId,
    );
    // A swap writes a new placement id, so the replacement is found where the old body stood.
    return advance(world, result.design).design.placements.find(
      (placement) =>
        placement.wall === standing?.wall &&
        placement.alongMm === standing.alongMm &&
        placement.y0Mm === standing.y0Mm,
    )?.body.seatDepthMm;
  }

  const standingNextToTheFridge = (withFridge: boolean) =>
    syntheticWorld([
      ...(withFridge ? [fridge(0)] : []),
      base("base", 700, NEIGHBOUR_WIDTH_MM),
      body({
        id: "upper",
        buildId: "wall-cabinet",
        startMm: 700,
        widthMm: NEIGHBOUR_WIDTH_MM,
        y0Mm: 1500,
        heightMm: 700,
      }),
    ]);

  it("replaces a wall cabinet beside the fridge at the seat it would have with nothing beside it", () => {
    const expected = swappedSeat(
      standingNextToTheFridge(false),
      "upper",
      "wall-lift",
    );

    expect(expected).toBeDefined();
    expect(
      swappedSeat(standingNextToTheFridge(true), "upper", "wall-lift"),
    ).toBe(expected);
  });

  it("replaces a cabinet over the low end of a wider tall member at the deep seat", () => {
    const world = syntheticWorld([
      fridge(0, 1000),
      base("narrow", 0, 300),
      body({
        id: "upper",
        buildId: "wall-cabinet",
        startMm: 0,
        widthMm: 300,
        y0Mm: 1500,
        heightMm: 700,
      }),
    ]);

    expect(swappedSeat(world, "upper", "wall-lift")).toBe(
      LIFTED_SEAT_AT_600_MM,
    );
  });
});
