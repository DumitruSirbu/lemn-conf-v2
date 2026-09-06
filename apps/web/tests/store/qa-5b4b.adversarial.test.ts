// Adversarial QA for M5B wave 5B4b, store half — the two halves of the wave the domain package
// cannot answer, both found by applying a named mutant and seeing green.
//
// 1. **Criterion 11's second mutant does not redden anything here.** "Skip the merge inside
//    `deriveColumns` → the reload shows two columns where the session showed one" is not what
//    happens: this wave projects the **post-merge** map, so the document a merged session writes
//    already holds one entry and its reload never asks the load seam to merge anything. What does
//    need the load-seam merge is a document written *before* this wave — 5B2b persisted adjacent
//    entries and nothing merged them — and that is the fixture below. Removing the merge from
//    `deriveColumns` leaves the whole `apps/web` suite green without it.
// 2. **Criterion 8's liveness half is asserted in the domain, not at the seam it names.** The
//    criterion is that `applyCommandResult` never throws `UnprojectableColumnError`; the wave's
//    property calls `projectEmptyColumns` directly, and `applyCommandResult` is the function that
//    deliberately does not catch it (`apply-command-result.ts`). A run whose merged centre is
//    fractional has to survive a real command, which is what this asks.
import {
  buildKitchenLBodyCatalog,
  DesignSchema,
  type Column,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-08-25T12:00:00.000Z";

/** A body well clear of every fixture's spaces, so a command exists to run and nothing it touches
 *  overlaps the run under test. */
const A_BODY_TO_REMOVE = {
  id: "p0",
  wall: "A",
  alongMm: 3000,
  y0Mm: 0,
  body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
};

function designWith(emptyColumns: readonly unknown[]): Design {
  return DesignSchema.parse({
    room: { shape: "L", widthMm: 4200, depthMm: 2400, heightMm: 2600 },
    presetId: null,
    placements: [A_BODY_TO_REMOVE],
    emptyColumns,
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  });
}

function emptySpace(alongMm: number, widthMm: number) {
  return { wall: "A", alongMm, widthMm, y0Mm: 0, topMm: 2600, depthMm: 580 };
}

function createStore(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

function widthMmOf(columns: ReadonlyMap<string, Column>, key: string): number {
  const column = columns.get(key);
  if (!column)
    throw new Error(`No column ${key}; have ${[...columns.keys()].join(", ")}`);
  return Math.round(column.w * 1000);
}

describe("a document written before this wave merges at the load seam", () => {
  // The only reachable route to the load-seam merge, and the one criterion 11's stated mutant misses:
  // 5B2b shipped `emptyColumns` with no merge, so a design saved between 5B2b and 5B4b holds two
  // adjacent entries. Loading it must show the customer one space, not two — the state ADR 0046 part
  // 2 is about, arriving from the document rather than from a command.
  it("shows one 600 mm space for two stored adjacent 300s, with no command run", () => {
    const store = createStore(
      designWith([emptySpace(1000, 300), emptySpace(1300, 300)]),
    );

    const { columns } = store.getState();

    expect(widthMmOf(columns, "A|1.15")).toBe(600);
    expect(columns.has("A|1.00")).toBe(false);
    expect(columns.has("A|1.30")).toBe(false);
  });

  // And the merged space is what the next save writes, so the pre-wave document is rewritten as the
  // post-merge one rather than carrying its two entries forward for ever.
  it("rewrites the document as the merged column on the first command", () => {
    const store = createStore(
      designWith([emptySpace(1000, 300), emptySpace(1300, 300)]),
    );

    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().remove();

    expect(store.getState().lastRejection).toBeFalsy();
    // The delete frees `p0`'s own column too, so the document holds that as well; what this asserts
    // is that the pre-wave pair is gone and the merged column is what replaced it.
    const spaces = store.getState().design.emptyColumns ?? [];
    expect(spaces).toContainEqual({
      wall: "A",
      alongMm: 1150,
      widthMm: 600,
      y0Mm: 0,
      topMm: 2600,
      depthMm: 580,
    });
    expect(spaces.filter((entry) => entry.widthMm === 300)).toEqual([]);
  });
});

describe("a run the merge declines survives a command at the seam that does not catch", () => {
  // Two 51 mm spaces laid from a half-millimetre edge: each is on an integer centre, which is what
  // the document stores, while their merged centre would be 1050.5. `applyCommandResult` does not
  // catch `UnprojectableColumnError` — deliberately — so a merge that computed the extent before
  // testing it, or refused instead of declining, is a crash out of an ordinary delete rather than a
  // pair of spaces left as they were.
  const ODD_TOTAL_RUN = [emptySpace(1025, 51), emptySpace(1076, 51)];

  it("declines the merge and applies the command without throwing", () => {
    const store = createStore(designWith(ODD_TOTAL_RUN));

    store.getState().select({ kind: "placement", id: "p0" });
    expect(() => {
      store.getState().remove();
    }).not.toThrow();

    expect(store.getState().lastRejection).toBeFalsy();
    const spaces = store.getState().design.emptyColumns ?? [];
    for (const entry of ODD_TOTAL_RUN) expect(spaces).toContainEqual(entry);
    expect(widthMmOf(store.getState().columns, "A|1.02")).toBe(51);
    expect(widthMmOf(store.getState().columns, "A|1.08")).toBe(51);
  });
});
