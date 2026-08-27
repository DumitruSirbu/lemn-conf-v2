# ADR 0030 — A single hinged door tops out at 600 mm

Status: Accepted
Date: 2026-08-27
Type: Decision
Milestone: M5 wave 5C — `setWidth` and the column update

## Context

Wave 5B made width sets visible and wave 5C makes them selectable. Both `base-1door` and
`wall-1door` inherited `STANDARD_WIDTHS_MM = [400, 600, 800]`, so 800 mm was an offered width for a
cabinet with **one hinged door**.

Nothing is wrong with the geometry: the builder makes an 800 mm one-door carcass correctly, the door
slab is one panel, and no gate refuses it. That is exactly why it needed a decision rather than a
fix — it is a width the model can build and a customer should not own.

**This is not ADR 0029's rule.** ADR 0029 is about a label's declared door count diverging from what
the builder actually makes: `wall-2door` at 400 mm builds *one* door while claiming two. Here the
label is truthful at every width. The objection is ergonomic — an 800 mm door on a single hinge side
sweeps an arc no kitchen wants, and the leaf weight is wrong for the hardware.

The two rules are worth keeping distinct: one is a **consistency** constraint enforceable by
comparing a declaration against a builder, and the other is a **product** constraint that no test
could derive.

## Decision

**`base-1door` and `wall-1door` each declare `sizesMm: [400, 600]`.** 800 mm is dropped from both.

Owner's decision, 2026-08-27, taken while reviewing the surviving resize list for wave 5C.

Two clarifications the owner did not spell out, decided by the coordinator and recorded here so they
are not re-derived:

- **"One-door cabinets" means both the base and the wall entry.** Both are hinged singles inheriting
  the same standard set, and the swing-arc reasoning applies identically to each.
- **`wall-lift` keeps 800 mm.** A lift-up flap has no swing arc — it rises rather than sweeping — so
  the reasoning does not reach it. `open-shelf` has no doors at all and is likewise untouched.

`STANDARD_WIDTHS_MM` itself does not move. `base-2door`, `base-3drawer`, `base-panbank` and the other
entries keep it.

## The 400 mm floor is deliberately left alone, for now

The owner is **undecided about 400 mm** for a single door and chose to keep it — "I'm really not sure
about this hundred, but let's keep." Recorded as a live question rather than a settled one.

The consequence for implementation: nothing may hard-code these sets, so that dropping 400 later
stays a one-line catalogue edit. That is already the rule (*"nothing in the chip path may assume a
particular set"*, `M5-width.md`), and this is a concrete reason it earns its keep.

## Alternatives considered

- **Leave 800 mm and rely on the customer not choosing it.** Rejected: §9's rule is that nothing is
  offered which cannot be satisfied, and "can be built" is not the same as "is a product".
- **Let a resize past 600 migrate the placement to `base-2door` / `wall-2door`.** The same
  alternative ADR 0029 rejected, for the same reason: a resize that silently changes which catalogue
  entry the customer owns is a larger surprise than a width that is not offered.
- **Derive the cap from the builder**, as ADR 0029's gate does. Not possible here — the builder makes
  the 800 mm one-door cabinet perfectly well. There is nothing to compare against, which is what
  makes this a declared product rule and not a consistency gate.

## Consequences

- `p10` and `p16` (`wall-1door-300`, on §5.2's `'fit'` path at 300 mm) render `[300, 400, 600]`
  instead of `[300, 400, 600, 800]`.
- An 800 mm opening no longer offers `base-1door` or `wall-1door`. It still offers the two-door
  entries, `wall-lift` and `open-shelf`, so no opening is left without an answer.
- Combined with ADR 0029 and wave 5C's `RESIZE_OPENS_GAP` refusal, this is the third constraint
  narrowing the resizes the shipped kitchen actually permits. The three interact, and the surviving
  set is small enough that it is worth knowing explicitly before building chip UI over it — recorded
  in wave 5C's close-out rather than here.
- 800 mm remains in the product's published width vocabulary through the two-door entries,
  `wall-lift`, `open-shelf` and the base entries that keep the standard set.
- ADR 0029's gate (a door-counting label must match the doors the builder makes at every declared
  width) still passes untouched: a one-door entry whose whole set sits below the two-door threshold
  is precisely what it asserts.

---

## Amendment, 2026-08-27 — the set is `[200, 300, 400]`, and the title's "600" is spent

**Taken the same day, by the owner, a few hours after the original.** The reasoning above stands; the
numbers in it do not.

The original recorded "maximum 400 mm" and, reading that against the standard `[400, 600, 800]`,
implemented `[400, 600]` — keeping 600 because it was the nearest standard member below the stated
cap. That was wrong twice over. The owner's cap was **400 itself**, not "below 600", and the set also
extends **downward**: *"One door can be four hundred, three hundred, and two hundred."*

**`base-1door` and `wall-1door` each declare `sizesMm: [200, 300, 400]`.**

The downward half has its own motive, given by the owner: a 200 mm bottle cargo wants a 200 mm wall
cabinet above it, so the levels of a column can match. Under ADR 0031 a resize moves a whole column,
so that match is what the customer gets by resizing the column rather than by matching two widths by
hand.

**This changes ADR 0026's premise and must be read with it.** §2's `MIN_W` is 300, and ADR 0026 made
`base-bottle-cargo` the **only** entry declaring a floor below it — deliberately, because dropping the
constant would have made every entry insertable at 200–300 mm and produced "a 220 mm two-door base
cabinet, buildable and offerable, and not a product". Two more entries now declare below the default.
That is the mechanism ADR 0026 built being used as intended rather than being overturned: the floor is
still declared per entry, and it is still declared only where the builder honestly serves it. But
"one entry carries an exception" is no longer true, and the count is now three.

**What is unchanged:** `wall-lift` and `open-shelf` keep `[400, 600, 800]`; `STANDARD_WIDTHS_MM` does
not move; ADR 0029's two-door rule and its label-versus-builder gate are untouched. The ergonomic
reasoning — an 800 mm leaf sweeps an arc nobody wants — is what still forbids the top of the standard
set, and it is unaffected by the set gaining members below.

**The 400 mm question the original left open is closed**: 400 is the maximum, not a member the owner
was unsure about. The uncertainty recorded above was the coordinator's reading of "I'm really not
sure about this hundred" and is spent.

**The title is left as written.** It names a number the record no longer holds, and renaming a
published ADR breaks every citation to it; the amendment is the correction. Read the title as "a
single hinged door does not reach the top of the standard set".

---

## Mechanism superseded 2026-08-27 by [ADR 0033](0033-door-count-is-derived-from-width-not-declared.md)

**The rule in this record survives exactly. The way it is enforced does not.**

ADR 0033 merges the door-count pairs into one catalogue entry each and derives the door count — and
the label naming it — from the width, at the same constant the builder branches on. So this record's
limit stops being one entry's declared `sizesMm` and becomes half of the single point where the door
count flips: below the threshold one door, above it two.

Nothing here is relaxed, and the reasoning above is why the threshold sits where it does. What is
retired is the split into two entries, which is what let a column hold a base that can be 400 under a
wall cabinet that cannot — the collision ADR 0031 surfaced and ADR 0033 exists to end.
