// The publish screens' rows (frames D7A, D7D, D8B), asserted as descriptors: which rows `diffBooks` gives for a draft, how a bulk
// action folds into one row with the percentage it was asked as, what a restated value looks like, when the draft would
// change nothing, and what a restore makes of the draft. The books are the sample's, whose changes go through `applyChanges`.
import {
  ABSENT_VALUE,
  applyChanges,
  isSameAddress,
  readEditableFields,
  type AppliedAddress,
  type DraftBulk,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";
import {
  describeVersionDiff,
  planRestore,
  readPendingDraft,
  type FieldRowView,
  type GroupRowView,
  type RowView,
  type SectionView,
} from "@/price-dashboard/publish-model";

import {
  withRetiredLinearRules,
  withoutDepthRule,
} from "../support/retired-form-books";

const ACTIVE: PriceBook = SAMPLE_PUBLISH_PAGE.state.active.book;
const NAMES = SAMPLE_PUBLISH_PAGE.cabinetNames;

function anchorOf(buildId: string): AppliedAddress {
  return {
    kind: "cabinet",
    ruleId: `cabinet.${buildId}`,
    field: "anchorMinor",
  };
}

function valueAt(book: PriceBook, address: AppliedAddress): number {
  const reading = readEditableFields(book).find((row) =>
    isSameAddress(row.address, address),
  );
  if (typeof reading?.value !== "number") throw new Error("no such number");
  return reading.value;
}

function bookWith(base: PriceBook, changes: readonly DraftChange[]): PriceBook {
  const applied = applyChanges(base, changes);
  if (!applied.ok) throw new Error("the changes do not make a book");
  return applied.book;
}

function change(address: AppliedAddress, value: number | boolean): DraftChange {
  return { address, value } as DraftChange;
}

function grouped(
  address: AppliedAddress,
  value: number,
  group: { groupId: string; bulk: DraftBulk },
): DraftChange {
  return { address, value, ...group } as DraftChange;
}

function pending(changes: readonly DraftChange[], active: PriceBook = ACTIVE) {
  const reading = readPendingDraft({
    active,
    changes,
    cabinetNames: NAMES,
  });
  if (reading.kind !== "ready") throw new Error(`the draft is ${reading.kind}`);
  return reading.view;
}

function rowsOf(sections: readonly SectionView[]): readonly RowView[] {
  return sections.flatMap((section) => section.rows);
}

function fieldRow(row: RowView | undefined): FieldRowView {
  if (row?.kind !== "field") throw new Error("expected a field row");
  return row;
}

function groupRow(row: RowView | undefined): GroupRowView {
  if (row?.kind !== "group") throw new Error("expected a group row");
  return row;
}

const BASE = "base-cabinet";
const THREE_DRAWER = "base-3drawer";
const PANTRY = "tall-pantry";

describe("a bulk action in the draft", () => {
  const stored: DraftBulk = { percent: -7, scope: "selection" };
  const group = { groupId: "bulk-a", bulk: stored };

  function bulkChanges(): readonly DraftChange[] {
    return [BASE, THREE_DRAWER, PANTRY].map((buildId) =>
      grouped(
        anchorOf(buildId),
        valueAt(ACTIVE, anchorOf(buildId)) + 5_000,
        group,
      ),
    );
  }

  it("is one group row that carries the percentage it was asked as, not one read back from the amounts", () => {
    const view = pending(bulkChanges());

    const row = groupRow(rowsOf(view.sections)[0]);
    expect(rowsOf(view.sections)).toHaveLength(1);
    expect(row.bulk).toEqual({
      percent: -7,
      scope: { kind: "selection", count: 3 },
    });
    expect(row.items).toHaveLength(3);
    expect([row.ruleCount, row.amountCount]).toEqual([3, 3]);
  });

  it("keeps the whole catalogue apart from a selection, as it was stored", () => {
    const whole = pending(
      bulkChanges().map((stored) =>
        grouped(stored.address as AppliedAddress, stored.value as number, {
          groupId: "bulk-all",
          bulk: { percent: 5, scope: "all" },
        }),
      ),
    );

    expect(groupRow(rowsOf(whole.sections)[0]).bulk?.scope).toEqual({
      kind: "all",
    });
  });

  it("names its scope by the group when it was asked for one group", () => {
    const view = pending(
      [PANTRY].map((buildId) =>
        grouped(anchorOf(buildId), valueAt(ACTIVE, anchorOf(buildId)) + 5_000, {
          groupId: "bulk-b",
          bulk: { percent: 5, scope: "group", groupCode: "tall" },
        }),
      ),
    );

    expect(groupRow(rowsOf(view.sections)[0]).bulk).toEqual({
      percent: 5,
      scope: { kind: "group", code: "tall" },
    });
  });

  it("is reverted as a whole by its group id, while its members have no revert of their own", () => {
    const row = groupRow(rowsOf(pending(bulkChanges()).sections)[0]);

    expect(row.revert).toEqual({ kind: "group", groupId: "bulk-a" });
    expect(row.items.map((item) => item.revert)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("draws a member that kept its value as unchanged, beside the members that moved", () => {
    const kept = valueAt(ACTIVE, anchorOf(BASE));
    const moved = valueAt(ACTIVE, anchorOf(THREE_DRAWER)) + 10_000;

    const row = groupRow(
      rowsOf(
        pending([
          grouped(anchorOf(BASE), kept, group),
          grouped(anchorOf(THREE_DRAWER), moved, group),
        ]).sections,
      )[0],
    );

    const [restated, changed] = row.items;
    expect(restated?.isUnchanged).toBe(true);
    expect(restated?.difference).toEqual({ kind: "none" });
    expect(changed?.isUnchanged).toBe(false);
    expect(changed?.difference.kind).toBe("amount");
  });

  it("falls back to its counts when the changes carry no percentage", () => {
    const bare = bulkChanges().map(({ address, value }) => ({
      address,
      value,
      groupId: "bulk-c",
    })) as unknown as readonly DraftChange[];
    const sections = describeVersionDiff({
      before: ACTIVE,
      after: bookWith(ACTIVE, bulkChanges()),
      changes: bare,
      cabinetNames: NAMES,
    });

    const row = groupRow(rowsOf(sections)[0]);

    expect(row.bulk).toBeUndefined();
    expect(row.amountCount).toBe(3);
  });
});

describe("a value the book does not hold yet", () => {
  // A version stored before the cut-over states no depth rule; every book since states one.
  const BEFORE_THE_CUT_OVER: PriceBook = withoutDepthRule(ACTIVE);

  function depthRuleRow(): FieldRowView {
    const sections = describeVersionDiff({
      before: BEFORE_THE_CUT_OVER,
      after: ACTIVE,
      changes: [],
      cabinetNames: NAMES,
    });
    const row = rowsOf(sections).find(
      (candidate): candidate is FieldRowView =>
        candidate.kind === "field" && candidate.address.kind === "depth-rule",
    );
    if (row === undefined) throw new Error("the diff has no depth-rule row");
    return row;
  }

  it("is the absent value on the old side of a new depth rule, with no difference to size", () => {
    const row = depthRuleRow();

    expect(row.before).toBe(ABSENT_VALUE);
    expect(row.after).toBe(15);
    expect(row.difference).toEqual({ kind: "none" });
    expect(row.subject).toEqual({ kind: "depth-rule" });
  });

  it("leaves a rule that was in the book on both sides with a value on both", () => {
    const sections = describeVersionDiff({
      before: ACTIVE,
      after: bookWith(ACTIVE, [{ address: { kind: "depth-rule" }, value: 18 }]),
      changes: [{ address: { kind: "depth-rule" }, value: 18 }],
      cabinetNames: NAMES,
    });

    const row = fieldRow(rowsOf(sections)[0]);
    expect([row.before, row.after]).toEqual([15, 18]);
    expect(row.difference).toEqual({ kind: "points", delta: 3 });
  });
});

describe("what a row is about", () => {
  it("names a cabinet from the catalogue's names, a tier and an accessory from the book's own text, and the two rules by kind", () => {
    const tier = ACTIVE.hardware.tiers[1];
    if (tier === undefined) throw new Error("no second hardware class");
    const view = pending([
      change(anchorOf(BASE), valueAt(ACTIVE, anchorOf(BASE)) + 1_000),
      change(
        { kind: "hardware", tierId: tier.tierId, field: "perDrawerMinor" },
        1,
      ),
      change(
        {
          kind: "accessory",
          accessoryId: "dishDryingRack",
          field: "perUnitMinor",
        },
        1,
      ),
      change({ kind: "depth-rule" }, 20),
      change({ kind: "provisional" }, false),
    ]);

    const subjects = rowsOf(view.sections).map((row) => fieldRow(row).subject);
    expect(subjects).toEqual([
      { kind: "name", name: NAMES[BASE] },
      { kind: "depth-rule" },
      { kind: "book-text", authored: tier.name, key: tier.nameKey },
      {
        kind: "book-text",
        authored: ACTIVE.accessories.dishDryingRack.name,
        key: ACTIVE.accessories.dishDryingRack.nameKey,
      },
      { kind: "provisional" },
    ]);
  });

  it("lists its rows in the dashboard's sections, in the dashboard's order", () => {
    const view = pending([
      change({ kind: "provisional" }, false),
      change({ kind: "depth-rule" }, 20),
      change(anchorOf(BASE), valueAt(ACTIVE, anchorOf(BASE)) + 1_000),
    ]);

    expect(view.sections.map((section) => section.section)).toEqual([
      "cabinets",
      "price-rules",
      "provisional",
    ]);
  });
});

describe("how big a change is", () => {
  const BEFORE = 200_000;
  const BASE_BOOK = bookWith(ACTIVE, [change(anchorOf(BASE), BEFORE)]);

  function differenceFor(after: number) {
    const view = pending([change(anchorOf(BASE), after)], BASE_BOOK);
    return fieldRow(rowsOf(view.sections)[0]).difference;
  }

  it.each([
    [220_000, 20_000, 10],
    [203_000, 3_000, 2],
    [201_000, 1_000, 1],
    [197_000, -3_000, -2],
    [180_000, -20_000, -10],
  ])(
    "from 200000 to %i is %i bani, %i percent: whole percent, halves away from zero",
    (after, deltaMinor, percent) => {
      expect(differenceFor(after)).toEqual({
        kind: "amount",
        deltaMinor,
        percent,
        isUnderOnePercent: false,
      });
    },
  );

  it("is under one percent when the change is not nothing and not a whole percent", () => {
    expect(differenceFor(200_500)).toEqual({
      kind: "amount",
      deltaMinor: 500,
      percent: undefined,
      isUnderOnePercent: true,
    });
  });

  it("states no percentage of a price that was nothing", () => {
    const free = bookWith(ACTIVE, [change(anchorOf(BASE), 0)]);
    const view = pending([change(anchorOf(BASE), 5_000)], free);

    expect(fieldRow(rowsOf(view.sections)[0]).difference).toEqual({
      kind: "amount",
      deltaMinor: 5_000,
      percent: undefined,
      isUnderOnePercent: false,
    });
  });
});

describe("whether the draft can be published", () => {
  const RESTATED = change(anchorOf(BASE), valueAt(ACTIVE, anchorOf(BASE)));

  it("has no reading for a draft of no changes", () => {
    expect(
      readPendingDraft({ active: ACTIVE, changes: [], cabinetNames: NAMES }),
    ).toEqual({ kind: "empty" });
  });

  it("draws the rows of a draft that only restates the book's values, and cannot publish them", () => {
    const view = pending([RESTATED]);

    expect(rowsOf(view.sections)).toHaveLength(1);
    expect(fieldRow(rowsOf(view.sections)[0]).isUnchanged).toBe(true);
    expect(view.canPublish).toBe(false);
    expect(view.changeCount).toBe(1);
  });

  it("can publish as soon as one change moves a value", () => {
    const moved = change(
      anchorOf(THREE_DRAWER),
      valueAt(ACTIVE, anchorOf(THREE_DRAWER)) + 1,
    );

    expect(pending([RESTATED, moved]).canPublish).toBe(true);
  });

  it("is a defect, not a draft, when the changes do not make a book", () => {
    const reading = readPendingDraft({
      active: ACTIVE,
      changes: [change({ kind: "depth-rule" }, 10_000)],
      cabinetNames: NAMES,
    });

    expect(reading).toEqual({ kind: "candidate-refused" });
  });

  it.each([
    [false, true],
    [true, false],
  ])(
    "asks the second question when the draft sets the provisional figures to %s: %s",
    (value, isAsked) => {
      expect(
        pending([change({ kind: "provisional" }, value)]).holdsProvisionalOff,
      ).toBe(isAsked);
    },
  );

  it("reports the provisional figures the published book would carry", () => {
    expect(
      pending([change({ kind: "provisional" }, false)]).candidateIsProvisional,
    ).toBe(false);
    expect(pending([RESTATED]).candidateIsProvisional).toBe(
      ACTIVE.amountsProvisional,
    );
  });
});

describe("what a restore makes of the draft", () => {
  const FIRST = anchorOf(BASE);
  const SECOND = anchorOf(THREE_DRAWER);

  /** Every field the archived book states holds the archived value in the book the draft would make. */
  function reproduces(
    archived: PriceBook,
    active: PriceBook,
    draft: readonly DraftChange[],
  ): void {
    const candidate = bookWith(active, draft);
    for (const reading of readEditableFields(archived)) {
      expect(
        valueAtAny(candidate, reading.address),
        JSON.stringify(reading.address),
      ).toBe(reading.value);
    }
  }

  function valueAtAny(book: PriceBook, address: AppliedAddress) {
    return readEditableFields(book).find((row) =>
      isSameAddress(row.address, address),
    )?.value;
  }

  it("adds the archived values where they differ from an empty draft's book", () => {
    const archived = bookWith(ACTIVE, [
      change(FIRST, valueAt(ACTIVE, FIRST) + 7_000),
      change(SECOND, valueAt(ACTIVE, SECOND) + 9_000),
    ]);

    const plan = planRestore({ archived, active: ACTIVE, draft: [] });

    expect([plan.differingCount, plan.addedChangeCount]).toEqual([2, 2]);
    reproduces(archived, ACTIVE, plan.draft);
  });

  it("drops a draft change on a field where the archived price is the active one (active 100, draft 120, archived 100)", () => {
    const active = valueAt(ACTIVE, FIRST);
    const draft = [change(FIRST, active + 20_000)];

    const plan = planRestore({ archived: ACTIVE, active: ACTIVE, draft });

    expect(plan.draft).toEqual([]);
    expect(plan.differingCount).toBe(1);
    expect(plan.addedChangeCount).toBe(0);
    reproduces(ACTIVE, ACTIVE, plan.draft);
  });

  it("replaces a draft change with the archived value where the archived price differs from the active one", () => {
    const archived = bookWith(ACTIVE, [
      change(FIRST, valueAt(ACTIVE, FIRST) - 10_000),
    ]);
    const draft = [change(FIRST, valueAt(ACTIVE, FIRST) + 20_000)];

    const plan = planRestore({ archived, active: ACTIVE, draft });

    expect(plan.draft).toEqual([change(FIRST, valueAt(archived, FIRST))]);
    reproduces(archived, ACTIVE, plan.draft);
  });

  // A version stored before the cut-over prices these two cabinets in the retired linear shape, which states no anchored
  // amount, so a cabinet change in a draft survives a restore from it, while its hardware and accessory fields are the
  // ones that go.
  const ARCHIVED_BEFORE_THE_CUT_OVER = withRetiredLinearRules(ACTIVE, [
    `cabinet.${BASE}`,
    `cabinet.${THREE_DRAWER}`,
  ]);
  const ACCESSORY: AppliedAddress = {
    kind: "accessory",
    accessoryId: "dishDryingRack",
    field: "perUnitMinor",
  };
  const GROUP = {
    groupId: "bulk-x",
    bulk: { percent: 5, scope: "selection" } satisfies DraftBulk,
  };

  it("turns the survivors of a bulk group that lost members into ordinary changes", () => {
    const survivor = grouped(FIRST, valueAt(ACTIVE, FIRST) + 1_000, GROUP);
    const lost = grouped(ACCESSORY, valueAt(ACTIVE, ACCESSORY) + 1_000, GROUP);

    const plan = planRestore({
      archived: ARCHIVED_BEFORE_THE_CUT_OVER,
      active: ACTIVE,
      draft: [survivor, lost],
    });

    const kept = plan.draft.find((candidate) =>
      isSameAddress(candidate.address, FIRST),
    );
    expect(kept).toEqual(change(FIRST, survivor.value as number));
    expect(kept).not.toHaveProperty("groupId");
    expect(kept).not.toHaveProperty("bulk");
  });

  it("leaves a bulk group whole when none of its members is touched", () => {
    const members = [
      grouped(FIRST, valueAt(ACTIVE, FIRST) + 1_000, GROUP),
      grouped(SECOND, valueAt(ACTIVE, SECOND) + 1_000, GROUP),
    ];

    const plan = planRestore({
      archived: ARCHIVED_BEFORE_THE_CUT_OVER,
      active: ACTIVE,
      draft: members,
    });

    expect(plan.draft).toEqual(expect.arrayContaining(members));
  });

  it("keeps the price the draft moved to when the archived price is the same and another field still differs", () => {
    const moved = valueAt(ACTIVE, FIRST) + 20_000;
    const archived = bookWith(ACTIVE, [
      change(FIRST, moved),
      change(SECOND, valueAt(ACTIVE, SECOND) + 9_000),
    ]);
    const draft = [
      change(FIRST, moved),
      change(SECOND, valueAt(ACTIVE, SECOND) + 5_000),
    ];

    const plan = planRestore({ archived, active: ACTIVE, draft });

    reproduces(archived, ACTIVE, plan.draft);
    expect(plan.addedChangeCount).toBe(2);
  });

  it("keeps a draft change on a field the archived version does not state", () => {
    const kept = change(FIRST, valueAt(ACTIVE, FIRST) + 3_000);

    const plan = planRestore({
      archived: ARCHIVED_BEFORE_THE_CUT_OVER,
      active: ACTIVE,
      draft: [kept],
    });

    expect(plan.draft).toContainEqual(kept);
  });

  it("finds nothing to restore when the archived version is what the draft would publish", () => {
    const draft = [change(FIRST, valueAt(ACTIVE, FIRST) + 4_000)];
    const archived = bookWith(ACTIVE, draft);

    const plan = planRestore({ archived, active: ACTIVE, draft });

    expect(plan.differingCount).toBe(0);
    reproduces(archived, ACTIVE, plan.draft);
  });
});
