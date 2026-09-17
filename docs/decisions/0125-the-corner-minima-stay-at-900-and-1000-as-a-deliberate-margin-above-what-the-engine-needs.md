# ADR 0125 — The corner minima stay at 900 / 1000, as a deliberate margin above what the engine needs

Status: Accepted (owner ruling)
Date: 2026-09-17
Type: Decision (owner ruling)
Milestone: M7 — wave 7D6 (the corner's derivation) and wave 7D7 (the corner builders), the joint
bound slice both waves share; the ADR 0108 amendment it authorises for that slice is separately owed.

## Context

The 7D6 adjudication (`docs/milestones/M7-room-and-presets.md`, *7D6 adjudication — S2's shape,
2026-09-17*, D1 and D6) found that once the corner cabinet is sized to fit the room (ADR 0120
Amendment A: every cabinet is custom made, corners included), the smallest corner the product will
ever build no longer needs the reference kitchen's 900 mm / 1000 mm reach. The floor derivation
(D1, D6, criterion 4′) pins the gap between the approved minima and the derived floor-reach against
`WALL_MINIMUM_MARGIN_OWED_ON_Q_K1_MM`, measured at HEAD `76907f2` as `{ wallA: 20, wallB: 120 }`, and
the adjudication's *ADRs owed* item 2 says a dated record is required — a milestone entry is not
enough — if the owner keeps the approved bounds as they are, because doing so reverses the direction
ADR 0108 Amendment B1's guard was written to run in.

## The question, put twice

**First wording (7D6 adjudication, Q-K1), 2026-09-17.** The coordinator described the smallest
corner the derivation would ever produce as *"a cabinet with one door at each of the three
levels — the 200 mm you already set"*, making both wall minima 880, and offered three options:
move both minima to 880; move wall B only to 880 and leave wall A at 900; or keep 900 and 1000 as a
deliberate margin.

**The owner's first answer, verbatim, rejecting the premise:**

> *"Corner cabinets can't have 200mm at least on each wall 200 is already 400 mm so no for sure is
> not 200mm the corner cabinet"*

The coordinator stopped rather than proceeding on a corrected premise silently, and asked what the
smallest corner cabinet should be, offering today's shipped 900 + 320 return as one option to anchor
the answer.

**The owner's second answer, verbatim, which resolves the apparent contradiction:**

> *"we have 900 mm, 300 mm will be the corner cabinet half and another 600 mm, or 200 mm and a
> fridge equal to 700mm, on the next wall it also can take 200 mm, one 400 the small sink and 600 the
> hob + oven cabinet so everything fit and in this particular example the corner has 200+200 = 400mm
> the minimum possible corner"*

**Which reading governs, stated so a later reader does not conclude the floor is unsettled.** Read
plainly, the second answer is **200 mm per leg, 400 mm of corner across both walls** — exactly what
wave 7D7 had independently derived (`HINGED_CABINET_MIN_WIDTH_MM = 200`, the "one door at each of the
three levels" rule, Q-7D7-1). The first answer was **not** a rejection of the 200 mm-per-leg floor;
it was a rejection of *how the coordinator's wording described a corner* — calling a corner "200 mm"
when a corner spans two walls and is therefore 400 mm of cabinet is what the owner refused. **The
200 mm-per-leg floor is not in dispute between the two quotes; the wording that called it "a 200 mm
corner" was.** The second answer governs the derivation's floor; the first answer governs the
vocabulary the coordinator must not repeat.

**Second wording, put again with the premise corrected**, naming the owner's own example (900 mm /
300 + 600, 700 fridge; and 200 + 400 sink, 600 hob+oven — both fitting inside 880) as an instance
that fits inside the corrected bound. **The owner chose option 3: keep 900 and 1000.**

## Decision

**The approved wall minima stay 900 mm (wall A) and 1000 mm (wall B), although the kitchen can be
built against 880 mm on each.** This is a deliberate margin — **20 mm on wall A, 120 mm on wall B**
— stated as the owner's product choice, not as an engineering finding: the product refuses rooms it
could furnish, on purpose. **No room is withdrawn and none is newly admitted by this ruling.** The
measured alternatives, arithmetic over the approved bounds at HEAD (7D6 adjudication, Q-K1 table):

| | wall A | wall B | wall pairs admitted | newly admitted |
| --- | --- | --- | --- | --- |
| today / option 3 (chosen) | 900–6000 | 1000–6000 | 25 510 101 | 0 |
| option 1 (both to 880) | 880–6000 | 880–6000 | 26 224 641 | +714 540 |
| option 2 (wall B only, to 880) | 900–6000 | 880–6000 | 26 122 221 | +612 120 |

No option would have withdrawn any room admitted today; options 1 and 2 only lower a minimum. The
owner declined both, keeping the existing bounds unchanged.

## Consequences

**1. 7D6's J4 equality is superseded, and the margin is now ruled rather than owed.** J4 (restated as
criterion 4/4′ in the 7D6 adjudication) asked that the approved minima and the derived reach *agree*;
that equality was already struck in favour of a pinned margin at D6, before this ruling, because ADR
0108 Amendment B1's guard is `>=` and only the owner may choose a margin inside it. **This ruling is
what makes that margin a deliberate, ruled choice rather than a gap awaiting Q-K1's answer.** The
constant `WALL_MINIMUM_MARGIN_OWED_ON_Q_K1_MM = { wallA: 20, wallB: 120 }` now names a ruled margin,
and its name — which says the margin is *owed on* an open question — is false as of this ruling. The
corrected name this record proposes is `WALL_MINIMUM_APPROVED_MARGIN_MM`, or equivalent language that
states the margin is approved rather than outstanding. **This ADR does not rename the constant**; a
developer is concurrently implementing 7D6 slice S2 and the rename is code, not documentation — it is
the joint bound slice's to make, together with the amendment named in item 4 below.

**2. ADR 0108 Amendment B1's guard changes direction, and the consequence is an assertion, not a
change to the guard.** Amendment B1's guard (`expect(approved.minMm).toBeGreaterThanOrEqual(engine.minMm)`,
`tests/room/approved-room-policy.test.ts:98`) was written so that an engineering change moving the
engine's floor **past** the approved bound turns the guard red — the loud direction. Under this
ruling the approved bound sits **above** what the engine needs by a margin the owner has now chosen
on purpose, so the guard's `>=` is satisfied by a gap that must be **asserted as a specific size**
(`{ wallA: 20, wallB: 120 }`) rather than left as an inequality — otherwise a future shrink or growth
of the engine's floor inside that margin is invisible to the guard, which only reddens at the
boundary. **Criterion 4′, D6, already states this assertion**; this record is what makes the margin
it asserts a ruled number rather than a placeholder. The assertion itself is slice S3's, not this
record's.

**3. The joint bound slice — 7D6's S5 and 7D7's S5 — disappears, because no literal moves.** Both
slices exist solely to move `approved-room-policy.ts`'s wall minima and the derived corner-reach
literals under owner gating (7D6, *Files, and the must-not-change set*; 7D7, *S5 crosses a package
boundary inside one slice*). This ruling keeps every one of those literals exactly where it stands.
**Neither slice is dispatched.** `packages/configurator-domain/src/room/approved-room-policy.ts`
returns to the plain must-not-change set for both waves: 7D6's own text already reserves the file to
"slices S1–S3" only, and 7D7's S5 is not dispatched at all. **7D7's Q-7D7-2 (wall A moving to 880) is
answered by the same ruling** — it was, by 7D7's own text, "the same question about wall A" that
Q-K1 asked for wall B — and is struck as answered, not left open.

**4. The ADR 0108 amendment the adjudication names as owed still stands, and is now unblocked rather
than gated.** The 7D6 adjudication's *ADRs owed* item 1 calls for an amendment to ADR 0108, narrowing
Amendment A ruling 1 ("each L wall minimum is the largest far edge of that wall's structural corner
pieces over every declared cabinet depth") to **the corner's floor widths**, and adding **the room**
to the assembly's sizing (7D6 adjudication, D1: `cornerAssemblyWidthsMm({ cabinetDepthMm, room })`,
the room entering as a ceiling per ADR 0120 Amendment A, never as a target). It was gated on Q-K1;
**Q-K1 is now answered, so the gate is lifted.** The amendment is **owed by the wave that lands the
derivation** — wave 7D6 slice S2, or whichever commit actually implements `cornerAssemblyWidthsMm`,
`cornerFarEdgeMm` and `narrowestCornerReachMm` — and its content is: (a) narrow ruling 1 to the
corner's floor widths, not the reference-sized widths; (b) state that the derivation's argument is a
`(depth, room)` pair rather than a depth alone; (c) record that the approved minima (900/1000) are
retained above the derived floor (880/880) as this ADR's deliberate margin, citing this record. **It
remains unwritten as of this record**, and is not written here because it belongs beside the
derivation it describes, in the commit that ships it — writing it now, against code that has not yet
landed, would risk describing a shape the implementation does not match.

## What this ADR does not do

It does not move any bound in `approved-room-policy.ts` or `ENGINE_ROOM_LIMITS`. It does not touch
`WALL_MINIMUM_MARGIN_OWED_ON_Q_K1_MM`'s name or value in code — that edit belongs to the joint bound
slice this ruling dissolves, or to whichever future commit the coordinator assigns the rename. It
does not answer Q-7D7-3 (the blind corner's carousel) or Q-A′.2 (whether the corner stays fixed for
the customer), both of which remain open and unrelated to this question. It does not reopen ADR
0108 Amendment B ("the owner approved the L bounds… 1. Yes looks like good boundaries") — that
approval stands; this record is the owner's confirmation that the same numbers stand again, now with
the reason recorded as a deliberate margin rather than as the only number then available.

## Alternatives considered

- **Option 1 — move both minima to 880.** Refused by the owner; not adopted.
- **Option 2 — move wall B only to 880, leave wall A at 900.** Refused by the owner; not adopted.
  Rejected also because it would have left wall A 20 mm stricter than the kitchen needs while wall B
  matched it exactly — an asymmetry with no stated reason.
- **Treat the first verbatim answer as a rejection of the 200 mm-per-leg floor itself**, forcing a
  re-derivation of 7D7's floors. Refused: the second verbatim answer's own arithmetic — "200+200 =
  400mm the minimum possible corner" — restates the 200 mm-per-leg floor exactly, and the coordinator
  confirmed the correction by naming the owner's own example as fitting inside 880 before the owner
  chose option 3. Reading the first answer as touching the floor would misattribute a wording
  objection to a numeric one.
- **Leave the margin unrecorded and rely on the milestone entry alone.** Refused by the adjudication's
  own *ADRs owed* item 2: a milestone entry is not enough when the consequence reverses the direction
  a dated ADR's guard (0108 Amendment B1) was written to run in.

## Decision-record sweep

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment B, decision B1 | Approved minima are literals guarded `>=` against the engine's derived floor; a guard that turns red is the loud direction. | **The 900/1000 literals are reaffirmed as approved data.** The guard's silent direction (a floor shrinking under an unmoved bound) is now covered by the pinned margin (7D6 criterion 4′), asserted as this ruling's specific gap rather than left as an inequality. |
| [0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) Amendment A | Every cabinet is custom made, corners included; the room enters the corner's sizing as a ceiling. | **Unaffected.** This ruling is about which bound the *product* enforces at Step 1, not about whether the algorithm sizes the corner to the room — it still does. |
| 7D6 adjudication, D1, D6, Q-K1 | Names the margin `WALL_MINIMUM_MARGIN_OWED_ON_Q_K1_MM`, gates the joint bound slice on Q-K1, and requires a dated record if option 3 is chosen. | **This record.** Q-K1 answered; the margin is ruled, not owed; the joint slice does not dispatch. |
| 7D7, Q-7D7-2 | "The same question about wall A" — wall A's minimum moving to 880 under the derived X-leg. | **Answered by the same ruling.** Struck as answered in 7D7's section. |
