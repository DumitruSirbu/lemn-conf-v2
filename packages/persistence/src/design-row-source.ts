import { neon } from "@neondatabase/serverless";

import { readDatabaseUrl } from "./read-database-url.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

/**
 * Raw `designs` rows mirroring the table's columns one-to-one (`migrations/0001_create_designs.sql`), not the domain
 * `Design`: a restore migrates each row from the `schema_version` it was written with, which `migrateDesign` would
 * erase. It carries `write_token_hash` because that column is edit access (ADR 0019 decision 1): a restore without it
 * returns rows readable and permanently unwritable. It carries `visitor_hash` because that column is read access (ADR
 * 0114 decision 5): without it a restored design is unreadable to its owner. Both are SHA-256 digests, never tokens or
 * cookies, so a leaked backup yields nothing presentable as a credential.
 */
export interface DesignBackupRow {
  readonly id: string;
  readonly schema_version: number;
  readonly document: unknown;
  readonly created_at: string;
  readonly updated_at: string;
  readonly write_token_hash: string | null;
  readonly visitor_hash: string | null;
}

/** One page of a keyset walk over `designs`, ordered by `id`. Keyset, not `offset`: a concurrent insert must not shift
 *  later pages, and `where id > ?` costs the same on every page. */
export interface DesignRowPageQuery {
  /** Exclusive lower bound — the last `id` the previous page returned. Absent for the first page. */
  readonly afterId?: string;
  readonly pageSize: number;
}

/**
 * Paged read of `designs` rows in `id` order; an interface so tests can substitute a fake. Paged because a whole-table
 * read put the entire database in memory, so the backup would fail exactly when the database had grown large enough
 * for recovery to matter (finding DB-002).
 */
export interface DesignRowSource {
  fetchDesignPage(query: DesignRowPageQuery): Promise<DesignBackupRow[]>;
}

/**
 * Reads `designs` rows for the scheduled backup, one bounded page at a time. Scoped to the `designs` table alone: never
 * widen it to another table. M8 adds a contact table holding personal data, and a database-wide export would sweep it
 * into Blob under the backup's 14-day rotation, against the stricter handling contact data is promised
 * (`docs/decisions/0002-db-backed-shareable-persistence.md`, "Security and backups"). Back up another table with a
 * second, separately scoped export. It lives here because this package is the only place allowed to import a Postgres
 * driver.
 */
export function createNeonDesignRowSource(
  connectionUrl?: string,
): DesignRowSource {
  return {
    async fetchDesignPage({ afterId, pageSize }) {
      // Resolved per call, not at construction: a missing `DATABASE_URL` must surface where the caller can catch and
      // report it, not throw while wiring dependencies.
      const sql = neon(connectionUrl ?? readDatabaseUrl());
      const rows = await retryOnTransientFailure(() =>
        afterId === undefined
          ? sql`
              select id, schema_version, document, created_at, updated_at, write_token_hash,
                     visitor_hash
              from designs
              order by id
              limit ${pageSize}
            `
          : sql`
              select id, schema_version, document, created_at, updated_at, write_token_hash,
                     visitor_hash
              from designs
              where id > ${afterId}
              order by id
              limit ${pageSize}
            `,
      );
      return rows as DesignBackupRow[];
    },
  };
}
