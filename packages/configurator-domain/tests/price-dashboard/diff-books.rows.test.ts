// M10 M4 (1): the rows D7 and D8 draw for a row created, deleted or reworded (A-18, A-21).
import { describe, expect, it } from "vitest";

import { applyChanges } from "../../src/price-dashboard/apply-changes.js";
import type {
  BookFieldAddress,
  DraftChange,
} from "../../src/price-dashboard/book-field-address.js";
import {
  DIFF_SECTIONS,
  diffBooks,
  type BookDiffRow,
} from "../../src/price-dashboard/diff-books.js";
import { readEditableFields } from "../../src/price-dashboard/editable-fields.js";
import { restoreChanges } from "../../src/price-dashboard/restore.js";
import type { PriceBook } from "../../src/pricing/price-book.js";
import {
  bookWithLinked,
  linkedRule,
} from "../support/linked-accessory-books.js";

import { PERCENTAGE_BOOK } from "./change-set-books.js";

const TIER = "hardware.economy";

function change(address: BookFieldAddress, value: unknown): DraftChange {
  return { address, value } as DraftChange;
}

const CREATE_TIER: readonly DraftChange[] = [
  change(
    { kind: "hardware-tier-created", tierId: TIER },
    { name: "Economic", description: "Glisiere simple." },
  ),
  ...(["perHingeMinor", "perDrawerMinor", "perPushToOpenMinor"] as const).map(
    (field, index) =>
      change({ kind: "hardware", tierId: TIER, field }, 1_000 * (index + 1)),
  ),
];

const WITH_LINKED = bookWithLinked(
  [linkedRule("organiser", { description: "Pentru sertar." })],
  PERCENTAGE_BOOK,
);

function applied(book: PriceBook, changes: readonly DraftChange[]): PriceBook {
  const result = applyChanges(book, changes);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.book;
}

function rowsOfKind<Kind extends BookDiffRow["kind"]>(
  rows: readonly BookDiffRow[],
  kind: Kind,
): readonly Extract<BookDiffRow, { kind: Kind }>[] {
  return rows.filter(
    (row): row is Extract<BookDiffRow, { kind: Kind }> => row.kind === kind,
  );
}

describe("a created hardware class", () => {
  const after = applied(PERCENTAGE_BOOK, CREATE_TIER);
  const rows = diffBooks(PERCENTAGE_BOOK, after, { changes: CREATE_TIER });

  it("has a row of its own, with its Romanian words and the address that reverts it, ahead of its rates", () => {
    expect(rows[0]).toEqual({
      kind: "row",
      change: "created",
      section: "hardware",
      address: { kind: "hardware-tier-created", tierId: TIER },
      item: { kind: "hardware", tierId: TIER },
      name: "Economic",
      description: "Glisiere simple.",
    });
  });

  it("draws each rate as a field row that was absent before, never zero", () => {
    const rates = rowsOfKind(rows, "field");

    expect(rates).toHaveLength(3);
    expect(rates.map((row) => row.before)).toEqual(
      rates.map(() => ({ kind: "absent" })),
    );
    expect(rates.map((row) => row.after)).toEqual([1_000, 2_000, 3_000]);
  });

  it("draws nothing for the class when the book is not changed", () => {
    expect(rowsOfKind(diffBooks(after, after), "row")).toEqual([]);
  });
});

describe("a created linked accessory", () => {
  it("has a row naming the catalogue row it follows", () => {
    const creation = change(
      { kind: "accessory-created", accessoryId: "plinth-light" },
      { linkedBuildId: "base-sink", perUnitMinor: 7_000, name: "Soclu" },
    );
    const after = applied(PERCENTAGE_BOOK, [creation]);

    const rows = diffBooks(PERCENTAGE_BOOK, after, { changes: [creation] });

    expect(rowsOfKind(rows, "row")).toEqual([
      {
        kind: "row",
        change: "created",
        section: "accessories",
        address: { kind: "accessory-created", accessoryId: "plinth-light" },
        item: { kind: "accessory", accessoryId: "plinth-light" },
        name: "Soclu",
        linkedBuildId: "base-sink",
      },
    ]);
  });
});

describe("a deleted item", () => {
  it("has a row in its own section naming it, and its rate rows end absent", () => {
    const deletion = change(
      {
        kind: "item-deleted",
        item: { kind: "hardware", tierId: "hardware.soft-close" },
      },
      true,
    );
    const after = applied(PERCENTAGE_BOOK, [deletion]);

    const rows = diffBooks(PERCENTAGE_BOOK, after, { changes: [deletion] });

    expect(rowsOfKind(rows, "row")).toEqual([
      {
        kind: "row",
        change: "deleted",
        section: "hardware",
        address: deletion.address,
        item: { kind: "hardware", tierId: "hardware.soft-close" },
        name: "Hettich",
      },
    ]);
    expect(rowsOfKind(rows, "field").map((row) => row.after)).toEqual([
      { kind: "absent" },
      { kind: "absent" },
      { kind: "absent" },
    ]);
  });

  it("puts a deleted material in the materials section", () => {
    const deletion = change(
      {
        kind: "item-deleted",
        item: { kind: "material", tierId: "material.veneer" },
      },
      true,
    );
    const after = applied(PERCENTAGE_BOOK, [deletion]);

    expect(rowsOfKind(diffBooks(PERCENTAGE_BOOK, after), "row")).toMatchObject([
      { change: "deleted", section: "materials" },
    ]);
  });

  it("is the mirror of a creation when the books are swapped", () => {
    const after = applied(PERCENTAGE_BOOK, CREATE_TIER);

    const forward = rowsOfKind(diffBooks(PERCENTAGE_BOOK, after), "row");
    const backward = rowsOfKind(diffBooks(after, PERCENTAGE_BOOK), "row");

    expect(forward.map((row) => [row.change, row.item])).toEqual([
      ["created", { kind: "hardware", tierId: TIER }],
    ]);
    expect(backward.map((row) => [row.change, row.item])).toEqual([
      ["deleted", { kind: "hardware", tierId: TIER }],
    ]);
  });
});

describe("the words of a row both books state", () => {
  const reword = change(
    {
      kind: "created-row-text",
      item: { kind: "accessory", accessoryId: "organiser" },
      field: "name",
    },
    "Altul",
  );

  it("has a text row for the field that differs, with the text on each side", () => {
    const after = applied(WITH_LINKED, [reword]);

    const rows = diffBooks(WITH_LINKED, after, { changes: [reword] });

    expect(rowsOfKind(rows, "text")).toEqual([
      {
        kind: "text",
        section: "accessories",
        address: reword.address,
        item: { kind: "accessory", accessoryId: "organiser" },
        field: "name",
        before: "Accesoriu organiser",
        after: "Altul",
      },
    ]);
  });

  it("states a description a side does not have as absent", () => {
    const describing = change(
      {
        kind: "created-row-text",
        item: { kind: "accessory", accessoryId: "organiser" },
        field: "description",
      },
      " ",
    );
    const after = applied(WITH_LINKED, [describing]);

    const [row] = rowsOfKind(diffBooks(WITH_LINKED, after), "text");

    expect(row).toMatchObject({
      before: "Pentru sertar.",
      after: { kind: "absent" },
    });
  });

  it("keeps a row for a change that restated the text, so it can be reverted, and none without the change", () => {
    const restating = change(reword.address, "Accesoriu organiser");
    const same = applied(WITH_LINKED, [restating]);

    expect(
      rowsOfKind(
        diffBooks(WITH_LINKED, same, { changes: [restating] }),
        "text",
      ),
    ).toHaveLength(1);
    expect(rowsOfKind(diffBooks(WITH_LINKED, same), "text")).toEqual([]);
  });

  it("has no text row for a row the same draft created: its words are in the creation row", () => {
    const changes = [
      ...CREATE_TIER,
      change(
        {
          kind: "created-row-text",
          item: { kind: "hardware", tierId: TIER },
          field: "name",
        },
        "Altul",
      ),
    ];
    const after = applied(PERCENTAGE_BOOK, changes);

    const rows = diffBooks(PERCENTAGE_BOOK, after, { changes });

    expect(rowsOfKind(rows, "text")).toEqual([]);
    expect(rowsOfKind(rows, "row")).toMatchObject([{ name: "Altul" }]);
  });
});

describe("the order of the rows", () => {
  it("lists sections in D7's order with the structural rows first inside each", () => {
    const changes = [
      ...CREATE_TIER,
      change(
        {
          kind: "item-deleted",
          item: { kind: "material", tierId: "material.veneer" },
        },
        true,
      ),
      change({ kind: "depth-rule" }, 30),
    ];
    const after = applied(PERCENTAGE_BOOK, changes);

    const rows = diffBooks(PERCENTAGE_BOOK, after, { changes });
    const sections = rows.map((row) => DIFF_SECTIONS.indexOf(row.section));

    expect(sections).toEqual([...sections].sort((a, b) => a - b));
    const hardware = rows.filter((row) => row.section === "hardware");
    expect(hardware.map((row) => row.kind)).toEqual([
      "row",
      "field",
      "field",
      "field",
    ]);
  });
});

describe("a linked accessory's price", () => {
  it("is an editable field: read, diffed and restored like a built-in's", () => {
    const address = {
      kind: "accessory",
      accessoryId: "organiser",
      field: "perUnitMinor",
    } as const;
    const edit = change(address, 99_000);
    const edited = applied(WITH_LINKED, [edit]);

    const readings = readEditableFields(WITH_LINKED).filter(
      (reading) => reading.address.kind === "accessory",
    );
    const [row] = rowsOfKind(diffBooks(WITH_LINKED, edited), "field");

    expect(
      readings.map(
        (reading) => (reading.address as { accessoryId: string }).accessoryId,
      ),
    ).toEqual(["sinkProtectiveCover", "dishDryingRack", "organiser"]);
    expect(row).toMatchObject({
      address,
      before: 12_345,
      after: 99_000,
      section: "accessories",
    });
    expect(applied(edited, restoreChanges(WITH_LINKED, edited))).toEqual(
      WITH_LINKED,
    );
  });
});

describe("restoring between books that differ in rows", () => {
  it("gives prices only: it neither creates, rewords nor deletes a row", () => {
    const withTier = applied(PERCENTAGE_BOOK, [
      ...CREATE_TIER,
      change({ kind: "depth-rule" }, 40),
    ]);

    for (const [archived, active] of [
      [PERCENTAGE_BOOK, withTier],
      [withTier, PERCENTAGE_BOOK],
    ] as const) {
      const changes = restoreChanges(archived, active);

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.map((restored) => restored.address.kind)).toEqual(
        changes.map(() => "depth-rule"),
      );
      expect(applyChanges(active, changes).ok).toBe(true);
    }
  });
});
