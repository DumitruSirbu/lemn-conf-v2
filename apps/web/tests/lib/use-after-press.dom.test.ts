// @vitest-environment happy-dom
//
// **`useAfterPress`, on its own** — M7 wave 7F2 slice S5b, review R1.1 and R1.2.
//
// A probe component hands out the hook's function. Each test dispatches a press in the order a browser
// sends it, and asks for an action where a `blur` handler would: after the event that moves focus.
// What is asserted is when the action runs — at once, on the press's completion, on an interruption,
// or never (unmounted).
import { act, createElement, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAfterPress } from "@/lib/use-after-press";

let container: HTMLDivElement;
let root: Root;
let afterPress: (action: () => void) => void = () => undefined;
let target: HTMLButtonElement;

function Probe(): ReactElement {
  afterPress = useAfterPress();
  return createElement("button", { type: "button" });
}

function mount(): void {
  renderProbe(createElement(Probe));
}

function mountUnderStrictMode(): void {
  renderProbe(createElement(StrictMode, null, createElement(Probe)));
}

function renderProbe(element: ReactElement): void {
  act(() => {
    root.render(element);
  });
  const button = container.querySelector("button");
  if (button === null) throw new Error("the probe draws no button");
  target = button;
}

function send(...types: readonly string[]): void {
  for (const type of types) {
    act(() => {
      target.dispatchEvent(new Event(type, { bubbles: true }));
    });
  }
}

function sendKey(init: KeyboardEventInit): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, ...init }),
    );
  });
}

function loseWindowFocus(): void {
  act(() => {
    window.dispatchEvent(new FocusEvent("blur"));
  });
}

function advance(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

/** Asks for an action where a `blur` handler would, and returns how many times it has run. */
function requestAction(): () => number {
  let runs = 0;
  afterPress(() => {
    runs += 1;
  });
  return () => runs;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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
  vi.restoreAllMocks();
});

describe("with no press down", () => {
  it("runs the action at once", () => {
    mount();

    expect(requestAction()()).toBe(1);
  });

  it("runs it at once after a press that has already been released", () => {
    mount();
    send("pointerdown", "mousedown", "pointerup", "mouseup", "click");

    expect(requestAction()()).toBe(1);
  });
});

describe("a press completes", () => {
  it("on a mouse press's click, and not before, and only once", () => {
    mount();
    send("pointerdown", "mousedown");
    const runs = requestAction();

    send("pointerup", "mouseup");
    expect(runs()).toBe(0);
    send("click");
    expect(runs()).toBe(1);
    advance(0);
    expect(runs()).toBe(1);
  });

  it("on a touch tap's click, whose focus moves on the mousedown after the finger lifts", () => {
    mount();
    send("pointerdown", "pointerup", "mousedown");
    const runs = requestAction();

    send("mouseup");
    expect(runs()).toBe(0);
    send("click");
    expect(runs()).toBe(1);
  });

  it("on a cancel, as a touch that becomes a scroll", () => {
    mount();
    send("pointerdown");
    const runs = requestAction();

    send("pointercancel");

    expect(runs()).toBe(1);
  });

  it("after the release of a press that clicks nothing, as on a disabled button", () => {
    mount();
    send("pointerdown", "mousedown");
    const runs = requestAction();

    send("pointerup", "mouseup");
    expect(runs()).toBe(0);
    advance(0);

    expect(runs()).toBe(1);
  });
});

describe("a press whose release is lost is interrupted", () => {
  it("by Tab: a later action runs at once", () => {
    mount();
    send("pointerdown", "mousedown");

    sendKey({ key: "Tab" });

    expect(requestAction()()).toBe(1);
  });

  it("by Tab: an action already waiting runs", () => {
    mount();
    send("pointerdown", "mousedown");
    const runs = requestAction();

    sendKey({ key: "Tab" });

    expect(runs()).toBe(1);
  });

  it("by the window losing focus: a later action runs at once", () => {
    mount();
    send("pointerdown", "mousedown");

    loseWindowFocus();

    expect(requestAction()()).toBe(1);
  });

  it("by the window losing focus: an action already waiting runs", () => {
    mount();
    send("pointerdown", "mousedown");
    const runs = requestAction();

    loseWindowFocus();

    expect(runs()).toBe(1);
  });
});

describe("what does not interrupt a press held down (review R1.1)", () => {
  it.each(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Fn"])(
    "a %s keydown leaves the action waiting",
    (key) => {
      mount();
      send("pointerdown", "mousedown");
      const runs = requestAction();

      sendKey({ key });

      expect(runs()).toBe(0);
      send("pointerup", "mouseup", "click");
      expect(runs()).toBe(1);
    },
  );

  it("an auto-repeated keydown leaves the action waiting", () => {
    mount();
    send("pointerdown", "mousedown");
    const runs = requestAction();

    sendKey({ key: "a", repeat: true });

    expect(runs()).toBe(0);
  });

  it("a keydown inside an IME composition leaves the action waiting", () => {
    mount();
    send("pointerdown", "mousedown");
    const runs = requestAction();

    sendKey({ key: "a", isComposing: true });

    expect(runs()).toBe(0);
  });

  it("an element's own blur leaves the action waiting", () => {
    mount();
    send("pointerdown", "mousedown");
    const runs = requestAction();

    act(() => {
      target.dispatchEvent(new FocusEvent("blur"));
    });

    expect(runs()).toBe(0);
  });

  it("a synthetic blur that bubbles from an element leaves the action waiting", () => {
    mount();
    send("pointerdown", "mousedown");
    const runs = requestAction();

    send("blur");

    expect(runs()).toBe(0);
  });
});

describe("unmounting", () => {
  it("drops an action still waiting", () => {
    mount();
    send("pointerdown", "mousedown");
    const runs = requestAction();

    act(() => {
      root.unmount();
    });
    window.dispatchEvent(new Event("click"));

    expect(runs()).toBe(0);
    root = createRoot(container);
  });

  it.each([
    ["a plain mount", mount],
    ["a StrictMode mount", mountUnderStrictMode],
  ] as const)(
    "removes every window listener it added, after %s",
    (_, mountProbe) => {
      const added = vi.spyOn(window, "addEventListener");
      const removed = vi.spyOn(window, "removeEventListener");
      mountProbe();
      send("pointerdown", "mousedown");
      requestAction();

      act(() => {
        root.unmount();
      });

      const identities = new Map<unknown, number>();
      const additions = listenersOf(added.mock.calls, identities);
      expect(additions.length).toBeGreaterThan(0);
      expect(listenersOf(removed.mock.calls, identities)).toEqual(additions);
      root = createRoot(container);
    },
  );
});

describe("under StrictMode", () => {
  it("waits for a mouse press's click and runs the action once", () => {
    mountUnderStrictMode();
    send("pointerdown", "mousedown");
    const runs = requestAction();

    send("pointerup", "mouseup");
    expect(runs()).toBe(0);
    send("click");

    expect(runs()).toBe(1);
  });
});

/** Each registration as `type capture #listener`, sorted, so an addition and its removal compare.
 *  `identities` is shared by both lists, so one listener has one number in each. */
function listenersOf(
  calls: readonly (readonly unknown[])[],
  identities: Map<unknown, number>,
): readonly string[] {
  return calls
    .map(([type, listener, options]) => {
      if (!identities.has(listener)) identities.set(listener, identities.size);
      const isCapture =
        typeof options === "boolean"
          ? options
          : (options as AddEventListenerOptions | undefined)?.capture === true;
      return `${String(type)} ${String(isCapture)} #${String(identities.get(listener))}`;
    })
    .sort();
}
