import { fc } from "@fast-check/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DATABASE_NAMES_BY_ENVIRONMENT,
  assertDeclaredEnvironmentReaches,
  printListedDatabaseName,
  printReachedDatabaseName,
} from "../src/migration-target.js";
import { databaseNameOf } from "../src/open-database.js";
import {
  ALLOWED_TEST_DATABASE_NAMES,
  UNLISTED_DATABASE,
  assertSafeTestDatabaseUrl,
} from "../src/test-database-url.js";
import {
  FAKE_HOST,
  FAKE_PASSWORD,
  FAKE_USER,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";

/**
 * Rule B2: nothing a refusal, a message or a printed line says is text taken from a connection value. Observed as a
 * property: two values that give the same comparisons give byte-identical output, whatever else they hold.
 */
const SWEEP = { seed: 20261008, numRuns: 1_500 };

const FRAGMENTS: readonly string[] = [
  FAKE_USER,
  FAKE_PASSWORD,
  FAKE_HOST,
  "lemn-fake-db",
  ":",
  "@",
  "/",
  "?",
  "#",
  "5432",
  ".",
  "-",
  "_",
  "x",
];

const arbitraryText = fc
  .array(fc.oneof(fc.constantFrom(...FRAGMENTS), fc.string({ maxLength: 4 })), {
    maxLength: 10,
  })
  .map((parts) => parts.join(""));

const LISTED_NAMES: readonly string[] = [
  ...DATABASE_NAMES_BY_ENVIRONMENT.values(),
].flat();
const ENVIRONMENTS = ["production", "preview", "test", "adhoc-label"];

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
  return "no error";
}

describe("the environment check's refusals (B2)", () => {
  const isOrdinaryUnlistedName = (name: string): boolean =>
    !LISTED_NAMES.includes(name) &&
    !/[%\\]/.test(name) &&
    name !== "" &&
    !name.startsWith("<");

  it.each(ENVIRONMENTS)(
    "say the same thing for every unlisted database name, whatever it holds, under %s",
    (environment) => {
      const messages = new Set<string>();
      fc.assert(
        fc.property(arbitraryText.filter(isOrdinaryUnlistedName), (name) => {
          const message = messageOf(() => {
            assertDeclaredEnvironmentReaches({
              environment,
              databaseName: name,
            });
          });
          if (message !== "no error") messages.add(message);
          expect(markersFoundOn(message)).toEqual([]);
        }),
        SWEEP,
      );

      expect(messages.size).toBe(1);
    },
  );

  it("says the same thing for every name holding a % or a backslash, whatever else it holds", () => {
    const messages = new Set<string>();
    fc.assert(
      fc.property(
        arbitraryText.map((text) => `${text}%`),
        (name) => {
          messages.add(
            messageOf(() => {
              assertDeclaredEnvironmentReaches({
                environment: "preview",
                databaseName: name,
              });
            }),
          );
          expect(markersFoundOn([...messages].join("\n"))).toEqual([]);
        },
      ),
      SWEEP,
    );

    expect(messages.size).toBe(1);
  });

  it("prints a listed name, from the list, and nothing from the value", () => {
    for (const listedName of LISTED_NAMES) {
      const message = messageOf(() => {
        assertDeclaredEnvironmentReaches({
          environment: "adhoc-label",
          databaseName: listedName,
        });
      });

      expect(message).toContain(`"${listedName}"`);
    }
  });
});

describe("the names a printed line may carry (B2)", () => {
  it("prints exactly the placeholder for any name that is not listed, whatever it holds", () => {
    fc.assert(
      fc.property(
        arbitraryText.filter((name) => !LISTED_NAMES.includes(name)),
        (name) => {
          expect(printListedDatabaseName(name)).toBe(UNLISTED_DATABASE);
        },
      ),
      SWEEP,
    );
  });

  it.each(LISTED_NAMES)("prints the listed name %s as itself", (name) => {
    expect(printListedDatabaseName(name)).toBe(name);
  });

  it("prints a database name taken from any URL only if it is listed", () => {
    fc.assert(
      fc.property(arbitraryText, (text) => {
        const printed = printListedDatabaseName(
          databaseNameOf(`postgres://${text}`),
        );

        expect([...LISTED_NAMES, UNLISTED_DATABASE]).toContain(printed);
      }),
      SWEEP,
    );
  });

  it("prints the operator's own label for an unclaimed name the label matches, and the placeholder for any other", () => {
    fc.assert(
      fc.property(arbitraryText, arbitraryText, (name, label) => {
        const printed = printReachedDatabaseName({
          databaseName: name,
          environment: label,
        });

        const expected = LISTED_NAMES.includes(name)
          ? name
          : name === label
            ? label
            : UNLISTED_DATABASE;
        expect(printed).toBe(expected);
      }),
      SWEEP,
    );
  });
});

describe("the isolation guard's refusals (B2)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const textWithoutPathCharacters = arbitraryText.filter(
    (text) => !/[/?#]/.test(text),
  );

  const arbitraryUrl = (databaseName: fc.Arbitrary<string>) =>
    fc
      .record({
        scheme: fc.constantFrom("postgres://", "postgresql://"),
        user: textWithoutPathCharacters,
        password: textWithoutPathCharacters,
        host: textWithoutPathCharacters,
        port: fc.constantFrom("", ":5432", ":6543"),
        databaseName,
      })
      .map(
        ({ scheme, user, password, host, port, databaseName: name }) =>
          `${scheme}${user}:${password}@${host}${port}/${name}`,
      );

  it("say one thing for every connection string whose database name is not allowlisted, and name nothing of it", () => {
    vi.stubEnv("DATABASE_URL", "");
    const messages = new Set<string>();
    fc.assert(
      fc.property(
        arbitraryUrl(arbitraryText.filter((name) => !/[/?#]/.test(name))),
        (url) => {
          const message = messageOf(() => {
            assertSafeTestDatabaseUrl(url);
          });
          messages.add(message);
          expect(markersFoundOn(message)).toEqual([]);
        },
      ),
      SWEEP,
    );

    expect(messages.size).toBeLessThanOrEqual(2);
    expect(
      [...messages].filter((message) => message.startsWith("Error: Refusing")),
    ).toHaveLength(1);
  });

  it("say one thing for every allowlisted name that is also the application's, whatever the hosts and credentials", () => {
    const [allowlistedName] = ALLOWED_TEST_DATABASE_NAMES as [string];
    const messages = new Set<string>();
    fc.assert(
      fc.property(
        arbitraryUrl(fc.constant(allowlistedName)),
        arbitraryUrl(fc.constant(allowlistedName)),
        (testUrl, applicationUrl) => {
          vi.stubEnv("DATABASE_URL", applicationUrl);
          const message = messageOf(() => {
            assertSafeTestDatabaseUrl(testUrl);
          });
          messages.add(message);
          expect(markersFoundOn(message)).toEqual([]);
        },
      ),
      SWEEP,
    );

    const refusals = [...messages].filter((message) =>
      message.startsWith("Error: Refusing"),
    );
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain(`"${allowlistedName}"`);
  });
});
