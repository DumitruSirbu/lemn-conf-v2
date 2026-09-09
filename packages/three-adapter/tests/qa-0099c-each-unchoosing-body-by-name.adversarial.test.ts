// **The owner's ruling of 2026-09-09, asserted one named body at a time rather than swept over a
// flag** — backlog entry 60: *structural cabinetry follows the kitchen's colour; appliances never
// do*.
//
// ADR 0099 decision 8 ruled that a body with `canFinish: false` is unaffected at **both** levels, and
// every proof of it was written over `records.filter((record) => !record.canFinish)`. That was one
// assertion about one class, and it was honest only while the class was one thing. The ruling split
// it: four corner bodies and an open shelf now take the kitchen's colour, a hood and a fridge take
// none, and all seven still carry `canFinish: false` because none of them gains a control of its own.
// A sweep over the flag would go on passing while asserting the wrong rule for five of the seven, so
// the claim is stated here **per body, by build id**.
//
// The `family` column is the ruling's own division — `structural` and `appliance` are the owner's own
// words — and the premise below holds it against each entry's declared `finishRule`, so the table
// cannot drift from the catalogue.
//
// **The observability premise is per body too, and it is not a formality.** Four of the seven draw
// no door or drawer front at all, and `applyBodyFinish` (`finishes.ts:193`) reaches
// `collectFronts(body)` and nothing else — so on those four *nothing on screen moves either way*,
// and an assertion about their paint would inspect an empty list and pass without looking (ADR 0093
// decision 1). That is why the two frontless structural rows — the corner base return and the open
// shelf — are asserted **in the domain**, on `PlacementRecord.drawnFinish`, where the ruling is
// observable, and are asserted here only for what is true on screen: their meshes do not move.
// Every row is measured on **the multiset of material instances under the mounted body, with the
// kitchen's colour against without**, and the rows that draw fronts carry the sharper
// front-instance assertion as well.
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

/** The two drawn hexes, written out rather than read from `finishes.ts`: a constant taken from the
 *  table under test agrees with whatever that table says. */
const ANTRACIT_HEX = "#2b2d30";
const VENEER_NUC_HEX = "#6f4630";

/** A body that *can* wear a colour, drawn in the same scene as every refusal below: without it a
 *  "left unpainted" run is satisfied by a scene that painted nothing at all. */
const FINISHABLE_WITNESS_ID = "p1";

/** Backlog 60's division, in the owner's own words. Each value names the `finishRule` the catalogue
 *  must declare for that body, and the premise below checks the pair — so this table is a reading of
 *  the declaration rather than a second copy of it. */
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
  /** How many door/drawer fronts this body mounts in the seeded kitchen — the only surface
   *  `applyBodyFinish` can reach. Stated rather than counted at run time, so a body that gains or
   *  loses fronts fails the premise below by name instead of quietly changing what is asserted. */
  readonly frontCount: number;
}

/**
 * **Every `canFinish: false` body of the seeded kitchen, named.**
 *
 * Seven rows, not the five the ruling's summary lists: the seeded kitchen holds **four** corner
 * bodies rather than two — a corner base X, a corner base return, and *two* wall corner returns
 * (the run and its top row) — and every one of them is structural cabinetry, so the ruling reaches
 * all four. `STRUCTURAL_CORNER` declares them together, which is why they cannot be ruled on apart.
 */
const UNCHOOSING: readonly UnpaintableBody[] = [
  {
    placementId: "p25",
    buildId: "base-corner-x-900",
    kind: "corner_base_x",
    family: "structural",
    frontCount: 1,
  },
  {
    placementId: "p26",
    buildId: "base-corner-return-320",
    kind: "corner_base_return",
    family: "structural",
    frontCount: 0,
  },
  {
    placementId: "p9",
    buildId: "wall-corner-return-570",
    kind: "corner_wall_return",
    family: "structural",
    frontCount: 1,
  },
  {
    placementId: "p21",
    buildId: "wall-corner-return-570-top",
    kind: "corner_wall_return_top",
    family: "structural",
    frontCount: 1,
  },
  {
    placementId: "p12",
    buildId: "open-shelf-600",
    kind: "open_shelf_unit",
    family: "structural",
    frontCount: 0,
  },
  {
    placementId: "p13",
    buildId: "hood-600",
    kind: "extractor_hood",
    family: "appliance",
    frontCount: 0,
  },
  {
    placementId: "p7",
    buildId: "fridge-free-700",
    kind: "fridge_freestanding",
    family: "appliance",
    frontCount: 0,
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
 * **Every material instance under a mounted body, by name.**
 *
 * The witness that works for a body with no fronts. A painted surface wears a **clone**
 * (`finishes.ts`'s `buildFinishMaterial`), so if the kitchen's colour reached this body at all —
 * through the front path or through any future one — some mesh under it holds a different instance
 * than it holds in the same scene without a kitchen colour. Keyed by mesh name so a diff says which
 * mesh moved rather than only that the counts differ.
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

/** The same body drawn twice — once on a bare kitchen, once with the colour — and its materials
 *  compared instance by instance. Two separate roots, because a repaint is exactly what would
 *  otherwise be hidden by re-using one. */
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

/** The mirror of `expectSameMaterials`: **something under this body was repainted**, asserted on the
 *  instance rather than on a hex, because two declared colours can coincide and an instance cannot.
 *  The mesh set must be identical either way — a body that gained or lost a mesh is a different
 *  scene, not a repainted one. */
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

/** Hex **and** instance, so neither assertion can go vacuous alone: a front that was never painted
 *  keeps the shared `kit.M.door` instance whatever its hex happens to be. */
function expectWearingColour(
  front: THREE.Mesh,
  hex: string,
  where: string,
): void {
  expect(front.material, `${where}: front was not repainted`).not.toBe(
    kit.M.door,
  );
  const material = front.material as THREE.MeshStandardMaterial;
  expect(`#${material.color.getHexString()}`, where).toBe(hex);
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
  /** The table is the catalogue's, checked both ways: no `canFinish: false` body is missing from it
   *  and no row of it has stopped being one. A body joining or leaving the class fails **here**, by
   *  name, rather than silently changing what every sweep in this package covers. */
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

  /** **The `family` column is the catalogue's declaration and not a second opinion.** Read off each
   *  entry's `finishRule` through the domain's own fail-closed resolver, so a body moved between the
   *  two families in the catalogue fails here by name rather than leaving this file asserting the
   *  rule it was moved off. */
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

  /** **The scope fact backlog 60 turns on.** `applyBodyFinish` paints `collectFronts(body)` and
   *  nothing else, so a body with no front has no surface the colour mechanism can reach today.
   *  Four of the seven are in that state — the open shelf and the corner base return among them,
   *  both of which the ruling puts on the *structural* side that is to follow the kitchen. Making
   *  them follow is therefore not a change to the `canFinish` declaration alone; it needs a
   *  paintable surface that does not exist yet. Asserted rather than written in a report, so it is
   *  greppable from the code the implementer will edit. */
  it("mounts the stated number of paintable fronts for each, and none at all for four of them", () => {
    drawn(withKitchenColour(followingOn("material.melamine"), ANTRACIT));

    for (const row of UNCHOOSING) {
      expect(frontsOf(mounted(row.placementId)).length, row.buildId).toBe(
        row.frontCount,
      );
    }
    const frontless = UNCHOOSING.filter((row) => row.frontCount === 0);
    expect(frontless.map((row) => row.buildId).sort()).toEqual([
      "base-corner-return-320",
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

/** The three structural rows that actually draw a front — the only ones on which *followed the
 *  kitchen* is a claim about something visible. The other two structural rows are asserted in the
 *  domain instead; see the premise above. */
const PAINTABLE_STRUCTURAL = UNCHOOSING.filter(
  (row) => row.family === "structural" && row.frontCount > 0,
);

const APPLIANCES = UNCHOOSING.filter((row) => row.family === "appliance");

describe("backlog 60 — structural cabinetry wears the kitchen's colour, by name", () => {
  /** The set is stated rather than derived only by filter, so a structural row losing its fronts —
   *  or the corner base X being ruled out of the class — fails here instead of silently shrinking
   *  the sweep to nothing. */
  it("has three structural bodies whose fronts can show the colour", () => {
    expect(PAINTABLE_STRUCTURAL.map((row) => row.buildId).sort()).toEqual([
      "base-corner-x-900",
      "wall-corner-return-570",
      "wall-corner-return-570-top",
    ]);
  });

  it.each(PAINTABLE_STRUCTURAL)(
    "$buildId ($family) takes the kitchen's colour on melamine",
    (row) => {
      const { without, with_ } = materialsWithAndWithout(
        followingOn("material.melamine"),
        ANTRACIT,
        row.placementId,
      );

      expectRepainted(without, with_, row.buildId);
      const fronts = frontsOf(mounted(row.placementId));
      expect(fronts.length, row.buildId).toBe(row.frontCount);
      for (const front of fronts) {
        expectWearingColour(front, ANTRACIT_HEX, row.buildId);
      }
    },
  );

  /** Veneer, where the declared default is a tinted wood: *painted the kitchen's colour* and *left
   *  on the kit's own white* are visibly different values, so no row can pass by coincidence with
   *  the kit's hex. */
  it.each(PAINTABLE_STRUCTURAL)(
    "$buildId ($family) takes the kitchen's colour on veneer",
    (row) => {
      const { without, with_ } = materialsWithAndWithout(
        followingOn("material.veneer"),
        VENEER_NUC,
        row.placementId,
      );

      expectRepainted(without, with_, row.buildId);
      for (const front of frontsOf(mounted(row.placementId))) {
        expectWearingColour(front, VENEER_NUC_HEX, row.buildId);
      }
    },
  );

  /** **It follows and it does not choose** (ADR 0099 decision 2, and the half of decision 8 that
   *  stands). A colour hand-written onto a structural body — reachable by a restored backup or
   *  another client, never by this build's commands, because it has no control — is still not what
   *  gets drawn: the kitchen's colour is. */
  it.each(PAINTABLE_STRUCTURAL)(
    "$buildId ($family) draws the kitchen's colour and not one written onto its own body",
    (row) => {
      const base = followingOn("material.melamine");

      solidsRoot = new THREE.Group();
      drawn(wearingOn(withKitchenColour(base, ANTRACIT), row.placementId, NUC));

      for (const front of frontsOf(mounted(row.placementId))) {
        expectWearingColour(front, ANTRACIT_HEX, row.buildId);
      }
    },
  );
});

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
      // The premise for this material: a body that *can* wear a colour is wearing veneer's own
      // default in the bare scene, so "unpainted" here is a refusal and not an empty scene.
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

/** The two structural rows with no front at all. Nothing on screen can move for them today, and
 *  saying so here is what stops a future reader taking the domain's assertion as covered by the
 *  scene. Their following is proved in
 *  `configurator-domain/tests/structural-cabinetry-follows-the-kitchens-colour.test.ts`. */
describe("backlog 60 — the two frontless structural bodies have no surface to show it on", () => {
  const FRONTLESS_STRUCTURAL = UNCHOOSING.filter(
    (row) => row.family === "structural" && row.frontCount === 0,
  );

  it("names them", () => {
    expect(FRONTLESS_STRUCTURAL.map((row) => row.buildId).sort()).toEqual([
      "base-corner-return-320",
      "open-shelf-600",
    ]);
  });

  it.each(FRONTLESS_STRUCTURAL)(
    "$buildId ($family) mounts no front for the colour to reach",
    (row) => {
      const { without, with_ } = materialsWithAndWithout(
        followingOn("material.melamine"),
        ANTRACIT,
        row.placementId,
      );

      expect(frontsOf(mounted(row.placementId)).length, row.buildId).toBe(0);
      expectSameMaterials(without, with_, row.buildId);
    },
  );
});
