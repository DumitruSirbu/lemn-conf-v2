// Adversarial QA for M3 Wave 3C-1.
//
// The implementer's suite checks each command once. This file attacks the invariants across *long
// sequences*, which is where frozen columns and a non-dangling selection actually fail: the store
// applies one command correctly and the tenth one carries the drift. Every case below therefore
// asserts a property after every command in a sequence rather than after one hand-picked call.
import { createBodyProbeLease } from "@lemnaria/configurator-domain";
import {
  cabinetDepthMmOf,
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  type Design,
} from "@lemnaria/configurator-domain";

import { describe, expect, it, vi } from "vitest";

import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "../../src/store/configurator-store";
import { columnExtents } from "../support/column-extents";
import {
  createFakeBodyProbe,
  createFakeProbeFactory,
} from "../support/fake-body-probe";
import { LEGACY_ENUM_FINISHES } from "@lemnaria/configurator-domain";

/** The revision a hydrating loader reports. These tests are about identity and generation, not
 *  about concurrency, so one value throughout keeps them readable. */
const LOADED_REVISION = "1";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";
/** The §10 signature flow's column: the freestanding fridge `p7` (0–1.85) with `p24` above it. */
const FRIDGE_COLUMN = "B|2.45";
const HOB_HOST_ID = "p2";
/** An id no longer in any design — `p3` was the hob's own placement until ADR 0027 folded it into
 *  `p2`'s body. ADR 0027 point 4 **retires the id and forbids its reuse**, which is what makes it
 *  permanently safe to stand for "resolves to nothing" here: no future seeded body can claim it and
 *  turn this into a live-target test without that ADR being reopened first. */
const MISSING_ID = "p3";

interface StoreOverrides {
  readonly onDesignChanged?: (design: Design) => void;
  readonly withProbe?: boolean;
  readonly design?: Design;
}

function createStore(overrides: StoreOverrides = {}) {
  return createConfiguratorStore({
    design: overrides.design ?? KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    ...(overrides.withProbe === false
      ? {}
      : { probeAt: createFakeProbeFactory() }),
    ...(overrides.onDesignChanged
      ? { onDesignChanged: overrides.onDesignChanged }
      : {}),
  });
}

type Store = ReturnType<typeof createStore>;

/** Every invariant the milestone states about the store's own state, checked as one function so a
 *  sequence can assert all of them after every step rather than at the end. */
function expectStoreInvariants(store: Store, at: string): void {
  const state = store.getState();

  // ADR 0011 Gap D: a placement whose derived column is not in the frozen map is a phantom column.
  for (const record of state.records) {
    expect(
      state.columns.has(record.col),
      `${at}: ${record.id} left the map`,
    ).toBe(true);
  }
  for (const record of state.voids) {
    expect(
      state.columns.has(record.col),
      `${at}: void ${record.id} left the map`,
    ).toBe(true);
  }

  // "Selection never dangles."
  const { selection } = state;
  if (selection) {
    const pool =
      selection.kind === "placement"
        ? state.records.map((record) => record.id)
        : state.voids.map((record) => record.id);
    expect(pool, `${at}: selection ${selection.id} dangles`).toContain(
      selection.id,
    );
  }

  // The records are a pure function of the design, so a stale array would show up here.
  expect(state.records.map((record) => record.id).sort()).toEqual(
    state.design.placements.map((placement) => placement.id).sort(),
  );
}

describe("the frozen column map survives a long sequence, not just one command", () => {
  it("keeps the identical map object across every command and every refusal", () => {
    const store = createStore();
    const frozen = columnExtents(store.getState().columns);
    const columnKeys = [...frozen.keys()].sort();

    const steps: readonly [string, () => void][] = [
      [
        "select p7",
        () => {
          store.getState().select({ kind: "placement", id: "p7" });
        },
      ],
      [
        "remove p7",
        () => {
          store.getState().remove();
        },
      ],
      [
        "remove the freed void",
        () => {
          store.getState().remove();
        },
      ],
      [
        "select p24",
        () => {
          store.getState().select({ kind: "placement", id: "p24" });
        },
      ],
      [
        "remove p24",
        () => {
          store.getState().remove();
        },
      ],
      [
        "insert into the merged void",
        () => {
          store.getState().insert("tall-pantry");
        },
      ],
      [
        "setFinish",
        () => {
          store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);
        },
      ],
      [
        "setHandle",
        () => {
          store.getState().setHandle("push");
        },
      ],
      [
        "remove it again",
        () => {
          store.getState().remove();
        },
      ],
      [
        "refuse an unknown body",
        () => {
          store.getState().insert("not-a-body");
        },
      ],
      [
        "deselect",
        () => {
          store.getState().deselect();
        },
      ],
      [
        "refuse with nothing selected",
        () => {
          store.getState().remove();
        },
      ],
    ];

    for (const [name, run] of steps) {
      run();
      expect(
        columnExtents(store.getState().columns),
        `${name} recomputed the column extents`,
      ).toEqual(frozen);
      expect([...store.getState().columns.keys()].sort()).toEqual(columnKeys);
      expectStoreInvariants(store, name);
    }
  });

  it("keeps a column's frozen top after its last member is removed, so the run stays selectable", () => {
    const store = createStore();
    const topBefore = store.getState().columns.get(FRIDGE_COLUMN)?.top;

    store.getState().select({ kind: "placement", id: "p24" });
    store.getState().remove();
    store.getState().select({ kind: "placement", id: "p7" });
    store.getState().remove();

    expect(store.getState().columns.get(FRIDGE_COLUMN)?.top).toBe(topBefore);
    const cleared = store
      .getState()
      .voids.filter((record) => record.col === FRIDGE_COLUMN);
    // The whole column is free, and the freed run is still voids the customer can select.
    expect(cleared.length).toBeGreaterThan(0);
    expect(
      Math.max(...cleared.map((record) => record.y0 + record.h)),
    ).toBeCloseTo(topBefore ?? 0, 6);
  });
});

describe("the §10 signature flow, driven through the store", () => {
  it("merges the two free spans into one 2600 mm opening with three level slots", () => {
    const store = createStore();

    store.getState().select({ kind: "placement", id: "p7" });
    store.getState().remove();
    const beforeMerge = fridgeColumnVoids(store);

    store.getState().select({ kind: "placement", id: "p24" });
    store.getState().remove();
    const afterMerge = fridgeColumnVoids(store);

    // §10's own words: "the two openings merge into one 700 × 2600 opening with three level slots".
    // The *span* is what merges — one span, sliced by the module lines into three selectable voids.
    expect(beforeMerge.map((record) => record.spanH)).toEqual([1.85, 1.85]);
    expect(afterMerge).toHaveLength(3);
    expect(new Set(afterMerge.map((record) => record.spanY0))).toEqual(
      new Set([0]),
    );
    expect(new Set(afterMerge.map((record) => record.spanH))).toEqual(
      new Set([2.6]),
    );

    // The selection follows the vacated frame geometrically: `p24` stood at 1.85, and the void that
    // covers 1.85 starts at 1.50 — a lookup keyed on the vacated y0 would find nothing at all.
    expect(store.getState().selection).toEqual({
      kind: "void",
      id: afterMerge[1]?.id,
    });
    expect(afterMerge[1]?.y0).toBe(1.5);
    expectStoreInvariants(store, "after the merge");
  });

  // Worth recording rather than only passing: a void id is `col:v<index>:<y0>` and carries no
  // height, so `B|2.45:v1:1.50` survives this merge while its height doubles. That is the Wave 3B
  // QA-3 shape, reached here by two ordinary removes — the adapter's `signVoid` covers it because
  // `h` is in the signature, and the id-list check it replaced would have caught *this* particular
  // transition by count. It is asserted so the id's insufficiency stays visible in a live flow.
  it("keeps a void id across a merge that doubles that void's height", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p7" });
    store.getState().remove();
    const before = fridgeColumnVoids(store)[1];

    store.getState().select({ kind: "placement", id: "p24" });
    store.getState().remove();
    const after = fridgeColumnVoids(store)[1];

    expect(after?.id).toBe(before?.id);
    expect(before?.h).toBeCloseTo(0.35, 6);
    expect(after?.h).toBeCloseTo(0.7, 6);
  });

  it("performs every body the offer list shows for the merged opening", () => {
    for (const offer of offersForMergedOpening()) {
      const store = clearedFridgeColumn();
      const voidId = store.getState().selection?.id;

      store.getState().insert(offer);

      expect(
        store.getState().lastRejection,
        `${offer} was offered for ${String(voidId)} and then refused`,
      ).toBeNull();
      expectStoreInvariants(store, `after inserting ${offer}`);
    }
  });

  function fridgeColumnVoids(store: Store) {
    return store
      .getState()
      .voids.filter((record) => record.col === FRIDGE_COLUMN);
  }

  function clearedFridgeColumn(): Store {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p24" });
    store.getState().remove();
    store.getState().select({ kind: "placement", id: "p7" });
    store.getState().remove();
    return store;
  }

  /** ADR 0032: the list carries refused rows too, and the panel does not let a customer tap one.
   *  The claim here is about the rows they *can* tap. */
  function offersForMergedOpening(): string[] {
    const store = clearedFridgeColumn();
    const state = store.getState();
    const selection = state.selection;
    if (!selection) throw new Error("the cleared column selected no void");
    return offersFor({
      records: state.records,
      voids: state.voids,
      columns: state.columns,
      catalog: KITCHEN_L_BODY_CATALOG,
      cabinetDepthMm: cabinetDepthMmOf(state.design),
      target: selection,
    })
      .filter((offer) => offer.verdict.status === "offered")
      .map((offer) => offer.buildId);
  }
});

describe("the save seam fires exactly once per applied command and never on a refusal", () => {
  it("counts one call per success across all four commands, and none across four refusals", () => {
    const onDesignChanged = vi.fn();
    const store = createStore({ onDesignChanged });

    store.getState().select({ kind: "placement", id: "p8" });
    store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);
    store.getState().setHandle("push");
    store.getState().remove();
    const afterSuccesses = onDesignChanged.mock.calls.length;

    // Four refusals: a void is selected after the remove above, which refuses all three of these,
    // and an unknown build id refuses the fourth.
    store.getState().remove();
    store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);
    store.getState().setHandle("push");
    store.getState().insert("not-a-body");

    expect(afterSuccesses).toBe(3);
    expect(onDesignChanged).toHaveBeenCalledTimes(3);
    for (const [design] of onDesignChanged.mock.calls) {
      expect(design).not.toBe(KITCHEN_L_DESIGN);
    }
  });

  it("hands the seam the design the store has already applied, on every call", () => {
    const seen: boolean[] = [];
    const store = createStore({
      onDesignChanged: (design) => {
        seen.push(design === store.getState().design);
      },
    });

    store.getState().select({ kind: "placement", id: "p8" });
    store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);
    store.getState().setHandle("push");

    expect(seen).toEqual([true, true]);
  });
});

describe("hydrate is the only thing that may move the frozen columns", () => {
  it("re-derives them for the loaded design and clears what belonged to the old one", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p7" });
    store.getState().remove();
    const beforeColumns = store.getState().columns;
    const loaded: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => placement.wall === "A",
      ),
    };

    store.getState().hydrate({
      design: loaded,
      designId: "loaded-id",
      revision: LOADED_REVISION,
      canWrite: true,
    });

    expect(store.getState().columns).not.toBe(beforeColumns);
    expect([...store.getState().columns.keys()]).not.toContain(FRIDGE_COLUMN);
    expect(store.getState().selection).toBeNull();
    expect(store.getState().lastRejection).toBeNull();
    expect(store.getState().designId).toBe("loaded-id");
    expect(store.getState().hasPersistedSuccessfully).toBe(true);
    expectStoreInvariants(store, "after hydrate");
  });
});

describe("lastRejection is transient and never leaks into the design", () => {
  it("is cleared by a success, by select and by deselect", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: MISSING_ID });

    store.getState().remove();
    expect(store.getState().lastRejection).not.toBeNull();

    store.getState().select({ kind: "placement", id: HOB_HOST_ID });
    expect(store.getState().lastRejection).toBeNull();

    store.getState().remove();
    expect(store.getState().lastRejection).toBeNull();

    store.getState().setFinish(LEGACY_ENUM_FINISHES.oak);
    expect(store.getState().lastRejection).not.toBeNull();
    store.getState().deselect();
    expect(store.getState().lastRejection).toBeNull();
  });

  it("appears in no serialised design", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: MISSING_ID });
    store.getState().remove();

    expect(JSON.stringify(store.getState().design)).not.toContain("rejection");
    expect(Object.keys(store.getState().design)).not.toContain("lastRejection");
  });
});

// ADR 0027 made the hob part of `p2`'s body and ADR 0038 confirmed no document was ever stored
// carrying it as a placement of its own, so a delete removes exactly one placement and the hob goes
// with the cabinet it is built into. Asserted through the store because the store is what a pointer
// handler calls.
describe("deleting the hob cabinet leaves the state whole", () => {
  it("removes the one placement and leaves every remaining record consistent", () => {
    const store = createStore();
    expect(store.getState().records.map((record) => record.id)).toContain(
      HOB_HOST_ID,
    );

    store.getState().select({ kind: "placement", id: HOB_HOST_ID });
    store.getState().remove();

    expect(store.getState().records.map((record) => record.id)).not.toContain(
      HOB_HOST_ID,
    );
    expectStoreInvariants(store, "after the delete");
  });
});

// R1 QA-C, flipped. The seam used to **throw** `BodyProbeNotAttachedError`, and the throw ran
// before the selection check, so `insert` failed differently from the other three commands for a
// state they all share. It is now a refusal carrying `BODY_PROBE_UNAVAILABLE`, placed after the
// selection check — which is what ADR 0011 Gap E's reasoning asks for: a state a UI can reach must
// produce a refusal a person can read, never an exception out of a handler.
describe("insert without a probe", () => {
  it("refuses instead of throwing, and refuses the same way the other commands do", () => {
    const store = createStore({ withProbe: false });
    store.getState().select({ kind: "placement", id: "p8" });

    expect(() => {
      store.getState().insert("base-cabinet");
    }).not.toThrow();
    expect(store.getState().lastRejection?.code).toBe("BODY_PROBE_UNAVAILABLE");
  });

  // The domain's `rejection-totality` sweep lists `BODY_PROBE_UNAVAILABLE` as engine-unreachable —
  // correctly, since `insertBody` takes a probe as a required argument, so no command can produce
  // it — and its comment hands the sweeping duty to "`apps/web`'s store tests". That exemption also
  // removes it from the engine sweep. The store-owned refusal still has to cross the same typed,
  // locale-free boundary as command-produced refusals.
  it("publishes the store-owned refusal as a locale-free descriptor", () => {
    const store = createStore({ withProbe: false });
    store.getState().select({ kind: "placement", id: "p8" });

    store.getState().insert("base-cabinet");

    expect(store.getState().lastRejection).toEqual({
      code: "BODY_PROBE_UNAVAILABLE",
      params: {},
    });
  });

  it("fails on the selection first, exactly as remove, setFinish and setHandle do", () => {
    const store = createStore({ withProbe: false });
    store.getState().deselect();

    store.getState().insert("base-cabinet");

    // The old throw pre-empted this refusal; the guard now sits after the selection check.
    expect(store.getState().lastRejection?.code).toBe("TARGET_NOT_FOUND");
  });

  it("leaves the whole store untouched when it refuses", () => {
    const store = createStore({ withProbe: false });
    store.getState().select({ kind: "placement", id: "p8" });
    const before: ConfiguratorState = store.getState();

    store.getState().insert("base-cabinet");

    expect(store.getState().design).toBe(before.design);
    expect(store.getState().records).toBe(before.records);
    expect(store.getState().voids).toBe(before.voids);
    expect(store.getState().columns).toBe(before.columns);
    expect(store.getState().selection).toBe(before.selection);
  });

  // `wall-lift` rather than `wall-1door`: `p8` is 600 mm and ADR 0032 made the one-door's
  // `[200, 300, 400]` set (ADR 0030) a bound on the insert path, so it would now refuse on width
  // before the probe question was ever reached. The probe is the subject of these three cases.
  it("stops refusing once the scene attaches its probe", () => {
    const store = createStore({ withProbe: false });
    store.getState().select({ kind: "placement", id: "p8" });
    store.getState().insert("wall-lift");
    expect(store.getState().lastRejection?.code).toBe("BODY_PROBE_UNAVAILABLE");

    store.getState().attachBodyProbe(createFakeProbeFactory());
    store.getState().select({ kind: "placement", id: "p8" });
    store.getState().insert("wall-lift");

    expect(store.getState().lastRejection).toBeNull();
    expectStoreInvariants(store, "after attaching the probe");
  });

  it("uses the most recently attached probe", () => {
    const store = createStore({ withProbe: false });
    const firstProbe = createFakeBodyProbe();
    const secondProbe = createFakeBodyProbe();
    const first = vi.fn((request: Parameters<typeof firstProbe.measure>[0]) =>
      firstProbe.measure(request),
    );
    const second = vi.fn((request: Parameters<typeof secondProbe.measure>[0]) =>
      secondProbe.measure(request),
    );
    store
      .getState()
      .attachBodyProbe(() =>
        createBodyProbeLease({ measure: first }, () => undefined),
      );
    store
      .getState()
      .attachBodyProbe(() =>
        createBodyProbeLease({ measure: second }, () => undefined),
      );
    expect(store.getState().isBodyProbeAttached).toBe(true);

    store.getState().select({ kind: "placement", id: "p8" });
    store.getState().insert("wall-lift");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});
