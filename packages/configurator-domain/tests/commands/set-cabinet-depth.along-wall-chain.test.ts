// Wave 6J-c — what the depth command now does to wall B's run, and what it still must not do.
//
// **The defect this closes, in one measurement.** Both walls walk from the same corner
// (`room-transforms.ts`), so a wall-A body at the corner occupies wall B's along-wall interval
// `[0, its frame depth]`. At `14cef90` the command rebuilt every body's depth and moved none of them
// along its wall, so at 700 mm the seeded kitchen did not compose: `base-corner-return-320`'s near
// edge stood at 580 against `base-corner-x-900`'s 660, and the two wall corner returns' at 330
// against the wall band's 361 — 80 mm and 31 mm of carcass driven into wall A's run, with
// `validateDesignForCatalog` returning `[]` on the design.
//
// The two numbers are **different**, which is the whole reason `alongWallPositionFollows` selects
// between two chains rather than labelling one. Every clearance assertion below is therefore made
// **per chain**, with a stated member count per arm: a sweep over both bands with one floor can pass
// while landing entirely on the arm that was already right (ADR 0089 decision 3).
import { describe, expect, it } from "vitest";

import { cabinetDepthRuleOf } from "../../src/cabinet-depth-rule.js";
import type { AlongWallDepthChain } from "../../src/cabinet-depth-rule.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import type { Design, DesignPlacement } from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { findOverflowingPlacementIds } from "../../src/queries/overflowing-placements.js";
import type { BodyCatalog } from "../../src/void-engine.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-06T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;

/** The wall-A body each chain's wall-B bodies stand against, named because the two bands stand
 *  against **different** neighbours and that is the fact the declaration encodes. Their reach is
 *  read off the catalogue row rather than recomputed here, so this file measures the corner the
 *  fixture actually builds rather than restating the production formula. */
const CORNER_NEIGHBOUR_ON: Record<AlongWallDepthChain, string> = {
  "base-formula": "base-corner-x-900",
  "wall-map": "wall-2door-600",
};

/** How many wall-B bodies each arm must actually carry, so neither assertion below can go vacuous
 *  or quietly shrink to one body. Seven on the base chain and two on the wall map, in the seeded
 *  kitchen as it stands. */
const MEMBERS_PER_CHAIN: Record<AlongWallDepthChain, number> = {
  "base-formula": 7,
  "wall-map": 2,
};

function changeTo(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

function alongById(design: Design): ReadonlyMap<string, number> {
  return new Map(
    design.placements.map((placement) => [placement.id, placement.alongMm]),
  );
}

function spanOf(placement: DesignPlacement): readonly [number, number] {
  const half = placement.body.widthMm / 2;
  return [placement.alongMm - half, placement.alongMm + half];
}

function spanById(design: Design, id: string): readonly [number, number] {
  const placement = design.placements.find((candidate) => candidate.id === id);
  if (!placement) throw new Error(`no placement ${id}`);
  return spanOf(placement);
}

function chainOf(catalog: BodyCatalog, buildId: string): AlongWallDepthChain {
  return cabinetDepthRuleOf({ buildId, rule: catalog.get(buildId)?.depthRule })
    .alongWallPositionFollows;
}

function cornerReachMm(
  catalog: BodyCatalog,
  chain: AlongWallDepthChain,
): number {
  const neighbour = CORNER_NEIGHBOUR_ON[chain];
  const definition = catalog.get(neighbour);
  if (!definition) throw new Error(`no catalogue entry ${neighbour}`);
  return definition.frameDepthMm;
}

/** The nearest a wall-B body on this chain comes to the corner, less how far wall A's corner body on
 *  that same chain reaches into wall B — negative means carcass through carcass. Returned per chain
 *  together with the member count, because a clearance with no count behind it is a predicate over a
 *  band nobody has checked is populated. */
function cornerHeadroomMm(
  design: Design,
  cabinetDepthMm: number,
): ReadonlyMap<AlongWallDepthChain, { headroomMm: number; members: number }> {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
  const measured = new Map<
    AlongWallDepthChain,
    { headroomMm: number; members: number }
  >();
  for (const placement of design.placements) {
    if (placement.wall !== "B") continue;
    const chain = chainOf(catalog, placement.body.buildId);
    const headroomMm = spanOf(placement)[0] - cornerReachMm(catalog, chain);
    const seen = measured.get(chain);
    measured.set(chain, {
      headroomMm: Math.min(seen?.headroomMm ?? headroomMm, headroomMm),
      members: (seen?.members ?? 0) + 1,
    });
  }
  return measured;
}

describe("wall B's run at the deeper setting", () => {
  // Not a sum of widths and not a hand projection: the spans the command writes, body by body. The
  // run ends at 2900 because the corner took 100 mm of it, which is the geometry ADR 0065 and every
  // wall-coverage record since have been reasoning about.
  it("stands where the corner leaves it, body by body", () => {
    const deep = changeTo(KITCHEN_L_DESIGN, DEEP_MM);

    // [680, 1000] → [670, 1000] (ADR 0135): the return starts at the run's carcass front, `D − 30`.
    expect(spanById(deep, "p26")).toEqual([670, 1000]);
    expect(spanById(deep, "p5")).toEqual([1000, 1600]);
    expect(spanById(deep, "p6")).toEqual([1600, 2200]);
    expect(spanById(deep, "p7")).toEqual([2200, 2900]);
    expect(spanById(deep, "p9")).toEqual([400, 970]);
    expect(spanById(deep, "p21")).toEqual([400, 970]);
  });

  // **The 30 mm the two chains differ by, asserted rather than smoothed.** `p21` is on the wall map
  // and moved 70; `p22` beside it is on the base formula and moved 100. A wave that made this row
  // contiguous would have collapsed the two chains into one and changed the product (wave 6A3's
  // "never a sum of widths").
  it("leaves a 30 mm gap in the top row where the two chains part", () => {
    const deep = changeTo(KITCHEN_L_DESIGN, DEEP_MM);

    const [, p21EndsAt] = spanById(deep, "p21");
    const [p22StartsAt] = spanById(deep, "p22");

    expect(p21EndsAt).toBe(970);
    expect(p22StartsAt).toBe(1000);
    expect(p22StartsAt - p21EndsAt).toBe(30);
  });

  it("does not move wall A", () => {
    const before = alongById(KITCHEN_L_DESIGN);
    const deep = changeTo(KITCHEN_L_DESIGN, DEEP_MM);

    const wallA = deep.placements.filter((placement) => placement.wall === "A");
    expect(wallA.length).toBeGreaterThan(0);
    for (const placement of wallA) {
      expect(placement.alongMm, placement.id).toBe(before.get(placement.id));
    }
  });
});

describe("the corner clearance, per chain", () => {
  // **The criterion the wave exists for**, and it is two assertions rather than one because the two
  // arms carry different numbers: +20 mm on the base chain and +39 mm on the wall map. Both are
  // preserved exactly by the change — the run slid by what the corner gained, no more and no less —
  // and both are checked with the arm's member count beside them.
  it.each([
    ["base-formula", 20],
    ["wall-map", 39],
  ] as const)(
    "keeps %s's headroom at the corner at both settings",
    (chain, expectedMm) => {
      const shallow = cornerHeadroomMm(KITCHEN_L_DESIGN, SHALLOW_MM).get(chain);
      const deep = cornerHeadroomMm(
        changeTo(KITCHEN_L_DESIGN, DEEP_MM),
        DEEP_MM,
      ).get(chain);

      expect(shallow?.members).toBe(MEMBERS_PER_CHAIN[chain]);
      expect(deep?.members).toBe(MEMBERS_PER_CHAIN[chain]);
      expect(shallow?.headroomMm).toBe(expectedMm);
      expect(deep?.headroomMm).toBe(expectedMm);
    },
  );

  // The premise the two rows above rest on, stated so this file cannot quietly become a sweep with
  // one floor: the arms measure different distances, so a single uniform shift cannot satisfy both.
  it("measures two arms that are genuinely different distances", () => {
    const deep = cornerHeadroomMm(changeTo(KITCHEN_L_DESIGN, DEEP_MM), DEEP_MM);

    expect(deep.get("base-formula")?.headroomMm).not.toBe(
      deep.get("wall-map")?.headroomMm,
    );
  });

  // No wall-B body on either chain is inside wall A's corner reach — the composition defect stated
  // positively, over every wall-B body rather than over the nearest one on each arm.
  it("puts no wall-B body inside wall A's corner reach at 700", () => {
    const deep = changeTo(KITCHEN_L_DESIGN, DEEP_MM);
    const catalog = buildKitchenLBodyCatalog(DEEP_MM);

    const wallB = deep.placements.filter((placement) => placement.wall === "B");
    expect(wallB.length).toBe(
      MEMBERS_PER_CHAIN["base-formula"] + MEMBERS_PER_CHAIN["wall-map"],
    );
    for (const placement of wallB) {
      const chain = chainOf(catalog, placement.body.buildId);
      expect(
        spanOf(placement)[0],
        `${placement.id} on ${chain}`,
      ).toBeGreaterThan(cornerReachMm(catalog, chain));
    }
  });
});

describe("what the shift must not change", () => {
  // **Value-preserving at 600.** The shift is a difference of two reaches, so it is exactly zero
  // when the setting does not move, and every coordinate the command writes is the fixture's.
  it("writes the seeded coordinates back when the setting does not change", () => {
    const before = alongById(KITCHEN_L_DESIGN);
    const same = changeTo(KITCHEN_L_DESIGN, SHALLOW_MM);

    expect(same.placements.length).toBe(KITCHEN_L_DESIGN.placements.length);
    for (const placement of same.placements) {
      expect(placement.alongMm, placement.id).toBe(before.get(placement.id));
    }
  });

  // ADR 0055 declines to promise the whole document round-trips, and this is the narrower claim it
  // does not decline: the along-wall coordinate is a pure function of the setting and the
  // declaration, so there and back is the identity on every body.
  it("returns every alongMm to its original value over 600 → 700 → 600", () => {
    const before = alongById(KITCHEN_L_DESIGN);
    const returned = [DEEP_MM, SHALLOW_MM].reduce(changeTo, KITCHEN_L_DESIGN);

    for (const placement of returned.placements) {
      expect(placement.alongMm, placement.id).toBe(before.get(placement.id));
    }
  });

  // ADR 0065: a body the slide pushes past the end of its wall is **marked**, never moved back and
  // never a refusal — and ADR 0083 decision 1 then gave the demo a wall long enough that the slide
  // does not push anything past it. The run ends at 2900 and the room declares 2920, so the answer
  // here is the empty list *because the run fits*, not because the command silently did nothing:
  // `p7` really did move to 2900, which is the fact the broken command could not produce.
  //
  // The marking keeps its demo on `OVERFLOWING_KITCHEN_L_DESIGN`, a document that really overruns.
  it("slides the run to its wall's end without pushing anything past it", () => {
    const deep = changeTo(KITCHEN_L_DESIGN, DEEP_MM);

    expect(spanById(deep, "p7")[1]).toBe(2900);
    expect(deep.room.depthMm).toBe(2920);
    expect(findOverflowingPlacementIds(deep)).toEqual([]);
  });
});
