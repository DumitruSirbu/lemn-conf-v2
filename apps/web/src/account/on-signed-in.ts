import type { AppLocale } from "@/i18n/routing";

import { startPathOf } from "./account-shell";

// The one way out of a successful sign-in, for every page that ends in one (the login now; the confirm page after it).

export interface SignedIn {
  readonly locale: AppLocale;
  /** How many designs made before signing in the account could claim. Not acted on yet: the claim dialog opens from
   *  here, on the account page, before it leaves. */
  readonly claimable: number;
}

/** A full document load to the start of the configurator, so the new session is read by a page with no stale state. */
export function onSignedIn({ locale }: SignedIn): void {
  window.location.assign(startPathOf(locale));
}
