import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client, neon } from "@neondatabase/serverless";
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
 * Adversarial QA of M7 wave 7T slice S2b — `support/test-schema-lock.ts` (T-J5 with Amendment A,
 * T-J6; criteria 10–12, 14, 20 and 21).
 *
 * Like the helper's own self-test, **every live test here contends on its own random key** in
 * [1e9, 2e9), never on `TEST_SCHEMA_LOCK_KEY`, and touches no table, so it neither waits on nor
 * blocks a real run sharing the test database.
 */

const SUITE_NAME =
  "QA 7T S2b: the test-schema lock under attack (live test database, random keys)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const TESTS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIRECTORY = resolve(TESTS_DIRECTORY, "..");
const HELPER_PATH = resolve(TESTS_DIRECTORY, "support/test-schema-lock.ts");
const HELPER_SOURCE = readFileSync(HELPER_PATH, "utf8");

/** Amendment A ruling 1 and 2, and T-J6: the four literals S2b item 1 says are each asserted. */
const RULED_WAIT_BOUND_MS = 180_000;
const RULED_HOOK_TIMEOUT_MS = 210_000;
const RULED_IDLE_IN_TRANSACTION_TIMEOUT_MS = 600_000;
const RULED_TEST_SCHEMA_LOCK_KEY = 3_141_592_653;

const RANDOM_KEY_FLOOR = 1_000_000_000;
const RANDOM_KEY_SPAN = 1_000_000_000;
const SIGNED_INT4_CEILING = 2 ** 31;

const SHORT_WAIT_BOUND_MS = 2_000;
const GENEROUS_WAIT_BOUND_MS = 20_000;
/** Any path from a lost lock to `release()` settling must finish well inside vitest's 30 s hook. */
const LOSS_SETTLE_CEILING_MS = 5_000;
const DEAD_HOLDER_RELEASE_CEILING_MS = 5_000;
const SHORTENED_IDLE_TIMEOUT_MS = 1_000;
const LOCK_NOT_AVAILABLE_SQLSTATE = "55P03";
const POLL_INTERVAL_MS = 50;
/** The release bound and its hook, as the coordinator relayed them for the second S2b round. */
const RELAYED_RELEASE_BOUND_MS = 30_000;
const RELAYED_RELEASE_HOOK_TIMEOUT_MS = 60_000;
const SHORT_RELEASE_BOUND_MS = 1_000;
const HEALTHY_RELEASE_SAMPLE_SIZE = 10;
/** A healthy release is one COMMIT and one close; a tenth of the bound is already ~300 round trips. */
const HEALTHY_RELEASE_CEILING_MS = TEST_SCHEMA_LOCK_RELEASE_BOUND_MS / 10;
/** Offsets, in ms, between asking the server to kill the holder and calling `release()`. The
 *  kill's HTTP round trip is tens of ms, so the low offsets put COMMIT on the wire before the
 *  FATAL arrives and the high ones after it: the sweep crosses the COMMIT-before-error window. */
const RELEASE_OFFSETS_AFTER_KILL_MS = [0, 5, 10, 20, 30, 45, 60, 90, 130, 200];

type Settlement =
  | { readonly state: "resolved" }
  | { readonly state: "rejected"; readonly error: unknown }
  | { readonly state: "still pending" };

describe("QA 7T S2b: the four ruled constants, as literals (S2b item 1, criterion 10)", () => {
  it("waits 180 s for the lock (Amendment A ruling 1)", () => {
    expect(TEST_SCHEMA_LOCK_WAIT_BOUND_MS).toBe(RULED_WAIT_BOUND_MS);
  });

  it("gives the lock-taking hook 210 s (Amendment A ruling 1)", () => {
    expect(TEST_SCHEMA_LOCK_HOOK_TIMEOUT_MS).toBe(RULED_HOOK_TIMEOUT_MS);
  });

  it("raises the holder's idle-in-transaction limit to a finite 600 s (Amendment A ruling 2)", () => {
    expect(TEST_SCHEMA_LOCK_IDLE_IN_TRANSACTION_TIMEOUT_MS).toBe(
      RULED_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    );
  });

  it("uses one fixed test-only key (T-J6)", () => {
    expect(TEST_SCHEMA_LOCK_KEY).toBe(RULED_TEST_SCHEMA_LOCK_KEY);
  });

  it("bounds release at 30 s, and gives the releasing hook 60 s", () => {
    expect(TEST_SCHEMA_LOCK_RELEASE_BOUND_MS).toBe(RELAYED_RELEASE_BOUND_MS);
    expect(TEST_SCHEMA_LOCK_RELEASE_HOOK_TIMEOUT_MS).toBe(
      RELAYED_RELEASE_HOOK_TIMEOUT_MS,
    );
  });

  it("passes the 60 s hook timeout to the afterAll that releases the lock", () => {
    expect(HELPER_SOURCE).toMatch(
      /afterAll\(\s*async \(\) => \{[\s\S]*?\},\s*TEST_SCHEMA_LOCK_RELEASE_HOOK_TIMEOUT_MS,?\s*\)/,
    );
  });

  it("passes the 210 s hook timeout to the beforeAll that takes the lock", () => {
    expect(HELPER_SOURCE).toMatch(
      /beforeAll\(\s*async \(\) => \{[\s\S]*?\},\s*TEST_SCHEMA_LOCK_HOOK_TIMEOUT_MS,?\s*\)/,
    );
  });
});

describe("QA 7T S2b: the key cannot collide (T-J6)", () => {
  it("sits above every random self-test key and below the bigint ceiling", () => {
    expect(TEST_SCHEMA_LOCK_KEY).toBeGreaterThanOrEqual(SIGNED_INT4_CEILING);
    expect(TEST_SCHEMA_LOCK_KEY).toBeGreaterThanOrEqual(
      RANDOM_KEY_FLOOR + RANDOM_KEY_SPAN,
    );
    expect(Number.isSafeInteger(TEST_SCHEMA_LOCK_KEY)).toBe(true);
  });

  it("is not the migration runner's key", () => {
    expect(TEST_SCHEMA_LOCK_KEY).not.toBe(MIGRATION_ADVISORY_LOCK_KEY);
  });

  it("is named nowhere under src, so no production path can take it", () => {
    const sourcesNamingTheKey = typeScriptFilesUnder(
      join(PACKAGE_DIRECTORY, "src"),
    ).filter((path) => /3_?141_?592_?653/.test(readFileSync(path, "utf8")));

    expect(sourcesNamingTheKey).toEqual([]);
  });

  it("reaches neither migrate.ts nor migration-ledger.ts through any chain of relative imports", () => {
    const reached = relativeImportClosureOf(HELPER_PATH).map((path) =>
      relative(PACKAGE_DIRECTORY, path),
    );

    expect(reached).not.toContain("src/migrate.ts");
    expect(reached).not.toContain("src/migration-ledger.ts");
  });
});

describe("QA 7T S2b: a file declares exactly one mode (the 'registered twice' guard)", () => {
  afterEach(() => {
    vi.doUnmock("./support/live-test-database.js");
    vi.resetModules();
  });

  it.each<[string, string, string]>([
    ["holdSharedTestSchemaLock", "holdExclusiveTestSchemaLock", "shared"],
    ["holdExclusiveTestSchemaLock", "holdSharedTestSchemaLock", "exclusive"],
    ["holdSharedTestSchemaLock", "holdSharedTestSchemaLock", "shared"],
    ["holdExclusiveTestSchemaLock", "holdExclusiveTestSchemaLock", "exclusive"],
  ])(
    "after %s, a second call to %s throws naming the first mode",
    async (first, second, firstMode) => {
      const helper = await freshHelperWithNoLiveDatabase();
      const registerFirst = registrationNamed(helper, first);
      const registerSecond = registrationNamed(helper, second);

      registerFirst();

      expect(registerSecond).toThrow(
        `This file already holds the ${firstMode} test-schema lock`,
      );
    },
  );

  it("lets the first registration through", async () => {
    const helper = await freshHelperWithNoLiveDatabase();

    expect(
      registrationNamed(helper, "holdExclusiveTestSchemaLock"),
    ).not.toThrow();
  });
});

describe("QA 7T S2b: every file vitest runs is one the census can see", () => {
  it("has no *.test.ts below tests/, where the census's non-recursive sweep cannot reach", () => {
    const nested = typeScriptFilesUnder(TESTS_DIRECTORY)
      .filter((path) => path.endsWith(".test.ts"))
      .filter((path) => dirname(path) !== TESTS_DIRECTORY)
      .map((path) => relative(TESTS_DIRECTORY, path));

    expect(nested).toEqual([]);
  });
});

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  const openHolds: TestSchemaLockHold[] = [];

  afterEach(async () => {
    await Promise.all(
      openHolds.splice(0).map((hold) => releaseWithinCeiling(hold)),
    );
  });

  async function hold(
    mode: TestSchemaLockMode,
    key: number,
    waitBoundMs = GENEROUS_WAIT_BOUND_MS,
  ): Promise<TestSchemaLockHold> {
    const granted = await acquireTestSchemaLock({
      connectionUrl: liveTestDatabaseUrl,
      key,
      mode,
      waitBoundMs,
    });
    openHolds.push(granted);
    return granted;
  }

  describe("the named timeout", () => {
    it("carries SQLSTATE 55P03 as its cause and names itself (criterion 10)", async () => {
      const key = randomTestKey();
      await hold("exclusive", key);

      const failure = await hold("shared", key, SHORT_WAIT_BOUND_MS).catch(
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(TestSchemaLockTimeoutError);
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).name).toBe("TestSchemaLockTimeoutError");
      expect((failure as Error).cause).toMatchObject({
        code: LOCK_NOT_AVAILABLE_SQLSTATE,
      });
    });

    it("leaves no waiter and no connection behind on the key after it fires", async () => {
      const key = randomTestKey();
      await hold("exclusive", key);

      await hold("exclusive", key, SHORT_WAIT_BOUND_MS).catch(() => undefined);

      expect(await advisoryLocksOn(key)).toEqual([
        { mode: "ExclusiveLock", granted: true },
      ]);
    });
  });

  describe("three or more holders", () => {
    it("grants three shared holders together", async () => {
      const key = randomTestKey();

      await Promise.all([
        hold("shared", key),
        hold("shared", key),
        hold("shared", key, SHORT_WAIT_BOUND_MS),
      ]);

      expect(await advisoryLocksOn(key)).toEqual([
        { mode: "ShareLock", granted: true },
        { mode: "ShareLock", granted: true },
        { mode: "ShareLock", granted: true },
      ]);
    });

    it("keeps an exclusive request queued behind two shared holders until both release, then serves it before a later shared request", async () => {
      const key = randomTestKey();
      const grantOrder: string[] = [];
      const firstReader = await hold("shared", key);
      const secondReader = await hold("shared", key);
      const writer = hold("exclusive", key).then((granted) => {
        grantOrder.push("exclusive");
        return granted;
      });
      await waitForWaiters(key, 1);
      const lateReader = hold("shared", key).then((granted) => {
        grantOrder.push("late shared");
        return granted;
      });
      await waitForWaiters(key, 2);

      await firstReader.release();
      await sleep(500);
      const orderWhileOneReaderRemains = [...grantOrder];
      await secondReader.release();
      await (await writer).release();
      await lateReader;

      expect(orderWhileOneReaderRemains).toEqual([]);
      expect(grantOrder).toEqual(["exclusive", "late shared"]);
    });

    it("lets the later shared request through once a queued exclusive request times out by name", async () => {
      const key = randomTestKey();
      await hold("shared", key);
      await hold("shared", key);
      const writer = hold("exclusive", key, SHORT_WAIT_BOUND_MS).catch(
        (error: unknown) => error,
      );
      await waitForWaiters(key, 1);
      const lateReader = hold("shared", key);
      await waitForWaiters(key, 2);

      const writerFailure = await writer;
      const lateReaderSettlement = await settleWithin(
        lateReader,
        LOSS_SETTLE_CEILING_MS,
      );

      expect(writerFailure).toBeInstanceOf(TestSchemaLockTimeoutError);
      expect(writerFailure).toMatchObject({
        mode: "exclusive",
        key,
        waitBoundMs: SHORT_WAIT_BOUND_MS,
      });
      expect(lateReaderSettlement.state).toBe("resolved");
    });
  });

  describe("losing the lock (Amendment A ruling 3, criterion 21)", () => {
    it("throws the named loss, with its recorded cause, when the backend is terminated", async () => {
      const key = randomTestKey();
      const holder = await hold("exclusive", key);

      await terminateHolderOf(key);
      await waitUntil(() => holder.hasLostConnection);
      const failure = await holder.release().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(TestSchemaLockLostError);
      expect((failure as Error).name).toBe("TestSchemaLockLostError");
      expect((failure as Error).cause).toBeInstanceOf(Error);
    });

    it("throws the named loss within 5 s when release is called before the error event is seen", async () => {
      const key = randomTestKey();
      const holder = await hold("shared", key);

      await terminateHolderOf(key);
      const settlement = await settleWithin(
        holder.release(),
        LOSS_SETTLE_CEILING_MS,
      );

      expect(settlement).toMatchObject({ state: "rejected" });
      expect(errorOf(settlement)).toBeInstanceOf(TestSchemaLockLostError);
    });

    it.each(RELEASE_OFFSETS_AFTER_KILL_MS)(
      "settles within 5 s, as a clean release or the named loss and nothing else, when release follows the kill request by %i ms (COMMIT racing the FATAL)",
      async (offsetMs) => {
        const key = randomTestKey();
        const holder = await hold("exclusive", key);

        const kill = settleWithin(
          terminateBackendsOn(key, "granted"),
          LOSS_SETTLE_CEILING_MS,
        );
        await sleep(offsetMs);
        const settlement = await settleWithin(
          holder.release(),
          LOSS_SETTLE_CEILING_MS,
        );
        await kill;

        expect(settlement.state).not.toBe("still pending");
        if (settlement.state === "rejected") {
          expect(settlement.error).toBeInstanceOf(TestSchemaLockLostError);
        }
        expect(await advisoryLocksOn(key)).toEqual([]);
      },
    );

    it("throws the named loss when the server's idle-in-transaction limit kills the holder", async () => {
      const key = randomTestKey();
      const holder = await hold("shared", key);
      await holdingClientOf(holder).query(
        "select set_config('idle_in_transaction_session_timeout', $1, true)",
        [`${String(SHORTENED_IDLE_TIMEOUT_MS)}ms`],
      );

      await waitUntil(() => holder.hasLostConnection);
      const settlement = await settleWithin(
        holder.release(),
        LOSS_SETTLE_CEILING_MS,
      );

      expect(errorOf(settlement)).toBeInstanceOf(TestSchemaLockLostError);
      expect(await advisoryLocksOn(key)).toEqual([]);
    });

    it("throws the named loss within 5 s when the holder's socket drops, and the server frees the lock", async () => {
      const key = randomTestKey();
      const holder = await hold("exclusive", key);

      destroySocketOf(holdingClientOf(holder));
      const settlement = await settleWithin(
        holder.release(),
        LOSS_SETTLE_CEILING_MS,
      );
      const successor = await settleWithin(
        hold("exclusive", key, DEAD_HOLDER_RELEASE_CEILING_MS),
        DEAD_HOLDER_RELEASE_CEILING_MS + LOSS_SETTLE_CEILING_MS,
      );

      expect(errorOf(settlement)).toBeInstanceOf(TestSchemaLockLostError);
      expect(successor.state).toBe("resolved");
    });

    it("throws the named loss when COMMIT itself receives the server's FATAL, before any error event", async () => {
      const key = randomTestKey();
      const holder = await hold("exclusive", key);
      const client = holdingClientOf(holder);

      const release = holder.release();
      deliverFatalToActiveQuery(client);
      const settlement = await settleWithin(release, LOSS_SETTLE_CEILING_MS);

      expect(settlement).toMatchObject({ state: "rejected" });
      expect(errorOf(settlement)).toBeInstanceOf(TestSchemaLockLostError);
      expect((errorOf(settlement) as Error).cause).toMatchObject({
        code: "57P01",
      });
    });

    it("settles within 5 s when the socket closes after COMMIT failed but before release finishes", async () => {
      const key = randomTestKey();
      const holder = await hold("exclusive", key);
      const client = holdingClientOf(holder);

      const release = holder.release();
      deliverFatalToActiveQuery(client);
      destroySocketOf(client);
      const settlement = await settleWithin(release, LOSS_SETTLE_CEILING_MS);

      expect(settlement).toMatchObject({ state: "rejected" });
      expect(errorOf(settlement)).toBeInstanceOf(TestSchemaLockLostError);
    });

    it("does not hang acquisition when the waiting backend is killed while it queues", async () => {
      const key = randomTestKey();
      await hold("exclusive", key);
      const waiter = settleWithin(
        hold("exclusive", key, GENEROUS_WAIT_BOUND_MS),
        GENEROUS_WAIT_BOUND_MS,
      );
      await waitForWaiters(key, 1);

      const started = performance.now();
      expect(await terminateBackendsOn(key, "waiting")).toBe(1);
      const settlement = await waiter;
      const settledAfterMs = performance.now() - started;

      expect(settledAfterMs).toBeLessThanOrEqual(LOSS_SETTLE_CEILING_MS);

      expect(settlement.state).toBe("rejected");
    });
  });

  describe("the release bound", () => {
    it("fails by name within [bound, bound + 2 s] when the holding socket stops answering", async () => {
      const key = randomTestKey();
      const holder = await hold("exclusive", key);
      blackHoleWritesOf(holdingClientOf(holder));

      const started = performance.now();
      const failure = await holder
        .release(SHORT_RELEASE_BOUND_MS)
        .catch((error: unknown) => error);
      const waitedMs = performance.now() - started;
      destroySocketOf(holdingClientOf(holder));

      expect(failure).toBeInstanceOf(TestSchemaLockReleaseTimeoutError);
      expect(failure).toMatchObject({
        name: "TestSchemaLockReleaseTimeoutError",
        mode: "exclusive",
        key,
        releaseBoundMs: SHORT_RELEASE_BOUND_MS,
      });
      expect(waitedMs).toBeGreaterThanOrEqual(SHORT_RELEASE_BOUND_MS);
      expect(waitedMs).toBeLessThanOrEqual(SHORT_RELEASE_BOUND_MS + 2_000);
    });

    it("reports a recorded loss, not a release timeout, even with a zero bound", async () => {
      const key = randomTestKey();
      const holder = await hold("shared", key);
      await terminateHolderOf(key);
      await waitUntil(() => holder.hasLostConnection);

      const failure = await holder.release(0).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(TestSchemaLockLostError);
    });

    it("reports a loss delivered to COMMIT as a loss, even when the dying socket then goes silent past the bound", async () => {
      const key = randomTestKey();
      const holder = await hold("exclusive", key);
      const client = holdingClientOf(holder);

      blackHoleWritesOf(client);
      const release = holder.release(SHORT_RELEASE_BOUND_MS);
      deliverFatalToActiveQuery(client);
      const failure = await release.catch((error: unknown) => error);
      destroySocketOf(client);

      expect(failure).toBeInstanceOf(TestSchemaLockLostError);
    });

    it("finishes a healthy release in a tenth of the bound", async () => {
      const durationsMs: number[] = [];
      for (let sample = 0; sample < HEALTHY_RELEASE_SAMPLE_SIZE; sample += 1) {
        const holder = await hold("shared", randomTestKey());
        const started = performance.now();
        await holder.release();
        durationsMs.push(performance.now() - started);
      }

      expect(Math.max(...durationsMs)).toBeLessThan(HEALTHY_RELEASE_CEILING_MS);
    });
  });

  describe("scope: nothing outlives release", () => {
    it("leaves the holder's backend with no advisory lock and no open transaction", async () => {
      const key = randomTestKey();
      const holder = await hold("exclusive", key);
      const holderPid = await backendPidOf(holdingClientOf(holder));

      await holder.release();

      expect(await advisoryLocksHeldBy(holderPid)).toEqual([]);
      expect(await transactionStateOf(holderPid)).not.toBe(
        "idle in transaction",
      );
    });

    it("leaves the server's own timeouts on a pooled backend reused after release", async () => {
      const serverDefaults = await timeoutsOnAFreshConnection();
      const holder = await hold("shared", randomTestKey());
      const holderPid = await backendPidOf(holdingClientOf(holder));

      await holder.release();
      const reuse = await findFreshConnectionOnBackend(holderPid);

      expect(reuse).toBeDefined();
      expect(reuse?.timeouts).toEqual(serverDefaults);
    });
  });
});

async function freshHelperWithNoLiveDatabase(): Promise<
  Record<string, unknown>
> {
  vi.resetModules();
  vi.doMock("./support/live-test-database.js", () => ({
    isLiveTestDatabaseConfigured: false,
    liveTestDatabaseUrl: "",
  }));
  return (await import("./support/test-schema-lock.js")) as Record<
    string,
    unknown
  >;
}

function registrationNamed(
  helper: Record<string, unknown>,
  name: string,
): () => void {
  const registration = helper[name];
  if (typeof registration !== "function") {
    throw new Error(`The helper exports no registration named ${name}`);
  }
  return registration as () => void;
}

function typeScriptFilesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts"))
    .map((path) => join(directory, path))
    .sort();
}

function relativeImportClosureOf(entry: string): string[] {
  const reached = new Set<string>();
  const pending = [entry];
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (reached.has(path)) continue;
    reached.add(path);
    pending.push(...relativeImportsOf(path));
  }
  return [...reached].sort();
}

function relativeImportsOf(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const specifiers = [
    ...source.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g),
  ].map((match) => match[1] ?? "");
  return specifiers.map((specifier) =>
    resolve(dirname(path), specifier.replace(/\.js$/, ".ts")),
  );
}

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

async function advisoryLocksHeldBy(pid: number): Promise<AdvisoryLockRow[]> {
  return (await neon(liveTestDatabaseUrl)`
    select mode, granted from pg_locks where locktype = 'advisory' and pid = ${pid}
  `) as AdvisoryLockRow[];
}

async function transactionStateOf(pid: number): Promise<string | undefined> {
  const rows = (await neon(liveTestDatabaseUrl)`
    select state from pg_stat_activity where pid = ${pid}
  `) as { state: string | null }[];
  return rows[0]?.state ?? undefined;
}

/** Kills the backend holding `key`, as a crashed worker or an idle kill would: no COMMIT. */
async function terminateHolderOf(key: number): Promise<void> {
  const terminated = (await neon(liveTestDatabaseUrl)`
    select pg_terminate_backend(pid) as terminated from pg_locks
     where locktype = 'advisory' and classid = 0 and objid = ${key} and objsubid = 1 and granted
  `) as { terminated: boolean }[];
  expect(terminated).toEqual([{ terminated: true }]);
}

/** Kills whichever backends hold (or wait for) `key`, and says how many it signalled. */
async function terminateBackendsOn(
  key: number,
  which: "granted" | "waiting",
): Promise<number> {
  const isGranted = which === "granted";
  const terminated = (await neon(liveTestDatabaseUrl)`
    select pg_terminate_backend(pid) as terminated from pg_locks
     where locktype = 'advisory' and classid = 0 and objid = ${key} and objsubid = 1
       and granted = ${isGranted}
  `) as { terminated: boolean }[];
  return terminated.filter((row) => row.terminated).length;
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
  while (!(await condition())) await sleep(POLL_INTERVAL_MS);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolveAfterDelay) =>
    setTimeout(resolveAfterDelay, milliseconds),
  );
}

async function settleWithin(
  promise: Promise<unknown>,
  ceilingMs: number,
): Promise<Settlement> {
  const pending: Settlement = { state: "still pending" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ceiling = new Promise<Settlement>((resolveAtCeiling) => {
    timer = setTimeout(() => {
      resolveAtCeiling(pending);
    }, ceilingMs);
  });
  const outcome = promise.then(
    (): Settlement => ({ state: "resolved" }),
    (error: unknown): Settlement => ({ state: "rejected", error }),
  );
  const settlement = await Promise.race([outcome, ceiling]);
  clearTimeout(timer);
  return settlement;
}

function errorOf(settlement: Settlement): unknown {
  return settlement.state === "rejected" ? settlement.error : settlement;
}

async function releaseWithinCeiling(hold: TestSchemaLockHold): Promise<void> {
  await settleWithin(hold.release(), LOSS_SETTLE_CEILING_MS);
}

/** The hold's private `Client`: the attacks below act on the very connection that holds the lock. */
function holdingClientOf(hold: TestSchemaLockHold): Client {
  return Reflect.get(hold, "client") as Client;
}

async function backendPidOf(client: Client): Promise<number> {
  const { rows } = await client.query<{ pid: number }>(
    "select pg_backend_pid() as pid",
  );
  return rows[0]?.pid ?? Number.NaN;
}

interface WireConnection {
  readonly stream: { destroy: () => void; write: unknown };
  emit: (event: string, payload: unknown) => boolean;
}

function wireConnectionOf(client: Client): WireConnection {
  return Reflect.get(client, "connection") as WireConnection;
}

/** A network drop: the socket goes away with no server message and no COMMIT. */
/** A half-open socket: everything the client sends vanishes, and nothing comes back. */
function blackHoleWritesOf(client: Client): void {
  Reflect.set(wireConnectionOf(client).stream, "write", () => true);
}

function destroySocketOf(client: Client): void {
  wireConnectionOf(client).stream.destroy();
}

/** What the server sends a terminated backend, delivered while COMMIT is the active query — the
 *  ordering in which the driver hands the FATAL to the query and emits no `error` event. */
function deliverFatalToActiveQuery(client: Client): void {
  const fatal = Object.assign(
    new Error("terminating connection due to administrator command"),
    { code: "57P01", severity: "FATAL" },
  );
  wireConnectionOf(client).emit("errorMessage", fatal);
}

interface SessionTimeouts {
  lockTimeout: string;
  idleInTransactionSessionTimeout: string;
}

async function timeoutsOnAFreshConnection(): Promise<SessionTimeouts> {
  return (await readFromAFreshConnection()).timeouts;
}

async function findFreshConnectionOnBackend(
  pid: number,
): Promise<{ timeouts: SessionTimeouts } | undefined> {
  const MAXIMUM_ATTEMPTS = 20;
  for (let attempt = 0; attempt < MAXIMUM_ATTEMPTS; attempt += 1) {
    const reading = await readFromAFreshConnection();
    if (reading.pid === pid) return reading;
  }
  return undefined;
}

async function readFromAFreshConnection(): Promise<{
  pid: number;
  timeouts: SessionTimeouts;
}> {
  const client = new Client(liveTestDatabaseUrl);
  client.on("error", () => undefined);
  await client.connect();
  try {
    const { rows } = await client.query<{
      pid: number;
      lock_timeout: string;
      idle: string;
    }>(
      `select pg_backend_pid() as pid, current_setting('lock_timeout') as lock_timeout,
              current_setting('idle_in_transaction_session_timeout') as idle`,
    );
    const row = rows[0];
    if (row === undefined)
      throw new Error("The settings probe returned no row");
    return {
      pid: row.pid,
      timeouts: {
        lockTimeout: row.lock_timeout,
        idleInTransactionSessionTimeout: row.idle,
      },
    };
  } finally {
    await client.end();
  }
}
