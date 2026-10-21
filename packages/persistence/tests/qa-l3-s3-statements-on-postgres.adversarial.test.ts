import { randomBytes } from "node:crypto";

import { fc } from "@fast-check/vitest";
import { Client } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  NeonStaffAuditStore,
  staffAuditInsertStatement,
  staffAuditStoreErrorFrom,
} from "../src/neon-staff-audit-store.js";
import { NeonSessionStore } from "../src/neon-session-store.js";
import { openDatabaseSession } from "../src/open-database.js";
import {
  STAFF_AUDIT_PAGE_SIZE,
  prepareStaffAuditRecord,
} from "../src/staff-audit-store.js";
import type {
  PreparedStaffAuditRecord,
  StaffAuditPageRequest,
} from "../src/staff-audit-store.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { rejectionOf } from "./support/rejection-of.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: every write below happens inside a transaction that is rolled back, so the file needs the schema intact and
// leaves nothing behind.
holdSharedTestSchemaLock();

/**
 * Adversarial QA of the staff audit store, against the statements the store really sends, on a real
 * Postgres.
 *
 * **How the production SQL runs here.** Both Neon stores take their `sql` from the driver's tagged template. This file
 * swaps in a tag of its own that sends the very same text and parameters over a WebSocket session on which a
 * transaction is open (`begin` ... `rollback`), so the statements the store sends are the ones tested, `now()` is one
 * fixed instant inside the transaction (which makes an exact boundary exact), and nothing a test writes survives.
 * A statement that fails aborts the transaction, so each attempt runs inside a savepoint.
 *
 * **Mutation proof.** The assertions in this file were each shown to fail against a copy of the store with one
 * change (an inequality flipped, a condition dropped, the role of the lifetime lookup replaced); the record of those
 * runs is in the commit message.
 */
const SUITE_NAME =
  "staff audit store statements on a real Postgres (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const DIVISION_BY_ZERO = "22012";
const CHECK_VIOLATION = "23514";
const INTERVAL_OUT_OF_RANGE = "22008";
const UNDEFINED_TABLE = "42P01";
const INSUFFICIENT_PRIVILEGE = "42501";

type Row = Record<string, unknown>;
type Role = "client" | "operator" | "administrator";

/** One figure per role, all different, so a statement that reads the wrong role's figure disagrees at a boundary. */
const IDLE_LIFETIMES: Readonly<Record<Role, number>> = {
  client: 1_000,
  operator: 500,
  administrator: 250,
};
const ROLES: readonly Role[] = ["client", "operator", "administrator"];

let client: Client;

/** The driver's tagged template, over the open transaction: the text the store builds and the parameters it binds. */
function tagOverTransaction(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Row[]> {
  const text = strings.reduce(
    (built, part, index) =>
      built + part + (index < values.length ? `$${String(index + 1)}` : ""),
    "",
  );
  return client
    .query(text, values as never[])
    .then((reply) => reply.rows as Row[]);
}

type ApplicationSql = Parameters<typeof staffAuditInsertStatement>[0];
const SQL_OVER_TRANSACTION = tagOverTransaction as unknown as ApplicationSql;

function auditStoreOverTransaction(): NeonStaffAuditStore {
  const store = new NeonStaffAuditStore(liveTestDatabaseUrl);
  Object.assign(store, { sql: tagOverTransaction });
  return store;
}

function sessionStoreOverTransaction(): NeonSessionStore {
  const store = new NeonSessionStore(liveTestDatabaseUrl);
  Object.assign(store, { sql: tagOverTransaction });
  return store;
}

async function run(text: string, values: readonly unknown[] = []) {
  const reply = await client.query(text, [...values] as never[]);
  return reply.rows as Row[];
}

async function insertAccount(spec: {
  readonly role: Role;
  readonly passwordChangedSecondsFromNow?: number;
  readonly isVerified?: boolean;
}): Promise<string> {
  const accountId = nanoid();
  const email = `qa-l3-s3-${accountId.toLowerCase()}@example.invalid`;
  await run(
    `insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version,
       password_changed_at, email_verified_at)
     values ($1, $2, $2, $3, $4, 'ro', '1', now() + $5 * interval '1 second',
       case when $6::boolean then now() end)`,
    [
      accountId,
      email,
      PASSWORD_HASH,
      spec.role,
      spec.passwordChangedSecondsFromNow ?? 0,
      spec.isVerified ?? true,
    ],
  );
  return accountId;
}

interface SessionSpec {
  readonly accountId: string;
  readonly absoluteExpiresInSeconds?: number;
  readonly lastSeenSecondsAgo?: number;
  readonly isRevoked?: boolean;
}

/** `created_at` is the transaction's `now()`, the same instant `password_changed_at` defaults to. */
async function insertSession(spec: SessionSpec): Promise<string> {
  const tokenHash = randomBytes(32).toString("hex");
  await run(
    `insert into account_sessions (token_hash, account_id, absolute_expires_at, last_seen_at, revoked_at)
     values ($1, $2, now() + $3 * interval '1 second', now() - $4 * interval '1 second',
       case when $5::boolean then now() end)`,
    [
      tokenHash,
      spec.accountId,
      spec.absoluteExpiresInSeconds ?? 86_400,
      spec.lastSeenSecondsAgo ?? 0,
      spec.isRevoked ?? false,
    ],
  );
  return tokenHash;
}

function preparedFor(
  tokenHash: string,
  overrides: Partial<PreparedStaffAuditRecord> = {},
): PreparedStaffAuditRecord {
  return {
    ...prepareStaffAuditRecord({
      sessionTokenHash: tokenHash,
      idleLifetimeSeconds: IDLE_LIFETIMES,
      entry: { action: "kitchen-opened", detail: null },
      designId: nanoid(),
      subjectAccountId: null,
    }),
    ...overrides,
  };
}

/** A row an injected statement would destroy; its survival shows the values were not run as SQL. */
async function plantCanary(actorAccountId: string): Promise<string> {
  const id = nanoid();
  await run(
    `insert into staff_audit_events (id, actor_account_id, action) values ($1, $2, 'kitchen-opened')`,
    [id, actorAccountId],
  );
  return id;
}

async function isRowAlive(id: string): Promise<boolean> {
  const rows = await run("select 1 from staff_audit_events where id = $1", [
    id,
  ]);
  return rows.length === 1;
}

type Attempt =
  | { readonly kind: "written"; readonly actorAccountId: string }
  | { readonly kind: "refused"; readonly sqlState: string | undefined };

/** Runs the audit statement inside a savepoint and reports what it did; the transaction stays usable. */
async function attemptAudit(
  prepared: PreparedStaffAuditRecord,
): Promise<Attempt> {
  await run("savepoint attempt");
  try {
    await staffAuditInsertStatement(SQL_OVER_TRANSACTION, prepared);
    const [stored] = await run(
      "select actor_account_id from staff_audit_events where id = $1",
      [prepared.id],
    );
    return {
      kind: "written",
      actorAccountId: stored?.["actor_account_id"] as string,
    };
  } catch (failure) {
    await run("rollback to savepoint attempt");
    return { kind: "refused", sqlState: (failure as { code?: string }).code };
  }
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  beforeAll(async () => {
    client = openDatabaseSession(liveTestDatabaseUrl, "TEST_DATABASE_URL");
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  describe("the session test of the audit insert, boundary by boundary", () => {
    /**
     * One fault at a time, each at the instant before, at and after the boundary. A statement that joined its
     * conditions with `or`, or flipped any one inequality, or read another role's figure, disagrees with the oracle on
     * exactly one row.
     */
    interface Case {
      readonly label: string;
      readonly role: Role;
      readonly passwordChangedSecondsFromNow: number;
      readonly absoluteExpiresInSeconds: number;
      readonly lastSeenSecondsAgo: number;
      readonly isRevoked: boolean;
    }

    function casesFor(role: Role): Case[] {
      const idle = IDLE_LIFETIMES[role];
      const good = {
        role,
        passwordChangedSecondsFromNow: 0,
        absoluteExpiresInSeconds: 3_600,
        lastSeenSecondsAgo: 0,
        isRevoked: false,
      };
      return [
        { ...good, label: `${role}: nothing wrong` },
        ...[-1, 0, 1].map((seconds) => ({
          ...good,
          absoluteExpiresInSeconds: seconds,
          label: `${role}: absolute expiry ${String(seconds)} s from now`,
        })),
        ...[idle - 1, idle, idle + 1].map((ago) => ({
          ...good,
          lastSeenSecondsAgo: ago,
          label: `${role}: last seen ${String(ago)} s ago (idle lifetime ${String(idle)} s)`,
        })),
        ...[-1, 0, 1].map((seconds) => ({
          ...good,
          passwordChangedSecondsFromNow: seconds,
          label: `${role}: password changed ${String(seconds)} s from the session's creation`,
        })),
        { ...good, isRevoked: true, label: `${role}: revoked this instant` },
        {
          ...good,
          absoluteExpiresInSeconds: -1,
          lastSeenSecondsAgo: idle + 1,
          passwordChangedSecondsFromNow: 1,
          isRevoked: true,
          label: `${role}: every condition failed at once`,
        },
      ];
    }

    function isLiveByTheRules(spec: Case): boolean {
      return (
        !spec.isRevoked &&
        spec.absoluteExpiresInSeconds > 0 &&
        spec.passwordChangedSecondsFromNow <= 0 &&
        spec.lastSeenSecondsAgo < IDLE_LIFETIMES[spec.role]
      );
    }

    it("writes a row for exactly the sessions that are live by the rules, and agrees with NeonSessionStore.findLive on every one", async () => {
      const disagreements: string[] = [];
      for (const spec of ROLES.flatMap(casesFor)) {
        const accountId = await insertAccount(spec);
        const tokenHash = await insertSession({ accountId, ...spec });

        const attempt = await attemptAudit(preparedFor(tokenHash));
        const lookup = await sessionStoreOverTransaction().findLive({
          tokenHash,
          idleLifetimeSeconds: IDLE_LIFETIMES,
        });

        const expected = isLiveByTheRules(spec);
        const wrote = attempt.kind === "written";
        if (wrote !== expected) {
          disagreements.push(`${spec.label}: audit wrote=${String(wrote)}`);
        }
        if (wrote && attempt.actorAccountId !== accountId) {
          disagreements.push(`${spec.label}: actor was another account`);
        }
        if (!wrote && attempt.sqlState !== DIVISION_BY_ZERO) {
          disagreements.push(
            `${spec.label}: refused with ${String(attempt.sqlState)}`,
          );
        }
        if ((lookup.kind === "live") !== expected) {
          disagreements.push(`${spec.label}: findLive=${lookup.kind}`);
        }
      }

      expect(disagreements).toEqual([]);
    }, 120_000);

    it("does not let a figure named for another role keep an idle-expired session live", async () => {
      const accountId = await insertAccount({ role: "operator" });
      const tokenHash = await insertSession({
        accountId,
        lastSeenSecondsAgo: 5_000,
      });
      const generousForTheOthers = {
        client: 1e9,
        operator: 10,
        administrator: 1e9,
      };

      const attempt = await attemptAudit(
        preparedFor(tokenHash, { idleLifetimeSeconds: generousForTheOthers }),
      );

      expect(attempt).toEqual({ kind: "refused", sqlState: DIVISION_BY_ZERO });
    });

    it("keeps live a session whose own role's figure is stretched by the caller: the statement neither bounds nor derives the figure", async () => {
      const accountId = await insertAccount({ role: "operator" });
      const tokenHash = await insertSession({
        accountId,
        lastSeenSecondsAgo: 5_000,
      });

      const attempt = await attemptAudit(
        preparedFor(tokenHash, {
          idleLifetimeSeconds: { ...IDLE_LIFETIMES, operator: 1e9 },
        }),
      );

      expect(attempt).toEqual({ kind: "written", actorAccountId: accountId });
    });

    it("fails closed with an interval overflow, and writes nothing, for a figure no interval can hold", async () => {
      const accountId = await insertAccount({ role: "operator" });
      const tokenHash = await insertSession({ accountId });

      const attempt = await attemptAudit(
        preparedFor(tokenHash, {
          idleLifetimeSeconds: { ...IDLE_LIFETIMES, operator: 1e16 },
        }),
      );

      expect(attempt).toEqual({
        kind: "refused",
        sqlState: INTERVAL_OUT_OF_RANGE,
      });
      expect(
        staffAuditStoreErrorFrom("record a staff audit event", {
          code: INTERVAL_OUT_OF_RANGE,
        }).failure,
      ).toBe("database");
    });

    it("does not look at the e-mail verification: an unverified account's live session writes a row", async () => {
      const accountId = await insertAccount({
        role: "operator",
        isVerified: false,
      });
      const tokenHash = await insertSession({ accountId });

      const attempt = await attemptAudit(preparedFor(tokenHash));

      expect(attempt).toEqual({ kind: "written", actorAccountId: accountId });
    });

    it("does not look at the role: a live CLIENT session writes a staff audit row (the route's capability check is the only gate)", async () => {
      const accountId = await insertAccount({ role: "client" });
      const tokenHash = await insertSession({ accountId });

      const attempt = await attemptAudit(preparedFor(tokenHash));

      expect(attempt).toEqual({ kind: "written", actorAccountId: accountId });
    });

    it("writes nothing once the account is deleted, because its sessions go with it", async () => {
      const accountId = await insertAccount({ role: "operator" });
      const tokenHash = await insertSession({ accountId });
      await run("delete from accounts where id = $1", [accountId]);

      const attempt = await attemptAudit(preparedFor(tokenHash));

      expect(attempt).toEqual({ kind: "refused", sqlState: DIVISION_BY_ZERO });
    });

    it("takes the actor from the session of the hash given, never from another account's", async () => {
      const first = await insertAccount({ role: "operator" });
      const second = await insertAccount({ role: "operator" });
      await insertSession({ accountId: first });
      const secondsHash = await insertSession({ accountId: second });

      const attempt = await attemptAudit(preparedFor(secondsHash));

      expect(attempt).toEqual({ kind: "written", actorAccountId: second });
    });
  });

  describe("values travel as data, never as SQL (bypassing the code's own refusals)", () => {
    const HOSTILE = "x'); delete from staff_audit_events; --";

    it.each([
      ["the session hash", { sessionTokenHash: HOSTILE }, DIVISION_BY_ZERO],
      [
        "the action",
        {
          entry: { action: HOSTILE, detail: null },
        } as unknown as Partial<PreparedStaffAuditRecord>,
        CHECK_VIOLATION,
      ],
      ["the design id", { designId: HOSTILE }, CHECK_VIOLATION],
      [
        "the subject account id",
        { subjectAccountId: HOSTILE },
        CHECK_VIOLATION,
      ],
    ] satisfies readonly (readonly [
      string,
      Partial<PreparedStaffAuditRecord>,
      string,
    ])[])(
      "meets %s as a value: a refused value, not a syntax error, and the log is untouched",
      async (_label, overrides, sqlState) => {
        const accountId = await insertAccount({ role: "operator" });
        const tokenHash = await insertSession({ accountId });
        const canaryId = await plantCanary(accountId);

        const attempt = await attemptAudit(preparedFor(tokenHash, overrides));

        expect(attempt).toEqual({ kind: "refused", sqlState });
        expect(await isRowAlive(canaryId)).toBe(true);
      },
    );

    it("stores a detail that is made of SQL as the JSON text it is", async () => {
      const accountId = await insertAccount({ role: "operator" });
      const tokenHash = await insertSession({ accountId });
      const prepared = preparedFor(tokenHash, {
        entry: {
          action: "status-changed",
          detail: { from: HOSTILE, to: HOSTILE },
        } as unknown as PreparedStaffAuditRecord["entry"],
      });

      const attempt = await attemptAudit(prepared);

      expect(attempt).toEqual({ kind: "written", actorAccountId: accountId });
      const [stored] = await run(
        "select detail ->> 'from' as from_text from staff_audit_events where id = $1",
        [prepared.id],
      );
      expect(stored).toEqual({ from_text: HOSTILE });
    });

    it.each([
      ["an actor id", { actorAccountId: "' or '1'='1" }],
      ["an actor id that closes the statement", { actorAccountId: HOSTILE }],
      ["an action", { action: "' or 1=1 --" }],
      ["an action that drops the table", { action: HOSTILE }],
      ["the dash-only action the shape allows", { action: "--" }],
      [
        "the hyphen-only actor the shape allows",
        { actorAccountId: "-".repeat(21) },
      ],
    ] satisfies readonly (readonly [string, Partial<StaffAuditPageRequest>])[])(
      "reads %s in a page request as a value that matches no row, not as a tautology",
      async (_label, overrides) => {
        const actorId = await insertAccount({ role: "operator" });
        const canaryId = await plantCanary(actorId);

        const page = await (
          auditStoreOverTransaction() as unknown as {
            pageRows(request: StaffAuditPageRequest): Promise<Row[]>;
          }
        ).pageRows({
          actorAccountId: null,
          action: null,
          occurredFrom: null,
          occurredBefore: null,
          page: 1,
          ...overrides,
        });

        expect(page.map((row) => row["total"])).toEqual([0]);
        expect(await isRowAlive(canaryId)).toBe(true);
      },
    );
  });

  describe("the page, swept over generated logs", () => {
    /** Microseconds from `BASE`; few distinct values and few distinct ids, so ties and boundaries are the rule. */
    const BASE_SQL = "timestamptz '2026-10-01 09:00:00+00'";
    const BASE_MS = Date.parse("2026-10-01T09:00:00.000Z");
    const MICROSECOND_OFFSETS = [0, 1, 999, 1_000, 1_001, 2_000, 60_000_000];
    const WINDOW_MILLISECONDS = [-1, 0, 1, 2, 3, 60_000, 60_001];

    interface PlantedRow {
      readonly id: string;
      readonly offsetMicroseconds: number;
    }

    const ID_ALPHABET = ["a", "A", "_", "-", "0", "9", "z", "Z"] as const;
    const idArbitrary = fc.string({
      unit: fc.constantFrom(...ID_ALPHABET),
      minLength: 21,
      maxLength: 21,
    });
    const rowsArbitrary = fc.uniqueArray(
      fc.record({
        id: idArbitrary,
        offsetMicroseconds: fc.constantFrom(...MICROSECOND_OFFSETS),
      }),
      { selector: (row) => row.id, minLength: 0, maxLength: 70 },
    );
    const boundArbitrary = fc.option(fc.constantFrom(...WINDOW_MILLISECONDS), {
      nil: null,
    });

    async function plant(
      actorAccountId: string,
      rows: readonly PlantedRow[],
    ): Promise<void> {
      await run(
        `insert into staff_audit_events (id, occurred_at, actor_account_id, action)
         select r.id, ${BASE_SQL} + r.microseconds::bigint * interval '1 microsecond', $1, 'kitchen-opened'
         from unnest($2::text[], $3::text[]) as r(id, microseconds)`,
        [
          actorAccountId,
          rows.map((row) => row.id),
          rows.map((row) => String(row.offsetMicroseconds)),
        ],
      );
    }

    function dateAt(milliseconds: number | null): Date | null {
      return milliseconds === null ? null : new Date(BASE_MS + milliseconds);
    }

    function oracle(
      rows: readonly PlantedRow[],
      from: Date | null,
      before: Date | null,
    ): PlantedRow[] {
      const microsecondsOf = (date: Date) => (date.getTime() - BASE_MS) * 1_000;
      return rows
        .filter(
          (row) =>
            (from === null || row.offsetMicroseconds >= microsecondsOf(from)) &&
            (before === null ||
              row.offsetMicroseconds < microsecondsOf(before)),
        )
        .sort(
          (left, right) =>
            right.offsetMicroseconds - left.offsetMicroseconds ||
            (left.id < right.id ? 1 : left.id > right.id ? -1 : 0),
        );
    }

    async function everyPage(
      request: Omit<StaffAuditPageRequest, "page">,
      pageCount: number,
    ) {
      const store = auditStoreOverTransaction();
      const pages = [];
      for (let page = 1; page <= pageCount; page += 1) {
        pages.push(await store.page({ ...request, page }));
      }
      return pages;
    }

    it("pages a log with ties exactly as (occurred_at desc, id desc) says: no row twice, none skipped, the total on every page, millisecond display", async () => {
      await fc.assert(
        fc.asyncProperty(
          rowsArbitrary,
          boundArbitrary,
          boundArbitrary,
          async (rows, fromMs, beforeMs) => {
            await run("savepoint sweep");
            const actorAccountId = nanoid();
            await plant(actorAccountId, rows);
            const from = dateAt(fromMs);
            const before = dateAt(beforeMs);
            const expected = oracle(rows, from, before);
            const pageCount =
              Math.ceil(expected.length / STAFF_AUDIT_PAGE_SIZE) + 1;

            const pages = await everyPage(
              {
                actorAccountId,
                action: null,
                occurredFrom: from,
                occurredBefore: before,
              },
              pageCount,
            );
            await run("rollback to savepoint sweep");

            expect(pages.map((page) => page.total)).toEqual(
              pages.map(() => expected.length),
            );
            expect(pages.at(-1)?.events).toEqual([]);
            expect(
              pages.every(
                (page) => page.events.length <= STAFF_AUDIT_PAGE_SIZE,
              ),
            ).toBe(true);
            const listed = pages.flatMap((page) => page.events);
            expect(listed.map((event) => event.id)).toEqual(
              expected.map((row) => row.id),
            );
            expect(listed.map((event) => event.occurredAt.getTime())).toEqual(
              expected.map(
                (row) => BASE_MS + Math.floor(row.offsetMicroseconds / 1_000),
              ),
            );
          },
        ),
        { numRuns: 25 },
      );
    }, 120_000);

    it("counts and pages 60 rows of one instant by id alone", async () => {
      const actorAccountId = nanoid();
      const rows = Array.from({ length: 60 }, (_, index) => ({
        id: `${String.fromCharCode(97 + (index % 26))}${nanoid(20)}`,
        offsetMicroseconds: 0,
      }));
      await plant(actorAccountId, rows);

      const pages = await everyPage(
        {
          actorAccountId,
          action: null,
          occurredFrom: null,
          occurredBefore: null,
        },
        3,
      );

      expect(pages.map((page) => page.events.length)).toEqual([25, 25, 10]);
      const listed = pages.flatMap((page) => page.events.map(({ id }) => id));
      expect(listed).toEqual(
        rows
          .map(({ id }) => id)
          .sort()
          .reverse(),
      );
    });

    it("keeps the window half-open at the microsecond: the instant a window starts at is in, the one before is out, and the end is out", async () => {
      const actorAccountId = nanoid();
      const rows = [
        { id: nanoid(), offsetMicroseconds: 999 },
        { id: nanoid(), offsetMicroseconds: 1_000 },
        { id: nanoid(), offsetMicroseconds: 1_999 },
        { id: nanoid(), offsetMicroseconds: 2_000 },
      ];
      await plant(actorAccountId, rows);

      const [page] = await everyPage(
        {
          actorAccountId,
          action: null,
          occurredFrom: dateAt(1),
          occurredBefore: dateAt(2),
        },
        1,
      );

      expect(page?.events.map(({ id }) => id).sort()).toEqual(
        [rows[1]?.id, rows[2]?.id].sort(),
      );
      expect(page?.total).toBe(2);
    });
  });

  describe("a failure the database raises, read as the store reads it", () => {
    async function failureOfPageUnder(setting: string) {
      await run("savepoint failing");
      await run(setting);
      try {
        await auditStoreOverTransaction().page({
          actorAccountId: null,
          action: null,
          occurredFrom: null,
          occurredBefore: null,
          page: 1,
        });
        throw new Error("the page was expected to fail");
      } finally {
        await run("rollback to savepoint failing");
      }
    }

    it("reads a real 42P01 from the page statement as unavailable, and carries no more than the type name and SQLSTATE", async () => {
      const failure = await failureOfPageUnder(
        "set local search_path to pg_catalog",
      ).catch((error: unknown) => error);

      expect(failure).toMatchObject({
        failure: "unavailable",
        cause: { code: UNDEFINED_TABLE },
      });
      expect(Object.keys((failure as { cause: object }).cause).sort()).toEqual([
        "code",
        "name",
      ]);
    });

    it("reads a real 42P01 from the audit insert as unavailable", async () => {
      const accountId = await insertAccount({ role: "operator" });
      const tokenHash = await insertSession({ accountId });
      await run("savepoint failing");
      await run("set local search_path to pg_catalog");

      const failure = await rejectionOf(
        staffAuditInsertStatement(SQL_OVER_TRANSACTION, preparedFor(tokenHash)),
      );
      await run("rollback to savepoint failing");

      expect(
        staffAuditStoreErrorFrom("record a staff audit event", failure),
      ).toMatchObject({ failure: "unavailable" });
    });

    it("reads a real 42501 from the driver as unavailable (the error of a refused SET ROLE; the statements themselves are not run as the application role)", async () => {
      await run("savepoint failing");
      const failure = await run("set local role app_designs").catch(
        (error: unknown) => error,
      );
      await run("rollback to savepoint failing");

      expect((failure as { code?: string }).code).toBe(INSUFFICIENT_PRIVILEGE);
      expect(
        staffAuditStoreErrorFrom("read the staff audit log", failure),
      ).toMatchObject({ failure: "unavailable" });
    });
  });
});
