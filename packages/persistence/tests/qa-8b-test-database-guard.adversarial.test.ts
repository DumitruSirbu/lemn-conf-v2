import { afterEach, describe, expect, it, vi } from "vitest";

import { findDesignIdsForTests } from "../src/delete-designs-for-tests.js";
import { InvalidConnectionUrlError } from "../src/open-database.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";
import {
  assertSafeTestDatabaseUrl,
  resolveTestDatabaseUrl,
} from "../src/test-database-url.js";
import {
  ALLOWLISTED_TEST_DATABASE,
  FAKE_DATABASE,
  OTHER_APPLICATION_URL,
  QA_CREDENTIALS,
  QA_HOST,
  QA_MARKERS,
  QA_USER,
  errorRaisedBy,
  sweep,
} from "./support/qa-8b-connection-values.js";
import type { Site } from "./support/qa-8b-connection-values.js";

/**
 * The test helper and the isolation guard against mistyped connection values. Fake values only; every host ends in
 * `.invalid` or the value does not parse, so nothing is reachable.
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
    markers: QA_MARKERS,
    mustRaiseForEveryValue: true,
    run: (value) => {
      stubTestVariable(value);
      return findDesignIdsForTests(["qa-8b-no-such-design"]);
    },
  },
  {
    name: "assertSafeTestDatabaseUrl, an allowlisted name",
    databaseName: ALLOWLISTED_TEST_DATABASE,
    markers: QA_MARKERS,
    mustRaiseForEveryValue: false,
    run: (value) => {
      stubTestVariable(value);
      assertSafeTestDatabaseUrl(value);
    },
  },
  {
    name: "resolveTestDatabaseUrl, a name that is not allowlisted",
    databaseName: FAKE_DATABASE,
    markers: QA_MARKERS,
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

describe("a test-database site given a mistyped or mis-pasted connection value", () => {
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

describe("no fallback from TEST_DATABASE_URL to DATABASE_URL (ADR 0008)", () => {
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

describe("the guard admits an allowlisted name exactly, and nothing near one", () => {
  const urlNaming = (databaseName: string): string =>
    `postgres://${QA_CREDENTIALS}@${QA_HOST}/${databaseName}`;

  it.each([
    "LEMNARIA_TEST",
    "Lemnaria_Test",
    "LEMN-CONF-V2-STAGING",
    "lemnaria_test2",
    "lemnaria_test/",
    "lemnaria_test/x",
    "x/lemnaria_test",
    "lemnaria_test%20",
    "%6Cemnaria_test",
    "lemn-conf-v2",
    "",
  ])("refuses the database name %j", (databaseName) => {
    stubTestVariable(urlNaming(databaseName));

    expect(() => {
      assertSafeTestDatabaseUrl(urlNaming(databaseName));
    }).toThrow(/not one of the databases this repository allows/);
    expect(() => resolveTestDatabaseUrl()).toThrow(
      /not one of the databases this repository allows/,
    );
  });

  it.each(["lemnaria_test", "lemn-conf-v2-staging"])(
    "accepts the allowlisted name %s",
    (databaseName) => {
      stubTestVariable(urlNaming(databaseName));

      expect(() => {
        assertSafeTestDatabaseUrl(urlNaming(databaseName));
      }).not.toThrow();
      expect(resolveTestDatabaseUrl()).toBe(urlNaming(databaseName));
    },
  );
});

describe("the guard allows a test URL only if both entry points would open it", () => {
  const PASSWORD_HEAD = "FAKEHEAD_QA8B";
  const PASSWORD_TAIL = "FAKETAIL_QA8B";
  const MARKERS = [...QA_MARKERS, PASSWORD_HEAD, PASSWORD_TAIL];
  const withInThePassword = (character: string): string =>
    `postgresql://${QA_USER}:${PASSWORD_HEAD}${character}${PASSWORD_TAIL}@${QA_HOST}/${ALLOWLISTED_TEST_DATABASE}`;
  const A_HEADER_CANNOT_CARRY_IT = /cannot be sent to the query endpoint/;

  function refusalOf(run: () => unknown): InvalidConnectionUrlError {
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidConnectionUrlError);
    expect(markersFoundOn(thrown, MARKERS)).toEqual([]);
    return thrown as InvalidConnectionUrlError;
  }

  // The live suites' ledger and schema-lock helpers open the driver themselves after this guard alone, and a driver
  // given such a value throws an error that quotes it; on the CI runner the value is the owner credential.
  const ODD_PASSWORD_CHARACTERS: readonly [string, string][] = [
    ["a line feed", "\n"],
    ["a carriage return", "\r"],
    ["a NUL", "\u0000"],
    ["a character above U+00FF", "Ā"],
  ];

  it.each(ODD_PASSWORD_CHARACTERS)(
    "refuses a test URL whose password holds %s, before any helper is handed it, naming TEST_DATABASE_URL",
    (_what, character) => {
      const wrapped = withInThePassword(character);
      stubTestVariable(wrapped);

      const refusal = refusalOf(() => {
        assertSafeTestDatabaseUrl(wrapped);
      });

      expect(refusal.message).toMatch(A_HEADER_CANNOT_CARRY_IT);
      expect(refusal.variableName).toBe("TEST_DATABASE_URL");
    },
  );

  // An environment variable cannot hold a NUL, so the variable is read with the other three.
  it.each(
    ODD_PASSWORD_CHARACTERS.filter(([, character]) => character !== "\u0000"),
  )(
    "refuses TEST_DATABASE_URL when it is read holding %s in its password",
    (_what, character) => {
      stubTestVariable(withInThePassword(character));

      const refusal = refusalOf(() => resolveTestDatabaseUrl());

      expect(refusal.message).toMatch(A_HEADER_CANNOT_CARRY_IT);
      expect(refusal.variableName).toBe("TEST_DATABASE_URL");
    },
  );

  it.each([
    [
      "a pooled endpoint with sslmode and channel binding",
      `postgresql://neondb_owner:npg_FAKEqa8b@ep-fake-qa8b-pooler.eu-central-1.aws.neon.invalid/lemn-conf-v2-staging?sslmode=require&channel_binding=require`,
    ],
    [
      "a direct endpoint",
      `postgresql://neondb_owner:npg_FAKEqa8b@ep-fake-qa8b.eu-central-1.aws.neon.invalid/lemnaria_test?sslmode=require`,
    ],
    [
      "an endpoint option and a port",
      `postgres://neondb_owner:npg_FAKEqa8b@ep-fake-qa8b.eu-central-1.aws.neon.invalid:5432/lemnaria_test?sslmode=require&options=endpoint%3Dep-fake-qa8b`,
    ],
    [
      "a percent-encoded password",
      `postgresql://neondb_owner:p%40ss%2Fw0rd%3A@ep-fake-qa8b.eu-central-1.aws.neon.invalid/lemnaria_test`,
    ],
    [
      "a trailing newline",
      `postgresql://neondb_owner:npg_FAKEqa8b@ep-fake-qa8b.eu-central-1.aws.neon.invalid/lemnaria_test\n`,
    ],
  ])("still allows a real-shaped test URL: %s", (_shape, testUrl) => {
    stubTestVariable(testUrl);

    expect(() => {
      assertSafeTestDatabaseUrl(testUrl);
    }).not.toThrow();
    expect(resolveTestDatabaseUrl()).toBe(testUrl.trim());
  });

  it("reports an unlisted name as unlisted, not as a shape problem, when the value is malformed as well", () => {
    const unlistedAndMalformed = `mysql://${QA_CREDENTIALS}\n@${QA_HOST}/${FAKE_DATABASE}`;
    stubTestVariable(unlistedAndMalformed);

    expect(() => {
      assertSafeTestDatabaseUrl(unlistedAndMalformed);
    }).toThrow(/not one of the databases this repository allows/);
  });

  it("reports the application database's name as such, not as a shape problem, when the value is malformed as well", () => {
    const malformed = `mysql://${QA_CREDENTIALS}@${QA_HOST}/${ALLOWLISTED_TEST_DATABASE}`;
    vi.stubEnv("TEST_DATABASE_URL", malformed);
    vi.stubEnv(
      "DATABASE_URL",
      `postgres://app:apppw@app-host.invalid/${ALLOWLISTED_TEST_DATABASE}`,
    );

    expect(() => {
      assertSafeTestDatabaseUrl(malformed);
    }).toThrow(/it is the database name DATABASE_URL points at/);
  });

  it("names DATABASE_URL when the URL it refuses was derived from it", () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv(
      "DATABASE_URL",
      `postgres://${QA_CREDENTIALS}@${QA_HOST}/appdb?sslrootcert=/qa-8b-no-such-directory/root.pem`,
    );

    const refusal = refusalOf(() => resolveTestDatabaseUrl());

    expect(refusal.variableName).toBe("DATABASE_URL");
    expect(refusal.message).toMatch(/^DATABASE_URL /);
  });

  it("derives, from a DATABASE_URL whose password was wrapped, a test URL without the line break, which both entry points open", () => {
    vi.stubEnv("TEST_DATABASE_URL", "");
    vi.stubEnv(
      "DATABASE_URL",
      `postgresql://${QA_USER}:${PASSWORD_HEAD}\n${PASSWORD_TAIL}@${QA_HOST}/appdb`,
    );

    expect(resolveTestDatabaseUrl()).toBe(
      `postgresql://${QA_USER}:${PASSWORD_HEAD}${PASSWORD_TAIL}@${QA_HOST}/lemnaria_test`,
    );
  });
});
