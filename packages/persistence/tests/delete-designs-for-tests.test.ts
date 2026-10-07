import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteDesignsForTests,
  findDesignIdsForTests,
} from "../src/delete-designs-for-tests.js";

const APPLICATION_URL =
  "postgresql://owner:secret@host.neon.tech/neondb?sslmode=require";

/**
 * Records every connection the helper opens and every statement it sends, so a test can assert the
 * absence of both. The driver is mocked rather than pointed at a live database because the property
 * under test is that a misconfigured connection reaches the database *not at all* — a live run can
 * only show that a delete did nothing, which is a much weaker claim (finding DB-001).
 */
const driver = vi.hoisted(() => {
  const connectionUrls: string[] = [];
  const statements: string[][] = [];
  // What the next query resolves with — `findDesignIdsForTests`'s own `select` reads this back;
  // every other statement here ignores it, the way the real driver's `delete` result is ignored.
  const nextResult: { current: readonly unknown[] } = { current: [] };
  return { connectionUrls, statements, nextResult };
});

vi.mock("@neondatabase/serverless", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  neon: (connectionUrl: string) => {
    driver.connectionUrls.push(connectionUrl);
    return (fragments: TemplateStringsArray) => {
      driver.statements.push([...fragments]);
      return Promise.resolve(driver.nextResult.current);
    };
  },
}));

describe("deleteDesignsForTests", () => {
  const originalDatabaseUrl = process.env["DATABASE_URL"];
  const originalTestDatabaseUrl = process.env["TEST_DATABASE_URL"];

  beforeEach(() => {
    driver.connectionUrls.length = 0;
    driver.statements.length = 0;
    driver.nextResult.current = [];
    process.env["DATABASE_URL"] = APPLICATION_URL;
  });

  afterEach(() => {
    process.env["DATABASE_URL"] = originalDatabaseUrl ?? "";
    process.env["TEST_DATABASE_URL"] = originalTestDatabaseUrl ?? "";
  });

  it("issues no statement and opens no connection when the test URL is the application database", async () => {
    process.env["TEST_DATABASE_URL"] = APPLICATION_URL;

    await expect(deleteDesignsForTests(["design-1"])).rejects.toThrow(
      /Refusing to run live database tests/,
    );
    expect(driver.connectionUrls).toEqual([]);
    expect(driver.statements).toEqual([]);
  });

  // Finding S5-1: the direct endpoint of the same Neon project is a different hostname reaching the
  // same rows, and it is the connection string the console hands out for `psql`.
  it("issues no statement for the direct endpoint of the application's pooled database", async () => {
    process.env["DATABASE_URL"] =
      "postgresql://owner:secret@ep-cool-1234-pooler.eu-central-1.aws.neon.tech/lemn-conf-v2";
    process.env["TEST_DATABASE_URL"] =
      "postgresql://owner:secret@ep-cool-1234.eu-central-1.aws.neon.tech/lemn-conf-v2";

    await expect(deleteDesignsForTests(["design-1"])).rejects.toThrow(
      /Refusing to run live database tests/,
    );
    expect(driver.connectionUrls).toEqual([]);
    expect(driver.statements).toEqual([]);
  });

  // Finding S5-2: with no application URL to compare against, the old guard accepted everything.
  it("issues no statement for a non-test database when DATABASE_URL is unset", async () => {
    delete process.env["DATABASE_URL"];
    process.env["TEST_DATABASE_URL"] = APPLICATION_URL;

    await expect(deleteDesignsForTests(["design-1"])).rejects.toThrow(
      /not one of the databases this repository allows/,
    );
    expect(driver.connectionUrls).toEqual([]);
    expect(driver.statements).toEqual([]);
  });

  it("deletes one row per id against an allowlisted test database", async () => {
    process.env["TEST_DATABASE_URL"] =
      "postgresql://owner:secret@host.neon.tech/lemnaria_test";

    await deleteDesignsForTests(["design-1", "design-2"]);

    expect(new Set(driver.connectionUrls)).toEqual(
      new Set(["postgresql://owner:secret@host.neon.tech/lemnaria_test"]),
    );
    expect(driver.statements).toHaveLength(2);
    expect(driver.statements[0]?.[0]).toContain("delete from designs");
  });

  it("refuses a database whose name is not on the test allowlist, whatever its host", async () => {
    process.env["TEST_DATABASE_URL"] =
      "postgresql://owner:secret@isolated.neon.tech/some_other_db";

    await expect(deleteDesignsForTests(["design-1"])).rejects.toThrow(
      /not one of the databases this repository allows/,
    );
    expect(driver.statements).toEqual([]);
  });

  // The helper is exported from the package index, so `apps/web` can import it. "Never call this
  // from application code" is enforced, not merely documented.
  it("refuses to run at all outside a test runner", async () => {
    process.env["TEST_DATABASE_URL"] =
      "postgresql://owner:secret@host.neon.tech/lemnaria_test";
    const originalVitest = process.env["VITEST"];
    const originalWorkerIndex = process.env["TEST_WORKER_INDEX"];
    delete process.env["VITEST"];
    delete process.env["TEST_WORKER_INDEX"];

    try {
      await expect(deleteDesignsForTests(["design-1"])).rejects.toThrow(
        /outside a test runner/,
      );
      expect(driver.connectionUrls).toEqual([]);
    } finally {
      if (originalVitest !== undefined) process.env["VITEST"] = originalVitest;
      if (originalWorkerIndex !== undefined) {
        process.env["TEST_WORKER_INDEX"] = originalWorkerIndex;
      }
    }
  });

  it("refuses to run under NODE_ENV=production even inside a test runner", async () => {
    process.env["TEST_DATABASE_URL"] =
      "postgresql://owner:secret@host.neon.tech/lemnaria_test";
    const originalNodeEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";

    try {
      await expect(deleteDesignsForTests(["design-1"])).rejects.toThrow(
        /NODE_ENV=production/,
      );
      expect(driver.connectionUrls).toEqual([]);
    } finally {
      process.env["NODE_ENV"] = originalNodeEnv ?? "test";
    }
  });

  it("touches the database at all only when there is something to delete", async () => {
    process.env["TEST_DATABASE_URL"] = APPLICATION_URL;

    await expect(deleteDesignsForTests([])).resolves.toBeUndefined();
    expect(driver.connectionUrls).toEqual([]);
  });
});

/**
 * M7 wave 7E3b, S4 (criterion 9): `findDesignIdsForTests` is what `seeded-design.qa.e2e.spec.ts`
 * now proves a delete happened with, since ADR 0114 decision 5 makes a cookie-less
 * `GET /api/designs/{id}` answer 404 whether or not the row still exists. It is read-only, and
 * shares `deleteDesignsForTests`'s own guard — these tests mirror that file's shape rather than
 * repeating every one of its cases.
 */
describe("findDesignIdsForTests", () => {
  beforeEach(() => {
    driver.connectionUrls.length = 0;
    driver.statements.length = 0;
    driver.nextResult.current = [];
    process.env["DATABASE_URL"] = APPLICATION_URL;
  });

  afterEach(() => {
    process.env["DATABASE_URL"] = process.env["DATABASE_URL"] ?? "";
    delete process.env["TEST_DATABASE_URL"];
  });

  it("shares the same guard: refuses the application database and opens no connection", async () => {
    process.env["TEST_DATABASE_URL"] = APPLICATION_URL;

    await expect(findDesignIdsForTests(["design-1"])).rejects.toThrow(
      /Refusing to run live database tests/,
    );
    expect(driver.connectionUrls).toEqual([]);
  });

  it("selects, never deletes, and answers the ids the driver reports back", async () => {
    process.env["TEST_DATABASE_URL"] =
      "postgresql://owner:secret@host.neon.tech/lemnaria_test";
    driver.nextResult.current = [{ id: "design-1" }];

    const found = await findDesignIdsForTests(["design-1", "design-2"]);

    expect(found).toEqual(["design-1"]);
    expect(driver.statements).toHaveLength(1);
    expect(driver.statements[0]?.[0]).toContain("select id from designs");
    expect(driver.statements[0]?.join("")).not.toContain("delete");
  });

  it("touches the database at all only when there is something to look for", async () => {
    process.env["TEST_DATABASE_URL"] = APPLICATION_URL;

    await expect(findDesignIdsForTests([])).resolves.toEqual([]);
    expect(driver.connectionUrls).toEqual([]);
  });
});
