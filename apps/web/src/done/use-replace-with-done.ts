import type { DesignId } from "@lemnaria/configurator-domain";
import { useEffect, useRef } from "react";

import { useRouter } from "@/i18n/navigation";
import { doneHref } from "@/review/design-hrefs";

// Replace, never push (Back would reach a form that can be sent again) and never `history.replaceState` (Next would
// restore the contact tree under the new address). The one file the router scan lets name the router; see ADR 0160 D3.

/** Leaves for the design's confirmation, once, when the component that calls it mounts: mount it only for a *sent* answer. */
export function useReplaceWithDone(designId: DesignId): void {
  const router = useRouter();
  const hasLeft = useRef(false);

  useEffect(() => {
    if (hasLeft.current) return;
    hasLeft.current = true;
    router.replace(doneHref(designId));
  }, [router, designId]);
}
