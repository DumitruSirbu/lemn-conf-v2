import type { MigrationFile } from "../../src/migration-files.js";

/**
 * One migration past the highest real one, synthesised **in memory only**.
 *
 * Nothing writes it to `migrations/` and nothing ever runs it, which is exactly what makes it a
 * discriminator: a database that is level by definition has not applied it, so a status check that
 * can only ever answer "level" fails against it. It is shared rather than copied because the check
 * and its adversarial suite have to be discriminating against the *same* synthesised file — two
 * copies drifting apart would weaken one of them silently.
 */
export function synthesisedNextMigrationFile(
  files: readonly MigrationFile[],
): MigrationFile {
  const version = highestVersionOf(files) + 1;
  return {
    version,
    fileName: `${String(version).padStart(4, "0")}_never_written.sql`,
    sql: "select 1",
    checksum: `synthesised-${String(version)}`,
  };
}

/** A `reduce` and not `Math.max(...versions)`: spread over an empty list that is `-Infinity`, and
 *  the caller would get version `-Infinity` inside a file name reading `NaN_never_written.sql`. */
function highestVersionOf(files: readonly MigrationFile[]): number {
  return files.reduce((highest, file) => Math.max(highest, file.version), 0);
}
