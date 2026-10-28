import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { planRestoreToDraft } from "@/lib/server/price-dashboard/restore-plan";

/**
 * What a restore makes of the draft, over books (M10 R3, ruling U5-Q6). Pending changes of fields the archived book states
 * are replaced; a pending change to a field it does not state stays; a bulk group that loses a member is no group.
 */

const KEPT_ROW = "cabinet.base-3drawer";
const RESTORED_ROW = "cabinet.base-sink";
const BULK = { percent: 10, scope: "all" } as const;

function anchorAddress(ruleId: string) {
  return { kind: "cabinet", ruleId, field: "anchorMinor" } as const;
}

function anchorOf(book: PriceBook, ruleId: string): number {
  const formula = book.cabinetRules.find(
    (rule) => rule.ruleId === ruleId,
  )?.formula;
  if (formula === undefined || !("anchorMinor" in formula)) {
    throw new Error(`${ruleId} has no anchor`);
  }
  return formula.anchorMinor;
}

/** The sample book with the anchor of one row moved. */
function withAnchor(book: PriceBook, ruleId: string, anchorMinor: number) {
  return {
    ...book,
    cabinetRules: book.cabinetRules.map((rule) =>
      rule.ruleId === ruleId && "anchorMinor" in rule.formula
        ? { ...rule, formula: { ...rule.formula, anchorMinor } }
        : rule,
    ),
  } satisfies PriceBook;
}

const ACTIVE = SAMPLE_PRICE_BOOK;
const ARCHIVED_RESTORED_ROW_MOVED = withAnchor(
  ACTIVE,
  RESTORED_ROW,
  anchorOf(ACTIVE, RESTORED_ROW) + 50_000,
);
const ARCHIVED_WITHOUT_KEPT_ROW: PriceBook = {
  ...ARCHIVED_RESTORED_ROW_MOVED,
  cabinetRules: ARCHIVED_RESTORED_ROW_MOVED.cabinetRules.filter(
    ({ ruleId }) => ruleId !== KEPT_ROW,
  ),
};

describe("planRestoreToDraft", () => {
  it("adds the archived values that differ from the active book, in an empty draft", () => {
    const archived = withAnchor(ACTIVE, RESTORED_ROW, 111_000);

    const plan = planRestoreToDraft({ archived, active: ACTIVE, draft: [] });

    expect(plan.draft).toEqual([
      { address: anchorAddress(RESTORED_ROW), value: 111_000 },
    ]);
    expect(plan).toMatchObject({ addedChangeCount: 1, differingCount: 1 });
  });

  it("keeps a pending change to a field the archived book does not state", () => {
    const pending: DraftChange = {
      address: anchorAddress(KEPT_ROW),
      value: 777_000,
    };

    const plan = planRestoreToDraft({
      archived: ARCHIVED_WITHOUT_KEPT_ROW,
      active: ACTIVE,
      draft: [pending],
    });

    expect(plan.draft).toContainEqual(pending);
    expect(plan.addedChangeCount).toBe(1);
  });

  it("drops a pending change to a field the archived book states, whatever its value", () => {
    const archived = withAnchor(ACTIVE, RESTORED_ROW, 111_000);
    const pending: DraftChange = {
      address: anchorAddress(RESTORED_ROW),
      value: 999_000,
    };

    const plan = planRestoreToDraft({
      archived,
      active: ACTIVE,
      draft: [pending],
    });

    expect(plan.draft).toEqual([
      { address: anchorAddress(RESTORED_ROW), value: 111_000 },
    ]);
  });

  it("drops the pending change of a field the archived book holds as the active one does, adding nothing", () => {
    const pending: DraftChange = {
      address: anchorAddress(RESTORED_ROW),
      value: 999_000,
    };

    const plan = planRestoreToDraft({
      archived: ACTIVE,
      active: ACTIVE,
      draft: [pending],
    });

    expect(plan.draft).toEqual([]);
    expect(plan.addedChangeCount).toBe(0);
    expect(plan.differingCount).toBe(1);
  });

  it("is nothing to restore when the candidate already holds the archived values", () => {
    const archived = withAnchor(ACTIVE, RESTORED_ROW, 111_000);

    const plan = planRestoreToDraft({
      archived,
      active: ACTIVE,
      draft: [{ address: anchorAddress(RESTORED_ROW), value: 111_000 }],
    });

    expect(plan.differingCount).toBe(0);
  });

  it("makes an ordinary change of a survivor of a bulk group that lost a member", () => {
    const groupId = "group-1";
    const draft: DraftChange[] = [
      { address: anchorAddress(KEPT_ROW), value: 777_000, groupId, bulk: BULK },
      {
        address: anchorAddress(RESTORED_ROW),
        value: 888_000,
        groupId,
        bulk: BULK,
      },
    ];

    const plan = planRestoreToDraft({
      archived: ARCHIVED_WITHOUT_KEPT_ROW,
      active: ACTIVE,
      draft,
    });

    const survivor = plan.draft.find(
      ({ address }) =>
        address.kind === "cabinet" && address.ruleId === KEPT_ROW,
    );
    expect(survivor).toEqual({
      address: anchorAddress(KEPT_ROW),
      value: 777_000,
    });
  });

  it("keeps a bulk group whole when none of its members is restored", () => {
    const groupId = "group-1";
    const draft: DraftChange[] = [
      { address: anchorAddress(KEPT_ROW), value: 777_000, groupId, bulk: BULK },
    ];

    const plan = planRestoreToDraft({
      archived: ARCHIVED_WITHOUT_KEPT_ROW,
      active: ACTIVE,
      draft,
    });

    expect(plan.draft).toContainEqual(draft[0]);
  });

  it("makes the plan against the active book when the draft cannot apply", () => {
    const archived = withAnchor(ACTIVE, RESTORED_ROW, 111_000);
    const stale: DraftChange = {
      address: anchorAddress("cabinet.gone"),
      value: 5_000,
    };

    const plan = planRestoreToDraft({
      archived,
      active: ACTIVE,
      draft: [stale],
    });

    expect(plan.differingCount).toBe(1);
    expect(plan.draft).toContainEqual(stale);
  });
});
