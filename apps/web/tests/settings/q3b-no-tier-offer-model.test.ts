// M10 Q3b, R-b: the settings sheet's model with no tier offer (no active price book), and with a default switched off.
//
// With no book the material and hardware groups are one line each, with no option, delta, anchor or default marked; the
// depth, colour and handle controls keep working; nothing renders a zero. Every string is read from its catalogue leaf.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  tierRef,
  type CatalogueAvailability,
  type Design,
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
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { ro } from "../support/romanian-content";

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

function offerUnder(availability: CatalogueAvailability, design: Design) {
  return offerTiersAgainstBook(
    { ...SAMPLE_PRICE_ROOT, availability },
    design,
    KITCHEN_L_BODY_CATALOG,
  );
}

function withSettings(settings: NonNullable<Design["settings"]>): Design {
  return { ...KITCHEN_L_DESIGN, settings };
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

  it("draws at the pill's floor what the kitchen's nameless free colour leaves it: a counter, never a zero", () => {
    const pill = describeSettingsPill({
      offer: NO_TIER_OFFER,
      applied: { materialTierId: "material.painted-mdf" },
      content: ro,
    });

    const floor = describePillRung(pill, 1);

    expect(pill.settings[0]).toEqual({ key: "colour", label: "" });
    expect(floor.counter).toBe("+1");
    expect(JSON.stringify(floor)).not.toMatch(/\b0\b/u);
  });
});

describe("the settings sheet while a default is switched off", () => {
  const DEFAULT_MATERIAL = SAMPLE_PRICE_BOOK.material.defaultTierId;
  const defaultSwitchedOff: CatalogueAvailability = {
    revision: "1",
    disabled: [tierRef("material", DEFAULT_MATERIAL)],
  };

  it("still describes the sheet, offering the remaining options with no delta and nothing selected", () => {
    const offer = offerUnder(defaultSwitchedOff, KITCHEN_L_DESIGN);

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

  it("opens on nothing for a tier the sheet cannot offer, so applying cannot send an id the command refuses", () => {
    const offer = offerUnder(defaultSwitchedOff, KITCHEN_L_DESIGN);

    const opening = resolveOpeningChoice(
      { materialTierId: "material.withdrawn-from-the-book" },
      offer,
    );

    expect(opening).not.toHaveProperty("materialTierId");
  });

  it("opens on the default for a withdrawn tier while the default is still offered", () => {
    const offer = offerUnder({ revision: "0", disabled: [] }, KITCHEN_L_DESIGN);

    const opening = resolveOpeningChoice(
      { materialTierId: "material.withdrawn-from-the-book" },
      offer,
    );

    expect(opening.materialTierId).toBe(DEFAULT_MATERIAL);
  });
});

describe("the tier the kitchen carries, switched off", () => {
  const CARRIED = "material.veneer";
  const carrying = withSettings({ materialTierId: CARRIED });
  const carriedSwitchedOff: CatalogueAvailability = {
    revision: "1",
    disabled: [tierRef("material", CARRIED)],
  };

  it("is not an option of the sheet, and opens as the default the sheet does offer", () => {
    const offer = offerUnder(carriedSwitchedOff, carrying);

    const view = describeGlobalSettings(
      noBookInput({ offer, deepCabinetPercent: 12 }),
    );
    const opening = resolveOpeningChoice(carrying.settings ?? {}, offer);

    expect(
      groupNamed(view.groups, "material").options.map(
        (option) => option.tierId,
      ),
    ).not.toContain(CARRIED);
    expect(opening.materialTierId).toBe(
      SAMPLE_PRICE_BOOK.material.defaultTierId,
    );
  });

  it("is still the name the pill shows, because it is still what the kitchen carries", () => {
    const offer = offerUnder(carriedSwitchedOff, carrying);
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
