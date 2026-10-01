// M7B wave U4 adversarial QA — the mounted scene of a U through every lifecycle step (ADR 0132 d1–d2;
// D11; criteria 1 and 7).
//
// After each step — five identical syncs, a resize, U ↔ L ↔ straight switches, a delete and
// reinsert, and any sequence of Us and Ls — the scene draws the design: no negative scale on any
// leaf, no nested or stale wrapper, one mount per id, wall C visible only in a U.
import {
  buildLShellDesign,
  buildLinearShellDesign,
  type Design,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { RIGHT_CORNER_WRAPPER_NAME } from "../src/right-corner-wrapper.js";
import { isLine, isMesh, toMaterials } from "../src/three-guards.js";
import { installHeadlessDocument } from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import {
  anyEngineU,
  idsTheDomainCallsRight,
  mountedBodies,
  OCCURRED_AT,
  recordsOf,
  showDesign,
  stageFor,
  uShell,
  type Stage,
  type UDimensions,
} from "./support/u-scene.js";

const WALL_C_PLANE_NAME = "wall_right";

beforeAll(() => {
  installHeadlessDocument();
});

function isLeaf(node: THREE.Object3D): boolean {
  return isMesh(node) || isLine(node) || node instanceof THREE.Points;
}

/** The domain's `cornerOf` answers "right" for a structural piece on wall C whatever the shape, but
 *  only a U has a right corner to draw: in an L or a straight room nothing is mirrored (ADR 0132 d2,
 *  `rightCornerRecordIds`' own contract). */
function rightPiecesDrawnMirrored(design: Design): string[] {
  return design.room.shape === "U" ? idsTheDomainCallsRight(design) : [];
}

/** Everything the 3D contract for a U says about the mounted scene, checked in one pass so every
 *  lifecycle step is held to all of it. */
function expectSceneDrawsTheDesign(stage: Stage, design: Design): void {
  const records = recordsOf(design);
  const bodies = mountedBodies(stage);
  const rightIds = new Set(rightPiecesDrawnMirrored(design));

  const mountedIds = bodies
    .map((body) => String(body.userData["placementId"]))
    .sort();
  expect(mountedIds).toEqual(records.map((record) => record.id).sort());

  for (const body of bodies) {
    const id = String(body.userData["placementId"]);
    const isRight = rightIds.has(id);
    expect(body.name === RIGHT_CORNER_WRAPPER_NAME, `${id} wrapped`).toBe(
      isRight,
    );
    expect(body.matrixWorld.determinant() < 0, `${id} determinant`).toBe(
      isRight,
    );
    expect(body.scale.toArray(), `${id} scale`).toEqual(
      isRight ? [-1, 1, 1] : [1, 1, 1],
    );
    if (isRight) {
      expect(body.children, `${id} wrapper children`).toHaveLength(1);
      const inner = required(body.children[0], `${id} body`);
      expect(inner.name, `${id} nested wrapper`).not.toBe(
        RIGHT_CORNER_WRAPPER_NAME,
      );
      expect(inner.scale.toArray(), `${id} inner scale`).toEqual([1, 1, 1]);
    }
  }

  const offenders: string[] = [];
  let wrapperCount = 0;
  stage.solidsRoot.traverse((node) => {
    if (node.name === RIGHT_CORNER_WRAPPER_NAME) wrapperCount += 1;
    if (
      isLeaf(node) &&
      node.scale.toArray().some((component) => component < 0)
    ) {
      offenders.push(`negative scale on ${node.name}`);
    }
    if (isMesh(node)) {
      for (const material of toMaterials(node.material)) {
        if (material.side === THREE.DoubleSide)
          offenders.push(`DoubleSide on ${node.name}`);
      }
    }
  });
  expect(offenders).toEqual([]);
  expect(wrapperCount).toBe(rightIds.size);

  const wallCPlanes = stage.shell.children.filter(
    (child) => child.name === WALL_C_PLANE_NAME,
  );
  expect(wallCPlanes.length).toBeLessThanOrEqual(1);
  expect(wallCPlanes.some((plane) => plane.visible)).toBe(
    design.room.shape === "U",
  );
}

describe("the scene draws the design after every lifecycle step", () => {
  const U_ROOM: UDimensions = {
    widthMm: 4500,
    depthMm: 3000,
    wallCMm: 3600,
    heightMm: 2600,
  };

  function lShellFor(room: DesignRoom): Design {
    return buildLShellDesign({ room, occurredAt: OCCURRED_AT });
  }

  it("holds after five identical syncs, and keeps each wrapper the same object", () => {
    const design = uShell(U_ROOM);
    const stage = stageFor(design.room);
    showDesign(stage, design);
    const wrappers = mountedBodies(stage).filter(
      (b) => b.name === RIGHT_CORNER_WRAPPER_NAME,
    );

    for (let sync = 0; sync < 5; sync += 1) showDesign(stage, design);

    expectSceneDrawsTheDesign(stage, design);
    for (const wrapper of wrappers)
      expect(stage.solidsRoot.children).toContain(wrapper);
  });

  it("holds after a resize to an odd, B < C room and back", () => {
    const design = uShell(U_ROOM);
    const resized = uShell({
      widthMm: 3001,
      depthMm: 1000,
      wallCMm: 6000,
      heightMm: 2600,
    });
    const stage = stageFor(design.room);

    showDesign(stage, design);
    showDesign(stage, resized);
    expectSceneDrawsTheDesign(stage, resized);

    showDesign(stage, design);
    expectSceneDrawsTheDesign(stage, design);
  });

  it("holds through U → L → straight → U → L, leaving no wrapper and no visible wall C outside a U", () => {
    const u = uShell(U_ROOM);
    const l = lShellFor({
      shape: "L",
      widthMm: 4500,
      depthMm: 3000,
      heightMm: 2600,
    });
    const straight = buildLinearShellDesign({
      room: { shape: "linear", widthMm: 4500, depthMm: 3000, heightMm: 2600 },
      occurredAt: OCCURRED_AT,
    });
    const stage = stageFor(u.room);

    for (const design of [u, l, straight, u, l]) {
      showDesign(stage, design);
      expectSceneDrawsTheDesign(stage, design);
    }
  });

  it("holds when a right-corner piece is deleted and reinserted", () => {
    const design = uShell(U_ROOM);
    const withoutReturn: Design = {
      ...design,
      placements: design.placements.filter((p) => p.id !== "right-p26"),
    };
    const stage = stageFor(design.room);

    showDesign(stage, design);
    showDesign(stage, withoutReturn);
    expectSceneDrawsTheDesign(stage, withoutReturn);

    showDesign(stage, design);
    expectSceneDrawsTheDesign(stage, design);
  });

  it("holds when the same ids stand in an L room, which has no right corner", () => {
    const design = uShell(U_ROOM);
    const asL: Design = {
      ...design,
      room: { shape: "L", widthMm: 4500, depthMm: 3000, heightMm: 2600 },
    };
    const stage = stageFor(design.room);

    showDesign(stage, design);
    showDesign(stage, asL);

    expect(rightPiecesDrawnMirrored(asL)).toEqual([]);
    expectSceneDrawsTheDesign(stage, asL);
  });

  const anyRoomOfAnyShape = fc.oneof(
    anyEngineU.map((dimensions) => uShell(dimensions)),
    fc
      .record({
        widthMm: fc.integer({ min: 2000, max: 6000 }),
        depthMm: fc.integer({ min: 1000, max: 6000 }),
      })
      .map(({ widthMm, depthMm }) =>
        lShellFor({ shape: "L", widthMm, depthMm, heightMm: 2600 }),
      ),
  );

  propertyTest.prop(
    [fc.array(anyRoomOfAnyShape, { minLength: 2, maxLength: 5 })],
    {
      numRuns: 25,
    },
  )("holds after every step of any sequence of Us and Ls", (designs) => {
    const stage = stageFor(required(designs[0], "first").room);

    for (const design of designs) {
      showDesign(stage, design);
      expectSceneDrawsTheDesign(stage, design);
    }
  });
});
