/**
 * The browser security policy, versioned in the repository (ADR 0041). Headers with no per-request value are served
 * from `next.config.ts`, so they reach every response including static assets; the CSP carries a per-request nonce
 * and is built in `src/proxy.ts`.
 */

export type ContentSecurityPolicyMode = "report-only" | "enforce";

/**
 * The single switch: `"report-only"` sends `Content-Security-Policy-Report-Only` (violations reported, nothing
 * blocked); `"enforce"` changes the header name and nothing else.
 *
 * Do not flip it while prerendered pages exist: a nonce only reaches the HTML of a dynamically rendered response, so
 * the routes in `.next/prerender-manifest.json` (`/_global-error`, `/_not-found`, the `ro` and `ru` contact pages)
 * carry none and would go blank under `"enforce"`. There is no report sink: a collector would be an unauthenticated,
 * unthrottled POST endpoint (SEC-001, deferred to the M8 launch gate), so the policy is a versioned declaration and a
 * staging step, not a live control (ADR 0041 decision 4).
 */
export const CONTENT_SECURITY_POLICY_MODE: ContentSecurityPolicyMode =
  "report-only";

export const CSP_ENFORCED_HEADER = "Content-Security-Policy";
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

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

/** Headers with no per-request component. The CSP's `frame-ancestors` is report-only today and does not cover static
 *  assets, so `X-Frame-Options` carries the anti-framing guarantee unconditionally. */
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

export function cspResponseHeaderName(mode: ContentSecurityPolicyMode): string {
  return mode === "enforce" ? CSP_ENFORCED_HEADER : CSP_REPORT_ONLY_HEADER;
}

/**
 * `script-src` is never given a blanket `'unsafe-inline'`: Next's bootstrap scripts are admitted by nonce, and
 * `'strict-dynamic'` lets them load their chunks. `'self'` there is inert: a CSP3 browser honouring `'strict-dynamic'`
 * ignores every host-source expression, so do not add a CDN host expecting it to take effect (ADR 0041 decision 5).
 * `style-src` keeps `'unsafe-inline'`: React writes `style` attributes and drei injects style elements it does not
 * nonce. `blob:` and `data:` are admitted for images and workers because three.js hands generated textures and
 * loader workers to the browser. `upgrade-insecure-requests` is inert while report-only; it stays so it activates
 * on the flip.
 */
export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
}: {
  nonce: string;
  isDevelopment: boolean;
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
    "frame-src 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
