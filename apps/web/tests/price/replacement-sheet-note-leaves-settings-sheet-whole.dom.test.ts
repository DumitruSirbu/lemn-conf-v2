// @vitest-environment happy-dom
//
// The replacement sheet's note belongs to the sheet that forces a replacement. The settings sheet draws none of its words or
// elements, and after a confirmed material change that resets a chosen colour nothing beside the trigger names the colour the
// reset chose. The question, the decline and the confirm themselves are pinned in
// `tests/settings/material-change-in-settings-still-asks-before-resetting-colour.dom.test.ts`.
import {
  KITCHEN_L_DESIGN,
  lookUpMaterial,
  paletteFinish,
} from "@lemnaria/configurator-domain";
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
import { ro } from "../support/romanian-content";
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

/** The names a reset line could say: the colour the new material returns the kitchen to, and a free colour's hex. */
function namesOfDefaultColourOf(tierId: string | undefined): readonly string[] {
  const lookup = lookUpMaterial(tierId ?? "");
  if (lookup.kind !== "declared")
    throw new Error(`${String(tierId)} is declared`);
  const { defaultFinish } = lookup.material;
  return defaultFinish.kind === "palette-entry"
    ? [ro.finishName(defaultFinish.entryId)]
    : [
        ro.globalSettings.pillColourValue(defaultFinish.value),
        defaultFinish.value,
      ];
}

/** Every line of text on the page outside the trigger, portals included, and the text of each live region. */
function linesBesideTheTrigger(): readonly string[] {
  const beside = document.body.cloneNode(true) as HTMLElement;
  beside.querySelector('[data-testid="global-settings-trigger"]')?.remove();
  const liveRegions = [
    ...document.querySelectorAll(
      '[role="status"], [role="alert"], [aria-live]',
    ),
  ].map((region) => region.textContent);
  return [beside.textContent, ...liveRegions];
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

  it("says nothing of the colour a confirmed material change reset, anywhere but the trigger that shows what is stored", () => {
    chooseAnotherMaterial();
    pressTestId("global-settings-apply");

    pressTestId("global-settings-confirm");

    const { settings } = useConfiguratorStore.getState().design;
    expect(settings?.finish).not.toEqual(CHOSEN_COLOUR);
    const namesOfResetColour = namesOfDefaultColourOf(settings?.materialTierId);
    for (const said of linesBesideTheTrigger()) {
      for (const name of namesOfResetColour) {
        expect(said).not.toContain(name);
      }
    }
  });
});
