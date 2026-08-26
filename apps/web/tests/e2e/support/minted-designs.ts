import { deleteDesignsForTests } from "@lemnaria/persistence";

/**
 * Deletes the design rows a spec caused to be minted.
 *
 * Any spec that mutates the configurator mints a row: the store schedules a save after the first
 * successful command, and `POST /api/designs` creates it. Without this the test database grows by
 * a row per run, forever — the same cleanup obligation `design-write-path.e2e.spec.ts` carries,
 * and the third mechanism of ADR 0006.
 *
 * The dev server behind the suite runs against the **test** database (`playwright.config.ts`), so
 * these ids are never in the application's own.
 */
export async function deleteMintedDesigns(
  designIds: readonly string[],
): Promise<void> {
  if (designIds.length === 0) return;

  const connectionUrl = process.env.TEST_DATABASE_URL;
  if (!connectionUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set in the worker environment, so the designs this suite minted " +
        "cannot be deleted. playwright.config.ts is what puts it there.",
    );
  }

  // The SQL lives in `packages/persistence`, the only package allowed to import a Postgres driver
  // (`scripts/gates/boundary.sh`).
  await deleteDesignsForTests(connectionUrl, designIds);
}
