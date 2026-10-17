"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import { useEffect } from "react";

import { ConfigureScreen } from "@/app/configurator/configure/configure-screen";
import { sessionConfigurationRepository } from "@/persistence/fetch-configuration-repository";
import { usePresetAuthoring } from "@/preset/preset-authoring-store";
import {
  ConfiguratorSnapshotProvider,
  hydrateSessionStoreInBrowser,
} from "@/store/configurator-snapshot";
import { useConfiguratorStore } from "@/store/configurator-store";

/** Puts the loaded design in front of the editor: the first server-rendered frame, React's hydration pass and
 *  every later render all show it. The session store is written here, in the browser during render, guarded by
 *  the id; the server render and the hydration pass read the provider's snapshot instead (ADR 0133,
 *  `hydrateSessionStoreInBrowser`). Known limitation: a client transition between two designs logs a dev-only
 *  React warning because the write stays in render (backlog 83). */
export function HydrateAndConfigure({
  design,
  designId,
  revision,
}: {
  design: Design;
  designId: DesignId;
  revision: DesignRevision;
}) {
  // `"checking"`, not a guess: this page's own request could not carry the `Path=/api/designs/{id}` write-token
  // cookie, so nothing here knows. `useWriteAccessProbe` asks the one route that does, and until it answers the
  // panel offers no edit (`WriteAccess`).
  const loaded = { design, designId, revision, canWrite: "checking" } as const;
  hydrateSessionStoreInBrowser(
    loaded,
    (session) => session.designId === designId,
  );
  useWriteAccessProbe(designId);
  usePresetAuthoringProbe(designId);
  return (
    <ConfiguratorSnapshotProvider loaded={loaded}>
      <ConfigureScreen />
    </ConfiguratorSnapshotProvider>
  );
}

/**
 * Asks whether this browser may edit the design it just loaded, and tells the store, including when it cannot find
 * out. The write credential is a cookie scoped `Path=/api/designs/{id}` (ADR 0019 decision 1, `write-token.ts`), so
 * the request that rendered the page never carried it and `cookies()` there would say "no credential" for the author
 * too; `GET /api/designs/{id}` is the one path that gets it and answers `canWrite` beside the design.
 *
 * A failed probe is reported, not swallowed: an optimistic default would let a reader on a blocked API edit and
 * believe it saved (DEVELOPMENT-SPEC §9: never offer what cannot be satisfied), and guessing "read-only" would be the
 * opposite error, so the panel shows a retryable notice. `canWrite` is both this effect's output and its trigger:
 * `"checking"` means a check is wanted and none has answered, so `retryWriteAccessCheck` restoring it is the whole of
 * asking again, while every other value runs nothing (the recorded `"check-failed"` would otherwise re-probe in a
 * loop). Nothing here authorises anything: `canWrite` is advisory.
 */
function useWriteAccessProbe(designId: DesignId): void {
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  useEffect(() => {
    if (canWrite !== "checking") return;
    let isCurrent = true;
    void sessionConfigurationRepository
      .loadWithAccess(designId)
      // The answer's design and revision are taken together, and only where the store holds no unsaved edit and the
      // answer's revision is the greater: a revision must never stand beside a document it was not read with (WEB-003).
      .then(({ design, revision, canWrite, canAuthorPresets }) => {
        if (!isCurrent) return;
        // Recorded first: `applyWriteAccess` moves `canWrite`, which `usePresetAuthoringProbe` watches, and it must
        // find this answer already there.
        usePresetAuthoring.getState().record({ designId, canAuthorPresets });
        useConfiguratorStore.getState().applyWriteAccess({
          designId,
          canWrite,
          stored: { design, revision },
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

/**
 * Asks the server whether this design may be saved as a preset, when the probe above has not already told it.
 *
 * `hydrateSessionStoreInBrowser` skips a design the session already holds, which is every design Step 1 has just minted
 * and handed over: its `canWrite` is already `true`, so `useWriteAccessProbe` never runs and nothing would record the
 * answer, and the control would be missing on the owner's main path until a reload. This is that gap's one read
 * (`GET /api/designs/{id}`, counted against the read limit once per design per session). It records `canAuthorPresets`
 * only and applies nothing else of the answer. A failed read leaves the control absent: the server has not said yes.
 */
function usePresetAuthoringProbe(designId: DesignId): void {
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const answeredDesignId = usePresetAuthoring((state) => state.designId);
  useEffect(() => {
    if (canWrite !== true || answeredDesignId === designId) return;
    let isCurrent = true;
    void sessionConfigurationRepository
      .loadWithAccess(designId)
      .then(({ canAuthorPresets }) => {
        if (isCurrent) {
          usePresetAuthoring.getState().record({ designId, canAuthorPresets });
        }
      })
      .catch(() => {
        // The control stays absent; nothing else depends on this answer.
      });
    return () => {
      isCurrent = false;
    };
  }, [designId, canWrite, answeredDesignId]);
}
