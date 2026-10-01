"use client";

// **A wall's help control on frame 1B** (wave 7A3, owner ruling Q-7A3-1): a button at the right end of
// the wall's label row, above the unit (owner ruling 2026-09-17), that opens the explanation of what
// number to type. Which explanation, and in which words, is `dimensions-form.tsx`'s decision — this
// file receives resolved copy and never reads a catalogue.
import { useCallback, useRef, useState } from "react";

import { useDismissOnOutsidePointerOrEscape } from "@/lib/use-dismiss-on-outside-pointer-or-escape";

import type { WallLengthField } from "./dimensions-form";
import styles from "./room.module.css";

export interface WallLengthHelpProps {
  readonly wall: WallLengthField;
  /** The explanation's id, which the wall's input also names in `aria-describedby`. */
  readonly helpId: string;
  readonly accessibleName: string;
  readonly explanation: string;
}

/**
 * **A toggletip, not a hover tooltip**: a real button that opens on click, tap, Enter or Space and
 * says so through `aria-expanded`, because a phone has no hover (engineering conventions: no
 * hover-only control). It closes on a second press, on Escape wherever focus is, on a pointer press
 * outside it, and when focus leaves it — so two can never be open from the keyboard at once.
 *
 * The explanation stays in the tree while closed, `hidden`, because the wall's input names it in
 * `aria-describedby`. Nothing here is an error state: no `aria-invalid`, no alert role, no red.
 *
 * **The explanation takes focus (`tabIndex={-1}`)**, so a press on its text keeps focus inside this
 * root. Without it Chrome moves focus from the button to `body`, the blur arrives with no related
 * target, and the explanation closes under the customer's finger. `-1` keeps it out of the Tab order.
 */
export function WallLengthHelp({
  wall,
  helpId,
  accessibleName,
  explanation,
}: WallLengthHelpProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useDismissOnOutsidePointerOrEscape({ rootRef, isOpen, dismiss: close });

  return (
    <span
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <button
        type="button"
        className={styles.lengthHelpButton}
        aria-label={accessibleName}
        aria-expanded={isOpen}
        aria-controls={helpId}
        data-testid={`room-length-help-${wall}`}
        onClick={() => {
          setIsOpen(!isOpen);
        }}
      >
        <HelpGlyph />
      </button>
      <span
        id={helpId}
        className={styles.lengthHelpText}
        tabIndex={-1}
        hidden={!isOpen}
        data-testid={`room-length-help-text-${wall}`}
      >
        {explanation}
      </span>
    </span>
  );
}

/** An *i* in a ring, drawn in the accent ink. `aria-hidden`, because the button's name says what it
 *  opens. */
function HelpGlyph() {
  return (
    <svg
      className={styles.lengthHelpGlyph}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" stroke="var(--accent)" strokeWidth="1.5" />
      <rect x="7.25" y="7" width="1.5" height="5" fill="var(--accent)" />
      <rect x="7.25" y="4" width="1.5" height="1.5" fill="var(--accent)" />
    </svg>
  );
}
