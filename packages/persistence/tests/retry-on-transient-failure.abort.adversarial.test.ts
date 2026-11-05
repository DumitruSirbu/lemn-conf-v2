import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryOnTransientFailure } from "../src/retry-on-transient-failure.js";

/**
 * The signal added to the retry must change nothing for a call that is not aborted: the same pauses, the same number of
 * attempts, the same final error, and nothing left listening or waiting.
 */
const EMPTY_REPLY = new SyntaxError("Unexpected end of JSON input");
const FIRST_BACKOFF_MS = 500;
const SECOND_BACKOFF_MS = 1_500;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** The times at which a query that always fails transiently was attempted, with or without a signal. */
async function attemptTimesOf(signal?: AbortSignal): Promise<number[]> {
  const started = Date.now();
  const times: number[] = [];
  const run = () => {
    times.push(Date.now() - started);
    return Promise.reject(EMPTY_REPLY);
  };

  const outcome = retryOnTransientFailure(run, signal).catch(
    (caught: unknown) => caught,
  );
  await vi.runAllTimersAsync();

  expect(await outcome).toBe(EMPTY_REPLY);
  return times;
}

describe("a retry that is not aborted", () => {
  it("makes its three attempts at the same times with a signal that never aborts as with none", async () => {
    const without = await attemptTimesOf();
    const withIt = await attemptTimesOf(new AbortController().signal);

    expect(without).toEqual([
      0,
      FIRST_BACKOFF_MS,
      FIRST_BACKOFF_MS + SECOND_BACKOFF_MS,
    ]);
    expect(withIt).toEqual(without);
  });

  it("leaves no timer and no listener behind once it has succeeded after repeating", async () => {
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, "addEventListener");
    const removed = vi.spyOn(controller.signal, "removeEventListener");
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(EMPTY_REPLY)
      .mockRejectedValueOnce(EMPTY_REPLY)
      .mockResolvedValueOnce("rows");

    const result = retryOnTransientFailure(run, controller.signal);
    await vi.runAllTimersAsync();

    expect(await result).toBe("rows");
    expect(added.mock.calls.length).toBeGreaterThan(0);
    expect(removed).toHaveBeenCalledTimes(added.mock.calls.length);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates a failure that is not transient at once, as itself, with a signal that never aborts", async () => {
    const failure = new Error("a postgres rejection");
    const run = vi.fn(() => Promise.reject(failure));

    const outcome = await retryOnTransientFailure(
      run,
      new AbortController().signal,
    ).catch((caught: unknown) => caught);

    expect(outcome).toBe(failure);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("a retry that is aborted", () => {
  it("reissues nothing when the signal aborts during the second pause, and leaves no timer waiting", async () => {
    const controller = new AbortController();
    const reason = new Error("given up in the second pause");
    const run = vi.fn(() => Promise.reject(EMPTY_REPLY));

    const outcome = retryOnTransientFailure(run, controller.signal).catch(
      (caught: unknown) => caught,
    );
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS + 1);
    controller.abort(reason);
    await vi.advanceTimersByTimeAsync(0);

    expect(await outcome).toBe(reason);
    expect(run).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not wait out the pause: it rejects the moment the signal aborts", async () => {
    const controller = new AbortController();
    const run = vi.fn(() => Promise.reject(EMPTY_REPLY));
    let settledAt: number | undefined;
    const started = Date.now();
    void retryOnTransientFailure(run, controller.signal).catch(() => {
      settledAt = Date.now() - started;
    });

    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(settledAt).toBeLessThan(FIRST_BACKOFF_MS);
  });

  it("does not reissue after the last pause when the signal aborted in it", async () => {
    const controller = new AbortController();
    const run = vi.fn(() => Promise.reject(EMPTY_REPLY));

    const outcome = retryOnTransientFailure(run, controller.signal).catch(
      (caught: unknown) => caught,
    );
    await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS + SECOND_BACKOFF_MS - 1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1);

    expect(await outcome).toBeInstanceOf(Error);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
