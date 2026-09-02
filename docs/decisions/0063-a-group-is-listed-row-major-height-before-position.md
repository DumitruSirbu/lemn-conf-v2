# ADR 0063 — Within a group, bodies are listed row-major: height before along-wall position

Status: Accepted
Date: 2026-09-02
Type: Decision
Milestone: M6 wave 6A — inherited by 6B and 6D, and by M8's review summary

## Context

Wave 6A built the one canonical projection every surface lists a design from — the scene's grouping,
the price breakdown, the pricing query's line order, and M8's review summary. Its comparator ordered
`wall → normalised band → alongMm → y0Mm → placementId`.

6A's logic reviewer noticed what that produces. Because [ADR 0011](0011-m3-insert-contract-gaps.md)
Gap C folds the `top` row into `wall`, a wall's *suspendate* group holds two module lines at once,
and ordering by along-wall position **before** height reads **column-major**: each hanging cabinet
immediately followed by the top box above it.

Worked on the seeded kitchen's wall A *suspendate* group, twelve bodies on two lines at
`y0` 1500 and 2200:

```
column-major (as built)  p8 p15  p10 p16  p11 p17  p12 p18  p13 p19  p14 p20
row-major   (decided)    p8 p10 p11 p12 p13 p14    p15 p16 p17 p18 p19 p20
```

**The mockup cannot arbitrate.** Its 2D breakdown cites *bază 6 · suspendate 7 · coloană 1* over 14
bodies; the seeded design carries 25 placements. Those counts describe a different kitchen, so
reading an order out of them would be inventing evidence. (The mockup does render the top row as a
single *"Rând superior · push-to-open"* line rather than interleaving it, which is at least not in
tension with what follows — but it is a different kitchen and it does not decide this.)

The reviewer called both readings defensible and recommended an explicit sign-off rather than
discovering the order on screen in 6D. Both were put to the owner with worked examples.

## Decision

**Within a group, order by height first, then by along-wall position.** The whole hanging row left to
right, then the whole top row left to right.

The comparator's third and fourth keys transpose:

```
wall → normalised band → y0Mm → alongMm → placementId
```

**Why row-major won, in the owner's terms** — recorded because the alternative was genuinely
defensible and a future session must not "fix" this back: **like is grouped with like, and the whole
hanging row reads as a row.** A customer scanning the breakdown is reading a row of cabinets, not a
sequence of vertical stacks; column-major interleaves two module lines and makes the list alternate
between them.

## What does not change, stated because three things elsewhere depend on it

- **The tie-break chain and its totality are unchanged in kind.** The same five keys, two of them
  transposed. QA's totality property still holds, and `compareIds` remains the last key — a **byte**
  comparison rather than `localeCompare`, because ids are opaque persisted strings and `"B"` and
  `"a"` order oppositely under the two. **The last key did not change.**
- **The comparator's totality still rests on placement-id uniqueness**, which is the validator's
  guarantee (`findDuplicatePlacementIds`) and not `DesignSchema`'s.
- **Grouping is untouched**: wall → normalised band, with `top` folding into `wall`. Only the order
  *within* a group moves, and `groupInDisplayOrder`'s single pass still works because the order stays
  wall-major then band-major.

**One worked example does not survive, and the argument it supported does.** The implementer used
`p8` and `p15` — both at 300 mm on wall A, both normalising to `wall` — to show the height key is
load-bearing, since without it the two compared equal. Under row-major they separate on `y0Mm`
immediately and never tie, so that pair no longer demonstrates it. Both keys remain load-bearing:
a pair sharing a `y0` still resolves on `alongMm`, and only a pair sharing **both** reaches the id.
The projection's own doc comment cites this pair and must be re-authored with the comparator, not
left describing an order the code no longer has.

## Alternatives considered

- **Column-major — along-wall position, then height.** What 6A shipped, and defensible: it reads as
  "everything standing at this point on the wall", which is how someone facing the kitchen sees one
  vertical slice. Rejected by the owner on the grouping argument above.
- **Leave it to each surface.** Rejected without needing the owner: it is the exact divergence wave
  6A exists to prevent, and the M6 plan names three groupings drifting apart as the phase's largest
  risk.
- **Read an order out of the mockup.** Not available — see above.

## Consequences

- Wave 6A's comparator changes, as part of its review-fix punch list, so the code and this record
  land together.
- **Wave 6B's "one price line per placement, in 6A's order" now means row-major**, and the plan says
  so explicitly rather than leaving 6B to re-derive an order it finds more natural.
- **Wave 6D inherits it**, and it is the second thing 6D must not quietly diverge from, alongside
  6A's convergence criterion.
- M8's review summary inherits it too, through the same projection, which is what keeps the three
  surfaces identical.
- This is a **customer-visible ordering**. It lives here rather than only in a comparator's key
  order, so a later reader finds a decision rather than an implementation detail.
