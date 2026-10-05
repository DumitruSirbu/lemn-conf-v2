"use client";

// Acts once a press is over, so nothing moves under the finger between its down and its click.
//
// A browser moves focus on a press, before the click. A `blur` handler that inserts content then
// pushes every control below it down, and the click lands on whatever is now under the finger. This
// hook runs an action at once when no press is down, and otherwise once the press has completed.
//
// A press completes on its `click` (listened for on `window`, so every handler has run), on
// `pointercancel` (a touch that became a scroll), or just after a release that clicks nothing (a
// disabled button fires no click). A press is interrupted, its release lost to a native context menu
// or an app switch, by a real key or the window losing focus, and an interruption completes it.
//
// Assumption: completing on a zero timeout after `mouseup` relies on the browser dispatching the
// release's `click` in the same task, so the timeout runs after it. Verified in Chromium (mouse and
// touch e2e); not verified in WebKit.
import { useEffect, useRef } from "react";

/** A touch tap moves focus on the `mousedown` the browser synthesises after the finger lifts, not on
 *  its `pointerdown`, so both begin a press. */
const PRESS_STARTS = ["pointerdown", "mousedown"] as const;

const PRESS_RELEASES = ["pointerup", "mouseup", "pointercancel"] as const;

const PRESS_COMPLETIONS = ["click", "pointercancel"] as const;

const PRESS_RELEASES_BEFORE_CLICK = ["pointerup", "mouseup"] as const;

/** A zero timeout runs after the release's click, and completes a press that produces none. */
const AFTER_THE_CLICK_MS = 0;

/** Keys held while pressing (a Shift-click), which say nothing about whether the press is over. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "CapsLock",
  "Fn",
]);

/** Capture, so a Tab ends the press before it moves focus. */
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

/** A held modifier, an auto-repeat or an IME keystroke can happen during a press; any other key
 *  cannot, so the press ended somewhere the page missed. */
function isKeyThatEndsAPress(event: KeyboardEvent): boolean {
  if (event.repeat || event.isComposing) return false;
  return !MODIFIER_KEYS.has(event.key);
}

/** Whether the event was dispatched at the listening object itself: guards against a synthetic `blur`
 *  with `bubbles: true`, and a test DOM whose `window` wraps the object reported as `target`, hence
 *  `currentTarget`, not `window`. */
function isOwnEventOf(event: Event): boolean {
  return event.target === event.currentTarget;
}

/** Calls `complete` once, when the press under way completes or is interrupted; returns its cancel. */
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
