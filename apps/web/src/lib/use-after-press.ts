"use client";

// **Acting once a press is over, so nothing moves under the finger between its down and its click.**
//
// A browser moves focus on a press, before the click. A `blur` handler that inserts content at that
// moment pushes every control below it down between the press and the release, and the click lands on
// whatever is now under the finger (M7 wave 7F2, QA finding S5b-1: wall B's help did not open). This
// hook runs an action at once when no press is down, and otherwise once the press has completed.
//
// **A press completes** on its `click` (listened for on `window`, so every handler below has run), on
// `pointercancel` (a touch that became a scroll), or just after a release that clicks nothing (a
// disabled button fires no click). **A press is interrupted** — its release lost to a native context
// menu or an app switch — by a real key or by the window losing focus, and an interruption completes it.
//
// **Assumption (review R1.6):** completing on a zero timeout after `mouseup` relies on the browser
// dispatching the release's `click` in the same task as the `mouseup`, so the timeout runs after the
// click. Verified in Chromium (QA's e2e, mouse and touch); **not verified in WebKit.**
import { useEffect, useRef } from "react";

/** The events that begin a press. A touch tap moves focus on the `mousedown` the browser synthesises
 *  after the finger lifts, not on its `pointerdown`, so both are listened for. */
const PRESS_STARTS = ["pointerdown", "mousedown"] as const;

/** The events after which no press is down. */
const PRESS_RELEASES = ["pointerup", "mouseup", "pointercancel"] as const;

/** The events that complete a press: its click, or a cancel (a touch that became a scroll). */
const PRESS_COMPLETIONS = ["click", "pointercancel"] as const;

/** The events after which a press's click, if there is one, has been dispatched in the same task. */
const PRESS_RELEASES_BEFORE_CLICK = ["pointerup", "mouseup"] as const;

/** Past a release, the click is dispatched in the same task; a zero timeout runs after it, and is what
 *  completes a press that produces no click at all. */
const AFTER_THE_CLICK_MS = 0;

/** Keys a customer holds *while* pressing — a Shift-click — which therefore say nothing about whether
 *  the press is over (review R1.1). */
const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "CapsLock",
  "Fn",
]);

/** A key in the capture phase, so a Tab ends the press before it moves focus. */
const CAPTURE: AddEventListenerOptions = { capture: true };
const BUBBLE: AddEventListenerOptions = { capture: false };

type Removal = () => void;

/**
 * Runs an action now, or — while a press is down — once that press has completed or been interrupted.
 * Pending actions are dropped on unmount.
 */
export function useAfterPress(): (action: () => void) => void {
  const isPressing = useRef(false);
  const pendingCancels = useRef(new Set<Removal>());

  useEffect(() => {
    const cancels = pendingCancels.current;
    const stopTracking = trackPresses(isPressing);
    return () => {
      stopTracking();
      for (const cancel of cancels) cancel();
      cancels.clear();
    };
  }, []);

  return (action) => {
    if (!isPressing.current) {
      action();
      return;
    }
    const cancel = onPressCompleted(() => {
      pendingCancels.current.delete(cancel);
      action();
    });
    pendingCancels.current.add(cancel);
  };
}

/** Keeps `isPressing` true from a press's start to its release or interruption. */
function trackPresses(isPressing: { current: boolean }): Removal {
  const release = () => {
    isPressing.current = false;
  };
  return removingAll([
    listenOnWindow(
      PRESS_STARTS,
      () => {
        isPressing.current = true;
      },
      CAPTURE,
    ),
    listenOnWindow(PRESS_RELEASES, release, CAPTURE),
    onPressInterrupted(release),
  ]);
}

/** Calls `interrupted` on a key that could not be pressed mid-press, or on the window losing focus. */
function onPressInterrupted(interrupted: () => void): Removal {
  return removingAll([
    listenOnWindow(
      ["keydown"],
      (event) => {
        if (isKeyThatEndsAPress(event)) interrupted();
      },
      CAPTURE,
    ),
    listenOnWindow(
      ["blur"],
      (event) => {
        if (isOwnEventOf(event)) interrupted();
      },
      BUBBLE,
    ),
  ]);
}

/** A held modifier, an auto-repeat of a key already down, or a keystroke inside an IME composition can
 *  all happen during a press. Any other key cannot, so its press has ended somewhere the page missed. */
function isKeyThatEndsAPress(event: KeyboardEvent): boolean {
  if (event.repeat || event.isComposing) return false;
  return !MODIFIER_KEYS.has(event.key);
}

/** Whether the event was dispatched at the listening object itself. A bubble-phase listener on
 *  `window` only ever sees the window's own `blur`, since an element's does not bubble; this guards
 *  against a synthetic `blur` dispatched with `bubbles: true`, and against a test DOM whose `window`
 *  global wraps the object it reports as `target` — hence `currentTarget`, not `window`. */
function isOwnEventOf(event: Event): boolean {
  return event.target === event.currentTarget;
}

/** Calls `complete` once, when the press under way completes or is interrupted. Returns its
 *  cancellation. */
function onPressCompleted(complete: () => void): Removal {
  const afterTheClick = restartableTimeout(finish, AFTER_THE_CLICK_MS);
  const stopListening = removingAll([
    listenOnWindow(PRESS_COMPLETIONS, finish, BUBBLE),
    listenOnWindow(PRESS_RELEASES_BEFORE_CLICK, afterTheClick.restart, BUBBLE),
    onPressInterrupted(finish),
  ]);
  function cancel(): void {
    afterTheClick.clear();
    stopListening();
  }
  function finish(): void {
    cancel();
    complete();
  }
  return cancel;
}

interface RestartableTimeout {
  readonly restart: () => void;
  readonly clear: () => void;
}

function restartableTimeout(
  action: () => void,
  delayMs: number,
): RestartableTimeout {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return {
    restart: () => {
      clearTimeout(handle);
      handle = setTimeout(action, delayMs);
    },
    clear: () => {
      clearTimeout(handle);
    },
  };
}

/** Adds one listener to `window` for each type. Returns the matching removal. */
function listenOnWindow<Type extends keyof WindowEventMap>(
  types: readonly Type[],
  listener: (event: WindowEventMap[Type]) => void,
  options: AddEventListenerOptions,
): Removal {
  for (const type of types) window.addEventListener(type, listener, options);
  return () => {
    for (const type of types) {
      window.removeEventListener(type, listener, options);
    }
  };
}

function removingAll(removals: readonly Removal[]): Removal {
  return () => {
    for (const remove of removals) remove();
  };
}
