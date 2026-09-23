import {
  deleteDesignsForTests,
  findDesignIdsForTests,
} from "@lemnaria/persistence";

/**
 * Deletes the design rows a spec caused to be minted.
 *
 * Any spec that mutates the configurator mints a row: the store schedules a save after the first
 * successful command, and `POST /api/designs` creates it. Without this the test database grows by
 * a row per run, forever — the same cleanup obligation every live suite carries, and the third
 * mechanism of ADR 0006.
 *
 * The connection is not passed in: `deleteDesignsForTests` resolves it through the same guard the
 * live suites use, which refuses the application's own database outright (finding DB-001).
 */
export async function deleteMintedDesigns(
  designIds: readonly string[],
): Promise<void> {
  if (designIds.length === 0) return;

  // The SQL lives in `packages/persistence`, the only package allowed to import a Postgres driver
  // (`scripts/gates/boundary.sh`).
  await deleteDesignsForTests(designIds);
}

/**
 * Answers which of `designIds` still have a row in the test database — read-only, for proving a
 * delete actually happened. M7 wave 7E3b, S4: since ADR 0114 decision 5 gates every cookie-less
 * `GET /api/designs/{id}` to 404 whether or not the row exists, that response can no longer stand
 * in for "the row is gone" (`seeded-design.qa.e2e.spec.ts`, criterion 9).
 */
export async function findMintedDesignIds(
  designIds: readonly string[],
): Promise<string[]> {
  if (designIds.length === 0) return [];
  return findDesignIdsForTests(designIds);
}
