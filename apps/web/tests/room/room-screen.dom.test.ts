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
//
// **Wave 7F2 slice S4 lives here too** — the shape refusal at 1A, 1B and 1C and the linear-suggestion
// hook (criteria 2, 9, 10, 12 and 16) — because its fabricated-policy arm needs a shape the policy
// does not build. Since M7B U6 every shape is buildable under the approved policy, so
// `../support/policy-without-u` is the one place that fabrication is written (C1.4, ADR 0116).
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  isShapeBuildable,
  validateRoomInput,
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

import { ROOM_ISSUE_MESSAGE_KEYS } from "@/room/room-issue-model";
import { RoomScreen, type RoomScreenProps } from "@/room/room-screen";
import {
  parseRoomUrlState,
  type RoomSearchParams,
} from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import {
  CATALOGUES,
  requireLeafAt,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";
import { policyWithoutU } from "../support/policy-without-u";

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
 * **R8, and the fabrication it confines** (ADR 0116). Criterion 3's real claim is that the CTA asks
 * `isShapeBuildable` instead of spelling `L`, and the only way to prove it is to render against a
 * policy whose answer differs from the approved one's. 7J S5 discharged the fabrication for `linear`
 * (D11) and M7B U6 for the U: `APPROVED_ROOM_POLICY` builds all three, so the contrast is now a
 * policy that states no U.
 */
const POLICY_WITHOUT_U: RoomPolicy = policyWithoutU();

/** Refuses every shape, so any two of the three cards can stand in for "two refused shapes" in a
 *  test about the announcement mechanics rather than about which shapes the real policy builds. */
const POLICY_BUILDING_NOTHING: RoomPolicy = {
  ...APPROVED_ROOM_POLICY,
  buildableShapes: {},
};

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

  // M7B U6 S1, AC5 (census W26): the approved policy builds the U, so choosing its card enables the
  // CTA with no component edit.
  it("records the choice of U and continues, under the approved policy", () => {
    render(QUERY_FOR["1A"]);

    choose("U");

    expect(shapeControl("U").checked).toBe(true);
    expect(continueButton().disabled).toBe(false);
  });

  // The pre-U6 dead end, kept as the fabricated arm (ADR 0116): the card **is** chosen — the owner ruled
  // all three are drawn and selectable — and the dead end is the CTA's.
  it("records the choice of U and still refuses to continue, under a policy that states none", () => {
    render(QUERY_FOR["1A"], { policy: POLICY_WITHOUT_U });

    choose("U");

    expect(shapeControl("U").checked).toBe(true);
    expect(continueButton().disabled).toBe(true);
  });

  it("continues once the L is chosen", () => {
    render(QUERY_FOR["1A"]);

    choose("L");

    expect(continueButton().disabled).toBe(false);
  });

  // 7J S5: linear is buildable under the real approved policy now (ADR 0108 Amendment G), so
  // choosing it at 1A leads Continue on exactly as choosing the L does — restated from "records the
  // choice of linear and still refuses to continue", which held while every straight room was
  // refused.
  it("continues once linear is chosen, with no fields typed yet", () => {
    render(QUERY_FOR["1A"]);

    choose("linear");

    expect(shapeControl("linear").checked).toBe(true);
    expect(continueButton().disabled).toBe(false);
  });

  // M7B U6 S1, AC5: *În formă de U* → *Continuă* → 1B, with no component edit. The navigation is the
  // canonical query, and that query is a U at 1B: three wall fields and the height, none typed yet.
  it("takes the U card through Continue to the U's 1B, with no component edit", () => {
    render(QUERY_FOR["1A"]);
    choose("U");

    act(() => {
      continueButton().click();
    });

    expect(browser.push).toHaveBeenCalledWith("/ro/configurator/room?shape=U");
    render({ shape: "U" });
    expect(screenElement().getAttribute("data-room-substate")).toBe("1B");
    for (const field of ["wallA", "wallB", "wallC", "height"]) {
      expect(lengthField(field).value).toBe("");
    }
  });

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

// ---------------------------------------------------------------------------------------------
// Wave 7F2 slice S4 — the shape refusal, and the linear suggestion wired off
// ---------------------------------------------------------------------------------------------

const REFUSAL = "room-shape-refusal";
const REFUSAL_STATUS = "room-shape-refusal-status";
const LINEAR_SUGGESTION = "room-linear-suggestion";

/** The policies criterion 9 is swept over: the approved one, which refuses no shape, and R8's
 *  fabrication that states no U — under which the U's refusal comes with no component edit. */
const POLICIES: readonly (readonly [string, RoomPolicy])[] = [
  ["the approved policy", APPROVED_ROOM_POLICY],
  ["a policy stating no U", POLICY_WITHOUT_U],
];

/** Every text a field can arrive holding, from the address bar: empty, a length in metres, or junk. */
const ANY_FIELD_TEXT = fc.oneof(
  fc.constant(""),
  fc.stringMatching(/^[0-9]{1,2}(\.[0-9]{1,4})?$/),
  fc.string({ maxLength: 6 }),
);

function maybeAt(testId: string): HTMLElement | null {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  return element instanceof HTMLElement ? element : null;
}

function isRefusalShown(): boolean {
  return maybeAt(REFUSAL) !== null;
}

function chipControl(shape: RoomShape): HTMLInputElement {
  const control = elementAt(`room-shape-chip-control-${shape}`);
  if (!(control instanceof HTMLInputElement)) {
    throw new Error(`the ${shape} chip holds no control`);
  }
  return control;
}

function chooseChip(shape: RoomShape): void {
  act(() => {
    chipControl(shape).click();
  });
}

function everyChipControl(): readonly HTMLInputElement[] {
  return EVERY_SHAPE.map(chipControl);
}

/** A filled room of each shape. Under `POLICY_WITHOUT_U` the U's is 1C for its shape alone (fields are
 *  not judged, ADR 0108 decision 2); under the approved policy it is 1D. */
const FILLED: Readonly<Record<RoomShape, RoomSearchParams>> = {
  linear: { shape: "linear", wallA: "3.6", height: "2.6" },
  L: QUERY_FOR["1D"],
  U: {
    shape: "U",
    wallA: "3.6",
    wallB: "2.4",
    wallC: "2.4",
    height: "2.6",
    direction: "left",
  },
};

describe("the shape refusal is the policy's, at 1A (7F2 criterion 9)", () => {
  it("draws its status region empty before any card is chosen", () => {
    render(QUERY_FOR["1A"]);

    expect(elementAt(REFUSAL_STATUS).getAttribute("role")).toBe("status");
    expect(elementAt(REFUSAL_STATUS).childNodes).toHaveLength(0);
  });

  it.each(POLICIES)(
    "shows under the cards exactly when the chosen shape is not buildable, under %s",
    (_, policy) => {
      render(QUERY_FOR["1A"], { policy });

      for (const shape of EVERY_SHAPE) {
        choose(shape);

        expect(isRefusalShown(), shape).toBe(!isShapeBuildable(shape, policy));
      }
    },
  );

  it("describes the cards' group by the refusal while U is chosen, and by nothing once L is", () => {
    render(QUERY_FOR["1A"], { policy: POLICY_WITHOUT_U });
    const group = elementAt("room-shapes");

    choose("U");
    expect(group.getAttribute("aria-describedby")).toBe(elementAt(REFUSAL).id);

    choose("L");
    expect(group.hasAttribute("aria-describedby")).toBe(false);
  });

  // 7J S5: linear is real now, so `POLICY_BUILDING_NOTHING` keeps both cards refused — this test's
  // own subject is the re-announcement mechanics, not which two shapes the real policy happens to
  // refuse.
  it("announces the refusal again when one refused card is swapped for the other", () => {
    render(QUERY_FOR["1A"], { policy: POLICY_BUILDING_NOTHING });
    const region = elementAt(REFUSAL_STATUS);
    choose("linear");
    const first = elementAt(REFUSAL);

    choose("U");

    expect(elementAt(REFUSAL_STATUS)).toBe(region);
    expect(elementAt(REFUSAL)).not.toBe(first);
  });
});

describe("the shape refusal is the policy's, at 1B and 1C, whatever is typed (7F2 criterion 9)", () => {
  it.each(POLICIES)(
    "shows under the chips exactly when the chosen shape is not buildable, under %s",
    (_, policy) => {
      fc.assert(
        fc.property(
          fc.constantFrom(...EVERY_SHAPE),
          fc.record({
            wallA: ANY_FIELD_TEXT,
            wallB: ANY_FIELD_TEXT,
            wallC: ANY_FIELD_TEXT,
            height: ANY_FIELD_TEXT,
          }),
          (shape, fields) => {
            const query = { shape, ...fields, direction: "left" };
            expect(parseRoomUrlState(query).substate).not.toBe("1A");

            render(query, { policy });

            expect(isRefusalShown()).toBe(!isShapeBuildable(shape, policy));
          },
        ),
        { numRuns: 300 },
      );
    },
  );

  it("follows a chip to U and back at once, in the region that was already there", () => {
    render(QUERY_FOR["1B"], { policy: POLICY_WITHOUT_U });
    const region = elementAt(REFUSAL_STATUS);
    expect(region.childNodes).toHaveLength(0);

    chooseChip("U");
    expect(elementAt(REFUSAL_STATUS)).toBe(region);
    expect(isRefusalShown()).toBe(true);

    chooseChip("L");
    expect(isRefusalShown()).toBe(false);
  });

  // 7J S5: linear is buildable now, so following its chip from 1B draws no refusal at all —
  // restated from "follows a chip to linear and back at once", which held while it was refused.
  it("follows a chip to linear without ever showing a refusal", () => {
    render(QUERY_FOR["1B"]);
    const region = elementAt(REFUSAL_STATUS);

    chooseChip("linear");

    expect(elementAt(REFUSAL_STATUS)).toBe(region);
    expect(isRefusalShown()).toBe(false);
  });

  it("describes only the chosen chip by the refusal while it is refused, and no chip once L is", () => {
    // Coordinator ruling, 2026-09-22 (review R1.2): an unchosen chip — the buildable L among them —
    // is never described by a sentence about another shape, which browse mode would read on it.
    render(QUERY_FOR["1B"], { policy: POLICY_WITHOUT_U });

    chooseChip("U");
    const refusalId = elementAt(REFUSAL).id;
    expect(
      everyChipControl().map((chip) => chip.getAttribute("aria-describedby")),
    ).toEqual([null, null, refusalId]);

    chooseChip("L");
    expect(
      everyChipControl().filter((chip) =>
        chip.hasAttribute("aria-describedby"),
      ),
    ).toEqual([]);
  });

  // 7J S5: `POLICY_BUILDING_NOTHING` again — see the 1A version of this test.
  it("announces the refusal again when one refused chip is swapped for the other", () => {
    render(QUERY_FOR["1B"], { policy: POLICY_BUILDING_NOTHING });
    chooseChip("linear");
    const first = elementAt(REFUSAL);

    chooseChip("U");

    expect(elementAt(REFUSAL)).not.toBe(first);
  });

  it("shows the refusal and the note for a filled U, and no room reason", () => {
    expect(parseRoomUrlState(FILLED.U, POLICY_WITHOUT_U).substate).toBe("1C");

    render(FILLED.U, { policy: POLICY_WITHOUT_U });

    expect(isRefusalShown()).toBe(true);
    expect(maybeAt("room-presets-after-valid")).not.toBe(null);
    expect(maybeAt("room-room-reason")).toBe(null);
  });
});

describe("the refusal's words (7F2 criteria 2 and 9)", () => {
  /** ADR 0120 decisions 3–4: the refusal names no internal reason. */
  const INTERNAL_REASON_WORDS: Readonly<
    Record<CatalogueLocale, readonly string[]>
  > = {
    ro: ["implementat", "dezvoltare", "versiune", "eroare", "cod"],
    ru: ["реализ", "разработ", "верси", "ошибк", "код"],
  };
  /** The straight kitchen's stem, which the shape leaves below spell only in the nominative. */
  const STRAIGHT_KITCHEN_STEM: Readonly<Record<CatalogueLocale, string>> = {
    ro: "liniar",
    ru: "линейн",
  };

  it.each(CATALOGUES)(
    "says why without a digit, a code, a unit or an internal reason, and suggests no shape, in %s",
    (locale, messages) => {
      render(QUERY_FOR["1A"], {
        catalogue: [locale, messages],
        policy: POLICY_WITHOUT_U,
      });
      choose("U");

      const text = textAt(REFUSAL);
      const lowered = text.toLowerCase();
      const shapeWords = EVERY_SHAPE.flatMap((shape) => [
        requireLeafAt(messages, `room.shapes.${shape}.name`),
        requireLeafAt(messages, `room.shapes.${shape}.short`),
      ]).map((word) => word.toLowerCase());

      expect(text).toBe(
        requireLeafAt(messages, "room.issue.shapeNotBuildable"),
      );
      expect(text).not.toMatch(/\p{Nd}/u);
      expect(text).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
      expect(text).not.toMatch(/\bmm\b|мм/);
      for (const word of INTERNAL_REASON_WORDS[locale]) {
        expect(lowered).not.toContain(word);
      }
      for (const word of [...shapeWords, STRAIGHT_KITCHEN_STEM[locale]]) {
        expect(lowered).not.toContain(word);
      }
      expect(text).not.toMatch(/\b[LU]\b/);
    },
  );
});

describe("the straight kitchen's suggestion is the domain's own answer, at 1C (7F2 criterion 10)", () => {
  /** One room per code 1C can carry, and the policy it is read under. `SHAPE_NOT_BUILDABLE`'s witness is
   *  `FILLED.U` under `POLICY_WITHOUT_U` (census W33, W34): no shape is refused by the approved policy
   *  since M7B U6, and the code is still one the domain can answer under any policy that omits a shape. */
  const WITNESSES: readonly (readonly [
    string,
    RoomSearchParams,
    RoomPolicy,
  ])[] = [
    ["SHAPE_NOT_BUILDABLE", FILLED.U, POLICY_WITHOUT_U],
    ["ROOM_TOO_SMALL_FOR_KITCHEN", QUERY_FOR["1C"], APPROVED_ROOM_POLICY],
    [
      "WALL_TOO_SHORT",
      { ...QUERY_FOR["1D"], wallB: "0.45" },
      APPROVED_ROOM_POLICY,
    ],
    [
      "WALL_TOO_LONG",
      { ...QUERY_FOR["1D"], wallA: "6.5" },
      APPROVED_ROOM_POLICY,
    ],
    [
      "HEIGHT_TOO_LOW",
      { ...QUERY_FOR["1D"], height: "2" },
      APPROVED_ROOM_POLICY,
    ],
    [
      "HEIGHT_TOO_HIGH",
      { ...QUERY_FOR["1D"], height: "4" },
      APPROVED_ROOM_POLICY,
    ],
  ];

  function issueCodesOf(
    query: RoomSearchParams,
    policy: RoomPolicy,
  ): readonly string[] {
    const state = parseRoomUrlState(query, policy);
    return state.substate === "1C"
      ? state.issues.map((issue) => issue.code)
      : [];
  }

  /** The real gate (`room-issue-model.ts`'s `isLinearSuggested`), read from the same 1C state the
   *  screen renders from: a reason other than the shape's own, and wall A with the height
   *  validating as a straight room on their own. */
  function expectedSuggestionFor(
    query: RoomSearchParams,
    policy: RoomPolicy,
  ): boolean {
    const state = parseRoomUrlState(query, policy);
    if (state.substate !== "1C") return false;
    const hasAReason = state.issues.some(
      (issue) => issue.code !== "SHAPE_NOT_BUILDABLE",
    );
    if (!hasAReason) return false;
    return validateRoomInput(
      {
        shape: "linear",
        wallAMm: state.input.wallAMm,
        heightMm: state.input.heightMm,
      },
      APPROVED_ROOM_POLICY,
    ).ok;
  }

  it("has a witness for every code 1C can carry, and each witness carries its code", () => {
    expect(new Set(WITNESSES.map(([code]) => code))).toEqual(
      new Set(Object.keys(ROOM_ISSUE_MESSAGE_KEYS)),
    );
    for (const [code, query, policy] of WITNESSES) {
      expect(issueCodesOf(query, policy), code).toContain(code);
    }
  });

  // 7J S5: the suggestion shows exactly when the real domain's gate says so — no longer a blanket
  // absence, which held while every straight room was refused. `WALL_TOO_SHORT`'s witness (wall A
  // 3600, height 2500, wall B too short) is the one case among these where it now shows.
  it.each(WITNESSES)(
    "matches the real gate at 1C for %s under the policy that witnesses it",
    (code, query, policy) => {
      render(query, { policy });

      expect(maybeAt("room-presets-after-valid")).not.toBe(null);
      expect(maybeAt(LINEAR_SUGGESTION) !== null, code).toBe(
        expectedSuggestionFor(query, policy),
      );
    },
  );

  it.each(EVERY_SHAPE)(
    "is absent at 1B for %s under the approved policy",
    (shape) => {
      render({ shape, direction: "left" });

      expect(maybeAt(LINEAR_SUGGESTION)).toBe(null);
    },
  );
});

describe("1C with the refusal removes nothing (7F2 criterion 12)", () => {
  it("keeps the three chips and the corner toggle beside the refusal, and both still work", () => {
    render(FILLED.U, { policy: POLICY_WITHOUT_U });
    expect(isRefusalShown()).toBe(true);
    expect(everyChipControl()).toHaveLength(3);
    // Restated 2026-09-29 (M7B U5 S1, Q-U4 (b)): the U itself draws no toggle, so the toggle is
    // reached after the chip moves to L, where it exists.
    expect(maybeAt("room-corner")).toBe(null);

    chooseChip("L");
    act(() => {
      elementAt("room-corner-control-right").click();
    });

    expect(chipControl("L").checked).toBe(true);
    expect(isRefusalShown()).toBe(false);
    const right = elementAt("room-corner-control-right");
    expect(right instanceof HTMLInputElement && right.checked).toBe(true);
  });
});

describe("no bound is read under src/room (7F2 criterion 16)", () => {
  it("reads no minimum, maximum, minimum kitchen or corner reach in any module's code", () => {
    const roomDirectory = resolve(SOURCE_ROOT, "room");
    const modules = readdirSync(roomDirectory).filter((entry) =>
      /\.tsx?$/.test(entry),
    );
    expect(modules).toContain("room-screen.tsx");

    for (const entry of modules) {
      const code = codeOf(readFileSync(resolve(roomDirectory, entry), "utf8"));
      expect(code, entry).not.toMatch(
        /\b(minMm|maxMm|minimumKitchen|cornerReachMm)\b/,
      );
    }
  });
});
