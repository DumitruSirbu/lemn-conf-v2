// The one guard of every test-only function of this package, asked once here and not once per function. The driver is
// mocked, so what is shown is that a refusal reaches the database not at all and that an accepted runner reaches it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { countContactSubmissionsForTests } from "../src/count-contact-submissions-for-tests.js";
import { deleteContactSubmissionsForTests } from "../src/delete-contact-submissions-for-tests.js";
import {
  deleteDesignsForTests,
  findDesignIdsForTests,
} from "../src/delete-designs-for-tests.js";
import { deleteRateLimitCountersForTests } from "../src/delete-rate-limit-counters-for-tests.js";
import { findWriteTokenHashesForTests } from "../src/find-write-token-hashes-for-tests.js";
import { requireTestRunner } from "../src/require-test-runner.js";
import {
  answerWith,
  driver,
  resetDriver,
} from "./support/mocked-neon-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

const APPLICATION_URL =
  "postgresql://owner:secret@host.neon.tech/neondb?sslmode=require";
const TEST_URL = "postgresql://owner:secret@host.neon.tech/lemnaria_test";
const A_KEY = "a".repeat(64);
const A_REQUEST_ID = "contact-test-0000000001";
const THE_MARKERS = ["VITEST", "TEST_WORKER_INDEX", "PLAYWRIGHT_TEST"] as const;

/** Every function that asks the guard, with a call that would send a statement if the guard let it. */
const CALLERS: readonly [string, () => Promise<unknown>][] = [
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
  [
    "deleteContactSubmissionsForTests",
    () => deleteContactSubmissionsForTests([A_REQUEST_ID]),
  ],
  [
    "countContactSubmissionsForTests",
    () => countContactSubmissionsForTests([A_REQUEST_ID]),
  ],
];

function onlyThisMarker(marker: string | undefined): void {
  for (const variable of THE_MARKERS) vi.stubEnv(variable, undefined);
  if (marker !== undefined) vi.stubEnv(marker, "1");
}

beforeEach(() => {
  resetDriver();
  vi.stubEnv("DATABASE_URL", APPLICATION_URL);
  vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireTestRunner", () => {
  const operation = { functionName: "someFunction", effect: "does a thing" };

  it.each(THE_MARKERS)("accepts a process marked by %s alone", (marker) => {
    onlyThisMarker(marker);

    expect(() => {
      requireTestRunner(operation);
    }).not.toThrow();
  });

  it.each(["", " ", "\t"])(
    "does not take a marker set to %j for a test runner",
    (blank) => {
      onlyThisMarker(undefined);
      vi.stubEnv("VITEST", blank);

      expect(() => {
        requireTestRunner(operation);
      }).toThrow(/outside a test runner/);
    },
  );

  it("refuses a process with none of the markers, naming the function, the markers and what it does", () => {
    onlyThisMarker(undefined);

    expect(() => {
      requireTestRunner(operation);
    }).toThrow(
      "someFunction was called outside a test runner (none of VITEST, TEST_WORKER_INDEX, PLAYWRIGHT_TEST is set). " +
        "It does a thing and exists only for test cleanup; application code must never reach it.",
    );
  });

  it.each(THE_MARKERS)(
    "refuses production even when %s is set, saying so before it says anything of runners",
    (marker) => {
      onlyThisMarker(marker);
      vi.stubEnv("NODE_ENV", "production");

      expect(() => {
        requireTestRunner(operation);
      }).toThrow(
        "someFunction was called with NODE_ENV=production. It does a thing and exists only for test cleanup; " +
          "application code must never reach it.",
      );
    },
  );
});

describe.each(CALLERS)(
  "%s asks the guard before it opens a connection",
  (name, call) => {
    it("sends no statement outside a test runner", async () => {
      onlyThisMarker(undefined);

      await expect(call()).rejects.toThrow(
        new RegExp(`${name} was called outside a test runner`),
      );
      expect(driver.statements).toEqual([]);
    });

    it("sends no statement under NODE_ENV=production even inside a test runner", async () => {
      vi.stubEnv("NODE_ENV", "production");

      await expect(call()).rejects.toThrow(
        new RegExp(`${name} was called with NODE_ENV=production`),
      );
      expect(driver.statements).toEqual([]);
    });

    it.each(THE_MARKERS)(
      "reaches the database when %s alone marks the runner",
      async (marker) => {
        onlyThisMarker(marker);
        answerWith(
          name === "countContactSubmissionsForTests" ? [{ stored: 0 }] : [],
        );

        await call();

        expect(driver.statements).toHaveLength(1);
      },
    );

    it("still sends no statement for the application's own database, whichever runner it is", async () => {
      onlyThisMarker("PLAYWRIGHT_TEST");
      vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

      await expect(call()).rejects.toThrow(
        /Refusing to run live database tests/,
      );
      expect(driver.statements).toEqual([]);
    });
  },
);
