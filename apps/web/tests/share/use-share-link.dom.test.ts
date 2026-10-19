// @vitest-environment happy-dom
// The state machine of one design's share link, shared by the editor's settings sheet and the account's kitchen list
// (Lot 2 U7/U8). The link is shown once and lives only in this state. A failed operation is retried as itself: a status
// check retried as a create would mint a fresh link and kill the one found active; a failed revoke retried as a create
// would leave the link it meant to kill standing beside a second one.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  flushPromises,
  renderHook,
  type RenderedHook,
} from "../support/render-hook";
import { firstArgumentsOf } from "../support/mock-calls";

const issueShareLink = vi.hoisted(() => vi.fn());
const revokeShareLink = vi.hoisted(() => vi.fn());
const shareLinkStatus = vi.hoisted(() => vi.fn());

vi.mock("@/persistence/share-link-client", () => ({
  issueShareLink,
  revokeShareLink,
  shareLinkStatus,
}));

const { useShareLink } = await import("@/share/use-share-link");

const DESIGN_ID = "k00000000000000000001";
const OTHER_DESIGN_ID = "k00000000000000000002";
const COPY_FEEDBACK_MS = 2_000;

type ShareLink = ReturnType<typeof useShareLink>;

let rendered: RenderedHook<ShareLink> | undefined;
let writeText: ReturnType<typeof vi.fn>;

function mount(designId = DESIGN_ID): RenderedHook<ShareLink> {
  rendered = renderHook(() => useShareLink(designId));
  return rendered;
}

async function mountSettled(): Promise<RenderedHook<ShareLink>> {
  const hook = mount();
  await flushPromises();
  return hook;
}

async function press(action: () => void): Promise<void> {
  act(() => {
    action();
  });
  await flushPromises();
}

beforeEach(() => {
  issueShareLink.mockReset();
  revokeShareLink.mockReset();
  shareLinkStatus.mockReset();
  shareLinkStatus.mockResolvedValue(false);
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("location", { origin: "https://lemnaria.example" });
  vi.stubGlobal("navigator", { clipboard: { writeText } });
});

afterEach(() => {
  rendered?.unmount();
  rendered = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reading the status when the surface opens", () => {
  it("is checking until the answer, then none or active", async () => {
    shareLinkStatus.mockResolvedValueOnce(true);
    const hook = mount();
    expect(hook.result.current.state).toEqual({ kind: "checking" });
    await flushPromises();
    expect(hook.result.current.state).toMatchObject({ kind: "active" });
    expect(shareLinkStatus).toHaveBeenCalledExactlyOnceWith(DESIGN_ID);
  });

  it("is none, not revoked, for a design with no link", async () => {
    const hook = await mountSettled();
    expect(hook.result.current.state).toEqual({
      kind: "none",
      justRevoked: false,
    });
  });

  it("is an error naming the status check when it fails", async () => {
    shareLinkStatus.mockRejectedValueOnce(new Error("offline"));
    const hook = await mountSettled();
    expect(hook.result.current.state).toEqual({
      kind: "error",
      failedOperation: "status",
    });
  });

  it("reads it once on open and never polls", async () => {
    vi.useFakeTimers();
    mount();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(shareLinkStatus).toHaveBeenCalledTimes(1);
  });

  it("drops the answer of a surface that has gone", async () => {
    let answer: (active: boolean) => void = () => undefined;
    shareLinkStatus.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        answer = resolve;
      }),
    );
    const hook = mount();
    hook.unmount();
    rendered = undefined;
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    answer(true);
    await flushPromises();
    expect(errors).not.toHaveBeenCalled();
  });

  it("asks again for a different design and ignores a late answer about the first", async () => {
    let answerFirst: (active: boolean) => void = () => undefined;
    shareLinkStatus.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        answerFirst = resolve;
      }),
    );
    shareLinkStatus.mockResolvedValueOnce(false);
    let designId = DESIGN_ID;
    const hook = renderHook(() => useShareLink(designId));
    rendered = hook;
    designId = OTHER_DESIGN_ID;
    hook.rerender();
    await flushPromises();
    expect(hook.result.current.state).toMatchObject({ kind: "none" });
    answerFirst(true);
    await flushPromises();
    expect(firstArgumentsOf<string>(shareLinkStatus)).toEqual([
      DESIGN_ID,
      OTHER_DESIGN_ID,
    ]);
    expect(hook.result.current.state).toEqual({
      kind: "none",
      justRevoked: false,
    });
  });
});

describe("creating the link", () => {
  it("shows the path once, not yet copied", async () => {
    issueShareLink.mockResolvedValueOnce("/s/AbCdEfGhIjKl");
    const hook = await mountSettled();
    act(() => {
      hook.result.current.create();
    });
    expect(hook.result.current.state).toEqual({ kind: "checking" });
    await flushPromises();
    expect(hook.result.current.state).toEqual({
      kind: "just-issued",
      path: "/s/AbCdEfGhIjKl",
      copied: false,
    });
    expect(issueShareLink).toHaveBeenCalledExactlyOnceWith(DESIGN_ID);
  });

  it("is an error naming the create when it fails, and a retry creates", async () => {
    issueShareLink.mockRejectedValueOnce(new Error("x"));
    const hook = await mountSettled();
    await press(() => {
      hook.result.current.create();
    });
    expect(hook.result.current.state).toEqual({
      kind: "error",
      failedOperation: "create",
    });
    issueShareLink.mockResolvedValueOnce("/s/Zz");
    await press(() => {
      hook.result.current.retryFailedOperation();
    });
    expect(issueShareLink).toHaveBeenCalledTimes(2);
    expect(revokeShareLink).not.toHaveBeenCalled();
    expect(shareLinkStatus).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state).toMatchObject({
      kind: "just-issued",
      path: "/s/Zz",
    });
  });
});

describe("stopping the link", () => {
  it("is none and marked as just revoked", async () => {
    shareLinkStatus.mockResolvedValueOnce(true);
    revokeShareLink.mockResolvedValueOnce(undefined);
    const hook = await mountSettled();
    await press(() => {
      hook.result.current.revoke();
    });
    expect(revokeShareLink).toHaveBeenCalledExactlyOnceWith(DESIGN_ID);
    expect(hook.result.current.state).toEqual({
      kind: "none",
      justRevoked: true,
    });
  });

  it("when it fails, retries the revoke and never mints a second link beside the one still standing", async () => {
    shareLinkStatus.mockResolvedValueOnce(true);
    revokeShareLink.mockRejectedValueOnce(new Error("x"));
    const hook = await mountSettled();
    await press(() => {
      hook.result.current.revoke();
    });
    expect(hook.result.current.state).toEqual({
      kind: "error",
      failedOperation: "revoke",
    });
    revokeShareLink.mockResolvedValueOnce(undefined);
    await press(() => {
      hook.result.current.retryFailedOperation();
    });
    expect(revokeShareLink).toHaveBeenCalledTimes(2);
    expect(issueShareLink).not.toHaveBeenCalled();
    expect(hook.result.current.state).toEqual({
      kind: "none",
      justRevoked: true,
    });
  });
});

describe("retrying", () => {
  it("repeats a failed status check as a status check: a create would kill the link found active", async () => {
    shareLinkStatus.mockRejectedValueOnce(new Error("x"));
    const hook = await mountSettled();
    shareLinkStatus.mockResolvedValueOnce(true);
    await press(() => {
      hook.result.current.retryFailedOperation();
    });
    expect(shareLinkStatus).toHaveBeenCalledTimes(2);
    expect(issueShareLink).not.toHaveBeenCalled();
    expect(revokeShareLink).not.toHaveBeenCalled();
    expect(hook.result.current.state).toMatchObject({ kind: "active" });
  });

  it("does nothing when nothing failed", async () => {
    const hook = await mountSettled();
    await press(() => {
      hook.result.current.retryFailedOperation();
    });
    expect(issueShareLink).not.toHaveBeenCalled();
    expect(revokeShareLink).not.toHaveBeenCalled();
    expect(shareLinkStatus).toHaveBeenCalledTimes(1);
    expect(hook.result.current.state).toEqual({
      kind: "none",
      justRevoked: false,
    });
  });
});

describe("copying the link", () => {
  async function justIssued(): Promise<RenderedHook<ShareLink>> {
    issueShareLink.mockResolvedValueOnce("/s/AbCdEfGhIjKl");
    const hook = await mountSettled();
    await press(() => {
      hook.result.current.create();
    });
    return hook;
  }

  it("writes the absolute address and says copied only after the write resolved", async () => {
    const hook = await justIssued();
    let resolveWrite: () => void = () => undefined;
    writeText.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveWrite = resolve;
      }),
    );
    act(() => {
      hook.result.current.copy("/s/AbCdEfGhIjKl");
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      "https://lemnaria.example/s/AbCdEfGhIjKl",
    );
    expect(hook.result.current.state).toMatchObject({
      kind: "just-issued",
      copied: false,
    });
    resolveWrite();
    await flushPromises();
    expect(hook.result.current.state).toMatchObject({
      kind: "just-issued",
      copied: true,
    });
  });

  it("does not say copied when the browser withheld clipboard access, and leaves no rejection unhandled", async () => {
    const hook = await justIssued();
    writeText.mockRejectedValueOnce(new Error("denied"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    await press(() => {
      hook.result.current.copy("/s/AbCdEfGhIjKl");
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(hook.result.current.state).toMatchObject({
      kind: "just-issued",
      copied: false,
    });
  });

  it("does nothing, and throws nothing, where there is no clipboard", async () => {
    const hook = await justIssued();
    vi.stubGlobal("navigator", {});
    expect(() => {
      act(() => {
        hook.result.current.copy("/s/AbCdEfGhIjKl");
      });
    }).not.toThrow();
    expect(hook.result.current.state).toMatchObject({ copied: false });
  });

  it("reverts to the Copy button after two seconds, not before", async () => {
    const hook = await justIssued();
    vi.useFakeTimers();
    await press(() => {
      hook.result.current.copy("/s/AbCdEfGhIjKl");
    });
    expect(hook.result.current.state).toMatchObject({ copied: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COPY_FEEDBACK_MS - 1);
    });
    expect(hook.result.current.state).toMatchObject({ copied: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(hook.result.current.state).toMatchObject({ copied: false });
  });

  it("restarts the two seconds on a second copy", async () => {
    const hook = await justIssued();
    vi.useFakeTimers();
    await press(() => {
      hook.result.current.copy("/s/AbCdEfGhIjKl");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    await press(() => {
      hook.result.current.copy("/s/AbCdEfGhIjKl");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(hook.result.current.state).toMatchObject({ copied: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(hook.result.current.state).toMatchObject({ copied: false });
  });

  it("leaves no timer running when the surface closes", async () => {
    const hook = await justIssued();
    vi.useFakeTimers();
    await press(() => {
      hook.result.current.copy("/s/AbCdEfGhIjKl");
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    hook.unmount();
    rendered = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not mark a state that has moved on: a copy that resolves after the link was stopped changes nothing", async () => {
    const hook = await justIssued();
    let resolveWrite: () => void = () => undefined;
    writeText.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveWrite = resolve;
      }),
    );
    act(() => {
      hook.result.current.copy("/s/AbCdEfGhIjKl");
    });
    revokeShareLink.mockResolvedValueOnce(undefined);
    await press(() => {
      hook.result.current.revoke();
    });
    resolveWrite();
    await flushPromises();
    expect(hook.result.current.state).toEqual({
      kind: "none",
      justRevoked: true,
    });
  });
});
