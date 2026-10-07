// M7C wave C3 slice S1: three facts about the reference L's generated top row once mounted — every top
// cabinet's bars are built and hidden, the wall cabinets beneath keep theirs visible, and each top cabinet
// stands 400 mm tall from 2200, on the wall plane, at its wall cabinet's start. What a customer sees beyond
// that (door leaves, door planes, neighbours, corner units, depth changes, every shape) is pinned by
// `qa-c3s1-top-row-mounted.adversarial.test.ts`.
import {
  buildKitchenLBodyCatalog,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  type BodyProbeFactory,
  type Design,
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
import { meshesOf, productKitAt } from "./support/wall-unit.js";

const OCCURRED_AT = "2026-10-02T10:00:00.000Z";
const CABINET_DEPTH_MM = 600;
const ROOM: DesignRoom = {
  shape: "L",
  widthMm: 4100,
  depthMm: 3300,
  heightMm: 2600,
};
const TOP_ROW_FLOOR_MM = 2200;
const WALL_ROW_FLOOR_MM = 1500;

beforeAll(() => {
  installHeadlessDocument();
});

/** The probe the product measures a body with, so every placement carries the seat the scene draws it at. */
function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
    const room = kit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}

function generatedDesign(): Design {
  const result = generateKitchen({
    room: ROOM,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
  });
  if (!result.ok) throw new Error("the reference L did not compose");
  return result.design;
}

function mount(design: Design): Map<string, THREE.Object3D> {
  const root = new THREE.Group();
  syncSolidBodies({
    kit: productKitAt(CABINET_DEPTH_MM),
    solidsRoot: root,
    records: derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(CABINET_DEPTH_MM),
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

function handleBarsOf(body: THREE.Object3D): THREE.Mesh[] {
  return meshesOf(body).filter((mesh) => mesh.name === "handle_bar");
}

describe("a generated kitchen's top row, mounted", () => {
  const design = generatedDesign();
  const mounted = mount(design);
  const generated = design.placements.filter((placement) =>
    placement.id.startsWith("n"),
  );

  it("builds the bars on every top cabinet and hides every one of them", () => {
    const tops = generated.filter(
      (placement) => placement.y0Mm === TOP_ROW_FLOOR_MM,
    );

    expect(tops.length).toBeGreaterThan(0);
    for (const top of tops) {
      const bars = handleBarsOf(mounted.get(top.id) ?? new THREE.Group());
      expect(bars.length, top.id).toBeGreaterThan(0);
      expect(
        bars.every((bar) => !bar.visible),
        top.id,
      ).toBe(true);
    }
  });

  it("leaves the bars drawn on the wall cabinets beneath", () => {
    const uppers = generated.filter(
      (placement) =>
        placement.y0Mm === WALL_ROW_FLOOR_MM &&
        placement.body.buildId === "wall-cabinet",
    );

    expect(uppers.length).toBeGreaterThan(0);
    for (const upper of uppers) {
      const bars = handleBarsOf(mounted.get(upper.id) ?? new THREE.Group());
      expect(bars.length, upper.id).toBeGreaterThan(0);
      expect(
        bars.every((bar) => bar.visible),
        upper.id,
      ).toBe(true);
    }
  });

  it("seats each top cabinet 400 mm tall from 2200, over the wall cabinet's own span", () => {
    for (const top of generated.filter(
      (placement) => placement.y0Mm === TOP_ROW_FLOOR_MM,
    )) {
      const box = new THREE.Box3().setFromObject(
        mounted.get(top.id) ?? new THREE.Group(),
      );

      const startMm = top.alongMm - top.body.widthMm / 2;
      // Wall A runs along x with its plane at z = 0; wall B runs along z with its plane at x = 0.
      const alongMin = top.wall === "A" ? box.min.x : box.min.z;
      const planeMin = top.wall === "A" ? box.min.z : box.min.x;

      expect(box.min.y).toBeCloseTo(TOP_ROW_FLOOR_MM / 1000, 3);
      expect(box.max.y - box.min.y).toBeCloseTo(0.4, 3);
      expect(planeMin).toBeCloseTo(0, 3);
      expect(alongMin).toBeCloseTo(startMm / 1000, 3);
    }
  });
});
