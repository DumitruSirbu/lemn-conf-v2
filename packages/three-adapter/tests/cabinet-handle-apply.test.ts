// **`docs/BACKLOG.md` entry 18, asserted from the apply side** (ADR 0061 decision 1).
//
// `setHandlesVisible` and `applyBlackHandleMaterial` used to reach every `handle` mesh in a body, so
// on `tall-oven-tower` — four bars, of which two are the cabinet's — `handle: "push"` hid the oven's
// and the microwave's alongside the doors', and `handle: "black"` repainted appliance hardware in
// cabinet hardware. The rule that tells the two apart already existed in the capability gate; this
// file holds the path that *carries out* a choice to the same rule.
//
// **Counted per body, never snapshotted.** A snapshot of a scene graph goes green on the wrong
// answer as readily as on the right one, and what is wrong here is a number: how many bars a choice
// reached. Every assertion below is a count of meshes on a real built body.
import { KITCHEN_L_BODY_CATALOG } from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  countBuiltCabinetHandles,
  isCabinetHandleGroup,
} from "../src/cabinet-handle-meshes.js";
import {
  buildCatalogBody,
  CATALOG_BUILD_IDS,
  isCatalogBuildId,
} from "../src/catalog-bodies.js";
import {
  applyBlackHandleMaterial,
  buildDecomposedBody,
  setHandlesVisible,
} from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** Every mesh `barHandle` builds — the bar and its two stems — whoever the handle belongs to. */
const HANDLE_PART_NAME = /handle_bar|handle_stem/;

const SEEDED_BUILD_IDS: readonly string[] = [...KITCHEN_L_BODY_CATALOG]
  .filter(([, definition]) => definition.insertable !== true)
  .map(([buildId]) => buildId);

const ALL_BUILD_IDS: readonly string[] = [
  ...CATALOG_BUILD_IDS,
  ...SEEDED_BUILD_IDS,
];

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function buildBodyOf(buildId: string, widthMm?: number): THREE.Group {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  if (!isCatalogBuildId(buildId)) return buildDecomposedBody(kit, buildId);
  return buildCatalogBody(kit, buildId, {
    widthM: (widthMm ?? definition.sizesMm?.[0] ?? 0) / 1000,
    heightM: (definition.nominalHeightMm ?? 0) / 1000,
    depthM: (definition.nominalDepthMm ?? 0) / 1000,
  });
}

/** Every handle part on this body, split by whose handle it hangs from. Both halves are collected in
 *  one traversal so a part cannot fall out of both and go unasserted. */
interface HandleParts {
  readonly cabinet: readonly THREE.Mesh[];
  readonly appliance: readonly THREE.Mesh[];
}

function handlePartsOf(body: THREE.Object3D): HandleParts {
  const cabinet: THREE.Mesh[] = [];
  const appliance: THREE.Mesh[] = [];

  body.traverse((node) => {
    if (!isMesh(node) || !HANDLE_PART_NAME.test(node.name)) return;
    const isCabinetPart = node.parent
      ? isCabinetHandleGroup(node.parent)
      : false;
    (isCabinetPart ? cabinet : appliance).push(node);
  });

  return { cabinet, appliance };
}

function countVisible(parts: readonly THREE.Mesh[]): number {
  return parts.filter((part) => part.visible).length;
}

function countWearing(
  parts: readonly THREE.Mesh[],
  material: THREE.Material | THREE.Material[],
): number {
  return parts.filter((part) => part.material === material).length;
}

describe("a handle choice reaches the cabinet's handles and no appliance's", () => {
  // The named case, both halves. Four bars on this body and two of them are the cabinet's, so both
  // numbers below would have been the same before the fix — which is what made the defect invisible.
  it("hides tall-oven-tower's two cabinet bars and leaves the oven's and the microwave's standing", () => {
    const tower = buildBodyOf("tall-oven-tower");
    const parts = handlePartsOf(tower);

    // Three meshes per handle: two cabinet handles, two appliance ones.
    expect(parts.cabinet).toHaveLength(6);
    expect(parts.appliance).toHaveLength(6);

    setHandlesVisible(tower, false);

    expect(countVisible(parts.cabinet)).toBe(0);
    expect(countVisible(parts.appliance)).toBe(6);
  });

  it("turns tall-oven-tower's own handles back on without touching the appliances'", () => {
    const tower = buildBodyOf("tall-oven-tower");
    const parts = handlePartsOf(tower);

    setHandlesVisible(tower, false);
    setHandlesVisible(tower, true);

    expect(countVisible(parts.cabinet)).toBe(6);
    expect(countVisible(parts.appliance)).toBe(6);
  });

  it("repaints only tall-oven-tower's two cabinet bars black", () => {
    const tower = buildBodyOf("tall-oven-tower");
    const parts = handlePartsOf(tower);
    const steel = kit.M.steel;

    applyBlackHandleMaterial(tower, kit.M);

    const black = parts.cabinet[0]?.material;
    expect(black).toBeDefined();
    expect(black).not.toBe(steel);
    expect(countWearing(parts.cabinet, black as THREE.Material)).toBe(6);
    expect(countWearing(parts.appliance, steel)).toBe(6);
  });

  // Asserted **directly**, not through `canHandle: false`: the flag is what keeps the panel from
  // offering this body a handle chip today, and a flag is a decision someone can change. The
  // exposure must not come back if it does.
  it("leaves base-hob-oven's one bar — the oven's — visible and steel under both choices", () => {
    const hobOven = buildBodyOf("base-hob-oven");
    const parts = handlePartsOf(hobOven);

    expect(parts.cabinet).toHaveLength(0);
    expect(parts.appliance).toHaveLength(3);

    setHandlesVisible(hobOven, false);
    applyBlackHandleMaterial(hobOven, kit.M);

    expect(countVisible(parts.appliance)).toBe(3);
    expect(countWearing(parts.appliance, kit.M.steel)).toBe(3);
  });

  // The other half of the criterion: nothing else moved. Swept over the whole catalogue rather than
  // sampled, because "every body with no appliance bar behaves exactly as it did" is a statement
  // about all of them and a sample cannot make it.
  it.each(ALL_BUILD_IDS)(
    "%s: a push choice hides every cabinet handle part and no other mesh",
    (buildId) => {
      const body = buildBodyOf(buildId);
      const parts = handlePartsOf(body);
      const otherMeshes: THREE.Mesh[] = [];
      body.traverse((node) => {
        if (isMesh(node) && !HANDLE_PART_NAME.test(node.name)) {
          otherMeshes.push(node);
        }
      });

      setHandlesVisible(body, false);

      expect([buildId, countVisible(parts.cabinet)]).toEqual([buildId, 0]);
      expect([buildId, countVisible(parts.appliance)]).toEqual([
        buildId,
        parts.appliance.length,
      ]);
      expect([buildId, countVisible(otherMeshes)]).toEqual([
        buildId,
        otherMeshes.length,
      ]);
    },
  );

  it.each(ALL_BUILD_IDS)(
    "%s: a black choice repaints every cabinet handle part and no other mesh",
    (buildId) => {
      const body = buildBodyOf(buildId);
      const parts = handlePartsOf(body);
      const steel = kit.M.steel;

      applyBlackHandleMaterial(body, kit.M);

      const repainted = parts.cabinet.filter(
        (part) => part.material !== steel,
      ).length;
      expect([buildId, repainted]).toEqual([buildId, parts.cabinet.length]);
      expect([buildId, countWearing(parts.appliance, steel)]).toEqual([
        buildId,
        parts.appliance.length,
      ]);
    },
  );

  // The sweep above is only worth its runtime if the two populations it splits are both non-empty
  // somewhere, and if `handlePartsOf` splits bodies the same way the apply path does.
  it("sees appliance bars on five bodies, three families, and cabinet handles on the rest", () => {
    const withApplianceBars: string[] = [];
    let cabinetHandlesSeen = 0;

    for (const buildId of ALL_BUILD_IDS) {
      const body = buildBodyOf(buildId);
      const parts = handlePartsOf(body);
      if (parts.appliance.length > 0) withApplianceBars.push(buildId);
      // The splitter and the counter the parity gate uses are the same rule, read two ways.
      expect([buildId, parts.cabinet.length]).toEqual([
        buildId,
        countBuiltCabinetHandles(body) * 3,
      ]);
      cabinetHandlesSeen += countBuiltCabinetHandles(body);
    }

    expect(withApplianceBars.sort()).toEqual([
      "base-hob-oven",
      "fridge-free",
      "fridge-free-700",
      "tall-oven-tower",
      "tall-oven-tower-600",
    ]);
    expect(cabinetHandlesSeen).toBeGreaterThan(0);
  });
});
