import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  hardwareRatesOf,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import type { ActiveDashboardState } from "@/lib/server/price-dashboard/dashboard-state";
import {
  planChange,
  planRevert,
} from "@/lib/server/price-dashboard/draft-plans";
import {
  readDraftChangeRequest,
  readRevertRequest,
  type RevertAddress,
} from "@/lib/server/price-dashboard/draft-requests";

/**
 * R4c2: the readers take `item-deleted` as a change (the value is judged by the domain) and as a revert, and the plan
 * takes a deletion back by its own address while a field of the deleted row is still not a way to take it back.
 */

const REVISION = "3";
const PREMIUM = { kind: "hardware", tierId: "hardware.premium" } as const;
const PLINTH = { kind: "accessory", accessoryId: "plinth-light" } as const;
const DELETES_PREMIUM = { kind: "item-deleted", item: PREMIUM } as const;

function changeBody(address: unknown, value: unknown = true): string {
  return JSON.stringify({
    expectedDraftRevision: REVISION,
    change: { address, value },
  });
}

function revertBody(address: unknown): string {
  return JSON.stringify({
    expectedDraftRevision: REVISION,
    target: { kind: "change", address },
  });
}

describe("the change reader and a deletion", () => {
  it.each([
    ["a hardware class", PREMIUM],
    ["a material", { kind: "material", tierId: "material.veneer" }],
    ["a linked accessory", PLINTH],
  ])("takes the deletion of %s, with its value as sent", (_name, item) => {
    const reading = readDraftChangeRequest(
      changeBody({ kind: "item-deleted", item }),
    );

    expect(reading).toEqual({
      ok: true,
      value: {
        expectedDraftRevision: REVISION,
        address: { kind: "item-deleted", item },
        value: true,
      },
    });
  });

  it("passes a value that is not true on as sent, for the plan to refuse", () => {
    expect(
      readDraftChangeRequest(changeBody(DELETES_PREMIUM, "true")),
    ).toMatchObject({ ok: true, value: { value: "true" } });
  });

  it("rebuilds the address member by member, so nothing a body adds to the item reaches the draft", () => {
    const reading = readDraftChangeRequest(
      changeBody({
        kind: "item-deleted",
        item: { ...PREMIUM, extra: 1 },
      }),
    );

    expect(reading).toEqual({ ok: false, refusal: { kind: "malformed" } });
  });

  it.each([
    ["a colour", { kind: "finish", finishId: "pal.alb" }],
    ["a handle", { kind: "handle", handle: "black" }],
  ])("does not read the deletion of %s", (_name, item) => {
    expect(
      readDraftChangeRequest(changeBody({ kind: "item-deleted", item })),
    ).toEqual({
      ok: false,
      refusal: {
        kind: "issues",
        issues: [{ field: "address", code: "UNKNOWN_ADDRESS" }],
      },
    });
  });

  it.each(["bulk", "groupId"])(
    "does not read a deletion that carries a %s",
    (member) => {
      const body = JSON.stringify({
        expectedDraftRevision: REVISION,
        change: { address: DELETES_PREMIUM, value: true, [member]: 1 },
      });

      expect(readDraftChangeRequest(body)).toEqual({
        ok: false,
        refusal: { kind: "malformed" },
      });
    },
  );
});

describe("the revert reader and a deletion", () => {
  it("takes a revert naming the deletion's own address", () => {
    expect(readRevertRequest(revertBody(DELETES_PREMIUM))).toEqual({
      ok: true,
      value: {
        expectedDraftRevision: REVISION,
        target: { kind: "change", address: DELETES_PREMIUM },
      },
    });
  });

  it("does not read a revert naming a deletion with a member it does not name", () => {
    expect(
      readRevertRequest(revertBody({ ...DELETES_PREMIUM, extra: 1 })),
    ).toEqual({ ok: false, refusal: { kind: "malformed" } });
  });

  it("does not read a revert naming a deletion with no item", () => {
    expect(readRevertRequest(revertBody({ kind: "item-deleted" }))).toEqual({
      ok: false,
      refusal: {
        kind: "issues",
        issues: [{ field: "address", code: "UNKNOWN_ADDRESS" }],
      },
    });
  });
});

const BOOK_WITH_PLINTH = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    {
      accessoryId: PLINTH.accessoryId,
      ruleId: "accessory.plinth-light",
      linkedBuildId: "base-3drawer",
      perUnitMinor: 1_000,
      name: "Soclu luminos",
    },
  ],
};

function stateWith(changes: readonly DraftChange[]): ActiveDashboardState {
  return {
    book: BOOK_WITH_PLINTH,
    draft: { draftRevision: REVISION, changes },
  } as unknown as ActiveDashboardState;
}

const DELETION: DraftChange = { address: DELETES_PREMIUM, value: true };
const PREMIUM_RATE_FIELD = hardwareRatesOf(SAMPLE_PRICE_BOOK)[0];
const PREMIUM_RATE: DraftChange = {
  address: {
    kind: "hardware",
    tierId: PREMIUM.tierId,
    field: PREMIUM_RATE_FIELD,
  },
  value: 5_000,
} as DraftChange;

function revertOf(address: RevertAddress, changes: readonly DraftChange[]) {
  return planRevert(
    { expectedDraftRevision: REVISION, target: { kind: "change", address } },
    stateWith(changes),
  );
}

describe("taking a deletion back", () => {
  it("plans a write that leaves the draft without the deletion, naming it in its audit row", () => {
    const plan = revertOf(DELETES_PREMIUM, [DELETION]);

    expect(plan.kind).toBe("write");
    if (plan.kind !== "write") return;
    expect(plan.changes).toEqual([]);
    expect(plan.entry).toMatchObject({
      action: "price-draft-reverted",
      detail: {
        changeKind: "item-deleted",
        itemKind: "hardware",
        itemId: PREMIUM.tierId,
        revertedCount: 1,
      },
    });
  });

  it("leaves every other change of the draft where it stands", () => {
    const other: DraftChange = { address: { kind: "depth-rule" }, value: 5 };

    const plan = revertOf(DELETES_PREMIUM, [other, DELETION]);

    expect(plan.kind === "write" && plan.changes).toEqual([other]);
  });

  it("is refused as unknown when the draft holds no such deletion, and plans no write", () => {
    const plan = revertOf(DELETES_PREMIUM, []);

    expect(plan.kind).toBe("refused");
  });

  it("is still refused for a field of the deleted row, naming the field, and plans no write", () => {
    const plan = revertOf(PREMIUM_RATE.address as RevertAddress, [
      DELETION,
      PREMIUM_RATE,
    ]);

    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") return;
    expect(plan.response.status).toBe(400);
  });
});

describe("planning a deletion", () => {
  it("is a write that appends the deletion, once, whatever else the draft holds", () => {
    const other: DraftChange = { address: { kind: "depth-rule" }, value: 5 };

    const plan = planChange(
      { address: DELETES_PREMIUM, value: true },
      stateWith([other]),
    );

    expect(plan.kind === "write" && plan.changes).toEqual([other, DELETION]);
  });

  it("is refused as a default for the book's fixed hardware class, before anything is read", () => {
    const plan = planChange(
      {
        address: {
          kind: "item-deleted",
          item: {
            kind: "hardware",
            tierId: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
          },
        },
        value: true,
      },
      stateWith([]),
    );

    expect(plan.kind).toBe("refused");
    if (plan.kind !== "refused") return;
    expect(plan.response.status).toBe(400);
  });
});
