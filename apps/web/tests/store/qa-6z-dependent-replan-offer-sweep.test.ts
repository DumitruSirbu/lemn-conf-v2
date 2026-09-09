// **Wave 6Z work item 1 — the measurement that decided whether the wave could land at all.**
//
// ADR 0103 decision 7 answers `DEVELOPMENT-SPEC.md` §9's *"never offer what cannot be satisfied"* in
// two parts. The **pre-probe** half — `evaluateInsertFit`'s band, width and height guards — is
// reachable by `offersFor`, which runs exactly that evaluation and needs no probe. Teaching it to
// predict the dependent re-plan too was made **conditional on this enumeration**: if any body §9
// offers, at any target of the shipped kitchen — an opening, or a body a swap in place may replace
// — produces a dependent re-plan that refuses, the wave stops and the offer-list extension lands
// first as wave **6Z-a**.
//
// It found none, and this file is that evidence rather than a claim about it. It is committed rather
// than run once, because the answer is a property of the shipped catalogue and the shipped kitchen,
// and both move.
//
// **Read the two assertions together.** The first is the verdict; the second is what stops the
// verdict from being vacuous — an enumeration that offered nothing, or that never reached an insert
// which re-planned anything, would satisfy the first without measuring it (ADR 0085 decision 6).
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredCabinetDepthsMm,
  offersFor,
  KITCHEN_L_DESIGN,
  type CommandTarget,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-09-08T12:00:00.000Z";

/** The refusal only a dependent re-plan can raise. Named once so the sweep asserts the wave's own
 *  code rather than "no refusal at all" — plenty of offered bodies are legitimately refused by the
 *  post-probe backstops, and those are §9's other half. */
const DEPENDENT_REFUSAL = "DEPENDENT_MEMBER_NOT_REBUILDABLE";

function createStore(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

type Store = ReturnType<typeof createStore>;

function removed(design: Design, placementIds: readonly string[]): Design {
  const store = createStore(design);
  for (const id of placementIds) {
    store.getState().select({ kind: "placement", id });
    store.getState().remove();
    const rejection = store.getState().lastRejection;
    if (rejection) throw new Error(`remove ${id}: ${rejection.code}`);
  }
  return store.getState().design;
}

function atCabinetDepth(design: Design, cabinetDepthMm: number): Design {
  if (cabinetDepthMmOf(design) === cabinetDepthMm) return design;
  const store = createStore(design);
  store.getState().setCabinetDepth(cabinetDepthMm);
  const rejection = store.getState().lastRejection;
  if (rejection) throw new Error(`setCabinetDepth: ${rejection.code}`);
  return store.getState().design;
}

/** The offer list the panel renders for the current selection — `offersFor` with the same operands
 *  `use-panel-view.ts` hands it, so a body this sweep tries is one a customer can tap. */
function offeredBuildIds(store: Store): readonly string[] {
  const state = store.getState();
  return offersFor({
    records: state.records,
    voids: state.voids,
    columns: state.columns,
    catalog: state.catalog,
    target: state.selection ?? { kind: "void", id: "" },
    cabinetDepthMm: cabinetDepthMmOf(state.design),
  })
    .filter((offer) => offer.verdict.status === "offered")
    .map((offer) => offer.buildId);
}

interface SweptInsert {
  readonly state: string;
  readonly target: string;
  readonly buildId: string;
  readonly rejection: string | null;
  /** Whether the insert actually moved a body other than the one placed — the fact that makes this
   *  row evidence about the **re-plan** rather than about an insert in general. */
  readonly replannedSomething: boolean;
}

/** How many bodies other than the placed one changed their recorded seat. Read off the documents
 *  rather than off the command, because the command publishes no such count and inventing one in
 *  production to satisfy a test is the instrument writing the product. */
function replannedCount(
  before: Design,
  after: Design,
  placedId: string,
): number {
  return after.placements.filter((placement) => {
    if (placement.id === placedId) return false;
    const was = before.placements.find(
      (candidate) => candidate.id === placement.id,
    );
    return (
      was !== undefined &&
      (was.body.seatDepthMm !== placement.body.seatDepthMm ||
        was.body.buildId !== placement.body.buildId)
    );
  }).length;
}

/** Every target §9 publishes an offer list for: each opening, and each body a swap in place may
 *  replace. Both reach `insertBody`, so both reach the re-plan — §5.3 is the same code path as §5.2,
 *  and a replace row the panel offers is as much an offer as an insert row. */
function offerTargets(design: Design): readonly CommandTarget[] {
  const state = createStore(design).getState();
  return [
    ...state.voids.map((record) => ({ kind: "void", id: record.id }) as const),
    ...state.records
      .filter((record) => record.canReplace)
      .map((record) => ({ kind: "placement", id: record.id }) as const),
  ];
}

function sweepState(label: string, design: Design): SweptInsert[] {
  const rows: SweptInsert[] = [];
  for (const target of offerTargets(design)) {
    const listing = createStore(design);
    listing.getState().select(target);
    for (const buildId of offeredBuildIds(listing)) {
      const store = createStore(design);
      store.getState().select(target);
      store.getState().insert(buildId);
      const after = store.getState();
      rows.push({
        state: label,
        target: `${target.kind} ${target.id}`,
        buildId,
        rejection: after.lastRejection?.code ?? null,
        replannedSomething:
          after.lastRejection === null &&
          replannedCount(
            design,
            after.design,
            placedIdOf(design, after.design),
          ) > 0,
      });
    }
  }
  return rows;
}

/** Which placement this insert wrote — the one id the after-document holds that the before-document
 *  did not, or, on a swap in place, the id that took the outgoing body's slot. */
function placedIdOf(before: Design, after: Design): string {
  const known = new Set(before.placements.map((placement) => placement.id));
  return (
    after.placements.find((placement) => !known.has(placement.id))?.id ?? ""
  );
}

/** The shipped kitchen at both declared settings, and with the deletes that reach S1–S4. Built from
 *  `declaredCabinetDepthsMm()` rather than from two literals, so a third declared depth is swept the
 *  day it is declared (ADR 0058 decision 2). */
function sweptStates(): readonly { label: string; design: Design }[] {
  return declaredCabinetDepthsMm().flatMap((cabinetDepthMm) => {
    const whole = atCabinetDepth(KITCHEN_L_DESIGN, cabinetDepthMm);
    const depth = String(cabinetDepthMm);
    return [
      { label: `shipped @${depth}`, design: whole },
      // S1's route: the full-height cabinet under the deep top deleted.
      { label: `p6 deleted @${depth}`, design: removed(whole, ["p6"]) },
      // S3's route: the top deleted, the full-height cabinet standing.
      { label: `p23 deleted @${depth}`, design: removed(whole, ["p23"]) },
      // S4's route: the column emptied.
      {
        label: `p6+p23 deleted @${depth}`,
        design: removed(whole, ["p6", "p23"]),
      },
    ];
  });
}

describe("wave 6Z work item 1 — every offered body, every target, both settings", () => {
  const swept = sweptStates().flatMap(({ label, design }) =>
    sweepState(label, design),
  );

  it("never refuses an offered insert because a dependent re-plan could not be built", () => {
    const refused = swept
      .filter((row) => row.rejection === DEPENDENT_REFUSAL)
      .map((row) => `${row.state}: ${row.buildId} into ${row.target}`);

    // A non-empty list here is ADR 0103 decision 7's split: the wave stops and `offersFor` learns to
    // predict the dependent re-plan as wave 6Z-a, before this one lands.
    expect(refused).toEqual([]);
  });

  it("swept a population that could have found one", () => {
    // Three quantities, because each of them silently collapsing is a different way this file could
    // go green while measuring nothing: no states, no offers, or offers that never reached a body
    // standing over the column they were inserted into.
    expect(sweptStates().length).toBe(8);
    // **Measured on 2026-09-08, and asserted exactly rather than as a floor.** A floor goes on
    // passing while the population quietly halves; these two numbers move only when the catalogue,
    // the fixture or the offer list moves, and each of those deserves a reader. The second is the
    // one that matters: 24 of the 786 inserts actually re-planned a standing body, so the verdict
    // above is a statement about the re-plan and not about inserts in general.
    expect([
      swept.length,
      swept.filter((row) => row.replannedSomething).length,
    ]).toEqual([786, 24]);
  });
});
