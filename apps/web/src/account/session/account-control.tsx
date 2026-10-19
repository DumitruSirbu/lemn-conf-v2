"use client";

import { useLocale } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { useIsHydrated } from "@/components/use-is-hydrated";
import { trapTab, useModalFocus } from "@/components/use-modal-focus";
import type { AccountControlCopy } from "@/i18n/content";
import { useAccountControlCopy } from "@/i18n/use-content";

import { accountPathOf } from "../account-shell";
import styles from "../account.module.css";
import { StatusToast } from "../status-toast";
import { LogoutEverywhereDialog } from "./logout-everywhere-dialog";
import {
  useAccountSession,
  type AccountSessionState,
} from "./use-account-session";
import {
  useSignOutHere,
  type SignOutHere,
  type SignOutHereOutcome,
} from "./use-logout";

// The account control in the configurator's top bar: one cell for the host's grid or flex row, holding the visitor's way
// in or the signed-in client's menu.
//
// The way in is a plain anchor, never the router's link: an account page is a document of its own, with a policy and a
// nonce of its own, so a soft navigation would carry the wrong ones.
//
// The menu, and the "sign out everywhere" question it leads to, are not drawn inside the cell but rendered into the
// screen's own `<main>`. The modal behaviour marks every band of the `<main>` but the one holding the dialog inert, and
// both top bars are bands of it (the room's is a single one): a dialog nested in the bar would leave the whole bar
// operable.
//
// The confirmation of "Ieși din cont" is rendered into the document's body instead. It outlives the menu, which goes
// with the signed-in state it was drawn for, and it must be neither inert while a dialog is open elsewhere nor held under
// the cell's stacking number (the cell is a grid item of the editor, so its `z-index` caps whatever it contains).

export interface AccountControlProps {
  /** The host's cell: where it stands in the bar, and the band's paper and rule it draws. */
  readonly cellClassName: string;
}

export function AccountControl({ cellClassName }: AccountControlProps) {
  const session = useAccountSession();
  const signOutHere = useSignOutHere();
  const cellRef = useRef<HTMLDivElement>(null);
  useFocusSignInAfterSignOut(cellRef, signOutHere.outcome);
  return (
    <>
      <div
        ref={cellRef}
        className={cellClassName}
        data-testid="top-bar-account"
      >
        <ControlFor session={session} signOutHere={signOutHere} />
      </div>
      <SignOutHereToast
        outcome={signOutHere.outcome}
        onElapsed={signOutHere.clearOutcome}
      />
    </>
  );
}

/** After "Ieși din cont" the icon the person pressed is gone, and focus has fallen to the body; the sign-in link that
 *  took its place is where they are. Only then: focus the person has put elsewhere is theirs, and a page that was just
 *  loaded has had no sign-out, so nothing is moved. */
function useFocusSignInAfterSignOut(
  cellRef: RefObject<HTMLElement | null>,
  outcome: SignOutHereOutcome | undefined,
): void {
  useEffect(() => {
    if (outcome !== "signed-out") return;
    const holder = document.activeElement;
    if (holder !== null && holder !== document.body) return;
    cellRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
  }, [outcome, cellRef]);
}

function ControlFor({
  session,
  signOutHere,
}: {
  readonly session: AccountSessionState;
  readonly signOutHere: SignOutHere;
}) {
  switch (session.kind) {
    case "pending":
      return <PendingSlot />;
    case "anonymous":
      return <SignInLink />;
    case "client":
      return <SignedInMenu email={session.email} signOutHere={signOutHere} />;
    case "staff":
      // Staff are not told apart from each other, and the staff area is not built: their menu holds the way out only.
      return <SignedInMenu email={undefined} signOutHere={signOutHere} />;
  }
}

/** The confirmation that "Ieși din cont" happened, or the sentence that it did not. The region is mounted from the first
 *  render on and only its words come and go, which is what a live region needs to be announced. */
function SignOutHereToast({
  outcome,
  onElapsed,
}: {
  readonly outcome: SignOutHereOutcome | undefined;
  readonly onElapsed: () => void;
}) {
  const copy = useAccountControlCopy();
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;
  return createPortal(
    <StatusToast
      message={toastMessageOf(outcome, copy)}
      onElapsed={onElapsed}
    />,
    document.body,
  );
}

function toastMessageOf(
  outcome: SignOutHereOutcome | undefined,
  copy: AccountControlCopy,
): string | undefined {
  switch (outcome) {
    case "signed-out":
      return copy.signedOutToast;
    case "failed":
      return copy.signOutFailed;
    case undefined:
      return undefined;
  }
}

/** What stands in the cell until the server has answered: the visitor's link, invisible. Most sessions are visitors,
 *  so the widest state is the one reserved, and the answer moves the bar only for someone signed in. */
function PendingSlot() {
  const copy = useAccountControlCopy();
  return (
    <span className={styles.accountPending} aria-hidden="true">
      {copy.signIn}
    </span>
  );
}

function SignInLink() {
  const copy = useAccountControlCopy();
  const locale = useLocale();
  return (
    <a
      className={styles.accountSignIn}
      href={accountPathOf(locale, "login")}
      data-testid="top-bar-account-sign-in"
    >
      {copy.signIn}
    </a>
  );
}

/** What stands open in the screen's `<main>`: the menu, or the question the menu led to. */
type OpenSurface = "menu" | "logout-everywhere";

interface OpenState {
  readonly screen: HTMLElement;
  readonly surface: OpenSurface;
}

interface OpenSurfaceControls {
  readonly open: OpenState | undefined;
  readonly openMenu: () => void;
  readonly close: () => void;
  /** From the menu to the question, in the same `<main>`. */
  readonly askEverywhere: () => void;
}

/** Which surface is open and where: the screen's `<main>`, found from the trigger, or the body for a screen without one. */
function useOpenSurface(
  triggerRef: RefObject<HTMLElement | null>,
): OpenSurfaceControls {
  const [open, setOpen] = useState<OpenState | undefined>(undefined);
  const openMenu = useCallback(() => {
    const screen = triggerRef.current?.closest("main") ?? document.body;
    setOpen({ screen, surface: "menu" });
  }, [triggerRef]);
  const close = useCallback(() => {
    setOpen(undefined);
  }, []);
  const askEverywhere = useCallback(() => {
    setOpen((current) =>
      current === undefined
        ? undefined
        : { screen: current.screen, surface: "logout-everywhere" },
    );
  }, []);
  return { open, openMenu, close, askEverywhere };
}

/** The icon and, once it is pressed, the menu in the screen's `<main>`. A client's menu names who is signed in; staff's
 *  does not, since the control is not told who they are. */
function SignedInMenu({
  email,
  signOutHere,
}: {
  readonly email: string | undefined;
  readonly signOutHere: SignOutHere;
}) {
  const copy = useAccountControlCopy();
  const locale = useLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { open, openMenu, close, askEverywhere } = useOpenSurface(triggerRef);
  const signOutAndClose = useCallback(() => {
    close();
    signOutHere.signOut();
  }, [close, signOutHere]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.accountIcon}
        aria-label={copy.menuName}
        aria-haspopup="dialog"
        aria-expanded={open !== undefined}
        data-testid="top-bar-account-trigger"
        onClick={openMenu}
      >
        <span className={styles.accountGlyph} aria-hidden="true" />
      </button>
      {open === undefined ? null : (
        <MenuPortal
          open={open}
          email={email}
          kitchensHref={
            email === undefined ? undefined : accountPathOf(locale, "kitchens")
          }
          isSignOutBusy={signOutHere.isSending}
          onClose={close}
          onSignOutHere={signOutAndClose}
          onSignOutEverywhere={askEverywhere}
          returnFocusRef={triggerRef}
        />
      )}
    </>
  );
}

/** Whichever surface is open, rendered into the screen it was opened on. */
function MenuPortal({
  open,
  email,
  kitchensHref,
  isSignOutBusy,
  onClose,
  onSignOutHere,
  onSignOutEverywhere,
  returnFocusRef,
}: {
  readonly open: OpenState;
  readonly email: string | undefined;
  readonly kitchensHref: string | undefined;
  readonly isSignOutBusy: boolean;
  readonly onClose: () => void;
  readonly onSignOutHere: () => void;
  readonly onSignOutEverywhere: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}) {
  return createPortal(
    open.surface === "menu" ? (
      <AccountMenu
        email={email}
        kitchensHref={kitchensHref}
        isSignOutBusy={isSignOutBusy}
        onClose={onClose}
        onSignOutHere={onSignOutHere}
        onSignOutEverywhere={onSignOutEverywhere}
        returnFocusRef={returnFocusRef}
      />
    ) : (
      <LogoutEverywhereDialog
        onClose={onClose}
        returnFocusFallbackRef={returnFocusRef}
      />
    ),
    open.screen,
  );
}

/** The sheet on a phone and the popover on a desktop: one surface, which of the two is the stylesheet's to say. */
function AccountMenu({
  email,
  kitchensHref,
  isSignOutBusy,
  onClose,
  onSignOutHere,
  onSignOutEverywhere,
  returnFocusRef,
}: {
  readonly email: string | undefined;
  /** The client's list of kitchens; staff have none and are shown no row. */
  readonly kitchensHref: string | undefined;
  /** A sign-out of this device is out: the rows wait for its answer. */
  readonly isSignOutBusy: boolean;
  readonly onClose: () => void;
  readonly onSignOutHere: () => void;
  readonly onSignOutEverywhere: () => void;
  /** Where focus goes on close if what had it on open has gone by then. */
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const copy = useAccountControlCopy();
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
    <div className={styles.dialogHost} ref={hostRef}>
      <div
        className={styles.dialogScrim}
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-label={copy.menuName}
        tabIndex={-1}
        className={[styles.dialogSurface, styles.menuSurface].join(" ")}
        data-testid="top-bar-account-menu"
        onKeyDown={trapTab}
      >
        <span className={styles.dialogGrabber} aria-hidden="true" />
        {email === undefined ? null : (
          <div className={styles.menuIdentity}>
            <span className={styles.menuIdentityLabel}>{copy.signedInAs}</span>
            <span className={styles.menuIdentityEmail}>{email}</span>
          </div>
        )}
        <div className={styles.menuRows}>
          {kitchensHref === undefined ? null : (
            <MenuLinkRow label={copy.myKitchens} href={kitchensHref} />
          )}
          <MenuRow
            label={copy.signOutHere}
            isBusy={isSignOutBusy}
            onPress={onSignOutHere}
          />
          <MenuRow
            label={copy.signOutEverywhere}
            isBusy={isSignOutBusy}
            onPress={onSignOutEverywhere}
          />
        </div>
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.dialogSecondary}
            onClick={onClose}
          >
            {copy.close}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Busy it stays reachable (`aria-disabled`, not `disabled`), so the Tab ring is never emptied, and it ignores a press. */
function MenuRow({
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
      className={styles.menuRow}
      aria-disabled={isBusy ? true : undefined}
      onClick={isBusy ? undefined : onPress}
    >
      {label}
      <span className={styles.menuRowMark} aria-hidden="true" />
    </button>
  );
}

/** A row that leaves for a page of its own: a plain anchor, since an account page is a document with its own policy. */
function MenuLinkRow({
  label,
  href,
}: {
  readonly label: string;
  readonly href: string;
}) {
  return (
    <a className={styles.menuRow} href={href}>
      {label}
      <span className={styles.menuRowMark} aria-hidden="true" />
    </a>
  );
}
