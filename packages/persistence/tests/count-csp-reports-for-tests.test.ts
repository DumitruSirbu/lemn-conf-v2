import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { countCspReportsForTests } from "../src/count-csp-reports-for-tests.js";
import {
  answerWith,
  driver,
  resetDriver,
} from "./support/mocked-neon-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

const APPLICATION_URL =
  "postgresql://owner:secret@host.neon.tech/neondb?sslmode=require";
const TEST_URL = "postgresql://owner:secret@host.neon.tech/lemnaria_test";

const MARK_ONE = "a".repeat(64);
const MARK_TWO = "0123456789abcdef".repeat(4);

describe("countCspReportsForTests", () => {
  beforeEach(() => {
    resetDriver();
    vi.stubEnv("DATABASE_URL", APPLICATION_URL);
    vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("the statement, pinned", () => {
    it("is one select of a count, naming the table once, with the marks as its one bound array, in full", async () => {
      answerWith([{ stored: 2 }]);

      await countCspReportsForTests([MARK_ONE, MARK_TWO]);

      expect(driver.statements).toHaveLength(1);
      const [statement] = driver.statements;
      expect(statement?.values).toEqual([[MARK_ONE, MARK_TWO]]);
      expect(statement?.text.replace(/\s+/g, " ").trim()).toBe(
        "select count(*)::int as stored from csp_reports where writer_mark = any(?)",
      );
    });

    it("selects no column, writes nothing and names no cursor", async () => {
      answerWith([{ stored: 0 }]);

      await countCspReportsForTests([MARK_ONE]);

      const text = driver.statements[0]?.text ?? "";
      expect(text).not.toMatch(
        /\bdelete\b|\bupdate\b|\binsert\b|truncate|drop|\blike\b|;|csp_report_cursor/i,
      );
      expect(text.match(/\bselect\b/gi)).toHaveLength(1);
      expect(text).toMatch(/select count\(\*\)/i);
    });

    it("sends no statement for an empty list and answers none", async () => {
      await expect(countCspReportsForTests([])).resolves.toBe(0);
      expect(driver.statements).toEqual([]);
    });
  });

  describe("a mark that is not a digest is not sent anywhere", () => {
    it.each([
      ["a wildcard", "%"],
      ["nothing", ""],
      ["sixty-three characters", "a".repeat(63)],
      ["upper-case hex", "A".repeat(64)],
      ["a quote", `${"a".repeat(63)}'`],
    ])("sends nothing when one mark is %s", async (_label, bad) => {
      await expect(countCspReportsForTests([MARK_ONE, bad])).rejects.toThrow(
        /Refusing to count CSP reports/,
      );
      expect(driver.statements).toEqual([]);
    });
  });

  describe("the guard, asserted before any statement", () => {
    it("sends no statement when the test URL is the application database", async () => {
      vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

      await expect(countCspReportsForTests([MARK_ONE])).rejects.toThrow(
        /Refusing to run live database tests/,
      );
      expect(driver.statements).toEqual([]);
    });
  });

  describe("the order of the guards", () => {
    it("refuses a bad mark before it looks at the database, so an unsafe test URL is never reached", async () => {
      vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

      await expect(countCspReportsForTests(["%"])).rejects.toThrow(
        /Refusing to count CSP reports/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("answers none for an empty list before it looks at the database, so an unsafe test URL is never reached", async () => {
      vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

      await expect(countCspReportsForTests([])).resolves.toBe(0);
      expect(driver.statements).toEqual([]);
    });

    it("refuses production mode, naming itself, and sends no statement", async () => {
      vi.stubEnv("NODE_ENV", "production");

      await expect(countCspReportsForTests([MARK_ONE])).rejects.toThrow(
        "countCspReportsForTests was called with NODE_ENV=production",
      );
      expect(driver.statements).toEqual([]);
    });

    it("refuses a process that is no test runner, naming itself, and sends no statement", async () => {
      for (const marker of ["VITEST", "TEST_WORKER_INDEX", "PLAYWRIGHT_TEST"])
        vi.stubEnv(marker, "");

      await expect(countCspReportsForTests([MARK_ONE])).rejects.toThrow(
        "countCspReportsForTests was called outside a test runner",
      );
      expect(driver.statements).toEqual([]);
    });
  });

  describe("what it answers", () => {
    it.each([0, 1, 2])(
      "answers the number the database counted, %i",
      async (stored) => {
        answerWith([{ stored }]);

        await expect(
          countCspReportsForTests([MARK_ONE, MARK_TWO]),
        ).resolves.toBe(stored);
      },
    );

    it.each([
      ["a text", [{ stored: "2" }]],
      ["a fraction", [{ stored: 1.5 }]],
      ["a negative number", [{ stored: -1 }]],
      ["no row", []],
      ["two rows", [{ stored: 1 }, { stored: 1 }]],
    ])("refuses an answer that is %s", async (_label, reply) => {
      answerWith(reply);

      await expect(countCspReportsForTests([MARK_ONE])).rejects.toThrow(
        /something that is not a count/,
      );
    });
  });
});
