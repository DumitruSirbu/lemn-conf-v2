// The replacement sheet as values. Rows come from the same domain query the route's `GET` uses,
// run on the design and the page's availability, so a tier switched off and a tier the book no longer holds are both rows;
// a name comes only from a book row the page still holds, and otherwise the generic line says it, never an id.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type Design,
  type ReplacementRequired,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  describeChooser,
  describeConfirmationLines,
  describeReplacementSheet,
  hasReplacementSaveLanded,
  pendingReplacements,
  rememberRows,
  resolveReplacementSheetCopy,
  type SheetVocabulary,
} from "@/price/replacement-sheet-model";

import roMessages from "../../src/messages/ro.json";
import { NOTHING_DISABLED } from "../support/availability";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import {
  HARDWARE_DEFAULT_TIER_ID,
  kitchenCarrying,
  MATERIAL_DEFAULT_TIER_ID,
  offerThroughRoot,
  switchedOffTiers,
  tierName,
} from "../support/tier-offer-world";

const say = createTranslator({ locale: "ro", messages: roMessages });
const copy = resolveReplacementSheetCopy(say);

/** "Material · MDF vopsit mat": a kind and a name, as the body lists an unavailable item. */
function itemPhraseOf(kind: "material" | "hardware", tierId: string): string {
  return say("priceBreakdown.wholeKitchenLabel", {
    categoryWord: say(`priceBreakdown.wholeKitchenCategories.${kind}`),
    tierName: tierName(tierId),
  });
}
const SWITCHED_OFF_MATERIAL = "material.painted-mdf";
const SWITCHED_OFF_HARDWARE = "hardware.premium";
const VANISHED_MATERIAL = "material.created-and-since-deleted";
const DISH_RACK_NAME = ro.bookText(
  SAMPLE_PRICE_BOOK.accessories.dishDryingRack.name,
  SAMPLE_PRICE_BOOK.accessories.dishDryingRack.nameKey,
);

/** The sheet's whole world for one kitchen under one availability, as the editor assembles it. */
function worldOf(
  design: ReturnType<typeof kitchenCarrying>,
  off: Parameters<typeof switchedOffTiers>[0] = {},
) {
  const availability = switchedOffTiers(off);
  const root = { ...SAMPLE_PRICE_ROOT, availability };
  const live = pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG);
  const vocabulary: SheetVocabulary = {
    content: ro,
    copy,
    offer: offerThroughRoot(availability, design),
  };
  return { live, vocabulary };
}

function sheetOf(
  design: ReturnType<typeof kitchenCarrying>,
  off: Parameters<typeof switchedOffTiers>[0] = {},
) {
  const { live, vocabulary } = worldOf(design, off);
  return describeReplacementSheet({
    seen: live,
    live,
    design,
    accessoryNames: [],
    vocabulary,
  });
}

describe("the rows the sheet is owed", () => {
  it("is empty for a kitchen that names nothing switched off or missing", () => {
    expect(worldOf(KITCHEN_L_DESIGN).live).toEqual([]);
  });

  it("holds a row for a tier the kitchen carries that availability has switched off", () => {
    const { live } = worldOf(
      kitchenCarrying({ materialTierId: SWITCHED_OFF_MATERIAL }),
      {
        material: [SWITCHED_OFF_MATERIAL],
      },
    );

    expect(live.map((row) => row.item)).toEqual([
      { kind: "material", tierId: SWITCHED_OFF_MATERIAL },
    ]);
  });

  it("holds a row for a tier the book no longer holds at all (ADR 0178, a deletion that gains a user)", () => {
    const { live } = worldOf(
      kitchenCarrying({ materialTierId: VANISHED_MATERIAL }),
    );

    expect(live.map((row) => row.item)).toEqual([
      { kind: "material", tierId: VANISHED_MATERIAL },
    ]);
  });

  it("goes when availability comes back before any choice: nothing is owed and the price is unchanged", () => {
    const carrying = kitchenCarrying({ materialTierId: SWITCHED_OFF_MATERIAL });

    const whileOff = worldOf(carrying, {
      material: [SWITCHED_OFF_MATERIAL],
    }).live;
    const afterReEnable = worldOf(carrying).live;

    expect(whileOff).toHaveLength(1);
    expect(afterReEnable).toEqual([]);
  });

  it("answers no rows, and does not throw, for a row with nothing to choose instead", () => {
    const everyMaterialOff = switchedOffTiers({
      material: SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.tierId),
    });
    const root = { ...SAMPLE_PRICE_ROOT, availability: everyMaterialOff };

    expect(
      pendingReplacements(root, KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
    ).toEqual([]);
  });
});

describe("naming a row", () => {
  it("names a switched-off tier from the book row the page still holds, and announces it", () => {
    const view = sheetOf(
      kitchenCarrying({ materialTierId: SWITCHED_OFF_MATERIAL }),
      {
        material: [SWITCHED_OFF_MATERIAL],
      },
    );
    const [row] = view.rows;

    expect(row?.valueText).toBe(tierName(SWITCHED_OFF_MATERIAL));
    expect(row?.statusText).toBe(roMessages.replacementSheet.unavailable);
    expect(row?.announcement).toBe(
      say("replacementSheet.unavailableAria", {
        name: tierName(SWITCHED_OFF_MATERIAL),
      }),
    );
    expect(view.body).toBe(
      say("replacementSheet.bodyOne", {
        items: itemPhraseOf("material", SWITCHED_OFF_MATERIAL),
      }),
    );
  });

  it("gives a tier the book no longer holds the generic line, and never its id", () => {
    const view = sheetOf(
      kitchenCarrying({ materialTierId: VANISHED_MATERIAL }),
    );
    const [row] = view.rows;

    expect(row?.valueText).toBe(
      roMessages.replacementSheet.unnamedOptionUnavailable,
    );
    // The kind leads the announcement, so two nameless rows are never announced alike.
    expect(row?.announcement).toBe(
      `${ro.priceBreakdown.wholeKitchenCategories.material}: ${roMessages.replacementSheet.unnamedOptionUnavailable}`,
    );
    expect(row?.statusText).toBe("");
    const everythingShown = [
      view.title,
      view.body,
      view.priceLine,
      view.exitHint,
      ...view.rows.flatMap((one) => [
        one.kindLabel,
        one.valueText,
        one.statusText,
        one.announcement,
        one.itemPhrase,
      ]),
    ].join("\n");
    expect(everythingShown).not.toContain(VANISHED_MATERIAL);
  });

  it("says one sentence for one row and the plural one for two, in the order the domain lists them", () => {
    const view = sheetOf(
      kitchenCarrying({
        materialTierId: SWITCHED_OFF_MATERIAL,
        hardwareTierId: SWITCHED_OFF_HARDWARE,
      }),
      { material: [SWITCHED_OFF_MATERIAL], hardware: [SWITCHED_OFF_HARDWARE] },
    );

    expect(view.rows.map((row) => row.kind)).toEqual(["material", "hardware"]);
    expect(view.body).toBe(
      say("replacementSheet.bodyMany", {
        items: [
          itemPhraseOf("material", SWITCHED_OFF_MATERIAL),
          itemPhraseOf("hardware", SWITCHED_OFF_HARDWARE),
        ].join(say("globalSettings.pillNameJoin")),
      }),
    );
  });

  it("draws an accessory removed with nothing to choose as information, never as a row", () => {
    const { live, vocabulary } = worldOf(
      kitchenCarrying({ materialTierId: SWITCHED_OFF_MATERIAL }),
      { material: [SWITCHED_OFF_MATERIAL] },
    );

    const view = describeReplacementSheet({
      seen: live,
      live,
      design: kitchenCarrying({ materialTierId: SWITCHED_OFF_MATERIAL }),
      accessoryNames: [DISH_RACK_NAME],
      vocabulary,
    });

    expect(view.rows).toHaveLength(1);
    expect(view.infoLines).toEqual([
      say("replacementSheet.accessoryRemoved", { name: DISH_RACK_NAME }),
    ]);
  });
});

describe("a row the customer has resolved", () => {
  it("has no value to show when the kitchen no longer names anything for its kind, instead of an empty text", () => {
    const { vocabulary } = worldOf(KITCHEN_L_DESIGN);
    const handleRow: ReplacementRequired = {
      item: { kind: "handle", handle: "black" },
      remaining: [{ kind: "handle", handle: "steel" }],
    };
    const withNoHandle: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, handle: undefined },
    };

    const view = describeReplacementSheet({
      seen: [handleRow],
      live: [],
      design: withNoHandle,
      accessoryNames: [],
      vocabulary,
    });

    expect(view.rows[0]?.isResolved).toBe(true);
    expect(view.rows[0]?.valueText).toBeUndefined();
  });

  it("stays drawn, as resolved, naming what they chose, and offers the change label and not the choose label", () => {
    const carrying = kitchenCarrying({
      materialTierId: SWITCHED_OFF_MATERIAL,
      hardwareTierId: SWITCHED_OFF_HARDWARE,
    });
    const { live, vocabulary } = worldOf(carrying, {
      material: [SWITCHED_OFF_MATERIAL],
      hardware: [SWITCHED_OFF_HARDWARE],
    });
    const afterChoosingMaterial = kitchenCarrying({
      materialTierId: MATERIAL_DEFAULT_TIER_ID,
      hardwareTierId: SWITCHED_OFF_HARDWARE,
    });
    const stillOwed = live.filter((row) => row.item.kind === "hardware");

    const view = describeReplacementSheet({
      seen: live,
      live: stillOwed,
      design: afterChoosingMaterial,
      accessoryNames: [],
      vocabulary,
    });

    expect(view.rows.map((row) => row.isResolved)).toEqual([true, false]);
    expect(view.rows[0]?.valueText).toBe(tierName(MATERIAL_DEFAULT_TIER_ID));
    expect(view.rows[0]?.announcement).toBe(
      say("replacementSheet.unavailableAria", {
        name: tierName(SWITCHED_OFF_MATERIAL),
      }),
    );
    expect(view.changeLabel).toBe(roMessages.replacementSheet.change);
    expect(view.chooseLabel).toBe(roMessages.replacementSheet.choose);
    expect(view.body).toContain(
      itemPhraseOf("material", SWITCHED_OFF_MATERIAL),
    );
  });

  it("is remembered once, as first seen, and a later list adds only what is new", () => {
    const { live } = worldOf(
      kitchenCarrying({
        materialTierId: SWITCHED_OFF_MATERIAL,
        hardwareTierId: SWITCHED_OFF_HARDWARE,
      }),
      { material: [SWITCHED_OFF_MATERIAL], hardware: [SWITCHED_OFF_HARDWARE] },
    );
    const [first] = live;
    const nothingYet: readonly ReplacementRequired[] = [];

    const seen = rememberRows(nothingYet, live);

    expect(seen).toHaveLength(2);
    expect(rememberRows(seen, live)).toBe(seen);
    expect(rememberRows(seen, first === undefined ? [] : [first])).toBe(seen);
  });
});

describe("the chooser", () => {
  function chooserFor(off: { material?: string[] }, carries: string) {
    const design = kitchenCarrying({ materialTierId: carries });
    const { live, vocabulary } = worldOf(design, off);
    const [row] = live;
    if (row === undefined) throw new Error("no row to choose for");
    return describeChooser({
      row,
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      vocabulary,
    });
  }

  it("offers only the options that remain, and the kitchen's own switched-off tier struck and last", () => {
    const chooser = chooserFor(
      { material: [SWITCHED_OFF_MATERIAL] },
      SWITCHED_OFF_MATERIAL,
    );

    expect(chooser?.options.map((option) => option.tierId)).toEqual([
      "material.melamine",
      "material.veneer",
      SWITCHED_OFF_MATERIAL,
    ]);
    expect(chooser?.options.filter((option) => option.isStruck)).toEqual([
      expect.objectContaining({
        tierId: SWITCHED_OFF_MATERIAL,
        name: tierName(SWITCHED_OFF_MATERIAL),
      }),
    ]);
    expect(chooser?.struckNote).toBe(
      roMessages.replacementSheet.strikethroughNote,
    );
  });

  it("offers a vanished tier the group's active tiers and strikes nothing: the book has no name for it", () => {
    const chooser = chooserFor({}, VANISHED_MATERIAL);

    expect(chooser?.options.map((option) => option.tierId)).toEqual(
      SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.tierId),
    );
    expect(chooser?.options.some((option) => option.isStruck)).toBe(false);
  });

  it("states no figure: the design cannot be priced until the choice is made", () => {
    const chooser = chooserFor(
      { material: [SWITCHED_OFF_MATERIAL] },
      SWITCHED_OFF_MATERIAL,
    );

    expect(JSON.stringify(chooser)).not.toMatch(/\d\s?(MDL|%)|\+\d/);
    expect(chooser?.priceLine).toBe(
      roMessages.replacementSheet.priceAfterApplying,
    );
  });

  it("answers the group's own heading and how many bodies the choice reaches", () => {
    const chooser = chooserFor(
      { material: [SWITCHED_OFF_MATERIAL] },
      SWITCHED_OFF_MATERIAL,
    );

    expect(chooser?.heading).toBe(
      roMessages.globalSettings.groupHeadings.material,
    );
    // The sample kitchen draws its 26 placements, one entry each, whatever the choice is.
    expect(chooser?.appliesTo).toBe(
      say("replacementSheet.chooserAppliesTo", { bodyCount: 26 }),
    );
  });

  it("is not drawn for a colour or a handle: choosing those is not offered", () => {
    const view = describeChooser({
      row: {
        item: { kind: "handle", handle: "steel" },
        remaining: [{ kind: "handle", handle: "black" }],
      },
      design: KITCHEN_L_DESIGN,
      catalog: KITCHEN_L_BODY_CATALOG,
      vocabulary: worldOf(KITCHEN_L_DESIGN).vocabulary,
    });

    expect(view).toBeUndefined();
  });
});

describe("whether the last choice's save has landed", () => {
  const cases = [
    {
      revisionAtChoice: "3",
      revision: "3",
      isEverythingSaved: true,
      landed: false,
    },
    {
      revisionAtChoice: "3",
      revision: "4",
      isEverythingSaved: false,
      landed: false,
    },
    {
      revisionAtChoice: "3",
      revision: "4",
      isEverythingSaved: true,
      landed: true,
    },
    {
      revisionAtChoice: null,
      revision: "1",
      isEverythingSaved: true,
      landed: true,
    },
    {
      revisionAtChoice: "3",
      revision: "3",
      isEverythingSaved: false,
      landed: false,
    },
  ];

  it.each(cases)(
    "answers $landed for revision $revisionAtChoice -> $revision with everything saved: $isEverythingSaved",
    ({ landed, ...state }) => {
      expect(hasReplacementSaveLanded(state)).toBe(landed);
    },
  );
});

describe("the confirmation", () => {
  const name = tierName(MATERIAL_DEFAULT_TIER_ID);
  const changes = [{ kind: "material" as const, name }];
  const changedSentence = say("replacementSheet.changedMaterial", { name });

  it("says what changed, and adds the prices sentence only when the second answer said so", () => {
    expect(
      describeConfirmationLines({ changes, alsoUpdated: false, copy }),
    ).toEqual([changedSentence]);
    expect(
      describeConfirmationLines({ changes, alsoUpdated: true, copy }),
    ).toEqual([changedSentence, roMessages.customerPriceNotice.alsoUpdated]);
  });

  it("names a hardware change with its own sentence", () => {
    const hardwareName = tierName(HARDWARE_DEFAULT_TIER_ID);

    expect(
      describeConfirmationLines({
        changes: [{ kind: "hardware", name: hardwareName }],
        alsoUpdated: false,
        copy,
      }),
    ).toEqual([
      say("replacementSheet.changedHardware", { name: hardwareName }),
    ]);
  });
});

describe("the defaults the tests above rely on", () => {
  it("name tiers the sample book holds, so no case is vacuous", () => {
    expect(
      SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.tierId),
    ).toContain(SWITCHED_OFF_MATERIAL);
    expect(
      SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => tier.tierId),
    ).toContain(SWITCHED_OFF_HARDWARE);
    expect(MATERIAL_DEFAULT_TIER_ID).not.toBe(SWITCHED_OFF_MATERIAL);
    expect(HARDWARE_DEFAULT_TIER_ID).not.toBe(SWITCHED_OFF_HARDWARE);
    expect(NOTHING_DISABLED.disabled).toEqual([]);
  });
});
