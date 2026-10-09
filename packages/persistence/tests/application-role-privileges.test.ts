import { neon } from "@neondatabase/serverless";
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
import {
  TABLE_PRIVILEGES_EVERY_SERVER_KNOWS,
  privilegesHeldOn,
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
 * only statements sent besides reads are two deletes of a row that does not exist, and only after the catalog has
 * said the role may not delete from that table.
 */
const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);

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
const NO_SUCH_REQUEST_ID = "no-such-request-id-for-a-probe";

function quoted(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
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

  // M8 wave 8I, criterion 3, built as 8E's criterion 13. The catalog is asked first and a statement is sent only for
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

      await expectEveryColumnProbeRefused(columns, { readable, updatable });
    },
  );
});
