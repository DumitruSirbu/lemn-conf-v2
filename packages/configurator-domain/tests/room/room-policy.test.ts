// ADR 0108 decision 6: the engine's own room limits — since Amendment B the floor and ceiling the
// owner-approved policy is held inside, not the product's policy. **Every limit here is compared with
// the constant it is derived from**, so a limit hand-edited to a chosen number turns this file red
// (wave 7A criterion 7), and with it the guard `approved-room-policy.test.ts` rests on.
//
// **Amendment A** holds each wall minimum to the corner at *every* declared cabinet depth, and
// **wave 7D6's J1′, 2026-09-17, changed what that minimum is derived *from*, and this file with
// it.** A minimum is no longer where the reference kitchen's corner ends; it is where the
// **narrowest** corner the product will build ends, over the declared depths and taking no room
// (`corner-assembly-size.ts`, entry point 3).
//
// **That moved the bound out of the shared reader's reach, and the warning this comment used to
// carry with it.** It read that the command and the policy share the chain reader
// (`alongWallPositionAtMm`), so a reader disagreeing with the built geometry would move both sides
// of a wall-minimum assertion together. **No longer true of the bound:** its only inputs are the
// catalogue's own depth formulas, the hinged rows' declared width floor and
// `declaredCabinetDepthsMm()` — no placement, no chain and no command.
//
// **It is still true of the reference corner**, which is measured here through `setCabinetDepth` as
// the *larger* figure the bound sits below, and of every other assertion below that reads a
// placement. That the reader matches built geometry at both depths remains
// `three-adapter/tests/room-composition.parity.test.ts`'s job, not this file's.
//
// The margin between the bound and the owner's minima — criterion 4′, ruled by ADR 0125 — is pinned
// in `approved-room-policy.test.ts`, where the approved literals live.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  findOverflowingPlacementIds,
  GENERATION_PRIORITIES,
  KITCHEN_L_DESIGN,
  LEVELS,
  LINEAR_ROOM_DEPTH_MM,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_HEIGHT_MM,
  MAX_ROOM_WIDTH_MM,
  narrowestCornerReachMm,
  setCabinetDepth,
  toMillimetres,
  type Design,
} from "../../src/index.js";
import { twoCornersWallAMinimumMm } from "../../src/corner-assembly-size.js";
import { ENGINE_ROOM_LIMITS } from "../../src/room/room-policy.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import {
  engineLinearWallBounds,
  engineLWallBounds,
  engineUWallBounds,
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

  // ADR 0130 D2 (7J S1): the engine's own limits now derive a straight kitchen's bounds too, ahead
  // of the owner-approved policy stating them (ADR 0108 Amendment G, wave 7J S5) — this object was
  // always the floor and ceiling a product policy sits inside. M7B U2 S2 adds the U's own bounds
  // here, still `interim-unapproved`; the owner's own U bounds land in `APPROVED_ROOM_POLICY` at U6.
  it("builds the L, the straight kitchen and the U, and no other shape", () => {
    expect(Object.keys(ENGINE_ROOM_LIMITS.buildableShapes)).toEqual([
      "L",
      "linear",
      "U",
    ]);
  });
});

describe("ENGINE_ROOM_LIMITS — every bound is the constant it is derived from", () => {
  // **Restated by wave 7D6's J1′, 2026-09-17.** Until then a wall minimum was where the *reference*
  // kitchen's corner ends, and this case asserted that equality. The generator now sizes a corner to
  // the room it builds in (ADR 0120 Amendment A), so the binding case is the **narrowest** corner the
  // product will build — a cabinet with one door at each of the three levels — and it is
  // room-independent. Equality still, not a floor: the bound is `narrowestCornerReachMm`'s own answer
  // and nothing else, and it is pinned as a literal beside it so a derivation that moves is read here
  // as a failing figure. The reference corner's own reach is asserted below, where it is now the
  // *larger* number.
  it.each([
    ["A", () => engineLWallBounds().wallA.minMm],
    ["B", () => engineLWallBounds().wallB.minMm],
  ] as const)(
    "wall %s's minimum is the narrowest corner's reach at any declared cabinet depth",
    (wall, readMinimumMm) => {
      expect(readMinimumMm()).toBe(narrowestCornerReachMm(wall).wallMinimumMm);
      expect(readMinimumMm()).toBe(880);
    },
  );

  // The margin wave 7D6's criterion 4′ pins, ruled by ADR 0125 rather than open on Q-K1: the corner
  // the shell still *places* is the reference one, which reaches farther than the bound on both
  // walls. A guard that read the reference corner here would have to move the bound to stay green,
  // which is how an owner-approved number moves without the owner.
  it.each([
    ["A", WALL_A_CORNER_IDS, () => engineLWallBounds().wallA.minMm],
    ["B", WALL_B_CORNER_IDS, () => engineLWallBounds().wallB.minMm],
  ] as const)(
    "sits below where wall %s's own reference corner ends, at the depth that reaches farthest",
    (_wall, cornerIds, readMinimumMm) => {
      expect(readMinimumMm()).toBeLessThan(
        farthestCornerEdgeAtAnyDepthMm(cornerIds),
      );
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

// ADR 0130 D2 (wave 7J S1): the straight kitchen's one wall, with no coupled minimum-kitchen block —
// the rule collapses to "wall A holds a sink and a hob" once there is no second wall to couple it
// against, so the wall's own minimum already states it.
describe("ENGINE_ROOM_LIMITS.linear — derived, and states no minimumKitchen", () => {
  it("wall A's minimum is the generated sink plus the generated hob", () => {
    const sink = GENERATION_PRIORITIES.find((p) => p.role === "sink");
    const hob = GENERATION_PRIORITIES.find((p) => p.role === "hob");

    expect(sink?.required).toBe(true);
    expect(hob?.required).toBe(true);
    expect(engineLinearWallBounds().wallA.minMm).toBe(
      (sink?.widthMm ?? 0) + (hob?.widthMm ?? 0),
    );
    expect(engineLinearWallBounds().wallA.minMm).toBe(1200);
  });

  // Q-7J-1 / ADR 0108 Amendment G: one maximum for every wall — the L's two and the straight wall's
  // one all read the same storage ceiling.
  it("wall A's maximum equals the L's wall A and wall B maxima — one ceiling for every wall", () => {
    expect(engineLinearWallBounds().wallA.maxMm).toBe(MAX_ROOM_WIDTH_MM);
    expect(engineLinearWallBounds().wallA.maxMm).toBe(
      engineLWallBounds().wallA.maxMm,
    );
    expect(engineLinearWallBounds().wallA.maxMm).toBe(
      engineLWallBounds().wallB.maxMm,
    );
  });

  it("states no minimumKitchen key at all", () => {
    expect("minimumKitchen" in engineLinearWallBounds()).toBe(false);
  });

  it("carries the seeded shell's own depth, for validation to fix a straight room's depthMm to", () => {
    expect(engineLinearWallBounds().depthMm).toBe(LINEAR_ROOM_DEPTH_MM);
  });
});

// M7B U2 S2 (AC5): the U's three walls, still `interim-unapproved` and derived the same way the L's
// and the straight kitchen's are — no chosen number, only what `corner-assembly-size.ts` and
// `design-bounds.ts` already state. The regex sweep above already proves no numeric literal stands
// in `room-policy.ts`'s text; these compare the *values* with the sources ADR 0132 decision 4 names.
describe("ENGINE_ROOM_LIMITS.U — derived, with its minimum kitchen", () => {
  it("wall A's minimum clears both corners' X-legs, never one corner's own reach", () => {
    expect(engineUWallBounds().wallA.minMm).toBe(twoCornersWallAMinimumMm());
    expect(engineUWallBounds().wallA.minMm).toBeGreaterThan(
      narrowestCornerReachMm("A").wallMinimumMm,
    );
  });

  // Wall C's own narrowest reach cannot be read from `narrowestCornerReachMm("C")` — the assembly
  // holds no wall-C piece to derive it from (`corner-assembly-size.ts`'s own guard) — so it reads
  // wall B's, the number the right corner's own reach is proven identical to.
  it("wall B's and wall C's minima both read the narrowest corner's reach on wall B", () => {
    const walls = engineUWallBounds();

    expect(walls.wallB.minMm).toBe(narrowestCornerReachMm("B").wallMinimumMm);
    expect(walls.wallC.minMm).toBe(narrowestCornerReachMm("B").wallMinimumMm);
  });

  it("every wall's maximum is the same storage ceiling every other wall reads", () => {
    const walls = engineUWallBounds();

    expect(walls.wallA.maxMm).toBe(MAX_ROOM_WIDTH_MM);
    expect(walls.wallB.maxMm).toBe(MAX_ROOM_DEPTH_MM);
    expect(walls.wallC.maxMm).toBe(MAX_ROOM_DEPTH_MM);
  });

  it.each(["sink", "hob"] as const)(
    "takes the generated %s width for its minimum kitchen from the required composition priority (ADR 0108 H3)",
    (role) => {
      const priority = GENERATION_PRIORITIES.find(
        (candidate) => candidate.role === role,
      );

      expect(priority?.required).toBe(true);
      expect(engineUWallBounds().minimumKitchen[`${role}WidthMm`]).toBe(
        priority?.widthMm,
      );
    },
  );

  it("derives the minimum kitchen's corner reaches from the bounds that already clear them: two X-legs on wall A, one narrowest reach on a side wall", () => {
    const walls = engineUWallBounds();

    expect(walls.minimumKitchen.cornerReachMm).toStrictEqual({
      wallA: walls.wallA.minMm,
      sideWall: walls.wallB.minMm,
    });
  });

  it("keeps the derived minimum informational in the engine envelope; the owner's literals are U6's", () => {
    expect(engineUWallBounds().minimumKitchen.isRequired).toBe(false);
  });
});

describe("ENGINE_ROOM_LIMITS — every room it accepts is a room a design can store", () => {
  // ADR 0108 decision 7: an owner maximum above storage lands as a deliberate `design-bounds.ts`
  // change, never as a policy value the write seam then refuses.
  it.each([
    ["wall A", () => engineLWallBounds().wallA, MAX_ROOM_WIDTH_MM],
    ["wall B", () => engineLWallBounds().wallB, MAX_ROOM_DEPTH_MM],
    ["linear wall A", () => engineLinearWallBounds().wallA, MAX_ROOM_WIDTH_MM],
    ["U wall A", () => engineUWallBounds().wallA, MAX_ROOM_WIDTH_MM],
    ["U wall B", () => engineUWallBounds().wallB, MAX_ROOM_DEPTH_MM],
    ["U wall C", () => engineUWallBounds().wallC, MAX_ROOM_DEPTH_MM],
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

// **Re-pointed at the owner's minima by wave 7D6's J1′, 2026-09-17, and the reason is the subject
// rather than the room.** This block instantiates the **reference** corner — the one
// `buildLShellDesign` still copies at its own size until wave 7D7 parameterises the builders — so the
// smallest room it can stand in is the smallest room the *product* admits, which is
// `APPROVED_ROOM_POLICY`'s 900 × 1000. The engine's own minimum is now lower (880 on both walls, the
// narrowest corner the product will build), and between the two lies a window no product path
// reaches: a customer's room is judged against the approved policy (`apps/web/src/room/
// room-url-state.ts`). That the derived corner fits the bound that admits it — containment and
// attainment — is wave 7D6 criterion 12, in `tests/corner-assembly-size.test.ts`.
describe("APPROVED_ROOM_POLICY — a room at the wall minima holds the reference corner at every declared depth", () => {
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
    const walls = APPROVED_ROOM_POLICY.buildableShapes.L;
    if (!walls) throw new Error("the approved policy builds no L");
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
