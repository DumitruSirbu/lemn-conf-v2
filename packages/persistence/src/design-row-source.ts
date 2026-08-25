import { neon } from "@neondatabase/serverless";

import { readDatabaseUrl } from "./read-database-url.js";

/**
 * Raw `designs` rows, mirroring the table's columns one-to-one (see
 * `migrations/0001_create_designs.sql`) rather than the domain `Design` type.
 *
 * A backup deliberately carries the raw `schema_version` each row was written with: a restore has
 * to migrate every row from the version it was stored at, and a `Design` that has already been
 * through `migrateDesign` has lost that information.
 */
export interface DesignBackupRow {
  readonly id: string;
  readonly schema_version: number;
  readonly document: unknown;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Bulk read of every design row. An interface so callers can substitute a fake in tests without a
 *  live database. */
export interface DesignRowSource {
  fetchAllDesigns(): Promise<DesignBackupRow[]>;
}

/**
 * Reads every `designs` row for the scheduled backup.
 *
 * Scoped to `designs` alone, deliberately — never widen it to every table. M8 adds a contact table
 * holding personal data, and a database-wide export would sweep contact submissions into Blob under
 * the backup's 14-day rotation, contradicting the stricter handling contact data is promised
 * (`docs/decisions/2026-08-24-db-backed-shareable-persistence.md`, "Security and backups"). A
 * second, separately-scoped export is the right way to back up another table.
 *
 * Lives here rather than in the web app because this package is the only place allowed to import a
 * Postgres driver: keeping every statement in one package is what makes "no string-built SQL
 * anywhere" auditable in a single place.
 */
export function createNeonDesignRowSource(
  connectionUrl?: string,
): DesignRowSource {
  return {
    async fetchAllDesigns() {
      // Resolved per call, not at construction: a missing `DATABASE_URL` must surface where the
      // caller can catch, log and report it, not throw while wiring dependencies.
      const sql = neon(connectionUrl ?? readDatabaseUrl());
      return (await sql`
        select id, schema_version, document, created_at, updated_at
        from designs
        order by id
      `) as DesignBackupRow[];
    },
  };
}
