"use client";

import type { Design } from "@lemnaria/configurator-domain";

import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";
import {
  ConfiguratorSnapshotProvider,
  hydrateSessionStoreInBrowser,
} from "@/store/configurator-snapshot";

/**
 * The sentinel id this view hydrates the store under, deliberately never a real design id, so nothing
 * downstream (the flight payload, `SelectionDebug`'s `data-design-id`, a log line) can mistake a
 * share session's store for an owner's. `generate-design-id.ts`'s `nanoid()` is always 21
 * characters; this is shorter, so the two shapes cannot collide.
 */
const SHARED_VIEW_DESIGN_ID = "shared-view";

/** No row backs this session, so there is no revision to enforce a save against; `canWrite: false`
 *  is what keeps a write from being attempted. */
const SHARED_VIEW_REVISION = "shared";

/**
 * The share view's own hydrator, a sibling of `HydrateAndConfigure` because this one never asks about
 * write access: `canWrite` is always `false`, never `"checking"`. It is the only other file the
 * single-mount guard admits (`configure-screen-single-mount.test.ts`).
 *
 * Hydrates during render, in the browser only; the server render and the hydration pass read a
 * `ConfiguratorSnapshotProvider`'s store instead (ADR 0133, and `hydrateSessionStoreInBrowser` for
 * why the guard asks `getState()`).
 *
 * Guarded by the design object, not the id: every share view shares the one sentinel id, so an id
 * comparison would keep the first design and break back/forward between two share views in one tab.
 *
 * The page mounts this keyed by the token (`key={token}` in `page.tsx`), so two share views are two
 * mounts, never a rerender of one instance: the render-time `hydrate()` below would otherwise write a
 * store during another component's render, a real React warning.
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
