import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readMigrationFiles } from "../src/migration-files.js";
import { saveKitchenDefaultsStatement } from "../src/kitchen-defaults-statements.js";
import { prepareStaffAuditRecord } from "../src/staff-audit-store.js";

/**
 * The grants the owner is told to issue for `0029` are the ones its header prescribes, and the one table the code
 * writes is written only in columns they cover. The migration file carries no grant (the unattended screen would not
 * recognise one), so the runbook's block is the only place the owner reads them from: a block that drifted from the
 * header, or that allowed more, would ship a grant nobody reviewed.
 */
const DEFAULTS_MIGRATION = (() => {
  const found = readMigrationFiles().find(({ version }) => version === 29);
  if (found === undefined) throw new Error("no migration 0029");
  return found;
})();

const RUNBOOK = readFileSync(
  new URL(
    "../../../docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md",
    import.meta.url,
  ),
  "utf8",
);

const RUNBOOK_SECTION_OPENING = "**Wave S3, `0029_create_kitchen_defaults`";

function sectionOfTheRunbook(): string {
  const start = RUNBOOK.indexOf(RUNBOOK_SECTION_OPENING);
  expect(start, "the runbook has a section for 0029").toBeGreaterThan(-1);
  const end = RUNBOOK.indexOf("\n## ", start);
  return RUNBOOK.slice(start, end === -1 ? undefined : end);
}

function sqlFencesOf(text: string): string[][] {
  return [...text.matchAll(/```sql\n([\s\S]*?)```/g)].map(([, body]) =>
    (body ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  );
}

const headerGrants = DEFAULTS_MIGRATION.sql
  .split("\n")
  .filter((line) => /^--\s+GRANT /.test(line))
  .map((line) => line.replace(/^--\s+/, "").trim());

describe("the owner's runbook for 0029", () => {
  it("prescribes the grants of the migration's header, word for word, in the same order, and nothing else", () => {
    const fences = sqlFencesOf(sectionOfTheRunbook());

    expect(headerGrants).toHaveLength(2);
    expect(fences).toEqual([headerGrants]);
  });

  it("grants no more than the two statements, in any form", () => {
    const [grants] = sqlFencesOf(sectionOfTheRunbook());

    expect(grants?.join("\n")).not.toMatch(
      /\b(?:INSERT|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL\s+PRIVILEGES|WITH\s+GRANT\s+OPTION)\b|\bTO\s+PUBLIC\b|\bGRANT\s+ALL\b/i,
    );
    expect(grants?.every((line) => line.endsWith("TO app_designs;"))).toBe(
      true,
    );
  });

  it("states the ledger readings the header does, and that nothing is applied", () => {
    const section = sectionOfTheRunbook().replace(/\s+/g, " ");

    expect(section).toContain("The ledger reads 1–28 before and 1–29 after");
    expect(section).toContain("Unapplied anywhere");
  });
});

describe("the columns the save writes and the columns the grant lets the role update", () => {
  const SAVE_STATEMENT = (() => {
    const audit = prepareStaffAuditRecord({
      sessionTokenHash: "a".repeat(64),
      idleLifetimeSeconds: { client: 1, operator: 1, administrator: 1 },
      entry: {
        action: "kitchen-defaults-saved",
        detail: { changedFields: ["handle"] },
      } as never,
      designId: null,
      subjectAccountId: null,
    });
    const text: string[] = [];
    saveKitchenDefaultsStatement(
      (strings: TemplateStringsArray) => {
        text.push(strings.join("?"));
        return text;
      },
      {
        expectedRevision: "0",
        expectedAvailabilityRevision: "0",
        defaultsJson: "{}",
        detailJson: "{}",
        audit,
      },
    );
    return text.join("").replace(/\s+/g, " ");
  })();

  const grantedUpdateColumns = (() => {
    const grant = headerGrants.find((line) => line.startsWith("GRANT UPDATE"));
    const list = /UPDATE \(([^)]*)\)/.exec(grant ?? "")?.[1] ?? "";
    return list.split(",").map((column) => column.trim());
  })();

  it("are the same four, so the save needs no column the grant leaves out and the grant holds none the save never writes", () => {
    const setClause = /update kitchen_defaults set (.*?) from actor/.exec(
      SAVE_STATEMENT,
    )?.[1];
    const written = (setClause ?? "")
      .split(/, (?=\w+ =)/)
      .map((assignment) => assignment.split(" =")[0]?.trim());

    expect([...written].sort()).toEqual([...grantedUpdateColumns].sort());
    expect(grantedUpdateColumns).toEqual([
      "revision",
      "defaults",
      "saved_at",
      "saved_by_account_id",
    ]);
  });

  it("leave the singleton key out of the grant and out of the save's assignments", () => {
    expect(grantedUpdateColumns).not.toContain("singleton");
    expect(SAVE_STATEMENT).not.toMatch(
      /update kitchen_defaults set[^)]*\bsingleton\b/,
    );
  });
});
