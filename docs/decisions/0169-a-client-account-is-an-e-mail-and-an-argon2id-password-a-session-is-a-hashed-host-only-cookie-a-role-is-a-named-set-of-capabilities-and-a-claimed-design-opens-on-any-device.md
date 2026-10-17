# ADR 0169 — A client account is an e-mail and an argon2id password behind Turnstile; a session is a hashed host-only cookie; a role is a named set of capabilities; and a claimed design opens on any device

Status: **Proposed — 2026-10-17.** Drafted by the architect for the owner. Nothing here is accepted. It amends
ADR 0115 and ADR 0019 (the sweep below) only once accepted.
Date: 2026-10-17
Type: Decision (architect's proposal, built on the owner's rulings of 2026-10-17)
Milestone: M8B — login and register ([`milestones/M8B-login-register-plan.md`](../milestones/M8B-login-register-plan.md))

**Evidence tiers.**
- *[owner]*: the owner's rulings as recorded in `docs/OWNER_FIXES.md`, *Fix 3*, 2026-10-17.
- *[doc]*: quoted from this repository.
- *[src]*: read in the source at `4f85b970`.
- *[run]*: run by the architect, output quoted.
- *[inf]*: the architect's inference.
- *[ven]*: a vendor fact from memory, not re-read. The plan's wave L0 re-reads each one before code depends on it.

## Context

ADR 0115 chose customer profiles with an e-mail and a password, and made ADR 0019's reasons against passwords
into obligations (decision 4) [doc]. M8B carries twelve of them and five open questions, QP1–QP5 [doc:
`milestones/M8B-customer-profiles.md`]. On 2026-10-17 the owner widened the subject [owner]:

- three roles: **client**, **operator**, **administrator**;
- capabilities rather than hard-coded role names;
- Turnstile on register and login;
- an optional phone, **stored unverified, with no SMS** (Q-F3-2);
- **no 2FA**;
- the GDPR as the standard;
- staff created by invitation only;
- **"once a client has a profile, the one-browser limit goes away"**.

The owner closed questions Q-F3-1 to Q-F3-10 the same day. `OWNER_FIXES.md` ends: *"Nothing in Fix 3 remains
open for the owner. The next step is the decision record."* [doc].

**What the tree has today [src]:**
- no account, no session, no authentication of any kind;
- a per-design write token (path-scoped cookie);
- a host-only visitor cookie whose hash marks a design's owning browser (ADR 0114);
- share tokens;
- a keyed application limiter (ADR 0155/0156);
- a provider-neutral mail port whose message has no recipient, so the only possible recipient is the shop
  (ADR 0154 d11, 0164).

This record decides the **login and register** part. The dashboard, staff screens, GDPR export and erasure, and
the retention job are later records. Each decision below names the seam it leaves for them.

## Decision

### D1. A client account is an e-mail and a password; the e-mail is confirmed by a link and the password together

- **Registering** takes:
  - an e-mail and a password;
  - an optional phone, stored **unverified** and labelled so [owner Q-F3-2];
  - the account's language;
  - the version of the privacy notice shown;
  - a Turnstile token.
- **No 2FA. No SMS** [owner].
- **Confirmation** has two parts:
  - The e-mailed link opens a page. The token is in the URL **fragment**, so it is never sent to a server or in
    a `Referer`.
  - The page asks for the password and posts both.
- **Confirmation signs the client in.**
- **Why the password at confirmation** [inf]:
  - Registering an address that is still unverified replaces its pending password. Without the password at
    confirmation, a stranger could register a victim's address, the victim could click the stranger's link, and
    the stranger would hold a verified account.
  - With the password, only the person who chose the current password and holds the inbox can confirm.
  - It also lets confirmation sign the client in safely.
- **Registering a verified address changes nothing.** It e-mails that address a notice: log in, or reset.

### D2. Passwords: argon2id from `node:crypto`, with no new dependency

- **The hash:**
  - `crypto.argon2('argon2id', …)`, available from Node 24.7.0 [doc: M8B *What 8A found*; [run]: present as a
    function on 24.19.0, and no `ExperimentalWarning` printed];
  - m = 19 456 KiB, t = 2, p = 1, a 16-byte random salt, a 32-byte tag;
  - stored as a PHC string, `$argon2id$v=19$m=…,t=…,p=…$salt$hash`, so the parameters travel with each hash.
- **Raising the parameters** needs no migration. A hash with old parameters is rehashed at the next successful
  login.
- **Comparison** uses `timingSafeEqual`.
- **An unknown address** is verified against a fixed dummy hash, so it takes as long as a wrong password.
- **`engines.node` becomes `>=24.7 <25`.**
- **Measured:** 16.4 ms on a developer laptop [run]. Not the target: the deployment measurement is owed (plan,
  L3 criterion 6).
- **The rule:**
  - 12 to 128 code points after NFKC;
  - no composition rules, no trimming;
  - not equal to the e-mail;
  - not in the breached-password corpus.
- **The breached-password check:**
  - Have I Been Pwned's range API, by k-anonymity [ven];
  - only the first five hexadecimal characters of the SHA-1 leave the server, with response padding;
  - a 1.5 s deadline;
  - if unreachable, the password is accepted on the length rule and the event is logged (owner question Q-L2;
    the default).
- **Never in a log, an error, a header or a response:** the password, its NFKC form or its SHA-1. Obligations 1
  and 2 of ADR 0115 decision 4.

### D3. A session is 256 random bits in a host-only cookie, stored as a hash

- **The cookie:**
  - `__Host-lemnaria_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`;
  - the value is 32 random bytes;
  - the server stores only its SHA-256 (ADR 0114 d1's pattern).
- **Lifetimes:** each session has an idle and an absolute expiry, set by role (Q-L1). The default for a client
  is 30 days idle and 90 days absolute; for staff, 12 hours idle and 7 days absolute.
- **The cookie's `Max-Age` is the absolute lifetime**, set once when the session starts and never re-sent.
- **The idle expiry is the server's alone**, kept by `last_seen_at`. Only route handlers update it, at most once
  an hour.
- **Why not a sliding cookie:** a page render can read a cookie but cannot set one [ven: Next's `cookies()`].
  A cookie that slid on some requests and not others would be a second clock that disagrees with the first.
- **Rotation:** every sign-in, at confirmation or at login, mints a fresh value and revokes any live session the
  request presented. Session fixation is therefore impossible.
- **Revocation:**
  - a password reset revokes **every** session of the account and starts none;
  - logout ends this session, or every session ("log out everywhere").
- **The role is read from the account on every request**, so a role change takes effect on the next request.
  The runbook's role-change step also revokes the account's sessions.
- **No signing secret exists**, because nothing is signed (ADR 0118: a variable nothing reads is not created).

### D4. CSRF

- **Every state-changing account route:**
  1. refuses a cross-site request first (`isCrossSiteRequest`, ADR 0114 F3);
  2. takes JSON only, so a cross-origin call needs a preflight that is never granted;
  3. relies on `SameSite=Lax`.
- **Logout is `POST`.**
- **An e-mailed link's `GET` never changes state**, so a mail scanner's prefetch consumes nothing.

### D5. Abuse control

- **Turnstile:**
  - on register, on login and on the reset request [owner];
  - verified on the server, with the expected action and hostname;
  - a failed check, or one that cannot be reached, **refuses**. Writes fail closed (ADR 0019 d5; Q-L3).
  - **Dated note, 2026-10-18 (L3 security review): the test-secret relaxation is narrowed; owner-visible.** The
    plan's L3 criterion 5 let a documented Cloudflare test secret pass on `success` alone, whatever the action and
    host. Amended: that relaxation applies **only** when the public origin is a loopback one, which
    `readPublicOrigin` accepts only beside `LEMNARIA_E2E_FAKE_MAIL=1`, so no deployment has it. A test secret set
    anywhere else gets no relaxation and is not even asked: the check answers `unavailable` (the route refuses with
    503) and one constant line is logged on every attempt. So a test secret pasted into a Preview or Production
    variable fails closed instead of passing every challenge. Consequence for the owner: development with a test
    key in `.env.local` needs the fake-mail flag and a loopback `LEMNARIA_PUBLIC_ORIGIN`, or the check refuses.
- **New limiter purposes:**
  - they fail closed, as every write does (ADR 0156), and every figure is provisional;
  - by network block: register, login, reset request, token completion;
  - by address: login, with a 15-minute and a daily window, which gives the growing back-off;
  - one **mail bucket per address** shared by every account e-mail, which protects the shared mail quota and a
    victim's inbox;
  - by account: claim, and session saves.
- **The same answer for a known and an unknown address:** at register (always "check your inbox"), at login (one
  invalid-credentials answer), and at the reset request.
- **Account mail is sent after the response**, so whether a mail was sent is not visible in the response time.
- **Tokens:** a confirmation token lasts 24 hours and a reset token 30 minutes. Each is single-use, and only the
  newest unused token of its purpose works.

### D6. Mail to a customer goes through a second port, and the shop's port is unchanged

- **The shop's `MailMessage` keeps no recipient.** No code path can make a customer the recipient of the shop
  notice (ADR 0154 d11; 0164).
- **A separate `CustomerMailMessage` carries exactly one plain mailbox.** Its sender reuses the Gmail transport,
  with the same must-not list, until M9 chooses a provider.
- **The links** are written under `LEMNARIA_PUBLIC_ORIGIN` (ADR 0165), with the token after `#`.
- **Shared quota:** the shop notice and account mail share the one account's daily quota until M9 (Q-L4). A
  dedicated sending account is recommended.

### D7. RBAC: capabilities are a closed list in the domain, a role is a set of them, and the application cannot write a role

- **Capabilities** [owner, with the *Consequences* list of `OWNER_FIXES.md`]:
  - `design.read.own`, `design.edit.own`;
  - `design.read.any`, `design.unhide`;
  - `contact.read`, `contact.update-status`, `note.write`;
  - `preset.create`, `preset.manage`;
  - `price.edit`, `translation.edit`;
  - `user.manage`, `audit.read`.
- **Roles:**
  - **client** holds the two `.own` capabilities;
  - **operator** holds the client's two, plus `design.read.any`, `contact.read`, `contact.update-status`,
    `note.write` and `design.unhide`;
  - **administrator** holds all of them.
- **No `design.edit.any` exists** [owner Q-F3-4].
- **Staff also hold the client's two** [inf]: a visitor with no account can already make designs, and a staff
  account should not be able to do less.
- **One role per account**, stored in `accounts.role` and checked against the three names.
- **Changing what a role may do is a reviewed code change.** There is no runtime role editor.
- **The application role cannot write `role`.**
  - Its `INSERT` and `UPDATE` grants on `accounts` are column-scoped and leave `role` out, so every account the
    application creates is a client.
  - The application cannot write a role, so no bug in the application's own code path creates staff or
    promotes anyone through `role`.
  - **Accepted risk: an SQL injection could still reach staff access without writing `role`.** It could insert
    an `account_sessions` row for an administrator's `account_id`, update `accounts.password_hash`, or null
    `revoked_at` or `used_at` on a session or a token. The application must hold INSERT on sessions and UPDATE
    on those columns to do its work, so no grant can prevent it. The defences are the ones that stop an
    injection existing: tagged-template SQL only, and review.
  - Until the staff-management wave, a staff account exists only by the owner's console seed (runbook). Staff
    are by invitation only [owner].
- **Who decides access:** every route that acts for an account checks a capability through one function. The
  UI hides controls and never authorises.

### D8. Claiming

- **When:** claiming needs:
  - a signed-in, **verified** account (ADR 0115 obligation 3);
  - a well-formed visitor cookie;
  - the client's explicit confirmation [owner, item 20].
- **How:** one statement, `update designs set account_id = $a where visitor_hash = $v and account_id is null`. A
  design belongs to at most one account, and is never claimed again.
- **What it leaves alone:** `visitor_hash` and `write_token_hash`. The claiming browser goes on working exactly
  as before.
- **A design minted while signed in** stores `account_id` at the mint. The mint's bodyless contract (ADR 0111
  d1) and its visitor rotation (ADR 0114 H1) are unchanged.
- **Why not at registration:** claiming before confirmation would break obligation 3. With confirmation first,
  the 30-day cleanup of unverified accounts (Q-F3-7) never meets a claimed design.

### D9. The gate: a claimed design opens, saves and shares for its account on any device

- **What the owning account's session can do with a claimed design:**
  - read it: pages, the API and resume;
  - save it: a second credential arm beside the write token, predicate `account_id = $a`, with the existing
    revision and 409 order;
  - share it (issue, revoke, status), on any device.
- **An unclaimed design keeps ADR 0114:** its visitor cookie reads it and its write token writes it. A session
  grants nothing on it.
- **Everyone else gets ADR 0114 decision 5's one indistinguishable "not available" answer.** That includes a
  session of another account.
- **Staff reading any design** (`design.read.any`) is a later wave.

### D10. Schema rules

- **Four additive migrations**, `0012`–`0015`: `accounts`, `account_sessions`, `account_email_tokens`, and
  `designs.account_id`. They are numbered after M8C's `0011`.
- **Tokens and session values are stored as SHA-256 only.**
- **No `DELETE` grant.** Revocation and use are `UPDATE`s of a timestamp.
- **No check constraint that a known later wave would have to drop:** locale and token purpose are shape checks,
  and the closed lists live in code. `role`'s three names are the stated exception.
- **`designs.account_id` has no foreign key.** The unattended migration screen recognises only `check` in a
  guarded `DO` block. It reads `references accounts (id)` in an add-column clause as a call to a function
  `accounts`, which is not on its allow-list (only `now`) [src: `migration-safety.ts:505-535` for the `DO` block;
  `:583-597` for `ALLOWED_FUNCTION_CALLS` and `FUNCTION_CALL_HEAD = /…[a-z_][\w$]*…\s*\(/`, which allows a space
  before the parenthesis]. The `contact_submissions.design_id` precedent applies [doc:
  `0008`].
- **Sessions and tokens are never exported to a backup.** A restore cannot revive one (M8B, *8P1*).
- **`account_id` joins the design export only with the accounts export** (QP5, a later wave).

### D11. What this amends, and what it deliberately does not

The sweep table below settles each record. Two points are stated here, because a later reader could take them
the wrong way:

- **ADR 0153's rule that the application role reads no personal column does not extend to `accounts`.** The
  application must read the e-mail to sign a client in and to write to them.
  - *Alternative:* the e-mail encrypted at rest with an application-held key.
  - *Why not now:* key management, another owner-provisioned secret, and every lookup by a keyed digest.
  - *Trigger to revisit:* the database is shared with another service, or a leak of `DATABASE_URL` is suspected.
- **Turnstile is not the Cloudflare proxy that ADR 0019 d9 rejected.** Nothing sits in the request path. The
  widget is a third-party script and frame on the account pages only, and the CSP widens there alone (ADR 0161
  gets a dated note).

### D12. This round is built without tests, by the owner's instruction (scope: this round of M8B only)

- **The owner's instruction** [relayed by the coordinator, 2026-10-17; not a quotation of the owner]:
  *"development proceeds WITHOUT writing or running tests this round"*.
- **Scope:** this round only. This is **not** a standing amendment of `docs/WORKFLOW.md`, whose paired-test
  rule, QA gate and step-7 test audit stay as written. It follows the pattern of ADR 0168, which the owner chose
  for M8C, and goes further than it: no committed exceptions.
- **What changes:**
  - no implementer or QA test;
  - reviewers are dispatched on a diff whose format, boundary, lint, typecheck and build commands are green,
    instead of a green QA run;
  - **the review tiers are kept, and security review is on every code wave** (Fix 3 item 7).
- **What it costs, accepted by the instruction:**
  - **no push**: the pre-push hook runs the suites, and several existing tests turn red until updated;
  - **no production grant**: the runbook's proof is the privilege test;
  - **no criterion is verified except by reading**;
  - **M8B cannot close** until the owed tests (plan §9) exist.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| **A hosted identity provider** (Auth0, Clerk, Supabase Auth) | Another processor holding the whole account, a transfer outside the EU to record, a cost, and a vendor in every sign-in. The owner wants simple and secure, with little data. Revisit if staff SSO is wanted [inf] |
| **Auth.js (NextAuth) credentials provider** | Its credentials mode leaves verification, reset, rate limits and session storage to the application anyway, and its own documentation discourages passwords [ven]. What remains is a framework around the parts this record designs |
| **A library session layer (e.g. Lucia)** | Its author retired it as a library and published the pattern as a guide [ven]. This record follows that pattern directly: random token, hash stored, sliding expiry |
| **Stateless signed sessions (JWT)** | Not revocable without a server list, which is the session table again. "Log out everywhere" and "reset revokes all" would need it anyway |
| **Signed or peppered cookie values** | A random 256-bit value stored as a hash is already unforgeable. A pepper is a second secret whose loss locks every account out |
| **`@node-rs/argon2`, `argon2` (npm), `bcrypt`** | Native or prebuilt dependencies: a supply-chain and deployment surface for what Node 24 now ships. bcrypt is not memory-hard and truncates at 72 bytes |
| **scrypt** (`crypto.scrypt`) | Memory-hard and built in. **Kept as the fallback** if Node documents `argon2` as experimental (plan L0) |
| **Composition rules, forced rotation** | NIST SP 800-63B advises against both [ven]. Length plus a breach check is the policy |
| **Magic-link-only login (no password)** | The owner chose e-mail plus password [owner, ADR 0115] |
| **Confirmation by link alone** | The squatting path described in D1 |
| **Claiming at registration, before confirmation** | Breaks obligation 3, and the 30-day cleanup would then meet claimed designs |
| **Moving ownership at claim** (clearing `visitor_hash`) | Every visitor-gated path (share, save refresh, resume, contact) would need its account arm in the same wave, or the claiming browser would lose its own designs. Keeping the hash makes the claim safe to land before the gate. The shared-computer residual is recorded instead |
| **Roles and capabilities in database tables, editable at run time** | A role editor and a `user.manage` surface with no screen yet. A closed list in code is reviewable, and changing it is a reviewed commit |
| **A role writable by the application role** | An injection or a bug becomes a privilege escalation by writing `role`. The column grant makes that one path impossible; it does not make injection harmless (D7's accepted risk) |
| **Vercel BotID or hCaptcha instead of Turnstile** | The owner named Turnstile [owner]. BotID is ADR 0019 d5's for the contact form and is M9's to settle |
| **A recipient field added to `MailMessage`** | Would undo ADR 0154 d11's guarantee by type. A second port keeps it |
| **The e-mail encrypted at rest** | D11 |

## Consequences

- The plan's waves L0–L14b build this in order. L0 is the owner's acceptance, the vendor re-reads, and the
  provisioning of the Turnstile keys (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`). **No other variable is
  created.**
- **The owner applies** migrations `0012`–`0015` and their column-scoped grants, preview first, after M8C's
  `0011`. Production waits for the privilege test's new arms.
- **A client with an account is no longer bound to one browser** for designs they have claimed or made while
  signed in [owner]. A visitor with no account still is (ADR 0114, 0115 d2–d3).
- **The preset gate's later swap** (Fix 2 → Fix 3) is `requireCapability(session, "preset.create")` behind
  M8C's policy seam.
- **Residual, accepted [inf]:** after logout on a shared computer, the visitor cookie there still opens the
  designs made in that browser, as it does today for any visitor. A later "forget this browser" control can
  clear it.
- **The M9 launch gate gains four lines** (plan §10).

## Decision-record sweep

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0115](0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md) d1, d4, Amendment A | Profiles with e-mail and password, in M8B. ADR 0019's reasons become obligations | **Implemented here.** Obligations 1–7 and 10 are answered by D1–D9. 8 (modal), 9 (personal data), 11 (dashboard) and 12 (already settled: edit link dropped) are later |
| 0115 d2, d3 | Until profiles, a design is editable only in its own browser | **Lifted for an account's claimed and signed-in designs** (D9). Unchanged for a visitor without an account [owner] |
| [0019](0019-security-baseline-writes-throttling-retention.md) d1 (write half) | A write needs the design's write token | **Amended:** for a claimed design, a session of its owning account is a second credential (D9). The write token is unchanged for everyone else |
| 0019 d5 | Per-endpoint application limits; contact form paired with BotID | **Extended** with the account purposes (D5). Turnstile is the account endpoints' challenge. BotID stays the contact form's question for M9 |
| 0019 d8 and Alternatives 1–2 | Superseded by 0115 | Unchanged. Alternative 1's reasons (reuse, hashing, never logging, a reset path) are D2, D5 and flows 6–7 |
| 0019 d9 | No Cloudflare proxy in front of Vercel | **Unaffected:** Turnstile is not a proxy (D11) |
| 0019, note of 2026-09-15 (nothing deleted automatically) | Reaper retired | **Unchanged here.** No `DELETE` grant (D10). The retention ruling of Q-F3-7 / drafts at 365 days is a later record that must supersede this note explicitly |
| [0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md) d1–d4 | The visitor cookie, linked at mint, resume server-side | **Unchanged.** Resume also considers the signed-in account's designs (D9) |
| 0114 d5, H2 | A design opens only for its visitor; one indistinguishable refusal | **Amended:** also for a session of its owning account. The refusal is unchanged for everyone else, including another account |
| 0114 d6, [0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md) | The preset credential is separate | **Kept:** a client account grants no preset authoring. The swap to `preset.create` is a later wave, with ADR 0112's amendment (M8C) |
| 0114 B, C, G4 | Share link: one per design, by write token and visitor | **Extended:** the owning account's session is the credential for a claimed design (D9). Plaintext never shown again (B2) |
| [0153](0153-a-contact-request-is-stored-once-apart-from-designs-the-application-role-reads-none-of-its-personal-columns-and-code-refuses-before-the-server-what-the-table-would-refuse.md) d1 | The application reads no personal column of a contact request | **Unchanged for contact requests. Not extended to accounts** (D11) |
| [0154](0154-mail-leaves-through-one-provider-neutral-port-and-one-resend-adapter-that-sends-once-and-answers-with-one-of-seven-kinds-and-the-shops-notice-is-the-stored-review-printed-never-priced-again.md) d11; [0164](0164-the-shops-notice-leaves-through-gmail-smtp-by-nodemailer-behind-the-unchanged-port-and-the-stored-mark-is-the-only-guard-against-a-second-notice.md) | The message has no recipient; a recipient is M8B's change under its own review | **Kept for the shop.** A separate customer port (D6) is that change |
| [0155](0155-the-mint-asks-a-keyed-per-day-per-network-limiter-first-and-refuses-what-it-cannot-judge-the-owner-names-the-network-source-and-a-destructive-mutant-never-touches-a-database.md), [0156](0156-saves-shares-and-reads-are-limited-by-subjects-made-only-by-two-constructors-writes-fail-closed-reads-fail-open-pages-are-counted-in-the-interceptor-and-the-saves-wait-is-one-write-the-client-holds.md) | A keyed limiter; subjects only from constructors; writes fail closed | **Extended:** new purposes, one new subject kind (an account id), the same rules |
| [0161](0161-the-csp-enforces-its-violations-reach-the-applications-own-counted-endpoint-and-the-mode-stays-one-versioned-constant.md) | The CSP enforces; `frame-src 'none'` | **Amended on account pages only** to admit the Turnstile frame (and whatever L0's read requires). Every other path byte-identical |
| [0147](0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md) | A bot shield or CAPTCHA deferred to M9 | **Not changed for the mint.** Turnstile here covers the account endpoints alone |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | Record with a trigger; do not build | **Applied:** no session secret, no pepper, no columns without a reader, no e-mail encryption (D11) |
| 0168 (on the M8C branch `fix/empty-space-fill-and-preset-save`; not on `main` at `4f85b970`) | No new tests, option C, M8C only | **Pattern followed and widened for this round** (D12). Neither record amends WORKFLOW |

## Records to annotate on acceptance (the scribe's, not done while Proposed)

- **ADR 0115:** a dated note (Amendment B). Login and register are planned in `M8B-login-register-plan.md`;
  decisions 2–3 are lifted for claimed and signed-in designs (D9).
- **ADR 0019:** a dated note on d1's write half (D9), d5 (D5), d9 (D11).
- **ADR 0114:** a dated note on d5 / H2 and on B / G4 (D9).
- **ADR 0154:** a dated note: the customer port exists beside the shop's (D6).
- **ADR 0161:** a dated note: the account pages' CSP (D11).
- **ADR 0155 / 0156:** a dated note: the account purposes and subject (D5).
- **Other files:** `decisions/README.md` (the row), `SUPERSESSIONS.md`, `M8B-customer-profiles.md` (pointer
  already added, dated), `docs/STATUS.md` (the M8B row), `environments-and-resources.md` (*Variables not yet
  set*: the two Turnstile names).
