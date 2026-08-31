import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { DesignId } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createNeonDesignRowSource } from "../src/design-row-source.js";
import { runMigrations } from "../src/migrate.js";
import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
import { resolveTestDatabaseUrl } from "../src/test-database-url.js";
import { readAllDesignRows } from "./support/read-all-design-rows.js";

const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);
const testDatabaseUrl = hasLiveDatabase ? resolveTestDatabaseUrl() : "";

const WRITE_TOKEN_HASH = "e".repeat(64);

/**
 * The backup export exists to make a restore possible, and after ADR 0019 a design's
 * `write_token_hash` *is* its edit access. A backup that omits it restores every design readable
 * and permanently unwritable — the link still works, so nothing looks broken until a customer tries
 * to save and is refused. These tests are what stop that column being dropped again.
 */
describe("createNeonDesignRowSource (live test database)", () => {
  const mintedIds: DesignId[] = [];

  async function mintTrackingId(hash = WRITE_TOKEN_HASH): Promise<DesignId> {
    const id = await new NeonConfigurationRepository(testDatabaseUrl).mint(
      KITCHEN_L_DESIGN,
      hash,
    );
    mintedIds.push(id);
    return id;
  }

  async function exportedRowFor(id: DesignId) {
    const rows = await readAllDesignRows(
      createNeonDesignRowSource(testDatabaseUrl),
    );
    return rows.find((row) => row.id === id);
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
    "exports each design's write-token hash",
    async () => {
      const id = await mintTrackingId();

      expect((await exportedRowFor(id))?.write_token_hash).toBe(
        WRITE_TOKEN_HASH,
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "exports a hash, never a token a leaked backup could be replayed with",
    async () => {
      const id = await mintTrackingId();

      // Same reasoning that justifies hashing at rest: the value in a backup is a digest, so
      // holding the file confers no write access to anything.
      const exported = (await exportedRowFor(id))?.write_token_hash ?? "";
      expect(exported).toMatch(/^[0-9a-f]{64}$/);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "walks the table in id order, resuming from the last id without repeating or skipping a row",
    async () => {
      const ids = [
        await mintTrackingId(),
        await mintTrackingId(),
        await mintTrackingId(),
      ];
      const source = createNeonDesignRowSource(testDatabaseUrl);

      const firstPage = await source.fetchDesignPage({ pageSize: 1 });
      const secondPage = await source.fetchDesignPage({
        afterId: firstPage[0]?.id ?? "",
        pageSize: 1,
      });

      // The bound is honoured, and the second page starts strictly after the first ends — the
      // property a whole-table read never had to have (finding DB-002).
      expect(firstPage).toHaveLength(1);
      expect(secondPage).toHaveLength(1);
      const firstId = firstPage[0]?.id ?? "";
      const secondId = secondPage[0]?.id ?? "";
      expect(secondId > firstId).toBe(true);

      const walkedIds = (await readAllDesignRows(source)).map((row) => row.id);
      for (const id of ids) {
        expect(walkedIds.filter((walked) => walked === id)).toEqual([id]);
      }
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "round-trips through a restore with the design still writable afterwards",
    async () => {
      const repository = new NeonConfigurationRepository(testDatabaseUrl);
      const id = await mintTrackingId();
      const exported = await exportedRowFor(id);
      if (!exported) throw new Error(`design ${id} was not in the export`);

      // The restore runbook's insert, in the shape it actually uses. Losing the design first is the
      // point: this is the recovery path, not an update.
      const sql = neon(testDatabaseUrl);
      await sql`delete from designs where id = ${id}`;
      await sql`
        insert into designs (id, schema_version, document, created_at, updated_at, write_token_hash)
        values (${exported.id}, ${exported.schema_version}, ${exported.document},
                ${exported.created_at}, ${exported.updated_at}, ${exported.write_token_hash})
      `;

      await expect(
        repository.saveAuthorized({
          id,
          design: { ...KITCHEN_L_DESIGN, presetId: "edited-after-restore" },
          writeTokenHash: WRITE_TOKEN_HASH,
        }),
      ).resolves.toBe(id);
    },
  );
});
