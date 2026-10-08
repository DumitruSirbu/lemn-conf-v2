// Tests for the architectural boundary gate. `node --test`, needing only git: each case builds a
// scratch repository, writes one sample into it, runs the real script there and reads its exit.
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

const REFUSED_SOURCES = [
  ["a one-line import", 'import { neon } from "DRIVER";'],
  ["a single-quoted import", "import { neon } from 'DRIVER';"],
  ["a wrapped import", 'import {\n  Client,\n  neon,\n} from "DRIVER";'],
  ["a re-export", 'export { neon } from "DRIVER";'],
  ["a bare import", 'import "DRIVER";'],
  ["a dynamic import", 'const driver = await import("DRIVER");'],
  ["a require", 'const driver = require("DRIVER");'],
  ["a subpath import", 'import { neon } from "DRIVER/web";'],
  ["a mocked module", 'vi.mock("DRIVER", () => ({}));'],
  [
    "a one-line import of the plain driver",
    'import { Pool } from "PLAIN_DRIVER";',
  ],
  [
    "a wrapped import of the plain driver",
    'import {\n  Pool,\n} from "PLAIN_DRIVER";',
  ],
  ["a dynamic import of the plain driver", 'await import("PLAIN_DRIVER");'],
  ["a require of the plain driver", 'require("PLAIN_DRIVER");'],
  [
    "a wrapped import from the supplier folder",
    'import {\n  a,\n} from "../SUPPLIER_FOLDER/a";',
  ],
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

for (const [description, sample] of REFUSED_SOURCES) {
  test(`refuses ${description} outside the persistence package`, () => {
    const outcome = runGateWith({ "apps/web/src/sample.ts": sample });

    assert.equal(outcome.status, GATE_REFUSED, outcome.stdout);
  });
}

for (const extension of SOURCE_EXTENSIONS) {
  test(`reads a .${extension} file`, () => {
    const outcome = runGateWith({
      [`apps/web/src/sample.${extension}`]: 'import "DRIVER";',
    });

    assert.equal(outcome.status, GATE_REFUSED, outcome.stdout);
  });
}

for (const [description, sample] of ALLOWED_SOURCES) {
  test(`allows ${description}`, () => {
    const outcome = runGateWith({ "apps/web/src/sample.ts": sample });

    assert.equal(outcome.status, GATE_PASSED, outcome.stdout);
  });
}

test("allows every driver form inside the persistence package", () => {
  const outcome = runGateWith({
    "packages/persistence/src/open.ts": 'import { neon } from "DRIVER";',
    "packages/persistence/tests/open.test.ts": 'vi.mock("DRIVER");',
    "packages/persistence/package.json":
      '{ "dependencies": { "DRIVER": "1.1.0" } }',
  });

  assert.equal(outcome.status, GATE_PASSED, outcome.stdout);
});

test("refuses a violation in a file git does not track yet", () => {
  const outcome = runGateWith(
    {},
    { "apps/web/src/new.ts": 'import "DRIVER";' },
  );

  assert.equal(outcome.status, GATE_REFUSED, outcome.stdout);
});

test("refuses a nested package.json that declares the scoped driver", () => {
  const outcome = runGateWith({
    "apps/web/package.json": '{ "devDependencies": { "DRIVER": "1.1.0" } }',
  });

  assert.equal(outcome.status, GATE_REFUSED, outcome.stdout);
});

test("refuses a root package.json that declares the plain driver", () => {
  const outcome = runGateWith({
    "package.json": '{ "dependencies": { "PLAIN_DRIVER": "8.0.0" } }',
  });

  assert.equal(outcome.status, GATE_REFUSED, outcome.stdout);
});

test("allows a package.json that declares neither driver", () => {
  const outcome = runGateWith({
    "apps/web/package.json":
      '{ "dependencies": { "PLAIN_DRIVER-format": "1.0.0" } }',
  });

  assert.equal(outcome.status, GATE_PASSED, outcome.stdout);
});

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
