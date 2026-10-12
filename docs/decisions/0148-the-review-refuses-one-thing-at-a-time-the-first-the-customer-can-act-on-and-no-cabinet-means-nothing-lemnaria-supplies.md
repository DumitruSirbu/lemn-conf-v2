# ADR 0148 — The review refuses one thing at a time, the first the customer can act on, and "no cabinet" means nothing Lemnaria supplies

Status: Accepted (amended 2026-10-08: Amendment A, wave 8D's screen)
Date: 2026-10-07
Type: Decision
Milestone: M8 wave 8C (the review as a value); wave 8D added the screen's half to this same record at its close (Amendment A)

The record was written by the documentation scribe from `docs/milestones/M8-review-contact-success.md` (wave 8C:
*adjudication of adversarial QA, 2026-10-07*; *8C as built*; *Plan decisions* D2 and D14; *An inherited criterion
from M6*; *8D, restated for dispatch*), where the architect's reasoning lives, and from the ADRs it cites, each
opened before it was quoted. Evidence tiers: **[doc]** quoted from a record in this repository, **[src]** read in
the code by the plan's author, **[inf]** the architect's inference. Figures are labelled by who ran them.

## Context

Wave 8C built `describeReview`, one pure model that produces everything screen 3 prints and decides whether the
kitchen may be submitted. Its rules were ruled in the plan's adjudication (C1, C2, C3) and only there. The plan is
archived when M8 closes, and the *ADRs* list assigned no record to 8C. These three rules are shipped behaviour a
later reader would get wrong, C3 above all: it reverses the order first built, and the plan once quoted it as
ADR 0065's when it is not.

## Whose rulings these are

- **C1** (a kitchen of only customer-supplied bodies is *no cabinet*), **C3** (the order of the refusals) and
  leaving the price bar's *"De la 0 MDL"* as it was are **the architect's rulings, open to the owner**. The plan
  says so (*"This is D14 as it was meant; the owner may overrule it"*; *"Not the owner's"*).
- Q30 (pricing fails and a body does not fit: which refusal?) was put to the owner as an open question and is
  **closed by the architect's ruling on the plan's criterion** (rule C3), not by an owner answer.
- **The one owner ruling in this area.** Asked whether the refusal sentences should say *dulapuri* or the frames'
  *corpuri*, the owner answered, verbatim, **"dulapuri"** (2026-10-07). That covers the three
  `review.refusalReasons` sentences, which stand as written. ~~The room line's body count (*"corp"*, *"corpuri"*) is
  **still an open question** (the open half of Q31); the ruling is not extended to it and nothing here records it
  as decided.~~ **Struck 2026-10-08:** the owner then answered *"dulapuri everywhere"*, which covers the room line's
  count; Amendment A records it.

## The correction: what ADR 0065 decision 7 says

The plan's Q30 quoted *"The refusal names which bodies do not fit"* as ADR 0065 decision 7. **That sentence is not
in ADR 0065.** Decision 7 reads [doc, `0065-…md:76-78`]:

> **7. Save yes, submit no.** The design **saves and resumes with the warning intact**, so no work is lost. The
> review/contact step **refuses while any body does not fit**, so no unbuildable kitchen reaches the owner as an
> enquiry.

(The plan's own quotation of this decision at *An inherited criterion from M6* is a paraphrase in one word, *"its
warning"*; the text above is ADR 0065's.) The sentence about
naming is the plan's own criterion, *An inherited criterion from M6*, written on 2026-09-03 with its reason:
*"The refusal names **which** bodies do not fit, not merely that some do. The customer has to be able to go back
and fix it, and M6 marks them in the scene for exactly that."* So the naming requirement is the plan's, and the
precedence among refusals is decided by that criterion and the architect's rule C3, not by an ADR's text. ADR 0065
is unchanged and needs no pointer: it is not overtaken, it was misquoted.

## Decision

### 1. The review refuses one thing at a time, the first the customer can act on (C3)

The order: **a body past its wall; then nothing Lemnaria supplies; then a price that cannot be computed.**
`RefusedSubmit` keeps its one `code`; no shape carrying several reasons exists. The fit query is asked first,
whatever pricing answered. The order as first built was pricing failure, then empty kitchen, then a body past its
wall, which followed the price bar's states; it is reversed because the customer can add a cabinet or shorten a
run and cannot repair a price.

- When pricing fails and a body does not fit: `unavailable` (there is no figure), with `BODIES_PAST_WALL` and the
  bodies named. Once they fit, the next review shows `PRICING_FAILED`.
- `BODIES_PAST_WALL` whenever the query's list is not empty, naming exactly those bodies in display order.
  `NO_CABINET` when no body is one Lemnaria supplies. `PRICING_FAILED` only when neither holds.
- A design with no body at all whose pricing also fails is `NO_CABINET`: that it holds nothing Lemnaria supplies
  is known from the design alone. `PRICING_FAILED` is the answer only when the design holds bodies, none is past
  its wall, and the price cannot be computed, since then the supplier of each body is unknown.
- An empty kitchen cannot be submitted (plan decision D14: the call to action is disabled with its reason).

### 2. "No cabinet" means nothing Lemnaria supplies (C1)

A kitchen in which every body is supplied by the customer is the same case as one with no body: there is nothing
to make an offer for. The review is `unavailable` and the refusal is `NO_CABINET`, whose sentence is *"Adaugă cel
puțin un dulap în bucătărie înainte să ceri oferta."* The decision is read **from the supplier each line already
publishes, never from a zero amount**. ADR 0107 decision 2: *"Zero and not-supplied are different facts and must
never be conflated"*, and *"`price-breakdown-model.ts` can only tell them apart because the row says which it is"*
[doc, `0107-…md:83-86`]. Appliances are drawn, not sold (ADR 0107 d2), so a kitchen of a free-standing fridge and a
hood alone is no cabinet.

**What is left as it was.** The price bar and the breakdown still print *"De la 0 MDL"* for such a kitchen. That
predates the wave and is those surfaces' matter; it is backlog 126, with the question of what a kitchen of
appliances alone should show. The architect's ruling, open to the owner.

### 3. The model takes three inputs and throws when they are not one design's (C2)

`describeReview` keeps its three inputs (the projection's groups, the catalogue, the priced design). It does **not**
price for itself: deriving the price inside it would make this module name a price book, and
`use-priced-design.ts` is the one module allowed to (ADR 0062 seam 1: the price book must be substitutable;
ADR 0072). The model **asserts** what it can see: the rows' keys are exactly the design's placement ids, and the
priced design's list of bodies past their wall equals the query's answer for the design. A disagreement throws a
named error (`ReviewInputDivergenceError`), as the breakdown's own divergence does; it is never rendered.

**Fit is one query's answer, and the priced list is that same answer** [src
`packages/configurator-domain/src/pricing/price-design.ts:114-115`]: `const overflowingPlacementIds =
[...findOverflowingPlacementIds(request.design)]`. For one design the two lists cannot differ. They differ in
exactly one real case, a price computed for another design, which the id check alone does not catch when the ids
are the same. So the second assertion stays, and the tests that pin "the model does not measure a wall" give the
answer they choose to both the mocked query and the price they hand in.

> **Note — 2026-10-12, M8 wave 8K.** "The one module allowed to" name a price book is no longer the only one
> in `apps/web`: the server has a second root, `lib/server/shipped-price-book.ts`, which the contact route's
> ports use. See the dated note on ADR 0062 seam 1 and
> [ADR 0157](0157-the-contact-route-judges-every-request-first-stores-once-answers-one-code-per-kind-and-refuses-a-retry-across-a-change-of-book.md)
> decision 8 (backlog 176 for the interim's trigger). `describeReview` itself still names no book.

### 4. A body is named by the row's own labeller; rows are one per body

A refusal's body name is the row's label, from the entry's label and width, by **one named, exported function in
`price-breakdown-model.ts`** that both the row and the refusal call. The refusal composes no label of its own; a
second route would be the review writing the words itself. For a priced kitchen the name in the refusal equals the
row's label and a test says so; with no priced rows it is built from the projection, which does not depend on
pricing. Rows are one per body, exactly the breakdown's rows; frame 3B's aggregated row (*"2 × 800 mm"*) is not
reproduced (D2: amounts are rounded per row, so an aggregate would print a figure the breakdown never shows).
Groups are listed wall A, B, C, row-major within a group (ADR 0063).

## Alternatives weighed and not taken

- **A refusal carrying more than one reason.** `RefusedSubmit` keeps one `code`; the precedence changed instead.
- **Pricing failure shown first** (the order first built, following the price bar's states): reversed, above.
- **Recording the pricing-failed-plus-overflow pair as a limit.** Weighed. The one measured way to that state is a
  tier the book does not offer, which ADR 0072 records as something that *"cannot happen until a manufacturer, not
  a developer, can edit the book"*. But pricing can refuse for eleven reasons, and whether a customer's own edits
  can reach any of the other ten was not measured. A rule right whichever way that falls costs a moved check and
  an exported function; a limit would rest on an unmeasured claim.
- **The model taking only the design and pricing for itself.** Refused: ADR 0062 seam 1, above.
- **Deciding "nothing sold" on a zero amount.** Refused: ADR 0107 d2, above.
- **The refusal composing its own label.** Refused: criterion 1's one builder, above.

## Evidence

All at or before `3bda09d`, the head of wave 8C.

- **[QA-run]** Parity of the review's rows against the breakdown as it stood before the wave: 6,390 comparisons
  across straight, L, right-hand L and U kitchens in ro and ru, 0 differences, run after the slices and again
  after the fix round. The figure against the price bar over the same set: 0 differences. The refusal order across
  six real pricing-refusal codes. 357 all-supplied kitchens refused `NO_CABINET`, one sold body among them allowed.
  Across 7,825 designs `priceDesign` refused 0; insert, swap, finish and handle edits are not in that count.
- **[coordinator-run, at `3bda09d`]** Web typecheck exit 0; `tests/review`, `tests/price`, `tests/i18n` 1231
  passed; whole-tree `pnpm format:check` exit 0. Not run: `pnpm check`, `pnpm ci:local`, e2e, a build.
- **[reviewer-run]** Logic review and clean-code review both approve on round 2.

## Recorded limits

Each is recorded with its trigger where the plan gives one (ADR 0118).

- **A stale projection with the same ids and the same fit is rendered with its old label** (C2's blind spot,
  QA5). Closed by wave 8D's criterion 10: one caller of the model, behaviour test.
- **The sweeps use the fake body probe,** not the real one.
- **Five of pricing's eleven refusal codes were not reached** [QA-run, relayed]. Whether a customer's own edits can
  reach any code but the tier one is not measured.
- **A design naming an uncatalogued body never reaches the model,** because the projection throws first. Wave 8D's
  criterion 15 answers it at the load seam.
- **No test pins Russian wording project-wide:** backlog 127.
- **The price bar and breakdown print "De la 0 MDL"** for a kitchen of only customer-supplied bodies: backlog 126.
- ~~**Open wording** (not decided here): the room line's *corp/corpuri* count (the open half of Q31).~~
  **Answered later: *dulapuri* everywhere.** See Amendment A, *The owner's copy rulings*.

## Consequences

- The review's refusal is deterministic and single: a customer is shown the one thing they can fix first, and the
  next review shows the next.
- `describeReview` never prices and never measures a wall; both come from the same seams the rest of the app uses.
- The price bar's zero and the model's `NO_CABINET` disagree about a kitchen of appliances alone until backlog 126
  is decided.

## ~~To be added at wave 8D's close~~ Done 2026-10-08: Amendment A

~~Wave 8D adds to **this record**, not a second one, what the screen settles: the routes (D1, Q2), which body a
group's *Editează* selects (D3), the view-only scene (D4), and where the two sentences stand on the screen (8D's
criteria 11 to 13).~~ Wave 8D added it, below, to this record and not a second one.

## Amendment A — 2026-10-08: what wave 8D's screen settled

Written by the documentation scribe at wave 8D's close from `docs/milestones/M8-review-contact-success.md` (the
*8D* section: *restated for dispatch*, the four adjudications, *QA15 classified*, and *review round 2 and the
close*), where the architect's reasoning lives, and from the coordinator's close-out brief. Nothing below was
re-run by the scribe, who has no shell. Tiers: **[doc]** the plan or another record, **[src]** a code reading the
plan cites, **[inf]** the architect's inference. Figures say who ran them. Where an earlier wording of a rule was
overtaken, it is struck here and not removed, and the plan keeps the original text.

### A1. The routes (D1; Q2 answered)

The review, the contact form and the success screen are addressed by the design: `/[locale]/d/{id}/review`,
`/[locale]/d/{id}/contact` and `/[locale]/d/{id}/done`. Q2 was answered (a). **The editor's page and the review's
page answer the owned load through one function**, so a request with no cookie, a malformed one, a foreign one or
an unknown id is refused exactly as `/d/{id}` refuses it, class for class, and no query is issued without a
well-formed cookie (criterion 1; ADR 0114 d5, H5). `s/{token}/review` is not a route, and the shared view shows no
review control.

**What the proxy's list does.** It decides locale routing and the unprefixed redirect, not reachability: a path
it does not admit still reaches the router, and the gate is each page's own owned load (criterion 2, clarified
2026-10-08 from the security review's R1.1). Every later page (the contact page, the success page, the endpoint)
therefore calls the shared load itself; the plan wrote that into 8K, 8L and 8M.

### A2. Which body a group's *Editează* selects (D3)

**The group's first body in display order**, by `?select={placementId}` [doc, plan decision D3, an [inf] that the
frame's *"cu corpul preselectat"* means a group of several is entered at one body; falsified if the owner wants a
per-row action]. `?select=` naming a body the design does not hold selects nothing and shows no error
(criterion 5). *Schimbă* opens the editor with the settings sheet open, by `?settings=open`.

### A3. The view-only scene (D4, and the five points S2 left open)

D4 stands: **a live scene, not a still**, the existing component mounted without picking, with the room's own
camera presets; a still would need a capture path M8 does not have. The rulings that settle what it does:

- **1a. It does not orbit, and a swipe over it scrolls the page.** The frame says three angles, which the three
  chips are; the canvas declares `touch-action: none` [src, `kitchen-canvas.tsx:90`], so a thumb that landed on it
  would not scroll a screen whose job is to be read downward. The views change by the chips; free looking is what
  *Vezi în 3D* opens. *Vezi în 3D* is a link to the design's editor with nothing selected.
- **2. The marks on a body past its wall stay in the review's scene.** They are how the customer finds the body
  the refusal names. *Must not:* the scene marks a body the refusal does not name, or the reverse.
- **3. One remembered view, shared with the editor.** It is the customer's camera, not a screen's.
- **4. Without WebGL the review is the editor's exit, whole: frame 2F.** Not the review with a gap where the scene
  was. The approved sentence on that screen is the rule, *"fără 3D nu există configurare reală, deci nici preț"*;
  a review would otherwise show a price for a configuration the device cannot show. While support is still being
  probed the screen shows the editor's loading line and no figure. The probe belongs to the screen, so
  `ReviewScene` renders nothing for a device without WebGL (criteria 18, 19).
- **5. The probe is one hook** beside `detectWebGLSupport`, adopted by the editor in S4. **The chips are written
  twice and not extracted** (see A6).
- **Criterion 17, restated by the V4 finding:** the same chip stands the camera at the same eye and target on both
  screens; **what the canvas then crops is its own.** The editor's and the review's overviews of a U look
  different because the canvases differ in shape [inf]; both hand the stage one preset [src
  `review/review-scene.tsx:56-59`].
- **Height and title.** The scene is **158 px**, the frame's (a defect against the frame at 240 px, fixed in the
  review fix); the title is drawn as the frame words it. **The material pill is not drawn on screens 3 to 5 in
  M8**: on the editor it is the control that opens the settings sheet, which the review must not have, and its
  words are already in the settings row.
- **Desktop: a centred 640 px column.** Accepted and recorded; no desktop frame exists for screens 3 to 5, and the
  phone's layout made responsive is the rule (`milestones/README.md`).

### A4. The reading order and the pinned bottom region (criteria 9, 11 to 14)

`REVIEW_READING_ORDER` gained two entries, **`overflowWarning` and `refusal`, after `disclaimer` and before
`figure`** (logic R1.4 of 8C's review). *Why there:* ADR 0065 d6, *"the flag travels with the total"*, so the
flagged-total sentence stands with the figure; and a control that is off stands with its reason (§9, disabled with
reason), so the refusal stands with the call to action. The frames draw neither state. The screen follows the
constant, and a DOM test covers it.

**The bottom region is pinned, in this order:** the flagged-total sentence when the total is flagged; the
refusal's sentence when refused; the figure; the call to action. *Must not:* the call to action is ever off without
its sentence on screen; the region hides the list's last row. **The bodies a refusal names are listed as links
directly above the region, last in the page's flow**, each opening the editor with that body selected; in an
`available` review each such body's row is also marked; in an `unavailable` review there are no rows and the list
is the only place they appear. The name is the model's, never composed by the screen. An unavailable review shows
the top bar, the heading, the sentence, the named bodies if any, the call to action off and the way back, and
**no figure, no zero, no empty list, no not-included block and no chips** (criterion 14).

**The tripwire.** If the region took more than half the viewport's height, the implementer would stop and report
and the design would return to planning; the half is the architect's, not a measured figure. Measured at
390 × 844, Russian: **243.95 px, 28.9%** with two sentences [QA-run]; **377.5 px, 44.7%** with three sentences and
the link [QA-run]; **377.52 px, 44.73%** on a production build in Chromium with real touch, unchanged between the
visual verifier's two rounds [reviewer-run, visual]. Not reached. Spacing there: 15 / 15 / 10 px between groups,
blocks and rows, and page padding 18 px, matching the frame [reviewer-run, visual]. **One sentence is printed
twice** (the not-included slot and the disclaimer's notice open with the same words): the screen draws both as the
model returns them and neither drops, merges nor rewords either; it goes to the owner with Q9.

### A5. The rules as they finally stand, and why

These were ruled in the plan's adjudications; the letters are the plan's. A rule's earlier wording is struck where
a later one replaced it. All are the architect's and open to the owner (see A7).

- **E1: an arrival is honoured when it can be, once, and the parameter leaves only then.** `?select=` needs
  nothing and is honoured at once; `?settings=open` needs the answer about write access, because the sheet's
  trigger is off until it comes [src `settings/global-settings.tsx:262`]. While the answer is awaited the
  parameter stays and nothing is clicked. If the browser may write, the sheet opens; if it may not, or the check
  fails, the sheet is not opened (not openable read-only) and the editor's own notice says why. *Must not:* the
  parameter is removed before the outcome, or the sheet opens a second time. *Reason:* QA1 found a click on a
  trigger still off.
- **G2: an arrival with a body stands at that body's own wall view. Always.** In place of ~~E2, which moved the
  view only if the one last stood at would cut the body's wall, and otherwise left it where it was~~. A view can
  leave a wall whole and still not show it: from wall A's view a U's wall C is off the screen. Asking whether a
  view *shows* a wall needs a definition for each shape and each screen, and E2 asked the wrong thing. The
  remembered view becomes the one stood at. *Unchanged:* tapping a body never moves the camera; changing to a view
  that cuts a selected body's wall still deselects it. *The property stays:* in every generated U, a wall's own
  view does not cut that wall. ~~The wall's own view is the one made to show it.~~ **Corrected by QA15:** it is
  the one whose subject is that wall, and at 390 px it does not frame the wall's ends (A8).
  QA2's cause, as established: the overview never cuts wall C; the stage's first cut is computed with the camera
  at its seating position, which does, and one frame later it does not, so the selection waits for the scene's
  rest, about 2.8 s after it mounts [doc, plan, QA's re-run adjudication].
- **E2a: the customer's own act wins.** An arrival's selection waits for the scene to rest. If before then the
  customer selects a body, selects an empty space or clears the selection, the pending selection is dropped; the
  arrival was honoured once, by being overridden, and the parameter leaves. *Must not:* a selection the customer
  made is replaced by one they did not.
- **E3: the review shows the newest copy this tab can know, and never an older one as ready.** The hydrator holds
  the store's copy and the page's, and needs no request. A store holding an unsaved edit is kept; a clean store
  whose revision is the lesser is replaced by the page's; a clean store whose revision is the greater or equal is
  kept, because Next keeps a restored page's payload and says the cache's lifetime does not change that
  [doc `next/dist/docs/…/staleTimes.md:36`, next 16.3.8]. A save sets `revision = revision + 1` [src
  `neon-configuration-repository.ts:295`], so revisions compare as whole numbers never turned into a JavaScript
  `number`, as `design-revision.ts` requires. *What it does not close:* another tab can save after the review has
  opened; **8K refuses a request whose revision is not the stored one (D5)** and the rule only makes that rare.
  Criterion 20 restated: arriving from the editor, the hydration never replaces a store holding an unsaved edit
  of this design, and never replaces a newer copy with an older one.
- **E3a: replacing a copy does not forget what this browser may do.** Write access is a fact about the browser
  and the design, not about the copy. When the review replaces a stale copy of the same design, the store's answer
  is carried over; it is `"checking"` only when the store held none. *Reason:* QA8 saw one `GET
  /api/designs/{id}` go out; the mechanism was an inference ([inf]) that the replacement set `"checking"` and the
  departing editor's probe ran on it, and it was to be shown by a test that failed first. Criterion 20 stands: the
  review asks nothing.
- **E4: the groups are spaced as frame 3A spaces its blocks, and a test fails when the screen names a class its
  stylesheet does not define.** *Reason:* QA4, groups 0 px apart on a class the stylesheet lacked.
- **E5: the review does not settle a conflict; it sends the customer to where it is settled.** With the save in
  conflict the call to action is off and the sentence says the kitchen was changed elsewhere and the choice is
  made in the editor, with a link. The editor's own sentence names *reload* and *overwrite*, which the review does
  not have, and is not shown. New wording in both languages under Q10's rule.
- **E5a: the conflict link arrives with the first body selected.** The editor draws a conflict and its controls
  only in the panel, and the panel needs a selection, so the link uses the same `?select=` as every other link.
  *Limit:* a kitchen with no body has no panel, and the link lands on an editor that says nothing (A9).
- **G1: the parameter leaves at the outcome, and there are four outcomes:** the body is selected when the scene
  rests; the customer acts first (E2a); the body is not in the design; **no scene will ever exist** on this device.
  Until one of them `?select=` stays on the URL, so a reload ~~or a language switch~~ in the wait starts the same
  arrival again. **Struck 2026-10-08:** the language switch is not covered; the menu's links carry the path and no
  query [src `configure/locale-menu.tsx:139`], so the parameter is gone with the navigation. That is backlog 73,
  and one fix serves both. G1's *must not* stands for the hook: it removes a parameter only at its outcome. The
  hook lives in its own file, `use-honour-arrival.ts`, beside `use-back-guard.ts`.
- **G3: nothing that has focus is under the pinned region.** For every link and control on the review, when it
  takes keyboard focus its box is wholly above the region's top edge, at 390 × 844 and at desktop widths, in both
  languages and with one, two and three sentences. How is the implementer's. *Reason:* the visual pass's V2, focus
  ending under the region, against criterion 12's *"hides"*.

### A6. Alternatives weighed and not taken

- **A still image for the review's scene.** Needs a capture path M8 does not have (D4).
- **A scene that orbits on the review.** `touch-action: none` would trap the swipe on a screen meant to be scrolled
  (ruling 1a).
- **The review with a gap where the scene was, on a device without WebGL.** It would show a price for a
  configuration the device cannot show (ruling 4).
- **E2's condition, or any condition on whether a view *shows* a wall.** Replaced by G2 above.
- **Fixing how the stage frames a view on a tall, narrow canvas inside 8D.** That is the 3D adapter's, with
  anchors and a fidelity gate, at the Full tier; 8D is Light and D4 keeps every M8 wave out of the adapter (A8).
- **The editor's conflict sentence on the review.** It names two controls the review does not have (E5).
- **The review asking the server for the newest copy.** Criterion 20 forbids the request; 8K's revision check is
  the line that keeps a stale offer out (E3).
- **Moving the chips into a shared component now.** They are written twice, not three times, and the review styles
  its own; moving the editor's would disturb tests that read `configure.module.css`. Backlog entry, trigger: a
  third place that draws them.
- **Fixing the language switch in 8D.** It is backlog 73, which loses a typed room, and one fix serves both.
- **Putting the id-shape check into 8D** (security R1.2: the shared load takes an id of any shape; no oracle
  [the reviewer's inference]). It predates the wave and is the same on both doors; ids that are not a design id's
  shape stand in existing tests. **Owner: wave 8L, slice S2.**
- **Drawing the material pill.** See A3.

### A7. The architect's rulings open to the owner

The plan's close list names **seven**, quoted: *"the scene does not orbit; without WebGL the review is frame 2F's
exit whole; the scene is 158 px, the frame's; no material pill on screens 3–5; the review shows the newest copy
the tab can know (E3); an arrival always stands at the body's own wall view (G2); the customer's own act cancels
a pending arrival (E2a)."* Beside them, and not in that list, the desktop column (A3) is accepted and recorded
because no frame exists; and C1 and C3 above remain open to the owner as before. The coordinator's brief names
the desktop column among the rulings; I followed the plan's list of seven and record the column separately.

**The hand-check list for the owner** [doc, plan]: the scene's height and the chips over it (the visual verifier
judged the three 44 px chips to cover about a quarter of the 158 px scene [reviewer-run, visual, relayed]; one
question with the height); the pill; that the rows' second line and the bottom bar's layout come in wave 8D2;
**backlog 16 as it now shows**; and, with Q9, the sentence printed twice and the two words without diacritics in
the reused disclaimer (*"Pretul"*, *"măsurarile"*).

### A8. Recorded limits, with their triggers (ADR 0118)

- **QA15, backlog 16: at 390 px a body near a wall's end can be selected and lie outside the frame even at its
  wall's own view.** In a U the first *Perete A · bază* body spans −2.30 to −1.14 in normalised device x where the
  frame is −1 to 1, and the refusal's wall C body 1.19 to 2.30; 6 of 8 U first bodies and 5 of 8 in the narrowed L
  straddle the edge [QA-run, relayed]. The overview of a U on a phone crops to wall A (V4). **The review's links now
  land on a selected body the customer may not see.** Classified under the stopping rule as none of its three
  arms, so recorded and not fixed: the doors and requests are not involved, no rule or restated criterion fails
  (G2 promises the body selected and the camera on its wall, and QA found exactly that), and nothing that held has
  stopped holding. Backlog 16 was already ruled by the owner (*"fit-to-run framing on the Perete A preset"*,
  2026-09-05, not built); the ruled answer must now cover walls B and C and the overview. **It waits for a wave,
  not a trigger. Recommended, the architect's: its own wave before the phone gate (8T), with D4 lifted for that wave
  by name, since 8T walks a refused kitchen back to the body to be fixed.** QA keeps two declared deferrals in
  `apps/web/tests/e2e/qa-8d-review-arrival.adversarial.e2e.spec.ts`, in the form that goes red on the day the
  framing is fixed.
- **In eleven arrivals the visual verifier saw the right view and the right body selected and no body visible
  above the editor's sheet** (*"Body visible: no"* in every one) [reviewer-run, visual, relayed]. The sheet covers
  most of the scene on a phone for any selection; that is the editor's viewing model.
- **A language switch in the wait drops a pending selection** (R2.1; backlog 73; owner: whoever takes 73). Nobody
  has seen it in a browser; the reviewer read it from source and QA could not send a switch in the wait. The wait
  was about 5 s in the verifier's eleven arrivals [reviewer-run, relayed].
- **The editor shows a save conflict only inside the panel** (QA11; M4's open question); a kitchen with no body
  gives the review's conflict link nothing to select. New backlog entry.
- **A two-finger pinch can read as a tap and drop a pending arrival** (combined R1.4; [inf], unmeasured). Backlog.
- **A real finger during the scene's first frame is delivered only after the rest and lands on the just-opened
  panel.** For a real-device pass. Backlog.
- **A carried write-access answer can be stale; a React warning appears between two designs** (security R1.3,
  R1.4): accepted and recorded here as the plan's table words them. The scribe did not read the security report
  itself, so the mechanism is not restated.
- **No limiter stands in front of the review route until wave 8G.** The route costs what `/d/{id}` costs, one
  indexed lookup.
- **The proxy's list is not a gate** (A1), and **the id's shape is checked nowhere in the shared load until 8L S2.**
- **The named interims:** *Cere oferta* leads to the existing placeholder contact page until 8L; the proxy admits
  `d/{id}/contact` and `d/{id}/done`, and until 8L and 8M each answers not-found (the plan states both; the scribe
  did not inspect the tree to reconcile them); the not-included list is slot text (Q9); desktop is the phone's
  layout, responsive.
- **Noticed, not fixed:** the locale chip's height (V7, a shared component); a faint vertical line beside the chip
  at 1440 px that the verifier could not attribute; the editor's Russian top-bar title truncated to
  *"Конфигур…"* (pre-existing); two doc comments in `use-honour-arrival.ts` still over ADR 0136's length. All in
  backlog 124 or beside it.

**The complete unproven list, as the plan's close names it, plus the brief's** — criterion 15 in a browser; a
timing difference between the two doors; which body each overflow mark belongs to; a real touch before the scene
rests; a language switch in the wait; pinch; iOS Safari; a real CI runner; the whole suite under `CI=1` at the
final commit; the first-frame freeze and the release of the WebGL context, which the verifier did not confirm;
E1 to E5 at desktop width; QA8's mechanism by instrumentation (the plan has the implementer show it by a test that
fails first; whether that was done is not in the documents the scribe read).

### A9. The owner's copy rulings made during the wave

Recorded in the form of ADR 0113's pointers: the owner's words quoted, and what an agent proposed said so. The
wording was applied in `2d05dac` (*dulap* in the settings heading and the two sink extras) and `a04a1fc`
(*chiuvetă*; *шкаф*) [relayed by the coordinator]. The dates of rulings 2 to 5 are not given in the brief; the plan
relays the change in its adjudication of 2026-10-07.

1. **Q31, the room line's count.** Asked whether *corp/corpuri* should say *dulapuri*, the owner answered, verbatim
   (2026-10-07): **"dulapuri everywhere"**. It covers every place a cabinet is counted or named as a unit.
2. **The material heading.** The owner wrote *"Materialul dulapului si a fronturilor"*. The coordinator proposed
   the diacritic and *"al"* and the owner answered "yes". **Result, the owner's words with the coordinator's two
   accepted corrections: "Materialul dulapului și al fronturilor"** (the leaf was *"Material corp și fronturi"*).
   The Russian is **"Материал шкафа и фасадов"**; the brief does not say who drafted it.
3. **The sink's extras.** The owner wrote, verbatim: `for sink is "dulapul chiuvetei" and dulapul suspendat desupra
   chiuvetei`. The coordinator read *"desupra"* as a typo for *"deasupra"* and said so. **The owner's words:**
   *dulapul chiuvetei* and *dulapul suspendat deasupra chiuvetei*. **The sentences are the coordinator's proposals,
   with the owner's "yes":** "Protecție de aluminiu pentru dulapul chiuvetei", "Montată în dulapul chiuvetei,
   împotriva umidității și a scurgerilor.", "Montat în dulapul suspendat deasupra chiuvetei."
4. **Chiuvetă.** The owner answered, verbatim: **"chiuveta everywhere, and yes for resend, and translate 'chiuveta'
   in russian also"**, and "yes" to the coordinator's exact proposals. **Proposals the owner accepted:** "Dulap
   pentru chiuvetă"; the zone label "Chiuvetă"; "…nu mai rămâne loc pentru chiuvetă și plită…"; "…păstrăm întâi
   chiuveta și gătitul…"; and in Russian "Алюминиевая защита для шкафа под мойку" and "Устанавливается в шкафу под
   мойку, защищает от влаги и протечек." **The owner's words are "chiuveta everywhere" and the instruction to
   translate it; every sentence above is a proposal accepted.**
5. **The mail provider.** The *"yes for resend"* in the same answer replied to the coordinator's explicit question
   whether the owner chose Resend knowing it stores account data and 30 days of mail content in the United States;
   the plan already records that confirmation (*"Confirmed later the same day [relayed by the coordinator]"*).

**Not settled by these:** the Russian count word *"шкаф"* also counts a fridge and a hood (Q31's Russian half, with
the wording questions in the plan). Whether *spălător* in `room/generation-model.ts` and in the domain's
`commands/rejection.ts` is ever shown to a customer was a question to the implementer; its answer is not in the
documents I read.

### A10. Evidence

Branch `m8-review-contact-success`, local, not pushed. Wave 8D is `7fa5258` to `9f4c123` (base `7af6737`).

- **[coordinator-run, at `9f4c123`]** `apps/web` vitest exit 0, 329 files, 6121 passed; web typecheck exit 0;
  whole-tree `pnpm format:check` exit 0. The shard-budget guard and its own tests exit 0 at `c62feb1`. **Not run:**
  `pnpm check`, `pnpm ci:local`, a build. Nothing has run on a CI runner since the branch was cut, so the six-shard
  workflow and the earlier CI step change are unproven there.
- **[QA-run, six passes, a real browser]** At `9f4c123`, e2e in dev mode in full: mobile 482 passed, 0 failed,
  2 skipped; desktop 201 passed. Under `CI=1` a subset (the 8D specs and the back-guard specs): mobile 91 passed,
  desktop 12 passed. The full suite under `CI=1` was green at `7261f82` (mobile 480 passed, desktop 201 passed) and
  has not been repeated at HEAD. Shard budget: desktop 69 / 70 / 62 of 70; mobile 83 / 79 / 81 / 83 / 95 / 63 of
  125. At 390 × 844 the two doors answer with equal status, headers and refusal markup for no cookie, a malformed
  cookie, a foreign visitor and an unknown id, in ro and ru; with the real repository and the socket replaced,
  17 non-visitor cookies × 10 ids sent 0 queries and a visitor sent exactly 1 per door; 24 stale replacements
  under eight workers sent 0 requests (21 of 24 red with the fix reverted).
- **[reviewer-run]** Combined: round 1 approve with should-fix, round 2 approve. Security: approve, four notes;
  *"the review door upholds ADR 0114 d5 exactly as the editor's does, by construction"*. Visual: two rounds on a
  production build in Chromium at 390 × 844 with real touch; findings V1, V2, V3 (as to the view) and V6 closed.

## Consequences of Amendment A

- A reader of the review finds one record for the step: the value (8C, above) and the screen (A1 to A10).
- The rules E1 to E5a and G1 to G3 are shipped behaviour whose reasons would otherwise live only in an archived
  plan.
- Wave 8D2 changes the review's rows and bottom bar, and so this record's model half; it appends to this record.
- Backlog 16 is the one item here that touches what the customer sees, and it is the owner's to look at.

## Amendment B — 2026-10-08: what wave 8D2 settled about screen 3

Written by the documentation scribe at wave 8D2's close from `docs/milestones/M8-review-contact-success.md` (the
*8D2* section: *S1 as built*, *S2 as built, and three rulings*, *QA's figures and the review's one fix*, *8D2 as
closed*). Nothing here was re-run by the scribe, who has no shell, and no ruling is new: each is the architect's,
in the plan, and is recorded here so the reason lives beside the rule. Evidence and who ran it: the plan's *8D2 as
closed*. Commits `3ffad38` … `0fad22c`.

**B1. A body's row draws its label over two lines.** The first line is the body's name; the second states the
body's width and, exactly when the body carries its own, its finish and its handle. The amount stays the
breakdown's, and the rows are still one per body (decision 4). The second line comes from
`AvailableReview.rowDetails`, a map beside the rows, so `groups` is still the breakdown's.

- *Decision 4, noted.* It says the name in a refusal equals the row's label. That stays true of the value, now
  stated as: the label is the first line's name and the body's width through the breakdown's own label leaf, and
  the second line's first fact is that same width. The words on screen are no longer one string (*"Dulap bază 3
  sertare"* over *"600 mm"*); what ties a refusal to its row is the mark, as criterion 13 of 8D has it.
- *One labeller with one name inside it* (review R1.1): `describePlacementLabel` passes
  `describePlacementName(entry, content)` to the label leaf, so a row's name and its label are not read from the
  entry by two routes. A body with no detail makes the lookup throw a named error in the model (R1.2,
  `MissingRowDetailError`), and the screen decides nothing.
- *Interim, the owner's wording:* a body's own free colour is printed as its value. No frame shows a colour on a
  row and a free colour has no approved name. A body's own finish equal to the kitchen's is stated on its row,
  because ADR 0099 decides by whether the body holds its own choice.

**B2. The view chips stand in a row under the picture, and only the *Vezi în 3D* link covers it.** Over the
picture they covered about a fifth of it; under it they cover nothing and keep 44 px (criterion 7). **This
supersedes "the chips over it" in A7's hand-check list**; the list item that remains is the picture's height and the
cost in rows (backlog 133). Rulings 1a and 5 of Amendment A (the chips are how the views change; two copies, not
three) are unchanged.

**B3. A named departure: the Russian call to action is on two lines.** *"Запросить предложение"* breaks at its
space inside a 52 px button; the frame draws one line because the Romanian fits on one and draws no Russian. The
words, their size and the button's height are the approved ones. Accepted as built, not a blocker, shown to the
owner at the hand check, with a shorter Russian label as the alternative that is the owner's (criterion 6). Limit,
measured by QA: the word first enters the button's padding at 300 to 330 px depending on the figure, and nothing
spills at 345 px and above; trigger (ADR 0118): a supported width under 345 px is named, or a kitchen prices at
seven digits. The caption is `--ink-faint` (`#6b6860`), not the frame's `#7d7a72`, by ADR 0104's sweep.

**B4. Criterion 5, restated.** Not *"the breakdown or the price bar changes"* but: **what the breakdown and the
price bar print must not change.** The proof is that their own tests and both parity files pass untouched; a change
to a function they call that alters no string they print is not forbidden. The restated criterion is what let B1's
labeller fix edit `price/price-breakdown-model.ts`.

**B5. Limits recorded.** The first screenful of the review holds about half the rows it did before 8D2 (backlog
133). A render-time throw, including `MissingRowDetailError`, shows Next's default error screen because the app has
no `error.tsx` or `global-error.tsx` (backlog 135). Not proven: a real device, iOS Safari, a CI runner; the full
`CI=1` e2e suite and e2e after the fix round; a free colour's value on a row (not producible through the UI); a
seven-digit figure in the bar (widest tried 103 000 MDL); the facts line's wording against the frame's.

## Amendment C — 2026-10-09: two named callers of `describeReview` (wave 8J)

Written by the documentation scribe at wave 8J's close from the plan's *8J — S3's stop, ruled* and *the three reviews*. The ruling is the
architect's; nothing was re-run by the scribe. The wave's record is [ADR 0154](0154-mail-leaves-through-one-provider-neutral-port-and-one-resend-adapter-that-sends-once-and-answers-with-one-of-seven-kinds-and-the-shops-notice-is-the-stored-review-printed-never-priced-again.md).

**C1. Decision 3 and 8D's criterion 10, amended from one caller to a closed list of two, each named.** Criterion 10 said, of 2026-10-07:
*"One place hands `describeReview` its three inputs … nothing else imports `describeReview`."* ~~One caller, `review/use-review.ts`.~~
**Two callers: `review/use-review.ts` and `lib/server/mail/lead-notification.ts`.** The criterion's *must not* stands for both: the design
from one source and the price or the groups from another, or a projection kept from an earlier design.

**C2. Why: it contradicts the letter and not the intent.** The rule exists so that no caller pairs a design from one place with a price or
rows from another. A second, server-side caller over a **stored** snapshot contradicts the letter; but the snapshot's document and price were
made together from one parsed design [src `submission-snapshot.ts`], the rows are projected from that same document in the same call, and
nothing is kept between calls. *Why not building the notice from `describeBreakdownRows`:* it makes a second composer of what a review
shows (its room line, figure, disclaimer), the drift the one model was built to end, and criterion 7 would rest on a parity test and not on
construction. Decision 3's other halves are **kept**: the model does not price, `use-priced-design.ts` is still the one module that names
a price book, and nothing re-prices a stored submission (D7; ADR 0072), since the notice prints the snapshot's price.

**C3. What stays impossible, and which gate holds it.** A third caller, or one not named. A caller in the browser other than the hook (the
notice begins with the server-only import). A caller that prices (the notice names no pricing function, no price book and no store). A
notice that prices again (a snapshot whose stored total is changed prints the changed figure). The review's gate is
`apps/web/tests/review/use-review.dom.test.ts`, whose header cites this amendment; the price gate is
`apps/web/tests/price/starting-price.adversarial.test.ts`, where the notice joins the list of modules that may go near a price, with one
line saying it prints a stored review's figure and rows and derives nothing (ADR 0138 decision 4, note of 2026-10-09).
