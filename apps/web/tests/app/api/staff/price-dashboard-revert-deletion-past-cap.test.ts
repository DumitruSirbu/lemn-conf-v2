import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  applyChanges,
  revertChange,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { jsonOf } from "../../../support/account-world";
import {
  ACCESSORY_VALUE,
  CLASS_WORDS,
  plantDraft,
  ratesOf,
  revertAs,
  startCreationWorld,
  storedChangesOf,
  type CreationWorld,
} from "../../../support/creation-world";
import { judgeDraft } from "@/price-dashboard/draft-judgement";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

// Taking back a deletion past the bound (20 classes, 50 linked accessories) leaves a candidate that is no book, so the
// revert is `candidate-refused`. The route refuses a revert naming `item-deleted` first (`draft-requests.ts`
// `withAddress`, `draft-plans.ts` `removalOfChange`), so the first arms judge what `planRevert` will judge.

const MOST_ACCESSORIES = 50;
const MOST_CLASSES = 20;
const PLINTH_LIGHT_ID = "plinthlight";
const PLINTH_LIGHT: ItemRef = {
  kind: "accessory",
  accessoryId: PLINTH_LIGHT_ID,
};
const PREMIUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };

const BOOK_WITH_ACCESSORY: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    {
      accessoryId: PLINTH_LIGHT_ID,
      ruleId: `accessory.${PLINTH_LIGHT_ID}`,
      linkedBuildId: ACCESSORY_VALUE.linkedBuildId,
      perUnitMinor: 1_000,
      name: "Soclu luminos",
    },
  ],
};

function deletion(item: ItemRef): DraftChange {
  return {
    address: { kind: "item-deleted", item },
    value: true,
  } as unknown as DraftChange;
}

function createdAccessory(index: number): DraftChange {
  return {
    address: {
      kind: "accessory-created",
      accessoryId: `createdaccessory${String(index)}`,
    },
    value: ACCESSORY_VALUE,
  } as unknown as DraftChange;
}

function createdClass(index: number): DraftChange[] {
  const tierId = `createdclass${String(index)}`;
  return [
    {
      address: { kind: "hardware-tier-created", tierId },
      value: CLASS_WORDS,
    } as unknown as DraftChange,
    ...HARDWARE_RATE_FIELDS.map(
      (field) =>
        ({
          address: { kind: "hardware", tierId, field },
          value: ratesOf(2_000)[field],
        }) as DraftChange,
    ),
  ];
}

/** The draft that deletes one row and creates until the book is exactly at its bound. */
interface AtTheBound {
  readonly book: PriceBook;
  readonly item: ItemRef;
  readonly changes: readonly DraftChange[];
}

function accessoriesAtTheBound(): AtTheBound {
  const created = Array.from({ length: MOST_ACCESSORIES }, (_, index) =>
    createdAccessory(index),
  );
  return {
    book: BOOK_WITH_ACCESSORY,
    item: PLINTH_LIGHT,
    changes: [deletion(PLINTH_LIGHT), ...created],
  };
}

function classesAtTheBound(): AtTheBound {
  const kept = SAMPLE_PRICE_BOOK.hardware.tiers.length - 1;
  const created = Array.from({ length: MOST_CLASSES - kept }, (_, index) =>
    createdClass(index),
  ).flat();
  return {
    book: SAMPLE_PRICE_BOOK,
    item: PREMIUM,
    changes: [deletion(PREMIUM), ...created],
  };
}

const BOUNDS: readonly { name: string; atTheBound: () => AtTheBound }[] = [
  { name: "the fiftieth linked accessory", atTheBound: accessoriesAtTheBound },
  { name: "the twentieth hardware class", atTheBound: classesAtTheBound },
];

describe.each(BOUNDS)(
  "taking back a deletion that frees the place of $name",
  ({ atTheBound }) => {
    it("leaves a draft that applies while the deletion stands, so the bound is exactly reached", () => {
      const { book, changes } = atTheBound();

      expect(applyChanges(book, changes).ok).toBe(true);
    });

    it("is a candidate that is not a book, so the revert is judged candidate-refused", () => {
      const { book, item, changes } = atTheBound();
      const remaining = revertChange(changes, {
        kind: "item-deleted",
        item,
      } as never);

      const candidate = applyChanges(book, remaining);
      const judgement = judgeDraft({
        book,
        changes: remaining,
        firstNewIndex: remaining.length,
        stored: changes,
      });

      expect(remaining).toHaveLength(changes.length - 1);
      expect(candidate).toMatchObject({
        ok: false,
        reason: "candidate-refused",
      });
      expect(judgement).toEqual({ kind: "candidate-refused" });
    });
  },
);

describe("the revert route, over a stored draft that deletes a row and fills its place", () => {
  let world: CreationWorld;

  beforeEach(async () => {
    world = await startCreationWorld(BOOK_WITH_ACCESSORY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Answers 400 NOT_EDITABLE until R4c2 lets a revert take back a deletion by its own address; it flips to `it` then.
  it.fails(
    "answers 409 candidate-refused, and the store holds the one draft revision it held",
    async () => {
      const { changes, item } = accessoriesAtTheBound();
      await plantDraft(world, changes);
      const before = await world.prices.stores.priceBook.readDraft();

      const answer = await revertAs(world.cookie, {
        kind: "change",
        address: { kind: "item-deleted", item },
      });

      expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
        status: 409,
        body: { status: "candidate-refused" },
      });
      expect(await world.prices.stores.priceBook.readDraft()).toEqual(before);
      expect(await storedChangesOf(world.prices)).toEqual(changes);
    },
  );
});
