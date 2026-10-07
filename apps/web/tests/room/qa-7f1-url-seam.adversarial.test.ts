// @vitest-environment happy-dom
// The `replace` double applies its href to both the live query and the address bar, then re-renders, so every
// address-bar claim is read after `settle()`: the URL lags the field by `URL_SETTLE_MS`.
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

/** A render each, so the sweep costs a DOM tree per case. */
const SWEEP_RUNS = 250;

/** The shapes the screen can be entered at, and the fields each one asks for, taken from the URL parser. */
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

/** What the route hands the screen: nothing but its optional policy, so there is no second reading of the URL for
 *  a stale one to hide in. */
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

/** What the fields say, in whole millimetres (ADR 0126), read by the field's own parser; `undefined` where a field
 *  stands empty or holds text that is not a length. */
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
    // The only guard on a replace loop (render writes, write re-renders): a request per settle interval per customer,
    // invisible in development. The fixed point is `room-query-sync.test.ts`'s; this reads it off the screen, where a
    // rewrite shows up as a second call. Do not weaken it to "the URL ends up right": a screen that writes the same
    // query every 400 ms ends up right too.
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
    // An absent `direction` and an unknown key make the first render disagree with the URL: exactly one
    // canonicalising `replace` follows, never a push (Back would lead to the same screen minus a key).
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
    // The wire's 3.06 must show as 3060; drawn as 3600 it would be a room 540 mm wider than the one stored.
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
    // Two answers to one question: the parser refuses to pick one and the form must too. `useSearchParams().get()`
    // would answer with the first, so the live query is read through `getAll` (`queryFromSearchParams`).
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
    // A contradiction, not a value: a straight room has no corner to point anywhere.
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
    // `direction=sideways` is not a direction, so the draft starts where frame 1B draws it and the first sync says so.
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=sideways");
    settle();

    expect(cornerControl("left").checked).toBe(true);
    expect(new URLSearchParams(addressBar()).get("direction")).toBe("left");
  });

  it("asks the router for nothing at all while no shape is chosen", () => {
    // 1A has no sync: rewriting the URL before *Continuă* would erase the link the customer arrived on. Asserted
    // against the router, since `window.location` would pass over a navigation requested but not yet applied.
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
    // The U's third field is reachable by URL alone, and the visual gate never sees it.
    render(
      "?shape=U&wallA=3.56&wallB=2.92&wallC=2.18&height=2.6&direction=left",
    );
    settle();

    expect(fieldFor("wallC").value).toBe("2180");
    // No `direction`: a U has one hand, so the URL it writes back names none, though the one it was opened with
    // did (ADR 0132 decision 8).
    expect([...new URLSearchParams(addressBar()).keys()]).toEqual([
      "shape",
      "wallA",
      "wallB",
      "wallC",
      "height",
    ]);
    // This U is a room the approved policy accepts (3560 on A, 2920 and 2180 on the sides), so Continue leads on.
    expect(continueButton().disabled).toBe(false);
  });
});

describe("buildability is the policy's answer and never a shape's letter (criterion 3)", () => {
  it("refuses to continue from a filled L once the policy stops stating it", () => {
    // `BuildableShapes` makes `L` optional, so a policy stating nothing needs no cast; the CTA is still refused,
    // which it could not be if the component spelled `L`.
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
    // `isShapeBuildable` is the only buildability question in the directory; nothing beside it compares a shape to a
    // letter.
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
    // The parser has never defaulted `direction`; a form that taught it to would change its shipped contract.
    const state = parseRoomUrlState({ shape: "L" });

    expect(state.markedFields).toContain("direction");
  });

  // A U has one hand, so it draws no toggle, writes no `direction`, and the parser marks nothing for its absence
  // (ADR 0132 decision 8).
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
    // Both readings of one URL are taken at once: the parser calls `direction` unanswered, the form shows an answer,
    // and neither is derived from the other.
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
    // The tap comes inside the settle interval, so a write is pending: the departure flushes it at once and pushes
    // only after the flush is observed coming back. Cancelling the timer would leave the entry holding 2,92.
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
