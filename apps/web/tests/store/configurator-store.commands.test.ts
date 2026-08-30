// M3 work item 9: the four store commands.
//
// The store is an adapter, so what is asserted here is adapter behaviour — one update per command,
// the frozen column map, a selection that never dangles, and a refusal that leaves everything
// alone. The product rules themselves belong to `@lemnaria/configurator-domain` and are asserted
// there; re-asserting them through the store would only hide which layer had broken.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  widthOptionsFor,
  type BodyProbe,
  type Design,
} from "@lemnaria/configurator-domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "../../src/store/configurator-store";
import { columnExtents } from "../support/column-extents";
import { createFakeBodyProbe } from "../support/fake-body-probe";

/** The fridge column of the §10 signature flow: `p7` (0 – 1.85) with `p24` (1.85 – 2.60) above it,
 *  and a frozen `top` of 2.60. Every column-stability case below is expressed against it. */
const FRIDGE_COLUMN = "B|2.45";
const FRIDGE_COLUMN_TOP_M = 2.6;
/** The hob-bearing base. ADR 0027 made the hob part of its body, so deleting it takes the hob with
 *  it and there is no separate placement to cascade. */
const HOB_HOST_ID = "p2";
const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

/** The store's own probe, reused where a test has to ask §9's width query what it would offer. */
const PROBE = createFakeBodyProbe();

interface StoreOverrides {
  readonly onDesignChanged?: (design: unknown) => void;
  readonly bodyProbe?: BodyProbe;
  readonly design?: Design;
}

function createStore(overrides: StoreOverrides = {}) {
  return createConfiguratorStore({
    design: overrides.design ?? KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    now: () => OCCURRED_AT,
    bodyProbe: overrides.bodyProbe ?? createFakeBodyProbe(),
    ...(overrides.onDesignChanged
      ? { onDesignChanged: overrides.onDesignChanged }
      : {}),
  });
}

type Store = ReturnType<typeof createStore>;

function removeById(store: Store, placementId: string) {
  store.getState().select({ kind: "placement", id: placementId });
  store.getState().remove();
}

function voidsIn(store: Store, col: string) {
  return store.getState().voids.filter((record) => record.col === col);
}

/** Everything a command must not touch when it refuses. Compared by identity, not by value: a
 *  re-derived but equal `records` array is exactly the defect this sweep exists to catch. */
const UNTOUCHED_BY_A_REFUSAL = [
  "design",
  "records",
  "columns",
  "voids",
  "selection",
  "designId",
  "saveStatus",
  "hasPersistedSuccessfully",
] as const;

function snapshotOf(state: ConfiguratorState) {
  return Object.fromEntries(
    UNTOUCHED_BY_A_REFUSAL.map((key) => [key, state[key]]),
  );
}

function expectUnchanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  for (const key of UNTOUCHED_BY_A_REFUSAL) {
    expect(after[key], `${key} changed on a refused command`).toBe(before[key]);
  }
}

describe("remove", () => {
  it("applies the design, records, voids and selection in a single update", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p24" });
    const updates = vi.fn();
    const unsubscribe = store.subscribe(updates);

    store.getState().remove();
    unsubscribe();

    const state = store.getState();
    expect(updates).toHaveBeenCalledTimes(1);
    expect(state.design).not.toBe(KITCHEN_L_DESIGN);
    expect(state.design.placements).toHaveLength(
      KITCHEN_L_DESIGN.placements.length - 1,
    );
    expect(state.records.map((record) => record.id)).not.toContain("p24");
    expect(voidsIn(store, FRIDGE_COLUMN)).toHaveLength(1);
    expect(state.selection).toEqual({ kind: "void", id: "B|2.45:v0:1.85" });
  });

  it("selects the void covering the vacated frame, found by geometry rather than by y0", () => {
    const store = createStore();
    removeById(store, "p7");
    // `p24`'s frame starts at 1.85; the void that covers it starts at 1.50, because removing the
    // fridge below merged the two free spans. A lookup keyed on the vacated y0 would find nothing.
    removeById(store, "p24");

    expect(store.getState().selection).toEqual({
      kind: "void",
      id: "B|2.45:v1:1.50",
    });
  });

  it("survives a merge that renumbers void ids — a remembered id would now dangle", () => {
    const store = createStore();
    removeById(store, "p24");
    const selectedBeforeTheMerge = store.getState().selection;
    expect(selectedBeforeTheMerge).toEqual({
      kind: "void",
      id: "B|2.45:v0:1.85",
    });

    removeById(store, "p7");

    const ids = store.getState().voids.map((record) => record.id);
    expect(ids).not.toContain("B|2.45:v0:1.85");
    expect(store.getState().selection).toEqual({
      kind: "void",
      id: "B|2.45:v0:0.00",
    });
    expect(ids).toContain("B|2.45:v0:0.00");
  });

  // R2.1 / F1: two level-adjacent voids share the 2.20 module line, and the search used to widen
  // past it — so clearing a column downwards selected the wall slot after deleting the top unit.
  it("selects the top slot when the wall unit below it is already gone", () => {
    const store = createStore();

    removeById(store, "p8");
    expect(store.getState().selection).toEqual({
      kind: "void",
      id: "A|0.30:v0:1.50",
    });
    removeById(store, "p15");

    expect(store.getState().selection).toEqual({
      kind: "void",
      id: "A|0.30:v1:2.20",
    });
    const selected = store
      .getState()
      .voids.find((record) => record.id === "A|0.30:v1:2.20");
    expect(selected?.y0).toBeCloseTo(2.2, 6);
  });

  it("takes the hob away with the cabinet it is built into", () => {
    const store = createStore();
    expect(store.getState().records.map((record) => record.id)).toContain(
      HOB_HOST_ID,
    );

    removeById(store, HOB_HOST_ID);

    expect(store.getState().records.map((record) => record.id)).not.toContain(
      HOB_HOST_ID,
    );
  });
});

describe("insert", () => {
  // The store needs **no** wiring for what a command drops: `applyCommandResult` re-derives
  // `records` and `voids` from the result's whole `Design`, so a placement the command removed is
  // simply not in the design it applies. Kept as a swap case because the hob base is the one body
  // whose swap replaces a placement that carries something (ADR 0027's `carriesAccessoryKind`), so
  // it is where a store that started tracking placement contents by hand would diverge first.
  it("swaps the hob base for the oven variant without leaving the old id behind", () => {
    const store = createStore();

    store.getState().select({ kind: "placement", id: HOB_HOST_ID });
    store.getState().insert("base-hob-oven");

    const state = store.getState();
    expect(state.lastRejection).toBeNull();
    expect(state.records.map((record) => record.id)).not.toContain(HOB_HOST_ID);
    expect(
      state.design.placements.some(
        (placement) => placement.body.buildId === "base-hob-oven",
      ),
    ).toBe(true);
  });

  it("applies the new placement and selects it, in a single update", () => {
    const store = createStore();
    removeById(store, "p7");
    const updates = vi.fn();
    const unsubscribe = store.subscribe(updates);

    // A ladder body: the fridge column is 700 mm, and ADR 0033's merged `base-cabinet` carries
    // `[200, 300, 400, 600, 800]` as a bound. What is under test is the store's single update.
    store.getState().insert("base-3drawer");
    unsubscribe();

    const state = store.getState();
    expect(updates).toHaveBeenCalledTimes(1);
    expect(state.selection).toEqual({ kind: "placement", id: "n0" });
    expect(state.records.map((record) => record.id)).toContain("n0");
    expect(state.design.placements.at(-1)?.id).toBe("n0");
    // The 0 – 0.86 slot the body filled is gone; the 1.50 slot above it survives, renumbered.
    expect(voidsIn(store, FRIDGE_COLUMN).map((record) => record.id)).toEqual([
      "B|2.45:v0:1.50",
    ]);
  });

  it("refuses when the scene has attached no probe, and leaves the store untouched", () => {
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      now: () => OCCURRED_AT,
    });
    store.getState().select({ kind: "placement", id: "p0" });
    const before = snapshotOf(store.getState());
    expect(store.getState().isBodyProbeAttached).toBe(false);

    store.getState().insert("base-3drawer");

    expectUnchanged(before, snapshotOf(store.getState()));
    expect(store.getState().lastRejection?.code).toBe("BODY_PROBE_UNAVAILABLE");
    expect(store.getState().lastRejection?.message).toMatch(/[ăâîșț]/);
  });

  it("refuses again once the scene detaches its probe on unmount", () => {
    const store = createStore();
    removeById(store, "p7");

    store.getState().detachBodyProbe();
    store.getState().insert("base-3drawer");

    expect(store.getState().isBodyProbeAttached).toBe(false);
    expect(store.getState().lastRejection?.code).toBe("BODY_PROBE_UNAVAILABLE");
    expect(store.getState().records.map((record) => record.id)).not.toContain(
      "n0",
    );
  });

  it("fails the same way with and without a probe when nothing is selected", () => {
    const withoutProbe = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
    });
    const withProbe = createStore();
    withProbe.getState().deselect();

    withoutProbe.getState().insert("base-cabinet");
    withProbe.getState().insert("base-cabinet");

    // The probe check sits behind the selection check, so a caller doing the same wrong thing gets
    // the same refusal whether or not the scene has mounted yet.
    expect(withoutProbe.getState().lastRejection?.code).toBe(
      "TARGET_NOT_FOUND",
    );
    expect(withProbe.getState().lastRejection?.code).toBe("TARGET_NOT_FOUND");
  });

  it("accepts the probe the scene attaches after the store was built", () => {
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      now: () => OCCURRED_AT,
    });
    store.getState().attachBodyProbe(createFakeBodyProbe());
    removeById(store, "p7");

    store.getState().insert("base-3drawer");

    expect(store.getState().isBodyProbeAttached).toBe(true);
    expect(store.getState().selection).toEqual({ kind: "placement", id: "n0" });
  });
});

describe("setWidth", () => {
  /** ADR 0031 funds a resize from an adjacent column that is empty at **every** level, and the
   *  shipped kitchen has none at load — so every case here deletes first, through the store's own
   *  `remove`. That is the customer's real sequence, not a fixture shortcut. */
  function storeWithEmptyColumn() {
    const store = createStore();
    for (const id of ["p1", "p12", "p18"]) removeById(store, id);
    return store;
  }

  /** A width the engine will accept on `p11`, asked of the same query §9's chips come from, so this
   *  test cannot drift from what the panel would have offered. */
  function firstFreeWidthMm(store: Store, placementId: string): number {
    const state = store.getState();
    const free = widthOptionsFor({
      design: state.design,
      catalog: state.catalog,
      columns: state.columns,
      target: { kind: "placement", id: placementId },
      probe: PROBE,
    }).find((option) => option.verdict.status === "available");
    if (!free) throw new Error(`no free width on ${placementId}`);
    return free.widthMm;
  }

  it("applies the design, records, voids and columns in a single update", () => {
    const store = storeWithEmptyColumn();
    store.getState().select({ kind: "placement", id: "p11" });
    const widthMm = firstFreeWidthMm(store, "p11");
    const before = store.getState().design;
    const updates = vi.fn();
    const unsubscribe = store.subscribe(updates);

    store.getState().setWidth(widthMm);
    unsubscribe();

    const state = store.getState();
    expect(updates).toHaveBeenCalledTimes(1);
    expect(state.design).not.toBe(before);
    expect(state.lastRejection).toBeNull();
    expect(state.records.find((record) => record.id === "p11")?.widthMm).toBe(
      widthMm,
    );
  });

  // ADR 0031 rule 1: the whole column moves, not the body that was tapped. `p11` shares `A|1.30`
  // with the sink `p0` and the top cabinet `p17`, and all three must come out at the new width —
  // a resize that moved one of them would leave the column with two boundaries.
  it("resizes every member of the selected body's column", () => {
    const store = storeWithEmptyColumn();
    store.getState().select({ kind: "placement", id: "p11" });
    const widthMm = firstFreeWidthMm(store, "p11");

    store.getState().setWidth(widthMm);

    for (const id of ["p0", "p11", "p17"]) {
      expect([
        id,
        store.getState().records.find((record) => record.id === id)?.widthMm,
      ]).toEqual([id, widthMm]);
    }
  });

  // **The one command whose own column map replaces the store's** (`BodyResizedEffect.columns`).
  // A column's key comes from a body's centre, so a resize moves every member off the key that held
  // them; the store must take the command's answer rather than re-deriving one, because *which*
  // keys may change is a rule about the move (ADR 0011 Gap D). Re-deriving globally is what makes a
  // delete stop producing openings.
  it("takes the command's column map, so no member is left under a key that moved", () => {
    const store = storeWithEmptyColumn();
    const before = store.getState().columns;
    store.getState().select({ kind: "placement", id: "p11" });

    store.getState().setWidth(firstFreeWidthMm(store, "p11"));

    const state = store.getState();
    expect(state.columns).not.toBe(before);
    for (const record of state.records) {
      expect([record.id, state.columns.has(record.col)]).toEqual([
        record.id,
        true,
      ]);
    }
  });

  // The voids have to be recomputed against the map the resize produced, not the one that went in:
  // the move changes the boundary between two columns, and an opening derived from the pre-move
  // extents would be drawn where nothing is free any more.
  it("derives its openings from the moved columns", () => {
    const store = storeWithEmptyColumn();
    store.getState().select({ kind: "placement", id: "p11" });

    store.getState().setWidth(firstFreeWidthMm(store, "p11"));

    const state = store.getState();
    for (const opening of state.voids) {
      expect([opening.id, state.columns.has(opening.col)]).toEqual([
        opening.id,
        true,
      ]);
    }
  });

  // §9 disables a chip it cannot satisfy, so this is the safety net beneath that rather than the
  // gate — the same arrangement `insert` has.
  it("refuses without a probe, and changes nothing", () => {
    const store = createStore();
    store.getState().detachBodyProbe();
    store.getState().select({ kind: "placement", id: "p11" });
    const before = snapshotOf(store.getState());

    store.getState().setWidth(600);

    expect(store.getState().lastRejection?.code).toBe("BODY_PROBE_UNAVAILABLE");
    expectUnchanged(before, snapshotOf(store.getState()));
  });

  it("refuses with nothing selected, the way every other command does", () => {
    const store = createStore();
    store.getState().setWidth(600);
    expect(store.getState().lastRejection?.code).toBe("TARGET_NOT_FOUND");
  });

  // A refusal persists nothing: the save seam runs only after a command the store applied.
  it("schedules no save when the engine refuses the width", () => {
    const onDesignChanged = vi.fn();
    const store = createStore({ onDesignChanged });
    store.getState().select({ kind: "placement", id: "p11" });

    store.getState().setWidth(400);

    expect(store.getState().lastRejection).not.toBeNull();
    expect(onDesignChanged).not.toHaveBeenCalled();
  });
});

describe("setFinish and setHandle", () => {
  it("setFinish records the choice on the selected placement and keeps it selected", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p0" });
    const updates = vi.fn();
    const unsubscribe = store.subscribe(updates);

    store.getState().setFinish("oak");
    unsubscribe();

    const state = store.getState();
    expect(updates).toHaveBeenCalledTimes(1);
    expect(
      state.design.placements.find((placement) => placement.id === "p0")?.body
        .finish,
    ).toBe("oak");
    expect(state.records.find((record) => record.id === "p0")?.finishKey).toBe(
      "oak",
    );
    expect(state.selection).toEqual({ kind: "placement", id: "p0" });
  });

  it("setHandle records the mode on the selected placement and keeps it selected", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p0" });

    store.getState().setHandle("push");

    const state = store.getState();
    expect(
      state.design.placements.find((placement) => placement.id === "p0")?.body
        .handle,
    ).toBe("push");
    expect(state.records.find((record) => record.id === "p0")?.handleMode).toBe(
      "push",
    );
    expect(state.selection).toEqual({ kind: "placement", id: "p0" });
  });
});

describe("a refused command", () => {
  let store: Store;
  let onDesignChanged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onDesignChanged = vi.fn();
    store = createStore({ onDesignChanged });
    // A void is selected: every command below refuses, each for its own recorded reason.
    removeById(store, "p7");
    onDesignChanged.mockClear();
  });

  const refusals: readonly (readonly [
    string,
    (state: ConfiguratorState) => void,
    string,
  ])[] = [
    [
      "remove",
      (state) => {
        state.remove();
      },
      "VOID_SELECTED",
    ],
    [
      "insert",
      (state) => {
        state.insert("not-a-catalogue-id");
      },
      "NOT_IN_LIBRARY",
    ],
    [
      "setFinish",
      (state) => {
        state.setFinish("oak");
      },
      "VOID_SELECTED",
    ],
    [
      "setHandle",
      (state) => {
        state.setHandle("push");
      },
      "VOID_SELECTED",
    ],
  ];

  for (const [name, run, code] of refusals) {
    it(`${name} leaves the whole store snapshot identical and schedules no save`, () => {
      const before = snapshotOf(store.getState());

      run(store.getState());

      expectUnchanged(before, snapshotOf(store.getState()));
      expect(store.getState().lastRejection?.code).toBe(code);
      expect(store.getState().lastRejection?.message).toBeTruthy();
      expect(onDesignChanged).not.toHaveBeenCalled();
    });
  }

  it("refuses a command issued with nothing selected", () => {
    store.getState().deselect();
    const before = snapshotOf(store.getState());

    store.getState().remove();

    expectUnchanged(before, snapshotOf(store.getState()));
    expect(store.getState().lastRejection?.code).toBe("TARGET_NOT_FOUND");
  });
});

describe("column stability (ADR 0011 Gap D)", () => {
  it("deleting a column's top unit leaves `top` where it was and frees a void", () => {
    const store = createStore();
    const frozenTop = store.getState().columns.get(FRIDGE_COLUMN)?.top;
    expect(frozenTop).toBeCloseTo(FRIDGE_COLUMN_TOP_M, 6);

    removeById(store, "p24");

    expect(store.getState().columns.get(FRIDGE_COLUMN)?.top).toBeCloseTo(
      FRIDGE_COLUMN_TOP_M,
      6,
    );
    // A recomputed column would have shrunk to 1.85 and freed nothing at all.
    expect(voidsIn(store, FRIDGE_COLUMN)).toHaveLength(1);
    expect(voidsIn(store, FRIDGE_COLUMN)[0]?.h).toBeCloseTo(0.75, 6);
  });

  it("deleting a column's last member leaves the column in the map and the run selectable", () => {
    const store = createStore();
    const extentsBefore = columnExtents(store.getState().columns);

    removeById(store, "p7");
    removeById(store, "p24");

    expect(columnExtents(store.getState().columns)).toEqual(extentsBefore);
    expect(store.getState().columns.has(FRIDGE_COLUMN)).toBe(true);
    expect(
      store.getState().records.some((record) => record.col === FRIDGE_COLUMN),
    ).toBe(false);
    expect(voidsIn(store, FRIDGE_COLUMN).map((record) => record.h)).toEqual([
      expect.closeTo(0.86, 6),
      expect.closeTo(0.7, 6),
      expect.closeTo(0.4, 6),
    ]);
  });

  it("keeps every column's extent identical across every kind of command", () => {
    const store = createStore();
    const extentsBefore = columnExtents(store.getState().columns);

    removeById(store, "p7");
    store.getState().insert("base-3drawer");
    store.getState().setFinish("oak");
    store.getState().setHandle("push");

    expect(columnExtents(store.getState().columns)).toEqual(extentsBefore);
  });

  // The one column field a command *is* allowed to change, and must: §7's head-clearance cap asks
  // what stands under an opening now. Frozen, this answered "a column still stands here" for a run
  // whose full-height unit had just been deleted, while the same design reloaded answered "none".
  it("re-answers `hasFullHeightUnder` when the full-height unit under a run is deleted", () => {
    const store = createStore();
    expect(store.getState().columns.get("B|2.45")?.hasFullHeightUnder).toBe(
      true,
    );

    // `p7` is the run's only full-height member and the neighbouring tall unit ends 50 mm to its
    // left, so nothing is left under the opening. The column keeps its frozen `top` regardless.
    removeById(store, "p7");

    expect(store.getState().columns.get("B|2.45")?.hasFullHeightUnder).toBe(
      false,
    );
    expect(store.getState().columns.get("B|2.45")?.top).toBeCloseTo(2.6, 6);
  });
});

describe("the selection after a command", () => {
  it("never dangles: it names an existing placement, an existing void, or nothing", () => {
    const store = createStore();
    const commands: readonly ((state: ConfiguratorState) => void)[] = [
      (state) => {
        state.select({ kind: "placement", id: "p7" });
        state.remove();
      },
      (state) => {
        state.insert("base-cabinet");
      },
      (state) => {
        state.setFinish("oak");
      },
      (state) => {
        state.setHandle("push");
      },
      (state) => {
        // A refused command: the corner leg stays selected, and it still exists.
        state.select({ kind: "placement", id: "p25" });
        state.remove();
      },
      (state) => {
        // A successful delete of a body that was not the one selected a step ago.
        state.select({ kind: "placement", id: HOB_HOST_ID });
        state.remove();
      },
    ];

    for (const command of commands) {
      command(store.getState());
      const { selection, records, voids } = store.getState();
      if (!selection) continue;
      const pool =
        selection.kind === "placement"
          ? records.map((record) => record.id)
          : voids.map((record) => record.id);
      expect(pool).toContain(selection.id);
    }
  });
});

describe("the save seam", () => {
  it("calls onDesignChanged after the store has applied the edit, with the new design", () => {
    const seen: unknown[] = [];
    const store = createStore({
      onDesignChanged: (design) => {
        seen.push([design, store.getState().design]);
      },
    });

    removeById(store, "p7");

    expect(seen).toHaveLength(1);
    const [design, applied] = seen[0] as [unknown, unknown];
    expect(design).toBe(store.getState().design);
    expect(applied).toBe(design);
  });
});
