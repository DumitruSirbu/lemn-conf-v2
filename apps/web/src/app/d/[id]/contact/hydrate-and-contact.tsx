"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import {
  ConfiguratorSnapshotProvider,
  hydrateSessionStoreInBrowser,
} from "@/store/configurator-snapshot";
import { holdsTheNewestCopy, writeAccessHeldFor } from "@/store/newest-copy";
import { ContactScreen } from "@/contact/contact-screen";

/**
 * Puts the loaded design in the store and shows the contact page of it, by the review's rule and the same two
 * functions (ADR 0148 E3, E3a): an unsaved edit is kept, a clean store is kept unless the page is newer, and the held
 * answer about write access is carried over. It asks the server for nothing, so arriving from the review costs the
 * page's own request and no more. The request this page sends carries the store's revision, never `revision` here.
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
      <ContactScreen designId={designId} isSendable={isSendable} />
    </ConfiguratorSnapshotProvider>
  );
}
