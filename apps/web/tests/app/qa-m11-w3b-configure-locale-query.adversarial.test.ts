import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";

// W3b adversarial QA: what `ConfigureScreen` hands its language menu. The owner and share variants hand it exactly what they
// handed it before the query existed (no query), so `/d/{id}` and `/s/{token}` draw the menu as they did (the menu's own
// test, `tests/i18n/locale-menu-query.dom.test.ts`, pins the href for no query); the staff view's query reaches it unchanged.

const store = vi.hoisted(() => ({ design: undefined as Design | undefined }));
const menu = vi.hoisted(() => ({ props: [] as unknown[] }));

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
  LocaleMenu: (props: unknown) => {
    menu.props.push(props);
    return null;
  },
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

beforeEach(() => {
  store.design = KITCHEN_L_DESIGN;
  menu.props = [];
});

function draw(props: Parameters<typeof ConfigureScreen>[0]): void {
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      children: createElement(ConfigureScreen, props),
      locale: "ro",
      messages: roMessages,
      timeZone: "Europe/Chisinau",
    }),
  );
}

describe("what the configure screen hands the language menu", () => {
  it.each([
    ["the owner variant", { variant: "owner" as const }],
    ["the owner variant by default", {}],
    ["the share variant", { variant: "shared" as const }],
  ])(
    "is no query for %s, so the menu draws its plain locale-free hrefs",
    (_, props) => {
      draw(props);

      expect(menu.props).toHaveLength(1);
      expect((menu.props[0] as { query?: unknown }).query).toBeUndefined();
    },
  );

  it.each(["owner", "shared"] as const)(
    "is the query it was given, unchanged, in the %s variant",
    (variant) => {
      draw({ variant, localeQuery: { version: "current" } });

      expect(menu.props).toEqual([{ query: { version: "current" } }]);
    },
  );

  it("hands an empty query on rather than dropping it, as a query that was given", () => {
    draw({ variant: "shared", localeQuery: {} });

    expect(menu.props).toEqual([{ query: {} }]);
  });
});
