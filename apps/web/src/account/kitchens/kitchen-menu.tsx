"use client";

import { useId, useRef, type RefObject } from "react";

import { trapTab, useModalFocus } from "@/components/use-modal-focus";
import { useAccountKitchensCopy } from "@/i18n/use-content";

import accountStyles from "../account.module.css";
import styles from "./kitchens.module.css";

// The "⋯" menu of a kitchen's card (Lot 2 frame A9D): rename, copy, share and, last, the act that takes the kitchen off the
// list: delete for a draft, hide for a sent one. A sheet on a phone and a dialog on a desktop, as the account control's
// menu is: a dialog of rows, since a menu in ARIA's sense asks the keyboard for arrow keys the frame does not draw.
//
// Mount it as a direct child of the screen's `<main>`, as `useModalFocus` asks.

/** What a row of the menu asks for. */
export type KitchenChoice =
  | "rename"
  | "duplicate"
  | "share"
  | "delete"
  | "hide";

export interface KitchenMenuProps {
  /** The name the card shows: what the menu is about. */
  readonly kitchenName: string;
  readonly isSent: boolean;
  /** A copy is out: "Duplică" waits for it. */
  readonly isCopying: boolean;
  readonly onChoose: (choice: KitchenChoice) => void;
  readonly onClose: () => void;
  /** Where focus goes on close if what had it on open has gone by then. */
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

export function KitchenMenu({
  kitchenName,
  isSent,
  isCopying,
  onChoose,
  onClose,
  returnFocusRef,
}: KitchenMenuProps) {
  const copy = useAccountKitchensCopy();
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const firstRowRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useModalFocus({
    hostRef,
    initialFocusRef: firstRowRef,
    focusFallbackRef: surfaceRef,
    dismiss: onClose,
    returnFocus: { fallbackRef: returnFocusRef },
  });

  return (
    <div className={accountStyles.dialogHost} ref={hostRef}>
      <div
        className={accountStyles.dialogScrim}
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={accountStyles.dialogSurface}
        onKeyDown={trapTab}
      >
        <span className={accountStyles.dialogGrabber} aria-hidden="true" />
        <h2 id={titleId} className={accountStyles.dialogTitle}>
          {kitchenName}
        </h2>
        <div className={accountStyles.menuRows}>
          <MenuAction
            buttonRef={firstRowRef}
            label={copy.actions.rename}
            onPress={() => {
              onChoose("rename");
            }}
          />
          <MenuAction
            label={copy.actions.duplicate}
            isBusy={isCopying}
            onPress={() => {
              onChoose("duplicate");
            }}
          />
          <MenuAction
            label={copy.actions.share}
            onPress={() => {
              onChoose("share");
            }}
          />
          <RemovingAction isSent={isSent} onChoose={onChoose} />
        </div>
        <div className={accountStyles.dialogActions}>
          <button
            type="button"
            className={accountStyles.dialogSecondary}
            onClick={onClose}
          >
            {copy.actions.close}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A sent kitchen cannot be deleted, only hidden; a draft cannot be hidden, only deleted. */
function RemovingAction({
  isSent,
  onChoose,
}: {
  readonly isSent: boolean;
  readonly onChoose: (choice: KitchenChoice) => void;
}) {
  const copy = useAccountKitchensCopy();
  const choice = isSent ? "hide" : "delete";
  return (
    <MenuAction
      label={isSent ? copy.actions.hide : copy.actions.delete}
      isDestructive
      onPress={() => {
        onChoose(choice);
      }}
    />
  );
}

/** Busy it stays reachable (`aria-disabled`, not `disabled`), so the Tab ring is never emptied, and it ignores a press. */
function MenuAction({
  label,
  onPress,
  buttonRef,
  isBusy = false,
  isDestructive = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
  readonly isBusy?: boolean;
  readonly isDestructive?: boolean;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={[
        accountStyles.menuRow,
        isDestructive ? styles.menuRowDestructive : "",
      ].join(" ")}
      aria-disabled={isBusy ? true : undefined}
      onClick={isBusy ? undefined : onPress}
    >
      {label}
    </button>
  );
}
