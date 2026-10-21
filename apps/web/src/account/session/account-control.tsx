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
import type { ToastMessage } from "../use-toast-message";
import { LogoutEverywhereDialog } from "./logout-everywhere-dialog";
import {
  useAccountSession,
  type AccountSessionState,
} from "./use-account-session";
import {
  useLeaveForStartAfterSignOut,
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

/** The visitor's link: `text` is the words, `icon` the glyph alone, and `icon-below-desktop` the glyph on the phone shell
 *  and the words from the desktop shell up (the stylesheet's fork, so the first paint is already right). */
export type SignInForm = "text" | "icon" | "icon-below-desktop";

export interface AccountControlProps {
  /** The host's cell: where it stands in the bar, and the band's paper and rule it draws. */
  readonly cellClassName: string;
  /** The form of the visitor's link. A signed-in person's control is the glyph whatever is asked here. */
  readonly signInForm?: SignInForm;
  /** What "Ieși din cont" does once the server has ended the session. The configurator keeps its screen and says so;
   *  a page that holds a client's data leaves for the start of the configurator (plan P14). */
  readonly afterSignOut?: AfterSignOut;
}

export type AfterSignOut = "stay-on-screen" | "leave-for-start";

export function AccountControl({
  cellClassName,
  signInForm = "text",
  afterSignOut = "stay-on-screen",
}: AccountControlProps) {
  const session = useAccountSession();
  const signOutHere = useSignOutHere();
  useLeaveAfterSignOutWhenAsked(signOutHere.outcome, afterSignOut);
  const cellRef = useRef<HTMLDivElement>(null);
  useFocusSignInAfterSignOut(cellRef, signOutHere.outcome);
  return (
    <>
      <div
        ref={cellRef}
        className={cellClassName}
        data-testid="top-bar-account"
      >
        <ControlFor
          session={session}
          signInForm={signInForm}
          signOutHere={signOutHere}
        />
      </div>
      <SignOutHereToast
        outcome={signOutHere.outcome}
        outcomeId={signOutHere.outcomeId}
        onElapsed={signOutHere.clearOutcome}
      />
    </>
  );
}

/** The hook is called either way, as hooks must be; it does nothing unless the host asked for the leave. */
function useLeaveAfterSignOutWhenAsked(
  outcome: SignOutHereOutcome | undefined,
  afterSignOut: AfterSignOut,
): void {
  useLeaveForStartAfterSignOut(
    afterSignOut === "leave-for-start" ? outcome : undefined,
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
  signInForm,
  signOutHere,
}: {
  readonly session: AccountSessionState;
  readonly signInForm: SignInForm;
  readonly signOutHere: SignOutHere;
}) {
  switch (session.kind) {
    case "pending":
      return <PendingSlot form={signInForm} />;
    case "anonymous":
      return <SignInLink form={signInForm} />;
    case "client":
      return <SignedInMenu email={session.email} signOutHere={signOutHere} />;
    case "staff":
      // Staff are not told apart from each other: their menu holds the profile and the way out only.
      return <SignedInMenu email={undefined} signOutHere={signOutHere} />;
  }
}

/** The confirmation that "Ieși din cont" happened, or the sentence that it did not. The region is mounted from the first
 *  render on and only its words come and go, which is what a live region needs to be announced. */
function SignOutHereToast({
  outcome,
  outcomeId,
  onElapsed,
}: {
  readonly outcome: SignOutHereOutcome | undefined;
  readonly outcomeId: number;
  readonly onElapsed: () => void;
}) {
  const copy = useAccountControlCopy();
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;
  return createPortal(
    <StatusToast
      message={toastMessageOf(outcome, outcomeId, copy)}
      onElapsed={onElapsed}
    />,
    document.body,
  );
}

function toastMessageOf(
  outcome: SignOutHereOutcome | undefined,
  outcomeId: number,
  copy: AccountControlCopy,
): ToastMessage | undefined {
  switch (outcome) {
    case "signed-out":
      return { id: outcomeId, text: copy.signedOutToast };
    case "failed":
      return { id: outcomeId, text: copy.signOutFailed };
    case undefined:
      return undefined;
  }
}

/** What stands in the cell until the server has answered: the visitor's link, invisible. Most sessions are visitors,
 *  so the widest state is the one reserved, and the answer moves the bar only for someone signed in. */
function PendingSlot({ form }: { readonly form: SignInForm }) {
  return (
    <span className={styles.accountPending} data-form={form} aria-hidden="true">
      <SignInFace />
    </span>
  );
}

function SignInLink({ form }: { readonly form: SignInForm }) {
  const copy = useAccountControlCopy();
  const locale = useLocale();
  return (
    <a
      className={styles.accountSignIn}
      href={accountPathOf(locale, "login")}
      aria-label={copy.signIn}
      data-form={form}
      data-testid="top-bar-account-sign-in"
    >
      <SignInFace />
    </a>
  );
}

/** Both faces of the link; the stylesheet shows the one `data-form` asks for. The name is on the element that holds
 *  them, so the face that is shown or hidden changes nothing a screen reader is told. */
function SignInFace() {
  const copy = useAccountControlCopy();
  return (
    <>
      <span className={styles.accountSignInText}>{copy.signIn}</span>
      <span className={styles.accountGlyph} aria-hidden="true" />
    </>
  );
}

export interface AccountFormProbeRefs {
  readonly textRef: RefObject<HTMLSpanElement | null>;
  readonly iconRef: RefObject<HTMLSpanElement | null>;
}

/** The control's two forms, drawn hidden and outside the cell, for a host that decides between them from their measured
 *  widths: dropping the words cannot destroy the measurement that would bring them back. A signed-in person's control
 *  is the glyph in both, so the two measure alike and choosing between them returns nothing. Boxes of its own, because
 *  a probe sharing the host's would stretch every block-level probe in it to the widest. */
export function AccountFormProbes({ textRef, iconRef }: AccountFormProbeRefs) {
  const session = useAccountSession();
  const isSignedIn = session.kind === "client" || session.kind === "staff";
  return (
    <div className={styles.accountProbes} aria-hidden="true">
      <span className={styles.accountProbe}>
        <span
          ref={textRef}
          className={styles.accountSignIn}
          data-form={isSignedIn ? "icon" : "text"}
        >
          <SignInFace />
        </span>
      </span>
      <span className={styles.accountProbe}>
        <span ref={iconRef} className={styles.accountSignIn} data-form="icon">
          <SignInFace />
        </span>
      </span>
    </div>
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
          profileHref={accountPathOf(locale, "profile")}
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
  profileHref,
  isSignOutBusy,
  onClose,
  onSignOutHere,
  onSignOutEverywhere,
  returnFocusRef,
}: {
  readonly open: OpenState;
  readonly email: string | undefined;
  readonly kitchensHref: string | undefined;
  readonly profileHref: string;
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
        profileHref={profileHref}
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
  profileHref,
  isSignOutBusy,
  onClose,
  onSignOutHere,
  onSignOutEverywhere,
  returnFocusRef,
}: {
  readonly email: string | undefined;
  /** The client's list of kitchens; staff have none and are shown no row. */
  readonly kitchensHref: string | undefined;
  /** The account's own details, which every role keeps. */
  readonly profileHref: string;
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
          <MenuLinkRow label={copy.profile} href={profileHref} />
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
