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

vi.mock("@neondatabase/serverless", () => ({
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
  it("keeps a failure that shows nothing of the connection as the cause", async () => {
    const failure = Object.assign(new Error("permission denied"), {
      code: "42501",
    });
    driver.queryFailure = failure;

    const error = await rejectionOfRead();

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect((error as Error).cause).toBe(failure);
  });

  it("drops a failure that shows the host or the password, keeping the domain error", async () => {
    driver.queryFailure = new Error(
      `fetch failed for https://${FAKE_HOST} with ${FAKE_PASSWORD}`,
    );

    const error = await rejectionOfRead();

    expect(error).toBeInstanceOf(MigrationExecutionError);
    expect(error).not.toHaveProperty("cause");
    expect(markersFoundOn(error)).toEqual([]);
  });
});
