// M7B wave U4 adversarial QA — where a U's camera presets stand (D13, §6.4, §11 row 21).
//
// U4's camera suite proves each wall preset projects its own wall's top row inside a 390 x 844
// viewport. A projection says nothing about what stands **between** the eye and that row. Wave 7H's
// QA asked the structural question for an L (`qa-7h-preset-stands-clear.adversarial.test.ts`: is the
// eye in the room it frames, is anything between it and what it looks at). An L has no wall at
// x = W, so a preset's eye could stand there. A U does: wall C's plane and its cabinets. `wallB`'s
// eye stands at a fixed x ≈ 4.15 m whatever the room is (the distance carries no room term, 7H), so
// in every U narrower than that it is behind wall C, looking at wall B through wall C's cabinets.
// `wallC` is its reflection, so it stands behind wall B.
//
// Reworded on the U4 fix (ADR 0132 Amendment A2, M7B plan *U4 fix* F2 and F4): the eye may stand
// behind a side wall or in its body zone, provided that wall is in `cutawayWallsFor` — it is then not
// drawn and not pickable, so nothing stands between the eye and its subject. `overview` and `wallA`
// stand in front of both walls and cut nothing. The click test applies the cutaway before it clicks,
// and runs from both side presets in three rooms.
//
// The rooms are inside the approved U policy ADR 0108 H4 records for U6 (wall A 2700–6000, walls B
// and C 1000–6000, height 2200–3900) and round-trip through `buildUShellDesign`.
import {
  buildKitchenLBodyCatalog,
  buildUShellDesign,
  derivePlacementRecords,
  KITCHEN_L_DESIGN,
  type Design,
  type DesignPlacement,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyCutaway, cutawayWallsFor } from "../src/cutaway.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { findCameraPresetForRoom, type CameraPresetId } from "../src/stage.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { acceptedU, OCCURRED_AT } from "./support/u-scene.js";

/** The cabinet depth every room in this file is designed at (`buildUShellDesign`'s default). */
const CABINET_DEPTH_MM = 600;

beforeAll(() => {
  installHeadlessDocument();
});

/** The approved U's narrowest wall A (ADR 0108 H4, RQ1), a symmetric 3 m U, and one either side of
 *  the eye's fixed 4.15 m. */
const APPROVED_US: readonly (readonly [string, DesignRoom])[] = [
  ["2700 x 1600 x 1600", acceptedU(2700, 1600, 1600)],
  ["3000 x 3000 x 3000", acceptedU(3000, 3000, 3000)],
  ["4000 x 3000 x 3000", acceptedU(4000, 3000, 3000)],
  ["4500 x 3000 x 3600", acceptedU(4500, 3000, 3600)],
];

const EVERY_U_PRESET: readonly CameraPresetId[] = [
  "overview",
  "wallA",
  "wallB",
  "wallC",
];

const PRESETS_IN_FRONT_OF_BOTH_SIDE_WALLS: readonly CameraPresetId[] = [
  "overview",
  "wallA",
];

/** Behind a side wall means on the far side of its plane **and** within its run: past the run's end
 *  the room is open (the U's mouth), and an eye standing there looks in over nothing. */
function sideWallTheEyeIsBehind(
  eye: readonly [number, number, number],
  room: DesignRoom,
): "B" | "C" | undefined {
  const [x, , z] = eye;
  const widthM = room.widthMm / 1000;
  if (x < 0 && z < room.depthMm / 1000) return "B";
  if (x > widthM && z < required(room.wallCMm, "wallCMm") / 1000) return "C";
  return undefined;
}

describe("no preset of a U stands behind a side wall it draws (7H's eye-in-the-room rule, restated for a U)", () => {
  for (const [name, room] of APPROVED_US) {
    it.each(EVERY_U_PRESET)(
      `${name}: %s's eye is in front of both side walls, or the wall it is behind is cut away`,
      (id) => {
        const eye = findCameraPresetForRoom(id, room).position;
        const cutAway = cutawayWallsFor(eye, room, CABINET_DEPTH_MM);

        const wallBehind = sideWallTheEyeIsBehind(eye, room);

        expect(
          wallBehind === undefined || cutAway.includes(wallBehind),
          `${id} at ${eye.join(", ")} is behind wall ${String(wallBehind)}; cut away: [${cutAway.join(", ")}]`,
        ).toBe(true);
      },
    );

    it.each(PRESETS_IN_FRONT_OF_BOTH_SIDE_WALLS)(
      `${name}: %s stands in front of both side walls and cuts nothing away`,
      (id) => {
        const eye = findCameraPresetForRoom(id, room).position;

        expect(cutawayWallsFor(eye, room, CABINET_DEPTH_MM)).toEqual([]);
      },
    );
  }
});

type SideWallId = "B" | "C";

interface ClickCase {
  readonly name: string;
  readonly room: DesignRoom;
  /** The side wall the preset is named for: its top row is what the click is aimed at. */
  readonly lookedAt: SideWallId;
  /** Whether the eye stands behind the far wall's plane, so that wall's cabinets are on the sight
   *  line. Otherwise the eye is in front of the plane but inside the wall's body zone. */
  readonly isEyeBehindFarPlane: boolean;
  /** What stands on the far wall where the sight line crosses it. */
  readonly farBody: FarBodyKind;
}

type FarBodyKind = "upper" | "column";

/** An upper at the top row's own height band, and a full-height pantry (ADR 0110 N3 puts pantries at
 *  a side wall's free end). Both cover the sight line where it crosses the far plane. */
const FAR_BODIES = {
  upper: { buildId: "wall-2door-600", y0Mm: 1500, heightMm: 700 },
  column: { buildId: "tall-pantry-600", y0Mm: 0, heightMm: 2200 },
} as const;

/** QA's room (3000³), the room where the eye is behind the plane at the approved minimum, and the
 *  room where it stands in the far wall's body zone instead (wallB's eye at x = 4.149 m, wall C's
 *  plane at 4.5 m) — each from both side presets. */
const CLICK_CASES: readonly ClickCase[] = (
  [
    ["3000 x 3000 x 3000", acceptedU(3000, 3000, 3000), true],
    ["2700 x 1600 x 1600", acceptedU(2700, 1600, 1600), true],
    ["4500 x 3000 x 3600", acceptedU(4500, 3000, 3600), false],
  ] as const
).flatMap(([name, room, isEyeBehindFarPlane]) =>
  (["B", "C"] as const).map((lookedAt) => ({
    name,
    room,
    lookedAt,
    isEyeBehindFarPlane,
    farBody: "upper" as const,
  })),
);

/** A8.1: the eye is behind the far wall's plane but **past the end of the far wall's run** (the
 *  `wallC` eye of 2700 x 1600 x 2400 is at z = 1.666 against a wall B of 1.6 m), yet the sight line to
 *  the top row crosses the plane inside the run, at B's free end. Each room from the side preset that
 *  has this shape, with an upper and then a tall column standing there. */
const FREE_END_CASES: readonly ClickCase[] = (
  [
    ["2700 x 1600 x 2400", acceptedU(2700, 1600, 2400), "C"],
    ["2700 x 2400 x 1600", acceptedU(2700, 2400, 1600), "B"],
  ] as const
).flatMap(([name, room, lookedAt]) =>
  (["upper", "column"] as const).map((farBody) => ({
    name: `${name} (past the far run's end)`,
    room,
    lookedAt,
    isEyeBehindFarPlane: true,
    farBody,
  })),
);

const EVERY_CLICK_CASE: readonly ClickCase[] = [
  ...CLICK_CASES,
  ...FREE_END_CASES,
];

const presetIdOf = (wall: SideWallId): "wallB" | "wallC" =>
  wall === "B" ? "wallB" : "wallC";

const oppositeOf = (wall: SideWallId): SideWallId => (wall === "B" ? "C" : "B");

const runMmOf = (room: DesignRoom, wall: SideWallId): number =>
  wall === "B" ? room.depthMm : required(room.wallCMm, "wallCMm");

/** The middle of the run, but never inside the corner's own top return (which the shell design
 *  seats within 900 mm of the corner): a click there would land on the corner, not on the body under
 *  test. */
const topRowAlongMm = (room: DesignRoom, wall: SideWallId): number =>
  Math.max(runMmOf(room, wall) / 2, 1300);

const planeXOf = (room: DesignRoom, wall: SideWallId): number =>
  wall === "B" ? 0 : room.widthMm / 1000;

describe("§11 row 21: a click on a side wall's top row from its own preset selects that wall's body", () => {
  /** Seats a body the way the existing U suite does: its seat depth measured off the body the kit
   *  builds, so its back face lands on its wall's plane. */
  function seatedPlacement(
    kit: Kit,
    spec: {
      readonly id: string;
      readonly wall: "A" | SideWallId;
      readonly alongMm: number;
      readonly y0Mm: number;
      readonly buildId: string;
      readonly heightMm: number;
    },
  ): DesignPlacement {
    const rearOverhangM = -measuredBodyBox(kit, spec.buildId, spec.heightMm).min
      .z;
    return {
      id: spec.id,
      wall: spec.wall,
      alongMm: spec.alongMm,
      y0Mm: spec.y0Mm,
      body: {
        buildId: spec.buildId,
        widthMm: 600,
        heightMm: spec.heightMm,
        seatDepthMm: Math.round(2 * rearOverhangM * 1000),
      },
    };
  }

  function measuredBodyBox(
    kit: Kit,
    buildId: string,
    heightMm: number,
  ): THREE.Box3 {
    const records = derivePlacementRecords(
      {
        ...KITCHEN_L_DESIGN,
        placements: [
          {
            id: "probe",
            wall: "A",
            alongMm: 1000,
            y0Mm: 0,
            body: { buildId, widthMm: 600, heightMm },
          },
        ],
      },
      buildKitchenLBodyCatalog(600),
    );
    const root = new THREE.Group();
    syncSolidBodies({
      kit,
      solidsRoot: root,
      records,
      room: KITCHEN_L_DESIGN.room,
    });
    const body = required(root.children[0], "the probe body");
    body.position.set(0, 0, 0);
    body.updateWorldMatrix(true, true);
    return new THREE.Box3().setFromObject(body);
  }

  function mountedRoot(
    kit: Kit,
    room: DesignRoom,
    placements: readonly DesignPlacement[],
  ): THREE.Group {
    const shell = buildUShellDesign({ room, occurredAt: OCCURRED_AT });
    const design: Design = {
      ...shell,
      placements: [...shell.placements, ...placements],
    };
    const records = derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(CABINET_DEPTH_MM),
    );
    const solidsRoot = new THREE.Group();
    solidsRoot.add(buildKitchenShell(kit, room));
    syncSolidBodies({ kit, solidsRoot, records, room });
    solidsRoot.updateMatrixWorld(true);
    return solidsRoot;
  }

  /** The point on the top-row body's **front** face the customer taps: wall A fronts +Z, wall B +X,
   *  wall C −X. */
  function frontCentreOf(
    solidsRoot: THREE.Group,
    id: string,
    wall: "A" | SideWallId,
  ): THREE.Vector3 {
    const body = required(
      solidsRoot.children.find((c) => c.userData["placementId"] === id),
      id,
    );
    const box = new THREE.Box3().setFromObject(body);
    const centre = box.getCenter(new THREE.Vector3());
    if (wall === "A") return centre.setZ(box.max.z);
    return centre.setX(wall === "B" ? box.max.x : box.min.x);
  }

  /** Where along the far wall its cabinet can be in the way: where the sight line from the eye to
   *  the aim point crosses that wall's plane, or — when the line never crosses it, the eye being in
   *  front of the plane — where the eye itself stands, inside the wall's body zone. */
  function blockerAlongMm(
    eye: THREE.Vector3,
    aim: THREE.Vector3,
    room: DesignRoom,
    farWall: SideWallId,
  ): number {
    const t = crossingOf(eye, aim, planeXOf(room, farWall));
    const z = t > 0 && t < 1 ? eye.z + t * (aim.z - eye.z) : eye.z;
    const marginMm = 300;
    return Math.min(
      Math.max(Math.round(z * 1000), marginMm),
      runMmOf(room, farWall) - marginMm,
    );
  }

  const crossingOf = (
    eye: THREE.Vector3,
    aim: THREE.Vector3,
    planeX: number,
  ): number => (planeX - eye.x) / (aim.x - eye.x);

  interface Scene {
    readonly solidsRoot: THREE.Group;
    readonly eye: THREE.Vector3;
    readonly aim: THREE.Vector3;
  }

  function sceneFor({ room, lookedAt, farBody }: ClickCase): Scene {
    const farWall = oppositeOf(lookedAt);
    const eye = new THREE.Vector3(
      ...findCameraPresetForRoom(presetIdOf(lookedAt), room).position,
    );
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const topRow = seatedPlacement(kit, {
      id: `${lookedAt}-top`,
      wall: lookedAt,
      alongMm: topRowAlongMm(room, lookedAt),
      y0Mm: 2200,
      buildId: "wall-2door-600-top",
      heightMm: 400,
    });
    const aim = frontCentreOf(
      mountedRoot(kit, room, [topRow]),
      topRow.id,
      lookedAt,
    );
    const farBlocker = seatedPlacement(kit, {
      id: `${farWall}-${farBody}`,
      wall: farWall,
      alongMm: blockerAlongMm(eye, aim, room, farWall),
      ...FAR_BODIES[farBody],
    });
    return {
      solidsRoot: mountedRoot(kit, room, [topRow, farBlocker]),
      eye,
      aim,
    };
  }

  function clickAt(scene: Scene): string | undefined {
    const raycaster = createPickingRaycaster();
    raycaster.set(scene.eye, scene.aim.clone().sub(scene.eye).normalize());
    return pick(raycaster, scene.solidsRoot, new THREE.Group())?.id;
  }

  it.each(EVERY_CLICK_CASE)(
    "$name from the $lookedAt-side preset, far $farBody: the far wall is cut away and the top row is selected",
    (clickCase) => {
      const { room, lookedAt } = clickCase;
      const scene = sceneFor(clickCase);
      const eye = [scene.eye.x, scene.eye.y, scene.eye.z] as const;

      const cutAway = cutawayWallsFor(eye, room, CABINET_DEPTH_MM);
      applyCutaway(scene.solidsRoot, new THREE.Group(), cutAway);
      const selected = clickAt(scene);

      expect(cutAway).toEqual([oppositeOf(lookedAt)]);
      expect(selected).toBe(`${lookedAt}-top`);
    },
  );

  it.each(EVERY_CLICK_CASE.filter((c) => c.isEyeBehindFarPlane))(
    "$name from the $lookedAt-side preset, far $farBody: without the cutaway the far wall's body takes the click",
    (clickCase) => {
      const scene = sceneFor(clickCase);

      const selected = clickAt(scene);

      expect(selected).toBe(
        `${oppositeOf(clickCase.lookedAt)}-${clickCase.farBody}`,
      );
    },
  );

  it.each(FREE_END_CASES)(
    "$name from the $lookedAt-side preset: the eye really is past the far wall's run while the sight line crosses inside it",
    (clickCase) => {
      const { room, lookedAt } = clickCase;
      const farWall = oppositeOf(lookedAt);
      const scene = sceneFor(clickCase);
      const t = crossingOf(scene.eye, scene.aim, planeXOf(room, farWall));
      const crossingZM = scene.eye.z + t * (scene.aim.z - scene.eye.z);

      expect(scene.eye.z * 1000).toBeGreaterThan(runMmOf(room, farWall));
      expect(crossingZM * 1000).toBeLessThan(runMmOf(room, farWall));
    },
  );

  it.each(
    APPROVED_US.flatMap(([name, room]) =>
      (["overview", "wallA"] as const).map((id) => ({ name, room, id })),
    ),
  )(
    "$name from $id: nothing is cut away and wall A's top row is selected",
    ({ room, id }) => {
      const kit = makeKit({ createCanvas: createHeadlessCanvas });
      const topRow = seatedPlacement(kit, {
        id: "A-top",
        wall: "A",
        alongMm: room.widthMm / 2,
        y0Mm: 2200,
        buildId: "wall-2door-600-top",
        heightMm: 400,
      });
      const solidsRoot = mountedRoot(kit, room, [topRow]);
      const preset = findCameraPresetForRoom(id, room);
      const scene: Scene = {
        solidsRoot,
        eye: new THREE.Vector3(...preset.position),
        aim: frontCentreOf(solidsRoot, topRow.id, "A"),
      };

      const cutAway = cutawayWallsFor(preset.position, room, CABINET_DEPTH_MM);
      applyCutaway(solidsRoot, new THREE.Group(), cutAway);

      expect(cutAway).toEqual([]);
      expect(clickAt(scene)).toBe("A-top");
    },
  );
});
