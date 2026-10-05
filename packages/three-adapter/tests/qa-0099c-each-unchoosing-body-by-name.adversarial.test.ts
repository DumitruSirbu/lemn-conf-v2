// Asserted one named body at a time, not swept over `canFinish`: the ruling (ADR 0099 Amendment B) split that class,
// so a sweep over the flag would assert the wrong rule for part of it. Structural cabinetry follows the kitchen's
// colour, appliances never do. `applyBodyFinish` reaches only fronts and the meshes a builder declares through
// `wearsTheBodysFinish`, so on a frontless body a front assertion would inspect an empty list: every row is measured
// on the material instances under the mounted body, with the kitchen's colour against without. The corner bodies
// choose their own colour (`the-corner-wears-a-colour.test.ts`); the premise re-derives membership from the catalogue.
import {
  bodyFinishRuleOf,
  derivePlacementRecords,
  FOLLOWS_THE_KITCHENS_COLOUR,
  IS_NEVER_PAINTED,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  materialById,
  paletteFinish,
  type BodyFinishRule,
  type Design,
  type DesignPlacement,
  type Finish,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const ANTRACIT = paletteFinish("pal.antracit");
const NUC = paletteFinish("pal.nuc-warmia");
const VENEER_NUC = paletteFinish("veneer.nuc");

/**
 * A body that can wear a colour, in the same scene as every refusal: without it, "left unpainted" passes for a
 * scene that painted nothing at all.
 */
const FINISHABLE_WITNESS_ID = "p1";

/**
 * ADR 0099 Amendment B's division. Each value is the `finishRule` the catalogue must declare for that body, so
 * this table is a reading of the declaration rather than a second copy of it.
 */
type Family = "structural" | "appliance";

const DECLARED_BY_FAMILY: Readonly<Record<Family, BodyFinishRule>> = {
  structural: FOLLOWS_THE_KITCHENS_COLOUR,
  appliance: IS_NEVER_PAINTED,
};

interface UnpaintableBody {
  readonly placementId: string;
  readonly buildId: string;
  readonly kind: string;
  readonly family: Family;
  /** Stated rather than counted at run time, so a body gaining or losing fronts fails the premise by name. */
  readonly frontCount: number;
  /**
   * Surfaces `applyBodyFinish` reaches: fronts plus any mesh declared through `wearsTheBodysFinish`
   * (`body-finish-surfaces.ts`). It differs from `frontCount` for the open shelf: no front, six painted boards.
   */
  readonly paintedSurfaceCount: number;
}

/**
 * Every `canFinish: false` body of the seeded kitchen, named. None draws a front, which is why this file measures
 * material instances.
 */
const UNCHOOSING: readonly UnpaintableBody[] = [
  {
    placementId: "p12",
    buildId: "open-shelf-600",
    kind: "open_shelf_unit",
    family: "structural",
    frontCount: 0,
    paintedSurfaceCount: 6,
  },
  {
    placementId: "p13",
    buildId: "hood-600",
    kind: "extractor_hood",
    family: "appliance",
    frontCount: 0,
    paintedSurfaceCount: 0,
  },
  {
    placementId: "p7",
    buildId: "fridge-free-700",
    kind: "fridge_freestanding",
    family: "appliance",
    frontCount: 0,
    paintedSurfaceCount: 0,
  },
];

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  kit.builders["kitchen-l"]();
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

function withNoFinishOfItsOwn(placement: DesignPlacement): DesignPlacement {
  const body = { ...placement.body };
  delete body.finish;
  return { ...placement, body };
}

/** The seeded kitchen on a stated material with no cabinet carrying a colour of its own. */
function followingOn(materialTierId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
    placements: KITCHEN_L_DESIGN.placements.map(withNoFinishOfItsOwn),
  };
}

function withKitchenColour(design: Design, finish: Finish): Design {
  return { ...design, settings: { ...design.settings, finish } };
}

/** Removed, not set to `undefined`: `resolvedDefaultFinishOf` reads absence. */
function withoutKitchenColour(design: Design): Design {
  const settings = { ...design.settings };
  delete settings.finish;
  return { ...design, settings };
}

function wearingOn(design: Design, id: string, finish: Finish): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === id
        ? { ...placement, body: { ...placement.body, finish } }
        : placement,
    ),
  };
}

function drawn(design: Design): void {
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
    room: design.room,
  });
}

function mounted(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`No body mounted for placement "${placementId}"`);
  return body;
}

function frontsOf(root: THREE.Object3D): readonly THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (isMesh(node) && /door_front|drawer_front/.test(node.name)) {
      found.push(node);
    }
  });
  return found;
}

/**
 * Every material instance under a mounted body, by mesh name. A painted surface wears a clone
 * (`buildFinishMaterial`), so a colour that reaches the body changes some mesh's instance even without fronts; the
 * name says which mesh moved.
 */
function materialsUnder(root: THREE.Object3D): Map<string, THREE.Material> {
  const found = new Map<string, THREE.Material>();
  root.traverse((node) => {
    if (!isMesh(node)) return;
    const material = node.material;
    if (Array.isArray(material)) {
      throw new Error(`Mesh "${node.name}" carries a material array`);
    }
    found.set(node.name, material);
  });
  return found;
}

/**
 * The same body drawn on a bare kitchen and with the colour, in two separate roots: re-using one would hide a
 * repaint.
 */
function materialsWithAndWithout(
  design: Design,
  colour: Finish,
  placementId: string,
): {
  readonly without: Map<string, THREE.Material>;
  readonly with_: Map<string, THREE.Material>;
} {
  solidsRoot = new THREE.Group();
  drawn(withoutKitchenColour(design));
  const without = materialsUnder(mounted(placementId));

  solidsRoot = new THREE.Group();
  drawn(withKitchenColour(design, colour));
  const with_ = materialsUnder(mounted(placementId));
  return { without, with_ };
}

/**
 * The mirror of `expectSameMaterials`, asserted on the instance rather than a hex because two declared colours
 * can coincide. The mesh set must be identical either way.
 */
function expectRepainted(
  without: Map<string, THREE.Material>,
  with_: Map<string, THREE.Material>,
  where: string,
): void {
  expect([...with_.keys()].sort(), `${where}: mesh set moved`).toEqual(
    [...without.keys()].sort(),
  );
  const moved = [...with_].filter(
    ([name, material]) => material !== without.get(name),
  );
  expect(moved.length, `${where}: nothing was repainted`).toBeGreaterThan(0);
}

function expectSameMaterials(
  without: Map<string, THREE.Material>,
  with_: Map<string, THREE.Material>,
  where: string,
): void {
  expect([...with_.keys()].sort(), `${where}: mesh set moved`).toEqual(
    [...without.keys()].sort(),
  );
  for (const [name, material] of with_) {
    expect(material, `${where}: mesh "${name}" was repainted`).toBe(
      without.get(name),
    );
  }
}

describe("backlog 60 — the premise: which bodies this is about, and what can be seen of them", () => {
  /** The table is the catalogue's, checked both ways: a body joining or leaving the class fails here by name. */
  it("names every unfinishable seeded body and nothing else", () => {
    const declared = derivePlacementRecords(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    ).filter((record) => !record.canFinish);

    expect(declared.map((record) => record.id).sort()).toEqual(
      UNCHOOSING.map((row) => row.placementId).sort(),
    );
    for (const row of UNCHOOSING) {
      const record = declared.find(
        (candidate) => candidate.id === row.placementId,
      );
      expect(record, row.placementId).toBeDefined();
      expect(record?.buildId, row.placementId).toBe(row.buildId);
      expect(record?.kind, row.placementId).toBe(row.kind);
    }
  });

  /**
   * The `family` column is read off each entry's `finishRule` through the domain's fail-closed resolver, so a body
   * moved between families fails here by name.
   */
  it.each(UNCHOOSING)("$buildId declares the $family rule", (row) => {
    const definition = KITCHEN_L_BODY_CATALOG.get(row.buildId);
    expect(definition, row.buildId).toBeDefined();

    expect(
      bodyFinishRuleOf({
        buildId: row.buildId,
        rule: definition?.finishRule,
        canFinish: definition?.canFinish ?? true,
      }),
      row.buildId,
    ).toBe(DECLARED_BY_FAMILY[row.family]);
  });

  it("mounts no paintable front at all for any of the three", () => {
    drawn(withKitchenColour(followingOn("material.melamine"), ANTRACIT));

    for (const row of UNCHOOSING) {
      expect(frontsOf(mounted(row.placementId)).length, row.buildId).toBe(
        row.frontCount,
      );
    }
    const frontless = UNCHOOSING.filter((row) => row.frontCount === 0);
    expect(frontless.map((row) => row.buildId).sort()).toEqual([
      "fridge-free-700",
      "hood-600",
      "open-shelf-600",
    ]);
    // ...and the witness proves the scene painted at all in this very run.
    const witness = frontsOf(mounted(FINISHABLE_WITNESS_ID));
    expect(witness.length).toBeGreaterThan(0);
    for (const front of witness) expect(front.material).not.toBe(kit.M.door);
  });
});

/** Every structural row the renderer can reach by any surface: only the open shelf, on its six declared boards. */
const REPAINTED_STRUCTURAL = UNCHOOSING.filter(
  (row) => row.family === "structural" && row.paintedSurfaceCount > 0,
);

const APPLIANCES = UNCHOOSING.filter((row) => row.family === "appliance");

describe("backlog 60 — an appliance is painted at neither level, by name", () => {
  it("names both appliances", () => {
    expect(APPLIANCES.map((row) => row.buildId).sort()).toEqual([
      "fridge-free-700",
      "hood-600",
    ]);
  });

  it.each(APPLIANCES)(
    "$buildId ($family) is untouched by a kitchen colour on melamine",
    (row) => {
      const { without, with_ } = materialsWithAndWithout(
        followingOn("material.melamine"),
        ANTRACIT,
        row.placementId,
      );

      expectSameMaterials(without, with_, row.buildId);
      expect(frontsOf(mounted(row.placementId)).length).toBe(row.frontCount);
    },
  );

  it.each(APPLIANCES)(
    "$buildId ($family) is untouched by a kitchen colour on veneer",
    (row) => {
      const { without, with_ } = materialsWithAndWithout(
        followingOn("material.veneer"),
        VENEER_NUC,
        row.placementId,
      );

      expectSameMaterials(without, with_, row.buildId);
      // Premise: a body that can wear a colour wears veneer's default in the bare scene, so "unpainted" is a refusal.
      expect(materialById("material.veneer").defaultFinish).toBeDefined();
    },
  );

  it.each(APPLIANCES)(
    "$buildId ($family) is untouched by a colour written onto its own body",
    (row) => {
      const base = followingOn("material.melamine");

      solidsRoot = new THREE.Group();
      drawn(withoutKitchenColour(base));
      const without = materialsUnder(mounted(row.placementId));

      solidsRoot = new THREE.Group();
      drawn(wearingOn(withKitchenColour(base, ANTRACIT), row.placementId, NUC));
      const with_ = materialsUnder(mounted(row.placementId));

      expectSameMaterials(without, with_, row.buildId);
    },
  );
});

/** Every structural body the colour reaches, by whatever surface; asserted on instance so it holds without fronts. */
describe("backlog 60 — the kitchen's colour reaches the one structural body left here", () => {
  it("names it", () => {
    expect(REPAINTED_STRUCTURAL.map((row) => row.buildId).sort()).toEqual([
      "open-shelf-600",
    ]);
  });

  it.each(REPAINTED_STRUCTURAL)("$buildId ($family) is repainted", (row) => {
    const { without, with_ } = materialsWithAndWithout(
      followingOn("material.melamine"),
      ANTRACIT,
      row.placementId,
    );

    expectRepainted(without, with_, row.buildId);
  });
});

// The corner base return's carcass is its outward front face (`fronts: NO_OPENING_FRONTS`, in the plane of its
// neighbours' doors) and is repainted through the per-mesh declaration in `body-finish-surfaces.ts`. The full colour
// claims are in `the-corner-wears-a-colour.test.ts`.
describe("backlog 60 — the corner base return's one outward surface, repainted", () => {
  const RETURN_LEG_ID = "p26";

  /**
   * The class "a structural body the colour reaches nothing of" is empty; the body that was its only member is
   * named here so the emptiness is about that body, not a filter that stopped matching.
   */
  it("has no structural body left with nothing for the colour to reach", () => {
    const nothingToPaint = UNCHOOSING.filter(
      (row) => row.family === "structural" && row.paintedSurfaceCount === 0,
    );

    expect(nothingToPaint.map((row) => row.buildId)).toEqual([]);
    expect(UNCHOOSING.map((row) => row.buildId)).not.toContain(
      "base-corner-return-320",
    );
  });

  /**
   * Four meshes, no front: `fixed_front` is the panel on the run's door plane and deliberately not a `door_front`
   * (ADR 0135), so no front, handle or hinge census counts it. Losing `carcass` would make the repaint below vacuous.
   */
  it("mounts only a plinth, a carcass, a fixed front and a countertop", () => {
    drawn(withKitchenColour(followingOn("material.melamine"), ANTRACIT));

    const names: string[] = [];
    mounted(RETURN_LEG_ID).traverse((node) => {
      if (isMesh(node)) names.push(node.name);
    });
    expect(names.sort()).toEqual([
      "carcass",
      "countertop",
      "fixed_front",
      "plinth",
    ]);
  });

  it("repaints that carcass when the kitchen takes a colour", () => {
    const { without, with_ } = materialsWithAndWithout(
      followingOn("material.melamine"),
      ANTRACIT,
      RETURN_LEG_ID,
    );

    expectRepainted(without, with_, "base-corner-return-320");
    // Named, not just counted: `expectRepainted` is satisfied by any mesh moving, and the reversal is about which one.
    expect(with_.get("carcass")).not.toBe(without.get("carcass"));
    expect(with_.get("fixed_front")).not.toBe(without.get("fixed_front"));
    expect(with_.get("countertop")).toBe(without.get("countertop"));
    expect(with_.get("plinth")).toBe(without.get("plinth"));
  });
});
