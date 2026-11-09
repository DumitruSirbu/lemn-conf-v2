// @vitest-environment happy-dom
//
// ADR 0081 stays whole in the SETTINGS sheet (Q5b, ruling 1): a voluntary material change that would discard a chosen colour
// still asks first, can be declined without losing the colour, and says nothing after it. The forced-replacement sheet is
// the one place that announces after the fact (A-16): the same material change there asks nothing before it. The second
// half is pinned in `tests/price/qa-m10-q5b-sheet.adversarial.dom.test.ts`; this file holds the half that must not move.
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
const REVERTED_LEAD =
  roMessages.replacementSheet.colourReverted.split("{colour}")[0] ?? "";
const CONFIRM = '[data-testid="global-settings-confirm"]';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  useConfiguratorStore.getState().hydrate({
    design: {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, finish: CHOSEN_COLOUR },
    },
    designId: "adr0081-kept-design",
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

const storedMaterial = (): string | undefined =>
  useConfiguratorStore.getState().design.settings?.materialTierId;
const storedColour = () =>
  useConfiguratorStore.getState().design.settings?.finish;

describe("a voluntary material change in the settings sheet, with a colour chosen", () => {
  it("asks before it changes anything, and the design is still the customer's until they confirm", () => {
    const materialBefore = storedMaterial();
    chooseAnotherMaterial();

    pressTestId("global-settings-apply");

    expect(host.querySelector(CONFIRM)).not.toBeNull();
    expect(storedMaterial()).toBe(materialBefore);
    expect(storedColour()).toEqual(CHOSEN_COLOUR);
  });

  it("keeps the colour when the customer declines the question", () => {
    const materialBefore = storedMaterial();
    chooseAnotherMaterial();
    pressTestId("global-settings-apply");

    pressTestId("global-settings-confirm-back");

    expect(storedMaterial()).toBe(materialBefore);
    expect(storedColour()).toEqual(CHOSEN_COLOUR);
  });

  it("resets the colour only after the customer confirms, and then shows no 'the colour went back' line (the sheet closes without one)", () => {
    const materialBefore = storedMaterial();
    chooseAnotherMaterial();
    pressTestId("global-settings-apply");

    pressTestId("global-settings-confirm");

    expect(storedMaterial()).not.toBe(materialBefore);
    expect(storedColour()).not.toEqual(CHOSEN_COLOUR);
    expect(document.body.textContent).not.toContain(REVERTED_LEAD.trim());
    expect(
      document.querySelector('[data-testid="replacement-confirmation"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="replacement-sheet"]'),
    ).toBeNull();
  });
});
