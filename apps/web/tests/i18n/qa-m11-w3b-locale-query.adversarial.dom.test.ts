// @vitest-environment happy-dom
//
// W3b adversarial QA of the language menu's optional query (plan W3b-7, W3b-9): what it writes for the share and draft views is
// the locale-free path alone, character for character as before; what it writes with a query encodes it, adds nothing to a
// path that already ends the way a person's address does, and never lets a query member reach another path.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => browser.pathname,
}));

import {
  LocaleMenu,
  type LocaleMenuQuery,
} from "@/app/configurator/configure/locale-menu";
import { routing } from "@/i18n/routing";

import roMessages from "../../src/messages/ro.json";

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
});

function hrefsOf(
  pathname: string,
  props: { readonly query?: LocaleMenuQuery } | undefined,
): Map<string, string> {
  browser.pathname = pathname;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        children: createElement(LocaleMenu, props ?? {}),
      }),
    );
  });
  act(() => {
    container
      ?.querySelector<HTMLElement>('[data-testid="top-bar-locale"]')
      ?.click();
  });
  return new Map(
    routing.locales.map((locale) => [
      locale,
      container
        ?.querySelector(`[data-testid="top-bar-locale-option-${locale}"]`)
        ?.getAttribute("href") ?? "",
    ]),
  );
}

describe("the menu without a query, as the share and draft views draw it", () => {
  it.each([
    ["a share view", "/ro/s/AbC-123_xyz"],
    ["a draft", "/ro/d/abcdefghijklmnopqrstu"],
    ["a draft's review step", "/ro/d/abcdefghijklmnopqrstu/review"],
    ["a trailing slash", "/ro/s/AbC-123_xyz/"],
  ])("writes %s's locale-free path alone", (_, pathname) => {
    const hrefs = hrefsOf(pathname, undefined);
    const withUndefinedQuery = hrefsOf(pathname, {});

    for (const locale of routing.locales) {
      expect(hrefs.get(locale)).toBe(
        `/${locale}${pathname.replace(/^\/ro/, "").replace(/\/$/, "")}`,
      );
      expect(withUndefinedQuery.get(locale)).toBe(hrefs.get(locale));
    }
    for (const href of hrefs.values()) {
      expect(href).not.toContain("?");
    }
  });
});

describe("the menu with a query", () => {
  it("writes no question mark for a query that holds nothing", () => {
    const hrefs = hrefsOf("/ro/staff/kitchens/abc/3d", { query: {} });

    for (const locale of routing.locales) {
      expect(hrefs.get(locale)).toBe(`/${locale}/staff/kitchens/abc/3d`);
    }
  });

  it.each([
    ["an ampersand", "a&b=c", "a%26b%3Dc"],
    ["a hash", "a#b", "a%23b"],
    ["a space", "a b", "a+b"],
    [
      "a slash, which cannot leave the query",
      "../../account",
      "..%2F..%2Faccount",
    ],
    ["a percent", "100%", "100%25"],
  ])("encodes %s, so the value stays one query member", (_, value, encoded) => {
    const hrefs = hrefsOf("/ro/staff/kitchens/abc/3d", {
      query: { version: value },
    });

    for (const locale of routing.locales) {
      const href = hrefs.get(locale) ?? "";
      expect(href.split("?")[0]).toBe(`/${locale}/staff/kitchens/abc/3d`);
      expect(href).toBe(`/${locale}/staff/kitchens/abc/3d?version=${encoded}`);
      expect(new URL(href, "https://lemnaria.test").searchParams.size).toBe(1);
    }
  });

  it("keeps the staff path of the other language for each language the site serves", () => {
    const hrefs = hrefsOf("/ro/staff/kitchens/abc/3d", {
      query: { version: "sent" },
    });

    expect([...hrefs.values()].sort()).toEqual(
      routing.locales
        .map((locale) => `/${locale}/staff/kitchens/abc/3d?version=sent`)
        .sort(),
    );
  });
});
