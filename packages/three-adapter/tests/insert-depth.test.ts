// The reported defect, reproduced and closed on real geometry: delete a top-row cabinet, insert one
// back, and it returned **400 mm** deep beside its 330 mm neighbours. Photographed on the owner's
// handset, 2026-08-27.
//
// The cause was two unlinked constants: §7's `nominalDepthMm` (`catalog.ts`, `WALL_DEPTH_MM`) and
// §5.2's head-clearance cap (`insert-fit.ts`, `WALL_CARCASS_MAX_DEPTH_OVER_WORKTOP_M`) were
// independent literals that happened to agree at 400, and `resolveDepthM` caps against `Column.d` —
// 580 over a base run — so `min(0.58, 0.4) = 0.4`. M5 wave 5A makes both read one worktop → wall
// depth map row, 330 at the shipped 600 mm worktop.
//
// **This file has to live here rather than in the domain.** Backlog entry 9: a fake `BodyProbe`
// reports back the depth it was handed, so a domain test with a fake probe cannot see a depth defect
// at all. Every assertion below runs `insertBody` against the **real** builders (`makeKit`) and the
// **real** probe (`createBodyProbe`), which is what decides the number the customer sees.
import {
  deriveColumns,
  derivePlacementRecords,
  occupiedDepthM,
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

/** §7's head-clearance cap at the shipped 600 mm worktop, restated as the *expectation* rather than
 *  imported from the code under test. */
const WALL_DEPTH_OVER_WORKTOP_MM = 330;

/** What the defect built, named so the anti-invariant is explicit rather than implied by the
 *  expectation above. */
const DEFECTIVE_DEPTH_MM = 400;

/** A top-row cabinet over the base run: `p19` stands at A 2600, above the hob base `p2`, whose
 *  580 mm depth is the `Column.d` the old cap was applied to. */
const TOP_ROW_PLACEMENT_ID = "p19";
const TOP_ROW_COLUMN = "A|2.60";
const TOP_ROW_VOID_Y0_M = 2.2;

/** The column `docs/BACKLOG.md` entry 10 was measured on: `p7` is the freestanding fridge and `p24`
 *  the wall body over it. The fridge stays put while `p24` is deleted, so `hasFullHeightUnder`
 *  remains true and §5.2's cap remains lifted — which is the whole of what makes this the uncapped
 *  path rather than the capped one `insert-depth.qa.test.ts` reaches by clearing the fridge too. */
const OVER_THE_FRIDGE_PLACEMENT_ID = "p24";
const FRIDGE_COLUMN = "B|2.45";
const OVER_THE_FRIDGE_VOID_Y0_M = 1.85;

/** ADR 0060 decision 2's lifted arm at the shipped cabinet depth — the **cabinet-depth line**, and
 *  the depth entry 10 closes at. Written as the expectation rather than imported. */
const CABINET_DEPTH_LINE_MM = 600;

/** The clearance of the fridge column: a 680 mm appliance plus its two door bars. It is what the
 *  uncapped arm used to hand the probe, and stating it is what keeps the assertion below from being
 *  read as "the two routes happen to agree". */
const FRIDGE_COLUMN_CLEARANCE_MM = 742;

/** A wall entry bounded 300–800 with no hole in the middle, so it builds into every opening these
 *  cases reach — the fridge column is 700 mm, and ADR 0032 made a bounded set bind the `'fit'` path.
 *  A shelf declares no floor of its own, so it opens at §2's default rather than at the hinged rows'
 *  200. Depth is this file's subject. */
const CATALOGUE_WALL_CABINET = "open-shelf";
const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

/** ADR 0011 Gap D: the columns' extent is frozen at load and only `hasFullHeightUnder` is
 *  re-answered, which is the contract the store implements. Modelled here rather than imported —
 *  a package's tests may not reach into another package's `tests/` tree. */
interface World {
  readonly design: Design;
  readonly columns: ReadonlyMap<string, Column>;
  readonly voids: readonly VoidRecord[];
}

function loadWorld(design: Design): World {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  const columns = deriveColumns(records, {}, design.room);
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

function insertInto(world: World, voidId: string, buildId: string) {
  const result = insertBody({
    design: world.design,
    catalog: KITCHEN_L_BODY_CATALOG,
    columns: world.columns,
    voids: world.voids,
    target: { kind: "void", id: voidId },
    buildId,
    probe: createBodyProbe(kit, room),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) {
    throw new Error(`Insert of ${buildId} refused: ${result.reason.code}`);
  }
  return result;
}

function recordOf(design: Design, placementId: string) {
  const record = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG).find(
    (candidate) => candidate.id === placementId,
  );
  if (!record) throw new Error(`No record ${placementId}`);
  return record;
}

/** The **seat** — twice the body's rear overhang, which is what `seatDepthMm` persists. */
function depthOfMm(design: Design, placementId: string): number {
  return toMillimetres(recordOf(design, placementId).frame.d);
}

/** How deep the space the body fills is — the number a customer sees and the one two bodies have to
 *  agree on to be flush. Since ADR 0036 decision 1 it is not the seat: a fronted wall carcass
 *  records 39 mm less than it occupies, and an open shelf, having no door and no handle, records
 *  exactly what it occupies. Two different seats, one flush front. */
function occupiedDepthOfMm(design: Design, placementId: string): number {
  return toMillimetres(occupiedDepthM(recordOf(design, placementId)));
}

describe("re-inserting a deleted top-row cabinet (the handset report)", () => {
  it("builds it level with its neighbours, not 400 mm deep", () => {
    const emptied = deleteBody(
      loadWorld(KITCHEN_L_DESIGN),
      TOP_ROW_PLACEMENT_ID,
    );

    // The trap, stated: the opening still carries the base run's 580 mm, so an uncapped build is a
    // 580 mm carcass and this assertion is not vacuous.
    //
    // **600 and not 580 since wave 5F.** §3.2's MAX is now over the space each member fills rather
    // than over its recorded `frame.d`, and this column holds `p13`, the hood, which ADR 0039
    // decision 2 hangs forward to the 600 mm cabinet-depth line. The trap is unchanged and slightly
    // sharper: an uncapped build here is a deep carcass beside 330 mm neighbours.
    //
    // **620 and not 600 since wave S9 (DOM-002).** The hood has stopped being this column's deepest
    // member: the base run under it fills 620 — its worktop — where it used to publish the 580 mm
    // seat it records. Sharper again by 20 mm, and about the same rule.
    const opening = voidAt(emptied, TOP_ROW_COLUMN, TOP_ROW_VOID_Y0_M);
    expect(toMillimetres(opening.d)).toBe(620);
    expect(emptied.columns.get(TOP_ROW_COLUMN)?.hasFullHeightUnder).toBe(false);

    const result = insertInto(emptied, opening.id, CATALOGUE_WALL_CABINET);
    const builtDepthMm = depthOfMm(result.design, result.effect.placementId);

    expect(builtDepthMm).toBe(WALL_DEPTH_OVER_WORKTOP_MM);
    expect(builtDepthMm).not.toBe(DEFECTIVE_DEPTH_MM);
  });

  it("lands flush with the top-row cabinets either side of it", () => {
    // The defect as the customer saw it: p18 and p20 flank the emptied slot at 330 mm.
    const emptied = deleteBody(
      loadWorld(KITCHEN_L_DESIGN),
      TOP_ROW_PLACEMENT_ID,
    );
    const opening = voidAt(emptied, TOP_ROW_COLUMN, TOP_ROW_VOID_Y0_M);
    const result = insertInto(emptied, opening.id, CATALOGUE_WALL_CABINET);

    const depthsMm = ["p18", result.effect.placementId, "p20"].map((id) =>
      occupiedDepthOfMm(result.design, id),
    );

    // Asserted on the **occupied** depth since wave 5F, not on the recorded seat: the inserted body
    // is an open shelf and its neighbours are fronted wall cabinets, so the three record 330, 291
    // and 291 while all three fronts land on the same 330 mm line. Flush is a fact about the front,
    // and asserting it on the seat would now read three bodies that *are* level as three that are
    // not.
    expect(depthsMm).toEqual([
      WALL_DEPTH_OVER_WORKTOP_MM,
      WALL_DEPTH_OVER_WORKTOP_MM,
      WALL_DEPTH_OVER_WORKTOP_MM,
    ]);
  });

  it("agrees with the swap route into the same slot", () => {
    // Two routes to "a `wall-2door` in this top-row slot" — delete-then-insert, and a swap in place
    // — must give one answer. They differed by the cap before this wave.
    const emptied = deleteBody(
      loadWorld(KITCHEN_L_DESIGN),
      TOP_ROW_PLACEMENT_ID,
    );
    const opening = voidAt(emptied, TOP_ROW_COLUMN, TOP_ROW_VOID_Y0_M);
    const reinserted = insertInto(emptied, opening.id, CATALOGUE_WALL_CABINET);

    const seeded = loadWorld(KITCHEN_L_DESIGN);
    const swapped = insertBody({
      design: seeded.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns: seeded.columns,
      voids: seeded.voids,
      target: { kind: "placement", id: TOP_ROW_PLACEMENT_ID },
      buildId: CATALOGUE_WALL_CABINET,
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;

    expect(depthOfMm(reinserted.design, reinserted.effect.placementId)).toBe(
      depthOfMm(swapped.design, swapped.effect.placementId),
    );
  });
});

// M6 wave 6I2 — ADR 0060. `docs/BACKLOG.md` entry 10, on the geometry the customer actually gets.
describe("swap and delete-then-insert over the fridge column (backlog entry 10)", () => {
  function emptiedFridgeTop(): World {
    return deleteBody(
      loadWorld(KITCHEN_L_DESIGN),
      OVER_THE_FRIDGE_PLACEMENT_ID,
    );
  }

  it("builds to the cabinet-depth line, not to the column's 742 mm clearance", () => {
    const emptied = emptiedFridgeTop();

    // The trap, stated: the fridge is still standing, so the cap is lifted and the opening still
    // carries §3.2's MAX — the appliance plus its door bars. The old uncapped arm handed exactly
    // this number to the probe and persisted a 742 mm wall carcass.
    const opening = voidAt(emptied, FRIDGE_COLUMN, OVER_THE_FRIDGE_VOID_Y0_M);
    expect(toMillimetres(opening.d)).toBe(FRIDGE_COLUMN_CLEARANCE_MM);
    expect(emptied.columns.get(FRIDGE_COLUMN)?.hasFullHeightUnder).toBe(true);

    const result = insertInto(emptied, opening.id, CATALOGUE_WALL_CABINET);
    const builtDepthMm = depthOfMm(result.design, result.effect.placementId);

    // An open shelf has no front assembly, so its recorded seat *is* its finished depth.
    expect(builtDepthMm).toBe(CABINET_DEPTH_LINE_MM);
    expect(builtDepthMm).not.toBe(FRIDGE_COLUMN_CLEARANCE_MM);
  });

  it("agrees with the swap route at 600 — the smaller of the two numbers entry 10 measured", () => {
    // The literal is the assertion. "They must agree" would also be satisfied by both routes
    // drifting up to the clearance MAX, and 742 is the one number in ADR 0060's table no cabinet was
    // ever built to; 600 is what the seeded design chose over this fridge deliberately.
    const opening = voidAt(
      emptiedFridgeTop(),
      FRIDGE_COLUMN,
      OVER_THE_FRIDGE_VOID_Y0_M,
    );
    const reinserted = insertInto(
      emptiedFridgeTop(),
      opening.id,
      CATALOGUE_WALL_CABINET,
    );

    const seeded = loadWorld(KITCHEN_L_DESIGN);
    const swapped = insertBody({
      design: seeded.design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns: seeded.columns,
      voids: seeded.voids,
      target: { kind: "placement", id: OVER_THE_FRIDGE_PLACEMENT_ID },
      buildId: CATALOGUE_WALL_CABINET,
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;

    const bySwapMm = depthOfMm(swapped.design, swapped.effect.placementId);
    const byInsertMm = depthOfMm(
      reinserted.design,
      reinserted.effect.placementId,
    );

    expect(bySwapMm).toBe(CABINET_DEPTH_LINE_MM);
    expect(byInsertMm).toBe(CABINET_DEPTH_LINE_MM);
  });
});

describe("the map governs the head-clearance rule and nothing else", () => {
  // Anti-invariant: a map applied to every wall body flattens the two deliberately deep top
  // cabinets to 330 and reintroduces backlog entry 5's defect in the opposite direction.
  it.each([
    { id: "p22", underneath: "a tall oven tower", depthMm: 600 },
    { id: "p24", underneath: "the fridge", depthMm: 600 },
  ])(
    "$id keeps its $depthMm mm over $underneath, where the cap is lifted",
    ({ id, depthMm }) => {
      const seeded = loadWorld(KITCHEN_L_DESIGN);
      const result = insertBody({
        design: seeded.design,
        catalog: KITCHEN_L_BODY_CATALOG,
        columns: seeded.columns,
        voids: seeded.voids,
        target: { kind: "placement", id },
        buildId: CATALOGUE_WALL_CABINET,
        probe: createBodyProbe(kit, room),
        occurredAt: OCCURRED_AT,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(depthOfMm(result.design, result.effect.placementId)).toBe(depthMm);
    },
  );

  // **The question this test was written while it was open is answered.** ADR 0039 decision 1 keeps
  // the hood out of the map at a standard 500 mm; decision 2 then hangs it at the front, so what it
  // *records* is a seat of 700 — twice the distance from the wall to the centre of a 500 mm body
  // whose front lands on the 600 mm cabinet-depth line. The map still does not reach it, which is
  // what this assertion is for; the number it does not reach is now stated as the seat it is.
  it("keeps the hood out of the map, and hangs it at the front instead", () => {
    const seeded = loadWorld(KITCHEN_L_DESIGN);
    expect(depthOfMm(seeded.design, "p13")).toBe(2 * 600 - 500);
    expect(depthOfMm(seeded.design, "p13")).not.toBe(
      WALL_DEPTH_OVER_WORKTOP_MM,
    );
  });
});
