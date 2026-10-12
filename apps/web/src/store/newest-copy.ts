import type { DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";

import {
  useConfiguratorStore,
  type ConfiguratorState,
  type WriteAccess,
} from "./configurator-store";
import { isGreaterRevision } from "./revision-order";

/**
 * Whether the store already holds this design at least as new as the page does, or holds something the page must not
 * replace. "Clean" is `savedDesign`'s: the design on screen is the one the server last confirmed, which cannot be so
 * while an edit is queued or a save is in flight.
 */
export function holdsTheNewestCopy(
  session: ConfiguratorState,
  page: { readonly designId: DesignId; readonly revision: DesignRevision },
): boolean {
  if (session.designId !== page.designId) return false;
  const holdsAnUnsavedEdit = session.design !== session.savedDesign;
  if (holdsAnUnsavedEdit) return true;
  return !isGreaterRevision(page.revision, session.revision);
}

/**
 * The answer about write access the session store already holds for this design, else `"checking"`. Read only in the
 * browser: the server's store is never written (ADR 0133) and a request must not read another's.
 */
export function writeAccessHeldFor(designId: DesignId): WriteAccess {
  if (typeof window === "undefined") return "checking";
  const session = useConfiguratorStore.getState();
  return session.designId === designId ? session.canWrite : "checking";
}
