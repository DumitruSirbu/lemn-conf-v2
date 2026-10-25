"use client";

import { useRef, type ReactNode, type RefObject } from "react";

import { trapTab, useModalFocus } from "@/components/use-modal-focus";

import styles from "../account.module.css";

// The modal sheet "Sesiunea a expirat" is drawn in, for the editor's and for the staff pages': the host the modal behaviour
// holds, the scrim, the surface with its grabber, focus on open and back on close, the Tab ring. What it says and does is
// the caller's. A sheet is a sheet on a phone and a dialog on a desktop, by the stylesheet.
//
// Mount it as a direct child of the screen's `<main>`: the modal behaviour marks the other children of the `<main>` inert.

export interface SessionSheetShellProps {
  /** The id of the element that names the sheet. */
  readonly titleId: string;
  /** The ids of the elements that describe it, in reading order. */
  readonly describedBy: string;
  readonly testId: string;
  /** Where focus lands on open. */
  readonly initialFocusRef: RefObject<HTMLElement | null>;
  /** What Escape and the scrim do. */
  readonly dismiss: () => void;
  readonly children: ReactNode;
}

export function SessionSheetShell({
  titleId,
  describedBy,
  testId,
  initialFocusRef,
  dismiss,
  children,
}: SessionSheetShellProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useModalFocus({
    hostRef,
    initialFocusRef,
    focusFallbackRef: surfaceRef,
    dismiss,
    // Focus goes back to what had it on open, which no press put there: the sheet is opened by a refused request, not by
    // a control, so there is no opener to name as a fallback.
    returnFocus: {},
  });
  return (
    <div className={styles.dialogHost} ref={hostRef}>
      <div
        className={styles.dialogScrim}
        aria-hidden="true"
        onClick={dismiss}
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={styles.dialogSurface}
        data-testid={testId}
        onKeyDown={trapTab}
      >
        <span className={styles.dialogGrabber} aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
