// @vitest-environment happy-dom
//
// The language menu's hrefs: the locale-free path alone by default (the share and draft views), and the path with the
// query the staff 3D view hands it, so a language switch keeps the copy the link named.
import { NextIntlClientProvider } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({ pathname: "/ro/staff/kitchens/abc/3d" }));

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

function openMenu(query?: LocaleMenuQuery): Map<string, string> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(NextIntlClientProvider, {
        locale: "ro",
        messages: roMessages,
        children: createElement(LocaleMenu, { query }),
      }),
    );
  });
  const trigger = container.querySelector<HTMLElement>(
    '[data-testid="top-bar-locale"]',
  );
  act(() => {
    trigger?.click();
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

describe("the language menu's links", () => {
  it("keeps the query it is handed, in every language", () => {
    browser.pathname = "/ro/staff/kitchens/abc/3d";
    const hrefs = openMenu({ version: "current" });

    for (const locale of routing.locales) {
      expect(hrefs.get(locale)).toBe(
        `/${locale}/staff/kitchens/abc/3d?version=current`,
      );
    }
  });

  it("is the locale-free path alone when it is handed no query, as the share and draft views draw it", () => {
    browser.pathname = "/ro/s/some-token";

    const hrefs = openMenu();

    for (const locale of routing.locales) {
      expect(hrefs.get(locale)).toBe(`/${locale}/s/some-token`);
    }
  });
});
