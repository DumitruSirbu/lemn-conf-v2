import { describe, expect, it, vi } from "vitest";

import { MigrationExecutionError } from "../src/migration-errors.js";
import type { MigrationFile } from "../src/migration-files.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";
import {
  FAKE_DATABASE,
  QA_HOST,
  QA_MARKERS,
  QA_PASSWORD,
  QA_USER,
  markersReachableFrom,
} from "./support/qa-8b-connection-values.js";

/**
 * Adversarial QA of M8 wave 8B, rule B3: nothing a driver or Node threw rides on an error `migrate.ts` or
 * `migrate-status.ts` throws, so no part or fragment of the connection value is reachable from it by any read. The
 * driver is mocked and rejects with whatever the case scripts; nothing connects.
 */
const CONNECTION_URL = `postgres://${QA_USER}:${QA_PASSWORD}@${QA_HOST}/${FAKE_DATABASE}`;
/** The driver takes the last `@`; a parser that takes the first reads `x` as the password and the rest as the host. */
const UNENCODED_AT_URL = `postgres://${QA_USER}:x@${QA_PASSWORD}@${QA_HOST}/${FAKE_DATABASE}`;

interface ScriptedDriver {
  connectFailure: unknown;
  queryFailure: unknown;
  end: () => Promise<void>;
}

const driver = vi.hoisted(
  (): ScriptedDriver => ({
    connectFailure: undefined,
    queryFailure: undefined,
    end: () => Promise.resolve(),
  }),
);

function rejectionOrNothing(failure: unknown): Promise<{ rows: unknown[] }> {
  return failure === undefined
    ? Promise.resolve({ rows: [] })
    : Promise.reject(failure as Error);
}

/**
 * The real module with only the network replaced. `Client` stays the driver's own class, so the opener's question to
 * it (rule B9: which database would the session driver use?) is answered by the driver and not by this file.
 */
vi.mock("@neondatabase/serverless", async (importActual) => {
  const actual =
    await importActual<typeof import("@neondatabase/serverless")>();
  class ClientWithoutANetwork extends actual.Client {}
  // Assigned, not declared as overrides: the driver types `query` with overloads these scripted stand-ins do not need.
  Object.assign(ClientWithoutANetwork.prototype, {
    connect: () => rejectionOrNothing(driver.connectFailure),
    query: (sql: string) =>
      rejectionOrNothing(sql === "rollback" ? undefined : driver.queryFailure),
    end: () => driver.end(),
  });
  return {
    ...actual,
    Client: ClientWithoutANetwork,
    neon: () => ({
      query: () => rejectionOrNothing(driver.queryFailure),
    }),
  };
});

const MIGRATION: MigrationFile = {
  version: 1,
  fileName: "0001_fake.sql",
  sql: "select 1",
  checksum: "c".repeat(64),
};

interface ThrowingPath {
  readonly name: string;
  readonly raise: (failure: unknown, connectionUrl: string) => Promise<unknown>;
}

async function rejectionOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("the path under test resolved");
}

const THROWING_PATHS: readonly ThrowingPath[] = [
  {
    name: "applyMigrations, the connect fails",
    raise: async (failure, connectionUrl) => {
      driver.connectFailure = failure;
      driver.queryFailure = undefined;
      const { applyMigrations } = await import("../src/migrate.js");
      return rejectionOf(() => applyMigrations(connectionUrl, [MIGRATION]));
    },
  },
  {
    name: "applyMigrations, a statement fails",
    raise: async (failure, connectionUrl) => {
      driver.connectFailure = undefined;
      driver.queryFailure = failure;
      const { applyMigrations } = await import("../src/migrate.js");
      return rejectionOf(() => applyMigrations(connectionUrl, [MIGRATION]));
    },
  },
  {
    name: "readDeployedSchema, the read fails",
    raise: async (failure, connectionUrl) => {
      driver.queryFailure = failure;
      const { readDeployedSchema } = await import("../src/migrate-status.js");
      return rejectionOf(() => readDeployedSchema(connectionUrl));
    },
  },
];

class ErrorWithPrototypeGetters extends Error {
  get input(): string {
    return CONNECTION_URL;
  }

  get target(): { url: string } {
    return { url: `wss://${QA_HOST}/v2` };
  }

  toJSON(): unknown {
    return { input: CONNECTION_URL };
  }
}

function hiddenBehindASymbol(): Error {
  return Object.defineProperty(new Error("clean"), Symbol("qa"), {
    value: { deep: QA_PASSWORD },
    enumerable: false,
  });
}

function named(name: string): Error {
  const error = new Error("clean");
  error.name = name;
  return error;
}

/** Each is a driver or Node failure that carries the connection somewhere a reader can reach. */
const HOSTILE_FAILURES: readonly [string, () => unknown][] = [
  ["its message", () => new Error(`getaddrinfo ENOTFOUND ${QA_HOST}`)],
  [
    "its message, as a password fragment",
    () => new Error(`password authentication failed: ${QA_PASSWORD}`),
  ],
  [
    "an own property, as ERR_INVALID_URL's input",
    () =>
      Object.assign(new TypeError("Invalid URL"), {
        code: "ERR_INVALID_URL",
        input: CONNECTION_URL,
      }),
  ],
  [
    "a symbol-keyed property",
    () => Object.assign(new Error("clean"), { [Symbol("qa")]: QA_PASSWORD }),
  ],
  ["a non-enumerable symbol-keyed nested object", hiddenBehindASymbol],
  [
    "AggregateError.errors",
    () => new AggregateError([new Error(`connect ${QA_HOST}`)], "clean"),
  ],
  [
    "a Map held in a property",
    () =>
      Object.assign(new Error("clean"), { seen: new Map([["k", QA_USER]]) }),
  ],
  [
    "its own cause chain",
    () => new Error("clean", { cause: new Error(CONNECTION_URL) }),
  ],
  [
    "getters on its prototype, as an ErrorEvent's target",
    () => new ErrorWithPrototypeGetters("clean"),
  ],
  [
    "an error-like object that is not an Error",
    () => ({
      type: "error",
      name: CONNECTION_URL,
      target: { url: `wss://${QA_HOST}/v2` },
    }),
  ],
  ["a name that is the connection string", () => named(CONNECTION_URL)],
  ["a name that holds the host", () => named(`Error at ${QA_HOST}`)],
  [
    "a code that is the connection string",
    () => Object.assign(new Error("clean"), { code: CONNECTION_URL }),
  ],
  [
    "a code that is not a string",
    () => Object.assign(new Error("clean"), { code: { deep: QA_PASSWORD } }),
  ],
  ["a bare string", () => `refused ${CONNECTION_URL}`],
];

describe.each(THROWING_PATHS)("$name (rule B3)", ({ raise }) => {
  describe.each([
    ["a plain connection string", CONNECTION_URL],
    ["a password holding an unencoded @", UNENCODED_AT_URL],
  ])("with %s", (_shape, connectionUrl) => {
    it.each(HOSTILE_FAILURES)(
      "lets no part or fragment of the connection be reached when the failure shows it in %s",
      async (_place, failure) => {
        const error = await raise(failure(), connectionUrl);

        expect(error).toBeInstanceOf(MigrationExecutionError);
        expect(markersReachableFrom(error, QA_MARKERS)).toEqual([]);
        expect(markersFoundOn(error, QA_MARKERS)).toEqual([]);
      },
    );
  });

  it("keeps a cause that is a fresh plain object of a name and, at most, a code, never the failure itself", async () => {
    const failure = Object.assign(new ErrorWithPrototypeGetters("clean"), {
      code: "42601",
      detail: CONNECTION_URL,
    });

    const error = await raise(failure, CONNECTION_URL);
    const { cause } = error as { cause: object };

    expect(cause).not.toBe(failure);
    expect(Object.getPrototypeOf(cause)).toBe(Object.prototype);
    expect(Reflect.ownKeys(cause).sort()).toEqual(["code", "name"]);
    expect(cause).toEqual({ name: "Error", code: "42601" });
  });

  it("keeps a SQLSTATE and a Node error code, so the reason stays reachable", async () => {
    for (const code of ["42501", "23505", "ENOTFOUND", "ERR_INVALID_URL"]) {
      const error = await raise(
        Object.assign(new Error("clean"), { code }),
        CONNECTION_URL,
      );

      expect((error as Error).cause).toEqual({ name: "Error", code });
    }
  });
});

const SETTLE_BOUND_MS = 2_000;

type Outcome =
  | { readonly kind: "returned"; readonly value: unknown }
  | { readonly kind: "threw"; readonly error: unknown }
  | { readonly kind: "did not settle" };

async function outcomeWithinBound(
  run: () => Promise<unknown>,
): Promise<Outcome> {
  const bound = new Promise<Outcome>((resolve) =>
    setTimeout(() => {
      resolve({ kind: "did not settle" });
    }, SETTLE_BOUND_MS),
  );
  const settled = run().then(
    (value): Outcome => ({ kind: "returned", value }),
    (error: unknown): Outcome => ({ kind: "threw", error }),
  );
  return Promise.race([settled, bound]);
}

function closeFailure(): Error {
  return Object.assign(new Error(`socket hang up ${CONNECTION_URL}`), {
    input: CONNECTION_URL,
  });
}

interface FailingClose {
  readonly how: string;
  readonly end: () => Promise<void>;
  /** False for the one case this wave does not bound (follow-up F5): after a run, the close is awaited. */
  readonly isBoundedAfterARun: boolean;
}

/** Every way closing a session can go wrong. The last is what the driver does once its connection has already ended:
 *  `end()` waits for an `end` event that fired before it was called. */
const FAILING_CLOSES: readonly FailingClose[] = [
  {
    how: "rejects",
    end: () => Promise.reject(closeFailure()),
    isBoundedAfterARun: true,
  },
  {
    how: "throws before returning a promise",
    end: () => {
      throw closeFailure();
    },
    isBoundedAfterARun: true,
  },
  {
    how: "never settles",
    end: () => new Promise<void>(() => undefined),
    isBoundedAfterARun: false,
  },
];

describe.each(FAILING_CLOSES)(
  "applyMigrations when closing the session $how (rules B8 and B3)",
  ({ end, isBoundedAfterARun }) => {
    /**
     * DECLARED DEFERRAL, follow-up F5 (M8 8B, third adjudication; QA13). A close that never returns after a run is not
     * bounded by wave 8B, so for that one close these two tests are expected failures: `applyMigrations` does not
     * settle. They go red the moment it does. Whoever fixes F5 flips `isBoundedAfterARun` to true; do not delete them.
     */
    const itAfterARun = isBoundedAfterARun ? it : it.fails;

    const unhandledRejections: unknown[] = [];
    const recordUnhandled = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };

    async function outcomeOfARun(script: {
      readonly connectFailure?: unknown;
      readonly queryFailure?: unknown;
    }): Promise<Outcome> {
      driver.connectFailure = script.connectFailure;
      driver.queryFailure = script.queryFailure;
      driver.end = end;
      unhandledRejections.length = 0;
      process.on("unhandledRejection", recordUnhandled);
      const { applyMigrations } = await import("../src/migrate.js");
      try {
        const outcome = await outcomeWithinBound(() =>
          applyMigrations(CONNECTION_URL, [MIGRATION]),
        );
        await new Promise((resume) => setImmediate(resume));
        return outcome;
      } finally {
        process.off("unhandledRejection", recordUnhandled);
        driver.end = () => Promise.resolve();
      }
    }

    itAfterARun(
      "returns the summary of a clean run (an expected failure under F5 when the close never settles)",
      async () => {
        const outcome = await outcomeOfARun({});

        expect(outcome).toEqual({
          kind: "returned",
          value: { applied: [MIGRATION.fileName], alreadyApplied: [] },
        });
        expect(unhandledRejections).toEqual([]);
      },
    );

    itAfterARun(
      "throws the run's own error when a statement failed (an expected failure under F5 when the close never settles)",
      async () => {
        const outcome = await outcomeOfARun({
          queryFailure: Object.assign(new Error("syntax error"), {
            code: "42601",
          }),
        });

        expect(outcome.kind).toBe("threw");
        const { error } = outcome as { error: Error };
        expect(error).toBeInstanceOf(MigrationExecutionError);
        expect(error.message).toContain(MIGRATION.fileName);
        expect(error.cause).toEqual({ name: "Error", code: "42601" });
        expect(markersReachableFrom(error, QA_MARKERS)).toEqual([]);
        expect(unhandledRejections).toEqual([]);
      },
    );

    it("throws the connect failure when the connect failed", async () => {
      const outcome = await outcomeOfARun({
        connectFailure: Object.assign(new Error("refused"), {
          code: "ECONNREFUSED",
        }),
      });

      expect(outcome.kind).toBe("threw");
      const { error } = outcome as { error: Error };
      expect(error).toBeInstanceOf(MigrationExecutionError);
      expect(error.message).toContain("Could not connect");
      expect(error.cause).toEqual({ name: "Error", code: "ECONNREFUSED" });
      expect(markersReachableFrom(error, QA_MARKERS)).toEqual([]);
      expect(unhandledRejections).toEqual([]);
    });
  },
);
