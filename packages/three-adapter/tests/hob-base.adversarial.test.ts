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
// `climbToSelectable` resolves a click on it to the cabinet without §6.1's accessory rule being
// consulted. That is a fact about the scene graph, and it is only true if the composite really
// parents the hob. Nothing before this file looked.
import {
  deriveColumns,
  derivePlacementRecords,
  insertBody,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildCatalogBody } from "../src/catalog-bodies.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { climbToSelectable, resolveSelection } from "../src/picking.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import {
  preMigrationHobDesign,
  PRE_MIGRATION_HOB_ID,
  PRE_MIGRATION_HOST_ID,
} from "./support/pre-migration-hob.js";
import { findMeshes, meshNames } from "./support/structure.js";

/** The seeded hob-bearing cabinet. */
const HOB_PLACEMENT_ID = "p2";
const HOB_BUILD_ID = "base-hob-2drawer-600";

/** The hob's own glass plate — one mesh per hob, so counting it counts hobs. */
const HOB_MESH_NAME = "cooktop_glass";
const OVEN_MESH_NAME = "oven_cavity";

const HOB_BASE_SIZE = { widthM: 0.6, heightM: 0.86, depthM: 0.58 } as const;

const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

let kit: Kit;
let room: THREE.Object3D;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  room = kit.builders["kitchen-l"]();
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
    syncSolidBodies({ kit, solidsRoot, records });
  });

  // The load-bearing half. If the hob were mounted as a sibling of the cabinet — or not parented at
  // all — this climb would answer `null` and the click would select nothing, while every existing
  // row-15 test would go on passing because they all run on synthetic records or on the
  // pre-migration document.
  it("climbs from the hob's own glass plate to the cabinet's placement id", () => {
    const hobMeshes = findMeshes(solidsRoot, HOB_MESH_NAME);

    expect(hobMeshes).toHaveLength(1);
    expect(climbToSelectable(hobMeshes[0] as THREE.Object3D)).toEqual({
      kind: "placement",
      id: HOB_PLACEMENT_ID,
    });
  });

  // And it resolves there **without** §6.1's accessory rule being consulted: the record the climb
  // lands on is a body, not an accessory, so `resolveSelection` passes it through untouched. That
  // is the sense in which ADR 0027 says the rule "is not gone; it is satisfied by construction".
  it("resolves that selection with no accessory record involved at all", () => {
    const selection = { kind: "placement", id: HOB_PLACEMENT_ID } as const;

    expect(records.some((record) => record.accessory)).toBe(false);
    expect(resolveSelection(selection, records)).toEqual(selection);
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
    syncSolidBodies({ kit, solidsRoot, records: [drawers] });

    expect(findMeshes(solidsRoot, OVEN_MESH_NAME)).toHaveLength(0);

    syncSolidBodies({
      kit,
      solidsRoot,
      records: [{ ...drawers, buildId: "base-hob-oven" }],
    });

    expect(findMeshes(solidsRoot, OVEN_MESH_NAME).length).toBeGreaterThan(0);
    expect(findMeshes(solidsRoot, HOB_MESH_NAME)).toHaveLength(1);
  });

  it("swaps back again, losing the oven and keeping the hob", () => {
    const solidsRoot = new THREE.Group();
    const oven = hobRecord("base-hob-oven");
    syncSolidBodies({ kit, solidsRoot, records: [oven] });
    syncSolidBodies({
      kit,
      solidsRoot,
      records: [{ ...oven, buildId: "base-hob-2drawer" }],
    });

    expect(findMeshes(solidsRoot, OVEN_MESH_NAME)).toHaveLength(0);
    expect(findMeshes(solidsRoot, HOB_MESH_NAME)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// The document ADR 0027 point 6 kept `cooktop-600` in the catalogue for.
// ---------------------------------------------------------------------------------------------
describe("a design saved before the migration still renders", () => {
  it("builds the retired `cooktop-600` body, hob and all", () => {
    const built = buildDecomposedBody(kit, "cooktop-600");

    expect(meshNames(built)).toContain(HOB_MESH_NAME);
    expect(built.name).toBe("induction_cooktop");
  });

  it("builds the drawer base that used to stand under it, with no hob on it", () => {
    const built = buildDecomposedBody(kit, "base-drawer2-600");

    expect(meshNames(built)).not.toContain(HOB_MESH_NAME);
  });

  // Together those two are the pre-migration pair, and the composite is the two of them merged:
  // every mesh name the pair draws appears in the composite, the same number of times.
  it("draws the same mesh names as the pair it replaced", () => {
    const composite = tally(meshNames(buildDecomposedBody(kit, HOB_BUILD_ID)));
    const pair = tally([
      ...meshNames(buildDecomposedBody(kit, "base-drawer2-600")),
      ...meshNames(buildDecomposedBody(kit, "cooktop-600")),
    ]);

    expect(composite).toEqual(pair);
  });
});

// ---------------------------------------------------------------------------------------------
// …and the one thing it could not do before ADR 0027's amendment: be swapped.
// ---------------------------------------------------------------------------------------------
//
// §5.3 swaps in place, so before the amendment it cascaded nothing. On this document that put two
// hobs in the same cubic centimetre: `p3` is a `cooktop-600` accessory hosted on `p2` (§6.1), and
// swapping `p2` for a body with a hob built in left `p3` behind, re-hosted onto the new body. The
// domain cannot see that — a hob contributes to no opening and both meshes are legal placements —
// so only this package, with the real builders and the real probe, can state the symptom as what
// the customer sees: two glass plates at one world position, and the spare undeletable.
describe("swapping a pre-migration cabinet for one that carries its own hob", () => {
  function swapHobBaseInto(design: Design, buildId: string) {
    const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
    const result = insertBody({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      columns: deriveColumns(records),
      target: { kind: "placement", id: PRE_MIGRATION_HOST_ID },
      buildId,
      probe: createBodyProbe(kit, room),
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error(`swap refused: ${result.reason.code}`);
    return result;
  }

  it.each(["base-hob-2drawer", "base-hob-oven"])(
    "mounts exactly one hob after swapping to %s, not two at the same point",
    (buildId) => {
      const result = swapHobBaseInto(preMigrationHobDesign(), buildId);
      const solidsRoot = new THREE.Group();
      syncSolidBodies({
        kit,
        solidsRoot,
        records: derivePlacementRecords(result.design, KITCHEN_L_BODY_CATALOG),
      });

      // The customer-visible symptom first: before the amendment this measured **2**, both at
      // world (2600, 866, 350) — z-fighting glass and doubled burner rings.
      expect(findMeshes(solidsRoot, HOB_MESH_NAME)).toHaveLength(1);
      expect(result.effect.cascadedAccessoryIds).toEqual([
        PRE_MIGRATION_HOB_ID,
      ]);
    },
  );

  // The narrowness of the rule, on real geometry: a plain door base carries no hob, so the
  // pre-migration accessory stays exactly where it was and still renders. This is the behaviour
  // that pre-dates ADR 0027 and the amendment does not touch it.
  it("keeps the loose hob when the incoming body has none of its own", () => {
    const result = swapHobBaseInto(preMigrationHobDesign(), "base-cabinet");
    const solidsRoot = new THREE.Group();
    syncSolidBodies({
      kit,
      solidsRoot,
      records: derivePlacementRecords(result.design, KITCHEN_L_BODY_CATALOG),
    });

    expect(result.effect.cascadedAccessoryIds).toEqual([]);
    expect(findMeshes(solidsRoot, HOB_MESH_NAME)).toHaveLength(1);
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
    accessory: false,
  };
}
