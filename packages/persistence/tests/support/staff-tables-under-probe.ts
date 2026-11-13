import { readMigrationFiles } from "../../src/migration-files.js";
import type { MigrationFile } from "../../src/migration-files.js";

/** The three staff tables (migrations `0020` to `0022`) as the qa-l3-s1 files probe them: shared by the file that runs
 *  under the shared test-schema lock and the one that re-applies the migrations under the exclusive lock. */

export type RowValues = Record<string, string | null>;
export const ID = "Ab3_-".repeat(4) + "Z";
const STAMP = "2026-10-21T09:00:00Z";

export interface TableUnderProbe {
  readonly table: string;
  readonly migrationPrefix: string;
  /** A row every check accepts, the stamped column included, so that a probe changes one field at a time. */
  readonly validRow: RowValues;
}

export const AUDIT: TableUnderProbe = {
  table: "staff_audit_events",
  migrationPrefix: "0020_",
  validRow: {
    id: ID,
    occurred_at: STAMP,
    actor_account_id: ID,
    action: "kitchen-opened",
    design_id: null,
    subject_account_id: null,
    detail: null,
  },
};
export const NOTES: TableUnderProbe = {
  table: "design_notes",
  migrationPrefix: "0021_",
  validRow: {
    id: ID,
    design_id: ID,
    author_account_id: ID,
    body: "a note",
    created_at: STAMP,
  },
};
export const REQUEST_STATES: TableUnderProbe = {
  table: "design_request_states",
  migrationPrefix: "0022_",
  validRow: {
    design_id: ID,
    status: "new",
    changed_by_account_id: ID,
    changed_at: STAMP,
  },
};

export function migrationNamed(prefix: string): MigrationFile {
  const found = readMigrationFiles().find((migration) =>
    migration.fileName.startsWith(prefix),
  );
  if (found === undefined)
    throw new Error(`no migration starts with ${prefix}`);
  return found;
}
