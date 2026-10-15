import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, vi } from "vitest";

const fetchSpy = vi.fn(() => {
  throw new Error("a mail test reached fetch");
});

/** Makes any request attempt throw, so a module that reaches the network fails its own test. */
export function forbidFetch(): void {
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
}

/** Fails the test that made a request even if the code under test swallowed the throw. */
export function releaseFetch(): void {
  vi.unstubAllGlobals();
  expect(fetchSpy).not.toHaveBeenCalled();
}

const MAIL_SOURCE_DIRECTORY = join(
  import.meta.dirname,
  "../../../../src/lib/server/mail",
);

export function readMailModuleSource(fileName: string): string {
  return readFileSync(join(MAIL_SOURCE_DIRECTORY, fileName), "utf8");
}

export const PROCESS_ENV_OR_BUILD_MODE = /process\.env|NODE_ENV/;

const SOURCE_ROOT = join(import.meta.dirname, "../../../../src");

/** Paths under `apps/web/src`, relative to it, of the files whose text matches `pattern`. */
export function sourceFilesMatching(pattern: RegExp): string[] {
  return readdirSync(SOURCE_ROOT, { recursive: true })
    .map(String)
    .filter((path) => /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path))
    .filter((path) =>
      pattern.test(readFileSync(join(SOURCE_ROOT, path), "utf8")),
    );
}
