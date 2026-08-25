# M5 — Width editing as a neighbour boundary move

> **STATUS: PLANNED.** Depends on M4. Summary: `docs/STATUS.md`.

Status: planned. Depends on M4.
Reference: `DEVELOPMENT-SPEC.md` §5.4, §7 (width chip sets), §9 item 6, §13.1, §13.2;
§11 rows 9–14.

## Goal

Changing a cabinet's width moves the boundary it shares with one neighbour. The run total is
conserved, so overlap is unrepresentable and shrinking cannot leave a gap.

## Why last among the editor verbs

§12 step 6. Resize is the only operation that changes a second body, so it depends on every other
guard already being correct.

## Scope

In: `setWidth(target)`; donor selection; the width chip section's states and consequence line.

Out: run re-split — offering a run's total as valid module combinations — which is designed but not
built and is explicitly out of scope (§12, §13.3 q2).

## Work items

1. Implement `setWidth(target)`: validate the target against the body's own legal sizes, find the
   neighbours, choose a donor, move the shared boundary, rebuild both bodies, recompute voids and
   reselect the edited body.
2. Implement `canGive`: a donor must exist, not be an accessory, not be fixed-width, not be a
   corner, and resolve to a catalogue entry.
3. Implement the chip states — active, free, blocked — and the consequence line.
4. Implement `buildIdOf` for bodies that came from a preset rather than from a customer choice.

## Acceptance criteria

The boundary move:

- Neighbours are found on the same wall, in the same row (vertical starts within 0.06 m), and
  edge-adjacent (within 0.03 m).
- When growing, the donor is the first of right-then-left that can give **and** would remain at or
  above `MIN_W` (0.30 m). When shrinking, it is the first of right-then-left that can give.
- The edited body's outer edge — the one away from the donor — holds. The donor's far edge holds.
  Only the shared boundary moves.
- **The run total is conserved.** No resize creates an overlap or a gap. Only deletion creates free
  space.
- **Row 9.** Resizing 600 → 800 beside a 600 mm neighbour leaves the neighbour at 400 and both outer
  edges unmoved.
- **Row 10.** 600 → 1000 is not offered, because it would push the neighbour below 300.
- **Row 11.** Beside a corner or an appliance every chip is blocked: corners and accessories never
  donate.
- **Row 12.** A resize preserves both the chosen finish and the chosen handle. (The recorded defect:
  resizing silently reset a sage door with black bars to default white with steel.)
- **Row 13.** Resizing a top-row unit leaves it push-to-open unless a handle was explicitly chosen.
  Choice beats default; default beats nothing.
- **Row 14.** The dishwasher accepts only 450 and 600 and the hood only 600 and 900; anything else
  is refused with a reason.
- When no donor qualifies, the refusal names the reason — which side was tried and why it could not
  give.
- A body loaded from a preset resolves to a catalogue entry by inspection (a faucet or bowl floor
  means a sink; three or more drawer fronts mean a three-drawer; two mean a pan bank; otherwise door
  count decides). A body the customer chose uses its recorded id directly.

The chip section:

- Chip sets come from the body's own legal sizes: 450/600 for the dishwasher, 600/900 for the hood,
  400/600/800 for everything else. **1000 mm does not exist** — two doors top out at 800, and it was
  removed deliberately.
- Each chip renders as active, free, or blocked. A blocked chip is dashed and unclickable.
- The consequence line states where the width comes from and what the limits are, in the mockups'
  form: "Lățimea se ia de la vecinul din dreapta (600 mm). Maxim 800 mm; sub 300 mm nu se coboară."
- The section renders only when the selection is a body, is not empty, and is not fixed-width.
- **No free-form width entry.** Only module values exist; a numeric field invites invalid states and
  arithmetic the customer should not be doing. This was considered and rejected.

Surfaces:

- **Mobile (gate):** at 390 × 844, changing a width by tapping a chip visibly resizes both bodies in
  the scene, the chip row scrolls horizontally, and a blocked chip cannot be activated by touch.
  Verified by real interaction.
- **Desktop (same phase, separate line):** identical chip components at the larger spacing scale in
  the 420 px rail.

## Risks

- **Auto-shifting the whole run to make room.** Rejected on record: positions carry meaning — sink
  under the window, hob under the hood, dishwasher beside the sink — and silently sliding a run
  breaks those relationships invisibly. If this is ever wanted it must be an explicit named action.
- **Rebuild dropping the recorded finish and handle.** Row 12 exists because this happened. The
  rebuild path re-applies both, for the donor as well as the edited body.
- The approved discrete width set is an open product question. The prototype's 400/600/800 and the
  appliance sets are prototype values and must stay catalogue data, never constants in the resize
  logic.

## Verification

- Table-driven tests for rows 9–14, asserting the resulting widths of **both** bodies and the two
  edges that must not move.
- A sweep over donor configurations: no donor, left-only, right-only, both, corner-adjacent,
  accessory-adjacent, and donor-would-go-under-minimum.
- Assertions that the sum of widths along the affected run is identical before and after every
  successful resize.
- Real touch interaction at 390 × 844.
