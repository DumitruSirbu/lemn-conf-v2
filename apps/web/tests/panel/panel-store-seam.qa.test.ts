// The seam `usePanelView` sits on: the store's published state must be enough to produce the panel,
// and must be the *only* thing that produces it.
//
// `usePanelView` itself is three memoised calls around `describeSelection`, `offersFor` and
// `describePanel`, reading `records`, `voids`, `columns`, `catalog`, `selection`, `lastRejection`
// and `isBodyProbeAttached`. No renderer is available in this suite (M4 wave 4A's second recorded
// decision: no jsdom/RTL dependency), so the hook's *composition* is asserted here against the same
// store fields, in the same order, driven through the real commands. A panel that disagrees with
// `describePanel` given the same store state can only come from one of these inputs being wrong,
// and each is exercised below.
import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";
import {
  describeSelection,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  offersFor,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import { describePanel, type PanelView } from "@/panel/panel-model";

import { columnExtents } from "../support/column-extents";
import { createFakeBodyProbe } from "../support/fake-body-probe";
import { LEGACY_ENUM_FINISHES } from "@lemnaria/configurator-domain";

/** Exactly what `usePanelView` composes, from exactly the store fields it subscribes to. */
function panelFromStore(state: ConfiguratorState): PanelView {
  const { records, voids, columns, catalog, selection } = state;
  return describePanel({
    meta: selection
      ? describeSelection({ records, voids, catalog, target: selection })
      : undefined,
    offers: selection
      ? offersFor({ records, voids, columns, catalog, target: selection })
      : [],
    rejection: state.lastRejection,
    widthOptions: [],
    isBodyProbeAttached: state.isBodyProbeAttached,
    canWrite: state.canWrite,
    saveStatus: state.saveStatus,
  });
}

interface StoreOverrides {
  readonly withProbe?: boolean;
  readonly design?: Design;
}

function createStore(overrides: StoreOverrides = {}) {
  const { withProbe = true, design = KITCHEN_L_DESIGN } = overrides;
  return createConfiguratorStore({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    ...(withProbe ? { bodyProbe: createFakeBodyProbe() } : {}),
    now: () => "2026-08-26T12:00:00.000Z",
  });
}

function openPanel(state: ConfiguratorState) {
  const panel = panelFromStore(state);
  if (panel.kind !== "open") throw new Error("expected an open panel");
  return panel;
}

describe("the panel over the store's own state", () => {
  it("is closed until something is selected", () => {
    expect(panelFromStore(createStore().getState())).toEqual({
      kind: "closed",
    });
  });

  it("opens on the body the store says is selected, and closes again on deselect", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p0" });
    expect(openPanel(store.getState()).header.detail).toContain("Perete A");
    store.getState().deselect();
    expect(panelFromStore(store.getState()).kind).toBe("closed");
  });

  // ADR 0011 Gap D: the store freezes the column map at load. If a command re-derived it, the
  // vacated space would produce no void and the panel would offer an empty list — the failure mode
  // that reads as "the panel is broken" rather than as "the columns moved".
  it("offers a real list in the slot a removal opened, columns having stayed frozen", () => {
    const store = createStore();
    const extentsBefore = columnExtents(store.getState().columns);
    store.getState().select({ kind: "placement", id: "p1" });
    store.getState().remove();

    const state = store.getState();
    expect(columnExtents(state.columns)).toEqual(extentsBefore);
    expect(state.voids.length).toBeGreaterThan(0);
    expect(state.selection).not.toBeNull();

    const section = openPanel(state).sections.find(
      (candidate) => candidate.kind === "replace",
    );
    if (section?.kind !== "replace") throw new Error("no replace section");
    expect(section.title).toBe("Pune un corp aici");
    expect(section.rows.length).toBeGreaterThan(0);
    expect(section.countLine).toContain(String(section.rows.length));
  });

  // ADR 0024: §9's panel offers no control that can refuse, so the refusal has to be driven
  // through the store directly. `p25` is the corner leg, which declares `canDelete: false` — one of
  // the four corner bodies — `p25`, `p26`, `p9` and `p21`, which are all that carry the flag since ADR 0027
  // folded the hob into its cabinet.
  it("shows the refusal the store recorded, first, and drops it on the next selection", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p25" });
    store.getState().remove();

    const refused = store.getState();
    expect(refused.lastRejection).not.toBeNull();
    const panel = openPanel(refused);
    expect(panel.sections[0]?.kind).toBe("rejection");
    expect(panel.sections[0]).toMatchObject({
      message: refused.lastRejection?.message,
    });

    store.getState().select({ kind: "placement", id: "p0" });
    expect(
      openPanel(store.getState()).sections.map((section) => section.kind),
    ).not.toContain("rejection");
  });

  it("disables every offered row until the scene attaches its probe", () => {
    const store = createStore({ withProbe: false });
    store.getState().select({ kind: "placement", id: "p0" });
    const before = openPanel(store.getState()).sections.find(
      (candidate) => candidate.kind === "replace",
    );
    if (before?.kind !== "replace") throw new Error("no replace section");
    expect(before.rows.length).toBeGreaterThan(0);
    for (const row of before.rows)
      expect([row.isDisabled, row.secondaryLine]).toEqual([
        true,
        ro.panel.probeUnavailable,
      ]);

    store.getState().attachBodyProbe(createFakeBodyProbe());
    const after = openPanel(store.getState()).sections.find(
      (candidate) => candidate.kind === "replace",
    );
    if (after?.kind !== "replace") throw new Error("no replace section");
    // Clickable, and the secondary line is back to the size §9 asks for rather than the reason.
    for (const row of after.rows)
      expect([row.isDisabled, row.secondaryLine.endsWith(" mm")]).toEqual([
        false,
        true,
      ]);

    store.getState().detachBodyProbe();
    const detached = openPanel(store.getState()).sections.find(
      (candidate) => candidate.kind === "replace",
    );
    if (detached?.kind !== "replace") throw new Error("no replace section");
    for (const row of detached.rows)
      expect([row.isDisabled, row.secondaryLine]).toEqual([
        true,
        ro.panel.probeUnavailable,
      ]);
  });

  // Every edit applies to the model immediately (M4's "no deferred commit"), so the panel that
  // follows a `setFinish` marks the new chip without anything being dismissed.
  it("marks a finish and a handle the moment the command applies", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p0" });
    store.getState().setFinish(LEGACY_ENUM_FINISHES.sage);
    store.getState().setHandle("black");

    const sections = openPanel(store.getState()).sections;
    const finish = sections.find((section) => section.kind === "finish");
    const handle = sections.find((section) => section.kind === "handle");
    if (finish?.kind !== "finish" || handle?.kind !== "handle")
      throw new Error("expected both appearance sections");
    expect(
      finish.chips.filter((chip) => chip.isActive).map((chip) => chip.value),
    ).toEqual(["sage"]);
    expect(
      handle.chips.filter((chip) => chip.isActive).map((chip) => chip.value),
    ).toEqual(["black"]);
    expect(handle.note).toBeUndefined();
  });

  // §10's loop: pick a row in a slot and the inserted body becomes the selection, so the panel that
  // comes back is the body's, not the slot's.
  it("follows the insertion into the body it created", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p1" });
    store.getState().remove();
    const slotPanel = openPanel(store.getState());
    const section = slotPanel.sections.find(
      (candidate) => candidate.kind === "replace",
    );
    if (section?.kind !== "replace") throw new Error("no replace section");
    const first = section.rows[0];
    expect(first).toBeDefined();

    store.getState().insert(first?.buildId ?? "");
    const state = store.getState();
    expect(state.lastRejection).toBeNull();
    expect(state.selection?.kind).toBe("placement");
    const panel = openPanel(state);
    expect(panel.header.label).toBe(first?.label);
    expect(panel.sections.map((s) => s.kind)).not.toContain("rejection");
  });

  // "Never offer what cannot be satisfied": every row the panel renders must be insertable without
  // a refusal. A row that refuses is a defect in the list, not a feature.
  it("accepts every row it offers in an opened slot, one row at a time", () => {
    const store = createStore();
    store.getState().select({ kind: "placement", id: "p1" });
    store.getState().remove();
    const slot = store.getState().selection;
    const section = openPanel(store.getState()).sections.find(
      (candidate) => candidate.kind === "replace",
    );
    if (section?.kind !== "replace" || !slot)
      throw new Error("no slot to insert into");
    expect(section.rows.length).toBeGreaterThan(0);

    let swept = 0;
    for (const row of section.rows) {
      const attempt = createStore();
      attempt.getState().select({ kind: "placement", id: "p1" });
      attempt.getState().remove();
      attempt.getState().insert(row.buildId);
      expect([row.buildId, attempt.getState().lastRejection]).toEqual([
        row.buildId,
        null,
      ]);
      swept += 1;
    }
    expect(swept).toBeGreaterThan(0);
  });
});
