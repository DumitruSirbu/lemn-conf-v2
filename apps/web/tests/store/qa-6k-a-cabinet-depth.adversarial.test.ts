// Adversarial QA for wave 6K-a at the store seam.
//
// The wave's own file (`cabinet-depth.test.ts`) measures one direction: 600 -> 700. Everything here
// is what the other direction, the round trip and the second wall measure — the cases a control that
// offers two depths reaches on the customer's second tap.
//
// Two rules for the assertions below, both learned from the wave's own note that "two maps from the
// same builder are equally plausible objects":
//
//  - **Nothing is compared against a hand-written number where the domain can be asked.** A column's
//    depth is §3.2's MAX over its members' `occupiedDepthM`, so that is what it is compared to; the
//    frame depths come off the catalogue. A test that wrote 620 and 720 out would still pass if the
//    catalogue's parameterisation moved underneath it.
//  - **The stale document is put through the schema and reloaded**, because "the map is wrong for
//    this session" and "the map is wrong for good" are different defects and only the second one
//    matters to a customer who closes the tab.
import {
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  declaredCabinetDepthsMm,
  DesignSchema,
  KITCHEN_L_DESIGN,
  occupiedDepthM,
  setCabinetDepth as setCabinetDepthOnDesign,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { columnKeyAt } from "../support/wall-b-column-keys";

const OCCURRED_AT = "2026-09-04T12:00:00.000Z";
const DEEPER_MM = 700;

/** A base run on wall A, occupied end to end, whose members all follow the setting — so §3.2's MAX
 *  over them is a pure function of the depth the kitchen is at. */
const OCCUPIED_BASE_KEY = "A|1.30";
/** The same question on the other wall. `x` is the across-wall coordinate here and the along-wall
 *  one on wall A, which is the transposition `deepenedTo` exists to avoid making. */
const OCCUPIED_WALL_B_KEY = "B|1.20";

function createStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

/** The design as a save and a reload would deliver it: through the wire schema, so a document this
 *  helper accepts is one the API would have stored and returned. */
function reload(store: Store): Store {
  return createStore(
    DesignSchema.parse(JSON.parse(JSON.stringify(store.getState().design))),
  );
}

function columnOf(store: Store, key: string): Column {
  const column = store.getState().columns.get(key);
  if (!column) throw new Error(`no column ${key} is published`);
  return column;
}

/** §3.2's own answer for one column, over the records the store currently holds: the deepest thing
 *  standing in the run. A column whose members are all present is this and nothing else. */
function deepestMemberM(store: Store, key: string): number {
  const members = store
    .getState()
    .records.filter((record) => record.col === key);
  if (members.length === 0) throw new Error(`column ${key} holds no member`);
  return Math.max(...members.map((member) => occupiedDepthM(member)));
}

function columnDepthsM(store: Store): ReadonlyMap<string, number> {
  return new Map(
    [...store.getState().columns.entries()].map(([key, column]) => [
      key,
      column.d,
    ]),
  );
}

/** The premise the rest of the file rests on: both depths are offered, and they are two. */
it("offers a shallower depth to change back to", () => {
  expect(declaredCabinetDepthsMm()).toContain(DEEPER_MM);
  expect(declaredCabinetDepthsMm()).toContain(DEFAULT_CABINET_DEPTH_MM);
  expect(DEEPER_MM).toBeGreaterThan(DEFAULT_CABINET_DEPTH_MM);
});

// `atCurrentCabinetDepth` deepens and never shrinks — `if (!atDepth || atDepth.d <= column.d)
// continue` — and the argument for that is ADR 0011 Gap D: an extent frozen deeper than its members
// was frozen that way *on purpose*, by a delete that took the deep body out from under a shallow
// one.
//
// **That argument does not cover a column with all of its members still in it.** Nothing was
// deleted here; the very command publishing the map rebuilt every body in the run shallower. The
// wave's own reason for touching the depth axis at all — "depth is §3.2's MAX over the members'
// `occupiedDepthM` and is a pure function of the bodies standing there" — has no direction in it.
describe("a depth decrease, which no measurement in the wave exercised", () => {
  it("leaves an occupied column describing the run its members no longer form", () => {
    const store = createStore();
    store.getState().setCabinetDepth(DEEPER_MM);

    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    expect(store.getState().design.settings?.cabinetDepthMm).toBe(
      DEFAULT_CABINET_DEPTH_MM,
    );
    expect(columnOf(store, OCCUPIED_BASE_KEY).d).toBeCloseTo(
      deepestMemberM(store, OCCUPIED_BASE_KEY),
      6,
    );
  });

  // The durable half, and the one that makes this the same defect the wave fixed in the other
  // direction rather than a display bug: `projectFrozenMap` writes the published map into
  // `columnExtents`, the document parses, `validateDesignForCatalog` has nothing to say about depth,
  // and `deriveColumns` restores the stored extent over the one the placements imply. So the run
  // reloads at the depth the session started at, for good.
  it("writes that extent into the document, which reloads carrying it", () => {
    const store = createStore();
    store.getState().setCabinetDepth(DEEPER_MM);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    const reloaded = reload(store);

    expect(columnOf(reloaded, OCCUPIED_BASE_KEY).d).toBeCloseTo(
      deepestMemberM(reloaded, OCCUPIED_BASE_KEY),
      6,
    );
  });

  // What a customer would see. The stale extent is not an internal number: it is the opening a
  // delete frees, and `resolveDepthM` builds a base body to the clearance the opening reports. So a
  // cabinet inserted into a 600 mm kitchen after a visit to 700 is built 700 mm deep and stands
  // proud of every neighbour, with nothing on the way refusing it — the sentence 6K-a's own commit
  // message uses for the increase direction.
  it("builds a body deeper than the kitchen when one is inserted into the freed opening", () => {
    const store = createStore();
    store.getState().setCabinetDepth(DEEPER_MM);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);
    const reloaded = reload(store);

    reloaded.getState().select({ kind: "placement", id: "p1" });
    reloaded.getState().remove();
    const opening = reloaded
      .getState()
      .voids.find((record) => record.col === "A|2.00");
    if (!opening) throw new Error("deleting p1 freed no opening at A|2.00");
    reloaded.getState().select({ kind: "void", id: opening.id });
    reloaded.getState().insert("base-3drawer");

    expect(reloaded.getState().lastRejection).toBeNull();
    const neverDeepened = createStore();
    neverDeepened.getState().select({ kind: "placement", id: "p1" });
    neverDeepened.getState().remove();
    const freshOpening = neverDeepened
      .getState()
      .voids.find((record) => record.col === "A|2.00");
    if (!freshOpening)
      throw new Error("no opening in the never-deepened store");
    neverDeepened.getState().select({ kind: "void", id: freshOpening.id });
    neverDeepened.getState().insert("base-3drawer");

    expect(insertedSeatDepthMm(reloaded)).toBe(
      insertedSeatDepthMm(neverDeepened),
    );
  });
});

/** The seat of the body standing in the base slot at 2000 mm on wall A — the one the two stores
 *  above both insert. */
function insertedSeatDepthMm(store: Store): number | undefined {
  return store
    .getState()
    .design.placements.find(
      (placement) =>
        placement.wall === "A" &&
        placement.alongMm === 2000 &&
        placement.y0Mm === 0,
    )?.body.seatDepthMm;
}

// ADR 0055 declines to promise the *document* comes back from a round trip, and this asserts no such
// thing. The published columns are 6K-a's own claim, not 6J-b's: the wave says the map describes the
// run at the design's own depth, and after 600 -> 700 -> 600 the design's own depth is 600 again.
//
// **All twelve columns return — since wave 6K-d, and they did not before.** `resolveRebuildBody` resolves a seeded entry to its parameterised equivalent and never
// resolves back, and the two entries carry different declared depths under the *same* declaration
// kind — measured off the built catalogue on 2026-09-04:
//
//     at 600:  wall-2door-600  frameDepthMm=291   wall-cabinet  frameDepthMm=330
//     at 700:  wall-2door-600  frameDepthMm=361   wall-cabinet  frameDepthMm=400
//     both:    occupiedDepth { measuredFrom: "recorded-shell", frontAssemblyMm: 39 }
//
// `A|0.30` and `A|0.75` used to publish 0.3300 at the start, 0.3690 at 700 and 0.3690 again on the
// way back. It was never the decrease direction (the rule takes the measured depth here) and never
// [ADR 0073](../../../../docs/decisions/0073-a-frozen-extent-records-the-body-its-depth-came-from.md)'s
// residue, which is about extents with no member left to measure — these hold every member.
//
// It is the failure `set-cabinet-depth.ts`'s own comment already warns of, recurring on the depth
// axis in the file that documents it: *"resolving it to a catalogue equivalent is precisely the
// mistake that once turned `hood-600` into `hood` and changed its height."* That declaration
// disagreement is real and is **wave 6K-d**, ruled by
// [ADR 0075](../../../../docs/decisions/0075-a-recorded-shell-declares-its-shell-not-its-finished-depth.md):
// 291 is right and 330 is wrong, on four independent readings.
//
// **But the 39 mm this file measures is not that defect, and the first version of this comment said
// it was — corrected 2026-09-04.** `rebuild` writes `seatDepthMm` from a *measurement*, never from
// `frameDepthMm`. `createFakeBodyProbe` returns `request.depthM / 2`, so it seats a wall body at the
// 330 it was asked for and the column publishes 330 + 39 = **369**. The real adapter probe builds
// the `0.330 - 0.039` shell and records **291**, which is what the seeded row carried all along, so
// against it nothing grows. Measured here, not argued: the two keys below fail at `0.369` where
// `0.330` is expected.
//
// So this was a **test-fidelity failure standing in front of a real declaration defect**, and the
// order mattered. **Discharged 2026-09-04, wave 6K-d, in that order**: the round trip was run
// against the real adapter probe first and the wall columns returned exactly
// (`packages/three-adapter/tests/qa-6k-d-real-probe-round-trip.test.ts`), confirming ADR 0075
// decision 2; then `createFakeBodyProbe` was made to read the declaration instead of answering the
// request, and this assertion went green **without the catalogue being touched**. The declaration
// defect ADR 0075 decision 1 rules is still real and is fixed separately, on its own evidence — it
// is not what turned this test green, which is the whole point of the ordering.
//
// The same `createFakeBodyProbe` is wave 6K-e's subject from the opposite side (ADR 0074): there the
// real probe ignores the depth it is handed, here the fake obeys one the real probe does not.
// Between them the fake misreports every band, and the two waves owe one fix rather than two.
describe("the round trip a customer takes when they change their mind", () => {
  it("returns every column the swap does not re-declare the depth of", () => {
    const store = createStore();
    const started = columnDepthsM(store);
    const startedBuildIds = buildIdsByPlacementId(store);

    store.getState().setCabinetDepth(DEEPER_MM);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    const returned = columnDepthsM(store);
    const unmoved = columnsTheSwapDoesNotReDeclare(store, startedBuildIds);
    // A floor on the arm under test, not a total: without it the partition could match nothing and
    // this would pass while asserting about no column at all. Six of the twelve today, spanning both
    // walls and four bands — a base corner, a wall corner, a tall run and an appliance slot — and it
    // grows to twelve when 6K-d lands, so the floor survives the fix.
    expect(unmoved.length).toBeGreaterThanOrEqual(6);
    for (const key of unmoved) {
      expect(returned.get(key)).toBeCloseTo(started.get(key) ?? -1, 6);
    }
  });

  // **Flipped by wave 6K-d** (see the block above), and flipped rather than deleted: a removed
  // expected failure is indistinguishable from one that never existed (`docs/WORKFLOW.md`). It is
  // now an ordinary assertion and stays as the guard against the round trip regressing.
  //
  // **`it.fails` passes on any throw**, so a guard whose body crashes asserts nothing and the suite
  // still reports green. Wave 6K-b's adapter guard
  // (`packages/three-adapter/tests/qa-6k-b-probe-kit-depth.adversarial.test.ts`) was briefly in that
  // state. Print what one produces before trusting it.
  it("returns every column to the depth it published at the start", () => {
    const store = createStore();
    const started = columnDepthsM(store);

    store.getState().setCabinetDepth(DEEPER_MM);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    expect(columnDepthsM(store)).toEqual(started);
  });
});

/** The `buildId` each placement stands on, keyed by placement id. A depth change keeps every id, so
 *  this is what pairs a body before the rebuild with the entry it became. */
function buildIdsByPlacementId(store: Store): ReadonlyMap<string, string> {
  return new Map(
    store.getState().design.placements.map((p) => [p.id, p.body.buildId]),
  );
}

/** The columns none of whose members the rebuild swapped for an entry the catalogue declares at a
 *  **different frame depth**.
 *
 *  The partition names no build id and hard-codes no key: it asks the catalogue at the depth the
 *  round trip returns to, so it cannot go stale against the map, and it grows to the whole map on
 *  its own once 6K-d lands. A swap to an entry declared at the same depth is invisible to a column,
 *  which is why this is the right question rather than "did the id change" — only four of the twelve
 *  columns keep every id, and ten of them come back.
 *
 *  **Deliberately conservative: it certifies six of the ten that do return.** A column's depth is
 *  §3.2's MAX, so a member re-declared at a different depth need not be the one winning it — the
 *  four base columns are re-declared and come back anyway. Widening the partition to cover them
 *  would mean asking which member won the MAX, which is fitting the predicate to the answer. Every
 *  column this admits returns; the ones it declines to admit are simply not this test's claim. */
function columnsTheSwapDoesNotReDeclare(
  store: Store,
  before: ReadonlyMap<string, string>,
): readonly string[] {
  const catalog = buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);
  const declaredDepthMm = (buildId: string | undefined) =>
    buildId === undefined ? undefined : catalog.get(buildId)?.frameDepthMm;
  const reDeclared = new Set<string>();
  const everyColumn = new Set<string>();
  for (const record of store.getState().records) {
    everyColumn.add(record.col);
    if (
      declaredDepthMm(before.get(record.id)) !== declaredDepthMm(record.buildId)
    ) {
      reDeclared.add(record.col);
    }
  }
  return [...everyColumn].filter((key) => !reDeclared.has(key));
}

// `deepenedTo` projects the along-wall coordinate back out with the wall's own tangent, which is the
// one line in the wave that has to be right on both walls. Nothing in `cabinet-depth.test.ts` reads
// a wall B column, and the seeded kitchen is an L: `x` is the along-wall coordinate on wall A and the
// across-wall one on wall B, so a store that named the axis itself would pass every test in the wave
// and draw the whole of wall B in the wrong place.
describe("the wall the wave's own measurements do not read", () => {
  // **The along-wall half of this test was rewritten by wave 6J-d, and its axis half was not**
  // (ADR 0089 and ADR 0090 decision 2). It used to assert that a depth change moved a wall-B column
  // on the normal only. That was true of wave 6K-a and is false now: both walls walk from the room's
  // corner, so a wall-A body's *depth* is measured along wall B, and a deeper corner takes 100 mm of
  // wall B out of this column's coordinate. The axis question this test was written for — that the
  // store does not name the axis itself — is unchanged and is what the two `x` assertions carry.
  it("moves a wall B column across the wall and along it", () => {
    const store = createStore();
    const before = columnOf(store, OCCUPIED_WALL_B_KEY);

    store.getState().setCabinetDepth(DEEPER_MM);

    const after = columnOf(store, columnKeyAt(OCCUPIED_WALL_B_KEY, DEEPER_MM));
    expect(after.d).toBeGreaterThan(before.d);
    // Across the wall: wall B's normal is +X, and a column's origin is its own half depth along it.
    expect(after.x).toBeCloseTo(after.d / 2, 6);
    // Along the wall: wall B's tangent is +Z, and this column's members declare `base-formula`, so
    // it slides by what the corner's base carcass gained — 560 → 660 mm. Stated as the measured
    // number rather than read back through the production chain, which would assert it against
    // itself.
    expect(after.z).toBeCloseTo(before.z + 0.1, 6);
  });
});

// "Every command closed over the same map, so each one after a depth change would have answered at
// the old depth" is one of the three consequences 6K-a's commit message names, and it is the one the
// wave left with no measurement: `runCommand` reads `state.catalog`, and pinning that to a 600 mm map
// leaves the whole web suite green. These two are the tripwire for it and for the factory the store
// hands `setCabinetDepth`.
describe("what the store hands the commands after a depth change", () => {
  // The oracle is the domain command run with the real factory, which is the contract the store is
  // adapting. A store that handed `setCabinetDepth` a factory pinned at one depth would write the
  // new number into `settings` and leave every body at the old one — the "silent mixture"
  // `rebuildEveryBodyAt` names as the outcome it refuses — while still publishing a catalogue at the
  // new depth, so the wave's own catalogue assertions would not see it.
  it("rebuilds the bodies the domain command rebuilds, at the depth it was asked for", () => {
    const store = createStore();

    store.getState().setCabinetDepth(DEEPER_MM);

    const asTheCommandWritesIt = setCabinetDepthOnDesign({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm: DEEPER_MM,
      probeAt: createFakeProbeFactory(),
      occurredAt: OCCURRED_AT,
    });
    if (!asTheCommandWritesIt.ok) throw new Error("the oracle refused");
    expect(store.getState().design.placements).toEqual(
      asTheCommandWritesIt.design.placements,
    );
  });

  // A width change moves a body's width. Every command after a depth change is handed the store's
  // held catalogue, and a command answered against the map the session opened with would re-seat
  // this body at the depth the kitchen is no longer at while the customer was only dragging a
  // width chip.
  it("does not re-seat a resized body at the depth the kitchen has left", () => {
    const store = createStore();
    store.getState().setCabinetDepth(DEEPER_MM);
    const seatedWhenDeepenedMm = seatDepthMmOf(store, "p0");

    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().setWidth(700);

    expect(store.getState().lastRejection).toBeNull();
    // **The premise: the body really was standing at the deeper kitchen's depth before the resize.**
    // Against a store that *loaded* at the deeper depth, not against the column's clearance —
    // `Column.d` is §3.2's MAX over `occupiedDepthM`, a finished depth with the handle projection in
    // it, where a seat is the carcass. This compared the two until 2026-09-04 and they differ by
    // 40 mm on a base body; they were equal only while `createFakeBodyProbe` answered the depth it
    // was asked for, which wave 6K-d stopped it doing.
    expect(seatedWhenDeepenedMm).toBe(seatDepthMmOf(loadedAtDeeper(), "p0"));
    expect(seatDepthMmOf(store, "p0")).toBe(seatedWhenDeepenedMm);
  });
});

/** A store holding the design the domain command writes at the deeper setting — the oracle for
 *  "this body is standing at the deeper kitchen's depth", built through the command rather than
 *  through the store so it cannot agree with the store by sharing its path. */
function loadedAtDeeper(): Store {
  const written = setCabinetDepthOnDesign({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm: DEEPER_MM,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!written.ok) throw new Error("the oracle refused");
  return createStore(written.design);
}

function seatDepthMmOf(store: Store, placementId: string): number | undefined {
  return store
    .getState()
    .design.placements.find((placement) => placement.id === placementId)?.body
    .seatDepthMm;
}
