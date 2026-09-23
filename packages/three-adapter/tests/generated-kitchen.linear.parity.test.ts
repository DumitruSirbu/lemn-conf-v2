// ADR 0130 (wave 7J S3, criterion A11): a generated straight kitchen against the real adapter, the
// same measurement `generated-kitchen.parity.test.ts` runs for the L — every real back face on wall
// A's declared plane, no two body shells sharing more than a face. There is no wall B to check: a
// straight design places nothing there (D4).
import {
  buildKitchenLBodyCatalog,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  type BodyProbeFactory,
  type Design,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import {
  createBodyProbe,
  readWallPlaneM,
  WALL_A_MESH_NAME,
} from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-24T12:00:00.000Z";
const SHARED_FACE_TOLERANCE_M = 0.0005;
const WALL_PLANE_EPSILON_M = 1e-6;
const SHELL_MESH_NAME =
  /^(carcass_shell|carcass|side_left|side_right|plinth|fridge_body|hood_canopy)$/;

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

function generated(room: Design["room"]): Design {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
  });
  if (!result.ok) throw new Error(`sample room refused: ${result.reason.code}`);
  return result.design;
}

interface RenderedDesign {
  readonly kit: Kit;
  readonly wallAPlaneM: number;
  readonly solids: THREE.Group;
  readonly design: Design;
}

function render(design: Design): RenderedDesign {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  // The reference builder's own room, read only for the wall plane's constant coordinate (z = 0) —
  // not for its size, which a straight design does not draw from here at all.
  const referenceRoom = kit.builders["kitchen-l"]();
  const solids = new THREE.Group();
  const records = derivePlacementRecords(design, buildKitchenLBodyCatalog(600));
  syncSolidBodies({ kit, solidsRoot: solids, records, room: design.room });
  solids.updateWorldMatrix(true, true);
  const wallAPlaneM = readWallPlaneM(referenceRoom, WALL_A_MESH_NAME);
  disposeKit(kit, referenceRoom);
  return { kit, wallAPlaneM, solids, design };
}

function placementBodies(rendered: RenderedDesign) {
  return rendered.solids.children.flatMap((body) => {
    const placementId = body.userData["placementId"] as string | undefined;
    if (!placementId) return [];
    const placement = rendered.design.placements.find(
      (candidate) => candidate.id === placementId,
    );
    if (!placement)
      throw new Error(`rendered unknown placement ${placementId}`);
    return [{ body, placement }];
  });
}

function shellBoxes(rendered: RenderedDesign) {
  return placementBodies(rendered).flatMap(({ body, placement }) => {
    const box = new THREE.Box3();
    body.traverse((node) => {
      if (node instanceof THREE.Mesh && SHELL_MESH_NAME.test(node.name)) {
        box.union(new THREE.Box3().setFromObject(node));
      }
    });
    return box.isEmpty() ? [] : [{ id: placement.id, box }];
  });
}

const SAMPLE_ROOMS: readonly Design["room"][] = [
  // The owner's own 3700 mm kitchen (ADR 0130's G7 witness).
  { shape: "linear", widthMm: 3700, depthMm: 3400, heightMm: 2600 },
  { shape: "linear", widthMm: 1200, depthMm: 3400, heightMm: 2200 },
  { shape: "linear", widthMm: 6000, depthMm: 3400, heightMm: 3900 },
];

describe("a generated straight kitchen against the real Three adapter", () => {
  it.each(SAMPLE_ROOMS)(
    "places every real back face on wall A's declared plane, nothing on wall B, in %o",
    (room) => {
      const rendered = render(generated(room));
      try {
        expect(
          placementBodies(rendered).every(
            ({ placement }) => placement.wall === "A",
          ),
        ).toBe(true);
        const errors = placementBodies(rendered).flatMap(
          ({ body, placement }) => {
            const box = new THREE.Box3().setFromObject(body);
            const back = box.min.z;
            // The hood stands proud of the wall, exactly as the L's own suite expects it to
            // (`generated-kitchen.parity.test.ts`) — its canopy is not a flush back face.
            const expected =
              placement.body.buildId === "hood"
                ? rendered.wallAPlaneM + 0.1
                : rendered.wallAPlaneM;
            return Math.abs(back - expected) <= WALL_PLANE_EPSILON_M
              ? []
              : [
                  `${placement.body.buildId}:${String(back)} != ${String(expected)}`,
                ];
          },
        );
        expect(errors).toEqual([]);
      } finally {
        disposeKit(rendered.kit, rendered.solids);
      }
    },
  );

  it.each(SAMPLE_ROOMS)(
    "has only shared faces between real body shells in %o",
    (room) => {
      const rendered = render(generated(room));
      try {
        const boxes = shellBoxes(rendered);
        const intersections: string[] = [];
        for (let left = 0; left < boxes.length; left += 1) {
          for (let right = left + 1; right < boxes.length; right += 1) {
            const a = boxes[left];
            const b = boxes[right];
            if (!a || !b) continue;
            const overlap = (["x", "y", "z"] as const).map(
              (axis) =>
                Math.min(a.box.max[axis], b.box.max[axis]) -
                Math.max(a.box.min[axis], b.box.min[axis]),
            );
            if (overlap.every((extent) => extent > SHARED_FACE_TOLERANCE_M)) {
              intersections.push(`${a.id}/${b.id}`);
            }
          }
        }
        expect(boxes.length).toBeGreaterThan(2);
        expect(intersections).toEqual([]);
      } finally {
        disposeKit(rendered.kit, rendered.solids);
      }
    },
  );
});
