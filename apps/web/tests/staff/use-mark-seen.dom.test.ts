// @vitest-environment happy-dom
//
// Opening a kitchen that reads as changed marks it seen, once, with the revision the page displayed. A kitchen that does not
// read as changed is not marked; a read behind the page, or an effect that runs twice, never sends it again; and the one
// send that was made is never aborted. The server is a stand-in for `fetch`.
import { act, StrictMode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
  resolveStaffSessionExpired,
} from "@/staff/staff-session-expiry";
import {
  useMarkSeen,
  type SeenMark,
  type SeenMarkSeed,
} from "@/staff/use-mark-seen";

import { renderHook, type RenderedHook } from "../support/render-hook";
import { STAFF_KITCHEN_ID } from "../support/staff-kitchen-wire";
import {
  FORBIDDEN_ANSWER,
  RATE_LIMITED_ANSWER,
  UNAUTHENTICATED_ANSWER,
  UNAVAILABLE_ANSWER,
  installStaffKitchensServer,
  type ServerAnswer,
  type StaffKitchensServer,
} from "../support/staff-kitchens-wire";

const SEEN_ADDRESS = `/api/staff/kitchens/${STAFF_KITCHEN_ID}/seen`;

let server: StaffKitchensServer;
let hook: RenderedHook<SeenMark> | undefined;
let seed: SeenMarkSeed;

beforeEach(() => {
  vi.useFakeTimers();
  resetStaffSessionExpiryForTests();
  seed = {
    designId: STAFF_KITCHEN_ID,
    displayedRevision: "7",
    isChangedAfterSeen: true,
  };
  server = installStaffKitchensServer();
  answerWith({ body: { changedAfterSeen: false } });
});

afterEach(() => {
  hook?.unmount();
  hook = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function answerWith(answer: ServerAnswer | "hold"): void {
  server.script(() => answer);
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

async function mount(wrap?: Parameters<typeof renderHook>[1]): Promise<void> {
  hook = renderHook(() => useMarkSeen(seed), wrap);
  await settle();
}

function current(): SeenMark {
  if (hook === undefined) throw new Error("nothing is mounted");
  return hook.result.current;
}

describe("the mark made on opening a changed kitchen", () => {
  it("sends the displayed revision once, as a POST to the kitchen's seen address, and reports it marked", async () => {
    await mount();

    expect(server.requests).toHaveLength(1);
    const [request] = server.requests;
    expect(request?.url.pathname).toBe(SEEN_ADDRESS);
    expect(request?.init.method).toBe("POST");
    expect(JSON.parse(request?.init.body as string)).toEqual({
      displayedRevision: "7",
    });
    expect(current()).toEqual({ kind: "marked" });
  });

  it("sends nothing for a kitchen that does not read as changed", async () => {
    seed = { ...seed, isChangedAfterSeen: false };

    await mount();

    expect(server.requests).toHaveLength(0);
    expect(current()).toEqual({ kind: "idle" });
  });

  it("sends once when the effect runs twice, as it does under StrictMode", async () => {
    await mount((children) => createElement(StrictMode, null, children));

    expect(server.requests).toHaveLength(1);
    expect(current()).toEqual({ kind: "marked" });
  });

  it("does not send again when the page reads the kitchen again and it still reads as changed", async () => {
    await mount();

    seed = { ...seed, displayedRevision: "8" };
    act(() => {
      hook?.rerender();
    });
    await settle();

    expect(server.requests).toHaveLength(1);
  });

  it("does not abort the one send when the page goes away before the answer", async () => {
    answerWith("hold");
    await mount();

    hook?.unmount();
    hook = undefined;

    expect(server.held).toHaveLength(1);
    expect(server.held[0]?.signal.aborted).toBe(false);
  });

  it("reports that the client saved again when the kitchen still reads as changed after the mark", async () => {
    answerWith({ body: { changedAfterSeen: true } });

    await mount();

    expect(current()).toEqual({ kind: "changed-again" });
  });

  it.each([
    ["the service is down", UNAVAILABLE_ANSWER],
    ["the account may not read kitchens", FORBIDDEN_ANSWER],
    ["a limit is reached", RATE_LIMITED_ANSWER(30)],
    [
      "the kitchen is gone",
      { status: 404, body: { error: "Design not found" } },
    ],
    ["the answer is not the mark", { body: { changedAfterSeen: "no" } }],
    [
      "the server answers a conflict",
      { status: 409, body: { status: "displayed-revision-ahead" } },
    ],
  ] as const)(
    "reports it failed, and does not ask again, when %s",
    async (_name, answer) => {
      answerWith(answer);

      await mount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      expect(current()).toEqual({ kind: "failed" });
      expect(server.requests).toHaveLength(1);
    },
  );

  it("asks for the session sheet on a 401, stays idle, and sends the same mark again once the person has signed in", async () => {
    answerWith(UNAUTHENTICATED_ANSWER);
    await mount();
    expect(getStaffSessionExpiry()).toBeDefined();
    expect(current()).toEqual({ kind: "idle" });

    answerWith({ body: { changedAfterSeen: false } });
    act(() => {
      resolveStaffSessionExpired();
    });
    await settle();

    expect(server.requests).toHaveLength(2);
    expect(current()).toEqual({ kind: "marked" });
  });
});
