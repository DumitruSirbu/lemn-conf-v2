// **Adversarial QA on wave 6Z — the overlap clause ran in one direction only, and this is the pair
// that keeps both.**
//
// ADR 0103 decision 3 computed the affected column set from two clauses: every key `splitColumn`
// wrote, and every key whose `hasFullHeightUnder` answer *differs* across the command. The second
// clause exists because `isFullHeightUnder` (`void-engine.ts`) asks about **overlap along the wall,
// not column membership** — a full-height body wider than its own column lifts its neighbours too —
// and the wave shipped a declared witness for it.
//
// Neither clause covered the mirror image, which this file found. Put an **ordinary** body into a
// slot that overhangs a neighbouring column whose standing top is still at the lifted depth, and:
//
//   - the overhung key is not the `occupiedKey` and is not a key the split created, so clause one
//     misses it;
//   - `hasFullHeightUnder` is `false` before the insert and `false` after it, so clause two misses
//     it — which is exactly why ADR 0103 decision 3 rejects the flip-triggered design for S1. The
//     rejection had been applied to the column-membership route and not to the overlap route.
//
// So the same 200 mm of shared wall that made a full-height body **deepen** the standing top did not
// make an ordinary body **cap** it, and the owner's own S1 — *"delete the pantry, put a regular
// cabinet under it, and the top should shallow out"* — was left unfixed on that route. The two tests
// below are the two directions, and each is the other's non-vacuity: a fix that reaches only one of
// them cannot make this file green.
//
// **The witness declares its own design** (ADR 0093 decision 2): the shipped kitchen cannot exercise
// overlap at all, which ADR 0103 decision 3 records and which is why the wave's own overlap coverage
// is synthetic too. Nothing here is a moved fixture.
import { describe, expect, it } from "vitest";

import {
  columnDecidesADifferentDepth,
  openingFromPlacement,
} from "../../src/commands/insert-fit.js";
import { columnBuildDepthMm } from "../../src/cabinet-depth-rule.js";
import type { DesignPlacement } from "../../src/design.js";
import { KITCHEN_L_BODY_CATALOG } from "../../src/fixtures/kitchen-l-design.js";
import { resolveRebuildBody } from "../../src/commands/resolve-column-members.js";
import { clearBodies, insertInto } from "../support/commands.js";
import {
  advance,
  voidAt,
  type KitchenWorld,
} from "../support/kitchen-world.js";
import { syntheticWorld } from "../support/synthetic-world.js";

/** The slot the insert goes into, and the column it overhangs by 200 mm. `A|0.90` holds nothing
 *  full-height of its own — the lift only ever reaches it across the shared wall. */
const LIFTING_COLUMN = "A|0.50";
const OVERHUNG_COLUMN = "A|0.90";

const THE_STANDING_TOP = "top";
const TOP_BUILD_ID = "wall-cabinet";

/** The declared setting the synthetic world is built at, read off the design rather than written
 *  twice, and the two seats the column decides at it — the lifted line and the capped one. Both
 *  come from `columnBuildDepthMm` and the entry's own front assembly, so a third declared depth or a
 *  moved cap does not turn this file into a pair of stale literals (ADR 0058 decision 2). */
const FRONT_ASSEMBLY_MM = frontAssemblyOf(TOP_BUILD_ID);

function frontAssemblyOf(buildId: string): number {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`the witness needs ${buildId}`);
  // A `wall-plane` row states a finished depth outright and has no front assembly to subtract — and
  // is excluded from the re-plan for exactly that reason (ADR 0103 decision 4 point 3), so a witness
  // built on one would be measuring the wrong thing entirely.
  const rule = definition.occupiedDepth;
  if (rule.measuredFrom !== "recorded-shell") {
    throw new Error(`${buildId} is not a recorded-shell entry`);
  }
  return rule.frontAssemblyMm;
}

function seatTheColumnDecides(
  cabinetDepthMm: number,
  hasFullHeightUnder: boolean,
): number {
  return (
    columnBuildDepthMm({ cabinetDepthMm, hasFullHeightUnder }) -
    FRONT_ASSEMBLY_MM
  );
}

/** Two columns sharing 200 mm of wall: an empty full-height slot at `A|0.50`, and beside it a base
 *  with a wall carcass standing over it at `A|0.90`.
 *
 *  The left column's own member is placed and then **cleared**, because ADR 0011 Gap D freezes a
 *  column's extent at load — without it the slot would not exist to insert into. */
function twoOverlappingColumns(): KitchenWorld {
  return clearBodies(
    syntheticWorld([
      {
        id: "lift",
        wall: "A",
        alongMm: 500,
        y0Mm: 0,
        body: { buildId: "tall-oven-tower-600", widthMm: 600, heightMm: 2200 },
      },
      {
        id: "base",
        wall: "A",
        alongMm: 900,
        y0Mm: 0,
        body: { buildId: "base-drawer2-600", widthMm: 600, heightMm: 820 },
      },
      {
        id: THE_STANDING_TOP,
        wall: "A",
        alongMm: 900,
        y0Mm: 2200,
        body: { buildId: TOP_BUILD_ID, widthMm: 600, heightMm: 400 },
      },
    ]),
    ["lift"],
  );
}

function insertBeside(world: KitchenWorld, buildId: string): KitchenWorld {
  const result = insertInto(
    world,
    { kind: "void", id: voidAt(world, LIFTING_COLUMN, 0).id },
    buildId,
  );
  if (!result.ok) {
    throw new Error(
      `the witness could not insert ${buildId}: ${result.reason.code}`,
    );
  }
  return advance(world, result.design);
}

function placementOf(world: KitchenWorld, id: string): DesignPlacement {
  const found = world.design.placements.find(
    (placement) => placement.id === id,
  );
  if (!found) throw new Error(`no placement ${id}`);
  return found;
}

function lastPlacementId(world: KitchenWorld): string {
  const id = world.design.placements.at(-1)?.id;
  if (id === undefined) throw new Error("the insert wrote no placement");
  return id;
}

function overhungColumnLifts(world: KitchenWorld): boolean {
  const column = world.columns.get(OVERHUNG_COLUMN);
  if (!column) throw new Error(`no column ${OVERHUNG_COLUMN}`);
  return column.hasFullHeightUnder;
}

/** The outcome test the wave itself uses, asked of the standing top in whatever state the world is
 *  in — `resolveDepthM` through `columnDecidesADifferentDepth`, the same authority, in the same
 *  place `replan-dependent-members.ts` asks it. If this answers `true`, the wave's own rule says
 *  this body is to be re-planned; only the affected-key gate can be what stops it. */
function theColumnDecidesADifferentDepthForTheTop(
  world: KitchenWorld,
): boolean {
  const record = world.records.find(
    (candidate) => candidate.id === THE_STANDING_TOP,
  );
  const column = world.columns.get(OVERHUNG_COLUMN);
  if (!record || !column) throw new Error("the witness lost its standing top");
  const body = resolveRebuildBody(world.catalog, record);
  if (!body) throw new Error("the standing top resolves to no insertable body");
  return columnDecidesADifferentDepth({
    body,
    opening: openingFromPlacement(record, world.records, world.columns),
    column,
    cabinetDepthMm: world.cabinetDepthMm,
  });
}

describe("a body inserted across the shared wall re-plans the top it reaches, both ways", () => {
  // **The direction the wave shipped a witness for**, and it is what makes the second test
  // non-vacuous (ADR 0093 decision 1): the harness does reach wave 6Z's re-plan across a column
  // boundary. Without this, the second test could pass because nothing here is wired up at all.
  it("deepens the overhung top when a full-height body is inserted beside it", () => {
    const start = twoOverlappingColumns();
    expect(overhungColumnLifts(start)).toBe(false);

    const lifted = insertBeside(start, "tall-pantry");

    expect(overhungColumnLifts(lifted)).toBe(true);
    expect(placementOf(lifted, THE_STANDING_TOP).body.seatDepthMm).toBe(
      seatTheColumnDecides(lifted.cabinetDepthMm, true),
    );
  });

  // **The direction that was missing when the wave landed.** The same slot, the same 200 mm of
  // shared wall, an ordinary cabinet instead of a full-height one — and the owner's S1 has to
  // happen here too, or the top keeps a lifted seat that a body which is no longer there gave it.
  it("caps the overhung top when an ordinary body is inserted beside it", () => {
    const lifted = insertBeside(twoOverlappingColumns(), "tall-pantry");
    const emptiedAgain = clearBodies(lifted, [lastPlacementId(lifted)]);
    // The transient ADR 0103 decision 2 accepts: a delete re-plans nothing, so the top is still at
    // the lifted seat with nothing full-height under it. The next insert is what has to resolve it.
    expect(overhungColumnLifts(emptiedAgain)).toBe(false);
    expect(placementOf(emptiedAgain, THE_STANDING_TOP).body.seatDepthMm).toBe(
      seatTheColumnDecides(emptiedAgain.cabinetDepthMm, true),
    );
    // And the outcome test says so out loud *before* the insert: this is a body the column already
    // decides a different depth for, waiting for a command to ask.
    expect(theColumnDecidesADifferentDepthForTheTop(emptiedAgain)).toBe(true);

    const filled = insertBeside(emptiedAgain, "base-cabinet");

    expect(placementOf(filled, THE_STANDING_TOP).body.seatDepthMm).toBe(
      seatTheColumnDecides(filled.cabinetDepthMm, false),
    );
    // **The fixed point**, and it is the assertion that separates a re-plan from a lucky number: the
    // column now decides no different depth for this top, so a second insert beside it would move
    // nothing. A seat assertion alone passes against a body that was written to the right value by
    // some other arithmetic and would move again on the next command.
    expect(theColumnDecidesADifferentDepthForTheTop(filled)).toBe(false);
  });
});
