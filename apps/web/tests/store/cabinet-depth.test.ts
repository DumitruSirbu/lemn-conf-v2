// Wave 6K-a: the store's catalogue is always the one built at the held design's own cabinet depth.
//
// The defect these tests close is silent by construction. `/api/designs/[id]` already answers with a
// document carrying `settings.cabinetDepthMm`, and a store that closed over one `BodyCatalog` for
// its lifetime would evaluate a 700 mm kitchen against a 600 mm map — its records, its voids and
// every later command — with nothing to see. So every assertion here is a **measurable consequence**
// of the depth a map was built at, never a comparison of two catalogue objects: two maps from the
// same builder are equally plausible objects, and only the numbers in them tell the depths apart.
import {
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  setCabinetDepth as setCabinetDepthOnDesign,
  type BodyCatalog,
  type Column,
  type Design,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { assertSourcesExplainTheirDepths } from "../support/frozen-source-invariant";

const OCCURRED_AT = "2026-09-04T12:00:00.000Z";
const DEEPER_MM = 700;
/** Not offered, and below no floor — so the refusal it earns is `UNKNOWN_CABINET_DEPTH` and not the
 *  dishwasher floor's, which is a different rule with its own tests one package over. */
const UNDECLARED_MM = 650;

/** A body whose depth follows the setting (ADR 0058), so its frame depth is the one number that says
 *  which depth a catalogue was built at.
 *
 *  The corner rather than a drawer stack, because a depth change resolves every seeded body to its
 *  parameterised equivalent — `base-drawer3-600` becomes `base-3drawer` and is no longer placed —
 *  and this one keeps its id across the rebuild, so the same lookup reads both designs. */
const DEPTH_FOLLOWING_BUILD_ID = "base-corner-x-900";

function frameDepthMm(catalog: BodyCatalog): number {
  const definition = catalog.get(DEPTH_FOLLOWING_BUILD_ID);
  if (!definition) throw new Error(`${DEPTH_FOLLOWING_BUILD_ID} is not here`);
  return definition.frameDepthMm;
}

/** The same body's frame depth as the published records carry it, in metres — `Frame`'s unit. */
function recordFrameDepthM(records: readonly PlacementRecord[]): number {
  const record = records.find(
    (candidate) => candidate.buildId === DEPTH_FOLLOWING_BUILD_ID,
  );
  if (!record) throw new Error(`no ${DEPTH_FOLLOWING_BUILD_ID} is placed`);
  return record.frame.d;
}

const FRAME_DEPTH_AT_DEFAULT_MM = frameDepthMm(
  buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
);
const FRAME_DEPTH_WHEN_DEEPER_MM = frameDepthMm(
  buildKitchenLBodyCatalog(DEEPER_MM),
);

/** The document a load actually delivers at the deeper setting: produced by the domain command, so
 *  its bodies are the ones the engine would have written rather than the seeded design with one
 *  number edited into it. */
const DEEPENED_DESIGN: Design = (() => {
  const result = setCabinetDepthOnDesign({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm: DEEPER_MM,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`fixture refused: ${result.reason.code}`);
  return result.design;
})();

/** The other document a load delivers at the deeper setting, and the one the **geometry** is
 *  measurable on: a stored kitchen that declares the depth and whose bodies carry no measured seat
 *  of their own.
 *
 *  It is needed because `deriveFrame` prefers `placement.body.seatDepthMm` over the catalogue's
 *  `frameDepthMm` (ADR 0011 Gap B), so every body a depth change rebuilt carries its own depth in
 *  the document — and a store answering from the wrong catalogue would still produce the right
 *  frames for `DEEPENED_DESIGN` above. This shape is what `migrateDesign` parses and what
 *  `/api/designs/[id]` returns for a document written without measured seats, and here the
 *  catalogue is the **only** thing that can supply the depth. */
const DECLARED_DEEP_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm: DEEPER_MM },
};

interface StoreOverrides {
  readonly design?: Design;
  readonly withProbe?: boolean;
}

function createStore(overrides: StoreOverrides = {}) {
  const { design = KITCHEN_L_DESIGN, withProbe = true } = overrides;
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    ...(withProbe ? { probeAt: createFakeProbeFactory() } : {}),
    now: () => OCCURRED_AT,
  });
}

describe("the depth a store's catalogue is built at", () => {
  // The premise every other test rests on, asserted rather than assumed: a second depth is offered,
  // it is not the default, and it produces a genuinely different frame depth. Without this the file
  // could pass while both sides of every comparison were the same number.
  it("has two declared depths whose bodies are built to different frames", () => {
    expect(declaredCabinetDepthsMm()).toContain(DEEPER_MM);
    expect(DEEPER_MM).not.toBe(DEFAULT_CABINET_DEPTH_MM);
    expect(FRAME_DEPTH_WHEN_DEEPER_MM).not.toBe(FRAME_DEPTH_AT_DEFAULT_MM);
  });

  it("builds it at the constructing design's own depth", () => {
    const store = createStore({ design: DEEPENED_DESIGN });

    expect(frameDepthMm(store.getState().catalog)).toBe(
      FRAME_DEPTH_WHEN_DEEPER_MM,
    );
  });

  it("rebuilds it for a hydrated design carrying a non-default depth", () => {
    const store = createStore();
    expect(frameDepthMm(store.getState().catalog)).toBe(
      FRAME_DEPTH_AT_DEFAULT_MM,
    );

    store.getState().hydrate({
      design: DEEPENED_DESIGN,
      designId: "loaded-deep",
      revision: "1",
      canWrite: true,
    });

    expect(frameDepthMm(store.getState().catalog)).toBe(
      FRAME_DEPTH_WHEN_DEEPER_MM,
    );
  });

  // The catalogue is what the records are derived from, so a rebuilt map that never reached
  // `deriveGeometry` would leave the published geometry answering at the old depth — the frames the
  // scene draws and the columns the voids come out of.
  it("derives the hydrated design's geometry from that rebuilt catalogue", () => {
    const store = createStore();
    const seatedAtDefaultM = recordFrameDepthM(store.getState().records);

    store.getState().hydrate({
      design: DECLARED_DEEP_DESIGN,
      designId: "loaded-deep",
      revision: "1",
      canWrite: true,
    });

    expect(seatedAtDefaultM).toBeCloseTo(FRAME_DEPTH_AT_DEFAULT_MM / 1000, 6);
    expect(recordFrameDepthM(store.getState().records)).toBeCloseTo(
      FRAME_DEPTH_WHEN_DEEPER_MM / 1000,
      6,
    );
  });
});

describe("setCabinetDepth", () => {
  it("moves the design's setting and the store's catalogue together", () => {
    const store = createStore();
    const before = {
      cabinetDepthMm: store.getState().design.settings?.cabinetDepthMm,
      frameDepthMm: frameDepthMm(store.getState().catalog),
    };

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(before.cabinetDepthMm).toBe(DEFAULT_CABINET_DEPTH_MM);
    expect(before.frameDepthMm).toBe(FRAME_DEPTH_AT_DEFAULT_MM);
    expect(store.getState().design.settings?.cabinetDepthMm).toBe(DEEPER_MM);
    expect(frameDepthMm(store.getState().catalog)).toBe(
      FRAME_DEPTH_WHEN_DEEPER_MM,
    );
    expect(store.getState().lastRejection).toBeNull();
  });

  it("hands the applied design to the save seam", () => {
    const saved: Design[] = [];
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => OCCURRED_AT,
      onDesignChanged: (design) => {
        saved.push(design);
      },
    });

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(saved).toHaveLength(1);
    expect(saved[0]?.settings?.cabinetDepthMm).toBe(DEEPER_MM);
  });

  it("changes neither the design nor the catalogue when the depth is not declared", () => {
    const store = createStore();
    const heldDesign = store.getState().design;
    const heldFrameDepthMm = frameDepthMm(store.getState().catalog);

    store.getState().setCabinetDepth(UNDECLARED_MM);

    expect(store.getState().design).toBe(heldDesign);
    expect(frameDepthMm(store.getState().catalog)).toBe(heldFrameDepthMm);
    expect(store.getState().lastRejection?.code).toBe("UNKNOWN_CABINET_DEPTH");
  });

  // The same safety net `insert` carries, and the same refusal: every body is rebuilt through the
  // insert path, so there is nothing to rebuild against without a probe.
  it("refuses with BODY_PROBE_UNAVAILABLE when no probe is attached", () => {
    const store = createStore({ withProbe: false });
    const heldDesign = store.getState().design;
    const heldFrameDepthMm = frameDepthMm(store.getState().catalog);

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(store.getState().design).toBe(heldDesign);
    expect(frameDepthMm(store.getState().catalog)).toBe(heldFrameDepthMm);
    expect(store.getState().lastRejection?.code).toBe("BODY_PROBE_UNAVAILABLE");
  });

  // A refusal must not persist anything — the store's standing rule for every command, restated
  // here because this is the first one whose success also replaces the catalogue.
  it("schedules no save on a refusal", () => {
    const saved: Design[] = [];
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      now: () => OCCURRED_AT,
      onDesignChanged: (design) => {
        saved.push(design);
      },
    });

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(saved).toHaveLength(0);
  });
});

// A column is §3.2's space a run occupies, and its depth axis — `d`, and the across-wall origin at
// `d / 2` — is a function of the bodies standing in it. A depth change rebuilds every one of those
// bodies, so it is the one command after which a frozen extent cannot be carried forward unchanged.
//
// The extent is still frozen on its **along-wall and vertical** axes (ADR 0011 Gap D, ADR 0053): the
// width a partial delete left behind is the customer's, not a function of anything. Only the depth
// axis moves, and only where a member is standing there to measure it.
describe("the columns a depth change publishes", () => {
  /** A base run on wall A, occupied throughout — the ordinary case, where every member moves with
   *  the setting and the column's whole depth axis is derivable from them. */
  const OCCUPIED_BASE_KEY = "A|1.30";

  it("deepens an occupied column to the bodies the change rebuilt", () => {
    const store = createStore();
    const beforeM = columnOf(store.getState().columns, OCCUPIED_BASE_KEY).d;

    store.getState().setCabinetDepth(DEEPER_MM);

    // ADR 0079 decision 10 part 2: the state predicate, run here as well as in this wave's own file,
    // so an ordinary depth-change test carries it. A published depth that no longer names the body it
    // came from is invisible to every other assertion below — both 6K-c defects looked exactly like a
    // green run of this test.
    assertSourcesExplainTheirDepths(store.getState(), "after setCabinetDepth");
    expect(beforeM).toBeCloseTo(0.62, 6);
    expect(columnOf(store.getState().columns, OCCUPIED_BASE_KEY).d).toBeCloseTo(
      0.72,
      6,
    );
  });

  // The origin is the column's own half-depth on the wall's normal (`deriveColumns`), so a depth
  // that moved without its origin would leave the run drawn where the shallower kitchen stood.
  it("moves that column's across-wall origin with its depth", () => {
    const store = createStore();
    const beforeM = columnOf(store.getState().columns, OCCUPIED_BASE_KEY).z;

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(beforeM).toBeCloseTo(0.31, 6);
    expect(columnOf(store.getState().columns, OCCUPIED_BASE_KEY).z).toBeCloseTo(
      0.36,
      6,
    );
  });

  // The durable half. `applyCommandResult` projects the map it publishes into `columnExtents`, and
  // that document is what the coalescer saves — so a stale map does not merely mis-answer this
  // session, it reloads stale for good.
  it("writes the deepened extent into the document it hands on to be saved", () => {
    const store = createStore();

    store.getState().setCabinetDepth(DEEPER_MM);

    const stored = store
      .getState()
      .design.columnExtents?.find(
        (extent) => extent.wall === "A" && extent.alongMm === 1300,
      );
    expect(stored?.depthMm).toBe(720);
  });

  // The anti-invariant, and the half ADR 0011 Gap D exists to protect: re-deriving an occupied
  // column's extent from its current members is what a frozen extent **stops** doing. Delete the
  // base body out of a column that still carries a wall body and the freed opening is 620 mm deep
  // because a base cabinet stood there; a depth change must not collapse it to the 330 mm the
  // remaining wall body implies. The column deepens to its members or stays where it was frozen —
  // never shallower than either.
  it("never makes a frozen extent shallower than it was frozen at", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p1" });
    store.getState().remove();
    const freedM = columnOf(store.getState().columns, "A|2.00").d;

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(freedM).toBeCloseTo(0.62, 6);
    expect(
      columnOf(store.getState().columns, "A|2.00").d,
    ).toBeGreaterThanOrEqual(freedM);
  });
});

function columnOf(columns: ReadonlyMap<string, Column>, key: string): Column {
  const column = columns.get(key);
  if (!column) throw new Error(`no column ${key} is published`);
  return column;
}

// **Flipped by wave 6K-c, and flipped rather than deleted**: a removed expected failure is
// indistinguishable from one that never existed (`docs/WORKFLOW.md`). The assertion below is exactly
// the one the failing guard carried.
//
// Wave 6K-a's `atCurrentCabinetDepth` re-answered a frozen extent from the members standing in it.
// It could not re-answer the half **no member explains**: the body that froze the depth is gone, and
// the mapping is per chain rather than a delta, so a base run goes 620 → 720 while a wall run goes
// 330 → 400. [ADR 0073](../../../../docs/decisions/0073-a-frozen-extent-records-the-body-its-depth-came-from.md)
// rules on it — a frozen extent records the `buildId` its depth came from, and a depth change
// re-asks that entry in the catalogue built at the new setting — and wave 6K-c implements it.
//
// **`it.fails` passes on any throw**, so a guard whose body crashes asserts nothing and the suite
// still reports green. Wave 6K-b's adapter guard
// (`packages/three-adapter/tests/qa-6k-b-probe-kit-depth.adversarial.test.ts`) was briefly in that
// state. Print what one produces before trusting it.
describe("a member-less column after a depth change", () => {
  it("follows the setting like the run it sits in", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p1" });
    store.getState().remove();
    const freedM = columnOf(store.getState().columns, "A|2.00").d;

    store.getState().setCabinetDepth(DEEPER_MM);

    // The base run beside it deepens by the setting's own delta; the freed opening does not.
    const runM = columnOf(store.getState().columns, "A|1.30").d;
    const freedAfterM = columnOf(store.getState().columns, "A|2.00").d;
    expect(freedAfterM - freedM).toBeCloseTo(runM - 0.62, 6);
  });
});

// **The customer-visible claim, and the one the visual pass measured through the UI.**
//
// A body's `seatDepthMm` is twice its rear overhang (ADR 0018), so it is what places the body
// against the wall — 100 mm of seat is 50 mm of position. Before wave 6K-e the store handed
// `setCabinetDepth` the scene's standing probe, whose kit was at the depth the session was
// **leaving**, so on the way back from 700 every rebuilt body was seated for a 700 mm kitchen and
// stood 50 mm proud of the back wall in a 600 mm one. Measured in a browser at 390 x 844 on
// 2026-09-04, before the fix:
//
//     base carcasses  0.000..0.620 -> 0.050..0.670   (the whole run 50 mm off the wall)
//     end panel       80 mm of carcass standing in front of the panel meant to hide it
//     at 700          the run 50 mm *inside* the wall (min z = -0.05)
//
// Asserted here on the seat rather than on a column depth, because the columns came back correctly
// even while this was broken — a column is derived from the catalogue, a body's position from the
// measured seat, and only the second one moved.
describe("the round trip a customer takes, measured where they can see it", () => {
  it("returns every body to the depth it stood at when it started", () => {
    const store = createStore();
    const startedAt = seatedDepthsByPlacementId(store);

    store.getState().setCabinetDepth(DEEPER_MM);
    const deepened = seatedDepthsByPlacementId(store);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    // Not a value compared with itself: the middle leg really does move the bodies it rebuilds.
    const moved = [...deepened].filter(
      ([id, depthM]) => depthM !== startedAt.get(id),
    );
    expect(moved.length).toBeGreaterThan(0);

    // And they come back — every placement, so a body seated right by luck cannot carry one that
    // was not. Before wave 6K-e the base run came back 50 mm out.
    expect(seatedDepthsByPlacementId(store)).toEqual(startedAt);
  });
});

/** Where every body's back face stands, as `frame.d` — `deriveFrame`'s
 *  `seatDepthMm ?? frameDepthMm`, so a seeded body with no measured seat and a rebuilt one with one
 *  are read the same way. That resolution is the point: the seeded design carries **no** seats at
 *  all and every body carries one after a rebuild, so comparing raw seats would compare `undefined`
 *  with a number and say nothing about where anything stands. */
function seatedDepthsByPlacementId(
  store: ReturnType<typeof createStore>,
): ReadonlyMap<string, number> {
  return new Map(
    store.getState().records.map((record) => [record.id, record.frame.d]),
  );
}
