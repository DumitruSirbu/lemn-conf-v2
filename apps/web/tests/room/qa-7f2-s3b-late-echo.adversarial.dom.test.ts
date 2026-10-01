// @vitest-environment happy-dom
//
// **Adversarial QA, M7 wave 7F2 slice S3b — late echoes on the mounted screen.**
//
// What the implementer's `room-late-echo.dom.test.ts` does not draw:
// - a text the settle writes **twice** (a backspace back to an earlier value), whose older copy
//   echoes first;
// - **three fields** typed through each other's round trips, with the locale prefix on every write;
// - a **long-lived** screen — many type/pause cycles, some writes superseded and never echoed — that
//   then traverses to an old value, with and without a `popstate`;
// - departures (*Înapoi*, a double tap) taken **after** a late echo, in the settle it re-arms.
//
// The harness is the implementer's pattern: `RoomScreen` over a mocked router whose `replace` echoes
// on its own delay, in dispatch order, and a clock stepped `CLOCK_STEP_MS` at a time, each step its
// own `act` (S3b.5's fidelity rule).
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

import { withEnteredText, type RoomLengthField } from "@/room/room-draft";
import {
  canonicalRoomQuery,
  roomDraftFromQuery,
  URL_SETTLE_MS,
} from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";

import roMessages from "../../src/messages/ro.json";

const CLOCK_STEP_MS = 5;
const QUIET_MS = 3_000;
const DEPARTURE_WATCH_MS = 1_500;

const ROOM_PATH_IN_ROMANIAN = "/ro/configurator/room";
const THE_EMPTY_L_ROOM = "shape=L&direction=left";

// ---------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------

/**
 * - **`withheld`** — a test delivers every echo by hand.
 * - **`newer write discards older`** — Next's rule: a dispatch discards every write still in flight.
 * - **`commit race`** — every write echoes, in dispatch order, each on its own delay.
 */
type EchoDelivery = "withheld" | "newer write discards older" | "commit race";

interface PendingEcho {
  readonly search: string;
  isDue: boolean;
}

interface EchoingRouter {
  delivery: EchoDelivery;
  delaysMs: readonly number[];
  writesSent: number;
  pending: PendingEcho[];
}

let container: HTMLDivElement;
let root: Root;
let router: EchoingRouter;

function dispatchReplace(href: string): void {
  if (router.delivery === "withheld") return;
  const echo: PendingEcho = { search: searchOf(href), isDue: false };
  if (router.delivery === "newer write discards older") router.pending = [];
  router.pending.push(echo);
  const delay =
    router.delaysMs[router.writesSent % router.delaysMs.length] ?? 0;
  router.writesSent += 1;
  setTimeout(() => {
    echo.isDue = true;
    deliverDueEchoesInOrder();
  }, delay);
}

function deliverDueEchoesInOrder(): void {
  for (let head = router.pending[0]; head?.isDue; head = router.pending[0]) {
    router.pending.shift();
    arriveAt(head.search);
  }
}

function arriveAt(search: string): void {
  browser.search = new URLSearchParams(search).toString();
  act(() => {
    root.render(theScreen());
  });
}

function theScreen(): ReactElement {
  return createElement(NextIntlClientProvider, {
    children: createElement(RoomScreen, {}),
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
  });
}

/** A browser Back or Forward: Next discards every pending write when it dispatches the traversal
 *  (`app-router-instance.js:146-160`), and the `popstate` is announced before the arrival. */
function traverseTo(search: string): void {
  router.pending = [];
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  });
  arriveAt(search);
}

function advance(milliseconds: number): void {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += CLOCK_STEP_MS) {
    act(() => {
      vi.advanceTimersByTime(Math.min(CLOCK_STEP_MS, milliseconds - elapsed));
    });
  }
}

function searchOf(href: string): string {
  const questionMark = href.indexOf("?");
  return questionMark === -1 ? "" : href.slice(questionMark + 1);
}

function elementAt(testId: string): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the screen draws no ${testId}`);
  }
  return element;
}

function fieldFor(field: RoomLengthField): HTMLInputElement {
  const input = elementAt(`room-length-${field}`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`the ${field} field is not an input`);
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

function tap(testId: "room-back"): void {
  act(() => {
    elementAt(testId).click();
  });
}

function replacedHrefs(): readonly string[] {
  return browser.replace.mock.calls.map(([href]) => String(href));
}

function lastReplacedSearch(): string {
  const last = replacedHrefs().at(-1);
  if (last === undefined) throw new Error("the screen has written nothing");
  return searchOf(last);
}

type TypedText = Partial<Record<RoomLengthField, string>>;

function canonicalTextOfTyped(typed: TypedText): string {
  const typedDraft = Object.entries(typed).reduce(
    (draft, [field, text]) =>
      withEnteredText(draft, { field: field as RoomLengthField, text }),
    roomDraftFromQuery("L", { direction: "left" }),
  );
  return canonicalRoomQuery(typedDraft).toString();
}

function mountFreshScreen(delivery: EchoDelivery): void {
  router = { delivery, delaysMs: [0], writesSent: 0, pending: [] };
  browser.push.mockClear();
  browser.replace.mockClear();
  browser.search = "";
  root = createRoot(container);
}

function remount(delivery: EchoDelivery): void {
  act(() => {
    root.unmount();
  });
  vi.clearAllTimers();
  mountFreshScreen(delivery);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  browser.replace.mockImplementation(dispatchReplace);
  container = document.createElement("div");
  document.body.append(container);
  mountFreshScreen("withheld");
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
// A text written twice
// ---------------------------------------------------------------------------------------------

describe("a text the settle writes twice (backspace), older copy echoing first", () => {
  /** 3, 36, and back to 3, each written by its own settle with every echo withheld, then 35. */
  function writeThreeThirtySixThreeThenType35(): readonly string[] {
    arriveAt(THE_EMPTY_L_ROOM);
    const written: string[] = [];
    for (const text of ["3", "36", "3"]) {
      type("wallA", text);
      advance(URL_SETTLE_MS);
      written.push(lastReplacedSearch());
    }
    type("wallA", "35");
    return written;
  }

  it("keeps 35 through every echo when all three writes echo in dispatch order (commit race)", () => {
    const written = writeThreeThirtySixThreeThenType35();
    expect(written[0]).toBe(written[2]);

    const fieldAfterEachEcho = written.map((search) => {
      arriveAt(search);
      return fieldFor("wallA").value;
    });

    expect(fieldAfterEachEcho).toEqual(["35", "35", "35"]);
  });

  it("keeps 35 when only the newest write echoes (Next's discard order)", () => {
    const written = writeThreeThirtySixThreeThenType35();

    arriveAt(String(written[2]));
    advance(URL_SETTLE_MS);

    expect(fieldFor("wallA").value).toBe("35");
    expect(lastReplacedSearch()).toBe("shape=L&wallA=0.035&direction=left");
  });
});

// ---------------------------------------------------------------------------------------------
// Three fields typed through each other's round trips
// ---------------------------------------------------------------------------------------------

const FIELD_CYCLE: readonly RoomLengthField[] = ["wallA", "wallB", "height"];

const ANY_DIGIT = fc.constantFrom("1", "2", "3", "4", "5", "6", "7", "8", "9");

const ANY_THREE_FIELD_RUN = fc.record({
  digits: fc.array(ANY_DIGIT, { minLength: 3, maxLength: 6 }),
  gapsMs: fc.array(fc.integer({ min: 300, max: 600 }), {
    minLength: 5,
    maxLength: 5,
  }),
  echoDelaysMs: fc.array(fc.integer({ min: 0, max: 900 }), {
    minLength: 1,
    maxLength: 6,
  }),
});

describe("wall A, then wall B before A's echo lands, then the ceiling", () => {
  it("loses no digit in any field on the direct case, and every write keeps the /ro prefix", () => {
    arriveAt(THE_EMPTY_L_ROOM);
    type("wallA", "3");
    advance(URL_SETTLE_MS);
    const wallAWrite = lastReplacedSearch();
    type("wallB", "2");
    advance(URL_SETTLE_MS);
    const wallBWrite = lastReplacedSearch();
    type("height", "2");

    arriveAt(wallAWrite);
    arriveAt(wallBWrite);
    advance(URL_SETTLE_MS);

    expect(FIELD_CYCLE.map((field) => fieldFor(field).value)).toEqual([
      "3",
      "2",
      "2",
    ]);
    expect(lastReplacedSearch()).toBe(
      canonicalTextOfTyped({ wallA: "3", wallB: "2", height: "2" }),
    );
    for (const href of replacedHrefs()) {
      expect(href.startsWith(`${ROOM_PATH_IN_ROMANIAN}?`)).toBe(true);
    }
  });

  it.each<EchoDelivery>(["newer write discards older", "commit race"])(
    "settles on exactly what was typed in all three fields, with %s",
    (delivery) => {
      fc.assert(
        fc.property(ANY_THREE_FIELD_RUN, (run) => {
          remount(delivery);
          router.delaysMs = run.echoDelaysMs;
          arriveAt(THE_EMPTY_L_ROOM);
          const typed: TypedText = {};

          run.digits.forEach((digit, index) => {
            if (index > 0) advance(run.gapsMs[index - 1] ?? 0);
            const field = FIELD_CYCLE[index % FIELD_CYCLE.length] ?? "wallA";
            typed[field] = (typed[field] ?? "") + digit;
            type(field, typed[field]);
          });
          advance(QUIET_MS);

          for (const [field, text] of Object.entries(typed)) {
            expect(fieldFor(field as RoomLengthField).value).toBe(text);
          }
          expect(browser.search).toBe(canonicalTextOfTyped(typed));
          for (const href of replacedHrefs()) {
            expect(href.startsWith(`${ROOM_PATH_IN_ROMANIAN}?`)).toBe(true);
          }
        }),
        { numRuns: 40 },
      );
    },
  );
});

// ---------------------------------------------------------------------------------------------
// A long-lived screen
// ---------------------------------------------------------------------------------------------

/** Twelve cycles of one digit then a pause inside the round trip, with a round trip longer than the
 *  settle so writes overlap and Next's rule discards some of them unseen. */
function typeTwelveCyclesThroughOverlappingRoundTrips(): readonly string[] {
  router.delaysMs = [650, 120, 480, 900, 30];
  arriveAt(THE_EMPTY_L_ROOM);
  let text = "";
  for (let cycle = 0; cycle < 12; cycle += 1) {
    text += String((cycle % 9) + 1);
    type("wallA", text.slice(-4));
    advance(URL_SETTLE_MS + 20);
  }
  return replacedHrefs().map(searchOf);
}

describe("a long-lived screen, then a traversal to an old value", () => {
  it("re-seeds to the old room a Back lands on while a write is still in flight", () => {
    remount("newer write discards older");
    const written = typeTwelveCyclesThroughOverlappingRoundTrips();
    const anOldWrite = String(written[1]);
    expect(router.pending.length).toBeGreaterThan(0);

    const typedLast = fieldFor("wallA").value;

    traverseTo(anOldWrite);
    advance(DEPARTURE_WATCH_MS);

    expect(fieldFor("wallA").value).not.toBe(typedLast);
    expect(canonicalTextOfTyped({ wallA: fieldFor("wallA").value })).toBe(
      anOldWrite,
    );
    expect(browser.search).toBe(anOldWrite);
    expect(replacedHrefs().length).toBe(written.length);
  });

  it("re-seeds when a Back lands on the newest write still in flight, the draft having moved past it", () => {
    remount("newer write discards older");
    typeTwelveCyclesThroughOverlappingRoundTrips();
    const newestInFlight = router.pending.at(-1)?.search;
    if (newestInFlight === undefined) throw new Error("no write is in flight");
    type("wallA", `${fieldFor("wallA").value.slice(0, 3)}0`);
    const typedPastIt = fieldFor("wallA").value;

    traverseTo(newestInFlight);
    advance(DEPARTURE_WATCH_MS);

    expect(fieldFor("wallA").value).not.toBe(typedPastIt);
    expect(canonicalTextOfTyped({ wallA: fieldFor("wallA").value })).toBe(
      newestInFlight,
    );
    expect(browser.search).toBe(newestInFlight);
  });

  it("re-seeds to a superseded write's text arriving later without a popstate, once a newer write has echoed", () => {
    remount("newer write discards older");
    const written = typeTwelveCyclesThroughOverlappingRoundTrips();
    advance(QUIET_MS);
    const typedLast = fieldFor("wallA").value;
    const aWriteNeverSeen = String(written[0]);

    arriveAt(aWriteNeverSeen);

    expect(fieldFor("wallA").value).not.toBe(typedLast);
    expect(canonicalTextOfTyped({ wallA: fieldFor("wallA").value })).toBe(
      aWriteNeverSeen,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Departures after a late echo
// ---------------------------------------------------------------------------------------------

/** A late echo has arrived and re-armed the settle: *3* written, *36* typed, the write of *3* back. */
function arriveAfterALateEcho(): void {
  arriveAt(THE_EMPTY_L_ROOM);
  type("wallA", "3");
  advance(URL_SETTLE_MS);
  type("wallA", "36");
  arriveAt(lastReplacedSearch());
  expect(fieldFor("wallA").value).toBe("36");
}

describe("a departure taken inside the settle a late echo re-armed", () => {
  it("flushes 36, pushes once when the flush lands, and writes nothing after (the screen's Back)", () => {
    arriveAfterALateEcho();
    const writesBeforeTheTap = replacedHrefs().length;

    advance(URL_SETTLE_MS / 2);
    tap("room-back");
    const flushed = lastReplacedSearch();
    type("wallA", "367");
    arriveAt(flushed);
    const writesAtThePush = replacedHrefs().length;
    advance(DEPARTURE_WATCH_MS);

    expect(flushed).toBe("shape=L&wallA=0.036&direction=left");
    expect(writesAtThePush).toBe(writesBeforeTheTap + 1);
    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(replacedHrefs().length).toBe(writesAtThePush);
  });

  it("pushes exactly once for a double tap on the screen's Back with the late-echo rewrite pending", () => {
    arriveAfterALateEcho();

    tap("room-back");
    tap("room-back");
    arriveAt(lastReplacedSearch());
    const writesAtThePush = replacedHrefs().length;
    advance(DEPARTURE_WATCH_MS);

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(replacedHrefs().length).toBe(writesAtThePush);
  });

  it("pushes once and writes nothing after, when a long-lived screen taps the screen's Back over a write in flight and a stray digit follows", () => {
    remount("newer write discards older");
    typeTwelveCyclesThroughOverlappingRoundTrips();
    expect(router.pending.length).toBeGreaterThan(0);

    tap("room-back");
    type("wallA", `${fieldFor("wallA").value.slice(0, 3)}0`);
    advance(DEPARTURE_WATCH_MS);
    const writesAtTheEnd = replacedHrefs().length;
    advance(DEPARTURE_WATCH_MS);

    expect(browser.push).toHaveBeenCalledTimes(1);
    const pushOrder = browser.push.mock.invocationCallOrder[0] ?? 0;
    const replacesAfterThePush =
      browser.replace.mock.invocationCallOrder.filter(
        (order) => order > pushOrder,
      );
    expect(replacesAfterThePush).toEqual([]);
    expect(replacedHrefs().length).toBe(writesAtTheEnd);
  });

  it("pushes once when two writes overlap, the older echoes late, and the screen's Back flushes the newer", () => {
    // Writes of 3 and 36 are both in flight; 3 lands late (kept), then Înapoi flushes 36, and the
    // newer write and the flush both land on 36.
    arriveAt("shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left");
    type("wallA", "3");
    advance(URL_SETTLE_MS);
    const writeInFlight = lastReplacedSearch();
    type("wallA", "36");
    advance(URL_SETTLE_MS);
    const newerWrite = lastReplacedSearch();
    arriveAt(writeInFlight);

    tap("room-back");
    const flushed = lastReplacedSearch();
    arriveAt(newerWrite);
    arriveAt(flushed);
    const writesAtThePush = replacedHrefs().length;
    advance(DEPARTURE_WATCH_MS);

    expect(fieldFor("wallA").value).toBe("36");
    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(replacedHrefs().length).toBe(writesAtThePush);
  });
});
