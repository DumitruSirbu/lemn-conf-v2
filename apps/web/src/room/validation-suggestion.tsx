"use client";

// **D1C's actionable suggestion** (wave 7L D8, `Desktop.dc.html:247-253`): the clause both shells
// draw, unchanged from 7F2/7J, and — desktop only — the *Sugestii* card the milestone's own criterion
// asks for (*"Desktop uses its extra space for an actionable suggestion, not for more prose"*).
// Whether either shows is `room-issue-model.ts`'s `isLinearSuggested`, unedited by this wave; this
// file only draws the answer.
//
// **The card's handler is the *Liniară* chip's own** (`room-screen.tsx`'s `chooseShape`) — it writes,
// composes and navigates nothing the chip would not (D8, 7L criterion 12). This component never calls
// the domain or the router itself.
//
// **Out of the live region** (D9, closing 7F2 R1.4 / 7J D10): the clause used to render inside 1C's
// single `role="status"` region, where it could announce alone with no context the moment a *field*
// reason — never live — was what actually made it true. It renders here instead, as a plain node
// between `one-c-status.tsx`'s two regions, and is described on each offending field's own input
// through `aria-describedby`, after the field's reason — which is how frame 1C's sentence reads.
import { useTranslations } from "next-intl";

import { LINEAR_SUGGESTION_MESSAGE_KEY } from "./room-issue-model";
import styles from "./room.module.css";

export interface ValidationSuggestionProps {
  readonly isShown: boolean;
  /** The clause's id, which an offending field's `aria-describedby` names after its own reason
   *  (D9). Ignored while `isShown` is false. */
  readonly id: string;
  /** The *Liniară* chip's own handler — the card writes, composes and navigates nothing it would
   *  not. Called with no argument: unlike the chip, the card always means *linear*. */
  readonly onChooseLinear: () => void;
}

export function ValidationSuggestion({
  isShown,
  id,
  onChooseLinear,
}: ValidationSuggestionProps) {
  const translate = useTranslations();

  if (!isShown) return null;

  return (
    <div className={styles.suggestionGroup} data-testid="room-suggestion-group">
      <p
        id={id}
        className={styles.suggestion}
        data-testid="room-linear-suggestion"
      >
        {translate(LINEAR_SUGGESTION_MESSAGE_KEY)}
      </p>
      {/* D1C's card (`:248-253`): hidden by the base shell, drawn from `room.module.css`'s desktop
          block (7L criterion 14 — layout-only, so the button carries no tab stop on the phone). */}
      <div className={styles.suggestionCard} data-testid="room-suggestion-card">
        <span className={styles.suggestionTitle}>
          {translate("room.suggestion.title")}
        </span>
        <button
          type="button"
          className={styles.suggestionAction}
          data-testid="room-suggestion-action"
          onClick={onChooseLinear}
        >
          <span>{translate("room.suggestion.switchToLinear")}</span>
          <span className={styles.suggestionArrow} aria-hidden="true">
            →
          </span>
        </button>
      </div>
    </div>
  );
}
