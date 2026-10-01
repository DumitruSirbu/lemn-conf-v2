import { createContext } from "react";
import type { StoreApi } from "zustand";

import type { ConfiguratorState } from "./configurator-store";

/**
 * The store a server render (and React's hydration pass over it) answers from, when the tree was
 * mounted under a `ConfiguratorSnapshotProvider` (ADR 0133 decision 3). `null` means no provider, and
 * the session store's own initial state answers, as it did before.
 *
 * Only the provider provides it, and only the hook reads it. A leaf module of its own so that the
 * store and the provider can both import it without importing each other.
 */
export const ServerSnapshotStoreContext =
  createContext<StoreApi<ConfiguratorState> | null>(null);
