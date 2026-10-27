// @vitest-environment happy-dom
//
// **M6-AUD-009: the focus behaviour that had no test outside Playwright.**
//
// `apps/web/vitest.config.ts` runs on `environment: "node"`, so every focus rule this surface
// states in prose — focus moves in when it opens, Escape closes it wherever focus has got to, focus
// returns to the control that opened it — was protected only by the browser suite. That is a real
// gate, but it runs on merge and on demand rather than on every change, and one of these rules has
// already shipped wrong once: the Escape listener was bound to the dialog, so it only heard a key
// pressed *inside* it, and focus leaves for two ordinary reasons.
//
// This file is the unit-level half. It declares its own DOM environment in the docblock above
// rather than moving the whole project onto one, so the 1,900 node tests keep running as they are.
//
// **The fourth block is M6-AUD-013's ruling, written as an assertion.** Neither shell draws a scrim
// since 2026-09-09 — the owner chose to remove the desktop dim rather than make the dialog modal —
// so `role="dialog"` with **no** `aria-modal` is now simply true on both, rather than the weaker of
// two answers that disagreed. Adding `aria-modal` here alone, or a focus trap alone, would make it
// false again in the other direction, so this fails if either half arrives without the scrim,
// containment and inertness that would have to come with it.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { PriceBreakdown } from "@/price/price-breakdown";
import { useConfiguratorStore } from "@/store/configurator-store";

import { underSamplePriceBook } from "../support/sample-price-root";

const RESET_DESIGN_ID = "dom-test-design";
const RESET_REVISION = "1";

let container: HTMLDivElement;
let root: Root;
/** A control outside the surface, standing in for the camera presets a Tab out lands on. */
let outsideControl: HTMLButtonElement;

beforeEach(() => {
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
  container = document.createElement("div");
  document.body.append(container);
  outsideControl = document.createElement("button");
  outsideControl.textContent = "camera preset";
  document.body.append(outsideControl);
  root = createRoot(container);
  act(() => {
    root.render(underSamplePriceBook(createElement(PriceBreakdown)));
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  outsideControl.remove();
});

function trigger(): HTMLButtonElement {
  const button = container.querySelector("button");
  if (!button) throw new Error("the breakdown rendered no trigger");
  return button;
}

function openSurface(): HTMLElement {
  act(() => {
    trigger().click();
  });
  const surface = container.querySelector('[role="dialog"]');
  if (!(surface instanceof HTMLElement))
    throw new Error("the breakdown opened no dialog");
  return surface;
}

function pressEscapeOnDocument(): void {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

describe("the price breakdown's focus, in a DOM", () => {
  it("renders a trigger and no dialog until it is asked for one", () => {
    // Non-vacuity for everything below: an unopened surface would satisfy "focus is not stranded"
    // trivially.
    expect(trigger().textContent).not.toBe("");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("moves focus into the surface when it opens", () => {
    const surface = openSurface();
    expect(document.activeElement).toBe(surface);
  });

  it("closes on Escape after focus has left it — the case that shipped wrong once", () => {
    openSurface();
    // Exactly the two ordinary ways focus leaves: a tap behind the sheet blurring to another
    // control, and a Tab out. Either way the key is heard on the document, not on the dialog.
    act(() => {
      outsideControl.focus();
    });
    expect(document.activeElement).toBe(outsideControl);

    pressEscapeOnDocument();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("returns focus to the control that opened it", () => {
    openSurface();
    pressEscapeOnDocument();
    expect(document.activeElement).toBe(trigger());
  });

  it("advertises the semantics both shells can honour, and no more", () => {
    const surface = openSurface();
    expect(surface.getAttribute("role")).toBe("dialog");
    // M6-AUD-013, resolved: no shell draws a scrim, so this dialog is non-modal in every input mode
    // and the absent attribute is the accurate one. It stays a surface decision — scrim, focus
    // containment, Escape, restoration and this attribute move together — not something added here.
    expect(surface.getAttribute("aria-modal")).toBeNull();
  });
});
