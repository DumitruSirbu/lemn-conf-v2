// Adversarial QA of M10 wave U4a where its drafts meet the publish screen. Until this wave no screen wrote a creation or a
// deletion, and the publish model says so in a comment ("none reaches this model until the screens that author them are built");
// now a person can create a class and delete one. What the review of a draft shows of them, and what a publish would store, is
// held here to the draft the hardware screens leave: the created class named with its four amounts, the deleted class named, the
// count the menu shows, and the availability log's owed rows for a class that only the draft held.
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
    expect(reading.view.changeCount).toBe(1 + HARDWARE_RATE_FIELDS.length);
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

  it("is taken out whole by the ↺ of any one of its rows, as the review offers it: the class goes, not one amount", () => {
    for (const row of rowsOf(CREATED_CLASS)) {
      if (row.kind !== "field" || row.revert?.kind !== "change") {
        throw new Error("a row of a created class has no ↺ of its own");
      }

      const remaining = revertChange(CREATED_CLASS, row.revert.address);

      expect(remaining).toEqual([]);
    }
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
    expect(rows).toHaveLength(HARDWARE_RATE_FIELDS.length);
    expect(
      rows.every(
        (row) =>
          row.kind === "field" &&
          row.subject.kind === "book-text" &&
          row.subject.authored === "Hettich" &&
          typeof row.after === "object",
      ),
    ).toBe(true);
  });

  it("is the one item a publish owes a usage count for, and the ↺ of any of its rows gives the class back", () => {
    expect(deletedItemsOf(DELETES_HETTICH)).toEqual([
      { kind: "hardware", tierId: HETTICH },
    ]);
    for (const row of rowsOf(DELETES_HETTICH)) {
      if (row.kind !== "field" || row.revert?.kind !== "change") {
        throw new Error("a row of a deleted class has no ↺ of its own");
      }

      expect(revertChange(DELETES_HETTICH, row.revert.address)).toEqual([]);
    }
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
