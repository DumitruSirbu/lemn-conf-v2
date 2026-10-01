// M7C wave C2 slice S2 adversarial QA — the corner wall unit **as the scene mounts it** from a generated
// design (real probe, the kit built with the wall depth the product passes): the document's own `p27`,
// `p28` and their `right-` twins, drawn by `syncSolidBodies`, at 600, after a change to 700 and back.
//
// `qa-c2s1-corner-wall-unit.adversarial.test.ts` places a unit by hand where its arithmetic says; this
// file asks the same questions of the bodies the product actually draws, so the two cannot agree by
// sharing a placement.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  paletteFinish,
  setCabinetDepth,
  wallCarcassDepthMm,
  type BodyProbeFactory,
  type Design,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { disposeKit } from "../src/kit-disposal.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import { installHeadlessDocument } from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import {
  AXES,
  DOOR_THICKNESS_M,
  overlapM,
  productKitAt as productKit,
  UNIT_WIDTH_M,
} from "./support/wall-unit.js";

const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;
const HALF_MM = 0.0005;
const EXACT_M = 1e-6;

const WALL_ROW = { heightM: 0.7, floorM: 1.5 } as const;
const TOP_ROW = { heightM: 0.4, floorM: 2.2 } as const;
const UNIT_BUILD_ID = "wall-corner-x-900";

/** A fronted wall body's shell stops this far short of its declared depth: a door and its handle. */
const FRONT_ASSEMBLY_M = 0.039;
const LEAF_GAP_M = 0.004;
/** The unit's two clearances: beside the blind part (the base X-leg's 30 mm), and at the far edge (an
 *  ordinary wall door's 3 mm reveal; 10 mm until the ruling that gave it the wall door's). */
const CLEARANCE_BESIDE_THE_BLIND_PART_M = 0.03;
const CLEARANCE_AT_THE_FAR_EDGE_M = 0.003;
/** A wall door hangs 3 mm inside its carcass at the top and at the bottom. */
const DOOR_REVEAL_M = 0.003;

const UNIT_MESHES_PAINTED = [
  "carcass_shell",
  "corner_closure",
  "corner_stile",
  "door_front",
];
const UNIT_MESHES_NOT_PAINTED = [
  "carcass_back",
  "front_liner",
  "handle_bar",
  "handle_stem",
];

/** Rooms chosen for what the generator stands at 900 mm on the back wall: a wall cabinet, a hood, a
 *  free-standing fridge; and a U for the mirrored corner. */
const ROOMS: readonly DesignRoom[] = [
  { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 },
  {
    shape: "L",
    widthMm: 4100,
    depthMm: 3300,
    heightMm: 2600,
    cornerDirection: "right",
  },
  { shape: "L", widthMm: 1600, depthMm: 3000, heightMm: 2600 },
  { shape: "L", widthMm: 1800, depthMm: 1750, heightMm: 2600 },
  { shape: "L", widthMm: 1500, depthMm: 1750, heightMm: 2400 },
  { shape: "U", widthMm: 3000, depthMm: 2400, wallCMm: 2600, heightMm: 2600 },
  { shape: "U", widthMm: 3000, depthMm: 1000, wallCMm: 1000, heightMm: 2600 },
];

/** A U of 10 000 mm or more: its back wall carries no unit (owner, Q8 (iii)). */
const LARGE_U: DesignRoom = {
  shape: "U",
  widthMm: 4500,
  depthMm: 3000,
  wallCMm: 3600,
  heightMm: 2600,
};

const NEIGHBOUR_KINDS_THE_ROOMS_MUST_COVER = [
  "fridge-free",
  "hood",
  "wall-cabinet",
];

beforeAll(() => {
  installHeadlessDocument();
});

function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const kit = productKit(cabinetDepthMm);
    const room = kit.builders["kitchen-l"]();
    return createBodyProbeLease(createBodyProbe(kit, room), () => {
      disposeKit(kit, room);
    });
  };
}

function generated(room: DesignRoom): Design {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: realProbeFactory(),
  });
  if (!result.ok) throw new Error(`room refused: ${result.reason.code}`);
  return result.design;
}

function atDepth(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: realProbeFactory(),
    cabinetDepthMm,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`depth refused: ${result.reason.code}`);
  return result.design;
}

interface PlacedUnit {
  readonly id: string;
  readonly node: THREE.Object3D;
  readonly heightM: number;
  readonly floorM: number;
  readonly isRightCorner: boolean;
  /** The side wall's own corner cabinet in the same row. */
  readonly sideCabinetId: string;
}

interface Scene {
  readonly label: string;
  readonly design: Design;
  readonly root: THREE.Group;
  readonly wallDepthM: number;
  readonly roomWidthM: number;
  readonly units: readonly PlacedUnit[];
}

/** The generated design mounted as the product mounts it; the units are the document's own. */
function sceneOf(design: Design, label: string): Scene {
  const cabinetDepthMm = cabinetDepthMmOf(design);
  const kit = productKit(cabinetDepthMm);
  const root = new THREE.Group();
  syncSolidBodies({
    kit,
    solidsRoot: root,
    records: derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMm),
    ),
    room: design.room,
  });
  const units = design.placements
    .filter((placement) => placement.body.buildId.startsWith(UNIT_BUILD_ID))
    .map((placement): PlacedUnit => {
      const isRightCorner = placement.id.startsWith("right-");
      const isTop = placement.y0Mm === TOP_ROW.floorM * 1000;
      const node = root.children.find(
        (child) => child.userData["placementId"] === placement.id,
      );
      if (node === undefined)
        throw new Error(`${label}: ${placement.id} is not mounted`);
      return {
        id: placement.id,
        node,
        heightM: isTop ? TOP_ROW.heightM : WALL_ROW.heightM,
        floorM: placement.y0Mm / 1000,
        isRightCorner,
        sideCabinetId: `${isRightCorner ? "right-" : ""}${isTop ? "p21" : "p9"}`,
      };
    });
  root.updateMatrixWorld(true);
  return {
    label,
    design,
    root,
    wallDepthM: wallCarcassDepthMm(cabinetDepthMm) / 1000,
    roomWidthM: design.room.widthMm / 1000,
    units,
  };
}

function roomLabel(room: DesignRoom): string {
  const direction = "cornerDirection" in room ? room.cornerDirection : "";
  const wallC = room.shape === "U" ? `/${String(room.wallCMm)}` : "";
  return `${room.shape}${direction ?? ""} ${String(room.widthMm)}/${String(room.depthMm)}${wallC}`;
}

let scenes: readonly Scene[] = [];

/** Each room at 600, after a change to 700, and after the change back. */
function allScenes(): readonly Scene[] {
  if (scenes.length > 0) return scenes;
  scenes = ROOMS.flatMap((room) => {
    const shallow = generated(room);
    const deep = atDepth(shallow, DEEP_MM);
    return [
      sceneOf(shallow, `${roomLabel(room)} @600`),
      sceneOf(deep, `${roomLabel(room)} @700`),
      sceneOf(atDepth(deep, SHALLOW_MM), `${roomLabel(room)} @700->600`),
    ];
  });
  return scenes;
}

interface NamedBox {
  readonly owner: string;
  readonly name: string;
  readonly box: THREE.Box3;
  readonly isDrawn: boolean;
}

function isDrawn(node: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = node; at; at = at.parent) {
    if (!at.visible) return false;
  }
  return true;
}

function meshBoxesOf(owner: string, body: THREE.Object3D): NamedBox[] {
  const boxes: NamedBox[] = [];
  body.traverse((node) => {
    if (!isMesh(node)) return;
    boxes.push({
      owner,
      name: node.name,
      box: new THREE.Box3().setFromObject(node),
      isDrawn: isDrawn(node),
    });
  });
  return boxes;
}

function bodyOf(scene: Scene, id: string): THREE.Object3D {
  return required(
    scene.root.children.find((child) => child.userData["placementId"] === id),
    `${scene.label} ${id}`,
  );
}

function everyOtherMesh(scene: Scene, id: string): NamedBox[] {
  return scene.root.children.flatMap((body) => {
    const owner = body.userData["placementId"] as string | undefined;
    return owner === undefined || owner === id ? [] : meshBoxesOf(owner, body);
  });
}

function partOf(scene: Scene, id: string, name: string): THREE.Box3 {
  return required(
    meshBoxesOf(id, bodyOf(scene, id)).find((mesh) => mesh.name === name),
    `${scene.label} ${id} ${name}`,
  ).box;
}

/** A box's extent along wall A, measured from the unit's own corner, near edge first. */
function fromTheCorner(
  scene: Scene,
  unit: PlacedUnit,
  box: THREE.Box3,
): readonly [number, number] {
  return unit.isRightCorner
    ? [scene.roomWidthM - box.max.x, scene.roomWidthM - box.min.x]
    : [box.min.x, box.max.x];
}

function everyPlacedUnit(): (readonly [Scene, PlacedUnit])[] {
  return allScenes().flatMap((scene) =>
    scene.units.map((unit) => [scene, unit] as const),
  );
}

function mm(metres: number): number {
  return Math.round(metres * 1e5) / 100;
}

describe("the unit's parts, from the wall depth alone (criterion a)", () => {
  it("is mounted at both corners of a U, in both rows, at all three depth states, and not in a large U", () => {
    expect(everyPlacedUnit()).toHaveLength(3 * (4 * 2 + 1 + 2 * 4));
    expect(sceneOf(generated(LARGE_U), "large U").units).toEqual([]);
  });

  it("stands every part where the arithmetic puts it, in every room", () => {
    const wrong = everyPlacedUnit().flatMap(([scene, unit]) => {
      const depthM = scene.wallDepthM;
      const shellM = depthM - FRONT_ASSEMBLY_M;
      const leafNearM = depthM + CLEARANCE_BESIDE_THE_BLIND_PART_M;
      const expected: Record<
        string,
        readonly [nearM: number, farM: number, backM: number, frontM: number]
      > = {
        carcass_shell: [0, UNIT_WIDTH_M, 0, shellM],
        corner_closure: [0, shellM, shellM, depthM],
        corner_stile: [
          shellM,
          leafNearM - LEAF_GAP_M,
          shellM,
          shellM + DOOR_THICKNESS_M,
        ],
        door_front: [
          leafNearM,
          UNIT_WIDTH_M - CLEARANCE_AT_THE_FAR_EDGE_M,
          shellM,
          shellM + DOOR_THICKNESS_M,
        ],
      };
      return Object.entries(expected).flatMap(([name, figures]) => {
        const box = partOf(scene, unit.id, name);
        const built = [
          ...fromTheCorner(scene, unit, box),
          box.min.z,
          box.max.z,
        ];
        return built.some((value, at) => {
          return Math.abs(value - (figures[at] ?? Number.NaN)) > EXACT_M;
        })
          ? [`${scene.label} ${unit.id} ${name}: ${built.map(mm).join(" / ")}`]
          : [];
      });
    });

    expect(wrong).toEqual([]);
  });

  it("hangs the stile and the leaf 3 mm inside the carcass, top and bottom", () => {
    const wrong = everyPlacedUnit().flatMap(([scene, unit]) =>
      ["corner_stile", "door_front"].flatMap((name) => {
        const box = partOf(scene, unit.id, name);
        const reveals = [
          box.min.y - unit.floorM,
          unit.floorM + unit.heightM - box.max.y,
        ];
        return reveals.some(
          (reveal) => Math.abs(reveal - DOOR_REVEAL_M) > EXACT_M,
        )
          ? [`${scene.label} ${unit.id} ${name}: ${reveals.map(mm).join("/")}`]
          : [];
      }),
    );

    expect(wrong).toEqual([]);
  });

  it("splits 900 into 330 + 570 at 600 and 400 + 500 at 700, one leaf of 537 and of 467", () => {
    const leafWidthsMm = new Map<number, Set<number>>();
    for (const [scene, unit] of everyPlacedUnit()) {
      const [near, far] = fromTheCorner(
        scene,
        unit,
        partOf(scene, unit.id, "door_front"),
      );
      const widths =
        leafWidthsMm.get(cabinetDepthMmOf(scene.design)) ?? new Set<number>();
      widths.add(mm(far - near));
      leafWidthsMm.set(cabinetDepthMmOf(scene.design), widths);
    }

    expect([...(leafWidthsMm.get(SHALLOW_MM) ?? [])]).toEqual([537]);
    expect([...(leafWidthsMm.get(DEEP_MM) ?? [])]).toEqual([467]);
  });
});

describe("the unit in the room (criterion c, and what S2 will mount it beside)", () => {
  it("finds nothing the generator placed inside the unit's own volume", () => {
    const inside = everyPlacedUnit().flatMap(([scene, unit]) => {
      const own = new THREE.Box3().setFromObject(unit.node);
      return everyOtherMesh(scene, unit.id)
        .filter((mesh) =>
          AXES.every((axis) => overlapM(own, mesh.box, axis) > HALF_MM),
        )
        .map((mesh) => `${scene.label} ${unit.id}: ${mesh.owner}/${mesh.name}`);
    });

    expect(inside).toEqual([]);
  });

  it("puts no face within half a millimetre of a parallel face it overlaps, facing the same way", () => {
    const shared = everyPlacedUnit().flatMap(([scene, unit]) =>
      meshBoxesOf(unit.id, unit.node).flatMap((mine) =>
        everyOtherMesh(scene, unit.id).flatMap((other) =>
          AXES.flatMap((axis) => {
            const overlaps = AXES.filter(
              (candidate) => candidate !== axis,
            ).every(
              (candidate) => overlapM(mine.box, other.box, candidate) > HALF_MM,
            );
            if (!overlaps) return [];
            return (["min", "max"] as const)
              .filter(
                (side) =>
                  Math.abs(mine.box[side][axis] - other.box[side][axis]) <
                  HALF_MM,
              )
              .map(
                (side) =>
                  `${scene.label} ${unit.id}/${mine.name} and ${other.owner}/${other.name}: ${side} ${axis}`,
              );
          }),
        ),
      ),
    );

    expect(shared).toEqual([]);
  });

  it("meets the side wall's corner cabinet on the closure's front, at 330 and, after it slides, at 400", () => {
    const off = everyPlacedUnit().flatMap(([scene, unit]) => {
      const side = partOf(scene, unit.sideCabinetId, "carcass_shell");
      const closure = partOf(scene, unit.id, "corner_closure");
      const gaps = [
        side.min.z - closure.max.z,
        side.min.z - scene.wallDepthM,
        fromTheCorner(scene, unit, side)[1] -
          fromTheCorner(scene, unit, closure)[1],
      ];
      return gaps.some((gap) => Math.abs(gap) > EXACT_M)
        ? [`${scene.label} ${unit.id}: ${gaps.map(mm).join(" / ")}`]
        : [];
    });

    expect(off).toEqual([]);
  });

  it("keeps the leaf and its handle wholly beyond the side cabinet's depth from the corner", () => {
    const inFront = everyPlacedUnit().flatMap(([scene, unit]) => {
      const side = new THREE.Box3().setFromObject(
        bodyOf(scene, unit.sideCabinetId),
      );
      const sideDepthM = fromTheCorner(scene, unit, side)[1];
      return meshBoxesOf(unit.id, unit.node)
        .filter((mesh) => /^(door_front|handle_)/.test(mesh.name))
        .filter((mesh) => fromTheCorner(scene, unit, mesh.box)[0] < sideDepthM)
        .map((mesh) => `${scene.label} ${unit.id}/${mesh.name}`);
    });

    expect(inFront).toEqual([]);
  });

  it("stands beside each kind of body the generator puts at 900 mm, its leaf on that body's door plane where it has doors", () => {
    const beside = new Map<string, Set<number>>();
    for (const [scene, unit] of everyPlacedUnit()) {
      if (unit.heightM !== WALL_ROW.heightM || unit.isRightCorner) continue;
      const neighbour = scene.design.placements.find(
        (placement) =>
          placement.wall === "A" &&
          placement.alongMm - placement.body.widthMm / 2 ===
            UNIT_WIDTH_M * 1000 &&
          placement.y0Mm + placement.body.heightMm > WALL_ROW.floorM * 1000,
      );
      if (!neighbour) continue;
      const leaf = partOf(scene, unit.id, "door_front");
      const doors = meshBoxesOf(neighbour.id, bodyOf(scene, neighbour.id))
        .filter((mesh) => mesh.name === "door_front")
        .map((mesh) => mm(mesh.box.max.z - leaf.max.z));
      const seen = beside.get(neighbour.body.buildId) ?? new Set<number>();
      doors.forEach((proud) => seen.add(proud));
      beside.set(neighbour.body.buildId, seen);
    }

    expect([...beside.keys()].sort()).toEqual(
      NEIGHBOUR_KINDS_THE_ROOMS_MUST_COVER,
    );
    expect([...(beside.get("wall-cabinet") ?? [])]).toEqual([0]);
  });

  it("draws the right corner's unit as the mirror of the left's about the room's middle", () => {
    const us = allScenes().filter((scene) => scene.design.room.shape === "U");
    expect(us).toHaveLength(6);

    for (const scene of us) {
      for (const id of ["p27", "p28"]) {
        const left = meshBoxesOf("l", bodyOf(scene, id));
        const right = meshBoxesOf("r", bodyOf(scene, `right-${id}`));
        expect(right.map((mesh) => mesh.name)).toEqual(
          left.map((mesh) => mesh.name),
        );
        left.forEach((mesh, at) => {
          const mirrored = required(right[at], "mirrored mesh").box;
          expect(mirrored.min.x).toBeCloseTo(
            scene.roomWidthM - mesh.box.max.x,
            6,
          );
          expect(mirrored.max.x).toBeCloseTo(
            scene.roomWidthM - mesh.box.min.x,
            6,
          );
          expect(mirrored.min.y).toBeCloseTo(mesh.box.min.y, 6);
          expect(mirrored.min.z).toBeCloseTo(mesh.box.min.z, 6);
          expect(mirrored.max.z).toBeCloseTo(mesh.box.max.z, 6);
        });
      }
    }
  });
});

// -------------------------------------------------------------------------------------------------
// "Cover all empty space within the corner" (owner, Q2). What of the unit's front, past the side
// cabinet's door, is NOT on the leaf's plane: stated in millimetres, so a ruling that changes it has a
// number to change.
// -------------------------------------------------------------------------------------------------

/** The strips of the unit's front, between the side cabinet's door face and the unit's far edge, that
 *  neither the stile nor the leaf covers, as [from, to] in millimetres from the corner. */
function uncoveredStripsMm(scene: Scene, unit: PlacedUnit): number[][] {
  const sideDoorFaceM = fromTheCorner(
    scene,
    unit,
    partOf(scene, unit.sideCabinetId, "door_front"),
  )[1];
  const covers = ["corner_stile", "door_front"]
    .map((name) => fromTheCorner(scene, unit, partOf(scene, unit.id, name)))
    .sort((one, other) => one[0] - other[0]);
  const strips: number[][] = [];
  let coveredToM = sideDoorFaceM;
  for (const [near, far] of covers) {
    if (near - coveredToM > EXACT_M) strips.push([mm(coveredToM), mm(near)]);
    coveredToM = Math.max(coveredToM, far);
  }
  if (UNIT_WIDTH_M - coveredToM > EXACT_M)
    strips.push([mm(coveredToM), mm(UNIT_WIDTH_M)]);
  return strips;
}

describe("the unit's front past the side cabinet's door (criterion d)", () => {
  it("is on the leaf's plane but for one 4 mm joint and a 3 mm strip at the far edge", () => {
    const widths = new Set(
      everyPlacedUnit().map(([scene, unit]) =>
        uncoveredStripsMm(scene, unit)
          .map(([from, to]) => mm(((to ?? 0) - (from ?? 0)) / 1000))
          .join(" + "),
      ),
    );

    expect([...widths]).toEqual(["4 + 3"]);
  });

  it("puts the stile and the leaf on one plane, the plane of a wall cabinet's doors", () => {
    const off = everyPlacedUnit().flatMap(([scene, unit]) => {
      const stile = partOf(scene, unit.id, "corner_stile");
      const leaf = partOf(scene, unit.id, "door_front");
      const doorPlaneM = scene.wallDepthM - FRONT_ASSEMBLY_M + DOOR_THICKNESS_M;
      return Math.abs(stile.max.z - leaf.max.z) > EXACT_M ||
        Math.abs(leaf.max.z - doorPlaneM) > EXACT_M
        ? [`${scene.label} ${unit.id}`]
        : [];
    });

    expect(off).toEqual([]);
  });

  /** The joint a customer sees between this leaf and the next cabinet's door: 5.5 mm, as two ordinary
   *  wall cabinets leave (12.5 mm while the far edge took the base corner's 10 mm clearance). */
  it("leaves 5.5 mm between its leaf and the next wall cabinet's door", () => {
    const joints = new Set<number>();
    for (const [scene, unit] of everyPlacedUnit()) {
      if (unit.heightM !== WALL_ROW.heightM) continue;
      const leaf = fromTheCorner(
        scene,
        unit,
        partOf(scene, unit.id, "door_front"),
      );
      for (const mesh of everyOtherMesh(scene, unit.id)) {
        if (mesh.name !== "door_front") continue;
        if (mesh.box.min.z > scene.wallDepthM || mesh.box.min.y < 1.4) continue;
        const [near] = fromTheCorner(scene, unit, mesh.box);
        if (near >= UNIT_WIDTH_M && near < UNIT_WIDTH_M + 0.01)
          joints.add(mm(near - leaf[1]));
      }
    }

    expect([...joints]).toEqual([5.5]);
  });
});

// -------------------------------------------------------------------------------------------------
// What the customer does with the mounted unit: taps it, sees its bar, and paints the kitchen.
// -------------------------------------------------------------------------------------------------

describe("the mounted unit under a tap, a bar and a colour", () => {
  it("is selected by its own placement id from its leaf, the edge of its stile and its bar", () => {
    const lost = everyPlacedUnit().flatMap(([scene, unit]) =>
      ["door_front", "corner_stile", "handle_bar"].flatMap((name) => {
        const part = partOf(scene, unit.id, name);
        const target = part.getCenter(new THREE.Vector3());
        // The side cabinet's own bar stands in front of the stile's middle; the leaf-side edge is clear.
        if (name === "corner_stile") {
          target.x = unit.isRightCorner ? part.min.x + 0.01 : part.max.x - 0.01;
        }
        const isHiddenBar =
          name === "handle_bar" && unit.heightM === TOP_ROW.heightM;
        const raycaster = createPickingRaycaster();
        raycaster.set(
          new THREE.Vector3(target.x, target.y, target.z + 0.2),
          new THREE.Vector3(0, 0, -1),
        );
        const picked = pick(raycaster, scene.root, new THREE.Group())?.id;
        return picked === unit.id || (isHiddenBar && picked !== undefined)
          ? []
          : [`${scene.label} ${unit.id} ${name}: ${String(picked)}`];
      }),
    );

    expect(lost).toEqual([]);
  });

  it("draws the wall-row bar and hides the top-row one, one bar each", () => {
    for (const [scene, unit] of everyPlacedUnit()) {
      const bars = meshBoxesOf(unit.id, unit.node).filter(
        (mesh) => mesh.name === "handle_bar",
      );

      expect([scene.label, unit.id, bars.map((bar) => bar.isDrawn)]).toEqual([
        scene.label,
        unit.id,
        [unit.heightM === WALL_ROW.heightM],
      ]);
    }
  });

  it("wears the kitchen's colour on its four surfaces, as the side cabinet's door does, and nowhere else", () => {
    const finish = paletteFinish("pal.antracit");
    const base = generated(required(ROOMS[5], "the U"));
    const painted: Design = {
      ...base,
      settings: { ...base.settings, finish },
    };
    const kit = productKit(SHALLOW_MM);
    const mount = (design: Design) => {
      const root = new THREE.Group();
      syncSolidBodies({
        kit,
        solidsRoot: root,
        records: derivePlacementRecords(design, buildKitchenLBodyCatalog(600)),
        room: design.room,
      });
      return root;
    };
    const materialOf = (root: THREE.Group, id: string, name: string) => {
      const body = required(
        root.children.find((child) => child.userData["placementId"] === id),
        id,
      );
      const mesh = required(body.getObjectByName(name), `${id} ${name}`);
      if (!isMesh(mesh)) throw new Error(`${name} is not a mesh`);
      return mesh.material;
    };
    const plain = mount(base);
    const coloured = mount(painted);

    for (const id of ["p27", "p28", "right-p27", "right-p28"]) {
      const sideId = `${id.startsWith("right-") ? "right-" : ""}${id.endsWith("p28") ? "p21" : "p9"}`;
      for (const name of UNIT_MESHES_PAINTED) {
        expect([id, name, materialOf(coloured, id, name)]).toEqual([
          id,
          name,
          materialOf(coloured, sideId, "door_front"),
        ]);
        expect(materialOf(coloured, id, name)).not.toBe(
          materialOf(plain, id, name),
        );
      }
      for (const name of UNIT_MESHES_NOT_PAINTED) {
        expect([id, name, materialOf(coloured, id, name)]).toEqual([
          id,
          name,
          materialOf(plain, id, name),
        ]);
      }
    }
  });
});

// -------------------------------------------------------------------------------------------------
// The decomposed body itself, which the scene and the probe both build: its recorded width and its bar.
// -------------------------------------------------------------------------------------------------

describe("the decomposed corner wall unit", () => {
  const NARROW_M = 0.87;

  function barsOf(body: THREE.Object3D): boolean[] {
    return meshBoxesOf("unit", body)
      .filter((mesh) => mesh.name === "handle_bar")
      .map((mesh) => mesh.isDrawn);
  }

  function widthOf(body: THREE.Object3D): number {
    body.updateMatrixWorld(true);
    return new THREE.Box3()
      .setFromObject(required(body.getObjectByName("carcass_shell"), "shell"))
      .getSize(new THREE.Vector3()).x;
  }

  it("is built at the recorded width, and at the reference 900 where none is recorded", () => {
    const kit = productKit(SHALLOW_MM);
    for (const buildId of [UNIT_BUILD_ID, `${UNIT_BUILD_ID}-top`]) {
      expect([
        buildId,
        widthOf(buildDecomposedBody(kit, buildId, { widthM: NARROW_M })),
      ]).toEqual([buildId, expect.closeTo(NARROW_M, 6)]);
      expect([buildId, widthOf(buildDecomposedBody(kit, buildId))]).toEqual([
        buildId,
        expect.closeTo(UNIT_WIDTH_M, 6),
      ]);
    }
  });

  it("carries its bar drawn in the wall row, and built but hidden in the top row (§13.1)", () => {
    const kit = productKit(SHALLOW_MM);

    expect(barsOf(buildDecomposedBody(kit, UNIT_BUILD_ID))).toEqual([true]);
    expect(barsOf(buildDecomposedBody(kit, `${UNIT_BUILD_ID}-top`))).toEqual([
      false,
    ]);
  });
});
