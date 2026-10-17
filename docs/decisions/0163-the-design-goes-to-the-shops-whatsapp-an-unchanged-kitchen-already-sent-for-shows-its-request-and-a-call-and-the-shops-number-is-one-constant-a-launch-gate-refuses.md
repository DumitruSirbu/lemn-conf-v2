# ADR 0163 — The design goes to the shop's WhatsApp, an unchanged kitchen already sent for shows its request and a call, and the shop's number is one constant a launch gate refuses

Status: **Accepted — 2026-10-14, at the close of M8 wave 8M2** (code HEAD `c6374732`, local, not pushed). It was
Proposed on 2026-10-13 by the architect at the planning of the wave; that text and Amendment A are kept below, and
*Amendment B* records the close. **Owner copy approvals are still pending** (see Amendment B). Which of the records
under *Amends, when accepted* have their dated note is stated in Amendment B; ADR 0160 has all of its notes, the
others are **owed** and listed there.
Date: 2026-10-13
Type: Decision
Milestone: M8 wave 8M2 (plan: [`milestones/8M2-shop-whatsapp-and-already-sent.md`](../milestones/8M2-shop-whatsapp-and-already-sent.md))

**Amends, when accepted:**
- [ADR 0160](0160-a-sent-request-is-handed-to-its-done-page-in-memory-by-a-replaced-history-entry-an-answerless-send-is-retried-only-by-the-connection-returning-and-the-failure-screen-is-a-state-of-the-contact-page.md)
  d2, d8, d10 and *Reviews' findings* F3; *[added 2026-10-14, Amendment A]* d4 (the hand-over clear widens to every
  arm of the design contact page) and d5 (a second caller of the read, with a deadline, and one log line);
- [ADR 0159](0159-the-contact-form-sends-one-request-at-a-time-keeps-its-id-until-the-body-or-a-conflict-changes-it-draws-no-typed-value-outside-memory-and-leaves-the-review-by-a-link-that-fetches-the-page.md)
  d5 and Amendment A (`limitedTomorrow`);
- ADR 0114 Amendment G (its 8M note); ADR 0153 and ADR 0148 (dated notes); ADR 0156 (the Russian register note);
  ADR 0095 (the re-sign list);
- ADR 0157 d1 and d4 **only if** the owner answers Q55 (b).

Evidence tiers: **[doc]** quoted from a record; **[src]** read at `d61bfd6d` through `git show HEAD:`;
**[relayed]** the owner's words as the coordinator passed them on; **[inf]** the architect's inference, with what
would falsify it. Nothing was run.

## Context

8M built 5A's WhatsApp action and the "form again" behaviour on two defaults the owner had not ruled: Q44 (a), where
the customer picks the recipient, and Q45 (a), where a customer can send a second request for an unchanged kitchen.
8M also left the shop's number undrawn everywhere, under ADR 0159 d5's *"never with a stand-in"*, because Q3's
number is owed [doc: ADR 0160 *Owner's questions*; d2, d8, d10].

On 2026-10-13 the owner ruled [relayed]:
- **Q44 = (b).** *"WhatsApp: the message goes to the general shop number (initially the same as the main phone
  number)."* The number is one placeholder constant shared with the shop's phone. A pre-launch check must fail while
  it is the placeholder.
- **F3 is approved as a fix.** `/done` may pass `canWrite: true`, so the action shows after a reload.
- **Q45, in the owner's words:** *"I will check if the form was already sent, to avoid DDoS; but in case the user
  wants to edit it (maybe they made a mistake), maybe advise to call instead of sending again."*
- **All copy is in the informal *tu* register**, with Russian translated as *ты*.

## Decision-record sweep

The full table is in the plan, *Decision-record sweep*. In short:

| Record | Said | Now |
| --- | --- | --- |
| ADR 0159 d5; 8M scope note, *Must not*, criterion 7; M8 named interim 6 | The shop's number is never drawn with a stand-in | **Superseded by the owner's ruling:** drawn as a placeholder constant that a launch gate refuses |
| ADR 0160 d2 | 5B draws no `tel:` link | Superseded: 5B draws *Sună direct la magazin* |
| ADR 0160 d8; 8M criterion 18 | `https://wa.me/?text=`; gate `canWrite === true` | Superseded: addressed to the shop's number; F3's gate |
| ADR 0160 d10; M8 Q45 | Built on (a): the form again after a send | **Superseded by the owner's Q45** |
| Q5 (c), not taken | Spend the design's one share link on the shop | Not revived. The customer chooses to send their own link. The same consequence is recorded (decision 3) |
| ADR 0148 E3a | The held write-access answer is a fact about the browser | **Kept:** F3 writes nothing to the store (decision 4) |
| ADR 0157 d1, d4 | The route's order; a failure holds no reference | **Kept by default** (decision 8) |
| ADR 0156; ADR 0160 *Owner's questions* | Russian informal here, formal on the refused page; a "register mismatch" open | Settled: *ты* everywhere |
| ADR 0159 Amendment A | The owner's own formal `limitedTomorrow` | Re-drafted in *tu*, and put back to the owner (Q58) |
| Q3 | The shop's number is owed | **Still open.** The constant is not its answer |

## Decisions

### 1. The shop's phone is one constant in E.164; everything that dials it or shows it derives from it

- `SHOP_PHONE_E164` is declared once in `apps/web/src/shop/shop-phone.ts`, with three pure derivations: the `tel:`
  address, the WhatsApp digits, and a display form.
- The texts carry `{phone}`. No leaf holds a digit of it.
- *Why one constant for two uses:* the owner said the WhatsApp number is *"initially the same as the main phone
  number"*. A divergence later is a second constant, under the same gate.
- *Not taken:*
  - an environment variable. It is not a secret, the owner asked for a constant, and a gate on a deployment's
    variable checks a setting rather than the code.
  - the domain package. A shop's contact is not a kitchen rule.

### 2. The placeholder cannot reach a person, and a gate refuses it until the owner replaces it

- The placeholder is `+37300000000`. The project's own phone rule refuses it as `PHONE_MOLDOVAN_SECOND_ZERO` [src:
  `packages/configurator-domain/src/contact/phone-number.ts:65-71`], so it is outside everything the contact form
  accepts. That no subscriber holds it is [inf] from the trunk-prefix rule, not from the numbering plan.
- `isLaunchReadyShopPhone` is true iff the value is not the placeholder and is its own accepted normal form.
- `pnpm gate:launch-placeholders` asserts it on the real constant and is **red until Q3 is answered, by design**.
  It is therefore kept out of the default suite, `check`, `ci:local` and `ci.yml`.
- It runs from M8's *Launch gate* line (carried to M9), whose exit 0 must be quoted. By Q57 (a) it also runs from a
  production-only step of `deploy.yml`.
- **That workflow is manual and inert, and Vercel's Git integration is the real deploy path** [src: `deploy.yml`
  header]. So the checklist line is the operative gate.
- *Not taken:*
  - a test in the default suite that fails while the placeholder stands. It would make every push red for a fact
    only the owner can change.
  - hiding the call and the recipient until the number exists. That was ADR 0159 d5, now overruled by the owner.

### 3. 5A's message goes to the shop's WhatsApp, carries the reference, and is still the customer's own link

- The anchor is `https://wa.me/{digits}?text={message}`. The message names the request's reference and the
  view-only link, in the customer's voice. It is written so that it addresses the shop with neither *tu* nor
  *dumneavoastră*.
- The rest of ADR 0160 d8 stands:
  - the link is issued through the share endpoint, with the reissue warning when one is active;
  - three taps with an active link;
  - the anchor is the customer's own tap;
  - `noopener noreferrer`;
  - the link lives in component state only.
- **Consequences, accepted by default (Q60):**
  - The shop now holds the customer's one active link, so the customer's next reissue revokes it.
  - The share view reads the design's **live** row [src: `share-link-repository.ts:223-239` joins `designs`], so the
    shop sees later edits, not the kitchen as sent.
  - The reference in the message is the durable handle. The stored snapshot and the e-mailed summary are what was
    sent (Q5 (a)).
- *Not taken:* a frozen link for the shop. That is Q5 (b): a new token, table and route, as its own Full wave.

### 4. F3: on `/done` the WhatsApp gate accepts any held write-access answer but `false`, and the store is not written

- The owner approved *"/done may pass `canWrite: true`"*. It is implemented in its narrowest form: the action's gate
  on `/done` is `canWrite !== false`, together with the existing *saved once* and *this design* conditions.
- *Why not write `true` into the store:*
  - The editor probes write access only while the store says `"checking"` [src: `hydrate-and-configure.tsx:59-82`].
    A `true` from `/done` would skip that probe after a step back to the editor.
  - It would contradict ADR 0148 E3a.
- *Why it is safe:*
  - `canWrite` is advisory. No page request carries the write cookie [src: `write-token.ts`, the cookie's path].
  - The share route checks the write cookie and the visitor cookie on every call.
  - A browser without the write cookie gets one refusal per press, shown as `share.error` with a retry. Nothing
    repeats without a press, ~~and the share-write limiter bounds presses~~. *[Corrected 2026-10-14, Amendment A,
    S3-3:]* The press is counted by the **read** limiter where a network source is named. In every case it is
    bounded by the customer's press.

### 5. A kitchen already sent for is checked by a server read on the contact page, behind the owned load

- The design contact page calls the existing `readSentReference` (one read of four non-personal columns,
  `notified_at is not null`, ADR 0160 d5) after `loadOwnedDesign` allows.
- Only `{kind, reference}` crosses to the client. A refused door reads nothing.
- *[Added 2026-10-14, Amendment A, A2 to A4 and A8.]*
  - The read is never parallel with the load, and it uses the loaded revision.
  - The prop is exactly `SentReferenceAnswer`, and nothing is cached across requests.
  - The page makes no limiter call.
  - The contact page's read has a 300 ms deadline that gives `unknown`; `/done`'s has none.
  - One log line per process and cause.
- *Not taken:* the in-memory hand-over of ADR 0160 d4. It is cleared when a design contact page mounts and lost on a
  reload, and consulting it would make a second place where a typed value is read.

### 6. The form is replaced only for the same stored revision with nothing unsaved; anything else is the form

- One pure function decides, read reactively from the store. The form is replaced ~~iff~~ **only if** all of these
  hold. *[Amended 2026-10-14, Amendment A, A6: the pure function answers `already-sent` iff they hold, but the latch
  keeps the form once it is decided. So for the view, they are necessary and not sufficient.]*
  - the server answered `sent`;
  - the store holds this design **at the page's revision**;
  - the store holds no unsaved edit.
- `none` and `unknown` are the form. **Fail open:** a read that failed must not cost a lead, and the limiter still
  bounds sends.
- A request stored and never notified does not block.
- *[Added 2026-10-14, Amendment A, A6 and A7.]*
  - A one-way latch: once the form is decided, the page shows the form for the rest of its mount.
  - Only `sent` blocks.
- *Unchanged* is read as *the same stored revision* [inf; the architect's reading, put back to the owner in Q55], so
  an edit followed by its undo counts as a change. *Not taken:* comparing the kitchen's content, which would be a
  second identity beside the revision that D8 and the digest already use.

### 7. The already-sent view: the reference, advice to call, the call link, a way to change the kitchen, and no way to send

- **Drawn:**
  - the contact page's own bar, with the chevron to the review that fetches (ADR 0159 d4; Q41 (a));
  - one focused `h1`;
  - the reference with *Copiază*;
  - the advice with `{phone}`;
  - *Sună direct la magazin*;
  - a sentence that a changed kitchen may be sent;
  - *Înapoi la design*.
- **Not drawn:** a form, an input, the consent, the call to action, a price, or anything the customer typed.
- The submission hook is not mounted, so no path from the view can send. The hook is called today beside the
  contact page's bar [src: `contact-screen.tsx`, `ContactPage`]. ~~So the decision branches above it, and the view
  draws the same bar itself.~~ *[Restated 2026-10-14, Amendment A, A1:]* So the decision is made in
  `ContactScreen`, after the probe and before the WebGL exit and the unavailable page. The view is a module of its
  own, whose import closure holds no send path (A5), and it draws the bar from a module of its own.
- The hand-over clear ~~moves from the hook to the design contact page's mount, so it happens whichever view
  shows~~ *[restated 2026-10-14, A1:]* runs in a client effect of `ContactScreen`, so it happens in every arm of the
  design page. It is removed from the hook. The callback page does not clear.
- **Precedence.** The loading line while WebGL is probed, unchanged, so the server render is unchanged. Then the view
  comes before the WebGL exit and before the *cannot be sent now* page: it shows no price (ADR 0148 A3 ruling 4).
  *[Added 2026-10-14, A1:]* In `ContactScreen` the order is: probing, then already-sent, then unsupported, then the
  form or the unavailable page.
- **The block is hard: no "send anyway".** This is the architect's reading of *"maybe advise to call instead of
  sending again"* [inf], put back to the owner in Q55. A "send anyway" path would reintroduce the duplicate the
  owner wants avoided. The correction path is the call, and a changed kitchen is a new request.
- *No frame draws this view.* It is made of frame 5A's pieces, and the owner sees it at the hand check.

### 8. The contact route is unchanged by default (Q55 (a))

- The page check serves the honest customer. **It is not flood protection.**
  - The limiter is: 3 an hour and 10 a day per network block, 2 an hour per browser, 3 a day per e-mail address
    [src: `limit-policy.ts:110-113`].
  - A per-kitchen check is passed by any edit or any new design.
- What a route refusal adds: a tab that loaded the form before another tab sent cannot send a duplicate.
- **If the owner answers (b):**
  - `409 CONTACT_ALREADY_SENT` comes after the owned load at the stated revision and before the new-request buckets,
    and spends none of a browser's two;
  - it **holds no reference** (ADR 0157 d4 kept);
  - a same-id retry still answers `200` with its reference;
  - two racing new ids may both store, a recorded limit bounded by the limiter.
  - ADR 0157 d1 and d4 then gain dated amendments.

### 9. The call link appears on the already-sent view, on 5B, and on the "cannot be sent now" page

- One anchor component dials the constant, labelled as frame 5B draws it. It is at least 44 × 44 px.
- 5B: both classes, both variants. The *cannot be sent now* page carries it because ADR 0159 d5 named the telephone
  as *"the other channel"*, undrawn only for want of a number.
- **Not on 5A** (the frame draws none) and **not beside 8L's five classes.**

### 10. Copy is in the *tu* register; Russian in *ты*; customer-voice copy is exempt

- New leaves are drafted in *tu* / *ты*, impersonal in Russian wherever gender would show.
- Six existing leaves are re-drafted:
  - Romanian `limitedTomorrow`, which is **the owner's own sentence**;
  - Romanian `contact.subheadingNoDesign` (*configurați*, you two, becomes *configurăm*, we);
  - Russian `limitedTomorrow`, `designLoadError.tooManyRequests`, `share.shownOnce` and `share.error`.
- A register test holds the rule with a per-language deny-list of **explicit formal tokens**. It does not use verb
  endings, which match *pereți* [src]. It carries a **named** allow-list of customer-voice keys:
  - the WhatsApp message;
  - `webglUnavailable.contactLink`;
  - the shop's notice, where a plural *you* addresses the company.
- The Russian is not in the copy lock (Q10 (a)), so the test is what keeps it.
- *Reading put back to the owner (Q58):* "all copy" includes the owner's own `limitedTomorrow`, re-worded and
  otherwise unchanged.

## Alternatives not taken

- A "send anyway" path (decision 7).
- The hand-over memory as the check (decision 5).
- A content comparison for "unchanged" (decision 6).
- `canWrite: true` written into the store, or a write-access probe on `/done` (decision 4).
- An environment variable for the number (decision 1).
- A default-suite test that is red until launch (decision 2).
- A frozen link for the shop (decision 3).
- A route-level refusal as the default (decision 8).
- A call link on 5A (decision 9).

## Consequences

- **Q3 remains open**, and it is now the only thing that turns the launch gate green.
- QA's `qa-8m-after-sent.adversarial.e2e.spec.ts:174`, which asserts a second confirmation for one design, is red by
  design and is repinned.
- 8T cannot prove WhatsApp delivery to the shop while the number is the placeholder.
- 8T's *"a limiter refusal is shown at 4"* needs requests on different revisions or designs.
- Every design contact page load now reads the contact store once. That query has no index (backlog 196).
  *[Added 2026-10-14, Amendment A, A8:]* This is a recorded limit.
  - The scan is bounded by the interceptor's page limit only where a network source is named.
  - The 300 ms deadline bounds the page's wait, not the database's work.
  - Trigger: a slow `/contact` or `/done`, any `deadline` line, or contact requests in the thousands.

## Owner's questions

Q55 to Q60 are in the plan with their defaults. **None blocks the wave's first slice.**

## Amendment A — dated 2026-10-14, after the security reader's checkpoint A on S4 (code HEAD `14ee66a0`; the record is still Proposed)

**Source.** The checkpoint findings A1 to A8 and S3-3 [relayed by the coordinator]. At that HEAD no S4 code exists:
S1 to S3 are committed (`9f428a00`, `13f5913b`, `14ee66a0`, by their subjects) [src]. Nothing above is erased. Each
corrected sentence is struck in place and points here. The full requirements, with how each is proved, are in the
plan's *Amendment A*. Claims marked [src] were read at `14ee66a0`. Nothing was run.

1. **A1 — the decision is made in `ContactScreen` (a contract gap, settled by the architect).**
   - *The conflict:* decision 7 and the plan put the branch above `ContactPage`, in `DesignContactPage`. They also
     put the view before the WebGL exit and the unavailable page. But `ContactScreen` returns both of those before
     `DesignContactPage` mounts (`contact-screen.tsx:53-65`) [src].
   - *The ruling:* the decision is made in `ContactScreen`, after the probe, in the order probing, already-sent,
     unsupported, then the form or the unavailable page. Every hook comes before the first return.
   - The view lives in `contact/already-sent-view.tsx`, which S4 creates as an interim and S5 completes. The bar and
     the back links move to `contact/contact-top-bar.tsx`.
   - `forgetSentRequest()` runs in a client effect of `ContactScreen`, so in every arm of the design page. It is
     removed from `useContactSubmission`. The callback page does not clear.
   - *Not taken:* the branch in `DesignContactPage` with the WebGL and sendability checks moved into it; or a second
     clear beside the hook's.
   - This widens ADR 0160 d4 (*"when a design contact form mounts"*), which gains a dated note at the close.
2. **A2 — the read's place.**
   - `readSentReference` runs only after the refused-return, with `designId` and `load.revision`.
   - It never runs in parallel with the owned load.
   - It never takes a revision from the client or the search parameters.
   - Proved by a spy count of 0 per refusal, a deferred-load test and a source-order test.
3. **A3 — what crosses.** The prop is typed exactly `SentReferenceAnswer` through `HydrateAndContact` to
   `ContactScreen`. The document and flight responses contain none of `notified`, `created_at`,
   `client_request_id` or `payload_digest`.
4. **A4 — no cache across requests.** None of `unstable_cache`, `"use cache"`, `revalidate`, `force-static` or
   `fetchCache`, and no module-level answer.
5. **A5 — no send path from the view.**
   - The view's import closure holds none of `use-contact-submission`, `contact-form`, `retry-when-online`,
     `send-contact-request` or `use-replace-with-done`, and no `fetch(`. So it does not import `done-screen.tsx`,
     whose closure holds the share client [src].
   - It draws no form and no input.
   - e2e counts zero `POST /api/contact-submissions`.
6. **A6 — a one-way latch.**
   - Once the form is decided, it stays for the mount. The latch lives in component state, through the pure
     `nextContactPageView`.
   - The property test's alphabet includes a conflict-reload back to the sent revision.
7. **A7 — only `sent` blocks**, and the reference is rendered as text.
8. **A8 — the page's costs.**
   - **No limiter call in the page.** The interceptor counts the contact page [src: `proxy.ts:19`; ADR 0156 d5].
   - **A deadline. Recommended, and in S4's scope:**
     - The contact page's read is raced against 300 ms, and a late answer is `unknown`, which gives the form.
     - The figure is ADR 0156 d4's read deadline [doc]. Applying it to this read is [inf].
     - The race does not cancel the statement, and the losing promise's rejection is caught.
     - **`/done`'s read gets no deadline**, because there `unknown` costs the confirmation view.
   - **One log line per process and cause**, ADR 0156 d4's rule, in the pattern of `csp-report-log.ts`:
     - the cause comes from a closed list (`store-error`, `deadline`, `unexpected`);
     - no message, thrown `name`, operation, id, revision or reference is written (ADR 0146 B2);
     - both callers write it, so ADR 0160 d5 gains a dated note at the close.
   - **The unindexed scan is a recorded limit (backlog 196).** It is bounded by the page limit only where a network
     source is named, and the deadline bounds the wait, not the database's work. The trigger gains a slow
     `/contact` or `/done`, and any `deadline` line.
9. **S3-3 — decision 4's limiter sentence was wrong.**
   - The press without the write cookie is the status `GET`. That route runs the **read** limiter before the
     credentials check (`share/route.ts:125-128`) [src].
   - `POST` checks the credentials before the share-write limiter (`:57-63`) [src], so the share-write limiter is
     never reached.
   - Reads fail open and are uncounted under no named source (ADR 0156 d4). The bound in every case is the
     customer's press.
   - S3's code is unaffected.
10. **Decision 8 is unchanged** (Q55 (a), taken by the owner on 2026-10-13 [doc: `STATUS.md`]). In plain terms:
    the page check is not flood protection. The client controls the revision it sends, a direct `POST` never sees
    the page, and the rate limits are the bound.

## Amendment B — dated 2026-10-14, at the close of wave 8M2 (code HEAD `c6374732`; the record is now Accepted)

Tiers: **[src-log]** commit subjects read from `.git/logs/HEAD` by the scribe; **[relayed]** by the coordinator, who
ran or received the gate results; **[inf]** inference. **The scribe ran no command and no test.** Nothing above is
erased.

1. **Shipped.** S1 `9f428a00`, S2 `13f5913b`, S3 `14ee66a0`, S4 `af476f08`, S5 `ad432ad9`; QA `e6add05e` (S4),
   `eff49c5e` (final), `c6374732`; review fix-up `b25847f2` [src-log].
2. **S6 was not built.** Q55 was answered **(a)** on 2026-10-13 (decision 8 above). No file under `app/api/` or
   `submit-contact.ts` is part of the wave, and ADR 0157 d1 and d4 gain **no** note.
3. **Decision 8's limit, recorded beside Q55 (a) by QA in `c6374732`** [src-log: *"Back after a lost answer
   documented as a limit beside Q55(a)"*]. After a **lost answer** (the send got no reply), the customer goes to the
   review and presses browser **Back**: the contact page shows **an empty form for a kitchen that may already be
   sent**.
   - *Why [inf]:* the page asks the server when the page is loaded; a history restore does not load it again, so the
     question is not asked. A stored request would therefore be missed. **Test-observed only for the zero-reload
     case** [relayed]; the history-restore mechanism is the architect's reading, not a measurement. It is falsified by
     a restore that shows the view.
   - It is the same class as plan risk 6 (a form loaded before another send). Decision 8's bound stands: the
     limiter, and the page check is not flood protection.
4. **Decision 5's deadline fired once in a whole e2e run** [relayed; spec and run not given]. Plan risk 10 predicted
   this class. The 300 ms is not loosened. Recorded in backlog 196 and 240.
5. **Decision 2's gate is weaker than its name.** It refuses the exact placeholder only; any other valid number
   passes. `deploy.yml`'s step is not Vercel's gate, so **the launch checklist line is the operative gate**. The
   gate is red at HEAD by design. Backlog 235; the workflow's secrets finding, backlog 236.
6. **Decision 10's register test** is a word list plus a suffix advisory (backlog 239).
7. **Still the owner's:** Q3 (the real number; the only thing that turns the gate green); copy approvals (S2's ro and
   ru leaves, and the four Russian leaves that need re-signing); Q9's next-step texts. Copy is **not owner-approved**.
8. **Dated notes owed, not written here** (the dispatch for this close named ADR 0160 only): ADR 0159 d5 and
   Amendment A (`limitedTomorrow`), ADR 0114 Amendment G, ADR 0153, ADR 0148, ADR 0156 (the *ты* note), ADR 0095 (the
   re-sign list). ADR 0160 d2, d4, d5, d8, d10 and F3 **are** written.

## Dated note — 2026-10-17, wave 8V (the scribe; nothing re-run)

- **d7: the already-sent view no longer draws the reference.** [ADR 0165](0165-the-shops-notice-is-a-branded-html-email-with-a-plain-text-fallback-led-by-a-frozen-view-only-link-to-the-kitchen-as-sent-and-the-done-page-shows-the-customers-own-design-link.md)
  D2 removes the card; `alreadySentAdvice` is re-drafted in ro and ru without *"numărul cererii"* / *"номер заявки"*, as
  provisional copy. The call link, the changed-kitchen sentence and *Înapoi la design* stay, and there is still no form
  (Amendment A5 kept). **The callback sent view keeps the reference** (coordinator decision, 2026-10-17).
- **d3 is unchanged:** the WhatsApp message still carries the reference and the customer's own live share link. The
  shop's frozen e-mail link (ADR 0165 D3) is a separate table, so the two links are independent. The refusal of Q5 (c)
  stands.
