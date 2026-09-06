// Wave 6E adversarial QA: the web half — `applyCommandResult`'s new selection arm, and the one line
// of wiring that makes the settings container reach a price.
//
// Two things `whole-kitchen-settings.test.ts` beside this one does not do. It proves the selection
// is *carried through* a whole-kitchen setting but never that it is still put through
// `isStillPresent` on the way — so a selection that has stopped existing would survive a material
// change and dangle. And its pricing assertions take their expected side from `design.settings`,
// the same place the hook reads: they catch the wiring being deleted, but they cannot say the total
// moved by the amount the **book** declares. Both sides here are the book.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type Design,
  type PricedDesign,
  type PriceLine,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const storeState = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector(storeState.current),
  };
});

const { createConfiguratorStore } = await import("@/store/configurator-store");
const { usePricedDesign } = await import("@/price/use-priced-design");

const OCCURRED_AT = "2026-09-04T12:00:00.000Z";
const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

function freshStore(design: Design = KITCHEN_L_DESIGN) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
}

function readFromHook<T>(useHook: () => T): T {
  let seen: T | undefined;
  function Probe() {
    seen = useHook();
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (seen === undefined) throw new Error("the hook produced nothing");
  return seen;
}

/** The price the hook publishes for whatever state is currently mounted. */
function priceOf(state: unknown): PricedDesign {
  storeState.current = state;
  const result = readFromHook(usePricedDesign);
  if (!result.ok) throw new Error("expected the seeded design to price");
  return result.priced;
}

function lineOfKind(
  priced: PricedDesign,
  kind: "hardware" | "material",
): Extract<PriceLine, { readonly kind: "hardware" | "material" }> {
  const line = priced.lines.find((candidate) => candidate.kind === kind);
  if (!line || line.kind === "cabinet") {
    throw new Error(`expected a ${kind} line`);
  }
  return line;
}

function materialTier(tierId: string) {
  const tier = SAMPLE_PRICE_BOOK.material.tiers.find(
    (candidate) => candidate.tierId === tierId,
  );
  if (!tier)
    throw new Error(`the sample book holds no material tier ${tierId}`);
  return tier;
}

function hardwareTier(tierId: string) {
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (candidate) => candidate.tierId === tierId,
  );
  if (!tier)
    throw new Error(`the sample book holds no hardware tier ${tierId}`);
  return tier;
}

// The arm `applyCommandResult` gained is "return the selection the caller is holding". That is only
// half the rule the module states about itself: the carried selection is still funnelled through
// `isStillPresent`, so a whole-kitchen setting can never resurrect a selection that has stopped
// existing.
describe("the selection a whole-kitchen setting carries through", () => {
  it("keeps a selected placement, and its identity", () => {
    const store = freshStore();
    store.getState().select({ kind: "placement", id: "p0" });

    store.getState().setMaterialTier("material.veneer", MATERIAL_TIER_IDS);

    expect(store.getState().selection).toEqual({
      kind: "placement",
      id: "p0",
    });
  });

  // The seeded kitchen is full, so the only opening a customer can be holding is one they just made
  // — which is exactly the state §5.1 leaves them in after a delete, and the one a settings sheet
  // opened next must not close.
  it("keeps a selected opening", () => {
    const store = freshStore();
    store.getState().select({ kind: "placement", id: "p8" });
    store.getState().remove();
    const opening = store.getState().selection;
    expect(opening?.kind).toBe("void");

    store.getState().setHardwareTier("hardware.premium", HARDWARE_TIER_IDS);

    expect(store.getState().selection).toEqual(opening);
  });

  // The counterexample the carry-through arm must not create. `select` takes any target it is given
  // — it validates nothing — so a selection can already point at something the design does not
  // hold, and every other command drops one like it. A whole-kitchen setting may not be the
  // exception, or "the selection never dangles" becomes one rule with a hole in it.
  it("drops a selection that points at no placement in the design", () => {
    const store = freshStore();
    store.getState().select({ kind: "placement", id: "no-such-placement" });

    store.getState().setMaterialTier("material.veneer", MATERIAL_TIER_IDS);

    expect(store.getState().selection).toBeNull();
  });

  it("drops a selection that points at no opening", () => {
    const store = freshStore();
    store.getState().select({ kind: "void", id: "no-such-void" });

    store.getState().setHardwareTier("hardware.premium", HARDWARE_TIER_IDS);

    expect(store.getState().selection).toBeNull();
  });

  // A refusal touches nothing but the sentence, selection included.
  it("leaves the selection alone when the tier is refused", () => {
    const store = freshStore();
    store.getState().select({ kind: "placement", id: "p0" });

    store.getState().setMaterialTier("material.withdrawn", MATERIAL_TIER_IDS);

    expect(store.getState().selection).toEqual({
      kind: "placement",
      id: "p0",
    });
    expect(store.getState().lastRejection?.code).toBe("UNKNOWN_MATERIAL_TIER");
  });

  it("clears a refusal left on screen once a tier is accepted", () => {
    const store = freshStore();
    store.getState().setMaterialTier("material.withdrawn", MATERIAL_TIER_IDS);
    expect(store.getState().lastRejection).not.toBeNull();

    store.getState().setMaterialTier("material.veneer", MATERIAL_TIER_IDS);

    expect(store.getState().lastRejection).toBeNull();
  });

  // A whole-kitchen setting names no cabinet, so nothing about the kitchen's geometry may move
  // under it — the scene must not be rebuilt into a different shape by a price choice.
  it("moves no placement, no opening and no column", () => {
    const store = freshStore();
    const before = store.getState();
    const placementsBefore = before.design.placements;
    const voidIdsBefore = before.voids.map((opening) => opening.id);
    const columnKeysBefore = [...before.columns.keys()];

    store.getState().setMaterialTier("material.painted-mdf", MATERIAL_TIER_IDS);

    const after = store.getState();
    expect(after.design.placements).toBe(placementsBefore);
    expect(after.voids.map((opening) => opening.id)).toEqual(voidIdsBefore);
    expect([...after.columns.keys()]).toEqual(columnKeysBefore);
  });
});

// **Both sides are the price book.** Nothing below reads `design.settings` to build an expected
// value, so deleting the hook's `selections: design.settings` cannot cancel out: the total is
// required to move by the exact delta the book declares between the tier chosen and the tier the
// book defaults to.
describe("the settings container reaches the price, by the book's own amounts", () => {
  it("prices an unset kitchen at the tiers the book names as default", () => {
    const store = freshStore();

    const priced = priceOf(store.getState());

    expect(lineOfKind(priced, "material").tierId).toBe(
      SAMPLE_PRICE_BOOK.material.defaultTierId,
    );
    expect(lineOfKind(priced, "hardware").tierId).toBe(
      SAMPLE_PRICE_BOOK.hardware.defaultTierId,
    );
  });

  it.each(MATERIAL_TIER_IDS)(
    "prices %s at that tier's own whole-kitchen amount",
    (tierId) => {
      const store = freshStore();
      const atDefault = priceOf(store.getState());

      store.getState().setMaterialTier(tierId, MATERIAL_TIER_IDS);
      const chosen = priceOf(store.getState());

      const chosenTier = materialTier(tierId);
      const defaultTier = materialTier(
        SAMPLE_PRICE_BOOK.material.defaultTierId,
      );
      expect(lineOfKind(chosen, "material").tierId).toBe(tierId);
      expect(lineOfKind(chosen, "material").amountMinor).toBe(
        chosenTier.wholeKitchenMinor,
      );
      expect(chosen.totalMinor - atDefault.totalMinor).toBe(
        chosenTier.wholeKitchenMinor - defaultTier.wholeKitchenMinor,
      );
    },
  );

  it.each(HARDWARE_TIER_IDS)(
    "prices %s at that tier's own per-handle amount",
    (tierId) => {
      const store = freshStore();
      const atDefault = priceOf(store.getState());

      store.getState().setHardwareTier(tierId, HARDWARE_TIER_IDS);
      const chosen = priceOf(store.getState());

      const chosenTier = hardwareTier(tierId);
      const defaultTier = hardwareTier(
        SAMPLE_PRICE_BOOK.hardware.defaultTierId,
      );
      // The quantity is the kitchen's handle count, which no selection can change — so it is the
      // one thing taken from the priced result rather than from the book.
      const handles = lineOfKind(chosen, "hardware").quantity;
      expect(handles).toBeGreaterThan(0);
      expect(lineOfKind(chosen, "hardware").tierId).toBe(tierId);
      expect(lineOfKind(chosen, "hardware").unitAmountMinor).toBe(
        chosenTier.perCabinetHandleMinor,
      );
      expect(chosen.totalMinor - atDefault.totalMinor).toBe(
        handles *
          (chosenTier.perCabinetHandleMinor -
            defaultTier.perCabinetHandleMinor),
      );
    },
  );

  // Two designs differing in **nothing but** `settings`, priced through the hook. The assertion is
  // that the difference between them is exactly what the two tiers differ by — which a hook that
  // ignored the container could not produce, and which a hook reading the wrong key could not
  // produce either.
  it("separates two designs that differ only in their settings", () => {
    const veneer: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { materialTierId: "material.veneer" },
    };
    const paintedMdf: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { materialTierId: "material.painted-mdf" },
    };

    const veneerTotal = priceOf(freshStore(veneer).getState()).totalMinor;
    const paintedTotal = priceOf(freshStore(paintedMdf).getState()).totalMinor;

    expect(veneerTotal - paintedTotal).toBe(
      materialTier("material.veneer").wholeKitchenMinor -
        materialTier("material.painted-mdf").wholeKitchenMinor,
    );
    expect(veneerTotal).not.toBe(paintedTotal);
  });

  // The two settings are independent: choosing a material may not move the hardware line, and the
  // hook may not be reading one key where it means the other.
  it("keeps each key on its own line", () => {
    const store = freshStore();
    store.getState().setMaterialTier("material.veneer", MATERIAL_TIER_IDS);
    const afterMaterial = priceOf(store.getState());

    expect(lineOfKind(afterMaterial, "hardware").tierId).toBe(
      SAMPLE_PRICE_BOOK.hardware.defaultTierId,
    );

    store.getState().setHardwareTier("hardware.premium", HARDWARE_TIER_IDS);
    const afterBoth = priceOf(store.getState());

    expect(lineOfKind(afterBoth, "material").tierId).toBe("material.veneer");
    expect(lineOfKind(afterBoth, "hardware").tierId).toBe("hardware.premium");
  });

  // The `exactOptionalPropertyTypes` widening let an explicit `undefined` reach the hook. It has to
  // mean "unset", not "a tier named undefined" — which would refuse the whole price.
  it("prices a container holding explicit undefined as an unset kitchen", () => {
    const explicit: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { materialTierId: undefined, hardwareTierId: undefined },
    };

    const priced = priceOf(freshStore(explicit).getState());

    expect(priced.totalMinor).toBe(
      priceOf(freshStore(KITCHEN_L_DESIGN).getState()).totalMinor,
    );
    expect(lineOfKind(priced, "material").tierId).toBe(
      SAMPLE_PRICE_BOOK.material.defaultTierId,
    );
  });
});
