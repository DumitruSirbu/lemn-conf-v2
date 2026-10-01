// M7C wave C4 slice S1 adversarial QA — the base return on the run's lines (ADR 0135 draft).
//
// Independent of `base-corner-return-lines.test.ts`: every claim here is read off a **mounted,
// generated room** (real probe) rather than off two standalone builders, at 600 and after a change
// to 700, in an L, a right-hand L and both corners of a U.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  cornerDirectionOf,
  createBodyProbeLease,
  derivePlacementRecords,
  generateKitchen,
  KITCHEN_L_DESIGN,
  paletteFinish,
  setCabinetDepth,
  type BodyProbeFactory,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type Finish,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyCornerDirection } from "../src/corner-direction.js";
import { applyCutaway, cutawayWallsFor } from "../src/cutaway.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { disposeKit } from "../src/kit-disposal.js";
import { makeKit } from "../src/kitchen-parts.js";
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
import { labelOf, mountedById, mountU, SWEPT_US } from "./support/u-scene.js";

const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const DEEP_MM = 700;
const ONE_MM = 0.001;
const HALF_MM = 0.0005;
const EXACT_M = 1e-6;

const RETURN_IDS = ["p26", "right-p26"] as const;
const X_LEG_IDS = ["p25", "right-p25"] as const;

/** Each room's side-wall return stands beside a different kind of body; named in the assertion that
 *  counts them, so a planner change that takes a kind away fails by name instead of going vacuous. */
const ROOMS: readonly DesignRoom[] = [
  { shape: "U", widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
  { shape: "U", widthMm: 3600, depthMm: 2800, wallCMm: 2800, heightMm: 2600 },
  { shape: "U", widthMm: 3300, depthMm: 2400, wallCMm: 2600, heightMm: 2600 },
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
    widthMm: 1900,
    depthMm: 2000,
    heightMm: 2600,
    cornerDirection: "right",
  },
  { shape: "L", widthMm: 1900, depthMm: 2500, heightMm: 2600 },
  { shape: "L", widthMm: 900, depthMm: 2500, heightMm: 2600 },
  {
    shape: "L",
    widthMm: 2400,
    depthMm: 2400,
    heightMm: 2600,
    cornerDirection: "right",
  },
];

const NEIGHBOUR_KINDS_THE_ROOMS_MUST_COVER = [
  "base-3drawer",
  "base-cabinet",
  "base-dishwasher",
  "base-hob-2drawer",
  "base-hob-oven",
  "base-panbank",
  "base-sink",
];

/** The four lines, each by the mesh that draws it on the return and on a run body. A run body that
 *  has no such mesh (a sink has no one-piece `countertop`) is skipped for that line and counted. */
const LINES = [
  { line: "worktop", onReturn: /^countertop$/, onRun: /^countertop$/ },
  {
    line: "face",
    onReturn: /^fixed_front$/,
    onRun: /^(door_front|drawer_front|oven_filler_door_front)$/,
  },
  { line: "carcass", onReturn: /^carcass$/, onRun: /^carcass_shell$/ },
  { line: "plinth", onReturn: /^plinth$/, onRun: /^plinth$/ },
] as const;

beforeAll(() => {
  installHeadlessDocument();
});

function realProbeFactory(): BodyProbeFactory {
  return (cabinetDepthMm) => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
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

function deepened(design: Design): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: realProbeFactory(),
    cabinetDepthMm: DEEP_MM,
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
  const kit = makeKit({ createCanvas: createHeadlessCanvas, cabinetDepthMm });
  const root = new THREE.Group();
  syncSolidBodies({
    kit,
    solidsRoot: root,
    records: derivePlacementRecords(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMm),
    ),
    room: design.room,
    kitchenFinish: undefined,
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

function allScenes(): readonly Scene[] {
  if (scenes.length > 0) return scenes;
  scenes = ROOMS.flatMap((room) => {
    const at600 = generated(room);
    return [
      mount(at600, `${roomLabel(room)} @600`),
      mount(deepened(at600), `${roomLabel(room)} @700`),
    ];
  });
  return scenes;
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

/** How far a box's room-side face stands from its own wall's plane, in metres. */
function frontFromWallM(scene: Scene, wall: string, box: THREE.Box3): number {
  if (wall === "A") return box.max.z;
  if (wall === "B") return scene.isMirrored ? -box.min.x : box.max.x;
  return scene.design.room.widthMm / 1000 - box.min.x;
}

function lineFrontM(
  scene: Scene,
  id: string,
  pattern: RegExp,
): number | undefined {
  const placement = required(placementOf(scene, id), `placement ${id}`);
  const fronts = meshBoxesOf(id, required(bodyOf(scene, id), `mounted ${id}`))
    .filter((mesh) => pattern.test(mesh.name))
    .map((mesh) => frontFromWallM(scene, placement.wall, mesh.box));
  return fronts.length === 0 ? undefined : Math.max(...fronts);
}

function spanOf(placement: DesignPlacement): readonly [number, number] {
  return [
    placement.alongMm - placement.body.widthMm / 2,
    placement.alongMm + placement.body.widthMm / 2,
  ];
}

function abuttingRunBody(
  scene: Scene,
  corner: DesignPlacement,
): DesignPlacement | undefined {
  const [, cornerEnd] = spanOf(corner);
  return scene.design.placements.find(
    (placement) =>
      placement.wall === corner.wall &&
      placement.y0Mm === 0 &&
      spanOf(placement)[0] === cornerEnd,
  );
}

interface Seam {
  readonly where: string;
  readonly neighbourBuildId: string;
  readonly line: string;
  readonly differenceM: number;
}

function returnSeams(): Seam[] {
  return allScenes().flatMap((scene) =>
    RETURN_IDS.flatMap((id) => {
      const corner = placementOf(scene, id);
      const neighbour = corner && abuttingRunBody(scene, corner);
      if (!corner || !neighbour) return [];
      return LINES.flatMap(({ line, onReturn, onRun }) => {
        const own = lineFrontM(scene, id, onReturn);
        const theirs = lineFrontM(scene, neighbour.id, onRun);
        if (theirs === undefined) return [];
        return [
          {
            where: `${scene.label} ${id} beside ${neighbour.id}`,
            neighbourBuildId: neighbour.body.buildId,
            line,
            differenceM: (own ?? Number.NaN) - theirs,
          },
        ];
      });
    }),
  );
}

describe("every return seam in a generated room stands on the run's four lines (criterion 1)", () => {
  it("measures each kind of run body the rooms were chosen for, at both depths", () => {
    const kinds = new Set(returnSeams().map((seam) => seam.neighbourBuildId));

    expect([...kinds].sort()).toEqual(NEIGHBOUR_KINDS_THE_ROOMS_MUST_COVER);
  });

  it.each(LINES.map(({ line }) => line))(
    "leaves no %s seam off the line by a millimetre",
    (line) => {
      const seams = returnSeams().filter((seam) => seam.line === line);
      const off = seams
        .filter((seam) => !(Math.abs(seam.differenceM) <= EXACT_M))
        .map(
          (seam) =>
            `${seam.where} (${seam.neighbourBuildId}): ${(seam.differenceM * 1000).toFixed(2)} mm`,
        );

      expect(seams.length).toBeGreaterThanOrEqual(12);
      expect(off).toEqual([]);
    },
  );

  it("measures the face beside both hob cabinets, on a drawer front and on the oven's filler door", () => {
    const hobFaces = returnSeams().filter(
      (seam) => seam.line === "face" && seam.neighbourBuildId.includes("hob"),
    );

    expect(
      [...new Set(hobFaces.map((seam) => seam.neighbourBuildId))].sort(),
    ).toEqual(["base-hob-2drawer", "base-hob-oven"]);
    for (const seam of hobFaces) {
      expect([seam.where, Math.abs(seam.differenceM) <= EXACT_M]).toEqual([
        seam.where,
        true,
      ]);
    }
  });
});

describe("the return keeps its own structure (3D contract, criterion 3)", () => {
  it("keeps its back face on the wall, its slab's too, and its plinth behind its own carcass", () => {
    const problems = allScenes().flatMap((scene) =>
      RETURN_IDS.flatMap((id) => {
        const placement = placementOf(scene, id);
        if (!placement) return [];
        const read = (name: string) =>
          required(
            meshBoxesOf(id, required(bodyOf(scene, id), id)).find(
              (mesh) => mesh.name === name,
            ),
            `${id} ${name}`,
          ).box;
        const backOf = (box: THREE.Box3) =>
          frontFromWallM(scene, placement.wall, box) - depthOf(box, placement);
        const found: string[] = [];
        for (const name of ["carcass", "countertop"]) {
          if (Math.abs(backOf(read(name))) > EXACT_M)
            found.push(`${scene.label} ${id} ${name} back off the wall`);
        }
        const plinthFront = frontFromWallM(
          scene,
          placement.wall,
          read("plinth"),
        );
        const carcassFront = frontFromWallM(
          scene,
          placement.wall,
          read("carcass"),
        );
        if (!(plinthFront < carcassFront - ONE_MM))
          found.push(`${scene.label} ${id} plinth proud of its carcass`);
        return found;
      }),
    );

    expect(problems).toEqual([]);
  });

  it("intersects no mesh of any other body, and none of its own, by half a millimetre", () => {
    const pairs = allScenes().flatMap((scene) =>
      RETURN_IDS.flatMap((id) => interpenetrationsOf(scene, id)),
    );

    expect(pairs).toEqual([]);
  });

  it("puts no face within half a millimetre of a parallel face it overlaps, facing the same way", () => {
    const pairs = allScenes().flatMap((scene) =>
      RETURN_IDS.flatMap((id) => coplanarFacesOf(scene, id)),
    );

    expect(pairs).toEqual([]);
  });

  it("butts the X-leg's slab: the two stone volumes touch and share no volume", () => {
    const gaps = allScenes().flatMap((scene) =>
      RETURN_IDS.flatMap((id, at) => {
        const leg = bodyOf(scene, X_LEG_IDS[at] ?? "");
        const own = bodyOf(scene, id);
        if (!leg || !own) return [];
        const stoneOf = (owner: string, body: THREE.Object3D) =>
          required(
            meshBoxesOf(owner, body).find((mesh) => mesh.name === "countertop"),
            `${owner} countertop`,
          ).box;
        const mine = stoneOf(id, own);
        const theirs = stoneOf("x-leg", leg);
        return [[scene.label, id, mine.min.z - theirs.max.z] as const];
      }),
    );

    expect(gaps.length).toBeGreaterThanOrEqual(2 * ROOMS.length);
    for (const [label, id, gapM] of gaps) {
      expect([label, id, Math.abs(gapM) <= EXACT_M]).toEqual([label, id, true]);
    }
  });

  it("draws the fixed front where a base door would hang: as tall, at the same height, centred with a 3 mm reveal", () => {
    const REVEAL_M = 0.003;
    const problems = allScenes().flatMap((scene) =>
      RETURN_IDS.flatMap((id) => {
        const body = bodyOf(scene, id);
        if (!body) return [];
        const kit = makeKit({
          createCanvas: createHeadlessCanvas,
          cabinetDepthMm: cabinetDepthMmOf(scene.design),
        });
        const cabinet = kit.make.baseCabinet(0.6, { doors: 1 });
        cabinet.updateMatrixWorld(true);
        const door = new THREE.Box3().setFromObject(
          required(cabinet.getObjectByName("door_front"), "a base door"),
        );
        const own = meshBoxesOf(id, body);
        const read = (name: string) =>
          required(
            own.find((mesh) => mesh.name === name),
            `${id} ${name}`,
          ).box;
        const front = read("fixed_front");
        const carcass = read("carcass");
        const offsets = [
          front.min.y - door.min.y,
          front.max.y - door.max.y,
          front.min.z - carcass.min.z - REVEAL_M,
          carcass.max.z - front.max.z - REVEAL_M,
        ];
        return offsets.some((offset) => Math.abs(offset) > EXACT_M)
          ? [
              `${scene.label} ${id}: ${offsets.map((o) => (o * 1000).toFixed(2)).join(" / ")} mm`,
            ]
          : [];
      }),
    );

    expect(problems).toEqual([]);
  });

  it("draws the right corner's return as the mirror of the left's in every U", () => {
    const us = allScenes().filter((scene) => scene.design.room.shape === "U");
    expect(us.length).toBe(6);

    for (const scene of us) {
      const widthM = scene.design.room.widthMm / 1000;
      const left = meshBoxesOf("p26", required(bodyOf(scene, "p26"), "p26"));
      const right = meshBoxesOf(
        "right-p26",
        required(bodyOf(scene, "right-p26"), "right-p26"),
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

  it("draws a right-hand L's return as the mirror of the left-hand L's", () => {
    const boxesOf = (label: string) => {
      const scene = required(
        allScenes().find((candidate) => candidate.label === label),
        label,
      );
      return meshBoxesOf("p26", required(bodyOf(scene, "p26"), "p26"));
    };
    for (const depth of ["@600", "@700"]) {
      const left = boxesOf(`L 4100/3300 ${depth}`);
      const right = boxesOf(`Lright 4100/3300 ${depth}`);
      expect(right.map((mesh) => mesh.name)).toEqual([
        "plinth",
        "carcass",
        "fixed_front",
        "countertop",
      ]);
      left.forEach((mesh, at) => {
        const mirrored = required(right[at], "mirrored mesh").box;
        expect(mirrored.min.x).toBeCloseTo(-mesh.box.max.x, 6);
        expect(mirrored.max.x).toBeCloseTo(-mesh.box.min.x, 6);
        expect(mirrored.min.z).toBeCloseTo(mesh.box.min.z, 6);
        expect(mirrored.max.z).toBeCloseTo(mesh.box.max.z, 6);
      });
    }
  });
});

function depthOf(box: THREE.Box3, placement: DesignPlacement): number {
  return placement.wall === "A" ? box.max.z - box.min.z : box.max.x - box.min.x;
}

const AXES = ["x", "y", "z"] as const;

function overlapM(one: THREE.Box3, other: THREE.Box3, axis: "x" | "y" | "z") {
  return (
    Math.min(one.max[axis], other.max[axis]) -
    Math.max(one.min[axis], other.min[axis])
  );
}

function everyOtherMesh(scene: Scene, id: string): NamedBox[] {
  return scene.root.children.flatMap((body) => {
    const owner = body.userData["placementId"] as string | undefined;
    return owner === undefined || owner === id ? [] : meshBoxesOf(owner, body);
  });
}

function pairsAround(scene: Scene, id: string): [NamedBox, NamedBox][] {
  const body = bodyOf(scene, id);
  if (!body) return [];
  const own = meshBoxesOf(id, body);
  const others = everyOtherMesh(scene, id);
  const withinItself = own.flatMap((mesh, at) =>
    own.slice(at + 1).map((later): [NamedBox, NamedBox] => [mesh, later]),
  );
  const withOthers = own.flatMap((mesh) =>
    others.map((other): [NamedBox, NamedBox] => [mesh, other]),
  );
  return [...withinItself, ...withOthers];
}

function interpenetrationsOf(scene: Scene, id: string): string[] {
  return pairsAround(scene, id)
    .filter(([one, other]) =>
      AXES.every((axis) => overlapM(one.box, other.box, axis) > HALF_MM),
    )
    .map(
      ([one, other]) =>
        `${scene.label}: ${one.owner}/${one.name} into ${other.owner}/${other.name}`,
    );
}

/** Two faces that would fight for the same pixels: parallel, facing the same way, within half a
 *  millimetre, and overlapping in both other axes. Two bodies that merely butt share a face with
 *  opposite normals and are not listed. */
function coplanarFacesOf(scene: Scene, id: string): string[] {
  return pairsAround(scene, id).flatMap(([one, other]) =>
    AXES.flatMap((axis) => {
      const others = AXES.filter((candidate) => candidate !== axis);
      const overlaps = others.every(
        (candidate) => overlapM(one.box, other.box, candidate) > HALF_MM,
      );
      if (!overlaps) return [];
      return (["min", "max"] as const)
        .filter(
          (side) =>
            Math.abs(one.box[side][axis] - other.box[side][axis]) < HALF_MM,
        )
        .map(
          (side) =>
            `${scene.label}: ${one.owner}/${one.name} and ${other.owner}/${other.name} share their ${side} ${axis} face`,
        );
    }),
  );
}

// -------------------------------------------------------------------------------------------------
// The digest `corner-widths.test.ts` dropped for this body pinned the **decomposed** build. The
// parity gate pins the builder against the vendored reference, mesh by mesh; this ties the two.
// -------------------------------------------------------------------------------------------------

describe("the decomposed base return is the builder the parity gate pins", () => {
  it.each([600, DEEP_MM])(
    "builds the same tree as `cornerBaseReturn` at its default depth, at %i mm",
    (cabinetDepthMm) => {
      const kit = makeKit({
        createCanvas: createHeadlessCanvas,
        cabinetDepthMm,
      });

      expect(
        describeStructure(buildDecomposedBody(kit, "base-corner-return-320")),
      ).toEqual(
        describeStructure(
          kit.make.cornerBaseReturn(kit.depths.cornerReturnDepthM, 0.32),
        ),
      );
    },
  );
});

// -------------------------------------------------------------------------------------------------
// Picking: the fixed front is the return's, from where a customer actually looks.
// -------------------------------------------------------------------------------------------------

describe.each(
  SWEPT_US.map((dimensions) => [labelOf(dimensions), dimensions] as const),
)(
  "%s: the return is picked from the room, not only from 5 cm",
  (_label, dimensions) => {
    const scene = mountU(dimensions);
    const faceCentre = (id: string) =>
      new THREE.Box3()
        .setFromObject(
          required(mountedById(scene, id).getObjectByName("fixed_front"), id),
        )
        .getCenter(new THREE.Vector3());

    function pickFrom(origin: THREE.Vector3, target: THREE.Vector3) {
      const raycaster = createPickingRaycaster();
      raycaster.set(origin, target.clone().sub(origin).normalize());
      return pick(raycaster, scene.stage.solidsRoot, new THREE.Group())?.id;
    }

    it.each(RETURN_IDS)(
      "selects %s by a level ray from the middle of the floor between the two returns",
      (id) => {
        const target = faceCentre(id);
        const middle = faceCentre("p26").lerp(faceCentre("right-p26"), 0.5);

        expect(pickFrom(middle.setY(target.y), target)).toBe(id);
      },
    );

    it.each(RETURN_IDS)(
      "selects %s from standing height at the middle of the room",
      (id) => {
        const target = faceCentre(id);
        const eye = faceCentre("p26")
          .lerp(faceCentre("right-p26"), 0.5)
          .setY(1.6);

        expect(pickFrom(eye, target)).toBe(id);
      },
    );

    it.each([
      ["wallB", "p26"],
      ["wallC", "right-p26"],
    ] as const)(
      "selects the return the %s preset looks at (%s), with that eye's cutaway applied",
      (presetId, id) => {
        const preset = required(
          cameraPresetsForRoom(scene.design.room).find(
            (candidate) => candidate.id === presetId,
          ),
          presetId,
        );
        applyCutaway(
          scene.stage.solidsRoot,
          new THREE.Group(),
          cutawayWallsFor(preset.position, scene.design.room, 600),
        );

        const picked = pickFrom(
          new THREE.Vector3(...preset.position),
          faceCentre(id),
        );
        applyCutaway(scene.stage.solidsRoot, new THREE.Group(), []);

        expect(picked).toBe(id);
      },
    );
  },
);

// -------------------------------------------------------------------------------------------------
// The fixed front is the body's finish and nothing else (criterion 3's must-nots, criterion 6).
// -------------------------------------------------------------------------------------------------

describe("the fixed front wears what the run's doors wear", () => {
  const RETURN_ID = "p26";
  const ORDINARY_ID = "p1";
  const MATERIAL_IDS = [
    "material.melamine",
    "material.painted-mdf",
    "material.veneer",
  ];
  const KITCHEN_FINISHES: readonly (Finish | undefined)[] = [
    undefined,
    paletteFinish("pal.antracit"),
    paletteFinish("pal.stejar-halifax"),
  ];

  function following(
    materialTierId: string,
    finish: Finish | undefined,
  ): Design {
    const settings = { ...KITCHEN_L_DESIGN.settings, materialTierId };
    delete settings.finish;
    return {
      ...KITCHEN_L_DESIGN,
      settings: { ...settings, ...(finish ? { finish } : {}) },
      placements: KITCHEN_L_DESIGN.placements.map((placement) => {
        const body = { ...placement.body };
        delete body.finish;
        return { ...placement, body };
      }),
    };
  }

  function drawnBody(design: Design, id: string): THREE.Object3D {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const root = new THREE.Group();
    syncSolidBodies({
      kit,
      solidsRoot: root,
      records: derivePlacementRecords(design, buildKitchenLBodyCatalog(600)),
      room: design.room,
    });
    return required(
      root.children.find((child) => child.userData["placementId"] === id),
      id,
    );
  }

  function wornBy(body: THREE.Object3D, name: string): string {
    const mesh = required(body.getObjectByName(name), name);
    if (!isMesh(mesh) || Array.isArray(mesh.material))
      throw new Error(`${name} is not a single-material mesh`);
    const material = mesh.material as THREE.MeshStandardMaterial;
    return JSON.stringify({
      colour: material.color.getHexString(),
      hasMap: material.map !== null,
      roughness: material.roughness,
      metalness: material.metalness,
    });
  }

  it.each(
    MATERIAL_IDS.flatMap((materialId) =>
      KITCHEN_FINISHES.map((finish) => [materialId, finish] as const),
    ),
  )("under %s and kitchen colour %o", (materialId, finish) => {
    const design = following(materialId, finish);

    expect(wornBy(drawnBody(design, RETURN_ID), "fixed_front")).toBe(
      wornBy(drawnBody(design, ORDINARY_ID), "door_front"),
    );
  });

  /** ADR 0078 decision 3: a document whose material names nothing declared has no colour to give, so
   *  nothing is repainted and each mesh shows the material its builder gave it. */
  it("matches the doors beside it when the document's material resolves to no colour at all", () => {
    const design = following("material.nothing-declared", undefined);

    expect(wornBy(drawnBody(design, RETURN_ID), "fixed_front")).toBe(
      wornBy(drawnBody(design, ORDINARY_ID), "door_front"),
    );
  });

  it("takes a colour chosen for the return alone, and the neighbour does not", () => {
    const own = paletteFinish("pal.nuc-warmia");
    const base = following("material.melamine", paletteFinish("pal.antracit"));
    const design: Design = {
      ...base,
      placements: base.placements.map((placement) =>
        placement.id === RETURN_ID
          ? { ...placement, body: { ...placement.body, finish: own } }
          : placement,
      ),
    };
    const everyBodyInNuc = following("material.melamine", own);

    expect(wornBy(drawnBody(design, RETURN_ID), "fixed_front")).toBe(
      wornBy(drawnBody(everyBodyInNuc, ORDINARY_ID), "door_front"),
    );
    expect(wornBy(drawnBody(design, ORDINARY_ID), "door_front")).toBe(
      wornBy(drawnBody(base, ORDINARY_ID), "door_front"),
    );
  });

  it("carries no handle, door or drawer mesh in any generated room", () => {
    const names = allScenes().flatMap((scene) =>
      RETURN_IDS.flatMap((id) => {
        const body = bodyOf(scene, id);
        return body ? meshBoxesOf(id, body).map((mesh) => mesh.name) : [];
      }),
    );

    expect([...new Set(names)].sort()).toEqual([
      "carcass",
      "countertop",
      "fixed_front",
      "plinth",
    ]);
  });
});
