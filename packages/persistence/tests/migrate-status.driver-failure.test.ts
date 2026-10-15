import { describe, expect, it, vi } from "vitest";

import { MigrationExecutionError } from "../src/migration-errors.js";
import {
  FAKE_HOST,
  FAKE_PASSWORD,
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";

const driver = vi.hoisted((): { queryFailure: unknown } => ({
  queryFailure: undefined,
}));

vi.mock("@neondatabase/serverless", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  neon: () => ({
    query: () => Promise.reject(driver.queryFailure as Error),
  }),
}));

async function rejectionOfRead(): Promise<unknown> {
  const { readDeployedSchema } = await import("../src/migrate-status.js");
  try {
    await readDeployedSchema(WELL_FORMED_UNREACHABLE_VALUE);
  } catch (error) {
    return error;
  }
  throw new Error("readDeployedSchema resolved");
}

describe("readDeployedSchema against a driver whose query fails", () => {
  it("keeps the SQLSTATE of the failure as the cause, and nothing else of it", async () => {
    driver.queryFailure = Object.assign(new Error("permission denied"), {
      code: "42501",
    });

    const error = await rejectionOfRead();

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect((error as Error).cause).toEqual({ name: "Error", code: "42501" });
  });

  it("keeps nothing of a failure that shows the host or the password", async () => {
    driver.queryFailure = new Error(
      `fetch failed for https://${FAKE_HOST} with ${FAKE_PASSWORD}`,
    );

    const error = await rejectionOfRead();

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect((error as Error).cause).toEqual({ name: "Error" });
    expect(markersFoundOn(error)).toEqual([]);
  });
});
