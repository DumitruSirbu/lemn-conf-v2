// **Adversarial QA for wave 6B-f2: the four surfaces, in both locales.**
//
// The wave's own two files — `price-book-text.test.ts` and `palette-names.test.ts` — sweep
// `content.bookText` and `content.finishName` in isolation and prove the *resolvers* total. They
// do not touch a surface. Verified by mutation: reverting `resolvedTierName` to `tier.name`,
// `toGroupView`'s description to `tier.description` and `toUnplacedRow`'s label to `line.name` left
// **all 2 275 web tests green**, and a `/ru` customer back to reading Romanian on the settings sheet,
// on ADR 0104's pill and in the price breakdown — which is the exact defect the wave exists to fix.
//
// This is 6B-f's failure repeated one layer up: there, kind resolution was asserted by a membership
// check and two live defects passed. So every claim below is read off a **described surface** under a
// **Russian** translator, and the expected value is read out of `ru.json` rather than out of
// `content.bookText` — mirroring production's own call is what makes a wiring test vacuous.
//
// Russian *wording* is never asserted here. Gate O2 owns that. What is asserted is that the surface
// reaches the Russian leaf at all, and that the two brand rows reach neither locale's catalogue.
import {
  countCabinetsWearingAChosenFinish,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  materialById,
  paletteEntriesOf,
  paletteFinish,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type AccessoryRule,
  type DisplayGroup,
  type PricingResult,
  type TierIdentity,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { Content } from "@/i18n/content";
import { describePanel } from "@/panel/panel-model";
import { describePriceBreakdown } from "@/price/price-breakdown-model";
import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  describeSettingsPill,
  type GlobalSettingsView,
} from "@/settings/global-settings-model";

import roMessages from "@/messages/ro.json";
import ruMessages from "@/messages/ru.json";

import {
  CATALOGUES,
  contentFor,
  requireLeafAt,
  type Catalogue,
} from "../support/catalogues";
import { PAL_KITCHEN } from "../support/panel-material";
import { swatchSectionOf } from "../support/panel-sections";
import { occupiedMeta } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";

/** What a row's text must read on screen: the catalogue's word where the row names a leaf, and the
 *  book's own word where it names none (ADR 0106 decision 2). `requireLeafAt` rather than `leafAt`
 *  on purpose — a key with no leaf is this file's own fixture rotting, not a claim under test. */
function expectedText(
  messages: Catalogue,
  authored: string,
  key: string | undefined,
): string {
  return key === undefined ? authored : requireLeafAt(messages, key);
}

const EVERY_TIER: readonly TierIdentity[] = [
  ...SAMPLE_PRICE_BOOK.hardware.tiers,
  ...SAMPLE_PRICE_BOOK.material.tiers,
];

const EVERY_ACCESSORY: readonly AccessoryRule[] = Object.values(
  SAMPLE_PRICE_BOOK.accessories,
);

function tierNamed(tierId: string): TierIdentity {
  const tier = EVERY_TIER.find((one) => one.tierId === tierId);
  if (!tier) throw new Error(`the book declares no ${tierId}`);
  return tier;
}

/** Every Romanian text a keyed row was authored with. Under `ru` **none of these may reach a
 *  surface**: a row that names a leaf renders that leaf, and a surface printing the book's own field
 *  instead is the wave un-wired. */
const AUTHORED_ROMANIAN_OF_KEYED_ROWS: readonly string[] = [
  ...EVERY_TIER,
  ...EVERY_ACCESSORY,
].flatMap((row) => [
  ...(row.nameKey === undefined ? [] : [row.name]),
  ...(row.descriptionKey === undefined ? [] : [row.description]),
]);

const SHIPPED_GROUPS: readonly DisplayGroup[] = projectDesignForDisplay(
  KITCHEN_L_DESIGN,
  KITCHEN_L_BODY_CATALOG,
);

const SHIPPED_PRICING: PricingResult = priceDesign({
  design: KITCHEN_L_DESIGN,
  catalog: KITCHEN_L_BODY_CATALOG,
  book: SAMPLE_PRICE_BOOK,
  pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
});

const SHIPPED_OFFER: WholeKitchenTierOffer = offerWholeKitchenTiers({
  design: KITCHEN_L_DESIGN,
  catalog: KITCHEN_L_BODY_CATALOG,
  book: SAMPLE_PRICE_BOOK,
  pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  selections: KITCHEN_L_DESIGN.settings,
});

function settingsViewIn(content: Content): GlobalSettingsView {
  return describeGlobalSettings({
    content,
    pricing: SHIPPED_PRICING,
    offer: SHIPPED_OFFER,
    groups: SHIPPED_GROUPS,
    applied: {},
    pending: {},
    chosenColourCount: countCabinetsWearingAChosenFinish(KITCHEN_L_DESIGN),
  });
}

function breakdownRowLabelsIn(content: Content): readonly string[] {
  const view = describePriceBreakdown({
    content,
    pricing: SHIPPED_PRICING,
    groups: SHIPPED_GROUPS,
  });
  if (view.kind !== "available") throw new Error("the seeded design priced");
  return view.wholeKitchenRows.map((row) => row.label);
}

function finishChipLabelsIn(content: Content): readonly string[] {
  const meta = occupiedMeta();
  const panel = describePanel({
    content,
    material: PAL_KITCHEN,
    meta,
    offers: [],
    rejection: null,
    widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
  if (panel.kind !== "open") throw new Error("expected an open panel");
  return swatchSectionOf(panel.sections).chips.map((chip) => chip.label);
}

describe("the settings sheet says every book row in the customer's language", () => {
  it.each(CATALOGUES)(
    "names and describes every tier in %s",
    (locale, messages) => {
      const view = settingsViewIn(contentFor(locale, messages));
      const options = view.groups.flatMap((group) => group.options);

      expect(options.length).toBe(EVERY_TIER.length);
      for (const option of options) {
        const tier = tierNamed(option.tierId);
        expect(option.name, `${locale}:${option.tierId}.name`).toBe(
          expectedText(messages, tier.name, tier.nameKey),
        );
        expect(
          option.description,
          `${locale}:${option.tierId}.description`,
        ).toBe(expectedText(messages, tier.description, tier.descriptionKey));
      }
    },
  );

  it("leaves no Romanian on a keyed row's Russian sheet", () => {
    const view = settingsViewIn(contentFor("ru", ruMessages as Catalogue));
    const rendered = view.groups
      .flatMap((group) => group.options)
      .flatMap((option) => [option.name, option.description]);

    expect(AUTHORED_ROMANIAN_OF_KEYED_ROWS.length).toBe(14);
    for (const romanian of AUTHORED_ROMANIAN_OF_KEYED_ROWS) {
      expect(rendered, romanian).not.toContain(romanian);
    }
  });

  it.each(CATALOGUES)(
    "spells a brand the same way in %s",
    (locale, messages) => {
      // The ruling, held at the surface rather than at the book: *Hettich* and *Blum* name no
      // `nameKey`, so a locale cannot translate them and a later wave cannot key them without this
      // failing.
      const options = settingsViewIn(
        contentFor(locale, messages),
      ).groups.flatMap((group) => group.options);
      const brands = options.filter((option) =>
        ["hardware.soft-close", "hardware.premium"].includes(option.tierId),
      );

      expect(brands.map((option) => option.name)).toEqual(["Hettich", "Blum"]);
    },
  );
});

describe("ADR 0104's pill says the same words the sheet does", () => {
  it.each(CATALOGUES)("names the applied tiers in %s", (locale, messages) => {
    const content = contentFor(locale, messages);
    const pill = describeSettingsPill({
      offer: SHIPPED_OFFER,
      applied: {},
      content,
    });
    const material = tierNamed(SAMPLE_PRICE_BOOK.material.defaultTierId);
    const hardware = tierNamed(SAMPLE_PRICE_BOOK.hardware.defaultTierId);

    const labelled = (key: string): string => {
      const entry = pill.settings.find((one) => one.key === key);
      if (!entry) throw new Error(`the pill drew no ${key} segment`);
      return entry.label;
    };

    expect(labelled("material"), `${locale}:material`).toContain(
      expectedText(messages, material.name, material.nameKey),
    );
    expect(labelled("hardware"), `${locale}:hardware`).toContain(
      expectedText(messages, hardware.name, hardware.nameKey),
    );
    expect(pill.accessibleName, `${locale}:accessibleName`).toContain(
      expectedText(messages, material.name, material.nameKey),
    );
  });

  it("keeps the Romanian tier names off the Russian pill", () => {
    const pill = describeSettingsPill({
      offer: SHIPPED_OFFER,
      applied: {},
      content: contentFor("ru", ruMessages as Catalogue),
    });
    const spoken = [
      ...pill.settings.map((entry) => entry.label),
      pill.accessibleName,
    ].join("\n");

    for (const romanian of AUTHORED_ROMANIAN_OF_KEYED_ROWS) {
      expect(spoken, romanian).not.toContain(romanian);
    }
  });

  it.each(CATALOGUES)(
    "names the applied palette colour from the %s catalogue",
    (locale, messages) => {
      const applied = { finish: paletteFinish("pal.nuc-warmia") };
      const pill = describeSettingsPill({
        offer: SHIPPED_OFFER,
        applied,
        content: contentFor(locale, messages),
      });
      const colour = pill.settings.find((entry) => entry.key === "colour");

      expect(colour?.label, locale).toBe(
        requireLeafAt(messages, "finish.pal.nuc-warmia"),
      );
      expect(pill.accessibleName, locale).toContain(
        requireLeafAt(messages, "finish.pal.nuc-warmia"),
      );
    },
  );
});

describe("the price breakdown's whole-kitchen rows follow the same catalogue", () => {
  it.each(CATALOGUES)("labels every unplaced row in %s", (locale, messages) => {
    const rows = breakdownRowLabelsIn(contentFor(locale, messages));
    const labels = rows.join("\n");
    const priced = [
      tierNamed(SAMPLE_PRICE_BOOK.material.defaultTierId),
      tierNamed(SAMPLE_PRICE_BOOK.hardware.defaultTierId),
    ];

    // Vacuity guard: the seeded kitchen has a sink, so this section holds the two tiers *and* at
    // least one accessory. An empty list would make every claim below pass saying nothing.
    expect(rows.length, locale).toBeGreaterThan(2);
    for (const row of [...priced, ...billedAccessories()]) {
      expect(labels, `${locale}:${row.ruleId}`).toContain(
        expectedText(messages, row.name, row.nameKey),
      );
    }
  });

  it("keeps the Romanian book words off the Russian breakdown", () => {
    const labels = breakdownRowLabelsIn(
      contentFor("ru", ruMessages as Catalogue),
    ).join("\n");

    for (const romanian of AUTHORED_ROMANIAN_OF_KEYED_ROWS) {
      expect(labels, romanian).not.toContain(romanian);
    }
  });
});

/** The accessories the seeded kitchen actually earns, found by their Romanian rendering — every one
 *  of which must then appear in Russian on the same design. */
function billedAccessories(): readonly AccessoryRule[] {
  const roLabels = breakdownRowLabelsIn(contentFor("ro", roMessages)).join(
    "\n",
  );
  const billed = EVERY_ACCESSORY.filter((accessory) =>
    roLabels.includes(accessory.name),
  );
  if (billed.length === 0) throw new Error("the seeded kitchen billed nothing");
  return billed;
}

describe("the panel's finish chips read the catalogue too", () => {
  it.each(CATALOGUES)(
    "labels every chip from the %s leaves",
    (locale, messages) => {
      const labels = finishChipLabelsIn(contentFor(locale, messages));
      const entries = paletteEntriesOf(materialById("material.melamine"));

      expect(labels.length).toBe(entries.length);
      expect(labels).toEqual(
        entries.map((entry) =>
          requireLeafAt(messages, `finish.${entry.entryId}`),
        ),
      );
    },
  );

  it("puts no Romanian decor name on a Russian chip", () => {
    const russian = finishChipLabelsIn(
      contentFor("ru", ruMessages as Catalogue),
    );
    const romanian = paletteEntriesOf(materialById("material.melamine")).map(
      (entry) => requireLeafAt(roMessages, `finish.${entry.entryId}`),
    );

    for (const [index, label] of russian.entries()) {
      expect(label, String(index)).not.toBe(romanian[index]);
    }
  });
});
