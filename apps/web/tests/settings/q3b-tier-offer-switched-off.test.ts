// What the whole-kitchen tier offer does while tiers are switched off.
//
// A switched-off tier is neither offered nor measured, so it cannot blank a delta that has nothing to do with it, and it
// is not in `tierIds`, the list every whole-kitchen command takes as `availableTierIds`. The oracle for a delta is the
// same query over a book that never held the switched-off tiers, so an agreement is not an agreement with the code under
// test. Its sibling `qa-m10-q3b-tier-offer.adversarial.test.ts` sweeps kitchens that carry tiers; this one does not.
import { fc } from "@fast-check/vitest";
import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  type Design,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { UnofferedDefaultTierError } from "@/price/whole-kitchen-tiers";

import { NOTHING_DISABLED } from "../support/availability";
import {
  bookWithout,
  deltasOf,
  HARDWARE_DEFAULT_TIER_ID,
  HARDWARE_TIER_IDS,
  kitchenCarrying,
  MATERIAL_DEFAULT_TIER_ID,
  MATERIAL_TIER_IDS,
  offerUnder,
  switchedOffTiers,
} from "../support/tier-offer-world";

const SWEEP_SEED = 20_261_109;
const SWEEP_RUNS = 80;

/** Tier ids the book does not default to: the ones a switch may take away without taking the baseline. */
function nonDefault(
  tierIds: readonly string[],
  defaultTierId: string,
): readonly string[] {
  return tierIds.filter((tierId) => tierId !== defaultTierId);
}

const SWITCHABLE_MATERIALS = nonDefault(
  MATERIAL_TIER_IDS,
  MATERIAL_DEFAULT_TIER_ID,
);
const SWITCHABLE_HARDWARE = nonDefault(
  HARDWARE_TIER_IDS,
  HARDWARE_DEFAULT_TIER_ID,
);

/** Any set of tiers switched off in each group that leaves each group at least one active option. */
function anySwitchLeavingAnOption() {
  return fc
    .record({
      material: fc.subarray([...MATERIAL_TIER_IDS]),
      hardware: fc.subarray([...HARDWARE_TIER_IDS]),
    })
    .filter(
      ({ material, hardware }) =>
        material.length < MATERIAL_TIER_IDS.length &&
        hardware.length < HARDWARE_TIER_IDS.length,
    );
}

function activeOf(
  tierIds: readonly string[],
  off: readonly string[],
): readonly string[] {
  return tierIds.filter((tierId) => !off.includes(tierId));
}

describe("the tier offer under availability", () => {
  it("has switchable tiers in both groups, so the sweeps below are not vacuous", () => {
    expect(SWITCHABLE_MATERIALS.length).toBeGreaterThan(0);
    expect(SWITCHABLE_HARDWARE.length).toBeGreaterThan(0);
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

  it("lists exactly the active tiers in book order, for any switch that leaves each group an option", () => {
    fc.assert(
      fc.property(anySwitchLeavingAnOption(), (off) => {
        const offer = offerUnder(switchedOffTiers(off));

        expect(offer.material.tierIds).toEqual(
          activeOf(MATERIAL_TIER_IDS, off.material),
        );
        expect(offer.hardware.tierIds).toEqual(
          activeOf(HARDWARE_TIER_IDS, off.hardware),
        );
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });

  it("hands the switched-off tiers over apart and unmeasured, in book order", () => {
    fc.assert(
      fc.property(anySwitchLeavingAnOption(), (off) => {
        const offer = offerUnder(switchedOffTiers(off));

        expect(
          offer.material.switchedOffTiers.map((tier) => tier.tierId),
        ).toEqual(MATERIAL_TIER_IDS.filter((id) => off.material.includes(id)));
        expect(
          offer.hardware.switchedOffTiers.map((tier) => tier.tierId),
        ).toEqual(HARDWARE_TIER_IDS.filter((id) => off.hardware.includes(id)));
        for (const tier of [
          ...offer.material.switchedOffTiers,
          ...offer.hardware.switchedOffTiers,
        ])
          expect(tier.deltaMinor, tier.tierId).toBeUndefined();
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });

  it("measures each active tier as the book without the switched-off ones does, whichever tiers are off while both defaults stay on", () => {
    fc.assert(
      fc.property(anySwitchLeavingAnOption(), (off) => {
        fc.pre(
          !off.material.includes(MATERIAL_DEFAULT_TIER_ID) &&
            !off.hardware.includes(HARDWARE_DEFAULT_TIER_ID),
        );
        const offer = offerUnder(switchedOffTiers(off));
        const oracle = offerUnder(
          NOTHING_DISABLED,
          KITCHEN_L_DESIGN,
          bookWithout(SAMPLE_PRICE_BOOK, off),
        );

        expect(deltasOf(offer.material)).toEqual(deltasOf(oracle.material));
        expect(deltasOf(offer.hardware)).toEqual(deltasOf(oracle.hardware));
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });

  it("measures every active tier when the switched-off ones are tiers the kitchen does not carry", () => {
    fc.assert(
      fc.property(
        fc.subarray([...SWITCHABLE_MATERIALS]),
        fc.subarray([...SWITCHABLE_HARDWARE]),
        (material, hardware) => {
          const offer = offerUnder(switchedOffTiers({ material, hardware }));

          expect(deltasOf(offer.material)).not.toContain(undefined);
          expect(deltasOf(offer.hardware)).not.toContain(undefined);
        },
      ),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });

  it("never lists a switched-off tier in tierIds or in the measured tiers", () => {
    for (const tierId of SWITCHABLE_MATERIALS) {
      const offer = offerUnder(switchedOffTiers({ material: [tierId] }));

      expect(offer.material.tierIds).not.toContain(tierId);
      expect(offer.material.tiers.map((tier) => tier.tierId)).not.toContain(
        tierId,
      );
    }
    for (const tierId of SWITCHABLE_HARDWARE) {
      const offer = offerUnder(switchedOffTiers({ hardware: [tierId] }));

      expect(offer.hardware.tierIds).not.toContain(tierId);
      expect(offer.hardware.tiers.map((tier) => tier.tierId)).not.toContain(
        tierId,
      );
    }
  });

  it("leaves the hardware group whole when only materials are switched off", () => {
    const offer = offerUnder(
      switchedOffTiers({ material: SWITCHABLE_MATERIALS }),
    );

    expect(offer.hardware.tierIds).toEqual(HARDWARE_TIER_IDS);
    expect(offer.hardware.switchedOffTiers).toEqual([]);
  });
});

describe("a switched-off default", () => {
  it.each([
    ["material", MATERIAL_DEFAULT_TIER_ID],
    ["hardware", HARDWARE_DEFAULT_TIER_ID],
  ] as const)(
    "yields no delta anywhere and does not throw when the %s default is switched off",
    (kind, defaultTierId) => {
      const offer = offerUnder(switchedOffTiers({ [kind]: [defaultTierId] }));

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

    expect(() =>
      offerUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, faultyBook),
    ).toThrow(UnofferedDefaultTierError);
    expect(() =>
      offerUnder(
        switchedOffTiers({ material: MATERIAL_TIER_IDS }),
        KITCHEN_L_DESIGN,
        faultyBook,
      ),
    ).toThrow(UnofferedDefaultTierError);
  });
});

describe("the tier the kitchen carries, switched off", () => {
  const CARRIED_MATERIAL = "material.veneer";
  const carryingMaterial: Design = kitchenCarrying({
    materialTierId: CARRIED_MATERIAL,
  });
  const offer = offerUnder(
    switchedOffTiers({ material: [CARRIED_MATERIAL] }),
    carryingMaterial,
  );

  it("is not offered, and is available unmeasured for the chooser", () => {
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

  it("states no amount, because the kitchen cannot be priced", () => {
    expect(deltasOf(offer.hardware)).not.toContainEqual(expect.any(Number));
  });

  it("still offers the remaining options of both groups", () => {
    expect(offer.material.tierIds.length).toBeGreaterThan(1);
    expect(offer.hardware.tierIds).toEqual(HARDWARE_TIER_IDS);
  });
});
