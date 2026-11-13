// @vitest-environment happy-dom
//
// A deletion that meets a conflict, or a book the draft would make refused, was
// judged on facts that have since moved: its dialog closes, the saved kitchens are counted again, and no Delete can be
// pressed until the new count has answered. A server that refuses a deletion for use after a count of none has the
// last word: the block is said, the item is counted again for the number, and the confirmation never opens again.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DeletableItemRef,
} from "@lemnaria/configurator-domain";

import type { FieldWriteResult } from "@/price-dashboard/use-price-draft";
import {
  useItemAvailability,
  type DraftFactsNow,
} from "@/price-dashboard/use-item-availability";

import { draftMovingOnEveryRead } from "../support/draft-facts-now";
import { flushPromises, renderHook } from "../support/render-hook";
import { recordingLifecycleClient } from "./recording-item-lifecycle-client";

const HETTICH: DeletableItemRef = {
  kind: "hardware",
  tierId: "hardware.soft-close",
};
const NOTHING_OFF = { revision: "1", disabled: [] };
const NO_KITCHEN = 0;
const KITCHENS_THAT_CAME = 3;
const SAVED = { kind: "saved" } as const;

function deskDeleting(
  answers: readonly FieldWriteResult[],
  {
    isDraftOnly = false,
    readDraftNow = draftMovingOnEveryRead({ isDraftOnly: () => isDraftOnly }),
  }: {
    readonly isDraftOnly?: boolean;
    readonly readDraftNow?: () => DraftFactsNow;
  } = {},
) {
  const lifecycle = recordingLifecycleClient({
    book: SAMPLE_PRICE_BOOK,
    availability: NOTHING_OFF,
    defaults: {},
    usage: [{ item: HETTICH, designCount: NO_KITCHEN }],
  });
  const remaining = [...answers];
  const deleteFromDraft = vi.fn(() =>
    Promise.resolve<FieldWriteResult>(remaining.shift() ?? SAVED),
  );
  const rendered = renderHook(() =>
    useItemAvailability({
      observed: NOTHING_OFF,
      book: SAMPLE_PRICE_BOOK,
      defaults: {},
      client: lifecycle.client,
      deleteFromDraft,
      isDraftOnly: () => isDraftOnly,
      readDraftNow,
    }),
  );
  return { lifecycle, deleteFromDraft, rendered };
}

const usageReads = (calls: readonly { readonly kind: string }[]): number =>
  calls.filter(({ kind }) => kind === "readUsage").length;

async function openCounted(
  rendered: ReturnType<typeof deskDeleting>["rendered"],
) {
  act(() => {
    rendered.result.current.requestDeletion(HETTICH);
  });
  await flushPromises(5);
  expect(rendered.result.current.flow).toMatchObject({
    kind: "delete",
    usage: { kind: "counted" },
  });
}

async function pressConfirm(
  rendered: ReturnType<typeof deskDeleting>["rendered"],
) {
  act(() => {
    rendered.result.current.confirm();
  });
  await flushPromises(8);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  { word: "conflict", answer: { kind: "conflict" } as const },
  { word: "candidate-refused", answer: { kind: "candidate-refused" } as const },
])("a deletion answered $word", ({ answer }) => {
  it("closes its dialog and counts again, and a Delete pressed while the new count is out sends nothing", async () => {
    const { lifecycle, deleteFromDraft, rendered } = deskDeleting([answer]);
    await openCounted(rendered);
    const releaseSecondCount = lifecycle.holdNextUsage();

    await pressConfirm(rendered);

    expect(deleteFromDraft).toHaveBeenCalledTimes(1);
    expect(rendered.result.current.flow.kind).toBe("closed");
    expect(rendered.result.current.isReading).toBe(true);
    await pressConfirm(rendered);
    expect(deleteFromDraft).toHaveBeenCalledTimes(1);
    releaseSecondCount();
    await flushPromises(8);
    expect(usageReads(lifecycle.calls)).toBe(2);
    expect(rendered.result.current.flow).toMatchObject({
      kind: "delete",
      usage: { kind: "counted", count: NO_KITCHEN },
    });
    expect(rendered.result.current.failure).toBeDefined();
    rendered.unmount();
  });

  it("judges the dialog it reopens on the new count: kitchens that came meanwhile block the deletion", async () => {
    const { lifecycle, deleteFromDraft, rendered } = deskDeleting([answer]);
    await openCounted(rendered);
    lifecycle.answerNextUsageWith({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: KITCHENS_THAT_CAME }],
    });

    await pressConfirm(rendered);

    expect(rendered.result.current.flow).toMatchObject({
      kind: "delete-blocked",
      count: KITCHENS_THAT_CAME,
    });
    expect(deleteFromDraft).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });
});

describe("a conflict on the deletion of a row only the draft holds", () => {
  it("reopens the draft-only dialog with no count, since nothing published names the row, and the next Delete sends", async () => {
    const { lifecycle, deleteFromDraft, rendered } = deskDeleting(
      [{ kind: "conflict" }, SAVED],
      { isDraftOnly: true },
    );
    act(() => {
      rendered.result.current.requestDeletion(HETTICH);
    });
    await flushPromises(5);

    await pressConfirm(rendered);

    expect(usageReads(lifecycle.calls)).toBe(0);
    expect(rendered.result.current.flow).toMatchObject({
      kind: "delete",
      isDraftOnly: true,
      usage: { kind: "counted", count: NO_KITCHEN },
    });
    expect(rendered.result.current.failure).toEqual({ kind: "conflict" });
    await pressConfirm(rendered);
    expect(deleteFromDraft).toHaveBeenCalledTimes(2);
    rendered.unmount();
  });
});

describe("a conflict on a deletion", () => {
  it("reads the availability again, as a conflict on a switch does", async () => {
    const { lifecycle, rendered } = deskDeleting([{ kind: "conflict" }]);
    await openCounted(rendered);

    await pressConfirm(rendered);

    expect(lifecycle.calls.map(({ kind }) => kind)).toContain(
      "readAvailability",
    );
    rendered.unmount();
  });

  it("lets the next Delete send once the new count says the item is free", async () => {
    const { deleteFromDraft, rendered } = deskDeleting([
      { kind: "conflict" },
      SAVED,
    ]);
    await openCounted(rendered);
    await pressConfirm(rendered);

    await pressConfirm(rendered);

    expect(deleteFromDraft).toHaveBeenCalledTimes(2);
    expect(rendered.result.current.flow.kind).toBe("closed");
    rendered.unmount();
  });
});

describe("a server that refuses a deletion for use after a count of none", () => {
  const inUse = { kind: "refused", code: "ITEM_IN_USE" } as const;

  it("says the block with no number, counts once more, and never reopens the confirmation", async () => {
    const { lifecycle, deleteFromDraft, rendered } = deskDeleting([inUse]);
    await openCounted(rendered);

    await pressConfirm(rendered);

    expect(usageReads(lifecycle.calls)).toBe(2);
    expect(rendered.result.current.flow).toMatchObject({
      kind: "delete-blocked",
      count: undefined,
    });
    await pressConfirm(rendered);
    expect(deleteFromDraft).toHaveBeenCalledTimes(1);
    expect(rendered.result.current.flow).not.toMatchObject({ kind: "delete" });
    rendered.unmount();
  });

  it("gives the number when the new count has one", async () => {
    const { lifecycle, rendered } = deskDeleting([inUse]);
    await openCounted(rendered);
    lifecycle.answerNextUsageWith({
      kind: "counted",
      counts: [{ item: HETTICH, designCount: KITCHENS_THAT_CAME }],
    });

    await pressConfirm(rendered);

    expect(rendered.result.current.flow).toMatchObject({
      kind: "delete-blocked",
      count: KITCHENS_THAT_CAME,
    });
    rendered.unmount();
  });

  it("says the block with no number when the new count cannot be had, and asks for no third count", async () => {
    const { lifecycle, deleteFromDraft, rendered } = deskDeleting([inUse]);
    await openCounted(rendered);
    lifecycle.answerNextUsageWith({ kind: "unavailable" });

    await pressConfirm(rendered);

    expect(usageReads(lifecycle.calls)).toBe(2);
    expect(rendered.result.current.flow).toMatchObject({
      kind: "delete-blocked",
      count: undefined,
    });
    expect(deleteFromDraft).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });
});

describe("a conflict on a deletion, with the draft as the host reads it this moment", () => {
  /** The draft as sent (first reading) and as the conflict left it (every later one). */
  const draftReadAs = (
    sent: DraftFactsNow,
    afterConflict: DraftFactsNow,
  ): (() => DraftFactsNow) => {
    let readings = 0;
    return () => (readings++ === 0 ? sent : afterConflict);
  };
  const draftWith = (revision: string, book = SAMPLE_PRICE_BOOK) => ({
    revision,
    book,
    isDraftOnly: () => false,
  });

  it("leaves the dialog closed and says the failure when the draft was not read again after the conflict", async () => {
    const { lifecycle, deleteFromDraft, rendered } = deskDeleting(
      [{ kind: "conflict" }],
      { readDraftNow: draftReadAs(draftWith("7"), draftWith("7")) },
    );
    await openCounted(rendered);

    await pressConfirm(rendered);

    expect(usageReads(lifecycle.calls)).toBe(1);
    expect(rendered.result.current.flow.kind).toBe("closed");
    expect(rendered.result.current.failure).toEqual({ kind: "failed" });
    expect(deleteFromDraft).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });

  it("counts again and reopens once the draft names a revision other than the one sent", async () => {
    const { lifecycle, rendered } = deskDeleting([{ kind: "conflict" }], {
      readDraftNow: draftReadAs(draftWith("7"), draftWith("8")),
    });
    await openCounted(rendered);

    await pressConfirm(rendered);

    expect(usageReads(lifecycle.calls)).toBe(2);
    expect(rendered.result.current.flow).toMatchObject({ kind: "delete" });
    rendered.unmount();
  });

  it("judges the recount by the book that draft sits on, not the one last rendered: a class the new book drops is not counted or offered", async () => {
    const bookWithoutHettich = {
      ...SAMPLE_PRICE_BOOK,
      hardware: {
        ...SAMPLE_PRICE_BOOK.hardware,
        tiers: SAMPLE_PRICE_BOOK.hardware.tiers.filter(
          (tier) => tier.tierId !== HETTICH.tierId,
        ),
      },
    };
    const { lifecycle, deleteFromDraft, rendered } = deskDeleting(
      [{ kind: "conflict" }],
      {
        readDraftNow: draftReadAs(
          draftWith("7"),
          draftWith("8", bookWithoutHettich),
        ),
      },
    );
    await openCounted(rendered);

    await pressConfirm(rendered);

    expect(usageReads(lifecycle.calls)).toBe(1);
    expect(rendered.result.current.flow).not.toMatchObject({
      kind: "delete",
      usage: { kind: "counted" },
    });
    expect(deleteFromDraft).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });
});
