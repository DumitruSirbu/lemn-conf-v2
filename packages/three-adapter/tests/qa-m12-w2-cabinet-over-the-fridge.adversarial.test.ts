// M12 wave W2 (ADR 0183 decisions 1-2), adversarial, against the REAL probe and the real Three builders.
//
// The domain suites run the generator with the fake probe, which reports back the depth it is handed. The cabinet that
// generation now hangs over every placed freestanding fridge is a body the real probe has never been asked to seat at
// 651-749 mm tall (ceilings 2501-2599), so what the domain asserts about it is asserted again here on what Three
// builds: that the real probe still places it, that its back face is on the wall, that it stands over the fridge and
// not in it, and that it meets no other body's shell.
//
// Depth: W2 builds it at the cabinet-depth setting (the lifted arm); W3a (ADR 0183 decision 4) changes that to 700 over
// a fridge. The depth assertion below names the setting and is the one line W3a is expected to move.
import {
  buildKitchenLBodyCatalog,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  type BodyProbeFactory,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type GenerateKitchenResult,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { productKitAt } from "./support/wall-unit.js";

const OCCURRED_AT = "2026-11-15T09:00:00.000Z";
const MM = 0.001;

/** The owner's number (ADR 0183 decision 4), in metres: what a cabinet over the freestanding fridge is built to. */
const OVER_THE_FRIDGE_DEPTH_M = 0.7;
const ONE_MM_M = 1 * MM;
const SHARED_FACE_TOLERANCE_M = 0.0005;
const OPENING_TOP_MM = 2600;
const FRIDGE_STEP_ID = "fridge";
const OVER_BODY_STEP_ID = "over-body:fridge";
const SHELL_MESH_NAME =
  /^(carcass_shell|carcass|side_left|side_right|plinth|fridge_body|hood_canopy)$/;
const CEILINGS_MM = [2501, 2550, 2599, 2600, 2800] as const;
const DEPTHS_MM = [600, 700] as const;

const ROOMS: readonly Omit<DesignRoom, "heightMm">[] = [
  { shape: "L", widthMm: 4100, depthMm: 3300 },
  { shape: "L", widthMm: 6000, depthMm: 5000 },
  { shape: "L", widthMm: 3200, depthMm: 2200 },
  { shape: "linear", widthMm: 4200, depthMm: 3400 },
  { shape: "linear", widthMm: 2800, depthMm: 3400 },
  { shape: "U", widthMm: 4000, depthMm: 3000, wallCMm: 2800 },
  { shape: "U", widthMm: 5600, depthMm: 5000, wallCMm: 5000 },
  { shape: "U", widthMm: 3200, depthMm: 2600, wallCMm: 4200 },
] as DesignRoom[];

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

function generate(room: DesignRoom, cabinetDepthMm: number) {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
    newKitchenSettings: { cabinetDepthMm },
  });
}

type Generated = Extract<GenerateKitchenResult, { ok: true }>;

function placementOfStep(result: Generated, stepId: string): DesignPlacement {
  const step = result.log.steps.find(({ id }) => id === stepId);
  if (step?.status !== "placed") throw new Error(`${stepId} was not placed`);
  const found = result.design.placements.find(
    ({ id }) => id === step.placementId,
  );
  if (!found) throw new Error(`${stepId} has no placement`);
  return found;
}

interface Mounted {
  readonly kit: Kit;
  readonly bodies: ReadonlyMap<string, THREE.Object3D>;
}

function mount(design: Design, cabinetDepthMm: number): Mounted {
  const kit = productKitAt(cabinetDepthMm);
  const root = new THREE.Group();
  syncSolidBodies({
    kit,
    solidsRoot: root,
    records: derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMm),
    ),
    room: design.room,
  });
  root.updateMatrixWorld(true);
  return {
    kit,
    bodies: new Map(
      root.children.map((child) => [
        String(child.userData["placementId"]),
        child,
      ]),
    ),
  };
}

function wholeBox(body: THREE.Object3D | undefined): THREE.Box3 {
  if (!body) throw new Error("no mounted body");
  return new THREE.Box3().setFromObject(body);
}

function shellBox(body: THREE.Object3D | undefined): THREE.Box3 {
  if (!body) throw new Error("no mounted body");
  const box = new THREE.Box3();
  body.traverse((node) => {
    if (node instanceof THREE.Mesh && SHELL_MESH_NAME.test(node.name)) {
      box.union(new THREE.Box3().setFromObject(node));
    }
  });
  return box;
}

/** The wall's front normal axis and which face of a box is the back: A's normal is +z, B's +x, C's -x. */
function backFaceOf(box: THREE.Box3, wall: DesignPlacement["wall"]): number {
  return wall === "A" ? box.min.z : wall === "B" ? box.min.x : box.max.x;
}

function depthOf(box: THREE.Box3, wall: DesignPlacement["wall"]): number {
  return wall === "A" ? box.max.z - box.min.z : box.max.x - box.min.x;
}

function alongOf(box: THREE.Box3, wall: DesignPlacement["wall"]): number {
  return wall === "A"
    ? (box.min.x + box.max.x) / 2
    : (box.min.z + box.max.z) / 2;
}

function overlapsM(left: THREE.Box3, right: THREE.Box3): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      Math.min(left.max[axis], right.max[axis]) -
        Math.max(left.min[axis], right.min[axis]) >
      SHARED_FACE_TOLERANCE_M,
  );
}

describe("the real probe seats the cabinet over every placed fridge, and Three builds it above the fridge, not in it", () => {
  let reached = 0;
  const shapesReached = new Set<string>();
  const wallsReached = new Set<string>();

  for (const cabinetDepthMm of DEPTHS_MM) {
    for (const heightMm of CEILINGS_MM) {
      it(`at ${String(heightMm)} mm and depth ${String(cabinetDepthMm)}: placed, tall as the opening, on the wall, clear of every shell`, () => {
        for (const base of ROOMS) {
          const room = { ...base, heightMm } as DesignRoom;
          const label = JSON.stringify(room);
          const result = generate(room, cabinetDepthMm);
          if (!result.ok) continue;
          const fridgeStep = result.log.steps.find(
            ({ id }) => id === FRIDGE_STEP_ID,
          );
          if (fridgeStep?.status !== "placed") continue;

          // The real probe agrees with the fake one: placed at every ceiling from 2501.
          const overStep = result.log.steps.find(
            ({ id }) => id === OVER_BODY_STEP_ID,
          );
          expect(overStep?.status, label).toBe("placed");
          const fridge = placementOfStep(result, FRIDGE_STEP_ID);
          const cabinet = placementOfStep(result, OVER_BODY_STEP_ID);
          expect(cabinet.body.heightMm, label).toBe(
            Math.min(heightMm, OPENING_TOP_MM) - cabinet.y0Mm,
          );

          const mounted = mount(result.design, cabinetDepthMm);
          const fridgeBox = wholeBox(mounted.bodies.get(fridge.id));
          const cabinetBox = wholeBox(mounted.bodies.get(cabinet.id));
          const cabinetShell = shellBox(mounted.bodies.get(cabinet.id));

          // Above the fridge, as built: the whole fridge model (its trim included) ends where the cabinet's shell
          // begins, and the cabinet's top is the ceiling or the module grid's last level.
          expect(cabinetShell.min.y, label).toBeGreaterThanOrEqual(
            fridgeBox.max.y - SHARED_FACE_TOLERANCE_M,
          );
          expect(cabinetBox.min.y, label).toBeCloseTo(cabinet.y0Mm * MM, 3);
          expect(cabinetBox.max.y, label).toBeLessThanOrEqual(
            Math.min(heightMm, OPENING_TOP_MM) * MM + ONE_MM_M,
          );

          // On the wall plane of the fridge's wall, and centred on the fridge.
          expect(
            Math.abs(
              backFaceOf(cabinetBox, cabinet.wall) -
                backFaceOf(fridgeBox, fridge.wall),
            ),
            label,
          ).toBeLessThanOrEqual(1e-6);
          expect(
            Math.abs(
              alongOf(cabinetBox, cabinet.wall) -
                alongOf(fridgeBox, fridge.wall),
            ),
            label,
          ).toBeLessThanOrEqual(ONE_MM_M);

          // The deepest declared depth at every setting, since W3a (ADR 0183 decision 4): the owner's 700, never the
          // setting's, and never deeper than the fridge's own 742. Its back face is on the wall plane (asserted above), so
          // the extra depth grows into the room and not into the wall.
          expect(depthOf(cabinetBox, cabinet.wall), label).toBeLessThanOrEqual(
            0.742 + ONE_MM_M,
          );
          expect(depthOf(cabinetBox, cabinet.wall), label).toBeCloseTo(
            OVER_THE_FRIDGE_DEPTH_M,
            2,
          );

          // Only shared faces between the cabinet's shell and every other body's shell.
          const crossings = [...mounted.bodies]
            .filter(([id]) => id !== cabinet.id)
            .filter(([, body]) => {
              const other = shellBox(body);
              return !other.isEmpty() && overlapsM(cabinetShell, other);
            })
            .map(([id]) => id);
          expect(crossings, label).toEqual([]);

          reached += 1;
          shapesReached.add(room.shape);
          wallsReached.add(`${room.shape}:${cabinet.wall}`);
        }
      });
    }
  }

  it("reached every shape and a floor of rooms, so the sweep above is not vacuous", () => {
    expect([...shapesReached].sort()).toEqual(["L", "U", "linear"]);
    expect(reached).toBe(ROOMS.length * CEILINGS_MM.length * DEPTHS_MM.length);
    expect([...wallsReached].sort()).toEqual(["L:B", "U:B", "U:C", "linear:A"]);
  });
});
