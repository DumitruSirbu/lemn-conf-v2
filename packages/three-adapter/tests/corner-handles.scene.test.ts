// **M12 wave W1 (ADR 0182): a corner takes the kitchen's handle on screen.**
//
// Until then every corner drew the builder's steel bar whatever the kitchen said. The scene is asked here by its
// meshes, visibility and colour, of the three corner bodies below the top row and their top-row twins. The colour
// literal is written out: it is the thing the scene is held to.
import {
  CORNER_WALL_UNIT_TEMPLATES,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type Design,
  type Handle,
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

const BLACK_HANDLE_HEX = "1c1e20";

/** `base-corner-x-900`, `wall-corner-return-570` and `wall-corner-x-900`: the corners below the top row. */
const BELOW_THE_TOP_ROW = ["p25", "p9", "p27"] as const;
/** `wall-corner-return-570-top` and `wall-corner-x-900-top`. */
const ON_THE_TOP_ROW = ["p21", "p28"] as const;
const PLACEMENT_IDS = [...BELOW_THE_TOP_ROW, ...ON_THE_TOP_ROW];

let kit: Kit;
let solidsRoot: THREE.Group;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

beforeEach(() => {
  solidsRoot = new THREE.Group();
});

/** The five corner bodies that carry a bar, and nothing else, so the kitchen's handle is the only variable. */
function cornersUnderKitchen(settings: {
  readonly handle?: Handle;
  readonly topRowHandle?: Handle;
}): Design {
  const everyPlacement = [
    ...KITCHEN_L_DESIGN.placements,
    ...CORNER_WALL_UNIT_TEMPLATES,
  ];
  return {
    ...KITCHEN_L_DESIGN,
    settings: { cabinetDepthMm: 600, ...settings },
    placements: PLACEMENT_IDS.map((id) => {
      const found = everyPlacement.find((placement) => placement.id === id);
      if (!found) throw new Error(`no placement "${id}"`);
      return found;
    }),
  };
}

function mount(design: Design): void {
  const records = derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG);
  syncSolidBodies({ kit, solidsRoot, records, room: design.room });
}

interface DrawnBars {
  readonly built: number;
  readonly visible: number;
  readonly black: number;
}

function drawnBarsOf(placementId: string): DrawnBars {
  const body = solidsRoot.children.find(
    (child) => child.userData["placementId"] === placementId,
  );
  if (!body) throw new Error(`no body mounted for placement "${placementId}"`);
  let built = 0;
  let visible = 0;
  let black = 0;
  forEachCabinetHandleMesh(body, (part) => {
    built += 1;
    if (part.visible) visible += 1;
    const material = part.material as THREE.MeshStandardMaterial;
    if (material.color.getHexString() === BLACK_HANDLE_HEX) black += 1;
  });
  return { built, visible, black };
}

describe("every corner that carries a bar builds one, so the kitchen's handle has something to reach", () => {
  it.each(PLACEMENT_IDS)("builds a cabinet handle on %s", (placementId) => {
    mount(cornersUnderKitchen({}));

    expect(drawnBarsOf(placementId).built).toBeGreaterThan(0);
  });
});

describe("W1-2: a black kitchen paints the corner bars black", () => {
  it.each(BELOW_THE_TOP_ROW)(
    "draws every bar of %s black and visible",
    (placementId) => {
      mount(cornersUnderKitchen({ handle: "black" }));
      const bars = drawnBarsOf(placementId);

      expect(bars.visible).toBe(bars.built);
      expect(bars.black).toBe(bars.built);
    },
  );

  it.each(ON_THE_TOP_ROW)(
    "keeps the bars of %s hidden, the top row following its own handle",
    (placementId) => {
      mount(cornersUnderKitchen({ handle: "black" }));

      expect(drawnBarsOf(placementId).visible).toBe(0);
    },
  );

  it.each(ON_THE_TOP_ROW)(
    "shows the bars of %s black once the top row's handle is black",
    (placementId) => {
      mount(cornersUnderKitchen({ handle: "steel", topRowHandle: "black" }));
      const bars = drawnBarsOf(placementId);

      expect(bars.visible).toBe(bars.built);
      expect(bars.black).toBe(bars.built);
    },
  );

  it.each(BELOW_THE_TOP_ROW)(
    "leaves %s steel and visible when the kitchen says nothing",
    (placementId) => {
      mount(cornersUnderKitchen({}));
      const bars = drawnBarsOf(placementId);

      expect(bars.visible).toBe(bars.built);
      expect(bars.black).toBe(0);
    },
  );
});

describe("W1-3: a push kitchen takes the bars off the corners below the top row", () => {
  it.each(BELOW_THE_TOP_ROW)("hides every bar of %s", (placementId) => {
    mount(cornersUnderKitchen({ handle: "push" }));

    expect(drawnBarsOf(placementId).visible).toBe(0);
  });
});
