import "server-only";

import type { NextRequest } from "next/server";

/**
 * D6 (ADR 0114 Amendment F3): a cross-site top-level form `POST` carries no `SameSite=Lax` cookie,
 * and its response — a top-level navigation — *may* still set one. An unguarded mint would replace
 * a victim's visitor identity with a fresh one on exactly that response, so `api/designs/route.ts`
 * runs this before either cookie is read or any row is minted.
 *
 * `Sec-Fetch-Site` is the primary signal: browsers attach it to every fetch and navigation and a
 * page cannot forge or suppress it. It is trusted when present, whatever `Origin` says. Only when a
 * client sends neither header at all — old browsers, or a non-browser caller — does a foreign
 * `Origin` alone trigger the refusal; neither header present is accepted, which is what keeps every
 * existing same-origin caller (Step 1's `fetch`, the e2e fixture) unaffected.
 *
 * **Extracted for reuse, unchanged** (M7 wave 7E3c D5): `SameSite=Lax` withholds both cookies from a
 * cross-site request, but not from a *same-site* sibling origin, and a simple `POST`/`DELETE`/`GET`
 * needs no preflight — so the share route applies this same predicate to all three of its methods,
 * where a re-issue or a revoke from a same-site sibling could otherwise cut off the owner's link.
 */
export function isCrossSiteRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite !== null) return secFetchSite !== "same-origin";

  const origin = request.headers.get("origin");
  if (origin === null) return false;
  return origin !== request.nextUrl.origin;
}
