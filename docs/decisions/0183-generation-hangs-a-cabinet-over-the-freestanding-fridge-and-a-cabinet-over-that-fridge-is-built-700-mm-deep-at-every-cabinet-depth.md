# ADR 0183 — Generation hangs a cabinet over the freestanding fridge, and a cabinet over that fridge is built 700 mm deep at every cabinet depth

Status: **Accepted** (2026-11-14), on the owner's answers to the M12 plan's §9 the same day [owner, relayed by the
coordinator]: Q3-1 leave the space empty below a 2600 mm ceiling, Q3-2 no surcharge (both answered explicitly), Q3-3 and
Q3-4 defaults stand. Proposed earlier the same day. Owner feedback of 2026-11-14, item 3. **Amendment A, 2026-11-15**:
decision 2's ceiling boundary was mis-measured and the Q3-1 answer rested on it; the cabinet is placed wherever the
insert succeeds, which is from a 2501 mm ceiling (coordinator ruling, owner told the same day). Read Amendment A before
decisions 1 and 2.
Date: 2026-11-14
Type: Decision record (generation rule and a depth rule; supersedes one clause of an owner-ruled amendment)
Milestone: M12 — [`M12-owner-feedback-2026-11-14.md`](../milestones/M12-owner-feedback-2026-11-14.md), waves W2, W3a, W3b

**Evidence tiers.** **[owner]**: `docs/OWNER_FEEDBACK.md`, *Round 2026-11-14*, item 3. **[doc]**, **[src]** (at
`c48992e8`), **[inf]** as in ADR 0182. **[measured]**: a run the architect made on 2026-11-14, described where cited.

## Context

The owner: pretty often, after a kitchen is generated, the cabinet above the fridge is missing; at depth 600 the cabinet
above the fridge is shallower than the fridge; *"The cabinet above the full size fridge should cover the fridge
(depth === 700 mm)"*; generation should always place it [owner].

### Why it is missing: a rule, not a defect

- ADR 0110 Amendment C (owner F2, 2026-09-11) places uppers *"never above the fridge (a column) and never in the top
  row"* (`0110-…:252-257` [doc]). E7 turned the name-skip into a rule on the declared height: no upper over a body whose
  declared top is above the wall row's floor, *"the fridge keeps its exact present behaviour and is the witness"*
  (`:785-794` [doc]). In code: `isAnUpperOwedOver` → `risesIntoWallRow` (`generation/upper-policy.ts:58-92` [src]); the
  top row is attempted only over a placed upper (`generate-kitchen.ts:785-815` [src]).
- ADR 0167, Consequences: *"Above a full-height body nothing changes (E7, O9) … L grid at 2600: 8 816 slots above
  fridges"* (`0167-…:165-167` [doc]).
- Two tests assert the empty slot: `generate-kitchen.test.ts:603` (*"leaves the wall row above the fridge empty"*) and
  `top-row.test.ts:243` [src].
- **[measured]** A scratch census (vitest over `generateKitchen` with the suite's fake probe, outside the repository):
  L, linear and U rooms, widths 2400-6000 step 400, depths/wall C 1800-5000 step 400, ceilings 2400, 2600, 2800; 810
  rooms, every one generated; 777 placed a `fridge-free`; **0 of the 777 had any body over the fridge.**
- So generation never places it. "Pretty often" is every generated kitchen; the owner sees one only where a kitchen did
  not come from generation, e.g. the reference kitchen's `p24` `wall-2door-700-over-fridge`
  (`kitchen-l-design.ts:617-633` [src]) or an owner-authored preset **[inf: presets were not read; falsified by a
  generated kitchen with a body over its fridge]**.

### Why it is shallow at 600

A wall body over a full-height column is built to `columnBuildDepthMm`'s lifted arm, the cabinet-depth line: 600 at
setting 600, 700 at 700 (`cabinet-depth-rule.ts:153-180` [src]), read by `resolveDepthM`, which never consults the
inserted body's own declared depth for a wall body over a lifted column (`commands/insert-fit.ts:678-695` [src]). The
fridge is a manufactured 742 mm finished depth at every setting (`catalog.ts:350` [src]). ADR 0101 measured exactly this
step, `p24` 142 mm recessed (`0101-…:36-58` [doc]). §7 says over a full-height column *"the carcass is as deep as the
column"* (`DEVELOPMENT-SPEC.md` §7, the `0.33` paragraph [doc]); for cabinetry the column is the setting, for the
freestanding fridge it is not.

## Decision

1. **Generation hangs one `wall-cabinet` on every generated freestanding fridge.** After every base is settled
   (including the free-end resizes and fills that may move the fridge, ADR 0167 D4, ADR 0110 O10), and before the top
   row, generation inserts `wall-cabinet` through `insertBody` into the opening whose floor is the fridge's top and whose
   span is the fridge's final span. The floor is read from the fridge's declared height (`nominalHeightMm`, 1850 today,
   `catalog.ts:233` [src]; ADR 0102: no generation-side copy). The width is the fridge's (700). The height follows §5.2's
   `resolveHeightM` unchanged (`insert-fit.ts:498-503` [src]). **[measured]** Inserting `wall-cabinet` into that void in
   generated designs (69 fridges per ceiling and depth, L/linear/U): at ceilings 2600, 2800 and 3000 it is placed
   750 mm tall (the opening is 1850-2600 because the module grid ends at 2600), 700 wide, floor 1850. **Incomplete —
   see Amendment A:** from 2501 to 2599 it is also placed, shortened to the opening (651 mm at 2501 … 749 at 2599).
2. **Where the room cannot take it, it is logged as not placed and nothing else changes** (Amendment C's own pattern: *"an
   upper that cannot be placed is logged as not placed and removes nothing below it"*). ~~**[measured]** Below a 2600 mm
   ceiling the void over the fridge is cut at the wall row's top (2200), 350 mm, and `insertBody` refused
   `OPENING_TOO_SHORT` in every room from 2200 to 2500 (`HEIGHT_FLEX_MIN_OPENING_MM` 400, `insert-fit.ts:54` [src]); at
   2000 no void exists. These are the rooms that get no top row (`upper-policy.ts:46-48` [src]).~~ **Struck 2026-11-15,
   Amendment A:** the 2200-2500 refusals were measured correctly, but "below 2600" was an inference over ceilings sampled
   in 100 mm steps, and it is false from 2501 to 2599, where the cabinet is placed; the bands are in Amendment A. The step
   looks the void up without `plannedVoid`'s throw (`generate-kitchen.ts:953-977` [src]). ~~Default of owner question
   Q3-1; a shorter cabinet under a lower ceiling would change how openings are cut (§4) and is not decided here.~~
   **Struck 2026-11-15, Amendment A:** a shorter cabinet needs no §4 change; it is §5.2's height-flex arm in one opening
   across two levels.
3. **The rule is the freestanding fridge's, not every full-height body's.** E7 stands for `tall-oven-tower`,
   `tall-pantry` and `tall-fridge-housing` (default of owner question Q3-3). The body is identified by a declaration on
   its catalogue row, never by its id or role name (ADR 0110 E7's own reason).
4. **A wall body over a freestanding fridge is built to the deepest declared cabinet depth (700 mm) at every cabinet
   depth.** `columnBuildDepthMm` gains a third answer: cap (wall map), lifted to the cabinet-depth line, or — where a
   full-height member under the column declares that what hangs over it covers it — the deepest declared cabinet depth
   (`declaredCabinetDepthsMm()`'s maximum, `worktop-depth.ts:67-70` [src]). A test pins that value to the owner's 700, so
   adding a depth row forces this decision to be taken again rather than silently moving the box.
   - The fact travels where `hasFullHeightUnder` travels: answered by `withCurrentFullHeightMembers` over the records
     (`void-engine.ts:840-870` [src]), never stored, so a frozen column keeps answering it currently.
   - It applies to any wall body standing there: the generated one, one a customer inserts, and the seeded
     `wall-2door-700-over-fridge`, whose `frameDepthMm` and 3D build depth move with it (`kitchen-l-design.ts:617-633`,
     `three-adapter/src/decomposed-bodies.ts:213-214` [src]).
5. **At setting 700 nothing changes** (the deepest declared depth is the setting). At setting 600 only a wall body over a
   freestanding fridge changes, 600 → 700.
6. **Price (default of owner question Q3-2): no deepening uplift.** ADR 0177 A-1 bills the deep-cabinet uplift only when
   the design's depth is 700 (`pricing/percentage-lines.ts:18-20` [src]); a 700 box in a 600 kitchen is priced as the
   kitchen's other wall cabinets. Recorded as a known under-billing of a placeholder amount, for the owner to overturn.
7. **Stored designs are never re-generated** (ADR 0167). A stored body over a fridge keeps its recorded depth until a
   command re-plans it (an insert in its column, a depth change; ADR 0103 decision 3); then it takes 700.

## Coordinate anchors, scaling and structural dependency (product-invariants)

- **Anchor:** back face on the wall plane (`seatedOnWallPlane`), floor = fridge top, along-wall centre = the fridge's
  centre. Depth grows forward from the wall, never into it (§11 row 19).
- **Scaling:** width follows the fridge; height follows the opening per §5.2 (~~750 wherever it is placed today~~ 651-749 mm
  from a 2501 to a 2599 mm ceiling, 750 from 2600 — Amendment A); depth is the declared 700, not a
  measurement (ADR 0060 d2: *"never the clearance MAX"*; 742 is a machine's depth and is not built).
- **Dependency:** the cabinet depends on the fridge under it. Deleting the fridge leaves the cabinet over an opening
  (§11 row 1's "one 750 mm slot above" is about the empty column, unchanged); its depth re-plans to the column's new
  answer by ADR 0103's trigger.

## Alternatives considered

- **A new catalogue body "cabinet over fridge" declared 700 deep.** Rejected: `resolveDepthM` never reads a wall body's
  own depth over a lifted column, so the declaration would be ignored; and it would add a price-book row, a dashboard row
  and a swap-list entry, and a customer swapping it for an ordinary `wall-cabinet` would get 600 again.
- **The fridge's own depth (742 finished, 680 carcass).** Rejected: the owner gave 700; ADR 0060 d2 forbids building a
  measured clearance.
- **A literal 700 in the depth rule.** Rejected for a derived value pinned by a test (ADR 0102: one authority).
- **Every full-height body.** Rejected for now (Q3-3): over the oven tower and pantry the setting line is flush or 38 mm
  recessed (ADR 0101's table), and the owner named the fridge only.

## Sweep

| Record | What it says | Settled how |
| --- | --- | --- |
| ADR 0110 Amendment C (owner F2, 2026-09-11) | Uppers *"never above the fridge"* | **Superseded for the freestanding fridge** by the owner's request of 2026-11-14 (item 3). Still true for the wall row's 1500 floor: the new body stands on the fridge's top, not on the wall row |
| ADR 0110 E7 (2026-09-14) | No upper over a full-height body; the fridge is the witness | **Kept for every other full-height body**; the fridge stops being its witness. Dated note owed |
| ADR 0110 E11 / O9 | Top row composed only over uppers | Unchanged; no top-row step is attempted over the fridge's cabinet |
| ADR 0167 Consequences (2026-10-17) | *"Above a full-height body nothing changes"* | **Superseded for the fridge.** Dated note owed |
| ADR 0109 Amendment E | Presets inherit the fill rule | Presets are not regenerated; a preset keeps what its author placed [inf] |
| ADR 0060 d2, ADR 0101 d1 | A build depth is declared; a lifted column answers the cabinet-depth line; the seeded deep tops' replacement assertion equals the lifted arm | **Amended:** a third declared answer; `wall-2door-700-over-fridge`'s assertion becomes the fridge arm. Dated notes owed |
| ADR 0101 d4 | *"The 600 mm kitchen is byte-identical"* | **Superseded for `p24` only** (600 → 700 at setting 600); every other placement stays byte-identical. Dated note owed |
| ADR 0103 d3 | Dependents re-plan when an insert writes to a column holding a body whose depth the column decides | Unchanged; it carries the new fact (criterion W3a-4) |
| ADR 0058, ADR 0097 | The deep tops were pinned | Already superseded by ADR 0101 |
| ADR 0177 A-1 | Depth uplift iff the design's depth is 700 | Unchanged (decision 6, Q3-2) |
| ADR 0107 d2 | The freestanding fridge is drawn and not sold | Unchanged; the cabinet over it is sold |

## Consequences

- A generated kitchen gains one `wall-cabinet` (and its hardware) wherever a fridge is placed and the ceiling allows:
  the price of a new generated kitchen rises. Stored kitchens are untouched until edited.
- The two tests that assert the empty slot are updated with their reason; the fridge-end census helpers in
  `tests/support/` are read for assertions about the slot above.
- §11 row 1 is unaffected (it is about the empty column after a delete).

## Amendment A, 2026-11-15 — the cabinet is placed wherever the insert succeeds; the 2501-2599 band was missed

**Source.** The W2 logic review, finding R1.1, and the coordinator's ruling of 2026-11-15; the owner was told in chat the
same day [relayed by the coordinator]. The bands below were measured by the W2 developer, QA and the logic reviewer in
source-verified runs [relayed; not re-run by the architect].

**What was wrong, and why.** Decision 2 and the M12 plan's §4 said nothing fits below a 2600 mm ceiling. The
architect's census sampled ceilings 2200, 2240, 2250, 2300, 2400, 2450, 2500, 2600, 2800, 3000: every refusal it
recorded was real, but the band 2501-2599 lay between two samples and was assumed refused. The owner's Q3-1 answer ("leave
empty below 2600") was given on that false premise, so it is not read as a ruling about 2501-2599.

**Ruling (coordinator, 2026-11-15).** The cabinet over the freestanding fridge is placed **wherever `insertBody`
succeeds**. Measured bands, by ceiling height:

| Ceiling | Outcome |
| --- | --- |
| ≤ 2150 | No opening over the fridge (`NO_OPENING`): no command is issued and nothing throws |
| 2151-2500 | `insertBody` refuses `OPENING_TOO_SHORT`; the refused command is logged; nothing else changes |
| 2501-2599 | Placed, shortened to the opening: 651 mm at 2501 … 749 mm at 2599. One §4 opening across two levels and §5.2's height-flex arm; **no §4 change** |
| ≥ 2600 | Placed, 750 mm (1850-2600; `LEVELS` ends at 2.6) |

Nothing is placed over the fridge's cabinet at any ceiling: the top row is never attempted over it (ADR 0110 O9), and
`hasRoomForATopRow` is false below 2600 (`upper-policy.ts:46-48` [src]).

**What this changes.** Decision 1's measured line and the *Scaling* bullet (heights 651-750); decision 2's boundary (struck
in place above); the M12 plan's §9 Q3-1 row and criteria W2-1/W2-2. Decisions 3-7 are untouched.

**Also accepted, for the backlog (not built).** While the cabinet hangs over a generated fridge, replacing that fridge
with a tower or a pantry is refused. Accepted as known behaviour for now.

**For wave W3a (logic review R1.3) [relayed].** W2 introduced the row declaration `WallBodyOverIt`
(`packages/configurator-domain/src/wall-body-over-it.ts`, one field `isOwedByGeneration`). Decision 4's depth fact goes
in a **sibling field** of `WallBodyOverIt`, not inside `isOwedByGeneration`'s meaning; the depth rule reads that field,
so QA's test "generation is the only reader of the declaration" is relaxed to "generation and the depth rule are the
only readers", with that reason recorded beside the test.

## Dated note — 2026-11-15: a delete then an insert that does not reach under a straddling wall body leaves its depth as recorded (W3a ruling)

**Question (W3a QA, relayed by the coordinator).** At setting 600: fridge 0..700, pantry 700..1300, a wall cabinet
`strad` 650..1000 overhanging the fridge by 50 mm, built 700. A one-command swap of the fridge for a housing or tower
re-plans `strad` to 600 (W3a compares `hasDeepWallBodyUnder` beside `hasFullHeightUnder`). Deleting the fridge, then
inserting a housing or tower where it stood, leaves `strad` at 700: the delete re-plans nothing, and the insert neither
flips a flag on `strad`'s column (the pantry keeps it lifted, the deep flag already went false at the delete) nor
reaches under it.

**Ruling: accepted as ADR 0103's documented consequence (option a). No code change.**

- ADR 0103 rules the trigger as *"an insert into the column beneath a standing body"* (`0103-…:50-53`) and the delete
  side out of scope **permanently**, by owner ruling: *"the interim state after a delete … is accepted as transient … no
  mirror wave for the delete side, and none is to be opened"* (`:54-62`, `:166-169`). The re-plan's three clauses
  implement exactly that (`commands/replan-dependent-members.ts:73-114` [src]): the occupied key, a flipped depth fact,
  or the inserted body overlapping the column. A housing or tower is 600 wide [inf: inserted into the fridge's 700 void
  at 0..600, which is what leaves 650..1000 un-overlapped; falsified if QA's insert lands overlapping], so none fires.
- **The pre-W3a arm behaves the same** [inf, read from the same three clauses]: a wall body straddling a lifting
  column by 50 mm and a non-lifting one, lifted to the cabinet-depth line; delete the lifting body (flag flips false, no
  re-plan); insert a non-lifting body that does not reach 650..700 — no flip, no overlap, no re-plan, and the body keeps
  its lifted depth over nothing. W3a's new fact inherits the trigger; it does not get a wider one.
- **Option b rejected.** Re-planning bodies in columns the insert neither went beneath nor changed would widen ADR 0103's
  owner-ruled trigger, for both arms, to repair a state the owner accepted. If staff or the owner find the stale depth
  wrong on screen, that is a change to ADR 0103 and its own ruling, not a W3a fix.
- **Reach [inf].** Generation never produces it: its cabinet over the fridge spans exactly the fridge (decision 1). It
  needs a customer to place a wall body straddling the fridge's edge, then delete and replace the fridge in two steps
  with a narrower body.
- **It clears itself** on the next change that re-plans that column: an insert whose span reaches under `strad`, or a
  cabinet-depth change (which re-plans wall bodies at the new depth) [inf: QA confirms both].

**Tests.** The four QA tests that assert "swap and delete-then-insert agree (600)" are rewritten, not deleted, with this
note cited beside them: (1) delete-then-insert of a body that does not reach under `strad` leaves `strad` at its recorded
700 (the documented interim); (2) delete-then-insert of a body whose span does reach under `strad`'s column re-plans it to
600; (3) after the interim, a 600 → 700 → 600 round trip leaves `strad` at 600; (4) the one-command swap still re-plans to
600 (unchanged). If (2) or (3) is red, that is a W3a defect and goes back to the implementer.

## Dated note — 2026-11-15: decisions 5 and 7 for seeded rows (W3b logic review)

[relayed from the W3b logic review by the coordinator; ADR 0038 and ADR 0080 d5 cited as relayed, not re-read here]

- **A seeded body's depth is read from its catalogue row at load.** `wall-2door-700-over-fridge` (`p24`) declares the
  fridge arm (W3b), so a stored document holding the seeded `p24` loads at 0.700 at setting 600 (it loaded at 0.600 at
  `HEAD`) — **even with no fridge under it** — until the next depth change re-plans it. This is a read-time answer, not
  a migration, of the kind ADR 0038 (pre-release: no stored designs, no migrations) and ADR 0080 d5 accept.
- **Decision 5's** *"at setting 600 only a wall body over a freestanding fridge changes"* is about **fresh states**
  (generated, inserted, re-planned bodies), not about stored documents holding a seeded row.
- **Decision 7's** *"a stored body over a fridge keeps its recorded depth until a command re-plans it"* is about
  **rebuilt bodies** (those standing on a catalogue equivalent with a recorded seat), not seeded rows, whose depth is
  their row's.
