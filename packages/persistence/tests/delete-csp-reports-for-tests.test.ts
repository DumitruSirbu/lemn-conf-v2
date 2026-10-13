import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteCspReportsForTests } from "../src/delete-csp-reports-for-tests.js";
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

describe("deleteCspReportsForTests", () => {
  beforeEach(() => {
    resetDriver();
    vi.stubEnv("DATABASE_URL", APPLICATION_URL);
    vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("the statement, pinned", () => {
    it("is one delete naming the table once, with the marks as its one bound array, in full", async () => {
      answerWith([]);

      await deleteCspReportsForTests([MARK_ONE, MARK_TWO]);

      expect(driver.statements).toHaveLength(1);
      const [statement] = driver.statements;
      expect(statement?.values).toEqual([[MARK_ONE, MARK_TWO]]);
      expect(statement?.text.replace(/\s+/g, " ").trim()).toBe(
        "delete from csp_reports where writer_mark = any(?) returning slot",
      );
    });

    it("names no pattern, no other table, no truncate and no cursor", async () => {
      answerWith([]);

      await deleteCspReportsForTests([MARK_ONE]);

      const text = driver.statements[0]?.text ?? "";
      expect(text).not.toMatch(
        /\blike\b|\bilike\b|~|truncate|drop|\bor\b|\bjoin\b|\bunion\b|;|csp_report_cursor/i,
      );
      expect(text.match(/csp_reports/g)).toHaveLength(1);
    });

    it("sends exactly the marks it was handed, over many marks of the shape", async () => {
      const marks = Array.from({ length: 40 }, (_, index) =>
        index.toString(16).padStart(64, "0"),
      );
      answerWith([]);

      await deleteCspReportsForTests(marks);

      expect(driver.statements[0]?.values).toEqual([marks]);
    });

    it("sends no statement for an empty list and answers none removed", async () => {
      await expect(deleteCspReportsForTests([])).resolves.toBe(0);
      expect(driver.statements).toEqual([]);
    });
  });

  describe("a where that no longer names what it was handed is not sent anywhere", () => {
    it.each([
      ["a wildcard", "%"],
      ["a prefix pattern", `${"a".repeat(32)}%`],
      ["nothing", ""],
      ["sixty-three characters", "a".repeat(63)],
      ["sixty-five characters", "a".repeat(65)],
      ["upper-case hex", "A".repeat(64)],
      ["a letter outside hex", "g".repeat(64)],
      ["a line break after a good mark", `${MARK_ONE}\n`],
      ["a space inside", `${"a".repeat(32)} ${"a".repeat(31)}`],
      ["a quote", `${"a".repeat(63)}'`],
    ])(
      "sends nothing when one mark is %s, even beside good ones",
      async (_label, bad) => {
        await expect(
          deleteCspReportsForTests([MARK_ONE, bad, MARK_TWO]),
        ).rejects.toThrow(/Refusing to delete CSP reports/);
        expect(driver.statements).toEqual([]);
      },
    );

    it("holds none of the refused text in its refusal", async () => {
      await expect(
        deleteCspReportsForTests(["MARK-MARKER-%"]),
      ).rejects.not.toThrow(/MARKER/);
    });

    it("sends nothing for a value that is not text, a list of one mark included", async () => {
      await expect(
        deleteCspReportsForTests([42 as unknown as string]),
      ).rejects.toThrow(/Refusing to delete CSP reports/);
      await expect(
        deleteCspReportsForTests([[MARK_ONE] as unknown as string]),
      ).rejects.toThrow(/Refusing to delete CSP reports/);
      expect(driver.statements).toEqual([]);
    });
  });

  describe("the guard, asserted before any statement", () => {
    it("sends no statement when the test URL is the application database", async () => {
      vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

      await expect(deleteCspReportsForTests([MARK_ONE])).rejects.toThrow(
        /Refusing to run live database tests/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("sends no statement for a database whose name is not on the test allowlist", async () => {
      vi.stubEnv(
        "TEST_DATABASE_URL",
        "postgresql://owner:secret@isolated.neon.tech/some_other_db",
      );

      await expect(deleteCspReportsForTests([MARK_ONE])).rejects.toThrow(
        /not one of the databases this repository allows/,
      );
      expect(driver.statements).toEqual([]);
    });
  });

  describe("the order of the guards", () => {
    it("refuses a bad mark before it looks at the database, so an unsafe test URL is never reached", async () => {
      vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

      await expect(deleteCspReportsForTests(["%"])).rejects.toThrow(
        /Refusing to delete CSP reports/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("answers none for an empty list before it looks at the database, so an unsafe test URL is never reached", async () => {
      vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

      await expect(deleteCspReportsForTests([])).resolves.toBe(0);
      expect(driver.statements).toEqual([]);
    });

    it("refuses production mode, naming itself, and sends no statement", async () => {
      vi.stubEnv("NODE_ENV", "production");

      await expect(deleteCspReportsForTests([MARK_ONE])).rejects.toThrow(
        "deleteCspReportsForTests was called with NODE_ENV=production",
      );
      expect(driver.statements).toEqual([]);
    });

    it("refuses a process that is no test runner, naming itself, and sends no statement", async () => {
      for (const marker of ["VITEST", "TEST_WORKER_INDEX", "PLAYWRIGHT_TEST"])
        vi.stubEnv(marker, "");

      await expect(deleteCspReportsForTests([MARK_ONE])).rejects.toThrow(
        "deleteCspReportsForTests was called outside a test runner",
      );
      expect(driver.statements).toEqual([]);
    });
  });

  describe("what it answers", () => {
    it("answers how many rows went", async () => {
      answerWith([{ slot: 3 }, { slot: 9 }]);

      await expect(
        deleteCspReportsForTests([MARK_ONE, MARK_TWO]),
      ).resolves.toBe(2);
    });

    it("answers none when no row held a handed mark", async () => {
      answerWith([]);

      await expect(deleteCspReportsForTests([MARK_ONE])).resolves.toBe(0);
    });
  });

  describe("it is not repeated after a failure", () => {
    it("sends one statement and lets the failure leave", async () => {
      driver.replies.push(() =>
        Promise.reject(new Error("a lost reply, as far as the caller knows")),
      );
      answerWith([{ slot: 1 }]);

      await expect(deleteCspReportsForTests([MARK_ONE])).rejects.toThrow();
      expect(driver.statements).toHaveLength(1);
    });
  });
});
