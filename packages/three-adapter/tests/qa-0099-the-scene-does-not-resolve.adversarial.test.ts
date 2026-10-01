// **The surface ADR 0099 did not reach: the 3D scene. Closed, and this file is what holds it.**
//
// ADR 0099 decision 1 makes `resolvedFinishOf` *"the only authority"* on which colour a cabinet is
// wearing, and says `@lemnaria/three-adapter` *"reads the resolver's answer"*. Until Amendment A
// section 3's wave it did not: `PlacementRecord.finishKey` was written straight off
// `placement.body.finish`, a cabinet with **no** override carried none, `applyRecordedAppearance`
// skipped it, and the front stayed on the kit's own door material — the M1 white — however the
// whole-kitchen colour was set.
//
// **What the customer saw**: choosing *Culoarea bucătăriei* in the settings sheet wrote
// `settings.finish`, the sheet marked the swatch, the panel marked *follow the kitchen*, the price
// was unchanged and the document round-tripped — and the kitchen on screen did not change colour at
// all, unless every cabinet already carried its own override.
//
// **The fix, and the shape of it, because the obvious one is forbidden.** Resolving *into*
// `finishKey` was tried and reverted during the original wave: `carriedAppearance`
// (`packages/configurator-domain/src/commands/insert-body.ts`) copies `record.finishKey` into
// `body.finish` on insert and on the resize rebuild, so a resolved `finishKey` would stamp the
// kitchen's colour into every cabinet the customer touched — the exact conversion of *follows the
// kitchen* into *chose this colour* that ADR 0099 decision 2 forbids. So the record carries a
// **second, draw-only** field, `drawnFinish`; `finishKey` still means the cabinet's own choice and
// nothing else, and `insert-body.ts` is untouched. That is the whole safety guarantee, and the
// property that proves it stayed intact lives in the domain
// (`tests/qa-0099-global-colour.adversarial.test.ts`, *"keeps every following cabinet following
// across a shuffled command sequence"*), which asserts **key absence** rather than a value.
//
// **The trap this file exists to hold, and the reason it is not one test but four.** Painting
// `drawnFinish` while still *signing* `finishKey` passes every single-sync assertion below and
// fails in the app: a whole-kitchen colour change alters no cabinet's own data, so every body
// signature is identical, `syncSolidBodies` concludes nothing moved, and the scene stays white in
// exactly the case the owner cares about. `repaints a following kitchen when the whole-kitchen
// colour changes` is written against two syncs on one `solidsRoot` for that reason, and its
// negative twin holds the other side: a body whose drawn colour did *not* move keeps its instance,
// so the fix cannot be "re-mount everything".
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
/** A second whole-kitchen colour, so *"the kitchen colour changed"* can be observed without the
 *  design passing through the no-colour state that would repaint the scene for a different
 *  reason. */
const SECOND_KITCHEN_COLOUR: Finish = paletteFinish("pal.gri-havanna");
const HAVANNA_HEX = "#9a938a";
/** A third, so the negative twin below can move the kitchen's colour between two values that are
 *  both different from the cabinet's own choice. */
const THIRD_KITCHEN_COLOUR: Finish = paletteFinish("pal.alb");
/** What `materials.ts` declares melamine's `defaultFinish` as — *Alb* — written out for the reason
 *  `ANTHRACITE_HEX` is. It is also, by M1's own choice, the exact hex `kit.M.door` carries, which
 *  is why *"a following cabinet on a kitchen with no colour set"* looks identical to the scene
 *  this package drew before ADR 0099 while now being painted rather than skipped. */
const MELAMINE_DEFAULT_HEX = "#eceeeb";
/** What `materials.ts` declares veneer's `defaultFinish` as — *Stejar* — and what `finishes.ts`
 *  tints `M.oak`'s grain with for it. Unlike melamine's, this one is nothing like the kit's own
 *  door colour, which is why the third-level criterion is asserted on veneer as well: on melamine
 *  alone, a renderer that skipped a following cabinet would pass by coincidence. */
const VENEER_DEFAULT_HEX = "#cba173";

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
  return everyCabinetFollowingOn("material.melamine");
}

function everyCabinetFollowingOn(materialTierId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
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

/** The whole-kitchen colour, set the only way `setGlobalFinish` can set it: one field on
 *  `settings`, with every placement passed through untouched (ADR 0099 decision 2). */
function wearingKitchenColour(design: Design, finish: Finish): Design {
  return { ...design, settings: { ...design.settings, finish } };
}

/** The chain the browser runs, in the order it runs it. Nothing here is a shortcut: the store holds
 *  `derivePlacementRecords`' answer and `kitchen-stage.tsx` hands exactly that to the adapter. */
function drawn(design: Design): void {
  syncSolidBodies({
    kit,
    solidsRoot,
    records: derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
    room: design.room,
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

  /** **ADR 0099 decision 1's third level, and the criterion that replaced an identity assertion.**
   *
   *  Until Amendment A section 3's wave this asserted `front.material === kit.M.door`: a record
   *  with no `finishKey` was skipped, so the front kept the instance its builder gave it. That is
   *  no longer true and must not be — the resolver's third level is *the material's declared
   *  default*, and on a veneer or MDF kitchen with no colour chosen anywhere the old behaviour drew
   *  white rather than the material the customer is buying.
   *
   *  The claim that survives is the one a customer can see, and it survives **at the same value**:
   *  melamine's declared default is *Alb*, and M1 chose `kit.M.door`'s hex to be exactly that. So
   *  an unfinished melamine kitchen renders the pixels it always did. Both halves are asserted, so
   *  a future edit that changed either the declared default or the kit's door colour would land
   *  here rather than silently making the pair meaningless. */
  it("draws a cabinet that chose nothing in the material's declared default", () => {
    drawn(everyCabinetFollowing());

    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) {
      expect(colourOf(front)).toBe(MELAMINE_DEFAULT_HEX);
    }
    expect(`#${kit.M.door.color.getHexString()}`).toBe(MELAMINE_DEFAULT_HEX);
  });

  /** **The same criterion on the material where it is visible, and the reason the melamine case
   *  above cannot carry it alone.** Melamine's declared default and `kit.M.door` are the same hex,
   *  so a renderer that skipped a following cabinet entirely would satisfy the test above by
   *  accident. Veneer's declared default is *Stejar*, a tinted wood — nowhere near white — so this
   *  is the one that goes red when the resolver stops being asked. It is also the state a real
   *  customer reaches: a veneer kitchen where nobody has picked a colour used to render in the
   *  kit's white rather than in the timber they are buying. */
  it("draws a following cabinet on a veneer kitchen in the veneer's own default", () => {
    drawn(everyCabinetFollowingOn("material.veneer"));

    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    expect(`#${kit.M.door.color.getHexString()}`).not.toBe(VENEER_DEFAULT_HEX);
    for (const front of fronts) {
      expect(colourOf(front)).toBe(VENEER_DEFAULT_HEX);
    }
  });
});

describe("ADR 0099 decision 1 — the scene reads the resolver's answer", () => {
  /**
   * **The wave's own gate.** This was `.skip`ped from the day the gap was measured until
   * ADR 0099 Amendment A section 3's wave closed it, and it is the statement that closes it: a
   * cabinet that chose nothing renders the whole-kitchen colour.
   */
  it("draws a following cabinet in the whole-kitchen colour", () => {
    drawn(wearingKitchenColour(everyCabinetFollowing(), KITCHEN_COLOUR));

    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) expect(colourOf(front)).toBe(ANTHRACITE_HEX);
  });

  /** **The cabinet's own choice still wins over the kitchen's**, which is the owner's precedence
   *  and the half a fix that resolved too eagerly would break. Asserted on the same design as the
   *  test above, so the two differ only in whether the cabinet chose. */
  it("draws an overriding cabinet in its own colour, not the kitchen's", () => {
    drawn(
      wearingOnPlacement(
        wearingKitchenColour(everyCabinetFollowing(), SECOND_KITCHEN_COLOUR),
        FINISHABLE_PLACEMENT_ID,
        KITCHEN_COLOUR,
      ),
    );

    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) {
      expect(colourOf(front)).toBe(ANTHRACITE_HEX);
      expect(colourOf(front)).not.toBe(HAVANNA_HEX);
    }
  });
});

// **The repaint, and it is a separate `describe` because it needs two syncs on one `solidsRoot`.**
//
// Every assertion above mounts into a fresh scene, and *every one of them passes with `signBody`
// still signing `finishKey`* — the paint is applied at mount, and a first mount always happens.
// What decides whether the customer sees the change is `syncSolidBodies`' difference: a mounted
// body whose signature still matches its record is kept, materials and all. A whole-kitchen colour
// change writes to `settings.finish` and to no cabinet (ADR 0099 decision 2), so under a
// `finishKey` signature nothing re-signs, nothing is re-mounted, and the scene keeps the old
// colour. That is the failure the whole wave exists to prevent and it is invisible to a
// single-sync test.
describe("ADR 0099 decision 5 row 1 — the scene repaints when the kitchen's colour changes", () => {
  it("repaints a following cabinet's fronts on the second sync", () => {
    const following = everyCabinetFollowing();
    drawn(wearingKitchenColour(following, SECOND_KITCHEN_COLOUR));
    const beforeInstance = mounted(FINISHABLE_PLACEMENT_ID);
    for (const front of frontsOf(beforeInstance)) {
      expect(colourOf(front)).toBe(HAVANNA_HEX);
    }

    drawn(wearingKitchenColour(following, KITCHEN_COLOUR));

    // The mechanism: the body re-signed, so the sync tore the old instance down and rebuilt it.
    expect(mounted(FINISHABLE_PLACEMENT_ID)).not.toBe(beforeInstance);
    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) expect(colourOf(front)).toBe(ANTHRACITE_HEX);
  });

  it("repaints a following cabinet the first time a colour is set at all", () => {
    const following = everyCabinetFollowing();
    drawn(following);
    const beforeInstance = mounted(FINISHABLE_PLACEMENT_ID);

    drawn(wearingKitchenColour(following, KITCHEN_COLOUR));

    expect(mounted(FINISHABLE_PLACEMENT_ID)).not.toBe(beforeInstance);
    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) expect(colourOf(front)).toBe(ANTHRACITE_HEX);
  });

  /** **The negative twin, so the repaint cannot be bought by re-mounting everything.** A cabinet
   *  that chose its own colour resolves to the same finish before and after the kitchen's colour
   *  moves, so its signature is unchanged and `syncSolidBodies` must keep the identical instance —
   *  which is also ADR 0099 decision 5 row 2 as the scene shows it. */
  it("keeps an overriding cabinet's identical instance across the same change", () => {
    const chosen = wearingOnPlacement(
      everyCabinetFollowing(),
      FINISHABLE_PLACEMENT_ID,
      KITCHEN_COLOUR,
    );
    drawn(wearingKitchenColour(chosen, SECOND_KITCHEN_COLOUR));
    const beforeInstance = mounted(FINISHABLE_PLACEMENT_ID);

    drawn(wearingKitchenColour(chosen, THIRD_KITCHEN_COLOUR));

    expect(mounted(FINISHABLE_PLACEMENT_ID)).toBe(beforeInstance);
    for (const front of frontsOf(mounted(FINISHABLE_PLACEMENT_ID))) {
      expect(colourOf(front)).toBe(ANTHRACITE_HEX);
    }
  });
});
