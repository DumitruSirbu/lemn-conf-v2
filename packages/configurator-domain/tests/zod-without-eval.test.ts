// 8Q.10, criterion 13: importing the built package and parsing with every schema it exports constructs
// no `Function`. Zod 4 probes for eval with `new Function("")` when it builds its first object schema,
// and under the enforced CSP that probe is a `script-src` violation on every page view.
//
// The graph under test is a fresh `node` process on `dist/index.js`, the file `apps/web` loads: Zod
// caches the probe in module state, so only a process that has not loaded it can show whether it runs.
// A bare `vitest run` does not build; a stale `dist/` is caught by `dist-module-graph.test.ts`.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const BUILT_ENTRY_URL = pathToFileURL(
  path.join(PACKAGE_ROOT, "dist", "index.js"),
).href;
const TRAP_SCRIPT = path.join(
  PACKAGE_ROOT,
  "tests",
  "support",
  "function-construction-trap.mjs",
);

interface Outcome {
  readonly hasSample: boolean;
  readonly validAccepted: boolean;
  readonly invalidRefused: boolean;
}

interface TrapReport {
  readonly constructions: readonly (readonly string[])[];
  readonly schemaNames: readonly string[];
  readonly outcomes: Readonly<Record<string, Outcome>>;
}

function importAndParseInAFreshProcess(): TrapReport {
  const stdout = execFileSync(
    process.execPath,
    [TRAP_SCRIPT, BUILT_ENTRY_URL],
    {
      encoding: "utf8",
    },
  );
  return JSON.parse(stdout) as TrapReport;
}

describe("Zod without eval (8Q.10)", () => {
  const report = importAndParseInAFreshProcess();

  it("constructs no Function while the package is imported and every schema parses", () => {
    expect(report.constructions).toEqual([]);
  });

  // Non-vacuity: a trap that parsed nothing would see no construction either, so the parses it made are
  // checked to have run on a value each schema accepts and on one it refuses.
  it("parsed every exported schema with a value it accepts and one it refuses", () => {
    expect(report.schemaNames.length).toBeGreaterThan(10);
    const outcomes = Object.entries(report.outcomes);
    expect(outcomes.filter(([, outcome]) => !outcome.hasSample)).toEqual([]);
    expect(outcomes.filter(([, outcome]) => !outcome.validAccepted)).toEqual(
      [],
    );
    expect(outcomes.filter(([, outcome]) => !outcome.invalidRefused)).toEqual(
      [],
    );
  });
});
