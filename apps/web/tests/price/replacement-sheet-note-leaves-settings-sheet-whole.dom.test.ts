// @vitest-environment happy-dom
//
// The replacement sheet's note and its silence about a reset belong to the sheet that forces a replacement. The settings sheet
// is unaffected (ADR 0081 stays whole there): a voluntary material change that would discard a chosen colour still asks first,
// the colour is reset only on confirmation, and none of the replacement sheet's words or elements appear in it.
import { KITCHEN_L_DESIGN, paletteFinish } from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import { underSamplePriceBook } from "../support/sample-price-root";

const CHOSEN_COLOUR = paletteFinish("pal.antracit");
const NOTE = roMessages.replacementSheet.materialAndColoursUnavailable;

let host: HTMLDivElement;
let root: Root;
let hydrations = 0;

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  hydrations += 1;
  useConfiguratorStore.getState().hydrate({
    design: {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, finish: CHOSEN_COLOUR },
    },
    designId: `settings-sheet-unaffected-design-${String(hydrations)}`,
    revision: "1",
    canWrite: true,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(underSamplePriceBook(createElement(GlobalSettings)));
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

function pressTestId(testId: string): void {
  const control = host.querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  );
  if (control === null) throw new Error(`the sheet draws no ${testId}`);
  act(() => {
    control.click();
  });
}

function chooseAnotherMaterial(): void {
  pressTestId("global-settings-trigger");
  const other = host.querySelector<HTMLInputElement>(
    'input[type="radio"][name$="-material"]:not(:checked)',
  );
  if (other === null) throw new Error("the sheet offers no second material");
  act(() => {
    other.click();
  });
}

const drawsReplacementSheetWords = (): boolean =>
  host.textContent.includes(NOTE) ||
  host.querySelector('[data-testid^="replacement-"]') !== null;

describe("the settings sheet beside the replacement sheet's note", () => {
  it("draws none of the replacement sheet's note or elements while open, while asking, or after the reset", () => {
    chooseAnotherMaterial();
    expect(drawsReplacementSheetWords()).toBe(false);

    pressTestId("global-settings-apply");
    expect(
      host.querySelector('[data-testid="global-settings-confirm"]'),
    ).not.toBeNull();
    expect(drawsReplacementSheetWords()).toBe(false);

    pressTestId("global-settings-confirm");
    expect(drawsReplacementSheetWords()).toBe(false);
  });

  it("still asks before a material change that would discard the chosen colour, and keeps the colour until the customer confirms", () => {
    const materialBefore =
      useConfiguratorStore.getState().design.settings?.materialTierId;
    chooseAnotherMaterial();

    pressTestId("global-settings-apply");

    expect(
      host.querySelector('[data-testid="global-settings-confirm"]'),
    ).not.toBeNull();
    const { settings } = useConfiguratorStore.getState().design;
    expect(settings?.materialTierId).toBe(materialBefore);
    expect(settings?.finish).toEqual(CHOSEN_COLOUR);
  });
});
