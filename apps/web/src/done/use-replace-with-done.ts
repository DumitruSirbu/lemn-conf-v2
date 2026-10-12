import type { DesignId } from "@lemnaria/configurator-domain";
import { useEffect, useRef } from "react";

import { useRouter } from "@/i18n/navigation";
import { doneHref } from "@/review/design-hrefs";

// The one router call of the contact flow (8M.3). It replaces the contact page's own history entry, so Back from the
// confirmation lands on the review and never on a form that could be sent again, and the history does not grow. Not a
// push, which would leave that form one step back; and not `history.replaceState`, which Next would restore as the
// contact page's tree under the confirmation's address. The address is `doneHref` of the design's id and carries
// nothing the customer typed. `done/` is scanned for router calls and this is the one file the scan lets name one.

/**
 * Leaves for the design's confirmation, once, when the component that calls it mounts. The contact page mounts that
 * component only for a request answered *sent*, so a failed, refused or pending one never reaches the router.
 */
export function useReplaceWithDone(designId: DesignId): void {
  const router = useRouter();
  const hasLeft = useRef(false);

  useEffect(() => {
    if (hasLeft.current) return;
    hasLeft.current = true;
    router.replace(doneHref(designId));
  }, [router, designId]);
}
