import { Client } from "@neondatabase/serverless";
import { afterAll, beforeAll } from "vitest";

import {
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./live-test-database.js";

/**
 * The one place a live test file declares how it shares the test database with other runs
 * (M7 wave 7T, rulings T-J5 to T-J7).
 *
 * **Why it exists.** Two gate runs against one test database corrupted its migration ledger on
 * 2026-09-18 (BACKLOG 69): one run dropped a column or forgot ledger rows while the other was
 * minting or migrating. A file that mutates shared schema, or asserts a whole-table aggregate, holds
 * the lock **exclusively** for the whole file; a file that only needs the schema intact holds it
 * **shared**. Shared holders run beside each other; an exclusive holder runs alone.
 *
 * **How it holds.** A readers–writer advisory lock taken with `pg_advisory_xact_lock[_shared]`
 * inside a transaction left open on one dedicated `Client` from the file's first hook to its last,
 * and released by `COMMIT`. Transaction scope is deliberate, and is ADR 0042 decision 3's reason: a
 * worker that dies closes its socket, the transaction rolls back, and the lock goes with it — there
 * is no unlock to forget. The request **blocks** rather than polling with `pg_try_…`, because
 * Postgres queues a blocking request and so an exclusive requester cannot starve behind a stream of
 * shared ones (measured in S2a, 2026-09-22).
 *
 * **Must not** import the migration runner or use its lock key (T-J6): the runner's own
 * per-migration lock has to keep running, unchanged, inside an exclusive holder's window.
 */

export type TestSchemaLockMode = "shared" | "exclusive";

/** Test-only advisory key. Above 2^31, so it can never equal a self-test's random key (which stay
 *  below it), and it is not `MIGRATION_ADVISORY_LOCK_KEY` (T-J6). */
export const TEST_SCHEMA_LOCK_KEY = 3_141_592_653;

/** How long a file waits for a conflicting run to finish before failing with a named error.
 *  180 s is T-J5 Amendment A ruling 1 (2026-09-22), the ruling of record: keyed on the longest hold
 *  of **any** mode, because an exclusive request queues behind a shared holder just as a shared one
 *  queues behind it.
 *
 *  The ruling's own figure — S2a's shared files at about 85 s each — does not reproduce now that
 *  the five files hold the lock for real. Measured locally at S2c, two runners at once: exclusive
 *  12.9–15.1 s, shared 7.4–9.1 s. **The bound is deliberately not re-keyed to those numbers here**;
 *  ruling 4 holds it until criterion 18's CI run measures the same holds against Neon from a CI
 *  runner, and the coordinator re-keys it once. */
export const TEST_SCHEMA_LOCK_WAIT_BOUND_MS = 180_000;

/** Head-room a hook gets above the bound it enforces, so a stall surfaces as this module's named
 *  error and never as vitest's anonymous hook timeout. */
const HOOK_MARGIN_ABOVE_BOUND_MS = 30_000;

/** The timeout of the `beforeAll` that takes the lock: the wait bound plus a margin (210 s). */
export const TEST_SCHEMA_LOCK_HOOK_TIMEOUT_MS =
  TEST_SCHEMA_LOCK_WAIT_BOUND_MS + HOOK_MARGIN_ABOVE_BOUND_MS;

/** How long releasing — COMMIT, then closing the connection — may take. A healthy release is one
 *  round trip; a half-open socket never answers, and without a bound it would surface as vitest's
 *  anonymous 30 s hook timeout instead of `TestSchemaLockReleaseTimeoutError`. */
export const TEST_SCHEMA_LOCK_RELEASE_BOUND_MS = 30_000;

/** The timeout of the `afterAll` that releases the lock: the release bound plus a margin (60 s). */
export const TEST_SCHEMA_LOCK_RELEASE_HOOK_TIMEOUT_MS =
  TEST_SCHEMA_LOCK_RELEASE_BOUND_MS + HOOK_MARGIN_ABOVE_BOUND_MS;

/** The holding transaction's idle-in-transaction limit. Neon's configuration kills an idle
 *  transaction at 300 s (measured in S2a), and a file can hold the lock longer than that while its
 *  tests run on other connections — so the holder raises its own limit for its own transaction. */
export const TEST_SCHEMA_LOCK_IDLE_IN_TRANSACTION_TIMEOUT_MS = 600_000;

const LOCK_NOT_AVAILABLE_SQLSTATE = "55P03";

const ACQUIRE_SQL: Readonly<Record<TestSchemaLockMode, string>> = {
  shared: "select pg_advisory_xact_lock_shared($1::bigint)",
  exclusive: "select pg_advisory_xact_lock($1::bigint)",
};

/** `set_config(name, value, true)` is `SET LOCAL` with a bind parameter: it lasts until the
 *  holding transaction ends and touches nothing else on the server connection. */
const SET_LOCAL_SQL = "select set_config($1, $2, true)";

/** The lock was not granted within the bound: another run holds, or is queued for, a conflicting
 *  mode. Says which mode, which key and how long it waited. */
export class TestSchemaLockTimeoutError extends Error {
  readonly mode: TestSchemaLockMode;
  readonly key: number;
  readonly waitBoundMs: number;

  constructor(request: TestSchemaLockRequest, options?: ErrorOptions) {
    super(
      `Waited ${String(request.waitBoundMs)} ms for the ${request.mode} test-schema lock on key ` +
        `${String(request.key)} and was not granted it: another test run against this database holds or ` +
        `is queued for a conflicting mode. Re-run once it finishes; do not raise the bound.`,
      options,
    );
    this.name = "TestSchemaLockTimeoutError";
    this.mode = request.mode;
    this.key = request.key;
    this.waitBoundMs = request.waitBoundMs;
  }
}

/** The holding connection died while the file ran, so every test after that point ran without the
 *  lock. Raised at release, so the file fails even when each of its tests passed. */
export class TestSchemaLockLostError extends Error {
  readonly mode: TestSchemaLockMode;
  readonly key: number;

  constructor(request: TestSchemaLockRequest, options?: ErrorOptions) {
    super(
      `The ${request.mode} test-schema lock on key ${String(request.key)} was lost before release: its ` +
        `connection failed while the file was running, so the tests after that point ran ` +
        `unprotected against concurrent runs.`,
      options,
    );
    this.name = "TestSchemaLockLostError";
    this.mode = request.mode;
    this.key = request.key;
  }
}

/** Release did not finish within its bound: the holding connection stopped answering. Whether the
 *  lock is still held is unknown — the server frees it only once it drops that connection. */
export class TestSchemaLockReleaseTimeoutError extends Error {
  readonly mode: TestSchemaLockMode;
  readonly key: number;
  readonly releaseBoundMs: number;

  constructor(request: TestSchemaLockRequest, releaseBoundMs: number) {
    super(
      `Releasing the ${request.mode} test-schema lock on key ${String(request.key)} did not ` +
        `finish within ${String(releaseBoundMs)} ms: the holding connection stopped answering. ` +
        `The server frees the lock only once it drops that connection.`,
    );
    this.name = "TestSchemaLockReleaseTimeoutError";
    this.mode = request.mode;
    this.key = request.key;
    this.releaseBoundMs = releaseBoundMs;
  }
}

export interface TestSchemaLockRequest {
  readonly connectionUrl: string;
  readonly key: number;
  readonly mode: TestSchemaLockMode;
  readonly waitBoundMs: number;
}

/** The timeouts in force on the holding session, in milliseconds. */
export interface TestSchemaLockSessionTimeouts {
  readonly lockTimeoutMs: number;
  readonly idleInTransactionSessionTimeoutMs: number;
}

/** Holds the whole file under the lock in **exclusive** mode. Call once, at module scope, above
 *  the first `describe`. Takes nothing when no live test database is configured. */
export function holdExclusiveTestSchemaLock(): void {
  registerFileLock("exclusive");
}

/** Holds the whole file under the lock in **shared** mode. Call once, at module scope, above the
 *  first `describe`. Takes nothing when no live test database is configured. */
export function holdSharedTestSchemaLock(): void {
  registerFileLock("shared");
}

let registeredMode: TestSchemaLockMode | undefined;

function registerFileLock(mode: TestSchemaLockMode): void {
  if (registeredMode !== undefined) {
    throw new Error(
      `This file already holds the ${registeredMode} test-schema lock; a file declares exactly ` +
        `one mode, and "${mode}" is a second.`,
    );
  }
  registeredMode = mode;
  if (!isLiveTestDatabaseConfigured) return;

  let hold: TestSchemaLockHold | undefined;
  beforeAll(async () => {
    hold = await acquireTestSchemaLock({
      connectionUrl: liveTestDatabaseUrl,
      key: TEST_SCHEMA_LOCK_KEY,
      mode,
      waitBoundMs: TEST_SCHEMA_LOCK_WAIT_BOUND_MS,
    });
  }, TEST_SCHEMA_LOCK_HOOK_TIMEOUT_MS);
  afterAll(async () => {
    await hold?.release();
  }, TEST_SCHEMA_LOCK_RELEASE_HOOK_TIMEOUT_MS);
}

/**
 * Opens a dedicated connection, begins a transaction and waits — at most `waitBoundMs` — for the
 * advisory lock in the requested mode. Exported for the helper's self-tests, which contend on
 * random keys; a test file uses the two registrations above.
 */
export async function acquireTestSchemaLock(
  request: TestSchemaLockRequest,
): Promise<TestSchemaLockHold> {
  return TestSchemaLockHold.acquire(request);
}

/** One dedicated connection holding one open transaction and one advisory lock. */
export class TestSchemaLockHold {
  private readonly client: Client;
  private readonly request: TestSchemaLockRequest;
  private connectionFailure: unknown;
  private isReleased = false;

  static async acquire(
    request: TestSchemaLockRequest,
  ): Promise<TestSchemaLockHold> {
    const hold = new TestSchemaLockHold(request);
    await hold.lock();
    return hold;
  }

  private constructor(request: TestSchemaLockRequest) {
    this.request = request;
    this.client = new Client(request.connectionUrl);
    // Without a listener a dropped connection is an uncaught `error` event; with one that only
    // logged, the file would pass having run unprotected. It is recorded, and release reports it.
    this.client.on("error", (error: unknown) => {
      this.recordConnectionFailure(error);
    });
  }

  /** True once the holding connection has failed; the lock is then no longer held. */
  get hasLostConnection(): boolean {
    return this.connectionFailure !== undefined;
  }

  private async lock(): Promise<void> {
    await this.client.connect();
    try {
      await this.client.query("begin");
      await this.setLocal(
        "idle_in_transaction_session_timeout",
        TEST_SCHEMA_LOCK_IDLE_IN_TRANSACTION_TIMEOUT_MS,
      );
      await this.setLocal("lock_timeout", this.request.waitBoundMs);
      await this.client.query(ACQUIRE_SQL[this.request.mode], [
        this.request.key,
      ]);
    } catch (error) {
      await this.endQuietly();
      throw this.asAcquisitionError(error);
    }
  }

  /** Reads the timeouts the holding transaction runs under, from that transaction itself. */
  async readSessionTimeouts(): Promise<TestSchemaLockSessionTimeouts> {
    const { rows } = await this.client.query<{ name: string; setting: string }>(
      `select name, setting from pg_settings
        where name in ('lock_timeout', 'idle_in_transaction_session_timeout')`,
    );
    const settingOf = (name: string): number =>
      Number(rows.find((row) => row.name === name)?.setting);
    return {
      lockTimeoutMs: settingOf("lock_timeout"),
      idleInTransactionSessionTimeoutMs: settingOf(
        "idle_in_transaction_session_timeout",
      ),
    };
  }

  /** Commits, which releases the lock, and closes the connection, within `releaseBoundMs`. Throws
   *  `TestSchemaLockLostError` as soon as the loss is known — recorded earlier, or delivered to the
   *  COMMIT itself — and `TestSchemaLockReleaseTimeoutError` if the release does not finish in time.
   *  After a loss the close continues in the background, under the same deadline, because a dying
   *  socket can go silent and a certain loss must not be reported as an unknown timeout. A second
   *  call does nothing: the first has already reported whatever there was to report. */
  async release(
    releaseBoundMs = TEST_SCHEMA_LOCK_RELEASE_BOUND_MS,
  ): Promise<void> {
    if (this.isReleased) return;
    this.isReleased = true;
    const deadline = this.releaseDeadline(releaseBoundMs);
    try {
      await settleWithinBound(this.commitOrReportLoss(), deadline());
    } catch (error) {
      this.closeInBackground(deadline());
      throw error;
    }
    await settleWithinBound(this.endQuietly(), deadline());
  }

  /** Each call yields the time left until one shared deadline, so the commit and the close together
   *  never take longer than `releaseBoundMs`. */
  private releaseDeadline(releaseBoundMs: number): () => Bound {
    const expiresAt = performance.now() + releaseBoundMs;
    return () => ({
      boundMs: Math.max(0, expiresAt - performance.now()),
      onTimeout: () =>
        new TestSchemaLockReleaseTimeoutError(this.request, releaseBoundMs),
    });
  }

  /** Nobody is waiting on this close any more; it runs out its bound and reports nothing. */
  private closeInBackground(bound: Bound): void {
    settleWithinBound(this.endQuietly(), bound).catch(() => undefined);
  }

  private async commitOrReportLoss(): Promise<void> {
    if (this.hasLostConnection) {
      throw new TestSchemaLockLostError(this.request, {
        cause: this.connectionFailure,
      });
    }
    try {
      await this.client.query("commit");
    } catch (error) {
      throw new TestSchemaLockLostError(this.request, { cause: error });
    }
  }

  private recordConnectionFailure(error: unknown): void {
    if (this.hasLostConnection) return;
    this.connectionFailure = error;
    console.error(
      `[test-schema lock lost] ${this.request.mode} on key ${String(this.request.key)}: the holding ` +
        `connection failed; the rest of this file runs unprotected and its release will fail.`,
    );
  }

  private async setLocal(name: string, milliseconds: number): Promise<void> {
    await this.client.query(SET_LOCAL_SQL, [name, `${String(milliseconds)}ms`]);
  }

  private asAcquisitionError(error: unknown): unknown {
    return sqlStateOf(error) === LOCK_NOT_AVAILABLE_SQLSTATE
      ? new TestSchemaLockTimeoutError(this.request, { cause: error })
      : error;
  }

  /** A connection that has already failed is not ended: the driver's `end()` never settles on one
   *  (measured, 2026-09-22), and there is nothing left to close. Any other rejection from `end()` is
   *  swallowed because the failure that matters has already been recorded or thrown. */
  private async endQuietly(): Promise<void> {
    if (this.hasLostConnection) return;
    try {
      await this.client.end();
    } catch {
      // Deliberately swallowed; see above.
    }
  }
}

interface Bound {
  readonly boundMs: number;
  readonly onTimeout: () => Error;
}

/** Settles as `work` does, or rejects with `onTimeout()` once `boundMs` passes first. */
async function settleWithinBound(
  work: Promise<void>,
  bound: Bound,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(bound.onTimeout());
    }, bound.boundMs);
  });
  try {
    await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function sqlStateOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}
