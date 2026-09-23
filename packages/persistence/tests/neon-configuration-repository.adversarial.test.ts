// Adversarial QA for M3 Wave 3C-2a, the authorisation predicate itself.
//
// The implementer's suite proves the predicate refuses a wrong hash and leaves `document` alone.
// This file attacks what that leaves open: the *other* column a refused write could move, the shapes
// of hash a caller can supply that are neither "right" nor "obviously wrong", and the structural
// claim that there is no read before the write — which no black-box test can observe, because a
// read-then-write with a narrow enough window behaves identically until it does not.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { neon, neonConfig } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { generateDesignId } from "../src/generate-design-id.js";
import { runMigrations } from "../src/migrate.js";
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

// Exclusive: this file drops write_token_hash and asserts a whole-table count, and neither is
// safe while another run uses the test database (M7 wave 7T, T-J5).
holdExclusiveTestSchemaLock();

const SUITE_NAME =
  "the write-authorisation predicate's live suite (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

/** Every design in this file is minted and then attacked without ever being saved, so the revision
 *  a legitimate save would state is the one the mint produced. */
const FIRST_REVISION = "1";

const CORRECT_TOKEN_HASH = "c".repeat(64);

/** This file attacks the write-token predicate, never visitor identity, so every mint needs one
 *  well-formed visitor hash and nothing more. */
const VISITOR_HASH = "e".repeat(64);
const ATTACKER_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  presetId: "overwritten-by-attacker",
};

/** Every hash shape an attacker can present that is not simply "a different digest". Each one is a
 *  way a predicate could be coaxed into matching if it were built by string concatenation, compared
 *  case-insensitively, trimmed, or evaluated with SQL's own truthiness rather than by equality. */
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

  /** The whole row as the database holds it — `document` **and** `updated_at`. A refusal that left
   *  the document alone but bumped the timestamp would still have written to the row, and would
   *  still be visible to anything that reads `updated_at` (ADR 0019 decision 7's retention sweep
   *  reads exactly this column, so a bumped timestamp keeps an abandoned design alive forever). */
  async function readRow(
    id: DesignId,
  ): Promise<{ document: string; updatedAt: string }> {
    // `updated_at::text` rather than the driver's `Date`: a `Date` stringifies to second
    // resolution, so two writes inside the same second would look identical and every negative
    // assertion below would pass without proving anything.
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

  // R1 QA-D, flipped — and the fix went further than the finding asked. The reported hole was `''`
  // (`'' = ''` is true, so such a row is writable by anyone presenting an empty hash). `mint` now
  // requires a **64-character lowercase hex SHA-256 digest**, which closes the reported case and the
  // whole class of guessable values around it, including the whitespace shape I flagged as an open
  // boundary. Unreachable through the route either way — `mintWriteToken` always yields a digest —
  // but the port's contract is that an unauthorised write is unrepresentable, and a predicate
  // satisfiable by a guessable value is the hole in exactly that claim.
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

      // A refusal that let the row land anyway would be worthless.
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

  it.skipIf(!hasLiveDatabase)(
    "still mints on a real digest, so the guard rejects nothing legitimate",
    async () => {
      const id = await mintTrackingId();

      expect(id).toBeTruthy();
      expect(
        canonicalSerializeDesign((await testRepository().load(id)).design),
      ).toBe(canonicalSerializeDesign(KITCHEN_L_DESIGN));
    },
  );

  // The question behind QA-D, answered against the live column rather than argued: which values
  // satisfy `write_token_hash = ''` trivially? Exactly one — in Postgres `text`, `''` is the only
  // value equal to `''`. Whitespace is not blank-padded away, case is significant, a trailing space
  // is significant, and `''` is not NULL. So the "equivalent to empty" class the mint guard had to
  // cover has a single member, and the digest check above is comfortably wider than it needs to be.
  //
  // This is not a fact about SQL in the abstract — it is a fact about this **column's type**. On
  // `char(n)` the comparison is blank-padded and `'' = ' '` is true, which would make the guard
  // insufficient overnight. That is why it is asserted against the live column rather than argued.
  it.skipIf(!hasLiveDatabase)(
    "has exactly one value equal to the empty hash, which is why refusing '' is enough",
    async () => {
      const [equality] = (await neon(testDatabaseUrl)`
        select
          (' ' = '') as space_equals_empty,
          ('  ' = ' ') as padding_is_significant,
          ('a' = 'A') as case_insensitive,
          ('a ' = 'a') as trailing_space_ignored,
          ('' is null) as empty_is_null
      `) as {
        space_equals_empty: boolean;
        padding_is_significant: boolean;
        case_insensitive: boolean;
        trailing_space_ignored: boolean;
        empty_is_null: boolean;
      }[];

      expect(equality?.space_equals_empty).toBe(false);
      expect(equality?.padding_is_significant).toBe(false);
      expect(equality?.case_insensitive).toBe(false);
      expect(equality?.trailing_space_ignored).toBe(false);
      expect(equality?.empty_is_null).toBe(false);

      // And the column really is `text`, not a blank-padded `char(n)` where the above would flip.
      const [column] = (await neon(testDatabaseUrl)`
        select data_type from information_schema.columns
        where table_name = 'designs' and column_name = 'write_token_hash'
      `) as { data_type: string }[];
      expect(column?.data_type).toBe("text");
    },
  );

  // R3.4. `requireSha256Digest` guards the application's path; the check constraint guards the
  // paths application code is not on — a manual insert, and the restore runbook. Asserted by
  // driving raw SQL past the repository, which is the only way to reach the constraint at all.
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
      // Read back through the repository so the comparison is canonical: `jsonb` does not preserve
      // key order, so comparing raw JSON text would fail for a reason that has nothing to do with
      // authorisation.
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

// The invariant the milestone says "must not be softened", checked structurally rather than
// behaviourally. A read-then-write cannot be distinguished from a conditional update by any test
// that observes only outcomes — the TOCTOU window is narrow and non-deterministic, and a suite that
// waited to observe it would be flaky rather than adversarial. So the claim is checked where it is
// actually decidable: in the source.
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
    // WEB-003: the revision belongs in the same predicate as the credential. Written as a second
    // statement it would be a read-then-write, which is the very window this whole file exists to
    // deny — one tab could pass the check and lose the row to the other between the two.
    expect(body).toMatch(/and revision::text = \$\{expectedRevision\}/);
    expect(body).toMatch(/returning revision/);
  });

  it("reads nothing before it writes", () => {
    const body = bodyOfSaveAuthorized().toLowerCase();

    // A `select` is allowed **only** inside the single statement's own CTE, which shares the
    // update's snapshot — that is what lets a conflict be told apart from a refusal without a
    // second round trip that could see a different row. Anything outside it would be a read the
    // update does not see, so what is forbidden is a second query, and the count above is what
    // forbids it.
    expect(body).toContain("with authorised as (");
    expect(body).not.toContain("this.load(");
    // A comparison in application code is the other shape this must not take: the hash is compared
    // by Postgres, so there is nothing here to make timing-safe (and nothing here that is not).
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

// Lead 7, in its strongest form. Asserting that the column exists proves nothing about the
// migration: it would pass on a database where someone had added the column by hand, and it would
// pass on a run where `runMigrations` did nothing at all — which is precisely the failure ADR 0013
// records (`pnpm run migrate` exiting 0 having migrated nothing, on a checkout whose path contains
// a space, as this one's does). So the column is **removed** and the migration is asked to put it
// back. Only a migration that actually executes can pass this.
//
// Since Wave S10 the runner keeps a ledger and skips what it has already applied, so the ledger
// rows for the write-token migrations are forgotten alongside the column. That is not a weakening:
// the test now proves the stronger thing, that what the runner executes is decided by the ledger
// and not by luck. Both files are forgotten, not just 0002, because 0003's check constraint went
// with the dropped column and because leaving 0003 recorded while 0002 is not is exactly the gap
// the runner refuses.
//
// **Every version from 2 upward, not only 2 and 3** (WEB-003). The runner refuses a ledger with a
// hole in it, so forgetting 2 while a later migration stays recorded is itself the gap — it wedges
// the shared test database rather than re-running the migration under test. Anything added after
// 0004 belongs in this list for the same reason. `0005` joined it for exactly that reason, and `0006`
// for the same reason again.
const WRITE_TOKEN_MIGRATION_VERSIONS = [2, 3, 4, 5, 6];
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
      // Forget the ledger rows before dropping the column, never after: killed between the two, a
      // run leaves only a forgotten tail, which the next `runMigrations` re-applies and re-records.
      // The other order leaves the ledger claiming a column that is gone, which is BACKLOG 69's
      // second error and wedges every later run (review finding R1.2).
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
      ]);

      const columns = await writeTokenColumns();
      expect(columns).toHaveLength(1);
      // Nullable, so pre-ADR-0019 rows fail closed rather than being rejected at insert time.
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
        // Forgotten first, so the migrations genuinely re-execute against a table that already
        // holds rows. Without this the ledger would skip them and the assertion below would be
        // true of a run that did nothing at all.
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

// M7 wave 7E3a, S1: `0005_add_design_visitor_hash.sql`'s constraint and index, read back live —
// the same argument as the write-token constraint tests above. Application code is not the only
// path to this column (a manual insert, the restore runbook), so the guard has to be proven at the
// database, not only in `mint`'s own validation.
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

        // A sequential scan can win the planner's cost estimate on a table this small regardless of
        // the index, which would make the plan look right for the wrong reason. Forcing it off is
        // what makes "an index scan was chosen" evidence about the index rather than about the
        // table's size — the contract is that the shape supports one, not that the planner always
        // picks it.
        //
        // **Both statements inside one `sql.transaction(...)`, never two bare calls.** Neon's HTTP
        // driver opens a fresh implicit transaction for every plain `sql\`...\`` call, so a `set
        // local` issued that way is scoped to a transaction that has already committed by the time
        // a second call runs its own — the setting would silently do nothing, and review round 1
        // caught exactly that (L1.1). `transaction()` submits both queries over one connection, so
        // the session-local setting from the first is still in effect for the `explain` beside it.
        const [, plan] = (await sql.transaction([
          sql`set local enable_seqscan = off`,
          sql`
            explain (format json)
            select id from designs where visitor_hash = ${probeHash}
            order by updated_at desc, id desc limit 1
          `,
        ])) as [unknown, { "QUERY PLAN": unknown }[]];

        // "Index Only Scan", not "Index Scan": the index's own columns are `visitor_hash`,
        // `updated_at` and `id`, so the query above (`select id ... where visitor_hash = ...`) is
        // answered from the index alone, with no heap fetch. Both are index scans; only the
        // narrower one is what the planner actually picks here, which is stronger evidence for the
        // index's shape, not weaker.
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

// M7 wave 7E3c, S1: `0006_create_design_share_links.sql`'s table, constraint, foreign key and index,
// read back live — the same argument as the write-token and visitor-hash constraint tests above.
// Application code is not the only path to this table (a manual insert, the restore runbook), so
// every guarantee below is proven at the database. **Written for the mini-gate's post-apply run
// (§3) and not run by this implementer**: `0006` reaches no database, including the test one, until
// the security reviewer has read it and the coordinator has run the migration suite once.
describe("0006's design_share_links table, read back live", () => {
  const DEGENERATE_TOKEN_HASHES = [
    "",
    " ",
    "secret",
    "z".repeat(64),
    "A".repeat(64),
    "a".repeat(63),
  ];

  /** A bare `designs` row with no share links yet, for a share-link test to attach to and delete
   *  when it is done. Direct SQL, as the visitor-hash block above inserts directly, because this
   *  describe block is about the schema and not about `NeonConfigurationRepository`. */
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

// M7 wave 7E3a adversarial QA: D2's guard on `mint`, D3's ordering at its edges (a tie, created vs
// updated, a save jumping ahead) and hostile hash shapes presented to the lookup. Here, not in a new
// file, because a new live file would have to register a lock mode and move ADR 0128's census.
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

      await expect(repository().resumeVisitor(QA_VISITOR)).resolves.toEqual({
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

      await expect(repository().resumeVisitor(QA_VISITOR)).resolves.toEqual({
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
      await expect(repository().resumeVisitor(QA_VISITOR)).resolves.toEqual({
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

      await expect(repository().resumeVisitor(QA_VISITOR)).resolves.toEqual({
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
          repository().resumeVisitor(hostile),
          JSON.stringify(hostile),
        ).resolves.toEqual({ kind: "none" });
      }
    },
    30_000,
  );
});

/**
 * M7 wave 7E3b, adversarial QA for D1 / ADR 0114 Amendment H1's own retry and atomicity claim
 * (criterion 8). `mint`'s public surface always generates a fresh id, so a genuine retry cannot be
 * driven through it directly; the shape `mintStatements` submits is reproduced here with the driver
 * itself, exactly as `0005`'s and `0006`'s own blocks drive raw SQL past the repository to prove a
 * database-level guarantee no double can stand in for.
 */
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

  /** The wire shape `@neondatabase/serverless` POSTs for `sql.transaction([...])`, and the shape
   *  its response carries back — array-mode rows, named by a parallel `fields` array — reused here
   *  only to decode the replay's own answer, never to build a request by hand. */
  interface NeonHttpTransactionResult {
    fields: { name: string }[];
    rows: unknown[][];
  }
  interface NeonHttpTransactionResponseBody {
    results: NeonHttpTransactionResult[];
  }

  /** Reads the last statement's first row as an object, keyed by its own `fields` — the columns
   *  `mintStatements`'s closing `select` names, whatever order the driver put them in. */
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
    // L1.1: earlier versions of this test retyped `mintStatements`'s SQL by hand, which had
    // already drifted from the production shape once. Retyping it again would only be as
    // trustworthy as this file's own transcription. Instead, `neonConfig.fetchFunction` — the same
    // seam `retry-on-compute-restart.test.ts` stubs offline — is pointed at the real network here,
    // so it can *record* the exact request `mint` sends without changing what is sent. That
    // captured request is then POSTed again, live, unmodified: the retry this test proves
    // idempotent is the one production code actually issues, not a copy of it.
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

      // The retry: the exact bytes production sent, POSTed a second time, live.
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
            // Bypasses `requireSha256Digest` by going straight at the driver — the only way to make
            // this statement fail without also making the insert's own well-formedness the thing
            // under test. `write_token_hash_is_sha256` (`0003`) refuses it at the database.
            sql`
              insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
              values (${generateDesignId()}, 1, ${KITCHEN_L_DESIGN}, 'not-a-digest', ${newHash})
            `,
          ],
          { isolationLevel: "ReadCommitted" },
        ),
      ).rejects.toThrow(/write_token_hash_is_sha256/);

      // The whole transaction rolled back, including the update that ran first — one Postgres
      // transaction, not three independent statements.
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

/**
 * M7 wave 7E3b adversarial QA (the second pass, after S4): criterion 5 as a property over a
 * sequence of real mints, the gate's predicate against hostile hash shapes, and the two races the
 * plan records as R3 — measured here rather than assumed.
 */
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
              repository().resumeVisitor(hashes[k] ?? ""),
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

  /** Shapes a caller could present as the visitor hash that are neither the owner's nor simply a
   *  different digest — every one must answer `none`, including the owner's hash in another case,
   *  padded, or wrapped in SQL. */
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
          repository().loadOwned({ id, visitorHash }),
          JSON.stringify(visitorHash),
        ).resolves.toEqual({ kind: "none" });
      for (const hostileId of ["%", "_".repeat(id.length), `${id}' or '1'='1`])
        await expect(
          repository().loadOwned({ id: hostileId, visitorHash: ownerHash }),
          hostileId,
        ).resolves.toEqual({ kind: "none" });
      expect(
        (await repository().loadOwned({ id, visitorHash: ownerHash })).kind,
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
    // L1.2: `Promise.all` left the two requests' arrival order to the database scheduler, so
    // whichever one actually reached the table first was never controlled — and the assertion
    // that followed, `typeof save.ownsVisitor === "boolean"`, is true of `true` and `false` alike
    // and so proved nothing about which one it was. Forcing the rotation to commit first, then
    // issuing the save, pins the one order H3 makes a claim about and lets the test state it: a
    // save carrying the value the rotation just moved away from owns nothing.
    "R3, a save racing a rotation: with the rotation committed first, the save never writes visitor_hash back, the save still lands, and it answers ownsVisitor: false (S6 criterion 7 residual, L1.2)",
    async () => {
      for (let attempt = 0; attempt < 6; attempt++) {
        const oldHash = hashNumbered(0x3e000 + attempt, 0);
        const newHash = hashNumbered(0x3e000 + attempt, 1);
        const minted = await repository().mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          visitor: { kind: "fresh", visitorHash: oldHash },
        });
        mintedIds.push(minted.id);

        const rotation = await repository().mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          visitor: {
            kind: "rotate",
            visitorHash: newHash,
            fromVisitorHash: oldHash,
          },
        });
        mintedIds.push(rotation.id);

        // The rotation has already committed — awaited above — so this save's own `oldHash` is
        // stale before it is ever sent.
        const save = await repository().saveAuthorized({
          id: minted.id,
          design: {
            ...KITCHEN_L_DESIGN,
            presetId: `race-${String(attempt)}`,
          },
          writeTokenHash: CORRECT_TOKEN_HASH,
          expectedRevision: minted.revision,
          requestVisitor: { kind: "present", visitorHash: oldHash },
        });

        expect(await countUnder(oldHash)).toBe(0);
        const row = (await rawRows([minted.id])).get(minted.id);
        expect(row?.visitor_hash).toBe(newHash);
        expect(JSON.parse(row?.document ?? "{}")).toMatchObject({
          presetId: `race-${String(attempt)}`,
        });
        expect(save.ownsVisitor).toBe(false);
      }
    },
    120_000,
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
            visitorHash: firstHash,
          })
        ).kind,
      ).toBe("found");
      expect(
        (
          await repository().loadOwned({
            id: second?.id ?? "",
            visitorHash: secondHash,
          })
        ).kind,
      ).toBe("found");
      expect(await countUnder(oldHash)).toBe(0);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    // S6 criterion 4's third bullet, kept against random rotation (H1/H6) rather than deleted with
    // H4: under plain random rotation there is no derivation to attack — a rotate mint always draws
    // a fresh value regardless of what `fromVisitorHash` names — so a planted `P` that owns no row
    // moves nothing and reaches nothing, which this test measures directly rather than assumes.
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

      // The victim's row never moved — nothing owned `plantedP`, so the `update` matched no row.
      expect((await rawRows([victim.id])).get(victim.id)?.visitor_hash).toBe(
        ownerHash,
      );
      expect(
        (
          await repository().loadOwned({
            id: victim.id,
            visitorHash: attackerHash,
          })
        ).kind,
      ).toBe("none");
      expect(
        (
          await repository().loadOwned({
            id: attacker.id,
            visitorHash: ownerHash,
          })
        ).kind,
      ).toBe("none");
    },
  );
});
