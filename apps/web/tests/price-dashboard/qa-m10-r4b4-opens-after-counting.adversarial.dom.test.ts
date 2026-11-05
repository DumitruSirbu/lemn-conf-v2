// @vitest-environment happy-dom
//
// Adversarial QA of the counts a screen's desk has on their way: however many times a person asks, and in whatever order
// the answers come back, one count is wanted, the one asked last, and only its answer opens a dialog. A count that is
// never answered is told it is no longer wanted when the screen goes.
import fc from "fast-check";
import { act } from "react";
import { describe, expect, it } from "vitest";

import { SAMPLE_PRICE_BOOK, type ItemRef } from "@lemnaria/configurator-domain";

import type { UsageRead } from "@/price-dashboard/item-lifecycle-client";
import { useItemAvailability } from "@/price-dashboard/use-item-availability";

import { flushPromises, renderHook } from "../support/render-hook";
import { recordingLifecycleClient } from "./recording-item-lifecycle-client";

const SOMETHING_TO_SWITCH_OFF: readonly ItemRef[] = [
  { kind: "hardware", tierId: "hardware.soft-close" },
  { kind: "hardware", tierId: "hardware.premium" },
  { kind: "material", tierId: "material.painted-mdf" },
  { kind: "accessory", accessoryId: "dishDryingRack" },
];
const NOTHING_OFF = { revision: "1", disabled: [] };
const COUNT_OF_THE_ITEM_ASKED_LAST = 9;
const COUNT_OF_ANY_OTHER = 2;

interface CountOnItsWay {
  readonly item: ItemRef | undefined;
  readonly signal: AbortSignal | undefined;
  readonly answer: (designCount: number) => void;
}

function deskWithCountsHeldOnTheirWay() {
  const lifecycle = recordingLifecycleClient({
    book: SAMPLE_PRICE_BOOK,
    availability: NOTHING_OFF,
    defaults: {},
    usage: [],
  });
  const counts: CountOnItsWay[] = [];
  const client = {
    ...lifecycle.client,
    readUsage: (items: readonly ItemRef[], signal?: AbortSignal) =>
      new Promise<UsageRead>((resolve) => {
        counts.push({
          item: items[0],
          signal,
          answer: (designCount) => {
            resolve({
              kind: "counted",
              counts: items.map((item) => ({ item, designCount })),
            });
          },
        });
      }),
  };
  const rendered = renderHook(() =>
    useItemAvailability({
      observed: NOTHING_OFF,
      book: SAMPLE_PRICE_BOOK,
      defaults: {},
      client,
      deleteFromDraft: () => Promise.resolve({ kind: "failed" }),
      isDraftOnly: () => false,
    }),
  );
  return { counts, rendered };
}

/** The places of the items asked, in the order asked, and an order in which the counts come back. */
const askedAndAnsweredOrders = fc
  .array(fc.nat({ max: SOMETHING_TO_SWITCH_OFF.length - 1 }), {
    minLength: 1,
    maxLength: 6,
  })
  .chain((askedPlaces) => {
    const places = askedPlaces.map((_, place) => place);
    return fc.tuple(
      fc.constant(askedPlaces),
      fc.shuffledSubarray(places, {
        minLength: places.length,
        maxLength: places.length,
      }),
    );
  });

describe("counts asked one after another before any has answered", () => {
  it("wants only the last, and opens a dialog for it alone, whatever order the answers come in", async () => {
    await fc.assert(
      fc.asyncProperty(askedAndAnsweredOrders, async ([askedPlaces, order]) => {
        const { counts, rendered } = deskWithCountsHeldOnTheirWay();
        for (const place of askedPlaces) {
          const item = SOMETHING_TO_SWITCH_OFF[place];
          if (item === undefined) throw new Error("no such item");
          act(() => {
            rendered.result.current.requestSwitch(item);
          });
        }
        const lastItem = SOMETHING_TO_SWITCH_OFF[askedPlaces.at(-1) ?? 0];

        expect(counts).toHaveLength(askedPlaces.length);
        expect(counts.map(({ signal }) => signal?.aborted)).toEqual(
          askedPlaces.map((_, place) => place < askedPlaces.length - 1),
        );

        for (const place of order) {
          counts[place]?.answer(
            place === counts.length - 1
              ? COUNT_OF_THE_ITEM_ASKED_LAST
              : COUNT_OF_ANY_OTHER,
          );
          await flushPromises(5);
        }

        expect(rendered.result.current.flow).toMatchObject({
          kind: "deactivate",
          item: lastItem,
          usage: { kind: "counted", count: COUNT_OF_THE_ITEM_ASKED_LAST },
        });
        expect(rendered.result.current.isReading).toBe(false);
        rendered.unmount();
      }),
      { numRuns: 40 },
    );
  });

  it("leaves a dialog opened by a count alone when a later ask is for an item with nothing to count", async () => {
    const { counts, rendered } = deskWithCountsHeldOnTheirWay();
    const [first] = SOMETHING_TO_SWITCH_OFF;
    if (first === undefined) throw new Error("no item");
    act(() => {
      rendered.result.current.requestSwitch(first);
    });
    act(() => {
      rendered.result.current.requestSwitch({
        kind: "material",
        tierId: "material.no-such-tier",
      });
    });

    counts[0]?.answer(COUNT_OF_ANY_OTHER);
    await flushPromises(5);

    expect(counts[0]?.signal?.aborted).toBe(true);
    expect(rendered.result.current.flow.kind).not.toBe("deactivate");
    rendered.unmount();
  });

  it("tells the count on its way it is no longer wanted when the screen goes", () => {
    const { counts, rendered } = deskWithCountsHeldOnTheirWay();
    const [first] = SOMETHING_TO_SWITCH_OFF;
    if (first === undefined) throw new Error("no item");
    act(() => {
      rendered.result.current.requestSwitch(first);
    });
    expect(counts[0]?.signal?.aborted).toBe(false);

    rendered.unmount();

    expect(counts[0]?.signal?.aborted).toBe(true);
  });

  it("does not open a dialog for a count that answers after the screen went", async () => {
    const { counts, rendered } = deskWithCountsHeldOnTheirWay();
    const [first] = SOMETHING_TO_SWITCH_OFF;
    if (first === undefined) throw new Error("no item");
    act(() => {
      rendered.result.current.requestSwitch(first);
    });
    rendered.unmount();

    counts[0]?.answer(COUNT_OF_ANY_OTHER);
    await flushPromises(5);

    expect(rendered.result.current.flow.kind).toBe("closed");
  });

  it("keeps the signal of an answered count harmless when the next ask aborts it", async () => {
    const { counts, rendered } = deskWithCountsHeldOnTheirWay();
    const [first, second] = SOMETHING_TO_SWITCH_OFF;
    if (first === undefined || second === undefined) throw new Error("no item");
    act(() => {
      rendered.result.current.requestSwitch(first);
    });
    counts[0]?.answer(COUNT_OF_ANY_OTHER);
    await flushPromises(5);
    expect(rendered.result.current.flow.kind).toBe("deactivate");

    act(() => {
      rendered.result.current.requestSwitch(second);
    });
    counts[1]?.answer(COUNT_OF_THE_ITEM_ASKED_LAST);
    await flushPromises(5);

    expect(rendered.result.current.flow).toMatchObject({
      kind: "deactivate",
      item: second,
      usage: { kind: "counted", count: COUNT_OF_THE_ITEM_ASKED_LAST },
    });
    rendered.unmount();
  });
});
