// @vitest-environment happy-dom
//
// `?select=` and `?settings=open`, honoured once on arrival (M8 8D S4). The hook is driven alone, against the real
// store and history, with `useSearchParams` answering what the URL says.
//
// What this cannot see: Next's own router syncing `useSearchParams` after `replaceState`, and the settings sheet
// opening. The trigger here is a stub whose click is counted; that the click opens the real sheet is the browser's.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { act, createElement, useRef, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const url = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useSearchParams: () => new URLSearchParams(url.search),
}));

import { useHonourArrival } from "@/app/configurator/configure/configure-screen";
import { useConfiguratorStore } from "@/store/configurator-store";

const OWN_BODY = KITCHEN_L_DESIGN.placements[1]?.id ?? "";
const GUARD_STATE = { lemnariaBackGuard: true };

let container: HTMLDivElement;
let root: Root;
let trigger: HTMLButtonElement | null;
const triggerClicks = vi.fn();

function Probe({ isOwner = true }: { isOwner?: boolean }): ReactElement {
  const settingsTrackRef = useRef<HTMLDivElement>(null);
  useHonourArrival({ isOwner, settingsTrackRef });
  return createElement(
    "div",
    { ref: settingsTrackRef },
    createElement("button", {
      "data-testid": "global-settings-trigger",
      ref: (element: HTMLButtonElement | null) => {
        trigger = element;
      },
      onClick: triggerClicks,
    }),
  );
}

function render(element: ReactElement): void {
  act(() => {
    root.render(element);
  });
}

function arriveAt(pathWithSearch: string, state: unknown = null): void {
  window.history.replaceState(state, "", pathWithSearch);
  url.search = new URL(window.location.href).search;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  triggerClicks.mockClear();
  trigger = null;
  useConfiguratorStore.getState().hydrate({
    design: KITCHEN_L_DESIGN,
    designId: "design-under-edit",
    revision: "1",
    canWrite: true,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("?select=", () => {
  it("selects the body it names, and takes the parameter off the URL", () => {
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}`);

    render(createElement(Probe));

    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: OWN_BODY,
    });
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/ro/d/design-under-edit");
  });

  it("selects nothing and breaks nothing for a body the design does not hold", () => {
    arriveAt("/ro/d/design-under-edit?select=no-such-body");

    render(createElement(Probe));

    expect(useConfiguratorStore.getState().selection).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("is acted on once: a later re-render with the URL as it was does not select again", () => {
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}`);
    render(createElement(Probe));
    act(() => {
      useConfiguratorStore.getState().deselect();
    });

    render(createElement(Probe));
    render(createElement(Probe));

    expect(useConfiguratorStore.getState().selection).toBeNull();
  });

  it("finds nothing to repeat in the entry it stripped, however the screen is mounted again", () => {
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}`);
    render(createElement(Probe));
    act(() => {
      useConfiguratorStore.getState().deselect();
    });
    act(() => {
      root.unmount();
    });
    url.search = new URL(window.location.href).search;
    root = createRoot(container);

    render(createElement(Probe));

    expect(useConfiguratorStore.getState().selection).toBeNull();
  });
});

describe("?settings=open", () => {
  it("presses the settings trigger once, and takes the parameter off the URL", () => {
    arriveAt("/ro/d/design-under-edit?settings=open");

    render(createElement(Probe));
    render(createElement(Probe));

    expect(trigger).not.toBeNull();
    expect(triggerClicks).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
  });

  it("does nothing for any other value", () => {
    arriveAt("/ro/d/design-under-edit?settings=closed");

    render(createElement(Probe));

    expect(triggerClicks).not.toHaveBeenCalled();
  });

  it("does both, from one URL, and leaves other parameters alone", () => {
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}&settings=open&utm=a`);

    render(createElement(Probe));

    expect(useConfiguratorStore.getState().selection).not.toBeNull();
    expect(triggerClicks).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?utm=a");
  });
});

describe("the history it leaves", () => {
  it("replaces the entry it stands on, keeping its state, and adds none", () => {
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}`, GUARD_STATE);
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    const lengthBefore = window.history.length;

    render(createElement(Probe));

    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.history.length).toBe(lengthBefore);
    expect(window.history.state).toEqual(GUARD_STATE);
  });

  it("touches nothing when the URL asks for nothing", () => {
    arriveAt("/ro/d/design-under-edit");
    const replace = vi.spyOn(window.history, "replaceState");

    render(createElement(Probe));

    expect(replace).not.toHaveBeenCalled();
    expect(useConfiguratorStore.getState().selection).toBeNull();
  });
});

describe("outside the owner's editor", () => {
  it("acts on nothing and leaves the URL alone", () => {
    arriveAt(`/ro/s/token?select=${OWN_BODY}&settings=open`);

    render(createElement(Probe, { isOwner: false }));

    expect(useConfiguratorStore.getState().selection).toBeNull();
    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toContain("select=");
  });
});
