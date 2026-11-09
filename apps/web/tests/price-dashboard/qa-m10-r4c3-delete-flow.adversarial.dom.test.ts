// @vitest-environment happy-dom
//
// Adversarial QA of M10 R4c3 at the desk's own seam: what a deletion does with each answer the draft route can give, as
// the hook drives it. A conflict or a refused candidate closes the dialog and counts again; a refusal for use is the
// server's last word whatever the count said; a failure, a busy draft and a default's refusal leave the count alone; one
// confirmation is out at a time; and a row only the draft held that is gone by the recount leaves no Delete to press.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DeletableItemRef,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import type {
  ItemLifecycleClient,
  UsageRead,
} from "@/price-dashboard/item-lifecycle-client";
import { DRAFT_CHANGE_REFUSAL_CODES } from "@/price-dashboard/price-dashboard-wire-contract";
import { useItemAvailability } from "@/price-dashboard/use-item-availability";
import type { FieldWriteResult } from "@/price-dashboard/use-price-draft";

import { flushPromises, renderHook } from "../support/render-hook";
import { recordingLifecycleClient } from "./recording-item-lifecycle-client";

const HETTICH: DeletableItemRef = {
  kind: "hardware",
  tierId: "hardware.soft-close",
};
const BLUM: DeletableItemRef = { kind: "hardware", tierId: "hardware.premium" };
const CREATED_ONLY_IN_DRAFT: DeletableItemRef = {
  kind: "hardware",
  tierId: "hardware.economic",
};
const NOTHING_OFF = { revision: "1", disabled: [] };
const NO_KITCHEN = 0;
const ONE_KITCHEN = 1;
const SAVED = { kind: "saved" } as const;
const CONFLICT = { kind: "conflict" } as const;
const CANDIDATE_REFUSED = { kind: "candidate-refused" } as const;
const REFUSED_FOR_USE = { kind: "refused", code: "ITEM_IN_USE" } as const;
const MANY_TICKS = 40;

interface DeskOptions {
  /** What the draft route answers each deletion in turn; once spent, it saves. */
  readonly answers?: readonly FieldWriteResult[];
  readonly isDraftOnly?: () => boolean;
  readonly wrapClient?: (client: ItemLifecycleClient) => ItemLifecycleClient;
  readonly deleteFromDraft?: (
    item: DeletableItemRef,
  ) => Promise<FieldWriteResult>;
}

function deskDeleting({
  answers = [],
  isDraftOnly = () => false,
  wrapClient = (client) => client,
  deleteFromDraft,
}: DeskOptions = {}) {
  const lifecycle = recordingLifecycleClient({
    book: SAMPLE_PRICE_BOOK,
    availability: NOTHING_OFF,
    defaults: {},
    usage: [
      { item: HETTICH, designCount: NO_KITCHEN },
      { item: BLUM, designCount: NO_KITCHEN },
    ],
  });
  const remaining = [...answers];
  const write = vi.fn(
    deleteFromDraft ??
      (() => Promise.resolve<FieldWriteResult>(remaining.shift() ?? SAVED)),
  );
  const client = wrapClient(lifecycle.client);
  const rendered = renderHook(() =>
    useItemAvailability({
      observed: NOTHING_OFF,
      book: SAMPLE_PRICE_BOOK,
      defaults: {},
      client,
      deleteFromDraft: write,
      isDraftOnly,
    }),
  );
  return { lifecycle, write, rendered };
}

type Rendered = ReturnType<typeof deskDeleting>["rendered"];

const usageReads = (calls: readonly { readonly kind: string }[]): number =>
  calls.filter(({ kind }) => kind === "readUsage").length;

async function request(rendered: Rendered, item: DeletableItemRef) {
  act(() => {
    rendered.result.current.requestDeletion(item);
  });
  await flushPromises(6);
}

async function confirm(rendered: Rendered) {
  act(() => {
    rendered.result.current.confirm();
  });
  await flushPromises(MANY_TICKS);
}

async function openCounted(rendered: Rendered, item = HETTICH) {
  await request(rendered, item);
  expect(rendered.result.current.flow).toMatchObject({
    kind: "delete",
    usage: { kind: "counted" },
  });
}

/** A client whose answer to the availability read waits for the release, so a test acts inside the recount's gap. */
function holdingAvailability(client: ItemLifecycleClient) {
  let gate: Promise<void> = Promise.resolve();
  let release: () => void = () => undefined;
  const wrapped: ItemLifecycleClient = {
    ...client,
    readAvailability: async () => {
      await gate;
      return client.readAvailability();
    },
  };
  return {
    wrapped,
    hold: () => {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release: () => {
      release();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a deletion answered conflict or candidate-refused, then counted again", () => {
  describe.each([
    { word: "conflict", answer: CONFLICT },
    { word: "candidate-refused", answer: CANDIDATE_REFUSED },
  ])("$word", ({ answer }) => {
    it("offers no confirmable Delete when the new count is unavailable: the dialog says it cannot count and a press sends nothing", async () => {
      const { lifecycle, write, rendered } = deskDeleting({
        answers: [answer],
      });
      await openCounted(rendered);
      lifecycle.answerNextUsageWith({ kind: "unavailable" });

      await confirm(rendered);

      expect(rendered.result.current.flow).toMatchObject({
        kind: "delete",
        usage: { kind: "unavailable" },
      });
      await confirm(rendered);
      await confirm(rendered);
      expect(write).toHaveBeenCalledTimes(1);
      rendered.unmount();
    });

    it("offers no confirmable Delete when the count request itself throws", async () => {
      const throwsOnSecondCount = (client: ItemLifecycleClient) => {
        let asked = 0;
        return {
          ...client,
          readUsage: (items: readonly ItemRef[], signal?: AbortSignal) => {
            asked += 1;
            return asked === 1
              ? client.readUsage(items, signal)
              : Promise.reject(new Error("the count route is down"));
          },
        } as ItemLifecycleClient;
      };
      const { write, rendered } = deskDeleting({
        answers: [answer],
        wrapClient: throwsOnSecondCount,
      });
      await openCounted(rendered);

      await confirm(rendered);

      expect(rendered.result.current.flow).toMatchObject({
        kind: "delete",
        usage: { kind: "unavailable" },
      });
      await confirm(rendered);
      expect(write).toHaveBeenCalledTimes(1);
      rendered.unmount();
    });

    it("still counts again when reading the availability fails, since the count is what the dialog stands on", async () => {
      const failsToReadAvailability = (client: ItemLifecycleClient) => ({
        ...client,
        readAvailability: () => Promise.reject(new Error("no read")),
      });
      const { lifecycle, rendered } = deskDeleting({
        answers: [answer],
        wrapClient: failsToReadAvailability,
      });
      await openCounted(rendered);

      await confirm(rendered);

      expect(usageReads(lifecycle.calls)).toBe(2);
      expect(rendered.result.current.flow).toMatchObject({
        kind: "delete",
        usage: { kind: "counted" },
      });
      rendered.unmount();
    });

    it("recounts exactly once per answer and never loops, however long it is left: each further press adds one write and one count", async () => {
      const { lifecycle, write, rendered } = deskDeleting({
        answers: [answer, answer, answer],
      });
      await openCounted(rendered);

      await confirm(rendered);
      expect(write).toHaveBeenCalledTimes(1);
      expect(usageReads(lifecycle.calls)).toBe(2);
      await flushPromises(MANY_TICKS);
      expect(usageReads(lifecycle.calls)).toBe(2);

      await confirm(rendered);
      expect(write).toHaveBeenCalledTimes(2);
      expect(usageReads(lifecycle.calls)).toBe(3);
      await confirm(rendered);
      expect(write).toHaveBeenCalledTimes(3);
      expect(usageReads(lifecycle.calls)).toBe(4);
      await flushPromises(MANY_TICKS);
      expect(usageReads(lifecycle.calls)).toBe(4);
      expect(rendered.result.current.isBusy).toBe(false);
      rendered.unmount();
    });

    it("sends nothing from a press made while the availability is being read again, the dialog being closed and the desk busy", async () => {
      const held = holdingAvailability(
        recordingLifecycleClient({
          book: SAMPLE_PRICE_BOOK,
          availability: NOTHING_OFF,
          defaults: {},
          usage: [{ item: HETTICH, designCount: NO_KITCHEN }],
        }).client,
      );
      const { write, rendered } = deskDeleting({
        answers: [answer],
        wrapClient: () => held.wrapped,
      });
      await openCounted(rendered);
      held.hold();

      await confirm(rendered);

      expect(rendered.result.current.flow.kind).toBe("closed");
      expect(rendered.result.current.isBusy).toBe(true);
      await confirm(rendered);
      expect(write).toHaveBeenCalledTimes(1);
      held.release();
      await flushPromises(MANY_TICKS);
      expect(rendered.result.current.isBusy).toBe(false);
      rendered.unmount();
    });

    it("keeps another item's dialog when it was asked for while the availability was read again", async () => {
      const held = holdingAvailability(
        recordingLifecycleClient({
          book: SAMPLE_PRICE_BOOK,
          availability: NOTHING_OFF,
          defaults: {},
          usage: [
            { item: HETTICH, designCount: NO_KITCHEN },
            { item: BLUM, designCount: NO_KITCHEN },
          ],
        }).client,
      );
      const { rendered } = deskDeleting({
        answers: [answer],
        wrapClient: () => held.wrapped,
      });
      await openCounted(rendered);
      held.hold();
      await confirm(rendered);

      act(() => {
        rendered.result.current.requestSwitch(BLUM);
      });
      await flushPromises(MANY_TICKS);
      expect(rendered.result.current.flow).toMatchObject({
        kind: "deactivate",
        item: BLUM,
      });
      held.release();
      await flushPromises(MANY_TICKS);

      expect(rendered.result.current.flow).toMatchObject({
        kind: "deactivate",
        item: BLUM,
      });
      rendered.unmount();
    });
  });
});

describe("a deletion of a row only the draft holds, answered conflict or candidate-refused", () => {
  it.each([
    { word: "conflict", answer: CONFLICT },
    { word: "candidate-refused", answer: CANDIDATE_REFUSED },
  ])(
    "reopens the draft-only dialog on $word with no count asked at all",
    async ({ answer }) => {
      const { lifecycle, write, rendered } = deskDeleting({
        answers: [answer],
        isDraftOnly: () => true,
      });
      await request(rendered, CREATED_ONLY_IN_DRAFT);

      await confirm(rendered);

      expect(usageReads(lifecycle.calls)).toBe(0);
      expect(
        lifecycle.calls.map(({ kind }) => kind),
        "the dialog was closed and judged again on a fresh read, not left standing",
      ).toContain("readAvailability");
      expect(rendered.result.current.flow).toMatchObject({
        kind: "delete",
        isDraftOnly: true,
      });
      expect(write).toHaveBeenCalledTimes(1);
      rendered.unmount();
    },
  );

  it("leaves no confirmable Delete when the other writer took the row out of the draft before the recount: nothing is counted and nothing more is sent", async () => {
    let isStillInDraft = true;
    const { lifecycle, write, rendered } = deskDeleting({
      answers: [CONFLICT],
      isDraftOnly: () => isStillInDraft,
    });
    await request(rendered, CREATED_ONLY_IN_DRAFT);
    expect(rendered.result.current.flow).toMatchObject({
      kind: "delete",
      isDraftOnly: true,
    });
    isStillInDraft = false;

    await confirm(rendered);

    expect(usageReads(lifecycle.calls)).toBe(0);
    const { flow } = rendered.result.current;
    expect(flow).not.toMatchObject({ isDraftOnly: true });
    expect(flow).not.toMatchObject({
      kind: "delete",
      usage: { kind: "counted" },
    });
    await confirm(rendered);
    await confirm(rendered);
    expect(write).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });

  it("keeps another item's dialog when it was asked for while the availability was read again", async () => {
    const held = holdingAvailability(
      recordingLifecycleClient({
        book: SAMPLE_PRICE_BOOK,
        availability: NOTHING_OFF,
        defaults: {},
        usage: [{ item: BLUM, designCount: NO_KITCHEN }],
      }).client,
    );
    const { rendered } = deskDeleting({
      answers: [CONFLICT],
      isDraftOnly: () => true,
      wrapClient: () => held.wrapped,
    });
    await request(rendered, CREATED_ONLY_IN_DRAFT);
    held.hold();
    await confirm(rendered);

    act(() => {
      rendered.result.current.requestSwitch(BLUM);
    });
    await flushPromises(MANY_TICKS);
    held.release();
    await flushPromises(MANY_TICKS);

    expect(rendered.result.current.flow).not.toMatchObject({
      kind: "delete",
      isDraftOnly: true,
    });
    rendered.unmount();
  });
});

describe("a deletion the server refuses for use after a count of none", () => {
  const inUseAfterEveryCount: readonly {
    readonly named: string;
    readonly recount: (item: DeletableItemRef) => UsageRead;
    readonly said: number | undefined;
  }[] = [
    {
      named: "one kitchen",
      recount: (item) => ({
        kind: "counted",
        counts: [{ item, designCount: ONE_KITCHEN }],
      }),
      said: ONE_KITCHEN,
    },
    {
      named: "fourteen kitchens",
      recount: (item) => ({
        kind: "counted",
        counts: [{ item, designCount: 14 }],
      }),
      said: 14,
    },
    {
      named: "none (the server's word stands over the count)",
      recount: (item) => ({
        kind: "counted",
        counts: [{ item, designCount: NO_KITCHEN }],
      }),
      said: undefined,
    },
    {
      named: "no count that can be had",
      recount: () => ({ kind: "unavailable" }),
      said: undefined,
    },
    {
      named: "a count that names only another item",
      recount: () => ({
        kind: "counted",
        counts: [{ item: BLUM, designCount: 5 }],
      }),
      said: undefined,
    },
  ];

  it.each(inUseAfterEveryCount)(
    "says $said as the number when the new count gives $named, and never opens a confirmation",
    async ({ recount, said }) => {
      const { lifecycle, write, rendered } = deskDeleting({
        answers: [REFUSED_FOR_USE],
      });
      await openCounted(rendered);
      lifecycle.answerNextUsageWith(recount(HETTICH));

      await confirm(rendered);

      expect(rendered.result.current.flow).toMatchObject({
        kind: "delete-blocked",
        item: HETTICH,
        count: said,
      });
      expect(usageReads(lifecycle.calls)).toBe(2);
      await confirm(rendered);
      expect(write).toHaveBeenCalledTimes(1);
      expect(rendered.result.current.flow.kind).not.toBe("delete");
      await flushPromises(MANY_TICKS);
      expect(usageReads(lifecycle.calls)).toBeLessThanOrEqual(3);
      rendered.unmount();
    },
  );

  it("never says a number of zero: a block with a count of none names no number", async () => {
    const { lifecycle, rendered } = deskDeleting({
      answers: [REFUSED_FOR_USE],
    });
    await openCounted(rendered);

    await confirm(rendered);

    expect(lifecycle.calls.length).toBeGreaterThan(0);
    const { flow } = rendered.result.current;
    expect(flow).toMatchObject({ kind: "delete-blocked" });
    expect(flow).toHaveProperty("count", undefined);
    rendered.unmount();
  });

  it("closes the confirmation while the new count is out, so no Delete is pressable on the old count", async () => {
    const { lifecycle, write, rendered } = deskDeleting({
      answers: [REFUSED_FOR_USE],
    });
    await openCounted(rendered);
    const releaseCount = lifecycle.holdNextUsage();

    await confirm(rendered);

    expect(rendered.result.current.flow.kind).toBe("closed");
    expect(rendered.result.current.isReading).toBe(true);
    await confirm(rendered);
    expect(write).toHaveBeenCalledTimes(1);
    releaseCount();
    await flushPromises(MANY_TICKS);
    expect(rendered.result.current.flow.kind).toBe("delete-blocked");
    rendered.unmount();
  });
});

describe("a deletion answered with what leaves the count alone", () => {
  it("says the default is refused, counts nothing again, and leaves the dialog for the person to close", async () => {
    const { lifecycle, rendered } = deskDeleting({
      answers: [{ kind: "refused", code: "ITEM_IS_DEFAULT" }],
    });
    await openCounted(rendered);

    await confirm(rendered);

    expect(rendered.result.current.failure).toEqual({
      kind: "refused",
      code: "item-is-default",
    });
    expect(usageReads(lifecycle.calls)).toBe(1);
    expect(lifecycle.calls.map(({ kind }) => kind)).not.toContain(
      "readAvailability",
    );
    expect(rendered.result.current.flow.kind).toBe("delete");
    rendered.unmount();
  });

  it("says it failed and counts nothing again when the write fails, and frees the next press", async () => {
    const { lifecycle, write, rendered } = deskDeleting({
      answers: [{ kind: "failed" }],
    });
    await openCounted(rendered);

    await confirm(rendered);

    expect(rendered.result.current.failure).toEqual({ kind: "failed" });
    expect(usageReads(lifecycle.calls)).toBe(1);
    expect(rendered.result.current.isBusy).toBe(false);
    await confirm(rendered);
    expect(write).toHaveBeenCalledTimes(2);
    expect(rendered.result.current.flow.kind).toBe("closed");
    rendered.unmount();
  });

  it("says it failed when the write throws, the screen never being left waiting", async () => {
    const { rendered } = deskDeleting({
      deleteFromDraft: () => Promise.reject(new Error("503")),
    });
    await openCounted(rendered);

    await confirm(rendered);

    expect(rendered.result.current.failure).toEqual({ kind: "failed" });
    expect(rendered.result.current.isBusy).toBe(false);
    expect(rendered.result.current.flow.kind).toBe("delete");
    rendered.unmount();
  });

  it.each(
    DRAFT_CHANGE_REFUSAL_CODES.filter(
      (code) => code !== "ITEM_IN_USE" && code !== "ITEM_IS_DEFAULT",
    ),
  )(
    "says only that it failed for the refusal %s, which no recount changes",
    async (code) => {
      const { lifecycle, rendered } = deskDeleting({
        answers: [{ kind: "refused", code } as FieldWriteResult],
      });
      await openCounted(rendered);

      await confirm(rendered);

      expect(rendered.result.current.failure).toEqual({ kind: "failed" });
      expect(usageReads(lifecycle.calls)).toBe(1);
      rendered.unmount();
    },
  );

  it("changes nothing for a draft that is busy with another write: no failure, no recount, the dialog stays", async () => {
    const { lifecycle, rendered } = deskDeleting({
      answers: [{ kind: "busy" }],
    });
    await openCounted(rendered);

    await confirm(rendered);

    expect(rendered.result.current.failure).toBeUndefined();
    expect(usageReads(lifecycle.calls)).toBe(1);
    expect(rendered.result.current.flow).toMatchObject({
      kind: "delete",
      usage: { kind: "counted" },
    });
    expect(rendered.result.current.isBusy).toBe(false);
    rendered.unmount();
  });

  it.each([SAVED, { kind: "unchanged" } as const])(
    "closes the dialog for $kind and counts nothing again",
    async (answer) => {
      const { lifecycle, rendered } = deskDeleting({ answers: [answer] });
      await openCounted(rendered);

      await confirm(rendered);

      expect(rendered.result.current.flow.kind).toBe("closed");
      expect(usageReads(lifecycle.calls)).toBe(1);
      rendered.unmount();
    },
  );
});

describe("a confirmation pressed twice at once", () => {
  it("sends one write and shows the desk busy until it answers", async () => {
    let answerTheWrite: (result: FieldWriteResult) => void = () => undefined;
    const { write, rendered } = deskDeleting({
      deleteFromDraft: () =>
        new Promise<FieldWriteResult>((resolve) => {
          answerTheWrite = resolve;
        }),
    });
    await openCounted(rendered);

    act(() => {
      rendered.result.current.confirm();
      rendered.result.current.confirm();
    });
    await flushPromises(4);

    expect(write).toHaveBeenCalledTimes(1);
    expect(rendered.result.current.isBusy).toBe(true);
    act(() => {
      rendered.result.current.confirm();
    });
    await flushPromises(4);
    expect(write).toHaveBeenCalledTimes(1);
    await act(async () => {
      answerTheWrite(SAVED);
      await flushPromises(MANY_TICKS);
    });
    expect(rendered.result.current.isBusy).toBe(false);
    expect(rendered.result.current.flow.kind).toBe("closed");
    expect(write).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });

  it("stays busy through the whole recount of a conflict, and sends one write for two presses", async () => {
    const { lifecycle, write, rendered } = deskDeleting({
      answers: [CONFLICT],
    });
    await openCounted(rendered);
    const releaseCount = lifecycle.holdNextUsage();

    act(() => {
      rendered.result.current.confirm();
      rendered.result.current.confirm();
    });
    await flushPromises(MANY_TICKS);

    expect(write).toHaveBeenCalledTimes(1);
    expect(rendered.result.current.isBusy).toBe(true);
    releaseCount();
    await flushPromises(MANY_TICKS);
    expect(rendered.result.current.isBusy).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });
});
