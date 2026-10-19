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

/** How the confirmation is drawn, apart from what the dialog is. A claim is irreversible and so asks as a destructive
 *  dialog does, but what it does is not harmful and its button is the primary one. A dialog whose confirmation only
 *  closes it (the share sheet's "Închide") draws it quiet: a line of text, no fill, so the sheet's own act is the one
 *  filled button. */
export type AccountDialogConfirmTone = "primary" | "destructive" | "quiet";

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

/** What a dialog needs whatever its way out. */
interface AccountDialogBaseProps {
  readonly kind: AccountDialogKind;
  /** What names the dialog: the question. */
  readonly title: ReactNode;
  /** The consequence, which describes the dialog to a screen reader. Left out where the content describes itself. */
  readonly description?: ReactNode;
  /** The id of a further element in `children` that describes the dialog too (a warning drawn as a notice). */
  readonly alsoDescribedById?: string;
  readonly confirm: DialogConfirm;
  /** The confirmation's button, for a screen that moves focus to it when the dialog changes what it says. */
  readonly confirmRef?: RefObject<HTMLButtonElement | null>;
  /** Left out, the confirmation is drawn as the kind says: destructive in a destructive dialog, primary otherwise. */
  readonly confirmTone?: AccountDialogConfirmTone;
  /** Set where the title changes while the dialog is open (a question that becomes its answer), so that the new title
   *  is announced. Left out, the title is read once, as the dialog's name. */
  readonly announcesTitleChange?: boolean;
  /** The control focus lands on, where the opening question is not the buttons (a rename's field). Left out, a
   *  destructive dialog opens on its cancel and any other on its confirmation. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** Where focus goes on close if what opened the dialog has gone by then (a menu item the act removed). */
  readonly returnFocusFallbackRef?: RefObject<HTMLElement | null>;
  /** What the question needs beside its sentence: a field, a notice. */
  readonly children?: ReactNode;
}

/** A dialog has a cancel, which is also what Escape and the scrim do, or it says what they do: a dialog whose act is
 *  done and has one way on names it, so that Escape never takes that way by inference. */
export type AccountDialogProps = AccountDialogBaseProps &
  (
    | {
        readonly cancel: DialogCancel;
        readonly dismiss?: undefined;
      }
    | {
        readonly cancel?: undefined;
        /** What Escape and the scrim do when the dialog draws no cancel. */
        readonly dismiss: () => void;
      }
  );

export function AccountDialog(props: AccountDialogProps) {
  const {
    kind,
    title,
    description,
    alsoDescribedById,
    confirm,
    confirmRef: callerConfirmRef,
    cancel,
    confirmTone,
    announcesTitleChange,
    initialFocusRef,
    returnFocusFallbackRef,
    children,
  } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const ownConfirmRef = useRef<HTMLButtonElement>(null);
  const confirmRef = callerConfirmRef ?? ownConfirmRef;
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isDestructive = kind === "destructive";
  // A request in flight cannot be taken back, so nothing leaves the dialog until it is answered.
  const dismiss = confirm.isBusy ? doNothingWhileBusy : wayOutOf(props);

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
        aria-describedby={describedByOf(
          description === undefined ? undefined : descriptionId,
          alsoDescribedById,
        )}
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
          announcesTitleChange={announcesTitleChange === true}
        />
        {children}
        <DialogActions
          confirmTone={confirmTone ?? toneOfKind(kind)}
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
  announcesTitleChange,
}: {
  readonly kind: AccountDialogKind;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly titleId: string;
  readonly descriptionId: string;
  readonly announcesTitleChange: boolean;
}) {
  return (
    <>
      {kind === "destructive" ? null : (
        <span className={styles.dialogGrabber} aria-hidden="true" />
      )}
      <h2
        id={titleId}
        className={styles.dialogTitle}
        aria-live={announcesTitleChange ? "polite" : undefined}
      >
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
  confirmTone,
  confirm,
  cancel,
  confirmRef,
  cancelRef,
}: {
  readonly confirmTone: AccountDialogConfirmTone;
  readonly confirm: DialogConfirm;
  readonly cancel: DialogCancel | undefined;
  readonly confirmRef: RefObject<HTMLButtonElement | null>;
  readonly cancelRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className={styles.dialogActions}>
      <ConfirmButton
        tone={confirmTone}
        confirm={confirm}
        buttonRef={confirmRef}
      />
      {cancel === undefined ? null : (
        <CancelButton
          cancel={cancel}
          isBusy={confirm.isBusy}
          buttonRef={cancelRef}
        />
      )}
    </div>
  );
}

function toneOfKind(kind: AccountDialogKind): AccountDialogConfirmTone {
  return kind === "destructive" ? "destructive" : "primary";
}

const CONFIRM_CLASS_BY_TONE: Readonly<
  Record<AccountDialogConfirmTone, string>
> = {
  primary: styles.dialogPrimary ?? "",
  destructive: styles.dialogDestructive ?? "",
  quiet: styles.dialogQuiet ?? "",
};

/** The act. Busy it stays reachable (`aria-disabled`, not `disabled`), so the focus the press left on it is not
 *  dropped outside the Tab ring, and it ignores a second press. */
function ConfirmButton({
  tone,
  confirm,
  buttonRef,
}: {
  readonly tone: AccountDialogConfirmTone;
  readonly confirm: DialogConfirm;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={CONFIRM_CLASS_BY_TONE[tone]}
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

/** What Escape and the scrim do: the cancel, or what the dialog without one says. */
function wayOutOf(props: AccountDialogProps): () => void {
  return props.cancel === undefined ? props.dismiss : props.cancel.onPress;
}

/** The ids of the elements that describe the dialog, in reading order; none when nothing does. */
function describedByOf(
  ...ids: readonly (string | undefined)[]
): string | undefined {
  const present = ids.filter((id) => id !== undefined);
  return present.length === 0 ? undefined : present.join(" ");
}

function doNothingWhileBusy(): void {
  // The lint rule against empty functions wants a body; this one is the point.
}
