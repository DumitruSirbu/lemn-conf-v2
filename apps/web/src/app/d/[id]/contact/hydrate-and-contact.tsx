"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import { HydrateStoredDesign } from "@/app/d/[id]/hydrate-stored-design";
import { ContactScreen } from "@/contact/contact-screen";
import type { SentReferenceAnswer } from "@/done/result-to-show";

/**
 * The contact page of a stored design, over the copy `HydrateStoredDesign` decides this tab shows (ADR 0148 E3).
 * The request this page sends carries the store's revision, never `revision` here: that is only what `sentReference`
 * answers for.
 */
export function HydrateAndContact({
  design,
  designId,
  revision,
  isSendable,
  sentReference,
}: {
  design: Design;
  designId: DesignId;
  revision: DesignRevision;
  isSendable: boolean;
  sentReference: SentReferenceAnswer;
}) {
  return (
    <HydrateStoredDesign
      design={design}
      designId={designId}
      revision={revision}
    >
      <ContactScreen
        designId={designId}
        loadedRevision={revision}
        isSendable={isSendable}
        sentReference={sentReference}
      />
    </HydrateStoredDesign>
  );
}
