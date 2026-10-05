// @vitest-environment happy-dom
//
// **M7C C1 S4, adversarial QA: criterion 2 ("never a trap") and criterion 4 (one guard) as
// properties over long random sequences**, driving the real `useBackGuard` against a model of a
// browser history.
//
// The model is the part a reader must trust, so it is stated here:
// - History is an array of entries `{ pathname, state }` and an index. `pushState` (the guard's) is
//   captured and appended after the index, truncating the forward entries, as a browser does.
// - `history.back()` / `forward()` are asynchronous in a browser: they are queued and drained after
//   the action that called them, never inside it.
// - A landing that keeps the same screen (same editor, same language) dispatches `popstate` to the
//   listeners present. A landing that changes the screen (another language, Step 1, outside the site)
//   unmounts the old screen with the URL **already moved** and mounts the new one, and **neither sees
//   `popstate`** — the implementer's Chrome measurement (`use-back-guard.ts`, `usePopstateQuestion`).
//   Timers are then advanced, so the mounting screen's one-tick catch-up runs.
// - A reload keeps every entry and its state, and resets the module record and the store's
//   `hasBeenEdited` (a new document); a language switch is Next's push of the other locale's URL.
// - Stay, Escape and a backdrop press all call the dialog's `onStay` (`confirmation-dialog.tsx`:
//   `useEscapeToDismiss(true, onStay)`, the scrim's `onClick={onStay}`), so they are one action here.
import fc from "fast-check";
import { act, createElement, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  forgetEditorOrigin,
  recordEditorOpenedFromStepOne,
} from "@/app/configurator/configure/back-guard";
import {
  isGuardEntryState,
  useBackGuard,
} from "@/app/configurator/configure/use-back-guard";
import { useConfiguratorStore } from "@/store/configurator-store";

const DESIGN = "design-qa";
const ORIGIN = "http://localhost:3000";
const OUTSIDE = "/outside-the-site";
const STEP_ONE = "/ro/configurator/room";
const EDITOR_RO = `/ro/d/${DESIGN}`;
const EDITOR_RU = `/ru/d/${DESIGN}`;
const NEXT_STATE = { __NA: true };
const MAX_DRAINED_TRAVERSALS = 50;

type Action =
  | "back"
  | "forward"
  | "stay"
  | "confirm"
  | "reload"
  | "edit"
  | "refusedCommand"
  | "switchLanguage"
  | "openLinkQuestion"
  | "closeLinkQuestion";

interface Entry {
  readonly pathname: string;
  readonly state: unknown;
}

function Harness({
  isLinkQuestionOpen,
}: {
  readonly isLinkQuestionOpen: boolean;
}): ReactElement {
  const guard = useBackGuard({ isOwner: true, isLinkQuestionOpen });
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

/** A browser tab with one editor screen at most, and the history behind it. */
class SimulatedTab {
  entries: Entry[] = [];
  index = 0;
  isLinkQuestionOpen = false;
  private readonly pending: number[] = [];
  private root: Root | null = null;
  private readonly host: HTMLDivElement;
  private readonly isStrict: boolean;

  constructor(host: HTMLDivElement, isStrict: boolean) {
    this.host = host;
    this.isStrict = isStrict;
  }

  /** Step 1 hands over to the editor: `[outside, Step 1, editor]`, the record made before the push. */
  openFromStepOne(): void {
    this.entries = [
      { pathname: OUTSIDE, state: null },
      { pathname: STEP_ONE, state: NEXT_STATE },
    ];
    this.index = 1;
    recordEditorOpenedFromStepOne(DESIGN);
    this.pushEntry({ pathname: EDITOR_RO, state: NEXT_STATE });
    this.mountIfEditor();
  }

  get pathname(): string {
    return this.entries[this.index]?.pathname ?? OUTSIDE;
  }

  get isEditor(): boolean {
    return this.pathname === EDITOR_RO || this.pathname === EDITOR_RU;
  }

  get isAsking(): boolean {
    return (
      this.host
        .querySelector("[data-testid=host]")
        ?.getAttribute("data-asking") === "true"
    );
  }

  get guardCount(): number {
    return this.entries.filter((entry) => isGuardEntryState(entry.state))
      .length;
  }

  /** The page's own `history.pushState`: same URL, the given state, forward entries dropped. */
  capturePush(state: unknown): void {
    this.pushEntry({ pathname: this.pathname, state });
  }

  queueTraversal(delta: number): void {
    this.pending.push(delta);
  }

  perform(action: Action): void {
    switch (action) {
      case "back":
        this.queueTraversal(-1);
        break;
      case "forward":
        this.queueTraversal(1);
        break;
      case "stay":
        if (this.isAsking) this.press("stay");
        break;
      case "confirm":
        if (this.isAsking) this.press("confirm");
        break;
      case "reload":
        this.reload();
        break;
      case "edit":
        if (this.canTouchTheEditor()) this.edit();
        break;
      case "refusedCommand":
        if (this.canTouchTheEditor()) this.refuse();
        break;
      case "switchLanguage":
        if (this.canTouchTheEditor()) this.switchLanguage();
        break;
      case "openLinkQuestion":
        if (this.canTouchTheEditor()) this.setLinkQuestion(true);
        break;
      case "closeLinkQuestion":
        if (this.isEditor && this.isLinkQuestionOpen) {
          this.setLinkQuestion(false);
        }
        break;
    }
    this.drain();
  }

  unmount(): void {
    if (this.root === null) return;
    const root = this.root;
    act(() => {
      root.unmount();
    });
    this.root = null;
  }

  private canTouchTheEditor(): boolean {
    // Every open dialog marks the rest of the screen `inert`.
    return this.isEditor && !this.isAsking && !this.isLinkQuestionOpen;
  }

  private press(testId: string): void {
    act(() => {
      this.host.querySelector<HTMLElement>(`[data-testid=${testId}]`)?.click();
    });
  }

  private edit(): void {
    act(() => {
      useConfiguratorStore.setState({ designId: DESIGN, hasBeenEdited: true });
    });
  }

  /** A refusal writes `lastRejection` and nothing else (`has-been-edited.test.ts` pins the store). */
  private refuse(): void {
    act(() => {
      useConfiguratorStore.setState({
        lastRejection: { code: "TARGET_NOT_FOUND", params: {} },
      } as never);
    });
  }

  private setLinkQuestion(isOpen: boolean): void {
    this.isLinkQuestionOpen = isOpen;
    this.render();
  }

  private reload(): void {
    // A reload runs no React cleanup in a browser; unmounting first is harmless because the
    // module record is then reset anyway, as a new document would have it.
    this.unmount();
    forgetEditorOrigin();
    this.isLinkQuestionOpen = false;
    act(() => {
      useConfiguratorStore.setState({ designId: DESIGN, hasBeenEdited: false });
    });
    this.syncLocation();
    this.mountIfEditor();
  }

  private switchLanguage(): void {
    const target = this.pathname === EDITOR_RO ? EDITOR_RU : EDITOR_RO;
    this.pushEntry({ pathname: target, state: NEXT_STATE });
    this.unmount();
    this.isLinkQuestionOpen = false;
    this.mountIfEditor();
  }

  private pushEntry(entry: Entry): void {
    this.entries = [...this.entries.slice(0, this.index + 1), entry];
    this.index = this.entries.length - 1;
    this.syncLocation();
  }

  private drain(): void {
    let traversals = 0;
    while (this.pending.length > 0) {
      traversals += 1;
      if (traversals > MAX_DRAINED_TRAVERSALS) {
        throw new Error("history.back/forward keep re-queuing themselves");
      }
      const delta = this.pending.shift() ?? 0;
      const target = this.index + delta;
      if (target < 0 || target >= this.entries.length) continue;
      this.land(target);
    }
  }

  private land(target: number): void {
    const before = this.pathname;
    this.index = target;
    this.syncLocation();
    if (before === this.pathname) {
      const state = this.entries[target]?.state;
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
      });
    } else {
      this.unmount();
      this.isLinkQuestionOpen = false;
      this.mountIfEditor();
    }
    act(() => {
      vi.advanceTimersByTime(1);
    });
  }

  private mountIfEditor(): void {
    if (!this.isEditor) return;
    this.root = createRoot(this.host);
    this.render();
    act(() => {
      vi.advanceTimersByTime(1);
    });
  }

  private render(): void {
    const root = this.root;
    if (root === null) return;
    const screen = createElement(Harness, {
      isLinkQuestionOpen: this.isLinkQuestionOpen,
    });
    act(() => {
      root.render(
        this.isStrict ? createElement(StrictMode, null, screen) : screen,
      );
    });
  }

  private syncLocation(): void {
    const entry = this.entries[this.index];
    replaceStateUnspied(entry?.state ?? null, "", `${ORIGIN}${this.pathname}`);
  }
}

let replaceStateUnspied: History["replaceState"];
let tab: SimulatedTab;
let host: HTMLDivElement;

/** Each run of a property starts from nothing: the run before it may have failed — and a failing
 *  assertion skips that run's own `unmount()`, leaving a live screen listening on `window` into every
 *  later run and shrink candidate — and the store's `hasBeenEdited` is module state no run resets. Both
 *  made a counterexample depend on what ran before it (review of C1 S4, B1). */
let previousTab: SimulatedTab | null = null;

function openTab(isStrict: boolean): SimulatedTab {
  previousTab?.unmount();
  forgetEditorOrigin();
  useConfiguratorStore.setState({ designId: DESIGN, hasBeenEdited: false });
  const opened = new SimulatedTab(host, isStrict);
  previousTab = opened;
  tab = opened;
  opened.openFromStepOne();
  return opened;
}

/** Back pressed until Step 1 shows, answering nothing; the number of presses, or Infinity. */
function backPressesToStepOne(subject: SimulatedTab, limit: number): number {
  for (let presses = 1; presses <= limit; presses += 1) {
    subject.perform("back");
    if (subject.pathname === STEP_ONE) return presses;
  }
  return Number.POSITIVE_INFINITY;
}

beforeEach(() => {
  previousTab = null;
  vi.useFakeTimers();
  replaceStateUnspied = window.history.replaceState.bind(window.history);
  forgetEditorOrigin();
  useConfiguratorStore.setState({ designId: DESIGN, hasBeenEdited: false });
  host = document.createElement("div");
  document.body.append(host);
  vi.spyOn(window.history, "pushState").mockImplementation((state) => {
    tab.capturePush(state);
  });
  vi.spyOn(window.history, "back").mockImplementation(() => {
    tab.queueTraversal(-1);
  });
  vi.spyOn(window.history, "forward").mockImplementation(() => {
    tab.queueTraversal(1);
  });
});

afterEach(() => {
  tab.unmount();
  host.remove();
  forgetEditorOrigin();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const BASIC_ACTIONS: readonly Action[] = [
  "back",
  "forward",
  "stay",
  "confirm",
  "reload",
  "edit",
  "refusedCommand",
];

/** Back, Stay and Forward weighted up: a uniform draw spends most runs away from the question
 *  (measured: 38 of 917 steps with it open), and the question is where the traps would be. */
const sequenceOf = (actions: readonly Action[]) =>
  fc.array(
    fc.oneof(
      ...actions.map((action) => ({
        arbitrary: fc.constant(action),
        weight: ["back", "stay", "forward", "confirm"].includes(action) ? 3 : 1,
      })),
    ),
    { minLength: 1, maxLength: 40 },
  );

describe("the model is live, so the properties below cannot pass vacuously", () => {
  it("pushes the guard on an edit, asks on Back with the URL unmoved, and Stay restores it", () => {
    const subject = openTab(false);

    subject.perform("edit");
    expect(subject.guardCount).toBe(1);
    subject.perform("back");
    expect(subject.isAsking).toBe(true);
    expect(subject.pathname).toBe(EDITOR_RO);
    subject.perform("stay");
    expect(subject.isAsking).toBe(false);
    expect(isGuardEntryState(subject.entries[subject.index]?.state)).toBe(true);
    subject.perform("back");
    subject.perform("confirm");

    expect(subject.pathname).toBe(STEP_ONE);
  });

  it("Confirm passes an older-language entry through the remount and its catch-up timer", () => {
    const subject = openTab(true);
    subject.perform("switchLanguage");
    subject.perform("edit");
    subject.perform("back");
    expect(subject.isAsking).toBe(true);

    subject.perform("confirm");

    expect(subject.pathname).toBe(STEP_ONE);
  });
});

describe.each([
  ["", false],
  [" under StrictMode", true],
])("the guard over random sequences%s", (_label, isStrict) => {
  it("never holds two guard entries, and never asks anywhere but on the editor", () => {
    fc.assert(
      fc.property(
        sequenceOf([...BASIC_ACTIONS, "switchLanguage"]),
        (actions) => {
          const subject = openTab(isStrict);
          for (const action of actions) {
            subject.perform(action);
            expect(subject.guardCount).toBeLessThanOrEqual(1);
            if (subject.isAsking) expect(subject.isEditor).toBe(true);
          }
          subject.unmount();
        },
      ),
      { numRuns: 1500 },
    );
  });

  it("criterion 2: after any sequence of Back, Forward, Stay, Confirm, reload and edits, Step 1 is at most two Backs away", () => {
    fc.assert(
      fc.property(sequenceOf(BASIC_ACTIONS), (actions) => {
        const subject = openTab(isStrict);
        for (const action of actions) subject.perform(action);

        if (subject.isEditor) {
          expect(backPressesToStepOne(subject, 5)).toBeLessThanOrEqual(2);
        }
        subject.unmount();
      }),
      { numRuns: 2000 },
    );
  });

  it("Confirm, whenever the question is open, lands on Step 1 and nowhere else", () => {
    fc.assert(
      fc.property(
        sequenceOf([...BASIC_ACTIONS, "switchLanguage"]),
        (actions) => {
          const subject = openTab(isStrict);
          for (const action of actions) {
            if (action === "confirm" && subject.isAsking) {
              subject.perform("confirm");
              expect(subject.pathname).toBe(STEP_ONE);
              expect(subject.isAsking).toBe(false);
            } else {
              subject.perform(action);
            }
          }
          subject.unmount();
        },
      ),
      { numRuns: 10000 },
    );
  });

  it("a kitchen nobody edited never asks, whatever else happens (refusals are not edits)", () => {
    fc.assert(
      fc.property(
        sequenceOf(
          BASIC_ACTIONS.filter((action) => action !== "edit").concat(
            "switchLanguage",
          ),
        ),
        (actions) => {
          const subject = openTab(isStrict);
          for (const action of actions) {
            subject.perform(action);
            expect(subject.isAsking).toBe(false);
            expect(subject.guardCount).toBe(0);
          }
          subject.unmount();
        },
      ),
      { numRuns: 1500 },
    );
  });

  it("Forward never opens the question", () => {
    fc.assert(
      fc.property(
        sequenceOf([...BASIC_ACTIONS, "switchLanguage"]),
        (actions) => {
          const subject = openTab(isStrict);
          for (const action of actions) subject.perform(action);
          const wasAsking = subject.isAsking;

          subject.perform("forward");

          if (!wasAsking) expect(subject.isAsking).toBe(false);
          subject.unmount();
        },
      ),
      { numRuns: 1500 },
    );
  });

  it("with language switches too, Back alone always reaches Step 1 — it is never absorbed for good", () => {
    fc.assert(
      fc.property(
        sequenceOf([...BASIC_ACTIONS, "switchLanguage"]),
        (actions) => {
          const subject = openTab(isStrict);
          for (const action of actions) subject.perform(action);

          if (subject.isEditor) {
            const limit = subject.entries.length + 1;
            expect(backPressesToStepOne(subject, limit)).toBeLessThan(
              Number.POSITIVE_INFINITY,
            );
          }
          subject.unmount();
        },
      ),
      { numRuns: 2000 },
    );
  });
});

/** Sequences the property above once failed on (review of C1 S4, B1), replayed so the fix cannot pass
 *  by luck of the draw. Each is run as the property runs it: a Confirm pressed with the question open
 *  must land on Step 1. */
const COUNTEREXAMPLES: readonly (readonly [string, readonly Action[]])[] = [
  [
    "two switches back to the first language, then Confirm (an older entry shares the guarded pathname)",
    ["switchLanguage", "switchLanguage", "edit", "back", "confirm"],
  ],
  [
    // The review printed this without its edit: the guard it asked on was a `hasBeenEdited` left over
    // from an earlier run (see `openTab`). With the edit written in, it is the sequence it meant.
    "an edit, Back, Forward, Confirm, Forward, a reload, then Confirm again",
    [
      "edit",
      "back",
      "forward",
      "refusedCommand",
      "confirm",
      "forward",
      "reload",
      "confirm",
      "refusedCommand",
      "confirm",
    ],
  ],
  [
    "Forward, Stay, two switches, an edit, Confirm, Back, Confirm",
    [
      "forward",
      "stay",
      "switchLanguage",
      "switchLanguage",
      "edit",
      "confirm",
      "back",
      "confirm",
    ],
  ],
];

describe.each([
  ["", false],
  [" under StrictMode", true],
])("the review's counterexamples%s", (_label, isStrict) => {
  it.each(COUNTEREXAMPLES)("%s", (_name, actions) => {
    const subject = openTab(isStrict);
    for (const action of actions) {
      if (action === "confirm" && subject.isAsking) {
        subject.perform("confirm");
        expect(subject.pathname).toBe(STEP_ONE);
        expect(subject.isAsking).toBe(false);
      } else {
        subject.perform(action);
      }
    }
    subject.unmount();
  });
});

describe("the back links' own question, open when Back is pressed", () => {
  it("criterion 2: with that dialog open, two Backs still reach Step 1", () => {
    const subject = openTab(false);
    subject.perform("edit");
    subject.perform("openLinkQuestion");
    expect(subject.guardCount).toBe(1);

    const presses = backPressesToStepOne(subject, 4);

    expect(
      presses,
      "Back is absorbed for as long as the link's dialog is open",
    ).toBeLessThanOrEqual(2);
  });

  it("never opens the Back question on top of it", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<Action>("back", "forward", "stay"), {
          maxLength: 12,
        }),
        (actions) => {
          const subject = openTab(false);
          subject.perform("edit");
          subject.perform("openLinkQuestion");
          for (const action of actions) {
            subject.perform(action);
            if (subject.isLinkQuestionOpen) {
              expect(subject.isAsking).toBe(false);
            }
          }
          subject.unmount();
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("a language switch after the guard (observation, not criterion 2's list)", () => {
  it("counts the Backs from the switched editor to Step 1", () => {
    const subject = openTab(false);
    subject.perform("edit");
    subject.perform("switchLanguage");

    const presses = backPressesToStepOne(subject, 6);

    // Pinned at what is built so a change is seen: Back lands on the guard silently (the language
    // reverts), the second asks, the third leaves. See the QA report.
    expect(presses).toBe(3);
  });
});
