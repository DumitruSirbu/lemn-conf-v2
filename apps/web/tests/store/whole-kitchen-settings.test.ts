// Wave 6E's web half: the two store actions, and the hook that turns what they wrote into a price.
//
// **The store names no price book**, which is why both actions take the offered ids as an argument
// (ADR 0062 seam 1) — `use-priced-design.ts` is the one module in this application that imports one,
// and wave 6G is what supplies the list from there. This file imports the sample book only to build
// the ids a caller would hand in, and only in the pricing block, which is that module's own test.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { createFakeProbeFactory } from "../support/fake-body-probe";

/** The store state the hook under test reads, swapped between cases so the real `usePricedDesign`
 *  runs against a real store's real fields rather than a fixture shaped like one. */
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

describe("the two whole-kitchen store actions", () => {
  it("writes the material tier into the design and reports no refusal", () => {
    const store = freshStore();

    // Read before, rather than restating 600: the depth is not this test's subject, and `toEqual`
    // stays exact so the command adding any *other* key still fails here.
    const depthMm = store.getState().design.settings?.cabinetDepthMm;

    store.getState().setMaterialTier("material.veneer", MATERIAL_TIER_IDS);

    expect(store.getState().design.settings).toEqual({
      cabinetDepthMm: depthMm,
      materialTierId: "material.veneer",
    });
    expect(store.getState().lastRejection).toBeNull();
  });

  it("writes the hardware tier beside a material already chosen", () => {
    const store = freshStore();

    const depthMm = store.getState().design.settings?.cabinetDepthMm;

    store.getState().setMaterialTier("material.veneer", MATERIAL_TIER_IDS);
    store.getState().setHardwareTier("hardware.premium", HARDWARE_TIER_IDS);

    expect(store.getState().design.settings).toEqual({
      cabinetDepthMm: depthMm,
      materialTierId: "material.veneer",
      hardwareTierId: "hardware.premium",
    });
  });

  // Neither needs a selection: they apply to every body, so §5.1's "nothing selected" refusal has
  // nothing to say about them.
  it("applies with nothing selected", () => {
    const store = freshStore();
    expect(store.getState().selection).toBeNull();

    store.getState().setHardwareTier("hardware.soft-close", HARDWARE_TIER_IDS);

    expect(store.getState().design.settings?.hardwareTierId).toBe(
      "hardware.soft-close",
    );
    expect(store.getState().lastRejection).toBeNull();
  });

  // A whole-kitchen setting acts on no cabinet, so the selection the customer is holding survives
  // it. Setting the material out from under an open panel must not close the panel.
  it("leaves an existing selection exactly where it was", () => {
    const store = freshStore();
    store.getState().select({ kind: "placement", id: "p0" });
    const before = store.getState().selection;

    store.getState().setMaterialTier("material.painted-mdf", MATERIAL_TIER_IDS);

    expect(store.getState().selection).toEqual(before);
  });

  it("notifies the save path exactly once per applied change", () => {
    const onDesignChanged = vi.fn();
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => OCCURRED_AT,
      onDesignChanged,
    });

    store.getState().setMaterialTier("material.veneer", MATERIAL_TIER_IDS);

    expect(onDesignChanged).toHaveBeenCalledTimes(1);
    expect(onDesignChanged.mock.calls[0]?.[0]).toBe(store.getState().design);
  });

  it("publishes the refusal and changes nothing when the tier is not offered", () => {
    const store = freshStore();
    const before = store.getState().design;

    store.getState().setMaterialTier("material.withdrawn", MATERIAL_TIER_IDS);

    expect(store.getState().design).toBe(before);
    expect(store.getState().lastRejection?.code).toBe("UNKNOWN_MATERIAL_TIER");
  });

  it("publishes the hardware refusal under its own code", () => {
    const store = freshStore();
    // Captured before the refused command, not read back from the object under assertion — reading
    // it afterwards would compare the settings to themselves and pass however they changed.
    const settingsBefore = store.getState().design.settings;

    store.getState().setHardwareTier("hardware.withdrawn", HARDWARE_TIER_IDS);

    expect(store.getState().lastRejection?.code).toBe("UNKNOWN_HARDWARE_TIER");
    // A refused command writes no tier. Since wave 6J-a, `settings` always exists to carry the
    // persisted depth, so "wrote nothing" means unchanged rather than absent.
    expect(store.getState().design.settings).toEqual(settingsBefore);
    expect(store.getState().design.settings?.hardwareTierId).toBeUndefined();
  });
});

// Wave 6E's last criterion: pricing reads material and hardware from the settings container, and
// from nowhere else.
describe("usePricedDesign reads the settings container", () => {
  function priceWith(design: Design) {
    return priceDesign({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: design.settings,
    });
  }

  it("prices a design with no container at the book's own defaults", () => {
    const store = freshStore();
    storeState.current = store.getState();

    const priced = readFromHook(usePricedDesign);
    const expected = priceWith(KITCHEN_L_DESIGN);
    if (!priced.ok || !expected.ok) {
      throw new Error("expected the seeded design to price");
    }
    expect(priced.priced.totalMinor).toBe(expected.priced.totalMinor);
  });

  // The test a dropped `selections: design.settings` fails. Without it the hook prices the veneer
  // kitchen at the melamine default and this total is the one above.
  it("moves the total when the store's material tier changes", () => {
    const store = freshStore();
    storeState.current = store.getState();
    const atDefault = readFromHook(usePricedDesign);

    store.getState().setMaterialTier("material.veneer", MATERIAL_TIER_IDS);
    storeState.current = store.getState();
    const atVeneer = readFromHook(usePricedDesign);

    if (!atDefault.ok || !atVeneer.ok) {
      throw new Error("expected both designs to price");
    }
    expect(atVeneer.priced.totalMinor).toBeGreaterThan(
      atDefault.priced.totalMinor,
    );
    const expected = priceWith(store.getState().design);
    if (!expected.ok) throw new Error("expected the design to price");
    expect(atVeneer.priced.totalMinor).toBe(expected.priced.totalMinor);
  });

  it("moves the total when the store's hardware tier changes", () => {
    const store = freshStore();
    storeState.current = store.getState();
    const atDefault = readFromHook(usePricedDesign);

    store.getState().setHardwareTier("hardware.premium", HARDWARE_TIER_IDS);
    storeState.current = store.getState();
    const atPremium = readFromHook(usePricedDesign);

    if (!atDefault.ok || !atPremium.ok) {
      throw new Error("expected both designs to price");
    }
    expect(atPremium.priced.totalMinor).toBeGreaterThan(
      atDefault.priced.totalMinor,
    );
  });
});
