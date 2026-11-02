// M10 M4 (1), (2), (4): the changes that add, reword or remove a row of the book. The expected books are written out
// member by member or built from the base book by a plain spread, never by the module under test.
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  type ApplyChangesResult,
} from "../../src/price-dashboard/apply-changes.js";
import type {
  BookFieldAddress,
  DraftChange,
  HardwareRateField,
} from "../../src/price-dashboard/book-field-address.js";
import {
  createdItemsOf,
  deletedItemsOf,
} from "../../src/price-dashboard/draft-structure.js";
import { hardwareRatesOf } from "../../src/price-dashboard/structural-changes.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { HardwareTier, PriceBook } from "../../src/pricing/price-book.js";

import { deepFreeze, PERCENTAGE_BOOK } from "./change-set-books.js";
import {
  bookWithLinked,
  CUSTOMER_ROW_IDS,
  linkedRule,
} from "../support/linked-accessory-books.js";

const NEW_TIER = "hardware.economy";
const WORDS = { name: "Economic", description: "Glisiere simple." };

function change(address: BookFieldAddress, value: unknown): DraftChange {
  return { address, value } as DraftChange;
}

function createTier(
  tierId = NEW_TIER,
  ...value: readonly [] | readonly [unknown]
): DraftChange {
  return change(
    { kind: "hardware-tier-created", tierId },
    value.length === 0 ? WORDS : value[0],
  );
}

function rate(
  tierId: string,
  field: HardwareRateField,
  value: number,
): DraftChange {
  return change({ kind: "hardware", tierId, field }, value);
}

function everyRate(tierId = NEW_TIER): readonly DraftChange[] {
  return [
    rate(tierId, "perHingeMinor", 1_000),
    rate(tierId, "perDrawerMinor", 2_000),
    rate(tierId, "perPushToOpenMinor", 3_000),
    rate(tierId, "perLiftMinor", 4_000),
  ];
}

function createAccessory(
  accessoryId: string,
  value: Record<string, unknown> = {},
): DraftChange {
  return change(
    { kind: "accessory-created", accessoryId },
    {
      linkedBuildId: "base-3drawer",
      perUnitMinor: 5_000,
      name: "Organizator",
      ...value,
    },
  );
}

function textOf(item: unknown, field: string, value: unknown): DraftChange {
  return change(
    { kind: "created-row-text", item, field } as BookFieldAddress,
    value,
  );
}

function deletion(item: unknown, value: unknown = true): DraftChange {
  return change({ kind: "item-deleted", item } as BookFieldAddress, value);
}

const HARDWARE = (tierId: string) => ({ kind: "hardware", tierId }) as const;
const ACCESSORY = (accessoryId: string) =>
  ({ kind: "accessory", accessoryId }) as const;

function appliedBook(result: ApplyChangesResult): PriceBook {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
  return result.book;
}

function refusalsOf(result: ApplyChangesResult): readonly string[] {
  if (result.ok || result.reason !== "changes-refused")
    throw new Error(`expected refused changes: ${JSON.stringify(result)}`);
  return result.refusals.map(({ index, code }) => `${String(index)}:${code}`);
}

function refusalOf(book: PriceBook, ...changes: DraftChange[]): string {
  return refusalsOf(applyChanges(book, changes)).join(",");
}

const WITH_CREATED_TIER = appliedBook(
  applyChanges(PERCENTAGE_BOOK, [createTier(), ...everyRate()]),
);
const WITH_LINKED = bookWithLinked(
  [linkedRule("organiser", { description: "Pentru sertar." })],
  PERCENTAGE_BOOK,
);

describe("creating a hardware class (A-18)", () => {
  it("adds a tier with the Romanian words and the four rates, and nothing else of the book changes", () => {
    const book = appliedBook(
      applyChanges(PERCENTAGE_BOOK, [createTier(), ...everyRate()]),
    );

    expect(book.hardware.tiers.at(-1)).toEqual({
      tierId: NEW_TIER,
      ruleId: NEW_TIER,
      name: "Economic",
      description: "Glisiere simple.",
      perHingeMinor: 1_000,
      perDrawerMinor: 2_000,
      perPushToOpenMinor: 3_000,
      perLiftMinor: 4_000,
    });
    expect(book).toEqual({
      ...PERCENTAGE_BOOK,
      hardware: {
        ...PERCENTAGE_BOOK.hardware,
        tiers: [...PERCENTAGE_BOOK.hardware.tiers, book.hardware.tiers.at(-1)],
      },
    });
    expect(parsePriceBook(book).ok).toBe(true);
  });

  it("carries no catalogue key and no Russian member: the row's words are its own", () => {
    const tier = WITH_CREATED_TIER.hardware.tiers.at(-1) ?? {};

    expect(Object.keys(tier).sort()).toEqual(
      [
        "tierId",
        "ruleId",
        "name",
        "description",
        "perHingeMinor",
        "perDrawerMinor",
        "perPushToOpenMinor",
        "perLiftMinor",
      ].sort(),
    );
  });

  it("is not made inactive by a flag in the book: it is a created item the publish starts switched off", () => {
    const changes = [createTier(), ...everyRate()];

    expect(JSON.stringify(WITH_CREATED_TIER)).not.toMatch(/"active"/);
    expect(createdItemsOf(changes)).toEqual([HARDWARE(NEW_TIER)]);
  });

  it("refuses a member the creation does not state, whether it is a catalogue key or a Russian text", () => {
    for (const smuggled of [
      { nameKey: "priceBook.hardware.standard.name" },
      { descriptionKey: "priceBook.hardware.standard.description" },
      { nameRu: "Economicheskiy" },
      { perHingeMinor: 1 },
    ]) {
      expect(
        refusalOf(
          PERCENTAGE_BOOK,
          createTier(NEW_TIER, { ...WORDS, ...smuggled }),
        ),
      ).toBe("0:NOT_EDITABLE");
    }
  });

  it("does not copy a member the value only inherits", () => {
    const inheriting = Object.create({ nameKey: "priceBook.x" }) as Record<
      string,
      unknown
    >;
    Object.assign(inheriting, WORDS);

    const book = appliedBook(
      applyChanges(PERCENTAGE_BOOK, [
        createTier(NEW_TIER, inheriting),
        ...everyRate(),
      ]),
    );

    expect(book.hardware.tiers.at(-1)).not.toHaveProperty("nameKey");
  });

  it("reads each member of the value once", () => {
    let reads = 0;
    const counting = {
      description: WORDS.description,
      get name() {
        reads += 1;
        return WORDS.name;
      },
    };

    applyChanges(PERCENTAGE_BOOK, [createTier(NEW_TIER, counting)]);

    expect(reads).toBe(1);
  });

  it.each([
    ["no value", undefined, "0:MISSING_VALUE"],
    ["a value that is text", "Economic", "0:MISSING_VALUE"],
    ["no description", { name: "Economic" }, "0:MISSING_VALUE"],
    ["a blank name", { ...WORDS, name: " ​ " }, "0:TEXT_EMPTY"],
    ["a percentage", { ...WORDS, name: "Plus 10%" }, "0:TEXT_STATES_AN_AMOUNT"],
    [
      "an amount",
      { ...WORDS, description: "Doar 99 lei" },
      "0:TEXT_STATES_AN_AMOUNT",
    ],
    [
      "an inclusion",
      { ...WORDS, description: "Montaj inclus" },
      "0:TEXT_STATES_AN_AMOUNT",
    ],
    [
      "a line break",
      { ...WORDS, description: "a\nb" },
      "0:TEXT_FORBIDDEN_CHARACTER",
    ],
    [
      "a name past the bound",
      { ...WORDS, name: "a".repeat(81) },
      "0:TEXT_TOO_LONG",
    ],
  ])("refuses %s", (_, value, refusal) => {
    expect(refusalOf(PERCENTAGE_BOOK, createTier(NEW_TIER, value))).toBe(
      refusal,
    );
  });

  it("accepts an empty description, as a tier's description is a string and may be empty", () => {
    const result = applyChanges(PERCENTAGE_BOOK, [
      createTier(NEW_TIER, { ...WORDS, description: "" }),
      ...everyRate(),
    ]);

    expect(appliedBook(result).hardware.tiers.at(-1)).toMatchObject({
      description: "",
    });
  });

  it("refuses an id that is not text, as no address", () => {
    expect(refusalOf(PERCENTAGE_BOOK, createTier(7 as unknown as string))).toBe(
      "0:UNKNOWN_ADDRESS",
    );
  });
});

describe("the rates a created class owes are the ones the book's tiers state", () => {
  const withoutLiftRate: PriceBook = {
    ...PERCENTAGE_BOOK,
    hardware: {
      ...PERCENTAGE_BOOK.hardware,
      tiers: PERCENTAGE_BOOK.hardware.tiers.map(
        (tier) =>
          Object.fromEntries(
            Object.entries(tier).filter(([key]) => key !== "perLiftMinor"),
          ) as unknown as HardwareTier,
      ),
    },
  };

  it("are the four, the lift rate last, for a book whose tiers state a lift rate", () => {
    expect(hardwareRatesOf(PERCENTAGE_BOOK)).toEqual([
      "perHingeMinor",
      "perDrawerMinor",
      "perPushToOpenMinor",
      "perLiftMinor",
    ]);
  });

  it("are the three for a book whose tiers state no lift rate, so a created class is never owed one nobody can price", () => {
    expect(hardwareRatesOf(withoutLiftRate)).toEqual([
      "perHingeMinor",
      "perDrawerMinor",
      "perPushToOpenMinor",
    ]);
  });
});

describe("a created class owes a change for every rate", () => {
  const RATES = [
    "perHingeMinor",
    "perDrawerMinor",
    "perPushToOpenMinor",
    "perLiftMinor",
  ] as const;

  it.each(RATES)(
    "is refused at its own index when %s is never set",
    (missing) => {
      const rates = everyRate().filter(
        (rated) => (rated.address as { field?: string }).field !== missing,
      );

      expect(rates).toHaveLength(3);
      expect(refusalOf(PERCENTAGE_BOOK, createTier(), ...rates)).toBe(
        "0:CREATED_TIER_RATES_MISSING",
      );
    },
  );

  it("is refused when none is set", () => {
    expect(refusalOf(PERCENTAGE_BOOK, createTier())).toBe(
      "0:CREATED_TIER_RATES_MISSING",
    );
  });

  it("accepts a rate of 0, which a mechanism the class does not have is left at", () => {
    const rates = [
      rate(NEW_TIER, "perHingeMinor", 0),
      rate(NEW_TIER, "perDrawerMinor", 0),
      rate(NEW_TIER, "perPushToOpenMinor", 0),
      rate(NEW_TIER, "perLiftMinor", 0),
    ];

    expect(applyChanges(PERCENTAGE_BOOK, [createTier(), ...rates]).ok).toBe(
      true,
    );
  });

  it("does not count a rate that was refused", () => {
    const refusedRate = rate(NEW_TIER, "perHingeMinor", -1);

    expect(
      refusalOf(
        PERCENTAGE_BOOK,
        createTier(),
        refusedRate,
        rate(NEW_TIER, "perDrawerMinor", 1),
        rate(NEW_TIER, "perPushToOpenMinor", 1),
        rate(NEW_TIER, "perLiftMinor", 1),
      ),
    ).toBe("0:CREATED_TIER_RATES_MISSING,1:NEGATIVE");
  });

  it("owes nothing for a class the same draft deletes again", () => {
    const book = appliedBook(
      applyChanges(PERCENTAGE_BOOK, [
        createTier(),
        deletion(HARDWARE(NEW_TIER)),
      ]),
    );

    expect(book).toEqual(PERCENTAGE_BOOK);
    expect(
      createdItemsOf([createTier(), deletion(HARDWARE(NEW_TIER))]),
    ).toEqual([]);
  });
});

describe("an id the book already states is a collision the parser refuses (F5)", () => {
  const EXISTING: readonly (readonly [string, DraftChange])[] = [
    ["a hardware tier id", createTier("hardware.soft-close")],
    ["a material tier id", createTier("material.veneer")],
    ["a built-in accessory's field name", createAccessory("dishDryingRack")],
    ["a linked accessory id", createAccessory("organiser")],
  ];

  it.each(EXISTING)(
    "refuses a creation reusing %s, and the base book is untouched",
    (_, creation) => {
      const frozen = deepFreeze(structuredClone(WITH_LINKED));
      const needsRates = creation.address.kind === "hardware-tier-created";
      const tierId = (creation.address as { tierId?: string }).tierId ?? "";

      const result = applyChanges(frozen, [
        creation,
        ...(needsRates ? everyRate(tierId) : []),
      ]);

      expect(result).toMatchObject({ ok: false, reason: "candidate-refused" });
      expect(frozen).toEqual(WITH_LINKED);
    },
  );
});

describe("creating a linked accessory (A-19)", () => {
  it("adds it after the book's accessories, in book order, with only the members it states", () => {
    const book = appliedBook(
      applyChanges(WITH_LINKED, [
        createAccessory("plinth-light", { description: "Lumina." }),
      ]),
    );

    expect(book.linkedAccessories).toEqual([
      ...WITH_LINKED.linkedAccessories,
      {
        accessoryId: "plinth-light",
        ruleId: "accessory.plinth-light",
        linkedBuildId: "base-3drawer",
        perUnitMinor: 5_000,
        name: "Organizator",
        description: "Lumina.",
      },
    ]);
  });

  it("leaves the description out when none is given, as the parser reads it", () => {
    const book = appliedBook(
      applyChanges(PERCENTAGE_BOOK, [createAccessory("plinth-light")]),
    );

    expect(book.linkedAccessories.at(-1)).toEqual({
      accessoryId: "plinth-light",
      ruleId: "accessory.plinth-light",
      linkedBuildId: "base-3drawer",
      perUnitMinor: 5_000,
      name: "Organizator",
    });
  });

  it("takes its price from a later accessory change, which the running candidate can find", () => {
    const book = appliedBook(
      applyChanges(PERCENTAGE_BOOK, [
        createAccessory("plinth-light"),
        change(
          {
            kind: "accessory",
            accessoryId: "plinth-light",
            field: "perUnitMinor",
          },
          9_000,
        ),
      ]),
    );

    expect(book.linkedAccessories.at(-1)?.perUnitMinor).toBe(9_000);
  });

  it("refuses a link to a row the book does not price", () => {
    expect(
      refusalOf(
        PERCENTAGE_BOOK,
        createAccessory("plinth-light", { linkedBuildId: "no-such-row" }),
      ),
    ).toBe("0:LINK_TARGET_UNKNOWN");
  });

  it("refuses a link to any row the customer supplies", () => {
    expect(CUSTOMER_ROW_IDS.length).toBeGreaterThan(0);
    for (const linkedBuildId of CUSTOMER_ROW_IDS) {
      expect(
        refusalOf(
          PERCENTAGE_BOOK,
          createAccessory("plinth-light", { linkedBuildId }),
        ),
      ).toBe("0:LINK_TARGET_CUSTOMER_SUPPLIED");
    }
  });

  it.each([
    ["a negative price", { perUnitMinor: -1 }, "0:NEGATIVE"],
    ["a price with a fraction", { perUnitMinor: 1.5 }, "0:NOT_A_WHOLE_NUMBER"],
    ["no price", { perUnitMinor: undefined }, "0:MISSING_VALUE"],
    ["a link that is not text", { linkedBuildId: 5 }, "0:MISSING_VALUE"],
    ["a blank name", { name: "  " }, "0:TEXT_EMPTY"],
    [
      "a name stating a percentage",
      { name: "Cu 5%" },
      "0:TEXT_STATES_AN_AMOUNT",
    ],
    [
      "a description saying inclus",
      { description: "Inclus" },
      "0:TEXT_STATES_AN_AMOUNT",
    ],
    ["a Russian member", { nameRu: "x" }, "0:NOT_EDITABLE"],
    ["a catalogue key", { nameKey: "priceBook.x" }, "0:NOT_EDITABLE"],
  ])("refuses %s", (_, amendment, refusal) => {
    expect(
      refusalOf(PERCENTAGE_BOOK, createAccessory("plinth-light", amendment)),
    ).toBe(refusal);
  });
});

describe("the words of a created row (A-21)", () => {
  it("rewords a created class, trimmed", () => {
    const book = appliedBook(
      applyChanges(WITH_CREATED_TIER, [
        textOf(HARDWARE(NEW_TIER), "name", "  Economic plus "),
        textOf(HARDWARE(NEW_TIER), "description", ""),
      ]),
    );

    expect(book.hardware.tiers.at(-1)).toMatchObject({
      name: "Economic plus",
      description: "",
    });
  });

  it("rewords a class created earlier in the same draft", () => {
    const book = appliedBook(
      applyChanges(PERCENTAGE_BOOK, [
        createTier(),
        ...everyRate(),
        textOf(HARDWARE(NEW_TIER), "name", "Altul"),
      ]),
    );

    expect(book.hardware.tiers.at(-1)).toMatchObject({ name: "Altul" });
  });

  it("rewords a linked accessory, and an emptied description leaves the member out", () => {
    const book = appliedBook(
      applyChanges(WITH_LINKED, [
        textOf(ACCESSORY("organiser"), "name", "Altul"),
        textOf(ACCESSORY("organiser"), "description", " "),
      ]),
    );

    expect(book.linkedAccessories[0]).toEqual({
      accessoryId: "organiser",
      ruleId: "accessory.organiser",
      linkedBuildId: "base-3drawer",
      perUnitMinor: 12_345,
      name: "Altul",
    });
  });

  it("refuses text the judgement refuses, leaving the book as it was", () => {
    expect(
      refusalOf(WITH_LINKED, textOf(ACCESSORY("organiser"), "name", "10%")),
    ).toBe("0:TEXT_STATES_AN_AMOUNT");
    expect(
      refusalOf(WITH_LINKED, textOf(ACCESSORY("organiser"), "name", "")),
    ).toBe("0:TEXT_EMPTY");
  });

  it("refuses a field the row has no words in", () => {
    expect(
      refusalOf(WITH_LINKED, textOf(ACCESSORY("organiser"), "price", "x")),
    ).toBe("0:UNKNOWN_ADDRESS");
  });

  describe("on a row the catalogue or the code words", () => {
    const keyed = [
      ...PERCENTAGE_BOOK.hardware.tiers
        .filter(
          (tier) =>
            tier.nameKey !== undefined || tier.descriptionKey !== undefined,
        )
        .map((tier) => HARDWARE(tier.tierId)),
      ...PERCENTAGE_BOOK.material.tiers.map((tier) => ({
        kind: "material",
        tierId: tier.tierId,
      })),
      ACCESSORY("sinkProtectiveCover"),
      ACCESSORY("dishDryingRack"),
      { kind: "finish", finishId: "white" },
      { kind: "handle", handle: "steel" },
    ];

    it("sweeps a floor of keyed and built-in rows, so the refusal is not vacuous", () => {
      expect(keyed.length).toBeGreaterThanOrEqual(9);
    });

    it.each(["name", "description"])(
      "refuses every one of them for the %s: their text is read-only",
      (field) => {
        for (const item of keyed) {
          expect(refusalOf(PERCENTAGE_BOOK, textOf(item, field, "Altul"))).toBe(
            "0:NOT_EDITABLE",
          );
        }
      },
    );
  });

  it("refuses a row the book does not state", () => {
    expect(
      refusalOf(
        PERCENTAGE_BOOK,
        textOf(HARDWARE("hardware.none"), "name", "x"),
      ),
    ).toBe("0:UNKNOWN_ITEM");
    expect(
      refusalOf(PERCENTAGE_BOOK, textOf(ACCESSORY("none"), "name", "x")),
    ).toBe("0:UNKNOWN_ITEM");
  });

  it("refuses an item that is not the shape of one, as no address", () => {
    for (const item of [
      undefined,
      null,
      "hardware",
      { kind: "hardware" },
      { tierId: "a" },
    ]) {
      expect(refusalOf(PERCENTAGE_BOOK, textOf(item, "name", "x"))).toBe(
        "0:UNKNOWN_ADDRESS",
      );
    }
  });
});

describe("deleting an item (A-18)", () => {
  it("removes exactly the created class, leaving the rest of the book as it was", () => {
    const book = appliedBook(
      applyChanges(WITH_CREATED_TIER, [deletion(HARDWARE(NEW_TIER))]),
    );

    expect(book).toEqual(PERCENTAGE_BOOK);
  });

  it("removes exactly one material tier that is not the fallback", () => {
    const veneer = { kind: "material", tierId: "material.veneer" };

    const book = appliedBook(applyChanges(PERCENTAGE_BOOK, [deletion(veneer)]));

    expect(book).toEqual({
      ...PERCENTAGE_BOOK,
      material: {
        ...PERCENTAGE_BOOK.material,
        tiers: PERCENTAGE_BOOK.material.tiers.filter(
          (tier) => tier.tierId !== "material.veneer",
        ),
      },
    });
  });

  it("removes exactly one linked accessory", () => {
    const book = appliedBook(
      applyChanges(WITH_LINKED, [deletion(ACCESSORY("organiser"))]),
    );

    expect(book).toEqual({ ...WITH_LINKED, linkedAccessories: [] });
  });

  it("refuses the fallback tier of each group", () => {
    expect(
      refusalOf(
        PERCENTAGE_BOOK,
        deletion(HARDWARE(PERCENTAGE_BOOK.hardware.defaultTierId)),
      ),
    ).toBe("0:ITEM_IS_DEFAULT");
    expect(
      refusalOf(
        PERCENTAGE_BOOK,
        deletion({
          kind: "material",
          tierId: PERCENTAGE_BOOK.material.defaultTierId,
        }),
      ),
    ).toBe("0:ITEM_IS_DEFAULT");
  });

  it("refuses a colour, a handle and each built-in accessory: code's, disabled and never deleted (M4-e)", () => {
    const items = [
      { kind: "finish", finishId: "white" },
      { kind: "handle", handle: "steel" },
      ACCESSORY("sinkProtectiveCover"),
      ACCESSORY("dishDryingRack"),
    ];

    for (const item of items) {
      expect(refusalOf(PERCENTAGE_BOOK, deletion(item))).toBe("0:NOT_EDITABLE");
    }
  });

  it("refuses an item the book does not state, and a value that is not true", () => {
    expect(
      refusalOf(PERCENTAGE_BOOK, deletion(HARDWARE("hardware.none"))),
    ).toBe("0:UNKNOWN_ITEM");
    expect(
      refusalOf(
        PERCENTAGE_BOOK,
        deletion(HARDWARE("hardware.soft-close"), false),
      ),
    ).toBe("0:MISSING_VALUE");
  });

  it("refuses a change to a row the draft deleted earlier", () => {
    expect(
      refusalOf(
        WITH_LINKED,
        deletion(ACCESSORY("organiser")),
        change(
          {
            kind: "accessory",
            accessoryId: "organiser",
            field: "perUnitMinor",
          },
          1,
        ),
      ),
    ).toBe("1:UNKNOWN_ITEM");
  });
});

describe("what a draft says about the rows it creates and deletes", () => {
  it("lists the creations in draft order, and the deletions as they are named", () => {
    const changes = [
      createAccessory("plinth-light"),
      createTier(),
      ...everyRate(),
      deletion({ kind: "material", tierId: "material.veneer" }),
      deletion(ACCESSORY("sinkProtectiveCover")),
    ];

    expect(createdItemsOf(changes)).toEqual([
      ACCESSORY("plinth-light"),
      HARDWARE(NEW_TIER),
    ]);
    expect(deletedItemsOf(changes)).toEqual([
      { kind: "material", tierId: "material.veneer" },
      ACCESSORY("sinkProtectiveCover"),
    ]);
  });

  it("reads a hostile list without throwing: a hole, a non-object and a change without an address name nothing", () => {
    const hostile: unknown[] = new Array<unknown>(1);
    hostile.push(
      null,
      "x",
      {},
      { address: { kind: "item-deleted" } },
      { address: { kind: "hardware-tier-created", tierId: 4 } },
    );
    const changes = hostile as DraftChange[];

    expect(0 in changes).toBe(false);
    expect(createdItemsOf(changes)).toEqual([]);
    expect(deletedItemsOf(changes)).toEqual([]);
  });
});

describe("a structural change leaves the base book alone", () => {
  it("does not write to a book it was given frozen", () => {
    const frozen = deepFreeze(structuredClone(WITH_LINKED));

    const result = applyChanges(frozen, [
      createTier(),
      ...everyRate(),
      createAccessory("plinth-light"),
      textOf(ACCESSORY("organiser"), "name", "Altul"),
      deletion(ACCESSORY("organiser")),
    ]);

    expect(result.ok).toBe(true);
    expect(frozen).toEqual(WITH_LINKED);
  });
});
