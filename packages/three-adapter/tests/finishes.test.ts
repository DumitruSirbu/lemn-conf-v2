// `FINISH_COLORS` exists so the panel's swatch chips can paint the colour a front will actually
// wear. That promise is only worth anything while the published table and the material builder
// agree, and the two are separated by a package boundary the compiler cannot see across.
//
// So this file diffs them: for every published colour, dress a front in that finish and read the
// colour off the material. If `FINISHES` is edited and the export is not (or the other way round),
// these fail — which is what turns "must track finishes.ts" from a comment into a gate.
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  applyBodyFinish,
  applyFinish,
  collectFronts,
  FINISH_COLORS,
  type FinishKey,
  type SolidFinishKey,
} from "../src/finishes.js";
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

const SOLID_FINISH_KEYS = Object.keys(FINISH_COLORS) as SolidFinishKey[];

function makeFront(): THREE.Mesh {
  const front = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), kit.M.door);
  front.name = "door_front";
  return front;
}

function colourOf(mesh: THREE.Mesh): string {
  const material = mesh.material;
  if (Array.isArray(material) || !("color" in material)) {
    throw new Error(`Mesh "${mesh.name}" has no single coloured material`);
  }
  return `#${(material.color as THREE.Color).getHexString()}`;
}

function dressedFront(key: FinishKey): THREE.Mesh {
  const front = makeFront();
  applyFinish([front], kit.M, key);
  return front;
}

describe("FINISH_COLORS publishes what applyFinish actually paints", () => {
  it("covers every solid finish and no more", () => {
    expect([...SOLID_FINISH_KEYS].sort()).toEqual([
      "clay",
      "graphite",
      "sage",
      "white",
    ]);
  });

  it.each(SOLID_FINISH_KEYS)("matches the front's material for %s", (key) => {
    expect(colourOf(dressedFront(key))).toBe(FINISH_COLORS[key]);
  });

  it.each(SOLID_FINISH_KEYS)(
    "matches the front's material for %s through applyBodyFinish too",
    (key) => {
      const body = new THREE.Group();
      body.add(makeFront());
      applyBodyFinish(body, kit.M, key);

      expect(colourOf(body.children[0] as THREE.Mesh)).toBe(FINISH_COLORS[key]);
    },
  );
});

describe("oak is a material, so it is published as no colour at all", () => {
  it("has no entry in the exported table", () => {
    expect(SOLID_FINISH_KEYS).not.toContain("oak");
  });

  it("dresses the front in the kit's oak map rather than a colour", () => {
    const front = dressedFront("oak");

    expect((front.material as THREE.MeshStandardMaterial).map).toBe(
      kit.M.oak.map,
    );
  });
});

// Q6 (owner, 2026-09-01): `base-hob-oven`'s filler panel is a **finishable front**, and the whole
// of that decision rests on the mesh's name — `collectFronts` matches names, not materials, so a
// panel renamed away from `_door_front` would leave the catalogue declaring `canFinish: true` over
// a body no finish can reach. That is a silent failure at runtime, so it is a loud one here.
describe("the hob+oven filler panel is a front the customer can finish", () => {
  const FILLER_MESH_NAME = "oven_filler_door_front";

  function hobOvenBody(): THREE.Group {
    return kit.make.hobBaseWithOven(0.6);
  }

  it("is the front collectFronts finds on the body", () => {
    const fronts = collectFronts(hobOvenBody());

    expect(fronts.map((front) => front.name)).toEqual([FILLER_MESH_NAME]);
  });

  it.each(SOLID_FINISH_KEYS)("wears %s once the body is dressed", (key) => {
    const body = hobOvenBody();
    const [filler] = collectFronts(body);
    if (!filler) throw new Error(`no mesh named "${FILLER_MESH_NAME}"`);
    const before = filler.material;

    applyBodyFinish(body, kit.M, key);

    expect(filler.material).not.toBe(before);
    expect(colourOf(filler)).toBe(FINISH_COLORS[key]);
  });
});

// ADR 0051 (owner, 2026-09-01): the dishwasher niche wears a **decor door**, and this is the half
// of that decision the customer sees — five finish chips that recorded a pick and recoloured
// nothing, because the builder produced no mesh `FRONT_MESH_NAME` could reach. Unlike the hob
// filler above, no rename was needed: `doorSlab` already names its slab `door_front`. That is
// exactly what makes the failure mode here a *deletion* rather than a rename, so the second test
// measures which meshes a finish reaches and which it must leave alone.
describe("the dishwasher niche's decor door is a front the customer can finish", () => {
  const NICHE_WIDTHS_M = [0.45, 0.6];

  function nicheBody(widthM: number): THREE.Group {
    return kit.make.dishwasherHousing(widthM);
  }

  it.each(NICHE_WIDTHS_M)(
    "is the one front collectFronts finds at %s m",
    (widthM) => {
      const fronts = collectFronts(nicheBody(widthM));

      expect(fronts.map((front) => front.name)).toEqual(["door_front"]);
    },
  );

  it.each(SOLID_FINISH_KEYS)(
    "wears %s on the door and leaves every other mesh in the body alone",
    (key) => {
      const body = nicheBody(0.6);
      const [door] = collectFronts(body);
      if (!door) throw new Error('no mesh named "door_front"');
      const untouched = new Map<
        THREE.Mesh,
        THREE.Material | THREE.Material[]
      >();
      body.traverse((node) => {
        if (isMesh(node) && node !== door) untouched.set(node, node.material);
      });

      applyBodyFinish(body, kit.M, key);

      expect(colourOf(door)).toBe(FINISH_COLORS[key]);
      for (const [mesh, material] of untouched) {
        expect(mesh.material, mesh.name).toBe(material);
      }
      // The worktop, the plinth, the two sides and the appliance behind the door are all in there.
      expect([...untouched.keys()].map((mesh) => mesh.name)).toEqual(
        expect.arrayContaining([
          "countertop",
          "plinth",
          "side_left",
          "side_right",
          "dw_body",
        ]),
      );
    },
  );
});
