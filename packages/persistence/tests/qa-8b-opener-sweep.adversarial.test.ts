import { fc } from "@fast-check/vitest";
import { neon } from "@neondatabase/serverless";
import { describe, expect, it } from "vitest";

import {
  InvalidConnectionUrlError,
  openDatabase,
  openDatabaseSession,
  parseConnectionUrl,
} from "../src/open-database.js";
import type { ConnectionVariableName } from "../src/open-database.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";

/**
 * Adversarial QA of M8 wave 8B: the opener against the driver it replays, over swept strings. `neon()` only parses its
 * argument here; nothing is queried, so nothing connects.
 */
const QA_PASSWORD = "FAKEPASSWORD_QA8B";
const QA_USER = "fakeuser_QA8B";
const QA_HOST = "fakehost-qa8b.invalid";
const QA_MARKERS: readonly string[] = [QA_PASSWORD, QA_USER, QA_HOST];
const FAKE_DATABASE = "lemn-fake-db";

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
    user: fc.constantFrom(QA_USER, "", `${QA_USER}%ZZ`, `${QA_USER}%40`),
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
    ),
    path: fc.constantFrom(`/${FAKE_DATABASE}`, "", "/", "/%ZZ", "?sslmode=x"),
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

describe("the opener over a sweep of assembled strings (criteria 2, 5, 7 and 8)", () => {
  it("refuses exactly the strings neon() itself refuses", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const isRefusedByTheOpener =
          thrownBy(() => openDatabase(value, "DATABASE_URL")) !== undefined;
        const isRefusedByTheDriver = thrownBy(() => neon(value)) !== undefined;

        expect(isRefusedByTheOpener).toBe(isRefusedByTheDriver);
      }),
      SWEEP,
    );
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
