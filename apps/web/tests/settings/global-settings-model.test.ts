// Frames 2E / D2E's whole-kitchen settings, as a value and as markup.
//
// The rendered half is here for `price-breakdown-model.test.ts`'s reason: *"a zero reads inclus"* is
// a claim about what is on the page, and a value assertion cannot see a `0` rendered beside it.
//
// **Every Romanian string this wave added is pinned by a literal below.** They are drafted from the
// mockups' own frames and have not been through the owner, so the pins are what makes a change to
// any of them a deliberate act rather than a diff nobody reads.
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
  type DisplayGroup,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { ro as content } from "../support/romanian-content";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { swatchOf } from "@lemnaria/three-adapter";

import { describeRoundedAmount } from "@/price/starting-price";
import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  describePillRung,
  type GlobalSettingsView,
  type DescribeGlobalSettingsInput,
  type TierGroupView,
} from "@/settings/global-settings-model";
import { GlobalSettingsSurface } from "@/settings/global-settings";
import { describeEditability } from "@/store/editability";

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
    content: overrides.content ?? content,
    pricing: pricingOf(KITCHEN_L_DESIGN),
    offer: offerOf(KITCHEN_L_DESIGN),
    groups: SHIPPED_GROUPS,
    applied: {},
    pending: {},
    chosenColourCount: countCabinetsWearingAChosenFinish(KITCHEN_L_DESIGN),
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

/** These fixtures are about tiers, deltas and copy, never about access. Stated rather than
 *  defaulted: `GlobalSettingsSurface.editability` is a required prop precisely so a write surface
 *  cannot silently default to permitted (M6-AUD-001). */
const WRITABLE_ACCESS = describeEditability({
  canWrite: true,
  saveStatus: "idle",
});

function markupOf(view: GlobalSettingsView): string {
  return renderToStaticMarkup(
    createElement(GlobalSettingsSurface, {
      id: "settings",
      view,
      editability: WRITABLE_ACCESS,
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
      content.globalSettings.appliesTo(2),
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
    // *"tuturor celor 1 dulap"* is not Romanian, so the singular is its own form rather than the
    // drawn sentence with a one substituted into it.
    expect(settingsView({ groups: firstEntries(1) }).appliesTo).toBe(
      content.globalSettings.appliesTo(1),
    );
  });

  it("uses the locale resolver for an empty kitchen", () => {
    expect(settingsView({ groups: [] }).appliesTo).toBe(
      content.globalSettings.appliesTo(0),
    );
  });

  it("says it is not set per cabinet, which is half the criterion", () => {
    const perCabinetClause = content.globalSettings.appliesTo(2).split(". ")[1];
    if (perCabinetClause === undefined)
      throw new Error("the applies-to message has no per-cabinet clause");
    expect(settingsView().appliesTo).toContain(perCabinetClause);
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

  it("names the applied choice on the pill, not the pending one", () => {
    // The pill is read with the sheet shut, so it must not move under a customer who has not pressed
    // Aplică yet.
    const view = settingsView({
      applied: { materialTierId: "material.melamine", cabinetDepthMm: 600 },
      pending: { materialTierId: "material.veneer", cabinetDepthMm: 700 },
    });

    // **Four settings, in ADR 0099 decision 9's order**, and the depth is one of them: frame D2A
    // names it — `Adâncime 600` — which ADR 0082 left open and ADR 0104 decision 1 closes. The
    // count of two chips this replaces was a measurement of a chips row that no longer exists; what
    // decides how many of these are *drawn* is the ladder, measured per width, and the rest are
    // counted after a `+`.
    //
    // **The composition is D2A's and not the breakdown's**: the material bare, the others a category
    // word and a value with no `·`.
    expect(view.pill.settings.map((setting) => setting.label)).toEqual([
      "PAL melaminat",
      "Alb",
      "Feronerie Standard",
      "Adâncime 600",
    ]);
    expect(view.pill.settings.map((setting) => setting.key)).toEqual([
      "material",
      "colour",
      "hardware",
      "depth",
    ]);
  });

  it("draws a palette colour by its own name, with no category word in front of it", () => {
    // **Owner, 2026-09-09**: *"the color should be without word Culoare, just the color name"*. It is
    // deliberately unlike the two segments beside it — frame D2A does put a category word in front of
    // the hardware and the depth — so the assertion names all three at once.
    const view = settingsView({
      applied: { materialTierId: "material.melamine" },
    });
    const [, colour, hardware, depth] = view.pill.settings;

    expect(colour).toEqual({ key: "colour", label: "Alb" });
    expect(hardware?.label.startsWith("Feronerie ")).toBe(true);
    expect(depth?.label.startsWith("Adâncime ")).toBe(true);
  });

  it("draws a free colour as a swatch and no text at all, and still counts it as shown", () => {
    // The other half of the same ruling: *"or if MDF the value interpreted (real color)"*. MDF's
    // control is a RAL picker, so its colours have no names — a hex on the pill would be a value
    // nobody reads as a colour. The swatch wears it, and the setting is **shown** rather than
    // counted, so the ladder and `+N` are unaffected.
    const view = settingsView({
      applied: { materialTierId: "material.painted-mdf" },
      pending: { materialTierId: "material.painted-mdf" },
    });

    expect(view.pill.settings.map((setting) => setting.key)).toEqual([
      "material",
      "colour",
      "hardware",
      "depth",
    ]);
    expect(view.pill.settings[1]?.label).toBe("");
    expect(view.pill.swatch).toEqual({ colour: "#eceeeb", isWood: false });
    // Drawn: no empty label and no divider around nothing.
    expect(describePillRung(view.pill, 2).labels).toEqual(["MDF vopsit mat"]);
    expect(describePillRung(view.pill, 2).counter).toBe("+2");
  });

  it("says the free colour's value in the accessible name, since nothing on screen says it", () => {
    // A swatch is not something a screen reader can read, and a colour nobody can name still has to
    // be announced — which is the same rule that puts every counted setting in this name.
    const view = settingsView({
      applied: { materialTierId: "material.painted-mdf" },
      pending: { materialTierId: "material.painted-mdf" },
    });

    expect(view.pill.accessibleName).toContain("#eceeeb");
  });

  it("wears the colour the scene paints, rather than a second hex of its own", () => {
    // One declared colour, three surfaces: the pill's swatch, §9's chips and the 3D all read the
    // adapter's own value for the finish.
    const declared = swatchOf(paletteFinish("pal.alb"));

    expect(settingsView().pill.swatch).toEqual({
      colour: declared.color,
      isWood: declared.isWood,
    });
  });

  it("names every setting in the pill's accessible name, whatever it draws", () => {
    // `+N` is a visual economy and it must not cost a screen-reader user a setting (ADR 0104
    // decision 3). Asserted against the floor of the ladder, which is where the visible pill says
    // least: one label and a counter.
    const view = settingsView();
    const floor = describePillRung(view.pill, 1);

    expect(floor.labels).toEqual(["PAL melaminat"]);
    expect(floor.counter).toBe("+3");
    for (const setting of view.pill.settings) {
      expect(view.pill.accessibleName).toContain(setting.label);
    }
    expect(view.pill.accessibleName).toContain("Setări globale");
  });

  it("counts what it does not show, and never draws a bare counter", () => {
    const view = settingsView();

    expect(describePillRung(view.pill, 4)).toEqual({
      labels: ["PAL melaminat", "Alb", "Feronerie Standard", "Adâncime 600"],
    });
    expect(describePillRung(view.pill, 2).counter).toBe("+2");
    // The floor holds even against a caller that asks for nothing to be named.
    expect(describePillRung(view.pill, 0).labels).toEqual(["PAL melaminat"]);
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

    // The control's own name is still the ruled string; since ADR 0104 decision 2 it is the pill's
    // accessible name rather than visible text, because no frame draws a text trigger.
    expect(view.pill.accessibleName.startsWith("Setări globale")).toBe(true);
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
    expect(content.globalSettings.tierDelta("+9 000")).toBe("de la +9 000");
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
    for (const anchor of Object.values(content.globalSettings.groupAnchors)) {
      expect(anchor, anchor).toContain("Fa\u021B\u0103");
      expect(anchor, anchor).not.toMatch(/[\u0163\u015F]/);
    }
  });

  it("spells its de la with the same two words the figure above it does", () => {
    expect(content.globalSettings.tierDelta("+1 000").startsWith("de la")).toBe(
      true,
    );
    expect(content.price.startingPrefix.toLowerCase()).toBe("de la");
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
    expect(view.figure.label).toBe(content.price.startingPrefix);
  });

  it("calls the total what every other surface calls it, since there is one name left", () => {
    // **The 2026-09-03 ruling this case was written for is withdrawn** (owner, 2026-09-09): a total
    // standing under a refused edit was called *"De la neschimbat"*, and this sheet had to say it
    // too because it covers the bar that said it. There is one label now, so what was a rule three
    // surfaces had to share is a string one module composes — and the sheet cannot disagree with the
    // bar about a choice neither of them makes.
    expect(settingsView().figure?.label).toBe(content.price.startingPrefix);
    expect(settingsView().figure?.label).not.toContain("neschimbat");
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
      content: content,
      pricing: pricingOf(withdrawn),
      offer: offerOf(withdrawn),
      groups: projectDesignForDisplay(withdrawn, KITCHEN_L_BODY_CATALOG),
      applied: withdrawn.settings ?? {},
      pending: withdrawn.settings ?? {},
      chosenColourCount: countCabinetsWearingAChosenFinish(withdrawn),
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
