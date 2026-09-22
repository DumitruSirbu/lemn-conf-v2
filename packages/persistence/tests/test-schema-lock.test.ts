import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";
import type { Client } from "@neondatabase/serverless";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MIGRATION_ADVISORY_LOCK_KEY } from "../src/migration-ledger.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import {
  TEST_SCHEMA_LOCK_HOOK_TIMEOUT_MS,
  TEST_SCHEMA_LOCK_IDLE_IN_TRANSACTION_TIMEOUT_MS,
  TEST_SCHEMA_LOCK_KEY,
  TEST_SCHEMA_LOCK_RELEASE_BOUND_MS,
  TEST_SCHEMA_LOCK_RELEASE_HOOK_TIMEOUT_MS,
  TEST_SCHEMA_LOCK_WAIT_BOUND_MS,
  TestSchemaLockLostError,
  TestSchemaLockReleaseTimeoutError,
  TestSchemaLockTimeoutError,
  acquireTestSchemaLock,
} from "./support/test-schema-lock.js";
import type {
  TestSchemaLockHold,
  TestSchemaLockMode,
} from "./support/test-schema-lock.js";

/**
 * The self-tests of `support/test-schema-lock.ts` (M7 wave 7T, criteria 10–12 and 14).
 *
 * **Every live test here contends on its own random key**, never on `TEST_SCHEMA_LOCK_KEY`, so this
 * file never waits on — or blocks — a real test run sharing the database. For the same reason it
 * registers no file lock itself: it takes advisory locks only and touches no table.
 */

const SUITE_NAME = "the test-schema lock (live test database, random keys)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const HERE = dirname(fileURLToPath(import.meta.url));
const HELPER_SOURCE = readFileSync(
  resolve(HERE, "support/test-schema-lock.ts"),
  "utf8",
);

/** Random keys sit in [1e9, 2e9): below 2^31, so `pg_locks` shows them as `classid = 0,
 *  objid = key`, and below both fixed keys, so they can collide with neither. */
const RANDOM_KEY_FLOOR = 1_000_000_000;
const RANDOM_KEY_SPAN = 1_000_000_000;

/** A bound short enough to keep the suite quick and long enough to be told from a round trip. */
const SHORT_WAIT_BOUND_MS = 2_000;
/** Criterion 10: a bounded wait fails no earlier than the bound and within this ceiling. */
const TIMEOUT_CEILING_MS = 5_000;
/** Criterion 12: a dead holder's lock is re-acquirable within this long. */
const DEAD_HOLDER_RELEASE_CEILING_MS = 5_000;
/** A bound no test here should come near, for requests that are expected to be granted. */
const GENEROUS_WAIT_BOUND_MS = 20_000;
/** Neon's configured idle-in-transaction limit on this project, measured in S2a. */
const NEON_CONFIGURED_IDLE_IN_TRANSACTION_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 100;
/** A release bound short enough to test, standing in for the 30 s one. */
const SHORT_RELEASE_BOUND_MS = 500;
/** A bounded release must reject no later than this after it starts. */
const RELEASE_TIMEOUT_CEILING_MS = 3_000;
/**
 * The release deadline is a local `setTimeout`, and Node's timers have millisecond granularity
 * while `performance.now()` is sub-millisecond, so a timer can fire a fraction of a millisecond
 * "early" by the test's clock (499.75 ms was observed for a 500 ms bound). The lower bound still
 * asserts "no earlier than the bound" — to within timer precision, not to a microsecond.
 */
const TIMER_TOLERANCE_MS = 5;
/** What a half-open socket answers a query with. */
const NEVER_SETTLING = new Promise<never>(() => undefined);

describe("the test-schema lock's key and bounds", () => {
  it("is not the production migration runner's advisory key (T-J6)", () => {
    expect(TEST_SCHEMA_LOCK_KEY).not.toBe(MIGRATION_ADVISORY_LOCK_KEY);
  });

  it("never imports the migration runner or its ledger module (T-J6)", () => {
    expect(HELPER_SOURCE).not.toMatch(/from\s+["'][^"']*\/migrate\.js["']/);
    expect(HELPER_SOURCE).not.toMatch(
      /from\s+["'][^"']*\/migration-ledger\.js["']/,
    );
  });

  it("gives the lock-taking hook more time than the wait, so contention fails by name", () => {
    expect(TEST_SCHEMA_LOCK_HOOK_TIMEOUT_MS).toBeGreaterThan(
      TEST_SCHEMA_LOCK_WAIT_BOUND_MS,
    );
  });

  it("gives the releasing hook more time than the release bound, so a stall fails by name", () => {
    expect(TEST_SCHEMA_LOCK_RELEASE_HOOK_TIMEOUT_MS).toBeGreaterThan(
      TEST_SCHEMA_LOCK_RELEASE_BOUND_MS,
    );
    expect(HELPER_SOURCE).toMatch(
      /afterAll\(\s*async \(\) => \{[\s\S]*?\},\s*TEST_SCHEMA_LOCK_RELEASE_HOOK_TIMEOUT_MS,?\s*\)/,
    );
  });
});

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const openHolds: TestSchemaLockHold[] = [];

  afterEach(async () => {
    await Promise.all(openHolds.splice(0).map((hold) => releaseQuietly(hold)));
  });

  async function hold(
    mode: TestSchemaLockMode,
    key: number,
    waitBoundMs = GENEROUS_WAIT_BOUND_MS,
  ) {
    const granted = await acquireTestSchemaLock({
      connectionUrl: liveTestDatabaseUrl,
      key,
      mode,
      waitBoundMs,
    });
    openHolds.push(granted);
    return granted;
  }

  it("grants two shared holders together", async () => {
    const key = randomTestKey();

    await hold("shared", key);
    await hold("shared", key, SHORT_WAIT_BOUND_MS);

    expect(await advisoryLocksOn(key)).toEqual([
      { mode: "ShareLock", granted: true },
      { mode: "ShareLock", granted: true },
    ]);
  });

  it.each<[TestSchemaLockMode, TestSchemaLockMode]>([
    ["exclusive", "shared"],
    ["shared", "exclusive"],
    ["exclusive", "exclusive"],
  ])(
    "while %s is held, a bounded %s request fails by name within [bound, 5 s]",
    async (heldMode, requestedMode) => {
      const key = randomTestKey();
      await hold(heldMode, key);

      const started = performance.now();
      const failure = await hold(requestedMode, key, SHORT_WAIT_BOUND_MS).catch(
        (error: unknown) => error,
      );
      const waitedMs = performance.now() - started;

      expect(failure).toBeInstanceOf(TestSchemaLockTimeoutError);
      expect(failure).toMatchObject({
        mode: requestedMode,
        key,
        waitBoundMs: SHORT_WAIT_BOUND_MS,
      });
      expect((failure as Error).message).toContain(
        `${String(SHORT_WAIT_BOUND_MS)} ms for the ${requestedMode}`,
      );
      expect((failure as Error).message).toContain(`key ${String(key)}`);
      expect(waitedMs).toBeGreaterThanOrEqual(SHORT_WAIT_BOUND_MS);
      expect(waitedMs).toBeLessThanOrEqual(TIMEOUT_CEILING_MS);
    },
  );

  it("grants an exclusive request queued behind a shared holder before a later shared request", async () => {
    const key = randomTestKey();
    const grantOrder: string[] = [];
    const firstReader = await hold("shared", key);

    const writer = hold("exclusive", key).then((granted) => {
      grantOrder.push("exclusive, queued first");
      return granted;
    });
    await waitForWaiters(key, 1);
    const lateReader = hold("shared", key).then((granted) => {
      grantOrder.push("shared, queued second");
      return granted;
    });
    await waitForWaiters(key, 2);
    await firstReader.release();
    await (await writer).release();
    await lateReader;

    expect(grantOrder).toEqual([
      "exclusive, queued first",
      "shared, queued second",
    ]);
  });

  it("releases the lock on release, leaving no advisory lock on the key", async () => {
    const key = randomTestKey();
    const holder = await hold("exclusive", key);

    await holder.release();

    expect(await advisoryLocksOn(key)).toEqual([]);
  });

  it("frees the lock within 5 s when the holding session dies without COMMIT", async () => {
    const key = randomTestKey();
    await hold("exclusive", key);

    await terminateHolderOf(key);
    const started = performance.now();
    const successor = await hold(
      "exclusive",
      key,
      DEAD_HOLDER_RELEASE_CEILING_MS,
    );
    const waitedMs = performance.now() - started;
    await successor.release();

    expect(waitedMs).toBeLessThanOrEqual(DEAD_HOLDER_RELEASE_CEILING_MS);
    expect(await advisoryLocksOn(key)).toEqual([]);
  });

  it("records a lost holding connection as it happens, and fails release by name", async () => {
    const key = randomTestKey();
    const holder = await hold("shared", key);

    await terminateHolderOf(key);
    await waitUntil(() => holder.hasLostConnection);

    const failure = await holder.release().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TestSchemaLockLostError);
    expect(failure).toMatchObject({ mode: "shared", key });
  });

  it("holds its transaction past Neon's configured idle-in-transaction kill", async () => {
    const holder = await hold("shared", randomTestKey());

    const timeouts = await holder.readSessionTimeouts();

    expect(timeouts.idleInTransactionSessionTimeoutMs).toBe(
      TEST_SCHEMA_LOCK_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    );
    expect(timeouts.idleInTransactionSessionTimeoutMs).toBeGreaterThan(
      NEON_CONFIGURED_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    );
    expect(timeouts.lockTimeoutMs).toBe(GENEROUS_WAIT_BOUND_MS);
  });

  it("fails a release whose connection stops answering by name, within its bound", async () => {
    const holder = await hold("exclusive", randomTestKey());
    const client = holdingClientOf(holder);
    const silence = vi
      .spyOn(client, "query")
      .mockReturnValue(NEVER_SETTLING as never);

    try {
      const started = performance.now();
      const failure = await holder
        .release(SHORT_RELEASE_BOUND_MS)
        .catch((error: unknown) => error);
      const waitedMs = performance.now() - started;

      expect(failure).toBeInstanceOf(TestSchemaLockReleaseTimeoutError);
      expect(failure).toMatchObject({
        mode: "exclusive",
        releaseBoundMs: SHORT_RELEASE_BOUND_MS,
      });
      expect(waitedMs).toBeGreaterThanOrEqual(
        SHORT_RELEASE_BOUND_MS - TIMER_TOLERANCE_MS,
      );
      expect(waitedMs).toBeLessThanOrEqual(RELEASE_TIMEOUT_CEILING_MS);
    } finally {
      silence.mockRestore();
      await client.end();
    }
  });
});

function randomTestKey(): number {
  return RANDOM_KEY_FLOOR + Math.floor(Math.random() * RANDOM_KEY_SPAN);
}

interface AdvisoryLockRow {
  mode: string;
  granted: boolean;
}

async function advisoryLocksOn(key: number): Promise<AdvisoryLockRow[]> {
  return (await neon(liveTestDatabaseUrl)`
    select mode, granted from pg_locks
     where locktype = 'advisory' and classid = 0 and objid = ${key} and objsubid = 1
     order by granted desc, mode
  `) as AdvisoryLockRow[];
}

/** Kills the backend holding `key`, as a crashed worker would lose it: no COMMIT, no unlock. */
async function terminateHolderOf(key: number): Promise<void> {
  const terminated = (await neon(liveTestDatabaseUrl)`
    select pg_terminate_backend(pid) as terminated from pg_locks
     where locktype = 'advisory' and classid = 0 and objid = ${key} and objsubid = 1 and granted
  `) as { terminated: boolean }[];
  expect(terminated).toEqual([{ terminated: true }]);
}

async function waitForWaiters(key: number, count: number): Promise<void> {
  await waitUntil(async () => {
    const waiters = (await advisoryLocksOn(key)).filter(
      (lock) => !lock.granted,
    );
    return waiters.length === count;
  });
}

async function waitUntil(
  condition: () => boolean | Promise<boolean>,
): Promise<void> {
  while (!(await condition())) {
    await new Promise((resolveAfterInterval) =>
      setTimeout(resolveAfterInterval, POLL_INTERVAL_MS),
    );
  }
}

/** The hold's private `Client`, so a test can make the very connection that holds the lock stall. */
function holdingClientOf(holder: TestSchemaLockHold): Client {
  return Reflect.get(holder, "client") as Client;
}

async function releaseQuietly(hold: TestSchemaLockHold): Promise<void> {
  try {
    await hold.release();
  } catch {
    // A test that released, or deliberately killed, its own holder has already asserted on it.
  }
}
