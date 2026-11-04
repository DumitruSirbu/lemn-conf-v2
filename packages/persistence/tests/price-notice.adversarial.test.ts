import { readFileSync } from "node:fs";

import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isMintedId, isRevisionShape } from "../src/dashboard-store-shapes.js";
import { readMigrationFiles } from "../src/migration-files.js";
import { executableStatementsOf } from "../src/migration-safety.js";
import type { StatementTag } from "../src/preset-statements.js";
import {
  readAcknowledgedStatement,
  recordAcknowledgedStatement,
  recordIfAbsentStatement,
} from "../src/price-notice-statements.js";
import { isActionableDesignId } from "../src/staff-kitchen-actions-store.js";

/**
 * What the price-notice marker's three layers must agree on, asked from outside the layer that states each rule: the
 * statements it sends, the shape rules the stores apply before a statement against the checks `0028` puts on the table,
 * the migration's defaults and grants, and the runbook's grant block against the migration's header. It needs no
 * database.
 */
const DESIGN_ID = "D".repeat(21);
const VERSION_ID = "V".repeat(21);
const WIDEST_BIGINT = 9223372036854775807n;
const ID_ALPHABET = ["A", "Z", "a", "z", "0", "9", "_", "-"];
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const textOfStatement: StatementTag<string> = (strings) => strings.join("?");

function normalised(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

const noticeStatements: readonly (readonly [string, string])[] = [
  [
    "the read",
    normalised(readAcknowledgedStatement(textOfStatement, DESIGN_ID)),
  ],
  [
    "the first open",
    normalised(
      recordIfAbsentStatement(textOfStatement, {
        designId: DESIGN_ID,
        versionId: VERSION_ID,
        availabilityRevision: "7",
      }),
    ),
  ],
  [
    "the acknowledgement",
    normalised(
      recordAcknowledgedStatement(textOfStatement, {
        designId: DESIGN_ID,
        versionId: VERSION_ID,
        availabilityRevision: "7",
      }),
    ),
  ],
];

describe.each(noticeStatements)("%s", (_name, text) => {
  it("never names the designs table, so it cannot move a design's revision", () => {
    expect(text).not.toMatch(/\bdesigns\b/);
    expect(text).not.toContain("revision = revision");
  });

  it("never names the audit log, a contact submission or the draft", () => {
    expect(text).not.toMatch(
      /staff_audit_events|contact_submissions|price_book_draft|design_staff_seen/,
    );
  });

  it("carries none of its input as text: every value is a bound parameter", () => {
    expect(text).not.toContain(DESIGN_ID.toLowerCase());
    expect(text).not.toContain(VERSION_ID.toLowerCase());
  });
});

describe("the writes touch only the marker's own table", () => {
  it("writes to design_price_notices and to nothing else", () => {
    for (const [, text] of noticeStatements.slice(1)) {
      const targets = [
        ...text.matchAll(
          /(?<!do )\b(?:insert into|update|delete from)\s+(\w+)/g,
        ),
      ].map((match) => match[1]);
      expect(new Set(targets)).toEqual(new Set(["design_price_notices"]));
    }
  });
});

describe("the shape rules the stores apply are exactly the checks the table holds", () => {
  const notices = readMigrationFiles().find((migration) =>
    migration.fileName.startsWith("0028_"),
  );
  if (notices === undefined) throw new Error("no migration starts with 0028_");
  const sqlWithoutComments = notices.sql
    .split("\n")
    .filter((line) => !line.startsWith("--"))
    .join("\n");

  function checkPattern(constraintName: string): RegExp {
    const found = new RegExp(
      `constraint ${constraintName} check \\(\\w+ ~ '([^']+)'\\)`,
    ).exec(sqlWithoutComments);
    if (found?.[1] === undefined) throw new Error(`no ${constraintName}`);
    return new RegExp(found[1]);
  }

  const NEAR_ID_CHARACTERS = [
    ...ID_ALPHABET,
    "\n",
    " ",
    ".",
    "/",
    "é",
    "١",
    "\u0000",
  ];
  const nearAnId = fc
    .array(fc.constantFrom(...NEAR_ID_CHARACTERS), {
      minLength: 19,
      maxLength: 23,
    })
    .map((characters) => characters.join(""));
  const nearAnIdMostlyValid = fc
    .tuple(
      fc.array(fc.constantFrom(...ID_ALPHABET), {
        minLength: 18,
        maxLength: 22,
      }),
      fc.constantFrom(...NEAR_ID_CHARACTERS),
      fc.nat({ max: 22 }),
    )
    .map(([base, odd, at]) => {
      const copy = [...base];
      copy.splice(Math.min(at, copy.length), 0, odd);
      return copy.join("");
    });

  it("accepts a design id exactly when design_price_notices_design_id_shape does", () => {
    const tableAccepts = checkPattern("design_price_notices_design_id_shape");

    fc.assert(
      fc.property(
        fc.oneof(nearAnId, nearAnIdMostlyValid, fc.string()),
        (candidate) => {
          expect(isActionableDesignId(candidate)).toBe(
            tableAccepts.test(candidate),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it("accepts a version id exactly when design_price_notices_acknowledged_version_id_shape does", () => {
    const tableAccepts = checkPattern(
      "design_price_notices_acknowledged_version_id_shape",
    );

    fc.assert(
      fc.property(
        fc.oneof(nearAnId, nearAnIdMostlyValid, fc.string()),
        (candidate) => {
          expect(isMintedId(candidate)).toBe(tableAccepts.test(candidate));
        },
      ),
      { numRuns: 500 },
    );
  });

  it("accepts a revision exactly when it is a canonical non-negative integer a bigint holds", () => {
    const oracle = (candidate: string): boolean =>
      /^(0|[1-9][0-9]*)$/.test(candidate) && BigInt(candidate) <= WIDEST_BIGINT;
    const digits = fc
      .array(fc.constantFrom(...DIGITS, "-", "+", " ", "e", ".", "\n"), {
        maxLength: 21,
      })
      .map((characters) => characters.join(""));
    const aroundTheCeiling = fc
      .bigInt({ min: WIDEST_BIGINT - 3n, max: WIDEST_BIGINT + 3n })
      .map(String);

    fc.assert(
      fc.property(
        fc.oneof(digits, aroundTheCeiling, fc.bigInt({ min: 0n }).map(String)),
        (candidate) => {
          expect(isRevisionShape(candidate)).toBe(oracle(candidate));
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe("migration 0028's defaults and grants", () => {
  const notices = readMigrationFiles().find((migration) =>
    migration.fileName.startsWith("0028_"),
  );
  if (notices === undefined) throw new Error("no migration starts with 0028_");
  const statements = executableStatementsOf(notices.sql).join("\n");
  const header = notices.sql
    .split("\n")
    .filter((line) => line.startsWith("--"))
    .map((line) => line.replace(/^--\s?/, ""))
    .join(" ")
    .replace(/\s+/g, " ");
  const grants = [
    ...header.matchAll(
      /GRANT (SELECT|INSERT|UPDATE)\b([^;]*?) TO app_designs;/g,
    ),
  ].map((match) => ({
    privilege: match[1],
    columns: [...(/\(([^)]*)\)/.exec(match[2] ?? "")?.[1] ?? "").split(",")]
      .map((column) => column.trim())
      .filter((column) => column !== ""),
  }));
  const columnsGranted = (privilege: string): string[] =>
    grants.find((grant) => grant.privilege === privilege)?.columns ?? [];

  it("gives the database exactly one default, the instant's, and the version and the revision none", () => {
    expect(statements.match(/\bdefault\b/g)).toHaveLength(1);
    expect(statements).toMatch(
      /acknowledged_at timestamptz not null default now\(\)/,
    );
  });

  it("holds no column of a kind a plain insert could leave to chance: every column but the instant is not null", () => {
    expect(statements).toMatch(/acknowledged_version_id text not null/);
    expect(statements).toMatch(
      /acknowledged_availability_revision bigint not null/,
    );
    expect(statements.match(/\bnot null\b/g)).toHaveLength(3);
  });

  it("keeps every instant column out of the insert grant and the key out of the update grant", () => {
    const instants = [...statements.matchAll(/\b(\w+_at)\b/g)].map(
      (match) => match[1] ?? "",
    );

    expect(instants).toEqual(["acknowledged_at"]);
    for (const instant of instants) {
      expect(columnsGranted("INSERT")).not.toContain(instant);
    }
    expect(columnsGranted("UPDATE")).not.toContain("design_id");
    expect(columnsGranted("INSERT")).toEqual([
      "design_id",
      "acknowledged_version_id",
      "acknowledged_availability_revision",
    ]);
  });

  it("grants select without a column list, so the whole row reads", () => {
    expect(grants.map((grant) => grant.privilege)).toEqual([
      "SELECT",
      "INSERT",
      "UPDATE",
    ]);
    expect(columnsGranted("SELECT")).toEqual([]);
  });
});

describe("the owner's runbook", () => {
  const runbook = readFileSync(
    new URL(
      "../../../docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md",
      import.meta.url,
    ),
    "utf8",
  );
  const notices = readMigrationFiles().find((migration) =>
    migration.fileName.startsWith("0028_"),
  );
  if (notices === undefined) throw new Error("no migration starts with 0028_");

  function grantLinesOf(text: string, from: number): string[] {
    const fenceOpen = text.indexOf("```sql", from);
    const fenceClose = text.indexOf("```", fenceOpen + 6);
    return text
      .slice(fenceOpen + 6, fenceClose)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
  }

  it("prescribes the three grants of 0028's header, word for word and in the same order", () => {
    const headerGrants = notices.sql
      .split("\n")
      .filter((line) => /^--\s+GRANT /.test(line))
      .map((line) => line.replace(/^--\s+/, "").trim());
    const section = runbook.indexOf("`0028_create_design_price_notices`");
    expect(section).toBeGreaterThan(-1);

    expect(headerGrants).toHaveLength(3);
    expect(grantLinesOf(runbook, section)).toEqual(headerGrants);
  });

  it("does not hand the application role a delete, a truncate, an all, public or a grant option in that block", () => {
    const section = runbook.indexOf("`0028_create_design_price_notices`");

    for (const line of grantLinesOf(runbook, section)) {
      expect(line).not.toMatch(
        /\b(?:DELETE|TRUNCATE|ALL|PUBLIC|GRANT OPTION)\b/,
      );
    }
  });
});
