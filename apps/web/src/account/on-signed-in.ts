import type { AppLocale } from "@/i18n/routing";

import { accountPathOf, startPathOf } from "./account-shell";
import { askSessionOnce } from "./session/use-account-session";

// The one way out of a successful sign-in, for every page that ends in one (the login now; the confirm page after it).

/** Where a finished sign-in goes. */
export interface Destination {
  readonly locale: AppLocale;
  /** The design the person was sent here from, as `returnPathOf` parsed it; `undefined` for the start of the
   *  configurator. */
  readonly returnPath: string | undefined;
}

export interface SignedIn extends Destination {
  /** How many designs made before signing in the account could claim. */
  readonly claimable: number;
}

/** What the page does to ask the person whether to claim that many designs: it draws the claim dialog on itself. */
export type AskToClaim = (claimable: number) => void;

/**
 * Where a successful sign-in goes next. Designs the account could claim are asked about first, on this page, before it
 * leaves, because the session is already set and claiming is the person's to confirm (ADR 0172 D8, Amendment B).
 * Nothing to claim leaves at once. The way back to the open kitchen is taken only after that question is answered.
 */
export function onSignedIn(
  { claimable, ...destination }: SignedIn,
  askToClaim: AskToClaim,
): void {
  if (claimable > 0) {
    askToClaim(claimable);
    return;
  }
  leaveAfterSignIn(destination);
}

/** A full document load to where a finished sign-in goes: the kitchen the person came from when there is one; else, for
 *  a client, their list of kitchens; else the start of the configurator. The load means the new session is read by a page
 *  with no stale state. A router action is never used on these pages: a token page's address is rewritten by it (Lot 1
 *  review, criterion 15). */
export function leaveAfterSignIn({ locale, returnPath }: Destination): void {
  if (returnPath !== undefined) {
    leaveFor(returnPath);
    return;
  }
  void defaultLandingPathOf(locale).then(leaveFor);
}

/** The sign-in answer says nothing of the role, so the session is asked who just signed in. Only a client has a list of
 *  kitchens to land on; anyone else, and a session that cannot be read, lands on the start of the configurator. */
async function defaultLandingPathOf(locale: AppLocale): Promise<string> {
  const session = await askSessionOnce();
  return session?.kind === "client"
    ? accountPathOf(locale, "kitchens")
    : startPathOf(locale);
}

/** The same full load to any path. */
export function leaveFor(path: string): void {
  window.location.assign(path);
}
