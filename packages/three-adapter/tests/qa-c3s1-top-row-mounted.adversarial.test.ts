// M7C wave C3 slice S1 adversarial QA — the generated top row as the scene draws it (real probe, the
// kit built with the wall depth the product passes), at 600, after a change to 700 and back: an L, a
// right-hand L, a U under and over 10 m, and a straight kitchen.
//
// The owner's sentence is the expectation: a 400 mm push-to-open cabinet above every wall cabinet and
// above the hood, with doors. What is measured here is what a customer sees: where each top cabinet
// stands against the body under it and the bodies beside it, and that no bar is drawn on it.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  setCabinetDepth,
  wallCarcassDepthMm,
  type BodyProbeFactory,
  type Design,
  type DesignPlacement,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { disposeKit } from "../src/kit-disposal.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";

const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;
const HALF_MM = 0.0005;
const EXACT_M = 1e-6;

const TOP_ROW_FLOOR_MM = 2200;
const WALL_ROW_FLOOR_MM = 1500;
const TOP_ROW_FLOOR_M = 2.2;
const TOP_ROW_CEILING_M = 2.6;
const TOP_CABINET_BUILD_ID = "wall-cabinet";
/** A wall door hangs 3 mm inside its carcass at the top and at the bottom. */
const DOOR_REVEAL_M = 0.003;
/** A door wider than this is two leaves in this kit; a 300 mm cabinet has one. */
const ONE_LEAF_UP_TO_MM = 450;

const ROOMS: readonly DesignRoom[] = [
  { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 },
  {
    shape: "L",
    widthMm: 4100,
    depthMm: 3300,
    heightMm: 2600,
    cornerDirection: "right",
  },
  { shape: "L", widthMm: 1800, depthMm: 1750, heightMm: 3900 },
  { shape: "U", widthMm: 3000, depthMm: 2400, wallCMm: 2600, heightMm: 2600 },
  { shape: "U", widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
  { shape: "linear", widthMm: 3600, depthMm: 3400, heightMm: 2600 },
];

beforeAll(() => {
  installHeadlessDocument();
});

function productKit(cabinetDepthMm: number): Kit {
  return makeKit({
    createCanvas: createHeadlessCanvas,
    cabinetDepthMm,
    wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
  });
}

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

interface NamedBox {
  readonly owner: string;
  readonly name: string;
  readonly box: THREE.Box3;
  readonly isDrawn: boolean;
}

interface Scene {
  readonly label: string;
  readonly design: Design;
  readonly meshes: readonly NamedBox[];
}

function isDrawn(node: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = node; at; at = at.parent) {
    if (!at.visible) return false;
  }
  return true;
}

function sceneOf(design: Design, label: string): Scene {
  const cabinetDepthMm = cabinetDepthMmOf(design);
  const root = new THREE.Group();
  syncSolidBodies({
    kit: productKit(cabinetDepthMm),
    solidsRoot: root,
    records: derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMm),
    ),
    room: design.room,
  });
  root.updateMatrixWorld(true);
  const meshes = root.children.flatMap((body) => {
    const owner = body.userData["placementId"] as string | undefined;
    if (owner === undefined) return [];
    const found: NamedBox[] = [];
    body.traverse((node) => {
      if (!isMesh(node)) return;
      found.push({
        owner,
        name: node.name,
        box: new THREE.Box3().setFromObject(node),
        isDrawn: isDrawn(node),
      });
    });
    return found;
  });
  return { label, design, meshes };
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

function topsOf(scene: Scene): DesignPlacement[] {
  return scene.design.placements.filter(
    (placement) =>
      placement.y0Mm === TOP_ROW_FLOOR_MM &&
      placement.body.buildId === TOP_CABINET_BUILD_ID,
  );
}

function upperUnder(scene: Scene, top: DesignPlacement): DesignPlacement {
  return required(
    scene.design.placements.find(
      (placement) =>
        placement.wall === top.wall &&
        placement.y0Mm === WALL_ROW_FLOOR_MM &&
        placement.alongMm === top.alongMm,
    ),
    `${scene.label}: the upper under ${top.id}`,
  );
}

function meshesOf(scene: Scene, id: string): NamedBox[] {
  return scene.meshes.filter((mesh) => mesh.owner === id);
}

function bodyBox(scene: Scene, id: string): THREE.Box3 {
  const whole = new THREE.Box3();
  for (const mesh of meshesOf(scene, id)) whole.union(mesh.box);
  return whole;
}

/** How far a box's room-side face stands from the wall its body is on. */
function frontFromWallM(
  scene: Scene,
  placement: DesignPlacement,
  box: THREE.Box3,
): number {
  if (placement.wall === "A") return box.max.z;
  if (placement.wall === "B") return box.max.x;
  return scene.design.room.widthMm / 1000 - box.min.x;
}

function doorPlaneM(
  scene: Scene,
  placement: DesignPlacement,
): number | undefined {
  const doors = meshesOf(scene, placement.id).filter(
    (mesh) => mesh.name === "door_front",
  );
  return doors.length === 0
    ? undefined
    : Math.max(
        ...doors.map((door) => frontFromWallM(scene, placement, door.box)),
      );
}

function everyTop(): (readonly [Scene, DesignPlacement])[] {
  return allScenes().flatMap((scene) =>
    topsOf(scene).map((top) => [scene, top] as const),
  );
}

const AXES = ["x", "y", "z"] as const;

function overlapM(one: THREE.Box3, other: THREE.Box3, axis: "x" | "y" | "z") {
  return (
    Math.min(one.max[axis], other.max[axis]) -
    Math.max(one.min[axis], other.min[axis])
  );
}

function mm(metres: number): number {
  return Math.round(metres * 1e5) / 100;
}

describe("the generated top row, as drawn", () => {
  it("is drawn in every room, at all three depth states", () => {
    const counts = allScenes().map((scene) => topsOf(scene).length);

    expect(counts).toHaveLength(3 * ROOMS.length);
    expect(Math.min(...counts)).toBeGreaterThan(0);
  });

  it("fills 2200 to 2600 exactly, over the whole of the upper beneath it and no wider", () => {
    const wrong = everyTop().flatMap(([scene, top]) => {
      const mine = bodyBox(scene, top.id);
      const carcass = required(
        meshesOf(scene, top.id).find((mesh) => mesh.name === "carcass_shell"),
        "carcass",
      ).box;
      const under = required(
        meshesOf(scene, upperUnder(scene, top).id).find((mesh) =>
          /^(carcass_shell|hood_canopy)$/.test(mesh.name),
        ),
        "the upper's body",
      ).box;
      const along = top.wall === "A" ? "x" : "z";
      const offsets = [
        carcass.min.y - TOP_ROW_FLOOR_M,
        carcass.max.y - TOP_ROW_CEILING_M,
        carcass.min[along] - under.min[along],
        carcass.max[along] - under.max[along],
        mine.min.y - TOP_ROW_FLOOR_M,
      ];
      return offsets.some((offset) => Math.abs(offset) > EXACT_M)
        ? [`${scene.label} ${top.id}: ${offsets.map(mm).join(" / ")}`]
        : [];
    });

    expect(wrong).toEqual([]);
  });

  it("has doors and not a lift front: one leaf up to 450 mm wide, two above, each 3 mm inside the carcass", () => {
    const wrong = everyTop().flatMap(([scene, top]) => {
      const doors = meshesOf(scene, top.id).filter(
        (mesh) => mesh.name === "door_front",
      );
      const expectedLeaves = top.body.widthMm <= ONE_LEAF_UP_TO_MM ? 1 : 2;
      const reveals = doors.flatMap((door) => [
        door.box.min.y - TOP_ROW_FLOOR_M - DOOR_REVEAL_M,
        TOP_ROW_CEILING_M - door.box.max.y - DOOR_REVEAL_M,
      ]);
      return doors.length !== expectedLeaves ||
        reveals.some((reveal) => Math.abs(reveal) > EXACT_M)
        ? [`${scene.label} ${top.id}: ${String(doors.length)} leaves`]
        : [];
    });

    expect(wrong).toEqual([]);
  });

  it("builds a bar on every leaf and draws none of them", () => {
    const wrong = everyTop().flatMap(([scene, top]) => {
      const meshes = meshesOf(scene, top.id);
      const leaves = meshes.filter((mesh) => mesh.name === "door_front");
      const bars = meshes.filter((mesh) => mesh.name === "handle_bar");
      const stems = meshes.filter((mesh) => mesh.name === "handle_stem");
      return bars.length !== leaves.length ||
        [...bars, ...stems].some((mesh) => mesh.isDrawn)
        ? [`${scene.label} ${top.id}: ${String(bars.length)} bars`]
        : [];
    });

    expect(wrong).toEqual([]);
  });

  it("stands its doors on the plane of the doors beneath it, where the body beneath has doors", () => {
    const planes = everyTop().flatMap(([scene, top]) => {
      const mine = doorPlaneM(scene, top);
      const under = doorPlaneM(scene, upperUnder(scene, top));
      return under === undefined || mine === undefined
        ? []
        : [[`${scene.label} ${top.id}`, mm(mine - under)] as const];
    });

    expect(planes.length).toBeGreaterThan(30);
    expect(planes.filter(([, offset]) => offset !== 0)).toEqual([]);
  });

  it("stands level with the corner's own top units beside it: same height, same door plane, no gap", () => {
    const beside = allScenes().flatMap((scene) =>
      scene.design.placements
        .filter((placement) => placement.body.buildId.endsWith("-top"))
        .flatMap((unit) => {
          const [unitStart, unitEnd] = [
            unit.alongMm - unit.body.widthMm / 2,
            unit.alongMm + unit.body.widthMm / 2,
          ];
          const neighbour = topsOf(scene).find(
            (top) =>
              top.wall === unit.wall &&
              (top.alongMm - top.body.widthMm / 2 === unitEnd ||
                top.alongMm + top.body.widthMm / 2 === unitStart),
          );
          if (!neighbour) return [];
          const mine = bodyBox(scene, neighbour.id);
          const theirs = required(
            meshesOf(scene, unit.id).find(
              (mesh) => mesh.name === "carcass_shell",
            ),
            "the unit's carcass",
          ).box;
          const along = unit.wall === "A" ? "x" : "z";
          return [
            [
              `${scene.label} ${unit.id}`,
              mm(mine.min.y - theirs.min.y),
              mm(mine.max.y - theirs.max.y),
              mm(
                (doorPlaneM(scene, neighbour) ?? Number.NaN) -
                  (doorPlaneM(scene, unit) ?? Number.NaN),
              ),
              mm(-overlapM(mine, theirs, along)),
            ] as const,
          ];
        }),
    );

    expect(beside.length).toBeGreaterThan(20);
    expect(
      beside.filter((row) => row.slice(1).some((offset) => offset !== 0)),
    ).toEqual([]);
  });

  it("intersects no mesh of any other body by half a millimetre, the hood under it included", () => {
    const pairs = everyTop().flatMap(([scene, top]) =>
      meshesOf(scene, top.id).flatMap((mine) =>
        scene.meshes
          .filter((other) => other.owner !== top.id)
          .filter((other) =>
            AXES.every((axis) => overlapM(mine.box, other.box, axis) > HALF_MM),
          )
          .map(
            (other) =>
              `${scene.label} ${top.id}/${mine.name} into ${other.owner}/${other.name}`,
          ),
      ),
    );

    expect(pairs).toEqual([]);
  });

  it("puts no face within half a millimetre of a parallel face it overlaps, facing the same way", () => {
    const shared = everyTop().flatMap(([scene, top]) =>
      meshesOf(scene, top.id).flatMap((mine) =>
        scene.meshes
          .filter((other) => other.owner !== top.id)
          .flatMap((other) =>
            AXES.flatMap((axis) => {
              const overlaps = AXES.filter(
                (candidate) => candidate !== axis,
              ).every(
                (candidate) =>
                  overlapM(mine.box, other.box, candidate) > HALF_MM,
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
                    `${scene.label} ${top.id}/${mine.name} and ${other.owner}/${other.name}: ${side} ${axis}`,
                );
            }),
          ),
      ),
    );

    expect(shared).toEqual([]);
  });

  it("stands a top over each hood, its doors behind the hood's front and nothing of the hood above 2200", () => {
    const overHoods = everyTop().flatMap(([scene, top]) => {
      const upper = upperUnder(scene, top);
      if (upper.body.buildId !== "hood") return [];
      const hood = bodyBox(scene, upper.id);
      return [
        [
          `${scene.label} ${top.id}`,
          mm(hood.max.y - TOP_ROW_FLOOR_M),
          frontFromWallM(scene, upper, hood) >
            (doorPlaneM(scene, top) ?? Number.NaN),
        ] as const,
      ];
    });

    expect(overHoods).toHaveLength(3 * ROOMS.length);
    expect(
      overHoods.filter(([, above, isBehind]) => above !== 0 || !isBehind),
    ).toEqual([]);
  });
});
