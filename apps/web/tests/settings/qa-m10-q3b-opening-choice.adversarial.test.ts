// What the settings sheet opens on, and what one untouched Aplica writes, when the kitchen carries a tier the offer no
// longer lists, with the group's default on or off.
//
// A tier the book still holds but availability has switched off stays as stored: no radio is checked for it and an
// untouched Aplica writes nothing. An id the book no longer holds falls back to the group's default when that is
// offered, and to no key at all when it is not, because the command refuses an id outside the sheet's own list. The
// state space is swept (every off-set over both groups, a carried tier that may be held, off or vanished in each group)
// against an exact oracle, and the named corners are pinned as examples. Its sibling `q3b-no-tier-offer-model.test.ts`
// pins the same rule on the model alone, one example each.
import { fc } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  projectDesignForDisplay,
  type CatalogueAvailability,
  type Design,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  describeGlobalSettings,
  describeSettingsPill,
  resolveOpeningChoice,
  type TierGroupView,
  type WholeKitchenGroupKey,
} from "@/settings/global-settings-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { ro } from "../support/romanian-content";
import {
  HARDWARE_DEFAULT_TIER_ID,
  HARDWARE_TIER_IDS,
  kitchenCarrying,
  MATERIAL_DEFAULT_TIER_ID,
  MATERIAL_TIER_IDS,
  offerThroughRoot,
  switchedOffTiers,
} from "../support/tier-offer-world";

const SWEEP_SEED = 20_261_111;
const SWEEP_RUNS = 120;
const TIER_IDS = { material: MATERIAL_TIER_IDS, hardware: HARDWARE_TIER_IDS };
const DEFAULT_OF = {
  material: MATERIAL_DEFAULT_TIER_ID,
  hardware: HARDWARE_DEFAULT_TIER_ID,
};
const A_NON_DEFAULT = {
  material: "material.veneer",
  hardware: "hardware.premium",
};
const VANISHED = {
  material: "material.vanished",
  hardware: "hardware.vanished",
};
const KEY_OF = {
  material: "materialTierId",
  hardware: "hardwareTierId",
} as const;
const EVERY_KIND: readonly WholeKitchenGroupKey[] = ["material", "hardware"];
/** The sheet is the control that fixes an unpriceable kitchen, so it is described under a refusal here. */
const AN_UNPRICEABLE_KITCHEN: PricingResult = {
  ok: false,
  failure: { code: "INVALID_PRICE_BOOK", detail: "unpriceable on purpose" },
};

function carryingIn(
  carried: Partial<Record<WholeKitchenGroupKey, string>>,
): Design {
  return kitchenCarrying({
    materialTierId: carried.material,
    hardwareTierId: carried.hardware,
  });
}

function viewOpenedOn(design: Design, availability: CatalogueAvailability) {
  const offer = offerThroughRoot(availability, design);
  const applied = design.settings ?? {};
  const pending = resolveOpeningChoice(applied, offer);
  const view = describeGlobalSettings({
    content: ro,
    pricing: AN_UNPRICEABLE_KITCHEN,
    offer,
    deepCabinetPercent: 12,
    groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
    applied,
    pending,
    chosenColourCount: 0,
  });
  return { offer, groups: view.groups, pending };
}

function groupOf(
  groups: readonly TierGroupView[],
  key: WholeKitchenGroupKey,
): TierGroupView {
  const found = groups.find((group) => group.key === key);
  if (found === undefined) throw new Error(`no ${key} group`);
  return found;
}

function checkedTierIds(
  groups: readonly TierGroupView[],
  key: WholeKitchenGroupKey,
): readonly string[] {
  return groupOf(groups, key)
    .options.filter((option) => option.isSelected)
    .map((option) => option.tierId);
}

/** One press of Aplica on an untouched sheet, exactly as `applyPending` builds it (ids from the sheet's own view). */
function pressApplyUntouched(
  design: Design,
  availability: CatalogueAvailability,
) {
  const { groups, pending } = viewOpenedOn(design, availability);
  const store = createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
  });
  const outcome = store.getState().applyWholeKitchenSettings({
    ...(pending.materialTierId === undefined
      ? {}
      : { materialTierId: pending.materialTierId }),
    ...(pending.hardwareTierId === undefined
      ? {}
      : { hardwareTierId: pending.hardwareTierId }),
    availableMaterialTierIds: groupOf(groups, "material").tierIds,
    availableHardwareTierIds: groupOf(groups, "hardware").tierIds,
  });
  return { outcome, stored: store.getState().design };
}

describe.each(EVERY_KIND)(
  "a %s tier the kitchen carries that the offer no longer lists",
  (kind) => {
    const key = KEY_OF[kind];
    const nothingOff = switchedOffTiers();
    const defaultOff = switchedOffTiers({ [kind]: [DEFAULT_OF[kind]] });
    const nonDefaultOff = switchedOffTiers({ [kind]: [A_NON_DEFAULT[kind]] });
    const bothOff = switchedOffTiers({
      [kind]: [DEFAULT_OF[kind], A_NON_DEFAULT[kind]],
    });

    describe("switched off, with the default on", () => {
      const design = carryingIn({ [kind]: A_NON_DEFAULT[kind] });

      it("opens as stored", () => {
        expect(viewOpenedOn(design, nonDefaultOff).pending[key]).toBe(
          A_NON_DEFAULT[kind],
        );
      });

      it("checks no radio, and lists the other options without it", () => {
        const { groups } = viewOpenedOn(design, nonDefaultOff);

        expect(checkedTierIds(groups, kind)).toEqual([]);
        expect(groupOf(groups, kind).tierIds).not.toContain(
          A_NON_DEFAULT[kind],
        );
      });

      it("writes nothing on one untouched Aplica", () => {
        const { outcome, stored } = pressApplyUntouched(design, nonDefaultOff);

        expect(outcome.committed).toBe(true);
        expect(stored).toBe(design);
      });
    });

    describe.each([
      ["switched off", A_NON_DEFAULT, bothOff],
      ["the default itself", DEFAULT_OF, defaultOff],
    ] as const)(
      "%s, with the default off too",
      (_name, carriedIds, availability) => {
        const design = carryingIn({ [kind]: carriedIds[kind] });

        it("opens as stored", () => {
          expect(viewOpenedOn(design, availability).pending[key]).toBe(
            carriedIds[kind],
          );
        });

        it("checks no radio", () => {
          expect(
            checkedTierIds(viewOpenedOn(design, availability).groups, kind),
          ).toEqual([]);
        });

        it("writes nothing on one untouched Aplica, and refuses nothing", () => {
          const { outcome, stored } = pressApplyUntouched(design, availability);

          expect(outcome.committed).toBe(true);
          expect(stored).toBe(design);
        });
      },
    );

    describe("vanished, with the default on", () => {
      const design = carryingIn({ [kind]: VANISHED[kind] });

      it("opens on the default", () => {
        expect(viewOpenedOn(design, nothingOff).pending[key]).toBe(
          DEFAULT_OF[kind],
        );
      });

      it("stores the default on one untouched Aplica", () => {
        const { outcome, stored } = pressApplyUntouched(design, nothingOff);

        expect(outcome.committed).toBe(true);
        expect(stored.settings?.[key]).toBe(DEFAULT_OF[kind]);
      });
    });

    describe("vanished, with the default off", () => {
      const design = carryingIn({ [kind]: VANISHED[kind] });

      it("opens on no key at all", () => {
        expect(viewOpenedOn(design, defaultOff).pending).not.toHaveProperty(
          key,
        );
      });

      it("checks no radio", () => {
        expect(
          checkedTierIds(viewOpenedOn(design, defaultOff).groups, kind),
        ).toEqual([]);
      });

      it("writes nothing on one untouched Aplica, and refuses nothing", () => {
        const { outcome, stored } = pressApplyUntouched(design, defaultOff);

        expect(outcome.committed).toBe(true);
        expect(stored).toBe(design);
      });
    });

    describe("on the pill (M10 Q5c: a tier the kitchen no longer carries is never named)", () => {
      function pillSettingOf(
        design: Design,
        availability: CatalogueAvailability,
      ) {
        const pill = describeSettingsPill({
          offer: offerThroughRoot(availability, design),
          applied: design.settings ?? {},
          content: ro,
        });
        return pill.settings.find((one) => one.key === kind);
      }

      if (kind === "material") {
        const leaf = ro.replacementSheet.headerMaterialToChoose;
        const defaultsLabel = pillSettingOf(carryingIn({}), nothingOff)?.label;

        it("names the book default while nothing is chosen and nothing is off, so the leaf below is not the usual label", () => {
          expect(defaultsLabel).toBeDefined();
          expect(defaultsLabel).not.toBe(leaf);
        });

        it("reads the leaf, not the switched-off tier's name, for a switched-off tier", () => {
          const design = carryingIn({ [kind]: A_NON_DEFAULT[kind] });

          expect(pillSettingOf(design, nonDefaultOff)?.label).toBe(leaf);
          expect(pillSettingOf(design, nothingOff)?.label).not.toBe(leaf);
        });

        it("reads the leaf, not the default's name, for a vanished tier, whether the default is on or off", () => {
          const design = carryingIn({ [kind]: VANISHED[kind] });

          expect(pillSettingOf(design, nothingOff)?.label).toBe(leaf);
          expect(pillSettingOf(design, defaultOff)?.label).toBe(leaf);
        });
      } else {
        it("leaves the entry out for a switched-off tier, while the sheet still opens as stored", () => {
          const design = carryingIn({ [kind]: A_NON_DEFAULT[kind] });

          expect(pillSettingOf(design, nonDefaultOff)).toBeUndefined();
          expect(viewOpenedOn(design, nonDefaultOff).pending[key]).toBe(
            A_NON_DEFAULT[kind],
          );
        });

        it("leaves the entry out for a vanished tier with the default on, while the sheet still opens on the default", () => {
          const design = carryingIn({ [kind]: VANISHED[kind] });

          expect(pillSettingOf(design, nothingOff)).toBeUndefined();
          expect(viewOpenedOn(design, nothingOff).pending[key]).toBe(
            DEFAULT_OF[kind],
          );
        });

        it("leaves the entry out for a vanished tier with the default off, while the sheet opens on no key", () => {
          const design = carryingIn({ [kind]: VANISHED[kind] });

          expect(pillSettingOf(design, defaultOff)).toBeUndefined();
          expect(viewOpenedOn(design, defaultOff).pending).not.toHaveProperty(
            key,
          );
        });
      }
    });
  },
);

describe("the sheet's pending tiers, over every availability and every carried tier", () => {
  const carriedIn = (kind: WholeKitchenGroupKey) =>
    fc.constantFrom<string | undefined>(
      undefined,
      VANISHED[kind],
      ...TIER_IDS[kind],
    );
  interface SheetState {
    readonly carriedMaterial: string | undefined;
    readonly carriedHardware: string | undefined;
    readonly offMaterial: string[];
    readonly offHardware: string[];
  }
  const anyState: fc.Arbitrary<SheetState> = fc.record({
    carriedMaterial: carriedIn("material"),
    carriedHardware: carriedIn("hardware"),
    offMaterial: fc.subarray([...MATERIAL_TIER_IDS]),
    offHardware: fc.subarray([...HARDWARE_TIER_IDS]),
  });

  function stateToSheet(state: SheetState) {
    const design = carryingIn({
      ...(state.carriedMaterial === undefined
        ? {}
        : { material: state.carriedMaterial }),
      ...(state.carriedHardware === undefined
        ? {}
        : { hardware: state.carriedHardware }),
    });
    const availability = switchedOffTiers({
      material: state.offMaterial,
      hardware: state.offHardware,
    });
    return { design, availability, ...viewOpenedOn(design, availability) };
  }

  it("opens each group on exactly what the rule says, and one untouched Aplica always commits", () => {
    let keptHeldButOff = 0;
    let fellBackToDefault = 0;
    let droppedWithDefaultOff = 0;
    fc.assert(
      fc.property(anyState, (state) => {
        const { design, availability, offer, pending } = stateToSheet(state);

        for (const kind of EVERY_KIND) {
          const carried = design.settings?.[KEY_OF[kind]];
          const group = offer[kind];
          const isHeldButOff = group.switchedOffTiers.some(
            (tier) => tier.tierId === carried,
          );
          const isListed =
            carried !== undefined && group.tierIds.includes(carried);
          const isOffered = group.tierIds.includes(DEFAULT_OF[kind]);
          const expected =
            carried === undefined || isListed || isHeldButOff
              ? carried
              : isOffered
                ? DEFAULT_OF[kind]
                : undefined;
          expect(pending[KEY_OF[kind]], `${kind} opened`).toBe(expected);
          if (isHeldButOff) keptHeldButOff += 1;
          else if (carried !== undefined && !isListed && isOffered)
            fellBackToDefault += 1;
          else if (carried !== undefined && !isListed)
            droppedWithDefaultOff += 1;
        }
        expect(
          pressApplyUntouched(design, availability).outcome.committed,
        ).toBe(true);
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );

    expect(keptHeldButOff).toBeGreaterThan(0);
    expect(fellBackToDefault).toBeGreaterThan(0);
    expect(droppedWithDefaultOff).toBeGreaterThan(0);
  });

  it("leaves a tier the kitchen carries and the book holds exactly as stored after one untouched Aplica", () => {
    fc.assert(
      fc.property(anyState, (state) => {
        const { design, availability, offer } = stateToSheet(state);
        const { stored } = pressApplyUntouched(design, availability);

        for (const kind of EVERY_KIND) {
          const carried = design.settings?.[KEY_OF[kind]];
          const isHeld =
            offer[kind].tierIds.includes(carried ?? "") ||
            offer[kind].switchedOffTiers.some(
              (tier) => tier.tierId === carried,
            );
          if (isHeld)
            expect(stored.settings?.[KEY_OF[kind]], kind).toBe(carried);
        }
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });

  it("checks at most one option per group, never one the group does not list, and none for a held-but-off tier", () => {
    fc.assert(
      fc.property(anyState, (state) => {
        const { design, groups, offer } = stateToSheet(state);

        for (const group of groups) {
          const checked = group.options.filter((option) => option.isSelected);
          expect(checked.length, group.key).toBeLessThanOrEqual(1);
          for (const option of group.options)
            expect(group.tierIds).toContain(option.tierId);
          const carried = design.settings?.[KEY_OF[group.key]];
          const isHeldButOff = offer[group.key].switchedOffTiers.some(
            (tier) => tier.tierId === carried,
          );
          if (isHeldButOff) expect(checked, group.key).toEqual([]);
        }
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });
});
