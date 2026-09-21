// @vitest-environment happy-dom
//
// **Step 1's screen, driven rather than described** — wave 7F1 slice 4, criteria 1, 2, 3 and 17.
//
// Three of the four claims are about what the customer can and cannot do, so the real screen is
// rendered through the real `parseRoomUrlState`, and the sub-state under test is **asserted** before
// anything is read off it: a fixture that quietly stopped resolving to 1C would otherwise make every
// assertion below it pass over a screen nobody meant to draw.
//
// **The navigation is mocked at `next/navigation`, one layer below the component's own import**, so
// next-intl's href construction is exercised rather than stubbed: what the spy receives is the
// localized URL the browser would be sent to, not a string this file wrote.
//
// Romanian is never spelled here. Every expected sentence is read out of the imported catalogue,
// which is also what makes the two-locale pass meaningful: the same assertions run against `ru`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  APPROVED_ROOM_POLICY,
  type BuildableShapes,
  type LWallBounds,
  type RoomPolicy,
  type RoomShape,
} from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The address bar, the live query and the router, as the three things a test render cannot supply
 *  for itself. `search` is what `useSearchParams` reads: under ruling R9 the screen derives the room
 *  from the query the browser holds, not from the one the page was rendered for. */
const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
  push: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
  useSearchParams: () => new URLSearchParams(browser.search),
  useRouter: () => ({
    push: browser.push,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { RoomScreen, type RoomScreenProps } from "@/room/room-screen";
import {
  parseRoomUrlState,
  type RoomSearchParams,
} from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import {
  CATALOGUES,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";

/** One locale's catalogue as one argument, so a render cannot be given the Russian messages under
 *  the Romanian locale. `CATALOGUES` is the shared pair every i18n sweep travels with. */
type LocalisedCatalogue = readonly [CatalogueLocale, Catalogue];

const ROMANIAN: LocalisedCatalogue = ["ro", roMessages];

const EVERY_SUBSTATE = ["1A", "1B", "1C", "1D"] as const;
type Substate = (typeof EVERY_SUBSTATE)[number];

/** One query per sub-state, taken from `room-url-state.test.ts`'s own fixtures rather than invented,
 *  so a rule the parser changes is felt here as a failed guard and not as a silent re-interpretation. */
const QUERY_FOR: Readonly<Record<Substate, RoomSearchParams>> = {
  "1A": {},
  "1B": { shape: "L" },
  "1C": {
    shape: "L",
    wallA: "0.9",
    wallB: "2.16",
    height: "2.2",
    direction: "right",
  },
  "1D": {
    shape: "L",
    wallA: "3.6",
    wallB: "2.4",
    height: "2.5",
    direction: "left",
  },
};

/** Every shape the picker draws, in the frame's order down the screen. */
const EVERY_SHAPE: readonly RoomShape[] = ["linear", "L", "U"];

/** The shapes `APPROVED_ROOM_POLICY` refuses today. `linear` waits on wave 7J's bounds and `U` on
 *  M7B; both cards are drawn and both dead ends are deliberate (the owner's F8 ruling, 2026-09-14). */
const REFUSED_SHAPES: readonly RoomShape[] = ["linear", "U"];

/** Read by path rather than through `new URL(…, import.meta.url)`: under `happy-dom` the module URL
 *  is not a `file:` one, and `readFileSync` refuses it. */
const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");

const ROOM_SCREEN_SOURCE = readFileSync(
  resolve(SOURCE_ROOT, "room/room-screen.tsx"),
  "utf8",
);
const ROOM_PAGE_SOURCE = readFileSync(
  resolve(SOURCE_ROOT, "app/[locale]/configurator/room/page.tsx"),
  "utf8",
);

/**
 * **R8, and the cast it confines** (ADR 0116). Criterion 3's real claim is that the CTA asks
 * `isShapeBuildable` instead of spelling `L`, and the only way to prove it is to render against a
 * policy that states a *second* shape's bounds — which `BuildableShapes`, declaring `L?` alone,
 * refuses to let anyone construct. The type is deliberately narrow: widening it would make it
 * typechecked to populate bounds `validateRoomInput` still refuses, so two authorities would
 * disagree about one question.
 *
 * So the cast lives here, once, named — the twin of `configurator-domain`'s own
 * `tests/room/is-shape-buildable.test.ts:39-45`. **Wave 7J deletes both**, and their absence is what
 * proves the widening was real.
 */
function policyAlsoStating(shape: RoomShape): RoomPolicy {
  return {
    ...APPROVED_ROOM_POLICY,
    buildableShapes: {
      ...APPROVED_ROOM_POLICY.buildableShapes,
      [shape]: approvedLWallBounds(),
    } as BuildableShapes,
  };
}

function approvedLWallBounds(): LWallBounds {
  const bounds = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (bounds === undefined) {
    throw new Error(
      "the approved policy states no L bounds to fabricate a second buildable shape from",
    );
  }
  return bounds;
}

/** A module's code with its prose stripped out. The pill's own comment quotes the *1/4* it draws, as
 *  it should, and a must-not about a **literal** has to read the code rather than the sentence
 *  explaining it. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The catalogue's own sentence with the step's two arguments in place. Written as a substitution
 *  rather than as a Romanian literal, which is also the point of the assertion: what the pill
 *  announces has to *be* the approved leaf, at `step: 1`. */
function stepSentenceOf(catalogue: Catalogue): string {
  return catalogue.configure.step
    .replace("{step, number}", "1")
    .replace("{totalSteps, number}", "4");
}

let container: HTMLDivElement;
let root: Root;

function render(
  query: RoomSearchParams,
  options: { catalogue?: LocalisedCatalogue; policy?: RoomPolicy } = {},
): void {
  const [locale, messages] = options.catalogue ?? ROMANIAN;
  // The policy is *omitted* rather than passed as `undefined` when a test does not fabricate one, so
  // the ordinary renders here go through the component's own default — the approved policy — exactly
  // as the route does.
  const props: RoomScreenProps =
    options.policy === undefined ? {} : { policy: options.policy };
  // **The query is handed over as the browser's and nowhere else** (ruling R9): the screen takes no
  // parse from the route, so setting the live query is the whole of putting it in a sub-state.
  browser.search = searchOf(query);
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(RoomScreen, props),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

/** The same query as a search string, so the live query and the page's props describe one URL. A
 *  repeated key stays repeated: collapsing it here would ask the screen a different question from
 *  the one the fixture spells. */
function searchOf(query: RoomSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const single of typeof value === "string" ? [value] : (value ?? [])) {
      params.append(key, single);
    }
  }
  return params.toString();
}

/** The screen's own element, which is where the sub-state markers live under ruling R9 — the route
 *  draws no wrapper of its own any more. */
function screenElement(): HTMLElement {
  const main = container.querySelector("main");
  if (!(main instanceof HTMLElement)) {
    throw new Error("the screen draws no main element");
  }
  return main;
}

function elementAt(testId: string): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the screen draws no ${testId}`);
  }
  return element;
}

function continueButton(): HTMLButtonElement {
  const cta = elementAt("room-continue");
  if (!(cta instanceof HTMLButtonElement)) {
    throw new Error("the footer's control is not a button");
  }
  return cta;
}

function shapeControl(shape: RoomShape): HTMLInputElement {
  const control = elementAt(`room-shape-${shape}`);
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`the ${shape} card holds no control`);
  }
  return control;
}

function lengthField(field: string): HTMLInputElement {
  const control = elementAt(`room-length-${field}`);
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`the ${field} field is not an input`);
  }
  return control;
}

function choose(shape: RoomShape): void {
  act(() => {
    shapeControl(shape).click();
  });
}

function textAt(testId: string): string {
  return elementAt(testId).textContent;
}

beforeEach(() => {
  browser.push.mockClear();
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

describe("the top bar, in every sub-state (criterion 1)", () => {
  it.each(EVERY_SUBSTATE)(
    "carries the wordmark, the step, the title and the language menu at %s",
    (substate) => {
      const query = QUERY_FOR[substate];
      expect(parseRoomUrlState(query).substate).toBe(substate);

      render(query);

      expect(textAt("top-bar-wordmark")).toBe(roMessages.brand);
      expect(textAt("top-bar-step")).toBe("1/4");
      expect(elementAt("top-bar-step").getAttribute("aria-label")).toBe(
        stepSentenceOf(roMessages),
      );
      expect(textAt("top-bar-title")).toBe(roMessages.room.title);
      expect(elementAt("top-bar-locale")).toBeInstanceOf(HTMLButtonElement);
    },
  );

  it.each(CATALOGUES)(
    "renders the step's numbers as ICU arguments in %s",
    (locale, messages) => {
      render(QUERY_FOR["1A"], { catalogue: [locale, messages] });

      expect(textAt("top-bar-step")).toBe("1/4");
      expect(elementAt("top-bar-step").getAttribute("aria-label")).toBe(
        stepSentenceOf(messages),
      );
      expect(textAt("top-bar-title")).toBe(messages.room.title);
    },
  );

  it("composes the pill from the approved leaves and never from the numbers", () => {
    // The must-not half of criterion 1: a pill built as `"1" + "/" + "4"` would render identically
    // in the assertion above and would stop being translatable the moment a locale writes the step
    // differently. R7's other half is here too — the screen reads `configure.step`, so the owner's
    // approved sentence is held once rather than copied into a second `room.*` leaf.
    const code = codeOf(ROOM_SCREEN_SOURCE);

    expect(code).toContain('translate("configure.stepPill"');
    expect(code).toContain('translate("configure.step"');
    expect(code).not.toMatch(/["'`]1\/4["'`]/);
    expect(code).not.toMatch(/["'`]1["'`]\s*\+/);
  });
});

describe("three cards, never a dropdown (criterion 2)", () => {
  it.each(EVERY_SUBSTATE)(
    "offers no select-shaped control at %s",
    (substate) => {
      const query = QUERY_FOR[substate];
      expect(parseRoomUrlState(query).substate).toBe(substate);

      render(query);

      expect(
        container.querySelectorAll(
          "select, option, datalist, [role='combobox']",
        ).length,
      ).toBe(0);
    },
  );

  it("draws exactly the three shapes, in the frame's order", () => {
    render(QUERY_FOR["1A"]);

    const cards = [
      ...container.querySelectorAll("[data-testid^='room-shape-card-']"),
    ];

    expect(cards.map((card) => card.getAttribute("data-testid"))).toEqual(
      EVERY_SHAPE.map((shape) => `room-shape-card-${shape}`),
    );
  });

  it.each(CATALOGUES)(
    "names and describes every card from the catalogue in %s",
    (locale, messages) => {
      render(QUERY_FOR["1A"], { catalogue: [locale, messages] });

      for (const shape of EVERY_SHAPE) {
        const card = elementAt(`room-shape-card-${shape}`);
        expect(card.textContent).toContain(messages.room.shapes[shape].name);
        expect(card.textContent).toContain(messages.room.shapes[shape].detail);
      }
    },
  );

  it("gives every card a 2D plan glyph the screen reader steps over", () => {
    render(QUERY_FOR["1A"]);

    for (const shape of EVERY_SHAPE) {
      const glyph = elementAt(`room-shape-card-${shape}`).querySelector("svg");
      expect(glyph?.getAttribute("aria-hidden")).toBe("true");
      expect(glyph?.querySelectorAll("rect").length).toBeGreaterThan(1);
    }
  });

  it("names the group with the visible question rather than an invented label", () => {
    render(QUERY_FOR["1A"]);
    const group = elementAt("room-shapes");
    const labelId = group.getAttribute("aria-labelledby") ?? "";

    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(container.querySelector(`[id="${labelId}"]`)?.textContent).toBe(
      roMessages.room.shapeQuestion,
    );
  });
});

describe("the footer CTA, disabled until a buildable shape is chosen (criterion 3)", () => {
  it("is disabled while nothing is chosen", () => {
    render(QUERY_FOR["1A"]);

    expect(continueButton().disabled).toBe(true);
  });

  it.each(REFUSED_SHAPES)(
    "records the choice of %s and still refuses to continue",
    (shape) => {
      render(QUERY_FOR["1A"]);

      choose(shape);

      // Both halves matter: the card **is** chosen — the owner ruled all three are drawn and
      // selectable — and the dead end is the CTA's, which is where wave 7F2 will put the reason.
      expect(shapeControl(shape).checked).toBe(true);
      expect(continueButton().disabled).toBe(true);
    },
  );

  it("continues once the L is chosen", () => {
    render(QUERY_FOR["1A"]);

    choose("L");

    expect(continueButton().disabled).toBe(false);
  });

  it.each(REFUSED_SHAPES)(
    "enables %s against a policy that states its bounds, with no edit to the component",
    (shape) => {
      // The wave's real claim: the CTA reads the policy. Wave 7J adds the straight kitchen's
      // approved bounds to `APPROVED_ROOM_POLICY` and changes nothing under `apps/web/src/room` —
      // this is the test that says it may.
      render(QUERY_FOR["1A"], { policy: policyAlsoStating(shape) });

      choose(shape);

      expect(continueButton().disabled).toBe(false);
    },
  );

  it("pushes the chosen shape as the canonical query", () => {
    render(QUERY_FOR["1A"]);
    choose("L");

    act(() => {
      continueButton().click();
    });

    expect(browser.push).toHaveBeenCalledWith("/ro/configurator/room?shape=L");
  });

  it("is a button rather than a div, because it is wired", () => {
    // ADR 0104 decision 6 asks for a `div` on a control wired to nothing. This one navigates, so a
    // `div` here would announce itself as text while behaving as a control.
    render(QUERY_FOR["1A"]);

    expect(continueButton().type).toBe("button");
    expect(continueButton().textContent).toBe(roMessages.room.continue);
  });
});

describe("each room in the URL is entered afresh", () => {
  it("re-seeds the form when two queries differ only in where a separator falls", () => {
    // **Kept, and re-aimed** (wave 7F1-D45). These two queries are two different rooms and the
    // second must show its own 3,56 — that claim is unchanged. What is gone is the mechanism it used
    // to protect: `roomEntryKey` joined the query's values with a `|` and escaped each one first,
    // because unescaped these two both spell `L|3.56|a|b||` and React would have kept one component
    // across the navigation with the first room's empty draft standing.
    //
    // Ruling R9 deleted that key — under a debounced `router.replace` a query-derived key moves
    // while the customer is typing, remounting the form and clearing any field whose text does not
    // yet parse. The re-seed is now the reconciliation's (`room-query-sync.ts`), which compares
    // whole query **text** and so has no separator to borrow and no collision to guard against.
    // **Do not reinstate an escaping for a collision the design can no longer have.**
    const separatorInsideWallA: RoomSearchParams = {
      shape: "L",
      wallA: "3.56|a",
      wallB: "b",
    };
    const separatorInsideWallB: RoomSearchParams = {
      shape: "L",
      wallA: "3.56",
      wallB: "a|b",
    };

    render(separatorInsideWallA);
    expect(lengthField("wallA").value).toBe("");

    render(separatorInsideWallB);

    expect(lengthField("wallA").value).toBe("3560");
  });
});

describe("the sub-state the screen marks is the live query's (criterion 19)", () => {
  it.each(EVERY_SUBSTATE)(
    "marks %s and its fields from the query the browser holds",
    (substate) => {
      const query = QUERY_FOR[substate];
      const state = parseRoomUrlState(query);
      expect(state.substate).toBe(substate);

      render(query);

      expect(screenElement().getAttribute("data-room-substate")).toBe(substate);
      expect(screenElement().getAttribute("data-marked-fields")).toBe(
        state.markedFields.join(","),
      );
    },
  );

  it("re-derives the sub-state when the browser hands over another entry's query", () => {
    // **Defect D5, and the assertion that would have caught it.** Next reuses a page segment on a
    // back/forward navigation, so the screen is re-rendered against a query it was not mounted for
    // and no new server parse arrives with it. The second render here is that navigation: nothing
    // but the live query changes, and the marker has to follow it rather than keep the reading the
    // screen first mounted with.
    render(QUERY_FOR["1B"]);
    expect(screenElement().getAttribute("data-room-substate")).toBe("1B");

    render(QUERY_FOR["1D"]);

    expect(screenElement().getAttribute("data-room-substate")).toBe("1D");
    expect(screenElement().getAttribute("data-marked-fields")).toBe("");
    expect(lengthField("wallA").value).toBe("3600");
  });
});

describe("the route stays a server shell (criterion 17)", () => {
  it("renders one client component and hands it nothing, and declares nothing else", () => {
    // **The must-not is the content of this criterion now** (ruling R9): D5 is unrepresentable only
    // if the server's parse is *absent*, not merely unused. A route that parsed the query and
    // dropped the result would pass every other assertion here and would be one edit away from
    // handing it over again.
    // The must-nots read the route's **code**: its comment records what `await searchParams` used
    // to be doing there and why it went, which is the sentence a reader arriving at `connection()`
    // needs, and a must-not that forbade naming the thing it forbids would delete it.
    const code = codeOf(ROOM_PAGE_SOURCE);

    expect(code).toContain("<RoomScreen />");
    expect(code).not.toMatch(/parseRoomUrlState/);
    expect(code).not.toMatch(/searchParams/);
    // `connection()` is what holds the route out of the prerender manifest now that nothing here
    // reads a request-time input. `next build`'s route table is the real check (criterion 17 says
    // to verify it there); this only guards the call against being deleted as dead code.
    expect(code).toContain("await connection();");
    expect(code).toMatch(/from "next\/server"/);
    expect(code).not.toMatch(/^\s*["']use client["'];/m);
    expect(code).not.toMatch(/module\.css|useTranslations|useContent|useState/);
  });
});
