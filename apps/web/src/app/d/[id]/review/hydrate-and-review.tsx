"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import { HydrateStoredDesign } from "@/app/d/[id]/hydrate-stored-design";
import { ReviewScreen } from "@/app/d/[id]/review/review-screen";

/** The review of a stored design, over the copy `HydrateStoredDesign` decides this tab shows (ADR 0133). */
export function HydrateAndReview({
  design,
  designId,
  revision,
}: {
  design: Design;
  designId: DesignId;
  revision: DesignRevision;
}) {
  return (
    <HydrateStoredDesign
      design={design}
      designId={designId}
      revision={revision}
    >
      <ReviewScreen designId={designId} />
    </HydrateStoredDesign>
  );
}
