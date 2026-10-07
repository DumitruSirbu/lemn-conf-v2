# ADR 0148 — The review refuses one thing at a time, the first the customer can act on, and "no cabinet" means nothing Lemnaria supplies

Status: Accepted
Date: 2026-10-07
Type: Decision
Milestone: M8 wave 8C (the review as a value); wave 8D adds the screen's half to this same record at its close

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
  `review.refusalReasons` sentences, which stand as written. The room line's body count (*"corp"*, *"corpuri"*) is
  **still an open question** (the open half of Q31); the ruling is not extended to it and nothing here records it
  as decided.

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
- **Open wording** (not decided here): the room line's *corp/corpuri* count (the open half of Q31).

## Consequences

- The review's refusal is deterministic and single: a customer is shown the one thing they can fix first, and the
  next review shows the next.
- `describeReview` never prices and never measures a wall; both come from the same seams the rest of the app uses.
- The price bar's zero and the model's `NO_CABINET` disagree about a kitchen of appliances alone until backlog 126
  is decided.

## To be added at wave 8D's close

Wave 8D adds to **this record**, not a second one, what the screen settles: the routes (D1, Q2), which body a
group's *Editează* selects (D3), the view-only scene (D4), and where the two sentences stand on the screen (8D's
criteria 11 to 13).
