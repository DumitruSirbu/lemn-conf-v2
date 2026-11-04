import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_STORED_DEFAULTS_BYTES } from "../src/dashboard-store-shapes.js";
import {
  AVAILABILITY_CHANGED_MEANWHILE,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  NONE_SAVED,
} from "../src/m10-ports.js";
import type { DashboardStoreFailure } from "../src/m10-ports.js";
import { NeonKitchenDefaultsStore } from "../src/neon-kitchen-defaults-store.js";
import { NeonSessionStore } from "../src/neon-session-store.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";
import type { SentQuery } from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

const mintedIds = vi.hoisted(() => ({ count: 0 }));

/** A save mints one id: its audit row's. */
vi.mock("nanoid", () => ({
  nanoid: () => String(++mintedIds.count).padStart(21, "0"),
}));

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The text of the statements `NeonKitchenDefaultsStore` sends, read as the driver receives them, with no database, and
 * what the store does with each reply. What a statement does with a row is the live file's to show
 * (`neon-kitchen-defaults-store.live.test.ts`); this file pins the clauses that are conditions: one statement for the
 * head's compare-and-set, the defaults row and the audit row, each conditional on the one before it, the defaults
 * revision a condition of the head's move, the actor taken from the session in the statement, no retry of a write, and no
 * column the grants of `0029` leave out.
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
const SECRET = "DRIVER-TEXT-SECRET-91f2";
const AUDIT_ID = "000000000000000000001";
const DEFAULTS = { materialTierId: "mdf", handle: "steel" };
const SAVED_ENTRY = {
  action: "kitchen-defaults-saved",
  detail: { changedFields: ["material"] },
} as const;

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonKitchenDefaultsStore {
  return new NeonKitchenDefaultsStore(WELL_FORMED_UNREACHABLE_VALUE);
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

function aDriverError(code: string) {
  return Object.assign(new Error(`driver text ${SECRET}`), {
    name: "NeonDbError",
    code,
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

function save(defaults: unknown = DEFAULTS) {
  return newStore().save({
    expectedRevision: "3",
    expectedAvailabilityRevision: "7",
    defaults,
    audit: { session: SESSION, entry: SAVED_ENTRY },
  });
}

async function saveAndCapture(reply: unknown) {
  resetQueryDriver();
  answerQueryWith(reply);
  const result = await save();
  return { result, statement: loneStatement() };
}

const SAVED_ROW = {
  revision: "4",
  availability_revision: "8",
  audited_rows: 1,
  is_session_live: true,
  is_revision_current: true,
};

function refusedRow(isRevisionCurrent: boolean) {
  return {
    revision: null,
    availability_revision: null,
    audited_rows: 0,
    is_session_live: true,
    is_revision_current: isRevisionCurrent,
  };
}

beforeEach(() => {
  mintedIds.count = 0;
  resetQueryDriver();
});
afterEach(resetQueryDriver);

describe("reading the defaults", () => {
  const SAVED_MS = String(Date.parse("2026-11-04T10:00:00.000Z"));

  it("selects the one row, the revision as text and the instant as epoch milliseconds, with no value sent", async () => {
    answerQueryWith([{ revision: "0", defaults: {}, saved_ms: SAVED_MS }]);

    await newStore().read();

    const statement = loneStatement();
    expect(normalised(statement)).toBe(
      "select k.revision::text as revision, k.defaults, floor(extract(epoch from k.saved_at) * 1000)::bigint::text as saved_ms from kitchen_defaults k",
    );
    expect(statement.values).toEqual([]);
  });

  it("reads the seeded row, at revision 0, as none saved whatever it holds", async () => {
    answerQueryWith([{ revision: "0", defaults: {}, saved_ms: SAVED_MS }]);
    expect(await newStore().read()).toBe(NONE_SAVED);

    resetQueryDriver();
    answerQueryWith([
      { revision: "0", defaults: DEFAULTS, saved_ms: SAVED_MS },
    ]);
    expect(await newStore().read()).toBe(NONE_SAVED);
  });

  it("reads a row above revision 0 as saved, including defaults of {}", async () => {
    answerQueryWith([{ revision: "1", defaults: {}, saved_ms: SAVED_MS }]);
    expect(await newStore().read()).toEqual({
      kind: "saved",
      saved: {
        revision: "1",
        defaults: {},
        savedAt: new Date("2026-11-04T10:00:00.000Z"),
      },
    });

    resetQueryDriver();
    answerQueryWith([
      { revision: "12", defaults: DEFAULTS, saved_ms: SAVED_MS },
    ]);
    expect(await newStore().read()).toMatchObject({
      kind: "saved",
      saved: { revision: "12", defaults: DEFAULTS },
    });
  });

  it.each([
    ["no row, which a seeded table never answers", []],
    ["two rows", [{}, {}]],
    [
      "a revision that is not a revision's shape",
      [{ revision: "04", defaults: {}, saved_ms: "1" }],
    ],
    [
      "defaults that are not an object",
      [{ revision: "2", defaults: [], saved_ms: "1" }],
    ],
    [
      "an instant that is not epoch milliseconds",
      [{ revision: "2", defaults: {}, saved_ms: "later" }],
    ],
    ["a reply that is not rows", { revision: "2" }],
  ])("refuses %s as an unexpected answer", async (_name, reply) => {
    answerQueryWith(reply);

    await failureOf(() => newStore().read(), "unexpected-answer");
  });

  it("retries its read after a lost acknowledgement, because the read writes nothing", async () => {
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));
    answerQueryWith([{ revision: "0", defaults: {}, saved_ms: SAVED_MS }]);

    expect(await newStore().read()).toBe(NONE_SAVED);

    expect(queryDriver.statements).toHaveLength(2);
  });
});

describe("a save", () => {
  it("is one statement: the head's compare-and-set, the defaults row and the audit row are branches of a single with", async () => {
    const { result, statement } = await saveAndCapture([SAVED_ROW]);

    const text = normalised(statement);
    expect(result).toEqual({
      kind: "ok",
      revision: "4",
      availabilityRevision: "8",
    });
    expect(text).toMatch(
      /^with actor as \(.*\), moved_head as \( update catalogue_availability_head /,
    );
    expect(text).toContain("), saved as ( update kitchen_defaults ");
    expect(text).toContain("), audited as ( insert into staff_audit_events ");
  });

  it("moves the head only while the head, the session and the defaults revision are all as the saver read them", async () => {
    const { statement } = await saveAndCapture([SAVED_ROW]);

    expect(normalised(statement)).toContain(
      "set revision = revision + 1 where revision = ?::bigint and exists (select 1 from actor) and exists (select 1 from kitchen_defaults k where k.revision = ?::bigint) returning revision",
    );
  });

  it("writes the defaults and the audit row only once the head has moved, each conditional on the one before", async () => {
    const { statement } = await saveAndCapture([SAVED_ROW]);

    const text = normalised(statement);
    expect(text).toContain(
      "from actor a, moved_head h where kitchen_defaults.revision = ?::bigint returning kitchen_defaults.revision",
    );
    expect(text).toContain(
      "insert into staff_audit_events (id, actor_account_id, action, design_id, subject_account_id, detail) select ?::text, a.account_id, ?::text, null, null, ?::jsonb from actor a where exists (select 1 from saved)",
    );
  });

  it("takes the account and the instant from the live session and the clock in the statement, and writes no column the grant omits", async () => {
    const { statement } = await saveAndCapture([SAVED_ROW]);

    const text = normalised(statement);
    expect(text).toContain(
      "set revision = kitchen_defaults.revision + 1, defaults = ?::jsonb, saved_at = now(), saved_by_account_id = a.account_id",
    );
    expect(text).not.toContain("singleton");
    expect(text).not.toContain("insert into kitchen_defaults");
    expect(text).not.toContain("occurred_at");
  });

  it("sends the values in the order the statement reads them, the defaults as compact JSON", async () => {
    const { statement } = await saveAndCapture([SAVED_ROW]);

    expect(statement.values).toEqual([
      SESSION_HASH,
      JSON.stringify(LIFETIMES),
      "7",
      "3",
      JSON.stringify(DEFAULTS),
      "3",
      AUDIT_ID,
      "kitchen-defaults-saved",
      JSON.stringify(SAVED_ENTRY.detail),
      "3",
    ]);
  });

  it("asks of the session what NeonSessionStore.findLive asks, word for word", async () => {
    answerQueryWith([]);
    await new NeonSessionStore(WELL_FORMED_UNREACHABLE_VALUE).findLive({
      tokenHash: SESSION_HASH,
      idleLifetimeSeconds: LIFETIMES,
    });
    const liveness = livenessPredicateOf(loneStatement());
    const { statement } = await saveAndCapture([SAVED_ROW]);

    expect(liveness).toContain("s.revoked_at is null");
    expect(livenessPredicateOf(statement)).toBe(liveness);
  });

  it("takes the actor only from an administrator's session, as the route also requires", async () => {
    const { statement } = await saveAndCapture([SAVED_ROW]);

    expect(normalised(statement)).toContain(
      "interval '1 second') > now() and a.role = 'administrator' ), moved_head as",
    );
  });

  it("answers the defaults refusal for a defaults revision that was not current, and the head's for any other refusal", async () => {
    expect((await saveAndCapture([refusedRow(false)])).result).toBe(
      CHANGED_MEANWHILE,
    );
    expect((await saveAndCapture([refusedRow(true)])).result).toBe(
      AVAILABILITY_CHANGED_MEANWHILE,
    );
  });

  it("answers not-recorded when no live session stood behind it, before it reads any refusal", async () => {
    resetQueryDriver();
    answerQueryWith([{ ...refusedRow(false), is_session_live: false }]);

    await failureOf(() => save(), "not-recorded");
  });

  it.each([
    ["no row", []],
    ["two rows", [SAVED_ROW, SAVED_ROW]],
    ["a revision that is not a revision", [{ ...SAVED_ROW, revision: "x" }]],
    [
      "a head that is not a revision",
      [{ ...SAVED_ROW, availability_revision: null }],
    ],
    ["no audit row", [{ ...SAVED_ROW, audited_rows: 0 }]],
    [
      "a session flag that is not a boolean",
      [{ ...SAVED_ROW, is_session_live: 1 }],
    ],
    [
      "a refusal with no flag for the defaults revision",
      [{ ...refusedRow(true), is_revision_current: null }],
    ],
  ])("refuses %s as an unexpected answer", async (_name, reply) => {
    resetQueryDriver();
    answerQueryWith(reply);

    await failureOf(() => save(), "unexpected-answer");
  });

  it("refuses a request no table could take before it sends anything, and without quoting it", async () => {
    const tooLarge = { handle: "x".repeat(MAX_STORED_DEFAULTS_BYTES) };
    const requests = [
      { expectedRevision: "01" },
      { expectedAvailabilityRevision: "" },
      { defaults: [] },
      { defaults: "defaults" },
      { defaults: tooLarge },
      { defaults: { depth: 1.5 } },
    ];

    for (const overrides of requests) {
      const failure = await failureOf(
        () =>
          newStore().save({
            expectedRevision: "3",
            expectedAvailabilityRevision: "7",
            defaults: DEFAULTS,
            audit: { session: SESSION, entry: SAVED_ENTRY },
            ...overrides,
          }),
        "invalid-request",
      );
      expect(failure.message).not.toContain("xxxx");
    }

    expect(queryDriver.statements).toHaveLength(0);
  });

  it("sends defaults of exactly the bound and refuses one byte more", async () => {
    const overhead = JSON.stringify({ handle: "" }).length;
    const atTheBound = {
      handle: "x".repeat(MAX_STORED_DEFAULTS_BYTES - overhead),
    };
    answerQueryWith([SAVED_ROW]);

    expect((await save(atTheBound)).kind).toBe("ok");

    await failureOf(
      () => save({ handle: `${atTheBound.handle}x` }),
      "invalid-request",
    );
  });

  it("refuses an audit entry that is not a defaults entry, before it sends anything", async () => {
    await failureOf(
      () =>
        newStore().save({
          expectedRevision: "3",
          expectedAvailabilityRevision: "7",
          defaults: DEFAULTS,
          audit: {
            session: SESSION,
            entry: { action: "kitchen-seen", detail: {} },
          } as never,
        }),
      "invalid-request",
    );

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

    const failure = await failureOf(() => save(), "database");

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

    await failureOf(() => save(), expected);
  });
});
