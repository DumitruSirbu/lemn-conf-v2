import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import vitestConfig from "../vitest.config.js";

/**
 * The two censuses of M7 wave 7T (T-J7; criteria 7 and 13): **which gate** each database-reaching
 * test file uses, and **which test-schema lock mode** it declares. Both sweep exactly the files
 * vitest's `include` resolves — nested directories too — and compare what they find with a literal
 * table, so a new file that reaches a database without being classified here turns this file red.
 *
 * **The two census assertions are `it.fails` until wave 7T slice S2c.** S2b ships the lock helper
 * without touching a live suite, so today three suites still gate on `DATABASE_URL` and no file
 * registers a mode — both censuses are red by design. **S2c re-gates and registers, and must flip
 * both `it.fails` to `it`** in the same commit; an `it.fails` that starts passing its assertion goes
 * red on its own, so the flip cannot be forgotten. Do not delete them. S2c must also place each
 * registration before any module-scope statement that can run code — directly after the imports
 * is the simple way.
 *
 * **What this is, by ruling (coordinator, 2026-09-22): a tripwire against honest
 * misclassification, not a sandbox against an adversarial author.** It catches a live file somebody
 * forgot to classify or register. It does not try to catch one written to evade it.
 *
 * **How it reads a file.** Sources are parsed with the TypeScript compiler, not matched as text, so
 * a commented-out registration counts for nothing and an aliased import is read as the function it
 * really names. Pattern checks (URL sources, gates, the destructive pattern) run over the source
 * reprinted without comments. Module links followed: static imports, `export … from` re-exports and
 * `import("…")` with a literal path. `vitest.config.ts`'s `setupFiles` must match a literal list,
 * and none may open a connection.
 *
 * **What the lock covers, and what it cannot.** The lock is taken in a `beforeAll`, so it covers
 * **hooks and tests only**. Vitest runs module-scope statements, `vi.hoisted` and `describe` bodies
 * at **collection**, before any `beforeAll` — so database work there is never under the lock, by
 * vitest's design, wherever the registration sits. That is what this package's rule *"database
 * work only inside hooks and tests"* exists for. **The registration-first check guards hook order
 * only**: it makes the lock's `beforeAll` run before any other module-scope hook. It does not make
 * code below the registration safe, and nothing here checks collection-time database work.
 *
 * **Limits, stated so nobody trusts more than this proves:**
 * - **URL through a constant.** A file "reaches a database" if it names a database-URL source, or
 *   imports (by the links above) a module under `tests/` that opens a connection. A URL copied into
 *   a constant, a literal or another module's export that is not a connecting module escapes.
 * - **Opener names outside the list.** "Opens a connection" means calling or constructing a name in
 *   `CONNECTION_OPENERS`, bare or as a namespace member (`driver.neon(…)`, `new driver.Client(…)`).
 *   An opener outside that list, or reached under a renamed binding, escapes. A local function
 *   sharing a listed name is a false alarm, which fails loudly rather than quietly.
 * - **Dynamic paths.** An `import()` whose argument is not a string literal is not followed.
 * - **Collection-time code**, as above.
 * - A registration hidden inside a wrapper function counts as no registration, which is red, never
 *   green.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIRECTORY = resolve(HERE, "..");
const TESTS_DIRECTORY_NAME = "tests";
/** This file names every pattern it searches for, so it would classify itself. */
const THIS_FILE = "live-suite-census.test.ts";
/** The population the censuses sweep had 20 files when the wave was planned; fewer means the
 *  discovery is broken, not that files were deleted. */
const MINIMUM_TEST_FILE_COUNT = 20;

type Gate = "live test database" | "DATABASE_URL" | "both" | "none";
type LockDeclaration = "exclusive" | "shared" | "none" | "more than one";

interface ExpectedClassification {
  readonly gate: Gate;
  readonly lock: LockDeclaration;
  readonly reason: string;
}

/** The literal table (T-J7): three exclusive, two shared, two application-database files, and the
 *  files that name a database-URL source without taking the schema lock. Keys are paths under
 *  `tests/`. */
const EXPECTED_CLASSIFICATION: Readonly<
  Record<string, ExpectedClassification>
> = {
  "migrate.test.ts": {
    gate: "live test database",
    lock: "exclusive",
    reason: "drops the ledger, forgets rows and synthesises versions",
  },
  "neon-configuration-repository.test.ts": {
    gate: "live test database",
    lock: "exclusive",
    reason: "drops the revision column",
  },
  "neon-configuration-repository.adversarial.test.ts": {
    gate: "live test database",
    lock: "exclusive",
    reason: "drops write_token_hash and asserts a whole-table count",
  },
  "design-row-source.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason: "mints rows and needs the schema intact",
  },
  "backup-restore-round-trip.adversarial.test.ts": {
    gate: "live test database",
    lock: "shared",
    reason: "mints rows and needs the schema intact",
  },
  "application-role-privileges.test.ts": {
    gate: "DATABASE_URL",
    lock: "none",
    reason:
      "asserts the application role, on the application database (ADR 0008)",
  },
  "write-token-schema.adversarial.test.ts": {
    gate: "DATABASE_URL",
    lock: "none",
    reason: "reads the application database's own schema",
  },
  "test-schema-lock.test.ts": {
    gate: "live test database",
    lock: "none",
    reason:
      "the lock's self-test: contends only on random keys and touches no table",
  },
  "qa-7t-s2b-lock.adversarial.test.ts": {
    gate: "live test database",
    lock: "none",
    reason: "adversarial QA of the lock: random keys only, touches no table",
  },
  "test-database-url.test.ts": {
    gate: "none",
    lock: "none",
    reason:
      "unit test of the resolver: sets its variables and connects nowhere",
  },
  "delete-designs-for-tests.test.ts": {
    gate: "none",
    lock: "none",
    reason: "unit test with the driver mocked: connects nowhere",
  },
};

/** Every module `vitest.config.ts` lists in `setupFiles`, as written there. Vitest runs each before
 *  every test file, so one that connects would reach the database outside any file's lock. */
const EXPECTED_SETUP_FILES: readonly string[] = [];

/** A file that names any of these can reach a database. */
const DATABASE_URL_SOURCE =
  /liveTestDatabaseUrl|isLiveTestDatabaseConfigured|resolveTestDatabaseUrl|readDatabaseUrl|readMigrationDatabaseUrl|process\.env\["(?:TEST_|MIGRATION_)?DATABASE_URL"\]/;
const APPLICATION_DATABASE_GATE = 'Boolean(process.env["DATABASE_URL"])';
/** T-J7's destructive pattern: schema mutation, ledger surgery, or a whole-table aggregate. */
const DESTRUCTIVE_PATTERN =
  /alter table|drop |forgetAppliedMigrations|dropMigrationLedger|dropSynthesisedMigrationArtefacts|count\(\*\)/i;
/** Calling or constructing any of these opens a database connection: the driver's entry points and
 *  the package's own connecting entry points. */
const CONNECTION_OPENERS: ReadonlySet<string> = new Set([
  "neon",
  "Client",
  "Pool",
  "NeonConfigurationRepository",
  "runMigrations",
  "applyMigrations",
  "createNeonDesignRowSource",
]);
const LOCK_HELPER_MODULE = /(?:^|\/)support\/test-schema-lock\.js$/;
const LIVE_GATE_MODULE = /(?:^|\/)support\/live-test-database\.js$/;
const LIVE_GATE_EXPORT = "isLiveTestDatabaseConfigured";
const REGISTRATION_MODES: Readonly<Record<string, LockDeclaration>> = {
  holdExclusiveTestSchemaLock: "exclusive",
  holdSharedTestSchemaLock: "shared",
};

/** Every `.ts` module under `tests/`, keyed by its POSIX path relative to `tests/`. */
type TestTree = ReadonlyMap<string, string>;

interface LockRegistration {
  readonly mode: LockDeclaration;
  readonly isFirstCodeAtModuleScope: boolean;
}

interface ImportBinding {
  readonly localName: string;
  readonly importedName: string;
  readonly moduleSpecifier: string;
}

describe("the live-suite census (T-J7)", () => {
  const tree = readTestTree(PACKAGE_DIRECTORY);
  const testFiles = discoverTestFiles(PACKAGE_DIRECTORY).filter(
    (name) => name !== THIS_FILE,
  );
  const databaseReaching = databaseReachingFiles(tree, testFiles);

  it("sweeps every file vitest's include resolves, nested directories too", () => {
    expect(testFiles.length).toBeGreaterThanOrEqual(MINIMUM_TEST_FILE_COUNT);
  });

  it("classifies exactly the database-reaching files the table lists — a new one must be added", () => {
    expect(databaseReaching).toEqual(
      Object.keys(EXPECTED_CLASSIFICATION).sort(),
    );
  });

  it("finds no connection in a file the table says connects nowhere", () => {
    const connectingNowhere = Object.entries(EXPECTED_CLASSIFICATION)
      .filter(
        ([, expected]) => expected.gate === "none" && expected.lock === "none",
      )
      .map(([name]) => name);

    expect(connectingNowhere.length).toBeGreaterThan(0);
    expect(
      connectingNowhere.filter((name) => opensConnection(tree, name)),
    ).toEqual([]);
  });

  it("runs no setup module the table does not list, and none that opens a connection", () => {
    const setupFiles = setupFilesOf(vitestConfig.test?.setupFiles);

    expect(setupFiles).toEqual(EXPECTED_SETUP_FILES);
    expect(setupFilesThatConnect(tree, setupFiles)).toEqual([]);
  });

  // Expected red until S2c re-gates three suites onto live-test-database.ts. S2c flips it to `it`.
  it.fails(
    "gates every test-database file through live-test-database.ts, and only two on DATABASE_URL",
    () => {
      const observed = Object.fromEntries(
        databaseReaching.map((name) => [name, gateOf(sourceOf(tree, name))]),
      );

      expect(observed).toEqual(expectedField("gate"));
    },
  );

  // Expected red until S2c registers a mode in the five resolving suites. S2c flips it to `it`.
  it.fails(
    "gives each file its declared lock mode, first at module scope, and every destructive file exclusive",
    () => {
      const registrations = new Map(
        databaseReaching.map((name) => [
          name,
          lockRegistrationOf(sourceOf(tree, name)),
        ]),
      );
      const observedModes = Object.fromEntries(
        [...registrations].map(([name, registration]) => [
          name,
          registration.mode,
        ]),
      );

      expect(observedModes).toEqual(expectedField("lock"));
      expect(misplacedRegistrations(registrations)).toEqual([]);
      expect(destructiveFilesNotExclusive(tree, registrations)).toEqual([]);
    },
  );
});

describe("the census's discovery", () => {
  it("finds a test file in a nested directory, and no support module", () => {
    const packageDirectory = mkdtempSync(join(tmpdir(), "live-suite-census-"));
    try {
      writeSources(packageDirectory, {
        "a.test.ts": "",
        "nested/deeper/b.test.ts": "",
        "support/c.ts": "",
      });

      expect(discoverTestFiles(packageDirectory)).toEqual([
        "a.test.ts",
        "nested/deeper/b.test.ts",
      ]);
    } finally {
      rmSync(packageDirectory, { recursive: true, force: true });
    }
  });
});

describe("the census's registration reader, on synthetic sources", () => {
  const IMPORT_LOCK =
    'import { holdExclusiveTestSchemaLock, holdSharedTestSchemaLock } from "./support/test-schema-lock.js";\n';

  it("reads a registration directly after the imports as that file's mode, in first place", () => {
    const source = `${IMPORT_LOCK}holdSharedTestSchemaLock();\n\ndescribe("x", () => {});\n`;

    expect(lockRegistrationOf(source)).toEqual({
      mode: "shared",
      isFirstCodeAtModuleScope: true,
    });
  });

  it("allows only code that runs nothing above it: literals, types and function declarations", () => {
    const source =
      `${IMPORT_LOCK}const SUITE = "x";\ntype T = number;\nfunction later(): void { neon("u"); }\n` +
      "const lazy = () => neon(url);\nholdExclusiveTestSchemaLock();\n";

    expect(lockRegistrationOf(source).isFirstCodeAtModuleScope).toBe(true);
  });

  it("flags a module-scope beforeAll above the registration, which would run with no lock", () => {
    const source =
      `${IMPORT_LOCK}beforeAll(async () => {\n  await neon(url)\`select 1\`;\n});\n` +
      "holdSharedTestSchemaLock();\n";

    expect(lockRegistrationOf(source).isFirstCodeAtModuleScope).toBe(false);
  });

  it("flags a declaration that runs a call above the registration", () => {
    const source = `${IMPORT_LOCK}const rows = await neon(url)\`select 1\`;\nholdSharedTestSchemaLock();\n`;

    expect(lockRegistrationOf(source).isFirstCodeAtModuleScope).toBe(false);
  });

  it("flags a conditional statement above the registration", () => {
    const source = `${IMPORT_LOCK}if (!isLive) announceSkippedLiveSuite("x");\nholdSharedTestSchemaLock();\n`;

    expect(lockRegistrationOf(source).isFirstCodeAtModuleScope).toBe(false);
  });

  it("flags a registration nested inside a describe", () => {
    const source = `${IMPORT_LOCK}describe("x", () => {\n  holdExclusiveTestSchemaLock();\n});\n`;

    expect(lockRegistrationOf(source).isFirstCodeAtModuleScope).toBe(false);
  });

  it("flags a registration placed below the first describe", () => {
    const source = `${IMPORT_LOCK}describe("x", () => {});\nholdExclusiveTestSchemaLock();\n`;

    expect(lockRegistrationOf(source).isFirstCodeAtModuleScope).toBe(false);
  });

  it("reports two registrations in one file as more than one", () => {
    const source = `${IMPORT_LOCK}holdSharedTestSchemaLock();\nholdExclusiveTestSchemaLock();\n`;

    expect(lockRegistrationOf(source).mode).toBe("more than one");
  });

  it("reports a file with no registration as none", () => {
    expect(
      lockRegistrationOf(`${IMPORT_LOCK}describe("x", () => {});\n`).mode,
    ).toBe("none");
  });

  it("counts a commented-out registration as none", () => {
    const source = `${IMPORT_LOCK}/*\nholdSharedTestSchemaLock();\n*/\n// holdExclusiveTestSchemaLock();\n`;

    expect(lockRegistrationOf(source).mode).toBe("none");
  });

  it("reads an aliased registration as the mode it really takes", () => {
    const source =
      'import { holdSharedTestSchemaLock as holdExclusiveTestSchemaLock } from "./support/test-schema-lock.js";\n' +
      "holdExclusiveTestSchemaLock();\n";

    expect(lockRegistrationOf(source).mode).toBe("shared");
  });

  it("counts a call of the right name not imported from the lock helper as none", () => {
    expect(
      lockRegistrationOf(
        "function holdSharedTestSchemaLock(): void {}\nholdSharedTestSchemaLock();\n",
      ).mode,
    ).toBe("none");
  });
});

describe("the census's connection reader, on synthetic trees", () => {
  it("treats a test that reaches the database only through a support module as database-reaching", () => {
    const tree: TestTree = new Map([
      [
        "rogue.test.ts",
        'import { rogueSql } from "./support/rogue-sql.js";\nawait rogueSql`select 1`;\n',
      ],
      [
        "support/rogue-sql.ts",
        'import { neon } from "@neondatabase/serverless";\nexport const rogueSql = neon(url);\n',
      ],
    ]);

    expect(databaseReachingFiles(tree, ["rogue.test.ts"])).toEqual([
      "rogue.test.ts",
    ]);
  });

  it("follows a support module that connects through another support module", () => {
    const tree: TestTree = new Map([
      [
        "nested/rogue.test.ts",
        'import { outer } from "../support/outer.js";\n',
      ],
      [
        "support/outer.ts",
        'import { inner } from "./inner.js";\nexport const outer = inner;\n',
      ],
      ["support/inner.ts", "export const inner = () => new Client(url);\n"],
    ]);

    expect(databaseReachingFiles(tree, ["nested/rogue.test.ts"])).toEqual([
      "nested/rogue.test.ts",
    ]);
  });

  it("does not treat a test importing a support module that connects nowhere as database-reaching", () => {
    const tree: TestTree = new Map([
      ["plain.test.ts", 'import { rows } from "./support/rows.js";\n'],
      [
        "support/rows.ts",
        "export const rows = (source: Source) => source.read();\n",
      ],
    ]);

    expect(databaseReachingFiles(tree, ["plain.test.ts"])).toEqual([]);
  });

  it("finds a row mint added to a file that should connect nowhere", () => {
    const tree: TestTree = new Map([
      [
        "unit.test.ts",
        "const mint = () => neon(resolveTestDatabaseUrl())`insert into designs (id) values (1)`;\n",
      ],
    ]);

    expect(opensConnection(tree, "unit.test.ts")).toBe(true);
  });

  it("finds a Client constructed in a file that should connect nowhere", () => {
    const tree: TestTree = new Map([
      ["unit.test.ts", "const client = new Client(url);\n"],
    ]);

    expect(opensConnection(tree, "unit.test.ts")).toBe(true);
  });

  it("follows a support module's re-exports to the module that connects", () => {
    const tree: TestTree = new Map([
      ["rogue.test.ts", 'import { rogueSql } from "./support/index.js";\n'],
      ["support/index.ts", 'export { rogueSql } from "./rogue-sql.js";\n'],
      ["support/rogue-sql.ts", "export const rogueSql = neon(url);\n"],
    ]);

    expect(databaseReachingFiles(tree, ["rogue.test.ts"])).toEqual([
      "rogue.test.ts",
    ]);
  });

  it("follows a star re-export to the module that connects", () => {
    const tree: TestTree = new Map([
      ["rogue.test.ts", 'import { rogueSql } from "./support/index.js";\n'],
      ["support/index.ts", 'export * from "./rogue-sql.js";\n'],
      ["support/rogue-sql.ts", "export const rogueSql = neon(url);\n"],
    ]);

    expect(databaseReachingFiles(tree, ["rogue.test.ts"])).toEqual([
      "rogue.test.ts",
    ]);
  });

  it("treats a dynamic import of a connecting support module as database-reaching", () => {
    const tree: TestTree = new Map([
      [
        "rogue.test.ts",
        'it("x", async () => {\n  const { rogueSql } = await import("./support/rogue-sql.js");\n});\n',
      ],
      ["support/rogue-sql.ts", "export const rogueSql = neon(url);\n"],
    ]);

    expect(databaseReachingFiles(tree, ["rogue.test.ts"])).toEqual([
      "rogue.test.ts",
    ]);
  });

  it.each([
    ["a namespace neon call", "const sql = driver.neon(url);\n"],
    [
      "a namespace Client construction",
      "const client = new driver.Client(url);\n",
    ],
    ["a namespace Pool construction", "const pool = new driver.Pool(url);\n"],
  ])("finds %s in a file that should connect nowhere", (_label, source) => {
    const tree: TestTree = new Map([
      [
        "unit.test.ts",
        `import * as driver from "@neondatabase/serverless";\n${source}`,
      ],
    ]);

    expect(opensConnection(tree, "unit.test.ts")).toBe(true);
  });

  it("finds no connection in a file that only mentions the driver in a comment", () => {
    const tree: TestTree = new Map([
      ["unit.test.ts", "// neon(url) would open a connection here.\n"],
    ]);

    expect(opensConnection(tree, "unit.test.ts")).toBe(false);
  });
});

describe("the census's setup-file reader, on synthetic trees", () => {
  it("reads a single setup file or a list of them as package-relative paths", () => {
    expect(setupFilesOf("./tests/support/setup.ts")).toEqual([
      "tests/support/setup.ts",
    ]);
    expect(setupFilesOf(["tests/a.ts", "tests/b.ts"])).toEqual([
      "tests/a.ts",
      "tests/b.ts",
    ]);
    expect(setupFilesOf(undefined)).toEqual([]);
  });

  it("flags a setup module that opens a connection", () => {
    const tree: TestTree = new Map([
      [
        "support/setup.ts",
        'import { neon } from "@neondatabase/serverless";\nawait neon(url)`select 1`;\n',
      ],
    ]);

    expect(setupFilesThatConnect(tree, ["tests/support/setup.ts"])).toEqual([
      "tests/support/setup.ts",
    ]);
  });

  it("flags a setup module that connects through a support module", () => {
    const tree: TestTree = new Map([
      ["support/setup.ts", 'import "./rogue-sql.js";\n'],
      ["support/rogue-sql.ts", "export const rogueSql = neon(url);\n"],
    ]);

    expect(setupFilesThatConnect(tree, ["tests/support/setup.ts"])).toEqual([
      "tests/support/setup.ts",
    ]);
  });

  it("flags a setup module outside tests/ it cannot read", () => {
    expect(setupFilesThatConnect(new Map(), ["vitest.setup.ts"])).toEqual([
      "vitest.setup.ts",
    ]);
  });

  it("does not flag a setup module that connects nowhere", () => {
    const tree: TestTree = new Map([
      ["support/setup.ts", 'process.env.TZ = "UTC";\n'],
    ]);

    expect(setupFilesThatConnect(tree, ["tests/support/setup.ts"])).toEqual([]);
  });
});

describe("the census's gate and destructive readers, on synthetic sources", () => {
  it("reports a test-database file that drops a column while holding shared as not exclusive", () => {
    const source =
      'import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";\nholdSharedTestSchemaLock();\n' +
      "const url = liveTestDatabaseUrl;\nawait sql`alter table designs drop column x`;\n";
    const tree: TestTree = new Map([["a.test.ts", source]]);
    const registrations = new Map([["a.test.ts", lockRegistrationOf(source)]]);

    expect(destructiveFilesNotExclusive(tree, registrations)).toEqual([
      "a.test.ts",
    ]);
  });

  it("tells the two gates apart, and flags a file carrying both", () => {
    const liveGate =
      'import { isLiveTestDatabaseConfigured } from "./support/live-test-database.js";\n' +
      'describe.skipIf(!isLiveTestDatabaseConfigured)("x", () => {});';
    const applicationGate =
      'const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);';

    expect(gateOf(liveGate)).toBe("live test database");
    expect(gateOf(applicationGate)).toBe("DATABASE_URL");
    expect(gateOf(`${liveGate}\n${applicationGate}`)).toBe("both");
  });

  it("does not read a commented-out gate as a gate", () => {
    expect(
      gateOf(
        '// const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);\n',
      ),
    ).toBe("none");
  });
});

// ---------------------------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------------------------

/** Exactly the files vitest's `include` resolves, as paths under `tests/`. */
function discoverTestFiles(packageDirectory: string): string[] {
  const include = vitestConfig.test?.include;
  if (include === undefined)
    throw new Error("vitest.config.ts declares no test include");
  return namesUnderTests(
    packageDirectory,
    globSync(include, { cwd: packageDirectory }),
  );
}

function readTestTree(packageDirectory: string): TestTree {
  const names = namesUnderTests(
    packageDirectory,
    globSync(`${TESTS_DIRECTORY_NAME}/**/*.ts`, { cwd: packageDirectory }),
  );
  const testsDirectory = join(packageDirectory, TESTS_DIRECTORY_NAME);
  return new Map(
    names.map((name) => [
      name,
      readFileSync(join(testsDirectory, name), "utf8"),
    ]),
  );
}

function namesUnderTests(
  packageDirectory: string,
  packageRelativePaths: readonly string[],
): string[] {
  const testsDirectory = join(packageDirectory, TESTS_DIRECTORY_NAME);
  return packageRelativePaths
    .map((path) =>
      relative(testsDirectory, join(packageDirectory, path))
        .split(sep)
        .join("/"),
    )
    .sort();
}

function writeSources(
  packageDirectory: string,
  sources: Readonly<Record<string, string>>,
): void {
  for (const [name, source] of Object.entries(sources)) {
    const path = join(packageDirectory, TESTS_DIRECTORY_NAME, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
}

function sourceOf(tree: TestTree, name: string): string {
  const source = tree.get(name);
  if (source === undefined)
    throw new Error(`The census has no source for ${name}`);
  return source;
}

function expectedField<Field extends "gate" | "lock">(
  field: Field,
): Record<string, ExpectedClassification[Field]> {
  return Object.fromEntries(
    Object.entries(EXPECTED_CLASSIFICATION).map(([name, expected]) => [
      name,
      expected[field],
    ]),
  );
}

// ---------------------------------------------------------------------------------------------
// Which files reach a database, and which open a connection
// ---------------------------------------------------------------------------------------------

function databaseReachingFiles(
  tree: TestTree,
  testFiles: readonly string[],
): string[] {
  const connectingModules = connectingSupportModules(tree);
  return testFiles.filter(
    (name) =>
      DATABASE_URL_SOURCE.test(withoutComments(sourceOf(tree, name))) ||
      relativeImportsOf(tree, name).some((imported) =>
        connectingModules.has(imported),
      ),
  );
}

function opensConnection(tree: TestTree, name: string): boolean {
  const connectingModules = connectingSupportModules(tree);
  return (
    callsConnectionOpener(parse(sourceOf(tree, name))) ||
    relativeImportsOf(tree, name).some((imported) =>
      connectingModules.has(imported),
    )
  );
}

/** The non-test modules under `tests/` that open a connection, directly or through one another. */
function connectingSupportModules(tree: TestTree): Set<string> {
  const supportModules = [...tree.keys()].filter(
    (name) => !name.endsWith(".test.ts"),
  );
  const connecting = new Set(
    supportModules.filter((name) =>
      callsConnectionOpener(parse(sourceOf(tree, name))),
    ),
  );
  let hasGrown = true;
  while (hasGrown) {
    const reached = supportModules.filter(
      (name) =>
        !connecting.has(name) &&
        relativeImportsOf(tree, name).some((imported) =>
          connecting.has(imported),
        ),
    );
    reached.forEach((name) => connecting.add(name));
    hasGrown = reached.length > 0;
  }
  return connecting;
}

function callsConnectionOpener(sourceFile: ts.SourceFile): boolean {
  return someNode(sourceFile, (node) => {
    const callee =
      ts.isCallExpression(node) || ts.isNewExpression(node)
        ? node.expression
        : undefined;
    const calleeName =
      callee === undefined
        ? undefined
        : ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee)
            ? callee.name.text
            : undefined;
    return calleeName !== undefined && CONNECTION_OPENERS.has(calleeName);
  });
}

/** Relative imports that stay inside `tests/`, resolved to tree keys. */
function relativeImportsOf(tree: TestTree, name: string): string[] {
  return moduleLinksOf(parse(sourceOf(tree, name)))
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) =>
      posix
        .normalize(posix.join(posix.dirname(name), specifier))
        .replace(/\.js$/, ".ts"),
    )
    .filter((resolved) => tree.has(resolved));
}

/** Static imports, `export … from` re-exports, and `import("…")` calls with a literal path. */
function moduleLinksOf(sourceFile: ts.SourceFile): string[] {
  const staticLinks = sourceFile.statements.flatMap((statement) =>
    (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
    statement.moduleSpecifier !== undefined &&
    ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
  const dynamicLinks = allNodes(sourceFile).flatMap((node) => {
    if (
      !ts.isCallExpression(node) ||
      node.expression.kind !== ts.SyntaxKind.ImportKeyword
    )
      return [];
    const [argument] = node.arguments;
    return argument !== undefined && ts.isStringLiteral(argument)
      ? [argument.text]
      : [];
  });
  return [...staticLinks, ...dynamicLinks];
}

/** `setupFiles` as vitest accepts it — absent, one path or a list — as package-relative paths. */
function setupFilesOf(
  setupFiles: string | readonly string[] | undefined,
): string[] {
  const listed =
    setupFiles === undefined
      ? []
      : typeof setupFiles === "string"
        ? [setupFiles]
        : [...setupFiles];
  return listed.map((path) => posix.normalize(path));
}

/** Setup modules that open a connection. One outside `tests/` cannot be read from the tree, so it
 *  is reported rather than assumed harmless. */
function setupFilesThatConnect(
  tree: TestTree,
  setupFiles: readonly string[],
): string[] {
  const testsPrefix = `${TESTS_DIRECTORY_NAME}/`;
  return setupFiles.filter((path) => {
    const name = path.startsWith(testsPrefix)
      ? path.slice(testsPrefix.length)
      : undefined;
    return name === undefined || !tree.has(name) || opensConnection(tree, name);
  });
}

// ---------------------------------------------------------------------------------------------
// Gates, registrations and the destructive pattern
// ---------------------------------------------------------------------------------------------

function gateOf(source: string): Gate {
  const isLiveGated = isLiveGateUsed(parse(source));
  const isApplicationGated = withoutComments(source).includes(
    APPLICATION_DATABASE_GATE,
  );
  if (isLiveGated && isApplicationGated) return "both";
  if (isLiveGated) return "live test database";
  return isApplicationGated ? "DATABASE_URL" : "none";
}

function isLiveGateUsed(sourceFile: ts.SourceFile): boolean {
  const binding = importBindingsOf(sourceFile).find(
    (candidate) =>
      LIVE_GATE_MODULE.test(candidate.moduleSpecifier) &&
      candidate.importedName === LIVE_GATE_EXPORT,
  );
  if (binding === undefined) return false;
  return someNode(
    sourceFile,
    (node) =>
      ts.isIdentifier(node) &&
      node.text === binding.localName &&
      !isInsideImport(node),
  );
}

function lockRegistrationOf(source: string): LockRegistration {
  const sourceFile = parse(source);
  const registrationNames = registrationBindingsOf(sourceFile);
  const calls = allNodes(sourceFile).filter(
    (node): node is ts.CallExpression =>
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      registrationNames.has(node.expression.text),
  );
  const [only] = calls;
  if (only === undefined)
    return { mode: "none", isFirstCodeAtModuleScope: true };
  if (calls.length > 1)
    return { mode: "more than one", isFirstCodeAtModuleScope: false };
  return {
    mode:
      registrationNames.get((only.expression as ts.Identifier).text) ?? "none",
    isFirstCodeAtModuleScope: isFirstCodeAtModuleScope(sourceFile, only),
  };
}

/** Local name → mode, for every registration imported from the lock helper, aliases included. */
function registrationBindingsOf(
  sourceFile: ts.SourceFile,
): Map<string, LockDeclaration> {
  return new Map(
    importBindingsOf(sourceFile)
      .filter((binding) => LOCK_HELPER_MODULE.test(binding.moduleSpecifier))
      .flatMap((binding) => {
        const mode = REGISTRATION_MODES[binding.importedName];
        return mode === undefined ? [] : [[binding.localName, mode] as const];
      }),
  );
}

/** The registration is its own module-scope statement, and nothing above it can run code. */
function isFirstCodeAtModuleScope(
  sourceFile: ts.SourceFile,
  call: ts.CallExpression,
): boolean {
  const statement = call.parent;
  if (!ts.isExpressionStatement(statement) || statement.parent !== sourceFile)
    return false;
  const statementsAbove = sourceFile.statements.slice(
    0,
    sourceFile.statements.indexOf(statement),
  );
  return statementsAbove.every(isInertStatement);
}

function isInertStatement(statement: ts.Statement): boolean {
  if (
    ts.isImportDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isFunctionDeclaration(statement)
  ) {
    return true;
  }
  return ts.isVariableStatement(statement) && !runsCodeWhenEvaluated(statement);
}

/** A call, construction, tagged template or await — outside any function body, which does not run
 *  when the statement is evaluated. */
function runsCodeWhenEvaluated(node: ts.Node): boolean {
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) return true;
  if (ts.isTaggedTemplateExpression(node) || ts.isAwaitExpression(node))
    return true;
  if (ts.isFunctionLike(node)) return false;
  return (
    ts.forEachChild(node, (child) =>
      runsCodeWhenEvaluated(child) ? true : undefined,
    ) ?? false
  );
}

function misplacedRegistrations(
  registrations: ReadonlyMap<string, LockRegistration>,
): string[] {
  return [...registrations]
    .filter(([, registration]) => !registration.isFirstCodeAtModuleScope)
    .map(([name]) => name);
}

/** Every database-reaching file not gated on the application database — so the test database — whose
 *  source matches the destructive pattern must hold the lock exclusively. */
function destructiveFilesNotExclusive(
  tree: TestTree,
  registrations: ReadonlyMap<string, LockRegistration>,
): string[] {
  return [...registrations.keys()]
    .filter((name) => gateOf(sourceOf(tree, name)) !== "DATABASE_URL")
    .filter((name) =>
      DESTRUCTIVE_PATTERN.test(withoutComments(sourceOf(tree, name))),
    )
    .filter((name) => registrations.get(name)?.mode !== "exclusive");
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile(
    "census-input.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function withoutComments(source: string): string {
  return ts.createPrinter({ removeComments: true }).printFile(parse(source));
}

function importBindingsOf(sourceFile: ts.SourceFile): ImportBinding[] {
  return sourceFile.statements
    .filter(ts.isImportDeclaration)
    .flatMap((declaration) => {
      const moduleSpecifier = (declaration.moduleSpecifier as ts.StringLiteral)
        .text;
      const namedBindings = declaration.importClause?.namedBindings;
      if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
        return [{ localName: "", importedName: "", moduleSpecifier }];
      }
      return namedBindings.elements.map((element) => ({
        localName: element.name.text,
        importedName: (element.propertyName ?? element.name).text,
        moduleSpecifier,
      }));
    });
}

function isInsideImport(node: ts.Node): boolean {
  return ts.findAncestor(node, ts.isImportDeclaration) !== undefined;
}

function allNodes(root: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
}

function someNode(
  root: ts.Node,
  predicate: (node: ts.Node) => boolean,
): boolean {
  return allNodes(root).some(predicate);
}
