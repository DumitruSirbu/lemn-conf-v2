// `applyChanges` judges each change against the running candidate, the book with the earlier changes applied. The seam is
// observed, not replaced: `prepareWrite` is wrapped, it records the book each change was judged against and hands every
// address to the real one. The dependent-change cases use the real creation kind.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { prepareWrite as PrepareWrite } from "../../src/price-dashboard/editable-fields.js";
import { applyChanges } from "../../src/price-dashboard/apply-changes.js";
import type {
  BookFieldAddress,
  HardwareRateField,
  DraftChange,
} from "../../src/price-dashboard/book-field-address.js";
import type { PriceBook } from "../../src/pricing/price-book.js";

import {
  changeOf,
  editSlotsOf,
  PERCENTAGE_BOOK,
  setSlots,
} from "./change-set-books.js";

const CREATED_TIER_ID = "hardware.created";

const seam = vi.hoisted(() => ({ judgedAgainst: [] as PriceBook[] }));

vi.mock(
  "../../src/price-dashboard/editable-fields.js",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../src/price-dashboard/editable-fields.js")
      >();
    const recording: typeof PrepareWrite = (book, address, value) => {
      seam.judgedAgainst.push(book);
      return original.prepareWrite(book, address, value);
    };
    return { ...original, prepareWrite: recording };
  },
);

const createTier = {
  address: { kind: "hardware-tier-created", tierId: CREATED_TIER_ID },
  value: { name: "Created", description: "A class created in the draft." },
} as unknown as DraftChange;

function rateOnCreatedTier(
  field: HardwareRateField,
  value: number,
): DraftChange {
  return {
    address: {
      kind: "hardware",
      tierId: CREATED_TIER_ID,
      field,
    } satisfies BookFieldAddress,
    value,
  } as DraftChange;
}

const [hingeRate, drawerRate, pushRate, liftRate, pushRunnerRate] = [
  rateOnCreatedTier("perHingeMinor", 4_321),
  rateOnCreatedTier("perDrawerMinor", 5_000),
  rateOnCreatedTier("perPushToOpenMinor", 0),
  rateOnCreatedTier("perLiftMinor", 7_000),
  rateOnCreatedTier("perPushRunnerMinor", 9_000),
];

beforeEach(() => {
  seam.judgedAgainst.length = 0;
});

describe("each change is judged against the running candidate", () => {
  const [first, second] = editSlotsOf(PERCENTAGE_BOOK);
  if (first === undefined || second === undefined)
    throw new Error("the fixture has too few slots");

  it("hands the second change the book the first one made, not the base book", () => {
    const edit = { slot: first, value: 77 };

    applyChanges(PERCENTAGE_BOOK, [
      changeOf(edit),
      changeOf({ slot: second, value: 88 }),
    ]);

    expect(seam.judgedAgainst).toHaveLength(2);
    expect(seam.judgedAgainst[0]).toEqual(PERCENTAGE_BOOK);
    expect(seam.judgedAgainst[1]).toEqual(setSlots(PERCENTAGE_BOOK, [edit]));
    expect(seam.judgedAgainst[1]).not.toEqual(PERCENTAGE_BOOK);
  });

  it("does not let a refused change alter the book the next change is judged against", () => {
    const refused = changeOf({ slot: first, value: -1 });

    applyChanges(PERCENTAGE_BOOK, [
      refused,
      changeOf({ slot: second, value: 88 }),
    ]);

    expect(seam.judgedAgainst[1]).toEqual(PERCENTAGE_BOOK);
  });

  it("applies a rate change that names a tier an earlier change created", () => {
    const result = applyChanges(PERCENTAGE_BOOK, [
      createTier,
      hingeRate,
      drawerRate,
      pushRate,
      liftRate,
      pushRunnerRate,
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = result.book.hardware.tiers.find(
      (tier) => tier.tierId === CREATED_TIER_ID,
    );
    expect(created).toMatchObject({
      perHingeMinor: 4_321,
      perDrawerMinor: 5_000,
      perPushToOpenMinor: 0,
      perLiftMinor: 7_000,
      perPushRunnerMinor: 9_000,
    });
  });

  it("judges the rate against a candidate that already holds the created tier, not the base book", () => {
    applyChanges(PERCENTAGE_BOOK, [
      createTier,
      hingeRate,
      drawerRate,
      pushRate,
      liftRate,
      pushRunnerRate,
    ]);

    const [, judgedAtRate] = seam.judgedAgainst;
    expect(judgedAtRate?.hardware.tiers.map((tier) => tier.tierId)).toContain(
      CREATED_TIER_ID,
    );
    expect(
      PERCENTAGE_BOOK.hardware.tiers.map((tier) => tier.tierId),
    ).not.toContain(CREATED_TIER_ID);
  });

  it("refuses the same list reordered at the rate that now comes first, and the creation for the rate it then lacks", () => {
    const result = applyChanges(PERCENTAGE_BOOK, [
      hingeRate,
      createTier,
      drawerRate,
      pushRate,
      liftRate,
      pushRunnerRate,
    ]);

    expect(result).toMatchObject({
      ok: false,
      reason: "changes-refused",
      refusals: [
        { index: 0, code: "UNKNOWN_ITEM" },
        { index: 1, code: "CREATED_TIER_RATES_MISSING" },
      ],
    });
  });
});
