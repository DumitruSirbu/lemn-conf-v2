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
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";

/** The screen, as `useBackgroundInert` walks it: a `<main>` whose children are bands. The settings
 *  control lives in one of them; the others stand in for the header, the stage and the price bar. */
const RESET_DESIGN_ID = "dom-test-design";
const RESET_REVISION = "1";

let screenElement: HTMLElement;
let settingsBand: HTMLDivElement;
let otherBands: readonly HTMLDivElement[];
let root: Root;

beforeEach(() => {
  // An applied choice is a save, and this store's save is a real request. Every request is held open and never
  // answered, and the stub is left standing for the file: a save the store schedules on a timer would otherwise
  // leave after the case that caused it and reach for a server.
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));

  // The store is a module singleton, so it is put back between cases through the store's **own load
  // path** rather than by writing two fields into it. `setState` merges shallowly: it would leave
  // `records`, `columns`, `voids`, `selection` and the write-access fields standing from the
  // previous case, so the first test that ran a command would hand the next one a fresh `design`
  // beside stale derivations — which is exactly the inheritance a reset exists to prevent, and it
  // would surface as a wrong render rather than as a failure pointing here. `hydrate` re-derives
  // the geometry from the document it is given (`deriveGeometry`), which is what a real load does.
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: RESET_DESIGN_ID,
    revision: RESET_REVISION,
    canWrite: true,
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

/** A hardware tier the sheet does not have checked, pressed. Hardware, because a material change asks a question
 *  first and a depth change needs a body probe this store was not given. Returns the tier now pending. */
function pressAnUncheckedHardwareTier(): string {
  const radio = settingsBand.querySelector<HTMLInputElement>(
    'input[type="radio"][name$="-hardware"]:not(:checked)',
  );
  if (!radio) throw new Error("the sheet offers no second hardware tier");
  act(() => {
    radio.click();
  });
  return radio.value;
}

function press(testId: string): void {
  const button = settingsBand.querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  );
  if (!button) throw new Error(`the sheet draws no ${testId}`);
  act(() => {
    button.click();
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

// The sheet's own cancel, pressed on the rendered sheet. `qa-w2-opening-choice.adversarial.test.ts` sweeps what a
// press sequence leaves *pending*; whether the cancel button then writes is a fact about this component's handler.
describe("leaving the sheet with a choice pending", () => {
  it("writes nothing to the document when the customer cancels", () => {
    const opened = useConfiguratorStore.getState().design;
    open();
    const pendingTier = pressAnUncheckedHardwareTier();

    press("global-settings-cancel");

    expect(pendingTier).not.toBe(opened.settings?.hardwareTierId);
    expect(surface()).toBeNull();
    // The same object, not an equal one: no command ran at all.
    expect(useConfiguratorStore.getState().design).toBe(opened);
  });

  it("writes that same choice when the customer applies it, so the cancel had something to drop", () => {
    open();
    const pendingTier = pressAnUncheckedHardwareTier();

    press("global-settings-apply");

    expect(surface()).toBeNull();
    expect(
      useConfiguratorStore.getState().design.settings?.hardwareTierId,
    ).toBe(pendingTier);
  });
});
