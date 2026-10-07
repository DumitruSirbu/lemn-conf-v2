import { afterEach, describe, expect, it, vi } from "vitest";

import { findDesignIdsForTests } from "../src/delete-designs-for-tests.js";
import { InvalidConnectionUrlError } from "../src/open-database.js";
import {
  assertSafeTestDatabaseUrl,
  resolveTestDatabaseUrl,
} from "../src/test-database-url.js";
import {
  ALLOWLISTED_TEST_DATABASE,
  FAKE_DATABASE,
  OTHER_APPLICATION_URL,
  QA_CREDENTIALS,
  QA_CREDENTIAL_MARKERS,
  QA_HOST,
  QA_MARKERS,
  errorRaisedBy,
  sweep,
} from "./support/qa-8b-connection-values.js";
import type { Site } from "./support/qa-8b-connection-values.js";

/**
 * Adversarial QA of M8 wave 8B, slice S3: the test helper and the isolation guard, with values the wave's table does
 * not hold. Fake values only; every host ends in `.invalid` or the value does not parse, so nothing is reachable.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

function stubTestVariable(value: string): void {
  vi.stubEnv("TEST_DATABASE_URL", value);
  vi.stubEnv("DATABASE_URL", OTHER_APPLICATION_URL);
}

const TEST_VARIABLE_SITES: readonly Site[] = [
  {
    name: "findDesignIdsForTests",
    databaseName: ALLOWLISTED_TEST_DATABASE,
    markers: QA_CREDENTIAL_MARKERS,
    mustRaiseForEveryValue: true,
    run: (value) => {
      stubTestVariable(value);
      return findDesignIdsForTests(["qa-8b-no-such-design"]);
    },
  },
  {
    name: "assertSafeTestDatabaseUrl, an allowlisted name",
    databaseName: ALLOWLISTED_TEST_DATABASE,
    markers: QA_CREDENTIAL_MARKERS,
    mustRaiseForEveryValue: false,
    run: (value) => {
      stubTestVariable(value);
      assertSafeTestDatabaseUrl(value);
    },
  },
  {
    name: "resolveTestDatabaseUrl, a name that is not allowlisted",
    databaseName: FAKE_DATABASE,
    markers: QA_CREDENTIAL_MARKERS,
    mustRaiseForEveryValue: true,
    run: (value) => {
      stubTestVariable(value);
      return resolveTestDatabaseUrl();
    },
  },
  {
    name: "resolveTestDatabaseUrl deriving from DATABASE_URL",
    databaseName: FAKE_DATABASE,
    markers: QA_MARKERS,
    mustRaiseForEveryValue: false,
    run: (value) => {
      vi.stubEnv("TEST_DATABASE_URL", "");
      vi.stubEnv("DATABASE_URL", value);
      return resolveTestDatabaseUrl();
    },
  },
];

describe("criterion 2 at the test-database sites, with values the wave's table does not hold", () => {
  it.each(TEST_VARIABLE_SITES)(
    "$name raises no error that shows a marker",
    async ({ name, ...site }) => {
      const { leaks, valuesThatRaisedNothing } = await sweep({ name, ...site });

      expect(leaks).toEqual([]);
      if (site.mustRaiseForEveryValue)
        expect(valuesThatRaisedNothing).toEqual([]);
    },
  );
});

describe("no fallback from TEST_DATABASE_URL to DATABASE_URL (criterion 8, ADR 0008)", () => {
  const WELL_FORMED = `postgres://${QA_CREDENTIALS}@${QA_HOST}/${FAKE_DATABASE}`;

  it("the test helper refuses a malformed TEST_DATABASE_URL although DATABASE_URL could be derived from", async () => {
    vi.stubEnv(
      "TEST_DATABASE_URL",
      `postgres://${QA_CREDENTIALS}%ZZ@${QA_HOST}/${ALLOWLISTED_TEST_DATABASE}`,
    );
    vi.stubEnv("DATABASE_URL", WELL_FORMED);

    const error = await errorRaisedBy(() => findDesignIdsForTests(["id"]));

    expect(error).toBeInstanceOf(InvalidConnectionUrlError);
    expect((error as InvalidConnectionUrlError).variableName).toBe(
      "TEST_DATABASE_URL",
    );
  });
});
