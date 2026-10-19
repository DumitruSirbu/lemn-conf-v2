"use client";

import { useCallback, useRef, useState } from "react";

import type { RemoveResult } from "./use-kitchen-actions";
import type { ListFailure } from "./use-kitchens";

// The state of a dialog that asks to take a kitchen off the list (delete a draft, hide a sent kitchen): ready, out, or
// failed with the reason, which the dialog tells in place and asks again from.

export type RemoveStatus =
  | { readonly kind: "ready" }
  | { readonly kind: "busy" }
  | { readonly kind: "failed"; readonly failure: ListFailure };

export interface RemoveKitchen {
  readonly status: RemoveStatus;
  readonly confirm: () => void;
}

/**
 * `remove` is the act. The dialog closes once the kitchen is off the list, or the card was corrected to what the server
 * holds (the toast says so); a failure keeps it open. A request that left the document (sign-in, forbidden) leaves the
 * dialog busy: nothing it could do is of use.
 */
export function useRemoveKitchen(
  remove: () => Promise<RemoveResult>,
  onClose: () => void,
): RemoveKitchen {
  const isSendingRef = useRef(false);
  const [status, setStatus] = useState<RemoveStatus>({ kind: "ready" });

  const confirm = useCallback(() => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    setStatus({ kind: "busy" });
    void remove().then((result) => {
      if (result.kind === "left") return;
      isSendingRef.current = false;
      if (result.kind === "failed") {
        setStatus({ kind: "failed", failure: result.failure });
        return;
      }
      onClose();
    });
  }, [remove, onClose]);

  return { status, confirm };
}
