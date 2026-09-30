"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import { useEffect } from "react";

import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";
import { sessionConfigurationRepository } from "@/persistence/fetch-configuration-repository";
import {
  ConfiguratorSnapshotProvider,
  hydrateSessionStoreInBrowser,
} from "@/store/configurator-snapshot";
import { useConfiguratorStore } from "@/store/configurator-store";

/** Puts the loaded design in front of the editor: the first server-rendered frame, React's hydration
 *  pass and every later render all show it.
 *
 *  **Two stores, one design.** The browser's session store is written during render, guarded by the
 *  id comparison rather than an effect, so by the time `ConfigureScreen` reads it for a client render
 *  this component's body has already run. On the server that write is skipped — the store is a
 *  process-wide singleton and would carry one request's design into the next — so the server render
 *  and the hydration pass read a per-render snapshot store from `ConfiguratorSnapshotProvider`
 *  instead (ADR 0133). The guard therefore asks the session store directly, never the hook, which
 *  under the provider would answer the snapshot and skip the write.
 *
 *  This closes backlog 98 (the seeded L showing before the loaded design). It does not close backlog
 *  83, whose warning on a client transition between two designs comes from the write staying in
 *  render. */
export function HydrateAndConfigure({
  design,
  designId,
  revision,
}: {
  design: Design;
  designId: DesignId;
  revision: DesignRevision;
}) {
  // `"checking"`, not a guess in either direction: this page's own request could not have carried
  // the `Path=/api/designs/{id}` write-token cookie, so nothing here knows. `useWriteAccessProbe`
  // below asks the one route that does, and until it answers the panel offers no edit — see
  // `WriteAccess`.
  const loaded = { design, designId, revision, canWrite: "checking" } as const;
  hydrateSessionStoreInBrowser(
    loaded,
    (session) => session.designId === designId,
  );
  useWriteAccessProbe(designId);
  return (
    <ConfiguratorSnapshotProvider loaded={loaded}>
      <ConfigureScreen />
    </ConfiguratorSnapshotProvider>
  );
}

/**
 * Asks whether this browser may edit the design it just loaded, and tells the store — including
 * when it cannot find out.
 *
 * It is a second request, and it is not avoidable from the server: the write credential is a
 * cookie scoped `Path=/api/designs/{id}` (ADR 0019 decision 1, `write-token.ts`), so the request
 * that rendered `/[locale]/d/{id}` never carried it and `cookies()` there would answer "no credential" for
 * everyone — the design's own author included. `GET /api/designs/{id}` is the one path the browser
 * does send it to, and it answers `canWrite` beside the design at no extra round trip *of its own*.
 *
 * **A failed probe is reported, not swallowed** (wave S7, finding WEB-002). It used to change
 * nothing at all, which left the store on an optimistic default the panel read as writable: a
 * reader on a blocked API could then edit, believe it saved, and find out only when the write was
 * refused — `DEVELOPMENT-SPEC.md` §9's "never offer what cannot be satisfied", inverted. The panel
 * now shows a retryable notice instead. Guessing "read-only" would have been the opposite error,
 * telling an author they may not edit their own kitchen on the strength of a dropped packet;
 * neither guess is made.
 *
 * **`canWrite` is both this effect's output and its trigger**, which is what makes the retry one
 * mechanism rather than two: `"checking"` means "a check is wanted and none has answered", so
 * `retryWriteAccessCheck` restoring it is the whole of asking again. Every other value is an
 * answered question and runs nothing — a boolean the server gave, or the `"check-failed"` this
 * effect just recorded, which would otherwise re-probe in a loop.
 *
 * Nothing here authorises anything. `canWrite` remains advisory (ADR 0019 decision 1) — the write
 * token the server checks is untouched, and a write that turns out not to be allowed still lands
 * as `unauthorized`.
 */
function useWriteAccessProbe(designId: DesignId): void {
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  useEffect(() => {
    if (canWrite !== "checking") return;
    let isCurrent = true;
    void sessionConfigurationRepository
      .loadWithAccess(designId)
      // Only `canWrite` is taken. The probe's response also carries a revision, and it is
      // deliberately discarded: it may be newer than the document this page rendered, and adopting
      // a revision without the document it belongs to is precisely what would let this browser
      // overwrite an edit it has never seen (WEB-003).
      .then(({ canWrite }) => {
        if (isCurrent)
          useConfiguratorStore.getState().applyWriteAccess({
            designId,
            canWrite,
          });
      })
      .catch(() => {
        if (isCurrent)
          useConfiguratorStore.getState().failWriteAccessCheck({ designId });
      });
    return () => {
      isCurrent = false;
    };
  }, [designId, canWrite]);
}
