# ADR 0114 — A returning visitor is recognised by a host-only, HttpOnly secret, and a design's link opens only in the browser that owns it

Status: Accepted for the visitor cookie (owner requirement, 2026-09-11). **Proposed for read-gating**
(decision 5), which changes ADR 0002 and ADR 0019 decision 1 and waits on the owner's answer to the
M7 plan's follow-up **F5**. Supersedes ADR 0111 Amendment A2's pointer design.
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
