import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";

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

/** Criterion 12: the share view must render no route out of the session it has no credential for.
 *  `configure-room-navigation.test.ts` asserts the same markup carries all three for the default,
 *  owner variant — this is its `variant="shared"` counterpart. */
describe("ConfigureScreen shared variant", () => {
  it("renders neither Step 1 link nor the review CTA", () => {
    store.design = KITCHEN_L_DESIGN;

    const markup = renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        children: createElement(ConfigureScreen, { variant: "shared" }),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );

    expect(markup).not.toContain('data-testid="top-bar-back"');
    expect(markup).not.toContain('data-testid="bottom-bar-back"');
    expect(markup).not.toContain('data-testid="review-cta"');
  });

  it("keeps rendering all three for the default owner variant", () => {
    store.design = KITCHEN_L_DESIGN;

    const markup = renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        children: createElement(ConfigureScreen),
        locale: "ro",
        messages: roMessages,
        timeZone: "Europe/Chisinau",
      }),
    );

    expect(markup).toContain('data-testid="top-bar-back"');
    expect(markup).toContain('data-testid="bottom-bar-back"');
    expect(markup).toContain('data-testid="review-cta"');
  });
});
