// Adversarial QA for R3.1: a restore that silently stripped edit access from every design.
//
// The export's column list is now right, and a test asserting that list would pass. It would also
// have passed *before* the fix if it had asserted the old list — the defect was never that the code
// disagreed with itself, it was that the round trip lost a property nobody round-tripped. So this
// file does the whole loop against the live test database: mint a design with a real token, export
// it through the production row source, destroy the row, restore it through the runbook's own
// statement, and then **use the original token to write**. That last step is the property that was
// broken, and nothing short of performing it proves the fix.
//
// The restore statement below is copied from `docs/runbooks/design-db-restore.md`. Copying it is
// the point: the runbook is what a person runs at 3 a.m., and it was half of the defect.
import { createHash } from "node:crypto";

import {
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createNeonDesignRowSource } from "../src/design-row-source.js";
import type { DesignBackupRow } from "../src/design-row-source.js";
import { runMigrations } from "../src/migrate.js";
import {
  DesignWriteForbiddenError,
  NeonConfigurationRepository,
} from "../src/neon-configuration-repository.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { readAllDesignRows } from "./support/read-all-design-rows.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: this file mints rows and needs the schema intact, but tolerates other shared runs
// (M7 wave 7T, T-J5).
holdSharedTestSchemaLock();

/** A restored row carries the revision its dump held, and every dump in this suite predates the
 *  revision column — so what comes back is the migration's backfill. */
const RESTORED_REVISION = "1";

/** This file is about write-token edit access, not visitor identity, so every mint that is not
 *  itself the visitor_hash round-trip below needs one well-formed visitor hash and nothing more. */
const VISITOR_HASH = "c".repeat(64);

const SUITE_NAME =
  "a backup round trip preserves edit access (live test database)";

const hasLiveDatabase = isLiveTestDatabaseConfigured;
const testDatabaseUrl = liveTestDatabaseUrl;
if (!hasLiveDatabase) announceSkippedLiveSuite(SUITE_NAME);

/** Exactly what `apps/web/src/lib/server/write-token.ts` does, reproduced so the test holds a real
 *  token and can present it after the restore. */
function hashWriteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** `backup-designs.ts`'s `toNdjson`, for one row. */
function toNdjsonLine(row: DesignBackupRow): string {
  return `${JSON.stringify(row)}\n`;
}

describe(SUITE_NAME, () => {
  const mintedIds: DesignId[] = [];
  const sql = hasLiveDatabase ? neon(testDatabaseUrl) : undefined;

  function repository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  /**
   * The runbook's restore statement (`docs/runbooks/design-db-restore.md`, "Restore"), marks, owner link and name included. Not verbatim in
   * two respects: the runbook script migrates each row with `migrateDesign` and stores `CURRENT_SCHEMA_VERSION`, where
   * this stores the dump's document at version 1 as the earlier copy did; and it runs inside the script's own loop.
   * The statement text itself, columns and conflict clause, is the runbook's, and
   * `design-row-source.statements.test.ts` pins that the runbook's text restores every column the backup exports.
   */
  async function restoreRow(line: string): Promise<void> {
    if (!sql) return;
    const row = JSON.parse(line) as {
      id: string;
      schema_version: number;
      document: unknown;
      created_at: string;
      updated_at: string;
      write_token_hash?: string | null;
      visitor_hash?: string | null;
      sent_at?: string | null;
      hidden_by_client_at?: string | null;
      deleted_by_client_at?: string | null;
      account_id?: string | null;
      name?: string | null;
    };
    await sql`
      insert into designs (id, schema_version, document, created_at, updated_at, write_token_hash,
                            visitor_hash, sent_at, hidden_by_client_at, deleted_by_client_at, account_id, name)
      values (${row.id}, 1, ${row.document as Design}, ${row.created_at}, ${row.updated_at},
              ${row.write_token_hash ?? null}, ${row.visitor_hash ?? null}, ${row.sent_at ?? null},
              ${row.hidden_by_client_at ?? null}, ${row.deleted_by_client_at ?? null},
              ${row.account_id ?? null}, ${row.name ?? null})
      on conflict (id) do update
        set schema_version = excluded.schema_version,
            document = excluded.document,
            updated_at = excluded.updated_at,
            write_token_hash = excluded.write_token_hash,
            visitor_hash = excluded.visitor_hash,
            sent_at = coalesce(designs.sent_at, excluded.sent_at),
            hidden_by_client_at = coalesce(designs.hidden_by_client_at, excluded.hidden_by_client_at),
            deleted_by_client_at = coalesce(designs.deleted_by_client_at, excluded.deleted_by_client_at),
            name = coalesce(designs.name, excluded.name)
    `;
  }

  async function exportedLineFor(id: DesignId): Promise<string> {
    const rows = await readAllDesignRows(
      createNeonDesignRowSource(testDatabaseUrl),
    );
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) throw new Error(`The export did not contain design "${id}"`);
    return toNdjsonLine(row);
  }

  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  afterEach(async () => {
    if (!sql || mintedIds.length === 0) return;
    const ids = mintedIds.splice(0, mintedIds.length);
    await sql`delete from designs where id = any(${ids})`;
  });

  it.skipIf(!hasLiveDatabase)(
    "lets the original token still write after export, loss and restore",
    async () => {
      const token = "qa-round-trip-token-not-a-real-credential";
      const { id } = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: hashWriteToken(token),
        visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
      });
      mintedIds.push(id);

      const line = await exportedLineFor(id);
      if (!sql) return;
      await sql`delete from designs where id = ${id}`;
      await expect(repository().load(id)).rejects.toThrow();

      await restoreRow(line);

      // The whole finding, in one assertion: the design came back **writable by its owner**.
      const edited: Design = {
        ...KITCHEN_L_DESIGN,
        presetId: "edited-after-restore",
      };
      await expect(
        repository().saveAuthorized({
          id,
          design: edited,
          credential: { kind: "write-token", hash: hashWriteToken(token) },
          expectedRevision: RESTORED_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).resolves.toEqual({ id, revision: "2", ownsVisitor: false });
      expect(
        canonicalSerializeDesign((await repository().load(id)).design),
      ).toBe(canonicalSerializeDesign(edited));
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "does not hand write access to anyone else after the restore",
    async () => {
      const token = "qa-round-trip-token-two";
      const { id } = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: hashWriteToken(token),
        visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
      });
      mintedIds.push(id);
      const line = await exportedLineFor(id);
      if (!sql) return;
      await sql`delete from designs where id = ${id}`;

      await restoreRow(line);

      // A restore that preserved edit access but widened it would be the opposite defect.
      await expect(
        repository().saveAuthorized({
          id,
          design: KITCHEN_L_DESIGN,
          credential: {
            kind: "write-token",
            hash: hashWriteToken("a-different-token"),
          },
          expectedRevision: RESTORED_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "carries the hash and never a token, so a leaked backup confers no write access",
    async () => {
      const token = "qa-round-trip-token-three";
      const { id } = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: hashWriteToken(token),
        visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
      });
      mintedIds.push(id);

      const line = await exportedLineFor(id);

      expect(line).toContain(hashWriteToken(token));
      expect(line).not.toContain(token);
      // And the line ends with the newline `toNdjson` guarantees, so a one-row export is valid
      // ndjson and a zero-row one is still a non-empty body.
      expect(line.endsWith("\n")).toBe(true);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "carries visitor_hash through export, loss and restore untouched",
    async () => {
      // Since M7 wave 7E3a S2, `mint` writes `visitor_hash` directly — a 64-character lowercase
      // hex digest, exactly like the write-token hash beside it.
      const visitorHash = "b".repeat(64);
      const { id } = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: hashWriteToken("qa-round-trip-token-visitor"),
        visitor: { kind: "fresh", visitorHash },
      });
      mintedIds.push(id);
      if (!sql) return;

      const line = await exportedLineFor(id);
      expect(line).toContain(visitorHash);

      await sql`delete from designs where id = ${id}`;
      await restoreRow(line);

      const rows = (await sql`
        select visitor_hash from designs where id = ${id}
      `) as { visitor_hash: string | null }[];
      expect(rows[0]?.visitor_hash).toBe(visitorHash);
      expect(rows[0]?.visitor_hash).toMatch(/^[0-9a-f]{64}$/);
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "restores a pre-ADR-0019 dump as NULL, which fails closed rather than open",
    async () => {
      // A dump taken before the column existed has no `write_token_hash` key at all. The runbook's
      // `?? null` has to land it as NULL — readable, not writable — rather than as `undefined`,
      // which the driver would reject, or as an empty string, which would be worse than either.
      const id = `qa-legacy-${String(Date.now())}`;
      mintedIds.push(id);
      const legacyLine = `${JSON.stringify({
        id,
        schema_version: 1,
        document: KITCHEN_L_DESIGN,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
      })}\n`;

      await restoreRow(legacyLine);

      expect(
        canonicalSerializeDesign((await repository().load(id)).design),
      ).toBe(canonicalSerializeDesign(KITCHEN_L_DESIGN));
      await expect(
        repository().saveAuthorized({
          id,
          design: KITCHEN_L_DESIGN,
          credential: {
            kind: "write-token",
            hash: hashWriteToken("any-token-at-all"),
          },
          expectedRevision: RESTORED_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "survives a second restore of the same dump — the conflict branch keeps the hash",
    async () => {
      const token = "qa-round-trip-token-four";
      const { id } = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: hashWriteToken(token),
        visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
      });
      mintedIds.push(id);
      const line = await exportedLineFor(id);

      // The `on conflict do update` branch is the one a re-run takes, and it lists the columns it
      // overwrites explicitly — an omission there loses the hash on the second run rather than the
      // first, which is far harder to notice.
      await restoreRow(line);
      await restoreRow(line);

      await expect(
        repository().saveAuthorized({
          id,
          design: KITCHEN_L_DESIGN,
          credential: { kind: "write-token", hash: hashWriteToken(token) },
          expectedRevision: RESTORED_REVISION,
          requestVisitor: { kind: "absent" },
        }),
      ).resolves.toEqual({ id, revision: "2", ownsVisitor: false });
    },
    30_000,
  );

  // M7 wave 7E3a adversarial QA, criterion 13's second half: a restored row is not only stored with
  // its hash, it is *resumed* — the index-backed lookup finds it again after the loss.
  it.skipIf(!hasLiveDatabase)(
    "a restored row is resumed by its visitor hash (criterion 13)",
    async () => {
      const visitorHash = "d".repeat(63) + "1";
      const { id } = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: hashWriteToken("qa-7e3a-restore-resumes"),
        visitor: { kind: "fresh", visitorHash },
      });
      mintedIds.push(id);
      if (!sql) return;
      const line = await exportedLineFor(id);

      await sql`delete from designs where id = ${id}`;
      await expect(repository().resume({ visitorHash })).resolves.toEqual({
        kind: "none",
      });
      await restoreRow(line);

      await expect(repository().resume({ visitorHash })).resolves.toEqual({
        kind: "found",
        id,
      });
    },
    30_000,
  );
  // Lot 2 (plan S4, ADR 0172 D9, D10): a client's hide or delete is an access-control mark, and a restore that drops it
  // reopens the kitchen to its browser and its account. These run the whole loop, as the tests above do for the token.
  describe("the client's marks survive export, loss and restore", () => {
    const MARK_COLUMNS = [
      "sent_at",
      "hidden_by_client_at",
      "deleted_by_client_at",
    ] as const;

    async function mintMarked(
      marks: Partial<Record<(typeof MARK_COLUMNS)[number], true>>,
    ): Promise<{ id: DesignId; token: string; visitorHash: string }> {
      const token = `qa-marks-token-${String(Date.now())}-${String(mintedIds.length)}`;
      const visitorHash = createHash("sha256")
        .update(token, "utf8")
        .digest("hex");
      const { id } = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: hashWriteToken(token),
        visitor: { kind: "fresh", visitorHash },
      });
      mintedIds.push(id);
      if (!sql) return { id, token, visitorHash };
      if (marks.sent_at)
        await sql`update designs set sent_at = now() where id = ${id}`;
      if (marks.hidden_by_client_at) {
        await sql`update designs set hidden_by_client_at = now() where id = ${id}`;
      }
      if (marks.deleted_by_client_at) {
        await sql`update designs set deleted_by_client_at = now() where id = ${id}`;
      }
      return { id, token, visitorHash };
    }

    async function marksOf(id: DesignId): Promise<Record<string, boolean>> {
      if (!sql) return {};
      const rows = (await sql`
        select (sent_at is not null) as sent_at,
               (hidden_by_client_at is not null) as hidden_by_client_at,
               (deleted_by_client_at is not null) as deleted_by_client_at
        from designs where id = ${id}
      `) as Record<string, boolean>[];
      return rows[0] ?? {};
    }

    it.skipIf(!hasLiveDatabase)(
      "exports sent_at, hidden_by_client_at and deleted_by_client_at, and account_id and name beside them",
      async () => {
        const { id } = await mintMarked({
          sent_at: true,
          hidden_by_client_at: true,
        });

        const row = JSON.parse((await exportedLineFor(id)).trim()) as Record<
          string,
          unknown
        >;

        expect(Object.keys(row)).toEqual(
          expect.arrayContaining([...MARK_COLUMNS]),
        );
        expect(Object.keys(row)).toEqual(
          expect.arrayContaining(["account_id", "name"]),
        );
      },
      30_000,
    );

    it.skipIf(!hasLiveDatabase)(
      "a hidden kitchen is still hidden after the restore, and its token and its browser are still refused",
      async () => {
        const { id, token, visitorHash } = await mintMarked({
          sent_at: true,
          hidden_by_client_at: true,
        });
        const line = await exportedLineFor(id);
        if (!sql) return;
        const before = await marksOf(id);
        await sql`delete from designs where id = ${id}`;

        await restoreRow(line);

        expect(await marksOf(id)).toEqual(before);
        expect(before).toEqual({
          sent_at: true,
          hidden_by_client_at: true,
          deleted_by_client_at: false,
        });
        await expect(
          repository().loadOwned({ id, accessor: { visitorHash } }),
        ).resolves.toEqual({ kind: "none" });
        await expect(
          repository().saveAuthorized({
            id,
            design: KITCHEN_L_DESIGN,
            credential: { kind: "write-token", hash: hashWriteToken(token) },
            expectedRevision: RESTORED_REVISION,
            requestVisitor: { kind: "absent" },
          }),
        ).rejects.toThrow(DesignWriteForbiddenError);
        await expect(repository().resume({ visitorHash })).resolves.toEqual({
          kind: "none",
        });
      },
      30_000,
    );

    it.skipIf(!hasLiveDatabase)(
      "a deleted kitchen is still deleted after the restore",
      async () => {
        const { id, visitorHash } = await mintMarked({
          deleted_by_client_at: true,
        });
        const line = await exportedLineFor(id);
        if (!sql) return;
        await sql`delete from designs where id = ${id}`;

        await restoreRow(line);

        expect(await marksOf(id)).toEqual({
          sent_at: false,
          hidden_by_client_at: false,
          deleted_by_client_at: true,
        });
        await expect(
          repository().loadOwned({ id, accessor: { visitorHash } }),
        ).resolves.toEqual({ kind: "none" });
      },
      30_000,
    );

    it.skipIf(!hasLiveDatabase)(
      "an open kitchen stays open and unsent, so a restore marks nothing it was not told to",
      async () => {
        const { id, visitorHash } = await mintMarked({});
        const line = await exportedLineFor(id);
        if (!sql) return;
        await sql`delete from designs where id = ${id}`;

        await restoreRow(line);

        expect(await marksOf(id)).toEqual({
          sent_at: false,
          hidden_by_client_at: false,
          deleted_by_client_at: false,
        });
        await expect(repository().resume({ visitorHash })).resolves.toEqual({
          kind: "found",
          id,
        });
      },
      30_000,
    );

    it.skipIf(!hasLiveDatabase)(
      "a dump from before the marks existed never reopens a kitchen hidden since: the re-run keeps the mark",
      async () => {
        const { id } = await mintMarked({
          sent_at: true,
          hidden_by_client_at: true,
        });
        if (!sql) return;
        const dumpBeforeTheMarks = `${JSON.stringify({
          id,
          schema_version: 1,
          document: KITCHEN_L_DESIGN,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        })}\n`;

        await restoreRow(dumpBeforeTheMarks);

        expect(await marksOf(id)).toEqual({
          sent_at: true,
          hidden_by_client_at: true,
          deleted_by_client_at: false,
        });
      },
      30_000,
    );
  });

  // Owner ruling O21 (2026-10-20), reversing ADR 0172 D10: `account_id` and `name` are exported, and a full-loss
  // restore brings them back. `designs.account_id` has no foreign key (`0015`), so any well-formed id is storable here.
  describe("the owner link and the kitchen's name survive export, loss and restore", () => {
    const ACCOUNT_ID = "A".repeat(21);
    const OTHER_ACCOUNT_ID = "B".repeat(21);
    const KITCHEN_NAME = "Küche am See";
    const NAME_LIMIT = 120;

    async function mintClaimedAndNamed(claim: {
      accountId: string | null;
      name: string | null;
    }): Promise<DesignId> {
      const { id } = await repository().mint({
        design: KITCHEN_L_DESIGN,
        writeTokenHash: hashWriteToken(
          `qa-o21-token-${String(mintedIds.length)}`,
        ),
        visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
      });
      mintedIds.push(id);
      if (!sql) return id;
      await sql`
        update designs set account_id = ${claim.accountId}, name = ${claim.name} where id = ${id}
      `;
      return id;
    }

    async function ownerLinkAndNameOf(
      id: DesignId,
    ): Promise<{ account_id: string | null; name: string | null }> {
      if (!sql) return { account_id: null, name: null };
      const rows = (await sql`
        select account_id, name from designs where id = ${id}
      `) as { account_id: string | null; name: string | null }[];
      return rows[0] ?? { account_id: null, name: null };
    }

    it.skipIf(!hasLiveDatabase)(
      "brings back both account_id and name exactly, after the row is deleted",
      async () => {
        const id = await mintClaimedAndNamed({
          accountId: ACCOUNT_ID,
          name: KITCHEN_NAME,
        });
        const line = await exportedLineFor(id);
        if (!sql) return;
        await sql`delete from designs where id = ${id}`;

        await restoreRow(line);

        expect(await ownerLinkAndNameOf(id)).toEqual({
          account_id: ACCOUNT_ID,
          name: KITCHEN_NAME,
        });
      },
      30_000,
    );

    it.skipIf(!hasLiveDatabase)(
      "exports an unclaimed, unnamed kitchen with null for both and restores it as null, not as an empty string",
      async () => {
        const id = await mintClaimedAndNamed({ accountId: null, name: null });
        const line = await exportedLineFor(id);
        const exported = JSON.parse(line.trim()) as Record<string, unknown>;
        if (!sql) return;
        await sql`delete from designs where id = ${id}`;

        await restoreRow(line);

        expect(exported["account_id"]).toBeNull();
        expect(exported["name"]).toBeNull();
        expect(await ownerLinkAndNameOf(id)).toEqual({
          account_id: null,
          name: null,
        });
      },
      30_000,
    );

    it.skipIf(!hasLiveDatabase)(
      "restores a name of exactly 120 characters, the limit the table's check allows",
      async () => {
        const longestName = "n".repeat(NAME_LIMIT);
        const id = await mintClaimedAndNamed({
          accountId: null,
          name: longestName,
        });
        const line = await exportedLineFor(id);
        if (!sql) return;
        await sql`delete from designs where id = ${id}`;

        await restoreRow(line);

        expect((await ownerLinkAndNameOf(id)).name).toBe(longestName);
      },
      30_000,
    );

    it.skipIf(!hasLiveDatabase)(
      "refuses a dumped name of 121 characters or an empty one: designs_name_length still applies to a restore",
      async () => {
        const id = await mintClaimedAndNamed({ accountId: null, name: null });
        const line = JSON.parse((await exportedLineFor(id)).trim()) as Record<
          string,
          unknown
        >;
        if (!sql) return;
        await sql`delete from designs where id = ${id}`;

        for (const refusedName of ["n".repeat(NAME_LIMIT + 1), ""]) {
          await expect(
            restoreRow(`${JSON.stringify({ ...line, name: refusedName })}\n`),
          ).rejects.toThrow();
        }

        const survivors = await sql`select id from designs where id = ${id}`;
        expect(survivors).toHaveLength(0);
      },
      30_000,
    );

    it.skipIf(!hasLiveDatabase)(
      "a dump from before the export carried them restores as unclaimed and unnamed",
      async () => {
        const id = `qa-o21-legacy-${String(Date.now())}`;
        mintedIds.push(id);
        const dumpBeforeO21 = `${JSON.stringify({
          id,
          schema_version: 1,
          document: KITCHEN_L_DESIGN,
          created_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-01T00:00:00.000Z",
        })}\n`;

        await restoreRow(dumpBeforeO21);

        expect(await ownerLinkAndNameOf(id)).toEqual({
          account_id: null,
          name: null,
        });
      },
      30_000,
    );

    it.skipIf(!hasLiveDatabase)(
      "a restore over a live row never moves or grants a claim, and keeps the live name",
      async () => {
        const id = await mintClaimedAndNamed({
          accountId: ACCOUNT_ID,
          name: KITCHEN_NAME,
        });
        const line = await exportedLineFor(id);
        if (!sql) return;
        await sql`
          update designs set account_id = ${OTHER_ACCOUNT_ID}, name = 'Renamed since the dump' where id = ${id}
        `;

        await restoreRow(line);

        expect(await ownerLinkAndNameOf(id)).toEqual({
          account_id: OTHER_ACCOUNT_ID,
          name: "Renamed since the dump",
        });

        await sql`update designs set account_id = null, name = null where id = ${id}`;
        await restoreRow(line);

        expect(await ownerLinkAndNameOf(id)).toEqual({
          account_id: null,
          name: KITCHEN_NAME,
        });
      },
      30_000,
    );
  });
});
