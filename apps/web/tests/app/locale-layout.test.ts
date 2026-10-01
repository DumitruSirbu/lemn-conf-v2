import { existsSync } from "node:fs";

import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LocaleLayout, {
  generateMetadata,
  generateStaticParams,
} from "../../src/app/[locale]/layout";
import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const getTranslations = vi.hoisted(() => vi.fn());

vi.mock("next-intl/server", () => ({ getTranslations }));

const appDirectory = new URL("../../src/app/", import.meta.url);

describe("localized route tree", () => {
  it("owns only the five customer entrypoints beneath [locale]", () => {
    // The first two are Route Handlers, not pages, since M7 wave 7E3a S3 (D5): resume needs to set
    // and clear a cookie, which a Server Component cannot do (G6). Still exactly five entrypoints,
    // still one per customer route.
    const localizedEntrypoints = [
      "[locale]/route.ts",
      "[locale]/configurator/configure/route.ts",
      "[locale]/configurator/contact/page.tsx",
      "[locale]/configurator/room/page.tsx",
      "[locale]/d/[id]/page.tsx",
    ];
    const legacyEntrypoints = [
      "page.tsx",
      "configurator/configure/page.tsx",
      "configurator/contact/page.tsx",
      "configurator/room/page.tsx",
      "d/[id]/page.tsx",
    ];

    expect(
      localizedEntrypoints.every((path) =>
        existsSync(new URL(path, appDirectory)),
      ),
    ).toBe(true);
    expect(
      legacyEntrypoints.every(
        (path) => !existsSync(new URL(path, appDirectory)),
      ),
    ).toBe(true);
    expect(existsSync(new URL("api/designs/route.ts", appDirectory))).toBe(
      true,
    );
    expect(
      existsSync(new URL("internal/scene-shot/page.tsx", appDirectory)),
    ).toBe(true);
  });

  it("leaves configure and shared-design support at stable alias paths", () => {
    expect(
      existsSync(
        new URL("configurator/configure/configure-screen.tsx", appDirectory),
      ),
    ).toBe(true);
    expect(
      existsSync(new URL("d/[id]/hydrate-and-configure.tsx", appDirectory)),
    ).toBe(true);
  });
});

describe("localized root layout", () => {
  beforeEach(() => {
    getTranslations.mockImplementation(({ locale }: { locale: "ro" | "ru" }) =>
      Promise.resolve(
        createTranslator({
          locale,
          messages:
            locale === "ro" ? roMessages : (ruMessages as typeof roMessages),
        }),
      ),
    );
  });

  it("prerenders exactly the supported locale roots", () => {
    expect(generateStaticParams()).toEqual([
      { locale: "ro" },
      { locale: "ru" },
    ]);
  });

  it.each(["ro", "ru"] as const)(
    "renders the validated %s locale as the document language",
    async (locale) => {
      const layout = await LocaleLayout({
        children: "child",
        params: Promise.resolve({ locale }),
      });

      expect(layout).toMatchObject({ type: "html", props: { lang: locale } });
    },
  );

  it("refuses an unsupported locale at the layout boundary", async () => {
    await expect(
      LocaleLayout({
        children: "child",
        params: Promise.resolve({ locale: "en" }),
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it.each([
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const)(
    "generates localized %s metadata from message keys",
    async (locale, messages) => {
      const translate = createTranslator({
        locale,
        messages: messages as typeof roMessages,
      });
      const brand = translate("brand");

      await expect(
        generateMetadata({ params: Promise.resolve({ locale }) }),
      ).resolves.toEqual({
        title: translate("meta.title", { brand }),
        description: translate("meta.description"),
      });
    },
  );

  it("refuses unsupported metadata instead of falling back", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "en" }) }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
