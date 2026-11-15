// **M12 wave W3b adversarial QA: the seeded cabinet over the fridge, `p24`, against the fridge it hangs on and against the
// render it departs from (ADR 0183 decision 4; product invariants: alignment, non-intersection, fixed-size elements).**
//
// `m12-w3b-seeded-cabinet-over-the-fridge.test.ts` measures `p24`'s own back face and depth. What it leaves open, and what
// the decomposition parity gate's declared departure sets aside (`alongWallPositionIgnored`), is where `p24` stands
// *relative to* the fridge and the cabinets beside it, and whether the one coordinate the departure ignores, its place along
// the wall, is asserted anywhere. It is asserted here, against the machine under it and against `buildKitchen()`'s own twin.
import {
  buildKitchenLBodyCatalog,
  createBodyProbeLease,
  derivePlacementRecords,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
  type BodyProbeFactory,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import { makeKit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { productKitAt } from "./support/wall-unit.js";

const OCCURRED_AT = "2026-11-15T09:00:00.000Z";
const SETTINGS_MM = [600, 700] as const;
const ONE_MICROMETRE_M = 1e-6;
const HALF_A_MILLIMETRE_M = 0.0005;

const FRIDGE_ID = "p7";
const OVER_THE_FRIDGE_ID = "p24";
const NEXT_TO_IT_ID = "p23";
/** The machine's own finished depth and the owner's number, written out: the fridge is a fixed-size element and the
 *  cabinet over it stops 42 mm short of its door front (M12 plan W3b-3, Q3-4). */
const FRIDGE_DEPTH_M = 0.742;
const OVER_THE_FRIDGE_DEPTH_M = 0.7;
const FRONT_SETBACK_M = 0.042;
/** The seeded fridge's top, §11 row 19's neighbour fact: the cabinet stands on it. */
const FRIDGE_TOP_M = 1.85;

beforeAll(() => {
  installHeadlessDocument();
});

function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
    const room = kit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}

function seededAt(cabinetDepthMm: number): Design {
  if (cabinetDepthMm === 600) return KITCHEN_L_DESIGN;
  const changed = setCabinetDepth({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: realProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!changed.ok) throw new Error("the depth change was refused");
  return changed.design;
}

function boxesAt(cabinetDepthMm: number): ReadonlyMap<string, THREE.Box3> {
  const design = seededAt(cabinetDepthMm);
  const root = new THREE.Group();
  syncSolidBodies({
    kit: productKitAt(cabinetDepthMm),
    solidsRoot: root,
    records: derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMm),
    ),
    room: design.room,
  });
  root.updateMatrixWorld(true);
  return new Map(
    root.children.map((child) => [
      String(child.userData["placementId"]),
      new THREE.Box3().setFromObject(child),
    ]),
  );
}

function boxOf(boxes: ReadonlyMap<string, THREE.Box3>, id: string): THREE.Box3 {
  const box = boxes.get(id);
  if (!box) throw new Error(`no mounted body ${id}`);
  return box;
}

/** Wall B is rotated a quarter turn: its depth is the room's x and its run is the room's z. */
function depthM(box: THREE.Box3): number {
  return box.max.x - box.min.x;
}

describe("the seeded cabinet over the fridge, beside the fridge (alignment, fixed size, non-intersection)", () => {
  it.each(SETTINGS_MM)(
    "stands on the fridge's top and is centred on the fridge along the wall at the %i mm setting",
    (cabinetDepthMm) => {
      const boxes = boxesAt(cabinetDepthMm);
      const fridge = boxOf(boxes, FRIDGE_ID);
      const over = boxOf(boxes, OVER_THE_FRIDGE_ID);

      expect(Math.abs(over.min.y - FRIDGE_TOP_M)).toBeLessThanOrEqual(
        ONE_MICROMETRE_M,
      );
      expect(Math.abs(fridge.max.y - over.min.y)).toBeLessThanOrEqual(
        HALF_A_MILLIMETRE_M,
      );
      const overCentre = over.getCenter(new THREE.Vector3()).z;
      const fridgeCentre = fridge.getCenter(new THREE.Vector3()).z;
      expect(Math.abs(overCentre - fridgeCentre)).toBeLessThanOrEqual(
        ONE_MICROMETRE_M,
      );
      expect(over.max.z - over.min.z).toBeCloseTo(
        fridge.max.z - fridge.min.z,
        4,
      );
    },
  );

  it.each(SETTINGS_MM)(
    "leaves the fridge a fixed 0.742 m machine and stops 42 mm short of its door front at the %i mm setting",
    (cabinetDepthMm) => {
      const boxes = boxesAt(cabinetDepthMm);
      const fridge = boxOf(boxes, FRIDGE_ID);
      const over = boxOf(boxes, OVER_THE_FRIDGE_ID);

      expect(Math.abs(depthM(fridge) - FRIDGE_DEPTH_M)).toBeLessThanOrEqual(
        HALF_A_MILLIMETRE_M,
      );
      expect(
        Math.abs(depthM(over) - OVER_THE_FRIDGE_DEPTH_M),
      ).toBeLessThanOrEqual(HALF_A_MILLIMETRE_M);
      expect(
        Math.abs(fridge.max.x - over.max.x - FRONT_SETBACK_M),
      ).toBeLessThanOrEqual(HALF_A_MILLIMETRE_M);
    },
  );

  it.each(SETTINGS_MM)(
    "does not intersect the fridge or the cabinet beside it at the %i mm setting",
    (cabinetDepthMm) => {
      const boxes = boxesAt(cabinetDepthMm);
      const over = boxOf(boxes, OVER_THE_FRIDGE_ID);
      const overlap = (other: THREE.Box3, axis: "y" | "z") =>
        Math.min(over.max[axis], other.max[axis]) -
        Math.max(over.min[axis], other.min[axis]);

      // Vertically: the fridge ends where the cabinet starts. Along the wall: the neighbour ends where it starts.
      expect(overlap(boxOf(boxes, FRIDGE_ID), "y")).toBeLessThanOrEqual(
        HALF_A_MILLIMETRE_M,
      );
      expect(overlap(boxOf(boxes, NEXT_TO_IT_ID), "z")).toBeLessThanOrEqual(
        HALF_A_MILLIMETRE_M,
      );
    },
  );
});

describe("the seeded cabinet over the fridge, against the render the parity gate departs from", () => {
  // The decomposition parity gate compares `p24` with `buildKitchen()` at depth 700 and sets its along-wall place aside
  // (`alongWallPositionIgnored`), and its claim check reads the *placement's* data, not the mounted body. This is the
  // assertion that the mounted body's height and place along the wall are exactly where `buildKitchen()` at 600 puts its
  // twin, and that only the depth moved: 0.600 -> 0.700 (a back face on the wall plane keeps the box growing outwards).
  const OLD_TWIN_DEPTH_M = 0.6;

  function twinInTheDefaultRender(): THREE.Object3D {
    const room = productKitAt(600).builders["kitchen-l"]();
    room.updateMatrixWorld(true);
    const twins = room.children.filter(
      (child) =>
        child.name === "wall_cabinet" &&
        Math.abs(child.position.y - FRIDGE_TOP_M) <= ONE_MICROMETRE_M,
    );
    expect(twins, "wall cabinets standing at the fridge's top").toHaveLength(1);
    const [twin] = twins;
    if (!twin) throw new Error("no twin");
    return twin;
  }

  it("is at the same height and the same place along the wall as the 600 render's twin, and 0.1 m deeper", () => {
    const twin = twinInTheDefaultRender();
    const twinBox = new THREE.Box3().setFromObject(twin);
    const over = boxOf(boxesAt(600), OVER_THE_FRIDGE_ID);

    expect(Math.abs(over.min.y - twinBox.min.y)).toBeLessThanOrEqual(
      ONE_MICROMETRE_M,
    );
    expect(Math.abs(over.max.y - twinBox.max.y)).toBeLessThanOrEqual(
      ONE_MICROMETRE_M,
    );
    expect(Math.abs(over.min.z - twinBox.min.z)).toBeLessThanOrEqual(
      ONE_MICROMETRE_M,
    );
    expect(Math.abs(over.max.z - twinBox.max.z)).toBeLessThanOrEqual(
      ONE_MICROMETRE_M,
    );
    // The departure is real, so the comparison above is not one between identical bodies.
    expect(Math.abs(depthM(twinBox) - OLD_TWIN_DEPTH_M)).toBeLessThanOrEqual(
      HALF_A_MILLIMETRE_M,
    );
    expect(Math.abs(depthM(over) - depthM(twinBox) - 0.1)).toBeLessThanOrEqual(
      HALF_A_MILLIMETRE_M,
    );
  });

  it("changes nothing of the 700 kitchen's cabinet over the fridge between the two settings but its place along the wall", () => {
    const at600 = boxOf(boxesAt(600), OVER_THE_FRIDGE_ID);
    const at700 = boxOf(boxesAt(700), OVER_THE_FRIDGE_ID);

    expect(at600.min.y).toBeCloseTo(at700.min.y, 9);
    expect(at600.max.y).toBeCloseTo(at700.max.y, 9);
    expect(depthM(at600)).toBeCloseTo(depthM(at700), 9);
    // ADR 0089: wall B's chain slides at the corner between the settings, a place and not a size.
    expect(at600.max.z - at600.min.z).toBeCloseTo(at700.max.z - at700.min.z, 9);
  });
});
