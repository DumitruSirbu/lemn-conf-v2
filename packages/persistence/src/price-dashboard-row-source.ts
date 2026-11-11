import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

/**
 * Raw `price_book_versions` rows, every column of `migrations/0023_create_price_book_versions.sql`. `sequence_number` is
 * read as text (`::text`), the way every price-book statement reads a `bigint`, so a restore gets the exact digits back;
 * `published_at` and `published_by_account_id` are history, and a restore that re-defaulted them would rewrite who
 * published what and when. `book` and `change_summary` are the stored documents as the database holds them.
 */
export interface PriceBookVersionBackupRow {
  readonly id: string;
  readonly sequence_number: string;
  readonly label: string;
  readonly note: string;
  readonly book: unknown;
  readonly change_summary: unknown;
  readonly change_count: number;
  readonly published_at: string;
  readonly published_by_account_id: string;
}

/** Raw `catalogue_availability_changes` rows, every column of `0025`; `revision` is text, as above. */
export interface AvailabilityChangeBackupRow {
  readonly revision: string;
  readonly item_kind: string;
  readonly item_id: string;
  readonly active: boolean;
  readonly changed_at: string;
  readonly changed_by_account_id: string;
}

/**
 * The one `catalogue_availability_head` row. It is exported beside the log because the two can diverge: a publish moves
 * the head by `greatest(k, 1)` and writes `k` log rows, so a publish that creates nothing moves the head with no log
 * row. A restore that brought the log back without the head could not derive it, and the next write would collide on the
 * log's primary key.
 */
export interface AvailabilityHeadBackupRow {
  readonly revision: string;
}

/** The one `kitchen_defaults` row, every column of `0029`. `saved_by_account_id` is `null` until the first save. */
export interface KitchenDefaultsBackupRow {
  readonly revision: string;
  readonly defaults: unknown;
  readonly saved_at: string;
  readonly saved_by_account_id: string | null;
}

/** One page of a keyset walk over `price_book_versions`, ordered by `sequence_number`. */
export interface PriceBookVersionPageQuery {
  /** Exclusive lower bound: the last `sequence_number` (its text) the previous page returned. Absent for the first. */
  readonly afterSequenceNumber?: string;
  readonly pageSize: number;
}

/** One page of a keyset walk over `catalogue_availability_changes`, ordered by `revision`. */
export interface AvailabilityChangePageQuery {
  /** Exclusive lower bound: the last `revision` (its text) the previous page returned. Absent for the first. */
  readonly afterRevision?: string;
  readonly pageSize: number;
}

/** Paged and single-row reads of the price dashboard's tables; an interface so tests can substitute a fake. */
export interface PriceDashboardRowSource {
  fetchVersionPage(
    query: PriceBookVersionPageQuery,
  ): Promise<PriceBookVersionBackupRow[]>;
  fetchAvailabilityChangePage(
    query: AvailabilityChangePageQuery,
  ): Promise<AvailabilityChangeBackupRow[]>;
  fetchAvailabilityHead(): Promise<AvailabilityHeadBackupRow>;
  fetchKitchenDefaults(): Promise<KitchenDefaultsBackupRow>;
}

/**
 * Reads the price dashboard's tables for a scheduled backup (M10 wave S6, OQ-13): the price-book versions, the
 * availability log with its head, and the kitchen defaults. Each statement names exactly one table and every row of it,
 * with no predicate and no join, and none names `designs` or a contact table: those are exported, or deliberately not, by
 * their own scoped exports (`docs/decisions/0012-scheduled-export-is-a-scoped-sql-select.md`). `price_book_draft` is not
 * here: it is working state, and a lost draft costs a re-edit, not history.
 *
 * The files these rows make are personal data: three of the four tables carry the account id of the staff member who
 * published, switched an item or saved the defaults, and they are handled as the designs export is.
 *
 * **Page size.** A version's `book` can be 4 MiB, so a caller must not reuse the designs export's page size of 200; it
 * would hold hundreds of megabytes of one page in memory.
 *
 * It lives here because this package is the only place allowed to import a Postgres driver. Nothing runs it on a
 * schedule yet: that is an application module with its own Blob prefix and cron route.
 */
export function createNeonPriceDashboardRowSource(
  connectionUrl?: string,
): PriceDashboardRowSource {
  return {
    async fetchVersionPage({ afterSequenceNumber, pageSize }) {
      // Resolved per call, as `createNeonDesignRowSource` does: a missing `DATABASE_URL` must surface where the caller
      // can catch and report it, not throw while wiring dependencies.
      const sql = openApplicationDatabase(connectionUrl);
      // `order by v.sequence_number`, never the bare name: a bare name binds to the `::text` output column and sorts
      // version 9 after version 10.
      const rows = await retryOnTransientFailure(() =>
        afterSequenceNumber === undefined
          ? sql`
              select v.id, v.sequence_number::text as sequence_number, v.label, v.note, v.book, v.change_summary,
                     v.change_count, v.published_at, v.published_by_account_id
              from price_book_versions v
              order by v.sequence_number
              limit ${pageSize}
            `
          : sql`
              select v.id, v.sequence_number::text as sequence_number, v.label, v.note, v.book, v.change_summary,
                     v.change_count, v.published_at, v.published_by_account_id
              from price_book_versions v
              where v.sequence_number > ${afterSequenceNumber}::bigint
              order by v.sequence_number
              limit ${pageSize}
            `,
      );
      return rows as PriceBookVersionBackupRow[];
    },

    async fetchAvailabilityChangePage({ afterRevision, pageSize }) {
      const sql = openApplicationDatabase(connectionUrl);
      const rows = await retryOnTransientFailure(() =>
        afterRevision === undefined
          ? sql`
              select c.revision::text as revision, c.item_kind, c.item_id, c.active, c.changed_at,
                     c.changed_by_account_id
              from catalogue_availability_changes c
              order by c.revision
              limit ${pageSize}
            `
          : sql`
              select c.revision::text as revision, c.item_kind, c.item_id, c.active, c.changed_at,
                     c.changed_by_account_id
              from catalogue_availability_changes c
              where c.revision > ${afterRevision}::bigint
              order by c.revision
              limit ${pageSize}
            `,
      );
      return rows as AvailabilityChangeBackupRow[];
    },

    async fetchAvailabilityHead() {
      const sql = openApplicationDatabase(connectionUrl);
      const rows = await retryOnTransientFailure(
        () => sql`
          select h.revision::text as revision
          from catalogue_availability_head h
        `,
      );
      return onlyRowOf(
        rows as AvailabilityHeadBackupRow[],
        "catalogue_availability_head",
      );
    },

    async fetchKitchenDefaults() {
      const sql = openApplicationDatabase(connectionUrl);
      const rows = await retryOnTransientFailure(
        () => sql`
          select d.revision::text as revision, d.defaults, d.saved_at, d.saved_by_account_id
          from kitchen_defaults d
        `,
      );
      return onlyRowOf(rows as KitchenDefaultsBackupRow[], "kitchen_defaults");
    },
  };
}

/** A singleton table is seeded by its migration: no row means the migration was not applied, which a backup must report,
 *  not skip. */
function onlyRowOf<Row>(rows: readonly Row[], tableName: string): Row {
  const [row] = rows;
  if (rows.length !== 1 || row === undefined) {
    throw new Error(
      `Backup read of ${tableName} found ${String(rows.length)} rows, expected exactly one`,
    );
  }
  return row;
}
