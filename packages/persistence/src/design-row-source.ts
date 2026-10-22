import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

/**
 * Raw `designs` rows mirroring the table's columns one-to-one (`migrations/0001_create_designs.sql`), not the domain
 * `Design`: a restore migrates each row from the `schema_version` it was written with, which `migrateDesign` would
 * erase. It carries `write_token_hash` because that column is edit access (ADR 0019 decision 1): a restore without it
 * returns rows readable and permanently unwritable. It carries `visitor_hash` because that column is read access (ADR
 * 0114 decision 5): without it a restored design is unreadable to its owner. Both are SHA-256 digests, never tokens or
 * cookies, so a leaked backup yields nothing presentable as a credential.
 *
 * It carries the access-control marks of `0015` and `0016` for the same reason: `hidden_by_client_at` and
 * `deleted_by_client_at` close a design to every arm, and a restore without them reopens each kitchen a client hid or
 * deleted, and `sent_at` is the shop's filter. A `null` is "open" or "unsent", so a dump written before these columns
 * restores as it always did.
 *
 * It carries `account_id` and `name` (`0015`, `0016`; owner ruling O21, 2026-10-20, which reverses ADR 0172 D10): a
 * full-loss restore without them brings every claimed kitchen back unclaimed and unnamed. `account_id` is the owner
 * link and `name` is free text a client typed, so the export file is personal data. A `null` is "unclaimed" or
 * "unnamed". `account_id` has no foreign key (`0015`), so the database does not check that the account exists.
 */
export interface DesignBackupRow {
  readonly id: string;
  readonly schema_version: number;
  readonly document: unknown;
  readonly created_at: string;
  readonly updated_at: string;
  readonly write_token_hash: string | null;
  readonly visitor_hash: string | null;
  readonly sent_at: string | null;
  readonly hidden_by_client_at: string | null;
  readonly deleted_by_client_at: string | null;
  readonly account_id: string | null;
  readonly name: string | null;
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
 * (`docs/decisions/0002-db-backed-shareable-persistence.md`, "Security and backups"). The `designs` rows themselves now
 * carry an owner link and kitchen names, so the file is handled as personal data too. Back up another table with a
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
      const sql = openApplicationDatabase(connectionUrl);
      const rows = await retryOnTransientFailure(() =>
        afterId === undefined
          ? sql`
              select id, schema_version, document, created_at, updated_at, write_token_hash,
                     visitor_hash, sent_at, hidden_by_client_at, deleted_by_client_at, account_id, name
              from designs
              order by id
              limit ${pageSize}
            `
          : sql`
              select id, schema_version, document, created_at, updated_at, write_token_hash,
                     visitor_hash, sent_at, hidden_by_client_at, deleted_by_client_at, account_id, name
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
