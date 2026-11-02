// M10 M3-b: changing the default material resets the default colour by ADR 0057's rule exactly, swept over every
// material and every colour pair; and a save of the defaults is judged for the items it names (A-17).
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  stampedSettingsOf,
  type NewKitchenSettings,
} from "../../src/generation/new-kitchen-settings.js";
import {
  freeColourFinish,
  MATERIALS,
  PALETTE_ENTRY_IDS,
  paletteFinish,
  type Finish,
  type MaterialId,
} from "../../src/materials.js";
import {
  defaultItemsOf,
  judgeKitchenDefaults,
  withDefaultMaterial,
} from "../../src/price-dashboard/defaults-judgement.js";
import {
  isItemDisabled,
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
} from "../support/availability-kitchens.js";

const FREE_COLOURS: readonly Finish[] = [
  freeColourFinish("#eceeeb"),
  freeColourFinish("#8d9a84"),
  freeColourFinish("#000000"),
  freeColourFinish("#ABCDEF"),
];
const EVERY_COLOUR: readonly Finish[] = [
  ...PALETTE_ENTRY_IDS.map(paletteFinish),
  ...FREE_COLOURS,
];

/** ADR 0071, written out: PAL offers its decors, veneer its woods, and painted MDF any free colour. Stated from the
 *  palette's own namespacing (`pal.*`, `veneer.*`), not from the module that decides it. */
function materialThatOffers(finish: Finish): MaterialId {
  if (finish.kind === "free-colour") return "material.painted-mdf";
  return finish.entryId.startsWith("pal.")
    ? "material.melamine"
    : "material.veneer";
}

describe("the default colour is reset by ADR 0057's rule when the default material changes (M3-b)", () => {
  it("keeps a colour the new material offers and resets any other to the new material's default, for every pair", () => {
    for (const { materialId, defaultFinish } of MATERIALS) {
      for (const finish of EVERY_COLOUR) {
        const change = withDefaultMaterial({ finish }, materialId);

        const isOffered = materialThatOffers(finish) === materialId;
        const label = `${materialId} with ${JSON.stringify(finish)}`;
        expect(change.defaults.finish, label).toEqual(
          isOffered ? finish : defaultFinish,
        );
        expect(change.colourReset, label).toEqual(
          isOffered ? undefined : { from: finish, to: defaultFinish },
        );
      }
    }
  });

  it("agrees with the reset a new kitchen is stamped with, for every pair", () => {
    for (const { materialId } of MATERIALS) {
      for (const finish of EVERY_COLOUR) {
        const stamped = stampedSettingsOf({
          materialTierId: materialId,
          finish,
        });

        expect(
          withDefaultMaterial({ finish }, materialId).defaults.finish,
        ).toEqual(stamped.finish);
      }
    }
  });

  it("holds for any free colour: only painted MDF keeps it", () => {
    const aHexColour = fc
      .integer({ min: 0, max: 0xffffff })
      .map((value) =>
        freeColourFinish(`#${value.toString(16).padStart(6, "0")}`),
      );

    fc.assert(
      fc.property(
        aHexColour,
        fc.constantFrom(...MATERIALS),
        (finish, target) => {
          const change = withDefaultMaterial({ finish }, target.materialId);

          const keeps = target.materialId === "material.painted-mdf";
          expect(change.defaults.finish).toEqual(
            keeps ? finish : target.defaultFinish,
          );
          expect(change.colourReset === undefined).toBe(keeps);
        },
      ),
    );
  });

  it("resets to a colour that is always a default, so one that can never be switched off", () => {
    const defaults = defaultItemsOf({ book: BOOK, defaults: {} });

    for (const { materialId } of MATERIALS) {
      for (const finish of EVERY_COLOUR) {
        const to = withDefaultMaterial({ finish }, materialId).colourReset?.to;
        if (to?.kind !== "palette-entry") continue;

        expect(
          defaults.some((item) => isSameItem(item, colour(to.entryId))),
        ).toBe(true);
      }
    }
  });

  it("changes the material and nothing else, and has no colour to reset when none is stored", () => {
    const stored: NewKitchenSettings = {
      hardwareTierId: "hardware.premium",
      cabinetDepthMm: 700,
      handle: "black",
      topRowHandle: "steel",
    };

    const change = withDefaultMaterial(stored, "material.veneer");

    expect(change.defaults).toEqual({
      ...stored,
      materialTierId: "material.veneer",
    });
    expect(change.colourReset).toBeUndefined();
  });

  it("resets nothing for a material no declaration names, which makes no offer", () => {
    const change = withDefaultMaterial(
      { finish: paletteFinish("pal.alb") },
      "material.retired",
    );

    expect(change.defaults).toEqual({
      materialTierId: "material.retired",
      finish: paletteFinish("pal.alb"),
    });
    expect(change.colourReset).toBeUndefined();
  });

  it("leaves a stored colour that is not a colour at all for the save judgement to refuse, and does not throw", () => {
    for (const notAColour of [null, 7, "pal.alb"]) {
      const given = { finish: notAColour } as unknown as NewKitchenSettings;

      const change = withDefaultMaterial(given, "material.veneer");

      expect(change.defaults, String(notAColour)).toEqual({
        finish: notAColour,
        materialTierId: "material.veneer",
      });
      expect(change.colourReset).toBeUndefined();
    }
  });

  it("does not change the defaults it was given, nor share the reset colour with the material's declaration", () => {
    const given: NewKitchenSettings = { finish: paletteFinish("pal.alb") };
    const frozen = structuredClone(given);

    const change = withDefaultMaterial(given, "material.veneer");

    expect(given).toEqual(frozen);
    expect(change.defaults.finish).toEqual(paletteFinish("veneer.stejar"));
    expect(change.defaults.finish).not.toBe(
      MATERIALS.find((m) => m.materialId === "material.veneer")?.defaultFinish,
    );
  });
});

describe("a save of the defaults is judged for the items it names (A-17)", () => {
  const ALL_ON = { book: BOOK, availability: availabilityOf([]) };
  const on = (disabled: readonly ItemRef[]) => ({
    book: BOOK,
    availability: availabilityOf(disabled),
  });

  const COMPLETE: NewKitchenSettings = {
    materialTierId: "material.veneer",
    hardwareTierId: "hardware.premium",
    cabinetDepthMm: 700,
    finish: paletteFinish("veneer.nuc"),
    handle: "black",
    topRowHandle: "push",
  };

  it("accepts a complete set of offered values, and an empty one (nothing saved)", () => {
    expect(judgeKitchenDefaults(COMPLETE, ALL_ON)).toEqual({
      kind: "acceptable",
    });
    expect(judgeKitchenDefaults({}, ALL_ON)).toEqual({ kind: "acceptable" });
  });

  it.each<[string, NewKitchenSettings, ItemRef]>([
    [
      "material",
      { materialTierId: "material.veneer" },
      material("material.veneer"),
    ],
    [
      "hardware class",
      { hardwareTierId: "hardware.premium" },
      hardware("hardware.premium"),
    ],
    ["handle", { handle: "black" }, handle("black")],
    ["top-row handle", { topRowHandle: "black" }, handle("black")],
    [
      "colour",
      { finish: paletteFinish("pal.antracit") },
      colour("pal.antracit"),
    ],
  ])("names a switched-off %s", (_, defaults, item) => {
    expect(judgeKitchenDefaults(defaults, on([item]))).toEqual({
      kind: "unavailable",
      item,
    });
  });

  it("names a tier the active book does not state", () => {
    expect(
      judgeKitchenDefaults(
        { materialTierId: "material.created-in-the-draft" },
        ALL_ON,
      ),
    ).toEqual({
      kind: "unavailable",
      item: material("material.created-in-the-draft"),
    });
    expect(
      judgeKitchenDefaults(
        { hardwareTierId: "hardware.created-in-the-draft" },
        ALL_ON,
      ),
    ).toEqual({
      kind: "unavailable",
      item: hardware("hardware.created-in-the-draft"),
    });
  });

  it("reads the rows in the dialog's order: material, hardware, handle, top-row handle, colour", () => {
    const everythingOff = [
      material("material.veneer"),
      hardware("hardware.premium"),
      handle("black"),
      colour("veneer.nuc"),
    ];

    const named = (disabled: readonly ItemRef[]) =>
      judgeKitchenDefaults(COMPLETE, on(disabled));

    expect(named(everythingOff)).toEqual({
      kind: "unavailable",
      item: material("material.veneer"),
    });
    expect(named(everythingOff.slice(1))).toEqual({
      kind: "unavailable",
      item: hardware("hardware.premium"),
    });
    expect(named(everythingOff.slice(2))).toEqual({
      kind: "unavailable",
      item: handle("black"),
    });
    expect(named(everythingOff.slice(3))).toEqual({
      kind: "unavailable",
      item: colour("veneer.nuc"),
    });
  });

  it("refuses a colour the default material does not offer as malformed, not unavailable", () => {
    const notOffered: NewKitchenSettings[] = [
      {
        materialTierId: "material.melamine",
        finish: paletteFinish("veneer.nuc"),
      },
      {
        materialTierId: "material.melamine",
        finish: freeColourFinish("#eceeeb"),
      },
      {
        materialTierId: "material.painted-mdf",
        finish: paletteFinish("pal.alb"),
      },
      { materialTierId: "material.veneer", finish: paletteFinish("pal.alb") },
    ];

    for (const defaults of notOffered) {
      expect(
        judgeKitchenDefaults(defaults, ALL_ON),
        JSON.stringify(defaults),
      ).toEqual({
        kind: "colour-not-in-palette",
      });
    }
  });

  it("judges a colour against PAL when no material is named", () => {
    expect(
      judgeKitchenDefaults({ finish: paletteFinish("pal.antracit") }, ALL_ON),
    ).toEqual({ kind: "acceptable" });
    expect(
      judgeKitchenDefaults({ finish: paletteFinish("veneer.nuc") }, ALL_ON),
    ).toEqual({
      kind: "colour-not-in-palette",
    });
  });

  it("reads the material a colour is judged against the way the stamp does: PAL, not the book's fallback tier", () => {
    const bookFallingBackToVeneer = {
      ...BOOK,
      material: { ...BOOK.material, defaultTierId: "material.veneer" },
    };
    const context = {
      book: bookFallingBackToVeneer,
      availability: availabilityOf([]),
    };
    const palColour = { finish: paletteFinish("pal.alb") };
    const veneerColour = { finish: paletteFinish("veneer.nuc") };

    expect(judgeKitchenDefaults(palColour, context)).toEqual({
      kind: "acceptable",
    });
    expect(stampedSettingsOf(palColour).finish).toEqual(palColour.finish);
    expect(judgeKitchenDefaults(veneerColour, context)).toEqual({
      kind: "colour-not-in-palette",
    });
    expect(stampedSettingsOf(veneerColour).finish).toEqual(
      paletteFinish("pal.alb"),
    );
  });

  it("accepts any free colour under painted MDF, and none of them under the other materials", () => {
    for (const finish of FREE_COLOURS) {
      for (const { materialId } of MATERIALS) {
        const verdict = judgeKitchenDefaults(
          { materialTierId: materialId, finish },
          ALL_ON,
        );

        expect(verdict.kind).toBe(
          materialId === "material.painted-mdf"
            ? "acceptable"
            : "colour-not-in-palette",
        );
      }
    }
  });

  it("accepts exactly the defaults whose items are on and whose colour the stamp keeps, over any availability", () => {
    const universe: ItemRef[] = [
      ...BOOK.material.tiers.map((tier) => material(tier.tierId)),
      ...BOOK.hardware.tiers.map((tier) => hardware(tier.tierId)),
      ...PALETTE_ENTRY_IDS.map(colour),
      handle("steel"),
      handle("black"),
      handle("push"),
    ];
    const someDefaults = fc.record(
      {
        materialTierId: fc.constantFrom(
          ...BOOK.material.tiers.map((t) => t.tierId),
        ),
        hardwareTierId: fc.constantFrom(
          ...BOOK.hardware.tiers.map((t) => t.tierId),
        ),
        finish: fc.constantFrom(...EVERY_COLOUR),
        handle: fc.constantFrom("steel", "black", "push" as const),
        topRowHandle: fc.constantFrom("steel", "black", "push" as const),
      },
      { requiredKeys: [] },
    );

    fc.assert(
      fc.property(someDefaults, fc.subarray(universe), (defaults, disabled) => {
        const availability = availabilityOf(disabled);
        const verdict = judgeKitchenDefaults(defaults, {
          book: BOOK,
          availability,
        });

        const stamped = stampedSettingsOf(defaults);
        const keepsItsColour =
          defaults.finish === undefined ||
          JSON.stringify(stamped.finish) === JSON.stringify(defaults.finish);
        const named: ItemRef[] = [
          ...(defaults.materialTierId
            ? [material(defaults.materialTierId)]
            : []),
          ...(defaults.hardwareTierId
            ? [hardware(defaults.hardwareTierId)]
            : []),
          ...(defaults.handle ? [handle(defaults.handle)] : []),
          ...(defaults.topRowHandle ? [handle(defaults.topRowHandle)] : []),
          ...(defaults.finish?.kind === "palette-entry"
            ? [colour(defaults.finish.entryId)]
            : []),
        ];
        const allOn = named.every(
          (item) => !isItemDisabled(availability, item),
        );

        expect(verdict.kind === "acceptable").toBe(keepsItsColour && allOn);
      }),
    );
  });
});
