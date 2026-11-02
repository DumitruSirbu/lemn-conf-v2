// M10 M3-b, adversarial: the D9 colour reset, and the judgement of a save of the defaults. The reset is compared with
// what the customer's own material change does to a kitchen's colour (`setMaterialTier`, ADR 0057's command), not only
// with the module that decides what a material offers; the judgement is compared with what the stamp then writes.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { setMaterialTier } from "../../src/commands/set-whole-kitchen-settings.js";
import {
  stampedSettingsOf,
  type NewKitchenSettings,
} from "../../src/generation/new-kitchen-settings.js";
import {
  freeColourFinish,
  MATERIALS,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  sameFinish,
  type Finish,
} from "../../src/materials.js";
import {
  defaultItemsOf,
  judgeKitchenDefaults,
  withDefaultMaterial,
  type DefaultsJudgement,
} from "../../src/price-dashboard/defaults-judgement.js";
import {
  isSameItem,
  type ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import {
  availabilityOf,
  BOOK,
  colour,
  handle,
  hardware,
  material,
  withSettings,
} from "../support/availability-kitchens.js";

import { deepFrozen } from "./qa-m3-support.js";

const OCCURRED_AT = "2026-10-30T12:00:00.000Z";
const MATERIAL_IDS = MATERIALS.map((entry) => entry.materialId);
const FREE_COLOURS: readonly Finish[] = [
  freeColourFinish("#eceeeb"),
  freeColourFinish("#000000"),
  freeColourFinish("#FFFFFF"),
  freeColourFinish("#8d9a84"),
];
const EVERY_COLOUR: readonly Finish[] = [
  ...PALETTE_ENTRY_IDS.map(paletteFinish),
  ...FREE_COLOURS,
];

/** ADR 0071, from the ids' own namespacing: PAL offers `pal.*`, veneer `veneer.*`, painted MDF any free colour. */
function materialOwning(finish: Finish): string {
  if (finish.kind === "free-colour") return "material.painted-mdf";
  return finish.entryId.startsWith("pal.")
    ? "material.melamine"
    : "material.veneer";
}

function defaultColourOf(materialId: string): Finish {
  const found = MATERIALS.find((entry) => entry.materialId === materialId);
  if (found === undefined) throw new Error(`no material ${materialId}`);
  return found.defaultFinish;
}

/** What a customer's own material change makes of a kitchen-level colour (the command, with no cabinet colours). */
function colourAfterCustomerChangesMaterial(
  from: string,
  to: string,
  finish: Finish,
): Finish | undefined {
  const design = withSettings({
    cabinetDepthMm: 600,
    materialTierId: from,
    finish,
  });
  const result = setMaterialTier({
    design,
    tierId: to,
    availableTierIds: MATERIAL_IDS,
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design.settings?.finish;
}

describe("the D9 colour reset is what the customer's own material change does, over every material and colour pair", () => {
  it("equals setMaterialTier's colour for every (current material, new material, colour) triple", () => {
    let triples = 0;
    for (const from of MATERIAL_IDS) {
      for (const to of MATERIAL_IDS) {
        for (const finish of EVERY_COLOUR) {
          const asCustomer = colourAfterCustomerChangesMaterial(
            from,
            to,
            finish,
          );
          const asDashboard = withDefaultMaterial(
            { materialTierId: from, finish },
            to,
          );

          expect(
            asDashboard.defaults.finish,
            `${from} -> ${to} wearing ${JSON.stringify(finish)}`,
          ).toEqual(asCustomer);
          triples += 1;
        }
      }
    }
    expect(triples).toBe(
      MATERIAL_IDS.length * MATERIAL_IDS.length * EVERY_COLOUR.length,
    );
  });

  it("reports a reset exactly when the colour changed, from the colour it was to the new material's default", () => {
    for (const to of MATERIAL_IDS) {
      for (const finish of EVERY_COLOUR) {
        const change = withDefaultMaterial({ finish }, to);
        const kept = materialOwning(finish) === to;

        if (kept) {
          expect(
            change.colourReset,
            `${to} keeps ${JSON.stringify(finish)}`,
          ).toBeUndefined();
          expect(change.defaults.finish).toEqual(finish);
        } else {
          expect(change.colourReset).toEqual({
            from: finish,
            to: defaultColourOf(to),
          });
          expect(change.defaults.finish).toEqual(defaultColourOf(to));
        }
      }
    }
  });

  it("is what the new kitchen is then stamped with, so the saved default and the stamped kitchen cannot differ", () => {
    for (const to of MATERIAL_IDS) {
      for (const finish of EVERY_COLOUR) {
        const { defaults } = withDefaultMaterial({ finish }, to);

        expect(stampedSettingsOf(defaults).finish).toEqual(defaults.finish);
        expect(
          stampedSettingsOf({ materialTierId: to, finish }).finish,
        ).toEqual(defaults.finish);
      }
    }
  });

  it("changes the material and nothing else, and does not touch a key the defaults did not carry", () => {
    const before: NewKitchenSettings = {
      hardwareTierId: "hardware.premium",
      handle: "black",
      topRowHandle: "steel",
      cabinetDepthMm: 600,
    };

    const { defaults, colourReset } = withDefaultMaterial(
      before,
      "material.veneer",
    );

    expect(defaults).toEqual({ ...before, materialTierId: "material.veneer" });
    expect(colourReset).toBeUndefined();
    expect("finish" in defaults).toBe(false);
  });

  it("is idempotent: applying the same material again resets nothing further", () => {
    for (const to of MATERIAL_IDS) {
      for (const finish of EVERY_COLOUR) {
        const once = withDefaultMaterial({ finish }, to);
        const twice = withDefaultMaterial(once.defaults, to);

        expect(twice.defaults).toEqual(once.defaults);
        expect(twice.colourReset).toBeUndefined();
      }
    }
  });

  it("holds the offer invariant over any sequence of material changes from any acceptable start", () => {
    const aMaterial = fc.constantFrom(...MATERIAL_IDS);
    const aStart = fc.constantFrom(...EVERY_COLOUR).chain((finish) =>
      fc.constant({
        materialTierId: materialOwning(finish),
        finish,
      } as NewKitchenSettings),
    );

    fc.assert(
      fc.property(
        aStart,
        fc.array(aMaterial, { maxLength: 12 }),
        (start, sequence) => {
          let defaults = start;
          for (const tierId of sequence) {
            defaults = withDefaultMaterial(defaults, tierId).defaults;
            const verdict = judgeKitchenDefaults(defaults, {
              book: BOOK,
              availability: availabilityOf([]),
            });
            expect(verdict).toEqual({ kind: "acceptable" });
            expect(defaults.materialTierId).toBe(tierId);
          }
        },
      ),
    );
  });

  it("resets to a colour that defaultItemsOf protects whenever the target is a palette entry, and to no item for MDF", () => {
    const protectedItems = defaultItemsOf({ book: BOOK, defaults: {} });

    for (const to of MATERIAL_IDS) {
      for (const finish of EVERY_COLOUR) {
        const target = withDefaultMaterial({ finish }, to).colourReset?.to;
        if (target === undefined) continue;
        if (target.kind === "palette-entry") {
          expect(
            protectedItems.some((item) =>
              isSameItem(item, colour(target.entryId)),
            ),
          ).toBe(true);
        } else {
          expect(to).toBe("material.painted-mdf");
        }
      }
    }
  });

  it("never mutates the defaults it was given, and hands back no object it shares with the material declaration", () => {
    const given = deepFrozen({
      materialTierId: "material.melamine",
      finish: paletteFinish("pal.antracit"),
    } as NewKitchenSettings);

    const veneer = withDefaultMaterial(given, "material.veneer");
    const mdf = withDefaultMaterial(given, "material.painted-mdf");

    expect(given).toEqual({
      materialTierId: "material.melamine",
      finish: paletteFinish("pal.antracit"),
    });
    for (const change of [veneer, mdf]) {
      for (const declared of MATERIALS) {
        expect(change.defaults.finish).not.toBe(declared.defaultFinish);
        expect(change.colourReset?.to).not.toBe(declared.defaultFinish);
      }
    }
  });

  it("treats a palette id or a colour no material declares as one the new material does not offer", () => {
    const strays: Finish[] = [
      { kind: "palette-entry", entryId: "pal.nope" as never },
      { kind: "free-colour", value: "red" },
      { kind: "free-colour", value: "#12345" },
      { kind: "free-colour", value: "#1234567" },
    ];

    for (const finish of strays) {
      for (const to of MATERIAL_IDS) {
        expect(
          withDefaultMaterial({ finish }, to).defaults.finish,
          `${to} ${JSON.stringify(finish)}`,
        ).toEqual(defaultColourOf(to));
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("a save of the defaults is judged in the order the dialog reads, for every combination of items off", () => {
  const FULL: NewKitchenSettings = {
    materialTierId: "material.veneer",
    hardwareTierId: "hardware.premium",
    handle: "black",
    topRowHandle: "steel",
    finish: paletteFinish("veneer.nuc"),
  };
  const IN_ORDER: readonly ItemRef[] = [
    material("material.veneer"),
    hardware("hardware.premium"),
    handle("black"),
    handle("steel"),
    colour("veneer.nuc"),
  ];

  function subsetsOf(
    items: readonly ItemRef[],
  ): readonly (readonly ItemRef[])[] {
    return items.reduce<readonly (readonly ItemRef[])[]>(
      (subsets, item) => [...subsets, ...subsets.map((s) => [...s, item])],
      [[]],
    );
  }

  it("names the first of material, hardware, handle, top-row handle, colour that is off, whatever else is off", () => {
    for (const off of subsetsOf(IN_ORDER)) {
      const verdict = judgeKitchenDefaults(FULL, {
        book: BOOK,
        availability: availabilityOf(off),
      });
      const firstOff = IN_ORDER.find((item) =>
        off.some((candidate) => isSameItem(candidate, item)),
      );

      expect(verdict).toEqual(
        firstOff === undefined
          ? { kind: "acceptable" }
          : { kind: "unavailable", item: firstOff },
      );
    }
  });

  it("is not confused by the order availability lists its items in", () => {
    const off = [...IN_ORDER].reverse();

    expect(
      judgeKitchenDefaults(FULL, {
        book: BOOK,
        availability: availabilityOf(off),
      }),
    ).toEqual({
      kind: "unavailable",
      item: IN_ORDER[0],
    });
  });

  it("puts an unavailable item before a colour the material does not offer, and a colour not offered before a colour that is off", () => {
    const wrongColour: NewKitchenSettings = {
      materialTierId: "material.veneer",
      handle: "black",
      finish: paletteFinish("pal.alb"),
    };

    expect(
      judgeKitchenDefaults(wrongColour, {
        book: BOOK,
        availability: availabilityOf([handle("black")]),
      }),
    ).toEqual({ kind: "unavailable", item: handle("black") });
    expect(
      judgeKitchenDefaults(wrongColour, {
        book: BOOK,
        availability: availabilityOf([colour("pal.alb")]),
      }),
    ).toEqual({ kind: "colour-not-in-palette" });
  });

  it("judges a saved colour against the stamp: acceptable exactly when the stamp keeps it, over random sets of defaults", () => {
    const aFinish = fc.constantFrom(...EVERY_COLOUR, undefined);
    const aTier = fc.constantFrom(...MATERIAL_IDS, undefined);
    const arms = { acceptable: 0, notInPalette: 0 };

    fc.assert(
      fc.property(aTier, aFinish, (materialTierId, finish) => {
        const defaults = {
          ...(materialTierId === undefined ? {} : { materialTierId }),
          ...(finish === undefined ? {} : { finish }),
        } as NewKitchenSettings;

        const verdict = judgeKitchenDefaults(defaults, {
          book: BOOK,
          availability: availabilityOf([]),
        });
        const stamped = stampedSettingsOf(defaults).finish;
        const stampKeeps =
          finish === undefined ||
          (stamped !== undefined && sameFinish(stamped, finish));

        expect(verdict.kind).toBe(
          stampKeeps ? "acceptable" : "colour-not-in-palette",
        );
        arms[verdict.kind === "acceptable" ? "acceptable" : "notInPalette"] +=
          1;
      }),
      { numRuns: 200 },
    );

    expect(arms.acceptable).toBeGreaterThan(5);
    expect(arms.notInPalette).toBeGreaterThan(5);
  });

  it("accepts nothing saved, and names an item the book does not state as unavailable, kind by kind", () => {
    const context = { book: BOOK, availability: availabilityOf([]) };

    expect(judgeKitchenDefaults({}, context)).toEqual({ kind: "acceptable" });
    expect(
      judgeKitchenDefaults({ materialTierId: "material.retired" }, context),
    ).toEqual({ kind: "unavailable", item: material("material.retired") });
    expect(
      judgeKitchenDefaults({ hardwareTierId: "hardware.retired" }, context),
    ).toEqual({ kind: "unavailable", item: hardware("hardware.retired") });
    expect(judgeKitchenDefaults({ handle: "gold" as never }, context)).toEqual({
      kind: "unavailable",
      item: handle("gold" as never),
    });
  });

  it("never returns a verdict that depends on the defaults object being mutated or on an input being writable", () => {
    const frozenDefaults = deepFrozen(structuredClone(FULL));
    const context = deepFrozen({
      book: structuredClone(BOOK),
      availability: availabilityOf([colour("pal.antracit")]),
    });

    const verdicts: DefaultsJudgement[] = [
      judgeKitchenDefaults(frozenDefaults, context),
      judgeKitchenDefaults(frozenDefaults, context),
    ];

    expect(verdicts[0]).toEqual(verdicts[1]);
    expect(
      defaultItemsOf({ book: context.book, defaults: frozenDefaults }),
    ).toEqual(defaultItemsOf({ book: BOOK, defaults: FULL }));
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("the items that are the default, per material and per colour", () => {
  it("protects pal.alb and veneer.stejar whatever D9 says, and names MDF's free default as no item", () => {
    for (const defaults of [
      {},
      { materialTierId: "material.veneer" },
      {
        finish: paletteFinish("veneer.nuc"),
        materialTierId: "material.veneer",
      },
    ]) {
      const items = defaultItemsOf({
        book: BOOK,
        defaults: defaults as NewKitchenSettings,
      });

      expect(items.some((item) => isSameItem(item, colour("pal.alb")))).toBe(
        true,
      );
      expect(
        items.some((item) => isSameItem(item, colour("veneer.stejar"))),
      ).toBe(true);
      expect(
        items
          .filter((item) => item.kind === "finish")
          .every((item) =>
            (PALETTE_ENTRY_IDS as readonly string[]).includes(item.finishId),
          ),
      ).toBe(true);
    }
  });

  it("protects exactly one colour more when D9 names a palette colour that is not a material default, and none for a free colour", () => {
    const base = defaultItemsOf({ book: BOOK, defaults: {} }).filter(
      (item) => item.kind === "finish",
    );

    const withPalette = defaultItemsOf({
      book: BOOK,
      defaults: { finish: paletteFinish("pal.antracit") },
    }).filter((item) => item.kind === "finish");
    const withFree = defaultItemsOf({
      book: BOOK,
      defaults: { finish: freeColourFinish("#abcdef") },
    }).filter((item) => item.kind === "finish");

    expect(withPalette).toHaveLength(base.length + 1);
    expect(withFree).toEqual(base);
  });

  it("lists each default once, however many keys of D9 name it", () => {
    const items = defaultItemsOf({
      book: BOOK,
      defaults: {
        materialTierId: BOOK.material.defaultTierId,
        hardwareTierId: BOOK.hardware.defaultTierId,
        handle: "steel",
        topRowHandle: "push",
        finish: paletteFinish("pal.alb"),
      },
    });

    for (const item of items) {
      expect(
        items.filter((candidate) => isSameItem(candidate, item)),
      ).toHaveLength(1);
    }
  });
});

describe("a verdict is the caller's own, and a document the schema refuses is the stamp's to refuse", () => {
  const CONTEXT = { book: BOOK, availability: availabilityOf([]) };

  function tryToOverwrite(verdict: DefaultsJudgement): void {
    try {
      (verdict as { kind: string }).kind = "poisoned";
    } catch {
      // A frozen verdict refuses the write, which is the point: the next caller must not see it.
    }
  }

  it("is not poisoned for the next caller when one caller writes to the acceptable verdict it was handed", () => {
    tryToOverwrite(judgeKitchenDefaults({}, CONTEXT));

    expect(judgeKitchenDefaults({}, CONTEXT)).toEqual({ kind: "acceptable" });
    expect(judgeKitchenDefaults({ handle: "black" }, CONTEXT)).toEqual({
      kind: "acceptable",
    });
  });

  it("does not throw a TypeError for a colour that is not a Finish at all: the stamp refuses it, not a crash here", () => {
    const hostile = [null, 7, "pal.alb", {}, []] as unknown as Finish[];

    for (const finish of hostile) {
      expect(
        () => judgeKitchenDefaults({ finish }, CONTEXT),
        JSON.stringify(finish),
      ).not.toThrow(TypeError);
    }
  });

  it("never calls a document the stamp refuses acceptable", () => {
    const refused: NewKitchenSettings[] = [
      { finish: null } as never,
      { handle: null } as never,
      { materialTierId: null } as never,
      { hardwareTierId: null } as never,
      { topRowHandle: null } as never,
    ];

    for (const defaults of refused) {
      let verdict: DefaultsJudgement["kind"] | "threw" = "threw";
      try {
        verdict = judgeKitchenDefaults(defaults, CONTEXT).kind;
      } catch {
        verdict = "threw";
      }

      expect(verdict, JSON.stringify(defaults)).not.toBe("acceptable");
    }
  });
});
