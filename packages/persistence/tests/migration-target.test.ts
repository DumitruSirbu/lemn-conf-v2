import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { MigrationTargetMismatchError } from "../src/migration-errors.js";
import {
  DATABASE_NAMES_BY_ENVIRONMENT,
  assertDeclaredEnvironmentReaches,
  readDeclaredEnvironment,
} from "../src/migration-target.js";
import { databaseNameOf } from "../src/open-database.js";
import { ALLOWED_TEST_DATABASE_NAMES } from "../src/test-database-url.js";

/**
 * `docs/milestones/migration-environment-safety-check.md` AC1–AC5: the pure check both CLIs refuse
 * through, and the argument-reading helper they share. Never a database — this module has no I/O.
 */

const LISTED_ENVIRONMENTS = [...DATABASE_NAMES_BY_ENVIRONMENT.keys()];

/** The names a listed environment may reach, or the empty array for one that is not listed at all —
 *  used only where a test already knows `environment` came from `LISTED_ENVIRONMENTS`. */
function namesOf(environment: string): readonly string[] {
  return DATABASE_NAMES_BY_ENVIRONMENT.get(environment) ?? [];
}

function expectThrowsMismatch(environment: string, databaseName: string): void {
  expect(() => {
    assertDeclaredEnvironmentReaches({ environment, databaseName });
  }).toThrow(MigrationTargetMismatchError);
}

function expectPasses(environment: string, databaseName: string): void {
  expect(() => {
    assertDeclaredEnvironmentReaches({ environment, databaseName });
  }).not.toThrow();
}

describe("DATABASE_NAMES_BY_ENVIRONMENT", () => {
  it("is exactly three entries, held in a Map rather than an object literal", () => {
    expect(DATABASE_NAMES_BY_ENVIRONMENT).toBeInstanceOf(Map);
    expect(LISTED_ENVIRONMENTS.sort()).toEqual([
      "preview",
      "production",
      "test",
    ]);
  });

  it("names production's and preview's one database each", () => {
    expect(DATABASE_NAMES_BY_ENVIRONMENT.get("production")).toEqual([
      "lemn-conf-v2",
    ]);
    expect(DATABASE_NAMES_BY_ENVIRONMENT.get("preview")).toEqual([
      "lemn-conf-v2-preview",
    ]);
  });

  it("lists test's names as the very array ALLOWED_TEST_DATABASE_NAMES is, not a copy of it", () => {
    // toBe, not toEqual: a copy could drift from the allowlist silently (ADR 0102's "second
    // authority"), and only reference identity rules that out.
    expect(DATABASE_NAMES_BY_ENVIRONMENT.get("test")).toBe(
      ALLOWED_TEST_DATABASE_NAMES,
    );
  });

  it("has no staging key", () => {
    expect(DATABASE_NAMES_BY_ENVIRONMENT.has("staging")).toBe(false);
  });
});

describe("assertDeclaredEnvironmentReaches — a listed environment", () => {
  it.each([
    ["production", "lemn-conf-v2"],
    ["preview", "lemn-conf-v2-preview"],
    ["test", "lemnaria_test"],
    ["test", "lemn-conf-v2-staging"],
  ])("passes %s against its own database %s", (environment, databaseName) => {
    expectPasses(environment, databaseName);
  });

  it.each([
    ["production", "lemn-conf-v2-preview"],
    ["preview", "lemn-conf-v2"],
    ["production", ""],
    ["production", "<unparseable connection string>"],
    ["production", "lemn-conf-v2 "],
    ["production", "LEMN-CONF-V2"],
  ])(
    "refuses %s against the mismatched or malformed database %s",
    (environment, databaseName) => {
      expectThrowsMismatch(environment, databaseName);
    },
  );

  it("refuses preview against lemn-conf-v2, the 2026-09-28 incident's exact shape", () => {
    expectThrowsMismatch("preview", "lemn-conf-v2");
  });

  // AC2's property: every listed label refuses every database name that is not its own.
  propertyTest.prop([fc.constantFrom(...LISTED_ENVIRONMENTS), fc.string()], {
    seed: 20260928,
    numRuns: 300,
  })(
    "throws for any name outside the label's own list",
    (environment, databaseName) => {
      fc.pre(!namesOf(environment).includes(databaseName));

      expectThrowsMismatch(environment, databaseName);
    },
  );
});

describe("assertDeclaredEnvironmentReaches — an unlisted label", () => {
  it("passes an ad-hoc restore-drill database declared by its own name", () => {
    expectPasses("restore_drill_2026_08_25", "restore_drill_2026_08_25");
  });

  it("refuses lemn-conf-v2 as a label, and names production", () => {
    expect(() => {
      assertDeclaredEnvironmentReaches({
        environment: "lemn-conf-v2",
        databaseName: "lemn-conf-v2",
      });
    }).toThrow(/production/);
  });

  it("refuses lemn-conf-v2-staging as a label, and names test", () => {
    expect(() => {
      assertDeclaredEnvironmentReaches({
        environment: "lemn-conf-v2-staging",
        databaseName: "lemn-conf-v2-staging",
      });
    }).toThrow(/test/);
  });

  it("refuses the deliberately absent staging label, and names test", () => {
    expect(() => {
      assertDeclaredEnvironmentReaches({
        environment: "staging",
        databaseName: "lemn-conf-v2-staging",
      });
    }).toThrow(/test/);
  });

  it("refuses Production, case-sensitively, reaching lemn-conf-v2", () => {
    expectThrowsMismatch("Production", "lemn-conf-v2");
  });

  it.each(["__proto__", "constructor", "toString"])(
    "refuses the dangerous key %s as a label, reaching lemn-conf-v2",
    (environment) => {
      expectThrowsMismatch(environment, "lemn-conf-v2");
    },
  );

  it("refuses an empty database name even when the label matches it", () => {
    expectThrowsMismatch("", "");
  });

  it("refuses databaseNameOf's own unparseable placeholder, fed through the real function", () => {
    // Ties this module's private copy of the placeholder to migrate.ts's real one: if the two ever
    // drift apart, this is the assertion that goes red, rather than a literal comparison that could
    // pass while the two disagree.
    const placeholder = databaseNameOf("not a url at all");

    expectThrowsMismatch(placeholder, placeholder);
  });

  // Findings A and B (security and logic review): a connection string with no `//` authority, for
  // example "postgres:/user:pw@host/lemn-conf-v2", parses without throwing but disagrees with the
  // driver about the host and database it reaches. `databaseNameOf` maps it to a second placeholder,
  // fed through here the same way the unparseable one is above, and the label declared against it
  // must never be admitted — an unlisted label equal to that placeholder would otherwise pass as its
  // own unclaimed ad-hoc database.
  it("refuses databaseNameOf's untrusted-connection-shape placeholder, fed through the real function", () => {
    const placeholder = databaseNameOf("postgres:/user:pw@host/lemn-conf-v2");

    expect(placeholder).not.toContain("user:pw");
    expectThrowsMismatch(placeholder, placeholder);
    expectThrowsMismatch("production", placeholder);
  });

  it("never quotes the untrusted-connection-shape placeholder's own text back in the refusal", () => {
    const placeholder = databaseNameOf("postgres:/user:pw@host/lemn-conf-v2");

    let caught: unknown;
    try {
      assertDeclaredEnvironmentReaches({
        environment: "preview",
        databaseName: placeholder,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MigrationTargetMismatchError);
    const message = (caught as Error).message;
    expect(message).not.toContain("user:pw");
    expect(message).not.toContain("@host");
  });

  // AC3's property: an unlisted label passes iff it equals the database name exactly, that name is
  // claimed by no listed environment, is not empty, and is not the unparseable placeholder.
  propertyTest.prop([fc.string(), fc.string()], {
    seed: 20260928,
    numRuns: 300,
  })(
    "passes an unlisted label iff it is the database's own, unclaimed, non-empty name",
    (environment, databaseName) => {
      fc.pre(!DATABASE_NAMES_BY_ENVIRONMENT.has(environment));

      const claimed = LISTED_ENVIRONMENTS.some((listed) =>
        namesOf(listed).includes(databaseName),
      );
      const expectedToPass =
        environment === databaseName &&
        !claimed &&
        databaseName !== "" &&
        databaseName !== "<unparseable connection string>";

      if (expectedToPass) {
        expectPasses(environment, databaseName);
      } else {
        expectThrowsMismatch(environment, databaseName);
      }
    },
  );
});

describe("assertDeclaredEnvironmentReaches — the refusal message", () => {
  it("names the declared label, the database reached, and that nothing ran, and leaks no URL", () => {
    let caught: unknown;
    try {
      assertDeclaredEnvironmentReaches({
        environment: "preview",
        databaseName: "lemn-conf-v2",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MigrationTargetMismatchError);
    const message = (caught as Error).message;
    expect(message).toContain("preview");
    expect(message).toContain("lemn-conf-v2");
    expect(message).toContain("Nothing was run or read");
    expect(message).toContain("MIGRATION_DATABASE_URL");
    expect(message).toContain(".env.migration.local");
    // Finding C (security review): the message must not model pasting a real connection string
    // into a command, which a shell keeps in its history — only exporting one from a file.
    expect(message).not.toMatch(/MIGRATION_DATABASE_URL=\S/);
    expect(message).not.toMatch(/:\/\//);
  });

  it("names the environment that claims a mismatched, ad-hoc-labelled database", () => {
    expect(() => {
      assertDeclaredEnvironmentReaches({
        environment: "lemn-conf-v2",
        databaseName: "lemn-conf-v2",
      });
    }).toThrow(/production/);
  });

  it("names the expected list for a listed environment with more than one name", () => {
    expect(() => {
      assertDeclaredEnvironmentReaches({
        environment: "test",
        databaseName: "some_other_database",
      });
    }).toThrow(/lemnaria_test/);
  });
});

describe("readDeclaredEnvironment", () => {
  it("returns the environment the run declares", () => {
    expect(
      readDeclaredEnvironment(["node", "migrate.ts", "preview"], "migrate"),
    ).toBe("preview");
  });

  it("trims the name it was given, so a stray space does not become part of it", () => {
    expect(
      readDeclaredEnvironment(
        ["node", "migrate.ts", " production "],
        "migrate",
      ),
    ).toBe("production");
  });

  it("refuses to guess when no environment is named", () => {
    // ADR 0096 finding 4: a check whose subject depends on the executing machine's environment is
    // a coincidence with a test name.
    expect(() =>
      readDeclaredEnvironment(["node", "migrate.ts"], "migrate"),
    ).toThrow(/needs the name of the environment/);
  });

  it("refuses an argument that is only whitespace", () => {
    expect(() =>
      readDeclaredEnvironment(["node", "migrate.ts", "   "], "migrate"),
    ).toThrow(/needs the name of the environment/);
  });

  it("names the command that called it, so migrate does not tell the operator to run migrate:status", () => {
    expect(() =>
      readDeclaredEnvironment(["node", "migrate.ts"], "migrate"),
    ).toThrow(/^migrate needs/);
    expect(() =>
      readDeclaredEnvironment(["node", "migrate-status.ts"], "migrate:status"),
    ).toThrow(/^migrate:status needs/);
  });
});
