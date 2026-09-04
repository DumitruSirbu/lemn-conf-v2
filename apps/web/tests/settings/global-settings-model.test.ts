// Frames 2E / D2E's whole-kitchen settings, as a value and as markup.
//
// The rendered half is here for `price-breakdown-model.test.ts`'s reason: *"a zero reads inclus"* is
// a claim about what is on the page, and a value assertion cannot see a `0` rendered beside it.
//
// **Every Romanian string this wave added is pinned by a literal below.** They are drafted from the
// mockups' own frames and have not been through the owner, so the pins are what makes a change to
// any of them a deliberate act rather than a diff nobody reads.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DisplayGroup,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";

import { REFUSAL } from "../support/selection-meta";
import { describeRoundedAmount } from "@/price/starting-price";
import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  type GlobalSettingsView,
  type DescribeGlobalSettingsInput,
  type TierGroupView,
} from "@/settings/global-settings-model";
import { GlobalSettingsSurface } from "@/settings/global-settings";

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

const SHIPPED_GROUPS: readonly DisplayGroup[] = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

function inputFor(
  overrides: Partial<DescribeGlobalSettingsInput> = {},
): DescribeGlobalSettingsInput {
  return {
    pricing: pricingOf(KITCHEN_L_DESIGN),
    offer: offerOf(KITCHEN_L_DESIGN),
    groups: SHIPPED_GROUPS,
    applied: {},
    pending: {},
    rejection: null,
    ...overrides,
  };
}

/** Throws rather than returning a union, so every assertion below reads the available shape without
 *  narrowing it again. */
function settingsView(
  overrides: Partial<DescribeGlobalSettingsInput> = {},
): GlobalSettingsView {
  const view = describeGlobalSettings(inputFor(overrides));
  return view;
}

function groupNamed(
  view: GlobalSettingsView,
  key: "material" | "hardware",
): TierGroupView {
  const group = view.groups.find((one) => one.key === key);
  if (!group) throw new Error(`no ${key} group was described`);
  return group;
}

/** The seeded projection cut down to a known number of bodies, in one group. */
function firstEntries(bodyCount: number): readonly DisplayGroup[] {
  const first = SHIPPED_GROUPS[0];
  if (!first) throw new Error("the seeded design projects to no groups");
  return [{ ...first, entries: first.entries.slice(0, bodyCount) }];
}

function markupOf(view: GlobalSettingsView): string {
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

describe("what the sheet says it applies to", () => {
  it("counts the bodies the projection holds, not the placements the document does", () => {
    // Handed one group of two entries, it says two — whatever else the design carries. Empty
    // columns and the voids derived from a column map are space rather than bodies, and the
    // projection is the one answer to which of the two a thing is.
    expect(settingsView({ groups: firstEntries(2) }).appliesTo).toBe(
      "Se aplică tuturor celor 2 corpuri. Nu se setează pe fiecare corp în parte.",
    );
  });

  it("states the seeded kitchen's own count", () => {
    const bodyCount = SHIPPED_GROUPS.reduce(
      (total, group) => total + group.entries.length,
      0,
    );

    expect(settingsView().appliesTo).toContain(String(bodyCount));
  });

  it("stays grammatical at one body, where the mockup's own wording is not", () => {
    // *"tuturor celor 1 corp"* is not Romanian, so the singular is its own form rather than the
    // drawn sentence with a one substituted into it.
    expect(settingsView({ groups: firstEntries(1) }).appliesTo).toBe(
      "Se aplică singurului corp din bucătărie. Nu se setează pe fiecare corp în parte.",
    );
  });

  it("stays grammatical at none, and at the count where Romanian takes de", () => {
    expect(settingsView({ groups: [] }).appliesTo).toBe(
      "Se aplică tuturor celor 0 de corpuri. Nu se setează pe fiecare corp în parte.",
    );
    expect(ro.globalSettings.appliesTo(20)).toBe(
      "Se aplică tuturor celor 20 de corpuri. Nu se setează pe fiecare corp în parte.",
    );
  });

  it("says it is not set per cabinet, which is half the criterion", () => {
    expect(settingsView().appliesTo).toContain(
      "Nu se setează pe fiecare corp în parte",
    );
  });
});

describe("what a tier's badge prints", () => {
  it("reads inclus for a tier that adds nothing, and never a zero", () => {
    const material = groupNamed(settingsView(), "material");
    const included = material.options.filter(
      (option) => option.deltaText === "inclus",
    );

    expect(included.length).toBeGreaterThan(0);
    for (const option of material.options)
      expect(option.deltaText, option.tierId).not.toMatch(/^0/);
  });

  it("reads de la +N for a tier that costs extra", () => {
    const material = groupNamed(settingsView(), "material");
    const charged = material.options.filter(
      (option) => option.deltaText !== "inclus",
    );

    expect(charged.length).toBeGreaterThan(0);
    for (const option of charged)
      expect(option.deltaText, option.tierId).toMatch(/^de la \+\d/);
  });

  it("rounds every delta through the one site the total rounds through", () => {
    // Not "the figures look right" but "one function formats them" — wave 6C's criterion, applied to
    // the amounts this wave added. Re-derived through the published formatter rather than restated
    // as a literal, so a second rounding rule here would show up as a different string.
    const offer = offerOf(KITCHEN_L_DESIGN);

    for (const tier of offer.material.tiers) {
      if (tier.deltaMinor === undefined)
        throw new Error("the seeded design was expected to price");
      if (tier.deltaMinor === 0) continue;
      const option = groupNamed(settingsView(), "material").options.find(
        (one) => one.tierId === tier.tierId,
      );
      expect(option?.deltaText, tier.tierId).toBe(
        `de la +${describeRoundedAmount(tier.deltaMinor)}`,
      );
    }
  });

  it("carries the book's own name and description for every tier, in book order", () => {
    expect(
      groupNamed(settingsView(), "hardware").options.map((option) => [
        option.name,
        option.description,
      ]),
    ).toEqual(
      SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => [
        tier.name,
        tier.description,
      ]),
    );
  });
});

describe("the two selections, which are not the same selection", () => {
  it("marks the pending choice inside the sheet", () => {
    const view = settingsView({
      pending: { materialTierId: "material.veneer" },
    });
    const selected = groupNamed(view, "material").options.filter(
      (option) => option.isSelected,
    );

    expect(selected.map((option) => option.tierId)).toEqual([
      "material.veneer",
    ]);
  });

  it("falls back to the book's default where a design chose nothing", () => {
    const selected = groupNamed(settingsView(), "material").options.filter(
      (option) => option.isSelected,
    );

    expect(selected.map((option) => option.tierId)).toEqual([
      SAMPLE_PRICE_BOOK.material.defaultTierId,
    ]);
  });

  it("names the applied choice on the chips, not the pending one", () => {
    // The chips are visible with the sheet shut, so they must not move under a customer who has not
    // pressed Aplică yet.
    const view = settingsView({
      applied: { materialTierId: "material.melamine", cabinetDepthMm: 600 },
      pending: { materialTierId: "material.veneer", cabinetDepthMm: 700 },
    });

    // **Two, and the cabinet depth is deliberately not a third** (wave 6K-b, 2026-09-05). One was
    // added and withdrawn on measurement: at 390 x 844 the chips row cannot hold three, and a third
    // pushed the bar over the controls beside it — 44 of 58 e2e specs failed because nothing could
    // be tapped. Two chips already truncate at that viewport. The depth needs the reminder least of
    // the three anyway: it is the only one whose change the customer can *see*, in the model itself.
    expect(view.chips.map((chip) => chip.label)).toEqual([
      "Material · PAL melaminat",
      "Feronerie · Standard",
    ]);
  });

  it("publishes every offered id, which is what the apply commands are handed", () => {
    expect(groupNamed(settingsView(), "hardware").tierIds).toEqual(
      SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => tier.tierId),
    );
  });
});

describe("the ruled words, and the one deliberately absent", () => {
  it("pins every string this wave drafted", () => {
    const view = settingsView();

    expect(view.openLabel).toBe("Setări globale");
    expect(view.title).toBe("Setări pentru toată bucătăria");
    expect(view.warning).toBe(
      "Schimbarea materialului recalculează întreaga estimare.",
    );
    expect(view.applyLabel).toBe("Aplică");
    expect(view.cancelLabel).toBe("Renunță");
    expect(view.groups.map((group) => group.heading)).toEqual([
      "Material corp și fronturi",
      "Feronerie",
    ]);
    expect(view.groups.map((group) => group.anchor)).toEqual([
      "Față de materialul inclus",
      "Față de feroneria inclusă",
    ]);
    expect(ro.globalSettings.tierDelta("+9 000")).toBe("de la +9 000");
  });

  it("omits the sentence about limiting per-cabinet finishes entirely, rather than showing it", () => {
    // Wave 6F has not shipped. A warning about behaviour that does not exist is decoration — the
    // exact defect M4's Finisaj section shipped — so the clause is absent from the copy and from the
    // page, not greyed out on either.
    expect(settingsView().warning).not.toMatch(/finisaj/i);
    expect(markupOf(settingsView())).not.toMatch(/finisaj/i);
  });

  it("names what each group's amounts are measured against, per group and on the page", () => {
    // The anchor is the book's **default** tier, not what the design carries, and the two diverge
    // the moment a customer applies anything. One line per group rather than one for the sheet: the
    // anchor is a property of a group, and the two could later differ.
    const markup = markupOf(settingsView());

    expect(markup).toContain("Față de materialul inclus");
    expect(markup).toContain("Față de feroneria inclusă");
    expect(
      [...markup.matchAll(/data-testid="global-settings-anchor"/g)].length,
    ).toBe(2);
  });

  it("carries comma-below diacritics in the anchor lines, not the cedillas that render identically", () => {
    // `ț` U+021B, never `ţ` U+0163 — the same check `starting-price.adversarial.test.ts` keeps on
    // the owner's own sentence, applied to the two strings this wave drafted with a t-comma in them.
    for (const anchor of Object.values(ro.globalSettings.groupAnchors)) {
      expect(anchor, anchor).toContain("Fa\u021B\u0103");
      expect(anchor, anchor).not.toMatch(/[\u0163\u015F]/);
    }
  });

  it("spells its de la with the same two words the figure above it does", () => {
    expect(ro.globalSettings.tierDelta("+1 000").startsWith("de la")).toBe(
      true,
    );
    expect(ro.price.startingPrefix.toLowerCase()).toBe("de la");
  });
});

describe("the surface itself", () => {
  it("is a modal dialog on both shells, named by its own heading", () => {
    const markup = markupOf(settingsView());

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="settings-title"');
  });

  it("offers each tier as a radio, with the selected one checked", () => {
    const markup = markupOf(
      settingsView({ pending: { materialTierId: "material.veneer" } }),
    );

    expect(markup).toContain('checked="" value="material.veneer"');
    expect(markup).not.toContain('checked="" value="material.melamine"');
  });

  it("renders inclus rather than a zero, on the page", () => {
    expect(markupOf(settingsView())).toContain(">inclus<");
    expect(markupOf(settingsView())).not.toMatch(/>0</);
  });

  it("shows the running total, on a surface that covers the bar carrying it", () => {
    const view = settingsView();
    if (!view.figure)
      throw new Error("the seeded design was expected to price");

    expect(markupOf(view)).toContain(view.figure.amountText);
    expect(view.figure.label).toBe(ro.price.startingPrefix);
  });

  it("calls the total unchanged while a refusal stands, like the bar it covers", () => {
    // The owner's 2026-09-03 ruling reaches this surface through `describeStartingLabel`, the one
    // rule the bar and §9's footer also read. Without it, a customer whose edit was refused would
    // read *"De la neschimbat"* on the bar behind the scrim and *"De la"* on the sheet in front of
    // it — the ruling dropped on the one total a mobile customer can actually see.
    const refused = settingsView({ rejection: REFUSAL });

    expect(refused.figure?.label).toBe(ro.price.startingPrefixUnchanged);
    expect(settingsView().figure?.label).toBe(ro.price.startingPrefix);
  });

  it("carries both actions on both shells", () => {
    const markup = markupOf(settingsView());

    expect(markup).toContain("Aplică");
    expect(markup).toContain("Renunță");
  });
});

/**
 * **A design carrying a tier the book has since withdrawn**, which is the one document that most
 * needs this surface and the one that used to make it disappear.
 *
 * `priceDesign` refuses such a design outright, so the deltas and the total go — and the tier list
 * must not, because it is the only control that can put the document right. A fault that removes its
 * own remedy is the failure this block exists to keep closed.
 */
describe("a stored tier the book no longer offers", () => {
  const withdrawn: Design = {
    ...KITCHEN_L_DESIGN,
    settings: { materialTierId: "material.withdrawn" },
  };

  function withdrawnView(): GlobalSettingsView {
    return describeGlobalSettings({
      pricing: pricingOf(withdrawn),
      offer: offerOf(withdrawn),
      groups: projectDesignForDisplay(withdrawn, KITCHEN_L_BODY_CATALOG),
      applied: withdrawn.settings ?? {},
      pending: withdrawn.settings ?? {},
      rejection: null,
    });
  }

  it("is genuinely unpriceable, so this is the case it is named for", () => {
    expect(pricingOf(withdrawn).ok).toBe(false);
  });

  it("still lists every tier the book offers, in both groups", () => {
    for (const key of ["material", "hardware"] as const)
      expect(groupNamed(withdrawnView(), key).tierIds).toEqual(
        SAMPLE_PRICE_BOOK[key].tiers.map((tier) => tier.tierId),
      );
  });

  it("still offers each of them as a selectable radio, with one checked", () => {
    const markup = markupOf(withdrawnView());

    for (const tier of SAMPLE_PRICE_BOOK.material.tiers)
      expect(markup, tier.tierId).toContain(`value="${tier.tierId}"`);
    // One per radiogroup, derived — the sheet gained a third group in wave 6K-b and will gain a
    // fourth with 6R's finish control, and "exactly one option is checked in each" is the claim
    // either way.
    expect([...markup.matchAll(/checked=""/g)].length).toBe(
      [...markup.matchAll(/role="radiogroup"/g)].length,
    );
  });

  it("still hands apply the ids the 6E commands accept", () => {
    // The recovery path itself: the ids are what `setMaterialTier` is given as `availableTierIds`,
    // and a command handed a list this surface could not build would refuse the very choice that
    // fixes the document.
    expect(groupNamed(withdrawnView(), "material").tierIds).toContain(
      SAMPLE_PRICE_BOOK.material.defaultTierId,
    );
  });

  it("marks the book's default as the standing choice, since that is what the withdrawn id resolves to", () => {
    expect(
      groupNamed(withdrawnView(), "material")
        .options.filter((option) => option.isSelected)
        .map((option) => option.tierId),
    ).toEqual([SAMPLE_PRICE_BOOK.material.defaultTierId]);
  });

  it("states no figure and no delta — absent, never zero", () => {
    const view = withdrawnView();
    const markup = markupOf(view);

    expect(view.figure).toBeUndefined();
    for (const group of view.groups)
      for (const option of group.options)
        expect(option.deltaText, option.tierId).toBeUndefined();
    // On the badge, not in the page: the book's own tier *descriptions* legitimately say *inclus*
    // ("Materialul standard al bucătăriei, inclus în preț"), and refusing the word outright would
    // be a claim about copy this surface does not author.
    expect(markup).not.toContain('data-testid="global-settings-delta"');
    expect(markup).not.toContain('data-testid="global-settings-figure"');
    expect(markup).not.toContain('data-testid="global-settings-anchor"');
  });

  it("drops the anchor line with the amounts it was about", () => {
    for (const group of withdrawnView().groups)
      expect(group.anchor, group.key).toBeUndefined();
  });
});
