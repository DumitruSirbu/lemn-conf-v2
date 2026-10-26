import createMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { selectNetworkSource } from "@/lib/server/rate-limit/network-source";
import {
  ACCOUNT_PAGE_HEADERS,
  ACCOUNT_TOKEN_PAGE_HEADERS,
  buildContentSecurityPolicy,
  CONTENT_SECURITY_POLICY_MODE,
  CSP_ENFORCED_HEADER,
  cspResponseHeaderName,
  NONCE_HEADER,
  PRESET_IMAGE_CONTENT_SECURITY_POLICY,
  SHARE_VIEW_HEADERS,
  TURNSTILE_FRAME_SOURCES,
} from "@/lib/security-headers";

const handleLocaleRouting = createMiddleware(routing);

/** The pages after a design's editor, in the order the customer meets them: `/d/{id}/review`, `/contact`, `/done`. */
const DESIGN_STEP_SEGMENTS: readonly string[] = ["review", "contact", "done"];

/** The account screens, `/{locale}/account/{page}`. Only the three challenge pages show a Turnstile challenge (ADR 0172
 *  D5: on register, login and the reset request). The token pages read a single-use token from the address fragment
 *  and the signed-in pages hold the person's own data; none of them loads a third-party script, frame or image at
 *  all, so their policy is the site's (L8 obligation, plan L13; Lot 2 plan, P3). */
const ACCOUNT_FAMILY_SEGMENT = "account";
const ACCOUNT_CHALLENGE_PAGES: readonly string[] = [
  "register",
  "login",
  "forgot-password",
];
const ACCOUNT_TOKEN_PAGES: readonly string[] = [
  "verify-email",
  "reset-password",
  "confirm-email",
  "revert-email",
];
const ACCOUNT_SIGNED_IN_PAGES: readonly string[] = [
  "kitchens",
  "profile",
  "password",
  "export",
  "delete",
];

/** The staff area, `/{locale}/staff/{page}` and `/{locale}/staff/kitchens/{id}`. Every page holds clients' data, so each
 *  gets the account pages' headers; none loads a third-party script, frame or image. */
const STAFF_FAMILY_SEGMENT = "staff";
const STAFF_KITCHENS_PAGE = "kitchens";
const STAFF_SIGNED_IN_PAGES: readonly string[] = [
  STAFF_KITCHENS_PAGE,
  "team",
  "presets",
  "audit",
];

/** The price dashboard's family, `/{locale}/staff/catalog/{section}` and `/{locale}/staff/catalog/{section}/{id}`: the
 *  sections are a closed list (spelled again here because this file may not import the domain; a test holds the two
 *  lists equal) and the id is any non-empty segment, as a kitchen's is. Every page holds the manufacturer's prices, so
 *  each gets the staff pages' headers. */
const STAFF_CATALOG_SEGMENT = "catalog";
const STAFF_CATALOG_SECTIONS: readonly string[] = [
  "cabinets",
  "hardware",
  "materials",
  "accessories",
  "defaults",
  "publish",
];

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
 * ends in a static extension must still reach this file, or its lookup runs uncounted. A staff kitchen's address is
 * the same, and so is a catalog item's: it must carry the staff headers whatever its id ends in. The patterns are literals:
 * the framework reads a matcher at build time.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|glb|gltf|hdr|bin|woff|woff2)$).*)",
    "/:locale/d/:id",
    "/:locale/s/:token",
    "/:locale/staff/kitchens/:id",
    "/:locale/staff/catalog/:section/:id",
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
    frameSources: isAccountChallengePath(request.nextUrl.pathname)
      ? TURNSTILE_FRAME_SOURCES
      : [],
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

/** The headers a page's answer gets, set on a served page and on a refused one alike. A stored preset's image is not a
 *  page: it gets the closed policy of `PRESET_IMAGE_CONTENT_SECURITY_POLICY`, enforced whatever the page policy's mode. */
function applyPageHeaders(
  response: NextResponse,
  { pathname, policy }: { pathname: string; policy: string },
): void {
  if (isPresetImagePath(pathname)) {
    response.headers.set(
      CSP_ENFORCED_HEADER,
      PRESET_IMAGE_CONTENT_SECURITY_POLICY,
    );
    return;
  }
  response.headers.set(
    cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE),
    policy,
  );
  if (isSharePath(pathname)) applySharedViewHeaders(response);
  if (isAccountPath(pathname) || isStaffPath(pathname)) {
    applyAccountPageHeaders(response);
  }
  if (isAccountTokenPath(pathname)) applyAccountTokenPageHeaders(response);
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

function applyAccountPageHeaders(response: NextResponse): void {
  for (const { key, value } of ACCOUNT_PAGE_HEADERS) {
    response.headers.set(key, value);
  }
}

function applyAccountTokenPageHeaders(response: NextResponse): void {
  for (const { key, value } of ACCOUNT_TOKEN_PAGE_HEADERS) {
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

/** An account screen: a real locale first, then exactly `account/{page}` for a page named above. A path written any
 *  other way (no locale, a case variant, a longer path) is not one and gets the site's policy. */
function isAccountPath(pathname: string): boolean {
  return isAccountPageIn(pathname, [
    ...ACCOUNT_CHALLENGE_PAGES,
    ...ACCOUNT_TOKEN_PAGES,
    ...ACCOUNT_SIGNED_IN_PAGES,
  ]);
}

/** A staff page: a real locale, then `staff/{page}` for a page named above, `staff/kitchens/{id}` with a non-empty id,
 *  or a page of the price dashboard's family. A path written any other way (no locale, a case variant, an escaped
 *  segment, a longer path) is not one. */
function isStaffPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const [locale, family, page] = segments;
  if (!hasLocale(routing.locales, locale) || family !== STAFF_FAMILY_SEGMENT) {
    return false;
  }
  if (page === STAFF_CATALOG_SEGMENT) return isStaffCatalogPath(segments);
  if (page === undefined || !STAFF_SIGNED_IN_PAGES.includes(page)) return false;
  const isKitchenWithId = page === STAFF_KITCHENS_PAGE && segments.length === 4;
  return segments.length === 3 || isKitchenWithId;
}

/** `catalog/{section}` or `catalog/{section}/{id}`, the locale and the family already checked. */
function isStaffCatalogPath(segments: readonly string[]): boolean {
  const [, , , section] = segments;
  const isKnownSection =
    section !== undefined && STAFF_CATALOG_SECTIONS.includes(section);
  return isKnownSection && (segments.length === 4 || segments.length === 5);
}

/** The account screens that read a single-use token: the only ones that answer `Referrer-Policy: no-referrer`. */
function isAccountTokenPath(pathname: string): boolean {
  return isAccountPageIn(pathname, ACCOUNT_TOKEN_PAGES);
}

/** The account screens that show a Turnstile challenge, and the only paths whose policy names its frame. */
function isAccountChallengePath(pathname: string): boolean {
  return isAccountPageIn(pathname, ACCOUNT_CHALLENGE_PAGES);
}

function isAccountPageIn(pathname: string, pages: readonly string[]): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const [locale, family, page] = segments;
  return (
    segments.length === 3 &&
    hasLocale(routing.locales, locale) &&
    family === ACCOUNT_FAMILY_SEGMENT &&
    page !== undefined &&
    pages.includes(page)
  );
}

/** `/api/presets/{id}/image`, unprefixed: the one address the image route answers on. A locale in front of `/api` is an
 *  ordinary framework 404, which gets the page policy like any other. */
function isPresetImagePath(pathname: string): boolean {
  const [api, presets, id, image, ...rest] = pathname
    .split("/")
    .filter(Boolean);
  return (
    api === "api" &&
    presets === "presets" &&
    id !== undefined &&
    image === "image" &&
    rest.length === 0
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
