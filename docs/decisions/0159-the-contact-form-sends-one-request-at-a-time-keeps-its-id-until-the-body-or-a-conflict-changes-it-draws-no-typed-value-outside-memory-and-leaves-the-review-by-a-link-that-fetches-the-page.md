# ADR 0159 — The contact form sends one request at a time, keeps its id until the body or a conflict changes it, holds no typed value outside memory, and leaves for the review by a link that fetches the page

Status: Accepted. Closes wave 8L (the contact screens 4A, 4B, 4C and the callback form of frame 2F). **Q10, Q41, Q42, Q43 and backlog 146 were ruled by the owner later the same day; see Amendment A, which supersedes the open-question text below.** Still open: Q35 to Q40 as already recorded; the owner's confirmation at merge time that no production data exists. Nothing is deployed, nothing is pushed.
Date: 2026-10-12
Type: Decision
Milestone: M8 wave 8L (web only; no file under `packages/`, `app/api/` or `proxy.ts`)

Written by the documentation scribe at wave 8L's close from the coordinator's hand-over, **which is relayed**, from the plan's *8L, restated for dispatch*, and from `.git/logs/HEAD` (commit list) and `apps/web/src/messages/ro.json` / `ru.json` (the two leaves quoted). **The scribe ran no command and no test.** Tiers: **[doc]**, **[src]** (read by the scribe, where it says so), **[ran]** with who ran it, **[relayed]**, **[inf]**.

## Context

8H gave the contact request one I/O-free definition (ADR 0150), 8K the route that stores it once (ADR 0157), 8K2 the rule that a design loaded again shows the stored copy (ADR 0158). 8L is the customer's side: three fields and a channel, validated where the customer is looking, sent once, with the personal data typed held nowhere but in memory (D17; ARCH section 8). The plan's section fixed rulings 8L.1 to 8L.15 and criteria 1 to 19 before the build; this record states what was decided **as built**, with the reason, and where the build differs from the plan.

## Decisions

### 1. One hook instance per page

The contact page owns **one** submission hook (`use-contact-submission.ts`); the screen, the form and the outcome read it and do not create a second. A second instance would be a second guard, a second id and a second copy of what was typed. S4a's commit names it (*one hook instance per page*).

### 2. One request in flight, no abort, no timer (criterion 10; 8L.5)

The guard is set in the press handler, synchronously, before `fetch`, and lasts until the fetch settles. There is no `AbortController` and no timer: the guard lasts *at least as long as the server may take* (ADR 0157 *Limits*, backlog 175). *Why:* an abort shorter than the server would let a second request start while the first may still be stored, which the server counts as a new request. *Limit, with its trigger (ADR 0118):* a request that never settles holds frame 4C until the browser gives up. **Trigger:** 8M's connection-loss work, or a report.

### 3. The same id and the same body on a retry; a new id only after a conflict or a changed covered field or revision (criteria 11, 12; 8L.4, 8L.6)

A retry after any answer that is not success, and after none, carries the same `clientRequestId` and equal `payloadDigestFields` output; `elapsedMs` is re-measured and is not covered (ADR 0157 d2). A new id is made after `CONTACT_REQUEST_CONFLICT` (the id is proved spent) and when a covered field or the revision differs from the last send. "Covered" is decided by comparing the **domain's** `payloadDigestFields` output, never a list in `apps/web`. *Why:* a request that was rejected may have stored, and only the same id finds that row (KL-R1.2); the same id after a conflict would be refused for ever.

### 4. The way to the review is a link that fetches the page (criterion 14; ADR 0158 d4)

After `CONTACT_DESIGN_NOT_CURRENT` and `CONTACT_DESIGN_DOES_NOT_FIT`, and by the top bar's chevron, the way to the review is an `i18n/navigation` `Link` to `/d/{id}/review` with prefetch **off**; never `router.back()` or `history.back()`. *Why:* Next 16.3.8's `staleTimes.dynamic` is 0 and does not change back and forward caching [doc, `staleTimes.md`, as the plan quotes it], so a push fetches the page and a step back does not; the review shown is then of the stored design. The contact page hydrates through the same predicate the review does (`store/newest-copy.ts`, moved by S0), and makes no request to hydrate.

### 5. `isContactSendable` answers a boolean and nothing else (criterion 7; 8L.9)

One server function answers what `submit-contact.ts` answers as *unavailable* for a sender or a digest secret, and the page hands the client **a boolean**: no variable name and no value in the HTML or the RSC payload. When false the screen says the request cannot be sent and draws no form. The shop's telephone is the other channel and is still owed (Q3), so it is not drawn and never with a stand-in.

### 6. S7: the id's shape is refused in the shared owned load, before any query (criterion 16; 8L.13)

`loadOwnedDesign` answers *unavailable* for a segment that is not `isDesignId`'s shape, before any repository call, for every door at once. **The merge is gated by backlog 146's count of stored ids without the generator's shape: it must be 0.** If it is not, S7 returns to planning before the branch merges (8T's gate line). *Fact for the reader:* the contact route has refused such ids since 8K, so until S7 such a design opened in the editor and the review and could not be sent.

### 7. The consent text is provisional (Q7 (b); 8L.11)

The frame's sentence is drawn with a visible marker that it is provisional, and the request carries `consentTextVersion: "placeholder"`. *Detalii* is not drawn: no privacy notice exists, and a link to nothing is not drawn. Both leaves are carried in the copy lock under a slot comment. The launch-gate line (no page sends `"placeholder"`) is M9's (ADR 0150, reading 8a).

### 8. The form is `method="post"` because the callback form is server-rendered

The callback page is rendered per request, so its form can be submitted before any script has run. Without a method a browser submits a form as `GET`, which would put the typed values in the URL (criterion 6). The form therefore carries `method="post"`, so that **no query string is made before hydration** (review fix-up `7d6149b5`; QA round 2 `9cc0c5a1` drives it with scripts off [commit message, relayed]).

### 9. The 429 sentence names its day (new leaf `limitedTomorrow`; Q10)

A `429` carries `Retry-After` up to a UTC day (ADR 0157 d6). A clock time alone is wrong when that time is tomorrow, so there are two leaves [src, ro.json:383-384, ru.json:383-384]: `limited`, *"Prea multe cereri într-un timp scurt. Poți trimite din nou după ora {time}."*, and `limitedTomorrow`, *"... Poți trimite din nou mâine, după ora {time}."* (Russian: *"... можно завтра, после {time}."*). **The wording is drafted and awaits the owner (Q10).** Russian is never marked approved.

### 10. The retry is `aria-disabled` while a save waits

While `design !== savedDesign` in any held state of ADR 0158 d3, the call to action is off with the save wait's sentence, and a press sends nothing (criterion 5). The review fix-up applies this to the retry as well (`7d6149b5`: *retry off while a save waits*). The revision sent is the **store's** at the press, read with `savedDesign` in one store read, never the page's prop.

### 11. The callback form is not held by another design's save; a save conflict draws the way to the editor

Two defects QA found and the developer fixed in `91bd8fd2`: the contact page's save conflict had no link to the editor (F1; now the shared `OpenEditorLink`), and the callback form (no design) was held by another design's save (F2).

## Deviations from the plan, with the reason

- Slice S3's property test was made to stop failing by chance (`e409e2d0`: sequences at full size, a generator for the id's fate, every arm's floor five sigma under its measured mean). A test change, in the developer's own file.
- A new leaf, `limitedTomorrow`, and its Russian twin, was not in the plan's *S2* list; the review found the clock-time-only sentence wrong across midnight (decision 9).
- **The plan's point 9 repin list was incomplete.** Two more QA-owned pins were stale and QA repinned them: `qa-8d-review-scene.adversarial.e2e` line 378 (the exit link count, 2 to 1) and `qa-8d-review-door.adversarial.e2e` line 362 (the contact route, 404 to 200) [relayed].
- Visual deviations from the Mobil mockup that are **recorded decisions**: the consent pinned with the call to action; a provisional marker in place of *Detalii*; a real design card in place of the frame's neutral square; plain outcome styling. The sent screen is a bare notice; frame 5A is 8M's.

## Evidence

- [relayed, coordinator-ran, HEAD `9cc0c5a1`; `src` unchanged since `7d6149b5`] typecheck, lint, format and `gate:boundary`, exit 0.
- [relayed, QA-ran] the whole web Vitest suite: 454 files, 9356 tests passed.
- [relayed, QA-ran, 11.1 minutes] `CI=1 pnpm test:e2e`: 879 passed, exit 0. [relayed, coordinator-ran at `91bd8fd2`] the same command: 852 passed.
- **Not run:** `pnpm ci:local` at or after the 8L code (Q42); `pnpm check`; anything on a CI runner; the domain and persistence suites (no file under `packages/` changed [relayed]).
- 8L's commits, from `.git/logs/HEAD` [src, scribe]: S0 `03091d01`, S1 `f18ef8ef`, S2 `1fd0ff20`, S3 `9bc7631a`, S4a `efebeb41`, S4b `015b7ec7`, S5 `39210cc5`, S3 test `e409e2d0`, S6 `5095ac78`, S7 `1a918c6a`, QA `8ca2dfe1`, fix `91bd8fd2`, review fix-up `7d6149b5`, QA round 2 `9cc0c5a1`. The restatement is `6584ea6a` (the base for the range).

## What is unproven

- The real on-screen keyboard and real autofill (that autofill fills no honeypot and that an autofilled form sent by a real tap passes 8K's two seconds): **8T's phone gate**.
- A real `422` through the browser: only dom tests cover the does-not-fit screen.
- A send in flight when the customer leaves: accepted (decision 2); 8L.5 and 8M.
- **e2e mutants were not run** (ADR 0155). One no-JS mutant ran against the callback page, which touches no database [relayed].
- About four leftover rows in the **test** database from the visual verifier; their ids are unknown, nobody has removed them (ADR 0151; the environments guide: report, the human decides).
- One unexplained desktop flake, seen once: `u-gate-journeys.ts:374` (U7 S2); it passed alone and on rerun [relayed].

## Owner's questions

- **Q10:** the Romanian and Russian wording of `limitedTomorrow` (decision 9). Recommendation: approve as drafted, or reword it.
- **Q41:** unchanged; recommended (a), built on (a) (ADR 0158).
- **Q42 (blocks the push):** `ci:local` runs e2e under `CI=1`, **recommended**, or the exact-count specs relax on a dev server. 8L's request-counting specs are written for the production server.
- **Q43:** the link e-mail on frame 2F (8L.12): (a) a small wave of its own in M8, or (b) with M8B. **Recommended (b).**
- **Q35 to Q40:** as already recorded.
- **Backlog 146's count** (must be 0 before merge).

## Amendment A (2026-10-12, later the same day): the owner's rulings, relayed by the coordinator

Recorded by the scribe from the coordinator's message [relayed]. The sections above are kept as written; where they say these questions are open, this amendment supersedes them.

- **Q42, decided.** `pnpm ci:local` runs its e2e step as GitHub does: under `CI=1`, with a production build. A developer is changing `scripts/local-ci.sh` and `docs/best-practices/ci-and-local-gates.md`; the scribe did not touch either. **Once that change is committed, Q42 no longer blocks the push** (backlog 182). Until then it does, and the change was not seen by the scribe.
- **Q10, decided: owner-approved 2026-10-12.** The owner supplied the Romanian text of `limitedTomorrow`: *"Din păcate, ați încercat să generați o bucătărie de prea multe ori într-un timp scurt. Vă încurajăm să reveniți mâine, după ora {time}."* The coordinator translated the Russian; a developer is putting both into the messages. **Until that lands, `ro.json` and `ru.json` still hold the drafted wording quoted in decision 9** (read by the scribe earlier today; not re-read after the ruling). Note: the owner's wording says "generate a kitchen" for a limit that is on contact requests; the owner chose it.
- **Backlog 146, resolved by ruling.** The owner says nothing is in production, so the count of stored ids without the generator's shape is moot; if a row in a non-production database lacks that shape, the owner allows truncating the needed tables. **Caveat: the owner must still confirm that no production data exists at merge time.** Decision 6's "the count must be 0" gate is replaced by that confirmation.
- **Q41, decided: (a).** Pressing Back shows the older copy, locked. The way to the newest is the existing review-again link, which fetches the newest page.
- **Q43, decided.** The link e-mail back to the customer goes to M8B.
- The locale switcher's height (backlog 192) and F4 (backlog 189) go to the backlog, as recorded. The sent screen (frame 5A) stays in 8M. Q35 to Q40 stay as recorded.

## Alternatives not taken

A client abort or timer (decision 2: it shortens the guard below the server's time); a new id after every failure (decision 3: loses the stored row); `router.back()` to the review (decision 4: shows the kept, older page); sending the variable names to the client (decision 5); a `GET` form (decision 8).

## Dated note — 2026-10-13, wave 8M (the scribe; relayed; nothing re-run)

**Decision 1 is narrowed, not overturned.** The title's and decision 1's *"one place of memory"* held for the form: the hook is still the form's one place. 8M adds **a second, bounded place of memory for the sent request**: on a `sent` answer the hook writes one entry (design id and revision, the reference, the channel, and one typed value, the phone or the e-mail the shop will use; no name, no locality) to `done/sent-request-memory.ts`, so `/done` can say which number the shop will call. It is replaced by the next sent request, cleared when a design contact form mounts, gone on a reload, and never in a URL, a cookie, browser storage or the store; criterion 6's source scan was widened to `done/` (checkpoint A) with one named router exception. **Security's note, not yet acted on:** the typed value stays in tab memory until a reload or the next design form (backlog 197). **Decision 2 stands** (no abort, no timer): its trigger, *8M's connection-loss work*, was met and considered; the limit is kept, with a new trigger, a report from a real phone (8T). **A new class, `unanswered`**, a fetch that rejected, is told from `failed` and is the only thing the automatic retry follows (the `online` event; same id and body). Decision 4's link fetches the page as before, and 8M's own leaving is one `router.replace` from the contact page to `/done`. The *sent screen is a bare notice* deviation is closed by frame 5A (and the callback form's own sent view). Record: [ADR 0160](0160-a-sent-request-is-handed-to-its-done-page-in-memory-by-a-replaced-history-entry-an-answerless-send-is-retried-only-by-the-connection-returning-and-the-failure-screen-is-a-state-of-the-contact-page.md).
