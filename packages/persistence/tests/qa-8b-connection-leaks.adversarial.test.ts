import type { DesignId } from "@lemnaria/configurator-domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createNeonDesignRowSource } from "../src/design-row-source.js";
import {
  applyMigrations,
  describeMigrationFailure,
  runMigrations,
} from "../src/migrate.js";
import {
  describeStatusFailure,
  readDeployedSchema,
} from "../src/migrate-status.js";
import { assertDeclaredEnvironmentReaches } from "../src/migration-target.js";
import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
import {
  InvalidConnectionUrlError,
  databaseNameOf,
} from "../src/open-database.js";
import { NeonShareLinkRepository } from "../src/share-link-repository.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";
import {
  FAKE_DATABASE,
  QA_CREDENTIALS,
  QA_HOST,
  QA_MARKERS,
  QA_PASSWORD,
  errorRaisedBy,
  qaValuesFor,
  sweep,
} from "./support/qa-8b-connection-values.js";
import type { Site } from "./support/qa-8b-connection-values.js";

/**
 * Adversarial QA of M8 wave 8B: the runtime and migration sites, and the leak detector. The cause a migration
 * error keeps is attacked in `qa-8b-thrown-cause.adversarial.test.ts`. Fake values
 * only; every host ends in `.invalid` or the value does not parse, so nothing is reachable.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the leak detector the wave's tests rely on can itself fail", () => {
  const LEAK = `near ${QA_PASSWORD}`;

  function withNonEnumerable(key: string | symbol, value: unknown): Error {
    return Object.defineProperty(new Error("clean"), key, {
      value,
      enumerable: false,
    });
  }

  function withStack(stack: string): Error {
    const error = new Error("clean");
    error.stack = stack;
    return error;
  }

  it.each<[string, unknown]>([
    ["the message", new Error(LEAK)],
    ["the stack alone", withStack(`Error: clean\n    at ${LEAK}`)],
    [
      "an own property, as ERR_INVALID_URL's input",
      Object.assign(new TypeError("Invalid URL"), { input: LEAK }),
    ],
    ["a non-enumerable own property", withNonEnumerable("hidden", LEAK)],
    [
      "an object nested in a property",
      Object.assign(new Error("clean"), { detail: { deeper: [LEAK] } }),
    ],
    ["the cause chain", new Error("clean", { cause: new Error(LEAK) })],
    [
      "a cause that is not an Error",
      new Error("clean", { cause: { type: "error", note: LEAK } }),
    ],
    ["AggregateError.errors", new AggregateError([new Error(LEAK)], "clean")],
    [
      "a symbol-keyed property, which only util.inspect reads",
      Object.assign(new Error("clean"), { [Symbol("qa")]: LEAK }),
    ],
    [
      "a non-enumerable symbol-keyed property",
      withNonEnumerable(Symbol("qa"), { deep: LEAK }),
    ],
    ["an error-like object that is not an Error", { type: "error", url: LEAK }],
    ["a bare string", LEAK],
  ])("reports a marker in %s", (_place, leaking) => {
    expect(markersFoundOn(leaking, QA_MARKERS)).not.toEqual([]);
  });

  it("reports nothing for an error that carries no marker", () => {
    const clean = Object.assign(new Error("permission denied"), {
      code: "42501",
      cause: new Error("inner"),
    });

    expect(markersFoundOn(clean, QA_MARKERS)).toEqual([]);
  });
});

const NO_SUCH_DESIGN = "qa-8b-no-such-design" as DesignId;

const SITES: readonly Site[] = [
  {
    name: "NeonConfigurationRepository, constructed and queried",
    databaseName: FAKE_DATABASE,
    markers: QA_MARKERS,
    mustRaiseForEveryValue: true,
    run: (value) => {
      vi.stubEnv("DATABASE_URL", value);
      return new NeonConfigurationRepository().load(NO_SUCH_DESIGN);
    },
  },
  {
    name: "NeonShareLinkRepository, constructed and queried",
    databaseName: FAKE_DATABASE,
    markers: QA_MARKERS,
    mustRaiseForEveryValue: true,
    run: (value) => {
      vi.stubEnv("DATABASE_URL", value);
      return new NeonShareLinkRepository().loadShared("0".repeat(64));
    },
  },
  {
    name: "createNeonDesignRowSource",
    databaseName: FAKE_DATABASE,
    markers: QA_MARKERS,
    mustRaiseForEveryValue: true,
    run: (value) => {
      vi.stubEnv("DATABASE_URL", value);
      return createNeonDesignRowSource().fetchDesignPage({ pageSize: 1 });
    },
  },
  {
    name: "applyMigrations",
    databaseName: FAKE_DATABASE,
    markers: QA_MARKERS,
    mustRaiseForEveryValue: true,
    run: (value) => applyMigrations(value, []),
  },
  {
    name: "runMigrations reading MIGRATION_DATABASE_URL",
    databaseName: FAKE_DATABASE,
    markers: QA_MARKERS,
    mustRaiseForEveryValue: true,
    run: (value) => {
      vi.stubEnv("MIGRATION_DATABASE_URL", value);
      return runMigrations();
    },
  },
  {
    name: "readDeployedSchema",
    databaseName: FAKE_DATABASE,
    markers: QA_MARKERS,
    mustRaiseForEveryValue: true,
    run: (value) => readDeployedSchema(value),
  },
];

describe("criterion 2 with values the wave's table does not hold", () => {
  it.each(SITES)(
    "$name raises no error that shows a marker",
    async ({ name, ...site }) => {
      const { leaks, valuesThatRaisedNothing } = await sweep({ name, ...site });

      expect(leaks).toEqual([]);
      if (site.mustRaiseForEveryValue)
        expect(valuesThatRaisedNothing).toEqual([]);
    },
  );

  it("the lines the two CLIs print after their environment check show no marker", () => {
    const leaks: string[] = [];
    for (const { label, value } of qaValuesFor("lemn-conf-v2-staging"))
      for (const line of linesPrintedForARefusedTarget(value))
        for (const found of markersFoundOn(line, QA_MARKERS))
          leaks.push(`${label} -> ${found}`);

    expect(leaks).toEqual([]);
  });
});

/** What `migrate test` and `migrate:status test` print when the check both run before connecting refuses the value. */
function linesPrintedForARefusedTarget(connectionUrl: string): string[] {
  try {
    assertDeclaredEnvironmentReaches({
      environment: "test",
      databaseName: databaseNameOf(connectionUrl),
    });
  } catch (error) {
    return [describeMigrationFailure(error), describeStatusFailure(error)];
  }
  return [];
}

describe("the two CLI printers given an error that is not this package's own (criterion 6)", () => {
  const WELL_FORMED = `postgres://${QA_CREDENTIALS}@${QA_HOST}/${FAKE_DATABASE}`;

  it.each<[string, unknown]>([
    ["Node's ERR_INVALID_URL", invalidUrlErrorFor(WELL_FORMED)],
    ["a driver error whose message echoes the string", new Error(WELL_FORMED)],
    ["a rejection that is not an Error", { type: "error", url: WELL_FORMED }],
    ["a bare string", WELL_FORMED],
  ])("print only the type of %s", (_name, error) => {
    for (const line of [
      describeMigrationFailure(error),
      describeStatusFailure(error),
    ]) {
      expect(line).toMatch(/unexpected/);
      expect(markersFoundOn(line, QA_MARKERS)).toEqual([]);
    }
  });
});

function invalidUrlErrorFor(input: string): TypeError {
  return Object.assign(new TypeError("Invalid URL"), {
    code: "ERR_INVALID_URL",
    input,
  });
}

describe("no fallback from one connection variable to another (criterion 8, ADR 0008)", () => {
  const WELL_FORMED = `postgres://${QA_CREDENTIALS}@${QA_HOST}/${FAKE_DATABASE}`;
  const BAD_ESCAPE = `postgres://${QA_CREDENTIALS}%ZZ@${QA_HOST}/${FAKE_DATABASE}`;

  it("runMigrations refuses a malformed MIGRATION_DATABASE_URL although the other two are well-formed", async () => {
    vi.stubEnv("MIGRATION_DATABASE_URL", BAD_ESCAPE);
    vi.stubEnv("DATABASE_URL", WELL_FORMED);
    vi.stubEnv("TEST_DATABASE_URL", WELL_FORMED);

    const error = await errorRaisedBy(() => runMigrations());

    expect(error).toBeInstanceOf(InvalidConnectionUrlError);
    expect((error as InvalidConnectionUrlError).variableName).toBe(
      "MIGRATION_DATABASE_URL",
    );
  });

  it("runMigrations reports MIGRATION_DATABASE_URL as unset although the other two are well-formed", async () => {
    vi.stubEnv("MIGRATION_DATABASE_URL", "");
    vi.stubEnv("DATABASE_URL", WELL_FORMED);
    vi.stubEnv("TEST_DATABASE_URL", WELL_FORMED);

    const error = await errorRaisedBy(() => runMigrations());

    expect((error as Error).message).toMatch(
      /^MIGRATION_DATABASE_URL environment variable is not set/,
    );
    expect(markersFoundOn(error, QA_MARKERS)).toEqual([]);
  });
});

describe("a refused shape is answered without waiting on the network (criterion 6)", () => {
  const AT_ONCE_MS = 250;
  const BAD_ESCAPE = `postgres://${QA_CREDENTIALS}%ZZ@${QA_HOST}/${FAKE_DATABASE}`;
  const WRONG_SCHEME = `mysql://${QA_CREDENTIALS}@${QA_HOST}/${FAKE_DATABASE}`;

  it.each([
    ["a bad percent-escape", BAD_ESCAPE],
    ["a wrong scheme", WRONG_SCHEME],
  ])("applyMigrations rejects %s at once", async (_label, value) => {
    const startedAt = performance.now();

    const error = await errorRaisedBy(() => applyMigrations(value, []));

    expect(error).toBeInstanceOf(InvalidConnectionUrlError);
    expect(performance.now() - startedAt).toBeLessThan(AT_ONCE_MS);
  });
});
