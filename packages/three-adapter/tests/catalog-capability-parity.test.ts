// The gate ADR 0027's `base-hob-oven` needed and no layer had: **a catalogue entry's declared
// capability flags must match the meshes its builder actually produces.**
//
// §9 opens with "never offer what cannot be satisfied" and §13.1 decides "disable, don't warn — any
// size or body that cannot be satisfied is greyed and unclickable". `canFinish` and `canHandle` are
// the two flags that decide whether §9 renders a section at all, and they live in the domain, which
// has no meshes. Only this package can tell whether the body behind the flag has anything to
// recolour or any handle to hide, so the two halves have never been checked against each other —
// which is how `base-hob-oven` shipped declaring both `true` over an open-front carcass whose only
// handle belongs to the oven.
//
// Scope is `KITCHEN_L_BODY_CATALOG`, **both** of its populations (ADR 0011 Gap A): §7's insertable
// entries, built by `buildCatalogBody` at their own nominal size, and M2's seeded instances, built
// by `buildDecomposedBody` at the one size each of them has. One rule, read off both — the seeded
// half is the half the customer actually selects in the shipped kitchen, and gating only the
// insertable half is how three seeded bodies carried `base-hob-oven`'s defect past the gate that
// was written for it.
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
import { buildDecomposedBody } from "../src/decomposed-bodies.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** `finishes.ts`'s own `FRONT_MESH_NAME`, written out rather than imported: a gate that reads its
 *  definition of a front out of the code it is checking proves only that the code equals itself.
 *  Note `door_front` is the generic front name in this kit — `base-panbank` uses it for drawer
 *  fronts too — so an entry with no `drawer_front` mesh is not thereby frontless. */
const FRONT_MESH_NAME = /door_front|drawer_front/;

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

/** Entries whose flags are known **not** to match their geometry, exempted from the rule below and
 *  pinned to the inverse assertion instead — the companion test asserts each of these still
 *  violates it, so a repaired entry cannot quietly outlive its exemption.
 *
 *  Both are the same open niche, built by the same call: the appliance is the front, so the builder
 *  produces no `door_front` and its only handle belongs to the dishwasher — exactly
 *  `base-hob-oven`'s defect, on an entry that pre-dates ADR 0027. `base-dishwasher-600` is the
 *  seeded instance of `base-dishwasher` and runs `kit.builders["base-dishwasher"]()` verbatim
 *  (`decomposed-bodies.ts`), so it is the same gap seen from the other population, not a second
 *  one. The owner scoped this wave to the new entry and decided explicitly to keep both recorded;
 *  the open product question — an integrated dishwasher usually wears a decor door, in which case
 *  the flags are right and the *geometry* is what is missing — is backlog entry 11. */
const RECORDED_CAPABILITY_GAPS: readonly string[] = [
  "base-dishwasher",
  "base-dishwasher-600",
];

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
  readonly cabinetHandles: number;
}

/** How a cabinet's handle is told from an appliance's, and the reason a bare `handle_bar` count
 *  cannot do it: `base-hob-oven` has one and none of it is the cabinet's, while `tall-oven-tower`
 *  has four of which exactly two are the cabinet's — the other two are the oven's and the
 *  microwave's. The test at the foot of this file measures both numbers.
 *
 *  `barHandle` returns a group named `handle`, and every caller adds it to the thing it belongs to.
 *  `doorSlab` adds it beside the `door_front` slab it opens; `builders.oven`, `builders.microwave`,
 *  `dishwasher` and the freestanding fridge add it to the appliance's own group, which holds no
 *  front at all. So a handle is a **cabinet's** handle exactly when the group it hangs from also
 *  holds a front — the front it opens. That is the same pairing `canHandle` promises the customer:
 *  a door they can put a handle on. */
function censusOf(buildId: string, widthMm?: number): CapabilityCensus {
  const definition = definitionOf(buildId);
  const built = buildBodyOf(buildId, definition, widthMm);

  let fronts = 0;
  let cabinetHandles = 0;
  built.traverse((node) => {
    if (isMesh(node) && FRONT_MESH_NAME.test(node.name)) fronts += 1;
    if (!isMesh(node) && node.name === HANDLE_GROUP_NAME && opensAFront(node)) {
      cabinetHandles += 1;
    }
  });

  return {
    canFinish: definition.canFinish,
    canHandle: definition.canHandle,
    fronts,
    cabinetHandles,
  };
}

function definitionOf(buildId: string): BodyDefinition {
  const definition = KITCHEN_L_BODY_CATALOG.get(buildId);
  if (!definition) throw new Error(`No catalogue entry for "${buildId}"`);
  return definition;
}

/** The two populations differ only here: an insertable entry is parameterised and has to be given a
 *  size, a seeded one is one hardcoded call at the one size it has. Everything above and below this
 *  function is shared. */
/** ADR 0033 gave the width a say in what gets drawn — a merged cabinet's door count follows it — so
 *  a caller that cares which form it measures passes one. The default is still the entry's narrowest
 *  declared width, which is what every flag-implication sweep below wants: the *least* a builder
 *  ever draws is the hardest case for "declares a front and draws one". */
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

function opensAFront(handle: THREE.Object3D): boolean {
  const owner = handle.parent;
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

  // The membership assertion the test above cannot make. `GATED = ALL.filter(id => !RECORDED
  // .includes(id))`, so `[...GATED, ...RECORDED]` equals `ALL` for *any* subset of it — that guard
  // closes stale exemptions, not the list's contents. Widening the list has to mean editing a test
  // that names what is being added, out loud.
  it("has exactly two recorded gaps, and both are the one the owner decided to keep", () => {
    expect([...RECORDED_CAPABILITY_GAPS]).toEqual([
      "base-dishwasher",
      "base-dishwasher-600",
    ]);
  });

  // The two population sizes ADR 0027's amendment states, so the prose cannot drift from the map.
  // **Sixteen since ADR 0033**, where there were eighteen: `base-2door` + `base-1door` and
  // `wall-2door` + `wall-1door` are one entry each, and the door count moved out of the id.
  // **Twenty-two seeded since ADR 0038**, where there were twenty-three: `cooktop-600` was kept
  // only so a document saved before ADR 0027 could still resolve its `buildId`, and no such
  // document was ever stored.
  it("gates both populations of the one map, not just the insertable half", () => {
    expect(CATALOG_BUILD_IDS.length).toBe(16);
    expect(SEEDED_BUILD_IDS.length).toBe(22);
    expect(ALL_BUILD_IDS.length).toBe(
      CATALOG_BUILD_IDS.length + SEEDED_BUILD_IDS.length,
    );
    expect(SEEDED_BUILD_IDS).toContain("fridge-free-700");
    expect(new Set(ALL_BUILD_IDS).size).toBe(ALL_BUILD_IDS.length);
  });

  it.each(GATED_BUILD_IDS)(
    "%s: canFinish implies a front, canHandle implies a cabinet handle",
    (buildId) => {
      const census = censusOf(buildId);

      expect([buildId, census.canFinish && census.fronts === 0]).toEqual([
        buildId,
        false,
      ]);
      expect([
        buildId,
        census.canHandle && census.cabinetHandles === 0,
      ]).toEqual([buildId, false]);
    },
  );

  // The exemption list, asserted from the other side: each entry on it really does violate the
  // rule. The day someone repairs one, this goes red and the list shrinks with it.
  it.each(RECORDED_CAPABILITY_GAPS)(
    "%s is a recorded gap: it still declares a capability its geometry does not have",
    (buildId) => {
      const census = censusOf(buildId);

      expect([
        buildId,
        (census.canFinish && census.fronts === 0) ||
          (census.canHandle && census.cabinetHandles === 0),
      ]).toEqual([buildId, true]);
    },
  );

  // The gate's own premise. If the front regex or the handle rule matched nothing anywhere, every
  // implication above would hold vacuously for the entries that declare the flags `false`, and the
  // two that matter would be the only failures — which reads as a catalogue defect rather than as a
  // broken gate. These two entries are the control.
  it("recognises a real front and a real cabinet handle when it sees one", () => {
    // At 800 mm, so the merged entry builds its **two-door** form — the control needs a body with
    // real fronts and real handles on it, and after ADR 0033 which one that is depends on the width.
    expect(censusOf("base-cabinet", 800)).toMatchObject({
      fronts: 2,
      cabinetHandles: 2,
    });
  });

  // And the case a `handle_bar` count would get wrong, measured rather than asserted from memory:
  // the hob base's only handle is the oven's, so it has none of its own, and the tower builds four
  // bars of which two are the cabinet's.
  //
  // Its one front is the hob band's filler panel (Q6, owner 2026-09-01), which is why the two flags
  // now differ: a fixed facade is something to finish and nothing to open, so `canFinish` follows
  // the front and `canHandle` follows the cabinet-handle count, exactly as the gate above reads
  // them. Before wave 5B6 both numbers were zero and both flags were `false`.
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
