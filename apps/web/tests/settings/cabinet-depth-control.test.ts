// Wave 6K-b slice 3: the cabinet-depth control on the whole-kitchen sheet.
//
// **The shape is read from the declared map, never hard-coded to two values** (ADR 0056). Every
// assertion below that could have been written against `[600, 700]` is written against
// `declaredCabinetDepthsMm()` instead, so a third declared depth tomorrow is one data row rather
// than a UI rewrite — and so this file cannot pass by agreeing with a literal it also supplies.
import { SAMPLE_DEEP_CABINET_PERCENT } from "../support/sample-deep-cabinet-percent";
import {
  buildKitchenLBodyCatalog,
  countCabinetsWearingAChosenFinish,
  declaredCabinetDepthsMm,
  DEEP_CABINET_DEPTH_MM,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  MIN_CABINET_DEPTH_MM,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DisplayGroup,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { ro } from "../support/romanian-content";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import { createConfiguratorStore } from "@/store/configurator-store";
import {
  describeGlobalSettings,
  type DescribeGlobalSettingsInput,
  type GlobalSettingsView,
} from "@/settings/global-settings-model";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";

/** The depth a legacy document with none is built at, as a number. The one literal depth in this file: the default is
 *  one value, and reading it from the domain's constant would compare the fallback with itself. */
const DEPTH_A_DESIGN_NAMING_NONE_IS_BUILT_AT_MM = 600;

function pricingOf(design: Design): PricingResult {
  return priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function offerOf(design: Design): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

const SHIPPED_GROUPS: readonly DisplayGroup[] = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

function settingsView(
  overrides: Partial<DescribeGlobalSettingsInput> = {},
): GlobalSettingsView {
  return describeGlobalSettings({
    deepCabinetPercent: SAMPLE_DEEP_CABINET_PERCENT,
    content: ro,
    pricing: pricingOf(KITCHEN_L_DESIGN),
    offer: offerOf(KITCHEN_L_DESIGN),
    groups: SHIPPED_GROUPS,
    applied: {},
    pending: {},
    chosenColourCount: countCabinetsWearingAChosenFinish(KITCHEN_L_DESIGN),
    ...overrides,
  });
}

describe("the depth group on the whole-kitchen sheet", () => {
  it("offers exactly the depths the map declares, in the map's own order", () => {
    const depths = settingsView().depthGroup.options.map(
      (option) => option.cabinetDepthMm,
    );

    expect(depths).toEqual([...declaredCabinetDepthsMm()]);
  });

  // ADR 0059's floor, **read rather than restated**: the control offers the declared map, and the
  // map is what is held to the floor. A depth declared below it would fail here rather than be
  // silently filtered out of a list the domain would then refuse — "never offer what cannot be
  // satisfied" (§9), asserted at the source of the offer.
  it("offers nothing below the declared floor", () => {
    for (const option of settingsView().depthGroup.options) {
      expect(option.cabinetDepthMm).toBeGreaterThanOrEqual(
        MIN_CABINET_DEPTH_MM,
      );
    }
  });

  it("marks the pending depth, not the applied one", () => {
    const other = declaredCabinetDepthsMm().find(
      (mm) => mm !== KITCHEN_L_DESIGN.settings?.cabinetDepthMm,
    );
    if (other === undefined) throw new Error("only one depth is declared");

    const view = settingsView({
      applied: { cabinetDepthMm: KITCHEN_L_DESIGN.settings?.cabinetDepthMm },
      pending: { cabinetDepthMm: other },
    });

    const selected = view.depthGroup.options.filter(
      (option) => option.isSelected,
    );
    expect(selected.map((option) => option.cabinetDepthMm)).toEqual([other]);
  });

  it("falls back to the default depth when the design carries none", () => {
    const view = settingsView({ applied: {}, pending: {} });

    const selected = view.depthGroup.options.filter(
      (option) => option.isSelected,
    );
    // Which depth, and not only that there is one: any single checked option satisfies a count.
    expect(selected.map((option) => option.cabinetDepthMm)).toEqual([
      DEPTH_A_DESIGN_NAMING_NONE_IS_BUILT_AT_MM,
    ]);
  });

  // The criterion: the absence of a price line is explained, so it does not read as a missing one.
  it("says in one sentence what the deep depth adds, naming the published percentage", () => {
    expect(settingsView().depthGroup.note).toBe(
      ro.globalSettings.depthNotePriced(
        DEEP_CABINET_DEPTH_MM,
        SAMPLE_DEEP_CABINET_PERCENT,
      ),
    );
    expect(settingsView().depthGroup.note).not.toBe("");
  });

  // **The two consequences are not alike and the copy must not make them look alike.** A material
  // change recalculates the estimate; a depth change moves the model. Asserted as a difference
  // rather than against a literal, so rewording either one keeps the guarantee.
  it("warns about the model moving, in words unlike the material warning", () => {
    const view = settingsView();

    expect(view.depthGroup.warning).not.toBe(view.warning);
    expect(view.depthGroup.warning).not.toBe(ro.globalSettings.materialWarning);
    expect(view.depthGroup.warning.length).toBeGreaterThan(0);
  });

  // The shape criterion, stated as the rule rather than as today's answer: two declared depths read
  // as a toggle, three or more as a list, and the control says which it is rather than the component
  // counting options itself.
  it("names the control's shape from the number of declared depths", () => {
    expect(settingsView().depthGroup.shape).toBe(
      declaredCabinetDepthsMm().length === 2 ? "toggle" : "list",
    );
  });

  it("is a whole-kitchen group beside the two tier groups, not a per-cabinet control", () => {
    const view = settingsView();

    expect(view.groups.map((group) => group.key)).toEqual([
      "material",
      "hardware",
    ]);
    // Derived, not written: the count is the projection's, and this asserts only that the sheet
    // states one — that the setting applies to bodies rather than to a selection.
    const bodyCount = SHIPPED_GROUPS.reduce(
      (count, group) => count + group.entries.length,
      0,
    );
    expect(view.appliesTo).toBe(ro.globalSettings.appliesTo(bodyCount));
    expect(view.depthGroup.heading).toBe(ro.globalSettings.depthHeading);
  });
});

// **Why apply has to compare before it commits, and why it matters more here than for a tier.**
//
// The pattern `global-settings-shell.test.ts` establishes for the tiers: `setCabinetDepth` succeeds
// on the depth the design already carries — deliberately, so re-tapping the option you are on is not
// refused — so *"pressing Aplică without choosing anything writes nothing"* is a claim about the
// guard in `global-settings.tsx` and about nothing else. If that comparison is removed, nothing in
// the domain and nothing below this line will notice.
//
// It matters more than the tier case because of what an unguarded apply would cost: a depth change
// rebuilds every body (ADR 0055 decision 1) and, since ADR 0074, the whole 3D scene. The most
// expensive no-op in the product.
describe("applying a depth that is already carried", () => {
  function storeAtDefault() {
    let tick = 0;
    return createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => {
        tick += 1;
        return `2026-09-04T12:00:${String(tick).padStart(2, "0")}.000Z`;
      },
    });
  }

  it("is not refused, and does move the document — so the guard is the only thing stopping it", () => {
    const store = storeAtDefault();
    const carried = store.getState().design.settings?.cabinetDepthMm;
    if (carried === undefined)
      throw new Error("the seeded design carries none");
    const before = store.getState().design.updatedAt;

    store.getState().setCabinetDepth(carried);

    expect(store.getState().lastRejection).toBeNull();
    expect(store.getState().design.settings?.cabinetDepthMm).toBe(carried);
    expect(store.getState().design.updatedAt).not.toBe(before);
  });

  it("rewrites every body it touches, which is what the guard is protecting", () => {
    const store = storeAtDefault();
    const carried = store.getState().design.settings?.cabinetDepthMm;
    if (carried === undefined)
      throw new Error("the seeded design carries none");
    const before = store.getState().design.placements;

    store.getState().setCabinetDepth(carried);

    // Not `toEqual` — the values are the same at the same depth. The point is that the command
    // produced fresh placements rather than passing the array through, so a redundant apply is a
    // whole rebuild and a scene teardown, not a cheap no-op.
    expect(store.getState().design.placements).not.toBe(before);
  });
});
