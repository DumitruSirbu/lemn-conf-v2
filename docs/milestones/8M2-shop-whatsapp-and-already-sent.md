# M8 wave 8M2 — the design goes to the shop's WhatsApp, and a kitchen already sent for shows its request and a call

> **STATUS: PLANNED by the architect, 2026-10-13. Not dispatched.** No code exists for this wave. The decision record
> is [ADR 0163](../decisions/0163-the-design-goes-to-the-shops-whatsapp-an-unchanged-kitchen-already-sent-for-shows-its-request-and-a-call-and-the-shops-number-is-one-constant-a-launch-gate-refuses.md),
> **Proposed**. Owner questions Q55 to Q60 below each have a default; **none blocks S1**. Q55's answer decides whether
> S6 exists.
>
> **Amended 2026-10-14 (Amendment A, below *Rulings*), after the security reader's checkpoint A on S4, at code HEAD
> `14ee66a0`.** By the commit subjects, S1 (`9f428a00`), S2 (`13f5913b`) and S3 (`14ee66a0`) are committed. S4 is not
> built: `git status` at that HEAD shows no S4 file changed [src]. Amendment A restates S4 and adds hard S4
> requirements. It corrects 8M2.4, criteria 1 and 6, and Q55. Every superseded sentence is struck in place and points
> to the amendment. The owner's answers of 2026-10-13 took Q55 to Q60's defaults [doc: `STATUS.md`, *Owner answers,
> 2026-10-13*], so **S6 is not built**.
>
> **For the scribe, not done here:** the M8 plan's wave table and *Waves* need a one-line pointer to this file
> (8M2, after 8Q2 and before 8T, as recommended under *Where this sits*); Q44 and Q45 in the M8 plan are marked
> answered with a link here; `docs/STATUS.md`'s *What to do next* names 8M2; `decisions/README.md` lists ADR 0163 as
> Proposed. The architect touched none of those files (the dispatch limited writes to this plan and the ADR draft).

Evidence tiers: **[doc]** quoted from a record in this repository; **[src]** read at `HEAD` (`d61bfd6d`) through
`git show HEAD:<path>`, never from the working copy (a test auditor was editing the tree while this was written);
**[relayed]** the owner's words as the coordinator passed them on; **[inf]** the architect's inference, with what
would falsify it. **Nothing was run:** no gate, no test, no server, no database.

## The owner's rulings this wave builds (2026-10-13, relayed)

- **Q44 = (b).** *"WhatsApp: the message goes to the general shop number (initially the same as the main phone
  number)."* 5A's *Trimite design-ul pe WhatsApp* opens WhatsApp addressed to the shop, with the view-only link in
  the message. The number is one placeholder constant, the same constant as the shop's phone. The owner replaces it
  later. **A pre-launch check must fail while it is the placeholder.**
- **F3, approved as a fix** (ADR 0160, *Reviews' findings*, Logic F3). `/done` may pass `canWrite: true`, so the
  WhatsApp action is shown after a reload.
- **Q45 = (b), in the owner's words:** *"I will check if the form was already sent, to avoid DDoS; but in case the
  user wants to edit it (maybe they made a mistake), maybe advise to call instead of sending again."* When the
  customer comes back to the contact page for the same unchanged kitchen, the page says the request was already sent
  and gives its number. It advises calling the shop to correct anything, and does not offer a second send. A changed
  kitchen gets a new form.
- **Register.** All copy uses the informal *tu*. New Romanian is drafted in it, and Russian is translated as the
  informal *ты*. Every new string is flagged for the owner's approval. The shop's phone reaches the texts only by
  interpolation.

**What is the architect's reading, not the owner's words** (marked so it can be corrected, per
`best-practices/documentation.md`, *A rule the owner described in conversation is not yet an invariant*):

- (i) The block is **hard**: there is no *send anyway*. The owner wrote *"maybe advise to call"*, and this reading
  takes the *maybe* as being about the wording, not the block.
- (ii) *Unchanged kitchen* means **the same stored revision**.
- (iii) *All copy* includes `limitedTomorrow`, which is the owner's own sentence of 2026-10-12.
- (iv) The check lives **on the page only**, not also in the route.

Each reading is put back to the owner as Q55 or Q58.

## Where this sits: a wave in M8, after 8Q2 and before 8T (recommended)

**Recommendation: 8Q2, then 8M2, then 8T.** 8Q2's plan is untracked at `docs/milestones/8Q2-csp-report-table.md`.
Nothing forces the order:

- **No dependency.** 8Q2 changes `packages/persistence` (one migration, two stores), the CSP report route and the
  e2e teardown [doc: 8Q2 plan, *Slices*]. 8M2 changes the contact page, `/done`, 5B, the copy and one new shop
  module, and adds a gate command. **No production file is in both** [doc vs this plan's *Slices*].
- **8Q2 first, for two reasons.**
  - It is planned and dispatch-ready, and its migration freezes at its own checkpoint A. Starting it early gives the
    owner's apply-and-grant actions the longest lead.
  - 8M2 carries owner questions. Q55 changes the slice count, and Q58 is copy approval. They can be answered while
    8Q2 builds, rather than holding a developer.
- **Both before 8T.** 8M2 changes three customer screens that 8T's phone gate and the owner's hand check must
  exercise. 8Q2 must be covered by 8T's whole-run net [doc: 8Q2 plan, reason 3].
- **The reverse order is acceptable.** Take it if the owner wants to see the screens sooner. The only cost is that
  Q55 must then be answered before S4.
- **Cross-effects to state in both dispatches:**
  - If 8Q2 lands first, the persistence suite runs before 8M2's whole `CI=1` e2e run, so the test database has
    `0009` (8Q2's risk 7).
  - Both waves add e2e tests, so `gate:e2e-shard-budget` runs at each freeze.
  - **Neither wave dispatches until the test auditor working in the tree now says nothing is in flight** (R1, R2).
- **M8's close audit must cover this wave's tests and 8Q2's** (ADR 0152 Amendment A). If the audit running now
  closes before these waves, the close needs one more incremental pass over their commits [inf: the auditor's
  baseline is not known to the architect].

## Scope

**In:**
- one shop-phone module (the constant, its three derived forms, the launch predicate) and a gate command;
- 5A's WhatsApp action addressed to the shop, with the reference in the message, and F3;
- the contact page's server read of a sent request, the decision whether to show the form, and the already-sent view;
- 5B's *Sună direct la magazin*, and the same call link on the contact page's *cannot be sent now* view;
- the new copy in ro and ru, plus six existing leaves brought into the *tu*/*ты* register;
- **conditionally (Q55 (b))**, a refusal in the contact route for a new request on a kitchen already sent for.

**Out:**
- any migration or grant;
- any file under `packages/persistence/` (`findSentReference` exists, [src]), `packages/configurator-domain/`,
  `packages/three-adapter/` or `proxy.ts`;
- `app/api/` unless S6 is built;
- the share endpoint and its token;
- a snapshot link for the shop (Q5 (b), not taken; Q60);
- the Q9 step texts and the Q7 consent text (still slots);
- a call link on 5A (frame 5A draws none);
- the real shop number (Q3 stays **open**: the constant is not Q3's answer, and the gate exists to keep that
  visible).

## What the code has today [src at `d61bfd6d`]

| Where | What |
| --- | --- |
| `apps/web/src/done/send-on-whatsapp.tsx` | `WHATSAPP_MESSAGE_ADDRESS = "https://wa.me/?text="` (no recipient). The gate is `canWrite === true && hasPersistedSuccessfully && heldDesignId === designId`. The steps are status → `confirming-reissue` → issue → `ready` anchor (`target="_blank"`, `rel="noopener noreferrer"`), or `failed` with a retry of the failed request. The message is `submissionResult.whatsappMessage(link)` and carries no reference |
| `apps/web/src/done/done-screen.tsx` | `SendOnWhatsapp` is drawn in `PinnedActions`, for the `sent` view only. The reference is known there (`result.reference`) but not passed to the action |
| `apps/web/src/app/d/[id]/hydrate-stored-design.tsx` | `canWrite: writeAccessHeldFor(designId)`: the store's answer for this design, else `"checking"`. So after a reload of `/done` the gate sees `"checking"`, which is F3 |
| `apps/web/src/app/d/[id]/hydrate-and-configure.tsx:59-82` | The editor probes write access (`GET /api/designs/{id}`) **only while `canWrite === "checking"`** |
| `apps/web/src/lib/server/write-token.ts` | The write cookie is scoped `Path=/api/designs/{id}`, so **no page request carries it**. A server component can only answer "no credential". `canWrite` is advisory, and the share route authorises by the write-token hash and the visitor hash together |
| `apps/web/src/persistence/share-link-client.ts` | Every non-2xx becomes one `ShareLinkRequestFailedError`, because the route answers one byte-identical `404` for every refusal |
| `packages/persistence/src/share-link-repository.ts:223-239` | `loadShared` joins `designs`: **the share view shows the design's live row, not the sent request's snapshot** |
| `apps/web/src/app/[locale]/d/[id]/contact/page.tsx` | `loadOwnedDesign`, then `HydrateAndContact` with `isSendable`. No contact-store read |
| `apps/web/src/lib/server/contact/sent-reference.ts` | `readSentReference({designId, revision})` answers `sent`/`none`, or `unknown` on any failure. It is called only by `/done` today |
| `apps/web/src/contact/contact-screen.tsx` | `ContactScreen`: `unsupported` → `WebGLUnavailable`; `probing` → the loading line (also what a server render shows [inf: `useWebGLSupport` reads the browser]); then the form or `UnavailablePage` |
| `apps/web/src/contact/use-contact-submission.ts:211` | `if (isDesignForm) forgetSentRequest()`: the hand-over is cleared **by the hook's mount** |
| `apps/web/src/contact/contact-screen.tsx`, `ContactPage` | **The hook is called in `ContactPage`, which also draws the `TopBar`.** `DesignContactPage` wraps `ContactPage` and passes the body. A view without the hook therefore has to branch **above** `ContactPage` and draw the same bar itself (S4) |
| `apps/web/src/contact/submission-failure.tsx`; `tests/contact/submission-failure.dom.test.ts:216, 809` | 5B has no `tel:` link, and two dom assertions pin that |
| `packages/configurator-domain/src/contact/phone-number.ts:65-71` | `normalisePhoneNumber("+37300000000")` refuses it as `PHONE_MOLDOVAN_SECOND_ZERO`. *"The 0 … is the trunk prefix, so the digits after it, or after +373, do not begin with one"* |
| `apps/web/src/lib/server/rate-limit/limit-policy.ts:110-113` | New contact requests: 3 an hour and 10 a day per network block, **2 an hour per browser**, 3 a day per e-mail address |
| `apps/web/src/messages/ro.json`, `ru.json` | **Formal leaves**, found by a regex scan for formal markers [src; the scan's completeness is inference, so QA re-sweeps]: ro `contact.outcomes.limitedTomorrow` (*ați încercat … Vă încurajăm*, the owner's sentence, ADR 0159 Amendment A); ru `contact.outcomes.limitedTomorrow` (*вы … вас*), `designLoadError.tooManyRequests` (*Попробуйте*), `share.shownOnce` (*Скопируйте*), `share.error` (*Попробуйте*). **A second-person plural to re-draft as well:** ro `contact.subheadingNoDesign` *…un consultant revine la tine ca să configurați bucătăria împreună* (*you two*). In the shop's voice that is *configurăm* (*we*), which is the sixth re-draft. **Not formal to the customer:** ro `webglUnavailable.contactLink` *Vreau să mă contactați* and ru *…чтобы вы со мной связались*, both the customer addressing the shop. **The same scan also matched *pereți* (walls) at three lines**, so a deny-list built on verb endings is the wrong tool (criterion 19) |
| `apps/web/tests/e2e/support/fake-mail-environment.ts` | The e2e server gets the fake sender (`LEMNARIA_E2E_FAKE_MAIL=1`) and no failure mode is visible there [src; that the fake always accepts is inf]. So a row that is stored and **never notified** cannot be made through the real e2e path |
| `apps/web/vitest.config.ts:12`; `apps/web/tsconfig.json` | The default suite collects `tests/**/*.test.ts` only; the tsconfig includes `tests/**/*.ts` [src]. A file under `tests/` whose name does not end `.test.ts` is type-checked and **not** collected |
| `packages/configurator-domain/src/index.ts:319`; `contact/index.ts:21` | `normalisePhoneNumber` is a public export of the domain [src]. No domain change is needed |
| `.github/workflows/deploy.yml` | Manual (`workflow_dispatch`, `preview` / `production`) and **inert**: no push trigger. Vercel's Git integration is still the real deploy path |
| `package.json` (root) | Gates are `gate:boundary`, `gate:e2e-shard-budget`, `gate:lockfile`, `gate:sca`. `check` and `ci:local` run what must be green on every push |

## Decision-record sweep

Swept for this plan: greps of `docs/decisions/` at HEAD for *WhatsApp*, *wa.me*, *stand-in*, *shop's number*,
*Sună direct*, *canWrite*, *already sent*, *second request*, *register*, *informally*; and the M8 plan for Q3, Q5,
Q41, Q44, Q45, *8M as closed*, *named interims*, *8T*. Each hit was read in the part named.

| Record | What it says | How 8M2 settles it |
| --- | --- | --- |
| Q3 (a), M8 plan | The shop's number is owed | **Still open.** The constant is a placeholder, and the launch gate refuses it (8M2.2) |
| ADR 0159 d5 (2026-10-12) | The shop's telephone *"is not drawn, and never with a stand-in"* | **Amended by the owner's ruling of 2026-10-13**: drawn with the placeholder constant, under the launch gate. Dated amendment owed at close |
| 8M scope note (2026-10-07), 8M *Must not, every slice*, 8M criterion 7, M8 named interim 6 | *"never drawn with a stand-in number"*; *"a stand-in for the shop's number"* is forbidden; interim 6 says *"the shop's number is absent"* | The same amendment. The scribe strikes and dates each one; interim 6 becomes *"the shop's number is a placeholder the launch gate refuses"* |
| ADR 0160 d2 | *"5B draws no `tel:` link and no stand-in number"* | **Amended**: 5B draws *Sună direct la magazin* dialling the constant |
| ADR 0160 d8; 8M criterion 18 | The anchor is `https://wa.me/?text=` (Q44 default (a)); the gate is `canWrite === true` | **Amended**: Q44 (b) and F3 (8M2.3, 8M2.4) |
| ADR 0160 *Reviews' findings*, Logic F3 | Passing `canWrite: true` from `/done` *"needs a dated amendment; not made"* | **Made, in its narrowest form** (8M2.4), as the owner approved |
| ADR 0160 d10; M8 plan Q45 | Q45 *"built on (a)"*: the form again after a send; *"(b) … needs S3's read on a second page and a screen no frame draws; revisit with M8B"* | **Superseded by the owner's Q45 = (b)** (8M2.5 to 8M2.8). The cost (a) named is accepted: a second reader of `findSentReference`, and a view no frame draws |
| Q5 (a), (c) not taken | (c) was *"Spend the design's one share link on the shop"* | Q5 (c) was the **system** issuing a link for the shop. Q44 (b) is the **customer** sending their own link to the shop. The consequence is the same and is recorded: a later reissue revokes the shop's copy, and the shop sees the live design, not the sent one (8M2.3; Q60) |
| ADR 0114 Amendment G, and its 8M note | The share link is shown once and never an anchor; the 8M note allows one external anchor to WhatsApp | Kept. Dated note: the anchor is now addressed to the shop's number |
| ADR 0148 E3, E3a | The held answer about write access is carried over as *"a fact about the browser and the design"* | **Kept.** F3 does not write the store (8M2.4) |
| ADR 0148 A3 ruling 4 | A screen that shows a price probes WebGL first | The already-sent view shows no price. It is drawn after the probe's answer either way and is not replaced by the WebGL exit (8M2.7) |
| ADR 0153 and its 8M note | One read of four readable columns; no personal column, list or count | Kept. Dated note: a second reader, the contact page, behind the owned load |
| ADR 0157 d1, d4 | The route's order; *"a failure never holds the reference"* | **Untouched by default.** Amended only if Q55 (b), and then the refusal holds no reference (S6) |
| ADR 0158 d4; Q41 (a) | Back shows the older copy locked; the way to the newest is a link that fetches | Kept. The view's chevron is the contact page's review link, unchanged |
| ADR 0156 (the save's sentence) | *"the Russian draft speaks informally here and formally on the refused page (to be settled when ADR 0095's re-sign is made)"* | **Settled by the register ruling:** *ты* everywhere. `designLoadError.tooManyRequests` is re-drafted (8M2.9). Dated note owed |
| ADR 0159 Amendment A (Q10) | The owner supplied `limitedTomorrow`'s Romanian (formal) | Re-drafted in *tu* **and put back to the owner as their own sentence changed** (Q58) |
| ADR 0095; Gate O2 | The Russian is approved, with a re-sign at the gate | Four approved Russian leaves change register. They are listed for the re-sign |
| ADR 0160 *Owner's questions* | *"Register mismatch"* open | **Answered by the register ruling** |

No record is silently overturned. Every superseded sentence above is named and gets a dated amendment at close
(*For the scribe*).

## Rulings (8M2.1 to 8M2.10)

**8M2.1 — One constant: the shop's phone, in E.164.**
- `apps/web/src/shop/shop-phone.ts` declares `SHOP_PHONE_E164` once, and three pure derivations:
  - the `tel:` address (`tel:+…`);
  - the WhatsApp path digits (E.164 without `+`);
  - a display form, grouped as Moldovan numbers are written (`+373 xx xxx xxx`).
- Every `tel:` href, every `wa.me` recipient and every shop number shown in `apps/web/src` comes from these
  functions. Message leaves carry `{phone}`, never digits.
- **One constant for both uses**, because the owner said the WhatsApp number is *initially the same as the main
  phone number*. If they diverge later, a second constant is added and the gate covers both.
- *Not taken:*
  - an environment variable. It is not a secret, and the owner asked for a constant. A variable would also make the
    gate depend on a deployment's settings.
  - the domain package. The shop's contact is the app's configuration, not a rule of the kitchen.

**8M2.2 — The placeholder cannot reach a person, and a gate refuses it.**
- The placeholder is `+37300000000`. The project's own phone rule refuses it [src: `phone-number.ts:65-71`,
  `PHONE_MOLDOVAN_SECOND_ZERO`], so **no value the form would accept can equal it**.
- That no real subscriber holds such a number is [inf] from the trunk-prefix comment in the same file. It is not
  verified against Moldova's numbering plan.
- The launch predicate `isLaunchReadyShopPhone(e164)`:
  - is true iff the value is not the placeholder, `normalisePhoneNumber` accepts it, and its normal form equals the
    value;
  - is unit-tested in the default suite both ways, against a fixture that exists only in the test.
- The gate itself:
  - is **one launch-check file**, `apps/web/tests/launch/shop-phone.launch-check.ts`, that asserts the predicate on
    the real constant. It sits inside the tsconfig's `tests/**/*.ts`, so it is type-checked and linted, and is not
    collected by the default `tests/**/*.test.ts` [src];
  - runs by `pnpm gate:launch-placeholders`, which runs `build:deps` first, as `apps/web`'s `test` script does, and
    then Vitest with its own config. Its red must be **the predicate's assertion** naming the constant, never a
    module-not-found error, which looks the same from outside;
  - is **excluded from the default web suite, from `pnpm check` and from `pnpm ci:local`**, where it would make
    every push red.
- **It is red at the wave's HEAD by design.**
- Where it runs (Q57, default (a)):
  - a production-only step of `deploy.yml`, before migrate;
  - a line in M8's *Launch gate* (carried to M9), naming the command and requiring its exit 0 to be quoted.
- **Plainly:** `deploy.yml` is inert and Vercel's Git integration is the real deploy path [src]. Wiring the step
  there gates nothing until the owner activates that workflow. **The Launch-gate line is the operative gate.**

**8M2.3 — 5A's WhatsApp message goes to the shop (Q44 (b)).**
- The anchor's address is `https://wa.me/{digits}?text=` with the encoded message. The digits come from 8M2.1.
- The message is a new leaf with `{reference}` and `{link}`. It is the **customer's** voice to the shop, written to
  address neither *tu* nor *dumneavoastră*.
- Everything else in criterion 18 stands:
  - the customer's own link, issued through `issueShareLink`, with `share.reissueWarning` when one is active;
  - three taps with an active link;
  - the anchor is the customer's own tap, never a window opened after an `await`;
  - `rel="noopener noreferrer"`;
  - the link lives only in component state.
- *Consequences, recorded and put to the owner as Q60:*
  - **the shop holds the customer's link**, so a later reissue (from the editor's share control, or from 5A again)
    revokes it;
  - the link shows **the live design** [src: `loadShared` joins `designs`], so an edit after the send changes what
    the shop sees.
  - Carrying the reference in the message is what lets the shop find the request in its e-mail either way.

**8M2.4 — F3, in its narrowest form: on `/done` the WhatsApp gate accepts any held answer but `false`, and the store
is not written.**
- The owner approved *"/done may pass `canWrite: true`"*. This is built as: the gate on `/done` is
  `canWrite !== false && hasPersistedSuccessfully && heldDesignId === designId`.
- *Why not write `true` into the store:*
  - The editor probes write access only while the store says `"checking"` [src]. A `true` written by `/done` would
    survive a step back to the editor and **skip that probe**, so the editor would offer edits on a guess.
  - It would also contradict ADR 0148 E3a, which carries that answer over as a fact about the browser.
- *Why this is safe:*
  - `canWrite` is advisory. `/done`'s owned load proved the visitor cookie.
  - The share route proves the write cookie on every call [src]. A browser without it gets one `404` per press,
    shown as `share.error` with the retry. Nothing repeats by itself, ~~and the share-write limiter bounds
    presses~~. *[Struck 2026-10-14, Amendment A, S3-3: the press without the write cookie is the status **read**.
    The read limiter counts it where a network source is named. The share-write limiter is never reached. In every
    case the press is the bound.]*
- *Not taken:* a write-access probe on `/done`. That is one more request per load and changes 8M's *"no request to
  hydrate"*.
- **This is implementing an approved fix, not re-asking it.**

**8M2.5 — The check is a server read on the contact page, behind the owned load.**
- After `loadOwnedDesign` finds the design, the contact page calls the existing `readSentReference({designId,
  revision})` and hands the client the answer: `sent` with a reference, `none`, or `unknown`.
- Only `{kind, reference}` crosses to the client.
- A refused door makes **no** contact-store read, as 8M's criterion 9 holds for `/done`. The callback page makes
  none.
- *[Added 2026-10-14, Amendment A, A2 to A4 and A8.]* The read runs only after the refused-return. It is never run
  in parallel with the owned load. It takes the loaded revision, never one from the client or the search
  parameters. The answer crosses as exactly `SentReferenceAnswer`. Nothing caches it across requests. The page makes
  no limiter call of its own. The read has a 300 ms deadline, and a late answer becomes `unknown`.
- *Why not the one-entry hand-over memory:*
  - it is cleared when a design contact page mounts (`use-contact-submission.ts:211` at `d61bfd6d`; *stale after
    S4*, which moves the clear to `ContactScreen`, Amendment A, A1), by design;
  - it is gone on a reload;
  - it would make a second place where a typed value is consulted.
- The server read survives reloads, other tabs and any route back. It reads only the four non-personal columns
  already read by `/done` (ADR 0153's 8M note).

**8M2.6 — When the form is replaced, decided by one pure function.**
- `contactPageViewOf({ server, page, held })` answers `already-sent` with the reference, or `form`.
- It answers `already-sent` **iff** all of these hold. *[Clarified 2026-10-14, Amendment A, A6: this is the pure
  function. The view drawn also passes through the latch, so the view is `already-sent` only if these hold.]*
  - `server.kind === "sent"`;
  - the store holds this design;
  - **the store's revision equals the page's**;
  - the store holds no unsaved edit (`design === savedDesign`).
- It is read **reactively from the store**, so a queued save that lands while the page is open (a new revision)
  turns the view into the form. A server answer for an older revision never turns it back.
- *[Added 2026-10-14, Amendment A, A6 and A7.]* **A one-way latch.** Once the form is decided, the page shows the
  form for the rest of its mount, whatever the store does next. That includes a conflict-reload back to the sent
  revision. **Only `sent` blocks.** Every other answer is the form, including a kind the switch does not know.
- `unknown` is `form` (fail open: a failed read must not cost a lead; the limiter still bounds sends). So is `none`.
- **A stored request that was never notified does not block** (`findSentReference` reads `notified_at is not null`
  [doc: ADR 0160 d5]). A customer whose send ended in `502 …_RETRY` and left the page can send again.
- *Recorded limit, (ii) above:* an edit followed by its undo is a new revision, so it counts as **changed**.
  Comparing the kitchen's content instead would be a second identity beside the one D8 and the digest use. Not
  built.

**8M2.7 — The already-sent view: a state of the contact page, like 5B.**
- **The bar.** The contact page's own top bar: the chevron is the review link that fetches (ADR 0159 d4, Q41 (a)),
  and the title is *Contact*.
- **What is drawn under it, in order:**
  - one `h1` that takes focus on mount;
  - the reference card with *Copiază* (`SentReferenceCard`, the same criterion 16 as 5A);
  - the advice sentence with `{phone}`;
  - the call link (8M2.8);
  - a sentence that a changed kitchen can be sent again;
  - *Înapoi la design* (a `Link` to the editor, prefetch off).
- **Not drawn:** a form or any input, the consent, the call to action, the retry, a price, the design card, any
  typed value. The server holds none it may read back (Q14).
- **No hook.** The view does **not** mount the submission hook, so nothing on it can send. Today the hook lives in
  `ContactPage` beside the bar [src]. ~~So the decision branches in `DesignContactPage`, above `ContactPage`, and
  the view draws the contact page's bar without the hook.~~ *[Struck 2026-10-14, Amendment A, A1: `ContactScreen`
  returns the WebGL exit and the unavailable page **before** `DesignContactPage` mounts
  (`contact-screen.tsx:53-65` at `14ee66a0`) [src]. A branch inside it could not come before them. **The decision
  is made in `ContactScreen`**, after the probe and before those returns. The view is a module of its own, and it
  draws the bar from a module of its own.]*
- **When a landing save turns the view into the form,** the hook mounts at that moment. Its drawn time (8K's two
  seconds) and its first id start then, which is correct: the form was not on screen before.
- **The hand-over clear** ~~moves to the design contact page's mount, so it happens whichever view is drawn. That
  keeps 8M's *"cleared whenever a design contact form mounts"* and serves backlog 197's direction.~~ *[Restated
  2026-10-14, Amendment A, A1:]* runs in a client effect of `ContactScreen`. That component is mounted in every arm
  of the design page: loading, WebGL exit, unavailable, already-sent and form. The clear is removed from
  `useContactSubmission` (`useForgetSentRequestOnMount`, its call and its import). **The callback page does not
  clear.** This widens ADR 0160 d4's *"cleared when a design contact form mounts"* to *"when a design contact page
  mounts"*. That serves backlog 197's direction.
- **Precedence.** *[Order restated 2026-10-14, Amendment A, A1; the content is unchanged.]*
  - While WebGL is probed, the loading line, exactly as today. So the server render does not change and no
    hydration question arises.
  - Then `already-sent` comes **before** both the WebGL exit and the *cannot be sent now* page. The view shows no
    price, and the customer's request exists whatever this device can draw.
  - In `ContactScreen`, in this order: `probing` gives the loading line. Then `already-sent` gives the view. Then
    `unsupported` gives `WebGLUnavailable`. Then `isSendable` gives `DesignContactPage`, and its absence
    `UnavailablePage`.
- **History.** The view adds no history entry. Back and the chevron behave as on the form.
- **No frame draws this view.** It is made of 5A's pieces (ADR 0104: frames are the specification where they
  exist), and the owner sees it at the hand check.

**8M2.8 — The call link: one component, three places.**
- `CallShopLink` is an anchor to the `tel:` address of 8M2.1, labelled *Sună direct la magazin* (as frame 5B draws
  it), at least 44 × 44 px.
- **The three places:**
  - the already-sent view;
  - 5B, for both of its classes, in both the design and the callback variants, under the retry, as the frame places
    it;
  - the *cannot be sent now* page. ADR 0159 d5 named the telephone as *"the other channel"*, not drawn only for
    want of a number.
- The *cannot be sent now* page gets it **on both its paths**, the design contact page and the callback page
  (`CallbackContactScreen`'s `UnavailablePage`). `contact-unavailable.e2e.spec.ts` loops over both [src].
- **Not on 5A** (the frame draws none), **not on the callback form's in-place sent view** (a 5A piece), and **not
  beside 8L's five classes** (they keep 8L's place and action).

**8M2.9 — Copy, in the *tu* / *ты* register.**
- New leaves are drafted below (*Copy for the owner*), with ro in *tu* and ru in *ты*.
- Sentences that would be gendered in Russian (*ты отправил/а*) are built impersonally.
- Customer-voice leaves are **excluded** from the register rule, because their second-person plural addresses the
  company: the WhatsApp message, `webglUnavailable.contactLink`, and the shop's e-mail notice.
- **Six** existing leaves are re-drafted into the register (*What the code has today*): five formal ones and
  `contact.subheadingNoDesign`'s *configurați*. All are flagged.
- A register test pins the rule as a deny-list of **explicit formal tokens** per language. It does not use verb
  endings, which match *pereți* [src]. It carries a **named allow-list of customer-voice keys**. Russian is not in
  the copy lock (Q10 (a)), so this test is what holds it.

**8M2.10 — The route stays as it is by default (Q55 (a); the owner took the default on 2026-10-13 [doc:
`STATUS.md`]).**
- The page check serves the honest customer.
- It does **not** stop a flood. That is the limiter's job: 3 an hour and 10 a day per network block, 2 an hour per
  browser, 3 a day per address [src]. Any edit, which bumps the revision, or any new design walks past a per-kitchen
  check anyway.
- What a route-level refusal would add: a tab that loaded the form before another tab sent can no longer send a
  second request, and the shop's mail quota is spared that duplicate.
- It would amend ADR 0157's ruled order and refusal set, and it would make this a public-endpoint wave. **Built only
  if the owner answers Q55 (b)**, as S6.

## Amendment A — dated 2026-10-14: checkpoint A's findings on S4, at code HEAD `14ee66a0`

**Source.** The security reader's checkpoint A on S4 named findings A1 to A8 and a correction S3-3 [relayed by the
coordinator; the architect did not see the reader's text]. Nothing above is erased. Each superseded sentence is
struck in place and points here. **A2 to A8 are hard S4 requirements:** S4 is not done, and checkpoint A is not
passed, until each one holds. Claims marked [src] were read at `14ee66a0`. Nothing was run.

### A1 — where the decision is made (settled by the architect)

**Classification: a contract gap in this plan, not an implementation defect.** S4 is not built. 8M2.7 and the S4
row put the branch in `DesignContactPage`, but also required `already-sent` before `WebGLUnavailable` and
`UnavailablePage`. `ContactScreen` returns both of those **before** `DesignContactPage` mounts
(`contact-screen.tsx:53-65`) [src]. No branch inside `DesignContactPage` can come before them, so the two
requirements contradicted each other.

**Ruling.**
- **The decision is made in `ContactScreen`**, after the probe and before the WebGL exit and the unavailable page.
  The order is:
  1. `probing` gives the loading line;
  2. `already-sent` gives the view;
  3. `unsupported` gives `WebGLUnavailable`;
  4. otherwise `isSendable` gives `DesignContactPage`, and its absence gives `UnavailablePage`.

  `DesignContactPage` and `ContactPage` are unchanged and hold no branch.
- **Every hook in `ContactScreen` is called before its first return:** the probe, the store reads, the latch (A6)
  and the clear's effect. So the latch sees the store while the probe runs, and the order of hooks never changes.
- **The already-sent arm is a module of its own** from S4 onwards: `contact/already-sent-view.tsx`. S4 creates it
  with the interim content (the bar, the `h1` and the reference card), and S5 completes it. The bar and the back
  links (`TopBar`, `ReviewBackLink`, `StartBackLink`, `useBackLinkProps`) move to a new
  `contact/contact-top-bar.tsx`. `contact-screen.tsx` and the view both import the bar from there. Without the move,
  the view could not import the bar without also importing `contact-screen.tsx`, the form and the hook (A5).
  `UnavailablePage` (`contact-screen.tsx:295-307`) is the precedent: a `<main>` and the bar, with no hook [src].
- **The hand-over clear, `forgetSentRequest()`, runs in a client effect of `ContactScreen`**, with an empty
  dependency list. `ContactScreen` is mounted in every arm of the design page.
  - The clear is **removed from `useContactSubmission`**: the function `useForgetSentRequestOnMount`
    (`use-contact-submission.ts:208-213`), its call (`:169`) and the import of `forgetSentRequest` (`:10`) [src].
  - **The callback page does not clear.** `CallbackContactScreen` calls nothing of the hand-over.
  - *What this widens:* ADR 0160 d4 says *"cleared when a design contact form mounts"*. It now reads *"when a design
    contact page mounts, in any arm"*. That is a dated note for the scribe.
- *Not taken:*
  - **The branch in `DesignContactPage`, with the WebGL and sendability checks moved inside it.** It would move the
    form's precedence and the probe into the hook-holding subtree, and that is the subtree the view must stay out
    of.
  - **Keeping the clear in the hook and adding a second one in the view.** That makes two places that clear, and
    the loading, WebGL-exit and unavailable arms would still not clear.

### A2 — the read's place in the page

- In `app/[locale]/d/[id]/contact/page.tsx`, `readSentReference` is called **only after** the line
  `if (load.kind === "refused") return <DesignLoadError … />`.
- Its arguments are `designId: id` and `revision: load.revision`, the revision `loadOwnedDesign` read.
- It is **never** run in parallel with the owned load: no `Promise.all`, `Promise.allSettled`, `Promise.race` and no
  un-awaited read started before it.
- **The revision never comes from the client.** Not from `searchParams`, a header, a cookie or a prop the client
  sends. The page does not read `searchParams` at all.
- `/done/page.tsx` is the pattern [src].
- *Proved by:*
  - **A spy count of 0 per refusal.** For each of 8M's criterion 9 refusals (no cookie, a malformed cookie, a foreign
    cookie, an unknown id, a malformed id, an invalid row): the `DesignLoadError` is the same, and the
    `readSentReference` spy (or the store's `findSentReference`) counts **0**.
  - **A deferred load.** While the owned load is pending, the read's spy counts 0. After the load allows, it counts 1,
    with `{designId: id, revision: load.revision}`.
  - **A source-order test** on `page.tsx`. The first `readSentReference(` comes after the refused-return. The file
    names none of `Promise.all`, `allSettled`, `Promise.race` or `searchParams`.

### A3 — what crosses to the client is exactly `SentReferenceAnswer`

- The prop is typed **exactly** `SentReferenceAnswer` (`done/result-to-show.ts`) on `HydrateAndContact` and on
  `ContactScreen`. Not a wider type, not an object spread from the store's answer, not a row.
- `readSentReference` builds a fresh `{kind, reference}` or `{kind}` [src]. That stays the only producer.
- *Proved by:*
  - **A type test.** `expectTypeOf` shows both props equal `SentReferenceAnswer`.
  - **A unit test.** A store fake answers `sent` with extra properties, and the page hands on only `kind` and
    `reference`.
  - **e2e·CI.** With a notified request at the stored revision, the contact page's **document response and its RSC
    (flight) response** are read as text. Neither contains `notified`, `created_at`, `client_request_id` or
    `payload_digest`. The column names are verified at `0008_create_contact_submissions.sql` [src], and `notified`
    also covers `notified_at`. The JavaScript chunks are not searched: the props travel in the flight data, and the
    source comments in `result-to-show.ts` and `sent-reference.ts` that say *notified* never reach a response.

### A4 — no cache across requests

- The answer is read per request.
- No `unstable_cache`, no `"use cache"`, no `export const revalidate`, `dynamic = "force-static"` or `fetchCache` in
  the page.
- No module-level variable holds an answer, in `page.tsx` or in `sent-reference.ts`.
- The page stays dynamic, because the owned load reads a cookie [src: the page's own comment].
- *Proved by:*
  - **A source scan** of both files for those names, and for a module-level `let` or `Map` in `sent-reference.ts`.
  - **A unit test.** Two calls with different store answers return each answer.
  - **e2e·CI, one server process.** The contact page loads the **form** for design D at revision r, which is
    `none` at that moment. The customer sends. A fresh navigation to D's contact page then shows the
    **already-sent view**. A cache would have kept the first `none`.

### A5 — the already-sent arm has no send path

- **The view's modules import none of these:** `contact/use-contact-submission.ts`, `contact/contact-form.tsx`,
  `contact/retry-when-online.ts`, `contact/send-contact-request.ts`, `done/use-replace-with-done.ts`. The view's
  modules are `already-sent-view.tsx` and `contact-top-bar.tsx`, and **the whole closure** of what they import
  inside `apps/web/src` counts.
- No module in that closure calls `fetch(`.
- The arm mounts none of them, and draws **no `<form>` and no `<input>`**.
- *Consequence:* the view **must not import `done/done-screen.tsx`**. That file imports `send-on-whatsapp.tsx`, which
  imports the share client and its `fetch` [src].
  - If S5 wants `ResultHeading`, S5 moves it to a neutral module: backlog 198's remedy. `done-screen.tsx` and the new
    module then join S5's files.
  - Otherwise the view draws its own `h1`.
- *Proved by:*
  - **A dom test that mocks each of the five modules with a factory that throws.** A throwing factory fails the test
    if anything in the view's closure imports that module. A direct-import scan alone cannot fail for a transitive
    import, so it is not enough.
  - **A dom test of `ContactScreen` in the already-sent arm.** A spy on `useContactSubmission` counts 0. A spy on
    `globalThis.fetch` counts **no call to `/api/` and no `POST`** on mount and after every control is pressed. Not
    zero calls in all: the chevron, the locale menu and *Înapoi la design* navigate, and navigation may fetch page
    data, which is not a send path. The container holds no `form` and no `input`.
  - *No `fetch(` in the closure* is a source property over `apps/web/src`, checked by the closure scan.
  - **e2e·CI.** Every control on the view is pressed, and the count of `POST /api/contact-submissions` is **zero**.

### A6 — a one-way latch: once the form, always the form

- `contact/contact-page-view.ts` holds two pure functions:
  - `contactPageViewOf(input)` (8M2.6);
  - `nextContactPageView(previous, input)`. It answers `previous` when `previous` is the form, and
    `contactPageViewOf(input)` otherwise.
- `ContactScreen` keeps the last view in **component state**, never in the store, and passes it as `previous` on
  each render from mount.
  - The latch's scope is one mount. A reload or a navigation that remounts the page decides again (criterion 14
    (a)).
  - The first input already sees this design. `HydrateStoredDesign` writes the store during render, before its
    children [src: `hydrate-stored-design.tsx:39-41`].
- *Proved by* **unit (`fast-check`)** over `nextContactPageView` folded over sequences drawn from this alphabet:
  - the arrival: the server answer `sent`, `none` or `unknown` for r; the store holding this design clean at r, at r
    with an unsaved edit, at a newer revision, or holding another design;
  - an edit;
  - a save answered (`applySaved` at r+1);
  - a save held;
  - a save refused;
  - a conflict;
  - an overwrite (`overwriteConflict`, then `applySaved`);
  - **a conflict-reload**: a re-hydrate with the stored copy, which may be at r with `design === savedDesign`;
  - `applyWriteAccess` taking a newer stored copy.

  **Properties:**
  - the views form the shape `already-sent* form*`;
  - the first view equals `contactPageViewOf` of the arrival;
  - every `already-sent` step meets all of 8M2.6's conditions at that step;
  - `none` and `unknown` give only `form`.

  Removing the latch must fail the shape property through the conflict-reload. **Report that mutant as killed.**

### A7 — only `sent` blocks, and the reference is text

- The switch in `contactPageViewOf` is exhaustive. Only `kind === "sent"` can answer `already-sent`, and any other
  value answers `form`. A value cast past the type proves the second half.
- The reference is rendered as a **React text child**: never `dangerouslySetInnerHTML`, never in an `href`, `src`
  or style.
- *Proved by:* unit tests; a dom test with the reference `<img src=x onerror=alert(1)>`, which shows that literal
  text and makes no `img` element (8M's criterion 16 shape).

### A8 — no new limiter call; a deadline; one line; the unindexed scan as a recorded limit

- **No limiter call in the page.** The interceptor already counts `/{locale}/d/{id}/contact`: it is one of
  `DESIGN_STEP_SEGMENTS` [src: `proxy.ts:19`], and pages are counted there and only there (ADR 0156 d5).
  - `page.tsx` and `sent-reference.ts` import nothing from `lib/server/rate-limit/`.
  - *Proved by* a source scan, and by a page render whose limiter spy counts 0.
- **The read deadline. The architect recommends it, and it is in S4's scope.**
  - The contact page's read is raced against **300 ms**, a named constant. A late answer is `unknown`, and `unknown`
    gives the form.
  - The figure is ADR 0156 d4's *"300 ms for a read (the architect's figure)"* [doc]. That figure was set for the
    limiter's judgement of a read. Using it for the contact-store read is [inf], and an e2e·CI timing that shows
    the read's p95 near 300 ms would falsify the fit. That measurement is **indicative only**: the CI database is
    not production's Neon. S4's e2e reports the read's measured duration.
  - **The race lives in `sent-reference.ts`, never in `page.tsx`.** The page passes the deadline as an option, so
    A2's source-order test, which forbids `Promise.race` in the page, stays true.
  - **The race does not cancel the query.** `packages/` is out of scope, so the statement runs on in the database.
    The losing promise's rejection is caught: there is no unhandled rejection. The timer is cleared when the read
    wins.
  - **`/done`'s read gets no deadline.** That is the architect's choice. On `/done`, `unknown` costs the customer the
    confirmation view (*not shown*). On the contact page it costs only the duplicate check, and fails open.
    `done/page.tsx` is not touched.
  - *Proved by:* unit tests with fake timers, where an answer at 299 ms is kept and one at 301 ms is `unknown`. The
    exact 300 ms instant is not pinned, because timer ordering is not specified there. A rejection after the deadline
    raises no unhandled rejection. A dom test shows `unknown` gives the form.
- **One log line per process and cause, with the cause only.**
  - `readSentReference`'s catch writes one line the first time each cause occurs in a process. The rule is
    ADR 0156 d4's *"one log line for a process and a cause"*, and `lib/server/csp/csp-report-log.ts` is the
    pattern [src].
  - The cause comes from a **closed list**: `store-error`, from `ContactSubmissionStoreError`; `deadline`; and
    `unexpected`, for anything else.
  - The line holds a constant label, an event name and the cause. **No message, `cause`, `operation`, design id,
    revision, reference or thrown value's own `name`** (ADR 0146 B2).
  - The line covers both callers, `/done` and the contact page. Only the line is new for `/done`; what `/done`
    shows does not change. The docstring's *"no … log line leaves"* is changed to say so.
  - *Proved by:* unit tests. Two failures of one cause write one line. Each cause writes its own. A thrown value
    with a hostile `message` and `name` writes neither. The line's keys are exactly the three.
- **The unindexed scan is a recorded limit (backlog 196).**
  - Every load of a design contact page in the owning browser now runs one `findSentReference` statement that no
    index serves. That is a scan of `contact_submissions`.
  - It is reachable only behind the owned load. Where a network source is named, it is bounded by the interceptor's
    page limit (ADR 0156 d5). **Under no named source pages are not counted (ADR 0156 d4), and the scan is
    unbounded but for the owned load.**
  - The 300 ms deadline bounds the page's wait, **not the database's work**.
  - **Trigger:** a slow `/contact` or `/done`; any `deadline` line from this read; or contact requests in the
    thousands. **Remedy:** an additive migration, never an edit of `0008`. *For the scribe:* backlog 196 gains this
    trigger and the frequency note.

### S3-3 — the press without the write cookie is counted by the read limiter, not the share-write limiter

**Classification: a contract error in 8M2.4 and ADR 0163 d4.** S3's code is unaffected.
- The press asks the status first, and a refused status settles into `failed` without an issue
  (`send-on-whatsapp.tsx:103-113`) [src].
- The status `GET` runs `refusalOfReadLimit` **before** the credentials check (`share/route.ts:125-128`) [src].
- `POST` checks the credentials **before** `refusalOfShareWriteLimit` (`:57-63`) [src]. A browser without the write
  cookie therefore never reaches the share-write limiter.
- Reads fail open, and under no named network source they are not counted at all (ADR 0156 d4).
- **Corrected sentence:** *the press is counted by the read limiter where a network source is named; in every case
  it is bounded by the customer's press, since nothing repeats without one.*

### Criteria 1 and 6, and Q55

- **Criterion 1** allows exactly two holders of `wa.me/`:
  - `shop-phone.ts`, in a comment (`:19`);
  - `send-on-whatsapp.tsx`, in `WHATSAPP_MESSAGE_ADDRESS` (`:21`), whose recipient is `shopWhatsAppDigits()` [src].

  It also allows exactly one holder of `tel:`: `shop-phone.ts` (`:16`), until S5's `call-shop-link.tsx`, which takes
  the address from `shopTelAddress()` and holds no `tel:` literal. The criterion is amended in place.
  - **The amendment brings the text into line with what is already pinned. No test moves.**
    `tests/shop/shop-phone-sources.test.ts:14-20` already names these holders, and
    `tests/done/send-on-whatsapp-sources.test.ts:67-74` already pins the one address with `shopWhatsAppDigits()` and
    no digit run [src]. Both are developer-owned.
- **Criterion 6** names the leaf as built: `submissionResult.whatsappMessageToShop`. The old `whatsappMessage` leaf
  is retired (S3, `14ee66a0`, by its subject).
- **Q55** gains one plain sentence. The owner's answer is unchanged.

### The S4 row as amended

The *Slices* table carries the amended S4 row. The S4 *Stops if* and tier rows are amended in place.

## Slices

**Tier for the wave: Full + security + visual.** It adds a second reader of `contact_submissions` on a page, puts the
customer's share link into a message addressed to a fixed third-party number, and changes three customer screens. A
public-route change is added if S6 is built.

**Every dispatch carries, verbatim:**
- *the discarding git commands are banned by name* (`agent-coordination.md`): `git stash`, `git stash pop`,
  `git checkout -- .`, `git reset --hard`, `git clean`;
- *no environment variable is created, changed, removed or printed*;
- *no database row is deleted outside the harness's own teardown (ADR 0151)*;
- ADR 0155's standing rule: *a mutant of a statement that deletes, updates, truncates or alters is run against a
  mocked driver and never against a database*.

One writing agent at a time (R2).

| Slice | Work (≤ 5 items) | Production files | Reading |
| --- | --- | --- | --- |
| **S1** | (1) `shop-phone.ts`: `SHOP_PHONE_E164 = "+37300000000"` with a one-line comment that it is the owner's placeholder, refused by the launch gate; the exported placeholder; the three derivations of 8M2.1. (2) `isLaunchReadyShopPhone` (8M2.2), using `normalisePhoneNumber` from the domain's public exports. (3) The launch-check file `tests/launch/shop-phone.launch-check.ts` and its Vitest config; `gate:launch-placeholders`, running `build:deps` first. (4) The default web Vitest config is **not** changed: its `tests/**/*.test.ts` already skips the file [src]; show that by the suite's collected list. (5) If Q57 (a): a production-only step in `deploy.yml` before migrate. **Report the gate's red output at HEAD, quoted, showing the predicate's assertion** | new `apps/web/src/shop/shop-phone.ts`; new `apps/web/vitest.launch.config.ts` (the check file is a test file); `apps/web/package.json` and root `package.json` (the script); `.github/workflows/deploy.yml` (Q57 (a)) | this plan, 8M2.1, 8M2.2, criteria 1 to 5; ADR 0163; `packages/configurator-domain/src/contact/phone-number.ts` whole; `apps/web/vitest.config.ts`; `scripts/gates/*` (naming and placement precedent); `.github/workflows/deploy.yml` header and job; `ci-and-local-gates.md` (what `check` and `ci:local` run); ADR 0096 d2 (why deploy is manual) |
| **S2** | **The copy.** (1) New leaves of *Copy for the owner*, ro and ru, with equal ICU placeholders (`{phone}`, `{reference}`, `{link}`). (2) `content.ts`: functions taking `phone` (and `reference`, `link`), with no digits in any leaf. (3) The six register re-drafts. (4) The Romanian copy lock and the golden manifest moved for exactly the new and changed leaves. (5) The register test (8M2.9): explicit formal tokens per language and the named customer-voice allow-list. It must be green on the re-drafted catalogues with no allow-list entry for a non-customer-voice key. Sabotage both ways, reported | `apps/web/src/messages/ro.json`, `ru.json`, `ro.d.json.ts`; `apps/web/src/i18n/content.ts` | this plan, 8M2.9, *Copy for the owner*, criteria 18 to 21; `engineering-conventions.md`, *Localised copy* points 1 to 7; ADR 0159 Amendment A (`limitedTomorrow`); ADR 0156 (the Russian register note); ADR 0095; ADR 0113; Q10 (a). Tests: `tests/support/approved-romanian-messages.ts`, `tests/i18n/golden-output-hashes.ts`, `golden-output-fixtures.ts`, `golden-output.test.ts`, `catalogue-parity.test.ts`, `contact-copy.test.ts`, `content.test.ts` |
| **S3** | **5A to the shop, and F3.** (1) `send-on-whatsapp.tsx`: the address of 8M2.3, from `shop-phone.ts`. (2) The message from the new leaf, with the reference and the link. (3) `done-screen.tsx` passes the shown reference to the action. (4) The gate of 8M2.4. (5) The developer's own sources and dom tests updated, and the change reported | `apps/web/src/done/send-on-whatsapp.tsx`; `apps/web/src/done/done-screen.tsx` | this plan, 8M2.3, 8M2.4, criteria 6 to 9; ADR 0160 d8 and *Reviews' findings* (F3); ADR 0114 B2, B4, B6, G and its 8M note; ADR 0148 E3, E3a; `hydrate-stored-design.tsx`, `hydrate-and-configure.tsx:59-82`, `store/newest-copy.ts`, `share/share-design.tsx` (the share control's gate, which is **not** changed), `persistence/share-link-client.ts`, `share/absolute-share-address.ts`, `lib/server/write-token.ts` (why no page can know). Tests: `tests/done/send-on-whatsapp.dom.test.ts`, `send-on-whatsapp-sources.test.ts`, `done-screen.dom.test.ts` |
| **S4** *(as planned 2026-10-13; superseded by the amended row below, Amendment A)* | ~~**The check and the decision; no new screen yet.** (1) The design contact page reads `readSentReference` after the owned load and passes the answer. (2) `hydrate-and-contact.tsx` hands it on as a plain value. (3) New `contact/contact-page-view.ts`: `contactPageViewOf` (8M2.6), pure. (4) `contact-screen.tsx` reads it reactively from the store and keeps the precedence of 8M2.7. **The branch sits in `DesignContactPage`, above `ContactPage`**, because the hook is called in `ContactPage` beside the bar [src]. The `already-sent` arm draws the contact page's bar without mounting the hook, and the bar is extracted so both arms draw one component. **Until S5 that arm draws only the bar, the `h1` and the reference card** (an interim inside the wave). (5) The hand-over clear moves from the hook to the design contact page's mount (8M2.7)~~ | `apps/web/src/app/[locale]/d/[id]/contact/page.tsx`; `apps/web/src/app/d/[id]/contact/hydrate-and-contact.tsx`; new `apps/web/src/contact/contact-page-view.ts`; `apps/web/src/contact/contact-screen.tsx`; `apps/web/src/contact/use-contact-submission.ts` (the one line) | this plan, 8M2.5 to 8M2.7, criteria 10 to 15; ADR 0160 d4, d5, d10; ADR 0159 d1, d4, criterion 6; ADR 0153 with its 8M note; ADR 0148 A1, A3 ruling 4, E3, E3a; ADR 0158 d3, d4; D8, D9, D17; `lib/server/contact/sent-reference.ts`, `app/[locale]/d/[id]/done/page.tsx` (the pattern), `lib/server/load-owned-design.ts`, `done/sent-request-memory.ts`, `store/configurator-store.ts` (`hasUnsavedEdit`, `revision`). Tests: `tests/app/contact-page-gate.test.ts`, `review-page-gate.adversarial.test.ts` (read), `tests/contact/contact-screen.dom.test.ts`, `use-contact-submission*.dom.test.ts`, `contact-source-names-no-browser-storage.test.ts` |
| **S4** *(amended 2026-10-14, Amendment A; A2 to A8 are hard requirements)* | **The check, the decision and the interim view.** (1) **The page:** `readSentReference` after the refused-return, with `id` and `load.revision`, never in parallel, under the 300 ms deadline, with nothing cached and no limiter call (A2, A4, A8). In `sent-reference.ts`: the deadline is an option that only the contact page passes; one line per process and cause, from a closed list; the docstring corrected (A8). (2) `hydrate-and-contact.tsx` and `ContactScreen` take a prop typed exactly `SentReferenceAnswer` (A3). (3) New `contact/contact-page-view.ts`: `contactPageViewOf` and `nextContactPageView`, both pure (8M2.6, A6, A7). (4) **`ContactScreen` decides.** Every hook comes before its first return. The order is probing, then already-sent, then unsupported, then the form or the unavailable page. The latch lives in component state. `forgetSentRequest()` runs in its mount effect, and the hook's clear is removed: its function, call and import (A1). New `contact/contact-top-bar.tsx` holds the bar and the back links. New `contact/already-sent-view.tsx` draws the bar, the `h1` and the reference card, **an interim S5 completes**, and its import closure holds none of A5's list. (5) The developer's tests for A2 to A8. Every QA-owned pin it moves is reported, not edited | `apps/web/src/app/[locale]/d/[id]/contact/page.tsx`; `apps/web/src/app/d/[id]/contact/hydrate-and-contact.tsx`; `apps/web/src/lib/server/contact/sent-reference.ts` (and, if the developer prefers, one new log module beside it); new `apps/web/src/contact/contact-page-view.ts`; `apps/web/src/contact/contact-screen.tsx`; new `apps/web/src/contact/contact-top-bar.tsx`; new `apps/web/src/contact/already-sent-view.tsx` (interim); `apps/web/src/contact/use-contact-submission.ts` (the clear's function, call and import). **Not** `app/[locale]/d/[id]/done/page.tsx` | this plan, 8M2.5 to 8M2.7 and **Amendment A whole**, criteria 10 to 15, 25 and 26; ADR 0163 with its Amendment A; ADR 0160 d4, d5, d10; ADR 0159 d1, d4, criterion 6; ADR 0153 with its 8M note; ADR 0148 A1, A3 ruling 4, E3, E3a; ADR 0158 d3, d4; ADR 0156 d4, d5; ADR 0146 B2; D8, D9, D17; backlog 196, 197, 198. Source: `lib/server/contact/sent-reference.ts`, `app/[locale]/d/[id]/done/page.tsx` (the pattern), `lib/server/load-owned-design.ts`, `done/result-to-show.ts` (`SentReferenceAnswer`), `done/sent-request-memory.ts`, `app/d/[id]/hydrate-stored-design.tsx`, `store/configurator-store.ts` (`hasUnsavedEdit`, `revision`, `hydrate`, `applySaved`, `applyWriteAccess`, `overwriteConflict`), `proxy.ts:18-19` (read only), `lib/server/csp/csp-report-log.ts` (the closed-cause line), `packages/persistence/src/contact-submission-store.ts` (`ContactSubmissionStoreError`, read only). Tests: `tests/app/contact-page-gate.test.ts`, `review-page-gate.adversarial.test.ts` (read), `tests/contact/contact-screen.dom.test.ts`, `use-contact-submission*.dom.test.ts`, `contact-source-names-no-browser-storage.test.ts` |
| **Checkpoint A** | **The security reader reads S4** before S5 builds on it: the second reader of `contact_submissions` and its place behind the owned load; what crosses to the client; the hand-over's new clear; that the view has no send path. *[Added 2026-10-14:]* Amendment A records the findings made at `14ee66a0`, where no S4 code exists [src]. **The reader therefore reads S4's built diff against A1 to A8 before S5 is dispatched** | — | the security *Reading* line, plus Amendment A |
| **S5** | **The view and the call link.** (1) ~~New~~ *Completes (amended 2026-10-14: S4 creates it, A1)* `contact/already-sent-view.tsx` (8M2.7, whole; its import closure stays inside A5's rule). (2) New `shop/call-shop-link.tsx` (8M2.8). (3) 5B draws it (`submission-failure.tsx`, both classes, both variants). (4) `contact-screen.tsx`'s *cannot be sent now* page draws it, on the design path and the callback path. (5) Focus, `aria`, 44 px, the 640 px column on desktop, and nothing focused under a pinned region (ADR 0148 A4, G3) | ~~new~~ `apps/web/src/contact/already-sent-view.tsx` *(S4's interim)*; new `apps/web/src/shop/call-shop-link.tsx`; `apps/web/src/contact/submission-failure.tsx`; `apps/web/src/contact/contact-screen.tsx`; `apps/web/src/contact/contact.module.css`. *[Added 2026-10-14, A5:]* if `ResultHeading` is reused, it moves to a new neutral module first (backlog 198's remedy), and `apps/web/src/done/done-screen.tsx` and that module join these files. The view never imports `done-screen.tsx` | this plan, 8M2.7, 8M2.8, criteria 12 to 17; frame 5B (`…Mobil.dc.html:1463-1512`, *Sună direct la magazin*); frame 5A (`:1403-1460`, the pieces reused); ADR 0104 and Amendment B; ADR 0148 A3, A4, G3; ADR 0159 d5; ADR 0160 d2, d9; `done/sent-reference-card.tsx`, `done/done-screen.tsx` (`ResultHeading`), `review/design-hrefs.ts`, `result/review-link.tsx`. Tests: `tests/contact/submission-failure.dom.test.ts` (the two `tel:` pins at `:216`, `:809` are the developer's and move), `contact-screen.dom.test.ts`, `callback-contact-screen.dom.test.ts` |
| **S6** *(only if Q55 (b))* | **The route refuses a second new request for a kitchen already sent for.** (1) In `submit-contact.ts`, after `prepareSubmission` (owned, at the stated revision) and **before** the new-request buckets: `findSentReference` for the design and revision. If `sent`, answer `409 CONTACT_ALREADY_SENT`, which **holds no reference** (ADR 0157 d4) and spends none of a browser's two. A same-id retry is answered by the lookup before this point and is unaffected. (2) The response and its closed line. (3) The client class `already-sent`, mapped to the view, with the reference shown **only** if the page's own read had it, else the variant without a number. (4) Exhaustive switches. (5) Report every QA pin it moves | `apps/web/src/lib/server/contact/submit-contact.ts`; `contact-responses.ts`; `contact-log.ts` (only if the closed list must grow); `apps/web/src/contact/contact-answer.ts`; `send-contact-request.ts` | ADR 0157 whole, with d1, d4, d5, d9 and *Limits*; ADR 0153; ADR 0146; ADR 0155 standing rule; this plan, 8M2.10, criteria 22 to 24; `lib/server/contact/judge-contact-request.ts`, `prepare-submission.ts`. Tests: `tests/lib/server/contact/submit-contact*.test.ts`, `contact-route*.test.ts`, `tests/contact/contact-answer.test.ts`, `send-contact-request.test.ts` |

*Order:* S1 → S2 → S3 → S4 → **checkpoint A** → S5 → (S6) → freeze → QA → reviews.
- S2 needs S1's display function.
- S3 needs S1 and S2.
- S5 needs S2 and S4.
- S6 needs S4's class.

S1 may run before the owner answers anything. S6 is dispatched only on Q55 (b).

*Must not, every slice:*
- a migration or a grant;
- a file under `packages/` or `proxy.ts`;
- a file under `app/api/` (and `lib/server/contact/submit-contact.ts`) outside S6;
- the share route or its client changed;
- a `qa-*` or `*.adversarial.*` file edited (report the pin, QA moves it);
- a typed value in a URL, a cookie, browser storage, the store, a log or the console;
- `router.push`, `router.back()`, `history.back()`, `pushState` or `replaceState` in `contact/` (8M's scan stands);
- a phone digit in a message leaf;
- the launch check collected by the default suite, `check` or `ci:local`;
- the share control on the editor (`share-design.tsx`) gated differently;
- the store's `canWrite` written by `/done`.

| Slice | Stops if |
| --- | --- |
| S1 | `normalisePhoneNumber` turns out not to be reachable from `apps/web` (it is a public export at HEAD [src]); the gate's red is anything but the predicate's assertion |
| S2 | A re-draft would change an approved Romanian leaf other than the two named (`limitedTomorrow`, `subheadingNoDesign`); a needed leaf cannot be made register-neutral in Russian without gender; the register test needs an allow-list entry for a leaf that is not customer-voice |
| S3 | The address needs anything but the digits and the encoded message; F3 needs a store write |
| S4 | The view cannot be decided without a request from the client; anything but `{kind, reference}` must cross to the client; ~~the bar cannot be drawn without the hook, unless `ContactPage` is split into a bar and a hook-holding body (report the split's shape before making it)~~ *[struck 2026-10-14, Amendment A, A1: the bar moves to `contact-top-bar.tsx`, and `ContactPage` is not split]*; the hand-over clear cannot move without changing a QA-owned test (report it). *[Added 2026-10-14:]* the decision cannot be made in `ContactScreen` without changing `DesignContactPage`'s form; the view's import closure cannot avoid one of A5's modules; the latch would need the store; the deadline or the log line would need a change under `packages/`; `/done`'s page or its visible answer would have to change |
| S5 | The pinned region takes more than half the viewport at 390 × 844 in Russian (ADR 0148 A4's tripwire) |
| S6 | The guard needs a migration, a new index or a personal column; a same-id retry would be refused |

*Tier per slice.* QA and the reviews run once, after the last slice built, on a frozen tree. Checkpoint A is the one
early read.

| Slice | Tier | Security reviewer? | Visual? |
| --- | --- | --- | --- |
| S1 | **Light**: a constant, a pure predicate, a command; no customer data | No. The reviewer judges 8M2.2's *cannot reach a person* inference | No |
| S2 | **Full**: the logic reviewer reads every sentence against the frames, the register rule and criteria 18 to 21 | No: copy only | Through S3 and S5 |
| S3 | **Full** | **Yes**: the customer's share link put into a message to a fixed third-party number; F3 widens nothing the server authorises | **Yes**: the anchor after a reload |
| S4 | **Full** | **Yes, at checkpoint A**: a second reader of `contact_submissions` behind the owned load; what crosses to the client; the hand-over's new clear; no send path from the view. *[Added 2026-10-14:]* and again on S4's built diff, against A1 to A8, before S5 | No (no new screen yet) |
| S5 | **Full** | **Yes, scoped**: the `tel:` target is the constant only, and nothing typed is on the view | **Yes**: the view, 5B with the call link, the unavailable page on both paths |
| S6 *(Q55 (b) only)* | **Full** | **Yes**: a public endpoint's order and refusal set (ADR 0157) | No |

## Acceptance criteria

*Layers* as in 8M's point 4: **unit**, **dom**, **e2e** (mobile, 390 × 844, by touch), **e2e·CI** (production
server, `CI=1`; counts requests or rows), **visual**.

*The shop's phone and the gate.*

1. **One source.**
   - Every `tel:` href and every `wa.me/` address in `apps/web/src` is produced by `shop-phone.ts`'s functions.
   - ~~No other file under `apps/web/src` contains the literal `tel:` or `wa.me/`.~~ *[Amended 2026-10-14,
     Amendment A: as built, `send-on-whatsapp.tsx` holds the address prefix.]* Only `shop-phone.ts` contains the
     literal `tel:`. The literal `wa.me/` is in exactly two files:
     - `shop-phone.ts`;
     - `done/send-on-whatsapp.tsx`, once, in `WHATSAPP_MESSAGE_ADDRESS`. Its recipient there is the call
       `shopWhatsAppDigits()`, and no digit literal stands between `wa.me/` and `?text=`.

     A third holder, or a digit literal in that position, turns the scan red.
   - No message leaf contains a run of seven or more digits.
   - *Must not:* the number typed twice; a digit in a leaf.
   - *Proved by* unit tests: a source scan over `apps/web/src` and both catalogues; the derivations over the
     placeholder and a fixture.
2. **The placeholder is unreachable by the form.**
   - `SHOP_PHONE_E164` equals the exported placeholder at the wave's HEAD.
   - `normalisePhoneNumber(placeholder)` answers `ok: false`, `PHONE_MOLDOVAN_SECOND_ZERO`.
   - *Must not:* a placeholder the phone rule accepts.
   - *Proved by* unit tests.
3. **The predicate, both ways (R6).**
   - `isLaunchReadyShopPhone` is false for: the placeholder; `""`; `"+373 22 123 456"` (not the normal form);
     `"022123456"`; a fifteen-plus-digit number.
   - It is true for a well-formed fixture.
   - *Must not:* the fixture's digits anywhere under `src`.
   - *Proved by* unit tests, as a property over generated Moldovan numbers: true iff the normal form is accepted and
     is not the placeholder.
4. **The gate is red now, and only where it should run.**
   - `pnpm gate:launch-placeholders` exits non-zero at HEAD, and the failure is the predicate's assertion naming the
     constant and its file, not a build or import error.
   - With `shop-phone.ts` replaced by a scratch copy holding the fixture (never committed), it exits 0. Both outputs
     are quoted.
   - The default web suite's collected file list does not include the launch check, and `check`, `ci:local` and
     `ci.yml` do not name it.
   - *Must not:* any push gate turned red by it.
   - *Proved by* the coordinator's run (`rtk proxy`), the file list, and `git grep`.
5. *(Q57 (a))* **Production deploys are gated where they would run.**
   - `deploy.yml` runs the gate in a step conditioned on `inputs.environment == 'production'`, before the migrate
     step. `preview` does not run it.
   - The *Launch gate* line exists (scribe).
   - *Must not:* the workflow given a trigger it lacks.
   - *Proved by* the reviewer's reading of the diff. The scribe's line is checked at close.

*5A's WhatsApp action (Q44 (b), F3).*

6. **The address.**
   - The ready anchor's `href` equals `https://wa.me/` + the placeholder's digits + `?text=` +
     `encodeURIComponent(message)`.
   - `message` is the page locale's ~~`whatsappMessage`~~ `submissionResult.whatsappMessageToShop` *[corrected
     2026-10-14, Amendment A: the leaf as built; the old leaf is retired in S3]* with the reference shown on the
     screen and the absolute share address.
   - *Must not:* `https://wa.me/?text=` (no recipient); the customer's typed number; a name, a locality or any typed
     value in the message; the address in a history entry of this application, in storage or in a log.
   - *Proved by* dom tests (ro and ru, the hand-over case and the server case) and e2e·CI (the anchor's `href` read,
     with `wa.me` stubbed as QA's 8M spec does).
7. **Criterion 18 otherwise stands.**
   - The reissue warning appears with an active link, and nothing is issued until the customer goes on.
   - Exactly one share `POST` per issue, and one per double tap.
   - `target="_blank"`, `rel` holds `noopener` and `noreferrer`.
   - No window is opened after an `await`, and there is no Next `Link`.
   - *Proved by* the existing dom and e2e tests, moved only where the address changed.
8. **F3.**
   - After a **reload** of `/done` in the owning browser, the action is present in the sent view.
   - It is absent when the store holds `canWrite === false` for this design, absent in the no-request and not-shown
     views, and absent for another design held.
   - **The store's `canWrite` is unchanged by `/done`** (still `"checking"` after a reload). Going on to the editor
     makes exactly one `GET /api/designs/{id}`, the editor's own probe.
   - Without the write cookie, a press makes one status request and shows `share.error` and the retry. Nothing
     repeats without a press.
   - *Must not:* `canWrite` written by `/done`; the editor's probe skipped; a request without a press.
   - *Proved by* dom tests for each store state, and e2e·CI for the reload and the editor's probe count, and for the
     write cookie removed from the context.
9. **The message names the request.** The reference in the message equals the one on screen, in both the hand-over
   and the after-a-reload paths. *Proved by* dom tests.

*The contact page after a send (Q45 (b)).*

10. **The read sits behind the door.**
    - The design contact page reads `findSentReference` only after `loadOwnedDesign` found the design.
    - Each refusal of 8M's criterion 9 (no cookie, a malformed or foreign one, an unknown id, a malformed id, an
      invalid row) gives the same `DesignLoadError` and **makes no contact-store read**.
    - The callback page makes none.
    - A failed read is `unknown`. Only `{kind, reference}` reaches the client: no row, no column name, no error
      text.
    - *[Added 2026-10-14, Amendment A, A2 and A3.]*
      - The read follows the refused-return. It is never parallel with the load, and it takes `load.revision`, never
        a revision from the client or the search parameters.
      - The prop is exactly `SentReferenceAnswer` through `HydrateAndContact` to `ContactScreen`.
      - The document and flight responses contain none of `notified`, `created_at`, `client_request_id` or
        `payload_digest`.
      - *Must not:* a read while the load is pending; a read for any refusal.
    - *Proved by* unit tests with a store spy (beside `contact-page-gate.test.ts`) and a search of the RSC payload
      (e2e·CI). *[Added:]* A2's spy count of 0 per refusal, its deferred-load test and its source-order test; A3's
      type test.
11. **The decision, as a property.**
    - Over any sequence of: an arrival with each server answer for revision r; an edit; a save answered (r+1); a
      save held; a save refused.
    - ~~The view is `already-sent` **iff** the latest server answer is `sent` **for the store's current revision**,
      the store holds this design, and `design === savedDesign`.~~ *[Struck 2026-10-14, Amendment A, A6: the latch
      makes "iff" false. A conflict-reload back to r after the form has shown meets every condition, and the view
      stays the form.]* The view is `already-sent` **only if** the latest server answer is `sent` **for the store's
      current revision**, the store holds this design, and `design === savedDesign`. **The first decided view** is
      `already-sent` **iff** those hold at arrival. After that, the views follow A6's shape `already-sent* form*`.
      8M2.6's "iff" describes the pure `contactPageViewOf`, not the view drawn.
    - Once a save lands at a new revision the view is `form`, and it never returns to `already-sent` within the page.
      `none` and `unknown` are always `form`.
    - *[Added 2026-10-14, Amendment A, A6 and A7.]*
      - **Once the form, always the form** within one mount, for every event, the conflict-reload to r included.
      - Only `sent` blocks, and an unknown kind is `form`.
      - The alphabet and the four properties are A6's.
    - *Proved by* unit (`fast-check` on ~~`contactPageViewOf`~~ `nextContactPageView` folded over A6's alphabet,
      with the latch-removed mutant killed) and dom (the store driven, the view observed).
12. **The view, and that it cannot send.** With a notified request at the stored revision:
    - the view shows one `h1` with focus, the reference as text (markup inert, as 8M's criterion 16), *Copiază*, the
      advice naming the display form of `SHOP_PHONE_E164`, the call link, the changed-kitchen sentence and
      *Înapoi la design* (prefetch off, to the editor);
    - the chevron is the review link.
    - *Must not:* an `input`, a `form`, a consent box, `review-cta` or the contact CTA, `contact-retry`, a price, the
      design card, or any value the customer typed. Every press on the view makes **zero** `POST
      /api/contact-submissions`.
    - *[Added 2026-10-14, Amendment A, A5 and A7.]*
      - The view's import closure holds none of `use-contact-submission`, `contact-form`, `retry-when-online`,
        `send-contact-request` or `use-replace-with-done`, and no `fetch(`.
      - Mounted and pressed, it calls none of them, and `fetch` makes no call to `/api/` and no `POST`.
      - A markup reference is shown as literal text and makes no element.
      - *Proved by* A5's throwing-factory dom test and A7's markup dom test.
    - *Proved by* dom, and e2e·CI: send, Back, *Cere oferta*, the view, every control pressed, the contact `POST`s
      counted.
13. **Precedence and hydration.**
    - While probing, the loading line (the server render is unchanged).
    - With WebGL unsupported, the view, not `WebGLUnavailable`. With `isSendable === false`, the view, not the
      unavailable page.
    - *[Added 2026-10-14, Amendment A, A1:]* the decision is `ContactScreen`'s, in A1's order. With
      `already-sent`, `DesignContactPage` is never mounted, in any support state and with either `isSendable`.
    - *Must not:* a hydration error or warning in the console, including with an unsaved edit held when the page
      loads.
    - *Proved by* dom (each support state × `isSendable` × answer) and e2e (console captured).
14. **Boundaries, on the real store** (e2e·CI, ro and ru where marked).
    - (a) **Ro and ru:** after a sent request, the view with the same reference. A reload shows the same.
    - (b) Edit in the editor, wait for the save (r+1), review, contact: the form appears. A send stores a second row
      for r+1. Counted with `countAndNoteStored`; the e2e's two-an-hour budget per context is respected (ADR 0151).
    - (c) **Not e2e.** The e2e fake mail cannot produce a row that is stored and never notified [src; inf that it
      always accepts]. So: unit tests show `findSentReference` answers `none` for such a row on the persistence fake
      (8M's criterion 2 already pins this), and dom tests show the page draws the **form** for `none`.
    - (d) The callback form is unaffected.
    - (e) Two notified rows at one revision: the view shows the latest notified reference (8M's tie-break).
    - (f) **The lost answer:**
      - the request is forwarded by `page.route` and its answer aborted, so the server stores and notifies and the
        browser sees no answer;
      - 5B shows; then **a reload of the contact page** shows the already-sent view with that request's reference,
        not a new form, and makes zero `POST`s;
      - one row is stored.
15. **The hand-over.**
    - After the design contact page mounts, in ~~either view~~ **every arm** *[amended 2026-10-14, Amendment A, A1:
      loading, WebGL exit, unavailable, already-sent and form]*, `recallSentRequest` answers *none*.
    - *[Added 2026-10-14, A1:]*
      - **The callback page does not clear.** An entry remembered before `CallbackContactScreen` mounts is still
        recalled after it.
      - `forgetSentRequest` is named in exactly one production file besides its own: `contact-screen.tsx`.
        `use-contact-submission.ts` no longer names it.
      - *Proved by* a dom test per arm, the callback test and a source scan.
    - The view never reads the hand-over.
    - *Must not:* the typed value of 8M.2 shown or kept after arriving at the view.
    - *Proved by* dom and e2e: Forward to `/done` after the view shows the channel line without a value.

*The call link.*

16. **It dials the constant.**
    - `a[href="tel:+37300000000"]` with the accessible name *Sună direct la magazin* / its Russian, at least 44 × 44
      px, on: the view; 5B for `unanswered` and `failed`, in the design and callback variants; the *cannot be sent
      now* page on the design and the callback path.
    - *Must not:* a `tel:` link on 5A, on the callback form's in-place sent view, or beside an 8L class; a number
      other than the constant's.
    - **8M's criterion 7 is replaced by this one.** Its *never a stand-in* clause is retired by the owner's ruling,
      and criterion 4 is what now keeps the placeholder from launch.
    - *Proved by* dom and e2e.
17. **Layout.**
    - Nothing focused lies under a pinned region (ADR 0148 A4, G3).
    - The pinned region is at most half of 390 × 844 in ru.
    - Desktop is the 640 px column.
    - *Proved by* visual (390 × 844 in ro and ru; 1280) and e2e boxes.

*Copy.*

18. **Catalogues.**
    - Every new leaf is in `ro.json` and `ru.json` with equal ICU placeholders.
    - Every Romanian literal is in the copy lock.
    - The golden manifest moves for exactly the new and changed leaves.
    - *Must not:* an approved Romanian leaf changed other than `limitedTomorrow`; a Russian leaf marked approved.
    - *Proved by* the copy lock, `golden-output.test.ts`, `catalogue-parity.test.ts` and `contact-copy.test.ts`.
19. **Register, as a test.**
    - The deny-list is **explicit tokens, matched as whole words**, never verb endings (an ending pattern matches
      *pereți*, walls [src]).
      - ro: *dumneavoastră*, *vă*, *ați* and the specific formal verb forms the sweep finds, e.g. *reveniți*,
        *încercați*, *configurați*.
      - ru: *вы*, *вас*, *вам*, *ваш…*, and the specific imperatives found, e.g. *Попробуйте*, *Скопируйте*.
    - It runs over every leaf except a named allow-list of customer-voice keys: the WhatsApp message and
      `webglUnavailable.contactLink`.
    - It is green on the re-drafted catalogues.
    - Sabotage both ways (R6): *Попробуйте* put back into `share.error` turns it red; adding *pereți* to a scanned
      leaf stays green.
20. **The six re-drafts** are exactly the leaves listed and nothing else in the register sweep moved. QA re-sweeps
    by reading both catalogues whole, not by the token list alone, and reports any further leaf rather than changing
    it.
21. **The number in text.** Every leaf naming the shop's phone uses `{phone}`, and the rendered sentence contains the
    display form of the constant. *Proved by* dom.

*Only if S6 is built (Q55 (b)).*

22. A new request (new id) for a design and revision with a notified request is answered `409
    CONTACT_ALREADY_SENT`. The answer:
    - holds **no reference**;
    - stores no row and sends no mail;
    - spends none of the new-request buckets (the four counters unchanged; ADR 0157 d1).
23. A same-id retry of the original request is still `200` with its reference. A request whose earlier row was never
    notified is taken as new.
24. Concurrency is a recorded limit, not a criterion. Two new ids racing past the read may both store; the limiter
    bounds them. A text test pins the guard's place in the order.

*Added by Amendment A (2026-10-14), S4. These hold whether or not S6 is built.*

25. **No cache across requests (A4).**
    - The contact page's answer is read per request. None of `unstable_cache`, `"use cache"`, `revalidate`,
      `force-static` or `fetchCache` appears, and no module-level answer is held.
    - *Must not:* a `none` served after the request was stored, in the same server process.
    - *Proved by* a source scan, a unit test, and e2e·CI: form at r, send, fresh navigation, view.
26. **No limiter call, a read deadline, one line per cause, and the scan's limit (A8).**
    - The page and `sent-reference.ts` make no limiter call. The interceptor's count of the page is the only one.
    - The contact page's read past 300 ms is `unknown`, which gives the form. The losing promise raises no unhandled
      rejection.
    - `/done`'s call and what it shows are unchanged.
    - A failure writes one line per process and cause, with a cause from `store-error`, `deadline` or `unexpected`,
      and nothing else.
    - *Must not:* a limiter import in either file; a deadline on `/done`; a message, `name`, `operation`, id,
      revision or reference in the line; a second line for one cause in one process.
    - *Proved by* A8's unit tests (fake timers at 299 and 301 ms; hostile thrown values), a source scan, and a dom
      test of `unknown`.
    - **The unindexed scan is a recorded limit, not a criterion** (A8, backlog 196).

*QA-owned pins this wave moves* [src: `git grep` of `apps/web/tests` at `d61bfd6d` for `wa.me`, `tel:`,
`limitedTomorrow`, `tooManyRequests`, `share.error`, *a second request for the same design*]. **A starting point,
not a boundary:** 8L's and 8M's lists were both incomplete. QA re-greps the frozen tree first.
- `qa-8m-after-sent.adversarial.e2e.spec.ts:174`: *"a second request for the same design is the second
  confirmation"*. **It is Q45 (a) as built, and is red by design.** Under (b) the second form is not drawn. The
  tie-break it also covers moves to criterion 14 (e).
- `qa-8m-after-sent.adversarial.e2e.spec.ts:162-165`: *"after a reload it is not drawn"* (`done-whatsapp` count 0).
  **It is F3's gap as built, and is red by design**; criterion 8 replaces it.
- `qa-8m-whatsapp.adversarial.e2e.spec.ts:9, 31` (`https://wa.me/?text=`).
- `qa-8m-failure-screens.adversarial.e2e.spec.ts:144` (no `tel:` on 5B; red by design). Line `:371` asserts no
  `tel:` on the **callback's in-place sent view** and should **hold** (criterion 16's *must not*).
- `qa-8m-navigation-sources.adversarial.test.ts:307` (a `wa.me` sample in a mutant; may hold).
- `qa-8l-contact-limited-day.adversarial.e2e.spec.ts` (the `limitedTomorrow` wording, if pinned literally).
- Possibly `qa-8m-geometry.adversarial.e2e.spec.ts` (5B's boxes, now with a call link).

*Developer-owned tests that move:*
- `tests/contact/submission-failure.dom.test.ts:216, 809`;
- `tests/e2e/contact-unavailable.e2e.spec.ts:133, 167` (no `tel:` on the unavailable page);
- `tests/done/send-on-whatsapp*.test.ts` (including `send-on-whatsapp.dom.test.ts:192-193`, *"draws no element at
  all when the write check has not answered / failed"*, which F3 reverses), `done-screen.dom.test.ts`;
- `tests/contact/contact-outcome.dom.test.ts`;
- the i18n tests named in S2;
- `tests/e2e/support/contact-page.ts`;
- `tests/e2e/page-read-refused.e2e.spec.ts` and `tests/lib/server/rate-limit/page-limit-response.test.ts` and
  `tests/proxy-page-read.test.ts`, if they pin `tooManyRequests`' Russian.

## Copy for the owner (drafted; flagged; Russian unsigned; Q58)

New leaves. Key names are the developer's.

| Leaf | ro (*tu*) | ru (*ты*, impersonal where gender would show) |
| --- | --- | --- |
| already-sent heading | Cererea pentru această bucătărie a fost deja trimisă | Заявка на эту кухню уже отправлена |
| already-sent advice | Ai greșit ceva în cerere? Sună-ne la {phone} și spune-ne numărul cererii — corectăm împreună. | Нужно что-то исправить в заявке? Позвони нам по номеру {phone} и назови номер заявки — исправим вместе. |
| changed-kitchen sentence | Dacă schimbi bucătăria, poți trimite o cerere nouă pentru ea. | Если изменишь кухню, сможешь отправить на неё новую заявку. |
| call link | Sună direct la magazin *(as drawn, frame 5B)* | Позвонить в магазин |
| WhatsApp message (customer's voice; register-neutral; replaces 8M's) | Bună ziua! Designul bucătăriei mele din configuratorul Lemnaria, cererea {reference}: {link} | Добрый день! Дизайн моей кухни из конфигуратора Lemnaria, заявка {reference}: {link} |
| *(S6 only)* already-sent, no number | O cerere pentru această bucătărie a fost deja trimisă. | Заявка на эту кухню уже была отправлена. |

Re-drafted into the register (existing leaves):

| Leaf | Now | Drafted |
| --- | --- | --- |
| ro `contact.outcomes.limitedTomorrow` — **the owner's own sentence (2026-10-12)** | Din păcate, ați încercat să generați o bucătărie de prea multe ori într-un timp scurt. Vă încurajăm să reveniți mâine, după ora {time}. | Din păcate, ai încercat să generezi o bucătărie de prea multe ori într-un timp scurt. Te încurajăm să revii mâine, după ora {time}. |
| ru `contact.outcomes.limitedTomorrow` | К сожалению, вы слишком много раз за короткое время пытались создать кухню. Приглашаем вас вернуться завтра, после {time}. | К сожалению, за короткое время было слишком много попыток создать кухню. Приглашаем тебя вернуться завтра, после {time}. |
| ru `designLoadError.tooManyRequests` | …Попробуйте ещё раз чуть позже. | Слишком много запросов за короткое время. Попробуй ещё раз чуть позже. |
| ru `share.shownOnce` | Скопируйте ссылку сейчас — показать её снова мы не сможем. | Скопируй ссылку сейчас — показать её снова мы не сможем. |
| ru `share.error` | Не удалось обновить ссылку. Попробуйте ещё раз. | Не удалось обновить ссылку. Попробуй ещё раз. |
| ro `contact.subheadingNoDesign` (8L's drafted leaf; *you two* becomes *we*) | Spune-ne cum te găsim, iar un consultant revine la tine ca să configurați bucătăria împreună. | Spune-ne cum te găsim, iar un consultant revine la tine ca să configurăm bucătăria împreună. *(ru unchanged: …чтобы вместе настроить кухню is impersonal)* |

*Note.* The owner's `limitedTomorrow` speaks of *generating a kitchen* for a limit on contact requests. ADR 0159
Amendment A records that the owner chose it, and the draft keeps the content and changes only the register.

## QA plan

**QA Reading:**
- this plan whole (8M2.1 to 8M2.10, **Amendment A**, criteria 1 to 21, 25 and 26, and 22 to 24 if S6);
- *[added 2026-10-14]* ADR 0156 d4 and d5; ADR 0146 B2; `lib/server/csp/csp-report-log.ts` (the closed-cause
  pattern); `app/d/[id]/hydrate-stored-design.tsx`;
- ADR 0163;
- ADR 0160 whole;
- ADR 0159 d1, d4, d5, criterion 6 and Amendment A;
- ADR 0153 with its 8M note;
- ADR 0148 A1, A3 ruling 4, A4/G3, E3, E3a;
- ADR 0158 d4;
- ADR 0114 G and its 8M note;
- ADR 0151; ADR 0155's standing rule;
- `engineering-conventions.md`, *Coverage an adversarial pass owes*, *Three guards that look thorough and cannot
  fail*, *Localised copy* point 7;
- `browser-and-visual-qa.md`;
- `agent-coordination.md`, *Freeze the tree*;
- `ci-and-local-gates.md`, *The per-shard test budget* and the known intermittents;
- the support files `tests/e2e/support/contact-run.ts`, `contact-page.ts`, `seeded-design.ts`, `design-return.ts`;
- `lib/server/rate-limit/limit-policy.ts` (the e2e twins);
- QA's own 8M specs named under *QA-owned pins*.

**What the pass owes:**
- first, the re-grep and repin of the pins, with nothing else changed in them;
- criterion 11 as a property with the save alphabet;
- criteria 12 and 14 by touch, in ro and ru;
- criterion 4's sabotage, both ways;
- criterion 19's sabotage, both ways;
- one whole `CI=1` e2e run, alone. The persistence suite runs first if 8Q2 has landed.

**Counterexamples to try:**
- a save that lands while the view shows;
- a page loaded at r with the tab holding r+1 unsaved;
- the server read failing (`unknown`) with a notified row present;
- a markup reference;
- the view in a language switch;
- Back and Forward around the view;
- `/done` reloaded without the write cookie, pressed three times;
- the call link on the callback 5B;
- the register deny-list fed a leaf in a customer-voice key.
- *[added 2026-10-14, Amendment A:]*
  - the view with WebGL unsupported and with `isSendable === false`;
  - a conflict-reload back to r after the form showed;
  - the read held past 300 ms with a notified row present;
  - a direct visit to `/contact?revision=…`;
  - the callback page mounted with a hand-over entry held.

**Mutants, named:**
- `already-sent` without the revision check;
- without `design === savedDesign`;
- `unknown` treated as `sent`;
- the read before the owned load;
- the hand-over clear left in the hook;
- the anchor back to `?text=` with no recipient;
- F3 written into the store;
- the launch check collected by the default suite;
- the placeholder changed to a number the domain accepts.
- *[Added 2026-10-14, Amendment A:]*
  - the read run in parallel with the owned load (`Promise.all`);
  - the revision taken from `searchParams`, or from anything but `load.revision`;
  - the latch removed, which conflict-reload must kill;
  - the latch kept in the store;
  - the decision moved back into `DesignContactPage`, so the WebGL exit or the unavailable page wins;
  - the clear missing from one non-form arm (loading, WebGL exit, unavailable or already-sent);
  - the clear added to the callback page;
  - the view importing `done-screen.tsx` or any of A5's five modules;
  - the deadline removed, or added to `/done`;
  - the thrown value's `message` or `name` written to the line;
  - an `unstable_cache` around the read;
  - `sent` matched loosely, so a non-`sent` kind blocks.

**Store mutants run against the fake only; nothing near a database (ADR 0155).** A clean report says what was
attacked.

## Review plan

- **Logic, Reading:**
  - this plan, 8M2.3 to 8M2.10, criteria 6 to 16; *[added 2026-10-14]* Amendment A and criteria 25 and 26;
  - ADR 0160 d2, d5, d8, d10 and F3;
  - ADR 0159 d4, d5;
  - ADR 0148 A3 ruling 4, E3a;
  - D8, D9;
  - Q5, Q41, Q44, Q45;
  - the diff of S3 to S5 (and S6).

  **Named checks:** no path shows the view without a notified request at the store's revision; no path from the view
  sends; F3 does not change the editor's write probe; which screens carry the call link and which must not.
  *[Added 2026-10-14:]* `ContactScreen`'s order is A1's; the latch never reopens the view after the form; every arm
  clears and the callback page does not.
- **Clean-code, Reading:**
  - the diff;
  - `engineering-conventions.md`;
  - ADR 0136; ADR 0152;
  - backlog 198 to 200 (the `contact/` and `done/` cycle, long hooks).

  **Named questions:** whether `shop-phone.ts`, `contact-page-view.ts` and `call-shop-link.tsx` each have one reason
  to change; whether `contact-screen.tsx`'s precedence reads as one decision.
- **Security, Reading:**
  - D17; ARCH §8;
  - ADR 0153; ADR 0146;
  - ADR 0157 d4, d9 (and whole if S6);
  - ADR 0114 B2, B6, G and its 8M note;
  - ADR 0148 A1;
  - `lib/server/write-token.ts`, `share-link-repository.ts:223-239` (read);
  - the files of S3, S4, S5 (and S6);
  - at checkpoint A, S4's diff.

  **Named checks:**
  - the second reader names no personal column and runs only behind the owned load;
  - only `{kind, reference}` crosses to the client;
  - the share link is now sent to a fixed number. Its lifetime is the customer's, it shows the live row, and a
    reissue revokes it;
  - F3 widens nothing the server authorises;
  - the placeholder cannot dial or message a person (8M2.2's inference, judged).
  - *[Added 2026-10-14, Amendment A; Reading gains Amendment A, ADR 0156 d4 and d5, `proxy.ts:18-19`,
    `csp-report-log.ts` and backlog 196:]*
    - A2's place and order of the read;
    - A3's exact prop type and the payload search;
    - A4's absence of a cache;
    - A5's import closure;
    - A8's absence of a limiter call, its deadline, its line's closed causes, and the scan's recorded limit;
    - S3-3's corrected sentence against `share/route.ts`.
- **Visual, Reading:**
  - frames 5A and 5B;
  - ADR 0104 and Amendment B;
  - ADR 0148 A3, A4, G3;
  - 8M2.7, 8M2.8;
  - `browser-and-visual-qa.md`.

  **Captures,** at 390 × 844 in ro and ru, and the 640 px column at 1280:
  - the view (its arrival and after a reload);
  - 5B, both sentences, with the call link;
  - the *cannot be sent now* page;
  - the WhatsApp anchor on `/done` after a reload.

## Risks

1. **Q45 (b) breaks a QA pin by design** (`qa-8m-after-sent…:174`). The freeze names it as an expected red.
2. **The placeholder in a test or a preview.** A tester who taps the call link or the WhatsApp anchor reaches no one,
   because the number is refused by our own rule [inf: not checked against Moldova's numbering plan]. WhatsApp shows
   its own *invalid number* notice.
   - **8T's line *"WhatsApp opening from the anchor"* cannot prove delivery to the shop while the number is the
     placeholder.** 8T proves that WhatsApp opens with the prefilled text and this recipient.
   - Delivery is M9's, after Q3. *For the scribe:* this goes on 8T's line.
3. **8T's *"a limiter refusal is shown … at 4"*** now needs a third request on **different revisions or designs**,
   because a resend of one unchanged kitchen is no longer drawn. *For the scribe:* this goes on 8T's line.
4. **The shop's link drifts or dies** (8M2.3). The reference in the message is the durable handle (Q60).
5. **A second reader of `findSentReference` with no index** (backlog 196). Every load of a design contact page now
   reads it. The trigger stays *growth of leads*; the frequency is higher. *[Added 2026-10-14, Amendment A, A8:]*
   - The scan is bounded by the interceptor's page limit only where a network source is named. The 300 ms deadline
     bounds the page's wait, not the database's work.
   - The trigger gains *a slow `/contact` or `/done`*, or *any `deadline` line from this read*.
6. **Stale tab, page check only.** A form loaded before another tab sent can still send a second request (Q55).
7. **The register deny-list** may flag a legitimate word. The allow-list is per key and named; never a regex
   loosened to pass.
8. **The shard budget.** At least one new e2e file. `pnpm gate:e2e-shard-budget` runs at the freeze.
9. **The concurrent test audit.** Its coverage of this wave is not known (*Where this sits*).
10. *[Added 2026-10-14, Amendment A, A8.]* **The deadline makes the view's e2e depend on timing.** Criteria 12,
    14 (a) and 14 (f), and A4's e2e, need the read to finish within 300 ms on a loaded `CI=1` run. A slower read is
    `unknown`, which gives the form, and the red then looks like a logic failure.
    - S4's e2e reports the read's measured duration.
    - QA reads a red there against the server's `deadline` line before calling it a logic defect.
    - The deadline is **not** loosened to make a test pass. A change of the figure is a dated amendment.

## Verification

- **Each slice, the developer:** its tests; web typecheck and lint. S1 also runs `pnpm gate:launch-placeholders`,
  red output quoted. S4 onward also runs the slice's e2e alone under `CI=1`.
- **At the freeze, the coordinator:**
  - the whole web suite; web typecheck; lint; `pnpm format:check` whole-tree; `pnpm gate:boundary`;
    `pnpm gate:e2e-shard-budget`;
  - `pnpm gate:launch-placeholders` (**red expected**; quoted);
  - `rtk proxy git diff --stat <base>` showing no file under `packages/`, no migration, no `proxy.ts`, nothing
    under `app/api/` or `submit-contact.ts` unless S6, and no `qa-*` or `*.adversarial.*` file.
- **QA:** its pass, then one whole `CI=1` e2e run alone, tree clean before and after.
- **Before any push:** `pnpm ci:local` in full, quoted (the launch gate is not in it, by criterion 4).

## Owner questions (Q55 to Q60): each has a default; none blocks S1

- **Q55 — How firm is "already sent", and where is it checked?**
  - *When you come back to the contact page for the same kitchen, unchanged since you sent it, we show the request's
    number and "call us to correct anything". There is no form and no "send anyway". A kitchen you change gets a new
    form. "Unchanged" means no saved edit since the send: changing something and changing it back counts as a
    change.*
  - **(a)** Checked on the page only. **(b)** Also refused by the server, so a second tab already open on the form
    cannot send it.
  - **Recommended: (a).** *(The owner took (a) on 2026-10-13 [doc: `STATUS.md`].)*
    - *[Added 2026-10-14, Amendment A:]* **The page check is not flood protection: the client controls the
      revision it sends, a direct `POST` never sees the page, and the rate limits are the bound.**
    - Neither one stops a flood. The limits do that: 2 an hour per browser, 3 an hour and 10 a day per network,
      3 a day per e-mail address.
    - Any edit, or a new design, walks past a per-kitchen check anyway.
    - (b) changes the contact endpoint's ruled order and becomes a public-endpoint review. It does save the shop a
      duplicate e-mail in the two-tab case.
  - *Also confirm:* no "send anyway" (the architect's reading of your "maybe advise to call").
- **Q56 — The placeholder number on screen.**
  - **(a)** Shown as *+373 00 000 000*, which is visibly not a number, and the launch check refuses it.
  - **(b)** Also marked *provizoriu*, as the consent text is.
  - **Recommended: (a).**
- **Q57 — Where the "placeholder still in place" check runs.**
  - **(a)** A command (`pnpm gate:launch-placeholders`), the M8/M9 launch checklist, and a production-only step in
    the deploy workflow. That workflow is manual and not yet switched on, so today the checklist is what holds.
  - **(b)** The command and the checklist only.
  - **Recommended: (a).**
  - *Also:* fold the consent text's `"placeholder"` version into the same command? Default **no**: M9 already holds
    that line.
- **Q58 — The copy.**
  - The new sentences in the table above, ro and ru.
  - **Your own `limitedTomorrow` sentence, re-worded from *dumneavoastră* to *tu*** (we read "all copy" as including
    it).
  - Four Russian sentences approved at Gate O2 (*Попробуйте/Скопируйте* → *Попробуй/Скопируй*), for the Russian
    re-sign.
  - The callback form's subheading: *…ca să configurați…* (you two) becomes *…ca să configurăm…* (we).
  - **Default:** approved as drafted, yours included, until you reword.
- **Q59 — Your WhatsApp number for testing.** 8T can check that WhatsApp opens addressed to the placeholder with the
  message filled in, but not that it reaches you.
  - **(a)** Nothing now; delivery is checked when you give the real number (Q3).
  - **(b)** Give a test number for 8T only.
  - **Recommended: (a).**
- **Q60 — What the shop's link shows.**
  - The link the customer sends you is their own. It shows the kitchen **as it is now**, not as it was sent, and
    stops working if they make a new link later.
  - **(a)** Accept that. The message carries the request number, and the request e-mail holds the kitchen as sent.
  - **(b)** A separate, frozen link for the shop: a new kind of link, a table and a security review (Q5 (b)), as its
    own wave.
  - **Recommended: (a).**

**Still open, unchanged:** Q3 (the real number, now the only thing that turns the launch check green), Q7, Q9.

## For the scribe, at the close

ADR 0163 becomes Accepted. Each item below is a **dated amendment or note**, naming the owner's ruling of 2026-10-13
(relayed):

- **ADR 0160:**
  - d2: 5B draws the call link;
  - d8: Q44 (b), the shop's number, the reference in the message, F3's gate;
  - d10: superseded by Q45 (b);
  - *Reviews' findings* F3: made;
  - *Owner's questions*: Q44, Q45 and the register answered.
  - *[added 2026-10-14, Amendment A]* d4: the hand-over is cleared when a design contact page mounts, in any arm,
    and not by the form's hook. The callback page does not clear.
  - *[added 2026-10-14, Amendment A]* d5: a second caller of `readSentReference`, the contact page, with a 300 ms
    deadline (`/done` has none). Both callers get one log line per process and cause, from a closed list.
- **ADR 0159:**
  - d5: the telephone drawn as the placeholder constant, under the launch gate; the unavailable page carries it;
  - Amendment A: `limitedTomorrow` re-drafted in *tu* (Q58).
- **ADR 0114 G**, beside its 8M note: the anchor is addressed to the shop; the shop holds the customer's link; it
  shows the live row; a reissue revokes it.
- **ADR 0153**, beside its 8M note: a second reader, the design contact page, behind the owned load.
- **ADR 0148:** the contact door reads the store only after the owned load allows.
- **ADR 0156:** the Russian register note settled (*ты*).
- **ADR 0095:** four approved Russian leaves changed register, to be re-signed.
- **ADR 0157:** only if S6 ships, d1 and d4.

**The M8 plan:**
- the 8M scope note, *Must not* list, criterion 7 and criterion 18 struck and dated;
- named interim 6 restated;
- Q44 and Q45 marked answered;
- 8T gains the lines of risks 2 and 3;
- the *Launch gate* gains: *`pnpm gate:launch-placeholders` exits 0, quoted*.

**M9's stub** inherits that line.

**Backlog:** 197 gains *"the hand-over is cleared on the contact page's mount, whichever view"*; 196's frequency
note. *[Added 2026-10-14, Amendment A:]* 196 also gains A8's triggers (a slow `/contact` or `/done`; any
`deadline` line) and the bound under no named source.

**`STATUS.md`** and the wave table.
