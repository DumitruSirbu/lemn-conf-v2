// Tests for the architectural boundary gate. `node --test`, needing only git: each case builds a
// scratch repository, writes one sample into it, runs the real script there and reads its exit and
// the sentence of the check that refused.
//
// No sample below spells a driver's name next to an import keyword: this file is one the gate reads,
// so the names are joined at run time and stand in the samples as DRIVER and PLAIN_DRIVER.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const GATE_SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "boundary.sh",
);
const SCOPED_DRIVER = ["@neondatabase", "serverless"].join("/");
const PLAIN_DRIVER = ["p", "g"].join("");
const SUPPLIER_FOLDER = ["design", "source"].join("-");

const GATE_PASSED = 0;
const GATE_REFUSED = 1;

const DRIVER_DECLARED =
  "BOUNDARY VIOLATION: a package.json outside packages/persistence declares a Postgres driver.";
const DRIVER_IMPORTED =
  "BOUNDARY VIOLATION: a Postgres driver is imported outside packages/persistence.";
const SUPPLIER_FOLDER_IMPORTED = `BOUNDARY VIOLATION: source imports from ${SUPPLIER_FOLDER}/, which is untracked and will be deleted.`;
const ALL_VIOLATIONS = [
  DRIVER_DECLARED,
  DRIVER_IMPORTED,
  SUPPLIER_FOLDER_IMPORTED,
];

// The scoped driver is refused as any quoted string, so only the plain driver's rows prove the
// keyword form; each form therefore stands once for each driver.
const IMPORT_FORMS = [
  ["a one-line import", 'import { a } from "NAME";'],
  ["a single-quoted import", "import { a } from 'NAME';"],
  ["a wrapped import", 'import {\n  a,\n  b,\n} from "NAME";'],
  ["a re-export", 'export { a } from "NAME";'],
  ["a bare import", 'import "NAME";'],
  ["a dynamic import", 'const driver = await import("NAME");'],
  ["a require", 'const driver = require("NAME");'],
  ["a subpath import", 'import { a } from "NAME/web";'],
];

const DRIVER_PLACEHOLDERS = [
  ["the scoped driver", "DRIVER"],
  ["the plain driver", "PLAIN_DRIVER"],
];

const ALLOWED_SOURCES = [
  [
    "a package whose name starts like the plain driver",
    'import format from "PLAIN_DRIVER-format";',
  ],
  [
    "a local module named like the plain driver",
    'import { pool } from "./PLAIN_DRIVER";',
  ],
  [
    "the plain driver's name as a bare string",
    'const dialect = "PLAIN_DRIVER";',
  ],
  ["a backticked mention in a comment", "// The repository wraps `DRIVER`."],
  [
    "a comment naming the supplier folder",
    "// Ported from SUPPLIER_FOLDER/kitchen.js.",
  ],
];

const SOURCE_EXTENSIONS = [
  "ts",
  "tsx",
  "mts",
  "cts",
  "js",
  "jsx",
  "mjs",
  "cjs",
];

for (const [driver, placeholder] of DRIVER_PLACEHOLDERS) {
  for (const [form, template] of IMPORT_FORMS) {
    test(`refuses ${form} of ${driver} outside the persistence package`, () => {
      const outcome = runGateWith({
        "apps/web/src/sample.ts": template.replace("NAME", placeholder),
      });

      assertRefusedOnlyFor(outcome, DRIVER_IMPORTED);
    });
  }
}

test("refuses a mocked module of the scoped driver", () => {
  const outcome = runGateWith({
    "apps/web/tests/sample.test.ts": 'vi.mock("DRIVER", () => ({}));',
  });

  assertRefusedOnlyFor(outcome, DRIVER_IMPORTED);
});

test("refuses a wrapped import from the supplier folder", () => {
  const outcome = runGateWith({
    "apps/web/src/sample.ts": 'import {\n  a,\n} from "../SUPPLIER_FOLDER/a";',
  });

  assertRefusedOnlyFor(outcome, SUPPLIER_FOLDER_IMPORTED);
});

for (const extension of SOURCE_EXTENSIONS) {
  test(`reads a .${extension} file`, () => {
    const outcome = runGateWith({
      [`apps/web/src/sample.${extension}`]: 'import "PLAIN_DRIVER";',
    });

    assertRefusedOnlyFor(outcome, DRIVER_IMPORTED);
  });
}

test("reads a nested file when the root holds a file of the same extension", () => {
  const outcome = runGateWith({
    "tool.config.mjs": "export default {};",
    "apps/web/src/sample.mjs": 'import "PLAIN_DRIVER";',
  });

  assertRefusedOnlyFor(outcome, DRIVER_IMPORTED);
});

test("refuses a violation in a file git does not track yet", () => {
  const outcome = runGateWith(
    {},
    { "apps/web/src/new.ts": 'import "PLAIN_DRIVER";' },
  );

  assertRefusedOnlyFor(outcome, DRIVER_IMPORTED);
});

for (const [description, sample] of ALLOWED_SOURCES) {
  test(`allows ${description}`, () => {
    const outcome = runGateWith({ "apps/web/src/sample.ts": sample });

    assertPassed(outcome);
  });
}

test("allows every driver form inside the persistence package", () => {
  const outcome = runGateWith({
    "packages/persistence/src/open.ts": 'import { neon } from "DRIVER";',
    "packages/persistence/src/pool.ts": 'import { Pool } from "PLAIN_DRIVER";',
    "packages/persistence/tests/open.test.ts": 'vi.mock("DRIVER");',
    "packages/persistence/package.json":
      '{ "dependencies": { "DRIVER": "1.1.0" } }',
  });

  assertPassed(outcome);
});

test("refuses a nested package.json that declares the scoped driver", () => {
  const outcome = runGateWith({
    "apps/web/package.json": '{ "devDependencies": { "DRIVER": "1.1.0" } }',
  });

  assertRefusedOnlyFor(outcome, DRIVER_DECLARED);
});

test("refuses a root package.json that declares the plain driver", () => {
  const outcome = runGateWith({
    "package.json": '{ "dependencies": { "PLAIN_DRIVER": "8.0.0" } }',
  });

  assertRefusedOnlyFor(outcome, DRIVER_DECLARED);
});

test("refuses a package.json in a package named like the persistence package", () => {
  const outcome = runGateWith({
    "packages/persistence-extra/package.json":
      '{ "dependencies": { "DRIVER": "1.1.0" } }',
  });

  assertRefusedOnlyFor(outcome, DRIVER_DECLARED);
});

for (const [driver, placeholder] of DRIVER_PLACEHOLDERS) {
  test(`refuses a package.json that declares ${driver} behind an npm alias`, () => {
    const outcome = runGateWith({
      "apps/web/package.json": `{ "dependencies": { "db-driver": "npm:${placeholder}@1.0.0" } }`,
    });

    assertRefusedOnlyFor(outcome, DRIVER_DECLARED);
  });
}

test("allows a package.json that declares neither driver", () => {
  const outcome = runGateWith({
    "apps/web/package.json":
      '{ "dependencies": { "PLAIN_DRIVER-format": "npm:PLAIN_DRIVER-format@1.0.0" } }',
  });

  assertPassed(outcome);
});

function assertRefusedOnlyFor(outcome, expectedViolation) {
  assert.equal(outcome.status, GATE_REFUSED, outcome.stdout);
  assert.deepEqual(violationsIn(outcome), [expectedViolation]);
}

function assertPassed(outcome) {
  assert.equal(outcome.status, GATE_PASSED, outcome.stdout + outcome.stderr);
  assert.deepEqual(violationsIn(outcome), []);
}

function violationsIn(outcome) {
  return ALL_VIOLATIONS.filter((violation) =>
    outcome.stdout.includes(violation),
  );
}

function runGateWith(trackedFiles, untrackedFiles = {}) {
  const repository = mkdtempSync(join(tmpdir(), "boundary-gate-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: repository });
    cpSync(GATE_SCRIPT, join(repository, "boundary.sh"));
    writeSamples(repository, trackedFiles);
    execFileSync("git", ["add", "--all"], { cwd: repository });
    writeSamples(repository, untrackedFiles);
    return spawnSync("sh", ["boundary.sh"], {
      cwd: repository,
      encoding: "utf8",
    });
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

function writeSamples(repository, files) {
  for (const [path, sample] of Object.entries(files)) {
    const target = join(repository, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${spellOut(sample)}\n`);
  }
}

function spellOut(sample) {
  return sample
    .replaceAll("PLAIN_DRIVER", PLAIN_DRIVER)
    .replaceAll("DRIVER", SCOPED_DRIVER)
    .replaceAll("SUPPLIER_FOLDER", SUPPLIER_FOLDER);
}
