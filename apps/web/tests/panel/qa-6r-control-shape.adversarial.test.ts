// **Adversarial QA for wave 6R's first acceptance criterion**, which the shipped suite states in
// three comments and asserts in none of them.
//
// > *The control's shape is chosen from the declared material, never from the option count. A list
// > that happens to hold two entries is not thereby the veneer control, and a PAL list that grows to
// > seven decors does not become a picker.*
//
// `panel-model.ts` branches on `colourControl.shape`, and `qa-6q-a-refusal-surface.adversarial.test.ts`
// says so in a comment — *"if they were told apart by count, these two sections would be the same
// control the day PAL shrank to two decors"* — and then asserts only that PAL renders `decor-list`
// and veneer renders `wood-swatches` **on today's declarations**, where the count and the shape
// agree. Measured 2026-09-06: rewriting `describeFinishSection` to branch on
// `paletteEntriesOf(material).length` (0 → picker, ≤ 2 → swatches, else list) leaves all 1 613 web
// tests green. That mutant is the criterion's whole content, and nothing caught it.
//
// So this file makes the two disagree. Every fixture below is a material whose declared shape
// contradicts its own entry count, which is the only arrangement under which the branch is
// observable — and which is exactly the product state ADR 0071 decision 3 exists to survive: PAL
// losing a decor, veneer gaining a third wood.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  describeSelection,
  KITCHEN_L_DESIGN,
  materialById,
  offersFor,
  paletteEntriesOf,
  paletteFinish,
  PALETTE_ENTRIES,
  type ColourControl,
  type Material,
  type MaterialLookup,
  type PaletteEntry,
  type CommandTarget,
} from "@lemnaria/configurator-domain";
import { swatchOf } from "@lemnaria/three-adapter";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { ro } from "../support/romanian-content";

import { describePanel, type PanelView } from "@/panel/panel-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  MDF_KITCHEN,
  PAL_KITCHEN,
  UNDECLARED_KITCHEN,
  VENEER_KITCHEN,
} from "../support/panel-material";
import { pickerSectionOf, swatchSectionOf } from "../support/panel-sections";

vi.mock("@/price/use-priced-design", () => ({
  usePricedDesign: () => undefined,
}));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector({ lastRejection: null, deselect: () => undefined }),
  };
});

const { EditorPanel } = await import("@/panel/editor-panel");

/** A finishable base cabinet in the seeded design. */
const FINISHABLE: CommandTarget = { kind: "placement", id: "p0" };

/** `hood-600`, whose §7 row declares `canFinish: false` — a canopy and a chimney, with no front for
 *  a decor to reach. */
const UNFINISHABLE_HOOD: CommandTarget = { kind: "placement", id: "p13" };

/** `fridge-free-700`, the second `canFinish: false` body, so the criterion below is not asserted
 *  against one row of the catalogue. */
const UNFINISHABLE_FRIDGE: CommandTarget = { kind: "placement", id: "p7" };

const NOW = "2026-09-06T12:00:00.000Z";

/** **The five tints ADR 0091 decision 2 lands by name**, pinned by literal because they are ruled
 *  values rather than measured ones: *"the five tints land as drafted, and no colour in this product
 *  is ever chosen for a counter's benefit."* The 6M guard pins them only through its composite
 *  margins, which is a function of the hex and not the hex — a wave that re-tuned a wood to keep a
 *  margin would be caught there and would leave no record of what the ruled value had been. */
const RULED_TINTS: Readonly<Record<string, string>> = {
  "pal.stejar-bardolino": "#d8b483",
  "pal.stejar-halifax": "#b09272",
  "pal.nuc-warmia": "#8a5c3b",
  "veneer.stejar": "#cba173",
  "veneer.nuc": "#6f4630",
};

function declaredMaterialWith(control: ColourControl): MaterialLookup {
  return {
    kind: "declared",
    material: { ...materialById("material.melamine"), colourControl: control },
  } satisfies { kind: "declared"; material: Material };
}

function entriesOf(materialId: string): readonly PaletteEntry[] {
  return paletteEntriesOf(materialById(materialId));
}

function panelFor(material: MaterialLookup, target: CommandTarget): PanelView {
  const store = createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => NOW,
  });
  store.getState().select(target);
  const state = store.getState();
  return describePanel({
    content: ro,
    material,
    meta: describeSelection({
      records: state.records,
      voids: state.voids,
      catalog: state.catalog,
      target,
    }),
    offers: offersFor({
      records: state.records,
      voids: state.voids,
      columns: state.columns,
      catalog: state.catalog,
      cabinetDepthMm: cabinetDepthMmOf(state.design),
      target,
    }),
    rejection: null,
    widthOptions: [],
    buildableWidthSpanMm: undefined,
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
}

function markupFor(material: MaterialLookup, target: CommandTarget): string {
  return renderToStaticMarkup(
    createElement(EditorPanel, { view: panelFor(material, target) }),
  );
}

/** One swatch button as a string, addressed by the test id a browser test uses. */
function swatchButtonFor(markup: string, entryId: string): string {
  const button = new RegExp(
    `<button[^>]*data-testid="finish-${entryId.replace(".", "\\.")}"[^>]*>.*?</button>`,
    "s",
  ).exec(markup);
  if (!button)
    throw new Error(`no swatch button with test id finish-${entryId}`);
  return button[0];
}

describe("the control's shape survives an option count that contradicts it", () => {
  it("keeps a two-entry decor list a decor list, and not the wood swatches", () => {
    // PAL shrunk to two decors. ADR 0071 decision 3's own sentence — *"two swatches and a list of
    // two are the same array and different products"* — with the array made two.
    const control: ColourControl = {
      shape: "decor-list",
      entries: entriesOf("material.veneer"),
    };
    expect(control.entries).toHaveLength(2);

    const section = swatchSectionOf(
      panelFor(declaredMaterialWith(control), FINISHABLE),
    );

    expect(section.control).toBe("decor-list");
    expect(section.chips).toHaveLength(2);
  });

  it("keeps a six-entry wood swatch control the wood swatches, and not a decor list", () => {
    // Veneer grown past the count that distinguishes it today. The count-branching mutant answers
    // `decor-list` here; the declaration answers `wood-swatches`.
    const control: ColourControl = {
      shape: "wood-swatches",
      entries: entriesOf("material.melamine"),
    };
    expect(control.entries.length).toBeGreaterThan(2);

    const section = swatchSectionOf(
      panelFor(declaredMaterialWith(control), FINISHABLE),
    );

    expect(section.control).toBe("wood-swatches");
    expect(section.chips).toHaveLength(control.entries.length);
  });

  it("never turns an empty decor list into the RAL picker", () => {
    // The other half of the mutant: `paletteEntriesOf(material).length === 0` is true of a picker
    // **and** of a list a wave has emptied. A material whose decors have all been retired offers
    // nothing; it does not thereby offer every colour a customer can name.
    const material = declaredMaterialWith({ shape: "decor-list", entries: [] });

    const section = swatchSectionOf(panelFor(material, FINISHABLE));

    expect(section.control).toBe("decor-list");
    expect(section.chips).toEqual([]);
    expect(markupFor(material, FINISHABLE)).not.toContain(
      'data-testid="finish-colour-picker"',
    );
  });

  it("renders the declared shape in the markup, not only in the projection", () => {
    // The shape a browser test reads. Asserted on the contradicting fixtures too, because the
    // component publishes `section.control` and a component that re-derived it from `chips.length`
    // would be the same defect one layer out.
    const twoEntryList = declaredMaterialWith({
      shape: "decor-list",
      entries: entriesOf("material.veneer"),
    });
    const sixEntrySwatches = declaredMaterialWith({
      shape: "wood-swatches",
      entries: entriesOf("material.melamine"),
    });

    expect(markupFor(twoEntryList, FINISHABLE)).toContain(
      'data-finish-control="decor-list"',
    );
    expect(markupFor(sixEntrySwatches, FINISHABLE)).toContain(
      'data-finish-control="wood-swatches"',
    );
  });
});

describe("the swatch and the 3D paint from one declared hex", () => {
  // `finish-swatch-colors.test.ts` asserts the *source* publishes `chip.swatchColor` and that no hex
  // is inlined in the stylesheet; `qa-6p-finish-dom.adversarial.test.ts` asserts each swatch carries
  // *a* six-digit hex. Neither asserts the hex on a given swatch is that decor's own, so a component
  // publishing `chips[0].swatchColor` for every chip would satisfy both.
  it.each(PALETTE_ENTRIES.map((entry) => [entry.entryId] as const))(
    "publishes %s's own colour on its own swatch",
    (entryId) => {
      const isVeneer = entryId.startsWith("veneer.");
      const markup = markupFor(
        isVeneer ? VENEER_KITCHEN : PAL_KITCHEN,
        FINISHABLE,
      );
      const declared = swatchOf(paletteFinish(entryId)).color;

      expect(swatchButtonFor(markup, entryId)).toMatch(
        new RegExp(`--swatch-colour:\\s*${declared}`),
      );
    },
  );

  it.each(Object.entries(RULED_TINTS))(
    "still publishes ADR 0091's ruled tint for %s",
    (entryId, hex) => {
      expect(swatchOf(paletteFinish(entryId as never)).color).toBe(hex);
      expect(swatchOf(paletteFinish(entryId as never)).isWood).toBe(true);
    },
  );

  it("pins every ruled tint, so the table above cannot go quiet by losing a row", () => {
    // The anti-vacuity guard for the `it.each` above: five woods declared, five pinned.
    const woods = PALETTE_ENTRIES.filter(
      (entry) => swatchOf(paletteFinish(entry.entryId)).isWood,
    ).map((entry) => entry.entryId);

    expect(woods.sort()).toEqual(Object.keys(RULED_TINTS).sort());
  });
});

describe("nothing offers a finish on a body that cannot wear one", () => {
  // §9's "never offer what cannot be satisfied", asserted across the material axis as well as the
  // body axis: the finish section is gated on `meta.canFinish` before the shape is chosen, so a
  // control that appeared for one material and not another would be a state the gate had missed.
  it.each([
    ["the hood", UNFINISHABLE_HOOD],
    ["the free-standing fridge", UNFINISHABLE_FRIDGE],
  ] as const)("offers no control at all on %s", (_name, target) => {
    for (const material of [PAL_KITCHEN, MDF_KITCHEN, VENEER_KITCHEN]) {
      const view = panelFor(material, target);
      if (view.kind !== "open") throw new Error("expected an open panel");

      expect(view.sections.map((section) => section.kind)).not.toContain(
        "finish",
      );
      expect(markupFor(material, target)).not.toContain("data-finish-control");
      expect(markupFor(material, target)).not.toContain(
        'data-testid="finish-colour-picker"',
      );
    }
  });

  it("is not vacuous: the same materials do offer a control on a finishable body", () => {
    for (const material of [PAL_KITCHEN, MDF_KITCHEN, VENEER_KITCHEN]) {
      expect(markupFor(material, FINISHABLE)).toContain("data-finish-control");
    }
  });
});

describe("a material this product no longer declares has no control shape", () => {
  // `describeFinishSection`'s first line — `if (lookup.kind === "undeclared") return undefined` —
  // is ADR 0078 decision 3's rule and was new in this wave. `UNDECLARED_KITCHEN` was written for
  // it and, until this block, had exactly one occurrence in the repository: its own declaration.
  //
  // There is no shape to render for a tier nobody declares: it makes no offer, so a control would
  // be one built from a default the product never chose — which is the *Finisaj* defect the finish
  // table's totality exists to make impossible, arriving through the material axis instead.
  it("renders no finish section and no control markup", () => {
    const view = panelFor(UNDECLARED_KITCHEN, FINISHABLE);
    if (view.kind !== "open") throw new Error("expected an open panel");
    const markup = markupFor(UNDECLARED_KITCHEN, FINISHABLE);

    expect(view.sections.map((section) => section.kind)).not.toContain(
      "finish",
    );
    expect(markup).not.toContain("data-finish-control");
    expect(markup).not.toContain('data-testid="finish-colour-picker"');
  });

  it("leaves the rest of the panel working, which is what 6G's recovery path stands on", () => {
    // Withholding the whole panel would make an unknown `materialTierId` unrecoverable: the
    // customer could not reach the setting that would put them back on a declared material.
    const view = panelFor(UNDECLARED_KITCHEN, FINISHABLE);
    if (view.kind !== "open") throw new Error("expected an open panel");

    expect(view.sections.map((section) => section.kind)).toContain("replace");
    expect(view.sections.map((section) => section.kind)).toContain("handle");
  });
});

describe("a veneer kitchen has a reachable colour, and both woods are reachable", () => {
  // ADR 0078 decision 6's correction, recorded as the state 6R closes: before this wave every one
  // of the panel's five legacy chips refused on `material.veneer`, and 6Q-b's default-finish reset
  // left `veneer.nuc` unreachable through any surface. Asserted by name, because "the veneer control
  // renders" would have been true of the inert one too.
  it("addresses Stejar and Nuc as swatches of their own", () => {
    const chips = swatchSectionOf(panelFor(VENEER_KITCHEN, FINISHABLE)).chips;

    expect(chips.map((chip) => chip.value)).toEqual([
      "veneer.stejar",
      "veneer.nuc",
    ]);
    for (const chip of chips) {
      expect(chip.isDisabled).toBe(false);
      expect(chip.finish).toEqual({
        kind: "palette-entry",
        entryId: chip.value,
      });
    }
  });

  it("puts no RAL picker beside them, disabled or otherwise", () => {
    expect(() => pickerSectionOf(panelFor(VENEER_KITCHEN, FINISHABLE))).toThrow(
      /not on MDF/,
    );
  });
});
