import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY,
  STAFF_PRICE_DRAFT_PER_ACCOUNT_HOUR_FIGURE,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  expectAWaitWithinTheWindowOf,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
import {
  bulkDraft,
  changeDraft,
  currentDraftRevision,
  readState,
  revertDraft,
} from "../../../support/price-dashboard-requests";
import {
  ANCHORED_RULE_ID,
  CUSTOMER_RULE_ID,
  FIXED_SIZES_RULE_ID,
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";

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

/**
 * `PUT` and `DELETE /api/staff/prices/draft` (M10 R2, ADR 0173, ADR 0178). The routes are called with `Request` objects over the
 * persistence package's price-book fake, which commits a write and its audit row together or neither; the session lookup,
 * the capability check, the limiter and `applyChanges` are the real ones. A change is judged against the running candidate
 * and refused with M1's code, and a write names the draft revision the page read.
 */

let world: AccountWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  world = freshAccountWorld();
  freshStaffWorld();
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

async function storedDraft() {
  return prices.stores.priceBook.readDraft();
}

async function putChange(cookie: string, change: unknown, revision?: string) {
  return changeDraft({
    cookie,
    json: {
      expectedDraftRevision: revision ?? (await currentDraftRevision()),
      change,
    },
  });
}

async function putRaw(cookie: string, changeText: string) {
  const revision = await currentDraftRevision();
  return changeDraft({
    cookie,
    json: `{"expectedDraftRevision":"${revision}","change":${changeText}}`,
  });
}

const ANCHOR_ADDRESS = {
  kind: "cabinet",
  ruleId: ANCHORED_RULE_ID,
  field: "anchorMinor",
} as const;

async function nothingWasWritten(revisionBefore: string): Promise<void> {
  expect(draftRows()).toEqual([]);
  expect((await storedDraft()).draftRevision).toBe(revisionBefore);
  expect((await storedDraft()).changes).toEqual([]);
}

describe("a change that is accepted", () => {
  it("is stored, answered as the draft now is, and recorded in one audit row naming the field and no value", async () => {
    const { cookie, accountId } = await administrator();
    const before = await currentDraftRevision();

    const answer = await putChange(cookie, {
      address: ANCHOR_ADDRESS,
      value: 125_000,
    });

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    const stored = await storedDraft();
    expect(stored.draftRevision).not.toBe(before);
    expect(stored.changes).toEqual([
      { address: ANCHOR_ADDRESS, value: 125_000 },
    ]);
    expect(await jsonOf(answer)).toEqual({
      draftRevision: stored.draftRevision,
      changes: [{ address: ANCHOR_ADDRESS, value: 125_000 }],
    });
    expect(
      draftRows().map(({ action, detail, actorAccountId }) => ({
        action,
        detail,
        actorAccountId,
      })),
    ).toEqual([
      {
        action: "price-draft-changed",
        detail: {
          changeKind: "cabinet",
          itemKind: "cabinet",
          itemId: ANCHORED_RULE_ID,
          field: "anchorMinor",
        },
        actorAccountId: accountId,
      },
    ]);
    expect(JSON.stringify(draftRows())).not.toContain("125000");
  });

  it.each([
    [
      "a listed size",
      { kind: "cabinet-size", ruleId: FIXED_SIZES_RULE_ID, widthMm: 400 },
      130_000,
      {
        changeKind: "cabinet-size",
        itemKind: "cabinet",
        itemId: FIXED_SIZES_RULE_ID,
        widthMm: 400,
      },
    ],
    [
      "a hardware rate",
      { kind: "hardware", tierId: "hardware.standard", field: "perHingeMinor" },
      2_000,
      {
        changeKind: "hardware",
        itemKind: "hardware",
        itemId: "hardware.standard",
        field: "perHingeMinor",
      },
    ],
    [
      "a material percentage",
      {
        kind: "material",
        tierId: "material.painted-mdf",
        field: "percentOfCabinets",
      },
      30,
      {
        changeKind: "material",
        itemKind: "material",
        itemId: "material.painted-mdf",
        field: "percentOfCabinets",
      },
    ],
    [
      "the depth rule",
      { kind: "depth-rule" },
      20,
      { changeKind: "depth-rule" },
    ],
    [
      "an accessory price",
      {
        kind: "accessory",
        accessoryId: "sinkProtectiveCover",
        field: "perUnitMinor",
      },
      15_000,
      {
        changeKind: "accessory",
        itemKind: "accessory",
        itemId: "sinkProtectiveCover",
        field: "perUnitMinor",
      },
    ],
    [
      "the provisional switch",
      { kind: "provisional" },
      false,
      { changeKind: "provisional" },
    ],
  ] as const)(
    "records %s under its own closed detail",
    async (_title, address, value, detail) => {
      const { cookie } = await administrator();

      const answer = await putChange(cookie, { address, value });

      expect(answer.status).toBe(200);
      expect(draftRows().map((row) => row.detail)).toEqual([detail]);
    },
  );

  it("replaces the earlier change of the same address and goes last", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, { address: ANCHOR_ADDRESS, value: 110_000 });
    await putChange(cookie, { address: { kind: "depth-rule" }, value: 20 });

    await putChange(cookie, { address: ANCHOR_ADDRESS, value: 120_000 });

    expect((await storedDraft()).changes).toEqual([
      { address: { kind: "depth-rule" }, value: 20 },
      { address: ANCHOR_ADDRESS, value: 120_000 },
    ]);
    expect(draftRows()).toHaveLength(3);
  });

  it("keeps only the members of a change, whatever its address and value arrived with", async () => {
    const { cookie } = await administrator();

    await putChange(cookie, { address: ANCHOR_ADDRESS, value: 125_000 });

    const changes = (await storedDraft()).changes as Record<string, object>[];
    expect(changes).toHaveLength(1);
    const [change] = changes;
    expect(Object.keys(change ?? {}).sort()).toEqual(["address", "value"]);
    expect(Object.keys(change?.address ?? {}).sort()).toEqual([
      "field",
      "kind",
      "ruleId",
    ]);
  });
});

describe("a change that is refused, with M1's code", () => {
  const MAX_PLUS_ONE = 10 ** 12;

  it.each([
    ["a negative amount", ANCHOR_ADDRESS, -1, "NEGATIVE"],
    ["a fraction", ANCHOR_ADDRESS, 1.5, "NOT_A_WHOLE_NUMBER"],
    ["an amount as text", ANCHOR_ADDRESS, "5", "NOT_A_WHOLE_NUMBER"],
    [
      "an amount past the book's bound",
      ANCHOR_ADDRESS,
      MAX_PLUS_ONE,
      "TOO_LARGE",
    ],
    ["no value", ANCHOR_ADDRESS, undefined, "MISSING_VALUE"],
    ["a null value", ANCHOR_ADDRESS, null, "MISSING_VALUE"],
    [
      "a rule the book does not have",
      { kind: "cabinet", ruleId: "cabinet.nowhere", field: "anchorMinor" },
      1_000,
      "UNKNOWN_RULE",
    ],
    [
      "a row the customer supplies",
      { kind: "cabinet", ruleId: CUSTOMER_RULE_ID, field: "anchorMinor" },
      1_000,
      "NOT_EDITABLE",
    ],
    [
      "a field the rule's formula does not read",
      {
        kind: "cabinet",
        ruleId: ANCHORED_RULE_ID,
        field: "perHeightStepMinor",
      },
      1_000,
      "FIELD_NOT_ON_RULE",
    ],
    [
      "a size the fixed-size row does not list",
      { kind: "cabinet-size", ruleId: FIXED_SIZES_RULE_ID, widthMm: 777 },
      1_000,
      "FIELD_NOT_ON_RULE",
    ],
    [
      "a hardware class the book does not have",
      { kind: "hardware", tierId: "hardware.nowhere", field: "perHingeMinor" },
      1_000,
      "UNKNOWN_ITEM",
    ],
    [
      "a field name no rule has",
      { kind: "hardware", tierId: "hardware.standard", field: "perNothing" },
      1_000,
      "UNKNOWN_ADDRESS",
    ],
    [
      "a depth percentage past its bound",
      { kind: "depth-rule" },
      101,
      "TOO_LARGE",
    ],
    [
      "the provisional switch given a number",
      { kind: "provisional" },
      1,
      "MISSING_VALUE",
    ],
  ] as const)(
    "answers %s with %s, writes nothing and echoes no value",
    async (_title, address, value, code) => {
      const { cookie } = await administrator();
      const before = await currentDraftRevision();

      const answer = await putChange(cookie, {
        address,
        ...(value === undefined ? {} : { value }),
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "change", code }],
      });
      await nothingWasWritten(before);
    },
  );

  it("answers a value of -0 as a negative amount: it prints as nothing and signs as a reduction", async () => {
    const { cookie } = await administrator();
    const before = await currentDraftRevision();

    const answer = await putRaw(
      cookie,
      `{"address":{"kind":"cabinet","ruleId":"${ANCHORED_RULE_ID}","field":"anchorMinor"},"value":-0}`,
    );

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "NEGATIVE" }],
    });
    await nothingWasWritten(before);
  });

  it.each([
    [
      "hardware-tier-created",
      { kind: "hardware-tier-created", tierId: "hardware.new" },
    ],
    [
      "accessory-created",
      { kind: "accessory-created", accessoryId: "accessory.new" },
    ],
    [
      "created-row-text",
      {
        kind: "created-row-text",
        item: { kind: "hardware", tierId: "h" },
        field: "name",
      },
    ],
    [
      "item-deleted",
      { kind: "item-deleted", item: { kind: "hardware", tierId: "h" } },
    ],
  ])(
    "answers the %s kind, which arrives with M4, NOT_EDITABLE on the address",
    async (_kind, address) => {
      const { cookie } = await administrator();
      const before = await currentDraftRevision();

      const answer = await putChange(cookie, { address, value: true });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "address", code: "NOT_EDITABLE" }],
      });
      await nothingWasWritten(before);
    },
  );

  it.each([
    ["no address", undefined],
    ["an address that is text", "cabinet"],
    ["a kind no address has", { kind: "nowhere" }],
    [
      "a cabinet address without its rule",
      { kind: "cabinet", field: "anchorMinor" },
    ],
    [
      "a member of the wrong type",
      { kind: "cabinet", ruleId: 7, field: "anchorMinor" },
    ],
    [
      "a width that is text",
      { kind: "cabinet-size", ruleId: "r", widthMm: "400" },
    ],
  ])("answers %s UNKNOWN_ADDRESS on the address", async (_title, address) => {
    const { cookie } = await administrator();

    const answer = await putChange(cookie, {
      ...(address === undefined ? {} : { address }),
      value: 1_000,
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "address", code: "UNKNOWN_ADDRESS" }],
    });
    expect(draftRows()).toEqual([]);
  });
});

describe("a single change never carries a group (groupId and bulk are only ever minted by the bulk route)", () => {
  const CRAFTED_GROUP = "crafted-group-1";
  const CRAFTED_BULK = { percent: 5, scope: "all" };

  it.each([
    ["a groupId and a bulk", { groupId: CRAFTED_GROUP, bulk: CRAFTED_BULK }],
    ["a groupId alone", { groupId: CRAFTED_GROUP }],
    ["a bulk alone", { bulk: CRAFTED_BULK }],
    [
      "a bulk that is not the shape of one",
      { groupId: CRAFTED_GROUP, bulk: "x" },
    ],
  ])(
    "refuses a change carrying %s as a request this route does not read, and stores nothing of it",
    async (_title, extra) => {
      const { cookie } = await administrator();
      const before = await currentDraftRevision();

      const answer = await putChange(cookie, {
        address: ANCHOR_ADDRESS,
        value: 125_000,
        ...extra,
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(await answer.clone().text()).not.toContain(CRAFTED_GROUP);
      await nothingWasWritten(before);
    },
  );

  it("refuses a groupId beside the change, at the body's top level", async () => {
    const { cookie } = await administrator();

    const answer = await changeDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: ANCHOR_ADDRESS, value: 125_000 },
        groupId: CRAFTED_GROUP,
      },
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    expect(draftRows()).toEqual([]);
  });

  it("refuses an address with a member of its kind's list left out, and one added", async () => {
    const { cookie } = await administrator();

    const added = await putChange(cookie, {
      address: { ...ANCHOR_ADDRESS, groupId: CRAFTED_GROUP },
      value: 125_000,
    });

    expect(added.status).toBe(400);
    expect(await jsonOf(added)).toEqual({ status: "invalid-request" });
    expect(draftRows()).toEqual([]);
  });
});

describe("the revision a change names", () => {
  it.each([
    ["absent", undefined, "MISSING_VALUE"],
    ["a number", 0, "MISSING_VALUE"],
    ["null", null, "MISSING_VALUE"],
    ["not digits", "abc", "NOT_A_WHOLE_NUMBER"],
    ["with a leading zero", "01", "NOT_A_WHOLE_NUMBER"],
    ["negative", "-1", "NOT_A_WHOLE_NUMBER"],
    ["empty", "", "NOT_A_WHOLE_NUMBER"],
    ["wider than a bigint", "12345678901234567890", "NOT_A_WHOLE_NUMBER"],
    ["past the widest bigint", "9223372036854775808", "NOT_A_WHOLE_NUMBER"],
  ] as const)(
    "is 400 on expectedDraftRevision when it is %s, and nothing is asked of the store",
    async (_title, revision, code) => {
      const { cookie } = await administrator();

      const answer = await changeDraft({
        cookie,
        json: {
          ...(revision === undefined
            ? {}
            : { expectedDraftRevision: revision }),
          change: { address: { kind: "depth-rule" }, value: 20 },
        },
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "expectedDraftRevision", code }],
      });
      expect(priceStoreAsks.count).toBe(0);
      expect(draftRows()).toEqual([]);
    },
  );

  it("is compared for equality and not parsed: the widest bigint is a revision, and it is the draft's no longer", async () => {
    const { cookie } = await administrator();

    const answer = await putChange(
      cookie,
      { address: { kind: "depth-rule" }, value: 20 },
      "9223372036854775807",
    );

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
  });

  it("is 409 changed-meanwhile for a change made against a draft that moved, and the later change stands unwritten", async () => {
    const first = await administrator();
    const second = await administrator("second@example.test");
    const seen = await currentDraftRevision();
    await putChange(
      first.cookie,
      { address: ANCHOR_ADDRESS, value: 110_000 },
      seen,
    );

    const answer = await putChange(
      second.cookie,
      { address: ANCHOR_ADDRESS, value: 120_000 },
      seen,
    );

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect((await storedDraft()).changes).toEqual([
      { address: ANCHOR_ADDRESS, value: 110_000 },
    ]);
    expect(draftRows()).toHaveLength(1);
  });

  it("is 409 changed-meanwhile for the later of two changes made at once, with one audit row", async () => {
    const first = await administrator();
    const second = await administrator("second@example.test");
    const seen = await currentDraftRevision();

    const answers = await Promise.all([
      putChange(
        first.cookie,
        { address: ANCHOR_ADDRESS, value: 110_000 },
        seen,
      ),
      putChange(
        second.cookie,
        { address: ANCHOR_ADDRESS, value: 120_000 },
        seen,
      ),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(draftRows()).toHaveLength(1);
  });

  it("is 409 no-active-version before the first publish, and writes nothing", async () => {
    prices = await freshPriceDashboardWorld({ isPublished: false });
    const { cookie } = await administrator();

    const answer = await putChange(
      cookie,
      { address: { kind: "depth-rule" }, value: 20 },
      "0",
    );

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "no-active-version" });
    expect(draftRows()).toEqual([]);
  });
});

describe("a write and its audit row are one thing", () => {
  it("answers 503 with no detail when the audit row cannot be staged, and the change is not visible", async () => {
    const { cookie } = await administrator();
    const before = await currentDraftRevision();
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await putChange(cookie, {
      address: ANCHOR_ADDRESS,
      value: 125_000,
    });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(await answer.clone().text()).not.toContain("125000");
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    await nothingWasWritten(before);
  });

  it("answers 503 when the store fails, with no second attempt", async () => {
    const { cookie } = await administrator();
    const write = vi
      .spyOn(prices.stores.priceBook, "writeDraft")
      .mockRejectedValue(new Error(DRIVER_FAILURE_MARKER));

    const answer = await putChange(cookie, {
      address: ANCHOR_ADDRESS,
      value: 125_000,
    });

    expect(answer.status).toBe(503);
    expect(write).toHaveBeenCalledTimes(1);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 401 when the session ended between the route's read and the store's write, and writes nothing", async () => {
    const { cookie, accountId } = await administrator();
    const before = await currentDraftRevision();
    const realStage = prices.ledger.stage.bind(prices.ledger);
    vi.spyOn(prices.ledger, "stage").mockImplementation(async (request) => {
      await world.sessions.revokeAllForAccount(accountId);
      return realStage(request);
    });

    const answer = await putChange(cookie, {
      address: ANCHOR_ADDRESS,
      value: 125_000,
    });

    expect(answer.status).toBe(401);
    await nothingWasWritten(before);
  });

  it("answers 409 candidate-refused, not a 400, when a change already stored no longer applies, and writes nothing", async () => {
    const { cookie } = await administrator();
    const revision = await currentDraftRevision();
    vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: revision,
      changes: [
        {
          address: {
            kind: "cabinet",
            ruleId: "cabinet.gone",
            field: "anchorMinor",
          },
          value: 5_000,
        },
      ],
    });

    const answer = await putChange(cookie, {
      address: { kind: "depth-rule" },
      value: 20,
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "candidate-refused" });
    expect(draftRows()).toEqual([]);
  });
});

describe("the guards", () => {
  it("refuses a cross-site request before the session is read", async () => {
    const answer = await changeDraft({
      secFetchSite: "cross-site",
      json: { expectedDraftRevision: "0", change: {} },
    });

    expect(answer.status).toBe(403);
    expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
  });

  it("refuses a body that is not JSON with 415", async () => {
    const { cookie } = await administrator();

    const answer = await changeDraft({
      cookie,
      contentType: "text/plain",
      json: "{}",
    });

    expect(answer.status).toBe(415);
    expect(draftRows()).toEqual([]);
  });

  it("refuses a body past its bound with 413", async () => {
    const { cookie } = await administrator();

    const answer = await changeDraft({
      cookie,
      json: JSON.stringify({ padding: "x".repeat(20_000) }),
    });

    expect(answer.status).toBe(413);
    expect(draftRows()).toEqual([]);
  });

  it.each([
    ["text that is not JSON", "{nope"],
    ["an array", "[]"],
    ["an empty object that names nothing", "{}"],
    [
      "a member this route does not take",
      '{"expectedDraftRevision":"0","change":{},"role":"administrator"}',
    ],
  ])("answers %s with 400, and writes nothing", async (_title, text) => {
    const { cookie } = await administrator();

    const answer = await changeDraft({ cookie, json: text });

    expect(answer.status).toBe(400);
    expect(draftRows()).toEqual([]);
  });
});

describe("the account's bucket", () => {
  it("is 600 an hour, provisional", () => {
    expect(STAFF_PRICE_DRAFT_PER_ACCOUNT_HOUR_FIGURE).toBe(600);
    expect(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.figure).toBe(600);
  });

  it("refuses with 429 and a whole-second wait above the figure, without asking a store", async () => {
    const { cookie } = await administrator();
    limiterLedger.refusing.set(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name, 5);

    const answer = await putChange(
      cookie,
      { address: ANCHOR_ADDRESS, value: 125_000 },
      "1",
    );

    expect(answer.status).toBe(429);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    expectAWaitWithinTheWindowOf(
      answer,
      STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name,
    );
    expect(priceStoreAsks.count).toBe(0);
    expect(draftRows()).toEqual([]);
  });

  it("fails closed: a bucket that cannot be counted writes nothing", async () => {
    const { cookie } = await administrator();
    limiterLedger.unavailable.add(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name);

    const answer = await putChange(
      cookie,
      { address: ANCHOR_ADDRESS, value: 125_000 },
      "1",
    );

    expect(answer.status).toBe(503);
    expect(priceStoreAsks.count).toBe(0);
    expect(draftRows()).toEqual([]);
  });

  it("counts a request that is admitted and valid, and not one whose body is refused", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;

    await changeDraft({ cookie, json: "{nope" });
    const refusedCount = limiterLedger.counted.filter(
      (name) => name === STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name,
    ).length;
    await putChange(cookie, { address: ANCHOR_ADDRESS, value: 125_000 });
    const afterValid = limiterLedger.counted.filter(
      (name) => name === STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name,
    ).length;

    expect(refusedCount).toBe(0);
    expect(afterValid).toBe(1);
  });
});

describe("DELETE: taking a change out of the draft (the arrow)", () => {
  async function revert(cookie: string, target: unknown, revision?: string) {
    return revertDraft({
      cookie,
      json: {
        expectedDraftRevision: revision ?? (await currentDraftRevision()),
        target,
      },
    });
  }

  it("removes the change named by its address, answers the draft, and records one row naming the field", async () => {
    const { cookie, accountId } = await administrator();
    await putChange(cookie, { address: ANCHOR_ADDRESS, value: 125_000 });
    await putChange(cookie, { address: { kind: "depth-rule" }, value: 20 });

    const answer = await revert(cookie, {
      kind: "change",
      address: ANCHOR_ADDRESS,
    });

    expect(answer.status).toBe(200);
    const stored = await storedDraft();
    expect(stored.changes).toEqual([
      { address: { kind: "depth-rule" }, value: 20 },
    ]);
    expect(await jsonOf(answer)).toEqual({
      draftRevision: stored.draftRevision,
      changes: [{ address: { kind: "depth-rule" }, value: 20 }],
    });
    const rows = draftRows();
    expect(rows).toHaveLength(3);
    expect(rows.at(-1)).toMatchObject({
      action: "price-draft-reverted",
      actorAccountId: accountId,
      detail: {
        changeKind: "cabinet",
        itemKind: "cabinet",
        itemId: ANCHORED_RULE_ID,
        field: "anchorMinor",
        revertedCount: 1,
      },
    });
  });

  it("answers a revert of an address the draft does not hold with 400, and writes no audit row at all", async () => {
    const { cookie } = await administrator();
    const before = await currentDraftRevision();

    const answer = await revert(cookie, {
      kind: "change",
      address: ANCHOR_ADDRESS,
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "address", code: "UNKNOWN_ADDRESS" }],
    });
    await nothingWasWritten(before);
  });

  it("answers a revert of a group the draft does not hold with 400 on groupId", async () => {
    const { cookie } = await administrator();

    const answer = await revert(cookie, {
      kind: "group",
      groupId: "no-such-group",
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "groupId", code: "UNKNOWN_ADDRESS" }],
    });
    expect(draftRows()).toEqual([]);
  });

  it("is 409 changed-meanwhile when the draft moved since the page read it, and removes nothing", async () => {
    const { cookie } = await administrator();
    const seen = await currentDraftRevision();
    await putChange(cookie, { address: ANCHOR_ADDRESS, value: 125_000 });

    const answer = await revert(
      cookie,
      { kind: "change", address: ANCHOR_ADDRESS },
      seen,
    );

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect((await storedDraft()).changes).toHaveLength(1);
    expect(draftRows()).toHaveLength(1);
  });

  it.each([
    ["no target", undefined, { field: "target", code: "MISSING_VALUE" }],
    [
      "a target of an unknown kind",
      { kind: "index", index: 0 },
      { field: "target", code: "MISSING_VALUE" },
    ],
    [
      "a group without its id",
      { kind: "group" },
      { field: "groupId", code: "MISSING_VALUE" },
    ],
  ] as const)(
    "answers %s with 400 on the member",
    async (_title, target, issue) => {
      const { cookie } = await administrator();

      const answer = await revertDraft({
        cookie,
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          ...(target === undefined ? {} : { target }),
        },
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [issue],
      });
    },
  );

  it("refuses a target carrying a member it does not take as a request it does not read", async () => {
    const { cookie } = await administrator();

    const answer = await revert(cookie, {
      kind: "change",
      address: ANCHOR_ADDRESS,
      index: 0,
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
  });

  it("heals a draft holding a change that no longer applies: removing it leaves a draft that does", async () => {
    const { cookie } = await administrator();
    const stale = {
      address: {
        kind: "cabinet",
        ruleId: "cabinet.gone",
        field: "anchorMinor",
      },
      value: 5_000,
    };
    const revision = await currentDraftRevision();
    vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: revision,
      changes: [stale],
    });

    const answer = await revert(
      cookie,
      { kind: "change", address: stale.address },
      revision,
    );

    expect(answer.status).toBe(200);
    expect(await jsonOf(answer)).toEqual({
      draftRevision: expect.any(String) as string,
      changes: [],
    });
  });

  it("answers 503 with the draft unchanged when the audit row cannot be staged", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, { address: ANCHOR_ADDRESS, value: 125_000 });
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await revert(cookie, {
      kind: "change",
      address: ANCHOR_ADDRESS,
    });

    expect(answer.status).toBe(503);
    expect((await storedDraft()).changes).toHaveLength(1);
    expect(draftRows()).toHaveLength(1);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("a stored draft that cannot be read (ruling R2-Q2)", () => {
  const JUNK = [
    { address: { kind: "cabinet" }, value: "STORED-JUNK-4471" },
    { address: { kind: "provisional" }, value: true },
  ];

  function unreadableAt(revision: string) {
    return vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: revision,
      changes: JUNK,
    });
  }

  it("is 409 draft-unreadable on the read, the change, the revert and the bulk action, naming the revision and nothing it holds", async () => {
    const { cookie } = await administrator();
    unreadableAt("1");
    const writeDraft = vi.spyOn(prices.stores.priceBook, "writeDraft");

    const answers = [
      await readState({ cookie }),
      await putChange(
        cookie,
        { address: { kind: "depth-rule" }, value: 20 },
        "1",
      ),
      await revertDraft({
        cookie,
        json: {
          expectedDraftRevision: "1",
          target: { kind: "change", address: { kind: "provisional" } },
        },
      }),
      await bulkDraft({
        cookie,
        json: {
          expectedDraftRevision: "1",
          target: { scope: "all" },
          percent: 5,
        },
      }),
    ];

    for (const answer of answers) {
      expect(answer.status).toBe(409);
      expect(await jsonOf(answer)).toEqual({
        status: "draft-unreadable",
        draftRevision: "1",
      });
    }
    expect(writeDraft).not.toHaveBeenCalled();
    expect(draftRows()).toEqual([]);
    expect(console_.everything()).not.toContain("STORED-JUNK-4471");
  });

  it("is reset to empty by a discard-all, which reads none of what it holds, and is recorded with a count of 0", async () => {
    const { cookie, accountId } = await administrator();
    const revision = await currentDraftRevision();
    unreadableAt(revision);

    const answer = await revertDraft({
      cookie,
      json: { expectedDraftRevision: revision, scope: "all" },
    });

    expect(answer.status).toBe(200);
    vi.restoreAllMocks();
    const stored = await storedDraft();
    expect(stored.changes).toEqual([]);
    expect(await jsonOf(answer)).toEqual({
      draftRevision: stored.draftRevision,
      changes: [],
    });
    expect(
      draftRows().map(({ action, detail, actorAccountId }) => ({
        action,
        detail,
        actorAccountId,
      })),
    ).toEqual([
      {
        action: "price-draft-reverted",
        detail: { changeKind: "discard-all", revertedCount: 0 },
        actorAccountId: accountId,
      },
    ]);
    expect(await answer.clone().text()).not.toContain("STORED-JUNK-4471");
  });
});

describe("DELETE with scope all: discarding the draft", () => {
  async function discard(cookie: string, revision?: string) {
    return revertDraft({
      cookie,
      json: {
        expectedDraftRevision: revision ?? (await currentDraftRevision()),
        scope: "all",
      },
    });
  }

  it("empties a readable draft and records one row counting the entries it held", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, { address: ANCHOR_ADDRESS, value: 125_000 });
    await putChange(cookie, { address: { kind: "depth-rule" }, value: 20 });

    const answer = await discard(cookie);

    expect(answer.status).toBe(200);
    expect((await storedDraft()).changes).toEqual([]);
    expect(draftRows().at(-1)).toMatchObject({
      action: "price-draft-reverted",
      detail: { changeKind: "discard-all", revertedCount: 2 },
    });
    expect(draftRows()).toHaveLength(3);
    expect(draftRows().at(-1)?.detail).not.toHaveProperty("itemId");
  });

  it("of a draft that is already empty is accepted and recorded with a count of 0", async () => {
    const { cookie } = await administrator();

    const answer = await discard(cookie);

    expect(answer.status).toBe(200);
    expect(draftRows().map((row) => row.detail)).toEqual([
      { changeKind: "discard-all", revertedCount: 0 },
    ]);
  });

  it("is 409 changed-meanwhile for a draft that moved since the page read it, and discards nothing", async () => {
    const { cookie } = await administrator();
    const seen = await currentDraftRevision();
    await putChange(cookie, { address: ANCHOR_ADDRESS, value: 125_000 });

    const answer = await discard(cookie, seen);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect((await storedDraft()).changes).toHaveLength(1);
    expect(draftRows()).toHaveLength(1);
  });

  it.each([
    ["a scope that is not all", "some"],
    ["a scope that is not text", true],
  ])(
    "answers %s with 400 on scope, and writes nothing",
    async (_title, scope) => {
      const { cookie } = await administrator();

      const answer = await revertDraft({
        cookie,
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          scope,
        },
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "scope", code: "MISSING_VALUE" }],
      });
      expect(draftRows()).toEqual([]);
    },
  );

  it("refuses a body that names both a target and a scope as a request this route does not read", async () => {
    const { cookie } = await administrator();

    const answer = await revertDraft({
      cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        scope: "all",
        target: { kind: "change", address: ANCHOR_ADDRESS },
      },
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
  });

  it("answers 503 with the draft unchanged when the audit row cannot be staged", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, { address: ANCHOR_ADDRESS, value: 125_000 });
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await discard(cookie);

    expect(answer.status).toBe(503);
    expect((await storedDraft()).changes).toHaveLength(1);
    expect(draftRows()).toHaveLength(1);
  });
});
