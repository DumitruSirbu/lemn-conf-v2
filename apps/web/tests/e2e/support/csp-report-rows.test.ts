import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readCspReportWriterMark } from "@/lib/server/csp/csp-report-writer-mark";
import { encodeDigestInput } from "@/lib/server/digest/keyed-digest";

import { readTestSource } from "../../lib/server/server-source-support";

const persistence = vi.hoisted(() => ({
  counted: [] as (readonly string[])[],
  removed: [] as (readonly string[])[],
  rowsStored: 0,
  failCount: undefined as Error | undefined,
}));

vi.mock("@lemnaria/persistence", () => ({
  countCspReportsForTests: (marks: readonly string[]) => {
    persistence.counted.push(marks);
    if (persistence.failCount !== undefined) {
      return Promise.reject(persistence.failCount);
    }
    return Promise.resolve(persistence.rowsStored);
  },
  deleteCspReportsForTests: (marks: readonly string[]) => {
    persistence.removed.push(marks);
    return Promise.resolve(persistence.rowsStored);
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
const RUN_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

/** The file the run's second servers' marks are written to, found the way the module finds it. */
function registryFileOf(runSecret: string): string {
  const prefix = cspReportWriterMarkOf(runSecret).slice(0, 16);
  return join(tmpdir(), `lemnaria-e2e-second-server-marks-${prefix}`);
}

beforeEach(() => {
  persistence.counted.length = 0;
  persistence.removed.length = 0;
  persistence.rowsStored = 0;
  persistence.failCount = undefined;
  vi.stubEnv("TEST_WORKER_INDEX", undefined);
  vi.stubEnv("LEMNARIA_E2E_RUN_SECRET", undefined);
  Reflect.deleteProperty(globalThis, MADE_IN_THIS_PROCESS);
});

afterEach(() => {
  rmSync(registryFileOf(secretOfThisRun()), { force: true });
  vi.unstubAllEnvs();
  Reflect.deleteProperty(globalThis, MADE_IN_THIS_PROCESS);
});

describe("the writer mark the harness derives", () => {
  it("is the mark the server makes from the same secret, so the teardown removes the rows the server wrote", () => {
    const secrets = [RUN_SECRET, makeRunSecret(), makeRunSecret()];

    for (const secret of secrets) {
      const served = readCspReportWriterMark({ DIGEST_SECRET: secret });

      expect(served).toEqual({
        status: "usable",
        mark: cspReportWriterMarkOf(secret),
      });
    }
  });

  it("is a digest of exactly the encoding the decision records, which pins the purpose, the field and the table", () => {
    const encoding = encodeDigestInput({
      purpose: "csp-report-writer",
      fields: { table: "csp_reports" },
    });

    expect(encoding).toBe("17:csp-report-writer,11:csp_reports,");
  });

  it("differs between two secrets, and is sixty-four lowercase hexadecimal characters", () => {
    const first = cspReportWriterMarkOf(makeRunSecret());
    const second = cspReportWriterMarkOf(makeRunSecret());

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });
});

describe("a second server's secret", () => {
  it("is a fresh run secret whose writer mark is written down for the teardown, before any server can use it", () => {
    const runSecret = secretOfThisRun();

    const first = makeSecondServerSecret();
    const second = makeSecondServerSecret();

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
    expect(readSecondServerMarks(runSecret)).toEqual([
      cspReportWriterMarkOf(first),
      cspReportWriterMarkOf(second),
    ]);
  });

  it("is registered from a test worker under the run's own secret, where the main process looks for it", () => {
    const runSecret = secretOfThisRun();
    vi.stubEnv("TEST_WORKER_INDEX", "0");
    vi.stubEnv("LEMNARIA_E2E_RUN_SECRET", runSecret);

    const secret = makeSecondServerSecret();

    vi.stubEnv("TEST_WORKER_INDEX", undefined);
    expect(readSecondServerMarks(runSecret)).toEqual([
      cspReportWriterMarkOf(secret),
    ]);
  });

  it("names the run's secret in no file and holds no secret of the second server, only marks", () => {
    const runSecret = secretOfThisRun();
    const secret = makeSecondServerSecret();

    const path = registryFileOf(runSecret);
    const written = readFileSync(path, "utf8");

    expect(path).not.toContain(runSecret);
    expect(written).not.toContain(runSecret);
    expect(written).not.toContain(secret);
  });
});

describe("the list of second servers' marks", () => {
  it("is empty when no second server was started", () => {
    expect(readSecondServerMarks(secretOfThisRun())).toEqual([]);
  });

  it("answers each mark once, however often it was written", () => {
    const runSecret = secretOfThisRun();
    const mark = cspReportWriterMarkOf(makeRunSecret());
    writeFileSync(registryFileOf(runSecret), `${mark}\n${mark}\n`);

    expect(readSecondServerMarks(runSecret)).toEqual([mark]);
  });

  it.each([
    ["an upper-case mark", "A".repeat(64)],
    ["a short mark", "ab".repeat(31)],
    ["a line that is not a mark", "x' or true --"],
  ])("refuses %s rather than hand it to a delete", (_name, line) => {
    const runSecret = secretOfThisRun();
    writeFileSync(registryFileOf(runSecret), `${line}\n`);

    expect(() => readSecondServerMarks(runSecret)).toThrow(
      "not sixty-four lowercase hexadecimal characters",
    );
  });
});

describe("removing the rows of the run", () => {
  it("counts then removes the suite's mark and every second server's mark, each group by itself", async () => {
    const runSecret = secretOfThisRun();
    const first = makeSecondServerSecret();
    const second = makeSecondServerSecret();
    persistence.rowsStored = 4;

    const { figures, failures } = await removeCspReportRowsOfTheRun(runSecret);

    const suiteMark = cspReportWriterMarkOf(runSecret);
    const secondMarks = [first, second].map(cspReportWriterMarkOf);
    expect(persistence.counted).toEqual([[suiteMark], secondMarks]);
    expect(persistence.removed).toEqual([[suiteMark], secondMarks]);
    expect(failures).toEqual([]);
    expect(figures).toEqual({
      suite: { counted: 4, removed: 4 },
      secondServers: { counted: 4, removed: 4 },
      secondServersStarted: 2,
    });
  });

  it("reaches the database for the suite's mark alone when no second server was started", async () => {
    const runSecret = secretOfThisRun();

    await removeCspReportRowsOfTheRun(runSecret);

    expect(persistence.removed).toEqual([[cspReportWriterMarkOf(runSecret)]]);
  });

  it("forgets the second servers only after their rows are gone, so a failed removal can be tried again", async () => {
    const runSecret = secretOfThisRun();
    makeSecondServerSecret();
    persistence.failCount = new Error("the table cannot be reached");

    const failed = await removeCspReportRowsOfTheRun(runSecret);

    expect(failed.failures.map((failure) => failure.message)).toEqual([
      "the table cannot be reached",
      "the table cannot be reached",
    ]);
    expect(existsSync(registryFileOf(runSecret))).toBe(true);

    persistence.failCount = undefined;
    const retried = await removeCspReportRowsOfTheRun(runSecret);

    expect(retried.failures).toEqual([]);
    expect(existsSync(registryFileOf(runSecret))).toBe(false);
  });

  it("answers a failure rather than throwing, and still tries the second group when the first fails", async () => {
    const runSecret = secretOfThisRun();
    makeSecondServerSecret();
    persistence.failCount = new Error("down");

    await expect(removeCspReportRowsOfTheRun(runSecret)).resolves.toMatchObject(
      { figures: { suite: { counted: 0, removed: 0 } } },
    );

    expect(persistence.counted).toHaveLength(2);
  });
});

describe("the ceiling on the suite's rows", () => {
  it("accepts as many rows as hits, and none", () => {
    expect(() => {
      requireCspReportRowsWithinHits(3, 3);
      requireCspReportRowsWithinHits(0, 0);
    }).not.toThrow();
  });

  it("refuses one row more than the counter recorded, naming both counts and no mark", () => {
    expect(() => {
      requireCspReportRowsWithinHits(4, 3);
    }).toThrow(CspReportRowsExceedHitsError);
    expect(() => {
      requireCspReportRowsWithinHits(4, 3);
    }).toThrow(/removed 4 csp_reports rows[^]*recorded 3 hits/);
  });
});

describe("the second server's secret in the harness", () => {
  it("is made by the registering function and never by the bare maker, which would leave its rows behind", () => {
    const server = readTestSource("e2e/support/production-policy-server.ts");

    expect(server).toContain("makeSecondServerSecret()");
    expect(server).not.toContain("makeRunSecret");
  });
});
