// @vitest-environment happy-dom
//
// A person who asks for the count of an item again, before the first count has answered, has one question open, not two:
// the first count is told it is no longer wanted, and its answer opens no dialog.
import { act } from "react";
import { describe, expect, it } from "vitest";

import { SAMPLE_PRICE_BOOK, type ItemRef } from "@lemnaria/configurator-domain";

import type { UsageRead } from "@/price-dashboard/item-lifecycle-client";
import { useItemAvailability } from "@/price-dashboard/use-item-availability";

import { draftMovingOnEveryRead } from "../support/draft-facts-now";
import { flushPromises, renderHook } from "../support/render-hook";
import { recordingLifecycleClient } from "./recording-item-lifecycle-client";

const HETTICH: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const NOTHING_OFF = { revision: "1", disabled: [] };
const FIRST_COUNT = 14;
const SECOND_COUNT = 3;

interface CountOnItsWay {
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
      readDraftNow: draftMovingOnEveryRead(),
    }),
  );
  return { counts, rendered };
}

describe("a second request for the count of an item", () => {
  it("tells the first count it is no longer wanted, and leaves the second one wanted", () => {
    const { counts, rendered } = deskWithCountsHeldOnTheirWay();

    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });
    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });

    expect(counts).toHaveLength(2);
    expect(counts[0]?.signal?.aborted).toBe(true);
    expect(counts[1]?.signal?.aborted).toBe(false);
    rendered.unmount();
  });

  it("opens no dialog from the first answer, and opens the second one's when it comes", async () => {
    const { counts, rendered } = deskWithCountsHeldOnTheirWay();
    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });
    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });

    counts[0]?.answer(FIRST_COUNT);
    await flushPromises(5);

    expect(rendered.result.current.flow.kind).toBe("closed");
    expect(rendered.result.current.isReading).toBe(true);

    counts[1]?.answer(SECOND_COUNT);
    await flushPromises(5);

    expect(rendered.result.current.flow).toMatchObject({
      kind: "deactivate",
      usage: { kind: "counted", count: SECOND_COUNT },
    });
    rendered.unmount();
  });
});
