import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteRateLimitCountersForTests } from "../src/delete-rate-limit-counters-for-tests.js";
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

const KEY_ONE = "a".repeat(64);
const KEY_TWO = "0123456789abcdef".repeat(4);

describe("deleteRateLimitCountersForTests", () => {
  beforeEach(() => {
    resetDriver();
    vi.stubEnv("DATABASE_URL", APPLICATION_URL);
    vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("the guard, asserted before any statement", () => {
    it("sends no statement when the test URL is the application database", async () => {
      vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

      await expect(deleteRateLimitCountersForTests([KEY_ONE])).rejects.toThrow(
        /Refusing to run live database tests/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("sends no statement for a database whose name is not on the test allowlist, whatever its host", async () => {
      vi.stubEnv(
        "TEST_DATABASE_URL",
        "postgresql://owner:secret@isolated.neon.tech/some_other_db",
      );

      await expect(deleteRateLimitCountersForTests([KEY_ONE])).rejects.toThrow(
        /not one of the databases this repository allows/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("sends no statement for the direct endpoint of the application's pooled database", async () => {
      vi.stubEnv(
        "DATABASE_URL",
        "postgresql://owner:secret@ep-cool-1234-pooler.eu-central-1.aws.neon.tech/lemn-conf-v2",
      );
      vi.stubEnv(
        "TEST_DATABASE_URL",
        "postgresql://owner:secret@ep-cool-1234.eu-central-1.aws.neon.tech/lemn-conf-v2",
      );

      await expect(deleteRateLimitCountersForTests([KEY_ONE])).rejects.toThrow(
        /Refusing to run live database tests/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("sends no statement outside a test runner", async () => {
      vi.stubEnv("VITEST", undefined);
      vi.stubEnv("TEST_WORKER_INDEX", undefined);
      vi.stubEnv("PLAYWRIGHT_TEST", undefined);

      await expect(deleteRateLimitCountersForTests([KEY_ONE])).rejects.toThrow(
        /outside a test runner/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("runs in Playwright's own runner, which sets PLAYWRIGHT_TEST and neither of the other markers", async () => {
      vi.stubEnv("VITEST", undefined);
      vi.stubEnv("TEST_WORKER_INDEX", undefined);
      vi.stubEnv("PLAYWRIGHT_TEST", "1");
      answerWith([{ hits: 2 }]);

      await expect(deleteRateLimitCountersForTests([KEY_ONE])).resolves.toEqual(
        { rowsRemoved: 1, counts: [2] },
      );
    });

    it("sends no statement under NODE_ENV=production even inside a test runner", async () => {
      vi.stubEnv("NODE_ENV", "production");

      await expect(deleteRateLimitCountersForTests([KEY_ONE])).rejects.toThrow(
        /NODE_ENV=production/,
      );
      expect(driver.statements).toEqual([]);
    });
  });

  describe("only the keys it is handed", () => {
    it.each([
      ["a wildcard", "%"],
      ["a prefix pattern", `${"a".repeat(10)}%`],
      ["an empty key", ""],
      ["a key of 63 characters", "a".repeat(63)],
      ["a key of 65 characters", "a".repeat(65)],
      ["uppercase hexadecimal", "A".repeat(64)],
      ["a non-hexadecimal character", `${"a".repeat(63)}g`],
      ["a key with a trailing line break", `${"a".repeat(64)}\n`],
    ])("refuses %s before it opens a connection", async (_label, key) => {
      await expect(
        deleteRateLimitCountersForTests([KEY_ONE, key]),
      ).rejects.toThrow(/64-character lowercase hex SHA-256 digest/);
      expect(driver.statements).toEqual([]);
    });

    it("refuses a list in place of a key, as it refuses any non-text", async () => {
      const notText = [KEY_ONE] as unknown as string;

      await expect(deleteRateLimitCountersForTests([notText])).rejects.toThrow(
        /64-character lowercase hex SHA-256 digest/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("sends one delete naming the table once, with the keys as its one bound value and no pattern", async () => {
      answerWith([{ hits: 3 }, { hits: 1 }]);

      await deleteRateLimitCountersForTests([KEY_ONE, KEY_TWO]);

      expect(driver.statements).toHaveLength(1);
      const [statement] = driver.statements;
      expect(statement?.values).toEqual([[KEY_ONE, KEY_TWO]]);
      expect(statement?.text).toMatch(
        /^\s*delete from rate_limit_counters where bucket_key = any\(\?\) returning hits\s*$/,
      );
      expect(statement?.text).not.toMatch(/\blike\b|\bwindow\b|truncate|drop/i);
    });

    it("sends no statement for an empty list and answers none removed", async () => {
      await expect(deleteRateLimitCountersForTests([])).resolves.toEqual({
        rowsRemoved: 0,
        counts: [],
      });
      expect(driver.statements).toEqual([]);
    });

    it("never sends a key it was not handed, over generated keys", async () => {
      const keys = Array.from({ length: 12 }, () =>
        randomBytes(32).toString("hex"),
      );
      answerWith([]);

      await deleteRateLimitCountersForTests(keys);

      expect(driver.statements[0]?.values).toEqual([keys]);
    });
  });

  describe("what it answers", () => {
    it("answers how many rows went and the count each held", async () => {
      answerWith([{ hits: 3 }, { hits: 7 }]);

      await expect(
        deleteRateLimitCountersForTests([KEY_ONE, KEY_TWO]),
      ).resolves.toEqual({ rowsRemoved: 2, counts: [3, 7] });
    });

    it("answers none removed when no row held a handed key", async () => {
      answerWith([]);

      await expect(deleteRateLimitCountersForTests([KEY_ONE])).resolves.toEqual(
        { rowsRemoved: 0, counts: [] },
      );
    });

    it.each([
      ["a text", "3"],
      ["a fraction", 1.5],
      ["zero", 0],
      ["nothing", undefined],
    ])("refuses a row whose count is %s", async (_label, hits) => {
      answerWith([{ hits }]);

      await expect(deleteRateLimitCountersForTests([KEY_ONE])).rejects.toThrow(
        /not a count/,
      );
    });
  });
});
