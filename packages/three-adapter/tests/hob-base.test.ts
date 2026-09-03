// Backlog entry 1, on real geometry: delete the cabinet under the hob and the hob can be put back.
//
// The defect it closes, measured before ADR 0027: deleting `p2` cascaded `p3` away with it — which
// was correct — and left a 600 x 860 opening whose offer list held six base bodies, **none** of them
// carrying a hob. `cooktop-600` is a seeded entry and ADR 0011 Gap A never offers one, so the
// customer lost a fixture with no way to restore it.
//
// This file is here rather than in the domain for `swap-depth.test.ts`'s reason: only the real
// builders and the real probe can say what the restored cabinet is actually built to. A fake probe
// reports back the size it was handed and would agree with anything.
import {
  deriveColumns,
  derivePlacementRecords,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  recomputeVoids,
  removePlacement,
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
import { meshNames } from "./support/structure.js";

/** The seeded hob-bearing cabinet, and the column it stands in. */
const HOB_PLACEMENT_ID = "p2";
const HOB_COLUMN = "A|2.60";
/** The 800 mm sink base — the widest base opening in the shipped kitchen, and the one that proves
 *  a hob-bearing body is fixed at 600 rather than merely built at it. */
const WIDE_BASE_PLACEMENT_ID = "p0";

const HOB_BUILD_IDS = ["base-hob-2drawer", "base-hob-oven"] as const;

/** §2's worktop line, and the module width a 600 mm hob is made for. Written out rather than
 *  imported from the catalogue: a test that reads its expectation out of the code under test
 *  proves nothing. */
const HOB_BASE_WIDTH_MM = 600;
const WORKTOP_HEIGHT_MM = 860;
const BASE_SEAT_DEPTH_MM = 580;

const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
});

const frozenColumns = () =>
  deriveColumns(
    derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
    {},
    KITCHEN_L_DESIGN.room,
  );

/** The design with the hob-bearing cabinet deleted — the state the customer reaches in one click,
 *  and the state that used to be unrecoverable. */
function clearedHobColumn(): Design {
  const result = removePlacement({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    target: { kind: "placement", id: HOB_PLACEMENT_ID },
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`delete refused: ${result.reason.code}`);
  return result.design;
}

function vacatedOpening(design: Design) {
  const columns = frozenColumns();
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  const voids = recomputeVoids(records, columns);
  const opening = voids.find(
    (record) => record.col === HOB_COLUMN && Math.abs(record.y0) < 0.01,
  );
  if (!opening) throw new Error("the deleted hob cabinet left no opening");
  return { columns, records, voids, opening };
}

describe("the hob can be put back after its cabinet is deleted", () => {
  it("leaves a 600 x 860 opening that offers both hob-bearing bodies", () => {
    const design = clearedHobColumn();
    const { columns, records, voids, opening } = vacatedOpening(design);
    expect(Math.round(opening.w * 1000)).toBe(HOB_BASE_WIDTH_MM);
    expect(Math.round(opening.h * 1000)).toBe(WORKTOP_HEIGHT_MM);

    const offered = offersFor({
      records,
      voids,
      columns,
      catalog: KITCHEN_L_BODY_CATALOG,
      target: { kind: "void", id: opening.id },
    }).map((offer) => offer.buildId);

    for (const buildId of HOB_BUILD_IDS) {
      expect(offered, `${buildId} is offered`).toContain(buildId);
    }
  });

  it.each(HOB_BUILD_IDS)(
    "%s goes back into that opening at 600 x 860, seated on the wall",
    (buildId) => {
      const design = clearedHobColumn();
      const { columns, opening } = vacatedOpening(design);
      const result = insertBody({
        design,
        catalog: KITCHEN_L_BODY_CATALOG,
        columns,
        target: { kind: "void", id: opening.id },
        buildId,
        probe: createBodyProbe(kit, room),
        occurredAt: OCCURRED_AT,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const placed = result.design.placements.find(
        (placement) => placement.id === result.effect.placementId,
      );
      expect(placed?.body).toMatchObject({
        buildId,
        widthMm: HOB_BASE_WIDTH_MM,
        heightMm: WORKTOP_HEIGHT_MM,
        // ADR 0018: twice the measured seat, and the hob rides above the worktop rather than
        // reaching further back, so a hob-bearing base seats exactly where any base body does.
        seatDepthMm: BASE_SEAT_DEPTH_MM,
      });
      expect(placed?.y0Mm).toBe(0);
    },
  );

  it.each(HOB_BUILD_IDS)("%s actually carries a hob", (buildId) => {
    const names = meshNames(
      buildCatalogBody(kit, buildId, {
        widthM: HOB_BASE_WIDTH_MM / 1000,
        heightM: WORKTOP_HEIGHT_MM / 1000,
        depthM: BASE_SEAT_DEPTH_MM / 1000,
      }),
    );
    expect(names).toContain("cooktop_glass");
    expect(names.filter((name) => name === "burner_ring")).toHaveLength(4);
  });

  it("base-hob-oven carries an oven and base-hob-2drawer does not", () => {
    const size = {
      widthM: HOB_BASE_WIDTH_MM / 1000,
      heightM: WORKTOP_HEIGHT_MM / 1000,
      depthM: BASE_SEAT_DEPTH_MM / 1000,
    };
    expect(meshNames(buildCatalogBody(kit, "base-hob-oven", size))).toContain(
      "oven_cavity",
    );
    expect(
      meshNames(buildCatalogBody(kit, "base-hob-2drawer", size)),
    ).not.toContain("oven_cavity");
  });

  // The hob is a 600 mm appliance, so the cabinet under it is a millimetre set rather than a
  // `'fit'` body — it never widens to its opening, and never carries a 600 mm hob adrift on an
  // 800 mm worktop.
  //
  // **What §5.2 then does with a wider opening is backlog entry 8, and it is pinned here rather
  // than asserted as desirable.** A millimetre-set body takes the widest size in its set that fits,
  // so swapping the 800 mm sink base for a hob base builds 600 and leaves 200 mm of nothing beside
  // it — §4 splits voids vertically only, so no opening appears there. The dishwasher niche has
  // always behaved this way (450 in a 600 leaves 150); these two entries are a third instance at a
  // wider amplitude, and the owner has not decided entry 8. If that decision lands, this is the
  // case that has to change.
  it.each(HOB_BUILD_IDS)(
    "%s never widens past 600: an 800 mm opening gets a 600 mm cabinet, not an 800 mm one",
    (buildId) => {
      const result = insertBody({
        design: KITCHEN_L_DESIGN,
        catalog: KITCHEN_L_BODY_CATALOG,
        columns: frozenColumns(),
        target: { kind: "placement", id: WIDE_BASE_PLACEMENT_ID },
        buildId,
        probe: createBodyProbe(kit, room),
        occurredAt: OCCURRED_AT,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const placed = result.design.placements.find(
        (placement) => placement.id === result.effect.placementId,
      );
      expect(placed?.body.widthMm).toBe(HOB_BASE_WIDTH_MM);
    },
  );
});

// M5B wave 5B6. Reported by the owner in manual UX testing: the hob-and-oven base showed a raw
// open cavity between the worktop and the oven's top, because the carcass under a built-in oven is
// deliberately open-front and nothing spanned the band the appliance leaves.
//
// Everything below finds the panel **by measured bounds**, never by mesh name: a name would pass
// for a mesh built anywhere, and what the defect was about is where the geometry is.
describe("the hob-and-oven base dresses the band above the oven", () => {
  /** Written out rather than imported: §2's 860 mm worktop on a 40 mm slab, and the 560 mm carcass
   *  a 600 mm base body is built to, centred on z 0. A test that reads its expectation out of the
   *  code under test proves nothing. */
  const CARCASS_FRONT_Z = 0.28;
  const COUNTER_UNDERSIDE_Y = 0.82;
  /** The shadow gap this kit leaves between any two fronts, and the width every front is inset
   *  from the carcass it covers. */
  const FRONT_SHADOW_GAP = 0.004;
  const FRONT_WIDTH_INSET = 0.006;
  /** ADR 0040's declared finished depth for `base-hob-oven`, on ADR 0018's 580 mm base seat. */
  const HOB_OVEN_FINISHED_DEPTH_MM = 648;
  /** Vertex positions come back through float32 buffers, so a measured bound lands within a few
   *  tens of nanometres of the metre value the builder asked for. M1's fidelity gate reads the same
   *  geometry at 1e-6 m; these bounds are held to the same epsilon. */
  const MEASURED_TOLERANCE_M = 1e-6;
  const BASE_SEAT_M = BASE_SEAT_DEPTH_MM / 1000;

  const WIDTH_M = HOB_BASE_WIDTH_MM / 1000;

  function isInsideAppliance(mesh: THREE.Object3D): boolean {
    for (let node = mesh.parent; node; node = node.parent) {
      if (node.name === "oven" || node.name === "cooktop") return true;
    }
    return false;
  }

  /** Every mesh the cabinet itself builds — the bought appliances it carries excluded, since the
   *  question is what the *cabinetry* does with the band. */
  function cabinetryBoxes(body: THREE.Group): THREE.Box3[] {
    const boxes: THREE.Box3[] = [];
    body.traverse((node) => {
      if (!isMesh(node) || isInsideAppliance(node)) return;
      boxes.push(new THREE.Box3().setFromObject(node));
    });
    return boxes;
  }

  function builtBody(): THREE.Group {
    const body = kit.make.hobBaseWithOven(WIDTH_M);
    body.updateWorldMatrix(true, true);
    return body;
  }

  function ovenBoxOf(body: THREE.Group): THREE.Box3 {
    const oven = body.getObjectByName("oven");
    if (!oven) throw new Error("the hob-and-oven base built no oven");
    return new THREE.Box3().setFromObject(oven);
  }

  /** The one piece of cabinetry standing at or forward of the carcass front plane and sitting
   *  wholly under the worktop line — selected by position alone. */
  function facadeBoxesOf(body: THREE.Group): THREE.Box3[] {
    return cabinetryBoxes(body).filter(
      (box) =>
        box.min.z >= CARCASS_FRONT_Z - MEASURED_TOLERANCE_M &&
        box.max.y <= COUNTER_UNDERSIDE_Y + MEASURED_TOLERANCE_M,
    );
  }

  function theFacadeOf(body: THREE.Group): THREE.Box3 {
    const found = facadeBoxesOf(body);
    expect(
      found,
      "exactly one front-plane panel under the worktop",
    ).toHaveLength(1);
    const [facade] = found;
    if (!facade) throw new Error("no front-plane panel under the worktop");
    return facade;
  }

  it("stands a full-width panel across the band from the oven's top to the worktop", () => {
    const body = builtBody();
    const ovenTopY = ovenBoxOf(body).max.y;
    const facade = theFacadeOf(body);

    // Spans the carcass: no narrower than any other front in the run, which leaves the 560 mm
    // opening covered with room to spare on both sides.
    expect(facade.max.x - facade.min.x).toBeGreaterThanOrEqual(
      WIDTH_M - FRONT_WIDTH_INSET - MEASURED_TOLERANCE_M,
    );
    // Closes the band: up to the worktop's underside, and down to the oven's top face bar the one
    // shadow gap two fronts always leave each other.
    expect(facade.max.y).toBeCloseTo(COUNTER_UNDERSIDE_Y, 6);
    expect(facade.min.y - ovenTopY).toBeGreaterThan(0);
    expect(facade.min.y - ovenTopY).toBeLessThanOrEqual(
      FRONT_SHADOW_GAP + MEASURED_TOLERANCE_M,
    );
    // And stands at or forward of the carcass front plane, so it is a front rather than a shelf
    // hidden inside the shell.
    expect(facade.min.z).toBeGreaterThanOrEqual(
      CARCASS_FRONT_Z - MEASURED_TOLERANCE_M,
    );
  });

  it("leaves the oven untouched: no cabinetry mesh reaches into the appliance's own space above it", () => {
    const body = builtBody();
    const ovenBox = ovenBoxOf(body);
    const facade = theFacadeOf(body);
    expect(facade.intersectsBox(ovenBox)).toBe(false);
  });

  it("does not make the body deeper than ADR 0040 declares it", () => {
    const body = builtBody();
    const bodyFrontZ = new THREE.Box3().setFromObject(body).max.z;
    const facade = theFacadeOf(body);

    // The oven's own fascia and bar are still the front-most thing on this cabinet.
    expect(facade.max.z).toBeLessThan(bodyFrontZ);
    // §11 row 19 seats a body `frame.d / 2` off the wall, so this is the space it occupies.
    expect(Math.round((BASE_SEAT_M / 2 + bodyFrontZ) * 1000)).toBe(
      HOB_OVEN_FINISHED_DEPTH_MM,
    );
  });
});
