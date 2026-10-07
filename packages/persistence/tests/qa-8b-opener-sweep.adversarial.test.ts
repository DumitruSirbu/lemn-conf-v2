import { fc } from "@fast-check/vitest";
import { Client, NeonDbError, neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import {
  InvalidConnectionUrlError,
  agreedDatabaseNameOf,
  databaseNameOf,
  openDatabase,
  openDatabaseSession,
  parseConnectionUrl,
} from "../src/open-database.js";
import type {
  ConnectionRefusal,
  ConnectionVariableName,
} from "../src/open-database.js";
import { isTransientFailure } from "../src/retry-on-transient-failure.js";
import { assertSafeTestDatabaseUrl } from "../src/test-database-url.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";
import {
  FAKE_DATABASE,
  QA_HOST,
  QA_MARKERS,
  QA_PASSWORD,
  QA_USER,
} from "./support/qa-8b-connection-values.js";
import { LISTED_NAMES, SWEEP, anyValue } from "./support/qa-8b-swept-values.js";

/**
 * The two entry points against the consumers of a connection string, over swept strings: the query driver and the
 * request header it puts the raw string in, and the session client. Each consumer is asked by doing what the driver
 * does; nothing is queried or connected. Using an accepted string is `qa-8b-query-through.adversarial.test.ts`.
 */
const VARIABLES: readonly ConnectionVariableName[] = [
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "TEST_DATABASE_URL",
];
const REFUSALS: readonly ConnectionRefusal[] = [
  "shape",
  "request header",
  "session client",
];
const CONNECTION_STRING_HEADER = "Neon-Connection-String";

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

function refuses(run: () => unknown): boolean {
  return thrownBy(run) !== undefined;
}

const isRefusedForQueries = (value: string): boolean =>
  refuses(() => openDatabase(value));
const isRefusedForASession = (value: string): boolean =>
  refuses(() => openDatabaseSession(value));

const theQueryDriverRefuses = (value: string): boolean =>
  refuses(() => neon(value));
const theRequestHeaderRefuses = (value: string): boolean =>
  refuses(() => new Headers({ [CONNECTION_STRING_HEADER]: value }));
const theSessionClientRefuses = (value: string): boolean =>
  refuses(() => new Client(value));

/** The string as `neon()` re-reads it: under `http:`, which is why it takes forms a `postgres:` parse does not. */
function reparsedAsTheQueryDriverDoes(value: string): URL {
  return new URL(`http:${value.substring(new URL(value).protocol.length)}`);
}

function nameTheQueryDriverParses(value: string): string {
  return decodeURIComponent(
    reparsedAsTheQueryDriverDoes(value).pathname,
  ).replace(/^\//, "");
}

function nameAsWritten(value: string): string {
  return new URL(value).pathname.replace(/^\//, "");
}

function lacksTheTwoSlashes(value: string): boolean {
  const schemeLength = new URL(value).protocol.length;
  return value.substring(schemeLength, schemeLength + 2) !== "//";
}

/** Not a `postgres://` or `postgresql://` URL with the two slashes, a user, a host and a database name. */
function isNotTheAcceptedShape(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    const { username, password, hostname } =
      reparsedAsTheQueryDriverDoes(value);
    decodeURIComponent(password);
    return (
      (protocol !== "postgres:" && protocol !== "postgresql:") ||
      lacksTheTwoSlashes(value) ||
      decodeURIComponent(username) === "" ||
      hostname === "" ||
      nameTheQueryDriverParses(value) === ""
    );
  } catch {
    return true;
  }
}

/** Two readers that both take the string name different databases. A reader that refuses it is not one of them. */
function readersOfTheNameDisagree(value: string): boolean {
  const written = nameAsWritten(value);
  if (written !== nameTheQueryDriverParses(value)) return true;
  return (
    !theSessionClientRefuses(value) && new Client(value).database !== written
  );
}

function hasNoUsableName(value: string): boolean {
  return isNotTheAcceptedShape(value) || readersOfTheNameDisagree(value);
}

describe("each entry point refuses a string exactly when the shape, the readers of its name or one of its own consumers refuses it", () => {
  it("for queries: the shape, the name, neon() or the request header", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const expected =
          hasNoUsableName(value) ||
          theQueryDriverRefuses(value) ||
          theRequestHeaderRefuses(value);

        expect(isRefusedForQueries(value)).toBe(expected);
      }),
      SWEEP,
    );
  });

  it("for a session: the shape, the name or the session client", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const expected =
          hasNoUsableName(value) || theSessionClientRefuses(value);

        expect(isRefusedForASession(value)).toBe(expected);
      }),
      SWEEP,
    );
  });

  it("reaches every side: strings each entry point takes, and strings each consumer alone refuses", () => {
    const usable = fc
      .sample(anyValue, SWEEP)
      .filter((value) => !hasNoUsableName(value));

    expect(usable.some((value) => !isRefusedForQueries(value))).toBe(true);
    expect(usable.some((value) => !isRefusedForASession(value))).toBe(true);
    expect(usable.some(theRequestHeaderRefuses)).toBe(true);
    expect(usable.some(theSessionClientRefuses)).toBe(true);
    expect(
      usable.some(
        (value) => isRefusedForQueries(value) && !isRefusedForASession(value),
      ),
    ).toBe(true);
    expect(
      usable.some(
        (value) => !isRefusedForQueries(value) && isRefusedForASession(value),
      ),
    ).toBe(true);
  });
});

describe("the database name this package compares is the one the driver behind each entry point would use", () => {
  it("for every string accepted for queries", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        fc.pre(!isRefusedForQueries(value));
        const comparedName = databaseNameOf(value);

        expect(nameTheQueryDriverParses(value)).toBe(comparedName);
        expect(nameAsWritten(value)).toBe(comparedName);
      }),
      SWEEP,
    );
  });

  it("for every string accepted for a session", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        fc.pre(!isRefusedForASession(value));

        expect(new Client(value).database).toBe(databaseNameOf(value));
      }),
      SWEEP,
    );
  });

  it("is compared on names that matter: every listed database is named by an accepted string", () => {
    const acceptedNames = fc
      .sample(anyValue, SWEEP)
      .filter((value) => !isRefusedForQueries(value))
      .map(databaseNameOf);

    for (const listedName of LISTED_NAMES)
      expect(acceptedNames).toContain(listedName);
  });
});

describe("a refusal says which variable and which of three reasons, and nothing of the value", () => {
  it.each(VARIABLES)(
    "for %s: one of three constant sentences, no marker, no cause, no extra property",
    (variableName) => {
      const sentences = REFUSALS.map(
        (refusal) =>
          new InvalidConnectionUrlError(variableName, refusal).message,
      );
      const template = new InvalidConnectionUrlError(variableName);
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
            expect(sentences).toContain((error as Error).message);
            expect(Object.getOwnPropertyNames(error).sort()).toEqual(
              Object.getOwnPropertyNames(template).sort(),
            );
            expect(Object.getOwnPropertySymbols(error)).toEqual([]);
            expect(markersFoundOn(error, QA_MARKERS)).toEqual([]);
          }
        }),
        SWEEP,
      );
    },
  );

  it("names only its own variable, never another connection variable", () => {
    for (const variableName of VARIABLES)
      for (const refusal of REFUSALS) {
        const { message } = new InvalidConnectionUrlError(
          variableName,
          refusal,
        );
        const others = VARIABLES.filter((other) => other !== variableName);

        expect(message.startsWith(`${variableName} `)).toBe(true);
        // DATABASE_URL is a suffix of the other two names, so the others are removed before it is looked for.
        const withoutOwnName = message.replace(variableName, "");
        for (const other of others) expect(withoutOwnName).not.toContain(other);
      }
  });
});

describe("strings pinned by name", () => {
  const withInThePassword = (character: string): string =>
    `postgresql://${QA_USER}:FAKEHEAD${character}FAKETAIL@${QA_HOST}/lemnaria_test?sslmode=require`;
  const PLAIN = withInThePassword("");
  const WITH_A_ROOT_CERTIFICATE = `postgresql://${QA_USER}:${QA_PASSWORD}@${QA_HOST}/lemnaria_test?sslrootcert=/qa-8b-no-such-directory/root.pem`;

  const A_HEADER_CANNOT_CARRY_IT = /cannot be sent to the query endpoint/;
  const THE_SESSION_CLIENT_WILL_NOT_BUILD_IT =
    /not one the migration session client will build/;

  function refusalOf(run: () => unknown): string {
    const error = thrownBy(run);
    expect(error).toBeInstanceOf(InvalidConnectionUrlError);
    expect(
      markersFoundOn(error, [...QA_MARKERS, "FAKEHEAD", "FAKETAIL"]),
    ).toEqual([]);
    return (error as Error).message;
  }

  it.each([
    ["an interior line feed", "\n"],
    ["an interior carriage return", "\r"],
    ["an interior NUL", "\u0000"],
    ["a character above U+00FF", "Ā"],
    ["a character outside the basic plane", "😀"],
  ])(
    "refuses %s for queries, saying a header cannot carry it, which the header itself confirms",
    (_what, character) => {
      const value = withInThePassword(character);

      expect(theRequestHeaderRefuses(value)).toBe(true);
      expect(theQueryDriverRefuses(value)).toBe(false);
      expect(refusalOf(() => openDatabase(value))).toMatch(
        A_HEADER_CANNOT_CARRY_IT,
      );
    },
  );

  it.each([
    ["an interior line feed", "\n"],
    ["an interior carriage return", "\r"],
    ["an interior NUL", "\u0000"],
    ["a character above U+00FF", "Ā"],
  ])(
    "accepts %s for a session, whose client parses the string into fields and takes it",
    (_what, character) => {
      const value = withInThePassword(character);

      expect(theSessionClientRefuses(value)).toBe(false);
      expect(isRefusedForASession(value)).toBe(false);
    },
  );

  it.each([
    ["a trailing line feed", `${PLAIN}\n`],
    ["a trailing carriage return and line feed", `${PLAIN}\r\n`],
    ["a Latin-1 letter", withInThePassword("é")],
    ["a tab", withInThePassword("\t")],
    ["a space", withInThePassword(" ")],
    ["a DEL", withInThePassword("\u007f")],
  ])("accepts %s by both entry points", (_what, value) => {
    expect(isRefusedForQueries(value)).toBe(false);
    expect(isRefusedForASession(value)).toBe(false);
  });

  it("accepts a string with sslrootcert for queries and refuses it for a session, saying the session client will not build it, which that client confirms", () => {
    expect(theSessionClientRefuses(WITH_A_ROOT_CERTIFICATE)).toBe(true);
    expect(theRequestHeaderRefuses(WITH_A_ROOT_CERTIFICATE)).toBe(false);
    expect(theQueryDriverRefuses(WITH_A_ROOT_CERTIFICATE)).toBe(false);

    expect(isRefusedForQueries(WITH_A_ROOT_CERTIFICATE)).toBe(false);
    expect(agreedDatabaseNameOf(WITH_A_ROOT_CERTIFICATE)).toBe("lemnaria_test");
    expect(
      refusalOf(() =>
        openDatabaseSession(WITH_A_ROOT_CERTIFICATE, "MIGRATION_DATABASE_URL"),
      ),
    ).toMatch(THE_SESSION_CLIENT_WILL_NOT_BUILD_IT);
  });

  it("refuses by every entry point a string none of that entry point's consumers can take", () => {
    const noConsumerTakesIt = `postgresql://${QA_USER}:FAKEHEAD\nFAKETAIL@${QA_HOST}/lemnaria_test?sslrootcert=/qa-8b-no-such-directory/root.pem`;

    expect(theRequestHeaderRefuses(noConsumerTakesIt)).toBe(true);
    expect(theSessionClientRefuses(noConsumerTakesIt)).toBe(true);
    expect(refusalOf(() => openDatabase(noConsumerTakesIt))).toMatch(
      A_HEADER_CANNOT_CARRY_IT,
    );
    expect(refusalOf(() => openDatabaseSession(noConsumerTakesIt))).toMatch(
      THE_SESSION_CLIENT_WILL_NOT_BUILD_IT,
    );
  });

  it("lets the isolation guard read the name of a string only a session refuses: nothing that refuses it can connect with it", () => {
    expect(() => {
      assertSafeTestDatabaseUrl(WITH_A_ROOT_CERTIFICATE);
    }).not.toThrow();
  });

  it("refuses a string whose name a backslash makes the drivers read differently", () => {
    const value = `postgres://a@b\\${QA_USER}:${QA_PASSWORD}@${QA_HOST}/lemnaria_test`;

    expect(theQueryDriverRefuses(value)).toBe(false);
    expect(readersOfTheNameDisagree(value)).toBe(true);
    expect(isRefusedForQueries(value)).toBe(true);
    expect(isRefusedForASession(value)).toBe(true);
  });

  it.each([
    ["no database", "postgresql://u@h"],
    ["an empty database after the slash", "postgresql://u@h/"],
    ["one slash after the scheme", "postgres:/u:p@h/db"],
    ["no slash after the scheme", "postgres:u:p@h/db"],
  ])("refuses %s, a form the query driver takes", (_form, value) => {
    expect(theQueryDriverRefuses(value)).toBe(false);
    expect(isRefusedForQueries(value)).toBe(true);
    expect(isRefusedForASession(value)).toBe(true);
  });

  it("replaces what the session client itself throws with a refusal that keeps none of it", () => {
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

describe("the driver's error is recognised by its class, not by its name", () => {
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
