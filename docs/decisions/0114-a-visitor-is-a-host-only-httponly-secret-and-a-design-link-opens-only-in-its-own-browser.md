# ADR 0114 — A returning visitor is recognised by a host-only, HttpOnly secret, and a design's link opens only in the browser that owns it

Status: ~~Accepted for the visitor cookie (owner requirement, 2026-09-11). **Proposed for read-gating** (decision 5), which changes ADR 0002 and ADR 0019 decision 1 and waits on the owner's answer to the M7 plan's follow-up **F5**. Supersedes ADR 0111 Amendment A2's pointer design.~~ ~~**Accepted in full, 2026-09-11 — the owner answered F5 "Only its own browser" (Amendment A).**~~ **Accepted in full, 2026-09-11 — the owner revised F5 the same day to "Own browser + private share link" (Amendment B, which supersedes Amendment A).** Supersedes ADR 0111 Amendment A2's pointer design; supersedes the open read of ADR 0002 and ADR 0019 decision 1. **Amendment C, 2026-09-11** — the share link is made short (12 base62 characters, ~71 bits) on the owner's later statement; how a browser becomes authorised to *edit* is being re-decided by the owner (PIN or customer profiles) and is not yet recorded. **Amendment D, 2026-09-11** — the editing half is settled by [ADR 0115](0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md): customer profiles in M8 replace the PIN; in M7 the owning browser's cookie alone authorises reading and editing. **Amendment F, 2026-09-23** — wave 7E3a's plan: resume runs in Route Handlers (decision 4's *"as server components"* cannot clear a cookie); how a `__Host-` cookie is cleared; the mint refuses cross-site requests; the mint and save refresh points. **Amendment G, 2026-09-23** — wave 7E3c's plan: how the share link is built — rejection-sampled token, one table with an FK cascade the unattended screen is taught to accept, a hand-issued grant, the cross-site guard reused, a share view that holds no id, and `NEXT_LOCALE` read as outside *"sets no cookie"*. **Amendment H, 2026-09-23** — the owner's ruling on backlog 81, *"Rotate on mint"*: every mint issues a fresh visitor value and moves the browser's rows to it (superseding F3's reuse); wave 7E3b's plan: the read gate compares in SQL, and a save refreshes the visitor cookie only when the request's value owns the row. **H4, 2026-09-23** — the owner's ruling: a carried value rotates to `HMAC(secret, O)` so concurrent mints converge; the owner's final *"Conditional HMAC"* derives only for a convergence (the carried value owned a row, or its successor was first created ≤ 10 s ago), because the unconditional form lets the server act as an oracle for a planted value. **H5** — criterion 2's page half narrowed to two identity classes. **H6, 2026-09-23, later** — the owner's *"Web Lock + random"*: supersedes H4; rotation is random again, and tabs of one browser serialise design creation through a Web Lock.
Date: 2026-09-11
Type: Decision (owner requirement + engineering)
Milestone: M7 — waves 7E3a and 7E3b (architect's re-plan, `docs/milestones/M7-room-and-presets.md`)

## Context

The owner's Q7 asked for *"custom link for each user (save uuid related to potential user in session /
cookies)"*, the editor only at the design's own link, and a returning visitor resumed from the
browser. A second statement the same day, verbatim from speech, made the storage a security
requirement:

> *"important for the security. Ideally, to save this potential user UID in a secure part of the
> browser. I think cookie that is related to the domain. So nobody will be able... no JavaScript script
> will be able to read these values. In this way, we will protect the configuration of a user, and
> nobody will be able to open it accidentally or like a hacker. So maximum attention for this."*

What exists, measured at `3d3cb16`:

- **The write-token cookie** (ADR 0019 decision 1; `apps/web/src/lib/server/write-token.ts:44-55`):
  `HttpOnly`, `Secure`, `SameSite=Lax`, **`Path=/api/designs/{id}`**, no `Domain` (host-only), 30
  days, sliding on every save; one cookie per design, named `lemnaria_write_token_{id}`; 256 random
  bits, only the hash stored.
- **Reads are open to anyone holding the link**: `GET /api/designs/{id}` answers the design to every
  caller and `canWrite` beside it (`app/api/designs/[id]/route.ts:87-106`); `/[locale]/d/{id}` renders
  it server-side (`app/[locale]/d/[id]/page.tsx`). That is ADR 0002's shareable link and ADR 0019
  decision 1's read/write split, and three e2e specs assert a second visitor's read-only view
  (`read-only-panel`, `read-only-global-settings`, `shared-design-locale-identity`).
- **`Referrer-Policy: strict-origin-when-cross-origin`** (`lib/security-headers.ts:87`): a cross-origin
  request already receives only the origin, never `/d/{id}`.
- ADR 0111 Amendment A2 (hours earlier) proposed a pointer cookie holding the **design id**, `Path=/`,
  `SameSite=Lax`.

## The tension, stated rather than papered over

The owner asked for two things that pull apart. **A design link in the address bar leaks by every
ordinary route** — browser history and sync, screenshots, a forwarded message, a shared computer, the
hosting platform's request logs — and today **anyone holding that link can read the design**. The id
is 21 `nanoid` characters (~126 bits), so a stranger cannot *guess* it; but *"nobody will be able to
open it accidentally"* is not true of a link that opens for whoever has it. So either the link stays a
read capability and the owner's sentence is only partly met, or reads start to require the owning
browser and the product loses the shareable read-only link ADR 0002 was built for.

| Option | What a leaked link shows | Cost |
| --- | --- | --- |
| **A.** Unguessable id, reads open as today; visitor cookie for resume only; `Referrer-Policy: no-referrer` on `/d/*` | **The design, read-only**, to whoever has the link | Nothing changes for sharing. Meets *"like a hacker"* (unguessable), **not** *"accidentally"*. |
| **B.** Reads require the owning browser's cookie; sharing becomes a later, explicit share action | **Nothing** — the same "not available here" page a wrong id gets | Changes ADR 0002 and ADR 0019 decision 1; the read-only share view and its three e2e specs go; a customer who clears the browser or changes device cannot reopen until M8's emailed link. |
| **C.** No identifier in the URL at all; the id lives only in the cookie | Nothing — there is no link | Contradicts the owner's *"only with custom user uuid"* URL and makes a second design per browser unaddressable. |

**Recommended: B** — it is the only option that meets both halves of the owner's sentence, and the
lost capability (a read-only link anyone can open) is one no customer journey in M7 uses. Because it
changes two records, it is put to the owner as **F5** and is not implemented until answered.

## Decision

**1. One visitor cookie, holding a random secret — not the design id.**

| Attribute | Value | Why |
| --- | --- | --- |
| Name | `__Host-lemnaria_visitor` | The `__Host-` prefix makes the browser **enforce** `Secure`, `Path=/` and no `Domain`, so a sibling subdomain cannot set or overwrite it (cookie tossing) and it is never sent beyond this host. |
| Value | 256 random bits (`node:crypto`), base64url; the server stores only its hash | A leaked hash is useless; the value is a credential in its own right, independent of the id in the URL — which is what makes decision 5 possible. |
| `HttpOnly` | yes | No script — the application's, an extension's or an injected one — reads it. The owner's requirement. |
| `Secure` | yes (by the prefix) | Never sent over plaintext. Browsers treat `http://localhost` as secure, so development and Playwright keep working; wave 7E3a verifies it rather than assumes it. |
| `SameSite` | **`Lax`** | `Strict` would drop it on the first navigation from another site — a customer clicking their saved link in e-mail or a messenger would land on "not available" until a reload. `Lax` still withholds it from cross-site POSTs and subresource requests, and every write additionally needs the path-scoped write token and a custom header. |
| Scope | **host-only** | *"related to the domain"*: host-only is the tightest scope that still reaches every route of this host. Domain-scoped would send it to every subdomain for no benefit. |
| `Path` | `/` | It must reach `/`, `/configurator/*`, `/d/*` and `/api/designs/*`. |
| Lifetime | 30 days, **sliding**, refreshed with every successful save | **Not a new number and not the owner's:** it is ADR 0019 decision 7's retention — a design untouched for 30 days is deleted — and the write token's existing clock (`write-token.ts:11-18`). A longer cookie would point at a design that no longer exists; a shorter one would lock a customer out of a design still stored. If the owner wants visitors remembered longer, retention moves with it; that is noted under F5. |

**No client-side code reads or writes it, and nothing mirrors it** — no `localStorage`, no
`sessionStorage`, no script-readable copy. It is set only in `Set-Cookie` headers by the server.

**2. The write token is not the visitor identity.** It is scoped to `/api/designs/{id}` and named per
design, so `/` never receives it and could not resume anything; widening its path to `/` would send
every design's write credential with every page request, undoing ADR 0019 decision 1's scoping. The
two cookies keep two jobs: the visitor secret says *whose* design this is; the write token authorises
*writing* it.

**3. A design is linked to its visitor at mint.** `designs` gains a nullable visitor-hash column, by a
numbered migration under ADR 0020/0042/0096, with the same shape check `0003_check_write_token_hash_shape.sql`
gives the write-token hash and an index for the resume lookup. `POST /api/designs` keeps its bodyless
contract (ADR 0111 decision 1): it reads the visitor cookie if present, mints a secret and sets the
cookie if not, and stores the hash on the new row in the same insert.

**4. Resume is server-side.** `/` and `/configurator/configure`, as server components, read the cookie,
hash it, look up the visitor's most recently updated design and answer a 307 to `/[locale]/d/{id}`, or
send the visitor to Step 1. No response from either route contains the editor. A cookie matching no
design is cleared on that response.

**5. Proposed, pending F5 — a design opens only in its owning browser.** `/[locale]/d/{id}` and
`GET /api/designs/{id}` load the row and compare its visitor hash with the request's in constant time;
on a mismatch, a missing cookie or a missing row they answer **the same** "this kitchen is not
available in this browser" page (and `404` from the API), so the endpoint confirms neither existence
nor ownership. Rows written before the column (development and preview data; five production rows of
the seeded fixture) have no owner and are therefore unreadable — pre-launch data, stated. Sharing a
read-only copy becomes an explicit, later feature (M8's contact flow sends the manufacturer an
immutable snapshot server-side, `ARCHITECTURE_PROPOSAL.md` §9, not a link).

**6. The preset-author credential is separate and the visitor cookie grants nothing there.** The save
endpoint (ADR 0112) never reads the visitor cookie; a request with a valid visitor cookie and write
token but no author cookie is refused exactly as when authoring is off.

**7. Abuse limits: nothing is pulled forward from M8, and the launch gate grows by a line.** The cookie
is issued only by the mint, which is unchanged (SEC-001 stays deferred and gated, ADR 0019). A forged
cookie costs one indexed lookup per request, the same order as today's `/d/{random}`. M8's limiter
and WAF scope must include `/` and `/d/*`, and M8's retention cron deletes the visitor hash with its
row.

## What the visitor sees when the cookie is gone

Cleared browser, private window or another device: `/` has nothing to resume and opens Step 1. Under
decision 5, opening an old design link shows the "not available in this browser" page with a way to
start again; the design is intact but unreachable until M8's emailed edit link, which must **re-bind**
the browser — set both cookies — rather than merely display the design. Under option A the link would
still show the design read-only.

## Alternatives considered

- **The pointer cookie holding the design id** (ADR 0111 Amendment A2). Superseded: an id is not a
  secret — it is in the URL — so a cookie holding it can never gate a read, and it is exactly the value
  the owner asked to protect.
- **Widen the write token to `Path=/` and use it as the identity.** Rejected (decision 2).
- **A server session table keyed by a session id.** Equivalent in security to decision 3's column and a
  second table to retain and back up; the visitor hash on the row is the smallest change.
- **`SameSite=Strict`.** Rejected for the navigation case in decision 1's table.

## Consequences

- Waves 7E3a (cookie, migration, mint linking, resume) and 7E3b (read gating, if F5 is *yes*) are
  **Full tier with a security reviewer**.
- If F5 is *yes*: ADR 0002's shareable link and ADR 0019 decision 1's open read are amended by dated
  entries, and the three read-only e2e specs are rewritten to assert the refusal.
- M8's plan inherits two obligations: the emailed link re-binds the visitor, and the contact flow sends
  a snapshot, not a design link.

## Decision-record sweep

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0019](0019-security-baseline-writes-throttling-retention.md) decision 1 | Reads open to link holders; writes need a per-design, path-scoped token. | **Write half kept unchanged** (decision 2). **Read half: proposed amendment**, pending F5. |
| [0002](0002-db-backed-shareable-persistence.md) | A design is addressed by an opaque id in the URL, and the link is shareable. | **Addressing kept**; *shareable to anyone* proposed to end, pending F5. |
| [0010](0010-m3-client-write-path-unwired.md) | Mint on first mutation, never on page load. | **Kept**: the cookie is issued only at mint. |
| [0041](0041-the-browser-security-policy-is-versioned-and-the-csp-only-reports.md) | Versioned headers; the CSP carries a nonce. | **Untouched**; `/` and the configure route become dynamic, which removes two prerendered pages from the CSP's own blocker list. |
| [0111](0111-step-1-creates-the-design-through-the-existing-mint-then-save-and-the-room-entry-lives-in-the-url.md) Amendment A2 | A pointer cookie holding the design id. | **Superseded** by decision 1. A1, A3–A6 stand. |
| [0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md) | The author credential is separate. | **Confirmed** (decision 6). |
| [0020](0020-a-migration-file-is-not-an-applied-migration.md), [0042](0042-the-database-records-which-migrations-it-ran.md), [0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md) | Migration rules. | **Followed** (decision 3). |

## Amendment A — 2026-09-11: the owner answered F5 — SUPERSEDED THE SAME DAY by Amendment B

> **The owner revisited F5 the same day and chose a different option** — see Amendment B. The text
> below is struck, not deleted, because it was recorded as the owner's answer for a few hours.


~~The option chosen, verbatim: **"Only its own browser"**. Decision 5 is **accepted**: a design's link~~
~~opens only in the browser holding the owning visitor cookie, and sharing comes later as an explicit~~
~~share action. The cookie's and the design's lifetime stays **30 days after the last change** (decision~~
~~1's table; ADR 0019 decision 7). ADR 0002 and ADR 0019 decision 1 carry dated supersession notes, and~~
~~M7 wave 7E3b — which implements decision 5 — is unblocked.~~

## Amendment B — 2026-09-11: the owner's revised F5 — the owner's browser, plus a private, revocable share link

**The option chosen, verbatim** (owner, 2026-09-11, replacing Amendment A's answer the same day):

> **"Own browser + private share link"**: *"Normal link opens only in the owner's browser; a separate
> 'share' button creates a second read-only link the customer can send (e.g. to the manufacturer or
> family) and revoke later."*

**B1. Decision 5 stands for `/d/{id}`.** Reads require the owning visitor cookie; anyone else — a
missing cookie, a foreign cookie, a nonexistent id — gets the byte-identical *"not available in this
browser"* response. What Amendment A deferred to *"later"* is now part of M7: the share link.

**B2. The share link is a second credential, read-only, and nothing else.**

| Property | Decision | Why |
| --- | --- | --- |
| What it carries | Its own 256-bit random token (`node:crypto`), base64url; **never the design id** | A leaked share link reveals nothing about the design's own link, and revoking it touches nothing else. |
| What is stored | Only the token's hash, in a new `design_share_links` table (design id, token hash, created, revoked), by a numbered migration under ADR 0020/0042/0096, with the same hash-shape check as the write token | A database read does not yield working links. |
| How many | **One active link per design** at a time, enforced by a partial unique index over rows not revoked | The owner's words are *"a second read-only link"*, singular. One link is one thing to revoke; the table admits several later by dropping the index, with no data migration. |
| Revocation | **Immediate**: every share read checks, in the same query, that the row is not revoked | *"revoke later"* means the next request fails, not the next deploy or cache expiry. |
| Re-issue | **Yes** — "share" again mints a **new** token; a revoked token never works again, and issuing a new link revokes any active one | The customer who sent a link to the wrong person must be able to cut it off and send a fresh one. |
| Lifetime | **The design's**: the row is deleted with its design (FK cascade) when retention removes it, 30 days after the last change (ADR 0019 decision 7). Viewing through a share link does **not** refresh retention. | A share link cannot keep a design alive; only its owner's saves do. No second clock. |
| URL | `/[locale]/s/{token}` — a customer route through `proxy.ts`'s allow-list, CSP nonce included | The locale is presentation (ADR 0095 decision 4); the token is the only identifier in the path. |
| Headers | `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` (and the robots meta), `Cache-Control: private, no-store` | The token lives in the path, so no request from the page may carry it onward; no search engine or shared cache may keep it. |
| Shown once | The owner sees the new link once, when created, with a copy action; the server cannot show it again, having only the hash | *"Stores only the token's hash"* rules out redisplay; re-issue is the recovery. |

**B3. What a share link grants: a read-only view, and nothing that leads to editing.** The share page
renders the design in the editor's **existing read-only mode** — the 3D scene, the panel read-only, the
price — which is the surface ADR 0019 decision 1 built for link holders and which 7E3b would otherwise
retire. It shows no control that edits, saves, re-depths or opens Step 1. It **never** mints a design,
**never** sets or reads the visitor cookie or a write token, **never** runs the write-access probe, and
never reveals the design id — not in the page, its payload or any API response it calls. The design is
served to it through a share-scoped read (`GET` by token), not through `/api/designs/{id}`.

**B4. Only the owner creates or revokes.** `POST` and `DELETE /api/designs/{id}/share` sit under the
write token's own path, so the browser sends the per-design token to them and nothing else does. Both
require that token and the owning visitor cookie. No customer can mint a share link for someone else's
design, and the preset-author credential (ADR 0112) is not involved.

**B5. Rate limits: nothing pulled forward from M8.** Guessing a 256-bit token is not an attack; a
wrong token costs one indexed hash lookup, the same class as today's `/d/{random}`. Creation is behind
the write token, so it adds no unauthenticated write. M8's limiter and WAF scope gain `/s/*` and the
share endpoints.

**B6. A share link is not a way back in.** It is read-only by construction, so it cannot restore a
customer's editing after cookie loss; M8's e-mailed link, which re-binds both cookies, remains that
path. Recommending otherwise would turn a link meant for the manufacturer or family into an edit
credential.

**B7. M8 inherits two corrections.** Its success screen's promise that the design *"can be reopened"*
must say *in this browser, or through the link we e-mail you*; and its manufacturer hand-off is an
immutable snapshot (`ARCHITECTURE_PROPOSAL.md` §9), which does not depend on a share link — if the
submission should include one, M8 creates it through B4's endpoint.

**Copy.** The share control and page add wording no mockup draws; it is drafted and recorded under
[ADR 0113](0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md)'s
ruling for M7's new wording, which the owner may adjust later. No frame draws the control either, so
its placement is the wave's, verified at 390 × 844 against ADR 0104's top-bar rules.

## Amendment C — 2026-09-11: the share link is short; the editing credential is being re-decided

**The owner restated F5 later the same day**, verbatim:

> *"For editing we should request a password or pin code, but for sharing we need to generate a short
> link that will offer only read only configuration without any passowrds."*

**Only the sharing half is recorded here.** The editing half — a PIN, or customer profiles with an
e-mail and password, which the owner has since proposed — is being settled with the owner and is
**deliberately not designed in this record yet**. Until it is, Amendment B's premise that the owning
browser's cookie alone authorises editing is **under revision**, and wave 7E3b (gating `/d/{id}`) is
on hold. Nothing else in Amendment B is withdrawn.

**C1. "Short" is 12 base62 characters — about 71 bits — and it is short enough to need no rate
limiter.** 62^12 ≈ 3.2 × 10^21, i.e. 12 × log2(62) ≈ 71.4 bits. The guessing budget is what decides it,
worked at deliberately generous attacker figures — a million live share links and a thousand guesses a
second sustained, far beyond what the platform's edge would pass:

| Length | Entropy | Expected time to hit *any* live link (10^6 links, 10^3 guesses/s) |
| --- | --- | --- |
| 10 | ≈ 59.5 bits | ≈ 8.4 × 10^17 / 10^9 ≈ 8.4 × 10^8 s ≈ **27 years** — too thin without a limiter |
| **12** | **≈ 71.4 bits** | ≈ 3.2 × 10^21 / 10^9 ≈ 3.2 × 10^12 s ≈ **100,000 years** |
| 16 | ≈ 95 bits | beyond any meaning; the link stops being short |

So Amendment B2's 256-bit token is **replaced by a 12-character base62 token** from `node:crypto`
(rejection-sampled, so every character is uniform — a modulo reduction would bias it). **No ADR 0019
M8 control is pulled forward for share-token guessing**; M8's limiter and WAF scope still include
`/s/*`, as defence in depth. The hash stays SHA-256 of the token: a slow hash buys nothing against a
71-bit random secret, whose preimage is out of reach at any speed.

**C2. The link handed out is `https://{host}/s/{token}`, without a locale.** The proxy's existing
negotiation (ADR 0095 decision 4: the unprefixed path redirects by cookie, then `Accept-Language`)
sends each *recipient* to `/{locale}/s/{token}` in their own language, and the link stays short. The
page itself remains `/[locale]/s/[token]` behind `proxy.ts`'s allow-list.

**C3. What stands from Amendment B, unchanged:** read-only, **no password**; only the hash stored;
one active link per design; immediate revocation; re-issue mints a new token and kills the old; the
link lives and dies with its design and never refreshes retention; `Referrer-Policy: no-referrer`,
`noindex, nofollow`, `private, no-store`; the existing read-only editor view; never a write, never
the design id, never either cookie. **Amended:** B4's *"requires that token and the owning visitor
cookie"* becomes *"requires whatever authorises editing the design"* — today the write token and the
visitor cookie, and whatever the owner's pending decision adds.

## Amendment D — 2026-09-11: the editing credential is settled — a profile, in M8

The owner replaced the PIN with a customer profile (e-mail and password) and placed it in M8
([ADR 0115](0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md)). For M7 that settles what Amendment C left open: **the owning browser's visitor
cookie alone authorises reading and editing `/d/{id}`**, and creating or revoking a share link
requires the write token plus that cookie. Amendments B and C stand in full; 7E3b comes off hold.

**Corrected in place by this amendment:** where this record says the way back after cookie loss is
*"M8's e-mailed link"* (*What the visitor sees when the cookie is gone*, decision 7's consequence, B6
and B7), read **M8's customer profile**, into which anonymous designs are claimed at sign-up. ADR 0019
decision 8's e-mailed edit link is superseded by ADR 0115; whether it survives beside profiles is
M8's to decide.

**The owner's clarification, verbatim: *"short link only to share"*.** Consistent with Amendment C:
the 12-character token is the share link's alone. A design's own address `/d/{id}` keeps its existing
`nanoid` identifier and is not shortened. Nothing in this record said otherwise.

## Amendment E — 2026-09-17: a customer who left the composing screen returns by their own identity, not by a new screen state

**The question, and why it was asked.** M7 wave 7F4b's hand-off writes the composed kitchen and then
navigates to `/{locale}/d/{id}`. If the customer leaves frame 1F while the write is in flight, the
write still lands and the navigation is deliberately disarmed (criterion 42), so a design exists that
nobody was taken to. Wave 7F4b recorded, at `ef83393`, that `HandoffStatus` gained a `saved` state and
that **what 1F should draw in it was an open product question** — deliberately not answered by that
wave.

**The owner's answer, 2026-09-17, verbatim:** *"Just load the kitchen based on url that include the
user id, taken from browser cookie or if is registered from user profile."*

**What this decides.** The remedy is **not** a new 1F state and not new 1F copy. A returning customer
reaches their kitchen by being **recognised**, which is this record's own subject: the `__Host-`
HttpOnly visitor secret and the visitor-hash column, with server-side resume — wave **7E3a**. The
registered-profile half is [ADR 0115](0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md)'s
and arrives in M8; M7 ships the cookie alone, exactly as Amendment D already states.

**What is owed, and by whom.** Nothing by 7F4b, which is closed on this ruling rather than held open
by it. **7E3a** already owns server-side resume; this amendment adds the reason it also answers the
orphaned-write case, so the wave that builds resume knows the case exists and does not read the
`saved` state as dead code. **No wave is created here**, and the `saved` state stays as shipped.

**What this does not say.** It does not put a design id in a URL keyed by the visitor — the design's
link stays `/{locale}/d/{id}` and is gated by the owning browser (decision 5, Amendment B). *"A url
that include the user id"* is read as **the customer being identified when they return**, not as a
URL shape that carries an identifier; a per-visitor listing URL is neither designed nor approved here.
That reading was the coordinator's, and it is recorded as a reading rather than as the owner's words.


## Amendment F — 2026-09-23: how 7E3a implements decisions 1, 3 and 4

Recorded by the architect in [wave 7E3a's plan](../milestones/M7-room-and-presets.md#wave-7e3a--the-plan-2026-09-23), at `6b82a2b`, before implementation. **The contract is unchanged.** One cookie, the same attributes, resume on the server, and a clear on the same response. Only the mechanism is decided here, plus one guard that the contract turned out to need.

**Shipped 2026-09-23, wave 7E3a — see the [7E3a close-out](../milestones/M7-room-and-presets.md#7e3a-close-out--2026-09-23).** Commits, in order: plan + this amendment `046755e`; S1 `ca5d975`; S1 security fixes `49c4672`; S2 `1619715`; S3 `15e18df`; S4 `e2d95ef`; QA `0d53a06`; review round 1 fixes `1ae9f32`.

**Per the security reviewer: decision 5 — a design opens only in its owning browser — is not yet enforced by this wave.** 7E3a mints, refreshes, resumes and clears the visitor cookie, and its migration adds `designs.visitor_hash`; nothing in 7E3a gates `/{locale}/d/{id}` or `GET /api/designs/{id}` on that hash matching the request. That gate is wave **7E3b**'s subject, per the recorded order `7E4 → 7E3a → 7E3c → 7E3b`.

**F1. Decision 4's *"as server components"* is superseded in mechanism only.**

- **Why it has to change.** Next 16 does not support setting cookies during Server Component rendering: *"use a Route Handler"* (`next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`). Decision 4 also requires *"a cookie matching no design is cleared on that response"*.
- **What replaces it.** `/[locale]` and `/[locale]/configurator/configure` become Route Handlers, `GET` only. Each answers a relative `307` with an empty body and `Cache-Control: private, no-store`. That header is there because a cached resume would give one visitor's design id to the next.
- **Rejected alternatives:**
  - a resume in the proxy, which would put a database lookup in the proxy;
  - leaving the cookie uncleared, which breaks decision 4.

**F2. Clearing a `__Host-` cookie repeats its attributes.**

- **The rule.** The clear is `Max-Age=0; Path=/; Secure; HttpOnly; SameSite=lax` with no `Domain`, built from the same constant as the set.
- **Why.** Next's `cookies.delete(name)` emits no `Secure`, which was checked in `next/dist/compiled/@edge-runtime/cookies`. A browser ignores a `__Host-` `Set-Cookie` without `Secure`, so the cookie would silently survive. That second half is an inference, which the wave measures in a browser.

**F3. Refresh points.**

- **The mint.** It reuses a well-formed cookie from the request and re-emits it. An absent or malformed cookie is replaced with a fresh secret.
- **A successful save.** It re-emits the request's own well-formed value and never mints one, per decision 1's *"refreshed with every successful save"*.
- **Nothing else sets it.** Resume only ever clears.
- **A stale premise, noted without re-deciding.** Decision 1's lifetime argument (*"a longer cookie would point at a design that no longer exists"*) lost its premise on 2026-09-15, when ADR 0019's decision 7 note retired automatic deletion. The 30-day figure stands, as that note says.

**F4. The mint refuses cross-site requests.**

- **The rule.** `POST /api/designs` answers 403, sets no cookie and writes no row when either:
  - `Sec-Fetch-Site` is present and is not `same-origin`; or
  - it is absent and `Origin` is present and is not the request's own origin.
- **Why.** A cross-site top-level form `POST` carries no `SameSite=Lax` cookie, but its response may still set one. That is RFC 6265bis's top-level-navigation exception, an inference the wave's QA measures. Without the guard, any site could replace a visitor's identity and cut them off from their designs.
- **What it does not change.** ADR 0111 decision 1's contract for every legitimate caller: the same-origin Step 1 mint and the e2e fixture. SEC-001's rate limit stays in M8.

**F5. A lookup failure is not a missing design.**

- **The rule.** A driver error during resume sends the visitor to Step 1 **without** clearing the cookie, and logs one line that carries no value, hash or id.
- **Why.** An outage must never erase an identity.

## Amendment G — 2026-09-23: how 7E3c implements Amendments B and C

Recorded by the architect in [wave 7E3c's plan](../milestones/M7-room-and-presets.md#wave-7e3c--the-plan-2026-09-23), at `8b4282c`, before implementation. **The contract of B and C is unchanged.** What follows is mechanism, plus three gaps between this record and others that the plan found and rules here.

**G1. The token.** Twelve characters of `0-9A-Za-z`, from `node:crypto` bytes kept only below 248 (4 × 62) and mapped by `b % 62`, so each character has exactly four preimages (C1's *"rejection-sampled"*). SHA-256 hex is stored; the digest is extracted once for the three secrets that use it.

**G2. The table and the unattended screen — a gap between B2 and ADR 0096.** B2 requires an FK cascade; `migration-safety.ts` refuses any statement containing the word `delete`, and its test requires every shipped file to clear, so `on delete cascade` would have blocked every later deploy. **Ruled:** the screen recognises a referential action inside a statement it already accepts as `create table if not exists` — the one place such a clause is additive — and nowhere else. `0006` holds exactly one `create table` and one partial unique index (one active link per design).

**G3. The grant — a gap between B2 and ADR 0008.** ADR 0008 grants per table, by hand. **Ruled:** `app_designs` receives `SELECT, INSERT, UPDATE` on `design_share_links` — no `DELETE`: revocation is an update and the cascade runs as the table owner — issued by the owner after `0006` and before the deploy, not by the migration. ADR 0008 carries a dated note.

**G4. Create, revoke, status.** `POST`, `DELETE` and `GET /api/designs/{id}/share` require the write token and the owning visitor cookie (Amendment D), compared in SQL. The route reuses F4's cross-site check, because `Lax` does not withhold cookies from a same-site sibling. Every refusal is the byte-identical 404 a missing design gets. Issuing locks the design row, revokes, and inserts in one transaction. No share operation writes to `designs`, so none refreshes retention or reorders resume.

**G5. The view holds no id.** `/[locale]/s/{token}` loads the document by token hash through a query that selects no id. It hydrates the store under a sentinel id with `canWrite: false`, and mounts the editor in a variant with no Step 1 link and no review control. It reads no cookie and calls no API. The proxy sets `no-referrer`, `noindex, nofollow` and `private, no-store` on the page and on the unprefixed redirect.

**G6. `NEXT_LOCALE` — a gap inside B/C.** C2 sends the recipient to their locale through the proxy's existing negotiation, which sets `NEXT_LOCALE`. **Ruled:** 7E3c's *"sets no cookie"* means no credential cookie and no cookie other than `NEXT_LOCALE`, which carries only a locale (ADR 0095 decision 4).

**G7. Backup.** Share rows are **not** exported: restoring an older export must never revive a revoked link. A point-in-time restore can, so the restore runbook gains an owner step that revokes every active link after one.

**Shipped 2026-09-23 — wave 7E3c is DONE.** Commits: plan + this amendment + ADR 0008 note `f59d79b`; S1 `2565e19`; S1 screen fix (SEC-7E3c.1/.2) `ffb5484`; S2 `553031d`; S3a `ebb2d1c`; S3b `783a07d`; S4 `a20d577`; S5 `0cc3e4a`; S6 `2260d44`; QA fixes + QA tests `8fafe82`; review round 1 `c9a2ccd`; review round 2 `03ffd4a`; screen notes `b39983d`. The screen extension in G2 needed far more correction than a single recognised case — see [the 7E3c close-out](../milestones/M7-room-and-presets.md#7e3c-close-out--2026-09-23) for the full list of bypasses the wave found and fixed. Security approved the screen at `03ffd4a`.

## Amendment H — 2026-09-23: the visitor value rotates on every mint, and how 7E3b gates the read

Recorded by the architect in [wave 7E3b's plan](../milestones/M7-room-and-presets.md#wave-7e3b--the-plan-2026-09-23), at `e00a8dc`, before implementation. **Decision 5 and Amendment B1 are unchanged:** a design opens only in its owning browser, and every other request gets one indistinguishable refusal. H1 is an owner ruling. H2 and H3 are mechanism.

**H1. The visitor value rotates on every mint.** This is the owner's ruling, 2026-09-23. It closes backlog 81 (SEC-7E3a.1).

- **The choice, verbatim:** *"Rotate on mint"*. It was chosen over backlog 81's option (a), which would have accepted the fixation with CSP enforcement in M8 as a named dependency.
- **What it supersedes:** F3's and 7E3a D1's reuse clause (*"reuses a well-formed cookie from the request and re-emits it"*).
- **What now happens.** Every `POST /api/designs` that passes F4 issues a fresh 256-bit value. When the request carried a well-formed value, the browser's existing rows move from that value's hash to the new one. The move shares one transaction with the insert, and it is idempotent under the retry `retryOnComputeRestart` may make:
  1. the `update` of the old hash to the new;
  2. an `insert … on conflict (id) do nothing`;
  3. a `select` of the new row by id **and** new hash.
- **When there is nothing to move.** An absent, empty or malformed value moves nothing and issues no `UPDATE`.
- **Why it closes backlog 81.** A value planted by script owns nothing after the next mint, and the new value is `HttpOnly`, so no script ever learns it.
- **What else changes.**
  - 7E3a criterion 5's must-not (*"no statement writes `visitor_hash` except the mint's insert"*) now reads: *except the mint's insert and the mint's rotation, in one transaction*.
  - The move touches no column but `visitor_hash`. In particular it leaves `updated_at` alone, so resume order and retention are unaffected.
- **Two residuals, recorded and not built** (ADR 0118):
  - *Concurrent mints, or a save that commits before a rotation and is answered after it.* Either can leave rows under a value the jar no longer holds.
  - *A planted value's own rows are moved into the victim's identity.* This has the same precondition as backlog 81.

**H2. The gate compares in SQL.**

- **The read.** `/[locale]/d/{id}` and `GET /api/designs/{id}` read through `select … where id = $1 and visitor_hash = $2`. A foreign row, an unowned (pre-`0005`) row and a missing row are one outcome of one statement.
- **Decision 5's *"compare … in constant time"*** is met by Postgres comparing SHA-256 digests of 256-bit secrets. This is the argument already accepted for `write_token_hash` in `saveAuthorized`: a digest's prefix does not help anyone produce a preimage.
- **Rejected: comparing in application code with `timingSafeEqual`.** It would load the hash into memory and give *no row* and *mismatch* two code paths.
- **What a refusal does not do.** A request with no well-formed cookie issues no query. A stored document is migrated and validated only for its owner, so an invalid row is indistinguishable from a missing one to anyone else.
- **What a refusal looks like.**
  - The API answers `designNotFoundResponse(id)`, which now carries `Cache-Control: private, no-store` and `Vary: Cookie` for every caller.
  - The page renders *"not available in this browser"* at HTTP 200. That is a new `unavailable` reason with one new leaf, approved as drafted under ADR 0113.

**H3. A save refreshes the visitor cookie only when the request's value owns the saved row.**

- **The rule.** The answer comes from the same `update` statement, so no second query is made.
- **What it supersedes:** 7E3a D1's *"Rejected: a tight refresh"*. That rejection held while the refresh's only benefit was matching retention. **The new reason is H1.** A save carrying a value that was just rotated away would otherwise re-emit it, and lock the browser out of every design it owns.
- **What stays the same.**
  - A save without a well-formed cookie still refreshes nothing.
  - The write token alone still authorises the save (decision 2; ADR 0019 decision 1).

~~**H4 — 2026-09-23: a carried value rotates deterministically.**~~ **SUPERSEDED the same day by H6.** It is kept as the record of what was decided and why it failed: `sec-7e3`'s SEC-7E3b.5 (High) showed that condition (b) can be chained. Anyone holding a live value can watch it rotate away by polling `/ro` until the answer is "none", then mint with it inside the 10 s window and receive its successor — so an attacker who once holds a value follows the victim indefinitely. This is the owner's ruling, *"Conditional HMAC"*, given the same day after an earlier, unconditional *"HMAC rotation"* was corrected to them. It supersedes H1's *"always fresh"* for a carried well-formed value.

- **Why the ruling was needed.** Wave 7E3b's QA measured H1's first residual on `next start`. With two concurrent mints from one browser, 29 of 30 rounds left the jar holding a value that owned only the second design. Every earlier design was lost from that browser.
- **The ruling.** `N = HMAC(secret, O)`, so concurrent mints from `O` converge on one `N`, under the condition below. A browser carrying no well-formed value still gets a random one. A client-side Web Lock was rejected as the primary fix.
- **The secret.**
  - `VISITOR_ROTATION_SECRET` holds 32 random bytes, base64url.
  - It is read server-side, at mint, and never at boot.
  - When it is absent or malformed, every mint fails closed with a 500.
  - The owner provisions it on preview and on production, one value each.
  - Changing it locks no visitor out: the next mint derives from the browser's current value.
- **The derivation is used only when it is a convergence.** Wave 7E3b's plan §8 found that the server computes `N` for anyone presenting `O`. An attacker who planted `P` could therefore mint from `P` in their own browser and receive the victim's `N`, which is backlog 81 again. `N` is used only when either:
  - (a) `O` owned a row in the minting statement's snapshot; or
  - (b) rows under `N` were first created no more than 10 s ago, a window a later join cannot extend.

  Every other mint gets a random value. A planted value that owns nothing never derives. An attacker's own identity, planted in a victim's browser, is reached only by live timing within the window.
- **Rejected: unconditional HMAC**, the owner's first choice. Its premise was *"fixation stays closed because `N` is uncomputable without the secret"*, but the server computes `N` for anyone who presents `O`. So a planted `P`, which the attacker can also present from their own browser, gives the attacker the victim's `N`. That reopens backlog 81, leaving CSP enforcement (M8) as the only defence. The condition keeps backlog 81 closed. What remains is a live same-origin script timing the victim's mint within the window; wave 7E3b's plan §8 records it as S5-R4.

**H5 — 2026-09-23: criterion 2's page half is narrowed** (coordinator ruling (1), cited here at review finding L1.4). On the page, the refusal is byte-identical **within** each of two classes:
- a foreign cookie, an unknown id, and a row with no owner;
- no cookie, an empty cookie, and a malformed cookie.

It is not identical across the two classes. The API half of criterion 2 is unchanged: one byte-identical 404 for every refusal case.

**H6 — 2026-09-23, later the same day: random rotation, with the two-tab race fixed in the browser.** This is the owner's ruling, *"Web Lock + random"*. It supersedes H4 in full.

- **Rotation is H1's again.** Every mint issues a random value and moves the browser's rows to it, so backlog 81 stays closed. `HMAC`, H4's conditions (a) and (b) and `VISITOR_ROTATION_SECRET` are removed. No environment variable exists for this, and no owner action is owed.
- **The race H4 set out to fix is closed in the client.**
  - The one client module that `POST`s `/api/designs` takes an exclusive Web Lock, `lemnaria:create-design`, for the whole request. A second tab's mint therefore starts only after the first tab's response has set its cookie, and carries that cookie.
  - The lock shares its scope with the cookie jar (origin and storage partition). It reads and writes no cookie, so decision 1 stands.
  - A browser without the API mints unlocked. So does a wait on the lock longer than 10 s.
- **Accepted residual.** Browsers without Web Locks (Safari before 15.4 and older engines) and non-browser clients can still race. Measured on `next start`, two overlapping mints from one value lost every earlier design in 29 of 30 rounds. The save-versus-mint half of that race (H3) is also unchanged.
- **Rejected:**
  - H4's conditional HMAC, for SEC-7E3b.5;
  - unconditional HMAC, which reopens backlog 81 (H4);
  - a server-side lock keyed by the carried value, which serialises only requests that reach the server together and does nothing for a second tab whose request left before the first response arrived.
