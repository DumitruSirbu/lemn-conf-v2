import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted((): { database: unknown } => ({
  database: undefined,
}));

vi.mock("@neondatabase/serverless", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Client: class {
    readonly database: unknown = session.database;
  },
}));

const URL_NAMING_A_LISTED_DATABASE = "postgres://u:p@h.invalid/lemnaria_test";

describe("agreedDatabaseNameOf asks the session driver for its reading", () => {
  async function agreedName(): Promise<string> {
    const { agreedDatabaseNameOf } = await import("../src/open-database.js");
    return agreedDatabaseNameOf(URL_NAMING_A_LISTED_DATABASE);
  }

  it("gives the name when the session driver reads the same one", async () => {
    session.database = "lemnaria_test";

    expect(await agreedName()).toBe("lemnaria_test");
  });

  it("gives no name when the session driver reads another", async () => {
    session.database = "lemn-conf-v2";
    const { NO_AGREED_DATABASE_NAME } = await import("../src/open-database.js");

    expect(await agreedName()).toBe(NO_AGREED_DATABASE_NAME);
  });

  it.each([
    ["no database field at all", undefined],
    ["a field that is not a string", { name: "lemnaria_test" }],
  ])(
    "gives no name when the session driver gives %s: a reading it cannot obtain is not agreement",
    async (_label, database) => {
      session.database = database;
      const { NO_AGREED_DATABASE_NAME } = await import(
        "../src/open-database.js"
      );

      expect(await agreedName()).toBe(NO_AGREED_DATABASE_NAME);
    },
  );

  it("gives no name when the HTTP driver re-reads the string differently, whatever the session driver says", async () => {
    session.database = "lemnaria_test";
    const { agreedDatabaseNameOf, NO_AGREED_DATABASE_NAME } = await import(
      "../src/open-database.js"
    );

    expect(
      agreedDatabaseNameOf("postgres://a@b\\u:p@h.invalid/lemnaria_test"),
    ).toBe(NO_AGREED_DATABASE_NAME);
  });

  it("makes both openers refuse a string the session driver reads differently", async () => {
    session.database = "lemn-conf-v2";
    const { InvalidConnectionUrlError, openDatabase, openDatabaseSession } =
      await import("../src/open-database.js");

    expect(() => openDatabase(URL_NAMING_A_LISTED_DATABASE)).toThrow(
      InvalidConnectionUrlError,
    );
    expect(() => openDatabaseSession(URL_NAMING_A_LISTED_DATABASE)).toThrow(
      InvalidConnectionUrlError,
    );
  });
});
