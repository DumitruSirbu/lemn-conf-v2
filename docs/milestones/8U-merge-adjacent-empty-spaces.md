# Wave 8U — Adjacent empty spaces merge anywhere in a run

> **STATUS, 2026-10-17 (scribe): S0, S1, S2, S3, S3b, S4 and S4b BUILT; QA rounds A and B and the review fix pass
> landed; documentation closed. S5 is NOT built (behaviour-free; backlog 255). M8 is not done.** Owner answers
> [relayed]: Q-8U-1 = (b), Q-8U-2 = (a), **Q-8U-3 = (a), ruled but not built** (§6.3; backlog 246). The ADR draft (§9)
> is [ADR 0166](../decisions/0166-adjacent-empty-spaces-merge-whatever-their-total-and-800-mm-caps-the-cabinet-not-the-space.md),
> **Accepted**. Commits and the code-comment pointer table: *Close note, 2026-10-17* at the end of this file. The
> revision banners below are history.

> **STATUS: PLANNED by the architect, 2026-10-16. Revised the same day after S0's stop (§6.1).** S0 is done (tests
> and census, no production change). It hit §13 R1's STOP: with the cap lifted, generation throws. The owner
> answered **Q-8U-1 = (b)**. The architect's ruling on generation is in §6.1 and needs **no owner question**.
> ~~S1, S2 and S3 can be dispatched once S0 is verified and committed.~~ **Second revision, same day, after S3:**
> - S0 is committed (`6d2e1ec0`) and S3 is committed (`0f85ed23`).
> - Off S0's grid, S3's implementer hit §6.1's falsifier: the corner pair escapes its guard in rooms with an odd
>   wall-A width. The ruling is §4.2: the guard becomes geometric, in a new slice **S3b**. No owner question is
>   needed.
> - **Next, in this order: S1 → S2 → S3b → S4 → S5** (§11).
>
> The owner has one new question, **Q-8U-2** (§4.1). It is **non-blocking**, and its recommended default is what
> S3b and S4 build.
>
> **Third revision, same day, after S2:**
> - S1 is committed (`1e2621e2`) and S2 is committed (`62fee695`). S3b is in progress. Then S4, then S5.
> - S2's finding 3 is ruled in §6.2: an odd-width opening is a **known limit**, recorded with its trigger, not fixed
>   in 8U. It needs **no owner question**. It adds criterion 3a, which S4 runs.
> - S4's red list is reclassified from S2's run (§11, S4 item 3a). S4 owes two `it.fails` flips. The dispatch
>   essentials are after the slice table.
>
> **Fourth revision, same day, after QA round B on S4:**
> - Criterion 5 failed on monotone tolerance chains, for example depths 620 / 600 / 580. Clearing the right pair
>   first gives two columns, and the other orders give one.
> - Ruled in §6.3 as a **contract gap**. It is a known limit, gated by a census. 8U changes no merge logic.
> - Criterion 5 is restated to hold when the run's spread is within 20 mm. Criteria 2 and 7(b) and the F4 table
>   are corrected, and R14 is added.
> - A new slice, **S4b**, runs before S5. Its census decides whether the limit stands. If the census finds a hit,
>   the owner is asked **Q-8U-3**. If it finds none, there is no owner question.
>
> The scribe has not added pointers to this plan yet (STATUS, the M8 wave table, `decisions/README.md`). The ADR in
> *ADR draft* below is **Proposed**. The scribe gives it the next free number when it is accepted.

**Evidence tiers.** **[doc]** is quoted from a record in this repository. **[src]** was read in the working tree.
The first draft read it at `HEAD` `ccb0cd5e`. This revision read it at `58ab3695`, where the only changes are
`.claude/agents/configurator-test-auditor.md` and S0's untracked test file
`packages/configurator-domain/tests/merge-empty-columns.generated-kitchen.test.ts`. **[run]** is something the
architect executed and is quoting: a scratch measurement in the session scratchpad that imports the domain's own
`src`, plus one existing test run alone. Nothing was committed or left in the repository. **[S0]** is a figure from
the S0 implementer's own runs, relayed by the coordinator. Its scripts and raw output are in the gitignored
`testing-reports/2026-10-16-8u-s0-census/`. **[S0, read]** means the architect opened that output file and checked
the figure there. **[inf]** is the architect's inference, and each one names what would falsify it. No gate was run
for this revision. **Second revision** (§4.2), at `HEAD` `0f85ed23`:
- **[S3]** is a figure from the S3 implementer's runs, relayed by the coordinator. Its raw output is in the gitignored
  `testing-reports/2026-10-16-8u-s3-census/`.
- **[S3, read]** means the architect opened that file.
- **[run]** in §4.2 is the architect's own scratch probe, run in the session scratchpad through
  `rtk proxy npx vitest run` against the domain's `src`, with S0's `module-grid` mock.

**Third revision** (§6.2 and S4's item 3a), at `HEAD` `62fee695`, with S3b's edit to `merge-empty-columns.ts` in
progress in the tree:
- **[S2]** is a figure from the S2 implementer's runs, relayed by the coordinator.
- **[S2, read]** means the architect opened the file in the gitignored `testing-reports/2026-10-16-8u-s2-census/out/`.
- The architect ran no probe for this revision, because the tree is mid-edit and a result could not be reproduced.
  **[src]** here means files the S3b edit does not touch, plus `merge-empty-columns.ts:20-320` as it stood when read.

**Fourth revision** (§6.3), at `HEAD` `c15dc6e5`, with QA round B's three test files untracked in the tree:
- **[QA-B]** is QA round B's finding, relayed by the coordinator.
- **[run]** in §6.3 covers two things the architect ran. First, `rtk proxy pnpm vitest run
  tests/merge-empty-columns.fixpoint-and-order.test.ts`, alone: 28 tests, 6 failed, listed in §6.3. Second, a
  `rtk proxy grep` of `docs/decisions` and `docs/milestones`.
- **[src]** means `merge-empty-columns.ts` read whole at that `HEAD`.
- The impossibility argument in §6.3 is **[inf]**. It rests on a hand walk of two orders and has not been proved
  over every rule.

## 1. The request

Owner, 2026-10-16, verbatim [doc: the dispatch]: *"any near empty spaces after cabinets on all levels are removed to
be merged, doesn't matter if there are cabinets still standing between; the rule that merging of empty spaces happens
only from edges must be modified: keep merging on edges, but also merge anywhere two adjacent empty spaces appear.
Why: it simplifies inserting new cabinets after removing others."*

Owner clarification, relayed by the coordinator the same day: *"Merge even when cabinets are still standing between —
merge empty spaces even if they are between still-standing cabinets."* The coordinator's reading: a void in the
**middle** of a run, with cabinets standing on both sides, merges when it touches another void. The coordinator also
says no cabinet moves, and that the "cabinets must move" reading is rejected.

## 2. What the code does today

### 2.1 Voids are derived. Columns are frozen and partly stored.

- **A void is never authored.** `recomputeVoids` derives one void per level per column from the column's frozen
  extent and the bodies filed under it [doc: DEVELOPMENT-SPEC §3, *"Bodies are authored; voids are derived. Never
  author a void"*; §4] [src: `void-engine.ts:924`].
- **A column is a vertical run keyed `wall|centre` at 10 mm** (`deriveColumnKeyAt`). Every body whose frame centre
  falls in that bucket is a member, at any height: in a generated kitchen the base, the wall cabinet and the top
  cabinet above it share one key. The column's width is the narrowest member's width, its depth is the deepest
  member's clearance, and its regions are the members' `[y0, y0+h]` [src: `void-engine.ts:386-429`; doc: §3.2].
- **What is stored**: `emptyColumns` holds the extent of a column with no member (ADR 0044). `columnExtents` holds the
  frozen extent of a column that still has a member, when a command reshaped it (ADR 0053). Both have the same
  schema: wall, `alongMm`, `widthMm`, `y0Mm`, `topMm`, `depthMm` and an optional `depthFromBuildId`
  [src: `design.ts:88-117`]. Placements are stored, voids never are. `CURRENT_SCHEMA_VERSION` is 5
  [src: `migrate-design.ts:39`].
- **The stored map is the merged one.** `projectEmptyColumns` runs after the merge (ADR 0046, *Part 2 shipped*,
  2026-09-02), and the merge runs again at load in both `deriveColumns` and `deriveRecordedColumns`
  [src: `void-engine.ts:433-456`, `:503-516`].

### 2.2 What "all levels" means in this model

| Term | Meaning in code and spec |
| --- | --- |
| **Levels** (`LEVELS`) | `[0, 0.86]` base, `[1.5, 2.2]` wall, `[2.2, 2.6]` top. `0.86–1.50` is backsplash and is never an opening [doc: §2, *Module lines*; §11 row 17] |
| **Bands** (`Placement.band`) | `base`, `wall`, `top`, `column` (full height) [doc: §3.1] |
| **A level's void** | One per free level per column. A column with no member gives three level slots that all know `spanH` [doc: §4, *"Result set for a cleared standard column"*] |
| **Walls** | A, B, and C in a U. Wall C is read as wall B (ADR 0132 decision 1) [src: `void-engine.ts:310-311`, `:362-363`] |

### 2.3 The rule that limits merging: no positional rule exists

`mergeAdjacentEmptyColumns` [src: `merge-empty-columns.ts:68-82`] runs in three places: at load, after every
command (`reconcile-command-result.ts:74-88`: clip, then split, then merge, then re-answer full-height membership), and
inside generation, where it follows each command [src: `generate-kitchen.ts:730-760`]. **It never reads a column's
position in the run.** "Edge" appears in it only as *"edges must meet"* [src: `:28-30`, `:233-235`]. Two adjacent
columns stay apart for exactly one of these reasons:

| # | Blocker | Where [src] | Record |
| --- | --- | --- | --- |
| B1 | **Empty at every level.** A column with any member at any height is not a candidate | `merge-empty-columns.ts:84-93` | ADR 0037, ADR 0046 part 2 |
| B2 | **The 800 mm cap.** Greedy, left to right. A run whose total would pass `MAX_EMPTY_COLUMN_WIDTH_MM` stops growing there | `:207-231`, the stop at `:226`; `module-grid.ts:34` | ADR 0046 rule 1, ADR 0052 |
| B3 | **Agreement.** Floor, top and depth must each agree within `LEVEL_SNAP_M` (20 mm) | `:237-252` | ADR 0046 rule 2 plus its *Part 2* `d` amendment |
| B4 | **Guards that decline.** An off-grid centre, an inverted envelope, a run that encloses a placement (`standsIn`), and a key taken by another column | `:254-282`, `:289-366` | ADR 0046, ADR 0090 4b, ADR 0137 |

### 2.4 Measured on a generated kitchen [run]

These are scratch measurements at `ccb0cd5e`, made with `generateKitchen` and then `removePlacement` and
`reconcileSuccessfulCommandResult`, which is the store's own path. Wall A is listed.

**L room, 4100 × 3300 × 2600 mm.** The run is: corner at 0–900, sink at 1200, drawers at 1800, hob at 2400, a 300 mm
bottle cabinet at 2850, an oven tower at 3300 (600 wide, with a top void above it), and a free end `A|3.85` that is
500 mm wide and empty at every level.

| Step | Voids on wall A afterwards |
| --- | --- |
| Remove base `n2` at 1800 | `A|1.80` base 600, plus the free end's three |
| Remove base `n3` at 2400 | `A|1.80` base 600 **and** `A|2.40` base 600, side by side, **not merged** (B1: the uppers stand) |
| Remove every upper above both | `A|1.80` and `A|2.40` each at base, wall and top: **two 600 mm spaces per level, not merged**, though both columns are now empty at every level (**B2**: 1200 > 800) |

**L room, 3800 × 3300 × 2600 mm.** The free end `A|3.70` is 200 mm wide. Clearing the 300 mm column next to it one
level at a time:

| Step | Voids |
| --- | --- |
| Remove base `n5` | `A|3.45` base 300 next to `A|3.70` base 200: **not merged** (B1) |
| Remove its wall cabinet `n12` | still two (B1) |
| Remove its top cabinet `n19` | **one `A|3.55`, 500 mm, at all three levels**: merged, since 300 + 200 ≤ 800 |

**B3 is not what holds E1's pair apart** [run]. In the same 4100 room, the recorded map gives every wall-A column
from `A|0.45` to `A|3.85` the same values: `d` 620.0 mm, `top` 2600, floor 0, and `depthFromBuildId` `base-cabinet`.
That includes the hob column whose upper is the hood, and the oven-tower column. These extents come from the shell.
They are unchanged after `A|1.20`, `A|1.80` and `A|2.40` are cleared at every level. So the owner's pair is blocked
by B2 alone. How often B3 blocks a pair across the room grid is S0 item 3's job, and is not claimed here.

**An existing test pins a mid-run merge with bodies on both sides** [run]: `merge-empty-columns.test.ts:541`,
*"merges a split remainder with the column beside it, and the 800 takes a body"*, passes when run alone. In the
seeded kitchen a 200 mm remainder and a cleared 600 between standing columns become one 800.

### 2.5 Why the owner sees "edges only"

**[inf, from the measurements above]** The pattern is a side effect of the 800 mm cap and ordinary widths. Generation
composes every body at 600 to 800 mm, *"so no two planned columns can merge (any adjacent pair is at least 1200 mm,
over the 800 ceiling)"* [doc: ADR 0110, *Decision* item 2]. Only the leftover at a run's free end is narrower, and
ADR 0110 item 4 relies on exactly that: *"ADR 0046's merge joins the last planned column with a leftover of 200 mm or
less (600 + 200 ≤ 800)"*. Two cleared 600s mid-run never merge, while a cleared column beside a small edge leftover
does. **This reading would be false if** a mid-run pair of whole-column clears summing to at most 800 failed to merge.
The test at `:541` shows that such a pair does merge.

**The coordinator's sentence "today only voids at the run's edges merge" therefore describes what the owner sees, not
a rule in the code.** No positional rule exists to change. The plan changes **B2**, and records why **B1** is left as
it is.

## 3. Interpretations

| | Reading | Can the model express it? | Ruling |
| --- | --- | --- | --- |
| **I1** | When neighbouring columns are cleared top to bottom, their spaces merge into one **whatever the total**, mid-run as well as at an edge, at every level (base, wall and top merge together because the column is one extent) | Yes. It is B2 removed for **spaces**, and §7's 800 mm ceiling stays on every **cabinet** | **Adopted, subject to Q-8U-1.** It fits the measured complaint (§2.4: two cleared 600s) and the sentence *"after cabinets on all levels are removed"*. It is also ADR 0037's original intent: *"you are not limited — you can select any maximum width cabinets"*, and *"a merged 1400 mm space is filled with cabinets up to 800 — one 800 and one 600"* [doc] |
| **I2** | Keep the 800 mm cap and **re-tile** a contiguous empty span from the left at the cap, so 600 + 600 becomes 800 + 400 | Yes | Offered as option (a) of Q-8U-1. Two adjacent spaces still remain, and a seam appears where no cabinet edge ever was |
| **I3** | **Per level**: two base voids side by side merge even while the wall cabinets above them stand (B1 removed) | **No.** *"A column has one along-wall extent for all of its height bands"*. The repair *"requires a column to carry a different along-wall extent per band. Nothing is built for it now … this record is the trigger"* [doc: ADR 0122, *The representational gap*, decision 4]. Splitting a column under a surviving member is ADR 0011 Gap D's phantom column [doc: ADR 0046 part 1, *Amended 2026-09-01*]. It also costs §10 step 6's full-height opening: no stacked band column offers `spanH` 2.6 | **Out of scope.** No owner question is asked about it. Q-8U-1 states this reading so the owner can correct it in the same answer. If corrected, it is ADR 0122 decision 4's model-change wave, not this one |
| **I4** | The merge **slides** standing cabinets together | It would contradict §13.2, *"Auto-shifting a whole run … Positions carry meaning"* | **Rejected**, as the coordinator relayed. Nothing in this plan moves a placement |

**What "between" means here:** two empty spaces that touch along the wall, both cleared at every level, with cabinets
standing on one side, both sides, or at the wall's end. Nothing stands *between* the two spaces: if something did,
they would not be adjacent.

## 4. The owner's question

**Q-8U-1. One empty space wider than 800 mm, yes or no?** **Answered 2026-10-16: (b)**, relayed by the
coordinator as final. The same ruling restates three things: the whole-column principle stays (no per-level merge, so
I3 is declined); nothing moves a placement; and spaces merge wherever two adjacent member-less columns appear, even
between standing cabinets.

> When you clear two neighbouring 600 mm cabinets top to bottom, today you get two 600 mm spaces. That is because of
> your ruling of 2026-09-02, *"lets make 800 the maximum of any empty column"* (ADR 0052). Any space where a cabinet
> was removed behaves this way, at the edge or in the middle. Spaces merge today only while their total stays under
> 800, which is why you see it happen at the edges, where the leftovers are small.
>
> - **(a)** Keep 800 as the limit on a space. A span of 1200 is shown as 800 + 400 instead of 600 + 600. There are
>   still two spaces, and the seam moves.
> - **(b) — recommended.** Remove the limit on a **space**. Two cleared 600s become one 1200 space; three become one
>   1800. **800 stays the limit on every cabinet.** A cabinet you put into a space wider than 800 is built at its
>   widest, which is 800 for an ordinary cabinet. It sits flush left, and the rest stays one space on its right. You
>   can still step it narrower as today. Fixed-size items (dishwasher, columns) already take the widest size that
>   fits, so they do not change.
> - **(c)** Leave it as it is.
>
> I read "on all levels" as *clearing a column top to bottom*. Merging only the base row while the wall cabinets stay
> above it needs a change to how the kitchen stores space. If you meant that, say so; it is a separate, larger piece
> of work.

**Why (b).** It is the only option where the merged space keeps accepting the cabinets the owner wants to insert.
Under (a) there are still two spaces. Under (b) without the fit change, a 1200 space would refuse every `'fit'`
cabinet: `resolveFitWidth` has *"no widest-that-fits fallback: the width is the opening"* [src:
`insert-fit.ts:301-323`]. That refusal is ADR 0037's withdrawal symptom [doc: ADR 0046, *Why the cap plus the split
is sufficient*]. The fit change makes `'fit'` rows behave the way fixed-set rows already do (*"the widest size that
still fits"*, `insert-fit.ts:325-327`). (b) also restores what ADR 0037's owner first asked for (I1). The cost is
real and is §13 R1: generation relied on the cap.

**What depends on the answer:** S1 to S5 as written assume (b). Under (a), S2 is dropped, S4 becomes a re-tiling
rather than an uncapping, and S1 and S5 are dropped. Under (c), S0's tests stay and the ADR draft is recorded as
**Rejected**, with the measurement in §2.4 as the record of why the owner sees "edges only".

### 4.1 Q-8U-2 (non-blocking; default (a) is what S4 builds): the two spaces above each corner of a U

**The finding (F2).** Out of generation, a U's back wall (wall A) holds an 800 mm empty space and a 100 mm empty
space side by side in the upper-cabinet row, above **each** corner cabinet. That is 126 950 pairs in 63 475 composed U
rooms [S0]. For example, U 2700/1600/5700 has `A|0.40` (0–800) beside `A|0.85` (800–900), and `A|2.20` (1800–2600)
beside `A|2.65` (2600–2700). Their top, floor and depth all agree [S0, read: `out/c3a-U2700-3200.json`]. They exist
at HEAD as well, because the shell cuts that row at 800 (ADR 0110 Amendment B2).

**Why the uncapped merge still leaves them as two [src].** Each pair spans exactly the corner cabinet beneath it:
0–900, centre 450. A column's identity is its wall plus its centre to 10 mm (`deriveColumnKeyAt`). The merged space
would therefore be `A|0.45`, which is the corner base's own column. `isKeyTaken` declines the merge
(`merge-empty-columns.ts:353-366`), and the validator separately refuses an empty column keyed onto a placement's
column (`EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT`, a refusal: `validate-design.ts:54`, `:182`). Giving the merged
space a nearby key instead would break the rule that a key is its centre, which the insert's drift guard depends on
(ADR 0046 part 1, `refuseColumnDrift`). So with the cap lifted, these pairs are declined by `isKeyTaken` alone [S0].
**Classification: a contract gap.** The merge is not defective. The owner's *"anywhere"* meets the model's rule that
one column, with one identity, stands over one stretch of wall (ADR 0122 decision 4). **8U has no in-model fix.**
The only representation that makes this one space is the corner column owning the wall row above itself. That is a
change to how the corner is stored, and it carries a cost (below).

**The question, for the owner:**

> In a U-shaped kitchen, the upper row directly above each corner cabinet shows two empty spaces next to each other:
> one 800 mm wide and one 100 mm wide. This is how it looks today, and after this change it still will, in every
> U kitchen, whatever its measurements. Clearing the cabinets beside them does not change this. The space you free
> there reaches down to the floor, and only spaces with the same bottom and top join. Everywhere
> else, neighbouring empty spaces will join. These two cannot join yet, because the joined 900 mm space would sit
> exactly over the corner cabinet, and the program would mistake it for the corner cabinet's own space.
>
> - **(a), recommended.** Leave them as two for now. You can still put an 800 mm wall cabinet into the 800 mm space,
>   exactly as today. We record this as the one known exception to "merge anywhere".
> - **(b)** Plan a separate piece of work after this one, so that the corner cabinet owns the space above it and it
>   shows as one 900 mm space. One cost is likely: a wall cabinet put there would be centred over the corner, with
>   50 mm left over on each side that cannot be used, instead of sitting flush to one side.

(b)'s cost is **[inf]**, from ADR 0046 part 1 as amended: a column with a member standing at another level is not
split, and an insert there is centred. It would be false if the corner-ownership design split the column some other
way. That design would be its own planning, under ADR 0118 with this record as its trigger.

**Why (a) is recommended.** It changes nothing the owner sees today. It keeps the corner model that ADR 0021 and ADR 0110
B2 settled. And (b)'s likely cost, an unusable 50 mm on each side, is the stranding ADR 0046 was written to end. **It
does not block any slice.** S4 builds (a). If the owner answers (b), S4 is unchanged, and (b) becomes a backlog row
with this section as its trigger.

*Evidence for the last two sentences of the quoted question* [run, one room]: U 5900 / 3000 / 3000, h 2600, editor
uncapped. Remove `n1`, the sink at 900–1500 beside the left corner, through `removePlacement` and the reconcile. The
map then holds 0–800 and 800–900 (floor 1500) and 900–1500 (floor 0), three columns. B3's floor test keeps the strips
apart from the freed column. "Every U" in the generated state is S3b's count (item 4), not this probe. The editor
case is pinned in S3b item 5.

*Wording revised 2026-10-16 (§4.2).* The exception is **defined by where it is, not by a count**: a member-less
span standing over the same stretch of wall as a column that holds a body. S0's 126 950 pairs are its instances on
S0's grid. §4.2 adds the off-grid instances that S3 found.

### 4.2 The off-grid escape (F2′), and the architect's ruling, 2026-10-16

**What S3 found** [S3, read: `out/offgrid-U.json`, `out/offgrid-U-nostep.json`, `out/offgrid-L.json`,
`out/offgrid-UBC.json`]:

- S3's implementer swept rooms off S0's grid: offsets of 0, 1, 15 and 85 mm, at the three approved heights. It ran
  the editor uncapped under S0's mock.
- The finishing step changes the frozen map in **786 of 6 132** composed U rooms, 262 at each height. Every one has
  an odd wall-A width. Placements, steps and commands are identical in all 6 384 U rooms.
- Without the finishing step, all 6 384 are identical, so the finishing step is the only thing that differs.
- The L sweep (8 505 composed) and the U wall-B/C sweep (1 263) are whole-identical.

**Reproduced by the architect [run]**, U 5985 / 3000 / 3000, h 2200, editor uncapped:

| Wall A, upper row | Left corner (on the grid) | Right corner (odd width) |
| --- | --- | --- |
| Corner base below | `p25` 0–900, key `A|0.45` | `right-p25` 5085–5985, key `A|5.54` |
| Member-less spaces in the stored map | 0–800 (`A|0.40`) and 800–900 (`A|0.85`): **two** | 5084–5984 (`A|5.53`): **one** 900 |
| `validateDesignForCatalog` | no finding | no finding |

U 5900 / 3000 / 3000 (even width) keeps two at both corners [run]. **The odd width trims the upper row by 1 mm**: it
runs 5084–5984 against the corner base's 5085–5985. That trim is pre-existing at HEAD and is not 8U's. The merged
centre, 5534, therefore falls one 10 mm key bucket short of the corner's 5535. `isKeyTaken` compares keys only, so
it does not decline.

**Is the escaped 900 a defect?** **It is legal, not a defect in the merge** [src; run]:

- It overlaps no placement in two dimensions: it stands at 1500–2200, over a base at 0–820. That is
  `findWallOverlaps`' rule (`validate-design.ts:523-567`).
- Its key collides with no placement's key. `findCollidingColumnKeys` (`:451-470`) compares exact 10 mm keys,
  `A|5.53` against `A|5.54`.
- `projectFrozenMap` writes it, and the validator reports nothing.
- It is the same space the two strips already offered at HEAD, so it creates no new physical collision with the
  wall-C return **[inf]**, not run.
- It does not enclose the corner body: 5084–5984 against 5085–5985.

**But it makes the exception depend on a millimetre the customer cannot see.** In a room 5900 wide the corner shows
800 + 100. In a room 5985 wide it shows one 900. The on-grid decline is itself an accident of the key grid: the guard
exists so that two columns never share one map slot (`merge-empty-columns.ts:353-356`), not to keep corner space
apart. Behaviour that varies with a parity nobody sees is what ADR 0046's owner refused (*"the same result from the
same picture every time"*), and what ADR 0110 N11.8 refused again (*"the gap's side would depend on its width"*).
**Classification: a contract gap in this plan.** F2 was defined by key equality and by S0's count, not by geometry.
S3's code is correct and stays committed.

**The ruling.** **The merge declines a run whose merged span stands over the same stretch of wall as another column
in the map**: each outer edge is within one key bucket (10 mm, `deriveColumnKeyAt`'s grid, taken from the key
grid's own constant rather than written as a literal) of that column's outer edges, on the same wall. The key test
stays, as the map-slot guard it is. The new test is its geometric twin, so a 1 mm trim cannot change the answer.

- **Uniform:** above every U corner, at any width, there are two spaces. That is Q-8U-2 (a), exactly as worded.
- **Restores criterion 15a:** composition's output is the editor's canonical form in every composed room, on and
  off the grid.
- **Removes a red** [inf]: under S4 alone, 9 property rooms (for example U 6065 / 870 / 3065, an odd width) throw
  `EMPTY_COLUMN_WIDER_THAN_CAP`. The likely cause is this escaped 900 failing `assertGeneratedDesign`. It would be
  false if those rooms still throw after S3b. S1 lands first in any case.
- **Alternatives refused:**
  - *Accept the escape*: uniformity is lost on a parity, as above.
  - *Fix the 1 mm trim in the shell*: it changes generated maps in every odd room. It is an ADR 0110 *Correction
    2026-09-13* question, not 8U's. It also leaves the guard as fragile as before.
  - *Decline when the merged key is within one bucket of a taken key*: it is a key-arithmetic proxy for the same
    geometry, and a worse name for it.
  - *Make the corner own the row*: that is Q-8U-2 (b).
- **Where else can it fire? [inf]** Only where two columns overlap along the wall at different heights: corner
  pieces, and a wall cabinet widened over floor (ADR 0122). Along a run, a member-less span and an occupied column do
  not overlap. **Falsified by** S3b's census counting any decline outside a corner. S3b must report every such case
  and stop.

**No owner question is needed.** This makes the owner's pending default (a) true as worded. If the owner answers
(b), the corner-ownership work replaces both guards' corner role.

## 5. The new rule, under (b), in the model's terms

> **Two member-less columns on one wall whose edges meet and whose floor, top and depth agree within `LEVEL_SNAP_M`
> are one column, whatever their total width.** The merge never moves, resizes or re-keys a placement. Its outer edges
> are its members' outer edges, so the run's total is conserved. It declines only for B4's reasons. **800 mm is the
> ceiling on a cabinet (`CABINETRY_MAX_WIDTH_MM`, §7), not on a space.** A `'fit'` cabinet inserted into an opening
> wider than its declared maximum is built at that maximum. It is seated with its left edge on the opening's left
> edge (ADR 0046 part 1's lower-along-wall seat), and the remainder stays one member-less column on its right.

**The rule is the editor's.** Composition, which is generation's private intermediate, merges at the cabinet
ceiling until it finishes. Then it hands over a map that the rule above has already judged (§6.1).

Kept unchanged: **B1** (I3), **B3** (with §4 rule 1's WHY), **B4** (F2 is one of its declines, §4.1), the left-edge seat, the insert split (ADR 0046
part 1), ADR 0043 (a space of any width is legal), ADR 0031 (a resize moves a whole column), and ADR 0122's asymmetry.

### Worked examples (wall A unless named)

| # | Before | Action | Today [run] | After 8U |
| --- | --- | --- | --- | --- |
| E1 | Mid-run columns 1500–2100 and 2100–2700, each base + wall + top; cabinets stand at 900–1500 and 2700–3000 | Remove all six bodies | Two 600 spaces at each of base, wall and top | **One 1200 space**, keyed `A|2.10`, with three level voids: base 1200 × 860, wall 1200 × 700, top 1200 × 400. The standing neighbours do not move |
| E2 | E1 after | Insert *Corp bază 2 uși* (`'fit'`, ≤ 800) into the base void | — | Body **800** at 1500–2300, with an 800-wide wall void and top void above it in its own column. One **400** member-less column at 2300–2700, three level voids |
| E3 | E2 after | Insert a 400 base | — | Fills 2300–2700 exactly, with no remainder (ADR 0031 rule 6) |
| E4 | Three cleared adjacent 600s | — | Three 600s | **One 1800** |
| E5 | Free end 200 beside a 300 column | Clear the 300 top to bottom | One 500 [run] | One 500 (unchanged; the edge keeps merging) |
| E6 | Two adjacent columns, bases removed, uppers standing | — | Two base voids side by side [run] | **Unchanged** (B1, I3). Pinned as an anti-invariant (criterion 7) |
| E7 | Uppers removed over two standing bases | — | Two wall-level and two top-level voids side by side | **Unchanged** (B1) |
| E8 | A cleared full-height column beside a cleared base-run column whose depth or top differs by more than 20 mm | — | Two spaces | **Unchanged** (B3). How often this happens is measured in S0, item 3, and not estimated here |
| E9 | A 600 cabinet beside an 800 empty column | Step the cabinet down to 300 | 800 + 300 (ADR 0052's near-piece split) | **One 1100** space |
| E10 | Wall B and wall C (U) | E1 there | as wall A | as wall A (ADR 0132 decision 1) |
| E11 | The 1200 space of E1 | Insert `base-dishwasher` (450 / 600) | — | **600** flush left, 600 remainder (fixed-set, unchanged) |
| E12 | The 1200 space of E1 | Insert `tall-pantry` (`'fit'`, 400–800) into the full-height opening | — | **800** flush left, 400 remainder |

## 6. Effects on the rest of the product

| Area | Effect | Evidence |
| --- | --- | --- |
| **Insert (§5.2)** | `w = b.w === 'fit' ? void.w : b.w` becomes `min(void.w, entry maximum)` for `'fit'`. Floors run first, as today (ADR 0017). In an opening at or under the maximum, behaviour is unchanged | [src: `insert-fit.ts:301-323`] |
| **Remove (§5.1)** | Unchanged command. The reconcile merges what the delete freed, and post-delete selection already finds a merged void | [src: `remove-placement.ts:74-93`; `queries/vacated-void.ts:19-30`, `:44`] |
| **Swap (§5.3)** | Unchanged: the frame is the target and the map is not rewritten | [doc: §5.3] |
| **Resize (§5.4, ADR 0031, 0035, 0052)** | A shrink's freed width joins the adjacent space as one column, with no cut at 800. A growth funded by a wide empty column is still limited by the cabinet's own ceiling | [src: `width-resize-model.ts:117`, `split-column.ts:77-87`] |
| **Width and minimum space** | `MIN_SPAN` 0.30 (vertical void creation, §4) and ADR 0015 (exclusive) are unchanged. ADR 0043 is unchanged: a remainder of any width is legal and still publishes its opening | [doc] |
| **Pricing** | None. `priceDesign` prices placements and reads no column or void | [src: `pricing/price-design.ts:81-87`; `rtk proxy grep` for column and void names there found nothing] |
| **Picking and selection** | A merged column publishes one void per level with one id. Picking and selection name no column key | [doc: ADR 0090 ~`:743-748`] |
| **Undo and redo** | None exists, and none is added (§5.1 *"Deletion is final"*, §13.1) | [src: `remove-placement.ts:4-5`; no undo in `apps/web/src`'s store, grep] |
| **Persistence** | No new field. `emptyColumns` may carry an entry wider than 800, so `EMPTY_COLUMN_WIDER_THAN_CAP` stops refusing it at both seams. Stored documents re-derive at load: placements are unchanged, and adjacent agreeing empty columns that the cap kept apart merge, deterministically. **Schema version: no bump [inf]**, because every document valid at version 5 stays valid and nothing is normalised. *Falsified by* any reader that branches on the 800 ceiling for meaning rather than validity (S1 must stop and report one). The v1 arm's split is left byte-identical: the merge at load rejoins its pieces. No production data exists [doc: STATUS, owner on backlog 146, 2026-10-13] | [src: `validate-design.ts:392-406`, `migrate-design.ts:268-278`] |
| **Generation (ADR 0110)** | ~~The largest effect. Decision 2's premise stops being true … Generation must still write only through `insertBody` and `setWidth`.~~ **Superseded 2026-10-16 by §6.1, after S0 measured it.** Composition merges at its own named limit, which is the cabinet ceiling, 800. Only the editor's merge is uncapped. Generated placements, steps and commands are byte-identical to HEAD, and the delivered design is put through the editor's own uncapped load before it is returned. `leftover-rule.ts:31-41` reads `CABINETRY_MAX_WIDTH_MM`, which is now composition's limit as well (criterion 17) | [S0; src; doc] |
| **3D** | No builder changes. A void mesh is a translucent box with dashed edges, inset 14 mm (§6.1). **Anchor:** the void's centre (`x`/`z` from the column's along-wall centre; off-wall `d/2`), bottom at `y0`. **Scaling:** its width is the merged column's `w` less the inset, its height is the level's `h`. **Structural dependency:** a void exists only for a column the published map holds, so no seam may be drawn at a former boundary | [doc: §3.3, §6.1] |

### 6.1 How generation survives an uncapped merge: the architect's ruling, 2026-10-16

**What S0 measured (R1's STOP).**

- With the 800 cap lifted from the start, `generateKitchen` throws in the `plannedVoid` family in **86 706 of
  86 706** composed U rooms [S0] and **2 954 of 2 990** composed L rooms [S0, read: `out/c6-L.json`]. Of the other
  36 L rooms, 27 compose identically and 9 now refuse: the sink fails `WIDTH_NOT_SUPPORTED`, because no fit change
  was in place [S0, read]. The owner's room, 4100 × 3300, throws *"no B opening covers [2100, 2800] at 0"*
  [S0, read: `out/c6-OWNER.json`].
- **The cause [S0; src].** Inserts follow the ruled reading order (`generate-kitchen.ts:371-372`), and the seat is
  always the opening's left edge (ADR 0046). Once the shell's empty columns are one span, a body whose planned start
  is not that span's left edge finds no void. It is structural, not a few unlucky rooms. Wall A's insert order is
  ascending along the wall in only 937 of 2 990 L rooms. And of the bases that do find their void, **9 021 are
  `'fit'` bodies that land in a wider opening**, so they would come out wider than planned
  [S0, read: `out/c5-L.json`].
- **Generated output already holds no pair the uncapped merge would join** [S0]:
  - In L, 0 adjacent member-less pairs agree and sum to 800 mm or less.
  - In U, the 126 950 agreeing pairs over 800 mm are all F2's (§4.1), and `isKeyTaken` declines every one.
  - Every HEAD-generated document re-derives uncapped with **0 of 89 696** map differences.

  So merging the finished design is a no-op today.

**The ruling.** **One merge rule, with its width limit passed in as a value.** The editor's load and command funnel
pass no limit. **Composition passes the cabinet ceiling, `CABINETRY_MAX_WIDTH_MM` (800)**, everywhere it merges:

- the shell's construction (`shell-design.ts:890`);
- `loadWorld` (`generate-kitchen.ts:730-745`);
- each `applySuccessfulResult` (`:747-763`);
- `replayGenerationLog` (`:903-920`).

The shell's leftover tiling (`splitEmptySpanAtCap`, `split-empty-span.ts:40`) reads the same limit.

**When composition finishes, the design goes through the editor's own uncapped recorded-map derivation once:**
`deriveRecordedColumns` → `projectFrozenMap` → `withFrozenMap`, ADR 0110 B2's own canonical form. That happens
before `assertGeneratedDesign` and before the design is returned. The same step runs in `replayGenerationLog`.

The reasoning, in plain words: the shell is a sheet pre-cut at the planned cabinet widths. Composition keeps those cuts
until every planned cabinet has been put in through the editor's own `insertBody` and `setWidth`. Then the leftover
space is judged by the editor's rule, and that is the only map the customer ever sees.

**Why this honours ADR 0110, and the one place it bends.**

- **Kept** [doc; src]:
  - Every body is written by `insertBody` alone, with `setWidth` only at the free end (decision 2, *D revised* 4).
  - The seat is the left edge (ADR 0046's owner ruling).
  - Nothing gains a seat, a target or a width the editor cannot pass. That is alternative D's refusal and U3b AC5,
    *"a generated body written other than by `insertBody`"*.
  - Neither `insertBody` nor `setWidth` merges internally [src: a grep of `commands/` finds the merge only in
    `reconcile-command-result.ts:79` and `set-cabinet-depth.ts:241`, and generation never calls `setCabinetDepth`].
    So the limit lives in the funnel around the commands, and no command signature changes.
- **Bent**: decision 2's *"the same published openings"*, and the docstrings that say *"through the same command
  and frozen-map funnel as the editor"* (`generate-kitchen.ts:231-232`, `:902`).
  - **Mid-composition, generation inserts into openings the editor would show merged for the same document.** That
    is a real departure, and it is recorded as an amendment to ADR 0110 (ADR draft decision 4), not left implied.
    The docstrings are corrected in S3.
  - **Precedent** [doc]: *D revised* item 5 already made the shell *"composition's private intermediate: presets
    are instantiated from their own documents, and the store only ever receives the composed design"*. Amendment A4
    separates *"what the product proposes"* from a customer's own edits. Presets run no commands [src: `insertBody(`
    is called only in `generate-kitchen.ts` and the web store].
  - This ruling extends that private intermediate from the shell's tiling to the rule that keeps the tiles apart
    until they are filled.
- **No owner ruling is crossed, and nothing the owner sees differs** [S0: 0 of 89 696], so **no owner question is
  needed**. The owner's *"merge anywhere"* holds in every map the editor publishes. F2 (§4.1) is the exception, and
  the reason for it is not generation.

**Alternatives considered, and why each was refused.**

| Option | What it is | Why refused |
| --- | --- | --- |
| **G-B, along-wall insert order** | Insert each wall's bases from the span's left edge. Step every multi-width body to its planned width immediately (D1's original *insert, then step down*) | (1) Placement ids renumber, because `nextPlacementId` takes the lowest free n (`insert-body.ts:353-357`). The log's commands reorder and gain a `setWidth` for every `'fit'` body that lands wide (9 021 L bases alone [S0, read]). A fixed-set body planned narrower than the widest size the span fits would also need one [inf], and today's code throws on any resize that is not a free-end `'fit'` body (`generate-kitchen.ts:567-576`). So every generation digest moves (`tests/support/l-and-linear-generation-digest.ts` hashes design **and** log) [src]. (2) It reverses *D revised*, a reviewer-driven ruling. Its reason (the cap leaves seams) would lapse uncapped, but nobody has measured that positions would reproduce. S0's own one-span model already under-predicted the real funnel: in 496 L rooms it predicted that every void would be found, and production still threw [S0, read: `out/c9-L.json`]. (3) It buys nothing a customer sees. Kept as the fallback if §13 R10 fires |
| **G-C, a non-left seat or a requested width on insert** | Generation names where the body sits or how wide it is | Alternative D, verbatim: *"a seating the editor does not have … a generation-only primitive would also break decisions 1–2 and U3b AC5"*. ADR 0046's owner ruling refuses a seat that depends on a predicate |
| **G-D, merge only columns a user command emptied** | Columns carry their origin, and shell tiles never merge | It contradicts the owner's *"anywhere"*. It needs a stored provenance field (a schema change). It makes the merge depend on history the customer cannot see, which is the unpredictability ADR 0046's owner refused. And the generated output holds no mergeable pair anyway [S0], so it buys nothing over the ruling |
| **G-E, no merge inside composition** | Merge only after composition | It changes *D revised* 4's free end: the last tile and a leftover of 200 mm or less merge, and the `'fit'` body is then stepped back. So the log changes. **[inf]**, not measured: false if a census shows identical logs |
| **G-F, run generation as today and let the store's load merge** | No composition change at all | The cap would have to stay in the editor's funnel too, because both share one constant. That is Q-8U-1 (c), which the owner did not choose |

**Test fidelity, which decides whether S3's proof proves anything.** S0 lifted the cap by mocking
`MAX_EMPTY_COLUMN_WIDTH_MM` in `module-grid.ts`. Composition's limit is therefore **read from `catalog.ts`'s
`CABINETRY_MAX_WIDTH_MM`, never from `module-grid.ts`**. Otherwise the same mock would uncap generation as well, and
the "editor uncapped" census would pass for the wrong reason.

**Two cuts inside the commands stay reachable, and that is why the mock world needs a count** [src]:

- `insertBody`'s remainder split goes through `splitEmptySpanAtCap` (`split-column.ts:3`, cutting at
  `split-empty-span.ts:40`).
- `setWidth`'s shrink overflow (`width-resize-model.ts:117`, `command-result.ts:78`) reads `MAX_EMPTY_COLUMN_WIDTH_MM`.

Composition cannot pass its limit to either without a command parameter, and criterion 16 forbids that. So under
S0's mock those two cuts switch off inside composition. At the real S4 they still cut at 800, until S5 removes them.
**The mock world equals the S4 world only if neither cut ever fires during composition.** Composition's openings never
exceed 800, so the expected count is 0 [inf]. S3 counts it at HEAD and under the mock, and a non-zero count stops S3.

**The ruling's falsifier.** The ruling is false if, with the editor uncapped, any composed room's placements,
steps or commands differ from S0's baseline. It is also false if the final uncapped derivation changes any composed
room's map. S0's count for that is 0, and S3 and S4 must re-count it.

**The second half fired at S3, 2026-10-16, off the grid: 786 of 6 132 U rooms [S3].** Adjudicated in §4.2:

- **The first half held** [S3]: no placement, step or command differs, in any room, on or off the grid. So
  composition's limit is sound.
- What the second half caught was not generation. It was the F2 guard's key-equality proxy, which a 1 mm shell trim
  defeats. The editor's rule did merge, as written, a corner pair that §4.1 had meant to leave apart.
- The ruling stands. The falsifier did its job, and its remedy is S3b, not a change to composition.

### 6.2 Odd-width openings (S2 finding 3), and the architect's ruling, 2026-10-16

**What S2 found** [S2]:

- Criterion 10 holds on even widths only. Take a stored member-less column centred at 2000 that is 801, 1201 or
  2001 mm wide. `offersFor` lists every `'fit'` row there, and `insertBody` refuses every one with
  `NON_INTEGER_MILLIMETRES`.
- The same is already true at HEAD for fixed-set rows in odd openings of 701 and 799 mm.
- Nothing records it. A `rtk proxy grep` of `docs/BACKLOG.md` for the code, *odd width*, *half-millimetre* and
  *offered then refused* finds nothing [run].

**Why the seat lands on a half millimetre** [src]:

- `evaluateInsertFit` plans the flush-left seat as `C − (W − w) / 2` (`insert-fit.ts:633`). In the 801 opening
  (1599.5–2400.5) an 800 body therefore sits at 1999.5.
- For an even body with a remainder, an odd `W` always fails somewhere:
  - with a whole-mm centre, the seat fails, and `resolvePlacementMillimetres` refuses it
    (`insert-body.ts:211-215`);
  - with whole-mm edges, the remainder's centre fails, and `refuseFractionalParts` refuses it
    (`split-column.ts:89-111`).
- A body that fills its opening has no remainder and takes the opening's own centre, so it is unaffected.
- `offersFor` runs the same `evaluateInsertFit` (`offers.ts:140-151`), so the half-millimetre seat is in its plan,
  but only the command judges it.
- ADR 0103 already recorded the exposure. `NON_INTEGER_MILLIMETRES` is *"already outside the offer list's reach"*,
  and the command's guard is *"the backstop, not the gate"*, because §9 wants the refusal unreachable
  [doc: ADR 0103, *Post-probe refusals*]. The reason it gives, that the offer list holds no probe, does not fit the
  seat, which is planned before the probe. The exposure is real either way.

**Where an odd opening can come from, and whether §12's "declined, never rounded" covers S4** [src, with one
inference]:

- **What a document can store.** An odd width on whole-mm edges has a half-mm centre, and a document cannot store
  one: `alongMm` is a whole number (`toExactMillimetres`). So a storable odd opening has half-mm edges around a
  whole-mm centre, like S2's reproduction. Only a document can supply it: the producers read keep even widths.
  - `splitColumn` refuses a fractional part rather than write one.
  - The wall-end clip keeps the recorded width's parity (`widestOnTheGrid`,
    `clip-empty-columns-at-wall-end.ts:108-111`).
- **The merge never makes an odd opening out of even ones.** A column the merge can measure has a whole-mm centre
  (`measure`, `merge-empty-columns.ts:114-143`). So two columns abut only if their widths share parity.
  - Even members give an even width on whole-mm edges.
  - **An even count of odd members** gives a half-mm centre, and `landsOnWholeMillimetres` declines it (`:276`,
    `:299-301`). **This is §12's case.**
    - The decline is not the end of it. `planWidestAcceptedBlockFrom` retries one column shorter (`:207-213`).
    - So only a **pair** stays wholly apart.
    - Four stored 401s become one 1203, with one 401 left beside it.
  - **An odd count of odd members** gives an odd width at a whole-mm centre, which the guard passes. So the uncapped
    merge can *lengthen* an odd opening that a document holds (three stored 401s become one 1203), but it never
    *creates* one.
  - **A single stored odd column** is never touched by the merge. It is S2's case, and it is reachable at S2 already.
- **So §12's line covers part of S4's reach, not all of it.** What it leaves out comes only from a document.
- **[inf] No state reached without a crafted document holds an odd-width column or placement**, on or off the grid.
  - The coordinator relayed that *"from S4 the editor reaches it through odd-width merged spans"*. That holds only if
    this inference is false.
  - It is falsified by any placement or column with a half-mm edge in criterion 1's sequences or in either census
    sweep. Criterion 3a makes it a property, and S4 runs it.

**Classification.**
- **A contract gap in this plan.** Criterion 10 promised that the offer list equals what the insert accepts, at every
  width. It never stated its domain.
- **A latent, pre-existing §9 defect** of the "offered then refused" class (ADR 0017, ADR 0032). At HEAD only a
  crafted document reaches it, through fixed-set rows at 701 and 799. S1 and S2 widen it to `'fit'` rows over 800.
- **It is not an S2 implementation defect.** S2's code does what §5 says.

**The ruling: a known limit, recorded with its trigger (ADR 0118), not fixed in 8U.**

- Criterion 10 is scoped to openings on whole-mm edges. By the inference above, that is every opening the product
  reaches.
- The odd case gets its own witness, titled as the known limit (criterion 10). S4 writes it, as test-only work in
  item 3c.
- **The catalogue gives no odd width.** A `rtk proxy grep` of `catalog.ts` finds no odd three- or four-digit
  literal and no odd metre literal. Its stepped sizes are multiples of `WIDTH_STEP_MM` (50, `:74`, `:83-91`) [run].
  - So removing a catalogue-sized body leaves an even column.
  - The inference therefore narrows to **derived** widths: a `'fit'` body built to its opening, and generation's
    free-end `setWidth`. Criterion 3a checks those.
  - Not swept: structural entries defined outside `catalog.ts`.
- The scribe adds a backlog row.
  - **Trigger:** criterion 3a failing, any producer of an odd-width column, or a stored production document that
    holds one.
  - **Remedy:** move the seat's whole-mm guard into `evaluateInsertFit`'s seating (`insert-fit.ts:607-638`), so
    that the offer list and the command share one judge (ADR 0034). With it, write §9's empty sentence for an odd
    opening that then offers nothing.
- **No owner question.** Nothing a customer does reaches it, no production data exists [doc: STATUS, backlog 146],
  and no owner ruling is crossed.

**Alternatives refused.**

- **Move the guard into `evaluateInsertFit` in 8U.** It is the right remedy when the trigger fires, but not now:
  - it changes the shared judge in S2's committed file, and HEAD's offer lists at odd widths, for a state that only a
    crafted document holds;
  - an 801 opening would then offer nothing, while §9's empty sentence names 800 mm as the widest cabinet. That is a
    second wrong message, and it would need copy designed for it.
- **Filter in `offersFor` alone.** It makes two judges of one rule, which ADR 0034 refuses.
- **Round the seat.** The comments beside both guards record the rule against it: rounding keys a body as its
  neighbour (ADR 0044; `insert-body.ts:211-214`, `split-column.ts:98`). It would also put the body off the left
  edge (ADR 0046).
- **Decline odd merged spans in S4.** It would stop the merge lengthening a stored odd opening, but leave the single
  stored 801 as it is. So it buys nothing.
- **Refuse odd-width columns at the write seam.** It tightens a public seam, S1's security surface, for documents
  nobody produces. The backlog row records it as the other remedy.

### 6.3 Tolerance chains and the clear order (QA round B), and the architect's ruling, 2026-10-16

**What QA found** [QA-B; run]:

- The room is L 4200 × 2400 × 2600, with three 600 mm base columns at 1400–3200 on wall A, floor 0. Their frozen
  extents are stored. The bodies are removed through `removePlacement` and the reconcile.
- **Depths 620 / 600 / 580** (tops 2600):
  - in the orders 1,2,0 and 2,1,0 the result is **two** columns: `A|1.70` (600 wide, d 620) and `A|2.60` (1200
    wide, d 580);
  - in the other four orders it is **one**: `A|2.30` (1800 wide, d 580).
- **Tops 2600 / 2580 / 2560** behave the same way.
- **The bridged chain, tops 2560 / 2600 / 2580**, is one column in all six orders.
- `tests/merge-empty-columns.fixpoint-and-order.test.ts` has 28 tests and **6 are red**. They are the two
  right-pair-first orders on each of the two monotone chains (4), and the every-order equality on each (2). The
  architect ran it alone at `c15dc6e5` with QA's untracked files [run].
- Only stored extents reach it. No generated sequence hit it. **Whether a customer can reach it has not been
  measured.**

**Why** [src: `merge-empty-columns.ts:96-104`, `:264`, `:281-291`, `:311-312`, `:457-479`]:

- `agrees` compares two neighbours' **current** extents within 20 mm. That relation is not transitive: 620 agrees
  with 600 and 600 agrees with 580, but 620 does not agree with 580.
- A merge writes the conservative envelope, and its members leave the map. So the value that bridged the chain
  (600) is gone.
- The S4 loop recovers a narrowing that leads **into** agreement. In 2560 | 2600 2580, the right pair becomes 2580,
  which then agrees with 2560. The loop cannot recover a narrowing that leads **out of** agreement. In 620 | 600 580,
  the right pair becomes 580, which no longer agrees with 620.
- **So 7(b)'s sentence "the iteration is what makes criterion 5 hold" was true of the bridged chain only.** The F4
  table's six-order witness of criterion 5 on 620 / 600 / 580 promised something the model does not do.

**What the records accepted, and what they did not** [doc; run]:

- ADR 0046 *Part 2 shipped* (2026-09-02) accepts a 20 mm loss **on a pair**: *"a 580 mm column merged with a 600
  mm one publishes 580, losing 20 mm the customer never gets to use"*. `qa-5b4b.adversarial.test.ts:277-290` pins
  this.
- The same section names merging beyond tolerance as the harm: under `min` it *"would lose real depth silently"*.
- **The 40 mm chain drift is in no decision record.** A `rtk proxy grep` of `docs/decisions` for *chain drift* and
  *620, 600* finds nothing [run]. The drift appears in only two places, both of them prose:
  - the doc comment at `merge-empty-columns.ts:448-450`, which marks it *"Not claimed"*;
  - this plan's 7(b).
- ADR 0046 rule 1 sorts the scan so that the geometry does not *"depend on the order the customer's commands
  happened to run in"*. Its subject is the map's iteration order.
- [inf] Under the cap, the clear order already decided 300 + 500 + 300 when the right pair was cleared first. ADR
  0046 does not discuss that. Criterion 5 is this plan's promise, not an earlier ruling.

**No rule that reads only the current map can give the same answer in every order and also keep 600 + 580 merging**
[inf: the two-order walk below, with criterion 1 and the envelope held fixed]:

- **Left pair first.** 620 + 600 merge to 600, and 580 agrees with 600. Criterion 1 (maximal) forces one column at
  580, so the 620 member loses 40 mm.
- **Right pair first.** 600 + 580 merge to 580, and 620 is 40 mm from 580. The result is two columns.
- **One column in every order** would need 620 to merge with this 580. The map cannot tell this 580 from a stored
  1200 that was always 580.
- **Two columns in every order** would need the first agreeing pair to stay apart while nothing beside it is
  cleared.
- A merge is never undone, so the two partitions cannot be reconciled later.
- **Any agreement that is an equivalence relation is order-independent.** The envelope takes one member's value in
  each dimension, so a merged column stays in its members' class. The two such rules in reach are exact agreement
  and fixed 20 mm buckets. Both stop 600 + 580 merging, which overturns ADR 0046 Part 2's sentence and its pins.
- **A rule over the members' original values** needs each merged column to carry the [min, max] of every member it
  absorbed, in each dimension. It can give one of two properties, not both, because merges are one-way:
  - **order-independence**: merge when the intervals lie within tolerance of each other. This is the transitive
    closure, and its drift is unbounded: a chain of n columns can lose 20(n − 1) mm.
  - **a 20 mm drift bound**: merge only when the union's spread is at most 20. The clear order can still decide
    which members join.
  - Either way the interval must survive the reconcile's `recordedColumns` carry (`ColumnExtent`, `void-engine.ts`)
    and a save and load (`emptyColumns`). Otherwise a save between two clears changes the answer. That needs a type
    change outside this file and an optional schema field.

**Classification.**

- **A contract gap in this plan.** Criterion 5, 7(b) and the F4 table promised order-independence for every
  tolerance chain, and the model cannot deliver it.
- **Not an S4 implementation defect.** S4 built rule 2 and the loop as they were written.
- **Not a test-fidelity problem.** QA's six reds read criterion 5 as it was written.

**The ruling: a known limit, gated by a census, recorded with its trigger (ADR 0118). 8U changes no merge logic.**

1. **Rule 2 stays as ADR 0046 wrote it.** Agreement is judged pairwise, on current extents, within 20 mm. The
   merged column is the conservative envelope, and the merge is iterated to a fixpoint.
2. **A monotone chain has no single correct partition under that rule.** What the product guarantees:
   - **One map, one result.** For a given map the result is deterministic (sorted scan, fixpoint) and idempotent
     (criterion 2).
   - **One picture whatever the order, when the run's spread is within tolerance.** Clearing the same set in any
     order gives deep-equal maps whenever, in each of floor, top and `d`, the spread is at most 20 mm (criterion 5,
     restated). The spread is taken over every column of the final merged run, including any member-less neighbour
     it joins. The reason: every value a merge can produce then lies within the members' own range.
     So every adjacent pair agrees in every state, and the run always ends as one column at the same envelope.
   - **Never wider than any member** (§4 rule 1; criterion 7(b)).
3. **What is a known limit.** Consider a run whose neighbours agree but whose spread exceeds 20 mm in some
   dimension:
   - the clear order may decide whether it becomes one column or two;
   - when it becomes one, a member may lose more than 20 mm. Even the bridged chain 2560 / 2600 / 2580 costs its
     2600 member 40 mm in every order.
4. **The gate is S4b's census (item 1), and its three parts are one rule.** S4b proceeds only if all three find
   nothing:
   - generated rooms whose columns are cleared in every order;
   - a directed search that puts bodies of different depth sources side by side and then clears them;
   - criterion 1's sequences, read step by step for a merge that costs a column it absorbed more than 20 mm.

   If any part finds a case, S4b stops before any other change, and §6.3 returns to planning with Q-8U-3.
5. **The doc comments are corrected** (S4b item 2), so the code no longer calls the drift "accepted" or the loop a
   cure for the clear order.
6. **The scribe adds a backlog row.**
   - **Trigger:** S4b's census reports a hit; a stored production document holds such a run; or a catalogue change
     puts three adjacent depth sources within 20 mm steps. The sources already step 600 → 620 → 638 (a deep top,
     a base run, an oven tower) [src: `design.ts:96-98`, `catalog.ts:276`; doc: ADR 0073 decision 8]. Whether
     they ever stand side by side in one row is what the census measures.
   - **Remedies:** carry the member interval (Q-8U-3 (a) or (b)), or exact agreement (Q-8U-3 (c)).

**Q-8U-3, asked only if S4b's census gate fires.** In plain terms:

> Sometimes three empty spaces sit side by side. Each is within 2 cm of its neighbour's depth, but the two end
> spaces differ by more than 2 cm (for example 638, 620 and 600 mm). Today, whether they join into one space or
> stay two depends on the order the customer cleared them. We can make the result the same every time, but only one
> of these ways:
>
> - **(a) Always one space**, as deep as the shallowest of them. A space can then end up more than 2 cm shallower
>   than a cabinet that stood there.
> - **(b) Never more than 2 cm shallower** than any cabinet that stood there. Which spaces join can still depend on
>   the clear order.
> - **(c) Only spaces of exactly equal depth join.** The result is always the same and never shallower. But an
>   oven-tower space beside a base-cabinet space (18 mm apart) stays as two spaces.
>
> **Recommendation: (a).** Both (a) and (c) give the same result whatever the order. They differ in what they cost:
>
> - **(a)** keeps every space that joins today joining, including the oven tower beside a base cabinet. The cost
>   is a space that can lose depth, plus one more stored field per empty space.
> - **(c)** needs no new field and never loses depth. The cost is that spaces 1 to 20 mm apart, which join today,
>   stay apart. On screen that looks like the "spaces don't merge" problem you reported.
>
> We recommend (a) because of that second cost.

**No owner question if the census finds nothing.** In that case no customer reaches the limit, no production data
exists [doc: STATUS, backlog 146], and no recorded ruling is crossed.

**Alternatives refused.**

- **Exact agreement or fixed buckets, now.** Either overturns ADR 0046 Part 2 and its pins
  (`qa-5b4b.adversarial.test.ts:277-290`). It also stops the reachable 620 | 638 merge that ADR 0073 decision 8
  describes, and all of that for a state only a crafted document is known to hold.
- **Carry the member interval, now.** It needs a type change in `void-engine.ts`, an optional `emptyColumns` field,
  and a security reader on the write seam. It still forces the choice between (a) and (b), for a state only a
  crafted document is known to hold.
- **A spread limit on current values.** The loop then merges the 600 envelope with 580 anyway. That bounds neither
  the drift nor the order.
- **Drop the fixpoint loop.** It brings back order-dependence for the bridged chain (QA's R6: 4 of 6 orders red),
  and it breaks criterion 2.
- **Store the pre-merge columns and merge only at read.** That would give closure over the originals. But ADR 0046's
  2026-09-02 section decided post-merge projection: one canonical map that `col` keys are held to, and a split
  leaves no pre-merge decomposition. Reopening that is not 8U's work.

## 7. Records swept, and how each is settled

Swept: every record matching *merge, void, gap, edge, remove, empty*, plus every record those cite. The ones that
bear on this rule:

| Record | Date | What it says | Settled how |
| --- | --- | --- | --- |
| ADR 0037 | 2026-08-28; withdrawn 08-30; revived 09-01 | Adjacent empty columns merge, uncapped; *"800 still caps every cabinet"*; *"you are not limited"* | **Its uncapped rule returns**, under the conditions its withdrawal named: the insert split (ADR 0046 part 1) plus the fit change. Dated note |
| ADR 0046 | 2026-09-01 | Merge capped at 800; greedy sorted scan; agreement; insert splits and seats left | **The cap is superseded under (b).** Rule 1's sort stays (determinism and the template tie). Rule 2, rule 3, part 1 and the left seat stay. Dated note. *"A 600 and a 400 each take their own cabinet — 'and this is a solution'"* is the owner's earlier ruling that (b) changes, so it is put to the owner as Q-8U-1, not overridden |
| ADR 0052 | 2026-09-02 | 800 is the ceiling on **any** empty column. The shrink splits; the v1 arm normalises; `EMPTY_COLUMN_WIDER_THAN_CAP` | **Superseded for spaces under (b)**, as an owner ruling replaced by an owner ruling. Its *"a span wider than 800 may stay empty"* still holds. The v1 arm stays. Dated note |
| ADR 0043 | 2026-09-01 | A space of any width is legal | **Unchanged; a dependency** |
| ADR 0044, ADR 0053 | 2026-09-01/02 | The empty and frozen map is stored | **Unchanged in shape.** Only the validator's width refusal changes |
| ADR 0031, ADR 0035 d7 | 2026-08-27/28 | A resize moves a whole column; a shrink creates space | **Unchanged.** ADR 0052's amendment to d7 lapses with ADR 0052 (dated note) |
| ADR 0110 decisions 2 and 4, *D revised* 2–5, N11.8 alternative D, *Moving only the 20 838 merging rooms* | 2026-09-11 onward | Generation tiles at 600 to 800 so nothing merges; the free end merges at 200 or less; generation goes only through commands; no generation-only seat | ~~Premise of d2 retired; d4's mechanism generalised (S3).~~ **Revised 2026-10-16 (§6.1).** *D revised* 2's premise is **kept true inside composition**, which merges at the cabinet ceiling. Decision 2's *"the same published openings"* is **amended** for composition's intermediate states only, and the amendment is recorded rather than implied. Decision 2's write rule, *D revised* 4, alternative D and U3b AC5 are **unchanged**. Dated amendment (ADR draft decision 4) |
| ADR 0122 decision 4 | 2026-09-17 | One extent per column across bands; the per-band model is a future wave, with this record as its trigger | **Unchanged and named.** I3 is that wave. F2's corner pairs (§4.1) are the same one-identity-per-column limit, met at the corner |
| ADR 0090 4b, Amendment B | — | The clip, split and merge funnel; recorded versus published faces | **Unchanged order**, except that the split becomes a no-op under (b) and is retired in S5 |
| ADR 0103 | 2026-09-08 | A standing body is re-planned when something is inserted beneath it | **Untouched**: this wave adds no insert beneath a standing body (B1 holds) |
| ADR 0118 | — | A problem is recorded with its trigger, not built for | **Applied to I3** |
| DEVELOPMENT-SPEC §5.1, §13.1 *Undo removed* | — | No undo, because spans merge | **Unchanged** |

## 8. DEVELOPMENT-SPEC changes (written by the scribe at acceptance)

- **§5.2** pseudocode: `w = b.w === 'fit' ? min(void.w, b.maxW) : b.w`, with a dated pointer to the ADR.
- **§4**, the *"no horizontal half"* paragraph: add that a merged column may now be wider than 800, and that the
  insert split still runs first.
- **§3.2**, the superseded line: *"a merge joins two"* becomes *"a merge joins any number, uncapped"*.
- **§13.3 item 2** stays open (the combination offer).
- **§11: no existing row changes.** Rows 1 to 24 do not encode horizontal merging. Row 10's 1000 mm refusal is the
  **cabinet** ceiling and still holds. Row 20 (570 builds 570) is below every maximum. **New rows:**
  - **25** — Clear two adjacent 600 columns mid-run, top to bottom → one 1200 space at each level, with the
    neighbours unmoved.
  - **26** — Insert a `'fit'` body into a space wider than its maximum → built at its maximum, flush left; the
    remainder is one space on the right.
  - **27** — Clear only the bases of two adjacent columns → two base voids (per-level merge is ADR 0122's model
    change).

## 9. ADR draft (Proposed)

> **ADR [number at acceptance] — Adjacent empty spaces merge whatever their total, and 800 mm caps the cabinet, not
> the space**
>
> Status: **Proposed**, 2026-10-16. Q-8U-1 was answered (b) on 2026-10-16. ~~It is accepted at S4's close.~~ It is
> accepted at **S4b's** close (revised 2026-10-16), because decision 8 stands only if S4b's census finds nothing.
> Supersedes: ADR 0052 (for spaces) and ADR 0046's cap (in the editor). Amends ADR 0037 (revived uncapped) and
> ADR 0110 decision 2 (*"the same published openings"*, for composition's intermediate states only). Leaves ADR 0122
> d4 open.
>
> **Context.** The owner reported that spaces merge "only from edges" (2026-10-16). Measured: no positional rule
> exists. Two cleared 600s never merge because 1200 > 800 (ADR 0052), and narrow edge leftovers do. Lifting the cap
> everywhere made generation throw in 86 706 of 86 706 U rooms and 2 954 of 2 990 L rooms. The shell's planned tiles
> became one span, and the left-edge seat put bodies off their planned starts.
>
> **Decision.**
>
> 1. The rule in §5 above.
> 2. A `'fit'` insert into an opening wider than its maximum builds at its maximum, flush left.
> 3. `EMPTY_COLUMN_WIDER_THAN_CAP` is retired at both seams. The v1 arm is unchanged, and there is no schema bump.
> 4. **The merge takes its width limit as a value.** The editor passes none. Composition passes the cabinet
>    ceiling, `CABINETRY_MAX_WIDTH_MM`, at every merge it runs: shell construction, the first load, after each
>    command, and in replay. Composition finishes with one pass of the editor's uncapped recorded-map derivation.
>    - Generation still writes only through `insertBody` and `setWidth`, seated at the left edge. No command gains
>      a parameter, so alternative D and U3b AC5 hold.
>    - **What is amended**: mid-composition, generation inserts into openings that the editor would show merged.
>      This is recorded as a dated amendment to ADR 0110, extending *D revised* item 5's *"composition's private
>      intermediate"* to the rule that keeps the planned tiles apart.
>    - Generated placements, steps and commands are byte-identical to HEAD.
> 5. Per-level merging under standing bodies is not decided here. It remains ADR 0122 d4's trigger.
> 6. **F2: one known exception, defined by geometry.** The merge declines a run whose merged span stands over the
>    same stretch of wall as another column. That means each outer edge is within one 10 mm key bucket of that
>    column's edges (plan §4.2). The key test (`isKeyTaken`, `EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT`) stays as
>    the map-slot guard.
>    - In a generated U this is the upper row above each corner, in every U at any width. On S0's grid that is
>      126 950 pairs in 63 475 rooms. Off the grid, it includes the 786 odd-width rooms whose 1 mm trim let the key
>      test miss.
>    - Owner question Q-8U-2 is non-blocking, with default (a).
>    - If (b) is ever built, it is a corner-ownership change, recorded with its trigger (ADR 0118).
> 7. **An odd-width opening is a known limit, added 2026-10-16 (plan §6.2).** Only a stored document can hold one.
>    There, the offer list lists rows that the insert refuses with `NON_INTEGER_MILLIMETRES`, which was already true
>    at HEAD for fixed-set rows. The merge never creates such an opening; it can only lengthen one.
>    - The premise is a property: no state reached without a crafted document holds a half-mm edge (criterion 3a).
>    - The remedy is recorded with its trigger as a backlog row: one judge, with the seat's guard in
>      `evaluateInsertFit`.
> 8. **A tolerance chain is a known limit, added 2026-10-16 (plan §6.3).**
>    - Agreement is judged between neighbours, on current extents, within 20 mm, and it is not transitive. A merge
>      forgets its members.
>    - So a run whose neighbours agree but whose spread exceeds 20 mm may merge differently depending on the clear
>      order. A member may also lose more than 20 mm.
>    - The clear order cannot matter when each dimension's spread is within 20 mm (criterion 5).
>    - ADR 0046 Part 2's 20 mm on a pair is unchanged.
>    - The remedies are recorded with their trigger, which is S4b's census: carry each merged column's member
>      interval, or require exact agreement.
>
> **Alternatives.**
>
> - (a) Re-tile at 800, so two spaces remain.
> - (c) No change.
> - Per-level merge: the model cannot express it (Gap D).
> - Sliding cabinets (§13.2).
> - Merge only in the offer list, rejected by the owner (ADR 0046).
> - For generation:
>   - an along-wall insert order with a step-down after each insert (ids and log change, unmeasured);
>   - a non-left seat or a requested width (alternative D);
>   - merging only columns a user emptied (contradicts *"anywhere"*, and needs stored provenance);
>   - no merge inside composition (changes *D revised* 4's log).
>
> **Consequences.** As in §6, §6.1 and §13 of the 8U plan. After S5 the 800 figure survives with exactly two
> meanings:
>
> - the cabinet ceiling (§7), which is also composition's limit;
> - the v1 migration arm's normalisation.

## 10. Acceptance criteria (under (b))

Each property is a `fast-check` property in the domain suite. Room sizes are drawn over the generator's accepted
grid. Command sequences are drawn from `removePlacement`, `insertBody` (any offered row into any void) and
`setWidth` (any offered step) applied to a generated kitchen, at most 12 commands deep. Every step goes through
`reconcileSuccessfulCommandResult`.

*The rule.*

1. **Maximal (property).** After every step, neither `recordedColumns` nor `columns` holds two member-less columns on
   one wall that abut (within 1e-6 mm) and agree (floor, top and `d` within 20 mm). The only exception is a pair that
   a B4 guard declines, and the counterexample report must name which guard.

   **The one exception known in advance is F2**, defined geometrically (§4.1, §4.2): a run whose merged span stands
   over the same stretch of wall as another column, each outer edge within one 10 mm key bucket. The close-out
   quotes its count by guard (key test, geometric test) **on S0's grid and on S3's off-grid sweep**. On the grid it
   must be S0's 126 950 pairs in 63 475 rooms. Off the grid it must include the 786 odd-width rooms. Any other
   difference is explained.

   **Must not**:
   - a pair surviving because their total exceeds 800;
   - an F2 pair merging into a key the validator refuses;
   - **an F2 pair merging at all because a 1 mm trim moved its centre out of the corner's key bucket** (S3's 5985
     room);
   - the geometric test declining anything that is not over another column.
2. **Idempotent (property).** `merge(merge(m))` deep-equals `merge(m)` for every map reached in criterion 1. It also
   holds for the F4 table's hand-built tolerance chains:
   - the bridged chain, tops 2.56 / 2.60 / 2.58, is one column at the fixpoint (criterion 7(b));
   - each monotone chain keeps whatever its clear order gave, and a second call changes nothing (§6.3).

   A single pass did not guarantee this, so S4 iterates to a fixpoint (`merge-empty-columns.ts:96-104`). The
   fixpoint is per map. **It does not make the clear order irrelevant** (criterion 5, §6.3). **A red result here is
   a finding, not a flaky test.**
3. **Length conserved (property).** For each wall and each `[floor, top]` band, the union of member-less along-wall
   intervals in whole millimetres is identical before and after the merge. Each merged extent's left and right edges
   are its outermost members' edges.

   3a. **On whole millimetres (property), added 2026-10-16 (§6.2).** This is the premise of §6.2's known limit.
   - **What it checks.** Every placement's frame and every column in `recordedColumns` and `columns` has both
     along-wall edges on whole millimetres, which means an even width at a whole-mm centre.
   - **Where.** After every step of criterion 1's sequences, and in every composed room on S0's grid and on S3's
     off-grid sweep.
   - **Must not:** a half-mm edge in any state that no crafted document seeded.
   - **On a counterexample:** S4 stops. It names the producer and returns §6.2 to planning. The odd-width limit is
     then reachable, and the remedy recorded there moves into 8U.
   - **Non-vacuity (R6).** The same check, run over a hand-built start that holds one stored 801 mm column, must
     report it. That shows the check can fail. The generated world cannot show it (ADR 0093).
4. **No cabinet moves (property).** `design.placements` deep-equals the command's own output after reconcile, and
   `priceDesign` returns the same result. The merge never changes a placement field.
5. **Order-independent within tolerance (property). Restated 2026-10-16 (§6.3); the unconditional wording was a
   contract gap.**
   - **The promise.** Clearing the same set of columns in any order publishes deep-equal maps (keys, extents,
     `depthFromBuildId`). It holds whenever, in each of floor, top and `d`, the spread is at most 20 mm, and no B4
     guard declines. The spread is taken over the member-less extents of **every column in the final merged run**:
     the cleared columns, and any member-less neighbour the run joins. A 625 already standing empty beside a cleared
     600 / 610 run brings the limit back.
   - **The property draws** 3 to 5 abutting member-less 600 mm columns, with each dimension's values in [v, v + 20]
     whole mm. Each column has a distinct `depthFromBuildId`, and the clear orders are shuffled. Every order's map
     must also equal the one-call load of the same columns.
   - ADR 0037's measurement was on columns that agreed exactly. The sort stays for the template tie.
   - **Outside that domain is a known limit (§6.3, R14).** A run whose neighbours agree but whose spread exceeds
     20 mm may publish one column or two, depending on the order it was cleared in. The bridged chain (tops 2.56 /
     2.60 / 2.58) is order-independent in all six orders [run], and it stays the witness of the loop. The two
     monotone chains are not order-independent: depths 620 / 600 / 580 and tops 2.60 / 2.58 / 2.56. They are
     pinned as the limit.
   - **Must not:** two different maps for the same in-tolerance set; a merged column wider than any member in any
     order.
6. **Owner's case.** On a generated L room (4100 × 3300 × 2600), clearing `A|1.80` and `A|2.40` at every level gives
   one member-less column at 1500–2700, three level voids of 1200 mm, and the neighbours' placements byte-identical.
   This is S0's characterisation test, with its expectation flipped in S4, citing this ADR.
7. **Must not merge (anti-invariants).** (a) Base-only clears under standing uppers (E6) stay two base voids, with each
   column keeping its key. (b) A pair that disagrees by more than 20 mm on floor, top or depth stays two (E8) **when no agreeing
   neighbour bridges them**. A bridged chain such as tops 2.56 | 2.60 | 2.58 is one column at the fixpoint in every
   clear order, with the conservative envelope (top 2.56).
   - Its 2.60 member loses 40 mm. That is a merge beyond tolerance on a member. No decision record accepts it: ADR
     0046 Part 2 accepts 20 mm on a pair. §6.3 records it as part of a known limit (corrected 2026-10-16; this line
     used to call it accepted, citing the doc comment now at `merge-empty-columns.ts:448-450`).
   - The iteration is what makes **this** chain order-independent. Without it, the clear order decides (QA round B's
     R6: 4 of 6 orders red).
   - The iteration does **not** make a monotone chain (620 / 600 / 580) order-independent. Once a pair has merged,
     the bridging member is gone (§6.3). (c)
   Nothing merges across walls, at the corner, or across a 10 mm gap (`merge-empty-columns.test.ts:387-418` keeps
   passing).

**Witnesses the generated kitchen cannot give (F4; ADR 0093).** S0 measured that, on generated input, three of the
rules above cannot fail:

- no agreeing pair of 800 mm or less stays apart;
- no occupied adjacent pair is 800 mm or less;
- a second merge pass changes no map [S0].

So a property drawn over generated kitchens alone cannot fail for the reason criteria 2, 5 and 7 name. Each is owed
a **hand-built map**, as ADR 0093 requires:

| Criterion | Hand-built fixture | Why the generated world cannot witness it |
| --- | --- | --- |
| 2, 5 | **Corrected 2026-10-16 (§6.3).** (i) The bridged chain, tops 2.56 / 2.60 / 2.58, cleared in all 6 orders: one column, for criteria 2 and 5. (ii) The monotone chains, depths 620 / 600 / 580 and tops 2.60 / 2.58 / 2.56: criterion 2 only. For criterion 5 they are §6.3's known-limit pins, with the per-order shapes and two `it.fails`. (iii) Criterion 5's within-tolerance property | A second pass changes 0 generated maps [S0]. S0 never varied the clear order |
| 7(a) | Two adjacent 300 mm columns whose uppers stand and whose bases are removed | No occupied adjacent pair is 800 mm or less [S0] |
| 7(b) | A pair of 600 + 200 (≤ 800) whose top differs by 30 mm, one whose floor differs and one whose depth differs, each alone and with no bridge | No agreeing pair of 800 mm or less stays apart, and the generated B3 pairs are all U pairs where floor and depth differ together (95 893) [S0] |
| 1 (F2) | A hand-built L whose upper row over the corner holds 800 + 100 | F2 is generated in U only [S0] |
| 1 (F2′) | That L and a U, each with the upper row trimmed 1 mm (over 1–901 against a 0–900 corner, and the 5084–5984 / 5085–5985 case), plus a span 11 mm off, which must merge. The 1 mm and 10 mm cases must decline; the 11 mm case must not | The geometric test's own boundary, at both sides of one key bucket |

Each fixture's test states in its title which criterion it witnesses. Each must turn red under R6, with the cap
restored or the iteration removed. **The exception is the monotone-chain pins (§6.3), which the loop does not
affect.** Their R6 is S4b item 5: exact agreement turns their `it.fails` red.

*Insert.*

8. **Fit at its maximum.** A sweep over every `'fit'` entry and openings of 50 to 3000 mm in 50 mm steps, at each
   level the entry's band allows. If the opening is at most the maximum, the result is byte-identical to HEAD (same
   success or the same refusal code). If it is wider, the body is built at the entry's maximum, its left edge on the
   opening's left edge, with exactly one member-less remainder column on its right. **Must not**: a body wider than
   800, a body off the left edge, or a remainder in more than one column.
   - **Where "one remainder" is judged** (added 2026-10-16, S2 deviation 2) [S2]:
     - **Until S5**, `splitColumn` still cuts a remainder at 800. At command level, a 3000 opening leaves 800, 800 and
       600 beside the 800 body.
     - **From S4**, the remainder is judged **after the reconcile**, whose uncapped merge rejoins the pieces. This is
       the `it.fails` at `insert-fit.at-its-maximum.test.ts:522`, which S4 flips.
     - **From S5**, it is also judged at command level, on `insertBody`'s own effect.
9. **Fixed-set rows** (dishwasher, bottle cargo, the four full-height rows except the pantry) behave as at HEAD at
   every width in the same sweep.
10. **The offer list** for a void wider than 800 lists every row that criterion 8 accepts there, and no row it
    refuses. The count line is derived and never a literal (§9).
    - **Scoped 2026-10-16 (§6.2):** this holds for openings on whole-mm edges, which criterion 3a shows are every
      opening the product reaches.
    - **The odd case gets its own witness, titled as §6.2's known limit. S4 writes it (item 3c).** Its title cites
      *"8U §6.2 / R13"* until the scribe writes the backlog row. The fixture is a stored odd opening: 801, 1201 and
      2001 for `'fit'` rows, and 701 and 799 for fixed-set rows.
    - **What the witness asserts:** the insert refuses with `NON_INTEGER_MILLIMETRES`. It never throws, never rounds
      a seat, and never puts a body off the left edge.
    - **The `it.fails`.** "The offer list equals what the insert accepts" at those widths is an `it.fails` naming
      the row. If it passes unexpectedly, someone has fixed the limit, and the row closes with it.

*Resize, remove, select.*

11. **A shrink beside an empty column** gives one column of the summed width, at any total (E9). Growth is unchanged
    up to the cabinet ceiling. ADR 0122's asymmetric guard is unchanged.
12. **After a delete that merges**, the selected void is the merged one, its interval encloses the vacated frame, and
    a tap selects one id across the whole merged box (§11 row 22 still holds: solids beat voids).

*Persistence.*

13. **Round trip.** A design holding a 1200 mm and a 3000 mm member-less column saves through the API write seam
    (`apps/web/src/app/api/designs/[id]/route.ts`) and reloads at the domain load seam deep-equal. `EMPTY_COLUMN_WIDER_THAN_CAP` is no longer emitted. **Must
    not**: any other HEAD refusal weakening. The HEAD refusal case table, minus that one code, gives identical
    verdicts at both seams, including `MAX_EMPTY_COLUMNS`, the overlap sweep and the past-the-wall codes.
14. **Old documents.** Every document fixture valid at HEAD loads; its placements are unchanged; loading twice gives
    deep-equal maps; `CURRENT_SCHEMA_VERSION` is still 5. A v1 document with a 1600 entry loads to the same map as a
    v5 document storing one 1600. The v1 arm's source is byte-identical to HEAD.
    - S1 landed the equality under the editor's own limit as an `it.fails`
      (`migrate-design.v1-split-and-one-wide-entry.test.ts:99`). The v1 pieces stay 800 + 800 until the merge at
      load is uncapped.
    - **S4 flips it to `it`.**

*Generation.*

*Criteria 15–17 were rewritten 2026-10-16 for §6.1's ruling. The first draft's 15 asked for placements identical
and for a frozen map that differs only where columns merge. Under the ruling both hold more strongly, and the
criteria say so.*

15. **Census, in both worlds.**
    - **What the baseline is, and where it lives.** S0's test file pins two witnesses only. It does **not** pin the
      per-room baseline [src: `tests/merge-empty-columns.generated-kitchen.test.ts`, two `it`s at `:73` and `:95`].
      The per-room fingerprints are in the gitignored `testing-reports/2026-10-16-8u-s0-census/out/`, which a
      separate worktree does not have. So the criterion has two tiers:
      - **(gate)** Every committed generation digest is unchanged. That covers
        `tests/support/l-and-linear-generation-digest.ts` and its users, and the pinned sha-256 values in
        `tests/generation/qa-7d2-composition.adversarial.test.ts:650-696` and
        `u-composition.wall-a-remainder.test.ts:35`. The grid and room sweeps
        (`generate-kitchen.u.grid-*.test.ts`, `qa-7d7-s3a-room-sweep.adversarial.test.ts`) stay green.
      - **(evidence)** Each slice re-runs S0's census scripts against S0's stored fingerprints, in the tree that has
        them, and quotes the result as **[run]**. The quote is the count of rooms whose design **and** log
        (placements, steps, commands and frozen map) differ, and it must be 0. **Added 2026-10-16 (§4.2):** each
        slice also re-runs **S3's off-grid sweep** (`testing-reports/2026-10-16-8u-s3-census/scripts/offgrid.scratch.ts`:
        6 384 U, 8 640 L and 1 296 U wall-B/C rooms). A grid alone could not see the odd-width trim, so a slice that
        quotes only S0's grid has not met this criterion.
    - **Both worlds.** It holds (i) at S3, with both limits at 800, and (ii) at S4, with the editor uncapped. Before
      S4 lands, (ii) is proven by mocking `module-grid.ts`'s `MAX_EMPTY_COLUMN_WIDTH_MM` to `Infinity`, which is
      S0's own mock.
    - **The pass condition is S0's figures reversed**: 0 throws in 86 706 composed U and 2 990 composed L rooms; 0
      newly refused; the owner's 4100 × 3300 room composes to its baseline.
    - **Must not**: a composed room changing between the two worlds; a refusal in one world and not the other.
15a. **The delivered design is the editor's canonical form.** For every composed room, **on S0's grid and on S3's
    off-grid sweep**, the final uncapped derivation changes the frozen map in **0** rooms. The count is quoted at
    S3b under the mock and at S4 for real, and compared with S0's 0 of 89 696.
    - *Recorded 2026-10-16:* at S3 it was **786 of 6 132** off-grid U rooms [S3]. That was F2′ (§4.2), and S3b
      exists to make it 0.
    - **A non-zero count after S3b is a finding**: report it with its rooms. Never adjust the criterion to absorb it. Loading the design through the editor's own load (`deriveRecordedColumns` and
    `projectFrozenMap`) gives back the stored map deep-equal. `replayGenerationLog` deep-equals `generateKitchen`'s
    design in both worlds.
16. **Through the commands only.**
    - Generation writes only through `insertBody` and `setWidth`. No command's signature changes in S3 (grep plus
      review), and no generation-only seat, target or width exists.
    - **The one difference from the editor's funnel is the merge limit**, and the limit is set in one place, in
      generation's own module, from `CABINETRY_MAX_WIDTH_MM`.
    - Every merge composition runs passes it: shell construction, `loadWorld`, each reconcile, and replay. A grep for
      the merge and derive entry points under `generation/` finds none without it.
    - The `generateKitchen` and `replayGenerationLog` docstrings state the difference and cite the ADR.
17. **Composition's limit and the headroom are one constant.** `leftover-rule.ts`'s headroom and composition's merge
    limit both read `CABINETRY_MAX_WIDTH_MM`. Neither reads `module-grid.ts`. The `leftover-rule.ts:31-36`
    comment's "two rules that carry the same figure" is rewritten to one rule. Criterion 15 is unchanged by the edit.
    **R6**: S0's `module-grid` mock leaves every generation digest unchanged once S3 has landed. Before S3, the same
    mock reproduces *"no B opening covers [2100, 2800] at 0"* for 4100 × 3300.

*Visible.*

18. **Captured at 390 × 844** in the editor, preserving the drawing buffer. After E1: one void box per level spanning
    1500–2700 (less the 14 mm inset), with no seam at 2100. After E2: an 800 body flush left, an 800-wide wall box and
    top box above it, and one 400 box per level on the right. Also captured at 1440 × 900. The `wallA` preset frames
    the top row (§11 row 21).

*Hygiene.*

19. **Sabotage both ways (R6).** Restoring the cap at `merge-empty-columns.ts:226` turns criteria 1 and 6 red. Moving
    the correlate (a test reading a key rather than extents) keeps them green. Pointing composition's limit at the
    editor's (none) turns criterion 15 red with S0's throw, *"no B opening covers [2100, 2800] at 0"*, for
    4100 × 3300. Removing the final uncapped derivation keeps criterion 15a green today, because S0 counted 0
    changes. 15a's own witness is therefore hand-built: the finishing step, given a design holding a member-less
    agreeing 600 + 600 pair, must return one 1200 column. Composition's limit keeps such a pair apart, and only the
    uncapped derivation joins it. With the step removed, the witness turns red.
20. Rows 1 to 24 of §11 pass unchanged; `pnpm check` and `pnpm format:check` are green whole-tree at the closing commit.

## 11. Slices

**Tier: Full** (domain rule, persistence, generation): adversarial QA, then logic **and** clean-code review in
parallel. **Plus visual review** on S4, and **a security reader** on S1 (a refusal at a public write seam is
loosened). S0 is measurement and tests only, so it is coordinator-verified with no review round. One writing agent
per tree (R2). Every dispatch bans the discarding git commands by name (`agent-coordination.md`). **S1 to S3 must
each be green with the cap still in place.** S4 is the switch.

**Order, revised 2026-10-16: S0 verified and committed → {S1, S2, S3} → S4 → S5.** S0's test file is untracked at
this revision. The coordinator verifies it (it is coordinator-verified, with no review round) and commits it before
S1 to S3 are dispatched, so that every slice's base holds S0's two witnesses. The census scripts and fingerprints
stay gitignored. A slice working in a separate worktree quotes criterion 15's evidence tier from a run in the main
tree, or skips that tier and says so.

- **S1, S2 and S3 are mutually independent and can be dispatched now.** Each is cap-independent, and none changes
  what generation produces.
  - Their production files are disjoint: S1 `validate-design.ts`; S2 `insert-fit.ts`, `offers.ts`; S3 the merge's
    signature, the funnel and `generation/`. So the coordinator may run them one after another in one tree, or in
    separate worktrees (`agent-coordination.md`, *worktree bases*).
  - **The condition common to all three**: every generation digest and room sweep in criterion 15 is byte-identical
    at the slice's commit. A digest that moves stops the slice, and it goes back to planning.
- **S1** is independent because it only stops refusing a document. Nothing in the editor or in generation produces a
  member-less column over 800 until S4.
- **S2** is independent of the cap because its sweep runs over hand-built maps. It should be neutral for generation
  **[inf]**. Every width range in `catalog.ts` that is not a fixed size reads `CABINETRY_MAX_WIDTH_MM` as its maximum
  [src: `:114`, `:121`, `:538`, `:651`, `:675`; which entries are `'fit'` was not traced row by row], and
  composition never publishes an opening wider than 800 (§6.1). A digest that moves falsifies this.
- **S3** is behaviour-free at HEAD, because both limits are 800.
- **S4 needs S3 committed**, because S4 is the first commit at which the editor's limit and composition's differ.
- S4 and S5 run in order, after S3.

**Order, revised again 2026-10-16 after S3 (supersedes the two paragraphs above where they disagree): S0 ✓
(`6d2e1ec0`) → S3 ✓ (`0f85ed23`) → S1 → S2 → S3b → S4 → S5, one at a time.**

S3's implementer ran S4's change alone (`scripts/uncapped-suite/s4-merge-default.setup.ts`) and found that **S4
depends on S1, S2 and S3b, not only on S3** [S3, read: `out/s4-merge-default-run.log`]:

- **S1 before S4.** Under S4 alone, `generateKitchen` throws `EMPTY_COLUMN_WIDER_THAN_CAP` in 9 property rooms, for
  example U 6065 / 870 / 3065. That is a merged member-less column over 800 that `assertGeneratedDesign` refuses.
  The editor would equally refuse to save any merged space over 800 without S1.
- **S2 before S4.** `generate-kitchen.u.uppers.test.ts` (U3b AC6, *"back-wall voids stay open and take a wall
  cabinet"*) goes red. A 900 mm upper-row opening answers `WIDTH_NOT_SUPPORTED`, because without S2 a `'fit'` wall
  cabinet has no widest-that-fits fallback.
- **S3b before S4.** The 786 off-grid rooms (§4.2). ~~After S3b, the inference is that the 9 throws and part of the
  AC6 red disappear, because both are odd-width corners.~~ **Corrected 2026-10-16:** both were gone before S3b. The
  S4-alone run at S1 shows no `EMPTY_COLUMN_WIDER_THAN_CAP`, and at S2 AC6 passes [S2, read: `out/s4-alone-at-s1.log`,
  `out/s4-alone-after-s2.log`]. AC6 is red at S1 and green at S2. So S1 and S2 cleared them, and the odd-width-corner
inference was wrong. S3b is still owed for criterion 15a.
  S4's remaining reds are classified in S4's item (3a).

**Order, revised again 2026-10-16 after QA round B on S4: … → S4 → S4b → S5.** S4b is §6.3's slice. Its first item
is a census that may send §6.3 back to planning, and S5 waits on it. **Tier for S4b:** adversarial QA reruns the
census non-vacuity and the R6 edits, then a logic reviewer (§6.3, the restated criterion 5 and the ADR 0152 list)
and a clean-code reviewer (the comments). There is no visual or security reader, because nothing a customer sees
changes and no seam changes.

**Run them one at a time.** S1 and S2 do not touch each other's files, but S3b and S4 both edit
`merge-empty-columns.ts`. The serial order costs little, and it keeps the S4-alone census meaningful at each step.
Criterion 15's two tiers (now including S3's off-grid sweep) are the condition on S1, S2 and S3b, and every one of
them must show no change.

| Slice | Work (at most 5 items) | Production files | Reading |
| --- | --- | --- | --- |
| **S0** — **done 2026-10-16, committed `6d2e1ec0`**: test file `tests/merge-empty-columns.generated-kitchen.test.ts`, census in the gitignored `testing-reports/2026-10-16-8u-s0-census/`. It hit R1 (§6.1) | (1) A witness on a generated L room: a mid-run pair of whole-column clears summing to at most 800, with bodies on both sides, merges. (2) The owner's case (criterion 6) as a characterisation test asserting **today's** two 600s, titled as the expectation 8U flips. (3) A census over the two room sweeps: per-room fingerprints (placements and the projected frozen map) stored as a test fixture; counts of adjacent agreeing member-less pairs in generated output; and, after clearing each adjacent pair of columns, counts of pairs held apart by B2 versus B3 (top, floor or depth, separately). (4) A fixpoint census: the maps where a second merge pass changes something. (5) Generation's insert order per wall, and whether each `plannedVoid` would still find its void if the run's empty columns were one span. All quoted in the report | none | this plan §2, §5, §10 (1, 6, 15); `merge-empty-columns.ts` whole; `void-engine.ts:386-516`; `reconcile-command-result.ts`; `generate-kitchen.ts:690-800`; `tests/merge-empty-columns.test.ts:492-565`; `tests/commands/qa-c7s1-span-overlap.adversarial.test.ts:1-120` (the generate-and-reconcile pattern); `tests/support/fake-probe.ts`; the two sweep suites; ADR 0046, ADR 0110 d1–d4 |
| **S1** — persistence seam. **Done 2026-10-16, committed `1e2621e2`.** It left criterion 14's v1 equality as an `it.fails` that S4 flips | (1) Retire `EMPTY_COLUMN_WIDER_THAN_CAP` from `validateDesignForCatalog` and the severity table. (2) Round-trip tests at both seams (criterion 13), with HEAD's refusal table minus that code. (3) Check that no reader of `schemaVersion` branches on the ceiling, or stop and report. (4) Leave the v1 arm byte-identical, with a test (criterion 14). Criterion 15's digests stay unchanged, checked in this slice. (5) **Flip, in this slice, every test that asserts the cap refusal**, listed with its old and new expectation and the ADR (ADR 0152). Found by `rtk proxy grep WIDER_THAN_CAP`: `packages/configurator-domain/tests/qa-5g.adversarial.test.ts` (:120, :132, :140, :163, :227, :277), `tests/qa-5b2a.adversarial.test.ts` (:237, :508, :785), `tests/qa-5h.adversarial.test.ts:180` (a comment that names the bound), `tests/merge-empty-columns.test.ts:454` (a comment), and `apps/web/tests/app/api/designs/qa-5g.adversarial.test.ts`. A v1 case that asserts the *split* stays as it is. One that asserts a v2+ *refusal* becomes an acceptance | `validate-design.ts` (and `design-bounds.ts` only if a bound must move). The tests in `apps/web` change, but no web production file does | §6 *Persistence*; criteria 13–14; ADR 0052 *Migration*, *Security*; ADR 0044; ADR 0053; ADR 0146 (nothing from a driver leaves); `validate-design.ts:33-60`, `:180-190`, `:392-406`; `migrate-design.ts` whole; `tests/validate-design.test.ts`, `tests/migrate-design.test.ts`, `tests/empty-column-ceiling.test.ts`; the API write seam's call to the validator (`apps/web/src/app/api/designs/[id]/route.ts`; `packages/persistence/src` calls none, grep) |
| **S2** — fit at its maximum. **Done 2026-10-16, committed `62fee695`.** Finding 3 (odd widths) is ruled in §6.2. Deviation 2 (the cut at 800 stays in `splitColumn` until S5) is in criterion 8 | (1) `resolveFitWidth` builds at `min(opening, maximum)` and keeps the floors first. (2) Confirm the left-edge seat and `splitColumn` produce one remainder for a body narrower than its opening (test). (3) The offer list and its count line for a void wider than 800 (criterion 10). (4) The sweeps of criteria 8–9 over hand-built maps (ADR 0093: a rule the shipped kitchen cannot exercise owes a witness) (5) **Generation stays byte-identical** (criterion 15's digests), checked in this slice and not assumed. If a digest moves, a generated `'fit'` insert met an opening wider than its maximum: stop and report the room | `commands/insert-fit.ts`, `queries/offers.ts`, `queries/describe-selection.ts` (only if the count line is built there) | §5, E2, E11, E12; criteria 8–10; DEVELOPMENT-SPEC §5.2, §9 item 3; ADR 0017, ADR 0032 (+ the *Superseded* section), ADR 0035 d1–d2, ADR 0046 part 1 (*seated at an edge*), ADR 0048, ADR 0093; `insert-fit.ts:280-360`, `insert-body.ts`, `split-column.ts` |
| **S3** — **done, `0f85ed23`** [S3: 91 570 rooms byte-identical; domain suite 7 765 green]. Composition merges at its own limit (re-scoped 2026-10-16, §6.1; behaviour-free at HEAD) | ~~(1) Generation composes identical placements when the run's empty columns are one span … That gate's predicate must become "the opening is wider than the planned body".~~ **Struck 2026-10-16: S0 showed one span cannot be composed through the left seat in reading order, and under §6.1 composition never sees one span, so the `isFreeEndBody` gate (`generate-kitchen.ts:795-800`) is unchanged.** (1) **The limit as a value.** `mergeAdjacentEmptyColumns` takes its width limit as an argument. `deriveColumns`, `deriveRecordedColumns` and `reconcileSuccessfulCommandResult` pass it through. With no argument they keep today's 800 (the editor's limit stays 800 until S4). It is a number, never a boolean (`engineering-conventions.md`). `splitEmptySpanAtCap` takes it too, for the shell's tiling, and so does `splitOversizedEmptyColumns` inside the reconcile. That makes the funnel **around** the commands independent of `module-grid.ts`. The commands' own two cuts (§6.1, *Two cuts inside the commands*) still read it, and no command gains a parameter. So (1a) **the census counts how often the insert-split cut and the shrink-overflow cut fire during composition**, at HEAD and under S0's mock. The expected count is 0, and a non-zero count stops the slice. (1b) **Flip owed (ADR 0152):** the test at `tests/generation/leftover-absorbed-beside-a-fixed-body.test.ts:107-112` asserts `CABINETRY_MAX_WIDTH_MM >= MAX_EMPTY_COLUMN_WIDTH_MM` (`:108-110`), the guard for two 800s read by one plan (its comment, `:104-106`). Once the headroom reads the catalogue's ceiling, that line guards nothing. It is restated as a property: for every width up to the ceiling, width plus `headroomBelowTheCeilingMm(width)` never exceeds `CABINETRY_MAX_WIDTH_MM` (old and new expectation listed in the report). `:111`, the owner's literal 800 against the catalogue, stays. (2) **Composition passes `CABINETRY_MAX_WIDTH_MM`** at all four sites, and the limit is named once in `generation/`: `shell-design.ts:890`, `loadWorld`, `applySuccessfulResult` and `replayGenerationLog`. `leftover-rule.ts` reads the same constant (criterion 17). (3) **The finishing step**: one uncapped `deriveRecordedColumns` → `projectFrozenMap` → `withFrozenMap` before `assertGeneratedDesign`, in both `generateKitchen` and `replayGenerationLog`. It counts the maps it changes (criterion 15a). (4) Criteria 15, 15a, 16 and 17 in **both worlds**, the second under S0's `module-grid` mock, with S0's figures reversed. The docstrings at `generate-kitchen.ts:231-232` and `:902` are corrected. (5) **Report the census** (rooms, throws, refusals, digest equality, maps changed by the finishing step), quoted from the run | `merge-empty-columns.ts` (signature only), `void-engine.ts` (`deriveColumns`, `deriveRecordedColumns` signatures), `commands/reconcile-command-result.ts`, `split-empty-span.ts`, `generation/generate-kitchen.ts`, `generation/shell-design.ts`, `generation/leftover-rule.ts`. **About 7 files, over the ~5 limit; named here as `docs/WORKFLOW.md` requires.** Three of them are signature-only, with no behaviour change at HEAD | §6.1 whole; criteria 15–17; ADR 0110 decision 2, *D revised* 1–5, B2, N11.8 (alternative D), U3b AC5 (M7B plan, `M7B-u-shaped-rooms.md:1388-1390`); ADR 0046 rule 1; S0's census scripts `c6`, `c8`, `c9` and `census-lib.ts` (`testing-reports/2026-10-16-8u-s0-census/scripts/`) as the census pattern; `generate-kitchen.ts:327-440`, `:698-801`, `:902-921`; `shell-design.ts:880-908`; `void-engine.ts:425-520`; `reconcile-command-result.ts` whole; `merge-empty-columns.ts:65-100`, `:207-231`; `split-empty-span.ts`; `leftover-rule.ts`; `tests/support/l-and-linear-generation-digest.ts` |
| **S3b** — the corner guard becomes geometric (added 2026-10-16, §4.2; behaviour-free at HEAD) | (1) **The guard.** In `planBlock`, beside `isKeyTaken`, a run declines when its merged span's two outer edges are each within one key bucket (10 mm, inclusive, read from the key grid's own constant) of another column's outer edges on the same wall. "Another column" means any map column that is not a member of the run, which is `isKeyTaken`'s own set. The doc comment states the reason as §4.2 does: the two tests guard the same stretch of wall, and a 1 mm trim must not change the answer. (2) **Behaviour-free at HEAD:** the domain suite is green, criterion 15's committed digests are unchanged, and S0's grid census and S3's off-grid census are re-run (both [run]). It is behaviour-free because no capped merge ≤ 800 spans a column's whole stretch today [inf]. **A decline at HEAD stops the slice.** (3) **Under S0's mock**: criterion 15a off the grid goes from S3's 786 to **0**; S0's grid stays 0; every off-grid placement, step and command is identical. (4) **Count every decline by guard** (key test, geometric test) across both sweeps and criterion 1's command sequences, with **every geometric decline located**: wall, span, the column it stands over. Any decline not over a corner piece or an ADR 0122 widened cabinet stops the slice (§4.2, *Where else can it fire*). Also count the composed U rooms, on and off the grid, where each corner's upper row is still exactly its two strips. That count must equal every composed U room that has corner strips, and it is what backs Q-8U-2's *"in every U kitchen"*. (5) The F2′ fixtures (§10, F4 table), with R6: drop the new test and the 5985 room's 900 comes back. Add an editor pin: in a generated U, clear the whole column beside a corner strip, and the strips stay two while the freed column stays apart (B3, floor). That is §4.1's [run] case, and it is what backs Q-8U-2's last sentence | `merge-empty-columns.ts` only | §4.1, §4.2; criteria 1, 15, 15a; ADR 0046 (*Which end*: the predictability ruling), ADR 0110 N11.8 (the *Moving only the 20 838* row), ADR 0110 *Correction 2026-09-13*, ADR 0122 d4; `merge-empty-columns.ts:254-366`; `validate-design.ts:449-488`, `:523-567`; `module-grid.ts` (`deriveColumnKeyAt`); `testing-reports/2026-10-16-8u-s3-census/scripts/offgrid.scratch.ts`, `probe-room.scratch.ts` |
| **S4** — the switch | (1) Remove the cap from `widestBlockFrom` [`merge-empty-columns.ts:226`]. After S3, this means the editor's default limit becomes none, while composition's stays `CABINETRY_MAX_WIDTH_MM`. Criterion 15 is re-run for real here, with no mock, and must still match S0's baseline. Criterion 15a's count is quoted. The F2 count is quoted against S0's 126 950 (criterion 1). F4's hand-built fixtures (§10, after criterion 7) land in this slice. (2) Iterate `planMerges` to a fixpoint; it terminates because each pass removes at least one column (criterion 2). (3) Flip, citing the ADR, the tests that assert the **merge** cap (S1 already flipped the refusal-code tests): `merge-empty-columns.test.ts:148`, `:161`, `:522`, and any merge or shrink-split assertion in `empty-column-ceiling.test.ts` / `qa-5b4b`. **Each flip is listed in the report with its old and new expectation (ADR 0152)**. **(3a), rewritten 2026-10-16 after S2.** S3's list (from `out/s4-merge-default-run.log`) is superseded by S2's run of S4 alone [S2, read: `testing-reports/2026-10-16-8u-s2-census/out/s4-alone-after-s2.log`]. **That run covers `tests/generation/` and S0's file only, 73 files and 1 266 tests. It is not the domain suite.** So S4's first step is the **whole** domain suite under S4 alone. Every red is classified before it is touched, into one of the kinds below, and the kind is named in the report. The merge-cap flips in item (3) and both `it.fails` files lie outside the 73 files, so this run says nothing about them. In it, 16 tests in 5 files are red. **Every former *Re-run* file passes**: `generate-kitchen.u.uppers`, `qa-u3b-generating-a-u`, `top-row`, `generate-kitchen.u.property`, `corner-wall-unit`, and also `shell-design.property`. S1 retired the 9 `EMPTY_COLUMN_WIDER_THAN_CAP` throws, and S2 cleared AC6. None of these is touched unless the whole-suite run shows it red. **Flip** (2), where the editor's behaviour really changes and the old and new expectations are listed: `merge-empty-columns.generated-kitchen.test.ts:95`, S0's owner case and criterion 6 (red at `:107`); and `generate-kitchen.composition-width-limit.test.ts`'s *"keeps them two under today's editor limit"* (red at `:154`), S3's own pin of the old editor limit, which becomes *"one 1200 column"*. **Repoint** (12), where the expectation stays and the test reads composition's world. They share one seam: `facesOf` and `withWallABaseRunFilled` → `fillOpeningAt` in `tests/support/shell-design.ts:276-377` derive the **shell** with the editor's default limit. The shell is composition's private intermediate (§6.1). So the helper derives through `COMPOSITION_WIDTH_LIMIT_MM`, and `fillOpeningAt`'s docstring (*"the way the store saves it"*) is corrected to composition's world. The 9 are in `qa-7d5-bottle-cargo.adversarial.test.ts` (`:759`, `:827` ×2, `:919` ×4, `:969` ×2). The 3 are `shell-design.test.ts`'s finished-end group (`:663`, `:678`, `:688`). **Before the repoint, list every caller of `facesOf`** (`shell-design.test.ts`, `shell-design.property.test.ts`, `qa-7d5-bottle-cargo`, the support file) and confirm each passes a shell. A caller that passes `generateKitchen`'s output stays in the editor's world. Criterion 4's inserts and `shell-design.property`, green today, stay green. **Restate over the delivered design, never repoint** (2): `shell-design.adversarial.test.ts`'s *"carries its frozen map byte-identically through a change to every declared depth and back"* (`:338`) and *"is a fixed point of the load seam"* (`:401`). The counterexample is L 900 × 1802 × 2200, where wall B's 800 tile (900–1700) and 2 mm tile (1700–1702) become one 802 under the editor's rule. The depth command derives through the editor's default (`set-cabinet-depth.ts:241`), and criterion 16 forbids giving a command a limit. The editor also never loads, saves or depth-changes the shell. So ADR 0110 B3's *"still fits after any depth change"* belongs to the **generated design**, and these are restated over `generateKitchen`'s output, drawn from the rooms it accepts. The restatement states whether 900 × 1802 is one of them. If no generated room carries an 800 + 2 seam, it says so and names a declared witness (ADR 0093). The load-seam half is criterion 15a's load check, so one test may serve both if its title names both. The two sibling depth cases S3 listed, *"reports no finding … and back again"* and R1.2's (`:1302`), pass in S2's run and are not touched. **Must not**: a limit parameter on `setCabinetDepth` or on any command; or a test whose title states a rule (U3b AC6: *"a wall cabinet can take every back-wall void"*) flipped to fit the code. **`it.fails` flips owed to S4** (2), each turned to `it` and listed under ADR 0152: `migrate-design.v1-split-and-one-wide-entry.test.ts:99` (criterion 14, the v1 1600 map equality) and `commands/insert-fit.at-its-maximum.test.ts:522` (criterion 8's one remainder, judged after the reconcile). If an `it.fails` passes, vitest reports it red. So the whole-suite run shows both, and leaving either unflipped fails the gate. **(3b), added 2026-10-16 (§6.2):** criterion 3a's property, with its non-vacuity fixture. A counterexample stops the slice. **(3c), added 2026-10-16 (§6.2), test-only:** criterion 10's odd-width witness, which S2 did not land. It is the refusal pin plus the `it.fails` asserting that the offer list equals what the insert accepts at 801, 1201 and 2001 (`'fit'`) and at 701 and 799 (fixed-set). Its title cites *"8U §6.2 / R13"*, and the scribe adds the backlog row's reference when it writes the row (4) Criteria 1–7, 11, 12 and 19 as properties and pins. (5) The visual captures (criterion 18) | `merge-empty-columns.ts`, `module-grid.ts` (doc comment only), and the one file where S3 put the editor's default limit. Nothing under `generation/` | §5, §6.1, §10 whole; ADR 0037, ADR 0046 (whole), ADR 0052, ADR 0043, ADR 0090 4b and Amendment B, ADR 0122, ADR 0152; `merge-empty-columns.ts` whole; `tests/merge-empty-columns.test.ts`, `tests/empty-column-ceiling.test.ts`, `tests/qa-5b4b.adversarial.test.ts`, `tests/qa-5g.adversarial.test.ts`; `queries/vacated-void.ts`; `browser-and-visual-qa.md`; **added 2026-10-16:** §6.2; ADR 0103 (*Post-probe refusals*); `tests/support/shell-design.ts`; the two `it.fails` files; S2's `out/s4-alone-after-s2.log` |
| **S4b** — tolerance chains (added 2026-10-16, §6.3). It restates a contract and pins a known limit, with **no merge-logic change**. Base: S4 plus QA round B's files (`tests/merge-empty-columns.fixpoint-and-order.test.ts`, `tests/merge-empty-columns.editor-sequences.property.test.ts`, `tests/support/merge-oracle.ts`), committed by the coordinator first or owned by this slice's one writer | (1) **The reachability census comes first. It is [run] and quoted, and it is the gate.** It has three parts, all gated (§6.3 ruling 4). **Part 1, generated rooms** on S0's grid and S3's off-grid sweep. Read each column's member-less extent by clearing it alone through the store path, not from its frozen extent, because ADR 0080 re-derives a cleared column's depth from its source and the setting. Then find every contiguous run of 3 or more columns on one wall, not only maximal runs, where (i) edges meet within 1e-6 mm, (ii) adjacent pairs agree on floor, top and `d` within 20 mm on those extents, and (iii) the spread in some dimension exceeds 20 mm. Count these runs per dimension. For each such run whose bodies are all deletable, remove them in every order (all orders up to 4 columns, 24 seeded orders beyond that) through `removePlacement` → `reconcileSuccessfulCommandResult`. Count **(a)** runs whose published maps differ by order, and **(b)** runs where a merged column's top or `d` is more than 20 mm below, or its floor more than 20 mm above, a member's member-less extent. **Part 2, a directed search**, because a customer's inserts can put depth sources side by side that generation never does (600, 620 and 638). In one generated L and one generated U, clear three adjacent columns, fill them with every ordered triple of offered rows of distinct depth sources (at most 8 rows), then clear the triple in all 6 orders. Count (a) and (b) as in Part 1. **Part 3, criterion 1's command sequences.** The harness carries, for each member-less column, the widest reading of every column it has absorbed across all earlier steps: the highest top and `d`, and the lowest floor. This is the memory the map lacks. **(b′)** counts a column whose top or `d` is more than 20 mm below, or whose floor is more than 20 mm above, that carried reading. Adjacent member-less pairs that agree but are unequal are also counted; that count is reported, not gated. Give up to 10 located examples for each count. **Non-vacuity:** the same script on the 620 / 600 / 580 room reports (a) = 1 and (b) ≥ 1, and, cleared as a sequence in the order 0, 1, 2, (b′) ≥ 1. **Gate:** if (a), (b) and (b′) are all 0, go on to items 2–5. If not, stop with no other change and return §6.3 to planning (Q-8U-3). (2) **Doc comments only, in `merge-empty-columns.ts`:** the loop (`:98-99`), `agrees` (`:276-280`) and `mergedExtent` (`:448-450`). Each says what §6.3 says: agreement is not transitive; the loop recovers a narrowing into agreement but not one out of it; a run whose spread exceeds 20 mm may depend on the clear order and may lose more than 20 mm on a member; this is a known limit (§6.3). Nothing may still call the drift accepted. `git diff` on the file shows comment lines only. (3) **Restate QA's six reds under ADR 0152**, each listed with its old and new expectation, in `tests/merge-empty-columns.fixpoint-and-order.test.ts`. **The four per-order reds** (orders 1,2,0 and 2,1,0 on both monotone chains) become pins of today's shape, titled *"8U §6.3 known limit (R14)"*. Depth chain: `A\|1.70` (1400–2000, d 620) and `A\|2.60` (2000–3200, d 580). Top chain: `A\|1.70` (top 2600) and `A\|2.60` (top 2560). The other four orders stay as one `A\|2.30` at 1400–3200. **The two every-order equalities** become `it.fails` with the same title prefix. The bridged chain's tests, the one-call-and-second-call test, the envelope test and the template property are unchanged. The file header's account of what is witnessed is corrected. (4) **Criterion 5 as restated, as a `fast-check` property** in the same file (§10 criterion 5's domain), going through the store path (`removePlacement` → reconcile). (5) **R6, both ways, each reverted and quoted.** (i) Halving `AGREEMENT_TOLERANCE_MM`: item 4's property goes red, which shows it draws real chains. (ii) Making agreement exact: both `it.fails` go red, and the per-order pins go red too, which shows the pins can fail. (iii) Dropping the sort in `planOneWall`, so the scan and the template tie follow the map's insertion order: item 4's property goes red. That needs ties at the minimum depth, so the property draws each dimension from a small set inside [v, v + 20] (for example v, v + 10 and v + 20) as well as from the whole range. A rightmost-of-equal-depths tie is still derived from geometry and is order-independent, so it is **not** this property's sabotage. QA's template pin covers it. If (iii) stays green, the report says so and why, and the generator is fixed before the slice closes. (iv) Removing the loop: the bridged chain goes red in 4 of 6 orders, as QA round B measured. **Gates:** the whole domain suite green; the web suite untouched. Criterion 15 is not re-run, because the production diff is comment-only; the report says so. **Must not:** any logic change in `src`; a restated test whose title still promises order-independence for a monotone chain; a fix for the limit | `merge-empty-columns.ts` (doc comments only) | §6.3; §10 criteria 1, 2, 5 and 7(b), and the F4 table; R5, R14; ADR 0046 rule 1, rule 2 and *Part 2 shipped*; ADR 0073 decision 8; ADR 0093; ADR 0118; ADR 0152; `merge-empty-columns.ts` whole; `tests/merge-empty-columns.fixpoint-and-order.test.ts`, `tests/support/merge-oracle.ts`, `tests/merge-empty-columns.editor-sequences.property.test.ts`; `tests/qa-5b4b.adversarial.test.ts:270-300`; S0's `scripts/c3b.scratch.ts` and `census-lib.ts` (the clear-a-run pattern); S3's `offgrid.scratch.ts` |
| **S5** — retire the cut at 800 (behaviour-free after S4) | (1) `splitColumn`'s remainder becomes one piece. From this item on, criterion 8's one remainder also holds at command level, on `insertBody`'s own effect, and a test asserts it there. This is S2 deviation 2: until now a 3000 opening leaves 800 + 800 + 600 at command level, and only S4's reconcile rejoins them. (2) The shrink's overflow pieces go (`width-resize-model.ts:117` and its writer). (3) `splitOversizedEmptyColumns` leaves the funnel and the exports. (4) `MAX_EMPTY_COLUMN_WIDTH_MM` remains only for the v1 arm, renamed to say so. Composition already reads `CABINETRY_MAX_WIDTH_MM`, through S3's `COMPOSITION_WIDTH_LIMIT_MM`, so nothing in `generation/` changes. **Tests that read the module-grid constant as generation's ceiling are repointed at `COMPOSITION_WIDTH_LIMIT_MM`** [S3]: `tests/support/before-c2-corner-unit.ts:75`, `tests/generation/tall-end-rule.test.ts`, `tests/generation/tall-end-composition.test.ts`. That is a fidelity fix with the expectation unchanged, listed under ADR 0152. If any of them goes red at S4, it moves to S4. **Proof that it is behaviour-free, in both worlds:** criterion 1's sequences give deep-equal reconciled maps before and after the slice, and criterion 15's generation digests are byte-identical before and after. Removing the commands' cuts is behaviour-free in composition only because S3's count showed they never fire there. S5 re-runs that count before deleting them, and quotes it | `commands/split-column.ts`, `commands/width-resize-model.ts`, `commands/apply-column-moves.ts`, `split-oversized-empty-columns.ts`, `commands/reconcile-command-result.ts` | ADR 0052 *Consequences*; ADR 0046 part 1; `split-empty-span.ts`; `void-engine.ts:30-40` (exports); `index.ts`; the S4 property suite |

**S4 dispatch essentials (2026-10-16, after S2).**

- **Base.** S3b must be committed first, because S4 edits the same `merge-empty-columns.ts`. One writing agent per
  tree. The discarding git commands are banned by name.
- **The switch.**
  - The editor's limit is set in one place: the default of `mergeAdjacentEmptyColumns`' `widthLimitMm`
    (`merge-empty-columns.ts:79`, as read before S3b). It becomes "no limit". `deriveColumns`,
    `deriveRecordedColumns` and the reconcile inherit it.
  - Composition keeps `COMPOSITION_WIDTH_LIMIT_MM`.
  - `planMerges` is iterated to a fixpoint (criterion 2).
- **Order of work.**
  1. Run the whole domain suite under S4 alone.
  2. Classify every red per item (3a) before touching it. The 16 known reds are a subset of that run.
  3. Flip the two `it.fails`.
  4. Land F4's fixtures; criteria 1–7, 3a, 11, 12 and 19; and criterion 10's odd-width witness (item 3c), which is
     test-only.
  5. Re-run criterion 15 for real, both tiers and S3's off-grid sweep. Quote 15a's count and the F2 counts by guard.
- **Must not:**
  - a limit parameter on any command, `setCabinetDepth` included;
  - any production file under `generation/`;
  - a test restated or repointed to hide a rule;
  - rounding an odd seat;
  - a fix for §6.2's known limit. If criterion 3a fails, stop and report.
- **Report.** Every flip, repoint and restatement with its old and new expectation (ADR 0152), every census figure
  quoted from the run, and the visual captures (criterion 18).
- **Reading.** As in the S4 row, plus §6.2 and `tests/support/shell-design.ts`.

The scribe owns the closing documents: the ADR's acceptance and number, dated notes on ADR 0037, 0046, 0052, 0110 and
0122. ADR 0110's note is a **dated amendment** to decision 2, *"the same published openings"*, written from ADR
draft decision 4, with pointers at *D revised* 5 and N11.8 alternative D. The scribe also adds a backlog row for F2
under Q-8U-2's answer, with §4.1 as its trigger (ADR 0118). The scribe also adds the odd-width row from §6.2, with
its trigger and the two remedies. It also adds the tolerance-chain row from §6.3, with its trigger and remedies, and
writes the ADR's decision 8. Then: `decisions/README.md`, `SUPERSESSIONS.md`, DEVELOPMENT-SPEC §3.2, §4, §5.2 and §11 rows 25–27, and STATUS.

**Reading — QA (every slice):** this plan §5, §6.1 (*Test fidelity*), §6.2 (from S4), §6.3 (from S4b), §10 (with the F4 table) and §12; the slice's own *Reading* cell;
`engineering-conventions.md`, *Coverage an adversarial pass owes* and *Three guards that look thorough and cannot
fail*; WORKFLOW R6; ADR 0152; `tests/support/fake-probe.ts`; the generated-kitchen pattern in
`qa-c7s1-span-overlap.adversarial.test.ts:1-120`.

**Reading — logic reviewer:** this plan §2–§7 (with §4.1, §6.1, §6.2 and §6.3) and §10; ADR 0103 (*Post-probe refusals*); ADR 0037, 0046, 0052, 0110 d1–d4, *D revised*, N11.8, 0122; DEVELOPMENT-SPEC
§3.2, §4, §5.1–§5.4 and §11; the slice's diff with its tests.

**Reading — clean-code reviewer:** `engineering-conventions.md`; ADR 0136 (comments); the diff, plus the files it
touches in full.

**Reading — visual reviewer (S4):** `browser-and-visual-qa.md`; DEVELOPMENT-SPEC §6.1, §6.4 and §11 rows 21–22; this
plan's E1, E2 and criterion 18.

**Reading — security reader (S1):** ADR 0052 *Security*; ADR 0146; ADR 0019; `validate-design.ts` diff; the
persistence write seam.

## 12. Adversarial QA cases owed

- An odd total from a crafted stored document (a half-millimetre centre) → declined, never rounded, and never a throw
  at `projectEmptyColumns`. **Sharpened 2026-10-16 (§6.2).** This is a pair of stored odd columns, and the pair
  stays two. The cases QA also owes:
  - four of them become one 1203 plus one 401, because a declined block is retried one column shorter;
  - an odd count of them, for example three 401s, merges into one 1203 at a whole-mm centre;
  - a single stored odd column is left alone;
  - inserting into either refuses with `NON_INTEGER_MILLIMETRES` and never throws;
  - criterion 10's `it.fails` stays failing.
- A key collision: two cleared wall columns over the corner whose merged centre keys `A|0.45` → declined. The seeded
  corner columns stay apart (`merge-empty-columns.test.ts:304`).
- `standsIn`: a run that encloses a placement → declined, at every width now possible.
- A tolerance chain: tops 2.56 / 2.60 / 2.58 and depths 620 / 600 / 580. Check that one pass equals two, and that the
  envelope is never wider than any member's. **Done in QA round B.** It found that the monotone chains depend on the
  clear order, which §6.3 rules a known limit (S4b). QA on S4b also checks the mirrored chain (580 / 600 / 620), so that
  the pins do not encode the scan direction. Walked by hand [inf], it gives **two** columns in the orders 0,1,2 and
  1,0,2, and one in the other four.
- Wall-end clip versus recorded face (ADR 0090 Amendment B): a merged 2000 at a wall's end, then a room correction
  that shortens and restores the wall → the recorded face is untruncated and round-trips.
- A depth change (ADR 0088, 0090) with a 1800 merged space; the leftmost shallowest member is the template.
- Insert at every band into 1200: `wall-cabinet`, `hood` (600–800), `open-shelf`, `base-sink` (min 560), `tall-pantry`,
  `tall-oven-tower` (fixed 600), `base-dishwasher`, bottle cargo.
- Leftover remainders below any cabinet (850 → 800 + 50) are legal and publish an opening (ADR 0043, ADR 0046's
  `void-engine` note).
- A 10 000 mm wall cleared end to end: one column; `MAX_EMPTY_COLUMNS` holds; the document stays within the schema.
- A v1 document with a 1600 entry versus a v5 document with a 1600 entry: the loaded maps are equal.
- Wall C (U) and a right-hand L reflection (ADR 0129, 0132): the merge is equivariant.
- ~~Generation sweep under the mocked uncapped constant: zero placement differences, with every frozen-map difference
  explained.~~ **Revised 2026-10-16 (§6.1).** A generation sweep under S0's `module-grid` mock gives zero
  differences in design and log. An R6 edit that points composition's limit at none (criterion 19) must reproduce S0's
  `plannedVoid` throws, which shows the census can fail. Mocking `CABINETRY_MAX_WIDTH_MM` is not a substitute,
  because the catalogue's `'fit'` maxima read it too.
- A merge or derive call under `generation/` without composition's limit. Search for one (grep), and check that a
  deliberately omitted limit at each of the four sites turns criterion 15 red, site by site.
- **Off the grid (added 2026-10-16, §4.2).** Every sweep QA runs includes odd widths (offsets 1, 15 and 85 mm) and
  all three approved heights. A sweep on round numbers alone cannot see the 1 mm shell trim. Cases:
  - the geometric guard at 0, 1, 10 and 11 mm of edge offset, on both corners of a U and on an L's corner;
  - a 10 000 mm wall cleared end to end beside a corner, which must merge everything except the stretch over the
    corner;
  - an ADR 0122 widened wall cabinet with a cleared span beneath it.
- The replay of a generation log through the editor's uncapped funnel, where a caller forgets composition's limit:
  it throws or diverges. That is why `replayGenerationLog` is the only replay entry point, and QA checks that no
  test helper replays `log.commands` another way (`tests/support/generated-u-findings.ts:160` is one caller).
- Price is identical across every QA sequence.
- R6 both ways on criteria 1, 2, 8 and 15.

## 13. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | **Generation** relied on the cap (ADR 0110 d2), and an uncapped merge collapses the shell before inserting | ~~S3 lands first … stop and return to planning.~~ **Fired at S0, 2026-10-16, and resolved by §6.1's ruling.** The throws are 86 706 of 86 706 U rooms and 2 954 of 2 990 L rooms [S0]. Composition merges at the cabinet ceiling, and the editor is uncapped. ADR 0110 decision 2 is amended, not silently departed from. The residual risks are R10 and R11 |
| R10 | **Two funnel modes drift apart.** Later work changes one merge site and not the others, or a new composition step derives the map without composition's limit, and generation starts throwing or composing differently from its baseline | One named limit in `generation/`. Criterion 16's grep at every site, and §12's per-site sabotage. Criterion 15's digests guard every later wave. **If S3 cannot reach criterion 15 at all four sites, stop and return to planning**: G-B (along-wall order with step-down) is the recorded fallback, and it needs its own census before it is chosen |
| R12 | **A grid hides a millimetre.** S0's census ran on round room sizes and declared the corner exception closed. An odd width moved it by 1 mm and it escaped (§4.2) | Every census from S3b on includes S3's off-grid sweep (criterion 15). The F2 exception is defined geometrically, not by a count. The 1 mm shell trim itself (upper row 5084–5984 against a corner base at 5085–5985) is pre-existing and **not fixed here**. The scribe records it as a backlog row citing ADR 0110 *Correction 2026-09-13*, with this plan's §4.2 as its trigger |
| R13 | **An odd-width opening is offered, then refused** (S2 finding 3, 2026-10-16) | Ruled in §6.2: a known limit that only a stored document reaches. Criterion 3a is the falsifiable premise, and S4 runs it. A counterexample stops S4 and moves the recorded remedy (one judge, in `evaluateInsertFit`) into 8U. The backlog row carries the trigger |
| R11 | **The census proves nothing** because generation's limit aliases the constant S0's mock replaces | Composition reads `CABINETRY_MAX_WIDTH_MM` from `catalog.ts`, never from `module-grid.ts` (criterion 17). The reverse sabotage in criterion 19 must reproduce S0's throw |
| R2 | The fit change touches §5.2, the offer list and the count line | Byte-identical behaviour at or under the maximum (criterion 8) |
| R3 | A loosened write-seam refusal | A security reader; every other refusal pinned unchanged (criterion 13) |
| R4 | Tests that assert the cap are flipped and launder a defect | Every flip is listed with its reason and ADR (S4 item 3); the logic reviewer reads each one |
| R5 | The fixpoint changes the envelope in rare tolerance chains, so a stored map differs at load | Counted in S0 item 4 and quoted: a second pass changes **0** maps [S0]. So the generated world cannot witness it, and F4's hand-built chain is the only test that can fail (criterion 2). Placements never change. **S0's census never varied the clear order, so it says nothing about R14** (added 2026-10-16) |
| R14 | **A tolerance chain depends on the clear order** (QA round B, 2026-10-16). A run whose neighbours agree but whose spread exceeds 20 mm may become one column or two depending on the clear order. When it becomes one, a member may lose more than 20 mm (§6.3) | Ruled a known limit in §6.3. 8U changes no merge logic. **The gate is S4b's census** over both sweeps and criterion 1's sequences. A non-zero count stops S4b and returns §6.3 to planning with Q-8U-3. Pinned by the per-order shapes and two `it.fails`. A backlog row carries the trigger. The real depth sources already step 600 → 620 → 638 [src; doc: ADR 0073 d8], so "a customer cannot reach it" is an inference until the census runs |
| R6 | The owner expects per-level merging (I3) | Stated in Q-8U-1's text. If wanted, it is ADR 0122 d4's wave, with its own plan |
| R7 | Disagreeing pairs (E8) and F2's corner pairs still show as two adjacent spaces, and the owner reports again | Counted by S0: F2 is 126 950 pairs in 63 475 composed U rooms, all declined by `isKeyTaken` alone. 95 893 B3 pairs appear after one clear, in U only, where floor and depth differ together. §4 rule 1's WHY is a shipped fix that must not be simplified away (`product-invariants.md`). F2 is put to the owner as Q-8U-2 (§4.1) and is not left for the owner to discover. The close-out names both counts |
| R8 | Very wide void boxes on a phone: framing, and the click-stealing that §6.1's line threshold guards against | Visual review at 390 × 844, plus §11 rows 21–22 |
| R9 | A collision with the concurrent 8N plan's ADR number | The number is given at acceptance by the scribe |

## 14. Verification

The coordinator re-runs each slice's named suites and reads the diff (WORKFLOW *Trust but verify*). Before close:
`pnpm check`, `pnpm format:check` whole-tree, and `pnpm ci:local` on a clean tree before any push (R8). The S0 census
and the S3/S4 census figures are quoted from the runs, never estimated (R4). The visual captures are attached to the
close-out. The milestone's test audit covers 8U's tests (ADR 0152 Amendment A).

**Where it sits [inf]:** a wave on the M8 branch before 8T. 8T is the owner-attended gate on a real phone, and it
should see the editor as it will ship. Nothing ships mid-milestone either way.

## Close note, 2026-10-17 (scribe)

**Evidence tiers here:** commit subjects read from the reflog [commit]; the coordinator's word [relayed]; the scribe's
own reads of the tree [src]. The scribe has no shell and ran no command, test or gate.

**Commits on `m8-mail-and-empty-space-merge` [commit]:** plan `fcf6b419`; S0 `6d2e1ec0`; S3 `0f85ed23` (*"behaviour-free
at HEAD (91,570 rooms byte-identical)"*); plan `8c17410d`; S1 `1e2621e2`; S2 `62fee695`; S3b `de0a0171`; S4 `a70c974b`
(*"generation keeps its 800 limit (output byte-identical)"*); round A `c15dc6e5` (*"28 domain + 19 web tests flipped,
repointed or restated … suites green"*); plan `4190b2a7`; S4b + round B part 1 `e5fe5223`; round B part 2 `9c69f1c0`;
review fix pass `2b2b0511` (*"the uncapped merge no longer costs cubic time on a crafted 1893-entry document (2619 ms to
2 ms, 8,848,020 comparisons against the old search, 0 mismatches)"*).

**Owner rulings [relayed, 2026-10-15..17]:** Q-8U-1 = (b); I3 declined. Q-8U-2 = (a): two spaces above every U corner
(the key and same-stretch guards). Q-8U-3 = (a): always one space within a tolerance chain — **recorded as a known
limit until built**, because a customer **can** reach a stepped chain through `setCabinetDepth`.

**Corrections, dated 2026-10-17:**

- **S4b's "census 0" is corrected.** The S4b commit subject reads *"census 0 on generated, offered and sequence data"*.
  A reviewer found that the census never drove `setCabinetDepth` [relayed], so §6.3's *"only a crafted document is known
  to hold"* and the gate's "no owner question if the census finds nothing" no longer describe the state. Q-8U-3 was
  asked and answered; ADR 0166 decision 8 is accepted on the ruling.
- **The editor merge is subquadratic via a screen** that restates four of `planBlock`'s guards; its comment says to
  change both places [relayed]. ADR 0166 decision 6 records the cost.
- **S5 is not built.** §9's *"After S5 the 800 figure survives with exactly two meanings"* describes a future state; ADR
  0166's *Consequences* gives today's three.

**Scribe duties (§11 closing paragraph, §6.2, §6.3, R12) — done:** ADR 0166 accepted; dated notes on ADR 0037, 0046,
0052, 0110 (a dated amendment to decision 2), 0122; `decisions/README.md` and `SUPERSESSIONS.md`; DEVELOPMENT-SPEC
§3.2, §4, §5.2, §11 rows 25–27, §13.3 item 2 left open; backlog 243–249 and 252, 255; STATUS.

**Not evidenced to the scribe:** criterion 18's visual captures and the S1 security reading — the coordinator relayed
"built and reviewed" for the wave, not these two by name, and the scribe read neither. Criterion 20's `pnpm check` and `pnpm format:check` at the closing commit — not relayed.

### Code comments that cite this plan — repoint before the plan is archived

This plan will be archived at M8's close (WORKFLOW step 7), and an archived plan must not be read. These comments and
test titles point into it. **A developer edits them; the scribe does not.** Found with the Grep tool for
`\b8[UV]\b` outside `docs/` (115 occurrences in 49 files) — **not** `rtk proxy grep`, because the scribe has no shell.
Plain wave labels (*"8U's oracle"*, *"since wave 8V"*, *"M8 wave 8V"*) may stay; the rows below are the section,
criterion and decision pointers. *"ADR 0166 c. n"* means the criterion table in ADR 0166. **A second pass** for
pointers without the wave token (`plan §`, `§4.1–§6.3`, `(Dn`, `8N.n`, `8J2`) over `apps/web/src`, `apps/web/tests` and
`packages/configurator-domain/src` added one row (`8N.5`); its other hits cite older plans or DEVELOPMENT-SPEC sections
(e.g. `§6.1` picking, `§6.3` identity, `repository.ts:38`'s pre-8V *D3*) and are not this plan's. Kept as they are:
`qa-8n-harness.adversarial.test.ts:26` (a marker string) and `mail-configuration.test.ts:636` (asserts *"wave 8N"* is
**absent** from `.env.example`).

| Pointer in code | Where (file:line) | Repoint to |
| --- | --- | --- |
| `8U plan §5` — the rule, 800 caps a cabinet not a space | `apps/web/tests/store/qa-5g.adversarial.test.ts:1`, `:118`; `apps/web/tests/store/empty-column-ceiling.test.ts:2`, `:125`; `packages/configurator-domain/src/merge-empty-columns.ts:2`, `:42`; `tests/empty-column-ceiling.test.ts:1`; `tests/merge-empty-columns.generated-kitchen.test.ts:3`; `tests/merge-empty-columns.test.ts:1`, `:149` | ADR 0166 decision 1 |
| `8U plan §5` — a fit body into a wider space | `apps/web/tests/store/empty-columns-merge.test.ts:128`; `packages/configurator-domain/tests/qa-5b2a.adversarial.test.ts:788`; `tests/merge-empty-columns.test.ts:570` | ADR 0166 decisions 1 and 2 |
| `8U §5, criterion 8` and `8U §6.2` | `packages/three-adapter/tests/catalog-bodies.adversarial.test.ts:343` | ADR 0166 decision 2 / c. 8; decision 7 |
| `8U plan §6.1` — composition's private intermediate | `apps/web/tests/store/qa-7d1-shell-through-the-store.adversarial.test.ts:299`; `packages/three-adapter/tests/scene-sync.u-right-corner.test.ts:137`; `src/merge-empty-columns.ts:88`; `tests/support/shell-design.ts:272`; `tests/generation/generate-kitchen.composition-width-limit.test.ts:2`; `tests/generation/shell-design.adversarial.test.ts:493` | ADR 0166 decision 4; ADR 0110 *Dated amendment — 2026-10-17* |
| `8U plan S5` | `tests/generation/generate-kitchen.composition-width-limit.test.ts:4` | Backlog 255 |
| `(8U plan` … uncapped (continues on the next line) | `src/module-grid.ts:26` | ADR 0166 decisions 1 and 4; backlog 255 for the cuts that remain |
| `8U plan §6.3`, `plan §6.3`, `R14` | `src/merge-empty-columns.ts:102`, `:525`, `:696`; `tests/merge-empty-columns.fixpoint-and-order.test.ts:3`, `:151`, `:215` | ADR 0166 decision 8; backlog 246 |
| `KNOWN_LIMIT = "8U §6.3 known limit (R14)"` (a test-title constant) | `tests/merge-empty-columns.fixpoint-and-order.test.ts:56` | Retitle to backlog 246 / ADR 0166 decision 8 (a title change; list it under ADR 0152) |
| `8U §6.2 / R13` | `tests/merge-empty-columns.odd-width-known-limit.test.ts:1`, `:53`, `:105`; `tests/commands/set-width.beside-a-wide-space.property.test.ts:5` | ADR 0166 decision 7; backlog 245 |
| `KNOWN_LIMIT = "8U §6.2 / R13 known limit"` | `tests/merge-empty-columns.odd-width-known-limit.test.ts:40` | Retitle to backlog 245 / ADR 0166 decision 7 (§10 criterion 10 said the title cites R13 *"until the scribe writes the backlog row"*) |
| `8U plan §4.1` | `tests/empty-column-ceiling.test.ts:182`; `tests/merge-empty-columns.test.ts:348` | ADR 0166 decision 6; backlog 247 |
| `8U plan §2.3 B4 and §4.2` | `tests/support/merge-oracle.ts:5` | ADR 0166 *Context* (B1–B4) and decision 6 |
| `8U §12` (an owed QA case) | `tests/merge-empty-columns.widest-wall.test.ts:1`, `:54`; `tests/merge-empty-columns.mirror-equivariance.property.test.ts:1`, `:54`; `tests/merge-empty-columns.fixpoint-and-order.test.ts:214`, `:318`; `tests/commands/insert-fit.fixed-set-remainder.test.ts:1`, `:33`; `tests/commands/set-cabinet-depth.wide-merged-space.test.ts:1`, `:26`; `tests/merge-empty-columns.wall-end-round-trip.test.ts:1` | ADR 0166 decision 1 (decision 2 for the fixed-set file, decision 8 for `fixpoint…:214`); the other ADR each line already names stays |
| `8U criterion n` / `8U plan criterion 6` / `§10 criterion 8, 14` | `apps/web/tests/store/empty-column-ceiling.test.ts:122`; `apps/web/tests/store/empty-columns-merge.test.ts:5`; `apps/web/tests/panel/width-stepper.qa.test.ts:430`; `packages/three-adapter/tests/scene-sync.u-right-corner.test.ts:134`; `packages/three-adapter/tests/picking.merged-void.test.ts:1`, `:26`; `tests/empty-column-ceiling.test.ts:5`, `:148`, `:178`; `tests/merge-empty-columns.generated-kitchen.test.ts:94`; `tests/merge-empty-columns.fixpoint-and-order.test.ts:1`, `:123`, `:287`, `:347`; `tests/migrate-design.v1-split-and-one-wide-entry.test.ts:97`; `tests/queries/vacated-void.after-an-uncapped-merge.test.ts:1`, `:25`; `tests/merge-empty-columns.same-stretch-of-wall.test.ts:80`, `:223`; `tests/generation/shell-design.adversarial.test.ts:496`; `tests/merge-empty-columns.must-not-merge.test.ts:1`, `:56`, `:71`, `:115`, `:145`; `tests/merge-empty-columns.editor-sequences.property.test.ts:1`, `:195`; `tests/support/merge-oracle.ts:82`, `:218`; `tests/commands/set-width.beside-a-wide-space.property.test.ts:1`, `:48`; `tests/commands/insert-fit.at-its-maximum.test.ts:225`, `:249`, `:521`, `:538`; `tests/commands/set-cabinet-depth.round-trip-drift.known-defect.test.ts:28` | ADR 0166, the same criterion number (its criterion table) |
| `8U item 2: E2, E3, E11, E12` | `tests/commands/insert-fit.at-its-maximum.test.ts:366` | ADR 0166 decision 2 / c. 8 |
| *"Known defect, awaiting a backlog row"* | `tests/commands/set-cabinet-depth.round-trip-drift.known-defect.test.ts:1`, `:41` | Backlog 243 |
| *"Known defect … awaits a backlog row"*, and the pinned-seed note | `tests/merge-empty-columns.editor-sequences.property.test.ts:311`, `:313`, `:78` | Backlog 244 |
| `8U retired` (the cap refusal) | `tests/qa-6q-a-load-seam.adversarial.test.ts:68` | ADR 0166 decision 3 |
| `the 8V plan's D3` | `packages/persistence/tests/application-role-privileges.test.ts:199` | ADR 0165 D3 |
| `8V criterion 13` | `packages/persistence/tests/application-role-privileges.test.ts:55`, `:594` | ADR 0165 D3 (the table and its one grant) |
| `8V criterion 9` | `packages/persistence/tests/sent-kitchen-view-repository.live.test.ts:280` | ADR 0165 D3 (frozen copy) |
| `wave 8V D1` / `D2` | `apps/web/tests/e2e/qa-8m2-already-sent.adversarial.e2e.spec.ts:182`, `:213`; `support/contact-page.ts:93`, `:96`, `:124`, `:163`, `:176`; `support/qa-8m2.ts:140`, `:169`; `qa-8m-geometry.adversarial.e2e.spec.ts:169`; `qa-8m-after-sent.adversarial.e2e.spec.ts:3`, `:328`; `qa-8m-whatsapp.adversarial.e2e.spec.ts:203`; `qa-8m2-hand-over-and-read.adversarial.e2e.spec.ts:72`; `qa-8l-contact-phone.adversarial.e2e.spec.ts:279` | ADR 0165 D1 / D2 (same labels) |
| `8V criterion 17`, `8V criterion 18` | `apps/web/tests/e2e/qa-8m-after-sent.adversarial.e2e.spec.ts:409` (a test title); `support/qa-8m2.ts:50`, `:169` | ADR 0165 D1 (17), D2 (18) |
| `the plan's 8N.5` (the 8J2 plan's SMTP answer table) | `apps/web/tests/lib/server/mail/qa-8j-provider-answers.adversarial.test.ts:64` | ADR 0164 decision 5 (its answer table) |
| `-- M8 wave 8V.` (migration header) | `packages/persistence/src/migrations/0010_create_contact_submission_views.sql:1` | **Do not edit.** A migration's bytes are frozen and pinned by its text test |

**Disagreement between this plan and a hand-back, recorded rather than settled:** none found in what the scribe read
beyond the three above (S4b's census; S5; the visual and security evidence not seen).
