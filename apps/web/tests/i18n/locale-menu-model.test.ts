// The locale menu's decisions without a DOM around them: which languages it offers, what it names
// them, and where a key press moves focus.
//
// **The endonym half is the one that needs stating.** `Română` and `Русский` live in code rather than
// in the catalogues, and this file is where that is a claim rather than a convention: the name a
// language is offered under must not change with the language of the page, because the person looking
// for it cannot read that page. A leaf per locale in every catalogue would be N² identical strings and
// N² chances for a translator to translate a word that must not be translated.
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { resolveContent } from "@/i18n/content";
import { endonymOf } from "@/i18n/locale-endonyms";
import { describeLocaleMenu, focusIndexAfter } from "@/i18n/use-locale-menu";
import { routing } from "@/i18n/routing";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { CATALOGUES, catalogueLeaves } from "../support/catalogues";

const PATH = "/d/shared-kitchen";

describe("the choices the menu offers", () => {
  it("offers one per configured locale, in routing's own order", () => {
    const menu = describeLocaleMenu("ro", PATH);

    expect(menu.choices.map((choice) => choice.locale)).toEqual([
      ...routing.locales,
    ]);
  });

  it("hands every choice the same locale-free path, so a switch is not a move", () => {
    for (const locale of routing.locales) {
      const menu = describeLocaleMenu(locale, PATH);

      expect(menu.pathname).toBe(PATH);
      expect(menu.choices.map((choice) => choice.endonym)).toEqual(
        routing.locales.map((each) => endonymOf(each)),
      );
    }
  });

  it("marks exactly the locale being read, from every locale", () => {
    for (const locale of routing.locales) {
      const menu = describeLocaleMenu(locale, PATH);
      const marked = menu.choices.filter((choice) => choice.isCurrent);

      expect(marked.map((choice) => choice.locale)).toEqual([locale]);
      expect(menu.choices[menu.currentIndex]?.locale).toBe(locale);
    }
  });

  /** A locale the app does not ship — a stale cookie, a hand-typed prefix — must still leave the
   *  customer a usable menu rather than a control with nothing selected and focus nowhere. */
  it("opens at the first language when the current one is not one it offers", () => {
    const menu = describeLocaleMenu("de", PATH);

    expect(menu.currentIndex).toBe(0);
    expect(menu.choices.some((choice) => choice.isCurrent)).toBe(false);
  });
});

describe("the endonyms", () => {
  it("names every configured locale, and never twice with the same word", () => {
    const names = routing.locales.map((locale) => endonymOf(locale));

    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.trim()).not.toBe("");
  });

  // The claim that keeps them out of the catalogues: no leaf holds one, in either language. A leaf
  // that started to would be a translated language name waiting to happen.
  it.each(CATALOGUES)(
    "appears in no %s catalogue leaf",
    (_locale, messages) => {
      const names = routing.locales.map((locale) => endonymOf(locale));

      for (const [key, message] of catalogueLeaves(messages)) {
        for (const name of names) expect(message, key).not.toContain(name);
      }
    },
  );

  // And the resolved content — the only thing a component can reach — carries none of them either,
  // so the menu's words cannot have come from a translation.
  it("appears nowhere in the resolved Romanian content", () => {
    const content = resolveContent(
      createTranslator({ locale: "ro", messages: roMessages }),
    );
    const russian = resolveContent(
      createTranslator({ locale: "ru", messages: ruMessages }),
    );

    for (const locale of routing.locales) {
      expect(JSON.stringify(content)).not.toContain(endonymOf(locale));
      expect(JSON.stringify(russian)).not.toContain(endonymOf(locale));
    }
  });
});

describe("where a key press moves focus", () => {
  /** **Swept over the counts the ruling makes possible** rather than checked at the two that ship:
   *  the walk is arithmetic, so it is the same walk at two languages and at eight, and a neighbour
   *  hard-coded for a pair would pass a two-item check and strand the third item. */
  const COUNTS = [2, 3, 4, 5, 6, 7, 8];

  it.each(COUNTS)("walks all %i downwards and returns to the top", (count) => {
    const visited = [0];
    for (let step = 1; step <= count; step += 1) {
      const index = visited[visited.length - 1];
      if (index === undefined) throw new Error("no position to move from");
      const moved = focusIndexAfter("ArrowDown", { index, count });
      if (moved === undefined) throw new Error("ArrowDown is not a move");
      visited.push(moved);
    }

    expect(visited.slice(0, count)).toEqual([...Array(count).keys()]);
    expect(visited[count]).toBe(0);
  });

  it.each(COUNTS)("walks all %i upwards and returns to the bottom", (count) => {
    const visited = [count - 1];
    for (let step = 1; step <= count; step += 1) {
      const index = visited[visited.length - 1];
      if (index === undefined) throw new Error("no position to move from");
      const moved = focusIndexAfter("ArrowUp", { index, count });
      if (moved === undefined) throw new Error("ArrowUp is not a move");
      visited.push(moved);
    }

    expect(visited.slice(0, count)).toEqual([...Array(count).keys()].reverse());
    expect(visited[count]).toBe(count - 1);
  });

  it.each(COUNTS)("puts Home and End at the ends of %i", (count) => {
    for (let index = 0; index < count; index += 1) {
      expect(focusIndexAfter("Home", { index, count })).toBe(0);
      expect(focusIndexAfter("End", { index, count })).toBe(count - 1);
    }
  });

  /** Every other key is left alone, `Tab` above all: a move that swallowed it would trap focus in a
   *  menu the customer is trying to leave. */
  it.each(["Tab", "Escape", "Enter", " ", "a", "ArrowLeft", "PageDown"])(
    "leaves %s to the browser",
    (key) => {
      expect(focusIndexAfter(key, { index: 0, count: 3 })).toBeUndefined();
    },
  );
});
