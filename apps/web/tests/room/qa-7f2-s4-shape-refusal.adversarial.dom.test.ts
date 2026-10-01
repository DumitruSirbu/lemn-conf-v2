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
import { ValidationSuggestion } from "@/room/validation-suggestion";
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
import { policyWithoutU } from "../support/policy-without-u";

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

/** ADR 0116's R8 fabricated policy: the approved one with no U. The approved policy refuses no shape
 *  since M7B U6 (ADR 0108 H4), so every test here whose subject is the shape refusal renders against
 *  this (census W10-W18). */
const POLICY_WITHOUT_U: RoomPolicy = policyWithoutU();

/** The approved policy with L withdrawn: criterion 9's ↑ sabotage (`shape !== "L"`) in reverse. The
 *  cast is only for the empty literal's inference, not a fabrication — `BuildableShapes`' L and linear
 *  are both optional, so `{}` already satisfies it without naming M7B. */
const POLICY_BUILDING_NOTHING: RoomPolicy = {
  ...APPROVED_ROOM_POLICY,
  buildableShapes: {},
};

const POLICIES: readonly (readonly [string, RoomPolicy])[] = [
  ["approved", APPROVED_ROOM_POLICY],
  ["stating no U", POLICY_WITHOUT_U],
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
  // 7J S5: the suggestion's own correctness — exactly when 1C has a reason and wall A validates as
  // a straight room — is swept exhaustively in `room-issue-model.test.ts` and
  // `qa-7f2-s1-issue-model.adversarial.test.ts`; before this wave it could never fire under any
  // real policy, so a blanket "never shown" belonged here too. It can fire now (an L refused on
  // wall B whose wall A and height happen to validate on their own), so this sweep's own subject —
  // the shape refusal, said once, from one region — is asserted without also pinning the
  // suggestion's presence, which this sweep's random walk does not model.
  it.each(POLICIES)(
    "is shown exactly when the policy does not build the chosen shape, said once, from one region — policy %s",
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
            }
          },
        ),
        { numRuns: 80 },
      );
    },
  );
});

// 7J S5: a straight kitchen is buildable now (ADR 0108 Amendment G), so the three fixtures that
// used to belong in the "refused on shape alone" sweep below no longer do — `A_FILLED_LINEAR`
// (3600 × 2600) is accepted at 1D, `shape=linear` alone is missing fields at 1B, and
// `shape=linear&wallA=99&height=0.5` is refused on its *fields*, not its shape, so it now marks
// wallA and height instead of carrying no field mark. Each is covered by its own real behaviour in
// `room-url-state.test.ts` (1B/1D), `room-issue-model.test.ts` and
// `qa-7f2-s1-issue-model.adversarial.test.ts` (field refusal) — none of it a shape refusal, which
// is this describe's own subject.
describe("a deep link is refused on its first frame, whatever its fields hold", () => {
  it.each([
    ["an empty U", "shape=U"],
    ["a filled U", A_FILLED_U],
    [
      "a U with every field out of range",
      "shape=U&wallA=0.1&wallB=9&wallC=0.1&height=9&direction=right",
    ],
    [
      "a U with unreadable and repeated fields",
      "shape=U&wallA=abc&wallB=2.4&wallB=3&height=-1",
    ],
  ])("refuses %s, marks no field and suggests nothing", (_, search) => {
    render(search, POLICY_WITHOUT_U);

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
    render(A_VALID_ROOM, POLICY_WITHOUT_U);
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
    // 7J S5: linear is buildable under the real approved policy, so it is no longer a second
    // refused shape to swap into — `POLICY_BUILDING_NOTHING` keeps both refused, which is this
    // test's own subject (the re-announcement), not which shapes the real policy happens to build.
    render("shape=U&direction=left", POLICY_BUILDING_NOTHING);
    const sentence = elementAt(REFUSAL);

    click("room-shape-chip-control-linear");

    expect(elementAt(REFUSAL)).not.toBe(sentence);
    expect(elementAt(REFUSAL).textContent).toBe(sentence.textContent);
  });

  it("empties and refills the same region on refused, then L, then refused", () => {
    render("shape=U&direction=left", POLICY_WITHOUT_U);
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
    //
    // 7L D9: the note is its own region now (`room-one-c-note`), not the reasons' — this room's own
    // reasons stay silent (`room-one-c-reasons` does not change), which is what "the refusal and the
    // note" always meant here.
    render(A_FILLED_U, POLICY_WITHOUT_U);
    click("room-shape-chip-control-L");
    expect(isRefusalShown()).toBe(false);
    expect(maybeAt("room-presets-after-valid")).toBe(null);

    const changed = regionsChangedBy(() => {
      click("room-shape-chip-control-U");
    });

    expect([...changed].sort()).toEqual(
      ["room-one-c-note", REFUSAL_STATUS].sort(),
    );
    expect(elementAt(ONE_C_STATUS).textContent).not.toContain(shapeSentence());
  });

  it("changes only the refusal region on a tap to an empty U, which is 1B", () => {
    render(A_VALID_ROOM, POLICY_WITHOUT_U);

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
  // 7J S5: a filled straight room is accepted under the real approved policy now, so it carries no
  // shape refusal to draw in either language — a filled U is this test's fixture instead, still
  // refused (a U is M7B's).
  it("draws the Russian sentence once, under the chips, for a filled U", () => {
    const [locale, messages] = russianCatalogue();
    screenMessages = messages;
    screenLocale = locale;
    render(A_FILLED_U, POLICY_WITHOUT_U);

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
  it("sits between the two regions (7L D9), inside neither, after the room's reason and before the note", () => {
    act(() => {
      root.render(
        createElement(NextIntlClientProvider, {
          children: createElement(
            OneCStatus,
            {
              roomReasons: ["room.issue.roomTooSmall"],
              isNoteShown: true,
              noteId: "the-note",
            },
            createElement(ValidationSuggestion, {
              isShown: true,
              id: "the-suggestion",
              onChooseLinear: () => {
                /* not exercised here — activation is 7L-A12's, in
                   `qa-7l-suggestion-card-is-the-chip.adversarial.dom.test.ts` */
              },
            }),
          ),
          locale: "ro",
          messages: roMessages,
          timeZone: "Europe/Chisinau",
        }),
      );
    });

    const status = elementAt(ONE_C_STATUS);
    expect(
      [...status.children].map((child) => child.getAttribute("data-testid")),
    ).toEqual([
      "room-one-c-reasons",
      "room-suggestion-group",
      "room-one-c-note",
    ]);
    expect(elementAt(SUGGESTION).textContent).toBe(
      requireLeafAt(roMessages, "room.issue.orChooseLinear"),
    );
    expect(
      elementAt("room-one-c-reasons").contains(elementAt(SUGGESTION)),
    ).toBe(false);
    expect(elementAt("room-one-c-note").contains(elementAt(SUGGESTION))).toBe(
      false,
    );
  });
});
