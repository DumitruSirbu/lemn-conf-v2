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

/** The pages after a design's editor, in the order the customer meets them: `/d/{id}/review`, `/contact`, `/done`. */
const DESIGN_STEP_SEGMENTS: readonly string[] = ["review", "contact", "done"];

/** Everything except the immutable build output and static files, which carry no scripts and already receive the
 *  static headers from `next.config.ts`. */
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
 * Every response this path family produces, the unprefixed 307 and the localized page alike, carries
 * `SHARE_VIEW_HEADERS`, set here so the redirect gets them too. Applied after the CSP is set, on the response
 * `handleLocaleRouting` already returned, so it never races the locale redirect it decorates.
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

/** The path with any locale prefix stripped, as segments: `isCustomerPath` and `isSharePath` read the allow-list
 *  through it, so a locale in front of either family is recognised the same way. */
function localeStrippedSegments(pathname: string): string[] {
  const segments = pathname.split("/").filter(Boolean);
  return hasLocale(routing.locales, segments[0]) ? segments.slice(1) : segments;
}

/**
 * Only the customer route families participate in locale routing. The configurator family is an exact allow-list
 * (`configure`, `contact`, `room`); a nested room path is not a customer route. A locale in front of `/api` or
 * `/internal` stays an ordinary Next.js 404 candidate.
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
  if (isDesignPath(routeSegments)) return true;

  return isSharePath(pathname);
}

/** The design family's allow-list entry: `d/{id}`, or `d/{id}/{step}` for exactly the steps `DESIGN_STEP_SEGMENTS`
 *  names. The id is a non-empty segment; nothing longer and no other step name is admitted. */
function isDesignPath(routeSegments: string[]): boolean {
  const [family, id, step] = routeSegments;
  if (family !== "d" || id === undefined || id === "") return false;
  if (routeSegments.length === 2) return true;
  return (
    routeSegments.length === 3 &&
    step !== undefined &&
    DESIGN_STEP_SEGMENTS.includes(step)
  );
}

/** The share view's allow-list entry: `s/{token}`, two segments with a non-empty second, gated like `d/{id}`. Its
 *  own predicate because `proxy()` also needs it alone to decide `SHARE_VIEW_HEADERS`. */
function isSharePath(pathname: string): boolean {
  const routeSegments = localeStrippedSegments(pathname);
  return (
    routeSegments.length === 2 &&
    routeSegments[0] === "s" &&
    routeSegments[1] !== ""
  );
}

/**
 * Next reads the request `Content-Security-Policy` to learn the nonce for its own bootstrap scripts, so it must be
 * the enforcing header name even while the response only reports: otherwise Next would emit unnonced scripts and the
 * report-only rollout would report every one of them.
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
