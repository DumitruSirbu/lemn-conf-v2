"use client";

import { useSyncExternalStore } from "react";

/**
 * `false` in the server's HTML and while the client hydrates, `true` after. A form's submit stays disabled until then,
 * so a press before the page's script has run cannot post the form to its own address; anything portalled into the
 * document waits for it for the same reason (there is no document on the server).
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

function subscribeToNothing(): () => void {
  return () => undefined;
}
