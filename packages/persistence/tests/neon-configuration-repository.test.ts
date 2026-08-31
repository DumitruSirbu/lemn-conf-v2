import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalSerializeDesign,
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { generateDesignId } from "../src/generate-design-id.js";
import { runMigrations } from "../src/migrate.js";
import {
  DesignWriteForbiddenError,
  NeonConfigurationRepository,
} from "../src/neon-configuration-repository.js";
import { resolveTestDatabaseUrl } from "../src/test-database-url.js";

const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);
const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

// Stand-ins for the SHA-256 hex digests the web layer derives from a real write token. The
// repository never hashes anything itself — it only ever compares what it is handed against what
// the row holds — so opaque distinct strings exercise the predicate exactly as real digests would.
const CORRECT_TOKEN_HASH = "a".repeat(64);
const WRONG_TOKEN_HASH = "b".repeat(64);

// Never the application database — `resolveTestDatabaseUrl` throws rather than resolving to it.
// These tests insert and delete rows; pointed at the app's own database they would eventually
// destroy real customer designs.
const testDatabaseUrl = hasLiveDatabase ? resolveTestDatabaseUrl() : "";

describe("NeonConfigurationRepository (live test database)", () => {
  // Rows these tests mint, deleted after each test. Without this the suite is not repeatable in the
  // F.I.R.S.T. sense — every run would leave orphans and the table would grow without bound.
  const mintedIds: DesignId[] = [];

  async function mintTrackingId(
    repository: NeonConfigurationRepository,
    design: Design = KITCHEN_L_DESIGN,
    writeTokenHash: string = CORRECT_TOKEN_HASH,
  ): Promise<DesignId> {
    const id = await repository.mint(design, writeTokenHash);
    mintedIds.push(id);
    return id;
  }

  /** A row as it exists before ADR 0019: no write token at all. Inserted directly, because the
   *  repository has no way left to create one. */
  async function insertTokenlessRow(): Promise<DesignId> {
    const id = generateDesignId();
    await neon(testDatabaseUrl)`
      insert into designs (id, schema_version, document, write_token_hash)
      values (${id}, 1, ${KITCHEN_L_DESIGN}, null)
    `;
    mintedIds.push(id);
    return id;
  }

  function testRepository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  afterEach(async () => {
    if (!hasLiveDatabase || mintedIds.length === 0) return;
    const sql = neon(testDatabaseUrl);
    const ids = mintedIds.splice(0, mintedIds.length);
    await sql`delete from designs where id = any(${ids})`;
  });

  it.skipIf(!hasLiveDatabase)(
    "round-trips a design through mint(...) and load(id) with identical canonical serialisation",
    async () => {
      const repository = testRepository();

      const id = await mintTrackingId(repository);
      const loaded = await repository.load(id);

      expect(canonicalSerializeDesign(loaded)).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "overwrites the row when saveAuthorized is called with the design's own write-token hash",
    async () => {
      const repository = testRepository();
      const id = await mintTrackingId(repository);
      const updated = { ...KITCHEN_L_DESIGN, presetId: "updated-preset" };

      const returnedId = await repository.saveAuthorized({
        id,
        design: updated,
        writeTokenHash: CORRECT_TOKEN_HASH,
      });
      const loaded = await repository.load(id);

      expect(returnedId).toBe(id);
      expect(canonicalSerializeDesign(loaded)).toBe(
        canonicalSerializeDesign(updated),
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "stores only the hash of the write token, never a token the database could replay",
    async () => {
      const repository = testRepository();
      const id = await mintTrackingId(repository);

      const rows = (await neon(testDatabaseUrl)`
        select write_token_hash from designs where id = ${id}
      `) as { write_token_hash: string | null }[];

      expect(rows[0]?.write_token_hash).toBe(CORRECT_TOKEN_HASH);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses a save carrying the wrong write-token hash, and writes nothing",
    async () => {
      const repository = testRepository();
      const id = await mintTrackingId(repository);
      const before = canonicalSerializeDesign(await repository.load(id));

      await expect(
        repository.saveAuthorized({
          id,
          design: { ...KITCHEN_L_DESIGN, presetId: "attacker-preset" },
          writeTokenHash: WRONG_TOKEN_HASH,
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);

      // The refusal is worthless if the row moved anyway, and a rejected promise says nothing about
      // the row — so the row itself is what is asserted.
      expect(canonicalSerializeDesign(await repository.load(id))).toBe(before);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses a save carrying another design's write-token hash, and writes nothing",
    async () => {
      const repository = testRepository();
      const victimId = await mintTrackingId(
        repository,
        KITCHEN_L_DESIGN,
        CORRECT_TOKEN_HASH,
      );
      // A second design, minted normally, whose own credential must not reach across to the first.
      await mintTrackingId(repository, KITCHEN_L_DESIGN, WRONG_TOKEN_HASH);
      const before = canonicalSerializeDesign(await repository.load(victimId));

      await expect(
        repository.saveAuthorized({
          id: victimId,
          design: { ...KITCHEN_L_DESIGN, presetId: "cross-design-preset" },
          writeTokenHash: WRONG_TOKEN_HASH,
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);

      expect(canonicalSerializeDesign(await repository.load(victimId))).toBe(
        before,
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses a save to an id no row carries, with the same error an unauthorised save gets",
    async () => {
      const repository = testRepository();

      // Identical rejection for "unknown" and "wrong credential": the conditional update cannot
      // tell them apart, and nothing above it may be able to either, or the write path becomes an
      // existence oracle for design ids.
      await expect(
        repository.saveAuthorized({
          id: "does-not-exist-00000000",
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);
      await expect(repository.load("does-not-exist-00000000")).rejects.toThrow(
        DesignNotFoundError,
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "leaves a pre-ADR-0019 row with a null write token readable but not writable",
    async () => {
      const repository = testRepository();
      const id = await insertTokenlessRow();

      const loaded = await repository.load(id);
      expect(canonicalSerializeDesign(loaded)).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );

      // `null = $hash` is never true in SQL, so a tokenless row fails closed rather than open.
      // There is no hash anyone can present that satisfies the predicate.
      await expect(
        repository.saveAuthorized({
          id,
          design: { ...KITCHEN_L_DESIGN, presetId: "legacy-overwrite" },
          writeTokenHash: CORRECT_TOKEN_HASH,
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);
      expect(canonicalSerializeDesign(await repository.load(id))).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );
    },
  );

  // Every shape that is not a SHA-256 digest, refused as a class rather than one discovered value
  // at a time. `""` and `" "` are the ones with the sharpest teeth: SQL compares them by equality,
  // so a row stored with either is writable by anyone who presents the same value.
  const NON_DIGEST_HASHES: readonly {
    readonly name: string;
    readonly hash: string;
  }[] = [
    { name: "an empty string", hash: "" },
    { name: "a single space", hash: " " },
    { name: "whitespace only", hash: "   \t  " },
    { name: "a short hex string", hash: "abc123" },
    { name: "an upper-case digest", hash: "A".repeat(64) },
    { name: "64 non-hex characters", hash: "z".repeat(64) },
    { name: "a digest with trailing whitespace", hash: `${"a".repeat(64)} ` },
    { name: "a digest with a leading newline", hash: `\n${"a".repeat(64)}` },
    { name: "65 hex characters", hash: "a".repeat(65) },
    { name: "a SQL tautology", hash: "' or '1'='1" },
  ];

  it.skipIf(!hasLiveDatabase).each(NON_DIGEST_HASHES)(
    "refuses to mint a design whose write-token hash is $name",
    async ({ hash }) => {
      await expect(
        testRepository().mint(KITCHEN_L_DESIGN, hash),
      ).rejects.toThrow(/64-character lowercase hex SHA-256 digest/);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "does not repeat the rejected hash back in the error it throws",
    async () => {
      const rejected = "' or '1'='1";

      await expect(
        testRepository().mint(KITCHEN_L_DESIGN, rejected),
      ).rejects.not.toThrow(rejected);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "throws DesignNotFoundError for a random nonexistent id",
    async () => {
      const repository = testRepository();

      await expect(repository.load("does-not-exist-00000000")).rejects.toThrow(
        DesignNotFoundError,
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "leaves no row behind once its own cleanup has run",
    async () => {
      const repository = testRepository();
      const id = await repository.mint(KITCHEN_L_DESIGN, CORRECT_TOKEN_HASH);

      const sql = neon(testDatabaseUrl);
      await sql`delete from designs where id = ${id}`;

      await expect(repository.load(id)).rejects.toThrow(DesignNotFoundError);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "targets a database that is not the application's own",
    () => {
      const applicationDatabase = new URL(process.env["DATABASE_URL"] ?? "")
        .pathname;
      expect(new URL(testDatabaseUrl).pathname).not.toBe(applicationDatabase);
    },
  );
});

describe("the write-token migration", () => {
  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  it.skipIf(!hasLiveDatabase)(
    "actually adds write_token_hash to designs, asserted against the catalogue rather than an exit code",
    async () => {
      // `pnpm run migrate` once exited 0 having migrated nothing (ADR 0013), so a zero exit status
      // is not evidence a migration ran. The catalogue is.
      const columns = (await neon(testDatabaseUrl)`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_name = 'designs' and column_name = 'write_token_hash'
      `) as { data_type: string; is_nullable: string }[];

      expect(columns).toHaveLength(1);
      expect(columns[0]?.data_type).toBe("text");
      // Nullable is the deliberate choice: pre-existing rows carry null and fail closed.
      expect(columns[0]?.is_nullable).toBe("YES");
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses a non-digest hash at the database, not only in application code",
    async () => {
      // `requireSha256Digest` is not on the path a manual insert or a restore takes, so the rule
      // is stated where the data lives as well.
      const sql = neon(testDatabaseUrl);

      await expect(
        sql`
          insert into designs (id, schema_version, document, write_token_hash)
          values (${generateDesignId()}, 1, ${KITCHEN_L_DESIGN}, 'not-a-digest')
        `,
      ).rejects.toThrow(/write_token_hash_is_sha256/);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "still accepts a null hash, so pre-ADR-0019 rows survive the constraint",
    async () => {
      const sql = neon(testDatabaseUrl);
      const id = generateDesignId();

      await sql`
        insert into designs (id, schema_version, document, write_token_hash)
        values (${id}, 1, ${KITCHEN_L_DESIGN}, null)
      `;
      await sql`delete from designs where id = ${id}`;
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "is skipped on a re-run, so a second migrate neither fails nor duplicates the column",
    async () => {
      // Before Wave S10 this asserted idempotence, because every file re-executed on every run.
      // The ledger now skips what is already applied, so the guarantee it pins is the stronger one:
      // a second run reports having applied nothing and leaves the column exactly as it was.
      const summary = await runMigrations(testDatabaseUrl);
      expect(summary.applied).toEqual([]);

      const columns = (await neon(testDatabaseUrl)`
        select column_name from information_schema.columns
        where table_name = 'designs' and column_name = 'write_token_hash'
      `) as { column_name: string }[];

      expect(columns).toHaveLength(1);
    },
  );
});

describe("NeonConfigurationRepository connection setup", () => {
  it("never disables TLS in its own connection-string handling", () => {
    const sourceFiles = [
      "read-database-url.ts",
      "neon-configuration-repository.ts",
    ].map((fileName) => readFileSync(resolve(SOURCE_DIR, fileName), "utf8"));

    for (const source of sourceFiles) {
      expect(source).not.toMatch(/sslmode\s*=\s*disable/i);
      expect(source).not.toMatch(/rejectUnauthorized\s*:\s*false/i);
    }
  });

  it("enforces authorisation in the update statement rather than in a preceding read", () => {
    const source = readFileSync(
      resolve(SOURCE_DIR, "neon-configuration-repository.ts"),
      "utf8",
    );

    // A time-of-check/time-of-use split is the specific regression this pins: the predicate must
    // live in the `update` itself, and no `select` may exist to authorise a write ahead of it.
    expect(source).toMatch(
      /update designs[\s\S]*?where id = \$\{id\} and write_token_hash = \$\{writeTokenHash\}[\s\S]*?returning id/,
    );
    expect(source).not.toMatch(/select[\s\S]*?write_token_hash/i);
  });
});
