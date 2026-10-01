import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  declaredCabinetDepthsMm,
  derivePlacementRecords,
  generateKitchen,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
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
  WALL_B_MESH_NAME,
} from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { assertGeneratedOnTwoWalls } from "./support/assert-generated-on-two-walls.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
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

function atDeepestDepth(design: Design): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: realProbeFactory(),
    cabinetDepthMm: Math.max(...declaredCabinetDepthsMm()),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok)
    throw new Error(`depth change refused: ${result.reason.code}`);
  return result.design;
}

interface RenderedDesign {
  readonly kit: Kit;
  readonly room: THREE.Group;
  readonly solids: THREE.Group;
  readonly design: Design;
}

function render(design: Design): RenderedDesign {
  const cabinetDepthMm = cabinetDepthMmOf(design);
  const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
  const room = kit.builders["kitchen-l"]();
  const solids = new THREE.Group();
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMm),
  );
  syncSolidBodies({ kit, solidsRoot: solids, records, room: design.room });
  solids.updateWorldMatrix(true, true);
  return { kit, room, solids, design };
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

interface MeasuredBox {
  readonly id: string;
  readonly box: THREE.Box3;
}

function worktopBoxes(rendered: RenderedDesign): MeasuredBox[] {
  const boxes: MeasuredBox[] = [];
  for (const { body, placement } of placementBodies(rendered)) {
    let index = 0;
    body.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.name.startsWith("countertop"))
        return;
      boxes.push({
        id: `${placement.id}/${node.name}#${String(index)}`,
        box: new THREE.Box3().setFromObject(node),
      });
      index += 1;
    });
  }
  return boxes;
}

function intersectingBoxes(boxes: readonly MeasuredBox[]): string[] {
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
  return intersections;
}

const SAMPLE_ROOMS: readonly Design["room"][] = [
  KITCHEN_L_DESIGN.room,
  { shape: "L", widthMm: 1500, depthMm: 2802, heightMm: 2200 },
  // The pre-7A3 approved corner, kept on purpose: a storable room the adapter must draw (M7 7A3).
  { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 2599 },
  // The approved corner since M7 7A3, and a room the policy admits only since then: wall B wider.
  { shape: "L", widthMm: 6000, depthMm: 6000, heightMm: 2599 },
  { shape: "L", widthMm: 2400, depthMm: 6000, heightMm: 2599 },
];

const WORKTOP_SAMPLE_ROOMS: readonly Design["room"][] = [
  KITCHEN_L_DESIGN.room,
  { shape: "L", widthMm: 2700, depthMm: 1700, heightMm: 2599 },
];

describe("generated kitchens against the real Three adapter", () => {
  it.each(SAMPLE_ROOMS)(
    "seats every real back face on its declared wall in %o",
    (room) => {
      const rendered = render(generated(room));
      try {
        const wallPlanes = {
          A: readWallPlaneM(rendered.room, WALL_A_MESH_NAME),
          B: readWallPlaneM(rendered.room, WALL_B_MESH_NAME),
        } as const;
        const errors = placementBodies(rendered).flatMap(
          ({ body, placement }) => {
            assertGeneratedOnTwoWalls(placement.wall);
            const box = new THREE.Box3().setFromObject(body);
            const back = placement.wall === "A" ? box.min.z : box.min.x;
            const expected =
              placement.body.buildId === "base-corner-x-900"
                ? wallPlanes[placement.wall] - 0.02
                : placement.body.buildId === "hood"
                  ? wallPlanes[placement.wall] + 0.1
                  : wallPlanes[placement.wall];
            return Math.abs(back - expected) <= WALL_PLANE_EPSILON_M
              ? []
              : [
                  `${placement.body.buildId}:${String(back)} != ${String(expected)}`,
                ];
          },
        );
        expect(errors).toEqual([]);
      } finally {
        disposeKit(rendered.kit, rendered.room);
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
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it.each(WORKTOP_SAMPLE_ROOMS)(
    "has only shared faces between generated worktops at 600 mm in %o",
    (room) => {
      const rendered = render(generated(room));
      try {
        const worktops = worktopBoxes(rendered);
        expect(worktops.length).toBeGreaterThanOrEqual(5);
        expect(
          new Set(worktops.map(({ id }) => id.split("/")[0])).size,
        ).toBeGreaterThan(2);
        expect(intersectingBoxes(worktops)).toEqual([]);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it.each(WORKTOP_SAMPLE_ROOMS)(
    "has only shared faces between generated worktops at 700 mm in %o",
    (room) => {
      const rendered = render(atDeepestDepth(generated(room)));
      try {
        const worktops = worktopBoxes(rendered);
        expect(worktops.length).toBeGreaterThanOrEqual(5);
        expect(intersectingBoxes(worktops)).toEqual([]);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it("detects a worktop box moved into another generated slab", () => {
    const rendered = render(generated(KITCHEN_L_DESIGN.room));
    try {
      const worktops = worktopBoxes(rendered);
      const first = worktops[0];
      const second = worktops[1];
      if (!first || !second) throw new Error("generated too few worktops");
      expect(intersectingBoxes(worktops)).toEqual([]);
      const overlapped = worktops.map((entry, index) =>
        index === 1 ? { ...entry, box: first.box.clone() } : entry,
      );
      expect(intersectingBoxes(overlapped)).toContain(
        `${first.id}/${second.id}`,
      );
    } finally {
      disposeKit(rendered.kit, rendered.room);
    }
  });
});
