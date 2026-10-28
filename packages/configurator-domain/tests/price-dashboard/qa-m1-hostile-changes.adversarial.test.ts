// M10 wave M1, adversarial QA: hostile and malformed changes, refusals that must not echo, the restore/apply contract on
// parser-valid books the dashboard's own rules would refuse, the A-7b boundary with M2, revert by address and the
// crash leads of `addressKey`. The expected book of a positive case is written by the oracle in `qa-m1-books.ts`.
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
import { diffBooks } from "../../src/price-dashboard/diff-books.js";
import { restoreChanges } from "../../src/price-dashboard/restore.js";
import { parsePriceBook } from "../../src/pricing/parse-price-book.js";
import type { PriceBook } from "../../src/pricing/price-book.js";

import {
  fixedBook,
  MAX_AMOUNT,
  must,
  slotsOf,
  valueAt,
  written,
} from "./qa-m1-books.js";

const BOOK = fixedBook();

/** A book stored before the cut-over states no depth rule (and its tiers state no percentage): the parser refuses it
 *  whole, so it can be read and listed but never edited, and nothing restores a form onto or off it. */
const LEGACY: PriceBook = (() => {
  const copy: { -readonly [K in keyof PriceBook]?: PriceBook[K] } =
    structuredClone(BOOK);
  delete copy.depthRule;
  return copy as PriceBook;
})();
const COVER: BookFieldAddress = {
  kind: "accessory",
  accessoryId: "sinkProtectiveCover",
  field: "perUnitMinor",
};

function refusalsOf(result: ApplyChangesResult): string[] {
  if (result.ok || result.reason !== "changes-refused") {
    throw new Error(`expected refused changes: ${JSON.stringify(result)}`);
  }
  return result.refusals.map(({ index, code }) => `${String(index)}:${code}`);
}

function hostile(change: unknown): readonly DraftChange[] {
  return [change as DraftChange];
}

function codeOf(book: PriceBook, change: unknown): string {
  return refusalsOf(applyChanges(book, hostile(change)))[0] ?? "";
}

function anyAnchoredRule(book: PriceBook): {
  readonly ruleId: string;
  readonly index: number;
} {
  const index = book.cabinetRules.findIndex(
    (rule) =>
      rule.suppliedBy !== "customer" && rule.formula.shape === "anchored-width",
  );
  const rule = book.cabinetRules[index];
  if (rule === undefined) throw new Error("no anchored-width rule");
  return { ruleId: rule.ruleId, index };
}

describe("restore and apply agree on every book the parser accepts (M1-a)", () => {
  // The contract, not a fix: either the parser refuses the archived book (nothing to restore), or restoring it onto the
  // active book gives a candidate that equals the archived values on every shared field. Today the parser accepts a
  // negative hardware rate and a negative accessory price while `judgeWholeNumber` refuses them as NEGATIVE, so the
  // restore of such a version is refused. Either side may move to close the gap.
  function expectRestoreHolds(archived: PriceBook): void {
    if (!parsePriceBook(archived).ok) return;
    const archivedValues = new Map(
      slotsOf(archived).map((found) => [found.key, valueAt(archived, found)]),
    );
    const expected = written(
      BOOK,
      slotsOf(BOOK).flatMap((found) => {
        const value = archivedValues.get(found.key);
        return value === undefined ? [] : [{ slot: found, value }];
      }),
    );

    const restored = applyChanges(BOOK, restoreChanges(archived, BOOK));

    expect(restored.ok ? restored.book : restored).toEqual(expected);
  }

  const archivedWith = (
    kind: "hardware" | "accessory",
    value: number,
  ): PriceBook =>
    written(BOOK, [
      {
        slot: must(slotsOf(BOOK).find((found) => found.address.kind === kind)),
        value,
      },
    ]);

  it.each([-1, -500, -MAX_AMOUNT])(
    "restores an archived book whose first hardware rate is %s, or the parser refuses that book",
    (value) => {
      expectRestoreHolds(archivedWith("hardware", value));
    },
  );

  it.each([-1, -500, -MAX_AMOUNT])(
    "restores an archived book whose first accessory price is %s, or the parser refuses that book",
    (value) => {
      expectRestoreHolds(archivedWith("accessory", value));
    },
  );

  it("restores an archived book at zero, which both sides accept (a control)", () => {
    expectRestoreHolds(archivedWith("hardware", 0));
    expectRestoreHolds(archivedWith("accessory", 0));
  });
});

describe("a change that is not a change", () => {
  const rule = anyAnchoredRule(BOOK);
  const valid = {
    address: { kind: "cabinet", ruleId: rule.ruleId, field: "anchorMinor" },
    value: 5_000,
  };

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 7],
    ["a string", "cabinet"],
    ["an array", [valid]],
    ["a function", () => valid],
    ["a symbol", Symbol("change")],
    ["an empty object", {}],
    ["a Map", new Map([["address", valid.address]])],
    ["an address that is a string", { address: "cabinet", value: 1 }],
    ["an address that is an array", { address: [valid.address], value: 1 }],
    ["an address with no kind", { address: { ruleId: rule.ruleId }, value: 1 }],
    ["an address with a numeric kind", { address: { kind: 7 }, value: 1 }],
    ["an address of an unknown kind", { address: { kind: "price" }, value: 1 }],
    [
      "an address of kind __proto__",
      { address: { kind: "__proto__" }, value: 1 },
    ],
    [
      "an address of kind constructor",
      { address: { kind: "constructor" }, value: 1 },
    ],
    [
      "an address of kind toString",
      { address: { kind: "toString" }, value: 1 },
    ],
  ])("refuses %s as UNKNOWN_ADDRESS", (_title, change) => {
    expect(codeOf(BOOK, change)).toBe("0:UNKNOWN_ADDRESS");
  });

  it("refuses each of a list of malformed changes by its own index and reports every one", () => {
    const list = [valid, null, valid, 7, { address: { kind: "x" } }];

    const result = applyChanges(BOOK, list as unknown as DraftChange[]);

    expect(refusalsOf(result)).toEqual([
      "1:UNKNOWN_ADDRESS",
      "3:UNKNOWN_ADDRESS",
      "4:UNKNOWN_ADDRESS",
    ]);
  });
});

describe("prototype pollution and names that exist on every object", () => {
  const polluted = (): boolean =>
    "polluted" in ({} as Record<string, unknown>) ||
    "anchorMinor" in ({} as Record<string, unknown>);

  it.each([
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "valueOf",
  ])("refuses the id or field %s without reaching the prototype", (name) => {
    const rule = anyAnchoredRule(BOOK);
    const cases: [string, unknown][] = [
      [
        "cabinet ruleId",
        { kind: "cabinet", ruleId: name, field: "anchorMinor" },
      ],
      ["cabinet field", { kind: "cabinet", ruleId: rule.ruleId, field: name }],
      [
        "cabinet-size ruleId",
        { kind: "cabinet-size", ruleId: name, widthMm: 600 },
      ],
      [
        "hardware tierId",
        { kind: "hardware", tierId: name, field: "perHingeMinor" },
      ],
      [
        "hardware field",
        { kind: "hardware", tierId: "hardware.standard", field: name },
      ],
      [
        "material tierId",
        { kind: "material", tierId: name, field: "percentOfCabinets" },
      ],
      [
        "material field",
        { kind: "material", tierId: "material.veneer", field: name },
      ],
      [
        "accessory id",
        { kind: "accessory", accessoryId: name, field: "perUnitMinor" },
      ],
      [
        "accessory field",
        { kind: "accessory", accessoryId: "sinkProtectiveCover", field: name },
      ],
    ];
    for (const [title, address] of cases) {
      const result = applyChanges(BOOK, hostile({ address, value: 1 }));

      expect(result.ok, title).toBe(false);
      expect(polluted(), title).toBe(false);
    }
  });

  it("treats a JSON __proto__ member as data: it neither widens the address nor pollutes", () => {
    const rule = anyAnchoredRule(BOOK);
    const parsed = JSON.parse(
      `{"address":{"kind":"cabinet","ruleId":"${rule.ruleId}","field":"anchorMinor","__proto__":{"kind":"provisional","polluted":true}},` +
        `"value":5000,"__proto__":{"value":1,"polluted":true},"groupId":"__proto__"}`,
    ) as DraftChange;

    const result = applyChanges(BOOK, [parsed]);

    expect(polluted()).toBe(false);
    expect(refusalsOf(result)).toEqual(["0:NOT_EDITABLE"]);
  });

  it("applies a value-carrying __proto__ member as an ordinary change when no group is named", () => {
    const rule = anyAnchoredRule(BOOK);
    const parsed = JSON.parse(
      `{"address":{"kind":"cabinet","ruleId":"${rule.ruleId}","field":"anchorMinor","__proto__":{"polluted":true}},` +
        `"value":5000,"__proto__":{"polluted":true}}`,
    ) as DraftChange;

    const result = applyChanges(BOOK, [parsed]);

    expect(polluted()).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("keeps a __proto__ group id as an ordinary group id in a diff and a revert", () => {
    const slot = must(
      slotsOf(BOOK).find((found) => found.address.kind === "cabinet"),
    );
    const after = written(BOOK, [{ slot, value: 1234 }]);
    const change = {
      address: slot.address,
      value: 1234,
      groupId: "__proto__",
      bulk: { percent: 5, scope: "all" },
    } as DraftChange;

    const rows = diffBooks(BOOK, after, { changes: [change] });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "group", groupId: "__proto__" });
    expect(polluted()).toBe(false);
  });
});

describe("hostile objects: proxies and members that change between reads", () => {
  const rule = anyAnchoredRule(BOOK);
  const customerRule = must(
    BOOK.cabinetRules.find((row) => row.suppliedBy === "customer"),
  );

  it("never writes a field it did not judge: an address whose members change after the first reads", () => {
    // Defence in depth: stored JSON cannot be a Proxy. The updater re-reads `address.*` when it runs, after the
    // judgement; a member that reads differently the second time must not turn a judged edit into another.
    const reads = new Map<string, number>();
    const address = new Proxy(
      { kind: "cabinet", ruleId: rule.ruleId, field: "anchorMinor" },
      {
        get(target, key) {
          const count = (reads.get(String(key)) ?? 0) + 1;
          reads.set(String(key), count);
          if (key === "ruleId" && count > 2) return customerRule.ruleId;
          return Reflect.get(target, key) as unknown;
        },
      },
    );

    const result = applyChanges(BOOK, hostile({ address, value: 777 }));

    const customerAfter = result.ok
      ? result.book.cabinetRules.find(
          (row) => row.ruleId === customerRule.ruleId,
        )
      : customerRule;
    expect(JSON.stringify(customerAfter)).toBe(JSON.stringify(customerRule));
  });

  it("never writes a non-editable field when the field member switches after the judgement", () => {
    const reads = { count: 0 };
    const address = new Proxy(
      { kind: "cabinet", ruleId: rule.ruleId, field: "anchorMinor" },
      {
        get(target, key) {
          if (key === "field") {
            reads.count += 1;
            return reads.count > 3 ? "anchorWidthMm" : "anchorMinor";
          }
          return Reflect.get(target, key) as unknown;
        },
      },
    );

    const result = applyChanges(BOOK, hostile({ address, value: 50 }));

    const row = result.ok
      ? result.book.cabinetRules.find(
          (candidate) => candidate.ruleId === rule.ruleId,
        )
      : undefined;
    const original = must(BOOK.cabinetRules[rule.index]);
    if (row !== undefined) {
      expect((row.formula as { anchorWidthMm: number }).anchorWidthMm).toBe(
        (original.formula as { anchorWidthMm: number }).anchorWidthMm,
      );
    }
  });

  it("ignores members a change does not define and copies none into the book", () => {
    const change = {
      address: { kind: "provisional", payload: "x", value: false, extra: 1 },
      value: false,
      note: "free text",
      amountMinor: 9,
      __secret: { deep: true },
    };

    const result = applyChanges(BOOK, hostile(change));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.stringify(result.book)).not.toContain("free text");
      expect(JSON.stringify(result.book)).not.toContain("__secret");
      expect(result.book).toEqual(
        written(BOOK, [
          {
            slot: must(
              slotsOf(BOOK).find(
                (found) => found.address.kind === "provisional",
              ),
            ),
            value: false,
          },
        ]),
      );
    }
  });

  it("does not let a class instance with an own toJSON or an inherited address change the outcome", () => {
    class Change {
      public readonly address = {
        kind: "provisional",
      };
      public readonly value = false;
      public toJSON(): unknown {
        return { address: { kind: "depth-rule" }, value: 5 };
      }
    }

    const result = applyChanges(BOOK, hostile(new Change()));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.book.depthRule).toEqual(BOOK.depthRule);
  });
});

describe("the list of changes itself", () => {
  it("applies a huge list of one repeated change as one change, quickly", () => {
    const slot = must(
      slotsOf(BOOK).find((found) => found.address.kind === "depth-rule"),
    );
    const change = { address: slot.address, value: 33 } as DraftChange;
    const changes = Array.from({ length: 200_000 }, () => change);
    const startedAt = Date.now();

    const result = applyChanges(BOOK, changes);

    expect(result.ok && result.book.depthRule.deepCabinetPercent).toBe(33);
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });

  it("reports a huge list of refused changes one refusal each, in order, without a stack overflow", () => {
    const bad = { address: { kind: "depth-rule" }, value: 101 };
    const changes = Array.from(
      { length: 100_000 },
      () => bad,
    ) as unknown as DraftChange[];

    const result = applyChanges(BOOK, changes);

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "changes-refused") {
      expect(result.refusals).toHaveLength(100_000);
      expect(
        result.refusals.every(
          (r, index) => r.index === index && r.code === "TOO_LARGE",
        ),
      ).toBe(true);
    }
  });

  it("applies a long list of different valid changes of every field in order", () => {
    const slots = slotsOf(BOOK);
    const edits = slots.map((slot, index) => ({
      slot,
      value: slot.unit === "flag" ? index % 2 === 0 : index % (slot.max + 1),
    }));
    const changes = edits.map(
      ({ slot, value }) => ({ address: slot.address, value }) as DraftChange,
    );

    const result = applyChanges(BOOK, changes);

    expect(result.ok && result.book).toEqual(written(BOOK, edits));
  });
});

describe("a refusal never echoes what was submitted", () => {
  const SECRET_NUMBER = 987_654_321_012;
  const SECRET_TEXT = "SECRET-TEXT-8c1f";
  const rule = anyAnchoredRule(BOOK);

  it("names only an index and a closed code, for every value the module refuses", () => {
    const values: unknown[] = [
      SECRET_NUMBER * 10_000,
      -SECRET_NUMBER,
      SECRET_NUMBER + 0.5,
      SECRET_TEXT,
      { secret: SECRET_TEXT },
      [SECRET_TEXT],
      null,
      undefined,
    ];
    for (const value of values) {
      const result = applyChanges(
        BOOK,
        hostile({
          address: {
            kind: "cabinet",
            ruleId: rule.ruleId,
            field: "anchorMinor",
          },
          value,
        }),
      );
      const json = JSON.stringify(result);

      expect(json).not.toContain(SECRET_TEXT);
      expect(json).not.toContain(String(SECRET_NUMBER));
      expect(Object.keys(result).sort()).toEqual(["ok", "reason", "refusals"]);
    }
  });

  it("does not echo a submitted id, field, group id or bulk member either", () => {
    const addresses: unknown[] = [
      { kind: "cabinet", ruleId: SECRET_TEXT, field: "anchorMinor" },
      { kind: "cabinet", ruleId: rule.ruleId, field: SECRET_TEXT },
      { kind: SECRET_TEXT },
      { kind: "hardware", tierId: SECRET_TEXT, field: "perHingeMinor" },
      { kind: "accessory", accessoryId: SECRET_TEXT, field: "perUnitMinor" },
    ];
    const results = [
      ...addresses.map((address) =>
        applyChanges(BOOK, hostile({ address, value: SECRET_NUMBER })),
      ),
      applyChanges(
        BOOK,
        hostile({
          address: {
            kind: "cabinet",
            ruleId: rule.ruleId,
            field: "anchorMinor",
          },
          value: 1,
          groupId: SECRET_TEXT,
          bulk: {
            percent: SECRET_NUMBER + 0.5,
            scope: SECRET_TEXT,
            groupCode: SECRET_TEXT,
          },
        }),
      ),
    ];

    for (const result of results) {
      const json = JSON.stringify(result);
      expect(json).not.toContain(SECRET_TEXT);
      expect(json).not.toContain(String(SECRET_NUMBER));
    }
  });
});

describe("the group a change claims (A-14)", () => {
  const rule = anyAnchoredRule(BOOK);
  const bulk = { percent: 5, scope: "all" };
  const cabinet = (extra: object): DraftChange =>
    ({
      address: { kind: "cabinet", ruleId: rule.ruleId, field: "anchorMinor" },
      value: 1000,
      ...extra,
    }) as DraftChange;

  it.each([
    [
      "a hardware rate",
      { kind: "hardware", tierId: "hardware.standard", field: "perHingeMinor" },
    ],
    [
      "a material percentage",
      {
        kind: "material",
        tierId: "material.veneer",
        field: "percentOfCabinets",
      },
    ],
    ["the depth rule", { kind: "depth-rule" }],
    ["an accessory price", COVER],
    ["the provisional flag", { kind: "provisional" }],
  ])("refuses %s in a group", (_title, address) => {
    const value =
      (address as { kind: string }).kind === "provisional" ? true : 1;
    const change = {
      address,
      value,
      groupId: "g",
      bulk,
    } as unknown as DraftChange;

    expect(refusalsOf(applyChanges(BOOK, [change]))).toEqual([
      "0:NOT_EDITABLE",
    ]);
  });

  it("takes a cabinet price and a fixed size in one group: the mixed kinds a bulk action touches", () => {
    const perSize = BOOK.cabinetRules.find(
      (row) => row.formula.shape === "price-per-size",
    );
    if (perSize === undefined || perSize.formula.shape !== "price-per-size") {
      throw new Error("no fixed-size rule");
    }
    const size = must(perSize.formula.sizes[0]);

    const result = applyChanges(BOOK, [
      cabinet({ groupId: "g", bulk }),
      {
        address: {
          kind: "cabinet-size",
          ruleId: perSize.ruleId,
          widthMm: size.widthMm,
        },
        value: 2000,
        groupId: "g",
        bulk,
      } as DraftChange,
    ]);

    expect(result.ok).toBe(true);
  });

  it("refuses a group whose member is a hardware rate even beside valid cabinet members, by index", () => {
    const result = applyChanges(BOOK, [
      cabinet({ groupId: "g", bulk }),
      {
        address: {
          kind: "hardware",
          tierId: "hardware.standard",
          field: "perHingeMinor",
        },
        value: 5,
        groupId: "g",
        bulk,
      } as DraftChange,
      cabinet({ groupId: "g", bulk }),
    ]);

    expect(refusalsOf(result)).toEqual(["1:NOT_EDITABLE"]);
  });

  it.each([
    ["an empty id", ""],
    ["a number", 7],
    ["null", null],
    ["an object", {}],
    ["a 65-character id", "g".repeat(65)],
  ])("refuses %s as a group id", (_title, groupId) => {
    expect(
      refusalsOf(applyChanges(BOOK, [cabinet({ groupId, bulk })])),
    ).toEqual(["0:NOT_EDITABLE"]);
  });

  it("takes a 64-character group id and refuses 65, the identifier bound", () => {
    expect(
      applyChanges(BOOK, [cabinet({ groupId: "g".repeat(64), bulk })]).ok,
    ).toBe(true);
    expect(
      refusalsOf(
        applyChanges(BOOK, [cabinet({ groupId: "g".repeat(65), bulk })]),
      ),
    ).toEqual(["0:NOT_EDITABLE"]);
  });

  it("refuses a group id with no bulk, and a bulk with no group id", () => {
    expect(refusalsOf(applyChanges(BOOK, [cabinet({ groupId: "g" })]))).toEqual(
      ["0:NOT_EDITABLE"],
    );
    expect(refusalsOf(applyChanges(BOOK, [cabinet({ bulk })]))).toEqual([
      "0:NOT_EDITABLE",
    ]);
  });

  it("refuses a group whose changes disagree about what the action was", () => {
    const result = applyChanges(BOOK, [
      cabinet({ groupId: "g", bulk }),
      cabinet({ groupId: "g", bulk: { percent: 6, scope: "all" } }),
    ]);

    expect(refusalsOf(result)).toEqual(["1:NOT_EDITABLE"]);
  });

  it.each([
    [
      "a fractional percent",
      { percent: 2.5, scope: "all" },
      "NOT_A_WHOLE_NUMBER",
    ],
    ["a string percent", { percent: "5", scope: "all" }, "NOT_A_WHOLE_NUMBER"],
    [
      "a NaN percent",
      { percent: Number.NaN, scope: "all" },
      "NOT_A_WHOLE_NUMBER",
    ],
    [
      "an infinite percent",
      { percent: Infinity, scope: "all" },
      "NOT_A_WHOLE_NUMBER",
    ],
    ["a -0 percent", { percent: -0, scope: "all" }, "NEGATIVE"],
    ["an unknown scope", { percent: 5, scope: "everything" }, "NOT_EDITABLE"],
    [
      "a group scope with no group code",
      { percent: 5, scope: "group" },
      "NOT_EDITABLE",
    ],
    [
      "a group code on a scope that is not a group",
      { percent: 5, scope: "all", groupCode: "base" },
      "NOT_EDITABLE",
    ],
    [
      "an unknown group code",
      { percent: 5, scope: "group", groupCode: "island" },
      "NOT_EDITABLE",
    ],
    [
      "an extra member",
      { percent: 5, scope: "all", note: "x" },
      "NOT_EDITABLE",
    ],
    ["no percent", { scope: "all" }, "NOT_A_WHOLE_NUMBER"],
    ["a bulk that is a string", "5%", "NOT_EDITABLE"],
  ])("refuses a bulk with %s", (_title, badBulk, code) => {
    const result = applyChanges(BOOK, [
      cabinet({ groupId: "g", bulk: badBulk }),
    ]);

    expect(refusalsOf(result)).toEqual([`0:${code}`]);
  });

  it("takes a negative whole percent and a group scope with its code", () => {
    expect(
      applyChanges(BOOK, [
        cabinet({ groupId: "g", bulk: { percent: -40, scope: "all" } }),
      ]).ok,
    ).toBe(true);
    expect(
      applyChanges(BOOK, [
        cabinet({
          groupId: "g",
          bulk: { percent: 5, scope: "group", groupCode: "wall" },
        }),
      ]).ok,
    ).toBe(true);
  });

  it("refuses a customer-supplied row in a group, whatever its group id", () => {
    const customer = must(
      BOOK.cabinetRules.find((row) => row.suppliedBy === "customer"),
    );
    const change = {
      address: {
        kind: "cabinet",
        ruleId: customer.ruleId,
        field: "anchorMinor",
      },
      value: 1,
      groupId: "g",
      bulk,
    } as unknown as DraftChange;

    expect(refusalsOf(applyChanges(BOOK, [change]))).toEqual([
      "0:NOT_EDITABLE",
    ]);
  });
});

describe("A-7b: a candidate the parser accepts but the grid would price at or below zero", () => {
  it("is left to M2-b2: applyChanges returns the book (the judgement is judgeBookAgainstCatalog's)", () => {
    // Anchor 600 @ 100 000, narrower 30 000 per step: 200 mm prices 100 000 - 8 x 30 000 < 0 (the coordinator's witness).
    const { ruleId } = anyAnchoredRule(BOOK);
    const slotFor = (field: string) =>
      must(
        slotsOf(BOOK).find(
          (found) =>
            found.address.kind === "cabinet" &&
            found.address.ruleId === ruleId &&
            found.address.field === field,
        ),
      );

    const result = applyChanges(BOOK, [
      {
        address: slotFor("anchorMinor").address,
        value: 100_000,
      } as DraftChange,
      {
        address: slotFor("perStepNarrowerMinor").address,
        value: 30_000,
      } as DraftChange,
    ]);

    expect(result.ok).toBe(true);
  });

  it("accepts a book every cabinet price of which is zero: the sign of a grid price is not M1's", () => {
    const edits = slotsOf(BOOK)
      .filter(
        (found) =>
          found.address.kind === "cabinet" ||
          found.address.kind === "cabinet-size",
      )
      .map((slot) => ({ slot, value: 0 }));

    const result = applyChanges(
      BOOK,
      edits.map(
        ({ slot, value }) => ({ address: slot.address, value }) as DraftChange,
      ),
    );

    expect(result.ok).toBe(true);
  });
});

describe("reverting a change", () => {
  const draft = (): DraftChange[] => [
    { address: COVER, value: 1 },
    { address: { kind: "provisional" }, value: false },
    { address: COVER, value: 2 },
  ];

  it("returns the draft as it was when the address is not in it, without mutating it", () => {
    const changes = Object.freeze(draft());

    const reverted = revertChange(changes, {
      kind: "accessory",
      accessoryId: "dishDryingRack",
      field: "perUnitMinor",
    });

    expect(reverted).toEqual(changes);
  });

  it("returns an empty draft for an empty draft", () => {
    expect(revertChange([], COVER)).toEqual([]);
  });

  it("removes every change of the address, wherever its members are written in the object", () => {
    const reordered = {
      field: "perUnitMinor",
      accessoryId: "sinkProtectiveCover",
      kind: "accessory",
    } as BookFieldAddress;

    expect(revertChange(draft(), reordered)).toEqual([
      { address: { kind: "provisional" }, value: false },
    ]);
  });

  it("does not remove a change of another field of the same row, nor of another kind", () => {
    const rule = anyAnchoredRule(BOOK);
    const changes: DraftChange[] = [
      {
        address: { kind: "cabinet", ruleId: rule.ruleId, field: "anchorMinor" },
        value: 1,
      },
      {
        address: {
          kind: "cabinet",
          ruleId: rule.ruleId,
          field: "perStepWiderMinor",
        },
        value: 2,
      },
    ];

    expect(
      revertChange(changes, {
        kind: "cabinet",
        ruleId: rule.ruleId,
        field: "anchorMinor",
      }),
    ).toEqual([changes[1]]);
  });

  it("does not confuse the ids 'a|b' and 'a','b', nor a width 600 and '600'", () => {
    const changes = [
      {
        address: { kind: "cabinet-size", ruleId: "r", widthMm: 600 },
        value: 1,
      },
      {
        address: { kind: "cabinet-size", ruleId: "r", widthMm: "600" },
        value: 2,
      },
      {
        address: { kind: "cabinet", ruleId: 'a","b', field: "anchorMinor" },
        value: 3,
      },
    ] as unknown as DraftChange[];

    expect(
      revertChange(changes, {
        kind: "cabinet-size",
        ruleId: "r",
        widthMm: 600,
      }),
    ).toEqual([changes[1], changes[2]]);
  });

  it("keeps a bulk group's other members when one member is reverted", () => {
    const rule = anyAnchoredRule(BOOK);
    const bulk = { percent: 5, scope: "all" };
    const changes = [
      "anchorMinor",
      "perStepWiderMinor",
      "perStepNarrowerMinor",
    ].map(
      (field) =>
        ({
          address: { kind: "cabinet", ruleId: rule.ruleId, field },
          value: 9,
          groupId: "g",
          bulk,
        }) as DraftChange,
    );

    const reverted = revertChange(changes, must(changes[1]).address);

    expect(reverted).toEqual([changes[0], changes[2]]);
  });
});

describe("addresses of the M4 kinds in the lists M1 reads", () => {
  const withoutItem = { kind: "item-deleted" } as unknown as BookFieldAddress;
  const textWithoutItem = {
    kind: "created-row-text",
    field: "name",
  } as unknown as BookFieldAddress;

  it("revertChange does not throw on a stored change whose M4 address lacks its item", () => {
    const changes = [
      { address: withoutItem, value: true },
      { address: textWithoutItem, value: "x" },
      { address: { kind: "provisional" }, value: true },
    ] as unknown as DraftChange[];

    expect(() => revertChange(changes, { kind: "provisional" })).not.toThrow();
    expect(() => revertChange(changes, withoutItem)).not.toThrow();
  });

  it("diffBooks does not throw when the changes it is given hold such an address", () => {
    const changes = [
      { address: withoutItem, value: true },
    ] as unknown as DraftChange[];

    expect(() => diffBooks(BOOK, BOOK, { changes })).not.toThrow();
  });

  it("refuses the M4 kinds as NOT_EDITABLE with a group id too, and reports one refusal for each", () => {
    const changes = [
      {
        address: {
          kind: "item-deleted",
          item: { kind: "hardware", tierId: "hardware.standard" },
        },
        value: true,
      },
      {
        address: { kind: "hardware-tier-created", tierId: "t" },
        value: { name: "a", description: "b" },
      },
    ] as unknown as DraftChange[];

    expect(refusalsOf(applyChanges(BOOK, changes))).toEqual([
      "0:NOT_EDITABLE",
      "1:NOT_EDITABLE",
    ]);
  });
});

describe("restore between books that differ in the rows they state", () => {
  it("makes no change for a field only one book states, in either direction, and still applies", () => {
    const withTier = BOOK;
    const { book: fewerTiers } = trimmedTiers(withTier);

    const toFewer = restoreChanges(fewerTiers, withTier);
    const toMore = restoreChanges(withTier, fewerTiers);

    expect(applyChanges(withTier, toFewer).ok).toBe(true);
    expect(applyChanges(fewerTiers, toMore).ok).toBe(true);
    for (const change of [...toFewer, ...toMore]) {
      expect([
        "hardware",
        "cabinet",
        "cabinet-size",
        "material",
        "accessory",
        "depth-rule",
        "provisional",
      ]).toContain(change.address.kind);
    }
  });

  it("never carries the depth rule onto or off a book that states none: the form is not restorable", () => {
    const changesToLegacy = restoreChanges(LEGACY, BOOK);
    const changesFromLegacy = restoreChanges(BOOK, LEGACY);

    const toLegacy = applyChanges(BOOK, changesToLegacy);
    const fromLegacy = applyChanges(LEGACY, changesFromLegacy);

    // Restoring towards a book without the rule leaves the rule where it is...
    expect(toLegacy.ok && toLegacy.book.depthRule).toEqual(BOOK.depthRule);
    // ...and a book without one is refused whole as a candidate, so nothing is ever written onto it.
    expect(fromLegacy).toMatchObject({
      ok: false,
      reason: "candidate-refused",
      failure: { code: "INVALID_PRICE_BOOK" },
    });
    expect(
      [...changesToLegacy, ...changesFromLegacy].every(
        (c) => c.address.kind !== "depth-rule" && c.address.kind !== "material",
      ),
    ).toBe(true);
  });

  it("does not restore across a changed default material tier: the old default is 0 % and has no address", () => {
    const material = BOOK.material;
    const other = must(
      material.tiers.find((tier) => tier.tierId !== material.defaultTierId),
    );
    const swapped = {
      ...BOOK,
      material: {
        defaultTierId: other.tierId,
        tiers: material.tiers.map((tier) => ({
          ...tier,
          percentOfCabinets:
            tier.tierId === other.tierId
              ? 0
              : tier.tierId === material.defaultTierId
                ? 40
                : (tier as { percentOfCabinets: number }).percentOfCabinets,
        })),
      },
    } as unknown as PriceBook;
    expect(parsePriceBook(swapped).ok).toBe(true);

    const toSwapped = applyChanges(BOOK, restoreChanges(swapped, BOOK));
    const fromSwapped = applyChanges(swapped, restoreChanges(BOOK, swapped));

    expect(toSwapped.ok).toBe(true);
    expect(fromSwapped.ok).toBe(true);
    expect(toSwapped.ok && toSwapped.book.material.defaultTierId).toBe(
      material.defaultTierId,
    );
  });
});

describe("the wire's closed amount ceiling is the parser's", () => {
  it("accepts the largest amount and refuses the next, at a field of each kind", () => {
    const edits = slotsOf(BOOK).filter((found) => found.unit === "amount");
    for (const slot of edits) {
      const change = (value: number): DraftChange =>
        ({ address: slot.address, value }) as DraftChange;

      expect(applyChanges(BOOK, [change(MAX_AMOUNT)]).ok).toBe(true);
      expect(refusalsOf(applyChanges(BOOK, [change(MAX_AMOUNT + 1)]))).toEqual([
        "0:TOO_LARGE",
      ]);
    }
  });
});

function trimmedTiers(book: PriceBook): { readonly book: PriceBook } {
  const keep = book.hardware.tiers.slice(0, 1);
  return {
    book: {
      ...book,
      hardware: { defaultTierId: must(keep[0]).tierId, tiers: keep },
    } as PriceBook,
  };
}

describe("a group row carries the bulk as stored, never one derived from the amounts", () => {
  const rule = anyAnchoredRule(BOOK);
  const fields = [
    "anchorMinor",
    "perStepWiderMinor",
    "perStepNarrowerMinor",
  ] as const;
  const slotOfField = (field: string) =>
    must(
      slotsOf(BOOK).find(
        (found) =>
          found.address.kind === "cabinet" &&
          found.address.ruleId === rule.ruleId &&
          found.address.field === field,
      ),
    );

  it("copies the first change's bulk of the group, with the group's scope and code", () => {
    const bulk = { percent: -13, scope: "group", groupCode: "wall" };
    const edits = fields.map((field) => ({
      slot: slotOfField(field),
      value: 4_321,
    }));
    const after = written(BOOK, edits);
    const changes = edits.map(
      ({ slot, value }) =>
        ({ address: slot.address, value, groupId: "g", bulk }) as DraftChange,
    );

    const rows = diffBooks(BOOK, after, { changes });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "group",
      bulk,
      amountCount: 3,
      ruleCount: 1,
    });
  });

  it("names no bulk on a group whose changes carry none", () => {
    const edits = fields.map((field) => ({
      slot: slotOfField(field),
      value: 4_321,
    }));
    const after = written(BOOK, edits);
    const changes = edits.map(
      ({ slot, value }) =>
        ({ address: slot.address, value, groupId: "g" }) as DraftChange,
    );

    const rows = diffBooks(BOOK, after, { changes });

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("bulk");
  });
});

describe("the fixes of the QA round hold their edges", () => {
  const draft: DraftChange[] = [
    { address: COVER, value: 1 },
    { address: { kind: "provisional" }, value: false },
  ];

  it("refuses a hole in a sparse list by its index and applies nothing", () => {
    const sparse: unknown[] = [];
    sparse[0] = draft[0];
    sparse[2] = draft[1];

    const result = applyChanges(BOOK, sparse as DraftChange[]);

    expect(refusalsOf(result)).toEqual(["1:MISSING_VALUE"]);
  });

  it("reverts by an invalid address without removing any valid change", () => {
    const invalid = [
      undefined,
      null,
      "cabinet",
      {},
      { kind: "item-deleted" },
      { kind: "cabinet", ruleId: 7 },
    ] as unknown as BookFieldAddress[];

    for (const address of invalid) {
      expect(revertChange(draft, address)).toEqual(draft);
    }
  });

  it("keeps two addresses of different kinds apart when both are incomplete", () => {
    const changes = [
      { address: { kind: "item-deleted" }, value: true },
      { address: { kind: "created-row-text", field: "name" }, value: "x" },
    ] as unknown as DraftChange[];

    expect(revertChange(changes, { kind: "item-deleted" } as never)).toEqual([
      changes[1],
    ]);
  });

  it("takes an address with inherited members as it did not before: only own members are read", () => {
    const rule = anyAnchoredRule(BOOK);
    const inherited = Object.create({
      kind: "cabinet",
      ruleId: rule.ruleId,
      field: "anchorMinor",
    }) as BookFieldAddress;

    expect(codeOf(BOOK, { address: inherited, value: 5 })).toBe(
      "0:UNKNOWN_ADDRESS",
    );
  });
});

describe("a tier rate the parser refuses is named by its tier and its field (the intent of the moved pricing tests)", () => {
  it.each(["perHingeMinor", "perDrawerMinor", "perPushToOpenMinor"])(
    "names the default hardware tier and %s when the rate is fractional or negative",
    (field) => {
      for (const amount of [0.25, -1]) {
        const tiers = BOOK.hardware.tiers.map((tier) =>
          tier.tierId === BOOK.hardware.defaultTierId
            ? { ...tier, [field]: amount }
            : tier,
        );

        const result = parsePriceBook({
          ...BOOK,
          hardware: { ...BOOK.hardware, tiers },
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.failure.detail).toContain(field);
        expect(result.failure.detail).toContain(BOOK.hardware.defaultTierId);
      }
    },
  );

  it("refuses a fractional accessory price, naming the accessory", () => {
    const result = parsePriceBook({
      ...BOOK,
      accessories: {
        ...BOOK.accessories,
        sinkProtectiveCover: {
          ...BOOK.accessories.sinkProtectiveCover,
          perUnitMinor: 0.5,
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.failure.detail).toContain("sinkProtectiveCover");
  });
});

describe("a stored -0 is restored as 0", () => {
  it("applies the restore of an archived book that holds -0 in a rate, and the result holds 0", () => {
    const slot = must(
      slotsOf(BOOK).find((found) => found.address.kind === "hardware"),
    );
    const archived = written(BOOK, [{ slot, value: -0 }]);

    const restored = applyChanges(BOOK, restoreChanges(archived, BOOK));

    expect(restored.ok).toBe(true);
    if (restored.ok)
      expect(Object.is(valueAt(restored.book, slot), -0)).toBe(false);
  });
});
