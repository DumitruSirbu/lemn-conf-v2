import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryOnTransientFailure } from "../src/retry-on-transient-failure.js";

/** An aborted signal ends the repeating: nothing is reissued, and the call rejects with the signal's reason. */
const EMPTY_REPLY = new SyntaxError("Unexpected end of JSON input");

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("retryOnTransientFailure with a signal", () => {
  it("reissues nothing when the signal aborted as the first attempt failed, and rejects with its reason", async () => {
    const controller = new AbortController();
    const reason = new Error("given up");
    const run = vi.fn(() => {
      controller.abort(reason);
      return Promise.reject(EMPTY_REPLY);
    });

    const failure = retryOnTransientFailure(run, controller.signal).catch(
      (caught: unknown) => caught,
    );
    await vi.runAllTimersAsync();

    expect(await failure).toBe(reason);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when the signal aborts during the pause, and reissues nothing", async () => {
    const controller = new AbortController();
    const reason = new Error("given up in the pause");
    const run = vi.fn(() => Promise.reject(EMPTY_REPLY));

    const failure = retryOnTransientFailure(run, controller.signal).catch(
      (caught: unknown) => caught,
    );
    await vi.advanceTimersByTimeAsync(100);
    controller.abort(reason);
    await vi.advanceTimersByTimeAsync(0);

    expect(await failure).toBe(reason);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("repeats as before when the signal never aborts", async () => {
    const controller = new AbortController();
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(EMPTY_REPLY)
      .mockResolvedValueOnce("rows");

    const result = retryOnTransientFailure(run, controller.signal);
    await vi.runAllTimersAsync();

    expect(await result).toBe("rows");
    expect(run).toHaveBeenCalledTimes(2);
  });
});
