# ADR 0163 — The design goes to the shop's WhatsApp, an unchanged kitchen already sent for shows its request and a call, and the shop's number is one constant a launch gate refuses

Status: **Proposed — 2026-10-13, by the architect, at the planning of M8 wave 8M2.** Not built. It becomes Accepted
at 8M2's close, when the records listed under *Amends, when accepted* gain their dated amendments (the scribe's
work, not written now).
Date: 2026-10-13
Type: Decision
Milestone: M8 wave 8M2 (plan: [`milestones/8M2-shop-whatsapp-and-already-sent.md`](../milestones/8M2-shop-whatsapp-and-already-sent.md))

**Amends, when accepted:**
- [ADR 0160](0160-a-sent-request-is-handed-to-its-done-page-in-memory-by-a-replaced-history-entry-an-answerless-send-is-retried-only-by-the-connection-returning-and-the-failure-screen-is-a-state-of-the-contact-page.md)
  d2, d8, d10 and *Reviews' findings* F3;
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
    repeats without a press, and the share-write limiter bounds presses.

### 5. A kitchen already sent for is checked by a server read on the contact page, behind the owned load

- The design contact page calls the existing `readSentReference` (one read of four non-personal columns,
  `notified_at is not null`, ADR 0160 d5) after `loadOwnedDesign` allows.
- Only `{kind, reference}` crosses to the client. A refused door reads nothing.
- *Not taken:* the in-memory hand-over of ADR 0160 d4. It is cleared when a design contact page mounts and lost on a
  reload, and consulting it would make a second place where a typed value is read.

### 6. The form is replaced only for the same stored revision with nothing unsaved; anything else is the form

- One pure function decides, read reactively from the store. The form is replaced iff all of these hold:
  - the server answered `sent`;
  - the store holds this design **at the page's revision**;
  - the store holds no unsaved edit.
- `none` and `unknown` are the form. **Fail open:** a read that failed must not cost a lead, and the limiter still
  bounds sends.
- A request stored and never notified does not block.
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
  contact page's bar [src: `contact-screen.tsx`, `ContactPage`]. So the decision branches above it, and the view
  draws the same bar itself.
- The hand-over clear moves from the hook to the design contact page's mount, so it happens whichever view shows.
- **Precedence.** The loading line while WebGL is probed, unchanged, so the server render is unchanged. Then the view
  comes before the WebGL exit and before the *cannot be sent now* page: it shows no price (ADR 0148 A3 ruling 4).
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

## Owner's questions

Q55 to Q60 are in the plan with their defaults. **None blocks the wave's first slice.**
