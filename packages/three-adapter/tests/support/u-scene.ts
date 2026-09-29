// What the U4 suites share: the fixed clock and phone every one of them names, the domain's accepted
// U rooms, the records derived for a design, a probe-seated placement, and the headless stage that
// mounts a design's bodies so a test can read the scene back.
//
// Test infrastructure only (`engineering-conventions.md`, *Tests*): nothing here is production code
// and nothing here re-derives a rule — every U is `buildUShellDesign`'s and every record is
// `derivePlacementRecords`'.
import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  buildUShellDesign,
  cornerOf,
  derivePlacementRecords,
  type BodyCatalog,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import * as THREE from "three";

import {
  buildKitchenShell,
  resizeShellToRoom,
} from "../../src/kitchen-shell.js";
import { makeKit, type Kit } from "../../src/kitchen-parts.js";
import { syncSolidBodies } from "../../src/scene-sync.js";
import { createHeadlessCanvas } from "./headless-canvas.js";
import { required } from "./required.js";

export const OCCURRED_AT = "2026-09-29T12:00:00.000Z";

/** The phone the configurator's mobile surface is designed for. */
export const PHONE = { width: 390, height: 844 };

/** The cabinet depth `buildUShellDesign` designs a room at by default. */
export const SHELL_CABINET_DEPTH_MM = 600;

/** `buildUShellDesign`'s own answer for the room, so a bound the engine refuses fails here. */
export function acceptedU(
  widthMm: number,
  depthMm: number,
  wallCMm: number,
  heightMm = 2600,
): DesignRoom {
  return buildUShellDesign({
    room: { shape: "U", widthMm, depthMm, wallCMm, heightMm },
    occurredAt: OCCURRED_AT,
  }).room;
}

const CATALOGUES_BY_DEPTH_MM = new Map<number, BodyCatalog>();

function catalogueAt(cabinetDepthMm: number): BodyCatalog {
  const known = CATALOGUES_BY_DEPTH_MM.get(cabinetDepthMm);
  if (known) return known;
  const built = buildKitchenLBodyCatalog(cabinetDepthMm);
  CATALOGUES_BY_DEPTH_MM.set(cabinetDepthMm, built);
  return built;
}

export function recordsOf(
  design: Design,
  cabinetDepthMm = SHELL_CABINET_DEPTH_MM,
): PlacementRecord[] {
  return derivePlacementRecords(design, catalogueAt(cabinetDepthMm));
}

/** The ids of `design`'s placements the domain's own `cornerOf` calls the right corner's. */
export function idsTheDomainCallsRight(design: Design): string[] {
  const catalogue = catalogueAt(SHELL_CABINET_DEPTH_MM);
  return design.placements
    .filter(
      (placement) => cornerOf(placement, design.room, catalogue) === "right",
    )
    .map((placement) => placement.id)
    .sort();
}

/** A placement of `spec.buildId` that carries the seat depth the body measures when built, so a test
 *  can put it on wall B or C, where the shell places none of its own. The measure is taken on wall A
 *  of a probe L room, and the probe's own body is discarded. */
export function seated(
  kit: Kit,
  spec: {
    readonly id: string;
    readonly wall: DesignWall;
    readonly alongMm: number;
    readonly y0Mm: number;
    readonly buildId: string;
    readonly heightMm: number;
  },
): DesignPlacement {
  const probeRoom: DesignRoom = {
    shape: "L",
    widthMm: 3560,
    depthMm: 2920,
    heightMm: 2600,
  };
  const probe: Design = {
    ...buildLShellDesign({ room: probeRoom, occurredAt: OCCURRED_AT }),
    placements: [
      {
        id: "probe",
        wall: "A",
        alongMm: 1000,
        y0Mm: 0,
        body: { buildId: spec.buildId, widthMm: 600, heightMm: spec.heightMm },
      },
    ],
  };
  const root = new THREE.Group();
  syncSolidBodies({
    kit,
    solidsRoot: root,
    records: recordsOf(probe),
    room: probeRoom,
  });
  const body = required(root.children[0], "the probe body");
  body.position.set(0, 0, 0);
  body.updateWorldMatrix(true, true);
  const rearM = -new THREE.Box3().setFromObject(body).min.z;
  return {
    id: spec.id,
    wall: spec.wall,
    alongMm: spec.alongMm,
    y0Mm: spec.y0Mm,
    body: {
      buildId: spec.buildId,
      widthMm: 600,
      heightMm: spec.heightMm,
      seatDepthMm: Math.round(2 * rearM * 1000),
    },
  };
}

// ------------------------------------------------------------------------------------------------
// The engine's U range, and the Us swept across it.
// ------------------------------------------------------------------------------------------------

export interface UDimensions {
  readonly widthMm: number;
  readonly depthMm: number;
  readonly wallCMm: number;
  readonly heightMm: number;
}

/** The engine's U range, probed through `buildUShellDesign` in `acceptedU` rather than imported:
 *  `ENGINE_ROOM_LIMITS` is not exported. */
export const ENGINE_U = {
  wallAMinMm: 1800,
  wallAMaxMm: 6300,
  sideMinMm: 880,
  sideMaxMm: 6300,
  heightMinMm: 1500,
  heightMaxMm: 3900,
} as const;

export const anyEngineU = fc.record({
  widthMm: fc.integer({ min: ENGINE_U.wallAMinMm, max: ENGINE_U.wallAMaxMm }),
  depthMm: fc.integer({ min: ENGINE_U.sideMinMm, max: ENGINE_U.sideMaxMm }),
  wallCMm: fc.integer({ min: ENGINE_U.sideMinMm, max: ENGINE_U.sideMaxMm }),
  heightMm: fc.integer({
    min: ENGINE_U.heightMinMm,
    max: ENGINE_U.heightMaxMm,
  }),
});

export function uShell(dimensions: UDimensions): Design {
  return buildUShellDesign({
    room: { shape: "U", ...dimensions },
    occurredAt: OCCURRED_AT,
  });
}

/** Minimum, maximum, B ≠ C both ways at both extremes of wall A, odd lengths everywhere. */
export const SWEPT_US: readonly UDimensions[] = [
  { widthMm: 1800, depthMm: 880, wallCMm: 880, heightMm: 1500 },
  { widthMm: 1801, depthMm: 881, wallCMm: 6299, heightMm: 2601 },
  { widthMm: 1801, depthMm: 6299, wallCMm: 881, heightMm: 2601 },
  { widthMm: 3001, depthMm: 1000, wallCMm: 6000, heightMm: 2600 },
  { widthMm: 3001, depthMm: 6000, wallCMm: 1000, heightMm: 2600 },
  { widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
  { widthMm: 6299, depthMm: 6300, wallCMm: 880, heightMm: 3900 },
  { widthMm: 6300, depthMm: 6300, wallCMm: 6300, heightMm: 3900 },
];

export function labelOf(dimensions: UDimensions): string {
  const { widthMm, depthMm, wallCMm, heightMm } = dimensions;
  return `U ${String(widthMm)} x ${String(depthMm)} x ${String(wallCMm)} x ${String(heightMm)}`;
}

// ------------------------------------------------------------------------------------------------
// A headless stage with the shell and the design's bodies mounted.
// ------------------------------------------------------------------------------------------------

export interface Stage {
  readonly kit: Kit;
  readonly shell: THREE.Group;
  readonly solidsRoot: THREE.Group;
}

export function stageFor(room: DesignRoom): Stage {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  const shell = buildKitchenShell(kit, room);
  const solidsRoot = new THREE.Group();
  solidsRoot.add(shell);
  return { kit, shell, solidsRoot };
}

export function showDesign(
  stage: Stage,
  design: Design,
): readonly PlacementRecord[] {
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

export function mountedBodies(stage: Stage): THREE.Object3D[] {
  return stage.solidsRoot.children.filter(
    (child) => child.userData["placementId"] !== undefined,
  );
}

export interface MountedU {
  readonly design: Design;
  readonly stage: Stage;
}

export function mountU(dimensions: UDimensions): MountedU {
  const design = uShell(dimensions);
  const stage = stageFor(design.room);
  showDesign(stage, design);
  return { design, stage };
}

export function mountedById(scene: MountedU, id: string): THREE.Object3D {
  return required(
    mountedBodies(scene.stage).find(
      (body) => body.userData["placementId"] === id,
    ),
    `mounted ${id}`,
  );
}

export function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

export function namedMeshBox(object: THREE.Object3D, name: string): THREE.Box3 {
  const found = required(
    object.getObjectByName(name),
    `${object.name}'s ${name}`,
  );
  return worldBox(found);
}
