// @vitest-environment happy-dom
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
import { policyWithoutU } from "../support/policy-without-u";

/** Wide enough that a transition between two readings of a length cannot hide between examples. */
const SWEEP_RUNS = 500;

/** A render each, so a sweep over the screen costs a DOM tree per case. */
const SCREEN_SWEEP_RUNS = 200;

const EVERY_SHAPE: readonly RoomShape[] = ["linear", "L", "U"];

/** Read from `routing.ts` so a third locale is covered the day it is added. */
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

/** A draft as the customer could have left it, including typed text that never reads as a length. */
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
    // The kept draft shows the same room as a re-seed; only a field's notation may differ.
    fc.assert(
      fc.property(ANY_DRAFT, (draft) => {
        const ourOwnWrite = canonicalTextOf(draft);

        const kept = reconcileRoomDraft({
          draft,
          lastSeenText: "shape=bogus",
          liveQuery: queryOf(ourOwnWrite),
          liveText: ourOwnWrite,
          writtenNotYetSeen: [],
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
    // A field the shape does not ask for survives a shape switch (`withRoomShape`); it is not residue.
    const uRoom = draftFrom(
      "shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=left",
    );
    const asAnL: RoomDraft = { ...uRoom, shape: "L" };

    expect(canonicalTextOf(asAnL)).not.toContain("wallC");
    expect(asAnL.lengths.wallC.text).toBe("2180");
  });
});

/** Lengths at the transitions: the smallest millimetre, zero padding or stripping, and the parser's maximum. */
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
    // A refill the parser could not read back would drop every field on the second pass and navigate on every settle.
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
    // A departure recognises its own flush by string equality with `useSearchParams().toString()`;
    // a builder that re-encoded a value while prefixing the locale would strand every departure.
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

let container: HTMLDivElement;
let root: Root;
let screenProps: RoomScreenProps;

/**
 * Whether the `replace` double echoes straight back, and the write it holds when it does not.
 * One slot: Next 16.3.4 discards a pending navigation when a second is dispatched (`app-router-instance.js`),
 * so the client only ever sees the newest write.
 */
let echoesEveryWrite = true;
let theWithheldEcho: string | undefined;

/** Whether `arriveAt` re-renders the departure probe rather than the screen. */
let mountsTheDepartureProbe = false;

function render(search: string, policy?: RoomPolicy): void {
  screenProps = policy === undefined ? {} : { policy };
  mountsTheDepartureProbe = false;
  arriveAt(search);
}

/** The departure sequences' arrival: the sync and its departure over this query, with no screen around them. */
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

/** The one write the router still holds, committing; any earlier one was discarded and never reaches the client. */
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
    // A query with no fixed point under the canonical write would cost one request per settle interval, per customer.
    fc.assert(
      fc.property(A_HOSTILE_QUERY, (search) => {
        browser.replace.mockClear();

        render(search);
        settle();
        const afterTheFirstSettle = browser.replace.mock.calls.length;
        settle();

        // A query naming no room gets no write at all: `at most one` is the 1B bound, not 1A's.
        const namesARoom = roomShapeInQuery(queryOf(search)) !== undefined;
        expect(afterTheFirstSettle).toBeLessThanOrEqual(namesARoom ? 1 : 0);
        expect(browser.replace.mock.calls.length).toBe(afterTheFirstSettle);
      }),
      { numRuns: SCREEN_SWEEP_RUNS },
    );
  });

  it("comes to rest on a query the screen would write again unchanged", () => {
    // `At most one write` is also met by a screen that writes nothing; the resting query must be one the loop
    // converged on.
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
      render(`${A_FULL_U_ROOM}&${field}=9.99`);
      settle();

      expect(fieldFor(field).value).toBe("");
      expect(new URLSearchParams(addressBar()).has(field)).toBe(false);
    },
  );

  it("empties the field even when both answers agree", () => {
    render(
      "shape=L&wallA=3.56&wallA=3.56&wallB=2.92&height=2.6&direction=left",
    );
    settle();

    expect(fieldFor("wallA").value).toBe("");
    expect(new URLSearchParams(addressBar()).has("wallA")).toBe(false);
  });

  it("falls back to the toggle's own position when direction is answered twice", () => {
    // `right` first on purpose: a reader taking the first answer would yield the default `left` and pass vacuously.
    // An L, not a U: a U carries no `direction` to answer twice.
    render(
      "shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=right&direction=left",
    );
    settle();

    expect(cornerControl("right").checked).toBe(false);
    expect(new URLSearchParams(addressBar()).get("direction")).toBe("left");
  });

  it("shows the shape step when the shape itself is answered twice", () => {
    // Two shapes name no room, so nothing is written and the arriving link must survive untouched (I6).
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
    // Zero, not `at most one`: at 1A a screen that rewrote the arriving link would erase it.
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
    // `Number("1e3")` is 1000; the parser reads one digit string with at most one separator, so neither is a length.
    render("shape=L&wallA=1e3&wallB=3%20560&height=2.6&direction=left");
    settle();

    expect(fieldFor("wallA").value).toBe("");
    expect(fieldFor("wallB").value).toBe("");
    expect(restingQuery()).toBe("shape=L&height=2.6&direction=left");
  });

  it("reads a length the URL padded with spaces, and writes it back trimmed", () => {
    // `parseMetresToMillimetres` trims before matching, so the padded value is the stored room and the query
    // carries it trimmed.
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

/**
 * Driven on the departure probe, not on the screen: a second tap needs the form to survive the first,
 * and a room the domain refuses has no active *Continuă* to tap.
 * A sequence led by *Înapoi* is covered in `tests/room/room-composition.dom.test.ts`.
 */
const A_ROOM_MISSING_WALL_A = "shape=L&wallB=2.92&height=2.1&direction=left";
const THE_FLUSHED_ROOM =
  "/ro/configurator/room?shape=L&wallA=3.56&wallB=2.92&height=2.1&direction=left";

describe("the departure state machine, over sequences rather than single taps", () => {
  it("pushes exactly once when the customer taps twice before the flush lands", () => {
    // The departure is a ref, not state: a second tap that armed a second departure would push twice.
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
    // Two flushes are issued before either commits and Next discards the first (`app-router-instance.js`),
    // so the second tap must re-arm over the first and wait on the newer text.
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
    // Until the flush lands or the customer taps again nothing typed reaches the URL; a reload restores the flushed
    // room.
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
    // A Back landing on the flushed text is indistinguishable from the flush committing, so the push fires; add no
    // second discriminator.
    renderTheDepartureProbe(A_ROOM_MISSING_WALL_A);
    withholdTheEchoes();
    type("wallA", "3560");
    click(DEPART_TO_PRESETS);

    arriveAt("shape=L&wallA=3.56&wallB=2.92&height=2.1&direction=left");

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.push).toHaveBeenCalledWith(THE_FLUSHED_ROOM);
  });

  it("writes nothing more once a departure has been disarmed by an unrelated room", () => {
    // After a traversal the only write owed is the new room's canonicalising one (I2).
    renderTheDepartureProbe(A_ROOM_MISSING_WALL_A);
    withholdTheEchoes();
    type("wallA", "3560");
    click(DEPART_TO_PRESETS);
    browser.replace.mockClear();

    // An L: a U arrives already canonical with no `direction` to add, so it owes no canonicalising write.
    arriveAt("shape=L&wallA=4.2&wallB=3.1&height=2.5");
    settle();
    settle();

    expect(browser.push).not.toHaveBeenCalled();
    expect(browser.replace).toHaveBeenCalledTimes(1);
    expect(browser.replace).toHaveBeenCalledWith(
      "/ro/configurator/room?shape=L&wallA=4.2&wallB=3.1&height=2.5&direction=left",
      { scroll: false },
    );
  });
});

describe("a traversal beats a pending write (I2)", () => {
  it("never writes the room the customer has navigated away from", () => {
    // A keystroke inside the settle interval is lost when a traversal overtakes it; the timer must not stamp the
    // old room's query.
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
    // The sync's own `liveQueryNamesARoom` guard cannot fire, since the screen mounts the step on the same function,
    // so this branch alone holds I6 and must follow the live query, not the draft's shape.
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
    // The back button's entry is the bare pathname; a settle that rewrote it would undo the navigation.
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
    // The markers derive from `useSearchParams()`, so for `URL_SETTLE_MS` after a keystroke they describe the URL,
    // not the field; an e2e asserting a marker must wait on the URL first.
    render("shape=L&wallB=2.92&height=2.6&direction=left");

    type("wallA", "3560");

    expect(fieldFor("wallA").value).toBe("3560");
    expect(theScreenMarkers().markedFields).toContain("wallA");

    settle();

    expect(theScreenMarkers().markedFields).not.toContain("wallA");
  });

  it("keeps the step on screen while the draft's shape runs ahead of the query's", () => {
    // The 1A/1B branch follows the live query's shape, not the draft's; a draft-following branch would unmount
    // the form.
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
  it("offers no way on from a room the policy does not state", () => {
    // With no U bounds in the policy a fully answered U is 1C: the CTA is refused by policy, not by a component.
    expect(Object.keys(APPROVED_ROOM_POLICY.buildableShapes).sort()).toEqual([
      "L",
      "U",
      "linear",
    ]);
    const policy = policyWithoutU();
    expect(Object.keys(policy.buildableShapes).sort()).toEqual(["L", "linear"]);

    render(
      "shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=left",
      policy,
    );
    settle();

    const cta = elementAt("room-continue");
    expect(cta).toBeInstanceOf(HTMLButtonElement);
    expect((cta as HTMLButtonElement).disabled).toBe(true);
  });
});
