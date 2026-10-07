// Which depth `insertBody` builds against: `DEVELOPMENT-SPEC.md` §5.2's `b.mk(w, h, void.d)` and §5.3's "the
// current body's `frame` **is** the target opening". The depth comes from the void, not `target.column.d` (§3.2's MAX
// over the vertical run), so a wall cabinet is not built to the depth of the base cabinet under it. The numbers
// are `frame.d` (ADR 0018): twice a body's rear overhang, equal to the depth only for `wallCabinet` and
// `openShelf`, the population this file sweeps.
import { describe, expect, it } from "vitest";

import {
  WALL_CABINET_KIND,
  WALL_CORNER_RETURN_KIND,
  WALL_CORNER_RETURN_TOP_KIND,
} from "../../src/body-kinds.js";
import { openingFromPlacement } from "../../src/commands/insert-fit.js";
import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../../src/millimetres.js";
import { offersFor } from "../../src/queries/offers.js";
import type { PlacementRecord, VoidRecord } from "../../src/void-engine.js";
import { clearBodies, insertInto } from "../support/commands.js";
import { createFakeProbe } from "../support/fake-probe.js";
import {
  advance,
  advancePast,
  createWorld,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";

const seeded = (): KitchenWorld =>
  createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);

/** Every seeded body a wall cabinet can be swapped into, less the structural corner returns §13.1 forbids
 *  replacing. Swept rather than sampled: the wrong rule read 330, 500 and 600. */
function replaceableWallBodies(world: KitchenWorld): PlacementRecord[] {
  return world.records.filter(
    (record) =>
      (record.band === "wall" || record.band === "top") && record.canReplace,
  );
}

/** A wall entry bounded 300-800 with no hole in the middle, so it fills whatever opening it is swapped into:
 *  depth is this file's subject, so the body swapped in must not refuse on width halfway through. */
const SWAP_BUILD_ID = "open-shelf";

/** §7's head-clearance cap on a wall carcass over a worktop, in metres, at the shipped 600 mm worktop. Restated
 *  rather than imported from `insert-fit.ts`: a test that reads the number it checks out of the code under test
 *  moves with it. Both read the worktop to wall depth map that `worktop-depth.test.ts` gates. */
const CAP_OVER_WORKTOP_M = 0.33;

/** The same rule in millimetres, for the assertions that read a recorded `seatDepthMm`. */
const CAP_OVER_WORKTOP_MM = 330;

/** §7's head-clearance cap in the one shipped case where it bites on a swap, stated as data rather than a re-run
 *  of the rule: of the seeded wall bodies deeper than 330 mm, only the hood (`p13`) stands over something that is
 *  not a full-height unit. The three deep cabinets on wall B hang over full-height `p5`, `p6` and `p7`, where the
 *  cap is lifted and they keep their depth (ADR 0060). */
const CAPPED_BY_HEAD_CLEARANCE_MM: Readonly<Record<string, number>> = {
  p13: 330,
};

/** ADR 0036 decision 1: a declared dimension is the finished cabinet, so `wallCabinet` builds its shell at the
 *  declared depth less an 18 mm door and the 21 mm its bar handle stands proud. A seeded wall row's `frame.d` is
 *  therefore the shell (291 where the cabinet is 330), and a replacement is built against the declared depth.
 *  Reading `frame.d` as the depth would compound 330, 291, 252 on successive swaps, unseen by `refuseBuiltSize`;
 *  the two-swap round trip below asserts it does not (ADR 0018 clause 4). */
const WALL_FRONT_ASSEMBLY_MM = 39;

/** The same cap as recorded: 330 is the finished depth, so the stored seat (`seatDepthMm`) is that less the 39 mm
 *  door-and-handle front assembly. The two stay apart: the cap is about the cabinet a person leans under, the
 *  stored number about where its back face lands (ADR 0018). */
const CAP_OVER_WORKTOP_SEAT_MM = CAP_OVER_WORKTOP_MM - WALL_FRONT_ASSEMBLY_MM;

/** The kinds whose builder stands a door in front of the shell; the two corner returns (ADR 0066) are still
 *  fronted wall carcasses. */
const FRONTED_WALL_KINDS: readonly string[] = [
  WALL_CABINET_KIND,
  WALL_CORNER_RETURN_KIND,
  WALL_CORNER_RETURN_TOP_KIND,
];

/** An open shelf and a hood carry no front assembly, so only a fronted wall carcass needs the
 *  correction. Keyed on the seeded row's `kind`, which is what the production rule reads. */
function declaredDepthMm(record: PlacementRecord): number {
  const seatMm = toMillimetres(record.frame.d);
  return FRONTED_WALL_KINDS.includes(record.kind)
    ? seatMm + WALL_FRONT_ASSEMBLY_MM
    : seatMm;
}

describe("insertBody — the depth a swap in place builds against (§5.3)", () => {
  const world = seeded();
  const targets = replaceableWallBodies(world);

  it("sweeps every seeded wall and top body, and the column depth really does differ", () => {
    // Guards the sweep against going vacuous: if every target's own depth equalled its column's, the assertions
    // would hold under the defect too.
    expect(targets.length).toBeGreaterThanOrEqual(13);
    const differing = targets.filter(
      (record) => world.columns.get(record.col)?.d !== record.frame.d,
    );
    expect(differing.length).toBeGreaterThanOrEqual(7);
  });

  it.each(
    replaceableWallBodies(seeded()).map((record) => ({
      id: record.id,
      buildId: record.buildId,
      depthMm:
        CAPPED_BY_HEAD_CLEARANCE_MM[record.id] ?? declaredDepthMm(record),
    })),
  )(
    "builds a replacement for $id ($buildId) against its own $depthMm mm, not its column's",
    ({ id, depthMm }) => {
      const probe = createFakeProbe();
      const result = insertInto(
        world,
        { kind: "placement", id },
        SWAP_BUILD_ID,
        probe,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(probe.requests.map((request) => toMillimetres(request.depthM))) //
        .toEqual([depthMm]);
      const placed = result.design.placements.find(
        (placement) => placement.id === result.effect.placementId,
      );
      expect(placed?.body.seatDepthMm).toBe(depthMm);
    },
  );

  it("keeps the depth stable when the same body is swapped twice", () => {
    // The round trip ADR 0018 warns about: an inserted placement's `frame.d` is its own persisted
    // seat, so a second swap must read back the same number rather than growing or shrinking it.
    const first = insertInto(
      world,
      { kind: "placement", id: "p11" },
      SWAP_BUILD_ID,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const after = createWorld(first.design, world.catalog);
    const probe = createFakeProbe();
    const second = insertInto(
      { ...after, columns: world.columns },
      { kind: "placement", id: first.effect.placementId },
      "wall-lift",
      probe,
    );

    expect(second.ok).toBe(true);
    expect(probe.requests[0]?.depthM).toBeCloseTo(0.33, 9);
  });
});

describe("insertBody — the depth an insert into an empty void builds against (§5.2)", () => {
  /** The seeded kitchen with a wall body, a top body and two whole columns taken out, so the sweep sees openings
   *  of three different depths rather than one repeated. */
  function openedWorld(): KitchenWorld {
    return clearBodies(advancePast(seeded(), ["p9", "p21"]), [
      "p7",
      "p24",
      "p11",
      "p18",
    ]);
  }

  function firstOfferedBuildId(
    world: KitchenWorld,
    record: VoidRecord,
  ): string | undefined {
    return offersFor({
      records: world.records,
      voids: world.voids,
      columns: world.columns,
      catalog: world.catalog,
      cabinetDepthMm: world.cabinetDepthMm,
      target: { kind: "void", id: record.id },
    })[0]?.buildId;
  }

  /** The four voids in this opened kitchen where §7's cap bites: every wall-level opening that offers a wall
   *  cabinet with no full-height member left under it. Named individually so the file states the outcome rather
   *  than re-running the rule. The fridge column's two openings are here: `p7`, a full-height `fridge-free`, was
   *  cleared with `p24`, so a wall carcass recedes to 330 rather than the column's frozen 680 mm (ADR 0060).
   *  `B|0.61`'s two openings are not: they are 330 mm deep, so the cap is a no-op. `B|2.45:v0` offers a base body
   *  and the cap applies to wall carcasses only. */
  const CAPPED_BY_HEAD_CLEARANCE = new Set([
    "A|1.30:v0:1.50",
    "A|2.00:v0:2.20",
    "B|2.45:v1:1.50",
    "B|2.45:v2:2.20",
  ]);

  it("builds against the void's own depth, capped wherever nothing full-height stands under it", () => {
    const world = openedWorld();
    const measured: { readonly id: string; readonly depthMm: number }[] = [];
    const capped: string[] = [];

    for (const record of world.voids) {
      const buildId = firstOfferedBuildId(world, record);
      if (buildId === undefined) continue;
      const probe = createFakeProbe();
      const result = insertInto(
        world,
        { kind: "void", id: record.id },
        buildId,
        probe,
      );
      expect(result.ok).toBe(true);
      const expectedM = CAPPED_BY_HEAD_CLEARANCE.has(record.id)
        ? CAP_OVER_WORKTOP_M
        : record.d;
      expect(probe.requests[0]?.depthM).toBeCloseTo(expectedM, 9);
      if (CAPPED_BY_HEAD_CLEARANCE.has(record.id)) capped.push(record.id);
      measured.push({ id: record.id, depthMm: toMillimetres(record.d) });
    }

    // Both halves have to be exercised, or the sweep proves only the half it happened to reach.
    expect(capped).toHaveLength(CAPPED_BY_HEAD_CLEARANCE.size);

    // An empty void has no outgoing body, so its own `d` (§3.3's, stamped from the column that owns it) is the
    // depth of the translucent box the customer tapped. The sweep is worthless if it swept nothing.
    expect(measured.length).toBeGreaterThanOrEqual(4);
  });
});

/** An empty opening is not an opening over a column. The rule is that over a full-height column there is nothing
 *  to lean over (ADR 0060); capping wherever a worktop is present is its contrapositive, wrong because a column can
 *  be empty. Deleting `p0` (the sink overhanging `A|2.00`), `p1` (its base cabinet) and `p12` (the wall body above)
 *  leaves a column holding nothing whose `Column.d` (§3.2's MAX over the run, frozen at load, ADR 0011 Gap D) still
 *  measures the deleted base cabinet's depth. */
describe("insertBody — a wall carcass over an emptied column (backlog entry 5)", () => {
  const EMPTIED_COLUMN = "A|2.00";
  const WALL_VOID_Y0_M = 1.5;
  const BASE_VOID_Y0_M = 0;

  /** The three clicks, in the order a customer makes them. */
  function emptiedWorld(): KitchenWorld {
    return clearBodies(seeded(), ["p0", "p1", "p12"]);
  }

  function insertWallCabinet(world: KitchenWorld) {
    const target = voidAt(world, EMPTIED_COLUMN, WALL_VOID_Y0_M);
    const result = insertInto(
      world,
      { kind: "void", id: target.id },
      "wall-cabinet",
    );
    if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
    return result;
  }

  function seatDepthMmOf(
    design: Design,
    placementId: string,
  ): number | undefined {
    return design.placements.find((placement) => placement.id === placementId)
      ?.body.seatDepthMm;
  }

  it("builds to the head-clearance cap, not to the frozen depth of the deleted base run", () => {
    const world = emptiedWorld();
    const opening = voidAt(world, EMPTIED_COLUMN, WALL_VOID_Y0_M);

    // The trap: the opening still carries the deleted base run's own depth, so an uncapped build is a 620 mm
    // carcass and the sweep is not vacuous. 620 is the deepest member's occupied depth: a dishwasher niche whose
    // decor door finishes behind its own worktop (ADR 0051).
    expect(toMillimetres(opening.d)).toBe(620);
    expect(world.columns.get(EMPTIED_COLUMN)?.hasFullHeightUnder).toBe(false);

    const result = insertWallCabinet(world);

    expect(seatDepthMmOf(result.design, result.effect.placementId)) //
      .toBe(CAP_OVER_WORKTOP_SEAT_MM);
  });

  it("lands the new carcass level with the wall cabinets either side of it", () => {
    // p11 and p14 flank the emptied column at 330 mm, so a 580 mm neighbour between them is the visible harm.
    const result = insertWallCabinet(emptiedWorld());
    const after = createWorld(result.design, KITCHEN_L_BODY_CATALOG);
    const depthsMm = ["p11", result.effect.placementId, "p14"].map((id) =>
      toMillimetres(
        after.records.find((record) => record.id === id)?.frame.d ?? -1,
      ),
    );

    // All three are seats now and all three the same seat: 291 beside 291 is level as 580 beside 330 was not.
    expect(depthsMm).toEqual([
      CAP_OVER_WORKTOP_SEAT_MM,
      CAP_OVER_WORKTOP_SEAT_MM,
      CAP_OVER_WORKTOP_SEAT_MM,
    ]);
    expect(Math.max(...depthsMm)).toBeLessThan(580);
  });

  it("keeps the carcass capped when a base cabinet is put back underneath it", () => {
    // The same defect from the other direction: a wall body built at 580 while the column was empty stays there when
    // a base cabinet restores the worktop, because nothing re-derives a placed body's depth.
    const withWallBody = insertWallCabinet(emptiedWorld());
    const wallPlacementId = withWallBody.effect.placementId;
    const beforeBase = advance(emptiedWorld(), withWallBody.design);

    const baseVoid = voidAt(beforeBase, EMPTIED_COLUMN, BASE_VOID_Y0_M);
    const withBase = insertInto(
      beforeBase,
      { kind: "void", id: baseVoid.id },
      "base-cabinet",
    );
    expect(withBase.ok).toBe(true);
    if (!withBase.ok) return;
    const afterBase = advance(beforeBase, withBase.design);

    // A base cabinet — a worktop — now stands under the opening.
    expect(
      afterBase.records.some(
        (record) => record.col === EMPTIED_COLUMN && record.band === "base",
      ),
    ).toBe(true);
    // And the carcass above it is the capped one, both as recorded and as re-derived.
    expect(seatDepthMmOf(afterBase.design, wallPlacementId)) //
      .toBe(CAP_OVER_WORKTOP_SEAT_MM);
    expect(
      toMillimetres(
        afterBase.records.find((record) => record.id === wallPlacementId)?.frame
          .d ?? -1,
      ),
    ).toBe(CAP_OVER_WORKTOP_SEAT_MM);
  });
});

describe("openingFromPlacement — depth is the body's, not the vacated slot's", () => {
  it("reads the outgoing body's own depth even where the column is deeper", () => {
    // p11 is an 800 mm wall cabinet 330 mm deep, standing in a column whose base cabinet makes it
    // 580 mm. The vacated slot a swap resolves through carries the column's number, so the depth
    // has to come from the record.
    const world = seeded();
    const record = world.records.find((candidate) => candidate.id === "p11");
    if (!record) throw new Error("No record p11");

    const opening = openingFromPlacement(record, world.records, world.columns);

    expect(toMillimetres(opening.d)).toBe(330);
    // The column's depth is its base cabinet's worktop; the assertion is that the column is deeper than the body
    // standing in it.
    expect(toMillimetres(world.columns.get("A|1.30")?.d ?? 0)).toBe(620);
  });
});
