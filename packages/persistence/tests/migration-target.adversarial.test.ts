import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { databaseNameOf } from "../src/migrate.js";
import { MigrationTargetMismatchError } from "../src/migration-errors.js";
import {
  DATABASE_NAMES_BY_ENVIRONMENT,
  assertDeclaredEnvironmentReaches,
  readDeclaredEnvironment,
} from "../src/migration-target.js";
import { spawnPersistenceCli } from "./support/spawn-persistence-cli.js";

/**
 * Adversarial QA of `docs/milestones/migration-environment-safety-check.md`: inputs the
 * implementer's `migration-target.test.ts` and `migration-target-cli.test.ts` do not try.
 *
 * **R3, binding on every spawned case here:** `MIGRATION_DATABASE_URL` is always set explicitly
 * (to a `.invalid` host, or to the empty string, which `loadEnvLocal`'s `??=` keeps rather than
 * replacing), and no spawned case declares `production` or `lemn-conf-v2`. Every label a spawned
 * case uses is one the real local credential (`lemn-conf-v2`) would refuse.
 */

const PRODUCTION_DATABASE = "lemn-conf-v2";
const PREVIEW_DATABASE = "lemn-conf-v2-preview";
const LISTED_ENVIRONMENTS = [...DATABASE_NAMES_BY_ENVIRONMENT.keys()];
const CLAIMED_DATABASES = [...DATABASE_NAMES_BY_ENVIRONMENT.values()].flat();

function checkLabelAgainstName(
  environment: string,
  databaseName: string,
): void {
  assertDeclaredEnvironmentReaches({ environment, databaseName });
}

/** The check as the CLIs run it: on the name `databaseNameOf` extracts from the URL. */
function checkLabelAgainstUrl(
  environment: string,
  connectionUrl: string,
): void {
  checkLabelAgainstName(environment, databaseNameOf(connectionUrl));
}

function refusalMessageOf(environment: string, databaseName: string): string {
  try {
    checkLabelAgainstName(environment, databaseName);
  } catch (error) {
    expect(error).toBeInstanceOf(MigrationTargetMismatchError);
    return (error as Error).message;
  }
  throw new Error(
    `expected "${environment}" against "${databaseName}" to be refused`,
  );
}

/**
 * The database `@neondatabase/serverless` 1.1.0's WebSocket `Client` — the one `migrate` connects
 * with — actually selects for a connection string. Reproduces its bundled pg-connection-string
 * parse (`index.mjs`: re-parse under `http:`, `decodeURIComponent` the pathname, drop the leading
 * `/`, then `decodeURI`), so this file never constructs the driver itself. Pinned to measured
 * driver output by the first test below.
 */
function databaseTheDriverReaches(connectionUrl: string): string {
  const { protocol } = new URL(connectionUrl);
  const reparsed = new URL(`http:${connectionUrl.substring(protocol.length)}`);
  const path = decodeURIComponent(reparsed.pathname);
  return decodeURI(path.startsWith("/") ? path.slice(1) : path);
}

describe("the check's name and the driver's name agree", () => {
  // Measured 2026-09-28 by constructing `new Client(url)` from @neondatabase/serverless 1.1.0 (no
  // connect) and reading `.database`, beside `databaseNameOf(url)`.
  it.each([
    [
      "postgres://u:p@h.invalid/lemn%2Dconf%2Dv2",
      "lemn%2Dconf%2Dv2",
      PRODUCTION_DATABASE,
    ],
    [
      "postgres://u:p@h.invalid/%6Cemn-conf-v2",
      "%6Cemn-conf-v2",
      PRODUCTION_DATABASE,
    ],
    [
      "postgres://u:p@h.invalid/foo\\..\\lemn-conf-v2",
      "foo\\..\\lemn-conf-v2",
      PRODUCTION_DATABASE,
    ],
    [
      "postgres://u:p@h.invalid/x/../lemn-conf-v2",
      PRODUCTION_DATABASE,
      PRODUCTION_DATABASE,
    ],
    [
      "postgres://u:p@h.invalid/lemn-conf-v2#frag",
      PRODUCTION_DATABASE,
      PRODUCTION_DATABASE,
    ],
  ])(
    "the oracle reproduces the measured driver parse of %s",
    (url, checkSees, driverUses) => {
      expect(databaseNameOf(url)).toBe(checkSees);
      expect(databaseTheDriverReaches(url)).toBe(driverUses);
    },
  );

  // DEFECT: databaseNameOf returns the URL's raw, still-percent-encoded pathname, while the driver
  // decodes it. An unlisted label equal to the encoded form passes as an "unclaimed ad-hoc
  // database", and the driver then connects to production. Falsifies the plan's rule 2 claim that
  // "a listed environment's database can be reached only under that environment's name".
  it.each([
    "postgres://u:p@h.invalid/lemn%2Dconf%2Dv2",
    "postgres://u:p@h.invalid/%6Cemn-conf-v2",
    "postgres://u:p@h.invalid/foo\\..\\lemn-conf-v2",
    "postgres://u:p@h.invalid/lemn%2Dconf%2Dv2%2Dpreview",
  ])(
    "refuses a label that is not the claiming environment when the driver would reach a listed database: %s",
    (url) => {
      const labelEqualToWhatTheCheckSees = databaseNameOf(url);

      expect(CLAIMED_DATABASES).toContain(databaseTheDriverReaches(url));
      expect(() => {
        checkLabelAgainstUrl(labelEqualToWhatTheCheckSees, url);
      }).toThrow(MigrationTargetMismatchError);
    },
  );

  // Same invariant, swept: any percent-encoding of any subset of a claimed name's characters.
  propertyTest.prop(
    [
      fc.constantFrom(...CLAIMED_DATABASES),
      fc.array(fc.boolean(), { minLength: 32, maxLength: 32 }),
      fc.boolean(),
    ],
    { seed: 20260928, numRuns: 200 },
  )(
    "never lets an unlisted label reach a claimed database through percent-encoding",
    (claimedName, encodeMask, useLowerHex) => {
      const encodedPath = Array.from(claimedName)
        .map((character, index) =>
          encodeMask[index] === true
            ? percentEncode(character, useLowerHex)
            : character,
        )
        .join("");
      const url = `postgres://u:p@h.invalid/${encodedPath}`;
      const label = databaseNameOf(url);
      fc.pre(!DATABASE_NAMES_BY_ENVIRONMENT.has(label));

      expect(databaseTheDriverReaches(url)).toBe(claimedName);
      expect(() => {
        checkLabelAgainstUrl(label, url);
      }).toThrow(MigrationTargetMismatchError);
    },
  );
});

function percentEncode(character: string, useLowerHex: boolean): string {
  const hex = character.charCodeAt(0).toString(16).padStart(2, "0");
  return `%${useLowerHex ? hex.toLowerCase() : hex.toUpperCase()}`;
}

// D1 fix verification: the specific bypass this file found, and the general rule it belongs to.
describe("a raw database name containing % or \\ is always refused", () => {
  it.each(["lemn%2Dconf%2Dv2", "%6Cemn-conf-v2", "foo\\..\\lemn-conf-v2"])(
    "refuses the encoded bypass name %s declared against itself",
    (databaseName) => {
      expect(() => {
        checkLabelAgainstName(databaseName, databaseName);
      }).toThrow(MigrationTargetMismatchError);
    },
  );

  propertyTest.prop(
    [fc.string(), fc.constantFrom("%", "\\"), fc.string(), fc.string()],
    { seed: 20260928, numRuns: 200 },
  )(
    "refuses any databaseName containing % or \\ regardless of the declared environment",
    (environment, marker, prefix, suffix) => {
      const databaseName = `${prefix}${marker}${suffix}`;

      expect(() => {
        checkLabelAgainstName(environment, databaseName);
      }).toThrow(MigrationTargetMismatchError);
    },
  );
});

describe("case, whitespace and look-alike labels", () => {
  propertyTest.prop(
    [
      fc
        .constantFrom(...LISTED_ENVIRONMENTS)
        .chain((label) =>
          fc.tuple(fc.constant(label), fc.mixedCase(fc.constant(label))),
        ),
    ],
    { seed: 20260928, numRuns: 200 },
  )(
    "refuses every re-cased spelling of a listed label against that label's own databases",
    ([label, recased]) => {
      fc.pre(recased !== label);

      for (const ownName of DATABASE_NAMES_BY_ENVIRONMENT.get(label) ?? []) {
        expect(() => {
          checkLabelAgainstName(recased, ownName);
        }).toThrow(MigrationTargetMismatchError);
      }
    },
  );

  it.each([
    [" production", PRODUCTION_DATABASE],
    ["production​", PRODUCTION_DATABASE],
    ["​preview", PREVIEW_DATABASE],
    ["prоduction", PRODUCTION_DATABASE],
    ["ｐｒｏｄｕｃｔｉｏｎ", PRODUCTION_DATABASE],
    ["lеmn-conf-v2", PRODUCTION_DATABASE],
    ["lemn‐conf‐v2", PRODUCTION_DATABASE],
  ])("refuses the look-alike label %j against %s", (label, databaseName) => {
    expect(() => {
      checkLabelAgainstName(label, databaseName);
    }).toThrow(MigrationTargetMismatchError);
  });

  it("refuses a Cyrillic look-alike database under its own label, because the URL percent-encodes it", () => {
    const lookAlike = "lеmn-conf-v2";

    expect(() => {
      checkLabelAgainstUrl(lookAlike, `postgres://u:p@h.invalid/${lookAlike}`);
    }).toThrow(MigrationTargetMismatchError);
  });

  it.each([" ", " \t\n", "﻿"])(
    "readDeclaredEnvironment treats the Unicode whitespace %j as no argument",
    (blank) => {
      expect(() =>
        readDeclaredEnvironment(["node", "migrate.ts", blank], "migrate"),
      ).toThrow(/needs the name of the environment/);
    },
  );

  it("readDeclaredEnvironment keeps a zero-width space, so the check sees an unlisted label and refuses", () => {
    const declared = readDeclaredEnvironment(
      ["node", "migrate.ts", "preview​"],
      "migrate",
    );

    expect(declared).not.toBe("preview");
    expect(() => {
      checkLabelAgainstName(declared, PREVIEW_DATABASE);
    }).toThrow(MigrationTargetMismatchError);
  });
});

describe("an unlisted label colliding with another environment's database", () => {
  it.each([
    ["staging", PRODUCTION_DATABASE, "production"],
    ["staging", PREVIEW_DATABASE, "preview"],
    [PREVIEW_DATABASE, PREVIEW_DATABASE, "preview"],
    ["lemnaria_test", "lemnaria_test", "test"],
    [PRODUCTION_DATABASE, PREVIEW_DATABASE, "preview"],
  ])(
    "refuses %s reaching %s and names %s as the owner",
    (label, databaseName, owner) => {
      expect(refusalMessageOf(label, databaseName)).toContain(
        `belongs to "${owner}"`,
      );
    },
  );

  it.each(
    LISTED_ENVIRONMENTS.flatMap((owner) =>
      LISTED_ENVIRONMENTS.filter((other) => other !== owner).flatMap((other) =>
        (DATABASE_NAMES_BY_ENVIRONMENT.get(owner) ?? []).map(
          (ownedName) => [other, ownedName] as const,
        ),
      ),
    ),
  )(
    "refuses the listed label %s reaching %s, which another environment owns",
    (label, databaseName) => {
      expect(() => {
        checkLabelAgainstName(label, databaseName);
      }).toThrow(MigrationTargetMismatchError);
    },
  );
});

describe("prototype-shaped strings", () => {
  const PROTOTYPE_KEYS = [
    "__proto__",
    "constructor",
    "hasOwnProperty",
    "valueOf",
    "toString",
    "isPrototypeOf",
    "__defineGetter__",
  ];

  it.each(PROTOTYPE_KEYS)("%s is not a listed environment", (key) => {
    expect(DATABASE_NAMES_BY_ENVIRONMENT.has(key)).toBe(false);
  });

  it.each(
    PROTOTYPE_KEYS.flatMap((key) =>
      CLAIMED_DATABASES.map((name) => [key, name] as const),
    ),
  )(
    "refuses the label %s reaching the claimed database %s",
    (key, databaseName) => {
      expect(() => {
        checkLabelAgainstName(key, databaseName);
      }).toThrow(MigrationTargetMismatchError);
    },
  );

  it.each(
    PROTOTYPE_KEYS.flatMap((key) =>
      LISTED_ENVIRONMENTS.map((label) => [label, key] as const),
    ),
  )(
    "refuses the listed label %s reaching a database named %s",
    (label, key) => {
      expect(() => {
        checkLabelAgainstName(label, key);
      }).toThrow(MigrationTargetMismatchError);
    },
  );

  it.each(PROTOTYPE_KEYS)(
    "admits %s only as its own unclaimed ad-hoc database, as rule 2 says",
    (key) => {
      expect(() => {
        checkLabelAgainstName(key, key);
      }).not.toThrow();
    },
  );
});

describe("values outside the declared types", () => {
  it.each([undefined, null])(
    "refuses a %s environment with a mismatch rather than a TypeError",
    (missing) => {
      expect(() => {
        assertDeclaredEnvironmentReaches({
          environment: missing as unknown as string,
          databaseName: "",
        });
      }).toThrow(MigrationTargetMismatchError);
    },
  );

  it('refuses the label "undefined" against an empty database name', () => {
    expect(() => {
      checkLabelAgainstName("undefined", "");
    }).toThrow(MigrationTargetMismatchError);
  });

  it("refuses the unparseable placeholder declared against itself when it comes from a real malformed URL", () => {
    const placeholder = databaseNameOf("postgres://u:p@[not-a-host/db");

    expect(() => {
      checkLabelAgainstName(placeholder, placeholder);
    }).toThrow(MigrationTargetMismatchError);
  });

  it("refuses a URL with no path at all, which the driver would default to the user name", () => {
    const url = "postgres://lemnaria_cli_probe:p@h.invalid";

    expect(databaseTheDriverReaches(url)).toBe("");
    expect(() => {
      checkLabelAgainstUrl("lemnaria_cli_probe", url);
    }).toThrow(MigrationTargetMismatchError);
  });
});

describe("extremely long strings", () => {
  const LONG_NAME = "x".repeat(1_000_000);

  it("admits a million-character ad-hoc name declared against itself", () => {
    expect(() => {
      checkLabelAgainstName(LONG_NAME, LONG_NAME);
    }).not.toThrow();
  });

  it("refuses a million-character label that differs from the database by its last character", () => {
    expect(() => {
      checkLabelAgainstName(`${LONG_NAME}y`, `${LONG_NAME}z`);
    }).toThrow(MigrationTargetMismatchError);
  });

  it("refuses a listed label reaching a database whose name only starts with the listed one", () => {
    expect(() => {
      checkLabelAgainstName("production", `${PRODUCTION_DATABASE}${LONG_NAME}`);
    }).toThrow(MigrationTargetMismatchError);
  });
});

const PROBE_SECRET = "probe-secret-7f3a";
const PROBE_USER = "probe-user";
const PROBE_HOST = "db.example.invalid";
const LEAK_MARKERS = [PROBE_SECRET, PROBE_USER, PROBE_HOST, "://"];
const PASS_THROUGH_DATABASE = "lemnaria_cli_probe";
const PASS_THROUGH_URL = `postgres://${PROBE_USER}:${PROBE_SECRET}@${PROBE_HOST}/${PASS_THROUGH_DATABASE}`;
const UNPARSEABLE_URL_WITH_SECRET = `not a url ${PROBE_USER}:${PROBE_SECRET}@${PROBE_HOST}`;

function expectNothingLeaked(...streams: readonly string[]): void {
  for (const stream of streams) {
    for (const marker of LEAK_MARKERS) expect(stream).not.toContain(marker);
  }
}

describe("the CLIs, spawned — cases the implementer's CLI file does not try", () => {
  it("migrate:status with no argument fails with its own usage line and reads nothing", async () => {
    const result = await spawnPersistenceCli("src/migrate-status.ts", [], {
      MIGRATION_DATABASE_URL: PASS_THROUGH_URL,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(
      /^\[migrate:status\] MigrationExecutionError: migrate:status needs/,
    );
    expect(result.stderr).not.toContain("Could not read the schema");
    expect(result.stdout).toBe("");
  });

  it.each(["src/migrate.ts", "src/migrate-status.ts"])(
    "%s refuses preview against an unparseable URL, and prints none of it",
    async (script) => {
      const result = await spawnPersistenceCli(script, ["preview"], {
        MIGRATION_DATABASE_URL: UNPARSEABLE_URL_WITH_SECRET,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("MigrationTargetMismatchError");
      expect(result.stderr).toContain("an unparseable connection string");
      expect(result.stderr).not.toMatch(/Could not (connect|read)/);
      expectNothingLeaked(result.stdout, result.stderr);
    },
  );

  it("migrate refuses the unparseable placeholder declared as its own label", async () => {
    const result = await spawnPersistenceCli(
      "src/migrate.ts",
      [databaseNameOf("not a url")],
      { MIGRATION_DATABASE_URL: UNPARSEABLE_URL_WITH_SECRET },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MigrationTargetMismatchError");
    expectNothingLeaked(result.stdout, result.stderr);
  });

  it("migrate treats a leading `--` as the declared label and refuses, rather than skipping to the next argument", async () => {
    const result = await spawnPersistenceCli(
      "src/migrate.ts",
      ["--", PASS_THROUGH_DATABASE],
      {
        MIGRATION_DATABASE_URL: PASS_THROUGH_URL,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('the declared environment is "--"');
    expect(result.stderr).not.toContain("Could not connect");
  });

  it("migrate passes a matching ad-hoc label all the way to the connect step", async () => {
    // Stronger than "no mismatch error": proves the run reached runMigrations. Accepts the plan's
    // AC8 line, or — while the pre-existing `client.end()` hang after a failed connect stands — the
    // unsettled-await warning Node prints at the runMigrations call.
    const result = await spawnPersistenceCli(
      "src/migrate.ts",
      [PASS_THROUGH_DATABASE],
      {
        MIGRATION_DATABASE_URL: PASS_THROUGH_URL,
      },
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(
      /Could not connect to "<a database this repository does not list>"|unsettled top-level await[\s\S]*await runMigrations\(connectionUrl\)/,
    );
    expectNothingLeaked(result.stdout, result.stderr);
  });

  // Found by QA: moving `readMigrationDatabaseUrl()` inside the CLI's try had made it throw a plain
  // Error, which `describeMigrationFailure` deliberately withholds, so the operator would have seen
  // only "[migrate] migration run failed with an unexpected Error." instead of naming
  // MIGRATION_DATABASE_URL. Fixed by making `readMigrationDatabaseUrl` throw a
  // `MigrationExecutionError`, matching `migrate:status`'s own `requireMigrationDatabaseUrl` — this
  // test pins that fix.
  it("migrate still names MIGRATION_DATABASE_URL when the credential is missing", async () => {
    const result = await spawnPersistenceCli(
      "src/migrate.ts",
      [PASS_THROUGH_DATABASE],
      {
        MIGRATION_DATABASE_URL: "",
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MIGRATION_DATABASE_URL");
  });

  // Found by QA, end to end: without the D1 fix, the percent-encoded label would pass the check and
  // the run would go on to connect, where a real credential of this shape reaches lemn-conf-v2. This
  // test pins the fix (`hasUndecodedPathCharacters` in `migration-target.ts`).
  it("migrate refuses a percent-encoded label whose URL the driver would decode to lemn-conf-v2", async () => {
    const encodedName = "lemn%2Dconf%2Dv2";
    const result = await spawnPersistenceCli("src/migrate.ts", [encodedName], {
      MIGRATION_DATABASE_URL: `postgres://${PROBE_USER}:${PROBE_SECRET}@${PROBE_HOST}/${encodedName}`,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("MigrationTargetMismatchError");
  });

  // Findings A and B (security and logic review): a connection string with no `//` authority — a
  // single slash after the scheme — makes `new URL` read the credential and host as part of the
  // pathname, which `databaseNameOf` used to return verbatim as "the database name" (Finding A's
  // leak). The real driver re-parses the same string under `http:`, a WHATWG "special" scheme that
  // tolerates the missing slash, and reaches a real host and database there (Finding B's bypass).
  // Both are closed by refusing the shape outright, before either CLI opens a connection.
  const NO_AUTHORITY_URL_WITH_SECRET = `postgres:/${PROBE_USER}:${PROBE_SECRET}@${PROBE_HOST}/lemn-conf-v2`;

  it.each(["src/migrate.ts", "src/migrate-status.ts"])(
    "%s refuses a no-authority connection string before connecting, and prints none of its credential",
    async (script) => {
      const result = await spawnPersistenceCli(script, ["preview"], {
        MIGRATION_DATABASE_URL: NO_AUTHORITY_URL_WITH_SECRET,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("MigrationTargetMismatchError");
      expect(result.stderr).not.toMatch(/Could not (connect|read)/);
      expect(result.stdout).toBe("");
      // Not `expectNothingLeaked`/its "://" marker here: the refusal legitimately names the
      // accepted schemes ("a plain postgres:// or postgresql:// URL with a host"), which is safe,
      // fixed, descriptive text rather than anything drawn from the connection string it refused.
      // What must never appear is the credential and host the input actually carried.
      for (const secret of [
        PROBE_SECRET,
        PROBE_USER,
        PROBE_HOST,
        `${PROBE_USER}:${PROBE_SECRET}`,
      ]) {
        expect(result.stdout).not.toContain(secret);
        expect(result.stderr).not.toContain(secret);
      }
    },
  );
});
