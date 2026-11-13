import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../src/migrate.js";
import {
  MigrationChecksumMismatchError,
  MigrationExecutionError,
  MigrationSequenceError,
} from "../src/migration-errors.js";
import type { MigrationFile } from "../src/migration-files.js";
import {
  ACQUIRE_MIGRATION_LOCK_SQL,
  CREATE_MIGRATION_LEDGER_SQL,
  INSERT_APPLIED_MIGRATION_SQL,
  SELECT_APPLIED_MIGRATIONS_SQL,
} from "../src/migration-ledger.js";
import { planPendingMigrations } from "../src/migration-plan.js";
import type { AppliedMigration } from "../src/migration-plan.js";
import {
  FAKE_PASSWORD,
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";

interface LedgerRow {
  version: number;
  file_name: string;
  checksum: string;
}

interface RecordedStatement {
  readonly sql: string;
  readonly params: readonly unknown[] | undefined;
}

interface ScriptedLedgerDriver {
  ledgerExists: boolean;
  rows: LedgerRow[];
  statements: RecordedStatement[];
  ledgerReadFailure: unknown;
  ledgerReadFailuresLeft: number;
  endCalls: number;
  respond: (sql: string, params: readonly unknown[] | undefined) => unknown;
}

const driver = vi.hoisted(
  (): ScriptedLedgerDriver => ({
    ledgerExists: true,
    rows: [],
    statements: [],
    ledgerReadFailure: undefined,
    ledgerReadFailuresLeft: 0,
    endCalls: 0,
    respond: () => ({ rows: [] }),
  }),
);

vi.mock("@neondatabase/serverless", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@neondatabase/serverless")>();
  class ClientWithAScriptedLedger extends actual.Client {}
  Object.assign(ClientWithAScriptedLedger.prototype, {
    connect: () => Promise.resolve(),
    query: (sql: string, params?: readonly unknown[]) => {
      driver.statements.push({ sql, params });
      try {
        return Promise.resolve(driver.respond(sql, params));
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
    end: () => {
      driver.endCalls += 1;
      return Promise.resolve();
    },
  });
  return { ...actual, Client: ClientWithAScriptedLedger };
});

function missingLedgerError(): Error {
  return Object.assign(
    new Error('relation "schema_migrations" does not exist'),
    {
      code: "42P01",
    },
  );
}

function isLedgerReadToFail(sql: string): boolean {
  return (
    sql === SELECT_APPLIED_MIGRATIONS_SQL && driver.ledgerReadFailuresLeft > 0
  );
}

function answerLikeTheLedgerDatabase(
  sql: string,
  params: readonly unknown[] | undefined,
): unknown {
  if (isLedgerReadToFail(sql)) {
    driver.ledgerReadFailuresLeft -= 1;
    throw driver.ledgerReadFailure as Error;
  }
  if (sql === SELECT_APPLIED_MIGRATIONS_SQL) {
    if (!driver.ledgerExists) throw missingLedgerError();
    return { rows: [...driver.rows].sort((a, b) => a.version - b.version) };
  }
  if (sql === CREATE_MIGRATION_LEDGER_SQL) driver.ledgerExists = true;
  if (sql === INSERT_APPLIED_MIGRATION_SQL) {
    const [version, fileName, checksum] = params as [number, string, string];
    driver.rows.push({ version, file_name: fileName, checksum });
  }
  return { rows: [] };
}

driver.respond = answerLikeTheLedgerDatabase;

beforeEach(() => {
  driver.ledgerExists = true;
  driver.rows = [];
  driver.statements = [];
  driver.ledgerReadFailure = undefined;
  driver.ledgerReadFailuresLeft = 0;
  driver.endCalls = 0;
});

function migrationFile(version: number, name: string): MigrationFile {
  return {
    version,
    fileName: `${String(version).padStart(4, "0")}_${name}.sql`,
    sql: `create table migrated_${name} (id integer)`,
    checksum: version.toString(16).repeat(64).slice(0, 64),
  };
}

const FIRST = migrationFile(1, "alpha");
const SECOND = migrationFile(2, "bravo");
const THIRD = migrationFile(3, "charlie");
const THREE_FILES = [FIRST, SECOND, THIRD];

function ledgerRowOf(file: MigrationFile): LedgerRow {
  return {
    version: file.version,
    file_name: file.fileName,
    checksum: file.checksum,
  };
}

function recordAsApplied(...files: readonly MigrationFile[]): void {
  driver.rows = files.map(ledgerRowOf);
}

function labelOf({ sql, params }: RecordedStatement): string {
  const labelsBySql = new Map([
    ["begin", "begin"],
    ["commit", "commit"],
    ["rollback", "rollback"],
    [SELECT_APPLIED_MIGRATIONS_SQL, "read ledger"],
    [ACQUIRE_MIGRATION_LOCK_SQL, "lock"],
    [CREATE_MIGRATION_LEDGER_SQL, "create ledger"],
  ]);
  if (sql === INSERT_APPLIED_MIGRATION_SQL)
    return `record ${String((params as unknown[])[1])}`;
  return labelsBySql.get(sql) ?? `run ${sql}`;
}

function statementLabels(): string[] {
  return driver.statements.map(labelOf);
}

const UNLOCKED_READ = ["read ledger"];
const LOCKED_CHECK_OF_AN_APPLIED_FILE = [
  "begin",
  "lock",
  "create ledger",
  "read ledger",
  "rollback",
];

function lockedApplicationOf(file: MigrationFile): string[] {
  return [
    "begin",
    "lock",
    "create ledger",
    "read ledger",
    `run ${file.sql}`,
    `record ${file.fileName}`,
    "commit",
  ];
}

async function run(files: readonly MigrationFile[]) {
  return applyMigrations(WELL_FORMED_UNREACHABLE_VALUE, files);
}

async function rejectionOfRun(files: readonly MigrationFile[]): Promise<Error> {
  try {
    await run(files);
  } catch (error) {
    return error as Error;
  }
  throw new Error("the run resolved, so no refusal was raised");
}

function refusalThePlanRaises(
  files: readonly MigrationFile[],
  rows: readonly LedgerRow[],
): Error {
  const applied: AppliedMigration[] = rows.map((row) => ({
    version: row.version,
    fileName: row.file_name,
    checksum: row.checksum,
  }));
  try {
    planPendingMigrations(files, applied);
  } catch (error) {
    return error as Error;
  }
  throw new Error("the plan raised nothing for this ledger");
}

function expectSameRefusal(actual: Error, expected: Error): void {
  expect(actual.constructor).toBe(expected.constructor);
  expect(actual.name).toBe(expected.name);
  expect(actual.message).toBe(expected.message);
}

describe("applyMigrations against a ledger that already records every file", () => {
  it("issues the ledger read and nothing else, and lists every file as already applied in file order", async () => {
    recordAsApplied(...THREE_FILES);

    const summary = await run(THREE_FILES);

    expect(statementLabels()).toEqual(UNLOCKED_READ);
    expect(summary).toEqual({
      applied: [],
      alreadyApplied: THREE_FILES.map((file) => file.fileName),
    });
  });

  it("closes the session once", async () => {
    recordAsApplied(...THREE_FILES);

    await run(THREE_FILES);

    expect(driver.endCalls).toBe(1);
  });

  it("writes nothing to the ledger and runs no file", async () => {
    recordAsApplied(...THREE_FILES);

    await run(THREE_FILES);

    expect(driver.rows).toEqual(THREE_FILES.map(ledgerRowOf));
    expect(driver.statements.map((statement) => statement.sql)).toEqual([
      SELECT_APPLIED_MIGRATIONS_SQL,
    ]);
  });

  it("reports an empty file list against an empty ledger as a run that did nothing", async () => {
    const summary = await run([]);

    expect(summary).toEqual({ applied: [], alreadyApplied: [] });
    expect(statementLabels()).not.toContain("begin");
  });

  it("reports an empty file list against a populated ledger as it did before, without a lock", async () => {
    recordAsApplied(FIRST);

    const summary = await run([]);

    expect(summary).toEqual({ applied: [], alreadyApplied: [] });
    expect(statementLabels()).toEqual(UNLOCKED_READ);
  });
});

describe("applyMigrations when a file is still pending", () => {
  it("applies and records the one pending file under the lock, and reports the rest as already applied", async () => {
    recordAsApplied(FIRST, SECOND);

    const summary = await run(THREE_FILES);

    expect(summary).toEqual({
      applied: [THIRD.fileName],
      alreadyApplied: [FIRST.fileName, SECOND.fileName],
    });
    expect(statementLabels()).toEqual([
      ...UNLOCKED_READ,
      ...LOCKED_CHECK_OF_AN_APPLIED_FILE,
      ...LOCKED_CHECK_OF_AN_APPLIED_FILE,
      ...lockedApplicationOf(THIRD),
    ]);
    expect(driver.rows.map((row) => row.file_name)).toEqual(
      THREE_FILES.map((file) => file.fileName),
    );
  });

  it("applies every file in order against an existing but empty ledger", async () => {
    const summary = await run(THREE_FILES);

    expect(summary).toEqual({
      applied: THREE_FILES.map((file) => file.fileName),
      alreadyApplied: [],
    });
    expect(statementLabels()).toEqual([
      ...UNLOCKED_READ,
      ...THREE_FILES.flatMap(lockedApplicationOf),
    ]);
  });

  it("applies a file added to a ledger that recorded only the earlier ones, once", async () => {
    recordAsApplied(FIRST, SECOND, THIRD);
    const fourth = migrationFile(4, "delta");

    const first = await run([...THREE_FILES, fourth]);
    const second = await run([...THREE_FILES, fourth]);

    expect(first.applied).toEqual([fourth.fileName]);
    expect(second.applied).toEqual([]);
    expect(driver.statements.filter((s) => s.sql === fourth.sql)).toHaveLength(
      1,
    );
  });
});

describe("applyMigrations when the ledger table does not exist", () => {
  it("creates the ledger under the lock and applies every file, since the unlocked read fails", async () => {
    driver.ledgerExists = false;

    const summary = await run(THREE_FILES);

    expect(summary.applied).toEqual(THREE_FILES.map((file) => file.fileName));
    expect(statementLabels()).toEqual([
      ...UNLOCKED_READ,
      ...THREE_FILES.flatMap(lockedApplicationOf),
    ]);
    expect(driver.ledgerExists).toBe(true);
    expect(driver.rows).toHaveLength(THREE_FILES.length);
  });

  it("leaves the ledger uncreated when there is no file to apply", async () => {
    driver.ledgerExists = false;

    const summary = await run([]);

    expect(summary).toEqual({ applied: [], alreadyApplied: [] });
    expect(driver.ledgerExists).toBe(false);
  });
});

describe("applyMigrations refuses a ledger the plan refuses, exactly as the locked path did", () => {
  interface RefusedLedger {
    readonly label: string;
    readonly files: readonly MigrationFile[];
    readonly rows: readonly LedgerRow[];
  }

  const RENAMED_SECOND: MigrationFile = {
    ...SECOND,
    fileName: "0002_renamed.sql",
  };
  const TAMPERED_SECOND: MigrationFile = {
    ...SECOND,
    checksum: "e".repeat(64),
  };

  const SEQUENCE_REFUSALS: readonly RefusedLedger[] = [
    {
      label: "a gap: a later file is recorded and an earlier one is not",
      files: THREE_FILES,
      rows: [ledgerRowOf(FIRST), ledgerRowOf(THIRD)],
    },
    {
      label: "a rename: the ledger knows the version under another name",
      files: [FIRST, RENAMED_SECOND, THIRD],
      rows: THREE_FILES.map(ledgerRowOf),
    },
    {
      label: "a ledger ahead of the checkout, with as many rows as files",
      files: [FIRST, SECOND],
      rows: [ledgerRowOf(FIRST), ledgerRowOf(migrationFile(99, "future"))],
    },
    {
      label: "a ledger ahead of the checkout, with every file recorded too",
      files: [FIRST, SECOND],
      rows: [
        ledgerRowOf(FIRST),
        ledgerRowOf(SECOND),
        ledgerRowOf(migrationFile(99, "future")),
      ],
    },
    {
      label:
        "a recorded migration whose file is gone, with as many rows as files",
      files: [FIRST, THIRD],
      rows: [ledgerRowOf(FIRST), ledgerRowOf(SECOND)],
    },
  ];

  it.each(SEQUENCE_REFUSALS)(
    "refuses $label with the plan's own error, after one locked attempt that writes nothing",
    async ({ files, rows }) => {
      driver.rows = [...rows];
      const expected = refusalThePlanRaises(files, rows);

      const error = await rejectionOfRun(files);

      expectSameRefusal(error, expected);
      expect(error).toBeInstanceOf(MigrationSequenceError);
      expect(statementLabels()).toEqual([
        ...UNLOCKED_READ,
        "begin",
        "lock",
        "create ledger",
        "read ledger",
        "rollback",
      ]);
      expect(driver.rows).toEqual([...rows]);
    },
  );

  it("refuses a checksum mismatch with the plan's own error, after one locked attempt that writes nothing", async () => {
    const files = [FIRST, TAMPERED_SECOND, THIRD];
    driver.rows = THREE_FILES.map(ledgerRowOf);
    const expected = refusalThePlanRaises(files, driver.rows);

    const error = await rejectionOfRun(files);

    expectSameRefusal(error, expected);
    expect(error).toBeInstanceOf(MigrationChecksumMismatchError);
    expect(statementLabels()).toEqual([
      ...UNLOCKED_READ,
      "begin",
      "lock",
      "create ledger",
      "read ledger",
      "rollback",
    ]);
  });

  it("refuses a checksum mismatch on the only file, though the ledger has as many rows as files", async () => {
    const tampered: MigrationFile = { ...FIRST, checksum: "f".repeat(64) };
    recordAsApplied(FIRST);

    const error = await rejectionOfRun([tampered]);

    expect(error).toBeInstanceOf(MigrationChecksumMismatchError);
    expect(error.message).toContain(FIRST.checksum);
    expect(error.message).toContain(tampered.checksum);
  });

  it("closes the session once when it refuses", async () => {
    driver.rows = [ledgerRowOf(SECOND)];

    await rejectionOfRun(THREE_FILES);

    expect(driver.endCalls).toBe(1);
  });
});

describe("applyMigrations when the unlocked ledger read itself fails", () => {
  const driverFailure = (): Error =>
    Object.assign(new Error(`connection reset ${FAKE_PASSWORD}`), {
      code: "ECONNRESET",
    });

  it("falls back to the locked path and reports every file as already applied when the read only failed once", async () => {
    recordAsApplied(...THREE_FILES);
    driver.ledgerReadFailure = driverFailure();
    driver.ledgerReadFailuresLeft = 1;

    const summary = await run(THREE_FILES);

    expect(summary).toEqual({
      applied: [],
      alreadyApplied: THREE_FILES.map((file) => file.fileName),
    });
    expect(statementLabels()).toEqual([
      ...UNLOCKED_READ,
      ...THREE_FILES.flatMap(() => LOCKED_CHECK_OF_AN_APPLIED_FILE),
    ]);
  });

  it("applies a pending file through the locked path when the read only failed once", async () => {
    recordAsApplied(FIRST, SECOND);
    driver.ledgerReadFailure = driverFailure();
    driver.ledgerReadFailuresLeft = 1;

    const summary = await run(THREE_FILES);

    expect(summary.applied).toEqual([THIRD.fileName]);
    expect(driver.rows.map((row) => row.file_name)).toContain(THIRD.fileName);
  });

  it("surfaces the locked path's wrapped failure, never the raw driver error, when every read fails", async () => {
    recordAsApplied(...THREE_FILES);
    driver.ledgerReadFailure = driverFailure();
    driver.ledgerReadFailuresLeft = Number.POSITIVE_INFINITY;

    const error = await rejectionOfRun(THREE_FILES);

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect(error.message).toContain(FIRST.fileName);
    expect(error.cause).toEqual({ name: "Error", code: "ECONNRESET" });
    expect(markersFoundOn(error)).toEqual([]);
    expect(statementLabels()).toEqual([
      ...UNLOCKED_READ,
      "begin",
      "lock",
      "create ledger",
      "read ledger",
      "rollback",
    ]);
  });
});
