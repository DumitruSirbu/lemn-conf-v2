import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalSerializeDesign,
  DesignNotFoundError,
  InvalidDesignError,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { generateDesignId } from "../src/generate-design-id.js";
import { runMigrations } from "../src/migrate.js";
import { readMigrationFiles } from "../src/migration-files.js";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
  NeonConfigurationRepository,
} from "../src/neon-configuration-repository.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { forgetAppliedMigrations } from "./support/migration-ledger-probe.js";
import { holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";

// Exclusive: this file drops the revision column, and no other run may use the test database
// while it is missing.
holdExclusiveTestSchemaLock();

const SUITE_NAME =
  "the configuration repository's live suite (live test database)";

// Never the application database: `liveTestDatabaseUrl` throws rather than resolving to it, and
// these tests insert and delete rows.
const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

// CI configures no application database URL on purpose, so the not-the-application's-own check
// runs only where both URLs exist. It is not the file's gate: every other test needs only the test one.
const hasApplicationDatabaseUrl =
  (process.env["DATABASE_URL"]?.trim() ?? "") !== "";

const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

// Opaque stand-ins for SHA-256 hex digests: the repository never hashes, it only compares what it
// is handed against what the row holds.
const CORRECT_TOKEN_HASH = "a".repeat(64);
const WRONG_TOKEN_HASH = "b".repeat(64);

const VISITOR_HASH = "d".repeat(64);

// What `0004_add_design_revision.sql` gives every row. Stated, not read back, so a changed default
// fails these tests instead of being followed by them.
const FIRST_REVISION = "1";

describe("NeonConfigurationRepository (live test database)", () => {
  const mintedIds: DesignId[] = [];

  async function mintTracking(
    repository: NeonConfigurationRepository,
    design: Design = KITCHEN_L_DESIGN,
    writeTokenHash: string = CORRECT_TOKEN_HASH,
  ): Promise<{ id: DesignId; revision: string }> {
    const minted = await repository.mint({
      design,
      writeTokenHash,
      visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
    });
    mintedIds.push(minted.id);
    return minted;
  }

  async function mintTrackingId(
    repository: NeonConfigurationRepository,
    design: Design = KITCHEN_L_DESIGN,
    writeTokenHash: string = CORRECT_TOKEN_HASH,
  ): Promise<DesignId> {
    return (await mintTracking(repository, design, writeTokenHash)).id;
  }

  async function loadedDesign(
    repository: NeonConfigurationRepository,
    id: DesignId,
  ): Promise<Design> {
    return (await repository.load(id)).design;
  }

  // Inserted directly: the repository can no longer create a row without a write token.
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
      const loaded = await loadedDesign(repository, id);

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

      const saved = await repository.saveAuthorized({
        id,
        design: updated,
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: FIRST_REVISION,
        requestVisitor: { kind: "absent" },
      });
      const loaded = await loadedDesign(repository, id);

      expect(saved.id).toBe(id);
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
      const before = canonicalSerializeDesign(
        await loadedDesign(repository, id),
      );

      await expect(
        repository.saveAuthorized({
          id,
          design: { ...KITCHEN_L_DESIGN, presetId: "attacker-preset" },
          writeTokenHash: WRONG_TOKEN_HASH,
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);

      expect(canonicalSerializeDesign(await loadedDesign(repository, id))).toBe(
        before,
      );
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
      await mintTrackingId(repository, KITCHEN_L_DESIGN, WRONG_TOKEN_HASH);
      const before = canonicalSerializeDesign(
        await loadedDesign(repository, victimId),
      );

      await expect(
        repository.saveAuthorized({
          id: victimId,
          design: { ...KITCHEN_L_DESIGN, presetId: "cross-design-preset" },
          writeTokenHash: WRONG_TOKEN_HASH,
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);

      expect(
        canonicalSerializeDesign(await loadedDesign(repository, victimId)),
      ).toBe(before);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses a save to an id no row carries, with the same error an unauthorised save gets",
    async () => {
      const repository = testRepository();

      // Unknown and wrong-credential must be indistinguishable, or the write path is an existence
      // oracle for design ids.
      await expect(
        repository.saveAuthorized({
          id: "does-not-exist-00000000",
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
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

      const loaded = await loadedDesign(repository, id);
      expect(canonicalSerializeDesign(loaded)).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );

      // `null = $hash` is never true in SQL, so a tokenless row fails closed.
      await expect(
        repository.saveAuthorized({
          id,
          design: { ...KITCHEN_L_DESIGN, presetId: "legacy-overwrite" },
          writeTokenHash: CORRECT_TOKEN_HASH,
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);
      expect(canonicalSerializeDesign(await loadedDesign(repository, id))).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );
    },
  );

  // `""` and `" "` matter most: SQL compares by equality, so a row stored with either is writable
  // by anyone presenting the same value.
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
        testRepository().mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: hash,
          visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
        }),
      ).rejects.toThrow(/64-character lowercase hex SHA-256 digest/);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "does not repeat the rejected hash back in the error it throws",
    async () => {
      const rejected = "' or '1'='1";

      await expect(
        testRepository().mint({
          design: KITCHEN_L_DESIGN,
          writeTokenHash: rejected,
          visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
        }),
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
      const { id } = await repository.mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
      });

      const sql = neon(testDatabaseUrl);
      await sql`delete from designs where id = ${id}`;

      await expect(repository.load(id)).rejects.toThrow(DesignNotFoundError);
    },
  );

  it.skipIf(!hasLiveDatabase || !hasApplicationDatabaseUrl)(
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

describe("saveAuthorized revisions (WEB-003)", () => {
  const mintedIds: DesignId[] = [];
  const REVISION_AFTER_ONE_SAVE = "2";

  function testRepository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  async function mintTracking(
    repository: NeonConfigurationRepository,
    writeTokenHash: string = CORRECT_TOKEN_HASH,
  ): Promise<{ id: DesignId; revision: string }> {
    const minted = await repository.mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash,
      visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
    });
    mintedIds.push(minted.id);
    return minted;
  }

  function designNamed(presetId: string): Design {
    return { ...KITCHEN_L_DESIGN, presetId };
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
    "mints a design at the first revision, so its very first save has something to expect",
    async () => {
      const minted = await mintTracking(testRepository());

      expect(minted.revision).toBe(FIRST_REVISION);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "lets the first of two saves from one revision win, and refuses the second without writing it",
    async () => {
      const repository = testRepository();
      const { id, revision } = await mintTracking(repository);
      const firstTab = designNamed("saved-by-the-first-tab");
      const secondTab = designNamed("saved-by-the-second-tab");

      const saved = await repository.saveAuthorized({
        id,
        design: firstTab,
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: revision,
        requestVisitor: { kind: "absent" },
      });
      await expect(
        repository.saveAuthorized({
          id,
          design: secondTab,
          writeTokenHash: CORRECT_TOKEN_HASH,
          expectedRevision: revision,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteConflictError);

      expect(saved.revision).toBe(REVISION_AFTER_ONE_SAVE);
      const stored = await repository.load(id);
      expect(canonicalSerializeDesign(stored.design)).toBe(
        canonicalSerializeDesign(firstTab),
      );
      expect(stored.revision).toBe(REVISION_AFTER_ONE_SAVE);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "advances the revision exactly once per successful save",
    async () => {
      const repository = testRepository();
      const { id, revision } = await mintTracking(repository);

      const first = await repository.saveAuthorized({
        id,
        design: designNamed("first"),
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: revision,
        requestVisitor: { kind: "absent" },
      });
      const second = await repository.saveAuthorized({
        id,
        design: designNamed("second"),
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: first.revision,
        requestVisitor: { kind: "absent" },
      });
      const third = await repository.saveAuthorized({
        id,
        design: designNamed("third"),
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: second.revision,
        requestVisitor: { kind: "absent" },
      });

      expect([
        revision,
        first.revision,
        second.revision,
        third.revision,
      ]).toEqual(["1", "2", "3", "4"]);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "does not advance the revision when a save is refused",
    async () => {
      const repository = testRepository();
      const { id, revision } = await mintTracking(repository);

      await expect(
        repository.saveAuthorized({
          id,
          design: designNamed("stale"),
          writeTokenHash: CORRECT_TOKEN_HASH,
          expectedRevision: "9999",
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteConflictError);

      expect((await repository.load(id)).revision).toBe(revision);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "answers the wrong credential with the forbidden refusal whatever revision it claims",
    async () => {
      // A conflict is reported only to a caller whose token matched. The current revision is the
      // sharpest case: the one claim that would otherwise be "correct except for the token".
      const repository = testRepository();
      const { id, revision } = await mintTracking(repository);

      for (const claimed of [revision, "9999", "1"]) {
        await expect(
          repository.saveAuthorized({
            id,
            design: designNamed("attacker"),
            writeTokenHash: WRONG_TOKEN_HASH,
            expectedRevision: claimed,
            requestVisitor: { kind: "absent" },
          }),
        ).rejects.toThrow(DesignWriteForbiddenError);
      }

      expect(canonicalSerializeDesign((await repository.load(id)).design)).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "answers an unknown id with the forbidden refusal, never the conflict one",
    async () => {
      await expect(
        testRepository().saveAuthorized({
          id: "does-not-exist-00000000",
          design: KITCHEN_L_DESIGN,
          writeTokenHash: CORRECT_TOKEN_HASH,
          expectedRevision: FIRST_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);
    },
  );

  // Every caller-supplied shape must produce a refusal, never a database error surfacing as a 500.
  // `''` and the tautology are the sharp ones: compared as a number, one raises and the other could match.
  const NON_REVISION_VALUES: readonly { name: string; value: string }[] = [
    { name: "an empty string", value: "" },
    { name: "a single space", value: " " },
    { name: "a SQL tautology", value: "' or '1'='1" },
    { name: "scientific notation", value: "1e0" },
    { name: "a leading-zero digit run", value: "01" },
    { name: "a negative number", value: "-1" },
    { name: "a value wider than bigint", value: "9".repeat(40) },
  ];

  it.skipIf(!hasLiveDatabase).each(NON_REVISION_VALUES)(
    "refuses a save whose expected revision is $name, and writes nothing",
    async ({ value }) => {
      const repository = testRepository();
      const { id } = await mintTracking(repository);

      await expect(
        repository.saveAuthorized({
          id,
          design: designNamed("malformed-revision"),
          writeTokenHash: CORRECT_TOKEN_HASH,
          expectedRevision: value,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteConflictError);

      expect(canonicalSerializeDesign((await repository.load(id)).design)).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "reports the revision a design was read at, so a loader can write it back safely",
    async () => {
      const repository = testRepository();
      const { id, revision } = await mintTracking(repository);

      expect((await repository.load(id)).revision).toBe(revision);
    },
  );
});

describe("saveAuthorized's ownership column (Amendment H3)", () => {
  const mintedIds: DesignId[] = [];
  const OWNER_HASH = "18".repeat(32);
  const STRANGER_HASH = "19".repeat(32);

  function testRepository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
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
    "answers true when the request's visitor value is the row's own",
    async () => {
      const repository = testRepository();
      const { id, revision } = await repository.mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: { kind: "fresh", visitorHash: OWNER_HASH },
      });
      mintedIds.push(id);

      const saved = await repository.saveAuthorized({
        id,
        design: { ...KITCHEN_L_DESIGN, presetId: "owned-save" },
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: revision,
        requestVisitor: { kind: "present", visitorHash: OWNER_HASH },
      });

      expect(saved.ownsVisitor).toBe(true);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "answers false for a foreign visitor value, and for no cookie at all",
    async () => {
      const repository = testRepository();
      const { id, revision } = await repository.mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: { kind: "fresh", visitorHash: OWNER_HASH },
      });
      mintedIds.push(id);

      const foreign = await repository.saveAuthorized({
        id,
        design: { ...KITCHEN_L_DESIGN, presetId: "foreign-cookie-save" },
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: revision,
        requestVisitor: { kind: "present", visitorHash: STRANGER_HASH },
      });
      expect(foreign.ownsVisitor).toBe(false);

      const cookieless = await repository.saveAuthorized({
        id,
        design: { ...KITCHEN_L_DESIGN, presetId: "cookieless-save" },
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: foreign.revision,
        requestVisitor: { kind: "absent" },
      });
      expect(cookieless.ownsVisitor).toBe(false);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "answers false for the value a rotation already moved away from (Amendment H3's own reason)",
    async () => {
      const repository = testRepository();
      const { id, revision } = await repository.mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: { kind: "fresh", visitorHash: OWNER_HASH },
      });
      mintedIds.push(id);
      const rotatedHash = "1a".repeat(32);
      const { id: rotatedMintId } = await repository.mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: {
          kind: "rotate",
          visitorHash: rotatedHash,
          fromVisitorHash: OWNER_HASH,
        },
      });
      mintedIds.push(rotatedMintId);

      const staleSave = await repository.saveAuthorized({
        id,
        design: { ...KITCHEN_L_DESIGN, presetId: "stale-cookie-save" },
        writeTokenHash: CORRECT_TOKEN_HASH,
        expectedRevision: revision,
        requestVisitor: { kind: "present", visitorHash: OWNER_HASH },
      });

      // The write token alone authorises the save: it must land although the visitor value was rotated.
      expect(staleSave.revision).not.toBe(revision);
      expect(staleSave.ownsVisitor).toBe(false);
    },
  );
});

describe("resumeVisitor (D3)", () => {
  const mintedIds: DesignId[] = [];

  function testRepository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  async function mintWithVisitor(visitorHash: string): Promise<DesignId> {
    const { id } = await testRepository().mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash: CORRECT_TOKEN_HASH,
      visitor: { kind: "fresh", visitorHash },
    });
    mintedIds.push(id);
    return id;
  }

  async function setUpdatedAt(id: DesignId, hoursAgo: number): Promise<void> {
    await neon(testDatabaseUrl)`
      update designs set updated_at = now() - (${hoursAgo} * interval '1 hour')
      where id = ${id}
    `;
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
    "answers none for a hash no row carries",
    async () => {
      const lookup = await testRepository().resumeVisitor(VISITOR_HASH);

      expect(lookup).toEqual({ kind: "none" });
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "answers the visitor's most recently updated design, not the oldest",
    async () => {
      const olderId = await mintWithVisitor(VISITOR_HASH);
      await setUpdatedAt(olderId, 2);
      const newerId = await mintWithVisitor(VISITOR_HASH);
      await setUpdatedAt(newerId, 1);

      const lookup = await testRepository().resumeVisitor(VISITOR_HASH);

      expect(lookup).toEqual({ kind: "found", id: newerId });
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "never returns another visitor's design, or one whose hash is null",
    async () => {
      const otherVisitorHash = "9".repeat(64);
      await mintWithVisitor(otherVisitorHash);
      const nullHashId = await mintWithVisitor(VISITOR_HASH);
      // A pre-0005 row, simulated: `mint` can no longer create one, so null the hash directly.
      await neon(testDatabaseUrl)`
        update designs set visitor_hash = null where id = ${nullHashId}
      `;
      const mineId = await mintWithVisitor(VISITOR_HASH);

      const lookup = await testRepository().resumeVisitor(VISITOR_HASH);

      expect(lookup).toEqual({ kind: "found", id: mineId });
    },
  );
});

describe("mint rotation (Amendment H1)", () => {
  const mintedIds: DesignId[] = [];

  function testRepository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  async function mintFresh(visitorHash: string): Promise<DesignId> {
    const { id } = await testRepository().mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash: CORRECT_TOKEN_HASH,
      visitor: { kind: "fresh", visitorHash },
    });
    mintedIds.push(id);
    return id;
  }

  async function rowFor(id: DesignId): Promise<{
    document: string;
    revision: string;
    updated_at: string;
    write_token_hash: string | null;
    visitor_hash: string | null;
  }> {
    const rows = (await neon(testDatabaseUrl)`
      select document, revision::text as revision, updated_at::text as updated_at,
             write_token_hash, visitor_hash
      from designs where id = ${id}
    `) as {
      document: unknown;
      revision: string;
      updated_at: string;
      write_token_hash: string | null;
      visitor_hash: string | null;
    }[];
    const row = rows[0];
    if (!row) throw new Error(`No row for id "${id}"`);
    return { ...row, document: JSON.stringify(row.document) };
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
    "moves the browser's row to the fresh value, and resume follows the newly minted design there",
    async () => {
      const oldHash = "10".repeat(32);
      const newHash = "11".repeat(32);
      const id = await mintFresh(oldHash);

      // Rotation is a side effect of minting; resume then answers the new design, being the newest.
      const { id: newId } = await testRepository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: {
          kind: "rotate",
          visitorHash: newHash,
          fromVisitorHash: oldHash,
        },
      });
      mintedIds.push(newId);

      expect((await rowFor(id)).visitor_hash).toBe(newHash);
      await expect(testRepository().resumeVisitor(oldHash)).resolves.toEqual({
        kind: "none",
      });
      await expect(testRepository().resumeVisitor(newHash)).resolves.toEqual({
        kind: "found",
        id: newId,
      });
      await expect(
        testRepository().loadOwned({ id, visitorHash: newHash }),
      ).resolves.toMatchObject({ kind: "found" });
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "leaves document, revision, updated_at and write_token_hash untouched by a rotation",
    async () => {
      const oldHash = "12".repeat(32);
      const newHash = "13".repeat(32);
      const id = await mintFresh(oldHash);
      const before = await rowFor(id);

      const { id: newId } = await testRepository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: {
          kind: "rotate",
          visitorHash: newHash,
          fromVisitorHash: oldHash,
        },
      });
      mintedIds.push(newId);

      const after = await rowFor(id);
      expect(after.document).toBe(before.document);
      expect(after.revision).toBe(before.revision);
      expect(after.updated_at).toBe(before.updated_at);
      expect(after.write_token_hash).toBe(before.write_token_hash);
      expect(after.visitor_hash).not.toBe(before.visitor_hash);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "a fresh mint moves no other design's visitor_hash, so a plain mint issues no UPDATE",
    async () => {
      const untouchedHash = "14".repeat(32);
      const untouchedId = await mintFresh(untouchedHash);

      await mintFresh("15".repeat(32));

      expect((await rowFor(untouchedId)).visitor_hash).toBe(untouchedHash);
    },
  );
});

describe("loadOwned (Amendment H2)", () => {
  const mintedIds: DesignId[] = [];
  const OWNER_HASH = "16".repeat(32);
  const STRANGER_HASH = "17".repeat(32);

  function testRepository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
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
    "answers found, with the design and revision, for the owning visitor hash",
    async () => {
      const { id } = await testRepository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: { kind: "fresh", visitorHash: OWNER_HASH },
      });
      mintedIds.push(id);

      const outcome = await testRepository().loadOwned({
        id,
        visitorHash: OWNER_HASH,
      });

      expect(outcome.kind).toBe("found");
      if (outcome.kind !== "found") throw new Error("unreachable");
      expect(canonicalSerializeDesign(outcome.design)).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );
      expect(outcome.revision).toBe(FIRST_REVISION);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "answers none for a foreign visitor hash",
    async () => {
      const { id } = await testRepository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: CORRECT_TOKEN_HASH,
        visitor: { kind: "fresh", visitorHash: OWNER_HASH },
      });
      mintedIds.push(id);

      await expect(
        testRepository().loadOwned({ id, visitorHash: STRANGER_HASH }),
      ).resolves.toEqual({ kind: "none" });
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "answers none for a pre-0005 row, whose visitor_hash is null",
    async () => {
      const id = await insertTokenlessOwnerlessRow();

      await expect(
        testRepository().loadOwned({ id, visitorHash: OWNER_HASH }),
      ).resolves.toEqual({ kind: "none" });
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "answers none for an id no row carries",
    async () => {
      await expect(
        testRepository().loadOwned({
          id: "does-not-exist-00000000",
          visitorHash: OWNER_HASH,
        }),
      ).resolves.toEqual({ kind: "none" });
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "raises InvalidDesignError for the owner's own invalid document, but answers none for a stranger",
    async () => {
      const id = await insertInvalidDocumentRow(OWNER_HASH);

      await expect(
        testRepository().loadOwned({ id, visitorHash: OWNER_HASH }),
      ).rejects.toThrow(InvalidDesignError);
      await expect(
        testRepository().loadOwned({ id, visitorHash: STRANGER_HASH }),
      ).resolves.toEqual({ kind: "none" });
    },
  );

  // Inserted directly: `mint` can no longer create a row without a visitor.
  async function insertTokenlessOwnerlessRow(): Promise<DesignId> {
    const id = generateDesignId();
    await neon(testDatabaseUrl)`
      insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
      values (${id}, 1, ${KITCHEN_L_DESIGN}, ${CORRECT_TOKEN_HASH}, null)
    `;
    mintedIds.push(id);
    return id;
  }

  // Inserted directly: `mint` never accepts a document that fails `migrateDesign`'s validation.
  async function insertInvalidDocumentRow(
    visitorHash: string,
  ): Promise<DesignId> {
    const id = generateDesignId();
    await neon(testDatabaseUrl)`
      insert into designs (id, schema_version, document, write_token_hash, visitor_hash)
      values (${id}, 1, ${{}}, ${CORRECT_TOKEN_HASH}, ${visitorHash})
    `;
    mintedIds.push(id);
    return id;
  }
});

describe("the design-revision migration (WEB-003)", () => {
  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  it.skipIf(!hasLiveDatabase)(
    "adds revision as a non-null bigint defaulting to the first revision",
    async () => {
      const columns = (await neon(testDatabaseUrl)`
        select data_type, is_nullable, column_default
        from information_schema.columns
        where table_name = 'designs' and column_name = 'revision'
      `) as {
        data_type: string;
        is_nullable: string;
        column_default: string | null;
      }[];

      expect(columns).toHaveLength(1);
      expect(columns[0]?.data_type).toBe("bigint");
      // Nullable would make a design permanently unwritable: `revision = $1` is never true for NULL.
      expect(columns[0]?.is_nullable).toBe("NO");
      expect(columns[0]?.column_default).toBe(FIRST_REVISION);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "backfills rows that already existed, rather than leaving them without a revision",
    async () => {
      // Proves the file, not state a previous run left: drop the column, insert a pre-migration row,
      // then make the runner apply the migration again.
      const sql = neon(testDatabaseUrl);
      const legacyId = generateDesignId();
      try {
        // Forget the ledger rows before dropping the column, never after: a run killed in between then
        // leaves only a forgotten tail that the next `runMigrations` re-applies. The other order leaves
        // the ledger claiming a missing column and wedges every later run.
        // Forget every version from REVISION_VERSION up: forgetting 4 while a later migration stays
        // recorded is a gap the runner refuses.
        await forgetAppliedMigrations(
          testDatabaseUrl,
          REVISION_AND_LATER_VERSIONS,
        );
        await sql`alter table designs drop column if exists revision`;
        await sql`
          insert into designs (id, schema_version, document, write_token_hash)
          values (${legacyId}, 1, ${KITCHEN_L_DESIGN}, ${"c".repeat(64)})
        `;

        const summary = await runMigrations(testDatabaseUrl);

        expect(summary.applied).toEqual(REVISION_AND_LATER_FILE_NAMES);
        const rows = (await sql`
          select revision::text as revision from designs where id = ${legacyId}
        `) as { revision: string }[];
        expect(rows[0]?.revision).toBe(FIRST_REVISION);
      } finally {
        // Unconditional: a dropped column or forgotten ledger row wedges every other suite sharing
        // this database.
        await runMigrations(testDatabaseUrl);
        await sql`delete from designs where id = ${legacyId}`;
      }
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "is skipped on a re-run, so a second migrate neither fails nor duplicates the column",
    async () => {
      const summary = await runMigrations(testDatabaseUrl);
      expect(summary.applied).toEqual([]);
      expect(summary.alreadyApplied).toContain("0004_add_design_revision.sql");

      const columns = (await neon(testDatabaseUrl)`
        select column_name from information_schema.columns
        where table_name = 'designs' and column_name = 'revision'
      `) as { column_name: string }[];
      expect(columns).toHaveLength(1);
    },
  );
});

/** The version `0004_add_design_revision.sql` occupies in the ledger. */
const REVISION_VERSION = 4;

// Read from disk, not listed: a stale literal list here is destructive (a forgotten ledger row
// with a later one still recorded is a gap the runner refuses), not merely wrong.
const REVISION_AND_LATER_FILES = readMigrationFiles().filter(
  (migration) => migration.version >= REVISION_VERSION,
);
const REVISION_AND_LATER_VERSIONS = REVISION_AND_LATER_FILES.map(
  (migration) => migration.version,
);
const REVISION_AND_LATER_FILE_NAMES = REVISION_AND_LATER_FILES.map(
  (migration) => migration.fileName,
);

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

    // Pins against a time-of-check/time-of-use split: the credential and the expected revision
    // must both live in the `update` itself.
    expect(source).toMatch(
      /update designs[\s\S]*?and write_token_hash = \$\{writeTokenHash\}[\s\S]*?and revision::text = \$\{expectedRevision\}[\s\S]*?returning revision/,
    );
    // The one allowed read is the CTE inside the update's own statement, sharing its snapshot;
    // `saveAuthorized` must issue exactly one query (counted in the adversarial test file).
    expect(source).toMatch(
      /with authorised as \([\s\S]*?select 1 from designs[\s\S]*?\), updated as \([\s\S]*?update designs/,
    );
  });
});
