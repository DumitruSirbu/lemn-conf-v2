// The production defect, on real geometry: replacing a wall cabinet changed its depth, and the
// replacement stopped lining up with its neighbours.
//
// It had two halves. The first was the depth being read from `Column.d` — §3.2's MAX over the whole
// vertical run — which built a wall cabinet to the depth of the base cabinet under it; that is
// closed, and `insert-depth.test.ts` in `@lemnaria/configurator-domain` is its rule half. The
// second was §7's `min(d, 0.4)` clamp, which no catalogue entry could build past, so the three
// 600 mm cabinets this kitchen hangs over its tall columns **receded 200 mm** on every swap.
//
// Backlog entry 5 (owner, 2026-08-26) is the decision that closes it: the cap follows what is below
// the opening, not the catalogue entry. Over a worktop a wall carcass is capped so nobody
// hits their head leaning over the counter; over a full-height column there is nothing to lean over
// and it is as deep as the column.
//
// This file is the outcome half, and it has to be here rather than in the domain: only the real
// builders and the real probe can say what a customer's replacement is actually built to, which is
// the number the owner photographed. A fake probe reporting back what it was handed cannot.
import {
  deriveColumns,
  derivePlacementRecords,
  occupiedDepthM,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  toMillimetres,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** §7's head-clearance cap on a wall carcass over a worktop, restated here as the *expectation*
 *  rather than imported from the code under test — a test that reads the number it is checking out
 *  of the code proves nothing.
 *
 *  M5 wave 5A moved it from 400 to 330 at the shipped 600 mm worktop: the cap and §7's
 *  `nominalDepthMm` now read one worktop → wall depth map row instead of being two independent
 *  literals that happened to agree. */
const WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_MM = 330;

const OCCURRED_AT = "2026-08-26T12:00:00.000Z";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

function seededRecords(): PlacementRecord[] {
  return derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
}

function swap(
  placementId: string,
  buildId: string,
): { readonly design: Design; readonly placementId: string } {
  const records = seededRecords();
  const result = insertBody({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    columns: deriveColumns(records, {}, KITCHEN_L_DESIGN.room),
    target: { kind: "placement", id: placementId },
    buildId,
    probe: createBodyProbe(kit, room),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    throw new Error(`Swap of ${placementId} refused: ${result.reason.code}`);
  }
  return { design: result.design, placementId: result.effect.placementId };
}

function swapDepthMm(placementId: string, buildId: string): number {
  const swapped = swap(placementId, buildId);
  return depthOfMm(swapped.design, swapped.placementId);
}

function recordOf(design: Design, placementId: string) {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record ${placementId}`);
  return record;
}

/** **The depth of the space the body fills, not its recorded seat.** This file's whole subject is
 *  "a swap does not change how deep this thing is", and since wave 5F `frame.d` is no longer that
 *  number for two populations: a fronted wall carcass records 39 mm less than it occupies (ADR 0036
 *  decision 1 — the declared dimension is the finished cabinet) and a front-hung hood records
 *  200 mm more (ADR 0039 decision 2). `occupiedDepthM` is the production conversion, used here
 *  rather than restated, because a test that restated it would be asserting a second copy of the
 *  rule instead of the rule. Where the *seat* is the subject, `seatDepthMm` is read explicitly. */
function depthOfMm(design: Design, placementId: string): number {
  return toMillimetres(occupiedDepthM(recordOf(design, placementId)));
}

function seatDepthMmOf(design: Design, placementId: string): number {
  return toMillimetres(recordOf(design, placementId).frame.d);
}

interface SwapCase {
  readonly id: string;
  readonly buildId: string;
  readonly equivalentId: string;
  readonly depthMm: number;
}

/** Every wall or top body this kitchen lets a customer replace — the structural corner returns §13.1
 *  forbids replacing are the only ones left out. Each is paired with the §7 entry it is an instance
 *  of (`catalogEquivalentId`, ADR 0022), because "keeps its own depth through a swap" is only a
 *  meaningful claim about replacing a body with the same product. */
function replaceableWallBodies(): SwapCase[] {
  return seededRecords()
    .filter(
      (record) =>
        (record.band === "wall" || record.band === "top") && record.canReplace,
    )
    .map((record) => ({
      id: record.id,
      buildId: record.buildId,
      equivalentId:
        KITCHEN_L_BODY_CATALOG.get(record.buildId)?.catalogEquivalentId ?? "",
      depthMm: toMillimetres(occupiedDepthM(record)),
    }));
}

describe("a swap never changes a wall body's depth", () => {
  it("sweeps the whole replaceable wall population, deep bodies included", () => {
    // A sweep that swept nothing passes under the defect, and a sweep that reached only the 330 mm
    // bodies passes under the *clamp* — 11 of the 15 replaceable wall and top placements were
    // already correct before backlog entry 5, so the guard has to name the deep ones specifically.
    const targets = replaceableWallBodies();

    expect(targets.length).toBeGreaterThanOrEqual(15);
    expect(targets.every((target) => target.equivalentId !== "")).toBe(true);
    expect(
      targets.filter(
        (target) => target.depthMm > WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_MM,
      ),
    ).toHaveLength(4);
  });

  // **The sweep is whole again**, and `p24` coming back into it is the point of ADR 0033's amendment.
  // For one wave it was excluded: the merged entry carried a discrete `[200, 300, 400, 600, 800]`, so
  // the shipped 700 mm over-fridge cabinet was the one seeded body its own §7 entry could not rebuild
  // at the width it stands at. Ranges make 700 an ordinary two-door width — two honest 350 mm leaves
  // — so every replaceable wall body is rebuildable as itself again, with no exclusion to remember.
  it.each(replaceableWallBodies())(
    "$id ($buildId) is rebuilt as $equivalentId at its own $depthMm mm",
    ({ id, equivalentId, depthMm }) => {
      expect(swapDepthMm(id, equivalentId)).toBe(depthMm);
    },
  );

  // Named separately as well, because it is the case the amendment was written for and a sweep that
  // silently stopped covering it would read green. 600 is the depth, not the width: `p24` stands over
  // the fridge, where §7's head-clearance cap is lifted.
  it("rebuilds the 700 mm over-fridge cabinet as its own catalogue entry", () => {
    expect(swapDepthMm("p24", "wall-cabinet")).toBe(600);
  });
});

describe("§7's head-clearance cap follows what is under the opening", () => {
  // A wall entry bounded 300–800 with no hole in the middle, so it builds into every one of these
  // openings including the 700 mm one over the fridge. It was `wall-2door` until ADR 0032 made a
  // bounded set bind the `'fit'` path; depth is this block's subject and the body must not refuse
  // on width.
  const CATALOGUE_WALL_CABINET = "open-shelf";

  // The rule, at the four openings deeper than the cap. One entry, four openings over the cap, two
  // answers — and the only thing that differs is what stands below, which is the whole decision.
  // p13 is the case that proves the cap is still live rather than merely removed.
  it.each([
    { id: "p13", underneath: "the hob's worktop", depthMm: 330 },
    { id: "p22", underneath: "a tall oven tower", depthMm: 600 },
    { id: "p23", underneath: "a tall pantry", depthMm: 600 },
    { id: "p24", underneath: "the fridge", depthMm: 600 },
  ])(
    "$id sits over $underneath, so a wall cabinet is built to $depthMm mm",
    ({ id, depthMm }) => {
      expect(swapDepthMm(id, CATALOGUE_WALL_CABINET)).toBe(depthMm);
    },
  );

  it("leaves the hood's standard 500 mm alone, and hangs it at the front", () => {
    // ADR 0039 decision 1: *"hood is always standard"* — `make.hood` builds 500 whatever depth it is
    // handed, so the cap that puts a wall cabinet at 330 in this same opening one case up does not
    // reach it. Decision 2 then says where the 500 goes: front face on the 600 mm cabinet-depth
    // line, gap behind. So the space it fills is 600 and the seat it records is `2 × 600 − 500`.
    //
    // Both are asserted. The seat alone would not say the hood is still 500 deep, and the occupied
    // depth alone would not say it is hung forward.
    const swapped = swap("p13", "hood");

    expect(depthOfMm(swapped.design, swapped.placementId)).toBe(600);
    expect(seatDepthMmOf(swapped.design, swapped.placementId)).toBe(
      2 * 600 - 500,
    );
  });

  it("keeps a deep replacement stable when it is swapped a second time", () => {
    // ADR 0018's round trip, now that a wall carcass can be 600: `scene-sync` rebuilds from
    // `frame.d`, so a body built at 600 must measure back to 600 rather than grow or shrink. Under
    // the old clamp this converged only because everything was cut to 400.
    const first = insertBody({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns: deriveColumns(seededRecords(), {}, KITCHEN_L_DESIGN.room),
      target: { kind: "placement", id: "p22" },
      buildId: CATALOGUE_WALL_CABINET,
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(depthOfMm(first.design, first.effect.placementId)).toBe(600);

    const second = insertBody({
      design: first.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns: deriveColumns(seededRecords(), {}, KITCHEN_L_DESIGN.room),
      target: { kind: "placement", id: first.effect.placementId },
      buildId: "wall-lift",
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(depthOfMm(second.design, second.effect.placementId)).toBe(600);
  });
});
