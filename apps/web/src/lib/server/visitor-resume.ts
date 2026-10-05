import "server-only";

import type { VisitorResumeLookup } from "@lemnaria/persistence";
import { hasLocale } from "next-intl";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { routing, type AppLocale } from "@/i18n/routing";

import { reportDesignFailure } from "./design-failure-log";
import { getRepository } from "./repository";
import { clearVisitorCookie, readVisitorCookieForResume } from "./visitor";

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
 * `/[locale]` and `/[locale]/configurator/configure`'s shared body. No cookie resumes nothing and never calls the
 * repository; a malformed one is cleared without a query; a well-formed one matching a row redirects to it. A
 * well-formed one matching nothing goes to Step 1 and is cleared, but a lookup that throws leaves it untouched,
 * because a database outage must never look like "this browser has no design". Every branch is a redirect.
 */
export async function resumeVisitor(
  request: NextRequest,
  locale: AppLocale,
): Promise<NextResponse> {
  const carried = readVisitorCookieForResume(request.cookies);

  if (carried.kind === "absent") return toRoom(locale);
  if (carried.kind === "malformed") return toRoomAndClear(locale);

  const lookup = await resumeLookup(carried.hash);
  if (lookup === undefined) return toRoom(locale);
  return lookup.kind === "found"
    ? toDesign(locale, lookup.id)
    : toRoomAndClear(locale);
}

/** `undefined` on a driver failure, distinct from the repository's own `{ kind: "none" }`: both redirect to
 *  Step 1, but only a real "no row" answer clears the cookie. */
async function resumeLookup(
  visitorHash: string,
): Promise<VisitorResumeLookup | undefined> {
  try {
    return await getRepository().resumeVisitor(visitorHash);
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
