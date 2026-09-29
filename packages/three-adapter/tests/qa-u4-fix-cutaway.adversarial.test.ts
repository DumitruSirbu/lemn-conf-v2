// M7B wave U4 fix, adversarial QA (ADR 0132 Amendment A2–A3; the plan's *U4 fix* F1–F4; AC4 (d)).
//
// The implementer's `cutaway.test.ts` and `picking.cutaway.test.ts` prove the cut set and its
// application on hand-built voids and one scene. This file attacks what they leave open:
//
// - the zone's edge to a micrometre at both declared depths, read against ADR 0108 H2's measured
//   742 and 748 mm (never through `occupiedDepthOfEntryM`, which is what the code reads);
// - the run's ends: the eye exactly at a run's end, a millimetre past it and far past it, and B ≠ C
//   both ways. There is no run bound (A8.1): a wall is cut wherever along it the eye is;
// - overlays built while their target is already cut away, and a re-sync after a cutaway: nothing may
//   be left in the wrong visible state once `applyCutaway` runs again, and a restore must show all of
//   it;
// - the wall tag on every kind of mounted object, the right corner's wrappers and a void outline
//   included;
// - picking from a side preset in a real scene: past a cut-away wall's body **and** its voids, to the
//   looked-at wall's own void.
import {
  buildUShellDesign,
  deriveRecordedColumns,
  recomputeVoids,
  toMetres,
  type Design,
  type DesignRoom,
  type DesignWall,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyCutaway, cutawayWallsFor } from "../src/cutaway.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { buildOverflowMark } from "../src/overflow-mark.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { RIGHT_CORNER_WRAPPER_NAME } from "../src/right-corner-wrapper.js";
import { syncSolidBodies, syncVoidMeshes } from "../src/scene-sync.js";
import { buildSelectionOutline } from "../src/selection-outline.js";
import { findCameraPresetForRoom, type Vector3Tuple } from "../src/stage.js";
import { wallOf } from "../src/wall-tag.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import {
  acceptedU,
  OCCURRED_AT,
  recordsOf,
  seated,
} from "./support/u-scene.js";

const CABINET_DEPTH_MM = 600;
/** ADR 0108 H2's measured deepest floor bodies (`fridge-free-700` at 600, `base-hob-oven` at 700),
 *  plus 7H's 50 mm clearance (ADR 0132 A2). **A deliberate independent pin**: the source reads these
 *  through `occupiedDepthOfEntryM` and `EYE_CLEARANCE_M`, and a test that read them the same way could
 *  not notice that path going wrong. The 0.05 is written here for the same reason. */
const ZONE_M = { 600: 0.742 + 0.05, 700: 0.748 + 0.05 } as const;
/** A micrometre: well above the float noise of a millimetre sum, well below any real distance. */
const MICROMETRE_M = 1e-6;
const EYE_HEIGHT_M = 2;

beforeAll(() => {
  installHeadlessDocument();
});

// ------------------------------------------------------------------------------------------------
// The cut set's edges.
// ------------------------------------------------------------------------------------------------

describe("cutawayWallsFor at the zone's edge, to a micrometre, at both declared depths", () => {
  const room = acceptedU(3000, 3000, 3000);
  const widthM = room.widthMm / 1000;
  const alongM = 1.5;

  it.each([600, 700] as const)(
    "depth %i: wall B's zone ends at the deepest floor body plus 50 mm",
    (depthMm) => {
      const inside: Vector3Tuple = [
        ZONE_M[depthMm] - MICROMETRE_M,
        EYE_HEIGHT_M,
        alongM,
      ];
      const outside: Vector3Tuple = [
        ZONE_M[depthMm] + MICROMETRE_M,
        EYE_HEIGHT_M,
        alongM,
      ];

      expect(cutawayWallsFor(inside, room, depthMm)).toEqual(["B"]);
      expect(cutawayWallsFor(outside, room, depthMm)).toEqual([]);
    },
  );

  it.each([600, 700] as const)(
    "depth %i: wall C's zone is the same distance from x = W",
    (depthMm) => {
      const inside: Vector3Tuple = [
        widthM - ZONE_M[depthMm] + MICROMETRE_M,
        EYE_HEIGHT_M,
        alongM,
      ];
      const outside: Vector3Tuple = [
        widthM - ZONE_M[depthMm] - MICROMETRE_M,
        EYE_HEIGHT_M,
        alongM,
      ];

      expect(cutawayWallsFor(inside, room, depthMm)).toEqual(["C"]);
      expect(cutawayWallsFor(outside, room, depthMm)).toEqual([]);
    },
  );

  it("cuts at the same eye for 700 and not for 600 between the two zones' edges", () => {
    const between: Vector3Tuple = [
      (ZONE_M[600] + ZONE_M[700]) / 2,
      EYE_HEIGHT_M,
      alongM,
    ];

    expect(cutawayWallsFor(between, room, 600)).toEqual([]);
    expect(cutawayWallsFor(between, room, 700)).toEqual(["B"]);
  });

  it.each([0, 599, 601, 699, 701, 1000])(
    "refuses an undeclared cabinet depth %i rather than guessing a zone",
    (depthMm) => {
      expect(() =>
        cutawayWallsFor([0.1, EYE_HEIGHT_M, alongM], room, depthMm),
      ).toThrow();
    },
  );
});

describe("cutawayWallsFor at and past a run's end, with B ≠ C both ways (A8.1: no run bound)", () => {
  const cases = [
    ["B < C", acceptedU(3000, 1000, 6000)],
    ["B > C", acceptedU(3000, 6000, 1000)],
  ] as const;

  it.each(cases)(
    "%s: an eye behind a wall is cut at the wall's own run end, a millimetre past it and far past it",
    (_name, room) => {
      const widthM = room.widthMm / 1000;
      const runEndM: Record<"B" | "C", number> = {
        B: room.depthMm / 1000,
        C: required(room.wallCMm, "wallCMm") / 1000,
      };
      const behind: Record<"B" | "C", number> = { B: -1, C: widthM + 1 };

      for (const wall of ["B", "C"] as const) {
        for (const beyondEndM of [0, 0.001, 3]) {
          const eye: Vector3Tuple = [
            behind[wall],
            EYE_HEIGHT_M,
            runEndM[wall] + beyondEndM,
          ];

          expect(
            cutawayWallsFor(eye, room, CABINET_DEPTH_MM),
            `${wall} + ${String(beyondEndM)}`,
          ).toEqual([wall]);
        }
      }
    },
  );

  it.each(cases)(
    "%s: each side preset cuts the far wall exactly when its eye is in or behind the far wall's zone, level with the run or not",
    (_name, room) => {
      const widthM = room.widthMm / 1000;
      const presets = [
        ["wallB", "C"],
        ["wallC", "B"],
      ] as const;

      for (const [id, farWall] of presets) {
        const eye = findCameraPresetForRoom(id, room).position;
        const distanceFromFarPlaneM =
          farWall === "C" ? widthM - eye[0] : eye[0];
        const isInFarZone = distanceFromFarPlaneM < ZONE_M[600];

        expect(cutawayWallsFor(eye, room, CABINET_DEPTH_MM), id).toEqual(
          isInFarZone ? [farWall] : [],
        );
      }
    },
  );
});

// ------------------------------------------------------------------------------------------------
// A scene: the U shell, wall-B and wall-C bodies, its voids, and overlays beside the roots.
// ------------------------------------------------------------------------------------------------

interface Scene {
  readonly kit: Kit;
  readonly room: DesignRoom;
  readonly design: Design;
  readonly stageRoot: THREE.Group;
  readonly solidsRoot: THREE.Group;
  readonly voidsRoot: THREE.Group;
}

function syncScene(scene: Scene, design: Design): void {
  const records = recordsOf(design);
  syncSolidBodies({
    kit: scene.kit,
    solidsRoot: scene.solidsRoot,
    records,
    room: design.room,
  });
  const columns = deriveRecordedColumns(
    records,
    design,
    toMetres(design.room.widthMm),
  );
  syncVoidMeshes({
    voidsRoot: scene.voidsRoot,
    voids: recomputeVoids(records, columns),
    room: design.room,
  });
  scene.stageRoot.updateMatrixWorld(true);
}

/** 3000³: the room where `wallB`'s eye stands behind wall C's plane. Wall C carries an upper and a
 *  tall pantry where the `wallB` sight lines to wall B's top-row slot and to its base cabinet cross
 *  wall C's run; wall B's middle column is left empty, so its top slot is a void. */
function mountScene(): Scene {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  const room = acceptedU(3000, 3000, 3000);
  const shell = buildUShellDesign({ room, occurredAt: OCCURRED_AT });
  const design: Design = {
    ...shell,
    placements: [
      ...shell.placements,
      seated(kit, {
        id: "c-upper",
        wall: "C",
        alongMm: 1500,
        y0Mm: 1500,
        buildId: "wall-2door-600",
        heightMm: 700,
      }),
      seated(kit, {
        id: "c-tall",
        wall: "C",
        alongMm: 2150,
        y0Mm: 0,
        buildId: "tall-pantry-600",
        heightMm: 2200,
      }),
      seated(kit, {
        id: "b-base",
        wall: "B",
        alongMm: 2400,
        y0Mm: 0,
        buildId: "base-drawer3-600",
        heightMm: 820,
      }),
    ],
  };
  const stageRoot = new THREE.Group();
  const solidsRoot = new THREE.Group();
  const voidsRoot = new THREE.Group();
  solidsRoot.add(buildKitchenShell(kit, room));
  stageRoot.add(solidsRoot, voidsRoot);
  const scene: Scene = {
    kit,
    room,
    design,
    stageRoot,
    solidsRoot,
    voidsRoot,
  };
  syncScene(scene, design);
  return scene;
}

function mountedBody(scene: Scene, id: string): THREE.Object3D {
  return required(
    scene.solidsRoot.children.find((c) => c.userData["placementId"] === id),
    id,
  );
}

function outlineOn(
  scene: Scene,
  target: THREE.Object3D,
  kind: "placement" | "void",
): THREE.Object3D {
  const { group } = buildSelectionOutline({
    target,
    parent: scene.stageRoot,
    kind,
  });
  scene.stageRoot.add(group);
  return group;
}

function markOn(scene: Scene, target: THREE.Object3D): THREE.Object3D {
  const { group } = buildOverflowMark({ target, parent: scene.stageRoot });
  scene.stageRoot.add(group);
  return group;
}

/** Every object the cutaway is responsible for: the roots' children and the overlays beside them. */
function wallKeyedObjects(scene: Scene): THREE.Object3D[] {
  return [
    ...scene.solidsRoot.children,
    ...scene.voidsRoot.children,
    ...scene.stageRoot.children,
  ].filter((object) => wallOf(object) !== undefined);
}

function expectDrawnExactlyOffWalls(
  scene: Scene,
  cut: readonly DesignWall[],
): void {
  const wrong = wallKeyedObjects(scene)
    .filter(
      (object) =>
        object.visible === cut.includes(required(wallOf(object), "wall")),
    )
    .map((object) => `${object.name}@${String(wallOf(object))}`);

  expect(wrong).toEqual([]);
}

function wallCVoid(scene: Scene): THREE.Object3D {
  return required(
    scene.voidsRoot.children.find((v) => wallOf(v) === "C"),
    "a wall-C void",
  );
}

// ------------------------------------------------------------------------------------------------
// The wall tag.
// ------------------------------------------------------------------------------------------------

describe("every kind of mounted object carries its wall", () => {
  const scene = mountScene();

  it("tags each body, and each right-corner wrapper, with its record's wall", () => {
    const records = recordsOf(scene.design);

    for (const record of records) {
      const mounted = mountedBody(scene, record.id);
      expect(wallOf(mounted), record.id).toBe(record.wall);
    }
    expect(mountedBody(scene, "right-p25").name).toBe(
      RIGHT_CORNER_WRAPPER_NAME,
    );
    expect(wallOf(mountedBody(scene, "right-p25"))).toBe("A");
    expect(wallOf(mountedBody(scene, "right-p26"))).toBe("C");
  });

  it("tags every void group with the wall its id names", () => {
    expect(scene.voidsRoot.children.length).toBeGreaterThan(0);
    for (const group of scene.voidsRoot.children) {
      const idWall = String(group.userData["voidId"]).split("|")[0];
      expect(wallOf(group), String(group.userData["voidId"])).toBe(idWall);
    }
  });

  it("tags an outline and a mark with their target's wall: a body, a mirrored wrapper and a void", () => {
    const targets = [
      [mountedBody(scene, "c-upper"), "placement", "C"],
      [mountedBody(scene, "right-p25"), "placement", "A"],
      [mountedBody(scene, "right-p9"), "placement", "C"],
      [wallCVoid(scene), "void", "C"],
    ] as const;

    for (const [target, kind, wall] of targets) {
      expect(wallOf(outlineOn(scene, target, kind))).toBe(wall);
      expect(wallOf(markOn(scene, target))).toBe(wall);
    }
  });
});

// ------------------------------------------------------------------------------------------------
// Applying the cutaway through overlays built late and re-syncs.
// ------------------------------------------------------------------------------------------------

describe("the cutaway through overlays built while hidden and re-syncs after it", () => {
  it("hides an outline and a mark built on an already cut-away target once it runs again, and a restore shows them", () => {
    const scene = mountScene();
    applyCutaway(scene.solidsRoot, scene.voidsRoot, ["C"]);
    const target = mountedBody(scene, "c-upper");

    const lateOutline = outlineOn(scene, target, "placement");
    const lateMark = markOn(scene, target);
    const lateVoidOutline = outlineOn(scene, wallCVoid(scene), "void");
    applyCutaway(scene.solidsRoot, scene.voidsRoot, ["C"]);

    expect(target.visible).toBe(false);
    for (const overlay of [lateOutline, lateMark, lateVoidOutline]) {
      expect(overlay.visible, overlay.name).toBe(false);
    }
    expectDrawnExactlyOffWalls(scene, ["C"]);

    applyCutaway(scene.solidsRoot, scene.voidsRoot, []);

    expectDrawnExactlyOffWalls(scene, []);
  });

  it("leaves nothing in the wrong state when bodies and voids are re-synced under a cutaway and it runs again", () => {
    const scene = mountScene();
    applyCutaway(scene.solidsRoot, scene.voidsRoot, ["C"]);
    const moved: Design = {
      ...scene.design,
      placements: scene.design.placements.map((placement) =>
        placement.id === "c-tall" ? { ...placement, alongMm: 2250 } : placement,
      ),
    };

    syncScene(scene, moved);
    applyCutaway(scene.solidsRoot, scene.voidsRoot, ["C"]);

    expectDrawnExactlyOffWalls(scene, ["C"]);

    applyCutaway(scene.solidsRoot, scene.voidsRoot, ["B"]);

    expectDrawnExactlyOffWalls(scene, ["B"]);

    applyCutaway(scene.solidsRoot, scene.voidsRoot, []);

    expectDrawnExactlyOffWalls(scene, []);
  });

  it("keeps an unchanged body hidden across a re-sync, since the sync keeps the same object", () => {
    const scene = mountScene();
    applyCutaway(scene.solidsRoot, scene.voidsRoot, ["C"]);
    const hidden = mountedBody(scene, "c-upper");

    syncScene(scene, scene.design);

    expect(mountedBody(scene, "c-upper")).toBe(hidden);
    expect(hidden.visible).toBe(false);
  });

  it("never touches the shell, the wall planes or a body's own hidden handles", () => {
    const scene = mountScene();
    const before: boolean[] = [];
    const inside = (collect: (visible: boolean) => void) => {
      scene.solidsRoot.traverse((node) => {
        if (node.parent !== scene.solidsRoot && node !== scene.solidsRoot) {
          collect(node.visible);
        }
      });
    };
    inside((visible) => before.push(visible));

    applyCutaway(scene.solidsRoot, scene.voidsRoot, ["B", "C"]);
    applyCutaway(scene.solidsRoot, scene.voidsRoot, []);

    const after: boolean[] = [];
    inside((visible) => after.push(visible));
    expect(after).toEqual(before);
    const shell = required(
      scene.solidsRoot.children.find((c) => wallOf(c) === undefined),
      "the shell",
    );
    expect(shell.visible).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// Picking from a side preset in a real scene falls through the cut wall to the looked-at wall's void.
// ------------------------------------------------------------------------------------------------

describe("picking from the wallB preset falls through a cut-away wall C to wall B's own void", () => {
  function clickFromWallB(
    scene: Scene,
    aim: THREE.Vector3,
  ): string | undefined {
    const eye = new THREE.Vector3(
      ...findCameraPresetForRoom("wallB", scene.room).position,
    );
    const raycaster = createPickingRaycaster();
    raycaster.set(eye, aim.clone().sub(eye).normalize());
    return pick(raycaster, scene.solidsRoot, scene.voidsRoot)?.id;
  }

  /** The front of the wall-B void on the top row, at the wall's middle. */
  function wallBTopVoidFront(scene: Scene): {
    readonly id: string;
    readonly aim: THREE.Vector3;
  } {
    const topVoids = scene.voidsRoot.children.filter((group) => {
      const box = new THREE.Box3().setFromObject(group);
      return wallOf(group) === "B" && box.min.y > 2.1;
    });
    const nearestMiddle = required(
      [...topVoids].sort((a, b) => {
        const middle = scene.room.depthMm / 2000;
        return (
          Math.abs(a.position.z - middle) - Math.abs(b.position.z - middle)
        );
      })[0],
      "a wall-B top-row void",
    );
    const box = new THREE.Box3().setFromObject(nearestMiddle);
    const aim = box.getCenter(new THREE.Vector3()).setX(box.max.x);
    return { id: String(nearestMiddle.userData["voidId"]), aim };
  }

  it("selects wall B's top-row void past wall C's hidden upper, which takes the click without the cutaway", () => {
    const scene = mountScene();
    const eye = findCameraPresetForRoom("wallB", scene.room).position;
    const cut = cutawayWallsFor(eye, scene.room, CABINET_DEPTH_MM);
    applyCutaway(scene.solidsRoot, scene.voidsRoot, cut);
    const target = wallBTopVoidFront(scene);

    expect(cut).toEqual(["C"]);
    expect(clickFromWallB(scene, target.aim)).toBe(target.id);

    applyCutaway(scene.solidsRoot, scene.voidsRoot, []);

    expect(clickFromWallB(scene, target.aim)).toBe("c-upper");
  });

  it("selects wall B's base cabinet past wall C's hidden tall pantry, which takes the click without the cutaway", () => {
    const scene = mountScene();
    const eye = findCameraPresetForRoom("wallB", scene.room).position;
    applyCutaway(
      scene.solidsRoot,
      scene.voidsRoot,
      cutawayWallsFor(eye, scene.room, CABINET_DEPTH_MM),
    );
    const box = new THREE.Box3().setFromObject(mountedBody(scene, "b-base"));
    const aim = box.getCenter(new THREE.Vector3()).setX(box.max.x);

    expect(clickFromWallB(scene, aim)).toBe("b-base");

    applyCutaway(scene.solidsRoot, scene.voidsRoot, []);

    expect(clickFromWallB(scene, aim)).toBe("c-tall");
  });
});
