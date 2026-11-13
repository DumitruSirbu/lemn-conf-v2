// Adversarial QA of the deadline a usage fetch is given: it ends a request that is never answered, frees the one read in
// flight, leaves no timer behind, is not spent twice, and composes with a busy answer's wait without a second read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ItemRef } from "@lemnaria/configurator-domain";

import { createFetchingItemLifecycleClient } from "@/price-dashboard/fetching-item-lifecycle-client";

const HETTICH: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const BLUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const DEADLINE_MS = 15_000;
const BUSY_WAIT_MS = 10_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A request that waits to be aborted, as a real `fetch` does; the others are answered by `answerTo`. */
function network(
  answerTo: (call: number, items: ItemRef[]) => Response | "hang",
) {
  const seen: { items: ItemRef[]; aborted: boolean }[] = [];
  vi.stubGlobal("fetch", (_address: string, init: RequestInit) => {
    const { items } = JSON.parse(init.body as string) as { items: ItemRef[] };
    const call = seen.length;
    const record = { items, aborted: false };
    seen.push(record);
    const answer = answerTo(call, items);
    if (answer !== "hang") return Promise.resolve(answer);
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        record.aborted = true;
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  });
  return seen;
}

const counting = (items: ItemRef[]) =>
  new Response(
    JSON.stringify({ counts: items.map((item) => ({ item, count: 2 })) }),
    { status: 200 },
  );
const busy = () =>
  new Response("{}", { status: 429, headers: { "Retry-After": "10" } });

describe("the deadline of a usage fetch", () => {
  it("ends a request at 15 seconds and not before, and the read is unknown", async () => {
    const seen = network(() => "hang");
    const settled = { value: false };
    const read = createFetchingItemLifecycleClient()
      .readUsage([HETTICH])
      .then((result) => {
        settled.value = true;
        return result;
      });

    await vi.advanceTimersByTimeAsync(DEADLINE_MS - 1);
    expect(settled.value, "one millisecond before").toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await read).toEqual({ kind: "unavailable" });
    expect(seen).toEqual([{ items: [HETTICH], aborted: true }]);
  });

  it("leaves no timer behind, whether the read was answered, refused or cut off", async () => {
    for (const answer of [
      (items: ItemRef[]) => counting(items),
      () => new Response("{}", { status: 503 }),
      () => "hang" as const,
    ]) {
      network((_call, items) => answer(items));
      const read = createFetchingItemLifecycleClient().readUsage([HETTICH]);
      await vi.advanceTimersByTimeAsync(DEADLINE_MS);
      await read;

      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it("frees the one read in flight: a read that waited behind the cut-off one goes out and is counted", async () => {
    const seen = network((call, items) =>
      call === 0 ? "hang" : counting(items),
    );
    const client = createFetchingItemLifecycleClient();
    const first = client.readUsage([HETTICH]);
    const second = client.readUsage([BLUM]);

    await vi.advanceTimersByTimeAsync(DEADLINE_MS);

    expect(await first).toEqual({ kind: "unavailable" });
    expect(await second).toEqual({
      kind: "counted",
      counts: [{ item: BLUM, designCount: 2 }],
    });
    expect(seen.map(({ items }) => items)).toEqual([[HETTICH], [BLUM]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is told to a read that joined the cut-off one, and asks again afterwards for a fresh read", async () => {
    const seen = network((call, items) =>
      call === 0 ? "hang" : counting(items),
    );
    const client = createFetchingItemLifecycleClient();
    const first = client.readUsage([HETTICH, BLUM]);
    const joined = client.readUsage([BLUM]);

    await vi.advanceTimersByTimeAsync(DEADLINE_MS);

    expect(await first).toEqual({ kind: "unavailable" });
    expect(await joined).toEqual({ kind: "unavailable" });
    expect(seen).toHaveLength(1);
    expect(await client.readUsage([BLUM])).toEqual({
      kind: "counted",
      counts: [{ item: BLUM, designCount: 2 }],
    });
    expect(seen).toHaveLength(2);
  });

  it("is not met by a request that is answered in time, however late: the answer is believed", async () => {
    network((_call, items) => counting(items));
    const read = createFetchingItemLifecycleClient().readUsage([HETTICH]);

    await vi.advanceTimersByTimeAsync(DEADLINE_MS * 4);

    expect(await read).toEqual({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: 2 }],
    });
  });
});

describe("the deadline with a busy answer's wait", () => {
  it("is spent afresh on the retry: busy, a wait of 10 seconds, then a hang cut off at 15 more, and two requests in all", async () => {
    const seen = network((call) => (call === 0 ? busy() : "hang"));
    const read = createFetchingItemLifecycleClient().readUsage([HETTICH]);

    await vi.advanceTimersByTimeAsync(BUSY_WAIT_MS + DEADLINE_MS - 1);
    expect(seen, "the retry is still waiting for its answer").toHaveLength(2);
    expect(seen[1]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await read).toEqual({ kind: "unavailable" });
    expect(seen.map(({ aborted }) => aborted)).toEqual([false, true]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is not followed by a retry: a request that was cut off is not a busy answer", async () => {
    const seen = network(() => "hang");
    const read = createFetchingItemLifecycleClient().readUsage([HETTICH]);

    await vi.advanceTimersByTimeAsync(10 * DEADLINE_MS);

    expect(await read).toEqual({ kind: "unavailable" });
    expect(seen).toHaveLength(1);
  });

  it("does not run during the wait itself: a wait of 10 seconds is not cut off by the deadline of the request before it", async () => {
    const seen = network((call, items) =>
      call === 0 ? busy() : counting(items),
    );
    const read = createFetchingItemLifecycleClient().readUsage([HETTICH]);

    await vi.advanceTimersByTimeAsync(BUSY_WAIT_MS);

    expect(await read).toEqual({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: 2 }],
    });
    expect(seen).toHaveLength(2);
  });
});
