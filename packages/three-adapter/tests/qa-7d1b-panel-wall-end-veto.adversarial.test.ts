// Adversarial QA on wave 7D1b — the run-end panel's wall-end veto (ADR 0045 Amendment A) as the scene
// draws it. The wave's own adapter cases mount a fresh scene per room; the app does not. It keeps one
// mounted scene for the life of a depth and syncs it after every command, so the veto has to be
// honoured **in both directions on the same mesh**: hidden when a run reaches the wall, shown again
// when the cabinet is narrowed, hidden again when it is widened back — with no second panel, no stale
// seat, and a picture identical to a fresh mount of the same kitchen at every step.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type DesignRoom,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildKitchenShell } from "../src/kitchen-shell.js";
import {
  makeKit,
  RUN_END_PANEL_EDGE_OFFSET_M,
  RUN_END_PANEL_NAME,
  type Kit,
} from "../src/kitchen-parts.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { describeStructure } from "./support/structure.js";

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);
const SEEDED_ROOM = KITCHEN_L_DESIGN.room;
/** `p4`, the right-most wall-A base cabinet, whose right edge the panel closes (3500 mm). */
const RIGHT_MOST_BASE_ID = "p4";
/** A wall A that leaves the seeded run 10 mm — inside the panel's 19 mm gap and slab. */
const WALL_A_TEN_MM_PAST_THE_RUN: DesignRoom = {
  ...SEEDED_ROOM,
  widthMm: 3510,
};
const NARROWED_BY_MM = 100;

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

interface Scene {
  readonly shell: THREE.Group;
  readonly solidsRoot: THREE.Group;
}

function mount(): Scene {
  const shell = buildKitchenShell(kit, KITCHEN_L_DESIGN.room);
  const solidsRoot = new THREE.Group();
  solidsRoot.name = "solids";
  solidsRoot.add(shell);
  return { shell, solidsRoot };
}

function sync(
  scene: Scene,
  records: readonly PlacementRecord[],
  room: DesignRoom,
): void {
  syncSolidBodies({ kit, solidsRoot: scene.solidsRoot, records, room });
}

function panelsIn(scene: Scene): THREE.Object3D[] {
  const panels: THREE.Object3D[] = [];
  scene.solidsRoot.traverse((object) => {
    if (object.name === RUN_END_PANEL_NAME) panels.push(object);
  });
  return panels;
}

function onlyPanelOf(scene: Scene): THREE.Object3D {
  const panels = panelsIn(scene);
  expect(panels).toHaveLength(1);
  return required(panels[0], "run-end panel");
}

/** `p4` narrowed from the right, as a width change frames it: left edge held, centre moves by half. */
function withRightMostNarrowed(byMm: number): PlacementRecord[] {
  return SEEDED_RECORDS.map((record) =>
    record.id === RIGHT_MOST_BASE_ID
      ? {
          ...record,
          widthMm: record.widthMm - byMm,
          frame: {
            ...record.frame,
            x: record.frame.x - byMm / 2000,
            w: record.frame.w - byMm / 1000,
          },
        }
      : record,
  );
}

function runEndM(records: readonly PlacementRecord[]): number {
  const base = required(
    records.find((record) => record.id === RIGHT_MOST_BASE_ID),
    RIGHT_MOST_BASE_ID,
  );
  return base.frame.x + base.frame.w / 2;
}

describe("the wall-end veto on one mounted scene, synced command after command", () => {
  const NARROWED = withRightMostNarrowed(NARROWED_BY_MM);
  const STEPS: readonly {
    readonly label: string;
    readonly records: readonly PlacementRecord[];
    readonly room: DesignRoom;
    readonly isDrawn: boolean;
  }[] = [
    {
      label: "the seeded kitchen",
      records: SEEDED_RECORDS,
      room: SEEDED_ROOM,
      isDrawn: true,
    },
    {
      label: "a wall 10 mm past the run",
      records: SEEDED_RECORDS,
      room: WALL_A_TEN_MM_PAST_THE_RUN,
      isDrawn: false,
    },
    {
      label: "the cabinet narrowed by 100",
      records: NARROWED,
      room: WALL_A_TEN_MM_PAST_THE_RUN,
      isDrawn: true,
    },
    {
      label: "widened back",
      records: SEEDED_RECORDS,
      room: WALL_A_TEN_MM_PAST_THE_RUN,
      isDrawn: false,
    },
    {
      label: "the seeded room again",
      records: SEEDED_RECORDS,
      room: SEEDED_ROOM,
      isDrawn: true,
    },
  ];

  it("hides, re-shows and re-hides the same panel, seated on the run it closes whenever drawn", () => {
    const scene = mount();
    sync(scene, SEEDED_RECORDS, SEEDED_ROOM);
    const panel = onlyPanelOf(scene);

    for (const step of STEPS) {
      sync(scene, step.records, step.room);

      expect(onlyPanelOf(scene), step.label).toBe(panel);
      expect(panel.visible, step.label).toBe(step.isDrawn);
      if (step.isDrawn) {
        expect(panel.position.x, step.label).toBeCloseTo(
          runEndM(step.records) + RUN_END_PANEL_EDGE_OFFSET_M,
          9,
        );
      }
    }
  });

  // The shell — floor, walls, backsplash and the panel — compared whole. Not the solids root: an
  // incremental sync re-mounts a resized body at the end of the root while a fresh mount follows
  // record order, a child-order difference that predates this wave and draws nothing different.
  it("draws, at every step, exactly the shell a fresh mount of that kitchen draws", () => {
    const scene = mount();

    for (const step of STEPS) {
      sync(scene, step.records, step.room);
      const fresh = mount();
      sync(fresh, step.records, step.room);

      expect(describeStructure(scene.shell), step.label).toEqual(
        describeStructure(fresh.shell),
      );
    }
  });

  it("re-syncs on a room change alone, with the records untouched", () => {
    const scene = mount();
    sync(scene, SEEDED_RECORDS, SEEDED_ROOM);

    sync(scene, SEEDED_RECORDS, WALL_A_TEN_MM_PAST_THE_RUN);
    const hiddenByTheRoom = onlyPanelOf(scene).visible;
    sync(scene, SEEDED_RECORDS, SEEDED_ROOM);

    expect(hiddenByTheRoom).toBe(false);
    expect(onlyPanelOf(scene).visible).toBe(true);
  });
});
