"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import { HydrateStoredDesign } from "@/app/d/[id]/hydrate-stored-design";
import { ContactScreen } from "@/contact/contact-screen";

/**
 * The contact page of a stored design, over the copy `HydrateStoredDesign` decides this tab shows (ADR 0148 E3, E3a).
 * It asks the server for nothing, so arriving from the review costs the page's own request and no more. The request
 * this page sends carries the store's revision, never `revision` here.
 */
export function HydrateAndContact({
  design,
  designId,
  revision,
  isSendable,
}: {
  design: Design;
  designId: DesignId;
  revision: DesignRevision;
  isSendable: boolean;
}) {
  return (
    <HydrateStoredDesign
      design={design}
      designId={designId}
      revision={revision}
    >
      <ContactScreen designId={designId} isSendable={isSendable} />
    </HydrateStoredDesign>
  );
}
