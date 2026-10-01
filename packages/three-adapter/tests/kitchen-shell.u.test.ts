// M7B wave U4 slice S1 (D11, D12; acceptance criteria 6 and 7): the shell of a U.
//
// Wall C's plane stands at x = W and is visible only for a U; the floor reaches the farther of walls
// B and C; the drawn-room signature knows the shape and C; a U seats no run-end panel; and none of it
// changes a shell that is not a U. The U rooms are the domain's own — `buildUShellDesign`'s `room` —
// so the shell is drawn for a room the product accepts, never for one written to suit the adapter.
import {
  buildKitchenLBodyCatalog,
  buildUShellDesign,
  derivePlacementRecords,
  runEndPanelSeatM,
  type DesignRoom,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { disposeKitAndStage } from "../src/kit-disposal.js";
import {
  buildKitchenShell,
  resizeShellToRoom,
  syncRunEndPanel,
} from "../src/kitchen-shell.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createLightRig } from "../src/stage.js";
import { isMesh, toMaterials } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import {
  NON_U_SHELLS_BEFORE_WALL_C,
  type RecordedShellChild,
} from "./support/non-u-shells-before-wall-c.js";
import { describeStructure } from "./support/structure.js";
import { OCCURRED_AT } from "./support/u-scene.js";

/** Ruled fixed at 300 mm and written out here rather than imported, as the neighbouring shell suites
 *  do: a constant read from the module under test would agree with itself. */
const CORNER_OVERHANG_M = 0.3;
const WALL_C_NAME = "wall_right";

beforeAll(() => {
  installHeadlessDocument();
});

function uRoom(dimensions: {
  readonly wallAMm: number;
  readonly wallBMm: number;
  readonly wallCMm: number;
  readonly heightMm: number;
}): DesignRoom {
  const design = buildUShellDesign({
    room: {
      shape: "U",
      widthMm: dimensions.wallAMm,
      depthMm: dimensions.wallBMm,
      wallCMm: dimensions.wallCMm,
      heightMm: dimensions.heightMm,
    },
    occurredAt: OCCURRED_AT,
  });
  return design.room;
}

const U_ROOM = uRoom({
  wallAMm: 4500,
  wallBMm: 3000,
  wallCMm: 3600,
  heightMm: 2600,
});
const L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 3700,
  depthMm: 3400,
  heightMm: 2600,
};
const LINEAR_ROOM: DesignRoom = { ...L_ROOM, shape: "linear" };
const ODD_L_ROOM: DesignRoom = {
  shape: "L",
  widthMm: 2313,
  depthMm: 4127,
  heightMm: 2401,
};

interface BuiltShell {
  readonly kit: Kit;
  readonly shell: THREE.Group;
}

function shellFor(room: DesignRoom): BuiltShell {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  return { kit, shell: buildKitchenShell(kit, room) };
}

function meshNamed(shell: THREE.Object3D, name: string): THREE.Mesh {
  const child = shell.children.find((candidate) => candidate.name === name);
  if (!child || !isMesh(child)) throw new Error(`No shell mesh named ${name}`);
  return child;
}

function planeParameters(plane: THREE.Mesh): {
  readonly width: number;
  readonly height: number;
} {
  return (plane.geometry as THREE.PlaneGeometry).parameters;
}

function floorExtentAlongZ(shell: THREE.Group): {
  readonly min: number;
  readonly max: number;
} {
  shell.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(meshNamed(shell, "floor"));
  return { min: box.min.z, max: box.max.z };
}

describe("wall C's plane (D12)", () => {
  it("stands at x = W, spans the A∩C corner's overhang and C, and is as tall as the room", () => {
    const { shell } = shellFor(U_ROOM);
    const plane = meshNamed(shell, WALL_C_NAME);

    expect(plane.visible).toBe(true);
    expect(plane.position.x).toBeCloseTo(U_ROOM.widthMm / 1000, 6);
    expect(plane.position.y).toBeCloseTo(U_ROOM.heightMm / 2000, 6);
    expect(planeParameters(plane).width).toBeCloseTo(
      required(U_ROOM.wallCMm, "wallCMm") / 1000 + CORNER_OVERHANG_M,
      6,
    );
    expect(planeParameters(plane).height).toBeCloseTo(
      U_ROOM.heightMm / 1000,
      6,
    );
  });

  it("spans z from one overhang behind the A∩C corner to the end of C", () => {
    const { shell } = shellFor(U_ROOM);
    shell.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(meshNamed(shell, WALL_C_NAME));

    expect(box.min.z).toBeCloseTo(-CORNER_OVERHANG_M, 6);
    expect(box.max.z).toBeCloseTo(
      required(U_ROOM.wallCMm, "wallCMm") / 1000,
      6,
    );
  });

  it("fronts −X, into the room, at world yaw −π/2", () => {
    const { shell } = shellFor(U_ROOM);
    const plane = meshNamed(shell, WALL_C_NAME);
    shell.updateWorldMatrix(true, true);

    const frontNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(
      plane.getWorldQuaternion(new THREE.Quaternion()),
    );

    expect(plane.rotation.y).toBeCloseTo(-Math.PI / 2, 6);
    expect(frontNormal.x).toBeCloseTo(-1, 6);
    expect(frontNormal.z).toBeCloseTo(0, 6);
  });

  it("is wall B's paint, one-sided: no shell material is DoubleSide", () => {
    const { shell } = shellFor(U_ROOM);
    const plane = meshNamed(shell, WALL_C_NAME);

    expect(plane.material).toBe(meshNamed(shell, "wall_left").material);
    shell.traverse((node) => {
      if (!isMesh(node)) return;
      for (const material of toMaterials(node.material)) {
        expect(material.side, node.name).not.toBe(THREE.DoubleSide);
      }
    });
  });

  it("is a plane, so a U's shell is not given a body that picking or the probe could read", () => {
    const { shell } = shellFor(U_ROOM);
    const plane = meshNamed(shell, WALL_C_NAME);

    expect(plane.geometry.type).toBe("PlaneGeometry");
    expect(plane.userData["placementId"]).toBeUndefined();
  });

  it("is drawn only for a U: hidden, never removed, once the room stops being one", () => {
    const { kit, shell } = shellFor(U_ROOM);
    expect(meshNamed(shell, WALL_C_NAME).visible).toBe(true);
    const childCount = shell.children.length;

    resizeShellToRoom({ kit, shell, room: L_ROOM });
    expect(meshNamed(shell, WALL_C_NAME).visible).toBe(false);

    resizeShellToRoom({ kit, shell, room: LINEAR_ROOM });
    expect(meshNamed(shell, WALL_C_NAME).visible).toBe(false);

    resizeShellToRoom({ kit, shell, room: U_ROOM });
    expect(meshNamed(shell, WALL_C_NAME).visible).toBe(true);
    expect(shell.children).toHaveLength(childCount);
  });

  it("moves with the room in place: a new C and a new W redraw the same mesh", () => {
    const { kit, shell } = shellFor(U_ROOM);
    const plane = meshNamed(shell, WALL_C_NAME);
    const longerNarrower = uRoom({
      wallAMm: 4000,
      wallBMm: 3000,
      wallCMm: 4400,
      heightMm: 2700,
    });

    resizeShellToRoom({ kit, shell, room: longerNarrower });

    expect(meshNamed(shell, WALL_C_NAME)).toBe(plane);
    expect(plane.position.x).toBeCloseTo(4, 6);
    expect(planeParameters(plane).width).toBeCloseTo(
      4.4 + CORNER_OVERHANG_M,
      6,
    );
    expect(planeParameters(plane).height).toBeCloseTo(2.7, 6);
  });
});

describe("the floor of a U reaches the farther of walls B and C", () => {
  const ROOMS_AND_THE_FARTHER_WALL_MM: readonly (readonly [
    string,
    DesignRoom,
    number,
  ])[] = [
    [
      "C longer than B",
      uRoom({ wallAMm: 4500, wallBMm: 3000, wallCMm: 3600, heightMm: 2600 }),
      3600,
    ],
    [
      "B longer than C",
      uRoom({ wallAMm: 4500, wallBMm: 3600, wallCMm: 3000, heightMm: 2600 }),
      3600,
    ],
    [
      "B and C equal",
      uRoom({ wallAMm: 4500, wallBMm: 3300, wallCMm: 3300, heightMm: 2600 }),
      3300,
    ],
  ];

  it.each(ROOMS_AND_THE_FARTHER_WALL_MM)(
    "%s: the slab runs from one overhang behind wall A to max(B, C) plus the overhang",
    (_caseName, room, fartherWallMm) => {
      const { shell } = shellFor(room);

      const extent = floorExtentAlongZ(shell);

      expect(extent.min).toBeCloseTo(-CORNER_OVERHANG_M, 6);
      expect(extent.max).toBeCloseTo(fartherWallMm / 1000, 6);
    },
  );

  it("follows a resize in place when C overtakes B", () => {
    const { kit, shell } = shellFor(
      uRoom({ wallAMm: 4500, wallBMm: 3600, wallCMm: 3000, heightMm: 2600 }),
    );

    resizeShellToRoom({
      kit,
      shell,
      room: uRoom({
        wallAMm: 4500,
        wallBMm: 3600,
        wallCMm: 4200,
        heightMm: 2600,
      }),
    });

    expect(floorExtentAlongZ(shell).max).toBeCloseTo(4.2, 6);
  });

  it("keeps an L's and a straight room's floor at depthMm plus the overhang", () => {
    for (const room of [L_ROOM, LINEAR_ROOM]) {
      expect(floorExtentAlongZ(shellFor(room).shell).max).toBeCloseTo(
        room.depthMm / 1000,
        6,
      );
    }
  });
});

describe("the drawn-room signature knows the shape and C", () => {
  /** A U whose W x D x H are an L's, and whose C is the L's D: the floor is the same size and the
   *  planes are the same length, so only the shape and wall C's visibility tell the two apart. */
  const U_AT_THE_L_DIMENSIONS = uRoom({
    wallAMm: L_ROOM.widthMm,
    wallBMm: L_ROOM.depthMm,
    wallCMm: L_ROOM.depthMm,
    heightMm: L_ROOM.heightMm,
  });

  it("redraws in place between an L and a U at equal W x D x H, in both directions", () => {
    const { kit, shell } = shellFor(L_ROOM);
    expect(shell.children.some((c) => c.name === WALL_C_NAME)).toBe(false);

    resizeShellToRoom({ kit, shell, room: U_AT_THE_L_DIMENSIONS });
    expect(meshNamed(shell, WALL_C_NAME).visible).toBe(true);

    resizeShellToRoom({ kit, shell, room: L_ROOM });
    expect(meshNamed(shell, WALL_C_NAME).visible).toBe(false);

    resizeShellToRoom({ kit, shell, room: U_AT_THE_L_DIMENSIONS });
    expect(meshNamed(shell, WALL_C_NAME).visible).toBe(true);
  });

  it("redraws between two U rooms that differ in C alone", () => {
    const { kit, shell } = shellFor(U_ROOM);
    const shorterC = { ...U_ROOM, wallCMm: 3100 };

    resizeShellToRoom({ kit, shell, room: shorterC });

    expect(planeParameters(meshNamed(shell, WALL_C_NAME)).width).toBeCloseTo(
      3.1 + CORNER_OVERHANG_M,
      6,
    );
  });

  it("does not redraw a room it already stands at: the geometry is left alone", () => {
    const { kit, shell } = shellFor(U_ROOM);
    const floorGeometry = meshNamed(shell, "floor").geometry;
    const wallCGeometry = meshNamed(shell, WALL_C_NAME).geometry;

    resizeShellToRoom({ kit, shell, room: { ...U_ROOM } });

    expect(meshNamed(shell, "floor").geometry).toBe(floorGeometry);
    expect(meshNamed(shell, WALL_C_NAME).geometry).toBe(wallCGeometry);
  });
});

describe("a U has no run-end panel (D11)", () => {
  const catalog = buildKitchenLBodyCatalog(600);

  /** Wall A's left corner leg alone: a base run that ends mid-wall, well clear of the wall's end, so
   *  nothing but the shape can veto the panel — the wall-end veto that hides it in a full U is not
   *  in play. */
  function leftLegOnlyRecords(room: DesignRoom): readonly PlacementRecord[] {
    const design = buildUShellDesign({ room, occurredAt: OCCURRED_AT });
    const halfWallM = room.widthMm / 2000;
    const records = derivePlacementRecords(design, catalog).filter(
      (record) =>
        record.wall === "A" &&
        record.band === "base" &&
        record.frame.x + record.frame.w / 2 < halfWallM,
    );
    expect(records.length).toBeGreaterThan(0);
    return records;
  }

  function panelAfterSync(input: {
    readonly shell: THREE.Group;
    readonly records: readonly PlacementRecord[];
    readonly room: DesignRoom;
  }): THREE.Mesh {
    const solidsRoot = new THREE.Group();
    solidsRoot.add(input.shell);
    syncRunEndPanel({
      solidsRoot,
      records: input.records,
      room: input.room,
    });
    return meshNamed(input.shell, "end_panel_right");
  }

  it("hides the panel for a base run the same records would panel in an L", () => {
    const records = leftLegOnlyRecords(U_ROOM);
    const asAnL: DesignRoom = { ...U_ROOM, shape: "L", wallCMm: undefined };
    expect(runEndPanelSeatM(records, asAnL)).toBeDefined();
    expect(runEndPanelSeatM(records, U_ROOM)).toBeUndefined();

    const { shell } = shellFor(U_ROOM);
    const panel = panelAfterSync({ shell, records, room: U_ROOM });

    expect(panel.visible).toBe(false);
  });

  it("hides a panel an L had shown when the same shell becomes a U", () => {
    const records = leftLegOnlyRecords(U_ROOM);
    const asAnL: DesignRoom = { ...U_ROOM, shape: "L", wallCMm: undefined };
    const { kit, shell } = shellFor(asAnL);
    expect(panelAfterSync({ shell, records, room: asAnL }).visible).toBe(true);

    resizeShellToRoom({ kit, shell, room: U_ROOM });
    const panel = panelAfterSync({ shell, records, room: U_ROOM });

    expect(panel.visible).toBe(false);
  });
});

describe("the L and straight shells are byte-identical to the shells before wall C (criterion 7)", () => {
  const RECORDED_ROOMS: readonly (readonly [
    "L" | "linear" | "LOdd",
    DesignRoom,
  ])[] = [
    ["L", L_ROOM],
    ["linear", LINEAR_ROOM],
    ["LOdd", ODD_L_ROOM],
  ];

  function recordedFactsOf(child: THREE.Object3D): RecordedShellChild {
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const structure = describeStructure(child);
    return {
      name: structure.name,
      geometry: required(structure.geometry, `${child.name} geometry`),
      size: required(structure.size, `${child.name} size`),
      position: structure.position,
      rotation: structure.rotation,
      visible: structure.visible,
      material: required(structure.material, `${child.name} material`),
      side: material.side,
      colour: material.color.getHex(),
      mapRepeat: material.map
        ? [material.map.repeat.x, material.map.repeat.y]
        : null,
    };
  }

  function withoutMapRepeat(
    child: RecordedShellChild,
  ): Omit<RecordedShellChild, "mapRepeat"> & { mapRepeat?: undefined } {
    return { ...child, mapRepeat: undefined };
  }

  it.each(RECORDED_ROOMS)(
    "%s: exactly the five recorded children, in order, each unchanged to the last digit",
    (recordedKey, room) => {
      const { shell } = shellFor(room);

      const drawn = shell.children.map(recordedFactsOf);

      expect(drawn).toStrictEqual(NON_U_SHELLS_BEFORE_WALL_C[recordedKey]);
    },
  );

  it("an L that was never a U carries no wall C mesh at all", () => {
    for (const room of [L_ROOM, LINEAR_ROOM, ODD_L_ROOM]) {
      expect(
        shellFor(room).shell.children.map((child) => child.name),
      ).not.toContain(WALL_C_NAME);
    }
  });

  /** Every resize re-tiles by a ratio of the extent it covers, so a round trip through any other
   *  room moves a map repeat by a unit in the last place — as an L → L' → L round trip does with no U
   *  in it. The repeat is therefore held to a tolerance and everything else to the last digit. */
  it("keeps the recorded L's geometry after a round trip through a U", () => {
    const { kit, shell } = shellFor(L_ROOM);
    resizeShellToRoom({ kit, shell, room: U_ROOM });
    resizeShellToRoom({ kit, shell, room: L_ROOM });

    const fiveOriginals = shell.children
      .filter((child) => child.name !== WALL_C_NAME)
      .map(recordedFactsOf);

    expect(fiveOriginals.map(withoutMapRepeat)).toStrictEqual(
      NON_U_SHELLS_BEFORE_WALL_C.L.map(withoutMapRepeat),
    );
    fiveOriginals.forEach((child, index) => {
      const recorded = required(
        NON_U_SHELLS_BEFORE_WALL_C.L[index],
        child.name,
      );
      expect(child.mapRepeat?.length, child.name).toBe(
        recorded.mapRepeat?.length,
      );
      recorded.mapRepeat?.forEach((repeat, axis) => {
        expect(required(child.mapRepeat, child.name)[axis]).toBeCloseTo(
          repeat,
          9,
        );
      });
    });
  });

  it("leaves an L's floor no different whether or not wall C is in the shell", () => {
    const { kit, shell } = shellFor(L_ROOM);
    const before = floorExtentAlongZ(shell);
    resizeShellToRoom({ kit, shell, room: U_ROOM });
    resizeShellToRoom({ kit, shell, room: L_ROOM });

    expect(floorExtentAlongZ(shell)).toStrictEqual(before);
  });
});

describe("wall C's geometry is freed with the stage", () => {
  it("disposes wall C's plane geometry, once, in a whole-stage teardown", () => {
    const { kit, shell } = shellFor(L_ROOM);
    resizeShellToRoom({ kit, shell, room: U_ROOM });
    const wallCGeometry = meshNamed(shell, WALL_C_NAME).geometry;
    const disposed = vi.spyOn(wallCGeometry, "dispose");

    disposeKitAndStage({
      kit,
      room: shell,
      ground: new THREE.Group(),
      blob: new THREE.Group(),
      lights: createLightRig(),
    });

    expect(disposed).toHaveBeenCalledOnce();
  });
});
