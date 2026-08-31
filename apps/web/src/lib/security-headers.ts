/**
 * The browser security policy, versioned in the repository rather than left to platform defaults
 * nobody reviewing this code can see (SEC-004).
 *
 * It is split in two on purpose. The headers with no per-request value are served from
 * `next.config.ts`, so they reach every response including static assets. The CSP carries a
 * per-request nonce and is therefore built in `src/proxy.ts`.
 */

export type ContentSecurityPolicyMode = "report-only" | "enforce";

/**
 * **The single switch.** `"report-only"` sends the policy as
 * `Content-Security-Policy-Report-Only`: browsers report violations and block nothing, so a
 * directive this Three.js/R3F application turns out to need cannot break the scene before anyone
 * has read a report. Changing this one constant to `"enforce"` changes the response header name and
 * nothing else.
 *
 * **Do not flip it until the prerendered pages render dynamically.** A nonce only reaches the HTML
 * of a dynamically rendered response. Measured against `next build` at this commit: `/d/[id]` is
 * dynamic and carries nonces on all of its scripts, but `/`, `/configurator/configure`,
 * `/configurator/contact` and `/_not-found` are prerendered and carry **none** — ten same-origin
 * chunk tags plus two inline RSC flight-payload scripts whose content is page-specific, so they
 * cannot be admitted by hash either. Under `"enforce"` every one of them would be blocked and those
 * pages would go blank.
 *
 * **There is deliberately no report sink.** A collector route would be an unauthenticated,
 * unthrottled POST endpoint anyone could flood — the same shape as SEC-001, which the owner has
 * deferred to M8 behind a launch gate, so adding one to close SEC-004 would reintroduce the finding
 * being gated. Violations therefore surface only in a viewer's browser devtools. That makes this
 * policy a **versioned, testable declaration and a staging step, not a live control today**.
 *
 * The flip to `"enforce"` is blocked on two preconditions, both tracked on the M8 launch gate:
 * a method of collecting violations, and the prerendered-pages/nonce problem above.
 */
export const CONTENT_SECURITY_POLICY_MODE: ContentSecurityPolicyMode =
  "report-only";

export const CSP_ENFORCED_HEADER = "Content-Security-Policy";
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

/** The request header `src/proxy.ts` hands the nonce down on, for a component that needs it. */
export const NONCE_HEADER = "x-nonce";

/**
 * Every powerful feature the configurator does not use. Listed explicitly rather than relying on a
 * wildcard so adding one later is a visible edit.
 */
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

/**
 * Headers with no per-request component. `frame-ancestors` lives in the CSP, but that CSP is
 * report-only today and does not cover static assets, so `X-Frame-Options` carries the anti-framing
 * guarantee unconditionally in the meantime.
 */
export const STATIC_SECURITY_HEADERS: readonly {
  key: string;
  value: string;
}[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Six months, subdomains included. `preload` is deliberately withheld: submission to the browsers'
  // built-in preload list is a public, effectively irreversible commitment binding every current and
  // future subdomain to HTTPS, so it is the owner's decision to make, not this file's.
  {
    key: "Strict-Transport-Security",
    value: `max-age=${String(HSTS_MAX_AGE_SECONDS)}; includeSubDomains`,
  },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

export function cspResponseHeaderName(mode: ContentSecurityPolicyMode): string {
  return mode === "enforce" ? CSP_ENFORCED_HEADER : CSP_REPORT_ONLY_HEADER;
}

/**
 * `script-src` is never given a blanket `'unsafe-inline'`: Next's own bootstrap scripts are
 * admitted by nonce, and `'strict-dynamic'` lets those scripts load the chunks they need.
 *
 * **`'self'` in `script-src` is inert.** A CSP3 browser that honours `'strict-dynamic'` ignores
 * every host-source expression in that directive, `'self'` included; it survives only as a
 * backward-compatibility tail for a CSP2 browser, where it would admit every same-origin script.
 * So do not add a CDN or any other host here expecting it to take effect — a test asserting the
 * host is present would pass while the allowlist was silently ignored. Removing `'strict-dynamic'`
 * is the only thing that makes host sources meaningful again.
 *
 * `style-src` does keep `'unsafe-inline'`. React writes `style` attributes (the capture harness
 * sizes its stage box that way) and drei injects style elements it does not nonce, and a style
 * injection is not the blast radius this policy exists to contain.
 *
 * `blob:` and `data:` are admitted for images and workers because that is how three.js hands
 * generated textures and loader workers to the browser.
 *
 * `upgrade-insecure-requests` is **inert while the mode is report-only** — browsers do not apply it
 * from a report-only policy. It is kept so the directive set is complete and activates on the flip
 * rather than having to be remembered then.
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
