import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_IDENTIFIER_LENGTH } from "@lemnaria/configurator-domain";

import type * as BulkPlannerModule from "@/lib/server/price-dashboard/bulk-planner";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  bulkDraft,
  changeDraft,
  currentDraftRevision,
  revertDraft,
} from "../../../support/price-dashboard-requests";
import {
  ANCHORED_BOOK,
  ANCHORED_RULE_ID,
  FIXED_SIZES_RULE_ID,
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";
import {
  plannerBehaviour,
  plannerCalls,
  resetTestBulkPlanner,
} from "../../../support/test-bulk-planner";

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
vi.mock("@/lib/server/price-dashboard/bulk-planner", () =>
  import("../../../support/test-bulk-planner").then((world) =>
    world.bulkPlannerModule(),
  ),
);

/**
 * `POST /api/staff/prices/bulk` (M10 R2, A-14, ADR 0178). The route's own work: its guards, its body, the group it mints and
 * stamps on every change, the audit entry and the write. The scaling and the price groups are lane M's (M2, not merged), so the
 * planner here is a test double whose arithmetic no assertion relies on; the route is shown to hand it the candidate book and a
 * percentage that can never be `-0`, and to write what it plans.
 */

let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  resetTestBulkPlanner();
  prices = await freshPriceDashboardWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function administrator(email = "administrator@example.test") {
  const { session, account } = await signedInAs(
    { role: "administrator" },
    email,
  );
  return { cookie: session.cookie, accountId: account.id };
}

function draftRows() {
  return prices.ledger
    .heldEvents()
    .filter(({ action }) => action !== "price-published");
}

async function storedChanges() {
  return (await prices.stores.priceBook.readDraft()).changes as {
    address: Record<string, unknown>;
    value: number;
    groupId?: string;
    bulk?: Record<string, unknown>;
  }[];
}

async function bulk(
  cookie: string,
  target: unknown,
  percent: unknown,
  revision?: string,
) {
  return bulkDraft({
    cookie,
    json: {
      expectedDraftRevision: revision ?? (await currentDraftRevision()),
      target,
      ...(percent === undefined ? {} : { percent }),
    },
  });
}

async function bulkRaw(
  cookie: string,
  targetText: string,
  percentText: string,
) {
  const revision = await currentDraftRevision();
  return bulkDraft({
    cookie,
    json: `{"expectedDraftRevision":"${revision}","target":${targetText},"percent":${percentText}}`,
  });
}

const MANUFACTURER_PRICE_RULES = ANCHORED_BOOK.cabinetRules.filter(
  (rule) => rule.suppliedBy !== "customer",
);
const BASE_RULE_IDS = MANUFACTURER_PRICE_RULES.filter((rule) =>
  rule.buildId.startsWith("base"),
).map((rule) => rule.ruleId);

describe("a bulk action that is accepted", () => {
  it("is one group: every change carries the group's id and the action as it was asked, and the answer counts rules and prices", async () => {
    const { cookie } = await administrator();

    const answer = await bulk(cookie, { scope: "all" }, 5);

    expect(answer.status).toBe(200);
    const changes = await storedChanges();
    const groupIds = new Set(changes.map((change) => change.groupId));
    expect(groupIds.size).toBe(1);
    const [groupId] = [...groupIds];
    expect(typeof groupId).toBe("string");
    expect(String(groupId).length).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
    expect(
      changes.every(
        (change) =>
          Object.keys(change).sort().join() === "address,bulk,groupId,value",
      ),
    ).toBe(true);
    expect(changes.map((change) => change.bulk)).toEqual(
      changes.map(() => ({ percent: 5, scope: "all" })),
    );
    const body = (await jsonOf(answer)) as {
      draft: { draftRevision: string; changes: unknown[] };
      ruleCount: number;
      amountCount: number;
    };
    expect(body.draft.changes).toEqual(changes);
    expect(body.draft.draftRevision).toBe(
      (await prices.stores.priceBook.readDraft()).draftRevision,
    );
    expect(body.amountCount).toBe(changes.length);
    expect(body.ruleCount).toBe(MANUFACTURER_PRICE_RULES.length);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
  });

  it("is recorded in one price-bulk-changed row naming the scope, the percentage and the counts, and no price", async () => {
    const { cookie, accountId } = await administrator();

    const answer = await bulk(cookie, { scope: "all" }, 5);

    const body = (await jsonOf(answer)) as {
      ruleCount: number;
      amountCount: number;
    };
    expect(
      draftRows().map(({ action, detail, actorAccountId }) => ({
        action,
        detail,
        actorAccountId,
      })),
    ).toEqual([
      {
        action: "price-bulk-changed",
        detail: {
          scope: "all",
          percent: 5,
          ruleCount: body.ruleCount,
          amountCount: body.amountCount,
        },
        actorAccountId: accountId,
      },
    ]);
  });

  it("names the group on every change and in the row when the scope is a group", async () => {
    const { cookie } = await administrator();

    const answer = await bulk(
      cookie,
      { scope: "group", groupCode: "base" },
      -10,
    );

    expect(answer.status).toBe(200);
    const changes = await storedChanges();
    expect(changes.map((change) => change.bulk)).toEqual(
      changes.map(() => ({ percent: -10, scope: "group", groupCode: "base" })),
    );
    const touched = new Set(changes.map((change) => change.address.ruleId));
    expect([...touched].sort()).toEqual([...BASE_RULE_IDS].sort());
    expect(draftRows().map((row) => row.detail)).toEqual([
      expect.objectContaining({
        scope: "group",
        groupCode: "base",
        percent: -10,
      }),
    ]);
  });

  it("changes only the cabinets selected, and keeps no groupCode on a selection", async () => {
    const { cookie } = await administrator();

    const answer = await bulk(
      cookie,
      {
        scope: "selection",
        ruleIds: [ANCHORED_RULE_ID, FIXED_SIZES_RULE_ID, ANCHORED_RULE_ID],
      },
      10,
    );

    expect(answer.status).toBe(200);
    const changes = await storedChanges();
    expect(new Set(changes.map((change) => change.address.ruleId))).toEqual(
      new Set([ANCHORED_RULE_ID, FIXED_SIZES_RULE_ID]),
    );
    expect(changes.every((change) => change.bulk?.scope === "selection")).toBe(
      true,
    );
    expect(
      changes.every((change) => !("groupCode" in (change.bulk ?? {}))),
    ).toBe(true);
    expect(draftRows()[0]?.detail).not.toHaveProperty("groupCode");
  });

  it("is scaled from the candidate, the active book with the draft applied, and replaces a pending change of the same address", async () => {
    const { cookie } = await administrator();
    await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: {
          address: {
            kind: "cabinet",
            ruleId: ANCHORED_RULE_ID,
            field: "anchorMinor",
          },
          value: 200_000,
        },
      },
    });

    const answer = await bulk(
      cookie,
      { scope: "selection", ruleIds: [ANCHORED_RULE_ID] },
      10,
    );

    expect(answer.status).toBe(200);
    expect(await storedChanges()).toEqual([
      {
        address: {
          kind: "cabinet",
          ruleId: ANCHORED_RULE_ID,
          field: "anchorMinor",
        },
        value: 220_000,
        groupId: expect.any(String) as string,
        bulk: { percent: 10, scope: "selection" },
      },
    ]);
  });

  it("mints a group of its own for each action", async () => {
    const { cookie } = await administrator();

    await bulk(cookie, { scope: "selection", ruleIds: [ANCHORED_RULE_ID] }, 5);
    await bulk(
      cookie,
      { scope: "selection", ruleIds: [FIXED_SIZES_RULE_ID] },
      5,
    );

    const groupIds = (await storedChanges()).map((change) => change.groupId);
    expect(new Set(groupIds).size).toBe(2);
  });
});

describe("a percentage that is -0 (the rounding of a small reduction, which JSON.stringify writes as 0 and only raw text carries)", () => {
  it("is read as 0 once, at the boundary: the planner, the stored bulk and the audit row all hold 0, never -0", async () => {
    const { cookie } = await administrator();

    const answer = await bulkRaw(cookie, '{"scope":"all"}', "-0");

    expect(answer.status).toBe(200);
    expect(plannerCalls).toHaveLength(1);
    expect(Object.is(plannerCalls[0]?.percent, 0)).toBe(true);
    const changes = await storedChanges();
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((change) => Object.is(change.bulk?.percent, 0))).toBe(
      true,
    );
    const [row] = draftRows();
    expect(row?.action).toBe("price-bulk-changed");
    expect(Object.is(row?.detail.percent, 0)).toBe(true);
  });
});

describe("a bulk action that is refused", () => {
  async function expectRefused(
    answer: Response,
    issue: unknown,
    revisionBefore: string,
  ) {
    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [issue],
    });
    expect(draftRows()).toEqual([]);
    expect((await prices.stores.priceBook.readDraft()).draftRevision).toBe(
      revisionBefore,
    );
    expect(await storedChanges()).toEqual([]);
  }

  it.each([
    ["no percentage", undefined, "MISSING_VALUE"],
    ["a null percentage", null, "MISSING_VALUE"],
    ["a percentage as text", "5", "NOT_A_WHOLE_NUMBER"],
    ["a fraction", 2.5, "NOT_A_WHOLE_NUMBER"],
    ["a percentage no integer of ours can hold", 1e300, "PERCENT_OUT_OF_RANGE"],
    [
      "a percentage that prices a cabinet below nothing",
      -150,
      "PRICE_WOULD_BE_NEGATIVE",
    ],
    [
      "a percentage that pushes a price past the book's bound",
      10_000_000_000,
      "PERCENT_OUT_OF_RANGE",
    ],
  ] as const)(
    "answers %s with %s on percent",
    async (_title, percent, code) => {
      const { cookie } = await administrator();
      const before = await currentDraftRevision();

      const answer = await bulkDraft({
        cookie,
        json:
          percent === 1e300
            ? `{"expectedDraftRevision":"${before}","target":{"scope":"all"},"percent":1e300}`
            : {
                expectedDraftRevision: before,
                target: { scope: "all" },
                ...(percent === undefined ? {} : { percent }),
              },
      });

      await expectRefused(answer, { field: "percent", code }, before);
    },
  );

  it.each([
    ["no scope", {}, { field: "scope", code: "MISSING_VALUE" }],
    [
      "a scope that is not one",
      { scope: "everything" },
      { field: "scope", code: "MISSING_VALUE" },
    ],
    [
      "a group without its code",
      { scope: "group" },
      { field: "groupCode", code: "MISSING_VALUE" },
    ],
    [
      "a group that is not one",
      { scope: "group", groupCode: "island" },
      { field: "groupCode", code: "UNKNOWN_GROUP" },
    ],
    [
      "a selection without its rules",
      { scope: "selection" },
      { field: "ruleIds", code: "MISSING_VALUE" },
    ],
    [
      "an empty selection",
      { scope: "selection", ruleIds: [] },
      { field: "ruleIds", code: "NO_CABINETS_SELECTED" },
    ],
    [
      "a selection of something that is not an id",
      { scope: "selection", ruleIds: [7] },
      { field: "ruleIds", code: "UNKNOWN_RULE" },
    ],
    [
      "a selection of a rule the book does not have",
      { scope: "selection", ruleIds: [ANCHORED_RULE_ID, "cabinet.nowhere"] },
      { field: "ruleIds", code: "UNKNOWN_RULE" },
    ],
  ] as const)("answers %s on the member", async (_title, target, issue) => {
    const { cookie } = await administrator();
    const before = await currentDraftRevision();

    const answer = await bulk(cookie, target, 5);

    await expectRefused(answer, issue, before);
    expect(plannerCalls).toEqual([]);
  });

  it.each([
    ["a group code beside the scope all", { scope: "all", groupCode: "base" }],
    [
      "rule ids beside a group",
      { scope: "group", groupCode: "base", ruleIds: ["r"] },
    ],
    ["a member no target has", { scope: "all", groupId: "crafted" }],
  ])(
    "refuses %s as a request this route does not read",
    async (_title, target) => {
      const { cookie } = await administrator();

      const answer = await bulk(cookie, target, 5);

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(draftRows()).toEqual([]);
    },
  );

  it("refuses a body carrying a groupId or a bulk of its own, which only this route mints", async () => {
    const { cookie } = await administrator();

    const answer = await bulkDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        target: { scope: "all" },
        percent: 5,
        groupId: "crafted",
        bulk: { percent: 99, scope: "all" },
      },
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    expect(await storedChanges()).toEqual([]);
  });

  it("answers 409 changed-meanwhile for a draft that moved since the page read it, and plans nothing", async () => {
    const { cookie } = await administrator();
    const seen = await currentDraftRevision();
    await bulk(cookie, { scope: "selection", ruleIds: [ANCHORED_RULE_ID] }, 5);
    plannerCalls.length = 0;

    const answer = await bulk(cookie, { scope: "all" }, 5, seen);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(plannerCalls).toEqual([]);
    expect(draftRows()).toHaveLength(1);
  });
});

describe("a write and its audit row are one thing", () => {
  it("answers 503 with no detail when the audit row cannot be staged, and the group is not visible", async () => {
    const { cookie } = await administrator();
    const before = await currentDraftRevision();
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await bulk(cookie, { scope: "all" }, 5);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(draftRows()).toEqual([]);
    expect(await storedChanges()).toEqual([]);
    expect((await prices.stores.priceBook.readDraft()).draftRevision).toBe(
      before,
    );
  });

  it("answers 503 and writes nothing while no planner is installed (M2 is not merged)", async () => {
    const { cookie } = await administrator();
    plannerBehaviour.isUnavailable = true;

    const answer = await bulk(cookie, { scope: "all" }, 5);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(draftRows()).toEqual([]);
  });

  it("is a planner that is unavailable until M2 installs one: the real default throws and plans nothing", async () => {
    const real = await vi.importActual<typeof BulkPlannerModule>(
      "@/lib/server/price-dashboard/bulk-planner",
    );

    expect(() =>
      real.getBulkPlanner().plan({
        book: ANCHORED_BOOK,
        target: { scope: "all" },
        percent: 5,
      }),
    ).toThrow(/waits for M2/);
  });
});

describe("a bulk group taken out of the draft", () => {
  async function groupAfterBulk(cookie: string) {
    await bulk(cookie, { scope: "group", groupCode: "base" }, 5);
    const changes = await storedChanges();
    return { groupId: String(changes[0]?.groupId), count: changes.length };
  }

  it("is removed whole by its group id, and recorded in one row that names the count and no item", async () => {
    const { cookie } = await administrator();
    const { groupId, count } = await groupAfterBulk(cookie);

    const answer = await revertDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        target: { kind: "group", groupId },
      },
    });

    expect(answer.status).toBe(200);
    expect(await storedChanges()).toEqual([]);
    const rows = draftRows();
    expect(rows).toHaveLength(2);
    expect(rows.at(-1)).toMatchObject({
      action: "price-draft-reverted",
      detail: { changeKind: "bulk-group", revertedCount: count },
    });
    expect(rows.at(-1)?.detail).not.toHaveProperty("itemId");
  });

  it("loses one member to its own arrow and keeps the rest of the group", async () => {
    const { cookie } = await administrator();
    const { groupId, count } = await groupAfterBulk(cookie);
    const [first] = await storedChanges();

    await revertDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        target: { kind: "change", address: first?.address },
      },
    });

    const remaining = await storedChanges();
    expect(remaining).toHaveLength(count - 1);
    expect(remaining.every((change) => change.groupId === groupId)).toBe(true);
  });

  it("loses a member to a later single change of its address, which carries no group", async () => {
    const { cookie } = await administrator();
    const { groupId, count } = await groupAfterBulk(cookie);
    const [first] = await storedChanges();

    await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: first?.address, value: 123_000 },
      },
    });

    const after = await storedChanges();
    expect(after).toHaveLength(count);
    expect(after.filter((change) => change.groupId === groupId)).toHaveLength(
      count - 1,
    );
    expect(after.at(-1)).toEqual({ address: first?.address, value: 123_000 });
  });
});
