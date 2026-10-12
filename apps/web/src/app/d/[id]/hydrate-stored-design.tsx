"use client";

import type { ReactNode } from "react";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import {
  ConfiguratorSnapshotProvider,
  hydrateSessionStoreInBrowser,
} from "@/store/configurator-snapshot";
import { holdsTheNewestCopy, writeAccessHeldFor } from "@/store/newest-copy";

/**
 * Puts the loaded design in the store and shows `children` over it, the way `HydrateAndConfigure` does for the editor
 * (ADR 0133): written in the browser during render, so arriving from the editor keeps the store the editor was
 * editing. Which copy it shows is decided from the two this tab holds, with no request: an unsaved edit is kept, and a
 * clean store is kept unless the page is newer (a page restored by Back or Forward can be older). The held answer
 * about write access is carried over, because it is a fact about the browser and the design, not about the copy
 * (ADR 0148 E3, E3a). The screen is the caller's, so each door keeps its own and none can drift from this rule.
 */
export function HydrateStoredDesign({
  design,
  designId,
  revision,
  children,
}: {
  design: Design;
  designId: DesignId;
  revision: DesignRevision;
  children: ReactNode;
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
      {children}
    </ConfiguratorSnapshotProvider>
  );
}
