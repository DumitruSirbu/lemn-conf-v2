// @vitest-environment happy-dom
// The account's kitchens read a page at a time (Lot 2 criterion 5 and frames A9A to A9C, A9I, A9J). A page can come
// back with nothing to show while it still names a next one; such a page is never drawn, the next is asked for at
// once, up to ten in a row; a kitchen already shown is added once; the person's focus follows the page they asked for.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";
import type { SignedInRequest } from "@/account/send-account-request";

import {
  renderHook,
  flushPromises,
  type RenderedHook,
} from "../support/render-hook";
import {
  designIdOf,
  listedKitchen,
  wireKitchen,
  wirePage,
} from "../support/account-kitchens-wire";
import { firstArgumentsOf } from "../support/mock-calls";

const sendSignedInRequest = vi.hoisted(() => vi.fn());
const leaveFor = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));
vi.mock("@/account/on-signed-in", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/on-signed-in")>()),
  leaveFor,
}));

const { useKitchens } = await import("@/account/kitchens/use-kitchens");

type Kitchens = ReturnType<typeof useKitchens>;

const received = (body: unknown): SignedInOutcome => ({
  kind: "received",
  body,
});
const pageOf = (
  serials: readonly number[],
  nextCursor: string | null = null,
  total = serials.length,
) =>
  received(
    wirePage(
      serials.map((serial) => wireKitchen(serial)),
      { nextCursor, total },
    ),
  );

function requestedCursors(): (string | undefined)[] {
  return firstArgumentsOf<SignedInRequest>(sendSignedInRequest).map(
    (request) => (request.flow === "kitchens" ? request.cursor : undefined),
  );
}

let rendered: RenderedHook<Kitchens> | undefined;

async function mountWith(
  ...answers: readonly SignedInOutcome[]
): Promise<RenderedHook<Kitchens>> {
  for (const answer of answers)
    sendSignedInRequest.mockResolvedValueOnce(answer);
  rendered = renderHook(() => useKitchens("ro"));
  await flushPromises();
  return rendered;
}

function listedState(hook: RenderedHook<Kitchens>) {
  const { state } = hook.result.current;
  if (state.phase !== "listed") throw new Error(`state was ${state.phase}`);
  return state;
}

async function loadMore(hook: RenderedHook<Kitchens>): Promise<void> {
  act(() => {
    hook.result.current.loadMore();
  });
  await flushPromises();
}

beforeEach(() => {
  sendSignedInRequest.mockReset();
  leaveFor.mockReset();
});

afterEach(() => {
  rendered?.unmount();
  rendered = undefined;
});

describe("the first page", () => {
  it("is loading until the page arrives, then listed with the account's total and the cursor", async () => {
    sendSignedInRequest.mockResolvedValueOnce(pageOf([1, 2], "c1", 7));
    rendered = renderHook(() => useKitchens("ro"));
    expect(rendered.result.current.state).toEqual({ phase: "loading" });
    await flushPromises();
    const state = listedState(rendered);
    expect(state.listing.kitchens.map((kitchen) => kitchen.id)).toEqual([
      designIdOf(1),
      designIdOf(2),
    ]);
    expect(state.listing.total).toBe(7);
    expect(state.listing.nextCursor).toBe("c1");
    expect(state.listing.focusRequest).toBeUndefined();
    expect(state.more).toEqual({ kind: "idle" });
    expect(requestedCursors()).toEqual([undefined]);
  });

  it("asks once, even though the effect may run twice in a strict tree", async () => {
    const hook = await mountWith(pageOf([1]));
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
    expect(listedState(hook).listing.kitchens).toHaveLength(1);
  });

  it("is an empty list for an account with no kitchens: nothing to load more of", async () => {
    const hook = await mountWith(pageOf([], null, 0));
    const state = listedState(hook);
    expect(state.listing.kitchens).toEqual([]);
    expect(state.listing.nextCursor).toBeUndefined();
  });
});

describe("the time a page was read, which 'modified 2 days ago' is told against", () => {
  it("is the moment the first page arrived, and moves to the moment each later page arrived", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const hook = await mountWith(pageOf([1], "c1", 2), pageOf([2], null, 2));
      expect(listedState(hook).listing.readAtMs).toBe(1_000_000);
      vi.setSystemTime(2_000_000);
      await loadMore(hook);
      expect(listedState(hook).listing.readAtMs).toBe(2_000_000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a page that adds nothing but names a next one is never drawn", () => {
  it("continues at once with the cursor it named, and lists what the next page holds", async () => {
    const hook = await mountWith(pageOf([], "c1", 3), pageOf([4, 5], null, 3));
    expect(requestedCursors()).toEqual([undefined, "c1"]);
    const state = listedState(hook);
    expect(state.listing.kitchens.map((kitchen) => kitchen.id)).toEqual([
      designIdOf(4),
      designIdOf(5),
    ]);
    expect(state.listing.nextCursor).toBeUndefined();
    expect(state.more).toEqual({ kind: "idle" });
  });

  it("follows a chain of nine empty pages to the tenth, which has a kitchen", async () => {
    const emptyPages = Array.from({ length: 9 }, (_, index) =>
      pageOf([], `c${String(index + 1)}`),
    );
    const hook = await mountWith(...emptyPages, pageOf([8], null));
    expect(sendSignedInRequest).toHaveBeenCalledTimes(10);
    expect(
      listedState(hook).listing.kitchens.map((kitchen) => kitchen.id),
    ).toEqual([designIdOf(8)]);
    expect(listedState(hook).more).toEqual({ kind: "idle" });
  });

  it("gives up after exactly ten empty pages in a row: ten requests, not eleven, and the button asks again", async () => {
    const emptyPages = Array.from({ length: 12 }, (_, index) =>
      pageOf([], `c${String(index + 1)}`, 4),
    );
    const hook = await mountWith(...emptyPages);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(10);
    expect(requestedCursors()).toEqual([
      undefined,
      ...Array.from({ length: 9 }, (_, index) => `c${String(index + 1)}`),
    ]);
    const state = listedState(hook);
    expect(state.listing.kitchens).toEqual([]);
    expect(state.listing.total).toBe(4);
    expect(state.listing.nextCursor).toBe("c10");
    expect(state.more).toEqual({ kind: "failed", failure: { kind: "failed" } });
  });

  it("goes on from the cursor it stopped at when the person asks again", async () => {
    const emptyPages = Array.from({ length: 10 }, (_, index) =>
      pageOf([], `c${String(index + 1)}`, 2),
    );
    const hook = await mountWith(...emptyPages);
    sendSignedInRequest.mockResolvedValueOnce(pageOf([1, 2], null, 2));
    await loadMore(hook);
    expect(requestedCursors().at(-1)).toBe("c10");
    expect(listedState(hook).listing.kitchens).toHaveLength(2);
    expect(listedState(hook).more).toEqual({ kind: "idle" });
  });

  it("does not chain past an empty last page: no cursor ends the list", async () => {
    const hook = await mountWith(pageOf([1], "c1", 2), pageOf([], null, 2));
    await loadMore(hook);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(2);
    expect(listedState(hook).listing.nextCursor).toBeUndefined();
    expect(listedState(hook).listing.kitchens).toHaveLength(1);
  });

  it("counts a page that repeats only shown kitchens as empty and asks for the next", async () => {
    const hook = await mountWith(
      pageOf([1, 2], "c1", 3),
      pageOf([2], "c2", 3),
      pageOf([3], null, 3),
    );
    await loadMore(hook);
    expect(requestedCursors()).toEqual([undefined, "c1", "c2"]);
    expect(
      listedState(hook).listing.kitchens.map((kitchen) => kitchen.id),
    ).toEqual([designIdOf(1), designIdOf(2), designIdOf(3)]);
  });
});

describe("appending a page", () => {
  it("adds a kitchen that two pages both hold only once, in the order first seen", async () => {
    const hook = await mountWith(
      pageOf([1, 2], "c1", 4),
      pageOf([2, 3, 4], null, 4),
    );
    await loadMore(hook);
    expect(
      listedState(hook).listing.kitchens.map((kitchen) => kitchen.id),
    ).toEqual([1, 2, 3, 4].map(designIdOf));
  });

  it("keeps the total of the first page, whatever later pages add", async () => {
    const hook = await mountWith(pageOf([1, 2], "c1", 9), pageOf([3], "c2", 4));
    await loadMore(hook);
    expect(listedState(hook).listing.total).toBe(9);
    expect(listedState(hook).listing.nextCursor).toBe("c2");
  });

  it("asks the cursor of the shown listing, and a press while a page is out does nothing", async () => {
    const hook = await mountWith(pageOf([1], "c1", 2));
    let resolvePage: (outcome: SignedInOutcome) => void = () => undefined;
    sendSignedInRequest.mockReturnValueOnce(
      new Promise<SignedInOutcome>((resolve) => {
        resolvePage = resolve;
      }),
    );
    act(() => {
      hook.result.current.loadMore();
    });
    act(() => {
      hook.result.current.loadMore();
    });
    expect(listedState(hook).more).toEqual({ kind: "loading" });
    expect(sendSignedInRequest).toHaveBeenCalledTimes(2);
    resolvePage(pageOf([2], null, 2));
    await flushPromises();
    expect(listedState(hook).listing.kitchens).toHaveLength(2);
    expect(listedState(hook).more).toEqual({ kind: "idle" });
  });

  it("does nothing on the last page, before the first page, and after a failure of the first", async () => {
    const hook = await mountWith(pageOf([1], null, 1));
    await loadMore(hook);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);

    sendSignedInRequest.mockReset();
    sendSignedInRequest.mockResolvedValueOnce({ kind: "unavailable" });
    const failed = renderHook(() => useKitchens("ro"));
    await flushPromises();
    sendSignedInRequest.mockClear();
    act(() => {
      failed.result.current.loadMore();
    });
    expect(sendSignedInRequest).not.toHaveBeenCalled();
    failed.unmount();
  });

  it("leaves the pages shown where they are when the next page cannot be had, and says why on the button", async () => {
    const hook = await mountWith(pageOf([1], "c1", 2), { kind: "unanswered" });
    await loadMore(hook);
    const state = listedState(hook);
    expect(state.listing.kitchens).toHaveLength(1);
    expect(state.listing.nextCursor).toBe("c1");
    expect(state.more).toEqual({
      kind: "failed",
      failure: { kind: "offline" },
    });
  });

  it("recovers on the same cursor when the person asks again", async () => {
    const hook = await mountWith(pageOf([1], "c1", 2), { kind: "unavailable" });
    await loadMore(hook);
    sendSignedInRequest.mockResolvedValueOnce(pageOf([2], null, 2));
    await loadMore(hook);
    expect(requestedCursors()).toEqual([undefined, "c1", "c1"]);
    expect(listedState(hook).listing.kitchens).toHaveLength(2);
    expect(listedState(hook).more).toEqual({ kind: "idle" });
  });
});

describe("focus requests", () => {
  it("move to the first kitchen of the page just appended", async () => {
    const hook = await mountWith(
      pageOf([1, 2], "c1", 5),
      pageOf([3, 4, 5], null, 5),
    );
    await loadMore(hook);
    expect(listedState(hook).listing.focusRequest).toEqual({
      kitchenId: designIdOf(3),
    });
  });

  it("stay on the last kitchen shown when the page added none", async () => {
    const hook = await mountWith(
      pageOf([1, 2], "c1", 2),
      pageOf([1, 2], null, 2),
    );
    await loadMore(hook);
    expect(listedState(hook).listing.focusRequest).toEqual({
      kitchenId: designIdOf(2),
    });
  });

  it("is a new object for every page, so focus moves once per page even onto the same card", async () => {
    const hook = await mountWith(
      pageOf([1], "c1", 2),
      pageOf([2], "c2", 2),
      pageOf([2], null, 2),
    );
    await loadMore(hook);
    const afterFirstPress = listedState(hook).listing.focusRequest;
    await loadMore(hook);
    const afterSecondPress = listedState(hook).listing.focusRequest;
    expect(afterFirstPress).toEqual({ kitchenId: designIdOf(2) });
    expect(afterSecondPress).toEqual({ kitchenId: designIdOf(2) });
    expect(afterSecondPress).not.toBe(afterFirstPress);
  });

  it("is not carried over by a rename or a removal: only a page the person asked for sets one", async () => {
    const hook = await mountWith(pageOf([1, 2], "c1", 4), pageOf([3], null, 4));
    await loadMore(hook);
    const requested = listedState(hook).listing.focusRequest;
    act(() => {
      hook.result.current.change({
        kind: "rename",
        id: designIdOf(1),
        name: "n",
      });
    });
    expect(listedState(hook).listing.focusRequest).toBe(requested);
  });
});

describe("a kitchen action's effect on the pages shown", () => {
  it("removes a card and counts one fewer, prepends a copy and counts one more", async () => {
    const hook = await mountWith(pageOf([1, 2, 3], "c1", 8));
    act(() => {
      hook.result.current.change({ kind: "remove", id: designIdOf(2) });
    });
    expect(
      listedState(hook).listing.kitchens.map((kitchen) => kitchen.id),
    ).toEqual([designIdOf(1), designIdOf(3)]);
    expect(listedState(hook).listing.total).toBe(7);
    act(() => {
      hook.result.current.change({
        kind: "prepend",
        kitchen: listedKitchen(40),
      });
    });
    expect(listedState(hook).listing.kitchens[0]?.id).toBe(designIdOf(40));
    expect(listedState(hook).listing.total).toBe(8);
  });

  it("is ignored while no page is shown", () => {
    sendSignedInRequest.mockReturnValueOnce(new Promise(() => undefined));
    rendered = renderHook(() => useKitchens("ro"));
    act(() => {
      rendered?.result.current.change({
        kind: "prepend",
        kitchen: listedKitchen(1),
      });
    });
    expect(rendered.result.current.state).toEqual({ phase: "loading" });
  });
});

describe("the answers a page can come to", () => {
  it("sends a request that finds no live session to sign in, leaving the screen as it was", async () => {
    sendSignedInRequest.mockResolvedValueOnce({ kind: "unauthenticated" });
    rendered = renderHook(() => useKitchens("ru"));
    await flushPromises();
    expect(leaveFor).toHaveBeenCalledWith(
      "/ru/account/login?reason=session-expired",
    );
    expect(rendered.result.current.state).toEqual({ phase: "loading" });
  });

  it("sends the same way when a later page finds the session ended, with the shown pages kept", async () => {
    const hook = await mountWith(pageOf([1], "c1", 2), {
      kind: "unauthenticated",
    });
    await loadMore(hook);
    expect(leaveFor).toHaveBeenCalledWith(
      "/ro/account/login?reason=session-expired",
    );
    expect(listedState(hook).listing.kitchens).toHaveLength(1);
  });

  it("draws the forbidden screen for a 403, on the first page and on a later one", async () => {
    sendSignedInRequest.mockResolvedValueOnce({ kind: "forbidden" });
    rendered = renderHook(() => useKitchens("ro"));
    await flushPromises();
    expect(rendered.result.current.state).toEqual({ phase: "forbidden" });
    expect(leaveFor).not.toHaveBeenCalled();
    rendered.unmount();

    const hook = await mountWith(pageOf([1], "c1", 2), { kind: "forbidden" });
    await loadMore(hook);
    expect(hook.result.current.state).toEqual({ phase: "forbidden" });
  });

  it.each([
    [
      "a service that was not there",
      { kind: "unavailable" } as SignedInOutcome,
      { kind: "unavailable" },
    ],
    [
      "no answer at all",
      { kind: "unanswered" } as SignedInOutcome,
      { kind: "offline" },
    ],
    [
      "a refused request",
      { kind: "request-failed" } as SignedInOutcome,
      { kind: "failed" },
    ],
    [
      "a platform failure",
      { kind: "platform-failed" } as SignedInOutcome,
      { kind: "failed" },
    ],
  ])(
    "tells %s on the first page as a failure to read",
    async (_, outcome, failure) => {
      const hook = await mountWith(outcome);
      expect(hook.result.current.state).toEqual({ phase: "failed", failure });
    },
  );

  it("tells a limit with the wait told once, anchored to the instant it was answered", async () => {
    const answeredAtMs = Date.now();
    const hook = await mountWith({
      kind: "rate-limited",
      wait: { kind: "countdown", seconds: 30 },
    });
    const { state } = hook.result.current;
    expect(state.phase).toBe("failed");
    if (state.phase !== "failed" || state.failure.kind !== "rate-limited")
      throw new Error("not a limit");
    expect(state.failure.notice.kind).toBe("countdown");
    if (state.failure.notice.kind !== "countdown") return;
    expect(state.failure.notice.endsAtMs).toBeGreaterThanOrEqual(
      answeredAtMs + 30_000,
    );
    expect(state.failure.notice.endsAtMs).toBeLessThan(answeredAtMs + 31_000);
  });

  it.each([
    ["a body that is not a page", received({ nothing: true })],
    [
      "a page with one malformed kitchen",
      received(wirePage([wireKitchen(1), wireKitchen(2, { id: "bad" })])),
    ],
    ["no body", received(undefined)],
  ])("tells %s as a failed request: never half-drawn", async (_, outcome) => {
    const hook = await mountWith(outcome);
    expect(hook.result.current.state).toEqual({
      phase: "failed",
      failure: { kind: "failed" },
    });
  });

  it("asks the first page again on retry, behind a loading state", async () => {
    const hook = await mountWith({ kind: "unavailable" });
    sendSignedInRequest.mockResolvedValueOnce(pageOf([1], null, 1));
    act(() => {
      hook.result.current.retry();
    });
    expect(hook.result.current.state).toEqual({ phase: "loading" });
    await flushPromises();
    expect(listedState(hook).listing.kitchens).toHaveLength(1);
    expect(requestedCursors()).toEqual([undefined, undefined]);
  });

  it("forbid() draws the forbidden screen at any time", async () => {
    const hook = await mountWith(pageOf([1]));
    act(() => {
      hook.result.current.forbid();
    });
    expect(hook.result.current.state).toEqual({ phase: "forbidden" });
  });
});
