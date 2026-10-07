// ADR 0099 decision 1: `resolvedFinishOf` is the only authority on the colour a cabinet wears, and the
// adapter reads its answer. `PlacementRecord.drawnFinish` is a draw-only field: resolving into `finishKey`
// would stamp the kitchen's colour into every cabinet the customer touches, because `carriedAppearance`
// (`packages/configurator-domain/src/commands/insert-body.ts`) copies `record.finishKey` into `body.finish`
// on insert and resize, turning *follows the kitchen* into *chose this colour* (decision 2).
// Trap: painting `drawnFinish` while still signing `finishKey` passes every single-sync assertion here and
// fails in the app. A whole-kitchen change alters no cabinet's own data, so every body signature is identical
// and `syncSolidBodies` concludes nothing moved; hence the two-sync repaint tests and their negative twin.
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

/** PAL's *Antracit*: neither the material's declared default nor the kit's door colour, so "the scene did
 *  not change" and "it changed to the right thing" are different observations. */
const KITCHEN_COLOUR: Finish = paletteFinish("pal.antracit");
/** What `finishes.ts` declares *Antracit* as. Written out, not imported: a constant read from the table
 *  under test would agree with whatever that table said. */
const ANTHRACITE_HEX = "#2b2d30";
/** A second whole-kitchen colour, so a change can be observed without passing through the no-colour
 *  state, which would repaint the scene for another reason. */
const SECOND_KITCHEN_COLOUR: Finish = paletteFinish("pal.gri-havanna");
const HAVANNA_HEX = "#9a938a";
/** A third, so the negative twin can move the kitchen's colour between two values both different from the
 *  cabinet's own choice. */
const THIRD_KITCHEN_COLOUR: Finish = paletteFinish("pal.alb");
/** What `materials.ts` declares melamine's `defaultFinish` (*Alb*) as, written out like `ANTHRACITE_HEX`. It
 *  is also the exact hex `kit.M.door` carries, so an unfinished following cabinet looks as it did before
 *  it was painted rather than skipped. */
const MELAMINE_DEFAULT_HEX = "#eceeeb";
/** What `materials.ts` declares veneer's `defaultFinish` (*Stejar*) as, the tint `finishes.ts` puts on
 *  `M.oak`'s grain. Unlike melamine's it is nowhere near the kit's door colour, so on veneer a renderer
 *  that skipped a following cabinet cannot pass by coincidence. */
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

/** The seeded kitchen with every cabinet following: no `body.finish` key anywhere. */
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

/** The whole-kitchen colour, set the only way `setGlobalFinish` can: one field on `settings`, every
 *  placement untouched (ADR 0099 decision 2). */
function wearingKitchenColour(design: Design, finish: Finish): Design {
  return { ...design, settings: { ...design.settings, finish } };
}

/** The chain the browser runs: the store holds `derivePlacementRecords`' answer and `kitchen-stage.tsx`
 *  hands exactly that to the adapter. */
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
    // The kit's default door colour is not this colour, so "unchanged" and "changed correctly" differ.
    expect(`#${kit.M.door.color.getHexString()}`).not.toBe(ANTHRACITE_HEX);
    for (const front of fronts) expect(colourOf(front)).toBe(ANTHRACITE_HEX);
  });

  /** ADR 0099 decision 1's third level: a cabinet with no `finishKey` is drawn in the material's declared
   *  default. Melamine's is *Alb* and `kit.M.door` carries exactly that hex, so an unfinished melamine
   *  kitchen renders the pixels it always did; both halves are asserted, so changing either lands here. */
  it("draws a cabinet that chose nothing in the material's declared default", () => {
    drawn(everyCabinetFollowing());

    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) {
      expect(colourOf(front)).toBe(MELAMINE_DEFAULT_HEX);
    }
    expect(`#${kit.M.door.color.getHexString()}`).toBe(MELAMINE_DEFAULT_HEX);
  });

  /** The same criterion where it is visible: melamine's default equals `kit.M.door`, so a renderer that
   *  skipped a following cabinet would pass the case above by accident. Veneer's *Stejar* is nowhere near
   *  white, so this goes red when the resolver stops being asked. */
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
  it("draws a following cabinet in the whole-kitchen colour", () => {
    drawn(wearingKitchenColour(everyCabinetFollowing(), KITCHEN_COLOUR));

    const fronts = frontsOf(mounted(FINISHABLE_PLACEMENT_ID));
    expect(fronts.length).toBeGreaterThan(0);
    for (const front of fronts) expect(colourOf(front)).toBe(ANTHRACITE_HEX);
  });

  /** The cabinet's own choice wins over the kitchen's (the half a too-eager resolver would break), on the
   *  same design as the test above so the two differ only in whether the cabinet chose. */
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

// Two syncs on one `solidsRoot`: every assertion above mounts into a fresh scene and passes even with
// `signBody` still signing `finishKey`, because a first mount always paints. `syncSolidBodies` keeps a
// mounted body whose signature still matches its record, and a whole-kitchen change writes only to
// `settings.finish` (ADR 0099 decision 2), so under a `finishKey` signature nothing re-signs or re-mounts.
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

  /** Negative twin: the repaint cannot be bought by re-mounting everything. A cabinet with its own colour
   *  resolves to the same finish before and after, so its signature is unchanged and `syncSolidBodies`
   *  must keep the identical instance (ADR 0099 decision 5 row 2). */
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
