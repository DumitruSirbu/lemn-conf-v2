// M12 wave W3a, adversarial QA on real geometry (ADR 0183 decision 4; DEVELOPMENT-SPEC §11 row 19; product invariants:
// back face on the wall plane, fixed-size elements). A generated cabinet over the freestanding fridge at the 600 setting
// is built by the real probe and the real Three builders 700 mm deep to the millimetre, its back face on the wall plane,
// never past the fridge's own 742; every other body of the kitchen is the depth it had; and a stored design that records
// the earlier 600 over the fridge mounts and renders at the 600 it records, unrefused (ADR 0167).
import {
  buildKitchenLBodyCatalog,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  type BodyProbeFactory,
  type Design,
  type DesignPlacement,
  type DesignRoom,
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
const HALF_A_MILLIMETRE_M = 0.0005;
const OVER_THE_FRIDGE_M = 0.7;
const THE_MACHINES_OWN_DEPTH_M = 0.742;
const WALL_FRONT_ASSEMBLY_MM = 39;
const CEILING_MM = 2600;

const ROOMS: readonly DesignRoom[] = [
  { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: CEILING_MM },
  { shape: "L", widthMm: 6000, depthMm: 5000, heightMm: CEILING_MM },
  { shape: "linear", widthMm: 4200, depthMm: 3400, heightMm: CEILING_MM },
  {
    shape: "U",
    widthMm: 4000,
    depthMm: 3000,
    wallCMm: 2800,
    heightMm: CEILING_MM,
  },
  {
    shape: "U",
    widthMm: 3200,
    depthMm: 2600,
    wallCMm: 4200,
    heightMm: CEILING_MM,
  },
] as DesignRoom[];

const REFERENCE_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 4100,
  depthMm: 3300,
  heightMm: CEILING_MM,
};

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

function mounted(design: Design): ReadonlyMap<string, THREE.Object3D> {
  const cabinetDepthMm = design.settings?.cabinetDepthMm ?? 600;
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
      child,
    ]),
  );
}

/** The whole body, door fronts included: the finished depth (the carcass shell is 39 mm shallower than the door line). */
function wholeBox(body: THREE.Object3D | undefined): THREE.Box3 {
  if (!body) throw new Error("no mounted body");
  return new THREE.Box3().setFromObject(body);
}

function depthM(box: THREE.Box3, wall: DesignPlacement["wall"]): number {
  return wall === "A" ? box.max.z - box.min.z : box.max.x - box.min.x;
}

function backM(box: THREE.Box3, wall: DesignPlacement["wall"]): number {
  return wall === "A" ? box.min.z : wall === "B" ? box.min.x : box.max.x;
}

function overTheFridgeOf(design: Design): {
  readonly cabinet: DesignPlacement;
  readonly fridge: DesignPlacement;
} {
  const fridge = design.placements.find(
    ({ body }) => body.buildId === "fridge-free",
  );
  if (!fridge) throw new Error("no freestanding fridge");
  const cabinet = design.placements.find(
    ({ wall, body, y0Mm, alongMm }) =>
      wall === fridge.wall &&
      body.buildId === "wall-cabinet" &&
      y0Mm >= fridge.body.heightMm &&
      alongMm === fridge.alongMm,
  );
  if (!cabinet) throw new Error("no cabinet over the fridge");
  return { cabinet, fridge };
}

describe("a generated cabinet over the fridge at the 600 setting, on real geometry", () => {
  it("is 700 mm deep to the millimetre, on the wall plane of the fridge, and never deeper than the machine", () => {
    let reached = 0;
    for (const room of ROOMS) {
      const result = generateKitchen({
        room,
        occurredAt: OCCURRED_AT,
        probeAt: realProbeFactory(),
        newKitchenSettings: { cabinetDepthMm: 600 },
      });
      if (!result.ok) continue;
      const label = JSON.stringify(room);
      const { cabinet, fridge } = overTheFridgeOf(result.design);
      const bodies = mounted(result.design);
      const cabinetWhole = wholeBox(bodies.get(cabinet.id));
      const fridgeBox = new THREE.Box3().setFromObject(
        bodies.get(fridge.id) ?? new THREE.Group(),
      );

      expect(
        Math.abs(depthM(cabinetWhole, cabinet.wall) - OVER_THE_FRIDGE_M),
        label,
      ).toBeLessThanOrEqual(HALF_A_MILLIMETRE_M);
      expect(depthM(cabinetWhole, cabinet.wall), label).toBeLessThan(
        THE_MACHINES_OWN_DEPTH_M,
      );
      expect(
        Math.abs(
          backM(cabinetWhole, cabinet.wall) - backM(fridgeBox, fridge.wall),
        ),
        label,
      ).toBeLessThanOrEqual(HALF_A_MILLIMETRE_M);
      reached += 1;
    }
    expect(reached).toBe(ROOMS.length);
  });

  it("leaves every other wall cabinet at the depth the capped and lifted arms give, not 700", () => {
    const result = generateKitchen({
      room: REFERENCE_ROOM,
      occurredAt: OCCURRED_AT,
      probeAt: realProbeFactory(),
      newKitchenSettings: { cabinetDepthMm: 600 },
    });
    if (!result.ok) throw new Error("not generated");
    const { cabinet } = overTheFridgeOf(result.design);
    const bodies = mounted(result.design);

    const others = result.design.placements.filter(
      ({ id, body, y0Mm }) =>
        id !== cabinet.id && body.buildId === "wall-cabinet" && y0Mm >= 1500,
    );
    expect(others.length).toBeGreaterThan(0);
    for (const other of others) {
      const depth = depthM(wholeBox(bodies.get(other.id)), other.wall);
      expect(depth, other.id).toBeLessThanOrEqual(0.6 + HALF_A_MILLIMETRE_M);
    }
  });
});

describe("a stored design that recorded 600 over the fridge (W3a-6, ADR 0167)", () => {
  it("mounts without a refusal and is drawn at the 600 it records", () => {
    const result = generateKitchen({
      room: REFERENCE_ROOM,
      occurredAt: OCCURRED_AT,
      probeAt: realProbeFactory(),
      newKitchenSettings: { cabinetDepthMm: 600 },
    });
    if (!result.ok) throw new Error("not generated");
    const { cabinet } = overTheFridgeOf(result.design);
    const stored: Design = {
      ...result.design,
      placements: result.design.placements.map((placement) =>
        placement.id === cabinet.id
          ? {
              ...placement,
              body: {
                ...placement.body,
                seatDepthMm: 600 - WALL_FRONT_ASSEMBLY_MM,
              },
            }
          : placement,
      ),
    };

    const bodies = mounted(stored);

    expect(
      Math.abs(depthM(wholeBox(bodies.get(cabinet.id)), cabinet.wall) - 0.6),
    ).toBeLessThanOrEqual(HALF_A_MILLIMETRE_M);
  });
});
