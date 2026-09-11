import { readFileSync } from "node:fs";

import { createTranslator, useTranslations } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createI18nRequestConfig } from "../../src/i18n/request";
import { routing } from "../../src/i18n/routing";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { isRomanianCopyApproved } from "../support/approved-romanian-messages";

const getRootLocale = vi.hoisted(() => vi.fn());

vi.mock("next/root-params", () => ({ locale: getRootLocale }));

const translator = createTranslator({ locale: "ro", messages: roMessages });

// This function is intentionally never called: `tsc` checks both assertions, and the
// `@ts-expect-error` becomes an error itself if next-intl stops requiring the ICU arguments.
function assertTypedIcuArguments(): void {
  translator("configure.step", { step: 2, totalSteps: 4 });
  translator("priceBreakdown.wholeKitchenCategories.accessory");
  // @ts-expect-error configure.step requires both ICU number arguments.
  translator("configure.step");
}
void assertTypedIcuArguments;

// This function is intentionally never called: it checks the application-wide declaration used by
// component APIs, rather than relying only on createTranslator's locally inferred message type.
function assertGeneratedApplicationKeys(): void {
  const translate = useTranslations("webglUnavailable");
  translate("titleMobile");
  // @ts-expect-error the generated Romanian declaration must reject an unknown namespace leaf.
  translate("noSuchKey");
}
void assertGeneratedApplicationKeys;

describe("i18n routing", () => {
  it("declares only the two supported locales with an always-on prefix", () => {
    expect(routing.locales).toEqual(["ro", "ru"]);
    expect(routing.defaultLocale).toBe("ro");
    expect(routing.localePrefix).toBe("always");
    expect(routing.localeCookie).toEqual({
      name: "NEXT_LOCALE",
      sameSite: "lax",
    });
  });
});

describe("generated message declaration", () => {
  it("is byte-for-byte structurally fresh against the Romanian source catalogue", () => {
    // The copy lock is the sole first failure for an unapproved wording edit. Once its one literal
    // corpus is consciously updated, this freshness gate resumes and requires regeneration.
    if (!isRomanianCopyApproved(roMessages)) return;

    const declaration = readFileSync(
      new URL("../../src/messages/ro.d.json.ts", import.meta.url),
      "utf8",
    );
    const prefix = "declare const messages: ";
    const suffix = ";\nexport default messages;";
    const generatedStart = declaration.indexOf(prefix);
    expect(generatedStart).toBeGreaterThanOrEqual(0);
    expect(declaration.endsWith(suffix)).toBe(true);

    const generatedMessages: unknown = JSON.parse(
      declaration.slice(generatedStart + prefix.length, -suffix.length),
    );
    expect(generatedMessages).toEqual(roMessages);
  });
});

describe("request-scoped messages", () => {
  beforeEach(() => {
    getRootLocale.mockReset();
    getRootLocale.mockResolvedValue("ro");
  });

  it("loads the root locale when no explicit server override exists", async () => {
    const config = await createI18nRequestConfig(undefined);

    expect(config.locale).toBe("ro");
    expect(config.messages).toEqual(roMessages);
    expect(getRootLocale).toHaveBeenCalledOnce();
  });

  it("prefers a validated explicit locale without consulting root params", async () => {
    const config = await createI18nRequestConfig("ru");

    expect(config.locale).toBe("ru");
    expect(config.messages).toEqual(ruMessages);
    expect(getRootLocale).not.toHaveBeenCalled();
  });

  it("rejects an unsupported explicit locale instead of silently serving Romanian", async () => {
    await expect(createI18nRequestConfig("en")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(getRootLocale).not.toHaveBeenCalled();
  });

  it("rejects an unsupported root locale instead of silently serving Romanian", async () => {
    getRootLocale.mockResolvedValue("en");

    await expect(createI18nRequestConfig(undefined)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  it("rejects a missing root locale rather than inventing a locale", async () => {
    getRootLocale.mockResolvedValue(undefined);

    await expect(createI18nRequestConfig(undefined)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
