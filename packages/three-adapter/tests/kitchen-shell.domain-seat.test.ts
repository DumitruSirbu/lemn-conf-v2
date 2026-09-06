// ADR 0083 decision 5, the adapter half: the panel on screen and the domain's seat are one number.
//
// `kitchen-shell.run-end-panel.test.ts` covers ADR 0045's behaviour through `syncSolidBodies` and
// keeps doing so unchanged. This file asserts the thing that behaviour test cannot see — that the
// mesh's `position.x` **is** `runEndPanelSeatM`'s answer rather than a second derivation agreeing
// with it. The two would agree on the shipped kitchen either way, so the sweep below is chosen to
// carry the veto case, which is where two derivations part.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  RUN_END_PANEL_EDGE_OFFSET_M as DOMAIN_EDGE_OFFSET_M,
  RUN_END_PANEL_GAP_M as DOMAIN_GAP_M,
  RUN_END_PANEL_HEIGHT_M as DOMAIN_HEIGHT_M,
  RUN_END_PANEL_THICKNESS_M as DOMAIN_THICKNESS_M,
  runEndPanelSeatM,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildKitchenShell } from "../src/kitchen-shell.js";
import {
  makeKit,
  RUN_END_PANEL_EDGE_OFFSET_M,
  RUN_END_PANEL_GAP_M,
  RUN_END_PANEL_HEIGHT_M,
  RUN_END_PANEL_NAME,
  RUN_END_PANEL_SEEDED_X_M,
  RUN_END_PANEL_THICKNESS_M,
  type Kit,
} from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);
const RIGHT_MOST_BASE_ID = "p4";

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

function panelAfterSync(records: readonly PlacementRecord[]): THREE.Object3D {
  const shell = buildKitchenShell(kit);
  const solidsRoot = new THREE.Group();
  solidsRoot.name = "solids";
  solidsRoot.add(shell);
  syncSolidBodies({ kit, solidsRoot, records });
  return required(
    shell.children.find((child) => child.name === RUN_END_PANEL_NAME),
    "run-end panel",
  );
}

const RIGHT_MOST_BASE = required(
  SEEDED_RECORDS.find((record) => record.id === RIGHT_MOST_BASE_ID),
  RIGHT_MOST_BASE_ID,
);
const RUN_END_M = RIGHT_MOST_BASE.frame.x + RIGHT_MOST_BASE.frame.w / 2;

function bodyRightOfTheRun(
  band: PlacementRecord["band"],
  y0M: number,
  heightM: number,
): PlacementRecord {
  return {
    ...RIGHT_MOST_BASE,
    id: `right-of-the-run-${band}-${String(y0M)}`,
    band,
    heightMm: heightM * 1000,
    frame: {
      ...RIGHT_MOST_BASE.frame,
      x: RUN_END_M + RIGHT_MOST_BASE.frame.w / 2,
      y0: y0M,
      h: heightM,
    },
  };
}

const SCENES: readonly {
  readonly label: string;
  readonly records: readonly PlacementRecord[];
}[] = [
  { label: "the seeded design", records: SEEDED_RECORDS },
  {
    label: "a full-height column standing in the seat",
    records: [...SEEDED_RECORDS, bodyRightOfTheRun("column", 0, 2.2)],
  },
  {
    label: "a wall cabinet hanging over the seat",
    records: [...SEEDED_RECORDS, bodyRightOfTheRun("wall", 1.5, 0.7)],
  },
  {
    label: "wall A stripped of its base run",
    records: SEEDED_RECORDS.filter(
      (record) => !(record.wall === "A" && record.band === "base"),
    ),
  },
];

describe("the panel's seat on screen is the domain's answer", () => {
  it.each(SCENES)("seats the mesh on $label", ({ records }) => {
    const seatM = runEndPanelSeatM(records);

    const panel = panelAfterSync(records);

    // `toBe`, not `toBeCloseTo`: a second derivation that rounded or recomposed the offset would
    // land within any tolerance loose enough to be worth writing.
    expect(panel.position.x).toBe(seatM ?? RUN_END_PANEL_SEEDED_X_M);
    expect(panel.visible).toBe(seatM !== undefined);
  });

  /** The sweep is only evidence if it contains a hidden panel and a visible one. */
  it("covers both the shown and the vetoed panel", () => {
    const visibility = SCENES.map(
      ({ records }) => runEndPanelSeatM(records) !== undefined,
    );

    expect(visibility.filter(Boolean).length).toBeGreaterThan(1);
    expect(visibility.filter((shown) => !shown).length).toBeGreaterThan(1);
  });
});

describe("the adapter's panel constants are the domain's, not a copy", () => {
  /** `kitchen-parts.ts` re-exports rather than declares, so these are the same binding. Asserted
   *  anyway: the failure this closes is someone restoring a local `const` here that happens to
   *  agree today, and this is the line that stops being true the moment they do. */
  it("resolves every slab constant through the domain module", () => {
    expect(RUN_END_PANEL_THICKNESS_M).toBe(DOMAIN_THICKNESS_M);
    expect(RUN_END_PANEL_GAP_M).toBe(DOMAIN_GAP_M);
    expect(RUN_END_PANEL_HEIGHT_M).toBe(DOMAIN_HEIGHT_M);
    expect(RUN_END_PANEL_EDGE_OFFSET_M).toBe(DOMAIN_EDGE_OFFSET_M);
  });

  /** ADR 0083 decision 5's 3519, read off the built scene rather than off the constants: the
   *  finished end's outer face is `3500 + 1 mm gap + 18 mm slab`, and the reference panel's 3520 is
   *  a rounding no wave may recover with a flat 20 mm constant. */
  it("stands the seeded panel's outer face 3519 mm along wall A", () => {
    const panel = panelAfterSync(SEEDED_RECORDS);

    const outerFaceMm =
      (panel.position.x + RUN_END_PANEL_THICKNESS_M / 2) * 1000;

    expect(panel.position.x).toBeCloseTo(RUN_END_PANEL_SEEDED_X_M, 9);
    expect(outerFaceMm).toBeCloseTo(3519, 6);
    expect(outerFaceMm).not.toBeCloseTo(3520, 3);
  });
});
