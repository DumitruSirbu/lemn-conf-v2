import { CURRENT_SCHEMA_VERSION } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";
import type { TestContext } from "vitest";

import { readDatabaseUrl } from "../src/read-database-url.js";
import { columnsHolding, columnsOf } from "./support/column-privileges.js";
import {
  READABLE_COLUMNS,
  UPDATABLE_COLUMNS,
} from "./support/contact-submission-columns.js";
import {
  describeWhereTheRunIs,
  readConnectionFacts,
  reasonsTheConnectionIsNotTheApplicationRole,
} from "./support/connection-facts.js";
import type { ConnectionFacts } from "./support/connection-facts.js";
import { aFullRow, markOf } from "./support/csp-report-fixtures.js";
import {
  RECORD_REPORT_STATEMENT_TEXT,
  placeholderCountOf,
  withNumberedPlaceholders,
} from "./support/csp-report-statement.js";
import {
  LOAD_VIEW_STATEMENT_TEXT,
  RECORD_VIEW_STATEMENT_TEXT,
} from "./support/sent-kitchen-view-statements.js";
import {
  TABLE_PRIVILEGES_EVERY_SERVER_KNOWS,
  privilegesHeldOn,
  privilegesHeldWithGrantOption,
  tablePrivilegesTheServerKnows,
} from "./support/table-privileges.js";

/**
 * M2 work item 8: the application connects with a least-privilege role, not the database owner.
 *
 * These assertions run against whatever `DATABASE_URL` actually points at, which on a developer's machine can be
 * production, so they fail if the application is ever repointed at an owner-level connection, or if someone grants
 * the application role more than it needs.
 *
 * Safe on any credential (criterion 13). Everything is asked of the catalog with `select`. Before any test, the
 * connection is shown to be no superuser, to inherit no role and not to own `designs`; if that cannot be shown, every
 * test fails with what was found and nothing more is sent. A statement that would destroy or create something if it
 * were allowed (`truncate`, `drop table`, `create table`) is never sent: what it proved is read from the catalog. The
 * only statements sent besides reads are deletes of a row that does not exist, only after the catalog has said the
 * role may not delete from that table, and one insert into `contact_submission_views` naming a request id that
 * `contact_submissions`' own check forbids, so the reference refuses it and it can store nothing.
 */
const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);
if (!hasLiveDatabase) {
  console.warn(
    "[live-suite skipped] the application's database role, the csp_reports and csp_report_cursor grant checks " +
      "(8Q2 criterion 7) and the contact_submission_views grant checks (8V criterion 13) included: DATABASE_URL, " +
      "which these checks need to be the application role's connection, is not set. Nothing here was asserted.",
  );
}

let establishedConnection: Promise<ConnectionFacts> | undefined;

/** Memoised, so the run says once where it is and every test sees the same refusal. */
function requireTheApplicationRole(): Promise<ConnectionFacts> {
  establishedConnection ??= establishTheApplicationRole();
  return establishedConnection;
}

async function establishTheApplicationRole(): Promise<ConnectionFacts> {
  const facts = await readConnectionFacts(neon(readDatabaseUrl()));
  const whereTheRunIs = describeWhereTheRunIs(facts);
  console.info(`[application-role-privileges] ${whereTheRunIs}`);
  const reasons = reasonsTheConnectionIsNotTheApplicationRole(facts);
  if (reasons.length > 0) {
    throw new Error(
      `Refusing to run the privilege tests: the connection ${whereTheRunIs} is not the application role, because ` +
        `${reasons.join("; ")}. Nothing more was sent.`,
    );
  }
  return facts;
}

/** A test that first establishes the connection, so a failed guard fails the test and never skips it. */
function guardedTest(
  name: string,
  body: (context: TestContext, facts: ConnectionFacts) => void | Promise<void>,
): void {
  it(name, async (context) => {
    await body(context, await requireTheApplicationRole());
  });
}

async function expectRefused(statement: string): Promise<void> {
  const sql = neon(readDatabaseUrl());
  await expect(sql.query(statement)).rejects.toThrow(
    /permission denied|must be owner/i,
  );
}

/** Sends a delete of a row that does not exist only once the catalog has said it will be refused. */
async function expectDeleteRefusedByCatalogThenByServer(
  tableName: string,
  statement: string,
): Promise<void> {
  const held = await privilegesHeldOn(neon(readDatabaseUrl()), tableName, [
    "DELETE",
  ]);
  expect(
    held,
    `the server says this role may delete from ${tableName}, so the probe was not sent`,
  ).toEqual([]);
  await expectRefused(statement);
}

const CONTACT_SUBMISSIONS = "public.contact_submissions";
/** The privileges a column can carry. */
const COLUMN_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "REFERENCES"];
/** An id the column's check cannot hold (it has spaces and a colon), so no row can carry it and a probe that were
 *  allowed would still touch nothing. */
const NO_SUCH_REQUEST_ID = "no such request: a probe";

function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/** Not `WITH GRANT OPTION`. A role that could pass on what it holds would make the grant wider than the owner's
 *  statement, and `has_table_privilege` and `has_column_privilege` both take the privilege with the suffix. */
async function expectNothingHeldWithGrantOption(
  sql: NeonQueryFunction<false, false>,
  tableName: string,
  knownTablePrivileges: readonly string[],
): Promise<void> {
  expect(
    await privilegesHeldWithGrantOption(sql, tableName, knownTablePrivileges),
  ).toEqual([]);
  for (const privilege of COLUMN_PRIVILEGES) {
    expect(
      await columnsHolding(sql, tableName, `${privilege} WITH GRANT OPTION`),
    ).toEqual([]);
  }
}

/** Sends, for each column the catalog says is not held, the one statement that would touch and show nothing if it were
 *  allowed. The delete's privilege was shown absent by the caller. */
async function expectEveryColumnProbeRefused(
  columns: readonly string[],
  held: {
    readonly readable: readonly string[];
    readonly updatable: readonly string[];
  },
): Promise<void> {
  for (const column of columns.filter(
    (name) => !held.readable.includes(name),
  )) {
    await expectRefused(
      `select ${quoted(column)} from ${CONTACT_SUBMISSIONS} where false`,
    );
  }
  for (const column of columns.filter(
    (name) => !held.updatable.includes(name),
  )) {
    await expectRefused(
      `update ${CONTACT_SUBMISSIONS} set ${quoted(column)} = ${quoted(column)} ` +
        `where client_request_id = '${NO_SUCH_REQUEST_ID}'`,
    );
  }
  await expectRefused(
    `delete from ${CONTACT_SUBMISSIONS} where client_request_id = '${NO_SUCH_REQUEST_ID}'`,
  );
}

const CSP_REPORTS = "public.csp_reports";
const CSP_REPORT_CURSOR = "public.csp_report_cursor";
/** The grant of ADR 0162, held exactly: `ON CONFLICT DO UPDATE` and the cursor's `UPDATE ... RETURNING` need these and
 *  nothing more, and a row leaves only by being overwritten. */
const CSP_REPORTS_PRIVILEGES = ["INSERT", "SELECT", "UPDATE"];
const CSP_REPORT_CURSOR_PRIVILEGES = ["SELECT", "UPDATE"];
/** The server's code for "permission denied", which a message regular expression could mistake for another refusal. */
const INSUFFICIENT_PRIVILEGE = "42501";

/** Skips, with the reason criterion 7 names, until the owner has applied `0009`: never a failure, never a pass. */
async function skipUnlessTheCspTablesExist(
  context: TestContext,
): Promise<void> {
  const [probe] = (await neon(readDatabaseUrl())`
    select to_regclass(${CSP_REPORTS}::text) is not null as reports_exist,
      to_regclass(${CSP_REPORT_CURSOR}::text) is not null as cursor_exists
  `) as { reports_exist: boolean; cursor_exists: boolean }[];
  context.skip(
    probe?.reports_exist !== true,
    `${CSP_REPORTS} does not exist yet on this database`,
  );
  context.skip(
    probe?.cursor_exists !== true,
    `${CSP_REPORT_CURSOR} does not exist yet on this database`,
  );
}

const CONTACT_SUBMISSION_VIEWS = "public.contact_submission_views";
/** The grant of the 8V plan's D3: `record` inserts and reads back, `load` reads, and nothing revokes or deletes. */
const CONTACT_SUBMISSION_VIEWS_PRIVILEGES = ["INSERT", "SELECT"];
/** The server's code for a row whose reference names no row of the referenced table. */
const FOREIGN_KEY_VIOLATION = "23503";

/** Skips, with the reason criterion 13 names, until the owner has applied `0010`: never a failure, never a pass. */
async function skipUnlessTheViewsTableExists(
  context: TestContext,
): Promise<void> {
  const [probe] = (await neon(readDatabaseUrl())`
    select to_regclass(${CONTACT_SUBMISSION_VIEWS}::text) is not null as exists
  `) as { exists: boolean }[];
  context.skip(
    probe?.exists !== true,
    `${CONTACT_SUBMISSION_VIEWS} does not exist yet on this database`,
  );
}

/** One of the repository's statements, planned and never run, with values of the shape it sends. */
function explainOfTheViewStatement(
  text: string,
  values: readonly unknown[],
): Promise<unknown> {
  expect(values).toHaveLength(placeholderCountOf(text));
  return neon(readDatabaseUrl()).query(
    `explain ${withNumberedPlaceholders(text)}`,
    [...values],
  );
}

/** How many grants to `PUBLIC` (grantee 0) the table's access list holds. A null list holds none. */
async function grantsToPublicOn(
  sql: NeonQueryFunction<false, false>,
  tableName: string,
): Promise<number> {
  const [row] = (await sql`
    select count(a.grantee)::int as granted
    from pg_class c
    left join lateral aclexplode(c.relacl) a on a.grantee = 0
    where c.oid = ${tableName}::regclass
  `) as { granted: number }[];
  return row?.granted ?? -1;
}

/** What the server answered a statement with, as the failure it raised or `undefined` when it raised none. */
function failureOf(statement: string): Promise<unknown> {
  return neon(readDatabaseUrl())
    .query(statement)
    .then(
      () => undefined,
      (failure: unknown) => failure,
    );
}

/** The store's own statement with its values, in the form `explain` takes: the same text, numbered placeholders. */
function explainOfTheStoresStatement(): Promise<unknown> {
  const row = aFullRow(markOf("a"));
  const values = [
    row.writerMark,
    row.directive,
    row.blocked,
    row.source ?? null,
    row.line ?? null,
    row.column ?? null,
    row.page,
    row.locale,
    row.origin,
    row.disposition,
    row.status ?? null,
  ];
  expect(values).toHaveLength(placeholderCountOf(RECORD_REPORT_STATEMENT_TEXT));
  return neon(readDatabaseUrl()).query(
    `explain ${withNumberedPlaceholders(RECORD_REPORT_STATEMENT_TEXT)}`,
    values,
  );
}

describe.skipIf(!hasLiveDatabase)("the application's database role", () => {
  guardedTest(
    "is not the database owner and inherits no other role",
    async () => {
      const sql = neon(readDatabaseUrl());

      const memberships = (await sql`
      select r.rolname
      from pg_auth_members m
      join pg_roles r on r.oid = m.roleid
      join pg_roles member on member.oid = m.member
      where member.rolname = current_user
    `) as { rolname: string }[];

      // Roles created through the Neon Console/CLI/API are auto-granted `neon_superuser`; only
      // SQL-created roles avoid it. An inherited role here means the least-privilege role is
      // least-privilege in name only.
      expect(memberships.map((row) => row.rolname)).toEqual([]);
    },
  );

  guardedTest(
    "holds no superuser, createdb or createrole attribute",
    async () => {
      const sql = neon(readDatabaseUrl());

      const [attributes] = (await sql`
      select rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname = current_user
    `) as { rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }[];

      expect(attributes).toEqual({
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
      });
    },
  );

  guardedTest(
    "holds exactly select, insert and update on designs — no delete",
    async () => {
      const sql = neon(readDatabaseUrl());

      const grants = (await sql`
      select privilege_type
      from information_schema.role_table_grants
      where grantee = current_user and table_name = 'designs'
      order by privilege_type
    `) as { privilege_type: string }[];

      expect(grants.map((row) => row.privilege_type)).toEqual([
        "INSERT",
        "SELECT",
        "UPDATE",
      ]);
    },
  );

  guardedTest("holds no privilege at all on the migration ledger", async () => {
    // Wave S10 adds `schema_migrations` to every database this project owns. The application never
    // reads or writes it — only the migration runner does, under the separate owner credential of
    // ADR 0008 — so the correct grant set is the empty one, and a table nothing asserts about is a
    // table whose privileges quietly decay. True whether or not the ledger exists yet in this
    // database: a table with no grants and a table that is absent both produce no rows here, and
    // the first production run is where ADR 0020's schema read-back confirms which it was.
    const sql = neon(readDatabaseUrl());

    const grants = (await sql`
      select privilege_type
      from information_schema.role_table_grants
      where grantee = current_user and table_name = 'schema_migrations'
    `) as { privilege_type: string }[];

    expect(grants).toEqual([]);
  });

  guardedTest("cannot delete a design", async () => {
    await expectDeleteRefusedByCatalogThenByServer(
      "public.designs",
      "delete from public.designs where id = 'no-such-design'",
    );
  });

  guardedTest(
    "cannot truncate the designs table, as the catalog says: the statement is not sent",
    async () => {
      const sql = neon(readDatabaseUrl());

      expect(
        await privilegesHeldOn(sql, "public.designs", ["TRUNCATE"]),
      ).toEqual([]);
    },
  );

  // Who may drop a table is its owner, a member of its owner, a superuser and the owner of its schema.
  guardedTest(
    "cannot drop the designs table, as the catalog says: the statement is not sent",
    (_context, facts) => {
      expect({
        isSuperuser: facts.isSuperuser,
        isDesignsOwnerOrMemberOfIt: facts.isDesignsOwnerOrMemberOfIt,
        isSchemaOwnerOrMemberOfIt: facts.isSchemaOwnerOrMemberOfIt,
      }).toEqual({
        isSuperuser: false,
        isDesignsOwnerOrMemberOfIt: false,
        isSchemaOwnerOrMemberOfIt: false,
      });
    },
  );

  guardedTest(
    "cannot create a table, as the catalog says: the statement is not sent",
    (_context, facts) => {
      expect(facts.canCreateInSchema).toBe(false);
    },
  );

  guardedTest(
    "can still read designs, so the restrictions have not broken the application",
    async () => {
      const sql = neon(readDatabaseUrl());

      const rows = (await sql`select count(*)::int as count from designs`) as {
        count: number;
      }[];

      expect(typeof rows[0]?.count).toBe("number");
    },
  );

  // M7 wave 7E3c, D9: migration `0006` creates `design_share_links`, but the grant on it is a
  // separate, owner-run step (ADR 0008's 2026-09-23 note; ADR 0114 Amendment G3). Conditional on the
  // table's existence rather than skipped outright, so local gates stay green before the owner acts
  // and go red the moment the table exists without its grant — the same "a property nothing checks
  // quietly decays" argument the file's own header makes.
  guardedTest(
    "holds exactly select, insert and update on design_share_links, once it exists — no delete",
    async (context) => {
      const sql = neon(readDatabaseUrl());

      const [tableProbe] = (await sql`
      select to_regclass('public.design_share_links') is not null as exists
    `) as { exists: boolean }[];
      context.skip(
        tableProbe?.exists !== true,
        "design_share_links does not exist yet on this database",
      );

      const grants = (await sql`
      select privilege_type
      from information_schema.role_table_grants
      where grantee = current_user and table_name = 'design_share_links'
      order by privilege_type
    `) as { privilege_type: string }[];

      expect(grants.map((row) => row.privilege_type)).toEqual([
        "INSERT",
        "SELECT",
        "UPDATE",
      ]);

      await expectDeleteRefusedByCatalogThenByServer(
        "public.design_share_links",
        "delete from public.design_share_links where token_hash = 'no-such-token'",
      );
    },
  );

  // Asks the database what the role effectively holds, so a grant to `PUBLIC` or to an inherited role counts, on the
  // table named with its schema. The privileges come from the server, so one it adds later (`MAINTAIN` on 17) is
  // asserted not held too. `DELETE` is held here alone, because the prune deletes expired windows.
  guardedTest(
    "effectively holds select, insert, update and delete on public.rate_limit_counters, and no other privilege, once it exists",
    async (context) => {
      const sql = neon(readDatabaseUrl());

      const [tableProbe] = (await sql`
      select to_regclass('public.rate_limit_counters') is not null as exists
    `) as { exists: boolean }[];
      context.skip(
        tableProbe?.exists !== true,
        "public.rate_limit_counters does not exist yet on this database",
      );

      const known = await tablePrivilegesTheServerKnows(sql);
      expect(known).toEqual(
        expect.arrayContaining([...TABLE_PRIVILEGES_EVERY_SERVER_KNOWS]),
      );
      const held = await privilegesHeldOn(
        sql,
        "public.rate_limit_counters",
        known,
      );

      expect(held).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    },
  );

  // Built as the rate-limit table's test is: the catalog is asked first and a statement is sent only for
  // what the catalog said is refused, and only one that touches and shows nothing if it were allowed: a column read
  // `where false`, a delete and an update of an id that does not exist. The expected sets are named and the columns come
  // from the catalog, so a column added later is unread until someone names it here.
  guardedTest(
    "holds insert on public.contact_submissions, select on exactly its seven readable columns and update on notified_at alone, once it exists",
    async (context) => {
      const sql = neon(readDatabaseUrl());
      const [tableProbe] = (await sql`
      select to_regclass('public.contact_submissions') is not null as exists
    `) as { exists: boolean }[];
      context.skip(
        tableProbe?.exists !== true,
        "public.contact_submissions does not exist yet on this database",
      );

      const known = await tablePrivilegesTheServerKnows(sql);
      expect(known).toEqual(
        expect.arrayContaining([...TABLE_PRIVILEGES_EVERY_SERVER_KNOWS]),
      );
      expect(await privilegesHeldOn(sql, CONTACT_SUBMISSIONS, known)).toEqual([
        "INSERT",
      ]);
      const columns = await columnsOf(sql, CONTACT_SUBMISSIONS);
      const readable = await columnsHolding(sql, CONTACT_SUBMISSIONS, "SELECT");
      const updatable = await columnsHolding(
        sql,
        CONTACT_SUBMISSIONS,
        "UPDATE",
      );
      expect(readable).toEqual([...READABLE_COLUMNS].sort());
      expect(updatable).toEqual([...UPDATABLE_COLUMNS].sort());
      expect(
        await columnsHolding(sql, CONTACT_SUBMISSIONS, "REFERENCES"),
      ).toEqual([]);
      await expectNothingHeldWithGrantOption(sql, CONTACT_SUBMISSIONS, known);

      await expectEveryColumnProbeRefused(columns, { readable, updatable });
    },
  );
  // 8Q2 criterion 7. The tables come from migration `0009`; the grant is the owner's (ADR 0162), so this skips with the
  // reason until both exist. Asked of the catalog, `PUBLIC` and inherited roles included.
  guardedTest(
    "effectively holds select, insert and update on public.csp_reports and select and update on public.csp_report_cursor, and no other privilege, once they exist",
    async (context) => {
      await skipUnlessTheCspTablesExist(context);
      const sql = neon(readDatabaseUrl());

      const known = await tablePrivilegesTheServerKnows(sql);
      expect(known).toEqual(
        expect.arrayContaining([...TABLE_PRIVILEGES_EVERY_SERVER_KNOWS]),
      );
      expect(await privilegesHeldOn(sql, CSP_REPORTS, known)).toEqual(
        CSP_REPORTS_PRIVILEGES,
      );
      expect(await privilegesHeldOn(sql, CSP_REPORT_CURSOR, known)).toEqual(
        CSP_REPORT_CURSOR_PRIVILEGES,
      );
      for (const tableName of [CSP_REPORTS, CSP_REPORT_CURSOR]) {
        expect(await columnsHolding(sql, tableName, "REFERENCES")).toEqual([]);
        await expectNothingHeldWithGrantOption(sql, tableName, known);
      }
    },
  );

  guardedTest(
    "is granted nothing on public.csp_reports or public.csp_report_cursor through PUBLIC, once they exist",
    async (context) => {
      await skipUnlessTheCspTablesExist(context);
      const sql = neon(readDatabaseUrl());

      expect(await grantsToPublicOn(sql, CSP_REPORTS)).toBe(0);
      expect(await grantsToPublicOn(sql, CSP_REPORT_CURSOR)).toBe(0);
    },
  );

  guardedTest(
    "cannot delete from or truncate the csp tables: the catalog says so, and the server refuses the delete",
    async (context) => {
      await skipUnlessTheCspTablesExist(context);
      const sql = neon(readDatabaseUrl());

      await expectDeleteRefusedByCatalogThenByServer(
        CSP_REPORTS,
        `delete from ${CSP_REPORTS} where slot = -1`,
      );
      await expectDeleteRefusedByCatalogThenByServer(
        CSP_REPORT_CURSOR,
        `delete from ${CSP_REPORT_CURSOR} where not singleton`,
      );
      for (const tableName of [CSP_REPORTS, CSP_REPORT_CURSOR]) {
        expect(await privilegesHeldOn(sql, tableName, ["TRUNCATE"])).toEqual(
          [],
        );
      }
    },
  );

  // The grant is the least that works only if the statement the store sends is planned under it: the catalog shows
  // what is held, and `explain` shows that the server finds it enough. Plain `explain`, never `explain analyze`, which
  // would run the statement and advance the cursor. The negative control shows `explain` checks privileges at all: a
  // delete the role may not make must be refused with 42501, or a success of the first proves nothing.
  guardedTest(
    "can have the store's statement planned, and cannot have a delete planned, once the csp tables exist",
    async (context) => {
      await skipUnlessTheCspTablesExist(context);
      const sql = neon(readDatabaseUrl());
      expect(await privilegesHeldOn(sql, CSP_REPORTS, ["DELETE"])).toEqual([]);

      await expect(explainOfTheStoresStatement()).resolves.toBeDefined();

      expect(
        await failureOf(`explain delete from ${CSP_REPORTS}`),
      ).toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
      expect(
        await failureOf(`explain delete from ${CSP_REPORT_CURSOR}`),
      ).toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    },
  );

  // 8V criterion 13. The table comes from migration `0010`; the grant is the owner's, so these skip with the reason
  // until both exist. Asked of the catalog, `PUBLIC` and inherited roles included.
  guardedTest(
    "effectively holds select and insert on public.contact_submission_views, and no other privilege, once it exists",
    async (context) => {
      await skipUnlessTheViewsTableExists(context);
      const sql = neon(readDatabaseUrl());

      const known = await tablePrivilegesTheServerKnows(sql);
      expect(known).toEqual(
        expect.arrayContaining([...TABLE_PRIVILEGES_EVERY_SERVER_KNOWS]),
      );
      expect(
        await privilegesHeldOn(sql, CONTACT_SUBMISSION_VIEWS, known),
      ).toEqual(CONTACT_SUBMISSION_VIEWS_PRIVILEGES);
      expect(
        await columnsHolding(sql, CONTACT_SUBMISSION_VIEWS, "UPDATE"),
      ).toEqual([]);
      expect(
        await columnsHolding(sql, CONTACT_SUBMISSION_VIEWS, "REFERENCES"),
      ).toEqual([]);
      await expectNothingHeldWithGrantOption(
        sql,
        CONTACT_SUBMISSION_VIEWS,
        known,
      );
    },
  );

  guardedTest(
    "is granted nothing on public.contact_submission_views through PUBLIC, once it exists",
    async (context) => {
      await skipUnlessTheViewsTableExists(context);

      expect(
        await grantsToPublicOn(
          neon(readDatabaseUrl()),
          CONTACT_SUBMISSION_VIEWS,
        ),
      ).toBe(0);
    },
  );

  // As for the csp tables: `explain` shows the server finds the grant enough for the statements the repository sends,
  // and a delete and an update refused with 42501 show `explain` checks privileges at all.
  guardedTest(
    "can have the repository's two statements planned, and cannot have a delete or an update planned, once the table exists",
    async (context) => {
      await skipUnlessTheViewsTableExists(context);
      const tokenHash = "0".repeat(64);

      await expect(
        explainOfTheViewStatement(RECORD_VIEW_STATEMENT_TEXT, [
          tokenHash,
          NO_SUCH_REQUEST_ID,
          CURRENT_SCHEMA_VERSION,
          "{}",
          tokenHash,
          NO_SUCH_REQUEST_ID,
        ]),
      ).resolves.toBeDefined();
      await expect(
        explainOfTheViewStatement(LOAD_VIEW_STATEMENT_TEXT, [tokenHash]),
      ).resolves.toBeDefined();

      expect(
        await failureOf(`explain delete from ${CONTACT_SUBMISSION_VIEWS}`),
      ).toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
      expect(
        await failureOf(
          `explain update ${CONTACT_SUBMISSION_VIEWS} set revoked_at = now()`,
        ),
      ).toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    },
  );

  // The reference's check runs when a row is inserted, which `explain` never does, so one insert is sent: of a request
  // id `contact_submissions`' shape check forbids, so no request can carry it and the insert stores nothing. Refused for
  // the reference (23503), not for privilege (42501), it shows the grants as issued are enough for the reference to be
  // checked. It cannot show a grant is unneeded: the role reads `client_request_id` there anyway.
  guardedTest(
    "has an insert into public.contact_submission_views checked by its reference under the role's grants, once the table exists",
    async (context) => {
      await skipUnlessTheViewsTableExists(context);
      const sql = neon(readDatabaseUrl());
      expect(
        await privilegesHeldOn(sql, CONTACT_SUBMISSION_VIEWS, ["INSERT"]),
      ).toEqual(["INSERT"]);
      const references = (await sql`
        select confdeltype::text as on_delete
        from pg_constraint
        where conrelid = ${CONTACT_SUBMISSION_VIEWS}::regclass and contype = 'f'
          and confrelid = ${CONTACT_SUBMISSIONS}::regclass
      `) as { on_delete: string }[];
      expect(
        references,
        "the table holds no cascading reference to contact_submissions, so the probe was not sent",
      ).toEqual([{ on_delete: "c" }]);

      expect(
        await failureOf(
          `insert into ${CONTACT_SUBMISSION_VIEWS} (token_hash, client_request_id, schema_version, design_document) ` +
            `values ('${"0".repeat(64)}', '${NO_SUCH_REQUEST_ID}', ${String(CURRENT_SCHEMA_VERSION)}, '{}'::jsonb)`,
        ),
      ).toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    },
  );
});
