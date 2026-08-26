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
    // `"unknown"`, not a guess in either direction: this page's own request could not have carried
    // the `Path=/api/designs/{id}` write-token cookie, so nothing here knows. `useWriteAccessProbe`
    // below asks the one route that does. The panel reads `"unknown"` as writable — see
    // `WriteAccess`.
    useConfiguratorStore
      .getState()
      .hydrate({ design, designId, canWrite: "unknown" });
  }
  useWriteAccessProbe(designId);
  return <ConfigureScreen />;
}

/**
 * Asks whether this browser may edit the design it just loaded, and tells the store.
 *
 * It is a second request, and it is not avoidable from the server: the write credential is a
 * cookie scoped `Path=/api/designs/{id}` (ADR 0019 decision 1, `write-token.ts`), so the request
 * that rendered `/d/{id}` never carried it and `cookies()` there would answer "no credential" for
 * everyone — the design's own author included. `GET /api/designs/{id}` is the one path the browser
 * does send it to, and it answers `canWrite` beside the design at no extra round trip *of its own*.
 *
 * A failed probe deliberately changes nothing: the store keeps its optimistic default, and a write
 * that turns out not to be allowed still lands as `unauthorized`, which the panel reads as
 * read-only. Guessing "read-only" because a network request failed would tell an author they may
 * not edit their own kitchen on the strength of a dropped packet.
 */
function useWriteAccessProbe(designId: DesignId): void {
  useEffect(() => {
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
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, [designId]);
}
