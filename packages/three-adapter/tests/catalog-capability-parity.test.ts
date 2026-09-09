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
import { isCabinetHandleGroup } from "../src/cabinet-handle-meshes.js";
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

/** `body-finish-surfaces.ts`'s `WEARS_THE_BODYS_FINISH_KEY`, written out for the same reason the
 *  regex above is: this gate must not read its definition of *paintable* out of the module it is
 *  gating. A body's colour reaches its fronts **plus** every mesh carrying this key, which since
 *  2026-09-09 is the only way the open shelf and the four corner bodies are painted at all. */
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

/** Entries whose flags are known **not** to match their geometry, exempted from the rule below and
 *  pinned to the inverse assertion instead — the companion test asserts each of these still
 *  violates it, so a repaired entry cannot quietly outlive its exemption.
 *
 *  **Empty since 2026-09-01, and it was `base-dishwasher` and `base-dishwasher-600` that emptied
 *  it.** They were the one open niche, seen from each population, and the open product question
 *  behind them — an integrated dishwasher usually wears a decor door, in which case the flags are
 *  right and the *geometry* is what is missing — was decided that way by the owner and recorded as
 *  [ADR 0051](../../../docs/decisions/0051-the-dishwasher-niche-wears-a-decor-door.md), closing
 *  `docs/BACKLOG.md` entry 11. `dishwasherHousing` now builds its own `door_front` and the
 *  appliance behind it carries no bar, so both flags became true of the geometry and both ids are
 *  gated below like every other. Their numbers are pinned by the census control at the foot of
 *  this file, which is where a regression would show. */
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
  /** Fronts **plus** declared surfaces — what `collectPaintedSurfaces` reaches, and so the number
   *  `canFinish` is actually held against. It was `fronts` alone until the open shelf and the corner
   *  bodies gained declarations; on a body that declares none it is still `fronts`. */
  readonly paintedSurfaces: number;
  readonly cabinetHandles: number;
}

/** How a cabinet's handle is told from an appliance's, and the reason a bare `handle_bar` count
 *  cannot do it: `base-hob-oven` has one and none of it is the cabinet's, while `tall-oven-tower`
 *  has four of which exactly two are the cabinet's — the other two are the oven's and the
 *  microwave's. The test at the foot of this file measures both numbers.
 *
 *  **Since wave 6L the rule is `isCabinetHandleGroup`, imported rather than restated here**
 *  (ADR 0061 decision 1). It used to be a private copy, which was the right call while the gate was
 *  its only reader; now the path that *applies* a handle choice reads the same function, and one
 *  rule with two callers is what makes "the gate and the renderer agree" a fact instead of a
 *  coincidence. What that costs is stated and paid below: a gate reading its rule out of the code it
 *  checks proves only that the code equals itself, so `agrees with the rule this gate would write
 *  itself` re-derives the rule from `FRONT_MESH_NAME` above and holds the imported one to it over
 *  the whole catalogue. */
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

/** This gate's own reading of ADR 0061's rule, written from `FRONT_MESH_NAME` above and used
 *  nowhere but the independence assertion: a handle group whose parent also holds a front. */
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

  // The membership assertion the test above cannot make. `GATED = ALL.filter(id => !RECORDED
  // .includes(id))`, so `[...GATED, ...RECORDED]` equals `ALL` for *any* subset of it — that guard
  // closes stale exemptions, not the list's contents. Widening the list has to mean editing a test
  // that names what is being added, out loud.
  it("has no recorded gaps: every entry in both populations is gated", () => {
    expect([...RECORDED_CAPABILITY_GAPS]).toEqual([]);
    expect(GATED_BUILD_IDS).toEqual(ALL_BUILD_IDS);
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

  /** **`canFinish` implies a *painted surface*, not a front.** It was a front until 2026-09-09, and
   *  that reading is what let `base-corner-return-320` — a carcass and a worktop, no door anywhere —
   *  be the one body this gate would have refused a colour to. `applyBodyFinish` paints
   *  `collectPaintedSurfaces`, so this is the number the flag has to be held against or the gate
   *  checks a rule the renderer stopped following. */
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

  // The exemption list, asserted from the other side: each entry on it really does violate the
  // rule. The day someone repairs one, this goes red and the list shrinks with it.
  //
  // One test that loops rather than `it.each`, which generates no test at all over an empty list —
  // and the list is empty since ADR 0051. The assertion has to survive the list being empty, or the
  // next entry added to it would arrive with no inverse pin at all.
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

  // The gate's own premise. If the front regex or the handle rule matched nothing anywhere, every
  // implication above would hold vacuously for the entries that declare the flags `false`, and the
  // two that matter would be the only failures — which reads as a catalogue defect rather than as a
  // broken gate. These two entries are the control.
  it("recognises a real front and a real cabinet handle when it sees one", () => {
    // At 800 mm, so the merged entry builds its **two-door** form — the control needs a body with
    // real fronts and real handles on it, and after ADR 0033 which one that is depends on the width.
    expect(censusOf("base-cabinet", 800)).toMatchObject({
      fronts: 2,
      paintedSurfaces: 2,
      cabinetHandles: 2,
    });
  });

  /** The second half of that premise, and the one the widened rule turns on: **a painted surface
   *  that is not a front is counted.** Without this the two numbers could be the same field twice
   *  and the sweep above would still pass everywhere. `base-corner-return-320` is the sharpest case
   *  in the catalogue — no door, no drawer, one declared carcass — and `open-shelf-600` is the case
   *  the mechanism was built for. */
  it("counts a declared painted surface that no front regex can name", () => {
    expect(censusOf("base-corner-return-320")).toMatchObject({
      canFinish: true,
      fronts: 0,
      paintedSurfaces: 1,
    });
    expect(censusOf("open-shelf-600")).toMatchObject({
      fronts: 0,
      paintedSurfaces: 6,
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
  // ADR 0051, both populations of the repaired entry. The niche is an ordinary fronted base body
  // now: one `door_front`, one cabinet handle, and **one** `handle_bar` in the whole group — the
  // door's. A second bar here would mean the appliance was built exposed again, which is the
  // regression that would silently put an appliance's handle under a cabinet-hardware chip.
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

  // **The price of importing the rule instead of restating it.** Every node of every body in both
  // populations, judged twice: once by `isCabinetHandleGroup` and once by this file's own reading of
  // it. A widening of the shared rule that made some body pass its declared count would part the two
  // here, which is the failure the old private copy was guarding against.
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
