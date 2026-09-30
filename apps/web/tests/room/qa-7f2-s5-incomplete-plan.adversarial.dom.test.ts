// @vitest-environment happy-dom
//
// **Adversarial QA — wave 7F2 slice S5, the incomplete plan on the screen.**
//
// The model file proves the plan and the parser agree about a missing wall. This file drives the
// real `RoomScreen` — chips, keystrokes, pauses, deep links and the URL echo — and after every step
// reads what is painted:
//
// - the card draws bars exactly when every wall the chosen chip asks for reads as a length in its
//   input, and then exactly that shape's walls;
// - no field reason, `aria-invalid`, red bar, room reason or 1C note is on screen while the plan is
//   empty;
// - the plan box never changes size.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
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

import { parseMillimetres } from "@/room/parse-millimetres";
import type { RoomLengthField } from "@/room/room-draft";
import { URL_SETTLE_MS } from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";
import { requiredFieldsFor } from "@/room/room-url-state";

import { CATALOGUES } from "../support/catalogues";
import { policyWithoutU } from "../support/policy-without-u";

const SHAPES: readonly RoomShape[] = ["linear", "L", "U"];
const WALL_FIELDS: readonly RoomLengthField[] = ["wallA", "wallB", "wallC"];
const LETTER_OF_FIELD: Readonly<Record<string, string>> = {
  wallA: "A",
  wallB: "B",
  wallC: "C",
};
const MARKED_FILL = "var(--plan-wall-issue)";

const A_FILLED_L = "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left";
const A_FILLED_U =
  "shape=U&wallA=3.6&wallB=2.4&wallC=1.2&height=2.6&direction=right";
const A_ONE_C_L = "shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left";

// ---------------------------------------------------------------------------------------------
// Harness — `qa-7f2-s4-shape-refusal.adversarial.dom.test.ts`'s, restated
// ---------------------------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let screenPolicy: RoomPolicy = APPROVED_ROOM_POLICY;

function theScreen(): ReactElement {
  return createElement(NextIntlClientProvider, {
    children: createElement(RoomScreen, { policy: screenPolicy }),
    locale: CATALOGUES[0][0],
    messages: CATALOGUES[0][1],
    timeZone: "Europe/Chisinau",
  });
}

function arriveAt(search: string): void {
  browser.search = new URLSearchParams(search).toString();
  act(() => {
    root.render(theScreen());
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

function type(field: RoomLengthField, text: string): void {
  act(() => {
    const input = inputAt(`room-length-${field}`);
    Reflect.set(HTMLInputElement.prototype, "value", text, input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(testId: string): void {
  act(() => {
    elementAt(testId).click();
  });
}

function advance(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function shapeOnScreen(): RoomShape {
  const chosen = SHAPES.find(
    (shape) => inputAt(`room-shape-chip-control-${shape}`).checked,
  );
  if (chosen === undefined) throw new Error("no chip is chosen");
  return chosen;
}

function paintedBars(): readonly Element[] {
  return [...elementAt("room-plan").querySelectorAll("rect")];
}

function paintedLabelLetters(): readonly string[] {
  return [
    ...elementAt("room-plan").querySelectorAll<HTMLElement>(
      '[data-testid^="room-plan-label-"]',
    ),
  ].map((label) =>
    (label.dataset.testid ?? "").replace("room-plan-label-", ""),
  );
}

/** The walls the chip on screen asks for, read off the inputs as the customer sees them. */
function wallsAskedFor(): readonly RoomLengthField[] {
  return requiredFieldsFor(shapeOnScreen()).filter((field) =>
    WALL_FIELDS.includes(field),
  );
}

function everyAskedWallReads(): boolean {
  return wallsAskedFor().every(
    (field) => parseMillimetres(inputAt(`room-length-${field}`).value).ok,
  );
}

function oneCSurfacesOnScreen(): readonly string[] {
  const shown: string[] = [];
  if (container.querySelector("[data-testid^='room-length-reason-']"))
    shown.push("a field reason");
  if (container.querySelector("[aria-invalid='true']"))
    shown.push("aria-invalid");
  if (paintedBars().some((bar) => bar.getAttribute("fill") === MARKED_FILL))
    shown.push("a red bar");
  if (maybeAt("room-room-reason")) shown.push("a room reason");
  if (maybeAt("room-presets-after-valid")) shown.push("the 1C note");
  return shown;
}

function planBoxStyle(): string | null {
  return elementAt("room-plan-box").getAttribute("style");
}

function expectThePlanToMatchTheInputs(detail: string): void {
  if (!everyAskedWallReads()) {
    expect(paintedBars(), detail).toHaveLength(0);
    expect(paintedLabelLetters(), detail).toEqual([]);
    expect(oneCSurfacesOnScreen(), detail).toEqual([]);
    return;
  }
  const letters = wallsAskedFor().map((field) => LETTER_OF_FIELD[field]);
  expect(paintedBars(), detail).toHaveLength(letters.length);
  expect(paintedLabelLetters(), detail).toEqual(letters);
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
// Sequences
// ---------------------------------------------------------------------------------------------

const TEXTS = [
  "",
  "0",
  "000",
  "3,6",
  "3600mm",
  "8",
  "450",
  "2600",
  "3600",
  "6500",
  "12345678901234567",
] as const;

const ARRIVALS = [
  A_FILLED_L,
  A_FILLED_U,
  A_ONE_C_L,
  "shape=U&wallA=3.6&wallB=2.4&height=2.6&direction=left",
  "shape=L&wallA=3.6&wallC=2.4&height=2.6&direction=left",
  "shape=linear&wallA=3.6&height=2.6",
  "shape=L&wallA=abc&wallB=2.4&height=2.6&direction=left",
];

type Step =
  | {
      readonly kind: "type";
      readonly field: RoomLengthField;
      readonly text: string;
    }
  | { readonly kind: "wait"; readonly milliseconds: number }
  | { readonly kind: "chip"; readonly shape: RoomShape }
  | { readonly kind: "arrive"; readonly search: string };

const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant("type" as const),
      field: fc.constantFrom<RoomLengthField>(
        "wallA",
        "wallB",
        "wallC",
        "height",
      ),
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
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant("chip" as const),
      shape: fc.constantFrom(...SHAPES),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("arrive" as const),
      search: fc.constantFrom(...ARRIVALS),
    }),
  },
);

function runStep(step: Step): void {
  if (step.kind === "type") {
    if (!requiredFieldsFor(shapeOnScreen()).includes(step.field)) return;
    type(step.field, step.text);
  } else if (step.kind === "wait") {
    advance(step.milliseconds);
  } else if (step.kind === "chip") {
    click(`room-shape-chip-control-${step.shape}`);
  } else {
    arriveAt(step.search);
  }
}

describe("the painted plan follows the inputs on screen at every step", () => {
  it("draws the chip's whole shape or nothing, shows no 1C beside nothing, and keeps its box", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(A_FILLED_L, A_FILLED_U, A_ONE_C_L, "shape=L"),
        fc.array(stepArbitrary, { minLength: 1, maxLength: 14 }),
        (start, steps) => {
          act(() => {
            root.unmount();
          });
          root = createRoot(container);
          arriveAt(start);
          const box = planBoxStyle();

          for (const step of steps) {
            runStep(step);
            const detail = JSON.stringify({ start, steps, step });

            expectThePlanToMatchTheInputs(detail);
            expect(planBoxStyle(), detail).toBe(box);
          }
        },
      ),
      { numRuns: 120 },
    );
  });
});

describe("a chip switched with values present", () => {
  it("empties the plan when a filled L is switched to U with wall C empty, at once and after the pause", () => {
    arriveAt(A_FILLED_L);
    expect(paintedBars()).toHaveLength(2);

    click("room-shape-chip-control-U");
    expect(paintedBars()).toHaveLength(0);
    advance(1000);
    expect(paintedBars()).toHaveLength(0);
    expect(inputAt("room-length-wallA").value).toBe("3600");
  });

  it("draws a filled U switched to L as A and B only", () => {
    arriveAt(A_FILLED_U);
    expect(paintedLabelLetters()).toEqual(["A", "B", "C"]);

    click("room-shape-chip-control-L");
    advance(1000);

    expect(paintedLabelLetters()).toEqual(["A", "B"]);
    expect(paintedBars()).toHaveLength(2);
  });

  it("empties a linear room switched to L while wall B is empty", () => {
    arriveAt("shape=linear&wallA=3.6&height=2.6");
    expect(paintedLabelLetters()).toEqual(["A"]);

    click("room-shape-chip-control-L");

    expect(paintedBars()).toHaveLength(0);
  });

  it("empties mid-burst: a keystroke into wall B, then the U chip before the pause ends", () => {
    arriveAt(A_FILLED_L);
    type("wallB", "240");
    click("room-shape-chip-control-U");

    expect(paintedBars()).toHaveLength(0);
    expect(oneCSurfacesOnScreen()).toEqual([]);
    advance(50);
    expect(paintedBars()).toHaveLength(0);

    type("wallC", "1200");
    expect(paintedLabelLetters()).toEqual(["A", "B", "C"]);
  });
});

describe("1C never stands beside an empty plan", () => {
  it.each(["wallA", "wallB"] as const)(
    "clears the red wall and the reasons once %s of a 1C room is emptied, mid-burst and after",
    (field) => {
      arriveAt(A_ONE_C_L);
      advance(1000);
      expect(oneCSurfacesOnScreen()).toContain("a red bar");

      type(field, "");
      expect(paintedBars()).toHaveLength(0);
      expect(oneCSurfacesOnScreen()).toEqual([]);

      advance(1000);
      expect(oneCSurfacesOnScreen()).toEqual([]);
    },
  );

  // Census W19: the approved policy states the U (M7B U6), so this room is field-judged there — see
  // the next test — and the shape refusal is read under a policy that states no U.
  it("shows a filled U's refusal with the plan drawn, and with the plan empty once C is cleared, marking nothing", () => {
    screenPolicy = policyWithoutU();
    arriveAt("shape=U&wallA=0.8&wallB=7&wallC=0.05&height=1.5&direction=left");
    expect(paintedBars()).toHaveLength(3);
    expect(maybeAt("room-shape-refusal")).not.toBeNull();
    // A filled U is 1C on its shape, so frame 1C's note is correctly shown (criterion 11); its fields
    // are not judged, so nothing else of 1C is.
    expect(oneCSurfacesOnScreen()).toEqual(["the 1C note"]);

    type("wallC", "");

    expect(paintedBars()).toHaveLength(0);
    expect(maybeAt("room-shape-refusal")).not.toBeNull();
    expect(oneCSurfacesOnScreen()).toEqual([]);
  });

  it("judges the same U field by field under the approved policy, and shows none of 1C once C is cleared", () => {
    arriveAt("shape=U&wallA=0.8&wallB=7&wallC=0.05&height=1.5&direction=left");
    expect(paintedBars()).toHaveLength(3);
    expect(maybeAt("room-shape-refusal")).toBeNull();
    expect(oneCSurfacesOnScreen()).toEqual([
      "a field reason",
      "aria-invalid",
      "a red bar",
      "the 1C note",
    ]);

    type("wallC", "");

    expect(paintedBars()).toHaveLength(0);
    expect(oneCSurfacesOnScreen()).toEqual([]);
  });
});
