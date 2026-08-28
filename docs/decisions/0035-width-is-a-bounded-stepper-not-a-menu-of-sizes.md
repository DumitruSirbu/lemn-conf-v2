# ADR 0035 — Width is a bounded ±50 mm stepper, not a menu of sizes

Status: Accepted
Date: 2026-08-28
Type: Decision
Milestone: M5 — supersedes wave 5D's chip row, and gates 5E

## Context

Six ADRs in a row have answered the same shape of question: **which numbers belong in this entry's
size list?**

- **0026** — the width floor has a direction, because the bottle cargo is ~200 mm.
- **0029** — `wall-2door` may not carry 400, because 400 builds one door.
- **0030** — `base-1door` / `wall-1door` cap at 400, because an 800 mm leaf sweeps an arc nobody
  wants; amended the same day to extend downward to 200.
- **0031** — a column's legal widths are the intersection of its members' sets, and the 200 mm
  granularity of those sets is *why* §5.4's donor rule produced two reachable resizes in the whole
  kitchen.
- **0033** — the door-count entries merge, and then, twice over, that a discrete list is not a
  bound: cabinetry is **continuous within its door-count range**, appliances are discrete.
- **0034** — the chip row is the column's rather than the body's, and 76 rendered chips were really
  62.

Each was correct. Together they describe a model fighting itself: the **engine** has already been
pushed to ranges (0033's second amendment publishes ranges, floors and chips as three separate
facts), while the **catalogue** still hand-maintains a menu per entry and the **panel** still renders
that menu as a row of chips.

The owner proposed the resolution on 2026-08-28: drop the fixed sizes and give each cabinet
**`+50 mm` and `−50 mm` buttons with its current width between them**, ranging 200–800.

## Decision

**1. A cabinet's width is a stepper, and the step is relative to its current width.**
`+50` / `−50` from whatever the cabinet is now, clamped to the entry's own floor and ceiling. The
`−` button is disabled at the floor and the `+` button at the ceiling, which is how the bounds are
communicated — a disabled control carrying its reason, per ADR 0032, rather than an absent one.

Stepping is **relative, not snapped to a global grid**. The shipped kitchen holds widths off any
50 mm grid — the 570 mm corner return, the 750 mm fridge column — and grid snapping would rewrite
cabinets the customer never touched. Relative stepping takes 570 to 520 or 620 and leaves every
other body alone. The cost is that two cabinets' widths need not be congruent mod 50, which was
never true anyway: runs add up to wall lengths, not to multiples of the step.

**2. The catalogue's width model becomes a floor, a ceiling and a step.** `sizesMm` stops being a
hand-maintained list for every cabinetry entry. This is the point of the change rather than a side
effect: ADRs 0026, 0029, 0030 and the door-count halves of 0033 exist to curate lists that no longer
exist. Their *rules* survive as bounds.

**3. An entry whose width is genuinely fixed keeps a discrete choice, and shows no stepper.**
The owner: *"cabinets that have only two fixed widths, we will not have these plus fifty minus fifty
buttons — otherwise we'll just have a lot of conflicts."* A dishwasher is 450 or 600 because
dishwashers are; a fridge column is 750; an oven housing is what the oven is. The appliance is the
fixed thing and the cabinet is built around it. The catalogue already distinguishes these with
`fixedWidth: true`, so this is an exclusion, not new machinery. §9 therefore has **two width
controls**: a stepper where width is free, a discrete choice where it is not.

**4. Two doors start at 500 mm; 499 and below is one door.** `TWO_DOOR_MIN_WIDTH_MM` moves from 450
to **500**, and the comparison becomes `>=` rather than `>`.

This is forced by decision 1 rather than chosen alongside it. Under a `[400, 600, 800]` ladder
nothing ever lands between 400 and 600, so the threshold's exact value was unobservable. A stepper
reaches 500 and 550, and `w > 450 ? 2 : 1` would have made those **two doors of 250 mm each** — not
a cabinet anyone manufactures. Relative stepping reaches 470 as well (570 → 520 → 470), which is why
the rule is stated as a half-open bound over the whole continuum and not as a fact about two
widths.

Noted because it will look like an off-by-one to the next reader: the constant named
`TWO_DOOR_MIN_WIDTH_MM` has been holding a value that gets **one** door. At 500 with `>=` the name
finally describes the value.

**5. The hood's range is 600–800.** Owner, on the hood specifically: it starts at 600 and the `−50`
is greyed out there. This replaces the hood's discrete narrowing from ADR 0033's second amendment
with the same bounds every other cabinetry entry now carries.

**6. A column is one width at every level.** Mixed widths do not exist. Where the shipped design
holds them (`COLUMN_MEMBERS_UNALIGNED`, 15 lockouts), the resize **squares the column up** rather
than refusing it — owner: *"let's make them editable, I didn't get why we need to refuse."*

A consequence to state rather than discover: a column containing an appliance can only take that
appliance's widths, and the whole column follows. Those columns show the discrete control of
decision 3, not a stepper, and the reason is a fact about dishwashers rather than a refusal.

**7. Shrinking a column creates empty space.** ADR 0031 funds a resize from an adjacent empty
column and records that the "not representable" argument against generating one was wrong. The
owner has now decided it: shrinking produces adjacent empty space. This is what makes the stepper
usable at all — ADR 0031's consequence was that **nothing in the shipped kitchen is resizable until
something is deleted**, and 50 mm steps into space the previous step created is what removes that.

**8. Price is a formula over width, not a table keyed on sizes.** Owner: *"I will go formula because
it's more flexible… later we can switch from fifty millimetres to twenty five, and in this case not
do a lot of rework."* M6's work, recorded here because M6 must not be designed as a lookup and then
rebuilt. A price table keyed on 400/600/800 has three rows per cabinet; 200–800 in 50s has thirteen,
and at 25 mm it has twenty-five. The step is a **presentation constant**, and nothing downstream of
the panel may depend on it.

## Alternatives considered

**Snap to a 50 mm grid from 200.** Rejected under decision 1: it silently rewrites the 570 corner
return and the 750 fridge column, which are correct as they stand and which no customer asked to
change.

**Splice 450 into `STANDARD_WIDTHS_MM` and keep the chip row.** This was agreed earlier in the same
session, to unblock a 450 dishwasher under a wall cabinet that could not match it, and is superseded
here. It fixes one width and leaves the model that produced six ADRs intact. Under decision 1 the
450 arrives for free, and so does every other width.

**Keep the threshold at 450 and forbid 500/550.** Rejected: it reintroduces a curated list of
excluded widths, which is the thing being removed.

**Exempt appliance columns from decision 6 instead of squaring columns up.** Rejected — it reopens
the mixed-width case decision 6 closes, and decision 3 already gives appliance columns honest
behaviour without an exemption.

## Consequences

- **ADR 0034's chip row is superseded; its engine seam is not.** `columnWidthChoices`, the judgement
  of each candidate by running `setWidth` and discarding the design, the intersection over a
  column's members, `BodyResizedEffect.columns`, and the store publishing its `BodyProbe` all
  survive unchanged — a stepper asks *"is width W legal for this column?"* exactly as a chip did.
  What changes is that the panel asks it about two candidates rather than about a set. The pinned
  chip counts and the three pinned rows in 5D's tests go with the chips.
- **The `free`/`blocked` property test survives in a stronger form.** 5D's property — every chip the
  panel marks `free` is a width `setWidth` accepts — becomes: at every reachable width, each button
  is enabled if and only if the step it offers succeeds.
- **A new wave lands in front of 5E**, because 5E photographs this surface and the surface changed.
- **The catalogue loses `sizesAreStandardLadder`'s reason to exist** for cabinetry rows, and
  `STANDARD_WIDTHS_MM` with it. Appliance rows keep `boundedWidths`.
- **§11 row 14 is restored rather than superseded.** "Dishwasher niche: only 450 / 600" reads as
  written again once a wall cabinet can be built at 450 — the intersection that reduced `p1` to 600
  alone was a consequence of the ladder, not of the column rule.
