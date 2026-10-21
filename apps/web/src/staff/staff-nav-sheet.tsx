"use client";

import { useRef, type RefObject } from "react";

import accountStyles from "@/account/account.module.css";
import type { SignOutHere } from "@/account/session/use-logout";
import { trapTab, useModalFocus } from "@/components/use-modal-focus";
import { useAccountControlCopy, useStaffShellCopy } from "@/i18n/use-content";

import styles from "./staff.module.css";

// The phone's "Meniu" (Lot 3 frames S1A, S1B): a sheet holding who is signed in, the role, the pages and the ways out.
// It is modal: focus lands on the sheet and stays in it, Escape and the scrim close it, and focus goes back to the
// button that opened it (the fallback is the button itself, for the browsers that do not focus a button on press).
//
// Mount it as a direct child of the screen's `<main>`, as `useBackgroundInert` asks. Its sign-out is the account
// pages' (plan P14); the screen owns it and leaves for the start of the configurator once the server has ended the
// session, so no staff page stays on screen with clients' data after it.

export interface StaffNavItem {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly isCurrent: boolean;
}

export interface StaffNavSheetProps {
  readonly email: string;
  readonly roleName: string;
  readonly items: readonly StaffNavItem[];
  readonly profileHref: string;
  /** This device's sign-out, owned by the screen: the sheet can be dismissed while the request is out, and the leave
   *  that follows must outlive it. */
  readonly signOutHere: SignOutHere;
  readonly onClose: () => void;
  /** From the sheet to the question "Ieși de pe toate dispozitivele?", which the screen draws. */
  readonly onSignOutEverywhere: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

export function StaffNavSheet({
  email,
  roleName,
  items,
  profileHref,
  signOutHere,
  onClose,
  onSignOutEverywhere,
  returnFocusRef,
}: StaffNavSheetProps) {
  const copy = useStaffShellCopy();
  const account = useAccountControlCopy();
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  useModalFocus({
    hostRef,
    initialFocusRef: surfaceRef,
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
        aria-label={copy.menu}
        tabIndex={-1}
        className={accountStyles.dialogSurface}
        data-testid="staff-menu-sheet"
        onKeyDown={trapTab}
      >
        <span className={accountStyles.dialogGrabber} aria-hidden="true" />
        <div className={accountStyles.menuIdentity}>
          <span className={accountStyles.menuIdentityLabel}>
            {account.signedInAs}
          </span>
          <span className={accountStyles.menuIdentityEmail}>{email}</span>
        </div>
        <p className={styles.sheetRole}>
          {copy.roleLabel} <strong>{roleName}</strong>
        </p>
        {items.length === 0 ? null : (
          <nav className={accountStyles.menuRows} aria-label={copy.areaName}>
            {items.map((item) => (
              <SheetLinkRow
                key={item.key}
                href={item.href}
                label={item.label}
                isCurrent={item.isCurrent}
              />
            ))}
          </nav>
        )}
        <div className={accountStyles.menuRows}>
          <SheetLinkRow
            href={profileHref}
            label={account.profile}
            isCurrent={false}
          />
          <SheetActionRow
            label={account.signOutHere}
            isBusy={signOutHere.isSending}
            onPress={signOutHere.signOut}
          />
          <SheetActionRow
            label={account.signOutEverywhere}
            isBusy={signOutHere.isSending}
            onPress={onSignOutEverywhere}
          />
        </div>
        {signOutHere.outcome === "failed" ? (
          <p role="alert" className={styles.sheetFailure}>
            {account.signOutFailed}
          </p>
        ) : null}
        <div className={accountStyles.dialogActions}>
          <button
            type="button"
            className={accountStyles.dialogSecondary}
            onClick={onClose}
          >
            {account.close}
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetLinkRow({
  href,
  label,
  isCurrent,
}: {
  readonly href: string;
  readonly label: string;
  readonly isCurrent: boolean;
}) {
  return (
    <a
      className={accountStyles.menuRow}
      href={href}
      aria-current={isCurrent ? "page" : undefined}
    >
      {label}
      <span className={accountStyles.menuRowMark} aria-hidden="true" />
    </a>
  );
}

/** Busy it stays reachable (`aria-disabled`, not `disabled`), so the Tab ring is never emptied, and it ignores a press. */
function SheetActionRow({
  label,
  isBusy,
  onPress,
}: {
  readonly label: string;
  readonly isBusy: boolean;
  readonly onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={accountStyles.menuRow}
      aria-disabled={isBusy ? true : undefined}
      onClick={isBusy ? undefined : onPress}
    >
      {label}
      <span className={accountStyles.menuRowMark} aria-hidden="true" />
    </button>
  );
}
