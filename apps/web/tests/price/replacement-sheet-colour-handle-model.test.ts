// The sheet's colour and handle rows as values: when a colour waits, what its chooser offers, what a resolved row says (a
// colour the material's reset cleared says nothing), the one note said while a material is owed, and how the confirmation
// words several changes, one line per item, with no line for a reset.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  HandleSchema,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  setMaterialTier,
  type Design,
  type ItemRef,
  type PaletteEntryId,
  type ReplacementRequired,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  appearanceReplacementOf,
  describeConfirmationLines,
  describeReplacementSheet,
  describeRowChooser,
  replacedItemKey,
  resolveReplacementSheetCopy,
  type AppearanceChooserView,
} from "@/price/replacement-sheet-model";

import roMessages from "../../src/messages/ro.json";
import { ro } from "../support/romanian-content";
import {
  BLACK_OFF,
  ANTHRACITE,
  OCCURRED_AT,
  VENEER_OAK,
  VENEER_OAK_OFF,
  VENEER_OFF,
  WHITE,
  WHITE_OFF,
  kitchenWith,
} from "../support/replacement-kitchens";
import {
  full,
  PRICE_SENTENCE,
  stem,
} from "../support/replacement-confirmation-lines";
import {
  romanianSheetCopy as copy,
  viewOf,
  worldOf,
} from "../support/replacement-sheet-view-world";
import {
  HARDWARE_TIER_IDS,
  kitchenCarrying,
  MATERIAL_TIER_IDS,
  tierName,
} from "../support/tier-offer-world";

const say = createTranslator({ locale: "ro", messages: roMessages });

const VENEER_KITCHEN = kitchenWith({
  materialTierId: "material.veneer",
  finish: VENEER_OAK,
  handle: "black",
});

describe("a colour row beside a material row", () => {
  it("waits for the material, since the material's change would discard a colour chosen first", () => {
    const view = viewOf(VENEER_KITCHEN, [VENEER_OFF, VENEER_OAK_OFF]);

    const [material, colour] = view.rows;
    expect(material).toMatchObject({
      kind: "material",
      isChoosable: true,
      isWaiting: false,
    });
    expect(colour).toMatchObject({
      kind: "finish",
      isChoosable: false,
      isWaiting: true,
    });
  });

  it("does not make a handle row wait: a material's change touches no handle", () => {
    const view = viewOf(VENEER_KITCHEN, [VENEER_OFF, BLACK_OFF]);

    const handle = view.rows.find((row) => row.kind === "handle");
    expect(handle).toMatchObject({ isChoosable: true, isWaiting: false });
  });

  it("is choosable once no material is owed", () => {
    const view = viewOf(kitchenWith({ finish: WHITE }), [WHITE_OFF]);

    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({
      kind: "finish",
      isChoosable: true,
      isWaiting: false,
    });
  });
});

describe("a resolved row", () => {
  it("says nothing for a colour row the material's reset cleared: resolved, no control, and no colour named in its place", () => {
    const owed = worldOf(VENEER_KITCHEN, [VENEER_OFF, VENEER_OAK_OFF]).live;
    const afterMaterial = setMaterialTier({
      design: VENEER_KITCHEN,
      tierId: "material.melamine",
      availableTierIds: MATERIAL_TIER_IDS,
      occurredAt: OCCURRED_AT,
    });
    if (!afterMaterial.ok) throw new Error("the material change was refused");
    const { vocabulary, live } = worldOf(afterMaterial.design, [
      VENEER_OFF,
      VENEER_OAK_OFF,
    ]);

    const view = describeReplacementSheet({
      seen: owed,
      live,
      design: afterMaterial.design,
      accessoryNames: [],
      vocabulary,
    });

    const colour = view.rows.find((row) => row.kind === "finish");
    expect(colour).toMatchObject({ isResolved: true, isChoosable: false });
    expect(colour?.valueText).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(ro.finishName("pal.alb"));
  });

  it("says nothing for a colour row the material's reset cleared, whichever level held the colour (a cabinet's own)", () => {
    const [first, ...others] = KITCHEN_L_DESIGN.placements;
    if (first === undefined) throw new Error("no cabinets");
    const cabinetOnly: Design = {
      ...kitchenWith({ materialTierId: "material.veneer" }),
      placements: [
        { ...first, body: { ...first.body, finish: VENEER_OAK } },
        ...others,
      ],
    };
    const owed = worldOf(cabinetOnly, [VENEER_OFF, VENEER_OAK_OFF]).live;
    const afterMaterial = setMaterialTier({
      design: cabinetOnly,
      tierId: "material.melamine",
      availableTierIds: MATERIAL_TIER_IDS,
      occurredAt: OCCURRED_AT,
    });
    if (!afterMaterial.ok) throw new Error("the material change was refused");
    const { vocabulary, live } = worldOf(afterMaterial.design, [
      VENEER_OFF,
      VENEER_OAK_OFF,
    ]);

    const view = describeReplacementSheet({
      seen: owed,
      live,
      design: afterMaterial.design,
      accessoryNames: [],
      vocabulary,
    });

    expect(
      view.rows.find((row) => row.kind === "finish")?.valueText,
    ).toBeUndefined();
  });

  it("names the replacement the customer chose, not the kitchen's own colour, when a cabinet's colour was replaced", () => {
    const design: Design = {
      ...kitchenWith({ finish: WHITE }),
      placements: KITCHEN_L_DESIGN.placements.map((placement, index) =>
        index === 0
          ? { ...placement, body: { ...placement.body, finish: ANTHRACITE } }
          : placement,
      ),
    };
    const owed = worldOf(design, [
      { kind: "finish", finishId: "pal.antracit" },
    ]).live;
    const key = replacedItemKey({ kind: "finish", finishId: "pal.antracit" });

    const { vocabulary } = worldOf(design, []);
    const view = describeReplacementSheet({
      seen: owed,
      live: [],
      design,
      accessoryNames: [],
      vocabulary,
      chosenNames: new Map([[key, ro.finishName("pal.nuc-warmia")]]),
    });

    expect(view.rows[0]?.valueText).toBe(ro.finishName("pal.nuc-warmia"));
  });

  it("carries no control for a colour or handle, and no control to change a material once a colour was chosen", () => {
    const owed = worldOf(VENEER_KITCHEN, [
      VENEER_OFF,
      VENEER_OAK_OFF,
      BLACK_OFF,
    ]).live;
    const { vocabulary } = worldOf(VENEER_KITCHEN, []);
    const describeWith = (chosenNames: ReadonlyMap<string, string>) =>
      describeReplacementSheet({
        seen: owed,
        live: [],
        design: VENEER_KITCHEN,
        accessoryNames: [],
        vocabulary,
        chosenNames,
      });

    const beforeAnyColour = describeWith(new Map());
    const afterAColour = describeWith(
      new Map([[replacedItemKey(VENEER_OAK_OFF), "Alb"]]),
    );

    const controls = (view: typeof beforeAnyColour) =>
      Object.fromEntries(view.rows.map((row) => [row.kind, row.isChoosable]));
    expect(controls(beforeAnyColour)).toEqual({
      material: true,
      finish: false,
      handle: false,
    });
    expect(controls(afterAColour)).toEqual({
      material: false,
      finish: false,
      handle: false,
    });
  });
});

describe("rows of a vanished tier", () => {
  it("are announced by their kind, so two such rows never carry the same label", () => {
    const design = kitchenCarrying({
      materialTierId: "material.created-and-since-deleted",
      hardwareTierId: "hardware.created-and-since-deleted",
    });

    const [material, hardware] = viewOf(design, []).rows;

    expect(material?.announcement).toContain(
      ro.priceBreakdown.wholeKitchenCategories.material,
    );
    expect(hardware?.announcement).toContain(
      ro.priceBreakdown.wholeKitchenCategories.hardware,
    );
    expect(material?.announcement).not.toBe(hardware?.announcement);
    expect(material?.announcement).toContain(
      roMessages.replacementSheet.unnamedOptionUnavailable,
    );
  });
});

describe("the colour and handle choosers", () => {
  function chooserOf(
    design: Design,
    disabled: readonly ItemRef[],
    kind: ItemRef["kind"],
  ) {
    const { live, vocabulary } = worldOf(design, disabled);
    const row = live.find((candidate) => candidate.item.kind === kind);
    if (row === undefined) throw new Error(`no ${kind} row is owed`);
    const chooser = describeRowChooser({
      row,
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      vocabulary,
    });
    if (chooser === undefined || !("optionId" in (chooser.options[0] ?? {}))) {
      throw new Error("the row opened no colour or handle chooser");
    }
    return { row, chooser: chooser as AppearanceChooserView };
  }

  it("offers a colour's remaining options in the domain's order, its swatch, and the kitchen's own colour struck", () => {
    const { row, chooser } = chooserOf(
      kitchenWith({ finish: WHITE }),
      [WHITE_OFF],
      "finish",
    );

    const offered = chooser.options.filter((option) => !option.isStruck);
    expect(offered.map((option) => option.item)).toEqual(row.remaining);
    expect(chooser.options.at(-1)).toMatchObject({
      optionId: "pal.alb",
      isStruck: true,
    });
    expect(chooser.heading).toBe(ro.globalSettings.colourHeading);
    expect(offered.every((option) => option.swatch !== undefined)).toBe(true);
    expect(offered.map((option) => option.name)).toEqual(
      row.remaining.map((option) =>
        ro.finishName((option as { finishId: PaletteEntryId }).finishId),
      ),
    );
  });

  it("offers a handle's remaining options, named as the app names a handle, and says no count of cabinets", () => {
    const { chooser } = chooserOf(
      kitchenWith({ handle: "black" }),
      [BLACK_OFF],
      "handle",
    );

    expect(
      chooser.options.map((option) => [option.optionId, option.isStruck]),
    ).toEqual([
      ["steel", false],
      ["push", false],
      ["black", true],
    ]);
    expect(chooser.options[0]?.name).toBe(ro.panel.handleLabels.steel);
    expect(chooser.heading).toBe(ro.globalSettings.kitchenHandleHeading);
    expect("appliesTo" in chooser).toBe(false);
  });

  it("never offers a colour the availability switches off", () => {
    const { chooser } = chooserOf(
      kitchenWith({ finish: WHITE }),
      [WHITE_OFF, { kind: "finish", finishId: "pal.antracit" }],
      "finish",
    );

    const offeredIds = chooser.options
      .filter((option) => !option.isStruck)
      .map((option) => option.optionId);
    expect(offeredIds).not.toContain("pal.antracit");
    expect(offeredIds).not.toContain("pal.alb");
  });

  it("turns a pick into the replacement of the row's item by the picked one, and nothing for a tier option", () => {
    const { row, chooser } = chooserOf(
      kitchenWith({ handle: "black" }),
      [BLACK_OFF],
      "handle",
    );
    const [steel] = chooser.options;
    if (steel === undefined) throw new Error("no option");

    expect(appearanceReplacementOf(row, steel)).toEqual({
      kind: "handle",
      from: "black",
      to: "steel",
    });
    const tierRow: ReplacementRequired = { item: VENEER_OFF, remaining: [] };
    expect(appearanceReplacementOf(tierRow, steel)).toBeUndefined();
  });
});

describe("the note that a material's colours go with it", () => {
  const NOTE = roMessages.replacementSheet.materialAndColoursUnavailable;

  it("says the leaf's own words, for a named switched-off material with a colour waiting behind it", () => {
    const view = viewOf(VENEER_KITCHEN, [VENEER_OFF, VENEER_OAK_OFF]);

    expect(view.materialNote).toBe(NOTE);
    expect(view.rows.some((row) => row.isWaiting)).toBe(true);
  });

  it("says it for a material owed alone, with no colour row beside it", () => {
    expect(viewOf(VENEER_KITCHEN, [VENEER_OFF]).materialNote).toBe(NOTE);
  });

  it("says it for a vanished material no code names, whose row has no status text of its own", () => {
    const design = kitchenCarrying({
      materialTierId: "material.created-and-since-deleted",
    });

    const view = viewOf(design, []);

    expect(view.rows.map((row) => row.kind)).toEqual(["material"]);
    expect(view.materialNote).toBe(NOTE);
  });

  it("says it for a kitchen that stores no colour at all: the sentence does not depend on a colour being stored", () => {
    const view = viewOf(kitchenWith({ materialTierId: "material.veneer" }), [
      VENEER_OFF,
    ]);

    expect(view.materialNote).toBe(NOTE);
  });

  it.each([
    ["a lone colour", kitchenWith({ finish: WHITE }), [WHITE_OFF]],
    ["a lone handle", kitchenWith({ handle: "black" }), [BLACK_OFF]],
    [
      "a lone hardware tier",
      kitchenWith({ hardwareTierId: "hardware.premium" }),
      [{ kind: "hardware", tierId: "hardware.premium" } as ItemRef],
    ],
    [
      "a colour and a handle",
      kitchenWith({ finish: WHITE, handle: "black" }),
      [WHITE_OFF, BLACK_OFF],
    ],
  ])("says nothing for %s", (_name, design, disabled) => {
    const view = viewOf(design, disabled);

    expect(view.rows.length).toBeGreaterThan(0);
    expect(view.materialNote).toBeUndefined();
  });

  it("says nothing for an accessory removed with nothing to choose instead", () => {
    const rack: ItemRef = { kind: "accessory", accessoryId: "dishDryingRack" };

    const view = viewOf(kitchenWith({}), [rack]);

    expect(view.materialNote).toBeUndefined();
  });

  it("goes once the material row resolves while other rows remain, and is not brought back by a colour chosen", () => {
    const owed = worldOf(VENEER_KITCHEN, [
      VENEER_OFF,
      VENEER_OAK_OFF,
      BLACK_OFF,
    ]).live;
    const { vocabulary } = worldOf(VENEER_KITCHEN, []);
    const stillOwed = owed.filter((row) => row.item.kind === "handle");
    const describeWith = (live: typeof owed) =>
      describeReplacementSheet({
        seen: owed,
        live,
        design: VENEER_KITCHEN,
        accessoryNames: [],
        vocabulary,
      });

    expect(describeWith(owed).materialNote).toBe(NOTE);
    expect(describeWith(stillOwed).materialNote).toBeUndefined();
    expect(describeWith([]).materialNote).toBeUndefined();
  });

  it("is a static sentence: it names neither the material nor any colour", () => {
    const view = viewOf(VENEER_KITCHEN, [VENEER_OFF, VENEER_OAK_OFF]);

    expect(view.materialNote).not.toContain(tierName("material.veneer"));
    expect(view.materialNote).not.toContain(ro.finishName("pal.alb"));
    expect(view.materialNote).not.toMatch(/\d/);
  });
});

describe("the confirmation's lines", () => {
  const change = (
    kind: "material" | "hardware" | "finish" | "handle",
    name: string,
  ) => ({ kind, name });

  it("says one change in its leaf's own words, the price sentence included", () => {
    expect(
      describeConfirmationLines({
        changes: [change("finish", "Alb")],
        alsoUpdated: false,
        copy,
      }),
    ).toEqual([full("changedColour", "Alb")]);
  });

  it("is one line per item, so two colours are two lines", () => {
    const lines = describeConfirmationLines({
      changes: [change("finish", "Alb"), change("finish", "Antracit")],
      alsoUpdated: false,
      copy,
    });

    expect(lines).toEqual([
      stem("changedColour", "Alb"),
      full("changedColour", "Antracit"),
    ]);
  });

  it("says the price sentence once, on the last change, however many changes there are", () => {
    const lines = describeConfirmationLines({
      changes: [
        change("material", "PAL"),
        change("hardware", "Hettich"),
        change("finish", "Alb"),
        change("handle", "Push"),
      ],
      alsoUpdated: false,
      copy,
    });

    expect(lines.join("\n").split(PRICE_SENTENCE)).toHaveLength(2);
    expect(lines.at(-1)).toContain(PRICE_SENTENCE);
  });

  it("runs in the mockup's order: material, hardware, colour, handle, accessories, then the merged sentence, and says no reset", () => {
    const lines = describeConfirmationLines({
      changes: [
        change("handle", "Push"),
        change("finish", "Alb"),
        change("hardware", "Hettich"),
        change("material", "PAL"),
      ],
      accessoryNames: ["Dish rack"],
      alsoUpdated: true,
      copy,
    });

    expect(lines).toEqual([
      stem("changedMaterial", "PAL"),
      stem("changedHardware", "Hettich"),
      stem("changedColour", "Alb"),
      full("changedHandle", "Push"),
      say("replacementSheet.accessoryRemoved", { name: "Dish rack" }),
      roMessages.customerPriceNotice.alsoUpdated,
    ]);
  });

  it("keeps each line whole where a locale's leaf has no closing sentence to take off", () => {
    const sentenceless = createTranslator({
      locale: "ro",
      messages: {
        ...roMessages,
        replacementSheet: {
          ...roMessages.replacementSheet,
          changedMaterial: "Material: {name}",
          changedHardware: "Hardware: {name}",
        },
      },
    });

    const lines = describeConfirmationLines({
      changes: [change("material", "PAL"), change("hardware", "Hettich")],
      alsoUpdated: false,
      copy: resolveReplacementSheetCopy(sentenceless),
    });

    expect(lines).toEqual(["Material: PAL", "Hardware: Hettich"]);
  });
});

describe("no dead end (property)", () => {
  const HANDLES = HandleSchema.options;
  const colourIdsOf = (materialId: string): readonly PaletteEntryId[] => {
    const material = MATERIALS.find((held) => held.materialId === materialId);
    return material === undefined
      ? []
      : paletteEntriesOf(material).map((entry) => entry.entryId);
  };
  const MELAMINE_COLOURS = colourIdsOf("material.melamine");
  const VENEER_COLOURS = colourIdsOf("material.veneer");

  const switchedOff = fc
    .record({
      materials: fc.subarray(MATERIAL_TIER_IDS, {
        maxLength: MATERIAL_TIER_IDS.length - 1,
      }),
      hardware: fc.subarray(HARDWARE_TIER_IDS, {
        maxLength: HARDWARE_TIER_IDS.length - 1,
      }),
      handles: fc.subarray([...HANDLES], { maxLength: HANDLES.length - 1 }),
      colours: fc.subarray([...MELAMINE_COLOURS, ...VENEER_COLOURS], {
        maxLength: 6,
      }),
    })
    .map(({ materials, hardware, handles, colours }): readonly ItemRef[] => [
      ...materials.map((tierId): ItemRef => ({ kind: "material", tierId })),
      ...hardware.map((tierId): ItemRef => ({ kind: "hardware", tierId })),
      ...handles.map((handle): ItemRef => ({ kind: "handle", handle })),
      ...colours.map((finishId): ItemRef => ({ kind: "finish", finishId })),
    ]);

  const kitchen = fc
    .record({
      materialTierId: fc.constantFrom(...MATERIAL_TIER_IDS),
      hardwareTierId: fc.constantFrom(...HARDWARE_TIER_IDS),
      handle: fc.constantFrom(...HANDLES),
      colourIndex: fc.nat(8),
    })
    .map(({ materialTierId, hardwareTierId, handle, colourIndex }): Design => {
      const offered =
        materialTierId === "material.veneer"
          ? VENEER_COLOURS
          : MELAMINE_COLOURS;
      const finishId =
        materialTierId === "material.painted-mdf"
          ? undefined
          : offered[colourIndex];
      return kitchenWith({
        materialTierId,
        hardwareTierId,
        handle,
        ...(finishId === undefined ? {} : { finish: paletteFinish(finishId) }),
      });
    });

  propertyTest.prop([switchedOff, kitchen], { numRuns: 300 })(
    "every owed row has a control, or is a colour waiting on a material row that has one, and a sheet that is open has a control",
    (disabled, design) => {
      const view = viewOf(design, disabled);

      const owed = view.rows.filter((row) => !row.isResolved);
      const isMaterialChoosable = owed.some(
        (row) => row.kind === "material" && row.isChoosable,
      );
      expect(
        owed.every(
          (row) =>
            row.isChoosable ||
            (row.isWaiting && row.kind === "finish" && isMaterialChoosable),
        ),
      ).toBe(true);
      expect(owed.length === 0 || owed.some((row) => row.isChoosable)).toBe(
        true,
      );
    },
  );

  propertyTest.prop([switchedOff, kitchen], { numRuns: 300 })(
    "a colour or handle chooser offers only what the domain lists for the row, none of it switched off",
    (disabled, design) => {
      const { live, vocabulary } = worldOf(design, disabled);

      for (const row of live) {
        if (row.item.kind !== "finish" && row.item.kind !== "handle") continue;
        const chooser = describeRowChooser({
          row,
          design,
          catalog: KITCHEN_L_BODY_CATALOG,
          vocabulary,
        });
        const offered = (chooser?.options ?? []).filter(
          (option) => !option.isStruck,
        );
        expect(
          offered.map((option) => ("item" in option ? option.item : undefined)),
        ).toEqual(row.remaining);
        expect(offered.length).toBeGreaterThan(0);
      }
    },
  );
});
