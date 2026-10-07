// @vitest-environment happy-dom
//
// `?select=` and `?settings=open`, honoured once each and taken off the URL at each one's own outcome. The hook is
// driven alone, against the real stores and history, with `useSearchParams` answering what the URL says.
//
// What this cannot see: Next's router syncing `useSearchParams` after `replaceState` (the mock keeps answering the
// URL as it was, which is the harder case), the scene deselecting a body on a wall the eye cuts (modelled with the
// scene's own `cutawayWallsFor`, not run), and the settings sheet opening: the trigger is a stub whose click is
// counted.
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

import { useHonourArrival } from "@/app/configurator/configure/use-honour-arrival";
import { useCameraPreset } from "@/scene/camera-preset-store";
import type { WebGLSupportState } from "@/scene/webgl-support";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  composedKitchensOf,
  STRAIGHT_ARM,
  U_ARM,
} from "../support/swept-kitchens";

const GUARD_STATE = { lemnariaBackGuard: true };
const DESIGN_PATH = "/ro/d/design-under-edit";

let container: HTMLDivElement;
let root: Root;
let isTriggerEnabled = true;
let settleTheScene: () => void;
const triggerClicks = vi.fn();

function Probe({
  isOwner = true,
  support = "supported",
}: {
  isOwner?: boolean;
  support?: WebGLSupportState;
}): ReactElement {
  const settingsTrackRef = useRef<HTMLDivElement>(null);
  settleTheScene = useHonourArrival({
    isOwner,
    support,
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

/** The screen going away and a new one mounting over the same URL, as a language switch does. */
function remount(element: ReactElement = createElement(Probe)): void {
  act(() => {
    root.unmount();
  });
  root = createRoot(container);
  render(element);
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

function answerWriteAccess(canWrite: boolean): void {
  act(() => {
    useConfiguratorStore
      .getState()
      .applyWriteAccess({ designId: "design-under-edit", canWrite });
  });
}

function selectedId(): string | undefined {
  return useConfiguratorStore.getState().selection?.id;
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
const OTHER_BODY = SEEDED_DESIGN.placements[2]?.id ?? "";
const WALL_C_KITCHEN = U_KITCHENS.find(({ design }) =>
  design.placements.some((p) => p.wall === "C"),
)?.design;
if (WALL_C_KITCHEN === undefined) throw new Error("no U holds a wall C body");
const WALL_C_BODY =
  WALL_C_KITCHEN.placements.find((p) => p.wall === "C")?.id ?? "";

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

describe("?select= in a U waits for the scene", () => {
  beforeEach(() => {
    arriveAt(`${DESIGN_PATH}?select=${OWN_BODY}`);
  });

  it("selects the body at rest, and only then takes the parameter off the URL", () => {
    render();

    expect(selectedId()).toBeUndefined();
    expect(window.location.search).toBe(`?select=${OWN_BODY}`);

    settle();

    expect(selectedId()).toBe(OWN_BODY);
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe(DESIGN_PATH);
  });

  it("starts the same arrival again when the screen is mounted over the URL while it waits", () => {
    render();

    remount();
    settle();

    expect(selectedId()).toBe(OWN_BODY);
    expect(window.location.search).toBe("");
  });

  it("finds nothing to repeat once the arrival has ended, however the screen is mounted again", () => {
    render();
    settle();
    act(() => {
      useConfiguratorStore.getState().deselect();
    });
    url.search = new URL(window.location.href).search;

    remount();
    settle();

    expect(selectedId()).toBeUndefined();
  });

  it("is acted on once: a later settle or a re-render with the URL as it was selects nothing again", () => {
    render();
    settle();
    act(() => {
      useConfiguratorStore.getState().deselect();
    });

    render();
    settle();

    expect(selectedId()).toBeUndefined();
  });

  it("ends without selecting when no scene will ever exist, and takes the parameter off", () => {
    const add = vi.spyOn(document, "addEventListener");

    render(createElement(Probe, { support: "unsupported" }));

    expect(selectedId()).toBeUndefined();
    expect(window.location.search).toBe("");
    expect(add.mock.calls.map(([type]) => type)).not.toContain("pointerdown");
  });

  it("keeps waiting while support is still being asked, and arms the watch once there is a scene", () => {
    render(createElement(Probe, { support: "probing" }));
    expect(window.location.search).toBe(`?select=${OWN_BODY}`);

    render(createElement(Probe, { support: "supported" }));
    settle();

    expect(selectedId()).toBe(OWN_BODY);
    expect(window.location.search).toBe("");
  });
});

describe("?select= elsewhere", () => {
  it("selects at once in a room whose scene cuts nothing away, without waiting for it", () => {
    hydrate(KITCHEN_L_DESIGN, true);
    const body = KITCHEN_L_DESIGN.placements[1]?.id ?? "";
    arriveAt(`${DESIGN_PATH}?select=${body}`);

    render();

    expect(selectedId()).toBe(body);
    expect(window.location.search).toBe("");
  });

  it("selects nothing and takes the parameter off for a body the design does not hold", () => {
    arriveAt(`${DESIGN_PATH}?select=no-such-body`);

    render();
    settle();

    expect(selectedId()).toBeUndefined();
    expect(window.location.search).toBe("");
  });

  it("leaves other parameters alone", () => {
    arriveAt(`${DESIGN_PATH}?select=no-such-body&utm=a`);

    render();

    expect(window.location.search).toBe("?utm=a");
  });
});

describe("the view an arrival stands at", () => {
  it("is the body's own wall view in a U, though the remembered one does not cut the wall", () => {
    hydrate(WALL_C_KITCHEN, true);
    useCameraPreset.setState({ presetId: "wallA" });
    arriveAt(`${DESIGN_PATH}?select=${WALL_C_BODY}`);

    render();

    expect(useCameraPreset.getState().presetId).toBe("wallC");
    expect(selectedId()).toBeUndefined();
    settle();
    expect(selectedId()).toBe(WALL_C_BODY);
  });

  it("is the body's own wall view in an L, where the body is selected at once", () => {
    hydrate(KITCHEN_L_DESIGN, true);
    const onWallB = KITCHEN_L_DESIGN.placements.find((p) => p.wall === "B");
    if (onWallB === undefined) throw new Error("no body on wall B");
    arriveAt(`${DESIGN_PATH}?select=${onWallB.id}`);

    render();

    expect(useCameraPreset.getState().presetId).toBe("wallB");
    expect(selectedId()).toBe(onWallB.id);
  });

  it("is wall A's in a straight room", () => {
    const straight = composedKitchensOf(STRAIGHT_ARM)[0]?.design;
    if (straight === undefined) throw new Error("no straight kitchen");
    const body = straight.placements[0];
    if (body === undefined) throw new Error("no body");
    hydrate(straight, true);
    useCameraPreset.setState({ presetId: "overview" });
    arriveAt(`${DESIGN_PATH}?select=${body.id}`);

    render();

    expect(useCameraPreset.getState().presetId).toBe("wallA");
    expect(selectedId()).toBe(body.id);
  });

  it("is never moved by a settings arrival", () => {
    useCameraPreset.setState({ presetId: "wallC" });
    arriveAt(`${DESIGN_PATH}?settings=open`);

    render();

    expect(useCameraPreset.getState().presetId).toBe("wallC");
  });

  it("puts the first body of every U in sight at rest, from every remembered view", () => {
    const outcomes: string[] = [];
    for (const { design } of U_KITCHENS) {
      hydrate(design, true);
      const first = projectDesignForDisplay(
        design,
        useConfiguratorStore.getState().catalog,
      )[0]?.entries[0];
      const wall = design.placements.find(
        (p) => p.id === first?.placementId,
      )?.wall;
      if (first === undefined || wall === undefined) continue;

      for (const standingAt of cameraPresetsForRoom(design.room).map(
        (p) => p.id,
      )) {
        act(() => {
          root.unmount();
        });
        root = createRoot(container);
        useConfiguratorStore.getState().deselect();
        useCameraPreset.setState({ presetId: standingAt });
        arriveAt(`${DESIGN_PATH}?select=${first.placementId}`);
        render();
        settle();

        const stoodAt = useCameraPreset.getState().presetId;
        if (
          selectedId() !== first.placementId ||
          stoodAt !== `wall${wall}` ||
          !seesTheWall(design, stoodAt, wall)
        )
          outcomes.push(`${first.placementId} from ${standingAt}`);
      }
    }

    expect(U_KITCHENS.length).toBeGreaterThan(50);
    expect(outcomes).toEqual([]);
  });
});

describe("the customer's own act wins over an arrival still waiting for the scene", () => {
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

  function arrive(element: ReactElement): void {
    scene = document.createElement("canvas");
    document.body.append(scene);
    arriveAt(`${DESIGN_PATH}?select=${OWN_BODY}`);
    render(element);
  }

  afterEach(() => {
    scene.remove();
  });

  describe.each([
    ["", createElement(Probe)],
    [
      " under StrictMode",
      createElement(StrictMode, null, createElement(Probe)),
    ],
  ])("arriving%s", (_label, element) => {
    beforeEach(() => {
      arrive(element);
    });

    it("is waiting: nothing is selected and the parameter is on the URL", () => {
      expect(selectedId()).toBeUndefined();
      expect(window.location.search).toBe(`?select=${OWN_BODY}`);
    });

    it("keeps a body the customer selected by tapping the scene, and takes the parameter off", () => {
      expect(window.location.search).toBe(`?select=${OWN_BODY}`);
      tap(scene);
      act(() => {
        useConfiguratorStore
          .getState()
          .select({ kind: "placement", id: OTHER_BODY });
      });

      settle();

      expect(selectedId()).toBe(OTHER_BODY);
      expect(window.location.search).toBe("");
    });

    it("keeps an empty space the customer tapped, so nothing is selected", () => {
      tap(scene);
      act(() => {
        useConfiguratorStore.getState().deselect();
      });

      settle();

      expect(selectedId()).toBeUndefined();
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

      expect(selectedId()).toBeUndefined();
    });

    it("is not cancelled by a deselect that is no pointer gesture, as the scene's own on a cut wall is", () => {
      act(() => {
        useConfiguratorStore.getState().deselect();
      });

      settle();

      expect(selectedId()).toBe(OWN_BODY);
    });

    it("is not cancelled by an orbit, which is a drag and selects nothing", () => {
      pointer(scene, "pointerdown", 100, 100);
      pointer(scene, "pointerup", 220, 160);

      settle();
      settle();

      expect(selectedId()).toBe(OWN_BODY);
    });

    it("is not cancelled by a tap elsewhere on the page", () => {
      const chip = document.createElement("button");
      document.body.append(chip);

      tap(chip);
      chip.remove();
      settle();

      expect(selectedId()).toBe(OWN_BODY);
    });

    it("leaves no listener attached once the arrival has settled", () => {
      const remove = vi.spyOn(document, "removeEventListener");

      settle();

      expect(remove.mock.calls.map(([type]) => type)).toEqual(
        expect.arrayContaining(["pointerdown", "pointerup"]),
      );
    });

    it("leaves no listener attached once the screen has gone away", () => {
      const remove = vi.spyOn(document, "removeEventListener");

      act(() => {
        root.unmount();
      });

      expect(remove.mock.calls.map(([type]) => type)).toEqual(
        expect.arrayContaining(["pointerdown", "pointerup"]),
      );
    });
  });
});

describe("?settings=open", () => {
  it("waits for the answer about write access: nothing is pressed and the parameter stays", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt(`${DESIGN_PATH}?settings=open`);

    render();

    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?settings=open");
  });

  it("presses the trigger once when the answer is yes, then takes the parameter off", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt(`${DESIGN_PATH}?settings=open`);
    render();

    answerWriteAccess(true);
    render();
    render();

    expect(triggerClicks).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("");
  });

  it("presses it once under StrictMode's double effect as well", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt(`${DESIGN_PATH}?settings=open`);
    render(createElement(StrictMode, null, createElement(Probe)));

    answerWriteAccess(true);

    expect(triggerClicks).toHaveBeenCalledTimes(1);
  });

  it("opens nothing and takes the parameter off when the answer is no", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt(`${DESIGN_PATH}?settings=open`);
    render();

    answerWriteAccess(false);

    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("opens nothing and takes the parameter off when the check fails", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt(`${DESIGN_PATH}?settings=open`);
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
    arriveAt(`${DESIGN_PATH}?settings=open`);

    render();

    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("does not open the sheet a second time for the same URL on a later render", () => {
    arriveAt(`${DESIGN_PATH}?settings=open`);
    render();
    render();
    render();

    expect(triggerClicks).toHaveBeenCalledTimes(1);
  });

  it("takes any other value off without pressing anything", () => {
    arriveAt(`${DESIGN_PATH}?settings=closed`);

    render();

    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });
});

describe("both parameters at once: each leaves at its own outcome", () => {
  const both = `${DESIGN_PATH}?select=${OWN_BODY}&settings=open`;

  it("takes settings off first, when write access answers before the scene rests", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt(both, GUARD_STATE);
    render();
    expect(window.location.search).toBe(`?select=${OWN_BODY}&settings=open`);

    answerWriteAccess(true);
    expect(window.location.search).toBe(`?select=${OWN_BODY}`);
    expect(triggerClicks).toHaveBeenCalledTimes(1);

    settle();
    expect(window.location.search).toBe("");
    expect(selectedId()).toBe(OWN_BODY);
  });

  it("takes select off first, when the scene rests before write access answers", () => {
    hydrate(SEEDED_DESIGN, "checking");
    arriveAt(both, GUARD_STATE);
    render();

    settle();
    expect(window.location.search).toBe("?settings=open");
    expect(selectedId()).toBe(OWN_BODY);

    answerWriteAccess(true);
    expect(window.location.search).toBe("");
    expect(triggerClicks).toHaveBeenCalledTimes(1);
  });

  it("rewrites the same entry each time, keeping its state and adding none", () => {
    arriveAt(both, GUARD_STATE);
    const push = vi.spyOn(window.history, "pushState");
    const lengthBefore = window.history.length;

    render();
    settle();

    expect(push).not.toHaveBeenCalled();
    expect(window.history.length).toBe(lengthBefore);
    expect(window.history.state).toEqual(GUARD_STATE);
    expect(window.location.search).toBe("");
  });
});

describe("the history it leaves", () => {
  it("touches nothing when the URL asks for nothing", () => {
    arriveAt(DESIGN_PATH);
    const replace = vi.spyOn(window.history, "replaceState");

    render();
    settle();

    expect(replace).not.toHaveBeenCalled();
    expect(selectedId()).toBeUndefined();
  });
});

describe("outside the owner's editor", () => {
  it("acts on nothing and leaves the URL alone", () => {
    arriveAt(`/ro/s/token?select=${OWN_BODY}&settings=open`);

    render(createElement(Probe, { isOwner: false }));
    settle();

    expect(selectedId()).toBeUndefined();
    expect(triggerClicks).not.toHaveBeenCalled();
    expect(window.location.search).toContain("select=");
  });
});
