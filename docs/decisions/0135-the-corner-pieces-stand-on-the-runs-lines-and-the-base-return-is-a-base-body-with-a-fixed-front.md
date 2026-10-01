# ADR 0135 — The corner pieces stand on the run's lines, and the base return is a base body with a fixed front

Status: Accepted (decision). Slice S1 is committed as `c4eeea6`. Slice S2 is implemented, QA-green and
logic-approved, awaiting a visual pass and a comment-fix batch, and is not yet committed; neither is
described here as shipped beyond that.
Date: 2026-10-01
Type: Finding + Decision (owner rulings, relayed selections)
Milestone: M7C, wave C4 (`docs/milestones/M7C-m7-feedback-fixes.md`, *C4 — the corner seam*); owner feedback
M7-FB-006 (`docs/M7-FEEDBACK.md`)

**Decided and landed are kept apart.** Everything below is the decision and the result its implementer
or QA measured. S2's hash is added at wave close. Labels: **[doc-quoted]** from the plan
or a record, **[relayed]** measured by C0, QA, the implementer or the visual reviewer and relayed to the
scribe, who did not re-run it, **[source-verified]** read at the file and line named, **[inference]**.

## Context

The owner's feedback M7-FB-006 reported that at both corners of a run the corner unit's front and
worktop edge are set back from the adjoining cabinets, so the fronts are not on one line
(`docs/M7-FEEDBACK.md`, *M7-FB-006*). The reporter recalled earlier milestones mentioning it. No record
names the setback: ADR 0025 records the legs' depths as measurements of the reference room and never
compares them with the run beside them.

Measured before the change, by C0 and confirmed independently by QA [relayed; plan, *C4 — S0* and
*ADR 0135 draft*, item 2]. Identical at 600 and 700 mm, in an L, a right-hand L and a U:

| Piece | Worktop front | Face | Carcass | Plinth |
| --- | --- | --- | --- | --- |
| Base return (side wall) | 20 mm behind the neighbour | bare carcass 8–10 mm behind the neighbour's door | +10 | +10 |
| X-leg (back wall) | +10 | door +11 | +10 | not measured in the draft |

The return is behind because it is built `D − 20` deep with a 20 mm worktop overhang and no front. The
X-leg stands in front because its carcass front is the joint with the return, at `D − 20`, where the
run's carcass front is `D − 30` [doc-quoted: plan, *S0*, table, built from `kitchen-parts.ts` at the
lines the plan names; not re-read by the scribe].

## Owner rulings, 2026-10-01

Both were given by selecting an option the coordinator offered. They are selections, not verbatim prose.

- **Q5 (M7-FB-006).** Selected: *"Everything on one line"* (plan, *Q5 — FB-006. ANSWERED 2026-10-01*).
- **The joint.** Selected **(J), move the joint**, over **(K), keep the joint**. The offered wording of (J),
  relayed in the plan: *"Everything ends on one line, as you chose in Q5. The side corner piece becomes
  330 mm wide (was 320) and the corner cabinet's door 290. It changes a recorded corner-geometry decision
  (ADR 0025) and the smallest corner the engine accepts (880 → 870; approved room minimums unchanged).
  Kitchens already saved in preview/test databases keep the old piece and would show a 10 mm slit; no
  migration, since nothing is released."*

## Decision

**1. One line.** At a corner, every base piece's worktop front edge and front face stand on the same
line as the base cabinets beside it, at every cabinet depth `D`. Every figure is derived from the run's
own constants, never tuned to a measured gap.

**2. S1, the base return becomes a base body with a fixed front.** The return is built to the run's
carcass depth, `D − 30` (570 at 600, 670 at 700), written as the run's carcass front rather than a
literal. Its worktop takes the run's own 50 mm front overhang, so the slab is `D + 20` deep with its back
face on the wall. A fixed front sits on the run's door plane. In the domain, the return's frame depth is
`D − 30` and its occupied and finished depth is the base finished depth (620 at 600, 720 at 700).
Its back face stays on the wall plane, so §11 row 19 is untouched. It stays structural (ADR 0021): no
handle, no door count, no finish control, no price line of its own. It is not named `door_front`, so no
front, handle or push-to-open census counts it.

Measured after S1 [relayed]: worktop, face, carcass and plinth differ by 0 against every base-row
neighbour at 600 and 700, in an L, a right-hand L and a U.

**3. Beside a tall column the return stands 10 mm proud of the column's door, as any base cabinet does.**
This retires an older relation, the return's worktop finishing "1 mm proud" of a column run (plan, *One
consequence to show the owner*, and the parity test `cabinet-depth-sweep.parity.test.ts`, which the plan
says pins it [doc-quoted]). QA found no dated decision that pins it for the return. ADR 0058 line 30
says "1 mm proud — flush" of top cabinet `p23` over the pantry only, and `docs/milestones/M6-price-and-global-settings.md:6338`
says the same of `p23`; neither names the base return [source-verified, both read]. The owner's ruling
for one line makes a base-cabinet relation the right one, and the owner sees it at the visual gate.
It occurs in generated U rooms: 2,630 left and 2,708 right of 47,691 composed, witnessed by U 4200 / 1600
/ 1700 and U 4200 / 1700 / 1600 [relayed]. The seam reads +10, as any base cabinet's does.

**4. S2, the joint moves to the run's carcass front, `D − 30` (implemented and measured, not committed).**

- The X-leg is built `D − 10` deep (590 at 600) and stays seated at −0.020, so ADR 0025 decision 3's
  pinned −0.020 and §11 row 19's named exception are unchanged. Its frame depth is `D − 50` (550 at
  600). Its carcass front lands on `D − 30`; its worktop, door and carcass land on the run's lines. Its
  finished depth goes 630 → 620 (the `+10` reach constant is gone) [relayed; the plan's S2 table
  removes `CORNER_BASE_X_WORKTOP_REACH_MM`].
- The base return becomes 330 mm wide, centred at 735 mm along its wall (835 at 700); the X-leg's leaf
  becomes 290. The return's near edge along its wall moves to `D − 30`.
- The engine's corner floor follows the derivation, 880 → 870. The approved room minimums
  (`APPROVED_ROOM_POLICY`, ADR 0125) are unchanged.

Measured by QA [relayed]: all corner seams read 0 / 0 / 0 / 0 (worktop, front, carcass, plinth) at 600 and
700, in an L, a right-hand L and both U corners. 0 approved rooms change verdict. Generated rooms,
245,211 L and 92,781 U, are byte-identical apart from the return's width and centre and two recorded
column fields. Price totals are identical. The leaf stands 12 mm clear of the return's fixed front; the
plan's first draft said 11, and the plan now says 12 [doc-quoted: plan, S2 *Expected*].

The 870 floor has one reachable effect, stated so it is not mistaken for a product change. A room with a
wall of 870–879 mm now composes in the engine (for example an L of 870 / 3000) where it threw before.
It is reachable only by calling the domain directly: `ENGINE_ROOM_LIMITS` is read only by
`generation/shell-design.ts`, and the one production caller runs after the approved-policy check
[relayed from the S2 reviewer; not re-read by the scribe]. ADR 0125's margin above the engine floor
widens from 20 to 30 mm on wall A, and from 120 to 130 mm on wall B [inference: the margins in ADR 0125
line 62 less the 10 mm the floor moved].

S1 goes first. The slices move different axes of the return, S1 its depth from its own wall and S2 its
near edge and width along that wall, and S1 alone leaves a consistent product. The cost is one temporary
constant that holds the X-leg's leaf still in S1 and that S2 deletes.

**5. The supplier's reference geometry is departed from on purpose.** Each moved mesh is a named
departure in the M1 parity gate, with old and new value, as ADR 0098 does for its sink slabs. The pins
move only for the meshes the plan lists: the return's `carcass`, `plinth` and `countertop` (depth and
z) and the added `fixed_front`.

## Alternatives considered

| Option | Verdict and the sentence that kills it |
| --- | --- |
| **(K) Keep the joint**, move only the X-leg's worktop | Rejected by the owner. The door stays 11 mm proud, and the worktop moves by a chosen overhang rather than by the line. |
| An 8 mm panel on the unchanged return carcass | Rejected. The thickness is chosen to close a measured gap, and the carcass and plinth stay 10 mm proud. |
| A door on the return | Rejected. It would be a front that opens onto a blind box. |
| X-leg at full depth `D`, seated −30 | Rejected. It restates ADR 0025 decision 3's pin for a cabinet standing further inside the wall. |
| X-leg `D − 30` deep with its back on the wall | Deferred, not refused. It is the cleanest geometry but ends the joint-seated class (ADR 0077) and row 19's exception, which reaches `set-cabinet-depth.ts`'s joint arm. |
| **Selected: S1 by construction, then S2 as (ii), `D − 10` seated −20** | It moves the fewest dated values, and the return's four lines equal the run's by construction at every depth. |

## Consequences

- **Stored designs, no migration** (ADR 0038 decision 1, pre-release; its 2026-09-02 correction records
  that stored rows do exist, which is why the effects below are listed, and nothing here is a schema
  change). Two effects are known and
  accepted:
  - *From S1.* A design whose depth was changed before S1 stores `seatDepthMm` 680 for the return (580
    after 700 → 600) against a 670 body, and `columnExtents[].depthMm` 600 for it. It stands 5 mm off the
    wall and 5 mm proud, with no finding, until its next depth change [relayed]. Reading it right on load
    is possible but would extend ADR 0077 decision 4's read-side rule, today scoped to the joint arm,
    to the return. Deferred.
  - *From S2.* A design stored before S2 keeps a 320 mm return and shows a 10 mm slit **in the carcass
    and in the worktop stone**. It is **permanent**: a depth change never heals it, because the depth
    command slides every body rigidly and the corner widths stay frozen (ADR 0089 [relayed from logic
    review R4.1; the clause was not re-read by the scribe]). It raises 0 findings and does not crash
    [relayed]. The owner's accepted option text said only *"would show a 10 mm slit; no migration, since
    nothing is released"*. The stone and the permanence go beyond those words, and the coordinator is
    telling the owner. A read-side fix, re-deriving the structural return's width at the
    `migrate-design.ts` load seam, would amend ADR 0089 and count as a migration under ADR 0038
    decision 1. It is **not built**.
- **A stored name now misdescribes its body.** The build id `base-corner-return-320` names a 330 mm body.
  The id is a stored name and is kept. Nothing parses the number in it, and price is flat per build id
  [relayed].
- **ADR 0021 decision 2 is unchanged and obeyed**: the return stays a filler that holds the run together,
  with no finish, handle or width of its own. It now has a front, and that front wears the body's finish
  (plan, S1 item 3, and criterion 6), which narrows the *default material* consequence ADR 0021 line 41
  recorded without reopening the clause.
- **Price is unchanged** [doc-quoted; the plan has S1 measure it]: the return is priced by its build id,
  and `fronts: NO_OPENING_FRONTS` stays, so no hardware line.
- **The wall-row return does not move.** Its near edge is the wall-cabinet depth, a separate arm
  (plan, *S0*).
- **The parity gate's pins move only by the list in decision 5.**

## Decision-record sweep

| Record | What it says | How it is settled |
| --- | --- | --- |
| [0025](0025-the-corner-base-legs-seat-on-the-l-joint.md) decisions 1, 2, 3; *Finding* `:43-45` | The return leg is 580 deep and seats at 0.29 (`:40-41`); `p26` has `frameDepthMm` 580 and `p25` 560 (decision 1); the X-leg's seam is *"at z = 0.58, which is the return leg's own depth"* (`:43-45`); −0.020 is pinned (decision 3). | **Amended** for the return: 580 → 570 deep, frame 580 → 570 (S1). The seam holds in S1 but the identity with the return's depth ends. S2 (built, measured) restates the seam as 0.57 and the X-leg frame 560 → 550. Decision 3's pin and row 19's exception are **unchanged**. A dated pointer is added there. |
| [0077](0077-a-joint-seated-body-declares-its-seat-and-is-never-measured-for-one.md) `:39`; decision 4 | The return declares 580 and measures 580; a joint-seated body's stored seat is ignored on read. | **Pointer added.** The return becomes 570. Decision 4 is **not extended** to the return. Its 580/680 table is a 2026-09-05 measurement and is not edited. |
| [0079](0079-a-republished-depth-names-the-body-it-came-from.md) `:63` | `base-corner-return-320` ties other bodies at 0.6 exactly. | **Pointer added.** After S1 the return's finished depth is 0.62 (0.72), so that pair listing no longer holds for it [inference; no re-run]. The decision is unchanged. |
| [0058](0058-the-two-deep-top-cabinets-are-pinned.md) `:30` | `p23` is *"1 mm proud — flush"* over the pantry. | **Pointer added.** That row is about a top cabinet and is unaffected; it was not the source of any return relation. |
| [0089](0089-the-along-wall-chain-is-kept-and-its-reader-is-the-depth-command.md) | A depth change slides wall-B bodies along the wall; its table lists the return's near edge at 580 (`:52`). | **Unchanged, and the source of the permanence** of the stored 320 mm return (Consequences). Its 580 is a 2026-09 measurement; after S2 the return's near edge is 570. Its 30 mm side-wall residue is not touched. |
| [0021](0021-corner-returns-are-structural-in-data.md) decision 2 | The return has no finish, handle or width. | **Cited, unchanged.** |
| [0038](0038-pre-release-no-stored-designs-no-migrations.md) decision 1 | No migration is owed for a model change before release. | **Followed.** The consequences section lists what a stored design shows. |
| [0125](0125-the-corner-minima-stay-at-900-and-1000-as-a-deliberate-margin-above-what-the-engine-needs.md) | The approved corner minima stay 900 / 1000, a deliberate margin above the derived 880 floor. | **Unchanged.** Only the derived engine floor moves, 880 → 870 in S2 (built); the approved minima stay as ruled and the margin above the floor widens. 0 approved rooms change verdict [relayed]. |

## What this record does not decide

Whether the stored-design effects of S1 and S2 are corrected on load. Whether the X-leg later moves to `D − 30`
deep with its back on the wall. Where ADR 0089's 30 mm side-wall residue goes, which this record does not
touch.
