import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertSafeTestDatabaseUrl,
  resolveTestDatabaseUrl,
} from "../src/test-database-url.js";

const APPLICATION_URL =
  "postgresql://user:secret@host.neon.tech/neondb?sslmode=require";

describe("resolveTestDatabaseUrl", () => {
  const originalDatabaseUrl = process.env["DATABASE_URL"];
  const originalTestDatabaseUrl = process.env["TEST_DATABASE_URL"];

  beforeEach(() => {
    process.env["DATABASE_URL"] = APPLICATION_URL;
    process.env["TEST_DATABASE_URL"] = "";
  });

  afterEach(() => {
    process.env["DATABASE_URL"] = originalDatabaseUrl ?? "";
    process.env["TEST_DATABASE_URL"] = originalTestDatabaseUrl ?? "";
  });

  it("swaps only the database name, keeping host and credentials", () => {
    const resolved = new URL(resolveTestDatabaseUrl());
    const application = new URL(APPLICATION_URL);

    expect(resolved.pathname).toBe("/lemnaria_test");
    expect(resolved.host).toBe(application.host);
    expect(resolved.username).toBe(application.username);
    expect(resolved.searchParams.get("sslmode")).toBe("require");
  });

  it("prefers TEST_DATABASE_URL when one is set, so a wholly separate instance can be used", () => {
    process.env["TEST_DATABASE_URL"] =
      "postgresql://u:p@other.neon.tech/lemnaria_test";

    expect(new URL(resolveTestDatabaseUrl()).host).toBe("other.neon.tech");
  });

  it("refuses a TEST_DATABASE_URL pointing at the application's own database", () => {
    process.env["TEST_DATABASE_URL"] = APPLICATION_URL;

    expect(() => resolveTestDatabaseUrl()).toThrow(
      /Refusing to run live database tests/,
    );
  });

  it("accepts a TEST_DATABASE_URL with no DATABASE_URL set, as CI runs it", () => {
    delete process.env["DATABASE_URL"];
    process.env["TEST_DATABASE_URL"] =
      "postgresql://u:p@ci.neon.tech/lemnaria_test";

    expect(resolveTestDatabaseUrl()).toBe(
      "postgresql://u:p@ci.neon.tech/lemnaria_test",
    );
  });

  it("still requires DATABASE_URL when there is no TEST_DATABASE_URL to derive from", () => {
    delete process.env["DATABASE_URL"];

    expect(() => resolveTestDatabaseUrl()).toThrow(
      /DATABASE_URL environment variable is not set/,
    );
  });

  it("refuses when the application database is itself already named lemnaria_test", () => {
    process.env["DATABASE_URL"] =
      "postgresql://user:secret@host.neon.tech/lemnaria_test";

    expect(() => resolveTestDatabaseUrl()).toThrow(
      /Refusing to run live database tests/,
    );
  });
});

describe("assertSafeTestDatabaseUrl", () => {
  const originalDatabaseUrl = process.env["DATABASE_URL"];

  beforeEach(() => {
    process.env["DATABASE_URL"] = APPLICATION_URL;
  });

  afterEach(() => {
    process.env["DATABASE_URL"] = originalDatabaseUrl ?? "";
  });

  it("refuses a URL reaching the application database under a second role's credentials", () => {
    // Credentials are not part of a database's identity: a different role on the same host, port
    // and database still deletes the same rows.
    expect(() => {
      assertSafeTestDatabaseUrl(
        "postgresql://other_role:other@host.neon.tech/neondb",
      );
    }).toThrow(/Refusing to run live database tests/);
  });

  it("refuses a URL differing only in the case of its host", () => {
    expect(() => {
      assertSafeTestDatabaseUrl(
        "postgresql://user:secret@HOST.neon.tech/neondb",
      );
    }).toThrow(/Refusing to run live database tests/);
  });

  // Finding S5-1. Neon fronts one database with a pooled and a direct endpoint; the direct one is
  // what the console offers for `psql`, and it is the string somebody pastes into `.env.test.local`.
  // A host comparison calls it a different database. The rows it deletes are the same rows.
  it("refuses the direct endpoint of the database the app reaches through its pooled one", () => {
    process.env["DATABASE_URL"] =
      "postgresql://owner:secret@ep-cool-1234-pooler.eu-central-1.aws.neon.tech/lemn-conf-v2";

    expect(() => {
      assertSafeTestDatabaseUrl(
        "postgresql://owner:secret@ep-cool-1234.eu-central-1.aws.neon.tech/lemn-conf-v2",
      );
    }).toThrow(/Refusing to run live database tests/);
  });

  it("refuses the same database name reached through any other host, since one database has many", () => {
    expect(() => {
      assertSafeTestDatabaseUrl(
        "postgresql://user:secret@other.neon.tech/neondb",
      );
    }).toThrow(/Refusing to run live database tests/);
  });

  // Finding S5-2. `unset DATABASE_URL` used to be a one-word bypass: with nothing to compare
  // against, every URL was accepted. A destructive path must require positive proof instead.
  it("refuses a non-test database name even when no DATABASE_URL exists to compare against", () => {
    delete process.env["DATABASE_URL"];

    expect(() => {
      assertSafeTestDatabaseUrl(APPLICATION_URL);
    }).toThrow(/not one of the databases this repository allows/);
  });

  it("accepts an allowlisted test database name with no DATABASE_URL set, as CI runs it", () => {
    delete process.env["DATABASE_URL"];

    expect(() => {
      assertSafeTestDatabaseUrl("postgresql://u:p@ci.neon.tech/lemnaria_test");
    }).not.toThrow();
  });
});
