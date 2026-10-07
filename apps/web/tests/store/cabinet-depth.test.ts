// Every assertion is a measurable consequence of the depth a map was built at, never a comparison of two catalogue
// objects: two maps from the same builder are equally plausible objects.
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
/** Not offered, and below no floor, so the refusal it earns is `UNKNOWN_CABINET_DEPTH`, not the dishwasher floor's. */
const UNDECLARED_MM = 650;

/** A body whose depth follows the setting, so its frame depth says which depth a catalogue was built at. The corner,
 *  not a drawer stack: a depth change replaces `base-drawer3-600` with `base-3drawer`, while this id survives. */
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

/** The document a load delivers at the deeper setting, produced by the domain command so its bodies are the ones the
 *  engine would have written. */
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

/** The document whose geometry is measurable: it declares the depth but its bodies carry no measured seat.
 *  `deriveFrame` prefers `placement.body.seatDepthMm` over the catalogue's `frameDepthMm` (ADR 0011 Gap B), so a
 *  store answering from the wrong catalogue would still draw `DEEPENED_DESIGN` right; here only the catalogue
 *  supplies the depth. */
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
  // The premise every other test rests on: without it both sides of every comparison could be the same number.
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

  // A rebuilt map that never reached `deriveGeometry` would leave the frames and the columns at the old depth.
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

  // Every body is rebuilt through the insert path, so there is nothing to rebuild against without a probe.
  it("refuses with BODY_PROBE_UNAVAILABLE when no probe is attached", () => {
    const store = createStore({ withProbe: false });
    const heldDesign = store.getState().design;
    const heldFrameDepthMm = frameDepthMm(store.getState().catalog);

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(store.getState().design).toBe(heldDesign);
    expect(frameDepthMm(store.getState().catalog)).toBe(heldFrameDepthMm);
    expect(store.getState().lastRejection?.code).toBe("BODY_PROBE_UNAVAILABLE");
  });

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

// A depth change rebuilds every body in a column, so it is the one command after which a frozen extent cannot be
// carried forward unchanged on its depth axis; the along-wall and vertical axes stay frozen (ADR 0011 Gap D).
describe("the columns a depth change publishes", () => {
  /** A base run on wall A, occupied throughout: every member moves with the setting. */
  const OCCUPIED_BASE_KEY = "A|1.30";

  it("deepens an occupied column to the bodies the change rebuilt", () => {
    const store = createStore();
    const beforeM = columnOf(store.getState().columns, OCCUPIED_BASE_KEY).d;

    store.getState().setCabinetDepth(DEEPER_MM);

    // ADR 0079 decision 10 part 2: a published depth that no longer names the body it came from is invisible to every
    // other assertion here.
    assertSourcesExplainTheirDepths(store.getState(), "after setCabinetDepth");
    expect(beforeM).toBeCloseTo(0.62, 6);
    expect(columnOf(store.getState().columns, OCCUPIED_BASE_KEY).d).toBeCloseTo(
      0.72,
      6,
    );
  });

  // The origin is the column's half-depth on the wall's normal (`deriveColumns`).
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

  // `applyCommandResult` projects the published map into `columnExtents`, which the coalescer saves: a stale map
  // would reload stale.
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

  // A frozen extent stops re-deriving from its members: deleting the base body leaves a 620 mm opening that a depth
  // change must not collapse to the 330 mm the remaining wall body implies (ADR 0011 Gap D).
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

// A member-less column follows the setting like its run. The mapping is per chain, not a delta (base 620 → 720,
// wall 330 → 400), because a frozen extent records the `buildId` its depth came from (ADR 0073).
describe("a member-less column after a depth change", () => {
  it("follows the setting like the run it sits in", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p1" });
    store.getState().remove();
    const freedM = columnOf(store.getState().columns, "A|2.00").d;

    store.getState().setCabinetDepth(DEEPER_MM);

    const runM = columnOf(store.getState().columns, "A|1.30").d;
    const freedAfterM = columnOf(store.getState().columns, "A|2.00").d;
    expect(freedAfterM - freedM).toBeCloseTo(runM - 0.62, 6);
  });
});

// A body's `seatDepthMm` is twice its rear overhang (ADR 0018), so 100 mm of seat is 50 mm of position. Asserted on
// the seat, not a column depth: a column derives from the catalogue and a body's position from the measured seat,
// so a wrong seat leaves the columns correct.
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

    // Every placement comes back, so a body seated right by luck cannot carry one that was not.
    expect(seatedDepthsByPlacementId(store)).toEqual(startedAt);
  });
});

/** Where every body's back face stands, as `frame.d` (`deriveFrame`'s `seatDepthMm ?? frameDepthMm`): the seeded
 *  design carries no seats and a rebuilt body carries one, so comparing raw seats would say nothing. */
function seatedDepthsByPlacementId(
  store: ReturnType<typeof createStore>,
): ReadonlyMap<string, number> {
  return new Map(
    store.getState().records.map((record) => [record.id, record.frame.d]),
  );
}
