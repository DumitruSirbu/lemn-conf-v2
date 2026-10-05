"use client";

// The dialog the application asks "are you sure" in: one shell, two askers (the settings sheet's material-change
// confirm step, and the back-to-room link's `ConfirmationDialog`). Look, focus trap, Escape and inert background
// are written once, here, so the two cannot drift into two modals.

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import type { Editability } from "@/store/editability";

import styles from "./global-settings.module.css";

/** The tab ring inside the dialog. A radio group contributes exactly its checked member (the browser's own rule),
 *  so unchecked radios are not listed: they would put the trap's first and last stops on elements Tab never
 *  visits. `:not([disabled])` is on both halves because a disabled radio is no more tabbable than a disabled
 *  button. *Renunță* is never disabled, so the ring is never empty: leaving must stay possible on every surface. */
const TAB_STOP_SELECTOR =
  'button:not([disabled]), input[type="radio"]:checked:not([disabled])';

const SETTINGS_TEST_ID_PREFIX = "global-settings";

/** Where a confirmation's two actions stand in its footer. The settings sheet keeps `start`. */
export type ActionsAlignment = "start" | "center";

const FOOTER_CLASS_BY_ALIGNMENT: Readonly<Record<ActionsAlignment, string>> = {
  start: styles.footer ?? "",
  center: `${styles.footer ?? ""} ${styles.footerCentred ?? ""}`,
};

/** What a confirmation says: the consequence, and the names of its two ways out. */
export interface ConfirmationCopy {
  /** What the dialog is named by: the question the screen is asking. */
  readonly title: string;
  readonly body: string;
  /** Names the change, never *OK*. */
  readonly confirmLabel: string;
  /** Names what is kept, never *Anulează*. */
  readonly backLabel: string;
}

/** A confirmation's copy and its two actions, which arrive together or not at all. */
export interface ConfirmationStep {
  readonly view: ConfirmationCopy;
  readonly onConfirm: () => void;
  /** Back to where the question was asked, writing nothing. */
  readonly onStepBack: () => void;
}

/** Navigation is not a write, so a browser that may not edit the design may still leave it. `ConfirmStep`'s
 *  `editability` stays required so no caller forgets the access story. */
const NOT_LOCKED: Editability = { isReadOnly: false, disabledReason: "" };

/**
 * The confirmation as a dialog of its own: the settings sheet's scrim, surface and step without the sheet. Focus
 * lands on it on open; the caller returns focus to what opened it. Named by its heading, described by its body.
 */
export function ConfirmationDialog({
  view,
  testIdPrefix,
  onConfirm,
  onStay,
}: {
  readonly view: ConfirmationCopy;
  readonly testIdPrefix: string;
  readonly onConfirm: () => void;
  readonly onStay: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    surfaceRef.current?.focus();
  }, []);
  useEscapeToDismiss(true, onStay);
  useBackgroundInert(true, hostRef);

  return (
    <div className={styles.dialogHost} ref={hostRef}>
      <div
        className={styles.scrim}
        aria-hidden="true"
        data-testid={`${testIdPrefix}-scrim`}
        onClick={onStay}
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className={styles.surface}
        data-testid={`${testIdPrefix}-dialog`}
        onKeyDown={trapTab}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {view.title}
          </h2>
        </div>
        <ConfirmStep
          step={{ view, onConfirm, onStepBack: onStay }}
          editability={NOT_LOCKED}
          bodyId={bodyId}
          testIdPrefix={testIdPrefix}
          actionsAlignment="center"
        />
      </div>
    </div>
  );
}

/**
 * Escape dismisses wherever focus has got to, so this listens on the document rather than the surface
 * (`price-breakdown.tsx` records what binding it to the dialog cost). Registered only while open; the topmost
 * surface registers last and no handler calls `stopPropagation`. It calls whatever `dismiss` its asker hands it
 * (the sheet steps back one step at a time, ADR 0081 decision 3; the back confirmation's is Stay): a second
 * document-level handler inside either is what that decision refuses.
 */
export function useEscapeToDismiss(isOpen: boolean, dismiss: () => void): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    function dismissOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [isOpen, dismiss]);
}

/**
 * Marks the rest of the screen inert while the dialog is open: the half of "modal" a scrim cannot do, because a
 * keyboard can activate controls a pointer cannot. Applied to the screen's own children rather than a named list
 * of components, so a later change to where this mounts cannot leave a band operable. The band holding the
 * anchor stays live; every sibling band goes inert.
 */
export function useBackgroundInert(
  isOpen: boolean,
  anchorRef: RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    const anchor = anchorRef.current;
    const screenElement = anchor?.closest("main");
    if (!isOpen || !anchor || !screenElement) return undefined;
    const behind = [...screenElement.children].filter(
      (band) => !band.contains(anchor),
    );
    for (const band of behind) band.setAttribute("inert", "");
    return () => {
      for (const band of behind) band.removeAttribute("inert");
    };
  }, [isOpen, anchorRef]);
}

/**
 * The consequence and the two ways out of it. In the settings sheet it replaces the body and footer inside the one
 * dialog: no second scrim, focus trap or Escape listener (ADR 0081 decision 3). The figure and overflow warning go
 * with the footer, since a total beside *Schimbă materialul* suggests the price is what changes. It takes the same
 * editability as the choosing step: *Schimbă materialul* is the same commit as *Aplică* (it calls `applyPending`).
 */
export function ConfirmStep({
  step,
  editability,
  bodyId,
  testIdPrefix = SETTINGS_TEST_ID_PREFIX,
  actionsAlignment = "start",
}: {
  readonly step: ConfirmationStep;
  readonly editability: Editability;
  /** What a standalone dialog is described by: the body's own id. */
  readonly bodyId?: string;
  readonly testIdPrefix?: string;
  readonly actionsAlignment?: ActionsAlignment;
}) {
  return (
    <>
      <div className={styles.body}>
        <p
          id={bodyId}
          className={styles.confirmBody}
          data-testid={`${testIdPrefix}-confirm-body`}
        >
          {step.view.body}
        </p>
      </div>
      <div className={FOOTER_CLASS_BY_ALIGNMENT[actionsAlignment]}>
        <div className={styles.actions}>
          {/* Never locked: a customer who cannot commit must still be able to leave, and it keeps the
              focus trap's ring non-empty when every other control is greyed. */}
          <button
            type="button"
            className={styles.cancel}
            data-testid={`${testIdPrefix}-confirm-back`}
            onClick={step.onStepBack}
          >
            {step.view.backLabel}
          </button>
          <button
            type="button"
            className={styles.apply}
            data-testid={`${testIdPrefix}-confirm`}
            disabled={editability.isReadOnly}
            {...(editability.isReadOnly
              ? { title: editability.disabledReason }
              : {})}
            onClick={step.onConfirm}
          >
            {step.view.confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/** The focus trap, bound to the dialog rather than the document because it is about where focus *is*, which is
 *  what made a document listener right for Escape and wrong here. */
export function trapTab(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "Tab") return;
  const stops = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(TAB_STOP_SELECTOR),
  ];
  const landing = whereTabMustLand(stops, event.shiftKey);
  if (landing === undefined) return;
  event.preventDefault();
  landing.focus();
}

/**
 * Where this keypress has to be sent, or `undefined` where the browser's own answer is already inside the ring.
 * The question is "would this keypress leave the dialog", not "is focus at an end": opening focuses the dialog
 * container (`tabIndex={-1}`, not a tab stop), and Shift+Tab from there reaches the trigger, which sits in the one
 * band `useBackgroundInert` leaves live. So focus on none of the dialog's own stops takes the end the direction
 * implies. It cannot fire once focus has left the dialog (it hangs off `onKeyDown`); the step-change effect in
 * `GlobalSettings` is what keeps focus inside when the confirm step unmounts the focused button.
 */
function whereTabMustLand(
  stops: readonly HTMLElement[],
  isBackwards: boolean,
): HTMLElement | undefined {
  const first = stops.at(0);
  const last = stops.at(-1);
  if (first === undefined || last === undefined) return undefined;
  const at = stops.findIndex((stop) => stop === document.activeElement);
  if (at === -1) return isBackwards ? last : first;
  if (isBackwards) return at === 0 ? last : undefined;
  return at === stops.length - 1 ? first : undefined;
}
