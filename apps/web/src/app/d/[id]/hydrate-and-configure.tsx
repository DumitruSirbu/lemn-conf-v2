"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import { useEffect } from "react";

import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";
import { sessionConfigurationRepository } from "@/persistence/fetch-configuration-repository";
import { useConfiguratorStore } from "@/store/configurator-store";

/** Replaces the store with a loaded design before the configurator screen mounts, so the first
 *  frame it renders is already the loaded design — never a flash of the seeded fixture. Hydrating
 *  during render (guarded by the id comparison, not an effect) is what makes that ordering hold:
 *  by the time `ConfigureScreen` reads the store for its own first render, this component's body
 *  has already run. */
export function HydrateAndConfigure({
  design,
  designId,
}: {
  design: Design;
  designId: DesignId;
}) {
  const currentDesignId = useConfiguratorStore((state) => state.designId);
  if (currentDesignId !== designId) {
    // `"checking"`, not a guess in either direction: this page's own request could not have carried
    // the `Path=/api/designs/{id}` write-token cookie, so nothing here knows. `useWriteAccessProbe`
    // below asks the one route that does, and until it answers the panel offers no edit — see
    // `WriteAccess`.
    useConfiguratorStore
      .getState()
      .hydrate({ design, designId, canWrite: "checking" });
  }
  useWriteAccessProbe(designId);
  return <ConfigureScreen />;
}

/**
 * Asks whether this browser may edit the design it just loaded, and tells the store — including
 * when it cannot find out.
 *
 * It is a second request, and it is not avoidable from the server: the write credential is a
 * cookie scoped `Path=/api/designs/{id}` (ADR 0019 decision 1, `write-token.ts`), so the request
 * that rendered `/d/{id}` never carried it and `cookies()` there would answer "no credential" for
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
