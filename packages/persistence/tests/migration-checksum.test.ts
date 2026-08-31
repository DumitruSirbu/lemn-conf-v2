import { describe, expect, it } from "vitest";

import { checksumOfMigration } from "../src/migration-checksum.js";

const MIGRATION = "alter table designs add column if not exists note text;\n";

describe("checksumOfMigration", () => {
  it("is the same for a file checked out with CRLF line endings as with LF", () => {
    // `core.autocrlf` rewrites line endings on checkout. Hashing raw bytes would make every
    // migration mismatch on a Windows clone, blocking a deploy over a difference nobody made.
    const withCrlf = MIGRATION.replace(/\n/g, "\r\n");

    expect(checksumOfMigration(withCrlf)).toBe(checksumOfMigration(MIGRATION));
  });

  it("changes when the SQL changes", () => {
    const edited = MIGRATION.replace("note", "notes");

    expect(checksumOfMigration(edited)).not.toBe(
      checksumOfMigration(MIGRATION),
    );
  });

  it("changes when only a comment changes, because a comment is part of the file", () => {
    // Deliberate: the alternative needs a SQL parser, and every gap in that parser is somewhere a
    // real edit could hide. An applied migration is not meant to be edited at all.
    const commented = `-- why this column exists\n${MIGRATION}`;

    expect(checksumOfMigration(commented)).not.toBe(
      checksumOfMigration(MIGRATION),
    );
  });

  it("changes when indentation changes, so reformatting an applied migration is refused", () => {
    const reindented = MIGRATION.replace("alter", "  alter");

    expect(checksumOfMigration(reindented)).not.toBe(
      checksumOfMigration(MIGRATION),
    );
  });

  it("is a hex sha-256 digest, so a ledger row is fixed width and comparable as text", () => {
    expect(checksumOfMigration(MIGRATION)).toMatch(/^[0-9a-f]{64}$/);
  });
});
