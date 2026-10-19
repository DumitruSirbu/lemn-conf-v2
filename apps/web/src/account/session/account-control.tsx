"use client";

import { useLocale } from "next-intl";
import { useCallback, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { trapTab, useModalFocus } from "@/components/use-modal-focus";
import { useAccountControlCopy } from "@/i18n/use-content";

import { accountPathOf } from "../account-shell";
import styles from "../account.module.css";
import {
  useAccountSession,
  type AccountSessionState,
} from "./use-account-session";

// The account control in the configurator's top bar: one cell for the host's grid or flex row, holding the visitor's way
// in or the signed-in client's menu.
//
// The way in is a plain anchor, never the router's link: an account page is a document of its own, with a policy and a
// nonce of its own, so a soft navigation would carry the wrong ones.
//
// The menu is not drawn inside the cell but rendered into the screen's own `<main>`. The modal behaviour marks every
// band of the `<main>` but the one holding the dialog inert, and both top bars are bands of it (the room's is a single
// one): a dialog nested in the bar would leave the whole bar operable.

export interface AccountControlProps {
  /** The host's cell: where it stands in the bar, and the band's paper and rule it draws. */
  readonly cellClassName: string;
}

export function AccountControl({ cellClassName }: AccountControlProps) {
  const session = useAccountSession();
  // Staff have no kitchens or profile and the staff area is not built, so until their menu has rows there is nothing
  // for it to hold and the bar draws no control for them.
  if (session.kind === "staff") return null;
  return (
    <div className={cellClassName} data-testid="top-bar-account">
      <ControlFor session={session} />
    </div>
  );
}

function ControlFor({
  session,
}: {
  readonly session: Exclude<AccountSessionState, { kind: "staff" }>;
}) {
  switch (session.kind) {
    case "pending":
      return <PendingSlot />;
    case "anonymous":
      return <SignInLink />;
    case "client":
      return <ClientMenu email={session.email} />;
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

/** The client's icon and, once it is pressed, their menu in the screen's `<main>`. */
function ClientMenu({ email }: { readonly email: string }) {
  const copy = useAccountControlCopy();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [screen, setScreen] = useState<HTMLElement | undefined>(undefined);
  const open = useCallback(() => {
    setScreen(triggerRef.current?.closest("main") ?? document.body);
  }, []);
  const close = useCallback(() => {
    setScreen(undefined);
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.accountIcon}
        aria-label={copy.menuName}
        aria-haspopup="dialog"
        aria-expanded={screen !== undefined}
        data-testid="top-bar-account-trigger"
        onClick={open}
      >
        <span className={styles.accountGlyph} aria-hidden="true" />
      </button>
      {screen === undefined
        ? null
        : createPortal(
            <AccountMenu
              email={email}
              onClose={close}
              returnFocusRef={triggerRef}
            />,
            screen,
          )}
    </>
  );
}

/** The sheet on a phone and the popover on a desktop: one surface, which of the two is the stylesheet's to say. */
function AccountMenu({
  email,
  onClose,
  returnFocusRef,
}: {
  readonly email: string;
  readonly onClose: () => void;
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
        <div className={styles.menuIdentity}>
          <span className={styles.menuIdentityLabel}>{copy.signedInAs}</span>
          <span className={styles.menuIdentityEmail}>{email}</span>
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
