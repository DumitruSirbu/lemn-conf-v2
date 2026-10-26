"use client";

import { useId, useRef, type RefObject } from "react";

import accountStyles from "@/account/account.module.css";
import type { SignOutHere } from "@/account/session/use-logout";
import { trapTab, useModalFocus } from "@/components/use-modal-focus";
import { useAccountControlCopy, useStaffShellCopy } from "@/i18n/use-content";

import styles from "./staff.module.css";

// The phone's "Meniu": a sheet holding who is signed in, the role, the pages and the ways out.
// It is modal: focus lands on the sheet and stays in it, Escape and the scrim close it, and focus goes back to the
// button that opened it (the fallback is the button itself, for the browsers that do not focus a button on press).
//
// Mount it as a direct child of the screen's `<main>`, as `useBackgroundInert` asks. Its sign-out is the account
// pages': the screen owns it and leaves for the start of the configurator once the server has ended the
// session, so no staff page stays on screen with clients' data after it.

/** How many prices await publication, drawn beside a page's name: `label` is what the number means, said in words. */
export interface StaffNavBadge {
  readonly count: number;
  readonly label: string;
}

export interface StaffNavItem {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly isCurrent: boolean;
  readonly badge?: StaffNavBadge | undefined;
}

/** Pages standing under one heading. A group with no heading is drawn as a list with nothing above it. */
export interface StaffNavGroup {
  readonly key: string;
  readonly heading: string | undefined;
  readonly items: readonly StaffNavItem[];
}

export interface StaffNavSheetProps {
  readonly email: string;
  readonly roleName: string;
  readonly groups: readonly StaffNavGroup[];
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
  groups,
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
        {groups.length === 0 ? null : (
          <nav className={styles.sheetNav} aria-label={copy.areaName}>
            {groups.map((group) => (
              <SheetGroup key={group.key} group={group} />
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
          <p role="alert" className={styles.signOutFailure}>
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

function SheetGroup({ group }: { readonly group: StaffNavGroup }) {
  const headingId = useId();
  const isNamed = group.heading !== undefined;
  return (
    <div
      className={accountStyles.menuRows}
      role={isNamed ? "group" : undefined}
      aria-labelledby={isNamed ? headingId : undefined}
    >
      {group.heading === undefined ? null : (
        <p id={headingId} className={styles.groupHeading}>
          {group.heading}
        </p>
      )}
      {group.items.map((item) => (
        <SheetLinkRow
          key={item.key}
          href={item.href}
          label={item.label}
          isCurrent={item.isCurrent}
          badge={item.badge}
        />
      ))}
    </div>
  );
}

function SheetLinkRow({
  href,
  label,
  isCurrent,
  badge,
}: {
  readonly href: string;
  readonly label: string;
  readonly isCurrent: boolean;
  readonly badge?: StaffNavBadge | undefined;
}) {
  return (
    <a
      className={accountStyles.menuRow}
      href={href}
      aria-current={isCurrent ? "page" : undefined}
    >
      <span className={styles.rowLabel}>
        {label}
        {badge === undefined ? null : <NavBadge badge={badge} />}
      </span>
      <span className={accountStyles.menuRowMark} aria-hidden="true" />
    </a>
  );
}

/** The number is drawn, and its meaning is said to a screen reader after the page's name. */
export function NavBadge({ badge }: { readonly badge: StaffNavBadge }) {
  return (
    <>
      <span className={styles.badge} aria-hidden="true">
        {badge.count}
      </span>
      <span className={styles.visuallyHidden}>{`, ${badge.label}`}</span>
    </>
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
