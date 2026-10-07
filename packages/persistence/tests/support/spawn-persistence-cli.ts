import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PACKAGE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const DEFAULT_TIMEOUT_MS = 30_000;
const TSX_BIN = resolve(PACKAGE_ROOT, "node_modules", ".bin", "tsx");

export interface SpawnedCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** An obviously-invalid sentinel `spawnPersistenceCli` supplies for `MIGRATION_DATABASE_URL` when a
 *  caller's `env` does not set it. Named so a test failure that surfaces it is legible on sight. Its
 *  scheme is neither `postgres:` nor `postgresql:`, so `databaseNameOf` (`migrate.ts`) maps it to its
 *  untrusted-connection-shape placeholder, which `assertDeclaredEnvironmentReaches` refuses under
 *  every declared environment — never a string a real environment or database name could collide
 *  with. */
const CALLER_DID_NOT_SET_MIGRATION_DATABASE_URL =
  "not-a-url://caller-did-not-set-this";

/**
 * Runs one of this package's CLI entry points (`src/migrate.ts`, `src/migrate-status.ts`) as a real
 * child process, the way `pnpm run migrate` does — rather than importing its side-effecting top
 * level into the test's own process, which would run it against whatever `MIGRATION_DATABASE_URL`
 * the *test* process happens to hold.
 *
 * `env` is the child's **entire** environment, replacing rather than extending this process's own —
 * so a test proves exactly what the script did or did not read. That alone is not enough to keep a
 * test that forgets to set `MIGRATION_DATABASE_URL` safe: the child still runs `loadEnvLocal()` on
 * its own, and `loadEnvLocal`'s `??=` fills any variable **absent from its environment** — not just
 * one explicitly cleared — from `.env.migration.local`, which locally holds the production
 * credential. A caller that forgot the variable would silently get that credential rather than an
 * unset one. This helper closes that gap itself, rather than relying on every future caller
 * remembering R3's rule: unless `env` sets `MIGRATION_DATABASE_URL`, the child gets
 * `CALLER_DID_NOT_SET_MIGRATION_DATABASE_URL` instead, which is always refused (see its own doc
 * comment) — so `loadEnvLocal` has nothing left to fill and a forgetful test fails loudly rather than
 * quietly reaching a real database. An explicit `env.MIGRATION_DATABASE_URL`, including the empty
 * string, still wins over this default, since it is spread in after it. `PATH` is carried across
 * because the child needs it to resolve its own dynamic imports; nothing else is.
 */
export async function spawnPersistenceCli(
  scriptRelativePath: string,
  args: readonly string[],
  env: Readonly<Record<string, string>>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SpawnedCliResult> {
  const childEnv: NodeJS.ProcessEnv = {
    PATH: process.env["PATH"] ?? "",
    MIGRATION_DATABASE_URL: CALLER_DID_NOT_SET_MIGRATION_DATABASE_URL,
    ...env,
  };

  try {
    const { stdout, stderr } = await execFileAsync(
      TSX_BIN,
      [scriptRelativePath, ...args],
      { cwd: PACKAGE_ROOT, env: childEnv, timeout: timeoutMs },
    );
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    return exitCodeAndOutputOf(error, timeoutMs);
  }
}

/** `execFile`'s rejection carries the same `stdout`/`stderr`/`code` shape as a success, just thrown
 *  instead of resolved — this package's CLIs signal failure with a non-zero exit code. A child killed at
 *  the timeout is the exception: it did not exit, so it is a failed test and never an exit code. */
function exitCodeAndOutputOf(
  error: unknown,
  timeoutMs: number,
): SpawnedCliResult {
  const failure = error as {
    code?: number;
    killed?: boolean;
    stdout?: string;
    stderr?: string;
  };
  if (failure.killed === true)
    throw new Error(
      `The CLI did not exit within ${String(timeoutMs)} ms and was killed; its output so far: ` +
        `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    );
  return {
    exitCode: failure.code ?? 1,
    stdout: failure.stdout ?? "",
    stderr: failure.stderr ?? "",
  };
}
