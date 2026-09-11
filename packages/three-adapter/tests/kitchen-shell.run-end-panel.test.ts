// ADR 0045: the run-end panel follows the run it closes.
//
// Every case here goes through `syncSolidBodies`, because that is the only path the app has: the
// panel's seat is derived on every sync, and a test that called the derivation directly would not
// notice if the sync stopped calling it.
import {
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { buildKitchenShell } from "../src/kitchen-shell.js";
import {
  makeKit,
  RUN_END_PANEL_EDGE_OFFSET_M,
  RUN_END_PANEL_NAME,
  RUN_END_PANEL_SEEDED_X_M,
  type Kit,
} from "../src/kitchen-parts.js";
import { climbToSelectable } from "../src/picking.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { describeStructure } from "./support/structure.js";

/** M1's own float-artefact allowance, and the tolerance ADR 0045 criterion 6 names. */
const POSITION_EPSILON_M = 1e-6;

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);
/** `p4` — `base-drawer3-600` at 3200 — is the right-most wall-A base placement in the seeded
 *  design, so it is the cabinet the panel closes. */
const RIGHT_MOST_BASE_ID = "p4";

let kit: Kit;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
});

interface MountedScene {
  readonly shell: THREE.Group;
  readonly solidsRoot: THREE.Group;
}

function mountScene(records: readonly PlacementRecord[]): MountedScene {
  const shell = buildKitchenShell(kit);
  const solidsRoot = new THREE.Group();
  solidsRoot.name = "solids";
  solidsRoot.add(shell);
  syncSolidBodies({ kit, solidsRoot, records, room: KITCHEN_L_DESIGN.room });
  return { shell, solidsRoot };
}

function panelOf(mounted: MountedScene): THREE.Object3D {
  return required(
    mounted.shell.children.find((child) => child.name === RUN_END_PANEL_NAME),
    "run-end panel",
  );
}

function wallABaseRecords(
  records: readonly PlacementRecord[],
): readonly PlacementRecord[] {
  return records.filter(
    (record) => record.wall === "A" && record.band === "base",
  );
}

function withoutRecord(
  records: readonly PlacementRecord[],
  id: string,
): PlacementRecord[] {
  return records.filter((record) => record.id !== id);
}

/** A width change as the domain expresses it: the carcass narrows and its centre moves by half the
 *  delta, so the cabinet's *left* edge holds and only its right edge travels. */
function narrowedFromTheRight(
  record: PlacementRecord,
  byMm: number,
): PlacementRecord {
  const deltaM = byMm / 1000;
  return {
    ...record,
    widthMm: record.widthMm - byMm,
    frame: {
      ...record.frame,
      x: record.frame.x - deltaM / 2,
      w: record.frame.w - deltaM,
    },
  };
}

function replaceRecord(
  records: readonly PlacementRecord[],
  replacement: PlacementRecord,
): PlacementRecord[] {
  return records.map((record) =>
    record.id === replacement.id ? replacement : record,
  );
}

function expectedSeatM(record: PlacementRecord): number {
  return record.frame.x + record.frame.w / 2 + RUN_END_PANEL_EDGE_OFFSET_M;
}

describe("the seeded scene's run-end panel", () => {
  it("stands at the reference room's 3.51 m, which is M1's parity number", () => {
    const mounted = mountScene(SEEDED_RECORDS);

    expect(panelOf(mounted).position.x).toBeCloseTo(
      RUN_END_PANEL_SEEDED_X_M,
      6,
    );
    expect(panelOf(mounted).visible).toBe(true);
  });

  it("derives that same seat from the right-most wall-A base record", () => {
    const rightMost = required(
      SEEDED_RECORDS.find((record) => record.id === RIGHT_MOST_BASE_ID),
      RIGHT_MOST_BASE_ID,
    );

    const mounted = mountScene(SEEDED_RECORDS);

    expect(
      Math.abs(panelOf(mounted).position.x - expectedSeatM(rightMost)),
    ).toBeLessThan(POSITION_EPSILON_M);
  });
});

describe("a resize of the cabinet the panel closes", () => {
  it("moves the panel left by exactly the 50 mm the cabinet lost", () => {
    const rightMost = required(
      SEEDED_RECORDS.find((record) => record.id === RIGHT_MOST_BASE_ID),
      RIGHT_MOST_BASE_ID,
    );
    const before = mountScene(SEEDED_RECORDS);
    const seatBeforeM = panelOf(before).position.x;

    const after = mountScene(
      replaceRecord(SEEDED_RECORDS, narrowedFromTheRight(rightMost, 50)),
    );

    expect(seatBeforeM - panelOf(after).position.x).toBeCloseTo(0.05, 6);
  });

  it("leaves the panel where it was when a cabinet further left is resized", () => {
    const sink = required(
      SEEDED_RECORDS.find((record) => record.id === "p0"),
      "p0",
    );
    const before = mountScene(SEEDED_RECORDS);

    const after = mountScene(
      replaceRecord(SEEDED_RECORDS, narrowedFromTheRight(sink, 50)),
    );

    expect(panelOf(after).position.x).toBeCloseTo(
      panelOf(before).position.x,
      6,
    );
  });
});

describe("deleting wall A's base cabinets one from the right", () => {
  it("re-seats the panel on each new right-most cabinet in turn", () => {
    const ordered = [...wallABaseRecords(SEEDED_RECORDS)].sort(
      (left, right) => right.frame.x - left.frame.x,
    );
    expect(ordered.length).toBeGreaterThan(2);

    let remaining: readonly PlacementRecord[] = SEEDED_RECORDS;
    for (const [index, deleted] of ordered.entries()) {
      remaining = withoutRecord(remaining, deleted.id);
      const mounted = mountScene(remaining);
      const nextRightMost = ordered[index + 1];

      if (nextRightMost) {
        expect(panelOf(mounted).visible, deleted.id).toBe(true);
        expect(panelOf(mounted).position.x, deleted.id).toBeCloseTo(
          expectedSeatM(nextRightMost),
          6,
        );
      } else {
        expect(panelOf(mounted).visible, "the last base cabinet").toBe(false);
      }
    }
  });

  it("shows the panel again at the new right edge when a base cabinet returns", () => {
    const emptied = SEEDED_RECORDS.filter(
      (record) => !(record.wall === "A" && record.band === "base"),
    );
    const reinserted = required(
      SEEDED_RECORDS.find((record) => record.id === RIGHT_MOST_BASE_ID),
      RIGHT_MOST_BASE_ID,
    );

    const hidden = mountScene(emptied);
    const shown = mountScene([...emptied, reinserted]);

    expect(panelOf(hidden).visible).toBe(false);
    expect(panelOf(shown).visible).toBe(true);
    expect(panelOf(shown).position.x).toBeCloseTo(expectedSeatM(reinserted), 6);
  });

  it("hides the panel without moving it out of the shell or tagging it", () => {
    const emptied = SEEDED_RECORDS.filter(
      (record) => !(record.wall === "A" && record.band === "base"),
    );

    const mounted = mountScene(emptied);
    const panel = panelOf(mounted);

    expect(panel.visible).toBe(false);
    expect(mounted.shell.children).toContain(panel);
    expect(panel.parent).toBe(mounted.shell);
    expect(panel.userData["placementId"]).toBeUndefined();
    expect(climbToSelectable(panel)).toBeNull();
  });
});

/** ADR 0045's *"put the panel on the right of the remained cabinet **if possible**"*, as the owner
 *  read it on 2026-09-01: when the seat is already occupied it is not possible, and the panel hides
 *  rather than standing inside another body. */
describe("a body standing where the panel would", () => {
  const rightMost = required(
    SEEDED_RECORDS.find((record) => record.id === RIGHT_MOST_BASE_ID),
    RIGHT_MOST_BASE_ID,
  );
  const runEndM = rightMost.frame.x + rightMost.frame.w / 2;

  /** A full-height pantry butted against the last base cabinet — reachable from the shipped design
   *  by deleting `p4`, `p14` and `p20`, letting §10 merge the opening and inserting
   *  `tall-pantry-600`. Its left face is the run's end, so the seat 10 mm past that is inside it. */
  function pantryRightOfTheRun(y0M = 0, heightM = 2.2): PlacementRecord {
    return {
      ...rightMost,
      id: "pantry-right-of-the-run",
      band: "column",
      heightMm: heightM * 1000,
      frame: {
        ...rightMost.frame,
        x: runEndM + rightMost.frame.w / 2,
        y0: y0M,
        h: heightM,
      },
    };
  }

  it("hides the panel rather than burying it in the column's side", () => {
    const mounted = mountScene([...SEEDED_RECORDS, pantryRightOfTheRun()]);

    expect(panelOf(mounted).visible).toBe(false);
  });

  it("does not let that column extend the run it is not part of", () => {
    const blocked = mountScene([...SEEDED_RECORDS, pantryRightOfTheRun()]);
    const shortened = mountScene([
      ...replaceRecord(SEEDED_RECORDS, narrowedFromTheRight(rightMost, 100)),
      pantryRightOfTheRun(),
    ]);

    // The run's end is still read from base placements alone: shrinking the last base cabinet by
    // 100 mm frees the seat, and the panel returns at the shrunk cabinet's edge — not at the
    // column's, which a wider filter would have made the run's end.
    expect(panelOf(blocked).visible).toBe(false);
    expect(panelOf(shortened).visible).toBe(true);
    expect(panelOf(shortened).position.x).toBeCloseTo(
      RUN_END_PANEL_SEEDED_X_M - 0.1,
      6,
    );
  });

  it("keeps the panel visible under a wall cabinet on the same along-wall line", () => {
    const mounted = mountScene([
      ...SEEDED_RECORDS,
      { ...pantryRightOfTheRun(1.5, 0.7), band: "wall" },
    ]);

    expect(panelOf(mounted).visible).toBe(true);
    expect(panelOf(mounted).position.x).toBeCloseTo(
      RUN_END_PANEL_SEEDED_X_M,
      6,
    );
  });
});

// ADR 0045 Amendment A, through the one path the app has: the room reaches the domain's veto only
// because `syncSolidBodies` hands it on, so a sync that dropped it would draw these panels.
describe("a run that reaches wall A's end", () => {
  /** The seeded run ends at 3500; the panel's gap and slab take 19 mm past it. */
  const SEEDED_RUN_END_MM = 3500;
  const FOOTPRINT_MM = 19;

  function syncedInWallA(wallAMm: number): MountedScene {
    const mounted = mountScene(SEEDED_RECORDS);
    syncSolidBodies({
      kit,
      solidsRoot: mounted.solidsRoot,
      records: SEEDED_RECORDS,
      room: { ...KITCHEN_L_DESIGN.room, widthMm: wallAMm },
    });
    return mounted;
  }

  it("keeps the panel where the wall leaves exactly its footprint", () => {
    const mounted = syncedInWallA(SEEDED_RUN_END_MM + FOOTPRINT_MM);

    expect(panelOf(mounted).visible).toBe(true);
    expect(panelOf(mounted).position.x).toBeCloseTo(
      RUN_END_PANEL_SEEDED_X_M,
      9,
    );
  });

  it("hides the panel where the wall leaves a millimetre less", () => {
    const mounted = syncedInWallA(SEEDED_RUN_END_MM + FOOTPRINT_MM - 1);

    expect(panelOf(mounted).visible).toBe(false);
  });

  it("hides the panel where the run is flush with the wall", () => {
    const mounted = syncedInWallA(SEEDED_RUN_END_MM);

    expect(panelOf(mounted).visible).toBe(false);
  });
});

describe("ADR 0045's anti-invariant: one document, one picture", () => {
  const emptiedRecords = SEEDED_RECORDS.filter(
    (record) => !(record.wall === "A" && record.band === "base"),
  );

  /** The `db9c402` failure this guards: a shell that reads records could put a deleted body back as
   *  an untagged ghost, so the deleted-into state and the loaded state would differ. */
  it("renders the deleted-into scene identically to the freshly loaded one", () => {
    const loaded = mountScene(emptiedRecords);

    const mutated = mountScene(SEEDED_RECORDS);
    syncSolidBodies({
      kit,
      solidsRoot: mutated.solidsRoot,
      records: emptiedRecords,
      room: KITCHEN_L_DESIGN.room,
    });

    expect(describeStructure(mutated.solidsRoot)).toEqual(
      describeStructure(loaded.solidsRoot),
    );
    expect(panelOf(mutated).position.x).toBe(panelOf(loaded).position.x);
    expect(panelOf(mutated).visible).toBe(panelOf(loaded).visible);
  });

  /** The seeded design alone cannot catch a seat that carries history: deleting straight out of it
   *  leaves the panel on the 3.51 a fresh load parks it on, so "pinned" and "wherever it last was"
   *  agree by accident. A resize before the deletions makes them disagree — the last visible seat
   *  becomes 3.41 — which is the mutant `syncRunEndPanel` would be if it wrote `position.x` only on
   *  the visible branch. */
  it("parks the hidden panel identically however long the history that hid it", () => {
    const rightMost = required(
      SEEDED_RECORDS.find((record) => record.id === RIGHT_MOST_BASE_ID),
      RIGHT_MOST_BASE_ID,
    );
    const shrunkBy100 = replaceRecord(
      SEEDED_RECORDS,
      narrowedFromTheRight(rightMost, 100),
    );

    const loaded = mountScene(emptiedRecords);

    const mutated = mountScene(SEEDED_RECORDS);
    syncSolidBodies({
      kit,
      solidsRoot: mutated.solidsRoot,
      records: shrunkBy100,
      room: KITCHEN_L_DESIGN.room,
    });
    const seatAfterResizeM = panelOf(mutated).position.x;
    syncSolidBodies({
      kit,
      solidsRoot: mutated.solidsRoot,
      records: emptiedRecords,
      room: KITCHEN_L_DESIGN.room,
    });

    expect(seatAfterResizeM, "the resize must move the seat first").toBeCloseTo(
      RUN_END_PANEL_SEEDED_X_M - 0.1,
      6,
    );
    expect(panelOf(mutated).position.x).toBe(panelOf(loaded).position.x);
    expect(panelOf(mutated).visible).toBe(false);
    expect(describeStructure(mutated.solidsRoot)).toEqual(
      describeStructure(loaded.solidsRoot),
    );
  });

  it("leaves no mesh tagged with a deleted placement id", () => {
    const removedIds = new Set(
      wallABaseRecords(SEEDED_RECORDS).map((record) => record.id),
    );
    expect(removedIds.size).toBeGreaterThan(0);

    const mounted = mountScene(SEEDED_RECORDS);
    syncSolidBodies({
      kit,
      solidsRoot: mounted.solidsRoot,
      records: emptiedRecords,
      room: KITCHEN_L_DESIGN.room,
    });

    const taggedIds: string[] = [];
    mounted.solidsRoot.traverse((node) => {
      const placementId = node.userData["placementId"] as string | undefined;
      if (placementId !== undefined) taggedIds.push(placementId);
    });
    expect(taggedIds.filter((id) => removedIds.has(id))).toEqual([]);
  });

  it("keeps the panel a manifest member no record can create or remove", () => {
    const mounted = mountScene(emptiedRecords);
    const panels: THREE.Object3D[] = [];
    mounted.solidsRoot.traverse((node) => {
      if (node.name === RUN_END_PANEL_NAME) panels.push(node);
    });

    expect(panels).toHaveLength(1);
    expect(isMesh(required(panels[0], "panel"))).toBe(true);
  });
});
