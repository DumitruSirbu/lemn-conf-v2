// @vitest-environment happy-dom
//
// The panel as the screen mounts it: the real `usePanelView` feeding the real `EditorPanel`, over the
// real store.
//
// `panel-store-seam.qa.test.ts` projects the panel through a mirror of the hook, which re-derives what
// the hook is supposed to pass, and `follow-the-kitchen-colour.test.ts` reads the component's source for
// the action a press reaches. Neither runs the hook or presses the button. Both are done here, so what
// the hook hands `describePanel` and which store action a press calls are seen on the mounted panel.
import {
  KITCHEN_L_DESIGN,
  type Design,
  type DesignId,
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

const SELECTED_ID = "p0";

let container: HTMLDivElement;
let root: Root;

/** What `ConfigureScreen` does with the two: asks the hook, hands the answer to the panel. */
function PanelAsTheScreenMountsIt() {
  return createElement(EditorPanel, { view: usePanelView() });
}

function openThePanelOn(design: Design): void {
  useConfiguratorStore.getState().hydrate({
    design,
    designId: "panel-wiring" as DesignId,
    revision: "1",
    canWrite: true,
  });
  useConfiguratorStore.getState().attachBodyProbe(createFakeProbeFactory());
  useConfiguratorStore
    .getState()
    .select({ kind: "placement", id: SELECTED_ID });
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

function press(element: HTMLElement): void {
  act(() => {
    element.click();
  });
}

function finishOfTheSelectedBody(): unknown {
  return useConfiguratorStore
    .getState()
    .design.placements.find((placement) => placement.id === SELECTED_ID)?.body
    .finish;
}

beforeEach(() => {
  // A pressed colour is a save, and this store's save is a real request: held open, never answered.
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

describe("what the mounted panel is handed by its hook", () => {
  it("reads the reflected width note on a right-hand room, and the plain one on a left-hand room", () => {
    openThePanelOn({
      ...KITCHEN_L_DESIGN,
      room: { ...KITCHEN_L_DESIGN.room, cornerDirection: "right" },
    });
    const onTheRightHandRoom = elementAt("section-width").textContent;

    openThePanelOn({
      ...KITCHEN_L_DESIGN,
      room: { ...KITCHEN_L_DESIGN.room, cornerDirection: "left" },
    });
    const onTheLeftHandRoom = elementAt("section-width").textContent;

    expect(ro.panel.widthStepNoteRight).not.toBe(ro.panel.widthStepNote);
    expect(onTheRightHandRoom).toContain(ro.panel.widthStepNoteRight);
    expect(onTheLeftHandRoom).toContain(ro.panel.widthStepNote);
    expect(onTheLeftHandRoom).not.toContain(ro.panel.widthStepNoteRight);
  });
});

describe("what a press on the mounted panel writes", () => {
  it("gives the cabinet a colour of its own, and takes it back when the kitchen's is followed again", () => {
    openThePanelOn(KITCHEN_L_DESIGN);
    const followingTheKitchen = finishOfTheSelectedBody();
    const anotherColour = container.querySelector<HTMLButtonElement>(
      '[data-testid="colour-options"] button[aria-pressed="false"]',
    );
    if (anotherColour === null) throw new Error("the panel offers one colour");

    press(anotherColour);
    const wearingItsOwn = finishOfTheSelectedBody();
    press(elementAt("finish-follow-kitchen"));

    expect(wearingItsOwn).not.toEqual(followingTheKitchen);
    expect(finishOfTheSelectedBody()).toEqual(followingTheKitchen);
  });
});
