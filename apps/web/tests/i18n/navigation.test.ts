import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ContactPage from "../../src/app/[locale]/configurator/contact/page";
import { DesignLoadError } from "../../src/app/d/[id]/design-load-error";
import { getPathname } from "../../src/i18n/navigation";
import roMessages from "../../src/messages/ro.json";

const getTranslations = vi.hoisted(() => vi.fn());
vi.mock("next-intl/server", () => ({ getTranslations }));

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
      getTranslations.mockResolvedValueOnce(
        createTranslator({ locale, messages: roMessages }),
      );
      const contact = renderLocalized(locale, await ContactPage());
      const loadError = renderLocalized(
        locale,
        createElement(DesignLoadError, { reason: "not-found" }),
      );

      expect(contact).toContain(`href="/${locale}"`);
      expect(loadError).toContain(`href="/${locale}/configurator/room"`);
    },
  );
});
