# M8B — Login and register: the wave plan

> **STATUS: PLANNED, draft of 2026-10-17. No wave dispatched.** Branch `feat/login-register`, cut from
> `origin/main` at `4f85b970`; not pushed. The decision record is
> [ADR 0169](../decisions/0169-a-client-account-is-an-e-mail-and-an-argon2id-password-a-session-is-a-hashed-host-only-cookie-a-role-is-a-named-set-of-capabilities-and-a-claimed-design-opens-on-any-device.md),
> **Proposed**: nothing below is dispatchable until the owner accepts it (wave L0).
>
> **This round runs without tests, by the owner's instruction** (relayed by the coordinator, 2026-10-17:
> *"development proceeds WITHOUT writing or running tests this round"*). That deviates from `docs/WORKFLOW.md`
> (paired tests, QA gates review) and is recorded as ADR 0169 decision 12, scoped to this round. §8 says what
> replaces QA and what it costs; §9 lists the tests owed.

This plan covers the **login and register part of Fix 3** (`docs/OWNER_FIXES.md`, *Fix 3*, owner rulings
2026-10-17). It is the first part of [M8B](M8B-customer-profiles.md) to be planned; M8B's dashboard, GDPR and
retention waves come later (§12).

**Evidence tiers.** **[src]** read in the source at `4f85b970`; **[run]** a command run by the architect, output
quoted; **[doc]** quoted from a record in this repository; **[owner]** an owner ruling as recorded in
`OWNER_FIXES.md`; **[inf]** the architect's inference; **[ven]** a vendor fact from memory, **not re-read**:
wave L0 re-reads every one before code depends on it.

---

## 0. Where this sits

- **M8B** ([plan stub](M8B-customer-profiles.md)) holds twelve obligations from ADR 0115 and the cut 8N, 8P1–8P9.
  This plan replaces the slices of 8N and 8P1–8P7 for login and register. The table below maps them. 8P8
  (dashboard) and 8P9 (deletion, notice, retention) stay later waves.
- **Fix 3's order** [owner, `OWNER_FIXES.md` *Order of this fix*]: (1) the ADR, (2) the owner designs the
  screens in Claude Design, (3) M8B is replanned. This plan is (3) for the server half and waits on (2) for the
  screens (waves L13b, L14a, L14b; L13a needs only L0's reads).
- **M8C** (the sibling branch `fix/empty-space-fill-and-preset-save`) holds ADRs **0167, 0168** and migration
  **`0011_create_presets.sql`** [src: that branch's plan §3.2 and `docs/decisions/` listing]. Hence ADR **0169**
  and migrations **0012–0015** here. The migration runner refuses a gap (`MigrationSequenceError`,
  `packages/persistence/src/migration-files.ts:59-87`) [src]. **This branch merges after M8C**, or its
  migrations are renumbered at rebase. That is free only while none of them has been applied anywhere; once
  applied, a migration file's bytes are frozen (every migration header, e.g. `0005`) [doc].
- **M9** (delivery) keeps the host, the WAF and the launch gate. Lines this plan adds to M9's gate are in §10.

| M8B stub | Here |
| --- | --- |
| 8N (design record, QP1–QP5) | L0 and ADR 0169. QP1 and QP2 get defaults (§11). QP3 and QP5 are later waves. QP4 (design names) belongs to the dashboard |
| 8P1 persistence | L1 (schema), L4a, L4b (stores) |
| 8P2 hashing and password rules | L2 (rules), L3 (hashing, breach check) |
| 8P3 sign-up and verification | L7 (customer mail), L8 |
| 8P4 login, logout, session, CSRF, back-off | L5 (limiter), L6 (session lifecycle), L9 |
| 8P5 reset | L10 |
| 8P6 claiming and the gate | L11, L12a, L12b |
| 8P7 screens (and the modal) | L13a–L14b. **The modal is not here** (§12) |

## 1. Goal and scope

**Goal.** A client can register with an e-mail and a strong password, confirm the e-mail, log in, log out here
or everywhere, and reset a forgotten password. Designs made in their browser can be attached to the account
once they confirm, and then open and save from any device. Throughout:

- the account is protected by Turnstile, the application limiter and careful storage;
- no response tells a stranger whether an address has an account;
- roles and capabilities exist as a seam that the staff waves fill later.

**In scope.**
1. Register: e-mail, password, optional phone (stored unverified and labelled so), privacy-notice version, a
   Turnstile token.
2. E-mail confirmation by a link plus the password (D-flow 2). It signs the client in.
3. Login. Logout from this device, and logout everywhere.
4. Forgot password and reset password.
5. Server-side sessions, stored hashed.
6. The RBAC seam:
   - the closed capability list and three roles;
   - `role` is not writable by the application role;
   - one `requireCapability` check;
   - staff exist only by an owner console seed.
7. Claiming the visitor cookie's designs (on confirmation), and the account gate so that claimed designs open
   on any device.
8. The register, login, confirmation and reset screens, **once the owner's screens exist**.

**Out of scope, each a later wave** (§12 names the seam each needs):
- the dashboard ("My kitchens", rename, duplicate, delete, hide);
- the profile page (name, address, change password, change e-mail);
- the registration nudge modal and the Save / Discard pop-up;
- operator and administrator screens, notes, the audit log, staff invitation;
- `design.read.any` and `design.unhide`;
- GDPR export and erasure, the privacy-notice text, the cookie notice;
- the retention job (unsent drafts after 365 days, unverified accounts after 30 days);
- the accounts backup;
- swapping the preset gate to `preset.create`.

## 2. What the plan rests on

ADR 0169 holds the decisions and the sweep. In one line each:

- **D1, account.** E-mail and password. No 2FA, no SMS. Phone optional, unverified [owner Q-F3-2].
- **D2, password.** Argon2id from `node:crypto` (no new dependency), stored as a PHC string and rehashed at
  login. Policy: 12 to 128 characters after NFKC, no composition rules, not in the breached-password corpus
  (HIBP range API, k-anonymity), not equal to the e-mail.
- **D3, session.** 256 random bits in `__Host-lemnaria_session`, stored as SHA-256. Idle and absolute expiry by
  role. A fresh value at every sign-in. Reset revokes every session. The role is read on every request. **No
  signing secret exists**, because nothing is signed.
- **D4, CSRF.** Every state-changing account route:
  - runs `isCrossSiteRequest` first;
  - takes JSON only;
  - sits behind `SameSite=Lax`.

  Logout is `POST` only. **An e-mailed link's `GET` never changes state.**
- **D5, abuse.**
  - Turnstile on register, login and reset request, verified on the server; a failed or unreachable check
    refuses.
  - New limiter policies, which fail closed, including one mail bucket per address.
  - Equal answers for known and unknown addresses. A dummy hash for an unknown address.
  - Account mail is sent after the response.
- **D6, customer mail.** A **second port, addressed to a customer**. The shop's `MailMessage` stays without a
  recipient (ADR 0154 d11, 0164). The Gmail adapter is reused until M9.
- **D7, RBAC.** Closed capabilities in the domain package. Three roles as capability sets, one role per account.
  Grants keep `role` out of the application role's `INSERT` and `UPDATE`, so the app can neither create nor
  promote staff. Every account-acting route checks a capability.
- **D8, claim.** Requires a verified **client** session (a staff account does not claim; L11 review F1, ADR 0169
  Amendment B), the visitor cookie and the client's explicit confirmation. One
  atomic statement with `account_id is null`. Claiming leaves `visitor_hash` and `write_token_hash` untouched. A
  mint made while a verified client is signed in sets `account_id`; a staff account's mint does not.
- **D9, gate.** A claimed design opens, saves and shares for a session of its owning account on any device.
  Everyone else gets ADR 0114 decision 5's one indistinguishable refusal.
- **D10, schema rules.** No `DELETE` grant. Tokens are stored as hashes only. No check constraint that a later
  wave would have to drop. `designs.account_id` has no FK (the migration screen, §4). Sessions and tokens are
  never backed up.
- **D11, amendments.** To 0019 d1 (write half) and d5 (rows), 0114 d5, 0115 d2/d3, 0161 (CSP on account pages
  only), 0153 (accounts differ, deliberately), 0155/0156 (new purposes and a subject).
- **D12, this round.** No tests and no QA. Security review on every code wave. No push.

## 3. Module boundaries

| Layer | New modules | May import | Must not |
| --- | --- | --- | --- |
| `packages/configurator-domain/src/account/` | `account-fields.ts`, `password-policy.ts`, `capabilities.ts`, `index.ts` | the contact rules it reuses (`contact-fields.ts` e-mail rule, `phone-number.ts`, `input-checks.ts`) | any I/O, `node:crypto`, Next, the persistence package |
| `packages/persistence/src/` | `account-store.ts` (port), `neon-account-store.ts`, `fake-account-store.ts`, `session-store.ts` (port), `neon-session-store.ts`, `fake-session-store.ts`; new methods on `neon-configuration-repository.ts` and `share-link-repository.ts` | the driver (only here, `scripts/gates/boundary.sh`) | password hashing, cookies, HTTP |
| `apps/web/src/lib/server/account/` | `password-hash.ts`, `breached-password.ts`, `session-cookie.ts`, `turnstile-verification.ts`, `account-log.ts`, `current-session.ts`, `session-lifecycle.ts`, `require-capability.ts`, `register-account.ts`, `verify-email.ts`, `sign-in.ts`, `reset-password.ts`, `account-responses.ts` | domain, persistence ports, `rate-limit/`, `mail/`, `digest/` | the driver; any client import (`server-only`) |
| `apps/web/src/lib/server/mail/` | `customer-mail.ts` (port), `create-customer-mail-sender.ts`, `account-mail-messages.ts`; a second factory in `gmail-mail-sender.ts`; customer recording in `fake-mail-sender.ts` | `mail-sender.ts`'s kinds and predicates | widening `MailMessage` with a recipient |
| `apps/web/src/lib/server/rate-limit/` | new purposes in `limit-policy.ts`, an account subject in `bucket-subject.ts`, `judge-account-request.ts` | as today | — |
| `apps/web/src/app/api/account/**` | `register`, `verify-email`, `login`, `logout`, `session`, `password-reset/request`, `password-reset/complete`, `claim` | `lib/server/account/*` | business rules in the route file |
| `apps/web/src/app/[locale]/account/**` | `register`, `verify-email`, `login`, `forgot-password`, `reset-password` pages; `src/account/` client components; a Turnstile widget | messages, the routes over `fetch` | reading any cookie on the client; `localStorage` or `sessionStorage` for anything about the account |

**Dependency direction** (ARCHITECTURE_PROPOSAL §3): domain ← persistence ← web. **Who decides access:** the web
server, through `current-session.ts` → `require-capability.ts`, and the persistence predicates (`account_id =
$session_account`). The UI never authorises (Fix 3 item 8).

## 4. Schema — four migrations (applying them is the owner's step)

Every file follows the house header:
- why each column and check exists;
- *apply before the code that reads it, and before the grant*;
- the ledger reading before and after;
- *bytes frozen once applied* (e.g. `0005`, `0010`) [doc].

Each must pass `migration-safety.ts`'s unattended screen [src]:
- **`create table if not exists`** is recognised, with `on delete` referential actions allowed inside it
  (`:30`, `:605-624`).
- **`alter table … add column if not exists`** is recognised, but no function call may appear in the clause.
- **A `DO` block guarded on `pg_constraint`** may only `add constraint … check (…)`. It cannot add a foreign key
  (`:505-535`).
- **`create [unique] index if not exists`** is recognised.
- **`grant` is not a recognised shape**: grants are the owner's separate step [doc: `0006` header].

### `0012_create_accounts.sql`

| Column | Type and check | Why |
| --- | --- | --- |
| `id` | `text` primary key, `~ '^[A-Za-z0-9_-]{21}$'` | Generated in code, as a design id is (`generate-design-id.ts`) |
| `email` | `text not null`, 3–254 characters | As typed, trimmed. 254 = `CONTACT_EMAIL_MAX_LENGTH` [src] |
| `email_normal_form` | `text not null`, unique (`accounts_email_normal_form_is_unique`), 3–254 characters | The domain's `countedFormOfAddress` (lower case, nothing stripped) [src: `contact-fields.ts:120`]. **No `= lower(…)` check:** Postgres `lower()` and JS `toLowerCase()` agree only on what both treat alike, so the code is the one authority on the normal form |
| `email_verified_at` | `timestamptz` null | Null until confirmed. The 30-day cleanup (later) reads it |
| `password_hash` | `text not null`, constraint `accounts_password_hash_is_phc`, `~ '^[$][a-z0-9-]{1,32}([$]v=[0-9]+)?[$][^$]+[$][A-Za-z0-9+/]{16,}[$][A-Za-z0-9+/]{16,}$'` (as built, 2026-10-18) | The **generic PHC shape**; strict argon2id is enforced in code only (`password-hash-shape.ts`). The parameters live in the hash, so raising them needs no migration |
| `password_changed_at` | `timestamptz not null default now()` | Shown in the "password changed" mail. Later sessions compare against it |
| `role` | `text not null default 'client'`, in (`client`, `operator`, `administrator`) | Owner's three names [owner]. **Not in the application role's grants** (below) |
| `locale` | `text not null`, `~ '^[a-z]{2}(-[a-z]{2})?$'` (widened, as built 2026-10-18; the persistence `LOCALE_SHAPE` mirror matches) | The language of the account's mail, with an optional region. A shape check, not a list, so adding a locale drops nothing |
| `phone`, `phone_normal_form` | `text` null, both null or both set; at most 32 characters | Optional, **unverified**, labelled so [owner Q-F3-2]. `normalisePhoneNumber` makes the normal form [src] |
| `privacy_notice_version` | `text not null`, `~ '^[a-z0-9.-]{1,32}$'` | Which notice was shown at registration (GDPR item 13). The column keeps the shape check; the **domain** validates against the closed list `PRIVACY_NOTICE_VERSIONS = ['2026-10-draft']` (code `UNKNOWN_NOTICE_VERSION`) |
| `created_at`, `updated_at` | `timestamptz not null default now()` | — |

**Not added, by ADR 0118** (no reader yet): name, address, disabled or invited-by marks, erasure marks. Each is
an additive column for the wave that reads it.

**The grant (owner)** — column-scoped, so a bug or an injection in the application cannot create or promote a
staff account:

```sql
GRANT SELECT ON TABLE public.accounts TO app_designs;
GRANT INSERT (id, email, email_normal_form, password_hash, locale, phone, phone_normal_form, privacy_notice_version)
  ON TABLE public.accounts TO app_designs;
GRANT UPDATE (email_verified_at, password_hash, password_changed_at, updated_at, locale, phone, phone_normal_form,
              privacy_notice_version)
  ON TABLE public.accounts TO app_designs;
```

The grant carries no `DELETE`, no `TRUNCATE`, no `ALL`, no `WITH GRANT OPTION`, and nothing to `PUBLIC`. **`role`,
`email`, `email_normal_form` and `id` are never updatable by the application.**

### `0013_create_account_sessions.sql`

| Column | Type | Why |
| --- | --- | --- |
| `token_hash` | `text` primary key, SHA-256 hex check (`0006`'s shape) | The cookie's value is never stored |
| `account_id` | `text not null references accounts (id) on delete cascade` | A deleted account leaves no session |
| `created_at`, `last_seen_at` | `timestamptz not null default now()` | Idle expiry = `last_seen_at` + the role's idle lifetime |
| `absolute_expires_at` | `timestamptz not null` | Fixed at creation. Never extended |
| `revoked_at` | `timestamptz` null | Logout, logout everywhere, reset |

- **Index:** `(account_id) where revoked_at is null`, for logout everywhere and reset.
- **No IP address and no user agent** (minimisation).
- **Grant:** `SELECT, INSERT, UPDATE (last_seen_at, revoked_at)`.

### `0014_create_account_email_tokens.sql`

| Column | Type | Why |
| --- | --- | --- |
| `token_hash` | `text` primary key, SHA-256 hex check | Hash only |
| `account_id` | `text not null references accounts (id) on delete cascade` | — |
| `purpose` | `text not null`, `~ '^[a-z-]{1,32}$'` | Closed list in code (`verify-email`, `reset-password`). A shape check, so a later purpose (staff invitation, e-mail change) drops nothing |
| `created_at` | `timestamptz not null default now()` | Only the newest unused token of a purpose works |
| `expires_at` | `timestamptz not null` | 24 h to confirm, 30 min to reset (ADR 0169 D5) |
| `used_at` | `timestamptz` null | Single use |

- **Index:** `(account_id, purpose, created_at desc) where used_at is null`.
- **Grant:** `SELECT, INSERT, UPDATE (used_at)`.

### `0015_add_design_account_id.sql`

- `alter table designs add column if not exists account_id text;`
- A `pg_constraint`-guarded `DO` block: `check (account_id is null or account_id ~ '^[A-Za-z0-9_-]{21}$')`
  (`0005`'s pattern).
- `create index if not exists designs_account_id_updated_at_idx on designs (account_id, updated_at desc, id desc)
  where account_id is not null;` This serves resume by account and, later, "My kitchens".

**No foreign key.** The screen cannot certify one on an existing table [src: the DO block allows `check` only;
`references accounts (id)` in an add-column clause reads as a function call]. The `contact_submissions.design_id`
precedent applies [doc: `0008` header]. Code keeps the link correct. Erasure (later) deletes designs before the
account. **No grant is needed:** `app_designs` already holds table-level `UPDATE` on `designs` (ADR 0019 d11,
accepted risk) [doc].

### The owner's apply order (per environment, preview first)

Follow `runbooks/applying-a-table-migration-and-its-application-role-grant.md`:

1. Production still needs `0009`, `0010` and M8C's `0011` first [doc: M8C plan §3.2].
2. Then `0012`–`0015` (the ledger reads 15).
3. Then the grants above.
4. Then the deploy.

**Production grants are blocked this round.** The runbook's proof is `application-role-privileges.test.ts` (steps
3–7), and its arms for these tables are owed (§9). Preview can take the migrations and grants for a manual walk
of the flows. The runbook section for `0012`–`0015` is written in L1 (docs).

## 5. The flows (behaviour every wave builds toward)

**Common order for every account `POST`** (the share route's order, `api/designs/[id]/share/route.ts`):
1. `isCrossSiteRequest` → `403`, nothing read.
2. `content-type: application/json`, else `415`.
3. Body bounded by `read-body-with-limit.ts` (8 KiB), else `413`.
4. Network-block limiter for the purpose (`judgeAccountBlock`) → `429` / `503`.
5. Turnstile, where named → `403 challenge-failed` / `503`.
6. Input validation (domain) → `400` with field codes. **Independent of whether the address has an account.**
7. Subject limiter, where named (`judgeAccountSubject`: the address's or the account's buckets), before any account
   lookup → `429` / `503`.
8. The work.

**The two stages are two calls, and no bucket is counted in both** (security review of L5, 2026-10-18). Step 4
counts only network buckets; step 7 counts only address or account buckets. A refused step 4 never reaches step 7, so
a refused block counts no row for an address, which anyone could otherwise invent; a Turnstile failure or an invalid
body is answered before step 7, so it counts no address bucket either. `confirm-email` and `password-reset-complete`
have step 4 only (the token is the subject). Each stage fails closed: whatever cannot be judged is `503`, and no
account write goes on.

Every answer is `Cache-Control: private, no-store`. **No answer, log line, error or header contains a password,
a token, an e-mail address or a phone number** (`account-log.ts` writes event kinds, outcomes and policy names
only).

| # | Flow | Steps | Answer |
| --- | --- | --- | --- |
| 1 | **Register** `POST /api/account/register` `{email, password, phone?, locale, privacyNoticeVersion, turnstileToken}` (`privacyNoticeVersion` must be in the closed list `PRIVACY_NOTICE_VERSIONS`, else field code `UNKNOWN_NOTICE_VERSION`; the register UI sends `PRIVACY_NOTICE_VERSIONS[0]`) | (a) Policy check, including the breach check. (b) Unknown address: insert unverified, issue a `verify-email` token, mail the link. (c) **Unverified** address: overwrite `password_hash`, phone, locale and notice version; issue a new token (older ones stop working); mail the link. (d) **Verified** address: change nothing; mail an "already registered — log in or reset" notice. (e) Hash the password in every branch | **`202 {status:"check-inbox"}` in (b), (c) and (d) alike.** One mail is queued in each, sent after the response (`after()`, [inf/ven]) |
| 2 | **Confirm** `GET /[locale]/account/verify-email#t=<token>` | The page reads the fragment (never sent to the server, never in a `Referer`) and asks for the password. `POST /api/account/verify-email` `{token, password}`: one transaction. The token must be the newest unused, unexpired one of its purpose. The password must verify against the account's current hash. Then: set `email_verified_at`, mark the token used, start a session | `200 {status:"signed-in", claimable:n}` and `Set-Cookie`, **or one answer `400 {status:"link-or-password-invalid"}`** for an unknown, used, expired or superseded token or a wrong password |
| 3 | **Login** `POST /api/account/login` `{email, password, turnstileToken}` | Unknown address: verify against a fixed dummy hash, so the time class is equal. Wrong password: same. **Correct password but unverified: the same `401` as a wrong password, with the same verification work and no other work before the response (ADR 0169 Amendment A, L8 security review F1).** The confirmation resend (`judgeAccountSubject({purpose:"mail"})`, which counts its own bucket `account-login-resend-by-address`, a new `verify-email` token, the mail) runs entirely in `after()`, and a limiter refusal or unavailability there is silent. Correct and verified: rehash if the parameters are old, then start a session | `200 {status:"signed-in", claimable:n}` / **`401 {status:"invalid-credentials"}` for an unknown address, a wrong password and a correct password on an unconfirmed account alike** (one body, one status). No `unconfirmed` or `resent` member exists |
| 4 | **Logout** `POST /api/account/logout` `{scope:"this-device"\|"everywhere"}` | Revoke this session, or every session of the account | `204`, the session cookie cleared (`Max-Age=0`, the same attributes, never `cookies.delete`, as `visitor.ts` explains [src]). No session: `204`, nothing done |
| 5 | **Who am I** `GET /api/account/session` | Read the session (fails open to anonymous) | `{state:"anonymous"}` or `{state:"signed-in", email, capabilities:[…]}` |
| 6 | **Forgot** `POST /api/account/password-reset/request` `{email, turnstileToken}` | Count the per-address buckets for **every** valid request, before any lookup. Then, **after the response** (`after()`): for a verified account, issue a `reset-password` token and mail the link; for an unknown or unverified address, do nothing. The request path before the answer is the same in every branch | **`202 {status:"check-inbox"}` always**, and a per-address `429` reads the same for every address |
| 7 | **Reset** `GET /[locale]/account/reset-password#t=<token>`, then `POST …/password-reset/complete` `{token, newPassword}` | Policy check. One transaction of two statements: (1) token valid (as in 2), set the hash and `password_changed_at`, mark the token used; (2) revoke **every** session of the account, in a fresh snapshot so a session a racing login committed while (1) waited is revoked too (L4a/L4b review F1). Queue a "your password was changed" mail | `200 {status:"password-changed"}`. **No session is started**; the client logs in. One `400 link-invalid` |
| 8 | **Claim** `GET /api/account/claim`, `POST /api/account/claim` | Requires a session (`401` without one), a verified **client** account holding `design.edit.own`, decided by capability (`isCapabilityHeld`; `isClientHolding` is gone) (`403` for an unconfirmed account or a staff role, L11 review F1) and a well-formed visitor cookie. The `GET` counts designs with `visitor_hash = $v and account_id is null`. The `POST` (the client's confirmation) runs one `update … set account_id = $a where visitor_hash = $v and account_id is null returning id` | `{claimable:n}` / `{claimed:n}`. No visitor cookie: `{claimable:0}` |

**Sessions** (D3):
- **Cookie:** `__Host-lemnaria_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
  - `Max-Age` is the role's **absolute** lifetime, set once at start and **never re-sent**.
  - The idle expiry is enforced on the server alone, through `last_seen_at`.
  - Why: a page render (a Server Component) can read a cookie but cannot set one [ven: Next's `cookies()`; L0
    re-reads it]. A cookie that slid only on some requests would be a second, partial clock.
- **Start:** "starting a session" always mints a new value. If the request carries a valid session value, that
  session is **revoked** once the new one is stored, so there is no fixation.
- **Touch:** `last_seen_at` is written **only in route handlers** (every editor save, the design probe
  `GET /api/designs/{id}`, `GET /api/account/session`), at most once an hour per session, which bounds writes. A
  page render reads the session and writes nothing.
- **Per-address buckets and enumeration:** in flows 1, 3 and 6, every per-address bucket is counted for every
  valid request **before** the account is looked up, so a per-address refusal is the same answer for every
  address.
- **Read failure:** a session read that fails reads as **anonymous**. That is less access, so it fails safe.
- **Defaults [inf, owner Q-L1]:** client 30 days idle, 90 days absolute. Operator and administrator 12 hours
  idle, 7 days absolute.

**Limiter policies** (D5).
- These are new `PolicyPurpose`s through `judgeStepsInSequence`. Each fails closed.
- Figures are **PROVISIONAL**, one constant each, as the house does (`limit-policy.ts`) [src].
- No e2e twins until the e2e round.

| Purpose | Subject | Figure / window |
| --- | --- | --- |
| `account-register-by-block` | network block | 5 / 60 min, 20 / 1440 min |
| `account-login-by-block` | network block | 30 / 60 min |
| `account-login-by-address` | `subjectOfAddress` | 10 / 15 min, **100 / 1440 min** (day figure raised from 30, `ACCOUNT_LOGIN_PER_ADDRESS_DAY_FIGURE`): **two fixed windows, not a growing back-off**, every valid attempt counted before the lookup. This is an **interim**. The owner's decision of 2026-10-18 (failure-only counting, growing delay, 100 / day ceiling; ADR 0169 D5, *Login throttling*) is **not built** and needs a design; see the `IMPLEMENTATION STATE` line and §12 *Review record* |
| `account-reset-request-by-block` | network block | 10 / 60 min |
| `account-token-complete-by-block` | network block | 20 / 60 min (confirm and reset completion; bounds the hashing cost) |
| `account-register-mail-by-address` | `subjectOfAddress` | 5 / 1440 min: the confirmation and already-registered mail of registration (purpose `register` only; a login's resend no longer counts here, L9 security review F1) |
| `account-reset-mail-by-address` | `subjectOfAddress` | 5 / 1440 min: the reset link (purpose `password-reset-request`; the "password changed" notice counts no bucket, L10 review L1). Apart from the registration bucket, so register traffic cannot use up a victim's reset budget (L8 security review F2) |
| `account-login-resend-by-address` | `subjectOfAddress` | 5 / 1440 min: a login's silent resend of the confirmation link (purpose `mail`), counted **only inside the `after()` job** and never answered from. Apart from the registration bucket, so signing in to an unconfirmed address cannot use up that address's registration budget (L9 security review F1, option a; owner-visible default) |
| `account-claim-by-account` | new `subjectOfAccountId` | 10 / 60 min |
| `design-save-by-account` | `subjectOfAccountId` | `SAVES_PER_CREDENTIAL_FIGURE` (300 / 60 min): the session twin of the write-credential bucket (ADR 0156) |

Together the three per-address mail buckets still protect the shared Gmail quota and a victim's inbox: at most 15 account mails a day to one address (5 registration, 5 reset, 5 login resend; the resend bucket is the L9 security review's F1, so up to 5 more mails a day per address than before it).

**What the per-address buckets allow, accepted [inf; that `account-login-by-address-day` and the three per-address mail buckets use
`utcMinutes(ACCOUNT_DAY_MINUTES)`, a fixed UTC day, is source-verified in `limit-policy.ts` and `utc-window.ts`]:** a stranger who solves 30 Turnstile challenges (100 since the interim raise of the day figure, 2026-10-18; each attempt is counted before the password is
looked at, so the victim's own correct password does not help) locks a victim's login until 00:00 UTC; the 10 per
15 minutes bucket only spreads those 30 attempts across at least three quarter-hour windows. The 15-minute figure alone would
cost the victim 15 minutes; the day figure is what makes it a day. Turnstile makes each attempt cost a solved
challenge, and the refusal reads the same for known and unknown addresses. A stranger's about 5 solved challenges also
use up the victim's reset-mail bucket (5 a day). **Owner decision 2026-10-18, after research (OWASP Authentication Cheat
Sheet, NIST SP 800-63B): login throttling moves to failure-only counting with a growing delay and a 100 / day ceiling.**
The reset-mail residual is not changed by it. What was built is in ADR 0169 D5's `IMPLEMENTATION STATE` line.

## 6. Variables and secrets the owner provisions

Add-only (`docs/best-practices/environments-and-resources.md`). No agent sets, reads or prints a value. Names go
in the repo-root `.env.example`, commented, with no value (wave L3).

| Name | Kind | Where | Absent or unusable |
| --- | --- | --- | --- |
| `TURNSTILE_SITE_KEY` | public widget key, read **on the server per request** and handed to the widget (not `NEXT_PUBLIC_…`, so nothing is fixed at build) | Production, Preview, Development; `apps/web/.env.local` | Account pages render "unavailable"; account `POST`s answer `503` |
| `TURNSTILE_SECRET_KEY` | **secret**, siteverify | same | Account `POST`s that need Turnstile answer `503` (fail closed) |
| `LEMNARIA_PUBLIC_ORIGIN` | exists (ADR 0165) | — | Register, resend and reset answer `503`: a link that cannot be written is not sent |
| `DIGEST_SECRET` | exists (ADR 0155) | — | Every account `POST` answers `503` (the limiter cannot key) |
| `GOOGLE_EMAIL`, `GOOGLE_APP_PASSWORD` | exist (ADR 0164) | — | Mail-sending flows answer `503` before any row changes |
| `LEMNARIA_E2E_FAKE_MAIL` | exists; the customer fake obeys it as the shop fake does | never on a deployment | — |

**Not needed, and why:**
- **A session secret:** sessions are random values stored hashed, and nothing is signed (ADR 0118: no variable
  nothing reads).
- **A pepper:** a pepper would be a second secret whose loss locks every account out. Argon2id's parameters are
  the defence.
- **An HIBP key:** the range API needs none [ven].

**Turnstile test keys.** Cloudflare publishes always-pass and always-fail keys [ven; L0 re-reads them]. The
owner may put them in `apps/web/.env.local` for development. The code logs one constant warning when it sees a
documented test secret, as `FAKE_SENDER_WARNING` does [src: `create-mail-sender.ts`]. M9's gate gains a line
(§10). **Amended 2026-10-18 (ADR 0169 D5, dated note):** a test secret is honoured only where the public origin is
a loopback one (which needs `LEMNARIA_E2E_FAKE_MAIL=1`); anywhere else the check answers `unavailable` and logs.

**The owner's Cloudflare step.** Create one Turnstile widget per environment's hostnames, in managed mode, and
copy its two keys into the variables above. Cloudflare becomes a processor, which the GDPR wave records.

## 7. The waves

Each wave has at most 5 items and about 5 production files. Copy catalogue files (`ro.json`, `ru.json`,
`ro.d.json.ts`) and docs are listed but not counted.

**Tier names follow `WORKFLOW.md`; this round has no QA step (D12).** "Full + security" means logic, clean-code
and security reviewers, in parallel, on a diff whose verification (§8) is green.

| Wave | Does | Depends on | Tier | Prod. files |
| --- | --- | --- | --- | --- |
| **L0** | Owner accepts ADR 0169; vendor re-reads; owner provisions Turnstile | — | Light (one security reviewer on the ADR) | 0 |
| **L1** | Migrations 0012–0015; runbook section | L0 | Full + security | 4 |
| **L2** | Domain: account fields, password policy, capabilities | L0 | Full | 4 |
| **L3** | Hashing, breach check, session cookie, Turnstile, account log; engines floor | L2 | Full + security | 5 |
| **L4a** | Account and e-mail-token store (port, Neon, fake) | L1 | Full + security | 4 |
| **L4b** | Session store (port, Neon, fake) | L1 | Full + security | 4 |
| **L5** | Limiter purposes, account subject, account judge | L0 | Full + security | 3 |
| **L6** | Session lifecycle, current session, `requireCapability` | L3, L4b | Full + security | 3 |
| **L7** | Customer mail port, Gmail factory, fake, account messages (+ copy) | L0 | Full + security | 5 |
| **L8** | Register and confirm routes | L4a, L5, L6, L7 | Full + security | 5 |
| **L9** | Login, logout, who-am-I | L8 | Full + security | 4 |
| **L10** | Forgot and reset | L8 | Full + security | 3 |
| **L11** | Claim, and mint-while-signed-in | L6, L1 | Full + security | 4 |
| **L12a** | Gate: read and resume by account | L11 | Full + security | 5 |
| **L12b** | Gate: save and share by account | L12a | Full + security | 5 |
| **L13a** | CSP for account pages, Turnstile widget | L8, L0's reads | Full + security | 3 |
| **L13b** | Register and confirm screens | L13a, **owner's screens** | Full + visual + security | 3 |
| **L14a** | Login, forgot and reset screens | L9, L10, L13a, **owner's screens** | Full + visual + security | 4 |
| **L14b** | Claim dialog, signed-in control (log out here or everywhere) | L11, L14a | Full + visual + security | ≤ 3 |

**Parallelism:**
- L2, L5 and L7 can run beside L1.
- L4a and L4b can run beside each other.
- Per-file ownership follows `docs/best-practices/agent-coordination.md`. `persistence/src/index.ts` is shared by
  L4a and L4b, so they **land in sequence**.

---

### L0 — Acceptance, vendor reads, owner provisioning (no code)

| # | Item |
| --- | --- |
| 1 | The owner accepts ADR 0169 (or amends it), and answers Q-L1–Q-L4 or takes the defaults (§11) |
| 2 | Vendor re-reads, quoted with URL and date: Turnstile client embed, the CSP it needs (`script-src`/`frame-src` host, behaviour under `'strict-dynamic'`), siteverify fields (`success`, `hostname`, `action`, `error-codes`), token lifetime and single use, the test keys, **the `hostname` siteverify returns for the test keys, and how per-deployment Preview URLs compare with the one Preview `LEMNARIA_PUBLIC_ORIGIN`** (this settles L3 item 4's hostname rule). Next's `cookies()`: where it may set a cookie. HIBP `range` endpoint and `Add-Padding`. Node 24 `crypto.argon2` stability index. The Node patch version Vercel deploys. Next 16 `after()` |
| 3 | The owner creates the Turnstile widgets and sets the two variables (§6) |
| 4 | The scribe writes the dated notes ADR 0169 owes (its *Records to annotate on acceptance*), the `decisions/README.md` row and `SUPERSESSIONS.md` |

**Reading:** this plan; ADR 0169; `OWNER_FIXES.md` *Fix 3*; ADR 0115, 0019 (d1, d5, d9, notes), 0114 d1–d6, 0154
d11, 0161 d1–d2. **Reviewer reading (security):** the same plus `security-headers.ts`, `cross-site-request.ts`.

**Acceptance.**
- ADR 0169 status reads *Accepted* with a date and the owner's words, or the amendments are recorded.
- Each [ven] fact used in §5 and §6 is replaced by a quotation, or the plan is corrected where a quotation
  disagrees.
- If `crypto.argon2` is marked *Experimental* in the Node 24 docs, the plan names the fallback (`crypto.scrypt`,
  N=2^17, r=8, p=1) and the owner chooses. The runtime emitted no `ExperimentalWarning` on 24.19.0 [run]; that
  is not the docs' word.

---

### L1 — Schema

| # | Item | File |
| --- | --- | --- |
| 1 | `accounts` | `packages/persistence/src/migrations/0012_create_accounts.sql` |
| 2 | `account_sessions` | `…/0013_create_account_sessions.sql` |
| 3 | `account_email_tokens` | `…/0014_create_account_email_tokens.sql` |
| 4 | `designs.account_id`, its check and index | `…/0015_add_design_account_id.sql` |
| 5 | Runbook section: ledger 11 → 15, column and constraint counts, the grants verbatim, `pg_default_acl` before the grant, the console seed of an administrator, and revoking an account's sessions after a role change | `docs/runbooks/applying-a-table-migration-and-its-application-role-grant.md` (docs) |

**Reading:** this plan §4; ADR 0169 D7, D10; ADR 0008 and its notes; ADR 0153 d1 (column grants); ADR 0020; ADR
0096 d5; `migration-safety.ts` (shapes and diagnoses); `0005`, `0006`, `0008`, `0010` (headers as templates); the
runbook. **Reviewer reading:** the same; security adds ADR 0019 d11.

**Acceptance.**
1. Every statement in the four files matches a shape in `ADDITIVE_STATEMENT_SHAPES` and no
   `DESTRUCTIVE_DIAGNOSES` entry. The reviewer names the shape per statement. Applying them changes no existing
   row.
2. Every file is re-runnable: a second application changes nothing.
3. No column, check or index in `0012`–`0015` stores a raw token, a raw cookie or a password. Every token column
   is a 64-hex SHA-256 check that refuses `''`.
4. No check constraint enumerates a value set that a later wave in §12 is known to extend (locale, purpose).
   `role`'s list is the owner's three, a stated exception.
5. The runbook's grants give `app_designs`: no INSERT or UPDATE on `role` or `created_at`; no UPDATE on `id`, `email` or
   `email_normal_form`; no DELETE, TRUNCATE or ALL on any of the three tables; nothing to PUBLIC; no WITH GRANT OPTION.
6. Header of every file: *apply before the code, before the grant*; the ledger before and after; frozen bytes.

---

### L2 — Domain rules (`packages/configurator-domain/src/account/`)

| # | Item | File |
| --- | --- | --- |
| 1 | `validateRegistration(input)`: e-mail through the contact e-mail rule; optional phone through `normalisePhoneNumber`; locale in the app's locales; notice version. Returns codes, never text | `account-fields.ts` |
| 2 | `judgePassword({password, email})`: NFKC first; 12–128 code points; not equal (case-insensitively) to the e-mail; **no composition rules, no trimming**. Codes `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `PASSWORD_IS_EMAIL`. The breach check is the server's (I/O) and adds `PASSWORD_BREACHED` | `password-policy.ts` |
| 3 | `CAPABILITIES` (closed): `design.read.own`, `design.edit.own`, `design.read.any`, `design.unhide`, `contact.read`, `contact.update-status`, `note.write`, `preset.create`, `preset.manage`, `price.edit`, `translation.edit`, `user.manage`, `audit.read`. `ROLES`: client = the two `.own` (only the client holds them); operator = `design.read.any`, `contact.read`, `contact.update-status`, `note.write`, `design.unhide`; administrator = every capability except the two `.own` ones [src: `capabilities.ts`, read 2026-10-18]. `hasCapability(role, capability)`; `isRole(text)` | `capabilities.ts` |
| 4 | The package's exports | `account/index.ts`, `src/index.ts` |

**Reading:** this plan §2 (D1, D2, D7); `OWNER_FIXES.md` *Fix 3* items 1, 8–12 and *Consequences*;
`contact/contact-fields.ts`, `contact/phone-number.ts`, `contact/input-checks.ts`; engineering-conventions *Code
and domain boundaries*. **Reviewer reading:** the same.

**Acceptance.**
1. For every string, `judgePassword` accepts exactly when NFKC(password) has 12–128 code points and is not the
   e-mail case-insensitively. A password of 12 spaces is accepted (length is the rule). 11 code points is
   refused, and so is 129.
2. A password is never trimmed, lower-cased or truncated by any domain function. The NFKC string is what is
   later hashed.
3. `validateRegistration` accepts an e-mail exactly when the contact rule does, and its normal form satisfies
   `isCountedFormOfAddress` (so the limiter's `subjectOfAddress` never throws on an accepted address).
4. Every role's capabilities are a subset of `CAPABILITIES`. client ⊂ operator ⊂ administrator. **No role holds
   a `design.edit.any`, and none exists** [owner Q-F3-4]. An unknown role string has no capability.
5. No module here imports I/O, `node:crypto`, Next or persistence (boundary).

---

### L3 — Server primitives (`apps/web/src/lib/server/account/`)

| # | Item | File |
| --- | --- | --- |
| 1 | `hashPassword(nfkcPassword)` → PHC string, argon2id from `node:crypto`: m = 19 456 KiB, t = 2, p = 1, 16-byte salt from `randomBytes`, 32-byte tag. `verifyPassword({password, phc})` parses the PHC string, recomputes with its own parameters, compares with `timingSafeEqual`. `needsRehash(phc)`. `DUMMY_PHC`, a fixed hash for the unknown-address path | `password-hash.ts` |
| 2 | `isBreachedPassword(password)`: SHA-1 the password; send only the first 5 hex characters to the HIBP range API with `Add-Padding: true`; compare suffixes locally; ignore padded entries (count 0). Deadline 1 500 ms. Unreachable or late answers `unknown` (Q-L2) | `breached-password.ts` |
| 3 | `__Host-lemnaria_session`: mint (32 bytes, base64url, 43 characters), set, clear, read-and-shape-check. The same attribute constant for set and clear, on `visitor.ts`'s model | `session-cookie.ts` |
| 4 | `verifyTurnstile({token, expectedAction, remoteIp?})`: reads both variables per call. `POST` to siteverify with a deadline. Requires `success`, `action === expectedAction` and a hostname matching `LEMNARIA_PUBLIC_ORIGIN`'s host. Answers `passed` / `failed` / `unavailable`. Logs one constant warning for a documented test secret | `turnstile-verification.ts` |
| 5 | `reportAccountEvent({event, outcome, policy?})`: a closed event list, no identifiers or values | `account-log.ts` |

Also: root `package.json` `engines.node` → `">=24.7 <25"` (tooling, not counted). Repo-root `.env.example` gains
the two Turnstile names (docs).

**Reading:** this plan §2 (D2, D3, D5), §5 *Sessions*, §6; ADR 0169 D2, D3, D5; ADR 0114 d1 (cookie
attributes) and `visitor.ts`; `write-token.ts`; `sha256-hex.ts`; `mail/create-mail-sender.ts` (the warning
pattern); `public-origin.ts`; ADR 0146 (nothing from a driver or vendor leaves); L0's vendor quotations.
**Reviewer reading:** the same; security adds ADR 0019 Alternative 1's reasons.

**Acceptance.**
1. `verifyPassword` answers true exactly for the password that was hashed, for any parameters the PHC string
   names. A PHC string that does not parse answers false and **does not throw**. A hash made with older
   parameters verifies, and `needsRehash` is true for it.
2. **The password, the NFKC form and the SHA-1 never appear** in any value returned, thrown or logged. Only 5
   hex characters leave the server.
3. The breach check never answers `breached` on an unreachable, late, non-200 or unreadable answer. It answers
   `unknown`.
4. The session cookie's set and clear emit identical attributes except `Max-Age`. Nothing calls
   `cookies.delete` on it. Its value is never put in a URL, body or log.
5. Turnstile answers `passed` only when siteverify said `success` **and** the action and hostname match. A
   timeout, a non-200, unreadable JSON or a missing variable answer `unavailable`. Nothing answers `passed` by
   default. **Amended 2026-10-18:** the only relaxation is a documented test secret beside a loopback public
   origin (`success` alone decides); a test secret anywhere else answers `unavailable` and logs. Response bodies
   (siteverify and HIBP) are read through `readUtf8BodyWithLimit`: 64 KiB and 512 KiB.
6. Measured on a Preview deployment (L0 item 2, a measurement and not a test): hashing time with the stated
   parameters is quoted. If p95 exceeds 300 ms, the remedy is **not** another OWASP row: those rows are
   equal-strength trade-offs of about the same cost [ven]. The remedy is a lower cost with the owner's recorded
   note, or scrypt. Locally it took 16.4 ms on 24.19.0 [run, a developer laptop, not the target].

---

### L4a — Account and e-mail-token store

| # | Item | File |
| --- | --- | --- |
| 1 | Port: `AccountStore`. `findByNormalForm`, `createUnverified`, `replaceUnverifiedRegistration`, `issueToken({accountId, purpose, tokenHash, expiresAt})`, `confirmEmail({tokenHash, accountId})` (one transaction: newest valid token, mark used, set verified), `completeReset({tokenHash, passwordHash})` (one transaction of two statements, READ COMMITTED: token, hash, `password_changed_at = clock_timestamp()`; then, in a fresh snapshot, revoke every session of the account, only for a token that transaction consumed), `replacePasswordHash` (rehash). Tagged results, never null | `account-store.ts` |
| 2 | Neon implementation: tagged-template `sql` only, `retryOnTransientFailure` with ids generated outside the retried callback (the `mint` rule), driver errors through ADR 0146's rule | `neon-account-store.ts` |
| 3 | In-memory fake with the same contract | `fake-account-store.ts` |
| 4 | Exports | `index.ts` |

**Reading:** this plan §4, §5 flows 1, 2, 6, 7; ADR 0169 D2, D10; `neon-configuration-repository.ts` (mint and
retry rules), `share-link-repository.ts` (transaction isolation, `issue`), `retry-on-transient-failure.ts`,
`open-application-database.ts`; ADR 0142, 0145, 0146. **Reviewer reading:** the same.

**Acceptance.**
1. A token works **once**, and only while it is the **newest unused, unexpired** token of its purpose for its
   account. A second `confirmEmail` or `completeReset` with the same token changes nothing and answers
   `invalid`.
2. `completeReset` is atomic: either the hash changed **and** every session of the account has `revoked_at`
   **and** the token is used, or nothing changed.
3. `replaceUnverifiedRegistration` never touches a verified account. Its predicate includes
   `email_verified_at is null`.
4. No statement writes `role`, `email`, `email_normal_form` or `id` after insert (the grant would refuse it;
   the code must not try).
5. A retried call after a lost acknowledgement inserts no second account and issues no second token.

**Notes from the L1 security review (2026-10-18), for this wave and L8.**
- **A duplicate e-mail raises `23505` whose `DETAIL` contains the address** (`Key (email_normal_form)=(…) already exists`).
  The store never logs, returns or rethrows the driver's text (ADR 0146's rule), and `createUnverified` maps the conflict to a
  tagged result with no address in it. L8 then answers a conflict with the same response as a fresh insert and in a similar
  time (both branches hash once), so the conflict is not an enumeration channel.
- **"Newest unused token" is not enforced by the schema.** The index orders by `created_at desc` but nothing supersedes an
  older unused token. Either `issueToken` marks every earlier unused token of the same account and purpose used in the same
  transaction (explicit supersede at issue), or the lookup takes a tie-breaker (`created_at desc, token_hash desc`) so that
  two tokens issued in one clock tick still have one winner. Pick one and test the two-in-one-tick case.

---

### L4b — Session store

| # | Item | File |
| --- | --- | --- |
| 1 | Port: `SessionStore`. `create({tokenHash, accountId, expectedPasswordHash, absoluteExpiresAt})` (a compare-and-set on the account's hash: `created`, `stale` or `refused`), `findLive(tokenHash)` → `{account: {id, role, emailVerified, email}, lastSeenAt}` or `none` (one statement joining `accounts`; filters revoked, absolutely expired, idle-expired by the role's idle lifetime passed in, and created before the account's `password_changed_at`), `touch({tokenHash, idleLifetimeSeconds})` (database only, never a cookie; only a session that is live by `findLive`'s whole test, and only if `last_seen_at` is older than the touch interval), `revoke(tokenHash)`, `revokeAllForAccount(accountId)` | `session-store.ts` |
| 2 | Neon implementation | `neon-session-store.ts` |
| 3 | Fake | `fake-session-store.ts` |
| 4 | Exports (after L4a) | `index.ts` |

**Reading:** as L4a; plus this plan §5 *Sessions*. **Reviewer reading:** the same.

**Acceptance.**
1. `findLive` never returns a session that is revoked, past `absolute_expires_at`, or idle past its role's
   lifetime. A role read is the account's **current** `role`, so a demotion takes effect on the next request.
2. `touch` writes at most once per interval per session, never extends `absolute_expires_at`, and never revives a
   session `findLive` would not return (idle-expired included): the idle test is in the write, not in a caller's earlier
   read (L4b/L5 security review F5, 2026-10-18).
3. `revokeAllForAccount` leaves no live session for that account, including the caller's.
4. `create` inserts only while the account's `password_hash` is still `expectedPasswordHash`, otherwise it answers
   `stale` and writes nothing (L4a security review F2, 2026-10-18): a reset or rehash that wins the race cannot be
   followed by a session bound to the hash it replaced. A reset that commits **while** the insert waits on the row lock
   answers no row, which reads `refused`, not `stale`. Callers (L8 `startSession`, L9) pass the hash they hold, and
   treat **every result other than `created`** (`stale` and `refused` alike) as a failed sign-in that holds no session.
5. A reset leaves no live session, including one a login created while the reset waited on the account row: the
   reset's second statement revokes in a fresh snapshot, and `findLive` additionally refuses a session created before
   `password_changed_at` (L4b/L5 security review F1, 2026-10-18). **Residual:** `password_changed_at` is evaluated
   before the reset's update waits on a share lock, so the `findLive` comparison alone would miss a login that began
   in that gap; the revocation is the rule and the comparison a second line. A request that read its session as live
   before the reset committed finishes its work under the old password.

---

### L5 — Limiter purposes for accounts

| # | Item | File |
| --- | --- | --- |
| 1 | The purposes and figures of §5's table, each a named constant marked PROVISIONAL | `rate-limit/limit-policy.ts` |
| 2 | `ACCOUNT_KIND` and `subjectOfAccountId(id)` (the id shape only), on the constructor-only model (ADR 0156) | `rate-limit/bucket-subject.ts` |
| 3 | Two stages, each through `judgeStepsInSequence`, each failing closed, a refusal or unavailability reported through `account-log.ts`: `judgeAccountBlock({purpose, headers})` (the network's buckets; common order step 4, before Turnstile; the purposes `register`, `login`, `password-reset-request`, `confirm-email`, `password-reset-complete`) and `judgeAccountSubject(ask)` (the address's or the account's buckets; step 7, after Turnstile and validation, before any account lookup). The subject ask is a union keyed by purpose: `register`, `login`, `password-reset-request` and `mail` **require** `address`, `claim` **requires** `accountId`; there is no optional-address path. `mail` and `claim` have no block stage; `confirm-email` and `password-reset-complete` have no subject stage | `rate-limit/judge-account-request.ts` |

**Reading:** this plan §5 *Limiter policies*; ADR 0155 (d1–d12), 0156 (subjects, writes fail closed), 0149;
`limit-policy.ts`, `bucket-subject.ts`, `enforce-rate-limit.ts`, `judge-block-bucket.ts`, `judge-share-write.ts`,
`refusal-of-write-limit.ts`. **Reviewer reading:** the same.

**Acceptance.**
1. No new policy shares a name with an existing one (`ALL_LIMIT_POLICIES` stays duplicate-free).
2. A request the limiter cannot judge (store failed, deadline, digester unusable, misconfigured source) is
   refused as unavailable. **No account write proceeds on an unjudged request.**
3. `subjectOfAccountId` accepts exactly the texts of an account id's shape and refuses every other. A design id
   has the same shape and would be accepted; what keeps an account key apart from every other key is the
   subject **kind**, which is digested with the text (`keyed-digest.ts`). Equal text under a different kind is a
   different key.
4. The subject stage is a route obligation after the block stage: it is asked only after the block stage allowed, and
   after Turnstile and validation, so a refused block, a failed challenge or an invalid body counts no address hit.
   **No bucket is counted twice:** `register` counts `account-register-mail-by-address` and `password-reset-request` counts
   `account-reset-mail-by-address` in their own subject stage, so their routes must not also call
   `judgeAccountSubject({purpose:"mail"})`. That one is for a route that sends a
   mail its flow did not count: `mail` is login's silent confirmation resend (it counts its **own** bucket,
   `account-login-resend-by-address`, so the registration bucket is counted only by `register`; decided in the L9
   security review, F1, which reversed the L8 review's choice of sharing the registration bucket). The "password
   changed" notice after a completed reset counts **no** bucket and has no purpose (L10 review L1, 2026-10-18): a
   completed reset needs a live token, which the reset request's bucket already bounds. The buckets are different from
   login's address buckets. The type system rejects a subject ask without its text; a cast that gets one through reads as
   unavailable.

---

### L6 — Session lifecycle and the RBAC seam

| # | Item | File |
| --- | --- | --- |
| 1 | `readCurrentSession(cookies)` → `{kind:"anonymous"}` or `{kind:"signed-in", accountId, role, capabilities, emailVerified, email}`. A failed read is anonymous. It never writes. A separate `touchCurrentSession` is called by route handlers only | `account/current-session.ts` |
| 2 | `startSession({response, accountId, role, expectedPasswordHash, presentedCookies})`: mint, store the hash (compare-and-set), set the cookie only on `started`, then revoke a presented live session (best effort). `endSession`, `endAllSessions` | `account/session-lifecycle.ts` |
| 3 | `requireCapability(session, capability)` → allowed, or one refusal value; the routes map it to `401` / `403` | `account/require-capability.ts` |

**Reading:** this plan §2 (D3, D7), §5 *Sessions*; L3's `session-cookie.ts`, L4b's port; ADR 0114 H1 (rotation
reasoning). **Reviewer reading:** the same.

**Acceptance.**
1. After `startSession`, the response carries a session value the request did not carry, and a valid value the
   request carried is revoked once the new session is stored (no fixation). A `stale` or `refused` start revokes
   nothing.
2. `requireCapability` allows exactly when `hasCapability(role, capability)` **and** the session is signed in.
   An unverified account holds **no** capability that touches designs.
3. No route or page decides access from anything the client sent except the session cookie. A role or
   capability in a body or header is never read.

---

### L7 — Mail to a customer

| # | Item | File |
| --- | --- | --- |
| 1 | `CustomerMailMessage {key, recipient, subject, text, html?}`, `isSendableCustomerMail` (one plain mailbox as recipient; otherwise the shop message's rules), `CustomerMailSender`. **`MailMessage` is unchanged** | `mail/customer-mail.ts` |
| 2 | `createGmailCustomerMailSender(configuration)`: the same transport rules (one attempt, the seven kinds, no `replyTo` / `cc` / `bcc` / headers / attachments), `to` = the message's recipient only | `mail/gmail-mail-sender.ts` |
| 3 | The fake records customer messages under the same flag | `mail/fake-mail-sender.ts`, `mail/create-customer-mail-sender.ts` |
| 4 | `buildAccountMail({kind, locale, link?})`. Kinds `confirm-email`, `already-registered`, `reset-password`, `password-changed`. Text and HTML from `messages/{ro,ru}.json` (namespace `accountMail`), links under `LEMNARIA_PUBLIC_ORIGIN`, the token **after `#`** | `mail/account-mail-messages.ts` (+ copy files) |

**Reading:** this plan §2 (D6), §5; ADR 0154 (d1–d12, especially d11 and its consequence *"a recipient is M8B's
change under its own review"*), 0164 (d2, d6, must-not list), 0165 (HTML and fallback); `mail-sender.ts`,
`gmail-mail-sender.ts`, `fake-mail-sender.ts`, `select-mail-sender.ts`, `plain-mailbox.ts`,
`lead-notification-html.ts`; engineering-conventions *Localised copy*. **Reviewer reading:** the same.

**Acceptance.**
1. **No code path can give the shop's `MailSender` a recipient**: `MailMessage` has no recipient member, and the
   shop adapter still writes `to: notificationAddress` alone.
2. A customer message with zero, two, or a display-name recipient (`Name <a@b>`), or with a comma, semicolon or
   angle bracket, is refused before any request.
3. The token appears in a mail **only** after `#` in the link. Never in the subject, the key or a header.
4. The idempotency key holds no address and no token: kind plus the token row's hash prefix, or a random value.
5. Every new copy key is in `ro.json`, `ru.json` and `ro.d.json.ts` in one commit. The Russian is a draft,
   never marked approved.

---

### L8 — Register and confirm

| # | Item | File |
| --- | --- | --- |
| 1 | `POST /api/account/register` (flow 1, common order; Turnstile action `register`) | `app/api/account/register/route.ts` |
| 2 | Orchestration of flow 1: policy, breach check, the three branches, hash in every branch, mail queued with `after()` | `lib/server/account/register-account.ts` |
| 3 | `POST /api/account/verify-email` (flow 2; block limiter; no Turnstile, since the token is the proof) | `app/api/account/verify-email/route.ts` |
| 4 | Orchestration of flow 2: token, password, the transaction, `startSession`, `claimable` count | `lib/server/account/verify-email.ts` |
| 5 | The closed answer set of every account route (status, body, headers) | `lib/server/account/account-responses.ts` |

**Reading:** this plan §5 (common order, flows 1–2); ADR 0169 D1–D6, D12; `api/designs/[id]/share/route.ts`
(order template), `api/contact-submissions/route.ts`, `read-body-with-limit.ts`, `cross-site-request.ts`,
`rate-limit/rate-limited-response.ts`; L2–L7 modules. **Reviewer reading:** the same; security adds OWASP's
authentication, registration and enumeration guidance (cited by section, from L0's reads).

**Acceptance.**
1. **For any address, a valid register request answers byte-identical status and body** whether the address is
   unknown, unverified or verified. Each branch hashes once and queues exactly one mail.
2. Registering an **unverified** address with a new password makes every earlier confirmation link stop
   working. **A verified account's hash, phone and locale are never changed by register.**
3. A confirmation succeeds only with the newest valid token **and** the account's current password. Any other
   case gets the one `link-or-password-invalid` answer and changes nothing. *Therefore a stranger who registers
   a victim's address cannot take the account:* the stranger's link reaches only the victim's inbox. If the
   victim then registers again, the stranger's password stops matching.
4. Every refusal before step 8 of the common order writes nothing and sends nothing.
5. A request whose Turnstile check fails or is unavailable never reaches input validation's side effects (no
   hash, no row, no mail).
6. **Every per-address bucket is counted for every valid request before the account is looked up**, so a
   per-address `429` is the same answer, at the same count, for an unknown, an unverified and a verified
   address.

**Note on acceptance 3 and `startSession` (L8 security review F4, 2026-10-18).** `startSession` creates the new
session first (the compare-and-set on the account's hash), sets the cookie only on `started`, and only then revokes the
session the request presented. Before, the presented session was revoked first, so a confirmation or sign-in that came
back `stale` or `refused` had already signed the client out of a good session. **Residual, accepted:** the revoke is
best effort. If it fails, the sign-in still succeeds, one `logout` / `unavailable` line is written through
`account-log.ts`, and the presented session stays live until it is revoked, idles out or expires; the new cookie
replaces it in this browser. A session an attacker had planted is a session the attacker already held; it is not a
way into the victim's new one.

**Accepted, low, owner-visible (L8 security review F3).** The three register branches differ in how many statements
commit before the response (the unverified branch also supersedes older tokens), a commit-cost variance far below the
argon2id time they all spend and below the network's own jitter. Not padded. If measurement ever shows it, move the
token work into `after()`; optional, later.

**Notes from the L1 security review (2026-10-18).** The `23505` on a duplicate address carries the address in its `DETAIL`:
never log or return driver text (see L4a). A conflict gives the same response and a similar response time as a fresh
insert. "Newest unused token" needs an explicit supersede at issue or a tie-breaker (see L4a); L8's acceptance 2 and 3 rest on it.

**Conditions from the L4a security review (2026-10-18).** Each is `register-account.ts`'s or `verify-email.ts`'s to
meet, and the reviewer checks them by reading:
- **Equal statement counts in the registration branches (timing).** The unknown, unverified and verified branches
  issue the same number of store statements, in the same order, or the register path is a single statement. The
  branches are padded to equal counts (a harmless repeat of a read where a branch would otherwise skip one) so that
  the response time does not tell a verified address from an unknown one. This is in addition to "each branch hashes
  once".
- **Verify the password against the account the token names, then confirm with that account's hash.** `verify-email.ts`
  takes the account from `findByLiveToken`, verifies the submitted password against **that account's**
  `passwordHash`, and passes that same hash as `verifiedPasswordHash` to **every** `confirmEmail` call (a retry
  included). It never passes a hash read from `findByNormalForm`, from the request, or from an earlier request.
  `confirmEmail` locks the account row (`for update`) and compares the hash under the lock, so a
  `replaceUnverifiedRegistration` racing the confirmation makes it answer `invalid`; that guarantee holds only when
  the hash passed is the one the password was verified against.
- **`startSession` after a confirmation** passes the same `verifiedPasswordHash` as `expectedPasswordHash` to
  `SessionStore.create` and answers **every result other than `created`** (`stale` and `refused` alike; a reset
  committing mid-insert reads `refused`) as `link-or-password-invalid`, not as a signed-in response, with no session
  and no cookie set.
- **Limiter calls (L5 review F2/F3), counted once.** The verify-email route calls `judgeAccountBlock` at step 4 only
  (purpose `confirm-email`, before the body is hashed or the token read). The register route calls
  `judgeAccountBlock` at step 4 (before Turnstile), then, after Turnstile and validation, `judgeAccountSubject`
  `{purpose:"register", address}` before any account lookup: that call **is** the `account-register-mail-by-address`
  bucket for the mail the branches queue, so the mail step must not count it again.
- **Known divergence, kept on the tests-owed list.** When two tokens of one account and purpose are issued in the
  same clock tick, the Neon store breaks the tie by `token_hash` (`(created_at, token_hash)` ordering) while the fake
  breaks it by `issueOrder` (the later issue wins). They agree whenever the clock moves between issues, which is the
  production case; they can disagree inside one tick. The live two-in-one-tick test in §9 (L4a/L4b) stays owed and
  must assert only what both stores guarantee (exactly one token is live), not which one.

**Conditions from the L7 security review (2026-10-18).** Each is the L8 caller's to meet, and the reviewer checks them
by reading:
- **The sender comes only from `createCustomerMailSender`.** No account flow builds a `CustomerMailSender` by hand or
  takes a shop `MailSender`. L7 makes the two non-interchangeable by type (`CustomerMailSender` carries
  `audience: "customer"`, so a shop sender is not assignable to it; both `send` members are properties, so a
  customer sender is not assignable to `MailSender` either [source-verified by a throwaway typecheck]) and by behaviour
  (the shop path, `sendableCopyOf`, refuses unsent any message with a `recipient` member of its own). The reviewer
  greps the account modules for `createMailSender` and for `MailSender` imports: there must be none.
- **The link's origin comes only from `readPublicOrigin(process.env)`.** `buildAccountMail` takes a branded
  `PublicOrigin`, which only `readPublicOrigin` makes, so the request's `Host`, `Origin` and `X-Forwarded-*` headers
  cannot reach a link. When it answers `unavailable`, the mail is not queued and the event is logged by kind only.
- **The `after()` job catches what the mail builders throw.** `buildAccountMail` throws `AccountMailLinkError` (a
  malformed origin or token) and, for a copy key missing from the messages, `IntlError`; `accountMailKey` throws
  `AccountMailKeyError`. The job catches all three, logs the event kind and outcome with no message text, and never
  lets one escape `after()` or change the response, which was sent before the job ran.
- **Token shape.** The e-mail token is `randomBytes(32).toString("base64url")`: exactly 43 characters, `[A-Za-z0-9_-]`.
  The generator in L8 emits that, the database stores its SHA-256 hex (64 characters) as `token_hash`, and
  `buildAccountMail` accepts only a 43-character token (`AccountMailLinkError` otherwise). `accountMailKey` is given
  the stored hash, or nothing when the mail has no token row; a hash that is given and malformed throws, and is never
  replaced by a random key.
- **The reset and verify pages clear the fragment and load no third-party script (L13).** On load each page reads
  `#t=<token>` and calls `history.replaceState` to drop the fragment before anything else runs; neither page loads a
  third-party script, frame or image (the Turnstile widget is on the pages that need a challenge, not on these two).
  Otherwise the single-use token reaches a third party's code or a later `Referer`-less navigation's history entry.
- **An e2e outbox reader is gated like the fake sender and never routable in production.** Any route, action or helper
  that reads the fake customer sender's `sent` list is enabled only by `LEMNARIA_E2E_FAKE_MAIL=1` (`FAKE_MAIL_FLAG` in
  `mail/fake-mail-flag.ts`, the fake sender's own flag, whose refusal beside a mail variable already exists), is absent from a production build, and has no path the
  production router can match. The reviewer checks that a production environment, with the flag unset, answers `404` for
  it and that it holds no code path to a real sender.
- **Unicode-domain addresses.** The customer port is ASCII-only (`asciiMailboxOf` accepts an ASCII domain, written as
  the transport writes it). An address with a Unicode domain is rejected upstream by `z.email()` (the domain's
  address check, `isCountedFormOfAddress` in `contact-fields.ts` [source-verified]; `a@münchen.de` fails and
  `a@xn--mnchen-3ya.de` passes, run against the installed zod), so it never reaches the port; L8 does not add a punycode conversion.
- **Accepted, owner-visible: account mail can spend the shop's Gmail quota (L7 review M2).** Account mail and the shop's
  lead notices leave through one Gmail account (~500 recipients a day, ADR 0164). The per-address and block buckets
  bound one address and one network, not the total, so many addresses can together use the day's quota and a lead
  notice is then refused as `quota-spent`. Not mitigated in L7. The two mitigations, for the owner to choose between
  (also §10 and Q-L4): (a) **a global daily ceiling on account mail**, set under the quota with headroom kept for shop
  notices, as one more limiter purpose in L8 (`account-mail-global`, a fixed subject, a UTC-day window, counted at the
  one point where an account mail is queued; a refusal at the ceiling reads as the same `202` for the caller, as the
  per-address refusal does); or (b) **a dedicated sending account** for account mail (Q62), which separates the
  quotas. Until one is done, the owner accepts that a flood of registrations can delay lead notices.

---

### L9 — Login, logout, who-am-I

| # | Item | File |
| --- | --- | --- |
| 1 | `POST /api/account/login` (flow 3; Turnstile action `login`) | `app/api/account/login/route.ts` |
| 2 | Orchestration of flow 3: dummy hash, rehash, unconfirmed resend, `startSession`, `claimable` | `lib/server/account/sign-in.ts` |
| 3 | `POST /api/account/logout` (flow 4) | `app/api/account/logout/route.ts` |
| 4 | `GET /api/account/session` (flow 5) | `app/api/account/session/route.ts` |

**Reading:** this plan §5 (flows 3–5, *Sessions*); ADR 0169 D3–D5; L6 modules. **Reviewer reading:** the same.

**Acceptance.**
1. An unknown address and a wrong password produce the **same status and body**, and both run exactly one
   argon2id verification.
2. **A correct password on an unconfirmed account answers the same `401 invalid-credentials` status and body as a
   wrong password and an unknown address** (ADR 0169 Amendment A). It does the same work before the response (one
   argon2id verification, the same lookup); the resend (limiter count, token insert, mail) runs in `after()`, and its
   limiter refusal is silent. No answer carries `unconfirmed` or `resent`. This closes the oracle in which an attacker
   registers a victim's address with a password of their own and then logs in with it (`unconfirmed` would tell an
   unknown address, now unverified, from a verified one).
3. A successful login sets a session value the request did not carry. A session cookie planted before login
   grants nothing after it.
4. After `logout {scope:"everywhere"}`, no session of the account is live, including the one that asked.
5. Logout via `GET`, cross-site, or without JSON changes nothing.

**Obligations from the L3 security review (2026-10-18).** Each is the route's or `sign-in.ts`'s to meet, and the
reviewer checks them by reading:
- **Order of the work.** The cross-site check, the limiter and Turnstile all run **before** `verifyPassword`.
  Argon2id is the most expensive thing the route does; nothing that has not passed the three may reach it.
- **A length cap before hashing.** The login route caps the password's length before it is hashed (the same upper
  bound registration applies), so an oversized body cannot be turned into argon2id work.
- **Normalise exactly as `judgePassword`.** Login applies NFKC to the password the same way `judgePassword` does at
  registration and reset; otherwise a user who registered with a composed character cannot sign in.
- **A platform failure is not a wrong password.** If `verifyPassword` fails for a platform reason (the `node:crypto`
  call throws, memory), the route answers a 503 and does not count it against the address as a wrong password,
  if feasible. If it is not feasible, `sign-in.ts` says so in a comment and the plan records the cost here.
  **Recorded cost (L9 security review F4, not feasible):** a hashing platform failure answers `503` but stays counted
  against the address buckets, because the limiter counts every valid attempt at step 7, before the lookup and before
  the password is looked at, by design; the count cannot be taken back once the hash is known to have failed.
- **Bind the session to the post-rehash hash (L4a security review F2).** `startSession` passes
  `SessionStore.create` the hash the account holds **after** any rehash: the new PHC string when
  `replacePasswordHash` answered `replaced`, the verified one otherwise. **Any result other than `created`** (`stale`:
  a reset or another rehash won the race; `refused`: which a reset committing mid-insert also reads as) is answered as
  a failed sign-in, never as a signed-in response, and starts no session and sets no cookie.
- **Limiter calls (L5 review F2/F3), counted once.** `judgeAccountBlock({purpose:"login"})` at step 4, before
  Turnstile; `judgeAccountSubject({purpose:"login", address})` at step 7, after Turnstile and validation, before the
  account lookup, so a per-address refusal is the same for every address. Only after a correct password on an
  unconfirmed account does the route call `judgeAccountSubject({purpose:"mail", address})` for the resend, **inside
  `after()`** and counting `account-login-resend-by-address` (its own bucket, L9 security review F1; never the registration
  bucket); a refusal or unavailability there sends no mail and changes no answer. The login's address buckets are not counted again. Logout and who-am-I call neither.

**L9 security review, 2026-10-18: reviewer defaults, applied while the owner is away. Owner-visible; each is a default
the owner may reverse (ADR 0169 Amendment A).**
- **F1: the login resend has its own bucket** `account-login-resend-by-address` (5 a day), purpose `mail`, counted only
  inside the silent `after()` job and never answered from. The registration bucket is counted only by `register`.
  Cost: an address can receive up to 5 more account mails a day (15, not 10).
- **F2: "everywhere" fails closed.** `readCurrentSessionOrThrow` does not swallow a store error; the everywhere path
  answers `503` when the session cannot be read. "This device" keeps failing open (it revokes only the presented
  cookie).
- **F3: a cross-site `GET /api/account/session` is answered but does not touch the session**, so another site cannot
  keep a session's idle clock running.
- **F4: a hashing platform failure answers `503` and stays counted** (see the obligation above).
- **F5: recorded as a later item in section 12** (the argon2 shape and the dummy hash).

---

### L10 — Forgot and reset

| # | Item | File |
| --- | --- | --- |
| 1 | `POST /api/account/password-reset/request` (flow 6; Turnstile action `reset`) | `app/api/account/password-reset/request/route.ts` |
| 2 | `POST /api/account/password-reset/complete` (flow 7) | `app/api/account/password-reset/complete/route.ts` |
| 3 | Orchestration of flows 6–7 | `lib/server/account/reset-password.ts` |

**Reading:** this plan §5 (flows 6–7); L4a's `completeReset`; ADR 0169 D2, D5. **Reviewer reading:** the same.

**Acceptance.**
1. The request answers the same for unknown, unverified and verified addresses. Mail goes only to a verified
   account, and only after the response.
2. A completed reset leaves **no live session** for the account and starts none. The token works once.
3. The new password passes the same policy as registration, breach check included. A refused password consumes
   no token.
4. **A per-address refusal of the reset request cannot tell a verified address from any other.** The buckets
   are counted for every valid request before any lookup. The token insert and the mail run after the response.
   So the status, the body and the counts before the answer are the same in every branch.

**Obligations from the L3 security review (2026-10-18).** The reset request and completion run the cross-site
check, the limiter and Turnstile before any lookup or hashing. The new password is NFKC-normalised and
length-capped by `judgePassword` before it is hashed (the same rules as L9's obligations above). A hashing
platform failure is a 503 and does not consume the token.
**Limiter calls (L5 review F2/F3), counted once.** The request route calls `judgeAccountBlock({purpose:"password-reset-request"})`
at step 4 and, after Turnstile and validation, `judgeAccountSubject({purpose:"password-reset-request", address})` before any
lookup: that call counts `account-reset-mail-by-address` for every valid request, known address or not, and the mail queued
after the response must not count it again. The completion route calls `judgeAccountBlock({purpose:"password-reset-complete"})`
at step 4 only (the token is the subject). Its "password changed" notice **counts no bucket** (L10 review L1, 2026-10-18; it first counted the reset bucket, which
let five reset requests in a UTC day leave no room for the notice): it is earned by a completed reset, so it is bounded
by completed resets, themselves bounded by the reset request's five tokens a day. The notice stays fail-silent: an
unavailable mailer, a stored address the policy no longer accepts or a failed send drops it, changes no answer, and is
written down without the address.
**Completion recovery (L10 review L2).** When `completeReset` throws, the route reads the account again; a stored
hash equal to the new `passwordHash` (random salt, so no one else's) means the transaction committed and the lost
acknowledgement was the failure, so the reset is answered `200` with the belt pass and the notice. Any other state, and
a failed read, answer `503` as before. The belt pass logs `session-revoke`/`unavailable` when it fails (distinct from the
completion's own outcome), and a failure of the lookup or token insert in the request job logs
`password-reset-request`/`unavailable`, apart from a mail failure.
A completed reset starts no session; the sessions a login creates concurrently are bound to the hash they verified
(L9's obligation, `SessionStore.create` is a compare-and-set), so a login that verified the old password cannot
outlive the reset.

---

### L11 — Claim, and minting while signed in

| # | Item | File |
| --- | --- | --- |
| 1 | `countClaimable(visitorHash)`, `claimVisitorDesigns({visitorHash, accountId})` (one statement, `account_id is null` in its predicate, `returning id`) | `packages/persistence/src/neon-configuration-repository.ts` |
| 2 | The fake repository's same | `packages/persistence/src/fake-configuration-repository.ts` |
| 3 | `GET` / `POST /api/account/claim` (flow 8), `requireCapability(design.edit.own)` (decided by `isCapabilityHeld`), a verified account | `app/api/account/claim/route.ts` |
| 4 | The mint stores `account_id` when the request has a signed-in, verified session holding `design.edit.own` (a client; decided by capability); otherwise exactly as today | `app/api/designs/route.ts` (+ `MintDesign` gains an optional `accountId` in the repository) |

**Reading:** this plan §5 flow 8, §2 (D8); ADR 0114 d3, H1 (rotation), ADR 0111 d1 (bodyless mint); `api/designs/route.ts`,
`visitor.ts`, `neon-configuration-repository.ts` `mint`, `mintStatements`. **Reviewer reading:** the same.

**Acceptance.**
1. A design with a non-null `account_id` is **never** changed by a claim, under any interleaving of two claims
   by two accounts from one visitor cookie. Exactly one account wins each design.
2. A claim changes `account_id` only. **`visitor_hash`, `write_token_hash`, `revision`, `updated_at` and
   `document` are unchanged**, so the claiming browser keeps working exactly as before.
3. **Route contract (reconciled with the code, L11 review F4).** No live session answers `401`; a session that is
   not a verified account holding `design.edit.own` (an unconfirmed account, or an operator or
   administrator, who do not hold it: ADR 0169 D7 revised 2026-10-18; decided by `isCapabilityHeld`) answers `403`; neither claims. For a verified client, a missing or malformed visitor cookie
   gives `{claimable:0}` / `{claimed:0}`. Sign-in and confirmation tell the client `claimable: 0` for any account that
   may not claim.
   **Staff do not claim and do not own by mint (L11 review F1, ADR 0169 Amendment B):** the claim route refuses a
   staff session, and a design a staff account mints is stored exactly as a visitor's (no `account_id`).
4. The `GET` changes nothing. The claim happens only on the client's `POST` (the confirmation, Fix 3 item 20).
5. The mint's bodyless contract, its limiter and its visitor rotation are unchanged. Signed out, the stored row
   is byte-identical to today's.

---

### L12a — The gate: read and resume by account

| # | Item | File |
| --- | --- | --- |
| 1 | `loadOwned({id, accessor})`. The accessor is `{visitorHash?, accountId?}`, at least one. Predicate `id = $id and (visitor_hash = $v or account_id = $a)` as one statement. `resume({visitorHash?, accountId?})` likewise | `neon-configuration-repository.ts` |
| 2 | The fake's same | `fake-configuration-repository.ts` |
| 3 | `loadOwnedDesign` reads the visitor cookie **and** the session. Refusal stays the one `unavailable` | `lib/server/load-owned-design.ts` |
| 4 | Resume at `/` and `/configurator/configure`: the most recently updated design the visitor **or** the signed-in account owns | `lib/server/visitor-resume.ts` |
| 5 | `GET /api/designs/{id}`: the same accessor; `canWrite` true for the owning account's session | `app/api/designs/[id]/route.ts` (GET half) |

**Reading:** this plan §2 (D9); ADR 0114 d4, d5, H2; `load-owned-design.ts`, `visitor-resume.ts`, the four
`[locale]/d/[id]/**/page.tsx` that call it, `api/designs/[id]/route.ts`, `contact/prepare-submission.ts`.
**Reviewer reading:** the same.

**Acceptance.**
1. For anyone who is neither the owning browser nor a session of the owning account, the answer for a claimed
   design is **identical** to a missing id's: page and API, status and body. A session of **another** account
   is "anyone".
2. A claimed design opens for its account's session on a browser with no visitor cookie and no write token.
3. An **unclaimed** design is still readable only by its visitor cookie. A session grants nothing on it.
4. A pre-`0005` row (no visitor, no account) stays unreadable by everyone.
5. The review, contact and done pages follow automatically through `loadOwnedDesign`. No page adds its own
   check. **The contact route follows too:**
   - it loads the design through the same function (`contact-production-ports.ts` → `loadOwnedDesign`) [src];
   - with no visitor cookie, it simply skips the per-visitor bucket (`judge-contact-request.ts:138`) [src];
   - so a signed-in client can send a claimed design from another device, and no contact file changes.

---

### L12b — The gate: save and share by account

| # | Item | File |
| --- | --- | --- |
| 1 | `saveAuthorized` takes a credential union `{kind:"write-token", hash}` \| `{kind:"account", accountId}`. The account arm's predicate is `account_id = $a`. Revision and retry rules unchanged | `neon-configuration-repository.ts` |
| 2 | `PUT /api/designs/{id}`: the write token if present; otherwise the session's account holding `design.edit.own` (a client); `isCrossSiteRequest` first for the session arm; limiter by `design-save-by-account` for that arm | `app/api/designs/[id]/route.ts` (PUT half) |
| 3 | The save judge accepts the account subject | `rate-limit/judge-save-request.ts` |
| 4 | Share `issue` / `revoke` / `status` accept the same union (account arm: `account_id = $a`) | `packages/persistence/src/share-link-repository.ts` |
| 5 | The share route reads the session when the cookies are absent | `app/api/designs/[id]/share/route.ts` |

**Reading:** this plan §2 (D9); ADR 0019 d1 (write half), d11; ADR 0114 B, C, G4; ADR 0156 (save buckets); ADR
0158 (lost update); `api/designs/[id]/route.ts`, `share/route.ts`, `share-link-repository.ts`,
`judge-save-request.ts`. **Reviewer reading:** the same.

**Acceptance.**
1. A save lands only for the design's write token or a session of its owning account. **A session never
   authorises a write to an unclaimed design**, nor to another account's.
2. A 409 is reported only to a caller whose credential matched (the existing order, `saveAuthorized`), for both
   arms.
3. A session-arm save sets no cookie (no write-token or visitor refresh).
4. A share link's plaintext is never returned except at issue (ADR 0114 B2). A session of another account
   cannot issue, revoke or read the status.
5. The write-token arm's behaviour is byte-identical to today's for every existing caller.

---

### L13a — The CSP for account pages, and the Turnstile widget

| # | Item | File |
| --- | --- | --- |
| 1 | The CSP admits Turnstile **only** on `/[locale]/account/*`: `frame-src` gains the Turnstile host there, and `script-src` relies on the nonce under `'strict-dynamic'` (per L0's read). Every other path's policy is byte-identical | `lib/security-headers.ts`, `proxy.ts` |
| 2 | Account pages answer `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: private, no-store` (the `SHARE_VIEW_HEADERS` pattern [src]) | `proxy.ts` |
| 3 | Turnstile widget (client): loads the script with the request's nonce; receives the site key as a prop from the server; hands a token to the form; resets after each submit | `account/turnstile-widget.tsx` |

**Reading:** this plan §2 (D4, D5), §6; ADR 0161 d1–d2; ADR 0169 D11; `security-headers.ts`, `proxy.ts`; L0's
Turnstile quotations. **Reviewer reading:** the same.

**Acceptance.**
1. The CSP of every non-account path is byte-identical before and after. On account paths only `frame-src` (and
   whatever L0's read requires) widens, by one named host.
2. The widget never renders without a nonce. A missing site key renders the "unavailable" state, never a widget
   with an empty key.

**Obligations from the L13a security review (2026-10-18), carried to L13b and L14a.** Item 2 above is amended:
`Referrer-Policy: no-referrer` is on `verify-email` and `reset-password` only; the other two headers are on all five
pages (ADR 0161 Amendment D).
- **M1, full document loads.** Every link into, out of and between account pages is a full document load (a plain
  `<a href>` or `location.assign`, not `next/link`), **or** the account family gets its own root layout through route
  groups. A client-side navigation does not re-run `proxy.ts`, so the per-path CSP and headers would not apply: the
  Turnstile frame would be blocked on the challenge pages, or the third-party script would carry over to the
  verify and reset pages. L13b and L14a each check every link they add.
- **M2, a real site key.** Turnstile is verified on a Preview deploy with a real site key; Cloudflare's test keys
  cannot show a `Referer` problem. Recorded as launch-gate line 5 below.
- **L3, encoded segments.** Once the pages exist, request percent-encoded static segments (`/ro/%61ccount/login`)
  against a built server; any account path whose segments differ once decoded answers `404`, as the locale segment
  already does.
- **L13b decides the locale prefix of e-mailed links.** An unprefixed `/account/*` is not locale-routed; L13b states
  whether every e-mailed link must carry the locale prefix and tests the builder to match.
- **Evidence gap.** The Turnstile CSP facts are implementer-cited (Cloudflare docs, May 2026), not L0-verified (ADR 0161
  Amendment D).

### L13b — Register and confirm screens (needs the owner's screens)

| # | Item | File |
| --- | --- | --- |
| 1 | Register screen: the fields, the password rules shown, the phone labelled "unverified" (wording from the mock-up), the notice link, the `check-inbox` state | `app/[locale]/account/register/page.tsx`, `account/register-form.tsx` |
| 2 | Confirm screen: reads `#t`, asks for the password, posts, then opens L14b's claim dialog when `claimable > 0` | `app/[locale]/account/verify-email/page.tsx` |
| 3 | Copy (ro source, ru draft) | messages (not counted) |

**Reading:** the owner's mock-ups for these screens (to be named on hand-over); ADR 0104 (mock-ups are the
chrome spec); engineering-conventions *UI and content*, *Localised copy*; `browser-and-visual-qa.md`; flows 1–2.
**Reviewer reading:** the same; the visual reviewer adds the mock-up files.

**Acceptance.**
1. No client code reads `document.cookie` for the account, and no account value is in `localStorage` or
   `sessionStorage`.
2. The confirmation token never leaves the fragment except in the `POST` body. It is cleared from the address
   bar (`history.replaceState`) after reading.
3. Every visible string comes from the catalogue, in both locales.

### L14a — Login, forgot and reset screens (needs the owner's screens)

| # | Item | File |
| --- | --- | --- |
| 1 | Login screen. It has one failure state: copy of the form "if your details are right, check your inbox" (no `unconfirmed` state, ADR 0169 Amendment A) | `app/[locale]/account/login/page.tsx`, `account/login-form.tsx` |
| 2 | Forgot and reset screens (the reset page reads `#t` as the confirm page does) | `app/[locale]/account/forgot-password/page.tsx`, `app/[locale]/account/reset-password/page.tsx` |
| 3 | Copy | messages (not counted) |

**Reading and reviewers:** as L13b; plus flows 3, 6, 7.

**Acceptance.**
1. L13b's criteria 1–3, for these pages.
2. The forgot screen shows one "check your inbox" state whatever the server knows about the address.

### L14b — The claim dialog and the signed-in control (needs the owner's screens)

| # | Item | File |
| --- | --- | --- |
| 1 | The claim dialog: "Attach N kitchens made in this browser?", confirm or not now; never blocks | `account/claim-dialog.tsx` |
| 2 | The signed-in control (log out here, log out everywhere), in the place the mock-up gives it | at most two files, named at hand-over |
| 3 | Copy | messages (not counted) |

**Reading and reviewers:** as L13b; plus flows 4, 5, 8.

**Acceptance.**
1. The claim dialog appears only when `claimable > 0`, sends the claim only on the client's confirmation, and
   never appears on load of a design or on Step 1.
2. "Log out everywhere" states that every device is signed out.
3. A session that expires mid-use shows the mock-up's "session expired" state. Unsaved edits stay in the
   editor's state, so no edit is lost.
4. **The claim calls answer `401` (no session) and `403` (not a verified client), L11 review F4.** The dialog and its
   caller handle both without an error screen: `401` is the "session expired" state, `403` shows no dialog.
5. **The dialog says what is attached (L11 review F1 residual):** the count, the dates and thumbnails of the kitchens, not
   a bare number, because the first claimer keeps a design on any device and nothing can unclaim it yet.

---

## 8. Verification in a round without tests

**What replaces QA (D12).** Per wave, the implementer and then the coordinator run these, and quote the exit
codes via `rtk proxy` (R9):

- `pnpm format:check` (whole tree)
- `pnpm gate:boundary`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm --filter @lemnaria/web build`, for web waves

None of these is a test. **Reviewers are dispatched on a diff whose verification is green**, instead of
"QA green". The review tier is kept; security review is on every code wave (Fix 3 item 7).

**Optional manual walk** (scratch, not committed, quoted in the close-out; the owner may waive it):
- the coordinator runs `next dev` with the fake mail flag and Turnstile's test keys, against the preview database
  after the owner applied `0012`–`0015` and the grants there;
- it walks flows 1–8 with `curl` or the browser.

Rules for the walk:
- **The brief bans deleting rows and printing variables, by name**
  (`environments-and-resources.md`). Accounts it creates stay.
- It is not evidence that any acceptance criterion holds under all inputs. Only §9's tests will be.

**What this round costs, stated so nobody is surprised:**
1. **No push.** `.githooks/pre-push` runs `pnpm ci:local`, which runs the suites. Several existing tests will be
   red (§9 a). The branch stays local until the test round, unless the owner rules otherwise.
2. **No production grant.** The runbook proves a grant with `application-role-privileges.test.ts`.
3. **No acceptance criterion above is verified** except by review reading. Each is a test owed.
4. **The milestone cannot close.** WORKFLOW step 7's test audit has nothing new to audit.

## 9. Tests owed (the next round)

**(a) Existing tests this round will turn red, to update, never delete** (ADR 0152):
- `apps/web/tests/i18n/catalogue-parity.test.ts`, the copy lock
  (`tests/support/approved-romanian-messages.ts`, `romanian-copy-lock.test.ts`), and
  `golden-output-hashes.ts` / `golden-output.test.ts`, for every new key (L7, L13b, L14a, L14b).
- `packages/persistence/tests/application-role-privileges.test.ts`: new arms for `accounts` (the column grants,
  and "cannot update `role`"), `account_sessions` and `account_email_tokens`.
- Any test pinning the CSP string (L13a), the closed policy-name set (L5), the migration count or ledger (L1),
  `MintDesign`, `saveAuthorized`, `loadOwned` signatures (L11, L12), and the bucket-subject kinds (L5).
- The `designs` row source and backup tests, if they pin the column list (they should not change: `account_id`
  is not exported, D10).

**(b) New tests owed, one per wave's acceptance:**
- **L2: properties (`fast-check`).**
  - `judgePassword` over random Unicode, the 11/12 and 128/129 code-point boundaries, NFKC-equivalent pairs.
  - Every role's set ⊂ `CAPABILITIES`, and inclusion client ⊂ operator ⊂ administrator.
  - `validateRegistration` agrees with `isCountedFormOfAddress`.
- **L3.**
  - Hash/verify round trip; old-parameter verify plus `needsRehash`; a malformed PHC does not throw.
  - Breach check against a recorded fake answer, including padding, timeout and non-200.
  - Turnstile: every siteverify shape.
  - Session cookie attributes on set and clear.
  - Recognisable fakes (`PASSWORD-CANARY-…`) never appear in a log, error or response.
- **L4a/L4b (live, test database).**
  - Single-use and newest-only tokens.
  - Atomic reset; an interleaving of two `confirmEmail` calls.
  - A login's `create` holding the account row `for share` while a reset runs: the session it commits is revoked
    (the reset's second statement); a retry of a committed reset revokes no session made since; `touch` of an
    idle-expired session writes nothing; `findLive` refuses a session created before `password_changed_at`.
  - `findLive` at each expiry boundary.
  - A demotion read on the next call.
  - A retry after a lost acknowledgement.
  - `SessionStore.create` with a stale `expectedPasswordHash` answers `stale` and writes nothing; one with the
    current hash answers `created`; a reset or rehash racing a create leaves no live session under the old hash.
  - `confirmEmail` racing `replaceUnverifiedRegistration`: the account is never verified under the replacing
    password (the L4a F1 lock).
  - **Known divergence:** the same-tick tiebreak (Neon `token_hash`, fake `issueOrder`); assert exactly one live
    token, not which.
- **L5.** Unique names; fail-closed on each unavailable cause; the subject stage is a separate call, so a refused
  block counts no address hit and no bucket is counted in both stages; a subject ask without its address (or
  account id), reached by a cast, reads as unavailable.
- **L6.** Fixation: a planted value revoked and replaced. `requireCapability` truth table.
- **L7.** Recipient refusals; the shop `MailMessage` type has no recipient (a type-level test); the token only
  after `#`; parity of keys.
- **L8–L10 (route, with fakes).**
  - **Enumeration equality:** byte-identical bodies for unknown, unverified and verified, and one hash per
    branch.
  - The squatting scenario of L8 criterion 3.
  - Every refusal of the common order writes and sends nothing.
  - Logout everywhere.
  - **L9 review defaults.** The login resend counts `account-login-resend-by-address` and never the registration
    bucket (and `register` never counts the resend bucket); "everywhere" answers `503` when the session read fails and
    "this device" still answers `204`; a cross-site `GET /api/account/session` answers but writes no `last_seen_at`.
  - Reset revokes all.
- **L10 review (route, with fakes).** `completeReset` throwing after the hash was stored answers `200` with the belt pass and
  the notice; throwing with another hash stored answers `503`; the notice counts no bucket and a stored address the policy
  refuses logs `mail`/`refused`; a belt failure logs `session-revoke`, not `password-reset-complete`.
- **L11 review (route, with fakes).** A staff session answers `403` on both claim methods and its mint stores no
  `account_id`; sign-in and confirmation tell a staff account `claimable: 0`. **The fakes' `mint` ignores `accountId`**
  (L11 review F7, which named `FakeConfigurationRepository.mint`; that class has no `mint`, the repository doubles of the
  `apps/web/tests/app/api/designs/` route tests do, e.g. `write-authorization.adversarial.test.ts`, whose `mint` destructures `design`, `writeTokenHash` and `visitor` only): a route test of mint-while-signed-in on a double proves nothing about
  the stamp until it stores it, and the stored `account_id` is proved by the live arm below.
- **L11 (live).**
  - Two concurrent claims of one visitor's designs by two accounts: each design once.
  - The claim changes `account_id` only.
  - The mint, signed out, is byte-identical.
- **L12a/b (route plus live).**
  - The refusal-equality matrix (owner browser, owning account, other account, no credentials, missing id).
  - Session saves only on claimed designs of the account.
  - The 409 order; the share arms.
- **L12b (route plus live; the stale doubles and the untested arms).**
  - **Doubles that compile but do not exercise the account arm:** the `saveAuthorized` fakes of the
    `apps/web/tests/app/api/designs/` route tests refuse any credential that is not `kind: "write-token"`, and
    `share-link-route.test.ts`'s fake authorises the write-token pair only; the `freshJudge` adapter of
    `judge-save-request.test.ts` wraps a bare hash as a write-token credential, so no case counts `save-by-account`; the
    persistence live suites reach the share repository through `tests/support/flat-share-repository.ts`, an adapter
    for the old flat call shape, not a test.
  - Owed: a session save lands for the owning account's claimed design and is a `403` for an unclaimed design, another
    account's and an unknown id (one body); a cross-site session save is that `403` and reads no session; the 409
    arrives only after the account predicate matched; the account arm's lost-acknowledgement retry (`landed`) answers
    success, not a conflict; a session save sets no cookie of any kind; `canWrite` and the save path agree for every
    (token cookie, session, ownership) combination, the known divergence being a present-but-wrong token cookie on an
    owner's signed-in browser (`canWrite: true`, save `403`); share issue, revoke and status by account, with another
    account's session refused identically; the account arm of `issue` has no retry relaxation.
- **Refusal-matrix doubles (L12a review I2, 2026-10-18).** The doubles for the L12 refusal matrix must model **both**
  access arms, visitor / write-token and account, with null semantics (a missing or unmatched credential reads as
  `null`, as the real repositories do). The double in
  `apps/web/tests/app/api/designs/qa-7e3b-owner-gate.adversarial.test.ts` would pass a bypass if reused, so it is not
  to be reused for the matrix.
- **L13a–L14b (e2e and visual).**
  - Register → confirm → claim → open on a second browser context with no visitor cookie.
  - CSP unchanged off account paths.
  - The fragment cleared.
  - Turnstile in test-key mode.
- **M9's launch gate lines (§10)** in `gate:launch-placeholders`.

## 10. Risks

| Risk | Consequence | Response |
| --- | --- | --- |
| **No tests this round** | A rule implemented plausibly and wrongly passes review | Security review on every wave. §9 lists the owed tests by criterion. The milestone stays open |
| **One Gmail quota for the shop notice and account mail** (~500 recipients/day for a consumer account, [doc: ADR 0164, owner-brief figure]) | A forgot-password flood starves lead notices | the three per-address mail buckets (5/day each), the block buckets, Turnstile. Q-L4: a dedicated sending account (Q62). M9 picks a provider |
| **Three mail buckets per address** (`account-register-mail-by-address` for registration, `account-reset-mail-by-address` for the reset link (the "password changed" notice counts none, L10 review L1), `account-login-resend-by-address` for a login's silent resend; 5 a day each; L8 security review F2, L9 security review F1) | **Owner-visible [inf].** A stranger who registers a victim's address five times in a UTC day (each costs a solved Turnstile challenge) uses only the registration bucket, so the victim's reset mail still has its own five. The same stranger can still use the reset bucket by requesting resets five times, and the victim's own reset mail is then refused until 00:00 UTC; the refusal reads the same for every address, so it cannot be used to probe accounts. An address can receive up to fifteen account mails a day (the login resend bucket adds up to five over the L8 split; L9 security review F1), plus at most five "password changed" notices, one per completed reset (L10 review L1) | A single shared bucket was the first design; the split closes registration noise starving a reset, and the third bucket closes sign-in attempts on an unconfirmed address starving a registration's mail. Reset-on-reset starvation remains and is accepted; a per-address figure change is constants, not code. Q-L5 |
| **Account mail can spend the shop's whole Gmail quota** (L7 security review M2) | **Accepted, owner-visible [inf].** Many addresses, each within its own buckets, can together use the day's ~500 recipients, and a shop lead notice is then refused (`quota-spent`, not retried automatically). Each account mail costs a solved Turnstile challenge, which bounds the rate and not the total | The owner chooses: (a) a **global daily ceiling on account mail** that leaves headroom for shop notices, as an L8 limiter purpose (see the L8 conditions), or (b) a **dedicated sending account** for account mail (Q62). Not done in L7 |
| **Deliverability** of verification mail from a Gmail address | Mail in spam; a client cannot confirm | Recorded with the trigger *"the owner sees a confirmation not arrive"*. M9's provider choice |
| **Turnstile is a third party in the login path** | Cloudflare down means no login | Fail closed (Q-L3). Recorded as accepted. It is not a proxy, so ADR 0019 d9's reasons do not apply (D11) |
| **HIBP unreachable** | Breached passwords accepted during an outage | Q-L2 default fail-open with the length rule; logged |
| **Shared computer** | After logout, that browser's visitor cookie still opens designs made in it, as ADR 0114 already allows; a claimed design is opened by that cookie too | Recorded residual. A later "forget this browser" control can clear the visitor cookie. Personal data is not in designs (contact data is separate, ADR 0153) |
| **Migration numbering vs M8C** | Sequence error at merge | Merge after M8C or renumber before first apply (§0) |
| **`designs.account_id` without FK** | A stale id after a hand-deleted account | Code and erasure order. Shape check. Accepted (`0008` precedent) |
| **Argon2 on the deployment target** | Too slow or too fast | L3 criterion 6 measures; parameters live in the PHC string |
| **`crypto.argon2` stability** | If marked experimental, an API change in a 24.x patch | L0 reads the docs; fallback scrypt is named. **Read 2026-10-18 [doc: fetched]:** not experimental, added v24.7.0, no warning on local 24.19.0 [run]. The open risk is the Vercel patch level (launch gate 6; ADR 0169 Amendment D) |
| **Screens not yet designed** | L13b, L14a, L14b wait | Server waves do not depend on them. The owner's own order puts design first |
| **A claimed design cannot be taken back** (L11 review F1) | **Owner-visible [inf].** Whoever claims first keeps the designs on any device, and a visitor cookie's rotation does not revoke a claim already made; there is no unclaim. A client who claims from a shared computer attaches that browser's designs to their account for good | Recorded residual. A later wave gives staff a reassign / unclaim control. L14b's dialog shows what is attached (count, dates, thumbnails) so the person knows before confirming |
| **A staff account is a visitor for designs** (L11 review F1) | **Owner-visible [inf].** An operator or administrator who browses the configurator is not stamped on the designs they mint, and cannot claim; their designs are reachable by their visitor cookie only | Decided by default: claiming and mint ownership are the `client` role's. Staff reading any design is the `design.read.any` wave (D9) |
| **`designs.account_id` links a lead to an identified account** (L11 review F2) | **Accepted [inf].** `contact_submissions.design_id` and `designs.account_id` are both readable by the application role, so a lead can be joined to the account that owns the design. Contact data stays unreadable (ADR 0153 d1) | Accepted risk, recorded as a dated note in ADR 0153 (2026-10-18) |
| **Migration `0015` must be applied wherever this code runs** (L11 review F3) | The mint of a signed-in verified client inserts `account_id`; on a database without `0015` that mint fails, though a signed-out mint still works | Apply `0012`-`0015` in **every** environment that receives this code, **preview included**, before it is deployed there. M9 launch-gate line 2 already covers production |
| **A write-token cookie, even a wrong or planted one, beats a valid owner session on save and share** (L12b security review L1, 2026-10-18) | **Owner-visible, accepted, Low (availability).** `saveCredentialOf` and `shareCredentialFor` (`apps/web/src/app/api/designs/[id]/route.ts`, `share/route.ts`) choose the token arm whenever a token cookie is present. A same-site sibling origin that knows a design id can plant junk and stop a signed-in owner saving or sharing that design on that device for 30 days. `GET` still says `canWrite: true`. Nothing is exposed; the owner can clear the cookie | Accepted. **Optional mitigation, not shipped, and not to be built before the refusal matrix of §9 exists:** when the token arm raises `DesignWriteForbiddenError` and the request is same-site with an editing session, run the account arm once (a `409` from the token arm wins; the limiter counts once; the same for share) |
| **Victim lockout by solved challenges** (2026-10-18) | **Owner-visible.** As first built, 30 solved Turnstile challenges lock a victim's login until 00:00 UTC and about 5 block their reset mail | Login throttling changes to failure-only counting, growing delay, 100 / day (ADR 0169 D5; state of the build on its `IMPLEMENTATION STATE` line). The reset-mail bucket is unchanged: residual stays |
| **Promoting a client strands the designs it claimed** (2026-10-18) | The runbook's administrator seed promotes a client; staff no longer hold `design.read.own` / `design.edit.own`, so its claimed designs stop opening through the account arm (their `account_id` is untouched) | Recorded residual (ADR 0169 D7). The staff-management wave decides how promotion treats them |
| **A restore loses accounts and un-claims designs** (2026-10-18) | The design export omits `account_id`; there is no accounts export | M9 launch-gate line 7: the accounts backup (QP5) before any real account exists |
| **Turnstile consent and Cloudflare as a processor are unrecorded** (2026-10-18) | OWNER_FIXES item 17 is not met | Deferred; trigger *before any real user*. M9 launch-gate line 8 |
| **Account e-mail is readable by the application role** (unlike contact data, ADR 0153 d1) | A leaked `DATABASE_URL` leaks account e-mails | Needed to sign in and to send. Recorded in D11 with the alternative (encryption at rest) and its trigger |

**M9 launch-gate lines this plan adds:**
1. The production `TURNSTILE_SECRET_KEY` is the real widget's: the owner checks the widget's analytics after
   one real login.
2. Migrations `0012`–`0015` are applied and their grants proved by the privilege test.
3. The account endpoints are under the WAF scope.
4. The privacy-notice text is the owner's, not a placeholder.
5. Turnstile has been loaded and solved on a Preview deploy with a **real** site key on register, login and the reset
   request, with no `frame-src` or `Referer` failure in the console or the CSP report table (L13a review M2).
6. **Before applying `0012` in any environment (preview first):** the owner confirms the Vercel runtime is Node >= 24.7
   (`node -v` in a build log, or log `process.version`). Vercel publishes only "24.x"; the patch is not documented
   [doc: fetched 2026-10-18]. The argon2id-only check cannot be dropped. Owner decision: change `engines.node` from
   `>=24.7 <25` (in force at HEAD since L3) to the documented form `24.x` and add a runtime guard (ADR 0169
   Amendment D). Not yet decided.
7. **The accounts backup (QP5)** exists and a restore of it has been rehearsed before any real account exists. A
   restore of the design export alone returns designs unclaimed and no accounts (ADR 0169 Consequences).
8. **The Turnstile consent decision and the Cloudflare processor entry** exist (ADR 0169 Consequences).

## Review record (written 2026-10-18)

- **Security review ran** on L1, L3, L4a, L4b+L5, L7, L8, L9, L10, L11, L12a, L12b and L13a; the reports were acted on
  (their findings are in §10 and ADR 0169 and its amendments).
- **The planned logic and clean-code reviews had NOT run** at the time this note was first written; results are appended
  below (2026-10-18).
- **Logic and clean-code review have now run** (two of each, split `packages/` and `apps/web/src`). **No blockers.**
  Waves have now had security, logic and clean-code review, **all by reading only; nothing has been executed.**
  - **Fixed** (a developer is applying these; confirm each in the diff, not here): `touch` on save and probe;
    the `queueAccountMail` guard; dead-code removal; widget retry; fake tie-break parity; fake role seed; the cheap
    clean-code items.
  - **Deferred as follow-ups:**
    - Shared `queryRows` helper across the 5 stores.
    - The "newest live token" SQL predicate is written 3 times.
    - The route skeleton is duplicated in 5 POST routes.
    - The `after()` wrapper is repeated.
    - `completeReset` is too long.
    - Comment trimming beyond the cheap pass.
    - Split `reset-password.ts` into request and complete.
    - Error-name field in `answerUnavailableOnFailure`.
    - Fakes for `loadOwned`, resume, and account-arm save/share by account are owed; plan items that say "the fake's
      same" are stale.
    - `privacyNoticeVersion` is now validated against the closed list `PRIVACY_NOTICE_VERSIONS = ['2026-10-draft']`
      (code `UNKNOWN_NOTICE_VERSION`); persistence keeps the shape check. **Owner flag** stands: the single entry is a
      placeholder until the notice text is published.
    - **Login throttling: the true failure-only back-off is unbuilt (needs a design).** Built is an interim: the per-address
      day figure 30 to 100. The store only increments (`recordHits`, `totalsOfWindow`; no per-key read, no reset),
      counting happens before judging, and windows are fixed per policy, so each delay tier is its own policy. Needs:
      (1) `readCounts` without incrementing in the Neon and fake stores; (2) sign-in split into check-before-verify and
      record-on-any-failure, recorded identically for unknown, wrong, refused and unconfirmed (enumeration rule);
      (3) reset on success (a reset port or a success-epoch in the key); (4) a decision on the check/record race and
      the `503` hash-failure path; (5) the `sign-in.ts` header updated. Owner: the coordinator assigns a wave; no
      owner decision is outstanding (ADR 0169 D5). `docs/backlog/open.md` was not used: it holds observed product
      behaviour, and engineering deferrals live here and in STATUS.
    - The fake and Neon same-tick token tie-break differs; on Neon it is a coin flip.
    - The confirm page copy must say "if you already confirmed, sign in".
    - A login resend invalidates the first mail's link (by design).
    - E-mailed links 404 until L13b/L14a create the pages and decide the locale prefix.
    - The e2e outbox is unreachable (the factory builds a fresh fake); it needs a flag-gated singleton.
  - **Highest-risk UNEXECUTED SQL, to run first in a live run:**
    1. Session create: `INSERT … SELECT … FOR SHARE OF a ON CONFLICT` inside a CTE.
    2. `confirmEmail`: the locked CTE with `FOR UPDATE`.
    3. `completeReset`: two statements relying on `now()` and snapshot assumptions.
    4. The union-all resume query.
    5. The `->> a.role` lookup.
- The waves are **not yet through the planned review tier with executed evidence** (`docs/WORKFLOW.md`).
- **Deviation from the no-tests rule (ADR 0169 D12).** Developers ran vitest twice: in L7 (`tests/lib/server/mail` and
  `tests/i18n`, 5 failures) and in L1 (`migration-files` and `migration-safety`, 3 failures, from the missing `0011`).
  Roughly 50 existing test call-shape edits, and a new adapter `tests/support/flat-share-repository.ts`, were made
  only to keep typecheck green. They are not new coverage (see §9, L12b).

## 11. Owner questions (five, each with a default)

| # | Question | Default if the owner takes it |
| --- | --- | --- |
| **Q-L1** (QP2) | How long does a session last? | Client: 30 days idle, 90 days absolute. Operator and administrator: 12 hours idle, 7 days absolute |
| **Q-L2** (part of QP1) | If the breached-password service cannot be reached, is the password accepted? | **Yes**, if it meets the length rule. The event is logged. (The minimum is 12, as Fix 3 item 1 proposed) |
| **Q-L3** | If Cloudflare's Turnstile check cannot be reached, can a client still log in? | **No**: login, register and reset answer "try again later". Writes fail closed (ADR 0019 d5) |
| **Q-L4** (Q62) | Do confirmation and reset e-mails leave from the same Gmail account as the shop's notice? | Yes until M9, with the per-address bucket. **A dedicated sending account is recommended** |
| **Q-L5** (L5 review F7) | Should a password-reset mail have its own per-address bucket, apart from registration and resend mail (see §10)? | **Yes, answered by default in the L8 security review (F2): separate buckets**, `account-register-mail-by-address` (registration notices) and `account-reset-mail-by-address` (the reset request; the "password changed" notice counts none, L10 review L1), 5 a day each; **and a dedicated login-resend bucket `account-login-resend-by-address`, added by default in the L9 security review (F1)**, 5 a day. Owner-visible; the owner may change any figure (constants only) |

**Q-L1, Q-L2, Q-L3 and Q-L5 (the defaults below), D12 and Amendments A–C are reviewer defaults, not yet ratified in the owner's words** (the list
is in ADR 0169 Amendment E, item 2). Q-L4 is answered by the owner, 2026-10-18: *"keep same email as sender"*.

**Owner steps** (not questions):
- create the Turnstile widgets and set the two variables;
- apply `0012`–`0015` and the grants on preview when the walk is wanted; production waits for §9;
- the first administrator later, by the console seed in the runbook (no staff account is needed this round);
- the privacy-notice text from the legal adviser before launch (the register screen links it).

## 12. Later waves, and the seam each keeps open

| Later wave | Needs | Seam left here |
| --- | --- | --- |
| Dashboard ("My kitchens", rename, duplicate, delete, hide, Save / Discard) | `designs.sent_at`, `hidden_by_client_at`, a name column | `account_id` and its `(account_id, updated_at desc)` index; additive columns; the account arm of every design predicate |
| Profile (name, address, change password, change e-mail) | columns; an `email-change` token purpose | Token `purpose` is a shape check, not a list. `UPDATE (password_hash…)` granted; `email` deliberately not, so e-mail change gets its own grant and review |
| Staff invitation and management | a `staff-invitation` token; a way to set `role` | `role` is outside the app's grants, so the wave must choose a narrow grant or a separate credential, explicitly. The capabilities exist |
| Operator and administrator screens, notes, audit log | `design.read.any`, `design.unhide`, `note.write`, `audit.read`; `notes` and `audit_log` tables | Capability names reserved in `CAPABILITIES`. `requireCapability` is the one check to extend with audit writing |
| Preset gate swap (Fix 2 → Fix 3) | `preset.create` | M8C's `preset-authoring-policy.ts` seam takes `requireCapability(session, "preset.create")`. The route does not change [doc: M8C plan §3.3] |
| GDPR export and erasure; notice; cookie notice | a narrow `DELETE` path under its own credential; `contact_submissions.account_id` (additive) | `on delete cascade` from accounts to sessions and tokens. No FK from designs, so erasure deletes designs explicitly first |
| Retention job (drafts 365 days, unverified accounts 30 days, expired sessions and tokens) | `DELETE` under a separate credential; reverses ADR 0019's note of 2026-09-15 for account-owned drafts | `email_verified_at`, `created_at`, `absolute_expires_at`, `used_at`. Claiming requires a verified account, so **the 30-day cleanup never meets a claimed design** |
| Accounts backup (QP5) | a separately scoped export (ADR 0012) | Sessions and tokens are never exported. `account_id` joins the design export with it |
| Alert on sustained breach-check `unavailable` lines (L3 review, 2026-10-18) | a log drain or alert rule on `[account]` lines with `event: breach-check`, `outcome: unavailable` | `isBreachedPassword` writes one such line per failed check and accepts the password on the length rule alone (Q-L2), so a long outage is silent without an alert |
| Raising the argon2id shape (the `m`, `t`, `p` parameters of `password-hash.ts`) (L9 security review F5; ADR 0118 style, recorded with its trigger) | the trigger *"the owner changes the argon2id parameters"* | `DUMMY_PHC` in `password-hash.ts` has one shape. After a raise, accounts still hold hashes of the old shape until their next login rehashes them, so an unknown address (verified against the dummy) and a known one (verified against an old-shape hash) take different times, and a timing class appears. Keep a dummy hash at **each shape still present** and verify a missing account against the shape a present one would use, or rehash every account offline before the raise |
| Registration nudge modal and pop-up cadence (obligation 8, Q-F3-8) | editor hooks | `GET /api/account/session` tells the editor whether the visitor is signed in |
