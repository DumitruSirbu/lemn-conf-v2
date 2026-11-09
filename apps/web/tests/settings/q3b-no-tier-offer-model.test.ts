// The settings sheet's model with no tier offer (no active price book), and with a default switched off.
//
// With no book the material and hardware groups are one line each, with no option, delta, anchor or default marked; the
// depth, colour and handle controls keep working; nothing renders a zero. Every string is read from its catalogue leaf.
// Its sibling `qa-m10-q3b-opening-choice.adversarial.test.ts` sweeps what the sheet opens on; this file pins the examples.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  deepCabinetPercentOf,
  NO_PRICE_BOOK,
  NO_TIER_OFFER,
  offerTiersAgainstBook,
} from "@/price/price-book-root";
import {
  describeGlobalSettings,
  describePillRung,
  describeSettingsPill,
  resolveOpeningChoice,
  type DescribeGlobalSettingsInput,
  type TierGroupView,
} from "@/settings/global-settings-model";

import { rootPublishingDeepCabinetPercent } from "../support/book-with-deep-cabinet-percent";
import { ro } from "../support/romanian-content";
import {
  kitchenCarrying,
  offerThroughRoot,
  switchedOffTiers,
} from "../support/tier-offer-world";

const NO_BOOK_REFUSAL: PricingResult = {
  ok: false,
  failure: { code: "INVALID_PRICE_BOOK", detail: "No price book is active" },
};
const SHIPPED_GROUPS = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);
const A_DIGIT = /\d/u;

function noBookInput(
  overrides: Partial<DescribeGlobalSettingsInput> = {},
): DescribeGlobalSettingsInput {
  return {
    content: ro,
    pricing: NO_BOOK_REFUSAL,
    offer: NO_TIER_OFFER,
    deepCabinetPercent: undefined,
    groups: SHIPPED_GROUPS,
    applied: {},
    pending: {},
    chosenColourCount: 0,
    ...overrides,
  };
}

function groupNamed(
  groups: readonly TierGroupView[],
  key: "material" | "hardware",
): TierGroupView {
  const group = groups.find((one) => one.key === key);
  if (!group) throw new Error(`no ${key} group was described`);
  return group;
}

describe("the root with no book", () => {
  it("answers the one NO_TIER_OFFER, not a throw and not an empty offer", () => {
    const answer = offerTiersAgainstBook(
      NO_PRICE_BOOK,
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );

    expect(answer).toBe(NO_TIER_OFFER);
    expect(answer).not.toHaveProperty("material");
  });

  it("reads no depth percentage, where a book that publishes none still reads 0", () => {
    expect(deepCabinetPercentOf(NO_PRICE_BOOK)).toBeUndefined();
    expect(deepCabinetPercentOf(rootPublishingDeepCabinetPercent(0))).toBe(0);
  });
});

describe("the settings sheet with no tier offer", () => {
  it("shows each whole-kitchen group as its heading and one line, with no option, anchor, delta or tier id", () => {
    const view = describeGlobalSettings(noBookInput());

    for (const key of ["material", "hardware"] as const) {
      const group = groupNamed(view.groups, key);
      expect(group.heading).toBe(ro.globalSettings.groupHeadings[key]);
      expect(group.unavailableText).toBe(ro.globalSettings.pricesUnavailable);
      expect(group.options).toEqual([]);
      expect(group.tierIds).toEqual([]);
      expect(group.anchor).toBeUndefined();
    }
  });

  it("carries a line with no figure in it (its wording is pinned by the copy lock)", () => {
    expect(ro.globalSettings.pricesUnavailable).not.toBe("");
    expect(ro.globalSettings.pricesUnavailable).not.toMatch(A_DIGIT);
  });

  it("keeps the depth options and says prices are unavailable instead of a percentage", () => {
    const { depthGroup } = describeGlobalSettings(noBookInput());

    expect(depthGroup.options.length).toBeGreaterThan(1);
    expect(
      depthGroup.options.filter((option) => option.isSelected),
    ).toHaveLength(1);
    expect(depthGroup.note).toBe(ro.globalSettings.pricesUnavailable);
  });

  it("shows no figure and no overflow warning, because the pricing is a refusal", () => {
    const view = describeGlobalSettings(noBookInput());

    expect(view.figure).toBeUndefined();
    expect(view.overflowWarning).toBeUndefined();
  });

  it("keeps the colour group, which is declared by the code and not by a book", () => {
    const view = describeGlobalSettings(noBookInput());

    expect(view.colourGroup).toBeDefined();
  });

  it("opens on what the kitchen carries, so applying writes no tier: a stored tier is neither replaced nor dropped", () => {
    const applied = { materialTierId: "material.veneer", cabinetDepthMm: 600 };

    expect(resolveOpeningChoice(applied, NO_TIER_OFFER)).toEqual(applied);
    expect(resolveOpeningChoice({}, NO_TIER_OFFER)).toEqual({});
  });

  it("names no tier on the pill, which still names the colour and the depth", () => {
    const pill = describeSettingsPill({
      offer: NO_TIER_OFFER,
      applied: {},
      content: ro,
    });

    expect(pill.settings.map((setting) => setting.key)).toEqual([
      "colour",
      "depth",
    ]);
    expect(pill.accessibleName).not.toMatch(/\b0\b/u);
  });

  describe("at the pill's floor, with a nameless free colour leading it", () => {
    const pill = describeSettingsPill({
      offer: NO_TIER_OFFER,
      applied: { materialTierId: "material.painted-mdf" },
      content: ro,
    });
    const floor = describePillRung(pill, 1);

    it("has a free colour that draws no text", () => {
      expect(pill.settings[0]).toEqual({ key: "colour", label: "" });
    });

    it("draws a named label, never a counter alone", () => {
      expect(floor.labels).toEqual([pill.settings[1]?.label]);
      expect(floor.labels[0]).not.toBe("");
    });

    it("counts nothing as hidden when the colour is shown by its swatch and the depth is named", () => {
      expect(floor.counter).toBeUndefined();
    });

    it("draws no zero", () => {
      expect(JSON.stringify(floor)).not.toMatch(/\b0\b/u);
    });
  });
});

describe("the settings sheet while a default is switched off", () => {
  const DEFAULT_MATERIAL = SAMPLE_PRICE_BOOK.material.defaultTierId;
  const defaultSwitchedOff = switchedOffTiers({ material: [DEFAULT_MATERIAL] });

  it("still describes the sheet, offering the remaining options with no delta and nothing selected", () => {
    const offer = offerThroughRoot(defaultSwitchedOff);

    const view = describeGlobalSettings(
      noBookInput({ offer, deepCabinetPercent: 12 }),
    );
    const material = groupNamed(view.groups, "material");

    expect(material.options.map((option) => option.tierId)).not.toContain(
      DEFAULT_MATERIAL,
    );
    expect(material.options.length).toBeGreaterThan(0);
    expect(material.options.every((option) => !option.isSelected)).toBe(true);
    expect(
      material.options.every((option) => option.deltaText === undefined),
    ).toBe(true);
    expect(material.anchor).toBeUndefined();
  });

  it("opens on nothing for a tier the book no longer holds, so applying cannot send an id the command refuses", () => {
    const offer = offerThroughRoot(defaultSwitchedOff);

    const opening = resolveOpeningChoice(
      { materialTierId: "material.withdrawn-from-the-book" },
      offer,
    );

    expect(opening).not.toHaveProperty("materialTierId");
  });

  it("opens on the default for a withdrawn tier while the default is still offered", () => {
    const offer = offerThroughRoot(switchedOffTiers());

    const opening = resolveOpeningChoice(
      { materialTierId: "material.withdrawn-from-the-book" },
      offer,
    );

    expect(opening.materialTierId).toBe(DEFAULT_MATERIAL);
  });
});

describe("the tier the kitchen carries, switched off", () => {
  const CARRIED = "material.veneer";
  const carrying = kitchenCarrying({ materialTierId: CARRIED });
  const carriedSwitchedOff = switchedOffTiers({ material: [CARRIED] });

  it("is not an option of the sheet", () => {
    const offer = offerThroughRoot(carriedSwitchedOff, carrying);

    const view = describeGlobalSettings(
      noBookInput({ offer, deepCabinetPercent: 12 }),
    );

    expect(
      groupNamed(view.groups, "material").options.map(
        (option) => option.tierId,
      ),
    ).not.toContain(CARRIED);
  });

  it("opens as stored, so an untouched Aplica writes nothing", () => {
    const offer = offerThroughRoot(carriedSwitchedOff, carrying);

    const opening = resolveOpeningChoice(carrying.settings ?? {}, offer);

    expect(opening.materialTierId).toBe(CARRIED);
  });

  it("checks no radio of its group, because the tier is not one of the options", () => {
    const offer = offerThroughRoot(carriedSwitchedOff, carrying);
    const applied = carrying.settings ?? {};

    const view = describeGlobalSettings(
      noBookInput({
        offer,
        deepCabinetPercent: 12,
        applied,
        pending: resolveOpeningChoice(applied, offer),
      }),
    );

    expect(
      groupNamed(view.groups, "material").options.filter(
        (option) => option.isSelected,
      ),
    ).toEqual([]);
  });

  it("is still the name the pill shows, because it is still what the kitchen carries", () => {
    const offer = offerThroughRoot(carriedSwitchedOff, carrying);
    const carriedName = SAMPLE_PRICE_BOOK.material.tiers.find(
      (tier) => tier.tierId === CARRIED,
    )?.name;

    const pill = describeSettingsPill({
      offer,
      applied: carrying.settings ?? {},
      content: ro,
    });

    expect(carriedName).toBeDefined();
    expect(pill.settings[0]?.label).toBe(
      ro.globalSettings.pillMaterial(ro.bookText(carriedName ?? "", undefined)),
    );
  });
});
