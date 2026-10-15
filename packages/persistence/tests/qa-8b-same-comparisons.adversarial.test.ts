import { inspect } from "node:util";

import { fc } from "@fast-check/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { describeMigrationFailure } from "../src/migrate.js";
import { describeStatusFailure } from "../src/migrate-status.js";
import {
  DATABASE_NAMES_BY_ENVIRONMENT,
  assertDeclaredEnvironmentReaches,
  printReachedDatabaseName,
} from "../src/migration-target.js";
import { databaseNameOf, openDatabase } from "../src/open-database.js";
import { assertSafeTestDatabaseUrl } from "../src/test-database-url.js";
import {
  QA_HOST,
  QA_MARKERS,
  QA_PASSWORD,
  QA_USER,
  markersReachableFrom,
} from "./support/qa-8b-connection-values.js";

/**
 * Nothing this package says is copied out of a connection value, observed as: two values that give the same
 * comparisons (the same shape verdict, and the same listed database name or both unlisted) give byte-identical output.
 * Each case builds twins that share a form and a name class and differ in everything else, and compares all this
 * package says about each.
 * Nothing connects: only refusals and printed lines are read.
 */
const SWEEP = { seed: 20261008, numRuns: 2_000 };

const LISTED_NAMES: readonly string[] = [
  ...DATABASE_NAMES_BY_ENVIRONMENT.values(),
].flat();

/** Unlisted, and none holds a `%`, a backslash or a character `URL` percent-encodes: the environment check compares for
 *  those and answers differently. */
const UNLISTED_NAMES: readonly string[] = [
  "neondb",
  "lemnaria_test2",
  "LEMNARIA_TEST",
  "Lemn-Conf-V2",
  "lemnaria_test/",
  "lemnaria_test.",
  "lemnaria_test_",
  "x/lemn-conf-v2",
  QA_PASSWORD,
  `${QA_USER}:${QA_PASSWORD}@${QA_HOST}`,
  "a".repeat(200),
];

interface Secrets {
  readonly user: string;
  readonly password: string;
  readonly host: string;
  readonly port: string;
  readonly query: string;
}

const secrets: fc.Arbitrary<Secrets> = fc.record({
  user: fc.constantFrom(QA_USER, "other_user", "u"),
  password: fc.constantFrom(QA_PASSWORD, "otherpw", "p", "a-much-longer-pw"),
  host: fc.constantFrom(QA_HOST, "other-host.invalid", "ep-x-pooler.invalid"),
  port: fc.constantFrom("", ":5432", ":6543"),
  query: fc.constantFrom("", "?sslmode=require", "?options=x"),
});

type Form = (parts: Secrets, databaseName: string) => string;

/** Ways of writing the value. Twins share one, so they share whatever it does to the parse. */
const FORMS: readonly Form[] = [
  ({ user, password, host, port, query }, name) =>
    `postgres://${user}:${password}@${host}${port}/${name}${query}`,
  ({ user, password, host, port, query }, name) =>
    `postgresql://${user}:${password}@${host}${port}/${name}${query}`,
  ({ user, password, host }, name) =>
    `postgres://${user}:123/${password}@${host}/${name}`,
  ({ user, password, host }, name) =>
    `postgres://${user}:/${password}@${host}/${name}`,
  ({ user, password, host }, name) =>
    `postgres:/${user}:${password}@${host}/${name}`,
  ({ user, password, host }, name) =>
    `postgres:${user}:${password}@${host}/${name}`,
  ({ user, password, host }, name) =>
    `jdbc:postgresql://${user}:${password}@${host}/${name}`,
  ({ user, password, host }, name) =>
    `mysql://${user}:${password}@${host}/${name}`,
  ({ user, password, host }, name) =>
    `postgres://${user}:${password}@${host}:notaport/${name}`,
  ({ user, password, host }, name) => `${password} ${host} ${user} ${name}`,
];

interface Twins {
  readonly first: string;
  readonly second: string;
}

/** Twins that share a form and name one listed database, or two names that are both unlisted. */
const twins: fc.Arbitrary<Twins> = fc
  .record({
    form: fc.constantFrom(...FORMS),
    names: fc.oneof(
      fc.constantFrom(...LISTED_NAMES).map((name) => [name, name] as const),
      fc.tuple(
        fc.constantFrom(...UNLISTED_NAMES),
        fc.constantFrom(...UNLISTED_NAMES),
      ),
    ),
    firstSecrets: secrets,
    secondSecrets: secrets,
  })
  .map(({ form, names, firstSecrets, secondSecrets }) => ({
    first: form(firstSecrets, names[0]),
    second: form(secondSecrets, names[1]),
  }));

/** An error as everything a reader can take from it, apart from the stack, which names only this package's files. */
function described(run: () => unknown): string {
  try {
    return `returned ${inspect(run())}`;
  } catch (error) {
    const { name, message, cause } = error as Error;
    const ownKeys = Reflect.ownKeys(error as object).filter(
      (key) => key !== "stack",
    );
    return inspect({ name, message, cause, ownKeys }, { depth: null });
  }
}

function isRefusedByTheOpener(connectionUrl: string): boolean {
  try {
    openDatabase(connectionUrl, "DATABASE_URL");
    return false;
  } catch {
    return true;
  }
}

const DECLARED_ENVIRONMENTS = ["production", "preview", "test", "adhoc-label"];

/** Everything the two CLIs say about a value before they connect, under each declared environment. */
function cliOutputFor(connectionUrl: string): string {
  return DECLARED_ENVIRONMENTS.map((environment) => {
    const databaseName = databaseNameOf(connectionUrl);
    try {
      assertDeclaredEnvironmentReaches({ environment, databaseName });
    } catch (error) {
      return [
        describeMigrationFailure(error),
        describeStatusFailure(error),
      ].join("\n");
    }
    return `passes as ${printReachedDatabaseName({ databaseName, environment })}`;
  }).join("\n");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("two values that give the same comparisons give byte-identical output", () => {
  it("the twins generator yields values the opener accepts and values it refuses", () => {
    const verdicts = fc
      .sample(twins, SWEEP)
      .map(({ first }) => isRefusedByTheOpener(first));

    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });

  it("at the opener: the same verdict", () => {
    fc.assert(
      fc.property(twins, ({ first, second }) => {
        expect(isRefusedByTheOpener(first)).toBe(isRefusedByTheOpener(second));
        expect(described(() => openDatabase(first, "TEST_DATABASE_URL"))).toBe(
          described(() => openDatabase(second, "TEST_DATABASE_URL")),
        );
      }),
      SWEEP,
    );
  });

  it("at the isolation guard, with the application database named otherwise", () => {
    vi.stubEnv("DATABASE_URL", "postgres://app:apppw@app.invalid/appdb");

    fc.assert(
      fc.property(twins, ({ first, second }) => {
        const output = described(() => {
          assertSafeTestDatabaseUrl(first);
        });

        expect(output).toBe(
          described(() => {
            assertSafeTestDatabaseUrl(second);
          }),
        );
        expect(markersReachableFrom(output, QA_MARKERS)).toEqual([]);
      }),
      SWEEP,
    );
  });

  it("at the isolation guard, when the application's own value is the twin", () => {
    fc.assert(
      fc.property(twins, twins, (testTwins, applicationTwins) => {
        const outputs = [applicationTwins.first, applicationTwins.second].map(
          (applicationUrl) => {
            vi.stubEnv("DATABASE_URL", applicationUrl);
            return described(() => {
              assertSafeTestDatabaseUrl(testTwins.first);
            });
          },
        );

        expect(outputs[0]).toBe(outputs[1]);
        expect(markersReachableFrom(outputs[0], QA_MARKERS)).toEqual([]);
      }),
      SWEEP,
    );
  });

  it("in what the two CLIs print before they connect, under every declared environment", () => {
    fc.assert(
      fc.property(twins, ({ first, second }) => {
        const output = cliOutputFor(first);

        expect(output).toBe(cliOutputFor(second));
        expect(markersReachableFrom(output, QA_MARKERS)).toEqual([]);
      }),
      SWEEP,
    );
  });
});
