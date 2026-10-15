import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CSP_REPORT_CAPACITY } from "../src/csp-report-store.js";
import { executableStatementsOf } from "../src/migration-safety.js";

const MIGRATION_PATH = join(
  import.meta.dirname,
  "..",
  "src",
  "migrations",
  "0009_create_csp_reports.sql",
);

/**
 * The migration's text, as 8Q2 criterion 2 and checkpoint A read it: the columns are exactly these, the constraints are
 * exactly these, the capacity literal is the code's constant, and nothing the database computes is derived from a
 * report. Read as the unattended screen reads it: comments removed, lowercased.
 */
const SQL = readFileSync(MIGRATION_PATH, "utf8");
const [CURSOR_TABLE = "", CURSOR_SEED = "", REPORTS_TABLE = ""] =
  executableStatementsOf(SQL);

const CONSTRAINT_NAME = /\bconstraint ([a-z_0-9]+)/g;

/** The table's definitions: what lies between its outer parentheses, cut at each comma outside any parenthesis or
 *  quotation (the screen's reading has already put the statement on one line). */
function definitionsOf(statement: string): string[] {
  const body = statement.slice(
    statement.indexOf("(") + 1,
    statement.lastIndexOf(")"),
  );
  const definitions: string[] = [];
  let depth = 0;
  let isQuoted = false;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "'") isQuoted = !isQuoted;
    if (isQuoted) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      definitions.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  return [...definitions, body.slice(start).trim()];
}

function columnsOf(statement: string): string[] {
  return definitionsOf(statement)
    .filter((definition) => !definition.startsWith("constraint "))
    .map((definition) => definition.split(" ")[0] ?? "");
}

function constraintsOf(statement: string): string[] {
  return [...statement.matchAll(CONSTRAINT_NAME)].map(([, name]) => name ?? "");
}

describe("migration 0009's text", () => {
  it("is the two tables and the cursor's seed, and nothing else", () => {
    expect(executableStatementsOf(SQL)).toHaveLength(3);
    expect(CURSOR_TABLE).toMatch(
      /^create table if not exists csp_report_cursor \(/,
    );
    expect(CURSOR_SEED).toMatch(
      /^insert into csp_report_cursor \(singleton, last_number\) values \(true, 0\) on conflict do nothing$/,
    );
    expect(REPORTS_TABLE).toMatch(/^create table if not exists csp_reports \(/);
  });

  it("holds exactly the 14 columns of the report and the 2 of the cursor", () => {
    expect(columnsOf(REPORTS_TABLE)).toEqual([
      "slot",
      "report_number",
      "received_at",
      "writer_mark",
      "directive",
      "blocked",
      "source",
      "line_number",
      "column_number",
      "page",
      "locale",
      "origin",
      "disposition",
      "status_code",
    ]);
    expect(columnsOf(CURSOR_TABLE)).toEqual(["singleton", "last_number"]);
  });

  it("names exactly these constraints, the slot rule among them", () => {
    expect(constraintsOf(CURSOR_TABLE)).toEqual([
      "csp_report_cursor_is_one_row",
      "csp_report_cursor_last_number_is_not_negative",
    ]);
    expect(constraintsOf(REPORTS_TABLE)).toEqual([
      "csp_reports_slot_is_within_capacity",
      "csp_reports_report_number_is_positive",
      "csp_reports_writer_mark_is_sha256",
      "csp_reports_directive_shape",
      "csp_reports_blocked_shape",
      "csp_reports_source_shape",
      "csp_reports_line_number_range",
      "csp_reports_column_number_range",
      "csp_reports_page_shape",
      "csp_reports_locale_shape",
      "csp_reports_origin_is_known",
      "csp_reports_disposition_is_known",
      "csp_reports_status_code_range",
      "csp_reports_slot_follows_report_number",
      "csp_reports_source_only_for_own",
      "csp_reports_page_only_for_own",
    ]);
  });

  it("writes the capacity the code uses, in the slot's range and in the rule that ties the slot to the number", () => {
    const capacity = String(CSP_REPORT_CAPACITY);

    expect(REPORTS_TABLE).toContain(`check (slot >= 0 and slot < ${capacity})`);
    expect(REPORTS_TABLE).toContain(
      `check (slot = report_number % ${capacity})`,
    );
    expect(SQL).toContain(`a ring of at most ${capacity} rows`);
  });

  it("names the host class that refuses white space, control characters and a backslash, in both address checks", () => {
    const hostClass = "https?://[^/?#@[:space:][:cntrl:][.backslash.]]+";

    expect(REPORTS_TABLE.split(hostClass)).toHaveLength(3);
  });

  it("bounds each page segment at 20 characters, and the page at 64", () => {
    expect(REPORTS_TABLE).toContain("char_length(page) <= 64");
    expect(REPORTS_TABLE).toContain(
      "page ~ '^(other|/[[]locale[]](/[]a-z[-]{1,20})*)$'",
    );
  });

  it("contains no backslash, which the unattended screen refuses inside a quoted string", () => {
    expect(SQL).not.toContain(String.fromCharCode(92));
  });

  it("derives nothing from a report: no default but the cursor's, no key to another table, no index, trigger or function", () => {
    expect(REPORTS_TABLE).not.toMatch(
      /\b(default|references|index|trigger|function)\b/,
    );
    expect(CURSOR_TABLE.match(/\bdefault\b/g)).toEqual(["default"]);
    expect(CURSOR_TABLE).toContain(
      "singleton boolean primary key default true",
    );
  });

  it("has no column named for an address, a network block, a bucket, a user agent, a cookie, an id or a token", () => {
    const forbidden =
      /\b(document|referrer|sample|policy|address|ip|network|block|bucket|agent|cookie|design_id|token|query|fragment|uri|url)\b/;
    const names = [...columnsOf(REPORTS_TABLE), ...columnsOf(CURSOR_TABLE)]
      .join(" ")
      .replaceAll("_", " ");

    expect(names).not.toMatch(forbidden);
  });

  it("grants nothing and removes nothing: the grant is the owner's, and no row is ever deleted by the database", () => {
    expect(executableStatementsOf(SQL).join(" ")).not.toMatch(
      /\b(grant|revoke|delete|truncate|drop|alter)\b/,
    );
  });
});
