// @vitest-environment happy-dom
//
// Adversarial QA of the screens' side of a dismissed count, over the real fetching client and a server that holds its
// first count: a dialog dismissed while its count waits behind another sends nothing, a question asked after it still
// goes out, and a view that is gone takes its waiting count with it.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK, type ItemRef } from "@lemnaria/configurator-domain";

import { createFetchingItemLifecycleClient } from "@/price-dashboard/fetching-item-lifecycle-client";
import { useItemAvailability } from "@/price-dashboard/use-item-availability";
import { useMaterialUsage } from "@/price-dashboard/use-material-usage";

import { flushPromises, renderHook } from "../support/render-hook";
import { materialItem, MDF, VENEER } from "./material-harness";

const HETTICH: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const BLUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const RUNNING: ItemRef = { kind: "accessory", accessoryId: "dishDryingRack" };
const NOTHING_OFF = { revision: "1", disabled: [] };
const SERVER_COUNT = 6;

afterEach(() => {
  vi.unstubAllGlobals();
});

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
              counts: items.map((item) => ({ item, count: SERVER_COUNT })),
            }),
            { status: 200 },
          ),
        );
      });
    });
  });
  return {
    requests,
    releaseOldest: async () => {
      await act(async () => {
        releases.shift()?.();
        await flushPromises(10);
      });
    },
  };
}

function deskOver(
  client: ReturnType<typeof createFetchingItemLifecycleClient>,
) {
  return renderHook(() =>
    useItemAvailability({
      observed: NOTHING_OFF,
      book: SAMPLE_PRICE_BOOK,
      defaults: {},
      client,
      deleteFromDraft: () => Promise.resolve({ kind: "failed" }),
      isDraftOnly: () => false,
    }),
  );
}

describe("a dialog whose count is waiting behind another", () => {
  it("sends nothing once it is dismissed, and the next question's count goes out after the one in flight", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const rendered = deskOver(client);
    void client.readUsage([RUNNING]);
    await flushPromises(3);

    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });
    await flushPromises(3);
    expect(rendered.result.current.isReading).toBe(true);
    act(() => {
      rendered.result.current.dismiss();
    });
    act(() => {
      rendered.result.current.requestSwitch(BLUM);
    });
    await server.releaseOldest();
    await vi.waitFor(() => {
      expect(server.requests).toHaveLength(2);
    });
    await server.releaseOldest();

    expect(server.requests).toEqual([[RUNNING], [BLUM]]);
    expect(rendered.result.current.flow).toMatchObject({
      kind: "deactivate",
      item: BLUM,
      usage: { kind: "counted", count: SERVER_COUNT },
    });
    rendered.unmount();
  });

  it("sends nothing when another question replaces it before the count in flight ends", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const rendered = deskOver(client);
    void client.readUsage([RUNNING]);
    await flushPromises(3);

    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });
    act(() => {
      rendered.result.current.requestSwitch(BLUM);
    });
    await server.releaseOldest();
    await vi.waitFor(() => {
      expect(server.requests).toHaveLength(2);
    });
    await server.releaseOldest();

    expect(server.requests).toEqual([[RUNNING], [BLUM]]);
    expect(rendered.result.current.flow).toMatchObject({ item: BLUM });
    rendered.unmount();
  });

  it("sends nothing once the desk is unmounted", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    const rendered = deskOver(client);
    void client.readUsage([RUNNING]);
    await flushPromises(3);
    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });
    await flushPromises(3);

    rendered.unmount();
    await server.releaseOldest();
    await flushPromises(10);

    expect(server.requests).toEqual([[RUNNING]]);
  });
});

describe("a material view whose count is waiting behind another", () => {
  const OFF = {
    revision: "1",
    disabled: [materialItem(MDF), materialItem(VENEER)],
  };

  it("sends nothing once the view is gone", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    void client.readUsage([RUNNING]);
    await flushPromises(3);
    const rendered = renderHook(() =>
      useMaterialUsage({
        client,
        book: SAMPLE_PRICE_BOOK,
        availability: OFF,
      }),
    );
    await flushPromises(3);

    rendered.unmount();
    await server.releaseOldest();
    await flushPromises(10);

    expect(server.requests).toEqual([[RUNNING]]);
  });

  it("joins its own read in flight when the switches narrow under it, and says only the counts of the materials still off", async () => {
    const server = heldServer();
    const client = createFetchingItemLifecycleClient();
    let availability = OFF;
    const rendered = renderHook(() =>
      useMaterialUsage({ client, book: SAMPLE_PRICE_BOOK, availability }),
    );
    await flushPromises(3);
    availability = { revision: "2", disabled: [materialItem(MDF)] };
    rendered.rerender();
    await flushPromises(3);

    await server.releaseOldest();
    await flushPromises(10);

    expect(server.requests).toEqual([
      [materialItem(MDF), materialItem(VENEER)],
    ]);
    expect([...rendered.result.current]).toEqual([[MDF, SERVER_COUNT]]);
    rendered.unmount();
  });
});
