// The built module graph is acyclic, asserted on `dist/` because `dist/` is what `apps/web` loads.
//
// **Why this test is worth its weight, in one incident.** Wave 5B4b's merge imported `LEVEL_SNAP_M`
// from `void-engine.ts`, which imported the merge back. An ES module cycle does not error: the
// second module's body runs before the first has bound its constants, so a top-level read resolves
// to `undefined`, `undefined * 1000` is `NaN`, every tolerance comparison answered false, and the
// merge silently never fired — while the whole suite stayed green, because it was green against a
// no-op. `module-grid.ts` exists to break that edge (see its head comment). This asserts the edge is
// still broken rather than leaving a "never hoist this read" comment where an enforced invariant
// belongs.
//
// A test rather than `eslint-plugin-import`'s `no-cycle`: no new dependency, no lockfile churn — a
// CI gate of its own — and no graph-walking rule on every lint.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DIST = path.join(PACKAGE_ROOT, "dist");
const SOURCE = path.join(PACKAGE_ROOT, "src");

/** Every relative specifier an emitted module imports or re-exports. `tsc` emits explicit `.js`
 *  extensions, so the specifier is the file name and no resolution is needed. */
const RELATIVE_SPECIFIER = /from\s+"(\.[^"]*)"/g;

function filesUnder(root: string, extension: string): readonly string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)),
    );
}

function importGraph(): ReadonlyMap<string, readonly string[]> {
  const graph = new Map<string, readonly string[]>();
  for (const file of filesUnder(DIST, ".js")) {
    const source = readFileSync(path.join(DIST, file), "utf8");
    const imported = [...source.matchAll(RELATIVE_SPECIFIER)].map((match) =>
      path.normalize(path.join(path.dirname(file), match[1] ?? "")),
    );
    graph.set(file, imported);
  }
  return graph;
}

/** The first cycle reachable from `start`, as the path that closes it — `a.js → b.js → a.js` — so a
 *  failure names the edge to cut instead of announcing that one exists. */
function findCycleFrom(
  start: string,
  graph: ReadonlyMap<string, readonly string[]>,
  settled: Set<string>,
  onStack: readonly string[] = [],
): readonly string[] | undefined {
  const closes = onStack.indexOf(start);
  if (closes !== -1) return [...onStack.slice(closes), start];
  if (settled.has(start)) return undefined;
  for (const next of graph.get(start) ?? []) {
    const cycle = findCycleFrom(next, graph, settled, [...onStack, start]);
    if (cycle) return cycle;
  }
  settled.add(start);
  return undefined;
}

describe("the built module graph", () => {
  // Vacuously green over an absent or stale `dist/` is the exact false clean this test exists to
  // stop, and a bare `vitest run` does not build (the package's own `test` script does). So the
  // build is checked before the graph is: every source module must have been emitted, and none may
  // be newer than what was emitted from it.
  it("is built, and built from the sources in the tree", () => {
    const emitted = new Set(filesUnder(DIST, ".js"));
    expect(emitted.size).toBeGreaterThan(0);

    for (const source of filesUnder(SOURCE, ".ts")) {
      const output = source.replace(/\.ts$/, ".js");
      expect(emitted, `dist is missing ${output}; run pnpm build`).toContain(
        output,
      );
      expect(
        statSync(path.join(SOURCE, source)).mtimeMs,
        `src/${source} is newer than dist/${output}; run pnpm build`,
      ).toBeLessThanOrEqual(statSync(path.join(DIST, output)).mtimeMs);
    }
  });

  it("has no cycle", () => {
    const graph = importGraph();
    const settled = new Set<string>();

    // One entry per distinct cycle: a module on a cyclic path is never settled, so the walk reaches
    // the same loop from every module that leads into it, and an unfiltered list would report one
    // cycle thirty times.
    const cycles = new Map<string, string>();
    for (const module of graph.keys()) {
      const cycle = findCycleFrom(module, graph, settled);
      if (cycle)
        cycles.set([...new Set(cycle)].sort().join(), cycle.join(" → "));
    }

    expect([...cycles.values()]).toEqual([]);
  });
});
