// The whole-kitchen tier offer under any availability, against an oracle that shares no code with it.
//
// Its sibling `q3b-tier-offer-switched-off.test.ts` sweeps kitchens that carry no tier. Here the design's carried tiers
// are part of the sweep (so a switch can hit the tier a kitchen wears), a group switched off entirely is reached, and
// the oracle prices through `priceDesign` directly (total at the tier minus total at the group's default). The sweeps
// count how many runs compared real numbers, so they cannot go green by comparing blanks.
import { fc } from "@fast-check/vitest";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  type Design,
  type PriceBook,
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
  UnofferedDefaultTierError,
} from "@/price/whole-kitchen-tiers";

import { NOTHING_DISABLED } from "../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import {
  bookWithout,
  deltasOf,
  HARDWARE_DEFAULT_TIER_ID,
  HARDWARE_TIER_IDS,
  kitchenCarrying,
  MATERIAL_DEFAULT_TIER_ID,
  MATERIAL_TIER_IDS,
  offerThroughRoot,
  offerUnder,
  switchedOffTiers,
} from "../support/tier-offer-world";

const SWEEP_SEED = 20_261_110;
const SWEEP_RUNS = 200;

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
 * The delta a tier should state: the total with the tier chosen minus the total with the group's default chosen.
 * Undefined where either is refused or the tier is cheaper than the default (hardware offers such a tier with no badge).
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

const maybeOne = (ids: readonly string[]) =>
  fc.constantFrom<string | undefined>(undefined, ...ids);

interface Scenario {
  readonly carriedMaterial: string | undefined;
  readonly carriedHardware: string | undefined;
  readonly offMaterials: string[];
  readonly offHardware: string[];
}

const anyScenario: fc.Arbitrary<Scenario> = fc.record({
  carriedMaterial: maybeOne(MATERIAL_TIER_IDS),
  carriedHardware: maybeOne(HARDWARE_TIER_IDS),
  offMaterials: fc.subarray([...MATERIAL_TIER_IDS]),
  offHardware: fc.subarray([...HARDWARE_TIER_IDS]),
});

function offerFor(scenario: Scenario) {
  const design = kitchenCarrying({
    materialTierId: scenario.carriedMaterial,
    hardwareTierId: scenario.carriedHardware,
  });
  const off = {
    material: scenario.offMaterials,
    hardware: scenario.offHardware,
  };
  return {
    design,
    off,
    offer: offerUnder(switchedOffTiers(off), design),
  };
}

/** A baseline-less group, or a kitchen wearing a switched-off tier, cannot be measured at all. */
function isUnmeasurable(scenario: Scenario): boolean {
  return (
    scenario.offMaterials.includes(MATERIAL_DEFAULT_TIER_ID) ||
    scenario.offHardware.includes(HARDWARE_DEFAULT_TIER_ID) ||
    (scenario.carriedMaterial !== undefined &&
      scenario.offMaterials.includes(scenario.carriedMaterial)) ||
    (scenario.carriedHardware !== undefined &&
      scenario.offHardware.includes(scenario.carriedHardware))
  );
}

describe("any subset of tiers switched off, on a kitchen that may carry any tier", () => {
  it("never throws, and lists exactly the active tiers in book order, measured and unmeasured alike", () => {
    fc.assert(
      fc.property(anyScenario, (scenario) => {
        const { offer, off } = offerFor(scenario);

        expect(offer.material.tierIds).toEqual(
          MATERIAL_TIER_IDS.filter((id) => !off.material.includes(id)),
        );
        expect(offer.hardware.tierIds).toEqual(
          HARDWARE_TIER_IDS.filter((id) => !off.hardware.includes(id)),
        );
        expect(offer.material.tiers.map((t) => t.tierId)).toEqual(
          offer.material.tierIds,
        );
        expect(offer.hardware.tiers.map((t) => t.tierId)).toEqual(
          offer.hardware.tierIds,
        );
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });

  it("hands the switched-off tiers over apart, in book order", () => {
    fc.assert(
      fc.property(anyScenario, (scenario) => {
        const { offer, off } = offerFor(scenario);

        expect(offer.material.switchedOffTiers.map((t) => t.tierId)).toEqual(
          MATERIAL_TIER_IDS.filter((id) => off.material.includes(id)),
        );
        expect(offer.hardware.switchedOffTiers.map((t) => t.tierId)).toEqual(
          HARDWARE_TIER_IDS.filter((id) => off.hardware.includes(id)),
        );
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });

  it("states no number anywhere when a default or a worn tier is switched off", () => {
    let blockedRuns = 0;
    fc.assert(
      fc.property(anyScenario, (scenario) => {
        fc.pre(isUnmeasurable(scenario));
        const { offer } = offerFor(scenario);

        expect(deltasOf(offer.material).every((d) => d === undefined)).toBe(
          true,
        );
        expect(deltasOf(offer.hardware).every((d) => d === undefined)).toBe(
          true,
        );
        blockedRuns += 1;
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );

    expect(blockedRuns).toBeGreaterThan(20);
  });

  it("measures each active tier as the oracle does, where it can be measured", () => {
    let comparedNumbers = 0;
    fc.assert(
      fc.property(anyScenario, (scenario) => {
        fc.pre(!isUnmeasurable(scenario));
        const { design, off, offer } = offerFor(scenario);
        const oracleBook = bookWithout(SAMPLE_PRICE_BOOK, off);

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
        comparedNumbers +=
          offer.material.tiers.length + offer.hardware.tiers.length;
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );

    expect(comparedNumbers).toBeGreaterThan(200);
  });

  it("states a number for each active tier when nothing the kitchen wears is off, at least one above zero", () => {
    const offer = offerUnder(
      switchedOffTiers({ hardware: ["hardware.premium"] }),
      kitchenCarrying({
        materialTierId: "material.veneer",
        hardwareTierId: "hardware.soft-close",
      }),
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
        fc.subarray([...MATERIAL_TIER_IDS], { minLength: 1, maxLength: 2 }),
        (off) => {
          const forward = offerUnder(switchedOffTiers({ material: off }));
          const backwardTwice = offerUnder(
            switchedOffTiers({
              material: [...off].reverse().concat(off),
            }),
          );

          expect(backwardTwice).toEqual(forward);
        },
      ),
      { seed: SWEEP_SEED, numRuns: 40 },
    );
  });

  it("is deterministic: the same inputs give an equal offer", () => {
    const design = kitchenCarrying({ materialTierId: "material.veneer" });
    const availability = switchedOffTiers({
      material: ["material.painted-mdf"],
    });

    expect(offerUnder(availability, design)).toEqual(
      offerUnder(availability, design),
    );
  });

  it("does not switch a hardware tier off by switching off a material of the same id", () => {
    const offer = offerUnder(
      switchedOffTiers({ material: ["hardware.premium"] }),
    );

    expect(offer.hardware.tierIds).toEqual(HARDWARE_TIER_IDS);
    expect(offer.material.tierIds).toEqual(MATERIAL_TIER_IDS);
  });
});

describe("a group with every tier switched off", () => {
  it.each([
    ["material", MATERIAL_TIER_IDS],
    ["hardware", HARDWARE_TIER_IDS],
  ] as const)(
    "answers an empty %s list without throwing, and lists every tier as switched off",
    (kind, tierIds) => {
      const offer = offerUnder(switchedOffTiers({ [kind]: tierIds }));

      expect(offer[kind].tierIds).toEqual([]);
      expect(offer[kind].tiers).toEqual([]);
      expect(offer[kind].switchedOffTiers.map((tier) => tier.tierId)).toEqual(
        tierIds,
      );
    },
  );

  it.each([
    ["material", "hardware", HARDWARE_TIER_IDS],
    ["hardware", "material", MATERIAL_TIER_IDS],
  ] as const)(
    "keeps the other group's tiers, with no number, when the %s group is switched off",
    (kind, other, otherTierIds) => {
      const offer = offerUnder(
        switchedOffTiers({
          [kind]: kind === "material" ? MATERIAL_TIER_IDS : HARDWARE_TIER_IDS,
        }),
      );

      expect(offer[other].tierIds).toEqual(otherTierIds);
      expect(deltasOf(offer[other]).every((d) => d === undefined)).toBe(true);
    },
  );

  it("switches every tier off in both groups without throwing", () => {
    const offer = offerUnder(
      switchedOffTiers({
        material: MATERIAL_TIER_IDS,
        hardware: HARDWARE_TIER_IDS,
      }),
    );

    expect(offer.material.tierIds).toEqual([]);
    expect(offer.hardware.tierIds).toEqual([]);
  });
});

describe("a created class published inactive", () => {
  const CREATED = "hardware.created-by-owner";
  const premium = SAMPLE_PRICE_BOOK.hardware.tiers[2];
  if (premium === undefined)
    throw new Error("the sample book holds no third hardware tier");
  const bookWithACreatedClass: PriceBook = {
    ...SAMPLE_PRICE_BOOK,
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: [
        ...SAMPLE_PRICE_BOOK.hardware.tiers,
        {
          ...premium,
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
  const createdTier = bookWithACreatedClass.hardware.tiers.find(
    (tier) => tier.tierId === CREATED,
  );

  it("is a created class: it carries no message key", () => {
    expect(createdTier?.name).toBe("Owner class");
    expect(createdTier?.nameKey).toBeUndefined();
    expect(createdTier?.descriptionKey).toBeUndefined();
  });

  it("stays out of tierIds and is handed over as switched off when the kitchen does not wear it", () => {
    const offer = offerUnder(
      switchedOffTiers({ hardware: [CREATED] }),
      KITCHEN_L_DESIGN,
      bookWithACreatedClass,
    );

    expect(offer.hardware.tierIds).toEqual(HARDWARE_TIER_IDS);
    expect(offer.hardware.switchedOffTiers.map((t) => t.tierId)).toEqual([
      CREATED,
    ]);
  });

  it("blanks no delta in either group when the kitchen does not wear it", () => {
    const offer = offerUnder(
      switchedOffTiers({ hardware: [CREATED] }),
      KITCHEN_L_DESIGN,
      bookWithACreatedClass,
    );

    expect(deltasOf(offer.material)).not.toContain(undefined);
    expect(deltasOf(offer.hardware)).not.toContain(undefined);
  });

  it("is offered and measured when published active", () => {
    const offer = offerUnder(
      NOTHING_DISABLED,
      KITCHEN_L_DESIGN,
      bookWithACreatedClass,
    );

    expect(offer.hardware.tierIds).toEqual([...HARDWARE_TIER_IDS, CREATED]);
    expect(deltasOf(offer.hardware)).not.toContain(undefined);
  });

  it("reaches the offer through the root with the availability the root carries, not only through the raw query", () => {
    const offer = offerThroughRoot(
      switchedOffTiers({ hardware: [CREATED] }),
      KITCHEN_L_DESIGN,
      bookWithACreatedClass,
    );

    expect(offer.hardware.tierIds).not.toContain(CREATED);
    expect(deltasOf(offer.hardware)).not.toContain(undefined);
  });
});

describe("a book that does not hold its own default", () => {
  it.each(["material", "hardware"] as const)(
    "throws UnofferedDefaultTierError for the %s group whatever is switched off",
    (kind) => {
      const faulty: PriceBook = {
        ...SAMPLE_PRICE_BOOK,
        [kind]: {
          ...SAMPLE_PRICE_BOOK[kind],
          defaultTierId: `${kind}.nowhere`,
        },
      };
      const everyOffSet = [
        {},
        { material: MATERIAL_TIER_IDS, hardware: HARDWARE_TIER_IDS },
        {
          material: MATERIAL_TIER_IDS.slice(1),
          hardware: HARDWARE_TIER_IDS.slice(1),
        },
      ];

      for (const off of everyOffSet)
        expect(() =>
          offerUnder(switchedOffTiers(off), KITCHEN_L_DESIGN, faulty),
        ).toThrow(UnofferedDefaultTierError);
    },
  );

  it("is told apart from a default that is held and switched off, which does not throw", () => {
    expect(() =>
      offerUnder(
        switchedOffTiers({
          material: [MATERIAL_DEFAULT_TIER_ID],
          hardware: [HARDWARE_DEFAULT_TIER_ID],
        }),
      ),
    ).not.toThrow();
  });
});

describe("no price book at all", () => {
  const designs: readonly (readonly [string, Design])[] = [
    ["a kitchen carrying no tier", KITCHEN_L_DESIGN],
    [
      "a kitchen carrying tiers the book never held",
      kitchenCarrying({
        materialTierId: "material.gone",
        hardwareTierId: "hardware.gone",
      }),
    ],
    [
      "a kitchen carrying a material",
      kitchenCarrying({ materialTierId: "material.veneer" }),
    ],
  ];

  it.each(designs)(
    "answers the one NO_TIER_OFFER for %s, which is never an offer",
    (_name, design) => {
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
    for (const off of [[], MATERIAL_TIER_IDS]) {
      const answer = offerThroughRoot(switchedOffTiers({ material: off }));

      expect(isTierOffered(answer)).toBe(true);
      expect(answer).not.toBe(NO_TIER_OFFER);
    }
  });
});
