// **ADR 0099 decision 8, asserted one named body at a time rather than swept over a flag.**
//
// Decision 8 rules that a body with `canFinish: false` is unaffected at both levels, and every
// existing proof of it — `qa-0099b`'s acceptance-8 block, `qa-0099-global-colour`'s document half —
// is written over `records.filter((record) => !record.canFinish)`. That is one assertion about one
// class, and it is only honest while the class is one thing.
//
// **It is about to stop being one thing.** Backlog 60 (owner, 2026-09-09) rules that *structural
// cabinetry follows the kitchen's colour and appliances never do*, which splits today's single flag
// down the middle. A sweep over `canFinish` would go on passing on the day that lands — it would
// simply be asserting the old rule over a set that no longer means what it meant — so the claim is
// restated here **per body, by build id**, and the row that must change is the row that goes red.
//
// The `family` column is the ruling's own division, recorded so a reader can see which rows it
// touches. **Nothing here implements it**: every row asserts today's behaviour, which is that all
// seven are painted at neither level.
//
// **The observability premise is per body too, and it is not a formality.** Four of the seven draw
// no door or drawer front at all, and `applyBodyFinish` (`finishes.ts:193`) reaches
// `collectFronts(body)` and nothing else — so on those four "was not painted" is a claim about a
// surface that does not exist, and a front-instance assertion would inspect an empty list and pass
// without looking (ADR 0093 decision 1). Every row is therefore asserted on **the multiset of
// material instances under the mounted body, with the kitchen's colour against without** — a claim
// that says *the kitchen's colour did not reach this body* whether or not the body has fronts — and
// the three rows that do draw fronts carry the sharper front-instance assertion as well.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  materialById,
  paletteFinish,
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

/** A body that *can* wear a colour, drawn in the same scene as every refusal below: without it a
 *  "left unpainted" run is satisfied by a scene that painted nothing at all. */
const FINISHABLE_WITNESS_ID = "p1";

/** Backlog 60's division. `structural` and `appliance` are the owner's own words; today both
 *  columns behave identically, and the ruling is what will separate them. */
type Family = "structural" | "appliance";

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
 * (the run and its top row) — and each is a separate declaration that the implementer has to rule
 * on separately.
 */
const UNPAINTABLE: readonly UnpaintableBody[] = [
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
      UNPAINTABLE.map((row) => row.placementId).sort(),
    );
    for (const row of UNPAINTABLE) {
      const record = declared.find(
        (candidate) => candidate.id === row.placementId,
      );
      expect(record, row.placementId).toBeDefined();
      expect(record?.buildId, row.placementId).toBe(row.buildId);
      expect(record?.kind, row.placementId).toBe(row.kind);
    }
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

    for (const row of UNPAINTABLE) {
      expect(frontsOf(mounted(row.placementId)).length, row.buildId).toBe(
        row.frontCount,
      );
    }
    const frontless = UNPAINTABLE.filter((row) => row.frontCount === 0);
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

describe("ADR 0099 decision 8 — the kitchen's colour reaches none of these seven, by name", () => {
  it.each(UNPAINTABLE)(
    "$buildId ($family) is untouched by a kitchen colour on melamine",
    (row) => {
      const { without, with_ } = materialsWithAndWithout(
        followingOn("material.melamine"),
        ANTRACIT,
        row.placementId,
      );

      expectSameMaterials(without, with_, row.buildId);
      // The sharper claim where there is a surface to make it about.
      for (const front of frontsOf(mounted(row.placementId))) {
        expect(front.material, row.buildId).toBe(kit.M.door);
      }
      expect(frontsOf(mounted(row.placementId)).length).toBe(row.frontCount);
    },
  );

  /** Veneer, where the declared default is a tinted wood: *not painted* and *painted white* are
   *  visibly different values, so no row can pass here by coincidence with the kit's own hex. */
  it.each(UNPAINTABLE)(
    "$buildId ($family) is untouched by a kitchen colour on veneer",
    (row) => {
      const veneer = followingOn("material.veneer");
      const { without, with_ } = materialsWithAndWithout(
        veneer,
        paletteFinish("veneer.nuc"),
        row.placementId,
      );

      expectSameMaterials(without, with_, row.buildId);
      for (const front of frontsOf(mounted(row.placementId))) {
        expect(front.material, row.buildId).toBe(kit.M.door);
      }
      // The premise for this material: a body that *can* wear a colour is wearing veneer's own
      // default in the bare scene, so "unpainted" here is a refusal and not an empty scene.
      expect(materialById("material.veneer").defaultFinish).toBeDefined();
    },
  );

  /** The cabinet level, per body: a colour hand-written onto one of these — reachable by a restored
   *  backup or another client, never by this build's commands — is refused too. */
  it.each(UNPAINTABLE)(
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
      for (const front of frontsOf(mounted(row.placementId))) {
        expect(front.material, row.buildId).toBe(kit.M.door);
      }
    },
  );
});
