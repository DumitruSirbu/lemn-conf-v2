import { appendFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readTestSource } from "../../lib/server/server-source-support";

/**
 * Wave 8Q2, QA's attack on the teardown's count and removal of the run's `csp_reports` rows (criteria 15 and 17), with
 * the persistence helpers replaced by a table that holds rows under marks: whatever the teardown asks of it, a row under
 * a mark it was not handed must still be there afterwards. This is the planted foreign-mark row of the QA focus, at the
 * level where a mutant of the harness (not of a statement) can be run without a database.
 */
const table = vi.hoisted(() => ({
  rowsUnder: new Map<string, number>(),
  calls: [] as string[],
  failOn: undefined as "count" | "delete" | undefined,
}));

vi.mock("@lemnaria/persistence", () => ({
  countCspReportsForTests: (marks: readonly string[]) => {
    table.calls.push(`count:${marks.join(",")}`);
    if (table.failOn === "count") return Promise.reject(new Error("no count"));
    return Promise.resolve(
      marks.reduce((sum, mark) => sum + (table.rowsUnder.get(mark) ?? 0), 0),
    );
  },
  deleteCspReportsForTests: (marks: readonly string[]) => {
    table.calls.push(`delete:${marks.join(",")}`);
    if (table.failOn === "delete")
      return Promise.reject(new Error("no delete"));
    let removed = 0;
    for (const mark of marks) {
      removed += table.rowsUnder.get(mark) ?? 0;
      table.rowsUnder.delete(mark);
    }
    return Promise.resolve(removed);
  },
}));

const {
  CspReportRowsExceedHitsError,
  cspReportWriterMarkOf,
  makeSecondServerSecret,
  readSecondServerMarks,
  removeCspReportRowsOfTheRun,
  requireCspReportRowsWithinHits,
} = await import("./csp-report-rows");
const { makeRunSecret, secretOfThisRun } = await import("./e2e-rate-limit-run");

const MADE_IN_THIS_PROCESS = Symbol.for("lemnaria.e2e.run-secret");
const FOREIGN_MARK = "f".repeat(64);

function registryFileOf(runSecret: string): string {
  const prefix = cspReportWriterMarkOf(runSecret).slice(0, 16);
  return join(tmpdir(), `lemnaria-e2e-second-server-marks-${prefix}`);
}

beforeEach(() => {
  table.rowsUnder.clear();
  table.calls.length = 0;
  table.failOn = undefined;
  vi.stubEnv("TEST_WORKER_INDEX", undefined);
  vi.stubEnv("LEMNARIA_E2E_RUN_SECRET", undefined);
  Reflect.deleteProperty(globalThis, MADE_IN_THIS_PROCESS);
});

afterEach(() => {
  rmSync(registryFileOf(secretOfThisRun()), { force: true });
  vi.unstubAllEnvs();
  Reflect.deleteProperty(globalThis, MADE_IN_THIS_PROCESS);
});

describe("the ceiling, over every pair of counts (criterion 15)", () => {
  it("refuses exactly when the rows removed are more than the hits counted", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2_000_000 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        (rowsRemoved, hitsCounted) => {
          const outcome = () => {
            requireCspReportRowsWithinHits(rowsRemoved, hitsCounted);
          };

          if (rowsRemoved > hitsCounted) {
            expect(outcome).toThrow(CspReportRowsExceedHitsError);
          } else {
            expect(outcome).not.toThrow();
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("holds at the edge on both sides of every small count", () => {
    for (let hits = 0; hits < 50; hits += 1) {
      expect(() => {
        requireCspReportRowsWithinHits(hits, hits);
      }).not.toThrow();
      expect(() => {
        requireCspReportRowsWithinHits(hits + 1, hits);
      }).toThrow(CspReportRowsExceedHitsError);
      if (hits > 0) {
        expect(() => {
          requireCspReportRowsWithinHits(hits - 1, hits);
        }).not.toThrow();
      }
    }
  });
});

describe("the removal, against a table that holds rows of other writers (criteria 15, 16)", () => {
  it("removes the run's rows and its second servers' rows and not one row under any other mark, over any plant", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 0, max: 40 }),
        fc.array(fc.integer({ min: 0, max: 40 }), { maxLength: 6 }),
        fc.array(fc.stringMatching(/^[0-9a-f]{64}$/), { maxLength: 4 }),
        async (suiteRows, secondServerCount, secondRows, strangers) => {
          table.rowsUnder.clear();
          const runSecret = secretOfThisRun();
          rmSync(registryFileOf(runSecret), { force: true });
          const suiteMark = cspReportWriterMarkOf(runSecret);
          table.rowsUnder.set(suiteMark, suiteRows);
          const secondMarks: string[] = [];
          for (
            let index = 0;
            index < Math.min(secondServerCount, 6);
            index += 1
          ) {
            const mark = cspReportWriterMarkOf(makeSecondServerSecret());
            secondMarks.push(mark);
            table.rowsUnder.set(mark, secondRows[index] ?? 0);
          }
          const foreign = new Map<string, number>();
          for (const [index, stranger] of [
            FOREIGN_MARK,
            ...strangers,
          ].entries()) {
            if (stranger === suiteMark || secondMarks.includes(stranger))
              continue;
            foreign.set(stranger, index + 1);
            table.rowsUnder.set(stranger, index + 1);
          }

          const { figures, failures } =
            await removeCspReportRowsOfTheRun(runSecret);

          expect(failures).toEqual([]);
          expect(figures.suite.removed).toBe(suiteRows);
          expect(figures.secondServers.removed).toBe(
            secondMarks.reduce(
              (sum, _mark, index) => sum + (secondRows[index] ?? 0),
              0,
            ),
          );
          expect(figures.secondServersStarted).toBe(secondMarks.length);
          for (const [mark, held] of foreign) {
            expect(table.rowsUnder.get(mark), "a foreign writer's rows").toBe(
              held,
            );
          }
          expect(table.rowsUnder.get(suiteMark) ?? 0).toBe(0);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("counts a group before it removes it, and asks for nothing but marks it was told of", async () => {
    const runSecret = secretOfThisRun();
    const second = makeSecondServerSecret();
    table.rowsUnder.set(FOREIGN_MARK, 9);

    await removeCspReportRowsOfTheRun(runSecret);

    const suiteMark = cspReportWriterMarkOf(runSecret);
    const secondMark = cspReportWriterMarkOf(second);
    expect(table.calls).toEqual([
      `count:${suiteMark}`,
      `delete:${suiteMark}`,
      `count:${secondMark}`,
      `delete:${secondMark}`,
    ]);
    expect(table.rowsUnder.get(FOREIGN_MARK)).toBe(9);
  });

  it("removes the suite's rows even when the list of second servers holds a line that is no mark, and says so", async () => {
    const runSecret = secretOfThisRun();
    makeSecondServerSecret();
    appendFileSync(registryFileOf(runSecret), "%\n", "utf8");
    const suiteMark = cspReportWriterMarkOf(runSecret);
    table.rowsUnder.set(suiteMark, 5);

    const { figures, failures } = await removeCspReportRowsOfTheRun(runSecret);

    expect(table.rowsUnder.get(suiteMark) ?? 0).toBe(0);
    expect(figures.suite).toEqual({ counted: 5, removed: 5 });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toMatch(
      /not sixty-four lowercase hexadecimal/,
    );
    expect(table.calls.filter((call) => call.includes("%"))).toEqual([]);
    expect(
      existsSync(registryFileOf(runSecret)),
      "kept so a retry can find it",
    ).toBe(true);
  });

  it.each([
    ["an upper-case mark", "A".repeat(64)],
    ["a mark with trailing text", `${"a".repeat(64)} x`],
    ["a sixty-three character mark", "a".repeat(63)],
    ["a wildcard", "%"],
  ])(
    "never passes %s to the helpers, even beside good marks",
    async (_label, bad) => {
      const runSecret = secretOfThisRun();
      makeSecondServerSecret();
      appendFileSync(registryFileOf(runSecret), `${bad}\n`, "utf8");

      await removeCspReportRowsOfTheRun(runSecret);

      expect(table.calls.join("\n")).not.toContain(bad);
    },
  );

  it("reads blank lines and repeats of one mark as that mark once", () => {
    const runSecret = secretOfThisRun();
    const secret = makeSecondServerSecret();
    const mark = cspReportWriterMarkOf(secret);
    appendFileSync(registryFileOf(runSecret), `\n${mark}\n\n${mark}\n`, "utf8");

    expect(readSecondServerMarks(runSecret)).toEqual([mark]);
  });

  it("answers a failure of the removal alone as a failure, and still says the rows it counted were not removed", async () => {
    const runSecret = secretOfThisRun();
    table.rowsUnder.set(cspReportWriterMarkOf(runSecret), 3);
    table.failOn = "delete";

    const { figures, failures } = await removeCspReportRowsOfTheRun(runSecret);

    expect(failures.map((failure) => failure.message)).toEqual(["no delete"]);
    expect(table.rowsUnder.get(cspReportWriterMarkOf(runSecret))).toBe(3);
    expect(figures.suite.removed).toBe(0);
  });

  it("makes two runs' marks differ, so a second run on the same table never touches the first's rows", async () => {
    const secretOfOtherRun = makeRunSecret();
    const mineMark = cspReportWriterMarkOf(secretOfThisRun());
    const theirsMark = cspReportWriterMarkOf(secretOfOtherRun);
    table.rowsUnder.set(mineMark, 2);
    table.rowsUnder.set(theirsMark, 7);

    await removeCspReportRowsOfTheRun(secretOfThisRun());

    expect(table.rowsUnder.get(theirsMark)).toBe(7);
    expect(table.rowsUnder.get(mineMark) ?? 0).toBe(0);
  });
});

describe("how the teardown holds the ceiling (criterion 15)", () => {
  const teardown = readTestSource("e2e/global-teardown.ts");

  it("compares the rows the removal took away with the hits the counter recorded, not the rows counted beforehand", () => {
    expect(teardown).toMatch(
      /requireCspReportRowsWithinHits\(\s*cspRows\.figures\.suite\.removed,\s*cspReports\.hitsCounted,?\s*\)/,
    );
  });

  it("removes the run's rows before it judges anything, so a failed check leaves none behind", () => {
    const removal = teardown.indexOf("removeCspReportRowsOfTheRun(secret)");
    const judgement = teardown.indexOf("requireCspReportRowsWithinHits(");

    expect(removal).toBeGreaterThan(-1);
    expect(removal).toBeLessThan(judgement);
  });

  it("prints both figures of the rows, the suite's server's and the second servers'", () => {
    expect(teardown).toMatch(/csp_reports rows[^`]*removed/);
    expect(teardown).toMatch(/second servers stored/);
  });
});
