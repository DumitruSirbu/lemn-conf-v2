import createMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import {
  buildContentSecurityPolicy,
  CONTENT_SECURITY_POLICY_MODE,
  CSP_ENFORCED_HEADER,
  cspResponseHeaderName,
  NONCE_HEADER,
  SHARE_VIEW_HEADERS,
} from "@/lib/security-headers";

const handleLocaleRouting = createMiddleware(routing);

/**
 * Everything except the immutable build output and static files, which carry no scripts of their
 * own and already receive the static headers from `next.config.ts`.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|glb|gltf|hdr|bin|woff|woff2)$).*)",
  ],
};

export function proxy(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV !== "production",
  });
  const requestHeaders = withNonce(request.headers, nonce, policy);
  const securedRequest = new NextRequest(request, { headers: requestHeaders });

  const response = hasCaseVariantLocalePrefix(request.nextUrl.pathname)
    ? new NextResponse(null, { status: 404 })
    : isCustomerPath(request.nextUrl.pathname)
      ? handleLocaleRouting(securedRequest)
      : NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set(
    cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE),
    policy,
  );
  if (isSharePath(request.nextUrl.pathname)) applySharedViewHeaders(response);
  return response;
}

/**
 * D7: every response this path family produces — the unprefixed 307 (criterion 8) and the localized
 * page alike — carries the same three headers, set here rather than in the page so the redirect gets
 * them too. Applied **after** the CSP is set above, on the same response object `handleLocaleRouting`
 * already returned, so it never races the locale redirect it decorates.
 */
function applySharedViewHeaders(response: NextResponse): void {
  for (const { key, value } of SHARE_VIEW_HEADERS) {
    response.headers.set(key, value);
  }
}

function hasCaseVariantLocalePrefix(pathname: string): boolean {
  const [firstSegment] = pathname.split("/").filter(Boolean);
  if (firstSegment === undefined) return false;

  const normalizedSegment = firstSegment.toLowerCase();
  return (
    firstSegment !== normalizedSegment &&
    hasLocale(routing.locales, normalizedSegment)
  );
}

/**
 * The path with any locale prefix stripped, as segments — the shape both `isCustomerPath` and
 * `isSharePath` read the allow-list against, so a locale in front of either family is recognised the
 * same way.
 */
function localeStrippedSegments(pathname: string): string[] {
  const segments = pathname.split("/").filter(Boolean);
  return hasLocale(routing.locales, segments[0]) ? segments.slice(1) : segments;
}

/**
 * Only the customer route families below participate in locale routing. The configurator family is
 * an exact allow-list: `configure`, `contact`, and `room`; a nested room path is not a customer
 * route. A locale in front of `/api` or `/internal` remains an ordinary Next.js 404 candidate.
 */
function isCustomerPath(pathname: string): boolean {
  const routeSegments = localeStrippedSegments(pathname);

  if (routeSegments.length === 0) return true;
  if (
    routeSegments.length === 2 &&
    routeSegments[0] === "configurator" &&
    (routeSegments[1] === "configure" ||
      routeSegments[1] === "contact" ||
      routeSegments[1] === "room")
  )
    return true;
  if (
    routeSegments.length === 2 &&
    routeSegments[0] === "d" &&
    routeSegments[1] !== ""
  )
    return true;

  return isSharePath(pathname);
}

/** D7's allow-list addition: `s/{token}`, two segments with a non-empty second — the share view,
 *  gated the same way `d/{id}` is. Kept as its own predicate, not folded silently into
 *  `isCustomerPath`'s body, because `proxy()` also needs it on its own to decide `SHARE_VIEW_HEADERS`
 *  independently of locale routing. */
function isSharePath(pathname: string): boolean {
  const routeSegments = localeStrippedSegments(pathname);
  return (
    routeSegments.length === 2 &&
    routeSegments[0] === "s" &&
    routeSegments[1] !== ""
  );
}

/**
 * Next reads the *request* `Content-Security-Policy` to learn the nonce it must stamp onto its own
 * bootstrap scripts. It has to be the enforcing header name even while the response only reports —
 * otherwise Next would emit unnonced scripts and the report-only rollout would report every one of
 * them, drowning the real findings.
 */
function withNonce(
  requestHeaders: Headers,
  nonce: string,
  policy: string,
): Headers {
  const headers = new Headers(requestHeaders);
  headers.set(NONCE_HEADER, nonce);
  headers.set(CSP_ENFORCED_HEADER, policy);
  return headers;
}

function createNonce(): string {
  return btoa(crypto.randomUUID());
}
