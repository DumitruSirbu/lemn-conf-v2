// M10 Q3b: what the whole-kitchen tier offer does while tiers are switched off (A-17, P4a-a).
//
// A switched-off tier is neither offered nor measured, so it cannot blank a delta that has nothing to do with it, and
// it is not in `tierIds`, the list every whole-kitchen command takes as `availableTierIds`. The oracle for a delta is
// the same query over a book that never held the switched-off tiers, so an agreement is not an agreement with the
// code under test.
import { fc } from "@fast-check/vitest";
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  tierRef,
  type CatalogueAvailability,
  type Design,
  type PriceBook,
  type TierGroup,
  type TierIdentity,
  type TierKind,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  offerWholeKitchenTiers,
  UnofferedDefaultTierError,
  type OfferedTierGroup,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";

import { NOTHING_DISABLED } from "../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";

const SWEEP_SEED = 20_261_109;
const SWEEP_RUNS = 80;

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);
const CARRIED_TIER_IDS = [
  KITCHEN_L_DESIGN.settings?.materialTierId,
  KITCHEN_L_DESIGN.settings?.hardwareTierId,
];

function offerUnder(
  availability: CatalogueAvailability,
  book: PriceBook = SAMPLE_PRICE_BOOK,
  design: Design = KITCHEN_L_DESIGN,
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
  kind: TierKind,
  tierIds: readonly string[],
): CatalogueAvailability {
  return {
    revision: "1",
    disabled: tierIds.map((tierId) => tierRef(kind, tierId)),
  };
}

function bothGroupsSwitchedOff(
  materialTierIds: readonly string[],
  hardwareTierIds: readonly string[],
): CatalogueAvailability {
  return {
    revision: "1",
    disabled: [
      ...materialTierIds.map((tierId) => tierRef("material", tierId)),
      ...hardwareTierIds.map((tierId) => tierRef("hardware", tierId)),
    ],
  };
}

/** The same book, as if it had never held the tiers: the oracle for what a switched-off tier must not change. */
function bookWithout<TTier extends TierIdentity>(
  group: TierGroup<TTier>,
  removed: readonly string[],
): TierGroup<TTier> {
  return {
    ...group,
    tiers: group.tiers.filter((tier) => !removed.includes(tier.tierId)),
  };
}

/** Any set of tiers switched off in each group that leaves each group at least one active option. */
function anySwitchLeavingAnOption() {
  return fc
    .record({
      offMaterials: fc.subarray([...MATERIAL_TIER_IDS]),
      offHardware: fc.subarray([...HARDWARE_TIER_IDS]),
    })
    .filter(
      ({ offMaterials, offHardware }) =>
        offMaterials.length < MATERIAL_TIER_IDS.length &&
        offHardware.length < HARDWARE_TIER_IDS.length,
    );
}

function activeOf(
  tierIds: readonly string[],
  off: readonly string[],
): readonly string[] {
  return tierIds.filter((tierId) => !off.includes(tierId));
}

function deltasOf(group: OfferedTierGroup): readonly (number | undefined)[] {
  return group.tiers.map((tier) => tier.deltaMinor);
}

/** Tier ids the kitchen does not carry and the book does not default to: the ones a switch may take away freely. */
function freelySwitchable(
  tierIds: readonly string[],
  defaultTierId: string,
): readonly string[] {
  return tierIds.filter(
    (tierId) => tierId !== defaultTierId && !CARRIED_TIER_IDS.includes(tierId),
  );
}

const FREE_MATERIALS = freelySwitchable(
  MATERIAL_TIER_IDS,
  SAMPLE_PRICE_BOOK.material.defaultTierId,
);
const FREE_HARDWARE = freelySwitchable(
  HARDWARE_TIER_IDS,
  SAMPLE_PRICE_BOOK.hardware.defaultTierId,
);

describe("the tier offer under availability", () => {
  it("has switchable tiers in both groups, so the sweeps below are not vacuous", () => {
    expect(FREE_MATERIALS.length).toBeGreaterThan(0);
    expect(FREE_HARDWARE.length).toBeGreaterThan(0);
  });

  it("offers every tier, measured and with none held back, when nothing is switched off", () => {
    const offer = offerUnder(NOTHING_DISABLED);

    expect(offer.material.tierIds).toEqual(MATERIAL_TIER_IDS);
    expect(offer.hardware.tierIds).toEqual(HARDWARE_TIER_IDS);
    expect(deltasOf(offer.material)).not.toContain(undefined);
    expect(deltasOf(offer.hardware)).not.toContain(undefined);
    expect(offer.material.switchedOffTiers).toEqual([]);
    expect(offer.hardware.switchedOffTiers).toEqual([]);
  });

  it("lists exactly the active tiers in book order and the switched-off ones apart, unmeasured, for any switch that leaves each group an option", () => {
    fc.assert(
      fc.property(
        anySwitchLeavingAnOption(),
        ({ offMaterials, offHardware }) => {
          const offer = offerUnder(
            bothGroupsSwitchedOff(offMaterials, offHardware),
          );

          expect(offer.material.tierIds).toEqual(
            activeOf(MATERIAL_TIER_IDS, offMaterials),
          );
          expect(offer.hardware.tierIds).toEqual(
            activeOf(HARDWARE_TIER_IDS, offHardware),
          );
          expect(
            offer.material.switchedOffTiers.map((tier) => tier.tierId),
          ).toEqual(
            MATERIAL_TIER_IDS.filter((id) => offMaterials.includes(id)),
          );
          expect(
            offer.hardware.switchedOffTiers.map((tier) => tier.tierId),
          ).toEqual(HARDWARE_TIER_IDS.filter((id) => offHardware.includes(id)));
          for (const tier of [
            ...offer.material.switchedOffTiers,
            ...offer.hardware.switchedOffTiers,
          ])
            expect(tier.deltaMinor, tier.tierId).toBeUndefined();
        },
      ),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });

  it("measures each active tier as the book without the switched-off ones does, whichever tiers are off while both defaults stay on", () => {
    fc.assert(
      fc.property(
        anySwitchLeavingAnOption(),
        ({ offMaterials, offHardware }) => {
          fc.pre(
            !offMaterials.includes(SAMPLE_PRICE_BOOK.material.defaultTierId) &&
              !offHardware.includes(SAMPLE_PRICE_BOOK.hardware.defaultTierId),
          );
          const offer = offerUnder(
            bothGroupsSwitchedOff(offMaterials, offHardware),
          );
          const oracle = offerUnder(NOTHING_DISABLED, {
            ...SAMPLE_PRICE_BOOK,
            material: bookWithout(SAMPLE_PRICE_BOOK.material, offMaterials),
            hardware: bookWithout(SAMPLE_PRICE_BOOK.hardware, offHardware),
          });

          expect(deltasOf(offer.material)).toEqual(deltasOf(oracle.material));
          expect(deltasOf(offer.hardware)).toEqual(deltasOf(oracle.hardware));
        },
      ),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });

  it("measures every active tier when the switched-off ones are tiers the kitchen does not carry", () => {
    fc.assert(
      fc.property(
        fc.subarray([...FREE_MATERIALS]),
        fc.subarray([...FREE_HARDWARE]),
        (offMaterials, offHardware) => {
          const offer = offerUnder(
            bothGroupsSwitchedOff(offMaterials, offHardware),
          );

          expect(deltasOf(offer.material)).not.toContain(undefined);
          expect(deltasOf(offer.hardware)).not.toContain(undefined);
        },
      ),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });

  it("never lists a switched-off tier in tierIds or in the measured tiers (P4a-a)", () => {
    for (const tierId of FREE_MATERIALS) {
      const offer = offerUnder(switchedOff("material", [tierId]));

      expect(offer.material.tierIds).not.toContain(tierId);
      expect(offer.material.tiers.map((tier) => tier.tierId)).not.toContain(
        tierId,
      );
    }
    for (const tierId of FREE_HARDWARE) {
      const offer = offerUnder(switchedOff("hardware", [tierId]));

      expect(offer.hardware.tierIds).not.toContain(tierId);
      expect(offer.hardware.tiers.map((tier) => tier.tierId)).not.toContain(
        tierId,
      );
    }
  });

  it("leaves the hardware group whole when only materials are switched off", () => {
    const offer = offerUnder(switchedOff("material", FREE_MATERIALS));

    expect(offer.hardware.tierIds).toEqual(HARDWARE_TIER_IDS);
    expect(offer.hardware.switchedOffTiers).toEqual([]);
  });
});

describe("a switched-off default", () => {
  it.each(["material", "hardware"] as const)(
    "yields no delta anywhere and does not throw when the %s default is switched off",
    (kind) => {
      const defaultTierId = SAMPLE_PRICE_BOOK[kind].defaultTierId;

      const offer = offerUnder(switchedOff(kind, [defaultTierId]));

      expect(deltasOf(offer.material)).not.toContainEqual(expect.any(Number));
      expect(deltasOf(offer.hardware)).not.toContainEqual(expect.any(Number));
      expect(offer[kind].tierIds).not.toContain(defaultTierId);
      expect(offer[kind].switchedOffTiers.map((tier) => tier.tierId)).toContain(
        defaultTierId,
      );
      expect(offer[kind].defaultTierId).toBe(defaultTierId);
    },
  );

  it("still refuses a book whose default is not one of its own tiers, whatever is switched off", () => {
    const faultyBook: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      material: { ...SAMPLE_PRICE_BOOK.material, defaultTierId: "material.x" },
    };

    expect(() => offerUnder(NOTHING_DISABLED, faultyBook)).toThrow(
      UnofferedDefaultTierError,
    );
    expect(() =>
      offerUnder(switchedOff("material", MATERIAL_TIER_IDS), faultyBook),
    ).toThrow(UnofferedDefaultTierError);
  });
});

describe("the tier the kitchen carries, switched off", () => {
  const CARRIED_MATERIAL = "material.veneer";
  const carryingMaterial: Design = {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      materialTierId: CARRIED_MATERIAL,
    },
  };

  it("is not offered, and is available unmeasured for the chooser", () => {
    const offer = offerUnder(
      switchedOff("material", [CARRIED_MATERIAL]),
      SAMPLE_PRICE_BOOK,
      carryingMaterial,
    );

    expect(offer.material.tierIds).not.toContain(CARRIED_MATERIAL);
    expect(offer.material.switchedOffTiers).toEqual([
      expect.objectContaining({ tierId: CARRIED_MATERIAL }),
    ]);
    expect(
      offer.material.switchedOffTiers.every(
        (tier) => tier.deltaMinor === undefined,
      ),
    ).toBe(true);
  });

  it("costs the numbers and nothing else: the kitchen cannot be priced, and the remaining options are still offered", () => {
    const offer = offerUnder(
      switchedOff("material", [CARRIED_MATERIAL]),
      SAMPLE_PRICE_BOOK,
      carryingMaterial,
    );

    expect(offer.material.tierIds.length).toBeGreaterThan(1);
    expect(offer.hardware.tierIds).toEqual(HARDWARE_TIER_IDS);
    expect(deltasOf(offer.hardware)).not.toContainEqual(expect.any(Number));
  });
});
