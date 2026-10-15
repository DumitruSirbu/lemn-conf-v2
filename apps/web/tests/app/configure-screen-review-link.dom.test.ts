// @vitest-environment happy-dom
//
// *Verifică designul* is a link to this design's review, in the current locale, and only while there is a design
// to review. The editor is rendered to markup with its store stubbed, as `configure-room-navigation.test.ts` does.
//
// What this cannot see: a tap landing on it, its box at 390 px, and the navigation itself, which `Link` does.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const store = vi.hoisted(() => ({
  design: undefined as Design | undefined,
  designId: null as string | null,
}));

vi.mock("@/store/configurator-store", () => ({
  useConfiguratorStore: (selector: (state: unknown) => unknown) =>
    selector({ design: store.design, designId: store.designId }),
}));
vi.mock("@/app/configurator/configure/use-top-bar-fit", () => ({
  useTopBarFit: () => ({
    spacingMetrics: {},
    isWordmarkDrawn: true,
    pill: { settings: [] },
    visibleCount: 0,
    settingsTrackRef: { current: null },
    wordmarkProbeRef: { current: null },
    onPillMeasured: () => undefined,
  }),
}));
vi.mock("@/settings/global-settings-model", () => ({
  widestCounterFor: () => 0,
}));
vi.mock("@/scene/camera-preset-store", () => ({
  useCameraPreset: (selector: (state: unknown) => unknown) =>
    selector({ presetId: "overview", standAt: () => undefined }),
}));
vi.mock("@/panel/use-panel-view", () => ({
  usePanelView: () => ({ kind: "closed" }),
}));
vi.mock("@/app/configurator/configure/locale-menu", () => ({
  LocaleMenu: () => null,
}));
vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/price/price-bar", () => ({ PriceBar: () => null }));
vi.mock("@/price/price-breakdown", () => ({ PriceBreakdown: () => null }));
vi.mock("@/price/flagged-total-warning", () => ({
  FlaggedTotalWarning: () => null,
}));
vi.mock("@/scene/overflow-warning", () => ({ OverflowWarning: () => null }));
vi.mock("@/settings/global-settings", () => ({ GlobalSettings: () => null }));
vi.mock("@/settings/settings-pill-measurement", () => ({
  SettingsPillMeasurement: () => null,
}));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
}));

const { ConfigureScreen } = await import(
  "@/app/configurator/configure/configure-screen"
);

function markupIn(
  locale: "ro" | "ru",
  variant?: "owner" | "shared",
): HTMLElement {
  const page = document.createElement("div");
  page.innerHTML = renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      children: createElement(
        ConfigureScreen,
        variant === undefined ? {} : { variant },
      ),
      locale,
      messages: (locale === "ro"
        ? roMessages
        : ruMessages) as typeof roMessages,
      timeZone: "Europe/Chisinau",
    }),
  );
  return page;
}

describe("the editor's review link", () => {
  it.each(["ro", "ru"] as const)(
    "is a link to /%s/d/{id}/review, labelled as before",
    (locale) => {
      store.design = KITCHEN_L_DESIGN;
      store.designId = "design-under-edit";

      const link = markupIn(locale).querySelector('[data-testid="review-cta"]');

      expect(link?.tagName).toBe("A");
      expect(link?.getAttribute("href")).toBe(
        `/${locale}/d/design-under-edit/review`,
      );
      expect(link?.textContent).toBe(
        (locale === "ro" ? roMessages : ruMessages).configure.reviewCta,
      );
    },
  );

  it("is not offered a link while the design has no id, and keeps its label", () => {
    store.design = KITCHEN_L_DESIGN;
    store.designId = null;

    const cta = markupIn("ro").querySelector('[data-testid="review-cta"]');

    expect(cta?.tagName).toBe("SPAN");
    expect(cta?.getAttribute("href")).toBeNull();
    expect(cta?.textContent).toBe(roMessages.configure.reviewCta);
  });

  it("is not drawn in the share view", () => {
    store.design = KITCHEN_L_DESIGN;
    store.designId = "shared-view";

    expect(
      markupIn("ro", "shared").querySelector('[data-testid="review-cta"]'),
    ).toBeNull();
  });
});
