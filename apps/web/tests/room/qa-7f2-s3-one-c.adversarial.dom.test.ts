// @vitest-environment happy-dom
//
// The real screen over a mocked router one layer below next-intl, with the router's echo optionally withheld.
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

import {
  createRoomDraft,
  withEnteredText,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";
import {
  canonicalRoomQuery,
  queryEntriesOf,
  URL_SETTLE_MS,
} from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";
import {
  parseRoomUrlState,
  requiredFieldsFor,
  type RoomUrlState,
} from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import { requireLeafAt } from "../support/catalogues";
import { policyWithoutU } from "../support/policy-without-u";

const EVERY_LENGTH_FIELD: readonly RoomLengthField[] = [
  "wallA",
  "wallB",
  "wallC",
  "height",
];

const A_VALID_ROOM = "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left";
const A_ROOM_AWAITING_ITS_CEILING =
  "shape=L&wallA=3.6&wallB=2.4&direction=left";
/** Frame 1C's own example: wall B too short and nothing else. */
const THE_FRAMES_ROOM =
  "shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left";

let container: HTMLDivElement;
let root: Root;
let screenPolicy: RoomPolicy | undefined;
let echoesEveryWrite = true;

function render(search: string, policy?: RoomPolicy): void {
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
    children: createElement(
      RoomScreen,
      screenPolicy === undefined ? {} : { policy: screenPolicy },
    ),
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
  });
}

function searchOf(href: string): string {
  const questionMark = href.indexOf("?");
  return questionMark === -1 ? "" : href.slice(questionMark + 1);
}

function withholdTheEchoes(): void {
  echoesEveryWrite = false;
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
  const input = elementAt(`room-length-${field}`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`the ${field} field is not an input`);
  }
  return input;
}

function continueButton(): HTMLButtonElement {
  const cta = elementAt("room-continue");
  if (!(cta instanceof HTMLButtonElement)) {
    throw new Error("the footer's control is not a button");
  }
  return cta;
}

function type(field: RoomLengthField, text: string): void {
  act(() => {
    const input = fieldFor(field);
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

/**
 * The callbacks handed to `setTimeout` for `URL_SETTLE_MS`, in the order they were armed. Not
 * `vi.advanceTimersToNextTimer`: it follows the step with a zero tick that runs every other timer due at the same
 * instant, so it cannot tell the pause from the settle; firing captured callbacks one at a time can.
 */
function captureTheSettleIntervalTimers(): (() => void)[] {
  const armed: (() => void)[] = [];
  const fakeSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: () => void,
    delay?: number,
  ) => {
    if (delay === URL_SETTLE_MS) armed.push(callback);
    return fakeSetTimeout(callback, delay);
  }) as typeof setTimeout);
  return armed;
}

function fire(callback: (() => void) | undefined): void {
  if (callback === undefined) throw new Error("no timer was armed to fire");
  act(() => {
    callback();
  });
}

function routerCalls(): number {
  return browser.push.mock.calls.length + browser.replace.mock.calls.length;
}

function fieldsWithAReason(): readonly RoomLengthField[] {
  return EVERY_LENGTH_FIELD.filter(
    (field) => maybeAt(`room-length-reason-${field}`) !== null,
  );
}

function fieldsMarkedInvalid(): readonly RoomLengthField[] {
  return EVERY_LENGTH_FIELD.filter(
    (field) =>
      maybeAt(`room-length-${field}`)?.getAttribute("aria-invalid") === "true",
  );
}

function markedPlanWalls(): readonly string[] {
  return [...container.querySelectorAll("[data-testid^='room-plan-label-']")]
    .filter((label) => label.getAttribute("data-marked") === "true")
    .map((label) => label.getAttribute("data-testid") ?? "");
}

function roomReasonCount(): number {
  return container.querySelectorAll("[data-testid='room-room-reason']").length;
}

function isNoteShown(): boolean {
  return maybeAt("room-presets-after-valid") !== null;
}

function isAnyOneCSurfaceShown(): boolean {
  return (
    fieldsWithAReason().length > 0 ||
    fieldsMarkedInvalid().length > 0 ||
    markedPlanWalls().length > 0 ||
    roomReasonCount() > 0 ||
    isNoteShown()
  );
}

/** The oracle parses against the screen's own policy, so a policy that builds a U reaches 1D as on screen.
 *  Undefined is the approved policy. */
function parsed(search: string): RoomUrlState {
  return parseRoomUrlState(queryEntriesOf(search), screenPolicy);
}

function pushedStates(): readonly RoomUrlState[] {
  return browser.push.mock.calls.map(([href]) =>
    parsed(searchOf(hrefText(href))),
  );
}

/** next-intl hands the mocked router a string href; asserted rather than assumed. */
function hrefText(href: unknown): string {
  if (typeof href !== "string") {
    throw new Error(`the router was handed a non-string href: ${String(href)}`);
  }
  return href;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  browser.push.mockClear();
  browser.replace.mockClear();
  echoesEveryWrite = true;
  screenPolicy = undefined;
  browser.replace.mockImplementation((href: string) => {
    if (echoesEveryWrite) arriveAt(searchOf(href));
  });
  browser.search = "";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

describe("the pause fires in a tick of its own, before the settle writes (criterion 4)", () => {
  it("arms exactly two timers on the keystroke: the pause, then the settle", () => {
    render(A_ROOM_AWAITING_ITS_CEILING);
    withholdTheEchoes();
    expect(vi.getTimerCount()).toBe(0);

    type("height", "2");

    expect(vi.getTimerCount()).toBe(2);
  });

  it("shows the reason with zero router calls when the first-armed timer fires, and the write is the second", () => {
    render(A_ROOM_AWAITING_ITS_CEILING);
    withholdTheEchoes();
    const armed = captureTheSettleIntervalTimers();
    type("height", "2");
    expect(armed).toHaveLength(2);

    fire(armed[0]);

    expect(routerCalls()).toBe(0);
    expect(fieldsWithAReason()).toEqual(["height"]);
    expect(fieldsMarkedInvalid()).toEqual(["height"]);
    expect(isNoteShown()).toBe(true);
    expect(continueButton().disabled).toBe(true);

    fire(armed[1]);

    expect(browser.replace).toHaveBeenCalledTimes(1);
    expect(
      parsed(searchOf(hrefText(browser.replace.mock.calls[0]?.[0]))),
    ).toMatchObject({ substate: "1C", markedFields: ["height"] });
    vi.clearAllTimers();
  });

  it("restarts the pause on every keystroke, so a burst straddling 400 ms shows nothing until it stops", () => {
    render(A_ROOM_AWAITING_ITS_CEILING);
    withholdTheEchoes();

    type("height", "2");
    advance(URL_SETTLE_MS - 1);
    type("height", "26");
    advance(URL_SETTLE_MS - 1);
    type("height", "260");
    advance(URL_SETTLE_MS - 1);

    expect(isAnyOneCSurfaceShown()).toBe(false);
    expect(routerCalls()).toBe(0);

    advance(1);

    expect(fieldsWithAReason()).toEqual(["height"]);
  });
});

describe("a tap on a Continue held active mid-burst over a room the domain refuses", () => {
  it("never composes, never reaches 1D, and leaves the customer on the form with the reasons shown", () => {
    // A valid room; wall A retyped to *"8"* (too short) and the button tapped inside the pause, while held active.
    render(A_VALID_ROOM);
    type("wallA", "8");
    expect(continueButton().disabled).toBe(false);

    click("room-continue");
    advance(URL_SETTLE_MS);

    expect(maybeAt("room-compose")).toBe(null);
    expect(maybeAt("room-fields")).not.toBe(null);
    expect(pushedStates().map((state) => state.substate)).not.toContain("1D");
    expect(fieldsWithAReason()).toEqual(["wallA"]);
    expect(continueButton().disabled).toBe(true);
  });

  it("makes no router call and ends the pause, so every 1C surface shows at once (coordinator ruling 2026-09-22)", () => {
    render(A_VALID_ROOM);
    type("wallA", "8");

    click("room-continue");

    expect(routerCalls()).toBe(0);
    expect(fieldsWithAReason()).toEqual(["wallA"]);
    expect(fieldsMarkedInvalid()).toEqual(["wallA"]);
    expect(markedPlanWalls()).toEqual(["room-plan-label-A"]);
    expect(isNoteShown()).toBe(true);
    expect(continueButton().disabled).toBe(true);
  });

  it("leaves only the settle's own write, 400 ms after the keystroke, as any keystroke does", () => {
    render(A_VALID_ROOM);
    withholdTheEchoes();
    type("wallA", "8");
    click("room-continue");

    advance(URL_SETTLE_MS);

    expect(browser.push).not.toHaveBeenCalled();
    expect(browser.replace).toHaveBeenCalledTimes(1);
    expect(
      parsed(searchOf(hrefText(browser.replace.mock.calls[0]?.[0]))),
    ).toMatchObject({ substate: "1C", markedFields: ["wallA"] });
  });

  it("does nothing more on a second tap: no departure, no router call, no composition", () => {
    render(A_VALID_ROOM);
    withholdTheEchoes();
    type("wallA", "8");

    click("room-continue");
    click("room-continue");

    expect(routerCalls()).toBe(0);
    expect(maybeAt("room-compose")).toBe(null);

    advance(URL_SETTLE_MS);

    expect(browser.push).not.toHaveBeenCalled();
    expect(browser.replace).toHaveBeenCalledTimes(1);
  });
});

describe("a history traversal mid-burst is an arrival, not typing", () => {
  it("shows the arrived room's 1C at once and leaves Continue inactive over it", () => {
    // Back inside the pause lands on frame 1C's room. A room arrived at is not a room being typed, so every 1C surface
    // shows at once; the burst's hold must not outlive the draft it was holding for.
    render(A_VALID_ROOM);
    type("wallA", "8");

    arriveAt(THE_FRAMES_ROOM);

    expect(fieldFor("wallB").value).toBe("450");
    expect(continueButton().disabled).toBe(true);
    expect(fieldsWithAReason()).toEqual(["wallB"]);
  });
});

describe("after an arrival, the next keystroke starts a burst of its own (F1's second hole)", () => {
  it("holds what the arrived room showed and waits the pause for the problem just typed", () => {
    render(A_VALID_ROOM);
    type("wallA", "8");
    arriveAt(THE_FRAMES_ROOM);
    expect(fieldsWithAReason()).toEqual(["wallB"]);

    type("wallA", "3");

    expect(fieldsWithAReason()).toEqual(["wallB"]);
    expect(continueButton().disabled).toBe(true);

    advance(URL_SETTLE_MS);

    expect(fieldsWithAReason()).toEqual(["wallA", "wallB"]);
  });

  it("holds Continue active from an arrived valid room, not from the refused one the old burst began on", () => {
    render(THE_FRAMES_ROOM);
    withholdTheEchoes();
    type("wallB", "2");
    arriveAt(A_VALID_ROOM);
    expect(continueButton().disabled).toBe(false);
    expect(isAnyOneCSurfaceShown()).toBe(false);

    type("wallA", "8");

    expect(continueButton().disabled).toBe(false);
    expect(isAnyOneCSurfaceShown()).toBe(false);
  });
});

describe("our own echo is not an arrival", () => {
  it("keeps a burst running when the flush of Back echoes mid-burst", () => {
    // *Înapoi* flushes at once, so its echo lands inside the pause with the draft's own text; `reconcileRoomDraft`
    // keeps the draft's identity on an echo and the burst must survive it.
    render(A_VALID_ROOM);
    type("wallA", "8");

    click("room-back");

    expect(browser.replace).toHaveBeenCalledTimes(1);
    expect(fieldFor("wallA").value).toBe("8");
    expect(isAnyOneCSurfaceShown()).toBe(false);
    expect(continueButton().disabled).toBe(false);
  });
});

describe("a changed sentence mid-burst waits for the pause (review finding R1.1)", () => {
  const TOO_LONG_A = "shape=L&wallA=6.5&wallB=2.4&height=2.6&direction=left";

  it("shows nothing of wall A from 6500 down to empty and up to 4500, and leads on at 4500", () => {
    // A too-long reason showing, backspaced through two too-short prefixes, emptied and retyped to a valid length: no
    // step may show the too-short sentence or label before a pause, nor keep the too-long one once it is false.
    render(TOO_LONG_A);
    withholdTheEchoes();
    expect(fieldsWithAReason()).toEqual(["wallA"]);
    const tooLong = elementAt("room-length-reason-wallA").textContent;
    expect(tooLong).toBe(requireLeafAt(roMessages, "room.issue.wallTooLong"));

    for (const text of ["650", "65", "", "4", "45", "450"]) {
      type("wallA", text);

      expect(fieldsWithAReason(), text).toEqual([]);
      expect(fieldsMarkedInvalid(), text).toEqual([]);
      expect(markedPlanWalls(), text).toEqual([]);
      // The note was showing when the burst began and holds while the draft is 1C: off only while the field is empty.
      expect(isNoteShown(), text).toBe(text !== "");
      expect(continueButton().disabled, text).toBe(true);
    }

    type("wallA", "4500");

    expect(isAnyOneCSurfaceShown()).toBe(false);
    expect(continueButton().disabled).toBe(false);
    advance(URL_SETTLE_MS);
    expect(isAnyOneCSurfaceShown()).toBe(false);
  });

  it("shows the too-short sentence and its label once the burst stops on 450", () => {
    render(TOO_LONG_A);
    withholdTheEchoes();
    const labelWhenTooLong = elementAt("room-plan-label-A").textContent;
    for (const text of ["650", "65", "", "4", "45", "450"]) type("wallA", text);

    advance(URL_SETTLE_MS);

    expect(elementAt("room-length-reason-wallA").textContent).toBe(
      requireLeafAt(roMessages, "room.issue.wallTooShort"),
    );
    expect(markedPlanWalls()).toEqual(["room-plan-label-A"]);
    expect(elementAt("room-plan-label-A").textContent).not.toBe(
      labelWhenTooLong,
    );
  });
});

describe("the parse of the draft is never older than the draft (parse-once refactor)", () => {
  it("departs with the arrived room when Continue is tapped straight after an arrival mid-burst", () => {
    // The tap must judge, and flush, the room on screen and not the typed one.
    const ARRIVED = "shape=L&wallA=4.2&wallB=3.1&height=2.5&direction=left";
    expect(parsed(new URLSearchParams(ARRIVED).toString()).substate).toBe("1D");
    render(A_VALID_ROOM);
    withholdTheEchoes();
    type("wallA", "8");
    arriveAt(ARRIVED);
    expect(continueButton().disabled).toBe(false);

    click("room-continue");

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(searchOf(hrefText(browser.push.mock.calls[0]?.[0]))).toBe(
      new URLSearchParams(ARRIVED).toString(),
    );
  });

  it("leaves nowhere when Continue is tapped straight after an arrival on a refused room is retyped mid-burst", () => {
    render(A_VALID_ROOM);
    withholdTheEchoes();
    type("wallA", "3");
    arriveAt(A_VALID_ROOM);
    // The URL never learned of the keystroke, so this arrival is the query already held: the burst runs on.
    expect(fieldFor("wallA").value).toBe("3");
    expect(continueButton().disabled).toBe(false);

    click("room-continue");

    expect(routerCalls()).toBe(0);
    expect(fieldsWithAReason()).toEqual(["wallA"]);
  });
});

describe("a chip or the corner never starts a burst", () => {
  it("shows the refused shape's note at once when a chip is chosen outside any burst", () => {
    // A policy that states no U refuses a filled U for its shape alone. With no keystroke anywhere nothing is being
    // typed, so 1C shows as soon as the chip is chosen.
    render(
      "shape=U&wallA=3.6&wallB=2.4&wallC=2.4&height=2.6&direction=left",
      policyWithoutU(),
    );
    expect(isNoteShown()).toBe(true);
    click("room-shape-chip-control-L");
    expect(isNoteShown()).toBe(false);
    expect(continueButton().disabled).toBe(false);

    click("room-shape-chip-control-U");

    expect(isNoteShown()).toBe(true);
  });

  it("carries a running burst through the U chip adding wall C, and the mirror", () => {
    render(A_VALID_ROOM);
    withholdTheEchoes();
    type("wallA", "8");

    click("room-corner-control-right");
    click("room-shape-chip-control-U");
    click("room-shape-chip-control-L");

    expect(isAnyOneCSurfaceShown()).toBe(false);
    expect(continueButton().disabled).toBe(false);

    advance(URL_SETTLE_MS);

    expect(fieldsWithAReason()).toEqual(["wallA"]);
    expect(continueButton().disabled).toBe(true);
  });
});

describe("1C is announced into two status regions that were already there (F3, 7L D9/A13)", () => {
  const STATUS = "room-one-c-status";
  const REASONS = "room-one-c-reasons";
  const NOTE = "room-one-c-note";

  it.each([
    ["1B", "shape=L"],
    ["1B, linear", "shape=linear"],
    ["1D", A_VALID_ROOM],
  ])("draws both regions empty at %s", (_, search) => {
    render(search);

    const reasons = elementAt(REASONS);
    const note = elementAt(NOTE);
    expect(reasons.getAttribute("role")).toBe("status");
    expect(reasons.childNodes).toHaveLength(0);
    expect(note.getAttribute("role")).toBe("status");
    expect(note.childNodes).toHaveLength(0);
    expect(maybeAt("room-suggestion-group")).toBe(null);
  });

  it("fills the same nodes on the pause, rather than inserting a region with its content", () => {
    // 3600 x 2160 x 2200 holds the kitchen; wall A retyped to 900 makes it too small.
    const start = "shape=L&wallA=3.6&wallB=2.16&height=2.2&direction=left";
    expect(parsed(new URLSearchParams(start).toString()).substate).toBe("1D");
    render(start);
    withholdTheEchoes();
    const reasonsBefore = elementAt(REASONS);
    const noteBefore = elementAt(NOTE);
    expect(reasonsBefore.childNodes).toHaveLength(0);
    expect(noteBefore.childNodes).toHaveLength(0);

    type("wallA", "900");
    expect(reasonsBefore.childNodes).toHaveLength(0);
    expect(noteBefore.childNodes).toHaveLength(0);
    advance(URL_SETTLE_MS);

    expect(elementAt(REASONS)).toBe(reasonsBefore);
    expect(elementAt(NOTE)).toBe(noteBefore);
    expect(maybeAt("room-suggestion-group")).toBe(null);
    expect(
      [...reasonsBefore.querySelectorAll("[data-testid]")].map((child) =>
        child.getAttribute("data-testid"),
      ),
    ).toEqual(["room-room-reason"]);
    expect(
      [...noteBefore.querySelectorAll("[data-testid]")].map((child) =>
        child.getAttribute("data-testid"),
      ),
    ).toEqual(["room-presets-after-valid"]);
  });

  it("carries no field reason, which is described on its input instead", () => {
    render(THE_FRAMES_ROOM);

    const status = elementAt(STATUS);
    expect(status.querySelector("[data-testid^='room-length-reason-']")).toBe(
      null,
    );
    // This room's wall A and height validate as a straight kitchen on their own (ADR 0108 Amendment G), so the status
    // carries the suggestion beside the presets note. The suggestion is a sibling of the two regions, not a child, and
    // `status.textContent` flattens every descendant, so it still equals the concatenation.
    expect(status.textContent).toBe(
      elementAt("room-suggestion-group").textContent +
        elementAt("room-presets-after-valid").textContent,
    );
  });

  it("describes an inactive Continue by the note, and an active one by nothing", () => {
    render(THE_FRAMES_ROOM);
    expect(continueButton().getAttribute("aria-describedby")).toBe(
      elementAt("room-presets-after-valid").id,
    );

    arriveAt(A_VALID_ROOM);

    expect(continueButton().hasAttribute("aria-describedby")).toBe(false);
  });

  // A room-level reason (ROOM_TOO_SMALL_FOR_KITCHEN) names no field, so the suggestion must be reachable from it via
  // `aria-describedby`. 1800×1200×2600 mm: wall A passes as a straight room alone, so the suggestion fires, while A
  // and B together leave no room for sink and hob past the corner cabinet: one room reason, zero field reasons.
  it("a room-level reason with no field of its own still reaches the suggestion (F1)", () => {
    render("shape=L&wallA=1.8&wallB=1.2&height=2.6&direction=left");

    expect(fieldsWithAReason()).toEqual([]);
    expect(roomReasonCount()).toBe(1);
    const roomReason = elementAt("room-room-reason");
    const suggestion = elementAt("room-linear-suggestion");

    expect(roomReason.getAttribute("aria-describedby")).toBe(suggestion.id);
  });
});

describe("the pause's timer does not outlive the form", () => {
  it("leaves no timer armed once the dimensions step unmounts mid-pause", () => {
    render(A_ROOM_AWAITING_ITS_CEILING);
    withholdTheEchoes();
    type("height", "2");
    expect(vi.getTimerCount()).toBe(2);

    arriveAt("");

    expect(maybeAt("room-fields")).toBe(null);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("writes nothing and throws nothing when the pause would have elapsed after the unmount", () => {
    render(A_ROOM_AWAITING_ITS_CEILING);
    withholdTheEchoes();
    type("height", "2");
    arriveAt("");
    const callsAtUnmount = routerCalls();

    advance(URL_SETTLE_MS * 2);

    expect(routerCalls()).toBe(callsAtUnmount);
    expect(maybeAt("room-shapes")).not.toBe(null);
  });
});

describe("edits that are not a digit keep to the one clock", () => {
  it("treats a paste of a refused length as one keystroke: nothing until the pause, then all of it", () => {
    render(A_VALID_ROOM);
    withholdTheEchoes();

    type("wallA", "800");
    advance(URL_SETTLE_MS - 1);

    expect(isAnyOneCSurfaceShown()).toBe(false);
    expect(continueButton().disabled).toBe(false);

    advance(1);

    expect(fieldsWithAReason()).toEqual(["wallA"]);
    expect(markedPlanWalls()).toEqual(["room-plan-label-A"]);
    expect(continueButton().disabled).toBe(true);
  });

  it("clears every surface at once when the refused field is emptied, and none returns on the pause", () => {
    render(THE_FRAMES_ROOM);
    withholdTheEchoes();
    expect(fieldsWithAReason()).toEqual(["wallB"]);

    type("wallB", "");

    expect(isAnyOneCSurfaceShown()).toBe(false);
    expect(continueButton().disabled).toBe(true);

    advance(URL_SETTLE_MS);

    expect(isAnyOneCSurfaceShown()).toBe(false);
    expect(continueButton().disabled).toBe(true);
  });

  it("turns Continue off at once when a shape chip is chosen mid-burst", () => {
    render(A_VALID_ROOM);
    withholdTheEchoes();
    type("wallA", "8");
    expect(continueButton().disabled).toBe(false);

    click("room-shape-chip-control-U");

    expect(continueButton().disabled).toBe(true);
    expect(isAnyOneCSurfaceShown()).toBe(false);

    advance(URL_SETTLE_MS);

    expect(continueButton().disabled).toBe(true);
    expect(isAnyOneCSurfaceShown()).toBe(false);
  });

  it("carries the pending reason through a corner flip mid-burst, and marks the mirrored wall A", () => {
    render(A_VALID_ROOM);
    withholdTheEchoes();
    type("wallA", "8");

    click("room-corner-control-right");

    expect(isAnyOneCSurfaceShown()).toBe(false);

    advance(URL_SETTLE_MS);

    expect(fieldsWithAReason()).toEqual(["wallA"]);
    expect(markedPlanWalls()).toEqual(["room-plan-label-A"]);
    expect(continueButton().disabled).toBe(true);
  });

  it("does not end the pause on blur", () => {
    render(A_VALID_ROOM);
    withholdTheEchoes();
    type("wallA", "8");

    act(() => {
      fieldFor("wallA").dispatchEvent(new FocusEvent("blur"));
      fieldFor("wallA").dispatchEvent(
        new FocusEvent("focusout", { bubbles: true }),
      );
    });

    expect(isAnyOneCSurfaceShown()).toBe(false);
    advance(URL_SETTLE_MS);
    expect(fieldsWithAReason()).toEqual(["wallA"]);
  });
});

/** The approved policy with no U: the only way to give the sequences a shape the policy refuses (ADR 0116). */
const POLICIES: readonly (readonly [string, RoomPolicy])[] = [
  ["approved", APPROVED_ROOM_POLICY],
  ["stating no U", policyWithoutU()],
];

/** Texts that cross every reading a field has: empty, unreadable, each too-short prefix of a valid
 *  length, valid, too long, and a ceiling too low and too high. */
const TEXTS = [
  "",
  "abc",
  "2",
  "26",
  "260",
  "2600",
  "8",
  "800",
  "900",
  "2400",
  "3600",
  "6500",
  "4000",
] as const;

type Step =
  | {
      readonly kind: "type";
      readonly field: RoomLengthField;
      readonly text: string;
    }
  | { readonly kind: "wait"; readonly milliseconds: number }
  | { readonly kind: "chip"; readonly shape: RoomShape }
  | { readonly kind: "arrive"; readonly search: string }
  | { readonly kind: "tap" };

/** Rooms a traversal can land on. Every one names the left corner, as `draftOnScreen` assumes. */
const ARRIVALS = [
  A_VALID_ROOM,
  THE_FRAMES_ROOM,
  "shape=L&wallA=0.9&wallB=2.16&height=2.2&direction=left",
  "shape=L&wallA=0.8&wallB=0.8&height=2&direction=left",
  "shape=U&wallA=3.6&wallB=2.4&wallC=2.4&height=2.6&direction=left",
  "shape=linear&wallA=3.6&height=2.6",
  "shape=L&direction=left",
].map((search) => new URLSearchParams(search).toString());

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
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant("wait" as const),
      milliseconds: fc.constantFrom(50, URL_SETTLE_MS - 1, URL_SETTLE_MS, 1000),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("chip" as const),
      shape: fc.constantFrom<RoomShape>("linear", "L", "U"),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("arrive" as const),
      search: fc.constantFrom(...ARRIVALS),
    }),
  },
  { weight: 1, arbitrary: fc.constant({ kind: "tap" as const }) },
);

/** The draft the screen is showing, read back off its own controls. The corner is never flipped in
 *  these sequences, so the draft's default direction is the screen's. */
function draftOnScreen(shape: RoomShape): RoomDraft {
  return requiredFieldsFor(shape).reduce<RoomDraft>(
    (draft, field) =>
      withEnteredText(draft, { field, text: fieldFor(field).value }),
    createRoomDraft(shape),
  );
}

/** This file's own reading of which sentence each code is shown with, so the oracle is not the model under test. */
const FIELD_SENTENCE_KEY: Readonly<Record<string, string>> = {
  WALL_TOO_SHORT: "room.issue.wallTooShort",
  WALL_TOO_LONG: "room.issue.wallTooLong",
  HEIGHT_TOO_LOW: "room.issue.heightTooLow",
  HEIGHT_TOO_HIGH: "room.issue.heightTooHigh",
  ROOM_TOO_SMALL_FOR_KITCHEN: "room.issue.roomTooSmall",
};

const WALL_OF_FIELD: Readonly<Record<string, string>> = {
  wallA: "A",
  wallB: "B",
  wallC: "C",
};

/** 1C as the parser has it, keyed on the sentence each surface is drawn with. */
interface ExpectedOneC {
  readonly fieldReasons: readonly string[];
  readonly marks: readonly string[];
  readonly roomReasons: readonly string[];
  readonly isOneC: boolean;
  readonly isOneD: boolean;
  /** The marked labels' text as drawn when this was taken — only meaningful when it was settled. */
  readonly labelTexts: Readonly<Record<string, string>>;
}

function stateOnScreen(shape: RoomShape): RoomUrlState {
  return parsed(canonicalRoomQuery(draftOnScreen(shape)).toString());
}

function expectedOneCOf(state: RoomUrlState): ExpectedOneC {
  const issues = state.substate === "1C" ? state.issues : [];
  return {
    fieldReasons: issues
      .filter((issue) => issue.field !== "shape")
      .map(
        (issue) =>
          `${issue.field} ${FIELD_SENTENCE_KEY[issue.code] ?? issue.code}`,
      ),
    marks: issues
      .filter((issue) => issue.field in WALL_OF_FIELD)
      .map((issue) => `${WALL_OF_FIELD[issue.field] ?? ""} ${issue.code}`),
    roomReasons: issues
      .filter(
        (issue) =>
          issue.field === "shape" && issue.code !== "SHAPE_NOT_BUILDABLE",
      )
      .map((issue) => FIELD_SENTENCE_KEY[issue.code] ?? issue.code),
    isOneC: state.substate === "1C",
    isOneD: state.substate === "1D",
    labelTexts: Object.fromEntries(
      [...container.querySelectorAll("[data-testid^='room-plan-label-']")]
        .filter((label) => label.getAttribute("data-marked") === "true")
        .map((label) => [
          (label.getAttribute("data-testid") ?? "").replace(
            "room-plan-label-",
            "",
          ),
          label.textContent,
        ]),
    ),
  };
}

/** What the screen may show mid-burst: only what showed at the burst's start and still holds, sentence for sentence. */
function heldThroughTheBurst(
  now: ExpectedOneC,
  atStart: ExpectedOneC,
): ExpectedOneC {
  return {
    ...now,
    fieldReasons: now.fieldReasons.filter((key) =>
      atStart.fieldReasons.includes(key),
    ),
    marks: now.marks.filter((key) => atStart.marks.includes(key)),
    roomReasons: now.roomReasons.filter((key) =>
      atStart.roomReasons.includes(key),
    ),
    isOneC: now.isOneC && atStart.isOneC,
    labelTexts: atStart.labelTexts,
  };
}

function fieldReasonsOnScreen(): readonly string[] {
  return fieldsWithAReason().map(
    (field) =>
      `${field} ${keyOfSentence(elementAt(`room-length-reason-${field}`).textContent)}`,
  );
}

function roomReasonsOnScreen(): readonly string[] {
  return [
    ...container.querySelectorAll("[data-testid='room-room-reason']"),
  ].map((reason) => keyOfSentence(reason.textContent));
}

function keyOfSentence(text: string): string {
  const key = Object.values(FIELD_SENTENCE_KEY).find(
    (candidate) => requireLeafAt(roMessages, candidate) === text,
  );
  return key ?? `unknown sentence: ${text}`;
}

function marksOnScreen(): readonly string[] {
  return markedPlanWalls().map((testId) =>
    testId.replace("room-plan-label-", ""),
  );
}

function expectScreenToShow(
  expected: ExpectedOneC,
  isContinueExpected: boolean,
  detail: string,
): void {
  expect([...fieldReasonsOnScreen()].sort(), detail).toEqual(
    [...expected.fieldReasons].sort(),
  );
  expect([...fieldsMarkedInvalid()].sort(), detail).toEqual(
    [...new Set(expected.fieldReasons.map((key) => key.split(" ")[0]))].sort(),
  );
  expect([...marksOnScreen()].sort(), detail).toEqual(
    expected.marks.map((key) => key.split(" ")[0]).sort(),
  );
  expect(roomReasonsOnScreen(), detail).toEqual(expected.roomReasons);
  expect(isNoteShown(), detail).toBe(expected.isOneC);
  expect(continueButton().disabled, detail).toBe(!isContinueExpected);
}

interface SequenceModel {
  shape: RoomShape;
  sinceKeystrokeMs: number;
  /** 1C as it stood, settled, when the running burst began. */
  atBurstStart: ExpectedOneC | undefined;
}

function runStep(step: Step, model: SequenceModel): void {
  if (step.kind === "type") {
    if (!requiredFieldsFor(model.shape).includes(step.field)) return;
    // The text the field already holds fires no `onChange` (React's value tracker), so it is no
    // keystroke: no burst starts and the pause is not restarted.
    if (fieldFor(step.field).value === step.text) return;
    if (model.sinceKeystrokeMs >= URL_SETTLE_MS) {
      model.atBurstStart = expectedOneCOf(stateOnScreen(model.shape));
    }
    type(step.field, step.text);
    model.sinceKeystrokeMs = 0;
  } else if (step.kind === "wait") {
    advance(step.milliseconds);
    model.sinceKeystrokeMs += step.milliseconds;
  } else if (step.kind === "chip") {
    click(`room-shape-chip-control-${step.shape}`);
    model.shape = step.shape;
  } else if (step.kind === "arrive") {
    arriveReseeding(step.search, model);
  } else {
    tapContinueOverARefusedDraft(model);
  }
}

/** A traversal. It re-seeds — and so ends any burst — unless it is indistinguishable from an echo:
 *  the query already held, or the draft's own canonical text (`reconcileRoomDraft`'s rule). */
function arriveReseeding(search: string, model: SequenceModel): void {
  const isReseed =
    search !== browser.search &&
    search !== canonicalRoomQuery(draftOnScreen(model.shape)).toString();
  arriveAt(search);
  if (!isReseed) return;
  const state = parsed(search);
  model.shape =
    state.substate === "1B"
      ? state.shape
      : state.substate === "1A"
        ? model.shape
        : state.input.shape;
  model.sinceKeystrokeMs = Infinity;
}

/** Only an enabled button over a draft the domain refuses (a 1D tap composes and takes the form away): no router
 *  call at the tap, and the pause ends there. */
function tapContinueOverARefusedDraft(model: SequenceModel): void {
  if (continueButton().disabled) return;
  const state = parsed(
    canonicalRoomQuery(draftOnScreen(model.shape)).toString(),
  );
  if (state.substate === "1D") return;
  const callsBefore = routerCalls();
  click("room-continue");
  expect(routerCalls()).toBe(callsBefore);
  model.sinceKeystrokeMs = Infinity;
}

describe("over any sequence of keystrokes, pauses, shape changes, arrivals and taps (C-7F2-1 extended)", () => {
  it.each(POLICIES)(
    "shows mid-burst exactly what showed at the burst's start and still holds, sentence and label alike, and settles on the parser's reading — policy %s",
    (_, policy) => {
      fc.assert(
        fc.property(
          fc.array(stepArbitrary, { minLength: 1, maxLength: 14 }),
          (steps) => {
            act(() => {
              root.unmount();
            });
            root = createRoot(container);
            browser.push.mockClear();
            browser.replace.mockClear();
            render(A_VALID_ROOM, policy);
            const model: SequenceModel = {
              shape: "L",
              sinceKeystrokeMs: Infinity,
              atBurstStart: undefined,
            };

            for (const step of steps) {
              runStep(step, model);

              const state = stateOnScreen(model.shape);
              const now = expectedOneCOf(state);
              const isContinueAllowed =
                isShapeBuildable(model.shape, policy) &&
                state.substate !== "1B";
              const detail = JSON.stringify({ steps, step, now });

              if (isAnyOneCSurfaceShown()) {
                expect(continueButton().disabled, detail).toBe(true);
              }
              if (model.sinceKeystrokeMs >= URL_SETTLE_MS) {
                expectScreenToShow(
                  now,
                  isContinueAllowed && now.isOneD,
                  detail,
                );
                continue;
              }
              const atStart = model.atBurstStart;
              if (atStart === undefined)
                throw new Error("a burst with no start");
              const held = heldThroughTheBurst(now, atStart);
              expectScreenToShow(
                held,
                isContinueAllowed && (now.isOneD || atStart.isOneD),
                detail,
              );
              for (const wall of marksOnScreen()) {
                expect(
                  elementAt(`room-plan-label-${wall}`).textContent,
                  detail,
                ).toBe(held.labelTexts[wall]);
              }
            }
          },
        ),
        { numRuns: 120 },
      );
    },
  );
});
