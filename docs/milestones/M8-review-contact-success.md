# M8 — Screens 3, 4 and 5: review, contact, success and failure

> **STATUS: PLANNED — wave plan written 2026-10-07 at `90927dc`; no wave dispatched.** M8 does not
> start until the owner says so and M7C has closed (see *What M8 assumes*). Summary: `docs/STATUS.md`.
>
> **Updated 2026-10-07, later, at `7519005` on `m8-review-contact-success` [src, git].** The owner
> answered Q1–Q20 (*The owner's answers, 2026-10-07*). **Profiles left for M8B** (Q1), so M8 is
> seventeen waves and ends at 8T. 8A S2's vendor reads are folded in (*8A figures*); 8A S1's
> measurements ~~are not in yet~~ **arrived later the same day and are in the same section (written
> at `a7b0363`)**; they changed 8B's slices and criteria and what 8F owes the e2e suite, and left
> Q15 standing. **Six follow-up questions are open, Q21–Q26**, and the first two —
> where production runs and where the database lives — make five of the recorded answers
> conditional. Dispatchable as written: **8B, 8C, 8D, 8E, 8I**.
>
> This file was first written before M7, M7B and M7C. It was revised in place on 2026-10-07 into a
> wave plan. Nothing was deleted silently: every earlier claim a later record overtook is listed in
> *What this revision corrected*, with the record that overtook it, and the owner's dated sections are
> kept under their own headings.

Evidence tiers used below: **[src]** read at `90927dc` (file:line or symbol), **[doc]** quoted from a
record in this repository, **[inf]** the architect's inference, with what would falsify it. A claim
about a vendor (Vercel, BotID, a mail provider, Postgres privileges, Node) is **[inf]** everywhere in
this file: none was read from vendor documentation for this plan. Wave 8A reads them and replaces the
label.

**Added 2026-10-07, later.** 8A S2 read the vendors' documentation that day. **[ven]** marks a
quotation or figure taken from its report (`m8-8a-s2/vendor-reads.md` in the session scratchpad,
with raw copies of each page). It is another agent's read: neither the coordinator nor the architect
re-read the vendor pages, except Next's `after.md`, which the architect read in the installed
package. Where a wave's text still says **[inf]** about a vendor, *8A figures* is the current
state.

Reference: mobile mockup frames 3A, 3B, 4A, 4B, 4C, 5A, 5B and 2F
(`docs/design/mockups/Lemnaria Configurator Mobil.dc.html:921-1512`); `ARCHITECTURE_PROPOSAL.md` §8, §9;
`CONFIGURATION_MODEL.md:238-240`; `DEVELOPMENT-SPEC.md` §10, §10.1, §12; ADRs listed in *ADRs*.

## What this revision corrected (2026-10-07)

| Earlier claim in this file | What overtook it | Now |
| --- | --- | --- |
| Launch gate: *"The 30-day abandoned-design retention cron"* must be live; *"All six ship together"* | [ADR 0019](../decisions/0019-security-baseline-writes-throttling-retention.md) *Supersession note — 2026-09-15: decision 7*: *"Nothing deletes a design automatically, and nothing is scheduled to."* [doc] | No retention cron is built. The counter pruning that shared its cron stands (*"unchanged; that half is not retention"*). The gate's set is restated below and put to the owner as Q19. |
| *Unresolved prerequisite — no credential can perform the retention delete* | Same note: *"`DELETE` is absent by design and must stay absent"*; the later script is *"RECORDED WITH ITS TRIGGER AND NOT BUILT"* [doc] | Moot for designs. `DELETE` survives as three narrower questions: counter pruning (Q14), dashboard delete and account deletion (QP3), the operator script (not M8). |
| *Emailed edit link* as an M8 deliverable | [ADR 0115](../decisions/0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md) decision 4 [doc] | Superseded by profiles. Whether it survives at all is Q11. |
| Routes `/configurator/review`, `/configurator/contact`, a success route | [ADR 0114](../decisions/0114-a-visitor-is-a-host-only-httponly-secret-and-a-design-link-opens-only-in-its-own-browser.md) decision 5, Amendment F1: the editor is `/[locale]/d/{id}`, gated to the owning browser; `/configurator/configure` is a redirect [src `app/[locale]/configurator/configure/route.ts`] | D1 and Q2. |
| *"The summary is grouped wall → band → order"* read for two walls | M7B shipped wall C; `WALL_DISPLAY_RANK` is A, B, C [src `queries/design-projection.ts`] | Every review criterion is stated for three walls. |
| Submission boundary: *"resolves the matching catalog and pricing context"*, client `pricingSnapshot`, `verifyPricingSnapshot` (ARCH §9) | [ADR 0004](../decisions/0004-m2-pricing-engine-deletion.md) deleted that engine; ADR 0114 decision 5: *"M8's contact flow sends the manufacturer an immutable snapshot server-side"* [doc] | D5, D6: the server prices the stored row. The client sends no price. |
| The driver *"is constructed in three places"* (`design-row-source.ts:77`, `neon-configuration-repository.ts:117`, `delete-designs-for-tests.ts:38`) | Current tree [src]: `neon-configuration-repository.ts:175`, `share-link-repository.ts:83`, `design-row-source.ts:56`, `migrate-status.ts:88`, `delete-designs-for-tests.ts:26,46`, plus the lazy wrapper `apps/web/src/lib/server/repository.ts` | Wave 8B works from the current list and re-measures it. |
| CSP: *"the five prerendered routes … `/`, `/_global-error`, `/_not-found`, `/configurator/configure`, `/configurator/contact`"* | 7E3a made `/` and the configure route Route Handlers. `security-headers.ts:13-14` now names `/_global-error`, `/_not-found` and the `ro` and `ru` contact pages [src, a comment; the manifest is re-read in 8A] | Wave 8Q. |
| 4A's design card *"Ozun clasic, adaptat"* (a preset name), implied by *"the form states that the design attaches"* | [ADR 0131](../decisions/0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md): no preset exists in M8 [doc] | D13. |
| *Check the five stored designs against the corrected wall bounds* | Rows written before migration `0005` have no visitor hash and *"are therefore unreadable"* (ADR 0114 decision 5) [doc] | Probably moot [inf]; kept as a cheap owner-run check in 8S, not asserted. |
| *"Depends on M7"* | M7B and M7C sit between | *What M8 assumes*. |

## Goal

Close the flow: let the customer read what they built, set expectations before asking for their
details, collect the minimum needed for a first call, and confirm exactly what happens next,
including when the submission fails. Make the write endpoints safe to meet real traffic.

## Scope

**In.** Screens 3, 4, 5 (frames 3A, 3B, 4A, 4B, 4C, 5A, 5B) and frame 2F's two exits; the submission
boundary and its sink; the application rate limiter over every endpoint ADR 0019 and ADR 0114 assign
to it; the contact form's bot controls; the driver-error redaction the owner ruled into this phase;
the CSP enforce flip; the pre-launch checks; ~~customer profiles (ADR 0115), unless Q1 moves them~~.

**Out, with the owner of each.**

- **Customer profiles: M8B**, by the owner's answer to Q1 on 2026-10-07 (relayed). M8B comes after
  M8 and before launch. See *Part P*.

- CRM integration: not planned (ADR 0001 decision 7).
- The preset story (7P1, 7P2, 7G, 7B, 7C, 7F3): past M8, ADR 0131. Nothing here reads a preset.
- Automatic deletion of designs: retired by the owner, ADR 0019 note of 2026-09-15.
- The manufacturer price dashboard, price-book versioning and the recalculate flow: after M8,
  ADR 0062 and ADR 0072.
- Desktop chrome for screens 3–5: the desktop mockup stops at screen 2 [src: its only routes are
  `/configurator/room` and `/configurator/configure`, frames D1A–D2F]. These screens ship
  responsively from the phone frames and the gap is recorded (`milestones/README.md`, *Mobile is
  gate-worthy on its own*). No desktop chrome is invented.
- Geometry: **no file under `packages/three-adapter` changes in M8** (D4). A wave that finds it
  needs one stops and returns to planning; `product-invariants.md` then applies in full.

## What M8 assumes

1. **M7C is closed and merged.** Wave CE's criterion 4 (a second green runner run on one commit) and
   wave C6 (the phase gate, push and PR) are done, and `main` is green on a runner. Today CE is open
   [doc STATUS, *What to do next*].
2. **The branch.** `m8-review-contact-success` is cut from `main` after that merge, pushed early and
   merged through GitHub (`WORKFLOW.md`, *A milestone's branch is kept*).
3. **M7C's editor is the base.** The inert `Verifică designul` span, the back confirmation and the
   browser Back guard stand as M7C leaves them [src `configure-screen.tsx:244-262`,
   `use-back-guard.ts`]. One M7C test asserts the CTA does nothing
   (`tests/e2e/qa-m7c-c1-s3-back.adversarial.e2e.spec.ts`, *"the review CTA is still text"*) [src];
   wave 8D retires it by name.
4. **Migrations 0001–0006 are applied** on production, preview and the test database [doc STATUS
   head]. The next file is `0007`.
5. **The e2e shard budget has room.** Backlog 106 records a desktop shard at its 70-test budget.
   Every M8 wave that adds a spec runs `pnpm gate:e2e-shard-budget`.

## What the code has today

All [src] at `90927dc`.

- **No review route.** `Verifică designul` is a `span` with no handler (`configure-screen.tsx:259`).
- **A placeholder contact page**, `app/[locale]/configurator/contact/page.tsx`, rendering the
  `contactPlaceholder` leaves (`messages/ro.json:305`). Frame 2F's two links already point at it with
  `?intent=link` and `?intent=callback` (`components/webgl-unavailable.tsx:38-61`). The file
  `apps/web/src/content/ro.ts` that older documents name no longer exists.
- **The grouping exists once.** `projectDesignForDisplay` groups wall → band and orders by
  `compareDisplayOrder`; `describePriceBreakdown` renders it and throws
  `PriceBreakdownDivergenceError` if pricing and projection disagree (`price-breakdown-model.ts`).
- **The fit fact exists once.** `findOverflowingPlacementIds` (`queries/overflowing-placements.ts:18`).
- **The price is derived.** `priceDesign(request)` takes the book; `PriceBook.version` exists
  (`pricing/price-book.ts:256-262`); `DesignSchema` carries no pricing version (ADR 0072).
- **`POST /api/designs`** refuses cross-site requests and has no limiter (`api/designs/route.ts`).
  No rate-limit table, no contact table, no mail code, no bot check exists.
- **One cron**, the designs backup (`vercel.json`), scoped to `designs` alone
  (`lib/server/backup-designs.ts:13-15`).
- **The application role** holds exactly `SELECT, INSERT, UPDATE` on `designs` and on
  `design_share_links`, asserted live (`tests/application-role-privileges.test.ts:57,92,123`).
- **The CSP reports only** (`security-headers.ts:19-20`).
- **Messages:** 328 leaves in `ro.json` and in `ru.json`; namespaces include `contactPlaceholder`.
- **A DOM is available to unit tests** per file: ~~43~~ **36** `.dom.test.ts` files declare
  `happy-dom`. Backlog 48's *"no DOM"* is stale for those. **Corrected 2026-10-07:** 43 was the count
  of files under `apps/web/tests` containing the string `vitest-environment`, not of DOM test
  files. The coordinator recounted 36; the architect re-ran `find` and `grep` and read 36 of 36.

## Decision-record sweep

Swept 2026-10-07 over `docs/decisions/` (index and `SUPERSESSIONS.md`), `docs/backlog/open.md`,
`DEVELOPMENT-SPEC.md` and `ARCHITECTURE_PROPOSAL.md` for *contact, review, submission, retention, rate
limit, BotID, honeypot, e-mail, profile, password, export, first release, snapshot, CSP*.

| Record | What it says | How this plan settles it |
| --- | --- | --- |
| ADR 0001 d4, d6, d7 | Estimate label; name and phone required, e-mail optional; no false delivery claim without a real sink | Kept. d6 leaves locality and the e-mail field open: Q6. |
| ADR 0002 d9, security 6, d17, d24 | Contact data outside the design, in its own table; no "saved" claim for an unwritten design; the export must not sweep contact data | Kept. 8I, 8K, 8M. |
| ADR 0008 | App role per-table grants; *"M8's contact table will need its own grant decision … very likely `INSERT` alone"* | Q14 proposes the grant. Issued by the owner, by hand. |
| ADR 0012 | The export is scoped to `designs`; *"this must not be widened"* | Kept. The contact table is never exported. Whether anything else is: Q13. |
| ADR 0019 d2–d6, d9–d11 | Vercel is the firewall, the application the limiter; independent buckets; geography; the rate table; fail closed | Implemented, not re-decided. Four gaps found, listed under D10–D12 and Q15. |
| ADR 0019 d7 | 30-day reaper | **Retired 2026-09-15.** Not built. |
| ADR 0019 d8 | E-mailed edit link | **Superseded by ADR 0115.** Q11. |
| ADR 0019 correction 2026-08-31 | *"must not be exposed … until the application limiter, the 30-day abandoned-design retention cron, and the staged WAF rule ship together"* | Its middle term was retired a fortnight later and the sentence was not restated. Q19. |
| ADR 0038; ADR 0111 d8 | Expires at first release; the first-stored-schema decision *"belongs to M8's pre-launch gate"* | **M8 is that phase.** 8S, Q20. |
| ADR 0041 d3, d4 | CSP enforce is blocked on prerendered pages and on a report sink | 8Q. |
| ADR 0062, ADR 0072 | M8 decides what a priced snapshot does when its book is retired; versioning itself is the dashboard's | D7. |
| ADR 0065 d7 | *"Save yes, submit no."* | 8C, 8K. |
| ADR 0095 | Every string in `ro.json` and `ru.json`; *"M8's launch gate keeps a backstop re-sign"*; an owner asked only at M8's gate is rejected | Q10; 8S. |
| ADR 0104 | The mockups are the chrome specification | Frames are used as drawn; departures are D-rows or questions. |
| ADR 0113 | *"Mark as approved at the moment"* — scoped to M7's Step 1 | Not extended by inference. Q10. |
| ADR 0114 d7, B5, B7, D | The limiter and WAF scope include `/`, `/d/*`, `/s/*` and the share endpoints; the success copy says *in this browser*; the hand-off is a snapshot | 8G, 8M, 8R. |
| ADR 0115 | Profiles in M8; twelve obligations | Part P. Q1 asks whether it is its own milestone. |
| ADR 0131 | No preset in M8 | D13. |
| Backlog 90, 92 | The rotation `UPDATE` has no limit; the largest row is 523,972 bytes | 8F; 8A re-measures. |

## Plan decisions

Architect decisions that are not product questions. Each is recorded in the ADR named in *ADRs* when
its wave starts. The owner may overrule any of them.

| # | Decision | Warrant |
| --- | --- | --- |
| D1 | Screens 3–5 are addressed by the design: `/[locale]/d/{id}/review`, `…/contact`, `…/done` (Q2, answered (a)). Each is gated exactly as `/d/{id}` is. `/[locale]/configurator/contact` stays as the entry with no design (frame 2F). | [inf] from ADR 0114 d5: a design opens only at its own gated link, so a route that shows one must carry its id and pass the same gate. Falsified if the owner wants unaddressed URLs (Q2). |
| D2 | The review lists one row per body, exactly the breakdown's rows. Frame 3B's aggregated row (*"2 × 800 mm"*) is not reproduced. | [src] amounts are rounded per row (`price-breakdown-model.ts:11-13`); an aggregated row would print a figure the breakdown never shows. Falsified if the owner wants aggregation, which then needs a rounding rule. |
| D3 | A group's *Editează* opens the editor with the group's **first body in display order** selected. | [inf] The frame says *"cu corpul preselectat"* for a group of several. Falsified if the owner wants a per-row action. |
| D4 | The review's render and the success screen's render are the existing scene component, mounted without picking, with the room's own camera presets (`cameraPresetsForRoom`). No builder, anchor or scaling rule changes. | [doc] `DEVELOPMENT-SPEC.md` §10.1: *"Scene … one component"*. Falsified if a non-picking mount needs an adapter change. |
| D5 | The request names a design id and the revision the review rendered. The server snapshots the stored row only at that revision; a mismatch is refused. | [doc] ARCH §8: *"the exact reviewed configuration snapshot, not whatever happens to be in mutable UI state"*. [src] the row has a revision (`design-revision.ts`). |
| D6 | The client sends no price. The server derives it from the stored row. | [doc] ARCH §9: *"the server never trusts a client line or total"*; ADR 0004. |
| D7 | The submission stores the server's priced lines, total and `book.version`. Nothing re-prices a stored submission. | [doc] ADR 0072's owner design, items 2 and 5: a saved kitchen *"keeps showing the price it was quoted at"*; *"Nothing auto-updates."* Answers ADR 0062's M8 consequence as *keep the snapshot*. No `pricingVersion` is added to `DesignSchema`. |
| D8 | A submission succeeds only when its row is stored **and** the notification is accepted by the provider. A retry with the same client request id never stores a second row and re-attempts only what is missing. | [inf] Lets the app role read no contact column (Q14) and still never lose a lead silently. Depends on Q3 (answered (a)). **The notification is sent before the response, not in `after()`:** `after` schedules *"work to be executed after a response (or prerender) is finished"* [doc `next/dist/docs/01-app/03-api-reference/04-functions/after.md:6`, next 16.3.8], and work that runs after the response cannot change it. |
| D9 | A honeypot hit, a failed bot check and a too-fast submit are refusals. None answers as a success. | [doc] ARCH §9: *"must not fake customer success"*, read to cover every false success. |
| D10 | Counters are keyed by a SHA-256 of the bucket identity, in fixed windows. The table holds no raw address or e-mail. | [inf] Data minimisation. Residual: a fixed window admits up to twice the limit across one boundary; the security reviewer rules on it. |
| D11 | The mint's session bucket must survive ADR 0114 H1's rotation, which changes the visitor value on every mint. The mechanism is fixed in 8F S0. | [doc] ADR 0019 d3 keys a bucket on the session; ADR 0114 H1 rotates it. **A gap between two records.** Preferred [inf]: count the visitor's own `designs` rows created in the window, since rotation moves those rows. |
| D12 | In the application layer *"challenge"* means: the request must carry a passing bot verdict, else it is refused. | [doc] ADR 0019 d5 gives application rows the action *challenge* and defines it only for the WAF. **A gap.** Depends on Q16, and through it on Q21: with no bot check on the launch host, *challenge* has no mechanism and this row returns to planning. |
| D13 | The contact card shows the review's room summary line, the body count and the price. No preset name. | [doc] ADR 0131. |
| D14 | A kitchen with no cabinet cannot be submitted: the CTA is disabled with its reason. | [src] the breakdown is already `unavailable` for it (`price-breakdown-model.ts:118`). [doc] §13.1: never offer what cannot be satisfied. |
| D15 | The endpoint is `POST /api/contact-submissions` (ARCH §9). ADR 0019's table calls it `POST /api/contact`. | Two records, one endpoint; the ADR gets a pointer. |
| D16 | The request reference is random, not sequential. Frame 5A's *"LM‑2614"* is a shape, not a counter. | [inf] A sequence publishes the shop's volume. |
| D17 | Contact details are never written to the design, the store, a URL, a cookie or browser storage. | [doc] ARCH §8: *"Step 4 does not persist PII in the configuration or browser repository."* Frame 5B's wording conflicts: Q18. |

## Owner questions

None may be closed by inventing a value. Each names the first wave it blocks. Recommendations are the
architect's.

### The owner's answers, 2026-10-07

**The answer, verbatim** (relayed by the coordinator):

> "Moldova only for now, rest as recommended"

**What it was a reply to.** The coordinator had relayed Q1–Q20 as a table with the architect's
recommendation for each. Before answering, the owner asked two things, verbatim:

> "what if currently this will run only for Moldova that is not in EU?"

> "to be GDPR compliant uh, the server should be in Europe I think the Vercel is only for development
> later we will uh, develop or we will yeah deploy this in uh, uh, Moldova server on a Moldova server
> will be this enough or do we need to do something additional to be GDPR compliant?"

The coordinator then asked three things (the coordinator's wording, relayed, not quoted): where
production runs, Vercel or a Moldovan server; where the database lives, Neon or Postgres on that
server; who the customers are at launch, Moldova only or the diaspora too. **The owner's reply
answers the third only.**

**Ruled.**

1. **Verbatim:** customers at launch are Moldova only, *"for now"*.
2. **By reference:** Q1–Q20 *"as recommended"*. Each is recorded below as *answered 2026-10-07, as
   recommended (relayed)*: it is the architect's recommendation as this file stated it at
   `7519005`, accepted in one phrase. It is not the owner's own wording on that question.

**Not ruled, and kept open.**

- **Where production runs and where the database lives.** *"the Vercel is only for development"* and
  *"deploy this … on a Moldova server"* are a stated intention with no date and no target. They are
  not a ruling. Q21 and Q22. Five recorded answers depend on them and are marked **conditional**.
- **The owner's own question about GDPR.** No agent answers it: which law governs a Moldovan shop
  serving Moldovan customers, and what it requires, is a legal question. What this plan can supply
  is a list of what personal data is kept, by whom and in which country; 8S prepares it.
- **Three places where *"Moldova only"* and *"as recommended"* pull apart.** Neither reading is
  picked here: Q23 (non-Moldovan traffic), Q24 (phone numbers), Q26 (frame 4A's hint). On Q24 the
  coordinator told the owner that *"Moldova only"* could mean Moldovan numbers alone. That is the
  coordinator's reading, labelled as such; the owner did not say it.
- **One answer overtaken by a fact read after it was given:** Q4, reopened as Q25.

| Q | Recorded answer (as recommended, relayed) | State |
| --- | --- | --- |
| 1 | (b): profiles are **M8B**, after M8, before launch | Settled |
| 2 | (a): `/d/{id}/review`, `/d/{id}/contact`, `/d/{id}/done` | Settled |
| 3 | (a): a stored row and an e-mail to the shop's inbox | Settled. **Owed:** the inbox address; the shop's phone number |
| 4 | (a): Resend over plain HTTPS | **Reopened as Q25.** **Owed:** the sending domain, or the mailbox |
| 5 | (a): the text summary and the stored snapshot; 5A's WhatsApp action is built on the customer's own share link | Settled |
| 6 | (i) locality optional; (ii) the e-mail input appears with the *E‑mail* chip and is required then | Settled. (iii) is **Q24** |
| 7 | (b): placeholder text and a gate line | Settled. **Owed:** the consent and privacy text |
| 8 | (a): no response time anywhere; 4A's hint is not drawn | Settled, with **Q26** asked |
| 9 | Both lists are slots until the owner confirms them line by line | Settled. **Owed:** the not-included list; 5A's three steps |
| 10 | (a): drafted wording enters the copy lock in its wave; slots excluded; the Russian is re-signed at the gate | Settled |
| 11 | (a): the e-mailed edit link is dropped | Settled |
| 12 | (i) a callback with no design is a submission; (ii) the link e-mail is left out until the provider is live, then built as a slice of 8L | Settled |
| 13 | (i) kept until removed by hand; (ii) no copy in Blob | Settled. (ii)'s *"Neon's six-hour restore"* is **conditional on Q22**. A sending provider may hold a further copy: Q25 |
| 14 | Both grants as stated | Settled, with two conditions from the Postgres documentation (*8A figures*, §8) |
| 15 | (a): the numbers stand until 8A S1 measures; (iii) 600 an hour per network for page reads, failing open | Settled. Where the address and the country come from is **conditional on Q21**; how a non-Moldovan request is treated is **Q23** |
| 16 | (a): BotID's free tier | **Conditional on Q21** |
| 17 | (a) if it stages cleanly in `log`, else (b) | **Conditional on Q21** |
| 18 | (a): memory only; the sentence is reworded | Settled |
| 19 | The set is limiter + WAF | **Conditional on Q21** for the WAF half. The storage-alert decision waits for 8A S1's figure, which was not in front of the owner |
| 20 | The version current at launch is the first stored schema; existing rows are kept | Settled |

**Still owed by the owner, as facts no agent may supply:** the shop's inbox address and phone number
(Q3); the sending domain or mailbox (Q25); the consent and privacy text (Q7); the not-included list
and 5A's steps (Q9); and the name of the project's Vercel plan, read off the dashboard (*8A
figures* infers Hobby and does not know it).

### The questions as put

**Q1 — Are profiles part of M8, or their own milestone?** *[Answered 2026-10-07: (b), as
recommended (relayed).]* ADR 0115: *"In M8, with e-mail"*.
Profiles are ten waves (8N, 8P1–8P9) beside seventeen for everything else.
(a) Keep them in M8 as Part P. (b) Make them **M8B**, after M8 and still before launch, with their
own branch and pull request.
*Recommended: (b).* Nothing ships before every milestone is done, so the split costs no release, and
a pull request of twenty-seven waves is not a reviewable unit. It changes ADR 0115's wording, so it
is the owner's. *Blocks:* 8N.

**Q2 — The addresses of screens 3–5, and screen 5's name.** *[Answered 2026-10-07: (a), as
recommended (relayed).]* The mockup writes `/configurator/done`,
the architecture proposal `/configurator/success`.
(a) `/d/{id}/review`, `/d/{id}/contact`, `/d/{id}/done` (D1). (b) the same with `/success`.
(c) the mockup's unaddressed `/configurator/…` paths, resolved from the cookie.
*Recommended: (a).* Frame 5B, the failure, lives on the same route, which `success` misnames.
*Blocks:* 8D.

**Q3 — How does Lemnaria receive a request?** *[Answered 2026-10-07: (a), as recommended
(relayed). The address and the phone number are still owed.]* No dashboard exists before the post-M8 one.
(a) A stored row **and** an e-mail to the shop's inbox with the customer's details and the kitchen's
summary. (b) The row only; someone queries the database. (c) The e-mail only.
*Recommended: (a).* It also needs two facts from the owner: the inbox address, and the shop's phone
number for frame 5B's *"Sună direct la magazin"*. With (a) the mail provider processes personal
data, which the privacy text must say (Q7). *Blocks:* 8J.

**Q4 — The mail provider and the sending domain.** *[Answered 2026-10-07: (a), as recommended
(relayed). **Reopened as Q25:** the recommendation assumed an EU region, and 8A S2 then read that
Resend's EU region sends from Ireland while all account data is stored in the United States.]*
(a) Resend. (b) Postmark. (c) Amazon SES.
(d) The shop's existing mailbox over SMTP.
*Recommended: (a), called over plain HTTPS with no SDK dependency* [~~inf~~ **[ven]** *8A figures*
§4: the HTTP API and the free tier are confirmed; the EU region is **not** what this sentence
assumed]. Any choice needs
DNS records on a Lemnaria domain, which only the owner can add. *Blocks:* 8J.

**Q5 — What does the manufacturer see of the kitchen?** *[Answered 2026-10-07: (a), and the
WhatsApp action built on the customer's own share link, as recommended (relayed).]* A design opens only in its owner's browser,
and a design has one share link at a time (ADR 0114 B2), so issuing one for the shop would revoke
the customer's.
(a) The text summary in the e-mail and the stored snapshot; the 3D view waits for the dashboard.
(b) Also a read-only link to the stored snapshot: a new token, table and route.
(c) Spend the design's one share link on the shop.
*Recommended: (a).* (b) is one more Full-tier wave with a security reviewer. *Blocks:* 8J. It also
decides frame 5A's *"Trimite design-ul pe WhatsApp"*: build it on the customer's own share link,
which re-issues and so revokes a link they already sent (recommended, with the existing warning), or
leave it out of M8. *Blocks:* 8M.

**Q6 — The contact fields.** *[Answered 2026-10-07: (i) and (ii) as recommended (relayed).
**(iii) is not settled:** see Q24.]* ADR 0001 d6 requires name and phone and makes e-mail optional. Three
things are unrecorded.
(i) Is *Oraș sau localitate* required? *Recommended: optional.*
(ii) No frame draws an e-mail input, but a channel chip is *E‑mail*. *Recommended:* the input appears
only when that chip is chosen and is required then.
(iii) Frame 4B says *"Așteptăm 8 cifre după prefix"*. ADR 0019 d4 names the diaspora in Romania and
Italy. *Recommended:* accept a Moldovan number (0 and eight digits, or +373 and eight) and any
international number written with `+`; frame 4B's sentence applies to the Moldovan form.
*Blocks:* 8H.

**Q7 — Consent and privacy text.** *[Answered 2026-10-07: (b), as recommended (relayed). The text
is still owed.]* The consent sentence, where *"Detalii"* leads, the privacy notice,
the processors it names and what it says about retention are legal copy no agent writes.
(a) The owner supplies them before 8L. (b) 8L builds with text that is visibly a placeholder, and
the launch gate holds a line that cannot be ticked until the owner's text replaces it.
*Recommended: (b).* The stored submission records which consent text version was shown either way.
*Blocks:* 8T, not the build.

**Q8 — May a response time be promised?** *[Answered 2026-10-07: (a), as recommended (relayed).
Q26 asks whether "Moldova only" changes it.]* Frame 4A draws *"În Moldova sunăm de obicei în aceeași zi
lucrătoare."* under the phone field. Frame 5A's note says *"Termenele nu sunt promise"*.
(a) No time anywhere; 4A's hint is not drawn. (b) Keep 4A's hint as worded. (c) The owner's wording.
*Recommended: (a) until ruled.* *Blocks:* one leaf in 8L.

**Q9 — What the estimate includes, and the "not included" list.** *[Answered 2026-10-07, as
recommended (relayed): slots until the owner confirms. The confirmation itself is still owed.]*
Frame 3B lists *Blat de lucru și
cant; Electrocasnice și chiuvetă; Transport și montaj; Racorduri electrice și sanitare*. Two records
bear on it: the approved breakdown disclaimer already says *"Nu include transport, blat sau
electrocasnice"* (`ro.json:217`) [src], and ADR 0092 prices two sink extras, so *"chiuvetă"* is partly
**in** the estimate. Frame 5A's step 2 promises a final price *"cu blat, feronerie și montaj
incluse"*, a commercial statement.
*Recommended:* the owner confirms the list and 5A's three steps line by line; until then both are
slots drawn from the existing disclaimer. *Blocks:* 8T. 8C and 8M build the slots.

**Q10 — How is M8's new wording approved?** *[Answered 2026-10-07: (a) with the Russian backstop,
as recommended (relayed).]* ADR 0113's *"Mark as approved at the moment"* was given
for Step 1.
(a) The same rule for M8: drafted wording enters the copy lock in the wave that adds it and the owner
adjusts later; the slots of Q7, Q8 and Q9 are excluded and wait for the owner's text.
(b) A reading gate before 8T, as Gate O1 and O2 were.
*Recommended: (a), plus ADR 0095's backstop re-sign of the Russian at the gate.* *Blocks:* 8C, the
first wave that adds a leaf.

**Q11 — Does the e-mailed edit link survive?** *[Answered 2026-10-07: (a), dropped, as recommended
(relayed).]* ADR 0115 obligation 12 leaves it to this phase.
(a) Drop it: the profile is the way back. (b) Keep it for a customer who submits without a profile.
*Recommended: (a).* (b) is a second way to bind a browser to a design, sent over e-mail, with its own
review. *Blocks:* 8M's copy.

**Q12 — Frame 2F's two exits.** *[Answered 2026-10-07: (i), and (ii)(b) then (a), as recommended
(relayed).]* A device without WebGL is offered *"Vreau să mă contactați"* and
*"Trimite-mi linkul pe e‑mail"*; neither has a design.
(i) *Recommended:* a callback request with no design is a submission through the same endpoint.
(ii) The link e-mail sends our mail to an address nobody verified. (a) Build it: fixed text, no
customer-written content, three a day per address, under the limiter. (b) Leave that exit out of M8.
*Recommended: (b) until Q4's provider is live, then (a) as a slice of 8L.* *Blocks:* 8H.

**Q13 — How long is contact data kept, and is it backed up?** *[Answered 2026-10-07: both as
recommended (relayed). (ii)'s point-in-time restore is conditional on Q22.]* The owner's 2026-09-15 ruling was
about configurations; contact details are personal data, so it is asked, not extended.
(i) Kept until someone removes it by hand (recommended, said in the privacy text), or a stated
period.
(ii) The Blob export never contains it (ADR 0012). Is there a second copy? *Recommended:* none in
Blob; the shop's inbox is the second copy and Neon's six-hour point-in-time restore the third.
*Blocks:* 8T.

**Q14 — Database grants for the two new tables.** *[Answered 2026-10-07: both, as recommended
(relayed).]* Issued by the owner after each migration, as for
`design_share_links`.
(i) Contact submissions: `INSERT`, plus `SELECT` and `UPDATE` on the non-personal columns only
(reference, client request id, design id, revision, payload hash, timestamps, notified-at). **The
application role cannot read a name, a phone number or an e-mail address**, so a leaked
`DATABASE_URL` does not leak the leads.
(ii) Rate-limit counters: `SELECT, INSERT, UPDATE, DELETE` on that table alone, because pruning is a
delete. It holds hashes and counts.
*Recommended: both as stated.* [~~inf~~ **[ven]** *8A figures* §8: Postgres permits the idempotent
insert under column-scoped `SELECT` **if** the conflict target is written out and names only granted
columns, and `RETURNING` names only granted columns. 8I still measures it on the test database
before the grant is asked for.] *Blocks:* 8E, 8I.

**Q15 — ADR 0019's limits against how the product is now used.** *[Answered 2026-10-07: (a), and
600 an hour for (iii), as recommended (relayed). 8A S1's measurement is still owed. (iii)'s figure is
an **application** limit; it was never a firewall rule, whose window is at most ten minutes (*8A
figures* §7).]*

**Reconciled with 8A S1, 2026-10-07. Q15 quoted ADR 0019 correctly; nothing in it changes and it
does not return to the owner.** ADR 0019 d5 gives the mint four numbers in its own row and a fifth
in the global table, both under decision 5 [doc; re-read 2026-10-07]. Q15 and 8A S1's part C each
used different ones:

| Dimension | ADR 0019 d5, `POST /api/designs` | Used by |
| --- | --- | --- |
| A Moldovan network block, per hour | 10 | Q15 (i) |
| A Moldovan network block, per day | 30 | 8A S1 C: 15.0 MiB a day |
| A non-Moldovan network block, per hour | 3, plus challenge; **no day figure** | 8A S1 C: 36.0 MiB a day |
| A session, per hour | 5 | Q15 (i) |
| All of `/api/*`, per hour | 1,000, challenge only | 8A S1 C: 11.7 GiB a day |

Q15's recommendation was that the figures come back to the owner if an ordinary session crosses
half a limit. 8A S1's scripted session made 1 mint against 5 an hour and 3 saves against 300: it
does not. That session is one script, not a sample of customers, so what it establishes is the
unit cost: one mint and one save for each *Continuă*, and one save for each applied edit. Q15's
arithmetic is unchanged by it. A sixth *Continuă* in an hour is refused, and the owner's recorded
answer accepts that with a message saying how long to wait. *[End of the 2026-10-07 note.]*

The numbers predate two facts.
(i) Every Step 1 *Continuă* mints a design (ADR 0111 d5). The mint limit is 5 an hour per session,
10 an hour per network. A customer trying six room sizes in an hour is refused.
(ii) The save limit is 300 an hour per session; the coalescer allows one save a second. About ten
minutes of steady editing reaches it.
(iii) ADR 0114 d7 puts `/`, `/d/*` and `/s/*` in the limiter's scope and ADR 0019 gives them no
number.
(a) Keep the numbers; a refusal says how long to wait, and a refused save is queued, never lost.
(b) Raise them. (c) Change what a customer action costs.
*Recommended: (a), after 8A measures a real session and the e2e suite;* the figures come back to the
owner if an ordinary session crosses half a limit. For (iii), 600 an hour per network, failing open.
*Blocks:* 8F.

**Q16 — The bot check.** *[Answered 2026-10-07: (a), as recommended (relayed). **Conditional on
Q21:** BotID is a Vercel service.]* (a) Vercel BotID's free tier. (b) Its paid tier. (c) None;
honeypot and timing only. *Recommended: (a)* [~~inf~~ **[ven]** *8A figures* §1: the free tier and
the API are confirmed; (b) cannot be bought on Hobby; the CSP needs are **undocumented**]. ADR 0019
also asks for a minimum time-to-submit and gives no number: 8K proposes one and the phone gate proves
an autofilled form sent by a real tap passes. *Blocks:* 8K.

**Q17 — The one firewall rate rule.** *[Answered 2026-10-07: (a) if it stages cleanly, else (b), as
recommended (relayed). **Conditional on Q21:** the rule is Vercel's firewall.]* The plan allows one
`rate_limit` rule; the runbook spends it on `/api/`. ADR 0114 d7 wants pages in scope too.
(a) Widen the rule to every path except static assets, if one rule can express that [~~inf~~
**[ven]** *8A figures* §7: negated conditions exist, so one rule can; what happens past the included
request count is unverified].
(b) Keep `/api/`; pages rely on the application limiter; ADR 0114 d7 gets a dated amendment.
*Recommended: (a) if it stages cleanly in `log` mode, else (b).* Publishing is the owner's action.
*Blocks:* 8R.

**Q18 — Frame 5B says *"Design-ul și datele tale sunt salvate pe telefon"*.** *[Answered
2026-10-07: (a), as recommended (relayed).]* The design is saved on
the server; D17 keeps contact details in memory only.
(a) Memory only; the sentence is reworded to what is true (kept while this page is open).
(b) Keep the typed details in the tab's session storage until the request is sent, amending ARCH §8.
*Recommended: (a).* The CSP does not yet enforce, so script-readable storage is the weaker place.
*Blocks:* 8M.

**Q19 — The launch gate after the reaper's retirement.** *[Answered 2026-10-07: the set is limiter
+ WAF, as recommended (relayed). **Conditional on Q21** for the WAF half. The storage-alert decision
is still owed: 8A S1's figure was not in front of the owner.]*

**The figure, 2026-10-07** (8A S1 part C; *8A figures*). At the recorded limits one Moldovan network
block can add 15.0 MiB of rows a day, every day, and nothing removes them; one non-Moldovan block
36.0 MiB (see Q23's rider). The nightly export copies every row, so it grows by the same amount.
The global brake does not bound storage: it challenges, and it is 11.7 GiB a day if passed. **What
this plan has not read is the database plan's storage ceiling**, so it cannot say how many days
that is. **To the owner:** with this in front of them, (a) add a storage alert on the database, or
(b) do not. *Recommended: (a).* It is the only thing that tells anyone before the ceiling does.

The gate was *limiter + retention + WAF,
together*. With retention retired, what gets past the limits is kept forever.
*Recommended:* confirm the set is **limiter + WAF**; 8A states the worst case the limits admit in
bytes per day (backlog 92), and the owner decides whether to add a storage alert on Neon.
*Blocks:* 8T.

**Q20 — The first stored schema.** *[Answered 2026-10-07, as recommended (relayed).]* ADR 0038
ends at first release. *Recommended:* the document
version current at launch is declared the first stored schema; every later model change owes a
migration arm; rows already in production are kept (add-only). *Blocks:* 8S.

**QP1–QP5** (profiles; asked in 8N, block only Part P): the password's minimum length and the
breached-password source; session lifetime; what the dashboard's *delete* and account deletion do
when the application role may not delete a design (recommended: profile data is scrubbed in place and
a design is hidden, not removed); the length and character rules of a design's name; whether profile
rows are backed up to Blob. **Moved to M8B with Part P (Q1, 2026-10-07).**

### Follow-up questions, 2026-10-07 — open

Raised by the owner's answer and by 8A S2's reads. None is answered.

**Q21 — Where does production run at launch?** The owner said *"the Vercel is only for development"*
and that the product will later be deployed *"on a Moldova server"*, without a date. M8's security
design is written for Vercel: ADR 0019 d2 makes Vercel the firewall, d4 reads the country from it,
d9 rejects any other proxy in front, and d10 stages its rules. Off Vercel these have no
counterpart yet:

- the bot check (Q16): BotID's challenge scripts are served through `api.vercel.com` [ven §1]; how
  it answers elsewhere is undocumented;
- the firewall rule (Q17, 8R) and the free absorption of volume that d2 rests on;
- the client address: on Vercel `x-forwarded-for` is overwritten by the platform [ven §2]; on
  another host it is whatever the reverse proxy in front is configured to send;
- the country: `x-vercel-ip-country` is Vercel's header [ven §2];
- the scheduler for the nightly jobs, and the Blob store the backup writes to.

(a) Vercel at launch, as today. (b) A Moldovan server from launch. (c) Vercel at launch; the move is
its own later milestone, with its own security plan.
*Recommended: the owner rules the launch host now, and (c).* Everything built and measured so far
runs on Vercel. With (b), M8 drops the bot check, 8R and the gate's WAF half, and **launch waits for
a hosting milestone** that replaces them and re-reads ADR 0019 d2, d4, d9 and d10; the application
limiter alone is what d2 warns becomes the denial of service. *Blocks:* 8F S1, 8K's bot check, 8R,
8T's gate. *Makes conditional:* Q15's sources, Q16, Q17, Q19.

**Q22 — Where does the database live at launch?** Today it is Neon, in `eu-central-1` [doc ADR
0007:32].
(a) Neon, as today. (b) Postgres on the Moldovan server.
*Recommended: (a) through M8.* Every connection is opened with Neon's own driver [src, the six sites
in 8B]; that it cannot reach an ordinary Postgres server is [inf], and 8B's single opener is where a
change would land. With (b) the six-hour point-in-time restore of Q13 (ii) goes, the backup needs a
new home, and each store wave's live suite changes: that is the hosting milestone's work, not M8's.
The SQL of 8E and 8I is ordinary Postgres [inf]. *Blocks:* nothing in M8 if (a). *Makes
conditional:* Q13 (ii).

**Q23 — What does "Moldova only" mean for a request from outside Moldova?** ADR 0019 d4: such
traffic *"is never denied outright"*; it gets a tighter limit and a challenge. It gave three reasons:
the diaspora, roaming and VPNs that geolocate to a neighbour, and the owner testing from abroad.
*"Moldova only for now"* speaks to the first.
(a) d4 stands: tighter and challenged, never denied. (b) Deny outright. (c) No geography: one limit
for everyone.
*Recommended: (a).* Two of d4's three reasons do not depend on the diaspora, and a wrongly denied
customer simply never arrives. If Q21 is (b) there is no country header, and (c) is what remains
unless a location database is added. *Blocks:* 8F S1, S2.

**A rider, added 2026-10-07 from 8A S1's part C.** ADR 0019 d5 gives a Moldovan network block 10
mints an hour **and 30 a day**. It gives a non-Moldovan block 3 an hour and **no day figure**. Three
an hour is 72 a day, so the tier the record calls *"much tighter"* admits more than twice the
Moldovan tier's rows in a day: 36.0 MiB against 15.0 MiB at the largest design. The record's numbers
are not re-decided here; the missing one is asked for.
(a) The non-Moldovan block also gets a day cap, no higher than the Moldovan 30. (b) Leave it: the
challenge is the control. *Recommended: (a), at 10 a day* — a third of the Moldovan figure, as its
hourly 3 is of 10. That number is the architect's proposal and needs the owner's word.

**Q24 — Which phone numbers are accepted?** (Q6 (iii), narrowed.) The two readings of the owner's
answer disagree: *"rest as recommended"* keeps Moldovan numbers plus any international number written
with `+`; the coordinator's reading of *"Moldova only"* is Moldovan numbers alone.
(a) Moldovan numbers only. (b) Moldovan, plus international with `+`.
*Recommended: (a) for launch.* This reverses the architect's earlier (b), whose stated reason was
the diaspora. Frame 4B's sentence then applies to every number. The stored form is the full
international one either way, so widening later adds a rule and migrates nothing. *Blocks:* 8H S1.

**Q25 — The mail provider, given where it keeps data.** (Q4, reopened.) The notification carries a
name and a phone number. What 8A S2 read [ven §4]:

- **Resend:** *"All account data, including email metadata, logs, and API records, is stored in the
  United States regardless of the sending region you select"*; it *"retains email data for 30 days"*.
- **Postmark:** *"We currently don't have plans to add servers in the EU"*.
- **Amazon SES:** regional endpoints in Frankfurt, Ireland, Milan and Stockholm; requests are
  signed, so no SDK means writing the signing by hand; its data-residency wording was not read.

Whichever is chosen, the message ends in the shop's own inbox, whose host keeps it.
(a) Resend, named in the privacy text as a processor in the United States. (b) Amazon SES in an EU
region. (c) The shop's own mail host over SMTP, from a mailbox made for this and nothing else: no
second processor. (d) Postmark.
*Recommended: (c), if the shop's mail host allows it; else (a).* Unverified, and owed to an 8J S0
before any code: that the host permits outbound SMTP, and the SMTP client dependency, which is a
dependency change at the security tier [inf, both]. The mailbox must be a dedicated one: its password
in a leaked environment must not open the shop's correspondence. Whether a United States processor
is acceptable is the owner's and their lawyer's to say. *Blocks:* 8J S1's adapter only; the port,
the fake and the message text do not wait.

**Q26 — Frame 4A's hint, *"În Moldova sunăm de obicei în aceeași zi lucrătoare."*** (Q8, narrowed.)
*"As recommended"* means it is not drawn. *"Moldova only"* removes the hint's qualifier as a
difficulty, since every customer is now in Moldova; it does not say a time may be promised.
(a) Not drawn. (b) Drawn as the frame has it.
*Recommended: (a) stands.* The open matter was the promise, not the geography. *Blocks:* one leaf in
8L.

## Waves

The last column was *Blocked by* and named Q1–Q20. It was restated on 2026-10-07 after the owner's
answers; the questions each wave first waited on are in *The questions as put*.

| Wave | Covers | Packages | Tier | Waits for, as of 2026-10-07 |
| --- | --- | --- | --- | --- |
| 8A | Measurements, vendor reads, the questions | none (docs, scratch) | Light | S1, S2 and S3 are in (*8A figures*, *The owner's answers*). Not closed: Q21–Q26 are open, and its review has not been run |
| 8B | A driver error never prints the connection string | persistence, web | Full + security | **Nothing. Dispatchable** |
| 8C | The review as a value: rows, room line, submit eligibility | web, domain (read) | Full | **Nothing. Dispatchable** (Q10 answered) |
| 8D | The review route and screen 3A/3B; the CTA gets its destination | web | Light + visual; security on S1 | **Nothing but 8C. Dispatchable** (Q2 answered) |
| 8E | The rate-limit store | persistence | Full + security | **Nothing. Dispatchable** (Q14 answered) |
| 8F | The limiter and the mint (SEC-001, backlog 90) | web | Full + security | **Q21** (address and country source); **Q23** and its rider; the three red e2e specs triaged (8A S1's counts are in) |
| 8G | The limiter on saves, shares and reads; pruning | web, persistence | Full + security | 8F |
| 8H | The submission contract | domain | Full | **Q24**, for the phone rule in S1 only |
| 8I | The contact submissions store | persistence | Full + security | **Nothing but 8E's migration number. Dispatchable** (Q14 answered); S0 measures first |
| 8J | The mail port, the provider adapter, the shop notification | web | Full + security | **Q25**, for the adapter only |
| 8K | `POST /api/contact-submissions` | web | Full + security | **Q21** (the bot check); 8F, 8H, 8I, 8J |
| 8L | The contact screen 4A/4B/4C | web | Full + visual | 8H, 8K; **Q26** for one leaf |
| 8M | Success 5A and failure 5B | web | Full + visual | 8L (Q5, Q11, Q18 answered) |
| ~~8N~~ | ~~Profiles: design record and owner answers~~ | | | **Moved to M8B** (Q1) |
| ~~8P1–8P9~~ | ~~Profiles (see Part P)~~ | | | **Moved to M8B** (Q1) |
| 8Q | The CSP enforces | web | Full + security | 8L; a preview measurement of the bot check's scripts if Q21 keeps it |
| 8R | The firewall rules, staged | none (runbook, owner action) | Coordinator-only | **Q21** |
| 8S | Pre-launch checks | none (docs, owner reads) | Light | The owner's facts (Q3, Q7, Q9); **Q22** for the data list |
| 8T | The phone gate, the desktop line, the phase gate | — | Coordinator + visual | **Q21** (the gate's WAF half); the owner's text in every slot |

**Order: 8A → 8B → 8C → 8D → 8E → 8F → 8G → 8H → 8I → 8J → 8K → 8L → 8M → (8N → 8P1 … 8P9) → 8Q →
8R → 8S → 8T.** One writing agent per tree (R2). 8B has no dependency and may run first. 8C and 8D
come early because the review is the only part with no open security question. 8F needs 8E. 8K needs
8F, 8H, 8I and 8J. 8Q follows 8L because 8L makes the contact pages dynamic. ~~If Q1 is (b), 8N and
8P1–8P9 leave for M8B and 8M's profile offer is a named interim.~~

**Restated 2026-10-07, after the owner's answers.** Q1 is (b): 8N and 8P1–8P9 have left for M8B.
**M8 is seventeen waves and ends at 8T**, with the review, the contact form, the success and failure
screens, the limiter, the submission boundary, the CSP and the launch gate built, and with no
profile: a customer still reaches a design only in the browser that made it (ADR 0114), and 5A says
so. **M8B follows and is still before launch.**

**Order now: 8B → 8C → 8D → 8E → 8I**, each dispatchable as written. **8I moves ahead of 8F–8H**: its
port takes column values, not 8H's request type, so it needs nothing from them [inf; falsified if
8I's slice finds it must import a type 8H has not yet defined]. Then, as their questions close:
8H (Q24) → 8J (Q25) → 8F (8A S1, Q21, Q23) → 8G → 8K (Q21) → 8L → 8M → 8Q → 8R (Q21) → 8S → 8T. A
wave whose question is still open when its turn comes is skipped, not started on a guess.

**Named interims** (`WORKFLOW.md`, *Nothing ships mid-milestone*): after 8D the review's *Cere oferta*
leads to the placeholder contact page until 8L; after 8L a sent request shows no success screen until
8M; 5A's profile offer is absent ~~until 8P7~~ **for the whole of M8, until M8B's modal wave**.

**Every dispatch in M8 bans by name:** `git stash`, `git stash pop`, `git checkout -- .`,
`git reset --hard`, `git clean`; deleting database rows; printing an environment value; creating,
changing or removing an environment variable or a provisioned resource.

### 8A — measurements, vendor reads, the questions

*Goal.* Replace every **[inf]** about a vendor with a quotation, give later waves their figures, and
put Q1–Q20 to the owner. No production code. *Tier: Light, one logic reviewer.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | Measures: the prerendered routes from a real build's `prerender-manifest.json`; `POST /api/designs` and `PUT` counts for one ordinary customer session and for one full e2e run; the worst case ADR 0019's mint limits admit in bytes per day at `MAX_DESIGN_BYTES`; which thrown errors carry the connection string, using a **fake** malformed URL with a recognisable fake password | scratchpad only | ADR 0019 d5, d6, d11 and both notes; ADR 0041 d3; backlog 92; `api/designs/route.ts`; `persistence/save-coalescer.ts`; `design-bounds.ts:180`; `environments-and-resources.md` |
| S2 | Reads and quotes, with the version or the date read: the bot check's plans, client and server API and CSP needs; the platform's client-address and country headers and who sets them; the cron limits of the current plan; the Q4 provider's HTTP API, sandbox and regions; whether the deployed Node runtime has a built-in argon2id; Next 16's rules for work after a response (`node_modules/next/dist/docs/`) | scratchpad; then a *8A figures* section in this file | `documentation.md`, *Label the evidence tier*; `apps/web/AGENTS.md` |
| S3 | Puts Q1–Q20 to the owner. Each answer is recorded as relayed or verbatim | this file, by the scribe | `documentation.md`, *A rule the owner described in conversation is not yet an invariant* |

*Criteria.* (1) Every later wave's **[inf]** about a vendor is either replaced by a quotation with
its source or listed as still unverified with the wave it blocks. (2) No figure is reported that was
not measured; each names its script and output file. (3) *Must not:* a real credential is used or
printed; a request is sent to production; a loop is used to probe a limit.

*QA reading:* S1's scripts and outputs; R4, R5, R9. *Reviewer reading:* this file's *Plan decisions*
and *Owner questions*; ADR 0019.

### 8A figures

#### S1 — measurements, 2026-10-07

~~**Placeholder.** 8A S1 is running.~~ **In.** Every figure is another agent's run. The architect
read each output file named below on 2026-10-07 and re-ran nothing; the coordinator read
`D-summary.out` only. Files are in `m8-8a-s1/` in the session scratchpad. All database values in
part D are fakes (`FAKEPASSWORD_8A`, `fakeuser_8A`, `fakehost-8a.invalid`).

| | Figure | Value | Script → output |
| --- | --- | --- | --- |
| A | Prerendered routes in a real build | **Four:** `/_global-error`, `/_not-found`, `/ro/configurator/contact`, `/ru/configurator/contact`. The same after the CI-mode build (the two output files are byte-identical) | `A-prerendered-routes.mjs` → `A-prerendered-routes.out`, `…after-ci-build.out` |
| B i | One scripted session: Step 1 (straight room, wall A and height typed), *Continuă* into the editor, the dearest material applied, the dearest hardware applied, a reload | **1** `POST /api/designs` (201); **3** `PUT` (200): the hand-off write 0.06 s after the mint, then one per applied setting. 38 requests in all | `B-session.spec.ts` → `B-session-count.out`, `B-session-timeline.out` |
| B ii | One full e2e run on `next dev` | 622 passed, 2 skipped. **444** `POST /api/designs` (443 × 201, 1 × 403); **266** `PUT` (264 × 200, 2 × 403); 813 `GET /api/designs/{id}`; 58 share `POST`s; 33,226 requests answered. **All from one address** | `B-count.mjs` → `B-e2e-dev-count.out`; `B-e2e-dev-playwright.out` |
| B ii | The same with `CI=1` (a build and `next start`) | 619 passed, **3 failed**, 2 skipped. 444 `POST`, 265 `PUT`. The failures: `qa-7e3b-s6-lock.adversarial.e2e.spec.ts:112`, rounds 1 and 5, and `qa-7e3b-s6-two-tab-convergence.adversarial.desktop.e2e.spec.ts:21`, round 2 of 3 (*"did not open with canWrite: true"*). **Not investigated by anyone** | `B-e2e-ci-count.out`; `B-e2e-ci-playwright.out` |
| C | The largest storable design | `MAX_DESIGN_BYTES` = **523,972**, recomputed from `design-bounds.ts` and matched against the built package; equals backlog 92's figure | `C-worst-case-bytes.mjs` → `C-worst-case-bytes.out`; `C-crosscheck-runtime.out` |
| C | Rows a limit admits in a day, each at that size | One Moldovan network block, the day cap binding: 30 rows, **15.0 MiB a day**, 450 MiB in thirty days. One non-Moldovan block: 72 rows, **36.0 MiB a day** (3 an hour and no day cap). One session: 120 rows, 60.0 MiB. The global brake, if every request were a mint: 24,000 rows, **11.7 GiB a day**, which needs 800 distinct Moldovan blocks and is a *challenge*, not a refusal | the same |
| D | Which errors carry the connection string | See the table below | `D-probe.mjs`, `D-run-all.sh` → `D-summary.out`, `D-results.ndjson`; `D-route-run.sh` → `D-route/*.server.log`, `D-route/*.out` |

**D in full** [`D-summary.out`]. *pw / host / user* = where the fake password, host and user were
found. *All three* means the thrown error's `message`, its `stack` and its `util.inspect` output.

| Value | The three runtime sites (`neon-configuration-repository`, `share-link-repository`, `design-row-source`) | The two test helpers (`delete-designs-for-tests`) | `migrate` | `migrate-status` |
| --- | --- | --- | --- | --- |
| Bad percent-escape | **Leak:** plain `Error`; pw, host, user in all three | **Leak:** the same | **No return in 45 s** | **Leak:** `MigrationExecutionError` whose `cause` carries pw, host, user; the line the CLI prints does not |
| Missing host | **Leak:** pw and user (there is no host) | **Leak:** `TypeError` `ERR_INVALID_URL`, whose **`input` property** holds the string | **Leak:** the same `TypeError.input`; the printed line is clean | **Leak** in `cause` |
| Non-URL string | **Leak:** all | **Leak:** `TypeError.input` | **Leak:** `TypeError.input` | **Leak** in `cause` |
| Bad port | **Leak:** all | **Leak:** `TypeError.input` | **Leak:** `TypeError.input` | **Leak** in `cause` |
| Empty password | Clean (`NeonDbError`) | Clean | **No return in 45 s** | Clean |
| Wrong scheme | Clean (plain `Error`) | Clean | **No return in 45 s** | Clean |
| Well-formed, unreachable | Clean (`NeonDbError`) | Clean | **No return in 45 s**, nor in 170 s; a refused local port, not in 60 s | Clean |

**At the route** [`D-route/*.server.log`, `D-route/*.out`], on a built app with each bad value as
`DATABASE_URL`:

- **Our own log line is already clean.** It prints *"Connection string: <redacted url>"*.
- **The platform's error logger prints the string in full**, password included, because the route
  rethrows the driver's error untouched: 3 lines in the server log for a bad percent-escape, 3 for a
  missing host, 5 for a non-URL string, 0 for a well-formed unreachable host.
- **No response carries it:** 0 of the 12 recorded response files contains a marker.

**What the figures change.**

- **8B:** the leak is in what is **thrown**, not in what this project logs. Its slices and criteria
  are rewritten below.
- **8Q:** the routes left without a nonce are exactly A's four; 8L S3 removes the two contact pages,
  leaving `/_global-error` and `/_not-found`.
- **8F:** see *What 8F owes the e2e suite* in that wave.
- **Q15:** stands; see its note. **Q19:** the figure the owner was owed now exists. **Q23:** gains
  one rider, the non-Moldovan day cap.
- **ADR 0041 d3** lists five prerendered routes, measured on 2026-08-31. A's four do not contradict
  it: two became Route Handlers in M7 wave 7E3a (ADR 0114, *Decision-record sweep*, the 0041 row)
  and the contact page gained its locale prefix in M6B. The ADR owes a dated pointer; the scribe's.
- **`migrate` does not return** when it cannot connect, for a well-formed address too. ~~That is not
  a leak and is not 8B's; it is a finding with no owner, listed for the backlog.~~ **Restated the
  same day:** it means the connect error's contents are unmeasured, so 8B S2 diagnoses it first
  (criterion 6). It is still listed for the backlog in case the cause lies outside 8B's files.

**From the measurement agent's follow-up, 2026-10-07** (relayed by the coordinator; items 1–3
re-read by the architect in source at `a7b0363`):

1. `migrate.ts:57`, `new Client(connectionUrl)`, is a construction site this plan's list lacked. It
   stands outside the connect `try` and throws a raw `TypeError` `ERR_INVALID_URL` whose message is
   only *"Invalid URL"* and whose `input` property and `util.inspect` output hold the string.
2. `readDeployedSchema`'s own error is clean; the error it attaches as `cause`
   (`migrate-status.ts:80`) is not.
3. `migrate-status.ts` is not built into `dist` [src: `dist/` holds `migrate.*` only;
   `tsconfig.build.json` includes `src/index.ts`].
4. The agent left one row in the test database, `su3IuyF9TqeLXtm6AegGl`, undeleted, as its brief
   required (add-only). It is recorded here so it is not found later as a leak; whether it joins
   backlog 79 and 100's rows is the coordinator's.

#### S2 — vendor reads, 2026-10-07

From `m8-8a-s2/vendor-reads.md` in the session scratchpad, which keeps a raw copy of every page.
All **[ven]**: another agent's quotations, not re-read by the architect, except §6. Section numbers
are that report's.

| § | Subject | What this plan assumed | What the documentation says |
| --- | --- | --- | --- |
| 1 | BotID: tiers | Q16 [inf] a free tier exists | **Confirmed.** *"BotID is available on all plans"*; Basic *"is provided free of charge for all plans"*; Deep Analysis is Pro at *"$1/1000 `checkBotId()` Deep Analysis calls"* (`vercel.com/docs/botid`, last updated 2026-06-16). *"BotID Deep Analysis is not available on Hobby."* (`vercel.com/docs/cli/firewall`) |
| 1 | BotID: wiring | none stated | Package `botid` (published 1.5.11; **not installed here**). `withBotId(nextConfig)`; on *"Next.js 15.3+"*, `initBotId({ protect: [{ path, method }] })` in `instrumentation-client.ts`; on the server `checkBotId()`, whose answer has `isBot`. *"Not adding the protected route … will result in `checkBotId()` failing."* (`vercel.com/docs/botid/get-started`, last updated 2026-06-08) |
| 1 | BotID: forms | none stated | *"BotID does **not** support traditional HTML forms that use the `action` and `method` attributes"*; the request must be a `fetch` or `XMLHttpRequest` from a page (`…/botid/form-submissions`). 8L already sends by `fetch`. |
| 1 | BotID: outside production | none stated | *"Local development always returns `isBot: false`"*; *"In production, BotID always performs real bot detection."* (`…/botid/local-development-behavior`). **Undocumented:** its answer under `next start` off Vercel, which is how the e2e suite runs. |
| 1 | BotID: CSP | Q16 [inf] | **Undocumented.** None of the five BotID pages mentions a CSP or a nonce. S2 read the published package: the client adds a same-origin script element with no nonce. That this passes `'strict-dynamic'` is S2's **[inf]**; the challenge scripts themselves were not read. |
| 2 | Client address | 8F S1 was to learn the header | `x-forwarded-for`: *"The public IP address of the client that made the request."* *"we currently overwrite the `X-Forwarded-For` header and **do not forward external IPs**. This restriction is in place to prevent IP spoofing."* `x-real-ip` and `x-vercel-forwarded-for` are *"identical"* (`vercel.com/docs/headers/request-headers`, last updated 2025-12-13) |
| 2 | Country | 8F S1 was to learn the header | `x-vercel-ip-country`: *"A two-character ISO 3166-1 country code for the country associated with the location of the requester's public IP address."* **Not stated:** whether a value the client sends is discarded; what it holds when the address cannot be located. |
| 3 | Cron | [inf] the plan's cron limit | **Confirmed, no constraint.** *"Cron Jobs are available on all plans"*; 100 per project on every plan; on Hobby *"once per day"*, within the hour. *"Vercel will not retry an invocation if a cron job fails."* A run can also arrive twice (`vercel.com/docs/cron-jobs/usage-and-pricing`, last updated 2026-07-15; `…/manage-cron-jobs`) |
| 4 | Mail | Q4 [inf] HTTP API, free tier, EU region | **Partly; see Q25.** Resend: REST over HTTPS with a bearer key; a `User-Agent` header is required or the call is refused with `403`; an optional `Idempotency-Key`, kept *"for 24 hours"*; free quota *"100 emails/day and 3,000 emails/month"*; no sandbox, and test addresses count against the quota. **The EU region is where mail is sent from, not where data is kept.** |
| 5 | argon2id | [inf] built into the runtime | **Confirmed for Node 24.7.0 and later** (`crypto.argon2`, *"added: v24.7.0"*); it returns raw bytes, so the caller stores the salt and parameters. Vercel deploys *"the latest 24.x"*; the deployed patch version is not documented. **Now M8B's.** |
| 6 | Work after a response | none stated | Read by the architect in the installed package (`next/dist/docs/01-app/03-api-reference/04-functions/after.md`, next 16.3.8) **[doc]**: `after` runs *"after a response (or prerender) is finished"* and is for work *"that should not block the response, such as logging and analytics"* (`:6`). The page's platform table lists *Node.js server* and *Docker container* as supported. Used for D8. |
| 7 | Firewall: one rule for all but static paths | Q17 [inf] | **Confirmed in form.** *"Use `neg: true` to negate a condition"*; *"Conditions within a group are combined with AND."* (`vercel.com/docs/cli/firewall`). Whether the CLI accepts the exact rule is known only at staging. |
| 7 | Firewall: limits by plan | ADR 0019's one-rule finding | Hobby: one rate-limit rule per project; window *"Minimum: 10s, Maximum: 10mins"*; *"1,000,000 Allowed requests"* included; *"Hobby projects can have up to 3 total custom firewall rules."* The **Log** action *"will not perform any blocks"*. Counters are *"tracked on a per-region basis"* (`vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting`, last updated 2026-08-28) |
| 8 | Postgres grants | Q14 [inf] | **Confirmed, with two conditions.** *"all forms of `ON CONFLICT` also require `SELECT` privilege on any column whose values are read. This includes any column mentioned in conflict_target"*; *"Use of the `RETURNING` clause requires `SELECT` privilege on all columns mentioned in `RETURNING`."* (`postgresql.org/docs/current/sql-insert.html`, PostgreSQL 18; the same in 17) |

**What changes in the waves** (each is written into its wave below):

- **8E, 8F:** a prune may be late, missing or repeated, so a count is taken from the current window
  by its timestamp; an expired row that was never pruned must never count.
- **8F S1:** on Vercel the address is read from the platform's header. Off Vercel no platform sets
  these headers and a client may send them, so identity must not trust them there. Which host
  applies is Q21.
- **8I:** the insert names its conflict target and returns only granted columns; `RETURNING *` and
  a uniqueness rule that includes a personal column both fail under the grant.
- **8K:** the bot check sits behind a port with an injected fake, as the mail sender does.
- **8Q:** the bot check's scripts are measured against the policy on a preview deployment, in
  report-only, before the flip.
- **8R:** the widened rule replaces the runbook's rule 2; it is not a fourth rule.

**Still unverified, and what each blocks.**

| Item | Blocks |
| --- | --- |
| The project's Vercel plan. S2 infers Hobby from the runbook's one-rule finding. **An inference, not a fact:** the owner reads it off the dashboard | 8R; Q16 (b) |
| BotID's verdict under `next start` off Vercel | 8K (an S0 measurement); the e2e suite |
| BotID's scripts under the enforced CSP | 8Q |
| `x-vercel-ip-country` when the lookup fails, and whether a client-sent value is discarded | 8F S1: one request on a preview deployment, not a loop |
| What happens past the included 1,000,000 rate-limited requests; whether cached responses count | 8R; Q17 (a) |
| `ON CONFLICT DO NOTHING` with no conflict target under column grants | Nothing: 8I writes the target out |
| The Postgres major version of the Neon database | 8I S0 reads it |
| Whether a host other than Vercel permits outbound SMTP; the SMTP client dependency | Q25 (c); 8J S0 |
| That Neon's driver cannot reach an ordinary Postgres server | Q22 (b) only |

**Three places the architect reads S2's report differently.**

1. **Nothing is staged today.** The report says the runbook *"already stages three"* rules. The
   runbook says they were *"staged once, verified to stage cleanly, and **discarded**. The project
   currently has **zero** custom rules"* [doc `runbooks/firewall-setup.md:7-8`]. What holds is
   narrower: the runbook's design has three rules, which is all Hobby allows, so Q17 (a) edits its
   second rule.
2. **Q15 (iii) is untouched.** The report says *"600 an hour per network"* cannot be a firewall
   rule. It was never proposed as one; it is the application limiter's figure for page reads. The
   ten-minute ceiling binds only the edge rule, which the runbook already sets at sixty seconds.
3. **The plan name is a guess.** It is used nowhere in this file as a fact.

### 8B — a driver error never prints the connection string

*Goal.* The owner's ruling of 2026-09-06 (*Added 2026-09-06*, below). *Tier: Full + security.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | One place opens a connection. It checks the URL's shape first and turns any failure into a domain error that names the **variable** and never its value. The three runtime sites use it | `persistence/src/read-database-url.ts`, a new `open-database.ts`, `neon-configuration-repository.ts`, `share-link-repository.ts`, `design-row-source.ts` | *Added 2026-09-06* below; ADR 0008, *Incident during setup*; ADR 0145; `environments-and-resources.md`, *Never print a secret*; 8A S1's reproduction |
| ~~S2~~ | ~~The migration tools and the lazy web wrapper use it; query-time errors are covered where 8A showed the URL in one~~ | ~~`migrate.ts`, `migrate-status.ts`, `apps/web/src/lib/server/repository.ts`, `design-failure-log.ts`~~ | ~~`read-database-url.ts`'s note on `MigrationExecutionError`; ADR 0096~~ |
| S2 | **Restated 2026-10-07 from 8A S1 part D, and again from its follow-up.** The two migration tools open through it: `migrate.ts:57`'s `new Client(connectionUrl)`, which stands **outside** the connect `try`, and `migrate-status.ts:88`'s `neon(…)`. An error attached as `cause` (`migrate.ts:80`, `:184`; `migrate-status.ts:80`, in `readDeployedSchema`) is kept only if it passes criterion 2 itself. **First step, before any fix:** find why `applyMigrations` does not settle when it cannot connect (criterion 6) | `migrate.ts`, `migrate-status.ts`, `migration-errors.ts` | 8A figures, *D in full* and the follow-up; `read-database-url.ts`'s note on `MigrationExecutionError`; ADR 0096; ADR 0008, *Incident during setup*; ADR 0142; `connectOrWrapError`'s own comment in `migrate.ts`, which says the replacement *"keeps the driver error as `cause`"* on purpose — **the implementer checks the change against that intent first and reports if they disagree** (`WORKFLOW.md`, *Dispatch the intent*) |
| S3 | **Added 2026-10-07.** The two test helpers and the test-URL resolver open through it. They hold the test database's owner credential and run on the CI runner, so they are in the census | `delete-designs-for-tests.ts`, `test-database-url.ts` | 8A figures, *D in full*; ADR 0006; `environments-and-resources.md`, *Test-database isolation* |

**Why S2 changed.** 8A S1 showed that this project's own log line already prints *"<redacted
url>"*, so `design-failure-log.ts` needs nothing, and that the lazy web wrapper only constructs the
repositories S1 fixes. What prints the password at a route is the platform's error logger, given the
error the route rethrows. **The fix is in what is thrown.**

*Criteria.* ~~(1) With each connection variable set, in turn, to each malformed value in a table (a
bad percent-escape, a missing host, a non-URL string, an empty password)…~~ **Restated 2026-10-07:**

1. **The table.** Each connection variable (`DATABASE_URL`, `MIGRATION_DATABASE_URL`,
   `TEST_DATABASE_URL`) is set in turn to each of seven values carrying a recognisable fake
   password, user and host: a bad percent-escape, a missing host, a non-URL string, **a bad port**,
   an empty password, a wrong scheme, and a well-formed unreachable address. The first four leak
   today and must stop; the last three are clean today at the sites that return, and **must stay
   clean**.
2. **Where a marker may not be**, for every site and every value: the error's `message`; its
   `stack`; **every own property, `input` included** (Node's `ERR_INVALID_URL` keeps the whole
   string there); every error on its `cause` chain, by the same four checks; and its `util.inspect`
   output at unlimited depth. A test that checks `message` alone passes today on every leak the
   table above records under `TypeError.input` or `cause`.
3. **The sites.** A census finds them, and fails when one appears outside the one opener.
   ~~Seven today.~~ **Corrected 2026-10-07 from 8A S1's follow-up, re-read in source at `a7b0363`
   [src].** The census matches three shapes, not one, because `neon(` alone misses the site the
   plan had missed:
   - `neon(`: `neon-configuration-repository.ts:175`, `share-link-repository.ts:83`,
     `design-row-source.ts:56`, `migrate-status.ts:88`, `delete-designs-for-tests.ts:26` and `:46`;
   - `new Client(`: `migrate.ts:57`;
   - `new URL(` over a connection string: `migrate.ts:232`, `test-database-url.ts:40` and `:115`.

   Ten call sites. **It reads `src`, never `dist`:** `migrate-status.ts` is not built into `dist`
   (the build compiles `index.ts`'s graph and that file is run by `tsx`), so a census over the
   built package would pass without having opened it (R5).
4. **At the route.** For `POST /api/designs`, `GET /api/designs/{id}` and the design page, the error
   that leaves the handler passes criterion 2. QA re-runs 8A S1's `D-route-run.sh` once against the
   fixed build and quotes a server log with no marker; that run, not a unit test, is the evidence
   about the platform's logger.
5. The error names the variable that is wrong, and says nothing else about its value: not its
   length, not which character was bad.
6. **`migrate` answers at once for a shape the opener refuses.** With a bad percent-escape or a
   wrong scheme it exits non-zero with the domain error instead of not returning. ~~*Not in scope:*
   that `migrate` also does not return for an empty password or an unreachable address, which are
   well-formed; recorded in *8A figures* for the backlog.~~
   **Restated 2026-10-07.** `runMigrations()` did not settle in 45 s for a bad percent-escape, an
   empty password and a wrong scheme, in 170 s for a `.invalid` host, or in 60 s for a refused
   local port. So **what its connect error carries has never been observed**, and criterion 2
   cannot be claimed for a path that does not return. S2 therefore starts by finding why. Whether
   the cause is the fake host or the code is unknown. If it is in `migrate.ts`, S2 fixes it there,
   with a test that a failed connect settles within a stated bound, and criterion 2 is then
   asserted on that error. **If it is in the driver, or needs a change beyond S2's three files, the
   implementer stops and reports**; the wave then closes with that one path named as unproven, not
   as clean. The two CLIs' printed lines are clean today, because `describeMigrationFailure` and
   `describeStatusFailure` drop the message and the cause; that stays true and is asserted, and it
   is not the whole of the criterion, since the thrown error is what any other caller sees.
7. A well-formed URL behaves exactly as before; the persistence live suites are unchanged.
8. *Must not:* a fallback from one variable to another appears (ADR 0008). *Must not:* the opener
   keeps the refused string, or the error it caught, anywhere on the error it throws.

*QA reading:* the criteria; `tests/read-database-url.test.ts`; `scripts/gates/boundary.sh`. QA
sabotages both ways (R6): remove the wrap and the suite goes red; move a call site and it stays
green. *Logic and clean-code readers:* the slice files. *Security reading:* ADR 0008; ADR 0019 d11;
every `catch` on the path from a route to the driver.

### 8C — the review as a value

*Goal.* One pure model produces everything screen 3 prints, from the same projection and the same
priced design as the breakdown, and decides whether the kitchen may be submitted. *Tier: Full.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | The breakdown's group and row building becomes one exported function both surfaces call. `describeReview` returns the title, the room line, the whole-kitchen row, the groups, the whole-kitchen price rows, the not-included slot, the disclaimer and the *De la* figure | `apps/web/src/price/price-breakdown-model.ts`, a new `apps/web/src/review/review-model.ts`, `i18n/content.ts`, `messages/ro.json`, `ru.json`, `ro.d.json.ts` | D2, D14; frames 3A, 3B (`…Mobil.dc.html:969-1157`); ADR 0063; ADR 0067; ADR 0106; ADR 0107; `starting-price.ts`; `engineering-conventions.md`, *Localised copy* |
| S2 | Submit eligibility: `allowed`, or `refused` with a reason code and the bodies it names | `review/review-model.ts`, `i18n/content.ts`, the message files | ADR 0065 d6, d7; ADR 0069; `queries/overflowing-placements.ts`; *An inherited criterion from M6* below |

*Criteria.*
1. **Parity, as a property.** For every generated kitchen in a sweep over straight, L, right-hand L
   and U rooms, the review's group keys, row keys, row labels and amount texts equal the
   breakdown's, in order. The sweep has a floor per shape, and a U must yield at least one wall C
   group.
2. Groups read wall A, then B, then C; within a wall base, hanging, column; within a group the
   hanging row left to right, then the top row (ADR 0063). A wall with no body has no group.
3. The figure is `priceDesign`'s total rounded as the price bar rounds it. *Must not:* a stored
   total, a sum of rounded rows, or a row labelled *total*.
4. The room line states shape, the lengths the shape has, the corner side only for an L, and the
   body count, with CLDR plurals in both locales. A U names three lengths; a straight room one.
5. `refused` when `findOverflowingPlacementIds` is non-empty, naming exactly those bodies in display
   order; `refused` with its own reason for a kitchen with no cabinet (D14); `refused` when pricing
   fails. *Must not:* the model re-derives fit from geometry. Sabotage: replace the query with an
   empty list and the suite goes red.
6. The estimate is labelled a starting price, rounded up, subject to on-site measurement, not a
   commercial offer, using the approved `priceBreakdown` leaves where they already say it.
7. The not-included list is a slot (Q9): the model returns it from one leaf set and the test asserts
   that it sits before the call to action in the view's order.
8. *Must not:* the model imports React, the store or a route.

*QA reading:* the criteria; `price-breakdown-model.ts`; `apps/web/tests/price/`; the generated-room
sweeps under `packages/configurator-domain/tests/generation/`; `engineering-conventions.md`, *Three guards that look thorough and cannot fail*
(criterion 1 must not feed both sides from one function call). *Logic reader:* ADR 0063, 0065, 0067,
0107; `design-projection.ts`. *Clean-code reader:* the slice files.

### 8D — the review route and screen 3A/3B

*Goal.* The customer reaches the review from the editor, reads it on a phone, and goes back to a
chosen cabinet. *Tier: Light + visual; a security reviewer reads S1 only.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | The gated route and the shell. The server page runs the same owned load as the editor's and answers the same refusals; the proxy's allow-list admits the three new families exactly | `app/[locale]/d/[id]/review/page.tsx`, a new `app/d/[id]/review/review-screen.tsx`, `proxy.ts`, `app/d/[id]/hydrate-and-configure.tsx` (the hydration, shared and not copied) | D1, Q2; ADR 0114 d5, H2, H5, G5; ADR 0133; `app/[locale]/d/[id]/page.tsx`; `proxy.ts` `isCustomerPath` |
| S2 | Frames 3A and 3B: top bar, heading, room line, the render with its three views and *Vezi în 3D*, the settings row with *Schimbă*, the groups with *Editează*, the not-included block, the disclaimer, the price bar with *Cere oferta* or its refusal | `review-screen.tsx`, a new `review.module.css`, a new `review/review-groups.tsx` | D2–D4; frames 3A, 3B; ADR 0104 d1–d3; `scene/kitchen-canvas.tsx`, `scene/kitchen-stage.tsx`; `price/price-bar.tsx`; `browser-and-visual-qa.md` |
| S3 | The editor's side: `Verifică designul` becomes a link; the editor selects `?select={placementId}` once on arrival and opens the settings sheet for `?settings=open`; the review waits for the save in flight | `configure-screen.tsx`, `configure.module.css`, `store/configurator-store.ts`, `use-back-guard.ts` only if the guard must ignore the forward navigation | ADR 0104 d6 and Amendment D; M7C C1 S3 and S4 *as built*; ADR 0139; `back-guard.ts`; the M7C test named in *What M8 assumes* |

*Criteria.*
1. A request for `/d/{id}/review` with no cookie, a malformed one, a foreign one or an unknown id is
   answered exactly as `/d/{id}` answers it, class for class (ADR 0114 H5). No query is issued
   without a well-formed cookie.
2. The proxy admits `d/{id}/review`, `d/{id}/contact` and `d/{id}/done` and nothing longer or
   differently named; `s/{token}/review` is not a route. The shared view shows no review control.
3. `Verifică designul` is reachable by touch and keyboard and opens the review of the same design.
   The retired M7C test is replaced by one asserting the destination; the top bar's box and
   containment tests stay green at 390 px and 900–1920 px.
4. **The review shows the saved design.** With an edit still unsaved, *Cere oferta* is disabled and
   says the design is being saved; it enables only at the revision the store last saved. *Must not:*
   the review renders a revision the server does not hold.
5. *Editează* opens the editor with the group's first body selected (D3) and the sheet open.
   `?select=` naming a body the design does not hold selects nothing and shows no error. *Schimbă*
   opens the editor with the settings sheet open.
6. Browser Back from the review returns to the editor without the leave confirmation. Back from an
   editor reached through *Editează* returns to the review.
7. When 8C answers `refused`, *Cere oferta* is disabled, the reason is on screen above it, and each
   named body links to the editor with that body selected.
8. *Must not:* a file under `packages/three-adapter` changes; the review mounts a second scene while
   the editor's is alive (ADR 0074).

*Phone acceptance, 390 × 844, both locales, real touch.* 3A and 3B scroll as one page with the price
bar pinned; nothing is clipped or leaves the viewport; every control is at least 44 px; the three
views switch by touch; a U kitchen's three walls all appear; a marked kitchen shows the refusal. The
visual agent inspects each capture and reports what it could not verify.

*QA reading:* the criteria; `tests/e2e/` specs for `/d/{id}`'s refusals, the top bar and the back
guard; ADR 0144 (wait bounds); `pnpm gate:e2e-shard-budget`. *Combined reviewer:* the slice files;
ADR 0104; 8C's model. *Security reading:* S1's two route files and `proxy.ts`; ADR 0114 d5, H2, H5.
*Visual reading:* frames 3A, 3B; this wave's criteria; `browser-and-visual-qa.md`.

### 8E — the rate-limit store

*Goal.* Postgres counts requests per bucket and window, atomically (ADR 0019 Alternative 4 rejected
Redis). *Tier: Full + security.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | Migration `0007`: one `create table if not exists` and its index. A port that records one hit against several buckets in one statement and returns each count, and a prune of expired windows. A fake for tests | `persistence/src/migrations/0007_create_rate_limit_counters.sql`, new `rate-limit-store.ts`, `fake-rate-limit-store.ts`, `index.ts` | D10; Q14; ADR 0019 d3, d5, Consequences; ADR 0008 and its 2026-09-23 note; ADR 0020, 0042, 0096; `migration-safety.ts`; ADR 0128; ADR 0145; `share-link-repository.ts` as the pattern |

*Criteria.*
1. **No lost update.** N concurrent hits on one bucket and window return the counts 1…N exactly once
   each, on the live test database, under ADR 0128's lock.
2. A hit one millisecond before a window's end and one at its start land in different windows.
3. One request's buckets are written in one round trip.
4. The key column accepts only a 64-character lowercase hex digest, by a check constraint.
5. Prune removes every expired row and no live one, and is safe to run twice.
6. A driver failure reaches the caller as a typed error, never as a count.
7. `0007` passes the unattended screen as shipped. The privilege test asserts the exact grant on the
   table once it exists, and that the role still cannot delete from `designs`.
8. *Must not:* a statement here reads or writes `designs`; a raw address or e-mail is stored.
9. **Added 2026-10-07 [ven §3].** A count comes from the current window alone. With an expired row
   for the same bucket left in the table, the first hit of a new window returns 1. The nightly job
   may be late, may not run, and may run twice; the limiter is correct in all three cases.

*QA reading:* the criteria; `tests/share-link-repository.test.ts`;
`tests/application-role-privileges.test.ts`; `migration-safety*.test.ts`. *Logic and clean-code
readers:* the slice files. *Security reading:* ADR 0019 d2, d3; ADR 0008; the migration.

**Owner action after this wave:** apply `0007` and issue Q14 (ii)'s grant on preview, then
production. The commands are prepared, not run, by an agent.

### 8F — the limiter and the mint

*Goal.* `POST /api/designs` is bounded by ADR 0019's independent buckets. Closes the application half
of SEC-001 and backlog 90. *Tier: Full + security.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S0 | Fixes D11's mechanism and the e2e policy with the security reviewer, before code. Records both in the ADR | this file; the ADR | D11, D12; ADR 0019 d3, d5; ADR 0114 H1, H3, H6; backlog 88, 89, 90; 8A's counts |
| S1 | Identity, pure: the client address reduced to its /24 or /64 block; the country as MD or not | new `lib/server/rate-limit/client-network.ts`, `geography.ts` | ADR 0019 d3, d4, Alternative 5; 8A S2's quotations |
| S2 | Policy as data, and the evaluator: every bucket counted, the most restrictive wins, the answer is `allow`, `refuse` with a wait, or `challenge` | new `rate-limit/limit-policy.ts`, `enforce-rate-limit.ts` | ADR 0019 d5 (the table, copied, not retyped from memory); Q15's answer |
| S3 | The mint enforces it; the refusal is a `429` with `Retry-After` and a reason code; a store failure refuses the mint | `api/designs/route.ts`, new `rate-limit/rate-limited-response.ts`, `lib/server/repository.ts`, `design-failure-log.ts` | ADR 0019 d5 *"fails closed"*; ADR 0114 F4, H1; ADR 0111 d1; `api/designs/route.ts` |
| S4 | Step 1 shows the refusal and the wait in words | `room/create-design.ts`, `room/use-generation.ts`, `room/generation-steps.tsx`, `i18n/content.ts`, the message files | ADR 0111 Amendments; ADR 0139; frame 1F; `engineering-conventions.md`, *Localised copy* |

*Criteria.*
1. **Aggregation, as properties.** Two IPv4 addresses share a bucket exactly when their first 24
   bits agree; two IPv6 addresses exactly when their first 64 agree; an IPv4-mapped IPv6 address
   lands in its IPv4 block. An absent or unparseable address lands in one shared bucket with the
   non-MD limits. *Must not:* it is unlimited.
2. The address is the one the platform set, never a value the client can write. A forged forwarding
   header does not move a request to another bucket. **Added 2026-10-07 [ven §2]:** on Vercel that
   is `x-forwarded-for`, which the platform overwrites. Where no platform sets it (local
   `next start`, CI, and any other host until Q21 names its proxy), a client can send these headers,
   so identity there must come from something a client cannot write, or every request lands in the
   one shared bucket of criterion 1. **S1 is not dispatched until Q21 and Q23 are answered.**
3. **Independent buckets.** With the address fixed and the session changed every request, the mint
   is refused at the network limit plus one. With the session fixed and the address moved across
   blocks, it is refused at the session limit plus one, **across rotations** (D11). *Must not:* any
   key combines two identities.
4. A refused mint inserts no row, sets no cookie, and answers `429` with an integer `Retry-After`
   between 1 and the window. A challenged mint follows D12.
5. With the counter store failing, the mint is refused and nothing is written. Reads are unaffected.
6. A request refused by the cross-site guard is not counted.
7. No log line carries an address, a cookie value or a hash.
8. **The regression test is not a volume loop** (ADR 0019). Tests drive a fake clock and limit plus
   one requests.
9. The full e2e suite stays green. *Must not:* a production build can select the test policy, by
   variable, header or cookie; a test proves the selection is unreachable there.
10. Step 1 shows the wait in minutes in both locales and the customer's room entry is kept.

*Phone acceptance.* The refusal message at 390 × 844 in both locales, inspected.

**What 8F owes the e2e suite — added 2026-10-07 from 8A S1 part B.** One run makes **444 mints, 266
saves, 813 design reads and 58 share requests from one address**, in under ten minutes. The
production policy allows that address 10 mints an hour, or 3 where no country header exists, which
is every run off Vercel. So the suite cannot run under the production policy, and S0 must settle
these before S1 is written:

1. **The suite's policy is a policy, not a switch.** The limiter runs in e2e with limits high
   enough for the measured run several times over in one hour (the pre-push gate and a developer
   re-run can share an hour). *Must not:* the limiter is bypassed, so that a wiring fault in the
   route is still caught by the whole suite.
2. **The production numbers are proved elsewhere:** at unit level on a fake clock (criterion 8),
   and by a small set of e2e specs against a server started with the production policy, apart from
   the main suite's server, so their refusals cannot spill into another test's hour.
3. **Selection is by how the server is started, never by a request.** Criterion 9 stands, and S0
   names the mechanism and the test that proves a production build cannot reach it.
4. **The counters do not accumulate in the test database.** Each run's rows are bounded by the
   prune or by keys scoped to the run; ADR 0006 and ADR 0128 apply to the new table.
5. **A baseline before any limiter code.** With `CI=1`, three specs are red today, all about two
   tabs minting together: `qa-7e3b-s6-lock.adversarial.e2e.spec.ts:112` (rounds 1 and 5) and
   `qa-7e3b-s6-two-tab-convergence.adversarial.desktop.e2e.spec.ts:21`. They are not M8's, and
   nobody has investigated them. The limiter will sit in front of exactly those requests, so a red
   there after 8F could not be told from a red before it. **8F is not dispatched until the
   coordinator has had the three re-run alone** (`WORKFLOW.md`: a failing e2e is a contention
   suspect first) **and recorded each as a flake, a test fault or a defect.** D11's mechanism reads
   the same rows those specs race over, which is a second reason.

*QA reading:* the criteria; `tests/app/api/designs/`; the e2e mint fixture; ADR 0019's 2026-08-31
correction. Sabotage both ways for each bucket. *Logic and clean-code readers:* the slice files; ADR
0019 d3–d5. *Security reading:* ADR 0019 whole; ADR 0114 F4, H1, H6; S0's record.

### 8G — the limiter on saves, shares and reads; pruning

*Goal.* Every other endpoint ADR 0019 and ADR 0114 name is inside the limiter, and expired counters
are removed nightly. *Tier: Full + security.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | `PUT`/`PATCH /api/designs/{id}` enforce their row of the table. The save coalescer treats a `429` as *wait and retry*, never as a lost write | `api/designs/[id]/route.ts`, `persistence/save-coalescer.ts`, `store/configurator-store.ts`, the message files if a notice is new | ADR 0019 d5, d6; ADR 0002 d16; Q15's answer; `design-request-errors.ts`; the WEB-001 residuals in STATUS |
| S2 | The share endpoints, the share view, `/` and `/d/*` are counted; reads fail open | `api/designs/[id]/share/route.ts`, `lib/server/visitor-resume.ts`, the two page files, `proxy.ts` only if counting belongs there | ADR 0114 d7, B5, C1, G4; Q15 (iii) |
| S3 | The nightly job prunes expired counters, as **a second cron entry on its own route**: the count is no constraint (100 per project on every plan [ven §3]), and a failed prune then cannot be mistaken for a failed backup. If Q21 moves the host, the same route is called by that host's scheduler with the same secret [inf] | `vercel.json`, a cron route, `lib/server/cron-auth.ts` (reused) | ADR 0019 d7 (the surviving half); ADR 0012; `api/cron/backup-designs/route.ts` |

*Criteria.* (1) Each endpoint is refused at its limit plus one per bucket and not before.
(2) **Nothing is lost:** after a refused save, the design in the browser is still marked unsaved,
the write is retried after the stated wait, and the stored row then equals the browser's design.
8D's criterion 4 keeps the review waiting meanwhile. (3) With the counter store failing, saves are
refused and say so; `/`, `/d/{id}` and `/s/{token}` still answer. (4) A page refusal looks the same
for an owner and a stranger (ADR 0114 H5). (5) The prune route refuses a request without the cron
secret, and a failed prune does not report a failed backup or the reverse. (6) *Must not:* the
prune touches any table but the counters.

*QA reading:* the criteria; `tests/persistence/save-coalescer*`; the share specs. *Security reading:*
ADR 0114 B5, G4; ADR 0019 d5.

### 8H — the submission contract

*Goal.* One I/O-free definition of what a request is, used by the form and by the server.
*Tier: Full.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | The contact fields: name, phone and its normal form, locality, channel, the conditional e-mail, consent with its text version. Each failure is a code, not a sentence | new `configurator-domain/src/contact/contact-fields.ts`, `phone-number.ts`, `index.ts` | Q6's answer; ADR 0001 d6; ADR 0095 (codes, not sentences); frames 4A, 4B; `schemas.ts` |
| S2 | The request: the fields, a design reference (`{id, revision}` or none with an intent), a client request id, the locale, the honeypot and timing fields | new `contact/contact-submission.ts`, `index.ts` | D5, D6, D15; Q12; ARCH §9; `CONFIGURATION_MODEL.md:238-240` |
| S3 | The snapshot: from a design, the catalogue and a book, either the canonical document with its priced lines, total and book version, or a refusal | new `contact/submission-snapshot.ts`, `index.ts` | D7, D14; ADR 0065 d7; ADR 0072; `pricing/price-design.ts`; `serialize-design.ts` |

*Criteria.*
1. **The phone, as properties** (~~pending Q6~~ **pending Q24; S1's `phone-number.ts` is not
   dispatched before it is answered**): normalising is idempotent; every accepted Moldovan
   form yields the same normal form; seven and nine digits after the prefix are refused; spaces,
   dashes and brackets do not change the answer.
2. Every text field refuses a carriage return, a line feed and any other control character. *Why:*
   these values reach an e-mail.
3. Each field has a stated maximum length and refuses one character past it.
4. E-mail is required exactly when the channel is e-mail (Q6 (ii), answered); locality may be empty
   (Q6 (i), answered). Consent that is not `true`
   is refused with its own code.
5. The request type has no price field (D6). An unknown extra field is refused, not ignored.
6. **The snapshot.** Its document round-trips through `serializeDesign` byte for byte. Its total for
   the seeded L kitchen equals the literal already pinned for it, not a second call of the same
   function. It carries the book's version. It contains no contact field, by type.
7. A design with a body past its wall yields a refusal naming exactly `findOverflowingPlacementIds`,
   for generated kitchens on all three walls. An empty kitchen and an unpriceable one are each
   refused with their own code.
8. *Must not:* the package reads a clock, generates an id, or imports anything outside itself.

*QA reading:* the criteria; `tests/pricing/`; `scripts/gates/boundary.sh`; `fast-check`. *Logic
reader:* ADR 0001, 0065, 0072; ARCH §9. *Clean-code reader:* the slice files.

### 8I — the contact submissions store

*Goal.* Requests are stored once, apart from designs, and the running application cannot read them
back. *Tier: Full + security.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S0 | Measures, on the test database, that the idempotent insert works under Q14 (i)'s column grants. Reports before S1 | scratchpad | Q14; ADR 0006; `environments-and-resources.md` |
| S1 | Migration `0008`: personal columns separate from the rest. A port that records a request and answers its reference, whether it is new and whether it was notified; and marks one notified. A fake | `migrations/0008_create_contact_submissions.sql`, new `contact-submission-store.ts`, `fake-contact-submission-store.ts`, `index.ts` | D7, D8, D16; ADR 0002 security 6, d24; ADR 0008; ADR 0012; ADR 0020, 0042, 0096; ADR 0128; ADR 0145 |

*Criteria.*
1. Two records with one client request id store one row and answer one reference, also when
   concurrent. The same id with a different payload is refused with its own code.
2. The reference is unique and random (D16); a collision is retried, never surfaced.
3. **Under the application role**, selecting a personal column is refused by the database; so are
   `DELETE` and an `UPDATE` of any column but notified-at. Asserted live, beside the existing
   privilege tests.
4. A retried write leaves no second row (ADR 0145).
5. The export statement still names `designs` alone. A test fails if a second table appears in it.
6. `0008` passes the unattended screen as shipped.
7. No error or log line from this module contains a field's value; tested with recognisable fakes.
8. **Added 2026-10-07 [ven §8].** The insert writes its conflict target out, on the client request
   id alone, and returns only granted columns. No uniqueness rule on the table includes a personal
   column. A test reads the SQL text the module sends and fails on `RETURNING *` or on a returned
   personal column; S0's live run under the application role is what proves the grant suffices.

*QA reading:* the criteria; `retried-writes-leave-no-trace.test.ts`;
`backup-restore-round-trip.adversarial.test.ts`. *Security reading:* ADR 0002 security section; ADR
0008; ADR 0012; the migration.

**Owner action after this wave:** apply `0008` and issue Q14 (i)'s grants, preview then production.

### 8J — mail, and the shop's notification

*Goal.* One provider-neutral port sends one fixed message to one configured address.
*Tier: Full + security.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | The port; the provider adapter over HTTPS with a time bound; a reader that answers *configured* or *unavailable* and names the missing variables; a fake | new `lib/server/mail/mail-sender.ts`, `provider-mail-sender.ts`, `mail-configuration.ts`, `fake-mail-sender.ts` | Q3, Q4; ADR 0001 d7; ARCH §9; 8A S2's quotations; `backup-designs.ts:114-140` (how a third party's error is reduced before it is published) |
| S2 | The notification's text: the reference, the customer's details, the room line, the groups and the figure | new `mail/lead-notification.ts`, `.env.example` (names only) | Q5; D13; 8C's model; 8H's snapshot |

*Criteria.* (1) The only recipient is the configured shop address. *Must not:* a customer-supplied
address is ever a recipient or a header value. (2) The subject is a fixed template and the
reference. The body is plain text. (3) With a recognisable fake key, no log line, thrown message or
response contains it. The provider's error body is never logged verbatim. (4) The call has a time
bound, and a slow provider yields a typed failure. (5) With a variable missing, the reader answers
*unavailable*; no path returns success without the provider's acceptance. (6) Under test and e2e the
fake is injected and no request leaves the process; a test fails if the provider's host is fetched.
(7) The text shows the same rows and figure as 8C for the same design.

*QA reading:* the criteria; `tests/lib/server/`. *Security reading:* ADR 0001 d7; the adapter; the
variables' names in `.env.example`.

**Owner action:** the provider account, the DNS records and the variables in *Proposed variables and
resources*. Nothing is created by an agent.

**Added 2026-10-07.** Q3 and Q5 are answered; **the provider is Q25 and is open.** The port, the
configuration reader, the fake and S2's message text do not depend on it and may be built. The
adapter (`provider-mail-sender.ts`) waits. If Q25 is (a), the adapter sends a `User-Agent` header,
without which Resend answers `403`, and passes the client request id as `Idempotency-Key`, which
Resend keeps for twenty-four hours [ven §4]; D8's retry must not rely on that key past a day. If
Q25 is (c), an S0 first verifies outbound SMTP from the launch host and puts the SMTP client
dependency to the security reviewer.

### 8K — `POST /api/contact-submissions`

*Goal.* The boundary: it revalidates, refuses abuse, snapshots the stored design, stores once,
notifies, and tells the customer the truth. *Tier: Full + security.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | The pieces: the bot verdict, the structured errors and their status codes, the redacted log | new `lib/server/bot-check.ts`, `lib/server/contact/contact-errors.ts`, `contact-log.ts`; `next.config.ts` only if the bot check needs it | Q16; D9, D12; ADR 0019 d5; 8A S2; `design-errors.ts`; `design-failure-log.ts` |
| S2 | The orchestration and the route | new `lib/server/contact/submit-contact.ts`, `app/api/contact-submissions/route.ts`, `lib/server/repository.ts` | D5–D9, D15; ARCH §9; ADR 0019 d3, d5; ADR 0065 d7; ADR 0114 d5, F4; 8F's evaluator; 8H; 8I; 8J; `read-body-with-limit.ts` |

*The order of checks,* cheapest first: cross-site guard; body limit; the schema; honeypot and timing;
the bot verdict; the global bucket; the idempotency lookup; for a new request the contact buckets
(network, session, e-mail); the owned load at the stated revision; the snapshot; the record; the
notification; the mark.

*Criteria.*
1. A body over the limit is refused before it is parsed. A cross-site request is refused before
   anything is counted.
2. **The reviewed design.** A request whose revision is not the stored one is refused and nothing is
   stored. A design the cookie does not own, an unknown id and a missing cookie are one refusal.
3. A kitchen with a body past its wall is refused with the bodies' ids (ADR 0065 d7), and the design
   is still stored and editable.
4. **Limits.** Each contact bucket refuses at its limit plus one. With the counter store failing,
   the request is refused and nothing is stored or sent (*"A lost lead beats an open relay"*).
5. **Idempotency.** Two requests with one id, concurrent or not, yield one row and one reference.
6. **A retry is never trapped.** After a request that was stored and not notified, five retries with
   the same id inside the hour all reach the notifier, and none is refused by a contact bucket.
7. Success is answered only when the row exists and the provider accepted the message (D8). A
   provider failure answers a failure the form can render, and the row stays.
8. With mail unconfigured, the endpoint answers *unavailable* and stores nothing.
9. The response is a reference and a status. *Must not:* it echoes any submitted value.
10. With recognisable fakes in every field, no log line on any branch, thrown ones included,
    contains a name, a phone number, an e-mail address, a locality or a client address.
11. A honeypot hit, a failed bot verdict and a too-fast submit are refused and store nothing (D9).
12. **Added 2026-10-07 [ven §1].** The bot check is a port. Unit tests and the e2e suite inject a
    fake; no test depends on the real service's answer. An S0 measures, once, what the real check
    answers under `next start` off its platform, which the documentation does not say. *Must not:*
    a production build can select the fake.

**Added 2026-10-07: the bot check is conditional on Q21.** If the launch host is not Vercel, S1's
`bot-check.ts` is not built, D12 returns to planning, and the honeypot and the timing check are the
form's only bot controls until the hosting milestone names another.

*QA reading:* the criteria; ARCH §10's API line; 8F's tests. No volume loop. *Logic reader:* ARCH §9;
D5–D9; the order of checks. *Clean-code reader:* the slice files. *Security reading:* ADR 0019; ADR
0002 security section; ADR 0114 d5; every branch's log line.

### 8L — the contact screen 4A/4B/4C

*Goal.* Three fields and a channel, validated where the customer is looking, sent once.
*Tier: Full + visual.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | The form as a value: field state, validation on leaving a field through 8H's schema, the first-error target, the states idle, sending, sent, failed | new `apps/web/src/contact/contact-form-model.ts`, `use-contact-submission.ts`, `i18n/content.ts`, the message files | frames 4A–4C (`…Mobil.dc.html:1164-1396`); 8H; D17; Q6, Q8; ADR 0095; `engineering-conventions.md`, *Localised copy* |
| S2 | The gated route and the screen; the design card (D13); the unavailable state | `app/[locale]/d/[id]/contact/page.tsx`, new `contact/contact-form.tsx`, `contact.module.css`, `proxy.ts` if 8D left it open | D1; ADR 0114 d5; ADR 0104; 8D S1 |
| S3 | Frame 2F's callback entry: the existing page becomes the form with no design. The `contactPlaceholder` leaves are retired with the surface | `app/[locale]/configurator/contact/page.tsx`, `components/webgl-unavailable.tsx`, the message files and the copy lock | Q12; frame 2F (`:921-960`); ADR 0113 d2 on the lock |

*Criteria.*
1. An error appears beside its field when the field is left, not before and not for other fields.
   Submitting with errors focuses the first invalid field and brings it into view.
2. Frame 4B's sentences are used as drawn where Q24 leaves them true. No error shows a code. Frame
   4A's response-time hint is not drawn (Q8), unless Q26 changes that.
3. Consent sits beside the call to action; unticked, the request is not sent and the frame's
   sentence appears. Its text is the slot of Q7.
4. **4C.** While sending, the button shows the loading state and cannot be activated; the form is
   dimmed, readable and inert; the frame's *"Nu închide pagina"* line shows. Two fast taps send one
   request.
5. The request carries the revision the review rendered. With an unsaved edit the form waits.
6. **Nothing typed is persisted.** After every field is filled with recognisable values, they are in
   no cookie, no local or session storage, no URL and no design request (D17).
7. With mail unconfigured the screen says the request cannot be sent and offers the other channel.
   It never shows the form and then fails.
8. The honeypot field is invisible, out of the tab order and hidden from assistive technology.
9. The contact pages are rendered per request and carry the CSP nonce (8Q depends on this).

*Phone acceptance, 390 × 844, both locales, real touch and the on-screen keyboard.* The focused
field and its error are visible above the keyboard; the call to action is reachable without the
keyboard covering the consent line; an autofilled form sent by a real tap passes 8K's timing check;
4A, 4B and 4C each captured and inspected.

*QA reading:* the criteria; the `.dom.test.ts` pattern; `browser-and-visual-qa.md`. *Logic reader:*
8H; frames 4A–4C. *Clean-code reader:* the slice files. *Visual reading:* frames 4A–4C; ADR 0104.

### 8M — success 5A and failure 5B

*Goal.* The customer is told exactly what happens next, or exactly what went wrong, and loses
nothing. *Tier: Full + visual.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | 5A: the exact channel and number, the reference with *Copiază*, *Ce urmează*, the render, *Înapoi la design*, and the WhatsApp action if Q5 keeps it | `app/[locale]/d/[id]/done/page.tsx`, new `contact/submission-result.tsx`, `submission-result.module.css`, the message files | frame 5A (`:1403-1460`); Q5, Q8, Q9, Q11; D4; ADR 0114 B7, D; ADR 0002 d17; `share/share-design.tsx` |
| S2 | 5B: the plain-language failure, *Încearcă din nou*, the automatic retry when the connection returns, the direct call, the preserved state | new `contact/submission-retry.ts`, `submission-result.tsx`, `use-contact-submission.ts`, the message files | frame 5B (`:1465-1512`); Q3 (the shop's number), Q18; D8, D17; 8K's errors |

*Criteria.*
1. 5A names the channel the customer chose and the number they typed, from this page's memory.
   *Must not:* a vague promise of contact; a response time, unless Q8 allows one.
2. Reloading the page shows the reference and the next steps without the number, since the server
   may not read it back (Q14). *Must not:* the reload shows an error or another design's reference.
3. The saved-design sentence says *in this browser* (ADR 0114 Amendment D). ~~It offers the profile
   only once 8P7 exists.~~ **No profile is offered in M8** (Q1); M8B's modal wave adds the offer.
   *Must not:* 5A names a profile, an account or an e-mailed link (Q11).
4. **5B keeps everything.** After a forced failure the design is unchanged on the server and every
   typed value is still in the form's state. The screen does not ask for re-entry.
5. The automatic retry uses the same client request id; at most one request is in flight; it stops
   at success; it never repeats a validation refusal, and never fires before a `429`'s wait.
6. A failed notification, a timeout, a lost connection and a refusal by the limiter each show a
   sentence in ordinary language. *Must not:* a status code or an error code is shown.
7. The direct-call action dials the configured number.
8. No claim that data is *saved on this phone* is made unless Q18 makes it true.

*Phone acceptance, 390 × 844, both locales.* The full path by touch from the review to 5A; a forced
failure (connection cut during 4C) to 5B, then restored, ending in 5A with one row stored; each frame
captured and inspected.

*QA reading:* the criteria; Playwright's offline and route-abort tools; 8K's error table. *Logic
reader:* D8; frames 5A, 5B. *Visual reading:* frames 5A, 5B.

## Part P — customer profiles — MOVED TO M8B (owner, 2026-10-07)

> **Not part of M8.** Q1 was answered (b), as recommended (relayed): profiles are **M8B**, after M8
> and before launch. Waves 8N and 8P1–8P9 are not dispatched from this file. The text below is kept
> here, unchanged, only until `docs/milestones/M8B-customer-profiles.md` exists; the architect was
> asked to edit this file alone, so creating that one is listed for the coordinator. QP1–QP5 and
> 8A S2's argon2id finding (*8A figures*, §5) go with it.

**If Q1 is (b) this part moves to its own file, `M8B-customer-profiles.md`, unchanged.** Its slice
tables and reading lists are written in 8N, after QP1–QP5, because every one depends on those
answers. What is fixed now is the cut, the order and what each wave must prove. The obligations are
the owner's section below, by number.

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

### Customer profiles — owner decision, 2026-09-11

**The owner's words**, proposing it: *"maybe we can advise user to make a profile, and in this way he
will be able to store all its configurations there and will get access to a small dashboard to manage
the configurations. After he plays with intitial configuration we can show a modal to propose to
create profile. email plus password"* — then, through structured prompts, **"Profile replaces PIN"**
and **"In M8, with e-mail"**. The durable record is [ADR 0115](../decisions/0115-customer-profiles-replace-the-pin-and-arrive-in-m8-and-m7-ships-the-browser-cookie-and-share-links.md).

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
   the application limiter ADR 0019 decisions 2–5 already assign to this phase, and to the launch gate
   below.
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
    contact flow's copy follows. **Now Q11.**

## Launch waves

### 8Q — the CSP enforces

*Goal.* The policy blocks, where today it only reports (ADR 0041). Not part of the ship-together
set. *Tier: Full + security.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | No prerendered page is left without a nonce: the remaining ones (8A S1's list) are rendered per request or given a policy that needs none. A violation collector is built under the limiter, or the decision not to build one is recorded | the error and not-found boundaries, `lib/security-headers.ts`, `proxy.ts`, a report route if built | ADR 0041 whole; 8A S1; 8F's evaluator; `security-headers.ts:8-20`; Next's CSP guide under `node_modules/next/dist/docs/` |
| S2 | The one constant flips | `lib/security-headers.ts` | ADR 0041 d3 |

*Criteria.* (1) A real build's prerender manifest names no customer-reachable HTML route without a
nonce; the test reads the manifest, not the printed route table. (2) Under enforcement every route
renders with no violation in the console: Step 1, the editor with the scene, the share view, the
review, contact, 5A, 5B, the load-error page, the global error and not-found pages, and the bot
check's script. (3) An injected inline script is blocked. (4) A report route, if built, is counted
and bounded by the limiter and stores nothing personal. (5) *Must not:* the flip lands while
criterion 1 is unmet. (6) **Added 2026-10-07 [ven §1].** If the bot check is kept (Q21), its
scripts are observed on a preview deployment with the policy still in report-only, and the flip
waits until that run shows no violation from them. The vendor documents no CSP requirement, so this
is the only evidence there will be.

*QA reading:* the criteria; `tests/lib/security-headers*`; the e2e console listeners. *Security
reading:* ADR 0041; ADR 0019 d2.

### 8R — the firewall rules, staged

*Goal.* The runbook's rules exist in `log` action, reviewed, ready for the owner to publish (ADR 0019
d10). *Tier: Coordinator-only: no code.* An agent prepares the exact commands with Q17's scope and
the endpoint names M8 actually shipped; **the owner runs and publishes them.** The scribe updates
`docs/runbooks/firewall-setup.md`. *Reading:* that runbook; ADR 0019 d2, d4, d5, Consequences; ADR
0114 d7, B5; Q17. *Criteria.* (1) The runbook names every path family M8 added. (2) Each rule has
been observed in `log` before any enforcing action, and the observation is quoted. (3) *Must not:* a
second `rate_limit` rule is attempted; the edge is quoted anywhere as a cap.

**Added 2026-10-07. This wave exists only if Q21 keeps the launch on Vercel.** If it does [ven §7]:
the widened rule is the runbook's rule 2 edited, since its three rules are all the plan allows if
the plan is Hobby (unverified); the rule's window is at most ten minutes, and the runbook's sixty
seconds stands; the threshold for a rule that now counts page requests is proposed with the
observation from `log`, not chosen beforehand; and what happens past the included request count is
read from the dashboard before publishing. No rule exists today.

### 8S — pre-launch checks

*Goal.* The things only a read of the live system, or the owner, can settle. *Tier: Light; no code.*

| Check | Who | Reading |
| --- | --- | --- |
| ADR 0038 is re-read; the first stored schema is declared (Q20); its named obligation, the unbounded `heightMm`, is confirmed closed or scheduled | architect, then owner | ADR 0038 and both corrections; ADR 0111 d8; ADR 0052; `design.ts`; `migrate-design.ts` |
| Live rows against the corrected wall bounds (wall A 3560–3600 mm, wall B 2830–3600 mm): the owner runs a read-only count of rows that have an owner and a placement in either band. **Not guessed.** | owner | *Launch gate* below; ADR 0065; ADR 0083 |
| Migrations `0007` onward are applied and their grants issued on production, proved by the deployed-schema gate | owner, coordinator | ADR 0096; ADR 0042 |
| The largest storable row and the backup's memory use are re-measured (backlog 92) | QA | backlog 92; ADR 0019 d11 |
| The Russian is re-signed as shipped (ADR 0095's backstop); Q7, Q8 and Q9's slots hold the owner's text | owner | ADR 0095; `docs/i18n/gate-o2-russian-review.md` |
| **Added 2026-10-07.** A list of every kind of personal data M8 keeps: what it is, who holds it, in which country and for how long. It is the input the owner's privacy text and their lawyer need; it states facts and draws no legal conclusion. Known today: the database is Neon in `eu-central-1` [doc ADR 0007:32]; a Resend account would hold each message for thirty days in the United States [ven §4]. Not yet read: where the application's functions run, and where the Blob store is | architect, then owner | Q21, Q22, Q25; *The owner's answers*; ADR 0002 security 6; ADR 0007; ADR 0012 |

### 8T — the phone gate, the desktop line, the phase gate

*Phone gate, 390 × 844, real touch, both locales.* All seven frames complete in order from the
editor: 3A, 3B, 4A, 4B (each error provoked), 4C, 5A; then a forced failure through 5B with state
preserved and one stored row at the end. One L, one right-hand L, one straight and one U kitchen. A
marked kitchen is refused at 3. A limiter refusal is shown at Step 1 and at 4. **This is the phase
gate.**

*Desktop, same phase, separate line.* The three screens at 1440 px and at 900 px: nothing clipped,
nothing invented beyond the phone frames, the gap recorded for later design.

*Phase gate.* `pnpm check`; `pnpm ci:local`; a green runner; the *Launch gate* below fully ticked;
then the push and the pull request. *Visual reading:* every wave's criteria and captures.

## Launch gate — `POST /api/designs` must not meet real traffic until this is checked off

Added 2026-08-31. This is a **hard pre-launch blocker**, not a work item that can be traded away
inside a wave. An adversarial review on 2026-08-30 reproduced the unthrottled mint path as
**SEC-001 (High)** (`testing-reports/01-security-and-api.md`) and chained it with SEC-002 and
DB-002 into the resource-exhaustion sequence **AV-4**
(`testing-reports/07-critical-attack-vectors.md`). The owner reaffirmed the deferral on 2026-08-31
on the condition that it is gated here; the decisions themselves are settled in
`docs/decisions/0019-security-baseline-writes-throttling-retention.md` (see its 2026-08-31
correction) and must not be re-litigated.

**Restated 2026-10-07 as a checklist tied to waves.** The 2026-08-31 list is kept below it, struck
where a later record overtook it. Every line must be **live**, not planned and not staged in a
runbook.

*The ship-together set (SEC-001, AV-4):*

- [ ] **Independent buckets, most restrictive wins** (ADR 0019 d3): /24 and /64 network blocks, the
      session, global per-endpoint counters; no fused key. — **8E, 8F**
- [ ] **The mint limits** (ADR 0019 d5; Q15): 10 an hour and 30 a day per MD network block; 3 an
      hour plus challenge for non-MD; 5 an hour per session, across rotations (D11). — **8F**
- [ ] **`429` with `Retry-After`**, and a reason Step 1 renders. — **8F**
- [ ] **Writes fail closed, reads fail open** when the counter store is unavailable. — **8F, 8G**
- [ ] **Every other assigned endpoint is inside the limiter:** the rotation (backlog 90), saves,
      the share endpoints, `/`, `/d/*`, `/s/*` (ADR 0114 d7, B5) and the contact endpoint.
      — **8F, 8G, 8K**. ~~and the profile endpoints (ADR 0115) — 8P3–8P5~~ **The profile endpoints
      are M8B's gate line (Q1).**
- [ ] **Expired counters are pruned nightly.** — **8G**
- [ ] **The firewall rule is staged in `log` and published by the owner** (ADR 0019 d2, d4, d5).
      — **8R**. **Conditional on Q21 (2026-10-07):** on a host other than Vercel this line has no
      meaning as written, and the gate cannot be ticked until a hosting milestone states what
      absorbs volume there. It is not dropped.
- [ ] **The owner has confirmed the set without the reaper** (Q19), with 8A's worst-case figure in
      front of them. — **8A, 8T**. *2026-10-07: the set was confirmed as recommended (relayed), but
      before 8A S1 had a figure; this line is ticked only once the owner has seen it and decided on
      the storage alert.*

*The contact form (ADR 0019 d5; ADR 0001 d7; ADR 0002):*

- [ ] Its limits: 3 an hour and 10 a day per network block, 2 an hour per session, 3 a day per
      e-mail address; tighter and challenged outside MD; fails closed. — **8K**
- [ ] Honeypot, minimum time-to-submit, bot check. — **8K**. *The bot check is conditional on Q21;
      how a request from outside Moldova is treated is Q23.*
- [ ] A real sink is configured, or production says the request cannot be sent. — **8J, 8K, 8L**
- [ ] No contact detail is in a log, a design, a URL, browser storage or the Blob export; the
      application role cannot read one. — **8I, 8K, 8L**
- [ ] An unbuildable kitchen cannot be submitted (ADR 0065 d7). — **8C, 8K**

*Before real traffic, outside the ship-together set:*

- [ ] A driver error never prints the connection string. — **8B**
- [ ] ADR 0038 re-read; first stored schema declared. — **8S**
- [ ] Live rows checked against the corrected wall bounds. — **8S**
- [ ] The owner's text is in every slot (Q7, Q8, Q9); the Russian is re-signed. — **8S**
- [ ] The CSP enforces. — **8Q** (see *Also blocked on this phase* below)
- [ ] ~~Profiles' obligations 1–12, here or in M8B (Q1). — **Part P**~~ **Moved to M8B's own gate
      (Q1, 2026-10-07).** M8 closing does not open the product to real traffic: M8B is still before
      launch.
- [ ] **Added 2026-10-07.** The launch host and the database's home are ruled (Q21, Q22), and the
      list of personal data, holders and countries is with the owner. — **8S**
- [ ] The phone gate. — **8T**

Verify using ADR 0019's intended low rates. **Do not use a high-volume loop as the regression
test.**

### The 2026-08-31 list, kept

**Added 2026-09-03, from M6 — check the five stored designs against the corrected wall bounds.**
Before release, read the live rows and confirm none carries a placement in the bands that the
along-wall correction retired: **wall A 3560–3600 mm** and **wall B 2830–3600 mm**. Every coordinate
in both was reachable by ordinary editing — an insert, a width resize or a freed strip — because the
write seam enforced the same loose bound the load seam did, so this is a customer-facing exposure
rather than a restore-only one. Whether any live row sits in either band is not knowable without
database access and must not be guessed. If one does, it is a design that stops loading, and
[ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)'s marking — M6
wave 6A3 — is what makes it load again. **Note 2026-10-07:** a row written before migration `0005`
has no owner and cannot be opened by anyone (ADR 0114 d5), so the exposure is limited to rows that
have an owner [inf]. 8S checks; it does not assume.

Today the endpoint has **no application limiter** ~~and no active retention~~. ~~Every item below
must be live — not planned, not staged in a runbook — before the endpoint is exposed:~~

- ~~**Independent buckets, most restrictive wins** (ADR 0019 decision 3)…~~ restated above.
- ~~**The recorded mint limits** (ADR 0019 decision 5)…~~ restated above.
- ~~**`429` with `Retry-After`** on refusal, with a reason the UI can render.~~ restated above.
- ~~**Fail closed when the counter store is unavailable.**~~ restated above.
- ~~**The 30-day abandoned-design retention cron** (ADR 0019 decision 7): a design that never
  reached the contact step and has not been modified for 30 days is deleted by the existing
  nightly cron, which also prunes expired rate-limit counters.~~ **Retired by the owner,
  2026-09-15** (ADR 0019, *Supersession note — decision 7*). Only the counter pruning survives.
- ~~**The staged WAF rule**…~~ restated above.

~~All six ship **together**. Any one alone leaves AV-4 open~~, and the WAF rule is per-region and
coarse by construction, so it is never quoted as the cap. **Now: the set above ships together; that
it no longer bounds what accumulates is Q19.**

### ~~Unresolved prerequisite, 2026-08-31 — no credential in the system can perform the retention delete~~

**Closed 2026-10-07 by the retirement above: there is no retention delete.** The finding's facts
stand and are why Q14 and QP3 exist: [ADR 0008](../decisions/0008-least-privilege-database-role.md)
grants `app_designs` exactly `SELECT, INSERT, UPDATE` and states that **`DELETE` is deliberately
withheld**; its test asserts `DELETE`, `TRUNCATE`, `DROP TABLE` and `CREATE TABLE` are refused; ADR
0019's 2026-09-15 note says of `designs` that `DELETE` *"must stay absent"*. So in M8 nothing grants
`DELETE` on `designs`. Pruning needs it on the counters table only (Q14). What a customer's *delete*
means is QP3. ADR 0008 also flagged the contact table's grant as **its own** decision; that is Q14
(i). **Nothing was changed to record this** — no role, grant, environment variable or code.

### Also blocked on this phase — the CSP enforce flip

Added 2026-08-31, under its own heading rather than in the ship-together set: this item does **not**
gate `POST /api/designs`. It lands in M8 only because the rate limiter is the thing that would make
a violation-report endpoint safe to expose at all. `apps/web/src/lib/security-headers.ts` ships a
nonce-based policy as `Content-Security-Policy-Report-Only` with **no report sink**. Two
preconditions, both measured in wave S4 of `adversarial-review-remediation.md`: a method of
collecting violations, and the prerendered routes carrying no nonce — ~~`/`, `/_global-error`,
`/_not-found`, `/configurator/configure`, `/configurator/contact`~~ **today `/_global-error`,
`/_not-found` and the two contact pages [src `security-headers.ts:13-14`; ~~re-read from the manifest
in 8A~~ **measured by 8A S1 from a real build's manifest: exactly these four** (*8A figures*, A)]** — so enforcing today would blank them, `/_global-error` included, which is the error
boundary itself. Flipping the one constant `CONTENT_SECURITY_POLICY_MODE` without clearing both
preconditions would take the app down. **Wave 8Q.**

## Added 2026-09-06, owner-ruled: a driver error must not print the connection string

**Found incidentally** by wave 6R's visual-verification pass, not by a security review: with a
malformed `DATABASE_URL`, the `neon()` driver's own thrown error prints the **full connection string,
credentials included**, into the dev server log. The owner ruled it here rather than into M6 —
*"If milestone eight will be focused on security, record, if needed, the fix for this situation to be
done in milestone eight."*

**Why it is not urgent and is still real.** It was observed in local development, where the operator
already holds the credential, and it needs a malformed URL to fire — so it leaks nothing to a
customer today. What makes it M8's rather than nobody's is where those logs go once this product is
deployed: a platform log drain is a second place the credential then lives, read by a wider audience
than the person who typed it, and retained on someone else's retention schedule.

**Where it comes from.** ~~The driver is constructed in three places —
`packages/persistence/src/design-row-source.ts:77`,
`packages/persistence/src/neon-configuration-repository.ts:117` and
`packages/persistence/src/delete-designs-for-tests.ts:38`~~ **Corrected 2026-10-07 [src]:
`neon-configuration-repository.ts:175`, `share-link-repository.ts:83`, `design-row-source.ts:56`,
`migrate-status.ts:88`, `delete-designs-for-tests.ts:26` and `:46`; and, found by 8A S1, a seventh
that is not a `neon(` call, `migrate.ts:57`'s `new Client(…)`** — plus the lazy wrapper at
`apps/web/src/lib/server/repository.ts`. The string is printed by the driver's own error, so the fix
is to catch and re-throw a domain error naming the *variable* and never its value, at the boundary
where the URL is read. `packages/persistence` is the only place a Postgres driver appears
(`scripts/gates/boundary.sh` holds that), so the seam is already single.

**Acceptance criterion.** With `DATABASE_URL` set to a malformed value carrying a recognisable fake
password, no log line, thrown message or stack frame produced by any of the ~~four~~ construction
sites contains that password — asserted by a test, not by reading the code. The error still names
which environment variable is wrong, because an error that hides the variable too is a support call.
**Wave 8B carries it, widened to every connection variable.**

## An inherited criterion from M6 — recorded 2026-09-03

**The review/contact step refuses while any body does not fit its wall.** From
[ADR 0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decision 7,
raised by M6 wave 6I and decided by the owner on 2026-09-03.

M6's half is *save yes*: a design with a body past the end of its wall **saves and resumes with its
warning intact**, so no work is lost and the customer can come back to it. **M8's half is *submit
no*:** an unbuildable kitchen must not reach the owner as an enquiry.

- The refusal names **which** bodies do not fit, not merely that some do. The customer has to be able
  to go back and fix it, and M6 marks them in the scene for exactly that.
- It reads the **same** published fact M6 wave 6A3 detects — the scene, the breakdown, the price bar
  and this step must not disagree about whether a design fits.
- It is a **refusal to submit, not a refusal to save**. The design is still stored, still shareable
  and still editable; only the enquiry is blocked.
- This sits alongside the *Launch gate* items above rather than inside them: it is a product rule,
  not a security one, and it does not gate the endpoint — it gates what may be sent through it.

**Carried by 8C (criterion 5), 8D (criterion 7), 8H (criterion 7) and 8K (criterion 3).**

## A consequence that becomes live after this phase — recorded 2026-09-02

[ADR 0062](../decisions/0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md):
after M8 the project gains a manufacturer-facing dashboard whose **primary purpose is adjusting
prices** — the manufacturer edits the price book without a developer.

**M8 builds nothing for it.** What M8 owns is one consequence, because this phase is where a price
first **outlives the book that produced it**: a contact submission snapshots a price, and the moment
the book can be edited, `CONFIGURATION_MODEL.md`'s pricing-version equality rule stops being
theoretical. That rule permits **no "current version" fallback and no migration inside pricing**, so
a design priced under a retired book version cannot simply be re-priced under the current one — and
a snapshot that silently re-prices is a customer being shown a different number than the one they
submitted.

~~Decide, in this phase, what a submission whose pricing version no longer matches the live book
does: refuse, re-price with the change stated, or keep the snapshot and mark it historical. It is
added to the open questions below rather than answered here.~~ **Answered 2026-10-07 by D7: keep the
snapshot.** The submission stores the priced lines, the total and the book's version at the moment
of submission, and nothing re-prices it. This follows the owner's own design recorded in ADR 0072
(items 2 and 5). The dashboard, when it exists, reads the stored figure as historical.

## Proposed variables, secrets, resources and dependencies

**Proposals for the owner. Nothing here is created, changed or removed by an agent
(`environments-and-resources.md`). Names are proposals; no value appears in any document.**

| What | Kind | For | Wave | Note |
| --- | --- | --- | --- | --- |
| Mail provider account; SPF, DKIM and DMARC records on a Lemnaria domain | resource, DNS | Q3, Q4 | 8J | Owner only |
| `MAIL_PROVIDER_API_KEY` | secret; production and preview | sending | 8J | Never in test or CI: the fake is injected |
| `MAIL_FROM_ADDRESS` | variable | the sender | 8J | |
| `LEAD_NOTIFICATION_ADDRESS` | variable | the shop's inbox | 8J | Its absence makes submission *unavailable* |
| The shop's phone number | content or variable, per Q3 | frame 5B | 8M | Where it lives is decided with Q3 |
| Table `rate_limit_counters`; grant `SELECT, INSERT, UPDATE, DELETE` on it | schema, grant | the limiter | 8E | Postgres, not Redis (ADR 0019 Alternative 4). Grant by the owner |
| Table `contact_submissions`; column-scoped grants | schema, grant | leads | 8I | Q14 |
| A second cron entry ~~, or the existing one extended~~ | `vercel.json` | pruning | 8G | ~~Depends on the plan's cron limit [inf]~~ 100 entries per project on every plan, daily on Hobby **[ven §3]**; `CRON_SECRET` is reused |
| The bot check's package, its Next configuration and its project setting | dependency, setting | Q16 | 8K | A dependency change: security tier |
| A test-only limiter policy selector | variable, never set in a deployment | e2e | 8F | Only if 8F S0 finds no way without one; must be unreachable in production |
| Firewall rules | platform | ADR 0019 d2 | 8R | Staged by commands an agent prepares; published by the owner |
| A storage alert on Neon | platform | Q19 | 8T | Optional |
| Part P: tables for profiles, sessions and e-mail tokens; a design's owning profile; their grants | schema, grant | ADR 0115 | 8P1 | QP3 decides whether any `DELETE` is asked for |
| Part P: a password-hashing dependency | dependency | obligation 1 | 8P2 | None if the runtime has argon2id built in: Node has it from 24.7.0 **[ven §5]**; the deployed patch version is still to be read. **M8B's** |
| Part P: a breached-password source | third-party call or data | obligation 2 | 8P2 | QP1 |

No signing secret is proposed: sessions and tokens are random values stored as hashes, as the
visitor cookie is [inf]; 8N confirms.

**Added 2026-10-07.** The three *Part P* rows above are M8B's (Q1). The mail rows depend on Q25: with
(c) there is no provider account and no API key, and the proposals become a dedicated mailbox at the
shop's mail host, its SMTP host, port, user and password as variables, and an SMTP client
dependency. The bot check's row and the firewall row exist only if Q21 keeps the launch on Vercel.
With Q21 (b) or Q22 (b) this table is incomplete: a reverse proxy, TLS, a scheduler, a backup store
and a database server would all be new resources, and none is proposed here because none is
planned.

## ADRs

**To be written, each when its wave starts** (next free number at this writing: 0146). The scribe
writes them; the architect supplies the content.

1. Screens 3–5 are addressed by the design and gated like it; screen 5's name (D1, Q2). Closes ADR
   0003's open route question; a pointer in ARCH §8.
2. The submission contract: the server snapshots the stored row at the reviewed revision, prices it,
   stores it with the book's version and never re-prices it; success means stored and notified;
   idempotency (D5–D9, D15, D16). Answers ADR 0062's M8 consequence; pointers in ARCH §9 and ADR
   0072.
3. The application rate limiter as built: store, hashed keys, fixed windows, the session bucket
   across rotation, what *challenge* means in the application, the address and country sources,
   failure modes, the test policy (D10–D12). Dated notes on ADR 0019 (the gate's set after decision
   7's retirement; the endpoint's name) and ADR 0114 (decision 7's *"retention cron deletes the
   visitor hash"* is moot; H1 and the session bucket).
4. Grants for the new tables (Q14). A dated note on ADR 0008.
5. Mail: the port, the provider, the one recipient; the fate of the e-mailed edit link and of frame
   2F's link exit (Q3, Q4, Q11, Q12). An amendment to ADR 0115 for obligation 12.
6. A driver error never carries a connection string (8B).
7. M8's copy rule and its slots (Q7–Q10). A pointer on ADR 0113.
8. The CSP enforces: how both preconditions were discharged (8Q). An amendment to ADR 0041.
9. The first stored schema at launch (Q20). Closes ADR 0038's expiry and ADR 0111 decision 8.
10. ~~Customer profiles as designed (8N): storage, session, CSRF, claiming, how a session authorises
    a claimed design, deletion. Amends ADR 0114 decision 5 and ADR 0008.~~ **M8B's (Q1).**
11. ~~If Q1 is (b):~~ **Owed now (Q1 answered (b), relayed, 2026-10-07):** profiles become M8B,
    after M8 and before launch. An amendment to ADR 0115, whose title, decision 1 and the owner's
    fifth answer in its *Context* (*"In M8, with e-mail"*) say M8.
12. If Q17 is (b): the firewall's scope. An amendment to ADR 0114 decision 7.
13. **Added 2026-10-07.** *"Moldova only for now"*: a dated note on ADR 0019 d4, which rests partly
    on the diaspora. What the note says about denying, challenging or ignoring geography waits for
    Q23; that the owner said it does not.
14. **Added 2026-10-07.** The launch host and the database's home, once Q21 and Q22 are ruled. If
    either leaves Vercel or Neon, ADR 0019 d2, d4, d9 and d10, ADR 0007, ADR 0012 and ADR 0054 each
    need a dated note, and the move is planned as its own milestone.

**Relied on as they stand:** 0001, 0002, 0004, 0008, 0012, 0019, 0020, 0036, 0038, 0041, 0042, 0054,
0062, 0063, 0065, 0067, 0069, 0072, 0074, 0092, 0095, 0096, 0104, 0106, 0107, 0111, 0112, 0113, 0114,
0115, 0118, 0128, 0130, 0131, 0132, 0133, 0144, 0145.

## Risks

- **Authoring legal or timeframe copy to fill a gap.** A slot with text that is visibly a
  placeholder is correct; a plausible sentence is not. Q7–Q9 and the gate hold it.
- **Review drifting from the editor's grouping.** One projection, three consumers; 8C's parity
  property is the guard, and it must not feed both sides from one call.
- **A submission that reports success without a real sink.** Forbidden; 8J criterion 5, 8K
  criteria 7 and 8.
- **The limiter refusing real customers.** Q15. A limit sized in August meets a flow built in
  September. 8A measures before 8F builds.
- **The limiter breaking the e2e suite, or a test switch reaching production.** 8F S0 and criterion
  9.
- **Rotation defeating the session bucket.** D11. If the preferred mechanism fails review, 8F
  returns to planning rather than shipping a bucket that resets on every mint.
- **The application becoming its own denial of service.** Every refusal costs a function call and a
  database write (ADR 0019 d2). The firewall rule (8R) is what absorbs volume; the gate ships them
  together.
- **A vendor fact assumed.** Every one is labelled [inf] and owed to 8A. *2026-10-07: 8A S2 read
  them; what stays unverified is listed in* 8A figures.
- ~~**Profiles' size.** Ten waves of authentication. Q1.~~ Moved to M8B.
- **Building for a host the product will not launch on** (added 2026-10-07). The bot check, the
  firewall rule, the address and country headers, the cron and the Blob store are Vercel's. The
  owner has said Vercel is *"only for development"* and has not ruled where launch happens. Q21 is
  asked before 8F S1, 8K's bot check or 8R is dispatched, so that none is built on a guess.
- **A recorded answer read as wider than it was.** *"Rest as recommended"* accepted twenty
  recommendations in one phrase, one of them (Q4) on a premise that was false. Each is recorded as
  relayed; the five that depend on Q21 or Q22 are marked conditional; Q24–Q26 are asked instead of
  inferred.
- **A second scene mount.** The review and 5A mount the scene on new routes (D4). ADR 0144's
  first-frame bound applies; 8D's phone acceptance watches it.
- **Grant order.** Web code that reads a table before its migration and grant are applied fails in
  production. Each store wave ends with a stated owner action, and the code that needs the table
  lands in a later wave.

## Verification

Per wave: paired tests; sabotage in both directions (R6); `pnpm format:check` whole-tree; the
affected packages' suites; then adversarial QA; then review at the named tier, with a security
reviewer wherever the table says so. A visible wave needs captures of the real surface at
390 × 844, inspected. The coordinator re-runs every cited command as `rtk proxy` (R9). No wave is
verified by a high-volume request loop. No wave's test sends mail, or touches the application
database (ADR 0006).

Across the milestone:

- Submission-boundary tests: revalidation, recomputation, idempotency, the revision check, refusal
  of an unbuildable kitchen, and absence of contact data from the design, the logs and the export.
- Form tests for blur-time validation, first-error focus and double-submit protection.
- A forced-failure run proving state survives and the automatic retry fires on reconnection.
- Limiter tests per bucket at the limit and one past it, on a fake clock.
- Real touch through all seven frames at 390 × 844, in both locales.
