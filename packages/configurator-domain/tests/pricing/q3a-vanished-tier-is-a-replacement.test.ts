// A material or hardware tier the design chose and the active book does not hold is a replacement, never
// `UNKNOWN_TIER` (see ADR 0178 decision 1).
//
// The range keeps to designs whose bodies the catalogue holds (`UNKNOWN_BODY` is decided first and would turn the
// property red for the wrong reason) and to books whose defaults are their own tiers (a book whose default names no tier
// is a book fault, pinned below).
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import {
  lookUpMaterial,
  paletteEntriesOf,
  paletteFinish,
} from "../../src/materials.js";
import {
  finishItems,
  isItemDisabled,
  isSameItem,
  tierRef,
  type ItemRef,
  type TierKind,
} from "../../src/pricing/catalogue-availability.js";
import { disabledItemsNamedBy } from "../../src/pricing/named-items.js";
import type {
  PriceBook,
  TierGroup,
  TierIdentity,
} from "../../src/pricing/price-book.js";
import type { PricingFailure } from "../../src/pricing/price-lines.js";
import { replacementsRequired } from "../../src/queries/replacements-required.js";
import {
  availabilityOf,
  BOOK,
  CATALOG,
  colour,
  handle,
  kitchenNamingEverything,
  priceUnder,
  withSettings,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";

const KINDS: readonly TierKind[] = ["material", "hardware"];

type ChosenTiers = Readonly<Record<TierKind, string>>;

function tierIdsOf(book: PriceBook, kind: TierKind): readonly string[] {
  return book[kind].tiers.map(({ tierId }) => tierId);
}

function tierItemsOf(book: PriceBook, kind: TierKind): readonly ItemRef[] {
  return tierIdsOf(book, kind).map((tierId) => tierRef(kind, tierId));
}

/** The tiers of a group other than its default: the ones a book may drop or availability may switch off. */
function nonDefaultTierIds(kind: TierKind): readonly string[] {
  return tierIdsOf(BOOK, kind).filter(
    (tierId) => tierId !== BOOK[kind].defaultTierId,
  );
}

/** A book that keeps its two defaults and the given other tiers, in the book's own order. */
function bookKeeping(
  keptMaterialIds: readonly string[],
  keptHardwareIds: readonly string[],
): PriceBook {
  return {
    ...BOOK,
    material: keepOnly(BOOK.material, keptMaterialIds),
    hardware: keepOnly(BOOK.hardware, keptHardwareIds),
  };
}

function keepOnly<TTier extends TierIdentity>(
  group: TierGroup<TTier>,
  keptIds: readonly string[],
): TierGroup<TTier> {
  return {
    ...group,
    tiers: group.tiers.filter(
      ({ tierId }) =>
        tierId === group.defaultTierId || keptIds.includes(tierId),
    ),
  };
}

function failureOf(result: ReturnType<typeof priceUnder>): PricingFailure {
  if (result.ok) throw new Error("expected a refusal, got a price");
  return result.failure;
}

function designChoosing(chosen: Partial<Record<TierKind, string>>): Design {
  return withSettings({
    cabinetDepthMm: 600,
    ...(chosen.material === undefined
      ? {}
      : { materialTierId: chosen.material }),
    ...(chosen.hardware === undefined
      ? {}
      : { hardwareTierId: chosen.hardware }),
  });
}

/** The kitchen that names a colour and handles at both levels, wearing the given material and hardware tiers. */
function kitchenWearing(chosen: ChosenTiers): Design {
  const kitchen = kitchenNamingEverything();
  if (kitchen.settings === undefined) throw new Error("no settings");
  return {
    ...kitchen,
    settings: {
      ...kitchen.settings,
      materialTierId: chosen.material,
      hardwareTierId: chosen.hardware,
    },
  };
}

const arbitraryBook = fc
  .tuple(
    fc.subarray([...nonDefaultTierIds("material")]),
    fc.subarray([...nonDefaultTierIds("hardware")]),
  )
  .map(([materials, hardware]) => bookKeeping(materials, hardware));

/** An id the sample book holds in no group, so no book built from it holds it either. */
const arbitraryUnheldId = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter((id) => !KINDS.some((kind) => tierIdsOf(BOOK, kind).includes(id)));

/** A tier id the book lacks: a tier the sample book has and this book dropped (the realistic deletion), or an id nobody
 *  ever held. */
function arbitraryVanishedId(book: PriceBook, kind: TierKind) {
  const dropped = tierIdsOf(BOOK, kind).filter(
    (tierId) => !tierIdsOf(book, kind).includes(tierId),
  );
  return dropped.length === 0
    ? arbitraryUnheldId
    : fc.oneof(arbitraryUnheldId, fc.constantFrom(...dropped));
}

/** What a design chose: a vanished tier in at least one group, the book's own default in the other. */
function arbitraryChosenTiers(book: PriceBook) {
  return fc
    .record({
      material: fc.option(arbitraryVanishedId(book, "material"), {
        nil: undefined,
      }),
      hardware: fc.option(arbitraryVanishedId(book, "hardware"), {
        nil: undefined,
      }),
    })
    .filter(
      ({ material, hardware }) =>
        material !== undefined || hardware !== undefined,
    )
    .map(({ material, hardware }) => ({
      chosen: {
        material: material ?? book.material.defaultTierId,
        hardware: hardware ?? book.hardware.defaultTierId,
      },
      vanishedKinds: KINDS.filter((kind) =>
        kind === "material" ? material !== undefined : hardware !== undefined,
      ),
    }));
}

/**
 * Items availability may switch off, never the last active option of a group (A-17): the book's non-default tiers, the
 * kitchen's colour, and two of the three handles. The colour is offered only for a material whose palette holds it and
 * another entry: a colour of a palette the material does not have is no kitchen this product draws.
 */
function arbitrarySwitchedOff(book: PriceBook, chosen: ChosenTiers) {
  const tiers = KINDS.flatMap((kind) =>
    tierIdsOf(book, kind)
      .filter((tierId) => tierId !== book[kind].defaultTierId)
      .map((tierId) => tierRef(kind, tierId)),
  );
  const colours = materialOffersTwoColoursIncludingTheKitchensOwn(
    chosen.material,
  )
    ? [colour("veneer.nuc")]
    : [];
  return fc.subarray([...tiers, ...colours, handle("black"), handle("steel")]);
}

function materialOffersTwoColoursIncludingTheKitchensOwn(
  materialId: string,
): boolean {
  const lookup = lookUpMaterial(materialId);
  if (lookup.kind === "undeclared") return false;
  const palette = finishItems(paletteEntriesOf(lookup.material));
  return (
    palette.length >= 2 &&
    palette.some((option) => isSameItem(option, colour("veneer.nuc")))
  );
}

const arbitraryScenario = arbitraryBook.chain((book) =>
  arbitraryChosenTiers(book).chain(({ chosen, vanishedKinds }) =>
    arbitrarySwitchedOff(book, chosen).map((switchedOff) => ({
      book,
      design: kitchenWearing(chosen),
      chosen,
      vanishedKinds,
      availability: availabilityOf(switchedOff),
    })),
  ),
);

describe("a chosen tier the active book does not hold is a replacement", () => {
  it("is refused REPLACEMENT_REQUIRED listing that tier, offers exactly the group's active tiers, preselects nothing", () => {
    fc.assert(
      fc.property(
        arbitraryScenario,
        ({ book, design, chosen, vanishedKinds, availability }) => {
          const failure = failureOf(priceUnder(availability, design, book));
          const rows = replacementsRequired({
            design,
            book,
            availability,
            catalog: CATALOG,
          });

          expect(failure.code).toBe("REPLACEMENT_REQUIRED");
          if (failure.code !== "REPLACEMENT_REQUIRED") return;
          for (const kind of vanishedKinds) {
            const vanished = tierRef(kind, chosen[kind]);
            const row = rows.find(({ item }) => isSameItem(item, vanished));
            expect(failure.items.some((i) => isSameItem(i, vanished))).toBe(
              true,
            );
            expect(row?.remaining).toEqual(
              tierItemsOf(book, kind).filter(
                (option) => !isItemDisabled(availability, option),
              ),
            );
          }
        },
      ),
    );
  });

  it("keeps the refusal's items and the sheet's rows one list, a vanished tier and switched-off items together", () => {
    fc.assert(
      fc.property(arbitraryScenario, ({ book, design, availability }) => {
        const failure = failureOf(priceUnder(availability, design, book));
        const rows = replacementsRequired({
          design,
          book,
          availability,
          catalog: CATALOG,
        });

        expect(failure.code).toBe("REPLACEMENT_REQUIRED");
        if (failure.code !== "REPLACEMENT_REQUIRED") return;
        expect(rows.map(({ item }) => item)).toEqual(failure.items);
        for (const { remaining } of rows) {
          expect(
            remaining.some((option) => isItemDisabled(availability, option)),
          ).toBe(false);
        }
      }),
    );
  });

  it("lists a vanished tier once, even when availability also lists it", () => {
    const design = designChoosing({ material: "material.deleted" });
    const deleted = tierRef("material", "material.deleted");

    expect(
      disabledItemsNamedBy(
        {
          design,
          catalog: CATALOG,
          book: BOOK,
          chosen: design.settings,
        },
        availabilityOf([deleted]),
      ),
    ).toEqual([deleted]);
  });
});

describe("what stays UNKNOWN_TIER", () => {
  it("a choice-less design against a book whose default names no tier names no replacement", () => {
    const bookFault: PriceBook = {
      ...BOOK,
      hardware: { ...BOOK.hardware, defaultTierId: "hardware.retired" },
    };

    const failure = failureOf(
      priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, bookFault),
    );

    expect(failure).toMatchObject({
      code: "UNKNOWN_TIER",
      id: "hardware.retired",
    });
    expect(
      disabledItemsNamedBy(
        {
          design: KITCHEN_L_DESIGN,
          catalog: CATALOG,
          book: bookFault,
          chosen: KITCHEN_L_DESIGN.settings,
        },
        NOTHING_DISABLED,
      ),
    ).toEqual([]);
  });

  it("a chosen tier the book holds is a replacement only while it is switched off", () => {
    const design = designChoosing({ hardware: "hardware.premium" });
    const premium = tierRef("hardware", "hardware.premium");

    expect(
      failureOf(priceUnder(availabilityOf([premium]), design)),
    ).toMatchObject({ code: "REPLACEMENT_REQUIRED", items: [premium] });
    expect(priceUnder(NOTHING_DISABLED, design).ok).toBe(true);
  });
});

describe("a colour is not listed while its material has vanished (the material change resets it, ADR 0057)", () => {
  it("lists the vanished material alone, in the refusal and the sheet, though its palette colour is switched off", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.deleted",
      finish: paletteFinish("pal.antracit"),
    });
    const availability = availabilityOf([colour("pal.antracit")]);
    const deleted = tierRef("material", "material.deleted");

    const failure = failureOf(priceUnder(availability, design));
    const rows = replacementsRequired({
      design,
      book: BOOK,
      availability,
      catalog: CATALOG,
    });

    expect(failure).toMatchObject({ items: [deleted] });
    expect(rows.map(({ item }) => item)).toEqual([deleted]);
  });

  it("still lists the colour while the material is held", () => {
    const design = withSettings({
      cabinetDepthMm: 600,
      materialTierId: "material.melamine",
      finish: paletteFinish("pal.antracit"),
    });
    const antracit = colour("pal.antracit");

    expect(
      failureOf(priceUnder(availabilityOf([antracit]), design)),
    ).toMatchObject({ items: [antracit] });
  });
});

describe("a vanished tier is replaced from its own group", () => {
  it("offers the active material tiers for a vanished material and the active hardware tiers for a vanished one", () => {
    const design = designChoosing({
      material: "material.deleted",
      hardware: "hardware.deleted",
    });
    const veneer = tierRef("material", "material.veneer");

    const rows = replacementsRequired({
      design,
      book: BOOK,
      availability: availabilityOf([veneer]),
      catalog: CATALOG,
    });

    expect(rows).toEqual([
      {
        item: tierRef("material", "material.deleted"),
        remaining: tierItemsOf(BOOK, "material").filter(
          (option) => !isSameItem(option, veneer),
        ),
      },
      {
        item: tierRef("hardware", "hardware.deleted"),
        remaining: tierItemsOf(BOOK, "hardware"),
      },
    ]);
  });
});
