"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import { HydrateStoredDesign } from "@/app/d/[id]/hydrate-stored-design";
import { DoneScreen } from "@/done/done-screen";
import type { SentReferenceAnswer } from "@/done/result-to-show";

/**
 * The confirmation of a design's sent request, over the copy `HydrateStoredDesign` decides this tab shows (ADR 0148 E3,
 * E3a). It asks the server for nothing: the answer about the request is the page's own plain value. `revision` is the
 * stored design's, which the request named and the screen's picture shows.
 */
export function HydrateAndDone({
  design,
  designId,
  revision,
  sentReference,
}: {
  design: Design;
  designId: DesignId;
  revision: DesignRevision;
  sentReference: SentReferenceAnswer;
}) {
  return (
    <HydrateStoredDesign
      design={design}
      designId={designId}
      revision={revision}
    >
      <DoneScreen
        designId={designId}
        revision={revision}
        sentReference={sentReference}
      />
    </HydrateStoredDesign>
  );
}
