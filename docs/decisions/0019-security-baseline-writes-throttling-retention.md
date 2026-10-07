# ADR 0019 — Security baseline: write authorisation, layered throttling, and retention

Status: Accepted (**decision 1's open read is superseded 2026-09-11 by the owner's F5 ruling; its write half stands — [ADR 0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)**; **decision 8 and Alternatives 1–2 superseded 2026-09-11 by the owner's profile ruling — [ADR 0115](0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md)**; **the mint's limits (decision 5's row, decision 4 and decision 3's session bucket, for the mint) superseded 2026-10-07 by the owner's ruling — [ADR 0147](0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md)**)
Date: 2026-08-25
Type: Decision
Milestone: M3 Wave 3C (write authorisation, throttling) and M8 (contact form, recovery)

Supersedes **ADR 0014**'s Proposed status. S1 is resolved by decision 1 below; S3 and S4 are
resolved by decisions 2–5. Also closes the retention open question that `docs/STATUS.md` has
carried as gating M2 and M8.

## Context

The deployed write surface has no authentication or ownership check. The opaque 21-character
design id is the only access control and it confers **write**, so anyone holding a shared link can
silently and unrecoverably overwrite that design (ADR 0014 S1, confirmed against production).
`POST /api/designs` is unauthenticated and unthrottled (S3), and no rate limiting exists anywhere
(S4). Impact is low today — zero designs, no users — and stops being low the moment M7 puts real
customers in front of it.

The owner's direction, 2026-08-25: security is the priority, a firewall is required, and throttling
is required — "especially on sending the contact form" — at very low rates.

### What was measured before deciding

- **The platform.** Vercel's automatic L3/L4/L7 DDoS mitigation is on for every project on every
  plan, unbilled. WAF custom rules including the `rate_limit` action **are available on this
  project's plan**, with one hard constraint established by experiment rather than by reading:

  **This plan permits exactly ONE `rate_limit` rule.** Staging a second returns
  `Rate limiting is not available for this plan (401)` — a misleading message, since the first rule
  stages fine. Confirmed by removing the first rule, after which the second staged immediately.
  Non-`rate_limit` rules (`log`, `deny`, `challenge`) are not subject to that limit; three rules
  were staged together. `IP Bypass` is separately unavailable on this plan.

  There were **zero** custom rules configured before this work.
- **The write path's real output rate.** `apps/web/src/persistence/save-coalescer.ts` has **no
  minimum interval**: `scheduleSave` calls `runSave` immediately unless a save is already in
  flight, so coalescing happens only *during* a request. Its sustained output is therefore bounded
  by network round-trip time, not by a timer — on a fast connection an actively editing customer
  emits roughly one write per RTT, and M5's width dragging will make that continuous. **No update
  rate limit can be sized honestly until this is bounded**, which is why decision 5 exists.

## Decisions

### 1. Split read from write; the creating browser holds the write credential

- `POST /api/designs` mints a design **and** sets an `HttpOnly`, `Secure`, `SameSite=Lax` cookie
  carrying a per-design **write token** (a second secret, independent of the design id).
- `GET /d/{id}` and `GET /api/designs/{id}` stay open to anyone holding the link. Sharing keeps
  costing nothing: no account, no login, no friction.
- `PUT`/`PATCH /api/designs/{id}` require a valid write token for **that** design. Without it the
  response is 403 and nothing is written.

A shared link can no longer destroy the design it points at. This is the smallest change that
actually closes S1, and it does not require an authentication system that M7 and M8 do not assume.

### 2. Vercel is the firewall; the application does the rate limiting

The division is by **job**, not by redundancy, and it is the governing principle for everything
below. Refined on the owner's direction, 2026-08-25: *use Vercel more like a firewall*.

| | Vercel WAF — **the firewall** | The application — **the rate limiter** |
| --- | --- | --- |
| Job | drop traffic that is never legitimate; absorb volume | decide whether *this* caller may do *this* action *now* |
| Knows about | IP, geography, path, method, user agent | session, design ownership, email address, what the request means |
| Granularity | blunt and coarse, by design | exact, per identity, per endpoint |
| Actions | `deny`, `challenge`, one coarse `rate_limit` | 429 with a reason the UI can render |
| Cost of a rejection | **zero** — never billed, never runs a function | a function invocation and a database round trip |

**Every number a human would recognise as a policy lives in the application.** The firewall holds
no per-endpoint table and expresses no product rule.

#### Why keep the edge layer at all, when the application layer is easy to write

It is easy to write, and it is the real control. The edge is not there for redundancy — it is
there for one failure mode the application layer cannot cover **by construction**:

**An application limiter has to run in order to say no.** Every rejected request costs a function
invocation, Active CPU, and — with counters in Postgres — a database write, *for traffic it is
about to refuse*. A flood of a million requests against an application-only design buys a million
invocations and a million writes to decide not to serve them.

That is not primarily a billing concern here. It is an availability one:

1. **This project runs on free tiers with hard caps.** The failure mode is not a large invoice; it
   is the project hitting its usage limit and going down — which is what the attacker wanted.
2. **The database is what is being protected, and the limiter writes to it.** Neon's free tier has
   connection and compute limits. Under a flood, an application-only limiter *is* the denial of
   service: the scarcest resource in the system gets spent deciding not to spend it.

So the firewall absorbs volume for free, and Postgres only ever counts traffic that already
survived a coarse filter. Dropping the edge layer entirely is defensible at this project's
expected volume; the honest cost is that a flood then lands on the function and the database
instead of being discarded at no charge.

#### The constraint that shapes it

**This plan permits exactly one `rate_limit` rule** (see "What was measured"), so the edge could
not express per-endpoint policy even if the design wanted it to. That single rule is spent as a
volume valve across all of `/api/`. The firewall's other work — blocking scanner paths, challenging
traffic from outside Moldova — uses `deny` and `challenge`, which are **not** subject to that
limit.

**WAF counters are per region.** A configured limit of N is enforced at roughly N × the number of
regions serving traffic. The firewall is therefore never quoted as a hard cap; the application
layer is the only place an exact limit exists.

### 3. Rate-limit identity: independent buckets, most restrictive wins

Not one identifier, and **not IP+session fused into a single composite key** — a composite is
*weaker* than either component, because rotating either dimension resets the counter.

Each bucket is counted independently and a request is refused if **any** bucket is exceeded:

| Bucket | Catches | Why it is insufficient alone |
| --- | --- | --- |
| IP aggregated to **/24** (IPv4) and **/64** (IPv6) | floods from one host or network | CGNAT and mobile carriers put thousands of real customers behind one address; per-address IPv6 is worthless, since a single subscriber is routinely delegated an entire /64 |
| session cookie (`HttpOnly`, signed) | repeated submits from one browser | reset by clearing cookies. **~~For the mint~~ superseded 2026-10-07 → [ADR 0147](0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md): the mint has one bucket, the address** |
| normalised email address (contact form only) | one person submitting from fresh sessions | the address supplied need not be real |
| global, per endpoint | total blast radius and bill exposure | far too coarse to protect any individual |

IPv6 **/64 aggregation is not optional**. Without it a single attacker has, in practice, an
unlimited supply of distinct identities.

### 4. Geography is a first-class signal, because this tool's traffic is not global

The owner's stated expectation, 2026-08-25: the configurator will be used **rarely, and
essentially only from Moldova**. That makes an attack trivially separable from normal traffic by
volume alone, and it makes geography a cheap, high-signal control that a globally-used product
could never rely on.

~~Traffic from **MD** gets the ordinary limits. Everything else gets a much tighter limit and a
`challenge` rather than a `deny`.~~ **For the mint, superseded 2026-10-07 → [ADR 0147](0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md):
one limit for everyone, no country in it.** The sentence stands, as accepted, for any other endpoint.

**Non-MD traffic is never denied outright**, for reasons that are not hypothetical here: the
Moldovan diaspora is large and much of it is in Romania and Italy; mobile roaming and VPNs
routinely geolocate to a neighbouring country; and the owner will test from wherever the owner
happens to be. A challenge lets every one of those through while stopping an automated flood. A
country `deny` would eventually lock out a real customer, and the failure would be invisible —
they simply never arrive.

### 5. Rates — all enforced in the application layer

Per decision 2, every number in this section is an **application** limit. The firewall's single
coarse rule is stated at the end and is not one of them.

"Very low" applies where a human action is genuinely rare. It cannot apply to design updates
without breaking editing, so those are bounded rather than low, and decision 6 is what makes the
bound meaningful.

Per-bucket application limits:

| Endpoint | IP /24 · /64 (MD) | IP /24 · /64 (non-MD) | Session | Other |
| --- | --- | --- | --- | --- |
| `POST /api/contact` (M8) | 3 / hour, 10 / day | 1 / hour + challenge | 2 / hour | 3 / day per email |
| `POST /api/designs` (mint) | ~~10 / hour, 30 / day~~ | ~~3 / hour + challenge~~ | ~~5 / hour~~ | **Superseded 2026-10-07 → [ADR 0147](0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md): one counter per IP address, 20 a day, for everyone** |
| `PUT`/`PATCH /api/designs/{id}` | 600 / hour | 120 / hour + challenge | 300 / hour | — |

**The firewall's whole contribution to rate limiting** is one rule across all of `/api/` at
**120 requests / 60 s per IP** — far above any legitimate use, and there to stop a flood before it
reaches a function, not to express any of the policy above. Every firewall rule ships in `log`
action first (see Consequences).

**The contact form fails closed**: if the counter store is unavailable the submission is refused.
At POC volume a lost lead is a better outcome than an open relay. Reads fail open; writes fail
closed.

Rate limiting is not the only control on the contact form. It is paired with a honeypot field, a
minimum time-to-submit, and Vercel BotID.

#### A global cap is an emergency brake, and it *challenges* rather than denies

It is tempting, given how low the expected volume is, to set a very low site-wide cap. That would
be a mistake in a specific way worth recording: **a low global `deny` cap hands an attacker a
one-request denial of service against every real customer.** They trip the global limit
deliberately and nobody else gets in.

So the global layer is deliberately loose and its action is `challenge`, never `deny`:

| Scope | Threshold | Action | Layer |
| --- | --- | --- | --- |
| all `/api/*` | 1 000 / hour | challenge | application |
| `POST /api/contact` | 60 / hour | challenge | application |

A human hitting a challenge still gets through. An automated flood does not. The precise
per-identity buckets in the table above are what actually protect an individual endpoint; the
global layer exists only to keep a sustained attack from running up the bill.

### 6. The save coalescer gains a minimum interval

A minimum interval between successful saves (1 000 ms), so the write path's output rate is bounded
by a timer rather than by the customer's latency. Without it the numbers in decision 4 are
unsizeable, the free-tier database absorbs one write per round trip during active editing, and M5's
width dragging makes it continuous. This is a defect in its own right, not merely a security
control.

### 7. Retention: abandoned designs are deleted

> **RETIRED by owner ruling, 2026-09-15** — see *Supersession note — 2026-09-15: decision 7* below.
> **Nothing is deleted automatically.** The text below stays in place, struck, because its security
> argument is the thing a later reader must weigh before proposing a reaper again.

~~A design that has never reached the contact step and has not been modified for **30 days** is
deleted by the existing nightly cron. This closes the retention question open since 2026-08-25, and
it is a security control as much as a hygiene one: it bounds how much an attacker who gets past
every other layer can accumulate, and it bounds free-tier storage.~~ The same cron prunes expired
rate-limit counters — **unchanged; that half is not retention and is not retired.**

Designs that reached the contact step are out of scope here and follow whatever the contact
submission's own retention policy becomes in M8.

### 8. Cross-device editing uses an emailed link, never a password (M8)

At the contact step the customer's email address is already captured. The design link is emailed
with the write token embedded, so editing from another device means opening it from the inbox.

No password is stored. This was considered and rejected: see Alternatives.

### 9. No external reverse proxy in front of Vercel

Specifically, **Cloudflare's proxy ("orange cloud") mode is rejected.** Using Cloudflare for DNS
only ("grey cloud") is unaffected and is fine.

### 10. When each part is implemented — the decisions stand, the rollout is staged

Owner's direction, 2026-08-25, after the decisions above were made: the project is nowhere near
done, so the firewall is not set up now and is deferred to the end phases. **This defers
implementation, not the decisions.** Everything above is settled and must not be re-litigated by
the phase that picks it up; what follows is only *when*.

| Part | Phase | Why there |
| --- | --- | --- |
| **Write-token cookie / read–write split** (decision 1) | **M3 Wave 3C** | 3C is the wave that builds the client write path. Building it with authorisation costs almost nothing; retrofitting it later means touching the repository, the coalescer, both routes and every caller a second time. This is the one part that gets *more* expensive by waiting. |
| **Save-coalescer minimum interval** (decision 6) | **M3 Wave 3C** | Not a security control at all — it is a write-path defect that also happens to make the limits sizeable. It belongs with the code it fixes. |
| **Application rate limiting** (decisions 2, 3, 5) | **M8**, with the contact form | The counters protect endpoints that mostly do not exist yet. The contact form is the endpoint the owner named as most needing throttling, and it arrives in M8. |
| **WAF rules** (decisions 2, 4, 5) | **Pre-launch**, after M7 | Production infrastructure with no value against zero traffic, and rules left staged for months go stale against an app that changed underneath them. Exact commands and the staged rollout: `docs/runbooks/firewall-setup.md`. |
| **Retention cron** (decision 7) | **M8** | Nothing to retain until designs are real and the contact step distinguishes abandoned from converted. |
| **Emailed edit link** (decision 8) | **M8** | Requires the email address the contact form captures. |
| **BotID, honeypot, time-to-submit** (decision 5) | **M8** | Contact-form controls; the form does not exist yet. |

The firewall rules were staged once to prove they stage cleanly on this plan, then **discarded**.
The project has zero custom rules today. `docs/runbooks/firewall-setup.md` holds the exact
commands so re-creating them is a copy-paste rather than a re-derivation — the expensive part was
establishing the plan constraints above, and those are now written down.

### 11. Residual risks accepted, after the 3C-2a security review

The write path was reviewed against a threat model of an attacker holding a share link and one
valid cookie of their own. **No exploitable path was found; ADR 0014 S1 is closed.** These are the
things deliberately not fixed, recorded so they are decisions rather than oversights.

- **`app_designs` holds table-level `UPDATE`, which includes `write_token_hash`.** No code path
  writes that column, so column-scoping it would shrink the blast radius of a leaked
  `DATABASE_URL` — an attacker could otherwise rewrite every design's credential and keep control
  after the leak is rotated. **Owner's decision, 2026-08-25: not worth it** — once someone holds the
  database the situation is already critical, and the marginal gain is escalation-and-persistence
  only. Revisit if the database is ever shared with another service.
- **Cookie tossing from a same-site subdomain.** The per-design `Path` makes a `__Host-` prefix
  impossible (that prefix mandates `Path=/`, which would send every design's credential on every
  request — the per-design path is the better trade). A compromised sibling on a custom apex could
  therefore set a competing cookie. It cannot forge a valid token, so this denies the owner their
  own writes rather than granting anyone else's. Not reachable on `*.vercel.app`, which is on the
  Public Suffix List. Accepted; if it ever matters, iterate the parsed cookie list rather than
  taking the first match.
- **No lost-update detection.** Two tabs sharing one cookie are both authorised and the last write
  wins. A consistency property, not a security one — an attacker gains nothing without the token —
  but combined with "deletion is final, no undo" it is the residue of ADR 0014's unrecoverability
  concern, now scoped down to the owner's own devices.
- **No request body size limit.** ADR 0019 decision 2 assigns volume to the firewall, which is
  deferred to pre-launch. The amplification that *was* a property of this code — an unbounded Zod
  error tree reaching the log — was fixed in this wave rather than deferred with it.
- **`Secure` cookies and LAN-hosted mobile testing.** Driving the 3C-3 mobile gate from a real
  handset against `http://<LAN-IP>:3000` will have the `Set-Cookie` silently dropped, and every save
  will 403 with nothing explaining why, since the refusal is deliberately reasonless. Run that gate
  on localhost, through Playwright emulation, or against an HTTPS Preview — and note Preview needs
  ADR 0020's migration first.
- **Selection inside the tolerance band depends on emission order.** `findVacatedVoid` keeps
  `FIT_TOLERANCE_M` at its lower bound, so a frame within 12 mm below a boundary satisfies two
  slots; the correct one wins because `recomputeVoids` emits a column's slices in ascending order
  and `.find` reaches it first. That is a property of the engine, not of the predicate, and it is
  asserted only indirectly. If slice emission ever stops being ordered, this resolves the wrong way.

## Alternatives considered

1. **A password for updates**, set at the contact step, enabling cross-device editing (the owner's
   own initial proposal). Rejected in favour of decision 8. It requires storing credentials for
   people who never created an account — Argon2id hashing, never logging, breach exposure — and the
   dominant risk is that **people reuse passwords**, so a leak of this project's database becomes a
   credential leak for services that have nothing to do with it. There is also no reset path: the
   email address arrives at the same moment the password would, so a forgotten password means the
   design is unreachable. The emailed link delivers the same capability with strictly less
   liability and one fewer field on the form.
2. **Full ownership and accounts.** The strongest option and the right end state if this becomes a
   product with returning customers. Rejected for now as implying an authentication system neither
   M7 nor M8 scopes, for a POC whose entire premise is that a customer configures a kitchen without
   signing up.
3. **Accepting the capability URL as a documented POC limit** (ADR 0014's option 1). Rejected: the
   owner has stated security is the priority, and unlike the other options this one becomes harder
   to reverse the moment real customers hold links.
4. **Redis (Upstash, via the Vercel Marketplace) for the counters.** The conventional choice, with
   atomic counters and native TTL, and genuinely less code than the Postgres option. Rejected on
   the owner's explicit direction not to add maintenance surface: it is another provisioned
   resource, another vendor, another environment variable and another free tier to monitor. The
   usual argument for it — write load under attack — is answered by decision 2: the edge layer
   absorbs floods before they reach Postgres, so the database only ever counts traffic that already
   passed a coarse limit. Revisit if measured write load makes it necessary.
5. **Cloudflare in front of Vercel.** Rejected. It duplicates protection this project already has
   (automatic DDoS mitigation on every plan; WAF custom rules verified available here), and it
   actively damages the feature being built: an external proxy makes real client IPs opaque and
   degrades bot detection, so rate-limit buckets key off proxy egress addresses. Get that wrong and
   every customer lands in one bucket — the limit then fires on everyone or on no one. Vercel's own
   guidance is to avoid an external proxy, and to configure Verified Proxy where one is
   unavoidable. It is not unavoidable here.
6. **WAF only, no application layer.** Rejected: per-region counters cannot enforce a hard cap, and
   the edge cannot key on a session or an email address at all — which is most of decision 3.
7. **Denying all non-MD traffic outright.** Tempting given decision 4, and rejected there: the
   Moldovan diaspora is concentrated in Romania and Italy, roaming and VPNs geolocate
   unpredictably, and the failure mode is silent — a real customer simply never arrives, and
   nothing in the logs looks like a problem. A challenge achieves the same protection against
   automation while leaving every human a way through.
8. **A very low site-wide cap**, which the expected traffic volume makes superficially attractive.
   Rejected in decision 5: a low global `deny` threshold is itself a denial-of-service vector,
   since one attacker can trip it deliberately and lock out every real customer.

## Consequences

- **Every firewall rule ships in `log` action first.** A rule's blast radius is not predictable
  until real traffic meets it, and a misconfigured rule blocks real customers. The sequence is
  log → review the dashboard → enforce in preview → enforce in production. Rules are **staged**;
  publishing to production is the owner's action, not an agent's.
- Wave 3C builds the client write path **with** authorisation from the start, rather than shipping
  it unauthenticated and retrofitting. The security work is not a later wave.
- A customer who clears cookies before reaching the contact step loses edit access to their design.
  It stays readable by link. This is the accepted cost of having no accounts, and decision 8 is
  what recovers it for anyone who completes the contact step.
- `packages/persistence` gains a rate-limit counter table and the app role gains the grants for it
  (ADR 0008's least-privilege role is extended, not bypassed).
- ADR 0014's S2 remains fixed; S1, S3 and S4 are addressed here. ADR 0014's status moves from
  Proposed to Superseded by this record.

## Correction, 2026-08-31 — the mint deferral is reaffirmed, and gated

This section is appended, not a rewrite. Nothing above is withdrawn: decisions 1–11 stand exactly
as accepted on 2026-08-25, and decision 10's staging is unchanged. What is new is evidence and a
gate.

**An adversarial review on 2026-08-30 independently reproduced the unthrottled mint path.** It did
not read this record and then agree with it; it went at the deployed surface and arrived at the
same place from the other direction, which is the useful part. Recorded as **SEC-001 (High)** in
`testing-reports/01-security-and-api.md`: `POST /api/designs` takes no request data, performs no
authentication, throttling, challenge, or quota check, and always inserts a seeded design — so an
attacker needs neither a design id nor a defeat of the write-token system, because **every request
legitimately mints a new row and a new credential**.

The review also chained it. `testing-reports/07-critical-attack-vectors.md` **AV-4** composes
SEC-001 with **SEC-002** (no request-byte limit and an unbounded `placements` array — the residual
risk decision 11 accepts above) and **DB-002** into a resource-exhaustion sequence: mint rows in a
loop from cleared sessions, fill the ones whose cookies are retained with large but schema-valid
placement arrays, and let the nightly backup — which holds every row as an object, stringifies
each, and joins one NDJSON string — grow until the function fails, while the cron endpoint still
returns HTTP 200 with `{ ok: false }` so status-only monitoring reads it as a success.

**Owner's decision, 2026-08-31: SEC-001 stays deferred to M8 / pre-launch, exactly as decision 10
staged it.** It is not being fixed now, and this deferral is not a re-opening of anything. The
requirement attached to it is that the deferral be *tracked and gated* rather than forgotten: see
the pre-launch blocker recorded in `docs/milestones/M8-review-contact-success.md` under "Launch
gate", which names each control that must be live.

**No code was changed by this correction.** The mint endpoint is unbounded at the application layer
today. Stated plainly, and this is the operative sentence: **`POST /api/designs` must not be
exposed to real traffic until the application limiter, the 30-day abandoned-design retention cron,
and the staged WAF rule ship together.** Any one of them alone leaves the AV-4 chain open — the
limiter without retention still accumulates whatever gets through, retention without the limiter
prunes on a 30-day delay while the flood continues, and the WAF rule is per-region and coarse by
construction (decision 2) and was never a hard cap.

A plan or a runbook is not a runtime control. Neither is this record.

## Supersession note — 2026-09-11: decision 1's read half

The owner answered the M7 plan's follow-up F5 on 2026-09-11 with **"Only its own browser"**.
**Superseded:** decision 1's *"`GET /d/{id}` and `GET /api/designs/{id}` stay open to anyone holding
the link. Sharing keeps costing nothing."* Reads now require the browser holding the design's owning
visitor cookie ([ADR 0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)
decision 5), and a read-only share becomes a later, explicit action. **Unchanged:** the per-design,
path-scoped write token and everything about writes; decisions 2–11, including decision 7's 30-day
retention, which the owner kept as the visitor cookie's lifetime too. Implemented by M7 wave 7E3b;
until it lands the code still answers reads to any link holder.

**Revised the same day, 2026-09-11.** The owner replaced *"Only its own browser"* with **"Own browser +
private share link"**. Decision 1's open read stays superseded for `/d/{id}`; the read-only view it
created for link holders **survives behind a separate, revocable share token** that grants no write
and never carries the design id or either cookie ([ADR 0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)
Amendment B; M7 wave 7E3c, ahead of 7E3b).

## Supersession note — 2026-09-15: decision 7 — the 30-day reaper is retired, not raised

**The owner retired it**, having first been asked only whether the preset library wanted a longer
*backup* window than `designs`. Verbatim:

> *"presets will not be removed… just to avoid accidental removal, we can remove for the first period
> of time this 30 days cleanup. We'll just keep collecting all the configuration of visitors, of
> users and so on. And later we can implement a functionality or just manually detect a period of
> time, let's say all the private kitchens that are older than one year, we can remove, not
> automatically, but we'll make this a script… we can focus now on storing and not removing."*

**Superseded:** decision 7's *"a design… not modified for 30 days is deleted by the existing nightly
cron"*, and with it the security argument that the deletion bounds what an attacker can accumulate.
**Nothing deletes a design automatically, and nothing is scheduled to.** Their reasoning, which is
the test a later reader should apply rather than the number: few visitors are expected, and a stored
configuration is *"a record in a table and a json format… that has few kbs"*, so storage does not
bind.

**Unchanged, and each is stated because a reader could reasonably take this note to cover it:**

- **The 14-day backup window.** `BACKUP_RETENTION_DAYS` governs how long an export survives in Blob,
  not how long a row lives, and **the owner ruled on it separately and explicitly the same day** —
  *"14 days backups for me is ok"*. **"Nothing is deleted" is about rows. Backups still rotate.**
- **Decisions 1–6 and 8–11**, including the rate-limit counter pruning that shares decision 7's cron.
- **The 30-day figure survives in a different role**: it is also the visitor cookie's lifetime
  ([ADR 0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)),
  which this note does not touch. A cookie expiring is not a row being deleted.

**The later manual script is RECORDED WITH ITS TRIGGER AND NOT BUILT** — the first application of
[ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md),
cited because that record is a day old and an example helps it land. The owner's *"later"*, *"let's
say"* about a year, and above all **"not automatically"** are the whole of what is ruled. **Trigger:
an owner who asks to remove old private kitchens.** Until then there is no job, no schedule, no
horizon constant and no column — a constant holding a horizon nothing reads would be the dead
configuration ADR 0118 decision 2 exists to refuse.

**One thing that script will need, recorded so it is not discovered as a grant request.** It cannot
run as the application: `packages/persistence/tests/application-role-privileges.test.ts:57-72` asserts
the application role holds **exactly `INSERT, SELECT, UPDATE`** on `designs`, with a standing
*"cannot delete a design"* test at `:92` (re-read at `bfc25ed`). **`DELETE` is absent by design and
must stay absent.** The owner's own *"we'll make this a script"* is already the right shape — a
deliberate operator action under its own narrow credential, on the pattern `MIGRATION_DATABASE_URL`
already sets and M7 wave 7P1's ruling P13 restates for the preset administrator. *(The connection is
the architect's; nothing is designed here and no grant is proposed.)*

**The consequence worth stating plainly, because this record's subject is the data lifecycle: no
table in this project now has a retention horizon. Everything stored is permanent by default.** That
changes what a schema mistake costs — there is no point at which an old shape ages out on its own,
so *"we can fix it when the old rows expire"* is no longer available as an argument anywhere. M7 wave
7P1 met the narrow form of this first, at the preset table's freeze; **the general form belongs
here.** *(The generalisation is the architect's; the ruling is the owner's.)*

## Supersession note — 2026-09-11: decision 8 — accounts with passwords, in M8

The owner ruled on 2026-09-11 (**"Profile replaces PIN"**, then **"In M8, with e-mail"**) that
cross-device editing is a **customer profile with e-mail and password**, built in M8
([ADR 0115](0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md)). **Superseded:** decision 8 (*"Cross-device editing uses an emailed link, never a
password"*) and the rejection of Alternatives 1 (a password) and 2 (accounts). **Not dismissed:** the
reasons Alternative 1 gave — password reuse, hashing and never-logging duties, the reset path — are now
M8's obligations, recorded in `docs/milestones/M8-review-contact-success.md`, *Customer profiles*.
Decisions 1 (write half), 2–7 and 9–11 stand.

## Annotation — 2026-10-07: two pointers found while planning M8

Appended by the documentation scribe from `docs/milestones/M8-review-contact-success.md`, *What this
revision corrected* and *Decision-record sweep*. No decision above is changed.

1. **The 2026-08-31 correction's "ship together" sentence lost its middle term.** It reads *"must not
   be exposed to real traffic until the application limiter, the 30-day abandoned-design retention
   cron, and the staged WAF rule ship together."* The retention cron was retired by the *Supersession
   note — 2026-09-15: decision 7* above, and the sentence was not restated. The three-part set is
   therefore no longer buildable as written. **What replaces it is owner question Q19 in the M8 plan
   and is undecided**; the plan's recommendation (limiter plus WAF) is a recommendation, not a ruling.
2. **Endpoint name.** Decision 5's table calls the contact endpoint `POST /api/contact`;
   `docs/ARCHITECTURE_PROPOSAL.md` §9 calls it `POST /api/contact-submissions`. The M8 plan's D15 uses
   the §9 name. Two records, one endpoint; the table's text is left as accepted.

## Annotation — 2026-10-07, later: decision 4 and who the customers are at launch

**Nothing above is changed.** Decision 4 names the Moldovan diaspora in Romania and Italy as the first
reason non-MD traffic is never denied outright. On 2026-10-07 the owner ruled, verbatim, in reply to
the M8 owner questions: *"Moldova only for now, rest as recommended"*. **Ruled:** customers at launch
are Moldova only, *"for now"*. **Not ruled:** what happens to traffic from outside Moldova. Decision
4's limits (a tighter limit and a `challenge`, never a `deny`) stand as accepted; whether they keep
standing is M8 owner question Q23, whose recommendation (keep decision 4) is the architect's and is
not a ruling. Decision 4's other two reasons, roaming and VPNs that geolocate to a neighbour and the
owner testing from abroad, do not depend on the diaspora. Where production runs, which decision 4
reads the country from, is open question Q21 and is not decided here.

## Supersession note — 2026-10-07: the mint's limits, and where the launch gate goes

**Superseded, for the mint only:** decision 5's mint row (all four figures), decision 4 as it applies to the
mint, and decision 3's session bucket as it applies to the mint. The owner ruled, verbatim, *"20 design
generation per day for all (we can track and adjust later this)"*, *"per user (ip)"* and *"20 per day"* (the
last in reply to whether the hourly limits stay or 20 a day is the whole limit). The record is
[ADR 0147](0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md), which
also holds what the owner did not rule: IPv4 as one address or a /24 (Q32), the meaning of a day, how an IP
address is stored, and how *"for all"* reads beside the *"Moldova only for now"* note above (they do not
conflict). **Unchanged:** the figures for saves, shares, page reads and the contact form, and decisions 1, 2,
6, 8 to 11 as already annotated.

**The 2026-08-31 correction's gate.** M8 builds the application half of the limiter and does not close the
gate. The gate, including the WAF line the correction's operative sentence needs, goes whole to the delivery
milestone ([M9](../milestones/M9-delivery-preparation.md), proposed). This is the architect's derivation from
the owner's ruling that hosting is a separate milestone, not the owner's sentence. Decisions 2, 9 and 10 (the
firewall, no external proxy, when each part is implemented) concern a host the owner has not chosen and are
re-read for it there; nothing in them is changed here.
