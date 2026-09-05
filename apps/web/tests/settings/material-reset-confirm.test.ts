// **Wave 6Q-c: the confirmation that precedes a colour wipe, and the silence when there is nothing
// to wipe** (ADR 0081, ADR 0086).
//
// **The interesting branch is the one nothing else in this suite reaches.** Every shipped fixture
// sits at its material's declared default or wears nothing, so a sheet that confirmed
// *unconditionally* would pass almost the whole `settings/` directory. Both arms are therefore
// counted below with a floor on each, and the presence table of ADR 0086 decision 3 is asserted row
// by row — including the row the id-string comparison got wrong, which is the one where a design
// carrying **no** material at all is handed melamine explicitly, with a chosen colour standing.
//
// **And the words are asserted where the customer meets them.** This project has shipped a ruled
// sentence no test ever saw reach the screen, so each of the four strings is asserted against
// rendered markup rather than against `ro`.
import {
  countCabinetsWearingAChosenFinish,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  paletteFinish,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ro } from "@/content/ro";
import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  type GlobalSettingsView,
  type MaterialResetConfirmView,
  type WholeKitchenChoice,
} from "@/settings/global-settings-model";
import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";
import { buildKitchenLBodyCatalog } from "@lemnaria/configurator-domain";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  FINISHES_RESOLVED_BY_VENEER,
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  MDF_TIER_ID,
  VENEER_TIER_ID,
} from "../support/mdf-kitchen-wearing-chosen-colours";

/** `global-settings-shell.test.ts`'s pattern, for its reason: the component under test runs against
 *  a real store's real fields rather than a hand-written state shape. */
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

const { GlobalSettings, GlobalSettingsSurface } = await import(
  "@/settings/global-settings"
);

const MELAMINE_TIER_ID = "material.melamine";

/** A tier id the schema accepts and this product declares no material for — ADR 0072's reachable
 *  state. Used on both sides, because the table rules both. */
const UNDECLARED_TIER_ID = "material.laminate";

const SURFACE_ID = "settings";

/**
 * **The three numbers ADR 0086 decision 1 pins, restated here because this is where two of them are
 * confusable.** The chosen count and the displayed body count are both counts of cabinets and both
 * derivable inside `describeGlobalSettings`; the third is not reachable in `apps/web` at all. They
 * are pairwise distinct, so a confirmation composed from the nearer number fails rather than agrees.
 */
const CHOSEN_COLOURS_ON_THE_MDF_FIXTURE = 4;
const DISPLAYED_BODY_COUNT = 26;

/** The seeded kitchen with one cabinet moved off PAL's declared default and **no `materialTierId`
 *  at all** — the state a design that has never had a material applied is in, and the one the
 *  presence table's second row is about. */
const NEVER_APPLIED_WITH_A_CHOSEN_COLOUR: Design = {
  ...KITCHEN_L_DESIGN,
  settings: { ...KITCHEN_L_DESIGN.settings, materialTierId: undefined },
  placements: KITCHEN_L_DESIGN.placements.map((placement) =>
    placement.id === "p0"
      ? {
          ...placement,
          body: { ...placement.body, finish: paletteFinish("pal.antracit") },
        }
      : placement,
  ),
};

function viewFor(options: {
  readonly design: Design;
  readonly applied?: WholeKitchenChoice;
  readonly pending?: WholeKitchenChoice;
}): GlobalSettingsView {
  const { design } = options;
  return describeGlobalSettings({
    pricing: priceDesign({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: design.settings,
    }),
    offer: offerWholeKitchenTiers({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: design.settings,
    }),
    groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
    applied: options.applied ?? {},
    pending: options.pending ?? {},
    rejection: null,
    chosenColourCount: countCabinetsWearingAChosenFinish(design),
  });
}

/** The confirmation a view publishes, thrown rather than narrowed at every call site. */
function confirmOf(view: GlobalSettingsView): MaterialResetConfirmView {
  const confirm = view.materialResetConfirm;
  if (!confirm) throw new Error("this view publishes no confirmation");
  return confirm;
}

function choosingMarkupOf(view: GlobalSettingsView): string {
  return renderToStaticMarkup(
    createElement(GlobalSettingsSurface, {
      id: SURFACE_ID,
      view,
      onChoose: () => undefined,
      onChooseDepth: () => undefined,
      onCancel: () => undefined,
      onApply: () => undefined,
    }),
  );
}

function confirmMarkupOf(view: GlobalSettingsView): string {
  return renderToStaticMarkup(
    createElement(GlobalSettingsSurface, {
      id: SURFACE_ID,
      view,
      confirming: {
        view: confirmOf(view),
        onConfirm: () => undefined,
        onStepBack: () => undefined,
      },
      onChoose: () => undefined,
      onChooseDepth: () => undefined,
      onCancel: () => undefined,
      onApply: () => undefined,
    }),
  );
}

/** The confirmation owed for a switch away from the MDF fixture's material, which is the wave's own
 *  worked example: four chosen colours, twenty-six bodies on screen. */
function veneerConfirmView(): GlobalSettingsView {
  return viewFor({
    design: MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
    applied: { materialTierId: MDF_TIER_ID },
    pending: { materialTierId: VENEER_TIER_ID },
  });
}

describe("the presence table, row by row", () => {
  /** Every row of ADR 0086 decision 3, with the count that makes it interesting. Counted rather
   *  than merely swept: a table landing entirely on one arm certifies nothing. */
  const ROWS: readonly {
    readonly what: string;
    readonly view: () => GlobalSettingsView;
    readonly confirms: boolean;
  }[] = [
    {
      what: "no material is being applied at all",
      confirms: false,
      view: () => viewFor({ design: MDF_KITCHEN_WEARING_CHOSEN_COLOURS }),
    },
    {
      what: "a design carrying no material is handed melamine explicitly",
      confirms: false,
      view: () =>
        viewFor({
          design: NEVER_APPLIED_WITH_A_CHOSEN_COLOUR,
          applied: {},
          pending: { materialTierId: MELAMINE_TIER_ID },
        }),
    },
    {
      what: "MDF becomes veneer with four chosen colours standing",
      confirms: true,
      view: veneerConfirmView,
    },
    {
      what: "the material being applied is the one already applied",
      confirms: false,
      view: () =>
        viewFor({
          design: MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
          applied: { materialTierId: MDF_TIER_ID },
          pending: { materialTierId: MDF_TIER_ID },
        }),
    },
    {
      what: "an undeclared material becomes a declared one",
      confirms: true,
      view: () =>
        viewFor({
          design: {
            ...MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
            settings: {
              ...MDF_KITCHEN_WEARING_CHOSEN_COLOURS.settings,
              materialTierId: UNDECLARED_TIER_ID,
            },
          },
          applied: { materialTierId: UNDECLARED_TIER_ID },
          pending: { materialTierId: VENEER_TIER_ID },
        }),
    },
    {
      what: "the pending id is one the domain does not declare",
      confirms: false,
      view: () =>
        viewFor({
          design: MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
          applied: { materialTierId: MDF_TIER_ID },
          pending: { materialTierId: UNDECLARED_TIER_ID },
        }),
    },
    {
      what: "a real material change on a kitchen where nothing was chosen",
      confirms: false,
      view: () =>
        viewFor({
          design: KITCHEN_L_DESIGN,
          applied: { materialTierId: MELAMINE_TIER_ID },
          pending: { materialTierId: VENEER_TIER_ID },
        }),
    },
  ];

  it("puts at least one row on each arm, and answers every row as ruled", () => {
    const answered = ROWS.map((row) => ({
      what: row.what,
      confirms: row.confirms,
      published: row.view().materialResetConfirm !== undefined,
    }));

    for (const row of answered) {
      expect(row.published, row.what).toBe(row.confirms);
    }
    expect(
      answered.filter((row) => row.confirms).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      answered.filter((row) => !row.confirms).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("keeps the second row non-vacuous — a colour really is standing there", () => {
    // Without this the *"no material change"* row would pass on a design that had nothing to lose,
    // which is the whole content of ADR 0086 decision 3 asserted about nothing.
    expect(
      countCabinetsWearingAChosenFinish(NEVER_APPLIED_WITH_A_CHOSEN_COLOUR),
    ).toBeGreaterThan(0);
    expect(NEVER_APPLIED_WITH_A_CHOSEN_COLOUR.settings?.materialTierId).toBe(
      undefined,
    );
  });
});

describe("the numbers the confirmation may state", () => {
  it("keeps the three pairwise distinct, so the nearer one cannot be written by mistake", () => {
    const three = [
      DISPLAYED_BODY_COUNT,
      CHOSEN_COLOURS_ON_THE_MDF_FIXTURE,
      FINISHES_RESOLVED_BY_VENEER,
    ];

    expect(new Set(three).size).toBe(three.length);
    expect(
      countCabinetsWearingAChosenFinish(MDF_KITCHEN_WEARING_CHOSEN_COLOURS),
    ).toBe(CHOSEN_COLOURS_ON_THE_MDF_FIXTURE);
    expect(veneerConfirmView().appliesTo).toContain(
      String(DISPLAYED_BODY_COUNT),
    );
  });

  it("states the chosen count in the confirmation, never the sheet's body count", () => {
    const markup = confirmMarkupOf(veneerConfirmView());

    expect(markup).toContain(String(CHOSEN_COLOURS_ON_THE_MDF_FIXTURE));
    expect(markup).not.toContain(String(DISPLAYED_BODY_COUNT));
  });
});

describe("the four strings, where the customer meets them", () => {
  const RULED = ro.globalSettings.materialResetConfirm;

  it("renders the title, the sentence and both actions", () => {
    const markup = confirmMarkupOf(veneerConfirmView());

    expect(markup).toContain(RULED.title);
    expect(markup).toContain(RULED.body(CHOSEN_COLOURS_ON_THE_MDF_FIXTURE));
    expect(markup).toContain(RULED.confirm);
    expect(markup).toContain(RULED.back);
  });

  it("names an outcome in each action rather than OK and Anulează", () => {
    expect([RULED.confirm, RULED.back]).not.toContain("OK");
    expect([RULED.confirm, RULED.back]).not.toContain(ro.globalSettings.cancel);
  });

  it("carries comma-below diacritics, not the cedillas that render identically", () => {
    // A positive control first, so the two negatives cannot pass by finding nothing to judge:
    // U+0219 (ș) against U+015F (ş), U+021B (ț) against U+0163 (ţ).
    const sentence = RULED.body(CHOSEN_COLOURS_ON_THE_MDF_FIXTURE);

    expect(sentence).toContain("ș");
    expect(sentence).not.toMatch(/[şţ]/);
    expect(RULED.confirm).toContain("ă");
    expect(RULED.confirm).not.toMatch(/[şţ]/);
    expect(RULED.back).not.toMatch(/[şţ]/);
    expect(RULED.title).not.toMatch(/[şţ]/);
  });
});

describe("the confirm step's own shape", () => {
  it("is one dialog, whose heading has become the confirmation's title", () => {
    const markup = confirmMarkupOf(veneerConfirmView());

    expect([...markup.matchAll(/role="dialog"/g)].length).toBe(1);
    expect(markup).toMatch(
      new RegExp(
        `<h2[^>]*id="${SURFACE_ID}-title"[^>]*>${ro.globalSettings.materialResetConfirm.title}</h2>`,
      ),
    );
    expect(markup).toContain(`aria-labelledby="${SURFACE_ID}-title"`);
  });

  it("drops the applies-to line, the figure and the tier list with the step it replaced", () => {
    const view = veneerConfirmView();
    const markup = confirmMarkupOf(view);

    expect(markup).not.toContain('data-testid="global-settings-applies-to"');
    expect(markup).not.toContain('data-testid="global-settings-figure"');
    expect(markup).not.toContain('data-testid="global-settings-group"');
    expect(markup).not.toContain(view.appliesTo);
    expect(markup).not.toContain(view.applyLabel);
  });

  it("offers exactly the two actions the step is about", () => {
    const markup = confirmMarkupOf(veneerConfirmView());

    expect([...markup.matchAll(/<button/g)].length).toBe(2);
    expect(markup).toContain('data-testid="global-settings-confirm"');
    expect(markup).toContain('data-testid="global-settings-confirm-back"');
  });
});

describe("the copy never appears where the consequence is not being asked about", () => {
  const RULED = ro.globalSettings.materialResetConfirm;

  function everyRuledString(chosenCount: number): readonly string[] {
    return [RULED.title, RULED.body(chosenCount), RULED.confirm, RULED.back];
  }

  it("is absent from the choosing step, which still offers the tiers and the apply", () => {
    const view = veneerConfirmView();
    const markup = choosingMarkupOf(view);

    expect(markup).toContain(view.applyLabel);
    for (const ruled of everyRuledString(CHOSEN_COLOURS_ON_THE_MDF_FIXTURE)) {
      expect(markup, ruled).not.toContain(ruled);
    }
  });

  it("is absent from the rendered document once the sheet has closed", () => {
    // Asserted against the screen rather than against a component that renders no toast anywhere:
    // a consequence reported after it has happened is what ADR 0057 decision 3 forbids, and the
    // place to look for it is the document the customer is left with.
    storeState.current = closedScreenStateFor(
      MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
    );
    const markup = renderToStaticMarkup(createElement(GlobalSettings));

    expect(markup).toContain(ro.globalSettings.open);
    for (const ruled of everyRuledString(CHOSEN_COLOURS_ON_THE_MDF_FIXTURE)) {
      expect(markup, ruled).not.toContain(ruled);
    }
  });
});

function closedScreenStateFor(design: Design): ConfiguratorState {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => "2026-09-05T12:00:00.000Z",
  }).getState();
}
