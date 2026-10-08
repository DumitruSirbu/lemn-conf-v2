// @vitest-environment happy-dom
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

/** The address bar, the live query and the router, which a test render cannot supply; `search` is what
 *  `useSearchParams` reads. */
const browser = vi.hoisted(() => ({
  pathname: "/ro/configurator/room",
  search: "",
  push: vi.fn(),
}));

// Mocked one layer below the component's own import, so next-intl's href construction is exercised, not stubbed.
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

/** One query per sub-state, taken from `room-url-state.test.ts`'s own fixtures rather than invented. */
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

/** Renders against a policy that states no U: the only way to prove the CTA asks `isShapeBuildable` (ADR 0116). */
const POLICY_WITHOUT_U: RoomPolicy = policyWithoutU();

/** Refuses every shape, for tests about announcement mechanics rather than which shapes the real policy builds. */
const POLICY_BUILDING_NOTHING: RoomPolicy = {
  ...APPROVED_ROOM_POLICY,
  buildableShapes: {},
};

/** A module's code with its prose stripped, so a must-not about a literal does not read the comment explaining it. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The catalogue's own step sentence with its two arguments substituted, so no Romanian literal is spelled here. */
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
  // Omitted, not `undefined`, so ordinary renders use the component's own default policy.
  const props: RoomScreenProps =
    options.policy === undefined ? {} : { policy: options.policy };
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

/** The same query as a search string; a repeated key stays repeated, since collapsing it asks another question. */
function searchOf(query: RoomSearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const single of typeof value === "string" ? [value] : (value ?? [])) {
      params.append(key, single);
    }
  }
  return params.toString();
}

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
    // A pill built as `"1" + "/" + "4"` would render identically above but could not be translated. Both shipped
    // catalogues spell the leaf the same way, so the two are made to disagree: under a catalogue that words the
    // pill differently, the pill has to follow the catalogue.
    // Cast, because the catalogue's type is the shipped leaves' own literals and this one is deliberately not shipped.
    const rewordedPill = {
      ...roMessages,
      configure: {
        ...roMessages.configure,
        stepPill: "{step, number} · {totalSteps, number}",
      },
    } as unknown as Catalogue;
    render(QUERY_FOR["1A"], { catalogue: ["ro", rewordedPill] });

    expect(textAt("top-bar-step")).toBe("1 · 4");

    // The lesser half, kept: a search of the source for the two leaf names.
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

  it("records the choice of U and continues, under the approved policy", () => {
    render(QUERY_FOR["1A"]);

    choose("U");

    expect(shapeControl("U").checked).toBe(true);
    expect(continueButton().disabled).toBe(false);
  });

  // The card is chosen (all three are selectable); the dead end is the CTA's.
  it("records the choice of U and still refuses to continue, under a policy that states none", () => {
    render(QUERY_FOR["1A"], { policy: POLICY_WITHOUT_U });

    choose("U");

    expect(shapeControl("U").checked).toBe(true);
    expect(continueButton().disabled).toBe(true);
  });

  it("continues once linear is chosen, with no fields typed yet", () => {
    render(QUERY_FOR["1A"]);

    choose("linear");

    expect(shapeControl("linear").checked).toBe(true);
    expect(continueButton().disabled).toBe(false);
  });

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
    render(QUERY_FOR["1A"]);

    expect(continueButton().type).toBe("button");
    expect(continueButton().textContent).toBe(roMessages.room.continue);
  });
});

describe("each room in the URL is entered afresh", () => {
  it("re-seeds the form when two queries differ only in where a separator falls", () => {
    // Two different rooms; re-seeding compares whole query text (`room-query-sync.ts`), so no separator collides.
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
    // Next reuses the page segment on back/forward, so only the live query changes and the marker must follow it.
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
    // The route must not parse the query or hand it over: an unused parse is one edit from being handed over.
    // The must-nots read the route's code, not its comments.
    const code = codeOf(ROOM_PAGE_SOURCE);

    expect(code).toContain("<RoomScreen />");
    expect(code).not.toMatch(/parseRoomUrlState/);
    expect(code).not.toMatch(/searchParams/);
    // `connection()` holds the route out of the prerender manifest; this guards it against deletion as dead code.
    expect(code).toContain("await connection();");
    expect(code).toMatch(/from "next\/server"/);
    expect(code).not.toMatch(/^\s*["']use client["'];/m);
    expect(code).not.toMatch(/module\.css|useTranslations|useContent|useState/);
  });
});

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

  // `POLICY_BUILDING_NOTHING` keeps both cards refused: the subject is re-announcement, not which shapes refuse.
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

  it("follows a chip to linear without ever showing a refusal", () => {
    render(QUERY_FOR["1B"]);
    const region = elementAt(REFUSAL_STATUS);

    chooseChip("linear");

    expect(elementAt(REFUSAL_STATUS)).toBe(region);
    expect(isRefusalShown()).toBe(false);
  });

  it("describes only the chosen chip by the refusal while it is refused, and no chip once L is", () => {
    // An unchosen chip is never described by a sentence about another shape, which browse mode would read on it.
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
   *  `FILLED.U` under `POLICY_WITHOUT_U`: the approved policy refuses no shape. */
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

  /** The real gate (`isLinearSuggested`): a reason other than the shape's own, and wall A with the height
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

  // The suggestion shows exactly when the domain's gate says so; `WALL_TOO_SHORT`'s witness is the one case it shows.
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
    // The U draws no corner toggle, so the toggle is reached after the chip moves to L.
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
