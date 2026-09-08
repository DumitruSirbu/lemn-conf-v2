// **The one surface ADR 0099 does not reach: the 3D scene.**
//
// ADR 0099 decision 1 makes `resolvedFinishOf` *"the only authority"* on which colour a cabinet is
// wearing, and says `@lemnaria/three-adapter` *"reads the resolver's answer"*. It does not.
//
// The chain the browser actually runs is `derivePlacementRecords(design, catalog)` →
// `state.records` → `syncSolidBodies` (`apps/web/src/scene/kitchen-stage.tsx:212`), and
// `PlacementRecord.finishKey` is written straight off `placement.body.finish`
// (`packages/configurator-domain/src/void-engine.ts:557`). A cabinet with **no** override therefore
// carries no `finishKey`, `applyRecordedAppearance` skips it
// (`packages/three-adapter/src/scene-sync.ts:189`) and the front stays on the kit's own door
// material — the M1 white — however the whole-kitchen colour is set.
//
// **The result the customer sees**: choosing *Culoarea bucătăriei* in the settings sheet writes
// `settings.finish`, the sheet marks the swatch, the panel marks *follow the kitchen*, the price is
// unchanged and the document round-trips — and the kitchen on screen does not change colour at all,
// unless every cabinet already carries its own override.
//
// **This file does not fix it, deliberately.** Wiring `derivePlacementRecords` to the resolver was
// tried and reverted during the wave, because `carriedAppearance`
// (`packages/configurator-domain/src/commands/insert-body.ts:326`) copies `record.finishKey` into
// `body.finish` on insert and on the resize rebuild — so a resolved `finishKey` would stamp the
// kitchen's colour into every cabinet the customer touches, which is exactly the conversion ADR 0099
// decision 2 forbids. The fix is a second field the record carries for drawing only, and it is a
// wave, not a line.
//
// The first two tests below pass and are the witnesses that this file measures something: the scene
// *does* honour a colour a cabinet chose. The third is the gap and is `.skip`ped rather than deleted
// or weakened (ADR 0090 decision 7) — it names the criterion, so an implementer wiring the resolver
// through has an executable statement to turn green, and nobody can close ADR 0099 believing the
// scene already resolves.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
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

/** PAL's *Antracit*, a decor that is neither the material's declared default nor the kit's own
 *  door colour — so "the scene did not change" and "the scene changed to the right thing" cannot be
 *  the same observation. */
const KITCHEN_COLOUR: Finish = paletteFinish("pal.antracit");
/** What `finishes.ts:90` declares *Antracit* as. Written out rather than imported because the point
 *  of every assertion below is that a **specific** colour did or did not reach a front, and a
 *  constant read from the table under test would agree with whatever that table said. */
const ANTHRACITE_HEX = "#2b2d30";

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

/** The seeded kitchen with every cabinet following: no `body.finish` key anywhere, which is the
 *  state every document written before this wave is in and the state the feature is for. */
function everyCabinetFollowing(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      materialTierId: "material.melamine",
    },
    placements: KITCHEN_L_DESIGN.placements.map((placement) => {
      const body = { ...placement.body };
      delete body.finish;
      return { ...placement, body };
    }),
  };
}

function wearingOnPlacement(
  design: Design,
  id: string,
  finish: Finish,
): Design {
  return {
    ...design,
    placements: design.placements.map((placement: DesignPlacement) =>
      placement.id === id
        ? { ...placement, body: { ...placement.body, finish } }
        : placement,
    ),
  };
}

/** The chain the browser runs, in the order it runs it. Nothing here is a shortcut: the store holds
 *  `derivePlacementRecords`' answer and `kitchen-stage.tsx` hands exactly that to the adapter. */
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

function colourOf(mesh: THREE.Mesh): string {
  const material = mesh.material;
  if (Array.isArray(material) || !("color" in material)) {
    throw new Error(`Mesh "${mesh.name}" has no single coloured material`);
  }
  return `#${(material.color as THREE.Color).getHexString()}`;
}

/** A placement that actually draws fronts, so every assertion below is about a mesh that exists. */
const FINISHABLE_PLACEMENT_ID = "p1";

describe("the scene honours a colour a cabinet chose for itself", () => {
  it("draws the fronts of an overriding cabinet in that colour", () => {
    drawn(
      wearingOnPlacement(
        everyCabinetFollowing(),
        FINISHABLE_PLACEMENT_ID,
        KITCHEN_COLOUR,
      ),
    );

    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    // The premise the gap below is measured against: this colour is not the one the kit draws by
    // default, so "the scene did not change" and "the scene changed correctly" are distinguishable.
    expect(`#${kit.M.door.color.getHexString()}`).not.toBe(ANTHRACITE_HEX);
    for (const front of fronts) expect(colourOf(front)).toBe(ANTHRACITE_HEX);
  });

  it("leaves a cabinet that chose nothing on the kit's own door material", () => {
    drawn(everyCabinetFollowing());

    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) expect(front.material).toBe(kit.M.door);
  });
});

describe("ADR 0099 decision 1 — the scene reads the resolver's answer", () => {
  /**
   * **SKIPPED: known production gap, ADR 0099 decision 1 unsatisfied.**
   *
   * Reported by the wave W3 adversarial QA pass. Production locations:
   * `packages/configurator-domain/src/void-engine.ts:557` (the record is written from
   * `placement.body.finish` and never from `resolvedFinishOf`) and
   * `packages/three-adapter/src/scene-sync.ts:189` (the record with no `finishKey` is skipped).
   *
   * Do not delete this and do not weaken it into a test of the current behaviour: a characterisation
   * test asserting the kit's white here would launder the defect into an invariant (ADR 0090
   * decision 7). Un-skip it when the record carries a colour to draw with.
   */
  it.skip("draws a following cabinet in the whole-kitchen colour", () => {
    const design: Design = {
      ...everyCabinetFollowing(),
      settings: {
        ...everyCabinetFollowing().settings,
        finish: KITCHEN_COLOUR,
      },
    };

    drawn(design);

    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) expect(colourOf(front)).toBe(ANTHRACITE_HEX);
  });
});
