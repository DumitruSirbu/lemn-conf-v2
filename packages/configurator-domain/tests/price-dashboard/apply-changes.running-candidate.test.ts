// `applyChanges` judges each change against the running candidate, the book with the earlier changes applied. No change
// kind introduces a row until the creation kinds exist, so the dependent-change case is simulated: `prepareWrite` is
// wrapped, it records the book each change was judged against, and for a creation address it supplies the updater the
// creation kind will have. The wrapper hands every other address to the real `prepareWrite`.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { prepareWrite as PrepareWrite } from "../../src/price-dashboard/editable-fields.js";
import { applyChanges } from "../../src/price-dashboard/apply-changes.js";
import type {
  BookFieldAddress,
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
    const wrapped: typeof PrepareWrite = (book, address, value) => {
      seam.judgedAgainst.push(book);
      if (address.kind !== "hardware-tier-created")
        return original.prepareWrite(book, address, value);
      return {
        ok: true,
        value: (target) => withCreatedTier(target),
      };
    };
    return { ...original, prepareWrite: wrapped };
  },
);

function withCreatedTier(book: PriceBook): PriceBook {
  const template = book.hardware.tiers[0];
  if (template === undefined)
    throw new Error("the fixture has no hardware tier");
  return {
    ...book,
    hardware: {
      ...book.hardware,
      tiers: [
        ...book.hardware.tiers,
        { ...template, tierId: CREATED_TIER_ID, ruleId: CREATED_TIER_ID },
      ],
    },
  };
}

const createTier = {
  address: { kind: "hardware-tier-created", tierId: CREATED_TIER_ID },
  value: { name: "Created", description: "A class created in the draft." },
} as unknown as DraftChange;

const rateOnCreatedTier = {
  address: {
    kind: "hardware",
    tierId: CREATED_TIER_ID,
    field: "perHingeMinor",
  } satisfies BookFieldAddress,
  value: 4_321,
} as DraftChange;

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

  it("applies a change that names a tier an earlier change introduced", () => {
    const result = applyChanges(PERCENTAGE_BOOK, [
      createTier,
      rateOnCreatedTier,
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = result.book.hardware.tiers.find(
      (tier) => tier.tierId === CREATED_TIER_ID,
    );
    expect(created?.perHingeMinor).toBe(4_321);
  });

  it("refuses the same list reordered, at the change that now comes first, and not the creation", () => {
    const result = applyChanges(PERCENTAGE_BOOK, [
      rateOnCreatedTier,
      createTier,
    ]);

    expect(result).toMatchObject({
      ok: false,
      reason: "changes-refused",
      refusals: [{ index: 0, code: "UNKNOWN_ITEM" }],
    });
  });
});
