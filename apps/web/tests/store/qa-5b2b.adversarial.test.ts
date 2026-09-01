// Adversarial QA for M5B wave 5B2b, store half — ADR 0044's write seam.
//
// The subject is criterion 4's exclusion. `empty-columns-reload.test.ts` sweeps a mutation sequence
// and compares session against reload *outside* a set of keys it computes by measurement
// (`partiallyEmptiedKeys`), because a column that still holds members but whose frozen extent its
// own placements no longer imply diverges for a reason that predates this wave. An exclusion
// computed by measurement is the shape a vacuous criterion takes, so it is audited here rather than
// trusted:
//
//   1. is it **exactly** the diverging set, or wider — does it remove keys that would have agreed?
//   2. is it **narrower** anywhere — can a divergence slip past it?
//   3. can it **move** to absorb a defect in the code the criterion is testing?
//
// (3) is answered structurally: the exclusion is a subset of the keys placements are filed under, so
// it can never cover a member-less column — which is the only kind ADR 0044 stores, and therefore
// the whole of what 5B2b writes. Whatever a broken projection does, it does it where the criterion
// is still looking.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  deriveColumns,
  DesignSchema,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
  toExactMillimetres,
  validateDesignForCatalog,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeBodyProbe } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    now: () => OCCURRED_AT,
    bodyProbe: createFakeBodyProbe(),
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

/** The exclusion under audit, transcribed from `empty-columns-reload.test.ts` so a change there is
 *  visible as a difference here rather than silently re-audited. */
function excludedKeys(store: Store): Set<string> {
  const state = store.getState();
  const fromPlacementsAlone = deriveColumns(state.records);
  const excluded = new Set<string>();
  for (const [key, frozen] of state.columns) {
    const derived = fromPlacementsAlone.get(key);
    if (derived && observableOf(frozen) !== observableOf(derived)) {
      excluded.add(key);
    }
  }
  return excluded;
}

/** What the exclusion claims to describe: the keys on which a reload's column map actually differs
 *  from the session's, measured directly rather than predicted. */
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
  // The developer's own two demonstrating cases, pinned: a partial delete under a wall run, and a
  // resize that rebuilds a member at a depth of its own.
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

describe("criterion 4's exclusion is exactly the set it claims", () => {
  // Wider would make the criterion weaker than it reads: a key removed from the comparison that
  // would have agreed is a key the sweep stopped checking for nothing. Narrower would make it
  // unsound: a real divergence outside the exclusion has to be a failure, not a pass.
  propertyTest.prop([mutationArbitrary], { examples: SWEEP_EXAMPLES })(
    "excludes every diverging key and no key that agrees",
    (mutations: readonly Mutation[]) => {
      const session = createStore();

      for (const mutation of mutations) {
        applyMutation(session, mutation);

        const reloaded = reload(session);
        const excluded = excludedKeys(session);
        const diverging = divergingKeys(session, reloaded);

        expect([...excluded].sort()).toStrictEqual([...diverging].sort());
      }
    },
  );

  // The structural answer to "does the exclusion move to hide a defect in the code under test".
  // `partiallyEmptiedKeys` measures the session's own map against `deriveColumns(records)`, and
  // that map is keyed only by the columns placements are filed under. So no member-less key can
  // ever enter the exclusion — and a member-less column is the only thing `projectEmptyColumns`
  // writes. The projection cannot buy itself an exemption, however it is broken.
  propertyTest.prop([mutationArbitrary], { examples: SWEEP_EXAMPLES })(
    "never excludes a member-less column, which is all this wave stores",
    (mutations: readonly Mutation[]) => {
      const session = createStore();

      for (const mutation of mutations) {
        applyMutation(session, mutation);

        const memberLess = memberLessKeys(session);
        for (const key of excludedKeys(session)) {
          expect(memberLess.has(key)).toBe(false);
        }
      }
    },
  );

  // Non-vacuity, both ways. The criterion is only worth running if some step leaves a member-less
  // column that the exclusion then leaves in the comparison, and the exclusion is only worth
  // naming if it is non-empty somewhere.
  it("reaches states with an unexcluded empty column, and states with an exclusion", () => {
    const session = createStore();
    let stepsWithAnEmptyColumn = 0;
    let stepsWithAnExclusion = 0;

    // `p0` is a partial delete — it leaves `A|1.30` occupied with a floor its placements no longer
    // imply, which is the exclusion's own reason. `p1`/`p12`/`p18` clear `A|2.00` outright, which
    // is what ADR 0044 stores and what the exclusion must never touch. One sequence, both shapes.
    for (const id of ["p0", "p1", "p12", "p18"]) {
      removeById(session, id);
      const excluded = excludedKeys(session);
      const compared = [...memberLessKeys(session)].filter(
        (key) => !excluded.has(key),
      );
      if (compared.length > 0) stepsWithAnEmptyColumn++;
      if (excluded.size > 0) stepsWithAnExclusion++;
    }

    expect(stepsWithAnEmptyColumn).toBeGreaterThan(0);
    expect(stepsWithAnExclusion).toBeGreaterThan(0);
  });

  // The exclusion's reason, held to its own claim. A key is excluded only because the *placements*
  // no longer imply the frozen extent — so the reload's answer for an excluded key must be the
  // placement-derived one, not something the stored array put there. If a stored entry ever reached
  // an excluded key, the exclusion really would be hiding this wave's output.
  propertyTest.prop([mutationArbitrary], { examples: SWEEP_EXAMPLES })(
    "leaves every excluded key answered by the placements alone",
    (mutations: readonly Mutation[]) => {
      const session = createStore();

      for (const mutation of mutations) {
        applyMutation(session, mutation);

        const reloaded = reload(session);
        const fromPlacementsAlone = observableMap(
          deriveColumns(reloaded.getState().records),
        );
        const restored = observableMap(reloaded.getState().columns);
        for (const key of excludedKeys(session)) {
          expect(restored.get(key)).toBe(fromPlacementsAlone.get(key));
        }
      }
    },
  );
});

/**
 * **THESE TESTS ARE RED, AND THEY ASSERT A PRODUCTION DEFECT.**
 *
 * `void-engine.ts`'s `UnprojectableColumnError` doc-comment claims the throw is unreachable because
 * "every centre a resize writes is refused unless it is a whole millimetre
 * (`refuseFractionalCentres`)". That guard (`commands/apply-column-moves.ts:155-167`) inspects
 * `move.members[].alongMm` only. The empty column's centre is a **different** expression
 * (`apply-column-moves.ts:37-38`) and the two are coupled only while the column extent's width is
 * even:
 *
 *   member alongMm  = extent.centreMm + (requested − extent.widthMm) / 2   → integral iff the delta is even
 *   empty centreMm  = extent.centreMm + requested / 2                      → integral iff extent.centreMm is
 *
 * `resolveColumnExtent` (`commands/resolve-column-width.ts:41-47`) takes the **union** of the
 * members' edges, so two members offset by an odd number of millimetres give an odd extent width and
 * a **half-millimetre** `centreMm`. The delta is still even, so the members' guard passes, and the
 * empty centre lands between two millimetres — which `projectEmptyColumns` refuses by throwing, out
 * of a store command, with no catch anywhere on the path.
 *
 * Before 5B2b nothing projected the frozen map, so this was a silent oddity that vanished on reload.
 * This wave is what turns it into a crash.
 *
 * Production locations: `apply-column-moves.ts:155-167` (the guard that does not cover the case) and
 * `void-engine.ts:620-628` (the comment that says it does).
 */
describe("a resize on an odd-width column extent crashes the store", () => {
  // Two 600 mm bodies stacked in one column key, offset by 1 mm. The document passes `DesignSchema`
  // and `validateDesignForCatalog`, so it is storable at the API write seam and loadable at the
  // load seam — nothing refuses it before the customer presses a width chip.
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

    // A command answers with a rejection or with a new state. It may not throw: `setWidth` is
    // called straight from the width stepper, and nothing between the chip and here catches.
    expect(() => {
      store.getState().setWidth(600);
    }).not.toThrow();
  });

  // The invariant the guard is missing, stated positively so a fix can be checked against it.
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
  // The `[]`-instead-of-delete mutant, asserted on the bytes rather than on a property: ADR 0038's
  // licence is that a document written before this wave is unchanged, and `"emptyColumns":[]` is a
  // different document.
  it("leaves an untouched design byte-identical to its pre-ADR-0044 serialisation", () => {
    const store = createStore();
    const before = canonicalSerializeDesign(KITCHEN_L_DESIGN);

    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().setFinish("oak");
    const after = canonicalSerializeDesign({
      ...store.getState().design,
      // Only the appearance changed; the placements are restated so the comparison is about the
      // key, not about the edit.
      placements: KITCHEN_L_DESIGN.placements,
      updatedAt: KITCHEN_L_DESIGN.updatedAt,
    });

    expect(after).toBe(before);
    expect(JSON.stringify(store.getState().design)).not.toContain(
      "emptyColumns",
    );
  });

  // A command that empties a column and a command that fills it again must leave the document with
  // no key, not with an empty array — otherwise the field is written once and never withdrawn.
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

    // Whatever the insert left, the assertion is the same: the key exists only when something is
    // empty, and its presence and the map must agree.
    const emptyColumns = [...store.getState().columns.keys()].filter(
      (key) => !store.getState().records.some((record) => record.col === key),
    );
    expect(Object.hasOwn(store.getState().design, "emptyColumns")).toBe(
      emptyColumns.length > 0,
    );
  });

  // Two routes to one kitchen. The comparator's ordering is what makes this hold, and a `return 0`
  // comparator only survives it while the two routes happen to touch the map in the same order.
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

  // The unstated invariant that keeps `UnprojectableColumnError` out of reach on the seeded design,
  // pinned on every generated sequence rather than argued once.
  //
  // **The invariant is not "every width is a multiple of `WIDTH_STEP_MM`"** — the shipped fixture
  // already breaks that (`p26` is 320 mm at 740, `p9`/`p21` are 570 mm at 615). What actually holds
  // is weaker and unchecked anywhere in the resize path: a column extent's width comes out **even**,
  // so `resolveColumnExtent`'s `(left + right) / 2` is a whole millimetre, so
  // `extent.centreMm + requested / 2` is one too. See the red describe above for the document that
  // breaks it and the crash that follows.
  propertyTest.prop([mutationArbitrary], { examples: SWEEP_EXAMPLES })(
    "keeps all five projected fields on whole millimetres, on every column",
    (mutations: readonly Mutation[]) => {
      const session = createStore();

      for (const mutation of mutations) {
        applyMutation(session, mutation);

        // Asked of **every** column in the map, not only the member-less ones. A fractional value
        // reaches an entry the moment its members leave, so measuring only what is empty now would
        // miss the state one delete away from the throw.
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

  // The projection must never write an entry at a key a placement holds — the failure 5B2a's
  // deleted silent-drop branch turned from "an entry is lost" into "a column is overwritten".
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
        const restored = deriveColumns([], design.emptyColumns ?? []);
        const fromPlacements = deriveColumns(session.getState().records);
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
