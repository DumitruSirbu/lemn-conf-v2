import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MigrationExecutionError } from "../src/migration-errors.js";
import {
  SEED_VERSION_LABEL,
  SEED_VERSION_NOTE,
  describeSeedFailure,
  describeSeedResult,
  readOwnerAccountId,
  seedPriceBook,
} from "../src/seed-price-book.js";
import {
  answerWith,
  driver,
  resetDriver,
} from "./support/mocked-neon-driver.js";
import { spawnPersistenceCli } from "./support/spawn-persistence-cli.js";

vi.mock("nanoid", () => ({ nanoid: () => "000000000000000000001" }));

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The owner-run seed (A-10, S-b1), read with no database: the one statement it sends, what it makes of each reply, and
 * the command's wiring. That the seed refuses on a table that holds a version, and leaves it byte-identical, is shown on
 * the statement's text here and on a real table in `neon-price-book-store.live.test.ts`.
 */
const OWNER = "O".repeat(21);
const BOOK = { version: "sample", amountsProvisional: true };
const URL_FOR_THE_DRIVER =
  "postgres://owner:secret@db.example.invalid/lemn-conf-test";
const SOURCE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

const SEEDED_ROW = {
  seeded_id: "000000000000000000001",
  are_versions_present: false,
  is_owner_account: true,
};

function seed(overrides: Record<string, unknown> = {}) {
  return seedPriceBook({
    connectionUrl: URL_FOR_THE_DRIVER,
    readFrom: "MIGRATION_DATABASE_URL",
    ownerAccountId: OWNER,
    book: BOOK,
    ...overrides,
  });
}

function normalised(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

beforeEach(resetDriver);
afterEach(resetDriver);

describe("the seed statement", () => {
  it("is one statement that inserts version 1 only while no version exists and the owner's account does", async () => {
    answerWith([SEEDED_ROW]);

    const result = await seed();

    expect(result).toEqual({
      kind: "seeded",
      versionId: "000000000000000000001",
    });
    expect(driver.statements).toHaveLength(1);
    const text = normalised(driver.statements[0]?.text ?? "");
    expect(text).toContain(
      "insert into price_book_versions (id, sequence_number, label, note, book, change_summary, published_by_account_id)",
    );
    expect(text).toContain(
      "where not exists (select 1 from price_book_versions) and exists (select 1 from accounts where id = ?::text)",
    );
    expect(text).toContain(
      "select ?::text, 1, ?::text, ?::text, ?::jsonb, '[]'::jsonb, ?::text",
    );
  });

  it("records the owner's account id it was given as the publisher, and the book whole", async () => {
    answerWith([SEEDED_ROW]);

    await seed();

    expect(driver.statements[0]?.values).toEqual([
      "000000000000000000001",
      SEED_VERSION_LABEL,
      SEED_VERSION_NOTE,
      JSON.stringify(BOOK),
      OWNER,
      OWNER,
      OWNER,
    ]);
  });

  it("writes no staff audit row, no draft and no availability row, and updates and deletes nothing", async () => {
    answerWith([SEEDED_ROW]);

    await seed();

    const text = normalised(driver.statements[0]?.text ?? "");
    expect(text).not.toMatch(
      /staff_audit_events|price_book_draft|catalogue_availability|\bupdate\b|\bdelete\b|\btruncate\b|\bon conflict\b/,
    );
  });

  it("states no amount, percentage or 'inclus' in the text it publishes (ADR 0106 Amendment A)", () => {
    for (const text of [SEED_VERSION_LABEL, SEED_VERSION_NOTE]) {
      expect(text).not.toMatch(/%|inclus|\blei\b|\bmdl\b/i);
    }
  });
});

describe("what the seed makes of the reply", () => {
  it("refuses, writing nothing, when a version exists", async () => {
    answerWith([
      { seeded_id: null, are_versions_present: true, is_owner_account: true },
    ]);

    expect(await seed()).toEqual({ kind: "refused", reason: "versions-exist" });
  });

  it("refuses when the owner's account is unknown", async () => {
    answerWith([
      { seeded_id: null, are_versions_present: false, is_owner_account: false },
    ]);

    expect(await seed()).toEqual({
      kind: "refused",
      reason: "unknown-owner-account",
    });
  });

  it.each([[[]], [[SEEDED_ROW, SEEDED_ROW]], ["rows"]])(
    "does not take %j for its reply",
    async (reply) => {
      answerWith(reply);

      await expect(seed()).rejects.toBeInstanceOf(MigrationExecutionError);
    },
  );

  it.each([
    ["an owner id of the wrong length", { ownerAccountId: "short" }],
    ["an owner id outside the alphabet", { ownerAccountId: "!".repeat(21) }],
    ["a book that is an array", { book: [] }],
    ["no book", { book: undefined }],
  ])("sends nothing for %s", async (_name, overrides) => {
    await expect(seed(overrides)).rejects.toBeInstanceOf(
      MigrationExecutionError,
    );

    expect(driver.statements).toHaveLength(0);
  });
});

describe("what the command prints", () => {
  it("says what it did and where, and names the refusal", () => {
    expect(
      describeSeedResult({ kind: "seeded", versionId: "x" }, "preview"),
    ).toBe("[seed-price-book] published version 1 against preview.");
    expect(
      describeSeedResult(
        { kind: "refused", reason: "versions-exist" },
        "preview",
      ),
    ).toContain("already exists, so the seed wrote nothing");
  });

  it("prints a failure by its name and message when it is this package's own, and by its type when it is not", () => {
    expect(
      describeSeedFailure(new MigrationExecutionError("needs an id")),
    ).toBe("[seed-price-book] MigrationExecutionError: needs an id");
    const driverError = Object.assign(new Error("postgres://u:pw@h/db"), {
      name: "NeonDbError",
    });
    expect(describeSeedFailure(driverError)).toBe(
      "[seed-price-book] the seed failed with an unexpected NeonDbError.",
    );
  });

  it("needs the owner's account id as the second argument", () => {
    expect(readOwnerAccountId(["node", "seed", "preview", ` ${OWNER} `])).toBe(
      OWNER,
    );
    expect(() => readOwnerAccountId(["node", "seed", "preview"])).toThrow(
      MigrationExecutionError,
    );
    expect(() => readOwnerAccountId(["node", "seed", "preview", "  "])).toThrow(
      MigrationExecutionError,
    );
  });
});

describe("the command's wiring, as migrate.ts wires its own", () => {
  const MISMATCH_URL =
    "postgres://probe-user:probe-secret-7f3a@db.example.invalid/lemn-conf-v2";

  it("is a script of the package", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(SOURCE_DIR, "..", "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(manifest.scripts["seed-price-book"]).toBe(
      "tsx src/seed-price-book.ts",
    );
  });

  it("checks the declared environment against the database before it connects, by source order", () => {
    const source = readFileSync(
      resolve(SOURCE_DIR, "seed-price-book.ts"),
      "utf8",
    );
    const cli = source.slice(source.indexOf("if (isDirectCliInvocation)"));

    const checkIndex = cli.indexOf("assertDeclaredEnvironmentReaches(");
    expect(checkIndex).toBeGreaterThan(-1);
    expect(cli.indexOf("seedPriceBook(")).toBeGreaterThan(checkIndex);
    expect(cli).toContain("readMigrationDatabaseUrl()");
    expect(source).not.toContain('DATABASE_URL"]');
  });

  it.each([
    ["no environment at all", []],
    ["an environment and no owner", ["preview"]],
  ])("sends nothing for %s", async (_name, args) => {
    const result = await spawnPersistenceCli("src/seed-price-book.ts", args, {
      MIGRATION_DATABASE_URL: MISMATCH_URL,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/^\[seed-price-book\] /);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain("probe-secret-7f3a");
  });

  it("refuses an environment the database it would reach does not belong to, before it connects", async () => {
    const result = await spawnPersistenceCli(
      "src/seed-price-book.ts",
      ["preview", OWNER],
      { MIGRATION_DATABASE_URL: MISMATCH_URL },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MigrationTargetMismatchError");
    expect(result.stdout).toBe("");
    for (const secret of [
      "probe-user",
      "probe-secret-7f3a",
      "db.example.invalid",
    ]) {
      expect(result.stderr).not.toContain(secret);
    }
  });
});
