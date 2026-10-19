# ADR 0130 — A straight kitchen is the composer's run on one wall with no corner

Status: Accepted — owner ruling, 2026-10-06. ~~Proposed — with wave 7J's plan, 2026-09-24~~ (the
original status, kept visible). Reason: wave 7J shipped it (`docs/STATUS.md` records *"M7 wave 7J is
DONE"*, last updated 2026-09-28, straight kitchens through composition); the owner moved it from
Proposed to Accepted on 2026-10-06.
Date: 2026-09-24
Type: Decision
Milestone: M7, wave 7J (`docs/milestones/M7-room-and-presets.md`, *Wave 7J — the plan (2026-09-24)*)

**Pointer, 2026-10-01.** The sweep row at `:102` cites *"7D2 c. 14 … no uppers over the corner"*. That
criterion is overturned for an L and a U by
[ADR 0110 Amendment O](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md#amendment-o--2026-10-01-a-fixed-corner-wall-unit-stands-over-every-generated-corner-the-top-row-the-validators-banded-reach-and-the-fridge-gap-absorb)
(O3). For a straight kitchen it stands, since a straight kitchen has no corner. Nothing here is struck.

## Context

Owner question Q5 put straight kitchens in M7 (*"all kitchen shapes (exluding island)"*); F1 approved
a straight wall at 1200–6300 mm ([ADR 0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
Amendment D), and Q-7J-1 (2026-09-23) replaced the 6300 with the one maximum every wall has (ADR 0108
Amendment G). ADR 0110's *Consequences* predicted the cost: *"A straight (linear) kitchen would need a
different shell and nothing else."* Read at `8cd084b`, that is nearly true: the stored room already
accepts `"linear"` (`design.ts:51`), the composer is pure over two run capacities, and generation is
L-only at four call sites (`shell-design.ts:186`; `generate-kitchen.ts:153-156, 633, 724`). What the
prediction missed is that `wallLengthMm("B", room)` returns `depthMm` for every shape
(`queries/overflowing-placements.ts:45-50`), so a straight room's *depth* would be read as a wall —
by the composer's reading-order key and by 7P2's preset column alike.

**Measured** against a `tsc` build of `src` at `8cd084b` (the plan's G5–G7): the composer fed one
wall as its suffix and an empty prefix composes every room from 1200 to 6300 mm with no refusal, no
body on wall B, no overflow and a bare end ≤ 599 mm; the owner's own 3700 mm kitchen comes out as
*fridge, sink, dishwasher, drawer cabinet, hob, oven tower* — the list they gave in their own words.

## Decision

1. **Bounds: wall A 1200–6000 mm; height shared 2200–3900** (ADR 0108 Amendment G). The policy states
   ~~`linear: { wallA }`~~ **and no `minimumKitchen`**: with no corner, *"must hold a sink and a hob"*
   (ADR 0108 C, F6) is exactly *wall A ≥ sink + hob*. `ENGINE_ROOM_LIMITS.linear.wallA` is derived —
   sink + hob from `GENERATION_PRIORITIES`, maximum `MAX_ROOM_WIDTH_MM` — and the approved literals sit
   inside it. No new issue code.
   **Correction, 2026-09-28 (review finding F4):** `LinearWallBounds` actually carries
   `{ wallA, depthMm }`, not `{ wallA }` alone (`room-policy.ts:55-58`). `depthMm` is fixed at
   `LINEAR_ROOM_DEPTH_MM` and never varies across a policy — it is not a second bound to tune. It rides
   on the policy interface, rather than being imported directly by `validate-room.ts`, because that
   module holds its own guard (*"`validate-room.ts` can read no depth…"*) to type-only imports so it can
   never reach a cabinet-depth reader; a value import of this unrelated room depth would weaken that
   guard's mechanism for every depth, not only the one a straight room is exempt from
   (`room-policy.ts:50-54`, `validate-room.ts:165-169`).
2. **`depthMm` of a straight room is the drawn floor's depth in front of the run, never a wall.**
   Validation writes `LINEAR_ROOM_DEPTH_MM`, the seeded shell's 3400 mm (`design-bounds.ts`), so a
   stored straight room keeps the four-key shape every reader expects. ~~Generation never reads it.~~
   **Correction, 2026-09-28 (review finding F1):** *composition* never reads it — the composer places
   bodies with no reference to it. It is not true of generation as a whole: `depthMm` still bounds
   wall-A cabinet/column depth through the ordinary `reachesPastRoomAcrossWall` check
   (`validate-design.ts:617-625`) every room shape gets, since a straight room's drawn floor is only
   3400 mm deep in front of the run. A cabinet whose own declared depth exceeds that is refused, same
   as for any other shape.
3. **A straight room has no wall B: `wallLengthMm("B", linear) = 0`.** Extends
   [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decision 5 (*"each wall's
   own run"*) to a shape with one wall; a wall-B body in a straight document is marked, not refused.
4. **The shell has no corner:** no structural placement, floor and wall-only runs `[0, W]` less the
   odd millimetre, no depth reserve, nothing on wall B. The L's builder and its `ROOM_NOT_L` refusal
   are unchanged.
5. **Composition is the L's composer with the one wall as the suffix and an empty prefix.** The owner's
   order reads left to right from x = 0; the tall block, if any, stands at x = W; the dishwasher's
   across-the-corner arm and the corner's upper-free zone do not exist; every other rule — drop order,
   widths, leftover, bottle, pan drawer, threshold drawer, one oven, uppers and hood — applies as
   written.
6. **No corner, no direction.** Validation never writes `cornerDirection` for a straight room, and
   `cornerDirectionOf` answers `"left"` for one, so a straight kitchen is never mirrored
   ([ADR 0129](0129-a-right-hand-l-is-the-left-hand-design-drawn-in-a-reflection-and-the-reflection-is-a-per-group-primitive.md)
   is a decision about a corner). **Trigger** (ADR 0118): the owner asks for the fridge at the right.
7. **3D:** the wall-B plane is hidden, not removed; no end panel at x = 0 (ADR 0120 D2's rule at the
   run's start); the right panel is unchanged; a straight room offers the `overview` and `wallA`
   cameras only, and a stale `wallB` stands at `overview`.

## Alternatives considered

- **6300 mm for a straight wall** (F1's number). Rejected on measurement: 6001–6300 holds no body more
  than 6000 (10 bases each), and its mean bare end is 350.5 mm against 174.4 mm below; 6000 fills
  exactly, 6300 leaves 500 mm bare. The owner's reason for 6300 — a straight wall fits a full-size
  cabinet where a corner stood — already holds at 6000, whose free run exceeds the L's longest (5100).
- **A `depthMm` that is optional or `null` for a straight room.** Honest, and a change to the stored
  contract and to every reader of the room for a value only the drawing uses. Rejected.
- **`depthMm = widthMm`** (a square room). Draws a 6 m floor behind a 6 m run. Rejected.
- **A separate straight-kitchen composer.** Two implementations of the owner's order would drift;
  every 7D2–7D5b rule would need a second test suite. Rejected.
- **Keeping `wallLengthMm` shape-blind and branching in the composer.** Leaves the 7P2 defect live for
  every other reader. Rejected.

## Consequences

- The L's composition, shell, 3D and every recorded baseline stay byte-identical (wave 7J A1).
- M7B inherits a composer that already runs with an empty prefix, and a `wallLengthMm` that already
  answers per shape.
- A straight kitchen shows an unpanelled end at x = 0 (a fridge side, or a sink side below 2500 mm).
  **Trigger:** the owner objects on seeing it.

## Decision-record sweep

Swept 2026-09-24 for `linear`, `straight`, `1200`, `6300`, `6000`, `wallA` over `docs/decisions/`.

| Record | What it says | Effect |
| --- | --- | --- |
| 0003 *Open questions* 14 | When linear returns, with which recipes and per-wall data. | **Answered for linear**: no recipe (presets deferred); one wall, decision 1. |
| 0108 decision 8 | Only the L maps onto a `DesignRoom`. | **Extended** by decision 2. |
| 0108 B2, D | Linear stays refused until its wave; F1 *"Yes, 1200–6300 mm"*. | **Discharged**; the maximum superseded by Amendment G. |
| 0108 C, E | Coupled sink-and-hob rule; generated 600 + 600. | **Collapses** into wall A's minimum (decision 1). |
| 0109 A2, A3 | Mirror is presentation; a preset loses columns from *"a straight wall's far end"*. | Kept; A3 is deferred with presets. |
| 0110 *Consequences*, A1, D2, E3, M (F12), 7D2 c. 14 | Different shell and nothing else; reading order; prefix reversal; block at the free end; dishwasher across the corner; no uppers over the corner. | **Applied** by decisions 4–5; D2, F12 and c. 14 have nothing to act on. |
| 0116 | The type widens in the wave that designs the shape; 7J changes nothing under `src/room`. | **Discharged**, and the `src/room` claim narrowed — 0116 Amendment A. |
| 0118 | A problem not yet met is recorded with its trigger. | Decisions 6, 7's triggers. |
| 0120 B2, D1–D3, E | 6000 per wall; the entered number is the run; no panel at a run's end; draw the kitchen; wider-wall key. | **Applied**: decision 1, 2, 7; E is moot on one wall (decision 3). |
| 0124 | One horizontal wire bound, 6300. | **Unchanged**; 6000 ≤ 6300 keeps its margin. |
| 0125 | The corner minima keep a margin over the engine. | **Not applicable** — no corner; 1200 equals the engine's derived minimum. |
| 0126 | Lengths typed in whole millimetres; URL in metres. | Unchanged; the straight room's one field follows it. |
| 0129 | A right-hand L is a reflection of the left. | **Scoped to a corner** (decision 6). |
| 0065 decision 5 | Each wall's own run bounds it. | **Extended** (decision 3). |
| 0028, 0044, 0053, 0068, 0073, 0079, 0090, 0092, 0093, 0097, 0099, 0100, 0011, 0027, 0048, 0076, 0077, 0087, 0117 | Term hits on *linear in width* pricing, *straight* as an adverb, 1200/6000/6300 as coordinates or derived caps. | **No bearing** (read, not a room rule). |

## Dated note — 2026-10-17: the measured "bare end ≤ 599 mm" (line 31) and ADR 0167 (Proposed)

The *Context* measurement (line 31: *"no body on wall B, no overflow and a bare end ≤ 599 mm"*) was taken against `8cd084b`
and describes the composer **before** the owner's 2026-10-17 Fix 1 ruling. It stays true of that commit. Once
[ADR 0167](0167-generation-fills-every-free-wall-run-end-that-the-narrowest-catalogue-cabinet-fits-at-every-level-its-column-carries-and-a-narrower-end-stays-bare.md)
is Accepted, a straight kitchen's bare end is at most one millimetre under the catalogue's narrowest cabinet (a
remainder at or above it is filled, between the run and its tall block or fridge, which then stand at the wall's end;
0167 D5). The straight kitchen's decisions 1 to 7 are unchanged. Nothing is struck; this is a forward pointer while 0167
is Proposed.
