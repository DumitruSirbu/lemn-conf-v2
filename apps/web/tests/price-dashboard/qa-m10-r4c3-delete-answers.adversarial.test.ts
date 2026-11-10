// Adversarial QA of M10 R4c3 on the facts alone: what each answer of the draft route comes to for a deletion, which
// answers the wire reads as which, the block a refusal for use opens and the number it may say, and the one place a ↺ on a
// deleted row must never appear (an archived version's diff).
import { describe, expect, it } from "vitest";

import {
  revertChange,
  SAMPLE_PRICE_BOOK,
  type DeletableItemRef,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import {
  blockedFlowAfterRefusalOf,
  deletionSettlementOf,
} from "@/price-dashboard/item-flows";
import type { UsageRead } from "@/price-dashboard/item-lifecycle-client";
import type { LifecycleContext } from "@/price-dashboard/item-lifecycle-model";
import { DRAFT_CHANGE_REFUSAL_CODES } from "@/price-dashboard/price-dashboard-wire-contract";
import { draftOutcomeOfAnswer } from "@/price-dashboard/price-draft-client";
import {
  describeVersionDiff,
  type RowView,
} from "@/price-dashboard/publish-model";
import type { FieldWriteResult } from "@/price-dashboard/use-price-draft";

const HETTICH = {
  kind: "hardware",
  tierId: "hardware.soft-close",
} as const satisfies DeletableItemRef;
const BLUM = {
  kind: "hardware",
  tierId: "hardware.premium",
} as const satisfies DeletableItemRef;
const FAILED = { kind: "failed" } as const;

function contextWith(disabled: readonly DeletableItemRef[]): LifecycleContext {
  return {
    book: SAMPLE_PRICE_BOOK,
    availability: { revision: "1", disabled },
    defaults: {},
    canWrite: true,
    isCreatedInDraft: () => false,
  };
}

describe("what a deletion comes to for each answer of the draft route", () => {
  it.each<readonly [string, FieldWriteResult, unknown]>([
    ["saved", { kind: "saved" }, { kind: "close" }],
    ["unchanged", { kind: "unchanged" }, { kind: "close" }],
    ["busy", { kind: "busy" }, { kind: "wait" }],
    [
      "conflict",
      { kind: "conflict" },
      { kind: "recount", failure: { kind: "conflict" } },
    ],
    [
      "candidate-refused",
      { kind: "candidate-refused" },
      { kind: "recount", failure: FAILED },
    ],
    ["failed", FAILED, { kind: "fail", failure: FAILED }],
  ])("is settled for %s as the table says", (_word, answer, settlement) => {
    expect(deletionSettlementOf(answer)).toEqual(settlement);
  });

  it("recounts for a conflict and a refused candidate and for no refusal and no other answer", () => {
    const refusals = DRAFT_CHANGE_REFUSAL_CODES.map((code) =>
      deletionSettlementOf({ kind: "refused", code }),
    );
    const others = (["saved", "unchanged", "busy", "failed"] as const).map(
      (kind) => deletionSettlementOf({ kind }),
    );

    expect(
      [...refusals, ...others].filter(({ kind }) => kind === "recount"),
    ).toEqual([]);
  });

  it("blocks by use for ITEM_IN_USE alone, names the default for ITEM_IS_DEFAULT, and says only 'failed' for every other refusal", () => {
    for (const code of DRAFT_CHANGE_REFUSAL_CODES) {
      const settlement = deletionSettlementOf({ kind: "refused", code });

      if (code === "ITEM_IN_USE") {
        expect(settlement, code).toEqual({ kind: "blocked-by-use" });
      } else if (code === "ITEM_IS_DEFAULT") {
        expect(settlement, code).toEqual({
          kind: "fail",
          failure: { kind: "refused", code: "item-is-default" },
        });
      } else {
        expect(settlement, code).toEqual({ kind: "fail", failure: FAILED });
      }
    }
  });
});

describe("the block a refusal for use opens", () => {
  const counted = (designCount: number): UsageRead => ({
    kind: "counted",
    counts: [{ item: HETTICH, designCount }],
  });

  it.each([
    [0, undefined],
    [1, 1],
    [2, 2],
    [14, 14],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  ])(
    "says the number only when the count is above none: a count of %s says %s",
    (designCount, said) => {
      const flow = blockedFlowAfterRefusalOf(
        HETTICH,
        contextWith([]),
        counted(designCount),
      );

      expect(flow).toEqual({
        kind: "delete-blocked",
        item: HETTICH,
        count: said,
        isOn: true,
      });
    },
  );

  it.each<readonly [string, UsageRead]>([
    ["no count that could be had", { kind: "unavailable" }],
    [
      "a count that names only another item",
      { kind: "counted", counts: [{ item: BLUM, designCount: 3 }] },
    ],
    ["a count with no item in it", { kind: "counted", counts: [] }],
  ])("says no number for %s, and is still the block", (_word, read) => {
    expect(
      blockedFlowAfterRefusalOf(HETTICH, contextWith([]), read),
    ).toMatchObject({ kind: "delete-blocked", count: undefined });
  });

  it("is never the confirmation, whatever the count says", () => {
    const reads: readonly UsageRead[] = [
      counted(0),
      counted(5),
      { kind: "unavailable" },
    ];

    for (const read of reads) {
      expect(
        blockedFlowAfterRefusalOf(HETTICH, contextWith([]), read).kind,
      ).toBe("delete-blocked");
    }
  });

  it("says whether the item is on by the availability it is judged under: an item already off has no switch-off to offer instead", () => {
    const flow = blockedFlowAfterRefusalOf(
      HETTICH,
      contextWith([HETTICH]),
      counted(2),
    );

    expect(flow).toMatchObject({ kind: "delete-blocked", isOn: false });
  });
});

describe("how the wire reads the draft route's answer to a deletion", () => {
  const answered = (status: number, body: unknown = {}) =>
    draftOutcomeOfAnswer({ status, body });

  it.each([429, 500, 502, 503, 504])(
    "reads a %s as a failed write, not a conflict, a refusal or a session that ended",
    (status) => {
      expect(answered(status)).toEqual(FAILED);
      expect(answered(status, { status: "changed-meanwhile" })).toEqual(FAILED);
      expect(answered(status, { issues: [{ code: "ITEM_IN_USE" }] })).toEqual(
        FAILED,
      );
    },
  );

  it("reads a 409 by the word it carries: changed-meanwhile and candidate-refused are the two that recount, any other word is a failure", () => {
    expect(answered(409, { status: "changed-meanwhile" })).toEqual({
      kind: "conflict",
    });
    expect(answered(409, { status: "candidate-refused" })).toEqual({
      kind: "candidate-refused",
    });
    expect(answered(409, { status: "something-else" })).toEqual(FAILED);
    expect(answered(409, undefined)).toEqual(FAILED);
    expect(answered(409, "changed-meanwhile")).toEqual(FAILED);
  });

  it("reads a 400 by the first code it names, and a code the route does not own as a failure", () => {
    expect(answered(400, { issues: [{ code: "ITEM_IN_USE" }] })).toEqual({
      kind: "refused",
      code: "ITEM_IN_USE",
    });
    expect(answered(400, { issues: [{ code: "ITEM_IS_DEFAULT" }] })).toEqual({
      kind: "refused",
      code: "ITEM_IS_DEFAULT",
    });
    expect(answered(400, { issues: [{ code: "NOT_A_CODE" }] })).toEqual(FAILED);
    expect(answered(400, { issues: [] })).toEqual(FAILED);
    expect(answered(400, {})).toEqual(FAILED);
  });

  it("reads a 401 as the session ending, which is no recount", () => {
    expect(answered(401)).toEqual({ kind: "session-ended" });
  });
});

describe("an archived version's diff of a deleted class", () => {
  const DELETION: DraftChange = {
    address: { kind: "item-deleted", item: HETTICH },
    value: true,
  };

  function bookWithoutHettich() {
    const { hardware } = SAMPLE_PRICE_BOOK;
    return {
      ...SAMPLE_PRICE_BOOK,
      hardware: {
        ...hardware,
        tiers: hardware.tiers.filter(({ tierId }) => tierId !== HETTICH.tierId),
      },
    };
  }

  const everyRowIn = (rows: readonly RowView[]): readonly RowView[] =>
    rows.flatMap<RowView>((row) =>
      row.kind === "group" ? [row, ...row.items] : [row],
    );

  it("names the deletion and offers no ↺ on any row of it, the row's own included", () => {
    const sections = describeVersionDiff({
      before: SAMPLE_PRICE_BOOK,
      after: bookWithoutHettich(),
      changes: [DELETION],
      cabinetNames: {},
    });

    const rows = everyRowIn(
      sections.flatMap<RowView>((section) => section.rows),
    );
    expect(rows.some((row) => row.kind === "row")).toBe(true);
    expect(rows.map((row) => row.revert)).toEqual(rows.map(() => undefined));
  });
});

describe("taking a deletion back by its address", () => {
  const DELETION: DraftChange = {
    address: { kind: "item-deleted", item: HETTICH },
    value: true,
  };
  const RATE: DraftChange = {
    address: {
      kind: "hardware",
      tierId: HETTICH.tierId,
      field: "perHingeMinor",
    },
    value: 2_000,
  };

  it("takes away the deletion alone and leaves the rate set beside it, wherever each stands", () => {
    expect(revertChange([RATE, DELETION], DELETION.address)).toEqual([RATE]);
    expect(revertChange([DELETION, RATE], DELETION.address)).toEqual([RATE]);
  });

  it("changes nothing for a deletion the draft does not hold", () => {
    expect(revertChange([RATE], DELETION.address)).toEqual([RATE]);
    expect(revertChange([], DELETION.address)).toEqual([]);
  });
});
