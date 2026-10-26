// `diffBooks` gives the D7/D8 rows as codes and numbers, with a bulk group as one row. Expected books are
// written by path (`setSlots`), so a row is not checked against the enumeration that produced it.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type {
  BookFieldAddress,
  DraftBulk,
  DraftChange,
} from "../../src/price-dashboard/book-field-address.js";
import {
  ABSENT_VALUE,
  DIFF_SECTIONS,
  diffBooks,
  type BookDiffRow,
  type FieldDiffRow,
  type GroupDiffRow,
} from "../../src/price-dashboard/diff-books.js";

import {
  anchoredRuleReading,
  changeOf,
  editSlotsOf,
  FIXTURE_BOOKS,
  FIXTURE_ANCHOR_WIDTH_MM,
  PERCENTAGE_BOOK,
  perSizeRuleOf,
  SAMPLE_BULK,
  setSlots,
  valueAt,
  type EditSlot,
} from "./change-set-books.js";

function slotOf(predicate: (address: BookFieldAddress) => boolean): EditSlot {
  const slot = editSlotsOf(PERCENTAGE_BOOK).find((row) =>
    predicate(row.address),
  );
  if (slot === undefined) throw new Error("the fixture has no such slot");
  return slot;
}

function fieldRow(row: BookDiffRow | undefined): FieldDiffRow {
  if (row?.kind !== "field") throw new Error("expected a field row");
  return row;
}

function groupRow(row: BookDiffRow | undefined): GroupDiffRow {
  if (row?.kind !== "group") throw new Error("expected a group row");
  return row;
}

function currentValue(slot: EditSlot): number | boolean {
  return valueAt(PERCENTAGE_BOOK, slot);
}

describe("a diff of identical books", () => {
  it.each(FIXTURE_BOOKS)("is empty for the $form form", ({ book }) => {
    expect(diffBooks(book, book)).toEqual([]);
    expect(diffBooks(book, setSlots(book, []))).toEqual([]);
  });

  it("is empty even when the changes name groups, because nothing differs", () => {
    const slot = slotOf((address) => address.kind === "cabinet");
    const same = { slot, value: currentValue(slot) };

    const rows = diffBooks(PERCENTAGE_BOOK, setSlots(PERCENTAGE_BOOK, [same]), {
      changes: [changeOf(same, "group-1")],
    });

    expect(rows).toEqual([]);
  });
});

describe("a diff of books that differ in one field", () => {
  const cases = FIXTURE_BOOKS.flatMap(({ form, book }) =>
    editSlotsOf(book).map((slot) => ({ form, book, slot })),
  );

  it.each(cases)(
    "is exactly one row for $slot.path in the $form form, naming the address, both values and the delta",
    ({ book, slot }) => {
      const before = valueAt(book, slot);
      const value = slot.unit === "flag" ? !before : (before as number) + 7;
      const after = setSlots(book, [{ slot, value }]);

      const rows = diffBooks(book, after);

      expect(rows).toHaveLength(1);
      const row = fieldRow(rows[0]);
      expect(row.address).toEqual(slot.address);
      expect(row.unit).toBe(slot.unit);
      expect(row.before).toBe(before);
      expect(row.after).toBe(value);
      expect(row.delta).toBe(slot.unit === "flag" ? undefined : 7);
    },
  );

  it("reports a price cut with a negative delta", () => {
    const slot = slotOf((address) => address.kind === "cabinet");
    const was = currentValue(slot) as number;

    const cut = fieldRow(
      diffBooks(
        PERCENTAGE_BOOK,
        setSlots(PERCENTAGE_BOOK, [{ slot, value: was - 50 }]),
      )[0],
    );

    expect(cut.delta).toBe(-50);
  });
});

describe("the rows are in the terms D7 and D8 draw", () => {
  it("names the price at the anchor width, the catalogue row and the amounts (D7: the base cabinet's price at 600 mm, 1 450 to 1 500 lei)", () => {
    const rule = anchoredRuleReading(PERCENTAGE_BOOK, "anchored-width");
    const slot = slotOf(
      (address) =>
        address.kind === "cabinet" &&
        address.ruleId === rule.ruleId &&
        address.field === "anchorMinor",
    );
    const after = setSlots(PERCENTAGE_BOOK, [{ slot, value: 150_000 }]);

    const row = fieldRow(diffBooks(PERCENTAGE_BOOK, after)[0]);

    expect(row).toMatchObject({
      section: "cabinets",
      address: { kind: "cabinet", ruleId: rule.ruleId, field: "anchorMinor" },
      unit: "amount",
      after: 150_000,
      cabinet: {
        buildId: rule.buildId,
        anchorWidthMm: FIXTURE_ANCHOR_WIDTH_MM,
      },
    });
  });

  it("gives a fixed-size row's context without an anchor width", () => {
    const rule = perSizeRuleOf(PERCENTAGE_BOOK);
    const slot = slotOf(
      (address) =>
        address.kind === "cabinet-size" && address.ruleId === rule.ruleId,
    );

    const row = fieldRow(
      diffBooks(
        PERCENTAGE_BOOK,
        setSlots(PERCENTAGE_BOOK, [{ slot, value: 1 }]),
      )[0],
    );

    expect(row.cabinet).toEqual({ buildId: rule.buildId });
  });

  it("gives a material percentage as points (D7: the surcharge +30 % to +35 %) and the depth rule in its own section", () => {
    const material = slotOf((address) => address.kind === "material");
    const depth = slotOf((address) => address.kind === "depth-rule");
    const wasMaterial = currentValue(material) as number;
    const wasDepth = currentValue(depth) as number;

    const rows = diffBooks(
      PERCENTAGE_BOOK,
      setSlots(PERCENTAGE_BOOK, [
        { slot: material, value: wasMaterial + 5 },
        { slot: depth, value: wasDepth + 3 },
      ]),
    );

    expect(rows.map((row) => fieldRow(row))).toMatchObject([
      {
        section: "price-rules",
        unit: "percent",
        before: wasDepth,
        after: wasDepth + 3,
        delta: 3,
      },
      {
        section: "materials",
        unit: "percent",
        before: wasMaterial,
        after: wasMaterial + 5,
        delta: 5,
      },
    ]);
  });

  it("shows a field only one book states as absent on the other side, never as null", () => {
    const withoutDepthRule = { ...PERCENTAGE_BOOK, depthRule: undefined };

    const rows = diffBooks(withoutDepthRule, PERCENTAGE_BOOK);

    expect(rows).toHaveLength(1);
    const row = fieldRow(rows[0]);
    expect(row.address).toEqual({ kind: "depth-rule" });
    expect(row.before).toBe(ABSENT_VALUE);
    expect(row.after).toBe(15);
    expect(row).not.toHaveProperty("delta");
  });

  it("lists sections in D7's order, whatever order the fields were edited in", () => {
    const slots = [
      slotOf((address) => address.kind === "provisional"),
      slotOf((address) => address.kind === "accessory"),
      slotOf((address) => address.kind === "hardware"),
      slotOf((address) => address.kind === "material"),
      slotOf((address) => address.kind === "depth-rule"),
      slotOf((address) => address.kind === "cabinet"),
    ];
    const edits = slots.map((slot) => ({
      slot,
      value:
        slot.unit === "flag"
          ? !currentValue(slot)
          : (currentValue(slot) as number) + 1,
    }));

    const rows = diffBooks(PERCENTAGE_BOOK, setSlots(PERCENTAGE_BOOK, edits));

    expect(rows.map((row) => row.section)).toEqual([...DIFF_SECTIONS]);
  });
});

describe("a bulk group", () => {
  const cabinetSlots = editSlotsOf(PERCENTAGE_BOOK).filter(
    ({ address }) =>
      address.kind === "cabinet" || address.kind === "cabinet-size",
  );
  const rise = (slot: EditSlot) => ({
    slot,
    value: (currentValue(slot) as number) + 10,
  });

  it("has enough cabinet fields to make the groups below mean something", () => {
    expect(cabinetSlots.length).toBeGreaterThanOrEqual(20);
    expect(new Set(cabinetSlots.map(({ address }) => address.kind)).size).toBe(
      2,
    );
  });

  it("diffs n grouped changes as one row expanding to n items, for every n from 1 to the whole fixture", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: cabinetSlots.length }), (count) => {
        const edits = cabinetSlots.slice(0, count).map(rise);
        const after = setSlots(PERCENTAGE_BOOK, edits);

        const rows = diffBooks(PERCENTAGE_BOOK, after, {
          changes: edits.map((edit) => changeOf(edit, "group-1")),
        });

        expect(rows).toHaveLength(1);
        const group = groupRow(rows[0]);
        expect(group.groupId).toBe("group-1");
        expect(group.bulk).toEqual(SAMPLE_BULK);
        expect(group.items).toHaveLength(count);
        expect(group.amountCount).toBe(count);
        expect(group.ruleCount).toBe(
          new Set(
            edits.map(
              ({ slot }) => (slot.address as { ruleId: string }).ruleId,
            ),
          ).size,
        );
        expect(group.items.map((item) => item.address)).toEqual(
          edits.map(({ slot }) => slot.address),
        );
      }),
      { numRuns: 100 },
    );
  });

  it("is n separate rows when the changes that made the books are not given", () => {
    const edits = cabinetSlots.slice(0, 5).map(rise);

    const rows = diffBooks(PERCENTAGE_BOOK, setSlots(PERCENTAGE_BOOK, edits));

    expect(rows.map((row) => row.kind)).toEqual(Array(5).fill("field"));
  });

  it("keeps ungrouped fields as their own rows and puts the group where its first item sat", () => {
    const grouped = cabinetSlots.slice(0, 3).map(rise);
    const hardware = slotOf((address) => address.kind === "hardware");
    const alone = {
      slot: hardware,
      value: (currentValue(hardware) as number) + 1,
    };
    const cabinetAlone = rise(cabinetSlots[3] ?? hardware);

    const rows = diffBooks(
      PERCENTAGE_BOOK,
      setSlots(PERCENTAGE_BOOK, [...grouped, alone, cabinetAlone]),
      {
        changes: [
          ...grouped.map((edit) => changeOf(edit, "group-1")),
          changeOf(alone),
          changeOf(cabinetAlone),
        ],
      },
    );

    expect(rows.map((row) => row.kind)).toEqual(["group", "field", "field"]);
    expect(groupRow(rows[0]).items).toHaveLength(3);
    expect(fieldRow(rows[1]).address).toEqual(cabinetAlone.slot.address);
  });

  it.each<DraftBulk>([
    { percent: 5, scope: "all" },
    { percent: -20, scope: "group", groupCode: "wall" },
    { percent: 300, scope: "selection" },
  ])(
    "carries its bulk $scope as stored, though the amounts moved by +10 whatever the percent",
    (bulk) => {
      const edits = cabinetSlots.slice(0, 3).map(rise);

      const rows = diffBooks(
        PERCENTAGE_BOOK,
        setSlots(PERCENTAGE_BOOK, edits),
        {
          changes: edits.map((edit) => changeOf(edit, "group-1", bulk)),
        },
      );

      expect(groupRow(rows[0]).bulk).toEqual(bulk);
    },
  );

  it("gives each of two groups its own bulk", () => {
    const first = cabinetSlots.slice(0, 2).map(rise);
    const second = cabinetSlots.slice(2, 4).map(rise);
    const firstBulk: DraftBulk = { percent: 5, scope: "all" };
    const secondBulk: DraftBulk = {
      percent: -10,
      scope: "group",
      groupCode: "tall",
    };

    const rows = diffBooks(
      PERCENTAGE_BOOK,
      setSlots(PERCENTAGE_BOOK, [...first, ...second]),
      {
        changes: [
          ...first.map((edit) => changeOf(edit, "group-1", firstBulk)),
          ...second.map((edit) => changeOf(edit, "group-2", secondBulk)),
        ],
      },
    );

    expect(rows.map((row) => groupRow(row).bulk)).toEqual([
      firstBulk,
      secondBulk,
    ]);
  });

  it("states no bulk for a group whose changes carry none", () => {
    const edits = cabinetSlots.slice(0, 2).map(rise);
    const changes = edits.map(
      (edit) => ({ ...changeOf(edit), groupId: "group-1" }) as DraftChange,
    );

    const rows = diffBooks(PERCENTAGE_BOOK, setSlots(PERCENTAGE_BOOK, edits), {
      changes,
    });

    expect(groupRow(rows[0])).not.toHaveProperty("bulk");
  });

  it("keeps two groups apart", () => {
    const first = cabinetSlots.slice(0, 2).map(rise);
    const second = cabinetSlots.slice(2, 5).map(rise);

    const rows = diffBooks(
      PERCENTAGE_BOOK,
      setSlots(PERCENTAGE_BOOK, [...first, ...second]),
      {
        changes: [
          ...first.map((edit) => changeOf(edit, "group-1")),
          ...second.map((edit) => changeOf(edit, "group-2")),
        ],
      },
    );

    expect(rows.map((row) => groupRow(row).items.length)).toEqual([2, 3]);
    expect(rows.map((row) => groupRow(row).groupId)).toEqual([
      "group-1",
      "group-2",
    ]);
  });

  it("counts only the fields that differ: a grouped change that restates a value adds no item", () => {
    const moved = cabinetSlots.slice(0, 2).map(rise);
    const unchanged = cabinetSlots[2];
    if (unchanged === undefined) throw new Error("no slot");
    const restated = { slot: unchanged, value: currentValue(unchanged) };

    const rows = diffBooks(
      PERCENTAGE_BOOK,
      setSlots(PERCENTAGE_BOOK, [...moved, restated]),
      {
        changes: [...moved, restated].map((edit) => changeOf(edit, "group-1")),
      },
    );

    expect(groupRow(rows[0]).items).toHaveLength(2);
  });

  it("lets a later single edit of a grouped field take it out of the group", () => {
    const edits = cabinetSlots.slice(0, 3).map(rise);
    const [first, ...rest] = edits;
    if (first === undefined) throw new Error("no slot");

    const rows = diffBooks(PERCENTAGE_BOOK, setSlots(PERCENTAGE_BOOK, edits), {
      changes: [
        ...edits.map((edit) => changeOf(edit, "group-1")),
        changeOf(first),
      ],
    });

    expect(rows.map((row) => row.kind)).toEqual(["field", "group"]);
    expect(groupRow(rows[1]).items).toHaveLength(rest.length);
  });
});
