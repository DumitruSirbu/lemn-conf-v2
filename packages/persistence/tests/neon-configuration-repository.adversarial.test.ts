import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { Client, neon, neonConfig } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { generateDesignId } from "../src/generate-design-id.js";
import { runMigrations } from "../src/migrate.js";
import { readMigrationFiles } from "../src/migration-files.js";
import {
  DesignWriteForbiddenError,
  NeonConfigurationRepository,
} from "../src/neon-configuration-repository.js";
import { NeonShareLinkRepository } from "../src/share-link-repository.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { forgetAppliedMigrations } from "./support/migration-ledger-probe.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: this file drops write_token_hash and asserts a whole-table count, neither safe while another run
// uses the test database.
holdExclusiveTestSchemaLock();

const SUITE_NAME =
  "the write-authorisation predicate's live suite (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

/** Designs here are never saved after minting, so a legitimate save states the minted revision. */
const FIRST_REVISION = "1";

const CORRECT_TOKEN_HASH = "c".repeat(64);

/** This file attacks the write-token predicate, never visitor identity, so one well-formed visitor hash suffices. */
const VISITOR_HASH = "e".repeat(64);
const ATTACKER_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  presetId: "overwritten-by-attacker",
};

// Hash shapes that could match if the predicate were built by concatenation, compared case-insensitively,
// trimmed, or evaluated with SQL truthiness rather than equality.
const HOSTILE_HASHES: readonly {
  readonly name: string;
  readonly hash: string;
}[] = [
  { name: "an empty string", hash: "" },
  { name: "a single space", hash: " " },
  {
    name: "the correct hash in upper case",
    hash: CORRECT_TOKEN_HASH.toUpperCase(),
  },
  {
    name: "the correct hash with trailing whitespace",
    hash: `${CORRECT_TOKEN_HASH} `,
  },
  {
    name: "the correct hash with a leading newline",
    hash: `\n${CORRECT_TOKEN_HASH}`,
  },
  { name: "a tautology closing the predicate", hash: "' or '1'='1" },
  { name: "a comment terminating the statement", hash: "x'; --" },
  { name: "a nested select", hash: "' or write_token_hash is not null --" },
  { name: "a SQL NULL literal", hash: "NULL" },
  { name: "a percent wildcard", hash: "%" },
  { name: "an underscore wildcard", hash: "_".repeat(64) },
];

describe("the write-authorisation predicate under attack (live test database)", () => {
  const mintedIds: DesignId[] = [];

  function testRepository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  async function mintTrackingId(
    writeTokenHash: string = CORRECT_TOKEN_HASH,
  ): Promise<DesignId> {
    const { id } = await testRepository().mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash,
      visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
    });
    mintedIds.push(id);
    return id;
  }

  // The whole row — `document` and `updated_at`: a refusal that bumps the timestamp has still written to the row
  // and would keep an abandoned design alive past the retention sweep.
  async function readRow(
    id: DesignId,
  ): Promise<{ document: string; updatedAt: string }> {
    // `updated_at::text`, not the driver's `Date`: a Date has second resolution, so two writes in one second
    // would look identical and every negative assertion would pass vacuously.
    const rows = (await neon(testDatabaseUrl)`
      select document, updated_at::text as updated_at from designs where id = ${id}
    `) as { document: unknown; updated_at: string }[];
    const row = rows[0];
    if (!row) throw new Error(`No row for id "${id}"`);
    return {
      document: JSON.stringify(row.document),
      updatedAt: row.updated_at,
    };
  }

  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  afterEach(async () => {
    if (!hasLiveDatabase || mintedIds.length === 0) return;
    const ids = mintedIds.splice(0, mintedIds.length);
    await neon(testDatabaseUrl)`delete from designs where id = any(${ids})`;
  });

  it.skipIf(!hasLiveDatabase)(
    "moves updated_at when the write IS authorised — the control for every negative below",
    async () => {
      const id = await mintTrackingId();
      const before = await readRow(id);

      await testRepository().saveAuthorized({
        id,
        design: { ...KITCHEN_L_DESIGN, presetId: "authorised" },
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: FIRST_REVISION,
        requestVisitor: { kind: "absent" },
      });

      const after = await readRow(id);
      expect(after.document).not.toBe(before.document);
      // Without this the negatives are vacuous: a column that never moves cannot prove a refusal.
      expect(after.updatedAt).not.toBe(before.updatedAt);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "leaves document AND updated_at byte-identical for every hostile hash shape",
    async () => {
      const id = await mintTrackingId();
      const before = await readRow(id);

      for (const { name, hash } of HOSTILE_HASHES) {
        await expect(
          testRepository().saveAuthorized({
            id,
            design: ATTACKER_DESIGN,
            writeTokenHash: hash,
            expectedRevision: FIRST_REVISION,
            requestVisitor: { kind: "absent" },
          }),
          name,
        ).rejects.toThrow(DesignWriteForbiddenError);

        const after = await readRow(id);
        expect(after.document, `${name} changed the document`).toBe(
          before.document,
        );
        expect(after.updatedAt, `${name} moved updated_at`).toBe(
          before.updatedAt,
        );
      }
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses a hostile id shape without touching any other row",
    async () => {
      const neighbour = await mintTrackingId();
      const before = await readRow(neighbour);

      for (const { name, hash } of HOSTILE_HASHES.slice(0, 4)) {
        await expect(
          testRepository().saveAuthorized({
            id: "' or 1=1 --",
            design: ATTACKER_DESIGN,
            writeTokenHash: hash,
            expectedRevision: FIRST_REVISION,
            requestVisitor: { kind: "absent" },
          }),
          name,
        ).rejects.toThrow(DesignWriteForbiddenError);
      }

      const after = await readRow(neighbour);
      expect(after.document).toBe(before.document);
      expect(after.updatedAt).toBe(before.updatedAt);
    },
    30_000,
  );

  // `mint` accepts only a 64-character lowercase hex SHA-256 digest: `'' = ''` is true, so a row minted with an
  // empty or guessable hash would be writable by anyone presenting the same value.
  const DEGENERATE_HASHES: readonly {
    readonly name: string;
    readonly hash: string;
  }[] = [
    { name: "the empty string — the originally reported hole", hash: "" },
    { name: "a single space", hash: " " },
    { name: "64 spaces", hash: " ".repeat(64) },
    { name: "a short guessable value", hash: "secret" },
    { name: "64 non-hex characters", hash: "z".repeat(64) },
    { name: "63 hex characters", hash: "a".repeat(63) },
    { name: "65 hex characters", hash: "a".repeat(65) },
    { name: "an upper-case digest", hash: "A".repeat(64) },
    { name: "a digest with a trailing space", hash: `${"a".repeat(63)} ` },
  ];

  it.skipIf(!hasLiveDatabase)(
    "refuses to mint on anything that is not a SHA-256 digest, and creates no row",
    async () => {
      const countRows = async () =>
        (
          (await neon(testDatabaseUrl)`
          select count(*)::int as n from designs
        `) as { n: number }[]
        )[0]?.n;
      const before = await countRows();

      for (const { name, hash } of DEGENERATE_HASHES) {
        await expect(
          testRepository().mint({
            design: KITCHEN_L_DESIGN,
            writeTokenHash: hash,
            visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
          }),
          name,
        ).rejects.toThrow(
          /must be a 64-character lowercase hex SHA-256 digest/,
        );
      }

      expect(await countRows()).toBe(before);
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "names no offending value in the refusal, so a bad hash cannot reach a log through it",
    async () => {
      const secret = "not-a-digest-but-still-a-secret";

      const refusal = await testRepository()
        .mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: secret,
          visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(refusal).toBeInstanceOf(Error);
      expect((refusal as Error).message).not.toContain(secret);
    },
  );

  // The check constraint guards paths application code is not on (a manual insert, the restore runbook); only raw
  // SQL past the repository reaches it.
  it.skipIf(!hasLiveDatabase)(
    "refuses a degenerate hash at the database level, not only in application code",
    async () => {
      const sql = neon(testDatabaseUrl);
      const degenerate = [
        "",
        " ",
        "secret",
        "z".repeat(64),
        "A".repeat(64),
        "a".repeat(63),
      ];

      for (const hash of degenerate) {
        const id = `qa-constraint-${String(Date.now())}-${hash.length.toString()}`;
        await expect(
          sql`
            insert into designs (id, schema_version, document, write_token_hash)
            values (${id}, 1, ${KITCHEN_L_DESIGN}, ${hash})
          `,
          `hash of length ${String(hash.length)}`,
        ).rejects.toThrow(/write_token_hash_is_sha256/);
      }
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "still admits NULL, so a pre-0002 row and a restored legacy dump remain insertable",
    async () => {
      const id = `qa-constraint-null-${String(Date.now())}`;
      mintedIds.push(id);

      await expect(
        neon(testDatabaseUrl)`
          insert into designs (id, schema_version, document, write_token_hash)
          values (${id}, 1, ${KITCHEN_L_DESIGN}, null)
        `,
      ).resolves.toBeDefined();

      // NULL means "no credential", which the predicate can never satisfy — it fails closed.
      await expect(
        testRepository().saveAuthorized({
          id,
          design: KITCHEN_L_DESIGN,
          writeTokenHash: "a".repeat(64),
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "keeps two designs' credentials strictly separate in both directions",
    async () => {
      const otherHash = "d".repeat(64);
      const first = await mintTrackingId();
      const second = await mintTrackingId(otherHash);
      const firstBefore = await readRow(first);
      const secondBefore = await readRow(second);

      await expect(
        testRepository().saveAuthorized({
          id: first,
          design: ATTACKER_DESIGN,
          writeTokenHash: otherHash,
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);
      await expect(
        testRepository().saveAuthorized({
          id: second,
          design: ATTACKER_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);

      expect(await readRow(first)).toEqual(firstBefore);
      expect(await readRow(second)).toEqual(secondBefore);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses a concurrent unauthorised write racing an authorised one, and keeps the authorised document",
    async () => {
      const id = await mintTrackingId();
      const authorised: Design = { ...KITCHEN_L_DESIGN, presetId: "owner" };

      const [ownerResult, attackerResult] = await Promise.allSettled([
        testRepository().saveAuthorized({
          id,
          design: authorised,
          writeTokenHash: CORRECT_TOKEN_HASH,
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
        }),
        testRepository().saveAuthorized({
          id,
          design: ATTACKER_DESIGN,
          writeTokenHash: "e".repeat(64),
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ]);

      expect(ownerResult.status).toBe("fulfilled");
      expect(attackerResult.status).toBe("rejected");
      // Read through the repository: `jsonb` does not preserve key order, so raw JSON text would differ spuriously.
      expect(
        canonicalSerializeDesign((await testRepository().load(id)).design),
      ).toBe(canonicalSerializeDesign(authorised));
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "leaves a NULL-hash row unwritable by every hash shape, including the SQL null literal",
    async () => {
      const id = `qa-null-${String(Date.now())}`;
      mintedIds.push(id);
      await neon(testDatabaseUrl)`
        insert into designs (id, schema_version, document, write_token_hash)
        values (${id}, 1, ${KITCHEN_L_DESIGN}, null)
      `;
      const before = await readRow(id);

      for (const { name, hash } of HOSTILE_HASHES) {
        await expect(
          testRepository().saveAuthorized({
            id,
            design: ATTACKER_DESIGN,
            writeTokenHash: hash,
            expectedRevision: FIRST_REVISION,
            requestVisitor: { kind: "absent" },
          }),
          name,
        ).rejects.toThrow(DesignWriteForbiddenError);
      }

      expect(await readRow(id)).toEqual(before);
    },
    30_000,
  );
});

// Checked structurally: a read-then-write has a narrow, nondeterministic TOCTOU window that no test observing
// only outcomes can distinguish from a conditional update.
describe("saveAuthorized is one statement, and the predicate is in it", () => {
  const source = readFileSync(
    resolve(SOURCE_DIR, "neon-configuration-repository.ts"),
    "utf8",
  );

  function bodyOfSaveAuthorized(): string {
    const start = source.indexOf("async saveAuthorized(");
    expect(start, "saveAuthorized must exist to be checked").toBeGreaterThan(0);
    const end = source.indexOf("\n  async load(", start);
    expect(end, "load() must follow saveAuthorized").toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it("issues exactly one query, and that query is the conditional update", () => {
    const body = bodyOfSaveAuthorized();
    const queries = body.match(/this\.sql`/g) ?? [];

    expect(queries).toHaveLength(1);
    expect(body).toMatch(/and write_token_hash = \$\{writeTokenHash\}/);
    // The revision shares the credential's predicate: a second statement would reopen the read-then-write window.
    expect(body).toMatch(/and revision::text = \$\{expectedRevision\}/);
    expect(body).toMatch(/returning revision/);
  });

  it("reads nothing before it writes", () => {
    const body = bodyOfSaveAuthorized().toLowerCase();

    // A `select` is allowed only inside the single statement's own CTE, which shares the update's snapshot; a
    // second query is forbidden by the count above.
    expect(body).toContain("with authorised as (");
    expect(body).not.toContain("this.load(");
    // Postgres compares the hash, so an application-side comparison (timing-safe or not) must not appear.
    expect(body).not.toContain("timingsafeequal");
    expect(body).not.toMatch(/writetokenhash\s*===/);
    expect(body).not.toMatch(/writetokenhash\s*!==/);
  });

  it("interpolates every value through the tagged template, never into SQL text", () => {
    // `sql.query(...)` and string concatenation are the two ways a value could reach SQL unparameterised.
    expect(source).not.toContain("sql.query(");
    expect(source).not.toMatch(/`\s*\+\s*/);
  });
});

// The column is removed and the migration asked to put it back: only a migration that actually executes passes,
// where a no-op `runMigrations` exiting 0 would not (see ADR 0013). The ledger rows are forgotten too, for every
// version from 2 up: the runner refuses a ledger with a hole, so a later recorded migration would wedge the
// shared test database. Read from disk, so a migration added later is in the list without anyone remembering to add it:
// a hand-kept list stopped at 0007 and left 0008 recorded over a forgotten 2 to 7, which wedged the database.
const WRITE_TOKEN_MIGRATION_VERSIONS = readMigrationFiles()
  .map((migration) => migration.version)
  .slice(1);
describe("the write-token migration actually executes", () => {
  const sql = hasLiveDatabase ? neon(testDatabaseUrl) : undefined;

  async function writeTokenColumns(): Promise<{ is_nullable: string }[]> {
    if (!sql) return [];
    return (await sql`
      select is_nullable from information_schema.columns
      where table_name = 'designs' and column_name = 'write_token_hash'
    `) as { is_nullable: string }[];
  }

  it.skipIf(!hasLiveDatabase)(
    "re-adds the column after it is dropped, so a no-op run cannot pass",
    async () => {
      if (!sql) return;
      // Forget the ledger rows before dropping the column, never after: a run killed between the two must leave only
      // a forgotten tail, not a ledger claiming a missing column, which wedges every later run.
      await forgetAppliedMigrations(
        testDatabaseUrl,
        WRITE_TOKEN_MIGRATION_VERSIONS,
      );
      await sql`alter table designs drop column if exists write_token_hash`;
      expect(await writeTokenColumns()).toHaveLength(0);

      const summary = await runMigrations(testDatabaseUrl);
      expect(summary.applied).toEqual([
        "0002_add_write_token_hash.sql",
        "0003_check_write_token_hash_shape.sql",
        "0004_add_design_revision.sql",
        "0005_add_design_visitor_hash.sql",
        "0006_create_design_share_links.sql",
        "0007_create_rate_limit_counters.sql",
        "0008_create_contact_submissions.sql",
        "0009_create_csp_reports.sql",
        "0010_create_contact_submission_views.sql",
      ]);

      const columns = await writeTokenColumns();
      expect(columns).toHaveLength(1);
      // Nullable, so rows predating the write token fail closed rather than being rejected at insert time.
      expect(columns[0]?.is_nullable).toBe("YES");
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "is additive: re-running it preserves the rows and the hashes already stored",
    async () => {
      const { id } = await new NeonConfigurationRepository(
        testDatabaseUrl,
      ).mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
      });
      try {
        // Forgotten first so the migrations re-execute against a populated table; otherwise the ledger skips them.
        await forgetAppliedMigrations(
          testDatabaseUrl,
          WRITE_TOKEN_MIGRATION_VERSIONS,
        );

        await runMigrations(testDatabaseUrl);

        const rows = (await neon(testDatabaseUrl)`
          select write_token_hash from designs where id = ${id}
        `) as { write_token_hash: string | null }[];
        expect(rows[0]?.write_token_hash).toBe(CORRECT_TOKEN_HASH);
      } finally {
        await neon(testDatabaseUrl)`delete from designs where id = ${id}`;
      }
    },
    30_000,
  );
});

// Application code is not the only path to this column (a manual insert, the restore runbook), so the guard is
// proven at the database.
describe("0005's visitor_hash constraint and index, read back live", () => {
  it.skipIf(!hasLiveDatabase)(
    "refuses a degenerate hash at the database level, not only in application code",
    async () => {
      const sql = neon(testDatabaseUrl);
      const degenerate = [
        "",
        " ",
        "secret",
        "z".repeat(64),
        "A".repeat(64),
        "a".repeat(63),
      ];

      for (const hash of degenerate) {
        const id = `qa-visitor-hash-constraint-${String(Date.now())}-${hash.length.toString()}`;
        await expect(
          sql`
            insert into designs (id, schema_version, document, visitor_hash)
            values (${id}, 1, ${KITCHEN_L_DESIGN}, ${hash})
          `,
          `hash of length ${String(hash.length)}`,
        ).rejects.toThrow(/visitor_hash_is_sha256/);
      }
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "still admits NULL, so a pre-0005 row and a restored legacy dump remain insertable",
    async () => {
      const id = `qa-visitor-hash-null-${String(Date.now())}`;
      const sql = neon(testDatabaseUrl);
      try {
        await sql`
          insert into designs (id, schema_version, document, visitor_hash)
          values (${id}, 1, ${KITCHEN_L_DESIGN}, ${null})
        `;
        const rows = (await sql`
          select visitor_hash from designs where id = ${id}
        `) as { visitor_hash: string | null }[];
        expect(rows[0]?.visitor_hash).toBeNull();
      } finally {
        await sql`delete from designs where id = ${id}`;
      }
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "carries the exact index definition D3's resume query needs",
    async () => {
      const rows = (await neon(testDatabaseUrl)`
        select indexdef from pg_indexes
        where tablename = 'designs' and indexname = 'designs_visitor_hash_updated_at_idx'
      `) as { indexdef: string }[];

      expect(rows).toHaveLength(1);
      const indexdef = rows[0]?.indexdef ?? "";
      expect(indexdef).toContain("(visitor_hash, updated_at DESC, id DESC)");
      expect(indexdef).toContain("WHERE (visitor_hash IS NOT NULL)");
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "plans an index scan for D3's resume query, not a sequential one",
    async () => {
      const sql = neon(testDatabaseUrl);
      const probeHash = "f".repeat(64);
      const id = `qa-visitor-hash-index-probe-${String(Date.now())}`;
      try {
        await sql`
          insert into designs (id, schema_version, document, visitor_hash)
          values (${id}, 1, ${KITCHEN_L_DESIGN}, ${probeHash})
        `;

        // A sequential scan can win on a table this small regardless of the index; forcing it off makes "an index scan
        // was chosen" evidence about the index's shape.
        // Both statements in one `sql.transaction(...)`: Neon's HTTP driver commits each bare call separately,
        // so a separate `set local` would silently do nothing.
        const [, plan] = (await sql.transaction([
          sql`set local enable_seqscan = off`,
          sql`
            explain (format json)
            select id from designs where visitor_hash = ${probeHash}
            order by updated_at desc, id desc limit 1
          `,
        ])) as [unknown, { "QUERY PLAN": unknown }[]];

        // "Index Only Scan" is accepted: the index holds visitor_hash, updated_at and id, so no heap fetch is needed.
        const planText = JSON.stringify(plan);
        expect(planText).toMatch(/Index (Only )?Scan/);
        expect(planText).not.toContain("Seq Scan");
        expect(planText).toContain("designs_visitor_hash_updated_at_idx");
      } finally {
        await sql`delete from designs where id = ${id}`;
      }
    },
  );
});

// Application code is not the only path to this table (a manual insert, the restore runbook), so each guarantee
// is proven at the database.
describe("0006's design_share_links table, read back live", () => {
  const DEGENERATE_TOKEN_HASHES = [
    "",
    " ",
    "secret",
    "z".repeat(64),
    "A".repeat(64),
    "a".repeat(63),
  ];

  /** A bare `designs` row for a share-link test to attach to; direct SQL, as this block tests the schema. */
  async function insertDesignForShareLinks(): Promise<string> {
    const id = `qa-0006-design-${String(Date.now())}-${String(Math.random()).slice(2)}`;
    await neon(testDatabaseUrl)`
      insert into designs (id, schema_version, document)
      values (${id}, 1, ${KITCHEN_L_DESIGN})
    `;
    return id;
  }

  it.skipIf(!hasLiveDatabase)(
    "carries token_hash as the primary key, design_id, created_at and revoked_at",
    async () => {
      const columns = (await neon(testDatabaseUrl)`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_name = 'design_share_links'
        order by column_name
      `) as { column_name: string; data_type: string; is_nullable: string }[];

      expect(columns).toEqual([
        {
          column_name: "created_at",
          data_type: "timestamp with time zone",
          is_nullable: "NO",
        },
        { column_name: "design_id", data_type: "text", is_nullable: "NO" },
        {
          column_name: "revoked_at",
          data_type: "timestamp with time zone",
          is_nullable: "YES",
        },
        { column_name: "token_hash", data_type: "text", is_nullable: "NO" },
      ]);

      const primaryKeyColumns = (await neon(testDatabaseUrl)`
        select a.attname
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = 'design_share_links'::regclass and i.indisprimary
      `) as { attname: string }[];

      expect(primaryKeyColumns.map((row) => row.attname)).toEqual([
        "token_hash",
      ]);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "cascades on delete: the design_id foreign key's confdeltype is 'c', not the driver default",
    async () => {
      const foreignKeys = (await neon(testDatabaseUrl)`
        select confdeltype
        from pg_constraint
        where conrelid = 'design_share_links'::regclass and contype = 'f'
      `) as { confdeltype: string }[];

      expect(foreignKeys).toHaveLength(1);
      expect(foreignKeys[0]?.confdeltype).toBe("c");
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses a degenerate token_hash at the database level, not only in application code",
    async () => {
      const sql = neon(testDatabaseUrl);
      const designId = await insertDesignForShareLinks();
      try {
        for (const hash of DEGENERATE_TOKEN_HASHES) {
          await expect(
            sql`
              insert into design_share_links (token_hash, design_id)
              values (${hash}, ${designId})
            `,
            `hash of length ${String(hash.length)}`,
          ).rejects.toThrow(/design_share_links_token_hash_is_sha256/);
        }
      } finally {
        await sql`delete from designs where id = ${designId}`;
      }
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "carries the exact index definition D3's issue transaction needs",
    async () => {
      const rows = (await neon(testDatabaseUrl)`
        select indexdef from pg_indexes
        where tablename = 'design_share_links'
          and indexname = 'design_share_links_one_active_per_design'
      `) as { indexdef: string }[];

      expect(rows).toHaveLength(1);
      const indexdef = rows[0]?.indexdef ?? "";
      expect(indexdef).toContain("UNIQUE INDEX");
      expect(indexdef).toContain("(design_id)");
      expect(indexdef).toContain("WHERE (revoked_at IS NULL)");
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses a second active row for one design, but not a revoked row beside an active one",
    async () => {
      const sql = neon(testDatabaseUrl);
      const designId = await insertDesignForShareLinks();
      const firstHash = "1".repeat(64);
      const secondHash = "2".repeat(64);
      try {
        await sql`
          insert into design_share_links (token_hash, design_id)
          values (${firstHash}, ${designId})
        `;

        await expect(
          sql`
            insert into design_share_links (token_hash, design_id)
            values (${secondHash}, ${designId})
          `,
        ).rejects.toThrow(/design_share_links_one_active_per_design/);

        await sql`
          update design_share_links set revoked_at = now() where token_hash = ${firstHash}
        `;
        await sql`
          insert into design_share_links (token_hash, design_id)
          values (${secondHash}, ${designId})
        `;

        const rows = (await sql`
          select token_hash, revoked_at is null as is_active
          from design_share_links
          where design_id = ${designId}
          order by token_hash
        `) as { token_hash: string; is_active: boolean }[];

        expect(rows).toEqual([
          { token_hash: firstHash, is_active: false },
          { token_hash: secondHash, is_active: true },
        ]);
      } finally {
        await sql`delete from designs where id = ${designId}`;
      }
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "removes a design's share rows when the design itself is deleted",
    async () => {
      const sql = neon(testDatabaseUrl);
      const designId = await insertDesignForShareLinks();
      const tokenHash = "3".repeat(64);
      await sql`
        insert into design_share_links (token_hash, design_id)
        values (${tokenHash}, ${designId})
      `;

      await sql`delete from designs where id = ${designId}`;

      const rows = (await sql`
        select token_hash from design_share_links where token_hash = ${tokenHash}
      `) as { token_hash: string }[];

      expect(rows).toEqual([]);
    },
  );
});

// Lives here, not in a new file: a new live file would have to register a lock mode and move ADR 0128's census.
describe("7E3a QA — mint's visitor-hash guard and resumeVisitor's ordering, live", () => {
  const QA_VISITOR = "7e3a".repeat(16);
  const created: DesignId[] = [];

  function repository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  async function mintFor(visitorHash: string): Promise<DesignId> {
    const { id } = await repository().mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash: CORRECT_TOKEN_HASH,
      visitor: { kind: "fresh", visitorHash },
    });
    created.push(id);
    return id;
  }

  async function insertWithTimes(
    id: string,
    {
      createdHoursAgo,
      updatedHoursAgo,
    }: { createdHoursAgo: number; updatedHoursAgo: number },
  ): Promise<void> {
    created.push(id);
    await neon(testDatabaseUrl)`
      insert into designs (id, schema_version, document, created_at, updated_at, visitor_hash)
      values (${id}, 1, ${KITCHEN_L_DESIGN},
              now() - (${createdHoursAgo} * interval '1 hour'),
              now() - (${updatedHoursAgo} * interval '1 hour'),
              ${QA_VISITOR})
    `;
  }

  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  afterEach(async () => {
    if (!hasLiveDatabase || created.length === 0) return;
    const ids = created.splice(0, created.length);
    await neon(testDatabaseUrl)`delete from designs where id = any(${ids})`;
  });

  it.skipIf(!hasLiveDatabase)(
    "mint refuses every malformed visitor hash, inserts nothing, and names no value in its error",
    async () => {
      const sql = neon(testDatabaseUrl);
      const hostile = [
        "",
        " ",
        QA_VISITOR.toUpperCase(),
        QA_VISITOR.slice(1),
        `${QA_VISITOR} `,
      ];
      const [{ n: before } = { n: -1 }] = (await sql`
        select count(*)::int as n from designs
      `) as { n: number }[];

      for (const visitorHash of hostile) {
        const attempt = repository().mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          visitor: { kind: "fresh", visitorHash },
        });
        await expect(attempt, JSON.stringify(visitorHash)).rejects.toThrow(
          /visitor hash/,
        );
        const message = await attempt.catch((error: unknown) => String(error));
        if (visitorHash.trim() !== "")
          expect(message).not.toContain(visitorHash.trim());
      }

      const [{ n: after } = { n: -2 }] = (await sql`
        select count(*)::int as n from designs
      `) as { n: number }[];
      expect(after).toBe(before);
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "orders by updated_at, not created_at: a row created later but touched earlier loses",
    async () => {
      const stamp = String(Date.now());
      await insertWithTimes(`qa-7e3a-created-late-${stamp}`, {
        createdHoursAgo: 1,
        updatedHoursAgo: 5,
      });
      await insertWithTimes(`qa-7e3a-touched-late-${stamp}`, {
        createdHoursAgo: 9,
        updatedHoursAgo: 2,
      });

      await expect(
        repository().resume({ visitorHash: QA_VISITOR }),
      ).resolves.toEqual({
        kind: "found",
        id: `qa-7e3a-touched-late-${stamp}`,
      });
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "breaks an exact updated_at tie by id, descending",
    async () => {
      const stamp = String(Date.now());
      const sql = neon(testDatabaseUrl);
      const ids = [
        `qa-7e3a-tie-a-${stamp}`,
        `qa-7e3a-tie-b-${stamp}`,
        `qa-7e3a-tie-c-${stamp}`,
      ];
      created.push(...ids);
      await sql`
        insert into designs (id, schema_version, document, updated_at, visitor_hash)
        select i, 1, ${KITCHEN_L_DESIGN}, timestamptz '2026-09-23 12:00:00+00', ${QA_VISITOR}
        from unnest(${ids}::text[]) as i
      `;

      await expect(
        repository().resume({ visitorHash: QA_VISITOR }),
      ).resolves.toEqual({
        kind: "found",
        id: `qa-7e3a-tie-c-${stamp}`,
      });
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "a save moves the saved design ahead, and leaves its visitor_hash untouched (D9)",
    async () => {
      const first = await mintFor(QA_VISITOR);
      const second = await mintFor(QA_VISITOR);
      await neon(testDatabaseUrl)`
        update designs set updated_at = now() - interval '1 hour' where id = ${first}
      `;
      await expect(
        repository().resume({ visitorHash: QA_VISITOR }),
      ).resolves.toEqual({
        kind: "found",
        id: second,
      });

      await repository().saveAuthorized({
        id: first,
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: FIRST_REVISION,
        requestVisitor: { kind: "absent" },
      });

      await expect(
        repository().resume({ visitorHash: QA_VISITOR }),
      ).resolves.toEqual({
        kind: "found",
        id: first,
      });
      const rows = (await neon(testDatabaseUrl)`
        select visitor_hash from designs where id = ${first}
      `) as { visitor_hash: string | null }[];
      expect(rows[0]?.visitor_hash).toBe(QA_VISITOR);
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "hostile hash shapes presented to the lookup match nothing, including NULL-hash rows",
    async () => {
      await mintFor(QA_VISITOR);
      const nullId = `qa-7e3a-null-${String(Date.now())}`;
      created.push(nullId);
      await neon(testDatabaseUrl)`
        insert into designs (id, schema_version, document, visitor_hash)
        values (${nullId}, 1, ${KITCHEN_L_DESIGN}, ${null})
      `;

      for (const hostile of [
        "",
        " ",
        QA_VISITOR.toUpperCase(),
        `${QA_VISITOR} `,
        "%",
        "null",
      ]) {
        await expect(
          repository().resume({ visitorHash: hostile }),
          JSON.stringify(hostile),
        ).resolves.toEqual({ kind: "none" });
      }
    },
    30_000,
  );
});

// `mint` always generates a fresh id, so a genuine retry cannot be driven through it; the tests use the driver itself.
describe("mint rotation — atomicity and retry (Amendment H1, criterion 8)", () => {
  const mintedIds: DesignId[] = [];

  function repository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  async function mintUnder(visitorHash: string): Promise<DesignId> {
    const { id } = await repository().mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash: CORRECT_TOKEN_HASH,
      visitor: { kind: "fresh", visitorHash },
    });
    mintedIds.push(id);
    return id;
  }

  async function visitorHashOf(id: DesignId): Promise<string | null> {
    const rows = (await neon(testDatabaseUrl)`
      select visitor_hash from designs where id = ${id}
    `) as { visitor_hash: string | null }[];
    return rows[0]?.visitor_hash ?? null;
  }

  afterEach(async () => {
    if (!hasLiveDatabase || mintedIds.length === 0) return;
    const ids = mintedIds.splice(0, mintedIds.length);
    await neon(testDatabaseUrl)`delete from designs where id = any(${ids})`;
  });

  /** Neon HTTP `sql.transaction` response shape: array-mode rows named by a parallel `fields` array. */
  interface NeonHttpTransactionResult {
    fields: { name: string }[];
    rows: unknown[][];
  }
  interface NeonHttpTransactionResponseBody {
    results: NeonHttpTransactionResult[];
  }

  function lastRowOf(
    body: NeonHttpTransactionResponseBody,
  ): Record<string, unknown> {
    const result = body.results.at(-1);
    const row = result?.rows[0];
    if (result === undefined || row === undefined)
      throw new Error(
        "the replayed transaction answered no row for its closing select",
      );
    return Object.fromEntries(
      result.fields.map((field, index) => [field.name, row[index]]),
    );
  }

  it.skipIf(!hasLiveDatabase)(
    // `neonConfig.fetchFunction` records the exact request `mint` sends; replaying it unmodified proves the retry
    // production actually issues is idempotent, not a hand-copied SQL shape.
    "the production rotation transaction, replayed live from its own captured wire bytes, answers the same revision twice and leaves one row (S6 criterion 4, L1.1)",
    async () => {
      const oldHash = "20".repeat(32);
      const newHash = "21".repeat(32);
      const existingId = await mintUnder(oldHash);

      const captured: { url: string; init: RequestInit }[] = [];
      const previousFetchFunction: unknown = neonConfig.fetchFunction;
      const realFetch = globalThis.fetch;
      neonConfig.fetchFunction = (url: string, init: RequestInit) => {
        captured.push({ url, init });
        return realFetch(url, init);
      };

      let outcome: { id: DesignId; revision: string };
      try {
        outcome = await repository().mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          visitor: {
            kind: "rotate",
            visitorHash: newHash,
            fromVisitorHash: oldHash,
          },
        });
      } finally {
        neonConfig.fetchFunction = previousFetchFunction;
      }
      mintedIds.push(outcome.id);

      expect(captured).toHaveLength(1);
      const wireRequest = captured[0];
      if (wireRequest === undefined)
        throw new Error("the driver sent no request to capture");

      const replayed = await realFetch(wireRequest.url, wireRequest.init);
      expect(replayed.status).toBe(200);
      const replayedRow = lastRowOf(
        (await replayed.json()) as NeonHttpTransactionResponseBody,
      );

      expect(replayedRow["revision"]).toBe(outcome.revision);

      const rows = (await neon(testDatabaseUrl)`
        select count(*)::int as n from designs where id = ${outcome.id}
      `) as { n: number }[];
      expect(rows[0]?.n).toBe(1);
      expect(await visitorHashOf(existingId)).toBe(newHash);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "a forced failure of the insert leaves every row under the old hash",
    async () => {
      const oldHash = "22".repeat(32);
      const newHash = "23".repeat(32);
      const existingId = await mintUnder(oldHash);
      const sql = neon(testDatabaseUrl);

      await expect(
        sql.transaction(
          [
            sql`
              update designs set visitor_hash = ${newHash}
              where visitor_hash = ${oldHash}
            `,
            // Straight at the driver, bypassing `requireSha256Digest`, so the insert fails at the database
            // (`write_token_hash_is_sha256`, 0003) and not in validation.
            sql`
              insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
              values (${generateDesignId()}, 1, ${KITCHEN_L_DESIGN}, 'not-a-digest', ${newHash})
            `,
          ],
          { isolationLevel: "ReadCommitted" },
        ),
      ).rejects.toThrow(/write_token_hash_is_sha256/);

      // The whole transaction rolled back, including the update that ran first.
      expect(await visitorHashOf(existingId)).toBe(oldHash);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "two concurrent mints from one old value leave no row under it",
    async () => {
      const oldHash = "24".repeat(32);
      const raceWinnerHash = "25".repeat(32);
      const raceLoserHash = "26".repeat(32);
      const existingId = await mintUnder(oldHash);

      const [winner, loser] = await Promise.all([
        repository().mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          visitor: {
            kind: "rotate",
            visitorHash: raceWinnerHash,
            fromVisitorHash: oldHash,
          },
        }),
        repository().mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          visitor: {
            kind: "rotate",
            visitorHash: raceLoserHash,
            fromVisitorHash: oldHash,
          },
        }),
      ]);
      mintedIds.push(winner.id, loser.id);

      const stillUnderOldHash = (await neon(testDatabaseUrl)`
        select count(*)::int as n from designs where visitor_hash = ${oldHash}
      `) as { n: number }[];
      expect(stillUnderOldHash[0]?.n).toBe(0);

      const movedTo = await visitorHashOf(existingId);
      expect([raceWinnerHash, raceLoserHash]).toContain(movedTo);
    },
  );
});

describe("7E3b QA — rotation over a sequence, the gate's predicate, and the R3 races (live)", () => {
  const mintedIds: DesignId[] = [];

  function repository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  function hashNumbered(seed: number, index: number): string {
    return (seed * 16 + index).toString(16).padStart(8, "0").repeat(8);
  }

  interface RawRow {
    document: string;
    revision: string;
    updated_at: string;
    write_token_hash: string | null;
    visitor_hash: string | null;
  }

  async function rawRows(
    ids: readonly DesignId[],
  ): Promise<Map<string, RawRow>> {
    const rows = (await neon(testDatabaseUrl)`
      select id, document::text as document, revision::text as revision,
             updated_at::text as updated_at, write_token_hash, visitor_hash
      from designs where id = any(${ids})
    `) as (RawRow & { id: string })[];
    return new Map(rows.map(({ id, ...row }) => [id, row]));
  }

  async function countUnder(visitorHash: string): Promise<number> {
    const rows = (await neon(testDatabaseUrl)`
      select count(*)::int as n from designs where visitor_hash = ${visitorHash}
    `) as { n: number }[];
    return rows[0]?.n ?? -1;
  }

  afterEach(async () => {
    if (!hasLiveDatabase || mintedIds.length === 0) return;
    const ids = mintedIds.splice(0, mintedIds.length);
    await neon(testDatabaseUrl)`delete from designs where id = any(${ids})`;
  });

  it.skipIf(!hasLiveDatabase)(
    "criterion 5: over 1-5 sequential mints every row follows the newest value, no earlier value owns anything, resume lands on the newest, the moved rows' other columns are byte-identical, and a share link keeps opening",
    async () => {
      let seed = 0x7e3b0;
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (mintCount) => {
          seed += 1;
          const hashes = Array.from({ length: mintCount + 1 }, (_, index) =>
            hashNumbered(seed, index),
          );
          const shareLinks = new NeonShareLinkRepository(testDatabaseUrl);
          const firstId = (
            await repository().mint({
              design: KITCHEN_L_DESIGN,
              writeTokenHash: CORRECT_TOKEN_HASH,
              visitor: { kind: "fresh", visitorHash: hashes[0] ?? "" },
            })
          ).id;
          mintedIds.push(firstId);
          const shareTokenHash = hashNumbered(seed, 15).replace(/^./, "f");
          expect(
            await shareLinks.issue({
              designId: firstId,
              writeTokenHash: CORRECT_TOKEN_HASH,
              visitorHash: hashes[0] ?? "",
              tokenHash: shareTokenHash,
            }),
          ).toBe("issued");
          const ids = [firstId];

          for (let k = 1; k <= mintCount; k++) {
            const before = await rawRows(ids);
            const { id } = await repository().mint({
              design: KITCHEN_L_DESIGN,
              writeTokenHash: CORRECT_TOKEN_HASH,
              visitor: {
                kind: "rotate",
                visitorHash: hashes[k] ?? "",
                fromVisitorHash: hashes[k - 1] ?? "",
              },
            });
            mintedIds.push(id);
            const after = await rawRows(ids);
            for (const earlierId of ids) {
              const was = before.get(earlierId);
              const now = after.get(earlierId);
              expect(now?.visitor_hash).toBe(hashes[k]);
              expect(now?.document).toBe(was?.document);
              expect(now?.revision).toBe(was?.revision);
              expect(now?.updated_at).toBe(was?.updated_at);
              expect(now?.write_token_hash).toBe(was?.write_token_hash);
            }
            ids.push(id);
            for (let earlier = 0; earlier < k; earlier++)
              expect(await countUnder(hashes[earlier] ?? "")).toBe(0);
            await expect(
              repository().resume({ visitorHash: hashes[k] ?? "" }),
            ).resolves.toEqual({ kind: "found", id });
            expect((await shareLinks.loadShared(shareTokenHash)).kind).toBe(
              "found",
            );
          }
          expect(await countUnder(hashes[mintCount] ?? "")).toBe(ids.length);
        }),
        { numRuns: 4 },
      );
    },
    120_000,
  );

  /** Shapes that are neither the owner's hash nor merely another digest; every one must answer `none`. */
  const HOSTILE_VISITOR_HASHES = [
    "",
    " ",
    "NULL",
    "%",
    "_".repeat(64),
    "' or '1'='1",
    "x'; --",
    "' or visitor_hash is not null --",
  ];

  it.skipIf(!hasLiveDatabase)(
    "loadOwned answers none for every hostile shape of the owner's hash, and found for the exact one",
    async () => {
      const ownerHash = "3a".repeat(32);
      const { id } = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: { kind: "fresh", visitorHash: ownerHash },
      });
      mintedIds.push(id);

      const shapes = [
        ...HOSTILE_VISITOR_HASHES,
        ownerHash.toUpperCase(),
        `${ownerHash} `,
        `\n${ownerHash}`,
        ownerHash.slice(0, 63),
        `${ownerHash}0`,
      ];
      for (const visitorHash of shapes)
        await expect(
          repository().loadOwned({ id, accessor: { visitorHash } }),
          JSON.stringify(visitorHash),
        ).resolves.toEqual({ kind: "none" });
      for (const hostileId of ["%", "_".repeat(id.length), `${id}' or '1'='1`])
        await expect(
          repository().loadOwned({
            id: hostileId,
            accessor: { visitorHash: ownerHash },
          }),
          hostileId,
        ).resolves.toEqual({ kind: "none" });
      expect(
        (
          await repository().loadOwned({
            id,
            accessor: { visitorHash: ownerHash },
          })
        ).kind,
      ).toBe("found");
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "a rotation moves no pre-0005 row (visitor_hash null) and no other browser's row",
    async () => {
      const oldHash = "3b".repeat(32);
      const otherHash = "3c".repeat(32);
      const orphanId = generateDesignId();
      await neon(testDatabaseUrl)`
        insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
        values (${orphanId}, 1, ${KITCHEN_L_DESIGN}, ${CORRECT_TOKEN_HASH}, null)
      `;
      mintedIds.push(orphanId);
      const otherId = (
        await repository().mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          visitor: { kind: "fresh", visitorHash: otherHash },
        })
      ).id;
      mintedIds.push(otherId);
      mintedIds.push(
        (
          await repository().mint({
            design: KITCHEN_L_DESIGN,
            writeTokenHash: CORRECT_TOKEN_HASH,
            visitor: { kind: "fresh", visitorHash: oldHash },
          })
        ).id,
      );

      mintedIds.push(
        (
          await repository().mint({
            design: KITCHEN_L_DESIGN,
            writeTokenHash: CORRECT_TOKEN_HASH,
            visitor: {
              kind: "rotate",
              visitorHash: "3d".repeat(32),
              fromVisitorHash: oldHash,
            },
          })
        ).id,
      );

      const rows = await rawRows([orphanId, otherId]);
      expect(rows.get(orphanId)?.visitor_hash).toBeNull();
      expect(rows.get(otherId)?.visitor_hash).toBe(otherHash);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    // A raw client holds the rotation's row lock open so the save's UPDATE genuinely blocks on it, as two concurrent
    // requests would; a sequential mint, rotate, save would duplicate a case in neon-configuration-repository.test.ts.
    "R3, a save racing a genuinely concurrent rotation: the save's own UPDATE blocks on the rotation's row lock, then answers ownsVisitor: false (S6 criterion 7 residual)",
    async () => {
      const oldHash = "47".repeat(32);
      const newHash = "48".repeat(32);
      const minted = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: { kind: "fresh", visitorHash: oldHash },
      });
      mintedIds.push(minted.id);

      const rotationHolder = new Client(testDatabaseUrl);
      await rotationHolder.connect();
      try {
        await rotationHolder.query("begin");
        // The rotation's own move, held open — the row lock the save's own UPDATE blocks on below.
        await rotationHolder.query(
          "update designs set visitor_hash = $1 where visitor_hash = $2",
          [newHash, oldHash],
        );

        const savePromise = repository().saveAuthorized({
          id: minted.id,
          design: { ...KITCHEN_L_DESIGN, presetId: "raced-save" },
          writeTokenHash: CORRECT_TOKEN_HASH,
          expectedRevision: minted.revision,
          requestVisitor: { kind: "present", visitorHash: oldHash },
        });

        // Long enough for the save's own request to reach Postgres and block on the lock above,
        // well short of anything that would let it give up and answer on its own.
        await new Promise((resolveWait) => setTimeout(resolveWait, 500));
        await rotationHolder.query("commit");

        expect((await savePromise).ownsVisitor).toBe(false);
      } finally {
        await rotationHolder.end();
      }

      const row = (await rawRows([minted.id])).get(minted.id);
      expect(row?.visitor_hash).toBe(newHash);
      expect(JSON.parse(row?.document ?? "{}")).toMatchObject({
        presetId: "raced-save",
      });
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "R3, two concurrent mints from one old value: each mint's own new row is readable under the value that mint issued",
    async () => {
      const oldHash = "3f".repeat(32);
      const firstHash = "40".repeat(32);
      const secondHash = "41".repeat(32);
      const existingId = (
        await repository().mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          visitor: { kind: "fresh", visitorHash: oldHash },
        })
      ).id;
      mintedIds.push(existingId);

      const [first, second] = await Promise.all(
        [firstHash, secondHash].map((visitorHash) =>
          repository().mint({
            design: KITCHEN_L_DESIGN,
            writeTokenHash: CORRECT_TOKEN_HASH,
            visitor: { kind: "rotate", visitorHash, fromVisitorHash: oldHash },
          }),
        ),
      );
      mintedIds.push(first?.id ?? "", second?.id ?? "");

      expect(
        (
          await repository().loadOwned({
            id: first?.id ?? "",
            accessor: { visitorHash: firstHash },
          })
        ).kind,
      ).toBe("found");
      expect(
        (
          await repository().loadOwned({
            id: second?.id ?? "",
            accessor: { visitorHash: secondHash },
          })
        ).kind,
      ).toBe("found");
      expect(await countUnder(oldHash)).toBe(0);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    // A rotate mint always draws a fresh value regardless of `fromVisitorHash`, so a planted P that owns no row
    // moves nothing and reaches nothing.
    "S6 criterion 4: a planted P owns nothing, so an attacker's mint from it gets its own fresh value and reads nothing of the victim's",
    async () => {
      const ownerHash = "44".repeat(32);
      const plantedP = "45".repeat(32);
      const attackerHash = "46".repeat(32);

      const victim = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: { kind: "fresh", visitorHash: ownerHash },
      });
      mintedIds.push(victim.id);

      const attacker = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: {
          kind: "rotate",
          visitorHash: attackerHash,
          fromVisitorHash: plantedP,
        },
      });
      mintedIds.push(attacker.id);

      expect((await rawRows([victim.id])).get(victim.id)?.visitor_hash).toBe(
        ownerHash,
      );
      expect(
        (
          await repository().loadOwned({
            id: victim.id,
            accessor: { visitorHash: attackerHash },
          })
        ).kind,
      ).toBe("none");
      expect(
        (
          await repository().loadOwned({
            id: attacker.id,
            accessor: { visitorHash: ownerHash },
          })
        ).kind,
      ).toBe("none");
    },
  );
});
