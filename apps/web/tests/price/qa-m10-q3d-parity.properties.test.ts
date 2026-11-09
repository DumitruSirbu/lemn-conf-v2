// Properties of M10 wave Q3d's model (fast-check): the sheet's rows ARE the refusal's items, for any availability that leaves
// every group an active option and any kitchen, vanished tiers included; and no row names a tier id the page cannot honestly
// read. The implementer's examples fix a handful of kitchens; the parity is the claim ("the rows and the refusal are the same
// set", `replacements-required.ts`) so it is swept.
//
// A generated tier id carries a unique prefix so that a short id cannot be found in ordinary text by accident, and markup so
// that a row which printed an id would also inject it.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  HandleSchema,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  type Design,
  type ItemRef,
  type PaletteEntryId,
  type ReplacementRequired,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import {
  priceAgainstBook,
  type ActivePriceBook,
} from "@/price/price-book-root";
import {
  describeReplacementSheet,
  pendingReplacements,
  rememberRows,
  resolveReplacementSheetCopy,
  type SheetVocabulary,
} from "@/price/replacement-sheet-model";

import roMessages from "../../src/messages/ro.json";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import {
  HARDWARE_TIER_IDS,
  kitchenCarrying,
  MATERIAL_TIER_IDS,
  offerThroughRoot,
} from "../support/tier-offer-world";

const copy = resolveReplacementSheetCopy(
  createTranslator({ locale: "ro", messages: roMessages }),
);
const HANDLES = HandleSchema.options;
const VANISHED_PREFIX = "ZZVANISHED-";
const NUM_RUNS = 400;

const paletteIdsOf = (materialId: string): readonly PaletteEntryId[] => {
  const material = MATERIALS.find((held) => held.materialId === materialId);
  return material === undefined
    ? []
    : paletteEntriesOf(material).map((entry) => entry.entryId);
};
const MELAMINE_COLOURS = paletteIdsOf("material.melamine");
const VENEER_COLOURS = paletteIdsOf("material.veneer");

const vanishedTierId = fc
  .string({ maxLength: 12 })
  .map((tail) => `${VANISHED_PREFIX}<img src=x onerror=1>${tail}`);

const chosenTier = (known: readonly string[]) =>
  fc.oneof(
    { weight: 2, arbitrary: fc.constant(undefined) },
    { weight: 4, arbitrary: fc.constantFrom(...known) },
    { weight: 2, arbitrary: vanishedTierId },
  );

/** Which items availability switches off: each group keeps at least one active option, as the dashboard guarantees (A-17). */
const switchedOffItems = fc
  .record({
    materials: fc.subarray(MATERIAL_TIER_IDS, {
      maxLength: MATERIAL_TIER_IDS.length - 1,
    }),
    hardware: fc.subarray(HARDWARE_TIER_IDS, {
      maxLength: HARDWARE_TIER_IDS.length - 1,
    }),
    handles: fc.subarray([...HANDLES], { maxLength: HANDLES.length - 1 }),
    melamineColours: fc.subarray([...MELAMINE_COLOURS], {
      maxLength: MELAMINE_COLOURS.length - 1,
    }),
    veneerColours: fc.subarray([...VENEER_COLOURS], {
      maxLength: VENEER_COLOURS.length - 1,
    }),
  })
  .map(
    ({
      materials,
      hardware,
      handles,
      melamineColours,
      veneerColours,
    }): readonly ItemRef[] => [
      ...materials.map((tierId): ItemRef => ({ kind: "material", tierId })),
      ...hardware.map((tierId): ItemRef => ({ kind: "hardware", tierId })),
      ...handles.map((handle): ItemRef => ({ kind: "handle", handle })),
      ...[...melamineColours, ...veneerColours].map(
        (finishId): ItemRef => ({ kind: "finish", finishId }),
      ),
    ],
  );

interface Kitchen {
  readonly design: Design;
  readonly materialTierId: string | undefined;
}

/** A stored kitchen: tiers (chosen, defaulted or vanished), a handle, and a colour the chosen material offers. */
const storedKitchen = fc
  .record({
    materialTierId: chosenTier(MATERIAL_TIER_IDS),
    hardwareTierId: chosenTier(HARDWARE_TIER_IDS),
    handle: fc.option(fc.constantFrom(...HANDLES), { nil: undefined }),
    colourIndex: fc.nat(8),
  })
  .map(({ materialTierId, hardwareTierId, handle, colourIndex }): Kitchen => {
    const offered =
      materialTierId === undefined || materialTierId === "material.melamine"
        ? MELAMINE_COLOURS
        : materialTierId === "material.veneer"
          ? VENEER_COLOURS
          : [];
    const finishId = offered[colourIndex];
    const base = kitchenCarrying({ materialTierId, hardwareTierId });
    return {
      materialTierId,
      design: {
        ...base,
        settings: {
          ...base.settings,
          ...(handle === undefined ? {} : { handle }),
          ...(finishId === undefined
            ? {}
            : { finish: paletteFinish(finishId) }),
        },
      },
    };
  });

function rootOf(disabled: readonly ItemRef[]): ActivePriceBook {
  return { ...SAMPLE_PRICE_ROOT, availability: { revision: "1", disabled } };
}

function refusalItemsOf(
  root: ActivePriceBook,
  design: Design,
): readonly ItemRef[] {
  const priced = priceAgainstBook(root, design, KITCHEN_L_BODY_CATALOG);
  if (priced.ok) return [];
  if (priced.failure.code !== "REPLACEMENT_REQUIRED") {
    throw new Error(`priced as a different refusal: ${priced.failure.code}`);
  }
  return priced.failure.items;
}

function vocabularyOf(root: ActivePriceBook, design: Design): SheetVocabulary {
  return {
    content: ro,
    copy,
    offer: offerThroughRoot(root.availability, design),
  };
}

function allWordsOf(view: ReturnType<typeof describeReplacementSheet>): string {
  return JSON.stringify({
    title: view.title,
    body: view.body,
    price: view.priceLine,
    exit: view.exitHint,
    rows: view.rows.map((row) => ({
      kindLabel: row.kindLabel,
      valueText: row.valueText,
      statusText: row.statusText,
      announcement: row.announcement,
      itemPhrase: row.itemPhrase,
    })),
  });
}

describe("the generators reach what the properties claim to sweep", () => {
  it("produce rows of every kind, a vanished tier, and kitchens that are priced", () => {
    const samples = fc.sample(fc.tuple(switchedOffItems, storedKitchen), {
      numRuns: 600,
      seed: 7,
    });
    const kindsSeen = new Set<string>();
    let pricedCount = 0;
    let vanishedCount = 0;
    for (const [disabled, { design }] of samples) {
      const root = rootOf(disabled);
      const rows = pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG);
      rows.forEach(({ item }) => kindsSeen.add(item.kind));
      if (rows.length === 0) pricedCount += 1;
      if (JSON.stringify(design.settings).includes(VANISHED_PREFIX))
        vanishedCount += 1;
    }

    expect([...kindsSeen].sort()).toEqual([
      "finish",
      "handle",
      "hardware",
      "material",
    ]);
    expect(pricedCount).toBeGreaterThan(20);
    expect(pricedCount).toBeLessThan(580);
    expect(vanishedCount).toBeGreaterThan(50);
  });
});

describe("the rows are the refusal's items", () => {
  propertyTest.prop([switchedOffItems, storedKitchen], { numRuns: NUM_RUNS })(
    "for any availability that keeps an option per group and any stored kitchen, in the same order",
    (disabled, { design }) => {
      const root = rootOf(disabled);

      const rows = pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG);

      expect(rows.map(({ item }) => item)).toEqual(
        refusalItemsOf(root, design),
      );
    },
  );

  propertyTest.prop([switchedOffItems, storedKitchen], { numRuns: NUM_RUNS })(
    "an empty list is exactly a kitchen that is priced",
    (disabled, { design }) => {
      const root = rootOf(disabled);

      const rows = pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG);
      const priced = priceAgainstBook(root, design, KITCHEN_L_BODY_CATALOG);

      expect(rows.length === 0).toBe(priced.ok);
    },
  );

  propertyTest.prop([switchedOffItems, storedKitchen], { numRuns: NUM_RUNS })(
    "a tier row offers the group's active tiers in book order and every row offers something that is not switched off",
    (disabled, { design }) => {
      const root = rootOf(disabled);
      const isOff = (item: ItemRef): boolean =>
        disabled.some((held) => JSON.stringify(held) === JSON.stringify(item));
      const activeIds = (
        ids: readonly string[],
        kind: "material" | "hardware",
      ) => ids.filter((tierId) => !isOff({ kind, tierId }));

      for (const row of pendingReplacements(
        root,
        design,
        KITCHEN_L_BODY_CATALOG,
      )) {
        expect(row.remaining.length).toBeGreaterThan(0);
        expect(row.remaining.some(isOff)).toBe(false);
        if (row.item.kind === "material") {
          expect(row.remaining).toEqual(
            activeIds(MATERIAL_TIER_IDS, "material").map((tierId) => ({
              kind: "material",
              tierId,
            })),
          );
        }
        if (row.item.kind === "hardware") {
          expect(row.remaining).toEqual(
            activeIds(HARDWARE_TIER_IDS, "hardware").map((tierId) => ({
              kind: "hardware",
              tierId,
            })),
          );
        }
      }
    },
  );

  propertyTest.prop([switchedOffItems, storedKitchen], { numRuns: NUM_RUNS })(
    "the drawn rows come one per item, in the refusal's order, and only a tier row can be chosen",
    (disabled, { design }) => {
      const root = rootOf(disabled);
      const live = pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG);

      const view = describeReplacementSheet({
        seen: live,
        live,
        design,
        accessoryNames: [],
        vocabulary: vocabularyOf(root, design),
      });

      expect(view.rows.map(({ item }) => item)).toEqual(
        refusalItemsOf(root, design),
      );
      expect(
        view.rows.every(
          (row) =>
            row.isChoosable ===
            (row.kind === "material" || row.kind === "hardware"),
        ),
      ).toBe(true);
      expect(view.rows.every((row) => !row.isResolved)).toBe(true);
    },
  );
});

describe("a tier the page cannot read is never named by its id", () => {
  propertyTest.prop([vanishedTierId, vanishedTierId, switchedOffItems], {
    numRuns: NUM_RUNS,
  })(
    "a vanished material or hardware tier gets the generic line, in the rows, the body and the announcement",
    (vanishedMaterial, vanishedHardware, disabled) => {
      const design = kitchenCarrying({
        materialTierId: vanishedMaterial,
        hardwareTierId: vanishedHardware,
      });
      const root = rootOf(disabled);
      const live = pendingReplacements(root, design, KITCHEN_L_BODY_CATALOG);

      const view = describeReplacementSheet({
        seen: live,
        live,
        design,
        accessoryNames: [],
        vocabulary: vocabularyOf(root, design),
      });

      expect(live.map(({ item }) => item.kind)).toEqual(
        expect.arrayContaining(["material", "hardware"]),
      );
      expect(allWordsOf(view)).not.toContain(VANISHED_PREFIX);
      expect(allWordsOf(view)).not.toContain("<img");
      const vanishedRows = view.rows.filter(
        (row) => row.kind === "material" || row.kind === "hardware",
      );
      expect(
        vanishedRows.every(
          (row) => row.announcement === copy.unnamedOptionUnavailable,
        ),
      ).toBe(true);
      expect(
        vanishedRows.every(
          (row) => row.valueText === copy.unnamedOptionUnavailable,
        ),
      ).toBe(true);
    },
  );
});

describe("remembering rows", () => {
  const someRows = (
    items: readonly ItemRef[],
  ): readonly ReplacementRequired[] =>
    items.map((item) => ({ item, remaining: [item] }));
  const itemArb = fc.constantFrom<ItemRef>(
    ...MATERIAL_TIER_IDS.map(
      (tierId): ItemRef => ({ kind: "material", tierId }),
    ),
    ...HARDWARE_TIER_IDS.map(
      (tierId): ItemRef => ({ kind: "hardware", tierId }),
    ),
  );

  propertyTest.prop([
    fc.array(itemArb, { maxLength: 5 }),
    fc.array(itemArb, { maxLength: 5 }),
  ])(
    "keeps every row it has seen once, in first-seen order, and is a fixed point (the caller tells change by identity)",
    (seenItems, liveItems) => {
      const seen = someRows(
        seenItems.filter(
          (item, at) =>
            seenItems.findIndex(
              (held) => JSON.stringify(held) === JSON.stringify(item),
            ) === at,
        ),
      );
      const live = someRows(liveItems);

      const remembered = rememberRows(seen, live);

      expect(remembered.slice(0, seen.length)).toEqual(seen);
      for (const row of live) {
        expect(
          remembered.some(
            ({ item }) => JSON.stringify(item) === JSON.stringify(row.item),
          ),
        ).toBe(true);
      }
      expect(rememberRows(remembered, live)).toBe(remembered);
    },
  );
});

describe("the sample kitchen is not a vanished one", () => {
  propertyTest.prop([switchedOffItems], { numRuns: 100 })(
    "the shipped sample design with nothing chosen needs no replacement unless availability switched off its own defaults",
    (disabled) => {
      const root = rootOf(disabled);

      const rows = pendingReplacements(
        root,
        KITCHEN_L_DESIGN,
        KITCHEN_L_BODY_CATALOG,
      );

      expect(rows.map(({ item }) => item)).toEqual(
        refusalItemsOf(root, KITCHEN_L_DESIGN),
      );
    },
  );
});
