import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WebGLUnavailable } from "@/components/webgl-unavailable";
import ro from "@/messages/ro.json";
import ru from "@/messages/ru.json";

const getTranslations = vi.fn();
vi.mock("next-intl/server", () => ({ getTranslations }));

function renderClient(locale: "ro" | "ru", messages: typeof ro) {
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      children: createElement(WebGLUnavailable, {}),
      locale,
      messages,
      timeZone: "Europe/Chisinau",
    }),
  );
}

describe("webglUnavailable next-intl witness", () => {
  beforeEach(() => getTranslations.mockReset());

  it("renders the complete Romanian client namespace without key or empty leakage", () => {
    const markup = renderClient("ro", ro);
    for (const message of Object.values(ro.webglUnavailable)) {
      expect(markup).toContain(message);
    }
    expect(markup).not.toContain("webglUnavailable.");
    expect(markup).not.toContain(">undefined<");
    expect(markup).toContain('href="/ro/configurator/contact?intent=link"');
    expect(markup).toContain('href="/ro/configurator/contact?intent=callback"');
  });

  it("renders Russian independently from Romanian on the client", () => {
    const russian = renderClient("ru", ru as typeof ro);
    for (const message of Object.values(ru.webglUnavailable)) {
      expect(russian).toContain(message);
    }
    for (const romanianMessage of Object.values(ro.webglUnavailable)) {
      expect(russian).not.toContain(romanianMessage);
    }
    expect(russian).not.toContain("webglUnavailable.");
    expect(russian).not.toContain(">undefined<");
    expect(russian).toContain('href="/ru/configurator/contact?intent=link"');
    expect(russian).toContain(
      'href="/ru/configurator/contact?intent=callback"',
    );
  });

  it("resolves the server-provided witness value for each isolated locale", async () => {
    for (const messages of [ro, ru]) {
      getTranslations.mockResolvedValueOnce(
        (key: keyof typeof ro.webglUnavailable) =>
          messages.webglUnavailable[key],
      );
      const { default: ConfigurePage } = await import(
        "@/app/[locale]/configurator/configure/page"
      );
      const page = (await ConfigurePage()) as ReactElement<{
        webglUnavailableTitleMobile: string;
      }>;
      expect(page.props.webglUnavailableTitleMobile).toBe(
        messages.webglUnavailable.titleMobile,
      );
    }
    expect(getTranslations).toHaveBeenNthCalledWith(1, "webglUnavailable");
    expect(getTranslations).toHaveBeenNthCalledWith(2, "webglUnavailable");
  });
});
