// Adversarial QA on the store half of M5 wave 5D: the seam between the chip §9 renders and the
// command the tap runs.
//
// The domain proves `widthOptionsFor` agrees with `setWidth`. That is only half of ADR 0034's
// promise: the panel reads the query off one set of store slices and the action runs the command off
// another, so the two could still be given different inputs. Every case below taps the chip and
// checks the store, rather than asking the query twice.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  widthOptionsFor,
  type Design,
  type WidthOption,
} from "@lemnaria/configurator-domain";
import { describe, expect, it, vi } from "vitest";

import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "../../src/store/configurator-store";
import { createFakeBodyProbe } from "../support/fake-body-probe";

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

function removeById(store: Store, placementId: string) {
  store.getState().select({ kind: "placement", id: placementId });
  store.getState().remove();
}

/** `A|2.00` emptied through the store's own delete — the customer's real sequence, and the only
 *  state in which any chip in the shipped kitchen is free. */
function storeWithEmptyColumn(): Store {
  const store = createStore();
  for (const id of ["p1", "p12", "p18"]) removeById(store, id);
  store.getState().deselect();
  return store;
}

/** The chips §9 would render for one body, read exactly as `use-panel-view.ts` reads them. */
function chipsFor(store: Store, placementId: string): WidthOption[] {
  const state = store.getState();
  const probe = state.bodyProbe;
  if (!probe) throw new Error("the fixture store has no probe");
  return widthOptionsFor({
    design: state.design,
    catalog: state.catalog,
    columns: state.columns,
    target: { kind: "placement", id: placementId },
    probe,
  });
}

const UNTOUCHED_BY_A_REFUSAL = [
  "design",
  "records",
  "columns",
  "voids",
  "selection",
] as const;

function snapshotOf(state: ConfiguratorState) {
  return UNTOUCHED_BY_A_REFUSAL.map((key) => state[key]);
}

describe("tapping a chip does what the chip said it would", () => {
  // **The whole claim, taken through the seam.** For every body and every chip, a fresh store is
  // built, the chip is tapped, and the store is asked what happened. A panel reading the query off
  // `state.design` while the action ran against something else would show up here and nowhere else.
  it("applies a resize exactly on the free chips and refuses on every other one", () => {
    const catalogue = chipsFor(storeWithEmptyColumn(), "p11").length;
    expect(catalogue).toBeGreaterThan(0);

    const disagreements: string[] = [];
    let taps = 0;
    let applied = 0;
    for (const record of storeWithEmptyColumn().getState().records) {
      for (const option of chipsFor(storeWithEmptyColumn(), record.id)) {
        const store = storeWithEmptyColumn();
        store.getState().select({ kind: "placement", id: record.id });
        const before = store.getState().design;

        store.getState().setWidth(option.widthMm);

        const changed = store.getState().design !== before;
        const expected = option.verdict.status === "available";
        if (changed !== expected) {
          disagreements.push(
            `${record.id}@${String(option.widthMm)} chip=${option.verdict.status} applied=${String(changed)}`,
          );
        }
        if (changed) applied += 1;
        taps += 1;
      }
    }
    expect(disagreements).toEqual([]);
    // Non-vacuity in both directions: the sweep has to have tapped something that worked and
    // something that did not, or it proves nothing about either. Three until ADR 0035 decision 2
    // stepped each entry's bound at 50 mm and the emptied column's one move offered twelve widths
    // inside it; **48 since decision 7**, which funds a shrink out of the space it vacates, so every
    // column in the kitchen contributes its own narrowings rather than only the one beside the
    // clear; **56 since ADR 0048**, which unfroze the seeded pantry's column and put `p6` and `p23`
    // into the population with four narrowings each. The same 56 the panel renders free
    // (`width-chips.qa.test.ts`), reached here through the store's action instead of through the
    // section.
    expect(applied).toBe(56);
    expect(taps).toBeGreaterThan(40);
  });

  // §9 disables a blocked chip, so this is the safety net under the gate rather than the gate. It
  // must leave the store untouched **by identity** — a re-derived but equal `records` array is the
  // defect this compares for.
  it("touches nothing when a blocked chip is tapped anyway", () => {
    const store = storeWithEmptyColumn();
    // `p8` stands in `A|0.30`, which abuts no empty column: every chip in its row is refused.
    store.getState().select({ kind: "placement", id: "p8" });
    const blocked = chipsFor(store, "p8").find(
      (option) => option.verdict.status === "refused",
    );
    expect(blocked).toBeDefined();
    const before = snapshotOf(store.getState());

    store.getState().setWidth(blocked?.widthMm ?? 0);

    expect(snapshotOf(store.getState())).toEqual(before);
    expect(store.getState().lastRejection).not.toBeNull();
  });

  // A width no chip in the row mentions is not merely unclickable; it must also be unreachable, or
  // the row is not the whole answer.
  it.each([0, -600, 1, 199, 601, 5000, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses the unlisted width %o without changing anything",
    (widthMm) => {
      const store = storeWithEmptyColumn();
      store.getState().select({ kind: "placement", id: "p11" });
      const before = snapshotOf(store.getState());

      store.getState().setWidth(widthMm);

      expect(snapshotOf(store.getState())).toEqual(before);
      expect(store.getState().lastRejection).not.toBeNull();
    },
  );

  it("refuses with a void selected, and changes nothing", () => {
    const store = storeWithEmptyColumn();
    const opening = store.getState().voids[0];
    expect(opening).toBeDefined();
    store.getState().select({ kind: "void", id: opening?.id ?? "" });
    const before = snapshotOf(store.getState());

    store.getState().setWidth(600);

    expect(store.getState().lastRejection?.code).toBe("VOID_SELECTED");
    expect(snapshotOf(store.getState())).toEqual(before);
  });
});

describe("the state a resize leaves behind", () => {
  it("leaves no record and no opening under a key the map no longer holds", () => {
    const store = storeWithEmptyColumn();
    store.getState().select({ kind: "placement", id: "p11" });
    store.getState().setWidth(600);

    const state = store.getState();
    expect(state.lastRejection).toBeNull();
    for (const record of state.records) {
      expect([record.id, state.columns.has(record.col)]).toEqual([
        record.id,
        true,
      ]);
    }
    for (const opening of state.voids) {
      expect([opening.id, state.columns.has(opening.col)]).toEqual([
        opening.id,
        true,
      ]);
    }
    // The keys the move vacated are gone rather than left beside the new ones, which is what would
    // leave a phantom column §4 could still derive an opening in.
    expect(state.columns.has("A|1.30")).toBe(false);
    expect(state.columns.has("A|1.20")).toBe(true);
  });

  // ADR 0031 rule 6: consuming the empty space exactly removes its key. That is the one case where
  // a column ceases to exist without anything being deleted, and the store must not carry it.
  it("drops an empty column the resize consumed exactly", () => {
    const design: Design = {
      room: { shape: "L", widthMm: 3600, depthMm: 2400, heightMm: 2600 },
      presetId: null,
      placements: [
        {
          id: "left",
          wall: "A",
          alongMm: 1000,
          y0Mm: 0,
          body: { buildId: "base-panbank", widthMm: 600, heightMm: 860 },
        },
        {
          id: "right",
          wall: "A",
          alongMm: 1400,
          y0Mm: 0,
          body: { buildId: "base-bottle-cargo", widthMm: 200, heightMm: 860 },
        },
      ],
      createdAt: OCCURRED_AT,
      updatedAt: OCCURRED_AT,
    };
    const store = createStore(design);
    removeById(store, "right");
    store.getState().select({ kind: "placement", id: "left" });
    expect(store.getState().columns.has("A|1.40")).toBe(true);

    store.getState().setWidth(800);

    const state = store.getState();
    expect(state.lastRejection).toBeNull();
    expect(state.columns.has("A|1.40")).toBe(false);
    expect([...state.columns.keys()]).toEqual(["A|1.10"]);
    for (const opening of state.voids) {
      expect([opening.id, state.columns.has(opening.col)]).toEqual([
        opening.id,
        true,
      ]);
    }
  });

  // Two taps in a row, which is the sequence a customer makes and the one that proves the store
  // fed the second command the **moved** map rather than the load-time one.
  it("resizes a second time, off the map the first resize published", () => {
    const store = storeWithEmptyColumn();
    store.getState().select({ kind: "placement", id: "p11" });
    store.getState().setWidth(600);

    const afterFirst = chipsFor(store, "p11");
    expect(
      afterFirst.find((option) => option.verdict.status === "current")?.widthMm,
    ).toBe(600);
    // 800 by name rather than "whichever chip is free first": ADR 0035 put 650, 700 and 750 in
    // front of it, and what this case is about is the *second* tap landing, not which width it is.
    const free = afterFirst
      .filter((option) => option.verdict.status === "available")
      .map((option) => option.widthMm);
    expect(free).toContain(800);

    store.getState().setWidth(800);

    const state = store.getState();
    expect(state.lastRejection).toBeNull();
    for (const id of ["p0", "p11", "p17"]) {
      expect([
        id,
        state.records.find((record) => record.id === id)?.widthMm,
      ]).toEqual([id, 800]);
    }
    for (const record of state.records) {
      expect([record.id, state.columns.has(record.col)]).toEqual([
        record.id,
        true,
      ]);
    }
  });

  it("schedules exactly one save for one accepted resize", () => {
    const onDesignChanged = vi.fn();
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      now: () => OCCURRED_AT,
      bodyProbe: createFakeBodyProbe(),
      onDesignChanged,
    });
    for (const id of ["p1", "p12", "p18"]) removeById(store, id);
    onDesignChanged.mockClear();
    store.getState().select({ kind: "placement", id: "p11" });

    store.getState().setWidth(600);

    expect(onDesignChanged).toHaveBeenCalledTimes(1);
  });
});
