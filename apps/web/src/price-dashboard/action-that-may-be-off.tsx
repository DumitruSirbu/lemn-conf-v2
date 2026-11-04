"use client";

import { useId, type ReactNode } from "react";

// An action that stays in place when it cannot be taken, and why it cannot, drawn the same for every kind of item.

/** Why each action on an item is off; absent, it can be taken. An item the draft deletes cannot be switched, and
 *  nothing is offered of it once the deletion is published. */
export interface ActionReasons {
  readonly switchReason: string | undefined;
  readonly deleteReason: string | undefined;
}

export interface ActionThatMayBeOffProps {
  /** Why the action is off; absent, it can be pressed. */
  readonly reason: string | undefined;
  /** Said under the action while it can be pressed. */
  readonly restingNote?: string | undefined;
  readonly onPress: () => void;
  readonly buttonClassName: string | undefined;
  readonly noteClassName: string | undefined;
  readonly noteTag: "p" | "span";
  readonly noteTestId?: string | undefined;
  /** Set where the action is a switch: whether it is on. */
  readonly switchState?: boolean | undefined;
  readonly children: ReactNode;
}

/** An action that stays in place when it cannot be taken: off, it is not pressed, and the reason is said under it. */
export function ActionThatMayBeOff({
  reason,
  restingNote,
  onPress,
  buttonClassName,
  noteClassName,
  noteTag: Note,
  noteTestId,
  switchState,
  children,
}: ActionThatMayBeOffProps) {
  const noteId = useId();
  const isOff = reason !== undefined;
  const note = reason ?? restingNote;
  return (
    <>
      <button
        type="button"
        role={switchState === undefined ? undefined : "switch"}
        aria-checked={switchState}
        className={buttonClassName}
        aria-disabled={isOff ? true : undefined}
        aria-describedby={note === undefined ? undefined : noteId}
        onClick={isOff ? undefined : onPress}
      >
        {children}
      </button>
      {note === undefined ? null : (
        <Note id={noteId} className={noteClassName} data-testid={noteTestId}>
          {note}
        </Note>
      )}
    </>
  );
}
