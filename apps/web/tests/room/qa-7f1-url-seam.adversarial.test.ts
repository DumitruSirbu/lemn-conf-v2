// @vitest-environment happy-dom
//
// **Adversarial QA — wave 7F1, the seam between the query and the fields** (criteria 3, 4, 7, 9, 10
// and 18).
//
// Ruling R2 gave the screen the raw `query` beside the parsed `state`, because the 1B branch of
// `parseRoomUrlState` discards the lengths that already read. Two readings of one URL is a seam, and
// a seam is where the two can disagree — so every claim below is read off **both ends at once**: the
// address bar, and the value the field actually shows.
//
// The queries are hostile on purpose: repeated keys, a `direction` on a shape with no corner, a
// `wallB` on a straight room, a length past `Number.MAX_SAFE_INTEGER`, a fraction of a millimetre.
// None of them may crash the screen, put a value in a field the customer never entered, or leave a
// key in the URL that `serialiseRoomInput` would not have written.
//
// **Under ruling R9 the screen asks a router instead of writing the address bar itself**, so the
// harness closes the loop the router closes: `useSearchParams` is mocked beside the router and the
// `replace` double applies the href it is handed to both, then re-renders. Every address-bar claim
// is therefore read after a `settle()` — the URL lags the field by `URL_SETTLE_MS`, and that is the
// debounce working rather than a defect.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type DesignRoom,
  type MillimetreBounds,
  type RoomPolicy,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

import { parseMetresToMillimetres } from "@/room/parse-metres";
import { parseMillimetres } from "@/room/parse-millimetres";
import { URL_SETTLE_MS } from "@/room/room-query-sync";
import { RoomScreen, type RoomScreenProps } from "@/room/room-screen";
import {
  parseRoomUrlState,
  requiredFieldsFor,
  roomHrefFromDesignRoom,
  serialiseRoomInput,
} from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";

/** A render each, so the sweep costs a DOM tree per case. Criterion 7 asks for at least 500 and this
 *  file asks a harder question of the same rooms: that the URL the screen writes is a fixed point. */
const SWEEP_RUNS = 250;

/** The shapes the screen can be entered at, and the fields each one asks for — taken from the URL
 *  parser rather than restated, which is criterion 4's own rule applied to the test. */
const EVERY_SHAPE: readonly RoomShape[] = ["linear", "L", "U"];

/** Every module the room is built from, as source. A claim about what the directory does **not**
 *  contain has to read all of it, not the two files a render happens to reach. */
const ROOM_MODULE_SOURCES: readonly (readonly [string, string])[] = (() => {
  const directory = resolve(import.meta.dirname, "../../src/room");
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
    .map(
      (entry) =>
        [entry, readFileSync(resolve(directory, entry), "utf8")] as const,
    );
})();

let container: HTMLDivElement;
let root: Root;

function approvedLBounds(wall: "wallA" | "wallB"): MillimetreBounds {
  const walls = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (walls === undefined) {
    throw new Error("the approved policy states no L walls to sweep");
  }
  return walls[wall];
}

const ANY_APPROVED_L_ROOM = fc.record({
  shape: fc.constant<"L">("L"),
  widthMm: fc.integer({
    min: approvedLBounds("wallA").minMm,
    max: approvedLBounds("wallA").maxMm,
  }),
  depthMm: fc.integer({
    min: approvedLBounds("wallB").minMm,
    max: approvedLBounds("wallB").maxMm,
  }),
  heightMm: fc.integer({
    min: APPROVED_ROOM_POLICY.heightBounds.minMm,
    max: APPROVED_ROOM_POLICY.heightBounds.maxMm,
  }),
});

/** What the route hands the screen: **nothing but its optional policy** (ruling R9). The browser
 *  hands the client another entry's query, not another server render, and the props that used to
 *  carry the server's parse are gone — so there is no second reading of the URL for a stale one to
 *  hide in. */
let screenProps: RoomScreenProps;

function render(search: string, policy?: RoomPolicy): void {
  screenProps = policy === undefined ? {} : { policy };
  arriveAt(search);
}

/** The URL the customer now has: the live query `useSearchParams` reads and the address bar every
 *  assertion is taken off, set together, and then the re-render the router would cause. */
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

/** A new element every time: handing `root.render` the element it already holds is a bailout, and a
 *  bailout would make the router double look as though it worked over a screen that never re-read
 *  the query. */
function theScreen(): ReactElement {
  return createElement(NextIntlClientProvider, {
    children: createElement(RoomScreen, screenProps),
    locale: "ro",
    messages: roMessages,
    timeZone: "Europe/Chisinau",
  });
}

/** The typing stopping. Nothing this screen writes reaches the URL before it. */
function settle(): void {
  act(() => {
    vi.advanceTimersByTime(URL_SETTLE_MS);
  });
}

function elementAt(testId: string): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the screen draws no ${testId}`);
  }
  return element;
}

function countOf(testId: string): number {
  return container.querySelectorAll(`[data-testid="${testId}"]`).length;
}

function fieldFor(field: string): HTMLInputElement {
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

function cornerControl(direction: "left" | "right"): HTMLInputElement {
  const control = elementAt(`room-corner-control-${direction}`);
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`the ${direction} corner chip holds no control`);
  }
  return control;
}

function type(field: string, text: string): void {
  act(() => {
    const input = fieldFor(field);
    // Through the prototype's setter, so React's own value tracker does not swallow the event.
    Reflect.set(HTMLInputElement.prototype, "value", text, input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function addressBar(): string {
  return window.location.search;
}

/** What the fields say, in whole millimetres, for the shape the URL names — read by the field's own
 *  parser, since a field takes whole millimetres (ADR 0126). `undefined` where a field stands empty
 *  or holds text that is not a length. */
function millimetresShown(
  shape: RoomShape,
): Readonly<Record<string, number | undefined>> {
  return Object.fromEntries(
    requiredFieldsFor(shape).map((field) => {
      const parsed = parseMillimetres(fieldFor(field).value);
      return [field, parsed.ok ? parsed.mm : undefined];
    }),
  );
}

/** What the address bar says, in whole millimetres, for the same shape. */
function millimetresInTheUrl(
  shape: RoomShape,
): Readonly<Record<string, number | undefined>> {
  const params = new URLSearchParams(addressBar());
  return Object.fromEntries(
    requiredFieldsFor(shape).map((field) => {
      const parsed = parseMetresToMillimetres(params.get(field) ?? "");
      return [field, parsed.ok ? parsed.mm : undefined];
    }),
  );
}

beforeEach(() => {
  // Only the two timer functions the debounce uses are faked, so advancing the settle interval
  // cannot be mistaken for React's own scheduling making progress.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  browser.push.mockClear();
  browser.replace.mockClear();
  browser.replace.mockImplementation((href: string) => {
    const questionMark = href.indexOf("?");
    arriveAt(questionMark === -1 ? "" : href.slice(questionMark + 1));
  });
  browser.search = "";
  window.history.replaceState(null, "", "/ro/configurator/room");
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

describe("the query and the fields never disagree about the room (criteria 7 and 9)", () => {
  it("shows exactly the lengths the address bar holds, over the approved policy", () => {
    fc.assert(
      fc.property(ANY_APPROVED_L_ROOM, (room: DesignRoom) => {
        const href = roomHrefFromDesignRoom(room);
        render(href.slice(href.indexOf("?")));

        expect(millimetresShown("L")).toEqual(millimetresInTheUrl("L"));
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("settles in at most one write, and asks for none on the settle after that", () => {
    // **Criterion 21, and the only guard on the wave's first-ranked risk.** A replace loop — render
    // writes, write re-renders, re-render writes — is the one failure here that gets *worse* with
    // traffic: a request per settle interval, per customer, forever, and invisible in development
    // where one machine's requests look free. The fixed point behind it is
    // `room-query-sync.test.ts`'s idempotence property; this is the same claim read off the screen,
    // where a render that rewrote the query would show up as a second call.
    //
    // **Do not weaken this to "the URL ends up right".** A screen that writes the same query every
    // 400 ms ends up right too.
    fc.assert(
      fc.property(ANY_APPROVED_L_ROOM, (room: DesignRoom) => {
        browser.replace.mockClear();
        const href = roomHrefFromDesignRoom(room);

        render(href.slice(href.indexOf("?")));
        settle();
        const afterTheFirstSettle = browser.replace.mock.calls.length;
        settle();

        expect(afterTheFirstSettle).toBeLessThanOrEqual(1);
        expect(browser.replace.mock.calls.length).toBe(afterTheFirstSettle);
        expect(addressBar()).toBe(href.slice(href.indexOf("?")));
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("settles in at most one write from a query that is not canonical to begin with", () => {
    // The arriving-URL half: an absent `direction` and an unknown key both make the first render
    // disagree with the URL, so exactly **one** canonicalising write follows — a `replace`, never a
    // push, because a push would give the customer a Back that leads to the same screen minus one
    // key.
    render("?utm_source=newsletter&shape=L&wallA=3.56&wallB=2.92&height=2.6");

    settle();
    const afterTheFirstSettle = browser.replace.mock.calls.length;
    settle();

    expect(afterTheFirstSettle).toBe(1);
    expect(browser.replace.mock.calls.length).toBe(1);
    expect(browser.push).not.toHaveBeenCalled();
    expect(addressBar()).toBe(
      "?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left",
    );
  });

  it("keeps the zero inside a length rather than trailing it", () => {
    // Criterion 7's formatting edge, read off the screen rather than off the refill: the wire's 3.06
    // must show as 3060. Drawn as 3600 it would be a room 540 mm wider than the one that was stored.
    render("?shape=L&wallA=3.06&wallB=2.92&height=2.6&direction=left");
    settle();

    expect(fieldFor("wallA").value).toBe("3060");
    expect(parseMillimetres(fieldFor("wallA").value)).toEqual({
      ok: true,
      mm: 3060,
    });
    expect(new URLSearchParams(addressBar()).get("wallA")).toBe("3.06");
  });
});

describe("a hostile query reaches neither a field nor the query it writes (criteria 9 and 10)", () => {
  it("reads a repeated key as no value at all, and drops it", () => {
    // `?wallA=3.56&wallA=4.2` is two answers to one question. The parser refuses to pick one, and
    // the form must refuse the same way: a field showing 3,56 here would be the screen choosing a
    // room the customer never entered.
    // It is also the boundary `useSearchParams().get()` would silently cross: it answers with the
    // **first** of the two, so the live query is read through `getAll` (`queryFromSearchParams`) and
    // a repeated key stays an array all the way to `singleValue`.
    render("?shape=L&wallA=3.56&wallA=4.2&height=2.6&direction=left");
    settle();

    expect(fieldFor("wallA").value).toBe("");
    expect(fieldFor("wallA").getAttribute("aria-invalid")).toBeNull();
    expect(new URLSearchParams(addressBar()).has("wallA")).toBe(false);
  });

  it.each([
    ["a fraction of a millimetre", "3.5605"],
    ["a length past the safe integer range", "99999999999999999999"],
    ["a negative length", "-3.56"],
    ["a zero length", "0"],
    ["a grouped number", "3,560.00"],
    ["text", "three metres"],
  ])(
    "leaves the field empty and the key out of the URL for %s",
    (_case, value) => {
      render(
        `?shape=L&wallA=${encodeURIComponent(value)}&wallB=2.92&height=2.6&direction=left`,
      );
      settle();

      expect(fieldFor("wallA").value).toBe("");
      expect(new URLSearchParams(addressBar()).has("wallA")).toBe(false);
      // The room is still the one the URL names, and the rest of it survives untouched.
      expect(fieldFor("wallB").value).toBe("2920");
    },
  );

  it("drops a direction handed to a shape that turns no corner", () => {
    // A contradiction, not a value: a straight room has no corner to point anywhere. The toggle is
    // absent from the tree (criterion 6) and the key is absent from the query (criterion 9).
    render("?shape=linear&wallA=3.56&height=2.6&direction=right");
    settle();

    expect(countOf("room-corner")).toBe(0);
    expect([...new URLSearchParams(addressBar()).keys()]).toEqual([
      "shape",
      "wallA",
      "height",
    ]);
  });

  it("drops a wall a shape does not have", () => {
    render("?shape=linear&wallA=3.56&wallB=2.92&wallC=2&height=2.6");
    settle();

    expect(countOf("room-length-wallB")).toBe(0);
    expect(new URLSearchParams(addressBar()).has("wallB")).toBe(false);
  });

  it("refuses an unreadable direction and shows the toggle at left", () => {
    // R6's draft layer, under a value rather than under an absence: `direction=sideways` is not a
    // direction, so the draft starts where frame 1B draws it and the first sync says so.
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=sideways");
    settle();

    expect(cornerControl("left").checked).toBe(true);
    expect(new URLSearchParams(addressBar()).get("direction")).toBe("left");
  });

  it("asks the router for nothing at all while no shape is chosen", () => {
    // **I6.** 1A is the one sub-state with no sync: until *Continuă* there is no room to store, and
    // a screen that rewrote the URL here would erase the link the customer arrived on before they
    // had done anything. The claim is made against the router rather than the address bar, because
    // under ruling R9 the component is no longer the writer — reading `window.location` here would
    // pass over a screen that had asked for a navigation and simply not been given one yet.
    render("?shape=bogus");

    settle();

    expect(elementAt("room-shapes")).toBeInstanceOf(HTMLElement);
    expect(browser.replace).not.toHaveBeenCalled();
    expect(browser.push).not.toHaveBeenCalled();
    expect(addressBar()).toBe("?shape=bogus");
  });
});

describe("the fields a shape asks for, at 1B and in the DOM (criterion 4)", () => {
  it.each(EVERY_SHAPE)("draws exactly %s's field set and no other", (shape) => {
    render(`?shape=${shape}`);

    const drawn = [...container.querySelectorAll("input[inputmode='numeric']")]
      .map((input) => input.getAttribute("data-testid"))
      .map((testId) => (testId ?? "").replace("room-length-", ""));

    expect(drawn).toEqual([...requiredFieldsFor(shape)]);
  });

  it("fills a U's three walls from the URL and carries them back into it", () => {
    // Wave risk 4: the U's third field is reachable by URL alone and the visual gate never sees it.
    // This is the field, the value and the round trip, asserted where a property over
    // `requiredFieldsFor` cannot reach — in the rendered tree.
    render(
      "?shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=left",
    );
    settle();

    expect(fieldFor("wallC").value).toBe("2180");
    // No `direction`: restated 2026-09-29 (M7B U5 S1, Q-U4 (b)) — a U has one hand, and the URL it
    // writes back names none, though the one it was opened with did.
    expect([...new URLSearchParams(addressBar()).keys()]).toEqual([
      "shape",
      "wallA",
      "wallB",
      "wallC",
      "height",
    ]);
    // Restated at M7B U6 S1 (census W5): this U is a room the approved policy accepts (3560 on A,
    // 2920 and 2180 on the sides), so Continue leads on.
    expect(continueButton().disabled).toBe(false);
  });
});

describe("buildability is the policy's answer and never a shape's letter (criterion 3)", () => {
  it("refuses to continue from a filled L once the policy stops stating it", () => {
    // The mirror of slice 4's fabricated-policy arm, and it needs no cast: `BuildableShapes` makes
    // `L` optional, so a policy stating nothing is constructible. Every length reads, the shape is
    // the one shipped today — and the CTA is still refused, which it could not be if the component
    // spelled `L`.
    const statesNoShape: RoomPolicy = {
      ...APPROVED_ROOM_POLICY,
      buildableShapes: {},
    };

    render(
      "?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left",
      statesNoShape,
    );

    expect(millimetresShown("L")).toEqual({
      wallA: 3560,
      wallB: 2920,
      height: 2600,
    });
    expect(continueButton().disabled).toBe(true);
  });

  it("continues from the same room under the approved policy", () => {
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");

    expect(continueButton().disabled).toBe(false);
  });

  it("asks no module under src/room to name a shape to decide it", () => {
    // Criterion 3 by construction. `isShapeBuildable` is the only buildability question in the
    // directory, and nothing beside it compares a shape to a letter for the answer: wave 7J turns
    // the straight kitchen on by adding bounds, with no edit here.
    for (const [name, source] of ROOM_MODULE_SOURCES) {
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      expect(
        code,
        `${name} reads a buildable shape out of a bound`,
      ).not.toMatch(/buildableShapes\s*[.[]/);
    }

    const screen =
      ROOM_MODULE_SOURCES.find(([name]) => name === "room-screen.tsx")?.[1] ??
      "";
    expect(screen).toContain("isShapeBuildable(");
  });
});

describe("direction is written for every shape that carries the toggle (criterion 18)", () => {
  it("shows the toggle at left for an L and writes it on the first sync", () => {
    expect(parseRoomUrlState({ shape: "L" }).substate).toBe("1B");

    render("?shape=L");
    settle();

    expect(cornerControl("left").checked).toBe(true);
    expect(new URLSearchParams(addressBar()).get("direction")).toBe("left");
  });

  it("leaves the parser marking an absent direction for an L, rather than reading it as left", () => {
    // The middle layer, kept separate from the draft's: the parser has never defaulted, and a
    // form that taught it to would change 7E1's shipped contract.
    const state = parseRoomUrlState({ shape: "L" });

    expect(state.markedFields).toContain("direction");
  });

  // Restated 2026-09-29 (M7B U5 S1; Q-U4 (b), ADR 0132 decision 8): a U has one hand, so it draws no
  // toggle, writes no `direction`, and the parser marks nothing for its absence. These were the U
  // arms of the two tests above, written while nothing had said what a U's corner meant.
  it("draws no toggle for a U and writes no direction on the first sync", () => {
    render("?shape=U");
    settle();

    expect(
      container.querySelector("[data-testid^='room-corner-control-']"),
    ).toBeNull();
    expect(new URLSearchParams(addressBar()).has("direction")).toBe(false);
  });

  it("does not mark an absent direction for a U", () => {
    const state = parseRoomUrlState({ shape: "U" });

    expect(state.markedFields).not.toContain("direction");
  });

  it("keeps the three layers apart: the toggle shows left where the parser marks it", () => {
    // Collapsing any layer into another is what ruling R6 was corrected over. Here both readings of
    // the same URL are taken at once: the parser still calls `direction` unanswered, and the form
    // still shows an answer — and neither statement is derived from the other.
    const query = { shape: "L" } as const;
    const state = parseRoomUrlState(query);

    render("?shape=L");

    expect(state.markedFields).toContain("direction");
    expect(cornerControl("left").checked).toBe(true);
    expect(cornerControl("left").getAttribute("aria-invalid")).toBeNull();
    expect(elementAt("room-corner").className).not.toMatch(/error|invalid/i);
  });
});

describe("what the CTA pushes is what serialiseRoomInput would write (criterion 9)", () => {
  it("flushes the retype into the entry it leaves, then pushes the same query", () => {
    // **I5, end to end.** The tap comes *inside* the settle interval, so there is a write pending:
    // the departure flushes it at once — not on the settle — and the push follows only once that
    // flush has been observed coming back. Cancelling the timer instead would leave the entry
    // behind holding 2,92, which is defect D4 on the fastest customer path.
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");
    type("wallB", "2400");

    act(() => {
      continueButton().click();
    });

    const canonical = serialiseRoomInput({
      shape: "L",
      wallAMm: 3560,
      wallBMm: 2400,
      heightMm: 2600,
      cornerDirection: "left",
    }).toString();
    expect(browser.replace).toHaveBeenCalledWith(
      `/ro/configurator/room?${canonical}`,
      { scroll: false },
    );
    expect(browser.push).toHaveBeenCalledWith(
      `/ro/configurator/room?${canonical}`,
    );
    expect(addressBar()).toBe(`?${canonical}`);
  });
});
