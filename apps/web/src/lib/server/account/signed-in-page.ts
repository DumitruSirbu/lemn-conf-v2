import "server-only";

import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { notFound, redirect } from "next/navigation";

import type { Capability } from "@lemnaria/configurator-domain";

import type { LoginArrival } from "@/account/login-arrival";
import { routing, type AppLocale } from "@/i18n/routing";
import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  readCurrentSessionOrThrow,
  type CurrentSession,
  type SignedInSession,
} from "@/lib/server/account/current-session";
import { requireCapability } from "@/lib/server/account/require-capability";
import {
  carriesSessionCookie,
  type SessionCookieReader,
} from "@/lib/server/account/session-cookie";

// The gate of every signed-in account page (M8B Lot 2 plan, U1; ADR 0172 decisions 3 and 7). A page asks it for the
// session and the capability it needs and gets the session or the one state it must draw, `forbidden` or
// `unavailable`. Anything else leaves by a redirect, so a page never renders for a person who is not signed in. It
// reads and never writes: a render sets no cookie, clears none and does not mark the session seen.

const SESSION_EXPIRED_ARRIVAL: LoginArrival = "session-expired";

export type SignedInPageRead =
  | { readonly kind: "signed-in"; readonly session: SignedInSession }
  /** A live session whose account may not open this page. The page draws the 403 screen, never "session expired". */
  | { readonly kind: "forbidden" }
  /** The session store could not be read, so nobody can say whether the session is live. The page draws a notice
   *  and sends no one to sign in. */
  | { readonly kind: "unavailable" };

/**
 * Four answers, told by whether the request carried a session cookie and what the session store says of it:
 *
 * - **No session cookie at all** (never signed in, signed out, or the browser dropped it): the plain login page, with
 *   no reason, because nothing expired.
 * - **A cookie that names no live session** (revoked, idle- or absolutely expired, or malformed): the login page with
 *   `reason=session-expired`.
 * - **A store that cannot be read:** `unavailable`, logged. The read that throws is used so that an outage is never
 *   mistaken for an expired session.
 * - **A live session without the capability** (a staff role on a client page, or an unconfirmed address): `forbidden`.
 *
 * The locale is checked here, not trusted: one that is not the site's is a `404`. The redirect throws the
 * framework's own signal, so it is never called inside a `try`.
 */
export async function readSignedInPage({
  locale,
  capability,
}: {
  locale: string;
  capability: Capability;
}): Promise<SignedInPageRead> {
  if (!hasLocale(routing.locales, locale)) notFound();
  const cookieStore = await cookies();
  const session = await sessionOrUndefined(cookieStore);
  if (session === undefined) return { kind: "unavailable" };
  if (session.kind === "anonymous") {
    return redirectToLogin(locale, carriesSessionCookie(cookieStore));
  }
  return requireCapability(session, capability).kind === "allowed"
    ? { kind: "signed-in", session }
    : { kind: "forbidden" };
}

/** The session the cookie names, or nothing when the store could not be read. */
async function sessionOrUndefined(
  cookieStore: SessionCookieReader,
): Promise<CurrentSession | undefined> {
  try {
    return await readCurrentSessionOrThrow(cookieStore);
  } catch {
    reportAccountEvent({ event: "session-read", outcome: "unavailable" });
    return undefined;
  }
}

function redirectToLogin(locale: AppLocale, hadSessionCookie: boolean): never {
  const loginPath = `/${locale}/account/login`;
  return redirect(
    hadSessionCookie
      ? `${loginPath}?reason=${SESSION_EXPIRED_ARRIVAL}`
      : loginPath,
  );
}
