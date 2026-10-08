// The predicate reads a marker out of an error message and an empty reply out of a bare SyntaxError, so
// every error below is built to the shape the installed driver produces, and the driver describes pin
// that shape against the driver itself. Call counts are asserted exactly, never as a lower bound.
import { runInNewContext } from "node:vm";

import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NeonDbError, neon, neonConfig } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
import {
  isTransientFailure,
  retryOnTransientFailure,
} from "../src/retry-on-transient-failure.js";

/** The module's own numbers, restated so a change to any of them has to be a deliberate one. The
 *  waits are sized to outlast the roughly one-second cold start ADR 0002 records, so a schedule
 *  that shrank back inside that second would fail here rather than quietly stop helping. */
const MAX_ATTEMPTS = 3;
const FIRST_BACKOFF_MS = 500;
const SECOND_BACKOFF_MS = 1_500;

/** Longer than the whole backoff schedule, for asserting that nothing further happens. */
const LONG_ENOUGH_FOR_ANY_RETRY_MS = 60_000;

const SUCCESS_VALUE = { rows: [{ id: "V1StGXR8_Z5jdHi6B-myT" }] };

/**
 * The payload Neon's proxy returns while a suspended compute is coming back, as quoted in CI run
 * 34114398474. Built through `JSON.stringify` rather than written out, so the marker the predicate
 * looks for is spelled by the serializer and not by this test.
 */
const COLD_START_PAYLOAD = {
  message: "Couldn't connect to compute node",
  code: "",
  detail: "",
  hint: "",
  "neon:endpoint_id": "ep-fragrant-shape-a2h9k4lm",
  "neon:query_id": "01JXQ2WRB6ZS8N3T7YF5KD9VPC",
  "neon:retryable": true,
  "neon:severity": "error",
  "neon:time": 1.234,
};

function serverErrorMessage(payload: unknown, indent = 0): string {
  return `Server error (HTTP status 500): ${JSON.stringify(payload, null, indent)}`;
}

function computeRestartError(): NeonDbError {
  return new NeonDbError(serverErrorMessage(COLD_START_PAYLOAD));
}

/**
 * An HTTP 400, which is the one status the driver decodes into fields: the message carries only
 * `payload.message`, so it carries no marker at all.
 */
function uniqueViolationError(): NeonDbError {
  const error = new NeonDbError(
    'duplicate key value violates unique constraint "designs_pkey"',
  );
  error.severity = "ERROR";
  error.code = "23505";
  error.detail = "Key (id)=(V1StGXR8_Z5jdHi6B-myT) already exists.";
  error.table = "designs";
  error.constraint = "designs_pkey";
  return error;
}

/** A 500 the proxy has explicitly marked as *not* worth repeating. */
function notRetryableServerError(): NeonDbError {
  return new NeonDbError(
    serverErrorMessage({
      message: 'relation "designs" does not exist',
      "neon:retryable": false,
    }),
  );
}

/**
 * Fails with each error in turn, then resolves with `thenReturns`. Both sequences are indexed by
 * call count rather than by a sentinel, so `undefined` is a real thrown value and a real result.
 */
function queryReturning(errors: readonly unknown[], thenReturns: unknown) {
  let calls = 0;
  return vi.fn(() => {
    calls += 1;
    return calls <= errors.length
      ? // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a query can reject with anything, and that a non-Error still propagates is one of the things under test
        Promise.reject(errors[calls - 1])
      : Promise.resolve(thenReturns);
  });
}

function queryThatFailsWith(errors: readonly unknown[]) {
  return queryReturning(errors, SUCCESS_VALUE);
}

/** Never reached over the network: every test that uses it stubs `neonConfig.fetchFunction` first. */
const TEST_CONNECTION_STRING =
  "postgresql://user:password@ep-test-123456.eu-central-1.aws.neon.tech/lemnaria";

const NOTHING_THROWN = Symbol("the query resolved");

/** Attaches its handlers now, so a rejection awaited later is never an unhandled one. */
function rejectionOf(promise: PromiseLike<unknown>): Promise<unknown> {
  return Promise.resolve(promise).then(
    () => NOTHING_THROWN,
    (error: unknown) => error,
  );
}

/** Whether `promise` has settled yet, asked without awaiting it. */
function settlementOf(promise: Promise<unknown>): () => boolean {
  let hasSettled = false;
  void promise.then(() => {
    hasSettled = true;
  });
  return () => hasSettled;
}

describe("retryOnTransientFailure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("a compute that comes back", () => {
    it("runs the query once and returns its value when the first attempt succeeds", async () => {
      const runQuery = queryThatFailsWith([]);

      const result = await retryOnTransientFailure(runQuery);

      expect(result).toBe(SUCCESS_VALUE);
      expect(runQuery).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("returns the value after one compute-restart failure, having run the query twice", async () => {
      const runQuery = queryThatFailsWith([computeRestartError()]);

      const attempt = retryOnTransientFailure(runQuery);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);

      await expect(attempt).resolves.toBe(SUCCESS_VALUE);
      expect(runQuery).toHaveBeenCalledTimes(2);
    });

    it("returns the value after two compute-restart failures, having run the query three times", async () => {
      const runQuery = queryThatFailsWith([
        computeRestartError(),
        computeRestartError(),
      ]);

      const attempt = retryOnTransientFailure(runQuery);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS + SECOND_BACKOFF_MS);

      await expect(attempt).resolves.toBe(SUCCESS_VALUE);
      expect(runQuery).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    });

    it("retries a compute-restart failure thrown synchronously rather than returned rejected", async () => {
      let calls = 0;
      const runQuery = vi.fn(() => {
        calls += 1;
        if (calls === 1) throw computeRestartError();
        return Promise.resolve(SUCCESS_VALUE);
      });

      const attempt = retryOnTransientFailure(runQuery);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);

      await expect(attempt).resolves.toBe(SUCCESS_VALUE);
      expect(runQuery).toHaveBeenCalledTimes(2);
    });

    it("retries a marker the proxy pretty-printed, whitespace and all", async () => {
      const prettyPrinted = new NeonDbError(
        serverErrorMessage(COLD_START_PAYLOAD, 2),
      );
      const runQuery = queryThatFailsWith([prettyPrinted]);

      const attempt = retryOnTransientFailure(runQuery);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);

      await expect(attempt).resolves.toBe(SUCCESS_VALUE);
      expect(runQuery).toHaveBeenCalledTimes(2);
    });

    // A query that legitimately resolves with a falsy value must not be read as a failure.
    it.each([
      { name: "undefined", value: undefined },
      { name: "null", value: null },
      { name: "zero", value: 0 },
      { name: "an empty string", value: "" },
      { name: "false", value: false },
      { name: "an empty array", value: [] },
    ])("returns $name unchanged after a retry", async ({ value }) => {
      const runQuery = queryReturning([computeRestartError()], value);

      const attempt = retryOnTransientFailure(runQuery);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);

      await expect(attempt).resolves.toBe(value);
      expect(runQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe("a compute that never comes back", () => {
    it("propagates Neon's own last error rather than one of its own invention", async () => {
      const lastError = computeRestartError();
      const runQuery = queryThatFailsWith([
        computeRestartError(),
        computeRestartError(),
        lastError,
      ]);

      const thrown = rejectionOf(retryOnTransientFailure(runQuery));
      const hasSettled = settlementOf(thrown);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS + SECOND_BACKOFF_MS);

      // Asked before it is awaited: a run still waiting on a further attempt would hang the await.
      expect(hasSettled()).toBe(true);
      expect(await thrown).toBe(lastError);
    });

    it("runs the query exactly three times however long it is left to keep trying", async () => {
      const runQuery = queryThatFailsWith([
        computeRestartError(),
        computeRestartError(),
        computeRestartError(),
        computeRestartError(),
      ]);

      const thrown = rejectionOf(retryOnTransientFailure(runQuery));
      await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);
      await thrown;

      expect(runQuery).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    });

    it("does not wait once the last attempt has failed", async () => {
      const runQuery = queryThatFailsWith([
        computeRestartError(),
        computeRestartError(),
        computeRestartError(),
      ]);

      const thrown = rejectionOf(retryOnTransientFailure(runQuery));
      const hasSettled = settlementOf(thrown);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS + SECOND_BACKOFF_MS);

      expect(hasSettled()).toBe(true);
      expect(runQuery).toHaveBeenCalledTimes(MAX_ATTEMPTS);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("the backoff between attempts", () => {
    it("waits 500 ms before the second attempt and 1500 ms before the third", async () => {
      const runQuery = queryThatFailsWith([
        computeRestartError(),
        computeRestartError(),
      ]);

      const attempt = retryOnTransientFailure(runQuery);
      await vi.advanceTimersByTimeAsync(0);
      expect(runQuery).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS - 1);
      expect(runQuery).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(runQuery).toHaveBeenCalledTimes(2);

      // The second wait is the one a constant or a zeroed backoff gets wrong: at 1499 ms past the
      // second attempt the third must still not have gone out.
      await vi.advanceTimersByTimeAsync(SECOND_BACKOFF_MS - 1);
      expect(runQuery).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(runQuery).toHaveBeenCalledTimes(MAX_ATTEMPTS);

      await expect(attempt).resolves.toBe(SUCCESS_VALUE);
    });
  });

  describe("a failure that is an answer rather than a restart window", () => {
    it("propagates a Postgres rejection decoded from an HTTP 400 on the first attempt", async () => {
      const rejection = uniqueViolationError();
      const runQuery = queryThatFailsWith([rejection]);

      const thrown = rejectionOf(retryOnTransientFailure(runQuery));
      await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);

      expect(await thrown).toBe(rejection);
      expect(runQuery).toHaveBeenCalledTimes(1);
    });

    // The boundary a `"neon:retryable"` substring match, or one that ignores the value, gets wrong.
    it('does not retry an error the proxy marked "neon:retryable":false', async () => {
      const rejection = notRetryableServerError();
      const runQuery = queryThatFailsWith([rejection]);

      const thrown = rejectionOf(retryOnTransientFailure(runQuery));
      await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);

      expect(await thrown).toBe(rejection);
      expect(runQuery).toHaveBeenCalledTimes(1);
    });

    it("does not retry an error that merely quotes the marker but is not a NeonDbError", async () => {
      const rejection = new Error(serverErrorMessage(COLD_START_PAYLOAD));
      const runQuery = queryThatFailsWith([rejection]);

      const thrown = rejectionOf(retryOnTransientFailure(runQuery));
      await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);

      expect(await thrown).toBe(rejection);
      expect(runQuery).toHaveBeenCalledTimes(1);
    });

    it.each([
      { name: "a plain Error", thrown: new Error("network is unreachable") },
      { name: "a TypeError", thrown: new TypeError("fetch failed") },
      { name: "a string", thrown: "Couldn't connect to compute node" },
      { name: "undefined", thrown: undefined },
      { name: "null", thrown: null },
      { name: "a bare object", thrown: { message: "not an Error at all" } },
    ])("propagates $name on the first attempt", async ({ thrown }) => {
      const runQuery = queryThatFailsWith([thrown]);

      const captured = rejectionOf(retryOnTransientFailure(runQuery));
      await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);

      expect(await captured).toBe(thrown);
      expect(runQuery).toHaveBeenCalledTimes(1);
    });

    it("stops on a Postgres rejection that arrives after a restart window", async () => {
      const rejection = uniqueViolationError();
      const runQuery = queryThatFailsWith([computeRestartError(), rejection]);

      const thrown = rejectionOf(retryOnTransientFailure(runQuery));
      await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);

      expect(await thrown).toBe(rejection);
      expect(runQuery).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * The predicate reads a marker out of `error.message` instead of a decoded field, which is only
 * correct because of how `@neondatabase/serverless@1.1.0` builds the error. That is a vendor
 * behaviour, so it is asserted against the vendor: these tests drive the real `neon()` client with a
 * stubbed fetch and check the errors it actually constructs. A driver upgrade that moves the payload
 * out of the message fails here rather than silently in production.
 */
describe("the NeonDbError shape the retryable marker is read out of", () => {
  let previousFetchFunction: unknown;

  beforeEach(() => {
    previousFetchFunction = neonConfig.fetchFunction;
  });

  afterEach(() => {
    neonConfig.fetchFunction = previousFetchFunction;
  });

  async function driverErrorFor(status: number, body: string) {
    neonConfig.fetchFunction = () =>
      Promise.resolve(new Response(body, { status }));
    const sql = neon(TEST_CONNECTION_STRING);

    const thrown = await rejectionOf(sql`select 1`);

    expect(thrown).toBeInstanceOf(NeonDbError);
    return thrown as NeonDbError;
  }

  it("stringifies the whole payload into the message of an HTTP 500 and decodes no fields", async () => {
    const error = await driverErrorFor(500, JSON.stringify(COLD_START_PAYLOAD));

    expect(error.message).toContain('"neon:retryable":true');
    expect(error.code).toBeUndefined();
    expect(error.detail).toBeUndefined();
    expect(error.severity).toBeUndefined();
  });

  it("keeps the payload out of the message of an HTTP 400 and decodes its fields instead", async () => {
    const error = await driverErrorFor(
      400,
      JSON.stringify({
        message:
          'duplicate key value violates unique constraint "designs_pkey"',
        severity: "ERROR",
        code: "23505",
        "neon:retryable": false,
      }),
    );

    expect(error.code).toBe("23505");
    expect(error.message).toBe(
      'duplicate key value violates unique constraint "designs_pkey"',
    );
    expect(error.message).not.toContain("neon:retryable");
  });

  it("retries the error the driver itself builds from a cold start", async () => {
    const coldStart = await driverErrorFor(
      500,
      JSON.stringify(COLD_START_PAYLOAD),
    );
    const runQuery = queryThatFailsWith([coldStart]);

    vi.useFakeTimers();
    try {
      const attempt = retryOnTransientFailure(runQuery);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);
      await expect(attempt).resolves.toBe(SUCCESS_VALUE);
    } finally {
      vi.useRealTimers();
    }

    expect(runQuery).toHaveBeenCalledTimes(2);
  });
});

/**
 * The one call site where a retry could turn a lost acknowledgement into two rows for a single
 * customer action, and the thing that prevents it is a line's *position*: `mint` calls
 * `generateDesignId()` outside the retried callback, so every attempt carries the same primary key.
 *
 * **Since ADR 0114 Amendment H1 ("Rotate on mint", M7 wave 7E3b) `mint` submits its statements as
 * one `sql.transaction([...])`, never a single insert, and the insert itself takes
 * `on conflict (id) do nothing`.** A repeat of a write that already landed therefore inserts
 * nothing and the closing `select` still finds the row — silently, not as a duplicate-key
 * rejection the way a plain `insert ... returning` once surfaced it. That is this file's own
 * retry-safety claim, updated rather than merely re-pointed: see the third test below.
 *
 * That placement is invisible to every other test in this file — move the call inside the callback
 * and they all still pass — so it is asserted here against the real repository, driven through a
 * stubbed fetch that answers one cold start and then succeeds. The whole parameter list is compared,
 * not only the id: what the rewritten safety docstring rests on is that a retried statement is
 * idempotent *under identical arguments*, so identical arguments is the property to pin.
 */
describe("mint under a compute restart", () => {
  /** The wire shape `@neondatabase/serverless` POSTs for `sql.transaction([...])` — one request
   *  carrying every statement `mint` submits, never one request per statement. */
  interface NeonHttpTransactionRequest {
    queries: { query: string; params: unknown[] }[];
  }

  /** The `id` is the first interpolation in both the insert and the closing select. */
  const ID_PARAMETER = 0;

  const WRITE_TOKEN_HASH = "a".repeat(64);

  /** This file is about the retry mechanics, not visitor identity, so every mint below is a fresh
   *  one, well-formed and nothing more — which means no rotation `update` precedes the insert
   *  (Amendment H1), and the insert is the transaction's first query. */
  const VISITOR_HASH = "b".repeat(64);

  /** The insert's own result. No `returning` clause since Amendment H1 — a repeat past a lost
   *  acknowledgement must not raise — so an empty row set is the honest shape whether or not this
   *  attempt is the one that actually inserted anything. */
  const INSERT_RESULT = {
    command: "INSERT",
    rowCount: 1,
    fields: [],
    rows: [],
  };

  /** The closing select's result: one row carrying `revision::text as revision`, in the array-mode
   *  shape the driver asks for. */
  const SELECT_RESULT = {
    command: "SELECT",
    rowCount: 1,
    fields: [
      {
        name: "revision",
        dataTypeID: 25,
        tableID: 0,
        columnID: 0,
        dataTypeSize: -1,
        dataTypeModifier: -1,
        format: "text",
      },
    ],
    rows: [["1"]],
  };

  /** The whole transaction's response body: `sql.transaction` reads back `results`, one entry per
   *  submitted query, in the order they were submitted. */
  const MINT_TRANSACTION_BODY = JSON.stringify({
    results: [INSERT_RESULT, SELECT_RESULT],
  });

  let previousFetchFunction: unknown;

  beforeEach(() => {
    previousFetchFunction = neonConfig.fetchFunction;
    vi.useFakeTimers();
  });

  afterEach(() => {
    neonConfig.fetchFunction = previousFetchFunction;
    vi.useRealTimers();
  });

  /** Answers each request in turn, and hands back the list of requests as it fills up. */
  function answerInTurn(
    answers: { status: number; body: string }[],
  ): NeonHttpTransactionRequest[] {
    const requests: NeonHttpTransactionRequest[] = [];
    neonConfig.fetchFunction = (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body) as NeonHttpTransactionRequest);
      const answer = answers.shift();
      if (!answer)
        throw new Error(
          `The driver sent request ${String(requests.length)}, which is more than the stub was ` +
            "given answers for.",
        );
      return Promise.resolve(
        new Response(answer.body, { status: answer.status }),
      );
    };
    return requests;
  }

  function mintFresh(
    repository: NeonConfigurationRepository,
  ): ReturnType<NeonConfigurationRepository["mint"]> {
    return repository.mint({
      design: KITCHEN_L_DESIGN,
      writeTokenHash: WRITE_TOKEN_HASH,
      visitor: { kind: "fresh", visitorHash: VISITOR_HASH },
    });
  }

  it("re-sends the insert with the same id, so a lost acknowledgement cannot mint twice", async () => {
    const requests = answerInTurn([
      { status: 500, body: JSON.stringify(COLD_START_PAYLOAD) },
      { status: 200, body: MINT_TRANSACTION_BODY },
    ]);
    const repository = new NeonConfigurationRepository(TEST_CONNECTION_STRING);

    const minting = mintFresh(repository);
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);
    const minted = await minting;

    expect(requests).toHaveLength(2);
    const [firstAttempt, retriedAttempt] = requests;
    const firstInsert = firstAttempt?.queries[0];
    const retriedInsert = retriedAttempt?.queries[0];
    expect(retriedInsert?.params[ID_PARAMETER]).toBe(
      firstInsert?.params[ID_PARAMETER],
    );
    // The id the caller is told about must be the one both inserts actually carried, or the row
    // that survived is not the row the customer is holding a link to.
    expect(firstInsert?.params[ID_PARAMETER]).toBe(minted.id);
  });

  it("re-sends every statement identical, not only the id", async () => {
    const requests = answerInTurn([
      { status: 500, body: JSON.stringify(COLD_START_PAYLOAD) },
      { status: 200, body: MINT_TRANSACTION_BODY },
    ]);
    const repository = new NeonConfigurationRepository(TEST_CONNECTION_STRING);

    const minting = mintFresh(repository);
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);
    await minting;

    const [firstAttempt, retriedAttempt] = requests;
    expect(retriedAttempt?.queries).toEqual(firstAttempt?.queries);
  });

  it(
    "a repeat past a lost acknowledgement resolves with the same revision, rather than raising a " +
      "duplicate-key rejection (Amendment H1: the insert takes on conflict (id) do nothing)",
    async () => {
      const requests = answerInTurn([
        { status: 500, body: JSON.stringify(COLD_START_PAYLOAD) },
        { status: 200, body: MINT_TRANSACTION_BODY },
      ]);
      const repository = new NeonConfigurationRepository(
        TEST_CONNECTION_STRING,
      );

      const minting = mintFresh(repository);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);

      const minted = await minting;
      expect(minted.revision).toBe("1");
      expect(requests).toHaveLength(2);
      // The canned reply answers the same whatever was sent, so the clause is read off the
      // statement itself: both attempts' insert ends in it, with no `returning` to collide on.
      for (const attempt of requests) {
        const insert = attempt.queries[0]?.query ?? "";
        expect(insert).toMatch(/^\s*insert into designs\b/);
        expect(insert).toMatch(/\bon conflict \(id\) do nothing\s*$/);
      }
    },
  );
});

const EMPTY_REPLY_MESSAGE = "Unexpected end of JSON input";

function emptyReplyError(): SyntaxError {
  return new SyntaxError(EMPTY_REPLY_MESSAGE);
}

describe("isTransientFailure", () => {
  it.each([
    { name: "Neon's cold-start refusal", error: computeRestartError() },
    { name: "an empty reply from the driver", error: emptyReplyError() },
  ])("is true for $name", ({ error }) => {
    expect(isTransientFailure(error)).toBe(true);
  });

  it.each([
    {
      name: "a Postgres rejection decoded from HTTP 400",
      error: uniqueViolationError(),
    },
    {
      name: 'a payload marked "neon:retryable":false',
      error: notRetryableServerError(),
    },
    {
      name: "a SyntaxError about anything but an empty reply",
      error: new SyntaxError("Unexpected token < in JSON at position 0"),
    },
    {
      name: "an empty-reply message on an error that is not a SyntaxError",
      error: new Error(EMPTY_REPLY_MESSAGE),
    },
    {
      name: "a fetch-level failure the driver wraps",
      error: new NeonDbError(
        "Error connecting to database: TypeError: fetch failed",
      ),
    },
    { name: "a bare TypeError", error: new TypeError("fetch failed") },
    { name: "a string quoting the empty reply", error: EMPTY_REPLY_MESSAGE },
    { name: "undefined", error: undefined },
    { name: "null", error: null },
  ])("is false for $name", ({ error }) => {
    expect(isTransientFailure(error)).toBe(false);
  });
});

describe("an empty reply built in another realm", () => {
  it("is transient although it is not an instance of this realm's SyntaxError", () => {
    const foreign: unknown = runInNewContext(
      `new SyntaxError("${EMPTY_REPLY_MESSAGE}")`,
    );

    expect(foreign instanceof SyntaxError).toBe(false);
    expect(isTransientFailure(foreign)).toBe(true);
  });

  it("is not transient when only its shape matches, not being an error at all", () => {
    const lookalike: unknown = runInNewContext(
      `({ name: "SyntaxError", message: "${EMPTY_REPLY_MESSAGE}" })`,
    );

    expect(isTransientFailure(lookalike)).toBe(false);
  });
});

describe("an empty reply", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is retried at most three times, then reaches the caller unchanged", async () => {
    const lastError = emptyReplyError();
    const runQuery = queryThatFailsWith([
      emptyReplyError(),
      emptyReplyError(),
      lastError,
    ]);

    const thrown = rejectionOf(retryOnTransientFailure(runQuery));
    await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);

    expect(await thrown).toBe(lastError);
    expect(runQuery).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });
});

describe("the attempt a retried callback is told about", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a first attempt once and a retry on every attempt after", async () => {
    const seen: boolean[] = [];
    const runQuery = vi.fn(({ isRetry }: { isRetry: boolean }) => {
      seen.push(isRetry);
      return seen.length < MAX_ATTEMPTS
        ? Promise.reject(emptyReplyError())
        : Promise.resolve(SUCCESS_VALUE);
    });

    const attempt = retryOnTransientFailure(runQuery);
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS + SECOND_BACKOFF_MS);
    await attempt;

    expect(seen).toEqual([false, true, true]);
  });
});

/** The empty reply is a vendor behaviour (`Response.json()` inside the driver), so it is pinned against the driver. */
describe("the errors the driver itself builds for an empty reply and a dropped fetch", () => {
  let previousFetchFunction: unknown;

  beforeEach(() => {
    previousFetchFunction = neonConfig.fetchFunction;
  });

  afterEach(() => {
    neonConfig.fetchFunction = previousFetchFunction;
  });

  async function thrownFor(reply: () => Promise<Response>): Promise<unknown> {
    neonConfig.fetchFunction = reply;
    return rejectionOf(neon(TEST_CONNECTION_STRING)`select 1`);
  }

  it.each([200, 400])(
    "raises a bare SyntaxError for an HTTP %i with an empty body, and the predicate calls it transient",
    async (status) => {
      const thrown = await thrownFor(() =>
        Promise.resolve(new Response("", { status })),
      );

      expect(thrown).toBeInstanceOf(SyntaxError);
      expect(thrown).not.toBeInstanceOf(NeonDbError);
      expect(isTransientFailure(thrown)).toBe(true);
    },
  );

  it("wraps a rejected fetch in a NeonDbError the predicate does not call transient", async () => {
    const thrown = await thrownFor(() =>
      Promise.reject(new TypeError("fetch failed")),
    );

    expect(thrown).toBeInstanceOf(NeonDbError);
    expect(isTransientFailure(thrown)).toBe(false);
  });

  it("raises a NeonDbError the predicate does not call transient for a non-JSON 502", async () => {
    const thrown = await thrownFor(() =>
      Promise.resolve(
        new Response("<html>Bad gateway</html>", { status: 502 }),
      ),
    );

    expect(thrown).toBeInstanceOf(NeonDbError);
    expect(isTransientFailure(thrown)).toBe(false);
  });
});
