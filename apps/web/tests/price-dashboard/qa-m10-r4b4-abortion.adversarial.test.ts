// Adversarial QA of how a count that waits behind another watches its signal: whatever mixture of releases and dismissals
// the waiters meet, every signal ends with no listener of the client's on it, every read settles, and a read dismissed
// before it was asked never reaches the network.
import { getEventListeners } from "node:events";

import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ItemRef } from "@lemnaria/configurator-domain";

import { createFetchingItemLifecycleClient } from "@/price-dashboard/fetching-item-lifecycle-client";
import type { UsageRead } from "@/price-dashboard/item-lifecycle-client";

const COUNT_OF_EVERY_ITEM = 7;
const SOME_ROUNDS_FOR_PROMISES = 4;

type FetchStub = ReturnType<
  typeof vi.fn<(address: string, init: RequestInit) => Promise<Response>>
>;

function materialNumber(place: number): ItemRef {
  return { kind: "material", tierId: `material.${String(place)}` };
}

function bodyItemsOf(init: RequestInit): ItemRef[] {
  return (JSON.parse(init.body as string) as { items: ItemRef[] }).items;
}

function answerOf(items: readonly ItemRef[]): Response {
  return new Response(
    JSON.stringify({
      counts: items.map((item) => ({ item, count: COUNT_OF_EVERY_ITEM })),
    }),
    { status: 200 },
  );
}

/** A usage route whose every request waits to be released, in the order made, or to fail. */
function heldServer() {
  const holds: ((how: "answer" | "fail") => void)[] = [];
  const fetchStub: FetchStub = vi.fn(
    (_address, init) =>
      new Promise<Response>((resolve, reject) => {
        const items = bodyItemsOf(init);
        holds.push((how) => {
          if (how === "fail") reject(new TypeError("network down"));
          else resolve(answerOf(items));
        });
      }),
  );
  vi.stubGlobal("fetch", fetchStub);
  return {
    fetchStub,
    release: (how: "answer" | "fail" = "answer") => holds.shift()?.(how),
    heldCount: () => holds.length,
  };
}

async function letPromisesRun(): Promise<void> {
  for (let round = 0; round < SOME_ROUNDS_FOR_PROMISES; round += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a count behind another, over every mixture of answers, failures and dismissals", () => {
  const step = fc.oneof(
    fc.constant({ kind: "answer" } as const),
    fc.constant({ kind: "fail" } as const),
    fc.record({
      kind: fc.constant("dismiss" as const),
      signal: fc.nat({ max: 2 }),
    }),
  );

  it("leaves no listener on any signal and settles every read", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.nat({ max: 2 }), { minLength: 1, maxLength: 6 }),
        fc.array(step, { maxLength: 8 }),
        async (signalOfRead, script) => {
          const server = heldServer();
          const client = createFetchingItemLifecycleClient();
          const controllers = [0, 1, 2].map(() => new AbortController());
          const reads = signalOfRead.map((signalPlace, readPlace) =>
            client.readUsage(
              [materialNumber(readPlace)],
              controllers[signalPlace]?.signal,
            ),
          );

          for (const move of script) {
            if (move.kind === "dismiss") controllers[move.signal]?.abort();
            else server.release(move.kind);
            await letPromisesRun();
          }
          for (let guard = 0; guard < reads.length * 2; guard += 1) {
            server.release();
            await letPromisesRun();
          }
          const settled = await Promise.all(reads);

          for (const controller of controllers) {
            expect(getEventListeners(controller.signal, "abort")).toHaveLength(
              0,
            );
          }
          expect(settled).toHaveLength(reads.length);
          expect(server.heldCount()).toBe(0);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("never sends a request for a read whose signal had aborted before it was asked", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
        async (isDismissedFirst) => {
          const server = heldServer();
          const client = createFetchingItemLifecycleClient();
          const reads = isDismissedFirst.map((isDismissed, place) => {
            const controller = new AbortController();
            if (isDismissed) controller.abort();
            return {
              isDismissed,
              controller,
              read: client.readUsage(
                [materialNumber(place)],
                controller.signal,
              ),
            };
          });

          await letPromisesRun();
          let released = 0;
          while (released < reads.length) {
            server.release();
            await letPromisesRun();
            released += 1;
          }
          const settled = await Promise.all(reads.map(({ read }) => read));
          const sentItems = server.fetchStub.mock.calls.flatMap(([, init]) =>
            bodyItemsOf(init),
          );

          reads.forEach(({ isDismissed, controller }, place) => {
            if (isDismissed) {
              expect(settled[place]).toEqual({ kind: "unavailable" });
              expect(sentItems).not.toContainEqual(materialNumber(place));
            }
            expect(getEventListeners(controller.signal, "abort")).toHaveLength(
              0,
            );
          });
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe("a count behind another, in the cases a sweep would hide", () => {
  it("goes out on its own when the one ahead failed, and leaves no listener", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const wanted = new AbortController();

    const ahead = client.readUsage([materialNumber(0)]);
    const behind = client.readUsage([materialNumber(1)], wanted.signal);
    server.release("fail");
    await letPromisesRun();
    server.release("answer");

    expect(await ahead).toEqual({ kind: "unavailable" });
    const read: UsageRead = await behind;
    expect(read).toEqual({
      kind: "counted",
      counts: [{ item: materialNumber(1), designCount: COUNT_OF_EVERY_ITEM }],
    });
    expect(getEventListeners(wanted.signal, "abort")).toHaveLength(0);
  });

  it("waits with no signal at all, and goes out when the one ahead ends", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();

    const ahead = client.readUsage([materialNumber(0)]);
    const behind = client.readUsage([materialNumber(1)]);
    await letPromisesRun();
    expect(server.fetchStub).toHaveBeenCalledTimes(1);
    server.release();
    await ahead;
    await letPromisesRun();
    server.release();

    expect(await behind).toMatchObject({ kind: "counted" });
  });

  it("holds one listener per waiter on a shared signal, and none once they have all been dismissed by it", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const shared = new AbortController();
    const waiterCount = 12;

    const ahead = client.readUsage([materialNumber(0)]);
    const waiters = Array.from({ length: waiterCount }, (_, place) =>
      client.readUsage([materialNumber(place + 1)], shared.signal),
    );
    expect(getEventListeners(shared.signal, "abort")).toHaveLength(waiterCount);
    shared.abort();
    const dismissed = await Promise.all(waiters);

    expect(dismissed.every(({ kind }) => kind === "unavailable")).toBe(true);
    expect(getEventListeners(shared.signal, "abort")).toHaveLength(0);
    expect(server.fetchStub).toHaveBeenCalledTimes(1);
    server.release();
    await ahead;
  });

  it("does not grow the listeners of a signal that is asked with again and again once each read has ended", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const shared = new AbortController();

    for (let round = 0; round < 25; round += 1) {
      const ahead = client.readUsage([materialNumber(0)]);
      const behind = client.readUsage([materialNumber(1)], shared.signal);
      server.release();
      await ahead;
      await letPromisesRun();
      server.release();
      await behind;
    }

    expect(getEventListeners(shared.signal, "abort")).toHaveLength(0);
  });
});
