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
