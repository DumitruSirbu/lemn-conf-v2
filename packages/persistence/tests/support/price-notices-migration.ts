import { readMigrationFiles } from "../../src/migration-files.js";

/** Migration `0028`, found by its version's prefix so a rename of the file does not hide it. */
export const PRICE_NOTICES_MIGRATION = (() => {
  const found = readMigrationFiles().find((migration) =>
    migration.fileName.startsWith("0028_"),
  );
  if (found === undefined) throw new Error("no migration starts with 0028_");
  return found;
})();

const SQL_WITHOUT_COMMENTS = PRICE_NOTICES_MIGRATION.sql
  .split("\n")
  .filter((line) => !line.startsWith("--"))
  .join("\n");

/**
 * The JavaScript regular expression that reads like the one named check's Postgres pattern. The patterns used here use
 * no feature on which Postgres and JavaScript differ.
 */
export function priceNoticesCheckPattern(constraintName: string): RegExp {
  const match = new RegExp(
    `constraint ${constraintName} check \\(\\w+ ~ '([^']+)'\\)`,
  ).exec(SQL_WITHOUT_COMMENTS);
  if (match?.[1] === undefined)
    throw new Error(`no pattern check named ${constraintName}`);
  return new RegExp(match[1]);
}
