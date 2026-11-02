"use client";

import { useCallback, useMemo, useRef } from "react";

/**
 * Typing, opening and cancelling each make a write still on its way an answer to a field that is no longer the one on
 * screen: `moveOn` says the person has moved on, and `begin` hands a write the question to ask of its answer.
 */
export interface LateAnswerGuard {
  readonly moveOn: () => void;
  /** Call as a write is sent; the function it returns says whether the person has moved on since. */
  readonly begin: () => () => boolean;
}

export function useLateAnswerGuard(): LateAnswerGuard {
  const moveCountRef = useRef(0);
  const moveOn = useCallback(() => {
    moveCountRef.current += 1;
  }, []);
  const begin = useCallback(() => {
    const moveCountWhenSent = moveCountRef.current;
    return () => moveCountRef.current !== moveCountWhenSent;
  }, []);
  return useMemo(() => ({ moveOn, begin }), [moveOn, begin]);
}
