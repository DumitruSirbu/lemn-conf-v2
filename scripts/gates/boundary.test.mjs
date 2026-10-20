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
// keyword form. The scoped driver stands in the three forms its own pattern can tell apart: the
// name, the other quote and a subpath.
const FORMS_THE_QUOTED_NAME_TELLS_APART = [
  ["a one-line import", 'import { a } from "NAME";'],
  ["a single-quoted import", "import { a } from 'NAME';"],
  ["a subpath import", 'import { a } from "NAME/web";'],
];

const FORMS_ONLY_THE_KEYWORD_TELLS_APART = [
  ["a wrapped import", 'import {\n  a,\n  b,\n} from "NAME";'],
  ["a re-export", 'export { a } from "NAME";'],
  ["a bare import", 'import "NAME";'],
  ["a dynamic import", 'const driver = await import("NAME");'],
  ["a require", 'const driver = require("NAME");'],
];

const REFUSED_IMPORTS = [
  ["the scoped driver", "DRIVER", FORMS_THE_QUOTED_NAME_TELLS_APART],
  [
    "the plain driver",
    "PLAIN_DRIVER",
    [
      ...FORMS_THE_QUOTED_NAME_TELLS_APART,
      ...FORMS_ONLY_THE_KEYWORD_TELLS_APART,
    ],
  ],
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

for (const [driver, placeholder, forms] of REFUSED_IMPORTS) {
  for (const [form, template] of forms) {
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

// A hook runs in a linked worktree: its GIT_DIR is a directory under the shared `.git`, and a
// `git init` that inherits it writes `core.bare` into the shared config. The clone is built in a
// temporary directory so the test can watch that config without risking a real one.
test("a GIT_DIR exported by a git hook neither misleads the gate nor marks the clone bare", () => {
  const clone = createCloneWithLinkedWorktree();
  try {
    const hookEnvironment = { ...process.env, GIT_DIR: clone.worktreeGitDir };

    const refused = runGateUnder(hookEnvironment, {
      trackedFiles: { "apps/web/src/sample.ts": 'import { a } from "DRIVER";' },
      untrackedFiles: {},
    });
    const passed = runGateUnder(hookEnvironment, {
      trackedFiles: { "apps/web/src/sample.ts": "export const a = 1;" },
      untrackedFiles: {},
    });

    assertRefusedOnlyFor(refused, DRIVER_IMPORTED);
    assertPassed(passed);
    assert.equal(readSharedConfigBare(clone), "false");
  } finally {
    rmSync(clone.root, { recursive: true, force: true });
  }
});

function createCloneWithLinkedWorktree() {
  const root = mkdtempSync(join(tmpdir(), "boundary-gate-hook-"));
  const main = join(root, "main");
  const environment = withoutGitVariables(process.env);
  const git = (cwd, ...args) =>
    execFileSync("git", args, { cwd, env: environment, stdio: "pipe" });
  mkdirSync(main);
  git(main, "init", "--quiet");
  git(
    main,
    "-c",
    "user.name=boundary-test",
    "-c",
    "user.email=boundary-test@example.invalid",
    "commit",
    "--quiet",
    "--allow-empty",
    "--message",
    "root",
  );
  git(main, "worktree", "add", "--quiet", join(root, "linked"), "-b", "linked");
  return {
    root,
    sharedConfig: join(main, ".git", "config"),
    worktreeGitDir: join(main, ".git", "worktrees", "linked"),
  };
}

function readSharedConfigBare(clone) {
  return execFileSync(
    "git",
    ["config", "--file", clone.sharedConfig, "core.bare"],
    { encoding: "utf8" },
  ).trim();
}

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
  return runGateUnder(process.env, { trackedFiles, untrackedFiles });
}

// `callerEnvironment` is what the process that started the tests exported. A git hook exports
// GIT_DIR; handed on to `git init`, that variable points the "scratch" repository at the real one,
// which `git init` then rewrites as bare. Every git command a hook runs after that, in every
// worktree of the clone, stops with "this operation must be run in a work tree".
function runGateUnder(callerEnvironment, { trackedFiles, untrackedFiles }) {
  const environment = withoutGitVariables(callerEnvironment);
  const repository = mkdtempSync(join(tmpdir(), "boundary-gate-"));
  try {
    execFileSync("git", ["init", "--quiet"], {
      cwd: repository,
      env: environment,
    });
    cpSync(GATE_SCRIPT, join(repository, "boundary.sh"));
    writeSamples(repository, trackedFiles);
    execFileSync("git", ["add", "--all"], {
      cwd: repository,
      env: environment,
    });
    writeSamples(repository, untrackedFiles);
    return spawnSync("sh", ["boundary.sh"], {
      cwd: repository,
      encoding: "utf8",
      env: environment,
    });
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

function withoutGitVariables(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !name.startsWith("GIT_")),
  );
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
