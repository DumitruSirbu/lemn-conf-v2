// **1C's one clock** (C-7F2-1, extended by the coordinator on 2026-09-21): typing has paused once
// `URL_SETTLE_MS` passes with no keystroke. The settle interval is reused rather than restated, so the
// pause the customer sees and the pause the URL is written on are one number. What the pause decides
// is `one-c-surfaces.ts`'s; this hook only keeps the time.
import { useEffect, useRef, useState } from "react";

import { NOT_TYPING, type TypingState } from "./one-c-surfaces";
import type { RoomDraft } from "./room-draft";
import { URL_SETTLE_MS } from "./room-query-sync";

/** One edit the customer made: the draft it replaced and the draft it produced. */
export interface DraftEdit {
  readonly before: RoomDraft;
  readonly after: RoomDraft;
}

export interface TypingPause {
  /** `isTyping` only while the draft on screen is still the one the burst produced. */
  readonly typing: TypingState;
  /** A keystroke: starts a burst, or continues the one this draft belongs to, and restarts the pause. */
  readonly noteKeystroke: (keystroke: DraftEdit) => void;
  /** A chip or the corner: carried by a burst already running, and starting none. */
  readonly noteEdit: (edit: DraftEdit) => void;
  /** The pause, reached now rather than on the clock. */
  readonly endPause: () => void;
}

/**
 * The burst of typing the customer is in, over the draft on screen.
 *
 * **The timer starts in the keystroke's own handler**, before the render that follows it — and so
 * before the settle's write, which starts in an effect after that render.
 *
 * **An arrival is not typing** (QA finding F1, 2026-09-22). A burst holds only the draft its own edits
 * produced; when reconciliation re-seeds the draft from a traversal, the draft on screen is no longer
 * that one, the burst is over, and the arrived room's 1C shows at once. **This rests on
 * `reconcileRoomDraft` returning the same draft object for our own echo**, so an echo does not end a
 * burst — `room-query-sync.test.ts` pins that identity.
 */
export function useTypingPause(draft: RoomDraft): TypingPause {
  const [burst, setBurst] = useState<TypingState>(NOT_TYPING);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(
    () => () => {
      clearTimeout(pauseTimer.current);
    },
    [],
  );

  function noteKeystroke({ before, after }: DraftEdit): void {
    clearTimeout(pauseTimer.current);
    setBurst((current) =>
      isBurstOf(current, before)
        ? { ...current, draftInBurst: after }
        : { isTyping: true, draftBeforeTyping: before, draftInBurst: after },
    );
    pauseTimer.current = setTimeout(() => {
      setBurst(NOT_TYPING);
    }, URL_SETTLE_MS);
  }

  function noteEdit({ before, after }: DraftEdit): void {
    setBurst((current) =>
      isBurstOf(current, before)
        ? { ...current, draftInBurst: after }
        : current,
    );
  }

  function endPause(): void {
    clearTimeout(pauseTimer.current);
    setBurst(NOT_TYPING);
  }

  const typing = isBurstOf(burst, draft) ? burst : NOT_TYPING;
  return { typing, noteKeystroke, noteEdit, endPause };
}

/** Whether a burst is running and the draft is the one it last produced. */
function isBurstOf(burst: TypingState, draft: RoomDraft): boolean {
  return burst.isTyping && burst.draftInBurst === draft;
}
