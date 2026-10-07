"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import { useContent } from "@/i18n/use-content";
import {
  ConfiguratorSnapshotProvider,
  hydrateSessionStoreInBrowser,
} from "@/store/configurator-snapshot";

/** Puts the loaded design in the store for the review, the way `HydrateAndConfigure` does for the editor (ADR 0133):
 *  written in the browser during render, guarded by the id, so arriving from the editor keeps the store the editor
 *  was already editing. Server render and hydration read the provider's snapshot instead.
 *
 *  `canWrite` stays `"checking"`: this page's request carries no write-token cookie either, and the editor's
 *  `HydrateAndConfigure` probes for it on mount, so a return to the editor finds the question still open rather
 *  than answered wrongly. */
export function HydrateAndReview({
  design,
  designId,
  revision,
}: {
  design: Design;
  designId: DesignId;
  revision: DesignRevision;
}) {
  const loaded = { design, designId, revision, canWrite: "checking" } as const;
  hydrateSessionStoreInBrowser(
    loaded,
    (session) => session.designId === designId,
  );
  return (
    <ConfiguratorSnapshotProvider loaded={loaded}>
      <ReviewHeading />
    </ConfiguratorSnapshotProvider>
  );
}

function ReviewHeading() {
  return (
    <main>
      <h1>{useContent().review.title}</h1>
    </main>
  );
}
