import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteContactSubmissionsForTests } from "../src/delete-contact-submissions-for-tests.js";
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

/** The columns that hold a person: no statement of this file's function may name one. */
const PERSONAL_COLUMNS =
  /\b(name|phone|phone_normal_form|locality|channel|email|design_document|priced|intent)\b/;

describe("deleteContactSubmissionsForTests", () => {
  beforeEach(() => {
    resetDriver();
    vi.stubEnv("DATABASE_URL", APPLICATION_URL);
    vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("the statement, pinned", () => {
    it("is one delete naming the table once, with the ids as its one bound array, in full", async () => {
      answerWith([]);

      await deleteContactSubmissionsForTests([ID_ONE, ID_TWO]);

      expect(driver.statements).toHaveLength(1);
      const [statement] = driver.statements;
      expect(statement?.values).toEqual([[ID_ONE, ID_TWO]]);
      expect(statement?.text.replace(/\s+/g, " ").trim()).toBe(
        "delete from contact_submissions where client_request_id = any(?) returning client_request_id",
      );
    });

    it("names no pattern, no other table and no personal column", async () => {
      answerWith([]);

      await deleteContactSubmissionsForTests([ID_ONE]);

      const text = driver.statements[0]?.text ?? "";
      expect(text).not.toMatch(
        /\blike\b|\bilike\b|~|truncate|drop|\bor\b|\bjoin\b|\bunion\b|;/i,
      );
      expect(text).not.toMatch(PERSONAL_COLUMNS);
      expect(text.match(/contact_submissions/g)).toHaveLength(1);
    });

    it("sends exactly the ids it was handed, over many ids of the shape", async () => {
      const ids = Array.from(
        { length: 40 },
        (_, index) => `contact-test-${String(index).padStart(10, "0")}`,
      );
      answerWith([]);

      await deleteContactSubmissionsForTests(ids);

      expect(driver.statements[0]?.values).toEqual([ids]);
    });

    it("sends an id of underscores and letters as a plain value of an equality, never a pattern", async () => {
      answerWith([]);

      await deleteContactSubmissionsForTests(["contact_test_0000000001"]);

      expect(driver.statements[0]?.values).toEqual([
        ["contact_test_0000000001"],
      ]);
      expect(driver.statements[0]?.text).not.toMatch(/\blike\b/i);
    });

    it("sends no statement for an empty list and answers none removed", async () => {
      await expect(deleteContactSubmissionsForTests([])).resolves.toBe(0);
      expect(driver.statements).toEqual([]);
    });
  });

  describe("a where that no longer names what it was handed is not sent anywhere", () => {
    it.each([
      ["a wildcard", "%"],
      ["a prefix pattern", "contact-test-%"],
      ["nothing", ""],
      ["fifteen characters", "a".repeat(15)],
      ["sixty-five characters", "a".repeat(65)],
      ["a space", "contact-test 0000000001"],
      ["a quote", "contact-test-0000000'01"],
      ["a semicolon", "contact-test-0000000;01"],
      ["a line break after a good id", `${ID_ONE}\n`],
      ["a dot", "contact.test.0000000001"],
      ["an address", "ana@example.com"],
    ])(
      "sends nothing when one id is %s, even beside good ones",
      async (_label, bad) => {
        await expect(
          deleteContactSubmissionsForTests([ID_ONE, bad, ID_TWO]),
        ).rejects.toThrow(/Refusing to delete contact requests/);
        expect(driver.statements).toEqual([]);
      },
    );

    it("holds none of the refused text in its refusal", async () => {
      await expect(
        deleteContactSubmissionsForTests(["ID-MARKER-%"]),
      ).rejects.not.toThrow(/MARKER/);
    });

    it("sends nothing for a value that is not text", async () => {
      await expect(
        deleteContactSubmissionsForTests([42 as unknown as string]),
      ).rejects.toThrow(/Refusing to delete contact requests/);
      expect(driver.statements).toEqual([]);
    });
  });

  describe("the guard, asserted before any statement", () => {
    it("sends no statement when the test URL is the application database", async () => {
      vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

      await expect(deleteContactSubmissionsForTests([ID_ONE])).rejects.toThrow(
        /Refusing to run live database tests/,
      );
      expect(driver.statements).toEqual([]);
    });

    it("sends no statement for a database whose name is not on the test allowlist", async () => {
      vi.stubEnv(
        "TEST_DATABASE_URL",
        "postgresql://owner:secret@isolated.neon.tech/some_other_db",
      );

      await expect(deleteContactSubmissionsForTests([ID_ONE])).rejects.toThrow(
        /not one of the databases this repository allows/,
      );
      expect(driver.statements).toEqual([]);
    });
  });

  describe("what it answers", () => {
    it("answers how many rows went", async () => {
      answerWith([
        { client_request_id: ID_ONE },
        { client_request_id: ID_TWO },
      ]);

      await expect(
        deleteContactSubmissionsForTests([ID_ONE, ID_TWO]),
      ).resolves.toBe(2);
    });

    it("answers none when no row held a handed id", async () => {
      answerWith([]);

      await expect(deleteContactSubmissionsForTests([ID_ONE])).resolves.toBe(0);
    });
  });
});
