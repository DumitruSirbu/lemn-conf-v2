# ADR 0033 — Door count is derived from width, not declared as a separate entry

Status: Accepted (amended twice)
Date: 2026-08-27
Type: Decision
Milestone: M5 wave 5C3 — merging the door-count entries

> **Amended twice, 2026-08-27.** A hinged cabinet's widths become two ranges (one door 200–400, two
> doors 600–800) rather than five discrete values, so the hinged base cabinet reaches the 700 mm
> opening under the fridge; and `base-sink`/`hood` are restated as cabinetry with fixed apertures
> rather than discrete rows. See the two "Amended" sections below.

**Supersedes the mechanism of ADR 0029 and ADR 0030 while keeping both their product rules.** Neither
limit is relaxed; both stop being one entry's declared set and become the single point where the door
count flips.

## Context

Three decisions on 2026-08-27 each fixed one case and opened the next:

- **ADR 0029** — `wall-2door` was offered at 400 mm, where §7's builder (`w > 0.45 ? 2 : 1`) makes
  **one** door under a two-door label. Fixed by declaring `[600, 800]`.
- **ADR 0030 + amendment** — `wall-1door` and `base-1door` were offered at 800 mm, an unusable swing
  arc. Fixed by declaring `[200, 300, 400]`.
- **ADR 0031** — a resize moves a whole column, so a column's legal widths are what every member
  accepts. Those two decisions then collide: a base cabinet that can be 400 stands under a
  `wall-2door` that cannot, so the column can never be 400.

The owner's diagnosis, 2026-08-27: *"we solve one specific case, and we open another specific case and
so on… maybe we need a general solution."*

**The general observation is that the geometry was never the problem.** `w > 0.45 ? 2 : 1` has always
derived the door count from the width, and it is correct at every width. What is declared — and what
therefore lies — is the **label**. `wall-2door` at 400 mm is not a broken cabinet; it is a correct
one-door cabinet wearing a two-door name. Every defect in this class is a naming defect wearing
geometry's clothes.

`wall-2door` and `wall-1door` already share `kind: "wall_cabinet"`; `base-1door` and `base-2door`
already share `base_cabinet`. The kind is the real identity. The split into two entries encodes
nothing but a door count the builder already computes.

## Decision

**A cabinet whose door count the builder derives from width is one catalogue entry, not two. The
door count — and the label that names it — is derived at the same threshold the builder uses.**

| Today | After |
| --- | --- |
| `wall-2door` `[600, 800]` + `wall-1door` `[200, 300, 400]` | one wall entry, `[200, 300, 400, 600, 800]` |
| `base-2door` `[400, 600, 800]` + `base-1door` `[200, 300, 400]` | one base entry, the same ladder |

1. **The customer chooses a cabinet and a width.** The door count is a consequence, never a separate
   product to pick.
2. **The displayed label is derived** — *Corp suspendat 1 ușă* at 400, *2 uși* at 600 — from
   `TWO_DOOR_MIN_WIDTH_M`, the constant the builder already branches on. **One threshold, read by the
   builder and by the label**, so they cannot disagree. That is ADR 0028's single-source discipline
   applied to a second pair.
3. **Both product rules survive exactly.** ADR 0030's "a single hinged door tops out at 400" and ADR
   0029's "two doors start at 600" are now the *same* fact stated once: below the threshold it is a
   one-door cabinet, above it a two-door. 450 and 500 are simply not offered widths, which is what
   keeps the flip clean.
4. **No migration, and no surprise.** A resize that takes a column to 400 turns the wall cabinet into
   a one-door **without changing which entry the customer owns** — it is the same entry throughout.
   This is why the alternative both earlier ADRs rejected (let a resize migrate the placement to the
   other entry) is not needed: there is no other entry to migrate to.

## What is left, and why it is legitimate

Appliance-driven widths still constrain a column, and no restructuring removes them: the hob is 600,
the dishwasher 450/600, the sink 600/800, the full-height units 600, the freestanding fridge 700. A
column containing a hob can only be 600.

That is a fact about hobs, not a modelling failure, and it is explainable to a customer in one
sentence — which ADR 0032 gives it a place to say. The distinction worth holding onto: after this
ADR, a column's width is constrained only by **appliances**, never by cabinetry.

## Alternatives considered

- **A consistent minimum/maximum table across all entries** — the owner's first framing. Rejected,
  and the reasoning is the valuable part: the limits are *physical facts*, not free choices. A
  two-door at 400 genuinely builds one door; a one-door at 800 genuinely sweeps a bad arc. Forcing
  those into one table does not remove the conflict, it relocates the lie into the table.
- **Let a resize migrate the placement between the two entries.** Rejected by ADR 0029 and again by
  ADR 0030, on the grounds that silently changing which entry the customer owns is a larger surprise
  than a width not offered. Unchanged — and made unnecessary here.
- **Keep the split and widen the sets.** That is precisely what ADR 0029 and ADR 0030 forbade, for
  reasons that still hold.
- **Do nothing and accept per-appliance conflicts.** Rejected on the owner's own grounds: it is the
  case-by-case treadmill this ADR exists to leave.

## Consequences

- **ADR 0029 and ADR 0030 keep their rules and lose their mechanism.** Both must be amended in place
  pointing here, not deleted — their reasoning is why the threshold sits where it does.
- **ADR 0029's gate changes shape.** Today it parses a door count out of a label and compares it with
  `door_front` meshes at every declared width. After this the label is derived, so the gate becomes
  the stronger and simpler claim that **the label's threshold and the builder's threshold are one
  constant**. Keep a mesh-counting assertion so the derivation is checked against geometry, not only
  against itself.
- **Eight seeded rows point at the four merged entries** via `catalogEquivalentId` (ADR 0022) and
  must be repointed. The pointer's meaning is unchanged; its target consolidates.
- **`sizesAreStandardLadder` (ADR 0031 rule 5) needs re-examining, not assuming.** It exists because
  `sizesMm` carried both a *bound* and a *ladder*. The bounds it was created for were `wall-2door`'s
  and `wall-1door`'s — the two this ADR merges. Appliance entries still carry genuine bounds, so the
  flag probably survives with a smaller population; the wave must check rather than assume, either
  way.
- **Pricing and labels are customer-facing.** A derived label must be derived everywhere it appears —
  the offer list, the ACTUAL badge, the panel header, the review step — or it becomes a second
  source. M6 prices from the catalogue and needs the same derivation.
- **This does not touch what a cabinet is built from.** No builder changes; the threshold constant
  does not move. The M1 fidelity gate is unreachable from this wave.

## Sequencing

**After wave 5C2 (ADR 0032's engine half, in flight) and before 5D.** 5D renders labels and the
disabled rows ADR 0032 introduces; doing this first means 5D renders the derived label once rather
than rendering the declared one and being rewritten.

---

## Amendment, 2026-08-27 — a hinged cabinet's widths are two ranges, not five values

**Owner's decision, taken the same day, after adversarial QA measured what the merge cost.**

The merge as first implemented gave both hinged entries the discrete set
`[200, 300, 400, 600, 800]` and marked them **bounded** (`sizesAreStandardLadder: false`), because
ADR 0030's swing-arc rule survives and no floor can express a hole in a range.

QA found the cost: `base-2door` had been a **ladder** row and filled *any* opening at or above 300 mm,
so the merged bounded row **removed the hinged base cabinet from every opening width outside those
five**. Measured on the shipped kitchen, the reachable loss is the 700 mm base opening under the
freestanding fridge — clear it, and no hinged base cabinet can go there.

**The bound was wider than the argument given for it.** This record justified refusing 450 and 500;
it said nothing about 700, where §7's builder makes an entirely honest two-door of two 350 mm leaves.

### What the rules actually say, worked width by width

| width | builder makes | rule | verdict |
| --- | --- | --- | --- |
| 200–400 | 1 door | one door caps at 400 (ADR 0030) | allowed |
| 401–450 | 1 door | above the one-door cap | refused |
| 451–599 | 2 doors | below the two-door floor of 600 (ADR 0029) | refused |
| 600–800 | 2 doors | in range | allowed |
| 900+ | 2 doors | above the 800 maximum (ADR 0029) | refused |

**So the rules were never a list of five widths. They are two ranges:** one door **200–400**, two
doors **600–800**. The five values are the *modular* widths a customer picks from — a different fact,
and still what §9's chips render.

**570 and 900 are correctly refused** and must stay so; an earlier reading of QA's finding treated
them as casualties, and that was wrong. **700 is the only genuine loss, and restoring it is the whole
of this amendment.**

### The rule this settles

**Cabinetry is continuous within its door-count range; appliances are discrete.**

A hood is 600 or 900 because those are the sizes hoods come in — a 700 mm hood is not a product, and
refusing it is the defect being *fixed*, not a loss. The same holds for `base-sink`, the dishwasher,
the hob and the full-height units. `base-bottle-cargo` stays discrete for ADR 0026's own reason: the
proportion is the product.

### Consequences

- Chips are untouched: `sizesMm` stays the five modular widths and §9 renders exactly what it
  rendered before. Ranges govern only what a `'fit'` body may be **built to when filling an existing
  opening**.
- `sizesAreStandardLadder` may be subsumed by ranges rather than sitting beside them — a ladder row is
  `[floor, ∞)`, an appliance row a set of degenerate one-width ranges, a hinged cabinet two real
  ranges. Whether that simplifies or over-engineers is an implementation judgement, recorded in the
  wave rather than decided here. `acceptsWidthMm` stays the one predicate shared by insert and
  resize either way.
- This is the third correction to this ADR's numbers in a day, and the pattern is worth naming: each
  time, a *discrete list* was standing in for a *rule about a range*, and the list was narrower than
  the rule. The ranges are the rule stated directly.

---

## Second amendment, 2026-08-27 — the sink is cabinetry, and the hood narrows

**Owner's decision, after logic review found the pattern a fourth time — inside the change that named it.**

The first amendment's closing paragraph said each correction had found *"a discrete list standing in for a
rule about a range, narrower than the rule"*. Logic review then swept every reachable insert the two
waves removed and found the complete list to be `base-sink@700` and `hood@300/700/800` — and
**`base-sink` appeared in no record at all**, unlike the four entries the wave's own test comment names.
Nobody argued it, so nobody noticed.

### `base-sink` is cabinetry with a fixed aperture

**`base-sink` declares the range 560–800.** Chips stay `{600, 800}`.

Its physical constraint was always the **bowl aperture**, already declared as `SINK_MIN_WIDTH_MM = 560`
(ADR 0017). `{600, 800}` was a chip ladder that wave 5C2 turned into a hard bound without an argument —
the same move the merge made on `base-2door`, and the reason the 700 mm opening under a cleared
freestanding fridge stopped taking a sink base.

The owner's product argument, verbatim: *"there are a lot of cases when the sink is 800 — in my kitchen
it's an 800 cabinet."* An 800 mm sink base is ordinary and so is a 700; what is fixed is the bowl, not
the carcass. **So the first amendment's rule needed one word of precision: a sink base is cabinetry with
a fixed aperture, not an appliance that comes in sizes.** ADR 0017's floor is untouched and still fires
first with its own code below 560 — the two guards stay ordered, not stacked.

### The hood narrows rather than refusing

**`hood` declares `widthFlex: HOOD_WIDTHS_MM`**, joining every other discrete row, so it installs a
600 in a 700 or 800 mm opening exactly as `base-dishwasher` already installs a 600 in a 700.

The refusal was never decided. The hood was the only row that was both `widthFlex: 'fit'` **and**
discretely bounded, so 5C2's bound sent it down the fit branch and refused it outright, while every
other discrete row narrowed. **"A 700 mm hood is not a product" remains true and remains enforced** —
the hood is never *built* at 700; it is built at 600 and installed in the wider slot.

The owner named the placement question and it was already answered: `resolvePlacementMillimetres` takes
`alongMm` from the opening's **centre**, so a narrowed body lands centred with equal margin either side.
That property is now asserted rather than assumed.

**Amended 2026-09-01 — the centring above is superseded by [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md) part 1, but only where a column can be divided.**
A body narrower than the column it is inserted into is seated flush against the span's **left** edge,
and the whole remainder becomes one selectable empty column, **in a column the insert may divide —
one the opening runs the whole height of. Where a member stands at another level the body is still
centred**, exactly as this record originally described.

That precondition is not a temporary limitation of the implementation; it is forced. Splitting a
column under a surviving member re-keys the occupied half while that member goes on deriving the old
key, which is ADR 0011 Gap D's phantom column, and moving the member is backlog 2's re-split. So on
the shipped kitchen the centring above still governs: `base-dishwasher` still lands dead centre in
the 700 mm `B|2.45`, because the over-fridge cabinet keeps that column indivisible, and a narrowed
hood in `A|2.60` still lands with equal margin either side.

The owner accepted the eventual cost by name, for `base-dishwasher` in a 700 mm opening, on the same
day — it is simply not yet paid on any seeded column. Nothing else in this record moves: the hood
still narrows rather than refusing, and it is still never built at 700.

**Corrected 2026-09-01, later the same day.** The first version of this amendment said the flush
seating happened outright. It does not, and the sentence it claimed to retract is still live for
every column holding a member. Found by the 5B4a logic review, whose falsifying case was the
amendment's own subject: narrow a hood into `A|2.60` and watch it centre.

### The pattern, stated for the last time

Four instances in one day, each the same shape: **a discrete list standing in for a rule about a range.**
`base-2door`'s ladder, the merged hinged rows, `base-sink`'s chips, and the hood's branch. The lists were
never wrong; they were never complete, which is harder to see and is why each one survived a review that
was looking at something else.

What generalises: **when a list of sizes is the customer's menu, it is not automatically the engine's
bound.** Chips are what may be picked; ranges are what may be built; a floor is what may not be crossed.
The catalogue now says all three separately, and `CatalogOffer` publishes them as three fields with three
jobs so no renderer has to guess which one it is reading.
