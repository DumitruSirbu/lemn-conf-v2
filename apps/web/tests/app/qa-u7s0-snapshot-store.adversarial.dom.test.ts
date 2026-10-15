// @vitest-environment happy-dom
//
// M7B U7 S0 adversarial QA (ADR 0133 decision 3), amended in the review round: **on the client the
// per-render snapshot store's actions are the session store's, so a hydration-window call is not lost.**
//
// `ConfiguratorSnapshotProvider` renders in the browser as well as on the server, and during hydration
// every hook site reads the snapshot store — an action selected through the hook (`remove`, `select`)
// is the snapshot store's own until the post-hydration re-render. Left as the snapshot store's, a call
// in that window edits a store that is dropped with the mount and is never saved: a lost write. QA
// first pinned the snapshot store as inert (no fetch, no session write) and the review found that this
// is the defect, so the assertions below pin the forwarding instead: the snapshot store still holds
// the loaded design and reaches no network by itself, and a hydration-window action reaches the
// session store and its save.
//
// A positive control runs the same delete on the session store and sees `fetch` called, so a silent
// network path is not what makes the negative assertions pass.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { act, createElement, useContext, useLayoutEffect } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import type { StoreApi } from "zustand";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HydrateAndConfigure } from "@/app/d/[id]/hydrate-and-configure";
import { ConfiguratorSnapshotProvider } from "@/store/configurator-snapshot";
import {
  useConfiguratorStore,
  type ConfiguratorState,
  type LoadedDesignState,
} from "@/store/configurator-store";
import { ServerSnapshotStoreContext } from "@/store/server-snapshot-context";

/** What runs inside the hydrating tree, in place of the editor: it selects actions through the hook
 *  during the hydration render, and calls them in a layout effect — after that render and before any
 *  passive effect or post-hydration re-render, which is the window this file is about. */
vi.mock("@/app/configurator/configure/configure-screen", () => ({
  ConfigureScreen: HydrationWindowCaller,
}));

function HydrationWindowCaller() {
  const select = useConfiguratorStore((state) => state.select);
  const remove = useConfiguratorStore((state) => state.remove);
  const records = useConfiguratorStore((state) => state.records);
  useLayoutEffect(() => {
    const deletable = records.find((record) => record.canDelete);
    if (deletable === undefined) throw new Error("no deletable body");
    select({ kind: "placement", id: deletable.id });
    remove();
  }, []);
  return null;
}

const SAVE_DEBOUNCE_HEADROOM_MS = 60_000;

const LOADED: LoadedDesignState = {
  design: { ...KITCHEN_L_DESIGN, updatedAt: "2026-01-02T00:00:00.000Z" },
  designId: "an-owners-design-id",
  revision: "3",
  canWrite: true,
};

/**
 * The control's own design. The module's one writer outlives a test, and the hydration test above leaves it backing
 * off for `LOADED.designId` on a fake clock that is replaced afterwards: a load of that id is handed that write, whose
 * timer never fires. No earlier test writes for this id, so the control's delete is the only write the writer holds.
 */
const CONTROL_DESIGN_ID = "the-controls-own-design-id";

/** Every root a test mounts, unmounted after it: a live one keeps reacting to the next test's writes. */
const mountedRoots: Root[] = [];

/** Mounts the provider on the client and hands back the store it built for this mount. */
function mountSnapshotStore(): StoreApi<ConfiguratorState> {
  const captured: { store: StoreApi<ConfiguratorState> | null } = {
    store: null,
  };
  function Capture() {
    captured.store = useContext(ServerSnapshotStoreContext);
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      createElement(ConfiguratorSnapshotProvider, {
        loaded: LOADED,
        children: createElement(Capture),
      }),
    );
  });
  if (captured.store === null) {
    throw new Error("the provider exposed no store");
  }
  return captured.store;
}

function firstDeletablePlacementId(state: ConfiguratorState): string {
  const deletable = state.records.find((record) => record.canDelete);
  if (deletable === undefined) throw new Error("no deletable body");
  return deletable.id;
}

const fetchSpy = vi.fn<typeof fetch>(() =>
  Promise.resolve(new Response("{}", { status: 500 })),
);
const sessionWrites: string[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  vi.useFakeTimers();
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState(), true);
  sessionWrites.length = 0;
  unsubscribe = useConfiguratorStore.subscribe(() => sessionWrites.push("w"));
});

afterEach(() => {
  act(() => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  unsubscribe();
  useConfiguratorStore.setState(useConfiguratorStore.getInitialState(), true);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the client-side snapshot store reaches no network and no session store", () => {
  it("is built from the loaded design and is not the session store", () => {
    const snapshot = mountSnapshotStore();

    expect(snapshot.getState().design).toBe(LOADED.design);
    expect(snapshot.getState().designId).toBe(LOADED.designId);
    expect(snapshot.getState()).not.toBe(useConfiguratorStore.getState());
    expect(sessionWrites).toEqual([]);
  });

  it("takes its actions from the session store, so none is the snapshot store's own", () => {
    const snapshot = mountSnapshotStore();
    const session = useConfiguratorStore.getState();

    const actionNames = Object.entries(snapshot.getState())
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name);

    expect(actionNames).toContain("remove");
    for (const name of actionNames) {
      expect(Reflect.get(snapshot.getState(), name), name).toBe(
        Reflect.get(session, name),
      );
    }
  });

  it("reaches no network and no session write until an action is called", async () => {
    mountSnapshotStore();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_HEADROOM_MS);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sessionWrites).toEqual([]);
  });

  it("delivers an action selected through the hook during hydration, and called before effects, to the session store and its save", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const designBefore = LOADED.design;

    act(() => {
      mountedRoots.push(
        hydrateRoot(
          container,
          createElement(HydrateAndConfigure, {
            design: designBefore,
            designId: LOADED.designId,
            revision: LOADED.revision,
          }),
        ),
      );
    });
    // The write-access probe answers inside this window and updates the mounted editor.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_HEADROOM_MS);
    });

    expect(useConfiguratorStore.getState().design).not.toBe(designBefore);
    expect(useConfiguratorStore.getState().design.placements.length).toBe(
      designBefore.placements.length - 1,
    );
    expect(
      fetchSpy.mock.calls.filter(([, init]) => init?.method === "PUT"),
      "a save was attempted",
    ).not.toEqual([]);
  });

  it("control: the same delete on the session store does reach the network", async () => {
    useConfiguratorStore.getState().hydrate({
      ...LOADED,
      designId: CONTROL_DESIGN_ID,
      design: KITCHEN_L_DESIGN,
    });
    const session = useConfiguratorStore.getState();

    session.select({
      kind: "placement",
      id: firstDeletablePlacementId(session),
    });
    useConfiguratorStore.getState().remove();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_HEADROOM_MS);

    expect(fetchSpy).toHaveBeenCalled();
  });
});
