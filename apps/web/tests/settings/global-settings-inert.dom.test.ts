// @vitest-environment happy-dom
//
// **M6-AUD-009, second half: the part of "modal" a scrim cannot do.**
//
// The settings sheet is modal on both shells — scrim, `aria-modal`, a focus trap, and the rest of
// the screen marked `inert` while it is open. `useBackgroundInert` is what closes M6-AUD-013's
// asymmetry *on this surface*: a scrim stops a pointer, and `inert` is what stops a keyboard from
// reaching the same controls. Until this file it ran only in Playwright.
//
// The band structure is the fixture's own, not a copy of the app's: what is asserted is the rule —
// **every sibling band of the one holding this control goes inert, and that band does not** — so a
// later change to where the sheet mounts cannot pass here by having been transcribed.
import {
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/** The screen, as `useBackgroundInert` walks it: a `<main>` whose children are bands. The settings
 *  control lives in one of them; the others stand in for the header, the stage and the price bar. */
let screenElement: HTMLElement;
let settingsBand: HTMLDivElement;
let otherBands: readonly HTMLDivElement[];
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  useConfiguratorStore.setState({
    design: KITCHEN_L_DESIGN,
    catalog: buildKitchenLBodyCatalog(600),
  });

  screenElement = document.createElement("main");
  const before = document.createElement("div");
  settingsBand = document.createElement("div");
  const after = document.createElement("div");
  otherBands = [before, after];
  screenElement.append(before, settingsBand, after);
  document.body.append(screenElement);

  root = createRoot(settingsBand);
  act(() => {
    root.render(createElement(GlobalSettings));
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  screenElement.remove();
});

function trigger(): HTMLButtonElement {
  const button = settingsBand.querySelector<HTMLButtonElement>(
    '[data-testid="global-settings-trigger"]',
  );
  if (!button) throw new Error("the settings control rendered no trigger");
  return button;
}

function surface(): HTMLElement | null {
  return settingsBand.querySelector<HTMLElement>(
    '[data-testid="global-settings-surface"]',
  );
}

function open(): void {
  act(() => {
    trigger().click();
  });
}

function inertBands(): readonly string[] {
  return [...screenElement.children]
    .filter((band) => band.hasAttribute("inert"))
    .map((band) => (band === settingsBand ? "settings" : "other"));
}

describe("the settings sheet and the screen behind it", () => {
  it("starts closed with nothing inert, so the assertions below are not reading a fixture", () => {
    expect(surface()).toBeNull();
    expect(inertBands()).toEqual([]);
    expect(otherBands.length).toBe(2);
  });

  it("marks every band except its own inert while it is open", () => {
    open();
    expect(surface()).not.toBeNull();
    // Named by role rather than counted: "two bands are inert" would also hold if the wrong two
    // were.
    expect(inertBands()).toEqual(["other", "other"]);
    expect(settingsBand.hasAttribute("inert")).toBe(false);
  });

  it("claims the modal semantics it can actually honour, unlike the breakdown", () => {
    open();
    expect(surface()?.getAttribute("aria-modal")).toBe("true");
    expect(surface()?.getAttribute("role")).toBe("dialog");
  });

  it("gives the screen back when it closes", () => {
    open();
    expect(inertBands().length).toBe(2);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(surface()).toBeNull();
    expect(inertBands()).toEqual([]);
  });
});
