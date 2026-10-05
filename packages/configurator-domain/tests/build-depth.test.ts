// ADR 0060: a column publishes a build depth beside its clearance. Assertions are on the depth handed to the probe,
// which is `resolveDepthM`'s answer and what swap and delete-then-insert must agree on (§5.3). A fake probe reports
// back the depth it was handed, so it sees what was decided and never what was built; the real-probe half is
// `@lemnaria/three-adapter`'s `insert-depth.test.ts`.
import { describe, expect, it } from "vitest";

import {
  columnBuildDepthM,
  columnBuildDepthMm,
} from "../src/cabinet-depth-rule.js";
import { normaliseBand } from "../src/bands.js";
import { INSERTABLE_BODY_DEFINITIONS } from "../src/catalog.js";
import { removePlacement } from "../src/commands/remove-placement.js";
import type { DesignPlacement } from "../src/design.js";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../src/fixtures/kitchen-l-design.js";
import { toMetres, toMillimetres } from "../src/millimetres.js";
import { occupiedDepthM } from "../src/occupied-depth.js";
import {
  declaredWorktopDepthsMm,
  UnknownWorktopDepthError,
  WORKTOP_DEPTH_MM,
} from "../src/worktop-depth.js";
import type { PlacementRecord, VoidRecord } from "../src/void-engine.js";
import { insertInto, OCCURRED_AT } from "./support/commands.js";
import { createFakeProbe } from "./support/fake-probe.js";
import {
  advance,
  createWorld,
  type KitchenWorld,
} from "./support/kitchen-world.js";
import { syntheticWorld } from "./support/synthetic-world.js";

/** The map's wall depth at the shipped cabinet depth — the build depth where §5.2's head-clearance
 *  cap applies. Written here as the expectation rather than read from the module under test. */
const CAPPED_BUILD_DEPTH_MM = 330;

/** The cabinet-depth line at the shipped cabinet depth — the build depth where a full-height member
 *  lifts the cap. ADR 0060's measurement table: every shipped number at or below it is cabinetry and
 *  every number above it is an appliance or an appliance's handle. */
const LIFTED_BUILD_DEPTH_MM = 600;

/** The depths the uncapped arm used to build: a formula's output that nobody manufactures (BACKLOG entry 15). Named so
 *  the anti-invariant is explicit rather than implied. */
const UNMANUFACTURED_DEPTHS_MM = [638, 680, 703, 742];

function seeded(): KitchenWorld {
  return createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

/** The depth `resolveDepthM` decided for this insert, or `undefined` if the insert was refused —
 *  a refusal is not a disagreement, and the sweeps below compare only the pairs both routes
 *  accepted. */
function plannedDepthMm(
  world: KitchenWorld,
  target: Parameters<typeof insertInto>[1],
  buildId: string,
): number | undefined {
  const probe = createFakeProbe({ catalog: world.catalog });
  const result = insertInto(world, target, buildId, probe);
  if (!result.ok) return undefined;
  const requested = probe.requests[0];
  return requested ? toMillimetres(requested.depthM) : undefined;
}

/** Route 1 — §5.3's swap in place. */
function swapDepthMm(
  world: KitchenWorld,
  placementId: string,
  buildId: string,
): number | undefined {
  return plannedDepthMm(world, { kind: "placement", id: placementId }, buildId);
}

/** Route 2 — delete, then insert into the void the delete produced. `undefined` when the placement
 *  is not deletable (a structural corner return, §13.1) or when its removal leaves no void covering
 *  the space it stood in. */
function deleteThenInsertDepthMm(
  world: KitchenWorld,
  record: PlacementRecord,
  buildId: string,
): number | undefined {
  const emptied = withoutPlacement(world, record.id);
  if (!emptied) return undefined;
  const opening = voidCovering(emptied, record);
  if (!opening) return undefined;
  return plannedDepthMm(emptied, { kind: "void", id: opening.id }, buildId);
}

function withoutPlacement(
  world: KitchenWorld,
  placementId: string,
): KitchenWorld | undefined {
  const result = removePlacement({
    design: world.design,
    catalog: world.catalog,
    target: { kind: "placement", id: placementId },
    occurredAt: OCCURRED_AT,
  });
  return result.ok ? advance(world, result.design) : undefined;
}

/** The void the vacated body's own middle now falls inside. Asked by geometry rather than by `y0`,
 *  because a delete whose neighbouring level is already free produces one taller void whose `y0` is
 *  not the deleted body's. */
function voidCovering(
  world: KitchenWorld,
  record: PlacementRecord,
): VoidRecord | undefined {
  const middleM = record.frame.y0 + record.frame.h / 2;
  return world.voids.find(
    (candidate) =>
      candidate.col === record.col &&
      candidate.y0 <= middleM &&
      candidate.y0 + candidate.h >= middleM,
  );
}

const INSERTABLE_BUILD_IDS = INSERTABLE_BODY_DEFINITIONS.map(([id]) => id);

describe("the build depth is declared, never the clearance MAX (ADR 0060 decision 2)", () => {
  it("is the map's wall depth where the cap applies, at every declared cabinet depth", () => {
    expect(
      columnBuildDepthMm({ cabinetDepthMm: 600, hasFullHeightUnder: false }),
    ).toBe(330);
    expect(
      columnBuildDepthMm({ cabinetDepthMm: 700, hasFullHeightUnder: false }),
    ).toBe(400);
  });

  it("is the cabinet-depth line where a full-height member lifts the cap", () => {
    expect(
      columnBuildDepthMm({ cabinetDepthMm: 600, hasFullHeightUnder: true }),
    ).toBe(600);
    expect(
      columnBuildDepthMm({ cabinetDepthMm: 700, hasFullHeightUnder: true }),
    ).toBe(700);
  });

  it("answers a declared size at every row of the map, on both arms", () => {
    // Swept so a third row added to the map is covered the day it lands.
    expect(declaredWorktopDepthsMm().length).toBeGreaterThanOrEqual(2);
    for (const cabinetDepthMm of declaredWorktopDepthsMm()) {
      for (const hasFullHeightUnder of [false, true]) {
        const buildDepthMm = columnBuildDepthMm({
          cabinetDepthMm,
          hasFullHeightUnder,
        });
        expect(Number.isInteger(buildDepthMm)).toBe(true);
        expect(UNMANUFACTURED_DEPTHS_MM).not.toContain(buildDepthMm);
      }
    }
  });

  it("refuses an undeclared cabinet depth on both arms, not only the capped one", () => {
    // The lifted arm is an identity on its input, so without the check it answered 650 for a depth the capped arm
    // refused. The sole caller passes `WORKTOP_DEPTH_MM` today, but a worktop value threaded into a cabinet-depth
    // argument from a stored document (via `migrateDesign`) would sail through.
    const undeclaredDepthMm = 650;
    expect(declaredWorktopDepthsMm()).not.toContain(undeclaredDepthMm);

    for (const hasFullHeightUnder of [false, true]) {
      expect(() =>
        columnBuildDepthMm({
          cabinetDepthMm: undeclaredDepthMm,
          hasFullHeightUnder,
        }),
      ).toThrow(UnknownWorktopDepthError);
    }
  });

  it("states the same number in metres as in millimetres", () => {
    for (const cabinetDepthMm of declaredWorktopDepthsMm()) {
      for (const hasFullHeightUnder of [false, true]) {
        const query = { cabinetDepthMm, hasFullHeightUnder };
        expect(columnBuildDepthM(query)).toBeCloseTo(
          toMetres(columnBuildDepthMm(query)),
          9,
        );
      }
    }
  });
});

describe("entry 10's divergence closes at 600, over the fridge column", () => {
  // `p7` is the freestanding fridge and `p24` the wall body over it; `B|2.45` is the key both share.
  const FRIDGE_COLUMN = "B|2.45";
  const OVER_THE_FRIDGE = "p24";
  const CATALOGUE_WALL_BODY = "wall-cabinet";

  it("agrees at exactly 600 — the smaller of the two numbers entry 10 measured", () => {
    const world = seeded();
    const record = world.records.find(
      (candidate) => candidate.id === OVER_THE_FRIDGE,
    );
    if (!record) throw new Error("no p24 in the seeded design");

    // The trap: the column's own clearance is the fridge's body plus its two door bars, which the uncapped arm used to
    // hand the probe.
    expect(toMillimetres(world.columns.get(FRIDGE_COLUMN)?.d ?? 0)).toBe(742);
    expect(world.columns.get(FRIDGE_COLUMN)?.hasFullHeightUnder).toBe(true);

    expect(swapDepthMm(world, OVER_THE_FRIDGE, CATALOGUE_WALL_BODY)).toBe(
      LIFTED_BUILD_DEPTH_MM,
    );
    expect(deleteThenInsertDepthMm(world, record, CATALOGUE_WALL_BODY)).toBe(
      LIFTED_BUILD_DEPTH_MM,
    );
  });

  it("does not close by both routes drifting up to the clearance MAX", () => {
    // "They must agree" is satisfiable by agreeing on 742, the one number in ADR 0060's table no cabinet was built to.
    const world = seeded();
    const record = world.records.find(
      (candidate) => candidate.id === OVER_THE_FRIDGE,
    );
    if (!record) throw new Error("no p24 in the seeded design");

    for (const depthMm of [
      swapDepthMm(world, OVER_THE_FRIDGE, CATALOGUE_WALL_BODY),
      deleteThenInsertDepthMm(world, record, CATALOGUE_WALL_BODY),
    ]) {
      expect(UNMANUFACTURED_DEPTHS_MM).not.toContain(depthMm);
    }
  });
});

describe("both routes into a slot land on one depth, over every column", () => {
  // §5.3 exists so a swap is not a delete plus an insert; asserted over every replaceable placement crossed with every
  // insertable entry. Swept over three worlds because the shipped kitchen alone cannot falsify it: every seeded wall
  // body occupies at least the map row, so the two routes' openings give the same answer through `min`, and only a
  // wall member shallower than the row separates them.
  it("gives the same depth by swap and by delete-then-insert, for every entry it accepts", () => {
    const worlds = [
      { name: "the shipped kitchen", world: seeded() },
      {
        name: "a wall member shallower than the map row, in a deeper column",
        world: shallowWallMemberInADeepColumn(),
      },
      { name: "a column shallower than the map row", world: shallowColumn() },
    ];
    const agreed: string[] = [];
    const columnsCovered = new Set<string>();
    const liftedColumnsCovered = new Set<string>();
    const shallowPairsCovered: string[] = [];

    for (const { name, world } of worlds) {
      for (const record of world.records) {
        if (!record.canReplace) continue;
        for (const buildId of INSERTABLE_BUILD_IDS) {
          const bySwap = swapDepthMm(world, record.id, buildId);
          const byDelete = deleteThenInsertDepthMm(world, record, buildId);
          if (bySwap === undefined || byDelete === undefined) continue;

          const at = `${name}: ${record.id}->${buildId}`;
          expect({ at, depthMm: bySwap }).toEqual({ at, depthMm: byDelete });
          agreed.push(at);
          columnsCovered.add(`${name}: ${record.col}`);
          if (world.columns.get(record.col)?.hasFullHeightUnder === true) {
            liftedColumnsCovered.add(`${name}: ${record.col}`);
          }
          if (name !== "the shipped kitchen") shallowPairsCovered.push(at);
        }
      }
    }

    // Every arm has to be exercised: the lifted arm is the one that changed, and only the shallow worlds can fail the
    // capped arm.
    expect(agreed.length).toBeGreaterThan(20);
    expect(columnsCovered.size).toBeGreaterThanOrEqual(4);
    expect(liftedColumnsCovered.size).toBeGreaterThanOrEqual(1);
    expect(shallowPairsCovered.length).toBeGreaterThan(0);
  });

  it("builds every wall carcass to a declared size, on either route", () => {
    // Not merely that the two routes match but that they match on one of ADR 0060 decision 2's two declared numbers;
    // a pair agreeing on a formula's output would pass the test above and fail this one.
    const world = seeded();
    const declared = new Set([CAPPED_BUILD_DEPTH_MM, LIFTED_BUILD_DEPTH_MM]);
    const measured = new Set<number>();

    for (const record of world.records) {
      if (!record.canReplace || normaliseBand(record.band) !== "wall") continue;
      for (const buildId of ["wall-cabinet", "wall-lift", "open-shelf"]) {
        for (const depthMm of [
          swapDepthMm(world, record.id, buildId),
          deleteThenInsertDepthMm(world, record, buildId),
        ]) {
          if (depthMm === undefined) continue;
          measured.add(depthMm);
        }
      }
    }

    // Both arms have to appear. The lifted arm reaches this loop through the seeded `top` row, which normalises to
    // `wall` (ADR 0011 Gap C); reading the raw band would drop every wall carcass over a column and cover the capped
    // arm alone.
    expect(measured.has(CAPPED_BUILD_DEPTH_MM)).toBe(true);
    expect(measured.has(LIFTED_BUILD_DEPTH_MM)).toBe(true);
    expect([...measured].filter((depthMm) => !declared.has(depthMm))).toEqual(
      [],
    );
  });
});

// ADR 0060 decision 4, restated as what is true: no route writes a shallow body over a full-height member
// (`seatDepthMm` is written only in `commands/insert-body.ts` and `commands/rebuild-resized-bodies.ts`, both through
// `resolveDepthM`), but the state is reachable: `hasFullHeightUnder` is re-answered after every mutation while an
// existing body's depth is never re-derived, so clearing a column and inserting a full-height unit under a 330 mm wall
// body stands one over a column. The assertions are about what such a body cannot pass on.
describe("a shallow body over a full-height member is never written (decision 4)", () => {
  const FRIDGE_COLUMN = "B|2.45";
  const OVER_THE_FRIDGE = "p24";

  it("does not let a shallow body already standing there lend its depth to its replacement", () => {
    // However such a body got there, the swap does not inherit its depth: the answer comes from the column's
    // declaration and nothing the outgoing body recorded.
    const world = withShallowBodyOverTheFridge();

    expect(world.columns.get(FRIDGE_COLUMN)?.hasFullHeightUnder).toBe(true);
    const outgoing = world.records.find(
      (record) => record.id === OVER_THE_FRIDGE,
    );
    if (!outgoing) throw new Error("no p24 in the hand-built design");
    expect(toMillimetres(occupiedDepthM(outgoing))).toBe(CAPPED_BUILD_DEPTH_MM);

    expect(swapDepthMm(world, OVER_THE_FRIDGE, "wall-cabinet")).toBe(
      LIFTED_BUILD_DEPTH_MM,
    );
  });

  it("is a function of the column's build depth alone, whatever the outgoing body occupied", () => {
    // Over a full-height column the answer does not read the outgoing body at all, so a pinned entry cannot lend its
    // pin to its replacement (decision 5). Swept over outgoing bodies occupying 330, 600 and 639 mm.
    const answers = [
      withShallowBodyOverTheFridge(),
      seeded(),
      withDeeperBodyOverTheFridge(),
    ].map((world) => swapDepthMm(world, OVER_THE_FRIDGE, "wall-cabinet"));

    expect(answers).toEqual([600, 600, 600]);
    expect(
      columnBuildDepthMm({
        cabinetDepthMm: WORKTOP_DEPTH_MM,
        hasFullHeightUnder: true,
      }),
    ).toBe(LIFTED_BUILD_DEPTH_MM);
  });

  /** The seeded kitchen with `p24` recording a 291 mm seat, so it occupies 330: a shallow body over a full-height
   *  column, authored directly because no writer produces one. 291 is the seat a 330 mm fronted carcass records (ADR
   *  0036's 39 mm front assembly). Only the seat changes, so the one variable between the three worlds is the depth
   *  the outgoing body occupies. */
  function withShallowBodyOverTheFridge(): KitchenWorld {
    return withOverFridgeSeatMm(291);
  }

  /** The same slot holding a body occupying 639 mm: deeper than the cabinet-depth line, the shape the uncapped arm
   *  used to propagate into its replacement. */
  function withDeeperBodyOverTheFridge(): KitchenWorld {
    return withOverFridgeSeatMm(600);
  }

  function withOverFridgeSeatMm(seatDepthMm: number): KitchenWorld {
    const placements: DesignPlacement[] = KITCHEN_L_DESIGN.placements.map(
      (placement) =>
        placement.id === OVER_THE_FRIDGE
          ? { ...placement, body: { ...placement.body, seatDepthMm } }
          : placement,
    );
    return createWorld(
      { ...KITCHEN_L_DESIGN, placements },
      KITCHEN_L_BODY_CATALOG,
    );
  }
});

describe("a pinned entry does not lend its pin to its replacement (decision 5)", () => {
  // ADR 0058 pins `wall-2door-600-deep-top` and `wall-2door-700-over-fridge` at 600 at every setting; at 700 the
  // incoming body must take the column's 700. Asserted at the declaration, because the command layer cannot yet be
  // handed 700 (`resolveDepthM` reads `WORKTOP_DEPTH_MM`); with the resolved-depth test above that composes the
  // criterion.
  it("declares 700 over a full-height column at a 700 mm kitchen, not the pinned 600", () => {
    const pinnedFinishedDepthMm = 600;

    expect(
      columnBuildDepthMm({ cabinetDepthMm: 700, hasFullHeightUnder: true }),
    ).toBe(700);
    expect(
      columnBuildDepthMm({ cabinetDepthMm: 700, hasFullHeightUnder: true }),
    ).not.toBe(pinnedFinishedDepthMm);
  });

  it("still declares 600 at a 600 mm kitchen, where the pin and the line coincide", () => {
    // At the shipped depth the pin and the build depth are the same number, which is why nothing today can see the
    // difference.
    expect(
      columnBuildDepthMm({ cabinetDepthMm: 600, hasFullHeightUnder: true }),
    ).toBe(600);
  });
});

describe("value-preserving where the capped path already governs", () => {
  it("still caps a wall carcass over a base run at the map's row", () => {
    // `p19` stands over the hob base on `A|2.60`, whose clearance is the worktop's 620.
    const world = seeded();
    expect(world.columns.get("A|2.60")?.hasFullHeightUnder).toBe(false);
    expect(toMillimetres(world.columns.get("A|2.60")?.d ?? 0)).toBe(620);

    expect(swapDepthMm(world, "p19", "wall-cabinet")).toBe(
      CAPPED_BUILD_DEPTH_MM,
    );
  });

  it("keeps the cap a maximum and never a target, measured on the column", () => {
    // A column shallower than the declared depth keeps its own depth, so the cap never builds a body past the space
    // that exists. Measured on the column, not the opening (the outgoing body's clearance on a swap, the column's on a
    // delete-then-insert), so both routes agree. This case pins the `min`'s existence (delete it and this builds 330
    // in a 200 mm column); the two sibling worlds pin its argument; neither can see the other's failure.
    const world = shallowColumn();

    expect(world.columns.get(SHALLOW_COLUMN_KEY)?.hasFullHeightUnder).toBe(
      false,
    );
    expect(toMillimetres(world.columns.get(SHALLOW_COLUMN_KEY)?.d ?? 0)).toBe(
      SHALLOW_CLEARANCE_MM,
    );

    expect(swapDepthMm(world, SHALLOW_COLUMN_MEMBER, "open-shelf")).toBe(
      SHALLOW_CLEARANCE_MM,
    );
    expect(swapDepthMm(world, SHALLOW_COLUMN_MEMBER, "open-shelf")).not.toBe(
      CAPPED_BUILD_DEPTH_MM,
    );
  });

  it("does not let a shallow member drag a deeper column down with it", () => {
    // The member is shallower than the map row but its column is not, so the declared row governs on both routes;
    // without this, "keeps its own depth" would read as a fact about whatever body happens to stand there.
    const world = shallowWallMemberInADeepColumn();

    expect(toMillimetres(world.columns.get("A|2.60")?.d ?? 0)).toBe(620);
    expect(swapDepthMm(world, "p19", "open-shelf")).toBe(CAPPED_BUILD_DEPTH_MM);
  });
});

const SHALLOW_COLUMN_KEY = "A|1.00";
const SHALLOW_COLUMN_MEMBER = "s0";

/** The depth both shallow worlds put below the map row, so the two cases differ only in whether the column follows
 *  the member down. */
const SHALLOW_CLEARANCE_MM = 200;

/** A wall member recording a seat far below the map row, in a column that is not shallow: `p19` rewritten as a 200 mm
 *  `open-shelf` on `A|2.60`, whose clearance stays the hob base's 620. An open shelf has no front assembly, so its seat
 *  is what it occupies. Reading the cap's floor from the opening gives 200 by swap and 330 by delete-then-insert here.
 *  Latent: no command mints a wall member this shallow, but an authored or stored document can. */
function shallowWallMemberInADeepColumn(): KitchenWorld {
  return createWorld(
    {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === "p19"
          ? {
              ...placement,
              body: {
                ...placement.body,
                buildId: "open-shelf",
                seatDepthMm: SHALLOW_CLEARANCE_MM,
              },
            }
          : placement,
      ),
    },
    KITCHEN_L_BODY_CATALOG,
  );
}

/** A column whose whole clearance is below the map row: one wall member, so §3.2's MAX is its own 200 mm. The seeded
 *  kitchen has no such column; its capped columns all hold a base run at 620. */
function shallowColumn(): KitchenWorld {
  return syntheticWorld([
    {
      id: SHALLOW_COLUMN_MEMBER,
      wall: "A",
      alongMm: 1000,
      y0Mm: 1500,
      body: {
        buildId: "open-shelf",
        widthMm: 600,
        heightMm: 700,
        seatDepthMm: SHALLOW_CLEARANCE_MM,
      },
    },
  ]);
}

describe("the hood keeps its own answer (ADR 0039, ADR 0040)", () => {
  // Clearance and build depth are legitimately different numbers here and must not be aligned: `make.hood` takes no
  // depth parameter (a standard 500 mm at every setting, ADR 0039 decision 1), while decision 2 hangs it at the front,
  // so the space it fills runs to the 600 mm cabinet-depth line.
  it("still fills 600 mm while being a 500 mm body", () => {
    const world = seeded();
    const hood = world.records.find((record) => record.id === "p13");
    if (!hood) throw new Error("no p13 (hood-600) in the seeded design");

    const hoodEntry = INSERTABLE_BODY_DEFINITIONS.find(([id]) => id === "hood");
    if (!hoodEntry) throw new Error("no `hood` catalogue entry");

    expect(toMillimetres(occupiedDepthM(hood))).toBe(600);
    expect(hoodEntry[1].nominalDepthMm).toBe(500);
    expect(toMillimetres(occupiedDepthM(hood))).not.toBe(
      hoodEntry[1].nominalDepthMm,
    );
  });
});
