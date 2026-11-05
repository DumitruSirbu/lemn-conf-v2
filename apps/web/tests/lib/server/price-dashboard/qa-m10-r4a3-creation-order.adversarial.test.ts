import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  hardwareRatesOf,
  isSameAddress,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import {
  planChange,
  planRevert,
  type DraftPlan,
} from "@/lib/server/price-dashboard/draft-plans";
import type { RevertAddress } from "@/lib/server/price-dashboard/draft-requests";

const CLASS_ID = "hardware.economic";
const PLINTH_ID = "plinth-light";
const CLASS_ITEM = { kind: "hardware", tierId: CLASS_ID } as const;
const PLINTH_ITEM = { kind: "accessory", accessoryId: PLINTH_ID } as const;

type RowKind = "class" | "accessory";

interface CreatedRow {
  readonly creation: DraftChange;
  readonly dependants: readonly DraftChange[];
}

const RATE_FIELDS = hardwareRatesOf(SAMPLE_PRICE_BOOK);

function classRow(words: {
  name: boolean;
  description: boolean;
  shuffle: readonly number[];
}): CreatedRow {
  const rates = RATE_FIELDS.map(
    (field): DraftChange => ({
      address: { kind: "hardware", tierId: CLASS_ID, field },
      value: 2_000,
    }),
  );
  return {
    creation: {
      address: { kind: "hardware-tier-created", tierId: CLASS_ID },
      value: { name: "GTV Economic", description: "" },
    },
    dependants: ordered(
      [...rates, ...textsOf(CLASS_ITEM, words)],
      words.shuffle,
    ),
  };
}

function accessoryRow(words: {
  name: boolean;
  description: boolean;
  shuffle: readonly number[];
  hasPrice: boolean;
}): CreatedRow {
  const price: DraftChange[] = words.hasPrice
    ? [
        {
          address: {
            kind: "accessory",
            accessoryId: PLINTH_ID,
            field: "perUnitMinor",
          },
          value: 1_500,
        },
      ]
    : [];
  return {
    creation: {
      address: { kind: "accessory-created", accessoryId: PLINTH_ID },
      value: {
        linkedBuildId: "base-3drawer",
        perUnitMinor: 1_000,
        name: "Soclu",
      },
    },
    dependants: ordered(
      [...price, ...textsOf(PLINTH_ITEM, words)],
      words.shuffle,
    ),
  };
}

function textsOf(
  item: typeof CLASS_ITEM | typeof PLINTH_ITEM,
  { name, description }: { name: boolean; description: boolean },
): DraftChange[] {
  const texts: DraftChange[] = [];
  if (name) {
    texts.push({
      address: { kind: "created-row-text", item, field: "name" },
      value: "Nume nou",
    });
  }
  if (description) {
    texts.push({
      address: { kind: "created-row-text", item, field: "description" },
      value: "Descriere noua",
    });
  }
  return texts;
}

/** `items` in the order the permutation key sorts them: any order, since no dependant depends on another. */
function ordered(
  items: readonly DraftChange[],
  keys: readonly number[],
): DraftChange[] {
  return items
    .map((item, index) => ({
      item,
      key: keys[index % keys.length] ?? 0,
      index,
    }))
    .sort((left, right) => left.key - right.key || left.index - right.index)
    .map(({ item }) => item);
}

const UNRELATED: readonly DraftChange[] = [
  { address: { kind: "depth-rule" }, value: 9 },
  { address: { kind: "provisional" }, value: true },
];

const arbitraryRow = fc
  .record({
    kind: fc.constantFrom<RowKind>("class", "accessory"),
    name: fc.boolean(),
    description: fc.boolean(),
    hasPrice: fc.boolean(),
    shuffle: fc.array(fc.integer({ min: 0, max: 5 }), {
      minLength: 1,
      maxLength: 8,
    }),
  })
  .map((shape) =>
    shape.kind === "class" ? classRow(shape) : accessoryRow(shape),
  );

/** A stored draft: the row's creation first and its dependants after it, with the unrelated changes placed anywhere. */
const arbitraryStoredDraft = fc
  .record({
    row: arbitraryRow,
    unrelatedKept: fc.subarray([...UNRELATED]),
    places: fc.array(fc.nat(20), { minLength: 2, maxLength: 2 }),
  })
  .map(({ row, unrelatedKept, places }) => {
    const changes: DraftChange[] = [row.creation, ...row.dependants];
    unrelatedKept.forEach((change, which) => {
      changes.splice((places[which] ?? 0) % (changes.length + 1), 0, change);
    });
    return { row, changes };
  });

function stateWith(changes: readonly DraftChange[]): ActiveDashboardState {
  return {
    book: SAMPLE_PRICE_BOOK,
    draft: { draftRevision: "1", changes },
  } as unknown as ActiveDashboardState;
}

function written(plan: DraftPlan) {
  if (plan.kind !== "write") throw new Error("the plan was refused");
  return plan;
}

function namesRow(change: DraftChange, id: string): boolean {
  return JSON.stringify(change.address).includes(`"${id}"`);
}

function revisedCreation(row: CreatedRow): DraftChange {
  const { address, value } = row.creation;
  return {
    address,
    value: { ...(value as object), name: "Nume revizuit" },
  } as DraftChange;
}

describe("a creation put again keeps every dependant applicable", () => {
  it("starts from stored drafts that apply", () => {
    fc.assert(
      fc.property(arbitraryStoredDraft, ({ changes }) => {
        expect(applyChanges(SAMPLE_PRICE_BOOK, changes).ok).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  propertyTest.prop([arbitraryStoredDraft], { numRuns: 300 })(
    "so the draft applies, the length is unchanged and the creation stands before each change that names its row",
    ({ row, changes }) => {
      const revised = revisedCreation(row);
      const id = JSON.stringify(row.creation.address).includes(CLASS_ID)
        ? CLASS_ID
        : PLINTH_ID;

      const plan = written(
        planChange(
          { address: revised.address as RevertAddress, value: revised.value },
          stateWith(changes),
        ),
      );

      const after = plan.changes;
      expect(applyChanges(SAMPLE_PRICE_BOOK, after).ok).toBe(true);
      expect(after).toHaveLength(changes.length);
      const creationIndex = after.findIndex(({ address }) =>
        isSameAddress(address, revised.address),
      );
      expect(creationIndex).toBe(
        changes.findIndex(({ address }) =>
          isSameAddress(address, revised.address),
        ),
      );
      expect(after[creationIndex]).toEqual(revised);
      after.forEach((change, index) => {
        if (index !== creationIndex && namesRow(change, id)) {
          expect(index).toBeGreaterThan(creationIndex);
        }
      });
    },
  );

  propertyTest.prop([arbitraryStoredDraft], { numRuns: 300 })(
    "and every other change keeps its place relative to the others",
    ({ row, changes }) => {
      const revised = revisedCreation(row);

      const plan = written(
        planChange(
          { address: revised.address as RevertAddress, value: revised.value },
          stateWith(changes),
        ),
      );

      const others = (list: readonly DraftChange[]) =>
        list.filter(({ address }) => !isSameAddress(address, revised.address));
      expect(others(plan.changes)).toEqual(others(changes));
    },
  );

  propertyTest.prop([arbitraryStoredDraft], { numRuns: 200 })(
    "and putting the same creation twice changes nothing the second time",
    ({ row, changes }) => {
      const revised = revisedCreation(row);
      const request = {
        address: revised.address as RevertAddress,
        value: revised.value,
      };
      const once = written(planChange(request, stateWith(changes))).changes;

      const twice = written(planChange(request, stateWith(once))).changes;

      expect(twice).toEqual(once);
    },
  );
});

describe("a revert of a creation leaves no change naming its row", () => {
  propertyTest.prop([arbitraryStoredDraft], { numRuns: 300 })(
    "and keeps every unrelated change, in order",
    ({ row, changes }) => {
      const id = JSON.stringify(row.creation.address).includes(CLASS_ID)
        ? CLASS_ID
        : PLINTH_ID;

      const plan = written(
        planRevert(
          {
            expectedDraftRevision: "1",
            target: {
              kind: "change",
              address: row.creation.address as RevertAddress,
            },
          },
          stateWith(changes),
        ),
      );

      expect(plan.changes.some((change) => namesRow(change, id))).toBe(false);
      expect(plan.changes).toEqual(
        changes.filter((change) => !namesRow(change, id)),
      );
      expect(applyChanges(SAMPLE_PRICE_BOOK, plan.changes).ok).toBe(true);
    },
  );

  propertyTest.prop([arbitraryStoredDraft], { numRuns: 200 })(
    "and the audit row it writes names the creation and counts one revert",
    ({ row, changes }) => {
      const plan = written(
        planRevert(
          {
            expectedDraftRevision: "1",
            target: {
              kind: "change",
              address: row.creation.address as RevertAddress,
            },
          },
          stateWith(changes),
        ),
      );

      expect(plan.entry).toMatchObject({
        action: "price-draft-reverted",
        detail: { changeKind: row.creation.address.kind, revertedCount: 1 },
      });
    },
  );
});
