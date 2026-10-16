// ADR 0046 part 2, store half, at the seam that decides whether any of it is real.
//
// `resolveColumns` is where a command's map reaches the state, and the merge has to wrap **the whole
// return value**, the `body_inserted` arm included: an insert's remainder wider than 800 mm arrives there cut at
// 800, and only the merge on that arm makes it one space again (8U plan §10 criterion 8).
//
// It is also the only place criterion 11 can be asked: what `projectEmptyColumns` writes into the
// document is decided by which map is canonical, and this wave's answer is the merged one.
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

/** ADR 0037's withdrawal scenario, by column and by member: the 800 mm sink column and the 600 mm
 *  dishwasher column beside it, spanning 900–1700 and 1700–2300. */
const SINK_COLUMN_KEY = "A|1.30";
const SINK_COLUMN_MEMBERS = ["p0", "p11", "p17"];
const DISHWASHER_COLUMN_KEY = "A|2.00";
const DISHWASHER_COLUMN_MEMBERS = ["p1", "p12", "p18"];

/** Where the headline route lands: a 600 mm dishwasher seated flush left at 900–1500 (5B4a), the 200 mm
 *  remainder it leaves at 1500–1700, and the 800 mm column that remainder and the cleared 600 become. */
const OCCUPIED_KEY = "A|1.20";
const MERGED_KEY = "A|1.90";
const MERGED_WIDTH_MM = 800;

/** The sink and dishwasher columns cleared together: one space at 900–2300. */
const JOINED_KEY = "A|1.60";

/** The hob column beside them (2300–2900), so the three cleared leave 900–2900; an insert's 1400 remainder at
 *  1500–2900 keys `A|2.20`, and its 800 mm cut piece would key `A|1.90`, where the cleared run's own key also is. */
const HOB_COLUMN_MEMBERS = ["p2", "p13", "p19"];
const CLEARED_RUN_KEY = "A|1.90";
const REMAINDER_KEY = "A|2.20";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

type Store = ReturnType<typeof createStore>;

function reload(store: Store): Store {
  const wire: unknown = JSON.parse(JSON.stringify(store.getState().design));
  return createStore(DesignSchema.parse(wire));
}

/** Both columns cleared: six taps, and one 1400 mm space at 900–2300. */
function clearBothColumns(): Store {
  return removeAll(createStore(), [
    ...SINK_COLUMN_MEMBERS,
    ...DISHWASHER_COLUMN_MEMBERS,
  ]);
}

/** The headline route: the sink column cleared, a dishwasher into it (leaving the 200 mm remainder at 1500–1700),
 *  then the dishwasher column beside it cleared. The dishwasher goes in first because the two cleared columns would
 *  otherwise already be one 1400. */
function remainderBesideAClearedColumn(): Store {
  const store = fill(
    removeAll(createStore(), SINK_COLUMN_MEMBERS),
    SINK_COLUMN_KEY,
    "base-dishwasher",
  );
  return removeAll(store, DISHWASHER_COLUMN_MEMBERS);
}

function removeAll(store: Store, ids: readonly string[]): Store {
  for (const id of ids) {
    store.getState().select({ kind: "placement", id });
    store.getState().remove();
    if (store.getState().lastRejection) {
      throw new Error(
        `Could not remove ${id}: ${store.getState().lastRejection?.code ?? ""}`,
      );
    }
  }
  return store;
}

/** One insert into the base opening of `key`, failing loudly rather than leaving the store
 *  unchanged — a fixture step that silently did nothing is how a criterion passes for the wrong
 *  reason. */
function fill(store: Store, key: string, buildId: string): Store {
  const opening = store
    .getState()
    .voids.find((record) => record.col === key && record.y0 < 0.01);
  if (!opening) {
    throw new Error(
      `No base opening in ${key}; have ${store
        .getState()
        .voids.map((record) => record.col)
        .join(", ")}`,
    );
  }
  store.getState().select({ kind: "void", id: opening.id });
  store.getState().insert(buildId);
  if (store.getState().lastRejection) {
    throw new Error(
      `Insert of ${buildId} was refused: ${store.getState().lastRejection?.code ?? ""}`,
    );
  }
  return store;
}

function widthMmOf(columns: ReadonlyMap<string, Column>, key: string): number {
  const column = columns.get(key);
  if (!column)
    throw new Error(`No column ${key}; have ${[...columns.keys()].join(", ")}`);
  return Math.round(column.w * 1000);
}

describe("the store merges the columns a command leaves adjacent", () => {
  // ADR 0037 was withdrawn because this 1400 mm space refused every `'fit'` cabinet. It is one column again
  // (8U plan §5), and the assertion is the symptom gone: an 800 mm cabinet enters it.
  it("joins the cleared 800 and 600 into one 1400 mm column that an 800 mm cabinet enters", () => {
    const store = clearBothColumns();

    const { columns } = store.getState();
    expect(widthMmOf(columns, JOINED_KEY)).toBe(1400);
    expect(columns.has(SINK_COLUMN_KEY)).toBe(false);
    expect(columns.has(DISHWASHER_COLUMN_KEY)).toBe(false);

    fill(store, JOINED_KEY, "base-cabinet");

    expect(store.getState().design.placements.at(-1)?.body.widthMm).toBe(800);
  });

  // Criterion 12, the headline, end to end: the split remainder and the column beside it become one
  // 800 mm space, and **the assertion is a second insert succeeding at 800 mm** — never a void
  // merely existing, which is the state ADR 0037's withdrawal was about.
  it("turns a split remainder and its neighbour into one 800 mm column that takes a body", () => {
    const store = remainderBesideAClearedColumn();

    const { columns } = store.getState();
    expect(widthMmOf(columns, MERGED_KEY)).toBe(MERGED_WIDTH_MM);
    expect(columns.has(DISHWASHER_COLUMN_KEY)).toBe(false);
    expect(widthMmOf(columns, OCCUPIED_KEY)).toBe(600);

    fill(store, MERGED_KEY, "base-cabinet");

    expect(store.getState().design.placements.at(-1)?.body.widthMm).toBe(
      MERGED_WIDTH_MM,
    );
  });

  // The `body_inserted` arm: a dishwasher into the 2000 mm the three cleared columns leave keeps 600 at 900–1500,
  // and `splitColumn` cuts the 1400 remainder at 800. Merge every arm but this one and it stays 800 + 600.
  it("rejoins the remainder an insert cuts at 800 mm into one 1400 mm column on the insert's own arm", () => {
    const store = fill(
      removeAll(createStore(), [
        ...SINK_COLUMN_MEMBERS,
        ...DISHWASHER_COLUMN_MEMBERS,
        ...HOB_COLUMN_MEMBERS,
      ]),
      CLEARED_RUN_KEY,
      "base-dishwasher",
    );

    const { columns } = store.getState();
    expect(widthMmOf(columns, OCCUPIED_KEY)).toBe(600);
    expect(widthMmOf(columns, REMAINDER_KEY)).toBe(1400);
    expect(columns.has(CLEARED_RUN_KEY)).toBe(false);
  });
});

describe("a delete that triggers a merge still selects the space it freed", () => {
  /** The seeded hob column: 600 mm at 2300–2900, three members, and the one column a delete can
   *  make mergeable in five taps. */
  const HOB_COLUMN_KEY = "A|2.60";

  // §5.1's last step, and the criterion this wave shipped without. `findVacatedVoid` matched on the
  // removed body's own column key, and the merge **deletes that key**: clear the hob column, insert
  // a 300 mm bottle cargo (5B4a splits it into an occupied 2300–2600 and a 300 mm remainder), delete
  // the body again, and the two halves merge back into `A|2.60` under a key the removed body was
  // never filed under. The selection came back `null` where the customer had just freed the space —
  // and no existing §5.1 test could see it, because a seeded delete alone never merges.
  it("selects the merged opening, not nothing, after the delete that merges", () => {
    const store = createStore();
    for (const id of HOB_COLUMN_MEMBERS) {
      store.getState().select({ kind: "placement", id });
      store.getState().remove();
    }
    fill(store, HOB_COLUMN_KEY, "base-bottle-cargo");
    const inserted = store.getState().design.placements.at(-1)?.id ?? "";

    store.getState().select({ kind: "placement", id: inserted });
    store.getState().remove();

    const { selection, voids, columns } = store.getState();
    expect(widthMmOf(columns, HOB_COLUMN_KEY)).toBe(600);
    expect(selection?.kind).toBe("void");
    const selected = voids.find((record) => record.id === selection?.id);
    expect(selected?.col).toBe(HOB_COLUMN_KEY);
    expect(selected?.y0).toBeLessThan(0.01);
  });
});

describe("the document carries the merged column, and a reload rebuilds it", () => {
  // Criterion 11, the projection decision this wave took: the canonical map is the **merged** one,
  // so the document holds one entry for the merged column and none for its parts. Project from a
  // pre-merge map and this is two entries.
  it("records one empty column for the merged space and none for its parts", () => {
    const store = remainderBesideAClearedColumn();

    const spaces = store.getState().design.emptyColumns ?? [];

    expect(spaces).toEqual([
      {
        wall: "A",
        alongMm: 1900,
        widthMm: MERGED_WIDTH_MM,
        y0Mm: 0,
        topMm: 2600,
        depthMm: 620,
        // ADR 0073 decision 8: the merged entry carries the **template's** source, and the template
        // is the shallowest member — the same extent that supplied `depthMm` above, so the depth and
        // the body it came from stay one answer. Both parts froze at 620 here and the sink column is
        // the one the envelope took, so no new choice was made.
        depthFromBuildId: "base-sink-800",
      },
    ]);
  });

  // The other half of criterion 11, and the reason post-merge projection is safe: the merged column
  // is a fixpoint, so a document written under this cap restores as the same column rather than as
  // something the load seam merges again into a different one.
  it("restores the merged column field for field", () => {
    const session = remainderBesideAClearedColumn();

    const restored = reload(session);

    expect(observableOf(restored.getState().columns, MERGED_KEY)).toBe(
      observableOf(session.getState().columns, MERGED_KEY),
    );
    expect(
      restored.getState().voids.filter((v) => v.col === MERGED_KEY),
    ).not.toHaveLength(0);
  });
});

/** What a restored column has to reproduce, as one string per key — ADR 0044's 5B2a note: `min
 *  (regions)` rather than deep region equality, because a column cleared of stacked bodies is
 *  several intervals in session and one restored, and `deriveFreeSpans` reads only the lowest start
 *  and the top. */
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
