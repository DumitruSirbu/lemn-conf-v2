import { resolveTestDatabaseUrl } from "../../src/test-database-url.js";

/**
 * The one place a live suite in this package decides whether it has a database to run against.
 *
 * **Why this exists (M7 wave 7T).** Every live suite used to gate itself on
 * `Boolean(process.env["DATABASE_URL"])`, and `.github/workflows/ci.yml`'s `test` job deliberately
 * never sets that variable — it sets `TEST_DATABASE_URL`, which is all `resolveTestDatabaseUrl`
 * needs. The suites therefore reported green in CI without ever having executed, which is a check
 * that cannot distinguish the property it claims to hold. The gate now asks the question the suites
 * actually depend on: is a test database resolvable?
 *
 * `DATABASE_URL` remains an accepted source because `resolveTestDatabaseUrl` derives a test URL from
 * it by swapping only the database name — that is how a developer holding only `.env.local` runs
 * these suites, and dropping it would silence them on exactly the machines where they used to run.
 *
 * The resolution is **not** softened: `resolveTestDatabaseUrl` still runs `assertSafeTestDatabaseUrl`
 * and still throws on anything but an allowlisted test database (ADR 0006). A misconfiguration fails
 * at import with that refusal rather than being folded into a skip.
 */
const resolvedUrl = resolveConfiguredTestDatabaseUrl();

/** True when this run has a test database to write to. The gate for every live suite. */
export const isLiveTestDatabaseConfigured = resolvedUrl !== undefined;

/** The connection string live suites use, or `""` when none is configured and they all skip. */
export const liveTestDatabaseUrl = resolvedUrl ?? "";

/**
 * Names a suite that is about to skip, on stderr, because a skipped live suite is the failure this
 * wave exists to remove and a reporter's "skipped" count does not say *which* coverage is absent or
 * why. Call it at module scope, beside the gate — a `beforeAll` inside a skipped `describe` never
 * runs.
 */
export function announceSkippedLiveSuite(suiteName: string): void {
  console.warn(
    `[live-suite skipped] ${suiteName}: no live test database is configured. ` +
      `Set TEST_DATABASE_URL (or DATABASE_URL to derive one from) to run it; in CI it is the ` +
      `TEST_DATABASE_URL repository secret.`,
  );
}

function resolveConfiguredTestDatabaseUrl(): string | undefined {
  if (!hasADatabaseUrlToResolveFrom()) return undefined;
  return resolveTestDatabaseUrl();
}

function hasADatabaseUrlToResolveFrom(): boolean {
  return isSet("TEST_DATABASE_URL") || isSet("DATABASE_URL");
}

function isSet(variableName: string): boolean {
  const value = process.env[variableName]?.trim();
  return value !== undefined && value !== "";
}
