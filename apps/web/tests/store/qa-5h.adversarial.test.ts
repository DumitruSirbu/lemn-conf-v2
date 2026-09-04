// Adversarial QA for M5 wave 5H at the store seam — the one the customer actually travels.
//
// Backlog 22's two routes are proved end to end here, the criterion-5H-3 fixture is checked for
// vacuity by stripping the new array out of the very document the criterion sweeps, and the two
// containment clauses the developer dropped are adjudicated by measurement over a swept mutation
// sequence rather than by the two examples the drop was argued from.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  deriveColumnKeyAt,
  DesignSchema,
  KITCHEN_L_DESIGN,
  occupiedDepthM,
  type Column,
  type Design,
  type PlacementRecord,
  type StoredColumnExtent,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeBodyProbe } from "../support/fake-body-probe";
import { LEGACY_ENUM_FINISHES } from "@lemnaria/configurator-domain";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    bodyProbe: createFakeBodyProbe(),
  });
}

type Store = ReturnType<typeof createStore>;

function loadOf(design: Design): Store {
  return createStore(DesignSchema.parse(JSON.parse(JSON.stringify(design))));
}

function reload(store: Store): Store {
  return loadOf(store.getState().design);
}

/** The same reload with ADR 0053's array taken back out — the "drop `columnExtents` from the
 *  projection" mutant, reproduced on the document instead of on the code, so a criterion can be
 *  shown to be sensitive to it without editing `void-engine.ts`. */
function reloadWithoutTheExtents(store: Store): Store {
  const stripped = { ...store.getState().design };
  delete stripped.columnExtents;
  return loadOf(stripped);
}

function removeById(store: Store, placementId: string): void {
  store.getState().select({ kind: "placement", id: placementId });
  store.getState().remove();
}

const inMm = (metres: number): number => Math.round(metres * 1000);

function openingsIn(store: Store, columnKey: string): string[] {
  return store
    .getState()
    .voids.filter((record) => record.col === columnKey)
    .map(
      (record) =>
        `${record.id} ${String(inMm(record.w))}x${String(inMm(record.h))} at y0=${String(inMm(record.y0))}`,
    )
    .sort();
}

function topOf(store: Store, columnKey: string): number {
  return inMm(store.getState().columns.get(columnKey)?.top ?? 0);
}

// ---------------------------------------------------------------------------
// 5H-1 and 5H-2 — backlog 22, end to end
// ---------------------------------------------------------------------------

const REFILLED_COLUMN_KEY = "A|2.60";
const CLEARED_IDS = ["p2", "p13", "p19"];

function clearedThenRefilled(): Store {
  const store = createStore();
  for (const id of CLEARED_IDS) removeById(store, id);
  const baseOpening = store
    .getState()
    .voids.find(
      (record) => record.col === REFILLED_COLUMN_KEY && record.y0 < 0.01,
    );
  if (!baseOpening) throw new Error("the cleared column published no opening");
  store.getState().select({ kind: "void", id: baseOpening.id });
  store.getState().insert("base-dishwasher");
  const rejection = store.getState().lastRejection;
  if (rejection) throw new Error(`the insert was refused: ${rejection.code}`);
  return store;
}

describe("5H-1 — clear a column, refill it to fit, reload", () => {
  it("keeps the 2600 mm column and both openings, with the same void ids", () => {
    const session = clearedThenRefilled();
    const before = openingsIn(session, REFILLED_COLUMN_KEY);

    const reloaded = reload(session);

    // The measured numbers, not "the same as the session": the defect is a silent shrink to 860.
    expect(before).toStrictEqual([
      "A|2.60:v0:1.50 600x700 at y0=1500",
      "A|2.60:v1:2.20 600x400 at y0=2200",
    ]);
    expect(topOf(session, REFILLED_COLUMN_KEY)).toBe(2600);
    expect(topOf(reloaded, REFILLED_COLUMN_KEY)).toBe(2600);
    expect(openingsIn(reloaded, REFILLED_COLUMN_KEY)).toStrictEqual(before);
  });

  // The headline defect itself, pinned as the number the customer used to get back. If this ever
  // stops differing, the criterion above has gone vacuous.
  it("loses 1740 mm and both openings when the array is dropped", () => {
    const session = clearedThenRefilled();

    const withoutTheExtents = reloadWithoutTheExtents(session);

    expect(topOf(withoutTheExtents, REFILLED_COLUMN_KEY)).toBe(860);
    expect(openingsIn(withoutTheExtents, REFILLED_COLUMN_KEY)).toStrictEqual(
      [],
    );
  });
});

describe("5H-2 — a partial delete keeps the space it freed", () => {
  it("brings back both openings over the deleted fridge", () => {
    const session = createStore();
    // `B|2.45`: the freestanding fridge with the unit over it. `p24` stands, so the column keeps a
    // member and nothing recorded its floor before ADR 0053.
    removeById(session, "p7");
    const before = openingsIn(session, "B|2.45");

    const reloaded = reload(session);

    expect(before).toStrictEqual([
      "B|2.45:v0:0.00 700x860 at y0=0",
      "B|2.45:v1:1.50 700x350 at y0=1500",
    ]);
    expect(openingsIn(reloaded, "B|2.45")).toStrictEqual(before);
    expect(
      openingsIn(reloadWithoutTheExtents(session), "B|2.45"),
    ).toStrictEqual([]);
  });
});

describe("the document is a fixed point of one more save", () => {
  it("re-saves the reloaded design to the same bytes", () => {
    const session = clearedThenRefilled();
    const once = session.getState().design.columnExtents;

    const reloaded = reload(session);
    // A command that changes nothing about the map, so the array it re-projects must be the one it
    // was loaded with: a restore that lost or re-derived anything shows up as a second document for
    // one state, which is ADR 0002's round-trip invariant.
    reloaded.getState().select({ kind: "placement", id: "p0" });
    reloaded.getState().setFinish(LEGACY_ENUM_FINISHES.oak);

    expect(reloaded.getState().design.columnExtents).toStrictEqual(once);
  });
});

// ---------------------------------------------------------------------------
// The two dropped containment clauses, adjudicated by measurement
// ---------------------------------------------------------------------------

interface ClauseBreach {
  readonly clause: "along-wall" | "depth";
  readonly detail: string;
}

function keyOf(extent: StoredColumnExtent): string {
  return deriveColumnKeyAt(extent.wall, extent.alongMm / 1000);
}

function alongCentreMm(record: PlacementRecord): number {
  return inMm(record.wall === "A" ? record.frame.x : record.frame.z);
}

/** Both clauses the plan named and the code dropped, asked of the document the product itself just
 *  wrote. A breach here is a document the clause would have refused — which is the developer's
 *  argument for dropping it, and it has to be true. */
function breachesOfTheDroppedClauses(store: Store): ClauseBreach[] {
  const extents = store.getState().design.columnExtents ?? [];
  const records = store.getState().records;
  const breaches: ClauseBreach[] = [];
  for (const extent of extents) {
    const key = keyOf(extent);
    for (const member of records.filter((record) => record.col === key)) {
      const halfMm = inMm(member.frame.w) / 2;
      const memberStart = alongCentreMm(member) - halfMm;
      const memberEnd = alongCentreMm(member) + halfMm;
      const extentStart = extent.alongMm - extent.widthMm / 2;
      const extentEnd = extent.alongMm + extent.widthMm / 2;
      if (memberStart < extentStart || memberEnd > extentEnd) {
        breaches.push({
          clause: "along-wall",
          detail: `${key} spans ${String(extentStart)}..${String(extentEnd)} and ${member.id} spans ${String(memberStart)}..${String(memberEnd)}`,
        });
      }
      if (inMm(occupiedDepthM(member)) > extent.depthMm) {
        breaches.push({
          clause: "depth",
          detail: `${key} is ${String(extent.depthMm)} mm deep and ${member.id} occupies ${String(inMm(occupiedDepthM(member)))} mm`,
        });
      }
    }
  }
  return breaches;
}

type MutationKind = "delete" | "shrink" | "insert";
interface Mutation {
  readonly kind: MutationKind;
  readonly at: number;
}

const INSERTABLE = [
  "base-cabinet",
  "base-drawer3-600",
  "wall-1door-300",
  "base-dishwasher",
];

function applyMutation(store: Store, mutation: Mutation): void {
  const state = store.getState();
  if (mutation.kind === "insert") {
    const target = state.voids[mutation.at % Math.max(state.voids.length, 1)];
    if (!target) return;
    store.getState().select({ kind: "void", id: target.id });
    store
      .getState()
      .insert(INSERTABLE[mutation.at % INSERTABLE.length] ?? "base-cabinet");
    return;
  }
  const target = state.records[mutation.at % Math.max(state.records.length, 1)];
  if (!target) return;
  if (mutation.kind === "delete") {
    removeById(store, target.id);
    return;
  }
  store.getState().select({ kind: "placement", id: target.id });
  store.getState().setWidth(inMm(target.frame.w) - 50);
}

const mutationArbitrary = fc.array(
  fc.record({
    kind: fc.constantFrom<MutationKind>("delete", "shrink", "insert"),
    at: fc.nat({ max: 30 }),
  }),
  { minLength: 8, maxLength: 20 },
);

function sweptBreaches(clause: ClauseBreach["clause"]): Set<string> {
  const seen = new Set<string>();
  fc.assert(
    fc.property(mutationArbitrary, (mutations: readonly Mutation[]) => {
      const store = createStore();
      for (const mutation of mutations) {
        applyMutation(store, mutation);
        for (const breach of breachesOfTheDroppedClauses(store)) {
          if (breach.clause === clause) seen.add(breach.detail);
        }
      }
      return true;
    }),
    { numRuns: 400 },
  );
  return seen;
}

describe("the two containment clauses that were dropped", () => {
  // **Justified.** The depth clause would refuse a document the product itself writes: ADR 0011
  // Gap D freezes `d` while a resize re-measures a member's seat, and a fronted or front-hung body
  // occupies more than the frame it records (ADR 0036, ADR 0039). Measured, not argued.
  it("is right to drop the depth clause — the product writes documents that break it", () => {
    expect(sweptBreaches("depth").size).toBeGreaterThan(0);
  });

  // **Not justified by anything I can measure, and it is the clause whose absence is a defect.**
  // The argument for dropping it is that `Column.w` is a MIN over the members, so a column can be
  // narrower than a body it holds. The MIN is real (`void-engine.ts:441`), but the consequence is
  // not reachable: a resize is the only command that changes a member's width and it re-keys the
  // body out of the column, so no product-produced document has a member wider than the extent
  // that claims it. The cited example is also wrong — the seeded `A|1.30` is 800 mm wide holding
  // three 800 mm members, not 500 mm holding a 600 mm base.
  //
  // If this ever goes red, the clause genuinely cannot be enforced as written and the extent needs
  // a different along-wall bound (the members' union, not the MIN) rather than none at all.
  it("finds no document the along-wall clause would refuse", () => {
    expect([...sweptBreaches("along-wall")]).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Criterion 5H-3's fixture, checked for vacuity
// ---------------------------------------------------------------------------

function observableOf(column: Column): string {
  return JSON.stringify({
    wall: column.wall,
    xMm: inMm(column.x),
    zMm: inMm(column.z),
    wMm: inMm(column.w),
    dMm: inMm(column.d),
    topMm: inMm(column.top),
    floorMm: inMm(Math.min(...column.regions.map(([start]) => start))),
  });
}

function divergingKeys(session: Store, reloaded: Store): string[] {
  const inSession = new Map(
    [...session.getState().columns].map(([key, column]) => [
      key,
      observableOf(column),
    ]),
  );
  const restored = new Map(
    [...reloaded.getState().columns].map(([key, column]) => [
      key,
      observableOf(column),
    ]),
  );
  return [...new Set([...inSession.keys(), ...restored.keys()])]
    .filter((key) => inSession.get(key) !== restored.get(key))
    .sort();
}

describe("criterion 5H-3's sweep is total and its fixture is load-bearing", () => {
  it("diverges on the refilled column when the array is dropped, and nowhere when it is not", () => {
    const session = clearedThenRefilled();

    expect(divergingKeys(session, reload(session))).toStrictEqual([]);
    // The named vacuity risk, closed: on a fresh seeded load the same comparison passes under the
    // mutant, so the fixture — and only the fixture — is what gives the criterion teeth.
    expect(
      divergingKeys(session, reloadWithoutTheExtents(session)),
    ).toStrictEqual([REFILLED_COLUMN_KEY]);
    const fresh = createStore();
    expect(divergingKeys(fresh, reloadWithoutTheExtents(fresh))).toStrictEqual(
      [],
    );
  });

  propertyTest.prop([mutationArbitrary])(
    "leaves no key diverging after any mutation sequence",
    (mutations: readonly Mutation[]) => {
      const session = createStore();
      for (const mutation of mutations) applyMutation(session, mutation);

      expect(divergingKeys(session, reload(session))).toStrictEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// The ordering the restore path depends on, and the half of it that is falsifiable
// ---------------------------------------------------------------------------

/** ADR 0046's four-tap merge route, replayed so a **load** has a merge to perform: clear the 800 mm
 *  sink column and the 600 mm dishwasher column beside it, then seat a 600 mm dishwasher flush left
 *  in the sink column. The 200 mm remainder and the cleared 600 become one 800 mm column at
 *  `A|1.90`, and the reload rebuilds it through `mergeAdjacentEmptyColumns` inside `deriveColumns`. */
function mergedAtLoad(): Store {
  const store = createStore();
  for (const id of ["p0", "p11", "p17", "p1", "p12", "p18"]) {
    removeById(store, id);
  }
  const opening = store
    .getState()
    .voids.find((record) => record.col === "A|1.30" && record.y0 < 0.01);
  if (!opening) throw new Error("the cleared sink column published no opening");
  store.getState().select({ kind: "void", id: opening.id });
  store.getState().insert("base-dishwasher");
  return store;
}

/**
 * **Reported, not asserted: swapping these two is currently unfalsifiable.**
 *
 * `deriveColumns` ends `withCurrentFullHeightMembers(mergeAdjacentEmptyColumns(...))`, and the
 * ordering is not commutative in principle — the merge widens a column and `isFullHeightUnder` is a
 * geometric along-wall overlap over that width. But no document distinguishes the two orders:
 * `mergedExtent` builds the merged column with `...shallowest.column`, so answering first still
 * leaves a boolean behind (the shallowest part's), and the merged answer can only differ from that
 * part's where a merged span overlaps a `band: "column"` body. The two tests below pin why that is
 * out of reach today, so a wave that changes either fact finds them red.
 *
 * `void-engine.ts`'s call site should say so in a sentence, the way ADR 0048's shelf-pitch rule is
 * recorded as unfalsifiable rather than left looking tested. That is a production edit and is left
 * to the wave's author.
 */
describe("the merge and the full-height answer, and why their order is untestable", () => {
  /**
   * The fixture, pinned so the rest of this block is about a load that really does merge: without
   * it every claim below holds vacuously.
   */
  it("rebuilds the merged 800 mm column at load", () => {
    const reloaded = reload(mergedAtLoad());

    expect(inMm(reloaded.getState().columns.get("A|1.90")?.w ?? 0)).toBe(800);
    for (const column of reloaded.getState().columns.values()) {
      expect(typeof column.hasFullHeightUnder).toBe("boolean");
    }
  });

  /**
   * **The other half is currently unfalsifiable, and is recorded rather than asserted.** The
   * ordering would also matter if a merged column's own answer differed from its parts' — merging
   * widens a column, and `isFullHeightUnder` is a geometric along-wall overlap over that width. No
   * document reaches that state: wall A carries no `band: "column"` body at all, and on wall B the
   * tall runs partition the wall, so every member-less key there merely touches its tall neighbours
   * at their edges (`overlapsAlongWall` requires positive overlap). A hand-built entry that did
   * overlap one is refused by `EMPTY_COLUMN_OVERLAPS_PLACEMENT`.
   *
   * Asserted as the reason rather than as the case, so a later wave that puts a tall body on wall A
   * — or lifts the overlap refusal — finds this red and writes the missing test.
   */
  it("has no reachable merged column whose answer could differ from its parts", () => {
    const store = mergedAtLoad();

    // Wall A, where the only reachable merge happens, carries no full-height body at all.
    expect(
      store
        .getState()
        .records.filter((record) => record.band === "column")
        .map((record) => record.wall),
    ).not.toContain("A");
    // Wall B does, and every one of its true answers is a column holding its **own** tall member —
    // never a merged space, because a key with a tall member is not member-less and the tall runs
    // only touch their neighbours at the edges.
    const reloaded = reload(store);
    expect(reloaded.getState().columns.get("A|1.90")?.hasFullHeightUnder).toBe(
      false,
    );
    for (const column of reloaded.getState().columns.values()) {
      if (!column.hasFullHeightUnder) continue;
      expect(
        reloaded
          .getState()
          .records.some(
            (record) => record.col === column.key && record.band === "column",
          ),
      ).toBe(true);
    }
  });
});
