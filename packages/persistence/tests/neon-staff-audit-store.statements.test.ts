import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { StaffAuditEntry } from "@lemnaria/configurator-domain";
import { STAFF_AUDIT_ACTIONS } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NeonStaffAuditStore,
  requireOneAuditRowInserted,
  staffAuditInsertStatement,
  staffAuditStoreErrorFrom,
} from "../src/neon-staff-audit-store.js";
import { NeonSessionStore } from "../src/neon-session-store.js";
import { openApplicationDatabase } from "../src/open-application-database.js";
import {
  MAX_STAFF_AUDIT_IDLE_LIFETIME_SECONDS,
  MAX_STAFF_AUDIT_PAGE,
  STAFF_AUDIT_PAGE_SIZE,
  StaffAuditStoreError,
  prepareStaffAuditRecord,
} from "../src/staff-audit-store.js";
import type {
  StaffAuditPageRequest,
  StaffAuditRecord,
  StaffAuditRecordRefusal,
  StaffAuditStoreFailure,
} from "../src/staff-audit-store.js";
import {
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  failQueryWith,
  queryDriver,
  resetQueryDriver,
  type SentQuery,
} from "./support/mocked-neon-query-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The text of the two statements `NeonStaffAuditStore` sends and of the one it hands to a caller's batch, read as the
 * driver receives them, with no database. What a statement does with a row is the live file's to show
 * (`neon-staff-audit-store.live.test.ts`); this file pins the clauses the security review made conditions: the actor
 * comes from the session in the same statement, the insert has no `on conflict` and never names `occurred_at`, the
 * detail is written from the domain's reading only, the page joins on the left and selects no personal column, and no
 * driver text leaves the store.
 */
const SESSION_HASH = "a".repeat(64);
const DESIGN_ID = "D".repeat(21);
const SUBJECT_ID = "S".repeat(21);
const ACTOR_ID = "A".repeat(21);
const LIFETIMES = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const KITCHEN_OPENED: StaffAuditEntry = {
  action: "kitchen-opened",
  detail: null,
};
const STATUS_CHANGED: StaffAuditEntry = {
  action: "status-changed",
  detail: { from: "new", to: "closed" },
};
const SIX_GRANTED_COLUMNS =
  "id, actor_account_id, action, design_id, subject_account_id, detail";
const WRITTEN_AND_SELECTED_STATEMENTS = 2;

function normalised(statement: SentQuery): string {
  return statement.text.replace(/\s+/g, " ").trim().toLowerCase();
}

function newStore(): NeonStaffAuditStore {
  return new NeonStaffAuditStore(WELL_FORMED_UNREACHABLE_VALUE);
}

function aRecord(overrides: Partial<StaffAuditRecord> = {}): StaffAuditRecord {
  return {
    sessionTokenHash: SESSION_HASH,
    idleLifetimeSeconds: LIFETIMES,
    entry: KITCHEN_OPENED,
    designId: DESIGN_ID,
    subjectAccountId: null,
    ...overrides,
  };
}

function aPageRequest(
  overrides: Partial<StaffAuditPageRequest> = {},
): StaffAuditPageRequest {
  return {
    actorAccountId: null,
    action: null,
    occurredFrom: null,
    occurredBefore: null,
    page: 1,
    ...overrides,
  };
}

function loneStatement(): SentQuery {
  const [statement, ...others] = queryDriver.statements;
  if (
    statement === undefined ||
    others.length > 0 ||
    queryDriver.transactions.length > 0
  ) {
    throw new Error("the call did not send exactly one lone statement");
  }
  return statement;
}

async function sentByRecord(record: StaffAuditRecord): Promise<SentQuery> {
  resetQueryDriver();
  answerQueryWith([{ recorded: 1 }]);
  await newStore().record(record);
  return loneStatement();
}

async function sentByPage(
  request: StaffAuditPageRequest,
  rows: unknown = [{ total: 0, id: null }],
): Promise<SentQuery> {
  resetQueryDriver();
  answerQueryWith(rows);
  await newStore().page(request);
  return loneStatement();
}

async function failureOf(
  call: () => Promise<unknown>,
): Promise<StaffAuditStoreError> {
  const failure = await rejectionOf(call());
  expect(failure).toBeInstanceOf(StaffAuditStoreError);
  return failure as StaffAuditStoreError;
}

/** The part of a statement from its session join to the end of the liveness test. */
function livenessPredicateOf(statementText: string): string {
  const start = statementText.indexOf("from account_sessions s");
  const returning = statementText.indexOf(" returning id");
  return statementText.slice(start, returning === -1 ? undefined : returning);
}

beforeEach(resetQueryDriver);
afterEach(resetQueryDriver);

describe("the audit insert (record)", () => {
  it("is one lone statement and not a transaction", async () => {
    await sentByRecord(aRecord());

    expect(queryDriver.transactions).toHaveLength(0);
    expect(queryDriver.statements).toHaveLength(1);
  });

  it("names exactly the six columns the grant of 0020 gives the application role", async () => {
    const migration = readFileSync(
      join(
        import.meta.dirname,
        "../src/migrations/0020_create_staff_audit_events.sql",
      ),
      "utf8",
    );
    const grantedColumns = /GRANT INSERT \(([^)]+)\)/.exec(migration)?.[1];
    const text = normalised(await sentByRecord(aRecord()));

    expect(grantedColumns?.replace(/\s+/g, " ")).toBe(SIX_GRANTED_COLUMNS);
    expect(text).toContain(
      `insert into staff_audit_events (${SIX_GRANTED_COLUMNS})`,
    );
  });

  it("never names occurred_at, so the database's clock stamps the row", async () => {
    const text = normalised(await sentByRecord(aRecord()));

    expect(text).not.toContain("occurred_at");
  });

  it("has no on conflict clause, so a row that cannot be written is a failure", async () => {
    const text = normalised(await sentByRecord(aRecord()));

    expect(text).not.toContain("on conflict");
  });

  it("takes the actor from the session row in the same statement and from no value it was handed", async () => {
    const statement = await sentByRecord(aRecord());

    expect(normalised(statement)).toContain(
      "select ?::text, s.account_id, ?::text, ?::text, ?::text, ?::jsonb from account_sessions s",
    );
    expect(statement.values).toEqual([
      expect.stringMatching(/^[A-Za-z0-9_-]{21}$/),
      "kitchen-opened",
      DESIGN_ID,
      null,
      null,
      SESSION_HASH,
      JSON.stringify(LIFETIMES),
    ]);
  });

  it("asks of the session what NeonSessionStore.findLive asks, word for word", async () => {
    resetQueryDriver();
    answerQueryWith([]);
    await new NeonSessionStore(WELL_FORMED_UNREACHABLE_VALUE).findLive({
      tokenHash: SESSION_HASH,
      idleLifetimeSeconds: LIFETIMES,
    });
    const liveness = livenessPredicateOf(normalised(loneStatement()));

    const recorded = livenessPredicateOf(
      normalised(await sentByRecord(aRecord())),
    );

    expect(liveness).toContain("s.revoked_at is null");
    expect(recorded).toBe(liveness);
  });

  it("raises, rather than inserting nothing, when the session is not live: the final select divides by the insert's own count", async () => {
    const text = normalised(await sentByRecord(aRecord()));

    expect(text).toContain(
      "select 1 / (select case when count(*) = 1 then 1 else 0 end from inserted) as recorded",
    );
  });

  it.each(STAFF_AUDIT_ACTIONS.filter((action) => action !== "status-changed"))(
    "writes SQL null, not JSON null and not {}, as the detail of %s",
    async (action) => {
      const entry = { action, detail: null } as StaffAuditEntry;

      const { values } = await sentByRecord(aRecord({ entry }));

      expect(values[4]).toBeNull();
    },
  );

  it("writes the status change as the exact text of the domain's reading", async () => {
    const { values } = await sentByRecord(aRecord({ entry: STATUS_CHANGED }));

    expect(values[4]).toBe('{"from":"new","to":"closed"}');
  });

  it("writes what the domain read, not what the request's detail says the second time it is asked", async () => {
    let reads = 0;
    const detail = {
      get from() {
        reads += 1;
        return reads === 1 ? "new" : "closed";
      },
      to: "contacted",
    };
    const entry = {
      action: "status-changed",
      detail,
    } as unknown as StaffAuditEntry;

    const { values } = await sentByRecord(aRecord({ entry }));

    expect(values[4]).toBe('{"from":"new","to":"contacted"}');
  });

  it("writes the action the domain read, not the one the request's entry says the second time it is asked", async () => {
    let reads = 0;
    const entry = {
      get action() {
        reads += 1;
        return reads === 1 ? "kitchen-opened" : "status-changed";
      },
      detail: null,
    } as unknown as StaffAuditEntry;

    const { values } = await sentByRecord(aRecord({ entry }));

    expect(values[1]).toBe("kitchen-opened");
  });

  it("is not retried after a lost acknowledgement: the fail-closed answer is one statement", async () => {
    resetQueryDriver();
    failQueryWith(new SyntaxError("Unexpected end of JSON input"));

    const failure = await failureOf(() => newStore().record(aRecord()));

    expect(failure.failure).toBe("database");
    expect(queryDriver.statements).toHaveLength(1);
  });
});

describe("a record the code refuses before any statement", () => {
  const REFUSED: readonly (readonly [
    string,
    Partial<StaffAuditRecord>,
    StaffAuditRecordRefusal,
  ])[] = [
    ...STAFF_AUDIT_ACTIONS.map(
      (action) =>
        [
          `${action} without a design id`,
          {
            entry:
              action === "status-changed"
                ? STATUS_CHANGED
                : ({ action, detail: null } as StaffAuditEntry),
            designId: null,
          },
          "DESIGN_ID_MISSING",
        ] as const,
    ),
    [
      "a design id of the wrong shape",
      { designId: "short" },
      "DESIGN_ID_NOT_WELL_FORMED",
    ],
    [
      "a subject id of the wrong shape",
      { subjectAccountId: "x".repeat(22) },
      "SUBJECT_ACCOUNT_ID_NOT_WELL_FORMED",
    ],
    [
      "an action the domain does not list",
      {
        entry: {
          action: "preset-hidden",
          detail: null,
        } as unknown as StaffAuditEntry,
      },
      "ENTRY_NOT_RECOGNISED",
    ],
    [
      "a status change without its detail",
      {
        entry: {
          action: "status-changed",
          detail: null,
        } as unknown as StaffAuditEntry,
      },
      "ENTRY_NOT_RECOGNISED",
    ],
    [
      "a detail on an action that has none",
      {
        entry: {
          action: "kitchen-opened",
          detail: {},
        } as unknown as StaffAuditEntry,
      },
      "ENTRY_NOT_RECOGNISED",
    ],
    [
      "a detail with a key beyond from and to",
      {
        entry: {
          action: "status-changed",
          detail: { from: "new", to: "closed", note: "x" },
        } as unknown as StaffAuditEntry,
      },
      "ENTRY_NOT_RECOGNISED",
    ],
    [
      "a session hash that is not SHA-256",
      { sessionTokenHash: "A".repeat(64) },
      "SESSION_NOT_WELL_FORMED",
    ],
    [
      "idle lifetimes missing a role",
      { idleLifetimeSeconds: { client: 1, operator: 1 } as never },
      "SESSION_NOT_WELL_FORMED",
    ],
  ];

  it.each(REFUSED)("refuses %s", async (_label, overrides, refusal) => {
    resetQueryDriver();

    const failure = await failureOf(() =>
      newStore().record(aRecord(overrides)),
    );

    expect([failure.failure, failure.refusal]).toEqual([
      "invalid-record",
      refusal,
    ]);
    expect(queryDriver.statements).toHaveLength(0);
  });

  it("prepares a design id as given and an id of 21 URL-safe characters for the row", () => {
    const prepared = prepareStaffAuditRecord(
      aRecord({ subjectAccountId: SUBJECT_ID }),
    );

    expect(prepared.id).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect([prepared.designId, prepared.subjectAccountId]).toEqual([
      DESIGN_ID,
      SUBJECT_ID,
    ]);
  });
});

describe("the idle lifetimes a record may state", () => {
  const ROLES_STATED = ["client", "operator", "administrator"] as const;

  it.each(ROLES_STATED)(
    "accepts the cap itself for the %s role",
    async (role) => {
      const idleLifetimeSeconds = {
        ...LIFETIMES,
        [role]: MAX_STAFF_AUDIT_IDLE_LIFETIME_SECONDS,
      };

      const { values } = await sentByRecord(aRecord({ idleLifetimeSeconds }));

      expect(values[6]).toBe(JSON.stringify(idleLifetimeSeconds));
    },
  );

  it.each(ROLES_STATED)(
    "refuses a figure above the cap for the %s role before any statement",
    async (role) => {
      resetQueryDriver();
      const idleLifetimeSeconds = {
        ...LIFETIMES,
        [role]: MAX_STAFF_AUDIT_IDLE_LIFETIME_SECONDS + 1,
      };

      const failure = await failureOf(() =>
        newStore().record(aRecord({ idleLifetimeSeconds })),
      );

      expect([failure.failure, failure.refusal]).toEqual([
        "invalid-record",
        "SESSION_NOT_WELL_FORMED",
      ]);
      expect(queryDriver.statements).toHaveLength(0);
    },
  );

  it("refuses a figure no interval can hold", async () => {
    resetQueryDriver();

    const failure = await failureOf(() =>
      newStore().record(
        aRecord({ idleLifetimeSeconds: { ...LIFETIMES, operator: 1e16 } }),
      ),
    );

    expect(failure.refusal).toBe("SESSION_NOT_WELL_FORMED");
  });
});

describe("a prepared record holds what was checked", () => {
  it("reads each member of the request once, so the checked value is the held value", () => {
    const reads: Record<string, number> = {};
    const request = {} as StaffAuditRecord;
    const values: Record<string, unknown> = {
      sessionTokenHash: SESSION_HASH,
      idleLifetimeSeconds: LIFETIMES,
      entry: KITCHEN_OPENED,
      designId: DESIGN_ID,
      subjectAccountId: SUBJECT_ID,
    };
    for (const [name, value] of Object.entries(values)) {
      Object.defineProperty(request, name, {
        enumerable: true,
        get: () => {
          reads[name] = (reads[name] ?? 0) + 1;
          return value;
        },
      });
    }

    prepareStaffAuditRecord(request);

    expect(reads).toEqual({
      sessionTokenHash: 1,
      idleLifetimeSeconds: 1,
      entry: 1,
      designId: 1,
      subjectAccountId: 1,
    });
  });

  it("reads each role's figure once", () => {
    const reads = { client: 0, operator: 0, administrator: 0 };
    const idleLifetimeSeconds = {} as typeof LIFETIMES;
    for (const role of Object.keys(reads) as (keyof typeof reads)[]) {
      Object.defineProperty(idleLifetimeSeconds, role, {
        enumerable: true,
        get: () => {
          reads[role] += 1;
          return LIFETIMES[role];
        },
      });
    }

    prepareStaffAuditRecord(aRecord({ idleLifetimeSeconds }));

    expect(reads).toEqual({ client: 1, operator: 1, administrator: 1 });
  });

  it("is frozen, and its lifetimes are a copy of the caller's object", () => {
    const lifetimes = { ...LIFETIMES };

    const prepared = prepareStaffAuditRecord(
      aRecord({ idleLifetimeSeconds: lifetimes }),
    );
    lifetimes.operator = 1;

    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.idleLifetimeSeconds)).toBe(true);
    expect(prepared.idleLifetimeSeconds).toEqual(LIFETIMES);
  });

  it("refuses lifetimes that cannot be read", () => {
    const hostile = new Proxy(
      {},
      {
        get: () => {
          throw new Error("trap");
        },
      },
    ) as typeof LIFETIMES;

    expect(() =>
      prepareStaffAuditRecord(aRecord({ idleLifetimeSeconds: hostile })),
    ).toThrow(StaffAuditStoreError);
  });
});

describe("the reply to the audit insert", () => {
  it.each([
    ["no row", []],
    ["a count of two", [{ recorded: 2 }]],
    ["two rows", [{ recorded: 1 }, { recorded: 1 }]],
    ["a row of another shape", [{ id: "x" }]],
    ["a reply that is not rows", "ok"],
  ])("is not accepted as a written row: %s", async (_label, reply) => {
    resetQueryDriver();
    answerQueryWith(reply);

    const failure = await failureOf(() => newStore().record(aRecord()));

    expect(failure.failure).toBe("unexpected-answer");
  });

  it("is accepted from a batch as exactly the one row, by the exported check", () => {
    expect(() => {
      requireOneAuditRowInserted([{ recorded: 1 }]);
    }).not.toThrow();
    expect(() => {
      requireOneAuditRowInserted([]);
    }).toThrow(StaffAuditStoreError);
  });
});

describe("the audit insert inside a caller's batch", () => {
  it("is built without running, and travels as a statement of the caller's transaction with the text record sends", async () => {
    const textOfRecord = normalised(await sentByRecord(aRecord()));
    resetQueryDriver();
    const sql = openApplicationDatabase(WELL_FORMED_UNREACHABLE_VALUE);
    const insert = staffAuditInsertStatement(
      sql,
      prepareStaffAuditRecord(aRecord()),
    );
    expect(queryDriver.statements).toHaveLength(0);
    answerQueryWith([{ recorded: 1 }]);

    await sql.transaction([sql`select 1 as first_write`, insert]);

    const [transaction] = queryDriver.transactions;
    expect(transaction?.statements.map(normalised)).toEqual([
      "select 1 as first_write",
      textOfRecord,
    ]);
  });
});

describe("how a failure leaves the store", () => {
  const SQLSTATE_TO_KIND: readonly (readonly [
    string,
    string,
    StaffAuditStoreFailure,
  ])[] = [
    ["42501", "the grant is missing", "unavailable"],
    ["42P01", "the table is missing", "unavailable"],
    [
      "22012",
      "the statement found no live session and divided by zero",
      "not-recorded",
    ],
    ["23505", "a primary-key collision", "database"],
    ["23514", "a check refused the row", "database"],
    ["08006", "the connection failed", "database"],
  ];

  it.each(SQLSTATE_TO_KIND)(
    "reads SQLSTATE %s (%s) on record as %s",
    async (code, _why, kind) => {
      resetQueryDriver();
      failQueryWith(Object.assign(new Error("driver text"), { code }));

      const failure = await failureOf(() => newStore().record(aRecord()));

      expect(failure.failure).toBe(kind);
      expect(failure.cause).toMatchObject({ code });
    },
  );

  it.each(SQLSTATE_TO_KIND.filter(([, , kind]) => kind !== "not-recorded"))(
    "reads SQLSTATE %s (%s) on page as %s",
    async (code, _why, kind) => {
      resetQueryDriver();
      failQueryWith(Object.assign(new Error("driver text"), { code }));

      const failure = await failureOf(() => newStore().page(aPageRequest()));

      expect(failure.failure).toBe(kind);
    },
  );

  it("reads a failure with no SQLSTATE as a database failure", () => {
    expect(
      staffAuditStoreErrorFrom("record a staff audit event", new Error("x"))
        .failure,
    ).toBe("database");
  });

  it("carries the type name, the SQLSTATE and a constraint name, and no word the driver wrote", async () => {
    const SECRET = "KEY-DETAIL-SECRET-4f2a";
    resetQueryDriver();
    failQueryWith(
      Object.assign(new Error(`duplicate key ${SECRET}`), {
        name: "NeonDbError",
        code: "23505",
        constraint: "staff_audit_events_pkey",
        detail: `Key (id)=(${SECRET}) already exists.`,
        hint: SECRET,
        query: `insert ... ${SECRET}`,
      }),
    );

    const failure = await failureOf(() => newStore().record(aRecord()));

    expect(markersFoundOn(failure, [SECRET])).toEqual([]);
    expect(failure.cause).toEqual({
      name: "NeonDbError",
      code: "23505",
      constraint: "staff_audit_events_pkey",
    });
  });

  it("leaves a constraint name off the cause when it is not shaped like an identifier", () => {
    const failure = Object.assign(new Error("x"), {
      code: "23514",
      constraint: 'Key (id)=("secret")',
    });

    const error = staffAuditStoreErrorFrom(
      "record a staff audit event",
      failure,
    );

    expect(error.cause).not.toHaveProperty("constraint");
  });

  it("survives a driver error whose properties throw when read", () => {
    const hostile = new Proxy(new Error("x"), {
      get() {
        throw new Error("trap");
      },
    });

    const error = staffAuditStoreErrorFrom("read the staff audit log", hostile);

    expect(error.failure).toBe("database");
  });
});

describe("the audit page (page)", () => {
  it("is one lone select that writes nothing", async () => {
    const text = normalised(await sentByPage(aPageRequest()));

    expect(text).toMatch(/^with filtered as \( select /);
    expect(text).not.toMatch(/\b(insert|update|delete|truncate)\b/);
    expect(text).not.toContain("on conflict");
  });

  it("joins accounts and designs on the left only, so a missing account or kitchen does not hide the row", async () => {
    const text = normalised(await sentByPage(aPageRequest()));

    const joins = text.match(/\b\w+ join\b/g) ?? [];
    expect(joins.length).toBeGreaterThanOrEqual(5);
    expect(joins.every((join) => join === "left join")).toBe(true);
    for (const target of [
      "left join accounts actor_account on actor_account.id = f.actor_account_id",
      "left join accounts subject_account on subject_account.id = f.subject_account_id",
      "left join designs kitchen on kitchen.id = f.design_id",
      "left join accounts client_account on client_account.id = kitchen.account_id",
    ]) {
      expect(text).toContain(target);
    }
  });

  it("does not resolve a kitchen its client deleted", async () => {
    const text = normalised(await sentByPage(aPageRequest()));

    expect(text).toContain(
      "kitchen.id = f.design_id and kitchen.deleted_by_client_at is null",
    );
  });

  it("reads an address (e-mail) and a name from accounts and a name from designs, and no other personal column", async () => {
    const text = normalised(await sentByPage(aPageRequest()));

    const accountColumns = [
      ...text.matchAll(
        /\b(actor_account|subject_account|client_account)\.(\w+)/g,
      ),
    ].map(([, , column]) => column);
    expect(new Set(accountColumns)).toEqual(new Set(["id", "email", "name"]));
    const kitchenColumns = [...text.matchAll(/\bkitchen\.(\w+)/g)].map(
      ([, column]) => column,
    );
    expect(new Set(kitchenColumns)).toEqual(
      new Set(["id", "name", "account_id", "deleted_by_client_at"]),
    );
    for (const forbidden of [
      "address",
      "phone",
      "password",
      "email_normal_form",
      "document",
      "token",
      "visitor",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("orders newest first by occurred_at and id, in the page and in the result", async () => {
    const text = normalised(await sentByPage(aPageRequest()));

    expect(text).toContain("order by f.occurred_at desc, f.id desc limit");
    expect(
      text.endsWith("order by p.occurred_at desc nulls last, p.id desc"),
    ).toBe(true);
  });

  it("passes the filters as values and nothing as text", async () => {
    const occurredFrom = new Date("2026-03-28T22:00:00.000Z");
    const occurredBefore = new Date("2026-03-29T21:00:00.000Z");

    const { values } = await sentByPage(
      aPageRequest({
        actorAccountId: ACTOR_ID,
        action: "note-added",
        occurredFrom,
        occurredBefore,
        page: 3,
      }),
    );

    expect(values).toEqual([
      ACTOR_ID,
      ACTOR_ID,
      "note-added",
      "note-added",
      "2026-03-28T22:00:00.000Z",
      "2026-03-28T22:00:00.000Z",
      "2026-03-29T21:00:00.000Z",
      "2026-03-29T21:00:00.000Z",
      STAFF_AUDIT_PAGE_SIZE,
      2 * STAFF_AUDIT_PAGE_SIZE,
    ]);
  });

  it("passes no filter as null, so the predicates stand aside", async () => {
    const { values } = await sentByPage(aPageRequest());

    expect(values.slice(0, 8)).toEqual(Array<null>(8).fill(null));
    expect(values.slice(8)).toEqual([STAFF_AUDIT_PAGE_SIZE, 0]);
  });

  it("half-opens the time window: from included, before excluded", async () => {
    const text = normalised(await sentByPage(aPageRequest()));

    expect(text).toContain("e.occurred_at >= ?::timestamptz");
    expect(text).toContain("e.occurred_at < ?::timestamptz");
  });

  it.each([
    ["a page of 0", { page: 0 }],
    ["a fractional page", { page: 1.5 }],
    ["a page beyond the bound", { page: MAX_STAFF_AUDIT_PAGE + 1 }],
    ["an actor of the wrong shape", { actorAccountId: "nobody" }],
    ["an action outside the table's shape", { action: "Kitchen Opened" }],
    ["a bound that is not a date", { occurredFrom: new Date(Number.NaN) }],
    [
      "a lower bound before year 1",
      { occurredFrom: new Date("0000-01-01T00:00:00.000Z") },
    ],
    [
      "an upper bound in year 10000",
      { occurredBefore: new Date("+010000-01-01T00:00:00.000Z") },
    ],
    ["the largest instant a Date holds", { occurredBefore: new Date(8.64e15) }],
    ["the smallest instant a Date holds", { occurredFrom: new Date(-8.64e15) }],
  ] satisfies readonly (readonly [string, Partial<StaffAuditPageRequest>])[])(
    "refuses %s before any statement",
    async (_label, overrides) => {
      resetQueryDriver();

      const failure = await failureOf(() =>
        newStore().page(aPageRequest(overrides)),
      );

      expect(failure.failure).toBe("invalid-record");
      expect(queryDriver.statements).toHaveLength(0);
    },
  );
});

describe("the rows the page reads", () => {
  const AT_MS = Date.parse("2026-10-21T09:30:15.123Z");
  const EVENT_ID = "E".repeat(21);

  function eventRow(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      total: 1,
      id: EVENT_ID,
      occurred_ms: String(AT_MS),
      action: "kitchen-opened",
      detail: null,
      actor_account_id: ACTOR_ID,
      actor_email: "staff@example.com",
      actor_name: "Ana",
      subject_account_id: null,
      subject_email: null,
      subject_name: null,
      design_id: DESIGN_ID,
      design_name: "Casa",
      client_account_id: SUBJECT_ID,
      client_email: "client@example.com",
      client_name: null,
      ...overrides,
    };
  }

  async function pageOf(rows: unknown) {
    resetQueryDriver();
    answerQueryWith(rows);
    return newStore().page(aPageRequest({ page: 2 }));
  }

  it("reads the total, the page number and the people and kitchen a row names", async () => {
    const page = await pageOf([eventRow({ total: 61 })]);

    expect(page).toEqual({
      total: 61,
      page: 2,
      pageSize: STAFF_AUDIT_PAGE_SIZE,
      events: [
        {
          id: EVENT_ID,
          occurredAt: new Date(AT_MS),
          actor: { id: ACTOR_ID, email: "staff@example.com", name: "Ana" },
          subject: null,
          design: {
            id: DESIGN_ID,
            name: "Casa",
            client: { id: SUBJECT_ID, email: "client@example.com", name: null },
          },
          reading: { kind: "recognised", entry: KITCHEN_OPENED },
        },
      ],
    });
  });

  it.each([
    ["one millisecond before 1970", "-1", -1],
    ["the earliest instant a Date holds", "-8640000000000000", -8.64e15],
    ["the latest instant a Date holds", "8640000000000000", 8.64e15],
  ])("reads a stamp of %s", async (_label, text, milliseconds) => {
    const page = await pageOf([eventRow({ occurred_ms: text })]);

    expect(page.events[0]?.occurredAt.getTime()).toBe(milliseconds);
  });

  it("reads a stamp of infinity or -infinity as the latest or earliest instant, in the statement", async () => {
    const text = normalised(await sentByPage(aPageRequest()));

    expect(text).toContain(
      "when f.occurred_at = 'infinity'::timestamptz then '8640000000000000'",
    );
    expect(text).toContain(
      "when f.occurred_at = '-infinity'::timestamptz then '-8640000000000000'",
    );
  });

  it.each([
    [
      "the first instant of year 1",
      { occurredFrom: new Date("0001-01-01T00:00:00.000Z") },
    ],
    [
      "the last millisecond of year 9999",
      { occurredBefore: new Date("9999-12-31T23:59:59.999Z") },
    ],
  ])("sends %s as a bound", async (_label, overrides) => {
    const { values } = await sentByPage(aPageRequest(overrides));

    expect(values.slice(0, 8).filter((value) => value !== null)).toHaveLength(
      2,
    );
  });

  it("reports the total of an empty page and no events", async () => {
    const page = await pageOf([{ total: 61, id: null }]);

    expect([page.total, page.events]).toEqual([61, []]);
  });

  it("keeps a row whose actor, subject and kitchen no longer resolve, with nulls", async () => {
    const page = await pageOf([
      eventRow({
        actor_email: null,
        actor_name: null,
        subject_account_id: SUBJECT_ID,
        subject_email: null,
        subject_name: null,
        design_name: null,
        client_account_id: null,
        client_email: null,
        client_name: null,
      }),
    ]);

    expect(page.events[0]).toMatchObject({
      actor: { id: ACTOR_ID, email: null, name: null },
      subject: { id: SUBJECT_ID, email: null, name: null },
      design: { id: DESIGN_ID, name: null, client: null },
    });
  });

  it("returns a deferred action and a forged row as unrecognised, counted, with the action only", async () => {
    const FORGED = "FORGED-DETAIL-MARKER-91c";
    const rows = [
      eventRow({ total: 4, id: "1".repeat(21), action: "preset-hidden" }),
      eventRow({
        total: 4,
        id: "2".repeat(21),
        action: "staff-invited",
        detail: { role: FORGED },
      }),
      eventRow({
        total: 4,
        id: "3".repeat(21),
        action: "kitchen-opened",
        detail: { x: FORGED },
      }),
      eventRow({
        total: 4,
        id: "4".repeat(21),
        action: "status-changed",
        detail: { from: "new", to: FORGED },
      }),
    ];

    const page = await pageOf(rows);

    expect(page.total).toBe(4);
    expect(page.events.map(({ reading }) => reading)).toEqual([
      { kind: "unrecognised", action: "preset-hidden" },
      { kind: "unrecognised", action: "staff-invited" },
      { kind: "unrecognised", action: "kitchen-opened" },
      { kind: "unrecognised", action: "status-changed" },
    ]);
    expect(JSON.stringify(page)).not.toContain(FORGED);
  });

  it("reads a status change with its two codes", async () => {
    const page = await pageOf([
      eventRow({
        action: "status-changed",
        detail: { from: "new", to: "contacted" },
      }),
    ]);

    expect(page.events[0]?.reading).toEqual({
      kind: "recognised",
      entry: {
        action: "status-changed",
        detail: { from: "new", to: "contacted" },
      },
    });
  });

  it.each([
    ["no row at all", []],
    ["a reply that is not rows", "ok"],
    ["a total that is not a count", [eventRow({ total: "61" })]],
    ["a stamp with two minus signs", [eventRow({ occurred_ms: "--1" })]],
    ["a stamp that is only a minus sign", [eventRow({ occurred_ms: "-" })]],
    ["a stamp with a plus sign", [eventRow({ occurred_ms: "+1" })]],
    ["an empty stamp", [eventRow({ occurred_ms: "" })]],
    ["a stamp with whitespace", [eventRow({ occurred_ms: " 1" })]],
    ["a null stamp", [eventRow({ occurred_ms: null })]],
    [
      "a millisecond stamp that is not digits",
      [eventRow({ occurred_ms: "yesterday" })],
    ],
    ["an e-mail that is not text", [eventRow({ actor_email: 7 })]],
    [
      "an action outside the table's shape",
      [eventRow({ action: "Kitchen Opened" })],
    ],
    [
      "an empty-page row beside event rows",
      [eventRow(), { total: 1, id: null }],
    ],
    [
      "more rows than a page",
      Array.from({ length: STAFF_AUDIT_PAGE_SIZE + 1 }, (_, position) =>
        eventRow({ id: String(position).padStart(21, "0") }),
      ),
    ],
  ])("is not read as a page: %s", async (_label, rows) => {
    const failure = await failureOf(() => pageOf(rows));

    expect(failure.failure).toBe("unexpected-answer");
  });
});

describe("the statements in the source", () => {
  it("are two: the insert and the page select, so a new statement fails this file until it is read", () => {
    const source = readFileSync(
      join(import.meta.dirname, "../src/neon-staff-audit-store.ts"),
      "utf8",
    );

    const templates = source.match(/\bsql`\n/g) ?? [];

    expect(templates).toHaveLength(WRITTEN_AND_SELECTED_STATEMENTS);
  });
});
