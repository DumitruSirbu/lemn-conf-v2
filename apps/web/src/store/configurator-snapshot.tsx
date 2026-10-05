"use client";

import { buildKitchenLBodyCatalog } from "@lemnaria/configurator-domain";
import { useState, type ReactNode } from "react";

import {
  createConfiguratorStore,
  useConfiguratorStore,
  type ConfiguratorState,
  type LoadedDesignState,
} from "./configurator-store";
import { ServerSnapshotStoreContext } from "./server-snapshot-context";

/**
 * Makes the server render, and React's hydration pass over it, show the loaded design without writing
 * any module-level store (ADR 0133 decisions 1-3).
 *
 * It builds a store for this mount with no side-effect option, so it can never reach the save
 * coalescer, and drops it with the mount so a server request leaves nothing for the next one.
 * `useConfiguratorStore` answers its server snapshot from this store; the rest of that hook still
 * addresses the browser's session store.
 *
 * Hydration window: during the hydration render every hook site reads this store, so an action
 * selected then is this store's until the first re-render. In the browser its actions are therefore
 * the session store's own, so a call in that window reaches the session and its save. On the server
 * none may be called, and in development one that is throws.
 *
 * `useState` holds it for the life of the mount: only the server and hydration renders read it.
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
  store.setState(replacementActionsFor(store.getState()));
  return store;
}

/** The state's action fields, replaced: the session store's own in the browser, and outside
 *  production ones that throw on the server. Actions are exactly the function-valued fields of a store
 *  built without a probe; `probeAt` is state and is undefined there. */
function replacementActionsFor(
  snapshotState: ConfiguratorState,
): Partial<ConfiguratorState> {
  const sessionState = useConfiguratorStore.getState();
  const inBrowser = isBrowserRender();
  const replacements: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(snapshotState)) {
    if (typeof value !== "function") continue;
    const replacement: unknown = inBrowser
      ? Reflect.get(sessionState, name)
      : actionThatThrows(name);
    if (replacement !== undefined) replacements[name] = replacement;
  }
  return replacements as Partial<ConfiguratorState>;
}

function actionThatThrows(name: string): (() => never) | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  return () => {
    throw new Error(
      `${name}() was called on a server render's snapshot store, which is read-only (ADR 0133)`,
    );
  };
}

function isBrowserRender(): boolean {
  return typeof window !== "undefined";
}

/**
 * Replaces the browser's session store with `loaded`, during render, unless `isAlreadyLoaded` says it
 * holds that design, and never on the server (ADR 0133 decision 4): the process-wide store is shared
 * by every request, so a write there would carry one visitor's design into the next render.
 *
 * The caller's question is asked of `getState()`, never of the hook: under a provider the hook
 * answers the snapshot, which already holds the loaded design, and would skip this write. The write
 * stays in render so `ConfigureScreen`, rendered below, finds it done.
 */
export function hydrateSessionStoreInBrowser(
  loaded: LoadedDesignState,
  isAlreadyLoaded: (session: ConfiguratorState) => boolean,
): void {
  if (!isBrowserRender()) return;
  const session = useConfiguratorStore.getState();
  if (isAlreadyLoaded(session)) return;
  session.hydrate(loaded);
}
