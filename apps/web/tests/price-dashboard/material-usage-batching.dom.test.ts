// @vitest-environment happy-dom
//
// How many saved kitchens use each switched-off material is asked once for all of them. A count belongs to the item it
// was given for, whatever the order the reader answered in; a read that fails leaves every count of it unknown; and a
// screen never holds a count for a material its book does not state. Views that count at the same time (strict mode runs
// an effect twice, and a page may be open twice) both end up counted, against a server that allows one count at a time.
import { act, createElement, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type ItemUsageCounts,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import {
  createFetchingItemLifecycleClient,
  FETCHING_ITEM_LIFECYCLE_CLIENT,
} from "@/price-dashboard/fetching-item-lifecycle-client";
import {
  UNAVAILABLE_ITEM_LIFECYCLE_CLIENT,
  type ItemLifecycleClient,
  type UsageRead,
} from "@/price-dashboard/item-lifecycle-client";
import { useMaterialUsage } from "@/price-dashboard/use-material-usage";

import { flushPromises, renderHook } from "../support/render-hook";
import { MDF, materialItem, VENEER } from "./material-harness";

const NOTHING_OFF = { revision: "1", disabled: [] };
const MDF_AND_VENEER_OFF = {
  revision: "1",
  disabled: [materialItem(MDF), materialItem(VENEER)],
};
const ONLY_MDF_AND_VENEER_COUNTS: ItemUsageCounts = [
  { item: materialItem(MDF), designCount: 23 },
  { item: materialItem(VENEER), designCount: 4 },
];

interface RecordedClient {
  readonly client: ItemLifecycleClient;
  readonly asked: (readonly ItemRef[])[];
}

function clientAnswering(
  answer: (items: readonly ItemRef[]) => Promise<UsageRead>,
): RecordedClient {
  const asked: (readonly ItemRef[])[] = [];
  return {
    asked,
    client: {
      ...UNAVAILABLE_ITEM_LIFECYCLE_CLIENT,
      readUsage: (items) => {
        asked.push(items);
        return answer(items);
      },
    },
  };
}

const countedAs = (counts: ItemUsageCounts): Promise<UsageRead> =>
  Promise.resolve({ kind: "counted", counts });

function bookWithout(tierId: string): PriceBook {
  return {
    ...SAMPLE_PRICE_BOOK,
    material: {
      ...SAMPLE_PRICE_BOOK.material,
      tiers: SAMPLE_PRICE_BOOK.material.tiers.filter(
        (tier) => tier.tierId !== tierId,
      ),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the counts of the switched-off materials", () => {
  it("are asked in one request that names every one of them", async () => {
    const { client, asked } = clientAnswering(() =>
      countedAs(ONLY_MDF_AND_VENEER_COUNTS),
    );

    const rendered = renderHook(() =>
      useMaterialUsage({
        client,
        book: SAMPLE_PRICE_BOOK,
        availability: MDF_AND_VENEER_OFF,
      }),
    );
    await flushPromises();

    expect(asked).toEqual([[materialItem(MDF), materialItem(VENEER)]]);
    expect([...rendered.result.current]).toEqual([
      [MDF, 23],
      [VENEER, 4],
    ]);
    rendered.unmount();
  });

  it("are asked for nothing when nothing is switched off", async () => {
    const { client, asked } = clientAnswering(() => countedAs([]));

    const rendered = renderHook(() =>
      useMaterialUsage({
        client,
        book: SAMPLE_PRICE_BOOK,
        availability: NOTHING_OFF,
      }),
    );
    await flushPromises();

    expect(asked).toEqual([]);
    expect(rendered.result.current.size).toBe(0);
    rendered.unmount();
  });

  it("go to the material they were counted for, whatever the order the reader answered in", async () => {
    const { client } = clientAnswering(() =>
      countedAs([...ONLY_MDF_AND_VENEER_COUNTS].reverse()),
    );

    const rendered = renderHook(() =>
      useMaterialUsage({
        client,
        book: SAMPLE_PRICE_BOOK,
        availability: MDF_AND_VENEER_OFF,
      }),
    );
    await flushPromises();

    expect(rendered.result.current.get(MDF)).toBe(23);
    expect(rendered.result.current.get(VENEER)).toBe(4);
    rendered.unmount();
  });

  it("are all unknown, never zero, when the one read fails or never arrives", async () => {
    for (const answer of [
      () => Promise.resolve<UsageRead>({ kind: "unavailable" }),
      () => Promise.reject<UsageRead>(new Error("offline")),
    ]) {
      const { client } = clientAnswering(answer);

      const rendered = renderHook(() =>
        useMaterialUsage({
          client,
          book: SAMPLE_PRICE_BOOK,
          availability: MDF_AND_VENEER_OFF,
        }),
      );
      await flushPromises();

      expect(rendered.result.current.size).toBe(0);
      rendered.unmount();
    }
  });

  it("leave a material with no count out when the reader named none for it", async () => {
    const { client } = clientAnswering(() =>
      countedAs([{ item: materialItem(MDF), designCount: 23 }]),
    );

    const rendered = renderHook(() =>
      useMaterialUsage({
        client,
        book: SAMPLE_PRICE_BOOK,
        availability: MDF_AND_VENEER_OFF,
      }),
    );
    await flushPromises();

    expect([...rendered.result.current]).toEqual([[MDF, 23]]);
    rendered.unmount();
  });

  it("show no count for a material the book no longer states, not even the one it was counted at", async () => {
    const { client } = clientAnswering(() =>
      countedAs(ONLY_MDF_AND_VENEER_COUNTS),
    );
    let book = SAMPLE_PRICE_BOOK;
    const rendered = renderHook(() =>
      useMaterialUsage({ client, book, availability: MDF_AND_VENEER_OFF }),
    );
    await flushPromises();
    expect(rendered.result.current.get(VENEER)).toBe(4);

    book = bookWithout(VENEER);
    rendered.rerender();

    expect(rendered.result.current.has(VENEER)).toBe(false);
    expect(rendered.result.current.get(MDF)).toBe(23);
    await flushPromises();
    expect(rendered.result.current.has(VENEER)).toBe(false);
    rendered.unmount();
  });

  it("show no count for a material the server's book dropped though the screen's book still states it: the fetching client is told nothing of it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              counts: [{ item: materialItem(MDF), count: 23 }],
            }),
            { status: 200 },
          ),
        ),
      ),
    );

    const client = createFetchingItemLifecycleClient();
    const rendered = renderHook(() =>
      useMaterialUsage({
        client,
        book: SAMPLE_PRICE_BOOK,
        availability: MDF_AND_VENEER_OFF,
      }),
    );
    await flushPromises();

    expect([...rendered.result.current]).toEqual([[MDF, 23]]);
    expect(rendered.result.current.has(VENEER)).toBe(false);
    rendered.unmount();
  });

  it("are no longer wanted once the view is gone: the read is told by its signal", async () => {
    const signals: (AbortSignal | undefined)[] = [];
    const client: ItemLifecycleClient = {
      ...UNAVAILABLE_ITEM_LIFECYCLE_CLIENT,
      readUsage: (_items, signal) => {
        signals.push(signal);
        return new Promise<UsageRead>(() => undefined);
      },
    };
    const rendered = renderHook(() =>
      useMaterialUsage({
        client,
        book: SAMPLE_PRICE_BOOK,
        availability: MDF_AND_VENEER_OFF,
      }),
    );
    await flushPromises();
    expect(signals[0]?.aborted).toBe(false);

    rendered.unmount();

    expect(signals[0]?.aborted).toBe(true);
  });

  it("show no count for a material only `alsoCount` names when the book does not state it", async () => {
    const { client, asked } = clientAnswering(() =>
      countedAs(ONLY_MDF_AND_VENEER_COUNTS),
    );

    const rendered = renderHook(() =>
      useMaterialUsage({
        client,
        book: bookWithout(VENEER),
        availability: NOTHING_OFF,
        alsoCount: VENEER,
      }),
    );
    await flushPromises();

    expect(asked).toEqual([]);
    expect(rendered.result.current.size).toBe(0);
    rendered.unmount();
  });
});

/**
 * The usage route as the server allows it: one count at a time per account. A count that arrives while another is out is
 * `429` with `Retry-After: 10`. A count takes one second to answer.
 */
function singleFlightServer() {
  let isCounting = false;
  const served: ItemRef[][] = [];
  let busyAnswers = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_address: string, init: RequestInit) => {
      if (isCounting) {
        busyAnswers += 1;
        return new Response(JSON.stringify({ status: "rate-limited" }), {
          status: 429,
          headers: { "Retry-After": "10" },
        });
      }
      isCounting = true;
      const { items } = JSON.parse(init.body as string) as {
        items: ItemRef[];
      };
      served.push(items);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      isCounting = false;
      return new Response(
        JSON.stringify({
          counts: [...items]
            .reverse()
            .map((item) => ({ item, count: item.kind === "material" ? 5 : 0 })),
        }),
        { status: 200 },
      );
    }),
  );
  return { served, busyAnswers: () => busyAnswers };
}

async function letTimePass(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe("two views that count at the same time", () => {
  it("send one request between them when strict mode runs the effect twice, and are counted", async () => {
    vi.useFakeTimers();
    const server = singleFlightServer();

    const rendered = renderHook(
      () =>
        useMaterialUsage({
          client: FETCHING_ITEM_LIFECYCLE_CLIENT,
          book: SAMPLE_PRICE_BOOK,
          availability: MDF_AND_VENEER_OFF,
        }),
      (children) => createElement(StrictMode, null, children),
    );
    await letTimePass(1_000);

    expect(server.served).toEqual([[materialItem(MDF), materialItem(VENEER)]]);
    expect(server.busyAnswers()).toBe(0);
    expect([...rendered.result.current]).toEqual([
      [MDF, 5],
      [VENEER, 5],
    ]);
    rendered.unmount();
  });

  it("are both counted when they share a client and count different materials: the second waits for the first", async () => {
    vi.useFakeTimers();
    const server = singleFlightServer();
    const one = renderHook(() =>
      useMaterialUsage({
        client: FETCHING_ITEM_LIFECYCLE_CLIENT,
        book: SAMPLE_PRICE_BOOK,
        availability: { revision: "1", disabled: [materialItem(MDF)] },
      }),
    );
    const other = renderHook(() =>
      useMaterialUsage({
        client: FETCHING_ITEM_LIFECYCLE_CLIENT,
        book: SAMPLE_PRICE_BOOK,
        availability: { revision: "1", disabled: [materialItem(VENEER)] },
      }),
    );
    await letTimePass(2_000);

    expect(server.busyAnswers()).toBe(0);
    expect([...one.result.current]).toEqual([[MDF, 5]]);
    expect([...other.result.current]).toEqual([[VENEER, 5]]);
    one.unmount();
    other.unmount();
  });

  it("are both counted when the server finds one busy: it asks again after the seconds it was told, and says nothing wrong in between", async () => {
    vi.useFakeTimers();
    const server = singleFlightServer();
    // Two clients stand for two windows: nothing joins the other's read, so the server's own answer decides.
    const firstWindow = createFetchingItemLifecycleClient();
    const secondWindow = createFetchingItemLifecycleClient();
    const one = renderHook(() =>
      useMaterialUsage({
        client: firstWindow,
        book: SAMPLE_PRICE_BOOK,
        availability: { revision: "1", disabled: [materialItem(MDF)] },
      }),
    );
    const other = renderHook(() =>
      useMaterialUsage({
        client: secondWindow,
        book: SAMPLE_PRICE_BOOK,
        availability: { revision: "1", disabled: [materialItem(VENEER)] },
      }),
    );

    await letTimePass(1_000);
    expect(server.busyAnswers()).toBe(1);
    expect([...one.result.current]).toEqual([[MDF, 5]]);
    expect(other.result.current.size).toBe(0);

    await letTimePass(10_000);
    await letTimePass(1_000);

    expect([...other.result.current]).toEqual([[VENEER, 5]]);
    expect(server.served).toEqual([
      [materialItem(MDF)],
      [materialItem(VENEER)],
    ]);
    one.unmount();
    other.unmount();
  });
});
