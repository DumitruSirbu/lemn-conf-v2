# ADR 0172 — A client account is an e-mail and an argon2id password behind Turnstile; a session is a hashed host-only cookie; a role is a named set of capabilities; and a claimed design opens on any device

Status: **Accepted — 2026-10-18, by the owner** (proposed 2026-10-17). Owner's words, relayed by the coordinator:
*"accept the adr, the node version, the migration run and the privacy notice"*, and, on the eight defaults,
*"accept 4,8 and the rest"* after the explanations. Acceptance is of the **decisions**: the code is built-unexercised
(D12), no migration is applied, and the remaining items are listed below. It amends ADR 0115 and ADR 0019 as the
sweep below states.
Date: 2026-10-17 (amended 2026-10-18; accepted 2026-10-18)
Type: Decision (architect's proposal, built on the owner's rulings of 2026-10-17)
Milestone: M8B — login and register ([`milestones/M8B-login-register-plan.md`](../milestones/M8B-login-register-plan.md))

## Remaining before production (2026-10-18, after acceptance)

The record is Accepted. These are what stands between it and a production account. None is done by this note.

1. **Merge M8C first (finding F2 of the architect review).** The migrations here are `0012`–`0015` and the runner
   refuses a gap. `0011` lives on `fix/empty-space-fill-and-preset-save`, so this is **not resolvable on this branch**;
   it happens at the merge.
2. **Apply the migrations: the owner's step, none has been run.** The owner accepted the migration plan (*"the migration
   run"*), but applying is the owner's step under AGENTS rule 1 and is blocked until `0011` is on the base. Order:
   merge M8C; apply `0011`; apply `0012`–`0015`; apply the grants per the runbook `docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md`,
   section *For 0012-0015*; verify. **No migration has been applied anywhere** (scribe's statement of the coordinator's
   report; not checked against a database).
3. **The Node check (Amendment D).** The owner accepted the coordinator's recommendation. `package.json` `engines.node`
   is `"24.x"` and `password-hash.ts` defines and throws `Argon2UnavailableError` [src: both read by the scribe
   2026-10-18, one grep each; the throw site at line 147 was not read in context]. The remaining owner step is `node -v`
   in a Vercel **build log**, per environment, preview first.
4. **The tests-owed round.** D12 stands: M8B cannot close until the owed tests (plan §9) exist.
5. **Screens L13b–L14b** wait for Claude Design (prompt: `docs/design/prompts/account-screens-claude-design-prompt.md`).
6. **The privacy notice.** The owner accepted `docs/legal/privacy-notice-draft.md` as the **working draft only**. It is
   not publishable until its placeholders are filled and its launch blockers are cleared (plan M9 gates).
7. **The login back-off** (D5 *IMPLEMENTATION STATE*) is still interim: the day figure is 100, the failure-only back-off
   is unbuilt and needs a design (plan §12).
8. ~~Complete the `IMPLEMENTATION STATE` line in D5~~ **Done 2026-10-18.**
9. **DONE at the merge of `origin/main` (2026-10-19): this record was renumbered from 0169 to 0172.** It was written as an
   open item on 2026-10-18 (ADR-number clash, before any migration is applied). The primary
   checkout's M8C branch (`fix/empty-space-fill-and-preset-save`) already held a **different** ADR 0169 (*the migration
   commands refuse a declared environment the credential does not reach…*), plus 0170 and 0171, so 0172 was the next free number [src: `Glob` of
   `docs/decisions/01{69,70,71}-*` in the primary checkout, 2026-10-18; file names read, bodies not]. Two records cannot
   share a number, so this one takes the next free number when the branches meet. Cost: the migration headers
   `0012`–`0015` cite "ADR 0172 decision 7/8/9" (written then as "ADR 0169") and **40 non-doc files in this checkout cited "ADR 0169"** [src: one `Grep`
   count of the string outside `docs/`, 2026-10-18; the coordinator's figure was about 42, not reconciled]. Those
   citations, the plan, STATUS and the other records' notes must be re-pointed in the same change. Decision numbering
   D1–D12 stays frozen (Amendment E, item 3). Do the renumbering **before** `0012` is applied, because a migration header
   that cites the wrong record is then in a database's history. Nothing is renumbered by this note, and the new number
   is not chosen here.

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

### Fix 3 rulings and where each lands (added 2026-10-18)

"Honoured" means the design in this record and the plan answers the ruling. **No code has been executed** (D12), so
nothing here is verified; a "deferred" row is **not built**, and its owner is the plan section or the record that must
write it. Source for every row: `docs/OWNER_FIXES.md` *Fix 3* [doc]; the "lands" column is the plan [doc].

| Ruling | Status | Where it lands, and the named owner |
| --- | --- | --- |
| Three roles: client, operator, administrator | Honoured | D7. Closed list in code, `accounts.role` shape-checked to the three names |
| Capabilities, not role names | Honoured in the access check, **with exceptions being removed** | D7: every route calls one capability function. Claiming and mint ownership were first a role-name check (Amendment B); they move to capabilities (D7, Amendment B revised) |
| Turnstile on register and login | Honoured (also on the reset request) | D5. The CSP (ADR 0161 Amendment D) and a real-key preview walk are owed (M9 gate line 5). Turnstile consent and Cloudflare as a processor: deferred, see Consequences |
| Optional phone, unverified, no SMS (Q-F3-2) | Honoured | D1. Stored unverified and labelled so; no SMS surface exists |
| No 2FA | Honoured | D1 |
| GDPR as the standard (Q-F3-1) | **Partly; mostly deferred** | The design follows it where it touches login (hashing, no secret in a log, notice version recorded, Amendment E). The notice text, processors list, export, erasure and the Moldovan check are deferred: plan §12 rows "GDPR export and erasure; notice; cookie notice" and "Accounts backup"; the notice text and the legal check are the **owner's** (plan §11, owner steps) |
| Staff by invitation only | **Deferred** | Today a staff account exists only by the owner's console seed (D7). Plan §12 row "Staff invitation and management" owns the invitation token and the way to set `role` |
| One-browser limit lifted for a client with a profile | Honoured for claimed and signed-in-minted designs | D8, D9, ADR 0115 decisions 2–3 lifted for them. Unchanged for a visitor with no account |
| Q-F3-3: operator sees drafts and a "sent" flag | **Deferred** | `design.read.any` is named in the capability list and wired to nothing; `designs.sent_at` does not exist. Plan §12 rows "Dashboard" and "Operator and administrator screens" |
| Q-F3-4: no `design.edit.any`; operator views, notes, sets status | Honoured for the negative; the rest deferred | D7 has no `design.edit.any`. `note.write` is named; the notes table and screens are plan §12 "Operator and administrator screens" |
| Q-F3-5: keep all kitchens; Save / Discard | **Deferred** | Plan §12 "Dashboard". Needs a mock-up and its own decision record |
| Q-F3-6: erasure removes personal data, sent kitchens included | **Deferred** | Plan §12 "GDPR export and erasure": a narrow `DELETE` under its own credential, revoking the frozen shop link. Nothing deletes anything today (D10) |
| Retention: drafts 365 days, sent kept | **Deferred** | Plan §12 "Retention job". It reverses ADR 0019's note of 2026-09-15 and **needs an owning record that says so** (Consequences) |
| Q-F3-7: unverified accounts deleted after 30 days | **Deferred** | Same job. D8 makes it safe (a claim needs a verified account). The clock to use is named in Consequences |
| Q-F3-8: visitor has no list; Save / Discard nudge | **Deferred** | Plan §12 "Registration nudge modal". The seam is `GET /api/account/session` |
| Q-F3-9: client may hide a sent kitchen | **Deferred** | Plan §12 "Dashboard" (`hidden_by_client_at`) |
| Q-F3-10: only staff unhide | **Deferred** | `design.unhide` is named for the operator and administrator; the control is plan §12 "Operator and administrator screens" |
| Items 6 and 11: audit log of staff actions and reads | **Deferred** | Plan §12 "Operator and administrator screens, notes, audit log": `audit_log` table, and `requireCapability` is the one place to add the write. No staff read of another's design exists yet, so no read goes unlogged |
| Item 20: claim after the client confirms | Honoured | D8, plan L11 and the L14b dialog (the dialog waits on the owner's screens) |
| Item 7: security review on every wave | Honoured so far | Ran by reading on L1, L3, L4a, L4b+L5, L7–L11, L12a, L12b and L13a [doc: plan *Review record*]. L2 and L6 are not in that list. Waves L13b–L14b are unbuilt and keep the rule |

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
- **`engines.node` becomes `>=24.7 <25`.** (In force at HEAD since L3; whether that form is the right one is the
  owner's open decision, Amendment D.)
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
  - a failed check **refuses** (`403`). A check that cannot be judged because the deployment is **misconfigured**
    refuses too (`503`). A Cloudflare that **cannot be reached** does *not* refuse: the owner ruled on 2026-10-18 that
    the request proceeds, with the limiters as the control (Amendment E, item 5; this replaces the first draft's
    "an unreachable check refuses", which was the reviewer default Q-L3).
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
  - by address: login, with a 15-minute and a daily window. **These are two fixed windows, not a growing back-off**
    (this record first called them one; corrected 2026-10-18). See *Login throttling* below, which supersedes the
    figures;
  - three **mail buckets per address**, one for registration, one for reset and one for a login's silent resend, which
    protect the shared mail quota and a victim's inbox (**amended**: Amendment A, 2026-10-18; first drafted as one
    shared bucket);
  - by account: claim, and session saves.
- **The same answer for a known and an unknown address:** at register (always "check your inbox"), at login (one
  invalid-credentials answer, **including for a correct password on an unconfirmed account**, Amendment A), and at the reset request.
- **Account mail is sent after the response**, so whether a mail was sent is not visible in the response time.
- **Tokens:** a confirmation token lasts 24 hours and a reset token 30 minutes. Each is single-use, and only the
  newest unused token of its purpose works.

**Login throttling: the residual as built, and the owner's decision of 2026-10-18.**

- **The residual, as first built (owner-visible).** The login counts every attempt before the password is looked at,
  in a 10-per-15-minutes window and a 30-per-day window per address (fixed UTC day) [doc: plan §5, source-verified in
  `limit-policy.ts` and `utc-window.ts`]. So a stranger who solves **30 Turnstile challenges locks a victim's login until
  00:00 UTC**, whatever the victim types, and about **5 solved challenges block the victim's reset mail** for the rest of
  the day (the reset-mail bucket is 5 a day; Amendment A, item 2). Turnstile makes each attempt cost a solved challenge
  and the refusal reads the same for every address, but the victim is still locked out.
- **Research (the owner asked for it: "if you are not sure make a research").** OWASP *Authentication Cheat Sheet*
  [ven: read by the coordinator, not re-read here]: count per account, lock out with an exponential delay, and show the
  CAPTCHA only after failures. NIST SP 800-63B [ven, same]: limit **consecutive failed** attempts, to no more than 100;
  delays that increase; disregard earlier failures after a success.
- **Decision (owner, 2026-10-18, "if this is a best practice I approve").** Login throttling moves to
  **failure-only counting with a growing delay and a ceiling of 100 failures a day** per address. A correct password
  resets the run. The block-level bucket and Turnstile stay. The reset-mail bucket (5 a day) is not changed by this
  decision, so the victim's reset-mail residual is **not** closed by it and stays recorded.
- **IMPLEMENTATION STATE (filled 2026-10-18 from the developer's report, source-verified by the developer; not re-run
  by the scribe): INTERIM.** The login per-address day figure was raised **30 to 100**
  (`ACCOUNT_LOGIN_PER_ADDRESS_DAY_FIGURE` in `apps/web/src/lib/server/rate-limit/limit-policy.ts`). The quarter-hour
  figure is unchanged at 10 / 15 min. The mechanism still counts **every valid attempt before the lookup**.
  **The true failure-only back-off the owner approved is NOT built and needs a design.** Why it is not a small change:
  the limiter store only increments (`recordHits`, `totalsOfWindow`; there is no per-key read and no reset), counting
  happens before judging, and windows are fixed per policy, so each delay tier would be its own policy. It needs:
  1. a `readCounts` that reads without incrementing, in the Neon and the fake stores;
  2. sign-in split into check-before-verify and record-on-any-failure, with **identical recording** for unknown,
     wrong, refused and unconfirmed (the enumeration rule, Amendment A);
  3. a reset on success (a reset port, or a success-epoch in the key);
  4. a decision on the check/record race and on the `503` hash-failure path;
  5. the `sign-in.ts` header comment updated to match.
  Recorded as a follow-up in plan §12 (*Review record*); `docs/backlog/open.md` is for observed product behaviour and
  was not used. Until it is built, the victim residual above shrinks (100 solved challenges, not 30, lock a login until
  00:00 UTC) but does not go away.

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
  - **client** holds the two `.own` capabilities, and only the client does (revised 2026-10-18);
  - **operator** holds `design.read.any`, `contact.read`, `contact.update-status`, `note.write` and `design.unhide`;
  - **administrator** holds every capability **except** the two `.own` ones.
- **No `design.edit.any` exists** [owner Q-F3-4].
- **`design.read.own` and `design.edit.own` are client-only (revised 2026-10-18, architect review).** This record first
  said staff also hold the client's two [inf: a staff account should not be able to do less than a visitor]. That
  inference had a cost: the capability alone let a staff account claim a visitor's designs, so Amendment B added
  role-name checks beside the capability check, which is the hard-coded role name the owner ruled against. The
  capability sets now carry the rule, and the role-name checks are replaced by the capability check (built; update
  2026-10-18, developer report). Staff who browse the configurator do so as a visitor, as before (Amendment B).
  **As built** [src: `packages/configurator-domain/src/account/capabilities.ts`, read by the scribe]: client =
  `design.read.own`, `design.edit.own`; operator = `design.read.any`, `contact.read`, `contact.update-status`,
  `note.write`, `design.unhide`; administrator = every capability except the two `.own` ones. Claim, own, mint-account
  and read-by-account are decided by capability (`isCapabilityHeld`), and `isClientHolding` is gone [developer report,
  not re-grepped in code by the scribe]. `GET /api/account/session` now lists no own-design capabilities for staff.
- **Residual, recorded (revised 2026-10-18): promotion strands claimed designs.** The runbook's administrator seed
  promotes an existing client. After promotion the account no longer holds `design.read.own` / `design.edit.own`, so the
  designs it claimed as a client **stop opening through the account arm** (D9). Their `account_id` is untouched and the
  claiming browser's visitor cookie and write token still work. Nothing is lost; the owner should seed an administrator
  from an address that has claimed nothing, until the staff-management wave decides how a promotion treats claimed
  designs.
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
  - **"The application cannot write `role`" is temporary.** The staff-management wave must choose its mechanism
    explicitly (a narrow grant, or a separate credential), with its own review. The same applies to the e-mail:
    `email` is not in the application's `UPDATE` grant, so rectification and e-mail change need their own grant and
    review (plan §12 "Profile").
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
- **The lead-to-account join (named 2026-10-18; ADR 0153 d1 is eroded, not kept).** `contact_submissions.design_id` and
  `designs.account_id` are both readable by the application role, so a lead can be joined to the identified account
  that owns its design, with no personal column read. ADR 0153 d1's intent was that the application learns nothing
  about who a lead is; for a claimed design it now can. Accepted [inf, plan §10]. *Trigger to revisit:* the first
  feature that reads both together, or the database being shared with another service. The remedy would be to stop
  readers joining them (a view, or removing `design_id` from the readable seven); it is not built.
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
- **Residual, accepted, recorded 2026-10-18 with L12b [inf] (D8):** a claimed design stays readable through the
  claiming browser's visitor cookie after the account signs out, because claiming leaves `visitor_hash` as it was and
  the visitor cookie is not a session. A later wave may rotate the visitor cookie at sign-out. Rotation would close
  reading and sharing in that browser, **not saving**: the write token in that browser lives for 30 days and still
  writes the design, as it did before the claim. Rotation is therefore not the whole remedy; the "forget this browser"
  control above would also have to clear the write-token cookies. Trigger to revisit: a report of a shared computer, or
  that control being built.
- **The M9 launch gate gains four lines** (plan §10). Two more are added by this amendment, below.
- **A restore loses accounts and un-claims every design (added 2026-10-18).** The design export omits `account_id`
  and no accounts export exists; sessions and tokens are never exported (D10). Restoring from a backup therefore
  returns designs unclaimed and no accounts. **M9 launch-gate line (new): the accounts backup (QP5) exists and a
  restore of it has been rehearsed before any real account exists.**
- **Turnstile consent, and Cloudflare as a processor, are deferred (added 2026-10-18).** Turnstile loads a third-party
  script and frame on the account pages. Whether it needs consent, and the processor record with its agreement and
  transfer mechanism, are not written (OWNER_FIXES item 17). *Trigger: before any real user.* **M9 launch-gate line
  (new): the Turnstile consent decision and the Cloudflare processor entry exist.**
- **D7 is temporary on two points.** "The application cannot write `role`" and "`email` is not in the application's
  grant" each hold only until the staff-management wave and the profile wave, and each of those must choose its
  mechanism explicitly (D7).
- **Retention: no horizon exists for sessions or tokens (added 2026-10-18).** They are revoked or used by timestamp and
  never deleted (D10); expired rows accumulate. The retention job owns it (plan §12). **The 30-day unverified-account
  cleanup must name its clock:** `created_at` is wrong, because registering again on an unverified address replaces
  the pending password and token without resetting `created_at`. The clock is `updated_at`, or the newest
  `account_email_tokens.created_at` for the account, whichever the job's record chooses [inf].
- **ADR 0019's "nothing is deleted automatically" (note of 2026-09-15) is reversed by the retention ruling** (drafts at
  365 days, unverified accounts at 30). This record does not reverse it (D10: no `DELETE` grant). **The retention-job
  record must own the reversal and supersede that note explicitly**; until it exists, nothing is deleted.

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
| 0019 decision 11 (first accepted risk), dated note 2026-10-18 | `app_designs` holds table-level `UPDATE` on `designs`; the owner's 2026-08-25 "not worth it" | **Scope grew:** `designs.account_id` is now an access-control column that grant lets an injection reassign. The note says so and does not reopen the ruling. **Provisional pending 0172; acceptance of 0172 ratifies it** |
| 0153, dated note 2026-10-18 (lead to account join) | Records the join of `contact_submissions.design_id` with `designs.account_id` as an accepted risk | **Its pointer is corrected to cite D11 (the named join and its trigger) and plan §10**, not Amendment B. d1 is eroded for claimed designs (D11). **Provisional pending 0172; acceptance ratifies it** |
| 0161 Amendment D, 2026-10-18 | Widens `frame-src` on three account paths for the Turnstile frame | **The enforced CSP's behaviour was changed on the authority of this Proposed record.** Acceptance of 0172 ratifies Amendment D; rejection means it must be reverted. **Provisional pending 0172** |
| [0147](0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md) | A bot shield or CAPTCHA deferred to M9 | **Not changed for the mint.** Turnstile here covers the account endpoints alone |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | Record with a trigger; do not build | **Applied:** no session secret, no pepper, no columns without a reader, no e-mail encryption (D11) |
| 0168 (on the M8C branch `fix/empty-space-fill-and-preset-save`; not on `main` at `4f85b970`) | No new tests, option C, M8C only | **Pattern followed and widened for this round** (D12). Neither record amends WORKFLOW |

Three rows above (ADR 0019 d11, the ADR 0153 lead-to-account note, ADR 0161 Amendment D) are notes that were written
in those records while this record was Proposed. On acceptance (2026-10-18) each is **ratified**, and the
*provisional* marking in each record is changed to say so. ADR 0019's "nothing is deleted automatically" is **not**
reversed by acceptance: it is reversed only when the retention-job record lands (Consequences).

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

## Amendment A — 2026-10-18: login never says "unconfirmed", the mail buckets are three, and the L9 review defaults

Source: the L8 security review of the register and verify-email routes (findings F1 and F2), and the L9 security review
of the login, logout and session routes (items 2 to 6 below, applied as the reviewer's defaults while the owner is
away). Owner-visible. Nothing else in this record changes.

**1. Login on an unverified account answers as a wrong password does (amends D5, "The same answer").** The plan's flow 3
answered `403 {status:"unconfirmed", resent:true}` for a correct password on an unconfirmed account. Together with
register's branch (c) that is an enumeration oracle: an attacker registers a victim's address with a password of their
own (register answers the same `202` in every branch), then logs in with it. An address that was unknown, or unverified,
is now an unverified account holding the attacker's password, and answers `unconfirmed`; a verified account was not
changed by register and answers `401`. The two are told apart, and so the attacker learns which addresses already have
a confirmed account.

Decided:
- A correct password on an unverified account answers **the same `401 {status:"invalid-credentials"}`, status and
  body, as a wrong password and an unknown address**. No `unconfirmed` or `resent` member exists in any answer.
- **Equal work before the response**: one argon2id verification (the dummy hash for an unknown address) and the same
  lookup in every branch. The confirmation resend (the limiter count, the token insert and the mail) runs in `after()`,
  so nothing it costs is visible in the response time.
- **A limiter refusal or unavailability on the resend is silent**: no mail, no distinct response. The login's own
  address and block buckets are unchanged and still answer `429` the same way for every address.
- The login screen has one failure state, with copy of the form "if your details are right, check your inbox" (the
  plan's L14a). A legitimate client who registered and did not confirm is sent the confirmation link again without
  being told so; if no mail comes, registering again issues a new link.

Cost, accepted: a client who forgot to confirm sees the same message as one who mistyped. The resend is the remedy, and
the copy points to the inbox.

**2. Three per-address mail buckets, not one (amends D5, "New limiter purposes"; answers plan Q-L5 by default; the third
added by the L9 security review, F1).** With one bucket shared by every account mail, a stranger who registered a
victim's address five times in a UTC day (each costs a solved Turnstile challenge) used up the victim's reset budget.
Decided:
- `account-register-mail-by-address` (5 a day): the confirmation and already-registered mail of registration, and
  nothing else. The L8 review let the login's silent resend share it, since it sends the same link; the L9 review
  found that signing in to an unconfirmed address could then use up that address's registration budget, and moved the
  resend out.
- `account-reset-mail-by-address` (5 a day): the reset link. (The "password changed" notice counted it until the L10 review;
  see Amendment B, item 2.)
- `account-login-resend-by-address` (5 a day): the login's silent resend of the confirmation link (purpose `mail`).
  It is counted only inside the silent job that runs after the response, and no answer is ever made from it.
- Registration traffic can no longer exhaust the reset budget, nor login traffic the registration budget.
  Reset-on-reset starvation remains and is accepted. **Inbox volume bound: an address can receive up to fifteen
  account mails a day**, up to five more than the ten the two-bucket split allowed. Figures stay provisional,
  constants only.

**3. Logout "everywhere" fails closed (L9 security review F2; owner-visible default).** The session that names the
account to sign out is read by a variant that does not swallow a store failure; when it cannot be read, the request is
answered `503`, not `204`. Reading a failure as anonymous would end only the presented session and answer as if every
session of the account were gone. "This device" keeps its behaviour: it revokes the presented cookie only, and a store
that is down already answers `503` there.

*Dated note, 2026-10-19 (refinement, relayed by the coordinator; not re-verified in code by the scribe):*
`POST /api/account/logout` with scope `"everywhere"` and **no live session** clears the cookie and answers `401`.
`204` means only that every session of the account ended. The `503` rule above is unchanged.

**4. A cross-site session probe does not touch the session (L9 security review F3).** `GET /api/account/session` still
answers a cross-site request, but does not mark the session seen, so a page of another site cannot keep a session's idle
clock running.

**5. A hashing platform failure stays counted (L9 security review F4).** A login whose hash cannot be computed is
answered `503`, not as a wrong password, but it stays counted against the address buckets: the limiter counts every
valid attempt at step 7, before the lookup and before the password is looked at, by design.

**6. Recorded with its trigger, not built (L9 security review F5; ADR 0118).** When the argon2id shape is raised, a
dummy hash at each shape still present is kept (or every account is rehashed offline first); otherwise an unknown
address and a known one with an old-shape hash take different times and a timing class appears. Plan section 12 carries
the row.

The plan (§5, §7 L5/L6/L8/L9/L10/L14a, §10, §11) carries the matching text.

## Amendment B — 2026-10-18: claiming is the client's, the notice counts no bucket, a committed reset is recognised

Source: the security reviews of the L10 (reset) and L11 (claim, mint) waves, applied as the reviewers' recommendations
while the owner is away. Owner-visible. Nothing else in this record changes.

**1. Claiming and mint ownership are for clients only (amends D8; L11 review F1).** *Revised 2026-10-18 (architect
review): the mechanism below was first a check on the role name; it is replaced by the capabilities (built, per the
developer's report of 2026-10-18: `isCapabilityHeld`, and `isClientHolding` is gone), because operator and administrator
no longer hold `design.read.own` / `design.edit.own` (D7). The outcome is unchanged, and the role-name checks are gone.* The original reasoning, kept: operator and administrator held `design.edit.own` as well, so the
capability alone let a staff account claim a visitor's designs and be stamped on the ones it minted. Decided, from the
session the server read (never from the request):
- `GET` and `POST /api/account/claim` answer `403` for a signed-in session that is not a verified account holding
  `design.edit.own` (that is, not a verified client; `401` for no session, as before).
- A design minted by a staff session is stored as a visitor's, with no `account_id`.
- Sign-in and email confirmation tell a staff account `claimable: 0`.

Residuals, recorded (plan §10): the first claimer keeps a design on any device, rotating the visitor cookie does not
revoke a claim already made, and there is no unclaim path yet. A later wave gives staff a reassign / unclaim control. The
L14b dialog shows what is attached (count, dates, thumbnails) before the person confirms. A deployment must apply `0015`
in every environment that receives this code, preview included (L11 review F3): the mint of a signed-in client inserts
`account_id`, so on a database without it that mint fails, while a signed-out mint is unchanged. The claim calls answer
`401` and `403`; L14b handles both (F4).

**2. The "password changed" notice counts no bucket (amends Amendment A, item 2; L10 review L1).** Counting the reset
bucket let a stranger's five reset requests in a UTC day leave no room for the victim's notice. The notice is earned by
a completed reset, which needs a live token, which the reset request's five-a-day bucket bounds, so it is bounded without
a bucket of its own. The `password-changed` limiter purpose is removed. It stays fail-silent. An address can receive at
most five such notices a day on top of the fifteen account mails of Amendment A.

**3. A reset that committed is recognised (L10 review L2).** When `completeReset` throws, the route reads the account
again; if the stored hash equals the new one (random salt, so no one else's), the reset is answered `200` as done
(belt pass and notice included). Any other state, and a failed read, answer `503` as before.

**4. Log lines tell the cases apart (L10 review I1, I2).** The belt pass that ends every session logs the new event
`session-revoke` (closed list extended by one), so a reset that succeeded is not also logged as
`password-reset-complete`/`unavailable`. A failure of the reset request's lookup or token insert logs
`password-reset-request`/`unavailable`, apart from a mail failure; a notice dropped because the stored address no longer
passes the address policy logs `mail`/`refused`. No line holds an address.

The plan (§2 D8, §5, §7 L5/L10/L11/L14b, §9, §10) carries the matching text.

## Amendment C — 2026-10-18: residual of the L12b security review (L1)

Owner-visible, accepted, Low (availability). Nothing else in this record changes.

**Residual.** A write-token cookie, even a wrong or planted one, beats a valid owner session on `PUT`/`PATCH` and on
share: `saveCredentialOf` and `shareCredentialFor` (`apps/web/src/app/api/designs/[id]/route.ts`, `share/route.ts`)
pick the token arm when a token cookie is present. A same-site sibling origin that knows a design id can plant junk and
stop a signed-in owner saving or sharing that design on that device for 30 days. `GET` still answers `canWrite: true`.

**Optional mitigation, not shipped, and not before the refusal matrix of plan §9 exists:** when the token arm raises
`DesignWriteForbiddenError` and the request is same-site with an editing session, run the account arm once. A `409`
from the token arm wins; the limiter counts once; the same for share.

Plan §10 carries the matching row; plan §9 records that the L12 refusal-matrix doubles must model both access arms
with null semantics (L12a review I2).

## Amendment D — 2026-10-18: vendor facts on `crypto.argon2` and the Node version are a gate for applying `0012`

**Update 2026-10-18 (owner accepted the recommendation):** `package.json` `engines.node` is now `"24.x"` and
`password-hash.ts` defines `Argon2UnavailableError` (scribe read both). D2's "`engines.node` becomes `>=24.7 <25`" is
superseded by `24.x`. The gate below still stands for the `node -v` check in a Vercel build log; nothing was run by the
scribe. The paragraphs below are the text as written before the acceptance.

Nothing in D2 is reversed. **`engines.node` `>=24.7 <25` IS in force at HEAD**, set in wave L3 (clarified 2026-10-18; the
first wording of this amendment read as if it were still to be made). It is **not confirmed to work as intended** (fact 3
below). What remains the **owner's decision** is whether to move it to the documented `24.x` and add a runtime guard; no
`package.json` edit was made by this note.

**Facts, with the tier behind each.** All fetched or run 2026-10-18.

1. **Node 24 API.** `https://nodejs.org/docs/latest-v24.x/api/crypto.html` lists `crypto.argon2` and `crypto.argon2Sync`
   as "Added in: v24.7.0", with no Experimental stability marker. The docs JSON (`crypto.json`) gives stability `None`.
   [doc: fetched]. On local Node v24.19.0, `argon2Sync` ran and printed no `ExperimentalWarning` [run]. This closes plan
   L0's stability read; the scrypt fallback is not triggered.
2. **Vercel runtime.** `https://vercel.com/docs/functions/runtimes/node-js/node-js-versions` says: "Current available
   versions are: 24.x (default) 22.x. Only major versions are available. Vercel automatically rolls out minor and patch
   updates when needed." [doc: fetched]. The 24.x **patch is not published**, so whether Vercel runs >= 24.7 is **not
   established**. The argon2id-only check cannot be dropped (there is no fallback algorithm in the stored format), so on
   a runtime below 24.7 every register and login would fail.
3. **`engines` forms.** The docs show `24.x`, `^24.0.0` and `>=22.0.0` (the last resolving to the latest 24.x)
   [doc: fetched]. The form `>=24.7 <25` is **not documented** and gives no minimum-minor guarantee [inf]. The documented
   safe form is `24.x`.

**Gate (owner, before applying `0012` in any environment).**
- Confirm the runtime is >= 24.7 by running `node -v` in a Vercel **build log**, or by logging `process.version` from a
  function, in each environment (preview first).
- Recommended: set `engines.node` to `24.x` and add a startup or runtime guard that refuses to serve account routes when
  `crypto.argon2` is not a function or `process.version` is below 24.7.0. **Owner decision; not made.**

Plan §10 (risk row "`crypto.argon2` stability") and the M9 launch-gate list carry the matching text.

## Amendment E — 2026-10-18: architect review, the owner's own words, the migration change, the notice version

Source: the logic review by the architect that the owner asked for, and the owner's message of the same day. The status
stays **Proposed**.

**1. The owner's own words, 2026-10-18 [owner].** Quoted from the owner's message as relayed by the coordinator:
- *"for 1 delegate logic reviewer on opus to verify and provide feedback from architect"*: the review that produced the
  changes in this amendment.
- Q-L4: *"keep same email as sender"*. Customer mail leaves from the shop's Gmail sender (D6). This **ratifies** Q-L4's
  default. The dedicated-account recommendation stays open as a recommendation only.
- **Superseded 2026-10-18 (later the same day) [owner]:** *"email will be from domain provider and domain is md
  lemnaria.md"* (as relayed by the coordinator). This **supersedes** *"keep same email as sender"*, so Q-L4's ratified
  default (the shop's Gmail as customer sender) no longer stands. Customer account mail is to be sent from an address on
  the owner's domain `lemnaria.md` through the domain provider's mail service, not the consumer Gmail account (D6's
  "reuses the Gmail transport" is therefore the interim only). **Nothing is built:** the code has only the Gmail SMTP
  sender (`apps/web/src/lib/server/mail`, named by the coordinator, not re-read). Effects: the processor-contract gate
  becomes "obtain and verify the domain provider's data-processing agreement and region"; the provider's name is not yet
  known; SPF, DKIM and DMARC for `lemnaria.md` are set at the provider; a provider-neutral SMTP configuration is a
  follow-up the architect is planning in `docs/milestones/M8B-mail-sender-lemnaria-md.md` (not yet written when this note
  was made). Environment variables stay add-only and the owner provisions the secrets.
- **Widened 2026-10-18, minutes later [owner]:** *"everywhing will be send and received unde @lemnaria.md"* (as relayed,
  typos kept). Read as owner direction: **both** account mail and the shop's lead notices are to be sent and received on
  `@lemnaria.md` addresses through the domain provider, and Gmail is to be **retired from both paths**. This covers
  ADR 0164's sender too, but ADR 0164 is not amended and nothing is built; until the move, the shop's notice stays on
  Gmail. Env vars stay add-only: the owner decides when to remove the `GOOGLE_*` variables. The mail processor in the
  privacy notice becomes the domain provider only (name a placeholder), and Google drops out of the processor list once
  Gmail is retired.
- **Timing, 2026-10-18 [owner]:** *"now till development keep gmail one as it works"* (as relayed). The `lemnaria.md`
  move is the **target, not the current state**. During development Gmail remains the working sender for both account
  mail and lead notices; **nothing is retired**. The cutover is a later owner step, after the new sender is built and
  tested on Preview. Read every "will be sent from `lemnaria.md`" line above with that timing; D6's Gmail reuse and
  Q-L4's mechanics still describe what runs today. The Gmail no-processor-contract blocker stays a launch gate until
  the cutover or before real users, whichever comes first.
- Lockout: *"if this is a best practice I approve, if you a not sure make a research"*. The research and the approval are
  recorded in D5 (*Login throttling*): approved as best practice.

**2. Ratified by the owner 2026-10-18.** Superseding the earlier heading *Defaults awaiting owner ratification*. After
the coordinator explained them, the owner said *"accept 4,8 and the rest"* (as relayed): items 1, 2, 4, 5, 6, 7 and 8
are ratified; item 3 is superseded by the owner's own Turnstile ruling (item 5 below) and its default was never
ratified. The owner also said *"accept the adr"*. The items, as originally worded:
1. **Session lifetimes (Q-L1):** client 30 days idle and 90 absolute; staff 12 hours idle and 7 days absolute.
2. **Breach check down accepts (Q-L2):** the password passes on the length rule and the event is logged.
3. ~~**Turnstile down refuses (Q-L3)**~~ **Removed 2026-10-18: the owner ruled the opposite** (item 5 below).
4. **Only the client role claims and owns designs** (Amendment B; now by capability, D7).
5. **A uniform 401 for login**, including a correct password on an unconfirmed account (Amendment A, item 1).
6. **Three mail buckets, and an un-counted "password changed" notice (Q-L5; Amendments A item 2, B item 2).**
7. **No tests this round (D12).** A coordinator relay, not an owner quotation (D12 says so).
8. **Claiming cannot be undone** (Amendment B residual; no unclaim path).
- *The owner asked to have two of these explained.* Items 4 and 8 are the two the owner named in the ratifying words
  (*"accept 4,8 and the rest"*), after explanations; the coordinator's report does not say separately which two were
  explained, so this is an inference from those words. The earlier OPEN line is closed on that basis.
- Amendments A–C were the reviewers' defaults while the owner was away. Their substance is the list above (items 4, 5, 6
  and 8), which the owner ratified; no other part of A–C was separately ratified in the owner's words.

**3. The F1 migration change (relayed by the coordinator; the migration files were not re-read for this note).**
- `password_hash`'s check was widened to the **generic PHC shape**; the strict argon2id shape is enforced in code.
- `locale` was widened to allow a region (for example `ro-MD`).
- The `role` list was **kept** at the three names. Accepted knowingly: a fourth role needs an **owner-run
  drop-constraint migration**.
- **As built (update 2026-10-18, developer report; not re-run by the scribe).** Migration `0012` renamed the constraint
  to `accounts_password_hash_is_phc`, with the generic PHC shape
  `^[$][a-z0-9-]{1,32}([$]v=[0-9]+)?[$][^$]+[$][A-Za-z0-9+/]{16,}[$][A-Za-z0-9+/]{16,}$`. The locale check is
  `^[a-z]{2}(-[a-z]{2})?$`, and the persistence `LOCALE_SHAPE` mirror was widened to match. Strict argon2id is enforced
  **in code only** (`password-hash-shape.ts`). The unattended screen function returned `[]` on `0012` alone, but the CLI
  gate cannot run until `0011` is present (it lives on the M8C branch).
- The migration headers cite "ADR 0172 decision 7/8/9", so **decision numbering in this record is now frozen**: new
  material goes in an amendment and never renumbers D1–D12.

**4. The privacy notice version: research result.**
- **Store** the notice version shown and the timestamp, as accountability evidence. Word it "notice shown, version X",
  **not "consent"**: the account's basis is contract, Art. 6(1)(b) [OWNER_FIXES item 13], and a consent label would claim
  a basis the record does not rely on.
- **Validate** the submitted version against a **closed list** of published versions, replacing the shape-only check.
  The list has one **placeholder entry, `2026-10-draft`**; it is not owner-approved text.
- **As built (update 2026-10-18, developer report):** the closed list is `PRIVACY_NOTICE_VERSIONS = ['2026-10-draft']`;
  a version outside it gives the new field code `UNKNOWN_NOTICE_VERSION`. The register UI must send
  `PRIVACY_NOTICE_VERSIONS[0]`. Persistence keeps its own shape check.
- **Archive each version's text**, so what a person was shown can be reproduced.
- The lawyer or the Moldovan authority confirms this. The EDPB and CNIL passages that support it are **unverified**
  [ven, not re-read].

## Amendment F — 2026-10-19: Lot 2 (client dashboard, A9–A20) port rulings, coordinator-accepted defaults, pending owner confirmation

Source: `docs/milestones/M8B-account-screens-lot2-plan.md` §4 (rulings P-rows) and §9 (owner questions O-rows), a DRAFT
by the architect dated 2026-10-19. Evidence tier: **[doc]**. The scribe copied the rulings from that file; the code
it cites was not re-read for this amendment. The status stays **Proposed**.

**Status of everything below: coordinator-accepted defaults, pending owner confirmation.** The architect's
recommendation in each row was accepted by the coordinator. The owner has not ruled on any of it in his own words.
It does not extend the owner's ratification of Amendment E. Nothing is built by this amendment (D12 still applies: no
tests, no QA step this round).

**1. Accepted defaults** (the architect's recommendation in each plan row; P-numbers are the plan's).
- **P1.** The plan's L14b row ("≤ 3 files") is replaced by server waves S0a–S12 and UI waves U1–U15b (Lot 2 plan §6).
- **P2.** Routes as the mock names them: `kitchens`, `profile`, `password`, `export`, `delete`, `confirm-email`.
- **P3.** `proxy.ts`: add `ACCOUNT_SIGNED_IN_PAGES = [kitchens, profile, password, export, delete]` (account headers,
  site CSP, no Turnstile frame) and add `confirm-email` to `ACCOUNT_TOKEN_PAGES`. Re-run Lot 1 criterion 13's
  encoded-segment probe on the new paths. Security reviews.
- **P5.** Card price: E1 returns `document`; the client prices with a pure `priceFloorOf` exported from
  `use-priced-design.ts`, so the price book is still named once (ADR 0062 seam 1).
- **P7.** Share sheet: status on open, then issue on request, with the replace warning; never issue on open. The copy
  is new and is the owner's to approve.
- **P8.** Delete a draft: a `deleted_by_client_at` mark, no `DELETE` grant (D10 and the privilege test stand). Physical
  removal is left to a later retention or erasure job. The copy changes (plan C6); the owner approves it under O3.
- **P9.** A9K: the existing `design-load-error.tsx` gains a "Bucătăriile mele" action for a client session; the same
  copy for every refusal.
- **P10.** The claim dialog opens on the login or verify page before leaving (the built `on-signed-in.ts` seam). On the
  verify page, Lot 1 criterion 15 binds it: `fetch` only, then `location.assign`.
- **P11.** Password change keeps this device: revoke every session, then start a new session in the same response,
  bound to the new hash. `findLive` refuses a session created before `password_changed_at` [src, as cited by the
  plan], so this is required. It is a new rule beside D3's reset rule.
- **P12.** E-mail change: (1) a new token purpose `email-change` whose row carries the new address (migration
  provisional `0018`); (2) a new `UPDATE (email, email_normal_form)` grant, the review D7 names; (3) confirm revokes
  every session and mails the old address; (4) a taken address at request gets one `202`, and the new inbox gets an
  "address already has an account" notice; (5) three buckets: password check per account, mail per target, a
  per-account mail cap; (6) **residual accepted for this round:** if the target is held by an unverified account,
  every confirm answers `link-invalid` until the unbuilt 30-day cleanup (Q-F3-7) removes it. **Points (3) and (4) are
  also owner question O8 and stay open (see 2).**
- **P13.** The error field on a new-password route is `newPassword`, equal to the body member.
- **P14.** This-device logout from an account page is a full load to `/{locale}` after `204`.
- **P15.** The header account control is one more fixed item in the measured top-bar ladder of ADR 0104 d8/d9. The
  existing `top-bar-box` test will turn red; updating it is owed (D12). The pill keeps the app's real step total.
- **P16.** A20B trigger: when the save status turns `unauthorized` on a design opened through the account arm, the
  editor asks `GET /api/account/session`. Anonymous shows the sheet; signed-in keeps today's read-only state. The
  person's own sign-out disarms it, so an in-place "Ieși din cont" never shows "session expired".
- **P17.** New limiter purposes, figures provisional and constants only: `account-password-check-by-account` 10 / 60 min
  and 30 / UTC day; `account-email-change-mail-by-address` 5 / day; `account-email-change-by-account` 5 / day;
  `account-profile-by-account` 30 / 60 min; `account-export-by-account` 5 / UTC day; `design-duplicate-by-account`
  20 / day plus the mint's existing per-IP bucket. Rename, delete and hide reuse `design-save-by-account`. The owner
  may change the figures.
- **P18.** Dialog shell: extract the focus trap, Escape and inert background from `settings/confirmation-dialog.tsx`
  into one hook used by both; settings behaviour stays byte-identical.
- **P20.** Tier of the UI waves: Full + security + visual on every U-wave. Lowering U6 and U9b to Light is the
  coordinator's explicit choice to make, not a default.

**2. Open owner questions (not decided; do not build on a default).** Plan §9 lists their defaults; none is recorded
here as ruled.
- **O1.** Save / Discard under autosave (CG1). Blocks U15, the keep-kitchen pop-up (A15, A16).
- **O2.** Claim dialog detail: count only, or count, dates and names (amends plan L14b criterion 5). Blocks U9a and
  the conditional server wave S11.
- **O6.** The sent flag is set when the request is stored, or when the shop's notice is marked sent. **P6's choice of a
  `designs.sent_at` column written by the contact flow rather than a read-time join is not recorded here**: its
  trigger moment is O6 and its backfill is O11. Blocks S5.
- **O8.** E-mail change mails: the already-registered notice, the old-address notice copy, and revoking every session
  on confirm (P12 points 3 and 4). Blocks S9, U11.
- **O10.** Return to the open kitchen after sign-in through a closed allow-list (plan C26). Blocks U15b.
- **O12.** "Anulează" on Lot 2 dialogs against ADR 0086's "name the outcome" rule (P19). Blocks U2.
- **O16.** A capability `account.manage.own` for the self-service routes (P4). Blocks S7, S8.
- **O17.** The plural for twenty: the 2026-09-10 ruling "without «de»" or the approved "20 de bucătării". Blocks U5,
  U9a copy.

**2a. Owner confirmations, 2026-10-19 [owner, relayed by the coordinator].** These promote the matching coordinator
defaults above from "pending owner confirmation" to **owner-confirmed**. The remaining items in 2 (O1, O2, O8, O12,
O17) stay pending. The list in 2 is kept as written.
- **O6, owner-confirmed.** The sent flag is set when the request is **stored**, regardless of whether the shop e-mail
  succeeds, because operators and admins filter by this flag even when e-mail sending fails. P6's `designs.sent_at`
  column is still not recorded here; O11 (backfill) stays open.
- **O10, owner-confirmed, with additions.** Default landing after sign-in is "Bucătăriile mele" for a client. Operator
  and admin get a general dashboard (statistics) that is **not yet planned**; until it exists they land on the start
  page. The closed C26 allow-list `^/(ro|ru)/d/[A-Za-z0-9_-]{21}$` stays for the refused-save case and takes
  precedence over the default landing.
- **O16, owner-confirmed.** Add the capability `account.manage.own` (every role) for the self-service routes (P4).
- **O5, owner ruling (was not in the list above).** Delete account: do nothing now. No A13, no interim row, no contact
  address. A data-erasure / retention policy ADR is needed later; there is currently no policy on user-data erasure.
- **O18, owner ruling (was not in the list above).** Keep HTTP 200 for the forbidden page. The backend includes an
  explicit machine-readable marker in the payload (state `"forbidden"` plus a message key) and the UI renders the
  "access forbidden" screen from it. No experimental `authInterrupts`. Consistent with the existing
  SharedOutcome / forbidden handling in `apps/web/src/lib/server/account/signed-in-page.ts` (relayed; not re-read).

**3. Not covered by this amendment.** P4 and P19 (owner questions O16 and O12), P6 (above), and the other owner
questions O3–O5, O7, O9, O11, O13–O15 of plan §9. They are neither accepted nor ruled here, except as 2a records.
- Until the notice text is the owner's, M9 launch-gate line 4 stands. **Update 2026-10-18:** the owner accepted
  `docs/legal/privacy-notice-draft.md` as the **working draft only**; it is not publishable, and the version list still
  holds the placeholder.

**5. Turnstile unreachable no longer refuses: the owner's ruling, 2026-10-18 [owner] (replaces default Q-L3 and D5's
"or one that cannot be reached").** Quoted as relayed by the coordinator: *"we will have rate limit on this so no
blocking if turnstile is not reachable"*. As built:
- **What "unreachable" is.** Cloudflare's siteverify was asked about a **present** token and genuinely could not
  answer: a network error, the 3 s deadline, a status other than `200` (any 4xx or 5xx included), a redirect, a body
  that is over 64 KiB or is not the expected JSON shape. `verifyTurnstile` answers the result kind `unreachable`.
  `refusalOfChallenge` then lets the request **proceed as if the challenge had passed**, and `verifyTurnstile` logs one
  `turnstile`/`unavailable` account event per occurrence (event, outcome, no token, no address, no other value), so an
  outage is visible in the log as a run of those lines.
- **The compensating control.** Nothing else changes. The block stage (step 4) runs before Turnstile and the subject
  stage (step 7) after it, exactly as before, and both still fail closed. The limiters are the whole defence during an
  outage: the register, login and reset-request buckets (D5, Amendment A) cap what an unchallenged caller can do.
  Cost accepted by the owner's ruling: during an outage the per-address and per-network limits are all that stop a
  scripted flow, and the attacks Turnstile made costlier (victim lockout by solved challenges, mail flooding) are
  bounded by the buckets and no longer by solving effort.
- **Misconfiguration is not an outage and still refuses with `503`, loudly.** A distinct result kind, `not-configured`,
  covers: `TURNSTILE_SECRET_KEY` missing or empty; `LEMNARIA_PUBLIC_ORIGIN` missing or unusable (the hostname
  siteverify must report is then unknown); a documented Cloudflare test secret outside the loopback fake-mail
  environment. Each logs one constant line through `console.error` naming the gap, plus the `turnstile`/`unavailable`
  event, on every attempt. These are checked **before** siteverify is asked, so a misconfigured deployment cannot be
  mistaken for an outage and cannot silently lose its check.
- **A Cloudflare answer is final.** Whenever Cloudflare does answer (`200` and a readable body), the answer decides as
  before: `success: false`, a wrong `action` or a wrong `hostname` is `failed` (`403`); only a full match passes.
- **An absent token is always refused.** A body with no `turnstileToken`, an empty one, a non-text one, or one over
  2,048 characters is `failed` (`403`) and never reaches the network, whatever Cloudflare's state. The fail-open
  covers only a siteverify that could not be asked or read **after a token was obtained**. There is no client-claimed
  bypass flag ("the widget was unavailable"): a bot would simply claim it.
- **Accepted residual, stated plainly.** The fail-open is server-side only. If Cloudflare is down so that the widget
  script cannot load, the frame is blocked, or the widget times out (`turnstile-widget.tsx` falls back to its
  `unavailableContent`), the person has **no token and cannot submit**: a Cloudflare outage blocks widget-dependent
  submission for real users even though the server would have let a present token through. Only a token already held
  when siteverify then fails, or a token the widget produced before the outage reached the server, benefits. The owner
  accepted blocking on the *server's* side being removed; removing it on the *client's* side would need either a
  client-claimed flag (rejected above) or a separate server-verifiable fallback challenge (not built; a new decision).
- **Other residuals.** (a) A status other than `200` is unreachable by the owner's wording, so a Cloudflare `4xx`
  (including a rate-limit answer to our own siteverify calls) opens the gate for that request; Cloudflare answers a
  rejected secret or token with `200` and `success: false`, which stays `failed`. (b) A caller who cannot make
  Cloudflare unreachable gains nothing by sending a junk token: it is asked about and answered `failed`.
  (c) The M9 launch-gate line on the real-key preview walk is unchanged.

## Amendment G — 2026-10-19: Lot 2 as built, the column bounds, the ADR 0019 d11 scope growth, accepted residuals, and new owner questions

Source: the coordinator's brief of 2026-10-19, relaying wave reviews (a logic and a security agent per wave) on branch
`feat/login-register`, HEAD `a47db452`. Evidence tier: **source-verified by those reviews, relayed**. The scribe re-read
no code and ran nothing. **No test was written (D12), and nothing was run against a database or in a browser.** The
status stays as Amendment F left it. The built state, wave by wave, is in
`docs/milestones/M8B-account-screens-lot2-plan.md` §12; this amendment records the decisions and open questions.

**1. Owner rulings already recorded (Amendment F 2a and the plan), restated for the built state.**
- O5: nothing now. O6: the sent mark is set when the request is stored, and S5 does so before the shop notice, bounded
  at 1 s and non-fatal. O10: landing. O16: `account.manage.own` for all roles, now in the capability list. O18: the
  200 plus payload ruling for the forbidden page.
- The 200-kitchen export cap is **provisional**; over the cap the export answers `409 export-too-large` and does not
  spend the bucket.

**2. Choices made while building (architect or coordinator, not owner rulings).**
- Kitchen names are normalised **NFC, not NFKC** (the plan's S2 text said NFKC).
- `readExistingPassword`: the is-the-address rule is applied only to a **new** password; sign-in no longer applies it.
- Column bounds: `accounts.name` at most 120, `accounts.address` at most 200 in the database; domain limits 100 and
  100. The database checks bound length only; the domain refuses control and format characters, and the store refuses
  them for kitchen names.
- Duplicate: the client composes "{name} (copie)" and truncates by code points; the server never truncates.
- E2-E5: one 404 for every unreachable case; the `409` words `sent` / `not-sent` only after ownership.
- Password change answers `401 password-changed-sign-in` if the new session cannot start.
- Password change and reset completion retire every unused e-mail token (open as O23).
- E-mail change: tokens retired before branching on the target; the token is bound to the verified password hash;
  confirm refuses a token created before `password_changed_at`. Mail copy is DRAFT (O8 defaults).
- Backup export and restore carry `sent_at`, `hidden_by_client_at`, `deleted_by_client_at` **only**; `account_id` and
  `name` are not exported, per D10, until the accounts export QP5 exists (open as O21).
- The E-mail-change UI is to be gated behind a constant `EMAIL_CHANGE_ENABLED = false` (in progress, not committed).

**3. ADR 0019 d11 accepted risk, scope grown again.** `hidden_by_client_at`, `deleted_by_client_at` and `sent_at` fall
under the table-level `UPDATE` on `designs`, as `account_id` did. **The owner's re-acceptance is needed before hide and
delete are used in production.** Column-scoping stays the named revisit.

**4. Accepted residuals (reviewers' findings).** A lost acknowledgement on the E9 confirm drops the old-address notice;
a login-versus-confirm race sliver; an E9 `503` followed by `link-invalid`; duplicate has no lifetime cap; `markSent` is
not scoped by account on its own port; the S5 already-notified-replay case is not repaired, and the owner-run O11
backfill statement is its repair.

**5. Open owner questions (none ruled; do not build on a default).**
- **O19 (review finding F1).** E-mail change takeover recovery: a notice to the **old** address at request time and/or a
  time-limited revert link in the confirm notice. Recommended: both. **It blocks the grant `UPDATE (email,
  email_normal_form)` on `accounts` (runbook step 4b). That grant is not to be made until F1 is ruled, the confirm page
  exists, and E8/E9 are gated.**
- **O20.** Keep or drop `GET /api/account/profile` (it exists; the plan said a server read).
- **O21.** Should the backup export ever carry `account_id` and `name` (after QP5)?
- **O22.** The frozen sent-kitchen copy at `/s/<token>` (`contact_submission_views`) stays reachable after hide, by
  design (ADR 0165). Confirm explicitly. The plan's CG9 and criterion 3 now carry a dated qualifying note.
- **O23.** Accept that password reset and change retire all unused e-mail tokens, verify-email included?
- **O24.** The 429 wait shown in the notice (mock A11F / SB10), implemented once in the shared `account-form-parts`.
- Amendment F's O1, O2, O8, O12, O17 stay open.

**6. Tests owed (D12).** S4 predicates (about 20 sites), mutation-proven; E1, E2-E5 and E6-E10 route order and 404
byte-identity; copy lock `approved-romanian-messages.ts` plus golden hashes for `accountKitchens`, `accountProfile`,
`accountPassword`, `accountMail` and `claimDialog`; `limit-policy.test.ts` (the length 20 assertion is already stale);
persistence statement tests; `top-bar-box.test.ts`.

### Amendment G, addendum — 2026-10-19 (later): U7-U13 built, E8/E9 gated, review-driven choices, O25-O27, tests round

Source: the coordinator's brief, relaying the U7-U13 reviews (a logic and a security agent per wave) at branch HEAD
`aa09a1e0`; commits read in the worktree reflogs. File facts below were read in the repository by the scribe
(**source-verified**). No command, browser or database was run by the scribe. The text above is kept as written; where it
differs, this addendum governs.

**1. Built and reviewed by reading** (plan §12.7): U7 and U8 (card menu, inline rename, duplicate, share sheet on the new
shared hook `share/use-share-link.ts` extracted from the editor's share control, delete and hide dialogs), U9b (the
design load error offers "Bucătăriile mele" to a client; client-session body copy), U11, U12, U13 (export screen with
blob download), the shared live 429 countdown in the notice (SB10) for all account forms, the login arrival reason
`password-maybe-changed`, the keyed toast, the quiet dialog confirm tone and the toast clearance variable.

**2. Correction to item 2's last bullet and to the "only the UI" wording.** Item 2 said the e-mail-change UI "is to be
gated behind `EMAIL_CHANGE_ENABLED = false` (in progress, not committed)". It is committed, and the gate is wider than the
UI: **E8 and E9 also answer an empty `404` while the flag is off**, before anything is read, logged or counted
(`apps/web/src/lib/server/account/email-change-gate.ts:12-18`); the confirm page calls `notFound()` while it is off. O19's
"E8/E9 are gated" condition for the grant is therefore met; the grant stays blocked on F1 alone (runbook step 4b).

**3. Choices made in review (architect or coordinator, not owner rulings).** (a) The duplicate's copy name is composed by
the client (ADR 0095). (b) Hide and delete are never physical. (c) Share reissue has no confirmation (a product decision,
left). (d) The share-link client collapses its errors (left). (e) The card menu is a dialog of rows, not an ARIA menu.
(f) Staff get a "Profil" row (O16).

**4. New open owner questions (none ruled).** **O25** client-session load-error body wording, RO and RU
(`designLoadError.bodyClient`). **O26** export size bound by bytes against the 200-kitchen count; the platform
response-size limit is unknown; an attempt that fails after the bucket is counted spends one of the 5 daily downloads
(an over-count account is refused before the bucket, `lib/server/account/export-account.ts:45-46`). **O27** approval of
all RO and RU draft copy: `accountKitchens`, `accountProfile`, `accountPassword`, `accountEmailChange`, `accountExport`,
the `accountMail` e-mail-change mails, `claimDialog`, `sessionExpiredSheet`. O1-O24 keep their recorded states.

**5. D12 lifted for the tests round.** On 2026-10-19 the owner lifted D12 for this round ("run the scribe pass and then the
tests round and commit", relayed). Tests are being added in three lanes (persistence and domain; web server routes; web
client, UI and i18n) with mutation proofs. D12 is unchanged for anything outside this round. **Results: to be recorded**
(plan §13).
