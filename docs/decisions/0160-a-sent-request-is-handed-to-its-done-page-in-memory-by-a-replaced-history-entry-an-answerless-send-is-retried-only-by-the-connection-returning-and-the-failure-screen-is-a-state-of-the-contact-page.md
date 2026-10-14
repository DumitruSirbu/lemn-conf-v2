# ADR 0160 — A sent request is handed to its done page in memory by a replaced history entry, an answerless send is retried only by the connection returning, and the failure screen is a state of the contact page

Status: Accepted. Closes wave 8M (success frame 5A, failure frame 5B, the `/d/{id}/done` route and 5A's WhatsApp action). **Not owner-approved in its copy** (six groups of 8M copy, the WhatsApp message and the proposed `leavingLine` await the owner; see *Owner's questions*). Nothing is deployed, nothing is pushed by this wave.
Date: 2026-10-13
Type: Decision
Milestone: M8 wave 8M (web, plus one new read in `packages/persistence`; no migration, no grant, no file under `packages/configurator-domain/`, `packages/three-adapter/`, `app/api/` or `proxy.ts` [plan, point 5 *Must not*; the scribe did not run the diff])

Written by the documentation scribe at wave 8M's close from the coordinator's hand-over (**relayed**), from the plan's *8M, restated for dispatch* (rulings 8M.1 to 8M.12, criteria 1 to 19) and from `.git/logs/HEAD` (the commit list and subjects). **The scribe has no shell and ran no command and no test.** Tiers: **[doc]**, **[src]** (read by the scribe, where it says so), **[ran]** with who ran it, **[relayed]**, **[inf]**. Which criterion each test shows was not re-derived by the scribe.

## Context

8L built the contact form and left its sent state as a bare notice, with a request that got no answer drawn as the same failure as a refusal (ADR 0159). 8M is the customer's side of what happens next: frame 5A (the request has left, with its reference and what follows) and frame 5B (it did not, and nothing typed is lost). The plan fixed the rulings before the build; this record states what was decided **as built**, with the reason, where the build departs from the plan, and the two defaults (Q44, Q45) the owner has not yet ruled on.

## Decisions

### 1. `unanswered` is a class of its own, and it is the only thing the automatic retry follows (8M.4, 8M.5; criteria 5, 6, 19)

`sendContactRequest` answers `unanswered` for a fetch that rejects; every answered failure (`502` either code, `503`, `400 CONTACT_REJECTED`, another `4xx`/`5xx`, an unreadable `200`) stays `failed`. The id rule treats both as 8L treated `failed`: same id, same body, `elapsedMs` re-measured (S1 `e4429e0b`). **The automatic retry has one trigger: the browser's `online` event after an `unanswered` send with no send since.** It calls the same press, so it inherits one request in flight, the same id and body, the save wait and the limit's wait (S2 `0ba5fbce`). *Why:* only a lost connection is a cause the return of the connection cures; an answered failure spends the request's tries bucket on each attempt (ADR 0157 d1), and a timed backoff would be a timer and a schedule nobody has ruled. An `online` event that never comes leaves *Încearcă din nou* for the customer. **ADR 0159 decision 2 stands (no abort, no timer on the request)**; its trigger, *8M's connection-loss work*, has been met and considered, and the limit is kept with a new trigger: a report from a real phone (8T).

### 2. 5B is a state of the contact page for two classes, and only those (8M.4; criteria 4, 6)

`unanswered` shows the lost-connection sentence, `failed` the not-sent sentence; `refused`, `conflict`, `design-not-current`, `does-not-fit` and `limited` keep 8L's sentence beside the form. While 5B shows, the form is not drawn and every typed value stays in the hook, so nothing is asked again. Frame 5B's bar *"✓ Cerere trimisă"* is **not drawn**: it is the success frame's bar and on a failure it would be a false success (D9). The callback form (no design) has no `/done`, so on *sent* it draws its own sent view in place: 5A's heading, channel line and reference with *Copiază*, and none of the parts that are about a design (S7 `e076516d`). No frame draws that view; the owner sees it at the hand check. 5B draws no `tel:` link and no stand-in number (Q3, criterion 7).

### 3. The design form leaves for `/done` by replacing its own history entry (8M.3; criterion 11; Q41 (a))

On *sent* the page makes one `router.replace` to `/[locale]/d/{id}/done`, so Back lands on the review (which is the older copy, locked, with the review-again link the way to the newest, Q41 (a)) and never on a sendable contact page. The one router call is in `done/use-replace-with-done.ts` (S6 `f6613ade`); the source scan of `contact/` is not loosened and reads that file as its one named exception, whose one call is `replace`. **Fix from QA (F1, `5fd0c9bc`):** between the `200` and the arrival of `/done` the page had gone blank. The page now keeps the existing `contact.sendingLine` leaf, `role="status"`, until `/done` arrives (`LeaveForDone`). *Not taken:* `router.push` (Back returns to a fresh form that sends a second request); `history.replaceState` (Next would restore the contact tree under the `/done` address).

### 4. A sent request is handed to `/done` in memory: one entry, four values, no place of storage (8M.2; criterion 12)

On *sent* the hook writes one entry to `done/sent-request-memory.ts`: the design id and revision, the reference from the answer, the channel, and **one** typed value, the one the shop will use (the phone for *Telefon* and *WhatsApp*, the e-mail for *E-mail*). No name, no locality, no consent. It is replaced by the next sent request, cleared when a design contact form mounts, and gone on a reload. Reading does not clear it, so a language switch or Back then Forward shows the same 5A. **Checkpoint A (the security reader, before S3) made three changes, recorded in S3's commit** [commit subject, relayed]: the scan is widened to `done/`, there is no server-side hand-over, and the entry is frozen. **Security's later finding, relayed and not yet acted on (backlog 197):** the typed phone or e-mail stays in tab memory until a reload or the next design form mounts; clearing it on the done screen's unmount is optional hardening. The decision narrows ADR 0159 decision 1; see that record's dated note.

### 5. What 5A shows is decided by one pure function (8M.6, 8M.7; criteria 1 to 3)

`resultToShow` takes the hand-over (matched on design id **and** revision) and the server's answer for this design at this revision, and answers: **sent** with the typed value (hand-over matches); else **sent** without it (the server's answer); else **no request** (a sentence and the review link, no check mark, no claim); else **not shown** (the read failed). The server's answer is one new read, `findSentReference({designId, revision})`, on the contact-submission port: one `select reference` where the design id and revision match and `notified_at is not null`, latest notified first, then the reference; parameters only; its answer checked with `isSubmissionReference`; one new store-error operation name; **no migration and no grant**, four of the seven readable columns, never a list, a count or a personal column (S3 `a18870bb`; dated note on ADR 0153). **A stored request never notified is not shown as sent.** The read runs only behind the shared owned load, which `/done` calls itself, rendered per request, so the four doors (`/d/{id}`, `/review`, `/contact`, `/done`) answer one request alike (criteria 9, 10). *Recorded limit, kept from the plan:* a request whose notice was accepted and whose mark then failed (ADR 0157 d5) is *sent* to the tab that got the `200` and *none* on a later load. **Not covered by any index:** the read's query has none (backlog 196).

### 6. 5A draws a picture and never waits for it (8M.8; criterion 17)

The view-only canvas (`ReviewScene`) mounts at the room's `overview` preset, without chips and without writing the remembered camera view; a neutral square stands while WebGL is probed and where it is unsupported, and the heading and the reference are drawn at once. 5A shows no price, so it does not wait on the probe (ADR 0148 A3 ruling 4). No file under `packages/three-adapter` changed [plan; not diffed by the scribe].

### 7. The copy: `submissionResult`, 29 leaves, three slots, six groups for the owner (8M.10; criteria 3, 8, 14)

S4 `a1a63769` adds the namespace `submissionResult` with **29 leaves** in `ro.json` and `ru.json` [commit subject, relayed] and retires `contact.outcomes.sent` and `contact.outcomes.failed`; `unanswered` has its own sentence. As drawn where the frame's sentence is true, drafted where it is not; Russian is never marked approved (Q10 (a)). 5A's three steps are slots (Q9), carried in the copy lock under a slot comment. 5B's kept sentence says the details stay while the page is open, never *saved on the phone* (Q18 (a)). No leaf offers a profile or an e-mailed link (Q11, Q43). The two notice kinds that the retirement left unused were deleted in the review fix-up `68cadbbe`.

### 8. The WhatsApp action is built on the customer's own link and ends in one external anchor (8M.11; Q44 default (a); criterion 18)

Drawn only where the share control would be (`canWrite === true` and saved once). A press asks the link's status; if one is active it shows `share.reissueWarning`; it issues the link through `issueShareLink`; it then shows **one external anchor**, to `https://wa.me/?text=` with the drafted sentence and the link's absolute address, `target="_blank"`, `rel="noopener noreferrer"`. **Three taps, not the plan's two, when a link is active** (the press, going on, the anchor) [commit subject, relayed]; the anchor is a separate tap because a window opened after an `await` is blocked on phones as not the customer's gesture [inf; QA confirmed in Chromium, 8T on a phone]. The link lives only in that component's state. S8 `bd8a86ad`. The review fix-up made the share control compose its address through `absoluteShareAddress`, so the two places no longer build it twice. **This departs from the standing wording of ADR 0114 Amendment G (the link is shown once and never an anchor); see that record's dated note.** The *go on* label reuses `share.reissue` (a reuse, not a new leaf; owner-visible, backlog 205, with the spoken *busy* leaf WhatsApp lacks).

### 9. Focus, announcements and the discs (8M.12; criterion 13)

5A's `h1` takes focus on arrival; 5B's `h1` takes focus when 5B replaces the form; *Așteptăm conexiunea…* is a `role="status"` present only while offline; *Copiat* is announced; the check and `!` discs are `aria-hidden`. **Not proven by a screen reader**; see *What is unproven*.

### 10. Q45, built on (a)

After a send the customer who returns to the review and presses *Cere oferta* again for the same unchanged kitchen gets the form again, and a second request is sent if they fill it (at most two new requests an hour from one browser). **Built on (a) as the architect recommended; not an owner ruling** (the owner has not been asked in a message the scribe can see). It is what 8L already does. (b), the contact page saying it was already sent, needs S3's read on a second page and a screen no frame draws; revisit with M8B.

## Deviations from the plan, with the reason

- **Three taps, not two**, for WhatsApp when a link is active (decision 8): the warning is its own step.
- **A new gap found by QA, fixed:** F1 (the blank page after sent), decision 3. F4: the router scan was hardened to see a hidden second call (3 mutants [relayed]).
- **The QA-owned reds list was again incomplete.** The plan's point 9 named `qa-8d-review-door.adversarial.e2e` `:336-340`, `qa-8l-contact-phone.adversarial.e2e` `:263, 374` and `qa-8l-contact-screen.adversarial.dom` `:157`, and said the list might be incomplete; QA repinned the stale `8D` and `8L` reds in `5fd0c9bc` [commit subject, relayed]. **Which test files exactly were repinned was not read by the scribe**; read the commit.
- **Mobile e2e shards 7 to 8** (`.github/workflows/ci.yml`, `scripts/gates/e2e-shard-budget.mjs`, `scripts/local-ci.sh`), because the three new e2e files and the QA specs moved the budget [relayed; the scribe read `SHARDS_PER_PROJECT = { desktop: 3, mobile: 8 }` at `e2e-shard-budget.mjs:48`]. `ci-and-local-gates.md` carried stale prose (`nine-leg`, *six when mobile had three shards*); corrected in this close (eleven legs, 3 + 8).
- **A checkpoint A** read S1 and S2 before S3 and changed S2 (decision 4), as the plan intended.

## Evidence

- Commits, from `.git/logs/HEAD` [src, scribe]: plan `f31f6648`; S0 `5720fc80`; S1 `e4429e0b`; S2 `0ba5fbce`; S3 `a18870bb`; S4 `a1a63769`; S5 `c15d25ef`; S6 `f6613ade`; S7 `e076516d`; S8 `bd8a86ad`; QA `5fd0c9bc`; review fix-up `68cadbbe`. The plan commit's parent, `fc6a2d9b`, is the base.
- [relayed, coordinator-ran, HEAD `68cadbbe`] the whole web Vitest suite **475 files, 9805 tests**; typecheck, lint, format, `gate:boundary` and `gate:e2e-shard-budget`: all exit 0.
- [relayed, coordinator-ran, HEAD `68cadbbe`] the whole `CI=1` e2e: **923 passed, 1 failed**. The one failure is `qa-8d-review-scene.adversarial` line 189, a pixel-change test: 32757 against a bound of at most 60. It passed 3 of 3 alone; read as a load-dependent flake and recorded as backlog 195, **not proven to be one**.
- **QA verdict, relayed: SEND BACK, then fixed** (F1 and F4 and the shards). **Reviews, relayed:** logic, minor concerns, no blocker; clean-code, the dead notice kinds and a duplicate `location.origin` fixed in `68cadbbe`, the rest in the backlog; security, no exploitable issue; visual, production build at 390 x 844 in ro and ru: 5A and 5B match the plan, with the deviations listed under *What is unproven and open*.
- **Not run:** `pnpm ci:local`; `pnpm check`; a CI runner; a real phone; the live persistence suite for `findSentReference` (the coordinator owes one run, alone, ADR 0155); e2e mutants against a database.

## Reviews' findings that are decisions, not defects

- **Logic F2.** An `online` event spent on an in-flight retry that then gets no answer leaves 5B's note still promising an automatic retry. Accepted: no timer is added. 8T's phone gate gains a line for it.
- **Logic F3.** After a reload of `/done`, the WhatsApp action is absent, because `canWrite` is *checking* there. This matches criterion 18 as written and is a **product gap**. Passing `canWrite: true` from the `/done` hydrator would be a change to a ruled gate and needs a dated amendment; **not made** (owner question).
- **Logic, wording.** The interim line (`contact.sendingLine`) is wrong in words for an already-sent request. A new leaf `contact.leavingLine` is recommended, ro *"Se deschide confirmarea…"*, ru *"Открываем подтверждение…"*. **Not added; the owner approves copy.**
- **Logic.** The not-sent sentence is told for every answered failure, including a `200` whose body was lost. The owner may want a softer wording. **Revision drift:** after a second-tab save, `/done` shows the no-request view; by design (decision 5).

## What is unproven and open

- On a phone: the clipboard on iOS; a discarded-tab reload of `/done`; a real network drop and when `online` fires; WhatsApp opening; the desktop line at 1440 and 900; the camera view remembered after returning to the editor (criterion 17, **dom only**); keyboard and screen-reader announcements; the live persistence suite for `findSentReference`. All go to 8T (or, for the live run, to the coordinator).
- **Visual deviations from the plan, relayed:** the interim line is a small grey 12 px sentence on an otherwise blank page (no mockup frame draws it); the locale pill is 47 x 25 px (backlog 192; the owner decides an exemption); the no-request view's heading looks unstyled against 5A (three-line wrap, no check mark, no back link); a visible focus ring on the `h1` after a reload or in the no-request view, conspicuous on touch; *Copiat* sits beside *Copiază* for two seconds; the offline line is far from the retry; the contrast of the 10.5 px *Număr cerere* label was **not measured**.
- Security notes, no exploitable issue: no index for the `findSentReference` query (an additive migration if leads grow, never an edit of `0008`); a concurrent replay could double-deliver, which Resend's `Idempotency-Key` covers [**inference**, not checked against Resend's documents]; the share token travels to WhatsApp by design.
- The test database holds two contact requests and six minted designs left by the visual run; the cleanup script was blocked by the classifier; nobody removes them (ADR 0151); the owner may clear them.

## Owner's questions

- **Q44, built on (a)**: the WhatsApp message goes to whomever the customer picks. Not ruled.
- **Q45, built on (a)**: the form again after a send. Not ruled.
- **Copy approvals:** six groups of 8M copy flagged in the plan (5A's saved sentence, the channel lines for *Telefon* and *E-mail* and the variant with no number, 5B's kept sentence with its twin and title, the retry line, the no-request and not-shown sentences), the WhatsApp message, and the proposed `contact.leavingLine`.
- **Q9:** the three next-step texts. **Q3:** the shop's phone number.
- **Register mismatch** (relayed; detail not read by the scribe), **the not-sent wording**, **the F3 `canWrite` decision**, **the locale pill's exemption**, and **backlog 146's caveat** (confirm no production data exists at merge).

## Alternatives not taken

A form held above both pages by a route-group layout (moves 8L's files and still loses the number on a language switch); the reference in a query string (forgeable, in history); session storage (D17); `router.push` to `/done`; a timed or counted automatic retry; a retry on any answered failure; the share link as a Next `Link` or a window opened after an `await`; a server-side hand-over of the typed value.

## Dated notes — 2026-10-14, at the close of wave 8M2 ([ADR 0163](0163-the-design-goes-to-the-shops-whatsapp-an-unchanged-kitchen-already-sent-for-shows-its-request-and-a-call-and-the-shops-number-is-one-constant-a-launch-gate-refuses.md), Accepted)

Nothing above is erased. Source of each: ADR 0163 and its Amendments A and B **[doc]**; the owner's rulings of
2026-10-13 **[relayed]**; the scribe ran nothing.

- **d2 (5B draws no `tel:` link).** Superseded. 5B draws *Sună direct la magazin* for both classes (ADR 0163 decision 9),
  dialling the one shop-phone constant, which is a placeholder under the launch gate until Q3.
- **d4 (the hand-over is cleared when a design contact form mounts).** Widened by ADR 0163 Amendment A, A1. The clear
  runs in a client effect of `ContactScreen`, so it happens in **every arm of the design contact page** (already-sent,
  unsupported, the form, the unavailable page), and is **removed from the submission hook**. The callback page does
  not clear. Backlog 197's trade is unchanged.
- **d5 (the read of `findSentReference`).** A **second caller**: the design contact page, after the owned load allows,
  with the loaded revision, only `{kind, reference}` crossing. **The contact page's read has a 300 ms deadline** that
  answers `unknown` (which gives the form); `/done`'s read has **none**, because there `unknown` costs the
  confirmation. **Both callers write one log line per process and cause**, from a closed list (`store-error`,
  `deadline`, `unexpected`), with no message, operation, id, revision or reference (ADR 0163 A8). **The deadline fired
  once in a whole e2e run** [relayed by the coordinator; spec and run not given to the scribe]; the figure is not
  loosened. The query still has no index (backlog 196, which gained triggers).
- **d8 (the WhatsApp action).** The anchor is addressed to the shop: `https://wa.me/{digits}?text=`, the digits derived
  from the one constant. The message names the request's reference and the customer's view-only link. The shop holds
  the customer's one active link, so the customer's next reissue revokes it, and the shared view shows the live row
  (Q60 (a)). Q44 is answered **(b)** by the owner.
- **d10 and Q45.** Superseded by the owner's Q45. An unchanged kitchen already sent for shows the already-sent view
  (the reference, advice to call, the call link, a way back to the design) and **no form**; the block is hard, with no
  "send anyway". **A limit, recorded beside Q55 (a):** after a lost answer, review and browser Back, the contact page
  can show an empty form for a kitchen that may already be sent (ADR 0163 Amendment B, point 3).
- ***Reviews' findings*, F3.** Made, in its narrow form: on `/done` the action's gate accepts any held write-access
  answer but `false`, and nothing is written to the store (ADR 0163 decision 4, corrected by Amendment A, S3-3).
- **Owner's questions.** Q44 and Q45 are answered, and the register is settled as informal *tu* / *ты* everywhere.
  **Still open and the owner's:** the copy approvals (including four Russian leaves that change register and need
  re-signing), Q9's next-step texts, Q3's real shop number.
