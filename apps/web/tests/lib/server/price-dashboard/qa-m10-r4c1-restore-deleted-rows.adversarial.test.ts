import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  deletedItemsOf,
  hardwareRatesOf,
  isSameItem,
  readEditableFields,
  restoreChanges,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type { StoredPriceVersion } from "@lemnaria/persistence";

import {
  planRestore,
  planRestoreToDraft,
} from "@/lib/server/price-dashboard/restore-plan";
import { judgeDraft } from "@/price-dashboard/draft-judgement";

import { deleting } from "../../../support/planted-draft";
import {
  ACTIVE,
  PAINTED,
  PLINTH,
  PLINTH_LIGHT_ID,
  PREMIUM,
  SOFT_CLOSE,
  VENEER,
  anchorChange,
  asChange,
  isOnRow,
  pendingOn,
  stateOf,
  withAnchor,
  withRowRepriced,
} from "../../../support/restore-book-fixtures";

// The restore plan beside a draft that deletes a row. Every deletable kind, alone and beside other changes, against an
// archived version that prices the row, does not state it, or moves other fields. The draft a restore leaves must still
// apply, keep every deletion and every change the draft made to a row it deletes, and a refused stored draft must still
// be answered by the rule that ignores deleted rows.

const CREATED_CLASS_ID = "Qa4c1CreatedClass0001";
const CREATED_ACCESSORY_ID = "Qa4c1CreatedAccessory01";

const CREATED_CLASS: ItemRef = { kind: "hardware", tierId: CREATED_CLASS_ID };
const CREATED_ACCESSORY: ItemRef = {
  kind: "accessory",
  accessoryId: CREATED_ACCESSORY_ID,
};

function creatingClass(tierId: string, rate = 2_000): DraftChange[] {
  return [
    asChange({
      address: { kind: "hardware-tier-created", tierId },
      value: { name: "GTV Economic", description: "Mecanisme simple" },
    }),
    ...hardwareRatesOf(ACTIVE).map((field) =>
      asChange({ address: { kind: "hardware", tierId, field }, value: rate }),
    ),
  ];
}

function creatingAccessory(accessoryId: string): DraftChange {
  return asChange({
    address: { kind: "accessory-created", accessoryId },
    value: {
      linkedBuildId: "base-3drawer",
      perUnitMinor: 1_500,
      name: "Soclu",
    },
  });
}

function withoutRow(book: PriceBook, item: ItemRef): PriceBook {
  switch (item.kind) {
    case "material":
      return {
        ...book,
        material: {
          ...book.material,
          tiers: book.material.tiers.filter((t) => t.tierId !== item.tierId),
        },
      };
    case "hardware":
      return {
        ...book,
        hardware: {
          ...book.hardware,
          tiers: book.hardware.tiers.filter((t) => t.tierId !== item.tierId),
        },
      };
    case "accessory":
      return {
        ...book,
        linkedAccessories: book.linkedAccessories.filter(
          (l) => l.accessoryId !== item.accessoryId,
        ),
      };
    default:
      throw new Error(`${item.kind} rows carry no price`);
  }
}

/** A book that states a row of the created id: what no real archive holds, since an id is minted once. */
function withCollidingRow(book: PriceBook, item: ItemRef): PriceBook {
  if (item.kind === "hardware") {
    const [template] = book.hardware.tiers;
    if (template === undefined) throw new Error("no class");
    const { nameKey, descriptionKey, ...plain } =
      template as typeof template & {
        nameKey?: string;
        descriptionKey?: string;
      };
    void nameKey;
    void descriptionKey;
    return {
      ...book,
      hardware: {
        ...book.hardware,
        tiers: [
          ...book.hardware.tiers,
          {
            ...plain,
            tierId: item.tierId,
            ruleId: item.tierId,
            name: "Colliding",
            description: "x",
          },
        ],
      },
    };
  }
  if (item.kind === "accessory") {
    return {
      ...book,
      linkedAccessories: [
        ...book.linkedAccessories,
        {
          accessoryId: item.accessoryId,
          ruleId: `accessory.${item.accessoryId}`,
          linkedBuildId: "base-3drawer",
          perUnitMinor: 7_000,
          name: "Colliding",
        },
      ],
    };
  }
  throw new Error("not a created kind");
}

function sameChange(left: DraftChange, right: DraftChange): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function deletionChanges(draft: readonly DraftChange[]): DraftChange[] {
  return draft.filter(({ address }) => address.kind === "item-deleted");
}

function fieldValues(book: PriceBook): Map<string, unknown> {
  return new Map(
    readEditableFields(book).map(({ address, value }) => [
      JSON.stringify(address),
      value,
    ]),
  );
}

interface ContractInput {
  readonly archived: PriceBook;
  readonly active: PriceBook;
  readonly draft: readonly DraftChange[];
}

type RestoreOutcome = ContractInput & {
  readonly plan: ReturnType<typeof planRestoreToDraft>;
};

function expectTheDraftStillApplies({ active, plan }: RestoreOutcome) {
  expect(
    applyChanges(active, plan.draft).ok,
    "the restored draft applies",
  ).toBe(true);
}

function expectEveryDeletionKeptInOrder({ draft, plan }: RestoreOutcome) {
  expect(
    deletionChanges(plan.draft),
    "the deletions of the draft, in order",
  ).toEqual(deletionChanges(draft));
}

function expectChangesToDeletedRowsUntouched({ draft, plan }: RestoreOutcome) {
  for (const item of deletedItemsOf(draft)) {
    expect(
      plan.draft.filter((change) => isOnRow(change, item)),
      `the changes to the deleted row ${JSON.stringify(item)}`,
    ).toEqual(draft.filter((change) => isOnRow(change, item)));
  }
}

function expectCandidateToReproduceTheArchive({
  archived,
  active,
  plan,
}: RestoreOutcome) {
  const candidate = applyChanges(active, plan.draft);
  if (!candidate.ok) throw new Error("the restored draft does not apply");
  const candidateValues = fieldValues(candidate.book);
  for (const reading of readEditableFields(archived)) {
    const key = JSON.stringify(reading.address);
    if (!candidateValues.has(key)) continue;
    expect(candidateValues.get(key), `the field ${key}`).toBe(reading.value);
  }
}

function expectAddedCountToExcludeDeletedRows({
  archived,
  active,
  draft,
  plan,
}: RestoreOutcome) {
  const deleted = deletedItemsOf(draft);
  const restoredOffDeletedRows = restoreChanges(archived, active).filter(
    (change) => !deleted.some((item) => isOnRow(change as DraftChange, item)),
  );
  expect(plan.addedChangeCount, "the count of changes added").toBe(
    restoredOffDeletedRows.length,
  );
}

function expectASecondRestoreToHaveNothingToDo({
  archived,
  active,
  plan,
}: RestoreOutcome) {
  const again = planRestoreToDraft({ archived, active, draft: plan.draft });
  expect(again.differingCount, "the fields a second restore changes").toBe(0);
}

function expectTheDraftJudgeToAllow({ active, draft, plan }: RestoreOutcome) {
  const judged = judgeDraft({
    book: active,
    changes: plan.draft,
    stored: draft,
    firstNewIndex: plan.draft.length,
  });
  expect(judged.kind, "the draft judge's verdict").toBe("applies");
}

/** What a restore owes whatever the draft and the archive hold, given a draft that applies (each named above). */
function expectRestoreContract(input: ContractInput) {
  const plan = planRestoreToDraft(input);
  const outcome = { ...input, plan };
  expectTheDraftStillApplies(outcome);
  expectEveryDeletionKeptInOrder(outcome);
  expectChangesToDeletedRowsUntouched(outcome);
  expectCandidateToReproduceTheArchive(outcome);
  expectAddedCountToExcludeDeletedRows(outcome);
  expectASecondRestoreToHaveNothingToDo(outcome);
  expectTheDraftJudgeToAllow(outcome);
  return plan;
}

interface BaseRow {
  readonly name: string;
  readonly item: ItemRef;
}
const BASE_ROWS: readonly BaseRow[] = [
  { name: "a material", item: VENEER },
  { name: "a hardware class", item: PREMIUM },
  { name: "a linked accessory", item: PLINTH },
];

describe.each(BASE_ROWS)(
  "a restore beside a draft that deletes $name of the active book",
  ({ item }) => {
    const otherItem =
      item.kind === "material"
        ? PAINTED
        : item.kind === "hardware"
          ? SOFT_CLOSE
          : VENEER;
    const archivedVariants: readonly (readonly [string, PriceBook])[] = [
      [
        "prices the row differently and moves an anchor",
        withAnchor(withRowRepriced(ACTIVE, item), 520_000),
      ],
      [
        "states the row as the active book does and moves an anchor",
        withAnchor(ACTIVE, 520_000),
      ],
      [
        "does not state the row at all",
        withAnchor(withoutRow(ACTIVE, item), 520_000),
      ],
      ["differs only on the row", withRowRepriced(ACTIVE, item)],
      [
        "differs on the row and on another row",
        withRowRepriced(withRowRepriced(ACTIVE, item), otherItem),
      ],
    ];
    const drafts: readonly (readonly [string, readonly DraftChange[]])[] = [
      ["alone", deleting(item)],
      [
        "beside other changes, one of them on the row before its deletion",
        [
          anchorChange(610_000),
          pendingOn(item, 31),
          ...deleting(item),
          pendingOn(otherItem, 22),
          ...deleting(otherItem),
        ],
      ],
      [
        "with the deletion first and a change elsewhere after it",
        [...deleting(item), anchorChange(610_000)],
      ],
    ];

    describe.each(archivedVariants)(
      "when the archived version %s",
      (_title, archived) => {
        it.each(drafts)(
          "keeps the contract with a draft %s",
          (_draftTitle, draft) => {
            expect(applyChanges(ACTIVE, draft).ok).toBe(true);
            expectRestoreContract({ archived, active: ACTIVE, draft });
          },
        );
      },
    );

    it("writes exactly [pending change, deletion, surviving change, restored change] for the combined draft", () => {
      const archived = withAnchor(withRowRepriced(ACTIVE, item), 520_000);
      const draft = [
        pendingOn(item, 31),
        ...deleting(item),
        pendingOn(SOFT_CLOSE.kind === item.kind ? PAINTED : SOFT_CLOSE, 22),
      ];
      if (applyChanges(ACTIVE, draft).ok) {
        const plan = planRestoreToDraft({ archived, active: ACTIVE, draft });

        expect(plan.draft.slice(0, 2)).toEqual([
          pendingOn(item, 31),
          ...deleting(item),
        ]);
        expect(plan.draft.at(-1)).toEqual(anchorChange(520_000));
        expect(plan.addedChangeCount).toBe(1);
      }
    });
  },
);

describe.each([
  ["a class the draft creates", CREATED_CLASS, creatingClass(CREATED_CLASS_ID)],
  [
    "an accessory the draft creates",
    CREATED_ACCESSORY,
    [creatingAccessory(CREATED_ACCESSORY_ID)],
  ],
] as const)(
  "a restore beside a draft that creates and deletes %s",
  (_name, item, creation) => {
    type NamedDrafts = readonly (readonly [string, readonly DraftChange[]])[];
    const draftsThatDelete: NamedDrafts = [
      ["alone", [...creation, ...deleting(item)]],
      [
        "with a pending price on it before the deletion",
        [...creation, pendingOn(item, 3_333), ...deleting(item)],
      ],
      [
        "beside other changes and another deletion",
        [
          anchorChange(610_000),
          ...creation,
          pendingOn(item, 3_333),
          ...deleting(item),
          ...deleting(VENEER),
        ],
      ],
    ];
    const draftKeepingTheCreation: NamedDrafts = [
      [
        "with the creation kept (not deleted)",
        [anchorChange(610_000), ...creation],
      ],
    ];
    // An archive never states an id minted for a draft's own row. The collision is a hostile stand-in, and only a draft that
    // deletes the row puts that row outside the restore.
    const archivedVariants: readonly (readonly [
      string,
      PriceBook,
      NamedDrafts,
    ])[] = [
      [
        "moves an anchor (no archive states a created row)",
        withAnchor(ACTIVE, 520_000),
        [...draftsThatDelete, ...draftKeepingTheCreation],
      ],
      [
        "moves an anchor and, by an impossible collision, states the created id",
        withAnchor(withCollidingRow(ACTIVE, item), 520_000),
        draftsThatDelete,
      ],
    ];

    describe.each(archivedVariants)(
      "when the archived version %s",
      (_title, archived, drafts) => {
        it.each(drafts)(
          "keeps the contract with a draft %s",
          (_draftTitle, draft) => {
            expect(applyChanges(ACTIVE, draft).ok).toBe(true);
            const plan = expectRestoreContract({
              archived,
              active: ACTIVE,
              draft,
            });
            for (const change of creation) {
              expect(plan.draft.some((kept) => sameChange(kept, change))).toBe(
                true,
              );
            }
          },
        );
      },
    );
  },
);

describe("a restore beside a draft that deletes a row and creates another", () => {
  it("keeps a deletion of a book row and the creation of a fresh id", () => {
    const draft = [...deleting(PREMIUM), ...creatingClass(CREATED_CLASS_ID)];
    const archived = withAnchor(withRowRepriced(ACTIVE, PREMIUM), 520_000);

    const plan = expectRestoreContract({ archived, active: ACTIVE, draft });

    expect(plan.draft.slice(0, draft.length)).toEqual(draft);
  });

  it("answers candidate-refused, not a write, when the draft deletes a created row and creates its id again", async () => {
    const draft = [
      ...creatingClass(CREATED_CLASS_ID),
      ...deleting(CREATED_CLASS),
      ...creatingClass(CREATED_CLASS_ID),
    ];
    expect(applyChanges(ACTIVE, draft).ok).toBe(false);

    const plan = planRestore(
      versionOf(withAnchor(ACTIVE, 520_000)),
      stateOf(ACTIVE, draft),
    );

    expect(plan.kind).toBe("refused");
    if (plan.kind === "refused") {
      expect(plan.response.status).toBe(409);
      expect(await plan.response.json()).toEqual({
        status: "candidate-refused",
      });
    }
  });

  it("answers candidate-refused when a book row is deleted and its id created again", async () => {
    const draft = [...deleting(PREMIUM), ...creatingClass(PREMIUM.tierId)];
    expect(applyChanges(ACTIVE, draft).ok).toBe(false);

    const plan = planRestore(
      versionOf(withAnchor(ACTIVE, 520_000)),
      stateOf(ACTIVE, draft),
    );

    expect(plan.kind).toBe("refused");
    if (plan.kind === "refused") {
      expect(await plan.response.json()).toEqual({
        status: "candidate-refused",
      });
    }
  });
});

function versionOf(book: PriceBook, sequenceNumber = 1): StoredPriceVersion {
  return {
    state: "archived",
    sequenceNumber,
    book,
  } as unknown as StoredPriceVersion;
}

describe("planRestore beside a draft that deletes a row", () => {
  it("writes [deletion, restored change] and answers with the count of the changes it added", async () => {
    const plan = planRestore(
      versionOf(withAnchor(withRowRepriced(ACTIVE, VENEER), 520_000)),
      stateOf(ACTIVE, deleting(VENEER)),
    );

    expect(plan.kind).toBe("write");
    if (plan.kind !== "write") return;
    expect(plan.changes).toEqual([...deleting(VENEER), anchorChange(520_000)]);
    expect(plan.entry).toEqual({
      action: "price-restored-to-draft",
      detail: { fromSequenceNumber: 1, changeCount: 1 },
    });
    expect(await plan.answer("8").json()).toEqual({
      draft: { draftRevision: "8", changes: plan.changes },
      addedChangeCount: 1,
    });
  });

  it("is nothing-differs when only the deleted row differs, and a restore of the active book's own prices is too", async () => {
    for (const archived of [withRowRepriced(ACTIVE, VENEER), ACTIVE]) {
      const plan = planRestore(
        versionOf(archived),
        stateOf(ACTIVE, deleting(VENEER)),
      );

      expect(plan.kind).toBe("refused");
      if (plan.kind === "refused") {
        expect(plan.response.status).toBe(409);
        expect(await plan.response.json()).toEqual({
          status: "nothing-differs",
        });
      }
    }
  });

  it("is nothing-differs for a draft that deletes every deletable row when the archive differs on those rows only", async () => {
    const everyRow = [VENEER, PAINTED, PREMIUM, SOFT_CLOSE, PLINTH];
    const archived = everyRow.reduce(withRowRepriced, ACTIVE);

    const plan = planRestore(
      versionOf(archived),
      stateOf(ACTIVE, deleting(...everyRow)),
    );

    expect(plan.kind).toBe("refused");
    if (plan.kind === "refused") {
      expect(await plan.response.json()).toEqual({ status: "nothing-differs" });
    }
  });

  // The candidate of a refused draft is not a book, so the differing fields are read from the active book: the filter on
  // `differing` is what keeps a deleted row's fields out of the count then. `[delete T, rate on T]` is such a draft (the
  // rate names a row that is gone) and only a store written out of band can hold it.
  it("is nothing-differs, not candidate-refused, for a stored draft that is refused and differs from the archive on the deleted row only", async () => {
    const stale = [...deleting(VENEER), pendingOn(VENEER, 33)];
    expect(applyChanges(ACTIVE, stale).ok).toBe(false);

    const plan = planRestore(
      versionOf(withRowRepriced(ACTIVE, VENEER)),
      stateOf(ACTIVE, stale),
    );

    expect(plan.kind).toBe("refused");
    if (plan.kind === "refused") {
      expect(plan.response.status).toBe(409);
      expect(await plan.response.json()).toEqual({ status: "nothing-differs" });
    }
  });

  it("stays candidate-refused when a stale change names a rule no book states, since the restore cannot drop it", () => {
    const stale = [
      ...deleting(VENEER),
      asChange({
        address: {
          kind: "cabinet",
          ruleId: "cabinet.gone",
          field: "anchorMinor",
        },
        value: 5_000,
      }),
      anchorChange(610_000),
    ];
    expect(applyChanges(ACTIVE, stale).ok).toBe(false);

    const plan = planRestore(
      versionOf(withAnchor(ACTIVE, 520_000)),
      stateOf(ACTIVE, stale),
    );

    // The stale change names a rule no book states, so the restore cannot drop it: the draft stays refused, and the person
    // reverts that change. The deletion is not what refuses it.
    expect(plan.kind).toBe("refused");
  });

  it("closes every refusal over a bare status, naming no row, id or count", async () => {
    const scenarios: readonly [string, ReturnType<typeof planRestore>][] = [
      [
        "nothing-differs",
        planRestore(
          versionOf(withRowRepriced(ACTIVE, PLINTH)),
          stateOf(ACTIVE, deleting(PLINTH)),
        ),
      ],
      [
        "candidate-refused",
        planRestore(
          versionOf(withAnchor(ACTIVE, 520_000)),
          stateOf(ACTIVE, [...deleting(PLINTH), pendingOn(PLINTH, 4_444)]),
        ),
      ],
    ];

    for (const [status, plan] of scenarios) {
      expect(plan.kind).toBe("refused");
      if (plan.kind !== "refused") continue;
      const text = JSON.stringify(await plan.response.json());
      expect(text).toBe(JSON.stringify({ status }));
      expect(text).not.toContain(PLINTH_LIGHT_ID);
    }
  });
});

const PRICE_POOL: readonly {
  readonly item: ItemRef | "anchor";
  readonly make: (value: number) => DraftChange;
  readonly range: readonly [number, number];
}[] = [
  { item: VENEER, make: (value) => pendingOn(VENEER, value), range: [1, 60] },
  { item: PAINTED, make: (value) => pendingOn(PAINTED, value), range: [1, 60] },
  {
    item: PREMIUM,
    make: (value) => pendingOn(PREMIUM, value),
    range: [1_000, 90_000],
  },
  {
    item: SOFT_CLOSE,
    make: (value) => pendingOn(SOFT_CLOSE, value),
    range: [1_000, 90_000],
  },
  {
    item: PLINTH,
    make: (value) => pendingOn(PLINTH, value),
    range: [100, 9_000],
  },
  { item: "anchor", make: anchorChange, range: [300_000, 700_000] },
];

const priceEdit: fc.Arbitrary<{
  readonly row: number;
  readonly change: DraftChange;
}> = fc.nat(PRICE_POOL.length - 1).chain((row) => {
  const entry = PRICE_POOL[row];
  if (entry === undefined) throw new Error("no such pool entry");
  return fc
    .integer({ min: entry.range[0], max: entry.range[1] })
    .map((value) => ({ row, change: entry.make(value) }));
});

const priceEdits = fc.array(priceEdit, { maxLength: 6 });

function archiveMadeBy(
  edits: readonly { readonly change: DraftChange }[],
): PriceBook | undefined {
  const applied = applyChanges(
    ACTIVE,
    edits.map(({ change }) => change),
  );
  return applied.ok ? applied.book : undefined;
}

describe("a restore beside a draft that deletes nothing", () => {
  const ACTIVE_ANCHOR_MINOR = 480_000;
  const ARCHIVED_ANCHOR_MINOR = 520_000;
  const PENDING_ANCHOR_MINOR = 610_000;
  const archivedMovingTheAnchor = withAnchor(ACTIVE, ARCHIVED_ANCHOR_MINOR);

  // Literal expectations of the plan for drafts without a deletion: the deleted-row rules must not change them.
  const FIXTURES: readonly {
    readonly name: string;
    readonly archived: PriceBook;
    readonly draft: readonly DraftChange[];
    readonly expected: {
      readonly draft: readonly DraftChange[];
      readonly addedChangeCount: number;
      readonly differingCount: number;
    };
  }[] = [
    {
      name: "an empty draft takes the archived anchor",
      archived: archivedMovingTheAnchor,
      draft: [],
      expected: {
        draft: [anchorChange(ARCHIVED_ANCHOR_MINOR)],
        addedChangeCount: 1,
        differingCount: 1,
      },
    },
    {
      name: "a pending anchor is replaced by the archived one",
      archived: archivedMovingTheAnchor,
      draft: [anchorChange(PENDING_ANCHOR_MINOR)],
      expected: {
        draft: [anchorChange(ARCHIVED_ANCHOR_MINOR)],
        addedChangeCount: 1,
        differingCount: 1,
      },
    },
    {
      name: "a pending anchor equal to the active one is replaced by the archived one",
      archived: archivedMovingTheAnchor,
      draft: [anchorChange(ACTIVE_ANCHOR_MINOR)],
      expected: {
        draft: [anchorChange(ARCHIVED_ANCHOR_MINOR)],
        addedChangeCount: 1,
        differingCount: 1,
      },
    },
    {
      name: "a pending anchor equal to the archived one counts nothing differing",
      archived: archivedMovingTheAnchor,
      draft: [anchorChange(ARCHIVED_ANCHOR_MINOR)],
      expected: {
        draft: [anchorChange(ARCHIVED_ANCHOR_MINOR)],
        addedChangeCount: 1,
        differingCount: 0,
      },
    },
    {
      name: "a pending change is reverted when the archive holds the active prices",
      archived: ACTIVE,
      draft: [anchorChange(PENDING_ANCHOR_MINOR)],
      expected: { draft: [], addedChangeCount: 0, differingCount: 1 },
    },
    {
      name: "a pending change to a row the archive does not state stays",
      archived: withoutRow(ACTIVE, VENEER),
      draft: [pendingOn(VENEER, 31)],
      expected: {
        draft: [pendingOn(VENEER, 31)],
        addedChangeCount: 0,
        differingCount: 0,
      },
    },
  ];

  it.each(FIXTURES)("$name", ({ archived, draft, expected }) => {
    expect(applyChanges(ACTIVE, draft).ok).toBe(true);

    expect(planRestoreToDraft({ archived, active: ACTIVE, draft })).toEqual({
      draft: expected.draft,
      addedChangeCount: expected.addedChangeCount,
      differingCount: expected.differingCount,
    });
  });
});

interface DraftUnits {
  readonly units: readonly (readonly DraftChange[])[];
}

const DELETABLE_BOOK_ROWS: readonly ItemRef[] = [
  VENEER,
  PAINTED,
  PREMIUM,
  SOFT_CLOSE,
  PLINTH,
];

const generatedDraft: fc.Arbitrary<DraftUnits> = fc
  .record({
    pendings: priceEdits,
    deletedRows: fc.subarray([...DELETABLE_BOOK_ROWS]),
    classCreation: fc.constantFrom(
      "none",
      "kept",
      "pending-then-deleted",
      "deleted",
    ),
    accessoryCreation: fc.constantFrom(
      "none",
      "kept",
      "pending-then-deleted",
      "deleted",
    ),
  })
  .chain(({ pendings, deletedRows, classCreation, accessoryCreation }) => {
    const units: (readonly DraftChange[])[] = [
      ...pendings.map(({ change }) => [change]),
      ...deletedRows.map((item) => deleting(item)),
      ...createdUnit(
        CREATED_CLASS,
        creatingClass(CREATED_CLASS_ID),
        classCreation,
      ),
      ...createdUnit(
        CREATED_ACCESSORY,
        [creatingAccessory(CREATED_ACCESSORY_ID)],
        accessoryCreation,
      ),
    ];
    return fc
      .shuffledSubarray(units, {
        minLength: units.length,
        maxLength: units.length,
      })
      .map((ordered) => ({ units: ordered }));
  });

function createdUnit(
  item: ItemRef,
  creation: readonly DraftChange[],
  how: string,
): readonly (readonly DraftChange[])[] {
  if (how === "none") return [];
  if (how === "kept") return [creation];
  const pending =
    how === "pending-then-deleted" ? [pendingOn(item, 4_321)] : [];
  return [[...creation, ...pending, ...deleting(item)]];
}

describe("a restore beside any generated draft (property)", () => {
  it("leaves a draft that applies, keeps every deletion and every change to a deleted row, and reproduces the archive elsewhere", () => {
    let judgedRuns = 0;
    let runsThatDeleteABookRow = 0;
    let runsWithAPendingChangeOnADeletedRow = 0;
    fc.assert(
      fc.property(priceEdits, generatedDraft, (archiveEdits, { units }) => {
        const archived = archiveMadeBy(archiveEdits);
        fc.pre(archived !== undefined);
        const draft = units.flat();
        fc.pre(applyChanges(ACTIVE, draft).ok);
        const deleted = deletedItemsOf(draft);
        judgedRuns += 1;
        if (
          deleted.some((item) =>
            DELETABLE_BOOK_ROWS.some((row) => isSameItem(row, item)),
          )
        )
          runsThatDeleteABookRow += 1;
        if (
          draft.some((change) => deleted.some((item) => isOnRow(change, item)))
        )
          runsWithAPendingChangeOnADeletedRow += 1;

        expectRestoreContract({ archived, active: ACTIVE, draft });
      }),
      { numRuns: 400 },
    );

    // The generator must reach what the property is about, not be filtered down to the drafts without a deletion.
    expect(judgedRuns).toBeGreaterThanOrEqual(150);
    expect(runsThatDeleteABookRow).toBeGreaterThanOrEqual(60);
    expect(runsWithAPendingChangeOnADeletedRow).toBeGreaterThanOrEqual(30);
  });

  it("never answers a write the draft route's own judge refuses, and never a write when nothing differs", () => {
    fc.assert(
      fc.property(priceEdits, generatedDraft, (archiveEdits, { units }) => {
        const archived = archiveMadeBy(archiveEdits);
        fc.pre(archived !== undefined);
        const draft = units.flat();
        fc.pre(applyChanges(ACTIVE, draft).ok);

        const plan = planRestore(versionOf(archived), stateOf(ACTIVE, draft));

        if (plan.kind === "write") {
          expect(applyChanges(ACTIVE, plan.changes).ok).toBe(true);
          expect(deletedItemsOf(plan.changes).length).toBe(
            deletedItemsOf(draft).length,
          );
        }
        const deleted = deletedItemsOf(draft);
        const differsOffDeletedRows = restoreChanges(archived, ACTIVE).some(
          (change) =>
            !deleted.some((item) => isOnRow(change as DraftChange, item)),
        );
        if (plan.kind === "refused") {
          expect(plan.response.status).toBe(409);
        }
        if (differsOffDeletedRows && plan.kind === "refused") {
          // A restore that moves a field of a kept row is refused only when the candidate already reproduces the archive.
          const candidate = applyChanges(ACTIVE, draft);
          expect(
            candidate.ok &&
              restoreChanges(archived, candidate.book).length === 0,
          ).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe("the item helpers the rules lean on", () => {
  it("name a hardware class and a material of one tier id as two rows", () => {
    expect(
      isSameItem(
        { kind: "hardware", tierId: "x" },
        { kind: "material", tierId: "x" },
      ),
    ).toBe(false);
  });
});

describe("a restore beside the largest draft the book's bounds allow", () => {
  const MANY = 25;

  function bookWithAccessories(count: number): PriceBook {
    return {
      ...SAMPLE_PRICE_BOOK,
      linkedAccessories: Array.from({ length: count }, (_, index) => ({
        accessoryId: `plinth${String(index)}`,
        ruleId: `accessory.plinth${String(index)}`,
        linkedBuildId: "base-3drawer",
        perUnitMinor: 1_000 + index,
        name: `Soclu ${String(index)}`,
      })),
    };
  }

  function shiftedPrices(book: PriceBook): PriceBook {
    return {
      ...book,
      cabinetRules: book.cabinetRules.map((rule) =>
        "anchorMinor" in rule.formula
          ? {
              ...rule,
              formula: {
                ...rule.formula,
                anchorMinor: rule.formula.anchorMinor + 1_000,
              },
            }
          : rule,
      ),
      linkedAccessories: book.linkedAccessories.map((linked) => ({
        ...linked,
        perUnitMinor: linked.perUnitMinor + 1,
      })),
    };
  }

  it("deletes every accessory and non-default class and creates up to the bound, and still plans in well under a second", () => {
    const active = bookWithAccessories(MANY);
    const archived = shiftedPrices(active);
    const accessoryDeletions = active.linkedAccessories.map(
      ({ accessoryId }) => ({ kind: "accessory" as const, accessoryId }),
    );
    const createdAccessories = Array.from({ length: MANY }, (_, index) =>
      creatingAccessory(`Created${String(index).padStart(14, "0")}`),
    );
    const createdClasses = Array.from({ length: 17 }, (_, index) =>
      creatingClass(`CreatedClass${String(index).padStart(9, "0")}`),
    ).flat();
    const draft = [
      ...createdClasses,
      ...createdAccessories,
      ...deleting(...accessoryDeletions, PREMIUM, SOFT_CLOSE, VENEER, PAINTED),
    ];
    expect(applyChanges(active, draft).ok).toBe(true);
    const heapBefore = process.memoryUsage().heapUsed;

    const startedAt = performance.now();
    const plan = planRestoreToDraft({ archived, active, draft });
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1_000);
    expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(
      200 * 1024 * 1024,
    );
    expect(applyChanges(active, plan.draft).ok).toBe(true);
    expect(deletionChanges(plan.draft)).toHaveLength(MANY + 4);
    expect(plan.draft.slice(0, draft.length)).toEqual(draft);
    expect(plan.addedChangeCount).toBe(
      restoreChanges(archived, active).filter(
        (change) =>
          !deletedItemsOf(draft).some((item) =>
            isOnRow(change as DraftChange, item),
          ),
      ).length,
    );
  });

  // The app writes at most 20 classes, 50 accessories and the materials as deletions; a draft stored out of band is bounded
  // only by the store's 2 MiB of JSON (`MAX_STORED_JSON_BYTES`, `dashboard-store-shapes.ts`, not exported). That is the most
  // `item-deleted` changes a stored draft can hold, and the plan must stay within a bound a 2-core CI runner (4.5 times
  // slower than a laptop, `vitest.config.ts`) meets.
  const MAX_STORED_JSON_BYTES = 2_097_152;
  const MOST_DELETIONS_A_STORE_HOLDS = (() => {
    const [one] = deleting({ kind: "accessory", accessoryId: "ghost00000" });
    const bytesPerDeletion = JSON.stringify([one]).length;
    return Math.floor(MAX_STORED_JSON_BYTES / bytesPerDeletion);
  })();

  it("plans, in bounded time, against the most deletions of unknown rows a stored draft can hold", () => {
    const draft = Array.from(
      { length: MOST_DELETIONS_A_STORE_HOLDS },
      (_, index) =>
        deleting({
          kind: "accessory",
          accessoryId: `ghost${String(index).padStart(5, "0")}`,
        }),
    ).flat();
    expect(JSON.stringify(draft).length).toBeLessThanOrEqual(
      MAX_STORED_JSON_BYTES,
    );

    const startedAt = performance.now();
    const plan = planRestoreToDraft({
      archived: withAnchor(ACTIVE, 520_000),
      active: ACTIVE,
      draft,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(plan.draft.slice(0, draft.length)).toEqual(draft);
    expect(elapsedMs).toBeLessThan(10_000);
    console.info(
      `restore plan over ${String(draft.length)} deletions: ${elapsedMs.toFixed(0)} ms`,
    );
  });

  it("answers candidate-refused, naming nothing, for a draft near the stored limit whose giant change cannot apply", async () => {
    const giantWords = "x".repeat(1_900_000);
    const draft = [
      asChange({
        address: {
          kind: "created-row-text",
          item: CREATED_CLASS,
          field: "name",
        },
        value: giantWords,
      }),
      ...deleting(VENEER),
    ];

    const startedAt = performance.now();
    const plan = planRestore(
      versionOf(withAnchor(ACTIVE, 520_000)),
      stateOf(ACTIVE, draft),
    );
    const elapsedMs = performance.now() - startedAt;

    expect(plan.kind).toBe("refused");
    if (plan.kind === "refused") {
      expect(JSON.stringify(await plan.response.json())).toBe(
        JSON.stringify({ status: "candidate-refused" }),
      );
    }
    expect(elapsedMs).toBeLessThan(2_000);
  });
});
