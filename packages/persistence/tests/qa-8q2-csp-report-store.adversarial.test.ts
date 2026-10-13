// Wave 8Q2, QA's attack on the report store without a database: the ring's placement over every capacity, what a
// refused row must leave untouched, the Neon store's statement count under every failure that looks transient, a reply
// that is not one written report, a value whose type is not the type the row declares, and migration 0009's text read
// the way the unattended screen reads it. The driver is mocked, so a statement that must not be sent is shown by none
// recorded. Nothing here reaches a database.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inspect } from "node:util";

import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CSP_REPORT_CAPACITY,
  CspReportStoreError,
  requireValidCspReportPlacement,
  requireValidCspReportRow,
  slotOf,
} from "../src/csp-report-store.js";
import type { CspReportRow } from "../src/csp-report-store.js";
import { FakeCspReportStore } from "../src/fake-csp-report-store.js";
import type { MigrationFile } from "../src/migration-files.js";
import {
  executableStatementsOf,
  unattendedMigrationRefusals,
  unmodelledConstructsOf,
} from "../src/migration-safety.js";
import { NeonCspReportStore } from "../src/neon-csp-report-store.js";
import {
  aBareRow,
  aFullRow,
  markOf,
  validCspReportRow,
} from "./support/csp-report-fixtures.js";
import {
  answerWith,
  driver,
  failWith,
  resetDriver,
  throwSynchronously,
} from "./support/mocked-neon-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

const UNREACHED_URL =
  "postgresql://owner:secret@host.neon.tech/neondb?sslmode=require";
const MARK = markOf("c");
const PLANTED = "Zq7QaPlantedSecretOfTheDriver";

const MIGRATION_FILE_NAME = "0009_create_csp_reports.sql";
const MIGRATION_SQL = readFileSync(
  join(import.meta.dirname, "..", "src", "migrations", MIGRATION_FILE_NAME),
  "utf8",
);

function aStore(): NeonCspReportStore {
  return new NeonCspReportStore(UNREACHED_URL);
}

/** `row` with `field` set to a value the declared type does not allow, as a caller that bypassed the compiler sends. */
function withField(
  row: CspReportRow,
  field: string,
  value: unknown,
): CspReportRow {
  return { ...row, [field]: value } as unknown as CspReportRow;
}

describe("the ring's placement, over every capacity", () => {
  it("accepts exactly the slot a number maps to and refuses every other slot, for capacities 1 to 40", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: -3, max: 45 }),
        (capacity, reportNumber, slot) => {
          const isTheMappedSlot = slot === slotOf(reportNumber, capacity);
          const verdict = () => {
            requireValidCspReportPlacement({ slot, reportNumber }, capacity);
          };

          if (isTheMappedSlot) expect(verdict).not.toThrow();
          else expect(verdict).toThrow(/Refusing to record a CSP report/);
        },
      ),
      { numRuns: 400 },
    );
  });

  it.each([
    ["a report number of 0", { slot: 0, reportNumber: 0 }],
    ["a negative report number", { slot: 0, reportNumber: -10_000 }],
    ["a fractional report number", { slot: 0, reportNumber: 1.5 }],
    [
      "a report number past the safe integers",
      { slot: 0, reportNumber: 2 ** 53 },
    ],
    [
      "a slot at the capacity",
      { slot: CSP_REPORT_CAPACITY, reportNumber: CSP_REPORT_CAPACITY },
    ],
    ["a negative slot", { slot: -1, reportNumber: CSP_REPORT_CAPACITY - 1 }],
    ["a slot that is not a number", { slot: Number.NaN, reportNumber: 1 }],
  ])("refuses %s", (_label, placement) => {
    expect(() => {
      requireValidCspReportPlacement(placement);
    }).toThrow(/Refusing to record a CSP report/);
  });

  it("puts report number N in slot 0 and N - 1 in slot N - 1, at the table's own capacity", () => {
    expect(slotOf(CSP_REPORT_CAPACITY, CSP_REPORT_CAPACITY)).toBe(0);
    expect(slotOf(CSP_REPORT_CAPACITY - 1, CSP_REPORT_CAPACITY)).toBe(
      CSP_REPORT_CAPACITY - 1,
    );
    expect(slotOf(1, CSP_REPORT_CAPACITY)).toBe(1);
  });
});

describe("the fake ring, attacked", () => {
  it("a refused row advances nothing and removes nothing, whatever refused rows are interleaved with kept ones", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.array(
          fc.oneof(
            validCspReportRow.map((row) => ({ row, isValid: true })),
            fc
              .constantFrom(
                "directive",
                "blocked",
                "page",
                "locale",
                "origin",
                "disposition",
                "writerMark",
              )
              .map((field) => ({
                row: withField(aBareRow(MARK), field, "NOT-A-VALID-VALUE"),
                isValid: false,
              })),
          ),
          { maxLength: 40 },
        ),
        async (capacity, attempts) => {
          const store = new FakeCspReportStore(capacity);
          let kept = 0;

          for (const { row, isValid } of attempts) {
            const heldBefore = store.heldReports();
            const outcome = await store.recordReport(row).then(
              () => "kept",
              () => "refused",
            );
            if (isValid) kept += 1;
            else expect(store.heldReports()).toEqual(heldBefore);
            expect(outcome).toBe(isValid ? "kept" : "refused");
          }

          expect(store.reportsEverStored()).toBe(kept);
          const numbers = store.heldReports().map((held) => held.reportNumber);
          expect(numbers.length).toBe(Math.min(kept, capacity));
          for (const held of store.heldReports()) {
            expect(held.slot).toBe(held.reportNumber % capacity);
          }
          expect(Math.max(0, ...numbers)).toBe(kept);
        },
      ),
      { numRuns: 150 },
    );
  });

  it.each([
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0.5,
    -0,
    2 ** 60,
  ])("refuses the capacity %s", (capacity) => {
    expect(() => new FakeCspReportStore(capacity)).toThrow(
      /capacity must be a whole number of at least 1/,
    );
  });

  it("keeps the newest report in a ring of one after any run of writes, and its number is the count", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validCspReportRow, { minLength: 1, maxLength: 30 }),
        async (rows) => {
          const store = new FakeCspReportStore(1);
          for (const row of rows) await store.recordReport(row);

          expect(store.heldReports()).toHaveLength(1);
          expect(store.heldReports()[0]).toMatchObject({
            slot: 0,
            reportNumber: rows.length,
            blocked: rows.at(-1)?.blocked,
            writerMark: rows.at(-1)?.writerMark,
          });
        },
      ),
      { numRuns: 80 },
    );
  });
});

describe("a value whose type is not the type the row declares", () => {
  const NOT_TEXT = [
    null,
    undefined,
    0,
    1,
    true,
    {},
    [],
    ["inline"],
    () => "inline",
  ];
  const NOT_AN_INTEGER = [
    null,
    "5",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0.5,
    -1,
    10_000_001,
    {},
    [5],
    true,
  ];

  it.each([
    "directive",
    "blocked",
    "page",
    "locale",
    "origin",
    "disposition",
    "writerMark",
  ])("refuses %s when it is not text, whatever else it is", (field) => {
    for (const value of NOT_TEXT) {
      expect(
        () => {
          requireValidCspReportRow(withField(aFullRow(MARK), field, value));
        },
        `${field} = ${typeof value}`,
      ).toThrow(/Refusing to record a CSP report/);
    }
  });

  it.each(["line", "column"])(
    "refuses %s unless it is a whole number from 0 to 10,000,000 or absent, and null is not absent",
    (field) => {
      for (const value of NOT_AN_INTEGER) {
        expect(
          () => {
            requireValidCspReportRow(withField(aFullRow(MARK), field, value));
          },
          `${field} = ${inspect(value)}`,
        ).toThrow(/Refusing to record a CSP report/);
      }
    },
  );

  it("refuses status unless it is a whole number from 100 to 599 or absent, null and every neighbour included", () => {
    const refused = [...NOT_AN_INTEGER, 99, 600, 0, 1000];
    for (const value of refused) {
      expect(
        () => {
          requireValidCspReportRow(withField(aFullRow(MARK), "status", value));
        },
        `status = ${inspect(value)}`,
      ).toThrow(/Refusing to record a CSP report/);
    }
    for (const value of [100, 599, 200]) {
      expect(() => {
        requireValidCspReportRow(withField(aFullRow(MARK), "status", value));
      }).not.toThrow();
    }
  });

  it("refuses source as null, which is not absent", () => {
    expect(() => {
      requireValidCspReportRow(withField(aFullRow(MARK), "source", null));
    }).toThrow(/Refusing to record a CSP report/);
  });

  it("holds none of a refused value in its words", () => {
    const refusal = (() => {
      try {
        requireValidCspReportRow(
          withField(aFullRow(MARK), "blocked", `https://${PLANTED}/x`),
        );
      } catch (thrown) {
        return thrown as Error;
      }
      throw new Error("the row was not refused");
    })();

    expect(refusal.message).not.toContain(PLANTED);
  });

  it("refuses a boundary pair around every length and range limit, exactly at the edge", () => {
    const withBlocked = (blocked: string) =>
      withField(aBareRow(MARK), "blocked", blocked);
    const hostOfLength = (length: number) =>
      `https://${"a".repeat(length - "https://".length)}`;
    const astralHost = (length: number) =>
      `https://${"\u{1D4B3}".repeat(length - "https://".length)}`;

    expect(() => {
      requireValidCspReportRow(withBlocked(hostOfLength(255)));
    }).not.toThrow();
    expect(() => {
      requireValidCspReportRow(withBlocked(hostOfLength(256)));
    }).toThrow();
    expect(() => {
      requireValidCspReportRow(withBlocked(astralHost(255)));
    }).not.toThrow();
    expect(() => {
      requireValidCspReportRow(withBlocked(astralHost(256)));
    }).toThrow();
    expect(() => {
      requireValidCspReportRow(withBlocked("https://"));
    }).toThrow();
    expect(() => {
      requireValidCspReportRow(withBlocked("http://a/"));
    }).toThrow();
    expect(() => {
      requireValidCspReportRow(withBlocked("HTTP://a.example"));
    }).toThrow();
  });
});

describe("NeonCspReportStore under every failure, with the driver replaced", () => {
  beforeEach(resetDriver);

  const LOOKS_TRANSIENT = [
    ["a fetch that failed", new Error("fetch failed")],
    [
      "a reset connection",
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    ],
    [
      "an administrator shutdown (57P01)",
      Object.assign(new Error("terminating connection"), { code: "57P01" }),
    ],
    [
      "a serialization failure (40001)",
      Object.assign(new Error("could not serialize"), { code: "40001" }),
    ],
    [
      "a deadlock (40P01)",
      Object.assign(new Error("deadlock detected"), { code: "40P01" }),
    ],
    [
      "a connection failure (08006)",
      Object.assign(new Error("connection failure"), { code: "08006" }),
    ],
    [
      "a timeout",
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
    ],
    [
      "a missing table (42P01)",
      Object.assign(new Error('relation "csp_reports" does not exist'), {
        code: "42P01",
      }),
    ],
    [
      "a missing grant (42501)",
      Object.assign(new Error("permission denied for table csp_reports"), {
        code: "42501",
      }),
    ],
    ["a rejection with a string", "boom"],
    ["a rejection with undefined", undefined],
  ] as const;

  it.each(LOOKS_TRANSIENT)(
    "sends one statement and no second for %s, and rejects with a store error",
    async (_label, failure) => {
      failWith(failure);
      answerWith([{ report_number: "1" }]);

      const rejection = await rejectionOf(
        aStore().recordReport(aBareRow(MARK)),
      );

      expect(rejection).toBeInstanceOf(CspReportStoreError);
      expect(driver.statements).toHaveLength(1);
    },
  );

  it.each(LOOKS_TRANSIENT)(
    "sends one statement and no second when the driver throws %s before it returns a promise",
    async (_label, failure) => {
      throwSynchronously(failure);
      answerWith([{ report_number: "1" }]);

      const rejection = await rejectionOf(
        aStore().recordReport(aBareRow(MARK)),
      );

      expect(rejection).toBeInstanceOf(CspReportStoreError);
      expect(driver.statements).toHaveLength(1);
    },
  );

  it("leaves nothing a driver said in the error, its cause or its text, for any message", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z0-9]{10,24}$/),
        fc.constantFrom("42P01", "42501", "23514", "XX000"),
        async (secret, code) => {
          resetDriver();
          const planted = `${PLANTED}${secret}`;
          failWith(
            Object.assign(
              new Error(
                `password authentication failed for ${planted} at postgres://u:${planted}@h/db`,
              ),
              {
                code,
                detail: planted,
                hint: planted,
                query: planted,
                parameters: [planted],
              },
            ),
          );

          const rejection = (await rejectionOf(
            aStore().recordReport(aBareRow(MARK)),
          )) as CspReportStoreError;

          const everything = [
            rejection.message,
            rejection.name,
            inspect(rejection, { depth: 6 }),
            JSON.stringify(rejection, Object.getOwnPropertyNames(rejection)),
            JSON.stringify(
              rejection.cause,
              Object.getOwnPropertyNames(rejection.cause ?? {}),
            ),
            rejection.stack ?? "",
          ].join("\n");
          expect(everything).not.toContain(planted);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("resolves only for exactly one row holding a positive whole report number, as a number or as digits", async () => {
    const replies: [string, unknown, boolean][] = [
      ["one number", [{ report_number: 3 }], true],
      [
        "one string of digits",
        [{ report_number: "12345678901234567890" }],
        true,
      ],
      ["a string with a leading zero", [{ report_number: "01" }], false],
      ["a negative string", [{ report_number: "-1" }], false],
      ["a negative number", [{ report_number: -1 }], false],
      ["zero as a number", [{ report_number: 0 }], false],
      ["a number past the safe integers", [{ report_number: 2 ** 53 }], false],
      ["a fraction as text", [{ report_number: "1.5" }], false],
      ["an exponent as text", [{ report_number: "1e3" }], false],
      ["a line break after digits", [{ report_number: "7\n" }], false],
      ["a boolean", [{ report_number: true }], false],
      ["null", [{ report_number: null }], false],
      ["an array holding the number", [{ report_number: [1] }], false],
      ["no rows", [], false],
      ["undefined", undefined, false],
      ["a string", "1", false],
      ["a number", 1, false],
      ["two rows", [{ report_number: 1 }, { report_number: 2 }], false],
      ["a row inside a row", [[{ report_number: 1 }]], false],
    ];

    for (const [label, reply, isWritten] of replies) {
      resetDriver();
      answerWith(reply);

      const outcome = await aStore()
        .recordReport(aBareRow(MARK))
        .then(
          () => "written",
          (failure: unknown) =>
            failure instanceof CspReportStoreError ? "store error" : "other",
        );

      expect(outcome, label).toBe(isWritten ? "written" : "store error");
      expect(driver.statements, label).toHaveLength(1);
    }
  });

  it("sends no statement for any row the code refuses, over arbitrary single-field damage", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "directive",
          "blocked",
          "page",
          "locale",
          "origin",
          "disposition",
          "writerMark",
          "line",
          "column",
          "status",
          "source",
        ),
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.constant(null),
          fc.double(),
          fc.boolean(),
        ),
        async (field, damage) => {
          resetDriver();
          const damaged = withField(aFullRow(MARK), field, damage);
          const isRefusedByCode = (() => {
            try {
              requireValidCspReportRow(damaged);
              return false;
            } catch {
              return true;
            }
          })();
          answerWith([{ report_number: "1" }]);

          const outcome = await aStore()
            .recordReport(damaged)
            .then(
              () => "written",
              () => "refused",
            );

          expect(outcome).toBe(isRefusedByCode ? "refused" : "written");
          expect(driver.statements).toHaveLength(isRefusedByCode ? 0 : 1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("puts the values the row holds into the statement and nothing the row does not hold, 0 and an empty absence kept apart", async () => {
    answerWith([{ report_number: "1" }]);

    await aStore().recordReport({
      ...aBareRow(MARK),
      line: 0,
      column: 0,
      status: 100,
    });

    const [statement] = driver.statements;
    expect(statement?.values).toEqual([
      MARK,
      "other",
      "inline",
      null,
      0,
      0,
      "other",
      "none",
      "none",
      "report",
      100,
    ]);
  });
});

describe("migration 0009's text, read as the unattended screen reads it", () => {
  const SHIPPED = shippedAs(MIGRATION_SQL);

  it("clears the screen and holds no construct the screen cannot lex", () => {
    expect(unmodelledConstructsOf(MIGRATION_SQL)).toEqual([]);
    expect(unattendedMigrationRefusals([SHIPPED])).toEqual([]);
  });

  it.each([
    [
      "a backslash inside a quoted string",
      `${MIGRATION_SQL}\ninsert into csp_report_cursor (singleton, last_number) values (true, 0) on conflict do nothing;\ncomment on table csp_reports is 'a${String.fromCharCode(92)}b';`,
    ],
    ["a delete statement", `${MIGRATION_SQL}\ndelete from csp_reports;`],
    [
      "an update statement",
      `${MIGRATION_SQL}\nupdate csp_report_cursor set last_number = 0;`,
    ],
    ["a truncate", `${MIGRATION_SQL}\ntruncate csp_reports;`],
    [
      "a grant",
      `${MIGRATION_SQL}\ngrant delete on csp_reports to app_designs;`,
    ],
    ["a drop", `${MIGRATION_SQL}\ndrop table csp_reports;`],
    ["a sequence", `${MIGRATION_SQL}\ncreate sequence csp_report_numbers;`],
  ])(
    "would be refused with %s added: the screen is a gate this text is held to",
    (_label, mutated) => {
      expect(unattendedMigrationRefusals([shippedAs(mutated)])).not.toEqual([]);
    },
  );

  it("holds eighteen named constraints (sixteen on the reports, two on the cursor), every one a check", () => {
    const statements = executableStatementsOf(MIGRATION_SQL).join(" ");
    const names = [
      ...statements.matchAll(/\bconstraint ([a-z_0-9]+) (\w+) \(/g),
    ];

    expect(names).toHaveLength(18);
    for (const [, name, kind] of names) {
      expect(kind, `${name ?? ""} is a check`).toBe("check");
    }
    expect(new Set(names.map(([, name]) => name)).size).toBe(18);
  });

  it("writes no backslash anywhere, comments included, and holds exactly three statements", () => {
    expect(MIGRATION_SQL).not.toContain(String.fromCharCode(92));
    expect(executableStatementsOf(MIGRATION_SQL)).toHaveLength(3);
  });

  it("is the only file on disk numbered 0009, and the migrations before it are numbered without a gap", () => {
    const directory = join(import.meta.dirname, "..", "src", "migrations");
    const names = readdirSyncSorted(directory);

    expect(names.filter((name) => name.startsWith("0009_"))).toEqual([
      MIGRATION_FILE_NAME,
    ]);
    const numbers = names.map((name) => Number(name.slice(0, 4)));
    expect(numbers).toEqual(
      Array.from({ length: numbers.length }, (_, index) => index + 1),
    );
  });
});

/** The migration as the screen is handed it: the checksum is the ledger's concern and the screen never reads it. */
function shippedAs(sql: string): MigrationFile {
  return { version: 9, fileName: MIGRATION_FILE_NAME, sql, checksum: "" };
}

function readdirSyncSorted(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

describe("the privilege test's two skips are loud and neither can pass silently (criterion 7)", () => {
  const PRIVILEGE_TEST = readFileSync(
    join(import.meta.dirname, "application-role-privileges.test.ts"),
    "utf8",
  );
  const CSP_TESTS = [
    ...PRIVILEGE_TEST.matchAll(
      /guardedTest\(\s*"([^"]*csp[^"]*)",\s*async \(context\) => \{\s*(await skipUnlessTheCspTablesExist\(context\);)?/g,
    ),
  ];

  it("has the four csp tests, and each begins by skipping when the tables are absent", () => {
    expect(CSP_TESTS).toHaveLength(4);
    for (const [, name, firstStatement] of CSP_TESTS) {
      expect(firstStatement, name).toBe(
        "await skipUnlessTheCspTablesExist(context);",
      );
    }
  });

  it("skips with the reason the criterion names, once for each table, and asks the catalog and not a table", () => {
    const skipper = PRIVILEGE_TEST.slice(
      PRIVILEGE_TEST.indexOf("async function skipUnlessTheCspTablesExist"),
    ).split("\n}\n")[0];

    expect(skipper).toContain("to_regclass(");
    expect(skipper?.match(/context\.skip\(/g)).toHaveLength(2);
    expect(skipper).toContain("does not exist yet on this database");
    expect(skipper).not.toMatch(/\bit\.skip\b|\.todo\(|return;/);
  });

  it("says, when it has nothing to connect to, that nothing was asserted, in a line a reader of the run can find", () => {
    expect(PRIVILEGE_TEST).toContain("[live-suite skipped]");
    expect(PRIVILEGE_TEST).toContain("Nothing here was asserted.");
    expect(PRIVILEGE_TEST).toContain("8Q2 criterion 7");
  });
});
