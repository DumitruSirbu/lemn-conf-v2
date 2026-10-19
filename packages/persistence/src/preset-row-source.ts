import { openApplicationDatabase } from "./open-application-database.js";
import { retryOnTransientFailure } from "./retry-on-transient-failure.js";

/**
 * Raw `presets` rows mirroring the table's columns (`migrations/0011_create_presets.sql`), not the domain preset: a
 * restore migrates each document from the `schema_version` it was written with, which reading it as a `Design` would
 * erase. Every column is carried, `status` and `created_at` included, so a hidden preset stays hidden after a restore
 * and the listing order survives it. `thumbnail_hex` is the image as lowercase hex text (`encode(thumbnail, 'hex')`),
 * the same way the repository reads and writes it: `JSON.stringify` of the driver's byte value is not the bytes, and a
 * restore turns the text back with `decode(..., 'hex')`.
 */
export interface PresetBackupRow {
  readonly id: string;
  readonly shape: string;
  readonly wall_a_mm: number;
  readonly wall_b_mm: number | null;
  readonly wall_c_mm: number | null;
  readonly height_mm: number;
  readonly schema_version: number;
  readonly design_document: unknown;
  readonly typed_name: string | null;
  readonly thumbnail_hex: string;
  readonly thumbnail_type: string;
  readonly status: string;
  readonly created_at: string;
}

/** One page of a keyset walk over `presets`, ordered by `id`. Keyset for the reasons `DesignRowPageQuery` gives. */
export interface PresetRowPageQuery {
  /** Exclusive lower bound: the last `id` the previous page returned. Absent for the first page. */
  readonly afterId?: string;
  readonly pageSize: number;
}

/** Paged read of `presets` rows in `id` order; an interface so tests can substitute a fake. */
export interface PresetRowSource {
  fetchPresetPage(query: PresetRowPageQuery): Promise<PresetBackupRow[]>;
}

/**
 * Reads `presets` rows for the scheduled backup, one bounded page at a time. Scoped to the `presets` table alone and to
 * every row of it: there is no `where status` filter, because a hidden preset is the owner's work and a backup that
 * dropped it would lose it. Never widen it to another table: `designs` and the contact tables are backed up, or
 * deliberately not, by their own exports (`docs/decisions/0012-scheduled-export-is-a-scoped-sql-select.md`). It lives
 * here because this package is the only place allowed to import a Postgres driver.
 */
export function createNeonPresetRowSource(
  connectionUrl?: string,
): PresetRowSource {
  return {
    async fetchPresetPage({ afterId, pageSize }) {
      // Resolved per call, as `createNeonDesignRowSource` does: a missing `DATABASE_URL` must surface where the caller
      // can catch and report it, not throw while wiring dependencies.
      const sql = openApplicationDatabase(connectionUrl);
      const rows = await retryOnTransientFailure(() =>
        afterId === undefined
          ? sql`
              select id, shape, wall_a_mm, wall_b_mm, wall_c_mm, height_mm, schema_version, design_document,
                     typed_name, encode(thumbnail, 'hex') as thumbnail_hex, thumbnail_type, status, created_at
              from presets
              order by id
              limit ${pageSize}
            `
          : sql`
              select id, shape, wall_a_mm, wall_b_mm, wall_c_mm, height_mm, schema_version, design_document,
                     typed_name, encode(thumbnail, 'hex') as thumbnail_hex, thumbnail_type, status, created_at
              from presets
              where id > ${afterId}
              order by id
              limit ${pageSize}
            `,
      );
      return rows as PresetBackupRow[];
    },
  };
}
