// @vitest-environment happy-dom
// The line that says a signed-in act has happened ("Copie creata"): a live region mounted before its first words, a
// second telling of the same sentence announced again (a new id remounts the line), and a clock that outlasts a glance
// and restarts with each telling.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatusToast } from "@/account/status-toast";
import {
  useToastMessage,
  type ToastMessage,
} from "@/account/use-toast-message";

import { renderHook } from "../support/render-hook";

const TOAST_VISIBLE_MS = 6_000;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

function show(
  message: ToastMessage | undefined,
  onElapsed: () => void = () => undefined,
): void {
  act(() => {
    root.render(createElement(StatusToast, { message, onElapsed }));
  });
}

const region = (): HTMLElement => {
  const found = container.querySelector<HTMLElement>('[role="status"]');
  if (found === null) throw new Error("the live region is not mounted");
  return found;
};

describe("useToastMessage: every telling is numbered", () => {
  it("has no message to begin with", () => {
    const hook = renderHook(() => useToastMessage());
    expect(hook.result.current.message).toBeUndefined();
    hook.unmount();
  });

  it("gives the same sentence told twice two different ids", () => {
    const hook = renderHook(() => useToastMessage());
    act(() => {
      hook.result.current.tell("Copie creata");
    });
    const first = hook.result.current.message;
    act(() => {
      hook.result.current.tell("Copie creata");
    });
    const second = hook.result.current.message;
    expect(first?.text).toBe("Copie creata");
    expect(second?.text).toBe("Copie creata");
    expect(second?.id).not.toBe(first?.id);
    expect(second?.id).toBeGreaterThan(first?.id ?? Infinity);
    hook.unmount();
  });

  it("clears back to nothing, and the next telling is still a new number", () => {
    const hook = renderHook(() => useToastMessage());
    act(() => {
      hook.result.current.tell("a");
    });
    const before = hook.result.current.message?.id ?? 0;
    act(() => {
      hook.result.current.clear();
    });
    expect(hook.result.current.message).toBeUndefined();
    act(() => {
      hook.result.current.tell("a");
    });
    expect(hook.result.current.message?.id).toBeGreaterThan(before);
    hook.unmount();
  });

  it("keeps tell and clear the same functions across renders, so effects that hold them do not restart", () => {
    const hook = renderHook(() => useToastMessage());
    const { tell, clear } = hook.result.current;
    act(() => {
      hook.result.current.tell("x");
    });
    expect(hook.result.current.tell).toBe(tell);
    expect(hook.result.current.clear).toBe(clear);
    hook.unmount();
  });
});

describe("StatusToast", () => {
  it("is mounted and empty before its first message: a region drawn with its words is not reliably announced", () => {
    show(undefined);
    expect(region().textContent).toBe("");
  });

  it("keeps the same live region while words come and go", () => {
    show(undefined);
    const before = region();
    show({ id: 1, text: "Copie creata" });
    expect(region()).toBe(before);
    expect(region().textContent).toBe("Copie creata");
    show(undefined);
    expect(region()).toBe(before);
    expect(region().textContent).toBe("");
  });

  it("remounts the line for the same words told again, which is what makes the region announce it again", () => {
    show({ id: 1, text: "Copie creata" });
    const firstLine = container.querySelector("p");
    show({ id: 1, text: "Copie creata" });
    expect(container.querySelector("p")).toBe(firstLine);
    show({ id: 2, text: "Copie creata" });
    const secondLine = container.querySelector("p");
    expect(secondLine).not.toBe(firstLine);
    expect(secondLine?.textContent).toBe("Copie creata");
  });

  it("calls for the message to go after six seconds, not before", () => {
    const onElapsed = vi.fn();
    show({ id: 1, text: "x" }, onElapsed);
    vi.advanceTimersByTime(TOAST_VISIBLE_MS - 1);
    expect(onElapsed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it("restarts the clock for a new telling, even of the same words", () => {
    const onElapsed = vi.fn();
    show({ id: 1, text: "x" }, onElapsed);
    vi.advanceTimersByTime(5_000);
    show({ id: 2, text: "x" }, onElapsed);
    vi.advanceTimersByTime(5_000);
    expect(onElapsed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(onElapsed).toHaveBeenCalledTimes(1);
  });

  it("does not restart the clock when the screen passes a new inline callback, and calls the latest one", () => {
    const first = vi.fn();
    const latest = vi.fn();
    show({ id: 1, text: "x" }, first);
    vi.advanceTimersByTime(4_000);
    show({ id: 1, text: "x" }, latest);
    vi.advanceTimersByTime(2_000);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("starts no clock while there is no message, and drops it when the message is cleared early", () => {
    const onElapsed = vi.fn();
    show(undefined, onElapsed);
    expect(vi.getTimerCount()).toBe(0);
    show({ id: 1, text: "x" }, onElapsed);
    expect(vi.getTimerCount()).toBe(1);
    show(undefined, onElapsed);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(TOAST_VISIBLE_MS * 2);
    expect(onElapsed).not.toHaveBeenCalled();
  });

  it("leaves no clock running when the screen goes", () => {
    const onElapsed = vi.fn();
    show({ id: 1, text: "x" }, onElapsed);
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(TOAST_VISIBLE_MS * 2);
    expect(onElapsed).not.toHaveBeenCalled();
  });
});
