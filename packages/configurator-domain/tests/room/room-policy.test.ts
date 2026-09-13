// ADR 0108 decision 6: the engine's own room limits — since Amendment B the floor and ceiling the
// owner-approved policy is held inside, not the product's policy. **Every limit here is compared with
// the constant it is derived from**, so a limit hand-edited to a chosen number turns this file red
// (wave 7A criterion 7), and with it the guard `approved-room-policy.test.ts` rests on.
//
// **Amendment A** holds each wall minimum to the corner at *every* declared cabinet depth, so the
// wall minima are re-derived here from `setCabinetDepth`'s own output rather than read off the
// reference kitchen at its one depth. **What that does not prove:** the command and the policy share
// the chain reader (`alongWallPositionAtMm`), so a reader that disagreed with the built geometry
// would move both sides together. That the reader matches built geometry at both depths is
// `three-adapter/tests/room-composition.parity.test.ts`'s job, not this file's.
import { describe, expect, it } from "vitest";

import {
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  findOverflowingPlacementIds,
  GENERATION_PRIORITIES,
  KITCHEN_L_DESIGN,
  LEVELS,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_HEIGHT_MM,
  MAX_ROOM_WIDTH_MM,
  setCabinetDepth,
  toMillimetres,
  type Design,
} from "../../src/index.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import {
  engineLWallBounds,
  lInputFromRoom,
  validateRoom,
} from "../support/room-input.js";

const OCCURRED_AT = "2026-09-11T10:00:00.000Z";

/** ADR 0108's *Context*: `base-corner-x-900` is the corner on wall A, and `base-corner-return-320`,
 *  `wall-corner-return-570` and `wall-corner-return-570-top` are its legs on wall B. Named by id
 *  rather than found by the policy's own structural-corner filter, so the two have to agree. */
const WALL_A_CORNER_IDS = ["p25"] as const;
const WALL_B_CORNER_IDS = ["p26", "p9", "p21"] as const;
const CORNER_IDS: readonly string[] = [
  ...WALL_A_CORNER_IDS,
  ...WALL_B_CORNER_IDS,
];

function atCabinetDepth(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    throw new Error(
      `setCabinetDepth refused ${String(cabinetDepthMm)}: ${result.reason.code}`,
    );
  }
  return result.design;
}

function farEdgeOfPlacementMm(design: Design, placementId: string): number {
  const placement = design.placements.find(({ id }) => id === placementId);
  if (placement === undefined) {
    throw new Error(`the design has no placement ${placementId}`);
  }
  return placement.alongMm + placement.body.widthMm / 2;
}

/** The farthest these corner pieces end in `setCabinetDepth`'s output, over every declared depth. */
function farthestCornerEdgeAtAnyDepthMm(cornerIds: readonly string[]): number {
  const farEdgesMm = declaredCabinetDepthsMm().flatMap((cabinetDepthMm) => {
    const deepened = atCabinetDepth(KITCHEN_L_DESIGN, cabinetDepthMm);
    return cornerIds.map((id) => farEdgeOfPlacementMm(deepened, id));
  });
  return Math.max(...farEdgesMm);
}

function baseRowTopM(): number {
  const baseRow = LEVELS[0];
  if (baseRow === undefined) throw new Error("LEVELS declares no base row");
  return baseRow[1];
}

describe("ENGINE_ROOM_LIMITS — never presented as the owner's", () => {
  it("is marked interim-unapproved, so it cannot pass for the approved policy", () => {
    expect(ENGINE_ROOM_LIMITS.approval).toBe("interim-unapproved");
  });

  it("builds the L and no other shape", () => {
    expect(Object.keys(ENGINE_ROOM_LIMITS.buildableShapes)).toEqual(["L"]);
  });
});

describe("ENGINE_ROOM_LIMITS — every bound is the constant it is derived from", () => {
  // Equality, not a floor: a minimum derived from the other wall's corner, or from one depth only,
  // is at least as large on one wall and turns red here on the other (Amendment A).
  it.each([
    ["A", WALL_A_CORNER_IDS, () => engineLWallBounds().wallA.minMm],
    ["B", WALL_B_CORNER_IDS, () => engineLWallBounds().wallB.minMm],
  ] as const)(
    "wall %s's minimum is the farthest its structural corner reaches at any declared cabinet depth",
    (_wall, cornerIds, readMinimumMm) => {
      expect(readMinimumMm()).toBe(farthestCornerEdgeAtAnyDepthMm(cornerIds));
    },
  );

  it("sweeps a depth at which wall B's corner reaches past where the reference kitchen puts it", () => {
    const referenceEdgesMm = WALL_B_CORNER_IDS.map((id) =>
      farEdgeOfPlacementMm(KITCHEN_L_DESIGN, id),
    );

    expect(declaredCabinetDepthsMm().length).toBeGreaterThan(1);
    expect(farthestCornerEdgeAtAnyDepthMm(WALL_B_CORNER_IDS)).toBeGreaterThan(
      Math.max(...referenceEdgesMm),
    );
  });

  it("wall A's maximum is the widest room a design can store", () => {
    expect(engineLWallBounds().wallA.maxMm).toBe(MAX_ROOM_WIDTH_MM);
  });

  it("wall B's maximum is the deepest room a design can store", () => {
    expect(engineLWallBounds().wallB.maxMm).toBe(MAX_ROOM_DEPTH_MM);
  });

  it.each(["sink", "hob"] as const)(
    "takes the generated %s width from the required composition priority",
    (role) => {
      const priority = GENERATION_PRIORITIES.find(
        (candidate) => candidate.role === role,
      );
      const minimum = engineLWallBounds().minimumKitchen;

      expect(priority?.required).toBe(true);
      expect(minimum[`${role}WidthMm`]).toBe(priority?.widthMm);
    },
  );

  it("uses the same derived corner reaches for the bounds and the minimum kitchen", () => {
    const walls = engineLWallBounds();

    expect(walls.minimumKitchen.cornerReachMm).toStrictEqual({
      wallA: walls.wallA.minMm,
      wallB: walls.wallB.minMm,
    });
  });

  it("keeps the derived minimum informational in the engine envelope", () => {
    expect(engineLWallBounds().minimumKitchen.isRequired).toBe(false);
  });

  it("the height minimum is the top of the base row, below which no cabinet stands", () => {
    expect(ENGINE_ROOM_LIMITS.heightBounds.minMm).toBe(
      toMillimetres(baseRowTopM()),
    );
  });

  it("the height maximum is the tallest room a design can store", () => {
    expect(ENGINE_ROOM_LIMITS.heightBounds.maxMm).toBe(MAX_ROOM_HEIGHT_MM);
  });
});

describe("ENGINE_ROOM_LIMITS — every room it accepts is a room a design can store", () => {
  // ADR 0108 decision 7: an owner maximum above storage lands as a deliberate `design-bounds.ts`
  // change, never as a policy value the write seam then refuses.
  it.each([
    ["wall A", () => engineLWallBounds().wallA, MAX_ROOM_WIDTH_MM],
    ["wall B", () => engineLWallBounds().wallB, MAX_ROOM_DEPTH_MM],
    ["height", () => ENGINE_ROOM_LIMITS.heightBounds, MAX_ROOM_HEIGHT_MM],
  ] as const)(
    "%s stays inside the wire bound for its axis",
    (_axis, readBounds, wireMaximumMm) => {
      const { minMm, maxMm } = readBounds();

      expect(minMm).toBeGreaterThan(0);
      expect(minMm).toBeLessThanOrEqual(maxMm);
      expect(maxMm).toBeLessThanOrEqual(wireMaximumMm);
    },
  );

  it("accepts the seeded kitchen's own room, and hands back exactly that room", () => {
    const result = validateRoom(lInputFromRoom(KITCHEN_L_DESIGN.room));

    expect(result).toEqual({ ok: true, room: KITCHEN_L_DESIGN.room });
  });
});

describe("ENGINE_ROOM_LIMITS — a room at the wall minima holds its corner at every declared depth", () => {
  /** The reference kitchen's corner and nothing else, in a room of the given walls, tall enough for
   *  the corner's own top row. */
  function cornerOnlyDesign(walls: {
    readonly wallAMm: number;
    readonly wallBMm: number;
  }): Design {
    const corners = KITCHEN_L_DESIGN.placements.filter(({ id }) =>
      CORNER_IDS.includes(id),
    );
    const cornerTopMm = Math.max(
      ...corners.map(({ y0Mm, body }) => y0Mm + body.heightMm),
    );
    return {
      ...KITCHEN_L_DESIGN,
      room: {
        shape: "L",
        widthMm: walls.wallAMm,
        depthMm: walls.wallBMm,
        heightMm: cornerTopMm,
      },
      placements: corners,
    };
  }

  function atTheMinima(): {
    readonly wallAMm: number;
    readonly wallBMm: number;
  } {
    const walls = engineLWallBounds();
    return { wallAMm: walls.wallA.minMm, wallBMm: walls.wallB.minMm };
  }

  it("builds the corner-only room at a height the policy accepts", () => {
    const { heightMm } = cornerOnlyDesign(atTheMinima()).room;

    expect(heightMm).toBeGreaterThanOrEqual(
      ENGINE_ROOM_LIMITS.heightBounds.minMm,
    );
    expect(heightMm).toBeLessThanOrEqual(ENGINE_ROOM_LIMITS.heightBounds.maxMm);
  });

  it.each(declaredCabinetDepthsMm())(
    "marks no corner piece past its wall at %i mm, with both walls at their minima",
    (cabinetDepthMm) => {
      const deepened = atCabinetDepth(
        cornerOnlyDesign(atTheMinima()),
        cabinetDepthMm,
      );

      expect(findOverflowingPlacementIds(deepened)).toEqual([]);
    },
  );

  it("marks the base corner return past wall B at the deepest depth, one millimetre under the minimum", () => {
    const { wallAMm, wallBMm } = atTheMinima();
    const deepestCabinetDepthMm = Math.max(...declaredCabinetDepthsMm());

    const deepened = atCabinetDepth(
      cornerOnlyDesign({ wallAMm, wallBMm: wallBMm - 1 }),
      deepestCabinetDepthMm,
    );

    // Amendment A's table: at 700 `p26` ends at 1000 and the two wall-band returns at 970, so only
    // the base return is past a 999 mm wall.
    expect(findOverflowingPlacementIds(deepened)).toEqual(["p26"]);
  });
});
