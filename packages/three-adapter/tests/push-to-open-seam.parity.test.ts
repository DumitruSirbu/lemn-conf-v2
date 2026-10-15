// **The gate wave 6T-a exists for: the scene and the price answer *"does this front carry a handle
// bar"* with the same call.**
//
// Two predicates shipped and disagreed in both directions (ADR 0092 decision 3, Amendment C). The
// scene hid a top-row body's bars by `isPushOpenByDefault(record.frame.y0)`; pricing counted a latch
// only where the placement **recorded** `handle: "push"`. So the demo's nine top-row placements had
// their bars hidden and their 16 latches billed at nothing, and a migrated document recording `push`
// on a `canHandle: false` body was billed latches for bars the scene kept drawing.
//
// **A domain-only test cannot catch the two drifting apart again**, which is the whole reason this
// file is in the adapter and reads the built scene rather than the predicate. It asks the *meshes*
// whether a bar is on the front, and the domain whether a latch is billed for it, and requires that
// the two agree body by body over the shipped demo — ADR 0028's remedy for two numbers agreeing by
// luck, applied to a boolean.
import {
  countHardwareMechanisms,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { forEachCabinetHandleMesh } from "../src/cabinet-handle-meshes.js";
import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

/** §6.5's module line, **restated rather than imported**, for the reason every parity gate in this
 *  package restates the thing it checks: a gate that reads its own threshold out of the code under
 *  test proves only that the code equals itself. */
const TOP_ROW_Y0_M = 2.2;

/** The nine top-row placements of the shipped demo, and the sixteen leaves they carry between them
 *  (`kitchen-l-design.ts:836-844`). Direction A, named. */
const TOP_ROW_PLACEMENT_IDS = [
  "p15",
  "p16",
  "p17",
  "p18",
  "p19",
  "p20",
  "p21",
  "p22",
  "p23",
] as const;

/** `wall-corner-return-570`, seeded at `y0` 1500 on wall B. It declares `canHandle: false` beside
 *  `carriesHandles(1)` and one door leaf, so its bar is built and visible — and its `-top` twin
 *  `p21` declares the identical pair and differs only by the row it stands on. Direction B's
 *  witness. */
const VISIBLE_BAR_PLACEMENT_ID = "p9";

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

function mount(design: Design): readonly PlacementRecord[] {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  syncSolidBodies({ kit, solidsRoot, records, room: design.room });
  return records;
}

function mountedBodyOf(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`No body mounted for placement "${placementId}"`);
  return body;
}

interface BuiltBars {
  readonly built: number;
  readonly visible: number;
}

/** This body's **own** handle meshes, built and visible. An appliance's bar is not among them
 *  (ADR 0061 decision 1), which is why the shared rule is called rather than a name matched. */
function cabinetBarsOf(placementId: string): BuiltBars {
  let built = 0;
  let visible = 0;
  forEachCabinetHandleMesh(mountedBodyOf(placementId), (part) => {
    built += 1;
    if (part.visible) visible += 1;
  });
  return { built, visible };
}

/** **What the scene says**: this body's bars are on it, or the scene has taken them off it. Asked
 *  only of bodies that build one — a hood has no bar to hide, so the question does not arise, and
 *  the census below states which bodies those are rather than skipping them silently. */
function sceneHidesBarsOn(placementId: string): boolean {
  const bars = cabinetBarsOf(placementId);
  if (bars.built === 0) {
    throw new Error(`"${placementId}" builds no cabinet handle to hide`);
  }
  return bars.visible === 0;
}

/** **What the price says**: this body is billed at least one latch. */
function latchesOn(design: Design, placementId: string): number {
  const entry = projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG)
    .flatMap((group) => group.entries)
    .find((candidate) => candidate.placementId === placementId);
  if (!entry) throw new Error(`the projection holds no "${placementId}"`);
  return countHardwareMechanisms([entry], KITCHEN_L_BODY_CATALOG).pushToOpen;
}

function withRecordedHandle(placementId: string, handle: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === placementId
        ? { ...placement, body: { ...placement.body, handle } }
        : placement,
    ),
  } as Design;
}

/** The bodies whose bars the question can be asked of at all. Derived from the built scene rather
 *  than listed, so a catalogue row that starts building a bar joins the gate the day it lands. */
function placementsWithABar(records: readonly PlacementRecord[]): string[] {
  return records
    .map((record) => record.id)
    .filter((placementId) => cabinetBarsOf(placementId).built > 0);
}

describe("the scene and the price agree, body by body, on the shipped demo", () => {
  it("hides a body's bars exactly where a latch is billed for it", () => {
    const records = mount(KITCHEN_L_DESIGN);
    const gated = placementsWithABar(records);

    const disagreeing = gated.filter(
      (placementId) =>
        sceneHidesBarsOn(placementId) !==
        latchesOn(KITCHEN_L_DESIGN, placementId) > 0,
    );

    expect(disagreeing).toEqual([]);
  });

  /** Not a vacuous sweep in either direction: the demo holds bodies whose bars are hidden and
   *  bodies whose bars are on, so an implementation answering one constant would fail. */
  it("has bodies on both sides of the question", () => {
    const records = mount(KITCHEN_L_DESIGN);
    const gated = placementsWithABar(records);
    const hidden = gated.filter((placementId) => sceneHidesBarsOn(placementId));

    expect(hidden.length).toBe(TOP_ROW_PLACEMENT_IDS.length);
    expect(gated.length).toBeGreaterThan(hidden.length);
  });

  /** The bodies the question cannot be asked of build no cabinet handle **and** open nothing, so
   *  they contribute no latch however they are stamped — the coincidence ADR 0092 decision 3
   *  measured in the catalogue, restated on the built scene. */
  it("bills no latch for a body that builds no bar", () => {
    const records = mount(KITCHEN_L_DESIGN);

    for (const record of records) {
      if (cabinetBarsOf(record.id).built > 0) continue;
      expect(latchesOn(KITCHEN_L_DESIGN, record.id)).toBe(0);
    }
  });
});

describe("direction A — a hidden bar is no longer billed at nothing", () => {
  it("hides the bars of all nine top-row placements", () => {
    mount(KITCHEN_L_DESIGN);

    for (const placementId of TOP_ROW_PLACEMENT_IDS) {
      expect(cabinetBarsOf(placementId).built).toBeGreaterThan(0);
      expect(sceneHidesBarsOn(placementId)).toBe(true);
    }
  });

  it("bills sixteen latches for the same nine bodies, and none anywhere else", () => {
    const latched = TOP_ROW_PLACEMENT_IDS.reduce(
      (total, placementId) => total + latchesOn(KITCHEN_L_DESIGN, placementId),
      0,
    );

    expect(latched).toBe(16);
    expect(
      countHardwareMechanisms(
        projectDesignForDisplay(
          KITCHEN_L_DESIGN,
          KITCHEN_L_BODY_CATALOG,
        ).flatMap((group) => group.entries),
        KITCHEN_L_BODY_CATALOG,
      ).pushToOpen,
    ).toBe(latched);
  });

  it("records no handle on any of them, which is what made the old count answer zero", () => {
    for (const placement of KITCHEN_L_DESIGN.placements) {
      expect(placement.body).not.toHaveProperty("handle");
    }
  });
});

describe("direction B — a visible bar is no longer billed a latch", () => {
  const RECORDED_PUSH = withRecordedHandle(VISIBLE_BAR_PLACEMENT_ID, "push");

  it("keeps the bars on a body whose definition permits no mode", () => {
    mount(RECORDED_PUSH);

    expect(sceneHidesBarsOn(VISIBLE_BAR_PLACEMENT_ID)).toBe(false);
  });

  it("bills it no latch, because the customer grips it by its bar", () => {
    expect(latchesOn(RECORDED_PUSH, VISIBLE_BAR_PLACEMENT_ID)).toBe(0);
  });

  /** Its `-top` twin, one band up, with the same declarations and no recorded mode at all: the bar
   *  is hidden by the slot, the customer cannot turn it back on, and it is billed. The pair is the
   *  whole of ADR 0092's `canHandle` ruling, measured on the scene. */
  it("hides and bills the same body's twin in the top row", () => {
    mount(KITCHEN_L_DESIGN);

    expect(sceneHidesBarsOn("p21")).toBe(true);
    expect(latchesOn(KITCHEN_L_DESIGN, "p21")).toBe(1);
  });
});

/** The scene's answer over every seeded record in all four handle states is held to the ruling by
 *  `qa-6t-a-scene-price-seam.adversarial.test.ts`; what stays here is the premise the slot arm rests on. */
describe("the seeded top row stands where the slot rule turns on", () => {
  it("puts the seeded top row at or above the module line the rule turns on", () => {
    const records = mount(KITCHEN_L_DESIGN);

    for (const placementId of TOP_ROW_PLACEMENT_IDS) {
      const record = records.find((candidate) => candidate.id === placementId);
      expect(record?.frame.y0).toBeGreaterThanOrEqual(TOP_ROW_Y0_M);
    }
  });
});
