// **Wave 6Y's witness: the breach, pinned positively and by measurement** — ADR 0102 decision 3b.
//
// `apps/web/tests/support/frozen-source-invariant.ts` carries an acknowledged exemption for one
// production defect, and an exemption that is only *tolerated* is the laundering ADR 0090 decision 7
// refuses. So the thing it waves through is asserted here as a **fact with a number**, not merely
// permitted: every `it` below states what the shipped kitchen actually publishes today, so the day
// wave 6Y lands — *a depth no entry declares carries no entry's name*, against `restoredColumns` in
// `packages/configurator-domain/src/void-engine.ts` — this file goes **red** and whoever lands it is
// made to read ADR 0102 rather than discovering the record by accident.
//
// **This file is not a rule and asserts no correct behaviour.** Every expectation in it is wrong on
// purpose. It is the negation of ADR 0079 decision 10 point 2 — which ADR 0102 decision 1 confirms
// unchanged and unnarrowed — recorded as the state of the tree on 2026-09-08. Deleting it is part of
// 6Y's work, not a way to make a suite pass.
//
// **The defect, in one sentence.** `resolveDepthM` builds a wall body over a full-height column to
// `columnBuildDepthM`'s lifted arm and never to the entry's own `frameDepthMm`; `restoredColumns`
// then records that member's `buildId` as the source of a depth its catalogue row does not declare.
import {
  buildKitchenLBodyCatalog,
  columnBuildDepthM,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  occupiedDepthOfEntryM,
  type Column,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  columnsWhoseSourceDoesNotDeclareTheirDepth,
  columnsWithKnownSources,
  unexplainedColumns,
  unexplainedStoredEntries,
} from "../support/frozen-source-invariant";

const OCCURRED_AT = "2026-09-05T12:00:00.000Z";
const DEEPER_MM = 700;

/** `B|1.80` at 600 and `B|1.90` at 700 are the **same column** — every wall-B key slides with the
 *  setting because the corner body's depth is measured along wall B (ADR 0090 decision 2). */
const PANTRY_KEY_AT_600 = "B|1.80";
const PANTRY_KEY_AT_700 = "B|1.90";

/** The deep top over the pantry, and the pantry itself: the two members whose presence is the whole
 *  of the mechanism — one lifts §5.2's head-clearance cap, the other is built to the lifted line. */
const DEEP_TOP_PLACEMENT_ID = "p23";
const PANTRY_PLACEMENT_ID = "p6";

/** What the top is rebuilt as at 700, through ADR 0022's declared catalogue equivalent. It is the
 *  source `restoredColumns` records, and the row that does not declare the depth beside it. */
const LIFTED_WALL_BUILD_ID = "wall-cabinet";

/** ADR 0102's measurement 1 and measurement 4, verbatim as this helper renders them. They are quoted
 *  rather than computed because what is being pinned **is** the reading. */
const BREACH_AT_700 =
  "B|1.90 d=700.0 mm, source wall-cabinet declares 400.0 mm at 700";
const BREACH_AT_600 =
  "B|1.80 d=600.0 mm, source wall-cabinet declares 330.0 mm at 600";
const STORED_BREACH_AT_700 =
  "B|1900 depthMm=700 src=wall-cabinet declares 400 mm at 700";

function createStore() {
  return createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

type Store = ReturnType<typeof createStore>;

function columnOf(store: Store, key: string): Column {
  const column = store.getState().columns.get(key);
  if (!column) throw new Error(`no column ${key} is published`);
  return column;
}

function remove(store: Store, placementId: string): void {
  store.getState().select({ kind: "placement", id: placementId });
  store.getState().remove();
}

/** What the catalogue row declares it fills at this setting — the question ADR 0073 decision 2
 *  re-asks and the one the recorded source is failing to answer. */
function declaredDepthM(buildId: string, cabinetDepthMm: number): number {
  const definition = buildKitchenLBodyCatalog(cabinetDepthMm).get(buildId);
  if (!definition) throw new Error(`${buildId} is not in the catalogue`);
  return occupiedDepthOfEntryM({ buildId, definition });
}

describe("the lifted column records a source that does not declare its depth", () => {
  it("publishes 700 from a wall-cabinet that declares 400, one ordinary command from load", () => {
    const store = createStore();

    store.getState().setCabinetDepth(DEEPER_MM);

    const lifted = columnOf(store, PANTRY_KEY_AT_700);
    // Non-vacuity, and the reason the exemption is offered here at all: the column really does lift
    // the cap and really does publish `columnBuildDepthM`'s lifted arm.
    expect(lifted.hasFullHeightUnder).toBe(true);
    expect(lifted.d).toBeCloseTo(
      columnBuildDepthM({
        cabinetDepthMm: DEEPER_MM,
        hasFullHeightUnder: true,
      }),
      9,
    );
    expect(lifted.depthFromBuildId).toBe(LIFTED_WALL_BUILD_ID);
    // And the row it names declares something else entirely — 400, not 700.
    expect(declaredDepthM(LIFTED_WALL_BUILD_ID, DEEPER_MM)).toBeCloseTo(0.4, 9);

    expect(
      columnsWhoseSourceDoesNotDeclareTheirDepth(store.getState()),
    ).toStrictEqual([BREACH_AT_700]);
    expect(columnsWithKnownSources(store.getState()).length).toBeGreaterThan(0);
  });

  it("publishes 600 from a wall-cabinet that declares 330 on the return leg", () => {
    const store = createStore();

    store.getState().setCabinetDepth(DEEPER_MM);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    const lifted = columnOf(store, PANTRY_KEY_AT_600);
    expect(lifted.hasFullHeightUnder).toBe(true);
    expect(lifted.depthFromBuildId).toBe(LIFTED_WALL_BUILD_ID);
    expect(
      declaredDepthM(LIFTED_WALL_BUILD_ID, DEFAULT_CABINET_DEPTH_MM),
    ).toBeCloseTo(0.33, 9);

    expect(
      columnsWhoseSourceDoesNotDeclareTheirDepth(store.getState()),
    ).toStrictEqual([BREACH_AT_600]);
    expect(columnsWithKnownSources(store.getState()).length).toBeGreaterThan(0);
  });

  // **What the ordinary suites' green is actually bought with.** `assertSourcesExplainTheirDepths`
  // reports nothing in this state, and the only reason is the acknowledged exemption — not because
  // the pair agrees. Stated as the gap between the two lists so it cannot be read as a rule.
  it("is green in the ordinary suites only because the exemption is applied", () => {
    const store = createStore();

    store.getState().setCabinetDepth(DEEPER_MM);

    expect(unexplainedColumns(store.getState())).toStrictEqual([]);
    expect(
      columnsWhoseSourceDoesNotDeclareTheirDepth(store.getState()),
    ).toStrictEqual([BREACH_AT_700]);
  });

  // ADR 0102 decision 3a, from the other side: the exemption is keyed on a member **standing there**
  // carrying the recorded id at the lifted seat. Take the members away and the same recorded pair
  // gets no exemption at all — so a frozen surplus no member reaches is inspected as it always was.
  it("gets no exemption once no member is left to explain it, and the pair is saved that way", () => {
    const store = createStore();

    store.getState().setCabinetDepth(DEEPER_MM);
    remove(store, DEEP_TOP_PLACEMENT_ID);

    expect(unexplainedColumns(store.getState())).toStrictEqual([BREACH_AT_700]);
    // The document half: `projectFrozenMap` writes the disagreeing pair into the design, so this is
    // saved and reloaded rather than being a session slip.
    expect(unexplainedStoredEntries(store.getState().design)).toStrictEqual([
      STORED_BREACH_AT_700,
    ]);
  });
});

describe("ADR 0102 measurement 4: what the false pair is cashed as", () => {
  // Four ordinary commands — no authored fixture, no hand-built map. The published depth this leaves
  // behind is wrong under **both** arms of `frozenDepthAtThisSetting`, and it is shallower than the
  // depth the extent was frozen at, which is wave 6K-c's own *"nothing shrinks, in any arm"*.
  it("leaves B|1.80 publishing 330 mm, below the 600 it was frozen at", () => {
    const store = createStore();
    const frozenAtM = columnOf(store, PANTRY_KEY_AT_600).d;
    expect(frozenAtM).toBeCloseTo(0.6, 9);

    store.getState().setCabinetDepth(DEEPER_MM);
    remove(store, DEEP_TOP_PLACEMENT_ID);
    remove(store, PANTRY_PLACEMENT_ID);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    const afterwards = columnOf(store, PANTRY_KEY_AT_600);
    expect(afterwards.d).toBeCloseTo(
      declaredDepthM(LIFTED_WALL_BUILD_ID, DEFAULT_CABINET_DEPTH_MM),
      9,
    );
    expect(afterwards.d).toBeCloseTo(0.33, 9);
    // It shrank. Nothing in the frozen-extent rules permits that in any arm, and the number it
    // shrank to came from a body that never declared 600 or 700.
    expect(afterwards.d).toBeLessThan(frozenAtM);
    expect(afterwards.depthFromBuildId).toBe(LIFTED_WALL_BUILD_ID);
    // Not the surplus ADR 0080 decision 4's sourceless arm would have kept, either.
    expect(afterwards.d).not.toBeCloseTo(0.7, 9);
  });

  it("saves the 330 into the document, so a reload does not undo it", () => {
    const store = createStore();

    store.getState().setCabinetDepth(DEEPER_MM);
    remove(store, DEEP_TOP_PLACEMENT_ID);
    remove(store, PANTRY_PLACEMENT_ID);
    store.getState().setCabinetDepth(DEFAULT_CABINET_DEPTH_MM);

    expect(store.getState().design.emptyColumns ?? []).toContainEqual(
      expect.objectContaining({
        wall: "B",
        alongMm: 1800,
        depthMm: 330,
        depthFromBuildId: LIFTED_WALL_BUILD_ID,
      }),
    );
  });
});
