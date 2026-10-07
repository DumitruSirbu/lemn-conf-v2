// Store half of ADR 0044's write seam, after ADR 0053: the session-versus-reload sweep is total, and the set the
// placements alone cannot answer is the set the document records as `columnExtents`. That set is a subset of the keys
// placements are filed under, so it never holds a member-less column, which is all `emptyColumns` stores.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  canonicalSerializeDesign,
  deriveColumnKeyAt,
  deriveColumns,
  DesignSchema,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  toExactMillimetres,
  validateDesignForCatalog,
  type Column,
  type Design,
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

function inMillimetres(valueM: number): number {
  return Math.round(valueM * 1000);
}

/** The criterion's own observable field list, in one string per column so two maps can be compared
 *  key by key rather than as two sorted arrays. */
function observableOf(column: Column): string {
  return JSON.stringify({
    wall: column.wall,
    xMm: inMillimetres(column.x),
    zMm: inMillimetres(column.z),
    wMm: inMillimetres(column.w),
    dMm: inMillimetres(column.d),
    ry: column.ry,
    topMm: inMillimetres(column.top),
    floorMm: inMillimetres(Math.min(...column.regions.map(([start]) => start))),
  });
}

function observableMap(
  columns: ReadonlyMap<string, Column>,
): Map<string, string> {
  return new Map(
    [...columns.values()].map((column) => [column.key, observableOf(column)]),
  );
}

/** The keys a reload cannot answer from the placements alone: a column whose frozen extent its own members no longer
 *  imply, which is the set `columnExtents` carries. */
function keysThePlacementsCannotAnswer(store: Store): Set<string> {
  const state = store.getState();
  const fromPlacementsAlone = deriveColumns(
    state.records,
    {},
    state.design.room,
  );
  const excluded = new Set<string>();
  for (const [key, frozen] of state.columns) {
    const derived = fromPlacementsAlone.get(key);
    if (derived && observableOf(frozen) !== observableOf(derived)) {
      excluded.add(key);
    }
  }
  return excluded;
}

/** The keys of the extents the document is carrying, as `deriveColumnKeyAt` renders them. */
function storedExtentKeys(store: Store): Set<string> {
  return new Set(
    (store.getState().design.columnExtents ?? []).map((extent) =>
      deriveColumnKeyAt(extent.wall, extent.alongMm / 1000),
    ),
  );
}

/** The keys on which a reload's column map differs from the session's, measured directly rather than predicted. */
function divergingKeys(session: Store, reloaded: Store): Set<string> {
  const inSession = observableMap(session.getState().columns);
  const restored = observableMap(reloaded.getState().columns);
  const diverging = new Set<string>();
  for (const key of new Set([...inSession.keys(), ...restored.keys()])) {
    if (inSession.get(key) !== restored.get(key)) diverging.add(key);
  }
  return diverging;
}

function memberLessKeys(store: Store): Set<string> {
  const occupied = new Set(store.getState().records.map((r) => r.col));
  return new Set(
    [...store.getState().columns.keys()].filter((key) => !occupied.has(key)),
  );
}

interface Mutation {
  readonly kind: "delete" | "shrink" | "insert";
  readonly at: number;
}

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

const mutationArbitrary = fc.array(
  fc.record({
    kind: fc.constantFrom<Mutation["kind"]>("delete", "shrink", "insert"),
    at: fc.nat({ max: 30 }),
  }),
  { minLength: 8, maxLength: 14 },
);

const SWEEP_EXAMPLES: [Mutation[]][] = [
  [Array.from({ length: 8 }, (_, at) => ({ kind: "delete" as const, at }))],
  [Array.from({ length: 8 }, (_, at) => ({ kind: "shrink" as const, at }))],
  // Two pinned cases: a partial delete under a wall run, and a resize that rebuilds a member at a depth of its own.
  [[{ kind: "delete", at: 0 }]],
  [
    [
      { kind: "delete", at: 0 },
      { kind: "shrink", at: 4 },
      { kind: "insert", at: 1 },
      { kind: "delete", at: 2 },
    ],
  ],
];

describe("the sweep is total, and the set it used to exclude is the set now recorded", () => {
  // Anything here is a key on which one document still shows two pictures (ADR 0053).
  propertyTest.prop([mutationArbitrary], { examples: SWEEP_EXAMPLES })(
    "leaves no key diverging, and records every key the placements cannot answer",
    (mutations: readonly Mutation[]) => {
      const session = createStore();

      for (const mutation of mutations) {
        applyMutation(session, mutation);

        const reloaded = reload(session);
        const stored = storedExtentKeys(session);

        expect([...divergingKeys(session, reloaded)]).toStrictEqual([]);
        for (const key of keysThePlacementsCannotAnswer(session)) {
          expect(stored.has(key)).toBe(true);
        }
      }
    },
  );

  // `keysThePlacementsCannotAnswer` is keyed only by columns placements are filed under, so no member-less key can
  // enter
  // it; the projection cannot buy itself an exemption, however it is broken.
  propertyTest.prop([mutationArbitrary], { examples: SWEEP_EXAMPLES })(
    "never excludes a member-less column, which is all this wave stores",
    (mutations: readonly Mutation[]) => {
      const session = createStore();

      for (const mutation of mutations) {
        applyMutation(session, mutation);

        const memberLess = memberLessKeys(session);
        for (const key of keysThePlacementsCannotAnswer(session)) {
          expect(memberLess.has(key)).toBe(false);
        }
      }
    },
  );

  // Non-vacuity both ways: some step must leave a member-less column the exclusion leaves in the comparison, and the
  // exclusion must be non-empty somewhere.
  it("reaches states with an unexcluded empty column, and states with an exclusion", () => {
    const session = createStore();
    let stepsWithAnEmptyColumn = 0;
    let stepsWithAnExclusion = 0;

    // `p0` is a partial delete that leaves `A|1.30` occupied with a floor its placements no longer imply;
    // `p1`/`p12`/`p18`
    // clear `A|2.00` outright, which ADR 0044 stores.
    for (const id of ["p0", "p1", "p12", "p18"]) {
      removeById(session, id);
      const excluded = keysThePlacementsCannotAnswer(session);
      const compared = [...memberLessKeys(session)].filter(
        (key) => !excluded.has(key),
      );
      if (compared.length > 0) stepsWithAnEmptyColumn++;
      if (excluded.size > 0) stepsWithAnExclusion++;
    }

    expect(stepsWithAnEmptyColumn).toBeGreaterThan(0);
    expect(stepsWithAnExclusion).toBeGreaterThan(0);
  });

  // On the keys the placements answer differently the reload must take the stored answer; a restore that fell through
  // to the derivation would satisfy "nothing diverges" only by shrinking the session's own map.
  propertyTest.prop([mutationArbitrary], { examples: SWEEP_EXAMPLES })(
    "answers every such key from the stored extent, never from the placements",
    (mutations: readonly Mutation[]) => {
      const session = createStore();

      for (const mutation of mutations) {
        applyMutation(session, mutation);

        const reloaded = reload(session);
        const fromPlacementsAlone = observableMap(
          deriveColumns(
            reloaded.getState().records,
            {},
            reloaded.getState().design.room,
          ),
        );
        const inSession = observableMap(session.getState().columns);
        const restored = observableMap(reloaded.getState().columns);
        for (const key of keysThePlacementsCannotAnswer(session)) {
          expect(restored.get(key)).toBe(inSession.get(key));
          expect(restored.get(key)).not.toBe(fromPlacementsAlone.get(key));
        }
      }
    },
  );
});

/**
 * Two members offset by an odd number of millimetres give an odd extent width and a half-millimetre `centreMm`
 * (`resolveColumnExtent` takes the union of their edges). The members' own centres stay whole, but the empty column's
 * would not, and `projectEmptyColumns` refuses a fractional centre by throwing out of a store command.
 */
describe("a resize on an odd-width column extent crashes the store", () => {
  // Two 600 mm bodies stacked in one column key, offset by 1 mm. The document passes `DesignSchema` and
  // `validateDesignForCatalog`, so nothing refuses it before the customer presses a width chip.
  const ODD_EXTENT_DESIGN: Design = {
    room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [
      {
        id: "base",
        wall: "A",
        alongMm: 1000,
        y0Mm: 0,
        body: { buildId: "base-drawer3-600", widthMm: 600, heightMm: 820 },
      },
      {
        id: "wall",
        wall: "A",
        alongMm: 1001,
        y0Mm: 1500,
        body: { buildId: "wall-2door-600", widthMm: 600, heightMm: 700 },
      },
    ],
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };

  it("accepts the document at both seams, which is what makes the crash reachable", () => {
    expect(DesignSchema.safeParse(ODD_EXTENT_DESIGN).success).toBe(true);
    expect(
      validateDesignForCatalog(ODD_EXTENT_DESIGN, KITCHEN_L_BODY_CATALOG),
    ).toStrictEqual([]);
  });

  it("shrinks 601 → 600 without throwing out of the command", () => {
    const store = createStore(ODD_EXTENT_DESIGN);

    store.getState().select({ kind: "placement", id: "base" });

    // A command answers with a rejection or a new state and may not throw: `setWidth` is called straight from the width
    // stepper.
    expect(() => {
      store.getState().setWidth(600);
    }).not.toThrow();
  });

  it("never records an empty column at a fractional centre", () => {
    const store = createStore(ODD_EXTENT_DESIGN);

    store.getState().select({ kind: "placement", id: "base" });
    try {
      store.getState().setWidth(600);
    } catch {
      throw new Error(
        "setWidth threw; the empty centre is fractional before it is ever recorded",
      );
    }

    for (const entry of store.getState().design.emptyColumns ?? []) {
      expect(Number.isInteger(entry.alongMm)).toBe(true);
    }
  });
});

describe("the seam writes one document per state, and nothing for an empty one", () => {
  // The `[]`-instead-of-delete mutant, asserted on the bytes: an empty space that never existed must leave no
  // `emptyColumns` key. Since ADR 0053 a saved document also carries `columnExtents`; removing that key gives back the
  // original document, and the two halves are asserted separately.
  it("adds only the frozen map to an untouched design, and no empty key", () => {
    const store = createStore();
    const before = canonicalSerializeDesign(KITCHEN_L_DESIGN);

    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);
    const saved = store.getState().design;
    const withoutTheFrozenMap = { ...saved };
    delete withoutTheFrozenMap.columnExtents;
    const after = canonicalSerializeDesign({
      ...withoutTheFrozenMap,
      placements: KITCHEN_L_DESIGN.placements,
      updatedAt: KITCHEN_L_DESIGN.updatedAt,
    });

    expect(after).toBe(before);
    expect(saved).not.toHaveProperty("emptyColumns");
    // Every occupied column, and nothing else.
    expect((saved.columnExtents ?? []).length).toBe(
      new Set(store.getState().records.map((record) => record.col)).size,
    );
  });

  // Filling the last empty column must withdraw the key, not leave an empty array.
  it("withdraws the key when the last empty column is filled again", () => {
    const store = createStore();
    for (const id of ["p1", "p12", "p18"]) removeById(store, id);
    expect(store.getState().design).toHaveProperty("emptyColumns");

    const target = store
      .getState()
      .voids.find((record) => record.col === "A|2.00");
    if (!target) throw new Error("the cleared column offers no slot");
    store.getState().select({ kind: "void", id: target.id });
    store.getState().insert("tall-pantry");

    // The key exists only when something is empty, so its presence and the map must agree.
    const emptyColumns = [...store.getState().columns.keys()].filter(
      (key) => !store.getState().records.some((record) => record.col === key),
    );
    expect(Object.hasOwn(store.getState().design, "emptyColumns")).toBe(
      emptyColumns.length > 0,
    );
  });

  // The comparator's ordering makes two routes to one kitchen agree; a `return 0` comparator survives only while both
  // routes touch the map in the same order.
  it("serialises the same kitchen identically however it was reached", () => {
    const forwards = createStore();
    removeById(forwards, "p1");
    removeById(forwards, "p12");
    removeById(forwards, "p18");
    resizeTo(forwards, "p4", 450);

    const backwards = createStore();
    resizeTo(backwards, "p4", 450);
    removeById(backwards, "p18");
    removeById(backwards, "p12");
    removeById(backwards, "p1");

    expect(canonicalSerializeDesign(backwards.getState().design)).toBe(
      canonicalSerializeDesign(forwards.getState().design),
    );
  });

  // Keeps `UnprojectableColumnError` out of reach on the seeded design. The invariant is not that every width is a
  // multiple of `WIDTH_STEP_MM` (`p26` is 320 mm, `p9`/`p21` 570 mm) but that a column extent's width is even, so
  // `resolveColumnExtent`'s `(left + right) / 2` and `extent.centreMm + requested / 2` are whole millimetres.
  propertyTest.prop([mutationArbitrary], { examples: SWEEP_EXAMPLES })(
    "keeps all five projected fields on whole millimetres, on every column",
    (mutations: readonly Mutation[]) => {
      const session = createStore();

      for (const mutation of mutations) {
        applyMutation(session, mutation);

        // Asked of every column, not only the member-less: a fractional value reaches an entry the moment its members
        // leave.
        for (const column of session.getState().columns.values()) {
          const projected = {
            alongMm: column.wall === "A" ? column.x : column.z,
            widthMm: column.w,
            y0Mm: Math.min(...column.regions.map(([start]) => start)),
            topMm: column.top,
            depthMm: column.d,
          };
          for (const [field, valueM] of Object.entries(projected)) {
            expect({ field, mm: toExactMillimetres(valueM) }).toStrictEqual({
              field,
              mm: Math.round(valueM * 1000),
            });
          }
        }
      }
    },
  );

  // The projection must never write an entry at a key a placement holds, which would overwrite a column.
  propertyTest.prop([mutationArbitrary], { examples: SWEEP_EXAMPLES })(
    "writes no entry at a key a placement is filed under",
    (mutations: readonly Mutation[]) => {
      const session = createStore();

      for (const mutation of mutations) {
        applyMutation(session, mutation);

        const design = session.getState().design;
        const occupied = new Set(
          design.placements.map((placement) => placement.id),
        );
        expect(occupied.size).toBe(design.placements.length);
        const restored = deriveColumns(
          [],
          { emptyColumns: design.emptyColumns ?? [] },
          design.room,
        );
        const fromPlacements = deriveColumns(
          session.getState().records,
          {},
          design.room,
        );
        for (const key of restored.keys()) {
          expect(fromPlacements.has(key)).toBe(false);
        }
        // And the document stays one both seams accept, at every step.
        expect(
          validateDesignForCatalog(design, KITCHEN_L_BODY_CATALOG),
        ).toStrictEqual([]);
        expect(DesignSchema.safeParse(design).success).toBe(true);
      }
    },
  );
});
