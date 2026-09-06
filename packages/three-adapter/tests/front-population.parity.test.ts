// **The gate that makes wave 6S's declarations facts rather than claims.**
//
// The domain declares how many of a body's fronts are door leaves, how many are drawers, and how
// tall each door band is (`BodyDefinition.fronts`), and it has to: pricing is a pure domain query,
// the domain has no meshes, and telling a drawer front from a hinged leaf inspects geometry
// (ADR 0061 decision 3, ADR 0070's first two recorded gaps). A declaration nothing checks is exactly
// the defect DOM-002 was. This file looks, for every insertable and every seeded body, against the
// real builders.
//
// ADR 0028's remedy for two numbers agreeing by luck, applied to the pair wave 6S creates, the way
// `cabinet-handle-count.parity.test.ts` applies it to wave 6L's.
//
// **The band-height half only means something because at least one entry's bands do not sum to its
// frame height.** `tall-pantry` draws 1290 and 790 inside a 2200 mm frame, so an implementation that
// simply read `heightMm` would pass a gate without such an entry — and would put ADR 0070's third
// hinge on a 790 mm door. It is asserted by name below.
//
// Scope is `KITCHEN_L_BODY_CATALOG`, **both** of its populations (ADR 0011 Gap A), and for an
// insertable row **every width it declares**.
import {
  doorLeafCount,
  doorLeafHeightsMm,
  drawerCount,
  freeColourFinish,
  KITCHEN_L_BODY_CATALOG,
  UndeclaredFrontPopulationError,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildCatalogBody, isCatalogBuildId } from "../src/catalog-bodies.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { applyFinish, collectFronts, swatchOf } from "../src/finishes.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { worldBox } from "./support/structure.js";

/** *Salvie*, reached by the free colour wave 6P mapped it to. The recolouring assertion is about
 *  which meshes a finish reaches, so any finish would do; this is the one it has used since M4. */
const SAGE = freeColourFinish("#8d9a84");

/** `kitchen-parts.ts`'s own two names, **retyped rather than imported**, for the reason
 *  `catalog-capability-parity.test.ts` retypes `FRONT_MESH_NAME`: a gate that reads its definition
 *  of a drawer front out of the code it checks proves only that the code equals itself. */
const DOOR_FRONT_MESH_NAME = "door_front";
const DRAWER_FRONT_MESH_NAME = "drawer_front";

/** **The one front in this kit that is neither**, and the reason the two names above are matched
 *  exactly rather than by a pattern. `ovenFillerFront` closes the cavity the oven leaves under the
 *  worktop with a fixed facade: nothing behind it opens, so it hangs on no hinge and rides on no
 *  runner, and `base-hob-oven` declares no band for it. It is still a *front* — the customer
 *  finishes it — which is why `finishes.ts`'s pattern reaches it and this gate must not. */
const OVEN_FILLER_MESH_NAME = "oven_filler_door_front";

/** M2's seeded instances: every entry of the one map that is not §7-insertable. Derived rather than
 *  listed, so a seeded entry added tomorrow is gated the day it lands. */
const SEEDED_BUILD_IDS: readonly string[] = [...KITCHEN_L_BODY_CATALOG]
  .filter(([, definition]) => definition.insertable !== true)
  .map(([buildId]) => buildId);

/** The width and height a seeded row is measured at, and they are deliberately not real ones: a
 *  seeded row has one already-built body (ADR 0011 Gap A), so there is nothing for a count or a band
 *  to follow, and every one of them declares fixed leaves and fixed band heights. The test below
 *  pins that premise rather than trusting it — a seeded row that took a width- or height-following
 *  rule would silently resolve against a one-door 0 mm cabinet with no band at all. */
const SEEDED_SIZE_IS_UNUSED_MM = 0;

interface GatedBody {
  readonly buildId: string;
  readonly widthMm: number;
  readonly frameHeightMm: number;
}

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  return definition;
}

function buildBodyOf({ buildId, widthMm, frameHeightMm }: GatedBody) {
  const definition = definitionOf(buildId);
  if (!isCatalogBuildId(buildId)) return buildDecomposedBody(kit, buildId);
  return buildCatalogBody(kit, buildId, {
    widthM: widthMm / 1000,
    heightM: frameHeightMm / 1000,
    depthM: (definition.nominalDepthMm ?? 0) / 1000,
  });
}

const GATED_BODIES: readonly GatedBody[] = [
  ...[...KITCHEN_L_BODY_CATALOG]
    .filter(([, definition]) => definition.insertable === true)
    .flatMap(([buildId, definition]) =>
      (definition.sizesMm ?? []).map((widthMm) => ({
        buildId,
        widthMm,
        frameHeightMm: definition.nominalHeightMm ?? 0,
      })),
    ),
  ...SEEDED_BUILD_IDS.map((buildId) => ({
    buildId,
    widthMm: SEEDED_SIZE_IS_UNUSED_MM,
    frameHeightMm: SEEDED_SIZE_IS_UNUSED_MM,
  })),
];

function queryFor(body: GatedBody) {
  return { ...body, rule: definitionOf(body.buildId).fronts };
}

/** Every mesh of this exact name in the built body, with its height in whole millimetres — the
 *  number the declaration states. The slabs carry no rotation, so a box height is a slab height. */
function builtFrontHeightsMm(
  built: THREE.Object3D,
  meshName: string,
): number[] {
  const heights: number[] = [];
  built.traverse((node) => {
    if (!isMesh(node) || node.name !== meshName) return;
    const box = worldBox(built, node);
    heights.push(Math.round((box.max.y - box.min.y) * 1000));
  });
  return heights;
}

/** Ascending, so a declaration and a measurement are compared as the multisets they are: a hinge
 *  rule asks a band's height, never its position up the front. */
function ascending(heightsMm: readonly number[]): number[] {
  return [...heightsMm].sort((a, b) => a - b);
}

/** The heights the declaration says the built leaves will have, sorted for the multiset comparison.
 *  **The pairing itself is `doorLeafHeightsMm`'s** — this file rebuilt it until wave 6S's fix pass,
 *  and so did the domain's own suite, which is what said it belonged in the module. */
function declaredLeafHeightsMm(body: GatedBody): number[] {
  return ascending(doorLeafHeightsMm(queryFor(body)));
}

describe("every catalogue entry's declared fronts match what its builder draws", () => {
  it("gates both populations of the one map, at every width an insertable row declares", () => {
    expect(SEEDED_BUILD_IDS.length).toBe(22);

    const gatedIds = new Set(GATED_BODIES.map(({ buildId }) => buildId));
    expect(gatedIds.size).toBe(KITCHEN_L_BODY_CATALOG.size);
    // The sweep is over widths, not over rows.
    expect(GATED_BODIES.length).toBeGreaterThan(gatedIds.size);
  });

  it("measures every seeded row against a rule that depends on neither width nor height", () => {
    for (const buildId of SEEDED_BUILD_IDS) {
      expect([buildId, definitionOf(buildId).fronts?.countedFrom]).toEqual([
        buildId,
        "declared-leaves",
      ]);
      expect([
        buildId,
        definitionOf(buildId).fronts?.doorBands.measuredFrom,
      ]).toEqual([buildId, "declared-heights"]);
    }
  });

  it.each(
    GATED_BODIES.map(
      (body) => [`${body.buildId}@${String(body.widthMm)}`, body] as const,
    ),
  )("%s: draws the drawers it declares", (label, body) => {
    const built = buildBodyOf(body);

    expect([
      label,
      builtFrontHeightsMm(built, DRAWER_FRONT_MESH_NAME).length,
    ]).toEqual([label, drawerCount(queryFor(body))]);
  });

  it.each(
    GATED_BODIES.map(
      (body) => [`${body.buildId}@${String(body.widthMm)}`, body] as const,
    ),
  )(
    "%s: draws the door leaves it declares, at the heights it declares",
    (label, body) => {
      const built = buildBodyOf(body);
      const builtLeaves = ascending(
        builtFrontHeightsMm(built, DOOR_FRONT_MESH_NAME),
      );

      expect([label, builtLeaves.length]).toEqual([
        label,
        doorLeafCount(queryFor(body)),
      ]);
      expect([label, builtLeaves]).toEqual([
        label,
        declaredLeafHeightsMm(body),
      ]);
    },
  );

  // The sweep above would pass on a catalogue of hoods. These are the populations it is actually
  // over, so an entry that stopped drawing fronts cannot make it vacuous.
  it("actually measures fronts, on both counts and across more than one height", () => {
    const built = GATED_BODIES.map(buildBodyOf);
    const leaves = built.flatMap((body) =>
      builtFrontHeightsMm(body, DOOR_FRONT_MESH_NAME),
    );
    const drawers = built.flatMap((body) =>
      builtFrontHeightsMm(body, DRAWER_FRONT_MESH_NAME),
    );

    expect(leaves.length).toBeGreaterThan(60);
    expect(drawers.length).toBeGreaterThan(20);
    expect(new Set(leaves).size).toBeGreaterThan(4);
  });
});

// **The defect this gate exists to catch, pinned from the failing side.** Without an entry whose
// bands do not sum to its frame height, an implementation that read `heightMm` would pass — and
// ADR 0070's 900 mm rule would put three hinges on a 790 mm door.
describe("a declared band is not the frame height", () => {
  it("holds the pantry's 1290 and 790 to the slabs in its 2200 mm frame", () => {
    const pantry = {
      buildId: "tall-pantry-600",
      widthMm: SEEDED_SIZE_IS_UNUSED_MM,
      frameHeightMm: SEEDED_SIZE_IS_UNUSED_MM,
    };
    const built = buildBodyOf(pantry);
    const builtLeaves = ascending(
      builtFrontHeightsMm(built, DOOR_FRONT_MESH_NAME),
    );

    // **Through the declaration, not against literals.** Written with the four numbers typed out,
    // this test passed on any wrong declaration at all — its own name promises it holds the pantry's
    // bands to the slabs, and only this line does that.
    expect(builtLeaves).toEqual(declaredLeafHeightsMm(pantry));
    expect(builtLeaves).toEqual([790, 790, 1290, 1290]);
    expect(definitionOf("tall-pantry-600").frameHeightMm).toBe(2200);
    // The whole body is 2200 tall and no band is, which is what makes the declaration necessary.
    expect(worldBox(built, built).max.y).toBeCloseTo(2.2, 6);
    expect(builtLeaves).not.toContain(2200);
    expect(new Set(builtLeaves).size).toBeGreaterThan(1);
  });

  // The other end of the same argument: an entry whose three bands are three different heights, only
  // one of which is over the threshold ADR 0070 counts a third hinge at.
  it("holds the fridge housing's three different bands to its three slabs", () => {
    const housing = {
      buildId: "tall-fridge-housing",
      widthMm: 600,
      frameHeightMm: 2200,
    };

    expect(
      ascending(
        builtFrontHeightsMm(buildBodyOf(housing), DOOR_FRONT_MESH_NAME),
      ),
    ).toEqual([190, 530, 1350]);
    expect(declaredLeafHeightsMm(housing)).toEqual([190, 530, 1350]);
  });

  // The `heightFlex` rows' rule, exercised at a height that is not their nominal — the sweep above
  // builds every insertable row at its nominal, so nothing there would notice a pinned 694.
  it.each([400, 700, 750])(
    "follows a wall carcass's own frame height at %s mm",
    (frameHeightMm) => {
      for (const buildId of ["wall-cabinet", "wall-lift"]) {
        const body = { buildId, widthMm: 600, frameHeightMm };

        expect([
          buildId,
          ascending(
            builtFrontHeightsMm(buildBodyOf(body), DOOR_FRONT_MESH_NAME),
          ),
        ]).toEqual([buildId, declaredLeafHeightsMm(body)]);
      }
    },
  );
});

// The distinction is declared in the builder and never inferred from `handleEdge` — the ADR 0061
// `kind`-is-not-enough mistake one field over. These are the three bodies that would be misread by
// an implementation that tried.
describe("drawer-ness is not the handle edge", () => {
  /** Every front slab in this body with the edge its bar hangs on, read off the built geometry: a
   *  bar above the slab's mid-height and running horizontally is a `"top"` edge. */
  function fronts(built: THREE.Object3D) {
    const found: { name: string; topEdge: boolean }[] = [];
    built.traverse((node) => {
      if (isMesh(node) || node.children.length === 0) return;
      const slab = node.children.find(
        (child) =>
          isMesh(child) &&
          (child.name === DOOR_FRONT_MESH_NAME ||
            child.name === DRAWER_FRONT_MESH_NAME),
      );
      const bar = node.children
        .find((child) => child.name === "handle")
        ?.children.find(
          (child) => isMesh(child) && child.name === "handle_bar",
        );
      if (!slab || !bar) return;
      const slabBox = worldBox(built, slab);
      const barBox = worldBox(built, bar);
      found.push({
        name: slab.name,
        topEdge:
          barBox.getCenter(new THREE.Vector3()).y >
            slabBox.getCenter(new THREE.Vector3()).y &&
          barBox.max.x - barBox.min.x > barBox.max.y - barBox.min.y,
      });
    });
    return found;
  }

  // `bottleCargo` and the drawers of `base-3drawer` both take a top bar, and only one of them is a
  // drawer. `doorSlab`'s own comment says the edge covers "drawers, and doors below the worktop".
  it("draws a top-edge bar on a leaf and on a drawer alike", () => {
    const cargo = fronts(
      buildBodyOf({
        buildId: "base-bottle-cargo",
        widthMm: 200,
        frameHeightMm: 860,
      }),
    );
    const dishwasher = fronts(
      buildBodyOf({
        buildId: "base-dishwasher",
        widthMm: 600,
        frameHeightMm: 860,
      }),
    );

    expect(cargo).toEqual([{ name: DRAWER_FRONT_MESH_NAME, topEdge: true }]);
    expect(dishwasher).toEqual([{ name: DOOR_FRONT_MESH_NAME, topEdge: true }]);
  });

  // The oven tower's lower leaf is a door below the worktop with a top bar; `wall-lift` is a single
  // flap with a bottom bar and is a leaf all the same.
  it("draws a door with a top bar and a flap with a bottom bar, and calls both leaves", () => {
    const tower = fronts(
      buildBodyOf({
        buildId: "tall-oven-tower",
        widthMm: 600,
        frameHeightMm: 2200,
      }),
    );
    const lift = fronts(
      buildBodyOf({ buildId: "wall-lift", widthMm: 600, frameHeightMm: 700 }),
    );

    expect(tower.map(({ name }) => name)).toEqual([
      DOOR_FRONT_MESH_NAME,
      DOOR_FRONT_MESH_NAME,
    ]);
    expect(tower.map(({ topEdge }) => topEdge)).toEqual([true, false]);
    expect(lift).toEqual([{ name: DOOR_FRONT_MESH_NAME, topEdge: false }]);
    expect(
      doorLeafCount(
        queryFor({ buildId: "wall-lift", widthMm: 600, frameHeightMm: 700 }),
      ),
    ).toBe(1);
  });
});

// **The check that made the rename cheap, stated rather than assumed** (wave 6S's own criterion).
// `finishes.ts`'s `FRONT_MESH_NAME` was already `/door_front|drawer_front/` before anything drew a
// `drawer_front`, so recolouring is unaffected by the split. A gate that only counted meshes would
// not have noticed the day it stopped being true.
describe("the rename leaves recolouring alone", () => {
  const drawerBody = {
    buildId: "base-3drawer",
    widthMm: 600,
    frameHeightMm: 860,
  };

  it("still collects a drawer front as a front", () => {
    const built = buildBodyOf(drawerBody);
    const fronts = collectFronts(built);

    expect(fronts.map((front) => front.name)).toEqual([
      DRAWER_FRONT_MESH_NAME,
      DRAWER_FRONT_MESH_NAME,
      DRAWER_FRONT_MESH_NAME,
    ]);
  });

  it("still recolours every one of them", () => {
    const built = buildBodyOf(drawerBody);
    const fronts = collectFronts(built);
    applyFinish(fronts, kit.M, SAGE);

    expect(fronts.length).toBe(3);
    for (const front of fronts) {
      const material = front.material as THREE.MeshStandardMaterial;
      expect([front.name, `#${material.color.getHexString()}`]).toEqual([
        DRAWER_FRONT_MESH_NAME,
        swatchOf(SAGE).color,
      ]);
    }
  });

  // The hob band's filler is reached by the same pattern and is not a leaf. Both halves matter:
  // recolouring must still find it, and this gate must not count it.
  it("still collects the hob filler, which is a facade and not a band", () => {
    const built = buildBodyOf({
      buildId: "base-hob-oven",
      widthMm: 600,
      frameHeightMm: 860,
    });
    const body = { buildId: "base-hob-oven", widthMm: 600, frameHeightMm: 860 };

    expect(collectFronts(built).map((front) => front.name)).toEqual([
      OVEN_FILLER_MESH_NAME,
    ]);
    expect(builtFrontHeightsMm(built, DOOR_FRONT_MESH_NAME)).toEqual([]);
    expect(doorLeafCount(queryFor(body))).toBe(0);
    expect(drawerCount(queryFor(body))).toBe(0);
  });
});

// ADR 0061 decision 4, one declaration over, from the side a required field cannot reach:
// `BodyCatalog` is a port, and a definition assembled outside TypeScript can arrive with no rule at
// all. It must fail loudly rather than fall back to the meshes it happens to build.
describe("an entry that declares no fronts refuses rather than counting its meshes", () => {
  it("refuses, although the built body would have answered", () => {
    const body = { buildId: "base-3drawer", widthMm: 600, frameHeightMm: 860 };
    // Built by *removing* the key rather than by setting it to `undefined`: an entry arriving
    // through the port with no rule at all is the case, and the two are not the same object under
    // `exactOptionalPropertyTypes`.
    const { fronts, ...undeclared } = definitionOf("base-3drawer");
    expect(fronts).toBeDefined();
    // The number a silent default would have reached for, and it is right — which is the point: it
    // is right for this row and would have been wrong for `base-hob-oven`, whose one front opens
    // nothing.
    expect(
      builtFrontHeightsMm(buildBodyOf(body), DRAWER_FRONT_MESH_NAME).length,
    ).toBe(3);

    const query = {
      ...body,
      rule: (undeclared as BodyDefinition).fronts,
    };
    expect(() => drawerCount(query)).toThrow(UndeclaredFrontPopulationError);
    expect(() => doorLeafCount(query)).toThrow(/base-3drawer/);
  });
});
