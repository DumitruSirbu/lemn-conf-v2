# ADR 0019 — Security baseline: write authorisation, layered throttling, and retention

Status: Accepted
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
| session cookie (`HttpOnly`, signed) | repeated submits from one browser | reset by clearing cookies |
| normalised email address (contact form only) | one person submitting from fresh sessions | the address supplied need not be real |
| global, per endpoint | total blast radius and bill exposure | far too coarse to protect any individual |

IPv6 **/64 aggregation is not optional**. Without it a single attacker has, in practice, an
unlimited supply of distinct identities.

### 4. Geography is a first-class signal, because this tool's traffic is not global

The owner's stated expectation, 2026-08-25: the configurator will be used **rarely, and
essentially only from Moldova**. That makes an attack trivially separable from normal traffic by
volume alone, and it makes geography a cheap, high-signal control that a globally-used product
could never rely on.

Traffic from **MD** gets the ordinary limits. Everything else gets a much tighter limit and a
`challenge` rather than a `deny`.

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
| `POST /api/designs` (mint) | 10 / hour, 30 / day | 3 / hour + challenge | 5 / hour | — |
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

A design that has never reached the contact step and has not been modified for **30 days** is
deleted by the existing nightly cron. This closes the retention question open since 2026-08-25, and
it is a security control as much as a hygiene one: it bounds how much an attacker who gets past
every other layer can accumulate, and it bounds free-tier storage. The same cron prunes expired
rate-limit counters.

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
