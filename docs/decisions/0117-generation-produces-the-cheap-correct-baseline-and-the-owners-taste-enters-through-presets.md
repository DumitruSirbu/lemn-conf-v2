# ADR 0117 — Generation produces a correct, cheap baseline, and the owner's taste enters through presets

Status: Accepted (owner ruling, 2026-09-14, verbatim; the scope, the prohibitions and the
unclear-boundary section are the architect's adjudication and are marked as such)
Date: 2026-09-14
Type: Decision (owner ruling + adjudication)
Milestone: M7 — cited by waves 7B, 7C, 7P1, 7P2 and 7G (matching, authoring, thumbnail) and binding
on every generation wave from 7D3 onward (architect's plan, `docs/milestones/M7-room-and-presets.md`)

**Pointer, 2026-10-01 — *"no top row"* (`:283`) is superseded for generation** by the owner's Q4 selection,
*"Generate a top row"*; wave C3 S1 built it (`02b1c7b`): [ADR 0110 Amendment O](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-o--2026-10-01-a-fixed-corner-wall-unit-stands-over-every-generated-corner-the-top-row-the-validators-banded-reach-and-the-fridge-gap-absorb),
O9. The baseline is dearer by one top cabinet per upper and hood. Nothing here is struck.

**Pointer, 2026-10-01 — narrowed for one unit.** The owner's Q2 instruction (M7C) puts a new, priced,
structural corner wall unit into every generated kitchen with a corner, which departs from
*"new bodies wait for beta"* (ADR 0110 E12.4) for that unit only; see
[ADR 0110 Amendment O](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-o--2026-10-01-a-fixed-corner-wall-unit-stands-over-every-generated-corner-the-top-row-the-validators-banded-reach-and-the-fridge-gap-absorb),
O3 and O7. The baseline is dearer by the unit's lines per corner. Nothing here is struck.

**Pointer, 2026-09-15 — its sibling.**
[ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)
records the owner's preference that a problem which has not occurred is **recorded with its trigger
and not built for**. The two are siblings and neither contains the other: **this record says where a
product decision belongs — the generator's or a preset's; 0118 says when engineering work belongs —
now or at a named trigger.** A wave asking *"is this correctness or is this taste?"* (decision 5
here) often has a second question behind it: *"and has the problem occurred at all?"*

**Pointer, 2026-09-29 — the preset half is past M8.**
[ADR 0131](0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md)
records that the preset waves this record cites (7B, 7C, 7P1, 7P2, 7G, and 7F3's list) are deferred
past M8. Until they return, the generation half of this record is the only one that is live, and
every design Step 1 creates is generation's baseline. The division of labour ruled here is unchanged.

## Context

Two records already exist either side of this one and neither states it.
[ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
rules **how generation composes** — the command path, the shell, the reading order, the tall block.
[ADR 0109](0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md)
and [ADR 0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md) rule
**what a preset is** — a recipe document, a row, owner-authored, matched within ±600 mm. **Nothing
rules which decisions belong to which**, and the question arrives in every generation wave.

**The owner stated the rule in operational form on 2026-09-14, verbatim**, at the end of a day in
which they had narrowed the wall-cabinet question three times:

> *"After you'll generate, I will play with the generated kitchens. And when… where I will think that
> it fits to have a lift cabinet, I will add it, and we'll save it as a preset, and you will load the
> preset. And the preset when we'll be able to… when the walls will have a preset, we will load the
> presets, and it will include this. But by default, let you doors. Doors only."*

**The loop is not new on 2026-09-14, and that matters.** The same four steps are the founding
quotation of ADR 0112, given by the owner on **2026-09-11** as their answer to the M7 plan's Q4:

> *"c) you start to generate a preset (we don't have now presets) d) I make adjustments and save the
> preset e) later if I insert nearly similar walls confioguration and width +- 600 mm, you show me the
> preset so I am able to choose it"*

ADR 0112 read that as a **feature request** — a save button, a gate, a table — and built it. What
2026-09-14 adds is that the same loop is also a **rule about where decisions live**: the owner used it
to *decline* a generator rule. **That reading is the architect's**, and the evidence for it is the
lift's four-step sequence below, which is the owner's own.

### The lift cabinet, in four steps, all on 2026-09-14 — the principle's spine

This is recorded step by step because **the endpoint on its own looks like a change of mind and is
not one.** Each step is the owner's.

1. **Described, with proportions.** Asked about the wall level, the owner opened with *"It is hard to
   make a rule"*, said Moldovan kitchens are *"very often… only door cabinets"*, and gave
   *"Twenty, thirty percent of the cases, it's lifted cabinets. And given less than five percents,
   we'll have open shelves cabinets."* They also gave a **placement reason** for a lift — *"I place
   the plates on the top of the sink… I wash and put it on top of the sink in this lift door
   cabinet above the sink"* (M7 plan R7, R8). The plan composed exactly one lift, above the sink,
   and refused to derive anything from the percentages.
2. **The proportion admitted as an impression.** Asked whether 20–30 % was observed:
   *"20-30% was a rough impression, not measured, clear statistic, maybe you can search the Internet.
   is just my impression. my guess, I guess like this."* **So the band was never a measurement and
   nothing was ever a target.**
3. **Priced, and ruled out.** Unprompted: *"and lift is above the hob. And under it, in that cabinet,
   is the… how it's named. under it is incorporated hood. lift mechanism are very expensive. So for
   sure the default will be the doors."* Offered a lift only at the hood, no lifts at all, or lifts at
   both hob and sink, **they chose no lifts at all** (M7 plan D8; *recorded from the coordinator's
   relay for the three options offered, verbatim for the quotation*).
4. **Relocated, not abandoned.** The quotation at the head of this record: the lift is added by hand
   to a generated kitchen and saved as a preset.

**Read forward, step 4 explains steps 1–3 and the reversal stops being one.** A description became an
admitted impression, became a priced refusal, became a statement of where the decision actually
belongs. **The architect's reading: the lift was a judgement call throughout, and the owner was
locating it rather than changing their mind about it.**

### Four earlier refusals the principle explains retrospectively

Each was argued on its own merits and each was right; **they had no common reason until now.** *(The
grouping is the architect's; each underlying ruling is the owner's and stands on its own record.)*

| Refusal | Argued on | Where |
| --- | --- | --- |
| `open-shelf` is never generated | Regional habit — *"Having open shelves, it's pretty rare, especially here in Moldova"*, under 5 % | M7 plan R9 / D8 |
| No corner mechanism by default | Cost — *"it can have mechanisms but those mechanisms are very expensive"* | M7 plan, *The corner* |
| The generated fridge stays `fridge-free`; no `tall-fridge-housing` | Cost and the minimum kitchen; the owner was offered the opposite reading and did not take it | ADR 0110 **QT-1** *(relayed, not verbatim)* |
| Doors-only uppers; no `wall-lift` | Cost, after an impression was admitted | M7 plan D8 |

**A fifth, in a different register and the same shape:** the top row stays uncomposed, and the owner's
reason was *"let's stick to what we have now. Get some feedback. And after that, we can make them
higher"* (ADR 0110 **E11**). A sixth: new catalogue rows wait — *"adding new cabinets will be like
after having the beta testing"* (ADR 0110 **E12.4**). Both are deferrals of a judgement to a later
source of evidence rather than to a preset, and they are listed here because a reader looking for
*why is the generator so plain?* must find all of them in one place.

## Decision

**1. Generation is responsible for a kitchen that is correct, complete and cheap — and for nothing
else.** Concretely, a generated design must: be valid under the engine's own guards (ADR 0110
decision 1 — no privileged path); fit its walls at every declared depth with nothing marked (ADR 0109
Amendment C, ADR 0069 decision 6); hold the minimum kitchen or say what it dropped (ADR 0110
Amendment A); and obey every composition rule ADR 0110 has ruled — the reading order, the tall block,
one oven and never two, no oven beside the fridge, no upper above a full-height body. **It is not
responsible for producing the kitchen a designer would draw.**

**The floor is *functional*, not merely *valid*, and this record does not lower it.** The owner's
statement of intent (2026-09-03) is explicit that the fallback assembles *"the cabinets and electric
devices to have a functional kitchen"*, and the M7 plan reads that as *"a functional kitchen, not
merely a placement that fits"*. **What *functional* means was itself answered by the owner** — the
minimum kitchen is a sink and a hob (Q3, ADR 0110 Amendment A). **Cheap bounds which roles a kitchen
gains; it never licenses dropping one it could have had.**

**2. The target for the algorithm is a kitchen a human can improve in a few moves.** This is a
materially easier target than *"a kitchen nobody would change"*, and it is the one 7D3, 7D4 and 7D5's
criteria are to be read against. **Where two admissible compositions differ only in appearance, the
cheaper one is correct** — *"always it means that it will cost less"* (ADR 0110 Amendment E).

**3. Taste enters through a preset, by the owner's own four-step loop.** Generate → the owner adjusts
in the editor → *save as preset* → a later customer with walls inside the ±600 mm window is offered
it (ADR 0109 Amendment A2, ADR 0112). **A judgement call does not become a generator rule; it becomes
a preset.**

**4. What this forbids, stated plainly because it is the failure mode the record exists to
prevent.** *(The list is the architect's; each item is an application of decisions 1–3.)*

- **A taste rule must not be added to the generator because a generated kitchen looked wrong in one
  room, one screenshot, or one photograph.** A judgement about how a kitchen *looks* is not a defect
  report. The route for it is: adjust the kitchen and save it as a preset.
- **No rule may be derived from a proportion.** The 20–30 % band was an impression the owner
  themselves withdrew as one. **No criterion may assert a ratio, a share or a frequency band**, and
  none ever has.
- **A measured consequence must not be re-read as a target.** The 25.4 % lift share and the 15.1 %
  long-run figure (M7 plan G15) were consequences of a placement rule that no longer exists; they are
  kept on the record precisely so nobody re-derives them and mistakes them for goals.
- **A generation wave does not add a catalogue row to satisfy a taste.** New bodies wait for beta
  (ADR 0110 E12.4, backlog 66). This is why the blind corner is *reported as blocked on a missing
  body* rather than worked around.
- **A photograph does not overturn a ruling.** ADR 0110 E11.4 is the worked precedent: seven of eight
  photographed kitchens ran uppers to the ceiling and the owner's ruling still excluded the top row.

**5. What this does not forbid, and the distinction is the whole of the rule.** Generation owes
correctness, and **the principle is not a shield for a defect.** A body past its wall, two ovens, an
oven beside the fridge, a missing hood, a merge that moves a tile boundary, an opening the planner
cannot match — these are defects and are fixed in the generator. **The test, when someone proposes a
new generated body or a new arrangement, is one question: *is this correctness, or is this taste?*
Correctness is the generator's. Taste goes to presets.**

**6. The consequence for the matching and authoring waves — what a preset may carry that a generated
design may not, and what it may not.**

- **A preset may carry any body the editor can insert**, because its content is a snapshot of a
  stored design rather than a recipe an agent authored (ADR 0112 decision 3). That explicitly
  includes `wall-lift` and `open-shelf`, **which generation never produces**. This is the mechanism
  the owner's *"I will add it, and we'll save it as a preset"* requires, and it already exists.
- **A preset carries no licence.** It is held at save to **zero validation findings of either
  severity** in its own room and to the minimum kitchen (ADR 0112 decision 4, ADR 0109 decision 3),
  and after adaptation to the same bar (ADR 0109 Amendment A3.4). **The correctness bar is identical
  for both paths**; only the judgement bar differs.
- **Adaptation subtracts taste and refills with the baseline, and wave 7C must let it.** ADR 0109
  Amendment A3 removes whole columns from a run's **free end** and refills any bare stretch of
  600 mm or more with the generator's own leftover rule. So a preset's refinement survives exactly
  where the adaptation does not bite, and is replaced by baseline storage where it does. **Worked
  case, the architect's, from A3.1: a lift above the sink survives every adaptation, because the sink
  is never removed; a lift at a run's free end is dropped.** **7C must not re-derive a dropped body
  somewhere else, substitute a body to preserve a preset's "character", or treat the loss as a fit
  failure** — that would be generation making a judgement call through the back door. The card
  declares what was removed (A3.3) and the customer adds it back in one action.
- **The thumbnail shows the taste that will be applied**, because it is captured from the preset's
  own design at save (ADR 0112 decision 6) — a card cannot promise a refinement the application
  drops.
- **7P1, 7P2 and the save control are the product's only quality mechanism, not a convenience.**
  Until that loop closes, the product ships the baseline and has no route to the refined kitchen the
  owner described. **The owner's own workflow is the acceptance test for those waves**: generate →
  adjust → save → a later matching customer loads it.

**7. The route to change a refusal is an owner ruling, and nothing else.** Every refusal in the table
above is the owner's. An implementer, reviewer or architect who thinks the generator should place a
lift, an open shelf, a mechanism or a new row **asks**, with the cost in front of the owner, and the
answer is recorded. Two of these were reversed within a day of being asked; the asking is cheap.

**8. This record does not reopen anything.** ADR 0110 remains the single authority for how
composition works and what it composes; every ruling in its Amendments A–E stands. ADR 0109 and
ADR 0112 remain the authorities for what a preset is. **This record allocates decisions between them
and settles nothing that either has already settled.** No 7D3, 7D4 or 7D5 criterion changes on its
strength.

## Where the boundary is genuinely unclear

**Stated rather than papered over, because a crisp line here would break on the next hard case.**
*(This whole section is the architect's analysis; the facts in it are the owner's.)*

**1. A proportion the owner states about their own practice can land either side, and has.** On the
same day the owner said *"if there is like space for 6 cabinets will be like 3 with drawers and 3
with doors"* and *"out goal is to use maximum cabonets types possible"* (M7 plan R1, R2, verbatim
including the owner's typing) — and **that one is being built into the generator as wave 7D4**, at a
measured **+8.6 %** on an eight-slot run (G9). They also said 20–30 % lifts — **and that one is not.**
**The two statements are formally identical**: both are proportions from the owner's practice, both
cost money, both were priced before the owner answered.

The architect's reading of what actually distinguishes them, offered as a reading and not as a test
that will always hold: **R1 is a property the owner wants every baseline to have; the lift is a
decision they said they would make per kitchen, by eye, after seeing the generated result** — *"where
I will think that it fits"*. A rule that can be applied without looking at the particular kitchen can
live in the generator; one that requires looking at it cannot. **Cost is not the discriminator** —
the owner declined the lift at **+53 000 minor** per kitchen and chose `tall-pantry` at roughly
**+115 000 minor** over the pair it replaces, knowingly, with both numbers in front of them
(ADR 0110 E12.3).

**The honest account of how these were actually settled is that the owner was asked each time.** That
is the procedure, not a failure of the principle.

**2. There is a third category, and it is not "generation" or "presets": a default that is not an
invariant.** Several of the owner's rules are majority cases they explicitly refused to harden —
drawers before the hob (*"it's not like a hard rule"*, R6), the bottle cargo after the hob (R11).
**These are built as generator defaults and no criterion may assert them as invariants.** A
subsequent reader must not use this ADR to argue that a majority-case default is "taste" and belongs
in a preset, nor that being built makes it an invariant. **When the owner upgrades one, they say so**
— the dishwasher's adjacency to the sink was a preference and the owner made it a rule the same day
(*"it should not be near only if is totally missing"*, R3).

**3. "Repetition" is the case this record is most likely to be misused against.** Eleven identical
`base-cabinet`s at 6300 × 5100 is the measured finding wave 7D4 exists to answer, and the owner
treated it as something to fix. **A reader could cite decision 2 — *the cheaper composition is
correct* — to argue 7D4 should never have been planned. That reading is wrong**: the owner ruled the
variety, so it is a settled rule and not an inference from appearance. **What the principle actually
forbids is an implementer reaching the same conclusion from a screenshot without asking.**

**4. The generator does make judgement calls the owner set once, for all kitchens** — generate a
dishwasher whenever it fits, compose a room just above the minimum and warn rather than refuse. These
are not counter-examples: the judgement was made **by the owner, once, as a property of the
baseline**, which is decision 3 working rather than failing.

**5. When it is unclear, ask — do not resolve it in either direction.** Adding a rule "provisionally"
and adding a refusal "provisionally" are the same mistake in opposite directions, and both end as
undated prose in a wave plan.

## Alternatives considered

- **Record it as ADR 0110 Amendment F only, keeping composition's single authority.** *Rejected, and
  the counter-argument is real*: ADR 0110 has been the single authority for composition since
  Amendment A, and this principle does constrain composition. **But its readers are the preset and
  matching waves — 7B, 7C, 7P1, 7P2, 7G — whose implementers have no reason to open a composition
  record at all.** A principle nobody reads is not a principle. **The resolution is a pointer, not a
  fork:** this record is the authority, and ADR 0110's Amendment F (not yet written, owed by wave
  7D4) and ADR 0109 each carry one line
  naming it, so composition's own record still leads a reader to the rule that bounds it.
- **Record it in the milestone plan and nowhere else.** Rejected: milestone plans are archived when a
  phase closes (`AGENTS.md`), and the principle outlives M7. A dated decision beats milestone prose.
- **Amend ADR 0109 instead, since presets are the destination.** Rejected for the same reason in
  reverse: generation's implementers have no reason to open the preset record.
- **State a crisp two-way test — "appearance is taste, function is correctness".** Rejected: it fails
  on the first hard case. The variety rule is about appearance and is a generator rule; the lift's
  original justification was a *motion* (washing a plate and lifting it up) and is not. The
  unclear-boundary section above is what replaces it.
- **Make cost the test — anything expensive goes to presets.** Rejected on the record's own evidence:
  `tall-pantry` was chosen at a higher price than what it replaces, and the lift was declined at a
  lower one (ADR 0110 E12.3).

## Consequences

- **Every generation wave from 7D3 onward carries this record in its "ADRs to check intent against"
  list**, and a wave proposing a new generated body states which side of decision 5 it falls on.
- **The preset waves inherit a stated obligation**: 7P1, 7P2 and 7G are the quality mechanism, and
  **the lift is the first named example of something only a preset can supply.** A library with no way
  to carry a `wall-lift` into a matched kitchen would silently drop the one body the owner said they
  would add by hand.
- **Review gains a standing question** for any finding of the form *"the generated kitchen looks
  wrong"*: is this correctness, or is this taste? A taste finding is recorded and not fixed in the
  generator.
- **The generator will keep looking plain, and that is the design.** Doors-only uppers, no open
  shelves, no mechanisms, no top row, an empty strip above the uppers, a free-standing fridge. **None
  of these is a defect and none is an oversight**; each has a dated ruling behind it.
- **Pointer lines owed.** ADR 0109 gains one (added with this record). **ADR 0110's Amendment F —
  wave 7D4's slice S0, not yet written — must carry the same line**; it is not added here, because
  the amendment does not exist and this record does not author 7D4's rulings.

## Decision-record sweep

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md), Amendments A–E | How generation composes: the command path, the shell, the reading order, the drop order, the tall block, the oven rules. | **Untouched and still the single authority for composition.** This record bounds *which* rules may be added to it, not how the existing ones work. |
| [0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md) **E11**, **E12.4** | The top row stays excluded pending feedback; new catalogue rows wait for beta. | **Explained, not changed** — both are deferrals of a judgement, and decision 4 forbids a wave from short-circuiting either. |
| [0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md) **E12.3** | *"Minimum costs less"* governs which roles a kitchen gets; it does not mean a full-height run may never cost more than what it displaces. | **Why cost is not the boundary test** (alternatives, and unclear-boundary 1). |
| [0109](0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md) decision 3, Amendment A3 | A recipe fits only with zero findings; adaptation removes whole columns from free ends and refills with the leftover rule. | **The mechanism of decision 6**: a preset carries taste but no licence, and adaptation subtracts the taste it cannot keep. |
| [0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md) decisions 3, 4, 6 | A save snapshots the stored design; the snapshot must be a kitchen the product would propose; the thumbnail is captured from it. | **The mechanism of decision 3**, and the reason no new capability is needed for the owner's loop. |
| [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 6 | A mark is acceptable for a customer's edit and for nothing else. | **Unchanged, and it binds both paths equally** (decision 6, second bullet). |
| [0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) | Leftover wall is the normal case; no metric may penalise it. | **Consistent**: the baseline is allowed to be plain, and bare wall is not evidence of a missing rule. |
| M7 plan, *Owner's statement of intent*, 2026-09-03, point 2 | The fallback must produce **a functional kitchen**, not merely a placement that fits. | **The floor decision 1 keeps.** *Cheap* bounds which roles a kitchen gains; it never licenses dropping one it could have had. |
| [0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) | Nothing is built for the dashboard in M6–M8. | **Untouched.** The preset library is ADR 0112's owner-directed exception and this record adds none. |
| [0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md) | Appliances are drawn and not sold. | **Consistent**: what a generated kitchen *draws* is still bounded by the catalogue, whichever path places it. |
