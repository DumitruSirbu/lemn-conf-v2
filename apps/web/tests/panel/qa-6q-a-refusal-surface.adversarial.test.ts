// **Adversarial QA for wave 6Q-a's named, accepted interim — and, since wave 6R, for its closure.**
//
// The interim was five legacy chips offered on every kitchen, ten of whose fifteen (material, chip)
// pairs the command refused. ADR 0078 decision 6 defended it on one claim: tapping *Lut* on a PAL
// kitchen *"replaces silently storing an invalid finish with a sentence"*, and this file asserted
// the sentence reached the markup. 6R made the panel's offer the material's own, so **there is no
// refusable tap left** and the sentence has nothing to explain.
//
// The file's second half was the fact the shipped partition could not state: the split was a
// property of the material and not of the chips. That claim survives inverted, and it is the one
// this wave is held to — **every chip the panel offers applies, on every material, and the control's
// shape is the material's declared one rather than whatever its option count happens to suggest.**
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  describeSelection,
  KITCHEN_L_DESIGN,
  materialById,
  materialOfDesign,
  materialOffersFinish,
  MATERIALS,
  offersFor,
  paletteEntriesOf,
  type Design,
  type MaterialId,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { describePanel, type PanelView } from "@/panel/panel-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { ro } from "../support/romanian-content";
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

/** The five §5.5 shipped with, written out for this file's own reason: the claims below are about
 *  what the panel stopped offering, and reading the list from the component would let a widened
 *  panel silently widen the claim. */
const SHIPPED_SWATCH_KEYS = [
  "white",
  "clay",
  "sage",
  "graphite",
  "oak",
] as const;

/** **The shape each material's control must have** (ADR 0071 decision 3), written from the products
 *  and not from `colourControl.shape`. A table that read the declaration would agree with any
 *  declaration, which is the circularity that would let a picker appear on a PAL kitchen. */
const CONTROL_BY_MATERIAL: Readonly<Record<MaterialId, string>> = {
  "material.melamine": "decor-list",
  "material.painted-mdf": "ral-picker",
  "material.veneer": "wood-swatches",
};

const SELECTED = { kind: "placement", id: "p0" } as const;
const NOW = "2026-08-26T12:00:00.000Z";

interface TapOutcome {
  readonly pressed: readonly string[];
  readonly rejectionCode: string | null;
  readonly finishAfter: unknown;
}

function withMaterial(materialTierId: string): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId },
  };
}

function panelFor(
  store: ReturnType<typeof createConfiguratorStore>,
  rejection: PanelViewInput["rejection"],
): PanelView {
  const state = store.getState();
  return describePanel({
    content: ro,
    // Read off the held design, exactly as `usePanelView` reads it: a fixture that pinned PAL here
    // would render a decor list over an MDF kitchen and prove nothing about the wave.
    material: materialOfDesign(state.design),
    meta: describeSelection({
      records: state.records,
      voids: state.voids,
      catalog: state.catalog,
      target: SELECTED,
    }),
    offers: offersFor({
      records: state.records,
      voids: state.voids,
      columns: state.columns,
      catalog: state.catalog,
      cabinetDepthMm: cabinetDepthMmOf(state.design),
      target: SELECTED,
    }),
    rejection,
    widthOptions: [],
    buildableWidthSpanMm: undefined,
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
}

type PanelViewInput = Parameters<typeof describePanel>[0];

function storeOn(design: Design): ReturnType<typeof createConfiguratorStore> {
  const store = createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => NOW,
  });
  store.getState().select(SELECTED);
  return store;
}

/** Taps one of the panel's own swatches and reports everything the customer could observe: which
 *  swatch lights, whether anything was refused, and what the store recorded. */
function tapSwatch(design: Design, entryId: string): TapOutcome {
  const store = storeOn(design);
  const chip = swatchSectionOf(panelFor(store, null)).chips.find(
    (one) => one.value === entryId,
  );
  if (!chip) throw new Error(`no chip keyed ${entryId}`);

  store.getState().setFinish(chip.finish);
  const rejection = store.getState().lastRejection;

  return {
    pressed: swatchSectionOf(panelFor(store, rejection))
      .chips.filter((one) => one.isActive)
      .map((one) => one.value),
    rejectionCode: rejection?.code ?? null,
    finishAfter: store
      .getState()
      .design.placements.find((one) => one.id === SELECTED.id)?.body.finish,
  };
}

describe("the control's shape is the material's, not its option count's", () => {
  it("names every declared material exactly once, and three distinct shapes", () => {
    // The anti-vacuity guard for the table above. Three shapes, not two with one repeated: a wave
    // that collapsed the wood swatches into the decor list would satisfy every per-material
    // assertion below and fail here.
    expect(Object.keys(CONTROL_BY_MATERIAL)).toEqual(
      MATERIALS.map((material) => material.materialId),
    );
    expect(new Set(Object.values(CONTROL_BY_MATERIAL)).size).toBe(3);
  });

  it.each(Object.entries(CONTROL_BY_MATERIAL))(
    "gives a %s kitchen the %s control",
    (materialTierId, shape) => {
      const markup = renderToStaticMarkup(
        createElement(EditorPanel, {
          view: panelFor(storeOn(withMaterial(materialTierId)), null),
        }),
      );

      expect(markup).toContain(`data-finish-control="${shape}"`);
    },
  );

  it("gives PAL a list and veneer swatches, though PAL could hold two entries one day", () => {
    // ADR 0071 decision 3's own reason, asserted rather than restated: the two list-shaped controls
    // are told apart by the declaration and never by `chips.length`. If they were told apart by
    // count, these two sections would be the same control the day PAL shrank to two decors.
    const pal = swatchSectionOf(
      panelFor(storeOn(withMaterial("material.melamine")), null),
    );
    const veneer = swatchSectionOf(
      panelFor(storeOn(withMaterial("material.veneer")), null),
    );

    expect(pal.control).toBe("decor-list");
    expect(veneer.control).toBe("wood-swatches");
    expect(pal.control).not.toBe(veneer.control);
  });

  it("puts the RAL picker on MDF and nowhere else", () => {
    // §13.1's "disable, don't warn" taken one step further, as the wave requires: on PAL and veneer
    // the picker is not present and disabled, it is a different control entirely.
    for (const materialTierId of ["material.melamine", "material.veneer"]) {
      const markup = renderToStaticMarkup(
        createElement(EditorPanel, {
          view: panelFor(storeOn(withMaterial(materialTierId)), null),
        }),
      );

      expect(markup).not.toContain('data-testid="finish-colour-picker"');
    }

    const picker = pickerSectionOf(
      panelFor(storeOn(withMaterial("material.painted-mdf")), null),
    );
    expect(picker.value).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("nothing the panel offers can be refused, on any material", () => {
  const LIST_MATERIALS = [
    "material.melamine",
    "material.veneer",
  ] as const satisfies readonly MaterialId[];

  it.each(LIST_MATERIALS)(
    "applies every chip a %s kitchen offers, and refuses none",
    (materialTierId) => {
      const design = withMaterial(materialTierId);
      const entries = paletteEntriesOf(materialById(materialTierId));
      expect(entries.length).toBeGreaterThan(0);

      for (const entry of entries) {
        const outcome = tapSwatch(design, entry.entryId);

        expect(outcome.rejectionCode).toBeNull();
        expect(outcome.pressed).toEqual([entry.entryId]);
        expect(outcome.finishAfter).toEqual({
          kind: "palette-entry",
          entryId: entry.entryId,
        });
      }
    },
  );

  it.each(LIST_MATERIALS)(
    "offers on a %s kitchen exactly what the material offers, and nothing beside it",
    (materialTierId) => {
      const material = materialById(materialTierId);
      const chips = swatchSectionOf(
        panelFor(storeOn(withMaterial(materialTierId)), null),
      ).chips;

      // Both directions: nothing offered the command would refuse, and nothing the material offers
      // left off the control. The first half is what closes the interim; the second is what stops
      // it being closed by offering nothing.
      for (const chip of chips) {
        expect(materialOffersFinish(material, chip.finish)).toBe(true);
      }
      expect(chips.map((chip) => chip.value)).toEqual(
        paletteEntriesOf(material).map((entry) => entry.entryId),
      );
    },
  );

  it("offers none of the five shipped names as a chip on any material", () => {
    // The interim in one line: those five strings were the panel's keys, and ten of the fifteen
    // taps they made reachable were refusals. None of them is addressable now.
    for (const material of MATERIALS) {
      const markup = renderToStaticMarkup(
        createElement(EditorPanel, {
          view: panelFor(storeOn(withMaterial(material.materialId)), null),
        }),
      );

      for (const key of SHIPPED_SWATCH_KEYS) {
        expect(markup).not.toContain(`data-testid="finish-${key}"`);
      }
    }
  });
});
