// M7C wave C4 slice S2 adversarial QA — the joint on the run's carcass front (ADR 0135 decision 5).
//
// Independent of `base-corner-x-lines.test.ts`: every claim is read off a **mounted, generated room**
// (real probe, the kit built with the wall depth the product passes), at 600, after a change to 700
// and after the change back, in an L, a right-hand L and both corners of a U.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  cornerDirectionOf,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  setCabinetDepth,
  validateDesignForCatalog,
  wallCarcassDepthMm,
  type BodyProbeFactory,
  type Design,
  type DesignPlacement,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyCornerDirection } from "../src/corner-direction.js";
import { applyCutaway, cutawayWallsFor } from "../src/cutaway.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { disposeKit } from "../src/kit-disposal.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { cameraPresetsForRoom } from "../src/stage.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { describeStructure } from "./support/structure.js";

const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;
const ONE_MM = 0.001;
const HALF_MM = 0.0005;
const EXACT_M = 1e-6;

/** ADR 0025 decision 3: the X-leg's carcass back face stands 20 mm behind wall A's plane. */
const X_LEG_BACK_M = -0.02;
/** The run's carcass front stands this far inside the cabinet-depth line (ADR 0135): `D − 30`. */
const RUN_CARCASS_FRONT_INSET_M = 0.03;
/** The leaf leaves 30 mm beside the return's carcass; the fixed front takes 18 of them. */
const LEAF_TO_FIXED_FRONT_M = 0.012;
const BASE_RETURN_BUILD_ID = "base-corner-return-320";
const X_LEG_BUILD_ID = "base-corner-x-900";
const RETURN_WIDTH_BEFORE_THE_JOINT_MOVED_MM = 320;
const JOINT_MOVE_MM = 10;

const CORNERS = [
  { xLegId: "p25", returnId: "p26", wallReturnId: "p9" },
  { xLegId: "right-p25", returnId: "right-p26", wallReturnId: "right-p9" },
] as const;

const ROOMS: readonly DesignRoom[] = [
  { shape: "U", widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
  { shape: "U", widthMm: 3600, depthMm: 2800, wallCMm: 2800, heightMm: 2600 },
  { shape: "U", widthMm: 3300, depthMm: 2400, wallCMm: 2600, heightMm: 2600 },
  // The two rooms that stand an oven tower beside a return: the left one, then the right one.
  { shape: "U", widthMm: 4200, depthMm: 1600, wallCMm: 1700, heightMm: 2600 },
  { shape: "U", widthMm: 4200, depthMm: 1700, wallCMm: 1600, heightMm: 2600 },
  { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 },
  {
    shape: "L",
    widthMm: 4100,
    depthMm: 3300,
    heightMm: 2600,
    cornerDirection: "right",
  },
  { shape: "L", widthMm: 1900, depthMm: 2000, heightMm: 2600 },
  {
    shape: "L",
    widthMm: 2400,
    depthMm: 2400,
    heightMm: 2600,
    cornerDirection: "right",
  },
];

const X_LEG_NEIGHBOUR_KINDS_THE_ROOMS_MUST_COVER = [
  "base-3drawer",
  "base-bottle-cargo",
  "base-cabinet",
  "base-dishwasher",
  "base-hob-2drawer",
  "base-sink",
];

/** The four lines, by the mesh that draws each on the X-leg and on a run body. A sink's worktop is
 *  cut in pieces, so its front edge is `countertop_front`. */
const LINES = [
  { line: "worktop", onLeg: /^countertop$/, onRun: /^countertop(_front)?$/ },
  { line: "face", onLeg: /^door_front$/, onRun: /^(door|drawer)_front$/ },
  { line: "carcass", onLeg: /^carcass$/, onRun: /^carcass_shell$/ },
  { line: "plinth", onLeg: /^plinth$/, onRun: /^plinth$/ },
] as const;

beforeAll(() => {
  installHeadlessDocument();
});

/** The kit as `kitchen-stage.tsx` builds it: both depths, always. */
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

interface Scene {
  readonly label: string;
  readonly design: Design;
  readonly root: THREE.Group;
  readonly isMirrored: boolean;
}

function mount(design: Design, label: string): Scene {
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
  const isMirrored =
    design.room.shape === "L" && cornerDirectionOf(design.room) === "right";
  if (isMirrored) applyCornerDirection(root, "right");
  root.updateMatrixWorld(true);
  return { label, design, root, isMirrored };
}

function roomLabel(room: DesignRoom): string {
  const direction = "cornerDirection" in room ? room.cornerDirection : "";
  const wallC = room.shape === "U" ? `/${String(room.wallCMm)}` : "";
  return `${room.shape}${direction ?? ""} ${String(room.widthMm)}/${String(room.depthMm)}${wallC}`;
}

let scenes: readonly Scene[] = [];

/** Each room at 600, after a change to 700, and after the change back to 600. */
function allScenes(): readonly Scene[] {
  if (scenes.length > 0) return scenes;
  scenes = ROOMS.flatMap((room) => {
    const shallow = generated(room);
    const deep = atDepth(shallow, DEEP_MM);
    return [
      mount(shallow, `${roomLabel(room)} @600`),
      mount(deep, `${roomLabel(room)} @700`),
      mount(atDepth(deep, SHALLOW_MM), `${roomLabel(room)} @700->600`),
    ];
  });
  return scenes;
}

function sceneNamed(label: string): Scene {
  return required(
    allScenes().find((scene) => scene.label === label),
    label,
  );
}

function bodyOf(scene: Scene, id: string): THREE.Object3D | undefined {
  return scene.root.children.find(
    (child) => child.userData["placementId"] === id,
  );
}

function placementOf(scene: Scene, id: string): DesignPlacement | undefined {
  return scene.design.placements.find((placement) => placement.id === id);
}

interface NamedBox {
  readonly owner: string;
  readonly name: string;
  readonly box: THREE.Box3;
}

function meshBoxesOf(owner: string, body: THREE.Object3D): NamedBox[] {
  const boxes: NamedBox[] = [];
  body.traverse((node) => {
    if (!isMesh(node)) return;
    boxes.push({
      owner,
      name: node.name,
      box: new THREE.Box3().setFromObject(node),
    });
  });
  return boxes;
}

function meshBox(scene: Scene, id: string, name: string): THREE.Box3 {
  const body = required(bodyOf(scene, id), `${scene.label} ${id}`);
  return required(
    meshBoxesOf(id, body).find((mesh) => mesh.name === name),
    `${scene.label} ${id} ${name}`,
  ).box;
}

/** A corner of this scene whose two base pieces are both mounted. */
function cornersOf(scene: Scene) {
  return CORNERS.filter((corner) => bodyOf(scene, corner.xLegId) !== undefined);
}

function spanOf(placement: DesignPlacement): readonly [number, number] {
  return [
    placement.alongMm - placement.body.widthMm / 2,
    placement.alongMm + placement.body.widthMm / 2,
  ];
}

/** The wall-A run body that butts this X-leg, on whichever side the run continues. */
function runBodyBeside(
  scene: Scene,
  leg: DesignPlacement,
): DesignPlacement | undefined {
  const [legStart, legEnd] = spanOf(leg);
  return scene.design.placements.find(
    (placement) =>
      placement.wall === "A" &&
      placement.y0Mm === 0 &&
      placement.id !== leg.id &&
      (spanOf(placement)[0] === legEnd || spanOf(placement)[1] === legStart),
  );
}

function frontOnWallAM(
  scene: Scene,
  id: string,
  pattern: RegExp,
): number | undefined {
  const fronts = meshBoxesOf(id, required(bodyOf(scene, id), id))
    .filter((mesh) => pattern.test(mesh.name))
    .map((mesh) => mesh.box.max.z);
  return fronts.length === 0 ? undefined : Math.max(...fronts);
}

interface Seam {
  readonly where: string;
  readonly neighbourBuildId: string;
  readonly line: string;
  readonly differenceM: number;
}

function xLegSeams(): Seam[] {
  return allScenes().flatMap((scene) =>
    cornersOf(scene).flatMap(({ xLegId }) => {
      const leg = placementOf(scene, xLegId);
      const neighbour = leg && runBodyBeside(scene, leg);
      if (!leg || !neighbour) return [];
      return LINES.flatMap(({ line, onLeg, onRun }) => {
        const theirs = frontOnWallAM(scene, neighbour.id, onRun);
        if (theirs === undefined) return [];
        const own = frontOnWallAM(scene, xLegId, onLeg) ?? Number.NaN;
        return [
          {
            where: `${scene.label} ${xLegId} beside ${neighbour.id}`,
            neighbourBuildId: neighbour.body.buildId,
            line,
            differenceM: own - theirs,
          },
        ];
      });
    }),
  );
}

describe("every X-leg seam in a generated room stands on the run's four lines (criterion 1)", () => {
  it("measures each kind of run body the rooms were chosen for", () => {
    const kinds = new Set(xLegSeams().map((seam) => seam.neighbourBuildId));

    expect([...kinds].sort()).toEqual(
      X_LEG_NEIGHBOUR_KINDS_THE_ROOMS_MUST_COVER,
    );
  });

  it.each(LINES.map(({ line }) => line))(
    "leaves no %s seam off the line, at 600, at 700 and back at 600",
    (line) => {
      const seams = xLegSeams().filter((seam) => seam.line === line);
      const off = seams
        .filter((seam) => !(Math.abs(seam.differenceM) <= EXACT_M))
        .map(
          (seam) =>
            `${seam.where} (${seam.neighbourBuildId}): ${(seam.differenceM * 1000).toFixed(2)} mm`,
        );

      expect(seams.length).toBeGreaterThanOrEqual(18);
      expect(off).toEqual([]);
    },
  );
});

interface JointReading {
  readonly where: string;
  readonly xLegBackM: number;
  readonly xLegFrontM: number;
  readonly carcassSlitM: number;
  readonly slabGapM: number;
  readonly leafToFixedFrontM: number;
}

function gapBetween(one: THREE.Box3, other: THREE.Box3, axis: "x" | "z") {
  return (
    Math.max(one.min[axis], other.min[axis]) -
    Math.min(one.max[axis], other.max[axis])
  );
}

function jointOf(scene: Scene, corner: (typeof CORNERS)[number]): JointReading {
  const legCarcass = meshBox(scene, corner.xLegId, "carcass");
  return {
    where: `${scene.label} ${corner.xLegId}`,
    xLegBackM: legCarcass.min.z,
    xLegFrontM: legCarcass.max.z,
    carcassSlitM: gapBetween(
      legCarcass,
      meshBox(scene, corner.returnId, "carcass"),
      "z",
    ),
    slabGapM: gapBetween(
      meshBox(scene, corner.xLegId, "countertop"),
      meshBox(scene, corner.returnId, "countertop"),
      "z",
    ),
    leafToFixedFrontM: gapBetween(
      meshBox(scene, corner.xLegId, "door_front"),
      meshBox(scene, corner.returnId, "fixed_front"),
      "x",
    ),
  };
}

function everyJoint(): JointReading[] {
  return allScenes().flatMap((scene) =>
    cornersOf(scene).map((corner) => jointOf(scene, corner)),
  );
}

describe("the joint in a freshly generated room (criterion 2)", () => {
  it("is read in every room, at every depth state, at both corners of a U", () => {
    expect(everyJoint()).toHaveLength(3 * (5 * 2 + 4));
  });

  it("keeps the X-leg's back face 20 mm behind wall A, exactly", () => {
    const off = everyJoint().filter(
      (joint) => Math.abs(joint.xLegBackM - X_LEG_BACK_M) > EXACT_M,
    );

    expect(off).toEqual([]);
  });

  it("ends the X-leg's carcass on the run's carcass front, D − 30", () => {
    const off = allScenes().flatMap((scene) => {
      const expectedM =
        cabinetDepthMmOf(scene.design) / 1000 - RUN_CARCASS_FRONT_INSET_M;
      return cornersOf(scene)
        .map((corner) => jointOf(scene, corner))
        .filter((joint) => Math.abs(joint.xLegFrontM - expectedM) > EXACT_M);
    });

    expect(off).toEqual([]);
  });

  it("leaves no slit and no overlap between the two carcasses, nor between the two slabs", () => {
    const off = everyJoint().filter(
      (joint) =>
        Math.abs(joint.carcassSlitM) > EXACT_M ||
        Math.abs(joint.slabGapM) > EXACT_M,
    );

    expect(off).toEqual([]);
  });

  it("stands the leaf 12 mm clear of the return's fixed front", () => {
    const off = everyJoint().filter(
      (joint) =>
        Math.abs(joint.leafToFixedFrontM - LEAF_TO_FIXED_FRONT_M) > EXACT_M,
    );

    expect(off).toEqual([]);
  });

  it("hangs the leaf as tall and as high as a base door", () => {
    const off = allScenes().flatMap((scene) => {
      const cabinet = productKit(
        cabinetDepthMmOf(scene.design),
      ).make.baseCabinet(0.6, { doors: 1 });
      cabinet.updateMatrixWorld(true);
      const door = new THREE.Box3().setFromObject(
        required(cabinet.getObjectByName("door_front"), "a base door"),
      );
      return cornersOf(scene).flatMap(({ xLegId }) => {
        const leaf = meshBox(scene, xLegId, "door_front");
        return Math.abs(leaf.min.y - door.min.y) > EXACT_M ||
          Math.abs(leaf.max.y - door.max.y) > EXACT_M
          ? [`${scene.label} ${xLegId}`]
          : [];
      });
    });

    expect(off).toEqual([]);
  });
});

const AXES = ["x", "y", "z"] as const;

function overlapM(one: THREE.Box3, other: THREE.Box3, axis: "x" | "y" | "z") {
  return (
    Math.min(one.max[axis], other.max[axis]) -
    Math.max(one.min[axis], other.min[axis])
  );
}

/** Every mesh of the X-leg against every mesh of every **other** body. Its own fittings stand inside
 *  its solid carcass by construction, so pairs within the leg are not a finding. */
function pairsAround(scene: Scene, id: string): [NamedBox, NamedBox][] {
  const body = bodyOf(scene, id);
  if (!body) return [];
  const others = scene.root.children.flatMap((other) => {
    const owner = other.userData["placementId"] as string | undefined;
    return owner === undefined || owner === id ? [] : meshBoxesOf(owner, other);
  });
  return meshBoxesOf(id, body).flatMap((mesh) =>
    others.map((other): [NamedBox, NamedBox] => [mesh, other]),
  );
}

describe("the X-leg and its neighbours (3D contract)", () => {
  it("intersects no mesh of any other body by half a millimetre in every axis", () => {
    const pairs = allScenes().flatMap((scene) =>
      cornersOf(scene).flatMap(({ xLegId }) =>
        pairsAround(scene, xLegId)
          .filter(([one, other]) =>
            AXES.every((axis) => overlapM(one.box, other.box, axis) > HALF_MM),
          )
          .map(
            ([one, other]) =>
              `${scene.label}: ${one.owner}/${one.name} into ${other.owner}/${other.name}`,
          ),
      ),
    );

    expect(pairs).toEqual([]);
  });

  it("puts no face within half a millimetre of a parallel face it overlaps, facing the same way", () => {
    const pairs = allScenes().flatMap((scene) =>
      cornersOf(scene).flatMap(({ xLegId }) =>
        pairsAround(scene, xLegId).flatMap(([one, other]) =>
          AXES.flatMap((axis) => {
            const overlaps = AXES.filter(
              (candidate) => candidate !== axis,
            ).every(
              (candidate) => overlapM(one.box, other.box, candidate) > HALF_MM,
            );
            if (!overlaps) return [];
            return (["min", "max"] as const)
              .filter(
                (side) =>
                  Math.abs(one.box[side][axis] - other.box[side][axis]) <
                  HALF_MM,
              )
              .map(
                (side) =>
                  `${scene.label}: ${one.owner}/${one.name} and ${other.owner}/${other.name} share their ${side} ${axis} face`,
              );
          }),
        ),
      ),
    );

    expect(pairs).toEqual([]);
  });

  it("draws the right corner's X-leg as the mirror of the left's in every U", () => {
    const us = allScenes().filter((scene) => scene.design.room.shape === "U");
    expect(us).toHaveLength(15);

    for (const scene of us) {
      const widthM = scene.design.room.widthMm / 1000;
      const left = meshBoxesOf("p25", required(bodyOf(scene, "p25"), "p25"));
      const right = meshBoxesOf(
        "right-p25",
        required(bodyOf(scene, "right-p25"), "right-p25"),
      );
      expect(right.map((mesh) => mesh.name)).toEqual(
        left.map((mesh) => mesh.name),
      );
      left.forEach((mesh, at) => {
        const mirrored = required(right[at], "mirrored mesh").box;
        expect(mirrored.min.x).toBeCloseTo(widthM - mesh.box.max.x, 6);
        expect(mirrored.max.x).toBeCloseTo(widthM - mesh.box.min.x, 6);
        expect(mirrored.min.y).toBeCloseTo(mesh.box.min.y, 6);
        expect(mirrored.max.y).toBeCloseTo(mesh.box.max.y, 6);
        expect(mirrored.min.z).toBeCloseTo(mesh.box.min.z, 6);
        expect(mirrored.max.z).toBeCloseTo(mesh.box.max.z, 6);
      });
    }
  });

  it("draws a right-hand L's X-leg as the mirror of the left-hand L's", () => {
    for (const depth of ["@600", "@700", "@700->600"]) {
      const left = sceneNamed(`L 4100/3300 ${depth}`);
      const right = sceneNamed(`Lright 4100/3300 ${depth}`);
      const leftMeshes = meshBoxesOf("p25", required(bodyOf(left, "p25"), "l"));
      const rightMeshes = meshBoxesOf(
        "p25",
        required(bodyOf(right, "p25"), "r"),
      );
      expect(rightMeshes.map((mesh) => mesh.name)).toEqual(
        leftMeshes.map((mesh) => mesh.name),
      );
      leftMeshes.forEach((mesh, at) => {
        const mirrored = required(rightMeshes[at], "mirrored mesh").box;
        expect(mirrored.min.x).toBeCloseTo(-mesh.box.max.x, 6);
        expect(mirrored.max.x).toBeCloseTo(-mesh.box.min.x, 6);
        expect(mirrored.min.z).toBeCloseTo(mesh.box.min.z, 6);
        expect(mirrored.max.z).toBeCloseTo(mesh.box.max.z, 6);
      });
    }
  });

  /** Criterion 5: no wall-row corner piece moves. The side wall's upper corner cabinet starts at the
   *  wall carcass depth (330 at 600, 400 at 700), and at 600 its far edge is the base return's. */
  it("leaves the side wall's upper corner cabinet starting at the wall depth, flush with the base return's far edge at 600", () => {
    const problems = allScenes().flatMap((scene) => {
      const cabinetDepthMm = cabinetDepthMmOf(scene.design);
      return cornersOf(scene).flatMap(({ returnId, wallReturnId }) => {
        const upper = new THREE.Box3().setFromObject(
          required(bodyOf(scene, wallReturnId), `${scene.label} upper`),
        );
        const base = meshBox(scene, returnId, "carcass");
        const found: string[] = [];
        if (
          Math.abs(upper.min.z - wallCarcassDepthMm(cabinetDepthMm) / 1000) >
          EXACT_M
        )
          found.push(
            `${scene.label} ${wallReturnId} starts ${String(upper.min.z)}`,
          );
        if (
          cabinetDepthMm === SHALLOW_MM &&
          Math.abs(upper.max.z - base.max.z) > EXACT_M
        )
          found.push(`${scene.label} ${wallReturnId} far edge off the base's`);
        return found;
      });
    });

    expect(problems).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------------
// `corner-widths.test.ts` dropped its digest of the decomposed X-leg with this slice. The parity gate
// pins the builder against the vendored reference, mesh by mesh; this ties the decomposed body to it.
// -------------------------------------------------------------------------------------------------

describe("the decomposed X-leg is the builder the parity gate pins", () => {
  it.each([SHALLOW_MM, DEEP_MM])(
    "builds the same tree as `cornerBaseX` at the reference width, at %i mm",
    (cabinetDepthMm) => {
      const kit = productKit(cabinetDepthMm);

      expect(
        describeStructure(buildDecomposedBody(kit, X_LEG_BUILD_ID)),
      ).toEqual(describeStructure(kit.make.cornerBaseX(0.9)));
    },
  );
});

// -------------------------------------------------------------------------------------------------
// Picking the corner from where a customer looks: the leaf, and the 12 mm between it and the fixed
// front, behind which the X-leg's carcass stands.
// -------------------------------------------------------------------------------------------------

const PICKING_ROOMS = [
  "U 4500/3000/3600 @600",
  "U 4500/3000/3600 @700",
  "L 4100/3300 @600",
  "Lright 4100/3300 @600",
  "U 4200/1600/1700 @600",
];

function pickFrom(scene: Scene, origin: THREE.Vector3, target: THREE.Vector3) {
  const raycaster = createPickingRaycaster();
  raycaster.set(origin, target.clone().sub(origin).normalize());
  return pick(raycaster, scene.root, new THREE.Group())?.id;
}

/** The middle of the strip between the leaf and the fixed front, on the door plane. */
function gapPoint(scene: Scene, corner: (typeof CORNERS)[number]) {
  const leaf = meshBox(scene, corner.xLegId, "door_front");
  const front = meshBox(scene, corner.returnId, "fixed_front");
  const x =
    leaf.min.x >= front.max.x
      ? (leaf.min.x + front.max.x) / 2
      : (leaf.max.x + front.min.x) / 2;
  return new THREE.Vector3(x, (leaf.min.y + leaf.max.y) / 2, leaf.max.z);
}

function eyesOn(scene: Scene): readonly (readonly [string, THREE.Vector3])[] {
  const room = scene.design.room;
  const sign = scene.isMirrored ? -1 : 1;
  const standing = new THREE.Vector3(
    (sign * room.widthMm) / 2000,
    1.6,
    Math.min(room.depthMm / 1000 - 0.2, 2),
  );
  return [
    ["standing in the room", standing],
    ...cameraPresetsForRoom(room).map(
      (preset) =>
        [
          `the ${preset.id} preset`,
          new THREE.Vector3(...preset.position),
        ] as const,
    ),
  ];
}

describe.each(PICKING_ROOMS)("%s: picking at the corner", (label) => {
  it("selects the X-leg by a ray straight at its leaf, from two metres", () => {
    const scene = sceneNamed(label);
    for (const corner of cornersOf(scene)) {
      const leaf = meshBox(scene, corner.xLegId, "door_front");
      const target = leaf.getCenter(new THREE.Vector3()).setZ(leaf.max.z);
      const origin = target.clone().add(new THREE.Vector3(0, 0, 2));

      expect([corner.xLegId, pickFrom(scene, origin, target)]).toEqual([
        corner.xLegId,
        corner.xLegId,
      ]);
    }
  });

  /** From 300 mm, which is still in front of the return itself: further out, the side run's own
   *  bodies (a fridge, an oven's glass) stand across a ray that grazes 6 mm in front of its doors. */
  it("selects the X-leg through the 12 mm between the leaf and the fixed front, straight on", () => {
    const scene = sceneNamed(label);
    for (const corner of cornersOf(scene)) {
      const target = gapPoint(scene, corner);
      const origin = target.clone().add(new THREE.Vector3(0, 0, 0.3));

      expect([corner.xLegId, pickFrom(scene, origin, target)]).toEqual([
        corner.xLegId,
        corner.xLegId,
      ]);
    }
  });

  it("never loses a tap aimed at that strip or at the leaf, from standing height or any preset", () => {
    const scene = sceneNamed(label);
    const lost: string[] = [];
    for (const [eyeName, eye] of eyesOn(scene)) {
      applyCutaway(
        scene.root,
        new THREE.Group(),
        cutawayWallsFor(
          [eye.x, eye.y, eye.z],
          scene.design.room,
          cabinetDepthMmOf(scene.design),
        ),
      );
      for (const corner of cornersOf(scene)) {
        if (!required(bodyOf(scene, corner.xLegId), "leg").visible) continue;
        const leaf = meshBox(scene, corner.xLegId, "door_front");
        for (const [aim, target] of [
          ["strip", gapPoint(scene, corner)],
          ["leaf", leaf.getCenter(new THREE.Vector3()).setZ(leaf.max.z)],
        ] as const) {
          if (pickFrom(scene, eye, target) === undefined)
            lost.push(`${corner.xLegId} ${aim} from ${eyeName}`);
        }
      }
      applyCutaway(scene.root, new THREE.Group(), []);
    }

    expect(lost).toEqual([]);
  });

  it("selects the corner's own two pieces, never a third body, from standing height", () => {
    const scene = sceneNamed(label);
    const [, eye] = required(eyesOn(scene)[0], "the standing eye");
    for (const corner of cornersOf(scene)) {
      const picked = pickFrom(scene, eye, gapPoint(scene, corner));

      expect([corner.xLegId, corner.returnId]).toContain(picked);
    }
  });
});

// -------------------------------------------------------------------------------------------------
// A design stored before the joint moved (ADR 0135 decision 5): a 320 mm return starting at D − 20.
// It loads without a finding and shows a 10 mm slit; no migration (ADR 0038).
// -------------------------------------------------------------------------------------------------

/** The generated design as the tree before S2 wrote it: the return 10 mm narrower and its centre 5 mm
 *  further along, in the placement and in its recorded column. Measured against that tree: these are
 *  the only fields that differ besides the X-leg's recorded column depth, which the scene never reads. */
function asStoredBeforeTheJointMoved(design: Design): Design {
  const halfMoveMm = JOINT_MOVE_MM / 2;
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.body.buildId === BASE_RETURN_BUILD_ID
        ? {
            ...placement,
            alongMm: placement.alongMm + halfMoveMm,
            body: {
              ...placement.body,
              widthMm: placement.body.widthMm - JOINT_MOVE_MM,
            },
          }
        : placement,
    ),
    columnExtents: (design.columnExtents ?? []).map((extent) =>
      extent.depthFromBuildId === BASE_RETURN_BUILD_ID
        ? {
            ...extent,
            alongMm: extent.alongMm + halfMoveMm,
            widthMm: extent.widthMm - JOINT_MOVE_MM,
          }
        : extent.depthFromBuildId === X_LEG_BUILD_ID
          ? { ...extent, depthMm: extent.depthMm + JOINT_MOVE_MM }
          : extent,
    ),
  };
}

describe.each([
  ["L", ROOMS[5]],
  ["right-hand L", ROOMS[6]],
  ["U", ROOMS[0]],
] as const)("a %s stored before the joint moved", (_shape, room) => {
  const stored = asStoredBeforeTheJointMoved(generated(required(room, "room")));

  it("is the old document: a 320 mm return", () => {
    const widths = stored.placements
      .filter((placement) => placement.body.buildId === BASE_RETURN_BUILD_ID)
      .map((placement) => placement.body.widthMm);

    expect(new Set(widths)).toEqual(
      new Set([RETURN_WIDTH_BEFORE_THE_JOINT_MOVED_MM]),
    );
  });

  it.each([SHALLOW_MM, DEEP_MM])(
    "loads at %i without a finding and shows a 10 mm slit in carcass and worktop",
    (cabinetDepthMm) => {
      const design =
        cabinetDepthMm === SHALLOW_MM
          ? stored
          : atDepth(stored, cabinetDepthMm);
      const scene = mount(design, "stored");

      expect(
        validateDesignForCatalog(
          design,
          buildKitchenLBodyCatalog(cabinetDepthMm),
        ),
      ).toEqual([]);
      for (const corner of cornersOf(scene)) {
        const joint = jointOf(scene, corner);
        expect(joint.carcassSlitM).toBeCloseTo(JOINT_MOVE_MM * ONE_MM, 6);
        expect(joint.slabGapM).toBeCloseTo(JOINT_MOVE_MM * ONE_MM, 6);
        expect(joint.xLegBackM).toBeCloseTo(X_LEG_BACK_M, 6);
      }
    },
  );
});
