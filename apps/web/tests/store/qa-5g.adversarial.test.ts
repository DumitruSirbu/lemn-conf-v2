// Adversarial QA for the store half of ADR 0052's cut at 800 mm, and the uncapped merge after it (8U plan §5).
//
// Three things are attacked here that the wave's own `empty-column-ceiling.test.ts` does not reach.
//
// **What actually gets saved.** The wave's criteria are written about the frozen map; what a share
// link carries is the *document* `projectEmptyColumns` writes from it. A design that saves today and
// stops saving after this wave is the blocker this wave can produce, so the property below asserts
// `validateDesignForCatalog` finds nothing after **every** command rather than asserting a width.
//
// **A hydrated wide column.** `resolveColumns` still runs `splitOversizedEmptyColumns` after every command, and the
// uncapped merge after it rejoins what it cuts; the case below pins that a hydrated wide space survives a command
// whole and still saves.
//
// **The reversal, on the observable set.** Criterion 5G-2 compares a reduced view of the map. The
// published `voids` are what the customer sees and what §5.1 selects against, so the round trip is
// asserted over those too.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  MAX_EMPTY_COLUMN_WIDTH_MM,
  validateDesignForCatalog,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";
const CATALOG = KITCHEN_L_BODY_CATALOG;

/** Wall B's fridge column and the wall unit over it: clearing both is what puts a 700 mm space
 *  beside the one resizable column in the kitchen. */
const FRIDGE_COLUMN_MEMBERS = ["p7", "p24"];
const PANTRY_ID = "p6";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

type Store = ReturnType<typeof createStore>;

function emptyColumnsOf(store: Store): readonly Column[] {
  const state = store.getState();
  const occupied = new Set(state.records.map((record) => record.col));
  return [...state.columns.values()]
    .filter((column) => !occupied.has(column.key))
    .sort((left, right) => left.z - right.z || left.x - right.x);
}

function widthMmOf(column: Column): number {
  return Math.round(column.w * 1000);
}

describe("what a command leaves behind is a document that still saves", () => {
  /** **The blocker this wave can produce, as a test.** ADR 0052 added a tenth refusal code to the
   *  seam every save passes through, so any command that leaves an empty column the new validator
   *  refuses turns a design the customer built into one they cannot store — worse than the bug the
   *  wave fixes, and invisible in a criterion written about the map.
   *
   *  Asserted over generated sequences and over the whole issue list, not over `widthMm`: a producer
   *  the wave missed would show up as *some* refusal, and naming only the cap would let a key
   *  collision the normalisation minted pass unnoticed. That collision is ADR 0052's own named risk.
   *
   *  The sequence asserts its own reach, because the seeded kitchen loads with **zero** empty
   *  columns and a run that never freed one would pass under every mutant. */
  it("holds over generated command sequences, and reaches a split state", () => {
    let splitStates = 0;
    let statesWithSpace = 0;
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom<Step>(
            "clear-fridge",
            "clear-fridge",
            "narrow-pantry",
            "narrow-pantry",
            "narrow-pantry",
            "widen-pantry",
            "fill-widest",
            "remove-any",
          ),
          { minLength: 8, maxLength: 16 },
        ),
        (steps) => {
          const store = createStore();
          for (const step of steps) {
            apply(store, step);
            const design = store.getState().design;
            expect(
              validateDesignForCatalog(design, CATALOG).map(
                (issue) => issue.code,
              ),
            ).toStrictEqual([]);
            const empties = emptyColumnsOf(store);
            if (empties.length > 0) statesWithSpace += 1;
            if (empties.length > 1) splitStates += 1;
          }
        },
      ),
      { numRuns: 40 },
    );

    expect(statesWithSpace).toBeGreaterThan(0);
    expect(splitStates).toBeGreaterThan(0);
  });
});

describe("a hydrated space wider than 800 mm stays one space through the next command", () => {
  /** A space has no width limit (8U plan §5) and the write seam no longer refuses one, so the rule is that the
   *  next command neither cuts it nor leaves a design the write seam refuses. */
  it("keeps a 1400 mm column carried in on a hydrated design whole through a delete, and the design still saves", () => {
    // A pared-down design, because the seeded kitchen leaves no free stretch of wall A wide enough
    // to record a 1400 mm space in: `p2` is kept as the one deletable body, and the space sits at
    // 300–1700 where nothing stands.
    const oversized: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.id === "p2",
      ),
      emptyColumns: [
        {
          wall: "A",
          alongMm: 1000,
          widthMm: 1400,
          y0Mm: 0,
          topMm: 2600,
          depthMm: 580,
        },
      ],
    };
    const store = createStore(oversized);
    // The loader does not split — `deriveColumns` merges and re-answers, nothing more.
    expect(
      emptyColumnsOf(store)
        .map(widthMmOf)
        .filter((mm) => mm > MAX_EMPTY_COLUMN_WIDTH_MM),
    ).toStrictEqual([1400]);

    tap(store, () => {
      store.getState().select({ kind: "placement", id: "p2" });
      store.getState().remove();
    });

    // And the design it wrote is one the write seam accepts.
    expect(
      validateDesignForCatalog(store.getState().design, CATALOG).map(
        (issue) => issue.code,
      ),
    ).toStrictEqual([]);
    // Every millimetre kept, as one column over 300–1700.
    const pieces = emptyColumnsOf(store).filter(
      (column) =>
        Math.round((column.x - column.w / 2) * 1000) >= 300 &&
        Math.round((column.x + column.w / 2) * 1000) <= 1700,
    );
    expect(pieces.map(widthMmOf)).toStrictEqual([1400]);
  });
});

describe("criterion 5G-2's round trip, on the set the customer can see", () => {
  /** The wave's own reversal case compares a reduced view of the map — `regions` collapsed to its
   *  lowest start, because `projectEmptyColumns` writes a frozen space as the one interval §4 reads.
   *  That reduction is correct and it is also where a difference could hide, so the same round trip
   *  is asserted here over the **published openings**: their column, geometry and count are what the
   *  scene draws and what §5.1 selects against.
   *
   *  Void ids are deliberately not compared. They are regenerated on every recompute (§5.1), so
   *  requiring them to come back would be asserting an implementation detail the product states it
   *  does not keep. */
  it("returns the openings to the ones the shrink split, and not before", () => {
    const store = clearFridgeColumn();
    const before = openingsOf(store);
    expect(before.length).toBeGreaterThan(0);

    setPantryWidth(store, 400);
    expect(openingsOf(store)).not.toStrictEqual(before);

    for (const widthMm of [450, 500, 550, 600]) setPantryWidth(store, widthMm);

    expect(openingsOf(store)).toStrictEqual(before);
  });

  /** Swept rather than sampled at the two ends: at every step back up the free run is one column, whether it is
   *  wider than 800 mm or not, and keeps every millimetre. */
  it("keeps the free run one column at every step back up, either side of 800 mm", () => {
    const store = clearFridgeColumn();
    setPantryWidth(store, 400);

    for (const widthMm of [450, 500, 550, 600]) {
      const freeRunMm = 900 - (widthMm - 400);
      setPantryWidth(store, widthMm);

      expect(emptyColumnsOf(store).length).toBe(1);
      expect(
        emptyColumnsOf(store).reduce(
          (sum, column) => sum + widthMmOf(column),
          0,
        ),
      ).toBe(freeRunMm);
    }
  });
});

/** The openings as the scene draws them, minus the ids §5.1 regenerates. */
function openingsOf(store: Store) {
  return store
    .getState()
    .voids.map((record) => ({
      col: record.col,
      w: Math.round(record.w * 1000),
      y0: Math.round(record.y0 * 1000),
      h: Math.round(record.h * 1000),
    }))
    .sort((left, right) =>
      left.col === right.col
        ? left.y0 - right.y0
        : left.col < right.col
          ? -1
          : 1,
    );
}

/** Every fixture tap fails loudly. A step that silently did nothing is how a criterion passes for
 *  the wrong reason, and this wave's plan names that as the trap to watch for. */
function tap(store: Store, run: () => void): void {
  run();
  const rejection = store.getState().lastRejection;
  if (rejection) throw new Error(`fixture tap refused: ${rejection.code}`);
}

function clearFridgeColumn(): Store {
  const store = createStore();
  for (const id of FRIDGE_COLUMN_MEMBERS) {
    tap(store, () => {
      store.getState().select({ kind: "placement", id });
      store.getState().remove();
    });
  }
  return store;
}

function setPantryWidth(store: Store, widthMm: number): void {
  tap(store, () => {
    store.getState().select({ kind: "placement", id: PANTRY_ID });
    store.getState().setWidth(widthMm);
  });
}

type Step =
  | "clear-fridge"
  | "narrow-pantry"
  | "widen-pantry"
  | "fill-widest"
  | "remove-any";

/** One generated step. **A refusal is a legal step** — a pantry at its floor and an opening no body
 *  fits both refuse from ordinary input — so the store's own rejection is left where it lands
 *  instead of throwing, and the assertion runs against the state either way. */
function apply(store: Store, step: Step): void {
  switch (step) {
    case "clear-fridge":
      removeFirst(store, FRIDGE_COLUMN_MEMBERS);
      return;
    case "remove-any":
      removeFirst(
        store,
        store.getState().records.map((record) => record.id),
      );
      return;
    case "narrow-pantry":
      resizePantry(store, -50);
      return;
    case "widen-pantry":
      resizePantry(store, 50);
      return;
    case "fill-widest":
      fillWidestOpening(store);
  }
}

function removeFirst(store: Store, ids: readonly string[]): void {
  for (const id of ids) {
    if (!store.getState().records.some((record) => record.id === id)) continue;
    store.getState().select({ kind: "placement", id });
    store.getState().remove();
    if (!store.getState().lastRejection) return;
  }
}

function resizePantry(store: Store, deltaMm: number): void {
  const pantry = store
    .getState()
    .records.find((record) => record.id === PANTRY_ID);
  if (!pantry) return;
  store.getState().select({ kind: "placement", id: PANTRY_ID });
  store.getState().setWidth(Math.round(pantry.frame.w * 1000) + deltaMm);
}

/** An insert into the widest opening, which is the one most likely to leave a remainder the ceiling
 *  has to cut — `splitColumn`'s arm of the wave. */
function fillWidestOpening(store: Store): void {
  const opening = [...store.getState().voids].sort(
    (left, right) => right.w - left.w,
  )[0];
  if (!opening) return;
  store.getState().select({ kind: "void", id: opening.id });
  store.getState().insert("base-bottle-cargo");
}
