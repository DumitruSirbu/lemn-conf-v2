// M12 wave W3b (ADR 0183 decision 4; DEVELOPMENT-SPEC §11 row 19; product invariants: a back face on the wall plane,
// a fixed-size machine). The seeded kitchen's `p24`, the cabinet over the freestanding fridge, is built by the real
// builders and measured by the real probe: at the 600 setting its back face is on wall B's plane (0.000) and its
// finished depth is 0.700 m, the same as at 700, where nothing changed. The cabinet over the oven tower and over the
// pantry still follow the setting, so the fridge's cabinet is not a sweep that moved every deep top.
import {
  buildKitchenLBodyCatalog,
  createBodyProbeLease,
  derivePlacementRecords,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
  type BodyProbeFactory,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import { makeKit } from "../src/kitchen-parts.js";
import {
  createBodyProbe,
  readWallPlaneM,
  WALL_B_MESH_NAME,
} from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { productKitAt } from "./support/wall-unit.js";

const OCCURRED_AT = "2026-11-15T09:00:00.000Z";
const SETTINGS_MM = [600, 700] as const;
const HALF_A_MILLIMETRE_M = 0.0005;
const ONE_MICROMETRE_M = 1e-6;

/** The owner's number, written as the expectation (ADR 0183 decision 4): what the cabinet over the fridge is built to
 *  at every setting, and the machine's own 742 is not it. */
const OVER_THE_FRIDGE_M = 0.7;
const OVER_THE_FRIDGE_ID = "p24";
const OVER_THE_OVEN_TOWER_ID = "p22";

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

/** The seeded kitchen at a setting, the way the store reaches it: 600 as shipped, 700 by the real depth change. */
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

function recordsOf(design: Design): readonly PlacementRecord[] {
  return derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(design.settings?.cabinetDepthMm ?? 600),
  );
}

function mountedBodies(design: Design): ReadonlyMap<string, THREE.Object3D> {
  const cabinetDepthMm = design.settings?.cabinetDepthMm ?? 600;
  const root = new THREE.Group();
  syncSolidBodies({
    kit: productKitAt(cabinetDepthMm),
    solidsRoot: root,
    records: recordsOf(design),
    room: design.room,
  });
  root.updateMatrixWorld(true);
  return new Map(
    root.children.map((child) => [
      String(child.userData["placementId"]),
      child,
    ]),
  );
}

/** The whole body, door fronts included: wall B is rotated a quarter turn, so its depth is the room's x. */
function boxOf(bodies: ReadonlyMap<string, THREE.Object3D>, id: string) {
  const body = bodies.get(id);
  if (!body) throw new Error(`no mounted body ${id}`);
  return new THREE.Box3().setFromObject(body);
}

/** Wall B's plane as the real room states it, not written as `0`. */
function wallBPlaneM(): number {
  const room = productKitAt(600).builders["kitchen-l"]();
  room.updateMatrixWorld(true);
  return readWallPlaneM(room, WALL_B_MESH_NAME);
}

describe("the seeded cabinet over the fridge, on real geometry (W3b-1)", () => {
  it.each(SETTINGS_MM)(
    "has its back face on wall B's plane and is 0.700 m deep at the %i mm setting",
    (cabinetDepthMm) => {
      const box = boxOf(
        mountedBodies(seededAt(cabinetDepthMm)),
        OVER_THE_FRIDGE_ID,
      );

      expect(Math.abs(box.min.x - wallBPlaneM())).toBeLessThanOrEqual(
        ONE_MICROMETRE_M,
      );
      expect(
        Math.abs(box.max.x - box.min.x - OVER_THE_FRIDGE_M),
      ).toBeLessThanOrEqual(HALF_A_MILLIMETRE_M);
    },
  );

  it("is the wall plane at zero, so the check above is not a relation between two moved numbers", () => {
    expect(wallBPlaneM()).toBeCloseTo(0, 9);
  });

  it("is the same body in the 600 kitchen as in the 700 one, where nothing changed", () => {
    const [at600, at700] = SETTINGS_MM.map((cabinetDepthMm) =>
      boxOf(mountedBodies(seededAt(cabinetDepthMm)), OVER_THE_FRIDGE_ID),
    );

    expect(at600?.max.x).toBeCloseTo(at700?.max.x ?? Number.NaN, 6);
    expect(at600?.max.y).toBeCloseTo(at700?.max.y ?? Number.NaN, 6);
    expect(at600?.min.y).toBeCloseTo(at700?.min.y ?? Number.NaN, 6);
  });

  it("leaves the cabinet over the oven tower on the cabinet-depth line: 0.600 at 600, 0.700 at 700", () => {
    const depths = SETTINGS_MM.map((cabinetDepthMm) => {
      const box = boxOf(
        mountedBodies(seededAt(cabinetDepthMm)),
        OVER_THE_OVEN_TOWER_ID,
      );
      return box.max.x - box.min.x;
    });

    expect(depths[0]).toBeCloseTo(0.6, 3);
    expect(depths[1]).toBeCloseTo(0.7, 3);
  });
});

describe("the real probe measures the seeded cabinet over the fridge at the seat the row declares", () => {
  it.each(SETTINGS_MM)(
    "twice the seat offset is the recorded frame depth at the %i mm setting",
    (cabinetDepthMm) => {
      const design = seededAt(cabinetDepthMm);
      const record = recordsOf(design).find(
        ({ id }) => id === OVER_THE_FRIDGE_ID,
      );
      if (!record) throw new Error("no record for the cabinet over the fridge");
      const kit = productKitAt(cabinetDepthMm);
      const room = kit.builders["kitchen-l"]();

      const measured = createBodyProbe(kit, room).measure({
        buildId: record.buildId,
        widthM: record.frame.w,
        heightM: record.frame.h,
        depthM: OVER_THE_FRIDGE_M,
        seatedOn: "wall-plane",
      });

      expect(
        Math.abs(2 * measured.seatOffsetM - record.frame.d),
      ).toBeLessThanOrEqual(ONE_MICROMETRE_M);
    },
  );
});
