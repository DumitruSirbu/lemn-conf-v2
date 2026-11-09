// The settings pill while a material or hardware row is owed (M10 Q5c; Q5 ruling 6; OQ-43's default).
//
// While the kitchen's material is switched off, withdrawn from the book, or unchosen with a switched-off book default,
// the pill's material entry is the leaf "Material de ales": naming the tier the kitchen carries would be false, and
// naming the book default for a vanished choice would be false as well. The hardware entry is left out in the same
// state, so the pill never names a tier the kitchen does not carry. The judgement is made from the offer and the applied
// choice alone, so the sweep below holds it to the domain's own `replacementsRequired` over the same kitchen.
import { fc } from "@fast-check/vitest";
import {
  KITCHEN_L_BODY_CATALOG,
  replacementsRequired,
  SAMPLE_PRICE_BOOK,
  type CatalogueAvailability,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { NO_TIER_OFFER } from "@/price/price-book-root";
import {
  describePillRung,
  describeSettingsPill,
  type SettingsPillView,
} from "@/settings/global-settings-model";

import { ro } from "../support/romanian-content";
import {
  HARDWARE_DEFAULT_TIER_ID,
  HARDWARE_TIER_IDS,
  kitchenCarrying,
  MATERIAL_DEFAULT_TIER_ID,
  MATERIAL_TIER_IDS,
  offerUnder,
  switchedOffTiers,
  tierName,
} from "../support/tier-offer-world";

const SWEEP_SEED = 20_261_109;
const SWEEP_RUNS = 200;
const WITHDRAWN_TIER_ID = "tier.withdrawn-from-the-book";
const MATERIAL_TO_CHOOSE = ro.replacementSheet.headerMaterialToChoose;

const SWITCHABLE_MATERIAL_ID = firstOtherThan(
  MATERIAL_TIER_IDS,
  MATERIAL_DEFAULT_TIER_ID,
);
const OTHER_MATERIAL_ID = firstOtherThan(
  MATERIAL_TIER_IDS.filter((tierId) => tierId !== SWITCHABLE_MATERIAL_ID),
  MATERIAL_DEFAULT_TIER_ID,
);
const SWITCHABLE_HARDWARE_ID = firstOtherThan(
  HARDWARE_TIER_IDS,
  HARDWARE_DEFAULT_TIER_ID,
);

function firstOtherThan(tierIds: readonly string[], excluded: string): string {
  const found = tierIds.find((tierId) => tierId !== excluded);
  if (found === undefined) throw new Error("the sample book has one tier");
  return found;
}

interface PillWorld {
  readonly pill: SettingsPillView;
  readonly design: Design;
  readonly availability: CatalogueAvailability;
}

function pillFor(world: {
  readonly materialTierId?: string;
  readonly hardwareTierId?: string;
  readonly off?: {
    readonly material?: readonly string[];
    readonly hardware?: readonly string[];
  };
}): PillWorld {
  const availability = switchedOffTiers(world.off);
  const design = kitchenCarrying(world);
  const offer = offerUnder(availability, design);
  const pill = describeSettingsPill({
    offer,
    applied: design.settings ?? {},
    content: ro,
  });
  return { pill, design, availability };
}

function labelOf(pill: SettingsPillView, key: string): string | undefined {
  return pill.settings.find((setting) => setting.key === key)?.label;
}

function owedKinds(world: PillWorld): readonly string[] {
  return replacementsRequired({
    design: world.design,
    book: SAMPLE_PRICE_BOOK,
    availability: world.availability,
    catalog: KITCHEN_L_BODY_CATALOG,
  }).map(({ item }) => item.kind);
}

/** Any choice a design can carry in one group: none, a tier the book holds, or one the book has withdrawn. */
function anyChoiceIn(tierIds: readonly string[]) {
  return fc.constantFrom<string | undefined>(
    undefined,
    ...tierIds,
    WITHDRAWN_TIER_ID,
  );
}

/** Any set switched off in each group that leaves the group an active tier (the dashboard refuses the last one). */
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

function chosenOnly(world: {
  readonly materialTierId: string | undefined;
  readonly hardwareTierId: string | undefined;
}) {
  return {
    ...(world.materialTierId === undefined
      ? {}
      : { materialTierId: world.materialTierId }),
    ...(world.hardwareTierId === undefined
      ? {}
      : { hardwareTierId: world.hardwareTierId }),
  };
}

describe("the settings pill while a material row is owed", () => {
  it("has switchable and distinct tiers in the sample book, so the examples below are not vacuous", () => {
    expect(SWITCHABLE_MATERIAL_ID).not.toBe(MATERIAL_DEFAULT_TIER_ID);
    expect(OTHER_MATERIAL_ID).not.toBe(SWITCHABLE_MATERIAL_ID);
    expect(SWITCHABLE_HARDWARE_ID).not.toBe(HARDWARE_DEFAULT_TIER_ID);
  });

  it("reads the leaf, and not the switched-off tier's name, when the material the kitchen carries is switched off", () => {
    const { pill } = pillFor({
      materialTierId: SWITCHABLE_MATERIAL_ID,
      off: { material: [SWITCHABLE_MATERIAL_ID] },
    });

    expect(labelOf(pill, "material")).toBe(MATERIAL_TO_CHOOSE);
    expect(MATERIAL_TO_CHOOSE).toBe("Material de ales");
    expect(pill.accessibleName).not.toContain(tierName(SWITCHABLE_MATERIAL_ID));
  });

  it("reads the leaf, and not the book default's name, when the material the kitchen chose has left the book", () => {
    const { pill } = pillFor({ materialTierId: WITHDRAWN_TIER_ID });

    expect(labelOf(pill, "material")).toBe(MATERIAL_TO_CHOOSE);
    expect(pill.accessibleName).not.toContain(
      tierName(MATERIAL_DEFAULT_TIER_ID),
    );
  });

  it("reads the leaf when no material is chosen and the book's default is switched off", () => {
    const { pill } = pillFor({ off: { material: [MATERIAL_DEFAULT_TIER_ID] } });

    expect(labelOf(pill, "material")).toBe(MATERIAL_TO_CHOOSE);
  });

  it("names the chosen tier once the row is resolved by choosing another material", () => {
    const { pill } = pillFor({
      materialTierId: OTHER_MATERIAL_ID,
      off: { material: [SWITCHABLE_MATERIAL_ID] },
    });

    expect(labelOf(pill, "material")).toBe(
      ro.globalSettings.pillMaterial(tierName(OTHER_MATERIAL_ID)),
    );
  });

  it("names the book default when no material is chosen and nothing is switched off", () => {
    const { pill } = pillFor({});

    expect(labelOf(pill, "material")).toBe(
      ro.globalSettings.pillMaterial(tierName(MATERIAL_DEFAULT_TIER_ID)),
    );
  });

  it("names a switched-off material by the leaf only while it is carried: a switch-off nobody carries changes nothing", () => {
    const { pill } = pillFor({ off: { material: [SWITCHABLE_MATERIAL_ID] } });

    expect(labelOf(pill, "material")).toBe(
      ro.globalSettings.pillMaterial(tierName(MATERIAL_DEFAULT_TIER_ID)),
    );
  });

  it("leaves the material entry out with no tier offer, as before", () => {
    const pill = describeSettingsPill({
      offer: NO_TIER_OFFER,
      applied: { materialTierId: WITHDRAWN_TIER_ID },
      content: ro,
    });

    expect(labelOf(pill, "material")).toBeUndefined();
    expect(labelOf(pill, "hardware")).toBeUndefined();
  });

  it("keeps the label named at every rung, so the pill is never a counter alone", () => {
    const { pill } = pillFor({ materialTierId: WITHDRAWN_TIER_ID });

    for (let visible = 1; visible <= pill.settings.length; visible += 1) {
      expect(describePillRung(pill, visible).labels).not.toEqual([]);
    }
  });

  it("speaks the leaf in the accessible name, so a screen reader hears the same thing", () => {
    const { pill } = pillFor({ materialTierId: WITHDRAWN_TIER_ID });

    expect(pill.accessibleName).toContain(MATERIAL_TO_CHOOSE);
  });
});

describe("the settings pill while a hardware row is owed", () => {
  it("leaves the hardware entry out when the hardware the kitchen carries is switched off", () => {
    const { pill } = pillFor({
      hardwareTierId: SWITCHABLE_HARDWARE_ID,
      off: { hardware: [SWITCHABLE_HARDWARE_ID] },
    });

    expect(labelOf(pill, "hardware")).toBeUndefined();
    expect(pill.accessibleName).not.toContain(tierName(SWITCHABLE_HARDWARE_ID));
  });

  it("leaves the hardware entry out when the hardware the kitchen chose has left the book, and does not name the default", () => {
    const { pill } = pillFor({ hardwareTierId: WITHDRAWN_TIER_ID });

    expect(labelOf(pill, "hardware")).toBeUndefined();
    expect(pill.accessibleName).not.toContain(
      tierName(HARDWARE_DEFAULT_TIER_ID),
    );
  });

  it("leaves the hardware entry out when no hardware is chosen and the book's default is switched off", () => {
    const { pill } = pillFor({ off: { hardware: [HARDWARE_DEFAULT_TIER_ID] } });

    expect(labelOf(pill, "hardware")).toBeUndefined();
  });

  it("names the hardware the kitchen carries when no hardware row is owed", () => {
    const { pill } = pillFor({ off: { hardware: [SWITCHABLE_HARDWARE_ID] } });

    expect(labelOf(pill, "hardware")).toContain(
      tierName(HARDWARE_DEFAULT_TIER_ID),
    );
  });

  it("still draws the material leaf and the depth with both tiers owed (the colour is absent under an undeclared material)", () => {
    const { pill } = pillFor({
      materialTierId: WITHDRAWN_TIER_ID,
      hardwareTierId: WITHDRAWN_TIER_ID,
    });

    expect(pill.settings.map((setting) => setting.key)).toEqual([
      "material",
      "depth",
    ]);
  });
});

describe("the pill agrees with the rows the domain owes", () => {
  it("reads the leaf if and only if replacementsRequired lists a material item, and names hardware if and only if it lists none", () => {
    fc.assert(
      fc.property(
        fc.record({
          materialTierId: anyChoiceIn(MATERIAL_TIER_IDS),
          hardwareTierId: anyChoiceIn(HARDWARE_TIER_IDS),
        }),
        anySwitchLeavingAnOption(),
        (carried, off) => {
          const world = pillFor({ ...chosenOnly(carried), off });
          const owed = owedKinds(world);

          expect(labelOf(world.pill, "material") === MATERIAL_TO_CHOOSE).toBe(
            owed.includes("material"),
          );
          expect(labelOf(world.pill, "hardware") === undefined).toBe(
            owed.includes("hardware"),
          );
        },
      ),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );
  });
});
