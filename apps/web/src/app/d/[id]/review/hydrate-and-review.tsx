"use client";

import type { Design, DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import { ReviewScreen } from "@/app/d/[id]/review/review-screen";
import {
  ConfiguratorSnapshotProvider,
  hydrateSessionStoreInBrowser,
} from "@/store/configurator-snapshot";
import type { ConfiguratorState } from "@/store/configurator-store";

/**
 * Puts the loaded design in the store and shows the review of it, the way `HydrateAndConfigure` does for the editor
 * (ADR 0133): written in the browser during render, so arriving from the editor keeps the store the editor was already
 * editing. Server render and hydration read the provider's snapshot instead.
 *
 * Which copy the review shows is decided without a request, from the two this tab holds. The store is kept when it
 * holds an edit not yet saved, and when it is clean but not older than the page (a page restored by Back or Forward
 * can be older than the store). A clean store older than the page was stale, and the page's copy replaces it.
 *
 * `canWrite` stays `"checking"`: this page's request carries no write-token cookie either, and the editor's
 * `HydrateAndConfigure` probes for it on mount, so a return to the editor finds the question still open rather
 * than answered wrongly.
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
  const loaded = { design, designId, revision, canWrite: "checking" } as const;
  hydrateSessionStoreInBrowser(loaded, (session) =>
    holdsTheNewestCopy(session, { designId, revision }),
  );
  return (
    <ConfiguratorSnapshotProvider loaded={loaded}>
      <ReviewScreen designId={designId} />
    </ConfiguratorSnapshotProvider>
  );
}

/**
 * Whether the store already holds this design at least as new as the page does, or holds something the page must not
 * replace. "Clean" is `savedDesign`'s: the design on screen is the one the server last confirmed, which cannot be so
 * while an edit is queued or a save is in flight.
 */
function holdsTheNewestCopy(
  session: ConfiguratorState,
  page: { readonly designId: DesignId; readonly revision: DesignRevision },
): boolean {
  if (session.designId !== page.designId) return false;
  const holdsAnUnsavedEdit = session.design !== session.savedDesign;
  if (holdsAnUnsavedEdit) return true;
  return !isGreaterRevision(page.revision, session.revision);
}

/**
 * Whether revision `candidate` is greater than `held`, compared as the whole numbers they are and never turned into
 * a JavaScript `number` (`design-revision.ts`: a `bigint` does not survive one). A revision is a digit run with no
 * leading zero, so the longer is the greater and equal lengths compare digit by digit. Anything that is not such a
 * run, or a store with no revision, is not called greater than a revision the store holds, so a copy is never
 * replaced on the strength of a value that could not be compared; with no revision held at all, the page's wins.
 */
export function isGreaterRevision(
  candidate: string,
  held: string | null,
): boolean {
  if (held === null) return true;
  if (!isDigitRun(candidate) || !isDigitRun(held)) return false;
  if (candidate.length !== held.length) return candidate.length > held.length;
  return candidate > held;
}

function isDigitRun(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}
