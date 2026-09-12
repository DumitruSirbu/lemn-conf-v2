// Independent real-probe QA for M7 wave 7D2. It covers boundary/low-ceiling rooms and the 600 →
// 700 mm depth transition, then measures actual Three meshes for the bought elements.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  declaredCabinetDepthsMm,
  derivePlacementRecords,
  findOverflowingPlacementIds,
  generateKitchen,
  KITCHEN_L_DESIGN,
  setCabinetDepth,
  validateDesignForCatalog,
  type BodyProbeFactory,
  type Design,
  type DesignPlacement,
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
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";
const SHARED_FACE_TOLERANCE_M = 0.0005;
const WALL_PLANE_EPSILON_M = 1e-6;
const DIMENSION_EPSILON_M = 1e-6;
const SHELL_MESH_NAME =
  /^(carcass_shell|carcass|side_left|side_right|plinth|fridge_body|hood_canopy)$/;

const ROOMS = [
  { shape: "L", widthMm: 900, depthMm: 2200, heightMm: 2200 },
  { shape: "L", widthMm: 900, depthMm: 2300, heightMm: 2599 },
  { shape: "L", widthMm: 2100, depthMm: 1600, heightMm: 2200 },
  { shape: "L", widthMm: 2700, depthMm: 1700, heightMm: 2599 },
  { shape: "L", widthMm: 3561, depthMm: 2921, heightMm: 2599 },
  KITCHEN_L_DESIGN.room,
  { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 3900 },
] satisfies readonly Design["room"][];

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
  const deepest = Math.max(...declaredCabinetDepthsMm());
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: realProbeFactory(),
    cabinetDepthMm: deepest,
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

function placementInterval(placement: DesignPlacement) {
  return {
    startMm: placement.alongMm - placement.body.widthMm / 2,
    endMm: placement.alongMm + placement.body.widthMm / 2,
  };
}

function assertDomainParity(design: Design): void {
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  expect(validateDesignForCatalog(design, catalog)).toEqual([]);
  expect(findOverflowingPlacementIds(design)).toEqual([]);
  expect(
    design.placements.every(
      (placement) =>
        placement.y0Mm + placement.body.heightMm <= design.room.heightMm,
    ),
  ).toBe(true);

  const composedBases = design.placements.filter(
    (placement) => placement.id.startsWith("n") && placement.y0Mm === 0,
  );
  const uppers = design.placements.filter(
    (placement) => placement.id.startsWith("n") && placement.y0Mm === 1500,
  );
  for (const base of composedBases) {
    const above = uppers.filter(
      (upper) =>
        upper.wall === base.wall &&
        upper.alongMm === base.alongMm &&
        upper.body.widthMm === base.body.widthMm,
    );
    if (base.body.buildId === "fridge-free") {
      expect(above, "nothing is composed above the fridge").toEqual([]);
    } else {
      expect(above, `one upper matches ${base.id}`).toHaveLength(1);
      expect(above[0]?.body.buildId).toBe(
        base.body.buildId === "base-hob-oven" ? "hood" : "wall-cabinet",
      );
    }
  }
  expect(
    uppers.filter(
      (upper) => upper.wall === "A" && placementInterval(upper).startMm < 900,
    ),
  ).toEqual([]);
  expect(
    design.placements.filter(
      (placement) => placement.id.startsWith("n") && placement.y0Mm >= 2200,
    ),
  ).toEqual([]);
}

function assertWallSeatsAndIntersections(rendered: RenderedDesign): void {
  const wallPlanes = {
    A: readWallPlaneM(rendered.room, WALL_A_MESH_NAME),
    B: readWallPlaneM(rendered.room, WALL_B_MESH_NAME),
  } as const;
  const seatErrors = placementBodies(rendered).flatMap(
    ({ body, placement }) => {
      const box = new THREE.Box3().setFromObject(body);
      const back = placement.wall === "A" ? box.min.z : box.min.x;
      const expected =
        placement.body.buildId === "base-corner-x-900"
          ? wallPlanes[placement.wall] - 0.02
          : placement.body.buildId === "hood"
            ? wallPlanes[placement.wall] +
              rendered.kit.depths.cabinetDepthM -
              rendered.kit.depths.hoodDepthM
            : wallPlanes[placement.wall];
      return Math.abs(back - expected) <= WALL_PLANE_EPSILON_M
        ? []
        : [`${placement.body.buildId}:${String(back)} != ${String(expected)}`];
    },
  );
  expect(seatErrors).toEqual([]);

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
}

function namedMeshAlongWidthM(
  body: THREE.Object3D,
  placement: DesignPlacement,
  meshName: string,
): number {
  const mesh = body.getObjectByName(meshName);
  if (!mesh) throw new Error(`${placement.body.buildId} has no ${meshName}`);
  const size = new THREE.Box3()
    .setFromObject(mesh)
    .getSize(new THREE.Vector3());
  return placement.wall === "A" ? size.x : size.z;
}

describe("7D2 generated kitchens against the real Three adapter", () => {
  it.each(ROOMS)(
    "has zero findings, exact upper relationships, wall seats, and no shell intersections in %o",
    (room) => {
      const design = generated(room);
      assertDomainParity(design);
      const rendered = render(design);
      try {
        assertWallSeatsAndIntersections(rendered);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it.each([
    { shape: "L", widthMm: 900, depthMm: 2300, heightMm: 2200 },
    { shape: "L", widthMm: 3561, depthMm: 2921, heightMm: 2599 },
    { shape: "L", widthMm: 6300, depthMm: 5100, heightMm: 3900 },
  ] satisfies readonly Design["room"][])(
    "preserves parity after the 600 to 700 mm cabinet-depth transition in %o",
    (room) => {
      const deep = atDeepestDepth(generated(room));
      expect(cabinetDepthMmOf(deep)).toBe(700);
      assertDomainParity(deep);
      const rendered = render(deep);
      try {
        assertWallSeatsAndIntersections(rendered);
      } finally {
        disposeKit(rendered.kit, rendered.room);
      }
    },
  );

  it("keeps the real fridge, sink, hob, oven, and hood at their bought widths", () => {
    const rendered = render(generated(KITCHEN_L_DESIGN.room));
    try {
      const checks = [
        ["fridge-free", "fridge_body", 0.7],
        ["base-sink", "bowl_floor", 0.56],
        ["base-hob-oven", "cooktop_glass", 0.59],
        ["base-hob-oven", "oven_front", 0.596],
        ["hood", "hood_canopy", 0.6],
      ] as const;
      for (const [buildId, meshName, expectedM] of checks) {
        const renderedBody = placementBodies(rendered).find(
          ({ placement }) => placement.body.buildId === buildId,
        );
        expect(renderedBody, `${buildId} is present`).toBeDefined();
        if (!renderedBody) continue;
        expect(
          namedMeshAlongWidthM(
            renderedBody.body,
            renderedBody.placement,
            meshName,
          ),
        ).toBeCloseTo(expectedM, Math.abs(Math.log10(DIMENSION_EPSILON_M)));
      }
    } finally {
      disposeKit(rendered.kit, rendered.room);
    }
  });
});
