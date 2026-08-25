import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalSerializeDesign,
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
} from "@lemnaria/configurator-domain";
import type { DesignId } from "@lemnaria/configurator-domain";
import { neon } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../src/migrate.js";
import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
import { resolveTestDatabaseUrl } from "../src/test-database-url.js";

const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);
const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

// Never the application database — `resolveTestDatabaseUrl` throws rather than resolving to it.
// These tests insert and delete rows; pointed at the app's own database they would eventually
// destroy real customer designs.
const testDatabaseUrl = hasLiveDatabase ? resolveTestDatabaseUrl() : "";

describe("NeonConfigurationRepository (live test database)", () => {
  // Rows these tests mint, deleted after each test. Without this the suite is not repeatable in the
  // F.I.R.S.T. sense — every run would leave orphans and the table would grow without bound.
  const mintedIds: DesignId[] = [];

  async function saveTrackingId(
    repository: NeonConfigurationRepository,
    ...args: Parameters<NeonConfigurationRepository["save"]>
  ): Promise<DesignId> {
    const id = await repository.save(...args);
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
    "round-trips a design through save(null, ...) and load(id) with identical canonical serialisation",
    async () => {
      const repository = testRepository();

      const id = await saveTrackingId(repository, null, KITCHEN_L_DESIGN);
      const loaded = await repository.load(id);

      expect(canonicalSerializeDesign(loaded)).toBe(
        canonicalSerializeDesign(KITCHEN_L_DESIGN),
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "overwrites the row when save is called with an existing id",
    async () => {
      const repository = testRepository();
      const id = await saveTrackingId(repository, null, KITCHEN_L_DESIGN);
      const updated = { ...KITCHEN_L_DESIGN, presetId: "updated-preset" };

      const returnedId = await repository.save(id, updated);
      const loaded = await repository.load(id);

      expect(returnedId).toBe(id);
      expect(canonicalSerializeDesign(loaded)).toBe(
        canonicalSerializeDesign(updated),
      );
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
    "throws DesignNotFoundError when saving to an id no row carries",
    async () => {
      const repository = testRepository();

      // A bare `update` matching no row reports success, so without an explicit check this silently
      // persists nothing while reporting the design as saved.
      await expect(
        repository.save("does-not-exist-00000000", KITCHEN_L_DESIGN),
      ).rejects.toThrow(DesignNotFoundError);
      await expect(repository.load("does-not-exist-00000000")).rejects.toThrow(
        DesignNotFoundError,
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "leaves no row behind once its own cleanup has run",
    async () => {
      const repository = testRepository();
      const id = await repository.save(null, KITCHEN_L_DESIGN);

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
});
