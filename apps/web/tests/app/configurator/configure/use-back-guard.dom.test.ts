// @vitest-environment happy-dom
//
// **M7C C1 S4 (FB-001, Q10): the guard entry's bookkeeping, against a history.**
//
// The decisions are `use-back-guard.test.ts`'s. What this file adds is the part a pure function
// cannot show: that the effects push **once** — through StrictMode's double effect, a remount (the
// language switch) and every later store change — that the question opens from a `popstate`, and that
// each answer touches history only in the way it should. happy-dom has no real traversal, so a
// landing is simulated by moving the entry's URL and state and dispatching the event; that Back
// really lands where this assumes, and what Chrome does with the entries, is the e2e spec's.
import { act, createElement, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  forgetEditorOrigin,
  readEditorOrigin,
  recordEditorOpenedFromStepOne,
} from "@/app/configurator/configure/back-guard";
import { useBackGuard } from "@/app/configurator/configure/use-back-guard";
import { useConfiguratorStore } from "@/store/configurator-store";

const DESIGN = "design-1";
const ORIGIN = "http://localhost:3000";
const EDITOR = `/ro/d/${DESIGN}`;
const STEP_ONE = "/ro/configurator/room";
const GUARD_STATE = { lemnariaBackGuard: true };

interface HarnessProps {
  readonly isOwner?: boolean;
  readonly isLinkQuestionOpen?: boolean;
}

function Harness({
  isOwner = true,
  isLinkQuestionOpen = false,
}: HarnessProps): ReactElement {
  const guard = useBackGuard({ isOwner, isLinkQuestionOpen });
  return createElement(
    "div",
    { "data-testid": "host", "data-asking": String(guard.isAsking) },
    createElement("button", {
      "data-testid": "confirm",
      onClick: guard.confirm,
    }),
    createElement("button", { "data-testid": "stay", onClick: guard.stay }),
  );
}

let host: HTMLDivElement;
let root: Root;
let pushState: ReturnType<typeof vi.spyOn>;
let back: ReturnType<typeof vi.spyOn>;
let forward: ReturnType<typeof vi.spyOn>;

function mount(props: HarnessProps = {}, { strict = false } = {}): void {
  const screen = createElement(Harness, props);
  act(() => {
    root.render(strict ? createElement(StrictMode, null, screen) : screen);
  });
}

function edit(): void {
  act(() => {
    useConfiguratorStore.setState({ designId: DESIGN, hasBeenEdited: true });
  });
}

/** The browser having landed on an entry: its URL and state move, then `popstate` fires. */
function landOn(pathname: string, state: unknown): void {
  window.history.replaceState(state, "", `${ORIGIN}${pathname}`);
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

function isAsking(): boolean {
  return (
    host.querySelector("[data-testid=host]")?.getAttribute("data-asking") ===
    "true"
  );
}

function press(testId: string): void {
  act(() => {
    host.querySelector<HTMLElement>(`[data-testid=${testId}]`)?.click();
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", `${ORIGIN}${EDITOR}`);
  forgetEditorOrigin();
  useConfiguratorStore.setState({ designId: DESIGN, hasBeenEdited: false });
  pushState = vi.spyOn(window.history, "pushState");
  back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
  forward = vi
    .spyOn(window.history, "forward")
    .mockImplementation(() => undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the guard entry", () => {
  it("is pushed once, at the editor's own URL, when an edit follows Step 1's hand-over", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mount();
    expect(pushState).not.toHaveBeenCalled();

    edit();

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledWith(GUARD_STATE, "");
    expect(window.location.pathname).toBe(EDITOR);
    expect(readEditorOrigin().guardedPathname).toBe(EDITOR);
  });

  it("is pushed once through StrictMode's double effect", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mount({}, { strict: true });

    edit();

    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("is not pushed again by later edits, or by a remount such as a language switch's", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mount();
    edit();
    act(() => {
      useConfiguratorStore.setState({ designId: DESIGN, hasBeenEdited: true });
    });

    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    mount();

    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("is not pushed on a mount that already stands on a guard entry, whatever the module remembers", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    window.history.replaceState(GUARD_STATE, "", `${ORIGIN}${EDITOR}`);
    useConfiguratorStore.setState({ hasBeenEdited: true });

    mount();

    expect(pushState).not.toHaveBeenCalled();
  });

  it("is not pushed for an untouched kitchen, however long the screen is open", () => {
    recordEditorOpenedFromStepOne(DESIGN);

    mount();

    expect(pushState).not.toHaveBeenCalled();
  });

  it("is not pushed for the shared variant", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mount({ isOwner: false });

    edit();

    expect(pushState).not.toHaveBeenCalled();
  });

  it("is not pushed for an editor that was not reached from Step 1", () => {
    mount();

    edit();

    expect(pushState).not.toHaveBeenCalled();
  });
});

describe("the question", () => {
  beforeEach(() => {
    recordEditorOpenedFromStepOne(DESIGN);
    mount();
    edit();
    window.history.replaceState(null, "", `${ORIGIN}${EDITOR}`);
  });

  it("opens when Back lands on the entry the guard was pushed over", () => {
    landOn(EDITOR, null);

    expect(isAsking()).toBe(true);
  });

  it("does not open for Forward, which lands on the guard", () => {
    landOn(EDITOR, GUARD_STATE);

    expect(isAsking()).toBe(false);
  });

  it("is closed by a landing on the guard — Forward pressed with the question open", () => {
    landOn(EDITOR, null);

    landOn(EDITOR, GUARD_STATE);

    expect(isAsking()).toBe(false);
  });

  it("Stay closes it and goes forward onto the guard, which creates no entry", () => {
    landOn(EDITOR, null);

    press("stay");

    expect(isAsking()).toBe(false);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("Confirm is latched: a second press before the traversal lands queues no second one", () => {
    landOn(EDITOR, null);

    press("confirm");
    press("confirm");

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("Stay clears the latch, so the next question can be confirmed", () => {
    landOn(EDITOR, null);
    press("confirm");
    press("stay");

    landOn(EDITOR, null);
    press("confirm");

    expect(back).toHaveBeenCalledTimes(2);
  });

  it("Confirm goes back once and writes nothing", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    landOn(EDITOR, null);

    press("confirm");

    expect(back).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is left alone by a second Back, which lands on Step 1 and forgets the origin", () => {
    landOn(EDITOR, null);

    landOn(STEP_ONE, null);

    expect(readEditorOrigin().designId).toBeNull();
    expect(back).not.toHaveBeenCalled();
  });

  it("asks nothing over the links' own question and lets the traversal through", () => {
    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    mount({ isLinkQuestionOpen: true });

    landOn(EDITOR, null);

    expect(isAsking()).toBe(false);
    expect(forward).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it("puts the guard back when the links' question is then dismissed on the entry behind it", () => {
    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    mount({ isLinkQuestionOpen: true });
    landOn(EDITOR, null);

    mount({ isLinkQuestionOpen: false });

    expect(forward).toHaveBeenCalledTimes(1);
  });

  it("leaves the guard alone when the links' question is dismissed with the guard under the customer", () => {
    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    mount({ isLinkQuestionOpen: true });
    landOn(EDITOR, GUARD_STATE);

    mount({ isLinkQuestionOpen: false });

    expect(forward).not.toHaveBeenCalled();
  });
});

describe("the question after Step 1 has been left", () => {
  it("does not open from a Back that lands on the editor once the origin is forgotten", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mount();
    edit();
    landOn(STEP_ONE, null);

    landOn(EDITOR, null);

    expect(isAsking()).toBe(false);
  });
});

describe("an unmount that outlives the traversal which caused it", () => {
  it("forgets the origin when the screen goes away with the URL already on Step 1", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mount();
    edit();
    window.history.replaceState(null, "", `${ORIGIN}${STEP_ONE}`);

    act(() => {
      root.unmount();
    });
    root = createRoot(host);

    expect(readEditorOrigin().designId).toBeNull();
  });

  it("keeps the origin when the screen is only replaced by the same design in another language", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mount();
    edit();
    window.history.replaceState(null, "", `${ORIGIN}/ru/d/${DESIGN}`);

    act(() => {
      root.unmount();
    });
    root = createRoot(host);

    expect(readEditorOrigin().designId).toBe(DESIGN);
  });

  it("lets Confirm reach Step 1 through an older-language entry even though the screen that asked is gone", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mount();
    edit();
    window.history.replaceState(null, "", `${ORIGIN}${EDITOR}`);
    landOn(EDITOR, null);
    press("confirm");
    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    window.history.replaceState(null, "", `${ORIGIN}/ru/d/${DESIGN}`);
    mount();
    back.mockClear();

    landOn(`/ru/d/${DESIGN}`, null);

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("catches a landing it was not told about: a screen mounted on an older-language entry while answering leaves once, a tick later, even under StrictMode", () => {
    vi.useFakeTimers();
    recordEditorOpenedFromStepOne(DESIGN);
    mount();
    edit();
    window.history.replaceState(null, "", `${ORIGIN}${EDITOR}`);
    landOn(EDITOR, null);
    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    window.history.replaceState(null, "", `${ORIGIN}/ru/d/${DESIGN}`);
    back.mockClear();

    mount({}, { strict: true });
    expect(back).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("does not leave on mounting at an older-language entry when no question is being answered", () => {
    vi.useFakeTimers();
    recordEditorOpenedFromStepOne(DESIGN);
    mount();
    edit();
    act(() => {
      root.unmount();
    });
    root = createRoot(host);
    window.history.replaceState(null, "", `${ORIGIN}/ru/d/${DESIGN}`);
    back.mockClear();

    mount();
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(back).not.toHaveBeenCalled();
  });
});
