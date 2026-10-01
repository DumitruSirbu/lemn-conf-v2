# ADR 0091 — An instrument's premise may be re-quantified; the product claim inside it may not, and becomes a finding and a wave

Status: Accepted (adjudicates wave 6R's overflow-mark conflict; rewrites one criterion of
[ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)'s wave-6M guard; corrects a
claim in `selection-outline.ts`; **applies and does not weaken**
[ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decision 7;
**Amendment A, 2026-09-16 — decision 1's Q1/Q2 ordering is clarified for a premise falsified by a
*later* dated ruling, and that retirement is ruled to be a **move** of the invariant rather than a
widening in place; decisions 1–5 stand and nothing is struck**)
Date: 2026-09-06
Type: Finding + Decision
Milestone: M6 — rules wave 6R's tints, retires one instrument premise, and opens wave 6V

## Context

Wave 6R draws ADR 0071 decision 4's six PAL decors and decision 3's two veneer woods. Under ADR 0071
decision 2 the three PAL woods and the two veneer woods are **one texture at five tints** — `M.oak`'s
`oakTex`, multiplied by a declared hex — because a second wood generator is photoreal rendering and
is out of scope. The tints drafted are `pal.stejar-bardolino #d8b483`, `pal.stejar-halifax #b09272`,
`pal.nuc-warmia #8a5c3b`, `veneer.stejar #cba173`, `veneer.nuc #6f4630`.

Wave 6M shipped `packages/three-adapter/tests/qa-6m-mark-composite.adversarial.test.ts` on
2026-09-04 — the same day ADR 0071 was recorded. It composites ADR 0065's overflow wash
(`OVERFLOW_MARK_COLOR 0xb3001b` at `OVERFLOW_MARK_OPACITY 0.32`) over every surface colour the
kitchen could then put behind a marked front, sweeps a brightness model, and asserts the result never
lands inside the 60-unit Euclidean RGB ball around `SELECTION_HIGHLIGHT_COLOR 0xff2d2d` that
`apps/web/tests/e2e/support/pixels.ts` and `apps/web/tests/e2e/editor-rail.desktop.e2e.spec.ts` use
to count selection pixels. Its third block states the argument the file rests on: *"the argument that
saves this wave is 'the kitchen contains no such colour', not 'the composite is always far away'"* —
and anticipates this wave: *"A finish added inside this region is a product change that has to reckon
with the e2e's counter, and this is what says so."*

### What was measured for this record

Re-measured independently on 2026-09-06 against the guard's own model (per-channel multiply with
clamping at 255, factors 0.15 → 4.00 in steps of 0.05; the 0.32 wash over the lit base; Euclidean RGB
distance). The wood bases are `oakTex`'s two tones `#c08d51` and `#7b5527` multiplied by the tint,
which is what `buildFinishMaterial` does.

| Base behind the mark | Composite margin (**must exceed 60**) | Unmarked front's max `red − green` |
| --- | --- | --- |
| oak as it draws today (untinted) | **76.1** | 78 |
| `pal.stejar-bardolino #d8b483` | **59.8** | 108 |
| `pal.stejar-halifax #b09272` | **59.3** | 109 |
| `pal.nuc-warmia #8a5c3b` | **44.6** | 137 |
| `veneer.stejar #cba173` | **55.9** | 115 |
| `veneer.nuc #6f4630` | **43.0** | 137 |
| `pal.alb #eceeeb` / `pal.antracit` / `pal.gri-havanna` / paper / stage | 122.3 – 134.2 | ≤ 11 |
| a free colour `#ff2d2d` — the highlight's own hex | **25.1**, and **0.0 unmarked** | 210 |
| a free colour `#cc2222` | **25.1** | 212 |

**Five findings, in ascending order of what they settle.**

**1. All five woods fail, not two, and one of them fails by rounding.** The relayed table put
*Stejar Halifax* at 60.0 — exactly on the boundary. Measured here it is **59.31** composing the tint
in floating point and **59.61** rounding the tinted base to integers first. *Bardolino* is 59.80 /
59.86. **A criterion whose pass/fail is decided at 0.2 units by where a `Math.round` is placed is not
a criterion**, independently of which side it lands on today.

**2. Tuning cannot save it, and the reason is structural.** The tint multiplies, so every wood is
darker and more red-dominant than the untinted oak that measures 76.1. Clearing the ball needs
green/red ≥ ~0.87 — a near-neutral warm grey. **A walnut cannot be expressed at all inside the
guard**, and under ADR 0071's one-hex-per-decor rule (6R's own criterion, and ADR 0028's) the swatch
*is* the tint, so the loss would be visible in the one place the customer compares.

**3. The guard's premise is already false on `main`, before any tint is chosen.** ADR 0071 decision 3
rules MDF's control to be a RAL picker; ADR 0078 decision 1 rules its offer to be **every free colour
`FinishSchema` admits**, and refuses by name to narrow it to a table. `materialOffersFinish`
(`packages/configurator-domain/src/materials.ts:293`) returns `true` for every `free-colour` finish
on a `ral-picker` material, on `main`, today. **`#ff2d2d` is a storable, loadable, offered finish.**
What was still missing on `main` was only the adapter: `finishKeyOf` returned `undefined` for an
unrecognised free colour and the front stayed in the kit's own colour. **Wave 6R closes that gap** —
`finishDefinitionOf`'s free-colour arm paints `flatColour(finish.value)` over `M.door` — so as of this
wave a customer's front is painted the exact colour the selection counter is looking for. Unmarked,
that front sits at distance **0.0**. Marked, at **25.1**.

**4. Both of those two numbers are model-independent, and they are the load-bearing ones.** A front
painted `#ff2d2d` is at distance 0 by identity, and the 25.1 is one blend at a declared opacity. They
need no brightness sweep and no claim about ACES tone mapping. Everything the ruling below rests on
survives the guard's lighting model being crude — which it is: per-channel multiply-and-clamp
desaturates nothing, where ACES desaturates highlights, so the wood rows above are the model's
numbers and not the renderer's.

**5. All three of `pixels.ts`'s counters carry the same premise, and one of them is already breached
on `main`.** The premise is stated three times, once per `PixelTest` kind:

| Counter | Its recorded premise | Status |
| --- | --- | --- |
| `near` (selection) | `selection-outline.ts`: *"it must contrast against everything this kitchen can put behind it: … the five §5.5 finishes"* | **False after 6R.** `#ff2d2d` is offered. |
| `blueTint` (void fill) | *"The kitchen's palette is warm throughout … so nothing in it but the void meshes reads blue"* | **False after 6R.** `#2d5fff` measures blue-over-red 210 against a threshold of 25. |
| `redTint` (the mark) | *"Red over green **and** blue is what only the mark is"* | **Already false on `main`.** In the guard's own model an **unmarked oak front** reaches red-excess **78** against `MARK_MIN_RED_EXCESS` of 50, and `finish-oak` is a chip that ships today. |

`redTint` is the one the wave-6M guard never tested — it has a `near` block and a `blueTint` block and
no `redTint` block — which is why a breach that predates 6R has gone unrecorded until now.

**6. The e2e's own measurements are not wrong, and nothing red exists today.** Both pixel-counting
specs load `/configurator/configure` and never touch the finish control. The seeded design
(`kitchen-l-design.ts`) writes **no `finish` key on any placement**, so every front renders in
`M.door`'s own `#eceeeb` — which is `pal.alb`'s row above, at a margin of 128.5. The e2e's *"zero
pixels clear 50 in any camera preset"* is a true and correctly measured fact **about the fixture**,
and the guard universally-quantified it into a fact about the palette.

### Classification

**A contract gap, not an implementation defect and not a test-fidelity problem in 6R.** Nothing in
wave 6R is wrong: the tints are a correct reading of ADR 0071, and the free-colour arm is a correct
reading of ADR 0078. Nothing in wave 6M was wrong when it shipped: its premise was true of the
adapter as it then drew. **Nothing was ever written down saying that three e2e counters depend on the
kitchen's palette being closed and warm**, so ADR 0071 decision 3 and ADR 0078 decision 1 opened the
colour space without anyone being in a position to notice that they were retiring an instrument. That
absence is the gap, and this record closes it.

The instrument breakage that follows from the gap **is** a test-fidelity problem, and it is wave 6V's.
The lost contrast guarantee on the selection highlight is a **product** finding, and it is also
wave 6V's.

## Decision

### 1. The general rule, stated so the next wave applies it without re-litigation

ADR 0090 decision 7 stands unamended and is not narrowed by anything here:

> **An invariant edited to accommodate a defect is the defect laundered.**

There **is** a principled distinction between *"the defect made the test fail"* and *"the product
outgrew the test's premise"*, and it is not a matter of which story the implementer tells. It is
three questions, asked in order, each answerable by reading code rather than by argument. **An
assertion may be rewritten only if all three are answered as below; failing any one of them, ADR 0090
decision 7 binds and the assertion goes green unchanged or the change does not land.**

**Q1 — Whose claim is it? Delete the assertion in your head: does any customer-visible or
contract-level fact change?**
If yes, it is an **invariant** and this decision gives no licence at all. If no — if what changes is
only the *credibility of a measurement* — it is an **instrument premise**, and Q2 applies. The 6M
guard's `KITCHEN_PALETTE` sweep is an instrument premise: no customer sees it, no document is refused
by it, no geometry moves. `selection-outline.ts`'s contrast sentence, sitting a file away and saying
the same thing, is **not** — see decision 2.

**Q2 — Is the premise still satisfiable by any product state the owner has ruled in?**
The falsifying fact must be **recorded and ruled**, never merely implemented. A premise that is false
because of a wave's code is a defect and Q2 fails. A premise that is false because of a dated
owner-ruled decision has been **retired by the product**, and the assertion is not a criterion the
product can pass or fail — it is a false statement about the product. This is the mirror of ADR 0085
decision 6: *a criterion no test can fail is not a criterion*; equally, **a criterion no permitted
product state can satisfy is not a criterion**. Here the falsifying facts are ADR 0071 decision 3
(owner-ruled, 2026-09-04) and ADR 0078 decision 1, both dated **before** the wave that trips over
them.

**Q3 — Does the rewrite preserve everything still true, and convert what became false into a live
obligation?**
A rewritten instrument premise must do all three of:

- **assert the surviving true statement over a narrower, derived quantifier** — narrowed to what the
  instrument actually runs against, and **derived from the fixture rather than restated beside it**,
  so it cannot silently widen (ADR 0028; the guard's own `oakWoodColors()` already reads
  `kitchen-parts.ts` rather than copying it);
- **assert the negation of the retired premise, positively and by measurement** — the breach is
  pinned as a *fact*, with its witness, so the day someone narrows the product back the test goes red
  and the question is re-opened deliberately;
- **carry the obligation forward as a named wave**, not as a comment and not as a TODO.

**A rewrite that only performs the first of those three is the laundering ADR 0090 decision 7
forbids, whatever its justification.** That is precisely why option 2 as first framed — *"assert the
surviving true statement, plus a pinned statement that the counters owe a fix"* — was correctly
escalated rather than acted on: it is admissible only once the second and third limbs are mandatory,
and they now are.

**The corollary that catches the hard case.** When an instrument premise turns out to *also* be a
product claim — the same sentence doing two jobs, which is how the 6M guard and
`selection-outline.ts` came to say the same thing — **the two are separated and only the instrument
half is re-quantified. The product half is never weakened; it is promoted to a finding and a wave.**
Q1 is asked of each half separately.

### 2. Option 1 — near-neutral tints — is refused by name

Not because it is unnecessary, though it is: it buys nothing, since the RAL picker breaches the
premise regardless (finding 3) and 6R is the wave that makes a free colour reach the framebuffer.
It is refused on a stronger ground, stated so it binds beyond this instance:

> **A test instrument gets no vote on what the product looks like.**

ADR 0071 decision 2 rules that colour exists so a customer can picture the kitchen. A *Nuc* and a
*Nuc Warmia Maro* tuned to a near-neutral warm grey stop reading as walnut on the swatch and in the
3D, which fails decision 2 at the exact point of comparison, in order to protect a pixel counter that
would still be wrong afterwards. That is the product deformed to fit the apparatus. **The five tints
land as drafted** — `#d8b483`, `#b09272`, `#8a5c3b`, `#cba173`, `#6f4630` — and no colour in this
product is ever chosen for a counter's benefit.

### 3. Option 3 — fix the counters inside 6R — is refused, and the reason is not effort

`pixels.ts` and both pixel-counting e2e specs are **evidence infrastructure for a visual gate that
6R itself must pass**. Rewriting a counter in the same diff whose only evidence is that counter's
output is the arrangement ADR 0028 exists against and ADR 0070's own tables were kept out of: a
declaration and its first consumer in one commit, agreeing by luck. 6R's visual gate must be read
through the instrument as it stands today, on a fixture the instrument is still valid for
(finding 6), and the replacement instrument must be built against a fixture that deliberately breaks
the old one — which cannot be the seeded design 6R is being judged on.

The e2e gate also runs only on a runner. Compounding an instrument rewrite with 6R's own screen
verification puts two unverified things behind one green tick.

### 4. Wave 6R takes option 2, in the strengthened form decision 1 requires

`qa-6m-mark-composite.adversarial.test.ts` keeps its filename — the history is worth more than the
tidier name — and gains a dated header naming this record. Its three blocks are rewritten as follows,
and **no other test in the wave is touched**.

**4a. The two sweeping blocks survive, re-quantified onto the fixture and derived from it.**
`KITCHEN_PALETTE` today reads `FINISH_COLORS`, which 6R deletes, so the block does not compile as
written regardless. It becomes **the finishes the pixel-counting e2e specs actually put on screen**:
the seeded design's placements (which carry **no** `finish` key — this is the non-obvious fact and it
must be asserted, not assumed), `M.door`'s own `#eceeeb`, and the paper and stage greys. Derived by
reading `kitchen-l-design.ts` and `kitchen-parts.ts`, the way `oakWoodColors()` already reads a hex
out of source rather than repeating it. **A fixture that starts wearing a finish makes this block go
red**, which is the point: the instrument's validity is a fact about the fixture and now says so.

The margin figure is re-pinned to what this narrower sweep measures — **128.5**, not 76.1 — and the
`toBe(76.1)` line goes with the palette it belonged to.

**4b. The third block is not softened. It is inverted and asserted.**
*"The base colours that would break the count, and why the kitchen has none"* becomes **"the base
colours that break the count, and the control that reaches them"**. The cube sweep and its two bounds
(`leastSaturated` 102, `palestRed` 204 — both reproduced here) stay exactly as they are; they are
true and they are the map of the region. What replaces the final `warmestInTheKitchen` comparison is
the **positive** assertion, with named witnesses:

- `freeColourFinish("#ff2d2d")` is **offered** by the MDF material — asserted through
  `materialOffersFinish`, not asserted about it — and its rendered front is at distance **0.0**
  from `SELECTION_HIGHLIGHT_COLOR`, so it is counted as selection pixels while nothing is selected.
- The same finish under the overflow wash is at **25.1**, inside the ball.
- Every one of the five declared woods is inside the ball under the wash: the five margins in the
  table above, **asserted as a set with each entry named**, rather than as a single minimum. A
  minimum hides which decor moved.
- **`redTint`'s breach is added, since it has never been covered**: an unmarked oak-family front
  reaches a red-excess above `MARK_MIN_RED_EXCESS`'s 50 in this model.

Each is pinned to a rounded value with a stated tolerance rather than to an exact float, because
finding 1 is what happens otherwise.

**4c. The file states, in one paragraph, that these counters are unfit for an open palette and that
wave 6V replaces them.** Not a TODO; a named wave, which decision 6 opens.

**4d. What this rewrite does not do.** It does not relax a threshold, widen a ball, delete an
assertion, skip a test, or mark one `it.fails`. Every number it stops asserting is replaced by a
number it starts asserting, and the file after the rewrite makes **more** falsifiable claims than
before, over a **smaller** quantifier plus an explicit breach set. Measured against decision 1's Q3,
all three limbs are discharged in the same diff.

### 5. Two false comments in production code are corrected in 6R, and only the comments

Following ADR 0085 decision 6's own precedent — *the ordering stays in the code; its commentary does
not, because a false comment at a seam this delicate is a trap for the next reader*:

- **`selection-outline.ts`'s `SELECTION_HIGHLIGHT_COLOR` doc comment.** Its list of *"everything this
  kitchen can put behind it"* is the five superseded enum finishes, and its conclusion — *"a colour
  with a near-zero green and blue is the one hue in the scene that cannot be confused with the
  kitchen itself. That is also what makes it countable in a pixel test"* — is false in both halves
  after 6R. It is rewritten to say what is true: the constant is chosen for contrast against the
  **declared palette**, a free colour can equal it, the guarantee that it is *countable* has been
  retired, and wave 6V owns both. **The constant `0xff2d2d` does not move** — nothing here is a
  reason to repaint a shipped affordance, and moving it would only relocate the same hole.
- **`pixels.ts`'s three `PixelTest` doc comments**, each of which asserts palette closure
  (finding 5). Marked with what is now true and pointed at 6V. **No counter's behaviour changes in
  6R** — changing one is decision 3's refusal.

This is comment text only: no constant, no threshold, no predicate, no export.

### 6. Wave 6V is opened, and it owns both halves

Named here rather than left to be re-derived. Its plan is at the end of this record, ready to be
pasted into `docs/milestones/M6-price-and-global-settings.md` by whoever holds that file.

### 7. What does not change

- **ADR 0090 decision 7 is unamended and is applied, not narrowed.** Decision 1's three questions are
  a test for *which rule applies*, never a way out of it. Q1 answered "invariant" means 0090 decision
  7 binds with full force; Q2 answered "false because of a wave's code" means the same.
- **ADR 0071 decisions 2, 3 and 4 are untouched.** The picker stays open; the six decors and two
  woods stay as declared; photoreal rendering stays out of scope.
- **ADR 0078 decision 1 is untouched.** MDF's offer is not narrowed to a table, and this record adds
  no reason to reconsider that: the remedy is a better instrument, never a smaller product.
- **ADR 0065's mark is untouched.** `OVERFLOW_MARK_COLOR` and `OVERFLOW_MARK_OPACITY` do not move.
  A customer distinguishes the wash from the selection outline **by form** — an area fill against a
  4 px traced frame — which is a distinction the counters cannot make and a human does not need to.
  That asymmetry is the whole finding and it is not a reason to repaint the mark.
- **No schema change, no `CURRENT_SCHEMA_VERSION` bump, no migration, no severity-table change.**
  Nothing stored moves and no document's validity changes.
- **6R's own scope is otherwise exactly as planned**, including ADR 0082's settings-strip addition.
  The rewrite in decision 4 is one test file; decision 5 is comment text in two.

## Alternatives considered

| Option | Why not |
| --- | --- |
| **Near-neutral tints (option 1).** | Decision 2. It deforms the product for an instrument, and the instrument stays broken anyway because the picker reaches the region (finding 3). |
| **Fix the counters inside 6R (option 3).** | Decision 3. A counter rewritten in the diff its own output is the evidence for; plus two unverified things behind one runner-only green tick. |
| **Option 2 as first framed** — assert the surviving true statement, plus a pinned note that a fix is owed. | This is the shape ADR 0090 decision 7 forbids, and the escalation that refused to act on it unilaterally was correct. It becomes admissible only with decision 1's second and third limbs made mandatory: the breach asserted positively, and the obligation carried by a named wave rather than by prose. |
| **Delete the 6M guard.** | It is the only artefact that says the mark and the highlight are close in colour space at all, and its cube sweep is the map of the offending region wave 6V needs. Deleting it converts a known, measured hole into an unknown one. |
| **Narrow MDF's offer to a RAL table that excludes the offending region.** | Overturns ADR 0078 decision 1, which refused exactly this and named the cost: a table nobody has authored, and a load seam that resets colours a customer picked. It also solves nothing structurally — the void counter's blue and the mark counter's red are breached by different regions, so the table would have to exclude three, and the next affordance colour would add a fourth. **A product narrowed to keep a measurement valid is the same failure as decision 2's, one seam further out.** |
| **Move `SELECTION_HIGHLIGHT_COLOR` to a hue outside the picker's reach.** | There is no such hue: the picker admits every six-digit hex, so every colour is reachable. It would move the hole, not close it. |
| **Widen `HIGHLIGHT_TOLERANCE` or drop it toward equality.** | The tolerance exists because the renderer antialiases every edge (`pixels.ts`' own note), and `Buffer.compare` passing on one pixel is the defect the counters were built to replace. Tightening re-opens it; widening makes the overlap worse. The parameter is not where the problem is. |
| **Assert the guard over the whole `FinishSchema` colour space and accept it red until 6V.** | A permanently red suite is a suite nobody reads, and the project's gate is `pnpm ci:local` green. The breach is pinned as a *passing* assertion about a reachable state instead, which fails the day the state stops being reachable — the direction that actually wants noticing. |

## Records swept before deciding, and how each is settled

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decision 7 | An invariant edited to accommodate a defect is the defect laundered; it binds the architect at least as hard as the implementer | **Applied and unamended.** Decision 1 is a test for when it applies, not an exception to it. Its own closing note — that the rule caught a wrong architectural ruling — is why the three questions are answerable by reading code rather than by intent. |
| [0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) decision 6 | A criterion no test can fail is not a criterion; it is withdrawn *as stated* and replaced by two that can fail | **The direct precedent, mirrored.** This record adds the symmetric case: a criterion no permitted product state can satisfy is not a criterion either. The remedy is the same shape — withdraw as stated, replace with strictly more falsifiable claims in the same diff. |
| [0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) decision 3 | Room-relevance is observed, never declared; a hand-list is silent about what it was never shown | **Honoured in decision 4a.** The fixture's finish set is *derived from the fixture*, never declared beside it, for the same reason. |
| [0071](0071-material-carries-price-colour-carries-a-different-control-per-material.md) decisions 2 and 3 | Colour exists so a customer can picture the kitchen; MDF's control is a RAL picker | **Untouched, and both are load-bearing.** Decision 2 refuses option 1; decision 3 is half of why the premise is unsatisfiable. |
| [0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md) decision 1 | MDF offers every free colour `FinishSchema` admits; narrowing the offer to a table is refused | **Untouched, and it is the other half.** Re-narrowing it is refused again above, on a second and independent ground. |
| [0078](0078-a-materials-offer-is-its-controls-shape-and-the-load-seam-resolves-before-it-validates.md) decision 4 | Forbidden: constructing a free colour from a palette entry's swatch hex | **Not engaged and not weakened.** Decision 4b's witnesses are free colours the *picker* reaches, never a decor mapped onto one. |
| [0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) | A body past the end of its wall is marked, not moved | **Untouched.** The mark's colour, opacity and meaning are unchanged; only what may be *said* about how it composites changes. |
| [0028](0028-wall-depth-is-derived-from-the-worktop.md) | Declare, do not compute; two lists that agree by luck is the failure | **Applied twice.** It forces 4a's derivation from the fixture, and it is 6R's own reason for one hex per decor — which is what makes option 1 a swatch change and not only a 3D change. |
| [0057](0057-a-material-change-resets-an-unavailable-finish.md) | A material that does not offer a finish resets it, with the warning before the apply | **Not engaged.** No offer changes here. |
| `docs/best-practices/product-invariants.md` | A visual change must keep its stated structural dependencies; prefer the reference as evidence over a visual guess | **Honoured.** No geometry moves, no builder is touched, and the M1 fidelity gate is not reached — `finishes.ts` colours materials only. |
| `docs/best-practices/browser-and-visual-qa.md` | A screenshot is evidence only after it has been inspected | **The reason decision 3 refuses to rewrite the counters in 6R.** The counters *are* the inspection. |

## Consequences

- **Wave 6R lands its five tints unchanged and is not blocked.** Its diff grows by one rewritten test
  file and two comment corrections.
- **The project now has a written rule for the case that had none**, and it is checkable in three
  questions rather than argued each time. The next wave that outgrows a test premise applies decision
  1 and records the result; the next wave that *breaks* one still meets ADR 0090 decision 7 unchanged.
- **The e2e gate stays green and stays honest.** Both pixel-counting specs continue to measure a
  fixture their counters are valid for, and the guard now asserts *that this is why*, instead of
  asserting a property of the palette that has stopped being true.
- **A live product defect is on record and owned.** A customer who paints an MDF kitchen `#ff2d2d`
  loses the selection outline on their own cabinets — the affordance
  `DEVELOPMENT-SPEC.md` §6.1 requires (*"the customer can see, without reading anything, which cabinet
  is being edited"*) and M2's mobile gate re-states. **It is reachable only after 6R ships the
  picker**, and it is wave 6V's first item. It is a narrow band of colours, it is self-inflicted and
  visible, and it does not corrupt a document — which is why it is a wave and not a stop-ship.
- **`redTint`'s pre-existing breach is recorded rather than discovered again.** It has been latent
  since M1 and is invisible only because no pixel-counting spec picks a wood.
- **The manufacturer price dashboard (ADR 0062) is untouched**; no seam here is one of its.

---

## Wave 6V — a selection is counted by what changed, not by what colour it is

**To be pasted into `docs/milestones/M6-price-and-global-settings.md` after wave 6U.** It is written
here because 6R holds the milestone file at the time of writing.

**Tier: Test infrastructure + one product fix. Runner-only evidence.**

**Goal.** Retire the colour-identity premise from all three pixel counters and replace it with a
measurement that survives an open palette, then close the selection-contrast hole the open palette
opened. **Gates on 6R** — the free-colour arm and the woods must be on screen before the replacement
instrument can be shown to work.

**Why it is its own wave.** ADR 0091 decisions 3 and 6. A counter cannot be rewritten in the diff its
own output is the evidence for, and the replacement must be demonstrated against a fixture that
deliberately breaks the old one, which is not the fixture 6R is judged on.

**Touches.** `apps/web/tests/e2e/support/pixels.ts`,
`apps/web/tests/e2e/editor-rail.desktop.e2e.spec.ts`, `apps/web/tests/e2e/overflow-mark.e2e.spec.ts`,
`packages/three-adapter/tests/qa-6m-mark-composite.adversarial.test.ts`, and — for item 1 —
`packages/three-adapter/src/selection-outline.ts`. **No domain file, no schema, no builder.**

**Work item 1 — the selection outline stays visible against a colour equal to it.** The product half,
and it is first because the instrument cannot measure what the product does not do. The remedy is
**not** a new constant a customer can also pick: the direction on record is that the outline
distinguishes itself by something the front cannot equal — a second contrasting pass, a luminance
inversion against the surface it traces, or a dashed rhythm the fronts have no equivalent of. The
wave chooses and records which; the **acceptance criterion is stated without naming a mechanism**, so
the choice can be made against a real render.

**Work item 2 — the counters measure a difference, not a colour.** `editor-rail.desktop.e2e.spec.ts`
already captures the same patch selected and unselected and its own comment says *"the camera and the
design are identical and the selection frame is the only difference"*. **That is the measurement, and
it is being thrown away in favour of a colour match.** A differencing counter — pixels whose value
changed by more than a noise floor between two otherwise identical captures — is immune to the base
palette by construction, because the customer's colour is in both frames. The same applies to the
void fill and to the overflow mark: each is a state the design can be toggled into and out of.

**Work item 3 — what remains colour-keyed declares its fixture.** Any counter that still names a
colour states, as an executable assertion, the fixture property that makes it valid — the shape
ADR 0091 decision 4a puts into the 6M guard, applied at the e2e seam.

**Acceptance criteria.**

- **The replacement counter is demonstrated on a fixture that breaks the old one.** A design wearing
  `freeColourFinish("#ff2d2d")` on the body under test: the old `near` counter reports a large count
  with **nothing selected** (recorded as the witness), and the new counter reports under
  `MAX_ABSENT_PIXELS`. **A wave that only shows the new counter working on the seeded design has not
  demonstrated anything** — the seeded design never broke the old one.
- **Symmetrically for the other two.** A body wearing `veneer.nuc` breaks `redTint`; a body wearing a
  blue free colour breaks `blueTint`. Both are witnessed before and after.
- **The positive counts do not collapse.** The selected/unselected/void counts stay above their
  measured floors on the seeded design at 1440 × 900 in the overview preset — the same four-row table
  `editor-rail.desktop.e2e.spec.ts` records — so the new instrument is shown to be at least as
  sensitive as the one it replaces, not merely more robust. Any threshold that moves is re-measured
  and re-tabulated in place, with the reason.
- **A selection outline is visible on a front painted the highlight's own colour.** Item 1's criterion,
  mechanism-free: with the body selected and its front at `#ff2d2d`, the outline is distinguishable
  from the front in a captured render, **inspected** per `docs/best-practices/browser-and-visual-qa.md`,
  and countable by the item-2 counter. Swept over at least the highlight's exact hex, a near
  neighbour (`#cc2222`), and one wood.
- **The mark and the selection remain distinguishable to the counters on a walnut kitchen.** With a
  `veneer.nuc` front marked and a *different* body selected, the mark's count and the selection's
  count are each attributed to the right body. This is the case whose composite margin is 43.0 and
  the one the 6M guard's rewrite pins as a known breach — it is what makes 6V's success checkable.
- **The 6M guard's decision-4b breach block goes green throughout and is not edited by this wave.**
  The breach is a fact about the colour space; 6V changes the instrument, not the geometry of the
  ball. **If a work item requires that block to change, the wave stops and asks** — that is the
  laundering ADR 0090 decision 7 forbids, arriving one wave later.
- **The three false `PixelTest` comments are replaced by true ones**, and no counter keeps a premise
  it does not assert.
- **Runner evidence, not local.** Both pixel-counting specs are desktop-gated and the whole e2e gate
  is a runner artefact; the close-out names the run.

**Risks.**

- **The differencing counter is sensitive to any non-selection change between the two captures** —
  a hover state, a tooltip, an animation still settling, a re-render at a different tone-mapped
  exposure. The noise floor is a measured number on the real render at all three camera presets, not
  a chosen one, and the wave records the floor beside the counts.
- **Item 1 can grow.** If the chosen remedy needs a shader or a second render pass it has left this
  wave's tier; the fallback that stays in scope is a second contrasting outline pass, which
  `selection-outline.ts` already has the machinery for (`OCCLUDED_OUTLINE_OPACITY`'s pass is one).
- **Item 1 must not reach a geometry builder.** M1's fidelity gate is not this wave's to re-baseline.

## Amendment A, 2026-09-16 — a premise falsified by a *later* dated ruling is **retired by moving the invariant**, not by widening the clause in place

**Nothing above is struck. Decisions 1–5 stand unchanged.** This amendment answers a question
decision 1 left ambiguous, raised by M7 wave 7D4 slice S2 (`9daf757`) and adjudicated at the M7
milestone's criterion-13 note of the same date.

**The ambiguity.** Decision 1 asks Q1 first — *"does any customer-visible or contract-level fact
change?"* — and rules that a **yes** gives *"no licence at all"*. Q2 then distinguishes a premise
falsified **by a wave's code** (a defect) from one falsified **by a dated owner ruling** (retired by
the product). Read in order, Q1's *no licence* fires before Q2 is reached, so a **product claim**
retired by a later ruling has no admissible repair at all: the assertion is false, it cannot be
edited, and a red suite fails the wave. Every M6 case decision 1 was written against had an
instrument premise on one side, so the ordering never bound. **7D4 is the first case where the
falsified clause is a product claim and the falsifying fact is a dated ruling** (ADR 0110 Amendment
H1 / 7D4 D15.7: the first storage slot after the hob in the reading order takes the drawer body).

### A.1 Q1 is about *why the clause would be edited*, not about which half of the tree it sits in

Q1's *no licence at all* binds an assertion rewritten **so that the product's current behaviour
passes**. It does not bind an assertion that a **dated ruling has made a false statement about the
product** — that is Q2's second arm, and decision 1 already names its consequence: *"the assertion
is not a criterion the product can pass or fail — it is a false statement about the product."*

**So Q1 and Q2 are asked together when the falsifying fact is a dated ruling that post-dates the
assertion.** A **yes** at Q1 does not end the inquiry in that case; it raises the bar at Q3, per A.2.
A **yes** at Q1 still ends the inquiry when the falsifying fact is a wave's code, which is every case
decision 1 decided and is unchanged.

### A.2 The retirement is a **move**, and widening in place is the form that must be justified

A product claim is never simply relaxed. When a later ruling retires it, decision 1 Q3's three limbs
are read as follows, and all three still bind:

1. **The surviving true statement** stays asserted where it stood.
2. **The negation of the retired premise, positively and by measurement**, is asserted **in the suite
   that owns the new rule**, in the **same commit**, and **at least as strongly as the clause it
   replaces**. This is the limb that does the work: the invariant is *relocated*, not dropped.
3. **Any residue is a named wave**, not a comment.

Then, in the earlier wave's file, the retired clause is **deleted, or widened only with a comment
naming the file and line where the invariant now lives.** **Widening without that pointer is
inadmissible**, and the reason is the failure family this project keeps paying for: a widened clause
reads as an authority for the property it names while being unable to distinguish it. 7D4's is the
type specimen — `expect([DOOR_BASE_BUILD_ID, THREE_DRAWER_BASE_BUILD_ID]).toContain(base.buildId)`
passes whether **one** slot takes the drawer or **every** slot does, which is the whole of what the
ruling decided. It is admissible only because limb 2 was discharged:
`packages/configurator-domain/tests/generation/drawer-rows.test.ts:316-328` asserts set equality
between the drawer slots found and `slotsAfterTheHob(plan).slice(0, 1)` over the swept plans, so both
*too many* and *too few* go red.

**Deletion is the default and widening is the exception**, because a widened duplicate of an
assertion that already lives elsewhere is the second authority
[ADR 0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
decision 2 refuses. Widening earns its place only when the two clauses are **derived differently** —
7D4's are (`declared.band !== "column"` off the catalogue here, `isCycleStorageSlot` there), which is
a real cross-check of the word D12 showed has two referents, and is why the shipped form is judged
admissible rather than merely tolerated.

> **Two corrections at 7D4's close-out, 2026-09-16. Nothing above is struck.**
>
> **The predicate ships as `isComposedStorageSlot`.** `6456a3b`, the wave's last commit, renamed it
> after this amendment was written at `8be7d9a`; `isCycleStorageSlot` exists nowhere under
> `packages/`. **Source-verified at HEAD.** The cited line range is unaffected —
> `drawer-rows.test.ts:316-328` is still the set-equality assertion limb 2 requires.
>
> **The type specimen does not yet meet this amendment, and saying so is the point of writing one.**
> The widened clause shipped **with no comment naming where the invariant went**: the note at
> `qa-7d3-tall-end-block.adversarial.test.ts:221-226` explains *why* the clause widened and names no
> file or line. **Source-verified at HEAD.** Limb 2 is discharged — the invariant really is asserted
> in `drawer-rows.test.ts` — so this is the pointer and not the assertion that is missing, which is
> exactly the state *"widening without that pointer is inadmissible"* forbids. **The comment-only fix
> is owed by wave 7D5's first slice** and is recorded in the M7 milestone's 7D4 close-out.

### A.3 A plan's must-not may not forbid what the same plan's behaviour requires

**A must-not that a wave's own correct, ruled behaviour forces a breach of is a defect in the plan,
not in the implementer.** 7D4's criterion 13 forbade editing any 7D3 assertion while criteria 1, 6
and 7 — and the criteria section's own preamble, which calls a clause denying a post-hob drawer *"a
defect in the tests, not in the composer"* — required behaviour that makes one of those assertions
false. The implementer could not satisfy both.

**The obligation this leaves on a planner** is discharged when the criterion is written, not after:
a criterion that freezes an **earlier** wave's assertions names, in the same breath, **which of them
this wave's declared behaviour is expected to falsify, and where each one's invariant is to land.**
An unqualified freeze is only correct for a wave that changes no observable output.

**The obligation it leaves on an implementer is unchanged and was not met here:** an edit to another
wave's assertion is **reported in the implementer's own summary, file by file**, whether or not the
edit was forced. The 7D4 S2 summary listed **two** changed files where the diff touched **five**, and
the two adversarial edits were found by the coordinator's diff read instead — `docs/WORKFLOW.md`'s
*Trust but verify* working as designed, and the only thing that stood between a weakened adversarial
clause and no record of it anywhere.

**Trigger for revisiting this amendment** (ADR 0118's shape): a wave in which limb 2 has **no** suite
to land in, because the ruling that retires the old claim also leaves the new one unasserted. Nothing
in M7 is in that position — 7D5 inherits exactly this shape and has `drawer-rows.test.ts` and its
successors to land in — and nothing is built for it.
