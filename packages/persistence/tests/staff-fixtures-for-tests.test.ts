// The guards of the staff fixture helpers, with the driver mocked: a refusal reaches the database not at all. What the
// helpers do to rows is shown by the live file beside this one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  countStaffFixturesForTests,
  plantStaffAccountForTests,
  plantStaffAuditEventForTests,
  plantStaffDesignForTests,
  plantStaffNoteForTests,
  plantStaffRequestForTests,
  plantStaffRequestStateForTests,
  removeStaffFixturesForTests,
} from "../src/staff-fixtures-for-tests.js";
import { driver, resetDriver } from "./support/mocked-neon-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

const APPLICATION_URL =
  "postgresql://owner:secret@host.neon.tech/neondb?sslmode=require";
const TEST_URL = "postgresql://owner:secret@host.neon.tech/lemnaria_test";
const MARKER = "abcd1234";
const AN_ID = "A".repeat(21);
const A_DIGEST = "a".repeat(64);
const THE_RUNNER_MARKERS = [
  "VITEST",
  "TEST_WORKER_INDEX",
  "PLAYWRIGHT_TEST",
] as const;

/** Every function of the file, with a call that would send a statement if no guard stood in front of it. */
const CALLERS: readonly [string, (marker: string) => Promise<unknown>][] = [
  [
    "plantStaffAccountForTests",
    (marker) => plantStaffAccountForTests(marker, { role: "operator" }),
  ],
  [
    "plantStaffDesignForTests",
    (marker) => plantStaffDesignForTests(marker, { kind: "visible" }),
  ],
  [
    "plantStaffRequestForTests",
    (marker) => plantStaffRequestForTests(marker, { designId: AN_ID }),
  ],
  [
    "plantStaffRequestStateForTests",
    (marker) =>
      plantStaffRequestStateForTests(marker, {
        designId: AN_ID,
        status: "new",
        changedByAccountId: AN_ID,
      }),
  ],
  [
    "plantStaffNoteForTests",
    (marker) =>
      plantStaffNoteForTests(marker, {
        designId: AN_ID,
        authorAccountId: AN_ID,
        body: "note",
      }),
  ],
  [
    "plantStaffAuditEventForTests",
    (marker) =>
      plantStaffAuditEventForTests(marker, {
        actorAccountId: AN_ID,
        action: "kitchens-listed",
      }),
  ],
  [
    "removeStaffFixturesForTests",
    (marker) => removeStaffFixturesForTests(marker),
  ],
  [
    "countStaffFixturesForTests",
    (marker) => countStaffFixturesForTests(marker),
  ],
];

beforeEach(() => {
  resetDriver();
  vi.stubEnv("DATABASE_URL", APPLICATION_URL);
  vi.stubEnv("TEST_DATABASE_URL", TEST_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(CALLERS)("%s", (name, call) => {
  it("sends no statement outside a test runner", async () => {
    for (const variable of THE_RUNNER_MARKERS) vi.stubEnv(variable, undefined);

    await expect(call(MARKER)).rejects.toThrow(
      new RegExp(`${name} was called outside a test runner`),
    );
    expect(driver.statements).toEqual([]);
  });

  it("sends no statement under NODE_ENV=production even inside a test runner", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(call(MARKER)).rejects.toThrow(
      new RegExp(`${name} was called with NODE_ENV=production`),
    );
    expect(driver.statements).toEqual([]);
  });

  it("sends no statement for the application's own database", async () => {
    vi.stubEnv("TEST_DATABASE_URL", APPLICATION_URL);

    await expect(call(MARKER)).rejects.toThrow(
      /Refusing to run live database tests/,
    );
    expect(driver.statements).toEqual([]);
  });

  it.each(["", "abc", "abcd123456", "abcd_123", "abcd%123", "abcd 123"])(
    "sends no statement for the marker %j, which could name more rows than its own",
    async (marker) => {
      await expect(call(marker)).rejects.toThrow(
        /a staff fixture marker must be exactly 8 letters or digits/,
      );
      expect(driver.statements).toEqual([]);
    },
  );
});

describe("what the helpers refuse before any statement", () => {
  it.each([
    [
      "a role outside the three",
      () =>
        plantStaffAccountForTests(MARKER, {
          role: "owner" as unknown as "client",
        }),
      /the role must be client, operator or administrator/,
    ],
    [
      "a session hash that is not a digest",
      () =>
        plantStaffAccountForTests(MARKER, {
          role: "operator",
          sessionTokenHash: "token",
        }),
      /session token hash must be a 64-character/,
    ],
    [
      "a password hash that is not argon2id",
      () =>
        plantStaffAccountForTests(MARKER, {
          role: "operator",
          passwordHash: "plain",
        }),
      /argon2id PHC string/,
    ],
    [
      "an owner for a visitor draft",
      () =>
        plantStaffDesignForTests(MARKER, {
          kind: "visitor-draft",
          ownerAccountId: AN_ID,
        }),
      /a visitor draft has no owner/,
    ],
    [
      "a design kind outside the four",
      () =>
        plantStaffDesignForTests(MARKER, {
          kind: "toString" as unknown as "visible",
        }),
      /the kind is not one of the four/,
    ],
    [
      "a status the domain does not list",
      () =>
        plantStaffRequestStateForTests(MARKER, {
          designId: AN_ID,
          status: "won" as unknown as "new",
          changedByAccountId: AN_ID,
        }),
      /not one the domain lists/,
    ],
    [
      "an audit action the domain does not list",
      () =>
        plantStaffAuditEventForTests(MARKER, {
          actorAccountId: AN_ID,
          action: "everything" as unknown as "kitchens-listed",
        }),
      /the action is not one the domain lists/,
    ],
    [
      "a kitchen action with no kitchen",
      () =>
        plantStaffAuditEventForTests(MARKER, {
          actorAccountId: AN_ID,
          action: "note-added",
        }),
      /a design id is required exactly for the actions that name a kitchen/,
    ],
    [
      "a list action that names a kitchen",
      () =>
        plantStaffAuditEventForTests(MARKER, {
          actorAccountId: AN_ID,
          action: "audit-viewed",
          designId: AN_ID,
        }),
      /a design id is required exactly for the actions that name a kitchen/,
    ],
    [
      "a design id of the wrong shape",
      () => plantStaffRequestForTests(MARKER, { designId: "short%" }),
      /design id must be the 21 URL-safe characters/,
    ],
    [
      "a rate-limit key that is not a digest, on removal",
      () => removeStaffFixturesForTests(MARKER, { rateLimitKeys: ["%"] }),
      /rate-limit bucket key must be a 64-character/,
    ],
    [
      "a rate-limit key that is not a digest, on a count",
      () =>
        countStaffFixturesForTests(MARKER, {
          rateLimitKeys: [A_DIGEST, "%"],
        }),
      /rate-limit bucket key must be a 64-character/,
    ],
  ] as const)("refuses %s", async (_what, call, refusal) => {
    await expect(call()).rejects.toThrow(refusal);
    expect(driver.statements).toEqual([]);
  });
});
