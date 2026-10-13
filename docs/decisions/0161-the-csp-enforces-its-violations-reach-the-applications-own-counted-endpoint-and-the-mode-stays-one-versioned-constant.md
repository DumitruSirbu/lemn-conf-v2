# ADR 0161 — The CSP enforces, its violations reach the application's own counted endpoint, and the mode stays one versioned constant

Status: **Proposed — a draft by the architect at wave 8Q's planning, 2026-10-13.** Nothing in it is
built. The scribe completes it at 8Q's close, as built, and only then marks it Accepted. Parts that
wait on wave 8Q's measurement slice (S0) are marked **Open** and decide nothing yet.
Date: 2026-10-13
Type: Decision
Milestone: M8 wave 8Q (web only; no file under `packages/`, no `proxy.ts` change, no migration, no
grant, no dependency)
Supersedes in part: [ADR 0041](0041-the-browser-security-policy-is-versioned-and-the-csp-only-reports.md)
decision 4 (by name, below). Discharges ADR 0041 decision 3's two preconditions.

Evidence tiers: **[doc]** quoted from a record or the installed Next documentation, **[src]** read
at `fd954e0a`, **[inf]** the architect's inference, with what would falsify it. The plan is
`docs/milestones/M8-review-contact-success.md`, *8Q plan — restated for dispatch, 2026-10-13*
(rulings 8Q.1 to 8Q.9, criteria 1 to 12).

## Context

ADR 0041 (2026-08-31) made the browser's security policy a versioned module and shipped the CSP as
`Content-Security-Policy-Report-Only`, for two measured reasons: prerendered pages carry no nonce
and would break under enforcement (decision 3), and a report collector would be *"an
unauthenticated, unthrottled POST endpoint anyone could flood"*, SEC-001's shape (decision 4). It
said plainly that the CSP was *"a declaration and not yet a control"*.

Both reasons have moved. M7 made `/` and the configure route Route Handlers; 8L and 8M render the
contact pages and `/done` per request, pinned by tests; the prerendered set left is `/_global-error`
and `/_not-found` [doc, M8 *8A figures* and 8L S3]. And the application now has a limiter: buckets
keyed by digest per network block, failing closed for writes (ADR 0155, ADR 0156). M8 keeps the
flip as *"the application's own header"*, needing no host (*M8 restated*, 2026-10-07).

## Decisions

### 1. The policy enforces, after both preconditions and after a report-only baseline

`CONTENT_SECURITY_POLICY_MODE` becomes `"enforce"` only after (a) no prerendered document reaches a
browser without a nonce (decision 6), (b) the sink of decision 2 exists and the policy names it, and
(c) one whole `CI=1` e2e run in report-only has counted zero reports on the suite's server. The
order is a criterion of the wave, checked by commit order (plan, criterion 6).

### 2. ADR 0041 decision 4 is overturned: violations reach `POST /api/csp-reports`

**Overturned by name.** Decision 4's reason was the missing limiter, and its own words tied the
decision to SEC-001's deferral; the limiter now exists. A policy that blocks and tells no one can
break a page for a customer unseen, which is worse than the flood decision 4 feared, now that the
flood is bounded.

The endpoint, in this order: the media type must be `application/csp-report` (`415`, nothing
counted); one hit is counted for the network block under a new purpose, `csp-report` (`429` with
`Retry-After`; `503` when it cannot be judged, failing closed as writes do); the body is read on
the stream with an 8 KiB cap (`413`; `400` for a broken stream); it must hold a `csp-report` object
(`400`); it is reduced; one `[csp]` line is written to the server's log; the answer is `204` with no
body. Nothing is logged for a refusal; a `503` logs once per process per error name. Nothing is
stored but the limiter's counter.

### 3. A report keeps nothing personal

The logged record holds only closed values and bounded integers: the directive, what was blocked
(a keyword, an origin, or a scheme, never a path, query or fragment), the source (the same, except
the build's own `/_next/static/` chunk paths), line and column, the page as a family template
(`/[locale]/d/[id]/review`, `/[locale]/s/[token]`, and so on, else `other`), the locale, the
disposition and the status. It never holds `document-uri`, `referrer`, `script-sample`,
`original-policy` (which carries the nonce), an address, a user agent, a cookie, an id, a token, a
query or a fragment. *Why:* a share view's address is a secret (ADR 0114 Amendment B, G), and a
report would otherwise copy it into a log read by a wider audience on someone else's retention
schedule, the reasoning of the 2026-09-06 ruling that became ADR 0146.

### 4. `report-uri` only; no `report-to` in M8

The Reporting API delivers in batches after a delay and wants a potentially trustworthy endpoint,
which would make the e2e evidence depend on timing [inf; S0 measures what Chromium sends with
`report-uri` alone]. Revisited if the owner chooses a hosted collector (Q46 (b)).

### 5. The mode stays one versioned constant; a rollback is one line

ADR 0041 decisions 1 and 3 stand: one switch, in the code, and the header's name derives from it
alone. A rollback is one commit that sets the constant back and edits the one test that pins it.
Every other test reads the header's name from the module, and the violation net counts reports of
both dispositions, so a rolled-back build stays covered. *Why not an environment variable:* it
would put the browser's security posture back outside the code, which is SEC-004 itself (ADR 0041
Context); creating one is also the owner's (Q48).

### 6. Open — what is still prerendered (S0, then the architect at checkpoint A)

Each address class a browser can be sent is either rendered per request, every script nonced, or
shown never to reach a browser as a document. The plan's ladder (8Q.4) governs: per request where
Next allows it, keeping Next's own text; a page of our own only with drafted copy and a visual
review; otherwise back to planning. **Never** `'unsafe-inline'` in `script-src`, a hash list, a
removed `'strict-dynamic'`, or a nonce in `style-src`. *What S1 used is recorded here at the close.*

### 7. Open — `upgrade-insecure-requests` and development (S0, then checkpoint A)

Whether the directive stays (ADR 0041 decision 6) depends on whether Chromium under enforcement
upgrades the suite's own `http://localhost` requests; the default is that it stays. Whether
development needs a dev-only allowance is measured the same way; a development server that only
reports is not decided. *Recorded here at the close.*

### 8. Zero violations is an invariant of the whole run, not of a list of pages

Every page of a fixed tour is checked by three observers (the `securitypolicyviolation` event, the
console, requests to the report path), and the whole `CI=1` e2e run fails if the suite's server
counted any report. A spec that causes a violation on purpose keeps its reports off that server.
The whole-run check is one-directional (a report not yet sent when its page closed is missed); the
tour is the deterministic proof.

## Alternatives considered

- **Keep reporting only.** Rejected: both preconditions are met or meetable, and M8 assigns the flip
  to itself; leaving the policy a declaration leaves D17 and Q18 leaning on a control that does not
  block.
- **Enforce with no sink.** Rejected: decision 2's reason.
- **Store reports in a table.** Not taken in M8: a migration, a grant and an owner action for data
  nobody has asked to read (Q46 (c)).
- **A hosted collector (Sentry or similar).** Not taken in M8: a dependency and a third party, and
  M8 adds no dependency; chosen with the host in M9 if at all (Q46 (b)).
- **An `Origin` check on reports.** Not taken: a browser's report carries no reliable one [inf],
  and a forged report is bounded, reduced noise.
- **An environment variable for the mode.** Rejected: decision 5.
- **Hashes for the prerendered pages.** Rejected again, for ADR 0041's reason.

## Consequences

- **SEC-004's stated bound changes**: the CSP is a control, not only a declaration. ADR 0041 gets a
  dated note on decisions 3, 4 and, if decision 7 removes the directive, 6. `X-Frame-Options` stays:
  static assets still carry no CSP (ADR 0041 decision 2's second reason).
- **A new public, unauthenticated endpoint exists**, bounded by the limiter at 100 reports an hour
  per network block (provisional, Q47) and costing one counter write per accepted report.
- **Every future script must be nonced or loaded by a nonced script.** A host in `script-src` still
  does nothing under `'strict-dynamic'` (ADR 0041 decision 5). This binds M9's bot shield, whatever
  it is: it must be observed under the enforced policy on the chosen host before launch.
- **A rollback needs a deployment.** The host's own instant rollback is M9's to record.

## Owner's questions (from the plan, point 7)

Q46 (where reports end up; default (a), the server log), Q47 (the limit's figure; default 100 an
hour), Q48 (an operator switch; default none), Q49 (a preview look; recommended (a), after the
flip). None blocks the wave.
