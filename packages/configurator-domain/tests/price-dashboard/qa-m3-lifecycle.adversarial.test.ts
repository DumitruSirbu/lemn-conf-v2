// M10 M3, adversarial: the switch-off, switch-on and delete judgements, and the lists the dialogs show. Where the
// developer's suite sweeps switch-offs alone, these interleave switch-offs, switch-ons, saves of the new-kitchen
// defaults and changes of the default material, and check after every step that no group is empty, no default is off,
// the dialog's remaining list is the one the customer's replacement sheet then offers, and no input was written to.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design, Handle } from "../../src/design.js";
import {
  stampedSettingsOf,
  type NewKitchenSettings,
} from "../../src/generation/new-kitchen-settings.js";
import {
  freeColourFinish,
  MATERIALS,
  PALETTE_ENTRY_IDS,
  paletteEntriesOf,
  paletteFinish,
} from "../../src/materials.js";
import {
  defaultItemsOf,
  judgeKitchenDefaults,
  withDefaultMaterial,
} from "../../src/price-dashboard/defaults-judgement.js";
import {
  declaredOptionsOfGroupOf,
  remainingOptionsIfSwitchedOff,
} from "../../src/price-dashboard/item-groups.js";
import {
  canDelete,
  canDisable,
  judgeAvailabilityChange,
  judgeDeletion,
  type AvailabilityState,
} from "../../src/price-dashboard/item-lifecycle.js";
import type { DeletableItemRef } from "../../src/price-dashboard/book-field-address.js";
import { UsageNotCountedError } from "../../src/price-dashboard/item-usage.js";
import {
  isSameItem,
  type ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import {
  NoReplacementOptionError,
  replacementsRequired,
} from "../../src/queries/replacements-required.js";
import {
  accessory,
  availabilityOf,
  BOOK,
  CATALOG,
  colour,
  handle,
  hardware,
  material,
  withSettings,
} from "../support/availability-kitchens.js";
import {
  bookWithLinked,
  linkedRule,
} from "../support/linked-accessory-books.js";

import {
  ARM_FLOOR,
  deepFrozen,
  elementAt,
  HANDLE_ITEMS,
  HARDWARE_ITEMS,
  MATERIAL_ITEMS,
  stateOf,
  UNIVERSE,
} from "./qa-m3-support.js";

const HANDLES: readonly Handle[] = ["steel", "black", "push"];
const MATERIAL_IDS = BOOK.material.tiers.map((tier) => tier.tierId);
const HARDWARE_IDS = BOOK.hardware.tiers.map((tier) => tier.tierId);
const PALETTES: readonly (readonly ItemRef[])[] = MATERIALS.map((entry) =>
  paletteEntriesOf(entry).map((palette) => colour(palette.entryId)),
).filter((palette) => palette.length > 0);

/** The groups an administrator's dialog speaks of, written out by hand (not read from `item-groups.ts`). */
const GROUPS: readonly (readonly ItemRef[])[] = [
  MATERIAL_ITEMS,
  HARDWARE_ITEMS,
  HANDLE_ITEMS,
  ...PALETTES,
];

function isOn(disabled: readonly ItemRef[], item: ItemRef): boolean {
  return !disabled.some((off) => isSameItem(off, item));
}

// ---------------------------------------------------------------------------------------------------------------
// A model of the dashboard: what is switched off, and the new-kitchen defaults saved.
// ---------------------------------------------------------------------------------------------------------------

interface Model {
  readonly disabled: readonly ItemRef[];
  readonly defaults: NewKitchenSettings;
}

type Operation =
  | {
      readonly kind: "switch";
      readonly item: ItemRef;
      readonly active: boolean;
    }
  | { readonly kind: "saveDefaults"; readonly defaults: NewKitchenSettings }
  | { readonly kind: "changeMaterial"; readonly tierId: string };

const optionally = <Value>(
  values: readonly Value[],
): fc.Arbitrary<Value | undefined> => fc.constantFrom(undefined, ...values);

const aDefaultsSet: fc.Arbitrary<NewKitchenSettings> = fc
  .record({
    materialTierId: optionally(MATERIAL_IDS),
    hardwareTierId: optionally(HARDWARE_IDS),
    finish: optionally([
      ...PALETTE_ENTRY_IDS.map(paletteFinish),
      freeColourFinish("#8d9a84"),
    ]),
    handle: optionally(HANDLES),
    topRowHandle: optionally(HANDLES),
  })
  .map(
    (defaults) =>
      Object.fromEntries(
        Object.entries(defaults).filter(([, value]) => value !== undefined),
      ) as NewKitchenSettings,
  );

const anOperation: fc.Arbitrary<Operation> = fc.oneof(
  {
    weight: 8,
    arbitrary: fc.record({
      kind: fc.constant("switch" as const),
      item: fc.constantFrom(...UNIVERSE),
      active: fc.boolean(),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("saveDefaults" as const),
      defaults: aDefaultsSet,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("changeMaterial" as const),
      tierId: fc.constantFrom(...MATERIAL_IDS),
    }),
  },
);

function stateOfModel(model: Model): AvailabilityState {
  return deepFrozen({
    availability: availabilityOf(structuredClone(model.disabled)),
    book: structuredClone(BOOK),
    defaults: structuredClone(model.defaults),
  });
}

/** The kitchen a customer would have, that names the item, in the one material that owns a colour. */
function designNaming(item: ItemRef): Design | undefined {
  switch (item.kind) {
    case "material":
      return withSettings({ cabinetDepthMm: 600, materialTierId: item.tierId });
    case "hardware":
      return withSettings({ cabinetDepthMm: 600, hardwareTierId: item.tierId });
    case "handle":
      return withSettings({ cabinetDepthMm: 600, handle: item.handle });
    case "finish":
      return withSettings({
        cabinetDepthMm: 600,
        materialTierId: item.finishId.startsWith("pal.")
          ? "material.melamine"
          : "material.veneer",
        finish: paletteFinish(
          item.finishId as (typeof PALETTE_ENTRY_IDS)[number],
        ),
      });
    case "accessory":
      return undefined;
  }
}

function sheetRowFor(
  item: ItemRef,
  disabled: readonly ItemRef[],
): readonly ItemRef[] | undefined {
  const design = designNaming(item);
  if (design === undefined) return undefined;
  const rows = replacementsRequired({
    design,
    book: BOOK,
    availability: availabilityOf(disabled),
    catalog: CATALOG,
  });
  return rows.find((row) => isSameItem(row.item, item))?.remaining;
}

/** The sheet's row, or the defect it throws on a state no allowed change reaches; either way the same for one set. */
function sheetOutcome(
  item: ItemRef,
  disabled: readonly ItemRef[],
): readonly ItemRef[] | "no-option-remains" | undefined {
  try {
    return sheetRowFor(item, disabled);
  } catch (error) {
    if (error instanceof NoReplacementOptionError) return "no-option-remains";
    throw error;
  }
}

function applyOperation(model: Model, operation: Operation): Model {
  switch (operation.kind) {
    case "switch":
      return applySwitch(model, operation.item, operation.active);
    case "saveDefaults":
      return acceptDefaults(model, operation.defaults);
    case "changeMaterial":
      return acceptDefaults(
        model,
        withDefaultMaterial(model.defaults, operation.tierId).defaults,
      );
  }
}

function acceptDefaults(model: Model, defaults: NewKitchenSettings): Model {
  const judged = judgeKitchenDefaults(
    defaults,
    deepFrozen({
      book: structuredClone(BOOK),
      availability: availabilityOf(structuredClone(model.disabled)),
    }),
  );
  return judged.kind === "acceptable" ? { ...model, defaults } : model;
}

function applySwitch(model: Model, item: ItemRef, active: boolean): Model {
  const state = stateOfModel(model);
  const verdict = judgeAvailabilityChange({ item, active }, state);
  if (verdict.kind !== "allowed") return model;
  const without = model.disabled.filter((off) => !isSameItem(off, item));
  const disabled = active ? without : [...without, item];
  expectTheDialogToAgreeWithTheSheet(item, model, disabled, active);
  return { ...model, disabled };
}

/** What the dialog listed before the switch-off is what the sheet lists after it, in the same order, and not empty. */
function expectTheDialogToAgreeWithTheSheet(
  item: ItemRef,
  before: Model,
  disabledAfter: readonly ItemRef[],
  active: boolean,
): void {
  if (active || !isOn(before.disabled, item)) return;
  const sheet = sheetRowFor(item, disabledAfter);
  if (sheet === undefined) return;
  const dialog = remainingOptionsIfSwitchedOff(item, stateOfModel(before));
  expect(sheet, JSON.stringify(item)).toEqual(dialog);
  expect(dialog.length, JSON.stringify(item)).toBeGreaterThan(0);
}

function expectNoGroupEmptyAndNoDefaultOff(model: Model): void {
  for (const group of GROUPS) {
    expect(group.some((option) => isOn(model.disabled, option))).toBe(true);
  }
  for (const item of defaultItemsOf({ book: BOOK, defaults: model.defaults })) {
    expect(isOn(model.disabled, item), JSON.stringify(item)).toBe(true);
  }
  for (const item of UNIVERSE.filter((candidate) =>
    isFixedDefault(candidate, model.defaults),
  )) {
    expect(isOn(model.disabled, item), JSON.stringify(item)).toBe(true);
  }
}

function expectEveryDisabledItemToHaveASheetRow(model: Model): void {
  for (const item of model.disabled) {
    const row = sheetRowFor(item, model.disabled);
    if (item.kind === "accessory") continue;
    expect(row, JSON.stringify(item)).toBeDefined();
    expect(row?.length, JSON.stringify(item)).toBeGreaterThan(0);
  }
}

describe("a mixed sequence of dashboard operations, each judged as the route would", () => {
  it("never leaves a group empty or a default off, keeps the dialog list equal to the sheet, and writes to no input", () => {
    fc.assert(
      fc.property(fc.array(anOperation, { maxLength: 60 }), (operations) => {
        let model: Model = { disabled: [], defaults: {} };
        for (const operation of operations) {
          model = applyOperation(model, operation);
          expectNoGroupEmptyAndNoDefaultOff(model);
          expectEveryDisabledItemToHaveASheetRow(model);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("lands on states with a switch-off allowed and one refused, so the sequence is not vacuous", () => {
    const outcomes = { allowed: 0, refused: 0, savedDefaults: 0 };

    fc.assert(
      fc.property(fc.array(anOperation, { maxLength: 60 }), (operations) => {
        let model: Model = { disabled: [], defaults: {} };
        for (const operation of operations) {
          const next = applyOperation(model, operation);
          if (operation.kind === "switch" && !operation.active) {
            outcomes[next === model ? "refused" : "allowed"] += 1;
          }
          if (operation.kind === "saveDefaults" && next !== model) {
            outcomes.savedDefaults += 1;
          }
          model = next;
        }
      }),
      { numRuns: 100 },
    );

    expect(outcomes.allowed).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(outcomes.refused).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(outcomes.savedDefaults).toBeGreaterThanOrEqual(ARM_FLOOR);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// An exhaustive sweep of the verdict over every group and every set of its other members being off.
// ---------------------------------------------------------------------------------------------------------------

/** What the default rule says, by hand: the fallbacks, what D9 names, the slot handles, each material's own colour. */
function isFixedDefault(item: ItemRef, defaults: NewKitchenSettings): boolean {
  const named: ItemRef[] = [
    material(BOOK.material.defaultTierId),
    hardware(BOOK.hardware.defaultTierId),
    handle("steel"),
    handle("push"),
    colour("pal.alb"),
    colour("veneer.stejar"),
    ...(defaults.materialTierId ? [material(defaults.materialTierId)] : []),
    ...(defaults.hardwareTierId ? [hardware(defaults.hardwareTierId)] : []),
    ...(defaults.handle ? [handle(defaults.handle)] : []),
    ...(defaults.topRowHandle ? [handle(defaults.topRowHandle)] : []),
    ...(defaults.finish?.kind === "palette-entry"
      ? [colour(defaults.finish.entryId)]
      : []),
  ];
  return named.some((candidate) => isSameItem(candidate, item));
}

function everySubsetOf<Item>(
  items: readonly Item[],
): readonly (readonly Item[])[] {
  return items.reduce<readonly (readonly Item[])[]>(
    (subsets, item) => [...subsets, ...subsets.map((s) => [...s, item])],
    [[]],
  );
}

const D9_VARIANTS: readonly NewKitchenSettings[] = [
  {},
  { materialTierId: "material.veneer", finish: paletteFinish("veneer.nuc") },
  { hardwareTierId: "hardware.premium", handle: "black" },
  { topRowHandle: "black", finish: paletteFinish("pal.antracit") },
];

describe("over every group, every set of its other members being off, and every D9, the verdict is the one the rules give", () => {
  it.each(GROUPS.map((group, index) => [index, group] as const))(
    "group %i: default first, then the last on, otherwise allowed",
    (_, group) => {
      let judged = 0;
      for (const defaults of D9_VARIANTS) {
        for (const item of group) {
          const others = group.filter((member) => !isSameItem(member, item));
          for (const off of everySubsetOf(others)) {
            const verdict = judgeAvailabilityChange(
              { item, active: false },
              stateOf(off, defaults),
            );
            const allOthersOff = off.length === others.length;
            const expected = isFixedDefault(item, defaults)
              ? { kind: "refused", code: "item-is-default" }
              : allOthersOff
                ? { kind: "refused", code: "last-active-option" }
                : { kind: "allowed" };
            expect(
              verdict,
              `${JSON.stringify(item)} off=${String(off.length)}`,
            ).toEqual(expected);
            judged += 1;
          }
        }
      }
      expect(judged).toBeGreaterThan(0);
    },
  );

  it("reaches the last-active refusal in the shipped book only from a state where the default is already off", () => {
    let lastActive = 0;
    for (const group of GROUPS) {
      for (const item of group) {
        const others = group.filter((member) => !isSameItem(member, item));
        const verdict = judgeAvailabilityChange(
          { item, active: false },
          stateOf(others),
        );
        if (
          verdict.kind === "refused" &&
          verdict.code === "last-active-option"
        ) {
          lastActive += 1;
          expect(isFixedDefault(item, {})).toBe(false);
        }
      }
    }
    expect(lastActive).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("is told to pick another default, not to keep one active, when the default is the only one left on", () => {
    for (const group of GROUPS) {
      const defaultMember = group.find((member) => isFixedDefault(member, {}));
      if (defaultMember === undefined) continue;
      const others = group.filter(
        (member) => !isSameItem(member, defaultMember),
      );

      expect(
        judgeAvailabilityChange(
          { item: defaultMember, active: false },
          stateOf(others),
        ),
      ).toEqual({ kind: "refused", code: "item-is-default" });
    }
  });

  it("makes canDisable the same answer as the verdict", () => {
    for (const item of UNIVERSE) {
      for (const off of [
        [],
        [item],
        UNIVERSE.filter((u) => !isSameItem(u, item)),
      ]) {
        const state = stateOf(off);
        expect(canDisable(item, state)).toBe(
          judgeAvailabilityChange({ item, active: false }, state).kind ===
            "allowed",
        );
      }
    }
  });
});

describe("the defaults follow the book and D9 that are asked, not constants", () => {
  function bookDefaultingTo(
    materialTierId: string,
    hardwareTierId: string,
  ): PriceBook {
    return {
      ...BOOK,
      material: { ...BOOK.material, defaultTierId: materialTierId },
      hardware: { ...BOOK.hardware, defaultTierId: hardwareTierId },
    };
  }

  it("protects the tier a later book names as its fallback, and frees the one it no longer does", () => {
    const book = bookDefaultingTo("material.veneer", "hardware.premium");

    expect(
      judgeAvailabilityChange(
        { item: material("material.veneer"), active: false },
        stateOf([], {}, book),
      ),
    ).toEqual({ kind: "refused", code: "item-is-default" });
    expect(
      judgeAvailabilityChange(
        { item: hardware("hardware.premium"), active: false },
        stateOf([], {}, book),
      ),
    ).toEqual({ kind: "refused", code: "item-is-default" });
    expect(
      judgeAvailabilityChange(
        { item: material("material.melamine"), active: false },
        stateOf([], {}, book),
      ).kind,
    ).toBe("allowed");
    expect(
      judgeAvailabilityChange(
        { item: hardware(BOOK.hardware.defaultTierId), active: false },
        stateOf([], {}, book),
      ).kind,
    ).toBe("allowed");
  });

  it("is last-active, not default, for the only tier left on when the book's new fallback is already off", () => {
    const book = bookDefaultingTo(
      "material.melamine",
      BOOK.hardware.defaultTierId,
    );
    const state = stateOf(
      [material("material.melamine"), material("material.painted-mdf")],
      {},
      book,
    );

    expect(
      judgeAvailabilityChange(
        { item: material("material.veneer"), active: false },
        state,
      ),
    ).toEqual({ kind: "refused", code: "last-active-option" });
  });

  it("frees an item the moment D9 stops naming it, and protects it the moment D9 names it", () => {
    const premium = hardware("hardware.premium");

    expect(
      canDisable(premium, stateOf([], { hardwareTierId: "hardware.premium" })),
    ).toBe(false);
    expect(canDisable(premium, stateOf([], {}))).toBe(true);
    expect(
      canDisable(
        premium,
        stateOf([], { hardwareTierId: BOOK.hardware.defaultTierId }),
      ),
    ).toBe(true);
  });

  it("protects the colour D9 names and no other palette's namesake", () => {
    const defaults: NewKitchenSettings = {
      materialTierId: "material.veneer",
      finish: paletteFinish("veneer.nuc"),
    };

    expect(canDisable(colour("veneer.nuc"), stateOf([], defaults))).toBe(false);
    expect(canDisable(colour("pal.nuc-warmia"), stateOf([], defaults))).toBe(
      true,
    );
    expect(canDisable(colour("pal.alb"), stateOf([], defaults))).toBe(false);
    expect(canDisable(colour("veneer.stejar"), stateOf([], defaults))).toBe(
      false,
    );
    expect(canDisable(colour("pal.antracit"), stateOf([], defaults))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Groups: a colour is judged in the palette of the material that owns it.
// ---------------------------------------------------------------------------------------------------------------

describe("the group a colour belongs to is its material's palette and nothing else", () => {
  it.each(PALETTES.map((palette, index) => [index, palette] as const))(
    "palette %i: every entry's group is exactly that palette, in the palette's order",
    (_, palette) => {
      for (const entry of palette) {
        expect(declaredOptionsOfGroupOf(entry, BOOK)).toEqual(palette);
      }
    },
  );

  it("is empty for a colour no palette holds, a free colour, and an accessory", () => {
    for (const item of [
      colour("#eceeeb"),
      colour("pal.does-not-exist"),
      colour(""),
      accessory("sinkProtectiveCover"),
    ]) {
      expect(
        declaredOptionsOfGroupOf(item, BOOK),
        JSON.stringify(item),
      ).toEqual([]);
    }
  });

  it("lists the remaining options of a colour in its own palette only, never the other palette's", () => {
    const remaining = remainingOptionsIfSwitchedOff(
      colour("veneer.nuc"),
      stateOf([]),
    );

    expect(remaining).toEqual([colour("veneer.stejar")]);
    expect(
      remainingOptionsIfSwitchedOff(
        colour("pal.antracit"),
        stateOf([colour("pal.gri-havanna")]),
      ).every(
        (option) =>
          option.kind === "finish" && option.finishId.startsWith("pal."),
      ),
    ).toBe(true);
  });

  it("is one group for the handles, and the tiers of a kind are one group each", () => {
    for (const item of HANDLE_ITEMS) {
      expect(declaredOptionsOfGroupOf(item, BOOK)).toEqual(HANDLE_ITEMS);
    }
    for (const item of MATERIAL_ITEMS) {
      expect(declaredOptionsOfGroupOf(item, BOOK)).toEqual(MATERIAL_ITEMS);
    }
    for (const item of HARDWARE_ITEMS) {
      expect(declaredOptionsOfGroupOf(item, BOOK)).toEqual(HARDWARE_ITEMS);
    }
  });

  it("never lists the item itself or a switched-off option as a remaining one", () => {
    for (const item of UNIVERSE) {
      for (const off of everySubsetOf(
        declaredOptionsOfGroupOf(item, BOOK).slice(0, 4),
      )) {
        const remaining = remainingOptionsIfSwitchedOff(item, stateOf(off));

        expect(remaining.some((option) => isSameItem(option, item))).toBe(
          false,
        );
        expect(remaining.every((option) => isOn(off, option))).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Enabling an item the active book does not state.
// ---------------------------------------------------------------------------------------------------------------

describe("an item absent from the active book is refused, switched on or off, whatever else is true", () => {
  const ABSENT: readonly ItemRef[] = [
    material("material.retired"),
    hardware("hardware.unlisted"),
    // A hardware id that is a material id and a material id that is a hardware id: kinds do not cross.
    material(BOOK.hardware.defaultTierId),
    hardware(BOOK.material.defaultTierId),
    colour("#eceeeb"),
    colour("pal.antracit-2"),
    colour(""),
    accessory("not-an-accessory"),
    accessory(""),
    { kind: "handle", handle: "gold" } as unknown as ItemRef,
  ];

  it.each(ABSENT.map((item) => [JSON.stringify(item), item] as const))(
    "%s",
    (_, item) => {
      for (const off of [[], [item]]) {
        for (const active of [true, false]) {
          expect(
            judgeAvailabilityChange({ item, active }, stateOf(off)),
          ).toEqual({ kind: "refused", code: "item-not-in-active-book" });
        }
      }
    },
  );

  it("states a linked accessory the book holds and refuses one it does not, and follows a book that gains one", () => {
    const withLinked = bookWithLinked([linkedRule("lk")]);
    const lk = accessory("lk");

    expect(
      judgeAvailabilityChange(
        { item: lk, active: true },
        stateOf([lk], {}, withLinked),
      ).kind,
    ).toBe("allowed");
    expect(
      judgeAvailabilityChange(
        { item: lk, active: false },
        stateOf([], {}, withLinked),
      ).kind,
    ).toBe("allowed");
    expect(
      judgeAvailabilityChange({ item: lk, active: true }, stateOf([lk])).kind,
    ).toBe("refused");
  });

  it("states a hardware class the book gained, and enabling it is allowed", () => {
    const created = {
      ...BOOK.hardware.tiers[0],
      tierId: "hardware.created",
    } as (typeof BOOK.hardware.tiers)[number];
    const book: PriceBook = {
      ...BOOK,
      hardware: { ...BOOK.hardware, tiers: [...BOOK.hardware.tiers, created] },
    };
    const item = hardware("hardware.created");

    expect(
      judgeAvailabilityChange({ item, active: true }, stateOf([item], {}, book))
        .kind,
    ).toBe("allowed");
    expect(
      judgeAvailabilityChange({ item, active: true }, stateOf([item])).kind,
    ).toBe("refused");
  });

  it("allows switching on every stated item in every availability, including one already on", () => {
    for (const item of UNIVERSE) {
      for (const off of [[], [item], UNIVERSE]) {
        expect(
          judgeAvailabilityChange({ item, active: true }, stateOf(off)).kind,
        ).toBe("allowed");
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Deletion.
// ---------------------------------------------------------------------------------------------------------------

describe("a deletion is judged by default first, then by use, and a missing count is never read as unused", () => {
  const DELETABLE: readonly DeletableItemRef[] = [
    ...MATERIAL_ITEMS,
    ...HARDWARE_ITEMS,
    accessory("sinkProtectiveCover"),
  ].filter(
    (item): item is DeletableItemRef =>
      item.kind === "material" ||
      item.kind === "hardware" ||
      item.kind === "accessory",
  );

  function request(
    item: DeletableItemRef,
    designCount: number | undefined,
    defaults: NewKitchenSettings = {},
  ) {
    return {
      item,
      usage: designCount === undefined ? [] : [{ item, designCount }],
      book: BOOK,
      defaults,
    };
  }

  it("count 0 allows, count 1 refuses as in use, for every non-default deletable item", () => {
    const nonDefaults = DELETABLE.filter((item) => !isFixedDefault(item, {}));

    expect(nonDefaults.length).toBeGreaterThan(0);
    for (const item of nonDefaults) {
      expect(judgeDeletion(request(item, 0)), JSON.stringify(item)).toEqual({
        kind: "allowed",
      });
      expect(judgeDeletion(request(item, 1)), JSON.stringify(item)).toEqual({
        kind: "refused",
        code: "item-in-use",
      });
      expect(canDelete(request(item, 1))).toBe(false);
    }
  });

  it("throws for a missing count on a non-default item, and refuses a default as the default without needing one", () => {
    for (const item of DELETABLE) {
      if (isFixedDefault(item, {})) {
        expect(judgeDeletion(request(item, undefined))).toEqual({
          kind: "refused",
          code: "item-is-default",
        });
      } else {
        expect(
          () => judgeDeletion(request(item, undefined)),
          JSON.stringify(item),
        ).toThrow(UsageNotCountedError);
      }
    }
  });

  it("tells a default it is the default, not that it is in use, however many kitchens use it", () => {
    for (const item of DELETABLE.filter((candidate) =>
      isFixedDefault(candidate, {}),
    )) {
      for (const designCount of [0, 1, 40]) {
        expect(judgeDeletion(request(item, designCount))).toEqual({
          kind: "refused",
          code: "item-is-default",
        });
      }
    }
  });

  it("follows D9: an item it names is protected from deletion, and is free to go once D9 stops naming it", () => {
    const premium = HARDWARE_ITEMS.find((item) =>
      isSameItem(item, hardware("hardware.premium")),
    ) as DeletableItemRef;

    expect(
      judgeDeletion(
        request(premium, 0, { hardwareTierId: "hardware.premium" }),
      ),
    ).toEqual({ kind: "refused", code: "item-is-default" });
    expect(judgeDeletion(request(premium, 0, {}))).toEqual({ kind: "allowed" });
  });

  it("refuses a count that is not a number of designs, whatever the item", () => {
    const item = elementAt(
      DELETABLE.filter((candidate) => !isFixedDefault(candidate, {})),
      0,
    );

    for (const designCount of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => judgeDeletion(request(item, designCount))).toThrow(
        UsageNotCountedError,
      );
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Determinism and non-mutation.
// ---------------------------------------------------------------------------------------------------------------

describe("the judgement depends on what is off and not on how the list was written", () => {
  const aShuffledWithRepeats = fc
    .subarray([...UNIVERSE])
    .chain((subset) =>
      fc.tuple(
        fc.shuffledSubarray(subset, {
          minLength: subset.length,
          maxLength: subset.length,
        }),
        fc.subarray(subset),
      ),
    )
    .map(([shuffled, repeats]) => ({
      original: shuffled,
      noisy: [...repeats, ...[...shuffled].reverse()],
    }));

  it("gives the same verdict, the same remaining list and the same sheet for any order of the same set, with repeats", () => {
    fc.assert(
      fc.property(
        aShuffledWithRepeats,
        fc.constantFrom(...UNIVERSE),
        ({ original, noisy }, item) => {
          for (const active of [true, false]) {
            expect(
              judgeAvailabilityChange({ item, active }, stateOf(noisy)),
            ).toEqual(
              judgeAvailabilityChange({ item, active }, stateOf(original)),
            );
          }
          expect(remainingOptionsIfSwitchedOff(item, stateOf(noisy))).toEqual(
            remainingOptionsIfSwitchedOff(item, stateOf(original)),
          );
          expect(sheetOutcome(item, noisy)).toEqual(
            sheetOutcome(item, original),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("gives the same defaults in the same order however the availability or D9 keys were written", () => {
    const forward = defaultItemsOf({
      book: BOOK,
      defaults: {
        handle: "black",
        hardwareTierId: "hardware.premium",
        finish: paletteFinish("pal.antracit"),
      },
    });
    const reversed = defaultItemsOf({
      book: BOOK,
      defaults: {
        finish: paletteFinish("pal.antracit"),
        hardwareTierId: "hardware.premium",
        handle: "black",
      },
    });

    expect(reversed).toEqual(forward);
  });

  it("writes to none of its inputs: a deep-frozen state and request answer without a TypeError", () => {
    const state = stateOfModel({
      disabled: [handle("black"), colour("pal.antracit")],
      defaults: { hardwareTierId: "hardware.premium" },
    });
    const usage = deepFrozen([
      { item: material("material.veneer"), designCount: 3 },
    ]);

    for (const item of UNIVERSE) {
      expect(() =>
        judgeAvailabilityChange({ item, active: false }, state),
      ).not.toThrow();
      expect(() =>
        judgeAvailabilityChange({ item, active: true }, state),
      ).not.toThrow();
      expect(() => remainingOptionsIfSwitchedOff(item, state)).not.toThrow();
    }
    expect(() =>
      judgeDeletion({
        item: material("material.veneer") as DeletableItemRef,
        usage,
        book: state.book,
        defaults: state.defaults,
      }),
    ).not.toThrow();
    expect(() =>
      defaultItemsOf({ book: state.book, defaults: state.defaults }),
    ).not.toThrow();
  });

  it("is a pure function: the same arguments twice give equal answers", () => {
    const state = stateOf([colour("pal.antracit")], { handle: "black" });

    for (const item of UNIVERSE) {
      expect(judgeAvailabilityChange({ item, active: false }, state)).toEqual(
        judgeAvailabilityChange({ item, active: false }, state),
      );
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Defaults the stamp writes are the defaults the judgement protects.
// ---------------------------------------------------------------------------------------------------------------

describe("what a new kitchen is stamped with can never be switched off once D9 is saved", () => {
  it("protects every tier, handle and palette colour of a stamp built from any acceptable D9", () => {
    fc.assert(
      fc.property(aDefaultsSet, (defaults) => {
        fc.pre(
          judgeKitchenDefaults(defaults, {
            book: BOOK,
            availability: availabilityOf([]),
          }).kind === "acceptable",
        );
        const stamped = stampedSettingsOf(defaults);
        const written: ItemRef[] = [
          ...(stamped.materialTierId ? [material(stamped.materialTierId)] : []),
          ...(stamped.hardwareTierId ? [hardware(stamped.hardwareTierId)] : []),
          ...(stamped.handle ? [handle(stamped.handle)] : []),
          ...(stamped.topRowHandle ? [handle(stamped.topRowHandle)] : []),
          ...(stamped.finish?.kind === "palette-entry"
            ? [colour(stamped.finish.entryId)]
            : []),
        ];
        for (const item of written) {
          expect(
            canDisable(item, stateOf([], defaults)),
            JSON.stringify(item),
          ).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });
});
