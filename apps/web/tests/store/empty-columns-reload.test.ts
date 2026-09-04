// M5B wave 5B2b, the store half of ADR 0044: what the customer left behind is still there after a
// reload.
//
// Every case here goes through the wire — `DesignSchema.parse(JSON.parse(JSON.stringify(design)))`
// — and then builds a **fresh store** from what came back, because that is what a reload is.
// Comparing against the in-memory design would skip the schema, and a field that cannot survive
// serialisation would pass.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  DesignSchema,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  validateDesignForCatalog,
  type Column,
  type Design,
  type VoidRecord,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import { LEGACY_ENUM_FINISHES } from "@lemnaria/configurator-domain";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

type Store = ReturnType<typeof createStore>;

/** A reload, spelled out: the design as the database would hand it back, in a store that has never
 *  seen the session that produced it. */
function reload(store: Store): Store {
  const wire: unknown = JSON.parse(JSON.stringify(store.getState().design));
  return createStore(DesignSchema.parse(wire));
}

function removeById(store: Store, placementId: string): void {
  store.getState().select({ kind: "placement", id: placementId });
  store.getState().remove();
}

function resizeTo(store: Store, placementId: string, widthMm: number): void {
  store.getState().select({ kind: "placement", id: placementId });
  store.getState().setWidth(widthMm);
}

/**
 * What a restored column has to reproduce, and no more.
 *
 * Not deep `regions` equality: ADR 0044's wire shape stores one interval per empty column, so a
 * column cleared of two stacked bodies is `[[0,0.82],[1.5,2.2]]` in session and `[[0,2.6]]`
 * restored — two spellings of the same free space. `deriveFreeSpans` reads the lowest start and the
 * top, and `resolveSnapY0M` reads region starts only below a floor it already stands on, so the
 * lowest start and the top are the whole of what any consumer can tell apart.
 */
function observableColumns(columns: ReadonlyMap<string, Column>) {
  return [...columns.values()]
    .map((column) => ({
      key: column.key,
      wall: column.wall,
      xMm: inMillimetres(column.x),
      zMm: inMillimetres(column.z),
      wMm: inMillimetres(column.w),
      dMm: inMillimetres(column.d),
      ry: column.ry,
      topMm: inMillimetres(column.top),
      floorMm: inMillimetres(Math.min(...column.regions.map(([s]) => s))),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

/** Compared in whole millimetres, which is the resolution the document has: a wall column's depth
 *  is 0.291 + 0.039 in session and `toMetres(330)` restored, equal to 4 × 10⁻¹⁷ m and not equal as
 *  doubles. A perturbation this wave could plausibly introduce is a millimetre or more — the wire
 *  cannot express anything finer — so millimetres are the comparison, not a looser one. */
function inMillimetres(valueM: number): number {
  return Math.round(valueM * 1000);
}

/** Void ids are derived from the column key and the slice, so two derivations of one state produce
 *  the same ids — but not necessarily in the same order, since `recomputeVoids` walks the column
 *  map and a session's map is in the order the commands touched it. */
function sortedVoids(voids: readonly VoidRecord[]) {
  return [...voids]
    .map((record) => ({
      id: record.id,
      col: record.col,
      wall: record.wall,
      ry: record.ry,
      xMm: inMillimetres(record.x),
      zMm: inMillimetres(record.z),
      wMm: inMillimetres(record.w),
      dMm: inMillimetres(record.d),
      y0Mm: inMillimetres(record.y0),
      hMm: inMillimetres(record.h),
      spanY0Mm: inMillimetres(record.spanY0),
      spanHMm: inMillimetres(record.spanH),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function emptyColumnsOf(store: Store): Column[] {
  const occupied = new Set(
    store.getState().records.map((record) => record.col),
  );
  return [...store.getState().columns.values()].filter(
    (column) => !occupied.has(column.key),
  );
}

function onlyEmptyColumn(store: Store): Column {
  const [column, ...rest] = emptyColumnsOf(store);
  if (!column || rest.length > 0) {
    throw new Error(
      `expected exactly one empty column, found ${String(emptyColumnsOf(store).length)}`,
    );
  }
  return column;
}

function placementById(design: Design, placementId: string) {
  const placement = design.placements.find((entry) => entry.id === placementId);
  if (!placement) throw new Error(`no placement ${placementId}`);
  return placement;
}

/** The base run at 3200 on wall A: `p4` with the wall unit and the top box above it, the column
 *  ADR 0044's own 600 → 450 example is measured on. */
const RESIZED_PLACEMENT_ID = "p4";
const SHRUNK_WIDTH_MM = 450;
const REGROWN_WIDTH_MM = 500;

describe("criterion 1 — a shrink's leftover strip survives the reload", () => {
  it("restores the strip at the same centre in millimetres, and grows from it", () => {
    const session = createStore();
    resizeTo(session, RESIZED_PLACEMENT_ID, SHRUNK_WIDTH_MM);
    const inSession = onlyEmptyColumn(session);

    const reloaded = reload(session);

    const restored = onlyEmptyColumn(reloaded);
    // Asserted as numbers rather than as presence: a projection that emitted the entry at the
    // *resized* column's centre would still leave exactly one empty column here.
    expect(Math.round(restored.x * 1000)).toBe(Math.round(inSession.x * 1000));
    expect(Math.round(restored.w * 1000)).toBe(600 - SHRUNK_WIDTH_MM);

    resizeTo(session, RESIZED_PLACEMENT_ID, REGROWN_WIDTH_MM);
    resizeTo(reloaded, RESIZED_PLACEMENT_ID, REGROWN_WIDTH_MM);

    // The growth has to land the body where the session's would, not merely be accepted: an entry
    // restored with a defaulted width would still fund a +50 and would fund it from elsewhere.
    expect(
      placementById(reloaded.getState().design, RESIZED_PLACEMENT_ID),
    ).toStrictEqual(
      placementById(session.getState().design, RESIZED_PLACEMENT_ID),
    );
  });

  it("writes no emptyColumns key at all when a command leaves nothing empty", () => {
    const store = createStore();

    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);

    expect(store.getState().design).not.toHaveProperty("emptyColumns");
  });
});

/** Criterion 2's fixture, and the neighbours are the point: a base run 820 mm tall on either side
 *  of a column that reaches 2600. A `top` guessed from the neighbours gives one slot; the frozen
 *  one gives §10's three. */
const CLEARED_COLUMN_ALONG_MM = 1300;
const CLEARED_COLUMN_IDS = ["c-base", "c-wall", "c-top"];
const THREE_LEVEL_DESIGN: Design = {
  room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
  presetId: null,
  placements: [
    {
      id: "left-neighbour",
      wall: "A",
      alongMm: 400,
      y0Mm: 0,
      body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
    },
    {
      id: "c-base",
      wall: "A",
      alongMm: CLEARED_COLUMN_ALONG_MM,
      y0Mm: 0,
      body: { buildId: "base-drawer3-600", widthMm: 600, heightMm: 820 },
    },
    {
      id: "c-wall",
      wall: "A",
      alongMm: CLEARED_COLUMN_ALONG_MM,
      y0Mm: 1500,
      body: { buildId: "wall-2door-600", widthMm: 600, heightMm: 700 },
    },
    {
      id: "c-top",
      wall: "A",
      alongMm: CLEARED_COLUMN_ALONG_MM,
      y0Mm: 2200,
      body: { buildId: "wall-2door-600-top", widthMm: 600, heightMm: 400 },
    },
    {
      id: "right-neighbour",
      wall: "A",
      alongMm: 2200,
      y0Mm: 0,
      body: { buildId: "base-drawer2-600", widthMm: 600, heightMm: 820 },
    },
  ],
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

const FULL_COLUMN_SPAN_MM = 2600;
const LEVEL_SLOTS_IN_A_CLEARED_COLUMN = 3;

describe("criterion 2 — §10's signature flow survives the reload", () => {
  it("still opens three level slots over the full 2.6 m span", () => {
    const session = createStore(THREE_LEVEL_DESIGN);
    for (const id of CLEARED_COLUMN_IDS) removeById(session, id);
    const clearedKey = onlyEmptyColumn(session).key;

    const reloaded = reload(session);

    const slots = reloaded
      .getState()
      .voids.filter((record) => record.col === clearedKey);
    expect(slots).toHaveLength(LEVEL_SLOTS_IN_A_CLEARED_COLUMN);
    expect(slots.map((slot) => inMillimetres(slot.spanH))).toStrictEqual(
      Array<number>(LEVEL_SLOTS_IN_A_CLEARED_COLUMN).fill(FULL_COLUMN_SPAN_MM),
    );
    expect(sortedVoids(reloaded.getState().voids)).toStrictEqual(
      sortedVoids(session.getState().voids),
    );
  });
});

/** `A|2.00` cleared through the store's own deletes — the seeded kitchen's one fully emptiable
 *  column, and the state ADR 0044 stores. */
const CLEARED_KITCHEN_COLUMN_IDS = ["p1", "p12", "p18"];

function clearAColumn(store: Store): void {
  for (const id of CLEARED_KITCHEN_COLUMN_IDS) removeById(store, id);
}

describe("criterion 3 — one design, one column map", () => {
  const routes: readonly (readonly [string, (store: Store) => void])[] = [
    ["a delete", clearAColumn],
    [
      "a shrink",
      (store) => {
        resizeTo(store, RESIZED_PLACEMENT_ID, SHRUNK_WIDTH_MM);
      },
    ],
    [
      "a delete then a shrink",
      (store) => {
        clearAColumn(store);
        resizeTo(store, RESIZED_PLACEMENT_ID, SHRUNK_WIDTH_MM);
      },
    ],
  ];

  for (const [name, mutate] of routes) {
    it(`restores every observable column field after ${name}`, () => {
      const session = createStore();
      mutate(session);

      const reloaded = reload(session);

      expect(observableColumns(reloaded.getState().columns)).toStrictEqual(
        observableColumns(session.getState().columns),
      );
      expect(sortedVoids(reloaded.getState().voids)).toStrictEqual(
        sortedVoids(session.getState().voids),
      );
    });
  }
});

/** One step of criterion 4's sweep. Each is attempted rather than required to succeed: a refusal
 *  leaves the state untouched, and the invariant has to hold over whatever the sequence reached. */
interface Mutation {
  readonly kind: "delete" | "shrink" | "insert";
  readonly at: number;
}

const SWEPT_MUTATIONS = 8;
const WIDTH_STEP_MM = 50;
const INSERTED_BUILD_ID = "base-cabinet";

function applyMutation(store: Store, mutation: Mutation): void {
  const state = store.getState();
  if (mutation.kind === "insert") {
    const target = state.voids[mutation.at % Math.max(state.voids.length, 1)];
    if (!target) return;
    store.getState().select({ kind: "void", id: target.id });
    store.getState().insert(INSERTED_BUILD_ID);
    return;
  }
  const target = state.records[mutation.at % Math.max(state.records.length, 1)];
  if (!target) return;
  if (mutation.kind === "delete") {
    removeById(store, target.id);
    return;
  }
  resizeTo(store, target.id, Math.round(target.frame.w * 1000) - WIDTH_STEP_MM);
}

describe("criterion 4 — one document, one picture", () => {
  propertyTest.prop(
    [
      fc.array(
        fc.record({
          kind: fc.constantFrom<Mutation["kind"]>("delete", "shrink", "insert"),
          at: fc.nat({ max: 30 }),
        }),
        { minLength: SWEPT_MUTATIONS, maxLength: SWEPT_MUTATIONS + 4 },
      ),
    ],
    {
      // The delete-only and shrink-only sequences, pinned: the mutant that matters puts the
      // projection in `resolveColumns`' `body_resized` arm, and a shrink-only sweep survives it.
      examples: [
        [
          Array.from({ length: SWEPT_MUTATIONS }, (_, at) => ({
            kind: "delete" as const,
            at,
          })),
        ],
        [
          Array.from({ length: SWEPT_MUTATIONS }, (_, at) => ({
            kind: "shrink" as const,
            at,
          })),
        ],
      ],
    },
  )(
    "answers the same after any interleaving of deletes, shrinks and inserts",
    (mutations: readonly Mutation[]) => {
      const session = createStore();

      for (const mutation of mutations) {
        applyMutation(session, mutation);

        const reloaded = reload(session);
        // **Total since ADR 0053, and the exclusion list is gone.** It used to skip the keys whose
        // frozen extent their own placements no longer implied — a partial delete's column, a
        // cleared column refilled with a body — because nothing recorded those. `columnExtents`
        // records them, so there is nothing left to exclude and the sweep asks about every key the
        // session holds.
        expect(observableColumns(reloaded.getState().columns)).toStrictEqual(
          observableColumns(session.getState().columns),
        );
        expect(sortedVoids(reloaded.getState().voids)).toStrictEqual(
          sortedVoids(session.getState().voids),
        );
        // The document the seam wrote must also be one the seams accept: since 5B2a a stored entry
        // overwrites the placements' column rather than being dropped, so a projection that emitted
        // a colliding or overlapping entry would corrupt the map instead of being refused.
        expect(
          validateDesignForCatalog(
            session.getState().design,
            KITCHEN_L_BODY_CATALOG,
          ),
        ).toStrictEqual([]);
      }
    },
  );
});

/** Criterion 5H-2 — backlog 22's original route, which was pinned here as a red-when-fixed defect
 *  from wave 5B2b until ADR 0053. The fixture is a column emptied **in part**, so its frozen extent
 *  is one no placement implies; a column emptied entirely, or never touched, would pass this under
 *  every mutant. */
describe("criterion 5H-2 — a partial delete keeps the floor it freed", () => {
  it("restores the freed region and both its openings after a reload", () => {
    const session = createStore();
    // `A|1.30`: the sink base with a wall unit and a top box above it. Deleting the base leaves the
    // column occupied, so before ADR 0053 nothing recorded the space it freed.
    removeById(session, "p0");
    const sessionColumn = session.getState().columns.get("A|1.30");

    const reloaded = reload(session);

    expect(lowestRegionStartOf(sessionColumn)).toBe(0);
    expect(lowestRegionStartOf(reloaded.getState().columns.get("A|1.30"))).toBe(
      0,
    );
    expect(voidsInColumn(reloaded, "A|1.30")).toStrictEqual(
      voidsInColumn(session, "A|1.30"),
    );
  });
});

function lowestRegionStartOf(column: Column | undefined): number {
  return Math.min(...(column?.regions ?? []).map(([start]) => start));
}

function voidsInColumn(store: Store, key: string) {
  return sortedVoids(
    store.getState().voids.filter((record) => record.col === key),
  );
}

/** Criterion 5H-1's route, and criterion 5H-3's fixture: backlog 22's three taps. Clear `A|2.60` —
 *  the base with the hob on it, the wall unit and the top box — and insert a body that fits the
 *  cleared column exactly. */
const REFILLED_COLUMN_KEY = "A|2.60";
const REFILLED_COLUMN_IDS = ["p2", "p13", "p19"];
const EXACT_FIT_BUILD_ID = "base-dishwasher";
const FULL_HEIGHT_COLUMN_TOP_MM = 2600;

function clearedThenRefilled(): Store {
  const store = createStore();
  for (const id of REFILLED_COLUMN_IDS) removeById(store, id);
  const opening = store
    .getState()
    .voids.find(
      (record) => record.col === REFILLED_COLUMN_KEY && record.y0 < 0.01,
    );
  if (!opening) throw new Error("the cleared column published no base opening");
  store.getState().select({ kind: "void", id: opening.id });
  store.getState().insert(EXACT_FIT_BUILD_ID);
  const rejection = store.getState().lastRejection;
  if (rejection) throw new Error(`the insert was refused: ${rejection.code}`);
  return store;
}

describe("criterion 5H-1 — a cleared column refilled to fit keeps its height", () => {
  it("comes back 2600 mm tall with both openings above the body", () => {
    const session = clearedThenRefilled();
    const inSession = voidsInColumn(session, REFILLED_COLUMN_KEY);

    const reloaded = reload(session);

    // Asserted as the number rather than as "the same as the session", because the defect this
    // closes is the column silently shrinking to its members: 860 mm, and two openings gone.
    expect(
      inMillimetres(
        reloaded.getState().columns.get(REFILLED_COLUMN_KEY)?.top ?? 0,
      ),
    ).toBe(FULL_HEIGHT_COLUMN_TOP_MM);
    expect(inSession).toHaveLength(2);
    expect(voidsInColumn(reloaded, REFILLED_COLUMN_KEY)).toStrictEqual(
      inSession,
    );
  });
});

describe("criterion 5H-3 — the reload sweep is total", () => {
  /** **The fixture is the post-5H-1 design, and that is the whole criterion.** On a fresh seeded
   *  load every column's extent already equals the one its members imply, so a sweep over that
   *  design passes under every mutant — including one that skips the restore for occupied keys
   *  entirely. This design carries a column whose extent its placements no longer imply. */
  it("asks every key in the map, with no exclusion list", () => {
    const session = clearedThenRefilled();

    const reloaded = reload(session);

    expect([...reloaded.getState().columns.keys()].sort()).toStrictEqual(
      [...session.getState().columns.keys()].sort(),
    );
    for (const key of session.getState().columns.keys()) {
      expect(observableColumn(reloaded, key)).toStrictEqual(
        observableColumn(session, key),
      );
    }
    expect(sortedVoids(reloaded.getState().voids)).toStrictEqual(
      sortedVoids(session.getState().voids),
    );
  });
});

function observableColumn(store: Store, key: string) {
  const column = store.getState().columns.get(key);
  return observableColumns(new Map(column ? [[key, column]] : []));
}

/**
 * `regions`' second consumer, checked rather than assumed.
 *
 * `resolveSnapY0M` (`commands/insert-fit.ts`) feeds every region start into its candidate list, and
 * a restored column has one region where an in-session one keeps its former members' — so a
 * restored column offers **fewer** candidates. It is inert anyway, and the argument is short:
 * `minY` is always in the list; it always passes the `>= minY - ε` filter; it passes the height
 * filter because `refuseHeight` has already rejected everything that would fail it; and every other
 * candidate is `>= minY - ε`. So the lowest surviving candidate is `minY` up to one ε of 10⁻⁶ m,
 * whatever the regions are, and no candidate a projection drops can be the answer.
 *
 * This sweeps the one state that can tell the two lists apart: a column cleared of three stacked
 * bodies, whose session regions are `[[0,0.82],[1.5,2.2],[2.2,2.6]]` and whose restored region is
 * `[[0,2.6]]`.
 */
describe("a restored column snaps an insert where the session's would", () => {
  const INSERTABLE_BUILD_IDS = ["base-cabinet", "wall-cabinet", "base-sink"];

  function clearedSession(): Store {
    const store = createStore();
    clearAColumn(store);
    return store;
  }

  function insertInto(store: Store, voidId: string, buildId: string): Design {
    store.getState().select({ kind: "void", id: voidId });
    store.getState().insert(buildId);
    return store.getState().design;
  }

  const voidIds = clearedSession()
    .getState()
    .voids.map((record) => record.id);

  // Non-vacuity: a grid where every insert was refused would compare two unchanged designs and
  // prove nothing about snapping. Counted rather than assumed, and asserted as a lower bound so a
  // catalogue change does not make this fixture-sensitive.
  it("inserts something in more than one of the cleared column's slots", () => {
    const applied = INSERTABLE_BUILD_IDS.flatMap((buildId) =>
      voidIds.filter((voidId) => {
        const store = clearedSession();
        const before = store.getState().design.placements.length;
        return insertInto(store, voidId, buildId).placements.length > before;
      }),
    );

    expect(applied.length).toBeGreaterThan(1);
  });

  for (const buildId of INSERTABLE_BUILD_IDS) {
    for (const voidId of voidIds) {
      it(`lands ${buildId} identically in ${voidId}`, () => {
        const session = clearedSession();
        const reloaded = reload(session);

        expect(insertInto(reloaded, voidId, buildId).placements).toStrictEqual(
          insertInto(session, voidId, buildId).placements,
        );
      });
    }
  }

  /**
   * The same question for an **occupied** column, which is the case ADR 0053 creates.
   *
   * Every case above clears a column, so its restored `regions` collapse from several intervals to
   * one — a shape ADR 0044 already produced. From this record an occupied column's extent is stored
   * too, so a column that keeps a member also comes back with `[[floor, top]]` where the session
   * held one interval per body. That is a first, and `resolveSnapY0M` reads region starts, so it is
   * measured here rather than argued from the cleared case.
   *
   * `A|1.30` after a partial delete is the fixture: the sink base is gone and the wall unit and top
   * box remain, so the session holds `[[1.5,2.2],[2.2,2.6]]` with a floor of 0 and the reload holds
   * `[[0,2.6]]` — the widest gap between the two spellings that this design can produce.
   */
  describe("and does the same for a column that still holds a member", () => {
    function partlyEmptiedSession(): Store {
      const store = createStore();
      removeById(store, "p0");
      return store;
    }

    const occupiedVoidIds = partlyEmptiedSession()
      .getState()
      .voids.filter((record) => record.col === "A|1.30")
      .map((record) => record.id);

    // Non-vacuity, on the same terms as the cleared case: an opening has to exist, and at least one
    // body has to actually land in it, or the comparisons below would compare two untouched designs.
    it("publishes the freed opening, and something lands in it", () => {
      const applied = INSERTABLE_BUILD_IDS.flatMap((buildId) =>
        occupiedVoidIds.filter((voidId) => {
          const store = partlyEmptiedSession();
          const before = store.getState().design.placements.length;
          return insertInto(store, voidId, buildId).placements.length > before;
        }),
      );

      expect(occupiedVoidIds.length).toBeGreaterThan(0);
      expect(applied.length).toBeGreaterThan(0);
    });

    for (const buildId of INSERTABLE_BUILD_IDS) {
      for (const voidId of occupiedVoidIds) {
        it(`lands ${buildId} identically in the occupied column's ${voidId}`, () => {
          const session = partlyEmptiedSession();
          const reloaded = reload(session);

          expect(
            insertInto(reloaded, voidId, buildId).placements,
          ).toStrictEqual(insertInto(session, voidId, buildId).placements);
        });
      }
    }
  });
});
