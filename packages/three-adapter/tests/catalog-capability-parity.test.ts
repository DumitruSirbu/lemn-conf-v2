// A catalogue entry's declared `canFinish` / `canHandle` must match the meshes its builder produces: the flags live
// in the domain, which has no meshes, and §9 renders a section from them ("never offer what cannot be satisfied").
// Scope is both populations of `KITCHEN_L_BODY_CATALOG` (ADR 0011 Gap A): insertable entries built by
// `buildCatalogBody`, and seeded instances built by `buildDecomposedBody`, which is the half the customer selects.
import {
  KITCHEN_L_BODY_CATALOG,
  type BodyDefinition,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCatalogBody,
  CATALOG_BUILD_IDS,
  isCatalogBuildId,
} from "../src/catalog-bodies.js";
import { isCabinetHandleGroup } from "../src/cabinet-handle-meshes.js";
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/**
 * `finishes.ts`'s `FRONT_MESH_NAME`, written out rather than imported: a gate reading its definition of a front out
 * of the code it checks proves only that the code equals itself. `door_front` is the generic front name (`base-panbank`
 * uses it for drawer fronts), so an entry with no `drawer_front` mesh is not thereby frontless.
 */
const FRONT_MESH_NAME = /door_front|drawer_front/;

/**
 * `body-finish-surfaces.ts`'s `WEARS_THE_BODYS_FINISH_KEY`, written out for the same reason: a body's colour reaches
 * its fronts plus every mesh carrying this key, the only way the open shelf and the corner bodies are painted.
 */
const WEARS_THE_BODYS_FINISH_KEY = "lemnaria:wearsTheBodysFinish";

/** The group `barHandle` builds. Both a cabinet's handle and an appliance's are one of these. */
const HANDLE_GROUP_NAME = "handle";

/** M2's seeded instances: every entry of the one map that is not §7-insertable. Derived rather
 *  than listed, so a seeded entry added tomorrow is gated the day it lands. */
const SEEDED_BUILD_IDS: readonly string[] = [...KITCHEN_L_BODY_CATALOG]
  .filter(([, definition]) => definition.insertable !== true)
  .map(([buildId]) => buildId);

const ALL_BUILD_IDS: readonly string[] = [
  ...CATALOG_BUILD_IDS,
  ...SEEDED_BUILD_IDS,
];

/**
 * Entries whose flags are known not to match their geometry, exempted from the rule and pinned to the inverse by
 * the companion test, so a repaired entry cannot outlive its exemption. Empty since ADR 0051 (the dishwasher niche
 * now wears a decor door); the census control at the foot of the file pins their numbers.
 */
const RECORDED_CAPABILITY_GAPS: readonly string[] = [];

const GATED_BUILD_IDS = ALL_BUILD_IDS.filter(
  (buildId) => !RECORDED_CAPABILITY_GAPS.includes(buildId),
);

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

interface CapabilityCensus {
  readonly canFinish: boolean;
  readonly canHandle: boolean;
  readonly fronts: number;
  /** Fronts plus declared surfaces: what `collectPaintedSurfaces` reaches, and what `canFinish` is held against. */
  readonly paintedSurfaces: number;
  readonly cabinetHandles: number;
}

/**
 * A bare `handle_bar` count cannot tell a cabinet's handle from an appliance's: `base-hob-oven` has one that is
 * the oven's, `tall-oven-tower` has four of which two are the cabinet's. The rule is `isCabinetHandleGroup`,
 * imported so the gate and the renderer share it (ADR 0061 decision 1); the "agrees with the rule this gate
 * would write itself" test holds it to an independent re-derivation.
 */
function censusOf(buildId: string, widthMm?: number): CapabilityCensus {
  const definition = definitionOf(buildId);
  const built = buildBodyOf(buildId, definition, widthMm);

  let fronts = 0;
  let paintedSurfaces = 0;
  let cabinetHandles = 0;
  built.traverse((node) => {
    if (!isMesh(node)) {
      if (isCabinetHandleGroup(node)) cabinetHandles += 1;
      return;
    }
    const isFront = FRONT_MESH_NAME.test(node.name);
    if (isFront) fronts += 1;
    // Counted once even if it is both, exactly as `collectPaintedSurfaces` collects it once.
    if (isFront || node.userData[WEARS_THE_BODYS_FINISH_KEY] === true) {
      paintedSurfaces += 1;
    }
    if (isCabinetHandleGroup(node)) cabinetHandles += 1;
  });

  return {
    canFinish: definition.canFinish,
    canHandle: definition.canHandle,
    fronts,
    paintedSurfaces,
    cabinetHandles,
  };
}

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  return definition;
}

/**
 * The populations differ only here: an insertable entry is given a size, a seeded one is one hardcoded call. The
 * default width is the entry's narrowest, the hardest case for "declares a front and draws one"; a caller that cares
 * which form it measures passes one (a merged cabinet's door count follows its width, ADR 0033).
 */
function buildBodyOf(
  buildId: string,
  definition: BodyDefinition,
  widthMm?: number,
): THREE.Group {
  if (!isCatalogBuildId(buildId)) return buildDecomposedBody(kit, buildId);
  return buildCatalogBody(kit, buildId, {
    widthM: (widthMm ?? definition.sizesMm?.[0] ?? 0) / 1000,
    heightM: (definition.nominalHeightMm ?? 0) / 1000,
    depthM: (definition.nominalDepthMm ?? 0) / 1000,
  });
}

/**
 * This gate's own reading of ADR 0061's rule, used only by the independence assertion: a handle group whose parent
 * also holds a front.
 */
function opensAFront(node: THREE.Object3D): boolean {
  if (isMesh(node) || node.name !== HANDLE_GROUP_NAME) return false;
  const owner = node.parent;
  if (!owner) return false;
  return owner.children.some(
    (sibling) => isMesh(sibling) && FRONT_MESH_NAME.test(sibling.name),
  );
}

describe("every catalogue entry's capability flags match what its builder draws", () => {
  it("covers the whole catalogue, with the recorded gaps named rather than dropped", () => {
    expect([...GATED_BUILD_IDS, ...RECORDED_CAPABILITY_GAPS].sort()).toEqual(
      [...ALL_BUILD_IDS].sort(),
    );
  });

  // The membership assertion the test above cannot make: `GATED` is derived from `ALL`, so that equality holds for any
  // subset of `RECORDED`. Widening the list has to mean editing a test that names what is added.
  it("has no recorded gaps: every entry in both populations is gated", () => {
    expect([...RECORDED_CAPABILITY_GAPS]).toEqual([]);
    expect(GATED_BUILD_IDS).toEqual(ALL_BUILD_IDS);
  });

  // The population sizes are pinned so the prose cannot drift from the map.
  it("gates both populations of the one map, not just the insertable half", () => {
    expect(CATALOG_BUILD_IDS.length).toBe(16);
    expect(SEEDED_BUILD_IDS.length).toBe(24);
    expect(ALL_BUILD_IDS.length).toBe(
      CATALOG_BUILD_IDS.length + SEEDED_BUILD_IDS.length,
    );
    expect(SEEDED_BUILD_IDS).toContain("fridge-free-700");
    expect(new Set(ALL_BUILD_IDS).size).toBe(ALL_BUILD_IDS.length);
  });

  /**
   * `canFinish` implies a painted surface, not a front: `applyBodyFinish` paints `collectPaintedSurfaces`, so that is
   * the number the flag is held against (`base-corner-return-320` has no door at all).
   */
  it.each(GATED_BUILD_IDS)(
    "%s: canFinish implies a painted surface, canHandle implies a cabinet handle",
    (buildId) => {
      const census = censusOf(buildId);

      expect([
        buildId,
        census.canFinish && census.paintedSurfaces === 0,
      ]).toEqual([buildId, false]);
      expect([
        buildId,
        census.canHandle && census.cabinetHandles === 0,
      ]).toEqual([buildId, false]);
    },
  );

  // Each exempted entry really does violate the rule, so a repaired one turns this red. A loop rather than `it.each`,
  // which generates no test over an empty list: the list is empty now, and its next entry needs an inverse pin.
  it("holds each recorded gap to still declaring a capability its geometry lacks", () => {
    for (const buildId of RECORDED_CAPABILITY_GAPS) {
      const census = censusOf(buildId);

      expect([
        buildId,
        (census.canFinish && census.paintedSurfaces === 0) ||
          (census.canHandle && census.cabinetHandles === 0),
      ]).toEqual([buildId, true]);
    }
  });

  // The gate's own premise: if the front regex or the handle rule matched nothing, every implication above would hold
  // vacuously for entries declaring the flags `false`. This entry is the control.
  it("recognises a real front and a real cabinet handle when it sees one", () => {
    // At 800 mm so the merged entry builds its two-door form (its door count follows width, ADR 0033).
    expect(censusOf("base-cabinet", 800)).toMatchObject({
      fronts: 2,
      paintedSurfaces: 2,
      cabinetHandles: 2,
    });
  });

  /**
   * The second half of the premise: a painted surface that is not a front is counted, else the two numbers could
   * be one field twice. `base-corner-return-320` has a declared carcass and fixed front that no front regex names
   * (ADR 0135); `open-shelf-600` is the case the mechanism was built for.
   */
  it("counts a declared painted surface that no front regex can name", () => {
    expect(censusOf("base-corner-return-320")).toMatchObject({
      canFinish: true,
      fronts: 0,
      paintedSurfaces: 2,
    });
    expect(censusOf("open-shelf-600")).toMatchObject({
      fronts: 0,
      paintedSurfaces: 6,
    });
  });

  // A `handle_bar` count would get this wrong: the hob base's only handle is the oven's, and the tower builds four bars
  // of which two are the cabinet's. The hob base's one front is its filler panel, so `canFinish` follows the front and
  // `canHandle` the cabinet-handle count.
  // ADR 0051: the niche is an ordinary fronted body with one `door_front`, one cabinet handle and one `handle_bar` (the
  // door's); a second bar would mean the appliance was built exposed again.
  it("counts the dishwasher niche's decor door and its one cabinet handle", () => {
    for (const buildId of ["base-dishwasher", "base-dishwasher-600"]) {
      expect(censusOf(buildId), buildId).toMatchObject({
        fronts: 1,
        cabinetHandles: 1,
        canFinish: true,
        canHandle: true,
      });
      expect(handleBarCountOf(buildId), buildId).toBe(1);
    }
  });

  // Every node of every body is judged by `isCabinetHandleGroup` and by this file's own reading of it, so a widening
  // of the shared rule that parts the two fails here.
  it("agrees with the rule this gate would write itself, over every node of every body", () => {
    let handleGroupsSeen = 0;

    for (const buildId of ALL_BUILD_IDS) {
      const definition = definitionOf(buildId);
      buildBodyOf(buildId, definition).traverse((node) => {
        if (!isMesh(node) && node.name === HANDLE_GROUP_NAME)
          handleGroupsSeen += 1;
        expect([buildId, node.name, isCabinetHandleGroup(node)]).toEqual([
          buildId,
          node.name,
          opensAFront(node),
        ]);
      });
    }

    // Not a vacuous sweep: the catalogue really does build handle groups for it to judge.
    expect(handleGroupsSeen).toBeGreaterThan(0);
  });

  it("does not count an appliance's handle as the cabinet's", () => {
    expect(censusOf("base-hob-oven")).toMatchObject({
      fronts: 1,
      cabinetHandles: 0,
      canFinish: true,
      canHandle: false,
    });
    expect(handleBarCountOf("base-hob-oven")).toBe(1);
    expect(censusOf("tall-oven-tower")).toMatchObject({ cabinetHandles: 2 });
    expect(handleBarCountOf("tall-oven-tower")).toBe(4);
  });
});

function handleBarCountOf(buildId: string): number {
  const built = buildBodyOf(buildId, definitionOf(buildId));
  let bars = 0;
  built.traverse((node) => {
    if (isMesh(node) && node.name.includes("handle_bar")) bars += 1;
  });
  return bars;
}
