// Adversarial QA for M5B waves 5B6 (the hob+oven filler front) and 5B7 (open-shelf compartments).
//
// The implementer tested what it built; this file tests what it assumed. Everything is measured off
// built geometry — world bounding boxes and material identity — and never read back out of the
// argument a builder was handed or out of a constant the code under test exports.
import {
  deriveColumns,
  derivePlacementRecords,
  insertBody,
  INSERTABLE_BODY_DEFINITIONS,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  LEVELS,
  recomputeVoids,
  removePlacement,
  toMetres,
  toMillimetres,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** Written out rather than imported from the code under test: a test that reads its expectation out
 *  of the thing it is checking proves nothing. §2's worktop line and the 600 mm hob module. */
const WORKTOP_UNDERSIDE_MM = 820;
const HOB_BASE_WIDTH_MM = 600;
/** ADR 0040's declaration for `base-hob-oven`, retyped on purpose for the same reason. */
const HOB_OVEN_DECLARED_DEPTH_MM = 648;
/** The shadow gap two fronts leave each other, retyped. */
const FRONT_SHADOW_GAP_MM = 4;

/** ADR 0047's threshold, retyped for the same reason as the numbers above. */
const OPEN_SHELF_TWO_COMPARTMENT_MAX_HEIGHT_MM = 500;

/** Both sides of that threshold at the millimetre, the two `LEVELS` row heights, and §4's
 *  `MIN_SPAN_M` floor — every height at which the interior-board count or the divisor changes. */
const SPACING_SWEEP_MM = [300, 400, 499, 500, 501, 600, 700];

const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

function boxOf(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function mm(metres: number): number {
  return Number((metres * 1000).toFixed(3));
}

function meshesNamed(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (isMesh(node) && node.name === name) found.push(node);
  });
  return found;
}

/** The one mesh with this name, or a failure that says which name was missing — an optional lookup
 *  would let a renamed mesh turn an assertion into a silent skip. */
function meshNamed(root: THREE.Object3D, name: string): THREE.Mesh {
  const [mesh] = meshesNamed(root, name);
  if (!mesh) throw new Error(`no mesh named "${name}"`);
  return mesh;
}

// ---------------------------------------------------------------------------
// Wave 5B6 — the hob+oven cavity
// ---------------------------------------------------------------------------

function hobOvenBody(builtKit: Kit = kit, widthM = 0.6): THREE.Group {
  const body = builtKit.make.hobBaseWithOven(widthM);
  body.updateMatrixWorld(true);
  return body;
}

function fillerOf(body: THREE.Object3D): THREE.Mesh {
  const found = meshesNamed(body, "oven_filler_door_front");
  if (found.length !== 1)
    throw new Error(
      `expected one oven_filler_door_front, found ${String(found.length)}`,
    );
  return meshNamed(body, "oven_filler_door_front");
}

function ovenOf(body: THREE.Object3D): THREE.Object3D {
  const oven = body.getObjectByName("oven");
  if (!oven) throw new Error("hob+oven body has no oven");
  return oven;
}

describe("5B6: the oven filler front, measured", () => {
  // The band is read off the oven's built bounding box. If the oven builder ever moves, or a width
  // ever changes what is inside the carcass, this is where it shows: a zero or inverted band, or a
  // panel that has stopped touching the two things it is supposed to bridge.
  it.each([0.4, 0.5, 0.6, 0.8, 1.2])(
    "bridges the oven top to the worktop underside at width %s m, with no inverted band",
    (widthM) => {
      const body = hobOvenBody(kit, widthM);
      const filler = boxOf(fillerOf(body));
      const oven = boxOf(ovenOf(body));

      expect(mm(filler.max.y - filler.min.y)).toBeGreaterThan(0);
      expect(mm(filler.min.y - oven.max.y)).toBeCloseTo(FRONT_SHADOW_GAP_MM, 3);
      expect(mm(filler.max.y)).toBeCloseTo(WORKTOP_UNDERSIDE_MM, 3);
    },
  );

  it("does not overlap the worktop, the plinth or the carcass back", () => {
    const body = hobOvenBody();
    const filler = boxOf(fillerOf(body));

    const counter = boxOf(meshNamed(body, "countertop"));
    const plinth = boxOf(meshNamed(body, "plinth"));
    const back = boxOf(meshNamed(body, "back_panel"));

    // Touching the worktop underside exactly is the intent; passing into it is not.
    expect(filler.max.y).toBeLessThanOrEqual(counter.min.y + 1e-9);
    expect(filler.min.y).toBeGreaterThan(plinth.max.y);
    expect(filler.min.z).toBeGreaterThan(back.max.z);
  });

  it("stands on the same front line a base cabinet's door stands on", () => {
    const filler = boxOf(fillerOf(hobOvenBody()));

    const reference = kit.make.baseCabinet(0.6, { doors: 2 });
    reference.updateMatrixWorld(true);
    const door = boxOf(meshNamed(reference, "door_front"));

    expect(mm(filler.min.z)).toBeCloseTo(mm(door.min.z), 3);
    expect(mm(filler.max.z)).toBeCloseTo(mm(door.max.z), 3);
  });

  // Criterion 3, verified without reading the implementer's reasoning: the body's finished depth is
  // set by the oven's own handle, and the new panel is nowhere near it.
  it("leaves ADR 0040's declared 648 mm alone, because the oven handle sets it", () => {
    const body = hobOvenBody();
    const whole = boxOf(body);
    const filler = boxOf(fillerOf(body));
    const handle = boxOf(meshNamed(body, "handle_bar"));

    expect(mm(whole.max.z - whole.min.z)).toBeCloseTo(
      HOB_OVEN_DECLARED_DEPTH_MM,
      3,
    );
    expect(mm(handle.max.z)).toBeCloseTo(mm(whole.max.z), 3);
    expect(filler.max.z).toBeLessThan(handle.max.z);
  });

  // The implementer rejected its own criterion "no mesh intersects the oven's bbox" as already
  // false. This records that it was right — and pins the weaker property that replaced it.
  it("was already intersecting the oven's box before the wave, and the panel is not", () => {
    const body = hobOvenBody();
    const oven = boxOf(ovenOf(body));
    const filler = boxOf(fillerOf(body));

    const preExisting = ["side_left", "side_right", "panel_bottom"]
      .map((name) => ({ name, box: boxOf(meshNamed(body, name)) }))
      .filter(({ box }) => box.intersectsBox(oven))
      .map(({ name }) => name);

    expect(preExisting).toEqual(["side_left", "side_right", "panel_bottom"]);
    expect(filler.intersectsBox(oven)).toBe(false);
  });

  // `cabinetDepthMm` is a live seam — `cabinet-depth-source.test.ts` exercises the carcass formula
  // "beyond its one reachable input" because M6's *Setări globale* control is the first thing that
  // would find it. The filler's z is derived from that depth; its y must not be.
  it.each([400, 500, 560, 600, 700, 800])(
    "keeps the band and the worktop line at cabinet depth %i mm",
    (cabinetDepthMm) => {
      const depthKit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm,
      });
      const body = hobOvenBody(depthKit);
      const filler = boxOf(fillerOf(body));
      const whole = boxOf(body);

      expect(mm(filler.max.y - filler.min.y)).toBeGreaterThan(0);
      expect(mm(filler.max.y)).toBeCloseTo(WORKTOP_UNDERSIDE_MM, 3);
      // The panel never becomes the deepest thing in the body at any depth.
      expect(filler.max.z).toBeLessThan(whole.max.z);
    },
  );

  it("does not reach the seeded kitchen", () => {
    const room = kit.builders["kitchen-l"]();
    room.updateMatrixWorld(true);

    expect(meshesNamed(room, "oven_filler_door_front")).toHaveLength(0);
  });

  // The catalogue-wide invariant this file raised as Q6 against wave 5B6, now settled by ADR 0050:
  // a body that owns a door-material surface must be one the customer can finish. `base-hob-oven`
  // satisfies it by having become finishable — `canFinish: true`, plus the mesh name
  // `oven_filler_door_front` that `finishes.ts`'s `FRONT_MESH_NAME` reaches — and ADR 0027's
  // "deliberately open-front, so it owns no `door_front`" is struck through in place, because wave
  // 5B6 built the panel that falsified it.
  //
  // What this guards from here on is the invariant, not that one entry: any future body built in
  // `M.door` while declaring `canFinish: false` lands in `offenders`, and either the flag or the
  // material is then wrong. A rename away from `/door_front|drawer_front/` is caught by
  // `finishes.test.ts`'s `FILLER_MESH_NAME`, not here.
  it("never builds a door-material surface on a body the customer cannot finish", () => {
    const offenders: { buildId: string; meshes: string[] }[] = [];

    for (const [buildId, definition] of INSERTABLE_BODY_DEFINITIONS) {
      const body = buildCatalogBody(kit, buildId, {
        widthM: toMetres(definition.sizesMm?.[0] ?? HOB_BASE_WIDTH_MM),
        heightM: toMetres(definition.nominalHeightMm ?? 700),
        depthM: toMetres(definition.nominalDepthMm ?? 600),
      });
      body.updateMatrixWorld(true);

      const doorMeshes = new Set<string>();
      body.traverse((node) => {
        if (isMesh(node) && node.material === kit.M.door)
          doorMeshes.add(node.name);
      });

      if (doorMeshes.size > 0 && !definition.canFinish)
        offenders.push({ buildId, meshes: [...doorMeshes].sort() });
    }

    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Wave 5B7 — open-shelf compartments
// ---------------------------------------------------------------------------

/** The clear openings between consecutive boards, bottom-up, measured off mesh faces — which is
 *  what a customer counts and what the ADR fixed the vocabulary on. Reading the `inner` argument
 *  back would agree with an off-by-one. */
function nthBox(boxes: readonly THREE.Box3[], index: number): THREE.Box3 {
  const box = boxes[index];
  if (!box) throw new Error(`no board at index ${String(index)}`);
  return box;
}

function compartmentHeightsMm(body: THREE.Object3D): number[] {
  const boards: THREE.Box3[] = [];
  body.updateMatrixWorld(true);
  body.traverse((node) => {
    if (isMesh(node) && /^shelf_(top|bottom|\d+)$/.test(node.name))
      boards.push(boxOf(node));
  });
  boards.sort((a, b) => a.min.y - b.min.y);

  const heights: number[] = [];
  for (let i = 0; i < boards.length - 1; i += 1)
    heights.push(mm(nthBox(boards, i + 1).min.y - nthBox(boards, i).max.y));
  return heights;
}

/** The interior boards only — `shelf_top` and `shelf_bottom` are the carcass, and criterion 4 is a
 *  statement about what stands between them. Bottom-up, as measured world boxes. */
function interiorBoardBoxes(body: THREE.Object3D): THREE.Box3[] {
  const boards: THREE.Box3[] = [];
  body.updateMatrixWorld(true);
  body.traverse((node) => {
    if (isMesh(node) && /^shelf_\d+$/.test(node.name)) boards.push(boxOf(node));
  });
  return boards.sort((a, b) => a.min.y - b.min.y);
}

function centreY(box: THREE.Box3): number {
  return (box.min.y + box.max.y) / 2;
}

function openShelfAt(heightMm: number): THREE.Group {
  return buildCatalogBody(kit, "open-shelf", {
    widthM: 0.6,
    heightM: toMetres(heightMm),
    depthM: 0.33,
  });
}

describe("5B7: open-shelf compartments, counted from geometry", () => {
  it("gives the top row two compartments and the middle row three, at the real row heights", () => {
    const spanMm = (level: readonly [number, number]) =>
      toMillimetres(level[1] - level[0]);
    const [, middleRow, topRow] = LEVELS;
    if (!middleRow || !topRow) throw new Error("LEVELS lost a wall-plane row");
    const middleRowMm = spanMm(middleRow);
    const topRowMm = spanMm(topRow);

    expect({ middleRowMm, topRowMm }).toEqual({
      middleRowMm: 700,
      topRowMm: 400,
    });
    expect(compartmentHeightsMm(openShelfAt(middleRowMm))).toHaveLength(3);
    expect(compartmentHeightsMm(openShelfAt(topRowMm))).toHaveLength(2);
  });

  it.each([
    { heightMm: 300, compartments: 2 },
    { heightMm: 499, compartments: 2 },
    { heightMm: 500, compartments: 2 },
    { heightMm: 501, compartments: 3 },
    { heightMm: 700, compartments: 3 },
  ])(
    "builds $compartments compartments at $heightMm mm",
    ({ heightMm, compartments }) => {
      expect(compartmentHeightsMm(openShelfAt(heightMm))).toHaveLength(
        compartments,
      );
    },
  );

  it("never opens a zero or negative compartment across the reachable range", () => {
    for (let heightMm = 300; heightMm <= 700; heightMm += 1) {
      const heights = compartmentHeightsMm(openShelfAt(heightMm));
      expect({ heightMm, smallest: Math.min(...heights) > 0 }).toEqual({
        heightMm,
        smallest: true,
      });
    }
  });

  it("keeps no board coincident with the carcass boards it stands between", () => {
    for (const heightMm of [300, 400, 500, 501, 700]) {
      const heights = compartmentHeightsMm(openShelfAt(heightMm));
      for (const height of heights)
        expect({ heightMm, height: height > 1 }).toEqual({
          heightMm,
          height: true,
        });
    }
  });

  // The count is derived from the requested height, and `scene-sync` rebuilds a persisted placement
  // from `record.heightMm`. A shelf that reloaded with a different compartment count would be the
  // ADR 0018 clause 4 shape in a new place, so this walks the whole reachable range.
  it("reloads at the same compartment count it was inserted with", () => {
    for (let heightMm = 300; heightMm <= 700; heightMm += 1) {
      const inserted = compartmentHeightsMm(openShelfAt(heightMm)).length;
      const reloaded = compartmentHeightsMm(
        openShelfAt(toMillimetres(toMetres(heightMm))),
      ).length;
      expect({ heightMm, inserted, reloaded }).toEqual({
        heightMm,
        inserted,
        reloaded: inserted,
      });
    }
  });

  it("keeps the seeded open shelf's three compartments byte-for-byte", () => {
    const seeded = kit.make.openShelf(0.6, 0.33, 2);
    expect(compartmentHeightsMm(seeded)).toHaveLength(3);
  });

  // Criterion 4, as reworded on 2026-09-01 (ADR 0047's correction section): the guarantee is about
  // board *centres*, not about equal clear compartments. Q2 asked whether the ~9 mm end-compartment
  // shortfall was a defect; the owner answered that the geometry stands and the records were
  // imprecise, so this now pins what the geometry actually promises.
  //
  // Everything below is measured. The span is taken between the two end boards' outer faces rather
  // than from `heightMm`, and each centre from the board's own box, so a builder that divided by
  // `inner` instead of `inner + 1` — or that centred on clear compartments — moves the centres off
  // these positions and fails here.
  it("spaces interior board centres at H·i/(N+1) of the measured span", () => {
    for (const heightMm of SPACING_SWEEP_MM) {
      const shelf = openShelfAt(heightMm);
      const bottom = boxOf(meshNamed(shelf, "shelf_bottom"));
      const top = boxOf(meshNamed(shelf, "shelf_top"));
      const interior = interiorBoardBoxes(shelf);

      // A shelf that stopped following its clearance would otherwise satisfy the spacing check
      // vacuously at whatever count it froze on.
      expect({ heightMm, interior: interior.length }).toEqual({
        heightMm,
        interior: heightMm > OPEN_SHELF_TWO_COMPARTMENT_MAX_HEIGHT_MM ? 2 : 1,
      });

      const spanMm = mm(top.max.y - bottom.min.y);
      const measuredCentresMm = interior.map((board) =>
        mm(centreY(board) - bottom.min.y),
      );
      const evenCentresMm = interior.map((_, index) =>
        Number(((spanMm * (index + 1)) / (interior.length + 1)).toFixed(3)),
      );

      expect({ heightMm, measuredCentresMm }).toEqual({
        heightMm,
        measuredCentresMm: evenCentresMm,
      });
    }
  });

  // The other half of criterion 4: strictly between the two end boards, with no face touching or
  // crossing either. A divisor that produced a centre at 0 or at H would still be "even" by the
  // check above; it would put a board inside the carcass boards, and it fails here.
  it("keeps every interior board strictly between shelf_bottom and shelf_top", () => {
    for (const heightMm of SPACING_SWEEP_MM) {
      const shelf = openShelfAt(heightMm);
      const bottom = boxOf(meshNamed(shelf, "shelf_bottom"));
      const top = boxOf(meshNamed(shelf, "shelf_top"));

      for (const [index, board] of interiorBoardBoxes(shelf).entries()) {
        expect({
          heightMm,
          index,
          aboveBottom: board.min.y > bottom.max.y,
          belowTop: board.max.y < top.min.y,
        }).toEqual({ heightMm, index, aboveBottom: true, belowTop: true });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Wave 5B7 — through the real insert flow, not the builder's front door
// ---------------------------------------------------------------------------

function seededColumns() {
  return deriveColumns(
    derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
  );
}

/** The shipped kitchen with one whole column emptied — the state a customer reaches by deleting it,
 *  and the only way the wall-plane rows become insertable openings at all. */
function clearedColumn(ids: readonly string[]): Design {
  let design: Design = KITCHEN_L_DESIGN;
  for (const id of ids) {
    const result = removePlacement({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "placement", id },
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error(`delete refused: ${result.reason.code}`);
    design = result.design;
  }
  return design;
}

/** Every opening the emptied column offers `open-shelf` in, with the height the domain actually
 *  hands the builder. */
function openShelfInsertHeights(): number[] {
  const columns = seededColumns();
  const design = clearedColumn(["p1", "p12", "p18"]);
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  const voids = recomputeVoids(records, columns);

  const heights: number[] = [];
  for (const opening of voids) {
    const result = insertBody({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns,
      target: { kind: "void", id: opening.id },
      buildId: "open-shelf",
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) continue;
    const placed = result.design.placements.find(
      (placement) => placement.id === result.effect.placementId,
    );
    if (placed) heights.push(placed.body.heightMm);
  }
  return heights;
}

describe("5B7: the compartment count the insert flow actually produces", () => {
  it("only ever produces heights whose compartment count matches the clearance rule", () => {
    const heights = openShelfInsertHeights();
    expect(heights.length).toBeGreaterThan(0);

    for (const heightMm of heights) {
      const built = compartmentHeightsMm(openShelfAt(heightMm)).length;
      expect({ heightMm, built }).toEqual({
        heightMm,
        built: heightMm > OPEN_SHELF_TWO_COMPARTMENT_MAX_HEIGHT_MM ? 3 : 2,
      });
    }
  });
});
