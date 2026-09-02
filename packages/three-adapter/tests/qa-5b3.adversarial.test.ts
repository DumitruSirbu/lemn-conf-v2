// Adversarial QA for M5B wave 5B3 — the run-end panel follows the run it closes (ADR 0045).
//
// The wave's risk is criterion 4, the `db9c402` anti-invariant: a design **loaded** with no wall-A
// base placements must render the same scene as one that **reached** that state by deletion. The
// implementer's own suite tests that over a single delete from the seeded design, where both paths
// happen to agree because the seeded seat and the parked seat are the same number. This file walks
// longer paths — resize-then-delete, delete-reinsert-delete, repeated syncs, shuffled records — on
// which a derivation that carried history would visibly diverge.
//
// Every expectation is retyped or measured, never imported from the code under test: the seeded
// 3.51 and the 10 mm offset are read off the **unmodified vendored reference library** and off
// built world geometry, so a change to `RUN_END_PANEL_SEEDED_X_M` cannot move a test with it.
import {
  deriveColumns,
  derivePlacementRecords,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  removePlacement,
  setWidth,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import fc from "fast-check";
import { makeKit as makeReferenceKit } from "@reference/kitchen-parts";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit, type Kit } from "../src/kitchen-parts.js";
import { createBodyProbe } from "../src/measure-built-body.js";
import { buildKitchenShell } from "../src/kitchen-shell.js";
import { climbToSelectable } from "../src/picking.js";
import { syncSolidBodies } from "../src/scene-sync.js";
import { isMesh } from "../src/three-guards.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";
import { required } from "./support/required.js";
import { describeStructure } from "./support/structure.js";

/** The panel's mesh name, retyped rather than imported for the reason at the top of the file. */
const PANEL_NAME = "end_panel_right";

/** M1's float-artefact allowance (`kitchen-parts.parity.test.ts`), which criterion 6 also names. */
const FLOAT_EPSILON_M = 1e-6;

/** The authored 1 mm gap between the run's last drawer front and the panel's inner face,
 *  `docs/CONFIGURATION_MODEL.md:959`: the panel's *centre* stands 10 mm past the carcass edge and
 *  the 18 mm slab therefore leaves 1 mm of air. Retyped from that record, not from the source. */
const PANEL_CENTRE_OFFSET_M = 0.01;
const PANEL_INNER_FACE_GAP_M = 0.001;

const SEEDED_RECORDS = derivePlacementRecords(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

/** Every width the shipped 600 mm module could plausibly be driven to, both ends of §7's range
 *  included. Refusals are skipped; the test asserts that enough were accepted to be a sweep. */
const RESIZE_SWEEP_MM = [
  200, 300, 350, 400, 450, 500, 550, 600, 700, 800, 900, 1000,
];

const OCCURRED_AT = "2026-08-27T12:00:00.000Z";

/** `p4` at 3200 is the seeded run's right-most wall-A base placement. */
const RIGHT_MOST_BASE_ID = "p4";

let kit: Kit;
/** The seeded panel seat as the reference library itself builds it — the number M1's parity gate
 *  holds the port to, read out of the reference rather than restated. */
let referenceSeatM: number;

beforeAll(() => {
  installHeadlessDocument();
  kit = makeKit({ createCanvas: createHeadlessCanvas });
  const referenceRoom = makeReferenceKit(THREE).builders["kitchen-l"]?.();
  referenceSeatM = required(
    required(referenceRoom, "reference kitchen-l").children.find(
      (child) => child.name === PANEL_NAME,
    ),
    "reference end panel",
  ).position.x;
});

interface MountedScene {
  readonly shell: THREE.Group;
  readonly solidsRoot: THREE.Group;
}

function mountShell(): MountedScene {
  const shell = buildKitchenShell(kit);
  const solidsRoot = new THREE.Group();
  solidsRoot.name = "solids";
  solidsRoot.add(shell);
  return { shell, solidsRoot };
}

/** Applies each record set in turn to one scene, which is what the app's effect does: the store
 *  publishes a new record list and the same mounted room is brought in line with it. */
function mountThrough(
  ...recordSets: readonly (readonly PlacementRecord[])[]
): MountedScene {
  const mounted = mountShell();
  for (const records of recordSets) {
    syncSolidBodies({ kit, solidsRoot: mounted.solidsRoot, records });
  }
  return mounted;
}

function panelOf(mounted: MountedScene): THREE.Object3D {
  return required(
    mounted.shell.children.find((child) => child.name === PANEL_NAME),
    "run-end panel",
  );
}

function panelsIn(root: THREE.Object3D): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (node.name === PANEL_NAME) found.push(node);
  });
  return found;
}

function isWallABase(record: PlacementRecord): boolean {
  return record.wall === "A" && record.band === "base";
}

function withoutWallABase(
  records: readonly PlacementRecord[],
): PlacementRecord[] {
  return records.filter((record) => !isWallABase(record));
}

function withoutRecord(
  records: readonly PlacementRecord[],
  id: string,
): PlacementRecord[] {
  return records.filter((record) => record.id !== id);
}

function recordById(id: string): PlacementRecord {
  return required(
    SEEDED_RECORDS.find((record) => record.id === id),
    id,
  );
}

/** A width change as the domain writes it: the left edge holds, so the centre moves half the delta
 *  and only the right edge travels. */
function narrowedFromTheRight(
  record: PlacementRecord,
  byM: number,
): PlacementRecord {
  return {
    ...record,
    widthMm: record.widthMm - byM * 1000,
    frame: {
      ...record.frame,
      x: record.frame.x - byM / 2,
      w: record.frame.w - byM,
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

function worldBoxOf(root: THREE.Object3D, node: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(node);
}

function bodyWithPlacementId(
  mounted: MountedScene,
  id: string,
): THREE.Object3D {
  return required(
    mounted.solidsRoot.children.find(
      (child) => child.userData["placementId"] === id,
    ),
    `mounted body ${id}`,
  );
}

// -------------------------------------------------------------------------------------------
// Criterion 6 — M1 parity, against the reference rather than against the port's own constant.
// -------------------------------------------------------------------------------------------

describe("the seeded seat is still the reference room's", () => {
  it("derives the exact x the unmodified reference library bakes", () => {
    const mounted = mountThrough(SEEDED_RECORDS);

    expect(Math.abs(panelOf(mounted).position.x - referenceSeatM)).toBeLessThan(
      FLOAT_EPSILON_M,
    );
  });

  it("leaves the panel's authored 1 mm gap from the last drawer, measured on geometry", () => {
    const mounted = mountThrough(SEEDED_RECORDS);

    const panelBox = worldBoxOf(mounted.solidsRoot, panelOf(mounted));
    const cabinetBox = worldBoxOf(
      mounted.solidsRoot,
      bodyWithPlacementId(mounted, RIGHT_MOST_BASE_ID),
    );

    expect(panelBox.min.x - cabinetBox.max.x).toBeCloseTo(
      PANEL_INNER_FACE_GAP_M,
      6,
    );
    expect(panelBox.intersectsBox(cabinetBox)).toBe(false);
  });
});

// -------------------------------------------------------------------------------------------
// Criterion 4 — one document, one picture, on paths longer than a single delete.
// -------------------------------------------------------------------------------------------

describe("ADR 0045 criterion 4 on longer histories", () => {
  const emptied = withoutWallABase(SEEDED_RECORDS);

  /** The case the implementer's own equivalence test cannot see. Its mutate path deletes straight
   *  out of the seeded design, where the panel is already parked on the seeded seat, so a
   *  derivation that wrote the seat only in the visible branch would still agree with a fresh
   *  load. Resizing first moves the seat off that number, and only then does history show. */
  it("agrees with a fresh load after the run was resized before being emptied", () => {
    const shrunk = replaceRecord(
      SEEDED_RECORDS,
      narrowedFromTheRight(recordById(RIGHT_MOST_BASE_ID), 0.1),
    );

    const mutated = mountThrough(SEEDED_RECORDS, shrunk, emptied);
    const loaded = mountThrough(emptied);

    expect(panelOf(mutated).position.x).toBe(panelOf(loaded).position.x);
    expect(describeStructure(mutated.solidsRoot)).toEqual(
      describeStructure(loaded.solidsRoot),
    );
  });

  it("agrees with a fresh load after delete, re-insert and delete again", () => {
    const withoutRightMost = withoutRecord(SEEDED_RECORDS, RIGHT_MOST_BASE_ID);

    const mutated = mountThrough(
      SEEDED_RECORDS,
      withoutRightMost,
      SEEDED_RECORDS,
      emptied,
    );
    const loaded = mountThrough(emptied);

    expect(panelOf(mutated).position.x).toBe(panelOf(loaded).position.x);
    expect(panelOf(mutated).visible).toBe(panelOf(loaded).visible);
  });

  it("puts the panel back on the same seat when the run returns after being emptied", () => {
    const mutated = mountThrough(SEEDED_RECORDS, emptied, SEEDED_RECORDS);
    const loaded = mountThrough(SEEDED_RECORDS);

    expect(panelOf(mutated).position.x).toBe(panelOf(loaded).position.x);
    expect(panelOf(mutated).visible).toBe(true);
  });

  it("is unchanged by re-syncing the same records any number of times", () => {
    const once = mountThrough(SEEDED_RECORDS);
    const thrice = mountThrough(SEEDED_RECORDS, SEEDED_RECORDS, SEEDED_RECORDS);

    expect(describeStructure(thrice.solidsRoot)).toEqual(
      describeStructure(once.solidsRoot),
    );
  });

  it("reads the same seat whatever order the records arrive in", () => {
    const reference = mountThrough(SEEDED_RECORDS);
    const expectedSeatM = panelOf(reference).position.x;

    fc.assert(
      fc.property(
        fc.shuffledSubarray([...SEEDED_RECORDS], {
          minLength: SEEDED_RECORDS.length,
        }),
        (shuffled) => {
          const mounted = mountThrough(shuffled);
          expect(panelOf(mounted).position.x).toBeCloseTo(expectedSeatM, 9);
          expect(panelOf(mounted).visible).toBe(true);
        },
      ),
      { numRuns: 12 },
    );
  });

  it("parks the panel on the seeded seat for an empty document and for a wall-B-only one", () => {
    const wallBOnly = SEEDED_RECORDS.filter((record) => record.wall === "B");

    for (const [label, records] of [
      ["no records at all", []],
      ["wall B only", wallBOnly],
      ["no wall-A base", emptied],
    ] as const) {
      const mounted = mountThrough(records);

      expect(panelOf(mounted).visible, label).toBe(false);
      expect(
        Math.abs(panelOf(mounted).position.x - referenceSeatM),
        label,
      ).toBeLessThan(FLOAT_EPSILON_M);
    }
  });
});

// -------------------------------------------------------------------------------------------
// Criterion 5 and the `db9c402` seam — no record may create, remove, re-parent or tag the panel.
// -------------------------------------------------------------------------------------------

describe("no record can create, destroy or claim the panel", () => {
  const histories: readonly (readonly (readonly PlacementRecord[])[])[] = [
    [SEEDED_RECORDS],
    [[]],
    [withoutWallABase(SEEDED_RECORDS)],
    [SEEDED_RECORDS, withoutWallABase(SEEDED_RECORDS), SEEDED_RECORDS],
    [SEEDED_RECORDS, withoutRecord(SEEDED_RECORDS, RIGHT_MOST_BASE_ID)],
  ];

  it("keeps exactly one panel, a mesh, a direct child of the shell, on every history", () => {
    for (const [index, history] of histories.entries()) {
      const mounted = mountThrough(...history);
      const panels = panelsIn(mounted.solidsRoot);

      expect(panels, `history ${String(index)}`).toHaveLength(1);
      const panel = required(panels[0], "panel");
      expect(isMesh(panel), `history ${String(index)}`).toBe(true);
      expect(panel.parent, `history ${String(index)}`).toBe(mounted.shell);
      expect(mounted.shell.parent, `history ${String(index)}`).toBe(
        mounted.solidsRoot,
      );
    }
  });

  it("never lets the panel carry a placement id or answer picking, hidden or shown", () => {
    for (const [index, history] of histories.entries()) {
      const mounted = mountThrough(...history);
      const panel = panelOf(mounted);

      expect(
        panel.userData["placementId"],
        `history ${String(index)}`,
      ).toBeUndefined();
      expect(Object.keys(panel.userData), `history ${String(index)}`).toEqual(
        [],
      );
      expect(climbToSelectable(panel), `history ${String(index)}`).toBeNull();
    }
  });

  it("leaves no mesh tagged with a deleted placement id once the run is emptied", () => {
    const removedIds = new Set(
      SEEDED_RECORDS.filter(isWallABase).map((record) => record.id),
    );
    expect(removedIds.size).toBeGreaterThan(0);

    const mounted = mountThrough(
      SEEDED_RECORDS,
      withoutWallABase(SEEDED_RECORDS),
    );

    const survivors: string[] = [];
    mounted.solidsRoot.traverse((node) => {
      const placementId = node.userData["placementId"] as string | undefined;
      if (placementId !== undefined && removedIds.has(placementId)) {
        survivors.push(placementId);
      }
    });
    expect(survivors).toEqual([]);
  });

  /** What makes the shallow name lookup safe. `findRunEndPanel` searches one level inside each root
   *  child, so a customer body that carried a direct child of this name would be seated instead of
   *  the shell's panel. No catalogue body does today, and this is the guard that says so. */
  it("builds no customer body that contains a node of the panel's name", () => {
    const mounted = mountThrough(SEEDED_RECORDS);

    for (const child of mounted.solidsRoot.children) {
      if (child.userData["placementId"] === undefined) continue;
      expect(
        panelsIn(child).map((node) => node.name),
        String(child.userData["placementId"]),
      ).toEqual([]);
    }
  });
});

// -------------------------------------------------------------------------------------------
// The derivation itself — sweeps and the awkward record shapes.
// -------------------------------------------------------------------------------------------

describe("the derivation over the range, not at a point", () => {
  it("tracks the right-most carcass edge at every shrink of it", () => {
    const rightMost = recordById(RIGHT_MOST_BASE_ID);

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }).map((mm) => mm / 1000),
        (shrinkM) => {
          const records = replaceRecord(
            SEEDED_RECORDS,
            narrowedFromTheRight(rightMost, shrinkM),
          );
          const panel = panelOf(mountThrough(records));

          const expectedEdgeM =
            rightMost.frame.x + rightMost.frame.w / 2 - shrinkM;
          expect(panel.position.x).toBeCloseTo(
            expectedEdgeM + PANEL_CENTRE_OFFSET_M,
            9,
          );
          expect(panel.visible).toBe(true);
        },
      ),
      { numRuns: 15 },
    );
  });

  /** The geometric half of the same claim, driven through the real `setWidth` command rather than
   *  a hand-edited frame: a resize rebuilds the body, and only the built body can say whether the
   *  panel still clears it. */
  it("keeps the authored 1 mm of air at every width the domain accepts", () => {
    const columns = deriveColumns(SEEDED_RECORDS);
    const accepted: number[] = [];

    for (const widthMm of RESIZE_SWEEP_MM) {
      const result = setWidth({
        design: KITCHEN_L_DESIGN,
        catalog: KITCHEN_L_BODY_CATALOG,
        columns,
        target: { kind: "placement", id: RIGHT_MOST_BASE_ID },
        widthMm,
        probe: createBodyProbe(kit, kit.builders["kitchen-l"]()),
        occurredAt: OCCURRED_AT,
      });
      if (!result.ok) continue;
      accepted.push(widthMm);

      const records = derivePlacementRecords(
        result.design,
        KITCHEN_L_BODY_CATALOG,
      );
      const mounted = mountThrough(records);
      const panelBox = worldBoxOf(mounted.solidsRoot, panelOf(mounted));
      const cabinetBox = worldBoxOf(
        mounted.solidsRoot,
        bodyWithPlacementId(mounted, RIGHT_MOST_BASE_ID),
      );

      expect(panelBox.intersectsBox(cabinetBox), `${String(widthMm)} mm`).toBe(
        false,
      );
      expect(
        panelBox.min.x - cabinetBox.max.x,
        `${String(widthMm)} mm`,
      ).toBeCloseTo(PANEL_INNER_FACE_GAP_M, 6);
    }

    // The domain refuses a growth here (`NO_EMPTY_SPACE`) and refuses 200/900 (`WIDTH_NOT_SUPPORTED`),
    // so what this sweep actually reaches is 300 mm to 550 mm. Pinned as a floor rather than as the
    // exact set: a policy change that legitimately opens another width must not turn this red, but
    // one that quietly narrows the sweep to a single example must.
    expect(Math.min(...accepted)).toBeLessThanOrEqual(300);
    expect(Math.max(...accepted)).toBeGreaterThanOrEqual(550);
    expect(accepted.length).toBeGreaterThanOrEqual(6);
  });

  /** The other half of "does a *fixed* 10 mm generalise": the widths above are all one rebuilt
   *  `base-3drawer`, so they say nothing about a differently built carcass closing the run. Walking
   *  the seeded run down from the right puts five distinct builders at its end in turn — a 600 mm
   *  drawer stack, a 600 mm hob base, a 600 mm dishwasher housing, an 800 mm sink base and the
   *  900 mm corner X-leg — and the panel must leave each of them the same authored millimetre. */
  it("leaves the same 1 mm whichever body is left closing the run", () => {
    const runFromTheRight = ["p4", "p2", "p1", "p0"] as const;
    const closerAfterEachRemoval = ["p2", "p1", "p0", "p25"] as const;

    let design: Design = KITCHEN_L_DESIGN;
    const measured: string[] = [];

    for (const [index, removedId] of runFromTheRight.entries()) {
      const result = removePlacement({
        design,
        catalog: KITCHEN_L_BODY_CATALOG,
        target: { kind: "placement", id: removedId },
        occurredAt: OCCURRED_AT,
      });
      if (!result.ok) {
        throw new Error(`Fixture could not remove ${removedId}`);
      }
      design = result.design;

      const closerId = required(closerAfterEachRemoval[index], "closer");
      const mounted = mountThrough(
        derivePlacementRecords(design, KITCHEN_L_BODY_CATALOG),
      );
      const panelBox = worldBoxOf(mounted.solidsRoot, panelOf(mounted));
      const closerBox = worldBoxOf(
        mounted.solidsRoot,
        bodyWithPlacementId(mounted, closerId),
      );

      expect(panelOf(mounted).visible, closerId).toBe(true);
      expect(panelBox.intersectsBox(closerBox), closerId).toBe(false);
      expect(panelBox.min.x - closerBox.max.x, closerId).toBeCloseTo(
        PANEL_INNER_FACE_GAP_M,
        6,
      );
      measured.push(closerId);
    }

    expect(measured).toEqual([...closerAfterEachRemoval]);
  });

  it("moves the panel in x alone — its seat, size and material never change", () => {
    const baseline = mountThrough(SEEDED_RECORDS);
    const baselinePanel = describeStructure(panelOf(baseline));

    const moved = mountThrough(
      replaceRecord(
        SEEDED_RECORDS,
        narrowedFromTheRight(recordById(RIGHT_MOST_BASE_ID), 0.2),
      ),
    );
    const movedPanel = describeStructure(panelOf(moved));

    expect({ ...movedPanel, position: baselinePanel.position }).toEqual(
      baselinePanel,
    );
    expect(movedPanel.position[1]).toBe(baselinePanel.position[1]);
    expect(movedPanel.position[2]).toBe(baselinePanel.position[2]);
    expect(movedPanel.position[0]).toBeCloseTo(
      baselinePanel.position[0] - 0.2,
      9,
    );
  });

  it("lets no record that is not a wall-A base placement extend the run", () => {
    const rightMost = recordById(RIGHT_MOST_BASE_ID);
    const seeded = panelOf(mountThrough(SEEDED_RECORDS)).position.x;
    const decoys: readonly PlacementRecord[] = [
      // A wall-B base placement standing far along its own wall.
      {
        ...rightMost,
        id: "decoy-wall-b",
        wall: "B",
        frame: { ...rightMost.frame, x: 9 },
      },
      // Wall A, but a band the panel does not close.
      {
        ...rightMost,
        id: "decoy-wall-band",
        band: "wall",
        frame: { ...rightMost.frame, x: 9 },
      },
      {
        ...rightMost,
        id: "decoy-column-band",
        band: "column",
        frame: { ...rightMost.frame, x: 9 },
      },
    ];

    for (const decoy of decoys) {
      const panel = panelOf(mountThrough([...SEEDED_RECORDS, decoy]));

      expect(panel.position.x, decoy.id).toBeCloseTo(seeded, 9);
      expect(panel.visible, decoy.id).toBe(true);
    }
  });

  /** ADR 0045's *"if possible"*, decided by the owner on 2026-09-01: a non-base body can never
   *  extend the run — the test above — but one standing **in the seat** hides the panel rather than
   *  being intersected by it. An earlier revision of this file pinned the opposite, that a non-base
   *  record is ignored outright; that was reviewed and overruled, because the panel would then be
   *  buried inside a column that stands where the run ends. Both halves are asserted here so the
   *  narrowness of the veto is visible: it costs the panel its seat, never the run its end. */
  it("hides the panel when a column stands in the seat it would take", () => {
    const rightMost = recordById(RIGHT_MOST_BASE_ID);
    const runEndM = rightMost.frame.x + rightMost.frame.w / 2;
    const columnOnTheSeat: PlacementRecord = {
      ...rightMost,
      id: "pantry-right-of-the-run",
      band: "column",
      heightMm: 2200,
      // Butted against the run's last cabinet, so the seat 10 mm past that edge falls inside it.
      frame: { ...rightMost.frame, x: runEndM + rightMost.frame.w / 2, h: 2.2 },
    };
    const overhead: PlacementRecord = {
      ...columnOnTheSeat,
      id: "wall-cabinet-above-the-seat",
      band: "wall",
      frame: { ...columnOnTheSeat.frame, y0: 1.5, h: 0.7 },
    };

    const blocked = panelOf(mountThrough([...SEEDED_RECORDS, columnOnTheSeat]));
    const clear = panelOf(mountThrough([...SEEDED_RECORDS, overhead]));

    expect(blocked.visible).toBe(false);
    // A body sharing the seat's along-wall line but hanging at 1500 mm is not in the way: the veto
    // is an intersection in both axes, not an along-wall exclusion zone.
    expect(clear.visible).toBe(true);
    expect(clear.position.x).toBeCloseTo(referenceSeatM, 9);
  });

  it("is deterministic when two base placements share a right edge", () => {
    const rightMost = recordById(RIGHT_MOST_BASE_ID);
    const twin: PlacementRecord = { ...rightMost, id: "twin" };
    const withTwin = [...SEEDED_RECORDS, twin];

    const forward = panelOf(mountThrough(withTwin)).position.x;
    const reversed = panelOf(mountThrough([...withTwin].reverse())).position.x;

    expect(forward).toBe(reversed);
    expect(forward).toBeCloseTo(referenceSeatM, 9);
  });

  it("still seats on a zero-width placement and on one at a negative x", () => {
    const rightMost = recordById(RIGHT_MOST_BASE_ID);
    const emptied = withoutWallABase(SEEDED_RECORDS);

    const zeroWidth: PlacementRecord = {
      ...rightMost,
      id: "zero-width",
      widthMm: 0,
      frame: { ...rightMost.frame, w: 0, x: 1.5 },
    };
    const negative: PlacementRecord = {
      ...rightMost,
      id: "negative-x",
      frame: { ...rightMost.frame, x: -1 },
    };

    expect(
      panelOf(mountThrough([...emptied, zeroWidth])).position.x,
    ).toBeCloseTo(1.5 + PANEL_CENTRE_OFFSET_M, 9);
    expect(
      panelOf(mountThrough([...emptied, negative])).position.x,
    ).toBeCloseTo(-1 + rightMost.frame.w / 2 + PANEL_CENTRE_OFFSET_M, 9);
    expect(panelOf(mountThrough([...emptied, negative])).visible).toBe(true);
  });
});
