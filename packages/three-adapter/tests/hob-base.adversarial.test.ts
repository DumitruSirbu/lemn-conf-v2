// Adversarial QA over ADR 0027, on the side of the seam where the two hob-bearing bodies are
// actually different from each other.
//
// The domain cannot tell `base-hob-2drawer` from `base-hob-oven`: their `BodyDefinition`s are
// identical but for the label. Only the builders differ, so only this package can prove that the
// entry the customer chose is the body that got built — and that a swap between them really changes
// the scene rather than leaving the mounted body alone.
//
// It also owns the assertion ADR 0027 makes in prose and nothing checked: **§11 row 15 is satisfied
// by construction**. The claim is that the hob is a child mesh of its cabinet's group, so
// `climbToSelectable` resolves a click on it to the cabinet with no second pass over the records.
// That is a fact about the scene graph, and it is only true if the composite really parents the
// hob. Nothing before this file looked.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  NO_FRONT_ASSEMBLY_MM,
  shellPlusFrontMm,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { climbToSelectable } from "../src/picking.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { findMeshes, meshNames } from "./support/structure.js";

/** The seeded hob-bearing cabinet. */
const HOB_PLACEMENT_ID = "p2";
const HOB_BUILD_ID = "base-hob-2drawer-600";

/** The hob's own glass plate — one mesh per hob, so counting it counts hobs. */
const HOB_MESH_NAME = "cooktop_glass";
const OVEN_MESH_NAME = "oven_cavity";

const HOB_BASE_SIZE = { widthM: 0.6, heightM: 0.86, depthM: 0.58 } as const;

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

// ---------------------------------------------------------------------------------------------
// §11 row 15, for the reason its name says.
// ---------------------------------------------------------------------------------------------
describe("§11 row 15 on the shipped design: clicking the hob selects its cabinet", () => {
  let solidsRoot: THREE.Group;
  let records: readonly PlacementRecord[];

  beforeEach(() => {
    solidsRoot = new THREE.Group();
    records = derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
    syncSolidBodies({ kit, solidsRoot, records, room: KITCHEN_L_DESIGN.room });
  });

  // The load-bearing half. If the hob were mounted as a sibling of the cabinet — or not parented at
  // all — this climb would answer `null` and the click would select nothing. `row15-pick.qa.test.ts`
  // closes the remaining hop, asserting the same thing through `pick` itself so the rule is pinned
  // at the entry point the pointer handler calls rather than at this function alone.
  it("climbs from the hob's own glass plate to the cabinet's placement id", () => {
    const hobMeshes = findMeshes(solidsRoot, HOB_MESH_NAME);

    expect(hobMeshes).toHaveLength(1);
    expect(climbToSelectable(hobMeshes[0] as THREE.Object3D)).toEqual({
      kind: "placement",
      id: HOB_PLACEMENT_ID,
    });
  });

  // There is no hob placement any more, so there is nothing to offer a delete on — the other half
  // of row 15, stated as a fact about the mounted scene rather than about a refusal code.
  it("mounts the hob under a placement that is deletable, and no placement of its own", () => {
    const mountedIds = solidsRoot.children.map(
      (child) => child.userData["placementId"] as string | undefined,
    );

    expect(mountedIds).toContain(HOB_PLACEMENT_ID);
    expect(
      records.filter((record) => record.kind === "induction_cooktop"),
    ).toEqual([]);
    expect(
      records.find((record) => record.id === HOB_PLACEMENT_ID)?.canDelete,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// One hob, and exactly one.
// ---------------------------------------------------------------------------------------------
describe("the composite carries exactly one hob", () => {
  it("draws one glass plate on the seeded body, not the two a double-mount would give", () => {
    const built = buildDecomposedBody(kit, HOB_BUILD_ID);

    expect(
      meshNames(built).filter((name) => name === HOB_MESH_NAME),
    ).toHaveLength(1);
  });

  it.each(["base-hob-2drawer", "base-hob-oven"])(
    "draws one glass plate on the catalogue entry %s",
    (buildId) => {
      const built = buildCatalogBody(kit, buildId, HOB_BASE_SIZE);

      expect(
        meshNames(built).filter((name) => name === HOB_MESH_NAME),
      ).toHaveLength(1);
    },
  );

  // The whole seeded scene: one hob in the kitchen, and it belongs to `p2`. Before ADR 0027 the hob
  // was its own placement; a migration that forgot to drop `p3` would render two, and the domain
  // would never notice because a hob adds nothing to any opening.
  it("renders one hob across the whole mounted kitchen, inside p2's group", () => {
    const solidsRoot = new THREE.Group();
    syncSolidBodies({
      kit,
      solidsRoot,
      records: derivePlacementRecords(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
      room: KITCHEN_L_DESIGN.room,
    });

    const hobs = findMeshes(solidsRoot, HOB_MESH_NAME);
    expect(hobs).toHaveLength(1);
    expect(climbToSelectable(hobs[0] as THREE.Object3D)?.id).toBe(
      HOB_PLACEMENT_ID,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Two entries the domain cannot separate.
// ---------------------------------------------------------------------------------------------
describe("the adapter is the only layer that tells the two hob bases apart", () => {
  it("builds an oven for base-hob-oven and none for base-hob-2drawer", () => {
    expect(
      meshNames(buildCatalogBody(kit, "base-hob-oven", HOB_BASE_SIZE)),
    ).toContain(OVEN_MESH_NAME);
    expect(
      meshNames(buildCatalogBody(kit, "base-hob-2drawer", HOB_BASE_SIZE)),
    ).not.toContain(OVEN_MESH_NAME);
  });

  // The two entries carry the same width, depth, band and kind, so a `bodySignature` built from the
  // record's measurements alone would be identical across the swap and `syncSolidBodies` would keep
  // the old mesh tree — the customer would pick "Corp plită și cuptor" and see the drawers stay.
  // This is the case that catches that, and it is only visible through the real builders.
  it("rebuilds the mounted body when the customer swaps between them", () => {
    const solidsRoot = new THREE.Group();
    const drawers = hobRecord("base-hob-2drawer");
    syncSolidBodies({
      kit,
      solidsRoot,
      records: [drawers],
      room: KITCHEN_L_DESIGN.room,
    });

    expect(findMeshes(solidsRoot, OVEN_MESH_NAME)).toHaveLength(0);

    syncSolidBodies({
      kit,
      solidsRoot,
      records: [{ ...drawers, buildId: "base-hob-oven" }],
      room: KITCHEN_L_DESIGN.room,
    });

    expect(findMeshes(solidsRoot, OVEN_MESH_NAME).length).toBeGreaterThan(0);
    expect(findMeshes(solidsRoot, HOB_MESH_NAME)).toHaveLength(1);
  });

  it("swaps back again, losing the oven and keeping the hob", () => {
    const solidsRoot = new THREE.Group();
    const oven = hobRecord("base-hob-oven");
    syncSolidBodies({
      kit,
      solidsRoot,
      records: [oven],
      room: KITCHEN_L_DESIGN.room,
    });
    syncSolidBodies({
      kit,
      solidsRoot,
      records: [{ ...oven, buildId: "base-hob-2drawer" }],
      room: KITCHEN_L_DESIGN.room,
    });

    expect(findMeshes(solidsRoot, OVEN_MESH_NAME)).toHaveLength(0);
    expect(findMeshes(solidsRoot, HOB_MESH_NAME)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// The composite really is the two bodies it replaced.
// ---------------------------------------------------------------------------------------------
describe("the hob-bearing base is the drawer base and the cooktop, merged", () => {
  it("builds the drawer base that used to stand under the hob, with no hob on it", () => {
    const built = buildDecomposedBody(kit, "base-drawer2-600");

    expect(meshNames(built)).not.toContain(HOB_MESH_NAME);
  });

  // Every mesh name the pair draws appears in the composite, the same number of times. The pair is
  // built from the kit's own two calls rather than from a retired catalogue id: ADR 0038 deleted
  // `cooktop-600`, and the claim was never about that row — it is about the two builders.
  it("draws the same mesh names as the pair it replaced", () => {
    const composite = tally(meshNames(buildDecomposedBody(kit, HOB_BUILD_ID)));
    const pair = tally([
      ...meshNames(buildDecomposedBody(kit, "base-drawer2-600")),
      ...meshNames(kit.builders.cooktop()),
    ]);

    expect(composite).toEqual(pair);
  });
});

function tally(names: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of names) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}

/** A mounted hob-bearing base at the seeded cabinet's own place, so a swap between the two entries
 *  changes nothing but the `buildId`. */
function hobRecord(buildId: string): PlacementRecord {
  return {
    id: HOB_PLACEMENT_ID,
    buildId,
    kind: "base_cabinet",
    frame: { x: 2.6, z: 0.29, ry: 0, y0: 0, w: 0.6, h: 0.86, d: 0.58 },
    col: "A|2.60",
    wall: "A",
    rotated: false,
    band: "base",
    widthMm: 600,
    heightMm: 860,
    canFinish: true,
    canHandle: true,
    canReplace: true,
    canDelete: true,
    fixedWidth: true,
    kitchenSettings: {},
    // A mount fixture, not a fit fixture: nothing here reads the depth, so the record declares the
    // frame it states rather than the hob base's real worktop line.
    occupiedDepth: shellPlusFrontMm(NO_FRONT_ASSEMBLY_MM),
  };
}
