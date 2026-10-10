import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { countContactSubmissionsForTests } from "../src/count-contact-submissions-for-tests.js";
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

const ID_ONE = "contact-test-0000000001";
const ID_TWO = "contact-test-0000000002";

const PERSONAL_COLUMNS =
  /\b(name|phone|phone_normal_form|locality|channel|email|design_document|priced|intent|reference|payload_digest)\b/;

describe("countContactSubmissionsForTests", () => {
  beforeEach(() => {
    resetDriver();
    vi.stubEnv("DATABASE_URL", APPLICATION_URL);
    vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("the statement, pinned", () => {
    it("is one select of a count, naming the table once, with the ids as its one bound array, in full", async () => {
      answerWith([{ stored: 2 }]);

      await countContactSubmissionsForTests([ID_ONE, ID_TWO]);

      expect(driver.statements).toHaveLength(1);
      const [statement] = driver.statements;
      expect(statement?.values).toEqual([[ID_ONE, ID_TWO]]);
      expect(statement?.text.replace(/\s+/g, " ").trim()).toBe(
        "select count(*)::int as stored from contact_submissions where client_request_id = any(?)",
      );
    });

    it("selects no column, deletes nothing and names no personal column", async () => {
      answerWith([{ stored: 0 }]);

      await countContactSubmissionsForTests([ID_ONE]);

      const text = driver.statements[0]?.text ?? "";
      expect(text).not.toMatch(PERSONAL_COLUMNS);
      expect(text).not.toMatch(
        /\bdelete\b|\bupdate\b|\binsert\b|truncate|drop|\blike\b|;/i,
      );
      expect(text.match(/\bselect\b/gi)).toHaveLength(1);
      expect(text).toMatch(/select count\(\*\)/i);
    });

    it("sends no statement for an empty list and answers none", async () => {
      await expect(countContactSubmissionsForTests([])).resolves.toBe(0);
      expect(driver.statements).toEqual([]);
    });
  });

  describe("an id that is not of the request id's shape is not sent anywhere", () => {
    it.each([
      ["a wildcard", "%"],
      ["nothing", ""],
      ["fifteen characters", "a".repeat(15)],
      ["a space", "contact-test 0000000001"],
      ["a quote", "contact-test-0000000'01"],
      ["an address", "ana@example.com"],
    ])("sends nothing when one id is %s", async (_label, bad) => {
      await expect(
        countContactSubmissionsForTests([ID_ONE, bad]),
      ).rejects.toThrow(/Refusing to count contact requests/);
      expect(driver.statements).toEqual([]);
    });
  });

  describe("the guard, asserted before any statement", () => {
    it("sends no statement when the test URL is the application database", async () => {
      vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

      await expect(countContactSubmissionsForTests([ID_ONE])).rejects.toThrow(
        /Refusing to run live database tests/,
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
          countContactSubmissionsForTests([ID_ONE, ID_TWO]),
        ).resolves.toBe(stored);
      },
    );

    it.each([
      ["a text", [{ stored: "2" }]],
      ["a fraction", [{ stored: 1.5 }]],
      ["a negative", [{ stored: -1 }]],
      ["no row", []],
      ["two rows", [{ stored: 1 }, { stored: 1 }]],
    ])("refuses an answer of %s", async (_label, rows) => {
      answerWith(rows);

      await expect(countContactSubmissionsForTests([ID_ONE])).rejects.toThrow(
        /not a count/,
      );
    });
  });
});
