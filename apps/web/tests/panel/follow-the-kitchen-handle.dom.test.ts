// @vitest-environment happy-dom
//
// The handle's way back to the kitchen's, on the mounted panel over the real store: the row is pressed while the
// cabinet has no handle of its own, names the handle the kitchen uses for it, and a press writes `clearHandle`.
import {
  KITCHEN_L_DESIGN,
  type Design,
  type Handle,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { EditorPanel } from "@/panel/editor-panel";
import { usePanelView } from "@/panel/use-panel-view";
import { useConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { ro } from "../support/romanian-content";

const BASE_CABINET_ID = "p0";
const TOP_ROW_CABINET_ID = "p15";
const NO_HANDLE_BODY_ID = "p25";

/** The store takes back an unsaved edit it holds for the same design id and revision, so each open gets an id of its
 *  own. */
let openings = 0;
let container: HTMLDivElement;
let root: Root;

function PanelAsTheScreenMountsIt() {
  return createElement(EditorPanel, { view: usePanelView() });
}

function withSettings(settings: Partial<Design["settings"]>): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, ...settings },
  };
}

function openThePanelOn(design: Design, selectedId: string): void {
  openings += 1;
  useConfiguratorStore.getState().hydrate({
    design,
    designId: `follow-handle-${String(openings)}`,
    revision: "1",
    canWrite: true,
  });
  useConfiguratorStore.getState().attachBodyProbe(createFakeProbeFactory());
  useConfiguratorStore.getState().select({ kind: "placement", id: selectedId });
  act(() => {
    root.render(createElement(PanelAsTheScreenMountsIt));
  });
}

function elementAt(testId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (element === null) throw new Error(`the panel draws no ${testId}`);
  return element;
}

function press(testId: string): void {
  act(() => {
    elementAt(testId).click();
  });
}

function ownHandleOf(placementId: string): Handle | undefined {
  return useConfiguratorStore
    .getState()
    .design.placements.find((placement) => placement.id === placementId)?.body
    .handle;
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("the handle control's row for following the kitchen", () => {
  it("is pressed on a cabinet that chose no handle, and says so in the colour control's words", () => {
    openThePanelOn(KITCHEN_L_DESIGN, BASE_CABINET_ID);

    const row = elementAt("handle-follow-kitchen");

    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(row.textContent).toContain(ro.panel.handleFollowsKitchen);
  });

  it.each(["steel", "black", "push"] as const)(
    "names the kitchen's %s on a cabinet below the top row",
    (kitchenHandle) => {
      openThePanelOn(withSettings({ handle: kitchenHandle }), BASE_CABINET_ID);

      expect(elementAt("handle-follow-kitchen").textContent).toContain(
        ro.panel.handleLabels[kitchenHandle],
      );
    },
  );

  it("names the kitchen's top-row handle, not its base handle, on a top-row cabinet", () => {
    openThePanelOn(
      withSettings({ handle: "black", topRowHandle: "steel" }),
      TOP_ROW_CABINET_ID,
    );

    expect(elementAt("handle-follow-kitchen").textContent).toContain(
      ro.panel.handleLabels.steel,
    );
  });

  it("gives the cabinet a handle of its own on a chip press and takes it back on this row's", () => {
    openThePanelOn(withSettings({ handle: "steel" }), BASE_CABINET_ID);

    press("handle-black");
    const wearingItsOwn = ownHandleOf(BASE_CABINET_ID);
    const pressedWhileOwn = elementAt("handle-follow-kitchen").getAttribute(
      "aria-pressed",
    );
    press("handle-follow-kitchen");

    expect(wearingItsOwn).toBe("black");
    expect(pressedWhileOwn).toBe("false");
    expect(ownHandleOf(BASE_CABINET_ID)).toBeUndefined();
    expect(
      useConfiguratorStore.getState().design.placements[0]?.body,
    ).not.toHaveProperty("handle");
    expect(
      elementAt("handle-follow-kitchen").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("presses the follow row alone while the cabinet follows the kitchen, and again once the row is pressed", () => {
    openThePanelOn(withSettings({ handle: "push" }), BASE_CABINET_ID);
    const pressedChips = () =>
      ["steel", "black", "push"].filter(
        (handle) =>
          elementAt(`handle-${handle}`).getAttribute("aria-pressed") === "true",
      );
    const whileFollowing = pressedChips();
    press("handle-black");

    press("handle-follow-kitchen");

    expect(whileFollowing).toEqual([]);
    expect(pressedChips()).toEqual([]);
    expect(
      elementAt("handle-follow-kitchen").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("pins the cabinet when the chip matching the kitchen's handle is pressed, and the screen shows it", () => {
    openThePanelOn(withSettings({ handle: "push" }), BASE_CABINET_ID);

    press("handle-push");

    expect(ownHandleOf(BASE_CABINET_ID)).toBe("push");
    expect(elementAt("handle-push").getAttribute("aria-pressed")).toBe("true");
    expect(
      elementAt("handle-follow-kitchen").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("is not drawn for a body that takes no handle, as its chips are not", () => {
    openThePanelOn(KITCHEN_L_DESIGN, NO_HANDLE_BODY_ID);

    expect(
      container.querySelector('[data-testid="section-handle"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="handle-follow-kitchen"]'),
    ).toBeNull();
  });
});
