import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE_ROOT = join(import.meta.dirname, "../../../src");
const TEST_ROOT = join(import.meta.dirname, "../..");
const ENV_EXAMPLE = join(import.meta.dirname, "../../../../../.env.example");

export const PROCESS_ENV_OR_BUILD_MODE = /process\.env|NODE_ENV/;

/** The text of a file under `apps/web/src`, by its path relative to it. */
export function readSource(path: string): string {
  return readFileSync(join(SOURCE_ROOT, path), "utf8");
}

/** Paths under `apps/web/src`, relative to it, of the source files whose text matches `pattern`. */
export function sourceFilesMatching(pattern: RegExp): string[] {
  return readdirSync(SOURCE_ROOT, { recursive: true })
    .map(String)
    .filter((path) => /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path))
    .filter((path) => pattern.test(readSource(path)));
}

/** The lines of `.env.example` that declare `name`, with any leading comment mark taken off. */
export function declarationsInEnvExample(name: string): string[] {
  return readFileSync(ENV_EXAMPLE, "utf8")
    .split("\n")
    .map((line) => line.replace(/^#\s*/, ""))
    .filter((line) => line.startsWith(`${name}=`));
}

/** Whether `name` is declared in `.env.example` only as a comment, so copying the file defines nothing. */
export function isOnlyCommentedInEnvExample(name: string): boolean {
  return readFileSync(ENV_EXAMPLE, "utf8")
    .split("\n")
    .every((line) => !line.startsWith(`${name}=`));
}

/** The text of a file under `apps/web/tests`, by its path relative to it. */
export function readTestSource(path: string): string {
  return readFileSync(join(TEST_ROOT, path), "utf8");
}

/** Paths under `apps/web/tests`, relative to it, of the test files whose text matches `pattern`. */
export function testFilesMatching(pattern: RegExp): string[] {
  return readdirSync(TEST_ROOT, { recursive: true })
    .map(String)
    .filter((path) => /\.(?:ts|tsx|mts|cts)$/.test(path))
    .filter((path) =>
      pattern.test(readFileSync(join(TEST_ROOT, path), "utf8")),
    );
}
