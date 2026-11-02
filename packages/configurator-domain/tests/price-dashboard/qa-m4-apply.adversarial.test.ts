// M10 M4-a, M4-d adversarial QA: `applyChanges` with the creation, text and deletion kinds. Written from the M4 row,
// A-18, A-19, A-21 and the coordinator's rulings, not from the developer's tests. The "caveat" tests say what part of
// a failure needs a list the draft model would not hold.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { addressKey } from "../../src/price-dashboard/address-key.js";
import { applyChanges } from "../../src/price-dashboard/apply-changes.js";
import type { DraftChange } from "../../src/price-dashboard/book-field-address.js";
import {
  createdItemsOf,
  deletedItemsOf,
} from "../../src/price-dashboard/draft-structure.js";
import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/book-reading.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  bookWithLinked,
  linkedRule,
  SUPPLIED_ROW_IDS,
} from "../support/linked-accessory-books.js";

import { deepFrozen, elementAt } from "./qa-m3-support.js";
import {
  aDraft,
  accessoryItem,
  allRates,
  applied,
  BASE,
  change,
  createAccessory,
  createdAndDeletedIn,
  createTier,
  deleteItem,
  hardwareItem,
  itemKeys,
  keyOfItem,
  materialItem,
  refusalCodes,
  rewordRow,
  setAccessoryPrice,
  setRate,
  SHIPPED_HARDWARE,
  SHIPPED_MATERIAL,
  tierDraft,
} from "./qa-m4-support.js";

const RUNS = 200;
const SEED = 20261102;
const WITH_ORGANISER = bookWithLinked(
  [linkedRule("organiser", { description: "Pentru sertar." })],
  BASE,
);

function resultOf(book: PriceBook, changes: readonly DraftChange[]) {
  return applyChanges(book, changes);
}

// ---------------------------------------------------------------------------------------------------------------------
// Order and dependents

describe("a change that names a row is judged against the draft so far", () => {
  const tier = tierDraft("hw.new");
  const PERMUTATIONS: readonly (readonly number[])[] = [
    [0, 1, 2, 3, 4],
    [1, 0, 2, 3, 4],
    [1, 2, 0, 3, 4],
    [1, 2, 3, 4, 0],
    [4, 3, 2, 1, 0],
    [2, 0, 4, 1, 3],
  ];

  it.each(PERMUTATIONS)(
    "accepts a class and its four rates exactly when the creation comes first (order %j)",
    (...order) => {
      const changes = order.map((index) => elementAt(tier, index));
      const creationAt = changes.indexOf(elementAt(tier, 0));

      const result = resultOf(BASE, changes);
      const codes = refusalCodes(result).split(",");

      expect(result.ok).toBe(creationAt === 0);
      for (let index = 0; index < creationAt; index += 1) {
        expect(codes).toContain(`${String(index)}:UNKNOWN_ITEM`);
      }
    },
  );

  it.each([
    ["a text change", () => rewordRow(hardwareItem("hw.new"), "name", "Nou")],
    ["a deletion", () => deleteItem(hardwareItem("hw.new"))],
  ])(
    "refuses %s ahead of the creation it names, and takes it after",
    (_label, make) => {
      const ahead = resultOf(BASE, [make(), ...tierDraft("hw.new")]);
      const after = resultOf(BASE, [...tierDraft("hw.new"), make()]);

      expect(refusalCodes(ahead)).toBe("0:UNKNOWN_ITEM");
      expect(after.ok).toBe(true);
    },
  );

  it("refuses an accessory's price, text and deletion ahead of its creation", () => {
    const create = createAccessory("acc.new");
    const dependents = [
      setAccessoryPrice("acc.new", 7),
      rewordRow(accessoryItem("acc.new"), "name", "Nou"),
      deleteItem(accessoryItem("acc.new")),
    ];

    for (const dependent of dependents) {
      expect(refusalCodes(resultOf(BASE, [dependent, create]))).toBe(
        "0:UNKNOWN_ITEM",
      );
      expect(resultOf(BASE, [create, dependent]).ok).toBe(true);
    }
  });

  it("appends created rows in draft order and leaves every other row where it was", () => {
    const result = applied(BASE, [
      ...tierDraft("hw.b"),
      createAccessory("acc.b"),
      ...tierDraft("hw.a"),
      createAccessory("acc.a"),
    ]);

    expect(result.hardware.tiers.map((tier) => tier.tierId)).toEqual([
      ...SHIPPED_HARDWARE,
      "hw.b",
      "hw.a",
    ]);
    expect(
      result.linkedAccessories.map((linked) => linked.accessoryId),
    ).toEqual(["acc.b", "acc.a"]);
    expect(result.hardware.tiers.slice(0, SHIPPED_HARDWARE.length)).toEqual(
      BASE.hardware.tiers,
    );
  });

  it("names every class that owes rates, at its own index, and no other change", () => {
    const changes = [
      createTier("hw.a"),
      createAccessory("acc.a"),
      createTier("hw.b"),
      setRate("hw.b", "perHingeMinor", 1),
    ];

    expect(refusalCodes(resultOf(BASE, changes))).toBe(
      "0:CREATED_TIER_RATES_MISSING,2:CREATED_TIER_RATES_MISSING",
    );
  });

  it("owes the rates only after the creation: a rate set ahead of it is refused, and does not count", () => {
    const changes = [
      setRate("hw.a", "perHingeMinor", 1),
      createTier("hw.a"),
      setRate("hw.a", "perDrawerMinor", 2),
      setRate("hw.a", "perPushToOpenMinor", 3),
      setRate("hw.a", "perLiftMinor", 4),
    ];

    expect(refusalCodes(resultOf(BASE, changes))).toBe(
      "0:UNKNOWN_ITEM,1:CREATED_TIER_RATES_MISSING",
    );
  });

  it("returns the whole draft refused when one change is, and never a partial book", () => {
    const tier = tierDraft("hw.a");
    const result = resultOf(BASE, [
      ...tier,
      // eslint-disable-next-line no-restricted-syntax -- the judgement is about Romanian wording: this input must pass or be refused
      createAccessory("acc.a", { name: "Pre\u021b 500 lei" }),
    ]);

    expect(result.ok).toBe(false);
    expect(refusalCodes(result)).toBe(
      `${String(tier.length)}:TEXT_STATES_AN_AMOUNT`,
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Collisions

describe("an id that collides with something the book states is never accepted twice", () => {
  const CABINET_RULE_IDS = BASE.cabinetRules.map((rule) => rule.ruleId);

  it.each([
    ...SHIPPED_HARDWARE,
    ...SHIPPED_MATERIAL,
    "depth.deep-cabinets",
    elementAt(CABINET_RULE_IDS, 0),
  ])("refuses a class created as %s", (id) => {
    const result = resultOf(BASE, tierDraft(id));

    expect(result.ok).toBe(false);
  });

  it.each(["sinkProtectiveCover", "dishDryingRack", "organiser"])(
    "refuses an accessory created as %s",
    (id) => {
      expect(resultOf(WITH_ORGANISER, [createAccessory(id)]).ok).toBe(false);
    },
  );

  it("refuses a class and an accessory whose rule ids meet, whichever comes first", () => {
    const tierFirst = [...tierDraft("accessory.acc"), createAccessory("acc")];
    const accessoryFirst = [
      createAccessory("acc"),
      ...tierDraft("accessory.acc"),
    ];

    expect(resultOf(BASE, tierFirst).ok).toBe(false);
    expect(resultOf(BASE, accessoryFirst).ok).toBe(false);
  });

  it("refuses the same class created twice, as a candidate and not as a throw", () => {
    const result = resultOf(BASE, [...tierDraft("hw.a"), createTier("hw.a")]);

    expect(result.ok).toBe(false);
  });

  it.each([
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "valueOf",
  ])(
    "creates a class and an accessory called %s as ordinary rows, polluting nothing",
    (id) => {
      const result = applied(BASE, [...tierDraft(id), createAccessory(id)]);

      expect(result.hardware.tiers.at(-1)?.tierId).toBe(id);
      expect(Object.hasOwn(result.hardware.tiers.at(-1) ?? {}, "tierId")).toBe(
        true,
      );
      expect(
        result.linkedAccessories.map((linked) => linked.accessoryId),
      ).toEqual([id]);
      expect(({} as Record<string, unknown>)["tierId"]).toBeUndefined();
      expect(({} as Record<string, unknown>)["perHingeMinor"]).toBeUndefined();
      expect(Object.getPrototypeOf(result.hardware.tiers.at(-1))).toBe(
        Object.prototype,
      );
      expect(parsePriceBook(result).ok).toBe(true);
    },
  );

  it("addresses a row called __proto__ for a rate, a price and a deletion", () => {
    const result = applied(BASE, [
      ...tierDraft("__proto__"),
      createAccessory("__proto__"),
      setRate("__proto__", "perHingeMinor", 77),
      setAccessoryPrice("__proto__", 88),
    ]);

    expect(result.hardware.tiers.at(-1)?.perHingeMinor).toBe(77);
    expect(result.linkedAccessories[0]?.perUnitMinor).toBe(88);
    expect(
      applied(result, [
        deleteItem(hardwareItem("__proto__")),
        deleteItem(accessoryItem("__proto__")),
      ]).hardware.tiers.map((tier) => tier.tierId),
    ).toEqual(SHIPPED_HARDWARE);
  });
});

describe("a shipped class deleted and created again in one draft", () => {
  const REPLACING_PREMIUM = [
    deleteItem(hardwareItem("hardware.premium")),
    ...tierDraft("hardware.premium"),
  ];

  it("is refused: a created id is unique against every keyed id (M4-d), and a keyed row's words are the catalogue's", () => {
    const result = resultOf(BASE, REPLACING_PREMIUM);

    expect(result.ok).toBe(false);
  });
});

describe("caveat: a draft that holds one creation address twice", () => {
  const RECREATED = [
    ...tierDraft("hw.again"),
    deleteItem(hardwareItem("hw.again")),
    createTier("hw.again"),
  ];

  it("lists the class as created when the book it makes holds it (A-17: a created row starts inactive)", () => {
    const result = resultOf(BASE, RECREATED);
    if (!result.ok) return;

    const inBook = result.book.hardware.tiers.some(
      (tier) => tier.tierId === "hw.again",
    );
    const listed = createdItemsOf(RECREATED).some(
      (item) => keyOfItem(item) === keyOfItem(hardwareItem("hw.again")),
    );
    expect(inBook).toBe(true);
    expect(listed).toBe(true);
  });

  it("does not price the recreated class at rates nobody set", () => {
    const result = resultOf(BASE, RECREATED);

    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Create, edit and delete sequences

describe("creating, editing and deleting in one draft", () => {
  it("nets to the base book when a class is created, priced, reworded and deleted", () => {
    const changes = [
      ...tierDraft("hw.gone"),
      rewordRow(hardwareItem("hw.gone"), "description", "Alta"),
      deleteItem(hardwareItem("hw.gone")),
    ];

    expect(applied(BASE, changes)).toEqual(BASE);
    expect(createdItemsOf(changes)).toEqual([]);
  });

  it("nets to the base book when an accessory is created, priced, reworded and deleted", () => {
    const changes = [
      createAccessory("acc.gone"),
      setAccessoryPrice("acc.gone", 9),
      rewordRow(accessoryItem("acc.gone"), "name", "Alta"),
      deleteItem(accessoryItem("acc.gone")),
    ];

    expect(applied(WITH_ORGANISER, changes)).toEqual(WITH_ORGANISER);
  });

  it("accepts an edit and then the deletion of the same row, and refuses the edit after it", () => {
    const edit = setRate("hardware.premium", "perHingeMinor", 5);
    const deletion = deleteItem(hardwareItem("hardware.premium"));

    expect(resultOf(BASE, [edit, deletion]).ok).toBe(true);
    expect(refusalCodes(resultOf(BASE, [deletion, edit]))).toBe(
      "1:UNKNOWN_ITEM",
    );
  });

  it("refuses the second deletion of a row, and the deletion of a row that was never there", () => {
    const deletion = deleteItem(hardwareItem("hardware.premium"));

    expect(refusalCodes(resultOf(BASE, [deletion, deletion]))).toBe(
      "1:UNKNOWN_ITEM",
    );
    expect(
      refusalCodes(resultOf(BASE, [deleteItem(hardwareItem("hw.nope"))])),
    ).toBe("0:UNKNOWN_ITEM");
  });

  it("deletes exactly the named row of each deletable kind and nothing beside it", () => {
    const withTwo = applied(WITH_ORGANISER, [createAccessory("acc.two")]);
    const kept = (book: PriceBook) => ({
      hardware: book.hardware.tiers.map((tier) => tier.tierId),
      material: book.material.tiers.map((tier) => tier.tierId),
      accessories: book.linkedAccessories.map((linked) => linked.accessoryId),
    });

    expect(
      kept(applied(withTwo, [deleteItem(accessoryItem("organiser"))])),
    ).toEqual({
      ...kept(withTwo),
      accessories: ["acc.two"],
    });
    expect(
      kept(applied(withTwo, [deleteItem(hardwareItem("hardware.premium"))])),
    ).toEqual({
      ...kept(withTwo),
      hardware: ["hardware.standard", "hardware.soft-close"],
    });
    expect(
      kept(applied(withTwo, [deleteItem(materialItem("material.veneer"))])),
    ).toEqual({
      ...kept(withTwo),
      material: ["material.melamine", "material.painted-mdf"],
    });
  });

  it("refuses the deletion of each group's fallback with ITEM_IS_DEFAULT, and the book keeps it", () => {
    for (const item of [
      hardwareItem(BASE.hardware.defaultTierId),
      materialItem(BASE.material.defaultTierId),
    ]) {
      expect(refusalCodes(resultOf(BASE, [deleteItem(item)]))).toBe(
        "0:ITEM_IS_DEFAULT",
      );
    }
  });

  it("refuses the deletion of anything that is not a hardware class, a material class or a linked accessory", () => {
    const refusals = [
      deleteItem({ kind: "finish", finishId: "veneer.stejar" }),
      deleteItem({ kind: "handle", handle: "push" }),
      deleteItem(accessoryItem("sinkProtectiveCover")),
      deleteItem(accessoryItem("dishDryingRack")),
      deleteItem({ kind: "cabinet", buildId: "base-3drawer" }),
      deleteItem({ kind: "cabinet", ruleId: "cabinet.base-3drawer" }),
    ].map((deletion) => refusalCodes(resultOf(WITH_ORGANISER, [deletion])));

    expect(refusals).toEqual([
      "0:NOT_EDITABLE",
      "0:NOT_EDITABLE",
      "0:NOT_EDITABLE",
      "0:NOT_EDITABLE",
      "0:UNKNOWN_ADDRESS",
      "0:UNKNOWN_ADDRESS",
    ]);
  });

  it.each([false, undefined, null, 1, "true", {}, [true]])(
    "refuses a deletion whose value is %j, which is not `true`",
    (value) => {
      expect(
        refusalCodes(
          resultOf(BASE, [
            change(
              { kind: "item-deleted", item: hardwareItem("hardware.premium") },
              value,
            ),
          ]),
        ),
      ).toBe("0:MISSING_VALUE");
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// What a creation may carry

describe("a created linked accessory", () => {
  it("states exactly the members of its type, and no description member when none was typed", () => {
    for (const description of [undefined, "", "   ", "\u200b"]) {
      const member = description === undefined ? {} : { description };
      const accessory = applied(BASE, [createAccessory("acc.a", member)])
        .linkedAccessories[0];

      expect(Object.keys(accessory ?? {}).sort()).toEqual(
        [
          "accessoryId",
          "linkedBuildId",
          "name",
          "perUnitMinor",
          "ruleId",
        ].sort(),
      );
      expect(accessory?.ruleId).toBe("accessory.acc.a");
    }
  });

  it("keeps a typed description, trimmed", () => {
    const accessory = applied(BASE, [
      createAccessory("acc.a", { description: "  Bun.  " }),
    ]).linkedAccessories[0];

    expect(accessory?.description).toBe("Bun.");
  });

  it.each([
    ["a negative price", { perUnitMinor: -1 }, "NEGATIVE"],
    ["minus zero", { perUnitMinor: -0 }, "NEGATIVE"],
    ["a fractional price", { perUnitMinor: 1.5 }, "NOT_A_WHOLE_NUMBER"],
    ["NaN", { perUnitMinor: Number.NaN }, "NOT_A_WHOLE_NUMBER"],
    [
      "infinity",
      { perUnitMinor: Number.POSITIVE_INFINITY },
      "NOT_A_WHOLE_NUMBER",
    ],
    ["a numeral string", { perUnitMinor: "5" }, "NOT_A_WHOLE_NUMBER"],
    [
      "a price past the maximum",
      { perUnitMinor: MAX_PRICE_COEFFICIENT_MINOR + 1 },
      "TOO_LARGE",
    ],
    ["no price", { perUnitMinor: undefined }, "MISSING_VALUE"],
    ["a null price", { perUnitMinor: null }, "MISSING_VALUE"],
    ["no name", { name: undefined }, "MISSING_VALUE"],
    ["a blank name", { name: " \u200b " }, "TEXT_EMPTY"],
    ["no link", { linkedBuildId: undefined }, "MISSING_VALUE"],
    ["an empty link", { linkedBuildId: "" }, "LINK_TARGET_UNKNOWN"],
    ["a link that is a number", { linkedBuildId: 5 }, "MISSING_VALUE"],
    ["a null description", { description: null }, "MISSING_VALUE"],
    ["a Russian name", { nameRu: "x" }, "NOT_EDITABLE"],
    ["a key", { nameKey: "priceBook.x" }, "NOT_EDITABLE"],
    ["a rule id", { ruleId: "accessory.x" }, "NOT_EDITABLE"],
    [
      "a smuggled __proto__ member",
      JSON.parse('{"__proto__": {"nameKey": "x"}}') as Record<string, unknown>,
      "NOT_EDITABLE",
    ],
  ])("is refused with %s", (_label, member, code) => {
    expect(
      refusalCodes(resultOf(BASE, [createAccessory("acc.a", member)])),
    ).toBe(`0:${code}`);
  });

  it("is accepted at a price of 0 and at the maximum", () => {
    for (const perUnitMinor of [0, MAX_PRICE_COEFFICIENT_MINOR]) {
      expect(
        applied(BASE, [createAccessory("acc.a", { perUnitMinor })])
          .linkedAccessories[0]?.perUnitMinor,
      ).toBe(perUnitMinor);
    }
  });

  it("is linked, to any row the manufacturer supplies, and to none the customer does", () => {
    expect(SUPPLIED_ROW_IDS.length).toBeGreaterThanOrEqual(10);
    for (const linkedBuildId of SUPPLIED_ROW_IDS) {
      expect(
        resultOf(BASE, [createAccessory("acc.a", { linkedBuildId })]).ok,
      ).toBe(true);
    }
    const customerRows = BASE.cabinetRules
      .filter((rule) => rule.suppliedBy === "customer")
      .map((rule) => rule.buildId);
    expect(customerRows.length).toBeGreaterThan(0);
    for (const linkedBuildId of customerRows) {
      expect(
        refusalCodes(
          resultOf(BASE, [createAccessory("acc.a", { linkedBuildId })]),
        ),
      ).toBe("0:LINK_TARGET_CUSTOMER_SUPPLIED");
    }
  });

  it("can be created up to the book's bound of accessories and no further, without a throw", () => {
    const create = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        createAccessory(`acc.${String(index)}`),
      );

    expect(resultOf(BASE, create(50)).ok).toBe(true);
    expect(resultOf(BASE, create(51)).ok).toBe(false);
  });
});

describe("a created hardware class", () => {
  it("states its rates as 0 until a change sets them and then as the change set them", () => {
    const tier = applied(BASE, tierDraft("hw.a")).hardware.tiers.at(-1);

    expect([
      tier?.perHingeMinor,
      tier?.perDrawerMinor,
      tier?.perPushToOpenMinor,
      tier?.perLiftMinor,
    ]).toEqual([1_000, 2_000, 3_000, 4_000]);
  });

  it.each([
    ["a null description", { name: "X", description: null }],
    ["no description", { name: "X" }],
    ["a number for a name", { name: 5, description: "" }],
    ["a list", ["X", ""]],
    ["a string", "X"],
  ])("is refused with %s", (_label, words) => {
    const code = refusalCodes(
      resultOf(BASE, [createTier("hw.a", words), ...allRates("hw.a")]),
    );

    expect(code).not.toBe("ok");
    expect(code).toMatch(/^0:/);
  });

  it("is refused without a value, whatever the draft does after it", () => {
    const creation = change(
      { kind: "hardware-tier-created", tierId: "hw.a" },
      undefined,
    );

    expect(
      refusalCodes(resultOf(BASE, [creation, ...allRates("hw.a")])),
    ).toMatch(/^0:/);
  });

  it("is refused when it is created from a value that states an amount in either field", () => {
    for (const words of [
      // eslint-disable-next-line no-restricted-syntax -- the judgement is about Romanian wording: this input must pass or be refused
      { name: "Pre\u021b 500 lei", description: "" },
      { name: "Nou", description: "10% mai ieftin" },
      { name: "Nou", description: "Montaj inclus" },
    ]) {
      expect(refusalCodes(resultOf(BASE, [createTier("hw.a", words)]))).toBe(
        "0:TEXT_STATES_AN_AMOUNT",
      );
    }
  });

  it("can be created up to the book's bound of classes per group and no further, without a throw", () => {
    const room = 20 - BASE.hardware.tiers.length;
    const create = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        tierDraft(`hw.${String(index)}`),
      ).flat();

    expect(resultOf(BASE, create(room)).ok).toBe(true);
    expect(resultOf(BASE, create(room + 1)).ok).toBe(false);
  });
});

describe("the words of a created row", () => {
  it("are refused on a keyed class, a material class, a built-in accessory, and any item that is not a row", () => {
    const refusals = [
      rewordRow(hardwareItem("hardware.standard"), "name", "Nou"),
      rewordRow(hardwareItem("hardware.soft-close"), "description", "Nou"),
      rewordRow(materialItem("material.veneer"), "name", "Nou"),
      rewordRow(accessoryItem("sinkProtectiveCover"), "name", "Nou"),
      rewordRow({ kind: "finish", finishId: "veneer.stejar" }, "name", "Nou"),
      rewordRow({ kind: "handle", handle: "push" }, "name", "Nou"),
    ].map((change) => refusalCodes(resultOf(WITH_ORGANISER, [change])));

    expect(refusals).toEqual(Array<string>(6).fill("0:NOT_EDITABLE"));
  });

  it("treats a class as created exactly when it names neither a name key nor a description key", () => {
    const withKeys = (keys: Record<string, string | undefined>): PriceBook => ({
      ...BASE,
      hardware: {
        ...BASE.hardware,
        tiers: BASE.hardware.tiers.map((tier) => {
          const { nameKey, descriptionKey, ...bare } = tier;
          void nameKey;
          void descriptionKey;
          return tier.tierId === "hardware.premium"
            ? { ...bare, ...keys }
            : tier;
        }),
      },
    });
    const reword = rewordRow(hardwareItem("hardware.premium"), "name", "Nou");

    expect(refusalCodes(resultOf(withKeys({}), [reword]))).toBe("ok");
    expect(
      refusalCodes(resultOf(withKeys({ nameKey: "k.name" }), [reword])),
    ).toBe("0:NOT_EDITABLE");
    expect(
      refusalCodes(
        resultOf(withKeys({ descriptionKey: "k.description" }), [reword]),
      ),
    ).toBe("0:NOT_EDITABLE");
    expect(
      refusalCodes(
        resultOf(
          withKeys({ nameKey: "k.name", descriptionKey: "k.description" }),
          [reword],
        ),
      ),
    ).toBe("0:NOT_EDITABLE");
  });

  it.each([
    ["linkedBuildId"],
    ["perUnitMinor"],
    ["nameKey"],
    ["ruleId"],
    [""],
    ["__proto__"],
    ["constructor"],
  ])("are refused for a field called %j", (field) => {
    expect(
      refusalCodes(
        resultOf(WITH_ORGANISER, [
          rewordRow(accessoryItem("organiser"), field, "Nou"),
        ]),
      ),
    ).toBe("0:UNKNOWN_ADDRESS");
  });

  it("change the named field of the named row only, and an emptied description removes the member", () => {
    const first = applied(WITH_ORGANISER, [
      createAccessory("acc.two", { description: "Bun." }),
    ]);
    const result = applied(first, [
      rewordRow(accessoryItem("acc.two"), "name", "Alt nume"),
      rewordRow(accessoryItem("organiser"), "description", ""),
    ]);

    expect(
      result.linkedAccessories.map((linked) => [
        linked.accessoryId,
        linked.name,
      ]),
    ).toEqual([
      ["organiser", "Accesoriu organiser"],
      ["acc.two", "Alt nume"],
    ]);
    expect(
      Object.hasOwn(result.linkedAccessories[0] ?? {}, "description"),
    ).toBe(false);
    expect(result.linkedAccessories[1]?.description).toBe("Bun.");
  });

  it("refuse an emptied name", () => {
    expect(
      refusalCodes(
        resultOf(WITH_ORGANISER, [
          rewordRow(accessoryItem("organiser"), "name", "  "),
        ]),
      ),
    ).toBe("0:TEXT_EMPTY");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A book that does not state the linked accessories (stored before the section)

describe("a book that states no linked accessories is refused whole, never thrown at", () => {
  const WITHOUT_SECTION = (() => {
    const { linkedAccessories: omitted, ...rest } = SAMPLE_PRICE_BOOK;
    void omitted;
    return rest as unknown as PriceBook;
  })();

  it.each([
    ["an accessory's creation", () => [createAccessory("acc.a")]],
    [
      "a linked accessory's deletion",
      () => [deleteItem(accessoryItem("acc.a"))],
    ],
    [
      "a linked accessory's words",
      () => [rewordRow(accessoryItem("acc.a"), "name", "Nou")],
    ],
    ["a linked accessory's price", () => [setAccessoryPrice("acc.a", 1)]],
    ["a class's creation", () => tierDraft("hw.a")],
    [
      "a class's deletion",
      () => [deleteItem(hardwareItem("hardware.premium"))],
    ],
  ])("answers %s with a refusal", (_label, make) => {
    expect(() => applyChanges(WITHOUT_SECTION, make())).not.toThrow();
    expect(applyChanges(WITHOUT_SECTION, make()).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Hostile stored values

describe("a stored change of a structural kind is refused or applied, never thrown at", () => {
  const aJson = fc.jsonValue({ maxDepth: 3 });
  const anItem = fc.oneof(
    aJson,
    fc.record({
      kind: fc.constantFrom(
        "hardware",
        "material",
        "accessory",
        "finish",
        "handle",
      ),
      tierId: aJson,
      accessoryId: aJson,
      finishId: aJson,
      handle: aJson,
    }),
  );
  const aStructural = fc.oneof(
    fc.record({
      address: fc.record({
        kind: fc.constantFrom("hardware-tier-created", "accessory-created"),
        tierId: aJson,
        accessoryId: aJson,
      }),
      value: aJson,
    }),
    fc.record({
      address: fc.record({
        kind: fc.constant("created-row-text"),
        item: anItem,
        field: aJson,
      }),
      value: aJson,
    }),
    fc.record({
      address: fc.record({ kind: fc.constant("item-deleted"), item: anItem }),
      value: aJson,
    }),
  ) as fc.Arbitrary<DraftChange>;

  it("keeps the verdict closed, the input untouched, and Object.prototype clean", () => {
    fc.assert(
      fc.property(fc.array(aStructural, { maxLength: 5 }), (changes) => {
        const frozen = deepFrozen(structuredClone(changes));

        const result = applyChanges(WITH_ORGANISER, frozen);

        expect(applyChanges(WITH_ORGANISER, frozen)).toEqual(result);
        if (!result.ok && result.reason === "changes-refused") {
          expect(result.refusals.length).toBeGreaterThan(0);
        }
        expect(Object.keys(Object.prototype)).toEqual([]);
        expect(Object.prototype).not.toHaveProperty("tierId");
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("refuses a change that is a hole, null, a number or a list", () => {
    for (const hostile of [null, 5, "x", [], undefined]) {
      const result = applyChanges(BASE, [hostile as unknown as DraftChange]);

      expect(refusalCodes(result)).toBe("0:UNKNOWN_ADDRESS");
    }
    expect(
      refusalCodes(applyChanges(BASE, new Array(2) as DraftChange[])),
    ).toBe("0:MISSING_VALUE,1:MISSING_VALUE");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Random drafts

describe("over drafts of creations, words, prices and deletions in any order", () => {
  it("reaches both an accepted and a refused outcome often enough that the properties below are not vacuous", () => {
    const outcomes = fc
      .sample(aDraft, { numRuns: 300, seed: SEED })
      .map((draft) => applyChanges(BASE, draft));

    expect(
      outcomes.filter((outcome) => outcome.ok).length,
    ).toBeGreaterThanOrEqual(60);
    expect(
      outcomes.filter((outcome) => !outcome.ok).length,
    ).toBeGreaterThanOrEqual(30);
    expect(
      outcomes.filter(
        (outcome) => outcome.ok && outcome.book.hardware.tiers.length > 3,
      ).length,
    ).toBeGreaterThanOrEqual(20);
  });

  it("never throws, never touches its input, and answers the same twice", () => {
    fc.assert(
      fc.property(aDraft, (draft) => {
        const base = deepFrozen(structuredClone(BASE));
        const frozenDraft = deepFrozen(structuredClone(draft));

        const first = applyChanges(base, frozenDraft);

        expect(applyChanges(base, frozenDraft)).toEqual(first);
        expect(JSON.stringify(first)).toBe(
          JSON.stringify(applyChanges(base, frozenDraft)),
        );
        expect(base).toEqual(BASE);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("makes a book that parses to itself, with unique ids and no member beyond its type's", () => {
    fc.assert(
      fc.property(aDraft, (draft) => {
        const result = applyChanges(BASE, draft);
        fc.pre(result.ok);

        const reparsed = parsePriceBook(result.book);
        expect(reparsed.ok && reparsed.book).toEqual(result.book);

        const ruleIds = [
          ...result.book.cabinetRules.map((rule) => rule.ruleId),
          ...result.book.hardware.tiers.map((tier) => tier.ruleId),
          ...result.book.material.tiers.map((tier) => tier.ruleId),
          ...result.book.linkedAccessories.map((linked) => linked.ruleId),
        ];
        expect(new Set(ruleIds).size).toBe(ruleIds.length);
        for (const tier of result.book.hardware.tiers.slice(
          BASE.hardware.tiers.length,
        )) {
          expect(Object.keys(tier).sort()).toEqual([
            "description",
            "name",
            "perDrawerMinor",
            "perHingeMinor",
            "perLiftMinor",
            "perPushToOpenMinor",
            "ruleId",
            "tierId",
          ]);
        }
        for (const linked of result.book.linkedAccessories) {
          expect(Object.keys(linked)).not.toContain("nameKey");
          expect(
            Object.keys(linked).every((member) =>
              [
                "accessoryId",
                "ruleId",
                "linkedBuildId",
                "perUnitMinor",
                "name",
                "description",
              ].includes(member),
            ),
          ).toBe(true);
        }
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("changes only what the draft names: every other row and every other field is the base book's", () => {
    fc.assert(
      fc.property(aDraft, (draft) => {
        const result = applyChanges(BASE, draft);
        fc.pre(result.ok);
        const deleted = new Set(itemKeys(deletedItemsOf(draft)));
        const edited = new Set(
          draft
            .filter((change) => change.address.kind === "hardware")
            .map((change) => addressKey(change.address)),
        );

        for (const base of BASE.hardware.tiers) {
          const found = result.book.hardware.tiers.find(
            (tier) => tier.tierId === base.tierId,
          );
          expect(found === undefined).toBe(
            deleted.has(JSON.stringify(hardwareItem(base.tierId))),
          );
          for (const [field, value] of Object.entries(base)) {
            const isEdited = edited.has(
              addressKey({ kind: "hardware", tierId: base.tierId, field }),
            );
            if (found !== undefined && !isEdited)
              expect(Reflect.get(found, field)).toEqual(value);
          }
        }
        expect(result.book.material).toEqual({
          ...BASE.material,
          tiers: BASE.material.tiers.filter(
            (tier) => !deleted.has(JSON.stringify(materialItem(tier.tierId))),
          ),
        });
        expect(result.book.cabinetRules).toEqual(BASE.cabinetRules);
        expect(result.book.accessories).toEqual(BASE.accessories);
        expect(result.book.depthRule).toEqual(BASE.depthRule);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("lists as created exactly the rows the book gains, and as deleted exactly the rows it loses", () => {
    fc.assert(
      fc.property(aDraft, (draft) => {
        const result = applyChanges(BASE, draft);
        fc.pre(result.ok);
        const gained = createdAndDeletedIn(BASE, result.book);

        expect(itemKeys(createdItemsOf(draft))).toEqual(gained.created);
        expect(
          itemKeys(deletedItemsOf(draft)).filter((key) =>
            gained.deleted.includes(key),
          ),
        ).toEqual(gained.deleted);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("is refused for exactly the creations that owe a rate, and for them alone, when the rest is acceptable", () => {
    fc.assert(
      fc.property(aDraft, (draft) => {
        const result = applyChanges(BASE, draft);
        if (result.ok || result.reason !== "changes-refused") return;
        const missing = result.refusals
          .filter(({ code }) => code === "CREATED_TIER_RATES_MISSING")
          .map(({ index }) => draft[index]?.address.kind);

        expect(missing.every((kind) => kind === "hardware-tier-created")).toBe(
          true,
        );
        expect(result.refusals.map(({ index }) => index)).toEqual(
          [...result.refusals.map(({ index }) => index)].sort(
            (left, right) => left - right,
          ),
        );
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});
