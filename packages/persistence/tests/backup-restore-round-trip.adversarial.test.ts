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
import { resolveTestDatabaseUrl } from "../src/test-database-url.js";
import { readAllDesignRows } from "./support/read-all-design-rows.js";

/** A restored row carries the revision its dump held, and every dump in this suite predates the
 *  revision column — so what comes back is the migration's backfill. */
const RESTORED_REVISION = "1";

const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);
const testDatabaseUrl = hasLiveDatabase ? resolveTestDatabaseUrl() : "";

/** Exactly what `apps/web/src/lib/server/write-token.ts` does, reproduced so the test holds a real
 *  token and can present it after the restore. */
function hashWriteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** `backup-designs.ts`'s `toNdjson`, for one row. */
function toNdjsonLine(row: DesignBackupRow): string {
  return `${JSON.stringify(row)}\n`;
}

describe("a backup round trip preserves edit access (live test database)", () => {
  const mintedIds: DesignId[] = [];
  const sql = hasLiveDatabase ? neon(testDatabaseUrl) : undefined;

  function repository(): NeonConfigurationRepository {
    return new NeonConfigurationRepository(testDatabaseUrl);
  }

  /** The runbook's restore statement, verbatim. */
  async function restoreRow(line: string): Promise<void> {
    if (!sql) return;
    const row = JSON.parse(line) as {
      id: string;
      schema_version: number;
      document: unknown;
      created_at: string;
      updated_at: string;
      write_token_hash?: string | null;
    };
    await sql`
      insert into designs (id, schema_version, document, created_at, updated_at, write_token_hash)
      values (${row.id}, 1, ${row.document as Design}, ${row.created_at}, ${row.updated_at},
              ${row.write_token_hash ?? null})
      on conflict (id) do update
        set schema_version = excluded.schema_version,
            document = excluded.document,
            updated_at = excluded.updated_at,
            write_token_hash = excluded.write_token_hash
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
      const { id } = await repository().mint(
        KITCHEN_L_DESIGN,
        hashWriteToken(token),
      );
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
          writeTokenHash: hashWriteToken(token),
          expectedRevision: RESTORED_REVISION,
        }),
      ).resolves.toEqual({ id, revision: "2" });
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
      const { id } = await repository().mint(
        KITCHEN_L_DESIGN,
        hashWriteToken(token),
      );
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
          writeTokenHash: hashWriteToken("a-different-token"),
          expectedRevision: RESTORED_REVISION,
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "carries the hash and never a token, so a leaked backup confers no write access",
    async () => {
      const token = "qa-round-trip-token-three";
      const { id } = await repository().mint(
        KITCHEN_L_DESIGN,
        hashWriteToken(token),
      );
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
          writeTokenHash: hashWriteToken("any-token-at-all"),
          expectedRevision: RESTORED_REVISION,
        }),
      ).rejects.toThrow(DesignWriteForbiddenError);
    },
    30_000,
  );

  it.skipIf(!hasLiveDatabase)(
    "survives a second restore of the same dump — the conflict branch keeps the hash",
    async () => {
      const token = "qa-round-trip-token-four";
      const { id } = await repository().mint(
        KITCHEN_L_DESIGN,
        hashWriteToken(token),
      );
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
          writeTokenHash: hashWriteToken(token),
          expectedRevision: RESTORED_REVISION,
        }),
      ).resolves.toEqual({ id, revision: "2" });
    },
    30_000,
  );
});
