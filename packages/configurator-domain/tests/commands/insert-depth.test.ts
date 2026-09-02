// Which depth `insertBody` builds against — `DEVELOPMENT-SPEC.md` §5.2's `b.mk(w, h, void.d)` and
// §5.3's "the current body's `frame` **is** the target opening".
//
// The production defect: the depth came from `target.column.d`, which §3.2 defines as the MAX over
// the whole vertical run, so a wall cabinet was built to the depth of the base cabinet underneath
// it. Replacing a wall cabinet with another catalogue wall cabinet changed its depth on 7 of the
// shipped kitchen's 10 columns — in both directions — and the replacement stopped lining up with
// its neighbours. Photographed on a customer's handset.
//
// ADR 0018 is why the numbers here are `frame.d`: that field is twice a body's rear overhang, and
// only `wallCabinet` and `openShelf` consume the depth they are handed at all. For those two the
// carcass is centred on z = 0, so the overhang is half the depth and the two numbers coincide —
// which is exactly the population this file sweeps.
import { describe, expect, it } from "vitest";

import { openingFromPlacement } from "../../src/commands/insert-fit.js";
import type { Design } from "../../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { toMillimetres } from "../../src/millimetres.js";
import { offersFor } from "../../src/queries/offers.js";
import { offered as offeredRows } from "../support/offers.js";
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

/** Every seeded body a wall cabinet can be swapped into: the whole wall and top population, less
 *  the structural corner returns §13.1 forbids replacing. Swept rather than sampled, because the
 *  defect was uniform in shape and various in size — the same wrong rule read 330, 500 and 600. */
function replaceableWallBodies(world: KitchenWorld): PlacementRecord[] {
  return world.records.filter(
    (record) =>
      (record.band === "wall" || record.band === "top") && record.canReplace,
  );
}

/** A wall entry bounded 300–800 with no hole in the middle, so it fills whatever opening it is
 *  swapped into. It was `wall-2door` until ADR 0032 made a bounded set a bound on the `'fit'` path
 *  too: the sweep below runs over every seeded wall and top body, and three of them stand at 300 or
 *  700 mm. ADR 0035 makes every cabinetry row a bound, and a shelf has no door count — so this is
 *  the entry with no ADR 0030 gap in its range. Depth is this file's subject, so the body it swaps
 *  in must not refuse on width halfway through.  */
const SWAP_BUILD_ID = "open-shelf";

/** §7's head-clearance cap on a wall carcass over a worktop, in metres, at the shipped 600 mm
 *  worktop. Restated here rather than imported from `insert-fit.ts`: a test that reads the number
 *  it is checking out of the code under test proves nothing — move the constant and both sides move
 *  together. The three-adapter's `swap-depth.test.ts` restates the same rule in millimetres for the
 *  same reason.
 *
 *  M5 wave 5A moved it from 0.4 to 0.33. The cap is no longer a literal of its own: it and §7's
 *  `nominalDepthMm` both read the worktop → wall depth map, which is what
 *  `worktop-depth.test.ts` gates. */
const CAP_OVER_WORKTOP_M = 0.33;

/** The same rule in millimetres, for the assertions that read a recorded `seatDepthMm`. */
const CAP_OVER_WORKTOP_MM = 330;

/** §7's head-clearance cap on a wall carcass, in the one shipped case where it bites on a swap.
 *  Stated as data rather than imported from the code under test, and as a single named exception
 *  rather than a re-run of the rule: of the seeded wall bodies deeper than 330 mm, only the hood
 *  stands over something that is not a full-height unit — `p2`, a base cabinet — so only its
 *  replacement is built shallower than the body it replaces. The three deep cabinets on wall B hang
 *  over `p5`, `p6` and `p7`, all full-height, where the cap is lifted, and they keep their own
 *  depth — which is backlog entry 5's whole decision. */
const CAPPED_BY_HEAD_CLEARANCE_MM: Readonly<Record<string, number>> = {
  p13: 330,
};

/** ADR 0036 decision 1: a declared dimension is the **finished** cabinet, so `wallCabinet` builds
 *  its shell at the declared depth less an 18 mm door and the 21 mm its bar handle stands proud of
 *  that. A seeded wall row's `frame.d` is therefore the *shell* — 291 where the cabinet is 330 —
 *  and the depth a replacement is built against is the declared number, not the recorded one.
 *
 *  Restated here rather than imported, like `CAP_OVER_WORKTOP_M` above and for the same reason.
 *
 *  Reading `frame.d` as the depth is what would compound: 330 → 291 → 252 on successive swaps, with
 *  `refuseBuiltSize` checking width and height only so nothing would see it (ADR 0018 clause 4).
 *  The two-swap round trip below is the assertion that it does not. */
const WALL_FRONT_ASSEMBLY_MM = 39;

/** The same cap as **recorded**, which since wave 5F is a different number from the cap itself.
 *  ADR 0036 decision 1 makes 330 the *finished* depth of a wall cabinet, so its shell — and
 *  therefore its seat, which is what `seatDepthMm` stores — is that less the 39 mm door-and-handle
 *  front assembly. Keeping the two constants apart is the point: the rule the cap states is about
 *  the cabinet a person leans under, and the number the design stores is about where its back face
 *  lands (ADR 0018). */
const CAP_OVER_WORKTOP_SEAT_MM = CAP_OVER_WORKTOP_MM - WALL_FRONT_ASSEMBLY_MM;

/** An open shelf and a hood carry no front assembly, so only a fronted wall carcass needs the
 *  correction. Keyed on the seeded row's `kind`, which is what the production rule reads. */
function declaredDepthMm(record: PlacementRecord): number {
  const seatMm = toMillimetres(record.frame.d);
  return record.kind === "wall_cabinet"
    ? seatMm + WALL_FRONT_ASSEMBLY_MM
    : seatMm;
}

describe("insertBody — the depth a swap in place builds against (§5.3)", () => {
  const world = seeded();
  const targets = replaceableWallBodies(world);

  it("sweeps every seeded wall and top body, and the column depth really does differ", () => {
    // Guards the sweep against going vacuous. If every target's own depth happened to equal its
    // column's, the assertions below would hold under the defect too — which is the trap the
    // clean-code round caught in Wave 3A, one file over.
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
  /** The seeded kitchen with a wall body, a top body and two whole columns taken out, so the sweep
   *  below sees openings of three different depths rather than one repeated. */
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
    return offeredRows(
      offersFor({
        records: world.records,
        voids: world.voids,
        columns: world.columns,
        catalog: world.catalog,
        target: { kind: "void", id: record.id },
      }),
    )[0]?.buildId;
  }

  /** The four voids in this opened kitchen where §7's head-clearance cap bites: every wall-level
   *  opening that offers a wall cabinet and has no full-height member left standing under it.
   *  Named individually rather than recomputed, so this file states the outcome instead of
   *  re-running the rule it is checking.
   *
   *  The fridge column's two openings are here, and they are the wave-A regression this file now
   *  pins: `p7` — a full-height `fridge-free` — was cleared away with `p24`, so nothing holds a
   *  wall carcass out any more and it recedes to 330 rather than building to the column's frozen
   *  680 mm. Backlog entry 5 records that consequence as deliberate.
   *
   *  `B|0.61`'s two openings are not here even though nothing full-height stands under them
   *  either: they are 330 mm deep, so `min(d, 0.33)` is a no-op and the void's own depth is the
   *  answer either way. `B|2.45:v0` is a floor-level opening that offers a base body, and §7's cap
   *  is a rule about wall carcasses only. */
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

    // An empty void has no outgoing body, so its own `d` — §3.3's, stamped from the column that
    // owns it — is the only depth the model holds for it, and it is the depth of the translucent
    // box the customer tapped. The sweep is worthless if it swept nothing.
    expect(measured.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------------------------
// The wave-A regression: an empty opening is not an opening over a column.
// ---------------------------------------------------------------------------------------------

/** Backlog entry 5's rule is "over a full-height column there is nothing to lean over", and the
 *  first implementation read it as its contrapositive — cap wherever a worktop is present. The two
 *  are not the same, because a column can be **empty**: the absence of a worktop is not the presence
 *  of a column, and empty is exactly what a delete produces.
 *
 *  Three clicks reached it in the shipped kitchen. `p0` is an 800 mm sink spanning 1300–2100 mm, so
 *  it overhangs column `A|2.00`; `p1` is that column's own base cabinet; `p12` is the wall body
 *  above them. With all three gone the column holds nothing at all — and `Column.d` is §3.2's MAX
 *  over the run, **frozen at load** (ADR 0011 Gap D), so it still measures 580 mm: the depth of the
 *  base cabinet the customer had just deleted. A wall carcass built to it lands 250 mm proud of its
 *  own neighbours. */
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

    // The trap, stated: the opening really does still carry the deleted base run's own depth, so
    // an uncapped build is a 620 mm carcass and this sweep is not vacuous.
    //
    // **620, not 580, since wave S9 (DOM-002).** The number is the *deepest member's* occupied
    // depth, and this column's was a dishwasher niche, whose worktop reaches 620 mm from the wall.
    // 580 was the seat encoding that member records (ADR 0018), which is 40 mm short of the space
    // it filled — the assertion pinned the defect, and what it is about, that the frozen depth
    // survives the delete and the cap is what holds the build back, is unchanged.
    //
    // **632 until ADR 0051**, when the niche stopped exposing the appliance's own door bar and
    // started wearing a decor door that finishes behind its own worktop like every other base body.
    expect(toMillimetres(opening.d)).toBe(620);
    expect(world.columns.get(EMPTIED_COLUMN)?.hasFullHeightUnder).toBe(false);

    const result = insertWallCabinet(world);

    expect(seatDepthMmOf(result.design, result.effect.placementId)) //
      .toBe(CAP_OVER_WORKTOP_SEAT_MM);
  });

  it("lands the new carcass level with the wall cabinets either side of it", () => {
    // The defect as the customer saw it: p11 and p14 flank the emptied column at 330 mm, so a
    // 580 mm neighbour between them is the visible harm and 330 is what the cap is worth.
    const result = insertWallCabinet(emptiedWorld());
    const after = createWorld(result.design, KITCHEN_L_BODY_CATALOG);
    const depthsMm = ["p11", result.effect.placementId, "p14"].map((id) =>
      toMillimetres(
        after.records.find((record) => record.id === id)?.frame.d ?? -1,
      ),
    );

    // All three are seats now, and all three are the same seat: that they *match* is the whole
    // point of the assertion, and 291 beside 291 is level in exactly the way 580 beside 330 was
    // not.
    expect(depthsMm).toEqual([
      CAP_OVER_WORKTOP_SEAT_MM,
      CAP_OVER_WORKTOP_SEAT_MM,
      CAP_OVER_WORKTOP_SEAT_MM,
    ]);
    expect(Math.max(...depthsMm)).toBeLessThan(580);
  });

  it("keeps the carcass capped when a base cabinet is put back underneath it", () => {
    // The same defect reached from the other direction. Under the old predicate the wall body was
    // built at 580 while the column was empty, and putting a base cabinet back flipped the column
    // to "has a worktop" — but nothing re-derives a placed body's depth, so the 580 mm carcass
    // simply stayed there, over a counter, which is the one shape backlog entry 5 exists to
    // prevent.
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
    // 620, not 580, since wave S9 (DOM-002): the column's depth is its base cabinet's **worktop**,
    // and 580 was that cabinet's seat encoding. The assertion is that the column is deeper than the
    // body standing in it, which is more true at 620 than it was at 580.
    expect(toMillimetres(world.columns.get("A|1.30")?.d ?? 0)).toBe(620);
  });
});
