// @vitest-environment happy-dom
//
// The router is mocked at `next/navigation`, so next-intl's href construction still runs. The `replace` double
// applies the href it is handed to the live query and `window.location` and re-renders: a recording-only double
// would let every assertion pass over a screen that never updates.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  APPROVED_ROOM_POLICY,
  type DesignRoom,
  type MillimetreBounds,
} from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The address bar, the live query and the router, as the three things a test render cannot supply
 *  for itself. `search` is the query `useSearchParams` reads: the browser's, not the page's. */
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

import { URL_SETTLE_MS } from "@/room/room-query-sync";
import { RoomScreen, type RoomScreenProps } from "@/room/room-screen";
import {
  parseRoomUrlState,
  roomHrefFromDesignRoom,
  serialiseRoomInput,
  type ParsedRoomInput,
  type RoomSearchParams,
} from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import { DEPART_TO_PRESETS, DepartureProbe } from "../support/departure-probe";

/** Criterion 7 asks for at least 500 cases; a render each is what makes them cost anything. */
const SWEEP_RUNS = 500;

/** The editor's own back link, spelled out beside the sweep so a passing property cannot hide a broken case. */
const THE_BACK_LINK =
  "?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left";
/** What the link's fields show: whole millimetres, the notation the customer types (ADR 0126). */
const THE_BACK_LINK_FIELDS = { wallA: "3560", wallB: "2920", height: "2600" };

/** A refused room (ceiling below the approved 2 200 mm minimum, no wallA); its URL is asserted verbatim, so the
 *  fixture must not change. */
const A_REFUSED_ROOM_MISSING_WALL_A =
  "shape=L&wallB=2.92&height=2.1&direction=left";

let container: HTMLDivElement;
let root: Root;

/** The route hands the screen nothing but its optional policy, so a URL change re-renders against the live query. */
const screenProps: RoomScreenProps = {};

/** Whether the `replace` double echoes a write straight back into the live query. Criterion 22 needs "the push has
 *  not fired yet" and "it fires once the flush comes back" as two ordered claims. */
let echoesEveryWrite = true;
let withheldEcho: string | undefined;

function approvedBounds(wall: "wallA" | "wallB"): MillimetreBounds {
  const walls = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (walls === undefined) {
    throw new Error("the approved policy states no L walls to sweep");
  }
  return walls[wall];
}

function millimetresWithin(bounds: MillimetreBounds): fc.Arbitrary<number> {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

/** A room the policy's own ranges describe. `roomHrefFromDesignRoom` is the link under test, so the
 *  sweep travels as a stored `DesignRoom` rather than as a query somebody wrote by hand. */
const ANY_APPROVED_L_ROOM = fc.record({
  shape: fc.constant<"L">("L"),
  widthMm: millimetresWithin(approvedBounds("wallA")),
  depthMm: millimetresWithin(approvedBounds("wallB")),
  heightMm: millimetresWithin(APPROVED_ROOM_POLICY.heightBounds),
});

/** A href's query as the page would hand it over: repeated keys stay repeated, because that is what
 *  `parseRoomUrlState` reads and a collapsed array would be a different question. */
function queryOf(search: string): RoomSearchParams {
  const params = new URLSearchParams(search);
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => {
      const values = params.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );
}

/** Whether `arriveAt` re-renders the departure probe rather than the screen (7F2 criterion 13). */
let mountsTheDepartureProbe = false;

/** A fresh arrival; the browser's URL is the whole of it. */
function render(search: string): void {
  mountsTheDepartureProbe = false;
  arriveAt(search);
}

/** The sync and its departure over this query, with no screen around them — see
 *  `tests/support/departure-probe.ts` for why a departure sequence moved there. */
function renderTheDepartureProbe(search: string): void {
  mountsTheDepartureProbe = true;
  arriveAt(search);
}

/** The URL the customer now has — the live query and the address bar together, because to the
 *  customer they are one thing — followed by the re-render the router would cause. */
function arriveAt(search: string): void {
  browser.search = new URLSearchParams(search).toString();
  window.history.replaceState(null, "", locationOf(browser.search));
  act(() => {
    root.render(theScreen());
  });
}

/** A new element every time: rendering the element the root already holds is a bailout, and the screen would never
 *  re-read the query. */
function theScreen(): ReactElement {
  return createElement(NextIntlClientProvider, {
    children: mountsTheDepartureProbe
      ? createElement(DepartureProbe, { seedShape: "L" })
      : createElement(RoomScreen, screenProps),
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
  });
}

function locationOf(search: string): string {
  return search === "" ? browser.pathname : `${browser.pathname}?${search}`;
}

function searchOf(href: string): string {
  const questionMark = href.indexOf("?");
  return questionMark === -1 ? "" : href.slice(questionMark + 1);
}

/** The typing stopping: everything the screen writes is written `URL_SETTLE_MS` after the last keystroke. */
function settle(): void {
  act(() => {
    vi.advanceTimersByTime(URL_SETTLE_MS);
  });
}

function withholdTheEcho(): void {
  echoesEveryWrite = false;
}

function deliverTheEcho(): void {
  if (withheldEcho === undefined) {
    throw new Error("no write was withheld, so there is no echo to deliver");
  }
  const search = withheldEcho;
  withheldEcho = undefined;
  arriveAt(search);
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

/**
 * A keystroke through the prototype's setter. React defines its own `value` on the element to track the last
 * render, so a plain assignment updates that tracker and the `input` event then looks like no change.
 */
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

function addressBar(): string {
  return window.location.search;
}

/** Every module the room screen is made of. Read by path rather than through
 *  `new URL(…, import.meta.url)`: under `happy-dom` the module URL is not a `file:` one. */
function roomModuleSources(): readonly string[] {
  const directory = resolve(import.meta.dirname, "../../src/room");
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
    .map((entry) => readFileSync(resolve(directory, entry), "utf8"));
}

/** The plan's wall-A bar, as the drawing the customer is looking at. */
function drawnWallAWidthPx(): string {
  const wallA = elementAt("room-plan").querySelector("rect");
  return wallA?.getAttribute("width") ?? "";
}

beforeEach(() => {
  // Only the two timer functions the debounce uses are faked. React's own scheduling is left on
  // real ones, so advancing the settle interval cannot be mistaken for the renderer making progress.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  browser.push.mockClear();
  browser.replace.mockClear();
  echoesEveryWrite = true;
  withheldEcho = undefined;
  browser.replace.mockImplementation((href: string) => {
    if (echoesEveryWrite) {
      arriveAt(searchOf(href));
      return;
    }
    withheldEcho = searchOf(href);
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

describe("the harness closes the loop the router closes (wave risk 6)", () => {
  it("applies the write it records, rather than only recording it", () => {
    // Both halves are the claim: the URL the customer has, and the component having observed it, which is what stops
    // the next settle writing the same query again.
    render("?shape=L");

    settle();

    const [href] = browser.replace.mock.calls[0] as [string];
    expect(addressBar()).toBe(`?${searchOf(href)}`);
    expect(new URLSearchParams(browser.search).get("direction")).toBe("left");

    settle();

    expect(browser.replace).toHaveBeenCalledTimes(1);
  });
});

describe("a stored room lands in the fields to the millimetre (criterion 7)", () => {
  it("fills every field from the editor's back link, over the approved policy", () => {
    fc.assert(
      fc.property(ANY_APPROVED_L_ROOM, (room: DesignRoom) => {
        const href = roomHrefFromDesignRoom(room);
        render(href.slice(href.indexOf("?")));

        // Since ADR 0126 the field shows the whole millimetres themselves (criterion S1b-5).
        expect(fieldFor("wallA").value).toBe(String(room.widthMm));
        expect(fieldFor("wallB").value).toBe(String(room.depthMm));
        expect(fieldFor("height").value).toBe(String(room.heightMm));
        expect(cornerControl("left").checked).toBe(true);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("puts the editor's own back link into the fields, digit for digit", () => {
    // The concrete case beside the property. The wire's 2.6 comes back as 2600 and 3.56 as 3560: a
    // refill that padded or dropped a zero would still satisfy a round trip through the metre parser.
    render(THE_BACK_LINK);

    expect(fieldFor("wallA").value).toBe(THE_BACK_LINK_FIELDS.wallA);
    expect(fieldFor("wallB").value).toBe(THE_BACK_LINK_FIELDS.wallB);
    expect(fieldFor("height").value).toBe(THE_BACK_LINK_FIELDS.height);
  });
});

describe("the URL is the room's only store (criterion 9)", () => {
  it("keeps a second store out of the whole room directory", () => {
    // Read over every module under `src/room`: a copy of the room kept elsewhere is a second authority, and the URL
    // would stop being what a reload restores from (ADR 0111 decision 3).
    for (const source of roomModuleSources()) {
      expect(source).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie|zustand|useConfiguratorStore/,
      );
    }
  });

  it("keeps the native history write out of the whole room directory", () => {
    // Banned by `eslint.config.mjs`'s room block and asserted here too, since a lint rule and a directory can disagree.
    // `history.replaceState` moves the address bar without Next's record following it: the room lasts until Back.
    for (const source of roomModuleSources()) {
      expect(source).not.toMatch(/history\.(pushState|replaceState)\s*\(/);
    }
  });

  it("writes the canonical query the domain's own serialiser would write", () => {
    render("?shape=L");

    type("wallA", "3560");
    type("wallB", "2920");
    type("height", "2600");
    settle();

    const input: ParsedRoomInput = {
      shape: "L",
      wallAMm: 3560,
      wallBMm: 2920,
      heightMm: 2600,
      cornerDirection: "left",
    };
    expect(addressBar()).toBe(`?${serialiseRoomInput(input).toString()}`);
  });

  it("keeps a field that does not read as a length out of the query", () => {
    // *"3,6"* is not whole millimetres, so no raw draft text reaches the URL, and the parser answers 1B with the field
    // marked.
    render("?shape=L");

    type("wallA", "3,6");
    settle();

    expect(new URLSearchParams(addressBar()).has("wallA")).toBe(false);
    expect(parseRoomUrlState(queryOf(addressBar())).substate).toBe("1B");
  });

  it("drops the keys a shape does not ask for when the shape changes", () => {
    render(THE_BACK_LINK);

    click("room-shape-chip-control-linear");
    settle();

    expect([...new URLSearchParams(addressBar()).keys()]).toEqual([
      "shape",
      "wallA",
      "height",
    ]);
  });

  it("carries no unknown key out of the one it arrived with", () => {
    render("?shape=L&utm_source=newsletter&wallA=3.56");

    type("wallB", "2920");
    settle();

    expect([...new URLSearchParams(addressBar()).keys()]).toEqual([
      "shape",
      "wallA",
      "wallB",
      "direction",
    ]);
  });

  it("restores every field byte-identically from the query it wrote", () => {
    render("?shape=L");
    type("wallA", "3560");
    type("wallB", "2920");
    type("height", "2600");
    settle();
    const written = addressBar();

    render(written);

    expect(fieldFor("wallA").value).toBe(THE_BACK_LINK_FIELDS.wallA);
    expect(fieldFor("wallB").value).toBe(THE_BACK_LINK_FIELDS.wallB);
    expect(fieldFor("height").value).toBe(THE_BACK_LINK_FIELDS.height);
  });
});

describe("the plan redraws on every keystroke, locally (criterion 11)", () => {
  it("changes wall A's geometry in the same tick as the digit, and asks the router for nothing", () => {
    // Both arms in one test so they cannot drift apart. The write is a `router.replace` debounced on
    // `URL_SETTLE_MS`; a navigation per keystroke would re-run the page for every digit.
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");
    const before = drawnWallAWidthPx();

    type("wallA", "4560");

    expect(browser.push).not.toHaveBeenCalled();
    expect(browser.replace).not.toHaveBeenCalled();
    expect(drawnWallAWidthPx()).not.toBe(before);
  });

  it("writes once, after the typing stops", () => {
    // The count is the load-bearing half: a replace per keystroke also ends on the right URL.
    render("?shape=L");

    type("wallA", "356");
    type("wallA", "3560");
    settle();

    expect(browser.replace).toHaveBeenCalledTimes(1);
    expect(browser.replace).toHaveBeenCalledWith(
      "/ro/configurator/room?shape=L&wallA=3.56&direction=left",
      { scroll: false },
    );
  });

  it("pushes the canonical query only when the customer continues", () => {
    render(THE_BACK_LINK);

    click("room-continue");

    expect(browser.push).toHaveBeenCalledWith(
      `/ro/configurator/room${THE_BACK_LINK}`,
    );
  });
});

describe("re-seed on a different room; never on our own echo (criterion 20)", () => {
  it("leaves a typed value exactly as typed when the write comes back", () => {
    // *"03500"* and *"3500"* are the same room, so a re-seed on our own echo is invisible to URL assertions yet would
    // rewrite the field under the caret; a leading zero is normalised only by a refill from the URL (ADR 0126).
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");

    type("wallA", "03500");
    settle();

    // Read as the parameter itself: `wallA=3.5` is a substring of the arriving `wallA=3.56`, so a
    // `toContain` would pass over a write that never happened.
    expect(new URLSearchParams(addressBar()).get("wallA")).toBe("3.5");
    expect(fieldFor("wallA").value).toBe("03500");
  });

  it("leaves text that is not yet a length standing after the write", () => {
    // *"3,6"* reaches no query and must survive the write that drops it: refused, never stripped (ADR 0126).
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");

    type("wallA", "3,6");
    settle();

    expect(new URLSearchParams(addressBar()).has("wallA")).toBe(false);
    expect(fieldFor("wallA").value).toBe("3,6");
  });

  it("re-seeds every field, the shape and the direction when another room arrives", () => {
    // The browser's Back as the client sees it: the live query becomes another entry's with no new page render (the
    // segment is reused), so the screen must re-seed rather than leave the room the customer has left.
    render(THE_BACK_LINK);

    arriveAt("?shape=L&wallA=4.2&wallB=3.1&height=2.5&direction=right");

    expect(fieldFor("wallA").value).toBe("4200");
    expect(fieldFor("wallB").value).toBe("3100");
    expect(cornerControl("right").checked).toBe(true);
  });

  // A U has one hand, so the link's direction is ignored and no toggle is drawn.
  it("re-seeds a U's three walls when it arrives, ignoring a direction the link names", () => {
    render(THE_BACK_LINK);

    arriveAt(
      "?shape=U&wallA=4.2&wallB=3.1&wallC=2.18&height=2.5&direction=right",
    );

    expect(fieldFor("wallA").value).toBe("4200");
    expect(fieldFor("wallC").value).toBe("2180");
    expect(
      container.querySelector("[data-testid^='room-corner-control-']"),
    ).toBeNull();
  });

  it("asks the router for nothing when the room that arrives is already canonical", () => {
    render(THE_BACK_LINK);
    browser.replace.mockClear();

    arriveAt("?shape=L&wallA=4.2&wallB=3.1&height=2.5&direction=right");
    settle();

    expect(browser.replace).not.toHaveBeenCalled();
  });
});

describe("a deliberate navigation flushes first and leaves second (criterion 22)", () => {
  it("issues the replace at once and no push in the same tick", () => {
    // Both halves are the criterion: cancelling the timer and pushing loses the last 400 ms of typing from the entry
    // left behind, and replace-then-push in one tick loses the replace, because Next discards a pending action when a
    // navigation dispatches.
    render("?shape=L&wallB=2.92&height=2.6&direction=left");
    withholdTheEcho();

    type("wallA", "3560");
    click("room-continue");

    expect(browser.replace).toHaveBeenCalledTimes(1);
    expect(browser.replace).toHaveBeenCalledWith(
      "/ro/configurator/room?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left",
      { scroll: false },
    );
    expect(browser.push).not.toHaveBeenCalled();
  });

  it("pushes once the flush comes back", () => {
    render("?shape=L&wallB=2.92&height=2.6&direction=left");
    withholdTheEcho();
    type("wallA", "3560");
    click("room-continue");

    deliverTheEcho();

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.push).toHaveBeenCalledWith(
      `/ro/configurator/room${THE_BACK_LINK}`,
    );
  });

  it("flushes before the back button leaves, and pushes the bare path once it lands", () => {
    // The back button pushes the shape step as a new entry (the bare pathname), so 1B stays behind as a back-target and
    // must be flushed first, as after the CTA.
    render("?shape=L&wallB=2.92&height=2.6&direction=left");
    withholdTheEcho();
    type("wallA", "3560");

    click("room-back");

    expect(browser.replace).toHaveBeenCalledTimes(1);
    expect(browser.push).not.toHaveBeenCalled();

    deliverTheEcho();

    expect(browser.push).toHaveBeenCalledWith("/ro/configurator/room");
  });

  it("keeps the departure alive when a keystroke lands after the tap", () => {
    // The dead-CTA case: without the suppression rule a late keystroke's write overtakes the flush, the departure
    // misses its own echo and disarms, and *Continuă* does nothing. So no second write starts during a departure, and
    // the late character is lost from URL and field.
    //
    // Driven on the departure probe: a room the domain accepts replaces the form on *Continuă* and one it refuses
    // leaves it inactive, so only the probe leaves a field to type into after the tap.
    renderTheDepartureProbe(`?${A_REFUSED_ROOM_MISSING_WALL_A}`);
    withholdTheEcho();
    type("wallA", "3560");
    click(DEPART_TO_PRESETS);

    type("wallA", "3567");
    settle();

    expect(browser.replace).toHaveBeenCalledTimes(1);

    deliverTheEcho();

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.push).toHaveBeenCalledWith(
      "/ro/configurator/room?shape=L&wallA=3.56&wallB=2.92&height=2.1&direction=left",
    );
    expect(fieldFor("wallA").value).toBe("3560");
  });

  it("still canonicalises a room that arrives while a departure is in flight", () => {
    // Effect order is what this holds: the departure resolves before the write effect on every URL change, so a
    // traversal disarms and the room it landed on still gets its one canonicalising write.
    render("?shape=L&wallB=2.92&height=2.6&direction=left");
    withholdTheEcho();
    type("wallA", "3560");
    click("room-continue");

    arriveAt("?shape=L&wallA=4.2&wallB=3.1&height=2.5");
    settle();

    expect(browser.push).not.toHaveBeenCalled();
    expect(browser.replace).toHaveBeenCalledTimes(2);
    expect(browser.replace).toHaveBeenLastCalledWith(
      "/ro/configurator/room?shape=L&wallA=4.2&wallB=3.1&height=2.5&direction=left",
      { scroll: false },
    );
  });

  it("disarms without pushing when a traversal arrives first", () => {
    // A customer who has gone Back does not want to be sent on, and the flush they left behind is
    // no longer the URL of the entry they are looking at.
    render("?shape=L&wallB=2.92&height=2.6&direction=left");
    withholdTheEcho();
    type("wallA", "3560");
    click("room-continue");

    arriveAt("?shape=L&wallA=4.2&wallB=3.1&height=2.5&direction=right");
    settle();

    expect(browser.push).not.toHaveBeenCalled();
  });

  it("writes nothing once the back button's own entry has arrived", () => {
    // The back button pushes the bare pathname, so the live query stops naming a room while the step is still on
    // screen; a settle that rewrote the address bar would restore `?shape=L&direction=left` onto the entry just left.
    render(THE_BACK_LINK);
    click("room-back");

    arriveAt("");
    settle();

    expect(browser.replace).not.toHaveBeenCalled();
    expect(addressBar()).toBe("");
  });

  it("leaves immediately, and writes nothing, when the entry is already correct", () => {
    render(THE_BACK_LINK);

    click("room-continue");

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.replace).not.toHaveBeenCalled();
  });
});

describe("mirroring changes the direction and nothing else (criterion 13's query arm)", () => {
  it("leaves every serialised value where it was", () => {
    render(THE_BACK_LINK);

    click("room-corner-right");
    settle();

    expect(addressBar()).toBe(THE_BACK_LINK.replace("left", "right"));
  });

  it("leaves the field labels alone — Perete A stays the horizontal wall", () => {
    render(THE_BACK_LINK);
    const before = fieldFor("wallA").value;

    click("room-corner-right");

    expect(fieldFor("wallA").value).toBe(before);
    expect(fieldFor("wallB").value).toBe(THE_BACK_LINK_FIELDS.wallB);
  });
});

describe("direction is written, and its absence keeps its meaning (criterion 18)", () => {
  it("shows the toggle at left and writes it on the first sync", () => {
    // The first sync is the debounced `router.replace`, which rewrites the current entry: a push would give a Back to
    // the same screen minus one key.
    render("?shape=L");

    settle();

    expect(cornerControl("left").checked).toBe(true);
    expect(new URLSearchParams(addressBar()).get("direction")).toBe("left");
    expect(browser.push).not.toHaveBeenCalled();
  });

  it("leaves the parser's reading of an absent direction exactly as it was", () => {
    // The middle layer, also asserted in `room-url-state.test.ts`: an absent `direction` marks the field and resolves
    // to 1B, never silently to left.
    expect(parseRoomUrlState({ shape: "L" })).toStrictEqual({
      substate: "1B",
      shape: "L",
      markedFields: ["wallA", "wallB", "height", "direction"],
    });
  });

  it("keeps a stored room's absent direction meaning left", () => {
    // `DesignRoom` carries no corner direction at all, so an absent one means left.
    const stored: DesignRoom = {
      shape: "L",
      widthMm: 3560,
      depthMm: 2920,
      heightMm: 2600,
    };

    expect(roomHrefFromDesignRoom(stored)).toContain("direction=left");
  });

  it("carries no direction at all for a shape with no corner", () => {
    render("?shape=linear&wallA=3.56&height=2.6");

    settle();

    expect(new URLSearchParams(addressBar()).has("direction")).toBe(false);
  });
});

function cornerControl(direction: "left" | "right"): HTMLInputElement {
  const control = elementAt(`room-corner-control-${direction}`);
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`the ${direction} corner chip holds no control`);
  }
  return control;
}
