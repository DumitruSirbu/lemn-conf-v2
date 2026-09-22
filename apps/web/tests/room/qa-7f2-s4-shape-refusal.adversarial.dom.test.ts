// @vitest-environment happy-dom
//
// **Adversarial QA for M7 wave 7F2, slice S4 — the shape refusal.** What `room-screen.dom.test.ts`
// asserts by example is attacked here over sequences and hostile arrivals:
//
// - **Criterion 9, independence.** Whatever the customer types, pauses on, chooses or traverses to,
//   and under four policies (approved, ADR 0116's two fabricated ones, and one that stops building
//   L), the refusal is on screen exactly when the policy does not build the shape on screen.
// - **One sentence, one region.** The refusal is said once in the document, from a region that is
//   never replaced, and every chip that describes itself by it points at a node that exists.
// - **Criterion 10.** The linear suggestion is absent on every step of every sequence.
// - **What a chip tap announces**, counted region by region.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  type BuildableShapes,
  type LWallBounds,
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
import { OneCStatus } from "@/room/one-c-status";
import { URL_SETTLE_MS } from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";
import { requiredFieldsFor } from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import {
  CATALOGUES,
  requireLeafAt,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";

const REFUSAL = "room-shape-refusal";
const REFUSAL_STATUS = "room-shape-refusal-status";
const ONE_C_STATUS = "room-one-c-status";
const SUGGESTION = "room-linear-suggestion";
const SHAPES: readonly RoomShape[] = ["linear", "L", "U"];

const A_VALID_ROOM = "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left";
const A_FILLED_U =
  "shape=U&wallA=3.6&wallB=2.4&wallC=2.4&height=2.6&direction=left";
const A_FILLED_LINEAR = "shape=linear&wallA=3.6&height=2.6";

// ---------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let screenPolicy: RoomPolicy = APPROVED_ROOM_POLICY;
let screenMessages: Catalogue = roMessages;
let screenLocale: CatalogueLocale = "ro";

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
    locale: screenLocale,
    messages: screenMessages,
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
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`${testId} is not an input`);
  }
  return input;
}

function continueButton(): HTMLButtonElement {
  const cta = elementAt("room-continue");
  if (!(cta instanceof HTMLButtonElement))
    throw new Error("Continue is not a button");
  return cta;
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

function isRefusalShown(): boolean {
  return maybeAt(REFUSAL) !== null;
}

function shapeSentence(): string {
  return requireLeafAt(screenMessages, "room.issue.shapeNotBuildable");
}

/** How many elements in the document say the refusal's sentence. */
function timesTheRefusalIsSaid(): number {
  const sentence = shapeSentence();
  return [...container.querySelectorAll("p")].filter(
    (paragraph) => paragraph.textContent === sentence,
  ).length;
}

function shapeOnScreen(): RoomShape {
  const chosen = SHAPES.find(
    (shape) => inputAt(`room-shape-chip-control-${shape}`).checked,
  );
  if (chosen === undefined) throw new Error("no chip is chosen");
  return chosen;
}

/** The chips' descriptions (coordinator ruling R1.2, 2026-09-22): while the chosen shape is refused,
 *  **exactly the chosen chip** is described by the refusal — an id that resolves, never a dangling
 *  one — because the sentence says *"this shape"*; no other chip, and no chip at all otherwise. */
function expectTheChipsDescribedByTheRefusal(
  isRefused: boolean,
  detail: string,
): void {
  const chosen = shapeOnScreen();
  for (const shape of SHAPES) {
    const describedBy = inputAt(
      `room-shape-chip-control-${shape}`,
    ).getAttribute("aria-describedby");
    if (!isRefused || shape !== chosen) {
      expect(describedBy, `${shape} ${detail}`).toBe(null);
      continue;
    }
    expect(describedBy, `${shape} ${detail}`).toBe(elementAt(REFUSAL).id);
    expect(document.getElementById(describedBy ?? ""), detail).toBe(
      elementAt(REFUSAL),
    );
  }
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
  screenMessages = roMessages;
  screenLocale = "ro";
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
// Policies — ADR 0116's fabricated shape, plus one that stops building L
// ---------------------------------------------------------------------------------------------

function approvedLWallBounds(): LWallBounds {
  const bounds = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (bounds === undefined)
    throw new Error("the approved policy states no L bounds");
  return bounds;
}

function policyAlsoStating(shape: RoomShape): RoomPolicy {
  return {
    ...APPROVED_ROOM_POLICY,
    buildableShapes: {
      ...APPROVED_ROOM_POLICY.buildableShapes,
      [shape]: approvedLWallBounds(),
    } as BuildableShapes,
  };
}

/** The approved policy with L withdrawn: criterion 9's ↑ sabotage (`shape !== "L"`) in reverse. */
const POLICY_BUILDING_NOTHING: RoomPolicy = {
  ...APPROVED_ROOM_POLICY,
  buildableShapes: {} as BuildableShapes,
};

const POLICIES: readonly (readonly [string, RoomPolicy])[] = [
  ["approved", APPROVED_ROOM_POLICY],
  ["also stating U", policyAlsoStating("U")],
  ["also stating linear", policyAlsoStating("linear")],
  ["building nothing", POLICY_BUILDING_NOTHING],
];

// ---------------------------------------------------------------------------------------------
// Criterion 9 — independent of the fields, at every step of every sequence
// ---------------------------------------------------------------------------------------------

const TEXTS = ["", "abc", "8", "800", "2600", "3600", "6500", "2"] as const;

const ARRIVALS = [
  A_VALID_ROOM,
  A_FILLED_U,
  A_FILLED_LINEAR,
  "shape=U&direction=right",
  "shape=linear",
  "shape=L&wallA=0.8&wallB=0.8&height=2&direction=left",
  "shape=U&wallA=0.8&wallB=abc&wallC=9&height=2&direction=left",
];

type Step =
  | {
      readonly kind: "type";
      readonly field: RoomLengthField;
      readonly text: string;
    }
  | { readonly kind: "wait"; readonly milliseconds: number }
  | { readonly kind: "chip"; readonly shape: RoomShape }
  | { readonly kind: "corner"; readonly direction: "left" | "right" }
  | { readonly kind: "arrive"; readonly search: string };

const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 4,
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
      kind: fc.constant("corner" as const),
      direction: fc.constantFrom("left" as const, "right" as const),
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
  } else if (step.kind === "corner") {
    if (maybeAt(`room-corner-control-${step.direction}`) === null) return;
    click(`room-corner-control-${step.direction}`);
  } else {
    arriveAt(step.search);
  }
}

describe("the refusal follows the shape on screen and nothing else (criterion 9), over sequences", () => {
  it.each(POLICIES)(
    "is shown exactly when the policy does not build the chosen shape, said once, from one region, with no linear suggestion — policy %s",
    (_, policy) => {
      fc.assert(
        fc.property(
          fc.constantFrom(A_VALID_ROOM, A_FILLED_U, "shape=linear"),
          fc.array(stepArbitrary, { minLength: 1, maxLength: 12 }),
          (start, steps) => {
            act(() => {
              root.unmount();
            });
            root = createRoot(container);
            render(start, policy);
            const region = elementAt(REFUSAL_STATUS);

            for (const step of steps) {
              runStep(step);

              const shape = shapeOnScreen();
              const isRefused = !isShapeBuildable(shape, policy);
              const detail = JSON.stringify({ start, steps, step, shape });
              expect(isRefusalShown(), detail).toBe(isRefused);
              expect(timesTheRefusalIsSaid(), detail).toBe(isRefused ? 1 : 0);
              expect(elementAt(REFUSAL_STATUS), detail).toBe(region);
              expect(region.getAttribute("role"), detail).toBe("status");
              expectTheChipsDescribedByTheRefusal(isRefused, detail);
              expect(maybeAt(SUGGESTION), detail).toBe(null);
            }
          },
        ),
        { numRuns: 80 },
      );
    },
  );
});

describe("a deep link is refused on its first frame, whatever its fields hold", () => {
  it.each([
    ["an empty U", "shape=U"],
    ["an empty straight room", "shape=linear"],
    ["a filled U", A_FILLED_U],
    ["a filled straight room", A_FILLED_LINEAR],
    [
      "a U with every field out of range",
      "shape=U&wallA=0.1&wallB=9&wallC=0.1&height=9&direction=right",
    ],
    [
      "a U with unreadable and repeated fields",
      "shape=U&wallA=abc&wallB=2.4&wallB=3&height=-1",
    ],
    ["a straight room far out of range", "shape=linear&wallA=99&height=0.5"],
  ])("refuses %s, marks no field and suggests nothing", (_, search) => {
    render(search);

    expect(isRefusalShown()).toBe(true);
    expect(timesTheRefusalIsSaid()).toBe(1);
    expect(container.querySelector("[aria-invalid='true']")).toBe(null);
    expect(
      container.querySelector("[data-testid^='room-length-reason-']"),
    ).toBe(null);
    expect(maybeAt(SUGGESTION)).toBe(null);
    expect(continueButton().disabled).toBe(true);
  });
});

describe("a traversal mid-burst is refused or cleared on the frame it lands", () => {
  it("refuses the U a Back lands on while the customer was typing an L, and clears on the way back", () => {
    render(A_VALID_ROOM);
    type("wallA", "8");

    arriveAt(A_FILLED_U);

    expect(isRefusalShown()).toBe(true);

    arriveAt(A_VALID_ROOM);

    expect(isRefusalShown()).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 9's fabricated arm, and its mirror, at 1A
// ---------------------------------------------------------------------------------------------

describe("at 1A the refusal is the policy's, with no component edit (criterion 9, fabricated arm)", () => {
  it.each(POLICIES)(
    "follows every card chosen in turn — policy %s",
    (_, policy) => {
      render("", policy);
      const region = elementAt(REFUSAL_STATUS);
      expect(region.childNodes).toHaveLength(0);

      for (const shape of ["U", "L", "linear", "U", "U", "L"] as const) {
        click(`room-shape-${shape}`);

        const isRefused = !isShapeBuildable(shape, policy);
        expect(isRefusalShown(), shape).toBe(isRefused);
        expect(elementAt(REFUSAL_STATUS), shape).toBe(region);
        expect(
          elementAt("room-shapes").getAttribute("aria-describedby"),
          shape,
        ).toBe(isRefused ? elementAt(REFUSAL).id : null);
        expect(continueButton().disabled, shape).toBe(isRefused);
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Announcements — which regions a chip tap changes
// ---------------------------------------------------------------------------------------------

/** The live regions whose content a gesture changed, by test id. */
function regionsChangedBy(gesture: () => void): readonly string[] {
  const snapshot = (): Record<string, string> =>
    Object.fromEntries(
      [...container.querySelectorAll("[role='status']")].map((region) => [
        region.getAttribute("data-testid") ?? "",
        region.innerHTML,
      ]),
    );
  const before = snapshot();
  gesture();
  const after = snapshot();
  return Object.keys(after).filter(
    (testId) => after[testId] !== before[testId],
  );
}

describe("what a chip tap announces", () => {
  it("replaces the sentence node — so it is announced again — when one refused chip is swapped for the other", () => {
    render("shape=U&direction=left");
    const sentence = elementAt(REFUSAL);

    click("room-shape-chip-control-linear");

    expect(elementAt(REFUSAL)).not.toBe(sentence);
    expect(elementAt(REFUSAL).textContent).toBe(sentence.textContent);
  });

  it("empties and refills the same region on refused, then L, then refused", () => {
    render("shape=U&direction=left");
    const region = elementAt(REFUSAL_STATUS);

    click("room-shape-chip-control-L");
    expect(region.childNodes).toHaveLength(0);
    click("room-shape-chip-control-U");

    expect(elementAt(REFUSAL_STATUS)).toBe(region);
    expect(isRefusalShown()).toBe(true);
  });

  it("changes both live regions on one tap from a valid L whose walls fill a U: the refusal and the note", () => {
    // Pinned as observed: one tap queues two polite announcements, the refusal's sentence and the
    // note. They say different things, and neither region repeats the other's sentence.
    render(A_FILLED_U);
    click("room-shape-chip-control-L");
    expect(isRefusalShown()).toBe(false);
    expect(maybeAt("room-presets-after-valid")).toBe(null);

    const changed = regionsChangedBy(() => {
      click("room-shape-chip-control-U");
    });

    expect([...changed].sort()).toEqual([ONE_C_STATUS, REFUSAL_STATUS].sort());
    expect(elementAt(ONE_C_STATUS).textContent).not.toContain(shapeSentence());
  });

  it("changes only the refusal region on a tap to an empty U, which is 1B", () => {
    render(A_VALID_ROOM);

    const changed = regionsChangedBy(() => {
      click("room-shape-chip-control-U");
    });

    expect(changed).toEqual([REFUSAL_STATUS]);
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 2 in Russian as well, and the region in both locales
// ---------------------------------------------------------------------------------------------

function russianCatalogue(): readonly [CatalogueLocale, Catalogue] {
  const russian = CATALOGUES.find(([locale]) => locale === "ru");
  if (russian === undefined) throw new Error("no Russian catalogue");
  return russian;
}

describe("the refusal in Russian", () => {
  it("draws the Russian sentence once, under the chips, for a filled straight room", () => {
    const [locale, messages] = russianCatalogue();
    screenMessages = messages;
    screenLocale = locale;
    render(A_FILLED_LINEAR);

    expect(elementAt(REFUSAL).textContent).toBe(
      requireLeafAt(screenMessages, "room.issue.shapeNotBuildable"),
    );
    expect(timesTheRefusalIsSaid()).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 10's drawing, switched on by hand — the gate itself is the node file's
// ---------------------------------------------------------------------------------------------

describe("the linear suggestion, once the domain turns it on (section 8)", () => {
  it("is drawn once, inside 1C's status region, after the room's reason and before the note", () => {
    act(() => {
      root.render(
        createElement(NextIntlClientProvider, {
          children: createElement(OneCStatus, {
            roomReasons: ["room.issue.roomTooSmall"],
            isLinearSuggested: true,
            isNoteShown: true,
            noteId: "the-note",
          }),
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
        }),
      );
    });

    const region = elementAt(ONE_C_STATUS);
    expect(
      [...region.children].map((child) => child.getAttribute("data-testid")),
    ).toEqual(["room-room-reason", SUGGESTION, "room-presets-after-valid"]);
    expect(elementAt(SUGGESTION).textContent).toBe(
      requireLeafAt(roMessages, "room.issue.orChooseLinear"),
    );
  });
});
