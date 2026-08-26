import { neon } from "@neondatabase/serverless";

/**
 * Deletes the named designs. **Test support only** — never call this from application code.
 *
 * It lives here for the reason every other statement in this package does: a Postgres driver
 * appears in exactly one package, which is what makes "no string-built SQL anywhere" auditable in
 * one place (`scripts/gates/boundary.sh`). A suite that mints rows still has to remove them
 * (ADR 0006's third mechanism), and doing that with its own `neon()` call put a driver import in
 * `apps/web` — a real boundary violation, and one the gate could not see until the file was
 * committed, because `git grep` searches tracked files only.
 *
 * The application's role cannot reach this: ADR 0008 grants `app_designs` no `delete`. The caller
 * therefore has to supply an owner connection, and passing the application's `DATABASE_URL` is
 * refused by the same guard the live suites use.
 */
export async function deleteDesignsForTests(
  connectionUrl: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const sql = neon(connectionUrl);
  // One statement per id rather than one `= any(...)`: the id list is short, and a per-row delete
  // needs no array binding to be correct.
  for (const id of ids) await sql`delete from designs where id = ${id}`;
}
