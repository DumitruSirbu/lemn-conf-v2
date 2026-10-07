import { describe, expect, it, vi } from "vitest";

import { MigrationExecutionError } from "../src/migration-errors.js";
import type { MigrationFile } from "../src/migration-files.js";
import {
  FAKE_HOST,
  FAKE_PASSWORD,
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";

const SETTLE_BOUND_MS = 2_000;

interface ScriptedDriver {
  connectFailure: unknown;
  queryFailure: unknown;
  endFailure: unknown;
  endAfterFailedConnect: "never settles" | "rejects" | "throws";
  readonly endCalls: number[];
}

const driver = vi.hoisted(
  (): ScriptedDriver => ({
    connectFailure: undefined,
    queryFailure: undefined,
    endFailure: undefined,
    endAfterFailedConnect: "never settles",
    endCalls: [],
  }),
);

function endAfterAFailedConnect(): Promise<void> {
  if (driver.endAfterFailedConnect === "throws")
    throw new Error("socket hang up");
  return driver.endAfterFailedConnect === "rejects"
    ? Promise.reject(new Error("socket hang up"))
    : new Promise(() => undefined);
}

vi.mock("@neondatabase/serverless", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@neondatabase/serverless")>();
  return {
    ...actual,
    Client: class {
      readonly database: string | undefined;

      constructor(connectionUrl: string) {
        this.database = new actual.Client(connectionUrl).database;
      }

      connect(): Promise<void> {
        return driver.connectFailure === undefined
          ? Promise.resolve()
          : Promise.reject(driver.connectFailure as Error);
      }

      query(sql: string): Promise<{ rows: unknown[] }> {
        const isRollback = sql === "rollback";
        return driver.queryFailure === undefined || isRollback
          ? Promise.resolve({ rows: [] })
          : Promise.reject(driver.queryFailure as Error);
      }

      // The real driver's `end()` after a failed connect waits for an `end` event that already fired.
      end(): Promise<void> {
        driver.endCalls.push(driver.endCalls.length);
        if (driver.connectFailure !== undefined)
          return endAfterAFailedConnect();
        return driver.endFailure === undefined
          ? Promise.resolve()
          : Promise.reject(driver.endFailure as Error);
      }
    },
  };
});

const MIGRATION: MigrationFile = {
  version: 1,
  fileName: "0001_fake.sql",
  sql: "select 1",
  checksum: "c".repeat(64),
};

async function rejectionWithinBound(
  run: () => Promise<unknown>,
): Promise<unknown> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => {
      reject(new Error("applyMigrations did not settle within the bound"));
    }, SETTLE_BOUND_MS),
  );
  const settled = run().then(
    () => {
      throw new Error("applyMigrations resolved");
    },
    (error: unknown) => error,
  );
  return Promise.race([settled, timeout]);
}

async function apply(): Promise<unknown> {
  const { applyMigrations } = await import("../src/migrate.js");
  return applyMigrations(WELL_FORMED_UNREACHABLE_VALUE, [MIGRATION]);
}

function resetDriver(): void {
  driver.connectFailure = undefined;
  driver.queryFailure = undefined;
  driver.endFailure = undefined;
  driver.endAfterFailedConnect = "never settles";
  driver.endCalls.length = 0;
}

describe("applyMigrations against a driver that fails", () => {
  it("settles when connect fails even though end() then never settles", async () => {
    resetDriver();
    driver.connectFailure = { type: "error" };

    const error = await rejectionWithinBound(apply);

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect(driver.endCalls).toHaveLength(1);
  });

  it("keeps only the type name of a connect failure as the cause", async () => {
    resetDriver();
    driver.connectFailure = { type: "error" };

    const error = await rejectionWithinBound(apply);

    expect((error as Error).cause).toEqual({ name: "object" });
  });

  it("keeps nothing of a connect failure that carries the host and the password, but its Node error code", async () => {
    resetDriver();
    driver.connectFailure = Object.assign(
      new Error(`getaddrinfo ENOTFOUND api.${FAKE_HOST} ${FAKE_PASSWORD}`),
      { code: "ENOTFOUND" },
    );

    const error = await rejectionWithinBound(apply);

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect((error as Error).cause).toEqual({
      name: "Error",
      code: "ENOTFOUND",
    });
    expect(markersFoundOn(error)).toEqual([]);
  });

  it("keeps a migration's SQLSTATE, and nothing else of its failure, as the cause", async () => {
    resetDriver();
    driver.queryFailure = Object.assign(
      new Error(`syntax error at or near ${FAKE_PASSWORD}`),
      { code: "42601", detail: WELL_FORMED_UNREACHABLE_VALUE },
    );

    const error = await rejectionWithinBound(apply);

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect((error as Error).cause).toEqual({ name: "Error", code: "42601" });
    expect(markersFoundOn(error)).toEqual([]);
  });

  it("keeps nothing of a migration failure that is not a driver error but carries the connection string", async () => {
    resetDriver();
    driver.queryFailure = new Error(
      `failed over ${WELL_FORMED_UNREACHABLE_VALUE}`,
    );

    const error = await rejectionWithinBound(apply);

    expect((error as Error).cause).toEqual({ name: "Error" });
    expect(markersFoundOn(error)).toEqual([]);
  });
});

describe("applyMigrations when closing the session fails (rule B8)", () => {
  async function outcomeWithinBound(): Promise<unknown> {
    const { applyMigrations } = await import("../src/migrate.js");
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error("applyMigrations did not settle within the bound"));
      }, SETTLE_BOUND_MS),
    );
    const settled = applyMigrations(WELL_FORMED_UNREACHABLE_VALUE, [
      MIGRATION,
    ]).then(
      (summary) => summary,
      (error: unknown) => error,
    );
    return Promise.race([settled, timeout]);
  }

  it("returns the summary of a clean run, since every migration committed before the close failed", async () => {
    resetDriver();
    driver.endFailure = new Error(`socket hang up ${FAKE_PASSWORD}`);

    const outcome = await outcomeWithinBound();

    expect(outcome).toEqual({ applied: ["0001_fake.sql"], alreadyApplied: [] });
    expect(driver.endCalls).toHaveLength(1);
  });

  it("throws the run's own error when the run failed and then the close failed too", async () => {
    resetDriver();
    driver.queryFailure = Object.assign(new Error("syntax error"), {
      code: "42601",
    });
    driver.endFailure = new Error(`socket hang up ${FAKE_PASSWORD}`);

    const outcome = await outcomeWithinBound();

    expect(outcome).toBeInstanceOf(MigrationExecutionError);
    expect((outcome as Error).cause).toEqual({ name: "Error", code: "42601" });
    expect(markersFoundOn(outcome)).toEqual([]);
    expect(driver.endCalls).toHaveLength(1);
  });

  it("still returns the summary when the close succeeds", async () => {
    resetDriver();

    const outcome = await outcomeWithinBound();

    expect(outcome).toEqual({ applied: ["0001_fake.sql"], alreadyApplied: [] });
  });
});

describe("applyMigrations when closing the session after a failed connect fails (rule B3)", () => {
  const unhandledRejections: unknown[] = [];
  const recordUnhandled = (reason: unknown): void => {
    unhandledRejections.push(reason);
  };

  it.each(["never settles", "rejects", "throws"] as const)(
    "throws the connect failure it built, with no unhandled rejection, when end() %s",
    async (endBehaviour) => {
      resetDriver();
      driver.connectFailure = Object.assign(new Error("refused"), {
        code: "ECONNREFUSED",
      });
      driver.endAfterFailedConnect = endBehaviour;
      unhandledRejections.length = 0;
      process.on("unhandledRejection", recordUnhandled);

      try {
        const error = await rejectionWithinBound(apply);
        await new Promise((resume) => setImmediate(resume));

        expect(error).toBeInstanceOf(MigrationExecutionError);
        expect((error as Error).message).toContain("Could not connect");
        expect((error as Error).cause).toEqual({
          name: "Error",
          code: "ECONNREFUSED",
        });
        expect(driver.endCalls).toHaveLength(1);
        expect(unhandledRejections).toEqual([]);
      } finally {
        process.off("unhandledRejection", recordUnhandled);
      }
    },
  );
});
