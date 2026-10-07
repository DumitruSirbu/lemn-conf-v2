# M8B — Customer profiles

> **STATUS: PLANNED — created 2026-10-07 on the owner's answer to M8 plan question Q1; no branch yet;
> no wave dispatched.** M8B comes **after M8 and before launch**. Summary: `docs/STATUS.md`.
>
> **The slice tables and reading lists are not written.** Every one depends on questions QP1–QP5,
> which are put in wave 8N, and no answer to any of them exists. What is fixed below is the cut, the
> order, what each wave must prove, and the owner's obligations. Nothing here is a criterion yet:
> each obligation is *owed* one when 8N plans the phase.

**Where this came from.** Until 2026-10-07 this was *Part P* of
`docs/milestones/M8-review-contact-success.md`. M8 plan question Q1 asked: *Are profiles part of M8, or
their own milestone?* The owner replied *"Moldova only for now, rest as recommended"*, so Q1 is
**answered 2026-10-07, (b), as the architect recommended (relayed)** — not the owner's own words on
that question. The plan's reasoning, quoted: *"Nothing ships before every milestone is done, so the
split costs no release, and a pull request of twenty-seven waves is not a reviewable unit. It changes
ADR 0115's wording, so it is the owner's."* The decision record is
[ADR 0115](../decisions/0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md),
**Amendment A**.

The text below was carried across from Part P, which the architect left in the M8 plan marked as
moved. Wave names 8N and 8P1–8P9 are kept so the M8 plan's references still resolve.

**Evidence tiers** are the M8 plan's: **[src]** read in the source, **[doc]** quoted from a record in
this repository, **[inf]** the architect's inference, **[ven]** a figure from 8A S2's vendor-documentation
report (another agent's read; not re-read by the architect, who read only Next's `after.md`).

## What M8B depends on

- **M8 first.** Profiles need e-mail sending (verification, reset), which M8's wave 8J builds for the
  contact form, and the application limiter (8F, 8G) that login and sign-up join. The owner's reasoning
  in ADR 0115: *"building it twice, or building it early without its consumers, is the cost the owner
  declined."*
- **Where production runs and where the database lives** (M8 questions Q21, Q22) are open and may change
  the hashing and session work. Neither is decided.
- **The mail provider** (M8 Q25) is open; sending verification and reset e-mails uses whichever it
  becomes.

## The cut

The cut, the order and what each wave must prove. The obligations are the owner's section below, by
number.

| Wave | Does | Obligations | Tier |
| --- | --- | --- | --- |
| 8N | The design record: tables, the session, CSRF, how a session authorises reading and writing a claimed design, deletion semantics, hashing parameters measured on the deployment target. Puts QP1–QP5 | all | Light |
| 8P1 | Persistence: profiles, sessions, single-use e-mail tokens, a design's owning profile. Grants | 3, 4, 6, 7 | Full + security |
| 8P2 | Password hashing and the password rules | 1, 2 | Full + security |
| 8P3 | Sign-up and e-mail verification, under the limiter | 3, 5, 9 (the notice) | Full + security |
| 8P4 | Login, logout, the session cookie, CSRF, growing back-off | 5, 6 | Full + security |
| 8P5 | Password reset | 4, 5 | Full + security |
| 8P6 | Claiming, and the gate: an owning profile opens and edits its design on any device | 7, 6, 10 | Full + security |
| 8P7 | The modal after the first real edit; the sign-up, login, verification and reset screens | 8 | Full + visual |
| 8P8 | The dashboard: list, open, rename, share, delete | 11, 10 | Full + visual + security |
| 8P9 | Account deletion, the privacy notice, retention of profile data | 9 | Full + security |

*What each must prove, beyond its obligations.* **8P1:** a token and a session are stored as hashes
only; a used or expired token never works again; a restore cannot revive a session or a token (ADR
0114 G7's argument). **8P2:** the hash is argon2id, or scrypt if 8N shows the runtime lacks it, with
stated parameters and a measured time on the deployment target; a password is in no log, error or
response, tested with recognisable fakes. **8P3–8P5:** every response for an unknown address equals
the response for a known one, in body and in time class; each endpoint refuses at its limit plus
one. **8P4:** the session value changes at login and at a password change; a session cookie planted
before login grants nothing after it. **8P6:** claiming is atomic; a design claimed by one profile
is never claimed by another, under concurrency; ADR 0114 decision 5's refusal stays one
indistinguishable answer for everyone who is neither the owning browser nor the owning profile; the
preset-author credential is untouched (ADR 0112). **8P7:** the modal never appears on load or on
Step 1, never blocks an edit, and is not shown again in a session once dismissed. **8P8:** every
action is authorised against the session, never against an id alone; a share token's plaintext is
never shown again after creation (ADR 0114 B2).

## Customer profiles — owner decision, 2026-09-11

**The owner's words**, proposing it: *"maybe we can advise user to make a profile, and in this way he
will be able to store all its configurations there and will get access to a small dashboard to manage
the configurations. After he plays with intitial configuration we can show a modal to propose to
create profile. email plus password"* — then, through structured prompts, **"Profile replaces PIN"**
and **"In M8, with e-mail"**. The durable record is [ADR 0115](../decisions/0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md).
**The second prompt's *"In M8"* is amended by ADR 0115 Amendment A: M8B.**

**What it is:** a customer account — e-mail and password — holding every configuration the customer
made, with a small dashboard to open, rename, share and delete them; offered by a modal after the
first configuration. It is the way a customer edits from another device or after clearing their
browser. **It supersedes ADR 0019 decision 8** (e-mailed edit link, never a password) **and that
record's rejection of passwords and accounts** — whose reasons are the checklist below, not arguments
set aside.

**What M7 leaves for this phase to build on:** a design is readable and editable only in the browser
holding its owning visitor cookie (`__Host-lemnaria_visitor`, ADR 0114); a customer can make a short,
read-only, revocable share link (ADR 0114 Amendments B–C); nothing else.

**Obligations — each owed an acceptance criterion when this phase is planned:**

1. **Password storage.** A slow, salted, memory-hard hash — **argon2id** preferred (the choice ADR 0019
   Alternative 1 already named), scrypt acceptable where argon2id is unavailable on the runtime — with
   parameters stated and measured on the deployment target. **A new hashing dependency is a dependency
   change and gets the security review tier.** Passwords never logged, never in an error, never in a
   response.
2. **Password reuse — ADR 0019's first reason.** A minimum length and a check against known-breached
   passwords, so a leak of this database is not a key to other services; the privacy notice says what
   is stored.
3. **E-mail verification** before the profile can claim designs or reset anything.
4. **Password reset** by a **single-use, expiring, hash-stored** token sent by e-mail — ADR 0019's
   *"no reset path"* objection answered by the verified address.
5. **Login and sign-up rate limiting** — per account and per client, with growing back-off — added to
   the application limiter ADR 0019 decisions 2–5 already assign to the review-and-contact phase (M8),
   and to the launch gate.
6. **The session.** An `HttpOnly`, `Secure`, `SameSite=Lax`, host-only (`__Host-`) session cookie,
   rotated at login and at privilege change (no session fixation), revocable server-side, with CSRF
   protection on every state-changing profile endpoint. It must coexist with, not replace, the
   per-design write token and the visitor cookie until a design is claimed.
7. **Claiming anonymous designs.** On sign-up (and on login from a browser holding a visitor cookie),
   every design that cookie owns is attached to the profile, atomically; a design already claimed by
   another profile is never re-claimed. After claiming, the profile — not the browser — is what opens
   the design on any device.
8. **The modal's trigger:** after the customer's **first real edit** in the editor (not on page load,
   not on Step 1), dismissible, and not shown again in that session once dismissed. It never blocks
   editing.
9. **Personal data.** A privacy notice at sign-up; **account deletion** that removes the profile and
   either deletes or detaches its designs as the notice says; retention of profile data stated beside
   ~~ADR 0019 decision 7's design retention~~ **the design's, which since 2026-09-15 has no horizon
   (ADR 0019 note)**.
10. **Separation of credentials.** A profile never grants preset authoring (ADR 0112's owner gate
    stays separate), and never exposes a share token's plaintext after creation (ADR 0114 B2).
11. **The dashboard** lists, opens, renames, shares (ADR 0114's share link) and deletes the profile's
    designs; every action is authorised against the session, never against a design id alone.
12. **What happens to the e-mailed edit link** (ADR 0019 decision 8, superseded): keep it for a
    customer who submits the contact form without a profile, or drop it — this phase decides, and the
    contact flow's copy follows. **Answered as M8 plan Q11, 2026-10-07, as recommended (relayed): the
    e-mailed edit link is dropped.**

## Owner questions — QP1 to QP5

Asked in wave 8N; they block only this milestone. **None is answered.** The recommendation is the
architect's, from the M8 plan.

**QP1–QP5:** the password's minimum length and the breached-password source; session lifetime; what
the dashboard's *delete* and account deletion do when the application role may not delete a design
(recommended: profile data is scrubbed in place and a design is hidden, not removed); the length and
character rules of a design's name; whether profile rows are backed up to Blob.

*Provenance:* these five are listed as one line in the M8 plan (*The questions as put*); the split into
QP1 to QP5 above follows the order of that line's clauses and is not separately numbered there. Wave 8N
writes each question out in full.

## What 8A found that M8B inherits

**Argon2id [ven §5, 8A S2's read, not re-read].** Confirmed for Node 24.7.0 and later (`crypto.argon2`,
*"added: v24.7.0"*); it returns raw bytes, so the caller stores the salt and parameters. Vercel deploys
*"the latest 24.x"*; the deployed patch version is not documented and is still to be read.

**Proposed variables, secrets, resources and dependencies** (from the M8 plan, now M8B's):

| Item | Kind | Source | Wave | Add-only note |
| --- | --- | --- | --- | --- |
| Tables for profiles, sessions and e-mail tokens; a design's owning profile; their grants | schema, grant | ADR 0115 | 8P1 | QP3 decides whether any `DELETE` is asked for |
| A password-hashing dependency | dependency | obligation 1 | 8P2 | None if the runtime has argon2id built in (above); the deployed patch version is still to be read |
| A breached-password source | third-party call or data | obligation 2 | 8P2 | QP1 |

## Gate

M8B's own launch-gate items (login, sign-up and reset endpoints under the application limiter; obligations
1 to 12 each checked) are **not written**. The M8 plan's launch gate carried a line for them, since
struck and pointed here. Wave 8N writes the gate with the criteria.

## Outcome

None yet.
