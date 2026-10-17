import "server-only";

import type {
  DesignAccessor,
  VisitorResumeLookup,
} from "@lemnaria/persistence";
import { hasLocale } from "next-intl";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { routing, type AppLocale } from "@/i18n/routing";

import { designAccessorOf, readingAccountOf } from "./account/design-reader";
import { reportDesignFailure } from "./design-failure-log";
import { getRepository } from "./repository";
import {
  clearVisitorCookie,
  readVisitorCookieForResume,
  type CarriedVisitorCookie,
} from "./visitor";

/** The params shape both Route Handlers below receive from their identical `[locale]` segment. */
interface LocaleRouteParams {
  readonly params: Promise<{ locale: string }>;
}

/**
 * The whole of `[locale]/route.ts` and `[locale]/configurator/configure/route.ts`'s `GET`: both re-export this
 * rather than repeating the locale guard. An unsupported locale 404s before `resumeVisitor` reads any cookie.
 */
export async function resumeVisitorRoute(
  request: NextRequest,
  { params }: LocaleRouteParams,
): Promise<NextResponse> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return new NextResponse(null, { status: 404 });
  }
  return resumeVisitor(request, locale);
}

/**
 * `/[locale]` and `/[locale]/configurator/configure`'s shared body. It resumes the most recently updated design the
 * browser's visitor cookie or the signed-in client account owns (ADR 0169 D9); the account is the server's reading of
 * the session cookie and never anything the request says.
 *
 * Signed out, exactly as before accounts: no cookie resumes nothing and never calls the repository; a malformed one is
 * cleared without a query; a well-formed one matching a row redirects to it. A well-formed one matching nothing goes
 * to Step 1 and is cleared, but a lookup that throws leaves it untouched, because a database outage must never look
 * like "this browser has no design". Signed in as a client, the account is asked as well, and a malformed cookie is
 * still cleared whatever the lookup finds. A stale visitor cookie is cleared only when neither credential finds a
 * design, since one answer cannot say which of the two matched. Every branch is a redirect.
 */
export async function resumeVisitor(
  request: NextRequest,
  locale: AppLocale,
): Promise<NextResponse> {
  const carried = readVisitorCookieForResume(request.cookies);
  const account = await readingAccountOf(request.cookies);
  const accessor = designAccessorOf(visitorHashOf(carried), account);

  if (accessor === undefined) return toRoomClearingIfMalformed(locale, carried);

  const lookup = await resumeLookup(accessor);
  if (lookup === undefined) return toRoomClearingIfMalformed(locale, carried);
  if (lookup.kind === "found")
    return toDesignClearingIfMalformed(locale, lookup.id, carried);
  return carried.kind === "absent" ? toRoom(locale) : toRoomAndClear(locale);
}

function visitorHashOf(carried: CarriedVisitorCookie): string | undefined {
  return carried.kind === "well-formed" ? carried.hash : undefined;
}

/** `undefined` on a driver failure, distinct from the repository's own `{ kind: "none" }`: both redirect to
 *  Step 1, but only a real "no row" answer clears a well-formed cookie. */
async function resumeLookup(
  accessor: DesignAccessor,
): Promise<VisitorResumeLookup | undefined> {
  try {
    return await getRepository().resume(accessor);
  } catch (error) {
    // Carries no value, hash or id: `reportDesignFailure` is handed only the operation and the thrown value,
    // the same guarantee `mint`'s failures rely on.
    reportDesignFailure("resume", error);
    return undefined;
  }
}

const RESUME_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
} as const;

function toRoom(locale: AppLocale): NextResponse {
  return redirectTo(`/${locale}/configurator/room`);
}

function toRoomAndClear(locale: AppLocale): NextResponse {
  const response = toRoom(locale);
  clearVisitorCookie(response);
  return response;
}

/** A malformed cookie is cleared on every path, since no query could ever match it; any other state is left alone. */
function toRoomClearingIfMalformed(
  locale: AppLocale,
  carried: CarriedVisitorCookie,
): NextResponse {
  return carried.kind === "malformed" ? toRoomAndClear(locale) : toRoom(locale);
}

function toDesignClearingIfMalformed(
  locale: AppLocale,
  id: string,
  carried: CarriedVisitorCookie,
): NextResponse {
  const response = toDesign(locale, id);
  if (carried.kind === "malformed") clearVisitorCookie(response);
  return response;
}

function toDesign(locale: AppLocale, id: string): NextResponse {
  return redirectTo(`/${locale}/d/${encodeURIComponent(id)}`);
}

/**
 * A relative `Location`, built by hand: `NextResponse.redirect` requires an absolute URL, and
 * `new URL(path, request.url)` would reflect the request's own `Host` header into every redirect. So the
 * header is set directly on a plain 307.
 */
function redirectTo(location: string): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: { ...RESUME_RESPONSE_HEADERS, Location: location },
  });
}
