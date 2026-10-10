import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findWriteTokenHashesForTests } from "../src/find-write-token-hashes-for-tests.js";
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

const ID_ONE = "design-one-0000000000";
const ID_TWO = "design-two-0000000000";
const HASH_ONE = "a".repeat(64);
const HASH_TWO = "0123456789abcdef".repeat(4);

describe("findWriteTokenHashesForTests", () => {
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

      await expect(findWriteTokenHashesForTests([ID_ONE])).rejects.toThrow(
        /Refusing to run live database tests/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("sends no statement for a database whose name is not on the test allowlist", async () => {
      vi.stubEnv(
        "TEST_DATABASE_URL",
        "postgresql://owner:secret@isolated.neon.tech/some_other_db",
      );

      await expect(findWriteTokenHashesForTests([ID_ONE])).rejects.toThrow(
        /not one of the databases this repository allows/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("sends no statement outside a test runner", async () => {
      vi.stubEnv("VITEST", undefined);
      vi.stubEnv("TEST_WORKER_INDEX", undefined);
      vi.stubEnv("PLAYWRIGHT_TEST", undefined);

      await expect(findWriteTokenHashesForTests([ID_ONE])).rejects.toThrow(
        /outside a test runner/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("runs in Playwright's own runner, which sets PLAYWRIGHT_TEST and neither of the other markers", async () => {
      vi.stubEnv("VITEST", undefined);
      vi.stubEnv("TEST_WORKER_INDEX", undefined);
      vi.stubEnv("PLAYWRIGHT_TEST", "1");
      answerWith([{ write_token_hash: HASH_ONE }]);

      await expect(findWriteTokenHashesForTests([ID_ONE])).resolves.toEqual([
        HASH_ONE,
      ]);
    });

    it("sends no statement under NODE_ENV=production even inside a test runner", async () => {
      vi.stubEnv("NODE_ENV", "production");

      await expect(findWriteTokenHashesForTests([ID_ONE])).rejects.toThrow(
        /NODE_ENV=production/,
      );
      expect(driver.statements).toEqual([]);
    });
  });

  describe("what it reads", () => {
    it("sends one read, pinned in full, with the ids as its one bound value", async () => {
      answerWith([
        { write_token_hash: HASH_ONE },
        { write_token_hash: HASH_TWO },
      ]);

      await findWriteTokenHashesForTests([ID_ONE, ID_TWO]);

      expect(driver.statements).toHaveLength(1);
      const [statement] = driver.statements;
      expect(statement?.values).toEqual([[ID_ONE, ID_TWO]]);
      expect(statement?.text.replace(/\s+/g, " ").trim()).toBe(
        "select write_token_hash from designs where id = any(?) and write_token_hash is not null",
      );
    });

    it("only reads: its statement names no write, no lock and no other table", async () => {
      answerWith([]);

      await findWriteTokenHashesForTests([ID_ONE]);

      const text = driver.statements[0]?.text ?? "";
      expect(text).not.toMatch(
        /\b(insert|update|delete|truncate|alter|drop|for update|returning)\b/i,
      );
      expect(text).not.toMatch(/rate_limit|contact_submissions|share/i);
    });

    it("answers the hashes the database answered, and nothing for an empty list, which sends nothing", async () => {
      answerWith([
        { write_token_hash: HASH_ONE },
        { write_token_hash: HASH_TWO },
      ]);

      expect(await findWriteTokenHashesForTests([ID_ONE, ID_TWO])).toEqual([
        HASH_ONE,
        HASH_TWO,
      ]);
      resetDriver();
      expect(await findWriteTokenHashesForTests([])).toEqual([]);
      expect(driver.statements).toEqual([]);
    });

    it("answers none for an id with no design", async () => {
      answerWith([]);

      expect(await findWriteTokenHashesForTests([ID_ONE])).toEqual([]);
    });

    it.each([
      ["text that is not a digest", "design-token"],
      ["an uppercase digest", "A".repeat(64)],
      ["a digest one character short", "a".repeat(63)],
      ["a number", 7],
    ])(
      "refuses a stored value that is %s, naming none of it",
      async (_label, stored) => {
        answerWith([{ write_token_hash: stored }]);

        const failure = await findWriteTokenHashesForTests([ID_ONE]).catch(
          (error: unknown) => error as Error,
        );

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toMatch(
          /64-character lowercase hex SHA-256 digest/,
        );
        expect((failure as Error).message).not.toContain(String(stored));
      },
    );
  });
});
