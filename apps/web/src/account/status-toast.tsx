"use client";

import { useEffect, useRef } from "react";

import styles from "./account.module.css";
import type { ToastMessage } from "./use-toast-message";

// The line that says a signed-in act has happened ("Copie creată"), drawn at the foot of the screen (Lot 2 frames,
// `role="status"`). It is the screen's only account of the act, so it must outlast a glance.

/** How long a message stays: past the five-second floor Lot 2's plan sets for a message that goes on its own, so a
 *  person who looked away when it arrived can still read it. */
const TOAST_VISIBLE_MS = 6_000;

export interface StatusToastProps {
  /** What happened. `undefined` while nothing has: the region stays mounted and empty. */
  readonly message: ToastMessage | undefined;
  /** Called once the message has been up for its time. The screen clears `message` in answer. */
  readonly onElapsed: () => void;
}

/**
 * The region is mounted before its first message and only its text comes and goes: a live region that appears
 * together with its words is not reliably announced. A new message restarts the clock, and one with the same words but
 * another `id` is announced again.
 */
export function StatusToast({ message, onElapsed }: StatusToastProps) {
  useDismissAfterVisibleTime(message, onElapsed);
  return (
    <div role="status" className={styles.toastRegion}>
      {message === undefined ? null : (
        <p key={message.id} className={styles.toast}>
          {message.text}
        </p>
      )}
    </div>
  );
}

function useDismissAfterVisibleTime(
  message: ToastMessage | undefined,
  onElapsed: () => void,
): void {
  // The latest callback is read when the time is up, so a screen passing an inline function does not restart the clock.
  const onElapsedRef = useRef(onElapsed);
  useEffect(() => {
    onElapsedRef.current = onElapsed;
  }, [onElapsed]);
  const messageId = message?.id;
  useEffect(() => {
    if (messageId === undefined) return undefined;
    const timer = setTimeout(() => {
      onElapsedRef.current();
    }, TOAST_VISIBLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [messageId]);
}
