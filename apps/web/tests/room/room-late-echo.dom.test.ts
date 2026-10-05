// @vitest-environment happy-dom
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
import { DEPART_TO_PRESETS, DepartureProbe } from "../support/departure-probe";

/** A single `act` over a long clock advance batches a late echo's render with the next settle, so the older query
 *  is never observed: the clock steps 5 ms at a time, each step in its own `act`. */
const CLOCK_STEP_MS = 5;

/** Long enough after the last keystroke for every settle and every echo to have landed: the slowest
 *  chain is a late echo, the settle it re-arms, and that write's own slow round trip. */
const QUIET_AFTER_TYPING_MS = 3_000;

/** At least 100 runs per delivery order. */
const RUNS_PER_ORDER = 100;

const THE_EMPTY_L_ROOM = "shape=L&direction=left";
const AN_L_ROOM_AWAITING_ITS_CEILING =
  "shape=L&wallA=3.6&wallB=2.4&direction=left";

/**
 * How the router double hands a write back: `withheld` never (a test delivers it with `arriveAt`); `discard`
 * (Next: a newer navigation discards a pending one); `commit race` (an older committed write still renders before
 * the newer one); `mixed` (any in-flight write may echo, and the older ones are then discarded).
 */
type EchoDelivery = "withheld" | "discard" | "commit race" | "mixed";

interface PendingEcho {
  readonly search: string;
  isDue: boolean;
}

interface EchoingRouter {
  delivery: EchoDelivery;
  /** Cycled through, one per write, so each write has its own round trip. */
  delaysMs: readonly number[];
  writesSent: number;
  pending: PendingEcho[];
  /** Echoes that arrived after the customer had typed past what they carried. */
  lateEchoes: number;
  /** Echoes after which a field no longer read what the customer typed: a lost digit. */
  echoesThatOverwroteTyping: number;
  /** Echoes that landed while a later copy of their text was in flight, so the text cannot say which came back. */
  ambiguousArrivals: number;
  replacedAtMs: number[];
  /** A push dispatched and not yet landed: where it leads, as the query it will arrive with. */
  pendingPush: string | undefined;
  /** Pushes a later `replace` discarded before they landed: a dead *Înapoi*, or a lost 1F entry. */
  discardedPushes: number;
}

let container: HTMLDivElement;
let root: Root;
let router: EchoingRouter;
/** What the customer has typed so far, as the text each field should read. */
let typedSoFar: TypedText = {};

function freshRouter(delivery: EchoDelivery): EchoingRouter {
  return {
    delivery,
    delaysMs: [0],
    writesSent: 0,
    pending: [],
    lateEchoes: 0,
    echoesThatOverwroteTyping: 0,
    ambiguousArrivals: 0,
    replacedAtMs: [],
    pendingPush: undefined,
    discardedPushes: 0,
  };
}

/**
 * A push is pending until a test lands it with `landThePush`; a `replace` dispatched meanwhile discards it, as Next
 * discards a pending navigation when a newer one dispatches. Under `discard` delivery a push also drops every echo
 * still in flight.
 */
function dispatchPush(href: string): void {
  if (router.delivery === "discard") router.pending = [];
  router.pendingPush = searchOf(href);
}

function landThePush(): void {
  const destination = router.pendingPush;
  if (destination === undefined) throw new Error("no push is pending");
  router.pendingPush = undefined;
  arriveAt(destination);
}

function dispatchReplace(href: string): void {
  if (router.pendingPush !== undefined) {
    router.pendingPush = undefined;
    router.discardedPushes += 1;
  }
  router.replacedAtMs.push(Date.now());
  if (router.delivery === "withheld") return;
  const echo: PendingEcho = { search: searchOf(href), isDue: false };
  if (router.delivery === "discard") router.pending = [];
  router.pending.push(echo);
  const delay =
    router.delaysMs[router.writesSent % router.delaysMs.length] ?? 0;
  router.writesSent += 1;
  setTimeout(() => {
    echo.isDue = true;
    if (router.delivery === "mixed") deliverDiscardingOlder(echo);
    else deliverDueEchoesInOrder();
  }, delay);
}

/** Echoes commit in dispatch order, so a due echo waits for every older one still pending. */
function deliverDueEchoesInOrder(): void {
  for (let head = router.pending[0]; head?.isDue; head = router.pending[0]) {
    router.pending.shift();
    deliver(head);
  }
}

/** The `mixed` order: this echo lands now, and every older one still in flight never will. */
function deliverDiscardingOlder(echo: PendingEcho): void {
  const position = router.pending.indexOf(echo);
  if (position === -1) return;
  router.pending = router.pending.slice(position + 1);
  deliver(echo);
}

function deliver(echo: PendingEcho): void {
  if (echo.search !== canonicalTextOfTyped(typedSoFar)) router.lateEchoes += 1;
  if (router.pending.some(({ search }) => search === echo.search)) {
    router.ambiguousArrivals += 1;
  }
  arriveAt(echo.search);
  if (!doFieldsReadWhatWasTyped()) router.echoesThatOverwroteTyping += 1;
}

function doFieldsReadWhatWasTyped(): boolean {
  return Object.entries(typedSoFar).every(
    ([field, text]) => fieldFor(field as RoomLengthField).value === text,
  );
}

function arriveAt(search: string): void {
  browser.search = new URLSearchParams(search).toString();
  act(() => {
    root.render(theScreen());
  });
}

/** Whether the render is the departure state machine's harness rather than the screen: on an accepted room the
 *  screen's *Continuă* starts a composition that takes the form away. */
let rendersTheDepartureProbe = false;

function theScreen(): ReactElement {
  return createElement(NextIntlClientProvider, {
    children: rendersTheDepartureProbe
      ? createElement(DepartureProbe, { seedShape: "L" })
      : createElement(RoomScreen, {}),
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
  });
}

/** A browser Back or Forward, announced the way the browser announces it: before the arrival. */
function traverseTo(search: string): void {
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

function tapBack(): void {
  act(() => {
    elementAt("room-back").click();
  });
}

function replacedSearches(): readonly string[] {
  return browser.replace.mock.calls.map(([href]) => searchOf(String(href)));
}

function lastReplacedSearch(): string {
  const last = replacedSearches().at(-1);
  if (last === undefined) throw new Error("the screen has written nothing");
  return last;
}

/** Every 1C surface the customer can see, and *Continuă*'s state, read off the DOM at once. */
function oneCOnScreen() {
  const testIdsOf = (selector: string) =>
    [...container.querySelectorAll(selector)].map((element) =>
      element.getAttribute("data-testid"),
    );
  return {
    fieldReasons: testIdsOf("[data-testid^='room-length-reason-']"),
    invalidFields: testIdsOf("[aria-invalid='true']"),
    markedWalls: testIdsOf(
      "[data-testid^='room-plan-label-'][data-marked='true']",
    ),
    roomReasons: testIdsOf("[data-testid='room-room-reason']"),
    notes: testIdsOf("[data-testid='room-presets-after-valid']"),
    isContinueDisabled: (elementAt("room-continue") as HTMLButtonElement)
      .disabled,
  };
}

function mountFreshScreen(delivery: EchoDelivery): void {
  router = freshRouter(delivery);
  rendersTheDepartureProbe = false;
  typedSoFar = {};
  browser.push.mockClear();
  browser.replace.mockClear();
  browser.search = "";
  root = createRoot(container);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  browser.replace.mockImplementation(dispatchReplace);
  browser.push.mockImplementation(dispatchPush);
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

/** A write's round trip: 0–300 ms, plus one longer than the settle, since only then can two writes be in flight
 *  and the commit-race order differ from the discard order. */
const ANY_ROUND_TRIP_MS = fc.oneof(
  fc.integer({ min: 0, max: 300 }),
  fc.integer({ min: URL_SETTLE_MS, max: 1_300 }),
);

/** A keystroke: one digit or a backspace. The alphabet is small on purpose: a written text must recur (3, 36, 3)
 *  to tell the oldest copy from the newest. No zero is typed: the whole-millimetre field refuses a leading zero. */
type Keystroke = "3" | "6" | "backspace";

const ANY_KEYSTROKE = fc.constantFrom<Keystroke>("3", "6", "backspace");

function afterKeystroke(text: string, keystroke: Keystroke): string {
  return keystroke === "backspace" ? text.slice(0, -1) : text + keystroke;
}

type FieldPattern = "wall A only" | "wall A and the height";

interface TypingRunDraw {
  readonly fieldPattern: FieldPattern;
  readonly strokes: readonly Keystroke[];
  readonly gapsMs: readonly number[];
  readonly echoDelaysMs: readonly number[];
}

const ANY_TYPING_RUN = fc
  .record({
    fieldPattern: fc.constantFrom<FieldPattern>(
      "wall A only",
      "wall A and the height",
    ),
    strokes: fc.array(ANY_KEYSTROKE, { minLength: 2, maxLength: 6 }),
    // The keystroke must land inside a write's round trip, which opens at the settle.
    gapsMs: fc.array(fc.integer({ min: 350, max: 500 }), {
      minLength: 5,
      maxLength: 5,
    }),
    echoDelaysMs: fc.array(ANY_ROUND_TRIP_MS, { minLength: 1, maxLength: 6 }),
  })
  .map(typingRunOf);

type TypingRun = ReturnType<typeof typingRunOf>;

function typingRunOf(draw: TypingRunDraw) {
  return {
    ...draw,
    keystrokes: draw.strokes.map((keystroke, index) => ({
      field: fieldAt(draw.fieldPattern, index),
      keystroke,
      gapBeforeMs: index === 0 ? 0 : (draw.gapsMs[index - 1] ?? 0),
    })),
  };
}

/** 3, 36, back to 3, then 33 writes A, B, A with every round trip longer than two gaps, so all three are in flight
 *  when the first A lands. Given to fast-check as an example, since a random draw rarely hits it. */
const QA_F1_RUN: TypingRun = typingRunOf({
  fieldPattern: "wall A only",
  strokes: ["3", "6", "backspace", "3"],
  gapsMs: [420, 420, 420, 420, 420],
  echoDelaysMs: [1_100],
});

function fieldAt(pattern: FieldPattern, index: number): RoomLengthField {
  return pattern === "wall A and the height" && index % 2 === 1
    ? "height"
    : "wallA";
}

/** What the customer typed, as the text each field should read. */
type TypedText = Partial<Record<RoomLengthField, string>>;

/** The query the typed room should end on: the draft's canonical text, built outside the screen. */
function canonicalTextOfTyped(typed: TypedText): string {
  const typedDraft = Object.entries(typed).reduce(
    (draft, [field, text]) =>
      withEnteredText(draft, { field: field as RoomLengthField, text }),
    roomDraftFromQuery("L", { direction: "left" }),
  );
  return canonicalRoomQuery(typedDraft).toString();
}

function gapsBetween(times: readonly number[]): readonly number[] {
  return times.slice(1).map((time, index) => time - (times[index] ?? time));
}

describe("no typed digit is lost around the settle (S3b-1)", () => {
  const deliveries = ["discard", "commit race", "mixed"] as const;

  it.each(deliveries)(
    "keeps every keystroke typed through a write's round trip, with %s",
    (delivery) => {
      let runsWithALateEcho = 0;
      let runsWithAnAmbiguousArrival = 0;
      fc.assert(
        fc.property(ANY_TYPING_RUN, (run) => {
          act(() => {
            root.unmount();
          });
          vi.clearAllTimers();
          mountFreshScreen(delivery);
          router.delaysMs = run.echoDelaysMs;
          const typed: TypedText = {};
          typedSoFar = typed;
          arriveAt(THE_EMPTY_L_ROOM);

          for (const { field, keystroke, gapBeforeMs } of run.keystrokes) {
            advance(gapBeforeMs);
            typed[field] = afterKeystroke(typed[field] ?? "", keystroke);
            type(field, typed[field]);
          }
          advance(QUIET_AFTER_TYPING_MS);

          if (router.lateEchoes > 0) runsWithALateEcho += 1;
          expect(router.echoesThatOverwroteTyping).toBe(0);
          if (router.ambiguousArrivals > 0) runsWithAnAmbiguousArrival += 1;
          for (const [field, text] of Object.entries(typed)) {
            expect(fieldFor(field as RoomLengthField).value).toBe(text);
          }
          expect(browser.search).toBe(canonicalTextOfTyped(typed));
          for (const gap of gapsBetween(router.replacedAtMs)) {
            expect(gap).toBeGreaterThanOrEqual(URL_SETTLE_MS);
          }
        }),
        { numRuns: RUNS_PER_ORDER, examples: [[QA_F1_RUN]] },
      );
      // The discriminating population is a keystroke inside a round trip: the sweep must have drawn it (ADR 0121).
      expect(runsWithALateEcho).toBeGreaterThanOrEqual(RUNS_PER_ORDER / 4);
      // An echo landing while a later copy of its text is in flight; discard cannot produce one, the other two must.
      if (delivery !== "discard") {
        expect(runsWithAnAmbiguousArrival).toBeGreaterThan(0);
      }
    },
  );

  it("keeps 36 when the write of 3 echoes after the 6 was typed (QA's repro)", () => {
    arriveAt(THE_EMPTY_L_ROOM);
    type("wallA", "3");
    advance(URL_SETTLE_MS);
    const writtenAtThree = lastReplacedSearch();

    type("wallA", "36");
    arriveAt(writtenAtThree);

    expect(fieldFor("wallA").value).toBe("36");
  });
});

describe("the first keystroke after 1B appears survives the canonicalising write (S3b-2)", () => {
  it("keeps the 3 typed while the write of direction=left was in flight, and writes it next", () => {
    arriveAt("shape=L");
    advance(URL_SETTLE_MS);
    const canonicalisingWrite = lastReplacedSearch();
    expect(canonicalisingWrite).toBe(THE_EMPTY_L_ROOM);

    type("wallA", "3");
    arriveAt(canonicalisingWrite);
    advance(URL_SETTLE_MS);

    expect(fieldFor("wallA").value).toBe("3");
    expect(lastReplacedSearch()).toBe("shape=L&wallA=0.003&direction=left");
  });
});

describe("a traversal still re-seeds, even onto a write still in flight (S3b-3)", () => {
  it("shows the arrived room's 3 when Back lands on the very query a write had in flight", () => {
    arriveAt(THE_EMPTY_L_ROOM);
    type("wallA", "3");
    advance(URL_SETTLE_MS);
    const inFlight = lastReplacedSearch();
    type("wallA", "36");

    traverseTo(inFlight);

    // Next discards the pending write when the traversal dispatches, so this arrival can only be the
    // entry the customer went to, and that entry's room is what they must see.
    expect(fieldFor("wallA").value).toBe("3");
  });
});

describe("D45's residue is unchanged by the writes in flight (S3b-4)", () => {
  /** A room whose wall A holds text that is not whole millimetres, so the draft's canonical text carries no wall A,
   *  with that text written by the settle and its echo withheld. */
  function typeUnparsedTextIntoAnEnteredRoom(): string {
    arriveAt("shape=L&wallA=3.6&height=2.6&direction=left");
    type("wallA", "3,6");
    advance(URL_SETTLE_MS);
    return lastReplacedSearch();
  }

  it("keeps the unparsed text when our own write of the draft's text echoes", () => {
    const draftText = typeUnparsedTextIntoAnEnteredRoom();

    arriveAt(draftText);

    expect(fieldFor("wallA").value).toBe("3,6");
  });

  it("keeps the unparsed text when a Back lands on the draft's text", () => {
    const draftText = typeUnparsedTextIntoAnEnteredRoom();

    traverseTo(draftText);

    expect(fieldFor("wallA").value).toBe("3,6");
  });
});

describe("a late echo mid-burst leaves 1C as the burst found it (S3b-5)", () => {
  it("shows no new reason for a height typed past its bound until the pause, echo or not", () => {
    arriveAt(AN_L_ROOM_AWAITING_ITS_CEILING);
    type("height", "2600");
    advance(URL_SETTLE_MS);
    const writtenAtAValidRoom = lastReplacedSearch();
    const atTheBurstsStart = oneCOnScreen();

    type("height", "26000");
    arriveAt(writtenAtAValidRoom);

    expect(fieldFor("height").value).toBe("26000");
    expect(oneCOnScreen()).toEqual(atTheBurstsStart);

    // Not vacuous: the height typed is refused, and the pause shows it.
    advance(URL_SETTLE_MS);
    expect(oneCOnScreen().fieldReasons).toEqual(["room-length-reason-height"]);
  });
});

describe("a departure is exactly D45's, with a write in flight (S3b-6)", () => {
  it("pushes once and writes nothing after, when a stray digit follows the tap on the screen's Back", () => {
    arriveAt(THE_EMPTY_L_ROOM);
    type("wallA", "3");
    advance(URL_SETTLE_MS);
    const inFlight = lastReplacedSearch();

    tapBack();
    expect(lastReplacedSearch()).toBe(inFlight);
    type("wallA", "36");
    arriveAt(inFlight);
    const writesAfterThePush = browser.replace.mock.calls.length;
    advance(1_500);

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.replace.mock.calls.length).toBe(writesAfterThePush);
    // Accepted limit: a character typed between the tap and its flush landing is lost.
    expect(fieldFor("wallA").value).toBe("3");
  });

  it("lands a direct Back's push when a write still in flight echoes after the tap", () => {
    // Typed back to the live text, the tap takes the direct path, with a write in flight.
    arriveAt(THE_EMPTY_L_ROOM);
    type("wallA", "3");
    advance(URL_SETTLE_MS);
    const inFlight = lastReplacedSearch();
    type("wallA", "");

    tapBack();
    const writesAtTheTap = replacedSearches().length;
    arriveAt(inFlight);
    advance(1_500);

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(replacedSearches().slice(writesAtTheTap)).toEqual([]);
    expect(router.discardedPushes).toBe(0);
    landThePush();
    expect(elementAt("room-shape-card-L")).toBeDefined();
  });

  it("keeps the 1F entry: a direct presets push lands when a write still in flight echoes after the tap", () => {
    // The presets destination: a valid room, retyped away and back to its own text.
    const aValidRoom = "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left";
    rendersTheDepartureProbe = true;
    arriveAt(aValidRoom);
    type("wallA", "3");
    advance(URL_SETTLE_MS);
    const inFlight = lastReplacedSearch();
    type("wallA", "3600");

    act(() => {
      elementAt(DEPART_TO_PRESETS).click();
    });
    const writesAtTheTap = replacedSearches().length;
    arriveAt(inFlight);
    advance(1_500);

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(replacedSearches().slice(writesAtTheTap)).toEqual([]);
    expect(router.discardedPushes).toBe(0);
    landThePush();
    expect(browser.search).toBe(aValidRoom);
    expect(fieldFor("wallA").value).toBe("3600");
  });
});

describe("after a late echo the loop writes once more and settles (S3b-7)", () => {
  it("writes the draft's text exactly once, and nothing in the interval after its echo", () => {
    arriveAt(THE_EMPTY_L_ROOM);
    type("wallA", "3");
    advance(URL_SETTLE_MS);
    type("wallA", "36");
    arriveAt(lastReplacedSearch());
    const writesBeforeTheLateEcho = replacedSearches().length;

    advance(URL_SETTLE_MS);
    const writesSinceTheLateEcho = replacedSearches().slice(
      writesBeforeTheLateEcho,
    );
    arriveAt(lastReplacedSearch());
    advance(QUIET_AFTER_TYPING_MS);

    expect(writesSinceTheLateEcho).toEqual([
      "shape=L&wallA=0.036&direction=left",
    ]);
    expect(replacedSearches().length).toBe(writesBeforeTheLateEcho + 1);
  });
});
