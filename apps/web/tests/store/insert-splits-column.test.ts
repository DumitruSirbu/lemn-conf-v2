// M5B wave 5B4a, store half — ADR 0046 part 1 at the seam that decides whether any of it is real.
//
// `resolveColumns` replaced the frozen map for a resize and for nothing else. Leave the
// `body_inserted` arm out and the effect's split map is discarded: the store goes on holding the
// original wide column, the level closes exactly as it did before the split existed, and **every
// domain test of this wave still passes**. That is why these two criteria live here and not beside
// the arithmetic.
import {
  buildKitchenLBodyCatalog,
  DesignSchema,
  KITCHEN_L_DESIGN,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeBodyProbe } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

/** The seeded hob column: 600 mm wide, centred at 2.60 m, three members, `top` 2.6 m. Clearing it
 *  is the first three of the four taps. */
const HOB_COLUMN_KEY = "A|2.60";
const HOB_COLUMN_MEMBERS = ["p2", "p13", "p19"];

/** Where a 300 mm bottle cargo and the 300 mm it leaves behind land, once the body is seated flush
 *  against the column's left edge (ADR 0046). */
const OCCUPIED_KEY = "A|2.45";
const REMAINDER_KEY = "A|2.75";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    bodyProbe: createFakeBodyProbe(),
  });
}

type Store = ReturnType<typeof createStore>;

/** A reload, spelled out: the design as the database would hand it back, in a store that has never
 *  seen the session that produced it. */
function reload(store: Store): Store {
  const wire: unknown = JSON.parse(JSON.stringify(store.getState().design));
  return createStore(DesignSchema.parse(wire));
}

/** The four-tap case, up to the fourth tap: the hob column cleared, then a bottle cargo into the
 *  base opening it left. */
function clearedThenFilled(buildId = "base-bottle-cargo"): Store {
  const store = createStore();
  for (const id of HOB_COLUMN_MEMBERS) {
    store.getState().select({ kind: "placement", id });
    store.getState().remove();
  }
  const opening = store
    .getState()
    .voids.find((record) => record.col === HOB_COLUMN_KEY && record.y0 < 0.01);
  if (!opening)
    throw new Error("The cleared hob column published no base opening");
  store.getState().select({ kind: "void", id: opening.id });
  store.getState().insert(buildId);
  if (store.getState().lastRejection) {
    throw new Error(
      `The insert was refused: ${store.getState().lastRejection?.code ?? ""}`,
    );
  }
  return store;
}

function widthMmOf(columns: ReadonlyMap<string, Column>, key: string): number {
  const column = columns.get(key);
  if (!column) {
    throw new Error(`No column ${key}; have ${[...columns.keys()].join(", ")}`);
  }
  return Math.round(column.w * 1000);
}

describe("the store holds the map the insert published", () => {
  // Criterion 9. The split is only real if `resolveColumns` takes the effect's map: the original key
  // must be gone from the state the store holds, and both halves present at their own widths.
  it("replaces the frozen map with the split the command planned", () => {
    const store = clearedThenFilled();
    const { columns } = store.getState();

    expect(columns.has(HOB_COLUMN_KEY)).toBe(false);
    expect(widthMmOf(columns, OCCUPIED_KEY)).toBe(300);
    expect(widthMmOf(columns, REMAINDER_KEY)).toBe(300);
  });

  // The same seam read the way the customer meets it: the remainder is an opening that can be
  // selected and filled. Without the arm the state has one wide column with a body in it and the
  // level is closed, which is the defect ADR 0037 withdrew over.
  it("publishes the remainder as an opening a second insert can fill", () => {
    const store = clearedThenFilled();
    const remainder = store
      .getState()
      .voids.find((record) => record.col === REMAINDER_KEY && record.y0 < 0.01);
    expect(remainder).toBeDefined();
    if (!remainder) return;

    store.getState().select({ kind: "void", id: remainder.id });
    store.getState().insert("base-bottle-cargo");

    expect(store.getState().lastRejection).toBeNull();
  });
});

describe("the split survives the wire", () => {
  // Criterion 10, and since ADR 0053 it is total. The **remainder** must come back field for field,
  // and so must the occupied half: a body shorter than its column's frozen `top` leaves an extent no
  // placement implies, which was backlog 22's shape and is now what `columnExtents` records. The
  // fixture is the cleared 2600 mm column with an 820 mm body precisely so the occupied half is a
  // column that diverged before this record — a body as tall as its column would make this pass
  // under every mutant.
  it("reproduces both halves of the split exactly", () => {
    const session = clearedThenFilled();
    const restored = reload(session);

    const sessionColumns = session.getState().columns;
    const restoredColumns = restored.getState().columns;
    const diverging = [...sessionColumns.keys()].filter(
      (key) =>
        observableOf(sessionColumns, key) !==
        observableOf(restoredColumns, key),
    );

    expect(observableOf(restoredColumns, REMAINDER_KEY)).toBe(
      observableOf(sessionColumns, REMAINDER_KEY),
    );
    expect(observableOf(restoredColumns, OCCUPIED_KEY)).toBe(
      observableOf(sessionColumns, OCCUPIED_KEY),
    );
    expect(diverging).toEqual([]);
  });
});

/** What a restored column has to reproduce, as one string per key. `min(regions)` rather than deep
 *  region equality: ADR 0044 stores one interval per empty column, so a column cleared of several
 *  stacked bodies is several intervals in session and one restored — two spellings of the same free
 *  space, and `deriveFreeSpans` reads only the lowest start and the top. */
function observableOf(
  columns: ReadonlyMap<string, Column>,
  key: string,
): string {
  const column = columns.get(key);
  if (!column) return `absent:${key}`;
  return JSON.stringify({
    key: column.key,
    wall: column.wall,
    x: column.x.toFixed(4),
    z: column.z.toFixed(4),
    w: column.w.toFixed(4),
    d: column.d.toFixed(4),
    ry: column.ry.toFixed(4),
    top: column.top.toFixed(4),
    floor: Math.min(...column.regions.map(([start]) => start)).toFixed(4),
  });
}
