// @vitest-environment happy-dom
//
// **The URL as the room's only store** — wave 7F1 slice 5, criteria 7, 9, 11, 13's query arm and 18.
//
// The whole screen is rendered through the real `parseRoomUrlState`, and the **address bar** is what
// every claim below is read off: `window.location.search` after a keystroke is the customer's own
// evidence that a half-entered room would survive a reload (ruling R2). The sub-state under test is
// asserted before anything is read off it, so a fixture that quietly stopped resolving where it was
// meant to could not make the assertions below pass over a screen nobody meant to draw.
//
// **The navigation is mocked at `next/navigation`, one layer below the component's own import**, so
// next-intl's href construction is exercised rather than stubbed — and the spies are what prove the
// query is written **without** a router call (criterion 11).
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  APPROVED_ROOM_POLICY,
  type DesignRoom,
  type MillimetreBounds,
} from "@lemnaria/configurator-domain";
import { fc } from "@fast-check/vitest";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The address bar and the router, as the two things a test render cannot supply for itself. */
const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
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
import { RoomScreen } from "@/room/room-screen";
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

function render(search: string): void {
  const query = queryOf(search);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(RoomScreen, {
          state: parseRoomUrlState(query),
          query,
        }),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
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
  browser.push.mockClear();
  browser.replace.mockClear();
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

  it("writes the canonical query the domain's own serialiser would write", () => {
    render("?shape=L");

    type("wallA", "3,56");
    type("wallB", "2,92");
    type("height", "2,60");

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

    expect(new URLSearchParams(addressBar()).has("wallA")).toBe(false);
    expect(parseRoomUrlState(queryOf(addressBar())).substate).toBe("1B");
  });

  it("drops the keys a shape does not ask for when the shape changes", () => {
    render(THE_BACK_LINK);

    click("room-shape-chip-control-linear");

    expect([...new URLSearchParams(addressBar()).keys()]).toEqual([
      "shape",
      "wallA",
      "height",
    ]);
  });

  it("carries no unknown key out of the one it arrived with", () => {
    render("?shape=L&utm_source=newsletter&wallA=3.56");

    type("wallB", "2,92");

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
    const written = addressBar();

    render(written);

    expect(fieldFor("wallA").value).toBe(THE_BACK_LINK_FIELDS.wallA);
    expect(fieldFor("wallB").value).toBe(THE_BACK_LINK_FIELDS.wallB);
    expect(fieldFor("height").value).toBe(THE_BACK_LINK_FIELDS.height);
  });
});

describe("the plan redraws on every keystroke, locally (criterion 11)", () => {
  it("changes wall A's geometry in the same tick as the digit", () => {
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");
    const before = drawnWallAWidthPx();

    type("wallA", "4,56");

    expect(drawnWallAWidthPx()).not.toBe(before);
  });

  it("asks the router for nothing while the customer types", () => {
    // The mechanism is `window.history.replaceState`, verified against
    // `next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:343-398`. A
    // `router.replace` per keystroke would re-run the page and can take the caret with it.
    render("?shape=L");

    type("wallA", "3,56");
    type("wallA", "3,6");

    expect(browser.push).not.toHaveBeenCalled();
    expect(browser.replace).not.toHaveBeenCalled();
    expect(addressBar()).toContain("wallA=3.6");
  });

  it("pushes the canonical query only when the customer continues", () => {
    render(THE_BACK_LINK);

    click("room-continue");

    expect(browser.push).toHaveBeenCalledWith(
      `/ro/configurator/room${THE_BACK_LINK}`,
    );
  });
});

describe("mirroring changes the direction and nothing else (criterion 13's query arm)", () => {
  it("leaves every serialised value where it was", () => {
    render(THE_BACK_LINK);

    click("room-corner-right");

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
    render("?shape=L");

    expect(cornerControl("left").checked).toBe(true);
    expect(new URLSearchParams(addressBar()).get("direction")).toBe("left");
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
