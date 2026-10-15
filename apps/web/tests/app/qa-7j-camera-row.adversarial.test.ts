// @vitest-environment happy-dom
//
// **Adversarial QA for M7 wave 7J, criterion A12's [dom] arm — the editor's camera row.** The slice
// asserted `cameraPresetsForRoom`'s ids; this renders `ConfigureScreen` itself, so a row that went
// back to the constant `CAMERA_PRESETS` is caught, and attacks the stale store (`camera-preset-store`
// outlives a room edit): a straight design reached while the customer stood on *Perete B*.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import type { CameraPresetId } from "@lemnaria/three-adapter";
import { NextIntlClientProvider } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import roMessages from "../../src/messages/ro.json";

const store = vi.hoisted(() => ({
  design: undefined as Design | undefined,
  presetId: "overview" as CameraPresetId,
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
    selector({ presetId: store.presetId, standAt: () => undefined }),
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

const STRAIGHT_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  room: { shape: "linear", widthMm: 3700, depthMm: 3400, heightMm: 2600 },
};

const HOSTILE_RIGHT_STRAIGHT_DESIGN = {
  ...STRAIGHT_DESIGN,
  room: { ...STRAIGHT_DESIGN.room, cornerDirection: "right" },
} as Design;

interface PresetButton {
  readonly label: string;
  readonly isPressed: boolean;
}

function presetButtonsFor(
  design: Design,
  presetId: CameraPresetId,
): readonly PresetButton[] {
  store.design = design;
  store.presetId = presetId;
  const markup = renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      children: createElement(ConfigureScreen),
      locale: "ro",
      messages: roMessages,
      timeZone: "Europe/Chisinau",
    }),
  );
  const page = new DOMParser().parseFromString(markup, "text/html");
  const group = page.querySelector(
    `[role="group"][aria-label="${roMessages.configure.cameraGroupLabel}"]`,
  );
  if (group === null) throw new Error("the editor draws no camera row");
  return [...group.querySelectorAll("button")].map((button) => ({
    label: button.textContent,
    isPressed: button.getAttribute("aria-pressed") === "true",
  }));
}

const LABELS = roMessages.configure.cameraPresets;

describe("7J-A12 — the editor's camera row follows the room", () => {
  it("draws two buttons for a straight design — overview and wall A", () => {
    expect(
      presetButtonsFor(STRAIGHT_DESIGN, "overview").map((b) => b.label),
    ).toEqual([LABELS.overview, LABELS.wallA]);
  });

  it("draws three for an L", () => {
    expect(
      presetButtonsFor(KITCHEN_L_DESIGN, "overview").map((b) => b.label),
    ).toEqual([LABELS.overview, LABELS.wallA, LABELS.wallB]);
  });

  it("draws two for a straight design carrying a hostile cornerDirection: right", () => {
    expect(
      presetButtonsFor(HOSTILE_RIGHT_STRAIGHT_DESIGN, "overview").map(
        (b) => b.label,
      ),
    ).toEqual([LABELS.overview, LABELS.wallA]);
  });

  // The camera frames `overview` for a stale `wallB` (`scene-view.ts`'s fallback), so the row must
  // say so: a row with no button pressed tells the customer no preset is where the camera stands.
  it("presses the overview button — the view the camera actually frames — for a stale wallB", () => {
    expect(
      presetButtonsFor(STRAIGHT_DESIGN, "wallB").filter((b) => b.isPressed),
    ).toEqual([{ label: LABELS.overview, isPressed: true }]);
  });
});
