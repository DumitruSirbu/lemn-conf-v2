import { readFileSync } from "node:fs";
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
