import {
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ContactPage from "../../src/app/[locale]/configurator/contact/page";
import { DesignLoadError } from "../../src/app/d/[id]/design-load-error";
import { StartLink } from "../../src/components/start-link";
import { getPathname, Link } from "../../src/i18n/navigation";
import roMessages from "../../src/messages/ro.json";

/** Depth-first search for the first element of `type` in a tree — `prefetch` is a prop `next/link`
 *  consumes client-side and never renders into markup, so the only way to pin it is to read the
 *  element the server component actually built, before `renderToStaticMarkup` throws that away. */
function findElement(node: ReactNode, type: unknown): ReactElement | undefined {
  if (!isValidElement(node)) return undefined;
  if (node.type === type) return node;
  const children = (node.props as { children?: ReactNode }).children;
  return Children.toArray(children)
    .map((child) => findElement(child, type))
    .find((found): found is ReactElement => found !== undefined);
}

/** `connection()` reads Next's request store and throws without one; the page's use of it is its own test's. */
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../src/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => null,
}));

function renderLocalized(locale: "ro" | "ru", children: ReactNode): string {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      children,
      locale,
      messages: roMessages,
      timeZone: "Europe/Chisinau",
    }),
  );
}

describe("locale-aware customer navigation", () => {
  it.each(["ro", "ru"] as const)(
    "prefixes logical paths with %s while preserving query values",
    (locale) => {
      expect(
        getPathname({
          locale,
          href: {
            pathname: "/configurator/contact",
            query: { intent: "callback", source: "shared design" },
          },
        }),
      ).toBe(
        `/${locale}/configurator/contact?intent=callback&source=shared+design`,
      );
    },
  );

  it.each(["ro", "ru"] as const)(
    "keeps the contact and load-error exits in the current %s locale",
    async (locale) => {
      const contact = renderLocalized(locale, await ContactPage());
      const loadError = renderLocalized(
        locale,
        createElement(DesignLoadError, { reason: "not-found" }),
      );

      expect(contact).toContain(`href="/${locale}"`);
      expect(loadError).toContain(`href="/${locale}/configurator/room"`);
    },
  );

  it("never prefetches the start link — a prefetch would run the resume route as a side effect (L1.7)", () => {
    const backLink = findElement(StartLink({}), Link);

    expect(backLink).toBeDefined();
    expect((backLink?.props as { href?: string }).href).toBe("/");
    expect((backLink?.props as { prefetch?: boolean }).prefetch).toBe(false);
  });
});
