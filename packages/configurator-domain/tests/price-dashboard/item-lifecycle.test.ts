// M10 M3-a (and M3-c, enabling): what may be done to a switchable item. Disabling is refused for the default and for the
// last active option of a group; enabling for an item the active book does not state; deleting for the default and for
// any item a saved kitchen uses. Judged at write time (A-17), so each rule is checked over states the screen could not
// have shown: a default already off, a group already down to one.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Design, Handle } from "../../src/design.js";
import {
  ALWAYS_PRESENT_ACCESSORY_ID,
  isAccessorySwitchedOff,
} from "../../src/pricing/price-book.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import type { NewKitchenSettings } from "../../src/generation/new-kitchen-settings.js";
import {
  DEFAULT_HANDLE,
  TOP_ROW_HANDLE,
} from "../../src/kitchen-handle/index.js";
import {
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  PALETTE_ENTRY_IDS,
  type PaletteEntryId,
} from "../../src/materials.js";
import {
  AVAILABILITY_REFUSAL_CODES,
  canDelete,
  canDisable,
  DELETION_REFUSAL_CODES,
  judgeAvailabilityChange,
  judgeDeletion,
  type AvailabilityState,
} from "../../src/price-dashboard/item-lifecycle.js";
import type { DeletableItemRef } from "../../src/price-dashboard/book-field-address.js";
import { defaultItemsOf } from "../../src/price-dashboard/defaults-judgement.js";
import {
  declaredOptionsOfGroupOf,
  isItemOffered,
  remainingOptionsIfSwitchedOff,
} from "../../src/price-dashboard/item-groups.js";
import {
  UsageNotCountedError,
  usesItem,
  type ItemUsageCounts,
} from "../../src/price-dashboard/item-usage.js";
import {
  isItemDisabled,
  isSameItem,
  type ItemRef,
} from "../../src/pricing/catalogue-availability.js";
import { replacementsRequired } from "../../src/queries/replacements-required.js";
import {
  accessory,
  availabilityOf,
  BOOK,
  CATALOG,
  colour,
  handle,
  hardware,
  kitchenNamingEverything,
  material,
  withSettings,
} from "../support/availability-kitchens.js";
import {
  bookWithLinked,
  linkedRule,
} from "../support/linked-accessory-books.js";

const PAL = material(BOOK.material.defaultTierId);
const STANDARD = hardware(BOOK.hardware.defaultTierId);

const MATERIAL_ITEMS = BOOK.material.tiers.map((tier) => material(tier.tierId));
const HARDWARE_ITEMS = BOOK.hardware.tiers.map((tier) => hardware(tier.tierId));
const HANDLE_ITEMS = [handle("steel"), handle("black"), handle("push")];
const COLOUR_ITEMS = PALETTE_ENTRY_IDS.map(colour);
/** Runs a sweep must land on each side of an iff before it certifies the side that did not move. */
const ARM_FLOOR = 10;
const COVER = accessory("sinkProtectiveCover");
const BUILT_IN_ACCESSORIES = [COVER, accessory("dishDryingRack")];

/** Every item the shipped book and code state, of every kind. */
const UNIVERSE: readonly ItemRef[] = [
  ...MATERIAL_ITEMS,
  ...HARDWARE_ITEMS,
  ...COLOUR_ITEMS,
  ...HANDLE_ITEMS,
  ...BUILT_IN_ACCESSORIES,
];

function stateOf(
  disabled: readonly ItemRef[] = [],
  defaults: NewKitchenSettings = {},
  book = BOOK,
): AvailabilityState {
  return { availability: availabilityOf(disabled), book, defaults };
}

function disable(item: ItemRef, state: AvailabilityState) {
  return judgeAvailabilityChange({ item, active: false }, state);
}

function enable(item: ItemRef, state: AvailabilityState) {
  return judgeAvailabilityChange({ item, active: true }, state);
}

const REFUSED_AS_DEFAULT = { kind: "refused", code: "item-is-default" };
const REFUSED_AS_FIXED = { kind: "refused", code: "item-is-fixed-default" };
const REFUSED_AS_LAST = { kind: "refused", code: "last-active-option" };
const REFUSED_AS_ABSENT = { kind: "refused", code: "item-not-in-active-book" };
const ALLOWED = { kind: "allowed" };

describe("the refusal codes are the wire's own words", () => {
  it("names exactly the codes the availability and deletion routes answer", () => {
    expect([...AVAILABILITY_REFUSAL_CODES].sort()).toEqual(
      [
        "item-always-present",
        "item-is-default",
        "item-is-fixed-default",
        "item-not-in-active-book",
        "last-active-option",
      ].sort(),
    );
    expect([...DELETION_REFUSAL_CODES].sort()).toEqual(
      ["item-in-use", "item-is-default", "item-is-fixed-default"].sort(),
    );
  });
});

describe("the sink cover is protection, not an option, so it is never switched off", () => {
  const cover = {
    kind: "accessory",
    accessoryId: ALWAYS_PRESENT_ACCESSORY_ID,
  } as const;
  const rack = { kind: "accessory", accessoryId: "dishDryingRack" } as const;

  it("is refused as always present, whatever the defaults and whatever is already off", () => {
    for (const availability of [
      { revision: "1", disabled: [] },
      { revision: "1", disabled: [rack] },
    ]) {
      expect(disable(cover, { ...stateOf(), availability })).toEqual({
        kind: "refused",
        code: "item-always-present",
      });
    }
  });

  it("is switched on when it is somehow off, and the rack stays switchable", () => {
    expect(
      judgeAvailabilityChange(
        { item: cover, active: true },
        { ...stateOf(), availability: { revision: "1", disabled: [cover] } },
      ),
    ).toEqual(ALLOWED);
    expect(disable(rack, stateOf())).toEqual(ALLOWED);
  });

  it("is offered to customers whatever is stored: a row that switched it off is read as no switch, and the rack's is not", () => {
    const stored = {
      ...stateOf(),
      availability: { revision: "1", disabled: [cover, rack] },
    };

    expect(isItemOffered(cover, stored)).toBe(true);
    expect(isItemOffered(rack, stored)).toBe(false);
    expect(isAccessorySwitchedOff(stored.availability, cover.accessoryId)).toBe(
      false,
    );
    expect(isAccessorySwitchedOff(stored.availability, rack.accessoryId)).toBe(
      true,
    );
  });

  it("is refused for no other item of any kind", () => {
    for (const item of UNIVERSE) {
      const isCover =
        item.kind === "accessory" && item.accessoryId === cover.accessoryId;
      const verdict = disable(item, stateOf());
      expect(
        verdict.kind === "refused" && verdict.code === "item-always-present",
        JSON.stringify(item),
      ).toBe(isCover);
    }
  });
});

describe("a default item cannot be switched off, and a fixed one is told apart from one D9 names", () => {
  const FIXED_DEFAULTS: readonly [string, ItemRef][] = [
    ["PAL, the book's fallback material", PAL],
    ["Standard, the book's fallback hardware class", STANDARD],
    ["the handle a kitchen follows", handle(DEFAULT_HANDLE)],
    ["the handle the top row follows", handle(TOP_ROW_HANDLE)],
    ...MATERIALS.flatMap(({ defaultFinish }): [string, ItemRef][] =>
      defaultFinish.kind === "palette-entry"
        ? [
            [
              `the default colour ${defaultFinish.entryId}`,
              colour(defaultFinish.entryId),
            ],
          ]
        : [],
    ),
  ];

  it.each(FIXED_DEFAULTS)(
    "refuses %s as fixed, with nothing saved in D9",
    (_, item) => {
      expect(disable(item, stateOf())).toEqual(REFUSED_AS_FIXED);
      expect(canDisable(item, stateOf())).toBe(false);
    },
  );

  it("covers a free-colour default by naming no item for it: MDF's default colour is not a switchable item", () => {
    const mdf = MATERIALS.find(
      (candidate) => candidate.materialId === "material.painted-mdf",
    );

    expect(mdf?.defaultFinish.kind).toBe("free-colour");
    expect(defaultItemsOf({ book: BOOK, defaults: {} })).not.toContainEqual(
      expect.objectContaining({ kind: "free-colour" }),
    );
  });

  const D9: NewKitchenSettings = {
    materialTierId: "material.veneer",
    hardwareTierId: "hardware.premium",
    finish: paletteFinish("veneer.nuc"),
    handle: "black",
    topRowHandle: "black",
  };

  it.each([
    material("material.veneer"),
    hardware("hardware.premium"),
    colour("veneer.nuc"),
    handle("black"),
  ])(
    "refuses %j as a default once D9 names it, and allows it when D9 does not",
    (item) => {
      expect(disable(item, stateOf([], D9))).toEqual(REFUSED_AS_DEFAULT);
      expect(disable(item, stateOf([], {}))).toEqual(ALLOWED);
    },
  );

  it("still refuses PAL and Standard as fixed when D9 names other tiers", () => {
    expect(disable(PAL, stateOf([], D9))).toEqual(REFUSED_AS_FIXED);
    expect(disable(STANDARD, stateOf([], D9))).toEqual(REFUSED_AS_FIXED);
  });

  it("answers an item that is both fixed and named by D9 as fixed, since moving D9 would not release it", () => {
    const d9NamingFixedItems: NewKitchenSettings = {
      materialTierId: BOOK.material.defaultTierId,
      hardwareTierId: BOOK.hardware.defaultTierId,
      finish: paletteFinish("pal.alb"),
      handle: DEFAULT_HANDLE,
      topRowHandle: TOP_ROW_HANDLE,
    };

    for (const [, item] of FIXED_DEFAULTS) {
      expect(disable(item, stateOf([], d9NamingFixedItems))).toEqual(
        REFUSED_AS_FIXED,
      );
    }
  });

  it("allows an item that is not a default while others in its group are on", () => {
    const allowed = UNIVERSE.filter(
      (item) =>
        !isSameItem(item, COVER) &&
        !defaultItemsOf({ book: BOOK, defaults: {} }).some((d) =>
          isSameItem(d, item),
        ),
    );

    expect(allowed.length).toBeGreaterThan(5);
    for (const item of allowed) {
      expect(disable(item, stateOf()), JSON.stringify(item)).toEqual(ALLOWED);
    }
  });

  it("refuses any default in any availability: the last on is told so, else fixed or D9 by which it is", () => {
    const anItemList = fc.subarray([...UNIVERSE]);
    const someDefaults = fc.record(
      {
        materialTierId: fc.constantFrom(
          ...BOOK.material.tiers.map((t) => t.tierId),
        ),
        hardwareTierId: fc.constantFrom(
          ...BOOK.hardware.tiers.map((t) => t.tierId),
        ),
        finish: fc.constantFrom(...PALETTE_ENTRY_IDS).map(paletteFinish),
        handle: fc.constantFrom("steel", "black", "push" as const),
        topRowHandle: fc.constantFrom("steel", "black", "push" as const),
      },
      { requiredKeys: [] },
    );

    const isFixed = (item: ItemRef) =>
      FIXED_DEFAULTS.some(([, fixed]) => isSameItem(fixed, item));
    const arms = { last: 0, fixed: 0, saved: 0 };

    fc.assert(
      fc.property(anItemList, someDefaults, (disabled, defaults) => {
        const state = stateOf(disabled, defaults);
        for (const item of defaultItemsOf({ book: BOOK, defaults })) {
          const isLast =
            !isItemDisabled(state.availability, item) &&
            declaredOptionsOfGroupOf(item, BOOK).every(
              (option) =>
                isSameItem(option, item) ||
                isItemDisabled(state.availability, option),
            );
          const arm = isLast ? "last" : isFixed(item) ? "fixed" : "saved";
          const expected = {
            last: REFUSED_AS_LAST,
            fixed: REFUSED_AS_FIXED,
            saved: REFUSED_AS_DEFAULT,
          }[arm];

          expect(disable(item, state), JSON.stringify(item)).toEqual(expected);
          arms[arm] += 1;
        }
      }),
    );

    expect(arms.last).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.fixed).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.saved).toBeGreaterThanOrEqual(ARM_FLOOR);
  });
});

describe("the last active option of a group cannot be switched off", () => {
  it("refuses the only material left on, when it is not the default", () => {
    const state = stateOf([PAL, material("material.painted-mdf")]);

    expect(disable(material("material.veneer"), state)).toEqual(
      REFUSED_AS_LAST,
    );
  });

  it("refuses the only hardware class left on, when it is not the default", () => {
    const premium = hardware("hardware.premium");
    const others = HARDWARE_ITEMS.filter((item) => !isSameItem(item, premium));

    expect(disable(premium, stateOf(others))).toEqual(REFUSED_AS_LAST);
  });

  it("refuses the only handle left on, when it is not a default", () => {
    const state = stateOf([handle("steel"), handle("push")]);

    expect(disable(handle("black"), state)).toEqual(REFUSED_AS_LAST);
  });

  it("is one group for handles: the kitchen's and the top row's are not told apart", () => {
    expect(declaredOptionsOfGroupOf(handle("black"), BOOK)).toEqual(
      HANDLE_ITEMS,
    );
  });

  it.each(
    MATERIALS.filter((m) => paletteEntriesOf(m).length > 0).map((m) => ({
      materialId: m.materialId,
      palette: paletteEntriesOf(m).map((entry) => colour(entry.entryId)),
      defaultFinish: m.defaultFinish,
    })),
  )(
    "takes colours per material palette: $materialId",
    ({ palette, defaultFinish }) => {
      const [keptOn] = palette.filter(
        (item) =>
          defaultFinish.kind !== "palette-entry" ||
          !(item.kind === "finish" && item.finishId === defaultFinish.entryId),
      );
      if (keptOn === undefined)
        throw new Error("the palette has only its default");
      const offExceptKept = palette.filter((item) => !isSameItem(item, keptOn));

      expect(disable(keptOn, stateOf(offExceptKept))).toEqual(REFUSED_AS_LAST);
    },
  );

  it("does not count another material's colours: PAL's palette off to one does not touch veneer's", () => {
    const palOffExceptOne = COLOUR_ITEMS.filter(
      (item) =>
        item.kind === "finish" &&
        item.finishId.startsWith("pal.") &&
        item.finishId !== "pal.antracit",
    );

    expect(disable(colour("veneer.nuc"), stateOf(palOffExceptOne))).toEqual(
      ALLOWED,
    );
    expect(disable(colour("pal.antracit"), stateOf(palOffExceptOne))).toEqual(
      REFUSED_AS_LAST,
    );
  });

  it("is judged before the default: the fixed default that is also the last on is told to keep one active (D5G)", () => {
    const palettePalOff = COLOUR_ITEMS.filter(
      (item) =>
        item.kind === "finish" &&
        item.finishId.startsWith("pal.") &&
        item.finishId !== "pal.alb",
    );

    expect(disable(colour("pal.alb"), stateOf(palettePalOff))).toEqual(
      REFUSED_AS_LAST,
    );
  });

  it("answers last-active-option for veneer's default wood once the other wood is off (D5G's example)", () => {
    expect(
      disable(colour("veneer.stejar"), stateOf([colour("veneer.nuc")])),
    ).toEqual(REFUSED_AS_LAST);
  });

  it("answers last-active-option for the only hardware class left on, though it is the fallback class", () => {
    const others = HARDWARE_ITEMS.filter((item) => !isSameItem(item, STANDARD));

    expect(disable(STANDARD, stateOf(others))).toEqual(REFUSED_AS_LAST);
  });

  it("answers last-active-option for a tier D9 names when it is the only one left on", () => {
    const others = MATERIAL_ITEMS.filter(
      (item) => !isSameItem(item, material("material.veneer")),
    );

    expect(
      disable(
        material("material.veneer"),
        stateOf(others, { materialTierId: "material.veneer" }),
      ),
    ).toEqual(REFUSED_AS_LAST);
  });

  it("allows switching off an item that is already off, even in a group with nothing on", () => {
    const state = stateOf([...HANDLE_ITEMS]);

    expect(disable(handle("black"), state)).toEqual(ALLOWED);
  });

  it("never applies to an accessory: the last accessory on may go and its line just drops", () => {
    const book = bookWithLinked([linkedRule("organiser")]);
    const everythingElseOff = [
      ...BUILT_IN_ACCESSORIES,
      accessory("organiser"),
    ].filter((item) => !isSameItem(item, accessory("organiser")));

    expect(
      disable(accessory("organiser"), stateOf(everythingElseOff, {}, book)),
    ).toEqual(ALLOWED);
    expect(disable(COVER, stateOf())).toEqual({
      kind: "refused",
      code: "item-always-present",
    });
  });

  it("keeps every group with an option on, over any sequence of switch-offs from any state", () => {
    const groupsOf = (item: ItemRef) => declaredOptionsOfGroupOf(item, BOOK);
    const aSequence = fc.array(fc.constantFrom(...UNIVERSE), { maxLength: 40 });

    fc.assert(
      fc.property(
        fc.subarray([...UNIVERSE]),
        aSequence,
        (initial, attempts) => {
          let disabled: readonly ItemRef[] = initial;
          for (const item of attempts) {
            const group = groupsOf(item);
            const wasOn = group.some(
              (o) => !disabled.some((d) => isSameItem(d, o)),
            );
            const verdict = disable(item, stateOf(disabled));
            if (verdict.kind === "allowed") {
              disabled = disabled.some((d) => isSameItem(d, item))
                ? disabled
                : [...disabled, item];
            }
            const isOn = group.some(
              (o) => !disabled.some((d) => isSameItem(d, o)),
            );
            if (group.length > 0 && wasOn)
              expect(isOn, JSON.stringify(item)).toBe(true);
          }
        },
      ),
    );
  });

  it("keeps every default on, over any sequence of switch-offs from a state where they are", () => {
    const aSequence = fc.array(fc.constantFrom(...UNIVERSE), { maxLength: 40 });
    const defaults = defaultItemsOf({ book: BOOK, defaults: {} });

    fc.assert(
      fc.property(aSequence, (attempts) => {
        let disabled: readonly ItemRef[] = [];
        for (const item of attempts) {
          if (disable(item, stateOf(disabled)).kind === "allowed") {
            disabled = [...disabled, item];
          }
        }
        for (const item of defaults)
          expect(isItemDisabled(availabilityOf(disabled), item)).toBe(false);
      }),
    );
  });
});

describe("the boundary of the last active option, in every group", () => {
  const defaults = defaultItemsOf({ book: BOOK, defaults: {} });
  const isNotDefault = (item: ItemRef) =>
    !defaults.some((candidate) => isSameItem(candidate, item));
  const GROUPS: readonly (readonly ItemRef[])[] = [
    MATERIAL_ITEMS,
    HARDWARE_ITEMS,
    HANDLE_ITEMS,
    ...MATERIALS.map((m) =>
      paletteEntriesOf(m).map((entry) => colour(entry.entryId)),
    ),
  ].filter((group) => group.filter(isNotDefault).length >= 2);

  it("has groups to judge, so the boundary below is not vacuous", () => {
    // materials, hardware classes and PAL's palette: the groups with two options that are not defaults
    expect(GROUPS.length).toBeGreaterThanOrEqual(3);
  });

  it("allows the switch-off while a second option is on and refuses it once the item stands alone", () => {
    for (const group of GROUPS) {
      const [first, second] = group.filter(isNotDefault);
      if (first === undefined || second === undefined) continue;
      const withTwoOn = group.filter(
        (item) => !isSameItem(item, first) && !isSameItem(item, second),
      );
      const withOneOn = group.filter((item) => !isSameItem(item, first));

      expect(disable(first, stateOf(withTwoOn)), JSON.stringify(first)).toEqual(
        ALLOWED,
      );
      expect(disable(first, stateOf(withOneOn)), JSON.stringify(first)).toEqual(
        REFUSED_AS_LAST,
      );
    }
  });
});

describe("an item the kitchens use may be switched off (owner ruling: disable allowed, delete forbidden)", () => {
  it("is refused only for a default or the last option, whether or not a kitchen uses it", () => {
    const design = kitchenNamingEverything();
    const used = UNIVERSE.filter((item) =>
      usesItem({ design, item, catalog: CATALOG, book: BOOK }),
    );
    const defaults = defaultItemsOf({ book: BOOK, defaults: {} });
    const usedDefaults = used.filter((item) =>
      defaults.some((d) => isSameItem(d, item)),
    );
    const usedNonDefaults = used.filter(
      (item) =>
        !isSameItem(item, COVER) && !defaults.some((d) => isSameItem(d, item)),
    );

    expect(usedDefaults.length).toBeGreaterThan(0);
    expect(usedNonDefaults.length).toBeGreaterThan(0);
    for (const item of usedDefaults) {
      expect(disable(item, stateOf()), JSON.stringify(item)).toEqual(
        REFUSED_AS_FIXED,
      );
    }
    for (const item of usedNonDefaults) {
      expect(disable(item, stateOf()), JSON.stringify(item)).toEqual(ALLOWED);
    }
  });
});

describe("switching on, and an item the active book does not state (M3-c)", () => {
  const ABSENT: readonly ItemRef[] = [
    material("material.created-in-the-draft"),
    hardware("hardware.created-in-the-draft"),
    accessory("accessory-created-in-the-draft"),
    colour("pal.not-a-decor"),
    { kind: "handle", handle: "gold" as unknown as Handle },
  ];

  it.each(ABSENT)("refuses to enable %j", (item) => {
    expect(enable(item, stateOf([item]))).toEqual(REFUSED_AS_ABSENT);
  });

  it.each(ABSENT)(
    "refuses to disable %j, so the log never names a row that is not there",
    (item) => {
      expect(disable(item, stateOf())).toEqual(REFUSED_AS_ABSENT);
    },
  );

  it("allows enabling every item the book and code state, including the defaults", () => {
    for (const item of UNIVERSE) {
      expect(enable(item, stateOf([item])), JSON.stringify(item)).toEqual(
        ALLOWED,
      );
    }
  });

  it("states a linked accessory once the book holds it, and not before", () => {
    const linked = accessory("organiser");
    const book = bookWithLinked([linkedRule("organiser")]);

    expect(enable(linked, stateOf([linked], {}, book))).toEqual(ALLOWED);
    expect(enable(linked, stateOf([linked]))).toEqual(REFUSED_AS_ABSENT);
  });

  it("does not take a built-in accessory's id for a linked one, nor the reverse", () => {
    expect(
      enable(
        accessory("organiser"),
        stateOf([], {}, bookWithLinked([linkedRule("organiser")])),
      ),
    ).toEqual(ALLOWED);
    expect(enable(accessory("sinkProtectiveCover"), stateOf())).toEqual(
      ALLOWED,
    );
  });
});

describe("the options that remain, for the dialogs", () => {
  it("lists the group's other options that are on, in the group's order", () => {
    const state = stateOf([hardware("hardware.premium")]);

    expect(
      remainingOptionsIfSwitchedOff(material("material.veneer"), state),
    ).toEqual([
      material("material.melamine"),
      material("material.painted-mdf"),
    ]);
    expect(
      remainingOptionsIfSwitchedOff(hardware("hardware.premium"), state),
    ).toEqual(
      HARDWARE_ITEMS.filter(
        (item) => !isSameItem(item, hardware("hardware.premium")),
      ),
    );
  });

  it("is empty for an accessory, which has nothing to choose instead", () => {
    expect(remainingOptionsIfSwitchedOff(COVER, stateOf())).toEqual([]);
  });

  it("is empty exactly when switching the item off is the last-active refusal, on both arms", () => {
    const defaults = defaultItemsOf({ book: BOOK, defaults: {} });
    const aStateOftenDownToTheItem = fc
      .tuple(
        fc.subarray([...UNIVERSE]),
        fc.constantFrom(...UNIVERSE),
        fc.boolean(),
      )
      .map(([disabled, item, isGroupDownToItem]): [ItemRef[], ItemRef] => [
        isGroupDownToItem
          ? [
              ...disabled,
              ...declaredOptionsOfGroupOf(item, BOOK).filter(
                (option) => !isSameItem(option, item),
              ),
            ]
          : disabled,
        item,
      ]);
    const arms = { last: 0, notLast: 0 };

    fc.assert(
      fc.property(aStateOftenDownToTheItem, ([disabled, item]) => {
        const state = stateOf(disabled);
        const isOn = !isItemDisabled(state.availability, item);
        const isEmpty = remainingOptionsIfSwitchedOff(item, state).length === 0;
        const isGrouped = item.kind !== "accessory";
        const verdict = disable(item, state);
        const isLast =
          verdict.kind === "refused" && verdict.code === "last-active-option";

        if (defaults.some((d) => isSameItem(d, item))) return;
        expect(isLast).toBe(isOn && isGrouped && isEmpty);
        arms[isLast ? "last" : "notLast"] += 1;
      }),
    );

    expect(arms.last).toBeGreaterThanOrEqual(ARM_FLOOR);
    expect(arms.notLast).toBeGreaterThanOrEqual(ARM_FLOOR);
  });

  it("is what the replacement sheet offers for every tier, handle and colour (one list, not two)", () => {
    const kitchenOn = (item: ItemRef): Design => {
      switch (item.kind) {
        case "finish":
          return withSettings({
            cabinetDepthMm: 600,
            materialTierId: ownerMaterialOf(item.finishId),
            finish: paletteFinish(paletteEntryIdOf(item.finishId)),
          });
        case "handle":
          return withSettings({ cabinetDepthMm: 600, handle: item.handle });
        case "hardware":
          return withSettings({
            cabinetDepthMm: 600,
            hardwareTierId: item.tierId,
          });
        case "material":
          return withSettings({
            cabinetDepthMm: 600,
            materialTierId: item.tierId,
          });
        case "accessory":
          throw new Error("an accessory is named by no setting");
      }
    };
    const grouped = UNIVERSE.filter((item) => item.kind !== "accessory");

    fc.assert(
      fc.property(
        fc.subarray([...grouped]),
        fc.constantFrom(...grouped),
        (others, item) => {
          // The sheet also names the fallback tiers every kitchen is priced at; they stay on so that no other row is
          // one with nothing to choose.
          const stillOn = [PAL, STANDARD];
          const availability = availabilityOf([
            ...others.filter(
              (o) =>
                !stillOn.some((on) => isSameItem(on, o)) || isSameItem(o, item),
            ),
            item,
          ]);
          const remaining = remainingOptionsIfSwitchedOff(item, {
            book: BOOK,
            availability,
          });
          if (remaining.length === 0) return;

          const rows = replacementsRequired({
            design: kitchenOn(item),
            book: BOOK,
            availability,
            catalog: CATALOG,
          });

          const row = rows.find((candidate) =>
            isSameItem(candidate.item, item),
          );
          expect(row?.remaining).toEqual(remaining);
        },
      ),
    );
  });
});

function paletteEntryIdOf(finishId: string): PaletteEntryId {
  const entryId = PALETTE_ENTRY_IDS.find((candidate) => candidate === finishId);
  if (entryId === undefined) throw new Error(`${finishId} is not a decor`);
  return entryId;
}

function ownerMaterialOf(finishId: string): string {
  const owner = MATERIALS.find((m) =>
    paletteEntriesOf(m).some((entry) => entry.entryId === finishId),
  );
  if (owner === undefined) throw new Error(`no material offers ${finishId}`);
  return owner.materialId;
}

/** The kinds a deletion applies to (`DeletableItemRef`); the rest are code-declared and are switched off, never deleted. */
function deletable(item: ItemRef): DeletableItemRef {
  if (item.kind === "finish" || item.kind === "handle") {
    throw new Error(`a ${item.kind} cannot be deleted`);
  }
  return item;
}

describe("deleting an item (M3-a, A-18)", () => {
  const DELETABLE: readonly DeletableItemRef[] = [
    ...MATERIAL_ITEMS,
    ...HARDWARE_ITEMS,
    accessory("organiser"),
  ].map(deletable);
  const BOOK_WITH_LINKED = bookWithLinked([linkedRule("organiser")]);

  function usageOf(counts: number, items = DELETABLE): ItemUsageCounts {
    return items.map((item) => ({ item, designCount: counts }));
  }

  function verdictOf(
    item: ItemRef,
    designCount: number,
    defaults: NewKitchenSettings = {},
  ) {
    return judgeDeletion({
      item: deletable(item),
      usage: usageOf(designCount),
      book: BOOK_WITH_LINKED,
      defaults,
    });
  }

  it("allows an unused item that is not a default", () => {
    expect(verdictOf(material("material.veneer"), 0)).toEqual(ALLOWED);
    expect(verdictOf(hardware("hardware.premium"), 0)).toEqual(ALLOWED);
    expect(verdictOf(accessory("organiser"), 0)).toEqual(ALLOWED);
  });

  it("refuses an item any kitchen uses, with one use as with many", () => {
    for (const designCount of [1, 2, 23]) {
      expect(verdictOf(material("material.veneer"), designCount)).toEqual({
        kind: "refused",
        code: "item-in-use",
      });
    }
  });

  it("refuses a default whether it is used or not, naming a fixed one as fixed and one D9 names as the default", () => {
    for (const designCount of [0, 23]) {
      expect(verdictOf(PAL, designCount)).toEqual(REFUSED_AS_FIXED);
      expect(verdictOf(STANDARD, designCount)).toEqual(REFUSED_AS_FIXED);
      expect(
        verdictOf(material("material.veneer"), designCount, {
          materialTierId: "material.veneer",
        }),
      ).toEqual(REFUSED_AS_DEFAULT);
    }
  });

  it("answers an item that is both fixed and named by D9 as fixed", () => {
    expect(
      verdictOf(PAL, 0, { materialTierId: BOOK.material.defaultTierId }),
    ).toEqual(REFUSED_AS_FIXED);
    expect(
      verdictOf(STANDARD, 0, { hardwareTierId: BOOK.hardware.defaultTierId }),
    ).toEqual(REFUSED_AS_FIXED);
  });

  it("throws when the item was not counted, instead of reading it as unused", () => {
    expect(() =>
      judgeDeletion({
        item: deletable(hardware("hardware.premium")),
        usage: [],
        book: BOOK,
        defaults: {},
      }),
    ).toThrow(UsageNotCountedError);
  });

  it("is false whenever any design uses the item, and true only when none does, over any pool of kitchens (M3-a)", () => {
    const kitchens: readonly Design[] = [
      KITCHEN_L_DESIGN,
      kitchenNamingEverything(),
      withSettings({ cabinetDepthMm: 600, materialTierId: "material.veneer" }),
      withSettings({ cabinetDepthMm: 600, hardwareTierId: "hardware.premium" }),
      { ...KITCHEN_L_DESIGN, placements: [] },
    ];

    fc.assert(
      fc.property(fc.subarray([...kitchens]), (pool) => {
        const usage: ItemUsageCounts = DELETABLE.map((item) => ({
          item,
          designCount: pool.filter((design) =>
            usesItem({
              design,
              item,
              catalog: CATALOG,
              book: BOOK_WITH_LINKED,
            }),
          ).length,
        }));
        for (const { item, designCount } of usage) {
          const isDefault = defaultItemsOf({
            book: BOOK_WITH_LINKED,
            defaults: {},
          }).some((d) => isSameItem(d, item));
          const allowed = canDelete({
            item: deletable(item),
            usage,
            book: BOOK_WITH_LINKED,
            defaults: {},
          });
          expect(allowed, JSON.stringify(item)).toBe(
            designCount === 0 && !isDefault,
          );
        }
      }),
    );
  });
});
