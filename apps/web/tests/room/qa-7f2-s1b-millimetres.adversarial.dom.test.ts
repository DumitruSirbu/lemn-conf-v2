// @vitest-environment happy-dom
//
// Adversarial QA for wave 7F2 slice S1b (ADR 0126), on the rendered Step 1 screen **in both locales**.
// The implementer's screen suites render `ro` only; since S1b the refill takes no locale at all, and
// the two locale sweeps `qa-7f1-d45-convergence` dropped were the only guard that the screen settles
// in `ru`. This file restores that subject on the rendered screen: an old link arriving in `ru` is
// refilled in millimetres and written back at most once. It also reads every piece of text and every
// labelling attribute Step 1 draws for a metre unit or a decimal comma, and pastes non-millimetre text
// into a field to prove it is kept, never stripped.
//
// The harness is `room-url-round-trip.dom.test.ts`'s: navigation mocked one layer below next-intl, and
// a `replace` double that applies the href it records, so a write the screen makes is a write it sees.
import { type AbstractIntlMessages, NextIntlClientProvider } from "next-intl";
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

import { URL_SETTLE_MS } from "@/room/room-query-sync";
import { RoomScreen } from "@/room/room-screen";
import {
  requiredFieldsFor,
  roomHrefFromDesignRoom,
} from "@/room/room-url-state";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

type Locale = "ro" | "ru";

const CATALOGUES: Readonly<Record<Locale, AbstractIntlMessages>> = {
  ro: roMessages,
  ru: ruMessages,
};

/** The unit each box prints, spelled here rather than read from the catalogue so a catalogue that
 *  regressed to *m* / *м* could not agree with itself. */
const MILLIMETRE_UNIT: Readonly<Record<Locale, string>> = {
  ro: "mm",
  ru: "мм",
};

const LOCALES: readonly Locale[] = ["ro", "ru"];

/** A standalone metre unit — *m* or *м* not part of a longer word (*mm*, *мм* pass). */
const STANDALONE_METRE_UNIT = /(?<![\p{L}])(?:m|м)(?![\p{L}])/u;

/** A decimal comma between two digits: the metre display S1b retired. */
const DECIMAL_COMMA = /\d,\d/;

/** The attributes a screen reader or a tooltip reads a control's text from. */
const LABELLING_ATTRIBUTES = [
  "aria-label",
  "aria-valuetext",
  "aria-description",
  "title",
  "placeholder",
  "alt",
] as const;

/** A complete L and a complete U, each written as an old link would carry it — the U with a comma, a
 *  bare integer and a trailing zero, the three spellings a pre-S1b link can hold. */
const AN_OLD_L_LINK = "shape=L&wallA=3.56&wallB=4.25&height=2.7&direction=left";
const AN_OLD_U_LINK =
  "shape=U&wallA=4&wallB=2,4&wallC=2.180&height=2.70&direction=right";

let container: HTMLDivElement;
let root: Root;
let locale: Locale = "ro";

function render(search: string, inLocale: Locale): void {
  locale = inLocale;
  browser.pathname = `/${inLocale}/configurator/room`;
  arriveAt(search);
}

function arriveAt(search: string): void {
  browser.search = new URLSearchParams(search).toString();
  window.history.replaceState(null, "", locationOf(browser.search));
  act(() => {
    root.render(theScreen());
  });
}

function theScreen(): ReactElement {
  return createElement(NextIntlClientProvider, {
    children: createElement(RoomScreen, {}),
    locale,
    messages: CATALOGUES[locale],
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

function settle(): void {
  act(() => {
    vi.advanceTimersByTime(URL_SETTLE_MS);
  });
}

function fieldFor(field: string): HTMLInputElement {
  const input = container.querySelector(`[data-testid="room-length-${field}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`the screen draws no ${field} input`);
  }
  return input;
}

/** A keystroke or a paste, as the browser delivers either: the control's value changes through the
 *  prototype's setter (React tracks the element's own), then an `input` event. */
function type(field: string, text: string): void {
  act(() => {
    const input = fieldFor(field);
    Reflect.set(HTMLInputElement.prototype, "value", text, input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fieldValues(fields: readonly string[]): readonly string[] {
  return fields.map((field) => fieldFor(field).value);
}

function roomSubstate(): string | null {
  return (
    container
      .querySelector("[data-room-substate]")
      ?.getAttribute("data-room-substate") ?? null
  );
}

/** Every string Step 1 shows or announces: text nodes, the labelling attributes, and the text of
 *  whatever an `aria-describedby` points at. Input values are excluded — they are what was typed. */
function everythingTheScreenSays(): readonly string[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    texts.push(node.textContent ?? "");
  }
  for (const element of container.querySelectorAll("*")) {
    for (const attribute of LABELLING_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value !== null) texts.push(value);
    }
  }
  return texts;
}

function metreResidueIn(texts: readonly string[]): readonly string[] {
  return texts.filter(
    (text) => STANDALONE_METRE_UNIT.test(text) || DECIMAL_COMMA.test(text),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  browser.push.mockClear();
  browser.replace.mockClear();
  browser.replace.mockImplementation((href: string) => {
    arriveAt(searchOf(href));
  });
  browser.search = "";
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

describe("an old link arriving in either locale refills millimetres and settles once", () => {
  it.each(LOCALES)(
    "refills a comma, a bare integer and a trailing zero as digits, in %s",
    (inLocale) => {
      render(AN_OLD_U_LINK, inLocale);

      // Every field reads, so the screen is past 1B; the U is a shape the policy refuses, so 1C.
      expect(roomSubstate()).toBe("1C");
      expect(fieldValues(requiredFieldsFor("U"))).toEqual([
        "4000",
        "2400",
        "2180",
        "2700",
      ]);
    },
  );

  it.each(LOCALES)(
    "canonicalises a non-canonical old link at most once and then writes nothing, in %s",
    (inLocale) => {
      // The subject of the two locale sweeps S1b removed from `qa-7f1-d45-convergence`: a refill the
      // wire could not read back would drop every field from the canonical query on the second pass,
      // and the screen would navigate once per settle interval for ever. The draft no longer takes a
      // locale, so the rendered screen in `ru` is where that can still be observed.
      render(AN_OLD_U_LINK, inLocale);

      settle();
      settle();
      settle();

      expect(browser.replace.mock.calls.length).toBeLessThanOrEqual(1);
      // No `direction`, though the old link carried one: a U has one hand (M7B U5 S1, Q-U4 (b)).
      expect(browser.search).toBe(
        "shape=U&wallA=4&wallB=2.4&wallC=2.18&height=2.7",
      );
      expect(fieldValues(requiredFieldsFor("U"))).toEqual([
        "4000",
        "2400",
        "2180",
        "2700",
      ]);
    },
  );

  it.each(LOCALES)(
    "never rewrites an already canonical link, in %s",
    (inLocale) => {
      render(AN_OLD_L_LINK, inLocale);

      settle();
      settle();

      expect(browser.replace).not.toHaveBeenCalled();
      expect(fieldValues(requiredFieldsFor("L"))).toEqual([
        "3560",
        "4250",
        "2700",
      ]);
    },
  );
});

describe("the editor's back link refills the stored room's millimetres in either locale (S1b-5)", () => {
  it.each(LOCALES)(
    "fills 3560 × 4250 × 2700 digit for digit, in %s",
    (inLocale) => {
      const href = roomHrefFromDesignRoom({
        shape: "L",
        widthMm: 3560,
        depthMm: 4250,
        heightMm: 2700,
      });

      render(searchOf(href), inLocale);

      expect(fieldValues(requiredFieldsFor("L"))).toEqual([
        "3560",
        "4250",
        "2700",
      ]);
    },
  );
});

describe("Step 1 shows no metre anywhere, in either locale (task 3)", () => {
  it.each(
    LOCALES.flatMap((inLocale) => [
      [inLocale, AN_OLD_L_LINK],
      [inLocale, AN_OLD_U_LINK],
      [inLocale, "shape=L&direction=left"],
    ]),
  )(
    "draws no metre unit and no decimal comma, in %s at %s",
    (inLocale, link) => {
      render(link, inLocale);

      const said = everythingTheScreenSays();

      expect(said.length).toBeGreaterThan(0);
      expect(metreResidueIn(said)).toEqual([]);
    },
  );

  it.each(LOCALES)(
    "prints the millimetre unit in every field's box, in %s",
    (inLocale) => {
      render(AN_OLD_U_LINK, inLocale);

      for (const field of requiredFieldsFor("U")) {
        expect(fieldFor(field).parentElement?.textContent).toBe(
          MILLIMETRE_UNIT[inLocale],
        );
      }
    },
  );

  it.each(LOCALES)(
    "gives every length input the numeric keypad and nothing that re-reads or truncates, in %s",
    (inLocale) => {
      render(AN_OLD_U_LINK, inLocale);

      for (const field of requiredFieldsFor("U")) {
        const input = fieldFor(field);
        expect(input.getAttribute("type")).toBe("text");
        expect(input.getAttribute("inputmode")).toBe("numeric");
        for (const attribute of [
          "pattern",
          "maxlength",
          "placeholder",
          "step",
        ]) {
          expect(input.hasAttribute(attribute)).toBe(false);
        }
      }
    },
  );
});

describe("a paste that is not whole millimetres stays exactly as pasted (task 4)", () => {
  it.each(["3 600", "3600 mm", "3,600"])(
    "keeps %j in the field and off the wire, after the write settles",
    (pasted) => {
      render(AN_OLD_L_LINK, "ro");

      type("wallA", pasted);
      settle();
      settle();

      expect(fieldFor("wallA").value).toBe(pasted);
      expect(new URLSearchParams(browser.search).has("wallA")).toBe(false);
      expect(roomSubstate()).toBe("1B");
    },
  );

  it.each(LOCALES)(
    "keeps a typed leading zero under the caret through its own echo, in %s",
    (inLocale) => {
      render(AN_OLD_L_LINK, inLocale);

      type("wallA", "03500");
      settle();

      expect(new URLSearchParams(browser.search).get("wallA")).toBe("3.5");
      expect(fieldFor("wallA").value).toBe("03500");
    },
  );
});
