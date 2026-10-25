import "server-only";

import type { ProfileValues } from "@/account/profile/profile-values";
import type { AppLocale } from "@/i18n/routing";
import { reportAccountEvent } from "@/lib/server/account/account-log";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import {
  readSignedInPage,
  redirectToLogin,
} from "@/lib/server/account/signed-in-page";

// What the profile page is given (M8B Lot 2, A10): the signed-in account's own optional details, read on the server so
// the form is drawn filled. It reads and never writes. The gate's answers (`forbidden`, `unavailable`) pass through; a
// profile store that cannot be read is `unavailable` too, since the form without the stored values would invite a save
// that clears them.

export type ProfilePageRead =
  | {
      readonly kind: "signed-in";
      /** The session's own address, shown as text: changing it is a separate page. */
      readonly email: string;
      readonly profile: ProfileValues;
    }
  | { readonly kind: "forbidden" }
  | { readonly kind: "unavailable" };

/** Redirects, as the gate does, when the session is not live; an account the session names but the table has lost reads
 *  as a session that is no longer live. */
export async function readProfilePage(
  locale: AppLocale,
): Promise<ProfilePageRead> {
  const gate = await readSignedInPage({
    locale,
    capability: "account.manage.own",
  });
  if (gate.kind !== "signed-in") return gate;
  const stored = await storedProfileOf(gate.session.accountId);
  if (stored === undefined) return { kind: "unavailable" };
  if (stored === "no-account") return redirectToLogin(locale, true);
  return { kind: "signed-in", email: gate.session.email, profile: stored };
}

/** The values, `"no-account"` for an account the table no longer holds, or nothing when the store could not be read. */
async function storedProfileOf(
  accountId: string,
): Promise<ProfileValues | "no-account" | undefined> {
  try {
    const lookup = await getAccountStore().findProfile(accountId);
    if (lookup.kind === "none") return "no-account";
    const { name, address, phone } = lookup.profile;
    return { name: name ?? "", address: address ?? "", phone: phone ?? "" };
  } catch {
    reportAccountEvent({ event: "profile", outcome: "unavailable" });
    return undefined;
  }
}
