# ADR 0122 — A wall cabinet may widen over floor nothing records, and the column model is why

Status: Accepted (owner ruling, 2026-09-17, on a defect measured but **not** repaired)
Date: 2026-09-17
Type: Decision (product ruling over a representational gap)
Milestone: M7 — raised by wave 7D8's funding fix (`24ca2bc`)

## Context

Wave 7D8's logic review found that **4 413 generated kitchens (2.09 %)** shipped a strip of floor
belonging to no placement, no recorded empty column and no derived void. That defect was repaired at
`24ca2bc`: a shrink now holds its run in place and records the strip it hands over, measured
**4 413 → 0**, with 7D8's criterion 5 intact (0 differences across the 129 156 rooms that must not
move).

**Repairing it exposed a second case the same measurement can see and the same fix cannot reach.**

### The measurement, and it is the growth side

Over the shipped `KITCHEN_L_DESIGN`, sweeping every chip on every placement across the load state and
the nine clears — **1 935 taps, 605 accepted**: **[measured, `24ca2bc`]**

| accepted taps leaving an unrecorded floor strip | before the fix | after the fix |
| --- | ---: | ---: |
| shrinks | 12 | **0** |
| **growths** | **20** | **20** |

The 20 are `p10@350…800` and `p16@350…800` — **widening the 300 mm wall cabinet into the cleared sink
column**, leaving `A:900-950` through `A:900-1400` of floor that the published column map no longer
accounts for. **This is HEAD's behaviour and predates wave 7D8 entirely.**

### Why the shrink fix does not reach it, and it is not an oversight

**The guard added at `24ca2bc` refuses a *funding side*, never a resize.** On a **shrink** that costs
nothing, because [ADR 0035](0035-a-width-change-funds-itself-from-its-own-side-and-the-vacated-space-is-recorded.md)
decision 7's `vacatedEmptySpace` is a **correct alternative funder**: when neither side can fund it,
the shrink records the strip it withdrew from. The guard only ever redirects the width — which is why
the accepted set is **identical**, 605 before and 605 after, 0 lost and 0 gained.

**On a growth there is no alternative funder.** The strip moves the other way and nothing creates
space, so refusing the side **refuses the operation**. The implementer measured this rather than
reasoning about it: the symmetric form of the guard was built first and **broke 9 assertions across 6
files, every one a legitimate growth** into a cleared opening.

**So the two directions are not one rule trimmed until the tests passed.** They are a
**funding-selection bug** and a **representational gap**, and only the first is repairable inside that
command. The implementer offered the falsifiable form of that claim, and it is recorded because it is
what makes the asymmetry principled rather than convenient:

> *"Had decision 7 not existed, I would have had to refuse the shrink too, and I would have brought it
> to you instead of shipping it."*

### The representational gap, stated plainly

**A column has one along-wall extent for all of its height bands.** The model cannot express *"the
wall cabinet widened but the floor under it did not"*. Widening the upper cabinet widens the column;
the base row inside that column has no body to widen with it, and the floor beneath stops being
accounted for.

**That is the whole of the constraint.** Any repair that keeps the growth must change the column
model.

## Decision

**1. The growth ships as it is. The customer keeps the ability to widen a wall cabinet into a cleared
opening, and the floor beneath it stays unrecorded.** Owner ruling, 2026-09-17, taken with all three
options and their measured consequences in front of them.

**2. The asymmetry in `plan-width-funding.ts`'s guard is deliberate and is not a defect to close.** A
later wave that finds the guard "inconsistent" and makes it symmetric is **removing a capability the
owner chose to keep**, and owes a new ruling before doing so.

**3. The refusal option is refused, not deferred.** Making the guard symmetric fixes the 20 by
**refusing the operation** — measured, 9 assertions across 6 files assert those growths work today.
Taking a working action away from a customer to close a bookkeeping gap is the worse trade, and the
owner made it explicitly.

**4. The proper repair is a model change and belongs to its own wave.** Making the floor follow the
wall cabinet requires a column to carry a different along-wall extent per band. **Nothing is built for
it now** ([ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)):
this record is the trigger, and the wave that wants it starts here.

## What this record does NOT claim, and the honesty matters more than the ruling

**Nobody has looked at it on screen.** Every figure above is a bookkeeping measurement —
`unrecordedFloorStripsMm` reading the published column map. **Whether a customer would *see* anything
is unmeasured.**

The distinction is real and this milestone has both halves of it. The **shrink** case was
photographed by 7D8's visual gate: a visible notch in the worktop, and the reason the defect was
believed rather than argued. The **growth** case has no such evidence — it may render as an ordinary
cabinet over ordinary floor and matter only later, when something tries to use space the app has
stopped tracking.

**The coordinator put the question to the owner describing it as "bare floor" and only afterwards
noticed that word was doing unearned work.** It was corrected to them in the same session, before this
record was written, and the ruling was left standing on the corrected description. **A ruling taken on
a word that overstates its subject is not a ruling; recording which half was measured is what keeps it
one.**

## Consequences

- `plan-width-funding.ts`'s guard stays asymmetric, with this record named at the guard.
- The 20 growths remain in the census as accepted taps leaving an unrecorded strip. **They are
  expected, not a regression**, and a future measurement that reports them as new has mis-dated them.
- **A visual check is owed and is cheap.** It does not gate the ruling — the owner ruled on the
  bookkeeping fact — but it decides whether this is a latent data problem or also a visible one, and
  the answer belongs in this record when somebody has it.

## Sweep

| Record | What it says | How it is settled |
| --- | --- | --- |
| [ADR 0035](0035-a-width-change-funds-itself-from-its-own-side-and-the-vacated-space-is-recorded.md) decision 7 | A width change funds itself from its own side and the vacated space is recorded. | **Unchanged, and it is the reason the shrink half is repairable.** `vacatedEmptySpace` is the alternative funder a growth has no equivalent of. |
| [ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | A problem is recorded with its trigger and not built for. | **Applied.** The model change is not built; this record is its trigger. |
| [ADR 0121](0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md) | A thing is identified by what it is, never by what correlates with it. | **A cousin rather than an instance.** The census here counts the thing itself — floor the column map does not cover — and the gap is that *visibility* was never measured, not that the wrong key was used. |
| Wave 7D8, criterion 5 | 0 field differences across P2 ∪ P3. | **Held through the shrink fix**, measured on the built design rather than the plan. |
