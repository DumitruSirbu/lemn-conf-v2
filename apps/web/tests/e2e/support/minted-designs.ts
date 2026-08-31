import { deleteDesignsForTests } from "@lemnaria/persistence";

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
