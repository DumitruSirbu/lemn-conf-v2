// @vitest-environment happy-dom
//
// The count a dialog says is the count of an item the book states. One request asks for it, and a book that has since
// dropped the item leaves nothing to say of it: the dialog then reads as not counted, never as a number.
import { act } from "react";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type { UsageRead } from "@/price-dashboard/item-lifecycle-client";
import { useItemAvailability } from "@/price-dashboard/use-item-availability";

import { draftMovingOnEveryRead } from "../support/draft-facts-now";
import { flushPromises, renderHook } from "../support/render-hook";
import { recordingLifecycleClient } from "./recording-item-lifecycle-client";

const HETTICH: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const NOTHING_OFF = { revision: "1", disabled: [] };

function bookWithoutHettich(): PriceBook {
  return {
    ...SAMPLE_PRICE_BOOK,
    hardware: {
      ...SAMPLE_PRICE_BOOK.hardware,
      tiers: SAMPLE_PRICE_BOOK.hardware.tiers.filter(
        (tier) => tier.tierId !== "hardware.soft-close",
      ),
    },
  };
}

function deskOver(book: () => PriceBook) {
  const lifecycle = recordingLifecycleClient({
    book: SAMPLE_PRICE_BOOK,
    availability: NOTHING_OFF,
    defaults: {},
    usage: [{ item: HETTICH, designCount: 14 }],
  });
  const rendered = renderHook(() =>
    useItemAvailability({
      observed: NOTHING_OFF,
      book: book(),
      defaults: {},
      client: lifecycle.client,
      deleteFromDraft: () => Promise.resolve({ kind: "failed" }),
      isDraftOnly: () => false,
      readDraftNow: draftMovingOnEveryRead({ book }),
    }),
  );
  return { lifecycle, rendered };
}

describe("the dialog of a switch-off", () => {
  it("counts the item in one request and says the number it was given", async () => {
    const { lifecycle, rendered } = deskOver(() => SAMPLE_PRICE_BOOK);

    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });
    await flushPromises(5);

    expect(lifecycle.calls.filter(({ kind }) => kind === "readUsage")).toEqual([
      { kind: "readUsage", itemCount: 1 },
    ]);
    expect(rendered.result.current.flow).toMatchObject({
      kind: "deactivate",
      usage: { kind: "counted", count: 14 },
    });
    rendered.unmount();
  });

  it("tells the read it is no longer wanted when the dialog is dismissed or the view is gone", () => {
    const signals: (AbortSignal | undefined)[] = [];
    const lifecycle = recordingLifecycleClient({
      book: SAMPLE_PRICE_BOOK,
      availability: NOTHING_OFF,
      defaults: {},
      usage: [{ item: HETTICH, designCount: 14 }],
    });
    const client = {
      ...lifecycle.client,
      readUsage: (items: readonly ItemRef[], signal?: AbortSignal) => {
        signals.push(signal);
        return new Promise<UsageRead>(() => undefined).then(() =>
          lifecycle.client.readUsage(items),
        );
      },
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

    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });
    expect(signals[0]?.aborted).toBe(false);
    act(() => {
      rendered.result.current.dismiss();
    });
    expect(signals[0]?.aborted).toBe(true);

    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });
    expect(signals[1]?.aborted).toBe(false);
    rendered.unmount();
    expect(signals[1]?.aborted).toBe(true);
  });

  it("says nothing of a number when the book drops the item while it is being counted", async () => {
    let book = SAMPLE_PRICE_BOOK;
    const { lifecycle, rendered } = deskOver(() => book);
    const release = lifecycle.holdNextUsage();

    act(() => {
      rendered.result.current.requestSwitch(HETTICH);
    });
    book = bookWithoutHettich();
    rendered.rerender();
    release();
    await flushPromises(5);

    expect(rendered.result.current.flow).toMatchObject({
      kind: "deactivate",
      usage: { kind: "unavailable" },
    });
    rendered.unmount();
  });
});
