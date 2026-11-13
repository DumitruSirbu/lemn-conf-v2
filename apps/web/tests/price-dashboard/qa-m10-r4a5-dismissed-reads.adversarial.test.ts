// Adversarial QA of a usage read that nobody wants any more: one still waiting for the read in flight is dropped and sends
// nothing, a read behind it that is wanted still goes out, and the read already on its way is never cut short for the
// views that may be waiting on it.
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isSameItem, type ItemRef } from "@lemnaria/configurator-domain";

import { createFetchingItemLifecycleClient } from "@/price-dashboard/fetching-item-lifecycle-client";
import type { UsageRead } from "@/price-dashboard/item-lifecycle-client";

const UNIVERSE: readonly ItemRef[] = Array.from({ length: 12 }, (_, place) => ({
  kind: "material",
  tierId: `material.m${String(place)}`,
}));
const itemAt = (place: number): ItemRef => {
  const item = UNIVERSE[place];
  if (item === undefined) throw new Error(`no item at ${String(place)}`);
  return item;
};
const A = itemAt(0);
const B = itemAt(1);
const C = itemAt(2);
const TRUTH = 5;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A server that holds each request until the test lets the oldest go. */
function heldServer() {
  const requests: ItemRef[][] = [];
  const releases: (() => void)[] = [];
  vi.stubGlobal("fetch", (_address: string, init: RequestInit) => {
    const { items } = JSON.parse(init.body as string) as { items: ItemRef[] };
    requests.push(items);
    return new Promise<Response>((resolve) => {
      releases.push(() => {
        resolve(
          new Response(
            JSON.stringify({
              counts: items.map((item) => ({ item, count: TRUTH })),
            }),
            { status: 200 },
          ),
        );
      });
    });
  });
  return {
    requests,
    release: async () => {
      releases.shift()?.();
      await vi.waitFor(() => undefined);
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    },
  };
}

const counted = (...items: ItemRef[]): UsageRead => ({
  kind: "counted",
  counts: items.map((item) => ({ item, designCount: TRUTH })),
});

describe("a read nobody wants any more", () => {
  it("is dropped before anything is sent when its signal has aborted already, with no read in flight", async () => {
    const server = heldServer();
    const gone = new AbortController();
    gone.abort();

    const read = await createFetchingItemLifecycleClient().readUsage(
      [A],
      gone.signal,
    );

    expect(read).toEqual({ kind: "unavailable" });
    expect(server.requests).toEqual([]);
  });

  it("is told at once, while the read in flight is still out, and sends nothing when that read ends", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const running = client.readUsage([A]);
    const gone = new AbortController();
    const waiting = client.readUsage([B], gone.signal);

    gone.abort();

    expect(await waiting).toEqual({ kind: "unavailable" });
    await server.release();
    expect(await running).toEqual(counted(A));
    expect(server.requests).toEqual([[A]]);
  });

  it("leaves a wanted read behind it to go out: dismissed, wanted, dismissed sends the runner and the wanted one only", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const first = new AbortController();
    const third = new AbortController();
    const running = client.readUsage([A]);
    const dismissedFirst = client.readUsage([B], first.signal);
    const wanted = client.readUsage([C]);
    const dismissedThird = client.readUsage([itemAt(3)], third.signal);

    first.abort();
    third.abort();
    await server.release();
    await running;
    await vi.waitFor(() => {
      expect(server.requests).toHaveLength(2);
    });
    await server.release();

    expect(await dismissedFirst).toEqual({ kind: "unavailable" });
    expect(await dismissedThird).toEqual({ kind: "unavailable" });
    expect(await wanted).toEqual(counted(C));
    expect(server.requests).toEqual([[A], [C]]);
  });

  it("is dropped when it is aborted in the same turn the read in flight ends: nothing it asked for is sent", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const gone = new AbortController();
    const running = client.readUsage([A]);
    const waiting = client.readUsage([B], gone.signal);

    const released = server.release();
    gone.abort();
    await released;

    expect(await running).toEqual(counted(A));
    expect(await waiting).toEqual({ kind: "unavailable" });
    expect(server.requests).toEqual([[A]]);
  });

  it("does not cut short the read that is on its way when its own asker aborts: the views joined to it are still counted", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const asker = new AbortController();
    const running = client.readUsage([A, B], asker.signal);
    const joined = client.readUsage([B]);

    asker.abort();
    await server.release();

    expect(await running).toEqual(counted(A, B));
    expect(await joined).toEqual(counted(B));
    expect(server.requests).toEqual([[A, B]]);
  });

  it("frees the slot for the next read when every waiter is dropped: a read made later goes out at once", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const gone = new AbortController();
    const running = client.readUsage([A]);
    void client.readUsage([B], gone.signal);
    void client.readUsage([C], gone.signal);
    gone.abort();
    await server.release();
    await running;

    const later = client.readUsage([B]);
    await vi.waitFor(() => {
      expect(server.requests).toHaveLength(2);
    });
    await server.release();

    expect(await later).toEqual(counted(B));
    expect(server.requests).toEqual([[A], [B]]);
  });
});

describe("reads that are dismissed at any moment", () => {
  interface Plan {
    readonly reads: readonly {
      readonly places: readonly number[];
      readonly abortAfterTurns: number | undefined;
      readonly startAfterTurns: number;
    }[];
    readonly answerAfterTurns: number;
  }

  const planArb: fc.Arbitrary<Plan> = fc.record({
    reads: fc.array(
      fc.record({
        places: fc.array(fc.nat(UNIVERSE.length - 1), {
          minLength: 1,
          maxLength: 4,
        }),
        abortAfterTurns: fc.option(fc.nat(12), { nil: undefined }),
        startAfterTurns: fc.nat(6),
      }),
      { minLength: 1, maxLength: 5 },
    ),
    answerAfterTurns: fc.nat(8),
  });

  it("sends only what a read that was still wanted when it was sent asked for, counts what it was asked for truly, and settles every read", async () => {
    await fc.assert(
      fc.asyncProperty(planArb, async ({ reads, answerAfterTurns }) => {
        const controllers = reads.map(() => new AbortController());
        const itemsOf = reads.map(({ places }) => places.map(itemAt));
        const sent: { items: ItemRef[]; wanted: boolean }[] = [];
        vi.stubGlobal("fetch", async (_address: string, init: RequestInit) => {
          const { items } = JSON.parse(init.body as string) as {
            items: ItemRef[];
          };
          sent.push({
            items,
            wanted: itemsOf.some(
              (asked, place) =>
                !controllers[place]?.signal.aborted &&
                items.every((item) =>
                  asked.some((one) => isSameItem(one, item)),
                ),
            ),
          });
          for (let turn = 0; turn < answerAfterTurns; turn += 1) {
            await Promise.resolve();
          }
          return new Response(
            JSON.stringify({
              counts: items.map((item) => ({ item, count: TRUTH })),
            }),
            { status: 200 },
          );
        });
        const client = createFetchingItemLifecycleClient();

        const results = await Promise.all(
          reads.map(async ({ startAfterTurns, abortAfterTurns }, place) => {
            for (let turn = 0; turn < startAfterTurns; turn += 1) {
              await Promise.resolve();
            }
            const controller = controllers[place];
            if (controller === undefined) throw new Error("no controller");
            const pending = client.readUsage(
              itemsOf[place] ?? [],
              controller.signal,
            );
            if (abortAfterTurns !== undefined) {
              for (let turn = 0; turn < abortAfterTurns; turn += 1) {
                await Promise.resolve();
              }
              controller.abort();
            }
            return pending;
          }),
        );

        for (const { items, wanted } of sent) {
          expect(
            wanted,
            `a request for ${JSON.stringify(items)} nobody wanted`,
          ).toBe(true);
        }
        results.forEach((read, place) => {
          if (read.kind !== "counted") return;
          for (const { item, designCount } of read.counts) {
            expect(designCount).toBe(TRUTH);
            expect(itemsOf[place]?.some((one) => isSameItem(one, item))).toBe(
              true,
            );
          }
        });
        results.forEach((read, place) => {
          if (reads[place]?.abortAfterTurns !== undefined) return;
          expect(read.kind, "a read nobody dismissed is counted").toBe(
            "counted",
          );
        });
      }),
      { numRuns: 300 },
    );
  });
});
