// @vitest-environment happy-dom
//
// M7B U7 S0 adversarial QA (ADR 0133 decision 3): **the per-render snapshot store has no side
// effects, on the client too.** `ConfiguratorSnapshotProvider` renders in the browser as well as on
// the server, and during hydration every hook site reads the snapshot store — actions selected
// through the hook (`deselect`, `applyWholeKitchenSettings`) are the snapshot store's until the
// post-hydration re-render. So the store a client mount builds is taken out of the provider's
// context and driven through every command that writes a design, a status or an identity: none of
// it may reach `fetch` (the save coalescer, `persistDesignChange`, the overwrite path) or the
// browser's session store.
//
// A positive control runs the same delete on the session store and sees `fetch` called, so a
// silent network path is not what makes the negative assertions pass.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { act, createElement, useContext } from "react";
import { createRoot } from "react-dom/client";
import type { StoreApi } from "zustand";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfiguratorSnapshotProvider } from "@/store/configurator-snapshot";
import {
  ServerSnapshotStoreContext,
  useConfiguratorStore,
  type ConfiguratorState,
  type LoadedDesignState,
} from "@/store/configurator-store";

const SAVE_DEBOUNCE_HEADROOM_MS = 60_000;

const LOADED: LoadedDesignState = {
  design: { ...KITCHEN_L_DESIGN, updatedAt: "2026-01-02T00:00:00.000Z" },
  designId: "an-owners-design-id",
  revision: "3",
  canWrite: true,
};

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
  act(() => {
    createRoot(container).render(
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

const fetchSpy = vi.fn(() =>
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

  it("deletes, re-identifies, settles and overwrites without a request or a session write", async () => {
    const snapshot = mountSnapshotStore();
    const state = () => snapshot.getState();
    const designBefore = state().design;

    state().select({
      kind: "placement",
      id: firstDeletablePlacementId(state()),
    });
    state().remove();
    const designAfterDelete = state().design;
    state().setSaveStatus("conflict");
    state().overwriteConflict();
    state().applySaved({ id: "another-id", revision: "9" });
    state().hydrate({ ...LOADED, designId: "a-different-design" });
    state().deselect();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_HEADROOM_MS);

    expect(designAfterDelete).not.toBe(designBefore);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sessionWrites).toEqual([]);
    expect(useConfiguratorStore.getState()).toBe(
      useConfiguratorStore.getInitialState(),
    );
  });

  it("control: the same delete on the session store does reach the network", async () => {
    useConfiguratorStore.getState().hydrate({
      ...LOADED,
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
