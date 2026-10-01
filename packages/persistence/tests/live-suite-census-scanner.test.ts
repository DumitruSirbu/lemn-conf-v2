import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  databaseReachingFiles,
  destructiveFilesNotExclusive,
  discoverTestFiles,
  gateOf,
  lockRegistrationOf,
  opensConnection,
  readTestTree,
  setupFilesOf,
  setupFilesThatConnect,
} from "./support/live-suite-census-scanner.js";
import type { TestTree } from "./support/live-suite-census-scanner.js";

/**
 * The scanner's own unit tests, on synthetic sources and synthetic trees: what it counts as a
 * registration, a connection, a setup file, a gate and a destructive file. Split out of
 * `live-suite-census.test.ts` on review finding C1.1, 2026-09-22 — every case is unchanged.
 *
 * Like the census file, this one is excluded from the census's sweep: its synthetic sources spell
 * out both gates, a registration and a connection opener, so the scanner would classify it as a
 * database-reaching file gated on `DATABASE_URL`.
 */

const TESTS_DIRECTORY_NAME = "tests";
const PACKAGE_DIRECTORY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SCANNER_MODULE = "support/live-suite-census-scanner.ts";

describe("the scanner module itself", () => {
  it("opens no connection, so importing it never makes a file database-reaching", () => {
    const tree = readTestTree(PACKAGE_DIRECTORY);

    expect(tree.has(SCANNER_MODULE)).toBe(true);
    expect(opensConnection(tree, SCANNER_MODULE)).toBe(false);
  });
});

describe("the scanner's discovery", () => {
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

describe("the scanner's registration reader, on synthetic sources", () => {
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

describe("the scanner's connection reader, on synthetic trees", () => {
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

describe("the scanner's setup-file reader, on synthetic trees", () => {
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

describe("the scanner's gate and destructive readers, on synthetic sources", () => {
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
