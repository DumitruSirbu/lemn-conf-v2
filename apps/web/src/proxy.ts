import createMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { selectNetworkSource } from "@/lib/server/rate-limit/network-source";
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

/** The one status of a response the interceptor passes on to its page: not the locale's redirect and not a `404`. */
const PASSED_ON_STATUS = 200;

/** Written here and not through the design log, whose module holds the limiter's chain: this file may import none of
 *  that statically, so a limiter that cannot load can still say so. */
const LIMITER_LOG_LABEL = "[designs]";
const LIMITER_UNAVAILABLE_EVENT = "design-read-limiter-unavailable";

/**
 * Everything except the immutable build output and static files, which carry no scripts and already receive the static
 * headers from `next.config.ts`; and, whatever their last segment ends in, the design and share families. The
 * framework routes `/ro/d/abc.png` to the design's page with the id `abc.png`, so an address of either family that
 * ends in a static extension must still reach this file, or its lookup runs uncounted. The patterns are literals:
 * the framework reads a matcher at build time.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|glb|gltf|hdr|bin|woff|woff2)$).*)",
    "/:locale/d/:id",
    "/:locale/s/:token",
  ],
};

/**
 * A request is handed back as the response itself, never as a promise, unless it is a counted page read under a named
 * network source: only that one waits, for the limiter's judgement. Everything else, every request under no source
 * included, answers as it did before pages were counted.
 */
export function proxy(
  request: NextRequest,
): NextResponse | Promise<NextResponse> {
  const nonce = createNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV !== "production",
  });
  const requestHeaders = withNonce(request.headers, nonce, policy);
  const securedRequest = new NextRequest(request, { headers: requestHeaders });

  const response = hasMisspelledLocalePrefix(request.nextUrl.pathname)
    ? new NextResponse(null, { status: 404 })
    : isCustomerPath(request.nextUrl.pathname)
      ? handleLocaleRouting(securedRequest)
      : NextResponse.next({ request: { headers: requestHeaders } });

  applyPageHeaders(response, { pathname: request.nextUrl.pathname, policy });
  if (!isCountedPageRead(request, response)) return response;
  return answerCountedRead({ request, response, policy });
}

/** The headers a page's answer gets, set on a served page and on a refused one alike. */
function applyPageHeaders(
  response: NextResponse,
  { pathname, policy }: { pathname: string; policy: string },
): void {
  response.headers.set(
    cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE),
    policy,
  );
  if (isSharePath(pathname)) applySharedViewHeaders(response);
}

/**
 * A page read the limiter is asked about: `/` of a locale, a design's page or one of its three steps, or a share's
 * view, which the interceptor would pass on (not the locale's redirect, not the `404` of a misspelled locale), and
 * only where the owner has named a network source. Nothing under `/api` is one, nor a static file; under none nothing
 * is asked and nothing of the limiter is loaded.
 */
function isCountedPageRead(
  request: NextRequest,
  response: NextResponse,
): boolean {
  if (response.status !== PASSED_ON_STATUS) return false;
  const { pathname } = request.nextUrl;
  const segments = localeStrippedSegments(pathname);
  const isCountedPath =
    segments.length === 0 || isDesignPath(segments) || isSharePath(pathname);
  return isCountedPath && selectNetworkSource(process.env).kind !== "none";
}

interface CountedRead {
  readonly request: NextRequest;
  readonly response: NextResponse;
  readonly policy: string;
}

/** The page's own response unless the limiter refuses the read; whatever goes wrong is the page's own response. */
async function answerCountedRead({
  request,
  response,
  policy,
}: CountedRead): Promise<NextResponse> {
  const refusal = await refusalOfPageReadOrNothing(request);
  if (refusal === undefined) return response;
  applyPageHeaders(refusal, { pathname: request.nextUrl.pathname, policy });
  return refusal;
}

/**
 * The limiter is reached by one dynamic import, and only from here, so its store, its digest, its `server-only` chain
 * and the message files it reads for a refusal load when a source is named and not before. A chain that cannot load
 * or run is one line for a process and an error's name, and the page is served. Nothing thrown is kept but its name.
 */
async function refusalOfPageReadOrNothing(
  request: NextRequest,
): Promise<NextResponse | undefined> {
  try {
    const { refusalOfPageRead: judge } = await import(
      "@/lib/server/rate-limit/page-limit-response"
    );
    return await judge(request.headers, request.nextUrl.pathname);
  } catch (failure) {
    announceUnavailableLimiter(failure);
    return undefined;
  }
}

const announcedLimiterFailures = new Set<string>();

function announceUnavailableLimiter(failure: unknown): void {
  const errorName = failure instanceof Error ? failure.name : "unknown";
  if (announcedLimiterFailures.has(errorName)) return;
  announcedLimiterFailures.add(errorName);
  console.warn(LIMITER_LOG_LABEL, {
    event: LIMITER_UNAVAILABLE_EVENT,
    errorName,
  });
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

/**
 * A locale is written one way, and anything else that reads as one is refused as a case variant always was: a first
 * segment that is not itself a locale but is one once decoded and lowered (`RO`, `%72o`, `r%6F`). The framework matches
 * a locale decoded, so such a path would be served a page that every rule keyed on the written path misses: its count
 * and a share view's headers. Only the first segment is decoded, once; a segment that cannot be decoded is the
 * framework's to answer.
 */
function hasMisspelledLocalePrefix(pathname: string): boolean {
  const [firstSegment] = pathname.split("/").filter(Boolean);
  if (firstSegment === undefined) return false;
  if (hasLocale(routing.locales, firstSegment)) return false;

  const decoded = decodedOrUndefined(firstSegment);
  return (
    decoded !== undefined && hasLocale(routing.locales, decoded.toLowerCase())
  );
}

function decodedOrUndefined(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
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
