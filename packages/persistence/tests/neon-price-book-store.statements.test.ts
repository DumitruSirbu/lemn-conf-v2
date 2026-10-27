import { fc, test as propertyTest } from "@fast-check/vitest";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  NO_ACTIVE_VERSION,
  VERSION_NOT_FOUND,
} from "../src/m10-ports.js";
import type {
  DashboardStoreFailure,
  PublishPriceBookRequest,
} from "../src/m10-ports.js";
import { isRevisionShape } from "../src/dashboard-store-shapes.js";
import { NeonPriceBookStore } from "../src/neon-price-book-store.js";
import {
  listVersionsStatement,
  readActiveVersionStatement,
  readDraftStatement,
  readVersionStatement,
} from "../src/price-book-statements.js";
import { NeonSessionStore } from "../src/neon-session-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import type { SentQuery } from "./support/mocked-neon-query-driver.js";
import {
  orderByNamesOfAnOutputColumn,
  statementText,
} from "./support/order-by-output-aliases.js";
import { rejectionOf } from "./support/rejection-of.js";

const mintedIds = vi.hoisted(() => ({ count: 0 }));

/** Ids in order: a publish mints its version's id first and its audit row's second. */
vi.mock("nanoid", () => ({
  nanoid: () => String(++mintedIds.count).padStart(21, "0"),
}));

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The text of the statements `NeonPriceBookStore` sends, read as the driver receives them, with no database, and what
 * the store does with each reply. What a statement does with a row is the live file's to show
 * (`neon-price-book-store.live.test.ts`); this file pins the clauses the security rulings made conditions: one statement
 * for a write and its audit row (never a batch with an audit statement of its own), every branch conditional on the one
 * before it, the actor taken from the session in the statement, the sequence and change count of the audit row read from
 * the version row that was inserted, no retry of a write, and only a SQLSTATE and a constraint name leaving the store.
 */
const SESSION_HASH = "a".repeat(64);
const LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SESSION = {
  sessionTokenHash: SESSION_HASH,
  idleLifetimeSeconds: LIFETIMES,
};
const SECRET = "DRIVER-TEXT-SECRET-77d1";
const VERSION_ID = "000000000000000000001";
const AUDIT_ID = "000000000000000000002";
/** A draft write mints one id, its audit row's. */
const DRAFT_AUDIT_ID = VERSION_ID;
const BOOK = { version: "2026-10", material: { tiers: [{ tierId: "pal" }] } };
const DEPTH_CHANGE = { address: { kind: "depth-rule" }, value: 40 };

const DRAFT_CHANGED = {
  action: "price-draft-changed",
  detail: { changeKind: "depth-rule" },
} as const;

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonPriceBookStore {
  return new NeonPriceBookStore(WELL_FORMED_UNREACHABLE_VALUE);
}

function loneStatement(): SentQuery {
  const [statement, ...others] = queryDriver.statements;
  if (statement === undefined || others.length > 0) {
    throw new Error("the call did not send exactly one lone statement");
  }
  expect(queryDriver.transactions).toHaveLength(0);
  return statement;
}

/** The part of a statement from its session join to the end of the liveness test. */
function livenessPredicateOf(statement: SentQuery): string {
  const text = normalised(statement);
  const start = text.indexOf("from account_sessions s");
  const terminator = "interval '1 second') > now()";
  return text.slice(start, text.indexOf(terminator, start) + terminator.length);
}

function aDriverError(code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(`driver text ${SECRET}`), {
    name: "NeonDbError",
    code,
    ...extra,
  });
}

async function failureOf(
  call: () => Promise<unknown>,
  failure: DashboardStoreFailure,
): Promise<DashboardStoreError> {
  const rejection = await rejectionOf(call());
  expect(rejection).toBeInstanceOf(DashboardStoreError);
  expect((rejection as DashboardStoreError).failure).toBe(failure);
  return rejection as DashboardStoreError;
}

function aPublishRequest(
  overrides: Partial<PublishPriceBookRequest> = {},
): PublishPriceBookRequest {
  return {
    expectedDraftRevision: "3",
    expectedActiveSequence: 4,
    expectedAvailabilityRevision: "7",
    label: "November",
    note: "Prices for November.",
    book: BOOK,
    changeSummary: [DEPTH_CHANGE],
    createdItems: [
      { kind: "hardware", tierId: "premium-plus" },
      { kind: "accessory", accessoryId: "plinth-light" },
    ],
    audit: {
      session: SESSION,
      entry: { action: "price-published", detail: { provisional: true } },
    },
    ...overrides,
  };
}

const PUBLISHED_ROW = {
  draft_rows: 1,
  availability_revision: "9",
  version_id: VERSION_ID,
  sequence_number: "5",
  is_session_live: true,
  is_sequence_current: true,
  publish_complete: 1,
};

const REFUSED_ROW = {
  draft_rows: 1,
  availability_revision: null,
  version_id: null,
  sequence_number: null,
  is_session_live: true,
  is_sequence_current: true,
  publish_complete: 1,
};

beforeEach(() => {
  mintedIds.count = 0;
  resetQueryDriver();
});
afterEach(resetQueryDriver);

describe("reading the versions", () => {
  const versionRow = {
    id: VERSION_ID,
    sequence_number: "5",
    label: "November",
    note: "n",
    published_ms: "1790000000000",
    book: BOOK,
    change_summary: [DEPTH_CHANGE],
    is_active: true,
  };

  it("answers no active version when the table holds none, and the newest row when it holds some", async () => {
    answerQueryWith([]);
    expect(await newStore().readActive()).toBe(NO_ACTIVE_VERSION);
    expect(normalised(loneStatement())).toContain(
      "from price_book_versions v order by v.sequence_number desc limit 1",
    );

    resetQueryDriver();
    answerQueryWith([versionRow]);
    expect(await newStore().readActive()).toEqual({
      kind: "found",
      version: {
        versionId: VERSION_ID,
        sequenceNumber: 5,
        label: "November",
        publishedAt: new Date(1_790_000_000_000),
        book: BOOK,
      },
    });
  });

  it("does not send an id that is not a minted id's shape, and reads the state from the same snapshot as the row", async () => {
    for (const versionId of ["", "1", "not an id", `${VERSION_ID}0`]) {
      expect(await newStore().readVersion(versionId)).toBe(VERSION_NOT_FOUND);
    }
    expect(queryDriver.statements).toHaveLength(0);

    answerQueryWith([versionRow]);
    const read = await newStore().readVersion(VERSION_ID);

    expect(read).toMatchObject({
      kind: "found",
      version: { state: "active", note: "n", changeSummary: [DEPTH_CHANGE] },
    });
    expect(normalised(loneStatement())).toContain(
      "v.sequence_number = (select max(sequence_number) from price_book_versions) as is_active",
    );
    expect(loneStatement().values).toEqual([VERSION_ID]);
  });

  it("reads the page and the total in one statement, newest first, with the offset of the page", async () => {
    answerQueryWith([
      {
        total: 41,
        id: VERSION_ID,
        sequence_number: "41",
        label: "L",
        published_ms: "1790000000000",
        change_count: 3,
        is_active: true,
      },
    ]);

    const page = await newStore().listVersions({ page: 3 });

    expect(page).toEqual({
      total: 41,
      page: 3,
      pageSize: 20,
      versions: [
        {
          versionId: VERSION_ID,
          sequenceNumber: 41,
          label: "L",
          state: "active",
          publishedAt: new Date(1_790_000_000_000),
          changeCount: 3,
        },
      ],
    });
    expect(loneStatement().values).toEqual([20, 40]);
    expect(normalised(loneStatement())).toContain(
      "order by v.sequence_number desc limit ?::int offset ?::int",
    );
  });

  it.each([0, -1, 1.5, Number.NaN, 100_001, Number.MAX_SAFE_INTEGER])(
    "refuses page %s before it sends anything",
    async (page) => {
      await failureOf(
        () => newStore().listVersions({ page }),
        "invalid-request",
      );

      expect(queryDriver.statements).toHaveLength(0);
    },
  );

  it("reads an empty page as no versions with the total, and refuses a reply that is not that", async () => {
    answerQueryWith([
      {
        total: 2,
        id: null,
        sequence_number: null,
        label: null,
        published_ms: null,
        change_count: null,
        is_active: null,
      },
    ]);
    expect(await newStore().listVersions({ page: 9 })).toMatchObject({
      total: 2,
      versions: [],
    });

    resetQueryDriver();
    answerQueryWith([]);
    await failureOf(
      () => newStore().listVersions({ page: 1 }),
      "unexpected-answer",
    );
  });

  it.each([
    ["two rows", [versionRow, versionRow]],
    ["a book that is not an object", [{ ...versionRow, book: "x" }]],
    [
      "a sequence number that is not a whole number",
      [{ ...versionRow, sequence_number: "5.5" }],
    ],
    [
      "a stamp that is not milliseconds",
      [{ ...versionRow, published_ms: "soon" }],
    ],
  ])("refuses %s as an unexpected answer", async (_name, rows) => {
    answerQueryWith(rows);

    await failureOf(
      () => newStore().readVersion(VERSION_ID),
      "unexpected-answer",
    );
  });

  it("reads the draft as its revision and its changes, and refuses a revision that is not a revision's shape", async () => {
    answerQueryWith([{ revision: "12", changes: [DEPTH_CHANGE] }]);
    expect(await newStore().readDraft()).toEqual({
      draftRevision: "12",
      changes: [DEPTH_CHANGE],
    });

    resetQueryDriver();
    answerQueryWith([{ revision: "012", changes: [] }]);
    await failureOf(() => newStore().readDraft(), "unexpected-answer");

    resetQueryDriver();
    answerQueryWith([]);
    await failureOf(() => newStore().readDraft(), "unexpected-answer");
  });
});

describe("a draft write", () => {
  async function writeAndCapture(reply: unknown) {
    resetQueryDriver();
    answerQueryWith(reply);
    const result = await newStore().writeDraft({
      expectedDraftRevision: "3",
      changes: [DEPTH_CHANGE as never],
      audit: { session: SESSION, entry: DRAFT_CHANGED },
    });
    return { result, statement: loneStatement() };
  }

  const WRITTEN_ROW = { revision: "4", is_session_live: true, audited_rows: 1 };

  it("is one statement: the compare-and-set and the audit row are branches of a single with, not a batch", async () => {
    const { result, statement } = await writeAndCapture([WRITTEN_ROW]);

    const text = normalised(statement);
    expect(result).toEqual({ kind: "ok", draftRevision: "4" });
    expect(text).toMatch(
      /^with actor as \(.*\), moved as \( update price_book_draft /,
    );
    expect(text).toContain(
      "where revision = ?::bigint and exists (select 1 from actor) returning revision",
    );
    expect(text).toContain(
      "insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id, detail) select ?::text, a.account_id, ?::text, null, null, ?::jsonb from actor a where exists (select 1 from moved)",
    );
    expect(statement.values).toEqual([
      SESSION_HASH,
      JSON.stringify(LIFETIMES),
      JSON.stringify([DEPTH_CHANGE]),
      "3",
      DRAFT_AUDIT_ID,
      "price-draft-changed",
      JSON.stringify({ changeKind: "depth-rule" }),
    ]);
  });

  it("stamps updated_at with the literal now() and takes the account from the live session, and writes no column the grant omits", async () => {
    const { statement } = await writeAndCapture([WRITTEN_ROW]);

    const text = normalised(statement);
    expect(text).toContain(
      "set revision = revision + 1, changes = ?::jsonb, updated_at = now(), updated_by_account_id = (select account_id from actor)",
    );
    expect(text).not.toContain("occurred_at");
    expect(text).not.toContain("singleton");
    expect(text).not.toContain("base_version_id");
  });

  it("asks of the session what NeonSessionStore.findLive asks, word for word", async () => {
    answerQueryWith([]);
    await new NeonSessionStore(WELL_FORMED_UNREACHABLE_VALUE).findLive({
      tokenHash: SESSION_HASH,
      idleLifetimeSeconds: LIFETIMES,
    });
    const liveness = livenessPredicateOf(loneStatement());
    const { statement } = await writeAndCapture([WRITTEN_ROW]);

    expect(liveness).toContain("s.revoked_at is null");
    expect(livenessPredicateOf(statement)).toBe(liveness);
  });

  it("takes the actor only from an administrator's session, as the route also requires", async () => {
    const { statement } = await writeAndCapture([WRITTEN_ROW]);

    expect(normalised(statement)).toContain(
      "interval '1 second') > now() and a.role = 'administrator' ), moved as",
    );
  });

  it("refuses changes longer than a table takes, before it sends anything and without quoting them", async () => {
    const huge = [{ value: "x".repeat(2_097_152) }];

    const failure = await failureOf(
      () =>
        newStore().writeDraft({
          expectedDraftRevision: "3",
          changes: huge as never,
          audit: { session: SESSION, entry: DRAFT_CHANGED },
        }),
      "invalid-request",
    );

    expect(queryDriver.statements).toHaveLength(0);
    expect(failure.message).not.toContain("xxxx");
  });

  it("answers changed-meanwhile when the compare-and-set moved no row, and not-recorded when no session stood behind it", async () => {
    expect(
      (
        await writeAndCapture([
          { revision: null, is_session_live: true, audited_rows: 0 },
        ])
      ).result,
    ).toBe(CHANGED_MEANWHILE);

    resetQueryDriver();
    answerQueryWith([
      { revision: null, is_session_live: false, audited_rows: 0 },
    ]);
    await failureOf(
      () =>
        newStore().writeDraft({
          expectedDraftRevision: "3",
          changes: [],
          audit: { session: SESSION, entry: DRAFT_CHANGED },
        }),
      "not-recorded",
    );
  });

  it.each([
    [
      "an audit entry that is not a draft entry",
      {
        action: "price-published",
        detail: { provisional: true, sequenceNumber: 1, changeCount: 0 },
      },
    ],
    [
      "an audit entry the domain refuses",
      { action: "price-draft-changed", detail: { changeKind: "no-such-kind" } },
    ],
    [
      "an audit entry with a key outside the closed list",
      {
        action: "price-draft-changed",
        detail: { changeKind: "depth-rule", label: "Secret" },
      },
    ],
  ])("refuses %s before it sends anything", async (_name, entry) => {
    await failureOf(
      () =>
        newStore().writeDraft({
          expectedDraftRevision: "3",
          changes: [],
          audit: { session: SESSION, entry: entry as never },
        }),
      "invalid-request",
    );

    expect(queryDriver.statements).toHaveLength(0);
  });

  it.each(["", "abc", "-1", "01", "1e3", "9223372036854775808"])(
    "refuses the draft revision %j as not a revision's shape before it sends anything",
    async (expectedDraftRevision) => {
      await failureOf(
        () =>
          newStore().writeDraft({
            expectedDraftRevision,
            changes: [],
            audit: { session: SESSION, entry: DRAFT_CHANGED },
          }),
        "invalid-request",
      );

      expect(queryDriver.statements).toHaveLength(0);
    },
  );

  it("refuses changes that are not an array, or that JSON cannot hold, before it sends anything", async () => {
    for (const changes of [{ a: 1 }, undefined, "[]", [{ n: 1n }]]) {
      await failureOf(
        () =>
          newStore().writeDraft({
            expectedDraftRevision: "3",
            changes: changes as never,
            audit: { session: SESSION, entry: DRAFT_CHANGED },
          }),
        "invalid-request",
      );
    }

    expect(queryDriver.statements).toHaveLength(0);
  });

  it("is never retried, and says only a SQLSTATE of the failure", async () => {
    resetQueryDriver();
    failQueryWith(
      Object.assign(new Error(`{"neon:retryable":true} ${SECRET}`), {
        name: "NeonDbError",
        code: "08006",
      }),
    );

    const failure = await failureOf(
      () =>
        newStore().writeDraft({
          expectedDraftRevision: "3",
          changes: [],
          audit: { session: SESSION, entry: DRAFT_CHANGED },
        }),
      "database",
    );

    expect(queryDriver.statements).toHaveLength(1);
    expect(JSON.stringify([failure.message, failure.cause])).not.toContain(
      SECRET,
    );
  });

  it.each([
    ["42501", "unavailable"],
    ["42P01", "unavailable"],
    ["57014", "database"],
  ] as const)("reads SQLSTATE %s as %s", async (code, expected) => {
    resetQueryDriver();
    failQueryWith(aDriverError(code));

    await failureOf(
      () =>
        newStore().writeDraft({
          expectedDraftRevision: "3",
          changes: [],
          audit: { session: SESSION, entry: DRAFT_CHANGED },
        }),
      expected,
    );
  });

  it.each([
    [
      "a revision that is not a revision",
      { revision: "x", is_session_live: true, audited_rows: 1 },
    ],
    ["no audit row", { revision: "4", is_session_live: true, audited_rows: 0 }],
    [
      "a session flag that is not a boolean",
      { revision: "4", is_session_live: "yes", audited_rows: 1 },
    ],
  ])("refuses %s as an unexpected answer", async (_name, row) => {
    resetQueryDriver();
    answerQueryWith([row]);

    await failureOf(
      () =>
        newStore().writeDraft({
          expectedDraftRevision: "3",
          changes: [],
          audit: { session: SESSION, entry: DRAFT_CHANGED },
        }),
      "unexpected-answer",
    );
  });
});

describe("a publish", () => {
  async function publishAndCapture(
    reply: unknown,
    request = aPublishRequest(),
  ) {
    resetQueryDriver();
    mintedIds.count = 0;
    answerQueryWith(reply);
    const result = await newStore().publish(request);
    return { result, statement: loneStatement() };
  }

  it("is one statement, never a batch: the audit row is a branch of the write, and there is no audit statement of its own", async () => {
    const { result, statement } = await publishAndCapture([PUBLISHED_ROW]);

    expect(result).toEqual({
      kind: "ok",
      versionId: VERSION_ID,
      sequenceNumber: 5,
      availabilityRevision: "9",
    });
    expect(queryDriver.transactions).toHaveLength(0);
    expect(
      normalised(statement).match(/insert into staff_audit_events/g),
    ).toHaveLength(1);
  });

  it("makes every effect conditional on the one before it: the lock, the head, then the draft reset, the version, the log rows and the audit row", async () => {
    const { statement } = await publishAndCapture([PUBLISHED_ROW]);

    const text = normalised(statement);
    expect(text).toContain(
      "draft_row as materialized ( select revision from price_book_draft where revision = ?::bigint for update )",
    );
    expect(text).toContain(
      "set revision = revision + greatest((select count(*) from created_items), 1) where revision = ?::bigint and exists (select 1 from actor) and exists (select 1 from draft_row) and (select coalesce(max(sequence_number), 0) from price_book_versions) = ?::bigint returning revision",
    );
    expect(text).toContain(
      "and exists (select 1 from moved_head) returning revision",
    );
    expect(text).toContain(
      "from reset_draft cross join actor a returning id, sequence_number",
    );
    expect(text).toContain(
      "from moved_head h cross join actor a join created_items c on true where exists (select 1 from reset_draft)",
    );
    expect(text).toContain(
      "from inserted_version v cross join actor a returning id",
    );
  });

  it("reads the audit row's sequence number and change count from the version row it inserted, and from no value the caller supplied", async () => {
    const forged = aPublishRequest({
      audit: {
        session: SESSION,
        entry: {
          action: "price-published",
          detail: { provisional: false, sequenceNumber: 99, changeCount: 7 },
        },
      } as never,
    });
    const { statement } = await publishAndCapture([PUBLISHED_ROW], forged);

    expect(normalised(statement)).toContain(
      "jsonb_build_object('sequencenumber', v.sequence_number, 'changecount', v.change_count)",
    );
    expect(statement.values).toContain(JSON.stringify({ provisional: false }));
    expect(statement.values).not.toContain(99);
    expect(JSON.stringify(statement.values)).not.toContain("99");
  });

  it("moves the head by greatest(k, 1) and logs the k created items inactive at old + 1 to old + k, from the head update's own result", async () => {
    const { statement } = await publishAndCapture([PUBLISHED_ROW]);

    const text = normalised(statement);
    expect(text).toContain(
      "select h.revision - greatest((select count(*) from created_items), 1) + c.position, c.kind, c.item_id, false, a.account_id",
    );
    expect(text).toContain(
      "from unnest(?::text[], ?::text[]) with ordinality as t(kind, item_id, position)",
    );
    expect(statement.values).toContainEqual(["hardware", "accessory"]);
    expect(statement.values).toContainEqual(["premium-plus", "plinth-light"]);
  });

  it("inserts the version at the sequence number after the one the publisher saw, and names the columns the grant gives", async () => {
    const { statement } = await publishAndCapture([PUBLISHED_ROW]);

    const text = normalised(statement);
    expect(text).toContain(
      "insert into price_book_versions (id, sequence_number, label, note, book, change_summary, published_by_account_id) select ?::text, ?::bigint + 1,",
    );
    expect(text).not.toContain("published_at");
    expect(text).toContain(
      "set revision = revision + 1, changes = '[]'::jsonb, base_version_id = ?::text, updated_at = now(), updated_by_account_id = (select account_id from actor)",
    );
    expect(statement.values).toEqual([
      SESSION_HASH,
      JSON.stringify(LIFETIMES),
      ["hardware", "accessory"],
      ["premium-plus", "plinth-light"],
      "3",
      "7",
      "4",
      VERSION_ID,
      "3",
      VERSION_ID,
      "4",
      "November",
      "Prices for November.",
      JSON.stringify(BOOK),
      VERSION_ID,
      JSON.stringify([DEPTH_CHANGE]),
      AUDIT_ID,
      "price-published",
      JSON.stringify({ provisional: true }),
      "4",
    ]);
  });

  it("stores the book with its version set to the version's id, in the statement, whatever version the book carried", async () => {
    const { statement } = await publishAndCapture([PUBLISHED_ROW]);

    expect(normalised(statement)).toContain(
      "?::jsonb || jsonb_build_object('version', ?::text), ?::jsonb, a.account_id",
    );
    expect(statement.values).toContain(JSON.stringify(BOOK));
  });

  it("raises when the head moved and another branch did not write, so the statement rolls back whole", async () => {
    const { statement } = await publishAndCapture([PUBLISHED_ROW]);

    expect(normalised(statement)).toContain(
      "power( case when (select count(*) from moved_head) = 1 and ((select count(*) from reset_draft) <> 1 or (select count(*) from inserted_version) <> 1 or (select count(*) from audited) <> 1 or (select count(*) from logged) <> (select count(*) from created_items)) then 0 else 1 end, -1) as publish_complete",
    );
  });

  it("asks of the session what NeonSessionStore.findLive asks, word for word", async () => {
    answerQueryWith([]);
    await new NeonSessionStore(WELL_FORMED_UNREACHABLE_VALUE).findLive({
      tokenHash: SESSION_HASH,
      idleLifetimeSeconds: LIFETIMES,
    });
    const liveness = livenessPredicateOf(loneStatement());
    const { statement } = await publishAndCapture([PUBLISHED_ROW]);

    expect(livenessPredicateOf(statement)).toBe(liveness);
  });

  it("reads a head that moved as availability-changed-meanwhile, and a draft or sequence that moved as changed-meanwhile", async () => {
    expect((await publishAndCapture([REFUSED_ROW])).result).toBe(
      AVAILABILITY_CHANGED_MEANWHILE,
    );
    expect(
      (await publishAndCapture([{ ...REFUSED_ROW, draft_rows: 0 }])).result,
    ).toBe(CHANGED_MEANWHILE);
    expect(
      (
        await publishAndCapture([
          { ...REFUSED_ROW, is_sequence_current: false },
        ])
      ).result,
    ).toBe(CHANGED_MEANWHILE);
  });

  it("reads a call with no live session as not-recorded before it reads any other refusal", async () => {
    resetQueryDriver();
    answerQueryWith([
      { ...REFUSED_ROW, draft_rows: 0, is_session_live: false },
    ]);

    await failureOf(
      () => newStore().publish(aPublishRequest()),
      "not-recorded",
    );
  });

  it("reads the statement's own raise, and a sequence number two publishes both took, as changed-meanwhile", async () => {
    resetQueryDriver();
    failQueryWith(aDriverError("2201F"));
    expect(await newStore().publish(aPublishRequest())).toBe(CHANGED_MEANWHILE);

    resetQueryDriver();
    failQueryWith(
      aDriverError("23505", {
        constraint: "price_book_versions_sequence_number_is_unique",
      }),
    );
    expect(await newStore().publish(aPublishRequest())).toBe(CHANGED_MEANWHILE);
  });

  it("does not read another unique violation, or any other failure, as a refusal", async () => {
    resetQueryDriver();
    failQueryWith(
      aDriverError("23505", {
        constraint: "catalogue_availability_changes_pkey",
      }),
    );
    const failure = await failureOf(
      () => newStore().publish(aPublishRequest()),
      "database",
    );

    expect(failure.cause).toMatchObject({
      code: "23505",
      constraint: "catalogue_availability_changes_pkey",
    });
    expect(JSON.stringify([failure.message, failure.cause])).not.toContain(
      SECRET,
    );
  });

  it("is never retried", async () => {
    resetQueryDriver();
    failQueryWith(
      Object.assign(new Error(`{"neon:retryable":true} ${SECRET}`), {
        name: "NeonDbError",
        code: "08006",
      }),
    );

    await failureOf(() => newStore().publish(aPublishRequest()), "database");

    expect(queryDriver.statements).toHaveLength(1);
  });

  it.each([
    ["a malformed draft revision", { expectedDraftRevision: "01" }],
    [
      "a malformed availability revision",
      { expectedAvailabilityRevision: "1e3" },
    ],
    ["a negative sequence", { expectedActiveSequence: -1 }],
    ["a fractional sequence", { expectedActiveSequence: 1.5 }],
    ["an empty label", { label: "" }],
    ["a label of 81 characters", { label: "a".repeat(81) }],
    ["a note of 241 characters", { note: "a".repeat(241) }],
    ["a label holding NUL", { label: "a\u0000b" }],
    ["a book that is an array", { book: [] }],
    ["a book that is a string", { book: "a book" }],
    ["no book", { book: undefined }],
    ["a change summary that is an object", { changeSummary: { count: 1 } }],
    [
      "a created item with an empty id",
      { createdItems: [{ kind: "hardware", tierId: "" }] },
    ],
    [
      "a created item with an id the table refuses",
      { createdItems: [{ kind: "accessory", accessoryId: "a b" }] },
    ],
    [
      "an audit entry that is not a publish entry",
      { audit: { session: SESSION, entry: DRAFT_CHANGED } },
    ],
    [
      "a session whose hash is not a digest",
      {
        audit: {
          session: { ...SESSION, sessionTokenHash: "nope" },
          entry: { action: "price-published", detail: { provisional: true } },
        },
      },
    ],
  ])("refuses %s before it sends anything", async (_name, overrides) => {
    await failureOf(
      () => newStore().publish(aPublishRequest(overrides as never)),
      "invalid-request",
    );

    expect(queryDriver.statements).toHaveLength(0);
  });

  it("takes the actor only from an administrator's session, as the route also requires", async () => {
    const { statement } = await publishAndCapture([PUBLISHED_ROW]);

    expect(normalised(statement)).toContain(
      "interval '1 second') > now() and a.role = 'administrator' ), created_items as",
    );
  });

  it.each([
    ["a book", { book: { text: "x".repeat(2_097_152) } }],
    ["a change summary", { changeSummary: ["x".repeat(2_097_152)] }],
  ])(
    "refuses %s longer than a table takes before it sends anything, without quoting it",
    async (_name, overrides) => {
      const failure = await failureOf(
        () => newStore().publish(aPublishRequest(overrides as never)),
        "invalid-request",
      );

      expect(queryDriver.statements).toHaveLength(0);
      expect(failure.message).not.toContain("xxxx");
    },
  );

  it("accepts a book that is just inside the bound", async () => {
    const { result } = await publishAndCapture(
      [PUBLISHED_ROW],
      aPublishRequest({ book: { text: "x".repeat(2_097_000) } }),
    );

    expect(result.kind).toBe("ok");
  });

  it("counts a label in characters, as the table does, so 80 emoji are accepted", async () => {
    const { result } = await publishAndCapture(
      [PUBLISHED_ROW],
      aPublishRequest({ label: "🍎".repeat(80) }),
    );

    expect(result.kind).toBe("ok");
  });

  it.each([
    [
      "a version id that is not the one minted",
      { ...PUBLISHED_ROW, version_id: "x" },
    ],
    [
      "an availability revision that is not a revision",
      { ...PUBLISHED_ROW, availability_revision: "09" },
    ],
    [
      "a sequence number that is not a whole number",
      { ...PUBLISHED_ROW, sequence_number: "1.5" },
    ],
    ["a missing session flag", { ...REFUSED_ROW, is_session_live: null }],
  ])("refuses %s as an unexpected answer", async (_name, row) => {
    resetQueryDriver();
    answerQueryWith([row]);

    await failureOf(
      () => newStore().publish(aPublishRequest()),
      "unexpected-answer",
    );
  });
});

describe("wave S2 adversarial QA: what the statements' text and the stores' shape checks let through", () => {
  describe("the order by of a reader", () => {
    it.each([
      ["the active version", readActiveVersionStatement(statementText)],
      ["one version", readVersionStatement(statementText, VERSION_ID)],
      [
        "the page of versions",
        listVersionsStatement(statementText, { offset: 0, limit: 20 }),
      ],
      ["the draft", readDraftStatement(statementText)],
    ])(
      "sorts %s by a column and never by an output column of the same name",
      (_name, text) => {
        // `sequence_number::text as sequence_number … order by sequence_number` sorts the text, so version 9 follows 10.
        expect(orderByNamesOfAnOutputColumn(text)).toEqual([]);
      },
    );

    it("is able to see the defect it guards against", () => {
      expect(
        orderByNamesOfAnOutputColumn(
          "select n::text as n from t order by n desc limit 1",
        ),
      ).toEqual(["n"]);
      expect(
        orderByNamesOfAnOutputColumn(
          "select n::text as n from t order by t.n desc limit 1",
        ),
      ).toEqual([]);
    });
  });

  describe("json the table cannot hold, or holds as far more text than it was sent as", () => {
    // PostgreSQL prints a `jsonb` number in plain decimal: 5e-324 as 326 characters, 1.7976931348623157e+308 as 309 and
    // 1e+21 as 22, where `JSON.stringify` wrote 6, 23 and 5. Each count below is 0.09 to 1 MiB of compact text and more
    // than the 4 MiB of `jsonb` text that `0023` and `0024` accept (measured on PostgreSQL 17: a `23514` check violation).
    const EXPONENT_NUMBER_ARRAYS = [
      ["13 000 copies of the smallest double", Array(13_000).fill(5e-324)],
      [
        "14 000 copies of the largest double",
        Array(14_000).fill(Number.MAX_VALUE),
      ],
      ["180 000 copies of 1e21", Array(180_000).fill(1e21)],
    ] as const;

    it.each(EXPONENT_NUMBER_ARRAYS)(
      "refuses a book of %s before it sends anything",
      async (_name, numbers) => {
        await failureOf(
          () =>
            newStore().publish(aPublishRequest({ book: { numbers } as never })),
          "invalid-request",
        );

        expect(queryDriver.statements).toHaveLength(0);
      },
    );

    it.each(EXPONENT_NUMBER_ARRAYS)(
      "refuses a change summary of %s before it sends anything",
      async (_name, numbers) => {
        await failureOf(
          () =>
            newStore().publish(
              aPublishRequest({ changeSummary: numbers as never }),
            ),
          "invalid-request",
        );

        expect(queryDriver.statements).toHaveLength(0);
      },
    );

    it.each(EXPONENT_NUMBER_ARRAYS)(
      "refuses draft changes of %s before it sends anything",
      async (_name, numbers) => {
        await failureOf(
          () =>
            newStore().writeDraft({
              expectedDraftRevision: "3",
              changes: numbers as never,
              audit: { session: SESSION, entry: DRAFT_CHANGED },
            }),
          "invalid-request",
        );

        expect(queryDriver.statements).toHaveLength(0);
      },
    );

    it("still sends a book of the same count of whole numbers, which the table holds as the text it was sent as", async () => {
      answerQueryWith([PUBLISHED_ROW]);

      const result = await newStore().publish(
        aPublishRequest({ book: { numbers: Array(180_000).fill(1) } as never }),
      );

      expect(result.kind).toBe("ok");
    });

    it.each([
      ["a NUL", "\u0000"],
      ["a lone high surrogate", "\ud800"],
      ["a lone low surrogate", "\udc00"],
    ])(
      "refuses json holding %s anywhere in a book, a summary or a draft before it sends anything",
      async (_name, text) => {
        // `jsonb` refuses `\u0000` (22P05) and a lone surrogate escape (22P02), and `JSON.stringify` writes both.
        const failures = [
          () =>
            newStore().publish(aPublishRequest({ book: { text } as never })),
          () => newStore().publish(aPublishRequest({ changeSummary: [text] })),
          () =>
            newStore().writeDraft({
              expectedDraftRevision: "3",
              changes: [{ text }] as never,
              audit: { session: SESSION, entry: DRAFT_CHANGED },
            }),
        ];

        for (const call of failures) {
          await failureOf(call, "invalid-request");
        }

        expect(queryDriver.statements).toHaveLength(0);
      },
    );

    it("still sends json holding a surrogate pair, which is one character", async () => {
      answerQueryWith([PUBLISHED_ROW]);

      const result = await newStore().publish(
        aPublishRequest({ book: { text: "\u{1F34E}" } as never }),
      );

      expect(result.kind).toBe("ok");
    });
  });

  describe("the bound on a stored document, counted in bytes of compact text", () => {
    const BOUND = 2_097_152;
    const BOOK_WRAPPER_BYTES = '{"text":""}'.length;
    const ARRAY_WRAPPER_BYTES = '[""]'.length;

    it("sends a book of exactly the bound and refuses one byte more", async () => {
      answerQueryWith([PUBLISHED_ROW]);
      const book = (bytes: number) => ({
        text: "x".repeat(bytes - BOOK_WRAPPER_BYTES),
      });

      const atBound = await newStore().publish(
        aPublishRequest({ book: book(BOUND) }),
      );
      await failureOf(
        () => newStore().publish(aPublishRequest({ book: book(BOUND + 1) })),
        "invalid-request",
      );

      expect(atBound.kind).toBe("ok");
      expect(queryDriver.statements).toHaveLength(1);
    });

    it("sends a change summary and draft changes of exactly the bound and refuses one byte more", async () => {
      const entry = (bytes: number) => [
        "x".repeat(bytes - ARRAY_WRAPPER_BYTES),
      ];
      const draft = (changes: readonly unknown[]) =>
        newStore().writeDraft({
          expectedDraftRevision: "3",
          changes: changes as never,
          audit: { session: SESSION, entry: DRAFT_CHANGED },
        });
      answerQueryWith([PUBLISHED_ROW]);
      answerQueryWith([
        { revision: "4", is_session_live: true, audited_rows: 1 },
      ]);

      const summaryAtBound = await newStore().publish(
        aPublishRequest({ changeSummary: entry(BOUND) }),
      );
      const draftAtBound = await draft(entry(BOUND));
      await failureOf(
        () =>
          newStore().publish(
            aPublishRequest({ changeSummary: entry(BOUND + 1) }),
          ),
        "invalid-request",
      );
      await failureOf(() => draft(entry(BOUND + 1)), "invalid-request");

      expect(summaryAtBound.kind).toBe("ok");
      expect(draftAtBound.kind).toBe("ok");
      expect(queryDriver.statements).toHaveLength(2);
    });

    it("counts bytes and not characters: a book of 3-byte characters is refused once its bytes pass the bound", async () => {
      const euros = (characters: number) => ({ text: "€".repeat(characters) });
      const widest = Math.floor((BOUND - BOOK_WRAPPER_BYTES) / 3);
      answerQueryWith([PUBLISHED_ROW]);

      const atBound = await newStore().publish(
        aPublishRequest({ book: euros(widest) }),
      );
      await failureOf(
        () => newStore().publish(aPublishRequest({ book: euros(widest + 1) })),
        "invalid-request",
      );

      expect(atBound.kind).toBe("ok");
    });
  });

  describe("an item a publish creates, which the append-only log keeps for good", () => {
    it("refuses a created handle the book does not list before it sends anything", async () => {
      await failureOf(
        () =>
          newStore().publish(
            aPublishRequest({
              createdItems: [{ kind: "handle", handle: "nope" } as never],
            }),
          ),
        "invalid-request",
      );

      expect(queryDriver.statements).toHaveLength(0);
    });

    it("sends a created handle the book lists", async () => {
      answerQueryWith([PUBLISHED_ROW]);

      const result = await newStore().publish(
        aPublishRequest({
          createdItems: [{ kind: "handle", handle: "steel" }],
        }),
      );

      expect(result.kind).toBe("ok");
    });
  });

  describe("a revision, which is opaque text", () => {
    const WIDEST_BIGINT = 9_223_372_036_854_775_807n;
    const REVISION_CHARACTERS = [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "-",
      "+",
      "e",
      ".",
      " ",
      "\n",
      "١",
      "１",
    ];

    function isCanonicalBigintText(candidate: string): boolean {
      return (
        /^(0|[1-9][0-9]*)$/.test(candidate) &&
        BigInt(candidate) <= WIDEST_BIGINT
      );
    }

    propertyTest.prop([
      fc.string({
        unit: fc.constantFrom(...REVISION_CHARACTERS),
        maxLength: 22,
      }),
    ])(
      "is held to the canonical digit run a bigint column holds, by any string",
      (text) => {
        expect(isRevisionShape(text)).toBe(isCanonicalBigintText(text));
      },
    );

    propertyTest.prop([fc.bigInt({ min: -3n, max: 3n })])(
      "changes its answer exactly at the widest bigint",
      (offset) => {
        const candidate = WIDEST_BIGINT + offset;

        expect(isRevisionShape(candidate.toString())).toBe(offset <= 0n);
      },
    );

    it("is never parsed, ordered or counted with in the TypeScript of the stores or the text of their statements", () => {
      const sourceOf = (file: string) =>
        readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
      const stores = [
        "neon-price-book-store.ts",
        "neon-catalogue-availability-store.ts",
      ].map(sourceOf);
      const statements = [
        "price-book-statements.ts",
        "catalogue-availability-statements.ts",
      ].map(sourceOf);

      for (const source of [...stores, ...statements]) {
        expect(source).not.toMatch(
          /\bBigInt\s*\(|\bparseInt\s*\(|\bparseFloat\s*\(/,
        );
      }
      for (const source of stores) {
        expect(source).not.toMatch(/[Rr]evision\w*\s*[-+*/<>]=?\s*\w/);
      }
    });
  });
});

describe("the json a store sends, as a table reads it back", () => {
  it.each([
    ["a fraction", 1.5],
    ["a number past the safe integers", 2 ** 60],
    ["a negative fraction", -0.25],
  ])(
    "refuses %s anywhere in a book, a summary or a draft before it sends anything",
    async (_name, number) => {
      const calls = [
        () =>
          newStore().publish(
            aPublishRequest({ book: { nested: [{ rate: number }] } as never }),
          ),
        () =>
          newStore().publish(
            aPublishRequest({ changeSummary: [{ value: number }] }),
          ),
        () =>
          newStore().writeDraft({
            expectedDraftRevision: "3",
            changes: [{ value: number }] as never,
            audit: { session: SESSION, entry: DRAFT_CHANGED },
          }),
      ];

      for (const call of calls) await failureOf(call, "invalid-request");

      expect(queryDriver.statements).toHaveLength(0);
    },
  );

  it("sends whole numbers of either sign, and zero", async () => {
    answerQueryWith([PUBLISHED_ROW]);

    const result = await newStore().publish(
      aPublishRequest({
        book: {
          amounts: [0, -5, 9_007_199_254_740_991, -9_007_199_254_740_991],
        } as never,
      }),
    );

    expect(result.kind).toBe("ok");
  });

  it("refuses a NUL or a lone surrogate in an object key as it does in a string", async () => {
    for (const key of ["a\u0000b", "\ud800"]) {
      await failureOf(
        () =>
          newStore().publish(aPublishRequest({ book: { [key]: 1 } as never })),
        "invalid-request",
      );
    }

    expect(queryDriver.statements).toHaveLength(0);
  });

  it("walks a value nested a hundred thousand deep without overflowing the stack", async () => {
    let nested: unknown = 1;
    for (let depth = 0; depth < 100_000; depth += 1) nested = [nested];

    await expect(
      newStore().publish(aPublishRequest({ changeSummary: nested as never })),
    ).rejects.toBeDefined();
  });
});
