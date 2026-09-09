// **Where wave 6Z meets ADR 0099, and neither wave's own suite could look.**
//
// 6Z re-plans a standing body when something is inserted beneath it, and it re-plans through
// `rebuild` -> `evaluateInsertFit` -> `carriedAppearance`. ADR 0099 decision 2 forbids that path from
// ever writing a *resolved* colour into `body.finish`: a cabinet that merely follows the kitchen must
// stay following, or the next global change leaves it behind.
//
// The two waves were built in separate worktrees on the same day and each asserted its own half —
// 6Z that a re-plan stamps no colour, ADR 0099's wave that an insert and a resize stamp none. Neither
// ran the case where a re-plan happens **while a whole-kitchen colour is set**, because neither tree
// contained the other's code. This file is that case.
//
// It is a composition test and it is deliberately end-to-end: the store, the real commands, the real
// records. A unit test of either half would pass with the other half broken.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  MATERIALS,
  paletteEntriesOf,
  type Finish,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const DEEPER_MM = 700;
const THE_DEEP_TOP = "p23";
const THE_PANTRY_BENEATH_IT = "p6";
/** What the top is re-planned to once a full-height member stands under it again: 700 mm finished,
 *  seated at 661. The number is ADR 0101's lifted arm and is asserted by 6Z's own suite; it is
 *  restated here so a failure says which half broke. */
const LIFTED_SEAT_M = 0.661;
const CAPPED_SEAT_M = 0.361;

function aColourThatIsNotMelaminesDefault(): Finish {
  const melamine = MATERIALS.find((m) => m.materialId === "material.melamine");
  if (!melamine) throw new Error("material.melamine is not declared");
  const entry = paletteEntriesOf(melamine).find((e) => e.entryId !== "pal.alb");
  if (!entry) throw new Error("melamine offers nothing but its default");
  return { kind: "palette-entry", entryId: entry.entryId };
}

function createStore() {
  return createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => "2026-09-05T12:00:00.000Z",
  });
}

type Store = ReturnType<typeof createStore>;

function bodyOf(store: Store, id: string) {
  const body = store
    .getState()
    .design.placements.find((p) => p.id === id)?.body;
  if (!body) throw new Error(`no placement ${id}`);
  return body;
}

function recordOf(store: Store, id: string) {
  const record = store.getState().records.find((r) => r.id === id);
  if (!record) throw new Error(`no record ${id}`);
  return record;
}

function insertBeneathTheTop(store: Store, buildId: string): void {
  const state = store.getState();
  const key = [...state.columns.keys()].find((k) => k.startsWith("B|1.9"));
  if (!key) throw new Error("the pantry column is not published at 700");
  const opening = state.voids
    .filter((v) => v.col === key)
    .sort((a, b) => a.y0 - b.y0)[0];
  if (!opening) throw new Error(`no opening in ${key}`);
  store.getState().select({ kind: "void", id: opening.id });
  store.getState().insert(buildId);
}

describe("a dependent re-plan under a whole-kitchen colour", () => {
  it("changes the depth and leaves the cabinet following", () => {
    const store = createStore();
    const colour = aColourThatIsNotMelaminesDefault();

    store.getState().applyWholeKitchenSettings({
      materialTierId: "material.melamine",
      finish: colour,
      availableMaterialTierIds: MATERIALS.map((m) => m.materialId),
      availableHardwareTierIds: [],
    });

    // Non-vacuity: the top must be following, or this asserts nothing about the rule.
    expect("finish" in bodyOf(store, THE_DEEP_TOP)).toBe(false);
    expect(recordOf(store, THE_DEEP_TOP).drawnFinish).toStrictEqual(colour);

    store.getState().select({ kind: "placement", id: THE_PANTRY_BENEATH_IT });
    store.getState().remove();
    store.getState().setCabinetDepth(DEEPER_MM);
    // The owner's accepted transient: no full-height member, so the cap applies.
    expect(recordOf(store, THE_DEEP_TOP).frame.d).toBeCloseTo(CAPPED_SEAT_M, 3);

    insertBeneathTheTop(store, "tall-pantry");

    // 6Z did its work...
    expect(recordOf(store, THE_DEEP_TOP).frame.d).toBeCloseTo(LIFTED_SEAT_M, 3);
    // ...without converting "follows the kitchen" into "chose this colour". Key presence, never the
    // value: a value assertion passes while the key is being stamped.
    expect("finish" in bodyOf(store, THE_DEEP_TOP)).toBe(false);
    // ...and the top still draws in the kitchen's colour, so the scene did not go white.
    expect(recordOf(store, THE_DEEP_TOP).drawnFinish).toStrictEqual(colour);
  });

  it("carries a cabinet's OWN colour across the same re-plan", () => {
    const store = createStore();
    const colour = aColourThatIsNotMelaminesDefault();

    store.getState().select({ kind: "placement", id: THE_DEEP_TOP });
    store.getState().setFinish(colour);
    expect("finish" in bodyOf(store, THE_DEEP_TOP)).toBe(true);

    store.getState().select({ kind: "placement", id: THE_PANTRY_BENEATH_IT });
    store.getState().remove();
    store.getState().setCabinetDepth(DEEPER_MM);
    insertBeneathTheTop(store, "tall-pantry");

    // The other direction of the same rule: a re-plan must not DROP a real choice either.
    expect(recordOf(store, THE_DEEP_TOP).frame.d).toBeCloseTo(LIFTED_SEAT_M, 3);
    expect(bodyOf(store, THE_DEEP_TOP).finish).toStrictEqual(colour);
  });
});
