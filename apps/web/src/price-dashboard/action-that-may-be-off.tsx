"use client";

import { useId, type ReactNode } from "react";

// An action that stays in place when it cannot be taken, and why it cannot, drawn the same for every kind of item.

/** Why each action on an item is off; absent, it can be taken. An item the draft deletes cannot be activated or
 *  deactivated, and nothing is offered of it once the deletion is published. */
export interface ActionReasons {
  readonly switchReason: string | undefined;
  readonly deleteReason: string | undefined;
}

export interface ActionThatMayBeOffProps {
  /** Why the action is off; absent, it can be pressed. */
  readonly reason: string | undefined;
  readonly onPress: () => void;
  readonly buttonClassName: string | undefined;
  readonly noteClassName: string | undefined;
  readonly noteTag: "p" | "span";
  readonly noteTestId?: string | undefined;
  /** The id of text elsewhere that describes the action; read after the reason while the action is off. */
  readonly describedById?: string | undefined;
  readonly children: ReactNode;
}

/** An action that stays in place when it cannot be taken: off, it is not pressed, and the reason is said under it. */
export function ActionThatMayBeOff({
  reason,
  onPress,
  buttonClassName,
  noteClassName,
  noteTag: Note,
  noteTestId,
  describedById,
  children,
}: ActionThatMayBeOffProps) {
  const noteId = useId();
  const isOff = reason !== undefined;
  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        aria-disabled={isOff ? true : undefined}
        aria-describedby={descriptionIds(
          isOff ? noteId : undefined,
          describedById,
        )}
        onClick={isOff ? undefined : onPress}
      >
        {children}
      </button>
      {isOff ? (
        <Note id={noteId} className={noteClassName} data-testid={noteTestId}>
          {reason}
        </Note>
      ) : null}
    </>
  );
}

function descriptionIds(...ids: (string | undefined)[]): string | undefined {
  const present = ids.filter((id) => id !== undefined);
  return present.length === 0 ? undefined : present.join(" ");
}
