// @vitest-environment happy-dom
//
// **Adversarial QA — wave 7F1-D45, the convergence loop between the draft and the URL.**
//
// The wave's own suites assert the loop over rooms the product approves and over one hostile key.
// This file attacks the seams those cannot reach:
//
// - **the echo discriminator's residue is bounded** — the plan accepts *one* residue (unparsed text
//   like *"3,"* surviving a Back that lands on the draft's own query) and forbids chasing it. What
//   it does **not** state is that nothing worse can hide behind the same comparison. That is a
//   property over drafts, not an example, and it is the first `describe` below;
// - **criterion 21's at-most-one-write, over queries nobody would write on purpose** — repeated keys
//   on every field, unknown keys, an empty key, unicode digits, a value 10 000 characters long, a
//   query with a hundred keys;
// - **the departure state machine as a sequence rather than as four arms** — two taps, a tap with a
//   keystroke between them, a tap a traversal overtakes, and a flush that never lands;
// - **`ru`**, which the wave's gate records as not exercised: idempotence and the flush's
//   byte-identical round trip both rested on a locale-dependent format, and both suites render `ro`.
//   Since wave 7F2 S1b (ADR 0126) a field shows whole millimetres and the draft takes no locale, so
//   only the href builder's prefix is still swept over both.
//
// **Every guard here was falsified against a deliberate break in `room-query-sync.ts` before it was
// kept**; the break each one catches is named on the test.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
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

import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  carriesCornerDirection,
  createRoomDraft,
  withCornerDirection,
  withEnteredText,
  type RoomDraft,
} from "@/room/room-draft";
import {
  canonicalRoomQuery,
  queryEntriesOf,
  queryFromSearchParams,
  reconcileRoomDraft,
  roomDraftFromQuery,
  roomShapeInQuery,
  URL_SETTLE_MS,
} from "@/room/room-query-sync";
import { RoomScreen, type RoomScreenProps } from "@/room/room-screen";
import {
  requiredFieldsFor,
  type RoomSearchParams,
} from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import {
  DEPART_TO_PRESETS,
  DEPART_TO_SHAPES,
  DepartureProbe,
} from "../support/departure-probe";

/** Wide enough that a transition between two readings of a length cannot hide between examples. */
const SWEEP_RUNS = 500;

/** A render each, so a sweep over the screen costs a DOM tree per case. */
const SCREEN_SWEEP_RUNS = 200;

const EVERY_SHAPE: readonly RoomShape[] = ["linear", "L", "U"];

/** Every locale `routing.ts` declares, read from it rather than restated — the wave's gate records
 *  `ru` as unexercised, and the flush's byte-identical round trip goes through a builder that prefixes
 *  the locale. A third locale is covered the day it is added. */
const EVERY_LOCALE = routing.locales;

const ROOM_PATHNAME = "/configurator/room";

function queryOf(search: string): RoomSearchParams {
  return queryFromSearchParams(new URLSearchParams(search));
}

function canonicalTextOf(draft: RoomDraft): string {
  return canonicalRoomQuery(draft).toString();
}

function draftFrom(search: string): RoomDraft {
  const query = queryOf(search);
  return roomDraftFromQuery(roomShapeInQuery(query) ?? "L", query);
}

// ---------------------------------------------------------------------------------------------
// The echo discriminator: what a draft can still be hiding when its own query comes back
// ---------------------------------------------------------------------------------------------

/** A draft as the customer could have left it: a room from a query, then some text typed over one
 *  field — including text that never reads as a length, which is the residue the plan accepts. */
const ANY_DRAFT: fc.Arbitrary<RoomDraft> = fc
  .record({
    shape: fc.constantFrom(...EVERY_SHAPE),
    direction: fc.constantFrom("left", "right"),
    typed: fc.array(
      fc.tuple(
        fc.constantFrom("wallA", "wallB", "wallC", "height"),
        fc.oneof(
          fc.constantFrom(
            "3,",
            "3,56",
            "3560",
            "03560",
            "1",
            "",
            " ",
            "-1",
            "0",
          ),
          fc.integer({ min: 1, max: 9_999_999 }).map(String),
        ),
      ),
      { maxLength: 4 },
    ),
  })
  .map(({ shape, direction, typed }) =>
    typed.reduce(
      (draft, [field, text]) => withEnteredText(draft, { field, text }),
      withCornerDirection(createRoomDraft(shape), direction),
    ),
  );

describe("the echo keeps a draft, and what it keeps is only what nobody can see", () => {
  it("agrees with a re-seed on the shape, every asked-for length and the direction", () => {
    // **The accepted limit, asserted as a bound rather than as an example.** The plan admits one
    // residue — text that never parsed staying in its field — and forbids adding a second
    // discriminator to chase it. Nothing in the wave states that the residue stops there, and a
    // worse one would be invisible: every URL assertion in both DOM suites passes either way,
    // because by construction the URL and the kept draft agree.
    //
    // So the claim is made against the counterfactual: had the same live query been read as a
    // different room, the draft it produced would show the **same room** — same shape, same
    // millimetres in every field the shape asks for, same corner for the shapes that turn one. Only
    // the notation a field shows may differ, and only where the URL carries no value at all.
    fc.assert(
      fc.property(ANY_DRAFT, (draft) => {
        const ourOwnWrite = canonicalTextOf(draft);

        const kept = reconcileRoomDraft({
          draft,
          lastSeenText: "shape=bogus",
          liveQuery: queryOf(ourOwnWrite),
          liveText: ourOwnWrite,
        }).draft;
        const reseeded = draftFrom(ourOwnWrite);

        expect(kept).toBe(draft);
        expect(kept.shape).toBe(reseeded.shape);
        for (const field of requiredFieldsFor(kept.shape)) {
          expect(kept.lengths[field].millimetres).toBe(
            reseeded.lengths[field].millimetres,
          );
        }
        if (carriesCornerDirection(kept.shape)) {
          expect(kept.cornerDirection).toBe(reseeded.cornerDirection);
        }
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("keeps a field the shape does not ask for, which is the customer's own earlier answer", () => {
    // Recorded as behaviour rather than filed as a defect. A U's third wall survives a switch to L
    // and comes back if the customer switches back — `withRoomShape`'s stated rule, *"the shape
    // decides which fields are asked for, never what the customer has already said about a wall"*.
    // It is invisible while the shape does not ask for it, so it is not a second residue class.
    const uRoom = draftFrom(
      "shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=left",
    );
    const asAnL: RoomDraft = { ...uRoom, shape: "L" };

    expect(canonicalTextOf(asAnL)).not.toContain("wallC");
    expect(asAnL.lengths.wallC.text).toBe("2180");
  });
});

// ---------------------------------------------------------------------------------------------
// Idempotence and the flush's round trip, at the parser's own limits and through both locales' paths
// ---------------------------------------------------------------------------------------------

/** Lengths at the transitions rather than in the middle of a range: the smallest millimetre, the
 *  values whose display notation pads or strips a zero, and the largest the parser accepts at all. */
const ANY_LENGTH_TEXT = fc.oneof(
  fc
    .integer({ min: 1, max: 9_999_999 })
    .map(
      (mm) =>
        `${String(Math.floor(mm / 1000))}.${String(mm % 1000).padStart(3, "0")}`,
    ),
  fc.constantFrom(
    "0.001",
    "0.01",
    "0.1",
    "1",
    "1.000",
    "3.0600",
    "3.06",
    "3.6",
    "9007199254740.991",
    "9007199254740.992",
    "0003.56",
    "3,56",
    "3.5605",
    "-3.56",
    "0",
    "",
    "3,",
    " 3.56 ",
    "１.２３",
    "٣.٥٦",
  ),
  fc.string({ maxLength: 12 }),
);

const ANY_ARRIVING_QUERY = fc.record({
  shape: fc.oneof(fc.constantFrom(...EVERY_SHAPE, "bogus", ""), fc.string()),
  wallA: ANY_LENGTH_TEXT,
  wallB: ANY_LENGTH_TEXT,
  wallC: ANY_LENGTH_TEXT,
  height: ANY_LENGTH_TEXT,
  direction: fc.constantFrom("left", "right", "LEFT", "sideways", ""),
});

describe("the loop settles once, at the parser's own limits", () => {
  it("writes a query that reading and writing again reproduces exactly", () => {
    // Criterion 21's property, widened on the axis the wave's own sweep pins: the lengths there are
    // ordinary. A refill the parser could not read back would make every field drop out of the
    // canonical query on the *second* pass, and the screen would issue a navigation every settle
    // interval, for ever. (The locale axis this once swept is gone: since ADR 0126 the refill writes
    // whole millimetres and takes no locale.)
    fc.assert(
      fc.property(
        ANY_ARRIVING_QUERY,
        fc.constantFrom(...EVERY_SHAPE),
        (query, fallbackShape) => {
          const shape = roomShapeInQuery(query) ?? fallbackShape;

          const once = canonicalTextOf(roomDraftFromQuery(shape, query));
          const twice = canonicalTextOf(
            roomDraftFromQuery(
              roomShapeInQuery(queryOf(once)) ?? fallbackShape,
              queryOf(once),
            ),
          );

          expect(twice).toBe(once);
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("puts the same millimetres in the field as it puts in the query", () => {
    // The half idempotence alone cannot see: a formatter and a serialiser can agree with each other
    // about a fixed point while both describe a room other than the one the URL names.
    fc.assert(
      fc.property(
        ANY_ARRIVING_QUERY,
        fc.constantFrom(...EVERY_SHAPE),
        (query, fallbackShape) => {
          const shape = roomShapeInQuery(query) ?? fallbackShape;
          const draft = roomDraftFromQuery(shape, query);
          const written = new URLSearchParams(canonicalTextOf(draft));

          for (const field of requiredFieldsFor(shape)) {
            const inTheQuery = written.get(field);
            const inTheField = draft.lengths[field].millimetres;
            if (inTheQuery === null) {
              expect(inTheField).toBeUndefined();
            } else {
              expect(
                roomDraftFromQuery(shape, { shape, [field]: inTheQuery })
                  .lengths[field].millimetres,
              ).toBe(inTheField);
            }
          }
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("comes back from next-intl's href builder byte for byte, in either locale", () => {
    // **What strand-freedom actually rests on.** A departure recognises its own flush by string
    // equality between the text it wrote and `useSearchParams().toString()`. The wave asserts this
    // for `ro`; a locale prefix is the one thing that differs between the two, and a builder that
    // re-encoded a value while prefixing would strand every departure with criterion 21 still green.
    fc.assert(
      fc.property(
        ANY_ARRIVING_QUERY,
        fc.constantFrom(...EVERY_SHAPE),
        fc.constantFrom(...EVERY_LOCALE),
        (query, fallbackShape, locale) => {
          const shape = roomShapeInQuery(query) ?? fallbackShape;
          const flushed = canonicalTextOf(roomDraftFromQuery(shape, query));

          const href = getPathname({
            href: { pathname: ROOM_PATHNAME, query: queryEntriesOf(flushed) },
            locale,
          });
          const questionMark = href.indexOf("?");

          expect(href.startsWith(`/${locale}${ROOM_PATHNAME}`)).toBe(true);
          expect(
            new URLSearchParams(
              questionMark === -1 ? "" : href.slice(questionMark + 1),
            ).toString(),
          ).toBe(flushed);
        },
      ),
      { numRuns: SWEEP_RUNS },
    );
  });

  it.each(EVERY_LOCALE)(
    "keeps a full U room's six keys in their canonical order under %s",
    (locale) => {
      // The concrete case beside the sweep: six keys is the longest query this screen writes, and
      // *"same bytes"* is mostly a claim about order that a sweep can satisfy by luck of one shape.
      const flushed =
        "shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=right";

      expect(
        getPathname({
          href: { pathname: ROOM_PATHNAME, query: queryEntriesOf(flushed) },
          locale,
        }),
      ).toBe(`/${locale}${ROOM_PATHNAME}?${flushed}`);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// The screen, under queries nobody would write on purpose
// ---------------------------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let screenProps: RoomScreenProps;

/**
 * Whether the `replace` double echoes straight back, and the write it is holding when it does not.
 *
 * **One slot, because Next has one.** `app-router-instance.js:141-152` — read in the installed
 * 16.3.4 — marks a pending action **discarded** when a second navigation is dispatched, and
 * `runAction`'s `handleResult` (`:79-90`) returns before `actionQueue.state = nextState` for a
 * discarded one. So when two flushes are issued before either commits, the client only ever sees
 * the second. A double that delivered both would be modelling a router this repository does not
 * have — and it would report a strand that cannot happen.
 */
let echoesEveryWrite = true;
let theWithheldEcho: string | undefined;

/** Whether `arriveAt` re-renders the departure probe rather than the screen (7F2 criterion 13). */
let mountsTheDepartureProbe = false;

function render(search: string): void {
  screenProps = {};
  mountsTheDepartureProbe = false;
  arriveAt(search);
}

/** The departure sequences' arrival: the sync and its departure over this query, with no screen
 *  around them — see `tests/support/departure-probe.ts` for why they moved. */
function renderTheDepartureProbe(search: string): void {
  mountsTheDepartureProbe = true;
  arriveAt(search);
}

function arriveAt(search: string): void {
  browser.search = new URLSearchParams(search).toString();
  window.history.replaceState(
    null,
    "",
    browser.search === ""
      ? browser.pathname
      : `${browser.pathname}?${browser.search}`,
  );
  act(() => {
    root.render(theScreen());
  });
}

function theScreen(): ReactElement {
  return createElement(NextIntlClientProvider, {
    children: mountsTheDepartureProbe
      ? createElement(DepartureProbe, {
          seedShape: roomShapeInQuery(queryOf(browser.search)) ?? "L",
        })
      : createElement(RoomScreen, screenProps),
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
  });
}

function searchOf(href: string): string {
  const questionMark = href.indexOf("?");
  return questionMark === -1 ? "" : href.slice(questionMark + 1);
}

function settle(): void {
  act(() => {
    vi.advanceTimersByTime(URL_SETTLE_MS);
  });
}

function withholdTheEchoes(): void {
  echoesEveryWrite = false;
}

/** The one write the router still holds, committing. Any earlier one was discarded by the rule
 *  quoted above and never reaches the client at all. */
function deliverTheEcho(): void {
  if (theWithheldEcho === undefined) {
    throw new Error(
      "no write is being withheld, so there is no echo to deliver",
    );
  }
  const search = theWithheldEcho;
  theWithheldEcho = undefined;
  arriveAt(search);
}

function dropTheWithheldWrite(): void {
  theWithheldEcho = undefined;
}

function elementAt(testId: string): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the screen draws no ${testId}`);
  }
  return element;
}

function fieldFor(field: string): HTMLInputElement {
  const input = elementAt(`room-length-${field}`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`the ${field} field is not an input`);
  }
  return input;
}

function type(field: string, text: string): void {
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

function cornerControl(direction: "left" | "right"): HTMLInputElement {
  const control = elementAt(`room-corner-control-${direction}`);
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`the ${direction} corner chip holds no control`);
  }
  return control;
}

function addressBar(): string {
  return window.location.search;
}

/** The query the screen has come to rest on, as the customer's own address bar reports it. */
function restingQuery(): string {
  return addressBar().replace(/^\?/, "");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  browser.push.mockClear();
  browser.replace.mockClear();
  echoesEveryWrite = true;
  theWithheldEcho = undefined;
  mountsTheDepartureProbe = false;
  browser.replace.mockImplementation((href: string) => {
    if (echoesEveryWrite) {
      arriveAt(searchOf(href));
      return;
    }
    // The newer write supersedes the one still pending, which is what Next does to it.
    theWithheldEcho = searchOf(href);
  });
  browser.search = "";
  window.history.replaceState(null, "", browser.pathname);
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

/** The canonical keys a shape's query may hold, and the only ones a write may leave behind. */
function canonicalKeysFor(shape: RoomShape): readonly string[] {
  return [
    "shape",
    ...requiredFieldsFor(shape),
    ...(carriesCornerDirection(shape) ? ["direction"] : []),
  ];
}

const A_HOSTILE_KEY = fc.constantFrom(
  "shape",
  "wallA",
  "wallB",
  "wallC",
  "height",
  "direction",
  "utm_source",
  "",
  "0",
  "a b",
  "shape ",
  "SHAPE",
);

const A_HOSTILE_VALUE = fc.oneof(
  fc.constantFrom(
    "L",
    "U",
    "linear",
    "left",
    "right",
    "LEFT",
    "3.56",
    "3,56",
    "3.5605",
    "-1",
    "0",
    "",
    "3,",
    "٣.٥٦",
    "１.２３",
    "a|b",
    "%",
    "+",
    "&shape=L",
    "1e3",
    "9007199254740.991",
    "99999999999999999999",
  ),
  fc.string({ maxLength: 16 }),
);

/** A query as a browser would hand it over, repeated keys and all. */
const A_HOSTILE_QUERY = fc
  .array(fc.tuple(A_HOSTILE_KEY, A_HOSTILE_VALUE), { maxLength: 8 })
  .map((pairs) => {
    const params = new URLSearchParams();
    for (const [key, value] of pairs) params.append(key, value);
    return params.toString();
  });

describe("criterion 21 over queries nobody would write on purpose", () => {
  it("writes at most once, and nothing at all on the settle after that", () => {
    // **Risk 1, over the input space the wave's own sweep does not reach.** Its 250 cases are rooms
    // the approved policy describes; these are repeated keys on every field, unknown keys, an empty
    // key, a value that spells another parameter, unicode digits and text. A query the canonical
    // write does not reach a fixed point over would cost one request per settle interval, per
    // customer, for as long as the tab is open.
    fc.assert(
      fc.property(A_HOSTILE_QUERY, (search) => {
        browser.replace.mockClear();

        render(search);
        settle();
        const afterTheFirstSettle = browser.replace.mock.calls.length;
        settle();

        // A query naming no room gets **no** write, not one: *at most one* is the 1B bound, and
        // reusing it for 1A is how a screen that erased the arriving link would pass this sweep.
        const namesARoom = roomShapeInQuery(queryOf(search)) !== undefined;
        expect(afterTheFirstSettle).toBeLessThanOrEqual(namesARoom ? 1 : 0);
        expect(browser.replace.mock.calls.length).toBe(afterTheFirstSettle);
      }),
      { numRuns: SCREEN_SWEEP_RUNS },
    );
  });

  it("comes to rest on a query the screen would write again unchanged", () => {
    // *"At most one write"* is satisfied by a screen that writes nothing and sits on a URL it
    // disagrees with. This is the other half: whatever the screen settles on, reading it back and
    // writing it produces the same bytes — so the address bar the customer is left with is one the
    // loop has actually converged on rather than one it gave up on.
    fc.assert(
      fc.property(A_HOSTILE_QUERY, (search) => {
        render(search);
        settle();
        settle();

        const resting = restingQuery();
        const shape = roomShapeInQuery(queryOf(resting));
        if (shape === undefined) {
          expect(resting).toBe(new URLSearchParams(search).toString());
          return;
        }
        expect(canonicalTextOf(draftFrom(resting))).toBe(resting);
        expect([...new URLSearchParams(resting).keys()]).toEqual(
          [...canonicalKeysFor(shape)].filter((key) =>
            new URLSearchParams(resting).has(key),
          ),
        );
      }),
      { numRuns: SCREEN_SWEEP_RUNS },
    );
  });
});

describe("a repeated key is not a value, on every field the contract covers", () => {
  const A_FULL_U_ROOM =
    "shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=left";

  it.each(["wallA", "wallB", "wallC", "height"] as const)(
    "empties %s and drops it from the query when the URL answers it twice",
    (field) => {
      // The shipped contract, swept across the fields rather than asserted for `wallA` alone —
      // `singleValue` is one function, but the fields reach it by four different routes.
      render(`${A_FULL_U_ROOM}&${field}=9.99`);
      settle();

      expect(fieldFor(field).value).toBe("");
      expect(new URLSearchParams(addressBar()).has(field)).toBe(false);
    },
  );

  it("empties the field even when both answers agree", () => {
    // The case that looks harmless and is the same contract: two answers are two answers, and a
    // form that collapsed them because they matched would be picking a value the parser refuses.
    render(
      "shape=L&wallA=3.56&wallA=3.56&wallB=2.92&height=2.6&direction=left",
    );
    settle();

    expect(fieldFor("wallA").value).toBe("");
    expect(new URLSearchParams(addressBar()).has("wallA")).toBe(false);
  });

  it("falls back to the toggle's own position when direction is answered twice", () => {
    // **`right` first on purpose.** With `left` first, a reader that silently took the first of two
    // answers would produce the same `left` the draft starts at, and the test would pass over the
    // defect it exists to catch — the vacuous pass this whole seam is exposed to.
    render(
      "shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=right&direction=left",
    );
    settle();

    expect(cornerControl("right").checked).toBe(false);
    expect(new URLSearchParams(addressBar()).get("direction")).toBe("left");
  });

  it("shows the shape step when the shape itself is answered twice", () => {
    // I6's boundary through the repeated-key seam: two shapes name no room, so there is no room to
    // write and the link the customer arrived on must survive untouched.
    render(`${A_FULL_U_ROOM}&shape=L`);
    settle();

    expect(elementAt("room-shapes")).toBeInstanceOf(HTMLElement);
    expect(browser.replace).not.toHaveBeenCalled();
    expect(browser.push).not.toHaveBeenCalled();
  });
});

describe("a query that names no room is a query the screen must not touch (I6)", () => {
  it.each([
    ["an empty query", ""],
    ["a shape key with no value", "shape="],
    ["a direction and nothing else", "direction=left"],
    ["a shape the product does not have", "shape=hexagonal&wallA=3.56"],
    ["a shape answered twice", "shape=L&shape=U&wallA=3.56&height=2.6"],
  ])("asks the router for nothing at all for %s", (_case, search) => {
    // **Zero, not *at most one*.** These cases were written as *"settles in at most one write"*
    // alongside the 1B ones, and a break that made 1A writable left them green — one write satisfies
    // *at most one*. I6 is not a bound on the number of writes at 1A, it is their absence: the
    // customer arrived on a link, and a screen that rewrote it before they had done anything would
    // erase the thing they followed.
    render(search);
    settle();
    settle();

    expect(browser.replace).not.toHaveBeenCalled();
    expect(browser.push).not.toHaveBeenCalled();
    expect(restingQuery()).toBe(new URLSearchParams(search).toString());
  });
});

describe("hostile arrivals the screen must survive without writing twice", () => {
  it.each([
    [
      "an uppercase direction",
      "shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=LEFT",
    ],
    ["a pipe in a length", "shape=L&wallA=3%7C56&wallB=2.92&height=2.6"],
    ["a percent sign in a length", "shape=L&wallA=%25&wallB=2.92&height=2.6"],
    ["a plus in a length", "shape=L&wallA=3%2B56&wallB=2.92&height=2.6"],
    [
      "an ampersand inside a value",
      "shape=L&wallA=3.56%26wallB%3D9&height=2.6",
    ],
    [
      "unicode digits",
      "shape=L&wallA=%D9%A3.%D9%A5%D9%A6&wallB=2.92&height=2.6",
    ],
    [
      "a length 10 000 characters long",
      `shape=L&wallA=${"9".repeat(10_000)}&height=2.6`,
    ],
  ])("settles in at most one write for %s", (_case, search) => {
    render(search);
    settle();
    const afterTheFirstSettle = browser.replace.mock.calls.length;
    settle();

    expect(afterTheFirstSettle).toBeLessThanOrEqual(1);
    expect(browser.replace.mock.calls.length).toBe(afterTheFirstSettle);
  });

  it("carries none of a hundred unknown keys into the query it writes", () => {
    const noise = Array.from(
      { length: 100 },
      (_unused, index) => `k${String(index)}=v${String(index)}`,
    ).join("&");

    render(`shape=L&wallA=3.56&wallB=2.92&height=2.6&${noise}`);
    settle();

    expect(restingQuery()).toBe(
      "shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left",
    );
    expect(browser.replace).toHaveBeenCalledTimes(1);
  });

  it("refuses a length that only a lenient number reader would accept", () => {
    // `Number("1e3")` is 1000 and `Number("3 560")` is `NaN` only by luck of the space. The parser
    // reads a digit string with at most one separator, so neither is a length, and neither may
    // reach a field or the query.
    render("shape=L&wallA=1e3&wallB=3%20560&height=2.6&direction=left");
    settle();

    expect(fieldFor("wallA").value).toBe("");
    expect(fieldFor("wallB").value).toBe("");
    expect(restingQuery()).toBe("shape=L&height=2.6&direction=left");
  });

  it("reads a length the URL padded with spaces, and writes it back trimmed", () => {
    // The deliberate half of the same rule: `parseMetresToMillimetres` trims before it matches, so
    // `?wallA=%203.56%20` is the room the customer stored and not a refusal. Asserted because the
    // trim is what makes the case above a *shape* question rather than a whitespace one — and
    // because the value that goes back into the query must be the trimmed one, or the loop would
    // write a query that arrives as a different string every settle.
    render("shape=L&wallA=%203.56%20&wallB=2.92&height=2.6&direction=left");
    settle();
    settle();

    expect(fieldFor("wallA").value).toBe("3560");
    expect(restingQuery()).toBe(
      "shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left",
    );
    expect(browser.replace).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
// The departure, as a sequence
// ---------------------------------------------------------------------------------------------

/**
 * **Driven on the departure probe, not on the screen** (re-homed by wave 7F2, criterion 13). Every
 * sequence here leads with *Continuă* and then needs a second tap or a keystroke, so the form has to
 * survive the first tap. On a room the domain accepts it does not — the tap starts sub-state 1F in
 * the same commit (7F4a) — and from 7F2 a room the domain refuses has no active *Continuă* to tap
 * (ADR 0120 decision 4). `tests/support/departure-probe.ts` runs the same `useRoomQuerySync` and the
 * same `departTo`, with a button per destination; each test's push count and flushed URL are
 * unchanged, and so is `room-query-sync.ts`.
 *
 * **The fixture is unchanged too**, 2,10 m ceiling and all, so every URL asserted below is the one it
 * always was. The refusal it was chosen for no longer matters: the probe composes nothing.
 *
 * **The mirror image is reachable and is covered elsewhere.** A sequence *led* by *Înapoi* still has a
 * form to tap in, and the second tap may be a *Continuă* that arms a departure **and** starts a run.
 * That interaction did not exist before 7F4a; it is pinned in
 * `tests/room/room-composition.dom.test.ts` under *"a departure in flight, with a composition beside
 * it"*.
 */
const A_ROOM_MISSING_WALL_A = "shape=L&wallB=2.92&height=2.1&direction=left";
const THE_FLUSHED_ROOM =
  "/ro/configurator/room?shape=L&wallA=3.56&wallB=2.92&height=2.1&direction=left";

describe("the departure state machine, over sequences rather than single taps", () => {
  it("pushes exactly once when the customer taps twice before the flush lands", () => {
    // A double tap is the ordinary impatient gesture, and the departure is a ref rather than state:
    // if the second tap armed a second departure without replacing the first, the echo would push
    // twice and the customer would land two entries deep.
    renderTheDepartureProbe(A_ROOM_MISSING_WALL_A);
    withholdTheEchoes();
    type("wallA", "3560");

    click(DEPART_TO_PRESETS);
    click(DEPART_TO_PRESETS);
    deliverTheEcho();

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.push).toHaveBeenCalledWith(THE_FLUSHED_ROOM);
  });

  it("leaves by the second button when the two taps disagree about where to go", () => {
    // *Continuă* then *Înapoi* before either flush lands. Both flush the same text, so the second
    // tap re-arms over the first and the destination the customer asked for last is the one taken.
    renderTheDepartureProbe(A_ROOM_MISSING_WALL_A);
    withholdTheEchoes();
    type("wallA", "3560");

    click(DEPART_TO_PRESETS);
    click(DEPART_TO_SHAPES);
    deliverTheEcho();

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.push).toHaveBeenCalledWith("/ro/configurator/room");
  });

  it("waits on the newest flush when a keystroke lands between two taps", () => {
    // **The sequence where the departure's correctness is borrowed from the router, and the borrow
    // is not written down anywhere.** A keystroke between two taps makes the second tap flush a
    // *different* text from the first, so two flushes are issued before either commits. The
    // departure holds one `flushedText` and pushes only on that exact string — which is safe solely
    // because Next discards the pending navigation when the second is dispatched
    // (`app-router-instance.js:141-152`), so the first flush never reaches the client.
    //
    // **What this test pins is the half that is ours:** the second tap must re-arm over the first
    // and wait on the newer text. A departure that kept the first arming would wait for a query the
    // router has thrown away, and the primary button would do nothing at all.
    renderTheDepartureProbe(A_ROOM_MISSING_WALL_A);
    withholdTheEchoes();
    type("wallA", "3560");
    click(DEPART_TO_PRESETS);

    type("wallA", "3567");
    click(DEPART_TO_PRESETS);
    deliverTheEcho();

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.push).toHaveBeenCalledWith(
      "/ro/configurator/room?shape=L&wallA=3.567&wallB=2.92&height=2.1&direction=left",
    );
  });

  it("recovers from a flush that never lands when the customer taps again", () => {
    // The resting place the module names: a dropped flush leaves the departure armed, and the next
    // tap re-issues it. Asserted so *"the next tap resolves it"* is a test rather than a comment.
    renderTheDepartureProbe(A_ROOM_MISSING_WALL_A);
    withholdTheEchoes();
    type("wallA", "3560");
    click(DEPART_TO_PRESETS);
    dropTheWithheldWrite();

    click(DEPART_TO_PRESETS);
    deliverTheEcho();

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.push).toHaveBeenCalledWith(THE_FLUSHED_ROOM);
  });

  it("stops writing the URL at all while a flush is outstanding", () => {
    // The suppression rule's full cost, stated rather than left to be discovered: it is not one
    // character. Until the flush lands — or the customer taps again — nothing typed reaches the
    // URL, so a reload in that window restores the flushed room and not the typed one.
    renderTheDepartureProbe(A_ROOM_MISSING_WALL_A);
    withholdTheEchoes();
    type("wallA", "3560");
    click(DEPART_TO_PRESETS);
    browser.replace.mockClear();

    type("wallA", "3567");
    settle();
    type("height", "2800");
    settle();

    expect(browser.replace).not.toHaveBeenCalled();
    expect(restingQuery()).toBe(A_ROOM_MISSING_WALL_A);
  });

  it("flushes a field the customer has just emptied, rather than the value it held", () => {
    // *Înapoi* is enabled at every sub-state, so a departure can carry a draft the CTA would refuse.
    // The entry left behind must hold what the customer can see — an emptied field is an emptied
    // key, not the value that was there before they touched it.
    render("shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");
    withholdTheEchoes();
    type("wallA", "3,");

    click("room-back");

    expect(browser.replace).toHaveBeenCalledTimes(1);
    expect(browser.replace).toHaveBeenCalledWith(
      "/ro/configurator/room?shape=L&wallB=2.92&height=2.6&direction=left",
      { scroll: false },
    );
  });

  it("pushes when a traversal lands on exactly the query it flushed", () => {
    // **The departure's own echo collision, recorded rather than filed.** A Back that lands on the
    // very text we flushed is indistinguishable from the flush committing, so the push fires. That
    // is the right outcome and not a residue: the customer is looking at the room they asked to
    // leave *from*, so they are sent where they asked to go. Written down so a later reader does
    // not add a second discriminator here — the plan forbids exactly that on the read side, and the
    // same argument applies.
    renderTheDepartureProbe(A_ROOM_MISSING_WALL_A);
    withholdTheEchoes();
    type("wallA", "3560");
    click(DEPART_TO_PRESETS);

    arriveAt("shape=L&wallA=3.56&wallB=2.92&height=2.1&direction=left");

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.push).toHaveBeenCalledWith(THE_FLUSHED_ROOM);
  });

  it("writes nothing more once a departure has been disarmed by an unrelated room", () => {
    // I2 and the disarm rule together: after a traversal the only write owed is the new room's own
    // canonicalising one, and the query the customer navigated away from must never be written.
    renderTheDepartureProbe(A_ROOM_MISSING_WALL_A);
    withholdTheEchoes();
    type("wallA", "3560");
    click(DEPART_TO_PRESETS);
    browser.replace.mockClear();

    arriveAt("shape=U&wallA=4.2&wallB=3.1&wallC=2.18&height=2.5");
    settle();
    settle();

    expect(browser.push).not.toHaveBeenCalled();
    expect(browser.replace).toHaveBeenCalledTimes(1);
    expect(browser.replace).toHaveBeenCalledWith(
      "/ro/configurator/room?shape=U&wallA=4.2&wallB=3.1&wallC=2.18&height=2.5&direction=left",
      { scroll: false },
    );
  });
});

describe("a traversal beats a pending write (I2)", () => {
  it("never writes the room the customer has navigated away from", () => {
    // The accepted limit read from the other side: a keystroke inside the settle interval is lost
    // when a traversal overtakes it, and what must **not** happen is the worse outcome — the timer
    // firing anyway and stamping the old room's query onto the entry the customer has just reached.
    render("shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");
    type("wallA", "4560");

    arriveAt("shape=L&wallA=1.2&wallB=1.3&height=2.4&direction=right");
    settle();
    settle();

    expect(browser.replace).not.toHaveBeenCalled();
    expect(restingQuery()).toBe(
      "shape=L&wallA=1.2&wallB=1.3&height=2.4&direction=right",
    );
    expect(fieldFor("wallA").value).toBe("1200");
  });

  it("draws the dimensions step exactly when the live query names a room", () => {
    // **What I6 actually rests on, now that the sync's own guard cannot fire.**
    // `liveQueryNamesARoom` in `room-query-sync.ts` is `roomShapeInQuery(liveQuery) !== undefined`,
    // and `room-screen.tsx` mounts the step on `roomShapeInState(parseRoomUrlState(liveQuery))` —
    // the same pure function over the same value in the same render. So the guard is true whenever
    // the hook runs at all: **no test can falsify it, and I6 is held by this branch alone.**
    //
    // That is fine while the two agree, and this is the test that says so over hostile queries
    // rather than over one. If a later wave keeps the form mounted at 1A — or branches on the
    // draft's shape instead — the guard becomes load-bearing again and this goes red first.
    fc.assert(
      fc.property(A_HOSTILE_QUERY, (search) => {
        render(search);

        const namesARoom = roomShapeInQuery(queryOf(search)) !== undefined;

        expect(
          container.querySelector('[data-testid="room-length-wallA"]') !== null,
        ).toBe(namesARoom);
        expect(
          container.querySelector('[data-testid="room-shapes"]') !== null,
        ).toBe(!namesARoom);
      }),
      { numRuns: SCREEN_SWEEP_RUNS },
    );
  });

  it("asks the router for nothing once the live query stops naming a room", () => {
    // I6 after a departure rather than on arrival: the back button's own entry is the bare pathname,
    // and a settle that rewrote it would undo the navigation 400 ms after the customer made it.
    render("shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");
    type("wallA", "4560");

    arriveAt("");
    settle();
    settle();

    expect(browser.replace).not.toHaveBeenCalled();
    expect(addressBar()).toBe("");
  });
});

describe("the sub-state markers read the live query and lag the field by the settle", () => {
  function theScreenMarkers(): DOMStringMap {
    const main = container.querySelector("main");
    if (!(main instanceof HTMLElement)) {
      throw new Error("the screen draws no main element to mark");
    }
    return main.dataset;
  }

  it("still marks a field the customer has already filled, until the URL catches up", () => {
    // **Criterion 19's third arm has a window, and it is `URL_SETTLE_MS` wide.** The markers are
    // derived from `useSearchParams()` — which is what makes a segment restored on Back
    // self-correct — and the consequence is that between a keystroke and the settle they describe
    // the URL rather than the field beside them. Not a defect: criterion 23's traversal reads them
    // after the URL settles, and the alternative (deriving them from the draft) is the second
    // authority ruling R9 removed. **Pinned so a later reader meets it as a decision**, and so an
    // e2e that asserted a marker without first waiting on the URL fails here instead of flaking.
    render("shape=L&wallB=2.92&height=2.6&direction=left");

    type("wallA", "3560");

    expect(fieldFor("wallA").value).toBe("3560");
    expect(theScreenMarkers().markedFields).toContain("wallA");

    settle();

    expect(theScreenMarkers().markedFields).not.toContain("wallA");
  });

  it("keeps the step on screen while the draft's shape runs ahead of the query's", () => {
    // The same window at the shape seam, where it would be far worse. The branch between 1A and 1B
    // is the **live query's** shape, and the chips are the draft's — so for one settle interval the
    // two disagree. What must not happen is the step disappearing under the customer: a branch that
    // followed the draft would unmount the form the moment a chip was tapped.
    render(
      "shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=left",
    );

    act(() => {
      elementAt("room-shape-chip-control-linear").click();
    });

    expect(theScreenMarkers().roomSubstate).not.toBe("1A");
    expect(fieldFor("wallA").value).toBe("3560");

    settle();

    expect(restingQuery()).toBe("shape=linear&wallA=3.56&height=2.6");
  });
});

describe("the policy stays the only buildability answer under a hostile query", () => {
  it("offers no way on from a room the approved policy does not state", () => {
    // A U room fully answered by the URL is 1C, not 1D: the CTA is refused because the policy
    // states no U bounds, and never because a component spelled the letter. Wave 7J adds them and
    // this test is then a live case rather than a refusal — the premise is asserted, not assumed.
    expect(Object.keys(APPROVED_ROOM_POLICY.buildableShapes)).toEqual(["L"]);

    render(
      "shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=left",
    );
    settle();

    const cta = elementAt("room-continue");
    expect(cta).toBeInstanceOf(HTMLButtonElement);
    expect((cta as HTMLButtonElement).disabled).toBe(true);
  });
});
