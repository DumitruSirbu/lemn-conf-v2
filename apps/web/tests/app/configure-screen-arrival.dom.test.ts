// @vitest-environment happy-dom
//
// `?select=` and `?settings=open`, honoured once per arrival (M8 8D S4, and the fix round's E1 and E2). The hook is
// driven alone, against the real stores and history, with `useSearchParams` answering what the URL says.
//
// What this cannot see: Next's own router syncing `useSearchParams` after `replaceState`, the scene deselecting a body
// on a wall the eye cuts (modelled here with the scene's own `cutawayWallsFor`, not run), and the settings sheet
// opening. The trigger is a stub whose click is counted; that the click opens the real sheet is the browser's.
import {
  cabinetDepthMmOf,
  KITCHEN_L_DESIGN,
  projectDesignForDisplay,
  type Design,
  type DesignWall,
} from "@lemnaria/configurator-domain";
import { cameraPresetsForRoom, cutawayWallsFor } from "@lemnaria/three-adapter";
import {
  act,
  createElement,
  StrictMode,
  useRef,
  type ReactElement,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const url = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useSearchParams: () => new URLSearchParams(url.search),
}));

import { useHonourArrival } from "@/app/configurator/configure/configure-screen";
import { useCameraPreset } from "@/scene/camera-preset-store";
import { useConfiguratorStore } from "@/store/configurator-store";

import { composedKitchensOf, U_ARM } from "../support/swept-kitchens";

const GUARD_STATE = { lemnariaBackGuard: true };

let container: HTMLDivElement;
let root: Root;
let isTriggerEnabled = true;
let settleTheScene: () => void;
const triggerClicks = vi.fn();

function Probe({ isOwner = true }: { isOwner?: boolean }): ReactElement {
  const settingsTrackRef = useRef<HTMLDivElement>(null);
  settleTheScene = useHonourArrival({
    isOwner,
    settingsTrackRef,
  }).onSceneSettled;
  return createElement(
    "div",
    { ref: settingsTrackRef },
    createElement("button", {
      "data-testid": "global-settings-trigger",
      disabled: !isTriggerEnabled,
      onClick: triggerClicks,
    }),
  );
}

function render(element: ReactElement = createElement(Probe)): void {
  act(() => {
    root.render(element);
  });
}

function settle(): void {
  act(() => {
    settleTheScene();
  });
}

function arriveAt(pathWithSearch: string, state: unknown = null): void {
  window.history.replaceState(state, "", pathWithSearch);
  url.search = new URL(window.location.href).search;
}

function hydrate(
  design: Design,
  canWrite: boolean | "checking" | "check-failed",
) {
  useConfiguratorStore.getState().hydrate({
    design,
    designId: "design-under-edit",
    revision: "1",
    canWrite,
  });
}

/** The scene's own rule (ADR 0132 A8.3), asked of the view the camera stands at. */
function seesTheWall(design: Design, view: string, wall: DesignWall): boolean {
  const preset = cameraPresetsForRoom(design.room).find((p) => p.id === view);
  if (preset === undefined) return false;
  return !cutawayWallsFor(
    preset.position,
    design.room,
    cabinetDepthMmOf(design),
  ).includes(wall);
}

const U_KITCHENS = composedKitchensOf(U_ARM);
const SEEDED_DESIGN = U_KITCHENS[0]?.design;
if (SEEDED_DESIGN === undefined) throw new Error("the sweep holds no U");
const OWN_BODY = SEEDED_DESIGN.placements[1]?.id ?? "";

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  triggerClicks.mockClear();
  isTriggerEnabled = true;
  useCameraPreset.setState({ presetId: "overview" });
  hydrate(SEEDED_DESIGN, true);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("?select=", () => {
  it("selects the body it names once the scene has settled, and has taken the parameter off the URL", () => {
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}`);

    render();
    expect(useConfiguratorStore.getState().selection).toBeNull();
    settle();

    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: OWN_BODY,
    });
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/ro/d/design-under-edit");
  });

  it("selects the body at once in a room whose scene cuts nothing away, without waiting for it", () => {
    hydrate(KITCHEN_L_DESIGN, true);
    const body = KITCHEN_L_DESIGN.placements[1]?.id ?? "";
    arriveAt(`/ro/d/design-under-edit?select=${body}`);

    render();

    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: body,
    });
    settle();
    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: body,
    });
  });

  it("selects nothing and breaks nothing for a body the design does not hold", () => {
    arriveAt("/ro/d/design-under-edit?select=no-such-body");

    render();
    settle();

    expect(useConfiguratorStore.getState().selection).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("is acted on once: a later settle, or a re-render with the URL as it was, selects nothing again", () => {
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}`);
    render();
    settle();
    act(() => {
      useConfiguratorStore.getState().deselect();
    });

    render();
    render();
    settle();

    expect(useConfiguratorStore.getState().selection).toBeNull();
  });

  it("finds nothing to repeat in the entry it stripped, however the screen is mounted again", () => {
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}`);
    render();
    settle();
    act(() => {
      useConfiguratorStore.getState().deselect();
    });
    act(() => {
      root.unmount();
    });
    url.search = new URL(window.location.href).search;
    root = createRoot(container);

    render();
    settle();

    expect(useConfiguratorStore.getState().selection).toBeNull();
  });
});

describe("E2: the body is selected where it can be seen", () => {
  const cutCase = U_KITCHENS.flatMap(({ design }) =>
    [...new Set(design.placements.map((p) => p.wall))].flatMap((wall) =>
      cameraPresetsForRoom(design.room)
        .filter((view) => !seesTheWall(design, view.id, wall))
        .map((view) => ({ design, wall, standingAt: view.id })),
    ),
  )[0];

  it("is tried against a real case: a U, a wall with a body, a remembered view that cuts it", () => {
    expect(cutCase).toBeDefined();
  });

  it("moves the remembered view first to one that shows the wall, then selects the body", () => {
    if (cutCase === undefined) throw new Error("no case");
    const { design, wall, standingAt } = cutCase;
    const body = design.placements.find((p) => p.wall === wall);
    if (body === undefined) throw new Error("no body");
    hydrate(design, true);
    useCameraPreset.setState({ presetId: standingAt });
    arriveAt(`/ro/d/design-under-edit?select=${body.id}`);

    render();

    const stoodAt = useCameraPreset.getState().presetId;
    expect(stoodAt).not.toBe(standingAt);
    expect(seesTheWall(design, stoodAt, wall)).toBe(true);
    expect(useConfiguratorStore.getState().selection).toBeNull();
    settle();
    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: body.id,
    });
  });

  it("leaves the view alone when the remembered one already shows the wall", () => {
    const body = SEEDED_DESIGN.placements.find((p) =>
      seesTheWall(SEEDED_DESIGN, "overview", p.wall),
    );
    if (body === undefined)
      throw new Error("no body in sight from the overview");
    arriveAt(`/ro/d/design-under-edit?select=${body.id}`);

    render();

    expect(useCameraPreset.getState().presetId).toBe("overview");
  });

  it("never moves the view for a settings arrival, and a stale remembered view stays untouched", () => {
    useCameraPreset.setState({ presetId: "wallC" });
    arriveAt("/ro/d/design-under-edit?settings=open");

    render();

    expect(useCameraPreset.getState().presetId).toBe("wallC");
  });
});

describe("E5a with E2: the conflict link's first body is in sight on arrival, in every U", () => {
  it("is selected at rest and stood at a view that shows its wall, from every remembered view", () => {
    const outcomes: string[] = [];
    for (const { design } of U_KITCHENS) {
      hydrate(design, true);
      const first = projectDesignForDisplay(
        design,
        useConfiguratorStore.getState().catalog,
      )[0]?.entries[0];
      if (first === undefined) continue;
      const wall = design.placements.find(
        (p) => p.id === first.placementId,
      )?.wall;
      if (wall === undefined) continue;

      for (const standingAt of cameraPresetsForRoom(design.room).map(
        (p) => p.id,
      )) {
        act(() => {
          root.unmount();
        });
        root = createRoot(container);
        useConfiguratorStore.getState().deselect();
        useCameraPreset.setState({ presetId: standingAt });
        arriveAt(`/ro/d/design-under-edit?select=${first.placementId}`);
        render();
        settle();

        const selected = useConfiguratorStore.getState().selection?.id;
        const stoodAt = useCameraPreset.getState().presetId;
        if (
          selected !== first.placementId ||
          !seesTheWall(design, stoodAt, wall)
        )
          outcomes.push(
            `${first.placementId} from ${standingAt}: ${String(selected)} at ${stoodAt}`,
          );
      }
    }

    expect(U_KITCHENS.length).toBeGreaterThan(50);
    expect(outcomes).toEqual([]);
  });
});

describe("E2a: the customer's own act wins over an arrival still waiting for the scene", () => {
  const OTHER_BODY = SEEDED_DESIGN.placements[2]?.id ?? "";
  let scene: HTMLCanvasElement;

  function pointer(target: Element, type: string, x: number, y: number): void {
    act(() => {
      target.dispatchEvent(
        new PointerEvent(type, { bubbles: true, clientX: x, clientY: y }),
      );
    });
  }

  function tap(target: Element): void {
    pointer(target, "pointerdown", 100, 100);
    pointer(target, "pointerup", 101, 100);
  }

  beforeEach(() => {
    scene = document.createElement("canvas");
    document.body.append(scene);
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}`);
    render();
  });

  afterEach(() => {
    scene.remove();
  });

  it("is waiting: nothing is selected until the scene rests", () => {
    expect(useConfiguratorStore.getState().selection).toBeNull();
  });

  it("keeps a body the customer selected by tapping the scene", () => {
    tap(scene);
    act(() => {
      useConfiguratorStore
        .getState()
        .select({ kind: "placement", id: OTHER_BODY });
    });

    settle();

    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: OTHER_BODY,
    });
  });

  it("keeps an empty space the customer tapped, so nothing is selected", () => {
    tap(scene);
    act(() => {
      useConfiguratorStore.getState().deselect();
    });

    settle();

    expect(useConfiguratorStore.getState().selection).toBeNull();
  });

  it("keeps a selection the customer cleared", () => {
    tap(scene);
    act(() => {
      useConfiguratorStore
        .getState()
        .select({ kind: "placement", id: OTHER_BODY });
    });
    act(() => {
      useConfiguratorStore.getState().deselect();
    });

    settle();

    expect(useConfiguratorStore.getState().selection).toBeNull();
  });

  it("is not cancelled by a deselect that is no pointer gesture, as the scene's own on a cut wall is", () => {
    act(() => {
      useConfiguratorStore.getState().deselect();
    });

    settle();

    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: OWN_BODY,
    });
  });

  it("is not cancelled by an orbit, which is a drag and selects nothing", () => {
    pointer(scene, "pointerdown", 100, 100);
    pointer(scene, "pointerup", 220, 160);

    settle();

    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: OWN_BODY,
    });
  });

  it("is not cancelled by a tap elsewhere on the page", () => {
    const chip = document.createElement("button");
    document.body.append(chip);

    tap(chip);
    chip.remove();
    settle();

    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: OWN_BODY,
    });
  });

  it("has taken the parameter off the URL either way: being overridden is an outcome", () => {
    tap(scene);

    expect(window.location.search).toBe("");
  });

  it("stops watching once the scene has rested, and when the screen goes away", () => {
    const remove = vi.spyOn(document, "removeEventListener");

    settle();

    expect(remove.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(["pointerdown", "pointerup"]),
    );
  });
});

describe("E2a under StrictMode: mount, cleanup, mount (QA12)", () => {
  const OTHER_BODY = SEEDED_DESIGN.placements[2]?.id ?? "";
  let scene: HTMLCanvasElement;

  function pointer(type: string, x: number, y: number): void {
    act(() => {
      scene.dispatchEvent(
        new PointerEvent(type, { bubbles: true, clientX: x, clientY: y }),
      );
    });
  }

  function tap(): void {
    pointer("pointerdown", 100, 100);
    pointer("pointerup", 101, 100);
  }

  beforeEach(() => {
    scene = document.createElement("canvas");
    document.body.append(scene);
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}`);
    render(createElement(StrictMode, null, createElement(Probe)));
  });

  afterEach(() => {
    scene.remove();
  });

  it("is still waiting for the scene after the remount", () => {
    expect(useConfiguratorStore.getState().selection).toBeNull();
  });

  it("drops the arrival's body when the customer taps the scene first, and keeps the customer's", () => {
    tap();
    act(() => {
      useConfiguratorStore
        .getState()
        .select({ kind: "placement", id: OTHER_BODY });
    });

    settle();

    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: OTHER_BODY,
    });
  });

  it("drops it for a tap on empty floor as well", () => {
    tap();
    act(() => {
      useConfiguratorStore.getState().deselect();
    });

    settle();

    expect(useConfiguratorStore.getState().selection).toBeNull();
  });

  it("does not drop it for an orbit drag, and selects its body once at rest", () => {
    pointer("pointerdown", 100, 100);
    pointer("pointerup", 220, 160);

    settle();
    settle();

    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: OWN_BODY,
    });
  });

  it("does not drop it for a deselect that is no pointer gesture", () => {
    act(() => {
      useConfiguratorStore.getState().deselect();
    });

    settle();

    expect(useConfiguratorStore.getState().selection).toEqual({
      kind: "placement",
      id: OWN_BODY,
    });
  });

  it("leaves no listener attached once the arrival has settled", () => {
    const removed = vi.spyOn(document, "removeEventListener");

    settle();

    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(["pointerdown", "pointerup"]),
    );
  });

  it("leaves no listener attached once the screen has gone away", () => {
    const removed = vi.spyOn(document, "removeEventListener");

    act(() => {
      root.unmount();
    });

    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(["pointerdown", "pointerup"]),
    );
  });
});

describe("?settings=open (E1)", () => {
  it("waits for the answer about write access: nothing is pressed and the parameter stays", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt("/ro/d/design-under-edit?settings=open");

    render();

    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?settings=open");
  });

  it("presses the trigger once when the answer is yes, then takes the parameter off", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt("/ro/d/design-under-edit?settings=open");
    render();

    act(() => {
      useConfiguratorStore.getState().applyWriteAccess({
        designId: "design-under-edit",
        canWrite: true,
      });
    });
    render();
    render();

    expect(triggerClicks).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
  });

  it("presses it once under StrictMode's double effect as well", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt("/ro/d/design-under-edit?settings=open");
    render(createElement(StrictMode, null, createElement(Probe)));

    act(() => {
      useConfiguratorStore.getState().applyWriteAccess({
        designId: "design-under-edit",
        canWrite: true,
      });
    });

    expect(triggerClicks).toHaveBeenCalledTimes(1);
  });

  it("opens nothing and takes the parameter off when the answer is no", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt("/ro/d/design-under-edit?settings=open");
    render();

    act(() => {
      useConfiguratorStore.getState().applyWriteAccess({
        designId: "design-under-edit",
        canWrite: false,
      });
    });

    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("opens nothing and takes the parameter off when the check fails", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt("/ro/d/design-under-edit?settings=open");
    render();

    act(() => {
      useConfiguratorStore
        .getState()
        .failWriteAccessCheck({ designId: "design-under-edit" });
    });

    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("never presses a trigger that is off at that moment, though the answer was yes", () => {
    isTriggerEnabled = false;
    arriveAt("/ro/d/design-under-edit?settings=open");

    render();

    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("does not open the sheet a second time for the same URL on a later render", () => {
    arriveAt("/ro/d/design-under-edit?settings=open");
    render();
    render();
    render();

    expect(triggerClicks).toHaveBeenCalledTimes(1);
  });

  it("decides the body at once but keeps the parameters until the settings are decided", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}&settings=open`);

    render();
    settle();

    expect(useConfiguratorStore.getState().selection).not.toBeNull();
    expect(window.location.search).toContain("settings=open");

    act(() => {
      useConfiguratorStore.getState().applyWriteAccess({
        designId: "design-under-edit",
        canWrite: true,
      });
    });

    expect(triggerClicks).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
  });

  it("does nothing for any other value", () => {
    arriveAt("/ro/d/design-under-edit?settings=closed");

    render();

    expect(triggerClicks).not.toHaveBeenCalled();
  });
});

describe("the history it leaves", () => {
  it("replaces the entry it stands on, keeping its state, and adds none", () => {
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}`, GUARD_STATE);
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    const lengthBefore = window.history.length;

    render();

    expect(push).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.history.length).toBe(lengthBefore);
    expect(window.history.state).toEqual(GUARD_STATE);
  });

  it("leaves other parameters alone", () => {
    arriveAt(`/ro/d/design-under-edit?select=${OWN_BODY}&utm=a`);

    render();

    expect(window.location.search).toBe("?utm=a");
  });

  it("touches nothing when the URL asks for nothing", () => {
    arriveAt("/ro/d/design-under-edit");
    const replace = vi.spyOn(window.history, "replaceState");

    render();
    settle();

    expect(replace).not.toHaveBeenCalled();
    expect(useConfiguratorStore.getState().selection).toBeNull();
  });
});

describe("outside the owner's editor", () => {
  it("acts on nothing and leaves the URL alone", () => {
    arriveAt(`/ro/s/token?select=${OWN_BODY}&settings=open`);

    render(createElement(Probe, { isOwner: false }));
    settle();

    expect(useConfiguratorStore.getState().selection).toBeNull();
    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toContain("select=");
  });
});
