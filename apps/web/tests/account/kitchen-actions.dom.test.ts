// @vitest-environment happy-dom
// The acts a card makes, below the screen: `useKitchenActions` and `useRemoveKitchen` guard against a second request
// themselves, so a surface that forgets its own busy mark (a menu row, a dialog button) cannot send two. And
// `KitchenMenu`, which marks "copy" busy while one is out, is held to doing so on its own.
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SignedInOutcome } from "@/account/account-answer";
import type { SignedInRequest } from "@/account/send-account-request";
import type { RemoveResult } from "@/account/kitchens/use-kitchen-actions";

import roMessages from "../../src/messages/ro.json";
import { listedKitchen } from "../support/account-kitchens-wire";
import { flushPromises, renderHook } from "../support/render-hook";
import {
  byWords,
  click,
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";

const sendSignedInRequest = vi.hoisted(() => vi.fn());

vi.mock("@/account/send-account-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/account/send-account-request")>()),
  sendSignedInRequest,
}));

const { useKitchenActions } = await import(
  "@/account/kitchens/use-kitchen-actions"
);
const { useRemoveKitchen } = await import(
  "@/account/kitchens/use-remove-kitchen"
);
const { KitchenMenu } = await import("@/account/kitchens/kitchen-menu");

const copy = roMessages.accountKitchens;

beforeEach(() => {
  sendSignedInRequest.mockReset();
});

afterEach(() => {
  document.body.replaceChildren();
});

function inProviders<Result>(useHook: () => Result) {
  const holder: { current: Result | undefined } = { current: undefined };
  const screen = mountInCatalogue(
    createElement(function Probe() {
      holder.current = useHook();
      return null;
    }),
  );
  return {
    screen,
    get current(): Result {
      if (holder.current === undefined) throw new Error("not rendered");
      return holder.current;
    },
  };
}

describe("duplicate", () => {
  it("sends one request for two presses made before the first is answered", async () => {
    let answer: (outcome: SignedInOutcome) => void = () => undefined;
    sendSignedInRequest.mockReturnValue(
      new Promise<SignedInOutcome>((resolve) => {
        answer = resolve;
      }),
    );
    const changeListing = vi.fn();
    const probe = inProviders(() =>
      useKitchenActions({ locale: "ro", changeListing, forbid: vi.fn() }),
    );
    const kitchen = listedKitchen(1, { name: "Casa" });
    act(() => {
      probe.current.actions.duplicate(kitchen, "Casa");
      probe.current.actions.duplicate(kitchen, "Casa");
    });
    expect(sendSignedInRequest).toHaveBeenCalledTimes(1);
    expect(probe.current.actions.isCopying).toBe(true);
    await act(async () => {
      answer({ kind: "created", id: "k00000000000000000077" });
      await Promise.resolve();
    });
    await flushPromises();
    expect(probe.current.actions.isCopying).toBe(false);
    expect(changeListing).toHaveBeenCalledTimes(1);
    probe.screen.unmount();
  });

  it("allows another copy once the first is answered, even when the first failed", async () => {
    sendSignedInRequest.mockResolvedValueOnce({ kind: "request-failed" });
    const probe = inProviders(() =>
      useKitchenActions({
        locale: "ro",
        changeListing: vi.fn(),
        forbid: vi.fn(),
      }),
    );
    const kitchen = listedKitchen(1, { name: "Casa" });
    act(() => {
      probe.current.actions.duplicate(kitchen, "Casa");
    });
    await flushPromises(5);
    sendSignedInRequest.mockResolvedValueOnce({
      kind: "created",
      id: "k00000000000000000078",
    });
    act(() => {
      probe.current.actions.duplicate(kitchen, "Casa");
    });
    await flushPromises(5);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(2);
    probe.screen.unmount();
  });

  it("releases the guard when the request itself throws", async () => {
    sendSignedInRequest.mockRejectedValueOnce(new Error("network down"));
    const probe = inProviders(() =>
      useKitchenActions({
        locale: "ro",
        changeListing: vi.fn(),
        forbid: vi.fn(),
      }),
    );
    const kitchen = listedKitchen(1, { name: "Casa" });
    act(() => {
      probe.current.actions.duplicate(kitchen, "Casa");
    });
    await flushPromises(5);
    expect(probe.current.actions.isCopying).toBe(false);
    expect(probe.current.feedback.pendingCopy).toBeUndefined();
    sendSignedInRequest.mockResolvedValueOnce({
      kind: "created",
      id: "k00000000000000000079",
    });
    act(() => {
      probe.current.actions.duplicate(kitchen, "Casa");
    });
    await flushPromises(5);
    expect(sendSignedInRequest).toHaveBeenCalledTimes(2);
    probe.screen.unmount();
  });
});

describe("rename", () => {
  it("shows the name the server kept, not the one that was sent", async () => {
    sendSignedInRequest.mockImplementation((request: SignedInRequest) =>
      Promise.resolve(
        request.flow === "kitchen-action" && request.action.kind === "rename"
          ? ({ kind: "renamed", name: "Kept by the server" } as const)
          : ({ kind: "request-failed" } as const),
      ),
    );
    const changeListing = vi.fn();
    const probe = inProviders(() =>
      useKitchenActions({ locale: "ro", changeListing, forbid: vi.fn() }),
    );
    const kitchen = listedKitchen(1);
    let result: unknown;
    await act(async () => {
      result = await probe.current.actions.rename(kitchen, "Typed");
    });
    expect(result).toEqual({ kind: "renamed" });
    expect(changeListing).toHaveBeenCalledExactlyOnceWith({
      kind: "rename",
      id: kitchen.id,
      name: "Kept by the server",
    });
    probe.screen.unmount();
  });
});

describe("useRemoveKitchen", () => {
  it("sends one request for two confirmations made before the first is answered", async () => {
    let answer: (result: RemoveResult) => void = () => undefined;
    const remove = vi.fn(
      () =>
        new Promise<RemoveResult>((resolve) => {
          answer = resolve;
        }),
    );
    const onClose = vi.fn();
    const hook = renderHook(() => useRemoveKitchen(remove, onClose));
    act(() => {
      hook.result.current.confirm();
      hook.result.current.confirm();
    });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toEqual({ kind: "busy" });
    await act(async () => {
      answer({ kind: "removed" });
      await Promise.resolve();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("stays busy and does not close when the document is on its way out", async () => {
    const onClose = vi.fn();
    const hook = renderHook(() =>
      useRemoveKitchen(() => Promise.resolve({ kind: "left" }), onClose),
    );
    act(() => {
      hook.result.current.confirm();
    });
    await flushPromises();
    expect(hook.result.current.status).toEqual({ kind: "busy" });
    expect(onClose).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("is ready again after a failure, and a second confirmation then sends", async () => {
    const remove = vi
      .fn<() => Promise<RemoveResult>>()
      .mockResolvedValueOnce({ kind: "failed", failure: { kind: "offline" } })
      .mockResolvedValueOnce({ kind: "removed" });
    const onClose = vi.fn();
    const hook = renderHook(() => useRemoveKitchen(remove, onClose));
    act(() => {
      hook.result.current.confirm();
    });
    await flushPromises();
    expect(hook.result.current.status).toEqual({
      kind: "failed",
      failure: { kind: "offline" },
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      hook.result.current.confirm();
    });
    await flushPromises();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("closes for a conflict and for a kitchen that is gone: the card has been corrected", async () => {
    for (const kind of ["conflict", "gone"] as const) {
      const onClose = vi.fn();
      const hook = renderHook(() =>
        useRemoveKitchen(() => Promise.resolve({ kind }), onClose),
      );
      act(() => {
        hook.result.current.confirm();
      });
      await flushPromises();
      expect(onClose, kind).toHaveBeenCalledTimes(1);
      hook.unmount();
    }
  });
});

describe("KitchenMenu", () => {
  let screen: MountedScreen | undefined;

  afterEach(() => {
    screen?.unmount();
    screen = undefined;
  });

  function open(isCopying: boolean, isSent = false) {
    const onChoose = vi.fn();
    screen = mountInCatalogue(
      createElement(
        "main",
        null,
        createElement(KitchenMenu, {
          kitchenName: "Casa",
          isSent,
          isCopying,
          onChoose,
          onClose: vi.fn(),
          returnFocusRef: { current: null },
        }),
      ),
    );
    return onChoose;
  }

  it("ignores a press on 'copy' while a copy is out, and says it is busy", () => {
    const onChoose = open(true);
    const row = byWords(document.body, "button", copy.menuDuplicate);
    expect(row.getAttribute("aria-disabled")).toBe("true");
    click(row);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("passes a press on 'copy' on when none is out", () => {
    const onChoose = open(false);
    const row = byWords(document.body, "button", copy.menuDuplicate);
    expect(row.getAttribute("aria-disabled")).toBeNull();
    click(row);
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("duplicate");
  });

  it("still lets the other rows through while a copy is out", () => {
    const onChoose = open(true);
    click(byWords(document.body, "button", copy.menuRename));
    click(byWords(document.body, "button", copy.menuDelete));
    expect(onChoose.mock.calls).toEqual([["rename"], ["delete"]]);
  });

  it("asks for the act that its label names: delete for a draft, hide for a sent kitchen", () => {
    const draftChoose = open(false, false);
    click(byWords(document.body, "button", copy.menuDelete));
    expect(draftChoose).toHaveBeenCalledExactlyOnceWith("delete");
    screen?.unmount();
    const sentChoose = open(false, true);
    click(byWords(document.body, "button", copy.menuHide));
    expect(sentChoose).toHaveBeenCalledExactlyOnceWith("hide");
  });
});
