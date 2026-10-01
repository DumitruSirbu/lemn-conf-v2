import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { WebGLUnavailable } from "@/components/webgl-unavailable";
import ro from "@/messages/ro.json";
import ru from "@/messages/ru.json";

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

  // Test 3, "resolves the server-provided witness value for each isolated locale", removed here
  // rather than in S4 as the plan's D7 originally scheduled: M7 wave 7E3a S3 deletes
  // `[locale]/configurator/configure/page.tsx` (replaced by a Route Handler that never renders
  // `ConfigureScreen`), which was this test's only subject, so the deletion could not wait. Tests
  // 1-2 above and `webgl-unavailable-i18n` (both, on `/d/{id}`) keep the client path witnessed.
});
