import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";

const store = vi.hoisted(() => ({
  design: undefined as Design | undefined,
}));

vi.mock("@/store/configurator-store", () => ({
  useConfiguratorStore: (selector: (state: unknown) => unknown) =>
    selector({ design: store.design }),
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

describe("ConfigureScreen room navigation", () => {
  it.each([
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const)(
    "links both back controls to the canonical room URL in %s",
    (locale, messages) => {
      store.design = KITCHEN_L_DESIGN;

      const markup = renderToStaticMarkup(
        createElement(NextIntlClientProvider, {
          children: createElement(ConfigureScreen),
          locale,
          messages: messages as typeof roMessages,
          timeZone: "Europe/Chisinau",
        }),
      );
      const expectedHref = `/${locale}/configurator/room?shape=L&amp;wallA=3.56&amp;wallB=2.92&amp;height=2.6&amp;direction=left`;

      expect(markup.split(`href="${expectedHref}"`)).toHaveLength(3);
      expect(markup).toContain(`aria-label="${messages.configure.back}"`);
      expect(markup).toContain(`>${messages.configure.backAction}</a>`);
      expect(markup).toContain('data-testid="review-cta"');
      expect(markup).not.toContain('href="/configurator/configure"');
    },
  );
});
