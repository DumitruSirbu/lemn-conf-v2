# M8 — Screens 3, 4 and 5: review, contact, success and failure

> **STATUS: PLANNED — wave plan written 2026-10-07 at `90927dc`; no wave dispatched.** M8 does not
> start until the owner says so and M7C has closed (see *What M8 assumes*). Summary: `docs/STATUS.md`.
>
> **Scope restated 2026-10-07, after the owner's answers to Q21–Q27.** Hosting, the database's
> home, the mail provider, the bot check, the firewall and the rebuilding of runtime errors go to
> **a separate delivery-preparation milestone**; M8 is *"functionality and basic security for
> now"* (the owner's words). **M8 is fifteen waves and ends at 8T: 8R and 8S leave; 8F, 8J, 8K and
> 8T change.** The launch gate does not close with M8. Read *M8 restated* at the head of *Waves*
> first; it supersedes the paragraphs below and any wave text it names. **The owner then ruled the
> limit on new designs: 20 a day per IP address, for everyone, and nothing else** (*The limit on
> new designs, as the owner ruled it*), which supersedes ADR 0019's mint row. **Open for M8: Q29,
> Q30, half of Q31, Q32.** Dispatchable: 8E, 8I, 8H; 8D once 8C's QA and review close.
>
> **Updated 2026-10-07, latest: wave 8B is DONE (`d176fb6` … `0eb94b6`), not pushed.** It went through QA
> (four passes), two review rounds and all three reviewers' approval; see *8B as built* and ADR 0146. It
> supersedes the paragraph below where that says 8B is in QA, in review, or that round B and review round 2
> are next. **Next: wave 8C** (Q10 answered). Wave 8A: its measurements and vendor reads are done and Q1–Q20
> are answered; Q21–Q27 are open; its review has not been run.
>
> **Updated 2026-10-07, later, at `7519005` on `m8-review-contact-success` [src, git].** The owner
> answered Q1–Q20 (*The owner's answers, 2026-10-07*). **Profiles left for M8B** (Q1), so M8 is
> seventeen waves and ends at 8T. 8A S2's vendor reads are folded in (*8A figures*); 8A S1's
> measurements ~~are not in yet~~ **arrived later the same day and are in the same section (written
> at `a7b0363`)**; they changed 8B's slices and criteria and what 8F owes the e2e suite, and left
> Q15 standing. **8B is implemented; QA's first pass found three defects, round 1 fixed them
> (`a20432e`), QA's re-run left one test failing, round 2 fixed it (`1df6d7f`), and QA's third pass
> left eight failing on four findings, round 3 fixed them, and QA's final pass was green
> (`8cd85da`). **Review round 1 found one blocker (R1.1): a value with an interior newline passes
> the opener and its password reaches the log on the query path.** All of it is adjudicated in
> its section. ~~Next: fix round A (three items), a targeted QA pass, round B (clean-code), then
> review round 2.~~ **Round A is done (`f1a1d00`) and its targeted QA pass is green; QA19 (the
> live suites reach the driver past the guard) joins round B as rule B11. Next: round B (three
> items), a QA check of B11 only, then review round 2.** Q27 was raised by it, and its recommendation changed to (b). **Six follow-up questions are open,
> Q21–Q26** (seven with Q27), and the first two —
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

**Restated 2026-10-07 (*M8 restated*, at the head of *Waves*).** Of the list above: *"the contact
form's bot controls"* is now the honeypot and the timing check only; *"the pre-launch checks"*
leave; the sink is a stored row and a notification port with no provider behind it yet. The
limiter, the submission boundary, the driver-error redaction and the CSP flip stay.

**Out, with the owner of each.**

- **Hosting, the database's home, the mail provider, the bot check, the firewall, the rebuilding
  of runtime errors, the pre-launch checks and the launch gate: a separate delivery-preparation
  milestone**, by the owner's ruling of 2026-10-07 (verbatim in *The owner's answers to Q21–Q27*).
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
| D11 | The mint's session bucket must survive ADR 0114 H1's rotation, which changes the visitor value on every mint. The mechanism is fixed in 8F S0. | [doc] ADR 0019 d3 keys a bucket on the session; ADR 0114 H1 rotates it. **A gap between two records.** Preferred [inf]: count the visitor's own `designs` rows created in the window, since rotation moves those rows. **2026-10-07: the owner's ruling leaves the mint no per-browser bucket, so D11 no longer bears on it. It still bears on saves and the contact form, whose per-browser figures remain; 8G's and 8K's S0 settle the key.** |
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

**Overtaken for the mint, 2026-10-07, later:** the owner replaced the mint's whole row with 20 a
day per IP address (*The limit on new designs, as the owner ruled it*). Q15 (i)'s concern, a sixth
*Continuă* in an hour refused, is gone; the twenty-first in a day is refused. Q15 (ii) and (iii),
saves and page reads, are untouched. The note below is kept as written.

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

### The owner's answers to Q21–Q27, 2026-10-07

Given against the coordinator's table of each question, its recommendation and what it blocks.
**Verbatim** (relayed by the coordinator), in the order given:

> 21 - or in one of Moldova's servers or one server in Germany I guess

> 23 - like how many designs a user can generate? I think you worry for DDos and for this we need
> something like claudflare captcha or a performant bot shield, but limiting can be a option like
> not 10 but 20-30

> 24 - hmm good question not sure how good to limit by Moldova so I would not limit here

> 25 - or the server provider will have also email, or something like sendgrid (goal is not to go
> to spam), but email will go to admin so for sure it will not go to spam

> 22 - I think if I will have a VPS I can use or a docker that will have containers for DB also...
> or we can keep Neon with a EU server...

> 26 - no needed any info related to this, the manufacturer can call in 3 days

> 27 - for sure, but I think I will plan a new separate milestone that will prepare the project for
> delivery, at that time we will finalize the development and will plan where to host and will have
> more info, lest focus on functionality and basic security for now

**Ruled, in the owner's words.**

- **A separate milestone will prepare the project for delivery**, and it is where hosting is
  planned. **M8 is to "focus on functionality and basic security for now".** This reshapes the
  milestone; see *M8 restated* at the head of *Waves*.
- **Q27: yes** (*"for sure"*): errors hide the host and the role too. **In that milestone, not M8.**
- **Q26: no hint about a response time.** *"the manufacturer can call in 3 days"* is the owner
  describing the business. **It is not copy, not a promise to show, and not a criterion**; no
  string and no test is made from it.
- **Q24: phone numbers are not limited to Moldova** (*"I would not limit here"*). This is the
  architect's first recommendation, Q6 (iii): a Moldovan number, or any international number
  written with `+`. The later reversal in Q24 is withdrawn.

**Not ruled. Leanings, deferred by the Q27 answer to the delivery milestone.**

- **Q21:** a server in Moldova, or one in Germany (*"I guess"*). Read with the earlier *"Vercel is
  only for development"*, the consistent signal is that launch is not on Vercel. No host is chosen.
- **Q22:** Postgres in a container on that server, or Neon kept in an EU region. Undecided.
- **Q25:** the server provider's own e-mail, or *"something like sendgrid"*; the stated goal is
  *"not to go to spam"*, and the mail goes to the admin. No provider is chosen. Still owed: the
  inbox address, the shop's phone number, a sending domain.

**Q23: partly ruled, read two ways, and narrowed to Q28.** The owner asked back what the limit is,
placed protection against a flood in *"something like claudflare captcha or a performant bot
shield"*, which is outside the application and so in the delivery milestone, and accepted limiting
with a higher figure: *"not 10 but 20-30"*.

- *The coordinator's reading, labelled as theirs:* the day cap proposed in Q23's rider for the
  non-Moldovan tier becomes 20 to 30 a day and not 10.
- *The other reading:* one daily limit of 20 to 30 designs for everyone, and, taken with Q24's
  *"not sure how good to limit by Moldova"*, no Moldovan and non-Moldovan tiers in the limiter.

The two differ in whether ADR 0019 d4 and d5's tiers stand. Neither is picked here.

| Q | Answer | State |
| --- | --- | --- |
| 21 | A Moldovan or a German server, *"I guess"* | **Not ruled.** Delivery milestone |
| 22 | A container on the server, or Neon in the EU | **Not ruled.** Delivery milestone |
| 23 | Flood protection is a bot shield; a limit of *"20-30"* is acceptable | **Settled later the same day.** The shield: delivery milestone. The figure and the tiers: Q28, answered — 20 a day per IP address, for everyone, and nothing else. The IPv4 unit: **Q32** |
| 24 | Not limited to Moldova | **Settled:** Moldovan, or international with `+` |
| 25 | The host's e-mail or a relay like SendGrid | **Not ruled.** Delivery milestone |
| 26 | No hint | **Settled:** frame 4A's hint is not drawn |
| 27 | Yes, in a separate delivery milestone | **Settled:** (b), not in M8 |

**What the Q21 ruling does to the conditional answers of the first round.** Q16 (the bot check),
Q17 (the firewall rule) and Q19's WAF half were conditional on the host. With no host chosen, none
is built in M8; each goes to the delivery milestone with its question. Q13 (ii)'s point-in-time
restore and Q15's address and country sources go the same way.

### Follow-up questions, 2026-10-07 — ~~open~~ answered or moved; Q28–Q30 are what remains

Raised by the owner's answer and by 8A S2's reads. ~~None is answered.~~ **Q21–Q27 were answered on
2026-10-07 (the section above). Each keeps its text below as it was put.** What is open for M8
itself is at the end of this section.

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

**The rider below is moot for the mint (2026-10-07, later):** the owner ruled one limit for
everyone, 20 a day, with no tier outside Moldova.

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

**Q27 — Must an error also hide the database's host and role, or only its credentials?** (Raised
2026-10-07 by 8B's QA.) The owner's ruling of 2026-09-06 names the connection string and the
password. This plan added the user and the host to 8B's tests; that was the architect's widening.
After 8B's fix round the persistence package copies nothing out of a connection value, so the
question is only about one place: **a query that fails against a well-formed address**, whose
driver error the three runtime sites rethrow untouched. Measured there (8A S1): no password, no
user, no host as written. It can show a name derived from the host (`api.` and the host without
its first label), an address the host resolved to, and, **unmeasured**, whatever a server says when
it rejects a login, which may name the role [inf]. The role `app_designs` is already published in
this repository (ADR 0008).
(a) Leave it: none of these is a credential. (b) Hide them too: every runtime query error is
rebuilt as 8B's B3 rebuilds a migration error, in a later wave that touches each repository method.
~~*Recommended: (a), with 8B's F3 measurement run once* to show that a rejected login does not
carry the password.~~ *Blocks:* nothing in 8B; its close-out says which answer it was closed under.

**Changed 2026-10-07, after 8B's review round 1: the recommendation is now (b), as its own wave
before launch.** What the security reviewer established about a query-time error, relayed:

- It reaches logs only, never a response body.
- **It carried the password.** A value with an interior newline passed the opener, the runtime
  refused it as a header, and the driver's error quoted it whole (8B's R1.1; reproduced by the
  architect with fake values). 8B's B10 closes that way in. It does not make option (a)'s premise,
  *"none of these is a credential"*, true by construction: the next consumer to quote the string
  would land on the same path.
- An HTTP 400 from the database carries the server's message verbatim and sixteen server fields,
  `detail` among them. On a constraint failure Postgres puts row values in `detail` [the
  reviewer's inference], so a design document or a token hash can ride there. Backlog 84 already
  records one instance.
- A failed fetch names a host derived from the address, or the address it resolved to.

So the question is wider than a host and a role: **it is whether the one remaining place where a
driver's error passes through untouched should stay so.** (a) Leave it, with B10 and the fixed log
line as the protection. (b) Rebuild every runtime query error as B3 rebuilds a migration error: a
type name and a code, nothing else; the retry decision is taken on the raw error first, inside the
package. *Recommended: (b).* It is the same rule 8B applied everywhere else, and R1.1 is the
evidence that the exception was not safe. It is a wave of its own (each repository method, the
retry wrapper, the failure log), Full tier with security, and belongs on the launch gate. F3 is
moot under (b).

### The limit on new designs, as the owner ruled it, 2026-10-07

Three answers, each to one narrow question from the coordinator, **verbatim** (relayed):

> 20 design generation per day for all (we can track and adjust later this)

> per user (ip)

> 20 per day

The third was the reply to: *"The existing 5 an hour per session and 10 an hour per network: do
they stay, or is 20 a day the whole limit?"*

**Ruled, in the owner's words.** For creating a design (the mint): **one counter, per IP address,
20 a day, the same for everyone, and that is the whole limit.** The figure is provisional: *"we can
track and adjust later"*. The hourly limits, the per-browser limit and the tighter limit outside
Moldova all go, for the mint.

**What it overturns in ADR 0019, for the mint.** A dated supersession, not an annotation; the
scribe quotes these:

- **d5**, the mint's row: *"`POST /api/designs` (mint) | 10 / hour, 30 / day | 3 / hour + challenge
  | 5 / hour"*. All four figures.
- **d4**, as it applies to the mint: *"Traffic from **MD** gets the ordinary limits. Everything
  else gets a much tighter limit and a `challenge` rather than a `deny`."*
- **d3**, as it applies to the mint: the *session cookie* bucket (*"repeated submits from one
  browser"*), and *"most restrictive wins"*, which has nothing to choose between when there is one
  bucket. Its *"IP aggregated to /24 (IPv4) and /64 (IPv6)"* is Q32.
- This file's launch-gate line *"The mint limits … 10 an hour and 30 a day … 5 an hour per
  session, across rotations (D11)"*, Q15 (i), Q23's rider and Q28's recommendation of 30.

**How it reads beside *"Moldova only for now"*.** They do not conflict. The customers at launch
are Moldovan; the limiter does not tell one country from another when a design is created.

**Not said by the owner. Each is the architect's reading, with what it rests on.**

- **One address, or a block of them: Q32, below.** For IPv6 it is not a question: the unit is the
  /64. ADR 0019 d3: *"per-address IPv6 is worthless, since a single subscriber is routinely
  delegated an entire /64"*, and *"IPv6 /64 aggregation is not optional"*. A /64 is one
  subscriber, which is what the owner means by a user. [The architect's, from that record.]
- **What a day is.** ADR 0019 says *"/ day"* and no more. *Ruled here, the architect's:* the
  calendar day in Chișinău, as a fixed window; a refusal says the limit returns tomorrow. It is
  what a person means by *"per day"*, and it is one row per address per day in 8E's table. Its
  cost is D10's: 20 late one evening and 20 after midnight. It is a datum in the policy, cheap to
  change.
- **Saves, shares, page reads and the contact form.** The owner has not addressed them, and *"20
  per day"* is not extended to them. Their figures in ADR 0019 d5 stand. One consequence of the
  **hosting** ruling does reach them, and it is the architect's: M8 has no trusted fact about a
  request's country, so for those rows M8 applies the record's Moldovan column to every request
  and builds no second tier and no challenge. Whether they ever get one is the delivery
  milestone's, with the shield.
- **D11 no longer bears on the mint**, which has no per-browser bucket. It still bears on the
  per-browser figures that remain: saves (300 an hour) and the contact form (2 an hour), since
  creating a design changes the visitor value and so would reset them. Preferred [inf]: key those
  two on the design, which a rotation does not change. Fixed in 8G's and 8K's own S0.

**What 20 a day admits, restated from 8A S1's figure.** One address: 20 rows a day at 523,972
bytes each, **10.0 MiB a day** [arithmetic on 8A S1's measured size; the architect's]. With no
hourly limit, all 20 can be spent in a minute. **Per-address abuse is bounded at 20 a day.
Abuse spread over many addresses is not bounded by the application at all**: the 1,000-an-hour
brake in ADR 0019 is a *challenge*, nothing in M8 can challenge (D12), and the owner placed that
defence in a bot shield. This is a named interim until the delivery milestone, and it is where
Q19's storage alert lands.

**"Track".** The counter table of 8E holds, for each address and day, how many designs it made, so
the numbers the owner needs exist while a day's rows exist: how many addresses made any, how many
reached 20. Pruning deletes them. *A named addition, to 8G's prune:* before a day's rows are
deleted it writes one line of totals for that day — addresses seen, addresses that reached the
limit, the largest count — and no address. A refusal also writes one line with no address.

**Privacy.** An IP address is personal data. **No record decides how it is stored**: ADR 0114
hashes the visitor *secret*, which is random; ADR 0019 does not mention hashing an address; D10 is
this plan's. And D10 is weaker than it reads: an unkeyed hash of an IPv4 address can be undone by
trying every address, so it shortens the value and does not hide it from someone holding the
table. What limits exposure is time: a day's rows are deleted once the day is over and its totals
are written. A keyed hash would hide it and needs a secret variable in every environment; it is
put to 8E's security reviewer, not built by default. Both facts go on the delivery milestone's
list of what data is held where.

### What is still open for M8 itself, 2026-10-07

~~Four questions.~~ **Q28 is answered (the section above). Open: Q29, Q30, the second half of Q31,
and Q32.** Every other open question went to the delivery milestone with its subject.

**Q32 — For IPv4, is "per IP" one address, or the block of 256 around it?** The owner said *"per
user (ip)"*. ADR 0019 d3 counts a /24, to catch *"floods from one host or network"*, and warns in
the same row that *"CGNAT and mobile carriers put thousands of real customers behind one
address"*. With 20 a day as the only limit the two pull apart:

- *One address.* A person's 20 are theirs, except behind a shared address (an office, a mobile
  carrier), where everyone behind it shares 20. Someone holding many addresses gets 20 for each.
- *A block of 256.* Harder to walk around. Everyone whose provider puts them in the same block
  shares 20 a day, whether or not they share an address. No record measures how Moldovan
  providers allocate addresses [inf that sharing is common].

*Recommended: one address for IPv4, the /64 for IPv6.* It is the owner's word, the limit is now
about one person's use and not about a flood, and the flood is the shield's. **The question, as
one sentence:** *"Should the 20 a day be counted for each single internet address, or shared by
the whole neighbourhood of 256 addresses a provider hands out together?"* *Blocks:* one number in
8F's policy; the wave builds the reduction for any prefix and proves both.

**Q28 — One limit on new designs for everyone, or a tighter one outside Moldova; and which
number?** *[**Answered 2026-10-07:** one limit for everyone, **20 a day**, per IP, and nothing
else. Not the 30 recommended below. See the section above.]* (Q23, narrowed.) What the record has today (ADR 0019 d5) for one network: inside Moldova
10 new designs an hour and 30 a day; outside it 3 an hour, no day figure, and a challenge. One
browser: 5 an hour.

- *If the two tiers stay* (the coordinator's reading): the outside tier gains a day cap of the
  owner's figure. 8F then needs to know a request's country, which only the current development
  host supplies; on any other host there is no such fact until the delivery milestone, and the
  challenge has no mechanism in M8.
- *If there is one limit* (the other reading): the limiter has no country in it. 8F is then
  independent of the host except for the client's address. ADR 0019 d4 and the outside-Moldova
  column of d5 are set aside for the application limiter and return, if at all, with the bot
  shield.

*Recommended: one limit for everyone, and the number already in the record: 30 a day and 10 an
hour for a network, 5 an hour for a browser.* It is the top of the owner's range, so no new figure
is invented, and it is the only choice 8F can build now. Whether traffic from outside Moldova is
treated differently is decided with the shield, in the delivery milestone.
**The question for the owner, as one sentence:** *"Should everyone get the same limit of 30 new
designs a day (10 an hour), or should visitors from outside Moldova get a lower one — and if a
lower one, 20 or 30?"* *Blocks:* 8F's policy slice.

**Q29 — Until a mail provider is chosen, what does *Trimite cererea* do on a test deployment?**
M8 builds the notification and the port it leaves by, and no provider (Q25 moved). By D8 a request
succeeds only when it is stored and notified, so with no provider every deployment answers that
the request cannot be sent, and screen 5A is reachable only in automated tests.
(a) Leave it so: 5A is shown by tests and captures until the delivery milestone.
(b) A deployment the owner marks as a test one stores the request and shows 5A, with no e-mail
sent, so the flow can be tried by hand. A deployment not so marked still refuses. The delivery
milestone's gate then holds a line that the mark is absent in production.
*Recommended: (b).* The owner checks each milestone by hand, and (a) leaves two of the three new
screens out of reach. It costs one variable the owner sets, and one more thing that must not reach
production. *Blocks:* 8J's last slice and 8K's criterion 8.

**Q30 — When the price cannot be computed and a cabinet also does not fit, which refusal does the
review show?** Wave 8C as built shows the pricing one alone and names no cabinet [relayed; the
implementer's choice, flagged]. ~~ADR 0065 d7 says of a kitchen that does not fit: *"The refusal names
which bodies do not fit"*.~~ **Corrected 2026-10-07: that sentence is this plan's own (*An
inherited criterion from M6*), not ADR 0065's. Decision 7 says only that the step *"refuses while
any body does not fit"*. Q30 is settled as rule C3 in wave 8C's adjudication, on the plan's
criterion; it is the architect's ruling and the owner may overrule it.** *Recommended: the fit refusal is shown whenever a cabinet does not fit,
with the pricing one beside it or after it.* The customer can act on the first and not on the
second. In the architect's reading the record already answers this and it is a criterion gap in
8C's item 5, the architect's; it is put to the owner only if the coordinator reads ADR 0065
otherwise. **Wave 8C's section is not edited here: its QA is running.** *Blocks:* 8C's close.

**Q31 — *Dulapuri* or *corpuri* on screen 3?** *[**Half answered 2026-10-07.** The owner,
verbatim, of the refusal sentences: "dulapuri". The three `review.refusalReasons` sentences
already say so and stand as written. **Still open, asked by the coordinator and not answered:**
whether the room line's count (*"1 corp"*, *"2 corpuri"*) changes to match. The ruling is not
extended to it.]* The frames say *corpuri* (3A: *"14 corpuri"*). The
approved catalogue says *dulap* almost everywhere: 58 lines of `ro.json` against 5 [src]. The
owner's own approved `globalSettings.appliesTo` already reads *"tuturor celor # dulapuri"* where
frame 2E draws *"celor 14 corpuri"*. 8C drafted the room line with the frame's word and the three
refusals with the catalogue's, so one screen now uses both.
(a) *Dulapuri* in both. (b) *Corpuri* in both. (c) As drafted.
*Recommended: (a)*, on the precedent of the leaf the owner already changed. Under Q10 the drafted
wording stands until the owner adjusts it, so this blocks nothing.

## Waves

### M8 restated, 2026-10-07 — functionality and basic security

**The ruling** (owner, verbatim, in *The owner's answers to Q21–Q27*): *"I will plan a new separate
milestone that will prepare the project for delivery, at that time we will finalize the development
and will plan where to host … lest focus on functionality and basic security for now"*. What
follows is the architect's reading of what that moves. **The owner named hosting; that the rest
moves with it is derived, line by line, and each derivation says from what.**

**What leaves M8 for the delivery milestone.**

| What | Why it follows from the ruling |
| --- | --- |
| Where production runs (Q21) and where the database lives (Q22) | The owner's words |
| Wave **8R**, the firewall rules; Q17; the launch gate's WAF line; the storage alert (Q19) | A firewall belongs to a host, and none is chosen. The owner placed flood protection in *"a performant bot shield"* |
| The bot check (Q16); D12's *challenge* | BotID is the current host's; the owner named another kind |
| The **trusted** source of a client's address and country | Each host's proxy supplies it differently [ven §2] |
| The mail **provider**, its adapter, its DNS, the sending domain (Q25) | *"the server provider will have also email, or something like sendgrid"*: chosen with the host |
| Q27 (b): rebuilding every runtime query error | The owner's words: *"for sure, but … a new separate milestone"* |
| Wave **8S**, the pre-launch checks, whole; F3, F4, F5, F6; the list of what data is held where; the owner's question about GDPR | Each is a check on the system as it will be launched |
| **The launch gate itself** | It cannot be ticked without its WAF line, and it must not close with M8. See below |

**What "basic security" keeps in M8.** Everything that is the application's own code and needs no
host:

- **8B**, done.
- **The application rate limiter and the mint**, waves 8E, 8F, 8G: independent buckets, the
  limits, `429` with `Retry-After`, fail closed, pruning. The client's address comes through a
  port (below).
- **The contact boundary**, 8H, 8I, 8K: the contract, the column-scoped grants (Q14), idempotency,
  the limits, the honeypot and the timing check. No vendor bot check.
- **The CSP enforces**, 8Q. It is the application's own header and needs no host. It is also what
  D17 and Q18 lean on: contact details stay out of script-readable storage because the policy did
  not yet block. It stays, after 8L.

**SEC-001's gate: a dated decision is touched, and this is how.** ADR 0019's correction of
2026-08-31 records the owner's condition that the deferral be *"tracked and gated"*, and names this
file's *Launch gate* as the place. **M8 discharges the application half** (8E–8G, 8K) **and does
not close the gate.** The gate goes, whole and unticked where M8 did not tick it, to the delivery
milestone, which is the phase that now stands in front of launch. This is the architect's reading
of the ruling, not the owner's sentence: the owner moved hosting, and the gate's operative
sentence needs the WAF, which is a hosting matter. Nothing ships before every milestone is done,
so no traffic can arrive between. **The scribe annotates ADR 0019 and STATUS; until the new
milestone's file exists, the gate's text stays in this one.**

**Each remaining wave, made independent of the host.**

- **8F — who a client is.** A port answers a request's network block. Two implementations: one
  for the current development host, reading the header that host overwrites [ven §2]; and **none**,
  the default wherever no platform is known, under which every request falls in one shared bucket.
  The delivery milestone adds its own. ~~**No country and no challenge in M8** if Q28 is answered
  as recommended~~ **Q28 is answered: for the mint there is one bucket, the address, at 20 a
  calendar day, for everyone** (*The limit on new designs, as the owner ruled it*). No country, no
  per-browser bucket, no hourly figure, no challenge. The global brake is counted and logged,
  never enforced, since ADR 0019 forbids it to deny and nothing in M8 can challenge. Under *none*,
  the whole deployment shares one 20 a day: correct for a host nobody has named yet, and an
  interim.
  *Provable in M8:* the reduction of an address to any prefix, with /32 and /24 for IPv4 and /64
  for IPv6 as named cases; the twenty-first design in a day refused and the first of the next day
  allowed, on a fake clock at both edges of the Chișinău day; ~~independence of the buckets; the
  session bucket across rotation (D11)~~ (the mint has one bucket now); `429` and `Retry-After`,
  the latter the seconds to the day's end; fail closed; that
  under *none* no header moves a request to another bucket; the e2e policy. *Not provable in M8:*
  that the development host's header cannot be forged, which rests on that host's documentation and
  one request on a deployment; and anything about the launch host.
- **8G.** Unchanged in substance. The prune is a route with a secret; the development host's cron
  calls it, and whichever scheduler the launch host has will call the same route.
- **8J — the port, the configuration reader, the message, a recording fake. No provider adapter.**
  A generic SMTP adapter was weighed, since it would serve the host's own e-mail and a relay like
  SendGrid alike [inf, unverified]. It is not taken: it adds a dependency at the security tier and
  cannot be shown working without a mailbox nobody has yet, and the choice it prepares for is not
  made. Q29 decides whether a marked test deployment may stand in.
- **8K — without the bot check.** No bot port is built for an implementation that does not exist
  (ADR 0118). Criterion 12 and D12 go to the delivery milestone. Honeypot, timing, limits,
  idempotency, the revision check and the fit refusal stay.
- **8L.** Q24 and Q26 are settled: Moldovan or `+` international numbers; no response-time hint.
- **8M.** Not affected by the host. The WhatsApp action is the customer's own share link (Q5).
  The direct-call action needs the shop's number, which is still owed: until it is given the
  action is not drawn, never drawn with a stand-in.
- **8T.** The phone gate, the desktop line and the phase gate (`pnpm check`, `pnpm ci:local`, a
  green runner). **Not** the launch gate.

**Named interims M8 ends with** (`WORKFLOW.md`, *Nothing ships mid-milestone*). Each is closed by
the delivery milestone unless another owner is named. None is "done".

1. **No real e-mail leaves the system.** Port and message only.
2. **The limiter knows a client's address only on the development host.** Elsewhere, one shared
   bucket. No country. No challenge. The global brake counts and does not act. **So abuse spread
   over many addresses is not bounded by the application**; one address is, at 20 designs a day.
3. **No bot check.** The form has the honeypot and the timing check.
4. **No firewall rule exists, and SEC-001's gate is open.** Its application half is built.
5. **A runtime query error still passes through untouched** (Q27 (b)). 8B's B10 and the log line
   are the protection meanwhile.
6. **Consent and privacy text, the not-included list and 5A's steps are slots**, not the owner's
   text; the shop's number is absent; the Russian is unsigned.
7. **No profile.** M8B's.
8. **Nightly jobs are scheduled by the development host.**

**The delivery milestone: a stub for the scribe. No file is created here.** Proposed name:
`docs/milestones/M9-delivery-preparation.md`, *M9 — Delivery preparation: hosting, providers and
the launch gate*. What it inherits, with the question that travels with each:

| Inherits | With |
| --- | --- |
| The launch host; a reverse proxy, TLS, a scheduler | Q21; ADR 0019 d2, d9, d10 re-read for that host |
| The database's home; the driver if it changes; backups | Q22; Q13 (ii); ADR 0007, 0012, 0054 |
| Flood protection: a bot shield or captcha, the firewall rules, the client address and country source | Q16, Q17, Q23's first half; whether Q28's one limit gains a second tier; ADR 0019 d4; ADR 0114 d7 |
| The mail provider and its adapter; DNS; the inbox, the shop's number, the sending domain | Q25; Q29's mark must be absent in production |
| Every runtime query error rebuilt | Q27 (b); QA20; backlog 84 |
| The launch gate, with SEC-001's platform half | Q19; ADR 0019's 2026-08-31 correction |
| The pre-launch checks of 8S: the first stored schema, live rows, migrations and grants applied, the largest row, the Russian re-signed, the owner's text in every slot | Q20, Q7, Q9; ADR 0038, 0095, 0096; backlog 92 |
| What personal data is held, by whom and where; the owner's question about GDPR | The owner's and their lawyer's |
| The unmeasured: a rejected login (F3), the host's own logger (F4), a session close that never returns (F5), Neon's documented strings (F6), what a remote reader makes of a Latin-1 byte or a tab (QA21) | The coordinator files them |

*Where it sits relative to M8B: the owner has not said.* *Recommended: last, after M8B.* Its gate
and its data list must cover profiles too, and the shield must stand in front of sign-up and login.
One dependency runs the other way and needs the owner's eye: **M8B sends e-mail to customers**
(verification, reset), where *"not to go to spam"* matters as it does not for mail to the admin. If
M8B comes first it builds on the port and the fake, as M8 does, and the provider is wired once for
both in M9.

**The wave table, restated.**

| Wave | State after the ruling | Waits for |
| --- | --- | --- |
| 8A | Stays. Measurements, reads and answers are in | Its review; nothing else |
| 8B | **Done** (`4b8f4a4`, ADR 0146) [relayed] | — |
| 8C | Stays. ~~In adversarial QA~~ **QA green (`5c1ae3e`); adjudicated 2026-10-07: a fix round of four items (C1–C3)** | The fix round, a QA check of it, then logic and clean-code review. Q30 is settled as C3 |
| 8D | Stays | 8C closed. **Dispatchable then** |
| 8E | Stays | **Nothing. Dispatchable** |
| 8I | Stays | 8E's migration number. **Dispatchable** |
| 8H | Stays; Q24 settled | **Nothing. Dispatchable** |
| 8J | **Changed:** no provider adapter | Nothing for the port, the message and the fake; **Q29** for the stand-in |
| 8F | **Changed:** identity through a port; one bucket, 20 a day per address (Q28 answered) | The three red `CI=1` specs triaged; 8E. **Q32** sets one number and does not block the build |
| 8G | Changed lightly | 8F |
| 8K | **Changed:** no bot check | 8F, 8H, 8I, 8J |
| 8L | Stays; Q26 settled | 8H, 8K |
| 8M | Stays | 8L; the shop's number, or the action is not drawn |
| 8Q | Stays | 8L |
| 8T | **Changed:** the phase gate without the launch gate | Everything above |
| ~~8R~~ | **Leaves for M9** | — |
| ~~8S~~ | **Leaves for M9** | — |

**M8 is fifteen waves and ends at 8T. Order now:** 8C (in QA) → 8D → 8E → 8I → 8H → 8J → 8F → 8G →
8K → 8L → 8M → 8Q → 8T. **Dispatchable today:** 8E, 8I and 8H, and 8D once 8C closes; 8J except its
stand-in. One writing agent per tree (R2).

**Records this touches, for the scribe.** ADR 0019: **a dated supersession for the mint** (d5's
row, d4 and d3's session bucket as they apply to it; the sentences are quoted in *The limit on new
designs, as the owner ruled it*), and beside it what the owner did not rule (Q32, the day, the
other rows),
the 2026-08-31 correction (the gate's home), d2, d9 and d10 (the host), the *"Moldova only"* note.
ADR 0114 d7 and B5 (limiter and WAF scope). ADR 0115 and M8B (order against M9; customer mail).
ADR 0095 (the Russian backstop moves with the gate). ADR 0038 and ADR 0111 d8 (the first stored
schema is M9's, not M8's). ADR 0041 (8Q stays in M8). STATUS: the SEC-001 line, the ADR 0019
table, the M8 row. `milestones/README.md`: a row for M9, and M8's scope. This file's *Launch gate*,
*Launch waves*, *Proposed variables* and *ADRs*, each of which now carries a dated pointer here.

### The wave table as it stood before the ruling

The last column was *Blocked by* and named Q1–Q20. It was restated on 2026-10-07 after the owner's
answers; the questions each wave first waited on are in *The questions as put*. **Superseded the
same day by *M8 restated*, above, where the two disagree.**

| Wave | Covers | Packages | Tier | Waits for, as of 2026-10-07 |
| --- | --- | --- | --- | --- |
| 8A | Measurements, vendor reads, the questions | none (docs, scratch) | Light | S1, S2 and S3 are in (*8A figures*, *The owner's answers*). Not closed: Q21–Q26 are open, and its review has not been run |
| 8B | A driver error never prints the connection string | persistence, web | Full + security | ~~Three fix rounds done; QA green at `8cd85da`; review round 1 found one blocker (R1.1), fixed in round A (`f1a1d00`), targeted QA green. Round B (B11 for QA19, plus the mechanical batch), a QA check of B11, review round 2. See its adjudications~~ **DONE 2026-10-07, commits `d176fb6` … `0eb94b6`, not pushed.** Review round 2: all three reviewers approve. See *8B as built* and ADR 0146 |
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
- **Restated 2026-10-07, later, for the owner's 20-a-day ruling.** Part C's rows-per-day figures
  were computed from ADR 0019's old mint row and no longer describe the limit. For one address:
  20 rows a day, 10.0 MiB at the largest design. For many addresses the application sets no bound
  in M8. The measured size, 523,972 bytes, is unchanged.
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
| S2 | **Restated 2026-10-07 from 8A S1 part D, and again from its follow-up.** The two migration tools open through it: `migrate.ts:57`'s `new Client(connectionUrl)`, which stands **outside** the connect `try`, and `migrate-status.ts:88`'s `neon(…)`. ~~An error attached as `cause` (`migrate.ts:80`, `:184`; `migrate-status.ts:80`, in `readDeployedSchema`) is kept only if it passes criterion 2 itself.~~ **Superseded 2026-10-07 by B3 in the adjudication below: a kept cause is built, not filtered.** **First step, before any fix:** find why `applyMigrations` does not settle when it cannot connect (criterion 6) | `migrate.ts`, `migrate-status.ts`, `migration-errors.ts` | 8A figures, *D in full* and the follow-up; `read-database-url.ts`'s note on `MigrationExecutionError`; ADR 0096; ADR 0008, *Incident during setup*; ADR 0142; `connectOrWrapError`'s own comment in `migrate.ts`, which says the replacement *"keeps the driver error as `cause`"* on purpose — **the implementer checks the change against that intent first and reports if they disagree** (`WORKFLOW.md`, *Dispatch the intent*) |
| S3 | **Added 2026-10-07.** The two test helpers and the test-URL resolver open through it. They hold the test database's owner credential and run on the CI runner, so they are in the census | `delete-designs-for-tests.ts`, `test-database-url.ts` | 8A figures, *D in full*; ADR 0006; `environments-and-resources.md`, *Test-database isolation* |

**Why S2 changed.** 8A S1 showed that this project's own log line already prints *"<redacted
url>"*, so `design-failure-log.ts` needs nothing, and that the lazy web wrapper only constructs the
repositories S1 fixes. What prints the password at a route is the platform's error logger, given the
error the route rethrows. **The fix is in what is thrown.**

*Criteria.* ~~(1) With each connection variable set, in turn, to each malformed value in a table (a
bad percent-escape, a missing host, a non-URL string, an empty password)…~~ **Restated 2026-10-07:**

1. ~~**The table.**~~ **The floor (B1, 2026-10-07: these seven are the least a test holds, not
   the invariant, which is over any string).** Each connection variable (`DATABASE_URL`, `MIGRATION_DATABASE_URL`,
   `TEST_DATABASE_URL`) is set in turn to each of seven values carrying a recognisable fake
   password, user and host: a bad percent-escape, a missing host, a non-URL string, **a bad port**,
   an empty password, a wrong scheme, and a well-formed unreachable address. The first four leak
   today and must stop; the last three are clean today at the sites that return, and **must stay
   clean**.
2. **Where a marker may not be**, for every site and ~~every value~~ **any string (B1), and with
   B2 nothing of the value at all**: the error's `message`; its
   `stack`; **every own property, `input` included** (Node's `ERR_INVALID_URL` keeps the whole
   string there); every error on its `cause` chain, by the same four checks; and its `util.inspect`
   output at unlimited depth. A test that checks `message` alone passes today on every leak the
   table above records under `TypeError.input` or `cause`.
3. **The sites.** A census finds them, and fails when one appears outside the one opener.
   ~~Seven today.~~ **Corrected 2026-10-07 from 8A S1's follow-up, re-read in source at `a7b0363`
   [src].** ~~The census matches three shapes, not one, because `neon(` alone misses the site the
   plan had missed:~~ **Superseded 2026-10-07 by B5: the census is by import, at any depth. QA
   showed a census by callee name misses `new Pool(`, a subdirectory and an aliased import.** The
   sites as they stood before the wave:
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
5. ~~The error names the variable that is wrong~~ **(B4, 2026-10-07: only when the value was read
   from that variable; a value a caller handed in is refused as handed in)**, and says nothing
   else about its value: not its length, not which character was bad.
6. **`migrate` answers at once for a shape the opener refuses.** With a bad percent-escape or a
   wrong scheme it exits non-zero ~~with the domain error~~ **with a printable refusal, whichever
   check answers first (B6, 2026-10-07)**, instead of not returning. ~~*Not in scope:*
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
7. ~~A well-formed URL behaves exactly as before~~ **(B7, 2026-10-07: a URL of the one accepted
   shape behaves exactly as before; the forms only `new Client` took are refused on purpose)**; the
   persistence live suites are unchanged.
8. *Must not:* a fallback from one variable to another appears (ADR 0008). *Must not:* the opener
   keeps the refused string, or the error it caught, anywhere on the error it throws.

*QA reading:* the criteria; `tests/read-database-url.test.ts`; `scripts/gates/boundary.sh`. QA
sabotages both ways (R6): remove the wrap and the suite goes red; move a call site and it stays
green. *Logic and clean-code readers:* the slice files. *Security reading:* ADR 0008; ADR 0019 d11;
every `catch` on the path from a route to the driver.

#### 8B — adjudication of adversarial QA, 2026-10-07

**State.** Implemented in three slices, `d176fb6`, `9fb0994`, `e070613` [relayed]. QA is red. The
architect ran QA's four files at `e070613`: **7 failed, 46 passed** [ran], the seven QA reported.
The tree is frozen; QA's tests stay failing until the fix makes them pass, and none is weakened.

**What the three defects have in common.** Each comes from deciding what is safe to show by
*inspecting* something: a URL that parsed is assumed to have a harmless path (QA1, QA2); a driver
error is searched for the secret (QA3). Inspection needs a parser that agrees with the driver's,
and there are now three in this package. **The rules below stop inspecting: what leaves this
package is built from constants, never copied out of a value and never passed through.**

| Item | Class | Ruling |
| --- | --- | --- |
| QA1 `test-database-url.ts` echoes an unshape-checked path | **Implementation defect**, in code that predates the wave and sits in S3's file; **and a contract gap** in criterion 1, which gave a table of seven values where the invariant is a property. The gap is the architect's | B1, B2 |
| QA2 `databaseNameOf` returns a credential as a name, and both CLIs print it | The same two | B1, B2 |
| QA3 the cause filter parses the authority differently from the driver | **Implementation defect in a mechanism the plan asked for:** S2 said a cause is *"kept only if it passes criterion 2 itself"*, which is a filter. **Contract gap**, the architect's | B3 |
| Gap 1, a getter on a kept cause | Contract gap. **Dissolved by B3:** no driver object is kept | B3 |
| Gap 2, a derived host name or a resolved address | Contract gap. Dissolved by B3 for the migration tools. At the runtime sites it is **an owner question** | B3; Q27 |
| Gap 3, the guard's messages echo host, port and name by design | Contract gap, **in scope** | B2 |
| Gap 4, an injected URL is labelled `DATABASE_URL` | Contract gap, **in scope, second round** | B4 |
| Gap 5, the opener refuses strings `new Client` took | Contract gap in criterion 7's wording. **Deliberate; no code change**, pinned by a test | B7 |
| Gap 6, a wrong scheme exits with the target-mismatch refusal | Contract gap in criterion 6's wording. **No code change** | B6 |
| The census misses `new Pool(`, a subdirectory, an aliased import, a re-export, a dynamic import | **Test-fidelity problem, fixed in this wave** | B5 |
| `spawnPersistenceCli` reports a 30 s kill as exit 1 | **Test-fidelity problem, fixed in this wave:** it makes criterion 6's *"does not hang"* a test that cannot fail | B6 |
| `scripts/gates/boundary.sh` misses a multi-line and a dynamic driver import outside the package | Test-fidelity problem in a gate that predates the wave and is not in its files. **Named follow-up, not 8B** | F1 |

**The restated rules.** Each replaces the struck text it names above.

- **B1 — the invariant is over any string** (replaces criterion 1's closed table; QA1, QA2).
  The seven values are a floor. Criterion 2 holds for every string a variable can hold, tested as
  a property over strings assembled with a marker in every position the grammar has and outside it.
  QA's `qa-8b-opener-sweep` and `support/qa-8b-connection-values.ts` are the model.
- **B2 — nothing is copied out of a connection value** (QA1, QA2, gap 3). No message, printed
  line, log line or error property this package produces contains text taken from a connection
  value. What it may contain: the variable's name; the operator's own declared environment; and a
  database name **only when it equals a name this repository lists** (the environment map and the
  test allowlist), printed from that list. Never a host, a port, a user, a password, a path, a
  query, or a name that is not listed.
  - *Why not "shape-check, then echo".* `postgres://U:p@ss:12/SECRETPART` passes the opener's own
    check; its host parses as `ss` and its name as `SECRETPART` [ran, the opener's logic in Node].
    A mistyped value defines its own parts.
  - *Observable, as a property:* **two values that give the same comparisons give byte-identical
    output.** The same shape verdict and the same listed name (or both unlisted) mean the same
    error, property for property, and the same printed lines.
  - *The guard's messages* (gap 3) may say which variable, that the name is not on the allowlist or
    is the application database's, and print the allowlist. They no longer print `host:port` or an
    unlisted name. This changes the wording of ADR 0006's refusals and of the migration target's
    *"reaches …"* line for an unlisted database, and nothing else about either.
  - **The guard's verdicts do not change.** Comparison still reads the name; only display stops.
    QA's `guard-compare` harness is re-run over its 18,980 cases: 0 verdict differences, 0 more
    permissive.
- **B3 — a kept cause is built, not filtered** (replaces S2's cause sentence; QA3, gaps 1, 2).
  Nothing a driver or Node threw rides on an error this package throws. Where a cause is kept it is
  a new plain value with two fields: the error's type name, clamped as `backup-designs.ts` clamps
  one, and its `code` when that has the shape of a SQLSTATE or of a Node error code. Adding a field
  is a line in the wave's ADR.
  - *Why.* A filter must parse as the driver does (QA3's first test), cannot see a prototype getter
    (gap 1), cannot know a name derived from the host or an address it resolved to (gap 2), and
    cannot find a fragment (QA3's second test, which no whole-part filter can pass).
  - *The intent it keeps.* `MigrationExecutionError` carries a cause *"so the underlying SQLSTATE
    is still reachable"* (`migration-errors.ts`). That is the field kept. `connectOrWrapError`'s
    *"keeps the driver error as `cause`"* is superseded and the ADR says so.
  - It also covers, by construction, two cases nobody has measured in the migration tools: a
    server that rejects the login, and a statement that fails mid-migration.
- **B4 — a refusal names a variable only if the value was read from it** (replaces criterion 5;
  gap 4). A value handed in by a caller is refused as a value handed in. *Must not:* a refusal
  names a variable the value did not come from. Second round.
- **B5 — the census is by import** (replaces criterion 3's three call shapes). Under `src/`, at
  any depth, only the opener has a value import of the driver package: static, re-exported, or
  dynamic with a literal specifier. A type-only import is not one. `new URL(` stays a census by
  name, at any depth. *Recorded limits, not fixed:* a dynamic import whose specifier is computed;
  an alias of the global `URL`; `Reflect.construct`.
- **B6 — the CLIs** (replaces criterion 6's *"with the domain error"*; gap 6). For a value the
  opener refuses, each CLI exits non-zero within a stated bound and prints one refusal that names
  `MIGRATION_DATABASE_URL` and satisfies B2. Which refusal is not prescribed: the environment check
  is ruled to run before anything is opened (`migration-environment-safety-check.md`), so it may
  answer first. **A process the test had to kill is a failed test, never an exit code.**
- **B7 — one accepted shape** (replaces criterion 7's *"exactly as before"*; gap 5). Both entry
  points accept a `postgres:` or `postgresql:` URL with a user, a host and a database, and nothing
  else. That `new Client` also took a user-less URL, `socket:`, `pg://` and keyword strings, and
  the opener does not, is deliberate: one shape is what B2's comparisons rest on. No environment
  of this project uses those forms [inf; falsified by a migration URL with no user]. A test pins
  the set. The live suites still pass unchanged.

**Follow-ups, each with an owner.**

- **F1 — `boundary.sh`.** The architecture gate matches a driver import on one line only, so a
  Prettier-wrapped or a dynamic import outside `packages/persistence` passes it. Backlog entry;
  the coordinator schedules it under `ci-and-local-gates.md` before 8E adds persistence code.
- **F2 — Q27**, in *Follow-up questions*: the owner's.
- **F3 — a login the server rejects, at a runtime site.** Unmeasured, and the one path where a
  well-formed value could still surface something. One attempt with a fake password against the
  test database's host; it writes nothing, but it touches a provisioned database, so it needs the
  coordinator's word. QA's, in the second round. Without it the close-out names the path unproven.
- **F4 — the hosting platform's own logger.** What is measured is `next start`'s. Not measurable
  without setting a bad value on a deployment, which is the owner's action. Recorded as a limit.

**The punch list. Two rounds; the first is the three defects.**

*Round 1* — four items, six production files. That is one over the usual five because items 1
and 2 both pass through `migrate.ts` and `migrate-status.ts`; the reviewer reads them as one
subject, what this package says about a connection.

1. **B1, B2** (QA1, QA2, gap 3). `open-database.ts`, `test-database-url.ts`,
   `migration-target.ts`, and the message lines in `migrate.ts` and `migrate-status.ts`.
2. **B3** (QA3, gaps 1 and 2). `migration-errors.ts`, `migrate.ts`, `migrate-status.ts`. The tests
   that assert a cause *is* the driver's error change with it:
   `migrate.driver-failure.test.ts`, `migrate-status.driver-failure.test.ts`,
   `migration-errors.test.ts`.
3. **B5.** `tests/connection-opening-census.test.ts`. Sabotage: an aliased `Pool` import in a new
   subdirectory turns it red.
4. **B6, B7.** `tests/support/spawn-persistence-cli.ts` and the CLI tests; one test pinning the
   accepted set.

*Round 2*, after QA re-runs its four files and `guard-compare` green on round 1:

5. ~~**B4** (gap 4). `open-database.ts` and the three runtime sites.~~ **Superseded the same day by
   the five-item list in the next adjudication, where B4 is item 2.**

*Reading, implementer:* this adjudication; QA's four `qa-8b-*.adversarial.test.ts` files and
`support/qa-8b-connection-values.ts`; in `m8-8b-qa/`, `guard-compare.mts` and `.out`, `probe2.out`,
`probe3.out`, `cli-run.out`; ADR 0006; `milestones/migration-environment-safety-check.md` (the
refusal's design); ADR 0096 d4; ADR 0142 (the no-slash bypass); ADR 0008;
`migration-target.ts:170-235`; `apps/web/src/lib/server/backup-designs.ts:114-140`.
*Reading, QA's re-run:* the same, and B2's property. *Security reading:* B2, B3, Q27.

**Where the architect reads QA differently.** (1) QA3's second test asks the filter to catch a
fragment of a password. No filter that compares whole parts can; as an assertion on that function
it over-asks, and it is right about the mechanism. Under B3 both QA3 tests are re-aimed at the
thrown error. (2) QA filed QA1 under criterion 2, which the seven-value table bounded by its
letter. QA was right to treat it as a property; the letter was the plan's fault. Nothing else in
QA's report was found wrong.

#### 8B — adjudication of QA's re-run, 2026-10-07, later

**State.** Round 1 and QA's re-aimed tests are `a20432e` [relayed]. The architect ran QA's six
files there: **1 failed, 160 passed** [ran], the one QA reported. QA1–QA3 are fixed; B2 holds as a
property; the guard is unchanged over 18,980 cases [relayed]. The tree is clean and frozen.

| Item | Class | Ruling |
| --- | --- | --- |
| QA4 a rejected `end()` after a clean run leaves `applyMigrations` as the driver's own error | **Implementation defect** against B3 | B8, round 2 |
| QA5 the clamp keeps any `name` or `code` of the right shape | Contract gap in B3's wording | **Recorded limit** |
| QA6 the opener takes a URL with no database, and two forms with no `//` | Contract gap: B7's letter and *"opener ≡ driver"* cannot both hold | **B7 stands; the equivalence changes.** Round 2 |
| QA7 a second value import of the driver stands in the census as *owed* | Contract gap in B5: an owed list that never empties is a standing exception | In scope, round 2 |
| QA8 a refusal says the name has undecoded characters | Not a breach of B2 as written; its wording was loose | **Recorded limit**, B2 clarified |
| QA9 a test still passes on the hang | Test-fidelity problem | Fixed in round 2 |
| QA10 a case-insensitive allowlist match and a name printed in the value's case | Test-fidelity problem | **Closed by QA's own tests**; nothing owed |
| QA11 the census lost `new globalThis.URL(` and `new nodeUrl.URL(`; it does not read `.mts`; `createRequire` | Test-fidelity problem. The first two are a regression from round 0 | First three fixed in round 2; `createRequire` a recorded limit |

**Rules.**

- **B8 — ~~closing the session never changes the run's outcome~~ a close that fails never changes
  the run's outcome** (restated by the third adjudication below: a close that never returns is
  outside it) (QA4; B3 applied to `end()`). If
  every migration was applied and recorded, `applyMigrations` returns its summary whether or not
  the session then closed. If the run failed, it throws the run's own error. A rejection from
  `end()` is dropped in both cases and never replaces either.
  - *Why this option.* The file already rules the same case one step earlier: `rollbackQuietly`,
    *"The failure that brought us here is the one worth reporting. A rollback that itself fails …
    must not replace it with a less informative error."* A close is the next such step.
  - *Why not fail with a reduced cause.* Each migration commits on its own, so after a clean run
    the schema is migrated and the ledger says so. Reporting failure would tell a deploy gate that
    a migration which happened did not.
  - *Why not report it beside the success.* It would add a field to the run's summary and a second
    kind of line to the one the CLI prints (ADR 0013), for a fact the operator can do nothing with.
  - This is a behaviour of an operator tool with a precedent in the same file, so it is ruled
    here. The owner may overrule it. *Still unmeasured:* a real `end()` that rejects or never
    settles; only a mocked one has been seen.
- **B7 stands, and the opener is stricter than the driver** (QA6). Accepted: a `postgres://` or
  `postgresql://` URL, **with the two slashes**, a user, a host and **a database name that is not
  empty**. The refusal's sentence is already exactly that and does not change.
  - *What changes:* ~~the opener refuses exactly the strings the driver refuses~~ → **every string
    the opener accepts, the driver accepts; the opener also refuses three forms the driver takes:**
    no database (`postgresql://u@h`), one slash (`postgres:/u:p@h/db`), and no slash
    (`postgres:u:p@h/db`). The first half is what keeps the driver's own echoing error unreachable.
  - *Why the no-slash forms go.* [ADR 0142](../decisions/0142-persistence-concurrency-migration-safety-and-api-reasons-recovered-from-code-comments.md)
    already records them: the driver re-parses under `http:`, a scheme *"that tolerates the missing
    slash, and resolves a real host and database there"*, while this package's own reading sees an
    empty host and the credential in the path: *"a **bypass**"*. That record closed it for the
    migration target: *"Refusing every URL shaped like this before any pathname is read closes
    both at once"*. The opener now does the same for every
    site, so no running configuration exists in which the two readings disagree that way.
  - QA's pin *"refuses exactly the strings neon() itself refuses"* goes red by this ruling. **QA
    re-aims it** to the implication plus the three named forms; the implementer does not edit it.
- **B5, restated for QA7.** The owed list is empty at the end of the wave. The driver's error class
  is needed outside the opener only to recognise one; the opener is where that question is
  answered, and the other file asks it there.
- **B2, clarified for QA8.** B2 forbids *text taken from the value*. A refusal may differ by
  **which refusal it is**, and the classes are few and closed: the variable is unset; the value is
  not the accepted shape; its path has characters that must not appear raw; it names no database;
  it names a listed database that is not the declared one; it names one that is not listed. That
  the third class exists tells a reader the path held a `%` or a `\`. That is the class's
  definition and it is what the operator must fix. Criterion 5's *"not which character was bad"*
  binds the opener's one refusal, which has no such class.
- **B3, recorded limit for QA5.** `name` and `code` are kept by shape, not from a list, so a value
  of the right shape passes: a `code` of `FAKEPASSWORD_QA8B` would. No driver or runtime here sets
  either field from its input [inf; falsified by a driver version that does, which the
  driver-rejection tests on real errors would show]. Closed lists were weighed and not taken: they
  would drop real SQLSTATEs and need editing at every driver bump.

**Recorded limits of the census** (B5), now four: a dynamic import whose specifier is computed; an
alias of the global `URL`; `Reflect.construct`; a `require` made by `createRequire`.

**Round 2's punch list** — ~~5. **B4** (gap 4). `open-database.ts` and the three runtime sites.~~
restated. Five items, six production files; one over, because items 2 to 4 all pass through
`open-database.ts` and item 2's three other files take one mechanical change each.

1. **B8** (QA4). `migrate.ts`. QA's failing test is the pin; the failed-run half needs its own:
   a run that fails and then cannot close throws the run's error.
2. **B4** (gap 4). `open-database.ts`, `neon-configuration-repository.ts`,
   `share-link-repository.ts`, `design-row-source.ts`.
3. **B7** (QA6). `open-database.ts`. A test pins the three refused forms by name.
4. **B5** (QA7). `retry-on-transient-failure.ts`, `open-database.ts`; the census's owed list
   becomes empty.
5. **Tests only** (QA9, QA11). `tests/migration-target.adversarial.test.ts`: the *"unsettled
   top-level await"* alternative is removed, since the hang it tolerated is fixed.
   `tests/connection-opening-census.test.ts`: `new x.URL(` is a site again, with QA's two forms as
   cases, and every TypeScript source extension under `src/` is read.

*Reading, implementer:* this adjudication and the one above it; `migrate.ts:60-110` and
`rollbackQuietly`; QA's `qa-8b-thrown-cause.adversarial.test.ts` and
`qa-8b-opener-sweep.adversarial.test.ts`; ADR 0142, the entry on `databaseNameOf`; ADR 0013; ADR
0145 (what `retry-on-transient-failure.ts` recognises and why); `open-database.ts` whole.
*Reading, QA's next pass:* the same; B2's property re-run; `guard-compare` re-run. One measurement
added: over the sweep's accepted strings, count those where the database name this package
compares differs from the one the driver would use. **Any such string whose compared name is a
listed one is a finding.**

**After round 2.** One QA pass, and if it is green the wave goes to review: logic, clean-code and
security, as its tier says. Another adjudication is expected only if that measurement finds a
disagreement, or the re-aimed sweep turns up a new class. The close-out names three things as
unproven and not as clean: F3 (not approved), a real `end()` failure, and the hosting platform's
own logger.

#### 8B — adjudication of QA's third pass, 2026-10-07, later still

**State.** Round 2 is `1df6d7f`, QA's tests `a83d4fd` [relayed]. The architect ran QA's six files
there: **8 failed, 176 passed** [ran], on the four findings QA reported. B2's property, criterion
4 and the retry predicate hold [relayed]. The tree is clean and frozen.

| Item | Class | Ruling |
| --- | --- | --- |
| QA12 an accepted string whose compared database name is not the one either driver uses | **Implementation defect** against B7, in a reading that predates the wave. Found by the measurement the last adjudication added | B9, round 3 |
| QA13 a session close that never settles | Reached with a mocked driver only; predates the wave; not a leak. **Recorded limit.** B8's wording promised more than it should | B8 restated; F5 |
| QA14 after a failed connect, a close that throws or rejects | **Implementation defect** against B3, mocked only, two lines to remove | Round 3 |
| QA15 the migration entry points name `MIGRATION_DATABASE_URL` for a value handed in | **Implementation defect** against B4's *must not*. **And a gap in round 2's punch list**, which named four files and not these two; the architect's | B4 extended, round 3 |
| The driver's error matched by `name` and not by class | Test-fidelity problem, **closed by QA's test** | Nothing owed |
| A `.js` file under `src/` is not read by the census | Test-fidelity problem | Fixed in round 3 |
| `assertSafeTestDatabaseUrl`'s label; the optional `readFrom` | As QA classed them: acceptable | Nothing owed |

**Rules.**

- **B9 — a database name is read only where every reading of it agrees** (QA12). This package
  compares a name in three places: the opener's shape check, the migration target, and the
  isolation guard's two checks. All three ask one function. It answers a name only when the
  string as written, the string as the HTTP driver re-reads it, and **the session driver's own
  reading, asked of the driver and not copied from it**, give the same name. Otherwise it answers
  *no name*, and every caller treats that as a refusal.
  - *Why this and not a character.* Refusing a raw backslash would close the 346 strings QA found
    and say nothing about the next character. Refusing *"what the URL parser normalises"* needs
    a list of what that is. Agreement needs neither: a string on which two readers differ is
    refused whatever made them differ. It is the rule ADR 0142 reached for one shape, stated for
    all of them.
  - *What the sweep must then show.* Over every accepted string, not only those naming a listed
    database: **0** whose compared name differs from the session driver's, and **0** from the HTTP
    re-reading. QA's 346 are each refused by the opener and by the guard.
  - **The isolation guard's verdicts change, and this is the change.** The live suites open the
    test URL with the driver directly, not through the opener [src: the live test files and
    `tests/support/test-schema-lock.ts` import the driver themselves], so the guard is the only thing between such a
    string and a `DELETE`. Two kinds of string move, both **from allowed to refused**: a test URL
    whose name the guard read as allowlisted while a driver reads another; and any test URL when
    the application URL's name cannot be read in agreement, since that check must fail closed.
    **None moves from refused to allowed.** QA's `guard-compare` must show exactly that: every
    difference is allowed→refused, every one has a disagreeing reading, 0 more permissive. The
    migration target changes the same way through the same function.
  - *Not harmful as found, and why that is not the reason to leave it* [inf]. In all 346 the
    backslash stands in the userinfo, so the driver's name runs through the last `@` and cannot
    equal a listed name; QA found none that does. That argument is about the backslash only.
  - *Recorded limit.* For a query sent over HTTP, Neon's own endpoint reads the raw string a
    fourth time. Nothing here can ask it. Recorded with its trigger (ADR 0118): a string this
    package accepts that Neon routes to a database of another name.
- **B8, restated** (QA13). ~~Closing the session never changes the run's outcome.~~ **A close that
  fails never changes the run's outcome. A close that never returns is not bounded by this
  wave.**
  - *Why no timeout here.* A bound would let `applyMigrations` return while `end()` is still
    pending and its socket still open. The CLI sets `process.exitCode` and never calls
    `process.exit` [src, the CLI block that ends `migrate.ts`], so it would print its line and
    still not exit.
    Making it exit is a decision about the CLI's shutdown, with its own tests; it is not a
    two-line bound.
  - *Why it may wait.* It leaks nothing. The same `await` stood in the `finally` before this wave.
    It has been seen only with a mocked driver; whether a connection dropped mid-run really leaves
    `end()` pending is unmeasured.
  - QA's two tests for it stay as declared deferrals under F5, in the form that goes red when the
    hang is fixed (`engineering-conventions.md`, *A deferred test has two shapes*).
- **B3, for the close after a failed connect** (QA14). Whatever that `end()` does — throw before
  returning, reject, or never settle — the connect failure this package built is what is thrown,
  and no rejection is left unhandled. An unhandled rejection is the one case where Node itself
  prints an error object.
- **B4, extended** (QA15). The three migration entry points follow it too. A value handed to
  `applyMigrations`, `runMigrations` or `readDeployedSchema` is labelled with a variable only when
  the caller that read it says which. The two CLIs do say, so the operator is still told
  `MIGRATION_DATABASE_URL` is wrong: the owner's criterion of 2026-09-06, *"The error still names
  which environment variable is wrong"*. A live suite that hands in the test URL is no longer told
  the migration variable is at fault. The implementer's
  `migration-connection-errors.test.ts`, which expects the label on a bare hand-in, is re-aimed by
  the implementer to this rule: with the label when the caller names the variable, without it
  when not.

**F5 — a session close that never returns.** Follow-up, the coordinator's to schedule before 8S,
with F1. First a measurement on the test database, which needs approval because it ends a
backend there: does a connection dropped mid-run leave `end()` pending with the installed driver.
If it does, the fix is the CLI's shutdown, as its own small wave.

**Round 3's punch list** — four items, four production files.

1. **B9** (QA12). `open-database.ts`, `test-database-url.ts`. `migration-target.ts` only if the
   *no name* answer does not already reach its never-trusted refusal.
2. **B3 at the close** (QA14). `migrate.ts`.
3. **B4 extended** (QA15). `migrate.ts`, `migrate-status.ts`;
   `tests/migration-connection-errors.test.ts` re-aimed.
4. **Tests only.** `tests/connection-opening-census.test.ts` reads every script file under
   `src/`, `.js` included.

*Reading, implementer:* this adjudication; QA's `qa-8b-opener-sweep.adversarial.test.ts` (the
pinned property and its generator), `qa-8b-thrown-cause.adversarial.test.ts`,
the rule-B4 block of `qa-8b-connection-leaks.adversarial.test.ts`; ADR 0142, the entry on
`databaseNameOf`; ADR 0006 and its amendment (what the guard promises); `test-database-url.ts` whole;
`migrate.ts:60-110, 245-270`; `migrate-status.ts:70-95, 195-215`.
*Reading, QA's next pass:* the same; `guard-compare` with the expectation above; the two
deferrals re-aimed under F5.

**Convergence, and the stopping rule the architect proposes.**

- *The trend.* Pass 1 found the connection string leaving on real paths: the wave's goal. Pass 2
  found one leak, with a mocked driver. Pass 3 found none from a real driver: one guard-integrity
  class, two mocked lifecycles, one wrong label. Each finding was real. The wave is past the
  point where more passes serve the owner's ruling.
- *Necessary before review:* QA14, because it is on the goal and costs two lines; QA15, because
  it is the rule's letter and the owner's own criterion; QA12, because the rule that closes it
  is small and without it B7's one shape is not one. *Accepted as a recorded limit:* QA13.
- *The rule.* After round 3, QA makes **one** pass. A new finding is fixed inside 8B only if
  (a) text from a connection value, or anything a driver threw, leaves this package, on a path
  the installed driver can take; or (b) something an earlier pass showed holding no longer holds.
  Anything else is written down with an owner and its trigger (ADR 0118), and the wave goes to
  review in that same pass. The architect classifies; QA's freedom to look is not narrowed.
- *Whose it is.* The rule trades completeness for an end. If the coordinator thinks that trade is
  the owner's, the two things to put to them are QA13 as a limit and the rule itself.

#### 8B — adjudication of review round 1, 2026-10-07, after QA's green pass

**State.** QA's last pass was green and its tests are `8cd85da`; the coordinator re-ran the whole
persistence suite, 53 files, 1402 passed [relayed]. Three reviewers reported. The tree is clean
and frozen. The architect re-ran the blocker with fake values against `h.invalid`, at `8cd85da`
[ran]:

| Value | A request header takes it | The session client takes it | What a query throws |
| --- | --- | --- | --- |
| An interior LF, CR or NUL in the password | **no** | yes | `NeonDbError`, **the password in its message and `util.inspect`** |
| A character above U+00FF | **no** | yes | `NeonDbError` naming that character's index and value; no password |
| An interior tab; a trailing LF; a space; U+00E9; U+007F | yes | yes | *"fetch failed"*, nothing of the value |
| `?sslmode=verify-full&sslrootcert=system` | yes | **no** (its constructor throws) | *"fetch failed"*, nothing of the value |

**R1.1 (logic and security): confirmed. Implementation defect, and a contract gap in B9, the
architect's.** B9 defined acceptance by what three *readers* make of the string. The HTTP driver
also hands the string on **unread**, as a header. A value all three readers agree on can still be
one that consumer refuses, and its refusal quotes the value. It predates the wave and is the wave's
goal: arm (a) of the stopping rule.

- **B10 — an entry point refuses a string exactly when a consumer it will use refuses it.**
  Refusal is the union of the consumers' own refusals, **asked of the consumers**, plus B7 and B9.
  It is never wider.
  - *The consumers of the string, today.* For a query over HTTP: the driver's own constructor,
    and the request header the driver puts the raw string in. For a session: the session client's
    constructor. For both: the URL reader. Each is asked by doing what the driver will do with
    the string, before the driver does it, where the refusal can be caught and replaced.
  - *Which direction.* The security reviewer's, generalised: it is B9's method, extended from
    readers to consumers. **Not a character class.** The logic reviewer's class, printable ASCII,
    closes the same three characters and also refuses strings the runtime sends today (a
    Latin-1 letter, a tab, a trailing newline) [ran: the header takes each], which risks a new
    outage this wave must not cause. A stricter form was weighed too, that reading must not
    change the string at all; the URL reader rewrites a raw `;`, `=`, `^` or `|` in a password
    [ran], so it would refuse a password that works today, and was not taken for the same reason.
  - *A trailing newline is accepted*, as before the wave: the header's own rule drops it [ran].
    So is every other string a query can be completed with today.
  - **B9, amended.** ~~…and the session driver's own reading, asked of the driver…~~ The readers
    whose names must agree are those that take the string. **A reader that refuses it does not
    disagree; it cannot be the one that connects.** The HTTP entry point no longer fails because
    the session client would not build.
  - *Does this close the class or the header?* It closes the class for the consumers that exist
    at driver 1.1.0 and this Node. A consumer added by a later driver is not known to the rule;
    **the sweep below is what notices one.** The by-construction answer is Q27 (b).
- **Security R1.2, the ssl parameters: fixed by B10's amendment to B9; no owner question, and no
  reading of Neon's documentation is needed to rule.** A URL carrying `sslrootcert=`, `sslcert=`
  or `sslkey=` is accepted for HTTP again, exactly as before the wave. For a session it is
  refused, as it always failed there, since the client's constructor throws on it. The refusal
  must be true of what it refuses: it may not tell the operator to supply a user, a host and a
  database the value already has. Per B2 as clarified, this is one more closed class with its own
  sentence. *For the record only* (F6): whether Neon documents such a form for its strings, so
  that the backlog can say the migration tools cannot use it.
- **The project's own log line** (`apps/web/src/lib/server/design-failure-log.ts`). Its redaction
  stops at the first whitespace, so a value holding a newline leaves its tail in the line. **In
  this round**, since it is the wave's goal and one file. Rule: once a URL begins in a failure's
  text, nothing after it in that text is logged.

**The other findings, one line each.**

| Finding | Ruling |
| --- | --- |
| Logic R1.2: a comment says a tab makes the readers differ; it does not, and the raw string with the tab goes to Neon | Comment corrected in this round. The behaviour is the recorded fourth-reading limit, with this as its first named candidate |
| Logic R1.3: the *"characters that must not appear raw"* refusal is unreachable; a `%` in the name is told to supply *"a real host"* | Fixed in this round: the dead branch goes, and a string whose readers do not agree gets a sentence that says so. B2's third class is replaced by that one |
| Logic R1.4: two CLI lines print an unexpected error's `name` unclamped | Fixed in this round with the clamp B3 already has |
| Security R1.3: with an empty password the session client reads `PGPASSWORD`, `PGPORT`, `PGOPTIONS`, `PGSSLMODE` | Recorded limit. Predates the wave; it is the driver's environment, not a fallback between this project's variables (ADR 0008 holds) |
| QA16; QA5; QA17 (mis-stated: no file is read) | As the reviewers found: record only |
| Clean-code should-fix 1–4 | All four in this round. The titles and journal comments in QA's own files are re-worded by QA in its pass, not by the implementer |
| Clean-code nits that are deletions: the unused export, the re-export of `databaseNameOf` through the CLI module, the second `describeErrorType` | In this round |
| The nine-line comment that belongs in the ADR; not splitting `open-database.ts`; the optional `readFrom` shape | Recorded for the wave's ADR; no code |

**What QA's sweep must now do that it did not.** It tested what the opener *accepts*. It never
*used* an accepted string.

1. **Query through every accepted string**, by each entry point, with the socket replaced and the
   request still built by the real runtime, so that header and URL validation run. Whatever is
   thrown carries nothing of the value: message, stack, own properties, cause chain,
   `util.inspect`.
2. **The converse, so that the fix causes no outage.** Over the sweep, the HTTP entry point
   refuses a string **only if** B7 or B9 refuses it or one of its two consumers does. The same for
   the session entry point and its one.
3. Pins by name: an interior LF, CR and NUL refused; a character above U+00FF refused; a trailing
   newline accepted; a URL with `sslrootcert` accepted over HTTP and refused for a session, each
   with a refusal that is true of it.
4. `guard-compare` again: the guard's allowed set is still a subset of the pre-wave guard's.

**The fix rounds. Nine production files, so two rounds; the blocker is first.**

*Round A* — behaviour; three items, three production files.

1. **B10, and B9 as amended** (R1.1; security R1.2). `open-database.ts`.
2. **The log line** (security R1.1). `apps/web/src/lib/server/design-failure-log.ts`.
3. **A refusal says what is true** (logic R1.3, R1.2's comment; clean-code 1).
   `migration-target.ts`, `open-database.ts`: the two placeholders declared once; the dead branch
   removed; the stale comments at the cited lines corrected.

Then QA's targeted pass: the four duties above, and nothing else is reopened.

*Round B* — no behaviour but one clamp; two items, mechanical, seven production files each
touched lightly (six of them new to this fix).

4. **One clamped name, one helper** (logic R1.4; the nits). `migration-errors.ts`, `migrate.ts`,
   `migrate-status.ts`: the printed name clamped; one `describeErrorType`; the re-export deleted
   and its importers pointed at `open-database.ts`; `assertConnectionUrlShape` no longer exported.
5. **The clean-code batch** (should-fix 2–4). The opening expression repeated at the three runtime
   sites becomes one helper; the stale comment in `migration-target-cli.test.ts`; journal comments
   and rule ids out of the implementer's test titles (ADR 0136).

~~Round B is checked by the persistence and web suites staying green and by the clean-code
reviewer; it gets no QA pass of its own.~~ **Superseded the same day by *QA19, and round B
restated*, below: round B gains one behavioural item (B11), which gets its own QA check.**

*Reading, implementer:* this adjudication; the three reviewers' reports; B9 and its amendment;
`open-database.ts` whole; driver 1.1.0 where it builds the request header and where the session
client parses its ssl parameters (the lines the reviewers cite); `design-failure-log.ts` and its
two test files; `migration-target.ts:30-110, 205-260`; ADR 0136.
*Reading, QA:* the same; its own `qa-8b-opener-sweep` and `qa-8b-thrown-cause` files.

**After the rounds.** One review round 2 by the same three agents, each on its own findings only:
logic and security on round A, clean-code on round B. That is what the coordinator proposed and
it is enough. The stopping rule still holds for anything new.

**Q27 changes: see its note.** R1.1 put a password on the query path, so *"none of these is a
credential"* was false as written. B10 closes the known way there. F3 matters only under (a).

**F6 — Neon's documented connection strings.** For the record, not for the ruling: one read of
Neon's documentation for whether it gives `sslrootcert` or a sibling in the strings it hands out.
If it does, the backlog says the migration tools cannot use that form, which was true before this
wave. The coordinator's, with F1 and F5.

#### 8B — QA19, and round B restated, 2026-10-07, after the targeted pass

**State.** Round A is `f1a1d00`, QA's tests `adf4827`; persistence 1451 passed, 0 failed
[relayed, QA-run]. The four duties hold [relayed]: of 265 strings accepted for queries and 391
for a session, each then *used*, 0 carried any part of the value, where the same harness finds 207
against the opener before round A.

**QA19 — stopping-rule arm (a). Implementation gap against B10; in scope.** A test URL with a line
break in its password passes the isolation guard, and
`tests/support/migration-ledger-probe.ts` then calls the driver with it directly; the header error
that follows carries the password, the user and the host [relayed; QA demonstrated it, unpinned].
On the CI runner that is the test database's owner credential. S3's own reason applies unchanged:
*"They hold the test database's owner credential and run on the CI runner"*. B10 put the
consumers' check in the opener; the live suites do not go through the opener.

- **B11 — the guard allows a test URL only if this package would itself open it, by both entry
  points.** `assertSafeTestDatabaseUrl` asks the opener; it does not repeat the opener's checks.
  A string a query consumer or the session client would refuse is refused by the guard first, with
  the opener's own refusal.
  - *Why at the guard and not at each helper.* The live test files call the driver themselves in
    many places, by design, and every one of them is classified against a gate by the live-suite
    census (`tests/live-suite-census.test.ts`). The guard is that gate. One place covers the three
    support helpers and every live file, including ones not yet written. Sending each helper
    through the opener, or widening B5's census to `tests/`, would cover only the files someone
    remembered.
  - *Why both entry points.* One test URL is used for both in a single run: the suites migrate it
    through a session and query it over HTTP. A URL only one of them takes cannot run the suite.
  - **The guard's verdicts change again, allowed→refused only.** What moves: a test URL the guard
    allowed and an entry point refuses — one with no user, one a request header will not take,
    one the session client will not build from. The live suite could not run on any of them. **None
    moves from refused to allowed.** The guard's two name checks are untouched.
  - *What it does not cover* [recorded]. A test that builds its own connection string, or reads
    the variable without the guard, is outside it; the live-suite census is a tripwire for that,
    by its own words *"not a sandbox against an adversarial author"*.

**QA20 and QA21 — confirmed as (c): recorded, each with an owner.**

- **QA20.** The log line still shows text before a URL, a URL that directly follows `_`, and a
  credential written without `://`. The installed driver produces none of them in what QA
  measured. *Owner:* the Q27 (b) wave, which would stop logging a driver's text at all; if the
  owner answers (a), a backlog entry. *Trigger:* a driver message that quotes a value in one of
  those three forms.
- **QA21.** A Latin-1 character in the string is sent as one byte, and what Neon reads from it is
  unmeasured. This is the recorded fourth-reading limit, with logic R1.2's tab. *Owner:* the
  wave's ADR records it; the coordinator files it with F1, F5 and F6. *Trigger:* a string this
  package accepts that Neon routes to a database of another name.

**Round B, restated** — ~~no behaviour but one clamp; two items~~ **one behavioural item and the
mechanical batch; three items, eight production files, six of them touched by one line or one
move.** Not a third round.

1. **B11** (QA19). `test-database-url.ts`, `open-database.ts` (whatever the guard needs to ask;
   `assertConnectionUrlShape` stays exported only if the guard is what uses it). A test pins it at
   the guard: every string the guard allows is opened by both entry points, and QA19's value is
   refused.
2. **One clamped name, one helper** (logic R1.4; the nits) — as item 4 above, unchanged.
3. **The clean-code batch** (should-fix 2–4) — as item 5 above, unchanged.

*Reading, implementer:* this note and the review-round adjudication above it; B10 and B9 as
amended; `test-database-url.ts` whole; `open-database.ts:55-125`;
`tests/support/migration-ledger-probe.ts` and `tests/support/test-schema-lock.ts` (read, not
edited); `tests/live-suite-census.test.ts`, its header; ADR 0006 and its amendment.

**How round B is checked.** Item 1 gets a QA check of its own, and only it: QA's harness that
*uses* accepted strings is run over the strings **the guard allows**, with 0 carrying any part of
the value; `guard-compare` shows only allowed→refused, each one a string an entry point refuses;
QA19's scratch test is re-aimed at the guard and pinned. Items 2 and 3 are checked by the
persistence and web suites staying green. **Review round 2:** logic and security re-read round A
**and item 1**; clean-code re-reads items 2 and 3. The stopping rule holds for anything new.

#### 8B as built — 2026-10-07

**Done.** Commits, oldest first [coordinator-run, from the brief]: `d176fb6` S1, one opener and the three
runtime sites; `9fb0994` S2, the migration tools, and a failed connect settles; `e070613` S3, the test
helpers and the isolation guard; `62a25e4` QA pass 1 (7 failing on QA1–QA3) with the first
adjudication (B1–B7); `a20432e` fix round 1; `e95fc79` second adjudication (QA4–QA11, B8); `1df6d7f` fix
round 2; `a83d4fd` QA pass 3 (8 failing on QA12–QA15); `43048b2` third adjudication (B9, the stopping
rule); `be6c4f1` fix round 3; `8cd85da` QA pass 4, green; `d3645b4` review round 1 adjudicated (B10; B9
amended); `f1a1d00` review fix A; `adf4827` targeted QA, green, QA19 found; `429da6b` QA19 ruled in scope
(B11); `4b2a4bb` review fix B; `db22ff4` QA check of B11, green; `0eb94b6` CI: the test-database step no
longer prints the database name, and a stale doc clause dropped (coordinator-only; security R2.1).

**What shipped.** The rules B1–B11 as they finally stand, with their reasons and the alternatives not
taken, are [ADR 0146](../decisions/0146-nothing-copied-from-a-connection-value-or-thrown-by-a-driver-leaves-the-persistence-package.md);
it is not restated here. In short: one opener that every runtime site, both migration tools and the test
helpers go through; nothing a driver threw or a connection value held leaves the package; the isolation guard
asks the opener.

**Evidence, with who ran it** (ADR 0146 holds the figures and their limits). Criterion 4 [QA-run, fresh
build, eleven malformed values]: 0 marker lines in the server logs, 0 of 33 response bodies. The used-string
harness [QA-run]: of 3,689 swept strings, 265 accepted for queries and 391 for a session, 0 carrying any part
of the value; of 76 strings the guard allows, 0, against 118 with the previous guard. Suites [coordinator-run,
at `db22ff4`]: persistence, exit 0, 55 files, 1485 passed; `apps/web/tests/lib/server`, exit 0, 11 files, 127
passed. At `0eb94b6`: `pnpm format:check` exit 0, persistence typecheck exit 0, the workflow parses as YAML.
**Not run:** `pnpm check`, `pnpm ci:local`, e2e; nothing has run on a CI runner since these commits.

**Review round 2** [reviewer-run]: logic approve (R1.1–R1.4 closed, two notes); clean-code approve (one nit,
fixed in `0eb94b6`); security approve (R1.1–R1.3 closed; *"the wave discharges the 2026-09-06 ruling: for any
string, nothing this package or the routes throw or log carries a credential, at the installed driver and
Node 24"*, with named exceptions Q27/F3, F4, Neon's proxy, and its R2.1, the CI echo fixed in `0eb94b6` and
unproven on a runner).

**Logic R2.2's correction, to this file.** Rule B9's and B11's *"None moves from refused to allowed"* is
true of the wave against the pre-wave guard (1,482 of 18,980 cases allowed→refused, 0 refused→allowed
[QA-run, at `4b2a4bb`]) but **not at every step**: the amended B9 re-allowed, relative to the commit before
it, a case where `DATABASE_URL` carries an `sslrootcert=` parameter [reviewer-run, from source]. The allowed
set is still a subset of the pre-wave guard's. The adjudications above are left as they were written.

**Recorded limits and what is unproven.** Both lists, each limit with its trigger, are in ADR 0146
(*Recorded limits*; *What the wave leaves unproven*). The F-numbered follow-ups are backlog 121 (F1), 122
(F5) and 123 (F6); QA18 and the journal comments, 124; the three red e2e specs, 125.

**Deviations.** The stopping rule (third adjudication) and B8 were made by the architect without the owner
and may be overruled. 8B closed with Q27 unanswered; its recommendation is now (b), as its own wave before
launch. F3 was not approved and was not run.

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
5. ~~`refused` when `findOverflowingPlacementIds` is non-empty, naming exactly those bodies in display
   order; `refused` with its own reason for a kitchen with no cabinet (D14); `refused` when pricing
   fails.~~ **Restated 2026-10-07 in the adjudication below (C1, C3): one refusal at a time, the
   first the customer can act on; *no cabinet* means nothing Lemnaria sells.** *Must not:* the
   model re-derives fit from geometry. Sabotage: replace the query with an
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

#### 8C — adjudication of adversarial QA, 2026-10-07

**State.** The two slices are `97e75c6` and `0d032de`; QA's tests `5c1ae3e` [relayed]. QA is green:
no test left failing, no production defect. The architect ran `tests/review` at `9276aef`: **435
passed** [ran]. What held is QA's and is relayed: parity against the breakdown as it stood before
the wave, over 6,390 comparisons in both locales, 0 differences; the figure against the price bar,
0 differences; 40 sabotages.

| Item | Class | Ruling |
| --- | --- | --- |
| QA1 a kitchen holding only bodies the customer supplies is reviewed at *"De la 0 MDL"* and may be submitted | **Contract gap** in D14 and criterion 5, the architect's: *"no cabinet"* was read as *no body* | C1, in the fix round |
| QA2 the model's three inputs are never reconciled | **Contract gap**: criterion 1 said one projection and never said what a mismatch does | C2, in the fix round |
| QA3 the implementer's import test misses three import forms | **Test-fidelity problem.** QA's test pins criterion 8 | The weak test is deleted |
| QA4 the implementer's fit test reads the source's text and can be satisfied by a discarded call | **Test-fidelity problem.** QA's test pins the *must not* | The weak test is deleted |
| Q30 pricing fails and a body does not fit: the refusal names no body | **Contract gap** in criterion 5, which gave three refusals and no order | C3, in the fix round. **Not the owner's; see below** |

**A correction to Q30 as this file put it.** It quoted *"The refusal names which bodies do not fit"*
as ADR 0065 decision 7. **That sentence is not in ADR 0065.** Decision 7 reads: *"The review/contact
step **refuses while any body does not fit**, so no unbuildable kitchen reaches the owner as an
enquiry."* The model as built satisfies that: it refuses. The sentence about naming is this plan's
own, in *An inherited criterion from M6*, written on 2026-09-03 with its reason: *"The customer has
to be able to go back and fix it"*. So Q30 is settled by **this plan's criterion, not by an ADR's
text**, and the ruling below is the architect's on that criterion. If the owner was told an ADR
decides it, that is to be corrected.

**Rules.**

- **C1 — "no cabinet" means nothing Lemnaria sells** (QA1). A kitchen in which every body is
  supplied by the customer (ADR 0107 decision 2: *"appliances are drawn, not sold"*) is the same
  case as one with no body: there is nothing to make an offer for. The review is `unavailable` and
  the refusal is `NO_CABINET`, whose sentence, *"Adaugă cel puțin un dulap în bucătărie înainte să
  ceri oferta."*, is true of it. Decided on the supplier each line already publishes, never on a
  zero amount (ADR 0107). This is D14 as it was meant; the owner may overrule it.
  - *Not in 8C:* the price bar and the breakdown print *"De la 0 MDL"* for the same kitchen today.
    That predates the wave and is their surfaces' matter: a backlog entry, with the question of
    what a kitchen of appliances alone should show.
- **C2 — the three inputs are one design's, or the model throws** (QA2). `describeReview` keeps
  its three inputs. Deriving the price inside it would make this module name a price book, and
  `use-priced-design.ts` is the one module allowed to (ADR 0062 seam 1, ADR 0072). So the model
  **asserts** what it can see: the rows' keys are exactly the design's placement ids, and the
  priced design's list of bodies past their wall equals the query's answer for the design. A
  disagreement throws a named error, as the breakdown's own divergence does; it is never rendered.
  *What this cannot see:* inputs for another design with the same ids and the same fit. 8D closes
  that at the call site (its criterion 10).
- **C3 — the refusal shown is the first the customer can act on** (Q30). In order: a body past
  its wall; nothing Lemnaria sells; a price that cannot be computed. ~~a pricing failure, then an
  empty kitchen, then a body past its wall~~, the order as built, followed the price bar's states.
  - *What the model returns when pricing fails and a body does not fit:* `unavailable`, since
    there is no figure, with `BODIES_PAST_WALL` and the bodies named. Once they fit, the next
    review shows `PRICING_FAILED`.
  - *How a body is named with no priced rows.* From the projection, by the same words the row
    prints: the entry's label and width. The projection does not depend on pricing. For a priced
    kitchen the name in the refusal still equals the row's label, and a test says so.
  - **Added the same day, on QA's reading of Q30** [relayed; `review-model.ts:143` re-read: it
    returns on a pricing failure before the query is asked].
    - *The shape:* the precedence changes and `RefusedSubmit` keeps its one `code`. No shape
      carrying several reasons is built. The fit query is asked first, whatever pricing answered.
    - *The label, and criterion 1's one builder.* The refusal does not compose a label of its own.
      The breakdown's row builder already makes a row's label from an entry's label and width, as
      one expression inside `toBreakdownGroup` [src `price-breakdown-model.ts:200`]. That
      expression becomes one named, exported function there, and both the row and the refusal
      call it. One labeller, two callers. A second
      route would be the review writing the words itself, and that stays forbidden.
    - *Who re-aims which test.* Three tests pin the precedence as built and flip by this ruling.
      QA re-aims its two (*"states the pricing failure, and names no body, for an overflowing
      kitchen the book cannot price"*; *"does not ask the query at all when there is nothing to
      review"*). The implementer re-aims its one (*"states a pricing failure before an overflow,
      and names no body"*). Neither edits the other's.
    - *Why not keep it as built and record a limit.* It was weighed. The one measured way to this
      state is a tier the book does not offer, which ADR 0072 records as something that *"cannot
      happen until a manufacturer, not a developer, can edit the book"*. But pricing can refuse
      for eleven reasons, and whether a customer's own edits can reach any of the other ten is
      not measured. A rule that is right whichever way that falls costs a moved check and an
      exported function. A limit would rest on an unmeasured claim.
    - *The better question, recorded and not answered here:* whether a saved design should ever be
      unpriced at all. ADR 0072's design says a kitchen keeps the book it was priced under, so the
      state would not arise. That is the dashboard's wave.

**Criterion 5, restated.** ~~`refused` when `findOverflowingPlacementIds` is non-empty…; `refused`
with its own reason for a kitchen with no cabinet (D14); `refused` when pricing fails.~~ One
refusal at a time, in C3's order. `BODIES_PAST_WALL` whenever the query's list is not empty,
**whatever pricing answered**, naming exactly those bodies in display order. `NO_CABINET` when no
body is one Lemnaria supplies. `PRICING_FAILED` only when neither holds. The *must not* and the
sabotage stand.

**The fix round** — four items, one or two production files.

1. **C3** (Q30). `apps/web/src/review/review-model.ts`; `apps/web/src/price/price-breakdown-model.ts`
   for the exported labeller only, its rows unchanged. The implementer re-aims its own
   precedence test; QA re-aims its two in its check.
2. **C1** (QA1). `review-model.ts`; `apps/web/src/price/starting-price.ts` only if the question
   *"does this priced design hold anything Lemnaria supplies"* belongs beside `holdsNoCabinets`.
   The price bar and the breakdown do not change.
3. **C2** (QA2). `review-model.ts`.
4. **Tests only** (QA3, QA4). In `tests/review/review-model-imports.test.ts` the two tests QA
   showed cannot fail are deleted; QA's two are the pins. A test that passes under the mutation it
   exists for is not kept beside the one that does not.

*Reading, implementer:* this adjudication; criterion 5 as restated; *An inherited criterion from
M6*; ADR 0065 d6, d7; ADR 0107 d2; ADR 0062 seam 1; `review-model.ts` whole;
`price-breakdown-model.ts` (how a row's label is built, and its divergence error);
`price-lines.ts`, `overflowingPlacementIds`; QA's five `qa-8c-*` files.

**Then:** a QA check of the round, on these three rules only, with one measurement added: over
its swept kitchens and the edits the editor allows, does `priceDesign` ever refuse. A count, with
the codes; it decides nothing in 8C and tells the next reader whether C3's state is reachable. Then review at the wave's tier:
logic and clean-code. The stopping rule of 8B applies in its own terms: a new finding is fixed in
8C if a criterion as restated fails or something that held no longer holds; anything else is
recorded with an owner.

**Wording, for the owner, not settled here** [relayed from QA]: *dulap* in the refusals against
*corp* in the room line's count (the open half of Q31); the Russian count word, which also counts
a fridge and a hood; `priceBreakdown.note`, reused on this screen, which carries two words without
their diacritics in approved copy. And a fidelity fact for the backlog: no test pins the Russian
wording anywhere in the project.

**Recorded, not fixed.** The sweeps use the fake body probe, not the real one. The rooms the
sweeps drop are all rooms the room validator refuses.

**A conflict between C2 and the query's pin, ruled 2026-10-07 during the fix round.** The fix is
in the tree, uncommitted; the implementer stopped on this and did not choose. The architect ran
`tests/review` there: **4 failed, 451 passed** [ran]. Two reds are C3's expected flips. The other
two are QA's pins of the *must not*: they answer the query through a mock with the opposite of the
geometry, and C2's second assertion now throws on them.

- **(a) One computation, not two.** The priced design's list is the query's own answer:
  `const overflowingPlacementIds = [...findOverflowingPlacementIds(request.design)]`
  [src `packages/configurator-domain/src/pricing/price-design.ts:114-115`]. For one design the two
  lists cannot differ. They differ in exactly one real case: **the price was computed for another
  design.** That is QA2's first finding, and the id check alone does not catch it when the ids
  are the same.
- **(b) C2's second assertion stays. The two pins are re-aimed, by QA.** The assertion is not dead
  weight: it is the only thing that notices a price belonging to another design with the same
  bodies. It fires on the pins because their mock replaces the query for the review alone, while
  the price they pass was computed by the real one: the mock makes the two inputs describe
  different designs, which is the very thing C2 refuses. **Re-aimed to:** the answer the test
  chooses is given to both, the mocked query and the `overflowingPlacementIds` (and
  `totalIsFlagged`) of the price it hands in. The pin still fails for a model that measures a
  wall, since such a model answers by the geometry against both. And one pin is added for the
  assertion itself: a price whose list differs from the query's answer throws
  `ReviewInputDivergenceError`.
- **(c) A design with no body at all, whose pricing also fails: `NO_CABINET`.** That it holds
  nothing Lemnaria supplies is known from the design alone; no price is needed to know it. It is
  also C3's order: the customer can add a cabinet and cannot repair a price. `PRICING_FAILED`
  remains the answer only when the design holds bodies, none is past its wall, and the price
  cannot be computed, since then the supplier of each body is unknown. QA's test *"…for an empty
  kitchen the book cannot price"* flips with it and is QA's to re-aim.

**So QA re-aims five of its tests in its check:** the two precedence tests (C3), the two query
pins (b), and the empty-kitchen one (c). The implementer changes one line for (c) and none of
QA's files.

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
9. **Added 2026-10-07, from 8C's criterion 7.** The screen lays its sections out in the model's
   `REVIEW_READING_ORDER`. The not-included block comes before the call to action in the
   document's order and above it on the screen: a DOM test for the first, the inspected capture
   for the second. 8C proved the order as a value; only this wave can prove it on a screen.
10. **Added 2026-10-07, from 8C's rule C2.** One place hands `describeReview` its three inputs,
    all derived from one snapshot of the store in one render. Nothing else calls it. *Must not:*
    the design comes from the server's page props while the price or the groups come from the
    store, or the reverse.

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

> **Scope restated 2026-10-07** (*M8 restated*, at the head of *Waves*). A client's network comes
> through a port with two implementations: the development host's header, and *none*, the default,
> which puts every request in one shared bucket. ~~`geography.ts` is not built, and no bucket carries
> a country, unless Q28 is answered for two tiers.~~ **The owner then ruled the mint's limit: one
> bucket, the IP address, 20 a calendar day, the same for everyone, and nothing else** (*The limit
> on new designs, as the owner ruled it*). So, of what is written below:
>
> - **S1** is the port and the reduction of an address to a prefix. `geography.ts` is not built.
> - **S2**'s policy for the mint is one row. The evaluator still takes several buckets, because 8G
>   and 8K need it to.
> - **Criterion 1**: the prefix is a datum (Q32); /32, /24 and /64 are named cases. An absent
>   address falls in the one shared bucket, at the same 20 a day.
> - **Criterion 3 does not apply to the mint**: there is one bucket and no session. It returns in
>   8G and 8K for the endpoints that keep two.
> - **Criterion 4**: no *challenged* mint exists. `Retry-After` is the seconds to the end of the
>   Chișinău day, and Step 1 says the limit returns tomorrow (criterion 10, a new leaf).
> - **Criterion 8** becomes: the twenty-first design in a day is refused and the first of the next
>   day is not, on a fake clock at both edges of the day, including the two days a year the day is
>   23 or 25 hours long.
> - **S0** no longer owes D11 for the mint. It owes the e2e policy (below) and the red specs.
>
> Criterion 2 is proved under *none*; on the development host it rests on that host's
> documentation and one request on a deployment. **Waits for the three red `CI=1` specs to be
> triaged. Q32 sets one number and does not block it.**

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

**Restated 2026-10-07 for the 20-a-day ruling.** The five points below stand; what they must lift
is now a day's limit, not an hour's. One run makes 444 designs from one address, twenty-two times
the limit, and a second run on the same day would begin already refused. So point 4 is no longer a
tidiness matter: **the main suite's server counts under keys that belong to that run, or under a
policy whose day figure is far above a day of runs**, and the small set of specs that prove the
real figure (the twenty-first refused) runs against its own server with its own keys, so that it
passes the second time it is run in a day.

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

> **Scope restated 2026-10-07.** The owner's *"20 per day"* is about creating a design and is not
> extended here: saves, shares and page reads keep ADR 0019 d5's figures. M8 has no trusted fact
> about a request's country, so the record's Moldovan column is applied to every request and no
> second tier or challenge is built (the architect's reading of the hosting ruling). **D11 lives
> here now:** the per-browser figure for saves would be reset by creating a design, which changes
> the visitor value; this wave's S0 fixes what it is keyed on, the design being preferred [inf].
> **The prune gains one duty** (*"track"*): before a day's rows go, one line of that day's totals
> is written, with no address. The prune is a route with a secret; the development host's cron
> entry calls it today, and that scheduling is an interim the delivery milestone re-homes.

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

> **Q24 settled 2026-10-07: the wave is dispatchable.** The phone rule is the first
> recommendation, Q6 (iii): a Moldovan number (0 and eight digits, or +373 and eight), or any
> international number written with `+`. Criterion 1's *"pending Q24"* is discharged; its
> properties hold for both forms, and frame 4B's sentence is for the Moldovan one.

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

> **Scope restated 2026-10-07.** M8 builds the port, the configuration reader, the fake and S2's
> message. **`provider-mail-sender.ts` is not built**: the provider is chosen in the delivery
> milestone (Q25). Criteria 3, 4 and the provider half of 6 go with it. Criteria 1, 2, 5 and 7
> stay. If Q29 is answered (b), one more slice adds the marked stand-in: it stores, sends nothing,
> and cannot be selected unless the deployment carries the owner's mark. No dependency is added.

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

> **Scope restated 2026-10-07.** **No bot check in M8.** S1's `bot-check.ts` is not built and no
> port is left for it; the bot verdict leaves the order of checks; criterion 12 and the bot half
> of criterion 11 go to the delivery milestone with Q16 and D12. The contact form's own figures in
> ADR 0019 d5 stand (the owner's *"20 per day"* is about creating a design): the record's Moldovan
> column for every request, since M8 knows no country; its global figure counted, not enforced.
> D11 bears on its per-browser figure as it does on saves; this wave's S0 fixes the key.
> Everything else stands: the body limit, the cross-site guard, the schema, the honeypot, the
> timing check, the limits failing closed, the revision check, the fit refusal, idempotency, D8.
> Criterion 8's *"mail unconfigured"* reads with Q29.

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

> **Settled 2026-10-07.** Q26: frame 4A's response-time hint is not drawn, and nothing about a
> response time is shown anywhere. Q24: the phone field takes a Moldovan number or an
> international one with `+`. The phone acceptance's *"passes 8K's timing check"* stands; there is
> no bot check to pass.

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

> **Scope restated 2026-10-07.** Not affected by the host. Two notes. **The shop's phone number is
> still owed**: until the owner gives it, 5B's direct-call action is not drawn; it is never drawn
> with a stand-in number, and criterion 7 applies once it exists. **5A on a deployment** depends on
> Q29: under (a) it is reached only in automated tests.

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
> and before launch. Waves 8N and 8P1–8P9 are not dispatched from this file.

**Removed 2026-10-07.** This part's text moved to `docs/milestones/M8B-customer-profiles.md`, which now
exists. Checked section by section before removal [scribe-read, both files]: the wave table (8N, 8P1–8P9,
their obligations and tiers), *What each must prove*, the owner's decision of 2026-09-11 (the owner's words,
*What it is*, *What M7 leaves*) and obligations 1–12 are all in the M8B file, with identical wording except
two edits M8B made on purpose: obligation 5 says the application limiter is assigned to the review-and-contact
phase (M8) and to the launch gate, and obligation 12 carries the answer to Q11 (the e-mailed edit link is
dropped). The M8B file also adds the amendment of ADR 0115 and QP1–QP5. Nothing in this part was missing
from M8B.

## Launch waves

> **Restated 2026-10-07 (*M8 restated*).** Of the four waves under this heading, **8Q and 8T stay
> in M8** and **8R and 8S leave for the delivery milestone**. Their text stays here until that
> milestone's file exists.

### 8Q — the CSP enforces

> **Stays in M8.** The policy is the application's own and needs no host. Criterion 6, the bot
> check's scripts, goes to the delivery milestone with the bot check; whatever shield that
> milestone adds must be shown to run under the enforced policy there.

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

### 8R — the firewall rules, staged — LEAVES FOR THE DELIVERY MILESTONE (owner, 2026-10-07)

> **Not dispatched from M8.** No host is chosen, and the owner placed flood protection in *"a
> performant bot shield"*. Kept as written for whoever plans that milestone.

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

### 8S — pre-launch checks — LEAVES FOR THE DELIVERY MILESTONE (owner, 2026-10-07)

> **Not dispatched from M8.** Each check is on the system as it will be launched. One thing does
> not wait: M8's own migrations are still applied, and their grants issued, on the development
> and test databases as each store wave lands (8E, 8I).

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

> **Scope restated 2026-10-07.** The phase gate below no longer includes *"the Launch gate fully
> ticked"*: that gate goes to the delivery milestone. M8's phase gate is the phone gate, the
> desktop line, `pnpm check`, `pnpm ci:local` and a green runner, with the eight named interims
> written into the close-out as open. In the phone gate, *"a limiter refusal is shown at Step 1
> and at 4"* stands; 5A is shown by hand only if Q29 is (b).

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

> **2026-10-07: this gate does not close with M8.** By the owner's ruling that hosting is planned
> in a separate delivery milestone, the gate is carried there whole (*M8 restated*; the reading is
> the architect's, and ADR 0019's 2026-08-31 correction, which names this file as the gate's home,
> owes a dated note). **M8 may tick only what it built:** the buckets, the mint's limit (**20 a
> day per IP address for everyone**, the owner's ruling of 2026-10-07, which replaces the figures
> in the checklist below), `429` with `Retry-After`, fail closed, every other endpoint inside the limiter,
> the pruning, the contact form's limits and its honeypot and timing check, the submission store's
> grants, the fit refusal, and 8B's line. **M8 cannot tick:** the firewall rule, the bot check, the
> owner's confirmation of the set, a real sink, the first stored schema, the live rows, the
> owner's text and the Russian, and the launch host and database lines. The text stays in this
> file until the delivery milestone's file exists.

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

> **Restated 2026-10-07 (*M8 restated*).** **M8 now asks for these only:** the two tables and
> their grants (8E, 8I); one more cron entry on the development host (8G); `LEAD_NOTIFICATION_ADDRESS`
> and `MAIL_FROM_ADDRESS` as names the configuration reader looks for; the shop's phone number;
> and, if Q29 is (b), one variable by which the owner marks a deployment as a test one, never set
> in production. **Gone to the delivery milestone:** the mail provider's account, key and DNS; the
> bot check's package and setting; the firewall rules; the storage alert; and everything a new
> host or database would need. **No dependency is added in M8.**

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
6. ~~A driver error never carries a connection string (8B).~~ **Written 2026-10-07: ADR 0146.** The next
   free number is now 0147.
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

15. **Added 2026-10-07.** The scope ruling: M8 is functionality and basic security; delivery
    preparation is its own milestone; the launch gate is carried there. A dated note on ADR 0019's
    2026-08-31 correction, on ADR 0038 and ADR 0111 d8 (the first stored schema), and on ADR 0095
    (the Russian backstop). Of the items above, **5's provider half, 9, 12 and 14 go to that
    milestone**; 3 loses its country source and its *challenge* (Q28 is answered: one limit for
    everyone).
16. **Added 2026-10-07.** ~~The limiter's tiers and figures as Q28 settles them. If one tier: an
    amendment…~~ **Q28 is answered. A dated supersession of ADR 0019 for the mint**: d5's mint row,
    d4 as it applies to the mint, d3's session bucket for the mint; the quoted sentences are in
    *The limit on new designs, as the owner ruled it*. The same record states what was not ruled:
    the unit for IPv4 (Q32), the day (the architect's), the other endpoints (untouched), and how
    *"for all"* reads beside *"Moldova only for now"*.
17. **Added 2026-10-07.** If Q29 is (b): the marked test deployment, and why it cannot reach
    production. Part of item 2's record.

**Relied on as they stand:** 0001, 0002, 0004, 0008, 0012, 0019, 0020, 0036, 0038, 0041, 0042, 0054,
0062, 0063, 0065, 0067, 0069, 0072, 0074, 0092, 0095, 0096, 0104, 0106, 0107, 0111, 0112, 0113, 0114,
0115, 0118, 0128, 0130, 0131, 0132, 0133, 0144, 0145.

## Risks

- **An interim read as done** (added 2026-10-07). M8 now ends with eight things deliberately
  unfinished (*M8 restated*), among them an open SEC-001 gate and no e-mail leaving the system. The
  risk is a close-out, a STATUS line or a later session that reports M8 "done" and takes them with
  it. Each is written into M8's close-out as open, with the delivery milestone as its owner, and
  that milestone's plan starts from the list.
- **A leaning built as a ruling** (added 2026-10-07). The owner leaned on a host, a database and a
  mail service and ruled on none. Nothing in M8 is built for any of the three.
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
