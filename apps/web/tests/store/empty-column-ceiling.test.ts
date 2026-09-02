// M5 wave 5G, store half — ADR 0052: 800 mm is the ceiling on any empty column.
//
// Here rather than in the domain because the round trip is a property of `resolveColumns`, which is
// the store's: the split is written by the width command, and the *reversal* is written by the merge
// that runs after every command. Neither half is visible from a single domain call.
//
// **The seeded kitchen loads with zero empty columns**, so every case below states its own taps. A
// criterion a fresh load satisfies is not a criterion.
import {
  DesignSchema,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  MAX_EMPTY_COLUMN_WIDTH_MM,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeBodyProbe } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

/** Wall B's fridge column (`B|2.45`) and the wall unit over it — 700 mm at 2100–2800, and the only
 *  run on that wall wide enough to leave a span the ceiling has to cut. */
const FRIDGE_COLUMN_MEMBERS = ["p7", "p24"];

/** The pantry beside it: 600 mm at 1500–2100, and the one resizable column in the kitchen (wave
 *  5B8). `p6` is what the shrink is applied to. */
const PANTRY_ID = "p6";

/** The 900 mm the shrink frees — 1900 to 2800 — as the two columns ADR 0052 allows. The near piece
 *  takes the ceiling and sits against the pantry; the overflow lands beyond it. */
const NEAR_KEY = "B|2.30";
const OVERFLOW_KEY = "B|2.75";
const OVERFLOW_WIDTH_MM = 100;

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    now: () => OCCURRED_AT,
    bodyProbe: createFakeBodyProbe(),
  });
}

type Store = ReturnType<typeof createStore>;

/** A reload through the wire, which is the only thing that proves a state survives: the document is
 *  serialised, parsed by the schema and loaded into a fresh store. */
function reload(store: Store): Store {
  const wire: unknown = JSON.parse(JSON.stringify(store.getState().design));
  return createStore(DesignSchema.parse(wire));
}

/** Every tap fails loudly. A fixture step that silently did nothing is how a criterion passes for
 *  the wrong reason, and this wave's plan names that as the trap to watch for. */
function tap(store: Store, run: () => void, what: string): void {
  run();
  const rejection = store.getState().lastRejection;
  if (rejection) throw new Error(`${what} was refused: ${rejection.code}`);
}

/** Tap one: the fridge column cleared, which is what puts a 700 mm empty column on wall B. */
function clearFridgeColumn(): Store {
  const store = createStore();
  for (const id of FRIDGE_COLUMN_MEMBERS) {
    tap(
      store,
      () => {
        store.getState().select({ kind: "placement", id });
        store.getState().remove();
      },
      `removing ${id}`,
    );
  }
  return store;
}

function setPantryWidth(store: Store, widthMm: number): void {
  tap(
    store,
    () => {
      store.getState().select({ kind: "placement", id: PANTRY_ID });
      store.getState().setWidth(widthMm);
    },
    `setting ${PANTRY_ID} to ${String(widthMm)} mm`,
  );
}

/** The map's member-less columns, which is the set ADR 0052 bounds — an occupied column's width is
 *  its members' and it publishes no opening of its own. */
function emptyColumnsOf(store: Store): readonly Column[] {
  const state = store.getState();
  const occupied = new Set(state.records.map((record) => record.col));
  return [...state.columns.values()]
    .filter((column) => !occupied.has(column.key))
    .sort((left, right) => left.z - right.z);
}

function widthMmOf(column: Column | undefined): number | undefined {
  return column === undefined ? undefined : Math.round(column.w * 1000);
}

/** A column as the reload can reproduce it, which is the only sense in which two maps can be "the
 *  same" across the wire. `regions` is deliberately reduced to its lowest start: `projectEmptyColumns`
 *  writes a frozen empty extent as the **one** interval §4 reads — its floor and its top — and the
 *  intervals between belonged to bodies the space no longer holds (ADR 0044). Comparing the raw
 *  array would be asserting that a cleared column remembers how many cabinets used to stand in it,
 *  which is neither true nor wanted. */
function restorableFactsOf(column: Column) {
  return {
    key: column.key,
    wall: column.wall,
    x: column.x,
    z: column.z,
    w: column.w,
    d: column.d,
    top: column.top,
    floor: Math.min(...column.regions.map(([start]) => start)),
  };
}

describe("a shrink that frees more than the ceiling splits rather than refusing", () => {
  /** Criterion 5G-1. Before this wave the neighbour absorbed all 900 mm, that column survived the
   *  reload (wave 5B2) and it published an opening every `widthFlex: 'fit'` body refused as
   *  `WIDTH_NOT_SUPPORTED`.
   *
   *  **The shrink still succeeds.** Refusing it would contradict ADR 0037's live ruling — the owner
   *  was asked on 2026-08-28 whether to refuse the move that leaves an unfillable span and answered
   *  *"ok to have empty space left"* — so what changes is the decomposition of the space and never
   *  the space. */
  it("leaves two member-less columns, 800 and 100, spanning the same 900 mm", () => {
    const store = clearFridgeColumn();
    const freeSpanBefore = emptyColumnsOf(store)[0];
    expect(widthMmOf(freeSpanBefore)).toBe(700);

    setPantryWidth(store, 400);

    const empties = emptyColumnsOf(store);
    expect(empties.map((column) => column.key)).toStrictEqual([
      NEAR_KEY,
      OVERFLOW_KEY,
    ]);
    expect(empties.map(widthMmOf)).toStrictEqual([
      MAX_EMPTY_COLUMN_WIDTH_MM,
      OVERFLOW_WIDTH_MM,
    ]);
    // Not one assertion about the pair but two about the union: the outer edges are the pantry's new
    // right edge and the fridge column's old right edge, and the total is what the shrink freed.
    // Splitting keeps every millimetre — clamping would silently delete wall, which ADR 0052
    // rejected by name.
    const edges = empties.map((column) => ({
      left: Math.round((column.z - column.w / 2) * 1000),
      right: Math.round((column.z + column.w / 2) * 1000),
    }));
    expect(edges[0]?.left).toBe(1900);
    expect(edges[edges.length - 1]?.right).toBe(2800);
    expect(edges[0]?.right).toBe(edges[1]?.left);
    expect(
      empties.reduce((sum, column) => sum + (widthMmOf(column) ?? 0), 0),
    ).toBe(900);
  });

  /** Criterion 5G-5. The split pair is two ordinary entries, so it round-trips like any other — and
   *  it has to, because since wave 5B2 what the map holds after a command is what a share link
   *  hands the next reader. */
  it("round-trips the split pair through the wire unchanged", () => {
    const store = clearFridgeColumn();
    setPantryWidth(store, 400);

    const reloaded = reload(store);

    expect(emptyColumnsOf(reloaded).map(restorableFactsOf)).toStrictEqual(
      emptyColumnsOf(store).map(restorableFactsOf),
    );
    expect(
      reloaded.getState().voids.map((record) => ({
        col: record.col,
        w: record.w,
        y0: record.y0,
      })),
    ).toStrictEqual(
      store.getState().voids.map((record) => ({
        col: record.col,
        w: record.w,
        y0: record.y0,
      })),
    );
  });
});

describe("the split is reversible, which is what stops it ratcheting", () => {
  /** **Criterion 5G-2, the anti-ratchet criterion.** 800 + anything exceeds the ceiling, so the pair
   *  can never re-merge as it stands — and that would be a one-way door if stepping back up did not
   *  undo it. It does: each `+50` consumes the near column, and the first press that brings the run
   *  under the ceiling lets `mergeAdjacentEmptyColumns` put the space back as one column.
   *
   *  Asserted as map equality against the state before the shrink, not as a width: the key, the
   *  centre, the depth, the top and the frozen region all have to come back, because a column that
   *  merely measures 700 mm at a different key is a different space. */
  it("returns the map to the single column the shrink split", () => {
    const store = clearFridgeColumn();
    const before = emptyColumnsOf(store).map(restorableFactsOf);

    setPantryWidth(store, 400);
    expect(emptyColumnsOf(store)).toHaveLength(2);
    for (const widthMm of [450, 500, 550, 600]) setPantryWidth(store, widthMm);

    expect(emptyColumnsOf(store).map(restorableFactsOf)).toStrictEqual(before);
  });

  /** The intermediate states, stated so the round trip above is not read as an atomic undo: the
   *  first `+50` leaves 750 + 100, which is 850 and still over the ceiling, so the pair stays two
   *  columns. Only the second press brings the run under it. A merge that fired early would be
   *  merging past the cap. */
  it("holds the pair apart until the run fits under the ceiling again", () => {
    const store = clearFridgeColumn();
    setPantryWidth(store, 400);

    setPantryWidth(store, 450);
    expect(emptyColumnsOf(store).map(widthMmOf)).toStrictEqual([750, 100]);

    setPantryWidth(store, 500);
    expect(emptyColumnsOf(store).map(widthMmOf)).toStrictEqual([800]);
  });
});
