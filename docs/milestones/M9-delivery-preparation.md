# M9 — Delivery preparation: hosting, providers and the launch gate

> **STATUS: PROPOSED — to be planned by the owner's ruling of 2026-10-07.** No plan, no wave, no
> criterion, no branch. This file is a stub: it records what M8 hands over and the question that
> travels with each item, so nothing is lost between the two. Summary: `docs/STATUS.md`.

**Where this came from.** The owner, 2026-10-07, answering M8 plan question Q27, verbatim: *"for sure, but
I think I will plan a new separate milestone that will prepare the project for delivery, at that time we
will finalize the development and will plan where to host and will have more info, lest focus on
functionality and basic security for now"*. M8 was restated on that ruling
(`docs/milestones/M8-review-contact-success.md`, *M8 restated, 2026-10-07*): it is fifteen waves ending at
8T, and waves 8R and 8S and the launch gate leave it for this milestone.

**What is ruled, and what is not.** Ruled by the owner: a separate delivery-preparation milestone will be
planned. **Not ruled, deferred to this milestone as leanings:** the host (Q21: *"or in one of Moldova's
servers or one server in Germany I guess"*), the database's home (Q22: *"I think if I will have a VPS I can
use or a docker that will have containers for DB also... or we can keep Neon with a EU server..."*) and the
mail provider (Q25: *"or the server provider will have also email, or something like sendgrid (goal is not
to go to spam), but email will go to admin so for sure it will not go to spam"*). Those are the owner's words,
relayed, and none is a decision.

**Waves, criteria and answers are not written here.** The architect wrote the inheritance table below in the
M8 plan; this file copies it and adds nothing to it.

## What it inherits from M8, and the question that travels with each

| Inherits | With |
| --- | --- |
| The launch host; a reverse proxy, TLS, a scheduler | Q21; ADR 0019 d2, d9, d10 re-read for that host |
| The database's home; the driver if it changes; backups | Q22; Q13 (ii); ADR 0007, 0012, 0054 |
| Flood protection: a bot shield or captcha, the firewall rules, the client address and country source | Q16, Q17, Q23's first half (the DDoS half); whether the one limit on new designs gains a second tier ([ADR 0147](../decisions/0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md)); ADR 0019 d4; ADR 0114 d7 |
| The mail provider and its adapter; DNS; the inbox, the shop's number, the sending domain | Q25; Q29's mark must be absent in production |
| Every runtime query error rebuilt | Q27 (b); QA20; backlog 84 |
| The launch gate, with SEC-001's platform half | Q19; ADR 0019's 2026-08-31 correction |
| The pre-launch checks of 8S: the first stored schema, live rows, migrations and grants applied, the largest row, the Russian re-signed, the owner's text in every slot | Q20, Q7, Q9; ADR 0038, 0095, 0096; backlog 92 |
| What personal data is held, by whom and where; the owner's question about GDPR | The owner's and their lawyer's |
| The unmeasured: a rejected login (F3), the host's own logger (F4), a session close that never returns (F5), Neon's documented strings (F6), what a remote reader makes of a Latin-1 byte or a tab (QA21) | The coordinator files them |

Related records: wave 8R (the firewall rules, staged) and wave 8S (the pre-launch checks) are left in the M8
plan under their own headings, each marked as leaving for this milestone. The launch gate's text stays in the
M8 plan's *Launch gate* until this milestone has its own plan. M8's mint limit is
[ADR 0147](../decisions/0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md);
the data list must include that an IP address is held, and that no record decides how (ADR 0147).

## The named interims M8 ends with

Each is closed here unless another owner is named. None is "done" (`WORKFLOW.md`, *Nothing ships
mid-milestone*).

1. No real e-mail leaves the system. Port and message only.
2. The limiter knows a client's address only on the development host. Elsewhere, one shared bucket. No
   country. No challenge. The global brake counts and does not act. Abuse spread over many addresses is not
   bounded by the application; one address is, at 20 designs a day.
3. No bot check. The form has the honeypot and the timing check.
4. No firewall rule exists, and SEC-001's gate is open. Its application half is built.
5. A runtime query error still passes through untouched (Q27 (b)). 8B's B10 and the log line are the
   protection meanwhile.
6. Consent and privacy text, the not-included list and 5A's steps are slots, not the owner's text; the shop's
   number is absent; the Russian is unsigned.
7. No profile. M8B's.
8. Nightly jobs are scheduled by the development host.

## Where it sits relative to M8B

**The owner has not said.** The architect's recommendation, **not an owner ruling:** last, after M8B. Its
gate and its data list must cover profiles too, and the shield must stand in front of sign-up and login. One
dependency runs the other way and needs the owner's eye: **M8B sends e-mail to customers** (verification,
reset), where *"not to go to spam"* matters as it does not for mail to the admin. If M8B comes first it
builds on M8's mail port and recording fake, as M8 does, and the provider is wired once for both here.
