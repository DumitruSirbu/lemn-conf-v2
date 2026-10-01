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
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  buildableWidthSpanMm,
  columnWidthChoices,
  cornerDirectionOf,
  describeSelection,
  KITCHEN_L_DESIGN,
  offersFor,
  widthOptionsFor,
  widthStepsFor,
  type Design,
  type WidthOption,
  type WidthSteps,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { ro } from "../support/romanian-content";
import { describePanel, type PanelView } from "@/panel/panel-model";

import { columnExtents } from "../support/column-extents";
import { createFakeProbeFactory } from "../support/fake-body-probe";
import { paletteFinish } from "@lemnaria/configurator-domain";
import { PAL_KITCHEN } from "../support/panel-material";
import { swatchSectionOf } from "../support/panel-sections";

/** `useSelectionWidthAnswers`'s own composition (`use-panel-view.ts`): both width answers run the
 *  real resize command once per candidate, off `state.recordedColumns` and a borrowed probe — empty
 *  and `undefined` without one, which is the honest answer rather than a degraded one. */
function widthAnswersFromStore(state: ConfiguratorState): {
  options: WidthOption[];
  steps: WidthSteps | undefined;
} {
  const {
    design,
    recordedColumns: columns,
    catalog,
    selection,
    probeAt,
  } = state;
  if (!selection || !probeAt) return { options: [], steps: undefined };
  return probeAt(cabinetDepthMmOf(design)).use((probe) => ({
    options: widthOptionsFor({
      design,
      columns,
      catalog,
      target: selection,
      probe,
    }),
    steps: widthStepsFor({
      design,
      columns,
      catalog,
      target: selection,
      probe,
    }),
  }));
}

/** Exactly what `usePanelView` composes, from exactly the store fields it subscribes to. */
function panelFromStore(state: ConfiguratorState): PanelView {
  const { records, voids, columns, catalog, selection } = state;
  const widthAnswers = widthAnswersFromStore(state);
  return describePanel({
    content: ro,
    // ADR 0129 D8, QA 7I coverage gap: `usePanelView` selects this straight off the store
    // (`cornerDirectionOf(state.design.room)`). Review L1.5: this mirror computes it the same way,
    // so no test in this file — including "reads the reflected width note on a right-hand room"
    // below — can catch the real `use-panel-view.ts` hook dropping this wiring; only a suite that
    // renders (or drives) the real hook can. The real guard is the e2e at
    // `tests/e2e/support/qa-7i-captures.ts:196`, which asserts the reflected note against the
    // actually-rendered app. What this file's own test *does* still buy: proof that `describePanel`
    // renders the right note once handed a right-hand direction, which is the half of the wiring a
    // pure-function suite can reach.
    direction: cornerDirectionOf(state.design.room),
    material: PAL_KITCHEN,
    meta: selection
      ? describeSelection({ records, voids, catalog, target: selection })
      : undefined,
    offers: selection
      ? offersFor({
          records,
          voids,
          columns,
          catalog,
          target: selection,
          cabinetDepthMm: cabinetDepthMmOf(state.design),
        })
      : [],
    // The **catalogue's** span, exactly as `usePanelView` derives it — the field this mirror was
    // missing while `DescribePanelInput` still made it optional, which is how a hook that stopped
    // passing it stayed green here.
    buildableWidthSpanMm: buildableWidthSpanMm(catalog),
    rejection: state.lastRejection,
    widthOptions: widthAnswers.options,
    widthSteps: widthAnswers.steps,
    widthRanges: selection
      ? (columnWidthChoices({
          design: state.design,
          catalog,
          target: selection,
        })?.widthRangesMm ?? [])
      : [],
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
    catalogAt: buildKitchenLBodyCatalog,
    ...(withProbe ? { probeAt: createFakeProbeFactory() } : {}),
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
    expect(section.title).toBe(ro.panel.replaceTitleEmpty);
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
      message:
        refused.lastRejection === null
          ? undefined
          : ro.rejection(refused.lastRejection),
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

    store.getState().attachBodyProbe(createFakeProbeFactory());
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
    // *Antracit* rather than *Salvie* since wave 6Q-a: the fixture carries no settings, so it is a
    // PAL kitchen and PAL offers no free colour (ADR 0078 decision 1). Named by its own entry id
    // since wave 6R, which is what the chip is keyed by. What is under test is that the panel marks
    // a chip the moment the command applies, which needs a command that applies.
    store.getState().setFinish(paletteFinish("pal.antracit"));
    store.getState().setHandle("black");

    const sections = openPanel(store.getState()).sections;
    const finish = swatchSectionOf(sections);
    const handle = sections.find((section) => section.kind === "handle");
    if (handle?.kind !== "handle")
      throw new Error("expected the handle section");
    expect(
      finish.chips.filter((chip) => chip.isActive).map((chip) => chip.value),
    ).toEqual(["pal.antracit"]);
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

  // ADR 0032 keeps refused catalogue entries visible and disabled with the command's exact reason.
  // Exercise the real command for every rendered row so enabled/disabled cannot drift from it.
  // **Every row the panel draws is one the command takes**, and since the owner's ruling of
  // 2026-09-10 that is the whole of the correspondence: a row the engine would refuse is not drawn,
  // so there is no disabled arm here to check and no refusal sentence under a row. The counterpart —
  // that an entry the list left out really is refused — is asserted in the domain, against
  // `offersFor` itself (`affordance-gates.adversarial.test.ts`).
  it("draws only rows the insert command accepts, each enabled", () => {
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

    for (const row of section.rows) {
      const attempt = createStore();
      attempt.getState().select({ kind: "placement", id: "p1" });
      attempt.getState().remove();
      attempt.getState().insert(row.buildId);

      expect(attempt.getState().lastRejection, row.buildId).toBeNull();
      expect(row.isDisabled, row.buildId).toBe(false);
    }
  });

  // ADR 0129 D8, QA 7I coverage gap. `usePanelView` reads `cornerDirectionOf(state.design.room)`
  // straight off the store and passes it to `describePanel` — nothing else in this file exercises
  // a room whose `cornerDirection` is `"right"`. Review L1.5: because `panelFromStore` (above) is a
  // seam mirror that re-derives `direction` itself rather than calling the real hook, this proves
  // `describePanel` renders the reflected note given a right-hand direction, not that the real
  // hook still passes one — that half is guarded by the e2e at
  // `tests/e2e/support/qa-7i-captures.ts:196`.
  it("reads the reflected width note on a right-hand room", () => {
    const rightHandDesign: Design = {
      ...KITCHEN_L_DESIGN,
      room: { ...KITCHEN_L_DESIGN.room, cornerDirection: "right" },
    };
    const store = createStore({ design: rightHandDesign });
    store.getState().select({ kind: "placement", id: "p0" });

    const section = openPanel(store.getState()).sections.find(
      (candidate) => candidate.kind === "width",
    );
    if (section?.kind !== "width") throw new Error("no width section");
    expect(section.note).toBe(ro.panel.widthStepNoteRight);
    expect(section.note).not.toBe(ro.panel.widthStepNote);
  });
});
