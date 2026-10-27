import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appendPriceVersionForTests } from "../src/append-price-version-for-tests.js";
import {
  answerWith,
  driver,
  resetDriver,
} from "./support/mocked-neon-driver.js";

vi.mock("nanoid", () => ({ nanoid: () => "000000000000000000001" }));

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The test-only appender (plan S2, recorded choice b), read with no database: the one statement it sends, what it makes of
 * the reply, and that it refuses what is not a book and a publisher before it connects. That it appends a version at the
 * next sequence number on a real table is shown in `neon-price-book-store.live.test.ts`.
 */
const APPLICATION_URL =
  "postgresql://owner:secret@host.neon.tech/neondb?sslmode=require";
const TEST_URL = "postgresql://owner:secret@host.neon.tech/lemnaria_test";
const PUBLISHER = "P".repeat(21);
const BOOK = { version: "a test book" };
const VERSION_ID = "000000000000000000001";

function normalised(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

beforeEach(() => {
  resetDriver();
  vi.stubEnv("DATABASE_URL", APPLICATION_URL);
  vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appendPriceVersionForTests", () => {
  it("sends one insert that appends at the sequence number after the newest, with the book whole and the publisher it was given", async () => {
    answerWith([{ id: VERSION_ID, sequence_number: "8" }]);

    const appended = await appendPriceVersionForTests(BOOK, PUBLISHER);

    expect(appended).toEqual({ versionId: VERSION_ID, sequenceNumber: 8 });
    expect(driver.statements).toHaveLength(1);
    const [statement] = driver.statements;
    expect(normalised(statement?.text ?? "")).toBe(
      "insert into price_book_versions (id, sequence_number, label, note, book, change_summary, published_by_account_id) " +
        "select ?::text, coalesce(max(sequence_number), 0) + 1, ?::text, ''::text, ?::jsonb, '[]'::jsonb, ?::text " +
        "from price_book_versions returning id, sequence_number::text as sequence_number",
    );
    expect(statement?.values).toEqual([
      VERSION_ID,
      "Test version",
      JSON.stringify({ ...BOOK, version: VERSION_ID }),
      PUBLISHER,
    ]);
  });

  it("stores the book with its version set to the new version's id, whatever version it carried (R1-Q2)", async () => {
    answerWith([{ id: VERSION_ID, sequence_number: "2" }]);
    const handed = { version: "something else", rate: 3 };

    await appendPriceVersionForTests(handed, PUBLISHER);

    expect(JSON.parse(String(driver.statements[0]?.values[2]))).toEqual({
      version: VERSION_ID,
      rate: 3,
    });
    expect(handed.version).toBe("something else");
  });

  it("names only the columns the grant of 0023 gives, and updates, deletes and replaces nothing", async () => {
    answerWith([{ id: VERSION_ID, sequence_number: "1" }]);

    await appendPriceVersionForTests(BOOK, PUBLISHER);

    const text = normalised(driver.statements[0]?.text ?? "");
    expect(text).not.toContain("published_at");
    expect(text).not.toMatch(
      /\bupdate\b|\bdelete\b|\btruncate\b|\bon conflict\b|\bdrop\b/,
    );
    expect(text.match(/price_book_versions/g)).toHaveLength(2);
  });

  it.each([
    ["a book that is an array", [], PUBLISHER],
    ["a book that is a string", "a book", PUBLISHER],
    ["no book", undefined, PUBLISHER],
    ["a publisher of the wrong length", BOOK, "short"],
    ["a publisher outside the alphabet", BOOK, "!".repeat(21)],
  ])("refuses %s before it connects", async (_name, book, publisher) => {
    await expect(appendPriceVersionForTests(book, publisher)).rejects.toThrow(
      /needs a book that is an object/,
    );

    expect(driver.statements).toHaveLength(0);
  });

  it.each([
    ["no row", []],
    ["a row for another version", [{ id: "other", sequence_number: "1" }]],
    [
      "a sequence number that is not a whole number",
      [{ id: VERSION_ID, sequence_number: "x" }],
    ],
  ])("does not take %s for an appended version", async (_name, reply) => {
    answerWith(reply);

    await expect(appendPriceVersionForTests(BOOK, PUBLISHER)).rejects.toThrow(
      /did not append one version/,
    );
  });

  it("refuses to run in production, and outside a test runner, and says its own name", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(appendPriceVersionForTests(BOOK, PUBLISHER)).rejects.toThrow(
      /appendPriceVersionForTests was called with NODE_ENV=production/,
    );

    vi.stubEnv("NODE_ENV", "test");
    for (const marker of ["VITEST", "TEST_WORKER_INDEX", "PLAYWRIGHT_TEST"]) {
      vi.stubEnv(marker, "");
    }
    await expect(appendPriceVersionForTests(BOOK, PUBLISHER)).rejects.toThrow(
      /appendPriceVersionForTests was called outside a test runner/,
    );

    expect(driver.statements).toHaveLength(0);
  });
});
