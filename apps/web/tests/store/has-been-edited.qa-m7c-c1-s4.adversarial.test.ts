// M7C C1 S4, adversarial QA: what may and may not count as *"the customer has made an edit"* (Q10).
// The browser's Back asks *"the changes you made will be lost"*, so the flag must be raised by a change
// and by nothing else: not a refusal through any path, not an untouched settings sheet, and not a
// command that succeeds while leaving the design exactly as it was.
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";
import { createFakeProbeFactory } from "../support/fake-body-probe";

const HARDWARE_TIER = "standard";
const MATERIAL_TIER = "pal";
const SINK_CABINET_ID = "p0";
const BLACK_HANDLE = "black";

const DESIGN_WITH_TIERS: Design = {
  ...KITCHEN_L_DESIGN,
  settings: {
    ...KITCHEN_L_DESIGN.settings,
    hardwareTierId: HARDWARE_TIER,
    materialTierId: MATERIAL_TIER,
  },
};

function createStore(design: Design = DESIGN_WITH_TIERS) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => "2026-08-25T12:00:00.000Z",
    probeAt: createFakeProbeFactory(),
  });
}

describe("hasBeenEdited is raised by a change and by nothing else", () => {
  it("stays false after a tier the book does not offer is refused", () => {
    const store = createStore();

    store.getState().setHardwareTier("withdrawn", [HARDWARE_TIER]);

    expect(store.getState().lastRejection).not.toBeNull();
    expect(store.getState().hasBeenEdited).toBe(false);
  });

  it("stays false after the settings sheet's Apply is refused", () => {
    const store = createStore();

    const outcome = store.getState().applyWholeKitchenSettings({
      hardwareTierId: "withdrawn",
      availableMaterialTierIds: [MATERIAL_TIER],
      availableHardwareTierIds: [HARDWARE_TIER],
    });

    expect(outcome.committed).toBe(false);
    expect(store.getState().hasBeenEdited).toBe(false);
  });

  it("stays false after the settings sheet's Apply with nothing changed", () => {
    const store = createStore();

    const outcome = store.getState().applyWholeKitchenSettings({
      hardwareTierId: HARDWARE_TIER,
      materialTierId: MATERIAL_TIER,
      availableMaterialTierIds: [MATERIAL_TIER],
      availableHardwareTierIds: [HARDWARE_TIER],
    });

    expect(outcome.committed).toBe(true);
    expect(store.getState().hasBeenEdited).toBe(false);
  });

  it("stays false when a command re-sets the tier the design already holds — nothing was changed", () => {
    const store = createStore();
    const before = store.getState().design;

    store.getState().setHardwareTier(HARDWARE_TIER, [HARDWARE_TIER]);

    expect(store.getState().design.settings).toEqual(before.settings);
    expect(
      store.getState().hasBeenEdited,
      "the customer re-tapped the chip they were on; Back would warn of changes that do not exist",
    ).toBe(false);
  });

  it("stays false when the panel's already-pressed handle chip is tapped again — the chip stays enabled", () => {
    const seeded = createStore();
    seeded.getState().select({ kind: "placement", id: SINK_CABINET_ID });
    seeded.getState().setHandle(BLACK_HANDLE);
    const store = createStore(seeded.getState().design);
    store.getState().select({ kind: "placement", id: SINK_CABINET_ID });
    const before = store.getState().design;

    store.getState().setHandle(BLACK_HANDLE);

    expect(store.getState().lastRejection).toBeNull();
    expect(store.getState().design.placements).toEqual(before.placements);
    expect(
      store.getState().hasBeenEdited,
      "a re-tap of the pressed chip changed nothing, yet Back would now warn",
    ).toBe(false);
  });

  it("is raised by a change that is later reverted by hand — Q10 counts edits, and there is no undo", () => {
    const store = createStore();

    store.getState().setHardwareTier("premium", [HARDWARE_TIER, "premium"]);
    store.getState().setHardwareTier(HARDWARE_TIER, [HARDWARE_TIER, "premium"]);

    expect(store.getState().design.settings?.hardwareTierId).toBe(
      HARDWARE_TIER,
    );
    expect(store.getState().hasBeenEdited).toBe(true);
  });
});
