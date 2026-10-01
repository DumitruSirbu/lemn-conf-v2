"use client";

// The dialog the application asks "are you sure" in — one shell, two askers. Wave 6G's material
// change asks it inside the settings sheet (its confirm step); M7C's back-to-room link asks it on
// its own (`ConfirmationDialog`). The surface's look, its focus trap, its Escape and its inert
// background are written once, here, so the two cannot drift into two different modals.

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import type { Editability } from "@/store/editability";

import styles from "./global-settings.module.css";

/** The tab ring inside the dialog. **A radio group contributes exactly its checked member**, which
 *  is the browser's own rule and is why the unchecked ones are not listed: including them would put
 *  the trap's first and last stops on elements Tab never visits, and the ring would leak past both
 *  ends. Every group here always has a checked member — a choice resolves to the book's default
 *  where the design names none.
 *
 *  **`:not([disabled])` is on both halves for exactly that reason** (wave W2). A locked sheet greys
 *  its radios and its *Aplică* (M6-AUD-001), and a disabled radio is no more tabbable than a
 *  disabled button — listing one would move the ring's first stop onto an element the browser
 *  skips, which is the leak this selector exists to prevent. *Renunță* is never disabled, so the
 *  ring is never empty: leaving must stay possible on every surface. */
const TAB_STOP_SELECTOR =
  'button:not([disabled]), input[type="radio"]:checked:not([disabled])';

/** The settings sheet's own test ids, which the confirm step carried before it was shared. */
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

/** Navigation is not a write, so a browser that may not edit the design may still leave it. A value
 *  rather than an optional prop on `ConfirmStep`: that prop is required so no caller can forget the
 *  access story, which is the defect `qa-w2-locked-surface-reach` pins at the settings call site. */
const NOT_LOCKED: Editability = { isReadOnly: false, disabledReason: "" };

/**
 * **The confirmation as a dialog of its own**: the settings sheet's scrim, surface and step, with
 * nothing of the sheet around them. Focus lands on it on open; the caller returns focus to what
 * opened it, because only the caller knows what that was.
 *
 * It is named by its heading and described by its body, as the settings confirmation is.
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
 * **Escape dismisses it wherever focus has got to**, which is why this listens on the document
 * rather than on the surface — `price-breakdown.tsx` records what binding it to the dialog cost.
 *
 * Registered only while open. It is the second such handler in the application, which the
 * breakdown's own comment anticipated: the rule it states is that the topmost surface registers last
 * and **no handler calls `stopPropagation`**, and both hold here. The two cannot both be open —
 * this one marks the rest of the screen inert, and the breakdown's trigger is part of it.
 *
 * **One listener per open dialog, and it calls whatever `dismiss` its asker hands it.** The settings
 * sheet's is one step at a time — the confirm step steps back, a second press leaves the sheet (ADR
 * 0081 decision 3) — and the back confirmation's is Stay. A second document-level handler inside
 * either is what that decision refuses.
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
 * **The rest of the screen, marked inert while the dialog is open** — the half of "modal" a scrim
 * cannot do, because a keyboard can activate controls a pointer cannot.
 *
 * Applied to the screen's own children rather than to a named list of components: the branch holding
 * this control stays live (the settings sheet's trigger and chips are what it is about; the back confirmation's host is a band of its own) and every sibling band
 * — the header, the stage with its camera presets and §9's panel, the price bar and its breakdown —
 * goes inert together. Walking up to the screen rather than assuming a depth means a later change to
 * where this mounts cannot silently leave a band operable.
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
 * **The consequence, and the two ways out of it.** In the settings sheet it replaces the body and
 * footer inside the one dialog — no second scrim, no second focus trap and no second Escape listener
 * (ADR 0081 decision 3).
 *
 * **The figure and the overflow warning go with the footer they belong to.** A running total beside
 * *Schimbă materialul* invites the reading that the price is what changes, and the estimate is not
 * what this step is about.
 *
 * **It takes the same editability the choosing step does** (M6-AUD-001, found by adversarial QA).
 * *Schimbă materialul* is the same commit as *Aplică*, one step further in — it calls `applyPending`
 * directly — so a step handed no access story rendered a live, unexplained write action on a sheet
 * every other control of which was greyed.
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
          {/* Never locked, on either step: a customer who cannot commit must still be able to keep
              what they have and leave. It is also what keeps the focus trap's ring non-empty when
              every other control on the step is greyed. */}
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

/** **The focus trap.** Bound to the dialog rather than to the document because a trap is about where
 *  focus *is* — which is exactly the property that made a document listener right for Escape and
 *  wrong here. */
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
 * Where this keypress has to be sent, or `undefined` where the browser's own answer is already
 * inside the ring.
 *
 * **The question is "would this keypress leave the dialog", not "is focus at an end", and the
 * difference is the whole defect this replaced.** A rule written on the ends alone is silent
 * whenever focus is on the container itself — which is exactly where a dialog *starts*, because
 * opening it focuses the dialog (`tabIndex={-1}`, focusable but not a tab stop, the ordinary
 * pattern). Forward from there the browser's next stop happens to be inside and nothing looked
 * wrong. **Backwards from there it is the trigger**, which is in the one band `useBackgroundInert`
 * deliberately leaves live — so a single Shift+Tab from the position every keyboard customer starts
 * in walked straight out of a surface whose whole point is that it cannot be left. Measured in a
 * browser, not reasoned about: one Shift+Tab reached the trigger, a second reached `<body>`.
 *
 * So focus not being on any of this dialog's own stops is a case in its own right, and it takes the
 * end the direction implies.
 *
 * **What this cannot do is fire when focus has left the dialog altogether**, because it hangs off
 * the dialog's own `onKeyDown`. The same defect recurred through that gap — the confirm step
 * unmounted the focused button and dropped focus on `<body>` — so the guarantee above holds only
 * while something keeps focus inside. That something is the step-change effect in `GlobalSettings`,
 * and the two are one mechanism read from its two ends.
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
