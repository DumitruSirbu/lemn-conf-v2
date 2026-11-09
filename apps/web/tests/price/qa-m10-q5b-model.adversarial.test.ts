// Q5b's adversarial pass over the sheet as values. Counterexamples first: the closing sentence cut (`withoutPriceSentence`)
// attacked with names and leaves of other shapes, a resolved row that names something that replaced nothing, the colour
// reset read through the MDF default, then the sweeps: the whole flow driven to the end over generated kitchens (no dead end,
// no row left owed), the waiting rule, and the choosers.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  HandleSchema,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  MATERIALS,
  lookUpMaterial,
  paletteEntriesOf,
  paletteFinish,
  replacementsRequired,
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
  colourRevertedBy,
  describeConfirmationLines,
  describeReplacementSheet,
  describeRowChooser,
  optionIdOf,
  pendingReplacements,
  replacedItemKey,
  resolveReplacementSheetCopy,
  type SheetVocabulary,
} from "@/price/replacement-sheet-model";
import type { ActivePriceBook } from "@/price/price-book-root";
import { preflightWholeKitchenSettings } from "@/store/whole-kitchen-apply";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import {
  HARDWARE_TIER_IDS,
  MATERIAL_TIER_IDS,
  offerThroughRoot,
} from "../support/tier-offer-world";

type Kind = "material" | "hardware" | "finish" | "handle";
const KINDS: readonly Kind[] = ["material", "hardware", "finish", "handle"];
const LEAF_OF = {
  material: "changedMaterial",
  hardware: "changedHardware",
  finish: "changedColour",
  handle: "changedHandle",
} as const;
const OCCURRED_AT = "2026-11-09T09:00:00.000Z";
const NAME_PLACEHOLDER = "{name}";

const sayRo = createTranslator({ locale: "ro", messages: roMessages });
const copyRo = resolveReplacementSheetCopy(sayRo);

const LOCALES = [
  { locale: "ro", messages: roMessages },
  { locale: "ru", messages: ruMessages },
] as const;

/** The sentence a leaf closes with, read from the leaf: whatever follows "{name}. ". */
function closingSentenceOf(leaf: string): string {
  const [, sentence] = leaf.split(`${NAME_PLACEHOLDER}. `);
  if (sentence === undefined) throw new Error(`no closing sentence in ${leaf}`);
  return sentence;
}

/** A translator that answers the given template for one leaf, standing in for a locale that words it otherwise. */
function translatorWith(
  leafText: string,
): Parameters<typeof resolveReplacementSheetCopy>[0] {
  const real = createTranslator({ locale: "ro", messages: roMessages });
  return ((key: string, values?: Record<string, string>) =>
    key === "replacementSheet.changedColour"
      ? leafText.replaceAll(NAME_PLACEHOLDER, values?.name ?? "")
      : real(key as never, values as never)) as never;
}

describe("the closing sentence cut: every real leaf, in every locale, against awkward names", () => {
  const AWKWARD_NAMES = [
    "",
    ". ",
    " ",
    "A. B. C. ",
    "Stejar. Halifax",
    "<b>bold</b>. <i>x</i>",
    "{name}",
    "{",
    "}",
    "'",
    "''quoted''",
    "100% {x}",
    "\u0001",
    "a\u0001b",
    "Oak. ",
  ];

  describe.each(LOCALES)("$locale", ({ locale, messages }) => {
    const say = createTranslator({ locale, messages });
    const copy = resolveReplacementSheetCopy(say);

    it.each(KINDS)(
      "%s: the last line is the approved leaf byte for byte, and any other line is the leaf minus its sentence, for every awkward name",
      (kind) => {
        const leaf = messages.replacementSheet[LEAF_OF[kind]];
        const sentence = closingSentenceOf(leaf);

        for (const name of AWKWARD_NAMES) {
          const approved = leaf.replace(NAME_PLACEHOLDER, () => name);

          expect(copy.changed(kind, name)).toBe(approved);
          expect(copy.changedWithoutPriceSentence(kind, name)).toBe(
            approved.slice(0, approved.length - sentence.length - 1),
          );
        }
      },
    );

    propertyTest.prop([
      fc.string({ unit: "binary" }),
      fc.constantFrom(...KINDS),
    ])(
      "a name of any characters is carried whole, never searched for the cut, and the sentence is never lost or duplicated",
      (name, kind) => {
        const leaf = messages.replacementSheet[LEAF_OF[kind]];
        const sentence = closingSentenceOf(leaf);

        const cut = copy.changedWithoutPriceSentence(kind, name);
        const whole = copy.changed(kind, name);

        expect(whole).toBe(leaf.replace(NAME_PLACEHOLDER, () => name));
        expect(whole).toBe(`${cut} ${sentence}`);
        expect(cut).toContain(name);
      },
    );
  });
});

describe("the closing sentence cut: a leaf of another shape", () => {
  const sentence = "Price was updated.";
  const cutOf = (leafText: string, name: string): string =>
    resolveReplacementSheetCopy(
      translatorWith(leafText),
    ).changedWithoutPriceSentence("finish", name);

  it("leaves a leaf with no closing sentence whole", () => {
    expect(cutOf("Colour is now {name}.", "Oak. Light")).toBe(
      "Colour is now Oak. Light.",
    );
    expect(cutOf("Colour is now {name}", "Oak")).toBe("Colour is now Oak");
  });

  it("leaves a leaf with its sentence before the name whole, so each line carries it (documented: not of the cut's shape)", () => {
    expect(cutOf(`${sentence} Colour is now {name}`, "Oak")).toBe(
      `${sentence} Colour is now Oak`,
    );
  });

  it("leaves a leaf whose full stop has no space after it whole", () => {
    expect(cutOf(`Colour is now {name}.${sentence}`, "Oak")).toBe(
      `Colour is now Oak.${sentence}`,
    );
  });

  it("leaves a leaf naming the colour twice whole rather than cutting between the two names", () => {
    const leafText = `{name} replaces {name}. ${sentence}`;
    const cut = cutOf(leafText, "Oak");

    expect(cut.endsWith(sentence)).toBe(true);
    expect(cut).toBe(leafText.replaceAll(NAME_PLACEHOLDER, "Oak"));
  });

  // LATENT, not reachable through a shipped leaf: the cut is the first ". " after the name, so a leaf that puts an
  // abbreviation between the name and its sentence is cut inside the abbreviation, losing the rest of its own words. The
  // documented contract is "a leaf not of that shape is left whole", and this shape is not of the shape but is not left whole.
  it.fails(
    "does not cut inside an abbreviation that follows the name (latent: a leaf of this shape is cut at 'ex.')",
    () => {
      expect(cutOf(`Colour {name} (ex. MDF). ${sentence}`, "Oak")).toBe(
        "Colour Oak (ex. MDF).",
      );
    },
  );
});

describe("C4C's lines: the price sentence is said once", () => {
  const changeArb = fc.record({
    kind: fc.constantFrom(...KINDS),
    name: fc
      .string({ minLength: 1, maxLength: 12 })
      .filter((name) => !name.includes("updated")),
  });

  describe.each(LOCALES)("$locale", ({ locale, messages }) => {
    const copy = resolveReplacementSheetCopy(
      createTranslator({ locale, messages }),
    );
    const sentence = closingSentenceOf(
      messages.replacementSheet.changedMaterial,
    );

    propertyTest.prop(
      [
        fc.array(changeArb, { minLength: 1, maxLength: 7 }),
        fc.option(fc.string({ minLength: 1, maxLength: 8 }), {
          nil: undefined,
        }),
      ],
      { numRuns: 300 },
    )(
      "exactly one line carries the sentence, it is the last change in the mockup's order, and a single change is the approved leaf",
      (changes, revertedColour) => {
        const lines = describeConfirmationLines({
          changes,
          revertedColour,
          alsoUpdated: false,
          copy,
        });

        const carrying = lines.filter((line) => line.includes(sentence));
        expect(carrying).toHaveLength(1);
        const ordered = KINDS.flatMap((kind) =>
          changes.filter((change) => change.kind === kind),
        );
        const last = ordered.at(-1);
        expect(carrying[0]).toBe(
          copy.changed(last?.kind ?? "material", last?.name ?? ""),
        );
        expect(lines).toHaveLength(
          changes.length + (revertedColour === undefined ? 0 : 1),
        );
        if (changes.length === 1 && revertedColour === undefined) {
          const [only] = changes;
          expect(lines).toEqual([
            copy.changed(only?.kind ?? "material", only?.name ?? ""),
          ]);
        }
      },
    );
  });

  it("says nothing but the extras when no change was made, and never the sentence", () => {
    const lines = describeConfirmationLines({
      changes: [],
      accessoryNames: ["Raft"],
      alsoUpdated: true,
      copy: copyRo,
    });

    expect(
      lines.some((line) =>
        line.includes(
          closingSentenceOf(roMessages.replacementSheet.changedMaterial),
        ),
      ),
    ).toBe(false);
    expect(lines).toHaveLength(2);
  });

  it("puts the reset line straight after the material line and before hardware, with the sentence on the last change only", () => {
    const lines = describeConfirmationLines({
      changes: [
        { kind: "handle", name: "H" },
        { kind: "hardware", name: "F" },
        { kind: "material", name: "M" },
      ],
      revertedColour: "Alb",
      alsoUpdated: false,
      copy: copyRo,
    });

    expect(lines).toEqual([
      copyRo.changedWithoutPriceSentence("material", "M"),
      copyRo.colourReverted("Alb"),
      copyRo.changedWithoutPriceSentence("hardware", "F"),
      copyRo.changed("handle", "H"),
    ]);
  });
});

function kitchenWith(settings: NonNullable<Design["settings"]>): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, ...settings },
  };
}

function worldOf(design: Design, disabled: readonly ItemRef[]) {
  const availability = { revision: "1", disabled };
  const root: ActivePriceBook = { ...SAMPLE_PRICE_ROOT, availability };
  const vocabulary: SheetVocabulary = {
    content: ro,
    copy: copyRo,
    offer: offerThroughRoot(availability, design),
  };
  return { root, availability, vocabulary };
}

function withBodies(
  design: Design,
  bodies: readonly Partial<Design["placements"][number]["body"]>[],
): Design {
  return {
    ...design,
    placements: design.placements.map((placement, index) => {
      const own = bodies[index];
      return own === undefined
        ? placement
        : { ...placement, body: { ...placement.body, ...own } };
    }),
  };
}

describe("a resolved row names only what is stored now", () => {
  const viewAfterAvailabilityReturned = (design: Design, item: ItemRef) => {
    const { vocabulary } = worldOf(design, []);
    return describeReplacementSheet({
      seen: [{ item, remaining: [item] }],
      live: [],
      design,
      accessoryNames: [],
      vocabulary,
    });
  };

  it("names a colour that availability gave back as the colour it still is, wherever it is stored", () => {
    const stored = withBodies(
      kitchenWith({ finish: paletteFinish("pal.antracit") }),
      [{ finish: paletteFinish("pal.alb") }],
    );

    const [row] = viewAfterAvailabilityReturned(stored, {
      kind: "finish",
      finishId: "pal.alb",
    }).rows;

    expect(row?.isResolved).toBe(true);
    expect(row?.valueText).toBe(ro.finishName("pal.alb"));
  });

  // A handle stored only on a cabinet and switched off, then switched back on with the sheet open: nothing replaced it, so
  // the row cannot say the kitchen's own handle replaced it. The colour arm answers "as it was" (`nameOfColourInPlaceOf`);
  // the handle arm reads `settings.handle` alone.
  it("names a handle that availability gave back as the handle it still is, not as the kitchen's other handle", () => {
    const stored = withBodies(kitchenWith({ handle: "steel" }), [
      { handle: "black" },
    ]);

    const [row] = viewAfterAvailabilityReturned(stored, {
      kind: "handle",
      handle: "black",
    }).rows;

    expect(row?.isResolved).toBe(true);
    expect(row?.valueText).toBe(ro.panel.handleLabels.black);
  });

  it("names a handle stored on the top row only, given back, as itself", () => {
    const stored = kitchenWith({ handle: "steel", topRowHandle: "black" });

    const [row] = viewAfterAvailabilityReturned(stored, {
      kind: "handle",
      handle: "black",
    }).rows;

    expect(row?.valueText).toBe(ro.panel.handleLabels.black);
  });

  it("says nothing, with no value node to draw, for a handle row when no handle is stored anywhere", () => {
    const [row] = viewAfterAvailabilityReturned(kitchenWith({}), {
      kind: "handle",
      handle: "black",
    }).rows;

    expect(row?.valueText).toBeUndefined();
  });
});

describe("the colour a material change reset, through the MDF default", () => {
  const afterMaterial = (design: Design, tierId: string): Design => {
    const result = setMaterialTier({
      design,
      tierId,
      availableTierIds: [...MATERIAL_TIER_IDS, tierId],
      occurredAt: OCCURRED_AT,
    });
    if (!result.ok) throw new Error("the material change was refused");
    return result.design;
  };

  it("names MDF's free default by its value, which is all it has, never by a palette name or an id", () => {
    const before = kitchenWith({
      materialTierId: "material.veneer",
      finish: paletteFinish("veneer.stejar"),
    });
    const lookup = lookUpMaterial("material.painted-mdf");
    if (lookup.kind !== "declared") throw new Error("MDF is declared");
    const { defaultFinish } = lookup.material;
    if (defaultFinish.kind === "palette-entry")
      throw new Error("MDF's default is free");

    const reverted = colourRevertedBy({
      before,
      after: afterMaterial(before, "material.painted-mdf"),
      content: ro,
    });

    expect(reverted).toBe(
      ro.globalSettings.pillColourValue(defaultFinish.value),
    );
    expect(reverted).not.toMatch(/pal\.|veneer\./);
  });

  it("is silent going from a kitchen with a stored colour onto the very same material (nothing is reset, ADR 0086 decision 3)", () => {
    const before = kitchenWith({
      materialTierId: "material.melamine",
      finish: paletteFinish("pal.antracit"),
    });

    expect(
      colourRevertedBy({
        before,
        after: afterMaterial(before, "material.melamine"),
        content: ro,
      }),
    ).toBeUndefined();
  });

  it("is silent when the new material is one no code declares, even from a colour it would not offer", () => {
    const before = kitchenWith({
      materialTierId: "material.melamine",
      finish: paletteFinish("pal.antracit"),
    });

    expect(
      colourRevertedBy({
        before,
        after: afterMaterial(before, "material.created-and-since-deleted"),
        content: ro,
      }),
    ).toBeUndefined();
  });
});

const HANDLES = HandleSchema.options;
const paletteIdsOf = (materialId: string): readonly PaletteEntryId[] => {
  const material = MATERIALS.find((held) => held.materialId === materialId);
  return material === undefined
    ? []
    : paletteEntriesOf(material).map((entry) => entry.entryId);
};
const PALETTES = {
  "material.melamine": paletteIdsOf("material.melamine"),
  "material.veneer": paletteIdsOf("material.veneer"),
};
const VANISHED = "ZZ-vanished-material";

/** Kitchens that store colours and handles at every level the design can: the kitchen's, the top row's, and cabinets' own. */
const storedKitchen = fc
  .record({
    materialTierId: fc.constantFrom(...MATERIAL_TIER_IDS, VANISHED),
    hardwareTierId: fc.constantFrom(
      ...HARDWARE_TIER_IDS,
      "ZZ-vanished-hardware",
    ),
    handle: fc.option(fc.constantFrom(...HANDLES), { nil: undefined }),
    topRowHandle: fc.option(fc.constantFrom(...HANDLES), { nil: undefined }),
    colourIndex: fc.option(fc.nat(8), { nil: undefined }),
    cabinetColours: fc.array(fc.option(fc.nat(8), { nil: undefined }), {
      maxLength: 6,
    }),
    cabinetHandles: fc.array(
      fc.option(fc.constantFrom(...HANDLES), { nil: undefined }),
      { maxLength: 6 },
    ),
  })
  .map((drawn): Design => {
    const palette =
      drawn.materialTierId === "material.veneer"
        ? PALETTES["material.veneer"]
        : drawn.materialTierId === "material.melamine" ||
            drawn.materialTierId === VANISHED
          ? PALETTES["material.melamine"]
          : [];
    const colourAt = (index: number | undefined) =>
      index === undefined || palette.length === 0
        ? undefined
        : paletteFinish(palette[index % palette.length] ?? "pal.alb");
    const kitchenColour = colourAt(drawn.colourIndex);
    const bodies = KITCHEN_L_DESIGN.placements.map((_, at) => ({
      ...(colourAt(drawn.cabinetColours[at]) === undefined
        ? {}
        : { finish: colourAt(drawn.cabinetColours[at]) }),
      ...(drawn.cabinetHandles[at] === undefined
        ? {}
        : { handle: drawn.cabinetHandles[at] }),
    }));
    return withBodies(
      kitchenWith({
        materialTierId: drawn.materialTierId,
        hardwareTierId: drawn.hardwareTierId,
        ...(drawn.handle === undefined ? {} : { handle: drawn.handle }),
        ...(drawn.topRowHandle === undefined
          ? {}
          : { topRowHandle: drawn.topRowHandle }),
        ...(kitchenColour === undefined ? {} : { finish: kitchenColour }),
      }),
      bodies as Partial<Design["placements"][number]["body"]>[],
    );
  });

/** Availability as the dashboard guarantees it: every group keeps an active option. */
const switchedOff = fc
  .record({
    materials: fc.subarray(MATERIAL_TIER_IDS, {
      maxLength: MATERIAL_TIER_IDS.length - 1,
    }),
    hardware: fc.subarray(HARDWARE_TIER_IDS, {
      maxLength: HARDWARE_TIER_IDS.length - 1,
    }),
    handles: fc.subarray([...HANDLES], { maxLength: HANDLES.length - 1 }),
    melamine: fc.subarray([...PALETTES["material.melamine"]], {
      maxLength: PALETTES["material.melamine"].length - 1,
    }),
    veneer: fc.subarray([...PALETTES["material.veneer"]], {
      maxLength: PALETTES["material.veneer"].length - 1,
    }),
  })
  .map(
    ({
      materials,
      hardware,
      handles,
      melamine,
      veneer,
    }): readonly ItemRef[] => [
      ...materials.map((tierId): ItemRef => ({ kind: "material", tierId })),
      ...hardware.map((tierId): ItemRef => ({ kind: "hardware", tierId })),
      ...handles.map((handle): ItemRef => ({ kind: "handle", handle })),
      ...[...melamine, ...veneer].map(
        (finishId): ItemRef => ({ kind: "finish", finishId }),
      ),
    ],
  );

/** What pressing "Aplică" on the first option of a row asks of the store, as `requestOf` builds it. */
function pressFirstOption(
  row: ReplacementRequired,
  design: Design,
  disabled: readonly ItemRef[],
): Design {
  const { vocabulary } = worldOf(design, disabled);
  const chooser = describeRowChooser({
    row,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    vocabulary,
  });
  const option = chooser?.options.find((candidate) => !candidate.isStruck);
  if (chooser === undefined || option === undefined) {
    throw new Error(`the ${row.item.kind} chooser offers nothing to pick`);
  }
  const offer = vocabulary.offer;
  if (!("material" in offer)) throw new Error("no offer");
  const offered = {
    availableMaterialTierIds: offer.material.tierIds,
    availableHardwareTierIds: offer.hardware.tierIds,
  };
  const request =
    "tierId" in option
      ? row.item.kind === "material"
        ? { materialTierId: option.tierId, ...offered }
        : { hardwareTierId: option.tierId, ...offered }
      : { replacement: appearanceReplacementOf(row, option), ...offered };
  const outcome = preflightWholeKitchenSettings(request, {
    design,
    catalogAt: () => KITCHEN_L_BODY_CATALOG,
    probeAt: undefined,
    occurredAt: OCCURRED_AT,
  });
  if (outcome.outcome !== "ready") {
    throw new Error(`pressing ${optionIdOf(option)} gave ${outcome.outcome}`);
  }
  return outcome.result.design;
}

describe("the whole flow over generated kitchens", () => {
  propertyTest.prop([storedKitchen, switchedOff], { numRuns: 250 })(
    "choosing a control at a time always has one to press, never undoes an earlier choice, and ends with a priced kitchen",
    (start, disabled) => {
      let design = start;
      const chosenKeys: string[] = [];
      for (let step = 0; step < 40; step += 1) {
        const { root, vocabulary } = worldOf(design, disabled);
        const live = pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG);
        if (live.length === 0) break;
        const view = describeReplacementSheet({
          seen: live,
          live,
          design,
          accessoryNames: [],
          vocabulary,
        });
        const choosable = live.filter(
          (row) =>
            view.rows.find((shown) => shown.key === replacedItemKey(row.item))
              ?.isChoosable,
        );
        // The dead end: an owed row exists and none of them has a control.
        expect(choosable.length).toBeGreaterThan(0);
        const [next] = choosable;
        if (next === undefined) return;
        const keysBefore = live.map((row) => replacedItemKey(row.item));
        design = pressFirstOption(next, design, disabled);
        chosenKeys.push(replacedItemKey(next.item));
        const after = pendingReplacements(
          worldOf(design, disabled).root,
          design,
          KITCHEN_L_BODY_CATALOG,
        );
        const keysAfter = after.map((row) => replacedItemKey(row.item));
        // The item chosen is gone. A row that was not owed before may appear only when a material was chosen and it is a
        // colour: the old material was one no code declares, so its stored colours were not judged until it was replaced.
        expect(keysAfter).not.toContain(replacedItemKey(next.item));
        for (const key of keysAfter.filter(
          (one) => !keysBefore.includes(one),
        )) {
          expect(next.item.kind).toBe("material");
          expect(key.startsWith("finish:")).toBe(true);
        }
      }

      const { root } = worldOf(design, disabled);
      expect(pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG)).toEqual(
        [],
      );
      expect(
        replacementsRequired({
          design,
          catalog: KITCHEN_L_BODY_CATALOG,
          book: root.book,
          availability: root.availability,
        }),
      ).toEqual([]);
      expect(new Set(chosenKeys).size).toBe(chosenKeys.length);
    },
  );

  propertyTest.prop([storedKitchen, switchedOff], { numRuns: 250 })(
    "a replacement moves no stored colour or handle that was not the replaced item",
    (start, disabled) => {
      const { root } = worldOf(start, disabled);
      const live = pendingReplacements(root, start, KITCHEN_L_BODY_CATALOG);
      for (const row of live.filter(
        ({ item }) => item.kind === "finish" || item.kind === "handle",
      )) {
        const waiting =
          live.some(({ item }) => item.kind === "material") &&
          row.item.kind === "finish";
        if (waiting) continue;
        const after = pressFirstOption(row, start, disabled);
        const stored = (design: Design) =>
          [
            design.settings?.finish,
            design.settings?.handle,
            design.settings?.topRowHandle,
            ...design.placements.flatMap(({ body }) => [
              body.finish,
              body.handle,
            ]),
          ].map((value) => JSON.stringify(value));
        const replaced = JSON.stringify(
          row.item.kind === "finish"
            ? paletteFinish(row.item.finishId as PaletteEntryId)
            : row.item.kind === "handle"
              ? row.item.handle
              : undefined,
        );
        const before = stored(start);
        const afterwards = stored(after);
        before.forEach((value, at) => {
          if (value !== replaced) expect(afterwards[at]).toBe(value);
          else expect(afterwards[at]).not.toBe(value);
        });
      }
    },
  );
});

describe("the waiting rule, over generated owed sets", () => {
  propertyTest.prop([storedKitchen, switchedOff], { numRuns: 300 })(
    "a colour waits exactly while a material row is unresolved; nothing else ever waits; a resolved row never has a control but hardware and, without a colour chosen, material",
    (design, disabled) => {
      const { root, vocabulary } = worldOf(design, disabled);
      const live = pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG);
      const view = describeReplacementSheet({
        seen: live,
        live,
        design,
        accessoryNames: [],
        vocabulary,
      });
      const isMaterialOwed = live.some(({ item }) => item.kind === "material");

      for (const row of view.rows) {
        expect(row.isWaiting).toBe(row.kind === "finish" && isMaterialOwed);
        expect(row.isChoosable).toBe(!row.isWaiting);
      }

      // The same rows seen, but nothing owed any more: every row is resolved and the controls follow the resolved rule.
      const resolved = describeReplacementSheet({
        seen: live,
        live: [],
        design,
        accessoryNames: [],
        vocabulary,
      });
      for (const row of resolved.rows) {
        expect(row.isResolved).toBe(true);
        expect(row.isWaiting).toBe(false);
        expect(row.isChoosable).toBe(
          row.kind === "material" || row.kind === "hardware",
        );
      }

      // A colour chosen in this sheet takes the material's "Schimbă" away, and nothing else's; a handle chosen does not.
      const afterColour = describeReplacementSheet({
        seen: live,
        live: [],
        design,
        accessoryNames: [],
        vocabulary,
        chosenNames: new Map([["finish:pal.alb", "Alb"]]),
      });
      for (const row of afterColour.rows) {
        expect(row.isChoosable).toBe(row.kind === "hardware");
      }
      const afterHandle = describeReplacementSheet({
        seen: live,
        live: [],
        design,
        accessoryNames: [],
        vocabulary,
        chosenNames: new Map([["handle:black", "Chosen handle"]]),
      });
      for (const row of afterHandle.rows) {
        expect(row.isChoosable).toBe(
          row.kind === "material" || row.kind === "hardware",
        );
      }
    },
  );

  propertyTest.prop([storedKitchen, switchedOff], { numRuns: 300 })(
    "no resolved row is drawn with an empty value, and no value or announcement carries an id",
    (design, disabled) => {
      const { root, vocabulary } = worldOf(design, disabled);
      const live = pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG);
      const view = describeReplacementSheet({
        seen: live,
        live: [],
        design,
        accessoryNames: [],
        vocabulary,
      });
      const idShapes =
        /(^|[^\p{L}])(pal|veneer|mdf)\.[a-z-]+|material\.|hardware\.|ZZ-/u;

      for (const row of view.rows) {
        expect(row.valueText === undefined || row.valueText.trim() !== "").toBe(
          true,
        );
        expect(row.valueText ?? "").not.toMatch(idShapes);
        expect(row.announcement).not.toMatch(idShapes);
        expect(row.itemPhrase).not.toMatch(idShapes);
      }
      expect(view.body).not.toMatch(idShapes);
    },
  );
});

describe("the choosers, over generated rows", () => {
  propertyTest.prop([storedKitchen, switchedOff], { numRuns: 300 })(
    "offer only the domain's active remaining options in its order, strike only the kitchen's own item, and every pick is a replacement the domain accepts",
    (design, disabled) => {
      const { root, vocabulary } = worldOf(design, disabled);
      const isOff = (item: ItemRef) =>
        disabled.some((held) => JSON.stringify(held) === JSON.stringify(item));

      for (const row of pendingReplacements(
        root,
        design,
        KITCHEN_L_BODY_CATALOG,
      )) {
        const chooser = describeRowChooser({
          row,
          design,
          catalog: KITCHEN_L_BODY_CATALOG,
          vocabulary,
        });
        expect(chooser).toBeDefined();
        const options = chooser?.options ?? [];
        const live = options.filter((option) => !option.isStruck);
        const struck = options.filter((option) => option.isStruck);

        // The tier chooser may omit an option the offer does not carry, but never reorder or invent one.
        const ids = live.map(optionIdOf);
        expect(new Set(ids).size).toBe(ids.length);
        expect(struck.length).toBeLessThanOrEqual(1);
        expect(live.length).toBeGreaterThan(0);
        for (const option of options) {
          expect(option.name.trim()).not.toBe("");
          if ("item" in option) {
            expect(isOff(option.item)).toBe(option.isStruck);
            expect(option.swatch === undefined).toBe(
              option.item.kind === "handle",
            );
          }
        }
        if (row.item.kind === "finish" || row.item.kind === "handle") {
          expect(
            live.map((option) => ("item" in option ? option.item : undefined)),
          ).toEqual(row.remaining);
          for (const option of live) {
            if ("item" in option) {
              const replacement = appearanceReplacementOf(row, option);
              expect(replacement).toBeDefined();
              expect(replacement?.kind).toBe(row.item.kind);
            }
          }
        }
      }
    },
  );
});
