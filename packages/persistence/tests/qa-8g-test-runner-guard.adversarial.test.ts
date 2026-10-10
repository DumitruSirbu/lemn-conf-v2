// The four test-only functions of this package under the two arrangements their one guard must refuse whatever else
// is true: production mode with every runner's marker set at once, and a process whose markers are all present and
// blank. The driver is mocked, so a refusal is shown by no statement having been sent.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteDesignsForTests,
  findDesignIdsForTests,
} from "../src/delete-designs-for-tests.js";
import { deleteRateLimitCountersForTests } from "../src/delete-rate-limit-counters-for-tests.js";
import { findWriteTokenHashesForTests } from "../src/find-write-token-hashes-for-tests.js";
import { driver, resetDriver } from "./support/mocked-neon-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

const TEST_URL = "postgresql://owner:secret@host.neon.tech/lemnaria_test";
const A_KEY = "a".repeat(64);
const EVERY_MARKER = ["VITEST", "TEST_WORKER_INDEX", "PLAYWRIGHT_TEST"];
const BLANKS = ["", " ", "\t\n"];

const TEST_ONLY_CALLS: readonly [string, () => Promise<unknown>][] = [
  ["deleteDesignsForTests", () => deleteDesignsForTests(["design-1"])],
  ["findDesignIdsForTests", () => findDesignIdsForTests(["design-1"])],
  [
    "deleteRateLimitCountersForTests",
    () => deleteRateLimitCountersForTests([A_KEY]),
  ],
  [
    "findWriteTokenHashesForTests",
    () => findWriteTokenHashesForTests(["design-1"]),
  ],
];

function setEveryMarkerTo(value: string): void {
  for (const marker of EVERY_MARKER) vi.stubEnv(marker, value);
}

beforeEach(() => {
  resetDriver();
  vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
  vi.stubEnv("DATABASE_URL", TEST_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(TEST_ONLY_CALLS)("%s", (name, call) => {
  it("refuses production mode with every runner's marker set at once, and sends no statement", async () => {
    setEveryMarkerTo("1");
    vi.stubEnv("NODE_ENV", "production");

    await expect(call()).rejects.toThrow(
      `${name} was called with NODE_ENV=production`,
    );
    expect(driver.statements).toEqual([]);
  });

  it.each(BLANKS)(
    "refuses a process whose every marker is set to %j, and sends no statement",
    async (blank) => {
      setEveryMarkerTo(blank);

      await expect(call()).rejects.toThrow(
        `${name} was called outside a test runner`,
      );
      expect(driver.statements).toEqual([]);
    },
  );
});
