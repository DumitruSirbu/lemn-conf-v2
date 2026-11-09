// M10 Q3b adversarial QA: what the settings sheet opens on, and what one untouched Aplica writes, when the kitchen carries
// a tier the offer no longer lists (switched off, or one the book does not hold) with the group's default on or off.
//
// The invariant under attack is `pending-choice-invariant.test.ts`'s, restated for Q3b: a pending tier must be one the
// sheet offers, because `tierIdsOffered` hands the command only the sheet's own list and the command refuses an id outside
// it. The state space is swept (every off-set over both groups, a carried tier that may be held, off or vanished in each
// group) and the four named corners are pinned as examples with the words that say what they are.
import { fc } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  tierRef,
  type CatalogueAvailability,
  type Design,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { offerTiersAgainstBook } from "@/price/price-book-root";
import { isTierOffered } from "@/price/whole-kitchen-tiers";
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
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const SWEEP_SEED = 20_261_111;
const SWEEP_RUNS = 120;
const TIER_IDS = {
  material: SAMPLE_PRICE_BOOK.material.tiers.map((tier) => tier.tierId),
  hardware: SAMPLE_PRICE_BOOK.hardware.tiers.map((tier) => tier.tierId),
} as const;
const DEFAULT_OF = {
  material: SAMPLE_PRICE_BOOK.material.defaultTierId,
  hardware: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
} as const;
const A_NON_DEFAULT = {
  material: "material.veneer",
  hardware: "hardware.premium",
} as const;
const VANISHED = {
  material: "material.vanished",
  hardware: "hardware.vanished",
} as const;
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

function availabilityOff(
  off: Readonly<Record<WholeKitchenGroupKey, readonly string[]>>,
): CatalogueAvailability {
  return {
    revision: "1",
    disabled: EVERY_KIND.flatMap((kind) =>
      off[kind].map((tierId) => tierRef(kind, tierId)),
    ),
  };
}

function carrying(
  carried: Partial<Record<WholeKitchenGroupKey, string>>,
): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      ...(carried.material === undefined
        ? {}
        : { materialTierId: carried.material }),
      ...(carried.hardware === undefined
        ? {}
        : { hardwareTierId: carried.hardware }),
    },
  };
}

function offerFor(design: Design, availability: CatalogueAvailability) {
  const offer = offerTiersAgainstBook(
    { ...SAMPLE_PRICE_ROOT, availability },
    design,
    KITCHEN_L_BODY_CATALOG,
  );
  if (!isTierOffered(offer)) throw new Error("the sample book offers tiers");
  return offer;
}

function viewOpenedOn(
  design: Design,
  availability: CatalogueAvailability,
): {
  groups: readonly TierGroupView[];
  pending: ReturnType<typeof resolveOpeningChoice>;
} {
  const offer = offerFor(design, availability);
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
  return { groups: view.groups, pending };
}

function groupOf(
  groups: readonly TierGroupView[],
  key: WholeKitchenGroupKey,
): TierGroupView {
  const found = groups.find((group) => group.key === key);
  if (found === undefined) throw new Error(`no ${key} group`);
  return found;
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
    const defaultOn = availabilityOff({ material: [], hardware: [] });
    const defaultOff = availabilityOff({
      material: kind === "material" ? [DEFAULT_OF.material] : [],
      hardware: kind === "hardware" ? [DEFAULT_OF.hardware] : [],
    });
    const nonDefaultOff = availabilityOff({
      material: kind === "material" ? [A_NON_DEFAULT.material] : [],
      hardware: kind === "hardware" ? [A_NON_DEFAULT.hardware] : [],
    });
    const bothOff = availabilityOff({
      material:
        kind === "material"
          ? [DEFAULT_OF.material, A_NON_DEFAULT.material]
          : [],
      hardware:
        kind === "hardware"
          ? [DEFAULT_OF.hardware, A_NON_DEFAULT.hardware]
          : [],
    });

    it("switched off with the default on: opens on the default, checks exactly it, and one untouched Aplica stores it", () => {
      const design = carrying({ [kind]: A_NON_DEFAULT[kind] });

      const { groups, pending } = viewOpenedOn(design, nonDefaultOff);
      const { outcome, stored } = pressApplyUntouched(design, nonDefaultOff);

      expect(pending[key]).toBe(DEFAULT_OF[kind]);
      expect(
        groupOf(groups, kind)
          .options.filter((option) => option.isSelected)
          .map((option) => option.tierId),
      ).toEqual([DEFAULT_OF[kind]]);
      expect(groupOf(groups, kind).tierIds).not.toContain(A_NON_DEFAULT[kind]);
      expect(outcome.committed).toBe(true);
      expect(stored.settings?.[key]).toBe(DEFAULT_OF[kind]);
    });

    it("vanished with the default on: opens on the default and one untouched Aplica stores it", () => {
      const design = carrying({ [kind]: VANISHED[kind] });

      const { pending } = viewOpenedOn(design, defaultOn);
      const { outcome, stored } = pressApplyUntouched(design, defaultOn);

      expect(pending[key]).toBe(DEFAULT_OF[kind]);
      expect(outcome.committed).toBe(true);
      expect(stored.settings?.[key]).toBe(DEFAULT_OF[kind]);
    });

    it.each([
      ["switched off", A_NON_DEFAULT],
      ["vanished", VANISHED],
      ["the default itself", DEFAULT_OF],
    ] as const)(
      "%s with the default off too: opens on nothing, checks nothing, and an untouched Aplica refuses nothing and rewrites nothing",
      (_label, carriedIds) => {
        const design = carrying({ [kind]: carriedIds[kind] });
        const availability = carriedIds === DEFAULT_OF ? defaultOff : bothOff;

        const { groups, pending } = viewOpenedOn(design, availability);
        const { outcome, stored } = pressApplyUntouched(design, availability);

        expect(pending[key]).toBeUndefined();
        expect(
          groupOf(groups, kind).options.filter((option) => option.isSelected),
        ).toEqual([]);
        expect(outcome.committed).toBe(true);
        expect(stored.settings?.[key]).toBe(carriedIds[kind]);
      },
    );

    it("names the tier it carries on the pill when that tier is only switched off, as it would were it on", () => {
      const design = carrying({ [kind]: A_NON_DEFAULT[kind] });
      const labelOf = (availability: CatalogueAvailability): string => {
        const pill = describeSettingsPill({
          offer: offerFor(design, availability),
          applied: design.settings ?? {},
          content: ro,
        });
        const setting = pill.settings.find((one) => one.key === kind);
        if (setting === undefined) throw new Error(`no ${kind} on the pill`);
        return setting.label;
      };

      const defaultsLabel = describeSettingsPill({
        offer: offerFor(carrying({}), defaultOn),
        applied: {},
        content: ro,
      }).settings.find((one) => one.key === kind)?.label;

      expect(labelOf(nonDefaultOff)).toBe(labelOf(defaultOn));
      expect(labelOf(nonDefaultOff)).not.toBe(defaultsLabel);
    });

    it("names the default on the pill for a vanished tier, even when the default is switched off", () => {
      const design = carrying({ [kind]: VANISHED[kind] });
      const labelOf = (
        carried: Design,
        availability: CatalogueAvailability,
      ): string => {
        const pill = describeSettingsPill({
          offer: offerFor(carried, availability),
          applied: carried.settings ?? {},
          content: ro,
        });
        return pill.settings.find((one) => one.key === kind)?.label ?? "";
      };
      const defaultsLabel = labelOf(carrying({}), defaultOn);

      expect(labelOf(design, defaultOn)).toBe(defaultsLabel);
      expect(labelOf(design, defaultOff)).toBe(defaultsLabel);
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
  const anyState = fc.record({
    carriedMaterial: carriedIn("material"),
    carriedHardware: carriedIn("hardware"),
    offMaterial: fc.subarray([...TIER_IDS.material]),
    offHardware: fc.subarray([...TIER_IDS.hardware]),
  });

  it("only ever opens on a tier it lists or on nothing, and one untouched Aplica always commits", () => {
    let wroteADefault = 0;
    let wroteNothing = 0;
    fc.assert(
      fc.property(
        anyState,
        ({ carriedMaterial, carriedHardware, offMaterial, offHardware }) => {
          const design = carrying({
            ...(carriedMaterial === undefined
              ? {}
              : { material: carriedMaterial }),
            ...(carriedHardware === undefined
              ? {}
              : { hardware: carriedHardware }),
          });
          const availability = availabilityOff({
            material: offMaterial,
            hardware: offHardware,
          });

          const { groups, pending } = viewOpenedOn(design, availability);
          const { outcome } = pressApplyUntouched(design, availability);

          for (const kind of EVERY_KIND) {
            const opened = pending[KEY_OF[kind]];
            if (opened === undefined) continue;
            expect(groupOf(groups, kind).tierIds, `${kind} opened`).toContain(
              opened,
            );
          }
          expect(outcome.committed).toBe(true);
          if (pending.materialTierId === DEFAULT_OF.material)
            wroteADefault += 1;
          if (
            carriedMaterial !== undefined &&
            pending.materialTierId === undefined
          )
            wroteNothing += 1;
        },
      ),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );

    // Both outcomes were reached, so neither branch of the rule went unexercised.
    expect(wroteADefault).toBeGreaterThan(0);
    expect(wroteNothing).toBeGreaterThan(0);
  });

  it("checks at most one option per group, and none that the group does not list", () => {
    fc.assert(
      fc.property(
        anyState,
        ({ carriedMaterial, carriedHardware, offMaterial, offHardware }) => {
          const design = carrying({
            ...(carriedMaterial === undefined
              ? {}
              : { material: carriedMaterial }),
            ...(carriedHardware === undefined
              ? {}
              : { hardware: carriedHardware }),
          });
          const { groups } = viewOpenedOn(
            design,
            availabilityOff({ material: offMaterial, hardware: offHardware }),
          );

          for (const group of groups) {
            const checked = group.options.filter((option) => option.isSelected);
            expect(checked.length, group.key).toBeLessThanOrEqual(1);
            for (const option of checked)
              expect(group.tierIds).toContain(option.tierId);
            for (const option of group.options)
              expect(group.tierIds).toContain(option.tierId);
          }
        },
      ),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });
});
