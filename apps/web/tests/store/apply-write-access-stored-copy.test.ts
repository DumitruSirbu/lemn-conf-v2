import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import { describe, expect, it, vi } from "vitest";

import { createConfiguratorStore } from "../../src/store/configurator-store";

const DESIGN_ID = "returned-to" as DesignId;
const OTHER_DESIGN_ID = "another-design" as DesignId;
const KEPT_REVISION = "2";
const STORED_REVISION = "3";
const HARDWARE_TIER = "standard";
const OTHER_HARDWARE_TIER = "premium";

const KEPT_PAGE: Design = {
  ...KITCHEN_L_DESIGN,
  settings: { ...KITCHEN_L_DESIGN.settings, hardwareTierId: HARDWARE_TIER },
};

const STORED_COPY: Design = {
  ...KEPT_PAGE,
  placements: KEPT_PAGE.placements.slice(0, -1),
};

function loadKeptPage(
  revision: string = KEPT_REVISION,
  onDesignIdentityChanged: () => void = () => undefined,
) {
  const store = createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    onDesignIdentityChanged,
  });
  store.getState().hydrate({
    design: KEPT_PAGE,
    designId: DESIGN_ID,
    revision,
    canWrite: "checking",
  });
  return store;
}

function answerWith(revision: string, design: Design = STORED_COPY) {
  return {
    designId: DESIGN_ID,
    canWrite: true,
    stored: { design, revision },
  };
}

describe("the stored copy taken with the probe's answer", () => {
  it("replaces a clean older copy with the stored design and revision, in one store write", () => {
    const store = loadKeptPage();
    const writes = vi.fn();
    store.subscribe(writes);

    store.getState().applyWriteAccess(answerWith(STORED_REVISION));

    expect(writes).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({
      design: STORED_COPY,
      savedDesign: STORED_COPY,
      revision: STORED_REVISION,
      canWrite: true,
    });
  });

  it("leaves the store as a load does: geometry derived from the stored design, nothing selected, idle", () => {
    const store = loadKeptPage();
    store.getState().select({ kind: "placement", id: "p0" });
    const placementsBefore = store.getState().records.length;

    store.getState().applyWriteAccess(answerWith(STORED_REVISION));

    expect(store.getState().records).toHaveLength(placementsBefore - 1);
    expect(store.getState()).toMatchObject({
      selection: null,
      hasBeenEdited: false,
      saveStatus: "idle",
      saveResumesAtMs: null,
      lastRejection: null,
    });
  });

  it("derives the catalogue from the stored design's own cabinet depth", () => {
    const store = loadKeptPage();
    const catalogBefore = store.getState().catalog;
    const deeperCopy: Design = {
      ...STORED_COPY,
      settings: { ...STORED_COPY.settings, cabinetDepthMm: 700 },
    };

    store.getState().applyWriteAccess(answerWith("3", deeperCopy));

    expect(store.getState().catalog).not.toBe(catalogBefore);
  });

  it("does not move the save generation, since it is the same design", () => {
    const onDesignIdentityChanged = vi.fn();
    const store = loadKeptPage(KEPT_REVISION, onDesignIdentityChanged);
    onDesignIdentityChanged.mockClear();

    store.getState().applyWriteAccess(answerWith(STORED_REVISION));

    expect(onDesignIdentityChanged).not.toHaveBeenCalled();
  });

  it.each([
    ["9", "10"],
    ["99", "100"],
    ["1", "2"],
  ])("takes revision %s to %s, compared as whole numbers", (kept, stored) => {
    const store = loadKeptPage(kept);

    store.getState().applyWriteAccess(answerWith(stored));

    expect(store.getState().revision).toBe(stored);
    expect(store.getState().design).toBe(STORED_COPY);
  });
});

describe("the stored copy is not taken", () => {
  it.each([
    ["an equal revision", KEPT_REVISION],
    ["a lesser revision", "1"],
    ["a revision with a leading zero", "03"],
    ["an empty revision", ""],
    ["a revision that is not a number", "three"],
  ])("with %s: write access alone is applied", (_name, revision) => {
    const store = loadKeptPage();

    store.getState().applyWriteAccess(answerWith(revision));

    expect(store.getState().design).toBe(KEPT_PAGE);
    expect(store.getState().revision).toBe(KEPT_REVISION);
    expect(store.getState().canWrite).toBe(true);
  });

  it("with a revision of 9 against the 10 held, write access alone is applied", () => {
    const store = loadKeptPage("10");

    store.getState().applyWriteAccess(answerWith("9"));

    expect(store.getState().design).toBe(KEPT_PAGE);
    expect(store.getState().revision).toBe("10");
  });

  it("when the held revision is not a number, whatever the stored one is", () => {
    const store = loadKeptPage("not-a-number");

    store.getState().applyWriteAccess(answerWith("99"));

    expect(store.getState().design).toBe(KEPT_PAGE);
    expect(store.getState().revision).toBe("not-a-number");
  });

  it("when no revision is held and the stored one is not a number", () => {
    const store = createConfiguratorStore({
      design: KEPT_PAGE,
      catalogAt: buildKitchenLBodyCatalog,
      designId: DESIGN_ID,
    });

    store.getState().applyWriteAccess(answerWith("three"));

    expect(store.getState().design).toBe(KEPT_PAGE);
    expect(store.getState().revision).toBeNull();
  });

  it("when the store holds an unsaved edit, which is kept whole with its revision", () => {
    const store = loadKeptPage();
    store
      .getState()
      .setHardwareTier(OTHER_HARDWARE_TIER, [
        HARDWARE_TIER,
        OTHER_HARDWARE_TIER,
      ]);
    const editedDesign = store.getState().design;
    expect(editedDesign).not.toBe(store.getState().savedDesign);

    store.getState().applyWriteAccess(answerWith("9"));

    expect(store.getState()).toMatchObject({
      design: editedDesign,
      savedDesign: KEPT_PAGE,
      revision: KEPT_REVISION,
      hasBeenEdited: true,
      canWrite: true,
    });
  });

  it("when the revision is equal, the design on screen stays the same object and the selection stays", () => {
    const store = loadKeptPage();
    store.getState().select({ kind: "placement", id: "p0" });
    const designBefore = store.getState().design;
    const recordsBefore = store.getState().records;

    store.getState().applyWriteAccess(answerWith(KEPT_REVISION));

    expect(store.getState().design).toBe(designBefore);
    expect(store.getState().records).toBe(recordsBefore);
    expect(store.getState().selection).toEqual({ kind: "placement", id: "p0" });
  });

  it("when it answers for a design the store has since left, nothing is applied", () => {
    const store = loadKeptPage();

    store.getState().applyWriteAccess({
      ...answerWith(STORED_REVISION),
      designId: OTHER_DESIGN_ID,
    });

    expect(store.getState()).toMatchObject({
      design: KEPT_PAGE,
      revision: KEPT_REVISION,
      canWrite: "checking",
    });
  });

  it("when the answer carries no copy, write access alone is applied", () => {
    const store = loadKeptPage();

    store.getState().applyWriteAccess({ designId: DESIGN_ID, canWrite: false });

    expect(store.getState()).toMatchObject({
      design: KEPT_PAGE,
      revision: KEPT_REVISION,
      canWrite: false,
    });
  });
});
