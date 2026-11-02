// ADR 0177 A-20, adversarial: the lift rate on the path a draft takes from edit to publish list. Every rate of
// every class is held to the same journey: an accepted edit, a diff row naming its own address, a revert that takes only
// it, and a bulk percentage that never reaches it.
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  revertChange,
} from "../../src/price-dashboard/apply-changes.js";
import {
  HARDWARE_RATE_FIELDS,
  type DraftChange,
} from "../../src/price-dashboard/book-field-address.js";
import { planBulkChange } from "../../src/price-dashboard/bulk-change.js";
import { diffBooks } from "../../src/price-dashboard/diff-books.js";
import { readEditableFields } from "../../src/price-dashboard/editable-fields.js";
import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/book-reading.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";

import { CATALOG } from "./m2-support.js";

const EVERY_RATE_OF_EVERY_CLASS = SAMPLE_PRICE_BOOK.hardware.tiers.flatMap(
  (tier) => HARDWARE_RATE_FIELDS.map((field) => ({ tier, field })),
);

function editOf(tierId: string, field: string, value: number): DraftChange {
  return { address: { kind: "hardware", tierId, field }, value } as DraftChange;
}

describe("every rate of every hardware class, from edit to diff row", () => {
  it("lists a field for each of the twelve, the lift rate of each class among them", () => {
    const listed = readEditableFields(SAMPLE_PRICE_BOOK).filter(
      ({ address }) => address.kind === "hardware",
    );

    expect(listed).toHaveLength(
      SAMPLE_PRICE_BOOK.hardware.tiers.length * HARDWARE_RATE_FIELDS.length,
    );
    expect(
      listed.filter(
        ({ address }) =>
          (address as { field?: string }).field === "perLiftMinor",
      ),
    ).toHaveLength(SAMPLE_PRICE_BOOK.hardware.tiers.length);
  });

  it.each(
    EVERY_RATE_OF_EVERY_CLASS.map(
      ({ tier, field }) => [`${tier.tierId} ${field}`, tier, field] as const,
    ),
  )(
    "%s: one accepted edit gives one diff row at its own address, with its delta",
    (_label, tier, field) => {
      const DRAFTED_DELTA_MINOR = 7_000;
      const edit = editOf(
        tier.tierId,
        field,
        tier[field] + DRAFTED_DELTA_MINOR,
      );

      const result = applyChanges(SAMPLE_PRICE_BOOK, [edit]);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const rows = diffBooks(SAMPLE_PRICE_BOOK, result.book, {
        changes: [edit],
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: "field",
        section: "hardware",
        address: { kind: "hardware", tierId: tier.tierId, field },
        before: tier[field],
        after: tier[field] + DRAFTED_DELTA_MINOR,
        delta: DRAFTED_DELTA_MINOR,
      });
      expect(revertChange([edit], edit.address)).toEqual([]);
    },
  );

  it.each([
    ["the bound", MAX_PRICE_COEFFICIENT_MINOR, true],
    ["one past the bound", MAX_PRICE_COEFFICIENT_MINOR + 1, false],
    ["a negative", -1, false],
    ["a fraction", 0.5, false],
    ["NaN", Number.NaN, false],
    ["a numeric string", "100", false],
    ["zero", 0, true],
  ] as const)(
    "takes %s for the lift rate as it takes it for the hinge rate",
    (_label, value, isAccepted) => {
      const tierId = SAMPLE_PRICE_BOOK.hardware.defaultTierId;
      const verdict = (field: string) =>
        applyChanges(SAMPLE_PRICE_BOOK, [
          editOf(tierId, field, value as number),
        ]).ok;

      expect(verdict("perLiftMinor")).toBe(isAccepted);
      expect(verdict("perLiftMinor")).toBe(verdict("perHingeMinor"));
    },
  );
});

describe("a bulk percentage over the cabinets", () => {
  it("plans changes to cabinet prices alone: none of them addresses a hardware rate", () => {
    const plan = planBulkChange({
      book: SAMPLE_PRICE_BOOK,
      catalog: CATALOG,
      target: { scope: "all" },
      percent: 10,
    });

    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    expect(plan.changes.length).toBeGreaterThan(0);
    for (const planned of plan.changes) {
      expect(JSON.stringify(planned)).not.toContain("perLiftMinor");
      expect(JSON.stringify(planned)).not.toContain("hardware");
    }
  });
});
