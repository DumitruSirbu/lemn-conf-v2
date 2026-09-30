"use client";

import type { Design } from "@lemnaria/configurator-domain";

import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";
import {
  ConfiguratorSnapshotProvider,
  hydrateSessionStoreInBrowser,
} from "@/store/configurator-snapshot";

/**
 * The sentinel id this view hydrates the store under (D6, G5/G8) — deliberately never a real design
 * id, so nothing downstream (the flight payload, `SelectionDebug`'s `data-design-id`, a log line)
 * can mistake a share session's store for an owner's. `generate-design-id.ts`'s `nanoid()` is always
 * 21 characters; this is shorter on purpose, so the two shapes can never collide by construction
 * rather than by convention.
 */
const SHARED_VIEW_DESIGN_ID = "shared-view";

/** No row backs this session, so there is no revision to state and none to enforce a save against
 *  — `canWrite: false` below is what actually keeps a write from being attempted at all. */
const SHARED_VIEW_REVISION = "shared";

/**
 * D6's mount: the share view's own hydrator, a sibling of `HydrateAndConfigure` rather than a reuse
 * of it, because the two answer a different question about write access — this one never asks;
 * `canWrite` is always `false`, never `"checking"`. It is deliberately the *only other* file the
 * single-mount guard admits (`configure-screen-single-mount.test.ts`).
 *
 * **Hydrates during render, in the browser only**, on the same pattern `HydrateAndConfigure` uses, so
 * `ConfigureScreen`'s first client render already shows the shared design. The server render and the
 * hydration pass read it from a per-render `ConfiguratorSnapshotProvider` instead, so the first
 * server-rendered frame is the shared design too and no request writes the process-wide store
 * (ADR 0133). The guard reads the session store's `getState()`, never the hook.
 *
 * **Guarded by the design object, not the id** (D6: *"re-hydrates whenever the store's design is not
 * the object it was handed"*) — every share view shares the one sentinel id, so an id comparison
 * would hydrate the first design and then silently keep it, which is exactly what breaks criterion
 * 13's back/forward case: two share views visited in one tab must each show their own design.
 *
 * **The page mounts this component keyed by the token** (`key={token}` in `page.tsx`), so two share
 * views are always two mounts, never a rerender of one live instance — the same single-fire shape
 * `HydrateAndConfigure` gets from a route change, and what keeps the render-time `hydrate()` call
 * below from ever running on an *already-mounted* instance (which would be a real React warning: a
 * store write during another component's render). The design-object guard is what still makes the
 * one render of each fresh instance correct — a `design` prop can equal the store's current value on
 * mount only if this exact object already made it there, which a fresh server render never repeats.
 */
export function SharedDesignView({ design }: { design: Design }) {
  const loaded = {
    design,
    designId: SHARED_VIEW_DESIGN_ID,
    revision: SHARED_VIEW_REVISION,
    canWrite: false,
  } as const;
  hydrateSessionStoreInBrowser(loaded, (session) => session.design === design);
  return (
    <ConfiguratorSnapshotProvider loaded={loaded}>
      <ConfigureScreen variant="shared" />
    </ConfiguratorSnapshotProvider>
  );
}
