// ADR 0129 (M7 wave 7I slice S2): the mirror primitive (D4, D5), the camera presets and the light
// rig (D6), and the probe's canonical invariance (D7 — the wave's own stop condition if it fails).
//
// `DEVELOPMENT-SPEC.md` §2: world x = 0 is wall B's plane, and the scene root's origin is the
// corner, so negating x alone reflects the whole scene about that plane. `applyCornerDirection`
// itself never assumes that — it reflects whatever `Group` it is given about that group's own
// local X — so the same primitive mirrors the root (D4 "whole scene") and a single structural
// group (D4 "one group") without knowing which one it was handed.
import {
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  measurableSeatOf,
  toMetres,
  wallCarcassDepthMm,
  type BodyProbeRequest,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { applyCornerDirection, mirroredX } from "../src/corner-direction.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { createPickingRaycaster, pick } from "../src/picking.js";
import { isMesh } from "../src/three-guards.js";
import {
  applyCornerDirectionToLightRig,
  cameraPresetsForRoom,
  createLightRig,
  findCameraPresetForRoom,
  type Vector3Tuple,
} from "../src/stage.js";
import { buildVoidMesh } from "../src/void-mesh.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import {
  APPROVED_HEIGHT,
  APPROVED_WALL_A,
  APPROVED_WALL_B,
  SEEDED_ROOM,
} from "./support/approved-rooms.js";
import { required } from "./support/required.js";

beforeAll(() => {
  installHeadlessDocument();
});

// =================================================================================================
// 7I-A6 — the primitive is a reflection and nothing else.
// =================================================================================================

describe("applyCornerDirection", () => {
  function boxGroup(): THREE.Group {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.86, 0.56),
      new THREE.MeshBasicMaterial(),
    );
    group.add(mesh);
    group.updateMatrix();
    return group;
  }

  it("leaves a canonical group's matrix bit-exact for left", () => {
    const group = boxGroup();
    const before = group.matrix.clone();

    applyCornerDirection(group, "left");
    group.updateMatrix();

    expect(group.matrix.equals(before)).toBe(true);
    expect(group.scale.x).toBe(1);
  });

  it("negates scale.x for right, and nothing else on the group", () => {
    const group = boxGroup();
    const beforePosition = group.position.clone();
    const beforeQuaternion = group.quaternion.clone();

    applyCornerDirection(group, "right");

    expect(group.scale.x).toBe(-1);
    expect(group.scale.y).toBe(1);
    expect(group.scale.z).toBe(1);
    expect(group.position.equals(beforePosition)).toBe(true);
    expect(group.quaternion.equals(beforeQuaternion)).toBe(true);
  });

  it("is idempotent: right applied twice equals right applied once", () => {
    const once = boxGroup();
    applyCornerDirection(once, "right");
    once.updateMatrix();

    const twice = boxGroup();
    applyCornerDirection(twice, "right");
    applyCornerDirection(twice, "right");
    twice.updateMatrix();

    expect(twice.matrix.equals(once.matrix)).toBe(true);
  });

  it("right then left restores the matrix bit-exact", () => {
    const group = boxGroup();
    const before = group.matrix.clone();

    applyCornerDirection(group, "right");
    applyCornerDirection(group, "left");
    group.updateMatrix();

    expect(group.matrix.equals(before)).toBe(true);
  });

  it("creates or changes no geometry, index or material — the same object references", () => {
    const group = boxGroup();
    const mesh = group.children[0] as THREE.Mesh;
    const geometry = mesh.geometry;
    const material = mesh.material;
    const index = geometry.getIndex();

    applyCornerDirection(group, "right");

    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(material);
    expect(mesh.geometry.getIndex()).toBe(index);
    expect((mesh.material as THREE.MeshBasicMaterial).side).toBe(
      THREE.FrontSide,
    );
  });

  it.each(["left", "right"] as const)("throws on a Mesh (%s)", (direction) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    expect(() => {
      applyCornerDirection(mesh as unknown as THREE.Group, direction);
    }).toThrow();
  });

  it("throws on a Line — the raycast-threshold trap (G6)", () => {
    const line = new THREE.LineSegments(new THREE.BufferGeometry());
    expect(() => {
      applyCornerDirection(line as unknown as THREE.Group, "right");
    }).toThrow();
  });

  it("throws on Points", () => {
    const points = new THREE.Points(new THREE.BufferGeometry());
    expect(() => {
      applyCornerDirection(points as unknown as THREE.Group, "right");
    }).toThrow();
  });
});

// =================================================================================================
// 7I-A7 — one group, alone.
// =================================================================================================

describe("applyCornerDirection on one group inside a larger scene", () => {
  let kit: Kit;

  beforeAll(() => {
    kit = makeKit({ createCanvas: createHeadlessCanvas });
  });

  it("leaves every sibling's matrixWorld bit-identical", () => {
    const parent = new THREE.Group();
    const target = buildCatalogBody(kit, "base-cabinet", {
      widthM: 0.6,
      heightM: 0.86,
      depthM: 0.56,
    });
    const siblingA = buildCatalogBody(kit, "wall-cabinet", {
      widthM: 0.6,
      heightM: 0.7,
      depthM: 0.33,
    });
    const siblingB = buildCatalogBody(kit, "tall-pantry", {
      widthM: 0.6,
      heightM: 2.2,
      depthM: 0.56,
    });
    siblingA.position.x = 2;
    siblingB.position.x = -2;
    parent.add(target, siblingA, siblingB);
    parent.updateWorldMatrix(true, true);
    const beforeA = siblingA.matrixWorld.clone();
    const beforeB = siblingB.matrixWorld.clone();

    applyCornerDirection(target, "right");
    parent.updateWorldMatrix(true, true);

    expect(siblingA.matrixWorld.equals(beforeA)).toBe(true);
    expect(siblingB.matrixWorld.equals(beforeB)).toBe(true);
  });

  // A body centred on its own origin along the run (SPEC's anchor convention): mirroring it in its
  // own local X leaves its world bounds equal to its own canonical footprint, within 1e-9 m.
  it("reflects a centred body's world bounds about its own local X, within its own footprint", () => {
    const group = buildCatalogBody(kit, "base-cabinet", {
      widthM: 0.6,
      heightM: 0.86,
      depthM: 0.56,
    });
    group.updateWorldMatrix(true, true);
    const canonical = new THREE.Box3().setFromObject(group);

    applyCornerDirection(group, "right");
    group.updateWorldMatrix(true, true);
    const mirrored = new THREE.Box3().setFromObject(group);

    expect(mirrored.min.x).toBeCloseTo(-canonical.max.x, 9);
    expect(mirrored.max.x).toBeCloseTo(-canonical.min.x, 9);
    expect(mirrored.min.y).toBeCloseTo(canonical.min.y, 9);
    expect(mirrored.max.y).toBeCloseTo(canonical.max.y, 9);
    expect(mirrored.min.z).toBeCloseTo(canonical.min.z, 9);
    expect(mirrored.max.z).toBeCloseTo(canonical.max.z, 9);
    // The body is horizontally centred (SPEC §2), so the mirrored bounds are its own footprint.
    expect(mirrored.min.x).toBeCloseTo(canonical.min.x, 9);
    expect(mirrored.max.x).toBeCloseTo(canonical.max.x, 9);
  });
});

// =================================================================================================
// 7I-A8 — winding: the renderer's front normal follows the reflection.
// =================================================================================================

describe("triangle winding under a mirrored root", () => {
  let kit: Kit;

  beforeAll(() => {
    kit = makeKit({ createCanvas: createHeadlessCanvas });
  });

  /** The winding normal of a mesh's first triangle in world space, times the sign of its own
   *  `matrixWorld` determinant — exactly criterion 8's "renderer's front normal": three flips
   *  `gl.frontFace` for any mesh whose `matrixWorld` determinant is negative
   *  (`WebGLRenderer.js:1180`), so the triangle the shader treats as front-facing is the winding
   *  normal negated whenever that determinant is negative. */
  function frontNormalOfFirstTriangle(mesh: THREE.Mesh): THREE.Vector3 {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    const at = (i: number) =>
      new THREE.Vector3()
        .fromBufferAttribute(position, index ? index.getX(i) : i)
        .applyMatrix4(mesh.matrixWorld);
    const [v0, v1, v2] = [at(0), at(1), at(2)];
    const windingNormal = new THREE.Vector3()
      .subVectors(v1, v0)
      .cross(new THREE.Vector3().subVectors(v2, v0));
    const determinant = new THREE.Matrix4()
      .copy(mesh.matrixWorld)
      .determinant();
    return windingNormal.multiplyScalar(Math.sign(determinant));
  }

  function everyMesh(root: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    root.traverse((node) => {
      if (isMesh(node)) meshes.push(node);
    });
    return meshes;
  }

  it("mirrors every mesh's front normal in x, under a mirrored root", () => {
    const canonicalRoot = new THREE.Group();
    canonicalRoot.add(
      buildCatalogBody(kit, "base-cabinet", {
        widthM: 0.6,
        heightM: 0.86,
        depthM: 0.56,
      }),
    );
    const mirroredRoot = new THREE.Group();
    mirroredRoot.add(
      buildCatalogBody(kit, "base-cabinet", {
        widthM: 0.6,
        heightM: 0.86,
        depthM: 0.56,
      }),
    );
    applyCornerDirection(mirroredRoot, "right");
    canonicalRoot.updateWorldMatrix(true, true);
    mirroredRoot.updateWorldMatrix(true, true);

    const canonicalMeshes = everyMesh(canonicalRoot);
    const mirroredMeshes = everyMesh(mirroredRoot);
    expect(mirroredMeshes.length).toBe(canonicalMeshes.length);
    expect(canonicalMeshes.length).toBeGreaterThan(3);

    for (const [i, canonicalMesh] of canonicalMeshes.entries()) {
      const mirroredMesh = required(
        mirroredMeshes[i],
        `mirrored mesh ${String(i)}`,
      );
      const canonicalFront = frontNormalOfFirstTriangle(canonicalMesh);
      const mirroredFront = frontNormalOfFirstTriangle(mirroredMesh);
      const reflectedCanonical = new THREE.Vector3(
        -canonicalFront.x,
        canonicalFront.y,
        canonicalFront.z,
      );

      expect(mirroredFront.x).toBeCloseTo(reflectedCanonical.x, 6);
      expect(mirroredFront.y).toBeCloseTo(reflectedCanonical.y, 6);
      expect(mirroredFront.z).toBeCloseTo(reflectedCanonical.z, 6);
    }
  });
});

// =================================================================================================
// 7I-A9 — picking follows.
// =================================================================================================

describe("picking under a mirrored scene", () => {
  interface PickScene {
    readonly root: THREE.Group;
    readonly solids: THREE.Group;
    readonly voids: THREE.Group;
  }

  function buildScene(direction: "left" | "right"): PickScene {
    const root = new THREE.Group();
    const solids = new THREE.Group();
    const cabinetA = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.86, 0.56));
    cabinetA.position.set(0.3, 0.43, 0.28);
    cabinetA.userData["placementId"] = "p-a";
    const cabinetB = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.86, 0.56));
    cabinetB.position.set(2.3, 0.43, 0.28);
    cabinetB.userData["placementId"] = "p-b";
    solids.add(cabinetA, cabinetB);

    // y0/h match the ray's own start (y = 1, above the void's top at 0.86), the same numbers
    // `picking.test.ts`'s "falls through to a void" case uses, so the ray approaches the box's top
    // face from outside — starting a downward ray *inside* a `FrontSide` box hits nothing.
    const voids = new THREE.Group();
    const { group } = buildVoidMesh({
      id: "A|3.30:v0:0.00",
      col: "A|3.30",
      wall: "A",
      x: 3.3,
      z: 0.28,
      ry: 0,
      w: 0.6,
      d: 0.56,
      y0: 0,
      h: 0.86,
      spanY0: 0,
      spanH: 0.86,
    });
    voids.add(group);

    root.add(solids, voids);
    applyCornerDirection(root, direction);
    root.updateWorldMatrix(true, true);
    return { root, solids, voids };
  }

  const canonical = buildScene("left");
  const mirrored = buildScene("right");

  function pickAt(scene: PickScene, xM: number): ReturnType<typeof pick> {
    const raycaster = createPickingRaycaster();
    raycaster.set(new THREE.Vector3(xM, 1, 0.28), new THREE.Vector3(0, -1, 0));
    return pick(raycaster, scene.solids, scene.voids);
  }

  // Sampled rather than random: each x is chosen to land on a specific known target (cabinet A,
  // cabinet B, the void fill, or empty air), so the sweep exercises every branch `pick` can take —
  // including the void, which is what shows the mirror did not disturb `NOOP_RAYCAST` on its edges.
  const SAMPLE_X_M = [0.3, 2.3, 3.3, 5.0];

  propertyTest.prop([fc.constantFrom(...SAMPLE_X_M)])(
    "the reflected ray picks in the mirrored scene what the ray picks in the canonical one",
    (xM) => {
      expect(pickAt(mirrored, mirroredX("right", xM))).toEqual(
        pickAt(canonical, xM),
      );
    },
  );

  it("is non-vacuous: the sample reaches a placement, a void and empty air", () => {
    const results = SAMPLE_X_M.map((xM) => pickAt(canonical, xM));
    expect(results.some((r) => r?.kind === "placement")).toBe(true);
    expect(results.some((r) => r?.kind === "void")).toBe(true);
    expect(results.some((r) => r === null)).toBe(true);
  });
});

// =================================================================================================
// 7I-A10 — the probe is canonical (D7: stop and report if this fails).
// =================================================================================================

describe("the body probe under a mirrored room (D7)", () => {
  function kitAt(cabinetDepthMm: number): { kit: Kit; room: THREE.Object3D } {
    const kit = makeKit({
      createCanvas: createHeadlessCanvas,
      cabinetDepthMm,
      wallDepthMm: wallCarcassDepthMm(cabinetDepthMm),
    });
    return { kit, room: kit.builders["kitchen-l"]() };
  }

  it.each(declaredCabinetDepthsMm())(
    "measures every catalogue body identically under a mirrored room, at %i mm",
    (cabinetDepthMm) => {
      const canonicalKit = kitAt(cabinetDepthMm);
      const mirroredKit = kitAt(cabinetDepthMm);
      applyCornerDirection(mirroredKit.room as THREE.Group, "right");
      mirroredKit.room.updateWorldMatrix(true, true);

      const catalog = buildKitchenLBodyCatalog(cabinetDepthMm);
      let compared = 0;
      for (const [buildId, definition] of catalog) {
        // A joint-seated entry has no plane of its own to measure (ADR 0077 decision 1) — the same
        // exclusion `declared-frame-depth-sweep.test.ts`'s `depthIgnoringEntries` applies, restated
        // here because this sweep is over the whole catalogue rather than the wall-plane rows only.
        if (definition.seatRule?.seatedOn === "joint") continue;
        const request: BodyProbeRequest = {
          buildId,
          widthM: 0.6,
          heightM: 0.72,
          depthM: toMetres(definition.frameDepthMm),
          seatedOn: measurableSeatOf({ buildId, rule: definition.seatRule }),
        };
        const canonicalMeasurement = createBodyProbe(
          canonicalKit.kit,
          canonicalKit.room,
        ).measure(request);
        const mirroredMeasurement = createBodyProbe(
          mirroredKit.kit,
          mirroredKit.room,
        ).measure(request);

        expect(mirroredMeasurement, buildId).toEqual(canonicalMeasurement);
        compared += 1;
      }
      expect(compared).toBeGreaterThan(10);
    },
  );
});

// =================================================================================================
// 7I-A11 — cameras.
// =================================================================================================

describe("cameraPresetsForRoom under a right-hand room", () => {
  const SAMPLE_ROOMS = [
    SEEDED_ROOM,
    {
      shape: "L" as const,
      widthMm: APPROVED_WALL_A.minMm,
      depthMm: APPROVED_WALL_B.minMm,
      heightMm: APPROVED_HEIGHT.minMm,
    },
    {
      shape: "L" as const,
      widthMm: APPROVED_WALL_A.maxMm,
      depthMm: APPROVED_WALL_B.maxMm,
      heightMm: APPROVED_HEIGHT.maxMm,
    },
  ];

  it.each(SAMPLE_ROOMS)(
    "equals the left preset with x negated in position and target, bit-exact",
    (room) => {
      const left = cameraPresetsForRoom(room);
      const right = cameraPresetsForRoom({
        ...room,
        cornerDirection: "right",
      });

      expect(right).toHaveLength(left.length);
      for (const [i, leftPreset] of left.entries()) {
        const rightPreset = required(right[i], `right preset ${String(i)}`);
        expect(rightPreset.id).toBe(leftPreset.id);
        expect(rightPreset.position).toEqual([
          -leftPreset.position[0],
          leftPreset.position[1],
          leftPreset.position[2],
        ]);
        expect(rightPreset.target).toEqual([
          -leftPreset.target[0],
          leftPreset.target[1],
          leftPreset.target[2],
        ]);
      }
    },
  );

  it("does not change the distance from target to position (the camera does not pull back)", () => {
    const distanceOf = (preset: {
      position: Vector3Tuple;
      target: Vector3Tuple;
    }) =>
      Math.hypot(
        preset.position[0] - preset.target[0],
        preset.position[1] - preset.target[1],
        preset.position[2] - preset.target[2],
      );

    for (const room of SAMPLE_ROOMS) {
      const left = cameraPresetsForRoom(room);
      const right = cameraPresetsForRoom({ ...room, cornerDirection: "right" });
      for (const [i, leftPreset] of left.entries()) {
        const rightPreset = required(right[i], `right preset ${String(i)}`);
        expect(distanceOf(rightPreset)).toBeCloseTo(distanceOf(leftPreset), 9);
      }
    }
  });

  // `perete-a-framing.test.ts`'s 1.62 m, restated for a right-hand room: wall A's target still
  // walks out to `widthM / 2` — just mirrored — so the same trigonometry holds under the mirror.
  it("looks at the middle of wall A at its mirrored x, for a right-hand room", () => {
    const preset = findCameraPresetForRoom("wallA", {
      ...SEEDED_ROOM,
      cornerDirection: "right",
    });

    expect(preset.target[0]).toBeCloseTo(-toMetres(SEEDED_ROOM.widthMm) / 2, 9);
    expect(preset.target[2]).toBe(0);
  });

  it("returns the canonical presets unchanged for an explicit left direction", () => {
    const implicit = cameraPresetsForRoom(SEEDED_ROOM);
    const explicit = cameraPresetsForRoom({
      ...SEEDED_ROOM,
      cornerDirection: "left",
    });

    expect(explicit).toEqual(implicit);
  });
});

// =================================================================================================
// 7I-A12 — lights.
// =================================================================================================

describe("applyCornerDirectionToLightRig", () => {
  it("negates key and fill x for right, and leaves the hemisphere untouched", () => {
    const rig = createLightRig();
    const hemisphereBefore = rig.hemisphere.color.clone();

    applyCornerDirectionToLightRig(rig, "right");

    expect(rig.key.position.x).toBe(-4);
    expect(rig.key.position.y).toBe(7);
    expect(rig.key.position.z).toBe(5);
    expect(rig.fill.position.x).toBe(5);
    expect(rig.fill.position.y).toBe(3);
    expect(rig.fill.position.z).toBe(-4);
    expect(rig.hemisphere.color.equals(hemisphereBefore)).toBe(true);
  });

  it("is bit-identical to a freshly created rig for left", () => {
    const rig = createLightRig();
    const freshKeyPosition = rig.key.position.clone();
    const freshFillPosition = rig.fill.position.clone();

    applyCornerDirectionToLightRig(rig, "left");

    expect(rig.key.position.equals(freshKeyPosition)).toBe(true);
    expect(rig.fill.position.equals(freshFillPosition)).toBe(true);
  });

  it("is idempotent under repeated calls with the same direction", () => {
    const rig = createLightRig();

    applyCornerDirectionToLightRig(rig, "right");
    const afterOnce = rig.key.position.clone();
    applyCornerDirectionToLightRig(rig, "right");

    expect(rig.key.position.equals(afterOnce)).toBe(true);
  });
});
