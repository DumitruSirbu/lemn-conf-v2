import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNeonDesignRowSource } from "../src/design-row-source.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerWith,
  driver,
  resetDriver,
} from "./support/mocked-neon-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

/**
 * Criterion 5: the backup's export statement names `designs` alone. The contact table holds personal data and is not to
 * be swept into a backup with a 14-day rotation; a second table in this statement would do exactly that.
 */
const TABLE_AFTER_A_KEYWORD =
  /\b(?:from|join|into|update|using)\s+([a-z_][a-z0-9_.]*)/g;

function tablesNamedIn(statementText: string): string[] {
  const normalised = statementText.replace(/\s+/g, " ").toLowerCase();
  return [
    ...new Set(
      [...normalised.matchAll(TABLE_AFTER_A_KEYWORD)].map(
        (match) => match[1] ?? "",
      ),
    ),
  ];
}

async function everyExportStatement(): Promise<string[]> {
  const source = createNeonDesignRowSource(WELL_FORMED_UNREACHABLE_VALUE);
  answerWith([]);
  await source.fetchDesignPage({ pageSize: 10 });
  answerWith([]);
  await source.fetchDesignPage({ afterId: "an-id-already-seen", pageSize: 10 });
  return driver.statements.map((statement) => statement.text);
}

beforeEach(resetDriver);
afterEach(resetDriver);

describe("the design export's statements", () => {
  it("send two statements, the first page's and a later page's, so both are read", async () => {
    expect(await everyExportStatement()).toHaveLength(2);
  });

  it("name `designs` and no other table", async () => {
    const statements = await everyExportStatement();

    expect(statements.map(tablesNamedIn)).toEqual([["designs"], ["designs"]]);
  });

  it("do not mention the contact table anywhere", async () => {
    const statements = await everyExportStatement();

    expect(statements.join(" ")).not.toMatch(/contact/i);
  });

  it("would be caught if a second table were added: the reader finds a joined table", () => {
    const widened =
      "select id from designs join contact_submissions using (client_request_id)";

    expect(tablesNamedIn(widened)).toEqual(["designs", "contact_submissions"]);
  });
});
