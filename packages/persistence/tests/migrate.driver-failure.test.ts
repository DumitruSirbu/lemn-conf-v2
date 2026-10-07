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
  readonly endCalls: number[];
}

const driver = vi.hoisted(
  (): ScriptedDriver => ({
    connectFailure: undefined,
    queryFailure: undefined,
    endCalls: [],
  }),
);

vi.mock("@neondatabase/serverless", () => ({
  Client: class {
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
      return driver.connectFailure === undefined
        ? Promise.resolve()
        : new Promise(() => undefined);
    }
  },
}));

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

  it("keeps a connect failure that shows nothing of the connection as the cause", async () => {
    resetDriver();
    const failure = { type: "error" };
    driver.connectFailure = failure;

    const error = await rejectionWithinBound(apply);

    expect((error as Error).cause).toBe(failure);
  });

  it("drops a connect failure that shows the host or the password, keeping the domain error", async () => {
    resetDriver();
    driver.connectFailure = new Error(
      `getaddrinfo ENOTFOUND api.${FAKE_HOST} ${FAKE_PASSWORD}`,
    );

    const error = await rejectionWithinBound(apply);

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect(error).not.toHaveProperty("cause");
    expect(markersFoundOn(error)).toEqual([]);
  });

  it("keeps a migration's SQL failure as the cause, so its SQLSTATE stays reachable", async () => {
    resetDriver();
    const failure = Object.assign(new Error("syntax error at or near x"), {
      code: "42601",
    });
    driver.queryFailure = failure;

    const error = await rejectionWithinBound(apply);

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect((error as Error).cause).toBe(failure);
  });

  it("drops a migration failure whose error shows the connection string", async () => {
    resetDriver();
    driver.queryFailure = new Error(
      `failed over ${WELL_FORMED_UNREACHABLE_VALUE}`,
    );

    const error = await rejectionWithinBound(apply);

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect(error).not.toHaveProperty("cause");
    expect(markersFoundOn(error)).toEqual([]);
  });
});
