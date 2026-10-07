import { fc } from "@fast-check/vitest";
import { Client, NeonDbError, neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import { DATABASE_NAMES_BY_ENVIRONMENT } from "../src/migration-target.js";
import {
  InvalidConnectionUrlError,
  NO_AGREED_DATABASE_NAME,
  agreedDatabaseNameOf,
  databaseNameOf,
  openDatabase,
  openDatabaseSession,
  parseConnectionUrl,
} from "../src/open-database.js";
import type { ConnectionVariableName } from "../src/open-database.js";
import { isTransientFailure } from "../src/retry-on-transient-failure.js";
import { assertSafeTestDatabaseUrl } from "../src/test-database-url.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";

/**
 * Adversarial QA of M8 wave 8B: the opener against the driver, over swept strings. `neon()` and `new Client()` only
 * parse their argument here; nothing is queried or connected.
 */
const QA_PASSWORD = "FAKEPASSWORD_QA8B";
const QA_USER = "fakeuser_QA8B";
const QA_HOST = "fakehost-qa8b.invalid";
const QA_MARKERS: readonly string[] = [QA_PASSWORD, QA_USER, QA_HOST];
const FAKE_DATABASE = "lemn-fake-db";
const LISTED_NAMES: readonly string[] = [
  ...DATABASE_NAMES_BY_ENVIRONMENT.values(),
].flat();

const VARIABLES: readonly ConnectionVariableName[] = [
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "TEST_DATABASE_URL",
];

const FRAGMENTS: readonly string[] = [
  "postgres://",
  "postgresql://",
  "POSTGRES://",
  "postgres:",
  "mysql://",
  QA_USER,
  QA_PASSWORD,
  QA_HOST,
  FAKE_DATABASE,
  ...LISTED_NAMES,
  "..",
  "\t",
  "'",
  ":",
  "@",
  "/",
  "?",
  "#",
  "%ZZ",
  "%2F",
  "%",
  " ",
  "[",
  "]",
  "\\",
  "\n",
  "5432",
  "notaport",
  "sslmode=require",
];

const assembledValue = fc
  .array(fc.oneof(fc.constantFrom(...FRAGMENTS), fc.string({ maxLength: 3 })), {
    maxLength: 14,
  })
  .map((parts) => parts.join(""));

const nearlyWellFormedValue = fc
  .record({
    scheme: fc.constantFrom(
      "postgres://",
      "postgresql://",
      "postgres:",
      "mysql://",
    ),
    user: fc.constantFrom(
      QA_USER,
      "",
      `${QA_USER}%ZZ`,
      `${QA_USER}%40`,
      `a@b\\${QA_USER}`,
    ),
    password: fc.constantFrom(
      `:${QA_PASSWORD}`,
      ":",
      "",
      `:${QA_PASSWORD}%ZZ`,
      `:x@${QA_PASSWORD}`,
      `:1/${QA_PASSWORD}`,
    ),
    host: fc.constantFrom(
      QA_HOST,
      "",
      `${QA_HOST}:5432`,
      `${QA_HOST}:notaport`,
      `${QA_HOST}'x`,
    ),
    path: fc.constantFrom(
      `/${FAKE_DATABASE}`,
      "",
      "/",
      "/%ZZ",
      "?sslmode=x",
      ...LISTED_NAMES.map((name) => `/${name}`),
      ...LISTED_NAMES.map((name) => `/x/../${name}`),
      ...LISTED_NAMES.map((name) => `/${name.slice(0, 4)}\t${name.slice(4)}`),
      ...LISTED_NAMES.map((name) => `/${name}?dbname=other`),
    ),
  })
  .map(
    ({ scheme, user, password, host, path }) =>
      `${scheme}${user}${password}@${host}${path}`,
  );

const anyValue = fc.oneof(assembledValue, nearlyWellFormedValue);
const SWEEP = { seed: 20261007, numRuns: 3000 };

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function isAcceptedByTheOpener(value: string): boolean {
  return thrownBy(() => openDatabase(value)) === undefined;
}

/** The string as `neon()` re-reads it: under `http:`, which is why it takes forms a `postgres:` parse does not. */
function reparsedAsTheHttpDriverDoes(value: string): URL {
  return new URL(`http:${value.substring(new URL(value).protocol.length)}`);
}

function lacksTheTwoSlashes(value: string): boolean {
  const schemeLength = new URL(value).protocol.length;
  return value.substring(schemeLength, schemeLength + 2) !== "//";
}

function nameTheHttpDriverParses(value: string): string {
  return decodeURIComponent(
    reparsedAsTheHttpDriverDoes(value).pathname,
  ).replace(/^\//, "");
}

function nameAsWritten(value: string): string {
  return new URL(value).pathname.replace(/^\//, "");
}

/** Rule B9's three readers, each asked directly: the string as written, the HTTP re-reading, the session driver. */
function readingsOfTheNameDisagree(value: string): boolean {
  const names = new Set([
    nameAsWritten(value),
    nameTheHttpDriverParses(value),
    sessionDriverNameOrNone(value),
  ]);
  return names.size > 1;
}

function sessionDriverNameOrNone(value: string): unknown {
  try {
    return new Client(value).database;
  } catch {
    return Symbol("the session driver refused the string");
  }
}

function namesNoDatabase(value: string): boolean {
  return nameTheHttpDriverParses(value) === "";
}

describe("the opener over a sweep of assembled strings (criteria 2, 5, 7 and 8)", () => {
  it("accepts no string the driver refuses, by either entry point, so the driver's echoing error is unreachable", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        fc.pre(isAcceptedByTheOpener(value));

        expect(thrownBy(() => neon(value))).toBeUndefined();
        expect(thrownBy(() => new Client(value))).toBeUndefined();
      }),
      SWEEP,
    );
  });

  it("refuses, beyond what neon() refuses, only a string with no //, with no database name, or on which the readings of the name disagree (rules B7 and B9)", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        fc.pre(thrownBy(() => neon(value)) === undefined);
        fc.pre(!isAcceptedByTheOpener(value));

        expect(
          lacksTheTwoSlashes(value) ||
            namesNoDatabase(value) ||
            readingsOfTheNameDisagree(value),
        ).toBe(true);
      }),
      SWEEP,
    );
  });

  it("refuses a string whose name a backslash makes the drivers read differently, the form QA12 found (rule B9)", () => {
    const value = `postgres://a@b\\${QA_USER}:${QA_PASSWORD}@${QA_HOST}/lemnaria_test`;

    expect(thrownBy(() => neon(value))).toBeUndefined();
    expect(readingsOfTheNameDisagree(value)).toBe(true);
    for (const open of [openDatabase, openDatabaseSession])
      expect(thrownBy(() => open(value))).toBeInstanceOf(
        InvalidConnectionUrlError,
      );
  });

  it.each([
    ["no database", "postgresql://u@h"],
    ["an empty database after the slash", "postgresql://u@h/"],
    ["one slash after the scheme", "postgres:/u:p@h/db"],
    ["no slash after the scheme", "postgres:u:p@h/db"],
  ])("refuses %s, a form the driver takes (rule B7)", (_form, value) => {
    expect(thrownBy(() => neon(value))).toBeUndefined();
    for (const open of [openDatabase, openDatabaseSession])
      expect(thrownBy(() => open(value))).toBeInstanceOf(
        InvalidConnectionUrlError,
      );
  });

  it("gives no name, and so refuses everywhere, a string the session driver cannot be constructed from (rule B9, fail-closed)", () => {
    const value =
      `postgres://${QA_USER}:${QA_PASSWORD}@${QA_HOST}/lemnaria_test` +
      `?sslrootcert=/qa-8b-no-such-directory/root.pem`;

    expect(thrownBy(() => new Client(value))).toBeDefined();
    expect(nameAsWritten(value)).toBe("lemnaria_test");
    expect(nameTheHttpDriverParses(value)).toBe("lemnaria_test");
    expect(agreedDatabaseNameOf(value)).toBe(NO_AGREED_DATABASE_NAME);
    expect(thrownBy(() => openDatabase(value))).toBeInstanceOf(
      InvalidConnectionUrlError,
    );
    expect(
      markersFoundOn(
        thrownBy(() => openDatabase(value)),
        QA_MARKERS,
      ),
    ).toEqual([]);
    expect(() => {
      assertSafeTestDatabaseUrl(value);
    }).toThrow(/not one of the databases this repository allows/);
  });

  it("compares the one database name both drivers would use, for every accepted string (rule B9)", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        fc.pre(isAcceptedByTheOpener(value));
        const comparedName = databaseNameOf(value);

        expect(new Client(value).database).toBe(comparedName);
        expect(nameTheHttpDriverParses(value)).toBe(comparedName);
        expect(nameAsWritten(value)).toBe(comparedName);
      }),
      SWEEP,
    );
  });

  it("accepts strings that name a listed database, so the comparison above is made on names that matter", () => {
    const acceptedNames = fc
      .sample(anyValue, SWEEP)
      .filter(isAcceptedByTheOpener)
      .map(databaseNameOf);

    for (const listedName of LISTED_NAMES)
      expect(acceptedNames).toContain(listedName);
  });

  it("accepts some of the swept strings and refuses others, so the sweep reaches both sides", () => {
    const verdicts = fc
      .sample(anyValue, SWEEP)
      .map(
        (value) =>
          thrownBy(() => openDatabase(value, "DATABASE_URL")) === undefined,
      );

    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });

  it.each(VARIABLES)(
    "throws nothing but the one refusal for %s: the same message for every value, no marker, no cause, no extra property",
    (variableName) => {
      const refusal = new InvalidConnectionUrlError(variableName);
      fc.assert(
        fc.property(anyValue, (value) => {
          for (const open of [
            openDatabase,
            openDatabaseSession,
            parseConnectionUrl,
          ]) {
            const error = thrownBy(() => open(value, variableName));
            if (error === undefined) continue;

            expect(error).toBeInstanceOf(InvalidConnectionUrlError);
            expect((error as Error).message).toBe(refusal.message);
            expect(Object.getOwnPropertyNames(error).sort()).toEqual(
              Object.getOwnPropertyNames(refusal).sort(),
            );
            expect(Object.getOwnPropertySymbols(error)).toEqual([]);
            expect(markersFoundOn(error, QA_MARKERS)).toEqual([]);
          }
        }),
        SWEEP,
      );
    },
  );

  it("names only its own variable in the refusal, never another connection variable", () => {
    for (const variableName of VARIABLES) {
      const { message } = new InvalidConnectionUrlError(variableName);
      const others = VARIABLES.filter((other) => other !== variableName);

      expect(message.startsWith(`${variableName} `)).toBe(true);
      // DATABASE_URL is a suffix of the other two names, so the others are removed before it is looked for.
      const withoutOwnName = message.replace(variableName, "");
      for (const other of others) expect(withoutOwnName).not.toContain(other);
    }
  });

  it("replaces what new Client() itself throws for a string the shape check lets through", () => {
    const value =
      `postgres://${QA_USER}:${QA_PASSWORD}@${QA_HOST}/${FAKE_DATABASE}` +
      `?sslrootcert=/qa-8b-no-such-directory/${QA_PASSWORD}.pem`;

    const error = thrownBy(() =>
      openDatabaseSession(value, "MIGRATION_DATABASE_URL"),
    );

    expect(error).toBeInstanceOf(InvalidConnectionUrlError);
    expect(markersFoundOn(error, QA_MARKERS)).toEqual([]);
    expect(error).not.toHaveProperty("cause");
  });
});

describe("the driver's error is recognised by its class, now that the opener answers for the retry helper (rule B5, ADR 0145)", () => {
  const RETRYABLE_PAYLOAD =
    'Server error (HTTP status 500): {"message":"x","neon:retryable":true}';

  function renamed(error: Error, name: string): Error {
    error.name = name;
    return error;
  }

  it("retries the driver's own error with the retryable payload, whatever its name says", () => {
    expect(isTransientFailure(new NeonDbError(RETRYABLE_PAYLOAD))).toBe(true);
    expect(
      isTransientFailure(renamed(new NeonDbError(RETRYABLE_PAYLOAD), "Other")),
    ).toBe(true);
  });

  it.each<[string, unknown]>([
    [
      "an Error that only carries the driver's name",
      renamed(new Error(RETRYABLE_PAYLOAD), "NeonDbError"),
    ],
    [
      "an object shaped like the driver's error",
      { name: "NeonDbError", message: RETRYABLE_PAYLOAD },
    ],
    ["a plain Error", new Error(RETRYABLE_PAYLOAD)],
    ["the payload as a string", RETRYABLE_PAYLOAD],
  ])("does not retry %s", (_what, error) => {
    expect(isTransientFailure(error)).toBe(false);
  });
});
