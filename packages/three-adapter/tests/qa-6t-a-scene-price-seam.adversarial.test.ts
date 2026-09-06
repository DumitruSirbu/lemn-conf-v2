// **Adversarial QA for wave 6T-a's cross-package claims, measured against a third source.**
//
// `push-to-open-seam.parity.test.ts` checks two things this file re-checks differently, because in
// each case its oracle is the wave's own material:
//
// - *"nothing visual changed"* is asserted against `hidesHandlesAsItWas` — a copy of the
//   implementation the wave deleted. That is a real gate (its left side is the built meshes, so it
//   does go red when the predicate moves), but the only statement it can ever make is *"the new rule
//   equals the old one"*. Here the oracle is **ADR 0092 Amendment C's wording applied to the design
//   document** — the placement's floor, the placement's recorded mode, the catalogue row's
//   permission — which is a third derivation and would catch a fault the two implementations share.
// - the boundary. The parity file asserts the seeded top row stands at or above 2.2 m and stops
//   there; **nothing drives the adapter across the module line**, so an adapter-side conversion that
//   moved the flip by a millimetre would be invisible on this side of the seam. Here the scene is
//   built at 2 199 and at 2 200 and asked which way it went, and the price is asked the same
//   question about the same body.
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

/** §6.5's module line, **in the document's own millimetres and written as a literal**, for the
 *  reason every parity gate in this package restates what it checks. */
const TOP_ROW_FLOOR_MM = 2_200;

/** §5.5's three modes and the absence of one — four states, because a placement that records
 *  nothing is a case and not a default. */
const EVERY_HANDLE_STATE = [undefined, "push", "steel", "black"] as const;

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
  syncSolidBodies({ kit, solidsRoot, records });
  return records;
}

function mountedBodyOf(placementId: string): THREE.Object3D {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`no body mounted for placement "${placementId}"`);
  return body;
}

interface BuiltBars {
  readonly built: number;
  readonly visible: number;
}

function cabinetBarsOf(placementId: string): BuiltBars {
  let built = 0;
  let visible = 0;
  forEachCabinetHandleMesh(mountedBodyOf(placementId), (part) => {
    built += 1;
    if (part.visible) visible += 1;
  });
  return { built, visible };
}

/** **What the scene did**, asked of the meshes and not of any rule. Throws for a body with no bar,
 *  so a row that quietly stopped building one cannot pass as agreement. */
function sceneHidesBarsOn(placementId: string): boolean {
  const bars = cabinetBarsOf(placementId);
  if (bars.built === 0) {
    throw new Error(`"${placementId}" builds no cabinet handle to hide`);
  }
  return bars.visible === 0;
}

/** **What the ruling says**, read off the design document and the catalogue row rather than off
 *  either implementation of it (ADR 0092 decision 3, Amendment C): a recorded mode decides where the
 *  row permits one, and otherwise the slot decides by §6.5's module line. */
function theRulingHidesBarsOn(design: Design, placementId: string): boolean {
  const placement = design.placements.find(
    (candidate) => candidate.id === placementId,
  );
  if (!placement) throw new Error(`the design holds no "${placementId}"`);
  const definition = KITCHEN_L_BODY_CATALOG.get(placement.body.buildId);
  if (!definition) {
    throw new Error(`the catalogue holds no "${placement.body.buildId}"`);
  }

  if (placement.body.handle !== undefined && definition.canHandle) {
    return placement.body.handle === "push";
  }
  return placement.y0Mm >= TOP_ROW_FLOOR_MM;
}

function latchesOn(design: Design, placementId: string): number {
  const entry = projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG)
    .flatMap((group) => group.entries)
    .find((candidate) => candidate.placementId === placementId);
  if (!entry) throw new Error(`the projection holds no "${placementId}"`);
  return countHardwareMechanisms([entry], KITCHEN_L_BODY_CATALOG).pushToOpen;
}

function withHandleEverywhere(handle: string | undefined): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) => ({
      ...placement,
      body:
        handle === undefined
          ? { ...placement.body }
          : { ...placement.body, handle },
    })),
  } as Design;
}

function placementsWithABar(records: readonly PlacementRecord[]): string[] {
  return records
    .map((record) => record.id)
    .filter((placementId) => cabinetBarsOf(placementId).built > 0);
}

describe("the built scene matches the ruling read off the document, not the deleted rule", () => {
  it.each(EVERY_HANDLE_STATE)(
    "hides exactly the bars the ruling hides, with every placement recording %s",
    (handle) => {
      const design = withHandleEverywhere(handle);
      const records = mount(design);
      const gated = placementsWithABar(records);

      const disagreeing = gated.filter(
        (placementId) =>
          sceneHidesBarsOn(placementId) !==
          theRulingHidesBarsOn(design, placementId),
      );

      expect(disagreeing).toEqual([]);
      expect(gated.length).toBeGreaterThan(0);
    },
  );

  /** The sweep above is only worth running if the ruling answers both ways inside each state, which
   *  is what stops a constant implementation passing it. */
  it.each(EVERY_HANDLE_STATE)(
    "has bodies on both sides of the ruling at handle %s",
    (handle) => {
      const design = withHandleEverywhere(handle);
      const records = mount(design);
      const gated = placementsWithABar(records);
      const hidden = gated.filter((placementId) =>
        theRulingHidesBarsOn(design, placementId),
      );

      expect(hidden.length).toBeGreaterThan(0);
      expect(hidden.length).toBeLessThan(gated.length);
    },
  );
});

// ---------------------------------------------------------------------------
// The module line, driven through the adapter.
// ---------------------------------------------------------------------------

/** One `wall-2door-600-top` on wall A at a floor of the caller's choosing — the shipped top-row row,
 *  moved rather than reproduced, so what varies between the cases below is the floor and nothing
 *  else. */
function oneTopRowBodyAt(y0Mm: number, handle?: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: [
      {
        id: "solo",
        wall: "A" as const,
        alongMm: 300,
        y0Mm,
        body: {
          buildId: "wall-2door-600-top",
          widthMm: 600,
          heightMm: 400,
          ...(handle === undefined ? {} : { handle }),
        },
      },
    ],
  } as Design;
}

/**
 * **The conversion the adapter performs, measured on the built scene.**
 *
 * `scene-sync.ts` reaches the domain predicate through `toMillimetres(record.frame.y0)`, and a
 * record's `frame.y0` is `toMetres(placement.y0Mm)` — a round trip out of the document's
 * millimetres and back. The domain's own sweep (`push-to-open.test.ts`) never crosses it, and the
 * wave's parity file asserts only that the seeded top row stands at or above the line. So the flip
 * is located here, on the meshes.
 */
describe("the scene's flip sits between 2199 and 2200, on the same body", () => {
  it("keeps the bars on at 2199 and takes them off at 2200", () => {
    mount(oneTopRowBodyAt(TOP_ROW_FLOOR_MM - 1));
    expect(cabinetBarsOf("solo").built).toBeGreaterThan(0);
    expect(sceneHidesBarsOn("solo")).toBe(false);

    solidsRoot = new THREE.Group();
    mount(oneTopRowBodyAt(TOP_ROW_FLOOR_MM));
    expect(sceneHidesBarsOn("solo")).toBe(true);
  });

  it("sweeps 2195…2205 and flips exactly once, at the module line", () => {
    const flips: number[] = [];
    let previous = false;
    for (let y0Mm = 2_195; y0Mm <= 2_205; y0Mm += 1) {
      solidsRoot = new THREE.Group();
      mount(oneTopRowBodyAt(y0Mm));
      const hidden = sceneHidesBarsOn("solo");
      if (hidden !== previous) flips.push(y0Mm);
      previous = hidden;
    }

    expect(flips).toEqual([TOP_ROW_FLOOR_MM]);
  });

  /** The seam itself at its own boundary: the two packages must step together across the line, which
   *  is the statement 6T-a exists to make and the place a unit conversion would break it. */
  it.each([
    [TOP_ROW_FLOOR_MM - 1, false, 0],
    [TOP_ROW_FLOOR_MM, true, 2],
  ])("agrees at %s — bars hidden %s, latches %s", (y0Mm, hidden, latches) => {
    const design = oneTopRowBodyAt(y0Mm);
    mount(design);

    expect(sceneHidesBarsOn("solo")).toBe(hidden);
    expect(latchesOn(design, "solo")).toBe(latches);
  });
});

/**
 * **Direction B on the same catalogue row rather than on its twin** (ADR 0092 Amendment C).
 *
 * The wave demonstrates *"`canHandle` disqualifies the recorded mode and nothing more"* with
 * `wall-corner-return-570` at 1 500 against `wall-corner-return-570-top` at 2 200 — two rows. The
 * ruling is about the **floor**, so it is measured here on one row moved across the line, with the
 * mode recorded throughout.
 */
describe("a recorded push on a row that permits no mode follows the slot, on the scene", () => {
  function oneCornerReturnAt(y0Mm: number, handle: string): Design {
    return {
      ...KITCHEN_L_DESIGN,
      placements: [
        {
          id: "solo",
          wall: "B" as const,
          alongMm: 615,
          y0Mm,
          body: {
            buildId: "wall-corner-return-570",
            widthMm: 570,
            heightMm: 700,
            handle,
          },
        },
      ],
    } as Design;
  }

  it("keeps its bar and takes no latch below the line, though it records push", () => {
    const design = oneCornerReturnAt(1_500, "push");
    mount(design);

    expect(sceneHidesBarsOn("solo")).toBe(false);
    expect(latchesOn(design, "solo")).toBe(0);
  });

  it.each(["push", "steel", "black"])(
    "hides its bar and takes one latch at the line, recording %s",
    (handle) => {
      const design = oneCornerReturnAt(TOP_ROW_FLOOR_MM, handle);
      mount(design);

      expect(sceneHidesBarsOn("solo")).toBe(true);
      expect(latchesOn(design, "solo")).toBe(1);
    },
  );
});
