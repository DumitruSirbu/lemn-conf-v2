import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(PACKAGE_ROOT, "../..");

// Read before `.env.local` so their values win: `vercel env pull` rewrites `.env.local` wholesale,
// so anything not managed by Vercel has to live outside it to survive. `TEST_DATABASE_URL` is the
// database live tests may write to; `MIGRATION_DATABASE_URL` carries the privileged credentials
// migrations need and the application role deliberately lacks. All are covered by `.gitignore`'s
// `.env*.local`.
const ENV_FILES = [".env.test.local", ".env.migration.local", ".env.local"];

function parseEnvFile(contents: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const unquoted = /^".*"$|^'.*'$/.test(rawValue)
      ? rawValue.slice(1, -1)
      : rawValue;
    values.set(key, unquoted);
  }
  return values;
}

/** Loads the repository root's local env files into `process.env` for local/dev test runs, without
 *  adding a `dotenv` dependency. Missing in CI is expected and silent — live-database tests guard
 *  themselves with `it.skipIf(!process.env.DATABASE_URL)` rather than depending on this running. */
export function loadEnvLocal(): void {
  for (const fileName of ENV_FILES) {
    const path = resolve(REPO_ROOT, fileName);
    if (!existsSync(path)) continue;

    for (const [key, value] of parseEnvFile(readFileSync(path, "utf8"))) {
      process.env[key] ??= value;
    }
  }
}
