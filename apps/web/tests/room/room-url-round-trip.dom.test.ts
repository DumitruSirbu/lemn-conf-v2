// @vitest-environment happy-dom
//
// **The URL as the room's only store** — wave 7F1 slice 5 and wave 7F1-D45, criteria 7, 9, 11, 13's
// query arm, 18, 20 and 22.
//
// The whole screen is rendered through the real `parseRoomUrlState`, and the **address bar** is what
// every claim below is read off: `window.location.search` after a keystroke is the customer's own
// evidence that a half-entered room would survive a reload. The sub-state under test is asserted
// before anything is read off it, so a fixture that quietly stopped resolving where it was meant to
// could not make the assertions below pass over a screen nobody meant to draw.
//
// **The navigation is mocked at `next/navigation`, one layer below the component's own import**, so
// next-intl's href construction is exercised rather than stubbed — and the spies are what prove
// *when* the query is written and how often (criteria 11 and 19).
//
// **Under ruling R9 the component no longer writes the address bar itself, so the harness closes the
// loop the router closes.** `useSearchParams` is mocked beside the router, and the `replace` double
// **applies** the href it is handed — to the live query and to `window.location` — and re-renders.
// A double that recorded the call without applying it would let every assertion in this file pass
// over a screen that never updates, which is why *"the router double applies the write it records"*
// below asserts the double itself.
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

import { parseMetresToMillimetres } from "@/room/parse-metres";
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

/** Criterion 7 asks for at least 500 cases; a render each is what makes them cost anything. */
const SWEEP_RUNS = 500;

/** The editor's own back link, spelled out beside the sweep so a passing property cannot hide a
 *  broken concrete case — this is the case wave 7E2's visual check could not verify, because no
 *  field existed to read it out of. */
const THE_BACK_LINK =
  "?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left";
const THE_BACK_LINK_FIELDS = { wallA: "3,56", wallB: "2,92", height: "2,60" };

let container: HTMLDivElement;
let root: Root;

/** The props the page last handed over. A URL change re-renders the screen with **these**, rather
 *  than with a fresh parse: a browser does not hand the client a new server render in the middle of
 *  an entry, and a harness that did would hide every stale-authority defect this wave exists to
 *  close. */
let screenProps: RoomScreenProps;

/** Whether the `replace` double echoes the write straight back into the live query. Criterion 22
 *  needs *"the push has not fired yet"* and *"the push fires once the flush comes back"* as two
 *  ordered claims, which a double that always echoes cannot tell apart. */
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

/** A fresh arrival: the page's own parse, and the browser's URL, set together. */
function render(search: string): void {
  const query = queryOf(search);
  screenProps = { state: parseRoomUrlState(query), query };
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

/** A new element every time. Handing `root.render` the element it already holds is a bailout, and a
 *  bailout here would make the router double look like it worked while the screen never re-read the
 *  query — the failure mode the double exists to avoid. */
function theScreen(): ReactElement {
  return createElement(NextIntlClientProvider, {
    children: createElement(RoomScreen, screenProps),
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

/** The typing stopping. Everything the screen writes is written here, `URL_SETTLE_MS` after the
 *  last keystroke — a URL that lags the field by a beat is the debounce working. */
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
 * A keystroke, as the browser delivers it: the control's own value changes and React is told.
 *
 * **Written through the prototype's setter rather than as `input.value = …`.** React defines its own
 * `value` property *on the element* to track what it last rendered, so a plain assignment updates
 * that tracker too and the `input` event that follows looks like no change at all — the component
 * would never hear the digit. Addressing the prototype with the element as the receiver reaches the
 * DOM's setter, which is the one the browser itself uses.
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
    // Without this the double would be the defect: every address-bar assertion in this file would
    // pass over a screen that never saw its own write. Both halves are the claim — the URL the
    // customer now has, **and** the component having observed it, which is the only thing that can
    // stop the next settle from writing the same query again.
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

        expect(parseMetresToMillimetres(fieldFor("wallA").value)).toEqual({
          ok: true,
          mm: room.widthMm,
        });
        expect(parseMetresToMillimetres(fieldFor("wallB").value)).toEqual({
          ok: true,
          mm: room.depthMm,
        });
        expect(parseMetresToMillimetres(fieldFor("height").value)).toEqual({
          ok: true,
          mm: room.heightMm,
        });
        expect(cornerControl("left").checked).toBe(true);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("puts the editor's own back link into the fields, digit for digit", () => {
    // The concrete case beside the property. 2,60 keeps its second decimal and 3,56 does not grow a
    // third: a formatter that rounded or padded differently would still satisfy a round trip.
    render(THE_BACK_LINK);

    expect(fieldFor("wallA").value).toBe(THE_BACK_LINK_FIELDS.wallA);
    expect(fieldFor("wallB").value).toBe(THE_BACK_LINK_FIELDS.wallB);
    expect(fieldFor("height").value).toBe(THE_BACK_LINK_FIELDS.height);
  });
});

describe("the URL is the room's only store (criterion 9)", () => {
  it("keeps a second store out of the whole room directory", () => {
    // The must-not half, read over every module under `src/room` rather than over the two this file
    // renders: a copy of the room kept anywhere else is a second authority on what the customer
    // entered, and the URL would stop being the thing a reload restores from (ADR 0111 decision 3).
    for (const source of roomModuleSources()) {
      expect(source).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie|zustand|useConfiguratorStore/,
      );
    }
  });

  it("keeps the native history write out of the whole room directory", () => {
    // Defect D4's own mechanism, banned by `eslint.config.mjs`'s room block and asserted here as
    // well, because a lint rule and a directory can stop agreeing. `window.history.replaceState`
    // moves the address bar without Next's record of the entry following it, so the room survives
    // until the first browser Back and not one gesture longer.
    for (const source of roomModuleSources()) {
      expect(source).not.toMatch(/history\.(pushState|replaceState)\s*\(/);
    }
  });

  it("writes the canonical query the domain's own serialiser would write", () => {
    render("?shape=L");

    type("wallA", "3,56");
    type("wallB", "2,92");
    type("height", "2,60");
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
    // *"3,"* is on its way to a value, and the parser's own answer to a query without `wallA` is
    // 1B with the field marked — which is exactly the state the customer is in. No raw draft text
    // ever reaches the URL.
    render("?shape=L");

    type("wallA", "3,");
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

    type("wallB", "2,92");
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
    type("wallA", "3,56");
    type("wallB", "2,92");
    type("height", "2,60");
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
    // **Criterion 11's two arms in one test, so they cannot drift into two files that agree
    // separately and disagree together.** The mechanism is a `router.replace` debounced on
    // `URL_SETTLE_MS` (ruling R9): going through the router is what makes Next's own record of the
    // history entry the URL we intend, which `use-router.md:50` says a search-param-only navigation
    // does without freshly creating the segment. What must never happen is a navigation **per
    // keystroke** — it would re-run the page for every digit.
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");
    const before = drawnWallAWidthPx();

    type("wallA", "4,56");

    expect(browser.push).not.toHaveBeenCalled();
    expect(browser.replace).not.toHaveBeenCalled();
    expect(drawnWallAWidthPx()).not.toBe(before);
  });

  it("writes once, after the typing stops", () => {
    // **The count is the load-bearing half**: a replace per keystroke also ends on the right URL,
    // and only the number of calls tells the two apart.
    render("?shape=L");

    type("wallA", "3,5");
    type("wallA", "3,56");
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
    // I3 and I1 at their sharpest. *"3,5"* and *"3,50"* are the same room, so a re-seed on the echo
    // would be invisible to every URL assertion in this file and would still rewrite the field
    // under the caret 400 ms after the customer stopped typing.
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");

    type("wallA", "3,5");
    settle();

    expect(addressBar()).toContain("wallA=3.5");
    expect(fieldFor("wallA").value).toBe("3,5");
  });

  it("leaves text that is not yet a length standing after the write", () => {
    // The residue this design accepts, stated as the behaviour it protects: *"3,"* reaches no query
    // and must survive the write that drops it, because the customer is still typing it.
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");

    type("wallA", "3,");
    settle();

    expect(new URLSearchParams(addressBar()).has("wallA")).toBe(false);
    expect(fieldFor("wallA").value).toBe("3,");
  });

  it("re-seeds every field, the shape and the direction when another room arrives", () => {
    // **The browser's Back, as the client sees it**: the live query becomes another entry's and no
    // new page render happens — the page segment is reused (`upgrading/version-15.md:525`). Defect
    // D4's fix is that this re-seeds rather than leaving the room the customer has left standing.
    render(THE_BACK_LINK);

    arriveAt(
      "?shape=U&wallA=4.2&wallB=3.1&wallC=2.18&height=2.5&direction=right",
    );

    expect(fieldFor("wallA").value).toBe("4,20");
    expect(fieldFor("wallC").value).toBe("2,18");
    expect(cornerControl("right").checked).toBe(true);
  });

  it("asks the router for nothing when the room that arrives is already canonical", () => {
    // The other half of the re-seed: a traversal onto a canonical URL is not a reason to write one.
    render(THE_BACK_LINK);
    browser.replace.mockClear();

    arriveAt("?shape=L&wallA=4.2&wallB=3.1&height=2.5&direction=right");
    settle();

    expect(browser.replace).not.toHaveBeenCalled();
  });
});

describe("a deliberate navigation flushes first and leaves second (criterion 22)", () => {
  it("issues the replace at once and no push in the same tick", () => {
    // **Both halves are the criterion.** *Cancel the timer and push* loses the last 400 ms of typing
    // from the entry left behind, which is D4 again on the fastest customer path; *replace and push
    // in one tick* loses the replace entirely, because Next marks a pending action discarded when a
    // navigation dispatches (`app-router-instance.js:146-160`) and only a committed action writes
    // history.
    render("?shape=L&wallB=2.92&height=2.6&direction=left");
    withholdTheEcho();

    type("wallA", "3,56");
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
    type("wallA", "3,56");
    click("room-continue");

    deliverTheEcho();

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.push).toHaveBeenCalledWith(
      `/ro/configurator/room${THE_BACK_LINK}`,
    );
  });

  it("flushes before the back button leaves, and pushes the bare path once it lands", () => {
    // The back button pushes the shape step as a **new entry** (the bare pathname, which is never
    // demoted), so 1B stays behind as a back-target exactly as it does after the CTA — which is why
    // this button flushes too. It is also the gesture that minted the entry defect D4's Back came
    // from, so this is the reported defect step for step rather than its class.
    render("?shape=L&wallB=2.92&height=2.6&direction=left");
    withholdTheEcho();
    type("wallA", "3,56");

    click("room-back");

    expect(browser.replace).toHaveBeenCalledTimes(1);
    expect(browser.push).not.toHaveBeenCalled();

    deliverTheEcho();

    expect(browser.push).toHaveBeenCalledWith("/ro/configurator/room");
  });

  it("keeps the departure alive when a keystroke lands after the tap", () => {
    // **The dead-CTA case, and the one input this design gives up to remove it.** Without the
    // suppression rule the late keystroke starts its own write, that write overtakes the flush, the
    // departure fails to recognise its own echo and disarms — and *Continuă* does nothing, with no
    // hard navigation behind it to cover the tap. So no second write starts while a departure is in
    // flight, and the character typed in that window is lost from both the URL and the field. **A
    // stray character beats a primary button that did nothing**, and on a phone the tap blurs the
    // field first, so the input this costs is rarer than the one it fixes.
    render("?shape=L&wallB=2.92&height=2.6&direction=left");
    withholdTheEcho();
    type("wallA", "3,56");
    click("room-continue");

    type("wallA", "3,567");
    settle();

    expect(browser.replace).toHaveBeenCalledTimes(1);

    deliverTheEcho();

    expect(browser.push).toHaveBeenCalledTimes(1);
    expect(browser.push).toHaveBeenCalledWith(
      `/ro/configurator/room${THE_BACK_LINK}`,
    );
    expect(fieldFor("wallA").value).toBe("3,56");
  });

  it("still canonicalises a room that arrives while a departure is in flight", () => {
    // **The effect order is what this holds.** The departure resolves before the write effect on
    // every URL change, so a traversal disarms *and* the room it landed on still gets the one
    // canonicalising write it is owed. Ordered the other way, the suppression rule above would eat
    // it and the customer would sit on a URL with no `direction`.
    render("?shape=L&wallB=2.92&height=2.6&direction=left");
    withholdTheEcho();
    type("wallA", "3,56");
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
    type("wallA", "3,56");
    click("room-continue");

    arriveAt("?shape=L&wallA=4.2&wallB=3.1&height=2.5&direction=right");
    settle();

    expect(browser.push).not.toHaveBeenCalled();
  });

  it("writes nothing once the back button's own entry has arrived", () => {
    // **I6, at the moment it is easiest to break.** The back button pushes the bare pathname, so the
    // live query stops naming a room — and the step is still on screen, because the shape branch is
    // the route's until slice B moves it. A settle that rewrote the address bar here would put
    // `?shape=L&direction=left` back onto the entry the customer just navigated to, undoing the
    // navigation about 400 ms after they made it.
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
    // The first sync is now the debounced `router.replace`, and it **rewrites the current entry**:
    // a push here would give the customer a Back that leads to the same screen minus one key.
    render("?shape=L");

    settle();

    expect(cornerControl("left").checked).toBe(true);
    expect(new URLSearchParams(addressBar()).get("direction")).toBe("left");
    expect(browser.push).not.toHaveBeenCalled();
  });

  it("leaves the parser's reading of an absent direction exactly as it was", () => {
    // The middle layer, asserted here as well as at `room-url-state.test.ts:304`, because confusing
    // the three layers is the whole risk ruling R6 was corrected over. An absent `direction` marks
    // the field and resolves to 1B — it never resolves silently to left.
    expect(parseRoomUrlState({ shape: "L" })).toStrictEqual({
      substate: "1B",
      shape: "L",
      markedFields: ["wallA", "wallB", "height", "direction"],
    });
  });

  it("keeps a stored room's absent direction meaning left", () => {
    // The outermost layer: `DesignRoom` carries no corner direction at all, and ADR 0053's reading
    // of that absence is left. Wave 7I owns persisting a right-turning choice.
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
