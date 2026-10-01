// @vitest-environment happy-dom
//
// **Adversarial QA — wave 7F2 slice S5b, the unreadable-text reason on blur (Q-7F2-4 (a), C-S1b-2).**
//
// `room-unreadable-on-blur.dom.test.ts` pins seven texts and single keystrokes. This file attacks what
// it leaves open:
//
// - **Unreadable is the entry parser's refusal, exactly** — every text `parseMillimetres` refuses and
//   that is not blank shows the one sentence after a blur, on every field, and no readable text ever
//   does. Swept over arbitrary strings, not only the S1b list.
// - **One message** (owner, 2026-09-22): `"0"`, 17 digits and letters all read the same sentence.
// - **Shape switches**, U → L → U with wall C's text kept, and chips tapped while a field is dirty.
// - **The clocks it must not ride**: the typing pause, the URL echo, and an arrival that re-seeds a
//   field the customer left explained.
// - **The wiring on every path**: `aria-invalid` exactly while the sentence shows, and the description
//   order hint → help → reason.
import { fc } from "@fast-check/vitest";
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
import { UNREADABLE_LENGTH_MESSAGE_KEY } from "@/room/room-issue-model";
import { URL_SETTLE_MS } from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";

import {
  CATALOGUES,
  requireLeafAt,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";

const A_VALID_L = "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left";
const A_VALID_U =
  "shape=U&wallA=3.6&wallB=2.4&wallC=2.4&height=2.6&direction=left";
const WALLS: readonly RoomLengthField[] = ["wallA", "wallB", "wallC"];
const U_FIELDS: readonly RoomLengthField[] = [...WALLS, "height"];

/** S5's edge table, each with whether the entry parser reads it. */
const EDGE_TEXTS: readonly (readonly [string, boolean])[] = [
  ["", true],
  [" ", true],
  ["\t", true],
  ["0", false],
  ["000", false],
  ["00000000000000000", false],
  ["0003600", true],
  [" 3600 ", true],
  [" 3600", true],
  ["3,6", false],
  ["3.6", false],
  ["3600mm", false],
  ["+3600", false],
  ["-3600", false],
  ["3e3", false],
  ["3 600", false],
  ["３６００", false],
  ["٣٦٠٠", false],
  ["9007199254740991", true],
  ["9007199254740992", false],
  ["12345678901234567", false],
  ["99999999999999999999", false],
];

// ---------------------------------------------------------------------------------------------
// Harness — `room-unreadable-on-blur.dom.test.ts`'s, restated so neither file reaches into the other
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

function remount(search: string): void {
  act(() => {
    root.unmount();
  });
  root = createRoot(container);
  render(search);
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

function isExplained(field: RoomLengthField): boolean {
  return reasonTextsOn(field).includes(unreadableSentence());
}

function explainedFields(): readonly RoomLengthField[] {
  return U_FIELDS.filter(
    (field) => maybeAt(`room-length-${field}`) !== null && isExplained(field),
  );
}

function isMarkedInvalid(field: RoomLengthField): boolean {
  return fieldFor(field).getAttribute("aria-invalid") === "true";
}

function describedTexts(field: RoomLengthField): readonly string[] {
  return (fieldFor(field).getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter((id) => id !== "")
    .map((id) => container.querySelector(`[id="${id}"]`)?.textContent ?? "");
}

function isUnreadable(text: string): boolean {
  const parsed = parseMillimetres(text);
  return !parsed.ok && parsed.reason !== "empty";
}

/** The sentence and its wiring agree: `aria-invalid` exactly while the field shows any reason (the
 *  sentence, or 1C's once the room is judged), the last description is the sentence exactly while it
 *  shows, and it is never stacked with another reason. */
function expectWiringToMatch(field: RoomLengthField, detail: string): void {
  const shown = isExplained(field);
  expect(isMarkedInvalid(field), detail).toBe(reasonTextsOn(field).length > 0);
  expect(describedTexts(field).at(-1) === unreadableSentence(), detail).toBe(
    shown,
  );
  if (shown) expect(reasonTextsOn(field), detail).toHaveLength(1);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  browser.push.mockClear();
  browser.replace.mockClear();
  browser.replace.mockImplementation((href: string) => {
    arriveAt(searchOf(href));
  });
  browser.search = "";
  rendered = CATALOGUES[0];
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
// 1. Unreadable is exactly the parser's non-empty refusal
// ---------------------------------------------------------------------------------------------

describe("the sentence follows the entry parser's refusal exactly", () => {
  it.each(EDGE_TEXTS)(
    "shows it on every field of a U after %j is left only when the parser refuses it (readable: %s)",
    (text, isReadableOrEmpty) => {
      for (const field of U_FIELDS) {
        remount(A_VALID_U);

        typeAndLeave(field, text);

        const detail = `${field} ${JSON.stringify(text)}`;
        expect(isExplained(field), detail).toBe(!isReadableOrEmpty);
        expect(isUnreadable(text), detail).toBe(!isReadableOrEmpty);
        expectWiringToMatch(field, detail);
      }
    },
  );

  it("agrees with the parser for any string typed into any field of a U", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...U_FIELDS),
        fc.oneof(
          fc.string({ maxLength: 12 }),
          fc.string({ unit: "grapheme", maxLength: 6 }),
          fc.stringMatching(/^[0-9 ,.]{1,20}$/),
        ),
        (field, text) => {
          remount(A_VALID_U);

          typeAndLeave(field, text);

          const detail = `${field} ${JSON.stringify(text)}`;
          expect(explainedFields(), detail).toEqual(
            isUnreadable(text) ? [field] : [],
          );
          expectWiringToMatch(field, detail);
        },
      ),
      { numRuns: 300 },
    );
  });

  it.each(CATALOGUES)(
    "reads one and the same sentence for every kind of refusal, in %s",
    (locale, messages) => {
      const refusals = ["abc", "0", "000", "12345678901234567", "3,6"];
      const shown = refusals.map((text) => {
        act(() => {
          root.unmount();
        });
        root = createRoot(container);
        render(A_VALID_L, [locale, messages]);
        typeAndLeave("wallB", text);
        return reasonTextsOn("wallB");
      });

      expect(new Set(shown.map((texts) => texts.join("|"))).size).toBe(1);
      expect(shown[0]).toEqual([
        requireLeafAt(messages, UNREADABLE_LENGTH_MESSAGE_KEY),
      ]);
      expect(shown[0]?.[0]).not.toMatch(/\p{Nd}|[A-Z]{2,}_[A-Z_]+|\bmm\b/u);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// 2. Shape switches and chips
// ---------------------------------------------------------------------------------------------

describe("a shape switch keeps what the customer typed and what they were told", () => {
  // Coordinator question: C kept "abc" through U → L → U. It was left while unreadable and is
  // unreadable still, which is the whole of the rule — so it is shown on return, with no new blur.
  it("shows wall C's sentence again on returning to U, because C still holds the text it was told about", () => {
    render(A_VALID_U);
    typeAndLeave("wallC", "abc");
    expect(explainedFields()).toEqual(["wallC"]);

    click("room-shape-chip-control-L");
    expect(maybeAt("room-length-wallC")).toBe(null);
    expect(explainedFields()).toEqual([]);

    click("room-shape-chip-control-U");
    expect(fieldFor("wallC").value).toBe("abc");
    expect(explainedFields()).toEqual(["wallC"]);
    expectWiringToMatch("wallC", "after U → L → U");
  });

  it("does not show wall C's sentence on returning to U when C was never left while unreadable", () => {
    render(A_VALID_U);
    type("wallC", "abc");

    click("room-shape-chip-control-L");
    click("room-shape-chip-control-U");

    expect(explainedFields()).toEqual([]);
    expect(isMarkedInvalid("wallC")).toBe(false);
  });

  it("forgets wall C's sentence when C was fixed while it showed, even after two switches", () => {
    render(A_VALID_U);
    typeAndLeave("wallC", "abc");
    type("wallC", "1200");

    click("room-shape-chip-control-L");
    click("room-shape-chip-control-U");
    type("wallC", "12,");

    expect(explainedFields()).toEqual([]);
  });

  it("keeps wall A's sentence through every chip, since wall A is asked for by every shape", () => {
    render(A_VALID_U);
    typeAndLeave("wallA", "3,6");

    for (const shape of ["linear", "L", "U", "linear"] as const) {
      click(`room-shape-chip-control-${shape}`);
      expect(explainedFields(), shape).toEqual(["wallA"]);
      expectWiringToMatch("wallA", shape);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 3. The clocks it must not ride, and arrivals
// ---------------------------------------------------------------------------------------------

describe("the blur is the sentence's only clock", () => {
  it("shows at the blur mid-burst, without waiting for the typing pause, and holds through it", () => {
    render(A_VALID_L);
    type("wallB", "2");
    type("wallB", "2,");
    leave("wallB");

    expect(explainedFields()).toEqual(["wallB"]);
    advance(URL_SETTLE_MS * 3);
    expect(explainedFields()).toEqual(["wallB"]);
    expect(fieldFor("wallB").value).toBe("2,");
  });

  it("survives the URL echo of its own draft, keeping the text and the sentence", () => {
    render(A_VALID_L);
    typeAndLeave("wallA", "abc");

    advance(URL_SETTLE_MS * 2);

    expect(browser.replace).toHaveBeenCalled();
    expect(fieldFor("wallA").value).toBe("abc");
    expect(explainedFields()).toEqual(["wallA"]);
  });

  it("hides at once when an arrival re-seeds the explained field readable, and does not return on the next unreadable keystroke", () => {
    render(A_VALID_L);
    typeAndLeave("wallA", "abc");
    advance(URL_SETTLE_MS * 2);

    arriveAt("shape=L&wallA=4.2&wallB=2.4&height=2.6&direction=left");
    expect(fieldFor("wallA").value).toBe("4200");
    expect(explainedFields()).toEqual([]);

    type("wallA", "42,");
    expect(explainedFields()).toEqual([]);
    expect(isMarkedInvalid("wallA")).toBe(false);

    leave("wallA");
    expect(explainedFields()).toEqual(["wallA"]);
  });

  it("does not bring a stale sentence back after an arrival empties the field and it is typed again", () => {
    render(A_VALID_L);
    typeAndLeave("wallB", "3,6");
    advance(URL_SETTLE_MS * 2);

    arriveAt("shape=L&wallA=4.2&height=2.6&direction=left");
    expect(fieldFor("wallB").value).toBe("");
    expect(explainedFields()).toEqual([]);

    type("wallB", "x");
    expect(explainedFields()).toEqual([]);
    expect(isMarkedInvalid("wallB")).toBe(false);
  });

  // An arrival identical to the draft's own canonical query is its echo (S3b): the unreadable wall is
  // not on the wire, so the draft — and its explained text — must survive it, and the next keystroke
  // that leaves the text unreadable keeps the sentence, per the coordinator's re-focus ruling.
  it("keeps the explained text and its sentence through an arrival that is the draft's own echo", () => {
    render(A_VALID_L);
    typeAndLeave("wallB", "3,6");
    advance(URL_SETTLE_MS * 2);

    arriveAt("shape=L&wallA=3.6&height=2.6&direction=left");
    expect(fieldFor("wallB").value).toBe("3,6");
    expect(explainedFields()).toEqual(["wallB"]);

    type("wallB", "3,6x");
    expect(explainedFields()).toEqual(["wallB"]);
  });

  it("never shows a sentence on a field the customer has not left, over any keystroke and pause sequence", () => {
    const step = fc.oneof(
      fc.record({
        kind: fc.constant("type" as const),
        field: fc.constantFrom<RoomLengthField>("wallA", "wallB", "height"),
        text: fc.constantFrom("", "abc", "0", "3,6", "3600", "12", "7"),
      }),
      fc.record({
        kind: fc.constant("wait" as const),
        milliseconds: fc.constantFrom(50, URL_SETTLE_MS, 1000),
      }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 12 }), (steps) => {
        remount(A_VALID_L);
        for (const next of steps) {
          if (next.kind === "type") type(next.field, next.text);
          else advance(next.milliseconds);

          expect(explainedFields(), JSON.stringify(steps)).toEqual([]);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("keeps sentence and wiring in step over any sequence of keystrokes, blurs, chips and pauses", () => {
    const step = fc.oneof(
      {
        weight: 4,
        arbitrary: fc.record({
          kind: fc.constant("type" as const),
          field: fc.constantFrom(...U_FIELDS),
          text: fc.constantFrom("", "abc", "0", "3,6", "3600", "12", "7"),
        }),
      },
      {
        weight: 3,
        arbitrary: fc.record({
          kind: fc.constant("leave" as const),
          field: fc.constantFrom(...U_FIELDS),
        }),
      },
      {
        weight: 2,
        arbitrary: fc.record({
          kind: fc.constant("chip" as const),
          shape: fc.constantFrom("linear" as const, "L" as const, "U" as const),
        }),
      },
      {
        weight: 1,
        arbitrary: fc.record({
          kind: fc.constant("wait" as const),
          milliseconds: fc.constantFrom(50, URL_SETTLE_MS),
        }),
      },
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 16 }), (steps) => {
        remount(A_VALID_U);
        for (const next of steps) {
          if (next.kind === "chip") {
            click(`room-shape-chip-control-${next.shape}`);
          } else if (next.kind === "wait") {
            advance(next.milliseconds);
          } else if (maybeAt(`room-length-${next.field}`) === null) {
            continue;
          } else if (next.kind === "type") {
            type(next.field, next.text);
          } else {
            leave(next.field);
          }
          const detail = JSON.stringify(steps);
          for (const field of U_FIELDS) {
            if (maybeAt(`room-length-${field}`) === null) continue;
            if (isExplained(field)) {
              expect(isUnreadable(fieldFor(field).value), detail).toBe(true);
            }
            if (isUnreadable(fieldFor(field).value)) {
              expect(isMarkedInvalid(field), detail).toBe(isExplained(field));
            }
            expectWiringToMatch(field, detail);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// 4. The description order on a wall, and on the ceiling
// ---------------------------------------------------------------------------------------------

describe.each(CATALOGUES)(
  "the description order once explained, in %s",
  (locale, messages) => {
    it.each(WALLS)(
      "describes %s by the hint, then its help, then the sentence",
      (field) => {
        render(A_VALID_U, [locale, messages]);
        const before = describedTexts(field);

        typeAndLeave(field, "abc");

        const after = describedTexts(field);
        expect(before).toHaveLength(2);
        expect(after).toEqual([...before, unreadableSentence()]);
        expect(after[0]).toBe(requireLeafAt(messages, "room.lengthsHint"));
      },
    );

    it("returns the description to hint and help once fixed", () => {
      render(A_VALID_U, [locale, messages]);
      const before = describedTexts("wallB");
      typeAndLeave("wallB", "abc");

      type("wallB", "2400");

      expect(describedTexts("wallB")).toEqual(before);
      expect(fieldFor("wallB").hasAttribute("aria-invalid")).toBe(false);
    });
  },
);

// ---------------------------------------------------------------------------------------------
// 5. Round 2: the press tracking (`useAfterPress`)
// ---------------------------------------------------------------------------------------------

function dispatch(target: EventTarget, type: string): void {
  act(() => {
    target.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

/** A mouse press on `target` whose mousedown moves focus out of each of `left`, as Chromium orders it. */
function pressDownLeaving(
  target: EventTarget,
  left: readonly RoomLengthField[],
): void {
  dispatch(target, "pointerdown");
  dispatch(target, "mousedown");
  for (const field of left) leave(field);
}

function releaseAndClick(target: HTMLElement): void {
  dispatch(target, "pointerup");
  dispatch(target, "mouseup");
  act(() => {
    target.click();
  });
}

describe("a press that never ends, and presses that end strangely", () => {
  // Round 2's finding, now fixed: a press whose release never reaches the page — a native context
  // menu that swallows the mouseup, an app switched away mid-press — left `isPressing` true, and every
  // later blur waited for the next press. Amended per the coordinator's test-fidelity ruling
  // (2026-09-22): a keyboard exit is a Tab, and a Tab sends its `keydown` before focus moves, so the
  // leave is preceded by the `keydown` a real browser sends. The claim is unchanged: explained at once.
  it("explains a field left from the keyboard after a press whose release was lost", () => {
    render(A_VALID_U);
    dispatch(document.body, "pointerdown");
    dispatch(document.body, "mousedown");
    type("wallA", "abc");

    act(() => {
      fieldFor("wallA").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
    });
    leave("wallA");

    expect(explainedFields()).toEqual(["wallA"]);
  });

  // The other reachable cause: the customer switches apps mid-press, so the window blurs and the
  // release never arrives. The sentence the press deferred is shown then, not on some later press, and
  // a tap into another field on return behaves as any tap does.
  it("explains a field whose press was cut off by the window losing focus, and a tap on return works", () => {
    render(A_VALID_U);
    type("wallA", "abc");
    const wallB = fieldFor("wallB");
    pressDownLeaving(wallB, ["wallA"]);
    expect(explainedFields()).toEqual([]);

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(explainedFields()).toEqual(["wallA"]);

    type("wallB", "0");
    const wallC = fieldFor("wallC");
    pressDownLeaving(wallC, ["wallB"]);
    expect(explainedFields()).toEqual(["wallA"]);
    releaseAndClick(wallC);
    expect(explainedFields()).toEqual(["wallA", "wallB"]);
  });

  it("keeps waiting when only an element's own blur passes through the window mid-press", () => {
    render(A_VALID_U);
    type("wallA", "abc");
    const help = elementAt("room-length-help-wallB");
    pressDownLeaving(help, ["wallA"]);

    act(() => {
      fieldFor("wallB").dispatchEvent(
        new FocusEvent("blur", { bubbles: true }),
      );
      fieldFor("wallB").dispatchEvent(new FocusEvent("blur"));
    });
    expect(explainedFields()).toEqual([]);

    releaseAndClick(help);
    expect(explainedFields()).toEqual(["wallA"]);
  });

  it("recovers on the next press that ends, even one that clicks nothing", () => {
    render(A_VALID_U);
    dispatch(document.body, "pointerdown");
    type("wallA", "abc");
    leave("wallA");

    dispatch(document.body, "pointerdown");
    dispatch(document.body, "pointerup");
    advance(0);

    expect(explainedFields()).toEqual(["wallA"]);
  });

  it("completes on a cancel that arrives with no release, and a later keyboard blur is immediate", () => {
    render(A_VALID_U);
    type("wallA", "abc");
    pressDownLeaving(document.body, ["wallA"]);
    expect(explainedFields()).toEqual([]);

    dispatch(document.body, "pointercancel");
    expect(explainedFields()).toEqual(["wallA"]);

    type("wallB", "3,6");
    leave("wallB");
    expect(explainedFields()).toEqual(["wallA", "wallB"]);
  });

  it("explains two fields left within one press together, once its click lands", () => {
    render(A_VALID_U);
    type("wallA", "abc");
    type("wallB", "0");
    const help = elementAt("room-length-help-wallC");

    pressDownLeaving(help, ["wallA", "wallB"]);
    expect(explainedFields()).toEqual([]);

    releaseAndClick(help);
    expect(explainedFields()).toEqual(["wallA", "wallB"]);
  });

  it("does not explain a field fixed between its deferred blur and the click", () => {
    render(A_VALID_U);
    type("wallA", "abc");
    const help = elementAt("room-length-help-wallB");
    pressDownLeaving(help, ["wallA"]);

    type("wallA", "3600");
    releaseAndClick(help);
    expect(explainedFields()).toEqual([]);

    type("wallA", "36,");
    expect(explainedFields()).toEqual([]);
  });

  it("carries a deferral across the chip its press switches to, and shows it on return", () => {
    render(A_VALID_U);
    type("wallC", "abc");
    const chipL = elementAt("room-shape-chip-control-L");

    pressDownLeaving(chipL, ["wallC"]);
    releaseAndClick(chipL);
    expect(maybeAt("room-length-wallC")).toBe(null);

    click("room-shape-chip-control-U");
    expect(explainedFields()).toEqual(["wallC"]);
  });
});

describe("nothing is left behind on unmount", () => {
  it("removes from window every listener it added, with a deferral pending, and never sets state after", () => {
    const added: [string, unknown, boolean][] = [];
    const removed: [string, unknown, boolean][] = [];
    const captureOf = (options: unknown): boolean =>
      typeof options === "boolean"
        ? options
        : Boolean((options as { capture?: boolean } | undefined)?.capture);
    const originalAdd = window.addEventListener.bind(window);
    const originalRemove = window.removeEventListener.bind(window);
    const addSpy = vi
      .spyOn(window, "addEventListener")
      .mockImplementation((type, listener, options) => {
        added.push([type, listener, captureOf(options)]);
        originalAdd(type, listener, options);
      });
    const removeSpy = vi
      .spyOn(window, "removeEventListener")
      .mockImplementation((type, listener, options) => {
        removed.push([type, listener, captureOf(options)]);
        originalRemove(type, listener, options);
      });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      render(A_VALID_U);
      type("wallA", "abc");
      pressDownLeaving(elementAt("room-length-help-wallB"), ["wallA"]);

      act(() => {
        root.unmount();
      });
      root = createRoot(container);

      const pressTypes = new Set([
        "pointerdown",
        "mousedown",
        "pointerup",
        "mouseup",
        "pointercancel",
        "click",
      ]);
      const stillAttached = added.filter(
        ([type, listener, capture]) =>
          pressTypes.has(type) &&
          !removed.some(
            ([removedType, removedListener, removedCapture]) =>
              removedType === type &&
              removedListener === listener &&
              removedCapture === capture,
          ),
      );
      expect(
        stillAttached.map(
          ([type, , capture]) => `${type}${capture ? " (capture)" : ""}`,
        ),
      ).toEqual([]);

      dispatch(window, "pointerup");
      dispatch(window, "click");
      advance(10);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
      consoleError.mockRestore();
    }
  });
});
