// M7B wave U4 round 3, adversarial QA (ADR 0132 A8.1 and A8.2; AC4 (d) and (e)).
//
// - A8.1's blocker case, 2700 / 1600 / 2400 from `wallC`, and its mirror from `wallB`: a tall pantry
//   or an upper at the other side wall's free end must not take the click on the looked-at wall's
//   top row. A negative control shows each blocker does take it without the cutaway.
// - A sweep over the approved range and the engine band: no line from a side preset's eye to its own
//   wall's top row (middle, ± 0.4 m, ± 0.8 m, three heights) crosses an uncut side zone.
// - Over-cutting: a side preset never cuts the wall it frames or wall A; `wallA` and the overview cut
//   nothing from A = 2000 up (A8.1 names A = 1800 and 1900 as the band where `wallA` cuts C).
// - The recorded cut set (A8.2) through repeated syncs, and through U → L → U on one stage when the
//   cut is re-applied for each room. The stale record an L inherits without that re-apply is
//   QA's open finding, kept out of this file.
import {
  buildKitchenLBodyCatalog,
  buildLShellDesign,
  buildUShellDesign,
  deriveRecordedColumns,
  derivePlacementRecords,
  recomputeVoids,
  toMetres,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyCutaway, cutawayWallsFor } from "../src/cutaway.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { syncSolidBodies, syncVoidMeshes } from "../src/scene-sync.js";
import { findCameraPresetForRoom, KITCHEN_TOP_M } from "../src/stage.js";
import { wallOf } from "../src/wall-tag.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";

const OCCURRED_AT = "2026-09-29T12:00:00.000Z";
const CABINET_DEPTH_MM = 600;
/** ADR 0108 H2's measured deepest floor bodies plus 7H's 50 mm, pinned independently of the source. */
const ZONE_M = { 600: 0.742 + 0.05, 700: 0.748 + 0.05 } as const;
/** How far in front of its wall a top-row body's front stands: the deepest top-row carcass is well
 *  under this, so a point here is on or just in front of the row the customer taps. */
const TOP_ROW_FRONT_M = 0.35;
const TOP_ROW_HEIGHTS_M = [2.2, 2.4, 2.6];
const ALONG_OFFSETS_M = [0, -0.4, 0.4, -0.8, 0.8];

beforeAll(() => {
  installHeadlessDocument();
});

function acceptedU(
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

type SideWall = "B" | "C";
const oppositeOf = (wall: SideWall): SideWall => (wall === "B" ? "C" : "B");
const presetOf = (wall: SideWall): "wallB" | "wallC" =>
  wall === "B" ? "wallB" : "wallC";
const runM = (room: DesignRoom, wall: SideWall): number =>
  (wall === "B" ? room.depthMm : required(room.wallCMm, "wallCMm")) / 1000;

// ------------------------------------------------------------------------------------------------
// A8.1's blocker case, clicked in a real scene.
// ------------------------------------------------------------------------------------------------

function seated(
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
    records: derivePlacementRecords(
      probe,
      buildKitchenLBodyCatalog(CABINET_DEPTH_MM),
    ),
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

const BLOCKERS = [
  ["a tall pantry", "tall-pantry-600", 0, 2200],
  ["an upper", "wall-2door-600", 1500, 700],
] as const;

/** The reviewer's room from `wallC`, and its mirror from `wallB`. The blocker stands at the other
 *  side wall's free end (its run's last 600 mm); the looked-at wall's top unit at its middle. */
const REVIEWER_CASES = [
  { lookedAt: "C", room: acceptedU(2700, 1600, 2400) },
  { lookedAt: "B", room: acceptedU(2700, 2400, 1600) },
] as const;

describe.each(REVIEWER_CASES)(
  "A8.1's case from the $lookedAt-side preset",
  ({ lookedAt, room }) => {
    const farWall = oppositeOf(lookedAt);

    it.each(BLOCKERS)(
      "cuts the other side wall and selects the top row past %s at its free end",
      (_name, buildId, y0Mm, heightMm) => {
        const kit = makeKit({ createCanvas: createHeadlessCanvas });
        const shell = buildUShellDesign({ room, occurredAt: OCCURRED_AT });
        const topAlongMm = Math.round((runM(room, lookedAt) * 1000) / 2);
        const design: Design = {
          ...shell,
          placements: [
            ...shell.placements,
            seated(kit, {
              id: "top",
              wall: lookedAt,
              alongMm: topAlongMm,
              y0Mm: 2200,
              buildId: "wall-2door-600-top",
              heightMm: 400,
            }),
            seated(kit, {
              id: "blocker",
              wall: farWall,
              alongMm: Math.round(runM(room, farWall) * 1000) - 300,
              y0Mm,
              buildId,
              heightMm,
            }),
          ],
        };
        const solidsRoot = new THREE.Group();
        const voidsRoot = new THREE.Group();
        const stageRoot = new THREE.Group();
        solidsRoot.add(buildKitchenShell(kit, room));
        stageRoot.add(solidsRoot, voidsRoot);
        syncSolidBodies({
          kit,
          solidsRoot,
          records: derivePlacementRecords(
            design,
            buildKitchenLBodyCatalog(CABINET_DEPTH_MM),
          ),
          room,
        });
        stageRoot.updateMatrixWorld(true);
        const top = required(
          solidsRoot.children.find((c) => c.userData["placementId"] === "top"),
          "top",
        );
        const box = new THREE.Box3().setFromObject(top);
        const aim = box
          .getCenter(new THREE.Vector3())
          .setX(lookedAt === "B" ? box.max.x : box.min.x);
        const eyeTuple = findCameraPresetForRoom(
          presetOf(lookedAt),
          room,
        ).position;
        const eye = new THREE.Vector3(...eyeTuple);
        const click = (): string | undefined => {
          const raycaster = createPickingRaycaster();
          raycaster.set(eye, aim.clone().sub(eye).normalize());
          return pick(raycaster, solidsRoot, voidsRoot)?.id;
        };

        expect(click(), "without the cutaway").toBe("blocker");

        const cut = cutawayWallsFor(eyeTuple, room, CABINET_DEPTH_MM);
        applyCutaway(solidsRoot, voidsRoot, cut);

        expect(cut).toEqual([farWall]);
        expect(click()).toBe("top");
      },
    );
  },
);

// ------------------------------------------------------------------------------------------------
// The sweep: no frame line from a side preset crosses an uncut side zone; no over-cutting.
// ------------------------------------------------------------------------------------------------

/** Wall B's or wall C's body zone as a box: the run's length, floor to the kitchen's top, the zone's
 *  depth from the plane (and everything behind it). */
function sideZoneBox(
  room: DesignRoom,
  wall: SideWall,
  zoneM: number,
): THREE.Box3 {
  const widthM = room.widthMm / 1000;
  const [minX, maxX] =
    wall === "B" ? [-1e3, zoneM] : [widthM - zoneM, widthM + 1e3];
  return new THREE.Box3(
    new THREE.Vector3(minX, 0, 0),
    new THREE.Vector3(maxX, KITCHEN_TOP_M, runM(room, wall)),
  );
}

function segmentCrossesBox(
  from: THREE.Vector3,
  to: THREE.Vector3,
  box: THREE.Box3,
): boolean {
  const length = from.distanceTo(to);
  const ray = new THREE.Ray(from, to.clone().sub(from).normalize());
  const hit = ray.intersectBox(box, new THREE.Vector3());
  return hit !== null && from.distanceTo(hit) < length;
}

function topRowPointsOf(room: DesignRoom, wall: SideWall): THREE.Vector3[] {
  const x =
    wall === "B" ? TOP_ROW_FRONT_M : room.widthMm / 1000 - TOP_ROW_FRONT_M;
  const run = runM(room, wall);
  return ALONG_OFFSETS_M.map((offset) => run / 2 + offset)
    .filter((z) => z >= 0 && z <= run)
    .flatMap((z) => TOP_ROW_HEIGHTS_M.map((y) => new THREE.Vector3(x, y, z)));
}

const anyU = (wallA: { readonly min: number; readonly max: number }) =>
  fc
    .record({
      widthMm: fc.integer(wallA),
      depthMm: fc.integer({ min: 1000, max: 6000 }),
      wallCMm: fc.integer({ min: 1000, max: 6000 }),
    })
    .map(({ widthMm, depthMm, wallCMm }) =>
      acceptedU(widthMm, depthMm, wallCMm),
    );

const APPROVED_WALL_A = { min: 2700, max: 6000 };
const ENGINE_BAND_WALL_A = { min: 1800, max: 2600 };

describe.each([
  ["the approved range", APPROVED_WALL_A],
  ["the engine band", ENGINE_BAND_WALL_A],
])("over %s", (_name, wallA) => {
  propertyTest.prop(
    [anyU(wallA), fc.constantFrom(600 as const, 700 as const)],
    { numRuns: 300 },
  )(
    "no line from a side preset to its own wall's top row crosses the other side wall's zone uncut",
    (room, depthMm) => {
      const crossings: string[] = [];
      for (const lookedAt of ["B", "C"] as const) {
        const farWall = oppositeOf(lookedAt);
        const eyeTuple = findCameraPresetForRoom(
          presetOf(lookedAt),
          room,
        ).position;
        if (cutawayWallsFor(eyeTuple, room, depthMm).includes(farWall)) {
          continue;
        }
        const eye = new THREE.Vector3(...eyeTuple);
        const zone = sideZoneBox(room, farWall, ZONE_M[depthMm]);
        for (const point of topRowPointsOf(room, lookedAt)) {
          if (segmentCrossesBox(eye, point, zone)) {
            crossings.push(`${lookedAt} → ${point.toArray().join(",")}`);
          }
        }
      }

      expect(crossings).toEqual([]);
    },
  );

  propertyTest.prop(
    [anyU(wallA), fc.constantFrom(600 as const, 700 as const)],
    { numRuns: 300 },
  )(
    "a side preset never cuts the wall it frames, nor wall A, whose fronts face it",
    (room, depthMm) => {
      for (const lookedAt of ["B", "C"] as const) {
        const cut = cutawayWallsFor(
          findCameraPresetForRoom(presetOf(lookedAt), room).position,
          room,
          depthMm,
        );

        expect(cut, presetOf(lookedAt)).not.toContain(lookedAt);
        expect(cut, presetOf(lookedAt)).not.toContain("A");
      }
    },
  );
});

describe("wallA and the overview cut nothing from A = 2000 up", () => {
  propertyTest.prop(
    [
      fc.record({
        widthMm: fc.integer({ min: 2000, max: 6300 }),
        depthMm: fc.integer({ min: 880, max: 6300 }),
        wallCMm: fc.integer({ min: 880, max: 6300 }),
        heightMm: fc.integer({ min: 2200, max: 3900 }),
      }),
      fc.constantFrom(600 as const, 700 as const),
    ],
    { numRuns: 400 },
  )("over the engine's U range from A = 2000", (dimensions, depthMm) => {
    const room = acceptedU(
      dimensions.widthMm,
      dimensions.depthMm,
      dimensions.wallCMm,
      dimensions.heightMm,
    );

    for (const id of ["wallA", "overview"] as const) {
      const eye = findCameraPresetForRoom(id, room).position;
      expect(cutawayWallsFor(eye, room, depthMm), id).toEqual([]);
    }
  });

  it.each([
    [1800, ["C"]],
    [1900, ["C"]],
    [2000, []],
  ] as const)(
    "A = %i: wallA cuts %j (A8.1: the eye stands in wall C's zone below W ≈ 1.91 m)",
    (widthMm, expected) => {
      const room = acceptedU(widthMm, 3000, 3000);
      const eye = findCameraPresetForRoom("wallA", room).position;

      expect(cutawayWallsFor(eye, room, CABINET_DEPTH_MM)).toEqual(expected);
      expect(
        cutawayWallsFor(
          findCameraPresetForRoom("overview", room).position,
          room,
          CABINET_DEPTH_MM,
        ),
      ).toEqual([]);
    },
  );
});

// ------------------------------------------------------------------------------------------------
// A8.2: the recorded cut set through syncs and shape switches on one stage.
// ------------------------------------------------------------------------------------------------

interface Stage {
  readonly kit: Kit;
  readonly room: THREE.Group;
  readonly solidsRoot: THREE.Group;
  readonly voidsRoot: THREE.Group;
}

function stageFor(room: DesignRoom): Stage {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  const stageRoom = new THREE.Group();
  const solidsRoot = new THREE.Group();
  const voidsRoot = new THREE.Group();
  solidsRoot.add(buildKitchenShell(kit, room));
  stageRoom.add(solidsRoot, voidsRoot);
  return { kit, room: stageRoom, solidsRoot, voidsRoot };
}

function show(stage: Stage, design: Design): void {
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(CABINET_DEPTH_MM),
  );
  syncSolidBodies({
    kit: stage.kit,
    solidsRoot: stage.solidsRoot,
    records,
    room: design.room,
  });
  syncVoidMeshes({
    voidsRoot: stage.voidsRoot,
    voids: recomputeVoids(
      records,
      deriveRecordedColumns(records, design, toMetres(design.room.widthMm)),
    ),
  });
}

function hiddenWalls(stage: Stage): string[] {
  const walls = new Set<string>();
  for (const object of [
    ...stage.solidsRoot.children,
    ...stage.voidsRoot.children,
  ]) {
    const wall = wallOf(object);
    if (wall !== undefined && !object.visible) walls.add(wall);
  }
  return [...walls].sort();
}

function drawnWalls(stage: Stage): string[] {
  const walls = new Set<string>();
  for (const object of [
    ...stage.solidsRoot.children,
    ...stage.voidsRoot.children,
  ]) {
    const wall = wallOf(object);
    if (wall !== undefined && object.visible) walls.add(wall);
  }
  return [...walls].sort();
}

const U_DESIGN = buildUShellDesign({
  room: acceptedU(3000, 3000, 3000),
  occurredAt: OCCURRED_AT,
});
const L_DESIGN = buildLShellDesign({
  room: { shape: "L", widthMm: 3000, depthMm: 3000, heightMm: 2600 },
  occurredAt: OCCURRED_AT,
});

describe("A8.2: the recorded cut set survives syncs", () => {
  it("keeps wall C cut, and only wall C, through five syncs that change bodies and voids", () => {
    const stage = stageFor(U_DESIGN.room);
    show(stage, U_DESIGN);
    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);

    for (let step = 0; step < 5; step += 1) {
      const trimmed: Design = {
        ...U_DESIGN,
        placements: U_DESIGN.placements.filter(
          (placement, index) => index % 5 !== step,
        ),
      };
      show(stage, step % 2 === 0 ? trimmed : U_DESIGN);

      expect(hiddenWalls(stage), `step ${String(step)}`).toEqual(["C"]);
      expect(drawnWalls(stage), `step ${String(step)}`).toEqual(["A", "B"]);
    }
  });

  it("keeps the cut set it was last given when it is replaced, not the one before", () => {
    const stage = stageFor(U_DESIGN.room);
    show(stage, U_DESIGN);
    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);
    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["B"]);

    show(stage, U_DESIGN);

    expect(hiddenWalls(stage)).toEqual(["B"]);
  });
});

describe("A8.2 through U → L → U, re-applied for each room's own eye", () => {
  it("cuts the U again, once it is re-applied for the U's own eye after the L", () => {
    const stage = stageFor(U_DESIGN.room);
    show(stage, U_DESIGN);
    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["B"]);
    show(stage, L_DESIGN);
    applyCutaway(
      stage.solidsRoot,
      stage.voidsRoot,
      cutawayWallsFor(
        findCameraPresetForRoom("wallB", L_DESIGN.room).position,
        L_DESIGN.room,
        CABINET_DEPTH_MM,
      ),
    );

    show(stage, U_DESIGN);
    expect(hiddenWalls(stage)).toEqual([]);

    applyCutaway(
      stage.solidsRoot,
      stage.voidsRoot,
      cutawayWallsFor(
        findCameraPresetForRoom("wallC", U_DESIGN.room).position,
        U_DESIGN.room,
        CABINET_DEPTH_MM,
      ),
    );
    expect(hiddenWalls(stage)).toEqual(["B"]);
  });
});
