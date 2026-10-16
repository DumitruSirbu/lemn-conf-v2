# Wave 8U — Adjacent empty spaces merge anywhere in a run

> **STATUS: PLANNED by the architect, 2026-10-16. Revised the same day after S0's stop (§6.1).** S0 is done (tests
> and census, no production change). It hit §13 R1's STOP: with the cap lifted, generation throws. The owner
> answered **Q-8U-1 = (b)**. The architect's ruling on generation is in §6.1 and needs **no owner question**.
> **S1, S2 and S3 can be dispatched once S0 is verified and committed**, under the conditions in §11. S4 waits
> for S3. The owner has one new
> question, **Q-8U-2** (§4.1). It is **non-blocking**, and its recommended default is what S4 builds.
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
for this revision.

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
> one 800 mm wide and one 100 mm wide. This is how it looks today, and after this change it still will. Everywhere
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
> Status: **Proposed**, 2026-10-16. Q-8U-1 was answered (b) on 2026-10-16, so it is accepted at S4's close.
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
> 6. **F2: one known exception.** A member-less span exactly over a corner column keys onto that column
>    (`isKeyTaken`, `EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT`) and stays as two. In a generated U that is the
>    upper row above each corner: 63 475 rooms. Owner question Q-8U-2 is non-blocking, with default (a). If it is
>    ever built, it is a corner-ownership change, recorded with its trigger (ADR 0118).
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
   a B4 guard declines, and the counterexample report must name which guard. **The one exception known in advance
   is F2** (§4.1): `isKeyTaken` declines the pair above each corner of a generated U. The close-out quotes its count,
   and it must equal S0's 126 950 pairs in 63 475 rooms, or the difference is explained. **Must not**: such a pair
   surviving because their total exceeds 800; an F2 pair merging into a key the validator refuses.
2. **Idempotent (property).** `merge(merge(m))` deep-equals `merge(m)` for every map reached in criterion 1, including
   a hand-built tolerance chain whose tops are 2.56 / 2.60 / 2.58 (one column at the fixpoint; see criterion 7(b)). Today's code does not guarantee this
   [src: `merge-empty-columns.ts:372-374`], so S4 iterates to a fixpoint. **A red result here is a finding, not a
   flaky test.**
3. **Length conserved (property).** For each wall and each `[floor, top]` band, the union of member-less along-wall
   intervals in whole millimetres is identical before and after the merge. Each merged extent's left and right edges
   are its outermost members' edges.
4. **No cabinet moves (property).** `design.placements` deep-equals the command's own output after reconcile, and
   `priceDesign` returns the same result. The merge never changes a placement field.
5. **Order-independent (property).** Clearing the same set of columns in any order publishes deep-equal maps (keys,
   extents, `depthFromBuildId`). Uncapped, ADR 0037 measured this; the sort stays for the template tie.
6. **Owner's case.** On a generated L room (4100 × 3300 × 2600), clearing `A|1.80` and `A|2.40` at every level gives
   one member-less column at 1500–2700, three level voids of 1200 mm, and the neighbours' placements byte-identical.
   This is S0's characterisation test, with its expectation flipped in S4, citing this ADR.
7. **Must not merge (anti-invariants).** (a) Base-only clears under standing uppers (E6) stay two base voids, with each
   column keeping its key. (b) A pair that disagrees by more than 20 mm on floor, top or depth stays two (E8) **when no agreeing
   neighbour bridges them**. A bridged chain such as tops 2.56 | 2.60 | 2.58 is one column at the fixpoint, with the
   conservative envelope (top 2.56). That is the chain drift `merge-empty-columns.ts:372-374` already accepts (620,
   600 and 580 lose 40 mm), and it is what makes criterion 5 hold: without the iteration, the clear order decides
   whether that chain becomes one column or two. (c)
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
| 2, 5 | The tolerance chain: tops 2.56 / 2.60 / 2.58, then depths 620 / 600 / 580, cleared in all 6 orders | A second pass changes 0 generated maps [S0] |
| 7(a) | Two adjacent 300 mm columns whose uppers stand and whose bases are removed | No occupied adjacent pair is 800 mm or less [S0] |
| 7(b) | A pair of 600 + 200 (≤ 800) whose top differs by 30 mm, one whose floor differs and one whose depth differs, each alone and with no bridge | No agreeing pair of 800 mm or less stays apart, and the generated B3 pairs are all U pairs where floor and depth differ together (95 893) [S0] |
| 1 (F2) | A hand-built L whose upper row over the corner holds 800 + 100 | F2 is generated in U only [S0] |

Each fixture's test states in its title which criterion it witnesses. Each must turn red under R6, with the cap
restored or the iteration removed.

*Insert.*

8. **Fit at its maximum.** A sweep over every `'fit'` entry and openings of 50 to 3000 mm in 50 mm steps, at each
   level the entry's band allows. If the opening is at most the maximum, the result is byte-identical to HEAD (same
   success or the same refusal code). If it is wider, the body is built at the entry's maximum, its left edge on the
   opening's left edge, with exactly one member-less remainder column on its right. **Must not**: a body wider than
   800, a body off the left edge, or a remainder in more than one column.
9. **Fixed-set rows** (dishwasher, bottle cargo, the four full-height rows except the pantry) behave as at HEAD at
   every width in the same sweep.
10. **The offer list** for a void wider than 800 lists every row that criterion 8 accepts there, and no row it
    refuses. The count line is derived and never a literal (§9).

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
        (placements, steps, commands and frozen map) differ, and it must be 0.
    - **Both worlds.** It holds (i) at S3, with both limits at 800, and (ii) at S4, with the editor uncapped. Before
      S4 lands, (ii) is proven by mocking `module-grid.ts`'s `MAX_EMPTY_COLUMN_WIDTH_MM` to `Infinity`, which is
      S0's own mock.
    - **The pass condition is S0's figures reversed**: 0 throws in 86 706 composed U and 2 990 composed L rooms; 0
      newly refused; the owner's 4100 × 3300 room composes to its baseline.
    - **Must not**: a composed room changing between the two worlds; a refusal in one world and not the other.
15a. **The delivered design is the editor's canonical form.** For every composed room, the final uncapped derivation
    changes the frozen map in **0** rooms. The count is quoted at S3 under the mock and at S4 for real, and compared
    with S0's 0 of 89 696. Loading the design through the editor's own load (`deriveRecordedColumns` and
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

| Slice | Work (at most 5 items) | Production files | Reading |
| --- | --- | --- | --- |
| **S0** — **done 2026-10-16**, uncommitted at this revision: test file `tests/merge-empty-columns.generated-kitchen.test.ts`, census in the gitignored `testing-reports/2026-10-16-8u-s0-census/`. It hit R1 (§6.1) | (1) A witness on a generated L room: a mid-run pair of whole-column clears summing to at most 800, with bodies on both sides, merges. (2) The owner's case (criterion 6) as a characterisation test asserting **today's** two 600s, titled as the expectation 8U flips. (3) A census over the two room sweeps: per-room fingerprints (placements and the projected frozen map) stored as a test fixture; counts of adjacent agreeing member-less pairs in generated output; and, after clearing each adjacent pair of columns, counts of pairs held apart by B2 versus B3 (top, floor or depth, separately). (4) A fixpoint census: the maps where a second merge pass changes something. (5) Generation's insert order per wall, and whether each `plannedVoid` would still find its void if the run's empty columns were one span. All quoted in the report | none | this plan §2, §5, §10 (1, 6, 15); `merge-empty-columns.ts` whole; `void-engine.ts:386-516`; `reconcile-command-result.ts`; `generate-kitchen.ts:690-800`; `tests/merge-empty-columns.test.ts:492-565`; `tests/commands/qa-c7s1-span-overlap.adversarial.test.ts:1-120` (the generate-and-reconcile pattern); `tests/support/fake-probe.ts`; the two sweep suites; ADR 0046, ADR 0110 d1–d4 |
| **S1** — persistence seam | (1) Retire `EMPTY_COLUMN_WIDER_THAN_CAP` from `validateDesignForCatalog` and the severity table. (2) Round-trip tests at both seams (criterion 13), with HEAD's refusal table minus that code. (3) Check that no reader of `schemaVersion` branches on the ceiling, or stop and report. (4) Leave the v1 arm byte-identical, with a test (criterion 14). Criterion 15's digests stay unchanged, checked in this slice. (5) **Flip, in this slice, every test that asserts the cap refusal**, listed with its old and new expectation and the ADR (ADR 0152). Found by `rtk proxy grep WIDER_THAN_CAP`: `packages/configurator-domain/tests/qa-5g.adversarial.test.ts` (:120, :132, :140, :163, :227, :277), `tests/qa-5b2a.adversarial.test.ts` (:237, :508, :785), `tests/qa-5h.adversarial.test.ts:180` (a comment that names the bound), `tests/merge-empty-columns.test.ts:454` (a comment), and `apps/web/tests/app/api/designs/qa-5g.adversarial.test.ts`. A v1 case that asserts the *split* stays as it is. One that asserts a v2+ *refusal* becomes an acceptance | `validate-design.ts` (and `design-bounds.ts` only if a bound must move). The tests in `apps/web` change, but no web production file does | §6 *Persistence*; criteria 13–14; ADR 0052 *Migration*, *Security*; ADR 0044; ADR 0053; ADR 0146 (nothing from a driver leaves); `validate-design.ts:33-60`, `:180-190`, `:392-406`; `migrate-design.ts` whole; `tests/validate-design.test.ts`, `tests/migrate-design.test.ts`, `tests/empty-column-ceiling.test.ts`; the API write seam's call to the validator (`apps/web/src/app/api/designs/[id]/route.ts`; `packages/persistence/src` calls none, grep) |
| **S2** — fit at its maximum | (1) `resolveFitWidth` builds at `min(opening, maximum)` and keeps the floors first. (2) Confirm the left-edge seat and `splitColumn` produce one remainder for a body narrower than its opening (test). (3) The offer list and its count line for a void wider than 800 (criterion 10). (4) The sweeps of criteria 8–9 over hand-built maps (ADR 0093: a rule the shipped kitchen cannot exercise owes a witness) (5) **Generation stays byte-identical** (criterion 15's digests), checked in this slice and not assumed. If a digest moves, a generated `'fit'` insert met an opening wider than its maximum: stop and report the room | `commands/insert-fit.ts`, `queries/offers.ts`, `queries/describe-selection.ts` (only if the count line is built there) | §5, E2, E11, E12; criteria 8–10; DEVELOPMENT-SPEC §5.2, §9 item 3; ADR 0017, ADR 0032 (+ the *Superseded* section), ADR 0035 d1–d2, ADR 0046 part 1 (*seated at an edge*), ADR 0048, ADR 0093; `insert-fit.ts:280-360`, `insert-body.ts`, `split-column.ts` |
| **S3** — composition merges at its own limit (re-scoped 2026-10-16, §6.1; behaviour-free at HEAD) | ~~(1) Generation composes identical placements when the run's empty columns are one span … That gate's predicate must become "the opening is wider than the planned body".~~ **Struck 2026-10-16: S0 showed one span cannot be composed through the left seat in reading order, and under §6.1 composition never sees one span, so the `isFreeEndBody` gate (`generate-kitchen.ts:795-800`) is unchanged.** (1) **The limit as a value.** `mergeAdjacentEmptyColumns` takes its width limit as an argument. `deriveColumns`, `deriveRecordedColumns` and `reconcileSuccessfulCommandResult` pass it through. With no argument they keep today's 800 (the editor's limit stays 800 until S4). It is a number, never a boolean (`engineering-conventions.md`). `splitEmptySpanAtCap` takes it too, for the shell's tiling, and so does `splitOversizedEmptyColumns` inside the reconcile. That makes the funnel **around** the commands independent of `module-grid.ts`. The commands' own two cuts (§6.1, *Two cuts inside the commands*) still read it, and no command gains a parameter. So (1a) **the census counts how often the insert-split cut and the shrink-overflow cut fire during composition**, at HEAD and under S0's mock. The expected count is 0, and a non-zero count stops the slice. (1b) **Flip owed (ADR 0152):** the test at `tests/generation/leftover-absorbed-beside-a-fixed-body.test.ts:107-112` asserts `CABINETRY_MAX_WIDTH_MM >= MAX_EMPTY_COLUMN_WIDTH_MM` (`:108-110`), the guard for two 800s read by one plan (its comment, `:104-106`). Once the headroom reads the catalogue's ceiling, that line guards nothing. It is restated as a property: for every width up to the ceiling, width plus `headroomBelowTheCeilingMm(width)` never exceeds `CABINETRY_MAX_WIDTH_MM` (old and new expectation listed in the report). `:111`, the owner's literal 800 against the catalogue, stays. (2) **Composition passes `CABINETRY_MAX_WIDTH_MM`** at all four sites, and the limit is named once in `generation/`: `shell-design.ts:890`, `loadWorld`, `applySuccessfulResult` and `replayGenerationLog`. `leftover-rule.ts` reads the same constant (criterion 17). (3) **The finishing step**: one uncapped `deriveRecordedColumns` → `projectFrozenMap` → `withFrozenMap` before `assertGeneratedDesign`, in both `generateKitchen` and `replayGenerationLog`. It counts the maps it changes (criterion 15a). (4) Criteria 15, 15a, 16 and 17 in **both worlds**, the second under S0's `module-grid` mock, with S0's figures reversed. The docstrings at `generate-kitchen.ts:231-232` and `:902` are corrected. (5) **Report the census** (rooms, throws, refusals, digest equality, maps changed by the finishing step), quoted from the run | `merge-empty-columns.ts` (signature only), `void-engine.ts` (`deriveColumns`, `deriveRecordedColumns` signatures), `commands/reconcile-command-result.ts`, `split-empty-span.ts`, `generation/generate-kitchen.ts`, `generation/shell-design.ts`, `generation/leftover-rule.ts`. **About 7 files, over the ~5 limit; named here as `docs/WORKFLOW.md` requires.** Three of them are signature-only, with no behaviour change at HEAD | §6.1 whole; criteria 15–17; ADR 0110 decision 2, *D revised* 1–5, B2, N11.8 (alternative D), U3b AC5 (M7B plan, `M7B-u-shaped-rooms.md:1388-1390`); ADR 0046 rule 1; S0's census scripts `c6`, `c8`, `c9` and `census-lib.ts` (`testing-reports/2026-10-16-8u-s0-census/scripts/`) as the census pattern; `generate-kitchen.ts:327-440`, `:698-801`, `:902-921`; `shell-design.ts:880-908`; `void-engine.ts:425-520`; `reconcile-command-result.ts` whole; `merge-empty-columns.ts:65-100`, `:207-231`; `split-empty-span.ts`; `leftover-rule.ts`; `tests/support/l-and-linear-generation-digest.ts` |
| **S4** — the switch | (1) Remove the cap from `widestBlockFrom` [`merge-empty-columns.ts:226`]. After S3, this means the editor's default limit becomes none, while composition's stays `CABINETRY_MAX_WIDTH_MM`. Criterion 15 is re-run for real here, with no mock, and must still match S0's baseline. Criterion 15a's count is quoted. The F2 count is quoted against S0's 126 950 (criterion 1). F4's hand-built fixtures (§10, after criterion 7) land in this slice. (2) Iterate `planMerges` to a fixpoint; it terminates because each pass removes at least one column (criterion 2). (3) Flip, citing the ADR, the tests that assert the **merge** cap (S1 already flipped the refusal-code tests): `merge-empty-columns.test.ts:148`, `:161`, `:522`, and any merge or shrink-split assertion in `empty-column-ceiling.test.ts` / `qa-5b4b`. **Each flip is listed in the report with its old and new expectation (ADR 0152)**. (4) Criteria 1–7, 11, 12 and 19 as properties and pins. (5) The visual captures (criterion 18) | `merge-empty-columns.ts`, `module-grid.ts` (doc comment only), and the one file where S3 put the editor's default limit. Nothing under `generation/` | §5, §6.1, §10 whole; ADR 0037, ADR 0046 (whole), ADR 0052, ADR 0043, ADR 0090 4b and Amendment B, ADR 0122, ADR 0152; `merge-empty-columns.ts` whole; `tests/merge-empty-columns.test.ts`, `tests/empty-column-ceiling.test.ts`, `tests/qa-5b4b.adversarial.test.ts`, `tests/qa-5g.adversarial.test.ts`; `queries/vacated-void.ts`; `browser-and-visual-qa.md` |
| **S5** — retire the cut at 800 (behaviour-free after S4) | (1) `splitColumn`'s remainder becomes one piece. (2) The shrink's overflow pieces go (`width-resize-model.ts:117` and its writer). (3) `splitOversizedEmptyColumns` leaves the funnel and the exports. (4) `MAX_EMPTY_COLUMN_WIDTH_MM` remains only for the v1 arm, renamed to say so. Composition already reads `CABINETRY_MAX_WIDTH_MM` (S3), so nothing in `generation/` changes. **Proof that it is behaviour-free, in both worlds:** criterion 1's sequences give deep-equal reconciled maps before and after the slice, and criterion 15's generation digests are byte-identical before and after. Removing the commands' cuts is behaviour-free in composition only because S3's count showed they never fire there. S5 re-runs that count before deleting them, and quotes it | `commands/split-column.ts`, `commands/width-resize-model.ts`, `commands/apply-column-moves.ts`, `split-oversized-empty-columns.ts`, `commands/reconcile-command-result.ts` | ADR 0052 *Consequences*; ADR 0046 part 1; `split-empty-span.ts`; `void-engine.ts:30-40` (exports); `index.ts`; the S4 property suite |

The scribe owns the closing documents: the ADR's acceptance and number, dated notes on ADR 0037, 0046, 0052, 0110 and
0122. ADR 0110's note is a **dated amendment** to decision 2, *"the same published openings"*, written from ADR
draft decision 4, with pointers at *D revised* 5 and N11.8 alternative D. The scribe also adds a backlog row for F2
under Q-8U-2's answer, with §4.1 as its trigger (ADR 0118). Then: `decisions/README.md`, `SUPERSESSIONS.md`, DEVELOPMENT-SPEC §3.2, §4, §5.2 and §11 rows 25–27, and STATUS.

**Reading — QA (every slice):** this plan §5, §6.1 (*Test fidelity*), §10 (with the F4 table) and §12; the slice's own *Reading* cell;
`engineering-conventions.md`, *Coverage an adversarial pass owes* and *Three guards that look thorough and cannot
fail*; WORKFLOW R6; ADR 0152; `tests/support/fake-probe.ts`; the generated-kitchen pattern in
`qa-c7s1-span-overlap.adversarial.test.ts:1-120`.

**Reading — logic reviewer:** this plan §2–§7 (with §4.1 and §6.1) and §10; ADR 0037, 0046, 0052, 0110 d1–d4, *D revised*, N11.8, 0122; DEVELOPMENT-SPEC
§3.2, §4, §5.1–§5.4 and §11; the slice's diff with its tests.

**Reading — clean-code reviewer:** `engineering-conventions.md`; ADR 0136 (comments); the diff, plus the files it
touches in full.

**Reading — visual reviewer (S4):** `browser-and-visual-qa.md`; DEVELOPMENT-SPEC §6.1, §6.4 and §11 rows 21–22; this
plan's E1, E2 and criterion 18.

**Reading — security reader (S1):** ADR 0052 *Security*; ADR 0146; ADR 0019; `validate-design.ts` diff; the
persistence write seam.

## 12. Adversarial QA cases owed

- An odd total from a crafted stored document (a half-millimetre centre) → declined, never rounded, and never a throw
  at `projectEmptyColumns`.
- A key collision: two cleared wall columns over the corner whose merged centre keys `A|0.45` → declined. The seeded
  corner columns stay apart (`merge-empty-columns.test.ts:304`).
- `standsIn`: a run that encloses a placement → declined, at every width now possible.
- A tolerance chain: tops 2.56 / 2.60 / 2.58 and depths 620 / 600 / 580. Check that one pass equals two, and that the
  envelope is never wider than any member's.
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
| R11 | **The census proves nothing** because generation's limit aliases the constant S0's mock replaces | Composition reads `CABINETRY_MAX_WIDTH_MM` from `catalog.ts`, never from `module-grid.ts` (criterion 17). The reverse sabotage in criterion 19 must reproduce S0's throw |
| R2 | The fit change touches §5.2, the offer list and the count line | Byte-identical behaviour at or under the maximum (criterion 8) |
| R3 | A loosened write-seam refusal | A security reader; every other refusal pinned unchanged (criterion 13) |
| R4 | Tests that assert the cap are flipped and launder a defect | Every flip is listed with its reason and ADR (S4 item 3); the logic reviewer reads each one |
| R5 | The fixpoint changes the envelope in rare tolerance chains, so a stored map differs at load | Counted in S0 item 4 and quoted: a second pass changes **0** maps [S0]. So the generated world cannot witness it, and F4's hand-built chain is the only test that can fail (criterion 2). Placements never change |
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
