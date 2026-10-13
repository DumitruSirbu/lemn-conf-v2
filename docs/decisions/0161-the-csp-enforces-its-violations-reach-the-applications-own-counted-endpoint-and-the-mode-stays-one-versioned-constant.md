# ADR 0161 — The CSP enforces, its violations reach the application's own counted endpoint, and the mode stays one versioned constant

Status: **Proposed — a draft by the architect at wave 8Q's planning, 2026-10-13.** Nothing in it is
built. The scribe completes it at 8Q's close, as built, and only then marks it Accepted. Parts that
wait on wave 8Q's measurement slice (S0) are marked **Open** and decide nothing yet.
**Updated at checkpoint A, 2026-10-13:** S0 is measured, decisions 6 and 7 are resolved, decision
9 is added, and decisions 1, 4 and 8 and the *Alternatives* carry dated amendments. None is open
now; the record is still *Proposed* until the close.
Date: 2026-10-13
Type: Decision
Milestone: M8 wave 8Q (web, plus one exception: the five files of decision 9 under
`packages/configurator-domain/src/`, ruled at checkpoint A, 2026-10-13; no `proxy.ts` change, no
migration, no grant, no dependency)
Supersedes in part: [ADR 0041](0041-the-browser-security-policy-is-versioned-and-the-csp-only-reports.md)
decision 4 (by name, below). Discharges ADR 0041 decision 3's two preconditions.

Evidence tiers: **[doc]** quoted from a record or the installed Next documentation, **[src]** read
at `fd954e0a`, **[inf]** the architect's inference, with what would falsify it. The plan is
`docs/milestones/M8-review-contact-success.md`, *8Q plan — restated for dispatch, 2026-10-13*
(rulings 8Q.1 to 8Q.9, criteria 1 to 12), and its *8Q checkpoint A — 2026-10-13* (rulings 8Q.10
to 8Q.13, criteria 13 and 14). **[doc: S0]** marks a figure from S0's report,
`docs/milestones/8q-s0-measurements.md` (at `9f26a58e`), which the architect read and did not
re-run.

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

**Added at checkpoint A, 2026-10-13:** (b) is not committed until every known source of a report
is gone, which means Zod's eval probe (decision 9) and the e2e pixel helper's `fetch` of a `data:`
URL [doc: S0 M10, cause B]. Otherwise ordinary page views would write a counter row each and
spend the shared bucket (plan, 8Q.13).

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
which would make the e2e evidence depend on timing [inf]. Revisited if the owner chooses a hosted
collector (Q46 (b)).

**Measured, 2026-10-13** [doc: S0 M6]. With `report-uri` alone, Chromium 151 sends:
- one `POST` per distinct violation, of type `application/csp-report`, 738 to 803 bytes, within
  about 12 ms of the page's event, with no batching;
- identical reports from one page once only, so a report count is a lower bound on events;
- the report with the visitor's cookies and a same-origin `Origin`;
- `document-uri` with the share token and the query kept, and the fragment dropped.

The reduction of decision 3 is therefore needed, and **the sink reads no cookie and sets none.**

### 5. The mode stays one versioned constant; a rollback is one line

ADR 0041 decisions 1 and 3 stand: one switch, in the code, and the header's name derives from it
alone. A rollback is one commit that sets the constant back and edits the one test that pins it.
Every other test reads the header's name from the module, and the violation net counts reports of
both dispositions, so a rolled-back build stays covered. *Why not an environment variable:* it
would put the browser's security posture back outside the code, which is SEC-004 itself (ADR 0041
Context); creating one is also the owner's (Q48).

### 6. What is still prerendered — resolved at checkpoint A, 2026-10-13

Each address class a browser can be sent is either rendered per request, every script nonced, or
shown never to reach a browser as a document. The plan's ladder (8Q.4) governs: per request where
Next allows it, keeping Next's own text; a page of our own only with drafted copy and a visual
review; otherwise back to planning. **Never** `'unsafe-inline'` in `script-src`, a hash list, a
removed `'strict-dynamic'`, or a nonce in `style-src` (S0 confirmed the last on a scratch page: a
nonce in `style-src` stopped a `style` attribute applying).

**Resolved** [doc: S0 M1, M2]. The manifest holds only `/_global-error` and `/_not-found`.
- **A failing render** is already a per-request `500` with every script nonced, not the
  prerendered global error.
- **An address no route matches**, under a locale, `/api` or `/internal`, was served the
  prerendered `_not-found.html` with 8 un-nonced scripts. Its text shows under enforcement; only
  hydration is lost.

The ruling:
- catch-all files answer those addresses: under `[locale]`, a page that awaits `connection()` and
  calls `notFound()`, keeping Next's own text, rendered per request; under `api` and `internal`,
  handlers that answer an empty `404`;
- the two literal addresses `/_not-found` and `/_global-error` are rewritten (or, failing that,
  redirected) to an address the catch-all answers;
- if Next permits neither, the residual is accepted by name: those two typed addresses serve a
  text-only document whose scripts the policy blocks, at up to 8 counted reports a visit, and
  nothing else may.

An address under a locale whose last segment ends in an extension the proxy's matcher skips
(`/ro/zz.png`) reaches no proxy and carries no policy. The flip does not change it, and 8Q records
it rather than fixing it (`proxy.ts` is out of scope). *What S1 used, the rewrite, the redirect or
the residual, is recorded here at the close.*

### 7. `upgrade-insecure-requests` and development — resolved at checkpoint A, 2026-10-13

**The directive stays** (ADR 0041 decision 6 unchanged) [doc: S0 M5]. Under enforcement Chromium
upgrades nothing from `http://localhost`, and every page hydrates. A `next start` reached by a LAN
address has every subresource upgraded to `https://` and fails, so the enforced production policy
is checked on a phone only on a TLS host. That is a gate line for 8T.

**Development needs no allowance; one switch serves both** [doc: S0 M7: seven `next dev` stops
under enforcement, 0 violations]. The whole-run teardown prints its count under `next dev` and
asserts nothing, since no whole development run was measured. A development server that only
reports is not built.

### 8. Zero violations is an invariant of the whole run, not of a list of pages

Every page of a fixed tour is checked by three observers (the `securitypolicyviolation` event, the
console, requests to the report path), and the whole `CI=1` e2e run fails if the suite's server
counted any report. A spec that causes a violation on purpose keeps its reports off that server.
The whole-run check is one-directional (a report not yet sent when its page closed is missed); the
tour is the deterministic proof.

**Amended at checkpoint A, 2026-10-13** [doc: S0 M3, M4]:
- In report-only, every document writes one console `error` that is not a violation, the notice
  that `upgrade-insecure-requests` is ignored there. The console observer excludes exactly that
  sentence, and only in report-only.
- A blocked eval writes no console line, so the event and request observers carry it.

### 9. Zod runs without eval, configured by the domain package — added at checkpoint A, 2026-10-13

Zod 4 probes for eval with `new Function("")` when it builds its first object schema. Every
document that hydrates did so: one `script-src` violation a page view, six on the editor in
report-only, blocked and caught under enforcement [doc: S0 M3, M4; src: `zod@4.4.3`
`v4/core/util.js:145-161`, `schemas.js:970-972`]. Left alone, it fails decision 8 on every page
and spends decision 2's shared bucket with ordinary traffic.

**The fix:**
- `packages/configurator-domain/src/zod-without-eval.ts` calls `z.config({ jitless: true })` and
  re-exports `z`;
- the domain's four importers of Zod take `z` from it;
- a lint rule refuses a direct `"zod"` import anywhere else under the package's `src/`.

ES module order then guarantees that the setting precedes the first schema, whatever order a
bundler emits.

**This is the domain's one module-scope effect.** It sets a library option on Zod's own global
object, and it is not I/O (`ARCHITECTURE_PROPOSAL.md` §3): it changes how Zod checks a value, not
what it accepts. It is not a precedent for other effects.

**Cost.** None in the browser under enforcement, where the probe already fails. On the server Zod
loses its compiled object parser. That cost is measured once at S1a, with a stop above 1 ms median
per parse of the largest fixture.

*Not taken:*
- a `zod` dependency in the web app (M8 adds none, and client chunk order is not guaranteed);
- writing Zod's internal global from outside;
- a browser-only setting (environment sniffing in an I/O-free package);
- `'unsafe-eval'` in production;
- filtering the eval out of the observers.

## Alternatives considered

- **Keep reporting only.** Rejected: both preconditions are met or meetable, and M8 assigns the flip
  to itself; leaving the policy a declaration leaves D17 and Q18 leaning on a control that does not
  block.
- **Enforce with no sink.** Rejected: decision 2's reason.
- **Store reports in a table.** Not taken in M8: a migration, a grant and an owner action for data
  nobody has asked to read (Q46 (c)).
- **A hosted collector (Sentry or similar).** Not taken in M8: a dependency and a third party, and
  M8 adds no dependency; chosen with the host in M9 if at all (Q46 (b)).
- **An `Origin` check on reports.** Not taken. The draft's reason, *"a browser's report carries no
  reliable one"*, is **refuted** for Chromium 151, which sends a same-origin `Origin` [doc: S0 M6].
  The conclusion stands for the remaining reason: a non-browser forges the header, so it proves
  nothing, and a forged report is bounded, reduced noise.
- **Removing `upgrade-insecure-requests`.** Not taken: it upgrades nothing on `localhost` (decision 7).
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
- **The domain package carries one module-scope effect** (decision 9). A Zod upgrade that renames
  `jitless` turns criterion 13's trap and the tour red.
- **The enforced policy cannot be checked on a phone over the LAN** with `next start` (decision 7);
  8T uses a TLS host.

## Owner's questions (from the plan, point 7)

Q46 (where reports end up; default (a), the server log), Q47 (the limit's figure; default 100 an
hour), Q48 (an operator switch; default none), Q49 (a preview look; recommended (a), after the
flip). None blocks the wave.

## Amendments

**Dated 2026-10-13, S3 fix-up (coordinator rulings F1 to F4, after the wave's first review of the sink).**

- **F1, a refusal leaves one line an hour.** Decision 2's *"nothing is logged for a refusal"* is amended:
  the first refusal of the limiter in a UTC hour window writes one closed-value line,
  `[csp] {"event":"csp-report-limited"}`, once per process per window (one module-level number, so
  bounded). *Why:* with no network source named, every request shares one bucket of 100 an hour
  (ADR 0155), so one client can spend it and silence real reports invisibly. A flood past the
  figure still buys at most one log write an hour. The figure and the limiter are unchanged.
  **Owner item:** naming a network source (Q47) is recommended **before S5** (the flip). The shared
  100 an hour is accepted for the report-only S4 baseline.
- **F2, decision 3's field list gains `origin`.** A closed field, `"own" | "foreign" | "none"`: the
  `document-uri` origin compared with `new URL(request.url).origin`, which the route hands to the
  pure reduction as an argument. For `foreign` and `none`, `page` is `other` and `source` is dropped,
  so a forged or cross-site report cannot pass for one of this application's pages. `locale` is still
  read from the path of whatever document was named, and `blocked`'s `self` is still relative to that
  document's own origin; the `origin` field is what tells a reader to discount both. *No `Origin` or
  `Sec-Fetch-*` gate is added*: the *Alternatives* entry above stands.
- **F3, a chunk path is kept only for an `own` document.** It falls out of F2: the build's own chunk
  names, which decision 3 allowed as a `source`, are written only when `origin` is `own`.
- **F4, the lines are one string.** Each of the three lines is written as
  `console.warn("[csp]", JSON.stringify(record))` (`console.error` for the unavailable line), so a
  platform log view shows one line and not an expanded object. Closed values only, as before.
