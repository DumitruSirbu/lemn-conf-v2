// What the publish review shows of a draft the hardware screens leave, and what a publish would store: a created class
// named with its four amounts, a deleted class named, the count the menu shows, and the availability log's owed rows
// for a class that only the draft held.
import { describe, expect, it } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  applyChanges,
  createdItemsOf,
  deletedItemsOf,
  revertChange,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { readPendingDraft } from "@/price-dashboard/publish-model";
import type { RowView } from "@/price-dashboard/publish-model";

import { CREATED, CREATED_CLASS, HETTICH } from "./hardware-harness";

const DELETES_HETTICH: readonly DraftChange[] = [
  {
    address: {
      kind: "item-deleted",
      item: { kind: "hardware", tierId: HETTICH },
    },
    value: true,
  },
];

function rowsOf(changes: readonly DraftChange[]): readonly RowView[] {
  const reading = readPendingDraft({
    active: SAMPLE_PRICE_BOOK,
    changes,
    cabinetNames: {},
  });
  if (reading.kind !== "ready") throw new Error(`not ready: ${reading.kind}`);
  return reading.view.sections.flatMap((section) => section.rows);
}

describe("a class the hardware screens created, as the publish review reads the draft", () => {
  it("is named, with each of its four amounts, in the hardware section, and can be published", () => {
    const reading = readPendingDraft({
      active: SAMPLE_PRICE_BOOK,
      changes: CREATED_CLASS,
      cabinetNames: {},
    });

    expect(reading.kind).toBe("ready");
    if (reading.kind !== "ready") return;
    const rows = rowsOf(CREATED_CLASS);
    expect(
      reading.view.changeCount,
      "the class and its rates are one change",
    ).toBe(1);
    expect(reading.view.canPublish).toBe(true);
    expect(
      rows.flatMap((row) =>
        row.kind === "field" && row.subject.kind === "book-text"
          ? [row.subject.authored]
          : [],
      ),
    ).toEqual(Array<string>(HARDWARE_RATE_FIELDS.length).fill("GTV Economic"));
    expect(
      rows.flatMap((row) => (row.kind === "field" ? [row.after] : [])),
    ).toEqual(Array<number>(HARDWARE_RATE_FIELDS.length).fill(2_000));
  });

  it("is owed a row of the availability log, switched off, and a class taken back out of the draft is owed none", () => {
    expect(createdItemsOf(CREATED_CLASS)).toEqual([
      { kind: "hardware", tierId: CREATED },
    ]);

    const afterDeleting = revertChange(CREATED_CLASS, {
      kind: "hardware-tier-created",
      tierId: CREATED,
    });

    expect(afterDeleting).toEqual([]);
    expect(createdItemsOf(afterDeleting)).toEqual([]);
  });

  it("is taken out whole by the ↺ of its own row, the only one the review offers: the class goes, not one amount", () => {
    const rows = rowsOf(CREATED_CLASS);

    const offered = rows.flatMap((row) =>
      row.revert === undefined ? [] : [row.revert],
    );

    expect(offered).toEqual([
      {
        kind: "change",
        address: { kind: "hardware-tier-created", tierId: CREATED },
      },
    ]);
    expect(
      revertChange(
        CREATED_CLASS,
        offered[0]?.kind === "change"
          ? offered[0].address
          : { kind: "provisional" },
      ),
    ).toEqual([]);
    expect(rows.filter((row) => row.kind === "field")).toHaveLength(
      HARDWARE_RATE_FIELDS.length,
    );
  });

  it("offers no ↺ on a rate of it, which the revert route would not take on its own: the domain would take the whole class for it", () => {
    const rates = rowsOf(CREATED_CLASS).filter((row) => row.kind === "field");

    expect(rates).toHaveLength(HARDWARE_RATE_FIELDS.length);
    expect(rates.map(({ revert }) => revert)).toEqual(
      rates.map(() => undefined),
    );
  });
});

describe("a class the hardware screens deleted, as the publish review reads the draft", () => {
  it("is named by every amount it had, going to nothing, and counts as one change", () => {
    const reading = readPendingDraft({
      active: SAMPLE_PRICE_BOOK,
      changes: DELETES_HETTICH,
      cabinetNames: {},
    });

    expect(reading.kind).toBe("ready");
    if (reading.kind !== "ready") return;
    expect(reading.view.changeCount).toBe(1);
    expect(reading.view.canPublish).toBe(true);
    const rows = rowsOf(DELETES_HETTICH);
    const fieldRows = rows.filter((row) => row.kind === "field");
    expect(rows.filter((row) => row.kind === "row")).toHaveLength(1);
    expect(fieldRows).toHaveLength(HARDWARE_RATE_FIELDS.length);
    expect(
      fieldRows.every(
        (row) =>
          row.subject.kind === "book-text" &&
          row.subject.authored === "Hettich" &&
          typeof row.after === "object",
      ),
    ).toBe(true);
  });

  it("is the one item a publish owes a usage count for, and the review offers one ↺ for it, by the address of the deletion, which empties the draft", () => {
    expect(deletedItemsOf(DELETES_HETTICH)).toEqual([
      { kind: "hardware", tierId: HETTICH },
    ]);
    const deletion = DELETES_HETTICH[0]?.address ?? { kind: "provisional" };
    const offered = rowsOf(DELETES_HETTICH).flatMap((row) =>
      row.revert === undefined ? [] : [row.revert],
    );

    expect(offered).toEqual([{ kind: "change", address: deletion }]);
    expect(revertChange(DELETES_HETTICH, deletion)).toEqual([]);
    expect(deletedItemsOf(revertChange(DELETES_HETTICH, deletion))).toEqual([]);
  });

  it("offers no ↺ on any amount of the deleted class: the row's is the only one", () => {
    const fieldRows = rowsOf(DELETES_HETTICH).filter(
      (row) => row.kind === "field",
    );

    expect(fieldRows).toHaveLength(HARDWARE_RATE_FIELDS.length);
    expect(fieldRows.map(({ revert }) => revert)).toEqual(
      fieldRows.map(() => undefined),
    );
  });

  it("is deleted whole even when its rates were edited first: the book has no such class, and no edit of one", () => {
    const edited: readonly DraftChange[] = [
      {
        address: { kind: "hardware", tierId: HETTICH, field: "perLiftMinor" },
        value: 70_000,
      },
      ...DELETES_HETTICH,
    ];

    const applied = applyChanges(SAMPLE_PRICE_BOOK, edited);

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(
      applied.book.hardware.tiers.some((tier) => tier.tierId === HETTICH),
    ).toBe(false);
  });
});
