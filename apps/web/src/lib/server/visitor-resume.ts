import "server-only";

import type { VisitorResumeLookup } from "@lemnaria/persistence";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import type { AppLocale } from "@/i18n/routing";

import { reportDesignFailure } from "./design-failure-log";
import { getRepository } from "./repository";
import { clearVisitorCookie, readVisitorCookieForResume } from "./visitor";

/**
 * `/[locale]` and `/[locale]/configurator/configure`'s shared body (M7 wave 7E3a S3, D3/D5).
 *
 * The matrix is exactly D3's: no cookie resumes nothing and calls the repository not at all; a
 * malformed one is cleared without a query; a well-formed one that matches a row redirects to it; a
 * well-formed one that matches nothing, or a lookup that throws, sends the visitor to Step 1 — the
 * first clearing the cookie, the second leaving it untouched, because a database outage must never
 * look like "this browser has no design" (D3).
 *
 * Both routes call this and nothing else. Neither ever renders the editor: every branch below is a
 * redirect, and the two pages that used to mount it are deleted, not merely un-linked.
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

/** `undefined` on a driver failure, distinct from the repository's own `{ kind: "none" }` — the
 *  caller treats the two identically in *where* they redirect (both go to Step 1), but only a real
 *  "no row" answer clears the cookie; a failure must not be mistaken for one. */
async function resumeLookup(
  visitorHash: string,
): Promise<VisitorResumeLookup | undefined> {
  try {
    return await getRepository().resumeVisitor(visitorHash);
  } catch (error) {
    // D3: carries no value, hash or id — `reportDesignFailure` is handed only the operation and the
    // thrown value, which excludes all three structurally, the same guarantee `mint`'s failures rely
    // on.
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
 * A relative `Location`, built by hand rather than through `NextResponse.redirect` — that helper
 * requires an absolute URL (`new URL(path, request.url)` would reflect the request's own `Host`
 * header into every redirect) and throws on anything else. The plan is explicit that this response
 * must never do that (D5), so the header is set directly on a plain 307.
 */
function redirectTo(location: string): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: { ...RESUME_RESPONSE_HEADERS, Location: location },
  });
}
