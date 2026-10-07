"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

export interface BackConfirmation {
  readonly isAsking: boolean;
  /** The back links' `onClick`: asks before the link navigates. */
  readonly ask: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** Closes the question and leaves the screen where it was. */
  readonly stay: () => void;
}

/**
 * Whether the customer has been asked, and where focus returns when they say no.
 *
 * Focus is restored in an effect rather than in `stay`: the dialog marks the rest of the screen
 * `inert` while it is open, and an inert link cannot take focus until the dialog has unmounted.
 */
export function useBackConfirmation(): BackConfirmation {
  const [isAsking, setIsAsking] = useState(false);
  const openerRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (!isAsking) openerRef.current?.focus();
  }, [isAsking]);

  const ask = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (isOpeningElsewhere(event)) return;
    event.preventDefault();
    openerRef.current = event.currentTarget;
    setIsAsking(true);
  }, []);

  const stay = useCallback(() => {
    setIsAsking(false);
  }, []);

  return { isAsking, ask, stay };
}

/** A new-tab or new-window click leaves this screen exactly as it is, so it has nothing to confirm. */
function isOpeningElsewhere(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}
