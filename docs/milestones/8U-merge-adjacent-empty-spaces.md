# Wave 8U — Adjacent empty spaces merge anywhere in a run

> **STATUS: PLANNED by the architect, 2026-10-16. Only S0 can be dispatched now (tests and measurements, no
> production change). S1 to S5 are blocked on Q-8U-1, the owner's one question below.** The scribe has not added
> pointers to this plan yet (STATUS, the M8 wave table, `decisions/README.md`). The ADR in *ADR draft* below is
> **Proposed**. It has no number yet: another architect is writing the 8N mail wave alongside this one, so the scribe
> gives it the next free number when it is accepted.

**Evidence tiers.** **[doc]** is quoted from a record in this repository. **[src]** was read in the working tree at
`HEAD` `ccb0cd5e`, whose only change is `.claude/agents/configurator-test-auditor.md`, a file this plan does not
touch. **[run]** is something the architect executed and is quoting: a scratch measurement in the session
scratchpad, which imports the domain's own `src`, plus one existing test run alone. Nothing was committed or left in
the repository. **[inf]** is the architect's inference, and each one names what would falsify it. No gate was run.

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

**Q-8U-1. One empty space wider than 800 mm, yes or no?**

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

## 5. The new rule, under (b), in the model's terms

> **Two member-less columns on one wall whose edges meet and whose floor, top and depth agree within `LEVEL_SNAP_M`
> are one column, whatever their total width.** The merge never moves, resizes or re-keys a placement. Its outer edges
> are its members' outer edges, so the run's total is conserved. It declines only for B4's reasons. **800 mm is the
> ceiling on a cabinet (`CABINETRY_MAX_WIDTH_MM`, §7), not on a space.** A `'fit'` cabinet inserted into an opening
> wider than its declared maximum is built at that maximum. It is seated with its left edge on the opening's left
> edge (ADR 0046 part 1's lower-along-wall seat), and the remainder stays one member-less column on its right.

Kept unchanged: **B1** (I3), **B3** (with §4 rule 1's WHY), **B4**, the left-edge seat, the insert split (ADR 0046
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
| **Generation (ADR 0110)** | **The largest effect.** Decision 2's premise (*"no two planned columns can merge"*) stops being true. The shell's tiled empty columns would merge at `loadWorld` before any insert, and `plannedVoid` requires a void that **starts** at the planned start [src: `generate-kitchen.ts:730-745`, `:765-788`]. Generation must still write only through `insertBody` and `setWidth` (ADR 0110 alternative D, U3b AC5). `leftover-rule.ts:31-41` reads the **space** ceiling as a cabinet bound and must read `CABINETRY_MAX_WIDTH_MM`, the same 800 | [src; doc] |
| **3D** | No builder changes. A void mesh is a translucent box with dashed edges, inset 14 mm (§6.1). **Anchor:** the void's centre (`x`/`z` from the column's along-wall centre; off-wall `d/2`), bottom at `y0`. **Scaling:** its width is the merged column's `w` less the inset, its height is the level's `h`. **Structural dependency:** a void exists only for a column the published map holds, so no seam may be drawn at a former boundary | [doc: §3.3, §6.1] |

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
| ADR 0110 decisions 2 and 4, *Moving only the 20 838 merging rooms* | 2026-09-11 onward | Generation tiles at 600 to 800 so nothing merges; the free end merges at 200 or less; generation goes only through commands | **Premise of d2 retired; d4's mechanism generalised** (S3). No generation-only primitive. Dated note |
| ADR 0122 decision 4 | 2026-09-17 | One extent per column across bands; the per-band model is a future wave, with this record as its trigger | **Unchanged and named.** I3 is that wave |
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
> Status: **Proposed**, 2026-10-16. Accepted only on Q-8U-1 = (b).
> Supersedes: ADR 0052 (for spaces) and ADR 0046's cap. Amends ADR 0037 (revived uncapped) and ADR 0110 d2/d4
> (premise). Leaves ADR 0122 d4 open.
>
> **Context.** The owner reported that spaces merge "only from edges" (2026-10-16). Measured: no positional rule
> exists. Two cleared 600s never merge because 1200 > 800 (ADR 0052), and narrow edge leftovers do.
> **Decision.** (1) The rule in §5 above. (2) A `'fit'` insert into an opening wider than its maximum builds at its
> maximum, flush left. (3) `EMPTY_COLUMN_WIDER_THAN_CAP` is retired at both seams; the v1 arm is unchanged; no schema
> bump. (4) Generation keeps its composed placements identical, through the command path. (5) Per-level merging under
> standing bodies is not decided here; it remains ADR 0122 d4's trigger.
> **Alternatives.** (a) Re-tile at 800 (two spaces remain). (c) No change. Per-level merge (the model cannot express
> it; Gap D). Sliding cabinets (§13.2). Merge only in the offer list (rejected by the owner, ADR 0046).
> **Consequences.** As in §6 and §13 of the 8U plan.

## 10. Acceptance criteria (under (b))

Each property is a `fast-check` property in the domain suite. Room sizes are drawn over the generator's accepted
grid. Command sequences are drawn from `removePlacement`, `insertBody` (any offered row into any void) and
`setWidth` (any offered step) applied to a generated kitchen, at most 12 commands deep. Every step goes through
`reconcileSuccessfulCommandResult`.

*The rule.*

1. **Maximal (property).** After every step, neither `recordedColumns` nor `columns` holds two member-less columns on
   one wall that abut (within 1e-6 mm) and agree (floor, top and `d` within 20 mm). The only exception is a pair that
   a B4 guard declines, and the counterexample report must name which guard. **Must not**: such a pair surviving
   because their total exceeds 800.
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

15. **Census.** Over the existing room sweeps (`tests/generation/generate-kitchen.u.grid-*.test.ts`,
    `qa-7d7-s3a-room-sweep.adversarial.test.ts`), every generated design's **placements** deep-equal S0's baseline
    fingerprint. Its frozen map differs only where the final design holds adjacent agreeing member-less columns, and
    every difference is exactly those columns merging. The rooms affected and the columns merged are **counted and
    quoted** in the close-out (R4).
16. **Through the commands only.** Generation calls only `insertBody` and `setWidth`, and no generation-only seating
    or width parameter exists (grep plus review).
17. `leftover-rule.ts`'s headroom reads `CABINETRY_MAX_WIDTH_MM`, and criterion 15 is unchanged by that edit.

*Visible.*

18. **Captured at 390 × 844** in the editor, preserving the drawing buffer. After E1: one void box per level spanning
    1500–2700 (less the 14 mm inset), with no seam at 2100. After E2: an 800 body flush left, an 800-wide wall box and
    top box above it, and one 400 box per level on the right. Also captured at 1440 × 900. The `wallA` preset frames
    the top row (§11 row 21).

*Hygiene.*

19. **Sabotage both ways (R6).** Restoring the cap at `merge-empty-columns.ts:226` turns criteria 1 and 6 red. Moving
    the correlate (a test reading a key rather than extents) keeps them green.
20. Rows 1 to 24 of §11 pass unchanged; `pnpm check` and `pnpm format:check` are green whole-tree at the closing commit.

## 11. Slices

**Tier: Full** (domain rule, persistence, generation): adversarial QA, then logic **and** clean-code review in
parallel. **Plus visual review** on S4, and **a security reader** on S1 (a refusal at a public write seam is
loosened). S0 is measurement and tests only, so it is coordinator-verified with no review round. One writing agent
per tree (R2). Every dispatch bans the discarding git commands by name (`agent-coordination.md`). **S1 to S3 must
each be green with the cap still in place.** S4 is the switch.

| Slice | Work (at most 5 items) | Production files | Reading |
| --- | --- | --- | --- |
| **S0** — dispatchable now | (1) A witness on a generated L room: a mid-run pair of whole-column clears summing to at most 800, with bodies on both sides, merges. (2) The owner's case (criterion 6) as a characterisation test asserting **today's** two 600s, titled as the expectation 8U flips. (3) A census over the two room sweeps: per-room fingerprints (placements and the projected frozen map) stored as a test fixture; counts of adjacent agreeing member-less pairs in generated output; and, after clearing each adjacent pair of columns, counts of pairs held apart by B2 versus B3 (top, floor or depth, separately). (4) A fixpoint census: the maps where a second merge pass changes something. (5) Generation's insert order per wall, and whether each `plannedVoid` would still find its void if the run's empty columns were one span. All quoted in the report | none | this plan §2, §5, §10 (1, 6, 15); `merge-empty-columns.ts` whole; `void-engine.ts:386-516`; `reconcile-command-result.ts`; `generate-kitchen.ts:690-800`; `tests/merge-empty-columns.test.ts:492-565`; `tests/commands/qa-c7s1-span-overlap.adversarial.test.ts:1-120` (the generate-and-reconcile pattern); `tests/support/fake-probe.ts`; the two sweep suites; ADR 0046, ADR 0110 d1–d4 |
| **S1** — persistence seam | (1) Retire `EMPTY_COLUMN_WIDER_THAN_CAP` from `validateDesignForCatalog` and the severity table. (2) Round-trip tests at both seams (criterion 13), with HEAD's refusal table minus that code. (3) Check that no reader of `schemaVersion` branches on the ceiling, or stop and report. (4) Leave the v1 arm byte-identical, with a test (criterion 14). (5) **Flip, in this slice, every test that asserts the cap refusal**, listed with its old and new expectation and the ADR (ADR 0152). Found by `rtk proxy grep WIDER_THAN_CAP`: `packages/configurator-domain/tests/qa-5g.adversarial.test.ts` (:120, :132, :140, :163, :227, :277), `tests/qa-5b2a.adversarial.test.ts` (:237, :508, :785), `tests/qa-5h.adversarial.test.ts:180` (a comment that names the bound), `tests/merge-empty-columns.test.ts:454` (a comment), and `apps/web/tests/app/api/designs/qa-5g.adversarial.test.ts`. A v1 case that asserts the *split* stays as it is. One that asserts a v2+ *refusal* becomes an acceptance | `validate-design.ts` (and `design-bounds.ts` only if a bound must move). The tests in `apps/web` change, but no web production file does | §6 *Persistence*; criteria 13–14; ADR 0052 *Migration*, *Security*; ADR 0044; ADR 0053; ADR 0146 (nothing from a driver leaves); `validate-design.ts:33-60`, `:180-190`, `:392-406`; `migrate-design.ts` whole; `tests/validate-design.test.ts`, `tests/migrate-design.test.ts`, `tests/empty-column-ceiling.test.ts`; the API write seam's call to the validator (`apps/web/src/app/api/designs/[id]/route.ts`; `packages/persistence/src` calls none, grep) |
| **S2** — fit at its maximum | (1) `resolveFitWidth` builds at `min(opening, maximum)` and keeps the floors first. (2) Confirm the left-edge seat and `splitColumn` produce one remainder for a body narrower than its opening (test). (3) The offer list and its count line for a void wider than 800 (criterion 10). (4) The sweeps of criteria 8–9 over hand-built maps (ADR 0093: a rule the shipped kitchen cannot exercise owes a witness) | `commands/insert-fit.ts`, `queries/offers.ts`, `queries/describe-selection.ts` (only if the count line is built there) | §5, E2, E11, E12; criteria 8–10; DEVELOPMENT-SPEC §5.2, §9 item 3; ADR 0017, ADR 0032 (+ the *Superseded* section), ADR 0035 d1–d2, ADR 0046 part 1 (*seated at an edge*), ADR 0048, ADR 0093; `insert-fit.ts:280-360`, `insert-body.ts`, `split-column.ts` |
| **S3** — generation survives an uncapped merge | (1) Generation composes identical placements when the run's empty columns are one span: insert order and `plannedVoid` matching per S0 item 5, and a `'fit'` body stepped back to its planned width through `setWidth`, as ADR 0110 d4 already does at the free end. **Name the gate:** `isFreeEndBody` steps a body back only when `run.endMm - planned.endMm <= 200` (`generate-kitchen.ts:795-800`). Uncapped, a free-end leftover of 201 to `MAX_GENERATED_LEFTOVER_MM` (599) merges with the last planned column, so a `'fit'` body there is built at 800, the gate is false, and nothing steps it back. That gate's predicate must become "the opening is wider than the planned body", not a distance to the run's end. (2) `leftover-rule.ts` reads `CABINETRY_MAX_WIDTH_MM` (criterion 17). (3) Criterion 15 **in both worlds**: as shipped, and with the merge's cap mocked away (`vi.mock` of the module-grid constant) | `generation/generate-kitchen.ts`, `generation/leftover-rule.ts`, `generation/shell-design.ts` (only if the tiling must change) | §6 *Generation*; criteria 15–17; ADR 0110 d1–d4, alternative D, U3b AC5, the *20 838 merging rooms* row; ADR 0132 d1; S0's report items 3 and 5; `generate-kitchen.ts` whole; `shell-design.ts:400-460`; `leftover-rule.ts`; `tall-end-rule.ts`, `fridge-end-leftover.ts` (readers of the headroom) |
| **S4** — the switch | (1) Remove the cap from `widestBlockFrom` [`merge-empty-columns.ts:226`]. (2) Iterate `planMerges` to a fixpoint; it terminates because each pass removes at least one column (criterion 2). (3) Flip, citing the ADR, the tests that assert the **merge** cap (S1 already flipped the refusal-code tests): `merge-empty-columns.test.ts:148`, `:161`, `:522`, and any merge or shrink-split assertion in `empty-column-ceiling.test.ts` / `qa-5b4b`. **Each flip is listed in the report with its old and new expectation (ADR 0152)**. (4) Criteria 1–7, 11, 12 and 19 as properties and pins. (5) The visual captures (criterion 18) | `merge-empty-columns.ts`, `module-grid.ts` (doc comment only) | §5, §10 whole; ADR 0037, ADR 0046 (whole), ADR 0052, ADR 0043, ADR 0090 4b and Amendment B, ADR 0122, ADR 0152; `merge-empty-columns.ts` whole; `tests/merge-empty-columns.test.ts`, `tests/empty-column-ceiling.test.ts`, `tests/qa-5b4b.adversarial.test.ts`, `tests/qa-5g.adversarial.test.ts`; `queries/vacated-void.ts`; `browser-and-visual-qa.md` |
| **S5** — retire the cut at 800 (behaviour-free after S4) | (1) `splitColumn`'s remainder becomes one piece. (2) The shrink's overflow pieces go (`width-resize-model.ts:117` and its writer). (3) `splitOversizedEmptyColumns` leaves the funnel and the exports. (4) `MAX_EMPTY_COLUMN_WIDTH_MM` remains only for the v1 arm, renamed to say so. **Proof that it is behaviour-free:** criterion 1's sequences give deep-equal reconciled maps before and after the slice | `commands/split-column.ts`, `commands/width-resize-model.ts`, `commands/apply-column-moves.ts`, `split-oversized-empty-columns.ts`, `commands/reconcile-command-result.ts` | ADR 0052 *Consequences*; ADR 0046 part 1; `split-empty-span.ts`; `void-engine.ts:30-40` (exports); `index.ts`; the S4 property suite |

The scribe owns the closing documents: the ADR's acceptance and number, dated notes on ADR 0037, 0046, 0052, 0110 and
0122, `decisions/README.md`, `SUPERSESSIONS.md`, DEVELOPMENT-SPEC §3.2, §4, §5.2 and §11 rows 25–27, and STATUS.

**Reading — QA (every slice):** this plan §5, §10 and §12; the slice's own *Reading* cell;
`engineering-conventions.md`, *Coverage an adversarial pass owes* and *Three guards that look thorough and cannot
fail*; WORKFLOW R6; ADR 0152; `tests/support/fake-probe.ts`; the generated-kitchen pattern in
`qa-c7s1-span-overlap.adversarial.test.ts:1-120`.

**Reading — logic reviewer:** this plan §2–§7 and §10; ADR 0037, 0046, 0052, 0110 d1–d4, 0122; DEVELOPMENT-SPEC
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
- Generation sweep under the mocked uncapped constant: zero placement differences, with every frozen-map difference
  explained.
- Price is identical across every QA sequence.
- R6 both ways on criteria 1, 2, 8 and 15.

## 13. Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | **Generation** relied on the cap (ADR 0110 d2), and an uncapped merge collapses the shell before inserting | S3 lands first and is proven under a mocked uncapped merge. S0 measures insert order. If S3 cannot keep placements identical through the command path alone, **stop and return to planning**: it is an ADR 0110 change and needs a ruling |
| R2 | The fit change touches §5.2, the offer list and the count line | Byte-identical behaviour at or under the maximum (criterion 8) |
| R3 | A loosened write-seam refusal | A security reader; every other refusal pinned unchanged (criterion 13) |
| R4 | Tests that assert the cap are flipped and launder a defect | Every flip is listed with its reason and ADR (S4 item 3); the logic reviewer reads each one |
| R5 | The fixpoint changes the envelope in rare tolerance chains, so a stored map differs at load | Counted in S0 item 4 and quoted; placements never change |
| R6 | The owner expects per-level merging (I3) | Stated in Q-8U-1's text. If wanted, it is ADR 0122 d4's wave, with its own plan |
| R7 | Disagreeing pairs (E8) still show as two adjacent spaces, and the owner reports again | S0 counts them. §4 rule 1's WHY is a shipped fix that must not be simplified away (`product-invariants.md`) |
| R8 | Very wide void boxes on a phone: framing, and the click-stealing that §6.1's line threshold guards against | Visual review at 390 × 844, plus §11 rows 21–22 |
| R9 | A collision with the concurrent 8N plan's ADR number | The number is given at acceptance by the scribe |

## 14. Verification

The coordinator re-runs each slice's named suites and reads the diff (WORKFLOW *Trust but verify*). Before close:
`pnpm check`, `pnpm format:check` whole-tree, and `pnpm ci:local` on a clean tree before any push (R8). The S0 census
and the S3/S4 census figures are quoted from the runs, never estimated (R4). The visual captures are attached to the
close-out. The milestone's test audit covers 8U's tests (ADR 0152 Amendment A).

**Where it sits [inf]:** a wave on the M8 branch before 8T. 8T is the owner-attended gate on a real phone, and it
should see the editor as it will ship. Nothing ships mid-milestone either way.
