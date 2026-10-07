# ADR 0041 — The browser security policy is versioned here, and the CSP only reports

Status: Accepted
Date: 2026-08-31
Type: Decision
Milestone: Adversarial review remediation, Wave S4 — closes SEC-004

## Context

`testing-reports/01-security-and-api.md` records **SEC-004 (Low)**: `apps/web/next.config.ts` held
only strict mode and package transpilation, and nothing anywhere in the repository declared a CSP,
an anti-framing header, `X-Content-Type-Options`, a referrer policy or a `Permissions-Policy`. The
finding's substance is not that the responses were necessarily bare — a platform may well add some
of these — but that **the browser's security posture was external configuration nobody reviewing
this code could see**, and therefore not a guarantee the repository makes or a test can check.

That is the same shape of problem [ADR 0008](0008-least-privilege-database-role.md) answered on the
database side: stop inheriting whatever privilege the provider hands out, declare a restricted one,
and prove it with a test. This record does it for the browser.

[ADR 0019](0019-security-baseline-writes-throttling-retention.md) decision 2 divides security work
by job — *Vercel is the firewall, the application does the rate limiting.* Neither half of SEC-004
is firewall work: a response header is a per-response application policy, not volume to be dropped
at the edge. This ADR therefore sits beside ADR 0019 rather than re-litigating its split.

## Decisions

### 1. The policy is a versioned module, not a platform setting

`apps/web/src/lib/security-headers.ts` is the whole policy — every header value, the directive list,
and the one switch that chooses the CSP's mode. It is ordinary TypeScript, imported by both delivery
points, and asserted by `apps/web/tests/lib/security-headers.test.ts` and
`apps/web/tests/proxy.test.ts`. A reviewer reads what the browser will be told without leaving the
repository, and a change to it shows up in a diff.

### 2. Two delivery halves, split by whether a header has a per-request value

- **Headers with no per-request component ship from `next.config.ts`**, on `/:path*`, so they reach
  *every* response including static assets that no request-time code path touches:
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` closing fourteen
  named features, `Strict-Transport-Security`, and `X-DNS-Prefetch-Control: off`. These six are
  **enforcing today**.
- **The CSP ships from `src/proxy.ts`** — Next 16's replacement for `middleware.ts` — because it
  carries a per-request nonce and a nonce cannot be a static config value. The proxy mints the
  nonce, sets it on the *request* headers under the **enforcing** header name so Next stamps it onto
  its own bootstrap scripts, and sets the policy on the response under whichever name decision 3
  selects.

`X-Frame-Options: DENY` is kept even though `frame-ancestors 'none'` is in the CSP, and that is not
redundancy: the CSP is report-only and does not cover static assets, so `X-Frame-Options` is the
only unconditional anti-framing guarantee the application currently makes.

### 3. The CSP is report-only, and that is measured rather than timid

`CONTENT_SECURITY_POLICY_MODE` is `"report-only"`. It is the single switch; the response header name
derives from it and nothing else changes when it flips.

The reason is structural, not caution. **A nonce reaches only the HTML of a dynamically rendered
response.** Mutating request headers in a proxy does not disable static rendering, so prerendered
pages keep their static optimisation and carry no nonce at all. Read back from a real
`pnpm --filter @lemnaria/web build`, `apps/web/.next/prerender-manifest.json` gives the prerendered
set exactly:

```
['/', '/_global-error', '/_not-found', '/configurator/configure', '/configurator/contact']
```

Five routes, carrying ten same-origin chunk tags plus two inline RSC flight-payload scripts whose
content is page-specific — so a hash allowance is not maintainable either. Under `"enforce"` all of
them would be blocked and those pages would go blank.

Two details are worth keeping because they are the ones that get lost:

- **`/_global-error` is the worst of the five to lose and the easiest to miss.** It is the boundary
  that has to render precisely when something else has already failed.
- **The build's printed route table does not list `/_global-error` at all.** The prerender manifest
  is the only honest source for this list; an earlier revision of the wave notes counted four routes
  from the printed table and was wrong.

> **Note, 2026-10-07.** The list above is the 2026-08-31 measurement and is not the current one. A real
> build now prerenders **four** routes: `/_global-error`, `/_not-found`, `/ro/configurator/contact` and
> `/ru/configurator/contact` [implementer-run, M8 wave 8A S1; `docs/milestones/M8-review-contact-success.md`,
> *8A figures*, part A]. `/` and `/configurator/configure` became Route Handlers in M7 wave 7E3a, and the
> contact page gained its locale prefix in M6B. The list is left as written.

**The flip is blocked on two preconditions**, both tracked on the M8 launch gate: a method of
collecting violations (decision 4), and the prerendered-pages/nonce problem above. Making those
pages dynamic is a performance and cost decision in its own right and was deliberately not folded
into the remediation wave.

### 4. There is deliberately no CSP report sink, so the CSP is a declaration and not yet a control

A report collector would be an unauthenticated, unthrottled POST endpoint anyone could flood. That
is precisely the shape of **SEC-001**, which ADR 0019's correction of 2026-08-31 records the owner
deferring to M8 behind a launch gate — so building one to close SEC-004 would reintroduce the
finding being gated. Violations therefore surface only in an individual viewer's browser devtools,
where nobody is watching.

Stated plainly, because it is the honest bound of what SEC-004 bought: **the CSP today is a
versioned, testable declaration and a staging step, not a live control.** It blocks nothing and
reports to no one. What it does provide is a policy that is reviewable, asserted by tests, and one
constant away from being enforced once the preconditions are met. The six static headers are the
part of this wave that protects anything today.

### 5. `'self'` in `script-src` is inert, and adding a host there would be silently ignored

`script-src` is `'self' 'nonce-…' 'strict-dynamic'`, never a blanket `'unsafe-inline'`. Under CSP3,
a browser that honours `'strict-dynamic'` **ignores every host-source expression in that
directive** — `'self'` included. It survives only as a backward-compatibility tail for a CSP2
browser, where it would admit every same-origin script.

The operational consequence is the reason this is recorded rather than left implicit: **adding a CDN
or any other host to `script-src` would have no effect on a modern browser, while a test asserting
the host is present would pass.** Removing `'strict-dynamic'` is the only thing that makes host
sources meaningful again. The same reasoning is pinned in the source comment; it is here because it
is a trap for the next person extending the policy, not a detail of this wave.

`style-src` does keep `'unsafe-inline'`, deliberately: React writes `style` attributes and drei
injects style elements it does not nonce, and a style injection is not the blast radius this policy
exists to contain. `blob:` and `data:` are admitted for images and workers only, because that is how
three.js hands over generated textures and loader workers.

### 6. `upgrade-insecure-requests` is present and inert until the flip

Browsers do not apply `upgrade-insecure-requests` from a report-only policy. It is kept in the
directive list anyway so the set is complete and the directive activates on the flip, rather than
being something that has to be remembered at the moment of flipping.

### 7. HSTS: six months, subdomains included, `preload` withheld

This is the decision with a consequence **outside this repository**, and the reason a source comment
was not a sufficient home for the reasoning.

- **`max-age=15552000` — six months.** Long enough to be a real guarantee, short enough that a
  mistake ages out inside a browser's cached lifetime rather than needing a coordinated unwind.
- **`includeSubDomains` — safe for every path this project uses *today*, verified rather than
  assumed.** RFC 6797 §8.1 requires a user agent to **ignore** an STS header delivered over
  insecure transport, and both of this project's plain-HTTP surfaces are exactly that: the Playwright
  suite runs against `http://localhost:4320`, and ADR 0019's LAN handset case is
  `http://<LAN-IP>:3000`. So HSTS cannot worsen the `Secure`-cookie breakage ADR 0019 already
  records for the LAN case — the header never takes effect there. Preview deployments are HTTPS-only
  on `*.vercel.app`.
- **The residual is external and future.** Once this application is deployed on a custom apex
  domain, `includeSubDomains` binds every sibling subdomain — a marketing host, a mail UI, anything
  not yet built — to HTTPS for six months. That is an accepted trade, not an overlooked one, and it
  is **the thing to re-examine before pointing an apex at this application**, not after.
- **`preload` is withheld deliberately.** Submission to the browsers' built-in preload list is a
  public and effectively irreversible commitment binding every current and future subdomain, with a
  removal process measured in months. That is the owner's decision to make, not an implementing
  agent's, and nothing in SEC-004 requires it.

## Alternatives considered

- **Leave the headers to platform configuration.** Rejected: it is SEC-004 itself. A setting in a
  dashboard is not versioned, not reviewable in a diff, and not assertable by a test.
- **Ship the CSP enforcing immediately.** Rejected on measurement, not on principle — five
  prerendered routes carry no nonce and would blank, `/_global-error` among them.
- **Make the five routes dynamic so the nonce reaches them, then enforce.** Rejected *for this
  wave*: it trades prerendering for policy and is a performance and cost decision that deserves its
  own record. It remains the obvious path to the flip.
- **Allow the prerendered pages' scripts by hash instead of nonce.** Rejected: two of the twelve
  script tags are inline RSC flight payloads whose content is page-specific, so the hash set would
  change with the content and could not be maintained.
- **Add a report-collection endpoint in this repository.** Rejected under decision 4 — it is the
  SEC-001 shape ADR 0019 defers.
- **Drop `'self'` from `script-src` since it is inert.** Not taken: it is the only thing standing
  between a CSP2 browser and no script policy at all. It is documented as inert instead, which is
  the actual risk.
- **Submit to the HSTS preload list.** Rejected as not an agent's decision to make; see decision 7.

## Consequences

- **SEC-004 closes, with a stated bound.** Six enforcing headers on every response; a CSP that is
  declared, tested and reporting to nobody. Anyone reading this record should not conclude the
  application is CSP-protected today — it is not.
- **The M8 launch gate carries two new preconditions**: a violation-collection method, and the
  prerendered-page/nonce problem. Both must clear before `CONTENT_SECURITY_POLICY_MODE` flips.
- **A pre-apex checkpoint now exists.** `includeSubDomains` must be re-examined before a custom apex
  domain is pointed at this application, because at that moment the header starts binding hosts this
  repository does not own.
- **Extending `script-src` with a host requires removing `'strict-dynamic'` first**, or the change
  is a no-op that its own test will bless.
- **The proxy is now on the request path for everything except immutable build output and static
  files**, per its matcher. Its cost is one nonce and two header writes per request; its failure
  mode is that a bug there affects every dynamic response, which is why `apps/web/tests/proxy.test.ts`
  asserts the report-only and enforcing header names are never both sent.
