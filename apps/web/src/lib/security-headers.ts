/**
 * The browser security policy, versioned in the repository (ADR 0041). Headers with no per-request value are served
 * from `next.config.ts`, so they reach every response including static assets; the CSP carries a per-request nonce
 * and is built in `src/proxy.ts`.
 */

export type ContentSecurityPolicyMode = "report-only" | "enforce";

/**
 * The single switch: `"enforce"` sends `Content-Security-Policy` (blocked and reported); `"report-only"` sends
 * `Content-Security-Policy-Report-Only` (reported only). It changes the header name and nothing else, so a rollback is
 * this one line.
 *
 * Enforcing holds only while every document a browser is sent carries a nonce, and a nonce reaches the HTML of a
 * dynamically rendered response alone: a route listed in `.next/prerender-manifest.json` would go blank.
 * `/_global-error` and `/_not-found` stay listed but are never sent as documents: `app/[locale]/[...unmatched]` renders
 * the 404 per request and `next.config.ts` rewrites those two addresses to it (ADR 0041, ADR 0161).
 */
export const CONTENT_SECURITY_POLICY_MODE: ContentSecurityPolicyMode =
  "enforce";

export const CSP_ENFORCED_HEADER = "Content-Security-Policy";
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

/** The address of the application's own report sink (ADR 0161): the policy's `report-uri` and the route file's path,
 *  which a test holds equal. */
export const CSP_REPORT_PATH = "/api/csp-reports";

/** The request header `src/proxy.ts` hands the nonce down on, for a component that needs it. */
export const NONCE_HEADER = "x-nonce";

/** Every powerful feature the configurator does not use, listed explicitly so adding one later is a visible edit. */
const DISABLED_BROWSER_FEATURES = [
  "accelerometer",
  "ambient-light-sensor",
  "autoplay",
  "camera",
  "display-capture",
  "encrypted-media",
  "geolocation",
  "gyroscope",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "usb",
  "xr-spatial-tracking",
];

/** Six months, in seconds — long enough to be a real guarantee, short enough to back out of. */
const HSTS_MAX_AGE_SECONDS = 15_552_000;

const PERMISSIONS_POLICY = DISABLED_BROWSER_FEATURES.map(
  (feature) => `${feature}=()`,
).join(", ");

/** Headers with no per-request component. The CSP's `frame-ancestors` does not cover static assets, which carry no
 *  policy at all, so `X-Frame-Options` carries the anti-framing guarantee unconditionally. */
export const STATIC_SECURITY_HEADERS: readonly {
  key: string;
  value: string;
}[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Six months, subdomains included. `preload` is withheld: submission to the preload list is a public, effectively
  // irreversible commitment for every subdomain, so it is the owner's decision (ADR 0041 decision 7).
  {
    key: "Strict-Transport-Security",
    value: `max-age=${String(HSTS_MAX_AGE_SECONDS)}; includeSubDomains`,
  },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/**
 * Every response on a `/s/{token}` path, redirect and page alike: a share link is for one recipient, never indexed
 * or cached by an intermediary. `no-referrer` is stricter than the site-wide default so a share view leaks not even
 * the origin; it is set here rather than in `STATIC_SECURITY_HEADERS`, whose looser default other routes want
 * (ADR 0114 Amendment B).
 */
export const SHARE_VIEW_HEADERS: readonly { key: string; value: string }[] = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
];

/**
 * Every response on an account page (`/{locale}/account/{page}`): a sign-in, confirmation or reset screen carries a
 * credential or a single-use token in its address or its form, and a signed-in page holds the person's own data, so
 * none is ever indexed or cached. Same shape as
 * `SHARE_VIEW_HEADERS`, set in `src/proxy.ts` (ADR 0172). `Referrer-Policy` is not here: see
 * `ACCOUNT_TOKEN_PAGE_HEADERS`.
 */
export const ACCOUNT_PAGE_HEADERS: readonly { key: string; value: string }[] = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
];

/**
 * Added on the token pages, the ones that read a single-use token (`ACCOUNT_TOKEN_PAGES` in `src/proxy.ts`): they leak
 * not even the origin when a link is followed. The three pages that show a Turnstile challenge keep the site default
 * (`strict-origin-when-cross-origin`) because the challenge may need the `Referer`, and an old browser's same-origin
 * `POST` under `no-referrer` would send `Origin: null` (L13a security review M2/L2).
 */
export const ACCOUNT_TOKEN_PAGE_HEADERS: readonly {
  key: string;
  value: string;
}[] = [{ key: "Referrer-Policy", value: "no-referrer" }];

/**
 * The one third-party origin the policy ever names: Cloudflare Turnstile's challenge frame. Its `api.js` is loaded by
 * a nonced script and Turnstile propagates that nonce, so under `'strict-dynamic'` no `script-src` host is needed;
 * Cloudflare's CSP page lists `frame-src` for this origin [doc: developers.cloudflare.com/turnstile/reference/
 * content-security-policy, "Last updated May 5, 2026", read 2026-10-18]. Only the pages that show a challenge pass it
 * to `buildContentSecurityPolicy` (ADR 0172 D11; ADR 0161 dated note owed).
 */
export const TURNSTILE_FRAME_SOURCES: readonly string[] = [
  "https://challenges.cloudflare.com",
];

/**
 * What a stored preset image is served under (see ADR 0167 Amendment B item 9): a document that loads nothing and runs in a
 * sandbox, so an image that is not one cannot act as a page. The image route sets it and `src/proxy.ts` sets it again,
 * because a header the proxy has already put on the response wins over the route's own (`send-response.js` appends a
 * route header only when none is present), and the page policy would otherwise be what reached the browser.
 */
export const PRESET_IMAGE_CONTENT_SECURITY_POLICY =
  "default-src 'none'; sandbox";

export function cspResponseHeaderName(mode: ContentSecurityPolicyMode): string {
  return mode === "enforce" ? CSP_ENFORCED_HEADER : CSP_REPORT_ONLY_HEADER;
}

/**
 * `script-src` is never given a blanket `'unsafe-inline'`: Next's bootstrap scripts are admitted by nonce and
 * `'strict-dynamic'` lets them load their chunks. `'self'` there is inert (a CSP3 browser honouring `'strict-dynamic'`
 * ignores host sources), so a CDN host added there takes no effect (ADR 0041 decision 5). `style-src` keeps
 * `'unsafe-inline'` because React writes `style` attributes and drei injects style elements it does not nonce. `blob:`
 * and `data:` are admitted for images and workers because three.js hands generated textures and loader workers to the
 * browser. `upgrade-insecure-requests` is ignored in report-only, and under enforcement a `next start` reached by a
 * LAN address is upgraded to HTTPS and cannot be viewed over plain HTTP. `frame-src` is `'none'` unless the caller
 * names `frameSources`; nothing else in the policy varies with them, so omitting them reproduces the site policy.
 */
export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
  frameSources = [],
}: {
  nonce: string;
  isDevelopment: boolean;
  frameSources?: readonly string[];
}): string {
  return [
    "default-src 'self'",
    // Turbopack's dev runtime evaluates code; a production bundle does not.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // The dev server pushes hot-reload updates over a websocket.
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "media-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `frame-src ${frameSources.length === 0 ? "'none'" : frameSources.join(" ")}`,
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}
