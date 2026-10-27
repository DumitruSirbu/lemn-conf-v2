import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { nanoid } from "nanoid";

import { isJsonObject, isMintedId } from "./dashboard-store-shapes.js";
import { loadEnvLocal } from "./load-env.js";
import {
  MigrationExecutionError,
  describeErrorType,
  isPrintableFailure,
} from "./migration-errors.js";
import {
  assertDeclaredEnvironmentReaches,
  printReachedDatabaseName,
  readDeclaredEnvironment,
} from "./migration-target.js";
import { isRecord } from "./neon-row-guards.js";
import type { Row } from "./neon-row-guards.js";
import { databaseNameOf, openDatabase } from "./open-database.js";
import type { ConnectionVariableName } from "./open-database.js";
import { seedPriceBookStatement } from "./price-book-statements.js";
import { readMigrationDatabaseUrl } from "./read-database-url.js";

/** Authored text of the first version: a number and no note, so the seed puts no wording of the shop's own in the history. */
export const SEED_VERSION_LABEL = "Versiunea 1";
export const SEED_VERSION_NOTE = "";

export interface SeedPriceBookRequest {
  readonly connectionUrl: string;
  readonly readFrom?: ConnectionVariableName;
  /** The owner's account, recorded as the version's publisher. It must exist. */
  readonly ownerAccountId: string;
  /** The book to publish as version 1, stored whole. */
  readonly book: unknown;
}

export type SeedPriceBookResult =
  | { readonly kind: "seeded"; readonly versionId: string }
  | { readonly kind: "refused"; readonly reason: SeedRefusal };

export type SeedRefusal = "versions-exist" | "unknown-owner-account";

/**
 * Publishes the first version (A-10). Owner-run, on the owner's credential (`MIGRATION_DATABASE_URL`), and no part of the
 * application: it **refuses when any version exists**, so it can never replace a book, and leaves the table as it found
 * it. It records the owner's account id as the publisher and writes no staff audit row (A-22: the owner-run seed is one
 * of the writes with no staff actor).
 */
export async function seedPriceBook(
  request: SeedPriceBookRequest,
): Promise<SeedPriceBookResult> {
  const { connectionUrl, readFrom, ownerAccountId, book } = request;
  if (!isMintedId(ownerAccountId) || !isJsonObject(book)) {
    throw new MigrationExecutionError(
      "The seed needs the owner's account id (21 characters of A-Z, a-z, 0-9, _ and -) and a book that is an object.",
    );
  }
  const versionId = nanoid();
  const sql = openDatabase(connectionUrl, readFrom);
  const reply = await seedPriceBookStatement(sql, {
    versionId,
    label: SEED_VERSION_LABEL,
    note: SEED_VERSION_NOTE,
    bookJson: JSON.stringify(book),
    ownerAccountId,
  });
  const row = onlyRowOf(reply);
  if (row["seeded_id"] === versionId) return { kind: "seeded", versionId };
  return {
    kind: "refused",
    reason:
      row["are_versions_present"] === true
        ? "versions-exist"
        : "unknown-owner-account",
  };
}

/** The statement answers exactly one row; anything else is not its reply, and the seed says so without quoting it. */
function onlyRowOf(reply: unknown): Row {
  const [row, ...others] = Array.isArray(reply) ? (reply as unknown[]) : [];
  if (!isRecord(row) || others.length > 0) {
    throw new MigrationExecutionError(
      "The seed statement did not answer with the one row it is written to give, so nothing is known of what it wrote.",
    );
  }
  return { ...row };
}

const REFUSAL_TEXT: Readonly<Record<SeedRefusal, string>> = {
  "versions-exist":
    "a price book version already exists, so the seed wrote nothing. It never replaces a book.",
  "unknown-owner-account":
    "no account has the id given as the owner's, so the seed wrote nothing.",
};

/** The one operator-facing line a seed run prints: what happened and against which database, never the connection. */
export function describeSeedResult(
  result: SeedPriceBookResult,
  databaseName: string,
): string {
  return result.kind === "seeded"
    ? `[seed-price-book] published version 1 against ${databaseName}.`
    : `[seed-price-book] refused against ${databaseName}: ${REFUSAL_TEXT[result.reason]}`;
}

/** The one line a failed run prints. Never the error object or its `cause`: a driver error's properties are where a
 *  connection string hides. */
export function describeSeedFailure(error: unknown): string {
  return isPrintableFailure(error)
    ? `[seed-price-book] ${error.name}: ${error.message}`
    : `[seed-price-book] the seed failed with an unexpected ${describeErrorType(error)}.`;
}

/** The owner's account id, the command's second argument. Required: a seed with no stated publisher is not run. */
export function readOwnerAccountId(argv: readonly string[]): string {
  const given = argv[3]?.trim();
  if (given === undefined || given === "") {
    throw new MigrationExecutionError(
      "seed-price-book needs the owner's account id after the environment. Usage: pnpm --filter " +
        "@lemnaria/persistence run seed-price-book <environment> <owner-account-id>.",
    );
  }
  return given;
}

// Compared as filesystem paths, as `migrate.ts` does: `import.meta.url` percent-encodes a space and `process.argv[1]`
// does not (ADR 0013).
const invokedPath = process.argv[1];
const isDirectCliInvocation =
  invokedPath !== undefined &&
  resolve(fileURLToPath(import.meta.url)) === resolve(invokedPath);

if (isDirectCliInvocation) {
  loadEnvLocal();
  try {
    const environment = readDeclaredEnvironment(
      process.argv,
      "seed-price-book",
    );
    const ownerAccountId = readOwnerAccountId(process.argv);
    const connectionUrl = readMigrationDatabaseUrl();
    const databaseName = databaseNameOf(connectionUrl);
    assertDeclaredEnvironmentReaches({ environment, databaseName });

    const result = await seedPriceBook({
      connectionUrl,
      readFrom: "MIGRATION_DATABASE_URL",
      ownerAccountId,
      book: SAMPLE_PRICE_BOOK,
    });
    console.log(
      describeSeedResult(
        result,
        printReachedDatabaseName({ databaseName, environment }),
      ),
    );
    if (result.kind === "refused") process.exitCode = 1;
  } catch (error) {
    // Only the error's own name and message reach the operator, as `migrate.ts` prints them: a driver error's properties
    // are where a connection string hides.
    console.error(describeSeedFailure(error));
    process.exitCode = 1;
  }
}
