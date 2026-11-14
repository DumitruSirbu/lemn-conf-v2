import { readFileSync } from "node:fs";

import {
  DESIGN_THUMBNAIL_TYPES,
  MAX_DESIGN_THUMBNAIL_BYTES,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { checksumOfMigration } from "../src/migration-checksum.js";
import { readMigrationFiles } from "../src/migration-files.js";
import {
  executableStatementsOf,
  unattendedMigrationRefusals,
} from "../src/migration-safety.js";

/**
 * Migration `0030` (the card thumbnails), read as text with no database. What this file can show: it follows `0029` with no
 * gap, it is additive and re-runnable, it carries the columns, checks and cascade ADR 0181 d3 specifies, its checks agree
 * with the domain's figures and closed list, and the grants its header and the runbook prescribe are the same, exact ones,
 * with `DELETE` and no `UPDATE` of the key. What it cannot show is what a database does with the checks (the live file's
 * table-refusal tests) or what the application role is granted (the privilege test, which reads the catalog).
 */
const migrations = readMigrationFiles();
const THUMBNAILS = (() => {
  const found = migrations.find((migration) =>
    migration.fileName.startsWith("0030_"),
  );
  if (found === undefined) throw new Error("no migration starts with 0030_");
  return found;
})();

const statements = executableStatementsOf(THUMBNAILS.sql).join("\n");

/** The header's comment text on one line, so a sentence the file wraps can be asked for whole. */
const header = THUMBNAILS.sql
  .split("\n")
  .filter((line) => line.startsWith("--"))
  .map((line) => line.replace(/^--\s?/, ""))
  .join(" ")
  .replace(/\s+/g, " ");

const headerGrants = THUMBNAILS.sql
  .split("\n")
  .filter((line) => /^--\s+GRANT /.test(line))
  .map((line) => line.replace(/^--\s+/, "").trim());

describe("migration 0030 is the next version of the ledger", () => {
  it("follows 0029 without a gap, under the name of what it creates", () => {
    expect(THUMBNAILS.version).toBe(30);
    expect(
      migrations.map((migration) => migration.version).slice(28, 30),
    ).toEqual([29, 30]);
    expect(THUMBNAILS.fileName).toBe("0030_create_design_thumbnails.sql");
  });

  it("records a checksum of its own bytes, and changes it when one byte of a comment changes", () => {
    expect(THUMBNAILS.checksum).toBe(checksumOfMigration(THUMBNAILS.sql));
    expect(checksumOfMigration(`${THUMBNAILS.sql} `)).not.toBe(
      THUMBNAILS.checksum,
    );
  });

  it("says which ledger readings it expects, one version apart, and that its bytes are frozen once applied", () => {
    expect(header).toContain("ledger reads 1-29 before running, and 1-30");
    expect(header).toContain(
      "Once this file has been applied anywhere, its bytes are frozen, comments included.",
    );
  });

  it("says the order against the code, and that without the table or the grant every client delete fails", () => {
    expect(header).toContain(
      "APPLY THIS, THEN THE GRANTS, BEFORE THE CODE THAT NAMES THIS TABLE RUNS.",
    );
    expect(header).toContain("every client delete fails");
  });
});

describe("0030 is additive and re-runnable, so the pipeline may apply it unattended", () => {
  it("clears the unattended screen", () => {
    expect(unattendedMigrationRefusals([THUMBNAILS])).toEqual([]);
  });

  it("is one create table, with no grant, drop, truncate, update, alter or index in its statements", () => {
    expect(executableStatementsOf(THUMBNAILS.sql)).toHaveLength(1);
    expect(statements).toMatch(
      /^create table if not exists design_thumbnails\b/,
    );
    expect(statements).not.toMatch(
      /\b(?:grant|revoke|drop|truncate|update|alter|trigger|sequence|serial|index)\b/,
    );
  });
});

describe("0030 creates design_thumbnails, one picture per design", () => {
  it("holds the five columns of ADR 0181 d3, in order, with the instant defaulted by the database", () => {
    let from = 0;
    for (const column of [
      "design_id text primary key",
      "revision bigint not null",
      "image bytea not null",
      "image_type text not null",
      "captured_at timestamptz not null default now()",
    ]) {
      const at = statements.indexOf(column, from);
      expect(at, `column "${column}"`).toBeGreaterThanOrEqual(from);
      from = at + column.length;
    }
    expect(statements.match(/\bdefault\b/g)).toHaveLength(1);
  });

  it("references designs and cascades, so whatever hard-deletes a design takes its picture", () => {
    expect(statements).toContain(
      "constraint design_thumbnails_design_id_fkey references designs (id) on delete cascade",
    );
  });

  it("accepts a revision from 1 and refuses a negative one and 0, which no design has", () => {
    expect(statements).toContain(
      "constraint design_thumbnails_revision_is_positive check (revision >= 1)",
    );
  });

  it("backstops the image at twice the domain's cap, never below it", () => {
    const backstop = Number(
      /octet_length\(image\) between 1 and (\d+)/.exec(statements)?.[1],
    );

    expect(backstop).toBe(2 * MAX_DESIGN_THUMBNAIL_BYTES);
    expect(statements).toContain(
      "constraint design_thumbnails_image_size check (octet_length(image) between 1 and 262144)",
    );
  });

  it("lists the same image types as the domain, in the same order, and no other", () => {
    const listed = /image_type in \(([^)]*)\)/.exec(statements)?.[1] ?? "";

    expect(
      listed.split(",").map((type) => type.trim().replaceAll("'", "")),
    ).toEqual([...DESIGN_THUMBNAIL_TYPES]);
    expect(statements).toContain(
      "constraint design_thumbnails_image_type_is_known check (image_type in (",
    );
  });

  it("keeps every constraint name within the 63 bytes Postgres keeps", () => {
    const names = [...statements.matchAll(/constraint (\w+)/g)].map(
      (match) => match[1] ?? "",
    );

    expect(names).toHaveLength(4);
    for (const name of names) expect(name.length, name).toBeLessThanOrEqual(63);
  });

  it("says plainly that thumbnails are not in the nightly export", () => {
    expect(header).toContain("Thumbnails are not in the nightly export");
  });
});

describe("the grants 0030's header prescribes", () => {
  it("are select, insert and delete, and update of the four columns that leave out the key", () => {
    expect(headerGrants).toEqual([
      "GRANT SELECT, INSERT, DELETE ON TABLE public.design_thumbnails TO app_designs;",
      "GRANT UPDATE (revision, image, image_type, captured_at) ON TABLE public.design_thumbnails TO app_designs;",
    ]);
    expect(THUMBNAILS.sql).not.toMatch(/^\s*grant\b/im);
  });

  it("say what is withheld: no truncate, no all, no grant option, nothing to PUBLIC, no update of the key", () => {
    expect(header).toContain(
      "No TRUNCATE, no ALL, no WITH GRANT OPTION, nothing to PUBLIC, and no UPDATE of `design_id`",
    );
    expect(headerGrants.join(" ")).not.toMatch(
      /\b(?:TRUNCATE|ALL|REFERENCES|TRIGGER)\b|GRANT OPTION|PUBLIC|\bdesign_id\b/,
    );
  });

  it("grant nothing on designs, which the application role already reads and updates", () => {
    expect(headerGrants.join(" ")).not.toMatch(/public\.designs/);
    expect(header).toContain("nothing is granted on it here");
  });
});

describe("the owner's runbook for 0030", () => {
  const RUNBOOK = readFileSync(
    new URL(
      "../../../docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md",
      import.meta.url,
    ),
    "utf8",
  );
  const SECTION_OPENING = "## For `0030_create_design_thumbnails.sql`";

  function section(): string {
    const start = RUNBOOK.indexOf(SECTION_OPENING);
    expect(start, "the runbook has a section for 0030").toBeGreaterThan(-1);
    const end = RUNBOOK.indexOf("\n## ", start + 1);
    return RUNBOOK.slice(start, end === -1 ? undefined : end);
  }

  function grantFencesOf(text: string): string[][] {
    return [...text.matchAll(/```sql\n([\s\S]*?)```/g)]
      .map(([, body]) =>
        (body ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== ""),
      )
      .filter((lines) => lines.some((line) => line.startsWith("GRANT ")));
  }

  it("prescribes the grants of the migration's header, word for word, in the same order, and nothing else", () => {
    expect(headerGrants).toHaveLength(2);
    expect(grantFencesOf(section())).toEqual([headerGrants]);
  });

  it("grants no more than the two statements, in any form", () => {
    const [grants] = grantFencesOf(section());

    expect(grants?.join("\n")).not.toMatch(
      /\b(?:TRUNCATE|REFERENCES|TRIGGER|ALL\s+PRIVILEGES|WITH\s+GRANT\s+OPTION)\b|\bTO\s+PUBLIC\b|\bGRANT\s+ALL\b|\bUPDATE\s*\([^)]*\bdesign_id\b/i,
    );
    expect(grants?.every((line) => line.endsWith("TO app_designs;"))).toBe(
      true,
    );
  });

  it("states the ledger reading, the order against the existing delete route, and the dated rollout on both databases", () => {
    const text = section().replace(/\s+/g, " ");

    expect(text).toContain("The ledger reads **30** (1 to 29 before)");
    expect(text).toContain("every client delete of a kitchen fails");
    expect(text).toContain(
      "Executed on preview and on production on 2026-11-14",
    );
    expect(text).toContain(
      'reached database "lemn-conf-v2-preview" as role "app_designs"',
    );
    expect(text).toContain(
      'reached database "lemn-conf-v2" as role "app_designs"',
    );
  });
});
