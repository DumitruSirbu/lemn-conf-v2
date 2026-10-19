"use client";

// The dialog the application asks "are you sure" in: one shell, two askers (the settings sheet's material-change
// confirm step, and the back-to-room link's `ConfirmationDialog`). Look is written once, here; focus trap, Escape and
// inert background are written once in `components/use-modal-focus.ts`, so the two cannot drift into two modals.

import { useId, useRef, type ReactNode } from "react";

import { trapTab, useModalFocus } from "@/components/use-modal-focus";
import type { Editability } from "@/store/editability";

import styles from "./global-settings.module.css";

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
  isConfirmDisabled = false,
  children,
}: {
  readonly view: ConfirmationCopy;
  readonly testIdPrefix: string;
  readonly onConfirm: () => void;
  readonly onStay: () => void;
  /** The confirmation cannot be given yet (something it waits on): its own reason, not the customer's access. */
  readonly isConfirmDisabled?: boolean;
  /** Anything the question needs beside its sentence, drawn under it (the preset dialog's name field and status). */
  readonly children?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useModalFocus({
    hostRef,
    initialFocusRef: surfaceRef,
    dismiss: onStay,
  });

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
          isConfirmDisabled={isConfirmDisabled}
        >
          {children}
        </ConfirmStep>
      </div>
    </div>
  );
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
  isConfirmDisabled = false,
  children,
}: {
  readonly step: ConfirmationStep;
  readonly editability: Editability;
  /** What a standalone dialog is described by: the body's own id. */
  readonly bodyId?: string;
  readonly testIdPrefix?: string;
  readonly actionsAlignment?: ActionsAlignment;
  readonly isConfirmDisabled?: boolean;
  readonly children?: ReactNode;
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
        {children}
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
            disabled={editability.isReadOnly || isConfirmDisabled}
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
