// **Wave 6R's last acceptance criterion, asserted rather than assumed.**
//
// > *The M1 fidelity gate is not reached and this must stay true. `finishes.ts` colours materials;
// > nothing here touches a builder and no geometry moves. Asserted, because a wave that adds six
// > materials is exactly the kind that reaches for a builder.*
//
// The parity suites in this package hold the built tree against the vendored reference, and they are
// green — but they are green about the *reference* kitchen, which is built before any finish is
// applied. Nothing in them exercises `applyBodyFinish` at all, so "applying a decor moves no vertex"
// is a claim no test in the repository makes. The diff not touching a builder is evidence about the
// diff; this is evidence about the operation.
//
// It is deliberately quantified over **every declared finish plus a free colour**, because the wave
// added a second arm to `buildFinishMaterial` — a wood clones `M.oak` and a flat decor clones
// `M.door` — and a builder reached for on one arm and not the other is the shape this would miss.
import {
  freeColourFinish,
  paletteFinish,
  PALETTE_ENTRIES,
  type Finish,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { applyBodyFinish, collectFronts } from "../src/finishes.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

/** Every finish a document can carry: the eight declared entries and one value off MDF's picker.
 *  The free colour is not a ninth decor — it is the arm `finishDefinitionOf` reaches through when
 *  no table row exists, and the wave that added it is this one. */
const EVERY_FINISH: readonly (readonly [string, Finish])[] = [
  ...PALETTE_ENTRIES.map(
    (entry) => [entry.entryId, paletteFinish(entry.entryId)] as const,
  ),
  ["a picked free colour", freeColourFinish("#b8c4a1")] as const,
];

/** Three bodies with different front counts and different builders behind them, so a builder
 *  reached for in one make call is not hidden by another that is left alone. */
const BODIES: readonly (readonly [string, () => THREE.Group])[] = [
  ["a two-door base", () => kit.make.baseCabinet(0.6, { doors: 2 })],
  ["a three-drawer base", () => kit.make.baseCabinet(0.6, { drawers: 3 })],
  ["a two-door wall cabinet", () => kit.make.wallCabinet(0.8, 2, 0.7)],
  ["a tall pantry", () => kit.make.tallPantry(0.6, 2)],
];

interface GeometrySnapshot {
  readonly name: string;
  readonly geometry: THREE.BufferGeometry;
  readonly positions: Float32Array;
  readonly matrix: readonly number[];
}

function snapshot(body: THREE.Group): readonly GeometrySnapshot[] {
  const snapshots: GeometrySnapshot[] = [];
  body.updateMatrixWorld(true);
  body.traverse((node) => {
    if (!isMesh(node)) return;
    const position = node.geometry.getAttribute("position");
    snapshots.push({
      name: node.name,
      geometry: node.geometry,
      // Copied, not referenced: a builder that mutated the shared buffer in place would otherwise
      // compare equal to itself afterwards, which is the one failure this file exists to catch.
      positions: Float32Array.from(position.array as Float32Array),
      matrix: [...node.matrixWorld.elements],
    });
  });
  return snapshots;
}

function boundsOf(body: THREE.Group): readonly number[] {
  const box = new THREE.Box3().setFromObject(body);
  return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
}

describe("applying a finish colours a material and moves nothing", () => {
  it("is not vacuous: each fixture body has meshes and at least one front", () => {
    // The anti-vacuity guard. A `make` call that returned an empty group would make every
    // comparison below hold over nothing at all.
    for (const [name, make] of BODIES) {
      const body = make();

      expect(snapshot(body).length, name).toBeGreaterThan(0);
      expect(collectFronts(body).length, name).toBeGreaterThan(0);
    }
  });

  for (const [bodyName, make] of BODIES)
    it.each(EVERY_FINISH)(
      `leaves ${bodyName} exactly where it was under %s`,
      (_finishName, finish) => {
        const body = make();
        const before = snapshot(body);
        const boundsBefore = boundsOf(body);

        applyBodyFinish(body, kit.M, finish);

        const after = snapshot(body);
        expect(after.map((mesh) => mesh.name)).toEqual(
          before.map((mesh) => mesh.name),
        );
        for (const [index, mesh] of after.entries()) {
          const was = before[index];
          if (!was) throw new Error(`no snapshot for ${mesh.name}`);
          // Object identity first, because a rebuilt geometry that happened to produce the same
          // numbers is still a builder having run inside a colouring operation.
          expect(mesh.geometry, mesh.name).toBe(was.geometry);
          expect([...mesh.positions], mesh.name).toEqual([...was.positions]);
          expect(mesh.matrix, mesh.name).toEqual(was.matrix);
        }
        expect(boundsOf(body)).toEqual(boundsBefore);
      },
    );

  it.each(EVERY_FINISH)(
    "changes the fronts' material under %s and nothing else's",
    (_finishName, finish) => {
      // The other direction, so the assertions above are not satisfied by an operation that does
      // nothing at all: exactly the fronts change material, and every other mesh keeps the one it
      // was built with.
      const body = kit.make.baseCabinet(0.6, { doors: 2 });
      const fronts = new Set(collectFronts(body));
      const before = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
      body.traverse((node) => {
        if (isMesh(node)) before.set(node, node.material);
      });
      expect(fronts.size).toBeGreaterThan(0);

      applyBodyFinish(body, kit.M, finish);

      for (const [mesh, material] of before) {
        if (fronts.has(mesh))
          expect(mesh.material, mesh.name).not.toBe(material);
        else expect(mesh.material, mesh.name).toBe(material);
      }
    },
  );
});
