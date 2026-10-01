// @vitest-environment happy-dom
//
// **Adversarial QA for M7 wave 7J, criterion A13 — Step 1 with a real straight kitchen.** Every
// suggestion oracle S5 restated derives its expectation from `validateRoomInput` itself, and the one
// positive arm with a literal `true` (`qa-7f2-s4-shape-refusal.adversarial.test.ts`) mocks the
// domain. So a `validateLinearRoom` that refused everything would pass all of them. Here:
//
// - **7F2's positive arm, by name, against the real domain**, with literal expectations at wall A's
//   1199 / 1200 / 6000 / 6001 transitions and a ceiling outside the range;
// - **the invariant S5 dropped from the random-walk sweep**, restated narrowly: while the shape is
//   refused, or while the straight chip itself is chosen, the suggestion is never drawn;
// - **the deep link S5 deleted** (`shape=linear&wallA=99&height=0.5`) at what it now is — a field
//   refusal, not a shape refusal;
// - **a hostile straight deep link** carrying `wallB` and `direction=right`.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  type RoomPolicy,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
  useSearchParams: () => new URLSearchParams(browser.search),
  useRouter: () => ({
    push: browser.push,
    replace: browser.replace,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import type { RoomLengthField } from "@/room/room-draft";
import { URL_SETTLE_MS } from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";
import { requiredFieldsFor } from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";

const REFUSAL = "room-shape-refusal";
const SUGGESTION = "room-linear-suggestion";
const SHAPES: readonly RoomShape[] = ["linear", "L", "U"];

let container: HTMLDivElement;
let root: Root;
let screenPolicy: RoomPolicy = APPROVED_ROOM_POLICY;

function render(
  search: string,
  policy: RoomPolicy = APPROVED_ROOM_POLICY,
): void {
  screenPolicy = policy;
  arriveAt(search);
}

function arriveAt(search: string): void {
  browser.search = new URLSearchParams(search).toString();
  act(() => {
    root.render(theScreen());
  });
}

function theScreen(): ReactElement {
  return createElement(NextIntlClientProvider, {
    children: createElement(RoomScreen, { policy: screenPolicy }),
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
  });
}

function searchOf(href: string): string {
  const questionMark = href.indexOf("?");
  return questionMark === -1 ? "" : href.slice(questionMark + 1);
}

function maybeAt(testId: string): HTMLElement | null {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  return element instanceof HTMLElement ? element : null;
}

function elementAt(testId: string): HTMLElement {
  const element = maybeAt(testId);
  if (element === null) throw new Error(`the screen draws no ${testId}`);
  return element;
}

function inputAt(testId: string): HTMLInputElement {
  const input = elementAt(testId);
  if (!(input instanceof HTMLInputElement))
    throw new Error(`${testId} is not an input`);
  return input;
}

function continueButton(): HTMLButtonElement {
  const cta = elementAt("room-continue");
  if (!(cta instanceof HTMLButtonElement))
    throw new Error("Continue is not a button");
  return cta;
}

function substate(): string | null {
  return (
    container
      .querySelector("main[data-room-substate]")
      ?.getAttribute("data-room-substate") ?? null
  );
}

function markedFields(): readonly string[] {
  return [...container.querySelectorAll("[aria-invalid='true']")].map(
    (field) => field.getAttribute("data-testid") ?? "",
  );
}

function shapeOnScreen(): RoomShape {
  const chosen = SHAPES.find(
    (shape) => inputAt(`room-shape-chip-control-${shape}`).checked,
  );
  if (chosen === undefined) throw new Error("no chip is chosen");
  return chosen;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  browser.push.mockClear();
  browser.replace.mockClear();
  browser.replace.mockImplementation((href: string) => {
    arriveAt(searchOf(href));
  });
  browser.search = "";
  screenPolicy = APPROVED_ROOM_POLICY;
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

// ---------------------------------------------------------------------------------------------
// 7F2's positive arm, by name, against the real domain
// ---------------------------------------------------------------------------------------------

/** An L whose wall B (450 mm) is too short, so 1C always has a field reason. */
function shortWallBL(wallA: string, height = "2.6"): string {
  return `shape=L&wallA=${wallA}&wallB=0.45&height=${height}&direction=left`;
}

describe("7J-A13 — the 1C suggestion to switch to a straight kitchen, positive arm by name", () => {
  it.each([
    ["1.2", true],
    ["3.6", true],
    ["6", true],
    ["1.199", false],
    ["6.001", false],
  ] as const)(
    "at wall A %s m with wall B too short, suggests the straight kitchen: %s",
    (wallA, isSuggested) => {
      render(shortWallBL(wallA));

      expect(substate()).toBe("1C");
      expect(maybeAt(SUGGESTION) !== null).toBe(isSuggested);
    },
  );

  it.each(["2.199", "3.901"])(
    "does not suggest it when the ceiling (%s m) refuses a straight room too",
    (height) => {
      render(shortWallBL("3.6", height));

      expect(substate()).toBe("1C");
      expect(maybeAt(SUGGESTION)).toBe(null);
    },
  );

  it("draws the suggestion with its catalogue sentence, beside the reason it is appended to", () => {
    render(shortWallBL("3.6"));

    expect(maybeAt("room-length-reason-wallB")).not.toBe(null);
    expect(elementAt(SUGGESTION).textContent).toContain(
      roMessages.room.issue.orChooseLinear,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The invariant S5 dropped from the random-walk sweep, restated narrowly
// ---------------------------------------------------------------------------------------------

const TEXTS = [
  "",
  "abc",
  "0.45",
  "1.199",
  "1.2",
  "2.6",
  "3.6",
  "6",
  "6.001",
  "9",
] as const;

type Step =
  | {
      readonly kind: "type";
      readonly field: RoomLengthField;
      readonly text: string;
    }
  | { readonly kind: "wait"; readonly milliseconds: number }
  | { readonly kind: "chip"; readonly shape: RoomShape };

const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("type" as const),
      field: fc.constantFrom<RoomLengthField>("wallA", "wallB", "height"),
      text: fc.constantFrom(...TEXTS),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("wait" as const),
      milliseconds: fc.constantFrom(50, URL_SETTLE_MS, 1000),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant("chip" as const),
      shape: fc.constantFrom(...SHAPES),
    }),
  },
);

function runStep(step: Step): void {
  if (step.kind === "type") {
    if (!requiredFieldsFor(shapeOnScreen()).includes(step.field)) return;
    act(() => {
      const input = inputAt(`room-length-${step.field}`);
      Reflect.set(HTMLInputElement.prototype, "value", step.text, input);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  } else if (step.kind === "wait") {
    act(() => {
      vi.advanceTimersByTime(step.milliseconds);
    });
  } else {
    act(() => {
      elementAt(`room-shape-chip-control-${step.shape}`).click();
    });
  }
}

describe("7J-A13 — the suggestion is never drawn beside a shape refusal, nor on the straight chip itself", () => {
  it("holds at every step of every sequence, from an L refused on wall B", () => {
    fc.assert(
      fc.property(
        fc.array(stepArbitrary, { minLength: 1, maxLength: 12 }),
        (steps) => {
          act(() => {
            root.unmount();
          });
          root = createRoot(container);
          render(shortWallBL("3.6"));

          for (const step of steps) {
            runStep(step);
            const shape = shapeOnScreen();
            const isSuggested = maybeAt(SUGGESTION) !== null;
            const detail = JSON.stringify({ steps, step, shape });

            if (!isShapeBuildable(shape, APPROVED_ROOM_POLICY)) {
              expect(isSuggested, detail).toBe(false);
            }
            if (shape === "linear") expect(isSuggested, detail).toBe(false);
            if (isSuggested) expect(maybeAt(REFUSAL), detail).toBe(null);
          }
        },
      ),
      { numRuns: 80 },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The deep links S5 deleted from the shape-refusal sweep, at what they are now
// ---------------------------------------------------------------------------------------------

describe("7J-A13 — a straight deep link is judged on its fields, never refused as a shape", () => {
  it("marks wall A and the height of shape=linear&wallA=99&height=0.5, draws no refusal and no suggestion", () => {
    render("shape=linear&wallA=99&height=0.5");

    expect(substate()).toBe("1C");
    expect(maybeAt(REFUSAL)).toBe(null);
    expect([...markedFields()].sort()).toEqual([
      "room-length-height",
      "room-length-wallA",
    ]);
    expect(maybeAt(SUGGESTION)).toBe(null);
    expect(continueButton().disabled).toBe(true);
  });

  it("opens an empty straight room at 1B with Continue unrefused and no wall B field", () => {
    render("shape=linear");

    expect(substate()).toBe("1B");
    expect(maybeAt(REFUSAL)).toBe(null);
    expect(maybeAt("room-length-wallB")).toBe(null);
  });

  it("reaches 1D for a straight link carrying a hostile wallB and direction=right, drawing neither", () => {
    render("shape=linear&wallA=3.7&height=2.6&wallB=0.1&direction=right");

    expect(substate()).toBe("1D");
    expect(maybeAt(REFUSAL)).toBe(null);
    expect(maybeAt("room-length-wallB")).toBe(null);
    expect(maybeAt("room-corner")).toBe(null);
    expect(continueButton().disabled).toBe(false);
  });

  it.each([
    ["1.199", "1C"],
    ["1.2", "1D"],
    ["6", "1D"],
    ["6.001", "1C"],
  ])("puts a straight wall A of %s m at %s", (wallA, expected) => {
    render(`shape=linear&wallA=${wallA}&height=2.6`);

    expect(substate()).toBe(expected);
  });
});
