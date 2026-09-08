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
// **The fourth block is M6-AUD-013's constraint, written as an assertion.** The desktop shell draws
// a scrim and the mobile one does not, and §10.1 forbids branching that in React — so the dialog
// advertises the honest, weaker semantics: `role="dialog"` with **no** `aria-modal`. Adding
// `aria-modal` alone, or a focus trap alone, would leave another input mode disagreeing. This fails
// if someone adds either half without the surface decision that has to come first.
import {
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
} from "@lemnaria/configurator-domain";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PriceBreakdown } from "@/price/price-breakdown";
import { useConfiguratorStore } from "@/store/configurator-store";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;
/** A control outside the surface, standing in for the camera presets a Tab out lands on. */
let outsideControl: HTMLButtonElement;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // The store is a module singleton seeded with the shipped kitchen; put it back between cases so
  // no test can inherit another's design.
  useConfiguratorStore.setState({
    design: KITCHEN_L_DESIGN,
    catalog: buildKitchenLBodyCatalog(600),
  });
  container = document.createElement("div");
  document.body.append(container);
  outsideControl = document.createElement("button");
  outsideControl.textContent = "camera preset";
  document.body.append(outsideControl);
  root = createRoot(container);
  act(() => {
    root.render(createElement(PriceBreakdown));
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
    // M6-AUD-013: not a nit. `aria-modal="true"` would be false on the shell that draws no scrim,
    // and true-but-untrapped on the one that does. Whichever way that is resolved, it is resolved
    // as one surface decision — scrim, focus containment, Escape, restoration and this attribute
    // moving together — not by adding this attribute here.
    expect(surface.getAttribute("aria-modal")).toBeNull();
  });
});
