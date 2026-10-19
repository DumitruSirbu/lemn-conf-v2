"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";

import { trapTab, useModalFocus } from "@/components/use-modal-focus";

import styles from "./account.module.css";

// The dialog every signed-in screen asks in (Lot 2 frames, ContBlocks2 `isBtns` and `isGrab`). Focus, Escape and the
// inert background are the shared modal behaviour of `components/use-modal-focus.ts`; this file is its look and its
// two actions. Mount it as a direct child of the screen's `<main>`: `useBackgroundInert` marks the other children of
// `<main>` inert, so a dialog nested inside the only band would leave the rest of the page operable.

/** What the dialog asks. A destructive question is an `alertdialog`, drawn centred on a phone too and opening on its
 *  cancel; any other is a `dialog`, drawn as a sheet on a phone and opening on its confirmation. */
export type AccountDialogKind = "standard" | "destructive";

/** The way out. It is the name of what is kept, so it is also what Escape and the scrim do. */
export interface DialogCancel {
  readonly label: string;
  readonly onPress: () => void;
}

/** The act the dialog asks for. */
export interface DialogConfirm {
  readonly label: string;
  /** What the button says while the request is out: the act in the present tense. */
  readonly busyLabel: string;
  readonly isBusy: boolean;
  readonly onPress: () => void;
}

export interface AccountDialogProps {
  readonly kind: AccountDialogKind;
  /** What names the dialog: the question. */
  readonly title: string;
  /** The consequence, which describes the dialog to a screen reader. Left out where the content describes itself. */
  readonly description?: string;
  readonly confirm: DialogConfirm;
  readonly cancel: DialogCancel;
  /** The control focus lands on, where the opening question is not the buttons (a rename's field). Left out, a
   *  destructive dialog opens on its cancel and any other on its confirmation. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** Where focus goes on close if what opened the dialog has gone by then (a menu item the act removed). */
  readonly returnFocusFallbackRef?: RefObject<HTMLElement | null>;
  /** What the question needs beside its sentence: a field, a notice. */
  readonly children?: ReactNode;
}

export function AccountDialog({
  kind,
  title,
  description,
  confirm,
  cancel,
  initialFocusRef,
  returnFocusFallbackRef,
  children,
}: AccountDialogProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isDestructive = kind === "destructive";
  // A request in flight cannot be taken back, so nothing leaves the dialog until it is answered.
  const dismiss = confirm.isBusy ? doNothingWhileBusy : cancel.onPress;

  useModalFocus({
    hostRef,
    initialFocusRef:
      initialFocusRef ?? (isDestructive ? cancelRef : confirmRef),
    focusFallbackRef: surfaceRef,
    dismiss,
    returnFocus: { fallbackRef: returnFocusFallbackRef },
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
        role={isDestructive ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        tabIndex={-1}
        className={styles.dialogSurface}
        data-kind={kind}
        onKeyDown={trapTab}
      >
        <DialogHeader
          kind={kind}
          title={title}
          description={description}
          titleId={titleId}
          descriptionId={descriptionId}
        />
        {children}
        <DialogActions
          kind={kind}
          confirm={confirm}
          cancel={cancel}
          confirmRef={confirmRef}
          cancelRef={cancelRef}
        />
      </div>
    </div>
  );
}

/** The grabber of a sheet, the question and, where there is one, its consequence. */
function DialogHeader({
  kind,
  title,
  description,
  titleId,
  descriptionId,
}: {
  readonly kind: AccountDialogKind;
  readonly title: string;
  readonly description: string | undefined;
  readonly titleId: string;
  readonly descriptionId: string;
}) {
  return (
    <>
      {kind === "destructive" ? null : (
        <span className={styles.dialogGrabber} aria-hidden="true" />
      )}
      <h2 id={titleId} className={styles.dialogTitle}>
        {title}
      </h2>
      {description === undefined ? null : (
        <p id={descriptionId} className={styles.dialogBody}>
          {description}
        </p>
      )}
    </>
  );
}

/** The act, then the way out. */
function DialogActions({
  kind,
  confirm,
  cancel,
  confirmRef,
  cancelRef,
}: {
  readonly kind: AccountDialogKind;
  readonly confirm: DialogConfirm;
  readonly cancel: DialogCancel;
  readonly confirmRef: RefObject<HTMLButtonElement | null>;
  readonly cancelRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className={styles.dialogActions}>
      <ConfirmButton kind={kind} confirm={confirm} buttonRef={confirmRef} />
      <CancelButton
        cancel={cancel}
        isBusy={confirm.isBusy}
        buttonRef={cancelRef}
      />
    </div>
  );
}

const CONFIRM_CLASS_BY_KIND: Readonly<Record<AccountDialogKind, string>> = {
  standard: styles.dialogPrimary ?? "",
  destructive: styles.dialogDestructive ?? "",
};

/** The act. Busy it stays reachable (`aria-disabled`, not `disabled`), so the focus the press left on it is not
 *  dropped outside the Tab ring, and it ignores a second press. */
function ConfirmButton({
  kind,
  confirm,
  buttonRef,
}: {
  readonly kind: AccountDialogKind;
  readonly confirm: DialogConfirm;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={CONFIRM_CLASS_BY_KIND[kind]}
      aria-busy={confirm.isBusy ? true : undefined}
      aria-disabled={confirm.isBusy ? true : undefined}
      onClick={confirm.isBusy ? doNothingWhileBusy : confirm.onPress}
    >
      {confirm.isBusy ? (
        <span className={styles.dialogSpinner} aria-hidden="true" />
      ) : null}
      {confirm.isBusy ? confirm.busyLabel : confirm.label}
    </button>
  );
}

/** The way out. Not `disabled` while the request is out, for the reason the confirmation is not: the Tab ring must
 *  never be empty. */
function CancelButton({
  cancel,
  isBusy,
  buttonRef,
}: {
  readonly cancel: DialogCancel;
  readonly isBusy: boolean;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={styles.dialogSecondary}
      aria-disabled={isBusy ? true : undefined}
      onClick={isBusy ? doNothingWhileBusy : cancel.onPress}
    >
      {cancel.label}
    </button>
  );
}

function doNothingWhileBusy(): void {
  // The lint rule against empty functions wants a body; this one is the point.
}
