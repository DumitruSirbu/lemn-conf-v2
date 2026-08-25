import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "./configurator-store";

describe("createConfiguratorStore", () => {
  it("derives records and columns from the design at creation, never as authored fields", () => {
    const store = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const state = store.getState();

    expect(state.records).toHaveLength(KITCHEN_L_DESIGN.placements.length);
    expect(state.columns.size).toBeGreaterThan(0);
    // The seeded fixture is fully occupied by design (M1 fidelity), so an empty derived void set
    // here is the correct answer, not an untested path — see the void-engine's own row-17/18 tests
    // for cases that do produce voids.
    expect(state.voids).toEqual([]);
  });

  it("exposes no setter for placements, records, columns or voids", () => {
    const store = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const state = store.getState() as unknown as Record<string, unknown>;

    expect(state.setPlacements).toBeUndefined();
    expect(state.setRecords).toBeUndefined();
    expect(state.setColumns).toBeUndefined();
    expect(state.setVoids).toBeUndefined();
  });

  it("starts with no selection", () => {
    const store = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    expect(store.getState().selection).toBeNull();
  });

  it("select() sets the selection by kind and id", () => {
    const store = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    store.getState().select({ kind: "placement", id: "p0" });
    expect(store.getState().selection).toEqual({ kind: "placement", id: "p0" });
  });

  it("select() replaces a prior selection rather than merging it", () => {
    const store = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().select({ kind: "void", id: "A|2.60:v0:0.00" });
    expect(store.getState().selection).toEqual({
      kind: "void",
      id: "A|2.60:v0:0.00",
    });
  });

  it("deselect() clears the selection", () => {
    const store = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().deselect();
    expect(store.getState().selection).toBeNull();
  });

  it("starts unminted: no designId, idle status, not persisted", () => {
    const store = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const state = store.getState();

    expect(state.designId).toBeNull();
    expect(state.saveStatus).toBe("idle");
    expect(state.hasPersistedSuccessfully).toBe(false);
  });

  it("applySavedId records the id and flips hasPersistedSuccessfully to true", () => {
    const store = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );

    store.getState().applySavedId("design-1");

    expect(store.getState().designId).toBe("design-1");
    expect(store.getState().hasPersistedSuccessfully).toBe(true);
  });

  it("setSaveStatus updates saveStatus without touching hasPersistedSuccessfully", () => {
    const store = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );

    store.getState().setSaveStatus("saving");
    expect(store.getState().saveStatus).toBe("saving");
    expect(store.getState().hasPersistedSuccessfully).toBe(false);

    store.getState().setSaveStatus("error");
    expect(store.getState().saveStatus).toBe("error");
  });

  it("hydrate replaces the design, re-derives geometry, clears selection, and marks it persisted", () => {
    const store = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    store.getState().select({ kind: "placement", id: "p0" });

    const nextDesign = { ...KITCHEN_L_DESIGN, presetId: "hydrated" };
    store.getState().hydrate(nextDesign, "design-2");

    const state = store.getState();
    expect(state.design).toBe(nextDesign);
    expect(state.designId).toBe("design-2");
    expect(state.hasPersistedSuccessfully).toBe(true);
    expect(state.selection).toBeNull();
    expect(state.records).toHaveLength(nextDesign.placements.length);
  });

  it("two store instances do not share selection state", () => {
    const storeA = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    const storeB = createConfiguratorStore(
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );
    storeA.getState().select({ kind: "placement", id: "p0" });
    expect(storeB.getState().selection).toBeNull();
  });
});
