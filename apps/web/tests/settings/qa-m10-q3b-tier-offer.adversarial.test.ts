// M10 Q3b adversarial QA: the whole-kitchen tier offer under any availability, against an oracle that shares no code with it.
//
// The implementer's sweep compares the offer with the same query run over a book that never held the switched-off tiers,
// on a design that carries no tier. That leaves three corners it cannot reach: a kitchen that CARRIES a tier (so a switch
// can hit the tier it wears), a group switched off ENTIRELY, and a delta that agrees with its oracle only because both are
// `undefined`. Here the design's carried tiers are part of the sweep, the oracle prices through `priceDesign` directly
// (total at the tier minus total at the group's default), and the sweep counts how many runs compared real numbers so it
// cannot go green by comparing blanks.
import { fc } from "@fast-check/vitest";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  tierRef,
  type CatalogueAvailability,
  type Design,
  type PriceBook,
  type TierGroup,
  type TierIdentity,
  type TierKind,
  type WholeKitchenSelections,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  NO_PRICE_BOOK,
  NO_TIER_OFFER,
  offerTiersAgainstBook,
} from "@/price/price-book-root";
import {
  isTierOffered,
  offerWholeKitchenTiers,
  UnofferedDefaultTierError,
  type OfferedTierGroup,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";

import { NOTHING_DISABLED } from "../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const SWEEP_SEED = 20_261_110;
const SWEEP_RUNS = 200;

const MATERIAL_IDS = SAMPLE_PRICE_BOOK.material.tiers.map((t) => t.tierId);
const HARDWARE_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map((t) => t.tierId);
const MATERIAL_DEFAULT = SAMPLE_PRICE_BOOK.material.defaultTierId;
const HARDWARE_DEFAULT = SAMPLE_PRICE_BOOK.hardware.defaultTierId;

function designCarrying(
  materialTierId: string | undefined,
  hardwareTierId: string | undefined,
): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      ...(materialTierId === undefined ? {} : { materialTierId }),
      ...(hardwareTierId === undefined ? {} : { hardwareTierId }),
    },
  };
}

function offerOf(
  book: PriceBook,
  availability: CatalogueAvailability,
  design: Design,
): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book,
    pricingVersion: book.version,
    selections: design.settings,
  });
}

function switchedOff(
  materials: readonly string[],
  hardware: readonly string[],
): CatalogueAvailability {
  return {
    revision: "1",
    disabled: [
      ...materials.map((id) => tierRef("material", id)),
      ...hardware.map((id) => tierRef("hardware", id)),
    ],
  };
}

function bookWithout<TTier extends TierIdentity>(
  group: TierGroup<TTier>,
  removed: readonly string[],
): TierGroup<TTier> {
  return {
    ...group,
    tiers: group.tiers.filter((tier) => !removed.includes(tier.tierId)),
  };
}

/** Total of the design under the book with the given selections, or undefined where it is refused. */
function totalUnder(
  book: PriceBook,
  design: Design,
  override: WholeKitchenSelections,
): number | undefined {
  const result = priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book,
    pricingVersion: book.version,
    selections: { ...design.settings, ...override },
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
  });
  return result.ok ? result.priced.totalMinor : undefined;
}

/**
 * The delta a tier should state, priced straight from the domain over a book that never held the switched-off tiers:
 * the total with the tier chosen minus the total with the group's default chosen. Undefined where either is refused or
 * the tier is cheaper than the default (hardware offers such a tier with no badge).
 */
function oracleDelta(
  book: PriceBook,
  design: Design,
  kind: TierKind,
  tierId: string,
): number | undefined {
  const key = kind === "material" ? "materialTierId" : "hardwareTierId";
  const at = totalUnder(book, design, { [key]: tierId });
  const baseline = totalUnder(book, design, {
    [key]: book[kind].defaultTierId,
  });
  if (at === undefined || baseline === undefined) return undefined;
  return at - baseline >= 0 ? at - baseline : undefined;
}

function deltasOf(group: OfferedTierGroup): readonly (number | undefined)[] {
  return group.tiers.map((tier) => tier.deltaMinor);
}

const maybeOne = (ids: readonly string[]) =>
  fc.constantFrom<string | undefined>(undefined, ...ids);

const anyScenario = fc.record({
  carriedMaterial: maybeOne(MATERIAL_IDS),
  carriedHardware: maybeOne(HARDWARE_IDS),
  offMaterials: fc.subarray([...MATERIAL_IDS]),
  offHardware: fc.subarray([...HARDWARE_IDS]),
});

describe("any subset of tiers switched off, on a kitchen that may carry any tier", () => {
  it("never throws, lists exactly the active tiers in book order and the rest apart, and measures like the oracle where it can be measured", () => {
    let comparedNumbers = 0;
    let comparedBlanks = 0;
    fc.assert(
      fc.property(
        anyScenario,
        ({ carriedMaterial, carriedHardware, offMaterials, offHardware }) => {
          const design = designCarrying(carriedMaterial, carriedHardware);
          const offer = offerOf(
            SAMPLE_PRICE_BOOK,
            switchedOff(offMaterials, offHardware),
            design,
          );

          expect(offer.material.tierIds).toEqual(
            MATERIAL_IDS.filter((id) => !offMaterials.includes(id)),
          );
          expect(offer.hardware.tierIds).toEqual(
            HARDWARE_IDS.filter((id) => !offHardware.includes(id)),
          );
          expect(offer.material.tiers.map((t) => t.tierId)).toEqual(
            offer.material.tierIds,
          );
          expect(offer.hardware.tiers.map((t) => t.tierId)).toEqual(
            offer.hardware.tierIds,
          );
          expect(offer.material.switchedOffTiers.map((t) => t.tierId)).toEqual(
            MATERIAL_IDS.filter((id) => offMaterials.includes(id)),
          );
          expect(offer.hardware.switchedOffTiers.map((t) => t.tierId)).toEqual(
            HARDWARE_IDS.filter((id) => offHardware.includes(id)),
          );

          const isBlocked =
            offMaterials.includes(MATERIAL_DEFAULT) ||
            offHardware.includes(HARDWARE_DEFAULT) ||
            (carriedMaterial !== undefined &&
              offMaterials.includes(carriedMaterial)) ||
            (carriedHardware !== undefined &&
              offHardware.includes(carriedHardware));
          if (isBlocked) {
            // A baseline-less group or a kitchen wearing a switched-off tier cannot be measured: no number anywhere,
            // because a half-set would show amounts measured against different kitchens.
            expect(deltasOf(offer.material).every((d) => d === undefined)).toBe(
              true,
            );
            expect(deltasOf(offer.hardware).every((d) => d === undefined)).toBe(
              true,
            );
            comparedBlanks += 1;
            return;
          }
          const oracleBook: PriceBook = {
            ...SAMPLE_PRICE_BOOK,
            material: bookWithout(SAMPLE_PRICE_BOOK.material, offMaterials),
            hardware: bookWithout(SAMPLE_PRICE_BOOK.hardware, offHardware),
          };
          expect(deltasOf(offer.material)).toEqual(
            offer.material.tierIds.map((id) =>
              oracleDelta(oracleBook, design, "material", id),
            ),
          );
          expect(deltasOf(offer.hardware)).toEqual(
            offer.hardware.tierIds.map((id) =>
              oracleDelta(oracleBook, design, "hardware", id),
            ),
          );
          comparedNumbers += offer.material.tiers.length;
          comparedNumbers += offer.hardware.tiers.length;
        },
      ),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );

    // Not vacuous: the sweep has to have compared real amounts, and has to have reached the blocked branch too.
    expect(comparedNumbers).toBeGreaterThan(200);
    expect(comparedBlanks).toBeGreaterThan(20);
  });

  it("states a number for each of the active tiers when nothing the kitchen wears is off, at least one of them above zero", () => {
    const offer = offerOf(
      SAMPLE_PRICE_BOOK,
      switchedOff([], ["hardware.premium"]),
      designCarrying("material.veneer", "hardware.soft-close"),
    );

    expect(deltasOf(offer.material)).not.toContain(undefined);
    expect(deltasOf(offer.hardware)).not.toContain(undefined);
    expect(
      [...deltasOf(offer.material), ...deltasOf(offer.hardware)].some(
        (delta) => delta !== undefined && delta > 0,
      ),
    ).toBe(true);
  });

  it("is the same answer whatever order the disabled list names the tiers in, and whether one is named twice", () => {
    fc.assert(
      fc.property(
        fc.subarray([...MATERIAL_IDS], { minLength: 1, maxLength: 2 }),
        (off) => {
          const forward = offerOf(
            SAMPLE_PRICE_BOOK,
            switchedOff(off, []),
            KITCHEN_L_DESIGN,
          );
          const backwardTwice = offerOf(
            SAMPLE_PRICE_BOOK,
            switchedOff([...off].reverse().concat(off), []),
            KITCHEN_L_DESIGN,
          );

          expect(backwardTwice).toEqual(forward);
        },
      ),
      { seed: SWEEP_SEED, numRuns: 40 },
    );
  });

  it("is deterministic: the same inputs give an equal offer", () => {
    const design = designCarrying("material.veneer", undefined);
    const availability = switchedOff(["material.painted-mdf"], []);

    expect(offerOf(SAMPLE_PRICE_BOOK, availability, design)).toEqual(
      offerOf(SAMPLE_PRICE_BOOK, availability, design),
    );
  });

  it("does not switch a hardware tier off by switching off a material of the same id", () => {
    const offer = offerOf(
      SAMPLE_PRICE_BOOK,
      { revision: "1", disabled: [tierRef("material", "hardware.premium")] },
      KITCHEN_L_DESIGN,
    );

    expect(offer.hardware.tierIds).toEqual(HARDWARE_IDS);
    expect(offer.material.tierIds).toEqual(MATERIAL_IDS);
  });
});

describe("a group with every tier switched off", () => {
  it.each(["material", "hardware"] as const)(
    "answers an empty %s list without throwing, with no number anywhere, and keeps the other group's tiers",
    (kind) => {
      const allOff =
        kind === "material"
          ? switchedOff(MATERIAL_IDS, [])
          : switchedOff([], HARDWARE_IDS);

      const offer = offerOf(SAMPLE_PRICE_BOOK, allOff, KITCHEN_L_DESIGN);

      expect(offer[kind].tierIds).toEqual([]);
      expect(offer[kind].tiers).toEqual([]);
      expect(offer[kind].switchedOffTiers.map((tier) => tier.tierId)).toEqual(
        kind === "material" ? MATERIAL_IDS : HARDWARE_IDS,
      );
      const other = kind === "material" ? "hardware" : "material";
      expect(offer[other].tierIds).toEqual(
        other === "material" ? MATERIAL_IDS : HARDWARE_IDS,
      );
      expect(deltasOf(offer[other]).every((d) => d === undefined)).toBe(true);
    },
  );

  it("switches every tier off in both groups without throwing", () => {
    const offer = offerOf(
      SAMPLE_PRICE_BOOK,
      switchedOff(MATERIAL_IDS, HARDWARE_IDS),
      KITCHEN_L_DESIGN,
    );

    expect(offer.material.tierIds).toEqual([]);
    expect(offer.hardware.tierIds).toEqual([]);
  });
});

describe("a created class published inactive", () => {
  const CREATED = "hardware.created-by-owner";
  const bookWithACreatedClass: PriceBook = {
    ...SAMPLE_PRICE_BOOK,
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: [
        ...SAMPLE_PRICE_BOOK.hardware.tiers,
        {
          ...(SAMPLE_PRICE_BOOK.hardware.tiers[2] ??
            (() => {
              throw new Error("the sample book holds no third hardware tier");
            })()),
          tierId: CREATED,
          ruleId: CREATED,
          name: "Owner class",
          description: "A class the owner created.",
          nameKey: undefined,
          descriptionKey: undefined,
        },
      ],
    },
  };
  // The created tier has no nameKey: the stand-in has to say that or it would test a keyed built-in again.
  const createdTier = bookWithACreatedClass.hardware.tiers.find(
    (tier) => tier.tierId === CREATED,
  );

  it("is a created class: it carries no message key", () => {
    expect(createdTier?.name).toBe("Owner class");
    expect(createdTier?.nameKey).toBeUndefined();
    expect(createdTier?.descriptionKey).toBeUndefined();
  });

  it("stays out of tierIds and blanks nothing when the kitchen does not wear it", () => {
    const offer = offerOf(
      bookWithACreatedClass,
      switchedOff([], [CREATED]),
      KITCHEN_L_DESIGN,
    );

    expect(offer.hardware.tierIds).toEqual(HARDWARE_IDS);
    expect(offer.hardware.switchedOffTiers.map((t) => t.tierId)).toEqual([
      CREATED,
    ]);
    expect(deltasOf(offer.material)).not.toContain(undefined);
    expect(deltasOf(offer.hardware)).not.toContain(undefined);
  });

  it("is measured as the same book without it when published active, and offered", () => {
    const offer = offerOf(
      bookWithACreatedClass,
      NOTHING_DISABLED,
      KITCHEN_L_DESIGN,
    );

    expect(offer.hardware.tierIds).toEqual([...HARDWARE_IDS, CREATED]);
    expect(deltasOf(offer.hardware)).not.toContain(undefined);
  });

  it("reaches the offer through the root with the availability the root carries, not only through the raw query", () => {
    const offer = offerTiersAgainstBook(
      {
        ...SAMPLE_PRICE_ROOT,
        book: bookWithACreatedClass,
        availability: switchedOff([], [CREATED]),
      },
      KITCHEN_L_DESIGN,
      KITCHEN_L_BODY_CATALOG,
    );

    expect(offer.hardware.tierIds).not.toContain(CREATED);
    expect(deltasOf(offer.hardware)).not.toContain(undefined);
  });
});

describe("a book that does not hold its own default", () => {
  it.each(["material", "hardware"] as const)(
    "throws UnofferedDefaultTierError for the %s group whatever is switched off, and does not mistake it for a switched-off default",
    (kind) => {
      const faulty: PriceBook = {
        ...SAMPLE_PRICE_BOOK,
        [kind]: {
          ...SAMPLE_PRICE_BOOK[kind],
          defaultTierId: `${kind}.nowhere`,
        },
      };
      const everyOffSet = [
        [[], []],
        [MATERIAL_IDS, HARDWARE_IDS],
        [MATERIAL_IDS.slice(1), HARDWARE_IDS.slice(1)],
      ] as const;

      for (const [offMaterials, offHardware] of everyOffSet)
        expect(() =>
          offerOf(
            faulty,
            switchedOff(offMaterials, offHardware),
            KITCHEN_L_DESIGN,
          ),
        ).toThrow(UnofferedDefaultTierError);
    },
  );

  it("is told apart from a default that is held and switched off, which does not throw", () => {
    expect(() =>
      offerOf(
        SAMPLE_PRICE_BOOK,
        switchedOff([MATERIAL_DEFAULT], [HARDWARE_DEFAULT]),
        KITCHEN_L_DESIGN,
      ),
    ).not.toThrow();
  });
});

describe("no price book at all", () => {
  const designs: readonly Design[] = [
    KITCHEN_L_DESIGN,
    designCarrying("material.gone", "hardware.gone"),
    designCarrying("material.veneer", undefined),
  ];

  it.each(designs.map((design, index) => [index, design] as const))(
    "answers the one NO_TIER_OFFER for design %i, which is never an offer: no group, no tier",
    (_index, design) => {
      const answer = offerTiersAgainstBook(
        NO_PRICE_BOOK,
        design,
        KITCHEN_L_BODY_CATALOG,
      );

      expect(answer).toBe(NO_TIER_OFFER);
      expect(isTierOffered(answer)).toBe(false);
      expect(answer).not.toHaveProperty("material");
      expect(answer).not.toHaveProperty("hardware");
    },
  );

  it("is told apart from every offer a book makes, however many tiers are switched off", () => {
    for (const off of [[], MATERIAL_IDS]) {
      const answer = offerTiersAgainstBook(
        { ...SAMPLE_PRICE_ROOT, availability: switchedOff(off, []) },
        KITCHEN_L_DESIGN,
        KITCHEN_L_BODY_CATALOG,
      );

      expect(isTierOffered(answer)).toBe(true);
      expect(answer).not.toBe(NO_TIER_OFFER);
    }
  });
});
