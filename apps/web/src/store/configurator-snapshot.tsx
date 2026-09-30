"use client";

import { buildKitchenLBodyCatalog } from "@lemnaria/configurator-domain";
import { useState, type ReactNode } from "react";

import {
  createConfiguratorStore,
  ServerSnapshotStoreContext,
  useConfiguratorStore,
  type ConfiguratorState,
  type LoadedDesignState,
} from "./configurator-store";

/**
 * Makes the server render — and React's hydration pass over it — show the loaded design, without
 * writing any module-level store (ADR 0133 decisions 1–3, backlog 98).
 *
 * It builds a store **for this mount**: the same factory the app uses, the loaded design hydrated
 * into it, and no side-effect option, so it can never reach the save coalescer. `useConfiguratorStore`
 * answers its server snapshot from this store; everything else about that hook still addresses the
 * browser's one session store. The store is dropped with the mount, and a server request therefore
 * leaves nothing behind for the next one.
 *
 * `useState` holds it for the life of the mount on purpose: only the server render and the hydration
 * render read it, and both happen before any later prop could differ.
 */
export function ConfiguratorSnapshotProvider({
  loaded,
  children,
}: {
  loaded: LoadedDesignState;
  children: ReactNode;
}) {
  const [snapshotStore] = useState(() => createSnapshotStore(loaded));
  return (
    <ServerSnapshotStoreContext value={snapshotStore}>
      {children}
    </ServerSnapshotStoreContext>
  );
}

function createSnapshotStore(loaded: LoadedDesignState) {
  const store = createConfiguratorStore({
    design: loaded.design,
    catalogAt: buildKitchenLBodyCatalog,
  });
  store.getState().hydrate(loaded);
  return store;
}

/**
 * Replaces the browser's session store with `loaded`, during render, unless `isAlreadyLoaded` says it
 * holds that design — and **never on the server** (ADR 0133 decision 4): the process-wide store is
 * shared by every request, so a write there would carry one visitor's design into the next render.
 *
 * The caller's question is asked of `getState()`, never of the hook: under a provider the hook
 * answers the *snapshot*, which is the loaded design already, and would skip the very write this
 * makes. The write stays in render so `ConfigureScreen`, rendered below, finds it done.
 */
export function hydrateSessionStoreInBrowser(
  loaded: LoadedDesignState,
  isAlreadyLoaded: (session: ConfiguratorState) => boolean,
): void {
  if (typeof window === "undefined") return;
  const session = useConfiguratorStore.getState();
  if (isAlreadyLoaded(session)) return;
  session.hydrate(loaded);
}
