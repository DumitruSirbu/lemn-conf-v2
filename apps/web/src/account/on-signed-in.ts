import type { AppLocale } from "@/i18n/routing";

import { startPathOf } from "./account-shell";

// The one way out of a successful sign-in, for every page that ends in one (the login now; the confirm page after it).

export interface SignedIn {
  readonly locale: AppLocale;
  /** How many designs made before signing in the account could claim. */
  readonly claimable: number;
}

/** What the page does to ask the person whether to claim that many designs: it draws the claim dialog on itself. */
export type AskToClaim = (claimable: number) => void;

/**
 * Where a successful sign-in goes next. Designs the account could claim are asked about first, on this page, before it
 * leaves, because the session is already set and claiming is the person's to confirm (ADR 0172 D8, Amendment B).
 * Nothing to claim leaves at once.
 */
export function onSignedIn(
  { locale, claimable }: SignedIn,
  askToClaim: AskToClaim,
): void {
  if (claimable > 0) {
    askToClaim(claimable);
    return;
  }
  leaveForStart(locale);
}

/** A full document load to the start of the configurator, so the new session is read by a page with no stale state. A
 *  router action is never used on these pages: a token page's address is rewritten by it (Lot 1 review, criterion 15). */
export function leaveForStart(locale: AppLocale): void {
  leaveFor(startPathOf(locale));
}

/** The same full load to any path. */
export function leaveFor(path: string): void {
  window.location.assign(path);
}
