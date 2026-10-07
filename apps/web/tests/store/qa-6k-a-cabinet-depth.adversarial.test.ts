// Depths are asked of the domain (`occupiedDepthM`, the catalogue) rather than hand-written, so they follow the
// catalogue's parameterisation. A stale document is reloaded through the schema, because a map wrong for this
// session and one wrong for good are different defects.
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

/** A base run on wall A, occupied end to end, whose members all follow the setting. */
const OCCUPIED_BASE_KEY = "A|1.30";
/** The same on wall B, where `x` is across-wall (along-wall on wall A) — the transposition `deepenedTo` avoids. */
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

/** The design as a save and reload deliver it: through the wire schema, so what this accepts the API would store. */
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

/** §3.2's own answer for one column: the deepest member standing in the run. */
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

// A depth decrease must also rebuild the depth of a column whose members are all still present; the deepen-only guard
// in `atCurrentCabinetDepth` covers only extents frozen deeper than their members by a delete.
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

  // The extent is written into the document, so a stale depth would reload for good, not just for this session.
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

  // A stale extent is the opening a delete frees, and the inserted body is built to the clearance it reports.
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

// The published columns, not the document, return after 600 -> 700 -> 600 (ADR 0055 declines to promise the document).
// The fake probe reads the declared depth as the real adapter does; one echoing the request would publish 369 for
// the 291 mm wall-cabinet shell where 330 is expected.
describe("the round trip a customer takes when they change their mind", () => {
  it("returns every column the swap does not re-declare the depth of", () => {
    const store = createStore();
    const started = columnDepthsM(store);
    const startedBuildIds = buildIdsByPlacementId(store);

    store.getState().setCabinetDepth(DEEPER_MM);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    const returned = columnDepthsM(store);
    const unmoved = columnsTheSwapDoesNotReDeclare(store, startedBuildIds);
    // A floor on the arm under test: without it the partition could match nothing and pass vacuously.
    expect(unmoved.length).toBeGreaterThanOrEqual(6);
    for (const key of unmoved) {
      expect(returned.get(key)).toBeCloseTo(started.get(key) ?? -1, 6);
    }
  });

  it("returns every column to the depth it published at the start", () => {
    const store = createStore();
    const started = columnDepthsM(store);

    store.getState().setCabinetDepth(DEEPER_MM);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    expect(columnDepthsM(store)).toEqual(started);
  });
});

/** The `buildId` each placement stands on. A depth change keeps every id, so this pairs a body with its rebuild. */
function buildIdsByPlacementId(store: Store): ReadonlyMap<string, string> {
  return new Map(
    store.getState().design.placements.map((p) => [p.id, p.body.buildId]),
  );
}

/** The columns none of whose members the rebuild swapped for an entry declared at a different frame depth.
 *
 *  It asks the catalogue at the returned-to depth, so it names no build id or key. Deliberately conservative: a
 *  column's depth is §3.2's MAX, so a re-declared member need not win it, and widening the predicate to cover
 *  those columns would fit it to the answer. */
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

// `x` is along-wall on wall A and across-wall on wall B, so a store naming the axis itself would draw wall B wrong.
describe("the wall the wave's own measurements do not read", () => {
  // Both walls walk from the room's corner (ADR 0089): a wall-A body's depth is measured along wall B, so a deeper
  // corner takes 100 mm of wall B out of this column's coordinate.
  it("moves a wall B column across the wall and along it", () => {
    const store = createStore();
    const before = columnOf(store, OCCUPIED_WALL_B_KEY);

    store.getState().setCabinetDepth(DEEPER_MM);

    const after = columnOf(store, columnKeyAt(OCCUPIED_WALL_B_KEY, DEEPER_MM));
    expect(after.d).toBeGreaterThan(before.d);
    // Across the wall: wall B's normal is +X, and a column's origin is its own half depth along it.
    expect(after.x).toBeCloseTo(after.d / 2, 6);
    // Along the wall: wall B's tangent is +Z and these members declare `base-formula`, so it slides by the corner
    // base's gain, 560 → 660 mm; a stated number, since reading it back through the production chain asserts it
    // against itself.
    expect(after.z).toBeCloseTo(before.z + 0.1, 6);
  });
});

describe("what the store hands the commands after a depth change", () => {
  // The oracle is the domain command run with the real factory. A store handing it a factory pinned at one depth
  // would write the new number into `settings` and leave bodies at the old depth, while publishing the new catalogue.
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

  // A width change must be answered against the store's held catalogue, not the map the session opened with.
  it("does not re-seat a resized body at the depth the kitchen has left", () => {
    const store = createStore();
    store.getState().setCabinetDepth(DEEPER_MM);
    const seatedWhenDeepenedMm = seatDepthMmOf(store, "p0");

    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().setWidth(700);

    expect(store.getState().lastRejection).toBeNull();
    // The premise: the body really stood at the deeper depth, compared against a store loaded at that depth and not
    // `Column.d`, which is §3.2's MAX of finished depths (handle projection included) and 40 mm more than a seat.
    expect(seatedWhenDeepenedMm).toBe(seatDepthMmOf(loadedAtDeeper(), "p0"));
    expect(seatDepthMmOf(store, "p0")).toBe(seatedWhenDeepenedMm);
  });
});

/** A store holding the design the domain command writes at the deeper setting, built through the command rather
 *  than the store so the two cannot agree by sharing a path. */
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
