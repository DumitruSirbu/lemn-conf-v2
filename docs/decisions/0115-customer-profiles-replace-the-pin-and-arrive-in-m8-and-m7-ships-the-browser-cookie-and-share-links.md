# ADR 0115 — Customer profiles replace the PIN and arrive in M8; M7 ships the owner's browser cookie and short share links

Status: Accepted (owner rulings, 2026-09-11). **Supersedes ADR 0019 decision 8 and its Alternatives 1
and 2**; settles the editing half ADR 0114 Amendment C left pending.
Date: 2026-09-11
Type: Decision (owner rulings)
Milestone: M7 (waves 7E3a–7E3c) and M8 (profiles)

## Context — how F5 moved through one day

The M7 plan's follow-up F5 asked who may open a design's link. The owner answered it five times on
2026-09-11, each answer replacing the last. **All are kept, in order, because each was recorded as the
owner's answer for a while:**

1. ~~**"Only its own browser"**~~ — superseded by 2. ([ADR 0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md) Amendment A, struck.)
2. **"Own browser + private share link"** — *"Normal link opens only in the owner's browser; a
   separate 'share' button creates a second read-only link the customer can send (e.g. to the
   manufacturer or family) and revoke later."* ([ADR 0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)
   Amendment B.) **Its M7 half stands** (decision 2 below).
3. A restatement — *"For editing we should request a password or pin code, but for sharing we need to
   generate a short link that will offer only read only configuration without any passowrds."* — whose
   sharing half is [ADR 0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md)
   Amendment C and **stands**, and whose editing half led to three PIN answers:
   - ~~**"Only on a new browser"**~~ — the PIN is asked only when the design is opened on another
     device, after the browser is cleared, or after the 30-day cookie lifetime;
   - ~~**"6-digit PIN + lockout"**~~ — chosen at first save; five wrong tries lock the design for a
     growing interval;
   - ~~**"Reset by e-mail, from M8"**~~.

   **All three PIN answers are superseded the same day by 4.** None was designed or built.
4. **"Profile replaces PIN"** — the owner's own proposal: *"maybe we can advise user to make a
   profile, and in this way he will be able to store all its configurations there and will get access
   to a small dashboard to manage the configurations. After he plays with intitial configuration we
   can show a modal to propose to create profile. email plus password"*.
5. **"In M8, with e-mail"** — profiles are built in M8, beside its e-mail sending and contact form.

And a clarification the same day: *"short link only to share"* — the 12-character token is the share
link's alone; a design's own address `/d/{id}` keeps its existing identifier.

## Decision

**1. Editing across devices is a customer profile — e-mail and password — built in M8.** It replaces
the PIN entirely. The profile holds the customer's configurations, gives them a small dashboard to
manage them, and is offered through a dismissible modal after the customer has worked on their first
configuration. **No PIN, no lockout and no PIN-at-first-save work exists in M7 or anywhere.**

**2. M7 ships exactly this, and nothing of the profile:**
- **`/d/{id}` reads and edits only with the owning visitor cookie** (ADR 0114 decisions 1–5 and
  Amendment B1). Anyone else gets the byte-identical *"not available in this browser"* response a
  wrong id gets. The design's identifier format is unchanged — `nanoid`, 21 characters.
- **A short, read-only, password-free, revocable share link** replaces the open read (ADR 0114
  Amendments B and C): 12 base62 characters (~71 bits), hash-only storage, one active link per design,
  immediate revocation, re-issue kills the old token, lives and dies with its design, `/s/{token}`
  redirected to the recipient's locale, `no-referrer` / `noindex` / `private, no-store`, shown in the
  existing read-only editor view, never a write, never the design id, never either cookie.
- **Creating or revoking a share link requires the design's write token and the owning visitor
  cookie** — ADR 0114 Amendment C's *"whatever authorises editing"*, which in M7 is exactly those two.

**3. Until M8, a customer's design is reachable for editing only in the browser that made it.** A
cleared browser or another device opens Step 1 and sees *"not available"* on the old link; the
customer can still view through a share link they made earlier. M8's profile is the way back.

**4. ADR 0019 decision 8 is superseded, and its reasons become M8's obligations.** Decision 8 chose an
e-mailed edit link and **rejected passwords** (Alternative 1) and **accounts** (Alternative 2) for
stated reasons: password reuse turns a leak of this database into a credential leak elsewhere; hashing
and never-logging obligations; no reset path; and an authentication system neither M7 nor M8 scoped.
The owner has now chosen accounts with passwords, in M8. **The earlier reasons are not dismissed — they
are the checklist M8 must meet**, recorded in `docs/milestones/M8-review-contact-success.md` (*Customer
profiles*). Whether the e-mailed edit link survives beside profiles, for a customer who submits without
signing up, is M8's to decide.

## Alternatives considered

- **The 6-digit PIN with lockout** (answers 3a–3c). Superseded by the owner's own proposal: a profile
  does what the PIN did — prove it is the customer on a new browser — and also gives them a place to
  keep several configurations, which the PIN could not.
- **Profiles in M7.** Rejected by answer 5: profiles need e-mail sending (verification, reset), which
  M8 builds for the contact form anyway; building it twice, or building it early without its
  consumers, is the cost the owner declined.
- **Keep the open read until M8.** Rejected by answer 2 and the owner's security requirement (ADR 0114
  *Context*): a leaked link must not open a design.

## Consequences

- **M7:** waves 7E3a (cookie and resume), 7E3c (short share link) and 7E3b (gating `/d/{id}`) proceed,
  in that order, each with a security reviewer; 7E3b comes off hold.
- **M8** gains a dated *Customer profiles* section of obligations, including claiming anonymous
  designs into the profile at sign-up.
- The M8 launch gate's security scope grows: login and sign-up endpoints join the mint and contact
  endpoints under the application limiter.

## Amendment A — 2026-10-07: profiles are their own milestone, M8B

**What moved.** Decision 1, the *Consequences*' M8 bullets and the title say profiles are built *in
M8*. The owner answered M8 plan question Q1 on 2026-10-07 with *"Moldova only for now, rest as
recommended"*; Q1 is therefore **answered as the architect recommended, option (b) (relayed, not the
owner's own words on that question)**: profiles are a separate milestone, **M8B**
(`docs/milestones/M8B-customer-profiles.md`), after M8 and still before launch, with their own branch
and pull request. The plan's stated reason: *"Nothing ships before every milestone is done, so the
split costs no release, and a pull request of twenty-seven waves is not a reviewable unit."*

**Superseded wording, struck and kept:**

- Decision 1: ~~built in M8~~ **built in M8B**.
- Decision 3: ~~Until M8, a customer's design is reachable for editing only in the browser that made
  it … M8's profile is the way back.~~ **Until M8B** — and M8's own success screen says so.
- Decision 4: ~~their reasons become M8's obligations~~ **M8B's obligations**; the checklist is now
  M8B's, carried across from the M8 plan's *Part P*. The question of the e-mailed edit link is
  already settled for M8 by Q11: dropped (answered as recommended, relayed).
- *Consequences*: ~~**M8** gains a dated *Customer profiles* section of obligations~~ the section is
  **M8B's**; ~~the M8 launch gate's security scope grows~~ the login, sign-up and reset endpoints join
  **M8B's** gate, not M8's.
- Title and *Milestone* header: ~~arrive in M8~~ arrive in M8B. The file name is unchanged.

**Unchanged:** the owner's rulings of 2026-09-11 (profile replaces PIN, e-mail plus password, the
modal), the twelve obligations, M7's scope and the share link. Nothing here changes what a profile is.

**Not resolved by this amendment.** The *Decision-record sweep* row for ADR 0019 and the header's
*Milestone* line still say M8; they are history and are left as written. The obligations' wording
(*"added to the application limiter ADR 0019 decisions 2–5 already assign to this phase"*, in the M8
plan's Part P) assumes M8 builds the limiter first; M8B inherits it after 8F and 8G.

> **Dated note, 2026-10-07, later:** the owner ruled hosting and the mail provider into a separate
> delivery-preparation milestone ([M9](../milestones/M9-delivery-preparation.md), proposed). M8B sends e-mail
> to customers (verification, reset), so until M9 chooses a provider, **M8B builds on M8's mail port and its
> recording fake** (M8 plan, *M8 restated*). Where M8B sits relative to M9 is not ruled; the architect
> recommends M8B first, M9 last, and that is not an owner ruling.

## Decision-record sweep

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0019](0019-security-baseline-writes-throttling-retention.md) decision 8, Alternatives 1–2 | Cross-device editing by e-mailed link; passwords and accounts rejected. | **Superseded** by the owner's profile ruling; its reasons become M8's obligations (decision 4). Note added to 0019. |
| [0019](0019-security-baseline-writes-throttling-retention.md) decision 1 | Reads open to link holders; per-design write token. | Read half already superseded (0114); **write half stands**. |
| [0002](0002-db-backed-shareable-persistence.md) | Shareable design links. | **Addressing stands; open read superseded**; sharing is the short share link (note updated). |
| [0114](0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md) Amendments A–C | A struck; B share link; C short token, editing pending. | **B and C stand; C's pending editing half is settled here** (Amendment D on 0114 points here). |
| [0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md) | Owner-only preset authoring behind its own gate. | **Independent**: a customer profile never grants preset authoring; M8 must keep the two credentials separate. |
