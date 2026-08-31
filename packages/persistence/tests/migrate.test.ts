import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  applyMigrations,
  databaseNameOf,
  describeMigrationFailure,
  describeMigrationRun,
  runMigrations,
} from "../src/migrate.js";
import { checksumOfMigration } from "../src/migration-checksum.js";
import {
  MigrationChecksumMismatchError,
  MigrationExecutionError,
  MigrationSequenceError,
} from "../src/migration-errors.js";
import { readMigrationFiles } from "../src/migration-files.js";
import type { MigrationFile } from "../src/migration-files.js";
import { resolveTestDatabaseUrl } from "../src/test-database-url.js";
import {
  dropMigrationLedger,
  dropSynthesisedMigrationArtefacts,
  forgetAppliedMigrations,
  hasTable,
  readMigrationLedger,
} from "./support/migration-ledger-probe.js";

const hasLiveDatabase = Boolean(process.env["DATABASE_URL"]);
const testDatabaseUrl = hasLiveDatabase ? resolveTestDatabaseUrl() : "";
const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

const ALL_MIGRATION_FILE_NAMES = [
  "0001_create_designs.sql",
  "0002_add_write_token_hash.sql",
  "0003_check_write_token_hash_shape.sql",
];
const WRITE_TOKEN_VERSIONS = [2, 3];
const ROLLBACK_PROBE_TABLE = "db004_rollback_probe";
const LEDGER_ATOMICITY_PROBE_TABLE = "db004_ledger_atomicity_probe";
const PROBE_TABLES = [ROLLBACK_PROBE_TABLE, LEDGER_ATOMICITY_PROBE_TABLE];

/** Any valid jsonb will do: this row exists only to prove adoption does not disturb rows that were
 *  already there. It is deleted again by the test that inserts it. */
const PROBE_DOCUMENT = { probe: "db004-adoption" };

// Obviously fictional, and shaped like the real thing so the credential-redaction assertion has
// something to fail on. Nothing here connects anywhere.
const EXAMPLE_CONNECTION =
  "postgresql://example_user:example_password@ep-example.example.invalid/lemn-conf-example?sslmode=require";

/** The real migration set plus one more that fails half-way, presented as version 4 so the set
 *  stays a contiguous run and every existing ledger row still has its file. */
function migrationsPlusAFailingOne(): MigrationFile[] {
  const sql = `create table ${ROLLBACK_PROBE_TABLE} (id integer);\nselect 1 / 0;\n`;
  return [
    ...readMigrationFiles(),
    {
      version: 4,
      fileName: "0004_deliberately_failing.sql",
      sql,
      checksum: checksumOfMigration(sql),
    },
  ];
}

describe("runMigrations against the live test database", () => {
  beforeAll(async () => {
    if (hasLiveDatabase) await runMigrations(testDatabaseUrl);
  });

  // Belt to the braces below. The tests that synthesise a version-4 migration clean up in their own
  // `finally`, but a `finally` only runs if the test body was entered — a failure in `beforeAll`, a
  // timeout, or an unhandled rejection can skip it. This database is shared by every suite in the
  // package and by whoever else is running them, so nothing that could wedge it may depend on one
  // code path being reached.
  afterEach(async () => {
    if (hasLiveDatabase)
      await dropSynthesisedMigrationArtefacts(testDatabaseUrl, PROBE_TABLES);
  });

  it.skipIf(!hasLiveDatabase)(
    "bootstraps its own ledger on a database that has never had one, and adopts the schema already there",
    async () => {
      // This is exactly what the first run against the existing Neon databases does: no ledger, so
      // every migration is pending, every migration re-executes as the idempotent no-op it is, and
      // the rows that were already there are untouched.
      const sql = neon(testDatabaseUrl);
      const survivingId = `db004-adoption-${Date.now().toString()}`;
      const survivingHash = "a".repeat(64);
      await sql`
        insert into designs (id, schema_version, document, write_token_hash)
        values (${survivingId}, 1, ${PROBE_DOCUMENT}, ${survivingHash})
      `;

      try {
        await dropMigrationLedger(testDatabaseUrl);

        const summary = await runMigrations(testDatabaseUrl);

        expect(await hasTable(testDatabaseUrl, "schema_migrations")).toBe(true);
        expect(summary.applied).toEqual(ALL_MIGRATION_FILE_NAMES);
        expect(summary.alreadyApplied).toEqual([]);
        const ledger = await readMigrationLedger(testDatabaseUrl);
        expect(ledger.map((row) => row.file_name)).toEqual(
          ALL_MIGRATION_FILE_NAMES,
        );
        const survivors = (await sql`
          select write_token_hash from designs where id = ${survivingId}
        `) as { write_token_hash: string }[];
        expect(survivors[0]?.write_token_hash).toBe(survivingHash);
      } finally {
        await sql`delete from designs where id = ${survivingId}`;
      }
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "is a no-op once everything is applied, and says so rather than re-running files",
    async () => {
      const summary = await runMigrations(testDatabaseUrl);

      expect(summary.applied).toEqual([]);
      expect(summary.alreadyApplied).toEqual(ALL_MIGRATION_FILE_NAMES);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "records one ledger row per migration, never a second one for a re-run",
    async () => {
      await runMigrations(testDatabaseUrl);

      const versions = (await readMigrationLedger(testDatabaseUrl)).map(
        (row) => row.version,
      );
      expect(versions).toEqual([1, 2, 3]);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses to migrate when an applied file no longer matches its recorded checksum",
    async () => {
      const files = readMigrationFiles();
      const tampered = files.map((file, index) =>
        index === 0 ? { ...file, checksum: "0".repeat(64) } : file,
      );

      await expect(applyMigrations(testDatabaseUrl, tampered)).rejects.toThrow(
        MigrationChecksumMismatchError,
      );
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "refuses to migrate when the ledger has a gap, and migrates again once the gap is closed",
    async () => {
      await forgetAppliedMigrations(testDatabaseUrl, [2]);

      await expect(runMigrations(testDatabaseUrl)).rejects.toThrow(
        MigrationSequenceError,
      );

      // Repair through the production path rather than by hand: with 0003 forgotten too there is
      // no gap left, and the runner re-applies both files and re-records them.
      await forgetAppliedMigrations(testDatabaseUrl, WRITE_TOKEN_VERSIONS);
      const summary = await runMigrations(testDatabaseUrl);
      expect(summary.applied).toEqual(ALL_MIGRATION_FILE_NAMES.slice(1));
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "lets two concurrent runners apply each migration exactly once, the loser finding nothing to do",
    async () => {
      await forgetAppliedMigrations(testDatabaseUrl, WRITE_TOKEN_VERSIONS);

      const [first, second] = await Promise.all([
        runMigrations(testDatabaseUrl),
        runMigrations(testDatabaseUrl),
      ]);

      // Which runner wins is a race; that each file is applied by exactly one of them is not.
      expect([...first.applied, ...second.applied].sort()).toEqual(
        ALL_MIGRATION_FILE_NAMES.slice(1),
      );
      expect((await readMigrationLedger(testDatabaseUrl)).length).toBe(3);
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "rolls a failing migration back whole: no ledger row, and no half-made schema change",
    async () => {
      try {
        await expect(
          applyMigrations(testDatabaseUrl, migrationsPlusAFailingOne()),
        ).rejects.toThrow(MigrationExecutionError);

        expect(await hasTable(testDatabaseUrl, ROLLBACK_PROBE_TABLE)).toBe(
          false,
        );
        const versions = (await readMigrationLedger(testDatabaseUrl)).map(
          (row) => row.version,
        );
        expect(versions).not.toContain(4);
      } finally {
        await dropSynthesisedMigrationArtefacts(testDatabaseUrl, PROBE_TABLES);
      }
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "rolls the migration back when its ledger row cannot be recorded, so the two are one change",
    async () => {
      // Postgres already wraps a multi-statement file in an implicit transaction, so the schema
      // change and the ledger insert being *one* change is the part only the explicit transaction
      // provides. Forced here by a migration that claims its own ledger row, which makes the
      // runner's insert collide with the primary key after the schema change has succeeded.
      const sql =
        `create table ${LEDGER_ATOMICITY_PROBE_TABLE} (id integer);\n` +
        `insert into schema_migrations (version, file_name, checksum)\n` +
        `values (4, 'claimed_by_the_migration', 'claimed_by_the_migration');\n`;
      const files = [
        ...readMigrationFiles(),
        {
          version: 4,
          fileName: "0004_claims_its_own_ledger_row.sql",
          sql,
          checksum: checksumOfMigration(sql),
        },
      ];

      try {
        await expect(applyMigrations(testDatabaseUrl, files)).rejects.toThrow(
          MigrationExecutionError,
        );

        expect(
          await hasTable(testDatabaseUrl, LEDGER_ATOMICITY_PROBE_TABLE),
        ).toBe(false);
        const versions = (await readMigrationLedger(testDatabaseUrl)).map(
          (row) => row.version,
        );
        expect(versions).not.toContain(4);
      } finally {
        // This test's migration commits a `version = 4` row when the transaction under test is
        // absent. A row whose version has no file makes every later `runMigrations` throw, so the
        // cleanup must not be conditional on the assertions above having passed.
        await dropSynthesisedMigrationArtefacts(testDatabaseUrl, PROBE_TABLES);
      }
    },
  );

  it.skipIf(!hasLiveDatabase)(
    "names the migration that failed, rather than surfacing a bare driver error",
    async () => {
      try {
        await expect(
          applyMigrations(testDatabaseUrl, migrationsPlusAFailingOne()),
        ).rejects.toThrow(/0004_deliberately_failing\.sql/);
      } finally {
        await dropSynthesisedMigrationArtefacts(testDatabaseUrl, PROBE_TABLES);
      }
    },
  );
});

describe("describeMigrationRun", () => {
  it("names every migration it applied and the database it applied them to", () => {
    const line = describeMigrationRun(
      {
        applied: ["0002_add_write_token_hash.sql"],
        alreadyApplied: ["0001_create_designs.sql"],
      },
      "lemn-conf-example",
    );

    expect(line).toContain("0002_add_write_token_hash.sql");
    expect(line).toContain("lemn-conf-example");
  });

  it("says it applied nothing rather than falling silent, so a no-op run is not mistaken for a broken one", () => {
    // ADR 0020 decision 4: a run that prints nothing is indistinguishable from one that did
    // nothing. With a ledger, "applied nothing" is now a true and useful thing to be able to say.
    const line = describeMigrationRun(
      { applied: [], alreadyApplied: ALL_MIGRATION_FILE_NAMES },
      "lemn-conf-example",
    );

    expect(line).toContain("applied nothing");
    expect(line).toContain("3 already applied");
  });

  it("never carries a credential into the line an operator sees", () => {
    const line = describeMigrationRun(
      { applied: ["0002_add_write_token_hash.sql"], alreadyApplied: [] },
      databaseNameOf(EXAMPLE_CONNECTION),
    );

    expect(line).toContain("lemn-conf-example");
    for (const secret of [
      "example_password",
      "example_user",
      "ep-example.example.invalid",
      "postgresql://",
    ]) {
      expect(line).not.toContain(secret);
    }
  });
});

describe("the migration ledger's append-only rule", () => {
  it("is enforced by there being no update or delete against it anywhere in src/", () => {
    // Append-only cannot be granted away at the database, because migrations connect as the owner.
    // What can be checked is that this package never writes such a statement, which is the property
    // the rule actually asks for: a ledger row is a record of something that happened.
    const ledgerSource = readFileSync(
      resolve(SOURCE_DIR, "migration-ledger.ts"),
      "utf8",
    );
    const runnerSource = readFileSync(
      resolve(SOURCE_DIR, "migrate.ts"),
      "utf8",
    );

    for (const source of [ledgerSource, runnerSource]) {
      expect(source).not.toMatch(/update\s+schema_migrations/i);
      expect(source).not.toMatch(/delete\s+from\s+schema_migrations/i);
    }
  });
});

describe("databaseNameOf", () => {
  it("names the database in a well-formed connection string", () => {
    expect(databaseNameOf(EXAMPLE_CONNECTION)).toBe("lemn-conf-example");
  });

  it("never throws a URL error carrying the connection string it was handed", () => {
    // Node's ERR_INVALID_URL carries the whole input as an enumerable property, which the uncaught
    // exception printer emits — a misconfigured MIGRATION_DATABASE_URL would leak its password into
    // a deploy log. ADR 0008's incident, in a narrower shape.
    const malformed = "postgres://user:hunter2@@@not a url/lemn-conf-example";

    const name = databaseNameOf(malformed);

    expect(name).not.toContain("hunter2");
    expect(name).not.toContain("postgres://");
  });
});

describe("describeMigrationFailure", () => {
  it("prints the domain error's name and message", () => {
    const line = describeMigrationFailure(
      new MigrationSequenceError("the ledger has a hole"),
    );

    expect(line).toContain("MigrationSequenceError");
    expect(line).toContain("the ledger has a hole");
  });

  it("never prints the wrapped driver error, which is where a connection string hides", () => {
    const driverError = new Error(
      "connect failed: postgresql://user:example_password@ep-example.example.invalid/db",
    );
    const wrapped = new MigrationExecutionError(
      'Could not connect to "lemn-conf-example" to run migrations.',
      { cause: driverError },
    );

    const line = describeMigrationFailure(wrapped);

    expect(line).toContain("lemn-conf-example");
    for (const secret of [
      "example_password",
      "ep-example.example.invalid",
      "postgresql://",
    ]) {
      expect(line).not.toContain(secret);
    }
  });

  it("says nothing about an unexpected error beyond its type", () => {
    const line = describeMigrationFailure(
      new TypeError("wss://ep-secret.example.invalid refused the connection"),
    );

    expect(line).toContain("TypeError");
    expect(line).not.toContain("ep-secret.example.invalid");
  });
});

describe("the migrate CLI", () => {
  it("prints the database name, never the connection string it was given", () => {
    const source = readFileSync(resolve(SOURCE_DIR, "migrate.ts"), "utf8");
    const cli = source.slice(source.indexOf("if (isDirectCliInvocation)"));

    expect(cli).toContain(
      "describeMigrationRun(summary, databaseNameOf(connectionUrl))",
    );
    // A connection string printed into a transcript is a credential leak that has already happened
    // once on this project (ADR 0008's setup incident). Pinned as "there is exactly one print, and
    // it prints the described run" — which, with the assertion above, fixes what reaches the log.
    expect(cli.match(/console\.log\(/g) ?? []).toHaveLength(1);
    expect(cli).toMatch(/console\.log\(\s*describeMigrationRun\(/);
  });

  it("catches a failed run rather than letting Node print the driver's error object", () => {
    const source = readFileSync(resolve(SOURCE_DIR, "migrate.ts"), "utf8");
    const cli = source.slice(source.indexOf("if (isDirectCliInvocation)"));

    expect(cli).toMatch(/console\.error\(describeMigrationFailure\(error\)\)/);
    expect(cli).toContain("process.exitCode = 1");
    // One print on each path, and each goes through a function that redacts.
    expect(cli.match(/console\.error\(/g) ?? []).toHaveLength(1);
  });
});
