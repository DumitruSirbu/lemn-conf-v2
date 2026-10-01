import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * M7 wave 7E3a S3's close-out obligation (D8), made a real regression test in review round 1
 * (L1.2). `<ConfigureScreen>` renders the store's `designId: null` / `canWrite: true` mint-on-
 * first-command branch (`app/configurator/configure/configure-screen.tsx`), and since S3 deleted
 * the route that used to mount it directly, `hydrate-and-configure.tsx` is the only place that
 * branch is reachable from at all (backlog: "store mint-on-first-command branch has no route since
 * 7E3a"). A second mount anywhere else would resurrect a route into that branch silently — a
 * `git grep` run once cannot catch a mount added after it, so this walks the whole source tree.
 *
 * **Widened to two files in M7 wave 7E3c (D6).** `shared-design-view.tsx` is the share view's own
 * hydrator, mounting the `"shared"` variant with `canWrite: false` and a sentinel id — never the
 * mint-on-first-command branch this test's own reason exists to guard, so admitting it here does not
 * reopen that branch to a second route. Any *other* file mounting `<ConfigureScreen>` still would.
 */

const SRC_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));
const ALLOWED_MOUNTS = [
  "app/d/[id]/hydrate-and-configure.tsx",
  "app/s/[token]/shared-design-view.tsx",
];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const MOUNT_PATTERN = /<ConfigureScreen\b/;

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    return statSync(fullPath).isDirectory()
      ? sourceFilesUnder(fullPath)
      : SOURCE_EXTENSIONS.has(extname(entry))
        ? [fullPath]
        : [];
  });
}

describe("<ConfigureScreen> is mounted nowhere but the two routes left to it", () => {
  it("appears only in hydrate-and-configure.tsx and shared-design-view.tsx", () => {
    const mountedIn = sourceFilesUnder(SRC_ROOT)
      .filter((path) => MOUNT_PATTERN.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC_ROOT, path))
      .sort();

    expect(mountedIn).toEqual([...ALLOWED_MOUNTS].sort());
  });
});
