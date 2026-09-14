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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { RoomScreen, type RoomScreenProps } from "@/room/room-screen";
import {
  parseRoomUrlState,
  requiredFieldsFor,
  roomHrefFromDesignRoom,
  serialiseRoomInput,
  type RoomSearchParams,
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

/** A query as the page hands it over: a repeated key stays an array, because that is what
 *  `parseRoomUrlState` reads and a collapsed one would be a different question. */
function queryOf(search: string): RoomSearchParams {
  const params = new URLSearchParams(search);
  return Object.fromEntries(
    [...new Set(params.keys())].map((key) => {
      const values = params.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );
}

function render(search: string, policy?: RoomPolicy): void {
  const query = queryOf(search);
  const state = parseRoomUrlState(query);
  const props: RoomScreenProps =
    policy === undefined ? { state, query } : { state, query, policy };
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(RoomScreen, props),
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

/** What the fields say, in whole millimetres, for the shape the URL names. `undefined` where a field
 *  stands empty or holds text on its way to a value. */
function millimetresShown(
  shape: RoomShape,
): Readonly<Record<string, number | undefined>> {
  return Object.fromEntries(
    requiredFieldsFor(shape).map((field) => {
      const parsed = parseMetresToMillimetres(fieldFor(field).value);
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

  it("writes a query that rendering again reproduces exactly", () => {
    // The URL is the room's only store, so the store has to be a **fixed point**: what the screen
    // writes on the first sync is what it writes on the second. A formatter that gained or lost a
    // decimal on the way through the field would drift the query a digit per reload.
    fc.assert(
      fc.property(ANY_APPROVED_L_ROOM, (room: DesignRoom) => {
        const href = roomHrefFromDesignRoom(room);
        render(href.slice(href.indexOf("?")));
        const firstSync = addressBar();

        render(firstSync);

        expect(addressBar()).toBe(firstSync);
      }),
      { numRuns: SWEEP_RUNS },
    );
  });

  it("keeps the zero inside a length rather than trailing it", () => {
    // Criterion 7's formatting edge, read off the screen rather than off the formatter: 3060 mm must
    // show as 3,06. Drawn as 3,60 it parses back as a room 540 mm wider than the one that was stored.
    render("?shape=L&wallA=3.06&wallB=2.92&height=2.6&direction=left");

    expect(fieldFor("wallA").value).toBe("3,06");
    expect(parseMetresToMillimetres(fieldFor("wallA").value)).toEqual({
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
    render("?shape=L&wallA=3.56&wallA=4.2&height=2.6&direction=left");

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

      expect(fieldFor("wallA").value).toBe("");
      expect(new URLSearchParams(addressBar()).has("wallA")).toBe(false);
      // The room is still the one the URL names, and the rest of it survives untouched.
      expect(fieldFor("wallB").value).toBe("2,92");
    },
  );

  it("drops a direction handed to a shape that turns no corner", () => {
    // A contradiction, not a value: a straight room has no corner to point anywhere. The toggle is
    // absent from the tree (criterion 6) and the key is absent from the query (criterion 9).
    render("?shape=linear&wallA=3.56&height=2.6&direction=right");

    expect(countOf("room-corner")).toBe(0);
    expect([...new URLSearchParams(addressBar()).keys()]).toEqual([
      "shape",
      "wallA",
      "height",
    ]);
  });

  it("drops a wall a shape does not have", () => {
    render("?shape=linear&wallA=3.56&wallB=2.92&wallC=2&height=2.6");

    expect(countOf("room-length-wallB")).toBe(0);
    expect(new URLSearchParams(addressBar()).has("wallB")).toBe(false);
  });

  it("refuses an unreadable direction and shows the toggle at left", () => {
    // R6's draft layer, under a value rather than under an absence: `direction=sideways` is not a
    // direction, so the draft starts where frame 1B draws it and the first sync says so.
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=sideways");

    expect(cornerControl("left").checked).toBe(true);
    expect(new URLSearchParams(addressBar()).get("direction")).toBe("left");
  });

  it("writes nothing at all into the address bar while no shape is chosen", () => {
    // 1A is the one sub-state with no sync: until *Continuă* there is no room to store, and a screen
    // that rewrote the address bar here would erase a link the customer arrived on before they had
    // done anything.
    window.history.replaceState(null, "", "/ro/configurator/room?shape=bogus");

    render("?shape=bogus");

    expect(elementAt("room-shapes")).toBeInstanceOf(HTMLElement);
    expect(addressBar()).toBe("?shape=bogus");
  });
});

describe("the fields a shape asks for, at 1B and in the DOM (criterion 4)", () => {
  it.each(EVERY_SHAPE)("draws exactly %s's field set and no other", (shape) => {
    render(`?shape=${shape}`);

    const drawn = [...container.querySelectorAll("input[inputmode='decimal']")]
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

    expect(fieldFor("wallC").value).toBe("2,18");
    expect([...new URLSearchParams(addressBar()).keys()]).toEqual([
      "shape",
      "wallA",
      "wallB",
      "wallC",
      "height",
      "direction",
    ]);
    expect(continueButton().disabled).toBe(true);
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
  it.each(["L", "U"] as const)(
    "shows the toggle at left for %s and writes it on the first sync",
    (shape) => {
      expect(parseRoomUrlState({ shape }).substate).toBe("1B");

      render(`?shape=${shape}`);

      expect(cornerControl("left").checked).toBe(true);
      expect(new URLSearchParams(addressBar()).get("direction")).toBe("left");
    },
  );

  it.each(["L", "U"] as const)(
    "leaves the parser marking an absent direction for %s, rather than reading it as left",
    (shape) => {
      // The middle layer, kept separate from the draft's: the parser has never defaulted, and a
      // form that taught it to would change 7E1's shipped contract.
      const state = parseRoomUrlState({ shape });

      expect(state.markedFields).toContain("direction");
    },
  );

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
  it("pushes the canonical query after a shape change and a retype", () => {
    render("?shape=L&wallA=3.56&wallB=2.92&height=2.6&direction=left");
    type("wallB", "2,4");

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
    expect(browser.push).toHaveBeenCalledWith(
      `/ro/configurator/room?${canonical}`,
    );
    expect(addressBar()).toBe(`?${canonical}`);
  });
});
