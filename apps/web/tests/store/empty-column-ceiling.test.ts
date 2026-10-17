// A shrink that frees more than 800 mm, through the store. The width command still cuts the freed span at 800
// (ADR 0052) and the uncapped merge that runs after every command makes it one space again (8U plan §5).
//
// Here rather than in the domain because the round trip is a property of `resolveColumns`, which is the store's:
// the cut is written by the width command and the join by the merge after it. Neither half is visible from a
// single domain call.
//
// **The seeded kitchen loads with zero empty columns**, so every case below states its own taps. A
// criterion a fresh load satisfies is not a criterion.
import {
  buildKitchenLBodyCatalog,
  DesignSchema,
  KITCHEN_L_DESIGN,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

/** Wall B's fridge column (`B|2.45`) and the wall unit over it — 700 mm at 2100–2800, and the only
 *  run on that wall wide enough to leave a span the ceiling has to cut. */
const FRIDGE_COLUMN_MEMBERS = ["p7", "p24"];

/** The pantry beside it: 600 mm at 1500–2100, and the one resizable column in the kitchen (wave
 *  5B8). `p6` is what the shrink is applied to. */
const PANTRY_ID = "p6";

/** The 900 mm the shrink frees — 1900 to 2800 — as the one column it is. */
const FREED_SPACE_KEY = "B|2.35";
const FREED_SPACE_WIDTH_MM = 900;

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
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

/** The map's member-less columns — an occupied column's width is its members' and it publishes no opening of
 *  its own. */
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

describe("a shrink that frees more than 800 mm leaves one space rather than refusing (8U criterion 11, E9)", () => {
  /** **The shrink still succeeds.** Refusing it would contradict ADR 0037's live ruling — the owner was asked on
   *  2026-08-28 whether to refuse the move that leaves an unfillable span and answered *"ok to have empty space
   *  left"*. A space has no width limit (8U plan §5), so the 900 mm freed is one column, with no seam where the
   *  command's own cut at 800 fell. */
  it("leaves one 900 mm member-less column over 1900-2800", () => {
    const store = clearFridgeColumn();
    const freeSpanBefore = emptyColumnsOf(store)[0];
    expect(widthMmOf(freeSpanBefore)).toBe(700);

    setPantryWidth(store, 400);

    const empties = emptyColumnsOf(store);
    expect(empties.map((column) => column.key)).toStrictEqual([
      FREED_SPACE_KEY,
    ]);
    expect(empties.map(widthMmOf)).toStrictEqual([FREED_SPACE_WIDTH_MM]);
    // The outer edges are the pantry's new right edge and the fridge column's old right edge: every millimetre
    // the shrink freed, none deleted.
    const [freed] = empties;
    if (!freed) throw new Error("no member-less column after the shrink");
    expect(Math.round((freed.z - freed.w / 2) * 1000)).toBe(1900);
    expect(Math.round((freed.z + freed.w / 2) * 1000)).toBe(2800);
  });

  /** What the map holds after a command is what a share link hands the next reader. */
  it("round-trips the freed space through the wire unchanged", () => {
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

describe("stepping back up returns the space the shrink took, which is what stops it ratcheting", () => {
  /** Asserted as map equality against the state before the shrink, not as a width: the key, the centre, the
   *  depth, the top and the frozen region all have to come back, because a column that merely measures 700 mm at a
   *  different key is a different space. */
  it("returns the map to the column it held before the shrink", () => {
    const store = clearFridgeColumn();
    const before = emptyColumnsOf(store).map(restorableFactsOf);

    setPantryWidth(store, 400);
    expect(emptyColumnsOf(store)).toHaveLength(1);
    for (const widthMm of [450, 500, 550, 600]) setPantryWidth(store, widthMm);

    expect(emptyColumnsOf(store).map(restorableFactsOf)).toStrictEqual(before);
  });

  /** The intermediate states, so the round trip above is not read as an atomic undo: each `+50` takes 50 mm off
   *  the one space, which never splits on the way back. */
  it("keeps the freed space one column at every step back up: 850, then 800", () => {
    const store = clearFridgeColumn();
    setPantryWidth(store, 400);

    setPantryWidth(store, 450);
    expect(emptyColumnsOf(store).map(widthMmOf)).toStrictEqual([850]);

    setPantryWidth(store, 500);
    expect(emptyColumnsOf(store).map(widthMmOf)).toStrictEqual([800]);
  });
});
