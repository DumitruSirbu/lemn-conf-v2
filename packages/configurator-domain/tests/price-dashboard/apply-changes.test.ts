// `applyChanges` and `revertChange`. The positive cases compare the module with `setSlots`, which writes the
// same edit by JSON path, so the expected book is not produced by the code under test.
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  revertChange,
  type ApplyChangesResult,
} from "../../src/price-dashboard/apply-changes.js";
import type {
  BookFieldAddress,
  DraftChange,
} from "../../src/price-dashboard/book-field-address.js";
import {
  APPLIED_ADDRESS_KINDS,
  CHANGE_REFUSAL_CODES,
} from "../../src/price-dashboard/editable-fields.js";
import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/book-reading.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";

import {
  anchoredRuleReading,
  changeOf,
  customerRuleOf,
  deepFreeze,
  editSlotsOf,
  FIXTURE_BOOKS,
  FLAT_BOOK,
  PER_SIZE_WIDTHS_MM,
  perSizeRuleOf,
  PERCENTAGE_BOOK,
  setSlots,
  valueForSeed,
} from "./change-set-books.js";

function appliedBook(result: ApplyChangesResult): PriceBook {
  if (!result.ok)
    throw new Error(`expected a candidate book, got ${result.reason}`);
  return result.book;
}

function refusalsOf(result: ApplyChangesResult): readonly string[] {
  if (result.ok || result.reason !== "changes-refused")
    throw new Error("expected refused changes");
  return result.refusals.map(({ index, code }) => `${String(index)}:${code}`);
}

function changeAt(
  address: BookFieldAddress,
  value: unknown,
  groupId?: string,
): DraftChange {
  return {
    address,
    value,
    ...(groupId === undefined ? {} : { groupId }),
  } as DraftChange;
}

function onlyRefusal(
  book: PriceBook,
  address: BookFieldAddress,
  value: unknown,
): string {
  return refusalsOf(applyChanges(book, [changeAt(address, value)]))[0] ?? "";
}

describe("the fixtures are books the parser accepts (a control for every refusal below)", () => {
  it.each(FIXTURE_BOOKS)("parses the $form form", ({ book }) => {
    expect(parsePriceBook(book).ok).toBe(true);
  });
});

describe("every editable field of both forms takes a change", () => {
  const cases = FIXTURE_BOOKS.flatMap(({ form, book }) =>
    editSlotsOf(book).map((slot) => ({ form, book, slot })),
  );

  it("has a floor of cases for each arm of each form", () => {
    const armsOfPercentage = new Set(
      cases
        .filter(({ form }) => form === "percentage")
        .map(({ slot }) => slot.arm),
    );
    expect([...armsOfPercentage].sort()).toEqual(
      [
        "accessory",
        "cabinet-size",
        "cabinet.anchored-width",
        "cabinet.anchored-width-and-door-leaves",
        "cabinet.anchored-width-and-height",
        "cabinet.anchored-width-height-and-door-leaves",
        "depth-rule",
        "hardware",
        "material",
        "provisional",
      ].sort(),
    );
    const armsOfFlat = new Set(
      cases.filter(({ form }) => form === "flat").map(({ slot }) => slot.arm),
    );
    expect([...armsOfFlat].sort()).toEqual(
      ["accessory", "hardware", "provisional"].sort(),
    );
  });

  it.each(cases)(
    "sets $slot.arm $slot.path in the $form form exactly as a write by path does",
    ({ book, slot }) => {
      const edit = { slot, value: valueForSeed(slot, 987_654_321) };

      const result = applyChanges(book, [changeOf(edit)]);

      expect(appliedBook(result)).toEqual(setSlots(book, [edit]));
      expect(appliedBook(result)).not.toEqual(book);
    },
  );
});

describe("applying a list of changes", () => {
  it("gives the active book back for no changes", () => {
    for (const { book } of FIXTURE_BOOKS) {
      expect(appliedBook(applyChanges(book, []))).toEqual(book);
    }
  });

  it("lets a later change of an equal address win", () => {
    const slot = editSlotsOf(PERCENTAGE_BOOK)[0];
    if (slot === undefined) throw new Error("no slot");

    const result = applyChanges(PERCENTAGE_BOOK, [
      changeOf({ slot, value: 111 }),
      changeOf({ slot, value: 222 }),
    ]);

    expect(appliedBook(result)).toEqual(
      setSlots(PERCENTAGE_BOOK, [{ slot, value: 222 }]),
    );
  });

  it("never writes to the book it was given, nor to a change", () => {
    const frozenBook = deepFreeze(
      JSON.parse(JSON.stringify(PERCENTAGE_BOOK)) as PriceBook,
    );
    const edits = editSlotsOf(frozenBook).map((slot) => ({
      slot,
      value: valueForSeed(slot, 12_345),
    }));
    const changes = deepFreeze(edits.map((edit) => changeOf(edit)));

    const result = applyChanges(frozenBook, changes);

    expect(appliedBook(result)).toEqual(setSlots(PERCENTAGE_BOOK, edits));
    expect(frozenBook).toEqual(PERCENTAGE_BOOK);
  });

  it("names every refused change by its index and keeps the accepted ones out of the answer", () => {
    const [first, second] = editSlotsOf(PERCENTAGE_BOOK);
    if (first === undefined || second === undefined) throw new Error("no slot");

    const result = applyChanges(PERCENTAGE_BOOK, [
      changeOf({ slot: first, value: 5 }),
      changeAt(second.address, -1),
      changeOf({ slot: second, value: 7 }),
      changeAt(
        { kind: "cabinet", ruleId: "no-such-rule", field: "anchorMinor" },
        5,
      ),
    ]);

    expect(result.ok).toBe(false);
    expect(refusalsOf(result)).toEqual(["1:NEGATIVE", "3:UNKNOWN_RULE"]);
  });

  it("refuses a candidate the parser refuses, carrying the parser's failure and no book", () => {
    const notABook = {
      ...PERCENTAGE_BOOK,
      currency: "EUR",
    } as unknown as PriceBook;

    const result = applyChanges(notABook, []);

    expect(result).toMatchObject({
      ok: false,
      reason: "candidate-refused",
      failure: { code: "INVALID_PRICE_BOOK" },
    });
  });
});

describe("a change is refused with a closed code", () => {
  const rule = anchoredRuleReading(PERCENTAGE_BOOK, "anchored-width");
  const perSize = perSizeRuleOf(PERCENTAGE_BOOK);
  const customer = customerRuleOf(PERCENTAGE_BOOK);
  const defaultMaterialId = PERCENTAGE_BOOK.material.defaultTierId;
  const upgradeMaterialId =
    PERCENTAGE_BOOK.material.tiers.find(
      (tier) => tier.tierId !== defaultMaterialId,
    )?.tierId ?? "";

  const anchorOf = (ruleId: string): BookFieldAddress => ({
    kind: "cabinet",
    ruleId,
    field: "anchorMinor",
  });

  const addressCases: readonly (readonly [string, BookFieldAddress, string])[] =
    [
      [
        "a rule the book does not have",
        anchorOf("no-such-rule"),
        "UNKNOWN_RULE",
      ],
      [
        "a cabinet field no address lists",
        {
          kind: "cabinet",
          ruleId: rule.ruleId,
          field: "baseMinor",
        } as unknown as BookFieldAddress,
        "UNKNOWN_ADDRESS",
      ],
      [
        "a hardware tier the book does not have",
        { kind: "hardware", tierId: "no-such-tier", field: "perHingeMinor" },
        "UNKNOWN_ITEM",
      ],
      [
        "a hardware field no address lists",
        {
          kind: "hardware",
          tierId: "hardware.standard",
          field: "perHandleMinor",
        } as unknown as BookFieldAddress,
        "UNKNOWN_ADDRESS",
      ],
      [
        "a hardware rate the book does not state yet (the lift rate)",
        {
          kind: "hardware",
          tierId: "hardware.standard",
          field: "perLiftMinor",
        },
        "FIELD_NOT_ON_RULE",
      ],
      [
        "a material tier the book does not have",
        {
          kind: "material",
          tierId: "no-such-tier",
          field: "percentOfCabinets",
        },
        "UNKNOWN_ITEM",
      ],
      [
        "the default material, which is the 0 % reference",
        {
          kind: "material",
          tierId: defaultMaterialId,
          field: "percentOfCabinets",
        },
        "NOT_EDITABLE",
      ],
      [
        "an accessory the book does not have",
        {
          kind: "accessory",
          accessoryId: "no-such-accessory",
          field: "perUnitMinor",
        },
        "UNKNOWN_ITEM",
      ],
      [
        "a cabinet price on a row the customer supplies",
        anchorOf(customer.ruleId),
        "NOT_EDITABLE",
      ],
      [
        "a size of a row the customer supplies",
        { kind: "cabinet-size", ruleId: customer.ruleId, widthMm: 600 },
        "NOT_EDITABLE",
      ],
      [
        "a height step on a shape that reads no height",
        { kind: "cabinet", ruleId: rule.ruleId, field: "perHeightStepMinor" },
        "FIELD_NOT_ON_RULE",
      ],
      [
        "a door-leaf rate on a shape that reads no door",
        {
          kind: "cabinet",
          ruleId: rule.ruleId,
          field: "perExtraDoorLeafMinor",
        },
        "FIELD_NOT_ON_RULE",
      ],
      [
        "an anchored field on a fixed-size row",
        anchorOf(perSize.ruleId),
        "FIELD_NOT_ON_RULE",
      ],
      [
        "a size of an anchored row",
        { kind: "cabinet-size", ruleId: rule.ruleId, widthMm: 600 },
        "FIELD_NOT_ON_RULE",
      ],
      [
        "a size the fixed-size row does not list, though it is on the 50 mm grid",
        { kind: "cabinet-size", ruleId: perSize.ruleId, widthMm: 650 },
        "FIELD_NOT_ON_RULE",
      ],
      [
        "a size off the 50 mm grid",
        { kind: "cabinet-size", ruleId: perSize.ruleId, widthMm: 575 },
        "FIELD_NOT_ON_RULE",
      ],
      [
        "a size of zero millimetres",
        { kind: "cabinet-size", ruleId: perSize.ruleId, widthMm: 0 },
        "FIELD_NOT_ON_RULE",
      ],
      [
        "a size that is not a number",
        { kind: "cabinet-size", ruleId: perSize.ruleId, widthMm: Number.NaN },
        "FIELD_NOT_ON_RULE",
      ],
      [
        "a size with a fraction of a millimetre",
        { kind: "cabinet-size", ruleId: perSize.ruleId, widthMm: 600.5 },
        "FIELD_NOT_ON_RULE",
      ],
      [
        "a kind no address has",
        { kind: "no-such-kind" } as unknown as BookFieldAddress,
        "UNKNOWN_ADDRESS",
      ],
      [
        "an address that is not an object",
        "cabinet" as unknown as BookFieldAddress,
        "UNKNOWN_ADDRESS",
      ],
    ];

  it.each(addressCases)("%s", (_title, address, code) => {
    expect(onlyRefusal(PERCENTAGE_BOOK, address, 5)).toBe(`0:${code}`);
  });

  it("refuses a material change and the depth rule on a book in the flat form", () => {
    const flatMaterial = FLAT_BOOK.material.tiers[1]?.tierId ?? "";

    expect(
      onlyRefusal(
        FLAT_BOOK,
        { kind: "material", tierId: flatMaterial, field: "percentOfCabinets" },
        5,
      ),
    ).toBe("0:FIELD_NOT_ON_RULE");
    expect(onlyRefusal(FLAT_BOOK, { kind: "depth-rule" }, 5)).toBe(
      "0:FIELD_NOT_ON_RULE",
    );
  });

  it("refuses a change with no address or that is not an object", () => {
    const hostile = [
      undefined,
      null,
      7,
      "x",
      [],
      {},
    ] as unknown as DraftChange[];

    const result = applyChanges(PERCENTAGE_BOOK, hostile);

    expect(refusalsOf(result)).toEqual(
      hostile.map((_c, i) => `${String(i)}:UNKNOWN_ADDRESS`),
    );
  });

  it("refuses the four kinds M4 adds as not editable, whatever their value", () => {
    const m4Addresses: readonly BookFieldAddress[] = [
      { kind: "hardware-tier-created", tierId: "hardware.new" },
      { kind: "accessory-created", accessoryId: "accessory.new" },
      {
        kind: "created-row-text",
        item: { kind: "hardware", tierId: "hardware.new" },
        field: "name",
      },
      {
        kind: "item-deleted",
        item: { kind: "hardware", tierId: "hardware.standard" },
      },
    ];

    const codes = m4Addresses.map((address) =>
      onlyRefusal(PERCENTAGE_BOOK, address, true),
    );

    expect(codes).toEqual(m4Addresses.map(() => "0:NOT_EDITABLE"));
  });

  describe("by its value", () => {
    const amountField: BookFieldAddress = {
      kind: "cabinet",
      ruleId: rule.ruleId,
      field: "anchorMinor",
    };
    const valueCases: readonly (readonly [string, unknown, string])[] = [
      ["undefined", undefined, "MISSING_VALUE"],
      ["null", null, "MISSING_VALUE"],
      ["a numeric string", "1500", "NOT_A_WHOLE_NUMBER"],
      ["a boolean", true, "NOT_A_WHOLE_NUMBER"],
      ["an object", { amount: 5 }, "NOT_A_WHOLE_NUMBER"],
      ["NaN", Number.NaN, "NOT_A_WHOLE_NUMBER"],
      ["Infinity", Number.POSITIVE_INFINITY, "NOT_A_WHOLE_NUMBER"],
      ["negative Infinity", Number.NEGATIVE_INFINITY, "NOT_A_WHOLE_NUMBER"],
      ["a fraction", 1.5, "NOT_A_WHOLE_NUMBER"],
      ["a sum with a float error", 0.1 + 0.2, "NOT_A_WHOLE_NUMBER"],
      ["below zero", -1, "NEGATIVE"],
      ["negative zero", -0, "NEGATIVE"],
      [
        "one past the largest amount",
        MAX_PRICE_COEFFICIENT_MINOR + 1,
        "TOO_LARGE",
      ],
      [
        "an integer past the safe range",
        Number.MAX_SAFE_INTEGER + 2,
        "TOO_LARGE",
      ],
    ];

    it.each(valueCases)("refuses an amount of %s", (_title, value, code) => {
      expect(onlyRefusal(PERCENTAGE_BOOK, amountField, value)).toBe(
        `0:${code}`,
      );
    });

    it.each([0, 1, MAX_PRICE_COEFFICIENT_MINOR])(
      "accepts an amount of %d, the bounds of the range",
      (amount) => {
        const result = applyChanges(PERCENTAGE_BOOK, [
          changeAt(amountField, amount),
        ]);

        expect(result.ok).toBe(true);
      },
    );

    const percentCases: readonly (readonly [
      string,
      BookFieldAddress,
      number,
      string,
    ])[] = [
      ["the depth rule above 100", { kind: "depth-rule" }, 101, "TOO_LARGE"],
      ["the depth rule below 0", { kind: "depth-rule" }, -1, "NEGATIVE"],
      [
        "the depth rule at a fraction",
        { kind: "depth-rule" },
        15.5,
        "NOT_A_WHOLE_NUMBER",
      ],
      [
        "the depth rule at negative zero",
        { kind: "depth-rule" },
        -0,
        "NEGATIVE",
      ],
      [
        "a material above 200",
        {
          kind: "material",
          tierId: upgradeMaterialId,
          field: "percentOfCabinets",
        },
        201,
        "TOO_LARGE",
      ],
      [
        "a material at a fraction",
        {
          kind: "material",
          tierId: upgradeMaterialId,
          field: "percentOfCabinets",
        },
        30.5,
        "NOT_A_WHOLE_NUMBER",
      ],
    ];

    it.each(percentCases)("refuses %s", (_title, address, value, code) => {
      expect(onlyRefusal(PERCENTAGE_BOOK, address, value)).toBe(`0:${code}`);
    });

    it.each([
      ["the depth rule at 0", { kind: "depth-rule" }, 0],
      ["the depth rule at 100", { kind: "depth-rule" }, 100],
      [
        "a material at 200",
        {
          kind: "material",
          tierId: upgradeMaterialId,
          field: "percentOfCabinets",
        },
        200,
      ],
    ] as const)(
      "accepts %s, the bounds of the range",
      (_title, address, value) => {
        expect(
          applyChanges(PERCENTAGE_BOOK, [changeAt(address, value)]).ok,
        ).toBe(true);
      },
    );

    it.each([undefined, null, 1, 0, "false", {}])(
      "refuses the provisional switch set to %p, which is not a boolean",
      (value) => {
        expect(
          onlyRefusal(PERCENTAGE_BOOK, { kind: "provisional" }, value),
        ).toBe("0:MISSING_VALUE");
      },
    );

    it.each([true, false])(
      "accepts the provisional switch set to %s",
      (value) => {
        const result = applyChanges(PERCENTAGE_BOOK, [
          changeAt({ kind: "provisional" }, value),
        ]);

        expect(appliedBook(result).amountsProvisional).toBe(value);
      },
    );
  });

  describe("as part of a bulk group", () => {
    it("accepts a cabinet price and a size under a group id", () => {
      const result = applyChanges(PERCENTAGE_BOOK, [
        changeAt(
          {
            kind: "cabinet",
            ruleId: anchoredRuleReading(PERCENTAGE_BOOK, "anchored-width")
              .ruleId,
            field: "anchorMinor",
          },
          110_000,
          "group-1",
        ),
        changeAt(
          {
            kind: "cabinet-size",
            ruleId: perSizeRuleOf(PERCENTAGE_BOOK).ruleId,
            widthMm: PER_SIZE_WIDTHS_MM[0],
          },
          120_000,
          "group-1",
        ),
      ]);

      expect(result.ok).toBe(true);
    });

    it.each([
      [
        "a hardware rate",
        {
          kind: "hardware",
          tierId: "hardware.standard",
          field: "perHingeMinor",
        } as BookFieldAddress,
        10,
        "group-1",
      ],
      [
        "a material percentage",
        {
          kind: "material",
          tierId: upgradeMaterialId,
          field: "percentOfCabinets",
        } as BookFieldAddress,
        10,
        "group-1",
      ],
      [
        "the depth rule",
        { kind: "depth-rule" } as BookFieldAddress,
        10,
        "group-1",
      ],
      [
        "the provisional switch",
        { kind: "provisional" } as BookFieldAddress,
        true,
        "group-1",
      ],
      [
        "a cabinet price with an empty group id",
        {
          kind: "cabinet",
          ruleId: rule.ruleId,
          field: "anchorMinor",
        } as BookFieldAddress,
        10,
        "",
      ],
      [
        "a cabinet price with a group id that is not a string",
        {
          kind: "cabinet",
          ruleId: rule.ruleId,
          field: "anchorMinor",
        } as BookFieldAddress,
        10,
        7,
      ],
    ])("refuses %s carrying a group id", (_title, address, value, groupId) => {
      const change = { address, value, groupId } as unknown as DraftChange;

      expect(refusalsOf(applyChanges(PERCENTAGE_BOOK, [change]))).toEqual([
        "0:NOT_EDITABLE",
      ]);
    });
  });

  it("keeps the applied address kinds as this literal, the list the creation, text and deletion kinds extend", () => {
    expect([...APPLIED_ADDRESS_KINDS]).toEqual([
      "cabinet",
      "cabinet-size",
      "hardware",
      "material",
      "depth-rule",
      "accessory",
      "provisional",
    ]);
  });

  it("keeps its closed list of refusal codes as this literal", () => {
    expect([...CHANGE_REFUSAL_CODES]).toEqual([
      "MISSING_VALUE",
      "NOT_A_WHOLE_NUMBER",
      "NEGATIVE",
      "TOO_LARGE",
      "UNKNOWN_ADDRESS",
      "UNKNOWN_RULE",
      "UNKNOWN_ITEM",
      "NOT_EDITABLE",
      "FIELD_NOT_ON_RULE",
    ]);
  });
});

describe("reverting a change", () => {
  const [firstSlot, secondSlot] = editSlotsOf(PERCENTAGE_BOOK);
  if (firstSlot === undefined || secondSlot === undefined)
    throw new Error("the fixture has too few slots");
  const first = changeOf({ slot: firstSlot, value: 11 });
  const second = changeOf({ slot: secondSlot, value: 22 });

  it("gives the active book back when the only change is reverted", () => {
    const draft = revertChange([first], first.address);

    expect(draft).toEqual([]);
    expect(appliedBook(applyChanges(PERCENTAGE_BOOK, draft))).toEqual(
      PERCENTAGE_BOOK,
    );
  });

  it("leaves the other change in effect when one of two is reverted", () => {
    const draft = revertChange([first, second], first.address);

    expect(draft).toEqual([second]);
    expect(appliedBook(applyChanges(PERCENTAGE_BOOK, draft))).toEqual(
      setSlots(PERCENTAGE_BOOK, [{ slot: secondSlot, value: 22 }]),
    );
  });

  it("finds the change by address however the address was written", () => {
    const reordered = JSON.parse(
      JSON.stringify(
        { ...first.address },
        Object.keys(first.address).reverse(),
      ),
    ) as BookFieldAddress;

    expect(revertChange([first, second], reordered)).toEqual([second]);
  });

  it("does not confuse two addresses that differ in one member", () => {
    const sibling = changeAt(
      {
        kind: "cabinet-size",
        ruleId: perSizeRuleOf(PERCENTAGE_BOOK).ruleId,
        widthMm: 400,
      },
      1,
    );
    const neighbour = changeAt(
      {
        kind: "cabinet-size",
        ruleId: perSizeRuleOf(PERCENTAGE_BOOK).ruleId,
        widthMm: 600,
      },
      2,
    );

    expect(revertChange([sibling, neighbour], sibling.address)).toEqual([
      neighbour,
    ]);
  });

  it("leaves the draft as it was when no change names the address", () => {
    expect(revertChange([first], second.address)).toEqual([first]);
  });
});
