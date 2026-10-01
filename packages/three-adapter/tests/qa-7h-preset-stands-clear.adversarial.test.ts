// Wave 7H adversarial QA: the camera's distance carries **no room term**, and this file goes
// looking for the room where that is wrong.
//
// `stage.test.ts` proves the framing: the 2.20–2.60 m row stays tappable, the kitchen stays in
// frame, and the presets move continuously with the room. All three are measured by projecting
// points — which says nothing about **where the camera is standing**. A camera buried inside a
// cabinet, behind a wall plane, or under the floor projects the tappable row exactly as well as one
// standing in the room, and the customer sees the inside of a carcass.
//
// So this asks the structural questions instead: is the eye in the room it is framing, is anything
// between it and what it is looking at, and does it stand inside a body. Swept across the approved
// policy, whose corners a `fast-check` sweep essentially never reaches, and measured against a
// kitchen **generated for that same room** rather than the seeded one — the seeded bodies stand
// where they stand whatever the room is, so a sweep against them varies the camera and holds the
// obstacles still, which is half a test.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type BodyProbeFactory,
  type Design,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { EYE_CLEARANCE_M } from "../src/cutaway.js";
import { disposeKit } from "../src/kit-disposal.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { makeKit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  CAMERA_PRESETS,
  cameraPresetsForRoom,
  findCameraPresetForRoom,
  type CameraPreset,
  type CameraPresetId,
} from "../src/stage.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import {
  anyApprovedRoom,
  APPROVED_HEIGHT as HEIGHT,
  APPROVED_WALL_A as WALL_A,
  APPROVED_WALL_B as WALL_B,
  roomOf,
  SEEDED_ROOM,
} from "./support/approved-rooms.js";

const OCCURRED_AT = "2026-09-11T12:00:00.000Z";

/** Wall A's plane is z = 0 fronting +Z and wall B's is x = 0 fronting +X — the domain's convention
 *  at `room-transforms.ts:29-49`, which `kitchen-shell.ts` adopts. An eye at a negative x or z is
 *  therefore behind a wall, looking at the back of it. */
const BEHIND_A_WALL_M = 0;

/** The eight corners of the policy box, the seeded triple, and the two shapes the constant distance
 *  is most exposed to: the deepest shallow room and the shallowest deep one. */
const SAMPLED_ROOMS: readonly DesignRoom[] = [
  ...[WALL_A.minMm, WALL_A.maxMm].flatMap((widthMm) =>
    [WALL_B.minMm, WALL_B.maxMm].flatMap((depthMm) =>
      [HEIGHT.minMm, HEIGHT.maxMm].map((heightMm) =>
        roomOf(widthMm, depthMm, heightMm),
      ),
    ),
  ),
  SEEDED_ROOM,
  roomOf(WALL_A.maxMm, WALL_B.minMm, HEIGHT.maxMm),
  roomOf(WALL_A.minMm, WALL_B.maxMm, HEIGHT.minMm),
];

beforeAll(() => {
  installHeadlessDocument();
});

describe("every preset stands in the room it frames", () => {
  it.each(presetsAcross(SAMPLED_ROOMS))(
    "$id keeps the eye in front of both walls and above the floor at $widthMm x $depthMm x $heightMm",
    ({ id, room }) => {
      const preset = findCameraPresetForRoom(id, room);

      expectStandsInTheRoom(preset);
    },
  );

  propertyTest.prop([anyApprovedRoom, fc.constantFrom(...presetIds())], {
    numRuns: 300,
  })("keeps the eye in the room at every room in the policy", (room, id) => {
    expectStandsInTheRoom(findCameraPresetForRoom(id, room));
  });

  /** The other half: what it looks **at** must be a point in the customer's room, not a point in
   *  the reference's. The two walls' midpoints and the middle of the floor all are, by the domain's
   *  convention, so the target is inside the entered footprint on both floor axes. */
  it.each(presetsAcross(SAMPLED_ROOMS))(
    "$id looks at a point inside the entered footprint at $widthMm x $depthMm x $heightMm",
    ({ id, room }) => {
      const [x, , z] = findCameraPresetForRoom(id, room).target;

      expect(x, "target along wall A").toBeGreaterThanOrEqual(0);
      expect(x, "target along wall A").toBeLessThanOrEqual(room.widthMm / 1000);
      expect(z, "target along wall B").toBeGreaterThanOrEqual(0);
      expect(z, "target along wall B").toBeLessThanOrEqual(room.depthMm / 1000);
    },
  );

  /** No wall plane between the eye and what it is looking at. Both planes are half-spaces, so a
   *  segment with both ends in front of one never crosses it — which is why this is asserted on the
   *  ends and named for what it means. */
  it.each(presetsAcross(SAMPLED_ROOMS))(
    "$id puts no wall between the eye and its target at $widthMm x $depthMm x $heightMm",
    ({ id, room }) => {
      const preset = findCameraPresetForRoom(id, room);

      for (const [label, point] of [
        ["eye", preset.position],
        ["target", preset.target],
      ] as const) {
        expect(point[0], `${label} is behind wall B`).toBeGreaterThanOrEqual(
          BEHIND_A_WALL_M,
        );
        expect(point[2], `${label} is behind wall A`).toBeGreaterThanOrEqual(
          BEHIND_A_WALL_M,
        );
      }
    },
  );
});

/** The claim the constant distance is most exposed to. A camera whose stand-off does not grow with
 *  the room stays where it is while the kitchen grows towards it, and the room where that first
 *  touches is the room this is looking for. */
describe("no preset stands inside the kitchen it frames", () => {
  const GENERATED_ROOMS: readonly DesignRoom[] = [
    SEEDED_ROOM,
    roomOf(WALL_A.maxMm, WALL_B.maxMm, HEIGHT.maxMm),
    roomOf(WALL_A.maxMm, WALL_B.minMm, HEIGHT.minMm),
    roomOf(3000, 2400, 2500),
    roomOf(4800, 3600, 3000),
  ];

  it.each(GENERATED_ROOMS)(
    "clears every generated body at $widthMm x $depthMm x $heightMm",
    (room) => {
      const bodies = generatedBodyBoxes(room);

      for (const preset of cameraPresetsForRoom(room)) {
        expectClearOfEvery(preset, bodies);
      }
    },
  );

  /** Non-vacuity: the sweep above is only evidence if a kitchen was really built for those rooms
   *  and really has bodies standing where a camera could reach them. */
  it("builds a kitchen with bodies in every room it sweeps", () => {
    for (const room of GENERATED_ROOMS) {
      expect(
        generatedBodyBoxes(room).length,
        `${String(room.widthMm)} x ${String(room.depthMm)}`,
      ).toBeGreaterThan(3);
    }
  });

  /** And the shell itself, which no generated design can miss: the floor slab, the two planes and
   *  the backsplash are drawn at the entered room, and none of the three eyes may be inside one. */
  it.each(presetsAcross(SAMPLED_ROOMS))(
    "$id clears the drawn floor, walls and backsplash at $widthMm x $depthMm x $heightMm",
    ({ id, room }) => {
      expectClearOfEvery(findCameraPresetForRoom(id, room), shellBoxes(room));
    },
  );

  /** The seeded kitchen is the one the preset library was framed on, and it is the kitchen a
   *  customer arriving at the reference design actually sees. Held separately from the generated
   *  sweep because composition places nothing in the 2200–2600 row and this design does. */
  it("clears every seeded body in the seeded room", () => {
    const bodies = mountedBodyBoxes(
      KITCHEN_L_DESIGN,
      derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
    );

    for (const preset of cameraPresetsForRoom(SEEDED_ROOM)) {
      expectClearOfEvery(preset, bodies);
    }
  });
});

/** `CAMERA_PRESETS` is a module-level array of the reference's three triples, and
 *  `cameraPresetsForRoom` reads its vectors on every call to recover the viewing directions. A
 *  framing call that wrote back into it would make the presets a function of how many rooms had
 *  been framed before — invisible in a single-room test and a different scene per session. */
describe("framing a room leaves the reference triples alone", () => {
  it("returns the same three vectors for the same room, however many rooms came before", () => {
    const first = cameraPresetsForRoom(SEEDED_ROOM);

    for (const room of SAMPLED_ROOMS) cameraPresetsForRoom(room);

    expect(cameraPresetsForRoom(SEEDED_ROOM)).toEqual(first);
  });

  it("leaves the recorded reference triples exactly where they were", () => {
    for (const room of SAMPLED_ROOMS) cameraPresetsForRoom(room);

    expect(
      CAMERA_PRESETS.map((preset) => ({
        id: preset.id,
        position: preset.position,
        target: preset.target,
      })),
    ).toEqual([
      { id: "overview", position: [4.3, 3.0, 5.3], target: [1.6, 1.35, 0.85] },
      { id: "wallA", position: [1.9, 2.1, 5.6], target: [1.7, 1.35, 0.45] },
      { id: "wallB", position: [5.4, 2.2, 2.3], target: [0.5, 1.35, 1.75] },
    ]);
  });
});

function expectStandsInTheRoom(preset: CameraPreset): void {
  const [x, y, z] = preset.position;

  expect(y, `${preset.id} is below the floor`).toBeGreaterThan(0);
  expect(x, `${preset.id} is behind wall B`).toBeGreaterThan(BEHIND_A_WALL_M);
  expect(z, `${preset.id} is behind wall A`).toBeGreaterThan(BEHIND_A_WALL_M);
}

interface LabelledBox {
  readonly label: string;
  readonly box: THREE.Box3;
}

function expectClearOfEvery(
  preset: CameraPreset,
  obstacles: readonly LabelledBox[],
): void {
  const eye = new THREE.Vector3(...preset.position);

  for (const { label, box } of obstacles) {
    const swollen = box.clone().expandByScalar(EYE_CLEARANCE_M);
    expect(
      swollen.containsPoint(eye),
      `${preset.id} stands inside ${label}`,
    ).toBe(false);
  }
}

/** Every body of a kitchen **composed for this room**, as world-space boxes. A refusal is a real
 *  answer for a room too small to hold the minimum kitchen, so it is reported rather than swallowed
 *  — the non-vacuity test above is what stops a refusal reading as a clear sweep. */
function generatedBodyBoxes(room: DesignRoom): LabelledBox[] {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
  });
  if (!result.ok) {
    throw new Error(
      `generateKitchen refused ${String(room.widthMm)} x ${String(room.depthMm)}: ${result.reason.code}`,
    );
  }
  const design = result.design;
  const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
  return mountedBodyBoxes(design, derivePlacementRecords(design, catalog));
}

function mountedBodyBoxes(
  design: Design,
  records: ReturnType<typeof derivePlacementRecords>,
): LabelledBox[] {
  const kit = makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm: cabinetDepthMmOf(design),
  });
  const solidsRoot = new THREE.Group();
  syncSolidBodies({ kit, solidsRoot, records, room: design.room });
  solidsRoot.updateWorldMatrix(true, true);

  return solidsRoot.children
    .filter((child) => typeof child.userData["placementId"] === "string")
    .map((child) => ({
      label: String(child.userData["placementId"]),
      box: new THREE.Box3().setFromObject(child),
    }))
    .filter(({ box }) => !box.isEmpty());
}

function shellBoxes(room: DesignRoom): LabelledBox[] {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  const shell = buildKitchenShell(kit, room);
  shell.updateWorldMatrix(true, true);

  return shell.children.map((child) => ({
    label: child.name,
    box: new THREE.Box3().setFromObject(child),
  }));
}

function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
    const referenceRoom = kit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(kit, referenceRoom), () => {
      disposeKit(kit, referenceRoom);
    });
  };
}

interface PresetInRoom {
  readonly id: CameraPresetId;
  readonly widthMm: number;
  readonly depthMm: number;
  readonly heightMm: number;
  readonly room: DesignRoom;
}

function presetsAcross(rooms: readonly DesignRoom[]): PresetInRoom[] {
  return rooms.flatMap((room) =>
    presetIds().map((id) => ({
      id,
      widthMm: room.widthMm,
      depthMm: room.depthMm,
      heightMm: room.heightMm,
      room,
    })),
  );
}

function presetIds(): CameraPresetId[] {
  return CAMERA_PRESETS.map((preset) => preset.id);
}
