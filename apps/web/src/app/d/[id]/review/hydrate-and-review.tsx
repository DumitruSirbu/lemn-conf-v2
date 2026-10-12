"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import { ReviewScreen } from "@/app/d/[id]/review/review-screen";
import {
  ConfiguratorSnapshotProvider,
  hydrateSessionStoreInBrowser,
} from "@/store/configurator-snapshot";
import { holdsTheNewestCopy, writeAccessHeldFor } from "@/store/newest-copy";
import { isGreaterRevision } from "@/store/revision-order";

/**
 * Puts the loaded design in the store and shows the review of it, the way `HydrateAndConfigure` does for the editor
 * (ADR 0133): written in the browser during render, so arriving from the editor keeps the store the editor was
 * editing. Which copy it shows is decided from the two this tab holds, with no request: an unsaved edit is kept, and a
 * clean store is kept unless the page is newer (a page restored by Back or Forward can be older). The held answer
 * about write access is carried over, because it is a fact about the browser and the design, not about the copy.
 */
export function HydrateAndReview({
  design,
  designId,
  revision,
}: {
  design: Design;
  designId: DesignId;
  revision: DesignRevision;
}) {
  const loaded = {
    design,
    designId,
    revision,
    canWrite: writeAccessHeldFor(designId),
  } as const;
  hydrateSessionStoreInBrowser(loaded, (session) =>
    holdsTheNewestCopy(session, { designId, revision }),
  );
  return (
    <ConfiguratorSnapshotProvider loaded={loaded}>
      <ReviewScreen designId={designId} />
    </ConfiguratorSnapshotProvider>
  );
}

export { isGreaterRevision };
