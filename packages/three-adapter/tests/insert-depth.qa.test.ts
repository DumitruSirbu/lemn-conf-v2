// Adversarial QA for M5 wave 5A, on the side of the seam where a depth defect is visible at all.
//
// Backlog 9: a fake `BodyProbe` reports back the depth it was handed, so every depth assertion in
// `configurator-domain/tests/commands/insert-depth.test.ts` proves what `resolveDepthM` *asked
// for*, never what got built. Everything below runs the **real** builders (`makeKit`) and the
// **real** probe (`createBodyProbe`).
//
// What `insert-depth.test.ts` (this package) already covers, and this file does not repeat: the
// re-insert into the emptied top-row slot, its agreement with the swap route, and p22/p24 keeping
// 600 over their columns. What it leaves open, and this file closes:
//
//   1. **ADR 0018's compounding round trip, on a body built at the derived cap.** `refuseBuiltSize`
//      checks width and height only, so nothing in the wave watches depth across a save/reload/
//      rebuild cycle. A cap that is read rather than written down is exactly the kind of change
//      that could make the second pass differ from the first.
//   2. **The cleared-`fridge-free` openings, against real geometry.** The wave's Depth criteria
//      name them ("the two openings above a cleared `fridge-free` still behave as
//      `insert-depth.test.ts` pins them") but only the fake-probe file reaches them.
//   3. **`p23`.** The deep-top trio is `p22`, `p23`, `p24`; the wave's new file sweeps two of them.
import {
  canonicalSerializeDesign,
  deriveColumns,
  derivePlacementRecords,
  DesignSchema,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  recomputeVoids,
  removePlacement,
  toMillimetres,
  withCurrentFullHeightMembers,
  type Column,
  type Design,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** §7's head-clearance cap at the shipped 600 mm worktop, restated as the expectation rather than
 *  imported from the code under test. */
const CAP_OVER_WORKTOP_MM = 330;

/** What the reported defect built. Named so every anti-invariant below is explicit. */
const DEFECTIVE_DEPTH_MM = 400;

/** The same cap as a fronted wall body **records**. ADR 0036 decision 1 builds a wall shell at its
 *  declared depth less the 39 mm door-and-handle assembly, and `seatDepthMm` stores the shell (ADR
 *  0018: it is twice the rear overhang, not a depth). An open shelf has no front, so it still
 *  records the cap itself — which is why the sweep below alternates. */
const WALL_LIFT_SEAT_MM = CAP_OVER_WORKTOP_MM - 39;

/** A wall entry with no hole in its bound, for the reason `insert-depth.test.ts` states: the fridge
 *  column is 700 mm and a bounded set binds the `'fit'` path (ADR 0032). */
const WALL_CABINET = "open-shelf";
const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

/** The emptied top-row slot from the handset report: `p19` at A 2600, over the hob base `p2`. */
const TOP_ROW_PLACEMENT_ID = "p19";
const TOP_ROW_COLUMN = "A|2.60";
const TOP_ROW_VOID_Y0_M = 2.2;

/** The fridge column. `p7` is the freestanding fridge (680 mm, full height) and `p24` the deep
 *  cabinet over it; with both gone the column holds nothing, and its frozen `d` is still 680. */
const FRIDGE_COLUMN = "B|2.45";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

/** ADR 0011 Gap D: column extent frozen at load, `hasFullHeightUnder` re-answered per derivation.
 *  Modelled here rather than imported — a package's tests may not reach into another package's
 *  `tests/` tree. */
interface World {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

function loadWorld(design: Design): World {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  const columns = deriveColumns(records);
  return { design, columns, voids: recomputeVoids(records, columns) };
}

function advance(world: World, design: Design): World {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  return {
    design,
    columns: withCurrentFullHeightMembers(world.columns, records),
    voids: recomputeVoids(records, world.columns),
  };
}

function deleteBody(world: World, placementId: string): World {
  const result = removePlacement({
    design: world.design,
    catalog: KITCHEN_L_BODY_CATALOG,
    target: { kind: "placement", id: placementId },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    throw new Error(`Could not remove ${placementId}: ${result.reason.code}`);
  }
  return advance(world, result.design);
}

function voidAt(world: World, col: string, y0M: number): VoidRecord {
  const found = world.voids.find(
    (record) => record.col === col && Math.abs(record.y0 - y0M) < 0.01,
  );
  if (!found) throw new Error(`No void at ${col} y0=${String(y0M)}`);
  return found;
}

function insert(
  world: World,
  target: { kind: "void"; id: string } | { kind: "placement"; id: string },
  buildId: string,
) {
  const result = insertBody({
    design: world.design,
    catalog: KITCHEN_L_BODY_CATALOG,
    columns: world.columns,
    target,
    buildId,
    probe: createBodyProbe(kit, room),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    throw new Error(`Insert of ${buildId} refused: ${result.reason.code}`);
  }
  return result;
}

function depthOfMm(design: Design, placementId: string): number {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record ${placementId}`);
  return toMillimetres(record.frame.d);
}

/** A save and a reload, exactly as the repository does it: canonical JSON out, `DesignSchema` back
 *  in. Nothing about depth may survive only in memory. */
function saveAndReload(design: Design): Design {
  return DesignSchema.parse(JSON.parse(canonicalSerializeDesign(design)));
}

function emptiedTopRow(): World {
  return deleteBody(loadWorld(KITCHEN_L_DESIGN), TOP_ROW_PLACEMENT_ID);
}

describe("ADR 0018: the derived cap does not compound across save, reload and rebuild", () => {
  it("re-inserts, saves, reloads and re-swaps ten times without the depth drifting", () => {
    // `refuseBuiltSize` re-checks the built **width and height** only. If a body's measured seat
    // fed the next opening's depth, the number would creep — which is the growth ADR 0018 names.
    // Nothing else in this wave asserts it, because the domain's round-trip test uses a fake probe
    // whose seat is a pure function of the depth it was handed.
    const opening = voidAt(emptiedTopRow(), TOP_ROW_COLUMN, TOP_ROW_VOID_Y0_M);
    const first = insert(
      emptiedTopRow(),
      { kind: "void", id: opening.id },
      WALL_CABINET,
    );

    let world = loadWorld(saveAndReload(first.design));
    let placementId = first.effect.placementId;
    const depthsMm = [depthOfMm(world.design, placementId)];

    for (let pass = 0; pass < 10; pass += 1) {
      const buildId = pass % 2 === 0 ? "wall-lift" : WALL_CABINET;
      const swapped = insert(
        world,
        { kind: "placement", id: placementId },
        buildId,
      );
      placementId = swapped.effect.placementId;
      world = loadWorld(saveAndReload(swapped.design));
      depthsMm.push(depthOfMm(world.design, placementId));
    }

    expect(depthsMm).toHaveLength(11);
    // **Two values, and which one you get depends only on which body is standing there** — never
    // on how many round trips preceded it, which is the whole of what ADR 0018 warns about. Since
    // wave 5F an open shelf and a fronted wall body no longer record the same seat: ADR 0036
    // decision 1 makes 330 the *finished* depth, and a lift-up carries a flap and a bar handle
    // while an open shelf carries nothing, so the shelf seats on 330 and the lift-up on 291.
    //
    // Asserted as a per-pass expectation rather than a set, because a set of two would also be
    // satisfied by a depth that drifted between the same two numbers.
    expect(depthsMm).toEqual(
      Array.from({ length: 11 }, (_, pass) =>
        pass % 2 === 0 ? CAP_OVER_WORKTOP_MM : WALL_LIFT_SEAT_MM,
      ),
    );
    expect(depthsMm).not.toContain(DEFECTIVE_DEPTH_MM);
  });

  it("survives the save and reload with the measured seat intact", () => {
    // Guards the test above against going vacuous: if `seatDepthMm` were dropped on serialisation,
    // `deriveFrame` would fall back to `frameDepthMm` — 330 for a wall entry — and the sweep would
    // read the right number for the wrong reason.
    const opening = voidAt(emptiedTopRow(), TOP_ROW_COLUMN, TOP_ROW_VOID_Y0_M);
    const inserted = insert(
      emptiedTopRow(),
      { kind: "void", id: opening.id },
      WALL_CABINET,
    );
    const reloaded = saveAndReload(inserted.design);

    const placement = reloaded.placements.find(
      (candidate) => candidate.id === inserted.effect.placementId,
    );
    expect(placement?.body.seatDepthMm).toBe(CAP_OVER_WORKTOP_MM);
  });
});

describe("the openings above a cleared fridge, on real geometry", () => {
  function clearedFridgeColumn(): World {
    return deleteBody(deleteBody(loadWorld(KITCHEN_L_DESIGN), "p24"), "p7");
  }

  it.each([{ y0M: 1.5 }, { y0M: 2.2 }])(
    "recedes to the cap at y0 $y0M, not to the column's frozen 680 mm",
    ({ y0M }) => {
      const world = clearedFridgeColumn();
      const opening = voidAt(world, FRIDGE_COLUMN, y0M);

      // The trap, stated: the opening still carries the fridge's own depth, so an uncapped build
      // is a carcass that deep and this assertion is not vacuous.
      //
      // **742 and not 680 since wave S9 (DOM-002).** 680 is the seat a freestanding fridge records
      // (ADR 0018); the space it fills is its appliance body plus its two door bars, and the frozen
      // column keeps *that*. The trap is unchanged and 62 mm sharper.
      expect(toMillimetres(opening.d)).toBe(742);
      expect(world.columns.get(FRIDGE_COLUMN)?.hasFullHeightUnder).toBe(false);

      const result = insert(
        world,
        { kind: "void", id: opening.id },
        WALL_CABINET,
      );
      const builtMm = depthOfMm(result.design, result.effect.placementId);

      expect(builtMm).toBe(CAP_OVER_WORKTOP_MM);
      expect(builtMm).not.toBe(DEFECTIVE_DEPTH_MM);
    },
  );
});

describe("the map does not flatten the third deep top cabinet either", () => {
  it("keeps p23 at 600 mm over the tall pantry, where the cap is lifted", () => {
    const seeded = loadWorld(KITCHEN_L_DESIGN);
    const result = insert(
      seeded,
      { kind: "placement", id: "p23" },
      WALL_CABINET,
    );

    expect(depthOfMm(result.design, result.effect.placementId)).toBe(600);
  });
});
