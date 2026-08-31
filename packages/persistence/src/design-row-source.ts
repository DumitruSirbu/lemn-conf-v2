import { neon } from "@neondatabase/serverless";

import { readDatabaseUrl } from "./read-database-url.js";

/**
 * Raw `designs` rows, mirroring the table's columns one-to-one (see
 * `migrations/0001_create_designs.sql`) rather than the domain `Design` type.
 *
 * A backup deliberately carries the raw `schema_version` each row was written with: a restore has
 * to migrate every row from the version it was stored at, and a `Design` that has already been
 * through `migrateDesign` has lost that information.
 *
 * It carries `write_token_hash` for a sharper reason: that column *is* edit access (ADR 0019
 * decision 1). Restore a design without it and the row comes back readable and permanently
 * unwritable, so every customer silently loses the ability to edit their own kitchen — and nothing
 * looks broken until one of them tries to save. Exporting it is safe by the same argument that
 * justifies hashing at rest: the column holds a SHA-256 digest, never a token, so a leaked backup
 * yields values that cannot be presented as credentials.
 */
export interface DesignBackupRow {
  readonly id: string;
  readonly schema_version: number;
  readonly document: unknown;
  readonly created_at: string;
  readonly updated_at: string;
  readonly write_token_hash: string | null;
}

/**
 * One page of a keyset walk over `designs`, ordered by `id`.
 *
 * Keyset rather than `offset`: the walk is the backup's, so it must not re-read rows it has already
 * exported when a concurrent insert shifts every later offset, and `where id > ?` costs the same on
 * page one and page ten thousand.
 */
export interface DesignRowPageQuery {
  /** Exclusive lower bound — the last `id` the previous page returned. Absent for the first page. */
  readonly afterId?: string;
  readonly pageSize: number;
}

/**
 * Paged read of `designs` rows in `id` order. An interface so callers can substitute a fake in
 * tests without a live database.
 *
 * Paged rather than "fetch them all": the only caller is the nightly backup, and a whole-table read
 * put the entire database in memory as driver row objects at once — growth was O(total stored data)
 * with nothing bounding it, so the recovery mechanism was guaranteed to fail exactly when the
 * database had grown large enough for recovery to matter (finding DB-002).
 */
export interface DesignRowSource {
  fetchDesignPage(query: DesignRowPageQuery): Promise<DesignBackupRow[]>;
}

/**
 * Reads `designs` rows for the scheduled backup, one bounded page at a time.
 *
 * Scoped to `designs` alone, deliberately — never widen it to another **table**. The column list
 * grows with the table's columns (a restore must reproduce the row, not a subset of it); what must
 * never grow is the set of tables this reads. M8 adds a contact table
 * holding personal data, and a database-wide export would sweep contact submissions into Blob under
 * the backup's 14-day rotation, contradicting the stricter handling contact data is promised
 * (`docs/decisions/0002-db-backed-shareable-persistence.md`, "Security and backups"). A
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
    async fetchDesignPage({ afterId, pageSize }) {
      // Resolved per call, not at construction: a missing `DATABASE_URL` must surface where the
      // caller can catch, log and report it, not throw while wiring dependencies.
      const sql = neon(connectionUrl ?? readDatabaseUrl());
      const rows =
        afterId === undefined
          ? await sql`
              select id, schema_version, document, created_at, updated_at, write_token_hash
              from designs
              order by id
              limit ${pageSize}
            `
          : await sql`
              select id, schema_version, document, created_at, updated_at, write_token_hash
              from designs
              where id > ${afterId}
              order by id
              limit ${pageSize}
            `;
      return rows as DesignBackupRow[];
    },
  };
}
