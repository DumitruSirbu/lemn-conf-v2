// Adversarial QA of M10 Q5c: the settings pill while a material or hardware row is owed (Q5 ruling 6, OQ-43's default,
// ADR 0104 decision 3: a label is never absent and never a counter alone).
//
// `q5c-pill-material-owed.test.ts` (the implementer's) pins one label per state and one parity sweep. This file adds what
// it lacks: the pill at EVERY rung of EVERY owed state (a named label, a correct hidden count, no zero); a free colour in
// the row; both groups owed together; the owed state clearing the moment the row is resolved, and the label coming back
// when the switch-off is reverted; a switch-off nobody carries changing nothing (the whole pill, not one label); no book;
// the Russian leaf; and a parity sweep that runs over both offer routes, over books that have lost a tier, with
// coverage counters so a sweep that never visits an owed state cannot pass.
import { fc } from "@fast-check/vitest";
import {
  KITCHEN_L_BODY_CATALOG,
  materialById,
  replacementsRequired,
  SAMPLE_PRICE_BOOK,
  type CatalogueAvailability,
  type Design,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { resolveContent } from "@/i18n/content";
import { NO_TIER_OFFER } from "@/price/price-book-root";
import {
  describePillRung,
  describeSettingsPill,
  type SettingsPillView,
} from "@/settings/global-settings-model";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { A_BARE_ZERO } from "../support/figures-in-text";
import { ro } from "../support/romanian-content";
import {
  bookWithout,
  HARDWARE_DEFAULT_TIER_ID,
  HARDWARE_TIER_IDS,
  kitchenCarrying,
  MATERIAL_DEFAULT_TIER_ID,
  MATERIAL_TIER_IDS,
  offerThroughRoot,
  offerUnder,
  switchedOffTiers,
  tierName,
  type TiersByGroup,
} from "../support/tier-offer-world";

const SWEEP_SEED = 20_261_110;
const SWEEP_RUNS = 400;
const WITHDRAWN = "tier.withdrawn-from-the-book";
const LEAF = ro.replacementSheet.headerMaterialToChoose;

const NON_DEFAULT_MATERIAL = "material.veneer";
const MDF_MATERIAL = "material.painted-mdf";
const NON_DEFAULT_HARDWARE = "hardware.premium";

/** A kitchen the pill is read on: what it carries and what is switched off. */
interface World {
  readonly name: string;
  readonly materialTierId?: string;
  readonly hardwareTierId?: string;
  readonly off?: TiersByGroup;
  /** The pill's settings, in order, as the state must draw them. */
  readonly keys: readonly string[];
}

/** Every way a material row is owed: switched off (a named tier, a free-colour one), unchosen with the default off, and
 *  withdrawn; alone and with hardware owed beside it. */
const MATERIAL_OWED_WORLDS: readonly World[] = [
  {
    name: "a named material switched off",
    materialTierId: NON_DEFAULT_MATERIAL,
    off: { material: [NON_DEFAULT_MATERIAL] },
    keys: ["material", "colour", "hardware", "depth"],
  },
  {
    name: "a free-colour material switched off",
    materialTierId: MDF_MATERIAL,
    off: { material: [MDF_MATERIAL] },
    keys: ["material", "colour", "hardware", "depth"],
  },
  {
    name: "no material chosen and the book default switched off",
    off: { material: [MATERIAL_DEFAULT_TIER_ID] },
    keys: ["material", "colour", "hardware", "depth"],
  },
  {
    name: "a material withdrawn from the book, the default on",
    materialTierId: WITHDRAWN,
    keys: ["material", "hardware", "depth"],
  },
  {
    name: "a material withdrawn from the book, the default off",
    materialTierId: WITHDRAWN,
    off: { material: [MATERIAL_DEFAULT_TIER_ID] },
    keys: ["material", "hardware", "depth"],
  },
  {
    name: "both groups switched off",
    materialTierId: NON_DEFAULT_MATERIAL,
    hardwareTierId: NON_DEFAULT_HARDWARE,
    off: {
      material: [NON_DEFAULT_MATERIAL],
      hardware: [NON_DEFAULT_HARDWARE],
    },
    keys: ["material", "colour", "depth"],
  },
  {
    name: "both groups withdrawn",
    materialTierId: WITHDRAWN,
    hardwareTierId: WITHDRAWN,
    keys: ["material", "depth"],
  },
];

/** What a kitchen carries and has switched off; an unchosen group is `undefined`, never an id. */
interface Kitchen {
  readonly materialTierId?: string | undefined;
  readonly hardwareTierId?: string | undefined;
  readonly off?: TiersByGroup | undefined;
}

function designOf(kitchen: Kitchen): Design {
  return kitchenCarrying({
    materialTierId: kitchen.materialTierId,
    hardwareTierId: kitchen.hardwareTierId,
  });
}

function pillOf(kitchen: Kitchen, content = ro): SettingsPillView {
  const design = designOf(kitchen);
  return describeSettingsPill({
    offer: offerThroughRoot(switchedOffTiers(kitchen.off), design),
    applied: design.settings ?? {},
    content,
  });
}

function labelOf(pill: SettingsPillView, key: string): string | undefined {
  return pill.settings.find((setting) => setting.key === key)?.label;
}

/**
 * What a rung draws, derived without `describePillRung`: the first `visible` settings (at least one, at most all),
 * widened to the first one that has a name, so a free colour's blank never leaves the pill with nothing written.
 */
function expectedRung(pill: SettingsPillView, visible: number) {
  const count = pill.settings.length;
  let shown = Math.min(Math.max(visible, 1), count);
  while (
    shown < count &&
    pill.settings.slice(0, shown).every((setting) => setting.label === "")
  )
    shown += 1;
  return {
    labels: pill.settings
      .slice(0, shown)
      .map((setting) => setting.label)
      .filter((label) => label !== ""),
    hiddenCount: count - shown,
  };
}

describe("the premise: each owed world really is one, and draws the settings it claims", () => {
  it.each(MATERIAL_OWED_WORLDS)("$name", (world) => {
    const pill = pillOf(world);

    expect(pill.settings.map((setting) => setting.key)).toEqual(world.keys);
    expect(labelOf(pill, "material")).toBe(LEAF);
  });

  it("has a leaf that is words, not a figure, an id or a blank", () => {
    expect(LEAF).toBe("Material de ales");
    expect(LEAF).not.toMatch(/\d/u);
    expect(LEAF).not.toMatch(/^\s*$/u);
  });
});

describe.each(MATERIAL_OWED_WORLDS)(
  "the pill at every rung, with $name",
  (world) => {
    const pill = pillOf(world);
    const rungs = Array.from(
      { length: pill.settings.length + 2 },
      (_unused, index) => index,
    );

    it.each(rungs)(
      "at %i visible: names the leaf first, never a counter alone, hides exactly what it counts",
      (visible) => {
        const rung = describePillRung(pill, visible);
        const expected = expectedRung(pill, visible);

        expect(rung.labels.length).toBeGreaterThanOrEqual(1);
        expect(rung.labels[0]).toBe(LEAF);
        expect(rung.labels).toEqual(expected.labels);
        expect(rung.labels).not.toContain("");
        if (expected.hiddenCount === 0) expect(rung.counter).toBeUndefined();
        else expect(rung.counter).toBe(`+${String(expected.hiddenCount)}`);
        expect(rung.counter).not.toBe("+0");
        expect(
          [...rung.labels, rung.counter ?? ""].join(" | "),
          "no zero, NaN or undefined drawn",
        ).not.toMatch(A_BARE_ZERO);
      },
    );

    it("states every setting in the accessible name, the leaf among them, whatever rung the row chose", () => {
      expect(pill.accessibleName).toContain(LEAF);
      for (const setting of pill.settings)
        if (setting.label !== "")
          expect(pill.accessibleName).toContain(setting.label);
    });

    it("counts fewer hidden settings, never more, as the rung adds settings", () => {
      const hiddenAt = (visible: number): number =>
        Number(describePillRung(pill, visible).counter?.slice(1) ?? 0);
      for (let visible = 2; visible <= pill.settings.length; visible += 1)
        expect(hiddenAt(visible)).toBeLessThan(hiddenAt(visible - 1));
    });
  },
);

describe("a free colour beside the leaf", () => {
  const pill = pillOf({
    materialTierId: MDF_MATERIAL,
    off: { material: [MDF_MATERIAL] },
  });

  it("is a shown setting that draws no text: the swatch wears it, and the leaf is the first label", () => {
    expect(labelOf(pill, "colour")).toBe("");
    expect(pill.swatch).toBeDefined();
    expect(describePillRung(pill, 2).labels).toEqual([LEAF]);
  });

  it("is never counted as a hidden name once shown, and is counted at the floor where it is not shown", () => {
    expect(describePillRung(pill, 2).counter).toBe("+2");
    expect(describePillRung(pill, 1).counter).toBe("+3");
    expect(describePillRung(pill, 4).counter).toBeUndefined();
  });

  it("is spoken by its value in the accessible name though it draws no text", () => {
    const finish = materialById(MDF_MATERIAL).defaultFinish;
    if (finish.kind !== "free-colour")
      throw new Error("MDF no longer defaults to a free colour");

    expect(pill.accessibleName).toContain(
      ro.globalSettings.pillColourValue(finish.value),
    );
  });
});

describe("no price book", () => {
  it.each(MATERIAL_OWED_WORLDS)(
    "draws no material entry and no leaf with $name: owing a row needs a book to owe it",
    (world) => {
      const design = designOf(world);

      const pill = describeSettingsPill({
        offer: NO_TIER_OFFER,
        applied: design.settings ?? {},
        content: ro,
      });

      expect(labelOf(pill, "material")).toBeUndefined();
      expect(labelOf(pill, "hardware")).toBeUndefined();
      expect(pill.accessibleName).not.toContain(LEAF);
      for (const visible of [1, 2, 3])
        expect(describePillRung(pill, visible).labels).not.toContain(LEAF);
    },
  );
});

describe("the owed state clears the moment the row is resolved", () => {
  const ACTIVE_ALTERNATIVES = MATERIAL_TIER_IDS.filter(
    (tierId) => tierId !== NON_DEFAULT_MATERIAL,
  );

  it.each(ACTIVE_ALTERNATIVES)(
    "names %s once the kitchen carries it, where it read the leaf while it carried the switched-off one",
    (chosen) => {
      const off = { material: [NON_DEFAULT_MATERIAL] };
      expect(
        labelOf(
          pillOf({ materialTierId: NON_DEFAULT_MATERIAL, off }),
          "material",
        ),
      ).toBe(LEAF);

      const resolved = pillOf({ materialTierId: chosen, off });

      expect(labelOf(resolved, "material")).toBe(
        ro.globalSettings.pillMaterial(tierName(chosen)),
      );
      expect(resolved.accessibleName).not.toContain(LEAF);
    },
  );

  it.each(HARDWARE_TIER_IDS.filter((id) => id !== NON_DEFAULT_HARDWARE))(
    "brings the hardware entry back, naming %s, once the hardware row is resolved",
    (chosen) => {
      const off = { hardware: [NON_DEFAULT_HARDWARE] };
      expect(
        labelOf(
          pillOf({ hardwareTierId: NON_DEFAULT_HARDWARE, off }),
          "hardware",
        ),
      ).toBeUndefined();

      const resolved = pillOf({ hardwareTierId: chosen, off });

      expect(labelOf(resolved, "hardware")).toContain(tierName(chosen));
    },
  );

  it("returns to the tier's own name when the switch-off is reverted, without the kitchen changing", () => {
    const carrying = { materialTierId: NON_DEFAULT_MATERIAL };

    const whileOff = pillOf({
      ...carrying,
      off: { material: [NON_DEFAULT_MATERIAL] },
    });
    const afterRevert = pillOf(carrying);

    expect(labelOf(whileOff, "material")).toBe(LEAF);
    expect(labelOf(afterRevert, "material")).toBe(
      ro.globalSettings.pillMaterial(tierName(NON_DEFAULT_MATERIAL)),
    );
  });

  it("resolves a withdrawn material by choosing the book default, and names it", () => {
    const resolved = pillOf({ materialTierId: MATERIAL_DEFAULT_TIER_ID });

    expect(labelOf(resolved, "material")).toBe(
      ro.globalSettings.pillMaterial(tierName(MATERIAL_DEFAULT_TIER_ID)),
    );
  });
});

describe("a switch-off nobody carries changes nothing", () => {
  const SUBSETS = (ids: readonly string[]): string[][] =>
    ids.reduce<string[][]>(
      (subsets, id) => [...subsets, ...subsets.map((s) => [...s, id])],
      [[]],
    );
  const CARRIED_MATERIAL = [undefined, ...MATERIAL_TIER_IDS];
  const CARRIED_HARDWARE = [undefined, ...HARDWARE_TIER_IDS];

  it("leaves the whole pill, every label and the accessible name, as it was with nothing off, over every subset that spares what is carried", () => {
    let comparisons = 0;
    for (const materialTierId of CARRIED_MATERIAL)
      for (const hardwareTierId of CARRIED_HARDWARE) {
        const carried = { materialTierId, hardwareTierId };
        const untouched = pillOf(carried);
        const materialInUse = materialTierId ?? MATERIAL_DEFAULT_TIER_ID;
        const hardwareInUse = hardwareTierId ?? HARDWARE_DEFAULT_TIER_ID;
        for (const material of SUBSETS(MATERIAL_TIER_IDS)) {
          if (material.includes(materialInUse)) continue;
          if (material.length === MATERIAL_TIER_IDS.length) continue;
          for (const hardware of SUBSETS(HARDWARE_TIER_IDS)) {
            if (hardware.includes(hardwareInUse)) continue;
            if (hardware.length === HARDWARE_TIER_IDS.length) continue;

            expect(
              pillOf({ ...carried, off: { material, hardware } }),
              JSON.stringify({ carried, material, hardware }),
            ).toEqual(untouched);
            comparisons += 1;
          }
        }
      }

    expect(comparisons).toBeGreaterThan(100);
  });

  it("is not vacuous: the same subsets DO change the pill the moment one of them is the tier carried", () => {
    const untouched = pillOf({ materialTierId: NON_DEFAULT_MATERIAL });

    const switchedOff = pillOf({
      materialTierId: NON_DEFAULT_MATERIAL,
      off: { material: [NON_DEFAULT_MATERIAL, "material.painted-mdf"] },
    });

    expect(switchedOff).not.toEqual(untouched);
  });
});

describe("the Russian leaf", () => {
  const russian = resolveContent(
    createTranslator({
      locale: "ru",
      messages: ruMessages as unknown as typeof roMessages,
    }),
  );
  const RUSSIAN_LEAF = ruMessages.replacementSheet.headerMaterialToChoose;

  it("is read from the Russian catalogue, and is not the Romanian words", () => {
    expect(russian.replacementSheet.headerMaterialToChoose).toBe(RUSSIAN_LEAF);
    expect(RUSSIAN_LEAF).not.toBe(LEAF);
    expect(RUSSIAN_LEAF).not.toBe("");
  });

  it.each(MATERIAL_OWED_WORLDS)(
    "is the material entry in a Russian pill with $name, and the Romanian words are nowhere in it",
    (world) => {
      const pill = pillOf(world, russian);

      expect(labelOf(pill, "material")).toBe(RUSSIAN_LEAF);
      expect(pill.accessibleName).toContain(RUSSIAN_LEAF);
      expect(pill.accessibleName).not.toContain(LEAF);
      expect(describePillRung(pill, 1).labels[0]).toBe(RUSSIAN_LEAF);
    },
  );
});

describe("the pill agrees with replacementsRequired, over every choice, every availability and every book", () => {
  type Route = "query" | "root";
  const ANY_CHOICE = (ids: readonly string[]) =>
    fc.constantFrom<string | undefined>(undefined, ...ids, WITHDRAWN);

  /** A book that has lost some non-default tiers, so a carried tier is withdrawn by the BOOK and not by a made-up id. */
  const lostTiers = fc.record({
    material: fc.subarray(
      MATERIAL_TIER_IDS.filter((id) => id !== MATERIAL_DEFAULT_TIER_ID),
    ),
    hardware: fc.subarray(
      HARDWARE_TIER_IDS.filter((id) => id !== HARDWARE_DEFAULT_TIER_ID),
    ),
  });

  const anyKitchen = fc.record({
    materialTierId: ANY_CHOICE(MATERIAL_TIER_IDS),
    hardwareTierId: ANY_CHOICE(HARDWARE_TIER_IDS),
    off: fc.record({
      material: fc.subarray([...MATERIAL_TIER_IDS]),
      hardware: fc.subarray([...HARDWARE_TIER_IDS]),
    }),
    lost: lostTiers,
    route: fc.constantFrom<Route>("query", "root"),
  });

  function bookAfter(lost: TiersByGroup): PriceBook {
    return bookWithout(SAMPLE_PRICE_BOOK, lost);
  }

  /** The dashboard refuses to switch off the last active tier of a group: a state no book can be in. */
  function leavesAnActiveTier(off: TiersByGroup, book: PriceBook): boolean {
    const active = (kind: "material" | "hardware") =>
      book[kind].tiers.some((tier) => !(off[kind] ?? []).includes(tier.tierId));
    return active("material") && active("hardware");
  }

  it("reads the leaf iff a material item is owed, names hardware iff none is owed, and names the very tier the kitchen carries otherwise", () => {
    const seen = {
      materialSwitchedOff: 0,
      materialWithdrawnDefaultOff: 0,
      materialWithdrawnDefaultOn: 0,
      materialLostByTheBook: 0,
      noChoiceDefaultOff: 0,
      hardwareOwed: 0,
      bothOwed: 0,
      nothingOwed: 0,
    };
    fc.assert(
      fc.property(anyKitchen, (kitchen) => {
        const book = bookAfter(kitchen.lost);
        fc.pre(leavesAnActiveTier(kitchen.off, book));
        const availability: CatalogueAvailability = switchedOffTiers(
          kitchen.off,
        );
        const design = kitchenCarrying(kitchen);
        const offer =
          kitchen.route === "root"
            ? offerThroughRoot(availability, design, book)
            : offerUnder(availability, design, book);
        const pill = describeSettingsPill({
          offer,
          applied: design.settings ?? {},
          content: ro,
        });
        const owed = replacementsRequired({
          design,
          book,
          availability,
          catalog: KITCHEN_L_BODY_CATALOG,
        }).map(({ item }) => item.kind);
        const isMaterialOwed = owed.includes("material");
        const isHardwareOwed = owed.includes("hardware");

        expect(labelOf(pill, "material") === LEAF, "material is the leaf").toBe(
          isMaterialOwed,
        );
        expect(
          labelOf(pill, "hardware") === undefined,
          "hardware is absent",
        ).toBe(isHardwareOwed);
        if (!isMaterialOwed)
          expect(labelOf(pill, "material")).toBe(
            ro.globalSettings.pillMaterial(
              tierName(kitchen.materialTierId ?? MATERIAL_DEFAULT_TIER_ID),
            ),
          );
        if (!isHardwareOwed)
          expect(labelOf(pill, "hardware")).toContain(
            tierName(kitchen.hardwareTierId ?? HARDWARE_DEFAULT_TIER_ID),
          );
        for (let visible = 1; visible <= pill.settings.length; visible += 1)
          expect(describePillRung(pill, visible).labels.length).toBeGreaterThan(
            0,
          );

        const material = kitchen.materialTierId;
        if (material !== undefined && kitchen.off.material.includes(material))
          seen.materialSwitchedOff += 1;
        if (material === WITHDRAWN) {
          if (kitchen.off.material.includes(MATERIAL_DEFAULT_TIER_ID))
            seen.materialWithdrawnDefaultOff += 1;
          else seen.materialWithdrawnDefaultOn += 1;
        }
        if (material !== undefined && kitchen.lost.material.includes(material))
          seen.materialLostByTheBook += 1;
        if (
          material === undefined &&
          kitchen.off.material.includes(MATERIAL_DEFAULT_TIER_ID)
        )
          seen.noChoiceDefaultOff += 1;
        if (isHardwareOwed) seen.hardwareOwed += 1;
        if (isMaterialOwed && isHardwareOwed) seen.bothOwed += 1;
        if (owed.length === 0) seen.nothingOwed += 1;
      }),
      { seed: SWEEP_SEED, numRuns: SWEEP_RUNS },
    );

    for (const [visited, count] of Object.entries(seen))
      expect(count, `the sweep never reached: ${visited}`).toBeGreaterThan(0);
  });
});
