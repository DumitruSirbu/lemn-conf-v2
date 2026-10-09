# M8 — Screens 3, 4 and 5: review, contact, success and failure

> **STATUS: PLANNED — wave plan written 2026-10-07 at `90927dc`; no wave dispatched.** M8 does not
> start until the owner says so and M7C has closed (see *What M8 assumes*). Summary: `docs/STATUS.md`.
>
> **Updated 2026-10-08, latest: wave 8D is DONE (`7fa5258` … `9f4c123`), not pushed.** The review route and
> screen 3A/3B shipped; see *8D as built* and Amendment A of
> [ADR 0148](../decisions/0148-the-review-refuses-one-thing-at-a-time-the-first-the-customer-can-act-on-and-no-cabinet-means-nothing-lemnaria-supplies.md).
> **Wave 8D2 is DONE (`3ffad38` … `0fad22c`), not pushed; see *8D2 as closed*.**
> **M8 is sixteen waves** (8D2 was added after 8D). Next: 8E, 8I, 8H and 8J are dispatchable (backlog 121 before 8E).
> Q29, Q31 and Q32 are answered (Resend; *dulapuri*; the /24). The paragraphs below that say 8D is
> dispatchable, or M8 is fifteen waves, are history.
>
> **Scope restated 2026-10-07, after the owner's answers to Q21–Q27.** Hosting, the database's
> home, the mail provider, the bot check, the firewall and the rebuilding of runtime errors go to
> **a separate delivery-preparation milestone**; M8 is *"functionality and basic security for
> now"* (the owner's words). **M8 is fifteen waves and ends at 8T: 8R and 8S leave; 8F, 8J, 8K and
> 8T change.** The launch gate does not close with M8. Read *M8 restated* at the head of *Waves*
> first; it supersedes the paragraphs below and any wave text it names. **The owner then ruled the
> limit on new designs: 20 a day per IP address, for everyone, and nothing else** (*The limit on
> new designs, as the owner ruled it*), which supersedes ADR 0019's mint row. ~~**Open for M8: Q29,
> Q30, half of Q31, Q32.** Dispatchable: 8E, 8I, 8H; 8D once 8C's QA and review close.~~
> **Later the same day the owner answered Q29, Q31 and Q32** (*The owner's answers to Q29, Q31 and
> Q32*): **Resend is the mail provider, in M8**, which restores 8J's adapter and closes Q29; the
> 20 a day is counted **per block of 256 addresses**; ***dulapuri* everywhere** a cabinet is counted
> or named. Open for M8: one narrow wording point. Dispatchable after 8D: 8E, 8I, 8H, 8J.
>
> **Updated 2026-10-07, after wave 8C: wave 8C is DONE (`97e75c6` … `3bda09d`), not pushed.** QA green,
> its adjudication (C1–C3) and fix round done, logic and clean-code review approve; see *8C as built*.
> **Q30 is closed by rule C3**, the architect's ruling on this plan's criterion and open to the owner.
> 8D is dispatchable once the architect adds two criteria from the logic review (the overflow warning's
> place in `REVIEW_READING_ORDER`; what the call site shows for an uncatalogued body); 8E, 8I and 8H
> are dispatchable now. **Open for M8: Q29, half of Q31, Q32.**
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
`DATABASE_URL` does not leak the leads. **(Narrowed 2026-10-08, the architect's, on 8I S0's
figures: `UPDATE` is asked for on notified-at alone, not on the seven. `INSERT` and `SELECT` are as
answered. The exact statements, and why: *8I — S0's figures, and S1 restated for dispatch*, R1.)**
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

- **One address, or a block of them: ~~Q32, below~~ answered later the same day — the block of
  256, a /24** (*The owner's answers to Q29, Q31 and Q32*). For IPv6 it is not a question: the unit is the
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

**What 20 a day admits, restated from 8A S1's figure.** ~~One address~~ **One block of 256
addresses (Q32)**: 20 rows a day at 523,972
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

### The owner's answers to Q29, Q31 and Q32, 2026-10-07

**Verbatim** (relayed by the coordinator):

> 29 - lets use resend , i have the api key already

> 32 - hmm what is more limited

The coordinator answered that the block of 256 is the stricter: 20 a day shared by 256 addresses,
harder for someone with many nearby addresses to walk around, likelier to refuse unrelated
customers on one provider's range; that a shared single address shares its 20 either way; and that
the architect and the coordinator both recommended a single address [the coordinator's wording,
relayed]. The owner then ruled:

> 32 -go with Per block of 256

> 31 - dulapuri everywhere

**Q32 — ruled: for IPv4 the 20 a day is counted per block of 256 addresses (a /24).** The owner
chose the stricter option, against both recommendations, having been told the trade-off. For IPv6
the unit is the /64; that remains the architect's reading of ADR 0019 d3 and not the owner's
sentence. Consequences:

- **8F.** The policy's prefix is /24 for IPv4 and /64 for IPv6. Nothing else in the wave changes:
  it was already to build the reduction for any prefix.
- **8E.** The table does not change. What it stores is a hash of the block.
- **D10's note, restated.** There are about sixteen million /24 blocks, so an unkeyed hash of one
  is undone by trying them all, more easily than a hash of a single address. But what it then
  reveals is a block of 256 addresses and not a person's address, and the row lives a day. The
  keyed hash is still put to 8E's security reviewer and still not built by default.
- **The bound.** One block: 20 rows a day, 10.0 MiB at the largest design [arithmetic on 8A S1's
  size]. Everyone whose address falls in the same 256 shares that allowance, whether or not they
  share an address. Abuse spread over many blocks is still not bounded by the application.
- **For the scribe, ADR 0147**, written with Q32 open: its title's *"per IP address"*; the unit
  wherever it says an address; the bound, which is per block; and who shares an allowance.

**Q31 — ruled: *dulapuri* everywhere a cabinet is counted or named as a unit.** That settles the
room line's count, which the coordinator has sent to 8D's implementer. **Not extended, and asked
of the owner by the coordinator, unanswered:** the four other lines of `ro.json` that contain
*corp* and are not counts of cabinets — *"Material corp și fronturi"* and three texts about the
sink's body [relayed; the coordinator's grep].

**Q29 — the question was not answered as put; its premise was removed. Resend is the mail
provider, in M8, and the owner holds an API key.** This **supersedes, for the provider, the
deferral recorded this morning**: Q25 was a leaning (*"the server provider will have also email,
or something like sendgrid"*), was recorded as not ruled, and the adapter went to the delivery
milestone. The host (Q21) and the database's home (Q22) stay deferred. **Q25 is closed by this
answer**, and with it the architect's Q25 recommendation of the shop's own mail host. One fact
travels with the choice and is not undone by it: Resend keeps account data, metadata and thirty
days of each message's content in the United States [ven §4]. ~~Whether that fact was in front of
the owner when they chose is the coordinator's to confirm~~ **Confirmed later the same day
[relayed by the coordinator]: the owner chose Resend knowing it stores account data and thirty
days of mail content in the United States.** It goes into the privacy text (Q7, Q13).

**Q29 as it now stands: closed.** No marked test deployment is built. A deployment whose mail
variables are set sends real mail; one where any is unset says the request cannot be sent, as D8
and 8K's criterion 8 always had it.

### The owner's answers of 2026-10-08

Four answers, all relayed by the coordinator. The owner's words are quoted where the coordinator
gave them; everything else in this section is a reading and is marked as whose.

| What was asked | The owner | Standing |
| --- | --- | --- |
| Rule S2 of 8E: a hit repeated after the database has slept may be counted up to three times | Chose *"Accept (Recommended)"* | **Accepted.** No longer the architect's alone |
| Q33: which ways of writing a phone number are accepted | The example *"069010101"*, then *"Yes"* to the coordinator's reading | **As built.** My recommendation is not taken |
| Whether a Moldovan number's eight digits can begin with 0 | First *"All number in Moldova start with an 0 mobile or fix numbers"*, then *"no there is no number 00x xxx xxx , only one 0 at start"* | ~~Recorded as said. Criterion 16 still rests on my inference~~ **Criterion 16 confirmed by the owner, by his second sentence** |
| What a test may delete from a database | *"If were added by tests , delete , if added by production user keep"* | **Ruled** |

**1. Rule S2 — accepted.** The question put was: after the database has slept, the first request
is retried and may be counted up to three times against the twenty-a-day limit. The owner chose
*"Accept (Recommended)"*. ADR 0149 marks the rule *"open to the owner"*; that is discharged, and
the scribe amends the ADR at 8H's close. *Not asked, and unchanged:* that an empty reply is not
repeated, and criterion 11's bounds.

**2. Q33 — as built.** The owner answered with an example, *"069010101"*. The coordinator then
put a reading to him: accept only `0` and eight digits, or `+373` and eight, with spaces, dashes
or brackets; keep refusing dots, *"00373…"*, *"+373 (0)…"* and eight bare digits. He answered
*"Yes"*. **Ruled:** those four spellings stay refused. **I had recommended accepting all four;
that is not taken.** *My reading, not put to him:* *"spaces"* covers a space of any width, as
8H's reading 8b has it, and a format character is still removed and not refused (criterion 10).
Neither changes which of the four spellings is refused.

**3. Criterion 16 — the owner's sentence, and what it does not say.** Asked whether it is true
that no Moldovan number's eight digits start with 0, he answered: *"All number in Moldova start
with an 0 mobile or fix numbers"*. **The coordinator's reading, and mine:** he confirms the
national form, the prefix 0 and then eight digits. **He did not say whether the first of the
eight can be 0.** ~~So criterion 16 is not his ruling and is not raised to one: it stands on the
inference written under it.~~ His own example is consistent with it and proves nothing more.

**Then he answered it directly, the same day:** *"no there is no number 00x xxx xxx , only one 0
at start"* [relayed]. That is the criterion in his words: after the one 0, the eight digits do
not begin with another. **Criterion 16 is confirmed by the owner, 2026-10-08, and no longer
rests on my inference alone.** The two sentences are kept in the order he gave them, because the
first did not say it and the second does. *Still not ruled, and not asked:* which other first
digits exist.

**4. What a test may delete — ruled, in his words:** *"If were added by tests , delete , if added
by production user keep"*.

- *Ruled:* a test may delete rows that tests added. A row a real user added is never deleted.
- *The coordinator's reading:* the three rows removed after 8E's interrupted run are thereby
  accepted. They were tests' rows on the test database.
- *Not ruled:* how a row is known to be a test's.
- *My reading of that, which is 8E's ruling and stands:* on the guarded test database, by a
  marker only tests write, with the count removed reported. And its other half follows from his
  words: **on a database that holds users' rows, a test deletes only what it can show it added
  in that run.**
- *Where it should live, for the scribe:* a dated record in `docs/decisions/`, with the sentence
  verbatim, since an owner's rule said in conversation is not yet an invariant; it belongs beside
  ADR 0006, which it extends. Its working form goes in
  `docs/best-practices/environments-and-resources.md` under *Test-database isolation*, next to
  the rule that resources are add-only, which it qualifies for rows. `docs/WORKFLOW.md` needs a
  pointer at most.

**5. A fifth, the same day — the keyed digest: yes.** His words: *"lets add this secret"*
[relayed].

- *What he was told before he answered* [the coordinator's account, relayed]: a plain hash of a
  name and a phone, in a column the application's role reads, can be guessed back; the answer is
  a digest keyed with a secret held only in the server's environment; it costs one new variable
  that he sets in every environment; it does not help if the database credential and the
  environment both leak; and the same question was coming for rate-limit keys, so one secret
  could serve both.
- *One sentence he was told that I correct here, so the runbook is right:* that rotating it
  *"only makes an in-flight retry look new"*. A retry across a rotation is answered as a
  **conflict**, not taken as new: the row with that request id is found and its digest differs.
  And rotation has a second consequence he was not told in those words: **every rate-limit count
  starts again**. Neither changes his answer's sense; both go to him with the runbook.
- **Ruled by him:** the secret exists, and the conflict digest is keyed with it.
- **Not ruled by him, and mine:** its name, its shape, ~~that one secret serves both uses, that
  8F keys from the start,~~ and how tests run without it. All are in *The digest secret*, under
  8I. ~~The security reader confirms the second and third at 8F's S0.~~

**6. A sixth — one secret for both uses.** His words: *"lets use same secret"* [relayed].

- *What he was answering* [the coordinator's account, relayed]: the coordinator had told him it
  had asked whether the rate-limit keys in 8F should use the same secret from the start, so that
  their counts never restart.
- **Ruled by him:** one variable. The conflict digest of 8I and the rate-limit keys of 8F, 8G
  and 8K are keyed with it.
- **The coordinator's reading, and mine:** *from the start* is part of what he said yes to,
  since it was in the question. So 8F is keyed from its first deploy.
- **Still mine:** that the two uses are kept apart by the encoding and not by a second secret's
  existence. He chose one secret; how one secret is used safely twice is the security reader's
  to check at 8F's S0.
- **This replaces the security reader's earlier recommendation**, *unkeyed for 8E and 8F,
  decided in 8K's S0*. ADR 0149 records that recommendation; **the scribe amends it** with his
  two sentences and the date.

**A fact recorded with these, coordinator-run [relayed].** The owner changed Vercel's Development
`DATABASE_URL` and pulled it again. The privilege test now prints *reached database
"lemn-conf-v2-preview" as role "app_designs"*: 10 passed, 1 skipped, exit 0. **So the persistence
suite no longer reaches production from this machine.** The guide's row for the root
`.env.local` is now stale and is the scribe's to correct at 8H's close. Which test skipped was not
relayed; if it is the one on `rate_limit_counters`, criterion 7's grant half of 8E is still
written and never executed.

### What is still open for M8 itself, 2026-10-07

~~Four questions.~~ ~~**Q28 is answered (the section above). Open: Q29, Q30, the second half of Q31,
and Q32.**~~ **As of the answers above: Q28, Q29, Q31 (for counts and units) and Q32 are answered;
Q30 is settled as rule C3 in wave 8C. Open for M8: only whether *"dulapuri everywhere"* reaches the
four lines that are not counts.** Every other open question went to the delivery milestone with its subject.

**Q32 — For IPv4, is "per IP" one address, or the block of 256 around it?** *[**Answered
2026-10-07: the block of 256**, the owner's own choice against the recommendation below. See the
section above.]* The owner said *"per
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
*[**Closed 2026-10-07.** The owner chose the provider instead: Resend, in M8. Neither option below
is taken; no marked test deployment is built.]*
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

**Q31 — *Dulapuri* or *corpuri* on screen 3?** *[**Answered 2026-10-07, later: "dulapuri
everywhere"**, for every place a cabinet is counted or named as a unit, the room line's count
included. Open only for the four lines that are not counts. See the section above.]*
*[**The four lines answered later, during wave 8D, 2026-10-07 (relayed): the owner's words and the accepted
proposals are in ADR 0148 Amendment A, *The owner's copy rulings*: *"Materialul dulapului și al fronturilor"*,
*dulapul chiuvetei*, *chiuveta everywhere*, and the Russian *шкаф*/*мойку* lines. Not settled: the Russian count
word, which also counts a fridge and a hood.**]*
*[Earlier the same day:* **Half answered 2026-10-07.** The owner,
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
- ~~**8J — the port, the configuration reader, the message, a recording fake. No provider adapter.**
  A generic SMTP adapter was weighed, since it would serve the host's own e-mail and a relay like
  SendGrid alike [inf, unverified]. It is not taken: it adds a dependency at the security tier and
  cannot be shown working without a mailbox nobody has yet, and the choice it prepares for is not
  made. Q29 decides whether a marked test deployment may stand in.~~
  **8J — restored later the same day: the owner chose Resend, in M8.** The port, the configuration
  reader, a Resend adapter over plain HTTPS with no SDK, the message, the fake. See the wave's own
  restatement. No dependency is added.
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

1. ~~**No real e-mail leaves the system.** Port and message only.~~ **Restated the same day (the
   owner chose Resend): real mail leaves only where the owner has set the three mail variables,
   and it is proved only as far as the owner's own test sends.** Not shown in M8: delivery from
   the production domain with its DNS records; that a request stored and never notified is ever
   seen by anyone, since nothing in M8 reads the rows back.
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
| ~~The mail provider and its adapter; DNS; the inbox, the shop's number, the sending domain~~ **Restated the same day: the provider is chosen (Resend) and its adapter is M8's.** M9 inherits mail's launch half: the sending domain's SPF, DKIM and DMARC on the production domain; delivery shown from it; the privacy text naming a processor that stores in the United States; a way to see a request that was stored and never notified; and a change of provider if the launch host's own mail is preferred, which the port allows | ~~Q25; Q29's mark must be absent in production~~ Q7, Q13; the owner's inbox, number and domain |
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
| 8C | Stays. ~~In adversarial QA~~ ~~QA green (`5c1ae3e`); adjudicated 2026-10-07: a fix round of four items (C1–C3)~~ **DONE 2026-10-07, commits `97e75c6` … `3bda09d`, not pushed.** Logic and clean-code review approve. See *8C as built* | ~~The fix round, a QA check of it, then logic and clean-code review.~~ — Q30 is settled as C3 |
| 8D | **DONE 2026-10-08, commits `7fa5258` … `9f4c123`, not pushed.** See *8D as built* and ADR 0148 Amendment A | ~~Dispatchable: restated 2026-10-07 as four slices, criteria 11–15 added (*8D, restated for dispatch*). S1 first~~ — Done. 8D2 follows |
| 8D2 | **DONE 2026-10-08, commits `3ffad38` … `0fad22c`, not pushed.** Added the same day from 8D's visual review: the rows' second line and the bottom bar, as frames 3A and 3B draw them. See *8D2 as closed* and ADR 0148 Amendment B | ~~8D closed. One owner point: the material pill on screens 3–5~~ — Done. The pill stays the owner's question |
| 8D3 | **DONE 2026-10-08, commits `b5aed77` … `be4ffe2`, not pushed.** The boundary gate, red at `ad535d0`, with backlog 121. See *8D3 as closed* | ~~Backlog 121 before 8E~~ — Done |
| 8E | **DONE 2026-10-08, commits `ec2f181` … `c8305b1`, not pushed.** The rate-limit store. See *8E as closed* and [ADR 0149](../decisions/0149-the-rate-limit-store-keeps-one-row-per-bucket-per-window-refuses-a-broken-promise-and-may-count-high-but-never-low-between-prunes.md). **Owner action outstanding:** apply `0007` and its grant by the runbook | ~~Dispatched~~ — Done |
| 8I | ~~Stays. Blocked 2026-10-08 on the keyed-digest question; unblocked the same day: the owner said yes~~ **DONE 2026-10-09, commits `049ed39` … `1bbd08e`, not pushed.** The contact submissions store. See *8I as closed* and [ADR 0153](../decisions/0153-a-contact-request-is-stored-once-apart-from-designs-the-application-role-reads-none-of-its-personal-columns-and-code-refuses-before-the-server-what-the-table-would-refuse.md). **Owner action outstanding:** apply `0008` and the three grants by the runbook; the grant is narrower than Q14 (i) | ~~8E's migration number~~ — 8E took `0007`. ~~**Dispatchable.** Its dispatch reads *The digest secret* (below, under 8I) and ADR 0150's *What later waves inherit*; it never touches the secret~~ — Done |
| 8H | **DONE 2026-10-08, commits `aecacbd` … `2b8c60b`, not pushed.** The submission contract. See *8H as closed* and [ADR 0150](../decisions/0150-the-submission-contract-is-one-io-free-definition-a-request-holds-no-price-reads-only-what-the-sender-wrote-and-the-snapshot-and-the-review-share-one-refusal-rule.md). `2b8c60b` is unreviewed | ~~Nothing. Dispatchable~~ — Done |
| 8J | ~~**Changed:** no provider adapter~~ **Restored: a Resend adapter** (owner, 2026-10-07) | **Nothing to build it. Dispatchable whole**, after 8D. Proving it end to end waits for the owner: the three variables on a deployment, and a sender the provider accepts |
| 8F | **Changed:** identity through a port; one bucket, 20 a day per ~~address~~ **block of 256 (/24; /64 for IPv6)** (Q28 and Q32 answered) | The three red `CI=1` specs triaged; 8E. ~~**Q32** sets one number and does not block the build~~ |
| 8G | Changed lightly | 8F |
| 8K | **Changed:** no bot check | 8F, 8H, 8I, 8J |
| 8L | Stays; Q26 settled | 8H, 8K |
| 8M | Stays | 8L; the shop's number, or the action is not drawn |
| 8Q | Stays | 8L |
| 8T | **Changed:** the phase gate without the launch gate | Everything above |
| ~~8R~~ | **Leaves for M9** | — |
| ~~8S~~ | **Leaves for M9** | — |

**M8 is ~~fifteen~~ sixteen waves and ends at 8T (8D2 was added on 2026-10-08, after 8D; it may run
any time before 8T). Order now:** 8C (~~in QA~~ done) → 8D → 8E → 8I → 8H → 8J → 8F → 8G →
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

#### 8C as built — 2026-10-07

**Done.** Commits, oldest first [coordinator-run, from the brief]: `97e75c6` S1, the review as one value
built by the breakdown's own row builder; `0d032de` S2, submit eligibility; `5c1ae3e` QA pass (green; two
contract gaps, two test-fidelity findings); `0b223f4` the adjudication (rules C1–C3); `a6ba280` the fix
round, with the architect's ruling on the C2/pin conflict; `01f60ae` QA's check of the fix round (green);
`3bda09d` the review fix (the refusal order in one function; one error type). **Not pushed.** HEAD
`3bda09d`.

**What shipped.** The rules C1–C3 as they finally stand are in this section's adjudication and the ruling
on the conflict, and are not restated here. No decision record was assigned to 8C by *ADRs*, so none was
written; where the rules' durable home is, is an open question to the coordinator.

**Evidence, with who ran it.**
- [coordinator-run, at `3bda09d`] web typecheck exit 0; `apps/web` `tests/review`, `tests/price` and
  `tests/i18n` exit 0, 55 files, 1231 passed; whole-tree `pnpm format:check` exit 0. **Not run:**
  `pnpm check`, `pnpm ci:local`, e2e, a build. Nothing has run on a CI runner since the branch was cut.
- [QA-run] Parity against the breakdown as it stood before the wave: 6,390 comparisons across straight,
  L, right-hand L and U kitchens in ro and ru, 0 differences, run twice (after the slices and after the
  fix round). The figure against the price bar over the same set: 0 differences. The refusal order
  across six real pricing-refusal codes. 357 all-supplied kitchens refused `NO_CABINET`. Across 7,825
  designs (generated, made to overflow, and after remove, width, tier and depth commands)
  `priceDesign` refused 0; insert, swap, finish and handle edits were not in that count.
- [reviewer-run] Logic: approve in round 1 (no blocker, no should-fix, four notes) and in round 2 at
  `3bda09d` (its seven-row outcome table unchanged; consistent inputs cannot throw; the breakdown
  unchanged). Clean-code: approve in round 1 with two should-fix, both closed in round 2; two new nits
  recorded below.

**Recorded limits.**
- **QA5:** a stale projection with the same ids and the same fit is rendered with its old label. C2
  states this itself (*"What this cannot see"*). Owned by 8D's criterion 10.
- **QA6**, as narrowed by the review fix [relayed; its text is not in this file, and this note does not
  restate it].
- The sweeps use the fake body probe, not the real one.
- Criterion 7 is pinned only as a constant until 8D (8D's criterion 9 proves it on a screen).
- Five of pricing's eleven refusal codes were not reached [QA-run, relayed]. C3 already records that
  whether a customer's own edits can reach any code but the tier one is not measured.
- No test pins Russian wording project-wide: backlog 127.
- Two clean-code nits, both in backlog 124: a comment on `refuseFirstActionable` says it is called only
  for a refused kitchen though the available path calls it too, and the listed-ids expression is built
  twice.

**Carried to 8D** (the architect extends 8D with two criteria before it is dispatched) [reviewer-run, logic]:
- **R1.1:** a design naming an uncatalogued body never reaches `describeReview`, because the projection
  throws first. What the call site shows for it is undecided.
- **R1.4:** `REVIEW_READING_ORDER` has no place for the overflow warning.

**Deviations.** C1 (a kitchen of only customer-supplied bodies is *no cabinet*) and C3 (the refusal shown
is the first the customer can act on) are the architect's rulings and are open to the owner. The price
bar and the breakdown still print *"De la 0 MDL"* for such a kitchen: backlog 126. The wording questions
under *Wording, for the owner* are unchanged and unanswered, apart from the refusal sentences (Q31).

### 8D — the review route and screen 3A/3B

*Goal.* The customer reaches the review from the editor, reads it on a phone, and goes back to a
chosen cabinet. *Tier: Light + visual; a security reviewer reads S1 only.*
**DONE 2026-10-08, `7fa5258` … `9f4c123`, not pushed: see *8D as built* at the end of this section.**

> **Made dispatchable 2026-10-07, after 8C closed (`3bda09d`; close-out `223997c`) [relayed].** The
> slice table below is superseded by the one in *8D, restated for dispatch* at the end of this
> section: four slices, checked against the tree. Criteria 1–10 stand; 7 and 10 are restated there
> and 11–15 are added.

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
   differently named **(clarified 2026-10-08, from the security review: *admits* here means
   locale routing and the unprefixed redirect. The list does not decide what can be reached; a
   path it does not admit still reaches the router. The gate is the page's own owned load)**; `s/{token}/review` is not a route. The shared view shows no review control.
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

#### 8D, restated for dispatch — 2026-10-07

**What the tree has** [src, at `223997c`]. The editor's page is `app/[locale]/d/[id]/page.tsx`; it
reads the visitor cookie, calls `loadOwned`, and answers `DesignLoadError` with `unavailable` or
`invalid`. Client parts live beside it without the locale: `app/d/[id]/hydrate-and-configure.tsx`.
The share view has its own sibling hydrator, `app/s/[token]/shared-design-view.tsx`. The call to
action is a `span` in `configure-screen.tsx`. `src/review/` holds `review-model.ts` and nothing
else. `KitchenStage` picks on every tap and has no way to be told not to. The proxy admits `d/{id}`
as exactly two segments.

**Tier, confirmed: Light + visual; a security reader on S1.** The contract is settled by 8C. What
the security reader is for: this is a second door to a design that opens only in its own browser
(ADR 0114 d5). They check that both doors answer through one function, so they cannot drift; that
the proxy admits the new families exactly; and that a request without a well-formed cookie still
issues no query. **No limiter stands in front of this route until 8G.** That is an interim, not a
finding: the route costs what `/d/{id}` costs, one indexed lookup.

| Slice | Does | Files (production) | Reading |
| --- | --- | --- | --- |
| S1 | The gated route. The editor's page and the review's page answer the owned load through **one** function, so every refusal is the same by construction. A sibling hydrator puts the design in the store and shows a heading. The proxy admits `d/{id}/review`, `…/contact` and `…/done` | new `app/[locale]/d/[id]/review/page.tsx`; a new module for the shared owned load; `app/[locale]/d/[id]/page.tsx` (to call it); new `app/d/[id]/review/hydrate-and-review.tsx`; `proxy.ts` | D1, Q2 (answered); ADR 0114 d5, H2, H5, G5; ADR 0133; `app/[locale]/d/[id]/page.tsx`; `app/d/[id]/hydrate-and-configure.tsx` and `app/s/[token]/shared-design-view.tsx` (the two existing hydrators); `store/configurator-snapshot.tsx`; `proxy.ts`, `isCustomerPath`; `tests/app/qa-7e3b-design-page-gate.adversarial.test.ts`; `tests/proxy.test.ts` |
| S2 | The scene, to look at and not to edit: a mount that selects nothing on a tap, with the room's three views as chips and *Vezi în 3D* | `scene/kitchen-stage.tsx`, `scene/kitchen-canvas.tsx`, new `review/review-scene.tsx` | D4; ADR 0074; ADR 0144; `configure-screen.tsx:80-110, 180-205` (how the editor mounts the canvas and the view chips); frame 3A (`…Mobil.dc.html:996-1001`); `tests/app/configure-screen-single-mount.test.ts` |
| S3 | Frames 3A and 3B as a screen: the one place that hands the model its inputs; the sections in the model's order; the bottom region; the refused and the unavailable states | new `review/use-review.ts`; new `app/d/[id]/review/review-screen.tsx` and `review.module.css`; new `review/review-groups.tsx`; `review/review-model.ts` (the reading order's two new entries, nothing else). The message files change with it as one leaf set | 8C *as built* and its adjudication (C1–C3); criteria 7, 9–15; frames 3A, 3B (`:969-1157`); ADR 0065 d6, d7, 7b; ADR 0104 d1–d3; `price/price-breakdown.tsx` (how the breakdown derives the same inputs); `price/use-priced-design.ts`; `price/price-bar.tsx`; `scene/overflow-warning-layout.ts`; `engineering-conventions.md`, *Localised copy*; ADR 0113 and Q10 |
| S4 | The editor's side: *Verifică designul* becomes a link; `?select=` and `?settings=open` are honoured once on arrival; the review's call to action waits for the save | `configure-screen.tsx`, `configure.module.css`, `store/configurator-store.ts`; `use-back-guard.ts` only if the guard must let the forward navigation pass | ADR 0104 d6 and Amendment D; M7C C1 S3 and S4 *as built*; ADR 0139; `back-guard.ts`; `tests/e2e/qa-m7c-c1-s3-back.adversarial.e2e.spec.ts` (the test this slice retires); `persistence/save-coalescer.ts` |

**Order: S1 → S2 → S3 → S4.** One writer. S3 is the largest and stays under five production files
because the scene is S2's.

**Criteria restated.**

7. ~~When 8C answers `refused`, *Cere oferta* is disabled, the reason is on screen above it, and
   each named body links to the editor with that body selected.~~ When the model answers
   `refused`, *Cere oferta* is disabled and **its sentence is on screen with it at every scroll
   position** (criterion 12). Each body the refusal names is listed as a link that opens the
   editor with that body selected (criterion 13). The sentence is
   `content.review.refusalReasons[code]`; the screen writes none of its own.
10. One place hands `describeReview` its three inputs, **`review/use-review.ts`**. It reads the
    design and the catalogue from the store once, prices through `usePricedDesign`, and projects
    the groups from that same design; nothing else imports `describeReview`. *Must not:* the
    design comes from the page's props while the price or the groups come from the store, or the
    reverse; a projection is kept from an earlier design.
    *How a test shows it.* (i) An import check, by parsing: one importer. (ii) Behaviour: with the
    hook mounted, a body is widened by one step through the store's own command; in the very next
    view the row for that body carries the new width and the figure equals the price bar's. A
    stale projection with the same ids and the same fit, which 8C's rule C2 cannot see (QA5 of
    8C), fails (ii).

**Criteria added.**

11. **The reading order gains two entries**, `overflowWarning` and `refusal`, after `disclaimer`
    and before `figure` (logic R1.4 of 8C's review). The constant is the model's and S3 changes
    it; the screen follows it, and the DOM test of criterion 9 covers the two new entries.
    *Why there.* ADR 0065 d6: *"the flag travels with the total"*, so the flagged-total sentence
    stands with the figure; and a control that is off stands with its reason (§9: disabled with
    reason), so the refusal stands with the call to action. The frames draw neither state.
12. **The bottom region.** Pinned, in this order: the flagged-total sentence when the total is
    flagged; the refusal's sentence when refused; the figure; the call to action. *Must not:* the
    call to action is ever off without its sentence on screen; the region hides the list's last
    row. With both sentences showing, in Russian, at 390 × 844, the list scrolls until its last
    row is clear of the region. **If that region then takes more than half the viewport's height,
    the implementer stops and reports**: the design returns to planning and is not squeezed. [The
    half is the architect's tripwire, not a measured figure.]
13. **The bodies a refusal names** are listed as links directly above the bottom region, last in
    the page's flow, each opening the editor with that body selected. In an `available` review
    each such body's row is also marked. In an `unavailable` review there are no rows, and the
    list is the only place they appear. *Must not:* a name is composed by the screen; it is the
    model's.
14. **An unavailable review** shows the top bar, the heading, the refusal's sentence, the named
    bodies if any, the call to action off, and the way back to the editor. *Must not:* a figure,
    a zero, an empty list, the not-included block or the scene's chips are drawn for it.
15. **A stored design the load seam refuses** (logic R1.1 of 8C's review). A row naming a body the
    catalogue does not hold is refused where it is loaded, as `UNKNOWN_BUILD_ID`
    [src `validate-design.ts:167`], and the editor's page answers the *invalid* load-error page
    for it. The review's page answers the same page through the same function (S1), so
    `use-review.ts` never holds such a design and the projection's `UnknownBodyError` is not
    reached. *Must not:* that error, or any other, reaches the route's error boundary from a
    stored row; the two pages answer differently for one row. A test loads one such row through
    both.

**The sentence printed twice** (logic R1.3 of 8C's review). The not-included slot and the
disclaimer's notice both open with the same words, so screen 3 says them twice. **8D draws both,
as the model returns them.** Both are approved copy and criterion 6 of 8C is met. *Must not:* the
screen drops, merges or rewords either to hide it. It goes to the owner with Q9, where the
not-included list is settled anyway.

**Named interims 8D leaves.**

- *Cere oferta* leads to the existing placeholder contact page until 8L builds `/d/{id}/contact`.
- The proxy admits `d/{id}/contact` and `d/{id}/done`; until 8L and 8M each answers not-found.
- No limiter stands in front of the route until 8G.
- The not-included list is slot text (Q9); the room line counts in *corp*, the refusals say
  *dulapuri* (the open half of Q31).
- Desktop: the phone's layout, responsive, at 900 px and 1440 px; no desktop chrome is designed.

**Reading lines.**

- *QA:* the criteria; `tests/app/qa-7e3b-design-page-gate.adversarial.test.ts` and
  `tests/proxy.test.ts` (the editor route's refusals, to be matched class for class);
  `tests/e2e/qa-m7c-c1-s3-back.adversarial.e2e.spec.ts`; the top-bar box and containment tests;
  the `.dom.test.ts` pattern; ADR 0144 (wait bounds); `pnpm gate:e2e-shard-budget` (backlog 106).
- *Combined reviewer:* the four slices' files; 8C *as built*; ADR 0104; criteria 7 and 9–15.
- *Security, S1 only:* S1's five files; ADR 0114 d5, H2, H5, G5; ADR 0133; criteria 1, 2, 15.
- *Visual:* `browser-and-visual-qa.md`, the sections *Visual and mobile verification*, *A trap that
  produces confident wrong measurements, not an error* with its second instance, and *The tree a
  verifier measures must not move under it*. **390 × 844 first**, set before the page loads, real
  touch, `ro` and `ru`. Compared against frames 3A and 3B (`…Mobil.dc.html:969-1157`). The
  captures must show: 3A from the top; 3B's end with the not-included block above the bottom
  region; a U kitchen with its wall C group; each of the three views; a kitchen with a body past
  its wall, both sentences in the bottom region and the list's last row scrolled clear of it; an
  unavailable review; the call to action waiting on a save. Then 900 px and 1440 px as the
  separate desktop line. Each capture is inspected and what could not be verified is said.

**Where rules C1–C3 live: an ADR, now.** The plan is archived when M8 closes, and these three are
shipped behaviour that a later reader would otherwise get wrong, C3 above all: it reverses the
order first built, and this plan once quoted it as ADR 0065's when it is not. The scribe writes
it; the architect's content:

- the review refuses one thing at a time, the first the customer can act on: a body past its
  wall, then nothing Lemnaria supplies, then a price that cannot be computed (C3);
- *no cabinet* means nothing Lemnaria supplies, read from the supplier each line publishes and
  never from a zero (C1; ADR 0107 d2); and what is left as it was, the price bar's zero;
- the model takes three inputs and throws when they are not one design's, and why it does not
  price for itself (C2; ADR 0062 seam 1); fit is the one query's answer, and the priced list is
  that same answer;
- a body is named by the row's own labeller; rows are one per body, never aggregated (D2); an
  empty kitchen cannot be submitted (D14);
- what ADR 0065 d7 does and does not say, with the plan's own 2026-09-03 criterion beside it.

8D's close adds to the same record what the screen settles: the routes (D1, Q2), which body a
group's *Editează* selects (D3), the view-only scene (D4), and where the two sentences stand
(criteria 11–13). One record for the review step, not two.

**Five points S2 left open, ruled 2026-10-07, before S3.** S1 is `7fa5258`, S2 `cafcf95`, ADR 0148
`dee2c82` [relayed]. The implementer built the view-only scene and stopped at five things D4 and
the criteria did not settle. Read at `cafcf95`: `review/review-scene.tsx`, `scene/kitchen-canvas.tsx`,
`scene/kitchen-stage.tsx` [src].

1. ***Vezi în 3D* is built, as a link to the design's editor with nothing selected.** Frame 3A
   draws it on a block captioned *"randare finală · 3 unghiuri"*: a render seen from three angles,
   and a way from it to the model itself. That is what it does here. Its Romanian is the frame's,
   verbatim; the Russian is drafted under Q10. It is not redundant, because of ruling 1a.
   - **1a. The review's scene does not orbit, and a swipe over it scrolls the page.** D4 said the
     existing scene, mounted without picking; it did not say whether it turns. The frame says
     three angles, which the three chips are. And the canvas declares `touch-action: none`
     [src, the comment at `kitchen-canvas.tsx:90`; that a swipe is trapped as built is the
     architect's inference from it and was not measured in a browser], so a thumb that lands on
     it would not scroll a screen whose whole job is to be read downward. The views change by the chips; free looking is what
     *Vezi în 3D* opens. **D4 stands otherwise: a live scene, not a still.** A still would need a
     capture path M8 does not have.
2. **The marks on a body past its wall stay in the review's scene.** They are how the customer
   finds the body the refusal names, and ADR 0065 has the scene and this step read one answer.
   *Must not:* the scene marks a body the refusal does not name, or the reverse.
3. **One remembered view, shared with the editor. Intended.** It is the customer's camera, not a
   screen's; *Vezi în 3D* and *Editează* then open the editor looking where the review looked.
4. **Without WebGL the review is the editor's exit, whole: frame 2F.** Not the review with a gap
   where the scene was. The approved sentence on that screen is the rule: *"fără 3D nu există
   configurare reală, deci nici preț"*. A review would show a price for a configuration this
   device cannot show. Frame 2F's two exits and Q12's answer are unchanged. **So the probe belongs
   to the screen, not to the scene:** `ReviewScene` stops rendering `WebGLUnavailable`, which is a
   `<main>` and cannot sit inside another.
5. **Duplication: the probe is extracted now; the chips are not.**
   - *The probe* must move anyway (ruling 4). It becomes one hook beside `detectWebGLSupport` in
     `scene/webgl-support.ts`. The review's screen uses it in S3; the editor adopts it in S4,
     which owns `configure-screen.tsx`.
   - *The chips* are written twice, not three times, and the review styles its own, so the
     `classNames` prop goes and the chips take their classes from the review's stylesheet in S3.
     Moving the editor's chips and their styles now would disturb the tests that read
     `configure.module.css`. A backlog entry, with its trigger: a third place that draws them.

**A slice added: S2b, before S3.** Three production files, Light, no visual pass of its own (S3's
covers it).

| Slice | Does | Files (production) | Reading |
| --- | --- | --- | --- |
| S2b | The view-only canvas neither orbits nor takes a touch: a vertical swipe over it scrolls the page. `ReviewScene` no longer answers for a missing WebGL. One hook reports WebGL support | `scene/kitchen-canvas.tsx`, `review/review-scene.tsx`, `scene/webgl-support.ts`; `scene/kitchen-stage.tsx` only if the stage reads the controls | rulings 1a, 4, 5 above; ADR 0023 (why the canvas stops a touch from also clicking); ADR 0144; `kitchen-canvas.tsx:36-100`; `configure-screen.tsx:55-80` (the probe as the editor has it, read and not edited) |

*S2b's criteria.* (16) With the view-only canvas mounted in a page taller than the viewport, a
vertical swipe that starts on the canvas scrolls the page, and a drag on it does not move the
camera. The editor's canvas is unchanged: it orbits, and its tests are untouched and green.
(17) The three chips still change the view, and the view arrives where the editor's would for the
same chip. (18) `ReviewScene` renders nothing for a device without WebGL and no `<main>`.

**What changes in S3.** Its files are unchanged. It gains: the *Vezi în 3D* link, placed as frame
3A places it, with its leaf; the chips' classes from `review.module.css`; and criterion 19.

19. **Without WebGL, `/d/{id}/review` shows frame 2F's screen and nothing of the review**: no
    row, no figure, no call to action. While support is still being probed, the screen shows the
    editor's loading line and no figure. *Must not:* a `<main>` inside a `<main>`; a price on a
    device that cannot show the kitchen.

**What changes in S4.** It adopts the probe's hook in `configure-screen.tsx`, with no change in
what the editor shows. And it settles what the review knows about write access, which S1 left
open: **nothing, and it asks nothing.** The review never writes the design. Its call to action
waits only while the store holds an edit not yet saved, which can only be so after arriving from
the editor, where the probe has already answered.

20. The review sends no request to `/api/designs/{id}`. On a direct load its call to action is
    ready as soon as the page is. *Must not:* arriving from the editor, the review's hydration
    replaces a store that already holds this design, which would drop an unsaved edit and forget
    the probe's answer.

**For the visual reader, added to the line above** [the implementer's list, agreed]: the WebGL
context is released when the review is left; a client-side move between the editor and the review
never shows two live canvases; real touch on the chips, for size and for a tap that is not read as
a drag; a real tap on the scene selects nothing; the marks show in the review's scene; the
first-frame freeze (ADR 0144). And from ruling 1a: **a thumb swipe that starts on the scene
scrolls the page.** The unit tests cannot show these: the canvas there is a stub.

**S3 is dispatchable once S2b is in.**

**Owner questions for 8D: none new.** The open half of Q31 does not block it. The duplicated
sentence goes with Q9. What a refused stored row shows is not the owner's: the load-error page
already exists.

#### 8D — adjudication of adversarial QA, 2026-10-07

**State.** The wave's code is `7fa5258`, `cafcf95`, `b2b24e3`, `02e7fa0`, `75860c1` and a copy
change `2d05dac`; QA's tests are `95a72fb` [relayed]. QA is the first agent to run the wave in a
browser. **Five tests are left failing on four findings.** What held is QA's, relayed: the two
doors answer alike for every refusal; a non-visitor sends no query; the history; the save wait;
ruling 1a (a swipe on the scene scrolls the page, a drag turns nothing). **The tripwire of
criterion 12 was measured and not reached:** the bottom region in Russian with both sentences is
243.95 px, 28.9% of the viewport; with a conflicted save as a third sentence, 44.5%.

| Item | Class | Ruling |
| --- | --- | --- |
| QA1 `?settings=open` clicks a trigger that is still off, then removes the parameter | **Implementation defect** against criterion 5. **And a contract gap**: *"once on arrival"* did not say what arrival is while write access is unknown | E1 |
| QA2 in a U, *Editează* on a wall C group opens the editor with nothing selected | **Contract gap**, the architect's: criterion 5 and D3 did not meet the editor's own rule that a body on a cut wall is not selected | E2 |
| QA3 a review reached from a stale editor shows the older design, ready | **Contract gap**, the architect's: criterion 20 protected the store by id alone, and so protected a stale copy as it does an unsaved edit | E3 |
| QA4 the groups stand 0 px apart: a class the stylesheet does not define | **Implementation defect** | E4 |
| QA5 the conflict sentence names two controls the review does not have | **Contract gap** in criterion 4, which borrowed the editor's sentences | E5 |
| QA6, QA7 | Test-fidelity, closed by QA's own tests | Nothing owed |

**Rules.**

- **E1 — an arrival is honoured when it can be, once, and the parameter leaves only then.**
  `?select=` needs nothing and is honoured at once, as built. `?settings=open` needs the answer
  about write access, because the sheet's trigger is off until it comes
  [src `settings/global-settings.tsx:262`]. So: while the answer is awaited the parameter stays
  on the URL and nothing is clicked. When the browser may write, the sheet opens and the parameter
  is removed. When it may not, or the check fails, the sheet is not opened, since it is not
  openable read-only today; the parameter is removed and the editor's own notice says why
  nothing can be changed. *Once* means one outcome for one arrival. *Must not:* the parameter is
  removed before the outcome; the sheet opens a second time on a later render, a reload or a
  language switch.
- **E2 — arriving with a body selected means arriving where that body can be seen.** The editor
  keeps its rule: a body on a cut wall is not selected. So the arrival moves the view first. If
  the view the customer last stood at would cut the body's wall, the editor stands at **that
  wall's own view** (`wallA`, `wallB`, `wallC`); should that one cut it too, at the first of the
  room's views, in their order, that does not. Otherwise the view is left where it was. Then the
  body is selected. All of it is computable before the scene exists: a view carries its eye
  [src `three-adapter/src/stage.ts:228-232`], and `cutawayWallsFor` takes an eye and the room
  [src `three-adapter/src/cutaway.ts:42`]. Only a U cuts a wall at all [src, the same function].
  - *The remembered view* (ruling 3) becomes the one stood at. It is the customer's camera, and
    this is where it now is.
  - *What does not change:* tapping a body never moves the camera; changing to a view that cuts
    a selected body's wall still deselects it. Only an arrival chooses a view.
  - *It covers the refusal's links* (criterion 13): they arrive the same way. A refusal naming a
    body on wall C lands on it, selected and in sight.
  - *As a property:* for every generated U and every wall that holds a body, that wall's own view
    does not cut it. If one does and no other view serves, the arrival selects nothing, and that
    is a finding for the views, not for this rule.
- **E3 — the review shows the newest copy this tab can know, and never an older one as ready.**
  On every arrival the hydrator holds two copies: the store's, at the revision this tab last
  heard, and the page's, at the revision the server held when it rendered. It needs no request;
  criterion 20's *"sends no request to `/api/designs/{id}`"* stands.
  - **The store holds an edit not yet saved:** the store is kept. This is what criterion 20 was
    for. The call to action waits; the save succeeds, or meets a conflict (E5), which is how the
    editor itself learns of a newer copy.
  - **The store is clean and the page's revision is the greater:** the tab was stale. The page's
    copy replaces the store's. **A customer whose tab was stale sees the saved kitchen on the
    review, not the one this tab remembered.**
  - **The store is clean and the page's revision is the lesser or the same:** the store is kept.
    A page restored by Back or Forward can be older than the store: Next keeps a restored page's
    payload, and its own note on the client cache says that behaviour is not changed by the
    cache's lifetime [doc `next/dist/docs/…/staleTimes.md:36`, next 16.3.8].
  - *Why revisions may be compared.* A save sets `revision = revision + 1`
    [src `neon-configuration-repository.ts:295`], so the greater is the newer. They are compared
    as whole numbers that are never turned into a JavaScript `number` and never added to, which
    is what `design-revision.ts` forbids and why.
  - *What it does not close, and what does.* Another tab can save after this review has opened.
    The review cannot know. **8K refuses a request whose revision is not the stored one (D5)**;
    that is the line that keeps an offer from being asked for a kitchen that is not the saved
    one, and the review's rule only makes it rare.
  - **Criterion 20's *must not*, restated:** arriving from the editor, the review's hydration
    never replaces a store that holds an unsaved edit of this design, and never replaces a newer
    copy with an older one.
- **E4 — the groups are spaced as frame 3A spaces its blocks.** And a test fails when the screen
  names a class its stylesheet does not define, for every class the review's files name.
- **E5 — the review does not settle a conflict; it sends the customer to where it is settled.**
  With the save in conflict the call to action is off, and the sentence says that the kitchen
  was changed elsewhere and that the choice is made in the editor, with a link to it. The
  editor's own sentence, which names *reload* and *overwrite*, is not shown here. New wording, in
  both languages, under Q10's rule. A reload still works and is not advertised.

**The fix round** — five items, five production files.

1. **E1** (QA1). `configure-screen.tsx`.
2. **E2** (QA2). `configure-screen.tsx`; `scene/camera-preset-store.ts` only if choosing the view
   belongs beside the remembered one. No adapter change: `cutawayWallsFor` and the room's views
   are called as they are.
3. **E3** (QA3). `app/d/[id]/review/hydrate-and-review.tsx`; `store/configurator-snapshot.tsx`
   only if the guard's shape must change for the editor's and the share view's hydrators too,
   which then keep their behaviour.
4. **E4, E5** (QA4, QA5). `review-screen.tsx`, `review.module.css`; the message files as one
   leaf set for E5's sentence.
5. **Tests.** The implementer's own for E1–E5, the class check of E4 among them. QA's files are
   not edited by the implementer.

*Reading, implementer:* this adjudication; criteria 4, 5, 13, 20 and rulings 1a and 3;
`configure-screen.tsx:305-365` (`useHonourArrival`); `scene/kitchen-stage.tsx:360-375` (the cut
set and A8.3's deselect, read and not edited); `three-adapter/src/cutaway.ts`;
`settings/global-settings.tsx:80-120, 255-270`; `store/configurator-snapshot.tsx`;
`packages/persistence/src/design-revision.ts`; the staleTimes page named above; frame 3A
(`…Mobil.dc.html:994-1060`) for E4; QA's five failing specs under
`tests/e2e/qa-8d-review-*.adversarial*.e2e.spec.ts`; ADR 0113 and Q10 for E5's leaf.

**Then.** QA re-runs its five failing specs, re-aims `save-wait:293` to E3, and adds: an arrival
on each of a U's wall C groups and on a refusal's wall C body (E2); a review restored by Forward
after a later save, which must keep the newer copy (E3); the conflict on the review (E5). Then the
full e2e once, in both modes. **Then review:** the combined reviewer on the whole wave; the
security reader on S1 and on E3, which changes what a door puts in the store; the visual
verifier, whose brief gains one line: **spacing is measured, not judged by eye** — the gaps
between sections and between groups at 390 px, in pixels, beside the frame's own values.

**The shard budget.** Mobile shards stand at 120, 123, 112 and 114 of 125 after QA's additions
[relayed]. The re-run adds about five tests. QA runs `pnpm gate:e2e-shard-budget` after adding
them. If a shard goes over, **a fifth mobile shard is added** *(corrected 2026-10-08: it took
six; five left 135 tests on one shard, so the budget guard asked for six, as of `c62feb1`
[relayed])*, by the owner's standing rule that
the budget governs. That is a change to `ci.yml` and to the gate's own count, made by the
coordinator in its own commit before the push, not by the implementer inside a behaviour fix.

**The owner's copy change** (*chiuvetă* in Romanian; *шкаф* for *корпус* in three Russian lines;
relayed) **goes in as its own commit before the fix round**, so E5's new leaf lands on the lock
and the hashes as that commit leaves them. It is the owner's wording applied as given; the
implementer reports whether *spălător* in `room/generation-model.ts` and in the domain's
`commands/rejection.ts` is ever shown to a customer.

**Unmeasured, carried to the close-out as unproven** [QA's list]: criterion 15 in a browser; a
timing difference between the two doors; which body each overflow mark belongs to; pinch; iOS
Safari; a real runner; the save wait, the arrival, the screen and the scene at desktop width.

#### 8D — adjudication of QA's re-run, 2026-10-08

**State.** The fix round is `247d729`; QA's tests `a863ea3` [relayed]. The five specs that were
failing are green; one new test fails (QA8). E1–E5 held in a browser at 390 × 844 [relayed].
**QA2's cause is now established, and it was not the one this plan gave:** the overview never cuts
wall C. The stage's first cut is computed while the camera is still at its seating position, which
does cut it; one frame later it does not. The fix selects when the scene has come to rest, about
2.8 s after it mounts. E2's rule stands for the views that really do cut a wall: in a U, wall B's
view cuts C and wall C's cuts B.

| Item | Class | Ruling |
| --- | --- | --- |
| QA8 when the review replaces a stale store, one `GET /api/designs/{id}` goes out | **Implementation defect** against criterion 20, in E3's own fix. Its mechanism is read from source and not yet shown | E3a |
| QA9 a tap that lands before the scene rests is replaced by the arrival's body | **Contract gap** in E2: *"once"* did not say what the customer doing something first does to an arrival | E2a, fixed now |
| QA11 the conflict link lands on an editor that shows no notice until a body is selected | **Contract gap** in E5, which promised a place that says nothing. The editor drawing a conflict only in its panel predates the wave | E5a in this round; the editor's part to the backlog |
| QA10 an existing desktop spec failed once under `CI=1` and passed four times | Test-fidelity problem, not this wave's | Backlog, beside entry 125 |

**Rules.**

- **E3a — replacing a copy does not forget what this browser may do** (QA8). Whether this browser
  may write a design is a fact about the browser and the design, not about which copy of the
  design the store holds. When the review replaces a stale copy of **the same design**, the
  store's answer about write access is carried over as it was. It is `"checking"` only when the
  store held no answer for this design, and then no editor is mounted to act on it. Criterion 20
  stands as written: the review asks nothing; here it also unsettles nothing.
  - *The mechanism first.* It is inferred: the replacement sets `"checking"`, and the departing
    editor's probe, still mounted, runs on that value [src `hydrate-and-configure.tsx`, the
    effect's condition; `configurator-store.ts`, `hydrate`]. **The implementer first writes the
    test that mounts the editor's probe and then runs the review's replacement, and sees it fail
    on `a863ea3`.** If it does not fail there, the mechanism is another, and the implementer stops
    and reports before changing anything.
  - *Not required:* the departing editor's effect does not have to be taught to stop. With the
    answer carried, nothing tells it to start.
- **E2a — the customer's own act wins** (QA9). An arrival's selection waits for the scene to rest.
  If, before then, the customer selects a body, selects an empty space or clears the selection,
  the arrival's pending selection is dropped. That is an outcome: the arrival was honoured once,
  by being overridden, and the parameter leaves the URL as for any other outcome. *Must not:* a
  selection the customer made is replaced by one they did not.
- **E5a — the conflict link arrives where the conflict is on screen** (QA11). The editor draws a
  conflict, and its two controls, in the panel, and the panel needs a selection. So the link
  arrives with the first body in display order selected, by the same `?select=` every other link
  uses, and the notice with both controls is on screen without a further tap. *Recorded limit:*
  a kitchen with no body has no panel to open, and the link then lands on an editor that says
  nothing. *For the backlog, not 8D:* the editor shows a conflict only inside the panel. It is
  the question M4 left open, how a failed background write is told to the customer.

**The second fix round** — three items, three production files.

1. **E3a** (QA8). `app/d/[id]/review/hydrate-and-review.tsx`. The failing test first.
2. **E2a** (QA9). `configure-screen.tsx`.
3. **E5a** (QA11). `app/d/[id]/review/review-screen.tsx`.

*Reading, implementer:* this adjudication and the one above it (E2, E3, E5);
`app/d/[id]/hydrate-and-configure.tsx:55-90` (the probe, read and not edited);
`store/configurator-store.ts`, `hydrate` and `applyWriteAccess`; `configure-screen.tsx`,
`useHonourArrival` as it now stands; QA's `save-wait` spec, the test *"with the design changed
and saved in another tab…"*; criterion 20.

**The stopping rule for 8D.** This was the wave's second QA pass, and review has not begun. After
the second fix round QA makes **one** pass: the QA8 spec, a test each for E2a and E5a, its E1–E5
specs once, the full e2e once in both modes. A new finding is fixed inside 8D only if:

- (a) the two doors answer differently for some request, or the review sends a request criterion
  20 forbids; or
- (b) a rule E1–E5, or a criterion as restated, fails in a browser at 390 × 844; or
- (c) something an earlier pass showed holding no longer holds.

Anything else is written down with an owner and its trigger (ADR 0118), and the wave goes to
review in that same pass. The architect classifies; QA's freedom to look is not narrowed.

**After a green pass, in this order:** the combined reviewer on the whole wave; the security
reader on S1, on E3 and on E3a, since both change what a door leaves in the store; the visual
verifier. **The visual brief carries QA's numbers as values to measure again, not to trust:**

- the bottom region in Russian with three sentences and the link: 377.5 px, 44.7% of 844. That is
  45 px short of criterion 12's half. **If the verifier's own measurement reaches half, the wave
  stops there** and the design returns to planning; no sentence is shortened to pass.
- spacing: 15 px between groups, 15 px between the page's blocks, 10 px between rows.

**Unmeasured after this pass, for the close-out** [QA's list]: QA8's mechanism by instrumentation,
until the test above shows it; a real touch before the scene rests; E1–E5 at desktop width; the
whole suite under `CI=1`; and the list above.

#### 8D — adjudication of review round 1, 2026-10-08

**State.** QA's confirmation is green and is `04883c9`; a StrictMode fix is `67770c3` [relayed].
The coordinator ran at `04883c9`: web vitest 6106 passed, typecheck and `format:check` exit 0
[relayed]. Three reviewers reported. **Combined: approve, with should-fix. Security: approve, four
notes. Visual: the tripwire held, seven findings, and four departures from the frames.** The tree
is clean and frozen.

**The tripwire, by the visual verifier's own measurement** (production build, 390 × 844, real
touch) [relayed]: Russian with the conflict sentence and its link, **377.52 px, 44.73%**. Under
half. Spacing against the frame's own values: 15/15, 15/15, 10/10, 10/10; padding 16/18.

| Finding | Class | Ruling |
| --- | --- | --- |
| Combined R1.1: in a U, `?select=` is taken off the URL when the wait is armed, 2.8 s before any outcome | **Implementation defect** against E1 and E2a | G1, this round |
| Combined R1.2: a test of that which cannot fail | Test-fidelity | Fixed with G1 |
| Combined R1.5: the arrival hook is 190 lines inside the screen's file | Quality, should-fix | This round, with G1: it is being changed anyway |
| Combined R1.3: without WebGL the arrival waits for a scene that never comes | Note | This round, as G1's third outcome |
| Combined R1.4: a two-finger pinch can read as a tap and drop the arrival | Inference, unmeasured | Recorded limit |
| Combined R1.6–R1.9: comment length, a stale word, a second WebGL probe, plan ids in test titles | Nits | This round, in files already open |
| Visual V3: after *Perete A* on the review, a wall C body arrives selected and not on screen | **Contract gap** in E2, the architect's: *cut* is not the same as *not shown* | G2, this round |
| Visual V4: the editor's and the review's overview of a U look different | Not a defect of 8D | See below |
| Visual V2: keyboard focus ends up under the pinned region | **Implementation defect** against criterion 12's *"hides"* | G3, this round |
| Visual V1 (a stray hairline), V6 (the waiting sentence drawn as a refusal) | Nits | This round |
| Visual V5 (two words without diacritics, approved copy); V7 (the locale chip's height, a shared component) | Not this wave's | V5 to the owner with Q9; V7 to the backlog |
| Security R1.1: the proxy's list decides locale routing, not reachability | Note with a consequence | Written into 8K, 8L, 8M; criterion 2 clarified |
| Security R1.2: the shared load takes an id of any shape | Predates the wave; no oracle [the reviewer's inference] | Not this round: 8L S2, with its reason below |
| Security R1.3 (a carried write-access answer can be stale), R1.4 (a React warning between two designs) | Accepted, recorded | In the wave's ADR |

**Rules.**

- **G1 — the parameter leaves at the outcome, and there are four outcomes.** The body is selected
  when the scene rests; the customer acts first (E2a); the body is not in the design; **no scene
  will ever exist** on this device. Until one of them, `?select=` stays on the URL, so a reload
  ~~or a language switch~~ in the wait starts the same arrival again and does not lose it.
  **(Restated 2026-10-08, review round 2: the language switch is withdrawn from this sentence. The
  language menu's links carry the path and no query, which is backlog 73; see *Review round 2 and
  the close*.)** *Must not:*
  the parameter is gone while its arrival is still pending. The hook moves to its own file beside
  `use-back-guard.ts`.
- **G2 — an arrival with a body stands at that body's own wall view. Always.** This replaces E2's
  condition. ~~If the view the customer last stood at would cut the body's wall…; otherwise the
  view is left where it was.~~ E2 asked whether the remembered view *cut* the wall. A view can
  leave a wall whole and still not show it: from wall A's view a U's wall C is off the screen.
  Asking instead whether a view *shows* a wall needs a definition for each shape and each screen,
  and the visual pass found the overview of a U on a phone is itself a close crop of wall A. The
  wall's own view is ~~the one made to show it~~ **the one whose subject is that wall** (corrected
  2026-10-08 by QA15: at 390 px it does not frame the wall's ends; see *QA15 classified*), in a
  straight room, an L and a U alike.
  - *What the rule promises, restated.* The body is selected and the camera is on its wall. On a
    phone the editor's sheet then covers most of the scene, as it does for any selection; that is
    the editor's viewing model and not this rule's.
  - *Unchanged:* tapping a body never moves the camera; the remembered view becomes the one stood
    at; E2a.
  - *The property stays:* in every generated U, a wall's own view does not cut that wall. QA
    measured it for one U (wall B's view cuts C, wall C's cuts B, neither its own).
- **G3 — nothing that has focus is under the pinned region.** For every link and control on the
  review, when it takes keyboard focus its box is wholly above the region's top edge, at 390 × 844
  and at desktop widths, in both languages and with one, two and three sentences in the region.
  How is the implementer's; a layout in which the list cannot run under the region satisfies it
  without a number to keep in step.

**V4 — the two overviews.** They are one preset: the review and the editor both hand the stage
`{ kind: "preset", id }` from the one remembered view [src `review/review-scene.tsx:56-59`]. The
canvases differ in shape, tall on the editor's phone screen and wide and short on the review, and
[inf] the framing follows the canvas. Criterion 17 is restated to what it can mean: **the same
chip stands the camera at the same eye and target on both screens; what the canvas then crops is
its own.** That the editor's overview of a U on a phone crops to wall A is the editor's, noticed
here and not caused here: a backlog entry.

**Security R1.2, not in this round, and why.** It is the same on both doors, it is no oracle, and
the stopping rule's three arms do not hold. It is also not free: ids that are not a design id's
shape stand in existing tests. **Owner: wave 8L, slice S2**, which adds the next caller of the
shared load: there an id that has not the shape of a design id is refused as *unavailable* before
any query, in the one function, for every door at once.

**The four departures from frames 3A and 3B.**

| Departure | Ruling |
| --- | --- |
| The scene is 240 px tall; the frame draws 158 px | **A defect against the frame; fixed now, to 158 px.** Ruling 1a made the scene live and set no height, and ADR 0104 makes the frame the measure. The review is for reading the list; *Vezi în 3D* is for looking. The owner may ask for more at the hand check |
| The top bar has no title and no material pill | **The title is drawn now**, as the frame words it. **The pill is not drawn on screens 3–5 in M8**, the architect's ruling, recorded as a departure with its reason: on the editor the pill is the control that opens the settings sheet, which the review must not have, and its words are already on this screen in the settings row. For the owner at the hand check |
| A row is one line; the frame draws a second (*"800 mm · alb mat"*) | **A contract gap, the architect's, and not a fix-round item.** D2 and 8C's criterion 1 made the review's rows the breakdown's, which have no second line; the frame's has the width and the cabinet's own finish or handle, which the product brief also asks of this step. **Owed, as wave 8D2** |
| The bottom region: *de la* beside the figure in Romanian, the figure above the call to action in Russian; the frame has a caption over the figure and the call to action at the right | **Wave 8D2**, with the row |
| Desktop: a centred 640 px column | **Accepted and recorded.** No desktop frame exists for screens 3–5; the phone's layout made responsive is the rule (`milestones/README.md`) |

**The fix round** — five items; six production files, one of them for a comment only.

1. **G1 and G2** (combined R1.1, R1.2, R1.3, R1.5; visual V3). A new
   `app/configurator/configure/use-honour-arrival.ts`; `configure-screen.tsx`.
2. **G3** (visual V2). `app/d/[id]/review/review-screen.tsx`, `review.module.css`.
3. **The frame's values that are a line each.** The scene at 158 px; the title in the top bar,
   its leaf in both languages; V1's hairline; V6, the waiting sentence no longer drawn as a
   refusal. `review-screen.tsx`, `review.module.css`, the message files.
4. **Nits in files already open** (combined R1.6–R1.9). `review/review-scene.tsx` (the stale word;
   no second WebGL probe under a screen that already knows); `hydrate-and-review.tsx` (its
   comment); the test titles named by the reviewer.
5. **Tests**, the implementer's own, R1.2's among them rewritten so it can fail.

*Reading, implementer:* this adjudication and the two above it (E1, E2, E2a); the three reviewers'
reports; `configure-screen.tsx:320-440`; `use-back-guard.ts` (the shape the new file follows);
`three-adapter/src/stage.ts:228-300` (the views and their ids); frame 3A
(`…Mobil.dc.html:969-1070`) for the height and the top bar; ADR 0136; criteria 12, 13, 17.

**Then.** QA re-runs only what the round touched: the arrival specs in both modes; a spec for
V3's case (a chip on the review, then a body on another wall, in a U and in an L); a spec that
tabs through the review and finds no focused box under the region. Then the combined reviewer and
the visual verifier each re-check their own findings and nothing else. The security reader has
nothing to re-read. **The stopping rule above still applies.**

**For the owner, none of it before the wave closes.** At the hand check: the scene's height; the
pill left out of screens 3–5; and that the rows' second line and the bottom bar's layout come in
8D2. With Q9, as before: the sentence printed twice and the two words without diacritics.

#### 8D — QA15 classified under the stopping rule, 2026-10-08

**State.** The review fix is `8c53977`; QA's tests `12a506b` [relayed]. G1 and G3 hold in a
browser. Two tests are left failing on one finding, QA15: an arrival stands at the body's own wall
view, selected, and at 390 px some bodies are wholly outside that view's frame. In a U the first
base body of wall A spans −2.30 to −1.14 where the frame is −1 to 1, and the refusal's wall C body
1.19 to 2.30; six of eight first bodies straddle the edge [QA's measurement, relayed].

**Classification: none of the three arms. Recorded, not fixed in 8D.** By the text as it stands:

- **(a)** The doors and the review's requests are not involved.
- **(b)** No rule or restated criterion fails. G2 promises that *"the body is selected and the
  camera is on its wall"*: QA found exactly that, at rest, for every U group and three L
  journeys. Criterion 13 promises a link *"opening the editor with that body selected"*: met.
  Criterion 17, as restated, promises the same eye and target for the same chip: met. The two
  red tests assert *on screen*, which the coordinator asked QA to measure and which no rule in
  force promises.
- **(c)** Nothing that held has stopped holding. A wall's view frames a wall this way for any
  selection made any way; the arrival did not make it so.

**A correction to G2's reasoning.** It said the wall's own view *"is the one made to show it"*.
**At 390 px that is false for bodies near a wall's ends.** The rule stands, because no other view
is better and a condition on *shows* was the thing G2 gave up; its reason is restated: the wall's
own view is the one whose subject is that wall. And criterion 13's purpose is only half served:
the body is selected and the panel is open on it, where it is resized or removed, and it may not
be visible.

**This is backlog 16, which the owner has already ruled, and it is wider than that entry says.**
Entry 16: *"Ruled by the owner, 2026-09-05: fit-to-run framing on the Perete A preset, so the run
end is on screen at 390 px"*; *"Not built yet"* [doc `backlog/open.md:247-251`]. QA15 and the
visual pass's V4 are the same matter on more views. **For the scribe, entry 16 gains:** the
overview of a U on a phone crops to wall A (V4); a wall's own view leaves bodies at the wall's
ends outside the frame, with QA15's figures; that it now bears on the review's links, which land
on a selected body the customer may not see; and that the ruled answer, framing fitted to the
run, has to cover walls B and C and the overview, not wall A alone.

- *Why not in 8D.* The fix is how the stage frames a view on a tall, narrow canvas. That is the
  3D adapter's, with anchors and a fidelity gate, at the Full tier; this wave is Light, and D4
  keeps every M8 wave out of the adapter.
- *Owner and trigger.* It is not waiting for a trigger: it has happened and is ruled. It waits for
  a wave. **Whose call: the owner's, at the hand check, where they should see it:** a customer
  who taps a named cabinet lands on an editor whose panel is open on it while the cabinet may be
  off the canvas. *Recommended:* its own wave before M8's phone gate (8T), with D4 lifted for that
  wave by name, since 8T walks a refused kitchen back to the body to be fixed.

**What QA does with its two red tests.** It re-aims each to what G2 promises: the wall's own
view, the body selected at rest, the remembered view updated. And it keeps the on-screen
measurement beside each as a **declared deferral**, in the form that goes red on the day the
framing is fixed (`engineering-conventions.md`, *A deferred test has two shapes*), naming backlog
16. The measurement is not lost and does not hold the wave.

**The shard budget.** Mobile shard 3 is at 125 of 125 [relayed]. The re-aim adds tests. **The
coordinator adds the fifth mobile shard now**, in its own commit, to `ci.yml` and to the gate's
count, before QA touches the specs again.

**After that:** the wave goes on as the review adjudication set it: the combined reviewer and the
visual verifier re-check their own findings, and it closes.

*Corrected 2026-10-08:* the sentence above about a fifth shard was short by one. **Mobile e2e runs
in six shards** as of `c62feb1`, at 83, 79, 81, 83, 95 and 63 of 125 [relayed]: with five, one
shard held 135.

#### 8D — review round 2 and the close, 2026-10-08

**State.** HEAD is `9f4c123`: QA's re-aim, green; e2e in dev mode whole, mobile 482 and desktop
201 passed; web vitest 6121 passed, typecheck and `format:check` exit 0 [relayed, coordinator-run].
**Combined reviewer: approve. Visual verifier: its findings closed; the tripwire unchanged at
377.52 px, 44.73%.**

**R2.1 — a language switch during the wait drops the arrival. None of the three arms; recorded.**
G1 said a reload *or a language switch* in the wait starts the same arrival again. The reload
does; QA showed it. The language switch does not: the menu's links carry the path and no query
[src `configure/locale-menu.tsx:139`], so the parameter is gone with the navigation. Nobody has
seen it in a browser; the reviewer read it from source and QA could not send a switch in the
wait.

- *Why recorded and not fixed here.* Arm (b) needs a failure in a browser, and there is none.
  More to the point, **this is backlog 73**, the same line of the same file, found in M7:
  *"`locale-menu.tsx` links to `menu.pathname` without the room's query string"*. There it loses
  a typed room; here it loses a pending selection for the length of the wait (about 5 s in the
  verifier's eleven arrivals [relayed]), after which the customer taps the body. One fix serves
  both, and it belongs with the entry that loses work.
- *What changes in the text:* G1's sentence is restated above to the reload. Its *must not*
  stands for the hook, which is all it governs: the hook removes a parameter only at its outcome.
- *Owner:* whoever takes backlog 73. *For the scribe, entry 73 gains:* the editor's two arrival
  parameters are dropped by the same links. The menu is drawn on three screens: the room entry,
  the editor and the review [src `room-screen.tsx:149`, `configure-screen.tsx:178`,
  `review-screen.tsx:105`]. *What must not change when it is fixed:* the switch still *"changes the
  language and not the place"* [src `i18n/use-locale-menu.ts:31`], so the path is the same page's;
  the review, which has no query of its own, gains none; and a parameter the hook has already
  removed does not come back through the link. That hook's comment also calls `/d/{id}` *"the only
  route that renders this menu"*, which three call sites contradict; it is corrected with the fix.

**The two leftovers.** Two doc comments in `use-honour-arrival.ts` still run past ADR 0136's
length: a nit, trimmed by the next wave that opens the file, and named in the close-out so it is
not rediscovered. The visual verifier's judgement that the 44 px chips cover about a quarter of
the 158 px scene: **to 8D2**, which is in the review's stylesheet anyway, and to the owner at the
hand check with the scene's height, since the two are one question.

**The wave may close.** No finding is open under the stopping rule.

**What 8D's close-out records, beyond the usual.**

- **In ADR 0148, added to the review step's record:** the routes (D1, Q2); which body a group's
  *Editează* selects (D3); the view-only scene (D4) with rulings 1a, 2, 3, 4; criteria 11–13 as
  measured; and the rules as they finally stand — E1; **G2 in place of E2**; E2a; E3 and E3a; E4;
  E5 and E5a; **G1 restated to the reload**; G3. With each superseded wording struck, not removed.
- **The architect's rulings the owner may overrule:** the scene does not orbit; without WebGL the
  review is frame 2F's exit whole; the scene is 158 px, the frame's; no material pill on screens
  3–5; the review shows the newest copy the tab can know (E3); an arrival always stands at the
  body's own wall view (G2); the customer's own act cancels a pending arrival (E2a).
- **The hand-check list for the owner:** the scene's height and the chips over it; the pill; that
  the rows' second line and the bottom bar's layout come in 8D2; **backlog 16 as it now shows: a
  customer who taps a named cabinet lands with it selected and, on a phone, not visible** (the
  visual verifier: eleven arrivals, *"Body visible: no"* in every one); with Q9, the sentence
  printed twice and the two words without diacritics.
- **Backlog:** 16, widened (the U overview's crop; the wall views' ends; QA15's figures; that it
  bears on the review's links); 73, widened (R2.1); the editor's conflict notice shown only in the
  panel (QA11); the locale chip's height (V7); a faint line at 1440 px the verifier could not
  attribute; QA10 beside 125; the chips written twice (ruling 5); the two long comments.
- **Wave 8D2's scope:** the rows' second line; the bottom bar as the frame; the chips over the
  scene; the pill if the owner asks for it.
- **What 8K, 8L and 8M inherit from the security review:** each new page calls the shared owned
  load itself; the id's shape goes into that one function in 8L S2; and 8K's list of what the
  endpoint must enforce. Each is already written into its wave.
- **Named as unproven, not as clean:** criterion 15 in a browser; a timing difference between the
  doors; which body each overflow mark belongs to; a real touch before the scene rests; a language
  switch in the wait; pinch; iOS Safari; a real runner; the whole suite under `CI=1`; the
  first-frame freeze and the release of the WebGL context, which the verifier did not confirm.

#### 8D as built — 2026-10-08

**Done.** Branch `m8-review-contact-success`, local, **not pushed**. HEAD `0ddbf65` at the time of writing
(the docs commit that holds the close-out list); the wave's last code and test commit is `9f4c123`. Base `7af6737`.
Commits, oldest first [coordinator-run, from the brief; the roles are the brief's]: `7fa5258` S1, the gated route;
`cafcf95` S2, the view-only scene; `b2b24e3` S2b, no orbit and the WebGL hook; `02e7fa0` S3, the screen;
`75860c1` S4, the editor's side; `2d05dac` copy (*dulap* in the settings heading and the two sink extras);
`95a72fb` QA pass 1 (red: five tests, four findings); `a04a1fc` copy (*chiuvetă*; *шкаф*); `247d729` fix round 1
(E1–E5); `a863ea3` QA re-run (red: QA8); `7261f82` fix round 2 (E3a, E2a, E5a); `52958da` QA final (red in dev:
QA12); `67770c3` the StrictMode fix; `04883c9` QA confirmation (green); `8c53977` the review fix (G1–G3; the
frame's scene height and title); `12a506b` QA check (red: QA15); `c62feb1` CI, the mobile e2e project in six
shards (a coordinator-only change); `9f4c123` QA re-aim (green). The plan's adjudications are the `docs:` commits
between them. ADR 0148 is `dee2c82`, and its Amendment A is written with this close-out.

**What shipped.** `/[locale]/d/{id}/review`, gated through the one owned load the editor's page also uses, and
the proxy's locale routing for `…/review`, `…/contact` and `…/done`; screens 3A and 3B as one page with a pinned
bottom region; the view-only scene with its three chips and *Vezi în 3D*; the editor's side (*Verifică designul* a
link; `?select=` and `?settings=open` honoured once on arrival). The rules, the reasons, the alternatives not
taken, the limits and the unproven list are **ADR 0148 Amendment A** and are not restated here.

**Evidence, with who ran it.**

- [coordinator-run, at `9f4c123`] `apps/web` vitest exit 0, 329 files, 6121 passed; web typecheck exit 0;
  whole-tree `pnpm format:check` exit 0. The shard-budget guard and its own tests exit 0 at `c62feb1`. **Not run:**
  `pnpm check`, `pnpm ci:local`, a build. **Nothing has run on a CI runner since the branch was cut, so the
  six-shard workflow and the earlier CI step change are unproven there.**
- [QA-run, six passes, a real browser] At `9f4c123`: e2e in dev mode in full, mobile 482 passed, 0 failed,
  2 skipped, desktop 201 passed. Under `CI=1` a subset (the 8D specs and the back-guard specs), mobile 91 passed,
  desktop 12 passed. **The full suite under `CI=1` was green at `7261f82` (mobile 480 passed, desktop 201 passed)
  and has not been repeated at HEAD.** Shard budget: desktop 69 / 70 / 62 of 70; mobile 83 / 79 / 81 / 83 / 95 /
  63 of 125. Measured at 390 × 844: the two doors answer with equal status, headers and refusal markup for no
  cookie, a malformed cookie, a foreign visitor and an unknown id in ro and ru; with the real repository and the
  socket replaced, 17 non-visitor cookies × 10 ids sent 0 queries and a visitor sent exactly 1 per door; the
  pinned bottom region in Russian is 243.95 px with two sentences (28.9% of 844) and 377.5 px with three and the
  link (44.7%); 24 stale replacements under eight workers sent 0 requests (21 of 24 red with the fix reverted);
  the wall C arrival's cause is the stage's first cut computation running with the camera at its seating position.
- [reviewer-run] Combined: round 1 approve with should-fix, round 2 approve. Security: approve, four notes,
  *"the review door upholds ADR 0114 d5 exactly as the editor's does, by construction"*. Visual: two rounds on a
  production build in Chromium at 390 × 844 with real touch; the bottom region's largest measured height 377.52 px
  (44.73% of 844), unchanged between rounds; spacing 15 / 15 / 10 px and page padding 18 px, matching the frame;
  the scene 158 px; V1, V2, V3 (as to the view) and V6 closed.

**Review rounds and material findings.** QA pass 1: four findings (E1–E5 followed). QA's re-run: QA8 (a request
the review must not send), fixed as E3a. Review round 1: R1.1 (a parameter taken off the URL too early; G1), visual
V3 (a body not on screen after a wall change; G2), V2 (focus under the region; G3), and the frame's scene height
and title. QA15 (a body outside the frame at its wall's own view) was classified under the stopping rule as none of
its arms and recorded as backlog 16's matter. Review round 2: R2.1 (a language switch in the wait), recorded as
backlog 73's. No finding is open under the stopping rule.

**Deviations, with rationale** (all in the plan's adjudications): E2 replaced by G2 (a rule about *cut* walls was
the wrong question); G1 restated to the reload; criterion 17 restated (the same eye and target, not the same
crop); criterion 2 clarified (the proxy's list is not a gate); the scene 158 px and no material pill on screens 3–5
(frame fidelity); the rows' second line and the bottom bar's layout moved to **wave 8D2**; the fifth mobile shard
became the sixth (five left one shard at 135).

**Named interims 8D leaves.** *Cere oferta* leads to the existing placeholder contact page until 8L; the proxy
admits `d/{id}/contact` and `d/{id}/done`, which answer not-found until 8L and 8M (as the plan states them); no
limiter stands in front of the route until 8G; the not-included list is slot text (Q9); desktop is the phone's
layout at 900 and 1440 px.

**Documentation updated.** ADR 0148 Amendment A; ADR 0147 Amendment A; the decision index and `SUPERSESSIONS.md`;
this file; `docs/STATUS.md`; `docs/backlog/open.md` and `docs/BACKLOG.md` (16, 73, 100, 106, 124, 125 and five
new entries); `docs/milestones/M9-delivery-preparation.md`; `docs/best-practices/ci-and-local-gates.md` (checked).

**Deferred, with owner or wave.** Wave **8D2** (the rows' second line, the bottom bar, the chips over the scene;
the pill if the owner asks). Backlog 16 as it now shows, **the owner's call at the hand check; the architect
recommends its own wave before 8T.** Backlog 73 (whoever takes it). The id's shape in the shared load: **wave 8L,
slice S2.** 8K, 8L and 8M each call the shared owned load themselves (written into each). The remaining items are
backlog entries 124, 125 and five new ones.

**Mail provider.** The plan already records that the owner chose Resend knowing it stores account data and 30 days
of mail content in the United States (*The owner's answers to Q29, Q31 and Q32*, "Confirmed later the same day");
the brief's account of the owner's "yes for resend" agrees with it, and nothing was added to that section.

### 8D2 — screen 3 against its frames (added 2026-10-08)

*Goal.* The review's rows and its bottom bar read as frames 3A and 3B draw them. ~~**Not started;
follows 8D's close.**~~ ~~**S1 committed `3ffad38`, S2 in hand (2026-10-08).**~~ **DONE 2026-10-08, commits
`3ffad38` … `0fad22c`, not pushed; see *8D2 as closed*.** *Tier: Light + visual*, with QA owning the parity of the new line.
*Why its own wave:* it changes the review's model, which 8C closed and ADR 0148 records, and 8D
has had its two QA passes and its review.

| Slice | Does | Files (production) | Reading |
| --- | --- | --- | --- |
| S1 | A row gains the frame's second line: the body's width and, where it has one, its own finish or handle. The first line is the body's name. The amount stays the breakdown's | `review/review-model.ts`, `review/review-groups.tsx`, `review.module.css`; `i18n/content.ts` and the message files if a leaf is needed | frames 3A, 3B (`…Mobil.dc.html:1012-1126`); D2; ADR 0148; ADR 0099 (a colour at two levels, the cabinet's wins); ADR 0033 (the label); `queries/design-projection.ts` (`DisplayEntry`: `widthMm`, `finish`, `handle`); `resolved-finish.ts`; the `finish` leaves |
| S2 | The bottom bar as the frame: a small caption over the figure, the call to action at its right, in both languages | `app/d/[id]/review/review-screen.tsx`, `review.module.css` | frame 3A (`:1063-1068`); criterion 12 of 8D and the tripwire; `price/price-bar.tsx` |

*Criteria.* (1) For every generated kitchen, each row's second line states that body's width as
the projection holds it, and its finish or handle exactly when the body carries its own;
*must not:* a finish is shown that the body does not wear (ADR 0099), or a line is composed by
the screen. (2) The amounts, the order and the refusal's names are unchanged: 8C's parity with
the breakdown still holds for amounts and order, ~~and the name in a refusal still equals what the
row calls the body~~ **and (restated 2026-10-08, see *S1 as built*) a refusal names a body by the
row's whole label, the name and the width together, which the row now draws over its two lines:
for every body, the label is the first line's name and the body's width through the breakdown's
own label leaf, and the second line's first fact is that same width.** *Must not:* a refusal
names a body by the first line alone, so that two bodies of one name and different widths read
alike; or the name and the label are read from the entry by two routes. (3) D2 stands: one row per body, never *"2 × 800"*. (4) The bottom region is
re-measured in Russian with three sentences; criterion 12's half still binds, and the wave stops
if it is reached. (5) *Must not:* ~~the breakdown or the price bar changes~~ **(restated
2026-10-08, review R1.1) what the breakdown and the price bar print changes. The proof is that
their own tests and both parity files pass untouched. A change to a function they call that
alters no string they print is not what this forbids.**

*Added 2026-10-08, from 8D's second visual pass.* The three view chips, 44 px each, cover about a
quarter of the 158 px scene [the verifier's judgement, relayed]. S2 looks at where they stand, and
its capture shows the scene with them. Whether the scene should be taller is the owner's, at the
hand check; the chips keep their touch size either way.

*Open, for the owner, with the hand check of 8D:* whether the material pill belongs in the top
bar of screens 3–5. If yes, it is a third slice here.

*QA reading:* the criteria; 8C's parity files (`qa-8c-parity-with-the-price-surfaces`); ADR 0099;
*S1 as built*, below. **Added 2026-10-08, S1's own weakest point, agreed:** S1's test reads a
finish's and a handle's name from the message files by the pairing the code uses, so a wrong
pairing present in both passes. QA owns a second route: a literal table, entry id to approved
word, for at least one finish of each material and for every handle, in both languages; and it
confirms the generated kitchens include a body wearing its own free colour.
*Combined reviewer:* the slices' files; ADR 0148. *Visual:* frames 3A and 3B, rows and bottom
bar, at 390 × 844 in both languages, measured.

#### 8D2 — S1 as built, and two readings, 2026-10-08

S1 is `3ffad38` [ran: `git log`]. The row's two lines are a map beside the rows,
`AvailableReview.rowDetails`, so `groups` is still the breakdown's and both parity files pass
untouched [relayed, coordinator-run: web vitest 6147 passed, typecheck exit 0]. **No fix is owed
before QA.**

**Reading 1 — what a refusal calls a body. Confirmed; criterion 2 restated above.** A refusal
keeps the row's whole label, *"Dulap bază 3 sertare 600"*, by the one labeller ADR 0148 decision 4
names [src `review-model.ts:296`]. The first line is `describePlacementName`, the same
`bodyLabel` the labeller wraps [src `price-breakdown-model.ts:212-229`], and S1's test asserts
that the label is that name and the width [src `review-row-detail.test.ts:197-206`].

- *What this changes, said plainly:* before S1 a refusal's link and its row printed one string.
  Now the row prints the same two facts in the same order over two lines, and the width gains its
  unit: *"Dulap bază 3 sertare"* over *"600 mm"*. They are no longer the same string on screen.
- *What ties a named body to its row* is therefore **the mark, not the words**: criterion 13 of 8D
  has each named body's row marked, and the row is described by the refusal's sentence
  [src `review-groups.tsx:140-150`]. It always was the mark for two alike bodies, which one label
  cannot tell apart. The words help; no criterion rests on them matching character for character.
- *For the scribe, at this wave's close:* ADR 0148 decision 4 says *"the name in the refusal
  equals the row's label"*. That stays true of the value. A dated note records that the row draws
  the label over two lines since 8D2.
- *For the owner's hand check, an observation and not a defect:* a refusal reads *"… 600"* and the
  row beside it *"600 mm"*. Whether the refusal should carry the unit is the owner's; it would
  change the breakdown's own label leaf or need a new one.

**Reading 2 — a body's own free colour is printed as its value. Stands as a named interim; the
wording is the owner's.** The precedent is weaker than it was put to me. The settings pill does
not print the value: it draws a swatch, and the value is what a screen reader hears, *"for a
colour the pill only draws"* [src `settings/global-settings-model.ts:573-583, 657-663`]. The leaf
is `{colourValue}` and words nothing [src `messages/ro.json:295`]. So *"600 mm · #a1b2c3"* is the
first place a customer **reads** a colour value, and frame 3B names a finish in words (*"alb
mat"*, *"stejar"*, *"grafit"*) [src `…Mobil.dc.html:1012-1126`].

- *Why it stands until the owner speaks:* criterion 1 has the line state a body's own finish, and
  leaving it out would show a body in its own colour as one on the kitchen's. A free colour has
  no approved name. Calling it by the nearest decor's would be the nearest-finish mapping the
  owner rejected (ADR 0057, reaffirmed 2026-09-05; ADR 0078) run the other way [inf: those
  records rule on a finish, not on a name]. The value is the one thing that is true and invented
  by nobody.
- *Not ruled, for the owner at the hand check:* the value as built; a word without the value,
  which needs a new approved leaf in both languages; or the colour drawn, which no frame shows on
  a row. I recommend the first until the owner asks otherwise, and it is not mine to settle.
- *For the visual pass:* capture one row with a free colour in each language.

#### 8D2 — S2 as built, and three rulings, 2026-10-08

S2 is `76df1b8` [ran: `git log`]. **Nothing in it has been seen in a browser**: every width and
height below is the implementer's arithmetic from the styles [relayed], and QA and the visual pass
measure them. Web vitest 6155 passed, typecheck exit 0 [relayed, coordinator-run].

**Ruling 1 — the Russian call to action stands on two lines. Accepted as built; a named departure
from frame 3A; not a blocker; shown to the owner at the hand check.** For the record: the
implementer was told to stop and report if the row did not fit, and built the wrap before it was
ruled. The ruling accepts the result; it does not make that the way to get one.

- *What it is:* *"Запросить предложение"* breaks at its space inside the 52 px button; the words,
  their size and the button's height are the approved ones. The frame draws one line because the
  Romanian fits on one [src `…Mobil.dc.html:1063-1068`]; it draws no Russian.
- *Why this and not the others.* A shorter Russian label is copy, and the owner's. The figure
  above the button in Russian only is a layout that forks by language, is what 8D had, and made
  the region 33 px taller where criterion 12's half presses hardest. A smaller or narrower figure
  shrinks the one thing the bar is for. The wrap changes no word and no size, and by arithmetic
  the Russian region with three sentences falls from 377.5 px to about 344.5 px.
- **Criterion 6, added.** At 390 × 844 in Russian the label is whole on exactly two lines, broken
  at its space; the button is 52 px tall; the figure is on one line; the bar does not scroll
  sideways. In Romanian the label is on one line. *Must not:* a word is broken, clipped,
  ellipsised or set smaller; the figure wraps or is cut; the button grows past 52 px. Checked with
  the longest figure the price book can produce, not only the seeded one.
- **A limit, stated and not measured.** Nothing lets the button break a word
  [src `review.module.css:459-474`: no `overflow-wrap`], so below some width *"предложение"*
  overruns its button instead. By the relayed estimates that is a content width under about 283 px
  with a six-digit figure and about 301 px with seven [inf, my sum]; 390 px gives 354. No record
  names a narrower supported width than 390 px [ran: a search of the best-practice guides and the
  spec found none]. QA reports the width at which it first fails; the wave does not chase it.
- *For the owner, at the hand check:* the two-line Russian button as built, beside the one
  alternative that is theirs, a shorter Russian label.

**Ruling 2 — the three view chips stand in a row under the picture. Confirmed.** The frame's
*"[ randare finală · 3 unghiuri ]"* is not chrome: it is a bracketed monospace note on a hatched
placeholder [src `…Mobil.dc.html:999-1000`], saying what the block is. 8D's ruling 1a read it as
three angles, reached by the three chips, and that stands. The frame draws no control for them, so
their place was never the frame's; over the picture they covered about a fifth of it. Under it
they cover nothing and keep 44 px. *The cost, to be measured:* the list starts 54 px lower.

- **Criterion 7, added.** The picture is 158 px and no chip overlaps it; *Vezi în 3D* stays in
  its lower corner as frame 3A places it; each chip is at least 44 px tall. Criteria 16 to 18 of
  8D hold unchanged.
- *For the visual pass:* how much of the first group shows in the first screenful, in the four
  cases 8D measured, so the owner sees the 54 px with the scene's height. An observation, not a
  criterion.
- *For the scribe, at this wave's close:* ADR 0148 Amendment A says *"the chips over it"* in its
  hand-check list; a dated note says they stand under the picture since 8D2.

**Ruling 3 — the caption is `--ink-faint`, not the frame's `#7d7a72`. Confirmed, and it is
recorded.** ADR 0104's sweep: *"`--ink-faint: #6b6860` replaces the frames' `#7d7a72`. Kept, and
it outranks the frame. A contrast ruling is not chrome taste. Every other colour in the frames is
taken literally."* [doc]. The frame's caption is exactly that grey, so the token is the frame's
value as the owner corrected it, and no departure.

*QA and the visual pass gain:* criteria 6 and 7; the tripwire of criterion 4 re-measured, since
the 344.5 px is arithmetic; the bar with a flagged total and with a refusal; an unavailable
review, whose bar is the call to action alone.

#### 8D2 — QA's figures and the review's one fix, 2026-10-08

QA is green at `074e9c5` and `36f5846` [ran: `git log`]. Its figures, in a browser at 390 × 844
[relayed, QA-run]:

- **Criterion 4.** The pinned region in Russian with three sentences and the link is **344.5 px,
  40.8%**; the arithmetic held. Romanian 309.7 px. The tripwire is not reached.
- **Criterion 6 holds**, and **the limit of ruling 1 is now measured**, in viewport width, in
  Russian: the word first enters the button's padding at 300 px with 86 000 MDL, at 320 px with
  986 000, and at 330 px with 1 234 000, where it passes the button's edge at 290 px. At 345, 360
  and 375 px nothing spills. My sum above feared more than this. *Recorded as a limit with its
  trigger (ADR 0118):* a supported width under 345 px is named, or a kitchen prices at seven
  digits. The dearest generated kitchen is 236 000 MDL, so seven digits were written in by hand.
- **Criterion 7 holds. Criterion 1 holds** over 108 dressed kitchens, 2,886 bodies a language,
  against a literal table.

**Combined review: approve, one should-fix.** [relayed; the reviewer read the source and ran
nothing. Its three code claims re-read at HEAD: src.]

**R1.1 — allowed, and it is criterion 2's own must-not.** The two labellers each read
`content.bodyLabel(entry.label)` for themselves [src `price-breakdown-model.ts:212-229`], which is
*"read from the entry by two routes"*, held together by one test in one language. **The fix:
`describePlacementLabel` passes `describePlacementName(entry, content)` to the label leaf.** One
labeller with one name inside it is what ADR 0148 decision 4 means. It edits a function the
breakdown calls [src `:201`] and changes no string; criterion 5 is restated above to what it
protects. *Must not:* a breakdown test, a price-bar test or a `qa-*` file is edited to pass.

**R1.2 — the silent fallback goes; the lookup throws, in the model.** A group's row with no
detail falls back to its one-line label [src `review-groups.tsx:117-119`]. It cannot happen: C2
already throws unless the priced bodies and the listed ones are the same, and the rows and the
details are built from one `groups`. A quiet second answer to a case the model refuses aloud is
the thing C2 was written against, and it is a branch no test reaches. **The model exports the
lookup; it throws a named error for a body with no detail; the screen calls it and decides
nothing.** `ReviewRow` keeps its optional detail, which is the whole-kitchen rows', and its
comment says so truly. One unit test: the lookup throws for an id the review does not hold.

**The nits, in the same round.** R1.3: the test named for one detail per body counts
`rowDetails` and loses its unrelated assertion. R1.4: ~~`.sentence` is deleted; no source or test
names the class [ran: a search of `apps/web/src` and `apps/web/tests` at HEAD]~~ **WITHDRAWN,
corrected 2026-10-08 at close: `.sentence` is composed by `.flagged`, `.refusal` and `.waiting`
in `review.module.css` (lines 394, 403, 420) [relayed: the combined reviewer's re-check at
`0fad22c`]. The search above covered TS and TSX only, and so did the reviewer's; the class stays.**
R1.5: one of the two matching comments goes.

**The round.** One implementer; files `price/price-breakdown-model.ts`, `review/review-model.ts`,
`review/review-groups.tsx`, `review.module.css`, `review/review-scene.tsx`, and the two test
files it owns. *Reading:* this section; criteria 2 and 5; ADR 0148 decisions 3 and 4. **Then:**
the coordinator's gates; the visual verifier on the final tree; the combined reviewer on R1.1 and
R1.2 only; close. QA does not re-run: nothing a customer sees changes, and its files pass
untouched or the round has failed.

**For the owner's hand check, added.** A body's own finish that equals the kitchen's **is stated
on its row**. ADR 0099 decides by whether the body holds its own choice, not by whether it
differs: *"Clearing **deletes the key**; it must never write the current global value into it"*
[doc, `:118`]. So *"alb mat"* can stand on one row of an all-white kitchen. Right by the record;
the owner may find it odd.

#### 8D2 as closed, 2026-10-08

**DONE, commits `3ffad38` … `0fad22c` on `m8-review-contact-success`, local, not pushed**
[coordinator-run: `git log`]. Not archived: M8 is open.

**Shipped.** `3ffad38` S1 (row detail: `AvailableReview.rowDetails`, two-line rows); `76df1b8` S2
(the bottom bar as frame 3A draws it; the view chips under the picture); `fae29fa` and `3c2da91`
the architect's rulings on S1 and S2; `074e9c5` adversarial QA, green; `36f5846` QA's addendum
(criteria 6 and 7); `b1b3d51` the architect's ruling on the review; `0fad22c` the review's fix
round (R1.1, R1.2 and the nits). Criteria 1 to 7 as written above, criterion 2 restated by *S1 as
built* and criterion 5 by the review ruling. ADR 0148 Amendment B records the decisions.

**Verification, by who ran it.**

- *Coordinator-run, at `0fad22c`* (working tree before the commit, same content): `pnpm --filter
  @lemnaria/web run typecheck` exit 0; `pnpm --filter @lemnaria/web exec vitest run` exit 0, 331
  files, 6172 tests passed; `prettier --check` on the five changed files exit 0. The commit's
  pre-commit hook passed.
- *QA (m8-8d-qa), at `074e9c5`:* vitest 6168 passed; e2e on the dev server, mobile 489 and desktop
  201 passed; the pinned region's maximum 344.5 px, 40.8% of 844. *Addendum, `36f5846`:* the
  Russian call to action is exactly two lines in 52 px; the word spills only at viewports of 330 px
  and under (the architect recorded: nothing spills at 345 px and above; it first enters the
  padding at 300 to 330 px depending on the figure).
- *Combined reviewer (m8-8d-review-combined):* approve, with should-fix R1.1, note R1.2 and nits
  R1.3 to R1.5. Re-check at `0fad22c`, read from the diff, vitest not run: R1.1, R1.2, R1.3 and
  R1.5 closed; **R1.4 withdrawn** (see its correction above).
- *Visual verifier (m8-8d-verify-visual), at `0fad22c`, production build, Chromium 390 × 844 with a
  touch harness:* region heights ro / ru, none 86.0 / 86.0; one sentence 148.8 / 148.8; two 193.6 /
  211.0; three 309.7 / 344.5 px (maximum 40.8%). The bar matches frame 3A (padding 13 / 18 / 20,
  caption 10.5 px uppercase, figure 21 px bold, call to action 52 px high, radius 12). The ro button
  is 123.2 × 52 on one line; the ru button 226.4 × 52 on two lines, unclipped; the bar wraps in
  neither language. Rows 13 / 18.2 over 11 / 14.3, the second line in `#6b6860`; a body's own
  finish and own handle print on the second line in ro and ru. The picture is 158 px, the chips 10
  px beneath it, 44 px tall; only the 3D link covers the picture (6.1% ro, 8.3% ru of its area);
  swipes from the picture and the chip row scroll the page. The ru bar holds at 390, 375, 360, 340
  and 320 px. Desktop at 900 and 1440 px: column 640 px, no horizontal overflow. Console: only the
  constant Permissions-Policy and CSP report-only lines.
- *Complete rows in the first screenful, after 8D2 against before* (visual verifier, same
  harness): L-ro 6 against 11; L-ru 6 against 9 plus 1 cut; U-ro 4 against 7; U-ru 3 plus 1 cut
  against 6 plus 1 cut. **This is the cost of ruling 2 and of the second line, roughly half the
  rows; the owner's call at the hand check (backlog 133).**

**Deviation, with rationale.** The Russian call to action is on two lines where frame 3A draws one:
a named departure, accepted (ruling 1, criterion 6). The chips stand under the picture and not over
it (ruling 2, criterion 7). Both are in ADR 0148 Amendment B.

**Correction to an earlier claim.** The coordinator's earlier *"format:check exit 0"* at `074e9c5`
proved nothing: `@lemnaria/web` has no `format:check` script, so the filtered command ran nothing.
The format gate exists only at the repo root (`pnpm format:check`). The five-file `prettier --check`
at `0fad22c` above is the observation that stands, and it is not the whole-tree gate.

**Not proven.**

- No real device, no iOS Safari, nothing run on a CI runner. `pnpm ci:local` and the full `CI=1`
  e2e suite were not run at `0fad22c`. e2e was not re-run after the fix round (the architect ruled
  that QA does not re-run).
- A free colour's hex on a row: not producible through the UI, whose body panel offers only decor
  swatches. Reading 2 therefore has no capture.
- A seven-digit figure in the bar: the widest tried was "103 000 MDL".
- Tab audits with zero and with three sentences (only two were run). The unavailable review's
  screenshots were measured and not looked at.
- The facts line's wording was not compared against the frame's wording.
- A faint vertical hairline left of the RU chip at 1440 px, cause not found (carried from 8D;
  backlog 134).

**Added to the owner's hand-check list.** The first screenful of the review holds about half the
rows it held before 8D2 (figures above); with it the picture's height (158 px), the two-line
Russian button against a shorter Russian label, and the free-colour value on a row (Reading 2).
The chips now stand under the picture, which retires *"the chips over the scene"* from the list.

**Deferred.** Backlog 133 (the first screenful), 134 (the hairline) and 135 (no `error.tsx`), with
the owners named there. The material pill on screens 3 to 5 stays the owner's question and is not
a slice. Waves 8E, 8I, 8H and 8J are dispatchable; backlog 121's gate-script fix comes before 8E.

### 8D3 — the boundary gate, red at HEAD, with backlog 121 (ruled 2026-10-08)

**8E waits for this.** Backlog 121 says so, and a red gate lets nothing be pushed.

**What is true at `ad535d0`.** `sh scripts/gates/boundary.sh` exits 1 on
`apps/web/tests/app/qa-8d-two-doors-real-repository.adversarial.test.ts:11`, a driver import in a
web test, there since 8D's QA commit `95a72fb` [relayed, coordinator-run]. Three things, classed
apart:

| What | Class | Why it was not seen |
| --- | --- | --- |
| A web test imports the Postgres driver | Implementation defect, in a test | The rule was written (ARCH §3); the test broke it |
| The gate reads one line of one import form (backlog 121, F1) | Test-fidelity problem in a gate | As ruled in 8B |
| Two waves closed with the gate red | A gap in the gates | `pnpm check`, which closes a wave, does not run it [src `package.json:13`]; only a push and CI do [src `scripts/local-ci.sh`, `ci.yml:751-762`] |

**Ruling 1 — the test stops asking the driver and listens at the global `fetch`. No seam, no
move, no exemption.** The installed driver sends through `fetchFunction ?? fetch`, read at the
call [src `@neondatabase/serverless@1.1.0`, `index.mjs`: `await(W??fetch)(…)`], and nothing in
`packages/persistence/src` sets `fetchFunction` [ran: a search found it in tests only]. So
production sends through the global `fetch`, and that is where the test should stand. It already
stubs it, to catch a request that went round the driver [src `:80-84`].

- *What the test does instead:* its one stub of `fetch` sorts every request. A `POST` to the
  driver's SQL endpoint for the test's own unroutable host is a query, read as now; anything else
  is a request past the driver, refused as now. For this host the endpoint is
  `https://api.invalid/sql` [src: the driver swaps the host's first label for `api.`].
- *Why not the others.* A seam exported by persistence is production code that hands every app a
  way to swap the transport, for one test. The test cannot move into persistence: it renders two
  of the app's pages. An exemption is the gate agreeing to be wrong in one named place.
- **What must not weaken.** No assertion is removed or loosened, no test renamed, the ten tests
  stay ten, and every count stays the number it is. Every test that counts queries also asserts
  that nothing went past the driver, so a query the sorter missed cannot read as none. *Must
  not:* the driver, or `@lemnaria/persistence`, is mocked; a persistence export is added for it.
- **It sees more than before, and that is the point of it.** A second copy of the driver, or a
  module that posts to the endpoint itself, is now seen; a swap of one copy's option saw neither.
- **A control, shown once and quoted:** with one extra query sent on one door, the count test
  goes red. [That the stub reaches the driver under vitest is my inference from the source; this
  control is its proof.]
- *Who:* **QA**, since the file is QA's and no production line changes.

**Ruling 2 — `apps/web`'s own dependency on the driver goes, in this wave, as its own commit,
after the test.** It is a `devDependency` added in M3 with an e2e spec [src `git log -S`, commit
`01afb26`], and no file under `apps/` but this test uses it [ran: `git grep`]. Without it the
import cannot resolve from `apps/web` at all: the root holds no hoisted copy [ran:
`ls node_modules/@neondatabase` finds nothing]. That is the boundary held by the package layout
and not by a pattern. *Proved, not assumed:* before the test is rewritten, the old import is
shown not to resolve once the entry is gone; the lockfile's diff is `apps/web`'s importer entry
and no version; typecheck, the web suite and the build are green.

**Ruling 3 — the gate.** The coordinator's pattern is right and so is the wider extension list.
Three additions, and a test.

- **A manifest check, first.** No `package.json` outside `packages/persistence` declares
  `@neondatabase/serverless` or `pg`. Today it finds `apps/web/package.json:35` and nothing else
  [ran]. This is the strong half: it covers every spelling of an import, the next-line specifier
  included.
- **The driver's scoped name as any single- or double-quoted string**, with no keyword before
  it. That also catches `vi.mock("…")` and `vi.importActual("…")`, which the keyword form does
  not. On the real tree it finds the one line [ran]. **Not backticks:** with them it flags a
  comment that names the package [ran: `tests/lib/persistence-imports.test.ts:5`]. `pg` keeps the
  keyword form, since a bare `"pg"` is not an import.
- *The hole left, named:* a template-literal or next-line specifier for `pg`, which no manifest
  declares [ran]; the manifest check is what stands there.
- **A fixture test, yes.** This gate has now been found too narrow twice. The script runs from
  whatever repository it is in [src `boundary.sh:9`], so the test builds a scratch repository,
  writes samples, runs the script and reads its exit: each form above refused, including an
  untracked file and a wrapped import; `pg-format`, `./pg`, a bare `"pg"`, a backticked mention
  and the same lines inside `packages/persistence` allowed. *Must not:* a sample lives in the
  real tree under an extension the gate reads. It runs wherever the gate runs, as the shard
  budget's test already does beside its gate [src `scripts/local-ci.sh:130-131`].
- **Where it runs: at pre-commit and in `pnpm check`, as well as at push and in CI.** The hook
  leaves out tests and typecheck because they need a database [src `.githooks/pre-commit:10-12`];
  this needs neither a network nor a credential. And `check` is the command a wave closes on. The
  cost, as with lint there: another agent's unstaged violation stops an unrelated commit.

**Ruling 4 — tier and order.** *Tier: Light*, one combined reviewer. *Said plainly:* the tier
table puts *"dependency changes"* under Full [doc `WORKFLOW.md:250`]. I read that row as guarding
code that newly runs; this removes a development-only entry nothing uses, with the proof above.
If the coordinator holds the row to its letter, ruling 2 alone takes the second reviewer.

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 (QA) | The test listens at `fetch`; the control | the one `qa-8d-two-doors…` file | ruling 1; the file itself |
| S2 (coordinator) | The dependency leaves | `apps/web/package.json`, `pnpm-lock.yaml` | ruling 2 |
| S3 (coordinator) | The gate, its fixture test, the hook, `check` | `scripts/gates/boundary.sh`, its test, `.githooks/pre-commit`, `package.json`, `scripts/local-ci.sh`, `ci.yml` | ruling 3; `ci-and-local-gates.md` |

*Reviewer reading:* this section; the rewritten test against `95a72fb`'s; the gate and its
samples. *It answers two questions:* can the test still fail for every reason it could, and does
the gate refuse each form it claims to.

*Criteria.* (1) `boundary.sh` exits 0 at the wave's HEAD and its fixture test is green.
(2) The rewritten test passes; its control was red. (3) The web suite's count of passing tests
does not fall. (4) *Must not:* any other `qa-*` file changes; a gate is narrowed to pass.

*For the scribe:* backlog 121 closes with this; `ci-and-local-gates.md` gains where the gate
runs and why it joined the hook; ADR 0146's record of the opener is untouched.

#### 8D3 as closed, 2026-10-08

**Shipped, on `m8-review-contact-success`, not pushed [coordinator ran `git log`]:** `b5aed77` plan;
`b42eb1c` S1 (QA: the two-doors test counts queries at the global `fetch`); `b41e1fa` S2
(`apps/web`'s devDependency on `@neondatabase/serverless` removed); `8ceafb5` S3 (gate, fixture test,
wiring); `fcb3e49` review fixes R1.2, R1.3, R1.6, R1.7; `be4ffe2` review fix R1.1.

**What the gate is now** [coordinator-reported]. `scripts/gates/boundary.sh` has one `refuse_matches`
function; a manifest check (no `package.json` outside `packages/persistence` declares
`@neondatabase/serverless` or `pg`, by name or behind an `npm:` alias); an import check that reads the
specifier after `from`, `import` and `require` (wrapped, dynamic, bare, require, subpath) and the scoped
name as any single- or double-quoted string (so `vi.mock` is seen); eight extensions (ts tsx mts cts js
jsx mjs cjs); a `git grep` exit above 1 is a gate error, not "OK"; and `set -f`, so the shell does not
expand the pathspecs. `scripts/gates/boundary.test.mjs` is a `node --test` file of 40 cases, each in a
scratch repository, each asserting the exit and which check refused. It runs at `.githooks/pre-commit`
(the script alone), in `pnpm check` and `pnpm gate:boundary` (test, then script), in
`scripts/local-ci.sh`, and in the `boundary` CI job (test step added; the runner's own Node, no setup
step).

**Evidence, by who ran it.**

- *Coordinator-run.* At `ad535d0`, `sh scripts/gates/boundary.sh` exit 1 on
  `apps/web/tests/app/qa-8d-two-doors-real-repository.adversarial.test.ts:11` (there since `95a72fb`).
  After `b41e1fa`: `require.resolve('@neondatabase/serverless')` from `apps/web` gives
  `MODULE_NOT_FOUND`, from `packages/persistence` it resolves; the lockfile diff is the one importer
  entry (3 lines); `pnpm typecheck` exit 0; web vitest 331 files, 6172 passed; `pnpm build` exit 0;
  lockfile gate exit 0. *Control on the gate:* the first fixture test (32 cases) run against the old
  script, 21 failed and 11 passed. *Control on `set -f`:* without it, 1 of 40 fails ("reads a nested
  file when the root holds a file of the same extension"). At `be4ffe2` (the tree before the commit):
  `pnpm gate:boundary` exit 0 with 40 passing; web vitest 6172 passed; web typecheck exit 0; the gate
  also exit 0 under `dash`.
- *QA (m8-8d-qa).* S1: the ten tests stay ten, 44 cases; control with one extra query, "expected … to
  have a length of 2 but got 3", 1 failed | 43 passed. R1.1: two assertions added to "a database that
  does not answer"; control with a wrong endpoint constant, 27 failed | 17 passed (the 17 send
  nothing).
- *Combined reviewer (m8-8d-review-combined), at `8ceafb5`:* approve with should-fix, no must-fix. It ran
  the gate, its test, the two-doors file, `dash`, and 27 probe samples in a scratch repository. R1.1 to
  R1.3 should-fix, R1.4 and R1.5 notes, R1.6 and R1.7 nits. **It did not re-check `fcb3e49` or `be4ffe2`:
  those fixes are coordinator- and QA-verified only.**

**A defect the coordinator introduced and caught.** While rewriting the gate for the review fixes, the
coordinator put the extension pathspecs in an unquoted variable. `sh` expanded `*.mjs` against the
repository root, where `eslint.config.mjs` lives, so nested files went unread while every fixture stayed
green: a scratch repository's root held no such file. It never reached a commit. `set -f` and the new
fixture case close it. The lesson, recorded in `ci-and-local-gates.md`: a gate's fixture must resemble the
real tree's root.

**Deviation.** *Tier was Light* by the architect's ruling 4, against `WORKFLOW.md`'s "dependency changes
-> Full" row. The coordinator accepted it and told the owner. It is a named choice, not a drift.

**Not proven.** Nothing ran on a CI runner: the ubuntu job's bare `node --test` and GNU `grep` behaviour
are inference. `pnpm check`, `pnpm ci:local` and e2e were not run at `be4ffe2` (the persistence suite
needs the live test database).

**Holes left, named** (backlog 136 to 138; ruling 3 had named the `pg` template-literal hole already).
(a) The supplier-folder check has no manifest behind it: `vi.mock("../design-source/a")` and a
template-literal or next-line specifier pass [reviewer ran]. A quoted-path match was tried and rejected,
because it flags `eslint.config.mjs:291`, `:414` and `apps/web/scripts/capture-reference-rig.mjs:29`
[coordinator ran]. (b) The gate knows two driver names: `postgres`, `pg-pool`, or a relative path into
`packages/persistence/node_modules` pass, in manifest and import alike [reviewer ran]. (c) A string
literal containing `import 'pg'` is a false positive; none on the real tree [reviewer ran].

**Criteria.** (1) Gate exit 0 and its fixture test green: coordinator-run at `be4ffe2`, above. (2) The
rewritten test passes and its control was red: QA-run. (3) The web suite's passing count did not fall:
6172 before and after, coordinator-run. (4) *Must not:* not verified here beyond the reviewer's reading at
`8ceafb5`.

**Documentation updated.** Backlog 121 closed; entries 136 to 138 added; `ci-and-local-gates.md`;
`STATUS.md`.

### 8E — the rate-limit store

*Goal.* Postgres counts requests per bucket and window, atomically (ADR 0019 Alternative 4 rejected
Redis). *Tier: Full + security.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S1 | Migration `0007`: one `create table if not exists` and its index. A port that records one hit against several buckets in one statement and returns each count, and a prune of expired windows. A fake for tests | `persistence/src/migrations/0007_create_rate_limit_counters.sql`, new `rate-limit-store.ts`, `fake-rate-limit-store.ts`, `index.ts` | D10; Q14; ADR 0019 d3, d5, Consequences; ADR 0008 and its 2026-09-23 note; ADR 0020, 0042, 0096; `migration-safety.ts`; ADR 0128; ADR 0145; `share-link-repository.ts` as the pattern |

*Criteria.*
1. **No lost update.** N concurrent hits on one bucket and window return the counts 1…N exactly once
   each, on the live test database, under ADR 0128's lock.
2. ~~A hit one millisecond before a window's end and one at its start land in different windows.~~
   **(Restated 2026-10-08, see the adjudication.)** The caller supplies each window, half-open.
   Two adjacent windows of one key are two rows, and an instant equal to a window's end belongs to
   the next. Which window holds an instant is 8F's.
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
production, **by [the runbook](../runbooks/applying-a-table-migration-and-its-application-role-grant.md)**
(2026-10-08). The commands are prepared, not run, by an agent. **Added 2026-10-08:** then run
`tests/application-role-privileges.test.ts` against that database and quote its result, with the
`rate_limit_counters` test *run and not skipped*. Until then criterion 7's grant half is
**written and never executed**, and the close-out says so in those words.

#### 8E — adjudication of QA, 2026-10-08

**State.** S1 is `ec2f181`; QA's files are `087e09f` [ran: `git log`]. At `ec2f181`: typecheck
and lint exit 0, 1539 passed, boundary and the unattended screen exit 0 [relayed,
coordinator-run]. With QA's files: 4 failed, 1706 passed, on two findings [relayed, QA-run].
Criteria 1, 3, 4, 5, 8 and 9 hold on the live test database [relayed, QA-run].

| Finding | Class | Ruling |
| --- | --- | --- |
| F1 two callers, one key and start, two ends | **Contract gap** | Rule S1 and criterion 10, below |
| F2 a null row leaves as a bare `TypeError` | **Implementation defect** against criterion 6 | Fixed: a row that is not an object is the typed error |
| The comment at `rate-limit-store.ts:168-169` cites ADR 0145 d1 for *"ran nothing"* | **Implementation defect**, in a comment that states a reason no record gives | Restated; rule S2 |
| Criterion 7's grant test has never run and is blind to `PUBLIC` | **Test-fidelity problem**; the blindness is inherited | This table's test is rewritten here; the older three go to the backlog |

**The developer's three readings.**

1. *The caller supplies a half-open window.* **Confirmed.** A Chișinău day is 23, 24 or 25 hours,
   so the store cannot know a window's length. **Criterion 2 is restated to the store's half:**
   two adjacent windows of one key are two rows, and an instant equal to a window's end belongs to
   the next. Which window holds an instant is 8F's, under its criterion 8.
2. *One row per bucket per window, keyed by key and start.* **Confirmed**, and criterion 9 rests
   on it. It is only sound with rule S1.
3. *A cold-start refusal is repeated; an empty reply on a hit is not.* **The behaviour is
   confirmed; its stated reason is overturned.** Rule S2.

**Rule S1 — one key, one policy; and a broken promise is refused, never counted (F1).**

- *The contract, which is 8F's to keep:* a bucket's key is the digest of **the policy's name and
  the subject together**. **(Restated 2026-10-08, review S-R1.3: of an encoding of the two that
  no subject can forge; see *the three reviews*.)** Two policies never share a key. This is not a
  corner. 8G and 8K keep
  two limits on one subject [doc, this plan, 8F's restated criterion 3], and an hour's window and
  a day's begin at the same instant every midnight. With the subject alone in the digest, F1
  happens daily.
- *What this layer does when it is broken:* **it refuses.** A hit whose window end differs from
  the stored row's rejects with a named, typed error of its own, since it is the caller's mistake
  and not the database's silence. *Why not keep the later end:* the row would then hold two
  policies' hits added together, and the store would hand back a number that is no policy's
  count. A wrong count given as a count is what criterion 6 forbids.
- **Criterion 10, added.** For one key and start: a hit stating the stored end counts; a hit
  stating any other end rejects with the named error, **and nothing of that request is counted,
  in any of its buckets**; the stored row's count and end are as they were; a prune at the
  shorter end removes nothing live. The fake does the same. *Must not:* `0007`'s bytes change; the
  error's message or cause carries a key.
- *On "nothing is counted":* QA showed on the live database that a statement the database refuses
  counts none of its buckets (the overflow test). A refusal raised by the statement itself keeps
  that true here, and the table's own window check may serve [inf, unrun]. **If it cannot be had
  without a new migration, the implementer stops and reports**; the fallback, the other buckets
  counted, is then recorded as a limit and not chosen quietly.

**Rule S2 — a count may err high and never low (reading 3).**

- *What the records say.* ADR 0145 decision 1 names which failures are repeated. It does not say
  a cold-start refusal ran nothing. The retry's own comment says the opposite of both: they
  *"can follow a statement that already ran"* [src `retry-on-transient-failure.ts:26-27`], and the
  project's harness loses a cold-start reply *after the write lands*
  [src `tests/support/lose-the-first-reply.ts`]. No record measures which is true of Neon.
- *The ruling.* **Repeating a hit after a cold-start refusal is accepted, knowing it may count
  one request up to three times.** The other choice refuses the first design after the database
  has slept, which at this traffic is the ordinary first request of a morning. An empty reply is
  not repeated: it follows a reply that began well, so the hit most likely landed [inf]; the
  request is refused and its hit may stand. Both err the same way.
- **Criterion 11, added, as a property.** Under any sequence of lost replies, of either kind and
  at either point, a bucket's stored count is never less than the number of requests answered
  with a count, and never more than the number of attempts sent. *Must not:* a request is
  answered with a count while its hit is absent. **(Restated 2026-10-08, review L-R1.1: this
  holds for a window the prune has not removed, and not across its removal; see *the three
  reviews*.)**
- *This is an exception to ADR 0145 decision 2's headline*, the owner's *"a retry never leaves a
  trace"*. That decision lists designs, links and visitor moves, and a counter is none of them;
  but an over-count is a trace. **It is the architect's ruling, open to the owner**, and it goes
  to them in those words with the limit's own *"track and adjust later"*. **(Accepted by the
  owner, 2026-10-08: *"Accept (Recommended)"* [relayed]. See *The owner's answers of
  2026-10-08*.)**
- *The comment* says what is true: a repeat can count a hit twice; that is accepted after a
  cold-start refusal and not after an empty reply; the reason is this ruling, cited by the wave's
  ADR and not by ADR 0145 decision 1.

**Criterion 7's grant half.** The test follows its file's pattern exactly, and the pattern is
weak in three ways the file already had: it runs only where `DATABASE_URL` is set, which CI never
does [relayed]; it reads `role_table_grants` for `current_user`, which does not show what `PUBLIC`
holds; and it names no schema [src `tests/application-role-privileges.test.ts:60-66, 140-178`].

- *What 8E owes:* its own table's test asks the database for the **effective** privilege, on
  `public.rate_limit_counters` by name: select, insert, update and delete held; truncate,
  references and trigger not. That sees a grant to `PUBLIC` and cannot read another schema's
  table. It still skips where the table is absent, and so it still has not run.
- *What 8E does not owe:* the same weakness on `designs`, `schema_migrations` and
  `design_share_links`. **Backlog**, owner the coordinator with the security reviewer, trigger
  the delivery milestone's launch gate. And a database on which CI can run this file: the
  delivery milestone's.

**The `beforeAll` that deletes by era, then by key. Allowed, on three conditions.** It runs only
against the guarded test database. The eras are allocated in **one support file** that both
suites import, so *"no other writer uses this era"* is read in one place and not trusted to two
comments. And it **reports how many rows it removed**, so an interrupted run is seen and not
healed in silence. The incident that produced it is the owner's and is not ruled here.
**(The owner ruled it, 2026-10-08: *"If were added by tests , delete , if added by production
user keep"* [relayed]. See *The owner's answers of 2026-10-08*.)**

**What 8F inherits. Recorded, not built.**

- The key is the digest of policy and subject (rule S1); 8F carries a property for it.
- **8F fails closed on any throw, of any class, from construction on.** The validation refusals
  are plain `Error`s; the Neon store's constructor throws on an unusable `DATABASE_URL`
  [src `:105-107`]; `RateLimitStoreError` and the new error are two more.
- The fake never fails. It does not reproduce an overflow, an unreadable window or a lost reply.
  A test of failing closed brings its own store that rejects.
- A count may be high by a repeat (rule S2), so a refusal at exactly the limit is not proof the
  customer made twenty requests.

**The fix round.** One implementer, three production files.

| # | Does | Files |
| --- | --- | --- |
| 1 | Rule S1: the mismatch refused, with its named error, in the store and the fake | `rate-limit-store.ts`, `fake-rate-limit-store.ts`, `index.ts` |
| 2 | F2: a row that is not an object is the typed error | `rate-limit-store.ts` |
| 3 | Rule S2: the comment restated; the port's doc says a count may err high and never low, and that a key is one policy's | `rate-limit-store.ts` |
| 4 | The grant test for this table by effective privilege, with its schema | `tests/application-role-privileges.test.ts` |
| 5 | Its own contract suite follows 1 to 3 | `tests/rate-limit-store.test.ts` |

*Reading:* this section; ADR 0145; the three slice files; QA's three files, read and not edited.
*Must not:* a `qa-*` file is edited; `0007` changes.

**Then QA, on its own files:** the four tests on F1 are re-aimed at criterion 10, the two that
fail and the two that pin the first end; F2's go green untouched; criterion 11's property is
added; the eras move to the support file. **Then review, Full + security:** *logic* reads the
store, criteria 10 and 11 and ADR 0145; *clean-code* reads the three slice files; *security*
reads the migration, the grant test, ADR 0008 and ADR 0019 d2, d3, and answers whether an error
can carry a key or a window.

*For the scribe, at the close:* the wave's ADR records S1, S2 as the architect's and open to the
owner, and the grant half as unexecuted; ADR 0145 gains a dated note that a counter is a fourth
caller class, counted and erring high; the backlog gains the older tables' grant tests.

#### 8E — a deadlock between hits and a prune, ruled 2026-10-08

**State.** The fix round is `9444910` [ran: `git log`]; 4 failed, 1715 passed, the four being
QA's F1 tests awaiting their re-aim [relayed, coordinator-run]. S1 was reached through the
table's own window check, `0007` untouched [src `rate-limit-store.ts:151-162`].

**What was seen** [relayed, developer-run, once]. QA's race of 40 seven-bucket hits against 12
prunes of six of their rows failed in one run of five: 4 hits rejected, each with SQLSTATE
`40P01`. It was green in QA's four runs before the fix round.

**Class: contract gap, closed in the implementation.** No criterion says what holds while a prune
runs beside hits; criterion 9 speaks of a prune that is late, missing or repeated, not of one in
progress. *"No deadlock"* stood in a test's title and in the hit's own comment, which promises it
for hits alone [src `:129-130`]. The hit locks its rows by key and start; the prune names no
order [src `:176-183`]. Two statements that lock two shared rows in different orders can each
wait on the other [inf; QA predicted it and one run showed it].

**Ruling — the prune takes its locks in the hit's order. Option (a). Fixed now, by the
implementer, in one statement of one file.**

- *Why fix what is rare.* A deadlocked hit fails closed and is never a wrong count. In production
  it needs a request with two limits whose windows have both just ended, at the moment the prune
  runs: midnight, for 8G and 8K. That is rare, and it would make the limiter's behaviour depend
  on when a job is scheduled, which is what criterion 9 exists to forbid.
- *Why not tolerate it (b):* the test would stop proving the thing in its title. *Why not repeat
  a `40P01` (c):* it would be safe to count, since a deadlock's victim ran nothing, but it treats
  the symptom, and each one first waits out the database's deadlock timeout. With one order there
  is none to repeat. A `40P01` seen after this is a finding, not a case.
- *Why not skip locked rows:* criterion 5 has the prune remove **every** expired row.
- **Criterion 12, added. One lock order.** Every statement here that can lock more than one row
  of the table takes them by key, then by start; the prune is one. With hits racing prunes of
  rows they share, no hit and no prune is rejected, each live window's counts are 1…N once each,
  and every expired row is gone at the end. *Must not:* a test accepts a `40P01`; the store
  repeats one; the prune leaves an expired row because it was locked; `0007` changes.
- *The hit's comment* then says what is true of the module, not of hits alone.
- *The prune as a victim, as built:* a `40P01` is a decoded refusal, which the retry does not
  repeat [src `retry-on-transient-failure.ts:26-28`], so that run fails with the typed error and
  the next night's removes the rows. Unchanged, and after this ruling unreachable.

**Does S1's `set window_end = …` bear on it? I judge not, and it is not measured.** The upsert
locked the conflicting row before S1 and locks it the same way now; `window_end` is in no key.
Where the ends agree the value is written as itself [inf, from how I recall Postgres deciding
both things; the logic reviewer checks it against the documentation]. And the runs do not show a
change: at one failure in five, four green runs in a row happen four times in ten. **Whether the
fix round made it likelier is not established, and need not be:** one order removes the cause
under either statement.

**How it is proved. One in five is too rare to prove by a handful of green runs, so the test is
sharpened first and the fix is measured against that.**

1. **QA, before the fix, at `9444910`:** the race is made to fail often — more shared rows in a
   request, more rounds — until the unordered prune deadlocks in **at least five runs of ten**,
   and those runs are quoted. If it cannot be brought that high, QA reports the rate it reached
   and the count in step 3 is set from it.
2. **The implementer:** the prune's order. Nothing else.
3. **QA, after:** the same sharpened race, **thirty runs in a row green**, by that test's name
   alone, with the rows left behind counted at the end: none. At a true rate of one in two,
   thirty green runs by chance is under one in a thousand million; had only the original one in
   five been kept, thirty would still leave about one chance in eight hundred.
4. **The logic reviewer, by construction:** reads the statement and says where the locks are
   taken and in what order, quoting Postgres's documentation of a locking clause under an
   `order by`. Runs alone cannot show an order; the reading does.

*Order of work:* QA's baseline; the implementer's one statement; QA's thirty runs and its F1
re-aim together; then review as ruled. *Reading for both:* this section;
`rate-limit-store.ts`; QA's race test.

#### 8E — QA round 2, and F3, ruled 2026-10-08

**State.** The ordered prune is `33778b1`; QA's round 2 is `a681234` [ran: `git log`]. The race
is green thirty runs of thirty with every expired row gone, and criteria 10, 11 and 12 hold
[relayed, QA-run]. One test is red, on F3.

**F3 — the grant test asks about seven privileges and the server knows eight. Test-fidelity
problem, and the fault began in this plan.** My ruling on criterion 7 said *"truncate, references
and trigger not"*: it listed three where it meant *no other*. The server's eighth is `MAINTAIN`
[relayed, QA-run on the test database]; a grant of it to the role or to `PUBLIC` would pass.

**Ruling — the coordinator's proposal, with a floor. The list comes from the server.**

- **Criterion 7, restated.** On `public.rate_limit_counters` the role holds select, insert,
  update and delete, **and no other table privilege the server it runs on knows**. The names of
  the others are asked of that server, not written in the test.
- *Why not a literal with a version guard:* a literal is what went stale here, and it goes stale
  again at the next privilege a server gains. A guard is a second thing to keep true, about a
  database whose version nobody has read: that the application's runs what the test database
  runs is inference. A name the server gave is a name it will answer for.
- **The floor, so the list cannot pass by being short.** What the server returns must contain
  the four held and truncate, references and trigger. If it does not, the test **fails**; it does
  not skip and does not go on with what it got. *Must not:* an empty or shortened list reads as
  *nothing else held*.
- *Shape:* the question to the server is one small helper under `tests/support/`, so QA can run
  it against the test database now, while the grant test itself still waits for the owner. No
  production file changes.
- *Who:* the implementer: `tests/application-role-privileges.test.ts` and the one helper. **Then
  QA re-aims its three tests**, which read the list out of the grant test's source and will find
  no literals there: the floor, a boolean for every name, and nothing left out, each asked of the
  helper on the live test database.
- *The older three tables:* F3's sibling joins the backlog entry already ruled. When those tests
  move to effective privilege they take the same helper.
- *Still true:* the grant test has not run. Criterion 7's grant half stays **written and never
  executed** until the owner's step.

**Recorded from round 2. No action.**

- **Criterion 11 holds within the harness's reach, and the close-out says it in those words.**
  Not reached on the live database: two losses inside one call, since the harness loses only the
  first reply; a lost reply with another caller's hit between it and the repeat; a lost reply on
  a prune. The first is covered with a mocked driver only.
- **A hit that both conflicts and would overflow** is refused with one of the two typed errors
  and counts nothing; which one was not recorded. **The contract does not say which, on
  purpose:** it promises a typed refusal and no count, and 8F fails closed on either.

**Then review, as ruled:** Full + security, three readers, after the implementer's change and
QA's re-aim are green.

#### 8E — the three reviews, ruled 2026-10-08

**State.** HEAD is `ae1a8dd` [ran: `git log`]. Logic: approve with should-fix. Clean-code:
approve with should-fix. Security: approve, no must-fix in code. [relayed; the findings' file
references re-read at HEAD where a ruling rests on them: src.]

**S-R1.1 — the privilege test sends `truncate` and `drop` at the application's database. Fixed
now, first in the round. Implementation defect in a test, there since M2, not this wave's
making.** It is worse than it was put: on a developer's machine the file's `DATABASE_URL` comes
from the repository root's `.env.local`, and that value is **production's**
[doc `environments-and-resources.md:64`; src `load-env.ts:13, 43`, loaded by the suite's own
`vitest.config.ts:3-5`]. So every ordinary run of the
persistence suite has sent `truncate designs` and `drop table designs` to production and passed
because the role was refused [src `tests/application-role-privileges.test.ts:97-111`]. Nothing
asks first who it is. **(True when written. Since 2026-10-08 the root file's value is the
preview database's, and the test says which it reached [relayed, coordinator-run]; see *The
owner's answers of 2026-10-08*.)**

- **Criterion 13, added. The file is safe on any credential.**
  1. **A statement that would destroy or create anything if it were allowed is never sent.**
     `truncate designs`, `drop table designs` and `create table privilege_probe` go. What they
     proved is asked of the catalog: truncate through the effective-privilege helper; drop as
     *not the table's owner, no member of its owner, no superuser, not the schema's owner*;
     create as no `CREATE` on the schema. [inf: that list is who may drop a table as I recall
     Postgres; the security reviewer checks it against the documentation.]
  2. **A statement that would touch nothing even if allowed** (the two deletes of a row that
     does not exist) is sent only after the catalog has said it will be refused. If the catalog
     says otherwise the test fails with that answer, and the statement is not sent.
  3. **Before any of it,** the file establishes, by reads alone, that the connection is no
     superuser, inherits no role and does not own `designs`. If it cannot, every test in the file
     fails at once, saying what it found, and nothing more is sent.
  4. **The run says once what it reached:** the database and the role as the server names them.
     No part of the URL.
  *Must not:* a failed guard skips, since a skip reads as fine; a secret is printed; the file's
  header goes on saying *"nothing here writes"* while a statement could.
- *Why now and not the backlog:* the file is open in this wave, the change is one test file, and
  the price of the one bad day is the production table.
- *Why the two probes are removed and not guarded:* a guard is only as good as its reasoning
  about who may drop a table, and a gap in that reasoning would be found by the table going. A
  statement not sent cannot succeed.

**The findings, ruled.**

| Finding | Ruling |
| --- | --- |
| L-R1.1 *never low* is false across a prune | **Both directions.** Criterion 11 restated above. The port's doc says a hit for a window the prune has removed starts again at 1. **8G's prune trails the clock by a margin longer than a request can live**, a datum set there with its reason. Exposure until then: one late request for a bucket at a prune |
| L-R1.2 the prune under-reports after a repeat | Doc clause: after a repeat the number is a lower bound |
| L-R1.3 the comment states the lock order as fact | **The comment changes, and the tier goes in the wave's ADR.** The prune's order is a locking read under an `order by`, which Postgres documents. That an insert takes its select's rows in the select's order is **observed, thirty runs of thirty, and not documented** [reviewer: doc, by absence]. A recorded limit with its trigger (ADR 0118): a `40P01` from this module, or a new major version of the database, re-runs QA's race |
| L-R1.4 *nothing counted* has a hole through the retry | **Record only**, in the ADR's limits. It needs a caller that already broke S1 and a prune inside the half-second wait |
| S-R1.2 an empty list resolves to no counts and asks nothing | **Refused here, and 8F's as well.** It is the one input the store answers without the database, and no counts reads as nothing over the limit. It becomes a validation refusal in the one check both stores share. 8F's evaluator separately refuses a policy with no bucket when it is built. The two pins and QA's N = 0 test follow |
| S-R1.3 how name and subject are joined | **S1 restated.** The key is the digest of an encoding in which the policy's name comes from a **closed set written in code** and the subject **cannot be mistaken for any part of a name**: equal encodings only for equal pairs. 8F owns the function and a property for it over arbitrary subjects, including ones that contain a policy's name. Here, the port's doc says so |
| S-R1.9 grant option and column grants | **Backlog**, in the entry for the older tables: the helper learns both once, for all four |
| C-R1.1 the identity built twice | In the round: built once |
| C-R1.2 the fake loads the driver | **In scope, last in the round.** By the package's own naming: `rate-limit-store.ts` keeps the port (the interface, the errors, the checks) and loads no driver; the Neon class moves to `neon-rate-limit-store.ts`, as `neon-configuration-repository.ts` stands beside its port. `index.ts` exports the same names |
| C-R1.3 the comment ends in history | In the round: it cites the wave's ADR and no adjudication |
| C-R1.4 `recordHits` is 35 lines; C-R1.5 to C-R1.8; S-R1.12 the title that says *"ran nothing"* | In the round |

**One narrow exception to "no `qa-*` file is edited".** C-R1.2 moves `NeonRateLimitStore`, which
QA's files import by path. The implementer may change **the module named in an import line** of
a QA file and nothing else in it. The clean-code reviewer confirms from the diff that those lines
are the whole change to every QA file.

**The fix round. One implementer, five items, in this order.**

| # | Does | Files |
| --- | --- | --- |
| 1 | Criterion 13 | `tests/application-role-privileges.test.ts`, its helper under `tests/support/` |
| 2 | S-R1.2: an empty list is refused, in both stores | `rate-limit-store.ts`; its own two tests |
| 3 | The words: L-R1.1, L-R1.2, L-R1.3, S-R1.3 in the port's doc; C-R1.3; S-R1.12 | `rate-limit-store.ts`, `tests/rate-limit-store.test.ts` |
| 4 | C-R1.1, C-R1.4 and the nits C-R1.5 to C-R1.8 | `rate-limit-store.ts` |
| 5 | C-R1.2, as its own commit | `rate-limit-store.ts`, new `neon-rate-limit-store.ts`, `fake-rate-limit-store.ts`, `index.ts`; import lines only in tests |

*Reading:* this section; the three slice files; ADR 0145; ADR 0136. *Must not:* either SQL
statement's text changes; `0007` changes. Item 1 shares no file with the rest and may go to a
second implementer beside them. **The wave's ADR number is reserved before the round**, so items
3 and 4 can cite it.

**After the round.**

- **QA:** re-aims its N = 0 test; runs its files once. **The thirty are not re-run if both
  statements are byte for byte what they were**, shown by a diff of the two strings against
  `ae1a8dd`. If either changed at all, the thirty again.
- **Security** re-checks item 1, with the list of who may drop a table, and items 2 and S-R1.3's
  wording. **Logic** re-checks items 2 and 3. **Clean-code** re-checks items 4 and 5 and the QA
  files' diff. Each on its own findings only.

**What later waves inherit. Recorded, not built.**

- **8F:**
  - The key's encoding, the closed set of names and its property (S-R1.3).
  - A change of a window's length is a new policy name (S-R1.4).
  - A policy with no bucket is refused when built (S-R1.2).
  - The list's length is the policy's and never a request's (S-R1.6).
  - The store sets no time limit, so 8F brings its own deadline and refuses when it passes
    (S-R1.7).
  - It fails closed on any throw, two of which are not `RateLimitStoreError` (L-R1.6).
  - The fake cannot be reached in a deployed build (S-R1.11, its criterion 9), and differs from
    the Neon store as listed (L-R1.5).
  - ~~The digest is one function, so a key added later is one function's change.~~ **(Replaced
    2026-10-08: the digest is keyed from 8F's first deploy, with the one secret the owner
    approved; nothing is added later. See *The digest secret*, under 8I.)**
- **8G:**
  - The prune's margin (L-R1.1).
  - Its instant is the server's clock and never a request's value (S-R1.5).
  - A prune that fails is seen (S-R1.5).
  - A prune over a flood's rows may not finish in one statement (S-R1.5).
  - The number it logs is a lower bound (L-R1.2).
- **8K:** whether the digest is keyed is decided in its S0, before an e-mail is ever a subject.

**Backlog.** S-R1.9, with the older tables' grant tests. S-R1.10 is ADR 0146's recorded limit and
needs no new entry.

**For the owner, relayed by the coordinator. I do not disagree with either.**

- *The keyed hash* is a security question and is the reviewer's recommendation, not my ruling:
  unkeyed for 8E and 8F as a recorded limit, decided in 8K's S0, keyed recommended there. One
  consequence to say with it: adding a key later changes every key, so every count starts again
  at that deploy. Harmless for a day's limit, and better known beforehand. **(Overtaken
  2026-10-08: the owner said yes to the secret, and 8F keys from the start, so no count restarts
  for this reason. See *The digest secret*, under 8I.)**
- *The nine steps for applying `0007` and its grant* belong in `docs/runbooks/`, named for the
  operation and not the wave, since 8H's table will need the same steps; `0007` is its first
  worked case. This plan's *Owner action after this wave* and the environments guide point at
  it.

#### 8E as closed, 2026-10-08

**Shipped, on `m8-review-contact-success`, not pushed [coordinator ran `git log`; HEAD `c8305b1`]:** `ec2f181` S1;
`087e09f` QA round 1 (red: F1, F2); `91be523` adjudication; `9444910` fix round (S1 refusal, F2, grant test);
`3ad36c3` deadlock ruling; `c317371` QA's sharpened race; `33778b1` the prune's lock order; `a681234` QA round 2 (F3);
`9f58c47` F3 ruling; `0abe863` F3 fix; `ae1a8dd` QA round 3, green, the commit the three reviewers read; `004c8a1`
reviews ruled; `98b1f6b` review round items 1 to 4 (criterion 13); `aa8a015` item 5 (the Neon class moved); `c8305b1`
QA round 4, green. Files under `packages/persistence/` [source-verified by reviewers]: `src/migrations/0007_create_rate_limit_counters.sql`,
`src/rate-limit-store.ts` (the port; loads no driver), `src/neon-rate-limit-store.ts`, `src/fake-rate-limit-store.ts`,
exports in `src/index.ts`; tests and support files as listed in the hand-over, with QA's `qa-8e-*` files.

**Evidence, by who ran it.**

- *Coordinator-run.* At `c8305b1`: `pnpm --filter @lemnaria/persistence run test` exit 0, 64 files, 1788 passed, 1
  skipped; typecheck 0. At `aa8a015`: persistence typecheck 0, lint 0, web typecheck 0, `pnpm gate:boundary` 0; both
  SQL template strings byte-identical to `ae1a8dd` (758 and 587 characters); a grep of the port and the fake for the
  driver, the opener and the retry found no match. At `ae1a8dd`: `migrate:unattended-check` 0.
- *QA (m8-8e-qa), live test database.* 150 concurrent hits return 1…150 once each; exactly one HTTP request for 1, 2
  and 1000 buckets; 20 non-digest key shapes refused by code and by the constraint; prune exact at the boundary, twice
  and concurrently. The race (16 hits listing 150 expired rows against 8 prunes, 3 rounds): 10 of 10 runs red with
  SQLSTATE `40P01` against the unordered prune (counts 6, 3, 4, 10, 19, 8, 9, 2, 3, 6), then 30 of 30 green at
  `33778b1`, every expired row gone. Criterion 10 live and in the fake, including two callers racing a fresh key with
  different ends (never a mixed row). Criterion 11 over all 25 two-step and 12 seeded six-step lost-reply sequences
  through `loseTheFirstReply`: answered ≤ stored ≤ attempts. Criterion 13: the privilege file run as a child process
  against the test database (the role owns `designs`): every test failed at the guard, none passed or skipped; the
  pure reasons function over all 96 fact combinations. Rows left after every run: 0 for the keys issued (1842 in the
  last).
- *Reviews, at `ae1a8dd`.* Logic: approve with should-fix. Clean-code: approve with should-fix. Security: approve, no
  must-fix in code. Re-checks at `c8305b1`: all three closed their items. Logic's one open condition, the code citing
  ADR 0149 at `neon-rate-limit-store.ts:50` and `:127`, is closed by the ADR now existing.

**Incidents and corrections, plainly.**

1. *The privilege test and production.* Since M2 the test sent `truncate designs`, `drop table designs`, `create table
   privilege_probe` and two deletes of nonexistent rows at `DATABASE_URL`, which on a developer machine resolves
   through the repo-root `.env.local` to production [doc `environments-and-resources.md:64`]. Every ordinary
   persistence-suite run sent them; they were refused because the role is the application's. Found by the security
   reviewer, traced by the architect, fixed in `98b1f6b`. The file now prints `reached database "lemn-conf-v2" as role
   "app_designs"` [coordinator-run]. **Not verified:** nobody inspected the production database; "refused" is inferred
   from the tests having passed. **Still true after the fix:** every suite run reaches production for this file with
   catalog reads and the two guarded deletes. Security rules that acceptable; removing both loses nothing if the owner
   wants no write-shaped statement sent. That, and the environment table's shape, are the owner's.
2. *QA's first live run crashed its own cleanup* and left 3 rows in the test database's `rate_limit_counters`; QA
   deleted them by era, then by key. The architect allowed the `beforeAll` on three conditions (one eras support file;
   the removed count reported; test database only), now met. **Whether the original deletion was within the rules is
   the owner's, and unruled.**
3. *Seen once, not reproduced.* 1 of 150 concurrent hits rejected with `RateLimitStoreError`, cause `{ name:
   "NeonDbError" }` with no SQLSTATE; 12 isolated runs and three further full runs green. The logic reviewer [src,
   driver 1.1.0]: the store constructs no `NeonDbError`; a code-less one is a rejected fetch, a non-400 status, or a
   400 without a code, so transport or proxy. It failed closed. The test now records the HTTP status. Backlog 141.
4. *The developer's first report lost the test run's exit code behind a trailing pipe;* the coordinator re-ran it.

**Not proven.** The grant test's body has **never executed anywhere**: the table is absent from the database
`DATABASE_URL` reaches, so it skips, and the result "exactly four" is observed nowhere. Nothing ran on a CI runner;
`pnpm check`, `pnpm ci:local` and e2e were not run. The prune's lock order is documented [logic reviewer, Postgres 17
docs]; that an insert consumes its select's rows in order is observed (30 of 30), not documented. Criterion 11 holds
*within the harness's reach*: not two losses inside one call, not a lost reply interleaved with another caller, not a
lost reply on a prune, on the live database. The server versions of preview and production are unread, as is whether
their application roles hold any membership (QA: the test database's role is in `pg_maintain`, so the grant test would
be red on `MAINTAIN` there, correctly). HOT updates when `window_end` is rewritten with itself are inference (the cost
if wrong is index churn).

**Deviations.** Criteria 10 to 13 were added during the wave (rule S1, rule S2, one lock order, the privilege file safe
on any credential), and criteria 2, 7 and 11 were restated, each in the sections above. Criterion 12's lock-order claim
is a recorded limit with a trigger (a `40P01` from this module, or a new major Postgres version). The ruling was
that no `qa-*` file is edited by the implementer beyond import lines for C-R1.2. The clean-code re-check confirmed it
from `git diff ae1a8dd..aa8a015`: two added import lines naming the moved class and two removed entries, nothing else
[relayed, reviewer-run]; QA confirmed the same of its own files [relayed, QA-run].

**Owner action outstanding.** Apply `0007` and its grant, preview then production, by [the
runbook](../runbooks/applying-a-table-migration-and-its-application-role-grant.md), quoting the privilege test's
`reached database … as role …` line with the table's test run and not skipped. Four decisions: backlog 142.

**Deferred.** The older tables' grant tests (backlog 139, owner the coordinator with the security reviewer, trigger the
delivery milestone's launch gate); CI with `DATABASE_URL` (140, the delivery milestone); the one-off `NeonDbError`
(141, trigger a recurrence). Rule S2 and the unkeyed digest are recorded in ADR 0149.

**Documentation updated.** [ADR 0149](../decisions/0149-the-rate-limit-store-keeps-one-row-per-bucket-per-window-refuses-a-broken-promise-and-may-count-high-but-never-low-between-prunes.md)
(new); ADR 0145 (dated note); the runbook (new); `environments-and-resources.md` (the repo-root row); backlog 139 to
142; `STATUS.md`.

### 8F — the limiter and the mint

> **8F's dispatch must read *What later waves inherit* in *8E — the three reviews, ruled 2026-10-08* and ADR 0149
> before anything else here.** It lists the key's encoding and its property, the deadline, failing closed on any throw,
> and the fake's limits.

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
> - **Criterion 1**: the prefix is a datum, **and Q32 set it later the same day: /24 for IPv4**
>   (the owner's choice), /64 for IPv6 (the architect's reading); /32, /24 and /64 stay as named
>   cases of the reduction. An absent
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
>
> **Added 2026-10-08: every bucket's key is a keyed digest, from the first commit** (*The digest
> secret*, under 8I; rule S1 of 8E as restated). **S1 gains the module:** one function that
> digests a purpose and its fields under a key it is handed, and one that reads `DIGEST_SECRET`
> and refuses when it is unset or not sixty-four hexadecimal characters; `.env.example` gains the
> name. ~~**S0 gains two things to settle with the security reader:** that keying from the start is
> right, and the encoding.~~ **Keyed from its first deploy, by the owner's word** (*"lets use same
> secret"*, 2026-10-08 [relayed]); **S0 gains one thing to settle with the security reader, the
> encoding.** **The e2e harness makes a fresh value for each run.** *Criterion,
> added:* with the variable unset the mint is refused as a store failure is, and no row is
> written; *must not:* any key but the variable's is ever used. **Owner action before this wave
> is merged: `DIGEST_SECRET` set in production, preview, development and `apps/web/.env.local`.
> Until it is, that environment creates no design.**

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
*Tier: ~~Full.~~ **Full + security, scoped** (2026-10-08; see *S3 as built*).*

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
   these values reach an e-mail. **(Added 2026-10-08, see *S1's readings*: an invisible format
   character is removed and not refused, and no stored value holds one.)**
3. Each field has a stated maximum length and refuses one character past it.
4. E-mail is required exactly when the channel is e-mail (Q6 (ii), answered); locality may be empty
   (Q6 (i), answered). Consent that is not `true`
   is refused with its own code.
5. The request type has no price field (D6). An unknown extra field is refused, not ignored.
6. **The snapshot.** Its document round-trips through ~~`serializeDesign`~~
   `canonicalSerializeDesign` byte for byte. ~~Its total for the seeded L kitchen equals the
   literal already pinned for it, not a second call of the same function.~~ **(Restated
   2026-10-08: no such literal exists; see *S3, restated*.)** It carries the book's version. It
   contains no contact field, by type.
7. A design with a body past its wall yields a refusal naming exactly `findOverflowingPlacementIds`,
   for generated kitchens on all three walls. ~~An empty kitchen and an unpriceable one are each
   refused with their own code.~~ **(Restated 2026-10-08 to ADR 0148's three refusals in its
   order; see *S3, restated*.)**
8. *Must not:* the package reads a clock, generates an id, or imports anything outside itself.

*QA reading:* the criteria; `tests/pricing/`; `scripts/gates/boundary.sh`; `fast-check`. *Logic
reader:* ADR 0001, 0065, 0072; ARCH §9. *Clean-code reader:* the slice files.

#### 8H — S1's readings, ruled 2026-10-08

S1 is `aecacbd` [ran: `git log`]; domain typecheck and lint exit 0, 6511 passed, boundary 0
[relayed, coordinator-run]. Ten readings. **Seven stand, three change, one question is the
owner's.** None of the bounds below is in a record; where I confirm one it is the architect's
reading, and the wave's ADR says so.

| # | Reading | Ruling |
| --- | --- | --- |
| 1 | The normal form is `+` and digits; a Moldovan number is `+373` and exactly eight | **Confirmed.** Criterion 1, and frame 4B's *"8 cifre după prefix"* [doc `…Mobil.dc.html:1288`] |
| 2 | An international number is `+`, a first digit 1 to 9, seven to fifteen digits | **Confirmed, as bounds from outside the records.** Fifteen is E.164's ceiling and seven a judgement of the shortest in use [inf: the implementer's knowledge and mine; nobody read the standard here]. Technical, not the owner's |
| 3 | Grouping is space, hyphen and round brackets; a dot, a no-break space and `00373…` are refused | **The three stand; the rest is Q33, the owner's.** Below |
| 4 | Three phone codes | **Changed: criterion 9.** Below |
| 5 | Lengths: name 100, locality 100, e-mail 254, phone as typed 32, in code points after trimming | **Confirmed.** Criterion 3 asked for a stated maximum and these are stated. 8I's columns and 8L's inputs take the same exported constants; *must not:* a second literal |
| 6 | Cc, Cf, Cs, Zl and Zp are refused, before trimming | **Changed for Cf: criterion 10.** Below |
| 7 | With another channel, an e-mail is neither judged nor carried | **Confirmed.** The input does not exist for that channel (Q6 (ii)), and an address the customer did not ask us to use is not kept. *Must not:* the dropped value reaches the store, the mail or a log |
| 8 | `z.email()` after the length check; a non-ASCII address is refused | **Confirmed, as a recorded limit** with its trigger (ADR 0118): a customer reports a refused address. The customer with one can choose the phone |
| 9 | The consent text's version is any identifier the client sends | **Changed: criterion 11.** Below |
| 10 | The result is `validate-room.ts`'s shape; no value in a refusal | **Confirmed** (ADR 0095; ADR 0108 d3) |

**Criterion 9, added — a phone refusal says which form it judged (reading 4).** Frame 4B's
sentence, *"Așteptăm 8 cifre după prefix"*, is true of a Moldovan number and false of *"+39 12"*.
As built both are `PHONE_INCOMPLETE`, so 8L cannot know which sentence is true. A refusal tells
the Moldovan form from the international one, by a code or by a code and a datum that is not a
number. *Must not:* a refusal carries a digit count, or the typed value.

**Criterion 10, added — an invisible format character is removed, not refused (reading 6).**
Cc, Cs, Zl and Zp are refused as built: criterion 2, and a line break reaches a browser's
one-line input only from a client that is not one. **Cf is different, and wider than criterion 2
asked.** A number copied from a contact card or a spreadsheet often carries direction marks, and
a place name copied from a page a soft hyphen [inf, from experience, unmeasured here]. Refused,
the customer is told a character is forbidden in a value that looks right, and cannot find it.
Removed, the danger the refusal guarded against is gone as well, since a direction override that
is not stored cannot reorder a line in the shop's mail.

- Every Cf character is removed from every text field before anything else is judged, the phone
  included. **(Restated 2026-10-08, reviews L-R1.1 and S-R1.2: *"before anything else"* was
  wrong. Ill-formed text is refused first, on the value as it arrived; see *the three reviews*.)** *Must not:* a value that is returned, stored or mailed holds one; a customer is
  refused for one.
- *The cost, named:* a joiner that a few scripts spell with is removed too, and such a name is
  stored slightly misspelt and not refused. The customers are Romanian and Russian speakers.
  **Architect's ruling, open to the owner.**

**Criterion 11, added — the consent text's version is the client's to state and the code's to
recognise (reading 9).** *Who supplies it:* the client. Q7's answer has the submission record
*"which consent text version was shown"*, and only the page knows what it showed; a server that
stamped its own would record the wrong one for a tab left open across a deploy. *But not any
string:* the version is one of **a closed set declared in the domain**, and one outside it is
refused with its own code. So no row holds an identifier nobody published. Today the set has one
member, and it names the placeholder (Q7 (b)). *Must not:* the set is written twice; a version is
removed from it once a submission could carry it.

**Q33, for the owner — which ways of writing a number are accepted?** The rule the owner agreed
is *"0 and eight digits, or +373 and eight"*, and an international number *"written with `+`"*.
S1 builds exactly that. Four things a real customer types are therefore refused today:
*"069.123.456"*, with dots; *"00373 69 123 456"*, with `00` for `+`; *"+373 (0)69 123 456"*, with
the 0 kept after the code; and *"69123456"*, eight digits and no prefix. A fifth, a no-break space
from a pasted number, I rule myself: it is a space, and is grouping. *Recommended:* accept all
four, since each has one reading and the normal form is the same. *If unanswered:* as built. It
blocks nothing, and widening later moves no stored value. ~~*Not ruled.*~~ **Answered
2026-10-08: as built; the four stay refused, and the recommendation is not taken [relayed]. See
*The owner's answers of 2026-10-08*.**

**For 8L, recorded.** A Romanian number typed as at home, *"0722 123 456"*, is read as a Moldovan
number with too many digits. The sentence for that refusal says how to write a number from
outside Moldova. It is a new leaf and the owner's copy.

**The follow-up to S1, before S2. The same implementer, three items, two production files.**

| # | Does | Files |
| --- | --- | --- |
| 1 | Criterion 10: Cf removed in every field; a no-break space is grouping | `contact/contact-fields.ts`, `contact/phone-number.ts` |
| 2 | Criterion 9: the two forms told apart | `contact/phone-number.ts`, `contact/contact-fields.ts` |
| 3 | Criterion 11: the closed set and its code | `contact/contact-fields.ts`, `index.ts` |

*Reading:* this section; ADR 0095; the two files.

**S2's dispatch — confirmed as the slice table has it, with five things made exact.**

- **Strict at every level.** An unknown field is refused at the top of the request **and inside
  the contact fields**, where S1's own type would let one pass unseen
  [src `contact-fields.ts:57-60`]. Reading 7 is not an exception to this: an e-mail is a known
  field, dropped for a stated reason.
- **No price, by type and by test (criterion 5, D6):** a request carrying a total, a line or a
  book version is refused as an unknown field.
- **The design reference** is an id and a revision in the shapes the domain and the store already
  give them, or it is absent together with an intent from a closed set, which today has one
  member, the callback of Q12 (i). *Must not:* both, or neither.
- **The locale** is one of the locales the application serves. One list of them exists in the
  repository; S2 does not write a second.
- **The client request id, the honeypot and the timing fields** get a shape and a bound here and
  no meaning: what a filled honeypot or a fast submit is, is 8K's (D9), and the package reads no
  clock (criterion 8).

S2's result has S1's shape: every failing field once, a code each, no value.

#### 8H — S2's readings and the locale, ruled 2026-10-08

S2 is `8da0e6a`, on the S1 follow-up `e135d52` [ran: `git log`].

**The locale — option (a): the list is a parameter.** `validateContactSubmission` takes the
locales the application serves, and 8K and the form both pass `routing.locales`
[src `apps/web/src/i18n/routing.ts:4`]. The domain knows no language (ADR 0095) and
keeps knowing none. *Why not (b):* the web's routing would then depend on the domain for a list
only the web uses. *Why not (c):* one request would be judged in two places, with two shapes of
refusal. **Criterion 12, added.** A locale outside the list is refused with its own code.
*Must not:* the parameter has a default, since a default is the second list; an empty list is
accepted, since it is a mistake in the caller and it throws.

| # | Reading | Ruling |
| --- | --- | --- |
| 1 | A `design` or an `intent`, in a type that holds exactly one; `design: null` is refused | **Confirmed** |
| 2 | The id's shape, copied from what the generator makes | **The shape is right; the copy is not its home.** Below |
| 3 | The revision's shape, copied from persistence; a JSON number refused | **Confirmed, and tied.** Below |
| 4 | The client request id is 16 to 64 of `A-Za-z0-9_-` | **Confirmed, as the architect's reading.** Below |
| 5 | The honeypot is optional text, bounded, carried and never judged | **Confirmed.** *For 8K:* its content is never stored, mailed or logged; only that it was filled |
| 6 | `elapsedMs`, an integer from 0 to a day | **Changed: criterion 13.** Below |
| 7 | Strict at three levels; `UNKNOWN_FIELD` names the level and never the key | **Confirmed** |
| 8a | The consent set's one member is `"placeholder"` | **Confirmed.** It says what it is. *For the launch gate:* Q7 (b)'s line is that no page sends it |
| 8b | U+202F and U+2007 are refused in a phone | **Changed.** My ruling named one space and meant the kind: **any space separator, Unicode's Zs, is grouping** |
| 8c | A channel padded with a format character is `UNKNOWN_CHANNEL` | **Confirmed.** Criterion 10 is for what a customer types or pastes; a value the page sends from a closed set is matched exactly |

**Readings 2 and 3 — one home for each shape, and a test that ties the other end.**

- *The id.* Nothing states its shape today: the generator makes it [src
  `persistence/src/generate-design-id.ts`] and the domain's `DesignId` is any string
  [src `configurator-domain/src/repository.ts:5`]. **Its home is the domain, beside `DesignId`,
  as one exported predicate.** The request uses it. A test in persistence holds the generator to
  it. **And 8L S2 changes with this:** the shared owned load calls this predicate and writes no
  shape of its own. The note under 8L says *"S2 puts the id's shape into that one function"*; it
  now means *calls the domain's*.
- *The revision.* Its home stays persistence's `isDesignRevision`, which carries the whole reason
  the token is a string [src `persistence/src/design-revision.ts`]. The domain cannot import it,
  so the domain's statement is a second one, **exported and named, and tied by a property in
  persistence's tests: for any string the two give one answer.** Merging them is a change to
  persistence that this wave does not own.
- **A limit, for 8L S2 before it gates a door on the id:** that every design already stored has
  the generator's shape is **not measured**. A page that refuses by shape would close an older
  design's link. The owner reads the live ids once, a count and no value, before that slice
  ships. For the contact request the consequence is smaller and the same.

**Reading 4 — the client request id.** The shape suits both uses, with one thing unread. For
Resend it is plain header text, which is what the shape is for. **Whether Resend bounds a key's
length is not in the vendor read** [ven §4, searched: it records the twenty-four hours and the
`409` and no length], so that sixty-four characters fit is not established; 8J reads that page
before it relies on it. For 8I it is a bounded text key. *What the shape does not give, and 8I and 8K must:* the client
chooses it, so it proves nothing. One id with another body is a conflict and never an answer; 8I's
payload hash is what says so.

**Criterion 13, added — nobody is refused for taking long (reading 6).** One number is right:
the domain reads no clock, and two timestamps prove no more than one figure the client also
chose. But a day's ceiling refuses the customer who left the tab open and came back, with a
refusal no sentence can explain. `elapsedMs` is any non-negative whole number a JSON number holds
exactly. What is too fast is 8K's. *Must not:* a slow submission is refused here.

**`docs/CONFIGURATION_MODEL.md:238-240`, which the implementer did not find.** It reads:
*"Contact details are not part of the reusable kitchen configuration. A submission combines
separate validated contact fields with an immutable configuration snapshot and its recomputed
pricing result"* [doc]. **It binds nothing S2 did not already do:** the request holds contact
fields and a reference, no design document and no price, and an attempt to add either is an
unknown field. It binds S3, below.

**The follow-up to S2, before S3. The same implementer, four items.**

| # | Does | Files |
| --- | --- | --- |
| 1 | Criterion 12: the locales as a parameter, and its code | `contact/contact-submission.ts` |
| 2 | The id's predicate beside `DesignId`; the revision's, exported; the two tie tests | `repository.ts` or a file beside it, `contact/contact-submission.ts`, `index.ts`; two tests under `packages/persistence/tests/` |
| 3 | Criterion 13 | `contact/contact-submission.ts` |
| 4 | Zs is grouping | `contact/phone-number.ts` |

*Reading:* this section; the two persistence files named above.

#### 8H — S3, restated 2026-10-08

**Two things in the dispatch as written were wrong, and both were mine.**

- *"The literal already pinned"* for the seeded L kitchen's total **does not exist.** No test in
  either package holds a total for it [ran: searches of `packages/configurator-domain/tests` and
  `apps/web/tests` for a literal total, the figure and the fixture's name]. The criterion cited a
  thing nobody had looked for.
- *"An empty kitchen … refused with its own code"* predates ADR 0148, which later ruled that *no
  cabinet* means **nothing Lemnaria supplies** and fixed the order of the three refusals.

**What S3 builds.** One pure function: from a design, the catalogue, a book and the version asked
for, either the snapshot or a refusal. The snapshot is the canonical document and **the priced
design as `priceDesign` returned it**: every line, the exact total, the currency, the book's
version and what the book says of itself. Nothing is re-derived and nothing is rounded.

**Criterion 6, restated.**

- *The document:* it parses as a design, and serialising that again gives the same bytes.
- *The price:* for generated kitchens the snapshot's lines and total are `priceDesign`'s for the
  same request, **through one call and no second route**.
- *The literal, which S3 writes:* for one kitchen small enough to add up by hand, under a book
  whose rows the test states or quotes, the total is a number written in the test **with its
  sum shown beside it**. It is not the function's output copied back. It lives in
  `packages/configurator-domain/tests/contact/`.
- *By type:* no contact field; and **no figure that was shown**, since a rounded amount is a
  screen's.

**Criterion 7, restated — the server refuses what the review refuses, by one rule.** The three
refusals are ADR 0148's, in its order: a body past its wall, naming exactly
`findOverflowingPlacementIds`; nothing Lemnaria supplies; a price that cannot be computed.

- **The rule has one home, and it becomes the domain.** Today the order is in the web's review
  model, under a comment that says *"in one place"* [src `apps/web/src/review/review-model.ts`],
  and *nothing Lemnaria supplies* is in the web's price module
  [src `apps/web/src/price/starting-price.ts:73-77`]. A second copy for the server would have the
  screen offer what the endpoint refuses. **S3 moves both into the domain and the review calls
  them.** *Must not:* the rule is written twice; a `qa-8c-*` or `qa-8d-*` file is edited; the
  review's refusals change for any kitchen.
- **As a property:** for generated kitchens on all three walls, the snapshot is refused exactly
  when the review's call to action is, with the same code and the same bodies.

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S3 | The snapshot or its refusal; the refusal rule moved to the domain, the review calling it | new `contact/submission-snapshot.ts`, a home for the rule beside it, `index.ts`; `apps/web/src/review/review-model.ts`, `apps/web/src/price/starting-price.ts` | this section; D7, D14; ADR 0148 decisions 1 to 3; ADR 0065 d6, d7; ADR 0072; `docs/CONFIGURATION_MODEL.md:238-240`; `pricing/price-design.ts`, `price-lines.ts`; `serialize-design.ts` |

*QA gains:* the parity property above, which stands in the web's tests because it reads both
sides; and 8C's own parity files, green and untouched.

#### 8H — S3 as built, ruled 2026-10-08

S3 is `8539f66` [ran: `git log`]. Domain 6754 passed, web 6172 passed with no `qa-*` file
touched, typecheck, lint and boundary exit 0 in both [relayed, coordinator-run].

**The deviation — the rule is handed the fit query's answer and does not ask it. It satisfies
the must-not. Accepted.** *"Written twice"* was about the decision: which refusal comes first and
what each means. That is one function now [src `contact/submission-eligibility.ts:34-47`]. The
fit query is one function too, with two callers that each put the same question, as pricing has
always put it a third time. Asking a question in two places is not stating a rule in two.

- *The reason given is sound, and it was mine to foresee.* A rule inside the built package that
  called the query would not pass through QA's replacement of it, and
  `qa-8c-fit-is-the-querys-answer` would go red for how it looks and not for what it checks. I
  had forbidden editing that file in the same breath as asking for the move.
- *What the shape costs, and what holds it.* The rule believes its caller about fit. A caller
  that hands it an empty list skips the first refusal. **Criterion 14, added.** On the server the
  facts are put together in one place, `snapshotSubmission`, from one design
  [src `contact/submission-snapshot.ts:36-41`]. *Must not:* 8K, or anything that answers a
  request, calls the rule with a list of its own making; it calls the snapshot. In the review the
  list is checked against the price's own [src `review-model.ts`, `assertInputsAreOneDesigns`],
  as 8C built it.
- *Not asked for:* the rule checking the list against the price itself. It would throw before the
  review's own check, with another error, and turn 8C's files red for the same wrong reason.

| # | Reading | Ruling |
| --- | --- | --- |
| 1 | The snapshot is the canonical document and the priced design whole, priced with the design's own settings | **Confirmed.** Whole is what was asked. The settings are what every price surface passes [src `apps/web/src/price/use-priced-design.ts:89, 113`], and the request's type leaves the server no way to pass others |
| 2 | The review's three codes; the bodies as the query gave them | **Confirmed** |
| 3 | An allowed judgement carries the price it judged | **Confirmed.** The server prices once |
| 4 | The review throws if the rule allows what the view calls unavailable | **Confirmed.** It cannot happen, and a throw is the answer for what cannot: no quiet second path |
| 5 | `PRICING_FAILED` says nothing of why | **Changed: criterion 15.** Below |
| 6 | The web's price module re-exports the predicate it used to own | **Changed.** Below |
| 7 | The literal: a book stated in the test, two wall cabinets, 53 500 with its sum | **Confirmed.** A stated book is what *"states or quotes"* meant. The literal's work is to show that the snapshot holds the sum of the book it was handed, by a number no call produced; the shipped book's arithmetic is its own tests' |

**Criterion 15, added — a refusal that is our fault says what failed (reading 5).** A body past
its wall and an empty kitchen are the customer's to mend. A price that cannot be computed is a
defect in a book or the catalogue, and a customer who meets it has lost a request through no act
of theirs. `PRICING_FAILED` carries the pricing failure as `priceDesign` returned it, so the
endpoint can log it. *Must not:* the review prints any of it; the failure is re-worded on the
way. It holds design data and no contact field [src `pricing/price-lines.ts:153-160`].

**Reading 6 — the re-export goes.** Nothing in the web's source uses it. It exists for one test
[ran: a search of `apps/web/src` and `apps/web/tests`], which is the web's own and no `qa-*`
file. A function lives in one place and is imported from there; a second door says the price
module owns what it no longer does. **The test follows the function into the domain's tests.**

**These two changes go in the first fix round**, with whatever QA and the reviewers find, so the
tree does not move under QA. The reviewers are told both are already ruled.

**What each reads, for the whole wave, S1 to S3.**

- **QA:** criteria 1 to 15 as restated; every dated section under 8H; `tests/pricing/`;
  `apps/web/tests/review/qa-8c-*`, read and not edited; `fast-check`. *What it attacks first:* an
  unknown key at each of the three levels, the inherited ones included; that no refusal holds a
  key or a value the sender wrote, for arbitrary input; the phone's normal form under every
  grouping; the parity of criterion 7 over generated kitchens; that the package reads no clock
  and imports nothing outside itself.
- **Logic:** the five files under `contact/`, the id's predicate, and the diff of
  `review-model.ts`. ADR 0001 d6; ADR 0065 d6, d7; ADR 0072; ADR 0095; ADR 0108 d3; ADR 0148
  decisions 1 to 4; ARCH §9; `docs/CONFIGURATION_MODEL.md:238-240`. *Its two questions:* does the
  review refuse exactly the kitchens it refused at `a9e1843`; and is every bound and code what
  these sections rule.
- **Clean-code:** the same files and `index.ts`; ADR 0136.

**A security reader, yes, and scoped. The wave's tier becomes Full + security, by this ruling.**
8K's review will read how these values are used. What a value *may be* is decided here, and the
store and the mail are built on it before 8K exists. *It reads:* `contact-fields.ts`,
`phone-number.ts`, `contact-submission.ts`; criteria 2, 5, 10 and 11; ADR 0146 B3. *It answers
five questions and no others:*

1. Can any accepted value hold a character that ends a line or a header, or reorders one, in the
   shop's mail?
2. Does any refusal carry the sender's text, a key included?
3. Is an own key named like a prototype's refused as unknown, at every level?
4. Is any check more than linear in the input, before 8K's body limit has bounded it?
5. Is the client request id safe as a header's value and as a key, as shaped?

#### 8H — adjudication of QA, 2026-10-08

**State.** QA's files are `4a37d56` [ran: `git log`]. Domain: 7492 passed, 5 failed on two
findings. Web: 6200 passed. Typechecks and boundary exit 0 [relayed, QA-run]. Criteria 1 to 13
hold apart from the findings, and the parity of criterion 7 holds with no disagreement.

| Finding | Class | Ruling |
| --- | --- | --- |
| F1 a Moldovan number may begin with 0 | **Contract gap**, and a false sentence of mine | Criterion 16 |
| F2 an inherited property is read as the sender's | **Implementation defect** (criterion 5), with a comment and a test that say otherwise | Criterion 17 |
| F3 the rule believes facts that contradict each other | **Contract gap**, in the reading I accepted | Criterion 18 |
| F4 no normalisation of composed and decomposed letters | **Contract gap** | Criterion 19 |
| F5 a name of invisible characters that are not format characters | Contract gap, low | **Recorded limit.** Trigger: the shop receives a request with a blank name. The phone is what the shop calls, and it is sound |
| F6 the consent version is trimmed before it is matched | Nit | In the round: a closed set is matched exactly, as reading 8c ruled for the channel |
| F7 symbol and non-enumerable keys are not seen | Contract gap, low | **Recorded, no action.** The input is JSON's, which has neither |
| F8 an object from another realm is not an object | For 8K | **Recorded for 8K.** It errs toward refusing. 8K's test posts a real request through the route and must get past it |
| F9 a served list holding `""`; F10 `-0` carried | Nits | **No action.** The list is the application's own constant, and `-0` leaves as `0` in JSON |
| F11 the snapshot serialises and never parses | **Contract gap** against criterion 6 | Criterion 20 |
| F12 nineteen digits is wider than the column | Nit, and persistence's | **Backlog**, owner whoever next opens `design-revision.ts`. The two predicates are tied; narrowing one alone breaks the tie. *For 8K:* a revision the column cannot hold is a mismatch, a refusal and not a failure |

**Criterion 16, added — a Moldovan subscriber number does not begin with 0 (F1).** I wrote that
*"00373…"* and *"+373 (0)…"* are *"refused today"*. At exactly one length they were not, and a
number nobody can dial was stored.

- *The rule, and what it rests on.* The 0 in *"0 and eight digits"* is the prefix. A number whose
  own first digit were 0 would be written with two, and two zeros is how a call abroad begins.
  So the eight digits do not start with 0. **[inf: this is how a plan with that prefix is built;
  no record here states Moldova's, and nobody read it.]** Which other first digits exist is a
  fact about the numbering plan that I do not rule. **(2026-10-08: the owner was asked and said
  *"All number in Moldova start with an 0 mobile or fix numbers"* [relayed]. That speaks of the
  prefix, not of the first of the eight~~, so this still rests on the inference~~. Asked again, he
  said *"no there is no number 00x xxx xxx , only one 0 at start"* [relayed]. **Tier, from then:
  the owner's word, with the inference above as its reason and no longer its only ground.**)**
- *The refusal* is not *incomplete* and not *too many*: neither sentence would be true.
- *With Q33:* if the owner accepts those spellings, they are read as what they mean, the 0
  dropped or the `00` read as `+`. This criterion is what makes that reading safe, and it stands
  either way. **(Q33 answered 2026-10-08: they are not accepted. The criterion stands.)**

**Criterion 17, added — only what the sender wrote is read (F2).** Every field, at every level,
is read as the object's own property. **The check is in `validateContactFields` itself**, since
the form calls it without the request around it. *Must not:* a consent, a channel or a locality
is accepted from anything the body did not hold. The comment and the test that claimed this are
made true or removed.

**Criterion 18, added — the rule refuses facts that cannot all be true (F3).** Criterion 14
stands and is not enough: the rule is exported, and a rule that can be talked into *allowed* is
one careless caller from sending the shop a kitchen that cannot be built (ADR 0065 d7).

- The list handed in names only bodies the design holds. Where the design was priced, it is the
  same set as the price's own list, which pricing took from the query. Otherwise the rule
  **throws** a named error: it is a caller's defect and no customer's refusal. So *allowed* now
  means the price itself found no body past a wall.
- **The review checks its inputs before it asks the rule**, so its own error is the one that is
  thrown, as 8C's files expect. *Must not:* a `qa-8c-*` or `qa-8d-*` file goes red or is edited.
  **If the check cannot be added without that, the implementer stops and names the test.**
- Sets are compared, not order: the query's order and the display's differ, and both are right.

**Criterion 19, added — one stored form for one name (F4).** Every typed text field is brought to
Unicode's composed form, NFC, after format characters are removed and before it is trimmed,
measured or returned. A hundred letters are a hundred however the keyboard built them. *Must
not:* the compatibility form is used, which would change letters the customer chose.
**(Restated 2026-10-08, review S-R1.1: *"before it is measured"* was wrong. A value far past its
bound is refused before it is composed; see *the three reviews*.)**

**Criterion 20, added — the snapshot holds a design, by its own check (F11).** The snapshot is
kept for good and nothing re-prices it, so it does not rest on what its caller validated.
`snapshotSubmission` parses what it is handed and prices and serialises the parsed design. A
value that is not a design **throws**; it is not a fourth refusal, since no customer can mend it.
**(Made exact 2026-10-08, review L-R1.9: *a design* here is the wire schema's. The catalogue's
own rules are not asked, for the reason in *the three reviews*.)**

**Noted, and right as built.** With only customer-supplied bodies and no price, the refusal is
`PRICING_FAILED`: without a price there is no supplier to read. The review says the same, and
criterion 15 lets the endpoint say why. QA's two totals against the shipped book, 530 560 and
530 260, are pins on that book and move with it, on purpose.

**The fix round. Five items over seven production files, so it is two dispatches. They share no
file and may run side by side.**

| # | Does | Files | Dispatch |
| --- | --- | --- | --- |
| 1 | Criterion 17 (F2) | `contact/contact-fields.ts`, `contact/contact-submission.ts` | A |
| 2 | Criterion 16 (F1) | `contact/phone-number.ts` | A |
| 3 | Criterion 19 (F4); F6 | `contact/contact-fields.ts` | A |
| 4 | Criteria 15, 18 and 20 | `contact/submission-eligibility.ts`, `contact/submission-snapshot.ts`, `apps/web/src/review/review-model.ts` | B |
| 5 | The re-export goes; its test moves to the domain | `apps/web/src/price/starting-price.ts`; the test | B |

*Reading, A:* this section; *S1's readings*; the three files. *Reading, B:* this section; *S3 as
built*; ADR 0148 decisions 1 to 3; `qa-8c-fit-is-the-querys-answer` and
`qa-8c-inputs-are-one-designs`, read and not edited.

**After the round.**

- **QA:** its five red tests go green untouched. It adds criteria 16 to 20, and **runs the parity
  property again**, since dispatch B moves the order of the review's own checks: no disagreement,
  as before.
- **Then the three readers, as named.** Logic gains the question whether criterion 18 can throw
  for any kitchen the review used to draw. Security is told F2 is known and fixed, and checks the
  fix under its third question.

*For the scribe, at the close:* the limits F5 and F7; F8 and F12's sentence under 8K; the
backlog entry for F12; criterion 16's evidence tier in the wave's ADR; ~~Q33 still open~~.
**(2026-10-08: Q33 is answered, as built; criterion 16's tier is the owner's word, both of his
sentences quoted in order. See *The owner's answers of 2026-10-08*.)**

#### 8H — the three reviews, ruled 2026-10-08

**State.** HEAD is `62ed5bc` [ran: `git log`]; domain 7698 passed, web 6227, typechecks and web
lint exit 0 [relayed, coordinator-run]. Logic: one must-fix. Security: one must-fix, and it
shares the logic reader's. Clean-code: no must-fix. **Both must-fixes come from the order two of
my criteria wrote down. The implementer built what they said.**

**S-R1.1 — composing a long value costs its length squared. Must-fix; implementation defect,
made by criterion 19.** I had the text composed *"before it is … measured"*. Composing reorders
a run of combining marks in quadratic time: a million units took 234 seconds [reviewer-run,
Node 24, relayed], and the endpoint will run this before any limit has counted the request.

**L-R1.1 and S-R1.2 — two halves of a character, split by a format character, join when it is
removed. Must-fix; implementation defect, made by criterion 10.** I had format characters removed
*"before anything else is judged"*. So a value that is not well-formed text passes the removal,
becomes well-formed, and holds an invisible character that the criterion says no stored value
holds [both reviewers ran it, relayed].

**Criterion 21, added — the order of the text check, and what bounds it.** For every typed text
field, in this order:

1. **Text that is not well-formed is refused, on the value as it arrived.** Nothing is removed
   from it first.
2. Format characters are removed.
3. **A value still longer than a fixed multiple of its field's bound is `TOO_LONG`, here.** The
   multiple is a named datum with its reason; the reviewer proposes eight, and I take it.
4. It is composed (criterion 19), checked for forbidden characters, trimmed and measured.

*Must not:* a step that costs more than the value's length runs before step 3; a returned value
holds a character of the five forbidden kinds, **by any route**; validating a returned value
gives anything but that value again. *As properties, for QA,* over arbitrary sequences of UTF-16
units and not only of whole characters, which is the difference the earlier sweep could not see.

| Finding | Ruling |
| --- | --- |
| L-R1.2 the leading 0 is judged after the count, so the code misleads at every length but one | **Changed: criterion 22.** Below |
| L-R1.4 U+2011 and U+2013 are refused | **Mine to read, and changed.** The owner said *"dashes"*; as with the spaces, he named a kind. **Any dash, Unicode's Pd, is grouping.** A minus sign is not one and stays refused: recorded |
| L point 4, QA's 14: the rule could also hold the price to the design's bodies | **Recorded, not taken.** The rule checks the fact it decides on. Whose price it is, the snapshot knows by making it and the review by its own check. *Limit, with its trigger (ADR 0118):* a third caller of the rule |
| L-R1.9 the snapshot parses the wire schema, not the catalogue's rules | **Recorded, not changed, and criterion 20 says so now:** it parses as the wire schema. The review does not hold a design to the catalogue's rules either, so a snapshot that did would refuse what the screen offers, which criterion 7 forbids. *Trigger:* the review gains that check; then both gain it together |
| L-R1.10 the id's predicate narrows a string to nothing | In the round: it answers yes or no |
| C-R1.1 the review still asks *nothing Lemnaria supplies* itself | **A different question, and it keeps its call.** Below |
| C-R1.2, C-R1.6 | In the round |
| C-R1.3 two vocabularies for a result; the text check written three times | **Half taken.** The text check and the counting are written once. The two vocabularies stay: a field has one code and a request has a list, and one shape for both would hide that |
| C-R1.4 general helpers living in a fields file | In the round: one small home for reading an own value, a plain object and its unknown keys |
| C-R1.5 comments that cite this plan's ids | In the round: a comment cites the wave's ADR or nothing (ADR 0136). **The ADR's number is reserved before the round** |
| The nits, the truncated ones included | To the implementer whole, by the coordinator. Any that changes what a caller sees comes back here first |
| S-R1.3 the honeypot's text is held to no rule | **Changed: criterion 23.** Below |
| S-R1.4 the bounded reason removes Cc and Cf, not Zl or Zp | In the round, in the one shared helper [src `configurator-domain/src/failure-text.ts:27`]: a line separator cannot forge a line either |

**Criterion 22, added — a second 0 has its own code, at any length (L-R1.2).** The owner: *"no
there is no number 00x xxx xxx , only one 0 at start"*. A Moldovan-form number whose digits after
the prefix begin with 0 can be completed by nothing, so it is not *incomplete*; and it is not
*too many*, whose sentence is about numbers from abroad. **It is judged before the count and
refused with one code of its own.** These are the spellings Q33 keeps refused, so the customer
who types one is owed a sentence that says what to change. That sentence is a new leaf and the
owner's copy, in 8L. *QA re-aims* the pins that put the count first, the million zeros among them.

**C-R1.1 — what to draw is not what to refuse.** The rule in the domain says which refusal a
kitchen gets. Whether there is a figure to show at all is the review's own question, and it asks
it with the same predicate, defined once and imported. A kitchen with a body past its wall that
supplies nothing is refused for the wall *and* has nothing to draw; both are right
[logic reviewer: the review behaves as at `aac86d6`, relayed]. **One comment says so, and the
file's header stops claiming the domain decides both.** No behaviour changes.

**Criterion 23, added — the request carries whether the honeypot was filled, not what filled it
(S-R1.3).** I confirmed *"carried, never judged"* and left a promise to 8K that its text is never
stored, mailed or logged. A promise by type is better. The body may hold text there, bounded as
now; **the validated request holds one yes or no.** What a yes means stays 8K's (D9).

**The clean-code reader read no test.** Tests are code here. On its re-check it reads the
implementer's own files under `tests/contact/`, not the `qa-*` ones.

**The fix round. Two dispatches again; they share no file.**

| # | Does | Files | Dispatch |
| --- | --- | --- | --- |
| A1 | Criterion 21 | `contact/contact-fields.ts` | A |
| A2 | Criterion 22; Pd is grouping | `contact/phone-number.ts` | A |
| A3 | Criterion 23 | `contact/contact-submission.ts` | A |
| A4 | C-R1.3's half and C-R1.4: one home for the shared checks; L-R1.10; the nits in these files | a new file beside them, `repository.ts`, `index.ts` | A |
| A5 | C-R1.5 in these files | the same | A |
| B1 | S-R1.4 | `failure-text.ts` | B |
| B2 | C-R1.1's comment and header; C-R1.2 | `apps/web/src/review/review-model.ts` | B |
| B3 | C-R1.6; C-R1.5 in these files; criterion 20's sentence | `contact/submission-eligibility.ts`, `contact/submission-snapshot.ts` | B |

*Reading, A:* this section; criteria 10, 19, 21 to 23; ADR 0136. *Reading, B:* this section;
ADR 0148; ADR 0136. *Must not, both:* a `qa-*` file is edited.

**After the round.**

- **QA** adds criterion 21's three properties over unit sequences; the long run of combining
  marks, answered `TOO_LONG` in a time that the unfixed code misses by orders of magnitude, so
  the test cannot flicker; criteria 22 and 23; a dash of each kind. It re-aims its leading-0
  pins. The parity property runs again, since B touches the review.
- **Security** re-checks S-R1.1 to S-R1.4. **Logic** re-checks L-R1.1, L-R1.2, L-R1.4 and that
  the review still behaves as at `aac86d6`. **Clean-code** re-checks its own and reads the tests.

**Answered by the reviews, for the record** [relayed; the security reader fetched the page
today]. Resend's key may be *"up to 256 characters"*, so sixty-four fit, and reading 4's open
point is closed. Resend answers `409` in **two** ways: one for a key reused with another body,
which no retry mends, and one for two requests in flight under one key, which a retry does.

**What later waves inherit. Recorded, not built.**

- **8I:**
  - The conflict digest covers every stored and mailed field of the **validated** request, and
    leaves out the elapsed time and the honeypot.
  - The id column compares byte for byte.
  - **One thing blocks its dispatch, and it is not mine to settle.** A plain hash of a name and a
    phone, in a column the application's role reads, can be guessed back. That would undo Q14,
    under which the role reads no contact column. The security reader's answer is a digest keyed
    with a secret kept outside the database, which is a new variable. **It is the same question
    as the keyed hash recorded for 8K's S0, and it now comes first: it goes to the owner before
    8I's migration is written.** **(Answered 2026-10-08: yes, *"lets add this secret"*
    [relayed]. 8I is unblocked; see *The digest secret*, under 8I.)**
- **8J:**
  - A customer's text appears only in the plain-text body, one value to a line behind a fixed
    label, and never in a header.
  - A name may be a link or a spreadsheet formula, and the mail does nothing to make either live.
  - The key sent is a fixed prefix and the id.
  - **Its criterion 8 speaks of *"a 409"* and there are two**; it is restated at that wave's
    dispatch.
  - Every price today is provisional, so the mail does not word the figure as an offer; its
    words are the owner's.
- **8K:**
  - Its own small limit on the body, before the body is parsed.
  - A conflict answers one code, with no reference and nothing of whether a notice was sent.
  - The digest is compared before the notifier is called.
  - Attempts per id are capped.
  - A pricing failure whose cause is a version mismatch raises an alert, and the failure's
    detail is bounded before it is logged.
  - F8 and F12, from QA.
- **8L:** it mints the request id with the platform's random UUID; it shows no refusal for a
  lone `+` while the customer is still typing; it owns the new leaf of criterion 22.

**Backlog.** Any export of contact data neutralises a leading `=`, `+`, `-` or `@`. *Trigger:* an
export is built; ADR 0012 has none today. **(Filed 2026-10-08 as backlog 144.)**

#### 8H as closed, 2026-10-08

**Shipped, on `m8-review-contact-success`, not pushed [coordinator ran `git log`; HEAD `2b8c60b`]:** `aecacbd` S1;
`e135d52` S1 follow-up (criteria 9 to 11); `8da0e6a` S2; `a9e1843` S2 follow-up (12, 13); `8539f66` S3; `4a37d56` QA round 1
(red: two defects); `1bd2e80` fix A (16, 17, 19); `928b443` fix B (15, 18, 20); `62ed5bc` QA round 2, green, the commit
the three reviewers read; `57cb8ea` review round A (21, 22, 23); `85465d6` review round B; `fd2c958` QA round 3, green;
`2b8c60b` clean-code cleanup (tests and leftovers, no behaviour change). Plan commits between them: `f9c0363`, `fd99306`,
`d973ffc`, `4cb9a53`, `fe27483`, `6092895`, `0952422`, `cb08196`.

What exists, under `packages/configurator-domain/src/` [source-verified by reviewers]: `contact/phone-number.ts`,
`contact/contact-fields.ts`, `contact/input-checks.ts`, `contact/contact-submission.ts`,
`contact/submission-eligibility.ts`, `contact/submission-snapshot.ts`; `repository.ts` (`isDesignId`,
`isDesignRevisionShape`); `failure-text.ts` (blanks Zl and Zp too). Web: `apps/web/src/review/review-model.ts` calls the
rule and `apps/web/src/price/starting-price.ts` no longer re-exports the supplier check. Persistence tests tie the id
generator and the revision check to the domain's predicates. The decisions: [ADR
0150](../decisions/0150-the-submission-contract-is-one-io-free-definition-a-request-holds-no-price-reads-only-what-the-sender-wrote-and-the-snapshot-and-the-review-share-one-refusal-rule.md).

**Evidence, by who ran it.**

- *Coordinator-run.* At `2b8c60b`: domain typecheck exit 0, lint exit 0, tests 300 files, 7857 passed; web typecheck exit 0;
  no `qa-*` file in the diff. At `85465d6`: web lint 0, typecheck 0, vitest 335 files, 6227 passed. At `fd2c958`: **one**
  web-suite run showed 1 failed of 6227 (exit 1), which test was not captured; four runs straight after were 6227 passed.
  **An unidentified intermittent failure, seen once in five runs** (backlog 145).
- *QA (m8-8h-qa).* Round 1 red on two defects (F1 phone, F2 prototype read), five tests; round 2 green, criteria 14 to 20;
  round 3 green, criteria 21 to 23. Parity property, zero disagreements, per arm judged / allowed / `PRICING_FAILED` /
  `NO_CABINET` / bodies past a wall: straight 2355 / 94 / 564 / 287 / 1410; L 2425 / 88 / 528 / 269 / 1540; right-hand L
  the same; U 2400 / 87 / 522 / 266 / 1525, identical in rounds 2 and 3. The hand-summed literal 53 500 re-derived by QA;
  two totals against the shipped book with sums shown (530 560 and 530 260). Timing after the fix: the worst still-composed
  input about 1 ms; one million units 4 to 5 ms; before the fix the developer measured 2356 ms at 100 000 units and the
  security reviewer 234 s at one million.
- *Reviews at `62ed5bc`.* Logic: one must-fix (surrogate halves split by a format character reunite into an invisible
  character), one should-fix. Clean-code: no must-fix, six should-fix, read no test. Security (scoped): one must-fix
  (quadratic composition before any bound), one should-fix. *Re-checks at `fd2c958`:* logic closed all five (own probes; a
  sweep of about 1.1 million "incomplete" answers each with an accepted completion); security closed all four (own probes;
  400 000 random sequences, none accepted holding a forbidden character; eight shown to be the ceiling); clean-code closed
  its items, read the implementer's tests (eight files fully, five in part) and found three should-fix in tests.
  **Those three were applied in `2b8c60b`, which no reviewer has re-read.**
- *Vendor, 2026-10-08 [the security reviewer fetched the page, relayed].* Resend: an Idempotency-Key may be *"up to 256
  characters"*; two `409` answers (`invalid_idempotent_request`, `concurrent_idempotent_requests`).

**Deviations, with their rationale.** The slice table's three slices grew twenty-three criteria; 1 to 8 were the plan's, 9 to
11 S1's follow-up, 12 and 13 S2's, 14 to 20 the QA and S3 adjudications, 21 to 23 the reviews'. Tier changed from Full to
Full + security, scoped, by the architect's ruling in *S3 as built*. The rule is handed the fit query's answer and does not
ask it (accepted, *S3 as built*). Two criteria of the architect's (10 and 19) caused the two must-fix defects; criteria 21
restated both. Criterion 6's "literal already pinned" did not exist; restated in *S3, restated*.

**Owner's answers recorded at this close** (the section *The owner's answers of 2026-10-08* has the words): S2's over-count
accepted; Q33 as built; criterion 16 confirmed by his second sentence; the test-deletion rule ([ADR
0151](../decisions/0151-a-test-may-delete-the-rows-tests-added-and-never-a-row-a-production-user-added.md)); the digest
secret, one secret, keying 8F from its first deploy ([ADR 0149](../decisions/0149-the-rate-limit-store-keeps-one-row-per-bucket-per-window-refuses-a-broken-promise-and-may-count-high-but-never-low-between-prunes.md)
amendment). **A contradiction found while recording:** the 8E plan text and ADR 0149 said the suite reaches production; since
the owner's change to Vercel's Development `DATABASE_URL` it reaches preview (coordinator-run); the guide's row and the
runbook are corrected.

**Not proven.** Nothing ran on a CI runner; `pnpm check`, `pnpm ci:local` and e2e were not run at `2b8c60b` (the coordinator
runs `ci:local` after this close-out; it is not claimed here). `2b8c60b` is unreviewed. The intermittent web failure is
unidentified. Whether every stored design id has the generator's shape is unmeasured (backlog 146, the owner counts before 8L
S2). Which first digits Moldovan numbers use beyond "not 0" was not asked. A right-to-left dash in a mail client is
inference. No route, store or mail uses this code yet.

**Deferred.** F5 and F7 as limits and F12 (backlog 143) in ADR 0150; F8 and F12's sentence to 8K; the export neutralisation
(backlog 144, trigger an export); the stored-ids count (146, the owner, before 8L S2). What 8I, 8J, 8K and 8L inherit: ADR
0150, *What later waves inherit*, and the lists under *the three reviews* above.

**Documentation updated.** ADR 0150 (new); ADR 0151 (new) and a note on ADR 0006; ADR 0149 (dated amendment);
`best-practices/environments-and-resources.md` (the repo-root row, test-deletion rule, `DIGEST_SECRET`); the runbook for a
table migration (default target corrected; the next table is 8I's, not 8H's); backlog 142 updated and 143 to 146 added;
`STATUS.md`. **Still owed:** the `DIGEST_SECRET` rotation runbook under `docs/runbooks/`, with 8F.

### 8I — the contact submissions store

*Goal.* Requests are stored once, apart from designs, and the running application cannot read them
back. *Tier: Full + security.*

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S0 | Measures, on the test database, that the idempotent insert works under Q14 (i)'s column grants. Reports before S1 | scratchpad | Q14; ADR 0006; `environments-and-resources.md` |
| S1 | Migration `0008`: personal columns separate from the rest. A port that records a request and answers its reference, whether it is new and whether it was notified; and marks one notified. A fake. **(Restated 2026-10-08 as S1a and S1b, with a third operation: *8I — S0's figures, and S1 restated for dispatch*, R5 and R7.)** | ~~`migrations/0008_create_contact_submissions.sql`, new `contact-submission-store.ts`, `fake-contact-submission-store.ts`, `index.ts`~~ **(six files in two dispatches, R7)** | D7, D8, D16; ADR 0002 security 6, d24; ADR 0008; ADR 0012; ADR 0020, 0042, 0096; ADR 0128; ADR 0145 |

*Criteria.*
1. Two records with one client request id store one row and answer one reference, also when
   concurrent. The same id with a different payload is refused with its own code.
2. The reference is unique and random (D16); a collision is retried, never surfaced.
3. **Under the application role**, selecting a personal column is refused by the database; so are
   `DELETE` and an `UPDATE` of any column but notified-at. Asserted live, beside the existing
   privilege tests. **(Restated 2026-10-08: the catalog is asked first, for every column, and no
   statement that could change or show a row is sent. *8I — S0's figures, and S1 restated for dispatch*, criterion 3.)**
4. A retried write leaves no second row (ADR 0145).
5. The export statement still names `designs` alone. A test fails if a second table appears in it.
6. `0008` passes the unattended screen as shipped.
7. No error or log line from this module contains a field's value; tested with recognisable fakes.
8. **Added 2026-10-07 [ven §8].** The insert writes its conflict target out, on the client request
   id alone, and returns only granted columns. No uniqueness rule on the table includes a personal
   column. A test reads the SQL text the module sends and fails on `RETURNING *` or on a returned
   personal column; ~~S0's live run under the application role is what proves the grant suffices.~~
   **(2026-10-08: S0 ran as a scratch role holding the same grants, in a session; not as
   `app_designs` and not over the HTTP driver. What is and is not proven: *8I — S0's figures, and S1 restated for dispatch*.)**

*QA reading:* the criteria; `retried-writes-leave-no-trace.test.ts`;
`backup-restore-round-trip.adversarial.test.ts`. *Security reading:* ADR 0002 security section; ADR
0008; ADR 0012; the migration.

**Owner action after this wave:** ~~apply `0008` and issue Q14 (i)'s grants, preview then production.~~
**(2026-10-08: apply `0008`, then issue the three statements of R1 in *8I — S0's figures, and S1 restated for dispatch*, which are narrower
than Q14 (i) as worded; preview, then production.)**

#### The digest secret — decided by the owner 2026-10-08; its rules

*"lets add this secret"* [the owner, relayed]. What follows is the architect's, except where it
says otherwise. **No agent generates, sets, reads or prints the value, in any environment.**

**1. The variable.**

- **Name:** `DIGEST_SECRET`, beside `CRON_SECRET` in `.env.example`, with a comment and no value.
- **What it holds:** thirty-two random bytes written as sixty-four lowercase hexadecimal
  characters. **The owner runs, himself, once for each environment:** `openssl rand -hex 32`,
  the command ADR 0008 and ADR 0009 already give for a secret [doc].
- **A different value in each environment**, so one that leaks from a preview opens nothing in
  production. Local development and preview write to one database (ADR 0054) under different
  values; that is harmless, since a digest is never read back for its meaning.
- **Where the owner sets it:** production, preview and development on the host, and
  `apps/web/.env.local` for `pnpm dev`. Add-only, as every variable is.
- **Who reads it:** one function on the server, in one module, when a digest is asked for. Not
  when the module loads, so a build needs no value. Nothing in `packages/` reads it: the domain
  is I/O-free and persistence is handed a digest already made.
- **When it is not set, or is not sixty-four hexadecimal characters: it refuses.** *Must not:*
  an unkeyed digest, a built-in key, a key derived from another variable, or a shortened or
  padded value is ever used in its place. The refusal is a named error whose sentence names the
  variable and holds nothing of its value, not its length and not a character of it (ADR 0146,
  rules B2 and B3). What then happens to the customer is each caller's, and both fail closed: a
  design is not made (8F), and a request is answered as one that cannot be sent (8K).
- **A consequence to say plainly to the owner:** from the day 8F's code runs somewhere, **that
  environment creates no design until the variable is set there.** It is set in every
  environment before 8F is merged. That is an owner action with a date, not a note.

**2. One secret, two uses, kept apart by what is digested.**

- **One.** Two secrets are two things to set in four places and two ways for an environment to
  be half configured, for no separation that the encoding does not already give.
- **How they cannot collide:** the digest is HMAC-SHA-256 under the secret, of an encoding that
  begins with a **purpose from a closed set written in code** and continues with the fields, each
  marked with its length. Equal encodings only for an equal purpose and equal fields. This is
  rule S1 of 8E as restated, one level up: the purpose first, then for a bucket its policy's
  name and subject. Today the set has two members: a rate-limit bucket, and a contact request's
  payload.
- **Its output is sixty-four hexadecimal characters**, which is what `rate_limit_counters`
  already demands of a key and what 8I's column will. No table changes for it.
- **8F keys from the start.** It is not built yet [ran: `apps/web/src/lib/server/rate-limit`
  does not exist], so nothing is re-keyed and no count ever restarts for this reason. It also
  makes true what `0007` says of itself: a plain hash of one of sixteen million network prefixes
  is the prefix, to anyone who can read the row. **This supersedes** the limit recorded in 8E's
  reviews, *unkeyed for 8E and 8F*. ~~The security reader confirms it at 8F's S0, which was always
  to be held with them.~~ **(The owner ruled it the same day: *"lets use same secret"*
  [relayed], asked whether 8F's keys should use it from the start. One secret and keying from
  the first deploy are his. The encoding that keeps the two uses apart is still the security
  reader's to check at 8F's S0. ADR 0149 holds the earlier recommendation and the scribe amends
  it.)**
- **Who builds the module:** 8F, in S1, since it is first to need it. 8K adds the second purpose
  and writes no digest code of its own.

**3. Tests and the e2e suite need no real secret, and no test value exists to be chosen.**

- *Unit and DOM tests:* the function that digests takes the key as an argument, and the reader of
  the environment is a second, small function. A test passes a key of its own.
- *The e2e server:* the harness that starts it **makes a fresh random value for that run and
  hands it over in the server's environment**, where the two test flags are already set
  [src `apps/web/playwright.config.ts:80-89`]. It is written to no file. CI is the same harness.
- *Why this and not a fixed test value:* a literal in the repository is a value somebody can set
  in production. With a value made per run there is nothing to copy, so *"a production build
  cannot select the test value"* holds because no such value exists. *Must not:* the application
  contains a branch that picks a key by environment name.
- *The persistence suites* need nothing: a store is handed digests and makes none.

**4. Rotation, for the runbook.** *The rule:* the owner sets a new value in that environment and
deploys. Nothing is migrated and there is no time with two keys. *What it costs, both to be
said:* **every rate-limit count starts again**, the old rows going as their windows end; and **a
contact request whose retry falls across the rotation is answered as a conflict**, its stored
row and its notice untouched. *When:* whenever that environment's variables may have been seen.
*For the scribe:* a runbook of its own under `docs/runbooks/`, named for the operation.

**5. 8I is unblocked, and it never touches the secret.**

| Slice | Does | Files | Reading |
| --- | --- | --- | --- |
| S0 | As written: measures, under Q14 (i)'s column grants, that the idempotent insert works. **Added:** that the application's role can compare a request's digest and read no personal column while doing it | scratchpad | Q14; ADR 0006; this section |
| S1 | As written, with one column made exact: **`payload_digest`, sixty-four lowercase hexadecimal characters by a check, handed in by the caller.** The port takes it as a value it cannot make. **(Split 2026-10-08 into S1a and S1b: *8I — S0's figures, and S1 restated for dispatch*, R7.)** | as written | this section; `sha256-digest.ts` |

- **Criterion 1, made exact.** One request id and the same digest answer the stored reference.
  One request id and another digest are refused with their own code, and the stored row is as it
  was.
- **Criterion 9, added.** Nothing the database or this package can compute is derived from a
  personal column: no hash, no generated column, no index expression, no function. A test reads
  the migration's text and every statement the store sends. *Why:* a digest made inside the
  database would be made without the secret.
- **Criterion 10, added.** The store holds no secret and reads no variable but its connection.
- *What the digest covers* is 8K's to build and the domain's to state: every stored and mailed
  field of the validated request, without the elapsed time and the honeypot's answer. One pure
  function beside the request's type says so, and a test fails when the type gains a field that
  the function neither covers nor names as left out.

**What the security reader checks, in 8I:** that the application's role reads no personal column
(the grants, live, in S0 and criterion 3); that nothing it can read is derived from one without
the secret (criterion 9); that the reference is random and derived from nothing; that no error
or log line carries a field's value (criterion 7). **And in 8F's S0:** ~~that keying from the start
is right;~~ the encoding against forgery by a subject **and against one use being read as the
other, now that one secret serving both is the owner's ruling**; the refusal when the variable is
unusable; and that no fallback exists.

#### 8I — S0's figures, and S1 restated for dispatch, 2026-10-08

**State.** HEAD was `35a3974` when this was read, tree clean; `dd21412` landed while it was written
and touches no file cited here [ran: `git log`, `git diff --name-only`]. S0 is in. Every figure below is
**[developer-run]**: the architect read the raw output and the script (`m8-8i-dev/run4.txt` and
`s0-measure.mts`, session scratchpad) and re-ran nothing. A probe is cited by the number its line
begins with. **[src]** is a file read at HEAD, **[doc]** this plan or an ADR, **[inf]** the
architect's inference, with what would falsify it.

**What S0 ran on.** `lemn-conf-v2-staging`, PostgreSQL 18.6, one transaction, rolled back; 23 roles
and 11 relations before, and the same after [the after-check is relayed by the coordinator; it is
not in `run4.txt`]. A scratch table of ten columns and a scratch role holding
`INSERT`, `SELECT` on the seven non-personal columns and `UPDATE (notified_at)`; then a second
variant with `UPDATE` on all seven. **Not what it ran on:** the role `app_designs`; the HTTP driver
(it used a session); two connections at once; the table as S1 makes it (no `jsonb`, no nullable
column but notified-at); an identity or a sequence.

| Measured | Probes |
| --- | --- |
| One statement answers a new id, the same id with the same digest, and the same id with another digest: `insert … on conflict (client_request_id) do update set notified_at = t.notified_at returning t.reference, (t.reference = $2), (t.payload_digest = $5), t.notified_at` | 06–08 |
| `do nothing … returning` answers no row on a replay, so the reference needs a second read | 03, 04 |
| A read by client request id, comparing the digest, names no personal column and is answered | 04, 25–27 |
| Refused with `42501`: `returning *`, a personal column, the whole row, `xmax`; `set` or `where` on a personal column inside `do update`; `select`, `where` and `order by` on a personal column, `select *`; `delete`, `truncate`; an `update` of every column but notified-at, and one of notified-at with a personal column in its `where`; the targeted insert once `SELECT` on the client request id is revoked | 11–13, 21; 18, 19; 28–34; 36–38; 40–49; 65 |
| A reference already stored, under the targeted statement: `23505` on the reference's own named constraint, and its `DETAIL` holds the key. With no target written, a duplicate is answered as no row and no error | 10; 15 |
| A check violation's `DETAIL` lists the row the statement sent, personal values included. **It ran as the scratch role, not the owner** [src `s0-measure.mts:69` sets the role, `:124` is the first reset, the two probes are `:97-98`] | 22, 23 |
| Under the wider variant the role rewrote a stored reference, design id and digest, and an upsert replaced a stored reference | 52–54, 59 |
| `count(*)` is answered. `pg_stats` shows the role no row for a personal column, before and after `ANALYZE`, and three for the others | 35; 50, 51, 62 |
| With a unique index on the e-mail, the targeted insert answers `23505` for an address already stored | 64 |

**R1 — the grant. The architect's ruling, inside the owner's answer as its ceiling; the owner
issues it and may overrule it.** Q14 (i) as answered: `INSERT`, and `SELECT` and `UPDATE` on the
seven non-personal columns. **Narrowed: `UPDATE`, from the seven to notified-at alone.** `INSERT`
and `SELECT` are as answered. Nothing is added.

- *Why.* (a) Probes 52–54 and 59: with the wider privilege a leaked credential makes a stored
  request answer another reference, or makes a changed payload read as the same one, and criterion
  1's *"the stored row is as it was"* would rest on the code alone. (b) *"Grant it when a feature
  actually needs it, not pre-emptively"* [doc ADR 0008]; after the insert the store writes one
  column. (c) The plan said both on one day. Q14's parenthesis lists what is non-personal and was
  read for both verbs, while criterion 3 allowed notified-at only. Both sentences are the
  architect's, they disagreed, and this settles them.
- *Inside or outside the answer.* Every privilege in the narrower set is one the owner approved, so
  issuing it goes past nothing he said. It is not the set he was shown. **He is told so in words
  when he is asked to issue it.** ~~If he prefers the wider set, no code changes; criterion 3's
  expected set does.~~ **(Struck 2026-10-08: the narrowing is load-bearing, and the wider set is
  not a free choice. *8I — the security read of `0008`*, S-R1.1.)**
- *Not taken.* The grant as worded (above). Narrowing `SELECT` as well, to the four columns the
  statements read: it is not measured under exactly four, 8K may need the row's age for the
  provider's day-long key [doc 8J criterion 11], and the other three being readable is what the
  owner was told.
- **The statements the owner is asked to issue, after `0008`, by the runbook's step 4:**

  ```sql
  GRANT INSERT ON TABLE public.contact_submissions TO app_designs;
  GRANT SELECT (
      reference, client_request_id, design_id, design_revision, payload_digest, created_at, notified_at
    ) ON TABLE public.contact_submissions TO app_designs;
  GRANT UPDATE (notified_at) ON TABLE public.contact_submissions TO app_designs;
  ```

  Not `ALL`, not `WITH GRANT OPTION`, nothing to `PUBLIC`, no table-wide `SELECT`, `UPDATE` or
  `DELETE`. **S1 does not wait for this.**

**R2 — the insert's form: `do update` that changes nothing. The architect's.** It is the statement
of probes 06–08. `do nothing` with a read is not taken.

- *Why.* One statement answers new, replay and conflict. It is the form the counter store already
  uses [src `neon-rate-limit-store.ts`]. Postgres says of `do update` that it gives an atomic
  insert-or-update outcome under concurrency [inf: recalled from the `INSERT` page, not fetched
  today; **the logic reader quotes the page, or this reason goes**]. **(2026-10-09: quoted by the
  logic reader from the PostgreSQL 18 pages, relayed; the reason stands. *8I — the three reviews*.)** A `do nothing` whose read is in
  the same statement reads at the statement's own snapshot: a twin that commits after the statement
  began is skipped by the insert and unseen by the read, so the answer is no row and no error
  [inf, not measured]. A read in a second statement would see it, at two round trips and an answer
  put together from two moments.
- *Cost.* A replay writes a new version of a row whose every value is unchanged. `record` meets a
  stored row only when the lookup said absent and a twin landed in between, or when a statement is
  repeated (ADR 0145), so it is rare [doc 8K, *the order of checks*].
- **What QA proves live**, through the store, over the HTTP driver, on the test database:
  1. N concurrent `record` calls with one id and one digest, each with its own proposal: one row, N
     equal references, exactly one *new*. Run often enough to be a race; QA says how often and why.
  2. The same with two digests mixed: one row, whole from one caller, never columns of two; every
     caller holding the other digest answers *conflict*; the row is the same before and after.
  3. `record` racing `markNotified`: once any answer says notified, none after it says otherwise,
     and the stored instant never changes once set.
  4. The first reply lost (`lose-the-first-reply.ts`), for `record` and for the mark: the rows equal
     a clean run's, and the repeated `record` answers *new*.
- **What QA cannot prove:** any of it under the column grants with two connections. A role made in
  an open transaction is invisible to a second connection, and a committed role is a provisioned
  resource no agent makes. Recorded as unproven until the owner's grant on preview. [inf: a
  privilege is checked for a statement and does not depend on who else is writing.]

**R3 — a driver's error carries the row, so nothing of it leaves. The architect's, applying ADR
0146 B3.** Probes 22 and 23: the `DETAIL` of a `23514` holds every value the statement sent. Probe
10: a `23505` holds the key.

- **Every failure leaves as one store error** whose cause is `reducedCauseOf`'s two fields, the
  type name and the SQLSTATE [src `migration-errors.ts`]. *Must not:* the driver's `message`,
  `detail`, `where`, `hint`, `constraint` or the error itself rides on anything thrown. The store
  logs nothing.
- **`23505` on the reference's constraint** is consumed inside the store (R4). **Any other `23505`,
  a `23514`, a `23502` and every other failure** is the store error. A reply that is not exactly the
  rows the statement names is the store error, with no cause.
- **The digest's shape is refused in code before a statement is sent: yes.** So is everything else
  the table constrains but the reference's uniqueness: the id's shape, the reference's, a target
  that is neither or both, a design without its snapshot. One check, shared by both stores, as
  `requireValidBuckets` is; a refusal says which part and holds no value. *Why, when B3 already
  keeps the `DETAIL` in:* it is the caller's defect and deserves its own sentence; a statement
  certain to fail does not carry a person's details to the server, whose own log may keep a failed
  row [inf; what Neon keeps is not known]; and it holds if a later change lets a cause through.
- **Criterion 7's test is B1's form.** A driver error holding a recognisable fake of every stored
  field (the contact fields, the document, the price) in its message, its detail, every own property
  and a nested cause: none appears in the thrown error's message, stack, own properties, cause chain
  or `util.inspect` at unlimited depth.
- *Not measured:* which fields the HTTP driver's error has. QA captures one real `23514` on the test
  database with fakes and feeds it through the store's translation.

**R4 — *new* is the stored reference equalling this call's proposal, computed in the statement.
The architect's.** `xmax` is refused (probe 21).

- *Sound because* a proposal is drawn fresh for each call from forty random bits (R5): a replay's
  proposal equals the stored reference once in 2^40. And it is right under ADR 0145: a repeated
  statement re-sends the same proposal, so a call whose first attempt landed still answers *new*
  [inf; R2's proof 4].
- **What it asks of criterion 2.** Inside one call, a **transient repeat re-sends the same
  proposal** and a **collision draws a new one**. A collision is SQLSTATE `23505` **and** the
  constraint named `contact_submissions_reference_is_unique`, read for the comparison and not
  copied. At most three proposals, then the store error: three collisions in forty bits is a broken
  generator, which should be seen and not looped on [inf]. *Must not:* a collision is answered as a
  replay, a conflict or a success; another request's row changes; `on conflict` is written without
  its target (probe 15).
- *For 8K, recorded:* **whether to send is decided on *notified*, never on *new*.**

**R5 — the table, and the port. The architect's; the reference's look is owner-visible.**

*The role reads these seven, by Q14 (i).*

| Column | Type and rule |
| --- | --- |
| `client_request_id` | `text`, the primary key and the conflict target. Check `^[A-Za-z0-9_-]{16,64}$`, the domain's shape [src `contact-submission.ts`]. Plain `text`, no `citext`, no `lower()`: with the check, equal means the same bytes [inf] |
| `reference` | `text not null`, unique under the name `contact_submissions_reference_is_unique`. Check `^[0-9A-Z-]{6,32}$`: a label and not a body. The exact look is code's, so it can change without a migration |
| `design_id` | `text`, null for a callback. **No foreign key:** a cascade would delete a lead with its design and a restriction would refuse the owner's manual delete; the row holds its own snapshot. No shape check: not every stored id is known to have the generator's shape (backlog 146) |
| `design_revision` | `bigint`, null with the design id |
| `payload_digest` | `text not null`, check `^[0-9a-f]{64}$` |
| `created_at` | `timestamptz not null default now()` |
| `notified_at` | `timestamptz`, null until marked |

*The role writes these once and reads none of them.*

| Column | Type | Personal |
| --- | --- | --- |
| `name`, `phone`, `phone_normal_form`, `locality`, `channel` | `text not null` (`locality` may be empty) | yes |
| `email` | `text`, present exactly when the channel is e-mail | yes |
| `consent_text_version`, `locale` | `text not null` | no |
| `intent` | `text`, null when a design is named | no |
| `design_document`, `priced` | `jsonb`, null for a callback | no |

- **(2026-10-08: a third check, that both snapshots are JSON objects, is added before the file
  freezes. *8I — the security read of `0008`*, S-R1.3.)**
- *Two table checks*, each reading only whether a non-personal column is null: exactly one of a
  design id and an intent; the revision, the document and the price are present exactly when the
  design id is.
- **D7.** The priced lines, the total and the book's version are stored whole, as `priceDesign`
  returned them, in `priced` (`lines`, `totalMinor`, `pricingVersion`) [src `price-lines.ts:89-114`].
  No column repeats one: a second copy could disagree. They are not personal. **The role does not
  read them:** they are not in Q14's list and nothing built reads them back.
- *Must not:* a check on a personal column; a default but `now()`; a generated column; an index but
  the two unique ones; an identity or a sequence; a uniqueness rule that includes a personal column.
  Probe 64 is why for the last: the insert would tell the role whether an address is already stored.
- **Criterion 9, against every column.** `payload_digest` comes from personal fields, outside the
  database and outside this package, under the secret. `phone_normal_form` comes from the phone and
  is itself unread. `reference` comes from nothing. The two instants are the server's clock. The
  checks read whether five non-personal columns are null. It holds. What the readable seven say of a
  person: that a request exists [inf].
- **The reference: `LM-` and eight characters of `0123456789ABCDEFGHJKMNPQRSTVWXYZ`**, drawn with
  `nanoid`, the package `generateDesignId` already uses [src `generate-design-id.ts`]. Forty bits;
  no `I`, `L`, `O` or `U` among the eight, so it reads aloud. Frame 5A's four digits cannot be
  random: among ten thousand values a collision is likelier than not by about the hundred and
  twentieth request. It is a label and is meant to open nothing [inf; **the security reader
  confirms that nothing treats it as a credential**]. The owner sees it on 5A and may ask for
  another look at no cost to the schema.

*The port: three operations, and nothing that returns a personal field, the snapshot, a list or a
count; no delete.*

| Operation | Takes | Answers |
| --- | --- | --- |
| The lookup | a client request id and a digest | *absent*; *stored* with the reference and whether notified; or *conflict* |
| Record | the id; the digest, which it cannot make; the validated request's contact fields, locale and target; for a design, 8H's snapshot. Not the honeypot's answer, not the elapsed time | *stored* with the reference, whether new, whether notified; or *conflict* |
| Mark notified | a client request id | nothing. A second mark keeps the first instant. No such row is the store error |

- *Conflict* is an outcome, as this package's other outcomes are, and not an exception. **It holds
  no reference and nothing of whether a notice was sent** [doc ADR 0150, *8K*].
- *Whether notified* is `notified_at is not null`, computed in the statement. The instant does not
  leave the store. The mark writes `coalesce(notified_at, now())`, the database's clock.
- *Why a lookup, when `record` answers the same:* 8K counts the contact buckets only for a new
  request and before anything is stored [doc 8K, *the order of checks*; criterion 6].
- *Every statement's predicate is the primary key.* The lookup and the mark are probes 04, 25–27
  and 39, with `coalesce` in place of `now()` [inf: it reads a granted column].
- *The fake* keeps the same contract in memory, takes its proposals from the caller so a test can
  force a collision, and lets a test read what it holds. The Neon store has no such reading.
  Production wiring passes no proposer (8K's; the security reader checks it there).

**R6 — `count(*)` is a recorded limit, not a ruling. The architect's, said to the owner with the
grant.** Postgres has no privilege to read a column and not count its rows, and without `SELECT` on
the client request id the insert is refused (probe 65). What a leaked `DATABASE_URL` shows of the
requests, in full: how many; when each came and was notified; each one's reference, design id,
revision and keyed digest; and, through `designs`, the kitchen as it is now. **Not who and not how
to reach them** (probes 28–34, 50, 51), **and not the price quoted**, which is outside the seven. It
can also add rows, and **mark a
request notified, which stops a retry from notifying the shop.** That comes with the one `UPDATE`
the flow needs. *Trigger for more:* the delivery milestone's way to see a request never notified.
**(Added 2026-10-09, the security reader's: it shows every client request id, and whoever holds one
can ask the public endpoint whether guessed details are the stored ones, since the server makes
the digest. 8K counts conflict answers.)**

**R7 — scope: two dispatches.** The Neon class has its own file beside its port (8E, C-R1.2), and
the reference has its generator, so S1 is six production files and more than five items.

| Slice | Does, in this order | Production files | Reading |
| --- | --- | --- | --- |
| S1a | (1) `0008`, in `0007`'s form, and `migrate:unattended-check`. **Stop: the security reader reads the file and R1's statements before any other command runs.** (2) The port: its types, outcomes, error and the one check. (3) The reference's generator and its predicate. (4) The fake, and one contract suite both stores will run. (5) The exports | `migrations/0008_create_contact_submissions.sql`; new `contact-submission-store.ts`, `generate-submission-reference.ts`, `fake-contact-submission-store.ts`; `index.ts` | this section; Q14 with its pointer; D7, D8, D16; `0007_create_rate_limit_counters.sql`, `0006_create_design_share_links.sql` (the header, the frozen bytes); `migration-safety.ts`; `rate-limit-store.ts`, `fake-rate-limit-store.ts`, `sha256-digest.ts`, `generate-design-id.ts`, `design-revision.ts` (a shape stated twice and tied by a property); the domain's `contact/contact-submission.ts`, `contact-fields.ts`, `submission-snapshot.ts`, `pricing/price-lines.ts:89-114`; `tests/support/rate-limit-store-contract.ts`; ADR 0008 and its notes; ADR 0146 B2, B3; ADR 0150 decisions 3 and 5 and *What later waves inherit*; ADR 0020, 0042, 0096; ADR 0136 |
| S1b | (1) The Neon store's three statements. (2) The collision loop and the failure translation. (3) A test that reads every statement's text and the migration's (criteria 8, 9). (4) The grant test and a column helper (criterion 3). (5) The contract suite on the test database, and the export test (criterion 5) | new `neon-contact-submission-store.ts`; `index.ts` | this section; `neon-rate-limit-store.ts` whole; `retry-on-transient-failure.ts`; `open-application-database.ts`; `migration-errors.ts`; `design-row-source.ts`; `tests/application-role-privileges.test.ts`, `tests/support/table-privileges.ts`, `connection-facts.ts`; *8E — the three reviews*, criterion 13; S0's `run4.txt`; ADR 0145 with its note of 2026-10-08; ADR 0146 B1 to B3; ADR 0128; ADR 0149; ADR 0151 |

- **Why the stop in S1a.** Live suites apply the pending migrations to the test database
  [src `tests/neon-rate-limit-store.test.ts:53`, `retried-writes-leave-no-trace.test.ts:179`], and
  a file's bytes are frozen where it has run. So the first run of the persistence suite with `0008`
  on disk fixes the table there. If the screen refuses a clause of R5, the developer reports before
  changing the table.
- *Must not, both slices:* `0001` to `0007` change; a statement of the counter store or of the
  design repository changes; the store reads a variable but its connection (criterion 10); anything
  under `apps/` changes.

*Criteria, as they now stand for dispatch.* 1 to 10 keep their numbers. **(Criteria 2, 9 and 12
are amended the same day, and R6 gains five lines: *8I — the security read of `0008`*, below. Paste both.)**
**(2026-10-09: criterion 12 is restated, and 1, 3 and 13 gain a line each: *8I — adjudication of QA*, below.)**

1. One client request id stores one row and answers one reference, also for N concurrent calls, of
   which exactly one answers *new*. The same id with another digest answers *conflict*, and every
   value of the stored row is as it was. A row is never made of two callers' values.
2. The reference is drawn from a cryptographic generator and from nothing else: no clock, counter,
   id or digest. A collision is retried as R4 says and never surfaced. A replay whose proposal
   equals **another** request's reference answers the replayed row and no error.
3. **The role holds exactly R1's set, and the test follows the catalog, not a list of three.** For
   every column the catalog lists for the table: `SELECT` is held exactly on the seven, `UPDATE`
   exactly on notified-at. On the table: `INSERT` and no other privilege the server knows. So a
   column added later is unread until someone names it. **Built as 8E's criterion 13:** the catalog
   is asked first; a statement is sent only after the catalog said it will be refused, and only one
   that would touch and show nothing if allowed (a personal column read `where false`; a delete and
   an update of a non-notified column for an id that does not exist). Skipped while the table is
   absent; red once it exists without its grant.
4. A repeated statement leaves no second row, and a repeated mark keeps the first instant (ADR
   0145). A replayed `record` never clears a mark.
5. The export statement still names `designs` alone. A test fails if a second table appears in it.
6. `0008` passes the unattended screen as shipped, and its bytes do not change after the first live
   run.
7. No error from this module holds a field's value, tested in B1's form (R3). The module logs
   nothing.
8. Every `on conflict` writes its target, the client request id alone. Every `returning`, `where`
   and `set` names only granted columns. A test reads the text of each statement and fails on
   `returning *`, on a column outside the seven anywhere but the insert's column list, and on an
   untargeted `on conflict`.
9. Nothing the database or this package can compute is derived from a personal column, checked
   against R5's *must not* list in the migration's text and in every statement.
10. The store holds no secret and reads no variable but its connection.
11. **Added.** The lookup sends no write. For an id never stored it answers *absent*; for a stored
    one, the reference, *notified* and *conflict* are exactly what a `record` of the same id and
    digest would answer.
12. **Added.** ~~A value the table would refuse is refused in code first, by the one shared check,
    with no value in the refusal.~~ **(Restated 2026-10-09 as a closed list, with what is left to
    the server: *8I — adjudication of QA*.)** A property ties the store's id shape to the domain's: every id
    `validateContactSubmission` accepts, the store accepts.
13. **Added.** The fake and the Neon store pass one contract suite. The port has no operation that
    answers a personal field, the snapshot, a list or a count.

*QA reading:* the criteria above, and R2's four proofs; S0's `run4.txt`;
`retried-writes-leave-no-trace.test.ts` and `support/lose-the-first-reply.ts`;
`qa-8e-rate-limit-live.adversarial.test.ts` (the form of a race);
`qa-8e-rate-limit-driver-failures.adversarial.test.ts` and `support/leaked-connection-markers.ts`
(a driver's error with markers); `backup-restore-round-trip.adversarial.test.ts`;
`support/rate-limit-test-eras.ts`; ADR 0128; ADR 0146 B1; ADR 0151. Its rows carry a marker only
tests write, in the client request id, are deleted on the test database alone, and the count
removed is reported. No real person's details in any fake.

*Logic reader:* R2, R4, R5; the port and both stores; ADR 0145; D8; 8K's *order of checks*; the
PostgreSQL `INSERT` page on `ON CONFLICT`, to quote for R2. *Clean-code reader:* the six files and
their tests; `rate-limit-store.ts`, `neon-rate-limit-store.ts` and `fake-rate-limit-store.ts` as
the pattern; ADR 0136; `engineering-conventions.md`. *Security reader:* **first, alone, at S1a's
stop: the migration and R1's statements.** Then R1, R3, R6; criteria 3, 7, 8, 9, 10; `run4.txt`; the
grant test and its helper; *8E — the three reviews*, criterion 13; ADR 0002's security section; ADR
0008; ADR 0012; ADR 0146 whole; the PostgreSQL pages for `has_column_privilege` and for what an
error's `DETAIL` shows a role, to check the two inferences this section rests on them.

**For the owner. None of it blocks S1.**

- The three statements of R1, after `0008`, preview then production, **and that they are narrower
  than what Q14 (i) said.**
- What a leaked credential still shows and can do (R6).
- The reference's look (R5), when he sees 5A.

**For 8K's S0, recorded and not decided here.** A retry of a request that was stored and not
notified rebuilds the notice from the live design, at the stated revision. If the customer has
edited since, or the price book has changed, the same bytes cannot be rebuilt [inf, from 8J
criterion 11 and 8K's order of checks]. Reading the stored snapshot back would be a wider grant
than Q14 and is the owner's. The row's age is readable under R1 and the port does not answer it
yet. **(More for 8K, 2026-10-09: *8I — the three reviews*, *For 8K*.)**

**Not proven, after S0.** Anything as `app_designs`: R1's statements have run nowhere. The grant
with two connections (R2). The HTTP driver's error fields (R3). ~~`do update`'s atomicity is
recalled, not quoted (R2).~~ **(Quoted 2026-10-09: *8I — the three reviews*.)** That `has_column_privilege` counts a
table-wide grant [inf, recalled].

##### 8I — the security read of `0008`, ruled 2026-10-08

**State.** HEAD is `049ed39` [ran: `git log`]; `0008` is on disk, untracked, read whole. The
security reader [relayed; they fetched the PostgreSQL 18 pages]: **the file may be applied as it
is, no must-fix.** The rulings are the architect's. The file changes twice before it freezes.

**The developer's changes to `0008`, exactly. Nothing else in the file changes.**

1. *Header, the sentence ending at line 10* (S-R1.2). In place of *"snapshots (the canonical design
   document, and the design priced as `priceDesign` returned it) are not."*:
   *"snapshots (the design document, and the design priced as `priceDesign` returned it) are not.
   `jsonb` keeps a document's content and not its bytes, as `designs.document` does."*
2. *Header, the sentence at lines 24–25* (S-R1.3). In place of *"The two table checks below say
   exactly that, and read only whether non-personal columns are null."*: *"The first two table
   checks below say exactly that, and read only whether non-personal columns are null. The third
   says each snapshot is a JSON object: a document encoded twice arrives as a JSON string, and it
   would sit unseen in a column the application role cannot read back. A callback's two nulls pass
   it."*
3. *A third table constraint, after `contact_submissions_snapshot_follows_the_design`* (S-R1.3):

   ```sql
   constraint contact_submissions_snapshot_is_two_objects check (
     jsonb_typeof(design_document) = 'object' and jsonb_typeof(priced) = 'object'
   )
   ```

4. `migrate:unattended-check` is run again and quoted. The screen matches a `create table if not
   exists` by its head and applies its function-call rule to an added column and a guarded
   constraint only [src `migration-safety.ts:42-46, 449-457, 532-535`], so it should pass [inf].
   **If it is refused, the developer removes change 3 and the second half of change 2, and
   reports;** S1b's contract suite then holds the type alone.

**The rulings.**

- **S-R1.1: taken. R1's narrowing is load-bearing.** Under the wider grant an upsert that set a
  stored digest to a bad value would fail the digest's check, and the error's `DETAIL` would show
  the **stored** row's name, phone and e-mail [security's inf, from the executor's source,
  unmeasured]. R1's sentence is struck. **Were the wider set ever asked for, a rolled-back probe in
  S0's form comes first, with stored and proposed personal values that differ.** *A rule for every
  later migration of this table:* **no constraint reads a column the role may `UPDATE`.** Today
  that column is notified-at, and no check names it [src `0008:47-76`].
- **S-R1.2: the columns stay `jsonb`, and the header stops saying *canonical*.** Nothing needs the
  bytes `text` would keep: the digest covers the request and not the snapshot [doc ADR 0150],
  nothing re-prices a stored request (D7), and `designs.document` is `jsonb` already.
- **S-R1.3: the check is taken.** It guards every writer for as long as the table lives, where a
  test guards today's store; the role cannot read the column back, so a quoted string would never
  be noticed; and after the freeze it costs a migration. It reads two non-personal columns, so
  criterion 9 holds. A check passes when it is true or null, so a callback's nulls pass [inf,
  recalled; **S1b's contract suite stores a callback on the test database, which proves it**].
- **The developer's (c), (d) and (e): nothing changes.** An e-mail's presence would be a check on a
  personal column (R5). The four closed lists are code's, and a list in a frozen file needs a
  migration to grow. A stored row is a consent given; ADR 0150 leaves the other two out.

**Criteria, amended.**

- **2, added.** A test holds the generator to its alphabet and its eight characters. **That test,
  not the column's check, is what holds the forty bits:** the check admits six characters. *Must
  not, in any later wave:* a page or a route opens anything by a reference alone.
- **9, added.** The test that reads the migration also fails when a constraint names a column the
  role may `UPDATE`, and when the file calls a function other than `now()` and `jsonb_typeof` on
  the two snapshot columns.
- **12, added.** The shared check refuses **a revision above 9223372036854775807, by value**: the
  domain's shape admits nineteen digits, and otherwise a person's details reach the server before
  `22003` does. It refuses a document that does not parse to an object and a price that is not
  one. **The property *the store accepts what the domain accepts* stays on the id alone.**
- **S1b, item 5, added.** As the test database's owner, after a `record` for a design: both
  snapshots are objects. After one for a callback: both are null.

**R6, added: what a leaked credential can also do. Recorded limits, each the security reader's.**

- **Clear or re-date notified-at**, not only set it. Cleared, a retry can notify the shop a second
  time once the provider's day-long key has lapsed [inf]. Postgres has no grant for *set once*.
- **Add rows of any size, with any dates.** `INSERT` is table-wide, so an added row's created-at
  and notified-at are the sender's. *Not taken:* `INSERT` on sixteen columns. It is unmeasured with
  the upsert, and the same credential re-dates notified-at anyway.
- **Link the requests of one browser**, through a design id to `designs.visitor_hash`.
- **Confirm a guessed set of contact details, if `DIGEST_SECRET` leaks with it.** Both are
  variables of one deployment, so a leak of the environment is a leak of both [inf].
- *Trigger for all four:* the delivery milestone's review of what the role holds.

**For the owner, the scribe and the backlog. None blocks S1a or S1b.**

- *The runbook, for `0008`, the scribe's at close.* Before the grant: read `pg_default_acl` on each
  database, since a default privilege grants without anyone issuing it. After applying: eighteen
  columns and eight constraints by name (the primary key, the reference's uniqueness, three column
  checks, three table checks), since `create table if not exists` passes over an older table.
- *Backlog, the coordinator's to open if it is not there:* the only consent text version is
  `"placeholder"` [src `contact-fields.ts:26`]. A launch item, and the owner's words.
- *Still unmeasured:* S-R1.1's mechanism; the screen on change 3, until the developer runs it.

##### 8I — adjudication of QA, 2026-10-09

**State.** HEAD is `c161b5d` [ran: `git log`]: S1a `7417b66`, S1b `c15c08e`, QA's three files.
QA's round is red on 18 tests [relayed, QA-run]. The architect read the failing tests and the three
production files at HEAD. R2's four race proofs and criterion 7 are green [relayed, QA-run].

**F1 — a contract gap, and it is the architect's: criterion 12 promised more than code can keep.**
*"A value the table would refuse"* has no end: a server refuses for encoding, range, size and
depth. **Criterion 12, restated as a closed list. The shared check refuses, before a statement is
sent and with no value in the refusal:**

1. what each named constraint of `0008` refuses, but the reference's uniqueness, and a revision
   past `bigint` (as before);
2. **a value that is not a string**, wherever text is sent, before its shape is tested (F3);
3. **text Postgres cannot hold:** a U+0000, or half of a surrogate pair, in any text sent;
4. **(Restated 2026-10-09, later, as 4a to 4c: *8I — adjudication of QA round 2*. The document is no longer re-encoded, and
   depth is no longer the server's.)** ~~a snapshot, judged as the JSON the statement will carry.~~
   The document's text is parsed, and
   the priced design is encoded and parsed; each must be an object; every key and every text
   inside, at any depth, passes rule 3; every number is finite. **The Neon store then sends the
   JSON made from the value that was judged, never the text or the object it was handed.** `jsonb`
   keeps content and not bytes (S-R1.2), so nothing the column keeps is lost.

- *Why a walk and not a pattern over the text:* in JSON a NUL and a half surrogate travel as
  escapes, and become the character only once parsed [relayed, QA-run: `22P05`, `22P02`]. *Why send
  what was judged:* a number the parser reads as finite may still be one the server refuses; text
  that JavaScript encoded holds only numbers a double holds [inf: a double fits `numeric`].
- **Left to the server, and the store error with its two fields is the recorded answer:** size,
  ~~depth,~~ a time limit, and anything a later server refuses. Nothing is stored and no value leaves
  (criterion 7, proven on four real refusals [relayed, QA-run]). **The fake refuses what the
  shared check refuses and nothing more; its doc says it cannot stand for a server's refusal.**
- *Reach:* low. The domain refuses control and surrogate characters in contact text [src
  `input-checks.ts:15`]; a design id and a locale come from the application. [inf: UTF-8 servers.]

**F2 — a contract gap in the port's sentence, and a test-fidelity defect in the fake. `isNew` stays
as R4 made it.** It means *the stored reference is the one this call proposed*. No granted column
says more: `xmax` is refused (probe 21), and any sign that only an insert carries would answer *not
new* to a statement repeated after a lost reply, which R2's proof 4 forbids. A proposer that
repeats a reference breaks its own contract, and the two stores must then still agree.

- **The fake draws exactly when the Neon store draws**, once for each `record` call and once more
  for each collision, **and answers `isNew` by the same comparison.** A test's queue of proposals
  is then used up alike by both.
- **The port's sentence changes** [src `contact-submission-store.ts:44`]: true when the stored
  reference is this call's proposal, so also for a statement that was repeated; false for a later
  call, unless a proposer repeats itself. Each store's option says a proposer never repeats.

**F3 — an implementation defect.** `RegExp.test` turns its argument into text first. Each of the
three shape checks refuses a value that is not a string. **`sha256-digest.ts` may be touched in
this wave, for that one condition:** the defect is in that function, a wrapper would state a
digest's shape in a second place, and the change only refuses more, so no string's verdict changes
for the counter store or the design repository. *Must not:* its pattern or its sentence changes.

**F4 — a contract gap in criterion 3.** R1 says *not `WITH GRANT OPTION`* and the test cannot see
one. For this table the test asks the catalog [inf, recalled: both `has_…_privilege` functions take
a privilege with ` WITH GRANT OPTION` added; the security reader confirms]. The three older tables
stay backlog 139. That it skips where the table is absent is criterion 3 as written.

**F5, and the mutation table.** F5 is closed by QA's tests; the developer's fixture is corrected
too (item 4). The five mutants only the live contract suite catches are **accepted:** what a
statement means is proven by running it, and a stubbed driver would restate the SQL. They are
unprotected wherever `TEST_DATABASE_URL` is absent. The Neon store **does** check a proposal's
shape [src `neon-contact-submission-store.ts:87`, the fake `:127`]; QA's driver test is its pair.

**The typecheck covers `tests/`.** `tsc --project tsconfig.json --noEmit --listFilesOnly` lists the
three `qa-8i-*` files and the same command without the flag exits 0 [ran, at `c161b5d`]. The IDE's
two diagnostics are not reproduced by the gate. No fix and no backlog entry.

**The fix round. One developer, five items, in this order.**

| # | Does | Files |
| --- | --- | --- |
| 1 | F3: not a string is refused before a shape is tested | `src/contact-submission-store.ts`, `src/sha256-digest.ts` (one condition) |
| 2 | F1: rules 3 and 4; one function makes the two JSON texts, and the Neon store sends them | `src/contact-submission-store.ts`, `src/neon-contact-submission-store.ts` |
| 3 | F2: the fake draws and answers as the Neon store; the port's sentence and both options' | `src/fake-contact-submission-store.ts`, `src/contact-submission-store.ts`, `src/neon-contact-submission-store.ts` (a comment) |
| 4 | The contract suite: a replay under fresh proposals is not new, and under a repeated one both stores agree; every field of the fixture has its own value (F5) | `tests/support/contact-submission-store-contract.ts`, `contact-submission-fixtures.ts` |
| 5 | F4: no privilege on this table is held with grant option | `tests/application-role-privileges.test.ts`, `tests/support/table-privileges.ts` |

*Reading:* this section; the three QA files; R3, R4; *the security read of `0008`*, criterion 12.
*Must not:* `0008` changes; the text of any of the three statements changes; a counter-store
statement changes; the developer edits a `qa-*` file.

**Criteria, amended.** **12:** the closed list above. **1:** *new* is this call's proposal being
the one stored. **13:** the fake draws when the Neon store draws and refuses exactly what the
shared check refuses. **3:** nothing on the table is held with grant option.

**QA's tests.** *Green as written after the round:* F1's eleven and F3's six. *QA re-words its
own:* F2's pair, into two: under fresh proposals a replay is not new in both stores; under a
repeated one both answer alike.

**QA, round 2.**

- Its three files, whole, once. The four race proofs run once each and not twenty rounds, **if the
  three statements are byte for byte what they were at `c15c08e`**, shown by a diff of the strings.
- **Rule 4 as two properties.** Over arbitrary JSON with a NUL, a half surrogate or an overflowing
  number placed at any depth, in a key or a value: refused, and nothing of it in the refusal. And
  live, a bounded number of runs whose bound QA states: what the check accepts, the server stores.
- The parameter the Neon store sends is the judged JSON and not the text handed in (driver test).
- Mutants of the new code: a `typeof` guard removed; the walk skipping keys, or lists; the finite
  check removed; the handed text sent.
- The counter store's and the repository's digest tests are as green as at `c161b5d`.

##### 8I — adjudication of QA round 2, 2026-10-09

**State.** HEAD is `f021603` [ran: `git log`]; fix round A is `aad9a42`. F1 to F5 are closed, the
race proofs green, the three statements unchanged from `c15c08e`; 8 tests red on F6 to F8
[relayed, QA-run]. The architect read the check at HEAD and QA's tests for the three.

**One cause under F6 and F7, and it is the architect's.** Round 1's rule 4 had the store encode
the document again, to send *what was judged*. That put an encoder where none had been (F6) and
let it change a number (F7). **Rule 4, restated. Rules 1 to 3 stand.**

- **4a. The document is refused unless it is, character for character, what `JSON.stringify`
  makes of its own parsed value.** The text handed in, the text judged and the text sent are then
  one text. A number a double cannot hold, a key written twice, a needless escape, a space: each
  is **refused, never rewritten.** It is one comparison, and exact.
- **4b. The priced design is judged as a value, before anything encodes it.** Allowed: plain
  objects and lists, text, finite numbers, booleans, null. An object's member that is `undefined`
  is left out, as the type's optional fields are [src `price-lines.ts`, `nameKey`]. Refused: a
  number that is not finite, a `bigint`, a function, a symbol, an object that is not plain (a
  `Date`), and an `undefined` or missing place in a list, which an encoder would write as `null`.
- **4c. Both: no deeper than 64 levels, refused under its own part name, and judged in the walk
  before any encoder runs.** Every key and text passes rule 3. A cycle ends at the bound.
- **The invariant F6 broke:** ~~for any document and any priced value, the check returns or throws
  its own refusal, and nothing else. *Not promised:* a request whose own shape is not the type's
  (no contact object): that is the caller's `TypeError`, and it holds no value.~~ **(Both
  sentences were false and are restated: a price that shares its parts may never return, and a
  target that is text was quoted in a `TypeError`. *8I — the three reviews*, L-R1.1 and the guard.)**

*Why each.*

- **F6, an implementation defect opened by the fix; depth becomes code's.** *Why 64:* a design's
  and a price's depths are fixed by their types and are a handful [inf; **QA states the deepest of
  its 32 real snapshots**]; the encoder overflowed near 7,000 here and the server stored 5,000
  [relayed, QA-run]; and a bound that is far from all three does not move with a runtime's stack.
  *Not taken alone:* catching the `RangeError`. Where a stack ends is the runtime's, not a rule.
- **F7, a contract gap: a silent change where a refusal was owed.** *Not taken:* telling from the
  text which numbers survive a double. It needs a reader of JSON numbers and decimal arithmetic of
  its own. *Not taken:* sending the handed text after judging the parsed value. Two texts again,
  and a key written twice is judged once and sent twice. *Not taken:* a recorded limit. The
  snapshot is kept for good, and a quoted figure that changed unseen is the one thing it must not
  do.
- *Reach of 4a on a real request: none.* 8H's document **is** `JSON.stringify`'s output [src
  `serialize-design.ts:17-19`], and encoding a parsed value again gives the same text [inf; QA's
  property over arbitrary values, and its 32 real snapshots, are what prove it].
- **F8, a contract gap, there since S1b.** Encoding first hid the number from the walk. 4b walks
  the value. A price's amounts are whole numbers by their type [src `price-lines.ts`].
- **What `jsonb` holds for a normal design is unchanged from `c15c08e`:** the document's text is
  the handed text again, and the price is encoded once, as it was.
- **Criterion 12 stays a closed list: rules 1 to 3, and 4a to 4c. Left to the server, answered by
  the store error:** size, a time limit, and what a later server refuses. Depth no longer is.

**Fix round B. One developer, four items, in this order.**

| # | Does | Files |
| --- | --- | --- |
| 1 | 4c: the depth bound, with its own part and sentence, in the walk and before any encoder | `src/contact-submission-store.ts` |
| 2 | 4a: the document equals its own encoding or is refused; the handed text is what is sent | `src/contact-submission-store.ts`; the comment at `src/neon-contact-submission-store.ts:82` |
| 3 | 4b: the priced design walked as a value, then encoded once | `src/contact-submission-store.ts` |
| 4 | Its own tests for 1 to 3, one at each edge: 64 and 65 levels; a document that differs from its encoding by a number, a key, a space, and one that does not; a price with each refused kind, and one with an `undefined` member. The port's and the fake's sentences | `tests/contact-submission-store-check.test.ts`; `src/contact-submission-store.ts`, `src/fake-contact-submission-store.ts` (words) |

*Reading:* this section; rule 4 as struck above; QA's `qa-8i-shared-check.adversarial.test.ts`,
*round 2*. *Must not:* `0008` or a statement's text changes; a `qa-*` file is edited.

**The developer's own tests: a recorded choice.** For rules 2 to 4 as round A built them, **QA's
committed files are accepted as the protection**: 17 mutants die there and nowhere else [relayed,
QA-run], and copying them would add nothing. For round B's new lines the developer writes its own
(item 4), since a rule's author states its edges. *For the test audit:* the `qa-8i-*` files are
the only guard of rules 2 and 3 and are not duplicates.

**QA's tests.** *Green as written after the round:* all 8 (F6's two, F7's three, F8's three).
*QA re-words its own, which 4a and 4c turn red:* in the live table *stored equal to the text
handed in*, the key written twice, the scale and exponent, the widest double, the escapes and the
five thousand lists become refusals; so does the twice-written key in the `__proto__` test.

**QA, round 3, and where this stops.**

- Its three files, once. The race proofs once each, if the three statements are still byte for
  byte `c15c08e`'s. The deepest real snapshot, as a number. That every one of its 32 real
  snapshots passes 4a to 4c and is stored equal.
- Mutants of round B's lines only: the bound moved by one; the comparison removed; the price's
  walk blind to one refused kind.
- **The stopping rule, the architect's and open to the owner.** After round B a finding in the
  snapshot's path is fixed inside 8I only if (a) something other than the check's refusal or the
  store error leaves a store, (b) a snapshot is stored that differs from what was handed in, or
  (c) a field's value leaves in an error. A value the check refuses that a server would hold, or
  accepts that a server refuses, is **recorded as a limit with its trigger**, and the wave goes to
  its three reviews.

##### 8I — the three reviews, ruled 2026-10-09

**State.** HEAD is `69fcb36` [ran: `git log`], QA green there [relayed]. Logic: approve with
should-fix. Security: approve with should-fix. Clean-code: changes required, one must-fix
[all relayed; each file reference a ruling rests on was re-read at HEAD: src]. **R2's reason is
now quoted** from the PostgreSQL 18 pages [relayed, the logic reader], and F4's suffix is
confirmed [relayed, the security reader].

**S-R2.1 — taken now, and rated above its label: an implementation defect against R3.**
`runTranslatingFailures` rethrows the driver's own error whenever it reads as the reference's
collision, and only `record` catches it [src `neon-contact-submission-store.ts:216-226`, `:68-76`,
`:103-111`]. So the lookup and the mark can reject with the driver's error, and `record` reads the
failure twice. No real server is known to reach it. It still breaks *nothing a driver threw rides
on anything thrown* **by construction**, which is the only way ADR 0146 B3 holds. The architect
read that code at S1b and missed it.

- **A failure is classified once, where it is caught.** The upsert's translator answers a
  collision as a value. The lookup's and the mark's have no pass-through. *Must not:* a `throw` of
  a caught driver error anywhere in the module.

**L-R1.1 — a recorded limit, not closed in code. The check's sentence is corrected.** A price whose
parts are shared (sixty levels, each holding the next twice) is walked once for each part and
encoded once for each path, and the encoder does not return [relayed, reviewer-run].

- *Why not closed:* ~~refusing a part met twice would refuse a real price whose lines share a label
  [inf, not read];~~ **(Struck 2026-10-09: false. A label is text and not a part, so no real price
  meets one twice [relayed, the logic reader]. The limit stands for the two reasons left: *8I — review round 2*.)** a
  count of places walked is a fourth change to a path that has had three; and a
  price comes only from `priceDesign`, which builds a tree. The stopping rule did not foresee
  *never returns*. The reviewers agree it is no must-fix.
- **(Widened 2026-10-09, later, to any value handed in, and made true in code: *8I — QA pass 4's finding*.)**
- **The invariant, as it now stands.** For a request that is an object, whatever its members: the
  check throws only its own refusal, and **nothing it throws holds a value**. It returns for every
  document, and for every price that is a tree.
- *Trigger (ADR 0118):* a caller that hands over anything but `snapshotSubmission`'s result
  untouched. *The fix then:* a bound on places walked, counted for each path.

**The guard (S-R2.4, L-R1.5) — taken now.** A target that is text reaches `in`, whose `TypeError`
quotes it [src `contact-submission-store.ts:232-235`]. The contact, the target, a design's
reference and the snapshot must each be an object, or the part's own refusal is thrown.

**L-R1.2 — criterion 12 gains rule 5; no code is removed.** *Rule 5, code's own and no
constraint's:* ~~a target whose kind disagrees with what it holds;~~ **(2026-10-09: the kind is
read only as *design* or not; *8I — review round 2*.)** an intent outside the domain's
list; an empty design id; an e-mail present when the channel is not e-mail, or absent when it is.
Each refuses more than the table, and the domain refuses each first. **Not in the list, on purpose
(L-R1.3):** the channel, the locale and the consent version are any storable text. The store is
not the request's second validator.

**Clean-code.**

- **C-R1.1, must-fix, QA's.** A test file imports another package's test files [src
  `tests/support/qa-8i-real-snapshots.ts:11`]. *Backlog, the coordinator's:* the boundary gate
  does not see it.
- **C-R1.2, the split: taken, last, as its own commit.** The file has three jobs, and 8K's
  developer reads it for the port. A later split costs a wave and the same re-check. **Kept
  mechanical:** the refusal's sentences and its maker move to one module, the snapshot's judging to
  another, **bodies unchanged**; the port keeps its types, its error and the check's two entry
  points, so no test's import of them changes. Criterion 10's test names every module of the
  store, the Neon one too, which is missing today (C-R1.10).
- **C-R1.3: the entry points stay, the comment shrinks.** The fake and QA's files call the one
  that answers nothing. The rule's home is this plan and the wave's ADR (ADR 0136).
- **C-R1.4: taken on one condition.** The contact's sentence names its field, and the snapshot's
  becomes two. **Every sentence QA's tests match still matches, unedited;** where a split cannot
  keep that, the sentence stays and the developer reports.
- **C-R1.5 to C-R1.15: taken**, each in the file's own round. **C-R1.9:** wave, round, rule and
  criterion ids leave titles and comments; the `qa-8i-` file names stay, as the package names them.

**Also taken.** S-R2.2, S-R2.3, S-R2.5, L-R1.6. The two reference functions leave the package's
exports: nothing outside uses them, and an exported shape invites a route keyed by a reference.

**Round A, behaviour. One developer, five items.**

| # | Does | Files |
| --- | --- | --- |
| 1 | S-R2.1; the collision's shape joins the failure shapes of all three operations | `src/neon-contact-submission-store.ts`; `tests/neon-contact-submission-store.driver.test.ts` |
| 2 | The guard: four parts are objects or refused | `src/contact-submission-store.ts`; `tests/contact-submission-store-check.test.ts` |
| 3 | The words: the check's sentence (L-R1.1) and rule 5 named in it (L-R1.2); the lookup *writes nothing* (L-R1.6); why the walk swallows a throw (C-R1.15); C-R1.4's sentences | `src/contact-submission-store.ts` |
| 4 | S-R2.2: each `returning` and `select` list pinned exactly, no `*` anywhere; the statements read are as many as the source writes | `tests/contact-submission-statements.test.ts` |
| 5 | S-R2.3: a test fails when a migration after `0008` names the table, and points at the rule. S-R2.5: the probe's id is one the column's check cannot hold | `tests/migration-0008-text.test.ts`, `tests/application-role-privileges.test.ts` |

**Round B, no behaviour. The same developer, after A is green; four items.** **(2026-10-09, later:
five items, the first of them behaviour and its own commit. The final list is in *8I — QA pass 4's finding*.)**

| # | Does | Files |
| --- | --- | --- |
| 1 | C-R1.2, its own commit, last | `src/contact-submission-store.ts`, two new modules beside it; `tests/contact-submission-store-holds-no-secret.test.ts` |
| 2 | The two reference functions leave the exports | `src/index.ts` |
| 3 | C-R1.3's comment; C-R1.5 to C-R1.8, C-R1.10 to C-R1.14 | the developer's own tests |
| 4 | C-R1.9 in its own files | the developer's own tests and sources |

*Reading, both:* this section; R3; ADR 0146 B3; ADR 0136; the three reviewers' findings.
*Must not, both:* `0008` or a statement's text changes; a `qa-*` file is edited; in round B, a
moved body changes.

**QA's own files. One pass, after round A.**

1. C-R1.1: the real snapshots are made through the domain's public exports, or from fixtures
   copied into this package's `tests/support` and marked as copies. They stay `snapshotSubmission`'s
   own output.
2. S-R2.1, proven: for each of the three operations, an error that reads as the collision, and one
   whose code reads differently the second time, leave as the store error in B1's form.
3. The guard: each part as text, a number, a list and null, holding a marker: the part's refusal
   and no marker.
4. C-R1.9 in its three files. C-R1.16: the wall-clock assertion cannot flicker or goes; a
   `console.info` stays only where it reports a figure the close-out quotes.
5. **Live, once:** its live file, since the collision's path changed; the races once each, if the
   statements are still `c15c08e`'s.

**Round 2 of review. Each on its own findings.** *Security:* S-R2.1 by reading that no caught
error is thrown again; S-R2.2 to S-R2.5; the guard; the exports. *Logic:* L-R1.1's wording, rule 5
against the code, that three proposals are still drawn and a transient repeat still re-sends one.
*Clean-code:* C-R1.1; that the split is a move, by a moved-lines diff; its own findings; **QA's
diff, whole**, since round 1 read QA's files in excerpts.

**Criteria, amended.** **7:** it holds for all three operations, and a failure is classified
once. **8:** the lists are pinned exactly, and the statements read are counted against the source.
**9:** a later migration that names the table fails a test until someone has read S-R1.1's rule.
**10:** its test names every module of the store. **12:** rule 5, and the invariant as above.
**13:** the package exports no function of a reference.

**For 8K, added. Recorded, not built; the first five are the logic reader's, the rest
security's.**

- Two calls at once can both see *not notified* and both notify; only the provider's key stops the
  second message. A notice accepted, a mark failed and a retry past the provider's day notify twice.
- **A rejected `record` does not mean nothing was stored.** A retry goes through the lookup.
- Over HTTP an answer of *not notified* can arrive after one of *notified*.
- **Pass only a validated request**, **as plain data (added 2026-10-09: *8I — review round 2*, the second
  reading)**, and `snapshotSubmission`'s result untouched (L-R1.1's trigger).
- Whoever holds a stored client request id can ask the endpoint whether guessed details are the
  stored ones, since the server makes the digest. **Conflict answers are counted.** *For R6:* a
  leaked `DATABASE_URL` shows every id.
- The store is constructed with no argument and under no flag. A gate fails if anything under
  `apps/web/src` imports the fake. The body's bound is counted on bytes read; eight kilobytes is
  the security reader's figure, for that wave's S0 to rule.

**Limits for the wave's ADR.** L-R1.1 with its trigger. The channel, the locale and the consent
version are unchecked here. QA's files were reviewed in excerpts in round 1. The boundary gate is
blind to a test importing another package's tests (backlog).

##### 8I — QA pass 4's finding, ruled 2026-10-09

**State.** HEAD is `8eaba35` [ran: `git log`], tree clean; QA's tests are `894dda8`. Pass 4 is
green but for four tests: C-R1.1 closed, S-R2.1 and the guards proven, ten mutants of round A dead;
alone, the suite is 4 failed, 2354 passed, 2 skipped [all relayed, QA-run].

**F9 — an implementation defect against the invariant, and the gap is the architect's.** The
reviews' ruling said *whatever its members* and its guard asked only whether a part **is** an
object. A part that is one, and whose member throws when read, lets that throw leave the check as
it is [src `contact-submission-store.ts:233-296`; relayed, QA-run, for all four parts]. Reach: none
for a validated request, which is plain data.

**Fixed in code, with one catch and not four.**

- **Where:** at each entry of the check that takes an object: the submission, and the lookup's
  request, which reads two members the same way.
- **What it does:** a refusal the check already makes leaves as it is, sentence unchanged. Anything
  else thrown becomes the refusal of a new part, `request`: *the request must be plain data whose
  members can be read*. *Must not:* the thrown value, its message or its type is kept, as text or
  as `cause`.
- **The sentence in the code becomes:** for any value handed in, the check throws only its own
  refusal and nothing it throws holds a value. The price that shares its parts still may not
  return (L-R1.1); a catch cannot reach that.
- *Why not narrow the sentence:* the fix is smaller than the limit's wording, it also closes a
  request that is not an object at all, and the sentence then needs no *if*. *Why not four
  catches:* four places to forget a fifth. *Its cost, accepted:* a defect inside the check would
  read as a refusal; the check's own tests are what see one.
- **A list passes the guard and needs nothing.** It is an object, it answers nothing for a name,
  and the member's own rule refuses it with no value [relayed, QA-run]. The guard exists so that
  reading cannot quote, not to name the shape.

**Criterion 12, amended:** the part `request` joins the list, and the invariant reads as above.

**Round B, final. One developer, five items, in this order.**

| # | Does | Files |
| --- | --- | --- |
| 1 | **F9, behaviour, its own commit, first:** the catch, the `request` part, the check's sentence, its own test | `src/contact-submission-store.ts`; `tests/contact-submission-store-check.test.ts` |
| 2 | The two reference functions leave the exports | `src/index.ts` |
| 3 | C-R1.3's comment; C-R1.5 to C-R1.8, C-R1.10 to C-R1.14 | the developer's own tests |
| 4 | C-R1.9 in its own files | the developer's own tests and sources |
| 5 | **C-R1.2, its own commit, last, a pure move:** F9's lines move with the rest and do not change | `src/contact-submission-store.ts`, two new modules beside it; `tests/contact-submission-store-holds-no-secret.test.ts` |

*Must not:* `0008` or a statement's text changes; a `qa-*` file is edited; in item 5, a body
changes.

**QA, after round B.** Its four tests go green as written; one that pins a part's sentence QA
re-words itself. One mutant: the catch removed. The same throw on the lookup's request. The whole
suite once. **Nothing live:** no statement and no path of the Neon store changes.

**Round 2 of review reads the tree after round B and that QA pass.** Security also reads that
F9's catch keeps nothing of what was thrown.

##### 8I — review round 2, ruled 2026-10-09

**State.** HEAD is `a77b645` [ran: `git log`], tree clean, QA green there [relayed]. Logic: approve
with should-fix, L-R1.1 to L-R1.6 closed. Security: approve, S-R2.1 to S-R2.5 closed, the catch
keeps nothing. Clean-code: approve with should-fix on the tree, the split a pure move, **and one
must-fix in a QA test** [all relayed; the lines a ruling rests on re-read at HEAD: src].

**Taken now.**

- **L-R2.1, with C-R2.1.** The catch asks `instanceof` of what it caught, which runs that value's
  own trap, so a thrown proxy leaves raw [src `contact-submission-store.ts:179`; relayed,
  reviewer-run]. **The check's catches ask nothing of a caught value but whether it is one of the
  check's own refusals, by identity**, through one function of the refusal module; the set stops
  being exported. [inf, the reviewer's and not run: a `WeakSet` consults no trap.]
- **S-R3.1.** A reply's rows are read outside the attempt, so a row that throws when read leaves
  the lookup and `record` raw [src `neon-contact-submission-store.ts:247-255`, `:299-332`]. The
  reply is read inside the attempt, and a throw there is the store error with no cause. No reach
  over the HTTP driver, whose rows are parsed JSON [inf]. It is R3 all the same.
- **C-R2.8, must-fix, QA's.** The test raises a plain `Error`, which is no collision to a store
  that asks for the driver's class [src `open-database.ts:47`], so no second proposal is drawn
  and its two assertions pass at no statement. It cannot fail for its reason (ADR 0152).
- **C-R2.2, C-R1.12; C-R2.3, C-R2.11, and four nits** (below).
- **C-R2.10, in part.** That a race test raced is its precondition, and a proof that did not race
  must not pass; QA is right to assert it. But on every round it fails on a slow line with no
  defect. **The invariant is asserted on every round; the precondition as a floor over the
  rounds**, far below the share QA measured, which QA states. The two `toBeGreaterThan(0)` are
  already floors and stay.

**Three sentences corrected.**

- *The limit's (L-R1.1), in the code:* not *"does not return"*. The work doubles with each shared
  level, twenty return [relayed, reviewer-run], sixty outlast any caller.
- *The plan's reason for not closing it* is struck above: a label is text. **L-R1.1 stays a
  limit** for the two reasons left, and its cheapest closure, refusing a part met twice, is now
  known to refuse no real price.
- *Rule 5's first clause, in the code and in the plan:* **a target whose kind says design while it
  holds none, or holds one while its kind says otherwise.** The kind is read only as *design* or
  not and is not stored: `{ kind: "x", intent }` is stored as an intent.

**Recorded, not fixed. Limits for the wave's ADR, each with its trigger.**

| Limit | Trigger, and the closure if it fires |
| --- | --- |
| **The request is read twice** (S-R3.2, QA's B): the check reads each member and the statement, or the fake's record, reads it again [src `neon-contact-submission-store.ts:144-157`]. A member that answers clean once and otherwise the second time is sent unjudged [relayed, reviewer-run]. Every field | A caller that hands over anything but plain data. The check answers the judged values and the statement sends those |
| **A refusal met again** (QA's A): a member that throws one of the check's own refusals lets it leave as it is. It holds no value | None needed |
| **L-R1.1**, as corrected | As recorded; refuse a part met twice |
| **S-R2.2's residue:** a whole-row name inside a sub-select or the values list would pass the statements test | A statement's text changes. Pin each statement's whole text |
| **The logic reader's L1 and L2**, as their report words them [relayed, not read by the architect] | Theirs |
| C-R2.9's six restated cases, the remaining nits, C-R2.7 | **The milestone-close test audit** (ADR 0152, Amendment A): a test is deleted on evidence, and that audit gathers it |

**The final developer round. One commit, five items.**

| # | Does | Files |
| --- | --- | --- |
| 1 | L-R2.1 and C-R2.1; its own test with a thrown proxy whose every trap throws | `src/contact-submission-refusal.ts`, `src/contact-submission-store.ts`; `tests/contact-submission-store-check.test.ts` |
| 2 | S-R3.1; the comment at `:215-217` says what the code does | `src/neon-contact-submission-store.ts`; `tests/neon-contact-submission-store.driver.test.ts` |
| 3 | The two sentences in the code: the limit's, and rule 5's first clause | `src/contact-submission-store.ts` |
| 4 | C-R2.2: the comment says what the filter does, and a listed module renamed fails the test | `tests/contact-submission-store-holds-no-secret.test.ts` |
| 5 | C-R1.12: the three bare catches use the package's helper | `tests/neon-contact-submission-store.driver.test.ts` |

*Must not:* `0008` or a statement's text changes; a `qa-*` file is edited; anything not listed.

**QA's own files. One pass, after that commit.**

1. **C-R2.8:** the driver's own error class is raised, and the test asserts exactly one statement
   and the reference's refusal. Or it is deleted, naming the developer's test that holds the case.
2. *Proof of items 1 and 2:* a member that throws a proxy with throwing traps, at each entry, is
   the request's refusal; a reply row that throws when read, for the lookup and for `record`, is
   the store error with no cause and no marker. One mutant each.
3. C-R2.10 as ruled, with the measured share stated. **Its live file once.**
4. C-R2.11: one property for each arm, each building its own arm, no `fc.pre`.
5. C-R2.3; and the nits C-R2.4, C-R2.5, the proposals constant imported and not restated, the
   garbled title.

**Round 3 of review is owed, and it is three diffs, not a read.** Logic: L-R2.1 and item 3's
sentences. Security: S-R3.1. Clean-code: C-R2.8 and QA's list.

**The closing rule, the architect's and open to the owner.** After that, a finding is fixed inside
8I only if a store gives a wrong answer, a field's value leaves, or something other than the
check's refusal or the store error leaves a store. Anything else is recorded with its trigger, and
the wave closes.

**For the scribe: what 8I's ADR holds.**

- *Decisions:* R1, the grant narrowed inside the owner's answer, with its three statements; R2,
  with the reason now quoted; R3, a failure built and classified once; R4; R5, the table, the
  port's three operations and the reference's look; criterion 12's closed list (rules 1 to 3, 4a
  to 4c, rule 5, the part `request`) and its invariant; S-R1.1's rule for later migrations and its
  tripwire; no function of a reference exported; QA's files as the protection of rules 2 and 3.
- *Limits, each with its trigger:* R6 whole, with both additions; the table above; the channel,
  the locale and the consent version unchecked here; five mutants only the live suite catches;
  the boundary gate's blindness (backlog).
- *Unproven until the owner's grant:* anything as `app_designs`; the grant test, which has run
  nowhere; the grant with two connections; S-R1.1's mechanism; the servers' versions.
- *Owner actions, preview then production:* read `pg_default_acl`; apply `0008`; confirm eighteen
  columns and eight named constraints; issue R1's three statements, **narrower than Q14 (i)**; run
  the grant test as the application role and quote its `reached database … as role …` line.
- Q34 is 8J's.

#### 8I as closed, 2026-10-09

**Shipped, on `m8-review-contact-success`, not pushed [coordinator ran `git log`; HEAD `1bbd08e`]:** `7417b66` S1a; `c15c08e` S1b;
`c161b5d` QA round 1 (red); `aad9a42` fix round A; `f021603` QA round 2 (red); `8d93b97` fix round B; `69fcb36` QA round 3 (green,
the commit the three reviewers first read); `7445280` review round A; `894dda8` QA pass 4 (red, F9); `4a4e6ea` the F9 fix;
`47f6a1c`, `610d620` (the module split, a pure move) and `663e38c` review round B; `a77b645` QA pass 5 (green); `b492d2c` final
developer round; `7790748` QA pass 6 (green); `1bbd08e` the last commit (S-R4.1, and the comment lines and sentences over 120
characters wrapped, their words unchanged). Plan and ruling commits between them: `049ed39` (S0's figures, S1 restated),
`17e2b66` (the security read of `0008` ruled), `16787ad`, `9da55e1`, `b8d73cc` (the three reviews ruled), `0d6baae` (F9 ruled),
`fc45b14` (review round 2 ruled). `8eaba35` restated 8J for dispatch and is not 8I's.

**What exists [source-verified by reviewers]**, under `packages/persistence/`: `src/migrations/0008_create_contact_submissions.sql`;
`src/contact-submission-store.ts` (the port, its error, the check's entry points), `contact-submission-refusal.ts`,
`snapshot-judgement.ts`, `neon-contact-submission-store.ts`, `fake-contact-submission-store.ts`,
`generate-submission-reference.ts` (not exported from the package); `sha256-digest.ts` gained one condition (a non-string is
refused). Nothing under `apps/` uses any of it yet. The decisions: [ADR
0153](../decisions/0153-a-contact-request-is-stored-once-apart-from-designs-the-application-role-reads-none-of-its-personal-columns-and-code-refuses-before-the-server-what-the-table-would-refuse.md).

**Evidence, by who ran it.**

- *Coordinator-run, at `1bbd08e`, alone.* The whole persistence suite exit 0: 78 files, 2450 passed, 2 skipped; persistence
  typecheck 0, lint 0; root `pnpm format:check` 0; `pnpm gate:boundary` 0. The 2 skips are the grant tests for
  `rate_limit_counters` and `contact_submissions` in `application-role-privileges.test.ts`: neither table exists on the database
  `DATABASE_URL` reaches (preview, role `app_designs`) [developer-run printed line, relayed].
- *Developer-run, S0, 2026-10-08.* On `lemn-conf-v2-staging`, PostgreSQL 18.6, one transaction rolled back: the idempotent insert
  works under `INSERT` + `SELECT` on the seven non-personal columns + `UPDATE (notified_at)`; `42501` for every read of a
  personal column, `DELETE`, `TRUNCATE`; roles 23 and relations 11 before and after. Before the bytes froze, `0008` was executed
  from disk in a rolled-back transaction: 18 columns, 8 named constraints, the three checks behave as ruled.
- *QA-run (m8-8i-qa), six passes.* The four live race proofs green in every pass they ran (20 rounds x 8 callers for one digest
  and for two digests; the mark race; the lost first reply); criterion 7 against four real captured refusals (`23514`, `23502`,
  `23505` on the primary key, `22003`); mutants: 24 on the Neon store (S1b), 24 + 26 on the check's fix rounds, 10 on review
  round A, none surviving un-equivalent; the deepest real snapshot is 4 levels in the document and 5 in the priced design over
  eight real kitchens, against a bound of 64; the final whole suite alone at `b492d2c` plus its tests: 2447 passed, 2 skipped.
- *Reviewers.* Logic: approve at `7790748` (R2's reason quoted from the PostgreSQL 18 INSERT and transaction-isolation pages).
  Clean-code: approve at `7790748` (the split a pure move by its own line-set comparison; it read the developer's tests fully and
  QA's files fully only in round 2's second pass). Security: approve at `1bbd08e`, no open security finding (four rounds plus the
  migration read).
- Findings F1 to F9 (QA), L-R1.1 to 6, L-R2.1, S-R1.1 to 5, S-R2.1 to 6, S-R3.1 to 2, S-R4.1, C-R1.1 to 16 and C-R2.1 to 11, and
  how each was ruled: the adjudication sections above.

**Incident, plainly.** On 2026-10-08/09 a killed whole-suite run left the **test** database's migration ledger at `1,8`: an
existing live test forgot ledger rows 2 to 7 from a hand-kept list that stopped at 7. The coordinator authorised forgetting
ledger row 8 on the test database only, through the suite's own guarded helper `forgetAppliedMigrations`. The list is now read
from disk (commit `c15c08e`). Ledger after: 1 to 8 [developer-run]. No other database was touched. **Whether such a repair should
wait for the owner is an open question put to the owner.**

**Deviations, with their rationale.** S1 was split into S1a and S1b (R7: the Neon class has its own file and the reference its
generator, so S1 was six production files). The developer committed its own rounds from review round B on (explicit paths, hook
on), by the coordinator's choice. S-R4.1 and the line-length fix were dispatched by the coordinator directly under the closing
rule, without a new architect section. Two coordinator whole-suite runs overlapped on the test database at `7445280` and each
showed 2 unrelated live failures (share-link and retried-writes; the 8E rate-limit live file), which passed alone (139 of 139):
contention and not a defect, and **no clean coordinator run exists at `7445280`** (QA's was clean). The wave carried criterion 12
from one sentence to a closed list of rules (1 to 3, 4a to 4c, 5, and the part `request`), and criteria 1, 3, 7, 8, 9, 10 and 13
were amended along the way; both are in the adjudication sections.

**Owner actions outstanding.** (1) Apply `0008` and the three grants, preview then production, by the runbook (with the
`pg_default_acl` read and the 18 / 8 check), **and know the grant is narrower than Q14 (i)** (`UPDATE` on `notified_at` alone: the
architect's ruling inside his answer, open to him; widening it is gated on a probe, S-R1.1, an inference not measured). (2) The
reference's look (`LM-` and 8 characters) when he sees frame 5A. (3) The closing rule and the test-database ledger repair are open
to him. (4) Everything already listed in *8H as closed* and the 8H entry in `STATUS.md` stands (`0007` and its grant;
`DIGEST_SECRET` before 8F merges; backlog 146; Resend's facts for 8J's one real send; the hand check; backlog 142's remainder).
(5) Q34 (the language of the shop's notice) is 8J's, opened 2026-10-09 in the plan.

**Not proven.** `pnpm check`, `pnpm ci:local`, e2e, anything on a CI runner. Anything as the role `app_designs` or under the column
grants: R1's statements have run nowhere and the grant test's passing arm has never executed. The HTTP driver under the grants.
S-R1.1's mechanism. The depth of a design with every optional part set. What the provider (Neon) logs of a failed row. The
grant with two connections.

**Deferred.** The limits and their triggers, in ADR 0153 (R6 whole, L-R1.1, the request read twice, S-R2.2's residue, the
logic reader's L1 and L2, the unchecked channel, locale and consent version, five mutants only the live suite catches). Backlog
155 (the consent text version is `"placeholder"`; the owner's consent text, Q7, before launch, M9), 156 (the boundary gate does
not see a test importing another package's tests by relative path; trigger: the next change to the gate) and 157 (for the
milestone-close test audit: six restated cases, C-R2.7's file sizes and the nits; trigger: the M8 close audit). 8K inherits the
notes under *For 8K, added* and ADR 0153's *What later waves inherit*.

**Documentation updated.** ADR 0153 (new); dated notes on ADRs 0008, 0145, 0146 and 0150; `decisions/README.md`; the runbook for a
table migration (steps for `0008`); backlog 155 to 157; this section and the wave table's 8I row; `STATUS.md`.
**Contradiction found while closing:** none in the 8I sections that changes what is built; they keep earlier struck sentences
by design.

### 8J — mail, and the shop's notification

*Goal.* One provider-neutral port sends one fixed message to one configured address.
*Tier: Full + security.*

> ~~**Scope restated 2026-10-07.** M8 builds the port, the configuration reader, the fake and S2's
> message. **`provider-mail-sender.ts` is not built**: the provider is chosen in the delivery
> milestone (Q25). Criteria 3, 4 and the provider half of 6 go with it. Criteria 1, 2, 5 and 7
> stay. If Q29 is answered (b), one more slice adds the marked stand-in…~~
>
> **Restored 2026-10-07, later: the owner chose Resend, in M8** (*The owner's answers to Q29, Q31
> and Q32*). The wave is as first written, with the adapter, and is restated for dispatch in *8J,
> restated* at the end of this section. All seven criteria stand; 8–12 are added there.

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

#### 8J, restated — 2026-10-07, after the owner chose Resend

The paragraph above is overtaken: **the provider is Resend, decided by the owner**, who holds an
API key. *Tier: Full + security*, unchanged: it sends e-mail, reads a secret, and carries personal
data to a third party. No dependency is added: the adapter is a `fetch`.

| Slice | Does | Files (production) | Reading |
| --- | --- | --- | --- |
| S1 | The port; the configuration reader, which answers *configured* or *unavailable* with the names of what is missing; the fake | new `lib/server/mail/mail-sender.ts`, `mail-configuration.ts`, `fake-mail-sender.ts`; `.env.example` (names only) | Q3; ADR 0001 d7; ARCH §9; D8; ADR 0146 (what may be thrown or logged); `environments-and-resources.md` |
| S2 | The Resend adapter: one pure function builds the request, one sends it with a time bound and reduces whatever comes back | new `lib/server/mail/resend-mail-sender.ts` | *8A figures*, §4, every quotation; ADR 0146, rules B2 and B3; `lib/server/backup-designs.ts:112-140` (a third party's failure reduced to a name); `packages/persistence/src/migration-errors.ts` (`reducedCauseOf`) |
| S3 | The shop's notification: the reference, the customer's details, the room line, the rows and the figure, as plain text | new `lib/server/mail/lead-notification.ts` | Q5; D13; 8C *as built* and ADR 0148; 8H's snapshot once it exists (S3 waits for 8H if it is not in) |

*What the documentation fixes for S2* [ven §4, all of it another agent's read]. `POST
https://api.resend.com/emails`, a bearer key, a JSON body with `from`, `to`, `subject`. **A
`User-Agent` header, or the call is refused with `403`.** An optional `Idempotency-Key`, kept
twenty-four hours; the same key with another body answers `409`. **No sandbox:** only the
`resend.dev` test addresses, and they count against the quota. The free quota is 100 messages a
day and 3,000 a month, each recipient counted. The EU region is where mail leaves from; account
data, metadata and thirty days of each message's content are kept in the United States.

*Criteria added to the seven above.*

8. **The request is proved without being sent.** The function that builds it is pure, and a test
   holds its URL, method, headers and body against the documented shape quoted in *8A figures*:
   the bearer header, a `User-Agent`, the `Idempotency-Key`, one recipient. Answers are canned:
   an acceptance, a refusal, ~~a `409`~~, a quota answer, a timeout, a body that is not JSON.
   **(2026-10-09: there are two `409` answers and neither is a success; every answer is mapped to
   one kind in *8J, restated for dispatch — 2026-10-09*.)**
9. **No test, no gate and no agent sends a real message.** *Must not:* CI, `ci:local`, the e2e
   suite or a developer's run reaches `api.resend.com`; a test proves the fake is what those
   servers hold. **The one real send is the owner's**, or made on the owner's word, once, from a
   deployment where the variables are set; the close-out quotes it or says the adapter is
   unproven against the live service.
10. **ADR 0146 applied to mail.** The API key is a secret: with a recognisable fake key, nothing
    thrown, logged or returned holds it, on any branch. **The provider's answer is never passed
    through**: its body can quote the recipient's address or the message, which is personal data.
    What survives of a failure is built: which kind it was, from a closed list ~~(refused, quota
    spent, timed out, unreachable, unreadable answer)~~ **(seven kinds, final: *8J, restated for dispatch — 2026-10-09*)**, and the
    HTTP status as a number. Tested
    with a canned error body that carries a recognisable address, name and phone number.
11. **One request, one message, however many attempts.** The `Idempotency-Key` is the client
    request id. The message for one request is the same bytes on every attempt: no clock, no
    counter and no random value in it. A retry inside a day therefore cannot send a second
    message even if marking the row notified failed. *Recorded limit:* past twenty-four hours the
    provider forgets the key; then only the row's mark stands between a retry and a second
    message.
12. **Quota spent is its own answer.** It is told apart from a refusal and from a timeout, so
    that 8K can stop retrying and 8M can say the right thing.

*What the variables are* — proposals; the owner sets them, an agent sets none, and none is ever
printed or logged (`environments-and-resources.md`):

| Name | Holds | Read by | When it is not set |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | the provider's key; a secret | `mail-configuration.ts`, on the server, when a request is to be notified; never at build, never in the browser | The reader answers *unavailable* and names the variable. 8K stores nothing and answers that the request cannot be sent; the contact screen says so before the form is filled |
| `MAIL_FROM_ADDRESS` | the sender, on a domain the provider has verified | the same | the same |
| `LEAD_NOTIFICATION_ADDRESS` | the shop's inbox; the only recipient there is | the same | the same |

A value that is set and not usable (an address that is not one) is *unavailable* too, naming the
variable and nothing of the value (ADR 0146, B2). The test and e2e servers hold the fake by how
they are started, never by a request, ~~and a production build cannot select it.~~ **(2026-10-09:
under CI the e2e server is a production build, so that sentence could not hold. What a deployment
cannot do is restated in *8J, restated for dispatch — 2026-10-09*, point 4.)**

*What the owner still has to supply.*

| What | Blocks the build? | Blocks what |
| --- | --- | --- |
| The API key, set as a variable on a deployment | No | The one real send; trying the flow by hand |
| A sender the provider accepts: a verified domain, which means DNS records the owner adds | No | The same. [inf, unverified: whether the provider's own test sender reaches the account's address without one] |
| The shop's inbox address | No | The same |
| The shop's phone number, for frame 5B's direct call | No | That action being drawn (8M) |
| The privacy text, naming a processor that stores in the United States | No | Launch (Q7, Q13; M9) |
| SPF, DKIM and DMARC on the production domain | No | Launch (M9) |

**Nothing the owner owes blocks building 8J.** It is dispatchable whole, after 8D, with S3 behind
8H.

*QA reading:* criteria 1–12; *8A figures* §4; `tests/lib/server/backup-designs.test.ts` (how a
reduced third-party failure is tested); ADR 0146. *Logic and clean-code readers:* the three
slices' files. *Security reading:* ADR 0146 whole; ADR 0001 d7; criteria 9–11; the three names in
`.env.example`; every branch of the adapter that touches the provider's answer.

#### 8J, restated for dispatch — 2026-10-09

**State.** HEAD is `b8d73cc` [ran: `git log`]; 8I's review round is in the tree and is not this
section's. **(Re-checked 2026-10-09, later, at `83c4f3c`: 8I is closed, its record is ADR 0153,
and the sentences it overtook are marked below.)** Nothing of 8J is built [ran: `apps/web/src/lib/server` holds no `mail`]. The slice
tables above are overtaken by the one below. *Tier: Full + security*, unchanged.

**Vendor facts, read today** [ven: the architect fetched `resend.com/docs/api-reference/errors.md`,
`…/api-reference/emails/send-email.md` and `…/dashboard/emails/idempotency-keys.md` on 2026-10-09;
copies in the session scratchpad, `m8-8j-architect-vendor/`]. A sent message answers `{ "id": … }`.
The body's plain-text field is `text`. Of a key: *"up to 256 characters"*, *"kept in the system
for **24 hours**"*, and the tip *"`<event-type>/<entity-id>`"*. A repeat under one key:
*"Successful responses will return the email ID of the sent email."* **Not on those pages:** which
field of an error's body carries its name, and the `403` for a missing `User-Agent` (*8A figures*
§4 only).

**1. The answers. Neither `409` is a success. The list of kinds is final: seven.**

| The provider's answer | Kind | A retry |
| --- | --- | --- |
| 2xx whose body is a JSON object with a text `id`. **A repeat under the same key and the same bytes answers this, and it is the only success there is** | *accepted* | none needed |
| 2xx otherwise; any 1xx or 3xx | *unreadable answer* | may; the key guards it |
| `409` named `invalid_idempotent_request`: *"used on a request that had a different payload. Retrying this request is useless"* | *payload mismatch* | **never.** Our bytes changed between attempts: a defect or a deploy |
| `409` otherwise: `concurrent_idempotent_requests` (*"safe to retry this request later"*), `resource_locked`, or no readable name | *busy* | may |
| `429` named `rate_limit_exceeded` | *busy* | may |
| `429` otherwise: `daily_quota_exceeded`, `monthly_quota_exceeded`, or no readable name | *quota spent* | **not automatically** (criterion 12) |
| Any other 4xx (`400`, `401`, `403`, `404`, `405`, `422`) | *refused* | never: the request or the account is wrong |
| Any 5xx; or the `fetch` rejects (then no status) | *unreachable* | may |
| Our own bound of ten seconds passes | *timed out* | may |

- **Criterion 8, restated.** The canned answers are one for each row. **Criterion 13, added, as a
  property:** every status from 100 to 599 with any body, text or not, falls in exactly one kind,
  and nothing of the body is in what is returned.
- *A name is read for a comparison with a constant and never copied.* It is looked for as the
  body's top-level `name` [inf, recalled; **unproven until the owner's send**]. If that is the
  wrong field the mapping still answers: a mismatch reads as *busy* and is retried to 8K's cap, and
  a rate limit reads as *quota spent*. Both err toward not sending twice.
- *The adapter makes one attempt.* Retries are 8K's. Ten seconds is the architect's figure, a
  named constant; the customer waits for it (D8).

**2. One key, one message, the same bytes.**

- **The key is `lead-notification/` and the client request id:** at most 82 characters of 256
  [src `contact-submission.ts`, the id's shape]. The prefix is the purpose, from a closed set in
  code, so a second kind of mail under this account (M8B's) cannot meet this one's keys.
- **The request's body has exactly four fields: `from`, `to` with one address, `subject`, `text`.**
  *Must not:* `html`, `reply_to`, `cc`, `bcc`, `headers`, `attachments`, `tags`, `scheduled_at`. A
  reply-to holding the customer's address is a customer's address in a header (criterion 1).
- **S3 is one pure function.** It takes the reference as 8I's store answered it, the request as
  it is stored, `ContactSubmissionToRecord` [src `@lemnaria/persistence`: the contact fields, the
  locale, the target and 8H's `SubmissionSnapshot`], and the notice's `Content`. It answers the
  port's message: key, subject, text. **No clock, no random value, no variable, no counter.**
  **(Added 2026-10-09, later:** the request is plain data, and only one the store has accepted,
  since 8K records before it notifies. Its snapshot has then passed 8I's rules: the document is
  its own JSON encoding, the price plain data, neither deeper than 64 levels [doc ADR 0153].**)**
- **The kitchen's lines are 8C's, by construction (criterion 7).** S3 parses the snapshot's
  document, calls `describeReview` with the snapshot's price and the document's own projection
  [src `review-model.ts:141-148`], and prints its room line, groups, rows, whole-kitchen rows,
  figure and disclaimer. A review that is not *available*, or not allowed, throws a named error
  with no value: a snapshot exists only for a kitchen that may be sent [src
  `submission-snapshot.ts`].
- *Recorded, for 8K:* a deploy that changes this text, a sender or inbox variable, or the price
  book, between an attempt and its retry inside a day, answers *payload mismatch*.

**3. What a customer's text may do.**

- *What the domain already refuses* [src `input-checks.ts:60-86`]: control characters, so every
  line break and tab; the line and paragraph separators; half surrogates. Format characters are
  removed, the text composed and trimmed, and each field bounded.
- **What S3 still does, for any input.** The body is a list of lines, each a fixed label and one
  value. **Any line holding a control character or a line separator makes S3 throw**, naming the
  label and no value: one check, over customer lines and kitchen lines alike. The phone is
  `phoneNormalForm`, **never the text as typed** [doc ADR 0150, limits]. The channel is the
  notice's own word for it, not the request's text. The e-mail line exists only when the channel
  is e-mail. An empty locality prints the label and a fixed dash.
- **The subject is `Cerere din configurator {reference}`**, a draft under Q10 (a), and holds no
  customer text. The reference is 8I's `LM-` and eight characters. **(Added 2026-10-09, later:** it
  reaches S3 as a value, from the store's answer. The persistence package exports no function of
  a reference [src `packages/persistence/src/index.ts`], and S3 writes no shape for one: its line
  rule is the only check.**)**
- *A link or a formula stays text:* no `html` is sent and nothing is escaped, wrapped or altered.
  *Recorded limit:* a mail client may still turn an address-like name into a link.
- **The language.** Q5's answer is *"(a), and the WhatsApp action built on the customer's own
  share link, as recommended"*: the text summary in the e-mail. **It does not say in which
  language, and no record does. Q34, for the owner; recommended: Romanian, whatever the
  customer's locale, with that locale on a line of its own.** S3 holds the language as one
  constant, so it is built now and the answer changes one line.
- **The figure.** The mail prints the review's own figure and disclaimer lines, which are approved
  words (8C). **It adds no sentence of its own about the price.** A sentence for the shop, if the
  owner wants one, goes after the figure; it is owner-owed and none is drafted.

**4. The fake.** Under CI the e2e server is `next start`, a production build [src
`playwright.config.ts:70-72`], so *"a production build cannot select it"* was never true.

- **Selection is one pure function of the server's environment, handed in as a value.** No
  request reaches it: its signature has no place for one. **(Added 2026-10-09, later:** the form
  is `isSceneShotRouteEnabled` [src `app/internal/scene-shot/route-availability.ts:8-22`]. **Its
  `NODE_ENV` arm is not copied:** the selection asks nothing of `NODE_ENV`.**)**
- **The fake is chosen only when `LEMNARIA_E2E_FAKE_MAIL` is exactly `1` and none of the three
  mail variables is present.** The flag with any mail variable present is *unavailable*, naming
  the flag: never the fake, never the provider. So a deployment set up to send cannot be turned
  to the fake by one added variable, and a stray flag is loud.
- *What is left:* a deployment with the flag and no mail variable answers success and sends
  nothing. It takes a variable only the owner sets. `.env.example` says to leave it unset, as it
  does of the two flags beside it, and the phase gate checks it is unset. **The security reader
  rules at S1 whether a third condition is worth its coupling: that the server's database is the
  test database, which the e2e server's is** [src `playwright.config.ts:81`]. **(Added
  2026-10-09, later:** `assertSafeTestDatabaseUrl` cannot be that test as it stands. It refuses a
  URL that names `DATABASE_URL`'s own database [src
  `packages/persistence/src/test-database-url.ts:115-127`], and the e2e server's `DATABASE_URL` is
  the test URL. The condition would need a new export from the persistence package.**)**
  **(Answered 2026-10-09 by the security reader: no third condition. What is left is recorded,
  with two gate lines and one log line: *8J — S1's security read, ruled; S2 for dispatch*.)**
- ~~**Only the module that selects imports the fake or the adapter;**~~ **(Wrong, corrected
  2026-10-09, later: only `create-mail-sender.ts`, S2's factory, imports the fake or the adapter.
  `select-mail-sender.ts` imports neither and answers which, as a value. Until S2 nothing under
  `apps/web/src` imports the fake, and S1's test says so.)** A test fails on any other
  import under `apps/web/src`. *8K owns* the call site and the flag's line in
  `playwright.config.ts`, since its e2e is first to post a request.
- **What the reader calls usable (added 2026-10-09, later).** A key: not empty, visible ASCII
  only. An address: exactly one, with one `@` between two parts and no space, comma, semicolon or
  angle bracket. So no variable carries a second recipient or breaks a header, and nothing is
  handed to `Headers`, whose refusal quotes the value [src
  `packages/persistence/src/open-database.ts:56-57`]. Anything else is *unavailable*, naming the
  variable.
- **The port's message has no recipient.** The adapter fills the configured inbox, so criterion 1
  holds by the type. M8B's mail to a customer [doc ADR 0115, note of 2026-10-07] widens the port
  under its own review; so would Q12 (ii)'s link e-mail, 8L's if it is built.

**5. The slices.** **(S2 and S3 are restated for dispatch, and the selection no longer carries a
configuration: *8J — S1's security read, ruled; S2 for dispatch*.)**

| Slice | Does | Files (production) | Criteria | Reading |
| --- | --- | --- | --- | --- |
| S1 | The port: message, the seven kinds, an outcome that is a value and never a rejection. The configuration reader. The fake, which records and can be scripted. The selection function | new `lib/server/mail/mail-sender.ts`, `mail-configuration.ts`, `fake-mail-sender.ts`, `select-mail-sender.ts`; `.env.example` (three names and the flag, no value) | 1, 5, 6, 9; point 4 | this section; Q3; D8; ADR 0001 d7; ADR 0146 B2, B3; `lib/server/repository.ts`; `playwright.config.ts:70-89`; `.env.example`; `environments-and-resources.md` |
| S2 | The adapter: one pure function builds the request, one sends it once inside the bound and maps the answer. The factory from a selection to a sender | new `lib/server/mail/resend-mail-sender.ts`, `create-mail-sender.ts` | 3, 4, 8, 10, 12, 13; points 1, 2 | this section, point 1's table; *8A figures* §4; ADR 0146 whole; `lib/server/backup-designs.ts:112-140`; `packages/persistence/src/migration-errors.ts` |
| S3 | The notice: the pure function, its leaves in both message files | new `lib/server/mail/lead-notification.ts`; `i18n/content.ts`; `messages/ro.json`, `ru.json` | 2, 7, 11; points 2, 3 | this section; ADR 0148 and 8C *as built*; `review/review-model.ts`; the domain's `contact/contact-fields.ts`, `submission-snapshot.ts`, `input-checks.ts`; `packages/persistence/src/contact-submission-store.ts` (the type); ADR 0150, limits and *What later waves inherit*; Q10 |

*S1, S2 and S3 share no file; S2 and S3 need S1's port.* **Criterion 11's test:** the same input
twice gives the same bytes with the clock and the random source made to throw, and the module's
text names neither.

*QA reading:* criteria 1 to 13; this section; `tests/lib/server/backup-designs.test.ts`; ADR 0146
B1. *Logic reader:* point 1's table against the adapter; point 2; 8K's notes under 8I, *For 8K,
added*. *Clean-code reader:* the eight files and their tests; ADR 0136. *Security reader:* **at
S1, point 4's open condition;** then ADR 0146 whole; ADR 0001 d7; criteria 1, 3, 9, 10; point 3;
every branch that touches the provider's answer; the four names in `.env.example`. **(Added
2026-10-09, later: ADR 0153, *What later waves inherit*, for S3's developer, QA and all three
readers. When each reads: *8J — S1 for dispatch*, below.)**

**Built without the owner:** all three slices. **Unproven until the owner's one real send
(criterion 9):** that the provider takes the request as built; where an error's name sits; the
`403` without a `User-Agent`; delivery. **The owner's:** the key, a verified sender and the inbox
(above); Q34; a sentence about the price, if wanted; the flag left unset on every deployment.

**6. The records that speak of mail.**

| Record | What it says | How it is settled |
| --- | --- | --- |
| ADR 0001 d7 | *"Use a provider-neutral server API"* | Kept. No provider's name in the port, the fake, the kinds or the notice; one adapter file holds it |
| ADR 0001 d6 | Name and phone required, e-mail optional | Kept. The e-mail line exists only with that channel |
| ADR 0019 d8, the e-mailed edit link | Superseded by ADR 0115 | No link e-mail in this wave. Q12 (ii) is 8L's, and widens the port |
| ADR 0114, consequences and B7 | *"the contact flow sends a snapshot, not a design link"* | Kept. The notice is built from 8H's snapshot and holds no link |
| ADR 0115, note of 2026-10-07 | M8B *"builds on M8's mail port and its recording fake"* | Kept. The fake records; a recipient is M8B's change |
| ADR 0146 B2, B3 | Nothing copied from a secret or a third party's answer leaves | Applied: criteria 3 and 10, point 1 |
| ADR 0148, note 5; Q29 | Resend, chosen knowing it keeps thirty days of content in the United States | Kept. The privacy text names it (Q7; M9) |
| ADR 0150, limits | Show the phone's normal form; a name may be a link or a formula | Point 3 |
| Q13 (ii) | *"the shop's inbox is the second copy"* | The notice carries every contact field, so the inbox can stand alone |

##### 8J — S1 for dispatch, 2026-10-09

**State.** HEAD is `83c4f3c` [ran: `git log`], tree clean; 8I is closed. Read at `1bbd08e`, which
differs from it under `docs/` only [ran: `git diff --name-only`]:
`apps/web/src/lib/server/mail` does not exist, and `.env.example` names no mail variable, no
`LEMNARIA_E2E_FAKE_MAIL` and no `DIGEST_SECRET` [ran].

**What S1 follows in `apps/web`** [src].

- A server module's first line is `import "server-only";` (`lib/server/cron-auth.ts:1`,
  `repository.ts:1`). The test runner replaces it with a stub (`apps/web/vitest.config.ts`).
- A variable is read inside a function, never when the module loads, and its absence fails closed
  (`cron-auth.ts:10-11`; `repository.ts:28-31`).
- Tests are `apps/web/tests/lib/server/*.test.ts`, in Node. S1's go under
  `tests/lib/server/mail/`, run with `rtk proxy pnpm --filter @lemnaria/web exec vitest run
  --config vitest.config.ts tests/lib/server/mail`. The package's `test` script builds the
  workspace packages first.
- *For S3, said now:* `describeReview` imports the domain, the content's types, two price models
  and the room's URL reading, none of them a browser's [src, read; not run on a server]. A server
  page already resolves a `Content` (`app/[locale]/configurator/contact/page.tsx:13`).

**The dispatch. One developer, five items.** Each module has its test of the same name under
`tests/lib/server/mail/`.

| # | Does | Production file |
| --- | --- | --- |
| 1 | The port: a message of a key, a subject and a text; the seven failure kinds; an outcome that is a value; which kinds may be retried, said in one place | `lib/server/mail/mail-sender.ts` |
| 2 | The reader, a pure function of an environment handed in: *configured*, or *unavailable* with the names of the variables | `mail-configuration.ts` |
| 3 | The fake: it records, it can be scripted, it never fetches | `fake-mail-sender.ts` |
| 4 | The selection, a pure function of the same environment: the provider, the fake or *unavailable*, by point 4's rule | `select-mail-sender.ts` |
| 5 | Three names and the flag, each with its comment and no value; and a test that nothing under `apps/web/src` imports the fake | `.env.example` |

*Criteria S1 alone must meet:* 1, by the message's type; 5; 6; 9; the halves of 3 and 10 that
bind the reader (no value of a variable in what it answers or throws); point 4.

*Must not:*

- a request leaves the process: every test makes `fetch` throw;
- the message holds a recipient, a sender or an `html`;
- `process.env` is named anywhere in the four modules, or `NODE_ENV` is consulted;
- a variable's value is in an error, in an answer of *unavailable*, or in a log line;
- the fake is chosen by anything but the selection function;
- a dependency is added.

*Reading:* this section and *8J, restated for dispatch*; Q3; D8; ADR 0001 d7; ADR 0146 B2, B3;
`lib/server/repository.ts`; `playwright.config.ts:70-89`; `.env.example`;
`environments-and-resources.md`. **Added since the plan:**
`app/internal/scene-shot/route-availability.ts`; `lib/server/cron-auth.ts` and
`tests/lib/server/cron-auth.test.ts`; `apps/web/AGENTS.md`; `apps/web/vitest.config.ts`.

**The tier, and when each reads. The coordinator's proposal, taken.**

- **QA and the three reviews run once, after S3:** the slices share the port, and a round for each
  would read it three times.
- **Before S2 or S3 starts, the security reader reads S1 in one sitting:** the selection, the
  reader and the message's type. Both later slices are built on them, as `0008` was read before
  anything ran on it.
- **The question put to the security reader then, to be answered from the code.** *From
  `select-mail-sender.ts` and `playwright.config.ts:66-90`, name every environment in which the
  function answers the fake. Can one of them hold customers' requests, that is, a server whose
  `DATABASE_URL` is not an allowlisted test database? If so: is refusing it worth a new exported
  predicate in the persistence package, given `test-database-url.ts:115-127` and ADR 0146 B2, or
  is what is left recorded, with a line at the phase gate?*

**Nothing the owner owes blocks S1 or S2.** Q34 touches S3 alone, where the language is one
constant. The key, the sender and the inbox block only the owner's one real send.

##### 8J — S1's security read, ruled; S2 for dispatch, 2026-10-09

**State.** HEAD is `54e659f` [ran: `git log`], tree clean; S1 is `eb3434d` (mail tests 140 passed;
web typecheck, lint and the format check exit 0 [relayed, coordinator-run]). The security reader:
**S2 and S3 may be built on S1 as it is; no must-fix** [relayed]. The architect read the four
modules at HEAD.

**The rulings. The architect's, on the security reader's findings.**

- **The question: no third condition.** The fake is answered where the flag is exactly `1` and no
  mail name is defined: today nowhere; after 8K's line, the e2e server; and a deployment that
  someone gave the flag and never set up to send. *Recorded, with its trigger:* a deployment that
  takes real requests is run without mail variables on purpose, or M8B reaches the fake by another
  path. Then the predicate in the persistence package.
- **Two gate lines, to be copied where each gate is written** (8T's is outside this section, M9's
  another file; neither is written by this edit).
  - *The phase gate, 8T:* **`LEMNARIA_E2E_FAKE_MAIL` is defined on no deployment.** The owner
    reads the variables' names for production, preview and development on the host, and the name is
    in none. Names only; no value is read or printed.
  - *The launch gate, M9:* **the three mail variables are set on production, the fake's flag is
    absent there, and the owner's one real send is quoted.**
- **One log line, and it is the only one this module writes.** When the factory builds the fake:
  `mail: the fake sender is in use (LEMNARIA_E2E_FAKE_MAIL); no message leaves this server`, as a
  warning, one constant, no value in it. ADR 0146 B2 allows a line made of constants and a
  variable's name. *Must not:* the adapter, the reader or the selection logs anything.
- **J-S1.1, taken: no value that holds the key leaves `lib/server/mail`.** The selection answers
  `fake`, `provider` or `unavailable` **and carries no configuration**. The factory takes the
  environment, reads the configuration and builds the adapter in one function; the key then lives
  in a closure or a `#` member, never in a property. *What 8K holds:* the factory's answer, a
  sender or the names. *How a screen learns "unavailable" before the form is filled:* it asks the
  selection, which now holds no secret, so a server component cannot pass one on.
- **J-S1.2, taken: a key that cannot be a header is `refused`, with no status, and nothing is
  sent.** `Headers` quotes a value it refuses [relayed, reviewer-run]. **One predicate in the port
  says what may be sent,** and the adapter and the fake both ask it, so they agree: the key is 1 to
  256 visible ASCII characters [ven]; the subject is not empty and holds no control character or
  line separator; the text is text. The port's comment says so. The seven kinds stand: *refused*
  with no status is ours, before any request.
- **J-S1.3, taken:** the reader and the selection read a variable only as the environment's own
  member. **J-S1.4, taken:** the tripwire reads for the module's name and `createFakeMailSender`
  anywhere under `src`, and allows them in the fake and the factory alone.
- **Recorded.** *J-S1.5, a must-not for 8K and M8B:* no route, action or log shows what the fake
  holds; it holds every message, which is personal data. *J-S1.6, the runbook's:* a pasted value
  ending in a line break reads *unavailable*, with only the variable's name to go on. *For 8K:* an
  empty mail variable counts as present, so on a machine whose `apps/web/.env.local` defines one
  the contact specs fail loudly; **the rule is not weakened to mend that.** The fake's outcome
  stays the same as the provider's to its caller.

**S2 for dispatch. One developer, five items, in this order. Items 1 and 2 are S1's follow-ups and
are one commit of their own.**

| # | Does | Production files | Its tests, under `tests/lib/server/mail/` |
| --- | --- | --- | --- |
| 1 | J-S1.2: the predicate of what may be sent, and the port's sentence; the fake asks it | `mail-sender.ts`, `fake-mail-sender.ts` | their two files |
| 2 | J-S1.1's half: the selection carries no configuration. J-S1.3: own members only | `select-mail-sender.ts`, `mail-configuration.ts` | their two files |
| 3 | The adapter. One pure function builds the request; one sends it once inside the bound and maps the answer by point 1's table | new `resend-mail-sender.ts` | new, with the canned answers below and criterion 13's property |
| 4 | The factory, from an environment to a sender or the names; the log line | new `create-mail-sender.ts` | new; criterion 3's inspection |
| 5 | J-S1.4: the tripwire widened, with the factory as the one allowed place | none | `fake-mail-sender.test.ts` |

*Criteria:* 3, 4, 8, 10, 12, 13, and points 1 and 2 of *8J, restated for dispatch*.

*What the adapter is held to, all of it the security reader's and taken.*

- **The body is built from named members, never by spreading the message:** exactly `from`, `to`
  as a list of the one configured inbox, `subject`, `text`. A test hands a message with `to`,
  `cc`, `bcc`, `html`, `headers` and `reply_to` added and reads the body's keys.
- **Four headers and no other:** the bearer key, `Content-Type`, a constant `User-Agent`, the
  `Idempotency-Key`. The URL is one constant.
- **`redirect: "manual"`.** A followed redirect would post the notice to another host. A 3xx then
  arrives as itself and is *unreadable answer*.
- **Everything is caught and mapped, the request's own construction included.** No message of a
  `TypeError`, of `Headers` or of an abort is kept, as text or as a cause.
- **`status` is the response's own, never a number from the body.** An outcome has the keys `ok`,
  `kind` and `status`, and no other.
- **One bound of ten seconds covers the request and the reading of the answer**, and the answer
  is read to sixteen kilobytes with `readUtf8BodyWithLimit` [src `lib/server/read-body-with-limit.ts`].
  Past either, the row's *otherwise* applies or it is *timed out*. Sixteen is the architect's.
- **One attempt.** No retry, no wait, no second request.

*The canned answers the tests owe (criterion 8), one at least for each row.* `200` with an `id`;
`200` with no `id`, with an `id` that is not text, with text that is not JSON, and `204`; a `301`
with a `Location`; `409` named for a mismatch; `409` named for a request in flight, for a locked
resource, with no JSON, and with a name that is not text; `429` named for the rate; `429` named
for each quota and with no JSON; `400`, `401`, `403`, `404`, `405`, `422`; `500`, `503`; a
`fetch` that rejects with an error holding markers; one that never settles; a body that never
ends; a body past the bound; **an error body holding a recognisable address, name, phone number
and the key (criterion 10).** *Criterion 13, as a property:* any status from 100 to 599 with any
body gives one outcome, `ok` only for a 2xx with a text `id`, its status the response's, its keys
the three, and no marker in it.

*Criterion 3's inspection.* With a recognisable key in the environment: nothing in the selection,
in what the factory returns, in any outcome or in anything thrown holds it, by `JSON.stringify`
and by `util.inspect` at unlimited depth with hidden members shown.

*Must not:* a request leaves the process in any test; `process.env` or `NODE_ENV` in any of the
six modules; a dependency; a retry; a log line but the one; `apps/web/playwright.config.ts`
changes (8K's); a file outside `lib/server/mail` and its tests changes.

*Reading:* this section; *8J, restated for dispatch*, points 1, 2 and 4; *8A figures* §4; ADR
0146 whole; `lib/server/backup-designs.ts:112-140`; `packages/persistence/src/migration-errors.ts`;
`lib/server/read-body-with-limit.ts`; the four S1 modules and `tests/lib/server/mail/`;
`apps/web/AGENTS.md`.

**S3 for dispatch. After S2's first commit, since its message must pass item 1's predicate; it
needs nothing of the adapter. One developer, five items.**

| # | Does | Production files |
| --- | --- | --- |
| 1 | The notice's leaves: the subject, the labels, the channel's words, the callback's line, the dash. Drafts under Q10 (a); the Russian is unsigned | `messages/ro.json`, `ru.json`; `i18n/content.ts` |
| 2 | The pure function, from a reference, a `ContactSubmissionToRecord` and a `Content` to a `MailMessage`; the key's prefix; **the language as one constant, `ro`, owner-owed (Q34)** | new `lib/server/mail/lead-notification.ts` |
| 3 | The kitchen's lines from `describeReview` over the snapshot; a named error, holding no value, for a review that is not available or not allowed | the same |
| 4 | The customer's lines: one to a label; the phone's normal form; the channel's own word; the e-mail only with its channel; the dash; **any line holding a control character or a line separator throws** | the same |
| 5 | Its tests: criterion 7 against `describeReview` on snapshots that `snapshotSubmission` made; criterion 11 with the clock and the random source throwing, and the source naming neither; criterion 2 with a marker in every contact field and none in the subject; the message passes the port's predicate; a name that is a link or a formula is printed as it is | `tests/lib/server/mail/lead-notification.test.ts` |

*Criteria:* 2, 7, 11; points 2 and 3. *Must not:* a clock, a random value, a variable or a
counter; `html`; a sentence of its own about the price; the phone as typed; a shape for the
reference; a test importing another package's tests. *Reading:* *8J, restated for dispatch*,
points 2 and 3; ADR 0148 and 8C *as built*; `review/review-model.ts`, `review/use-review.ts`;
`tests/support/romanian-content.ts`; the domain's `contact/contact-fields.ts`,
`submission-snapshot.ts`, `input-checks.ts`; `packages/persistence/src/contact-submission-store.ts`
(the type); ADR 0150, limits; ADR 0153, *What later waves inherit*; Q10.

##### 8J — S3's stop, ruled 2026-10-09

**State.** HEAD is `35d9acc` (S2) [ran: `git log`]. S3 is in the tree, uncommitted: the notice, its
test, the leaves and the copy tests. The whole web suite is 3 failed, 6218 passed [relayed,
developer-run]: two tests of `tests/review/use-review.dom.test.ts`, one of
`tests/price/starting-price.adversarial.test.ts`. The architect read both tests and the notice.

**The conflict is the architect's making.** S3 was ruled to call `describeReview` without 8D's
criterion 10 having been read. It says, of 2026-10-07: *"One place hands `describeReview` its
three inputs … nothing else imports `describeReview`."*

| Record | What it says | How it is settled |
| --- | --- | --- |
| ADR 0148 decision 3 (2026-10-07) and its limit, *a stale projection* | The model takes three inputs and throws when they are not one design's. It does not price | **Kept.** The notice hands it three inputs made from one stored snapshot in one function, and does not price |
| 8D criterion 10 (2026-10-07; as built 2026-10-08) | One caller, `review/use-review.ts`. *Must not:* the design from one source and the price or the groups from another; a projection kept from an earlier design | **Its letter is amended, 2026-10-09: two callers, each named.** Its *must not* stands for both. The scribe records it at 8J's close as an amendment to ADR 0148 |
| ADR 0148 decision 3, with ADR 0062 seam 1 and ADR 0072 | `use-priced-design.ts` is the one module that names a price book | **Kept.** The notice names no book and no pricing function |
| D7; ADR 0072 | Nothing re-prices a stored submission | **Kept, and this is why (b) loses nothing to (a):** the notice prints the snapshot's price |
| ADR 0138 decision 4 (2026-10-06), and the price test's own comment | One rounding site. *"a new module that can reach a priced amount is a recorded addition"* | **Kept.** The notice is listed, and rounds nothing |
| ADR 0095; Q10 (a); the copy lock's header | *"approved copy plus the drafted leaves it has to carry … Carrying a leaf is not approval."* *"Russian remains an unapproved draft"* until its gate | **As the developer did** (below) |

**Ruled: (a). The notice is the model's second caller, by name.**

- *It contradicts the letter and not the intent.* The rule exists so that no caller pairs a design
  from one place with a price or rows from another. The snapshot's document and price were made
  together from one parsed design [src `submission-snapshot.ts`], the rows are projected from that
  same document in the same call, and nothing is kept between calls.
- *Why not (b).* Building from `describeBreakdownRows` makes a second composer of what a review
  shows: its room line, its figure, its disclaimer. That is the drift the one model was built to end,
  and criterion 7 would rest on a parity test and not on construction.
- **What stays impossible, and each is tested.** A third caller, or one not named. A caller in the
  browser other than the hook: the notice begins with the server-only import. A caller that prices:
  the notice names no pricing function, no price book and no store. A notice that prices again: a
  snapshot whose stored total is changed prints the changed figure.

**The copy, and the notice as built.**

- **A draft belongs in the lock, marked as this one is** (*"Drafted, not approved:"*, the form the
  file already uses) [src `tests/support/approved-romanian-messages.ts:3-4`, `:148`]. No change.
- **The hashes: no command exists, and none is needed.** A hash is right when the test's own
  rendering gives it. What a wave that adds copy owes is that none moved, and the file only grew:
  34 lines added, none removed [ran: `git diff --numstat`].
- **The Russian, drafted and unmarked, is the file's standing state** (ADR 0095). With the language
  held at `ro`, those leaves are read by nothing until Q34 says otherwise.
- **The notice is within points 2 and 3.** *Preț* is a label, not a sentence. The figure and the
  two lines under it are the review's own, joined and not changed. *nu este inclus* is the row's
  own word (criterion 7). The disclaimer's missing diacritics are the owner's existing item, now
  on one more surface. The customer's locale is printed as the application's own code.

**S2's nine readings. Seven stand, two are tightened.**

- *Stand:* (i) a throw while the request is built, or a message that may not be sent, is
  *refused* with no status; a throw from `fetch` is *unreachable*. (ii) Success has no status; a
  failure has one whenever there was a response. (v) The fake neither records nor spends a
  scripted answer on a message that may not be sent, **and its comment says so.** (vi) The body is
  read only for a 2xx, a `409` and a `429`. (vii) The factory reads the configuration again, and a
  second reading of *unavailable* is answered as such [src `create-mail-sender.ts:45-49`]. (viii) A
  comment that names the fake fails the tripwire. (ix) Own members only, the flag as the rest.
- **(iii) tightened: an `id` that is empty text is not an acceptance.** It is *unreadable answer*.
- **(iv) tightened: a text that is empty may not be sent.** A notice with no body is no notice.

**To finish S3. One developer, five items, two commits: item 1 alone, then the rest.**

| # | Does | Files |
| --- | --- | --- |
| 1 | S2's two edges, (iii) and (iv), and the fake's sentence for (v) | `lib/server/mail/resend-mail-sender.ts`, `mail-sender.ts`, `fake-mail-sender.ts`; their tests |
| 2 | **The review's gate:** the one caller becomes a closed list of two, in order; its header states the rule as amended and names this record; it also holds that the notice begins with the server-only import and names no pricing function, price book or store | `tests/review/use-review.dom.test.ts` |
| 3 | **The price gate:** the notice joins the list in its place, with one line saying it prints a stored review's figure and rows and derives nothing | `tests/price/starting-price.adversarial.test.ts` |
| 4 | Two tests of the notice: a snapshot whose stored total is changed prints the changed figure; a name holding braces, an apostrophe and an angle bracket is printed as it is | `tests/lib/server/mail/lead-notification.test.ts` |
| 5 | The whole web suite, the typecheck and the lint, each quoted; then S3's commit | none |

*Must not:* another assertion of either gate is weakened or removed; `review/review-model.ts`,
`review/use-review.ts` or anything under `price/` changes; the notice gains a rounding, a price
book or a second source for any of its three inputs.

**The wave's one QA pass. Its reading, amended.** Criteria 1 to 13; *8J, restated for dispatch*;
*S1's security read, ruled*; this section; `tests/lib/server/backup-designs.test.ts`; ADR 0146 B1;
**added:** ADR 0148 decision 3; `tests/review/use-review.dom.test.ts` and
`tests/price/starting-price.adversarial.test.ts` (a third caller, a caller that prices, a module
that rounds: each must go red); `tests/support/approved-romanian-messages.ts`, its header;
`tests/i18n/golden-output.test.ts`; ADR 0153, *What later waves inherit*.

##### 8J — adjudication of QA, 2026-10-09

**State.** HEAD is `22527f9` [ran: `git log`], tree clean. QA's pass is red on 9 of its 260 tests,
three findings, none reachable through `fetch`, the store or the notice as they are; 77 mutants,
none surviving [relayed, QA-run]. The architect read the adapter, the fake and the notice at HEAD.

**F1 — an implementation defect; fixed in code, in the adapter and in the fake.** Each asks the
predicate and then reads the message again to build from it [src `resend-mail-sender.ts:110-111`,
`:71-77`; `fake-mail-sender.ts:29-37`]. A message that answers differently the second time is sent
unjudged.

- **The three members are read once, into a copy that cannot change; the predicate judges the
  copy, and the request is built from the copy.** One function of the port does the reading, so
  the two cannot differ. A read that throws is *refused*, unsent.
- *Why fixed here when 8I recorded the same shape as a limit* (ADR 0153, the request read twice):
  there a second reading reached a parameter of a statement. **Here it becomes a header and the
  key the provider tells one request from another by.** And the fix is three reads.

**F2 — a contract gap in reading (ii); fixed.** A response whose body cannot be asked for answers
*unreachable* with no status, for a `429` too, where the table says *quota spent* [src `:202`,
caught at `:143`]. **The status is kept and the row's *otherwise* applies whenever a response
arrived, however its body fails.** Only a `fetch` that gives no response has no status.

**F3 — a contract gap in point 3; fixed.** `channels[contact.channel]` answers nothing, or a
member every object has, for a channel the notice has no word for [src
`lead-notification.ts:117`]; the line is then empty or bare, and the translator writes to the
console. **The word is looked up as the list's own member, and a channel with none throws a named
error that holds the line's name and no value.** *Must not, for any input:* a translator's error
leaves, or anything in the notice's path writes a log line.

**The observations.**

- **O2, taken.** A mail name that is the environment's own member **counts as present whatever it
  holds**, `undefined` too. The flag beside it is then *unavailable*. `process.env` cannot hold
  one; an environment spread by a caller can, and this is the one answer that tells a customer a
  request was sent when nothing was.
- **O5, taken in part.** **The notice builds a key only from an id that is text and not empty, or
  throws its named error.** No shape: unequal ids give unequal keys, and an id the header cannot
  carry is refused unsent by the adapter. Two requests under one key would not both read as sent
  (the second answers *payload mismatch*), so this is a wrong error and not a lost notice. *Recorded:*
  a target that is neither kind is read as a design and fails for its snapshot.
- **O1, recorded.** An `id` of blank characters is an acceptance. The evidence of acceptance is the
  2xx; of the `id`, only that it is not empty is asked. *Trigger:* the provider is seen to answer so.
- **O3, recorded.** A getter in the environment that throws leaves the reader, the selection and
  the factory as its own error, never as a sender and never with the key. *Trigger:* a caller that
  hands over anything but `process.env`.
- **O4, recorded, and a must-not for 8K.** For a snapshot that has been tampered with, errors other
  than the two named ones leave the notice: the review's divergence error, which lists placement
  ids; a `RangeError` quoting the stored total; a `TypeError`. None holds a contact value. **8K
  treats any throw from the notice as one fixed failure and logs no message of it.**
- **O6, recorded.** An address the reader accepts and the provider refuses reads *configured* and
  is *refused* on every send [inf]. *Trigger:* the owner's one real send, which proves both.
- **O7, recorded.** A body the adapter does not read is not cancelled [inf: the connection is held
  until collected]. *Trigger:* failures in number; then the body is cancelled.

**The fix round. One developer, five items, one commit.**

| # | Does | Files |
| --- | --- | --- |
| 1 | F1: the port reads a message once into a copy and judges it; the adapter and the fake build from that copy | `lib/server/mail/mail-sender.ts`, `resend-mail-sender.ts`, `fake-mail-sender.ts`; their tests |
| 2 | F2: the body's reading is guarded where it is asked for, so the status and the row stand | `resend-mail-sender.ts`; its test |
| 3 | F3 and O5: the channel's word as an own member, the id as text that is not empty, each or the named error; a test that building a notice writes no log line | `lead-notification.ts`; its test |
| 4 | O2: presence is own membership, whatever is held | `select-mail-sender.ts`; its test |
| 5 | The mail tests, the whole web suite, the typecheck and the lint, each quoted | none |

*Must not:* a `qa-*` file is edited; either gate test, `review/`, `price/` or a message file
changes; the predicate's rule, the seven kinds or the table changes.

**Amended.** *J-S1.2:* a message is read once. *Reading (ii):* a status whenever a response
arrived. *Point 3:* a channel has the notice's own word or the notice throws; the notice logs
nothing. *Point 2:* a key needs an id that is not empty. *Point 4:* present means an own member.

**QA after the round.** Its nine tests go green as written; one that pins which of two right
answers was given, QA re-words itself. Its files once. One mutant for each of the five changes
(the copy in the adapter, the copy in the fake, the guard, the own-member lookup, the presence
rule). The whole web suite once. *Still unproven, and the owner's send is what proves it:* the
live provider; where an error's name sits; the `403` without a `User-Agent`; what the runtime's
`fetch` answers under `redirect: "manual"`.

**The closing rule for 8J, the architect's and open to the owner.** After this round a finding is
fixed inside 8J only if a message is sent that should not be; a secret or a customer's value
leaves in an error, a log line, a header, the subject or the key; or the notice shows anything
but the stored review. Anything else is recorded with its trigger, and the three reviews read a
tree that is not moving.

**The suite's tenth failure is not this wave's. For backlog 145, the scribe's to write.** *A
second named sighting, 2026-10-09 [relayed, QA-run]:
`tests/room/plan-preview-model.facing-labels.test.ts:255`, "never intersect, over lengths across
the approved U (Q-U1)", failed once in a whole run with "inside was reached: expected 6 to be >=
8" and passed alone three times of three. Its cause is in the test: the property is unseeded, and
its floor counts how often a random draw reaches an arrangement [src `:231-256`]. No label
intersected. It is not established to be the entry's first failure, whose name was never taken.
Unlike the entry's trigger, this one needs no recurrence: the property is seeded, or its arms are
built so that the floor is met by construction. No owner yet; not 8J's.*

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
> ~~Criterion 8's *"mail unconfigured"* reads with Q29.~~
>
> **Restated 2026-10-07, later: a request can now really notify the shop** (the owner chose
> Resend; 8J). Criteria 7 and 8 mean what they say. Three things follow.
>
> - **Idempotency reaches the provider.** The notification carries the client request id as the
>   provider's own key, and its bytes are the same on every attempt (8J, criterion 11). So a
>   request stored and not yet marked notified can be retried without a second message arriving.
> - **The provider's answers, and what the endpoint does with each.** Accepted: mark the row,
>   answer success. Quota spent: answer a failure that says so in its code, and **do not invite an
>   automatic retry**; the row stays. Refused, timed out, unreachable, unreadable: answer a
>   failure the client may retry; the row stays. In none of them is the provider's answer logged
>   or returned (8J, criterion 10).
> - **A stored request that is never notified.** The customer was told it failed and offered the
>   other channel, which is the truth. Nobody on the shop's side can see the row: nothing in M8
>   reads it back. That is a named interim for the delivery milestone, not a silent loss, and the
>   log line for it carries the reference and no detail.
>
> *Risk, recorded:* the free quota is 100 messages a day [ven §4], and in M8 nothing stops a
> spread of addresses from spending it, since the contact form's global figure only counts.
> While it is spent every customer sees 5B. The delivery milestone's shield is the answer.
>
> **Added 2026-10-08, from 8D's security review: what this endpoint must enforce.**
>
> - The stored design is loaded by id, visitor hash **and the stated revision in one predicate**,
>   with one refusal for every way it can fail, and no query at all without a well-formed cookie.
> - The document, the price and the fit are recomputed from the stored row. **Nothing the client
>   says is proof:** not a `canWrite`, not a design, not a revision offered as evidence, not a
>   price. A carried write-access answer in the browser can be stale and is advisory there too.
> - The cross-site guard, before anything is counted.
> - An id that has not the shape of a design id is refused before any query (the rule 8L S2 puts
>   in the shared load).
>
> **Added 2026-10-08: the keyed digest is decided, and S0 no longer owes it** (*The digest
> secret*, under 8I). The owner said yes. This wave **uses 8F's module and writes no digest code
> of its own**: it adds the second purpose, a contact request's payload, and its buckets for the
> network, the session and the e-mail are keyed as every bucket is. It builds the one pure
> function, in the domain, that says what a payload's digest covers. **When the secret is unset
> or unusable, a request is answered as one that cannot be sent**, as an unset mail variable
> already is (criterion 8), and nothing is stored. S0 still fixes the per-browser key of D11.

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
>
> **Added 2026-10-08, from 8D's security review.** The proxy's list does not gate this page: a
> path reaches the router whether or not the list admits it. **`/d/{id}/contact` calls the shared
> owned load itself** (`lib/server/load-owned-design.ts`) and answers its refusals exactly as the
> editor's and the review's pages do; a test compares the three. **And S2 puts the id's shape
> into that one function:** a segment that is not a design id's shape (21 characters of the id
> alphabet) is *unavailable* before any query, for every door at once. Tests that hand it other
> ids change with it and are named in the slice's report.

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
> with a stand-in number, and criterion 7 applies once it exists. ~~**5A on a deployment** depends on
> Q29: under (a) it is reached only in automated tests.~~
>
> **Restated 2026-10-07, later (the owner chose Resend).** 5A is reached by hand on any deployment
> where the three mail variables are set. Its wording about what happens next is unchanged: still
> the slots of Q9, and no response time (Q26). For 5B: when the endpoint says the provider's quota
> is spent, the automatic retry does not run and *Încearcă din nou* stays for the customer to
> press; every other retryable failure keeps criterion 5. The sentence shown is the same plain one
> in both cases; no new leaf says "quota". With the shop's number still owed, a customer at 5B on
> such a day has no other channel on screen. That is a reason for the owner to give the number
> before the flow is tried by hand, and it is listed with what they owe.
>
> **Added 2026-10-08, from 8D's security review.** `/d/{id}/done` calls the shared owned load
> itself, as the contact page does; the proxy's list is not its gate. Four doors then answer one
> request alike, and a test compares them.

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
> milestone's file exists. **Dated 2026-10-07, later: the file now exists as a stub,
> [`M9-delivery-preparation.md`](M9-delivery-preparation.md), with no plan; this text stays here until
> M9 is planned.**

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
> file until the delivery milestone's file exists. **Dated 2026-10-07, later: ADR 0019 now carries
> that note and the mint's limit is [ADR 0147](../decisions/0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md);
> the delivery milestone's file exists as a stub ([M9](M9-delivery-preparation.md)) and this text stays
> here until M9 is planned.**

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
> ~~and, if Q29 is (b), one variable by which the owner marks a deployment as a test one, never set
> in production~~ **and, since the owner chose Resend the same day, `RESEND_API_KEY`: three mail
> variables in all, tabled in *8J, restated*; no marked-test variable (Q29 is closed)**. **Gone
> to the delivery milestone:** ~~the mail provider's account, key and DNS~~ **the production
> domain's DNS records for mail**; the
> bot check's package and setting; the firewall rules; the storage alert; and everything a new
> host or database would need. **No dependency is added in M8.**

| What | Kind | For | Wave | Note |
| --- | --- | --- | --- | --- |
| Mail provider account; SPF, DKIM and DMARC records on a Lemnaria domain | resource, DNS | Q3, Q4 | 8J | Owner only |
| `MAIL_PROVIDER_API_KEY` | secret; production and preview | sending | 8J | Never in test or CI: the fake is injected |
| `MAIL_FROM_ADDRESS` | variable | the sender | 8J | |
| `LEAD_NOTIFICATION_ADDRESS` | variable | the shop's inbox | 8J | Its absence makes submission *unavailable* |
| `DIGEST_SECRET` **(added 2026-10-08; the owner: *"lets add this secret"*)** | secret; production, preview, development, and `apps/web/.env.local`; a different value in each | keys every rate-limit bucket and the contact request's conflict digest | 8F builds its reader; 8K reuses it | Sixty-four hexadecimal characters; the owner runs `openssl rand -hex 32` himself for each. **Set before 8F is merged: without it that environment creates no design.** Never in test or CI: the e2e harness makes a value per run. Rules: *The digest secret*, under 8I |
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
   **No record is assigned to wave 8C by this list** (its rules C1–C3 are in the 8C section only; see
   *8C as built*). **WRITTEN 2026-10-07: [ADR 0148](../decisions/0148-the-review-refuses-one-thing-at-a-time-the-first-the-customer-can-act-on-and-no-cabinet-means-nothing-lemnaria-supplies.md)
   holds C1–C3; 8D's close adds the screen's half to it (the next free number is now 0149).**
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
16. **WRITTEN 2026-10-07: [ADR 0147](../decisions/0147-the-mint-is-limited-to-twenty-a-day-per-ip-address-for-everyone-and-nothing-else.md)
    (the next free number is now 0148).** **Added 2026-10-07.** ~~The limiter's tiers and figures as Q28 settles them. If one tier: an
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
