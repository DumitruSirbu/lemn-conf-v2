// M10 M4 adversarial QA: the rows `diffBooks` draws for a created, deleted or reworded row, the address that reverts
// each, `restoreChanges` between books that differ in rows, and the linked accessory's price as an editable field.
// The expected rows are worked out here from the books' own arrays, not by the diff's walker.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { addressKey } from "../../src/price-dashboard/address-key.js";
import {
  applyChanges,
  revertChange,
} from "../../src/price-dashboard/apply-changes.js";
import type { DraftChange } from "../../src/price-dashboard/book-field-address.js";
import {
  DIFF_SECTIONS,
  diffBooks,
  type BookDiffRow,
} from "../../src/price-dashboard/diff-books.js";
import { readEditableFields } from "../../src/price-dashboard/editable-fields.js";
import { restoreChanges } from "../../src/price-dashboard/restore.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import {
  bookWithLinked,
  linkedRule,
} from "../support/linked-accessory-books.js";

import { must } from "./qa-m1-books.js";
import { deepFrozen, elementAt } from "./qa-m3-support.js";
import {
  aDraft,
  accessoryItem,
  applied,
  BASE,
  createAccessory,
  createdAndDeletedIn,
  createTier,
  deleteItem,
  hardwareItem,
  allRates,
  materialItem,
  RATE_FIELDS,
  rewordRow,
  setAccessoryPrice,
  setRate,
  statedRowsOf,
  tierDraft,
} from "./qa-m4-support.js";

const RUNS = 200;
const SEED = 20261102;
const WITH_ORGANISER = bookWithLinked(
  [linkedRule("organiser", { description: "Pentru sertar." })],
  BASE,
);

function diffOf(
  base: PriceBook,
  draft: readonly DraftChange[],
): readonly BookDiffRow[] {
  return diffBooks(base, applied(base, draft), { changes: draft });
}

function itemKey(item: ItemRef): string {
  return JSON.stringify(item);
}

const absent = { kind: "absent" } as const;

function isFieldAddress(address: { readonly kind: string }): boolean {
  return ["hardware", "material", "accessory"].includes(address.kind);
}

/** The slot a field row or change names: its kind, the row it is on, and the field. */
function fieldKeyOf(address: { readonly kind: string }): string {
  const named = address as Record<string, unknown>;
  return JSON.stringify([
    named["kind"],
    named["tierId"] ?? named["accessoryId"],
    named["field"],
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Every row, and every field that differs, over drafts in any order

describe("over drafts of creations, words, prices and deletions", () => {
  /** What the books say should be drawn, from their own arrays: a numeric slot per (kind, row, field). */
  function slotsOf(book: PriceBook): ReadonlyMap<string, number> {
    const slots = new Map<string, number>();
    for (const row of statedRowsOf(book)) {
      for (const [field, value] of Object.entries(row.fields)) {
        if (typeof value === "number")
          slots.set(
            JSON.stringify([row.item.kind, rowId(row.item), field]),
            value,
          );
      }
    }
    return slots;
  }

  function rowId(item: ItemRef): string {
    if (item.kind === "accessory") return item.accessoryId;
    return item.kind === "hardware" || item.kind === "material"
      ? item.tierId
      : "";
  }

  function textOf(book: PriceBook): ReadonlyMap<string, string | undefined> {
    const texts = new Map<string, string | undefined>();
    for (const row of statedRowsOf(book)) {
      if (row.item.kind === "material") continue;
      for (const field of ["name", "description"] as const) {
        const value = row.fields[field];
        texts.set(
          JSON.stringify([row.item.kind, rowId(row.item), field]),
          typeof value === "string" ? value : undefined,
        );
      }
    }
    return texts;
  }

  it("draws a row for each row created or deleted, and for every field that differs, and for nothing else", () => {
    fc.assert(
      fc.property(aDraft, (draft) => {
        const result = applyChanges(BASE, draft);
        fc.pre(result.ok);
        const rows = diffBooks(BASE, result.book, { changes: draft });
        const before = slotsOf(BASE);
        const after = slotsOf(result.book);
        const named = new Set(
          draft.flatMap((change) =>
            isFieldAddress(change.address) ? [fieldKeyOf(change.address)] : [],
          ),
        );

        const fieldRows = rows.flatMap((row) =>
          row.kind === "field" && isFieldAddress(row.address) ? [row] : [],
        );
        const drawn = new Map(
          fieldRows.map((row) => [fieldKeyOf(row.address), row]),
        );
        const expectedKeys = [...new Set([...before.keys(), ...after.keys()])]
          .filter((key) => before.get(key) !== after.get(key) || named.has(key))
          .sort();

        expect([...drawn.keys()].sort()).toEqual(expectedKeys);
        expect(drawn.size).toBe(fieldRows.length);
        for (const [key, row] of drawn) {
          expect(row.before).toEqual(before.get(key) ?? absent);
          expect(row.after).toEqual(after.get(key) ?? absent);
        }
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("draws a creation row for each class and accessory the book gains and a deletion row for each it loses", () => {
    fc.assert(
      fc.property(aDraft, (draft) => {
        const result = applyChanges(BASE, draft);
        fc.pre(result.ok);
        const rows = diffBooks(BASE, result.book, { changes: draft });
        const gained = createdAndDeletedIn(BASE, result.book);
        const lostMaterials = BASE.material.tiers
          .filter(
            (tier) =>
              !result.book.material.tiers.some(
                (kept) => kept.tierId === tier.tierId,
              ),
          )
          .map((tier) => itemKey(materialItem(tier.tierId)));
        const structural = rows.flatMap((row) =>
          row.kind === "row" ? [row] : [],
        );

        expect(
          structural
            .filter((row) => row.change === "created")
            .map((row) => itemKey(row.item))
            .sort(),
        ).toEqual(gained.created);
        expect(
          structural
            .filter((row) => row.change === "deleted")
            .map((row) => itemKey(row.item))
            .sort(),
        ).toEqual([...gained.deleted, ...lostMaterials].sort());
        for (const row of structural) {
          expect(row.address).toEqual({
            kind:
              row.change === "deleted"
                ? "item-deleted"
                : row.item.kind === "hardware"
                  ? "hardware-tier-created"
                  : "accessory-created",
            ...(row.change === "deleted"
              ? { item: row.item }
              : row.item.kind === "hardware"
                ? { tierId: row.item.tierId }
                : {
                    accessoryId: (row.item as { accessoryId: string })
                      .accessoryId,
                  }),
          });
        }
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("draws a text row for a field of a row both books state, where it differs or a change names it, with the text on each side", () => {
    fc.assert(
      fc.property(aDraft, (draft) => {
        const result = applyChanges(BASE, draft);
        fc.pre(result.ok);
        const rows = diffBooks(BASE, result.book, { changes: draft });
        const before = textOf(BASE);
        const after = textOf(result.book);
        const named = new Set(
          draft.flatMap((change) => {
            const { address } = change as {
              address: { kind: string; item?: ItemRef; field?: string };
            };
            const item = address.item;
            return address.kind === "created-row-text" && item !== undefined
              ? [
                  JSON.stringify([
                    item.kind,
                    item.kind === "accessory"
                      ? item.accessoryId
                      : (item as { tierId: string }).tierId,
                    address.field,
                  ]),
                ]
              : [];
          }),
        );
        const shared = [...before.keys()].filter((key) => after.has(key));
        const expectedKeys = shared
          .filter((key) => before.get(key) !== after.get(key) || named.has(key))
          .sort();

        const textRows = rows.flatMap((row) =>
          row.kind === "text" ? [row] : [],
        );
        const drawn = new Map(
          textRows.map((row) => [
            JSON.stringify([
              row.item.kind,
              row.item.kind === "accessory"
                ? row.item.accessoryId
                : row.item.tierId,
              row.field,
            ]),
            row,
          ]),
        );

        expect([...drawn.keys()].sort()).toEqual(expectedKeys);
        for (const [key, row] of drawn) {
          expect(row.before).toEqual(before.get(key) ?? absent);
          expect(row.after).toEqual(after.get(key) ?? absent);
        }
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("lists rows in D7's section order, names no address twice, and answers the same twice for inputs it does not touch", () => {
    fc.assert(
      fc.property(aDraft, (draft) => {
        const result = applyChanges(BASE, draft);
        fc.pre(result.ok);
        const before = deepFrozen(structuredClone(BASE));
        const after = deepFrozen(structuredClone(result.book));
        const changes = deepFrozen(structuredClone(draft));

        const rows = diffBooks(before, after, { changes });

        expect(diffBooks(before, after, { changes })).toEqual(rows);
        const positions = rows.map((row) => DIFF_SECTIONS.indexOf(row.section));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        const addresses = rows.flatMap((row) =>
          row.kind === "group" ? [] : [addressKey(row.address)],
        );
        expect(new Set(addresses).size).toBe(addresses.length);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("draws nothing for a row created and deleted in the same draft, whatever else the draft said about it", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("hw.x", "hw.y"),
        fc.boolean(),
        fc.boolean(),
        (id, isReworded, hasAccessory) => {
          const draft = [
            ...tierDraft(id),
            ...(isReworded
              ? [rewordRow(hardwareItem(id), "name", "Alta")]
              : []),
            ...(hasAccessory
              ? [
                  createAccessory("acc.x"),
                  setAccessoryPrice("acc.x", 3),
                  deleteItem(accessoryItem("acc.x")),
                ]
              : []),
            deleteItem(hardwareItem(id)),
          ];

          expect(diffOf(BASE, draft)).toEqual([]);
        },
      ),
      { numRuns: 20, seed: SEED },
    );
  });
});

describe("a change that restates what the book already says still has its row, so it can be reverted", () => {
  it("draws a text row, with equal sides, for a restated description and name, and none without the change", () => {
    const organiser = elementAt(WITH_ORGANISER.linkedAccessories, 0);
    const draft = [
      rewordRow(
        accessoryItem("organiser"),
        "description",
        organiser.description,
      ),
      rewordRow(accessoryItem("organiser"), "name", organiser.name),
    ];

    const rows = diffOf(WITH_ORGANISER, draft);

    expect(
      rows.map((row) =>
        row.kind === "text" ? [row.field, row.before, row.after] : row.kind,
      ),
    ).toEqual([
      ["name", organiser.name, organiser.name],
      ["description", organiser.description, organiser.description],
    ]);
    expect(diffBooks(WITH_ORGANISER, applied(WITH_ORGANISER, draft))).toEqual(
      [],
    );
  });

  it("draws a field row, with equal sides, for a restated rate and a restated linked price", () => {
    const draft = [
      setRate("hardware.premium", "perHingeMinor", 7_500),
      setAccessoryPrice("organiser", 12_345),
    ];

    const rows = diffOf(WITH_ORGANISER, draft);

    expect(
      rows.map((row) =>
        row.kind === "field" ? [row.before, row.after] : row.kind,
      ),
    ).toEqual([
      [7_500, 7_500],
      [12_345, 12_345],
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The address on a row reverts the row

describe("the address of a row reverts the row", () => {
  const DRAFT: readonly DraftChange[] = [
    ...tierDraft("hw.new"),
    createAccessory("acc.plain"),
    createAccessory("acc.priced"),
    setAccessoryPrice("acc.priced", 4_000),
    rewordRow(accessoryItem("organiser"), "name", "Alt nume"),
    setRate("hardware.soft-close", "perHingeMinor", 9_999),
    deleteItem(hardwareItem("hardware.premium")),
    deleteItem(materialItem("material.veneer")),
  ];
  const BOOK = WITH_ORGANISER;
  const ROWS = diffOf(BOOK, DRAFT);

  function describeRow(row: BookDiffRow): string {
    if (row.kind === "group") return `group ${row.groupId}`;
    return `${row.kind} ${addressKey(row.address)}`;
  }

  /** Whether the draft without the row's change is a draft the book accepts and the diff no longer draws the row for. */
  function isReverted(row: BookDiffRow): boolean {
    if (row.kind === "group") return true;
    const reverted = revertChange(DRAFT, row.address);
    const result = applyChanges(BOOK, reverted);
    if (!result.ok) return false;
    return !diffBooks(BOOK, result.book, { changes: reverted }).some(
      (other) =>
        other.kind !== "group" &&
        addressKey(other.address) === addressKey(row.address),
    );
  }

  it("covers a created class, a created accessory with and without a price, text, a rate, and three deletions", () => {
    const kinds = ROWS.map((row) =>
      row.kind === "group" ? "group" : row.kind,
    );

    expect(kinds.filter((kind) => kind === "row")).toHaveLength(5);
    expect(kinds).toContain("text");
    expect(kinds.filter((kind) => kind === "field").length).toBeGreaterThan(5);
  });

  it.each(
    ROWS.filter(
      (row) =>
        row.kind === "text" ||
        (row.kind === "row" && row.change === "deleted") ||
        (row.kind === "field" &&
          row.address.kind === "hardware" &&
          row.address.tierId === "hardware.soft-close"),
    ).map((row) => [describeRow(row), row] as const),
  )("reverts %s", (_label, row) => {
    expect(isReverted(row)).toBe(true);
  });

  it("reverts the row of a created accessory that has no price change of its own", () => {
    const row = ROWS.find(
      (candidate) =>
        candidate.kind === "row" &&
        candidate.change === "created" &&
        candidate.item.kind === "accessory" &&
        candidate.item.accessoryId === "acc.plain",
    );

    expect(row).toBeDefined();
    expect(isReverted(must(row))).toBe(true);
  });

  it("reverts the row of a created accessory that has a price change, leaving a draft the book accepts", () => {
    const row = ROWS.find(
      (candidate) =>
        candidate.kind === "row" &&
        candidate.change === "created" &&
        candidate.item.kind === "accessory" &&
        candidate.item.accessoryId === "acc.priced",
    );

    expect(row).toBeDefined();
    expect(isReverted(must(row))).toBe(true);
  });

  it("reverts the row of a created class, leaving a draft the book accepts", () => {
    const row = ROWS.find(
      (candidate) =>
        candidate.kind === "row" &&
        candidate.change === "created" &&
        candidate.item.kind === "hardware",
    );

    expect(row).toBeDefined();
    expect(isReverted(must(row))).toBe(true);
  });

  it("names, on every rate row of a deleted class, a change of the draft: the row's own address can revert something", () => {
    const rateRows = ROWS.filter(
      (row) =>
        row.kind === "field" &&
        row.address.kind === "hardware" &&
        row.address.tierId === "hardware.premium",
    );

    expect(rateRows).toHaveLength(RATE_FIELDS.length);
    for (const row of rateRows) {
      if (row.kind !== "field") continue;
      expect(revertChange(DRAFT, row.address).length).toBeLessThan(
        DRAFT.length,
      );
    }
  });

  it("reverts a deletion to the very row it removed, rates and words included", () => {
    const withoutDeletions = DRAFT.filter(
      (change) => change.address.kind !== "item-deleted",
    );
    const restored = applied(BOOK, withoutDeletions);

    expect(restored.hardware.tiers.map((tier) => tier.tierId)).toContain(
      "hardware.premium",
    );
    expect(
      restored.hardware.tiers.find(
        (tier) => tier.tierId === "hardware.premium",
      ),
    ).toEqual(
      BOOK.hardware.tiers.find((tier) => tier.tierId === "hardware.premium"),
    );
    expect(restored.material).toEqual(BOOK.material);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A difference between two versions that no draft change names

describe("a difference between two books is drawn even when no change names it (D8 compares versions)", () => {
  it("draws a linked accessory that now follows another catalogue row", () => {
    const relinked = bookWithLinked(
      [
        linkedRule("organiser", {
          description: "Pentru sertar.",
          linkedBuildId: "base-sink",
        }),
      ],
      BASE,
    );

    expect(diffBooks(WITH_ORGANISER, relinked)).not.toEqual([]);
  });

  it("does not let an accessory deleted and created again with the same words and another link go unseen", () => {
    const draft = [
      deleteItem(accessoryItem("organiser")),
      createAccessory("organiser", {
        linkedBuildId: "base-sink",
        perUnitMinor: 12_345,
        name: "Accesoriu organiser",
        description: "Pentru sertar.",
      }),
    ];
    const result = applyChanges(WITH_ORGANISER, draft);

    if (!result.ok) return;
    expect(
      diffBooks(WITH_ORGANISER, result.book, { changes: draft }),
    ).not.toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Books that state no linked accessories (stored before the section)

describe("books from before the linked accessories", () => {
  const WITHOUT_SECTION = (() => {
    const { linkedAccessories: omitted, ...rest } = BASE;
    void omitted;
    return rest as unknown as PriceBook;
  })();

  it("diffs against a book that has the section, drawing the accessories as created and deleted", () => {
    expect(() => diffBooks(WITHOUT_SECTION, WITH_ORGANISER)).not.toThrow();
    expect(() => diffBooks(WITH_ORGANISER, WITHOUT_SECTION)).not.toThrow();
    const created = diffBooks(WITHOUT_SECTION, WITH_ORGANISER).filter(
      (row) => row.kind === "row",
    );
    const deleted = diffBooks(WITH_ORGANISER, WITHOUT_SECTION).filter(
      (row) => row.kind === "row",
    );

    expect(created.map((row) => (row as { change: string }).change)).toEqual([
      "created",
    ]);
    expect(deleted.map((row) => (row as { change: string }).change)).toEqual([
      "deleted",
    ]);
  });

  it("lists the built-in accessories' prices as editable and no linked one", () => {
    const fields = readEditableFields(WITHOUT_SECTION).filter(
      (reading) => reading.address.kind === "accessory",
    );

    expect(
      fields.map((reading) =>
        reading.address.kind === "accessory" ? reading.address.accessoryId : "",
      ),
    ).toEqual(["sinkProtectiveCover", "dishDryingRack"]);
  });

  it("restores the built-ins' prices between such a book and one that has the section", () => {
    const cheaper = applied(WITH_ORGANISER, [change("sinkProtectiveCover", 1)]);

    expect(() => restoreChanges(WITHOUT_SECTION, cheaper)).not.toThrow();
    expect(() => restoreChanges(cheaper, WITHOUT_SECTION)).not.toThrow();
    expect(
      restoreChanges(WITH_ORGANISER, cheaper).map((c) => c.address),
    ).toEqual([
      {
        kind: "accessory",
        accessoryId: "sinkProtectiveCover",
        field: "perUnitMinor",
      },
    ]);
    expect(
      restoreChanges(WITHOUT_SECTION, cheaper).map((c) => c.address),
    ).toEqual([
      {
        kind: "accessory",
        accessoryId: "sinkProtectiveCover",
        field: "perUnitMinor",
      },
    ]);
  });
});

function change(accessoryId: string, value: number): DraftChange {
  return setAccessoryPrice(accessoryId, value);
}

// ---------------------------------------------------------------------------------------------------------------------
// A linked accessory's price is an editable field

describe("a linked accessory's price as a field of the book", () => {
  const TWO = applied(BASE, [
    createAccessory("acc.a", { perUnitMinor: 100 }),
    createAccessory("acc.b", { perUnitMinor: 200 }),
  ]);

  it("is read after the built-ins in book order, one reading each, though two accessories follow the same row", () => {
    expect(TWO.linkedAccessories[0]?.linkedBuildId).toBe(
      TWO.linkedAccessories[1]?.linkedBuildId,
    );

    expect(
      readEditableFields(TWO)
        .filter((reading) => reading.address.kind === "accessory")
        .map((reading) => [
          reading.address.kind === "accessory"
            ? reading.address.accessoryId
            : "",
          reading.value,
        ]),
    ).toEqual([
      ["sinkProtectiveCover", 20_000],
      ["dishDryingRack", 40_000],
      ["acc.a", 100],
      ["acc.b", 200],
    ]);
  });

  it("is written on the accessory named and no other that follows the same row", () => {
    const result = applied(TWO, [setAccessoryPrice("acc.b", 999)]);

    expect(
      result.linkedAccessories.map((linked) => linked.perUnitMinor),
    ).toEqual([100, 999]);
  });

  it.each([
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "acc.c",
    "",
  ])("refuses a price for %j, which the book does not state", (id) => {
    const result = applyChanges(TWO, [setAccessoryPrice(id, 1)]);

    expect(result.ok).toBe(false);
    expect(
      result.ok || result.reason !== "changes-refused"
        ? ""
        : result.refusals[0]?.code,
    ).toBe("UNKNOWN_ITEM");
  });

  it("is diffed as a price row for each accessory that changed, the other unchanged one drawn no row", () => {
    const after = applied(TWO, [setAccessoryPrice("acc.b", 999)]);

    expect(diffBooks(TWO, after)).toEqual([
      {
        kind: "field",
        section: "accessories",
        address: {
          kind: "accessory",
          accessoryId: "acc.b",
          field: "perUnitMinor",
        },
        unit: "amount",
        before: 200,
        after: 999,
        delta: 799,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// restoreChanges between books that differ in rows

describe("restoreChanges covers the fields both books state and never a row", () => {
  /** The books a restore is asked about: each is the base with a random draft applied. */
  const aBook = aDraft.map((draft) => {
    const result = applyChanges(BASE, draft);
    return result.ok ? result.book : BASE;
  });

  function sharedFieldValues(
    first: PriceBook,
    second: PriceBook,
  ): ReadonlyMap<string, number | boolean> {
    const inSecond = new Map(
      readEditableFields(second).map((r) => [addressKey(r.address), r.value]),
    );
    return new Map(
      readEditableFields(first).flatMap((reading) => {
        const key = addressKey(reading.address);
        return inSecond.has(key) ? [[key, reading.value] as const] : [];
      }),
    );
  }

  it("queues only changes the active book accepts, whichever rows the two books differ in", () => {
    fc.assert(
      fc.property(aBook, aBook, (archived, active) => {
        const restore = restoreChanges(archived, active);

        const result = applyChanges(active, restore);

        expect(result.ok).toBe(true);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("makes the active book equal the archived one on every shared field, and leaves its rows as they were", () => {
    fc.assert(
      fc.property(aBook, aBook, (archived, active) => {
        const result = applyChanges(active, restoreChanges(archived, active));
        fc.pre(result.ok);

        const wanted = sharedFieldValues(archived, active);
        for (const reading of readEditableFields(result.book)) {
          const key = addressKey(reading.address);
          if (wanted.has(key)) expect(reading.value).toBe(wanted.get(key));
        }
        expect(result.book.hardware.tiers.map((tier) => tier.tierId)).toEqual(
          active.hardware.tiers.map((tier) => tier.tierId),
        );
        expect(
          result.book.linkedAccessories.map((linked) => linked.accessoryId),
        ).toEqual(active.linkedAccessories.map((linked) => linked.accessoryId));
        expect(
          result.book.linkedAccessories.map((linked) => [
            linked.name,
            linked.linkedBuildId,
          ]),
        ).toEqual(
          active.linkedAccessories.map((linked) => [
            linked.name,
            linked.linkedBuildId,
          ]),
        );
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("gives no change for a row only one book states: a created row is kept and a deleted row stays deleted", () => {
    const archived = applied(WITH_ORGANISER, [
      ...tierDraft("hw.old"),
      createAccessory("acc.old", { perUnitMinor: 111 }),
    ]);
    const active = applied(WITH_ORGANISER, [
      ...tierDraft("hw.recent"),
      deleteItem(hardwareItem("hardware.premium")),
      createAccessory("acc.recent", { perUnitMinor: 222 }),
    ]);

    const restored = applied(active, restoreChanges(archived, active));

    expect(
      restoreChanges(archived, active)
        .map((c) => addressKey(c.address))
        .filter(
          (key) =>
            key.includes("hw.old") ||
            key.includes("hw.recent") ||
            key.includes("acc."),
        ),
    ).toEqual([]);
    expect(restored.hardware.tiers.map((tier) => tier.tierId)).toContain(
      "hw.recent",
    );
    expect(restored.hardware.tiers.map((tier) => tier.tierId)).not.toContain(
      "hw.old",
    );
    expect(restored.hardware.tiers.map((tier) => tier.tierId)).not.toContain(
      "hardware.premium",
    );
    expect(
      restored.linkedAccessories.map((linked) => linked.accessoryId),
    ).toEqual(["organiser", "acc.recent"]);
  });

  it("restores the price of a row both books state, created or linked", () => {
    const archived = applied(WITH_ORGANISER, [
      ...tierDraft("hw.shared"),
      setAccessoryPrice("organiser", 7),
    ]);
    const active = applied(WITH_ORGANISER, [
      createTier("hw.shared"),
      setRate("hw.shared", "perHingeMinor", 1),
      setRate("hw.shared", "perDrawerMinor", 2),
      setRate("hw.shared", "perPushToOpenMinor", 3),
      setRate("hw.shared", "perLiftMinor", 4),
      setRate("hw.shared", "perPushRunnerMinor", 5),
      setAccessoryPrice("organiser", 8),
    ]);

    const restore = restoreChanges(archived, active);
    const restored = applied(active, restore);

    expect(restore.map((c) => addressKey(c.address)).sort()).toEqual(
      [
        { kind: "hardware", tierId: "hw.shared", field: "perHingeMinor" },
        { kind: "hardware", tierId: "hw.shared", field: "perDrawerMinor" },
        { kind: "hardware", tierId: "hw.shared", field: "perPushToOpenMinor" },
        { kind: "hardware", tierId: "hw.shared", field: "perLiftMinor" },
        { kind: "hardware", tierId: "hw.shared", field: "perPushRunnerMinor" },
        { kind: "accessory", accessoryId: "organiser", field: "perUnitMinor" },
      ]
        .map((address) => addressKey(address))
        .sort(),
    );
    expect(restored).toEqual(archived);
  });

  it("is empty between books that state the same rows and prices, and for the same book twice", () => {
    fc.assert(
      fc.property(aBook, (book) => {
        expect(restoreChanges(book, book)).toEqual([]);
      }),
      { numRuns: RUNS, seed: SEED },
    );
    expect(allRates("x")).toHaveLength(RATE_FIELDS.length);
  });
});
