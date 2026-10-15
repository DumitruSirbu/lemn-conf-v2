// @vitest-environment happy-dom
//
// **Text a length field refuses is explained once the customer leaves the field** — M7 wave 7F2 slice
// S5b, ruling Q-7F2-4 (a), C-S1b-2, ADR 0126.
//
// The real screen is rendered through the real parser over a mocked router, the harness
// `room-one-c.dom.test.ts` uses. What is asserted:
//
// - every text the field's parser refuses shows `room.issue.unreadable` beside that field after a blur,
//   wired as S3's reasons are (`aria-describedby` hint → help → reason, `aria-invalid`), in ro and ru;
// - never before the blur, never on an empty field, never on a readable value the room refuses — that
//   one is 1C's, with 1C's sentence;
// - it goes on the keystroke that makes the text readable or empty, stays while a keystroke leaves the
//   text unreadable, and after a fix does not come back until the next blur;
// - it is the blurred field's alone, and never shares a field with a 1C reason;
// - a deep link cannot arrive with it showing.
//
// Romanian is never spelled here; every sentence is read out of the catalogue under test.
import { fc } from "@fast-check/vitest";
import { APPROVED_ROOM_POLICY } from "@lemnaria/configurator-domain";
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

import { DimensionsForm } from "@/room/dimensions-form";
import { draftStateOf } from "@/room/one-c-surfaces";
import {
  createRoomDraft,
  withEnteredText,
  type RoomLengthField,
} from "@/room/room-draft";
import {
  deriveRoomIssueView,
  UNREADABLE_LENGTH_MESSAGE_KEY,
} from "@/room/room-issue-model";
import { URL_SETTLE_MS } from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";

import {
  CATALOGUES,
  requireLeafAt,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";

/** Longer than `Number.MAX_SAFE_INTEGER`'s 16 digits: refused as not a safe integer (C-S1b-2). */
const SEVENTEEN_DIGITS = "12345678901234567";

/** The S1b discriminating cases, plus the dotted metre habit: every one non-empty and refused. */
const UNREADABLE_TEXTS = [
  "3,6",
  "3.6",
  "3600mm",
  "abc",
  "0",
  "000",
  SEVENTEEN_DIGITS,
] as const;

/** An L the domain accepts, in the URL's metres: every field readable, so only the field under test
 *  can make the room anything other than 1D. */
const A_VALID_L = "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left";
const A_VALID_U =
  "shape=U&wallA=3.6&wallB=2.4&wallC=2.4&height=2.6&direction=left";

/** Whole millimetres the approved policy refuses as too short: readable, so 1C's and not this slice's. */
const READABLE_BUT_TOO_SHORT = "12";

/** A valid length for wall B in millimetres, typed as the fix. */
const WALL_B_FIX = "2400";

const EVERY_LENGTH_FIELD: readonly RoomLengthField[] = [
  "wallA",
  "wallB",
  "wallC",
  "height",
];

// ---------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let rendered: readonly [CatalogueLocale, Catalogue] = CATALOGUES[0];

function render(
  search: string,
  catalogue: readonly [CatalogueLocale, Catalogue] = CATALOGUES[0],
): void {
  rendered = catalogue;
  arriveAt(search);
}

function arriveAt(search: string): void {
  browser.search = new URLSearchParams(search).toString();
  act(() => {
    root.render(theScreen());
  });
}

function theScreen(): ReactElement {
  const [locale, messages] = rendered;
  return createElement(NextIntlClientProvider, {
    children: createElement(RoomScreen, {}),
    locale,
    messages,
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

function fieldFor(field: RoomLengthField): HTMLInputElement {
  const input = maybeAt(`room-length-${field}`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`the screen draws no ${field} field`);
  }
  return input;
}

function type(field: RoomLengthField, text: string): void {
  act(() => {
    const input = fieldFor(field);
    Reflect.set(HTMLInputElement.prototype, "value", text, input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The customer leaves the field. React's `onBlur` listens for the bubbling `focusout`. */
function leave(field: RoomLengthField): void {
  act(() => {
    fieldFor(field).dispatchEvent(
      new FocusEvent("focusout", { bubbles: true }),
    );
  });
}

function typeAndLeave(field: RoomLengthField, text: string): void {
  type(field, text);
  leave(field);
}

function advance(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function unreadableSentence(): string {
  return requireLeafAt(rendered[1], UNREADABLE_LENGTH_MESSAGE_KEY);
}

function reasonTextsOn(field: RoomLengthField): readonly string[] {
  return [
    ...container.querySelectorAll(
      `[data-testid="room-length-reason-${field}"]`,
    ),
  ].map((reason) => reason.textContent);
}

function isUnreadableShownOn(field: RoomLengthField): boolean {
  return reasonTextsOn(field).includes(unreadableSentence());
}

function fieldsExplainedAsUnreadable(): readonly RoomLengthField[] {
  return EVERY_LENGTH_FIELD.filter(
    (field) =>
      maybeAt(`room-length-${field}`) !== null && isUnreadableShownOn(field),
  );
}

function isMarkedInvalid(field: RoomLengthField): boolean {
  return fieldFor(field).getAttribute("aria-invalid") === "true";
}

function describedIds(field: RoomLengthField): readonly string[] {
  return (fieldFor(field).getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "");
}

/** The texts the field's `aria-describedby` points at, in its order. */
function describedTexts(field: RoomLengthField): readonly string[] {
  return describedIds(field).map(
    (id) => container.querySelector(`[id="${id}"]`)?.textContent ?? "",
  );
}

function continueButton(): HTMLButtonElement {
  const cta = maybeAt("room-continue");
  if (!(cta instanceof HTMLButtonElement)) {
    throw new Error("the footer's control is not a button");
  }
  return cta;
}

function markedPlanWallCount(): number {
  return container.querySelectorAll(
    "[data-testid^='room-plan-label-'][data-marked='true']",
  ).length;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  browser.push.mockClear();
  browser.replace.mockClear();
  browser.replace.mockImplementation((href: string) => {
    arriveAt(searchOf(href));
  });
  browser.search = "";
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
// Shown on blur, with S3's wiring
// ---------------------------------------------------------------------------------------------

describe.each(CATALOGUES)("in %s", (locale, messages) => {
  const catalogue = [locale, messages] as const;

  it.each(UNREADABLE_TEXTS)(
    "explains %j once wall B is left, and not a moment before",
    (text) => {
      render(A_VALID_L, catalogue);

      type("wallB", text);
      expect(isUnreadableShownOn("wallB")).toBe(false);
      expect(isMarkedInvalid("wallB")).toBe(false);

      leave("wallB");

      expect(reasonTextsOn("wallB")).toEqual([unreadableSentence()]);
      expect(isMarkedInvalid("wallB")).toBe(true);
    },
  );

  it("describes a wall by the hint, its help and then the unreadable sentence", () => {
    render(A_VALID_L, catalogue);
    const beforeIds = describedIds("wallB");

    typeAndLeave("wallB", "3,6");

    const afterIds = describedIds("wallB");
    expect(afterIds.slice(0, beforeIds.length)).toEqual(beforeIds);
    expect(afterIds).toHaveLength(beforeIds.length + 1);
    expect(describedTexts("wallB")[0]).toBe(
      requireLeafAt(messages, "room.lengthsHint"),
    );
    expect(describedTexts("wallB").at(-1)).toBe(unreadableSentence());
  });

  it("describes the ceiling, which has no hint or help, by the unreadable sentence alone", () => {
    render(A_VALID_L, catalogue);

    typeAndLeave("height", "2,6");

    expect(describedTexts("height")).toEqual([unreadableSentence()]);
    expect(isMarkedInvalid("height")).toBe(true);
  });

  it("says it in words, with no digit and no code", () => {
    const sentence = requireLeafAt(messages, UNREADABLE_LENGTH_MESSAGE_KEY);

    expect(sentence).not.toMatch(/[0-9]/);
    expect(sentence).not.toMatch(/[A-Z]{2,}_|room\.|issue\./);
  });
});

// ---------------------------------------------------------------------------------------------
// Never where it does not belong
// ---------------------------------------------------------------------------------------------

describe("what is not unreadable is never explained as unreadable", () => {
  it("says nothing about a field left empty", () => {
    render(A_VALID_L);

    typeAndLeave("wallB", "");

    expect(reasonTextsOn("wallB")).toEqual([]);
    expect(isMarkedInvalid("wallB")).toBe(false);
  });

  it("says nothing about unreadable text while the customer is still in the field, however long they wait", () => {
    render(A_VALID_L);

    type("wallB", "abc");
    advance(URL_SETTLE_MS * 10);

    expect(reasonTextsOn("wallB")).toEqual([]);
    expect(isMarkedInvalid("wallB")).toBe(false);
  });

  it("leaves a readable value the room refuses to 1C's own sentence", () => {
    render(A_VALID_L);

    typeAndLeave("wallB", READABLE_BUT_TOO_SHORT);
    advance(URL_SETTLE_MS);

    expect(reasonTextsOn("wallB")).toEqual([
      requireLeafAt(CATALOGUES[0][1], "room.issue.wallTooShort"),
    ]);
  });

  it("keeps the room at 1B while it shows: no red wall, no note, Continue inactive", () => {
    render(A_VALID_L);

    typeAndLeave("wallB", "abc");
    advance(URL_SETTLE_MS);

    expect(isUnreadableShownOn("wallB")).toBe(true);
    expect(markedPlanWallCount()).toBe(0);
    expect(maybeAt("room-presets-after-valid")).toBe(null);
    expect(continueButton().disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------------------------

describe("the sentence goes on the keystroke that fixes the text", () => {
  it("clears when the text becomes readable, with no blur and no pause", () => {
    render(A_VALID_L);
    typeAndLeave("wallB", "3,6");

    type("wallB", WALL_B_FIX);

    expect(reasonTextsOn("wallB")).toEqual([]);
    expect(isMarkedInvalid("wallB")).toBe(false);
  });

  it("clears when the field is emptied", () => {
    render(A_VALID_L);
    typeAndLeave("wallB", "abc");

    type("wallB", "");

    expect(reasonTextsOn("wallB")).toEqual([]);
    expect(isMarkedInvalid("wallB")).toBe(false);
  });

  it("stays while a keystroke leaves the text unreadable", () => {
    render(A_VALID_L);
    typeAndLeave("wallB", "3,6");

    type("wallB", "3,60");

    expect(reasonTextsOn("wallB")).toEqual([unreadableSentence()]);
  });

  it("does not come back while the customer is still editing after a fix, and does on the next blur", () => {
    render(A_VALID_L);
    typeAndLeave("wallB", "3,6");
    type("wallB", "36");

    type("wallB", "36,");
    expect(isUnreadableShownOn("wallB")).toBe(false);
    type("wallB", "36,5");
    expect(isUnreadableShownOn("wallB")).toBe(false);

    leave("wallB");
    expect(isUnreadableShownOn("wallB")).toBe(true);
  });

  it("forgets a field left readable, so a later unreadable keystroke waits for its own blur", () => {
    render(A_VALID_L);
    typeAndLeave("wallB", WALL_B_FIX);

    type("wallB", "abc");

    expect(isUnreadableShownOn("wallB")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Per field, and never beside a 1C reason
// ---------------------------------------------------------------------------------------------

describe("the sentence belongs to the field that was left", () => {
  it("explains wall A alone when wall A is left, though wall B holds unreadable text too", () => {
    render(A_VALID_U);
    type("wallB", "abc");

    typeAndLeave("wallA", "abc");

    expect(fieldsExplainedAsUnreadable()).toEqual(["wallA"]);
    expect(isMarkedInvalid("wallB")).toBe(false);
  });

  it("explains three walls of a U, each after its own blur", () => {
    render(A_VALID_U);

    typeAndLeave("wallA", "3,6");
    typeAndLeave("wallB", "abc");
    expect(fieldsExplainedAsUnreadable()).toEqual(["wallA", "wallB"]);

    typeAndLeave("wallC", "0");
    expect(fieldsExplainedAsUnreadable()).toEqual(["wallA", "wallB", "wallC"]);
  });

  it("clears one field's sentence without touching another's", () => {
    render(A_VALID_U);
    typeAndLeave("wallA", "abc");
    typeAndLeave("wallB", "abc");

    type("wallA", "3600");

    expect(fieldsExplainedAsUnreadable()).toEqual(["wallB"]);
  });

  it("takes wall B's 1C reason away at once when wall A turns unreadable, and never stacks the two", () => {
    render(A_VALID_L);
    typeAndLeave("wallB", READABLE_BUT_TOO_SHORT);
    advance(URL_SETTLE_MS);
    expect(reasonTextsOn("wallB")).toHaveLength(1);

    typeAndLeave("wallA", "abc");

    expect(reasonTextsOn("wallB")).toEqual([]);
    expect(reasonTextsOn("wallA")).toEqual([unreadableSentence()]);
  });

  it("never finds a 1C field reason in a room with an unreadable field", () => {
    // The structural half of "never on one field": a field holding unreadable text keeps the room at
    // 1B, and 1B carries no field reason at all.
    const anyText = fc.oneof(
      fc.constantFrom(...UNREADABLE_TEXTS),
      fc.integer({ min: 1, max: 9000 }).map(String),
      fc.constant(""),
    );
    fc.assert(
      fc.property(
        fc.constantFrom("L", "U", "linear" as const),
        fc.record({
          wallA: anyText,
          wallB: anyText,
          wallC: anyText,
          height: anyText,
        }),
        (shape, texts) => {
          const draft = EVERY_LENGTH_FIELD.reduce(
            (typed, field) =>
              withEnteredText(typed, { field, text: texts[field] }),
            createRoomDraft(shape),
          );
          const view = deriveRoomIssueView({
            draft,
            draftState: draftStateOf(draft, APPROVED_ROOM_POLICY),
            policy: APPROVED_ROOM_POLICY,
          });
          if (view.unreadableFields.length > 0) {
            expect(view.fieldReasons).toEqual([]);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("the form keeps the two kinds of reason apart by construction", () => {
  it("draws the unreadable sentence alone on a field handed both it and a 1C reason", () => {
    // Unreachable from the screen (the property above), so the form is handed the pair directly.
    const draft = withEnteredText(createRoomDraft("L"), {
      field: "wallB",
      text: "abc",
    });
    act(() => {
      root.render(
        createElement(NextIntlClientProvider, {
          children: createElement(DimensionsForm, {
            draft,
            fieldReasons: [
              { field: "wallB", messageKey: "room.issue.wallTooShort" },
            ],
            unreadableFields: ["wallB"],
            onEnterLength: vi.fn(),
            onChooseCorner: vi.fn(),
          }),
          locale: CATALOGUES[0][0],
          messages: CATALOGUES[0][1],
          timeZone: "Europe/Chisinau",
        }),
      );
    });
    rendered = CATALOGUES[0];

    leave("wallB");

    expect(reasonTextsOn("wallB")).toEqual([unreadableSentence()]);
    expect(describedTexts("wallB").at(-1)).toBe(unreadableSentence());
  });
});

// ---------------------------------------------------------------------------------------------
// A field left by a press (QA finding S5b-1)
// ---------------------------------------------------------------------------------------------

function helpOf(field: RoomLengthField): HTMLElement {
  const help = maybeAt(`room-length-help-${field}`);
  if (help === null) throw new Error(`the screen draws no help for ${field}`);
  return help;
}

function dispatchOn(target: EventTarget, type: string): void {
  act(() => {
    target.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

/** A press's start as a browser orders it: the press, then the blur it causes. */
function pressLeaving(target: HTMLElement, left: RoomLengthField): void {
  dispatchOn(target, "pointerdown");
  dispatchOn(target, "mousedown");
  leave(left);
}

describe("a field left by a press is explained only once the press is over", () => {
  it("keeps wall A's sentence out of the layout until the tap on wall B's help has clicked", () => {
    render(A_VALID_U);
    type("wallA", "3,6");
    const help = helpOf("wallB");

    pressLeaving(help, "wallA");
    dispatchOn(help, "pointerup");
    dispatchOn(help, "mouseup");
    expect(reasonTextsOn("wallA")).toEqual([]);

    act(() => {
      help.click();
    });
    expect(reasonTextsOn("wallA")).toEqual([unreadableSentence()]);
    expect(isMarkedInvalid("wallA")).toBe(true);
    expect(help.getAttribute("aria-expanded")).toBe("true");
  });

  it("holds the sentence through a touch tap, whose focus moves on the mousedown after the finger lifts", () => {
    render(A_VALID_U);
    type("wallA", "3,6");
    const help = helpOf("wallB");
    dispatchOn(help, "pointerdown");
    dispatchOn(help, "pointerup");

    dispatchOn(help, "mousedown");
    leave("wallA");
    dispatchOn(help, "mouseup");
    expect(reasonTextsOn("wallA")).toEqual([]);

    act(() => {
      help.click();
    });
    expect(reasonTextsOn("wallA")).toEqual([unreadableSentence()]);
  });

  it("explains the field when the press is cancelled, as a touch that becomes a scroll is", () => {
    render(A_VALID_U);
    type("wallA", "abc");

    pressLeaving(helpOf("wallB"), "wallA");
    expect(reasonTextsOn("wallA")).toEqual([]);

    dispatchOn(helpOf("wallB"), "pointercancel");
    expect(reasonTextsOn("wallA")).toEqual([unreadableSentence()]);
  });

  it("explains the field after the release of a press that clicks nothing, as on a disabled button", () => {
    render(A_VALID_U);
    type("wallA", "abc");
    const inactiveContinue = continueButton();

    pressLeaving(inactiveContinue, "wallA");
    dispatchOn(inactiveContinue, "pointerup");
    expect(reasonTextsOn("wallA")).toEqual([]);

    advance(0);
    expect(reasonTextsOn("wallA")).toEqual([unreadableSentence()]);
  });

  it("explains a field left from the keyboard at once, after an earlier press has ended", () => {
    render(A_VALID_U);
    const help = helpOf("wallB");
    dispatchOn(help, "pointerdown");
    dispatchOn(help, "pointerup");
    type("wallA", "abc");

    leave("wallA");

    expect(reasonTextsOn("wallA")).toEqual([unreadableSentence()]);
  });
});

describe("a press whose release never reaches the page is ended by a key or by the window losing focus", () => {
  /** A press the page sees start and never sees released: a native context menu took the release. */
  function pressWithLostRelease(): void {
    dispatchOn(document.body, "pointerdown");
    dispatchOn(document.body, "mousedown");
  }

  function loseWindowFocus(): void {
    act(() => {
      window.dispatchEvent(new FocusEvent("blur"));
    });
  }

  it("explains a field left by Tab at once, the key having ended the lost press", () => {
    render(A_VALID_U);
    pressWithLostRelease();
    type("wallA", "abc");

    dispatchOn(fieldFor("wallA"), "keydown");
    leave("wallA");

    expect(reasonTextsOn("wallA")).toEqual([unreadableSentence()]);
  });

  it("explains a field left after the window lost focus mid-press, at once", () => {
    render(A_VALID_U);
    pressWithLostRelease();
    loseWindowFocus();
    type("wallA", "abc");

    leave("wallA");

    expect(reasonTextsOn("wallA")).toEqual([unreadableSentence()]);
  });

  it("flushes a sentence already waiting on the lost press when a key is pressed", () => {
    render(A_VALID_U);
    type("wallA", "abc");
    pressLeaving(document.body, "wallA");
    expect(reasonTextsOn("wallA")).toEqual([]);

    dispatchOn(document.body, "keydown");

    expect(reasonTextsOn("wallA")).toEqual([unreadableSentence()]);
  });

  it("flushes a sentence already waiting on the lost press when the window loses focus", () => {
    render(A_VALID_U);
    type("wallA", "abc");
    pressLeaving(document.body, "wallA");
    expect(reasonTextsOn("wallA")).toEqual([]);

    loseWindowFocus();

    expect(reasonTextsOn("wallA")).toEqual([unreadableSentence()]);
  });

  it("does not take an element's own blur, mid-press, for the window losing focus", () => {
    render(A_VALID_U);
    type("wallA", "abc");
    const help = helpOf("wallB");
    pressLeaving(help, "wallA");

    act(() => {
      fieldFor("wallA").dispatchEvent(new FocusEvent("blur"));
    });

    expect(reasonTextsOn("wallA")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// A deep link
// ---------------------------------------------------------------------------------------------

describe("a deep link never arrives with the sentence showing", () => {
  it("refills an unreadable wire value as an empty field, and leaving it says nothing", () => {
    render("shape=L&wallA=abc&wallB=2.4&height=2.6&direction=left");

    expect(fieldFor("wallA").value).toBe("");
    expect(fieldsExplainedAsUnreadable()).toEqual([]);

    leave("wallA");
    expect(fieldsExplainedAsUnreadable()).toEqual([]);
  });
});
