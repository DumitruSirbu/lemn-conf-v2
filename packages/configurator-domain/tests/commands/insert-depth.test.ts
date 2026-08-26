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
  advancePast,
  createWorld,
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

const SWAP_BUILD_ID = "wall-2door";

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
      depthMm: toMillimetres(record.frame.d),
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
      "wall-1door",
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
    return offersFor({
      records: world.records,
      voids: world.voids,
      columns: world.columns,
      catalog: world.catalog,
      target: { kind: "void", id: record.id },
    })[0]?.buildId;
  }

  it("builds against the void's own depth, for every void the opened kitchen offers into", () => {
    const world = openedWorld();
    const measured: { readonly id: string; readonly depthMm: number }[] = [];

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
      expect(probe.requests[0]?.depthM).toBeCloseTo(record.d, 9);
      measured.push({ id: record.id, depthMm: toMillimetres(record.d) });
    }

    // An empty void has no outgoing body, so its own `d` — §3.3's, stamped from the column that
    // owns it — is the only depth the model holds for it, and it is the depth of the translucent
    // box the customer tapped. The sweep is worthless if it swept nothing.
    expect(measured.length).toBeGreaterThanOrEqual(4);
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
    expect(toMillimetres(world.columns.get("A|1.30")?.d ?? 0)).toBe(580);
  });
});
