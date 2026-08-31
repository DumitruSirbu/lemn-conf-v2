import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describePanel, type OpenPanel } from "../../src/panel/panel-model";
import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "../../src/store/configurator-store";

import { ro } from "../../src/content/ro";

import { occupiedMeta, offers } from "../support/selection-meta";

function createSeededStore() {
  return createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
  });
}

/** §9's panel built from exactly the two facts this store publishes about writing, so a test can
 *  ask what the customer would actually see rather than only what the store field says. The `meta`
 *  is a fixture: which body is selected has nothing to do with who may write. */
function panelFrom(state: ConfiguratorState): OpenPanel {
  const panel = describePanel({
    meta: occupiedMeta(),
    offers: offers(3),
    rejection: null,
    widthOptions: [],
    isBodyProbeAttached: true,
    canWrite: state.canWrite,
    saveStatus: state.saveStatus,
  });
  if (panel.kind !== "open") throw new Error("expected an open panel");
  return panel;
}

describe("canWrite — who may edit this design", () => {
  it("defaults to true for a design that has never been minted", () => {
    // The customer is about to mint it on their first mutation, so there is no credential to hold
    // *yet*. A fresh configurator that believed itself read-only would refuse every edit it is
    // about to be granted — worse than the bug canWrite exists to fix.
    expect(createSeededStore().getState().canWrite).toBe(true);
  });

  it("takes the server's answer when a design is loaded by link", () => {
    const store = createSeededStore();

    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "shared-design",
      canWrite: false,
    });

    expect(store.getState().canWrite).toBe(false);
    expect(store.getState().designId).toBe("shared-design");
  });

  it("comes back true when the loaded design is one this browser may edit", () => {
    const store = createSeededStore();

    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "my-design",
      canWrite: true,
    });

    expect(store.getState().canWrite).toBe(true);
  });

  it("carries 'checking' through when the loader could not know, rather than guessing for it", () => {
    const store = createSeededStore();

    // `/d/{id}` has to say `"checking"`: the write-token cookie is `Path=/api/designs/{id}`, so the
    // request that rendered the page never carried it and no answer was possible. The state is
    // named rather than left to a default, because absence means the opposite thing in
    // `fetch-configuration-repository.ts` — see `WriteAccess`.
    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "link-opened",
      canWrite: "checking",
    });

    // Not collapsed to a boolean on the way in: what an unanswered check means is the panel's rule
    // (see `isReadOnly`), and the store's job is to carry the fact it was handed.
    expect(store.getState().canWrite).toBe("checking");
  });

  it("takes the probe's answer once it arrives", () => {
    const store = createSeededStore();
    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "link-opened",
      canWrite: "checking",
    });

    store
      .getState()
      .applyWriteAccess({ designId: "link-opened", canWrite: false });

    expect(store.getState().canWrite).toBe(false);
  });

  it("ignores a probe answer about a design the store has since left", () => {
    const store = createSeededStore();
    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "second-design",
      canWrite: true,
    });

    // The answer is per-design; applying a stale one would make one design's access decide
    // another's.
    store
      .getState()
      .applyWriteAccess({ designId: "first-design", canWrite: false });

    expect(store.getState().canWrite).toBe(true);
  });

  it("records a probe that could not answer, without guessing in either direction", () => {
    // Finding WEB-002: the probe used to swallow every failure, leaving the optimistic default
    // standing and the panel interactive. Neither guess is available here — "writable" would offer
    // an edit that cannot be stored, and "read-only" would tell an author they may not edit their
    // own kitchen on the strength of a dropped packet.
    const store = createSeededStore();
    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "link-opened",
      canWrite: "checking",
    });

    store.getState().failWriteAccessCheck({ designId: "link-opened" });

    expect(store.getState().canWrite).toBe("check-failed");
    // And the customer is not stranded there: the state the failure lands in is the one state that
    // offers a way out. A load that times out (finding S7-F1) reaches this same branch.
    const panel = panelFrom(store.getState());
    expect(panel.notice?.kind).toBe("access-uncheckable");
    expect(panel.notice?.retryLabel).toBe(ro.panel.accessRetryLabel);
    expect(panel.footer.isRemoveDisabled).toBe(true);
  });

  it("ignores a failed check about a design the store has since left", () => {
    const store = createSeededStore();
    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "second-design",
      canWrite: true,
    });

    store.getState().failWriteAccessCheck({ designId: "first-design" });

    expect(store.getState().canWrite).toBe(true);
  });

  it("never demotes an answer the server actually gave back to 'we do not know'", () => {
    // A second probe run failing after the first succeeded must not take a writable panel away
    // from the browser that owns the design.
    const store = createSeededStore();
    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "link-opened",
      canWrite: "checking",
    });
    store
      .getState()
      .applyWriteAccess({ designId: "link-opened", canWrite: true });

    store.getState().failWriteAccessCheck({ designId: "link-opened" });

    expect(store.getState().canWrite).toBe(true);
  });

  it("asks again when the retry is pressed, and the answer then lands", () => {
    // `"checking"` is what the probe effect watches, so restoring it *is* asking again — and the
    // retry has to be a real route out of `check-failed`, not a notice that never changes.
    const store = createSeededStore();
    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "link-opened",
      canWrite: "checking",
    });
    store.getState().failWriteAccessCheck({ designId: "link-opened" });

    store.getState().retryWriteAccessCheck();
    expect(store.getState().canWrite).toBe("checking");

    store
      .getState()
      .applyWriteAccess({ designId: "link-opened", canWrite: true });
    expect(store.getState().canWrite).toBe(true);

    const panel = panelFrom(store.getState());
    expect(panel.notice).toBeUndefined();
    expect(panel.footer.isRemoveDisabled).toBe(false);
  });

  it("leaves an answered check alone when the retry is pressed anyway", () => {
    // The retry is offered on one notice only, but nothing stops a caller: a stray press must not
    // discard an answer and send the panel back to waiting.
    const store = createSeededStore();
    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "link-opened",
      canWrite: false,
    });

    store.getState().retryWriteAccessCheck();

    expect(store.getState().canWrite).toBe(false);
  });

  it("does not carry a refusal about one design onto the next — the panel would deadlock", () => {
    const store = createSeededStore();
    // Design X: no credential for it, so the save came back 403 and the panel went read-only.
    store.getState().setSaveStatus("unauthorized");

    // Design Y, which this browser *does* own.
    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "owned-design",
      canWrite: true,
    });

    expect(store.getState().canWrite).toBe(true);
    expect(store.getState().saveStatus).toBe("idle");
    // The deadlock this closes: `isReadOnly` reads `unauthorized`, and the only thing that clears
    // `unauthorized` is a successful write — whose every control a read-only panel has disabled.
    const panel = panelFrom(store.getState());
    expect(panel.notice).toBeUndefined();
    expect(panel.footer.isRemoveDisabled).toBe(false);
    for (const section of panel.sections) {
      if (section.kind === "finish" || section.kind === "handle")
        expect(section.chips.every((chip) => chip.isDisabled)).toBe(false);
      if (section.kind === "replace")
        expect(section.rows.every((row) => row.isDisabled)).toBe(false);
    }
  });

  it("does not show the previous design's failure notice on a freshly loaded one", () => {
    const store = createSeededStore();
    store.getState().setSaveStatus("stopped");

    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "another-design",
      canWrite: true,
    });

    expect(store.getState().saveStatus).toBe("idle");
    expect(panelFrom(store.getState()).notice).toBeUndefined();
  });

  it("is not moved by a save status — the store holds facts, the panel holds the rule", () => {
    const store = createSeededStore();

    store.getState().setSaveStatus("unauthorized");

    expect(store.getState().canWrite).toBe(true);
    expect(store.getState().saveStatus).toBe("unauthorized");
  });

  it("honours an explicit read-only option at creation", () => {
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      designId: "loaded-elsewhere",
      canWrite: false,
    });

    expect(store.getState().canWrite).toBe(false);
  });
});

describe("createConfiguratorStore", () => {
  it("derives records and columns from the design at creation, never as authored fields", () => {
    const store = createSeededStore();
    const state = store.getState();

    expect(state.records).toHaveLength(KITCHEN_L_DESIGN.placements.length);
    expect(state.columns.size).toBeGreaterThan(0);
    // The seeded fixture is fully occupied by design (M1 fidelity), so an empty derived void set
    // here is the correct answer, not an untested path — see the void-engine's own row-17/18 tests
    // for cases that do produce voids.
    expect(state.voids).toEqual([]);
  });

  it("exposes no setter for placements, records, columns or voids", () => {
    const store = createSeededStore();
    const state = store.getState() as unknown as Record<string, unknown>;

    expect(state.setPlacements).toBeUndefined();
    expect(state.setRecords).toBeUndefined();
    expect(state.setColumns).toBeUndefined();
    expect(state.setVoids).toBeUndefined();
  });

  it("starts with no selection", () => {
    const store = createSeededStore();
    expect(store.getState().selection).toBeNull();
  });

  it("select() sets the selection by kind and id", () => {
    const store = createSeededStore();
    store.getState().select({ kind: "placement", id: "p0" });
    expect(store.getState().selection).toEqual({ kind: "placement", id: "p0" });
  });

  it("select() replaces a prior selection rather than merging it", () => {
    const store = createSeededStore();
    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().select({ kind: "void", id: "A|2.60:v0:0.00" });
    expect(store.getState().selection).toEqual({
      kind: "void",
      id: "A|2.60:v0:0.00",
    });
  });

  it("deselect() clears the selection", () => {
    const store = createSeededStore();
    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().deselect();
    expect(store.getState().selection).toBeNull();
  });

  it("starts unminted: no designId, idle status, not persisted", () => {
    const store = createSeededStore();
    const state = store.getState();

    expect(state.designId).toBeNull();
    expect(state.saveStatus).toBe("idle");
    expect(state.hasPersistedSuccessfully).toBe(false);
  });

  it("applySavedId records the id and flips hasPersistedSuccessfully to true", () => {
    const store = createSeededStore();

    store.getState().applySavedId("design-1");

    expect(store.getState().designId).toBe("design-1");
    expect(store.getState().hasPersistedSuccessfully).toBe(true);
  });

  it("setSaveStatus updates saveStatus without touching hasPersistedSuccessfully", () => {
    const store = createSeededStore();

    store.getState().setSaveStatus("saving");
    expect(store.getState().saveStatus).toBe("saving");
    expect(store.getState().hasPersistedSuccessfully).toBe(false);

    store.getState().setSaveStatus("error");
    expect(store.getState().saveStatus).toBe("error");
  });

  it("hydrate replaces the design, re-derives geometry, clears selection, and marks it persisted", () => {
    const store = createSeededStore();
    store.getState().select({ kind: "placement", id: "p0" });

    const nextDesign = { ...KITCHEN_L_DESIGN, presetId: "hydrated" };
    store.getState().hydrate({
      design: nextDesign,
      designId: "design-2",
      canWrite: true,
    });

    const state = store.getState();
    expect(state.design).toBe(nextDesign);
    expect(state.designId).toBe("design-2");
    expect(state.hasPersistedSuccessfully).toBe(true);
    expect(state.selection).toBeNull();
    expect(state.records).toHaveLength(nextDesign.placements.length);
  });

  it("two store instances do not share selection state", () => {
    const storeA = createSeededStore();
    const storeB = createSeededStore();
    storeA.getState().select({ kind: "placement", id: "p0" });
    expect(storeB.getState().selection).toBeNull();
  });
});
