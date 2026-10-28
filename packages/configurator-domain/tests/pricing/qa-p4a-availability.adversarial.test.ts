// M10 P4a QA: counterexample hunting against availability in the pricing engine (P4a-a to P4a-d; A-9, A-16, A-17).
//
// The implementer's suites pin examples and one kitchen. These sweep: every subset of switchable items against designs
// that name different things, judged by an oracle written from the generated spec and never from `itemsNamedBy`, so a
// wrong naming rule cannot agree with itself. The last describe block pins CURRENT behaviour at the edges the plan
// leaves to the architect; each pin says what it is and none of them decides the question.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design, Handle } from "../../src/design.js";
import { HandleSchema } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import * as barrel from "../../src/index.js";
import {
  DEFAULT_HANDLE,
  TOP_ROW_HANDLE,
} from "../../src/kitchen-handle/index.js";
import {
  freeColourFinish,
  MATERIALS,
  materialById,
  paletteEntriesOf,
  paletteFinish,
  PALETTE_ENTRY_IDS,
  type PaletteEntryId,
} from "../../src/materials.js";
import {
  isSameItem,
  type ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import { removedAccessoriesSince } from "../../src/pricing/earned-accessories.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import type {
  AccessoryPriceLine,
  PricingResult,
} from "../../src/pricing/price-lines.js";
import {
  NoReplacementOptionError,
  replacementsRequired,
} from "../../src/queries/replacements-required.js";
import {
  accessory,
  availabilityOf,
  BOOK,
  CATALOG,
  colour,
  CUSTOMISABLE_PLACEMENT_ID,
  handle,
  hardware,
  material,
  priceUnder,
  withBodyOf,
  withSettings,
} from "../support/availability-kitchens.js";
import {
  fatalDesignValidationIssues,
  validateDesignForCatalog,
} from "../../src/validate-design.js";
import { NOTHING_DISABLED } from "../support/availability.js";

const MATERIAL_TIER_IDS = BOOK.material.tiers.map((tier) => tier.tierId);
const HARDWARE_TIER_IDS = BOOK.hardware.tiers.map((tier) => tier.tierId);
const COVER = accessory("sinkProtectiveCover");
const RACK = accessory("dishDryingRack");

/** Everything availability can switch off that the shipped book and palette declare, plus ids nothing holds. */
const WHOLE_UNIVERSE: readonly ItemRef[] = [
  ...MATERIAL_TIER_IDS.map(material),
  ...HARDWARE_TIER_IDS.map(hardware),
  ...PALETTE_ENTRY_IDS.map(colour),
  ...HandleSchema.options.map(handle),
  COVER,
  RACK,
  accessory("accessory.linked-that-no-book-holds"),
  material("material.the-book-never-held"),
];

function aSubsetOf(items: readonly ItemRef[]): fc.Arbitrary<ItemRef[]> {
  return fc.shuffledSubarray([...items], {
    minLength: 0,
    maxLength: items.length,
  });
}

function refusalItemsOf(result: PricingResult): readonly ItemRef[] | undefined {
  if (result.ok || result.failure.code !== "REPLACEMENT_REQUIRED") {
    return undefined;
  }
  return result.failure.items;
}

function codeOf(result: PricingResult): string {
  return result.ok ? "OK" : result.failure.code;
}

// ---------------------------------------------------------------------------------------------------------------
// A design named by a generated spec, and the oracle for what it names

interface NamingSpec {
  readonly materialTierId: string | undefined;
  readonly hardwareTierId: string | undefined;
  readonly kitchenColour: PaletteEntryId | "free" | undefined;
  readonly kitchenHandle: Handle | undefined;
  readonly topRowHandle: Handle | undefined;
  readonly cabinetColour: PaletteEntryId | undefined;
  readonly cabinetHandle: Handle | undefined;
}

const aNamingSpec: fc.Arbitrary<NamingSpec> = fc.record({
  materialTierId: fc.option(fc.constantFrom(...MATERIAL_TIER_IDS), {
    nil: undefined,
  }),
  hardwareTierId: fc.option(fc.constantFrom(...HARDWARE_TIER_IDS), {
    nil: undefined,
  }),
  kitchenColour: fc.option(
    fc.constantFrom<PaletteEntryId | "free">("free", ...PALETTE_ENTRY_IDS),
    { nil: undefined },
  ),
  kitchenHandle: fc.option(fc.constantFrom(...HandleSchema.options), {
    nil: undefined,
  }),
  topRowHandle: fc.option(fc.constantFrom(...HandleSchema.options), {
    nil: undefined,
  }),
  cabinetColour: fc.option(fc.constantFrom(...PALETTE_ENTRY_IDS), {
    nil: undefined,
  }),
  cabinetHandle: fc.option(fc.constantFrom(...HandleSchema.options), {
    nil: undefined,
  }),
});

function designNaming(spec: NamingSpec): Design {
  const settings: NonNullable<Design["settings"]> = {
    cabinetDepthMm: 600,
    ...(spec.materialTierId ? { materialTierId: spec.materialTierId } : {}),
    ...(spec.hardwareTierId ? { hardwareTierId: spec.hardwareTierId } : {}),
    ...(spec.kitchenColour === "free"
      ? { finish: freeColourFinish("#b8c4a1") }
      : spec.kitchenColour
        ? { finish: paletteFinish(spec.kitchenColour) }
        : {}),
    ...(spec.kitchenHandle ? { handle: spec.kitchenHandle } : {}),
    ...(spec.topRowHandle ? { topRowHandle: spec.topRowHandle } : {}),
  };
  return withBodyOf(
    CUSTOMISABLE_PLACEMENT_ID,
    {
      ...(spec.cabinetColour
        ? { finish: paletteFinish(spec.cabinetColour) }
        : {}),
      ...(spec.cabinetHandle ? { handle: spec.cabinetHandle } : {}),
    },
    withSettings(settings),
  );
}

/** What the spec names, written from the spec: the tier it chose or the book's fallback, and each stored palette colour
 *  and handle. A free colour is no item. In the order kind, then id. */
function itemsTheSpecNames(spec: NamingSpec): readonly ItemRef[] {
  const named: ItemRef[] = [
    material(spec.materialTierId ?? BOOK.material.defaultTierId),
    hardware(spec.hardwareTierId ?? BOOK.hardware.defaultTierId),
  ];
  for (const id of [spec.kitchenColour, spec.cabinetColour]) {
    if (id !== undefined && id !== "free") named.push(colour(id));
  }
  for (const name of [
    spec.kitchenHandle,
    spec.topRowHandle,
    spec.cabinetHandle,
  ]) {
    if (name !== undefined) named.push(handle(name));
  }
  return sortedOnce(named);
}

const KIND_RANK: Record<ItemRef["kind"], number> = {
  material: 0,
  hardware: 1,
  finish: 2,
  handle: 3,
  accessory: 4,
};

function sortedOnce(items: readonly ItemRef[]): readonly ItemRef[] {
  const keyOf = (item: ItemRef): string =>
    `${String(KIND_RANK[item.kind])}|${JSON.stringify(item)}`;
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  return [...byKey.entries()]
    .sort(([one], [other]) => (one < other ? -1 : one > other ? 1 : 0))
    .map(([, item]) => item);
}

function switchedOffAmong(
  named: readonly ItemRef[],
  disabled: readonly ItemRef[],
): readonly ItemRef[] {
  return named.filter((item) => disabled.some((off) => isSameItem(off, item)));
}

describe("P4a-a swept: the refusal is exactly what the design names and availability switches off", () => {
  it("is REPLACEMENT_REQUIRED listing that set, in one order, or a price when the set is empty, and is never UNKNOWN_TIER", () => {
    fc.assert(
      fc.property(aNamingSpec, aSubsetOf(WHOLE_UNIVERSE), (spec, disabled) => {
        const result = priceUnder(availabilityOf(disabled), designNaming(spec));

        const expected = switchedOffAmong(itemsTheSpecNames(spec), disabled);
        expect(codeOf(result)).not.toBe("UNKNOWN_TIER");
        if (expected.length === 0) {
          expect(codeOf(result)).toBe("OK");
        } else {
          expect(refusalItemsOf(result)).toEqual(expected);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("never holds an item twice, and never holds one the design did not name", () => {
    fc.assert(
      fc.property(aNamingSpec, aSubsetOf(WHOLE_UNIVERSE), (spec, disabled) => {
        const items = refusalItemsOf(
          priceUnder(availabilityOf(disabled), designNaming(spec)),
        );

        const named = itemsTheSpecNames(spec);
        for (const item of items ?? []) {
          expect(named.filter((one) => isSameItem(one, item))).toHaveLength(1);
          expect(
            (items ?? []).filter((one) => isSameItem(one, item)),
          ).toHaveLength(1);
        }
      }),
    );
  });

  it("gives the same refusal bytes whatever order availability lists its items in", () => {
    fc.assert(
      fc.property(
        aNamingSpec,
        fc.shuffledSubarray([...WHOLE_UNIVERSE], { minLength: 1 }),
        fc.nat(),
        (spec, disabled, seed) => {
          const design = designNaming(spec);
          const turn = seed % disabled.length;
          const rotated = [...disabled.slice(turn), ...disabled.slice(0, turn)];

          expect(
            JSON.stringify(priceUnder(availabilityOf(rotated), design)),
          ).toBe(JSON.stringify(priceUnder(availabilityOf(disabled), design)));
          expect(
            JSON.stringify(
              priceUnder(availabilityOf([...disabled].reverse()), design),
            ),
          ).toBe(JSON.stringify(priceUnder(availabilityOf(disabled), design)));
        },
      ),
    );
  });

  it("gives the same refusal bytes whatever order the design's placements are written in", () => {
    const aWornCabinetEach = KITCHEN_L_DESIGN.placements.reduce<Design>(
      (design, placement, position) => {
        const definition = CATALOG.get(placement.body.buildId);
        if (
          definition === undefined ||
          !definition.canFinish ||
          !definition.canHandle
        ) {
          return design;
        }
        return withBodyOf(
          placement.id,
          {
            finish: paletteFinish(PALETTE_ENTRY_IDS[position % 6] ?? "pal.alb"),
            handle: HandleSchema.options[position % 3] ?? "steel",
          },
          design,
        );
      },
      KITCHEN_L_DESIGN,
    );
    const everyColourAndHandle: readonly ItemRef[] = [
      ...PALETTE_ENTRY_IDS.slice(0, 6).map(colour),
      ...HandleSchema.options.map(handle),
    ];
    const reference = JSON.stringify(
      priceUnder(availabilityOf(everyColourAndHandle), aWornCabinetEach),
    );

    expect(reference).toContain("REPLACEMENT_REQUIRED");
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...aWornCabinetEach.placements], {
          minLength: aWornCabinetEach.placements.length,
        }),
        (placements) => {
          const shuffled: Design = { ...aWornCabinetEach, placements };

          expect(
            JSON.stringify(
              priceUnder(availabilityOf(everyColourAndHandle), shuffled),
            ),
          ).toBe(reference);
        },
      ),
    );
  });
});

describe("P4a-c swept: the sheet and the refusal are one set, and a row never offers a switched-off item", () => {
  /** Whether the group an item belongs to has an active option, decided from the declarations and not the query. */
  function hasAnActiveOption(
    item: ItemRef,
    spec: NamingSpec,
    disabled: readonly ItemRef[],
  ): boolean {
    const isOn = (option: ItemRef) =>
      !disabled.some((off) => isSameItem(off, option));
    switch (item.kind) {
      case "material":
        return MATERIAL_TIER_IDS.map(material).some(isOn);
      case "hardware":
        return HARDWARE_TIER_IDS.map(hardware).some(isOn);
      case "handle":
        return HandleSchema.options.map(handle).some(isOn);
      case "finish": {
        const ownMaterial = materialById(
          spec.materialTierId ?? BOOK.material.defaultTierId,
        );
        return paletteEntriesOf(ownMaterial)
          .map((entry) => colour(entry.entryId))
          .some(isOn);
      }
      case "accessory":
        return false;
    }
  }

  it("lists the refusal's items as its rows, each with only active options, or throws only where a group has none", () => {
    fc.assert(
      fc.property(aNamingSpec, aSubsetOf(WHOLE_UNIVERSE), (spec, disabled) => {
        const design = designNaming(spec);
        const availability = availabilityOf(disabled);
        const refusedOn = refusalItemsOf(priceUnder(availability, design));
        const expected = switchedOffAmong(itemsTheSpecNames(spec), disabled);
        const rowsAreDue = expected.every((item) =>
          hasAnActiveOption(item, spec, disabled),
        );

        if (!rowsAreDue) {
          expect(() =>
            replacementsRequired(design, BOOK, availability, CATALOG),
          ).toThrow(NoReplacementOptionError);
          return;
        }
        const rows = replacementsRequired(design, BOOK, availability, CATALOG);
        expect(rows.map((row) => row.item)).toEqual(refusedOn ?? []);
        for (const row of rows) {
          expect(row.remaining.length).toBeGreaterThan(0);
          for (const option of row.remaining) {
            expect(disabled.some((off) => isSameItem(off, option))).toBe(false);
            expect(option.kind).toBe(row.item.kind);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// P4a-b: availability reaches the answer only through what the design names (random designs, independent oracle)

describe("P4a-b swept over random designs: switching off what a design does not use changes no byte", () => {
  const SHIPPED_DEFAULTS: readonly ItemRef[] = [
    handle(DEFAULT_HANDLE),
    handle(TOP_ROW_HANDLE),
    ...MATERIALS.map((one) => one.defaultFinish).flatMap((finish) =>
      finish.kind === "palette-entry" ? [colour(finish.entryId)] : [],
    ),
  ];

  const aSubDesign = fc
    .tuple(
      fc.subarray([...KITCHEN_L_DESIGN.placements], { minLength: 1 }),
      aNamingSpec,
    )
    .map(([placements, spec]): Design => {
      const named = designNaming(spec);
      return { ...named, placements: pruned(placements, named) };
    });

  /** Keeps the generated placement subset's bodies as the named design has them: a placement the subset dropped is gone,
   *  and one it kept carries what `designNaming` gave it. */
  function pruned(
    kept: readonly Design["placements"][number][],
    named: Design,
  ): Design["placements"] {
    const keptIds = new Set(kept.map((placement) => placement.id));
    return named.placements.filter((placement) => keptIds.has(placement.id));
  }

  /** Independent of `itemsNamedBy`: an id is unused when its text appears nowhere in the document, the tier is neither
   *  chosen nor the fallback, and an accessory is one no sink can earn. The defaults a design follows without naming are
   *  left out on purpose; whether they are "used" is the architect's open question, pinned further down. */
  function unusedBy(design: Design): readonly ItemRef[] {
    const text = JSON.stringify(design);
    const chosen = design.settings;
    const hasASink = design.placements.some((placement) =>
      placement.body.buildId.includes("sink"),
    );
    return WHOLE_UNIVERSE.filter((item) => {
      if (SHIPPED_DEFAULTS.some((followed) => isSameItem(followed, item))) {
        return false;
      }
      switch (item.kind) {
        case "material":
          return (
            item.tierId !==
            (chosen?.materialTierId ?? BOOK.material.defaultTierId)
          );
        case "hardware":
          return (
            item.tierId !==
            (chosen?.hardwareTierId ?? BOOK.hardware.defaultTierId)
          );
        case "finish":
          return !text.includes(item.finishId);
        case "handle":
          return !text.includes(`"${item.handle}"`);
        case "accessory":
          return !hasASink || item.accessoryId.includes("linked");
      }
    });
  }

  it("gives the bytes an empty availability gives, for any subset of the unused items and any revision", () => {
    fc.assert(
      fc.property(
        aSubDesign,
        fc.nat(),
        fc.string({ minLength: 1, maxLength: 8 }),
        (design, selector, revision) => {
          const unused = unusedBy(design);
          const chosen = unused.filter(
            (_item, position) => (selector >> position % 30) % 2 === 1,
          );

          expect(
            JSON.stringify(
              priceUnder(availabilityOf(chosen, revision), design),
            ),
          ).toBe(JSON.stringify(priceUnder(NOTHING_DISABLED, design)));
        },
      ),
      { numRuns: 300 },
    );
  });

  it("is not vacuous: the generated designs mostly have an unused universe to switch off, and some are refused or priced", () => {
    const seen = fc.sample(aSubDesign, 60).map((design) => ({
      unused: unusedBy(design).length,
      code: codeOf(priceUnder(NOTHING_DISABLED, design)),
    }));

    expect(seen.filter(({ unused }) => unused >= 5).length).toBeGreaterThan(30);
    expect(new Set(seen.map(({ code }) => code)).has("OK")).toBe(true);
  });
});

describe("P4a-b: availability is read from beside the book, never from it", () => {
  const FLAG_NAMES = new Set([
    "active",
    "inactive",
    "enabled",
    "disabled",
    "available",
    "unavailable",
    "isActive",
    "withdrawn",
    "availability",
  ]);

  /** A plain copy of the book whose every nested read of a flag-shaped key is recorded. */
  function bookWatchedForFlags(reads: string[]): PriceBook {
    const watch = <TValue extends object>(value: TValue): TValue =>
      new Proxy(value, {
        get(target, key, receiver) {
          if (typeof key === "string" && FLAG_NAMES.has(key)) reads.push(key);
          const read: unknown = Reflect.get(target, key, receiver);
          return typeof read === "object" && read !== null ? watch(read) : read;
        },
      });
    return watch(JSON.parse(JSON.stringify(BOOK)) as PriceBook);
  }

  it("prices, refuses and builds the sheet without reading an active, enabled or availability key off the book", () => {
    const reads: string[] = [];
    const watched = bookWatchedForFlags(reads);
    const design = designNaming({
      materialTierId: "material.veneer",
      hardwareTierId: "hardware.premium",
      kitchenColour: "veneer.nuc",
      kitchenHandle: "black",
      topRowHandle: undefined,
      cabinetColour: undefined,
      cabinetHandle: undefined,
    });
    const switchedOff = availabilityOf([colour("veneer.nuc"), COVER]);

    priceUnder(NOTHING_DISABLED, design, watched);
    const refused = priceUnder(switchedOff, design, watched);
    replacementsRequired(design, watched, switchedOff, CATALOG);

    expect(refusalItemsOf(refused)).toEqual([colour("veneer.nuc")]);
    expect(reads).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// P4a-d: accessories

describe("P4a-d swept: a switched-off accessory is a missing line, and the notice names what the price stopped billing", () => {
  const baseline = priceUnder(NOTHING_DISABLED);
  if (!baseline.ok) throw new Error("the shipped kitchen must price");
  const billed = (result: PricingResult): readonly string[] =>
    result.ok
      ? result.priced.lines
          .filter(
            (line): line is AccessoryPriceLine => line.kind === "accessory",
          )
          .map((line) => line.accessoryId)
      : [];

  it("drops exactly the lines whose accessory is off, moves the total by their amounts, and leaves every other line alone", () => {
    fc.assert(
      fc.property(aSubsetOf(WHOLE_UNIVERSE), (disabled) => {
        const result = priceUnder(availabilityOf(disabled));
        if (!result.ok) {
          expect(result.failure.code).toBe("REPLACEMENT_REQUIRED");
          return;
        }
        const droppedLines = baseline.priced.lines.filter(
          (line) =>
            line.kind === "accessory" &&
            disabled.some(
              (off) =>
                off.kind === "accessory" &&
                off.accessoryId === line.accessoryId,
            ),
        );
        expect(result.priced.lines).toEqual(
          baseline.priced.lines.filter((line) => !droppedLines.includes(line)),
        );
        expect(result.priced.totalMinor).toBe(
          baseline.priced.totalMinor -
            droppedLines.reduce((sum, line) => sum + line.amountMinor, 0),
        );
      }),
    );
  });

  it("names, for any pair of availabilities, the earned accessories that went from on to off, and only those", () => {
    const kitchens: readonly [string, Design, readonly ItemRef[]][] = [
      ["a sink and a rack host", KITCHEN_L_DESIGN, [RACK, COVER]],
      [
        "no sink at all",
        {
          ...KITCHEN_L_DESIGN,
          placements: KITCHEN_L_DESIGN.placements.filter(
            (placement) => !placement.body.buildId.includes("sink"),
          ),
        },
        [],
      ],
    ];
    for (const [, design, earned] of kitchens) {
      fc.assert(
        fc.property(
          aSubsetOf(WHOLE_UNIVERSE),
          aSubsetOf(WHOLE_UNIVERSE),
          (seen, current) => {
            const isOffIn = (set: readonly ItemRef[], item: ItemRef) =>
              set.some((off) => isSameItem(off, item));
            const expected = earned.filter(
              (item) => isOffIn(current, item) && !isOffIn(seen, item),
            );

            expect(
              removedAccessoriesSince(
                design,
                availabilityOf(seen, "s"),
                availabilityOf(current, "c"),
                CATALOG,
              ),
            ).toEqual(expected);
          },
        ),
      );
    }
  });

  it("agrees with the price: what the notice names is what the price no longer bills, when both are asked of one kitchen", () => {
    fc.assert(
      fc.property(aSubsetOf([COVER, RACK]), (disabled) => {
        const noLongerBilled = billed(baseline).filter(
          (id) => !billed(priceUnder(availabilityOf(disabled))).includes(id),
        );

        expect(
          removedAccessoriesSince(
            KITCHEN_L_DESIGN,
            NOTHING_DISABLED,
            availabilityOf(disabled),
            CATALOG,
          )
            .map((item) => (item.kind === "accessory" ? item.accessoryId : ""))
            .sort(),
        ).toEqual([...noLongerBilled].sort());
      }),
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Hostile inputs

describe("hostile availability: a frozen, repeated, oversized or foreign-kinded list is read, never changed or tripped on", () => {
  const namedKitchen = designNaming({
    materialTierId: "material.veneer",
    hardwareTierId: "hardware.premium",
    kitchenColour: "veneer.nuc",
    kitchenHandle: "black",
    topRowHandle: "steel",
    cabinetColour: "veneer.stejar",
    cabinetHandle: "push",
  });

  function deepFrozen<TValue extends object>(value: TValue): TValue {
    Object.values(value).forEach((member) => {
      if (typeof member === "object" && member !== null) deepFrozen(member);
    });
    return Object.freeze(value);
  }

  it("prices, refuses and lists removed accessories under a deeply frozen availability, so nothing sorts or edits it in place", () => {
    const frozen = deepFrozen(
      availabilityOf([
        handle("steel"),
        material("material.veneer"),
        COVER,
        colour("veneer.nuc"),
        hardware("hardware.premium"),
      ]),
    );

    expect(() => priceUnder(frozen, namedKitchen)).not.toThrow();
    expect(() =>
      replacementsRequired(namedKitchen, BOOK, frozen, CATALOG),
    ).not.toThrow();
    expect(() =>
      removedAccessoriesSince(KITCHEN_L_DESIGN, frozen, frozen, CATALOG),
    ).not.toThrow();
    expect(frozen.disabled.map((item) => item.kind)).toEqual([
      "handle",
      "material",
      "accessory",
      "finish",
      "hardware",
    ]);
  });

  it("returns items that are the design's own, never the objects availability holds, so a consumer cannot edit availability through a refusal", () => {
    const listed = [material("material.veneer"), handle("black")];
    const result = priceUnder(availabilityOf(listed), namedKitchen);

    for (const item of refusalItemsOf(result) ?? []) {
      expect(listed.includes(item)).toBe(false);
    }
    expect(refusalItemsOf(result)).toHaveLength(2);
  });

  it("is untroubled by an item of a kind it does not know, as a newer writer's list could hold one", () => {
    const foreign = { kind: "worktop", worktopId: "x" } as unknown as ItemRef;

    const result = priceUnder(availabilityOf([foreign, COVER]));

    expect(result.ok).toBe(true);
    expect(billedIds(result)).toEqual(["dishDryingRack"]);
  });

  it("is untroubled by a list of five thousand items, and by an item that names nothing", () => {
    const crowd: ItemRef[] = Array.from({ length: 5000 }, (_, position) =>
      colour(`pal.crowd-${String(position)}`),
    );
    const nameless = { kind: "material" } as unknown as ItemRef;

    const result = priceUnder(availabilityOf([...crowd, nameless]));

    expect(result.ok).toBe(true);
  });

  function billedIds(result: PricingResult): readonly string[] {
    return result.ok
      ? result.priced.lines.flatMap((line) =>
          line.kind === "accessory" ? [line.accessoryId] : [],
        )
      : [];
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Edge semantics: current behaviour, pinned, for the architect (none of these decides the question)

describe("A-9 fallback tiers: a design that names no tier is priced at the book's fallback, so the fallback is named", () => {
  it("refuses a design that chose no hardware when the fallback hardware class is switched off, and offers the others", () => {
    const fallback = BOOK.hardware.defaultTierId;
    const availability = availabilityOf([hardware(fallback)]);

    const refused = priceUnder(availability);
    const [row] = replacementsRequired(
      KITCHEN_L_DESIGN,
      BOOK,
      availability,
      CATALOG,
    );

    expect(refusalItemsOf(refused)).toEqual([hardware(fallback)]);
    expect(row?.remaining).toEqual(
      HARDWARE_TIER_IDS.filter((id) => id !== fallback).map(hardware),
    );
  });

  it("does not refuse a design that chose another tier because the fallback it never uses is switched off", () => {
    const result = priceUnder(
      availabilityOf([
        material(BOOK.material.defaultTierId),
        hardware(BOOK.hardware.defaultTierId),
      ]),
      withSettings({
        cabinetDepthMm: 600,
        materialTierId: "material.veneer",
        hardwareTierId: "hardware.premium",
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("names the fallback and not a tier the document does not hold: the design's chosen unknown tier is UNKNOWN_TIER's, whatever is off", () => {
    const result = priceUnder(
      availabilityOf([
        material(BOOK.material.defaultTierId),
        material("material.unobtainium"),
      ]),
      withSettings({
        cabinetDepthMm: 600,
        materialTierId: "material.unobtainium",
      }),
    );

    expect(codeOf(result)).toBe("UNKNOWN_TIER");
  });
});

describe("CURRENT BEHAVIOUR for the architect: what a design wears without storing it is not named", () => {
  it("a kitchen that stores no handle wears the slot defaults, and switching both off refuses nothing", () => {
    const result = priceUnder(
      availabilityOf([handle(DEFAULT_HANDLE), handle(TOP_ROW_HANDLE)]),
    );

    expect(KITCHEN_L_DESIGN.settings?.handle).toBeUndefined();
    expect(KITCHEN_L_DESIGN.settings?.topRowHandle).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it.each(
    MATERIALS.flatMap((one) =>
      one.defaultFinish.kind === "palette-entry"
        ? [[one.materialId, one.defaultFinish.entryId] as const]
        : [],
    ),
  )(
    "a %s kitchen that stores no colour wears %s, and switching it off refuses nothing",
    (materialId, defaultColourId) => {
      const result = priceUnder(
        availabilityOf([colour(defaultColourId)]),
        withSettings({ cabinetDepthMm: 600, materialTierId: materialId }),
      );

      expect(result.ok).toBe(true);
    },
  );

  it("the asymmetry: a stored topRowHandle on a kitchen with no top row IS named, where the followed default is not", () => {
    const noTopRow: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => !placement.body.buildId.endsWith("-top"),
      ),
      settings: { cabinetDepthMm: 600, topRowHandle: "black" },
    };

    expect(priceUnder(NOTHING_DISABLED, noTopRow).ok).toBe(true);
    expect(
      refusalItemsOf(priceUnder(availabilityOf([handle("black")]), noTopRow)),
    ).toEqual([handle("black")]);
  });

  it("the asymmetry: a kitchen handle every cabinet overrides is still named, though no cabinet follows it", () => {
    const everyCabinetOwnsItsHandle: Design = {
      ...withSettings({ cabinetDepthMm: 600, handle: "black" }),
      placements: KITCHEN_L_DESIGN.placements.map((placement) => ({
        ...placement,
        body: { ...placement.body, handle: "steel" as const },
      })),
    };

    expect(
      refusalItemsOf(
        priceUnder(
          availabilityOf([handle("black")]),
          everyCabinetOwnsItsHandle,
        ),
      ),
    ).toEqual([handle("black")]);
  });
});

describe("CURRENT BEHAVIOUR for the architect: a disabled colour and a disabled material at once", () => {
  const veneerKitchen = withSettings({
    cabinetDepthMm: 600,
    materialTierId: "material.veneer",
    finish: paletteFinish("veneer.nuc"),
  });
  const bothOff = availabilityOf([
    material("material.veneer"),
    colour("veneer.nuc"),
  ]);

  it("lists both, the material first", () => {
    expect(refusalItemsOf(priceUnder(bothOff, veneerKitchen))).toEqual([
      material("material.veneer"),
      colour("veneer.nuc"),
    ]);
  });

  it("offers the colour row the active colours of the material that is itself switched off", () => {
    const rows = replacementsRequired(veneerKitchen, BOOK, bothOff, CATALOG);

    expect(rows.map((row) => row.remaining)).toEqual([
      [material("material.melamine"), material("material.painted-mdf")],
      [colour("veneer.stejar")],
    ]);
  });
});

describe("CURRENT BEHAVIOUR for the architect: a palette colour on a material that offers no palette", () => {
  const mdfWearingAPaletteColour = withSettings({
    cabinetDepthMm: 600,
    materialTierId: "material.painted-mdf",
    finish: paletteFinish("pal.antracit"),
  });
  const colourOff = availabilityOf([colour("pal.antracit")]);

  it("is refused by the price, naming the colour", () => {
    expect(
      refusalItemsOf(priceUnder(colourOff, mdfWearingAPaletteColour)),
    ).toEqual([colour("pal.antracit")]);
  });

  it("throws NoReplacementOptionError from the sheet for the same design: the refusal and the sheet disagree here", () => {
    expect(() =>
      replacementsRequired(mdfWearingAPaletteColour, BOOK, colourOff, CATALOG),
    ).toThrow(NoReplacementOptionError);
  });

  it("is a design the write seam refuses and the load seam rewrites, so a stored kitchen cannot reach the disagreement", () => {
    const codes = validateDesignForCatalog(
      mdfWearingAPaletteColour,
      CATALOG,
    ).map((issue) => issue.code);

    expect(codes).toContain("SETTINGS_WEAR_UNOFFERED_FINISH");
  });
});

describe("CURRENT BEHAVIOUR for the architect: a design with an unknown tier and a switched-off colour", () => {
  const unknownTierAndAColour = withSettings({
    cabinetDepthMm: 600,
    materialTierId: "material.unobtainium",
    finish: paletteFinish("pal.antracit"),
  });

  it("is refused for the colour first, and UNKNOWN_TIER only once the colour is replaced", () => {
    const first = priceUnder(
      availabilityOf([colour("pal.antracit")]),
      unknownTierAndAColour,
    );
    const afterReplacing = priceUnder(NOTHING_DISABLED, unknownTierAndAColour);

    expect(refusalItemsOf(first)).toEqual([colour("pal.antracit")]);
    expect(codeOf(afterReplacing)).toBe("UNKNOWN_TIER");
  });
});

describe("DEFECT CANDIDATE (P4a-c): a stored material the declaration does not know, with a switched-off colour, is refused and its sheet throws", () => {
  const unknownMaterialAndAColour = withSettings({
    cabinetDepthMm: 600,
    materialTierId: "material.unobtainium",
    finish: paletteFinish("pal.antracit"),
  });
  const colourOff = availabilityOf([colour("pal.antracit")]);

  it("starts from a design the write seam accepts and the load seam leaves alone, so a stored kitchen can be this", () => {
    const fatal = fatalDesignValidationIssues(
      validateDesignForCatalog(unknownMaterialAndAColour, CATALOG),
    );

    expect(fatal).toEqual([]);
  });

  it("is refused REPLACEMENT_REQUIRED for the colour, which is what sends the customer to the sheet; without the switch it is UNKNOWN_TIER", () => {
    expect(
      refusalItemsOf(priceUnder(colourOff, unknownMaterialAndAColour)),
    ).toEqual([colour("pal.antracit")]);
    expect(
      codeOf(priceUnder(NOTHING_DISABLED, unknownMaterialAndAColour)),
    ).toBe("UNKNOWN_TIER");
  });

  // Red on purpose. `coloursOfTheDesignsMaterial` (queries/replacements-required.ts) offers a colour the palette of the
  // design's material; an undeclared material has none, so `activeOptionsReplacing` throws NoReplacementOptionError.
  // P4a-c calls that throw unreachable because the dashboard never switches off a group's last option, but here no
  // last option was switched off: the set is empty because the material is unknown.
  it("builds the sheet for the refusal it just made, and does not throw", () => {
    expect(() =>
      replacementsRequired(unknownMaterialAndAColour, BOOK, colourOff, CATALOG),
    ).not.toThrow();
  });
});

describe("a design with a colour or handle on a body that cannot wear one, or a free colour, never needs replacing", () => {
  it("is priced under every colour and handle switched off, because none is named", () => {
    const worn: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) => {
        const definition = CATALOG.get(placement.body.buildId);
        return definition?.canFinish === true || definition?.canHandle === true
          ? placement
          : {
              ...placement,
              body: {
                ...placement.body,
                finish: paletteFinish("pal.antracit"),
                handle: "black" as const,
              },
            };
      }),
      settings: {
        cabinetDepthMm: 600,
        finish: freeColourFinish("#123456"),
      },
    };
    const everythingNamedByColourOrHandle = availabilityOf([
      ...PALETTE_ENTRY_IDS.map(colour),
      ...HandleSchema.options.map(handle),
    ]);

    expect(priceUnder(everythingNamedByColourOrHandle, worn).ok).toBe(true);
  });
});

describe("the barrel hands the web what P4a built", () => {
  it.each([
    "isItemDisabled",
    "isSameItem",
    "distinctItemsInOrder",
    "coloursAndHandlesNamedBy",
    "itemsNamedBy",
    "disabledItemsNamedBy",
    "earnedAccessoryQuantities",
    "removedAccessoriesSince",
    "replacementsRequired",
    "NoReplacementOptionError",
  ])("exports %s", (name) => {
    expect(typeof (barrel as Record<string, unknown>)[name]).toBe("function");
  });
});
