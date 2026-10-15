import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import type { MigrationFile } from "../src/migration-files.js";
import type { AppliedMigration } from "../src/migration-plan.js";
import {
  REQUIRED_DESIGN_COLUMNS,
  describeDeployedSchemaStatus,
  isDeployedSchemaLevel,
} from "../src/migration-status.js";
import type { DeployedSchemaReading } from "../src/migration-status.js";

/**
 * Adversarial companion to `migration-status.test.ts`.
 *
 * The guard is the thing an operator will act on without re-deriving its reasoning, so the states
 * it must never confuse are the states this file feeds it: an *empty* ledger against an *absent*
 * one, a hole against a lag, a ledger ahead against a file deleted. Each of the five outcomes names
 * a different repair, and reporting the wrong one sends the operator to the wrong database change.
 */

function migrationFile(version: number): MigrationFile {
  return {
    version,
    fileName: `${String(version).padStart(4, "0")}_change.sql`,
    sql: "select 1",
    checksum: `checksum-of-${String(version)}`,
  };
}

function ledgerRowFor(file: MigrationFile): AppliedMigration {
  return {
    version: file.version,
    fileName: file.fileName,
    checksum: file.checksum,
  };
}

/** Columns complete and correctly shaped, so a test about the ledger fails for ledger reasons and
 *  nothing else. */
function readingWith(
  ledgerRows: readonly AppliedMigration[],
): DeployedSchemaReading {
  return {
    ledger: { kind: "present", applied: ledgerRows },
    designColumns: [...REQUIRED_DESIGN_COLUMNS],
    documentSchemaVersions: [1],
  };
}

const FILES = [1, 2, 3, 4, 5, 6].map(migrationFile);
const EVERY_FILE_APPLIED = FILES.map(ledgerRowFor);
const [
  FIRST_FILE,
  SECOND_FILE,
  THIRD_FILE,
  FOURTH_FILE,
  FIFTH_FILE,
  SIXTH_FILE,
] = FILES as [
  MigrationFile,
  MigrationFile,
  MigrationFile,
  MigrationFile,
  MigrationFile,
  MigrationFile,
];

describe("a ledger that exists but disagrees with the files", () => {
  it("reports an empty ledger as behind by every file, never as outside the ledger", () => {
    // The other half of production's 2026-09-07 state. A table that exists and holds no rows is a
    // database the runner *has* been pointed at, so the repair is `migrate` and nothing else — the
    // adoption language of `outside-the-ledger` would be a different, wrong instruction.
    const report = describeDeployedSchemaStatus(FILES, readingWith([]));

    expect(report.outcome).toBe("behind");
    expect(report.detail).toContain("behind by 6 migration(s)");
    expect(report.detail).not.toContain("outside the ledger");
  });

  it("reports a hole in the ledger as diverged, never as behind by the missing file", () => {
    // 1, 2 and 4 applied and 3 not: the database holds a later schema change without the earlier
    // one, so running 3 now would apply it against a shape it was never written for. "Behind by
    // 0003" would invite exactly that.
    const holed = [FIRST_FILE, SECOND_FILE, FOURTH_FILE].map(ledgerRowFor);

    const report = describeDeployedSchemaStatus(FILES, readingWith(holed));

    expect(report.outcome).toBe("diverged");
    expect(report.detail).toContain("skipped a migration");
    expect(report.detail).toContain("0003_change.sql");
  });

  it("distinguishes a deleted file from a checkout that is merely older", () => {
    // Both are a ledger row with no file. Only the second is benign, and the two repairs are
    // opposites: restore the file, or migrate from the revision that matches the database.
    //
    // Only the middle file is missing from the checkout here — the highest version (6) stays in
    // both, so this scenario is "a file was deleted" and not also "this checkout is older", which
    // is the confusion the next test isolates.
    const deletedMiddleFile = describeDeployedSchemaStatus(
      [FIRST_FILE, SECOND_FILE, FOURTH_FILE, FIFTH_FILE, SIXTH_FILE],
      readingWith(EVERY_FILE_APPLIED),
    );

    expect(deletedMiddleFile.outcome).toBe("diverged");
    expect(deletedMiddleFile.detail).toContain(
      "must not be deleted or renamed",
    );
    expect(deletedMiddleFile.detail).not.toContain("older than the database");
  });

  it("refuses a ledger row at version 0, which no file can carry", () => {
    const withVersionZero = [
      ledgerRowFor(migrationFile(0)),
      ...EVERY_FILE_APPLIED,
    ];

    const report = describeDeployedSchemaStatus(
      FILES,
      readingWith(withVersionZero),
    );

    expect(report.outcome).toBe("diverged");
    expect(isDeployedSchemaLevel(report)).toBe(false);
  });

  it("refuses a negative ledger version rather than treating it as ahead of the checkout", () => {
    const withNegativeVersion = [
      { version: -1, fileName: "-001_change.sql", checksum: "checksum-of--1" },
      ...EVERY_FILE_APPLIED,
    ];

    const report = describeDeployedSchemaStatus(
      FILES,
      readingWith(withNegativeVersion),
    );

    expect(report.outcome).toBe("diverged");
    // Below the highest version on disk, so it is a missing file and not a newer database.
    expect(report.detail).not.toContain("older than the database");
  });

  it("refuses a row carrying another file's checksum, naming the file whose bytes disagree", () => {
    const swapped = EVERY_FILE_APPLIED.map((row) =>
      row.version === SECOND_FILE.version
        ? { ...row, checksum: THIRD_FILE.checksum }
        : row,
    );

    const report = describeDeployedSchemaStatus(FILES, readingWith(swapped));

    expect(report.outcome).toBe("diverged");
    expect(report.detail).toContain("0002_change.sql");
    expect(report.detail).toContain("has changed since it was applied");
  });

  it("quotes a duplicated version in the read-back, so an operator can see the ledger is impossible", () => {
    // `schema_migrations.version` is a primary key (`migration-ledger.ts`), so this cannot arise
    // from the database — but the planner reads the rows into a Map and the last one wins, so a
    // duplicate is silently absorbed by the verdict. The evidence line is the only place it shows.
    const duplicated = [
      ...EVERY_FILE_APPLIED,
      { ...ledgerRowFor(SECOND_FILE), checksum: "checksum-of-something-else" },
    ];

    const report = describeDeployedSchemaStatus(FILES, readingWith(duplicated));

    expect(report.readBack).toContain("ledger [1, 2, 3, 4, 5, 6, 2]");
  });
});

describe("the columns, which are the only evidence about the schema", () => {
  it("refuses a complete ledger over a designs table that is not there at all", () => {
    // `readDeployedSchema` reports no columns when `to_regclass('public.designs')` is null, so an
    // absent table arrives here as an empty column list.
    const report = describeDeployedSchemaStatus(FILES, {
      ledger: { kind: "present", applied: EVERY_FILE_APPLIED },
      designColumns: [],
      documentSchemaVersions: [],
    });

    expect(report.outcome).toBe("columns-missing");
    for (const column of REQUIRED_DESIGN_COLUMNS) {
      expect(report.detail).toContain(column.name);
    }
  });

  it("stays level when the table carries columns the application does not name", () => {
    // A column added by a later migration this checkout does not have is the ledger's problem, not
    // the column check's — refusing here would make every rollback deploy unreportable.
    const report = describeDeployedSchemaStatus(FILES, {
      ledger: { kind: "present", applied: EVERY_FILE_APPLIED },
      designColumns: [
        ...REQUIRED_DESIGN_COLUMNS,
        {
          name: "archived_at",
          dataType: "timestamp with time zone",
          isNullable: true,
        },
      ],
      documentSchemaVersions: [1],
    });

    expect(report.outcome).toBe("level");
  });

  it("does not depend on the order or repetition of the column names it is handed", () => {
    const scrambled = [...REQUIRED_DESIGN_COLUMNS]
      .reverse()
      .flatMap((column) => [column, column]);

    const report = describeDeployedSchemaStatus(FILES, {
      ledger: { kind: "present", applied: EVERY_FILE_APPLIED },
      designColumns: scrambled,
      documentSchemaVersions: [1],
    });

    expect(report.outcome).toBe("level");
  });

  it("reports the ledger first when the ledger and the columns are both wrong", () => {
    // Ordering is the whole design: on a database that has not run 0004, "a column is missing" is a
    // consequence and `migrate` is the repair. Reporting the column would send the operator to
    // write DDL by hand for a migration that is simply pending.
    const report = describeDeployedSchemaStatus(FILES, {
      ledger: {
        kind: "present",
        applied: [FIRST_FILE, SECOND_FILE, THIRD_FILE].map(ledgerRowFor),
      },
      designColumns: [...REQUIRED_DESIGN_COLUMNS].filter(
        (column) => column.name !== "revision",
      ),
      documentSchemaVersions: [1],
    });

    expect(report.outcome).toBe("behind");
  });
});

describe("the read-back, which is the evidence a reader checks the verdict against", () => {
  it("orders document schema versions numerically, not as text", () => {
    const report = describeDeployedSchemaStatus(FILES, {
      ledger: { kind: "present", applied: EVERY_FILE_APPLIED },
      designColumns: [...REQUIRED_DESIGN_COLUMNS],
      documentSchemaVersions: [10, 2, 1],
    });

    expect(report.readBack).toContain("document schema_version(s) [1, 2, 10]");
  });

  it("says the designs table read back nothing rather than printing an empty list silently", () => {
    const report = describeDeployedSchemaStatus(FILES, {
      ledger: { kind: "present", applied: [] },
      designColumns: [],
      documentSchemaVersions: [],
    });

    expect(report.readBack).toContain("designs columns []");
  });
});

describe("only level deploys", () => {
  it("refuses every one of the four non-level outcomes", () => {
    const reports = {
      "outside-the-ledger": describeDeployedSchemaStatus(FILES, {
        ledger: { kind: "absent" },
        designColumns: [],
        documentSchemaVersions: [],
      }),
      behind: describeDeployedSchemaStatus(FILES, readingWith([])),
      // A row for a version above the highest file on disk — "the checkout is older than the
      // database" — so this must be a version FILES does not carry, which is 7 now that 6 is real.
      diverged: describeDeployedSchemaStatus(
        FILES,
        readingWith([...EVERY_FILE_APPLIED, ledgerRowFor(migrationFile(7))]),
      ),
      "columns-missing": describeDeployedSchemaStatus(FILES, {
        ledger: { kind: "present", applied: EVERY_FILE_APPLIED },
        designColumns: [{ name: "id", dataType: "text", isNullable: false }],
        documentSchemaVersions: [1],
      }),
    };

    // Asserted as a map so a new outcome added without a deploy rule fails here rather than
    // silently defaulting to "not level" or, worse, to level.
    expect(
      Object.fromEntries(
        Object.entries(reports).map(([expected, report]) => [
          expected,
          `${report.outcome}:${String(isDeployedSchemaLevel(report))}`,
        ]),
      ),
    ).toEqual({
      "outside-the-ledger": "outside-the-ledger:false",
      behind: "behind:false",
      diverged: "diverged:false",
      "columns-missing": "columns-missing:false",
    });
  });
});

describe("the verdict over swept ledgers", () => {
  // The rows arrive from `select ... order by version`, but the guard must not depend on that: a
  // fake, a future read, or a `union` added to the query would reorder them, and a verdict that
  // changed with row order would be a guard that reports differently on identical databases.
  propertyTest.prop(
    [fc.shuffledSubarray(EVERY_FILE_APPLIED, { minLength: 6, maxLength: 6 })],
    { seed: 20260907, numRuns: 200 },
  )("does not depend on the order the ledger rows arrive in", (shuffled) => {
    expect(
      describeDeployedSchemaStatus(FILES, readingWith(shuffled)).outcome,
    ).toBe("level");
  });

  // Every proper subset of the ledger, including the empty one and every hole: the guard may never
  // claim level for a database that has not recorded all four files.
  propertyTest.prop([fc.subarray(EVERY_FILE_APPLIED)], {
    seed: 20260907,
    numRuns: 200,
  })("never reports level for a ledger short of a file", (subset) => {
    const report = describeDeployedSchemaStatus(FILES, readingWith(subset));

    expect(isDeployedSchemaLevel(report)).toBe(
      subset.length === EVERY_FILE_APPLIED.length,
    );
    expect([
      "level",
      "outside-the-ledger",
      "behind",
      "diverged",
      "columns-missing",
      "columns-misshapen",
    ]).toContain(report.outcome);
  });

  // One column at a time, so a required column that stopped being checked is caught wherever it
  // sits in the list rather than only at `revision`. Every column, not a sample of them: the list
  // is eight long, and a sample is only as good as the columns its seed happens to draw.
  it.each(REQUIRED_DESIGN_COLUMNS)(
    "refuses a table missing the required column $name",
    (absentColumn) => {
      const report = describeDeployedSchemaStatus(FILES, {
        ledger: { kind: "present", applied: EVERY_FILE_APPLIED },
        designColumns: REQUIRED_DESIGN_COLUMNS.filter(
          (column) => column.name !== absentColumn.name,
        ),
        documentSchemaVersions: [1],
      });

      expect(report.outcome).toBe("columns-missing");
      expect(report.detail).toContain(absentColumn.name);
    },
  );

  // The other half of that sweep. `revision` is the column the reading was widened for, but pinning
  // only `revision` would let the next column's shape quietly stop being checked, so the flip is
  // swept over every one of them.
  it.each(REQUIRED_DESIGN_COLUMNS)(
    "refuses a table whose column $name has the wrong nullability",
    (flipped) => {
      const report = describeDeployedSchemaStatus(FILES, {
        ledger: { kind: "present", applied: EVERY_FILE_APPLIED },
        designColumns: REQUIRED_DESIGN_COLUMNS.map((column) =>
          column.name === flipped.name
            ? { ...column, isNullable: !column.isNullable }
            : column,
        ),
        documentSchemaVersions: [1],
      });

      // Distinct from "missing" on purpose: the column is there, so `migrate` would change nothing.
      expect(report.outcome).toBe("columns-misshapen");
      expect(report.detail).toContain(flipped.name);
    },
  );
});
