"use client";

import { useLocale } from "next-intl";
import { useId, useState, type MouseEvent } from "react";

import {
  readStepOneAccountCardLatch,
  recordStepOneAccountCardOffered,
} from "@/app/configurator/configure/back-guard";
import { useVisitorAccountCardCopy } from "@/i18n/use-content";

import { accountPathOf } from "../account-shell";
import styles from "../account.module.css";
import {
  isSessionAnswerDefinite,
  isSignedOutByPerson,
  useAccountSession,
  wasSignedInOnThisDocument,
  type AccountSessionState,
} from "./use-account-session";

// "Am păstrat bucătăria." (Lot 2 frames A16B / DA16B, re-triggered under autosave; plan M8B Lot 2 section 14.2, U15-4):
// the card Step 1 shows, once, to a visitor who has just confirmed leaving an edited editor. It says the kitchen is kept
// in this browser and can be attached to an account, which is true because every kitchen is saved as it is edited and a
// signed-out one is claimable (D8).
//
// It is a card and not the frames' sheet: nothing is asked of the visitor, so it takes no focus, marks nothing inert and
// has no scrim, and Step 1 stays operable under it. It writes nothing to the browser; the one fact it needs, that an
// edited editor was left, is the Back confirmation's module record (`back-guard.ts`).
//
// "Creează cont" is a plain link, so the register page is a full document load (criterion 14 of Lot 1) and the visitor's
// browser carries the kitchens it will offer to attach. No `returnTo` is set: nothing was refused.

export function VisitorAccountCard() {
  const copy = useVisitorAccountCardCopy();
  const locale = useLocale();
  const session = useAccountSession();
  const [isDismissed, setIsDismissed] = useState(false);
  const titleId = useId();

  if (isDismissed || !isOwedTo(session)) return null;

  function dismiss(event: MouseEvent<HTMLButtonElement>): void {
    // The button is about to unmount, which would drop focus to the document: it goes to the screen, the stable thing
    // that stays (`room-screen.tsx` makes its `<main>` focusable for this).
    event.currentTarget.closest("main")?.focus();
    recordStepOneAccountCardOffered();
    setIsDismissed(true);
  }

  return (
    <section
      className={styles.visitorCard}
      aria-labelledby={titleId}
      data-testid="visitor-account-card"
    >
      <p id={titleId} className={styles.visitorCardTitle}>
        {copy.title}
      </p>
      <p className={styles.visitorCardBody}>{copy.body}</p>
      <div className={styles.visitorCardActions}>
        <a
          className={styles.dialogPrimary}
          href={accountPathOf(locale, "register")}
          data-testid="visitor-account-card-create"
        >
          {copy.createAccount}
        </a>
        <button
          type="button"
          className={styles.dialogSecondary}
          onClick={dismiss}
          data-testid="visitor-account-card-not-now"
        >
          {copy.notNow}
        </button>
      </div>
    </section>
  );
}

/**
 * Whether the card is owed to whoever is on this screen: an edited editor was left and the card has not had its showing,
 * and the server has said, on this document, that nobody is signed in. A signed-in client or staff member, a session
 * not yet answered, a read that failed (it reads as anonymous and says nothing) and anyone who was signed in on this
 * document are all refused. The last covers a person's own sign-out and a session that expired: the kitchen they left is
 * already their account's, so "can be attached" would be false.
 */
function isOwedTo(session: AccountSessionState): boolean {
  return (
    readStepOneAccountCardLatch() === "due" &&
    session.kind === "anonymous" &&
    isSessionAnswerDefinite() &&
    !isSignedOutByPerson() &&
    !wasSignedInOnThisDocument()
  );
}
