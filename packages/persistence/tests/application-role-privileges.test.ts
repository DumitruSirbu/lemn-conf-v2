import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";
import type { TestContext } from "vitest";

import { exportedKitchenNotesStatement } from "../src/account-kitchen-notes-statement.js";
import {
  readAvailabilityAtStatement,
  readCurrentAvailabilityStatement,
  setItemActiveStatement,
} from "../src/catalogue-availability-statements.js";
import {
  listVersionsStatement,
  publishStatement,
  readActiveVersionStatement,
  readDraftStatement,
  readVersionStatement,
  writeDraftStatement,
} from "../src/price-book-statements.js";
import { prepareStaffAuditRecord } from "../src/staff-audit-store.js";
import {
  insertUnlessHeldStatement,
  selectPublishedNearStatement,
} from "../src/preset-statements.js";
import { requireValidPresetToRecord } from "../src/preset-validation.js";
import type { StatementTag } from "../src/preset-statements.js";
import type { PresetToRecord } from "../src/preset-repository.js";
import { readDatabaseUrl } from "../src/read-database-url.js";
import {
  staffKitchenListStatement,
  staffKitchenNotesStatement,
  staffKitchenStatement,
} from "../src/staff-kitchen-statements.js";
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
 * `contact_submissions`' own check forbids, so the reference refuses it and it can store nothing. Against `presets`
 * only `explain` is sent, which plans a statement and never runs it.
 */
const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);
if (!hasLiveDatabase) {
  console.warn(
    "[live-suite skipped] the application's database role, the csp_reports and csp_report_cursor grant checks " +
      "(8Q2 criterion 7), the contact_submission_views grant checks (8V criterion 13) and the presets grant check " +
      "(M8C wave P1, ADR 0168 exception 1) included: DATABASE_URL, " +
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

const PRESETS = "public.presets";
/** The grant of ADR 0112 decision 1 as the security review narrowed it: `SELECT` on the table, and no table-level
 *  privilege besides. The owner alone hides a preset. */
const PRESETS_TABLE_PRIVILEGES = ["SELECT"];
/** The eleven columns the grant names for `INSERT`, written out here and not read from the repository, so a column
 *  added to the table or to the grant is unnoticed until someone names it. Sorted in the test, as `READABLE_COLUMNS`
 *  is, because the catalog's order depends on the collation. */
const PRESETS_INSERTABLE_COLUMNS = [
  "id",
  "shape",
  "wall_a_mm",
  "wall_b_mm",
  "wall_c_mm",
  "height_mm",
  "schema_version",
  "design_document",
  "typed_name",
  "thumbnail",
  "thumbnail_type",
];
/** Left out of the grant on purpose: with `INSERT` on `created_at` a leaked credential could stamp a row with a
 *  far-future time and keep it first in every listing, and with it on `status` it could insert a row already hidden. */
const PRESETS_COLUMNS_THE_ROLE_CANNOT_INSERT = ["created_at", "status"];

/** Skips, with the reason the M8C plan (section 4) names, until the owner has applied `0011`: never a failure, never a
 *  pass. */
async function skipUnlessThePresetsTableExists(
  context: TestContext,
): Promise<void> {
  const [probe] = (await neon(readDatabaseUrl())`
    select to_regclass(${PRESETS}::text) is not null as exists
  `) as { exists: boolean }[];
  context.skip(
    probe?.exists !== true,
    `${PRESETS} does not exist yet on this database`,
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

/** A statement and its values as a tagged template gives them, to be handed to `explain`. */
interface RecordedStatement {
  readonly text: string;
  readonly values: readonly unknown[];
}

const recordedStatement: StatementTag<RecordedStatement> = (
  strings,
  ...values
) => ({ text: strings.join("?"), values });

/** A kitchen of the shape the repository's `record` takes, with the room of its own design. */
function aPresetToRecord(): PresetToRecord {
  const { room } = KITCHEN_L_DESIGN;
  return {
    shape: "L",
    walls: { aMm: room.widthMm, bMm: room.depthMm },
    heightMm: room.heightMm,
    design: KITCHEN_L_DESIGN,
    thumbnail: Uint8Array.of(1, 2, 3),
    thumbnailType: "image/png",
  };
}

/** A repository statement, planned and never run, with the values it sends. */
function explainOfThePresetStatement(
  statement: RecordedStatement,
): Promise<unknown> {
  expect(statement.values).toHaveLength(placeholderCountOf(statement.text));
  return neon(readDatabaseUrl()).query(
    `explain ${withNumberedPlaceholders(statement.text)}`,
    [...statement.values],
  );
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

/**
 * What the application role is granted on one of the staff tables of migrations `0020` to `0022` (M8B Lot 3 wave L3-S1),
 * written out here and not read from a migration or a repository, so a column added to a table or to a grant is
 * unnoticed until someone names it. The lists are sorted in the test, because the catalog's order depends on the
 * collation.
 */
interface StaffTableGrant {
  readonly table: string;
  /** Every column the table has. */
  readonly columns: readonly string[];
  /** The columns of the `INSERT` grant. */
  readonly insertable: readonly string[];
  /** The columns of the `UPDATE` grant. */
  readonly updatable: readonly string[];
  /** The tail of an insert that names a column left out of the grant on purpose (a stamped column, or any column of a
   *  seeded singleton), so that a leaked credential cannot write it: type-correct, so the refusal is for privilege. */
  readonly refusedInsertTail: string;
  /** A column left out of the `UPDATE` grant. */
  readonly notUpdatable: string;
  /** The tail of an insert of the shape the store will send, naming only granted columns; `null` for a table the
   *  application role never inserts into (a seeded singleton). */
  readonly insertTail: string | null;
  /** The tail of an update of the shape the store will send, naming only granted columns; `null` for a table the store
   *  updates through the insert above, or never. */
  readonly updateTail: string | null;
}

const A_PROBE_ID = "0".repeat(21);

const STAFF_TABLE_GRANTS: readonly StaffTableGrant[] = [
  {
    table: "public.staff_audit_events",
    columns: [
      "id",
      "occurred_at",
      "actor_account_id",
      "action",
      "design_id",
      "subject_account_id",
      "detail",
    ],
    insertable: [
      "id",
      "actor_account_id",
      "action",
      "design_id",
      "subject_account_id",
      "detail",
    ],
    updatable: [],
    refusedInsertTail: "(occurred_at) values (now())",
    notUpdatable: "action",
    updateTail: null,
    insertTail: `(id, actor_account_id, action) values ('${A_PROBE_ID}', '${A_PROBE_ID}', 'kitchen-opened')`,
  },
  {
    table: "public.design_notes",
    columns: ["id", "design_id", "author_account_id", "body", "created_at"],
    insertable: ["id", "design_id", "author_account_id", "body"],
    updatable: [],
    refusedInsertTail: "(created_at) values (now())",
    notUpdatable: "body",
    updateTail: null,
    insertTail: `(id, design_id, author_account_id, body) values ('${A_PROBE_ID}', '${A_PROBE_ID}', '${A_PROBE_ID}', 'a probe')`,
  },
  {
    table: "public.design_request_states",
    columns: ["design_id", "status", "changed_by_account_id", "changed_at"],
    insertable: ["design_id", "status", "changed_by_account_id"],
    updatable: ["status", "changed_by_account_id", "changed_at"],
    refusedInsertTail: "(changed_at) values (now())",
    notUpdatable: "design_id",
    updateTail: null,
    insertTail:
      `(design_id, status, changed_by_account_id) values ('${A_PROBE_ID}', 'new', '${A_PROBE_ID}') ` +
      "on conflict (design_id) do update set status = excluded.status, " +
      "changed_by_account_id = excluded.changed_by_account_id, changed_at = now()",
  },
  {
    table: "public.price_book_versions",
    columns: [
      "id",
      "sequence_number",
      "label",
      "note",
      "book",
      "change_summary",
      "published_at",
      "published_by_account_id",
    ],
    insertable: [
      "id",
      "sequence_number",
      "label",
      "note",
      "book",
      "change_summary",
      "published_by_account_id",
    ],
    updatable: [],
    refusedInsertTail: "(published_at) values (now())",
    notUpdatable: "label",
    updateTail: null,
    insertTail: `(id, sequence_number, label, note, book, change_summary, published_by_account_id) values ('${A_PROBE_ID}', 1, 'a probe', '', '{}'::jsonb, '[]'::jsonb, '${A_PROBE_ID}')`,
  },
  {
    table: "public.price_book_draft",
    columns: [
      "singleton",
      "revision",
      "changes",
      "base_version_id",
      "updated_at",
      "updated_by_account_id",
    ],
    insertable: [],
    updatable: [
      "revision",
      "changes",
      "base_version_id",
      "updated_at",
      "updated_by_account_id",
    ],
    refusedInsertTail: "(revision) values (1)",
    notUpdatable: "singleton",
    updateTail:
      "set revision = revision + 1, changes = '[]'::jsonb, updated_at = now(), updated_by_account_id = null where revision = 0",
    insertTail: null,
  },
  {
    table: "public.catalogue_availability_head",
    columns: ["singleton", "revision"],
    insertable: [],
    updatable: ["revision"],
    refusedInsertTail: "(revision) values (1)",
    notUpdatable: "singleton",
    updateTail: "set revision = revision + 1 where revision = 0",
    insertTail: null,
  },
  {
    table: "public.catalogue_availability_changes",
    columns: [
      "revision",
      "item_kind",
      "item_id",
      "active",
      "changed_at",
      "changed_by_account_id",
    ],
    insertable: [
      "revision",
      "item_kind",
      "item_id",
      "active",
      "changed_by_account_id",
    ],
    updatable: [],
    refusedInsertTail: "(changed_at) values (now())",
    notUpdatable: "active",
    updateTail: null,
    insertTail: `(revision, item_kind, item_id, active, changed_by_account_id) values (1, 'material', 'a-probe', false, '${A_PROBE_ID}')`,
  },
];

/** The tables the staff kitchen reader's statements read. */
const STAFF_READER_TABLES = [
  "public.designs",
  "public.accounts",
  "public.contact_submissions",
  "public.contact_submission_views",
  "public.design_request_states",
  "public.design_notes",
];

/** Skips, with the reason the Lot 3 plan (section 2.3) names, until the owner has applied the table's migration: never a
 *  failure, never a pass. */
async function skipUnlessTheTableExists(
  context: TestContext,
  tableName: string,
): Promise<void> {
  const [probe] = (await neon(readDatabaseUrl())`
    select to_regclass(${tableName}::text) is not null as exists
  `) as { exists: boolean }[];
  context.skip(
    probe?.exists !== true,
    `${tableName} does not exist yet on this database`,
  );
}

function sorted(columns: readonly string[]): string[] {
  return [...columns].sort();
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

  // M8C wave P1, ADR 0168 exception 1: the runbook's grant proof for migration `0011`. The table comes from the
  // migration; the grant is the owner's, so these skip with the reason until both exist. Asked of the catalog,
  // `PUBLIC` and inherited roles included. Nothing is inserted: a row here would be a preset on every Step 1 screen of
  // the database reached, and the role could not remove it. The last two probes are `explain`, which plans a statement
  // and never runs it: a delete and an update the role may not make must be refused with 42501, or `explain` is not
  // checking privileges. The update is the owner's hiding statement, so it is also the proof that the application
  // cannot hide, show or rewrite a preset.
  guardedTest(
    "effectively holds select on public.presets, insert on exactly eleven named columns and not on created_at or status, nothing through PUBLIC, and has a delete and an update refused, once it exists",
    async (context) => {
      await skipUnlessThePresetsTableExists(context);
      const sql = neon(readDatabaseUrl());

      const known = await tablePrivilegesTheServerKnows(sql);
      expect(known).toEqual(
        expect.arrayContaining([...TABLE_PRIVILEGES_EVERY_SERVER_KNOWS]),
      );
      expect(await privilegesHeldOn(sql, PRESETS, known)).toEqual(
        PRESETS_TABLE_PRIVILEGES,
      );
      const columns = await columnsOf(sql, PRESETS);
      expect([...columns].sort()).toEqual(
        [
          ...PRESETS_INSERTABLE_COLUMNS,
          ...PRESETS_COLUMNS_THE_ROLE_CANNOT_INSERT,
        ].sort(),
      );
      expect(await columnsHolding(sql, PRESETS, "SELECT")).toEqual(columns);
      expect(
        [...(await columnsHolding(sql, PRESETS, "INSERT"))].sort(),
      ).toEqual([...PRESETS_INSERTABLE_COLUMNS].sort());
      expect(await columnsHolding(sql, PRESETS, "UPDATE")).toEqual([]);
      expect(await columnsHolding(sql, PRESETS, "REFERENCES")).toEqual([]);
      await expectNothingHeldWithGrantOption(sql, PRESETS, known);
      expect(await grantsToPublicOn(sql, PRESETS)).toBe(0);

      expect(await failureOf(`explain delete from ${PRESETS}`)).toMatchObject({
        code: INSUFFICIENT_PRIVILEGE,
      });
      expect(
        await failureOf(`explain update ${PRESETS} set status = 'hidden'`),
      ).toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    },
  );

  // As for the csp tables and `contact_submission_views`: `explain` shows the server finds the column grant enough for
  // the two statements the repository sends that the role can plan. They are the repository's own statements, built by
  // the same functions, so they cannot drift from what is planned here. The negative controls show the column grant
  // is what is checked: an insert that names `status`, or `created_at`, is refused with 42501.
  guardedTest(
    "can have the repository's record and list statements planned, and cannot have an insert naming status or created_at planned, once the table exists",
    async (context) => {
      await skipUnlessThePresetsTableExists(context);
      const preset = aPresetToRecord();

      await expect(
        explainOfThePresetStatement(
          insertUnlessHeldStatement(
            recordedStatement,
            "0".repeat(21),
            preset,
            requireValidPresetToRecord(preset),
          ),
        ),
      ).resolves.toBeDefined();
      await expect(
        explainOfThePresetStatement(
          selectPublishedNearStatement(recordedStatement, {
            shape: "L",
            walls: preset.walls,
            windowMm: 600,
            limit: 8,
          }),
        ),
      ).resolves.toBeDefined();

      for (const column of PRESETS_COLUMNS_THE_ROLE_CANNOT_INSERT) {
        expect(
          await failureOf(
            `explain insert into ${PRESETS} (id, ${column}) values ('${"0".repeat(21)}', ` +
              `${column === "status" ? "'hidden'" : "now()"})`,
          ),
        ).toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
      }
    },
  );

  // M8B Lot 3 wave L3-S1: the runbook's grant proof for migrations `0020` to `0022`. The tables come from the
  // migrations; the grants are the owner's, so these skip with the reason until the tables exist. With a table present
  // and nothing granted, `SELECT` is not held and the first arm is red, which is the runbook's step 3; with exactly the
  // prescribed grants it is green. Asked of the catalog, `PUBLIC` and inherited roles included. Nothing is inserted,
  // updated or deleted: the second arm sends `explain`, which plans a statement and never runs it, and a refusal with
  // 42501 shows `explain` checks privileges at all.
  describe.each(STAFF_TABLE_GRANTS)("the staff table $table", (grant) => {
    guardedTest(
      "effectively holds select, insert and update on exactly its named columns, nothing through PUBLIC and no grant option, once it exists",
      async (context) => {
        await skipUnlessTheTableExists(context, grant.table);
        const sql = neon(readDatabaseUrl());

        const known = await tablePrivilegesTheServerKnows(sql);
        expect(known).toEqual(
          expect.arrayContaining([...TABLE_PRIVILEGES_EVERY_SERVER_KNOWS]),
        );
        expect(await privilegesHeldOn(sql, grant.table, known)).toEqual([
          "SELECT",
        ]);
        const columns = await columnsOf(sql, grant.table);
        expect(sorted(columns)).toEqual(sorted(grant.columns));
        expect(await columnsHolding(sql, grant.table, "SELECT")).toEqual(
          columns,
        );
        expect(
          sorted(await columnsHolding(sql, grant.table, "INSERT")),
        ).toEqual(sorted(grant.insertable));
        expect(
          sorted(await columnsHolding(sql, grant.table, "UPDATE")),
        ).toEqual(sorted(grant.updatable));
        expect(await columnsHolding(sql, grant.table, "REFERENCES")).toEqual(
          [],
        );
        await expectNothingHeldWithGrantOption(sql, grant.table, known);
        expect(await grantsToPublicOn(sql, grant.table)).toBe(0);
      },
    );

    guardedTest(
      "can have the store's write planned, and cannot have a delete, an insert or an update the grant leaves out planned, once it exists",
      async (context) => {
        await skipUnlessTheTableExists(context, grant.table);
        const sql = neon(readDatabaseUrl());

        if (grant.insertTail !== null) {
          await expect(
            sql.query(`explain insert into ${grant.table} ${grant.insertTail}`),
          ).resolves.toBeDefined();
        }
        if (grant.updateTail !== null) {
          await expect(
            sql.query(`explain update ${grant.table} ${grant.updateTail}`),
          ).resolves.toBeDefined();
        }

        expect(
          await failureOf(`explain delete from ${grant.table}`),
        ).toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
        expect(
          await failureOf(
            `explain insert into ${grant.table} ${grant.refusedInsertTail}`,
          ),
        ).toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
        expect(
          await failureOf(
            `explain update ${grant.table} set ${grant.notUpdatable} = ${grant.notUpdatable}`,
          ),
        ).toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
      },
    );
  });

  // M10 wave S2: the price book and availability stores' statements, the stores' own text built by the same functions,
  // planned and never run (`explain` runs no data-modifying branch). Each reads or writes several tables through column
  // grants, so a column a statement names that the role was not granted is a 42501 here and not at the first publish. Red
  // until the owner has issued the `0023` to `0025` grants and the `0020` to `0022` ones the audit row and the actor need.
  guardedTest(
    "can have the price book store's and the availability store's statements planned, once the tables exist",
    async (context) => {
      for (const table of [
        "public.price_book_versions",
        "public.price_book_draft",
        "public.catalogue_availability_head",
        "public.catalogue_availability_changes",
        "public.staff_audit_events",
        "public.account_sessions",
        "public.accounts",
      ]) {
        await skipUnlessTheTableExists(context, table);
      }
      const session = {
        sessionTokenHash: "a".repeat(64),
        idleLifetimeSeconds: {
          client: 2_592_000,
          operator: 43_200,
          administrator: 43_200,
        },
      };
      const auditOf = (action: string, detail: Record<string, unknown>) =>
        prepareStaffAuditRecord({
          ...session,
          entry: { action, detail } as never,
          designId: null,
          subjectAccountId: null,
        });

      for (const statement of [
        readActiveVersionStatement(recordedStatement),
        readVersionStatement(recordedStatement, A_PROBE_ID),
        listVersionsStatement(recordedStatement, { offset: 0, limit: 20 }),
        readDraftStatement(recordedStatement),
        writeDraftStatement(recordedStatement, {
          expectedRevision: "0",
          changesJson: "[]",
          detailJson: JSON.stringify({ changeKind: "depth-rule" }),
          audit: auditOf("price-draft-changed", { changeKind: "depth-rule" }),
        }),
        publishStatement(recordedStatement, {
          expectedDraftRevision: "0",
          expectedActiveSequence: "0",
          expectedAvailabilityRevision: "0",
          versionId: A_PROBE_ID,
          label: "a probe",
          note: "",
          bookJson: "{}",
          changeSummaryJson: "[]",
          createdItemKinds: ["hardware"],
          createdItemIds: ["a-probe"],
          detailJson: JSON.stringify({ provisional: true }),
          audit: auditOf("price-published", {
            provisional: true,
            sequenceNumber: 1,
            changeCount: 0,
          }),
        }),
        readCurrentAvailabilityStatement(recordedStatement),
        readAvailabilityAtStatement(recordedStatement, "0"),
        setItemActiveStatement(recordedStatement, {
          expectedRevision: "0",
          itemKind: "material",
          itemId: "a-probe",
          active: false,
          detailJson: JSON.stringify({
            itemKind: "material",
            itemId: "a-probe",
            active: false,
          }),
          audit: auditOf("catalogue-item-active-changed", {
            itemKind: "material",
            itemId: "a-probe",
            active: false,
            availabilityRevision: "0",
          }),
        }),
      ]) {
        await expect(
          explainOfThePresetStatement(statement),
        ).resolves.toBeDefined();
      }
    },
  );

  // The client's data export reads the notes on its own kitchens in one statement, the store's own text built by the
  // same function, planned and never run. It reads `design_notes` and `designs` and selects no author column, so a
  // missing `design_notes` `SELECT` grant is a 42501 here and not at the first export. Red until the owner has issued
  // the `0021` grants.
  guardedTest(
    "can have the export's notes statement planned, once the notes table exists",
    async (context) => {
      await skipUnlessTheTableExists(context, "public.design_notes");

      await expect(
        explainOfThePresetStatement(
          exportedKitchenNotesStatement(recordedStatement, {
            accountId: "0".repeat(21),
            kitchenIds: ["0".repeat(21), "k".repeat(21)],
          }),
        ),
      ).resolves.toBeDefined();
    },
  );

  // The staff kitchen reader's three statements, the reader's own text built by the same functions, planned and never
  // run. They read six tables, three of them through column grants, so a column the reader names that the role was not
  // granted is a 42501 here and not at the first staff request. Red until the owner has issued the `0021` and `0022`
  // grants, which is the runbook step that proves them. The control shows `explain` is what checks the columns: a column
  // of a request the role may not select is refused.
  guardedTest(
    "can have the staff kitchen reader's list, kitchen and notes statements planned, and cannot have a personal column of a request planned, once the tables exist",
    async (context) => {
      for (const table of STAFF_READER_TABLES) {
        await skipUnlessTheTableExists(context, table);
      }

      for (const statement of [
        staffKitchenListStatement(recordedStatement, {
          segment: "all",
          status: null,
          search: "ana",
          page: 1,
        }),
        staffKitchenListStatement(recordedStatement, {
          segment: "sent",
          status: "new",
          search: null,
          page: 2,
        }),
        staffKitchenStatement(recordedStatement, "0".repeat(21)),
        staffKitchenNotesStatement(recordedStatement, "0".repeat(21)),
      ]) {
        await expect(
          explainOfThePresetStatement(statement),
        ).resolves.toBeDefined();
      }
      expect(
        await failureOf(`explain select name from ${CONTACT_SUBMISSIONS}`),
      ).toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    },
  );
});
