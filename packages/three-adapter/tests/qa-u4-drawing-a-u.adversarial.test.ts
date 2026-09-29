// M7B wave U4 adversarial QA — drawing a U (ADR 0132 d1–d2; D11–D14; criteria 1, 3, 4, 6 and 7).
//
// The implementer's suites prove each rule on one U (4500 x 3000 x 3600). This file attacks the same
// rules where a single room cannot reach them:
//
// - the adapter identifies right-corner pieces by standing a `DesignPlacement` back up from each
//   record (`alongMm = toMillimetres(frame.x)`), so it is checked against the domain's own `cornerOf`
//   on the original placements — over the engine's whole U range, at both kit depths, and on wall-A
//   X-legs placed at, and a millimetre either side of, `W / 2` for odd and even `W`;
// - the wrappers are checked after repeated syncs, a resize, L ↔ U ↔ straight switches, and a delete
//   and reinsert: no negative scale on any leaf, no nested or stale wrapper, one mount per id;
// - the corner's geometry (row 19 mirrored, no interpenetration, the base return's stone butting the
//   X-leg's) over a sweep that includes B ≠ C both ways and odd widths;
// - picking and the outline on the right X-leg and the base return, over the same sweep;
// - the camera presets at the engine's extreme Us, re-derived independently of `wallCPresetsOf`;
// - the shell's wall C through an arbitrary sequence of rooms, against a freshly built shell.
//
// Every U is the domain's own (`buildUShellDesign`) and every record is `derivePlacementRecords`'.
import {
  buildKitchenLBodyCatalog,
  buildLinearShellDesign,
  buildLShellDesign,
  buildUShellDesign,
  cornerOf,
  derivePlacementRecords,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildKitchenShell, resizeShellToRoom } from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import {
  RIGHT_CORNER_WRAPPER_NAME,
  rightCornerRecordIds,
} from "../src/right-corner-wrapper.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { buildSelectionOutline } from "../src/selection-outline.js";
import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  cameraPresetsForRoom,
  findCameraPresetForRoom,
  KITCHEN_TOP_M,
  type CameraPreset,
} from "../src/stage.js";
import { isLine, isMesh, toMaterials } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";

const OCCURRED_AT = "2026-09-29T12:00:00.000Z";
const SHELL_CABINET_DEPTH_MM = 600;
const DECLARED_KIT_DEPTHS_MM = [600, 700] as const;
/** ADR 0025, row 19's named exception: the corner X-leg seats 20 mm into wall A. */
const X_LEG_SEAT_M = -0.02;
const EXACT_M = 1e-6;
/** A shared face between two touching boxes computes to a sliver of this order, never a volume. */
const NO_VOLUME_M3 = 1e-9;
const WALL_C_PLANE_NAME = "wall_right";
const CORNER_OVERHANG_M = 0.3;
const PHONE = { width: 390, height: 844 };
const MIN_TAP_TARGET_PX = 44;
const TOP_ROW_BOTTOM_M = 2.2;
const TOP_ROW_TOP_M = 2.6;

/** The engine's U range, probed through `buildUShellDesign` in `acceptedU` rather than imported:
 *  `ENGINE_ROOM_LIMITS` is not exported. */
const ENGINE_U = {
  wallAMinMm: 1800,
  wallAMaxMm: 6300,
  sideMinMm: 880,
  sideMaxMm: 6300,
  heightMinMm: 1500,
  heightMaxMm: 3900,
} as const;

const RIGHT_CORNER_IDS = ["right-p25", "right-p26", "right-p9", "right-p21"];
const LEFT_TO_RIGHT_TWIN = [
  ["p25", "right-p25"],
  ["p26", "right-p26"],
  ["p9", "right-p9"],
  ["p21", "right-p21"],
] as const;

beforeAll(() => {
  installHeadlessDocument();
});

interface UDimensions {
  readonly widthMm: number;
  readonly depthMm: number;
  readonly wallCMm: number;
  readonly heightMm: number;
}

function uShell(dimensions: UDimensions): Design {
  return buildUShellDesign({
    room: { shape: "U", ...dimensions },
    occurredAt: OCCURRED_AT,
  });
}

/** Minimum, maximum, B ≠ C both ways at both extremes of wall A, odd lengths everywhere. */
const SWEPT_US: readonly UDimensions[] = [
  { widthMm: 1800, depthMm: 880, wallCMm: 880, heightMm: 1500 },
  { widthMm: 1801, depthMm: 881, wallCMm: 6299, heightMm: 2601 },
  { widthMm: 1801, depthMm: 6299, wallCMm: 881, heightMm: 2601 },
  { widthMm: 3001, depthMm: 1000, wallCMm: 6000, heightMm: 2600 },
  { widthMm: 3001, depthMm: 6000, wallCMm: 1000, heightMm: 2600 },
  { widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
  { widthMm: 6299, depthMm: 6300, wallCMm: 880, heightMm: 3900 },
  { widthMm: 6300, depthMm: 6300, wallCMm: 6300, heightMm: 3900 },
];

function labelOf(dimensions: UDimensions): string {
  const { widthMm, depthMm, wallCMm, heightMm } = dimensions;
  return `U ${String(widthMm)} x ${String(depthMm)} x ${String(wallCMm)} x ${String(heightMm)}`;
}

const anyEngineU = fc.record({
  widthMm: fc.integer({ min: ENGINE_U.wallAMinMm, max: ENGINE_U.wallAMaxMm }),
  depthMm: fc.integer({ min: ENGINE_U.sideMinMm, max: ENGINE_U.sideMaxMm }),
  wallCMm: fc.integer({ min: ENGINE_U.sideMinMm, max: ENGINE_U.sideMaxMm }),
  heightMm: fc.integer({
    min: ENGINE_U.heightMinMm,
    max: ENGINE_U.heightMaxMm,
  }),
});

const CATALOGUE = buildKitchenLBodyCatalog(SHELL_CABINET_DEPTH_MM);

function recordsOf(design: Design): PlacementRecord[] {
  return derivePlacementRecords(design, CATALOGUE);
}

function idsTheDomainCallsRight(design: Design): string[] {
  return design.placements
    .filter(
      (placement) => cornerOf(placement, design.room, CATALOGUE) === "right",
    )
    .map((placement) => placement.id)
    .sort();
}

// ------------------------------------------------------------------------------------------------
// The reconstruction `rightCornerRecordIds` runs agrees with the domain's own `cornerOf`.
// ------------------------------------------------------------------------------------------------

describe("rightCornerRecordIds agrees with cornerOf on the original placements", () => {
  const kits = new Map<number, Kit>(
    DECLARED_KIT_DEPTHS_MM.map((depthMm) => [
      depthMm,
      makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm: depthMm }),
    ]),
  );

  propertyTest.prop([anyEngineU, fc.constantFrom(...DECLARED_KIT_DEPTHS_MM)], {
    numRuns: 150,
  })(
    "over the engine's U range and both kit depths, the right pieces the shell placed and no other",
    (dimensions, kitDepthMm) => {
      const design = uShell(dimensions);
      const kit = required(kits.get(kitDepthMm), "kit");
      const placedRightPieces = design.placements
        .map((placement) => placement.id)
        .filter((id) => RIGHT_CORNER_IDS.includes(id))
        .sort();

      const adapter = [
        ...rightCornerRecordIds({
          kit,
          room: design.room,
          records: recordsOf(design),
        }),
      ].sort();

      expect(adapter).toEqual(idsTheDomainCallsRight(design));
      expect(adapter).toEqual(placedRightPieces);
      expect(adapter).toEqual(
        expect.arrayContaining(["right-p25", "right-p26"]),
      );
    },
  );

  /** A structural X-leg on wall A, placed wherever the case needs it — not a layout the product
   *  writes, but the one input on which the reconstruction's rounding could change the answer. */
  function xLegAt(id: string, alongMm: number): DesignPlacement {
    return {
      id,
      wall: "A",
      alongMm,
      y0Mm: 0,
      body: { buildId: "base-corner-x-900", widthMm: 900, heightMm: 820 },
    };
  }

  it.each([2700, 2701, 3001, 4500, 4501, 6299])(
    "W = %i: X-legs at, and a millimetre either side of, W / 2 read the same side as cornerOf",
    (widthMm) => {
      const shell = uShell({
        widthMm,
        depthMm: 3000,
        wallCMm: 3000,
        heightMm: 2600,
      });
      const middle = widthMm / 2;
      const alongs = [
        Math.floor(middle) - 1,
        Math.floor(middle),
        Math.ceil(middle),
        Math.ceil(middle) + 1,
      ];
      const probes = alongs.map((alongMm, index) =>
        xLegAt(`probe-${String(index)}`, alongMm),
      );
      const design: Design = {
        ...shell,
        placements: [...shell.placements, ...probes],
      };
      const kit = required(kits.get(600), "kit");

      const adapter = rightCornerRecordIds({
        kit,
        room: design.room,
        records: recordsOf(design),
      });

      for (const probe of probes) {
        const domain = cornerOf(probe, design.room, CATALOGUE);
        expect(
          adapter.has(probe.id),
          `along ${String(probe.alongMm)} of ${String(widthMm)}`,
        ).toBe(domain === "right");
      }
      // The discriminating pair: floor(W/2) and ceil(W/2) are one and the same millimetre for an
      // even W, and straddle the midpoint for an odd one.
      expect(adapter.has("probe-1")).toBe(widthMm % 2 === 0);
      expect(adapter.has("probe-2")).toBe(true);
    },
  );

  it("never wraps a body that is not a structural corner, on wall A past W / 2 or on wall C", () => {
    const shell = uShell({
      widthMm: 4500,
      depthMm: 3000,
      wallCMm: 3600,
      heightMm: 2600,
    });
    const ordinary = (
      id: string,
      wall: "A" | "C",
      alongMm: number,
    ): DesignPlacement => ({
      id,
      wall,
      alongMm,
      y0Mm: 0,
      body: { buildId: "base-drawer3-600", widthMm: 600, heightMm: 820 },
    });
    const design: Design = {
      ...shell,
      placements: [
        ...shell.placements,
        ordinary("a-far", "A", 3300),
        ordinary("c-near", "C", 1200),
        ordinary("c-far", "C", 3000),
      ],
    };
    const kit = required(kits.get(600), "kit");

    const adapter = rightCornerRecordIds({
      kit,
      room: design.room,
      records: recordsOf(design),
    });

    expect([...adapter].sort()).toEqual([...RIGHT_CORNER_IDS].sort());
  });

  it("answers the same set from one kit asked before and after another kit of the other depth", () => {
    const design = uShell({
      widthMm: 3001,
      depthMm: 1000,
      wallCMm: 6000,
      heightMm: 2600,
    });
    const records = recordsOf(design);
    const at600 = required(kits.get(600), "kit");
    const at700 = required(kits.get(700), "kit");

    const first = [
      ...rightCornerRecordIds({ kit: at600, room: design.room, records }),
    ];
    const other = [
      ...rightCornerRecordIds({ kit: at700, room: design.room, records }),
    ];
    const again = [
      ...rightCornerRecordIds({ kit: at600, room: design.room, records }),
    ];

    expect(first.sort()).toEqual([...RIGHT_CORNER_IDS].sort());
    expect(other.sort()).toEqual(first);
    expect(again.sort()).toEqual(first);
  });

  it.each([
    ["an L", { shape: "L", widthMm: 1800, depthMm: 3000, heightMm: 2600 }],
    [
      "a right-hand L",
      {
        shape: "L",
        widthMm: 1800,
        depthMm: 3000,
        heightMm: 2600,
        cornerDirection: "right",
      },
    ],
    [
      "a straight room",
      { shape: "linear", widthMm: 1800, depthMm: 3000, heightMm: 2600 },
    ],
  ] as const)(
    "wraps nothing in %s, whatever records it is handed",
    (_name, room) => {
      const design = uShell({
        widthMm: 1800,
        depthMm: 3000,
        wallCMm: 3000,
        heightMm: 2600,
      });
      const kit = required(kits.get(600), "kit");

      expect(
        rightCornerRecordIds({ kit, room, records: recordsOf(design) }).size,
      ).toBe(0);
    },
  );
});

// ------------------------------------------------------------------------------------------------
// The mounted scene's invariants hold through every lifecycle step.
// ------------------------------------------------------------------------------------------------

interface Stage {
  readonly kit: Kit;
  readonly shell: THREE.Group;
  readonly solidsRoot: THREE.Group;
}

function stageFor(room: DesignRoom): Stage {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  const shell = buildKitchenShell(kit, room);
  const solidsRoot = new THREE.Group();
  solidsRoot.add(shell);
  return { kit, shell, solidsRoot };
}

function showDesign(stage: Stage, design: Design): readonly PlacementRecord[] {
  const records = recordsOf(design);
  resizeShellToRoom({ kit: stage.kit, shell: stage.shell, room: design.room });
  syncSolidBodies({
    kit: stage.kit,
    solidsRoot: stage.solidsRoot,
    records,
    room: design.room,
  });
  stage.solidsRoot.updateMatrixWorld(true);
  return records;
}

function mountedBodies(stage: Stage): THREE.Object3D[] {
  return stage.solidsRoot.children.filter(
    (child) => child.userData["placementId"] !== undefined,
  );
}

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

// ------------------------------------------------------------------------------------------------
// Criterion 1: the right corner's anchors, swept.
// ------------------------------------------------------------------------------------------------

interface MountedU {
  readonly design: Design;
  readonly stage: Stage;
}

function mountU(dimensions: UDimensions): MountedU {
  const design = uShell(dimensions);
  const stage = stageFor(design.room);
  showDesign(stage, design);
  return { design, stage };
}

function mountedById(scene: MountedU, id: string): THREE.Object3D {
  return required(
    mountedBodies(scene.stage).find(
      (body) => body.userData["placementId"] === id,
    ),
    `mounted ${id}`,
  );
}

function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function namedMeshBox(object: THREE.Object3D, name: string): THREE.Box3 {
  const found = required(
    object.getObjectByName(name),
    `${object.name}'s ${name}`,
  );
  return worldBox(found);
}

function volumeOf(box: THREE.Box3): number {
  if (box.isEmpty()) return 0;
  const size = box.getSize(new THREE.Vector3());
  return size.x * size.y * size.z;
}

describe.each(
  SWEPT_US.map((dimensions) => [labelOf(dimensions), dimensions] as const),
)("%s: the right corner's anchors (criterion 1)", (_label, dimensions) => {
  const scene = mountU(dimensions);
  const widthM = dimensions.widthMm / 1000;

  it("seats the right X-leg at −0.020 and its far edge on wall C's plane, like its left twin at 0", () => {
    const left = worldBox(mountedById(scene, "p25"));
    const right = worldBox(mountedById(scene, "right-p25"));

    expect(right.min.z).toBeCloseTo(X_LEG_SEAT_M, 6);
    expect(widthM - right.max.x).toBeCloseTo(left.min.x, 6);
  });

  // ADR 0132 d2: the right corner is sized as the left corner of the L room (W, C), so its twin is
  // the left corner of a U whose wall B is as long as this U's wall C — not this U's own left corner
  // when B ≠ C.
  const twinScene = mountU({ ...dimensions, depthMm: dimensions.wallCMm });

  it.each(LEFT_TO_RIGHT_TWIN)(
    "draws %s's twin %s as its mirror image in x = W / 2",
    (leftId, rightId) => {
      const placed = scene.design.placements.some((p) => p.id === rightId);
      expect(twinScene.design.placements.some((p) => p.id === leftId)).toBe(
        placed,
      );
      if (!placed) return;
      const left = worldBox(mountedById(twinScene, leftId));
      const right = worldBox(mountedById(scene, rightId));

      expect(right.min.x).toBeCloseTo(widthM - left.max.x, 6);
      expect(right.max.x).toBeCloseTo(widthM - left.min.x, 6);
      expect(right.min.y).toBeCloseTo(left.min.y, 6);
      expect(right.max.y).toBeCloseTo(left.max.y, 6);
      expect(right.min.z).toBeCloseTo(left.min.z, 6);
      expect(right.max.z).toBeCloseTo(left.max.z, 6);
    },
  );

  it("lets no two bodies' meshes share a volume", () => {
    const meshes: {
      readonly id: string;
      readonly name: string;
      readonly box: THREE.Box3;
    }[] = [];
    for (const body of mountedBodies(scene.stage)) {
      const id = String(body.userData["placementId"]);
      body.traverse((node) => {
        if (isMesh(node) && node.visible)
          meshes.push({ id, name: node.name, box: worldBox(node) });
      });
    }

    const shared: string[] = [];
    meshes.forEach((a, index) => {
      for (const b of meshes.slice(index + 1)) {
        if (a.id === b.id) continue;
        if (volumeOf(a.box.clone().intersect(b.box)) > NO_VOLUME_M3) {
          shared.push(`${a.id}.${a.name} × ${b.id}.${b.name}`);
        }
      }
    });

    expect(shared).toEqual([]);
  });

  it("butts the base return's worktop against the X-leg's at the A∩C corner, as the left corner does", () => {
    const gapOf = (xLegId: string, returnId: string) => {
      const xLeg = namedMeshBox(mountedById(scene, xLegId), "countertop");
      const ret = namedMeshBox(mountedById(scene, returnId), "countertop");
      return {
        overlap: volumeOf(xLeg.clone().intersect(ret)),
        zGap: ret.min.z - xLeg.max.z,
        sameTop: ret.max.y - xLeg.max.y,
      };
    };

    const left = gapOf("p25", "p26");
    const right = gapOf("right-p25", "right-p26");
    expect(left.overlap).toBeLessThanOrEqual(NO_VOLUME_M3);

    expect(right.overlap).toBeLessThanOrEqual(NO_VOLUME_M3);
    expect(right.zGap).toBeCloseTo(left.zGap, 6);
    expect(right.zGap).toBeGreaterThanOrEqual(-EXACT_M);
    expect(right.sameTop).toBeCloseTo(left.sameTop, 6);
  });
});

// ------------------------------------------------------------------------------------------------
// Criterion 3: picking and the outline on the right X-leg and the base return, swept.
// ------------------------------------------------------------------------------------------------

function clickAlong(
  scene: MountedU,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): string | undefined {
  const raycaster = createPickingRaycaster();
  raycaster.set(origin, direction.clone().normalize());
  return pick(raycaster, scene.stage.solidsRoot, new THREE.Group())?.id;
}

function centreOf(box: THREE.Box3): THREE.Vector3 {
  return box.getCenter(new THREE.Vector3());
}

describe.each(
  SWEPT_US.map((dimensions) => [labelOf(dimensions), dimensions] as const),
)(
  "%s: picking and the outline on the right corner (criterion 3)",
  (_label, dimensions) => {
    const scene = mountU(dimensions);

    /** Above the worktop and below the wall row's 1.5 m, so the click is the base row's to answer. */
    const ABOVE_THE_WORKTOP_M = 1.2;

    it("selects the right X-leg from above its worktop, over the part the return does not cover", () => {
      const worktop = namedMeshBox(
        mountedById(scene, "right-p25"),
        "countertop",
      );
      const returnTop = namedMeshBox(
        mountedById(scene, "right-p26"),
        "countertop",
      );
      const aim = new THREE.Vector3(
        centreOf(worktop).x,
        ABOVE_THE_WORKTOP_M,
        (worktop.min.z + returnTop.min.z) / 2,
      );

      expect(clickAlong(scene, aim, new THREE.Vector3(0, -1, 0))).toBe(
        "right-p25",
      );
    });

    it("selects the right base return from above its worktop", () => {
      const aim = centreOf(
        namedMeshBox(mountedById(scene, "right-p26"), "countertop"),
      ).setY(ABOVE_THE_WORKTOP_M);

      expect(clickAlong(scene, aim, new THREE.Vector3(0, -1, 0))).toBe(
        "right-p26",
      );
    });

    it("selects the right base return from the room side, never its wall or its X-leg", () => {
      const box = worldBox(mountedById(scene, "right-p26"));
      const aim = new THREE.Vector3(box.min.x - 1, 0.4, centreOf(box).z);

      expect(clickAlong(scene, aim, new THREE.Vector3(1, 0, 0))).toBe(
        "right-p26",
      );
    });

    it.each(["right-p25", "right-p26"])(
      "outlines %s around its own extent, DoubleSide on the line only",
      (id) => {
        const stageRoot = new THREE.Group();
        stageRoot.add(scene.stage.solidsRoot);
        const target = mountedById(scene, id);

        const outline = buildSelectionOutline({
          target,
          parent: stageRoot,
          kind: "placement",
        });
        stageRoot.add(outline.group);
        stageRoot.updateMatrixWorld(true);
        const hull = worldBox(outline.visibleLine);
        const body = worldBox(target);

        expect(hull.containsBox(body.clone().expandByScalar(-EXACT_M))).toBe(
          true,
        );
        expect(hull.min.distanceTo(body.min)).toBeLessThan(0.01);
        expect(hull.max.distanceTo(body.max)).toBeLessThan(0.01);
        expect((outline.visibleLine.material as THREE.Material).side).toBe(
          THREE.DoubleSide,
        );
      },
    );
  },
);

// ------------------------------------------------------------------------------------------------
// Criterion 4: the cameras at the engine's extreme Us, re-derived independently.
// ------------------------------------------------------------------------------------------------

function distanceOf(preset: CameraPreset): number {
  return new THREE.Vector3(...preset.position).distanceTo(
    new THREE.Vector3(...preset.target),
  );
}

function reflectedInWallC(
  point: readonly [number, number, number],
  widthM: number,
): number[] {
  return [widthM - point[0], point[1], point[2]];
}

function projectedRow(
  preset: CameraPreset,
  at: { readonly x: number; readonly z: number },
): { readonly x: number; readonly topY: number; readonly bottomY: number } {
  const camera = new THREE.PerspectiveCamera(
    CAMERA_FIELD_OF_VIEW_DEGREES,
    PHONE.width / PHONE.height,
    0.01,
    500,
  );
  camera.position.set(...preset.position);
  camera.lookAt(new THREE.Vector3(...preset.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const pixelsAt = (heightM: number) => {
    const ndc = new THREE.Vector3(at.x, heightM, at.z).project(camera);
    return {
      x: ((ndc.x + 1) / 2) * PHONE.width,
      y: ((1 - ndc.y) / 2) * PHONE.height,
    };
  };
  const bottom = pixelsAt(TOP_ROW_BOTTOM_M);
  return { x: bottom.x, topY: pixelsAt(TOP_ROW_TOP_M).y, bottomY: bottom.y };
}

describe("the U's presets hold at every extreme the engine accepts (D13)", () => {
  const cases = SWEPT_US.map(
    (dimensions) => [labelOf(dimensions), uShell(dimensions).room] as const,
  );

  it.each(cases)(
    "%s: offers overview, wallA, wallB, wallC, in that order",
    (_label, room) => {
      expect(cameraPresetsForRoom(room).map((preset) => preset.id)).toEqual([
        "overview",
        "wallA",
        "wallB",
        "wallC",
      ]);
    },
  );

  it.each(cases)(
    "%s: wallC is the L (W, C)'s wallB reflected in x = W / 2",
    (_label, room) => {
      const widthM = room.widthMm / 1000;
      const standIn: DesignRoom = {
        shape: "L",
        widthMm: room.widthMm,
        depthMm: required(room.wallCMm, "wallCMm"),
        heightMm: room.heightMm,
      };
      const wallBOfStandIn = findCameraPresetForRoom("wallB", standIn);
      const wallC = findCameraPresetForRoom("wallC", room);

      const expectedPosition = reflectedInWallC(
        wallBOfStandIn.position,
        widthM,
      );
      const expectedTarget = reflectedInWallC(wallBOfStandIn.target, widthM);
      wallC.position.forEach((value, axis) => {
        expect(value).toBeCloseTo(required(expectedPosition[axis], "axis"), 9);
      });
      wallC.target.forEach((value, axis) => {
        expect(value).toBeCloseTo(required(expectedTarget[axis], "axis"), 9);
      });
    },
  );

  it.each(cases)(
    "%s: wallA and wallB read neither C nor the shape",
    (_label, room) => {
      const asL: DesignRoom = {
        shape: "L",
        widthMm: room.widthMm,
        depthMm: room.depthMm,
        heightMm: room.heightMm,
      };

      for (const id of ["wallA", "wallB"] as const) {
        expect(findCameraPresetForRoom(id, room)).toEqual(
          findCameraPresetForRoom(id, asL),
        );
      }
    },
  );

  it.each(cases)(
    "%s: every preset stands the same fixed distance back, with finite coordinates",
    (_label, room) => {
      const presets = cameraPresetsForRoom(room);
      const reference = distanceOf(required(presets[0], "overview"));

      for (const preset of presets) {
        expect(
          [...preset.position, ...preset.target].every(Number.isFinite),
          preset.id,
        ).toBe(true);
        expect(distanceOf(preset), preset.id).toBeCloseTo(reference, 9);
      }
    },
  );

  it.each(cases)(
    "%s: the overview looks at the middle of the floor, max(B, C) deep",
    (_label, room) => {
      const target = findCameraPresetForRoom("overview", room).target;
      const farthestSideM =
        Math.max(room.depthMm, required(room.wallCMm, "wallCMm")) / 1000;

      expect(target[0]).toBeCloseTo(room.widthMm / 2000, 9);
      expect(target[1]).toBeCloseTo(KITCHEN_TOP_M / 2, 9);
      expect(target[2]).toBeCloseTo(farthestSideM / 2, 9);
    },
  );

  propertyTest.prop([anyEngineU], { numRuns: 200 })(
    "wallC puts the middle of wall C's top row on screen, tap-sized, for any engine U",
    (dimensions) => {
      const room = uShell(dimensions).room;
      const row = projectedRow(findCameraPresetForRoom("wallC", room), {
        x: room.widthMm / 1000,
        z: required(room.wallCMm, "wallCMm") / 2000,
      });

      expect(row.x).toBeGreaterThanOrEqual(0);
      expect(row.x).toBeLessThanOrEqual(PHONE.width);
      expect(row.topY).toBeGreaterThanOrEqual(0);
      expect(row.bottomY).toBeLessThanOrEqual(PHONE.height);
      expect(row.bottomY - row.topY).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    },
  );
});

// ------------------------------------------------------------------------------------------------
// Criterion 6: wall C and the floor through any sequence of rooms equal a freshly built shell.
// ------------------------------------------------------------------------------------------------

/** The geometry's own extent, rounded to a micrometre: what a resize rebuilds, whatever the
 *  constructor was. */
function geometryExtentOf(geometry: THREE.BufferGeometry): string {
  geometry.computeBoundingBox();
  const box = required(geometry.boundingBox, "a bounding box");
  return [...box.min.toArray(), ...box.max.toArray()]
    .map((value) => value.toFixed(6))
    .join(",");
}

interface ShellChildState {
  readonly name: string;
  readonly visible: boolean;
  readonly position: readonly number[];
  readonly parameters: string;
}

function visibleShellState(shell: THREE.Group): ShellChildState[] {
  return shell.children
    .filter((child) => child.visible)
    .map((child) => ({
      name: child.name,
      visible: child.visible,
      position: child.position
        .toArray()
        .map((value) => Number(value.toFixed(9))),
      parameters: isMesh(child) ? geometryExtentOf(child.geometry) : "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe("the shell after any sequence of rooms is the shell built fresh for the last (criterion 6)", () => {
  const anyShellRoom: fc.Arbitrary<DesignRoom> = fc.oneof(
    anyEngineU.map((dimensions) => uShell(dimensions).room),
    fc
      .record({
        shape: fc.constantFrom("L" as const, "linear" as const),
        widthMm: fc.integer({ min: 2000, max: 6000 }),
        depthMm: fc.integer({ min: 1000, max: 6000 }),
        heightMm: fc.integer({ min: 2200, max: 3900 }),
      })
      .map((room): DesignRoom => room),
  );

  propertyTest.prop([fc.array(anyShellRoom, { minLength: 1, maxLength: 6 })], {
    numRuns: 60,
  })(
    "visible children, their geometry and their positions match; wall C is at most one mesh",
    (rooms) => {
      const kit = makeKit({ createCanvas: createHeadlessCanvas });
      const shell = buildKitchenShell(kit, required(rooms[0], "first room"));
      for (const room of rooms.slice(1))
        resizeShellToRoom({ kit, shell, room });
      const last = required(rooms.at(-1), "last room");

      const fresh = buildKitchenShell(kit, last);

      expect(visibleShellState(shell)).toEqual(visibleShellState(fresh));
      expect(
        shell.children.filter((c) => c.name === WALL_C_PLANE_NAME).length,
      ).toBeLessThanOrEqual(1);
    },
  );

  it("spans wall C's plane from one overhang behind the A∩C corner to C at the minimum and maximum U", () => {
    for (const dimensions of [SWEPT_US[0], SWEPT_US.at(-1)]) {
      const room = uShell(required(dimensions, "a U")).room;
      const kit = makeKit({ createCanvas: createHeadlessCanvas });
      const shell = buildKitchenShell(kit, room);
      const plane = required(
        shell.getObjectByName(WALL_C_PLANE_NAME),
        "wall C",
      );

      const box = worldBox(plane);

      expect(box.min.x).toBeCloseTo(room.widthMm / 1000, 6);
      expect(box.max.x).toBeCloseTo(room.widthMm / 1000, 6);
      expect(box.min.z).toBeCloseTo(-CORNER_OVERHANG_M, 6);
      expect(box.max.z).toBeCloseTo(
        required(room.wallCMm, "wallCMm") / 1000,
        6,
      );
      expect(box.max.y).toBeCloseTo(room.heightMm / 1000, 6);
    }
  });
});
