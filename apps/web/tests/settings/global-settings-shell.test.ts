// **The half of wave 6G that lives outside the sheet**, plus the two preconditions the sheet's own
// interaction code is written against.
//
// The shipped tests render `GlobalSettingsSurface` — the sheet, given a view. Nothing renders
// `GlobalSettings` itself for what it *says*: the chips beside the control, the control's own
// disclosure contract, and the fact that with the sheet shut there is no dialog in the document at
// all. Those three are the closed half of "modal on both shells", and a static render can see every
// one of them.
//
// **What a static render cannot see is asserted here as a precondition instead.** `trapTab` reads
// `button:not([disabled]), input[type="radio"]:checked` and its comment claims two things about the
// markup — that every group always contributes exactly one checked radio, and that the ring's ends
// are stable. Both are facts about rendered markup; only the key press is not. So they are pinned
// here, and `docs`-level: if a group ever renders zero checked radios, or a footer button ever
// renders `disabled`, the trap loses an end and the e2e that presses Tab is the only thing left
// standing between that and focus leaving the dialog.
import {
  buildKitchenLBodyCatalog,
  findOverflowingPlacementIds,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type PricingResult,
  type WholeKitchenSelections,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ro } from "@/content/ro";
import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  type GlobalSettingsView,
} from "@/settings/global-settings-model";
import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

import { createFakeBodyProbe } from "../support/fake-body-probe";

/** `global-settings-seams.test.ts`'s pattern, for its reason: the component under test runs against
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

const FIXED_NOW = "2026-09-03T12:00:00.000Z";

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

function storeFor(design: Design) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    bodyProbe: createFakeBodyProbe(),
    now: () => FIXED_NOW,
  });
}

function stateFor(design: Design): ConfiguratorState {
  return storeFor(design).getState();
}

/** The whole component — chips, control and whatever it decides to hang below them — as a page
 *  fragment. `useEffect` does not run in a static render, which is exactly the state this file is
 *  about: the sheet has never been opened. */
function screenMarkupFor(design: Design): string {
  storeState.current = stateFor(design);
  return renderToStaticMarkup(createElement(GlobalSettings));
}

function designCarrying(selections: WholeKitchenSelections): Design {
  return { ...KITCHEN_L_DESIGN, settings: selections };
}

function tierNameIn(
  group: "material" | "hardware",
  tierId: string | undefined,
): string {
  const tiers = SAMPLE_PRICE_BOOK[group].tiers;
  const wanted = tierId ?? SAMPLE_PRICE_BOOK[group].defaultTierId;
  const tier = tiers.find((one) => one.tierId === wanted);
  if (!tier) throw new Error(`the book holds no ${group} tier "${wanted}"`);
  return tier.name;
}

function chipLabelsFor(
  selections: WholeKitchenSelections | undefined,
): string[] {
  return [
    ro.priceBreakdown.wholeKitchenLabel(
      ro.priceBreakdown.wholeKitchenCategories.material,
      tierNameIn("material", selections?.materialTierId),
    ),
    ro.priceBreakdown.wholeKitchenLabel(
      ro.priceBreakdown.wholeKitchenCategories.hardware,
      tierNameIn("hardware", selections?.hardwareTierId),
    ),
  ];
}

describe("with the sheet shut, what stands on the screen", () => {
  const closed = screenMarkupFor(KITCHEN_L_DESIGN);

  it("is the two chips and the control that opens them, and nothing else that speaks", () => {
    expect(closed).toContain('data-testid="global-settings-chips"');
    expect(closed).toContain('data-testid="global-settings-trigger"');
    expect(closed).toContain(ro.globalSettings.open);
  });

  it("holds no dialog at all, rather than one that is merely covered or hidden", () => {
    // The half of "modal" that has nothing to do with the scrim: a dialog left in the document and
    // painted over is still tab-reachable and still read out, and no `inert` on the bands behind it
    // would help — the sheet is not behind anything. Asserted as *absence from the markup*, so a
    // future `hidden` or `display: none` shell fails this rather than satisfying it.
    expect(closed).not.toContain('role="dialog"');
    expect(closed).not.toContain('data-testid="global-settings-surface"');
    expect(closed).not.toContain('data-testid="global-settings-scrim"');
    expect(closed).not.toContain(ro.globalSettings.title);
    expect(closed).not.toContain(ro.globalSettings.apply);
    expect(closed).not.toContain(ro.globalSettings.cancel);
  });

  it("says so on the control itself, in the attributes a screen reader reads", () => {
    expect(closed).toContain('aria-haspopup="dialog"');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toMatch(/aria-controls="[^"]+"/);
  });

  it("hides the mockups' chevron from the accessibility tree, so the control's name is the ruled string", () => {
    // Frame D2E draws a glyph beside the words. A glyph inside the button and *not* hidden becomes
    // part of the button's accessible name, which is then no longer the string `ro.ts` ruled.
    const trigger =
      /<button[^>]*global-settings-trigger[^>]*>([\s\S]*?)<\/button>/.exec(
        closed,
      );
    if (!trigger?.[1]) throw new Error("no trigger was rendered");

    const glyphs = [...trigger[1].matchAll(/<span([^>]*)>/g)];

    expect(glyphs.length).toBeGreaterThan(0);
    for (const [, attributes] of glyphs)
      expect(attributes, trigger[1]).toContain('aria-hidden="true"');
  });
});

describe("the chips name what the design carries, at every state it can carry", () => {
  it("does so for the unset design, where the book's own defaults are what is applied", () => {
    // The unset state is "no tier chosen", not "no `settings` key". Wave 6J-a gives every design a
    // persisted `cabinetDepthMm`, so `settings` is now always present and the absence that matters
    // here is the two tier ids.
    expect(KITCHEN_L_DESIGN.settings?.materialTierId).toBeUndefined();
    expect(KITCHEN_L_DESIGN.settings?.hardwareTierId).toBeUndefined();

    const markup = screenMarkupFor(KITCHEN_L_DESIGN);

    for (const label of chipLabelsFor(undefined))
      expect(markup, label).toContain(`>${label}</span>`);
  });

  it("does so across the whole cross product of the two groups", () => {
    // Both chips, at every combination — a chip wired to the wrong group, or to the pending choice
    // rather than the applied one, moves on some cell of this grid and on no single example.
    for (const materialTierId of MATERIAL_TIER_IDS) {
      for (const hardwareTierId of HARDWARE_TIER_IDS) {
        const selections = { materialTierId, hardwareTierId };
        const markup = screenMarkupFor(designCarrying(selections));

        for (const label of chipLabelsFor(selections))
          expect(markup, `${materialTierId} / ${hardwareTierId}`).toContain(
            `>${label}</span>`,
          );
      }
    }
  });

  it("follows one group when only that group is set, and leaves the other at the book's default", () => {
    const oneSet = { hardwareTierId: HARDWARE_TIER_IDS.at(-1) ?? "" };
    const markup = screenMarkupFor(designCarrying(oneSet));

    for (const label of chipLabelsFor(oneSet))
      expect(markup, label).toContain(`>${label}</span>`);
  });
});

/**
 * **A design the book cannot price still gets its control**, and this block used to assert the
 * opposite.
 *
 * The reversal is an owner-level ruling, not a preference: the document that cannot be priced is
 * one carrying a tier the book has since withdrawn, and the tier list is the only control that can
 * put such a document right. Blanking the surface made the fault remove its own remedy, and left the
 * customer holding a design nothing in the application could repair.
 *
 * So the list — book data — renders whenever the book does, and the numbers — pricing — do not. The
 * chips are in the same position as the list: they name the tier a design is priced at, which is the
 * book's default once the stored id is gone, and that is a fact about the book rather than a guess
 * about a price.
 */
describe("a design the book cannot price", () => {
  const withdrawn = designCarrying({ materialTierId: "material.withdrawn" });

  it("is genuinely unpriceable, so this is the case it is named for", () => {
    expect(
      priceDesign({
        design: withdrawn,
        catalog: KITCHEN_L_BODY_CATALOG,
        book: SAMPLE_PRICE_BOOK,
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        selections: withdrawn.settings,
      }).ok,
    ).toBe(false);
  });

  it("still renders the chips and the control that opens the list", () => {
    const markup = screenMarkupFor(withdrawn);

    expect(markup).not.toBe("");
    expect(markup).toContain('data-testid="global-settings-trigger"');
    expect(markup).toContain('data-testid="global-settings-chips"');
  });

  it("shows no figure on the screen behind it, because there is no total to show", () => {
    expect(screenMarkupFor(withdrawn)).not.toContain(
      'data-testid="global-settings-figure"',
    );
  });
});

describe("the overflow flag travels with the total onto this surface too", () => {
  const PAST_THE_WALL_END_MM = 500;

  function overflowingDesign(): Design {
    const onWallA = KITCHEN_L_DESIGN.placements.find(
      (placement) => placement.wall === "A",
    );
    if (!onWallA) throw new Error("the seeded design has no wall A placement");
    return {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement.id === onWallA.id
          ? {
              ...placement,
              alongMm: KITCHEN_L_DESIGN.room.widthMm + PAST_THE_WALL_END_MM,
            }
          : placement,
      ),
    };
  }

  function pricingOf(design: Design): PricingResult {
    return priceDesign({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: design.settings,
    });
  }

  function offerOf(design: Design): WholeKitchenTierOffer {
    return offerWholeKitchenTiers({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: design.settings,
    });
  }

  function viewOf(design: Design): GlobalSettingsView {
    const view = describeGlobalSettings({
      pricing: pricingOf(design),
      offer: offerOf(design),
      groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
      applied: design.settings ?? {},
      pending: design.settings ?? {},
      rejection: null,
    });
    return view;
  }

  const overflowing = overflowingDesign();

  it("has a design that actually overflows, so the case is reachable", () => {
    expect(findOverflowingPlacementIds(overflowing).length).toBe(1);
    expect(findOverflowingPlacementIds(KITCHEN_L_DESIGN).length).toBe(0);
  });

  it("carries the ruled sentence exactly when the priced total is flagged, in both directions", () => {
    // ADR 0065 decision 6. The sheet covers the price bar on mobile, so a customer reading a total
    // here and no warning would be reading the one figure the flag was ruled to travel with.
    for (const design of [KITCHEN_L_DESIGN, overflowing]) {
      const priced = pricingOf(design);
      if (!priced.ok) throw new Error("the design was expected to price");

      expect(viewOf(design).overflowWarning !== undefined).toBe(
        priced.priced.totalIsFlagged,
      );
    }
  });

  it("is absent rather than empty when nothing overflows, so no blank line is reserved for it", () => {
    expect(viewOf(KITCHEN_L_DESIGN).overflowWarning).toBeUndefined();
    expect("overflowWarning" in viewOf(KITCHEN_L_DESIGN)).toBe(false);
  });

  it("reads the sentence on the page beside the figure, not only in the value", () => {
    const markup = renderToStaticMarkup(
      createElement(GlobalSettingsSurface, {
        id: "settings",
        view: viewOf(overflowing),
        onChoose: () => undefined,
        onChooseDepth: () => undefined,
        onCancel: () => undefined,
        onApply: () => undefined,
      }),
    );

    expect(markup).toContain('data-testid="global-settings-overflow"');
    expect(markup).toContain(ro.price.overflowingTotalWarning);
    expect(
      renderToStaticMarkup(
        createElement(GlobalSettingsSurface, {
          id: "settings",
          view: viewOf(KITCHEN_L_DESIGN),
          onChoose: () => undefined,
          onChooseDepth: () => undefined,
          onCancel: () => undefined,
          onApply: () => undefined,
        }),
      ),
    ).not.toContain(ro.price.overflowingTotalWarning);
  });
});

describe("the markup preconditions the focus trap is written against", () => {
  /** The selector `global-settings.tsx` traps on, applied to markup rather than to a live DOM: the
   *  ring is a property of what is rendered, and only the key press needs a browser. */
  function tabStopsIn(markup: string): string[] {
    return [...markup.matchAll(/<(?:button|input)\b[^>]*>/g)]
      .map(([tag]) => tag)
      .filter((tag) =>
        tag.startsWith("<button")
          ? !tag.includes("disabled")
          : tag.includes('type="radio"') && /\bchecked\b/.test(tag),
      );
  }

  function surfaceMarkupFor(
    pending: WholeKitchenSelections | undefined,
  ): string {
    const design =
      pending === undefined ? KITCHEN_L_DESIGN : designCarrying(pending);
    const pricing = priceDesign({
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: design.settings,
    });
    const view = describeGlobalSettings({
      pricing,
      offer: offerWholeKitchenTiers({
        design,
        catalog: KITCHEN_L_BODY_CATALOG,
        book: SAMPLE_PRICE_BOOK,
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        selections: design.settings,
      }),
      groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
      applied: design.settings ?? {},
      pending: design.settings ?? {},
      rejection: null,
    });
    return renderToStaticMarkup(
      createElement(GlobalSettingsSurface, {
        id: "settings",
        view,
        onChoose: () => undefined,
        onChooseDepth: () => undefined,
        onCancel: () => undefined,
        onApply: () => undefined,
      }),
    );
  }

  /** Every pending state the sheet can be opened in, the unset one included. */
  const EVERY_PENDING: readonly (WholeKitchenSelections | undefined)[] = [
    undefined,
    ...MATERIAL_TIER_IDS.flatMap((materialTierId) =>
      HARDWARE_TIER_IDS.map((hardwareTierId) => ({
        materialTierId,
        hardwareTierId,
      })),
    ),
  ];

  it("contributes exactly one checked radio per group, at every state the sheet opens in", () => {
    // The trap's own comment states this as the reason the unchecked radios are left out of the
    // selector. A group rendering none would move the ring's first stop into the other group, and a
    // group rendering two would put a stop on an element the browser's own radio behaviour skips.
    for (const pending of EVERY_PENDING) {
      const markup = surfaceMarkupFor(pending);
      const checked = [...markup.matchAll(/<input\b[^>]*>/g)].filter(([tag]) =>
        /\bchecked\b/.test(tag),
      );
      const groups = [...markup.matchAll(/role="radiogroup"/g)];

      // Three since wave 6K-b: the two tier groups and the cabinet depth. The invariant the trap
      // rests on is the line below — exactly one checked option per group — and it is derived, so a
      // fourth group does not silently satisfy it by arithmetic.
      expect(groups.length, JSON.stringify(pending)).toBe(3);
      expect(checked.length, JSON.stringify(pending)).toBe(groups.length);
    }
  });

  it("renders no disabled control at either end, so neither end of the ring can vanish", () => {
    // The case the trap has no answer for: `stops.at(0)` and `stops.at(-1)` are computed from the
    // live DOM, so a disabled first or last stop silently moves the wrap point. It cannot arise
    // while nothing here renders `disabled` — asserted, because that is a fact about this markup
    // rather than a rule anything enforces.
    for (const pending of EVERY_PENDING)
      expect(surfaceMarkupFor(pending), JSON.stringify(pending)).not.toContain(
        "disabled",
      );
  });

  it("puts a radio at the head of the ring and the apply button at its tail", () => {
    const markup = surfaceMarkupFor(undefined);
    const stops = tabStopsIn(markup);
    // One stop per radiogroup — the browser's own radio behaviour makes a group one stop, which is
    // the precondition the test above pins — plus cancel and apply. Derived, so the ring's shape is
    // asserted rather than its length at the moment this was written.
    const groupCount = [...markup.matchAll(/role="radiogroup"/g)].length;

    expect(stops.length).toBe(groupCount + 2);
    for (let at = 0; at < groupCount; at += 1)
      expect(stops.at(at), `stop ${String(at)}`).toContain('type="radio"');
    expect(stops.at(-2)).toContain('data-testid="global-settings-cancel"');
    expect(stops.at(-1)).toContain('data-testid="global-settings-apply"');
  });
});

describe("why apply has to compare before it commits", () => {
  it("is because the command underneath does not de-duplicate: a redundant set still moves updatedAt", () => {
    // `setMaterialTier` succeeds on a tier the design already carries — deliberately, so a customer
    // re-tapping the chip they are on is not refused (`set-whole-kitchen-settings.ts` says so). The
    // consequence is that "pressing *Aplică* without choosing anything writes nothing" is a claim
    // about `applyTierIfChanged` in `global-settings.tsx` and about nothing else. If that comparison
    // is ever removed, no assertion below this one and no assertion in the domain will notice.
    // A distinct instant per call, however many times the store asks — so the assertion is about
    // the command writing a *new* `updatedAt` rather than about how often the clock is read.
    let tick = 0;
    const store = createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      bodyProbe: createFakeBodyProbe(),
      now: () => {
        tick += 1;
        return `2026-09-03T12:00:${String(tick).padStart(2, "0")}.000Z`;
      },
    });
    const alreadyCarried = MATERIAL_TIER_IDS.at(-1) ?? "";

    store.getState().setMaterialTier(alreadyCarried, MATERIAL_TIER_IDS);
    const afterFirst = store.getState().design.updatedAt;
    store.getState().setMaterialTier(alreadyCarried, MATERIAL_TIER_IDS);

    expect(store.getState().lastRejection).toBeNull();
    expect(store.getState().design.settings?.materialTierId).toBe(
      alreadyCarried,
    );
    expect(store.getState().design.updatedAt).not.toBe(afterFirst);
  });
});
