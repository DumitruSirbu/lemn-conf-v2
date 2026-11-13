// The kitchen handle inside one press of *Aplică*: planned like the other whole-kitchen settings, run before the
// depth (whose result carries the frozen column map the store applies) and, like each of them, leaving the selection
// where it was.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredCabinetDepthsMm,
  KITCHEN_L_DESIGN,
  type Design,
  type Handle,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  preflightWholeKitchenSettings,
  type WholeKitchenSettingsRequest,
} from "@/store/whole-kitchen-apply";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-11-02T09:00:00.000Z";
const NO_TIERS = {
  availableMaterialTierIds: [],
  availableHardwareTierIds: [],
} as const;

const ANOTHER_DEPTH_MM =
  declaredCabinetDepthsMm().find(
    (depthMm) => depthMm !== cabinetDepthMmOf(KITCHEN_L_DESIGN),
  ) ?? 0;

const CARRYING_BLACK: Design = {
  ...KITCHEN_L_DESIGN,
  settings: { ...KITCHEN_L_DESIGN.settings, handle: "black" },
};

function preflight(
  request: Partial<WholeKitchenSettingsRequest>,
  design = KITCHEN_L_DESIGN,
) {
  return preflightWholeKitchenSettings(
    { ...NO_TIERS, ...request },
    {
      design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      occurredAt: OCCURRED_AT,
    },
  );
}

describe("a press that names a kitchen handle", () => {
  it.each<Handle>(["steel", "black", "push"])(
    "writes %s as the kitchen's handle and reports the whole-kitchen effect",
    (handle) => {
      const outcome = preflight({ handle });

      if (outcome.outcome !== "ready") throw new Error(outcome.outcome);
      expect(outcome.result.effect).toEqual({
        type: "kitchen_handle_set",
        handle,
      });
      expect(outcome.result.design.settings?.handle).toBe(handle);
    },
  );

  it("runs no command for a handle the design already carries", () => {
    expect(preflight({ handle: "black" }, CARRYING_BLACK)).toEqual({
      outcome: "unchanged",
    });
  });

  it("runs no command when no handle is named, so an untouched sheet stamps none", () => {
    expect(preflight({})).toEqual({ outcome: "unchanged" });
  });

  it("names the handle as the refused setting when the command refuses the value", () => {
    const outcome = preflight({ handle: "gold" as Handle });

    expect(outcome).toMatchObject({
      outcome: "refused",
      setting: "handle",
      reason: { code: "UNKNOWN_HANDLE" },
    });
  });

  it("leaves a depth change last, so the result the store applies still carries the depth's column map", () => {
    const outcome = preflight({
      handle: "push",
      cabinetDepthMm: ANOTHER_DEPTH_MM,
    });

    if (outcome.outcome !== "ready") throw new Error(outcome.outcome);
    expect(outcome.result.effect.type).toBe("cabinet_depth_set");
    expect(outcome.result.design.settings?.handle).toBe("push");
    expect(cabinetDepthMmOf(outcome.result.design)).toBe(ANOTHER_DEPTH_MM);
  });
});

describe("the store applying a kitchen handle", () => {
  function storeWithASelectedCabinet() {
    const saved: Design[] = [];
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      onDesignChanged: (design) => saved.push(design),
    });
    const selected = {
      kind: "placement",
      id: store.getState().records[0]?.id ?? "",
    } as const;
    store.getState().select(selected);
    return { store, saved, selected };
  }

  it("keeps the cabinet that was selected, selected", () => {
    const { store, selected } = storeWithASelectedCabinet();

    const outcome = store
      .getState()
      .applyWholeKitchenSettings({ ...NO_TIERS, handle: "push" });

    expect(outcome).toEqual({ committed: true });
    expect(store.getState().selection).toEqual(selected);
  });

  it("holds the new handle in the design and schedules one save", () => {
    const { store, saved } = storeWithASelectedCabinet();

    store.getState().applyWholeKitchenSettings({ ...NO_TIERS, handle: "push" });

    expect(store.getState().design.settings?.handle).toBe("push");
    expect(saved).toHaveLength(1);
  });

  it("leaves every cabinet's own handle as it was, so none is overwritten by the kitchen's", () => {
    const { store } = storeWithASelectedCabinet();
    const before = store.getState().design.placements;

    store
      .getState()
      .applyWholeKitchenSettings({ ...NO_TIERS, handle: "black" });

    expect(store.getState().design.placements).toBe(before);
  });

  it("schedules no save for a press that names no handle", () => {
    const { store, saved } = storeWithASelectedCabinet();

    store.getState().applyWholeKitchenSettings({ ...NO_TIERS });

    expect(saved).toEqual([]);
  });
});
