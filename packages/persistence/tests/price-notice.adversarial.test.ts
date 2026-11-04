import { readFileSync } from "node:fs";

import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isMintedId, isRevisionShape } from "../src/dashboard-store-shapes.js";
import type { StatementTag } from "../src/preset-statements.js";
import {
  readAcknowledgedStatement,
  recordAcknowledgedStatement,
  recordIfAbsentStatement,
} from "../src/price-notice-statements.js";
import { isActionableDesignId } from "../src/staff-kitchen-actions-store.js";
import {
  PRICE_NOTICES_MIGRATION,
  priceNoticesCheckPattern,
} from "./support/price-notices-migration.js";

/**
 * What the price-notice marker's three layers must agree on, asked from outside the layer that states each rule: the
 * statements it sends, the shape rules the stores apply before a statement against the checks `0028` puts on the table,
 * and the runbook's grant block against the migration's header. It needs no
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
    const tableAccepts = priceNoticesCheckPattern(
      "design_price_notices_design_id_shape",
    );

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
    const tableAccepts = priceNoticesCheckPattern(
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

describe("the owner's runbook", () => {
  const runbook = readFileSync(
    new URL(
      "../../../docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md",
      import.meta.url,
    ),
    "utf8",
  );
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
    const headerGrants = PRICE_NOTICES_MIGRATION.sql
      .split("\n")
      .filter((line) => /^--\s+GRANT /.test(line))
      .map((line) => line.replace(/^--\s+/, "").trim());
    const section = runbook.indexOf("`0028_create_design_price_notices`");
    expect(section).toBeGreaterThan(-1);

    expect(headerGrants).toHaveLength(3);
    expect(grantLinesOf(runbook, section)).toEqual(headerGrants);
  });
});
