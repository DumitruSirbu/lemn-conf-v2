// M7 wave 7I adversarial QA (ADR 0129): the mirror on a **real built kitchen**, rather than on the
// single boxes and single catalogue bodies `corner-direction.test.ts` exercises.
//
// What this adds, criterion by criterion:
// - A7 on the structural corner pieces as the stage mounts them (every sibling bit-identical; the
//   group's bounds reflect in its own local X plane), not on an ordinary base cabinet;
// - A8 over **every triangle of every mesh** of the mounted kitchen, under a mirrored root and under
//   a mirrored single corner group — not only each mesh's first triangle;
// - D4's "never on a leaf": after the root is mirrored no descendant carries a negative scale, and
//   no descendant's own transform moved at all;
// - A9 as a property over generated rays against the mounted bodies **and** the shell design's
//   voids, so the sample is not four hand-chosen x values;
// - A11's bit-exactness under a sweep, `-0` included; A12's reversibility.
import {
  APPROVED_ROOM_POLICY,
  buildLShellDesign,
  deriveColumns,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  recomputeVoids,
  type Design,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyCornerDirection, mirroredX } from "../src/corner-direction.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { buildOverflowMark } from "../src/overflow-mark.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { buildSelectionOutline } from "../src/selection-outline.js";
import { syncSolidBodies, syncVoidMeshes } from "../src/scene-sync.js";
import {
  applyCornerDirectionToLightRig,
  cameraPresetsForRoom,
  createLightRig,
} from "../src/stage.js";
import { isMesh } from "../src/three-guards.js";
import { required } from "./support/required.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

beforeAll(() => {
  installHeadlessDocument();
});

interface MountedKitchen {
  readonly root: THREE.Group;
  readonly solidsRoot: THREE.Group;
  readonly voidsRoot: THREE.Group;
}

function voidsOf(design: Design) {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  const columns = deriveColumns(
    records,
    { emptyColumns: design.emptyColumns, columnExtents: design.columnExtents },
    design.room,
  );
  return recomputeVoids(records, columns);
}

/** The stage's own assembly (`kitchen-stage.tsx`): shell + synced bodies under `solids`, the void
 *  meshes under `voids`, both under the one root the direction is applied to. */
function mountKitchen(
  kit: Kit,
  design: Design,
  voidsDesign: Design,
): MountedKitchen {
  const solidsRoot = new THREE.Group();
  solidsRoot.add(buildKitchenShell(kit, design.room));
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
    room: design.room,
  });
  const voidsRoot = new THREE.Group();
  syncVoidMeshes({
    voidsRoot,
    voids: voidsOf(voidsDesign),
    room: voidsDesign.room,
  });
  const root = new THREE.Group();
  root.add(solidsRoot, voidsRoot);
  root.updateWorldMatrix(true, true);
  return { root, solidsRoot, voidsRoot };
}

const SHELL_DESIGN = buildLShellDesign({
  room: KITCHEN_L_DESIGN.room,
  occurredAt: "2026-09-23T10:00:00.000Z",
});

function isStructuralBody(node: THREE.Object3D): boolean {
  const buildId = node.userData["buildId"] as string | undefined;
  const placementId = node.userData["placementId"] as string | undefined;
  if (placementId === undefined) return false;
  const record = derivePlacementRecords(
    KITCHEN_L_DESIGN,
    KITCHEN_L_BODY_CATALOG,
  ).find((candidate) => candidate.id === placementId);
  const id = buildId ?? record?.buildId;
  return (
    id !== undefined &&
    KITCHEN_L_BODY_CATALOG.get(id)?.structuralReason !== undefined
  );
}

function everyMesh(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (isMesh(node)) meshes.push(node);
  });
  return meshes;
}

/** Reflection of `point` in the plane through `origin` whose normal is `axis` (unit). */
function reflectIn(
  point: THREE.Vector3,
  origin: THREE.Vector3,
  axis: THREE.Vector3,
) {
  const offset = point.clone().sub(origin).dot(axis);
  return point.clone().addScaledVector(axis, -2 * offset);
}

function worldCorners(box: THREE.Box3): THREE.Vector3[] {
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z])
        corners.push(new THREE.Vector3(x, y, z));
  return corners;
}

// =================================================================================================
// A7 on the structural corner pieces inside a mounted kitchen.
// =================================================================================================

describe("7I-A7 — one structural corner group mirrored inside a mounted kitchen", () => {
  let kit: Kit;
  beforeAll(() => {
    kit = makeKit({ createCanvas: createHeadlessCanvas });
  });

  function structuralIds(): string[] {
    const mounted = mountKitchen(kit, KITCHEN_L_DESIGN, KITCHEN_L_DESIGN);
    return mounted.solidsRoot.children
      .filter(isStructuralBody)
      .map((node) => node.userData["placementId"] as string);
  }

  it("finds the structural corner pieces it is about to mirror (non-vacuous)", () => {
    expect(structuralIds().length).toBeGreaterThanOrEqual(2);
  });

  it("leaves every other node of the kitchen bit-identical in world, for each corner piece alone", () => {
    for (const placementId of structuralIds()) {
      const mounted = mountKitchen(kit, KITCHEN_L_DESIGN, KITCHEN_L_DESIGN);
      const target = mounted.solidsRoot.children.find(
        (node) => node.userData["placementId"] === placementId,
      ) as THREE.Group;
      const outside: THREE.Object3D[] = [];
      mounted.root.traverse((node) => {
        let ancestor: THREE.Object3D | null = node;
        while (ancestor && ancestor !== target) ancestor = ancestor.parent;
        if (ancestor !== target) outside.push(node);
      });
      const before = outside.map((node) => node.matrixWorld.clone());

      applyCornerDirection(target, "right");
      mounted.root.updateWorldMatrix(true, true);

      outside.forEach((node, index) => {
        expect(
          node.matrixWorld.equals(required(before[index], node.name)),
          `${placementId}/${node.name}`,
        ).toBe(true);
      });
    }
  });

  it("reflects each corner piece's world bounds in its own local X plane, within 1e-9 m", () => {
    for (const placementId of structuralIds()) {
      const mounted = mountKitchen(kit, KITCHEN_L_DESIGN, KITCHEN_L_DESIGN);
      const target = mounted.solidsRoot.children.find(
        (node) => node.userData["placementId"] === placementId,
      ) as THREE.Group;
      const canonicalCorners = worldCorners(
        new THREE.Box3().setFromObject(target),
      );
      const origin = target.getWorldPosition(new THREE.Vector3());
      const axis = new THREE.Vector3(1, 0, 0)
        .transformDirection(target.matrixWorld)
        .normalize();

      applyCornerDirection(target, "right");
      mounted.root.updateWorldMatrix(true, true);
      const mirrored = new THREE.Box3().setFromObject(target);
      const expected = new THREE.Box3().setFromPoints(
        canonicalCorners.map((corner) => reflectIn(corner, origin, axis)),
      );

      for (const key of ["min", "max"] as const)
        for (const component of ["x", "y", "z"] as const)
          expect(
            mirrored[key][component],
            `${placementId} ${key}.${component}`,
          ).toBeCloseTo(expected[key][component], 9);
    }
  });
});

// =================================================================================================
// A8 over every triangle of the mounted kitchen.
// =================================================================================================

describe("7I-A8 — every triangle's renderer front normal is the reflection of the canonical one", () => {
  let kit: Kit;
  beforeAll(() => {
    kit = makeKit({ createCanvas: createHeadlessCanvas });
  });

  function frontNormals(mesh: THREE.Mesh): THREE.Vector3[] {
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : position.count;
    const sign = Math.sign(mesh.matrixWorld.determinant());
    const at = (i: number) =>
      new THREE.Vector3()
        .fromBufferAttribute(position, index ? index.getX(i) : i)
        .applyMatrix4(mesh.matrixWorld);
    const normals: THREE.Vector3[] = [];
    for (let i = 0; i + 2 < count; i += 3) {
      const [a, b, c] = [at(i), at(i + 1), at(i + 2)];
      normals.push(
        new THREE.Vector3()
          .subVectors(b, a)
          .cross(new THREE.Vector3().subVectors(c, a))
          .multiplyScalar(sign),
      );
    }
    return normals;
  }

  function expectReflected(
    canonical: THREE.Object3D,
    mirrored: THREE.Object3D,
    axis: THREE.Vector3,
  ): number {
    const left = everyMesh(canonical);
    const right = everyMesh(mirrored);
    expect(right.length).toBe(left.length);
    let triangles = 0;
    left.forEach((mesh, meshIndex) => {
      const canonicalNormals = frontNormals(mesh);
      const mirroredNormals = frontNormals(
        required(right[meshIndex], mesh.name),
      );
      canonicalNormals.forEach((normal, i) => {
        const reflected = normal
          .clone()
          .addScaledVector(axis, -2 * normal.dot(axis));
        const actual = required(
          mirroredNormals[i],
          `${mesh.name}#${String(i)}`,
        );
        const tolerance = 1e-9 * Math.max(1, normal.length());
        expect(
          Math.abs(actual.x - reflected.x) <= tolerance,
          `${mesh.name}#${String(i)}`,
        ).toBe(true);
        expect(
          Math.abs(actual.y - reflected.y) <= tolerance,
          `${mesh.name}#${String(i)}`,
        ).toBe(true);
        expect(
          Math.abs(actual.z - reflected.z) <= tolerance,
          `${mesh.name}#${String(i)}`,
        ).toBe(true);
        triangles += 1;
      });
    });
    return triangles;
  }

  it("under a mirrored root", () => {
    const canonical = mountKitchen(kit, KITCHEN_L_DESIGN, SHELL_DESIGN);
    const mirrored = mountKitchen(kit, KITCHEN_L_DESIGN, SHELL_DESIGN);
    applyCornerDirection(mirrored.root, "right");
    mirrored.root.updateWorldMatrix(true, true);

    const triangles = expectReflected(
      canonical.root,
      mirrored.root,
      new THREE.Vector3(1, 0, 0),
    );
    expect(triangles).toBeGreaterThan(1000);
  });

  it("under one mirrored structural corner group, the rest canonical", () => {
    const canonical = mountKitchen(kit, KITCHEN_L_DESIGN, KITCHEN_L_DESIGN);
    const mirrored = mountKitchen(kit, KITCHEN_L_DESIGN, KITCHEN_L_DESIGN);
    const target = mirrored.solidsRoot.children.find(
      isStructuralBody,
    ) as THREE.Group;
    const canonicalTarget = required(
      canonical.solidsRoot.children.find(
        (node) =>
          node.userData["placementId"] === target.userData["placementId"],
      ),
      "canonical twin of the mirrored corner",
    );
    const axis = new THREE.Vector3(1, 0, 0)
      .transformDirection(target.matrixWorld)
      .normalize();
    applyCornerDirection(target, "right");
    mirrored.root.updateWorldMatrix(true, true);

    expect(expectReflected(canonicalTarget, target, axis)).toBeGreaterThan(10);
  });
});

// =================================================================================================
// D4 — the mirror lives on the root; no leaf carries it.
// =================================================================================================

describe("7I D4 — mirroring the root moves no descendant's own transform", () => {
  it("leaves every descendant's local matrix bit-identical and no descendant scale negative", () => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const mounted = mountKitchen(kit, KITCHEN_L_DESIGN, SHELL_DESIGN);
    const descendants: THREE.Object3D[] = [];
    mounted.root.traverse((node) => {
      if (node !== mounted.root) descendants.push(node);
    });
    const localBefore = descendants.map((node) => node.matrix.clone());
    const negativeBefore = descendants.filter(
      (node) => node.scale.x < 0 || node.scale.y < 0 || node.scale.z < 0,
    );

    applyCornerDirection(mounted.root, "right");
    mounted.root.updateWorldMatrix(true, true);

    descendants.forEach((node, index) => {
      expect(
        node.matrix.equals(required(localBefore[index], node.name)),
        node.name,
      ).toBe(true);
    });
    const negativeAfter = descendants.filter(
      (node) => node.scale.x < 0 || node.scale.y < 0 || node.scale.z < 0,
    );
    expect(negativeAfter).toEqual(negativeBefore);
    expect(mounted.root.scale.x).toBe(-1);
  });
});

// =================================================================================================
// A9 — picking follows, over generated rays against a mounted kitchen and a shell's voids.
// =================================================================================================

describe.each([
  ["the furnished reference kitchen", KITCHEN_L_DESIGN],
  ["the shell design, whose free runs are voids", SHELL_DESIGN],
])(
  "7I-A9 — picking in the mirrored scene with the reflected ray, on %s",
  (_name, design) => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    installHeadlessDocument();
    const canonical = mountKitchen(kit, design, design);
    const mirrored = mountKitchen(kit, design, design);
    applyCornerDirection(mirrored.root, "right");
    mirrored.root.updateWorldMatrix(true, true);

    const widthM = design.room.widthMm / 1000;
    const depthM = design.room.depthMm / 1000;

    function pickWith(
      scene: MountedKitchen,
      origin: THREE.Vector3,
      target: THREE.Vector3,
    ) {
      const raycaster = createPickingRaycaster();
      raycaster.set(origin, target.clone().sub(origin).normalize());
      return pick(raycaster, scene.solidsRoot, scene.voidsRoot);
    }

    const rayArbitrary = fc.record({
      eye: fc.tuple(
        fc.double({ min: -1, max: widthM + 2, noNaN: true }),
        fc.double({ min: 0.2, max: 3.5, noNaN: true }),
        fc.double({ min: 1.5, max: depthM + 3, noNaN: true }),
      ),
      aim: fc.tuple(
        fc.double({ min: 0, max: widthM, noNaN: true }),
        fc.double({ min: 0, max: 2.6, noNaN: true }),
        fc.double({ min: 0, max: depthM, noNaN: true }),
      ),
    });

    const outcomes = new Set<string>();

    propertyTest.prop([rayArbitrary], { numRuns: 400 })(
      "returns the same placement or void as the canonical scene",
      ({ eye, aim }) => {
        const origin = new THREE.Vector3(...eye);
        const target = new THREE.Vector3(...aim);
        const expected = pickWith(canonical, origin, target);
        const actual = pickWith(
          mirrored,
          new THREE.Vector3(mirroredX("right", eye[0]), eye[1], eye[2]),
          new THREE.Vector3(mirroredX("right", aim[0]), aim[1], aim[2]),
        );
        outcomes.add(expected === null ? "none" : expected.kind);
        expect(actual).toEqual(expected);
      },
    );

    it("reached a placement over the generated rays, and a void wherever voids are mounted", () => {
      expect(outcomes.has("placement")).toBe(true);
      if (canonical.voidsRoot.children.length > 0 && design === SHELL_DESIGN) {
        expect(outcomes.has("void")).toBe(true);
      }
    });
  },
);

// =================================================================================================
// A11 / A12 — bit-exact presets under a sweep; a reversible light rig.
// =================================================================================================

describe("7I-A11 — right presets are left presets with x negated, bit-exact, over the policy", () => {
  const L = required(
    APPROVED_ROOM_POLICY.buildableShapes.L,
    "approved L bounds",
  );
  const H = APPROVED_ROOM_POLICY.heightBounds;

  propertyTest.prop(
    [
      fc.integer({ min: L.wallA.minMm, max: L.wallA.maxMm }),
      fc.integer({ min: L.wallB.minMm, max: L.wallB.maxMm }),
      fc.integer({ min: H.minMm, max: H.maxMm }),
    ],
    { numRuns: 200 },
  )("for every approved room", (widthMm, depthMm, heightMm) => {
    const left: DesignRoom = { shape: "L", widthMm, depthMm, heightMm };
    const leftPresets = cameraPresetsForRoom(left);
    const rightPresets = cameraPresetsForRoom({
      ...left,
      cornerDirection: "right",
    });
    const explicitLeft = cameraPresetsForRoom({
      ...left,
      cornerDirection: "left",
    });

    expect(explicitLeft).toEqual(leftPresets);
    rightPresets.forEach((preset, index) => {
      const twin = required(leftPresets[index], preset.id);
      expect(preset.id).toBe(twin.id);
      for (const key of ["position", "target"] as const) {
        expect(
          Object.is(preset[key][0], -twin[key][0]),
          `${preset.id}.${key}.x`,
        ).toBe(true);
        expect(preset[key][1]).toBe(twin[key][1]);
        expect(preset[key][2]).toBe(twin[key][2]);
      }
    });
  });
});

describe("7I-A12 — the light rig reflects and restores", () => {
  it("right then left restores key and fill bit-exact, and the hemisphere is never touched", () => {
    const fresh = createLightRig();
    const rig = createLightRig();
    const hemisphereMatrix = rig.hemisphere.matrix.clone();
    const hemispherePosition = rig.hemisphere.position.clone();

    applyCornerDirectionToLightRig(rig, "right");
    expect(rig.key.position.x).toBe(-fresh.key.position.x);
    expect(rig.fill.position.x).toBe(-fresh.fill.position.x);
    applyCornerDirectionToLightRig(rig, "left");

    expect(rig.key.position.equals(fresh.key.position)).toBe(true);
    expect(rig.fill.position.equals(fresh.fill.position)).toBe(true);
    expect(rig.hemisphere.position.equals(hemispherePosition)).toBe(true);
    expect(rig.hemisphere.matrix.equals(hemisphereMatrix)).toBe(true);
    // A directional light shines from its position toward its target; the target is the other half
    // of the direction, so it must not have moved (a moved target would re-aim the light).
    expect(rig.key.target.position.equals(fresh.key.target.position)).toBe(
      true,
    );
    expect(rig.fill.target.position.equals(fresh.fill.target.position)).toBe(
      true,
    );
  });
});

// =================================================================================================
// A14 / A18 — the outline and the mark are not only *placed* in the mirror; they are *drawn*.
// =================================================================================================
//
// `corner-direction.test.ts` proves the outline's world **bounds** reflect. Bounds cannot see
// culling. The outline is drawn with `LineSegments2` + `LineMaterial`, whose vertex shader builds each
// segment's quad in **screen space** — a winding the model matrix never touches. three 0.184.0 sets
// `gl.frontFace(CW)` for any object whose `matrixWorld` determinant is negative
// (`WebGLRenderer.js:1180`), so under the mirrored root those screen-space quads become back faces
// and a `FrontSide` `LineMaterial` culls every one of them. Captured: `desktop-left-600-selected.png`
// draws the red outline; `desktop-right-600-selected.png`, same body selected, draws none.
//
// For an ordinary mesh the flip is exactly right (its winding is reflected with it — A8 above); for a
// screen-space-quad material it is wrong. The rasterisation rule, stated per object: a triangle
// survives culling when the material is double-sided, or when its screen winding agrees with the
// front face the renderer selects for this object.

function isScreenSpaceLine(node: THREE.Object3D): node is THREE.Mesh {
  return (
    isMesh(node) &&
    (node.material as { isLineMaterial?: boolean }).isLineMaterial === true
  );
}

function culledScreenSpaceLines(group: THREE.Object3D): string[] {
  group.updateWorldMatrix(true, true);
  const culled: string[] = [];
  group.traverse((node) => {
    if (!isScreenSpaceLine(node)) return;
    const material = node.material as THREE.Material;
    const isFrontFaceFlipped = node.matrixWorld.determinant() < 0;
    if (isFrontFaceFlipped && material.side === THREE.FrontSide) {
      culled.push(node.name || node.uuid);
    }
  });
  return culled;
}

describe("7I-A14/A18 — the selection outline is rasterised under a mirrored room", () => {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });

  function outlineIn(direction: "left" | "right", kind: "placement" | "void") {
    const mounted = mountKitchen(kit, KITCHEN_L_DESIGN, SHELL_DESIGN);
    applyCornerDirection(mounted.root, direction);
    mounted.root.updateWorldMatrix(true, true);
    const target =
      kind === "placement"
        ? required(
            mounted.solidsRoot.children.find(
              (node) => node.userData["placementId"] !== undefined,
            ),
            "a mounted body",
          )
        : required(mounted.voidsRoot.children[0], "a mounted void");
    const { group } = buildSelectionOutline({
      target,
      parent: mounted.root,
      kind,
    });
    mounted.root.add(group);
    return group;
  }

  it.each(["placement", "void"] as const)(
    "finds screen-space line segments in a %s outline (non-vacuous)",
    (kind) => {
      let count = 0;
      outlineIn("left", kind).traverse((node) => {
        if (isScreenSpaceLine(node)) count += 1;
      });
      expect(count).toBeGreaterThan(0);
    },
  );

  it.each(["placement", "void"] as const)(
    "draws a %s outline in a left-hand room",
    (kind) => {
      expect(culledScreenSpaceLines(outlineIn("left", kind))).toEqual([]);
    },
  );

  it.each(["placement", "void"] as const)(
    "draws a %s outline in a right-hand room — none of its lines culled by the flipped front face",
    (kind) => {
      expect(culledScreenSpaceLines(outlineIn("right", kind))).toEqual([]);
    },
  );

  // The mark's hull is an ordinary `FrontSide` mesh built off the body's own geometry, which the
  // renderer's flip handles correctly (A8); it carries no screen-space line to be culled.
  it("finds no screen-space line in the overflow mark, so the flip cannot cull it", () => {
    const mounted = mountKitchen(kit, KITCHEN_L_DESIGN, KITCHEN_L_DESIGN);
    applyCornerDirection(mounted.root, "right");
    const target = required(
      mounted.solidsRoot.children.find(
        (node) => node.userData["placementId"] !== undefined,
      ),
      "a mounted body",
    );
    const { group } = buildOverflowMark({ target, parent: mounted.root });
    mounted.root.add(group);

    let screenSpaceLines = 0;
    group.traverse((node) => {
      if (isScreenSpaceLine(node)) screenSpaceLines += 1;
    });
    expect(screenSpaceLines).toBe(0);
  });
});
