import { createHash } from "node:crypto";

const CHECKSUM_ALGORITHM = "sha256";

/**
 * The fingerprint the ledger stores for an applied migration, so a later run can tell that the file
 * it is about to trust is still the file that ran.
 *
 * **Exactly the file's bytes are hashed, after line endings are normalised to LF and nothing else.**
 * Both halves of that are deliberate:
 *
 * - Line endings are normalised because git itself can rewrite them on checkout (`core.autocrlf`),
 *   which would change every byte of every migration on a Windows clone and block a deploy over a
 *   difference no one made. That is the one transformation a checkout can apply on its own.
 * - Nothing else is normalised — not whitespace, not comments, not case. A rule cleverer than "the
 *   file changed" needs to understand SQL, and every gap in that understanding is a place a real
 *   edit can hide. The comments in these files are load-bearing (`0003` explains a security
 *   control), and an applied migration must not be edited at all, so a checksum that tolerates
 *   "harmless" edits is answering a question nobody should be asking.
 *
 * The consequence is worth stating plainly: reformatting an applied migration file breaks the next
 * migration run, on purpose. The fix is to revert the file, never to re-checksum the ledger.
 */
export function checksumOfMigration(migrationSql: string): string {
  return createHash(CHECKSUM_ALGORITHM)
    .update(withNormalisedLineEndings(migrationSql), "utf8")
    .digest("hex");
}

function withNormalisedLineEndings(migrationSql: string): string {
  return migrationSql.replace(/\r\n?/g, "\n");
}
