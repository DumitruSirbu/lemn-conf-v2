// The retry that stands between a suspended Neon compute and a customer being told their shared
// design could not be loaded (`apps/web/src/app/d/[id]/page.tsx` renders `design-load-error.tsx`
// when the server-side load throws).
//
// Two things here are easy to get subtly wrong and expensive to have wrong. The first is the
// predicate: it reads a marker out of an error *message*, so a regex that also matched
// `"neon:retryable":false`, or one that only worked against a toy string rather than the real JSON
// payload, would repeat statements Postgres had already refused. Every error below is built to the
// shape the installed driver actually produces, and the last describe block pins that shape against
// the driver itself rather than against this file's memory of it.
//
// The second is the attempt budget. A miscount turns a 500 into a slow 500, or loops. Call counts
// here are asserted exactly, never as a lower bound.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { NeonDbError, neon, neonConfig } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NeonConfigurationRepository } from "../src/neon-configuration-repository.js";
import { retryOnComputeRestart } from "../src/retry-on-compute-restart.js";

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

describe("retryOnComputeRestart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("a compute that comes back", () => {
    it("runs the query once and returns its value when the first attempt succeeds", async () => {
      const runQuery = queryThatFailsWith([]);

      const result = await retryOnComputeRestart(runQuery);

      expect(result).toBe(SUCCESS_VALUE);
      expect(runQuery).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("returns the value after one compute-restart failure, having run the query twice", async () => {
      const runQuery = queryThatFailsWith([computeRestartError()]);

      const attempt = retryOnComputeRestart(runQuery);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);

      await expect(attempt).resolves.toBe(SUCCESS_VALUE);
      expect(runQuery).toHaveBeenCalledTimes(2);
    });

    it("returns the value after two compute-restart failures, having run the query three times", async () => {
      const runQuery = queryThatFailsWith([
        computeRestartError(),
        computeRestartError(),
      ]);

      const attempt = retryOnComputeRestart(runQuery);
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

      const attempt = retryOnComputeRestart(runQuery);
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);

      await expect(attempt).resolves.toBe(SUCCESS_VALUE);
      expect(runQuery).toHaveBeenCalledTimes(2);
    });

    it("retries a marker the proxy pretty-printed, whitespace and all", async () => {
      const prettyPrinted = new NeonDbError(
        serverErrorMessage(COLD_START_PAYLOAD, 2),
      );
      const runQuery = queryThatFailsWith([prettyPrinted]);

      const attempt = retryOnComputeRestart(runQuery);
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

      const attempt = retryOnComputeRestart(runQuery);
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

      const thrown = rejectionOf(retryOnComputeRestart(runQuery));
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS + SECOND_BACKOFF_MS);

      expect(await thrown).toBe(lastError);
    });

    it("runs the query exactly three times however long it is left to keep trying", async () => {
      const runQuery = queryThatFailsWith([
        computeRestartError(),
        computeRestartError(),
        computeRestartError(),
        computeRestartError(),
      ]);

      const thrown = rejectionOf(retryOnComputeRestart(runQuery));
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

      const thrown = rejectionOf(retryOnComputeRestart(runQuery));
      await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS + SECOND_BACKOFF_MS);
      await thrown;

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

      const attempt = retryOnComputeRestart(runQuery);
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

      const thrown = rejectionOf(retryOnComputeRestart(runQuery));
      await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);

      expect(await thrown).toBe(rejection);
      expect(runQuery).toHaveBeenCalledTimes(1);
    });

    // The boundary a `"neon:retryable"` substring match, or one that ignores the value, gets wrong.
    it('does not retry an error the proxy marked "neon:retryable":false', async () => {
      const rejection = notRetryableServerError();
      const runQuery = queryThatFailsWith([rejection]);

      const thrown = rejectionOf(retryOnComputeRestart(runQuery));
      await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);

      expect(await thrown).toBe(rejection);
      expect(runQuery).toHaveBeenCalledTimes(1);
    });

    it("does not retry an error that merely quotes the marker but is not a NeonDbError", async () => {
      const rejection = new Error(serverErrorMessage(COLD_START_PAYLOAD));
      const runQuery = queryThatFailsWith([rejection]);

      const thrown = rejectionOf(retryOnComputeRestart(runQuery));
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

      const captured = rejectionOf(retryOnComputeRestart(runQuery));
      await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);

      expect(await captured).toBe(thrown);
      expect(runQuery).toHaveBeenCalledTimes(1);
    });

    it("stops on a Postgres rejection that arrives after a restart window", async () => {
      const rejection = uniqueViolationError();
      const runQuery = queryThatFailsWith([computeRestartError(), rejection]);

      const thrown = rejectionOf(retryOnComputeRestart(runQuery));
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
      const attempt = retryOnComputeRestart(runQuery);
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
 * `generateDesignId()` outside the retried callback, so every attempt carries the same primary key
 * and a repeat of a write that actually landed takes a duplicate-key rejection instead of minting a
 * second design.
 *
 * That placement is invisible to every other test in this file — move the call inside the callback
 * and they all still pass — so it is asserted here against the real repository, driven through a
 * stubbed fetch that answers one cold start and then succeeds. The whole parameter list is compared,
 * not only the id: what the rewritten safety docstring rests on is that a retried statement is
 * idempotent *under identical arguments*, so identical arguments is the property to pin.
 */
describe("mint under a compute restart", () => {
  /** The body `@neondatabase/serverless` POSTs for a single query. */
  interface NeonHttpRequest {
    query: string;
    params: unknown[];
  }

  /** The `id` is the first interpolation in `mint`'s insert. */
  const ID_PARAMETER = 0;

  const WRITE_TOKEN_HASH = "a".repeat(64);

  /** One row carrying `revision::text as revision`, in the array-mode shape the driver asks for. */
  const MINTED_ROW_BODY = JSON.stringify({
    command: "INSERT",
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
  ): NeonHttpRequest[] {
    const requests: NeonHttpRequest[] = [];
    neonConfig.fetchFunction = (_url: string, init: { body: string }) => {
      requests.push(JSON.parse(init.body) as NeonHttpRequest);
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

  it("re-sends the insert with the same id, so a lost acknowledgement cannot mint twice", async () => {
    const requests = answerInTurn([
      { status: 500, body: JSON.stringify(COLD_START_PAYLOAD) },
      { status: 200, body: MINTED_ROW_BODY },
    ]);
    const repository = new NeonConfigurationRepository(TEST_CONNECTION_STRING);

    const minting = repository.mint(KITCHEN_L_DESIGN, WRITE_TOKEN_HASH);
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);
    const minted = await minting;

    expect(requests).toHaveLength(2);
    const [firstInsert, retriedInsert] = requests;
    expect(retriedInsert?.params[ID_PARAMETER]).toBe(
      firstInsert?.params[ID_PARAMETER],
    );
    // The id the caller is told about must be the one both inserts actually carried, or the row
    // that survived is not the row the customer is holding a link to.
    expect(firstInsert?.params[ID_PARAMETER]).toBe(minted.id);
  });

  it("re-sends the insert with every argument identical, not only the id", async () => {
    const requests = answerInTurn([
      { status: 500, body: JSON.stringify(COLD_START_PAYLOAD) },
      { status: 200, body: MINTED_ROW_BODY },
    ]);
    const repository = new NeonConfigurationRepository(TEST_CONNECTION_STRING);

    const minting = repository.mint(KITCHEN_L_DESIGN, WRITE_TOKEN_HASH);
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS);
    await minting;

    const [firstInsert, retriedInsert] = requests;
    expect(retriedInsert?.query).toBe(firstInsert?.query);
    expect(retriedInsert?.params).toEqual(firstInsert?.params);
  });

  it("propagates a duplicate-key rejection without retrying it, so a repeat cannot loop", async () => {
    const requests = answerInTurn([
      { status: 500, body: JSON.stringify(COLD_START_PAYLOAD) },
      {
        status: 400,
        body: JSON.stringify({
          message:
            'duplicate key value violates unique constraint "designs_pkey"',
          severity: "ERROR",
          code: "23505",
        }),
      },
    ]);
    const repository = new NeonConfigurationRepository(TEST_CONNECTION_STRING);

    const thrown = rejectionOf(
      repository.mint(KITCHEN_L_DESIGN, WRITE_TOKEN_HASH),
    );
    await vi.advanceTimersByTimeAsync(LONG_ENOUGH_FOR_ANY_RETRY_MS);

    const rejection = await thrown;
    expect(rejection).toBeInstanceOf(NeonDbError);
    expect(rejection).toHaveProperty("code", "23505");
    expect(requests).toHaveLength(2);
  });
});
