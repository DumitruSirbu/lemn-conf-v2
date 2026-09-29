// M7B wave U4 fix, F2 and F3 (ADR 0132 Amendment A2, A8): which walls of a U the camera's eye stands
// in or behind, wherever along the wall, and hiding those walls without rebuilding anything.
//
// The zone the eye is tested against is the deepest floor-standing body the catalogue builds at the
// design's cabinet depth plus 7H's 50 mm clearance. The literals below (742 and 748 mm) are ADR 0108
// H2's *measured* answers, written here on purpose: the implementation reads them through
// `occupiedDepthOfEntryM`, and a test that read them the same way could not notice that path going
// wrong.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  buildUShellDesign,
  derivePlacementRecords,
  type Design,
  type DesignRoom,
  type DesignWall,
  type PlacementRecord,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  applyCutaway,
  cutawayWallsFor,
  EYE_CLEARANCE_M,
} from "../src/cutaway.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { buildOverflowMark } from "../src/overflow-mark.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { syncSolidBodies, syncVoidMeshes } from "../src/scene-sync.js";
import { buildSelectionOutline } from "../src/selection-outline.js";
import { isMesh } from "../src/three-guards.js";
import { wallOf } from "../src/wall-tag.js";
import {
  cameraPresetsForRoom,
  type CameraPresetId,
  type Vector3Tuple,
} from "../src/stage.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";

const OCCURRED_AT = "2026-09-29T12:00:00.000Z";

/** ADR 0108 H2, measured: the deepest floor-standing body's `occupiedDepthOfEntryM`, in metres. */
const DEEPEST_FLOOR_BODY_M = { 600: 0.742, 700: 0.748 } as const;
type CabinetDepthMm = keyof typeof DEEPEST_FLOOR_BODY_M;
const zoneM = (cabinetDepthMm: CabinetDepthMm): number =>
  DEEPEST_FLOOR_BODY_M[cabinetDepthMm] + EYE_CLEARANCE_M;

const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 4500,
  depthMm: 3000,
  wallCMm: 3600,
  heightMm: 2600,
};

/** Narrower than two zones, so one eye can stand in both walls' zones at once. */
const NARROW_U: DesignRoom = { ...U_ROOM, widthMm: 1400 };

beforeAll(() => {
  installHeadlessDocument();
});

describe("cutawayWallsFor: an L and a straight room never cut anything away", () => {
  it.each([
    ["L", { shape: "L", widthMm: 3700, depthMm: 3400, heightMm: 2600 }],
    [
      "straight",
      { shape: "linear", widthMm: 3700, depthMm: 3400, heightMm: 2600 },
    ],
  ] as const)(
    "%s: an eye behind wall B and one behind wall A's end both cut nothing",
    (_name, room) => {
      const behindWallB: Vector3Tuple = [-2, 1.3, 1];
      const inWallBZone: Vector3Tuple = [0.3, 1.3, 1];

      expect(cutawayWallsFor(behindWallB, room, 600)).toEqual([]);
      expect(cutawayWallsFor(inWallBZone, room, 600)).toEqual([]);
    },
  );
});

describe("cutawayWallsFor: a U cuts the side wall whose body zone the eye is in or behind", () => {
  const roomWidthM = U_ROOM.widthMm / 1000;

  it("cuts wall B for an eye behind its plane and cuts wall C for an eye behind wall C's", () => {
    expect(cutawayWallsFor([-1, 2, 1.5], U_ROOM, 600)).toEqual(["B"]);
    expect(cutawayWallsFor([roomWidthM + 1, 2, 1.5], U_ROOM, 600)).toEqual([
      "C",
    ]);
  });

  it("cuts nothing for an eye in the U's middle, in front of both zones", () => {
    expect(cutawayWallsFor([roomWidthM / 2, 2, 5], U_ROOM, 600)).toEqual([]);
  });

  it("cuts wall B for an eye inside the deepest body's front (742 mm) plus the clearance, and not beyond", () => {
    expect(cutawayWallsFor([0.79, 2, 1.5], U_ROOM, 600)).toEqual(["B"]);
    expect(cutawayWallsFor([0.795, 2, 1.5], U_ROOM, 600)).toEqual([]);
  });

  it("mirrors that zone on wall C", () => {
    expect(cutawayWallsFor([roomWidthM - 0.79, 2, 1.5], U_ROOM, 600)).toEqual([
      "C",
    ]);
    expect(cutawayWallsFor([roomWidthM - 0.795, 2, 1.5], U_ROOM, 600)).toEqual(
      [],
    );
  });

  it("reads the zone from the design's cabinet depth, never a fixed 742: an eye at 0.795 m is clear at 600 and inside at 700", () => {
    const eye: Vector3Tuple = [0.795, 2, 1.5];

    expect(cutawayWallsFor(eye, U_ROOM, 600)).toEqual([]);
    expect(cutawayWallsFor(eye, U_ROOM, 700)).toEqual(["B"]);
  });

  it("cuts wherever along the wall the eye is, past the run's end included (A8.1)", () => {
    const pastWallBEnd = U_ROOM.depthMm / 1000 + 0.1;
    const insideWallBRun = U_ROOM.depthMm / 1000 - 0.1;

    expect(cutawayWallsFor([-1, 2, pastWallBEnd], U_ROOM, 600)).toEqual(["B"]);
    expect(cutawayWallsFor([-1, 2, insideWallBRun], U_ROOM, 600)).toEqual([
      "B",
    ]);
    expect(cutawayWallsFor([-1, 2, 50], U_ROOM, 600)).toEqual(["B"]);
  });

  it("cuts wall B or wall C between the two runs' ends alike, whichever run is longer", () => {
    const betweenTheRuns = 3.3;

    expect(cutawayWallsFor([-1, 2, betweenTheRuns], U_ROOM, 600)).toEqual([
      "B",
    ]);
    expect(
      cutawayWallsFor(
        [U_ROOM.widthMm / 1000 + 1, 2, betweenTheRuns],
        U_ROOM,
        600,
      ),
    ).toEqual(["C"]);
  });

  it("cuts both walls when the eye stands in both zones, B first", () => {
    expect(cutawayWallsFor([0.7, 2, 1.5], NARROW_U, 600)).toEqual(["B", "C"]);
  });

  it("refuses a cabinet depth the catalogue is not declared at, rather than guessing a zone", () => {
    expect(() => cutawayWallsFor([0.5, 2, 1], U_ROOM, 650)).toThrow();
  });
});

describe("cutawayWallsFor over the approved U range", () => {
  const OWN_WALL_OF: Partial<Record<CameraPresetId, DesignWall>> = {
    wallB: "B",
    wallC: "C",
  };
  const approvedU = fc.record({
    shape: fc.constant("U" as const),
    widthMm: fc.integer({ min: 2700, max: 6000 }),
    depthMm: fc.integer({ min: 1000, max: 6000 }),
    wallCMm: fc.integer({ min: 1000, max: 6000 }),
    heightMm: fc.integer({ min: 2200, max: 3900 }),
  });
  const cabinetDepth = fc.constantFrom<CabinetDepthMm>(600, 700);

  function isInZoneOf(
    wall: "B" | "C",
    eye: Vector3Tuple,
    room: DesignRoom,
    depth: CabinetDepthMm,
  ): boolean {
    const [x, , z] = eye;
    const runMm = wall === "B" ? room.depthMm : (room.wallCMm ?? 0);
    const distanceFromPlaneM = wall === "B" ? x : room.widthMm / 1000 - x;
    return z <= runMm / 1000 && distanceFromPlaneM < zoneM(depth);
  }

  propertyTest.prop([approvedU, cabinetDepth], { numRuns: 300 })(
    "every preset's eye is outside every run that is drawn, overview and wallA cut nothing, and a preset never cuts its own wall",
    (room, depth) => {
      for (const preset of cameraPresetsForRoom(room)) {
        const cutAway = cutawayWallsFor(preset.position, room, depth);

        for (const wall of ["B", "C"] as const) {
          const isDrawn = !cutAway.includes(wall);
          expect(
            isDrawn && isInZoneOf(wall, preset.position, room, depth),
            `${preset.id} stands in wall ${wall}'s zone and it is drawn`,
          ).toBe(false);
        }
        if (preset.id === "overview" || preset.id === "wallA") {
          expect(cutAway, preset.id).toEqual([]);
        }
        const ownWall = OWN_WALL_OF[preset.id];
        if (ownWall !== undefined) {
          expect(cutAway, preset.id).not.toContain(ownWall);
        }
      }
    },
  );

  it("cuts the far side wall at the two ends of the range where the eye is most exposed", () => {
    const narrowest = { ...U_ROOM, widthMm: 2700 };
    const widest = { ...U_ROOM, widthMm: 6000 };
    const wallB = (room: DesignRoom) =>
      required(
        cameraPresetsForRoom(room).find((p) => p.id === "wallB"),
        "wallB",
      );

    expect(cutawayWallsFor(wallB(narrowest).position, narrowest, 600)).toEqual([
      "C",
    ]);
    expect(cutawayWallsFor(wallB(widest).position, widest, 600)).toEqual([]);
  });
});

describe("cutawayWallsFor: wall A is cut like the others, from its own plane z = 0 and along its run x = 0..W (A2)", () => {
  const widthM = U_ROOM.widthMm / 1000;

  it("cuts A for an eye inside its zone, level with its run", () => {
    expect(cutawayWallsFor([1.5, 1.3, 0.3], U_ROOM, 600)).toEqual(["A"]);
    expect(cutawayWallsFor([1.5, 1.3, 0.79], U_ROOM, 600)).toEqual(["A"]);
    expect(cutawayWallsFor([1.5, 1.3, 0.795], U_ROOM, 600)).toEqual([]);
  });

  it("cuts A for an eye behind its plane, level with its run", () => {
    expect(cutawayWallsFor([1.5, 1.3, -2], U_ROOM, 600)).toEqual(["A"]);
  });

  it("reads A's zone from the cabinet depth: an eye at z = 0.795 is clear at 600 and inside at 700", () => {
    expect(cutawayWallsFor([1.5, 1.3, 0.795], U_ROOM, 600)).toEqual([]);
    expect(cutawayWallsFor([1.5, 1.3, 0.795], U_ROOM, 700)).toEqual(["A"]);
  });

  it("cuts A wherever along it the eye is, beyond either end of its run included (A8.1)", () => {
    for (const x of [-0.5, 0.1, widthM - 0.1, widthM + 0.5]) {
      expect(
        cutawayWallsFor([x, 1.3, 0.3], U_ROOM, 600),
        `x = ${String(x)}`,
      ).toContain("A");
    }
  });

  it("cuts A together with a side wall where the eye stands in both zones, in A, B, C order", () => {
    expect(cutawayWallsFor([0.3, 1.3, 0.3], U_ROOM, 600)).toEqual(["A", "B"]);
    expect(cutawayWallsFor([widthM - 0.3, 1.3, 0.3], U_ROOM, 600)).toEqual([
      "A",
      "C",
    ]);
  });

  it("an eye behind wall A that is also in a side wall's zone cuts both, since a side wall has no run bound", () => {
    expect(cutawayWallsFor([-1, 1.3, -2], U_ROOM, 600)).toEqual(["A", "B"]);
    expect(cutawayWallsFor([widthM + 1, 1.3, -2], U_ROOM, 600)).toEqual([
      "A",
      "C",
    ]);
    expect(cutawayWallsFor([0.3, 1.3, -0.1], U_ROOM, 600)).toEqual(["A", "B"]);
    expect(cutawayWallsFor([-1, 1.3, 0], U_ROOM, 600)).toEqual(["A", "B"]);
  });

  it.each([
    ["L", { shape: "L", widthMm: 3700, depthMm: 3400, heightMm: 2600 }],
    [
      "straight",
      { shape: "linear", widthMm: 3700, depthMm: 3400, heightMm: 2600 },
    ],
  ] as const)(
    "%s: an eye in or behind wall A's zone still cuts nothing",
    (_n, room) => {
      expect(cutawayWallsFor([1.5, 1.3, 0.3], room, 600)).toEqual([]);
      expect(cutawayWallsFor([1.5, 1.3, -2], room, 600)).toEqual([]);
    },
  );
});

describe("the presets' cut sets (A8.1)", () => {
  const ids = ["overview", "wallA", "wallB", "wallC"] as const;
  const cutSetOf = (room: DesignRoom, id: CameraPresetId): DesignWall[] => {
    const preset = required(
      cameraPresetsForRoom(room).find((p) => p.id === id),
      id,
    );
    return [...cutawayWallsFor(preset.position, room, 600)];
  };
  const uRoom = (widthMm: number, depthMm: number, wallCMm: number) =>
    ({ shape: "U", widthMm, depthMm, wallCMm, heightMm: 2600 }) as const;
  const approvedU = fc.record({
    shape: fc.constant("U" as const),
    widthMm: fc.integer({ min: 2700, max: 6000 }),
    depthMm: fc.integer({ min: 1000, max: 6000 }),
    wallCMm: fc.integer({ min: 1000, max: 6000 }),
    heightMm: fc.integer({ min: 2200, max: 3900 }),
  });

  it.each([
    ["3000 x 3000 x 3000", uRoom(3000, 3000, 3000), [[], [], ["C"], ["B"]]],
    ["2700 x 1600 x 1600", uRoom(2700, 1600, 1600), [[], [], ["C"], ["B"]]],
    ["4500 x 3000 x 3600", uRoom(4500, 3000, 3600), [[], [], ["C"], ["B"]]],
    ["6000 x 3000 x 3000", uRoom(6000, 3000, 3000), [[], [], [], []]],
    [
      "2700 x 1600 x 2400: wallC's eye is past wall B's run end, and B is cut all the same",
      uRoom(2700, 1600, 2400),
      [[], [], ["C"], ["B"]],
    ],
    [
      "2700 x 2400 x 1600: the mirror",
      uRoom(2700, 2400, 1600),
      [[], [], ["C"], ["B"]],
    ],
  ] as const)(
    "%s: overview, wallA, wallB and wallC cut %j",
    (_n, room, cuts) => {
      expect(ids.map((id) => cutSetOf(room, id))).toEqual(cuts);
    },
  );

  it("in the engine band wallA's eye is inside wall C's zone below A = 1910 and clear of it from 2000", () => {
    expect(cutSetOf(uRoom(1800, 1000, 1000), "wallA")).toEqual(["C"]);
    expect(cutSetOf(uRoom(1900, 1000, 1000), "wallA")).toEqual(["C"]);
    expect(cutSetOf(uRoom(2000, 1000, 1000), "wallA")).toEqual([]);
  });

  it.each([1000, 3000, 6000])(
    "wallA and the overview cut nothing from A = 2000 to the approved range's end, at B = C = %i",
    (sideMm) => {
      for (let widthMm = 2000; widthMm <= 6000; widthMm += 100) {
        const room = uRoom(widthMm, sideMm, sideMm);

        expect(cutSetOf(room, "wallA"), `A = ${String(widthMm)}`).toEqual([]);
        expect(cutSetOf(room, "overview"), `A = ${String(widthMm)}`).toEqual(
          [],
        );
      }
    },
  );

  /** The zone-only rule stated afresh: a wall is cut when the eye is nearer than a zone to its plane
   *  or behind it, and nothing else. */
  function zoneOnlyCutSet(
    eye: Vector3Tuple,
    room: DesignRoom,
    depth: CabinetDepthMm,
  ): DesignWall[] {
    const [x, , z] = eye;
    const distances: readonly (readonly [DesignWall, number])[] = [
      ["A", z],
      ["B", x],
      ["C", room.widthMm / 1000 - x],
    ];
    return distances
      .filter(([, distanceM]) => distanceM < zoneM(depth))
      .map(([wall]) => wall);
  }

  propertyTest.prop([approvedU, fc.constantFrom<CabinetDepthMm>(600, 700)], {
    numRuns: 300,
  })(
    "across the approved range every preset's cut set is the zone-only rule's, and no preset ever cuts A",
    (room, depth) => {
      for (const preset of cameraPresetsForRoom(room)) {
        const cutAway = [...cutawayWallsFor(preset.position, room, depth)];

        expect(cutAway, preset.id).toEqual(
          zoneOnlyCutSet(preset.position, room, depth),
        );
        expect(cutAway, preset.id).not.toContain("A");
      }
    },
  );
});

describe("sight lines from a side preset to its top row cross no uncut wall's zone (A8.1)", () => {
  /** A top-row point on the subject wall: 0.4 m in front of its plane, at the row's middle height. */
  const TOP_ROW_FRONT_M = 0.4;
  const TOP_ROW_MIDDLE_HEIGHT_M = 2.4;
  const OFFSETS_ALONG_M = [-0.8, -0.4, 0, 0.4, 0.8] as const;

  const uRoom = (widthMm: number, depthMm: number, wallCMm: number) =>
    ({ shape: "U", widthMm, depthMm, wallCMm, heightMm: 2600 }) as const;
  const approvedU = fc.record({
    shape: fc.constant("U" as const),
    widthMm: fc.integer({ min: 2700, max: 6000 }),
    depthMm: fc.integer({ min: 1000, max: 6000 }),
    wallCMm: fc.integer({ min: 1000, max: 6000 }),
    heightMm: fc.integer({ min: 2200, max: 3900 }),
  });

  /** Whether the segment eye -> point passes through the zone box of the far side wall: from its
   *  plane out to one zone's depth in front, over the wall's run, floor to the kitchen's top. Slab
   *  test; the box is open behind the plane, where an eye may stand. */
  function crossesZoneBox(
    eye: Vector3Tuple,
    point: Vector3Tuple,
    farWall: "B" | "C",
    room: DesignRoom,
    depth: CabinetDepthMm,
  ): boolean {
    const widthM = room.widthMm / 1000;
    const runM = (farWall === "B" ? room.depthMm : (room.wallCMm ?? 0)) / 1000;
    const xRange =
      farWall === "B"
        ? [-Infinity, zoneM(depth)]
        : [widthM - zoneM(depth), Infinity];
    const box: readonly (readonly [number, number])[] = [
      [xRange[0] ?? 0, xRange[1] ?? 0],
      [0, 2.6],
      [0, runM],
    ];
    let [tEnter, tLeave] = [0, 1];
    for (const axis of [0, 1, 2] as const) {
      const [low, high] = required(box[axis], "box axis");
      const from = eye[axis];
      const delta = point[axis] - from;
      if (delta === 0) {
        if (from < low || from > high) return false;
        continue;
      }
      const [t1, t2] = [(low - from) / delta, (high - from) / delta];
      tEnter = Math.max(tEnter, Math.min(t1, t2));
      tLeave = Math.min(tLeave, Math.max(t1, t2));
    }
    return tEnter <= tLeave;
  }

  function expectNoUncutZoneCrossed(
    room: DesignRoom,
    depth: CabinetDepthMm,
  ): void {
    const widthM = room.widthMm / 1000;
    for (const [id, subject, farWall] of [
      ["wallB", "B", "C"],
      ["wallC", "C", "B"],
    ] as const) {
      const eye = required(
        cameraPresetsForRoom(room).find((p) => p.id === id),
        id,
      ).position;
      const cutAway = cutawayWallsFor(eye, room, depth);
      const runM =
        (subject === "B" ? room.depthMm : (room.wallCMm ?? 0)) / 1000;
      const frontX =
        subject === "B" ? TOP_ROW_FRONT_M : widthM - TOP_ROW_FRONT_M;
      for (const offsetM of OFFSETS_ALONG_M) {
        const alongM = runM / 2 + offsetM;
        if (alongM < 0 || alongM > runM) continue;
        const point: Vector3Tuple = [frontX, TOP_ROW_MIDDLE_HEIGHT_M, alongM];

        expect(
          cutAway.includes(farWall) ||
            !crossesZoneBox(eye, point, farWall, room, depth),
          `${id} to ${String(offsetM)} m: crosses wall ${farWall}'s zone and it is drawn`,
        ).toBe(true);
      }
    }
  }

  propertyTest.prop([approvedU, fc.constantFrom<CabinetDepthMm>(600, 700)], {
    numRuns: 250,
    examples: [
      [uRoom(2700, 1600, 2400), 600],
      [uRoom(2700, 2400, 1600), 600],
      [uRoom(2700, 1000, 6000), 600],
      [uRoom(3000, 6000, 1000), 700],
    ],
  })(
    "from wallB and wallC, over the approved range and at the free-end rooms A8.1 names",
    (room, depth) => {
      expectNoUncutZoneCrossed(room, depth);
    },
  );

  it("a segment through a zone box is detected: the wallC eye of 2700 x 1600 x 2400, if wall B were not cut", () => {
    const room = uRoom(2700, 1600, 2400);
    const eye = required(
      cameraPresetsForRoom(room).find((p) => p.id === "wallC"),
      "wallC",
    ).position;
    const point: Vector3Tuple = [2.7 - TOP_ROW_FRONT_M, 2.4, 1.2];

    expect(crossesZoneBox(eye, point, "B", room, 600)).toBe(true);
  });
});

describe("applyCutaway", () => {
  interface Stage {
    readonly kit: Kit;
    readonly records: readonly PlacementRecord[];
    readonly stageRoot: THREE.Group;
    readonly solidsRoot: THREE.Group;
    readonly voidsRoot: THREE.Group;
    /** Everything the cutaway may hide: mounted bodies, void groups, and the two overlays. */
    readonly cuttable: readonly THREE.Object3D[];
  }

  const VOIDS: readonly VoidRecord[] = (["A", "B", "C"] as const).map(
    (wall, index) => ({
      id: `${wall}|void`,
      col: `${wall}|col`,
      wall,
      x: 1 + index,
      z: 1,
      ry: 0,
      w: 0.6,
      d: 0.6,
      y0: 0,
      h: 0.8,
      spanY0: 0,
      spanH: 0.8,
    }),
  );

  function mountStage(): Stage {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const shell = buildUShellDesign({ room: U_ROOM, occurredAt: OCCURRED_AT });
    const design: Design = { ...shell, placements: [...shell.placements] };
    const records = derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(600),
    );
    const stageRoot = new THREE.Group();
    const solidsRoot = new THREE.Group();
    const voidsRoot = new THREE.Group();
    solidsRoot.add(buildKitchenShell(kit, U_ROOM));
    stageRoot.add(solidsRoot, voidsRoot);
    syncSolidBodies({ kit, solidsRoot, records, room: U_ROOM });
    syncVoidMeshes({ voidsRoot, voids: VOIDS });
    stageRoot.updateMatrixWorld(true);

    const overlayOn = (placementId: string) => {
      const target = required(
        solidsRoot.children.find(
          (c) => c.userData["placementId"] === placementId,
        ),
        placementId,
      );
      return target;
    };
    const wallCOutline = buildSelectionOutline({
      target: overlayOn("right-p26"),
      parent: stageRoot,
      kind: "placement",
    }).group;
    const wallCMark = buildOverflowMark({
      target: overlayOn("right-p9"),
      parent: stageRoot,
    }).group;
    const wallAOutline = buildSelectionOutline({
      target: overlayOn("right-p25"),
      parent: stageRoot,
      kind: "placement",
    }).group;
    stageRoot.add(wallCOutline, wallCMark, wallAOutline);

    const cuttable = [
      ...solidsRoot.children,
      ...voidsRoot.children,
      wallCOutline,
      wallCMark,
      wallAOutline,
    ].filter((object) => wallOf(object) !== undefined);
    return { kit, records, stageRoot, solidsRoot, voidsRoot, cuttable };
  }

  const visibilityOf = (objects: readonly THREE.Object3D[]): boolean[] =>
    objects.map((object) => object.visible);

  function isDrawn(object: THREE.Object3D): boolean {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      if (!o.visible) return false;
    }
    return true;
  }

  const objectsOn = (stage: Stage, wall: DesignWall): THREE.Object3D[] =>
    stage.cuttable.filter((object) => wallOf(object) === wall);

  it("keys every kind of object to a wall: bodies, void groups, the outline and the mark", () => {
    const stage = mountStage();

    for (const wall of ["A", "B", "C"] as const) {
      expect(objectsOn(stage, wall).length, `wall ${wall}`).toBeGreaterThan(0);
    }
    const onWallC = objectsOn(stage, "C");
    expect(onWallC.some((o) => o.userData["placementId"] !== undefined)).toBe(
      true,
    );
    expect(onWallC.some((o) => o.userData["voidId"] !== undefined)).toBe(true);
    expect(onWallC.some((o) => o.name === "selection_outline")).toBe(true);
    expect(onWallC.some((o) => o.name === "overflow_mark")).toBe(true);
  });

  it('under ["C"] nothing keyed to wall C is drawn, and everything else still is', () => {
    const stage = mountStage();

    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);

    for (const object of objectsOn(stage, "C")) {
      expect(isDrawn(object), object.name || "a wall-C body").toBe(false);
    }
    for (const wall of ["A", "B"] as const) {
      for (const object of objectsOn(stage, wall)) {
        expect(isDrawn(object), `wall ${wall}: ${object.name}`).toBe(true);
      }
    }
  });

  it("never cuts the right X-leg with a wall-C cut: it stands on wall A", () => {
    const stage = mountStage();
    const xLeg = required(
      stage.solidsRoot.children.find(
        (c) => c.userData["placementId"] === "right-p25",
      ),
      "right-p25",
    );

    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);

    expect(wallOf(xLeg)).toBe("A");
    expect(xLeg.visible).toBe(true);
  });

  it("applying and then restoring leaves every visible flag as it was", () => {
    const stage = mountStage();
    const before = visibilityOf(stage.cuttable);

    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["B", "C"]);
    expect(visibilityOf(stage.cuttable)).not.toEqual(before);
    applyCutaway(stage.solidsRoot, stage.voidsRoot, []);

    expect(visibilityOf(stage.cuttable)).toEqual(before);
  });

  it("moves from one cut set to another by showing what left it and hiding what entered it", () => {
    const stage = mountStage();

    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["B"]);
    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);

    for (const object of objectsOn(stage, "B"))
      expect(object.visible, `B ${object.name}`).toBe(true);
    for (const object of objectsOn(stage, "C"))
      expect(object.visible, `C ${object.name}`).toBe(false);
  });

  it("is idempotent: the same cut set twice, and a restore twice, change nothing more", () => {
    const stage = mountStage();

    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);
    const once = visibilityOf(stage.cuttable);
    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);
    expect(visibilityOf(stage.cuttable)).toEqual(once);

    applyCutaway(stage.solidsRoot, stage.voidsRoot, []);
    const restored = visibilityOf(stage.cuttable);
    applyCutaway(stage.solidsRoot, stage.voidsRoot, []);
    expect(visibilityOf(stage.cuttable)).toEqual(restored);
    expect(restored.every(Boolean)).toBe(true);
  });

  it("does not show what was already hidden for another reason when it restores", () => {
    const stage = mountStage();
    const alreadyHidden = required(objectsOn(stage, "C")[0], "a wall-C object");
    alreadyHidden.visible = false;

    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);
    applyCutaway(stage.solidsRoot, stage.voidsRoot, []);

    expect(alreadyHidden.visible).toBe(false);
  });

  it("rebuilds and disposes nothing: the same objects stay mounted and no geometry is disposed", () => {
    const stage = mountStage();
    const mountedBefore = [
      ...stage.solidsRoot.children,
      ...stage.voidsRoot.children,
      ...stage.stageRoot.children,
    ];
    let disposals = 0;
    stage.stageRoot.traverse((node) => {
      if (isMesh(node))
        node.geometry.addEventListener("dispose", () => (disposals += 1));
    });

    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["B", "C"]);
    applyCutaway(stage.solidsRoot, stage.voidsRoot, []);

    expect([
      ...stage.solidsRoot.children,
      ...stage.voidsRoot.children,
      ...stage.stageRoot.children,
    ]).toEqual(mountedBefore);
    expect(disposals).toBe(0);
  });

  it("leaves the room shell alone: it stands on no wall", () => {
    const stage = mountStage();
    const shell = required(
      stage.solidsRoot.children.find((c) => wallOf(c) === undefined),
      "the shell",
    );

    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["B", "C"]);

    expect(shell.visible).toBe(true);
  });

  it('under ["A"] both X-legs, wall A\'s outline and nothing on B or C are hidden', () => {
    const stage = mountStage();

    applyCutaway(stage.solidsRoot, stage.voidsRoot, ["A"]);

    for (const id of ["p25", "right-p25"]) {
      const xLeg = required(
        stage.solidsRoot.children.find((c) => c.userData["placementId"] === id),
        id,
      );
      expect(wallOf(xLeg), id).toBe("A");
      expect(xLeg.visible, id).toBe(false);
    }
    for (const wall of ["B", "C"] as const) {
      for (const object of objectsOn(stage, wall)) {
        expect(isDrawn(object), `wall ${wall}: ${object.name}`).toBe(true);
      }
    }
    for (const object of objectsOn(stage, "A")) {
      expect(isDrawn(object), object.name || "a wall-A body").toBe(false);
    }
  });

  describe("the cut set survives a sync (A8.2)", () => {
    /** The void set as after an edit: wall C's void is a different size, so the sync replaces all of
     *  them. */
    const editedVoids = VOIDS.map((v) => ({ ...v, h: v.h + 0.1 }));

    function pickVoidAt(
      stage: Stage,
      x: number,
      z: number,
    ): string | undefined {
      stage.stageRoot.updateMatrixWorld(true);
      const raycaster = createPickingRaycaster();
      raycaster.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
      return pick(raycaster, new THREE.Group(), stage.voidsRoot)?.id;
    }

    it('with ["C"] applied, a void sync leaves wall C\'s voids not drawn and not pickable, and the others drawn', () => {
      const stage = mountStage();
      applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);

      syncVoidMeshes({ voidsRoot: stage.voidsRoot, voids: editedVoids });

      expect(
        stage.voidsRoot.children.map((g) => [wallOf(g), g.visible]),
      ).toEqual([
        ["A", true],
        ["B", true],
        ["C", false],
      ]);
      expect(pickVoidAt(stage, 3, 1)).toBeUndefined();
      expect(pickVoidAt(stage, 2, 1)).toBe("B|void");
    });

    it('with ["C"] applied, a body sync that remounts a wall-C body leaves it not drawn and not pickable', () => {
      const stage = mountStage();
      const keptRecords = stage.records.filter((r) => r.id !== "right-p26");
      syncSolidBodies({
        kit: stage.kit,
        solidsRoot: stage.solidsRoot,
        records: keptRecords,
        room: U_ROOM,
      });
      applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);

      syncSolidBodies({
        kit: stage.kit,
        solidsRoot: stage.solidsRoot,
        records: stage.records,
        room: U_ROOM,
      });

      const remounted = required(
        stage.solidsRoot.children.find(
          (c) => c.userData["placementId"] === "right-p26",
        ),
        "the remounted right-p26",
      );
      expect(wallOf(remounted)).toBe("C");
      expect(isDrawn(remounted)).toBe(false);
      for (const wallCBody of stage.solidsRoot.children.filter(
        (c) => wallOf(c) === "C",
      )) {
        expect(
          isDrawn(wallCBody),
          String(wallCBody.userData["placementId"]),
        ).toBe(false);
      }
      const wallBBody = required(
        stage.solidsRoot.children.find((c) => wallOf(c) === "B"),
        "a wall-B body",
      );
      expect(isDrawn(wallBBody)).toBe(true);
    });

    it("with [] applied, both syncs leave everything drawn", () => {
      const stage = mountStage();
      applyCutaway(stage.solidsRoot, stage.voidsRoot, ["C"]);
      applyCutaway(stage.solidsRoot, stage.voidsRoot, []);

      syncVoidMeshes({ voidsRoot: stage.voidsRoot, voids: editedVoids });
      syncSolidBodies({
        kit: stage.kit,
        solidsRoot: stage.solidsRoot,
        records: stage.records.filter((r) => r.id !== "right-p26"),
        room: U_ROOM,
      });
      syncSolidBodies({
        kit: stage.kit,
        solidsRoot: stage.solidsRoot,
        records: stage.records,
        room: U_ROOM,
      });

      for (const object of [
        ...stage.solidsRoot.children,
        ...stage.voidsRoot.children,
      ]) {
        expect(isDrawn(object), object.name).toBe(true);
      }
    });

    it("a wall that leaves the cut set comes back through the next sync as well as through applyCutaway", () => {
      const stage = mountStage();
      applyCutaway(stage.solidsRoot, stage.voidsRoot, ["B", "C"]);
      applyCutaway(stage.solidsRoot, stage.voidsRoot, ["B"]);

      syncVoidMeshes({ voidsRoot: stage.voidsRoot, voids: editedVoids });

      expect(
        stage.voidsRoot.children.map((g) => [wallOf(g), g.visible]),
      ).toEqual([
        ["A", true],
        ["B", false],
        ["C", true],
      ]);
    });
  });

  it("works when the two roots have no common parent yet", () => {
    const solidsRoot = new THREE.Group();
    const voidsRoot = new THREE.Group();
    syncVoidMeshes({ voidsRoot, voids: VOIDS });

    applyCutaway(solidsRoot, voidsRoot, ["C"]);

    expect(voidsRoot.children.map((g) => [wallOf(g), g.visible])).toEqual([
      ["A", true],
      ["B", true],
      ["C", false],
    ]);
  });
});
