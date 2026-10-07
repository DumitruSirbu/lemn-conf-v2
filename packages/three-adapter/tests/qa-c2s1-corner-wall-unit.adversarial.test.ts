// M7C wave C2 slice S1 adversarial QA — the corner wall unit, placed where slice S2 will mount it.
//
// Independent of `wall-corner-x.test.ts`: the unit stands in **generated rooms** (real probe, the kit
// built with the wall depth the product passes), on wall A from the corner at 1500 and at 2200, beside
// the side wall's own corner cabinets and whatever the generator put at 900 mm. Every expected figure
// is arithmetic on the wall depth, written out here, and none is read from the builder.
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

import { hidePushOpenHandles } from "../src/decomposed-bodies.js";
import { applyBodyFinish } from "../src/finishes.js";
import { disposeKit } from "../src/kit-disposal.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { wrapInRightCornerMirror } from "../src/right-corner-wrapper.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { buildSelectionOutline } from "../src/selection-outline.js";
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
const TOP_ROW_MIN_ROOM_HEIGHT_MM = 2600;

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
  { shape: "U", widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
  { shape: "U", widthMm: 3000, depthMm: 1000, wallCMm: 1000, heightMm: 2600 },
];

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
  readonly node: THREE.Group;
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

/** The generated design mounted as the product mounts it, with the unit added where S2 will put it:
 *  its back on wall A, its near end in the corner, at 1500 and (in a room of 2600 or more) at 2200;
 *  in a U, the mirrored unit at the far corner too. */
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
  // Since S2 the generated design carries the units itself. This harness places them where its own
  // arithmetic says, so the mounted ones are taken out first rather than doubled (S2's one edit here).
  const mountedUnits = design.placements
    .filter((placement) =>
      placement.body.buildId.startsWith("wall-corner-x-900"),
    )
    .map((placement) => placement.id);
  for (const child of [...root.children]) {
    if (mountedUnits.includes(String(child.userData["placementId"]))) {
      root.remove(child);
    }
  }
  const wallDepthM = wallCarcassDepthMm(cabinetDepthMm) / 1000;
  const roomWidthM = design.room.widthMm / 1000;
  const rows =
    design.room.heightMm >= TOP_ROW_MIN_ROOM_HEIGHT_MM
      ? [WALL_ROW, TOP_ROW]
      : [WALL_ROW];
  const corners = design.room.shape === "U" ? [false, true] : [false];
  const units = corners.flatMap((isRightCorner) =>
    rows.map((row): PlacedUnit => {
      const isTop = row === TOP_ROW;
      const built = kit.make.wallCornerX(UNIT_WIDTH_M, row.heightM);
      const body = isTop ? hidePushOpenHandles(built) : built;
      const node = isRightCorner ? wrapInRightCornerMirror(body) : body;
      const id = `${isRightCorner ? "right-" : ""}unit${isTop ? "-top" : ""}`;
      node.position.set(
        isRightCorner ? roomWidthM - UNIT_WIDTH_M / 2 : UNIT_WIDTH_M / 2,
        row.floorM,
        (wallDepthM - FRONT_ASSEMBLY_M) / 2,
      );
      node.userData["placementId"] = id;
      root.add(node);
      return {
        id,
        node,
        heightM: row.heightM,
        floorM: row.floorM,
        isRightCorner,
        sideCabinetId: `${isRightCorner ? "right-" : ""}${isTop ? "p21" : "p9"}`,
      };
    }),
  );
  root.updateMatrixWorld(true);
  return { label, design, root, wallDepthM, roomWidthM, units };
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
  it("is measured at both corners of a U, in both rows, at all three depth states", () => {
    expect(everyPlacedUnit()).toHaveLength(3 * (4 * 2 + 1 + 2 * 4));
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

  it.each([SHALLOW_MM, DEEP_MM])(
    "keeps a 65 mm stile and a positive leaf at every width from 700 mm up, at %i",
    (cabinetDepthMm) => {
      const kit = productKit(cabinetDepthMm);
      const depthM = wallCarcassDepthMm(cabinetDepthMm) / 1000;
      for (let widthMm = 700; widthMm <= 900; widthMm += 10) {
        const widthM = widthMm / 1000;
        const unit = kit.make.wallCornerX(widthM);
        unit.updateMatrixWorld(true);
        const size = (name: string) =>
          new THREE.Box3()
            .setFromObject(required(unit.getObjectByName(name), name))
            .getSize(new THREE.Vector3()).x;

        expect([widthMm, mm(size("corner_stile"))]).toEqual([widthMm, 65]);
        expect([widthMm, mm(size("door_front"))]).toEqual([
          widthMm,
          mm(
            widthM -
              depthM -
              CLEARANCE_BESIDE_THE_BLIND_PART_M -
              CLEARANCE_AT_THE_FAR_EDGE_M,
          ),
        ]);
      }
    },
  );
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
      for (const suffix of ["", "-top"]) {
        const left = meshBoxesOf("l", bodyOf(scene, `unit${suffix}`));
        const right = meshBoxesOf("r", bodyOf(scene, `right-unit${suffix}`));
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
// Swing, in plan: each leaf with its handle, as a rectangle turning about its hinge edge, against the
// other cabinet's parts as they stand closed. 0 to 110 degrees, every half degree.
// -------------------------------------------------------------------------------------------------

interface PlanRect {
  readonly name: string;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

function planOf(mesh: NamedBox): PlanRect {
  const { min, max } = mesh.box;
  return { name: mesh.name, x0: min.x, x1: max.x, z0: min.z, z1: max.z };
}

function perimeterOf(rect: PlanRect): [number, number][] {
  const points: [number, number][] = [];
  for (let x = rect.x0; x <= rect.x1; x += 0.001)
    points.push([x, rect.z0], [x, rect.z1]);
  for (let z = rect.z0; z <= rect.z1; z += 0.001)
    points.push([rect.x0, z], [rect.x1, z]);
  points.push([rect.x1, rect.z0], [rect.x1, rect.z1]);
  return points;
}

function distanceM(point: readonly [number, number], rect: PlanRect): number {
  return Math.hypot(
    Math.max(rect.x0 - point[0], 0, point[0] - rect.x1),
    Math.max(rect.z0 - point[1], 0, point[1] - rect.z1),
  );
}

type Turn = (offset: readonly [number, number], angle: number) => number[];

/** A leaf on wall A hinged at its far edge: its free edge comes out into the room. */
const turnOfTheUnitsLeaf: Turn = ([dx, dz], angle) => [
  dx * Math.cos(angle) + dz * Math.sin(angle),
  -dx * Math.sin(angle) + dz * Math.cos(angle),
];
/** A leaf on the side wall hinged at its far end: its free edge comes out into the room. */
const turnOfTheSideLeaf: Turn = ([dx, dz], angle) => [
  dx * Math.cos(angle) - dz * Math.sin(angle),
  dx * Math.sin(angle) + dz * Math.cos(angle),
];

interface Swing {
  readonly moving: readonly PlanRect[];
  readonly fixed: readonly PlanRect[];
  readonly pivot: readonly [number, number];
  readonly turn: Turn;
}

function leastClearanceM(swing: Swing): number {
  let least = Number.POSITIVE_INFINITY;
  for (let degrees = 0; degrees <= 110; degrees += 0.5) {
    const angle = (degrees * Math.PI) / 180;
    for (const rect of swing.moving) {
      for (const [x, z] of perimeterOf(rect)) {
        const [dx, dz] = swing.turn(
          [x - swing.pivot[0], z - swing.pivot[1]],
          angle,
        );
        const moved = [
          swing.pivot[0] + (dx ?? 0),
          swing.pivot[1] + (dz ?? 0),
        ] as const;
        for (const still of swing.fixed)
          least = Math.min(least, distanceM(moved, still));
      }
    }
  }
  return least;
}

describe.each([SHALLOW_MM, DEEP_MM])(
  "the two leaves' swings at the left corner of an L, at %i",
  (cabinetDepthMm) => {
    const swings = () => {
      const scene = required(
        allScenes().find(
          (candidate) =>
            candidate.label ===
            `L 4100/3300 @${String(cabinetDepthMm === SHALLOW_MM ? 600 : 700)}`,
        ),
        "scene",
      );
      const unit = meshBoxesOf("unit", bodyOf(scene, "unit"));
      const side = meshBoxesOf("p9", bodyOf(scene, "p9"));
      const swingsOpen = (mesh: NamedBox) =>
        /^(door_front|handle_)/.test(mesh.name);
      const unitLeaf = partOf(scene, "unit", "door_front");
      const sideLeaf = partOf(scene, "p9", "door_front");
      return {
        unitLeaf: unit.filter(swingsOpen).map(planOf),
        unitHandle: unit
          .filter((mesh) => mesh.name.startsWith("handle_"))
          .map(planOf),
        sideLeaf: side.filter(swingsOpen).map(planOf),
        sideParts: side.map(planOf),
        unitPivot: [unitLeaf.max.x, unitLeaf.min.z] as const,
        sidePivot: [sideLeaf.min.x, sideLeaf.max.z] as const,
      };
    };

    it("keeps the unit's leaf and bar at least 30 mm from the side cabinet, closed, through 110 degrees", () => {
      const { unitLeaf, sideParts, unitPivot } = swings();

      expect(
        leastClearanceM({
          moving: unitLeaf,
          fixed: sideParts,
          pivot: unitPivot,
          turn: turnOfTheUnitsLeaf,
        }),
      ).toBeGreaterThan(0.03);
    });

    it("lets the side cabinet's leaf pass the unit's bar with 12 mm, through 110 degrees", () => {
      const { sideLeaf, unitHandle, sidePivot } = swings();
      const least = leastClearanceM({
        moving: sideLeaf,
        fixed: unitHandle,
        pivot: sidePivot,
        turn: turnOfTheSideLeaf,
      });

      expect(least).toBeGreaterThan(0.011);
      expect(least).toBeLessThan(0.013);
    });
  },
);

// -------------------------------------------------------------------------------------------------
// The handle, and what slice S2 will lean on: one selectable body, an outline around it, and a colour
// that reaches its four surfaces and nothing else.
// -------------------------------------------------------------------------------------------------

describe("the wall-row unit's bar", () => {
  it("stands on the corner side of the leaf, clear of the side cabinet's door by 85 mm and of its bar by 64", () => {
    const figures = new Set(
      everyPlacedUnit()
        .filter(([, unit]) => unit.heightM === WALL_ROW.heightM)
        .map(([scene, unit]) => {
          const bar = fromTheCorner(
            scene,
            unit,
            partOf(scene, unit.id, "handle_bar"),
          );
          const leaf = fromTheCorner(
            scene,
            unit,
            partOf(scene, unit.id, "door_front"),
          );
          const sideDoor = fromTheCorner(
            scene,
            unit,
            partOf(scene, unit.sideCabinetId, "door_front"),
          );
          const sideBar = fromTheCorner(
            scene,
            unit,
            partOf(scene, unit.sideCabinetId, "handle_bar"),
          );
          return [
            mm(bar[0] - leaf[0]),
            mm(bar[0] - sideDoor[1]),
            mm(bar[0] - sideBar[1]),
          ].join(" / ");
        }),
    );

    expect([...figures]).toEqual(["34 / 85 / 64"]);
  });

  it("is a vertical bar at mid-height in the wall row, and a horizontal one on the bottom edge in the top row", () => {
    for (const [scene, unit] of everyPlacedUnit()) {
      const bar = partOf(scene, unit.id, "handle_bar");
      const size = bar.getSize(new THREE.Vector3());
      const heightOnTheUnitM =
        bar.getCenter(new THREE.Vector3()).y - unit.floorM;
      const isUpright = size.y > size.x;

      expect([scene.label, unit.id, isUpright]).toEqual([
        scene.label,
        unit.id,
        unit.heightM === WALL_ROW.heightM,
      ]);
      expect(heightOnTheUnitM).toBeCloseTo(
        isUpright ? unit.heightM / 2 : DOOR_REVEAL_M + 0.04,
        6,
      );
    }
  });

  it("is drawn, and the top unit's is built and not drawn", () => {
    for (const [scene, unit] of everyPlacedUnit()) {
      const bars = meshBoxesOf(unit.id, unit.node).filter(
        (mesh) => mesh.name === "handle_bar",
      );

      expect(bars).toHaveLength(1);
      expect([scene.label, unit.id, bars[0]?.isDrawn]).toEqual([
        scene.label,
        unit.id,
        unit.heightM === WALL_ROW.heightM,
      ]);
    }
  });
});

describe("what slice S2 will lean on", () => {
  const scene = () =>
    required(
      allScenes().find(
        (candidate) => candidate.label === "U 4500/3000/3600 @600",
      ),
      "the U",
    );

  it.each(["unit", "unit-top", "right-unit", "right-unit-top"])(
    "selects %s, and only it, by a tap on its leaf, its stile and its bar",
    (id) => {
      const stage = scene();
      const unit = required(
        stage.units.find((candidate) => candidate.id === id),
        id,
      );
      for (const name of ["door_front", "corner_stile", "handle_bar"]) {
        const part = partOf(stage, id, name);
        const target = part.getCenter(new THREE.Vector3());
        // The side cabinet's own bar stands in front of the stile's middle at bar height, so the tap is
        // aimed 10 mm inside the stile's leaf-side edge, which nothing covers.
        if (name === "corner_stile") {
          target.x = unit.isRightCorner ? part.min.x + 0.01 : part.max.x - 0.01;
        }
        const raycaster = createPickingRaycaster();
        raycaster.set(
          new THREE.Vector3(target.x, target.y, target.z + 0.25),
          new THREE.Vector3(0, 0, -1),
        );

        expect([
          name,
          pick(raycaster, stage.root, new THREE.Group())?.id,
        ]).toEqual([name, unit.id]);
      }
    },
  );

  it("is outlined around its whole extent, the mirrored one included", () => {
    const stage = scene();
    for (const unit of stage.units) {
      const parent = new THREE.Group();
      parent.add(stage.root);
      const outline = buildSelectionOutline({
        target: unit.node,
        parent,
        kind: "placement",
      });
      parent.add(outline.group);
      parent.updateMatrixWorld(true);
      const hull = new THREE.Box3().setFromObject(outline.visibleLine);
      const body = new THREE.Box3().setFromObject(unit.node);

      expect(hull.containsBox(body.clone().expandByScalar(-EXACT_M))).toBe(
        true,
      );
      expect(hull.min.distanceTo(body.min)).toBeLessThan(0.01);
      expect(hull.max.distanceTo(body.max)).toBeLessThan(0.01);
    }
  });

  it.each([paletteFinish("pal.antracit"), paletteFinish("pal.stejar-halifax")])(
    "wears %o on its four surfaces and on nothing else",
    (finish) => {
      const kit = productKit(SHALLOW_MM);
      for (const heightM of [WALL_ROW.heightM, TOP_ROW.heightM]) {
        const unit = kit.make.wallCornerX(UNIT_WIDTH_M, heightM);
        const reference = kit.make.wallCabinet(0.6, 2);
        const before = new Map(
          meshBoxesOf("unit", unit).map((mesh) => [mesh.name, mesh] as const),
        );
        const materialOf = (root: THREE.Object3D, name: string) => {
          const mesh = required(root.getObjectByName(name), name);
          if (!isMesh(mesh)) throw new Error(`${name} is not a mesh`);
          return mesh.material;
        };
        const unpainted = new Map(
          [...UNIT_MESHES_PAINTED, ...UNIT_MESHES_NOT_PAINTED].map(
            (name) => [name, materialOf(unit, name)] as const,
          ),
        );

        applyBodyFinish(unit, kit.M, finish);
        applyBodyFinish(reference, kit.M, finish);

        expect([...before.keys()].sort()).toEqual(
          [...UNIT_MESHES_PAINTED, ...UNIT_MESHES_NOT_PAINTED].sort(),
        );
        for (const name of UNIT_MESHES_PAINTED) {
          expect([name, materialOf(unit, name)]).toEqual([
            name,
            materialOf(reference, "door_front"),
          ]);
        }
        for (const name of UNIT_MESHES_NOT_PAINTED) {
          expect([
            name,
            materialOf(unit, name) === unpainted.get(name),
          ]).toEqual([name, true]);
        }
      }
    },
  );

  /** A document whose material resolves to no colour repaints nothing (ADR 0078 decision 3), so the
   *  stile shows the material it was built with, and that has to be the leaf's. */
  it("builds the stile in the leaf's own material and the closure in the carcass's", () => {
    const unit = productKit(SHALLOW_MM).make.wallCornerX(UNIT_WIDTH_M);
    const materialOf = (name: string) => {
      const mesh = required(unit.getObjectByName(name), name);
      if (!isMesh(mesh)) throw new Error(`${name} is not a mesh`);
      return mesh.material;
    };

    expect(materialOf("corner_stile")).toBe(materialOf("door_front"));
    expect(materialOf("corner_closure")).toBe(materialOf("carcass_shell"));
  });

  it("builds no bar at all when asked for push-to-open, and one hidden bar otherwise in the top row", () => {
    const kit = productKit(SHALLOW_MM);
    const countBars = (root: THREE.Object3D) =>
      meshBoxesOf("unit", root).filter((mesh) => mesh.name === "handle_bar");

    expect(
      countBars(kit.make.wallCornerX(UNIT_WIDTH_M, TOP_ROW.heightM, true)),
    ).toHaveLength(0);
    const hidden = countBars(
      hidePushOpenHandles(kit.make.wallCornerX(UNIT_WIDTH_M, TOP_ROW.heightM)),
    );
    expect(hidden.map((bar) => bar.isDrawn)).toEqual([false]);
  });
});
