# ADR 0167 — Generation fills every free wall-run end that the narrowest catalogue cabinet fits, at every level its column carries, and a narrower end stays bare

Status: **Proposed — 2026-10-17.** Nothing in this record is built. It becomes Accepted at wave F1b's close
(`milestones/M8C-generation-fill-and-preset-authoring.md`, §5). The owner's rulings it rests on are recorded below as
rulings; the mechanism (decisions D1–D9, M-1 and M-2) is the architect's plan and is not ruled.
Date: 2026-10-17
Type: Decision (owner rulings, relayed + architect's plan)
Milestone: M8C — waves F1a and F1b (plan: [`milestones/M8C-generation-fill-and-preset-authoring.md`](../milestones/M8C-generation-fill-and-preset-authoring.md), §2)

**Supersedes, when Accepted, for generated kitchens only:** [ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
Amendment A4 (*"the remainder, at most 599 mm, stays"*) and N11.9's RQ25a / RQ25b scope and floor.
**Amends, when Accepted:** [ADR 0166](0166-adjacent-empty-spaces-merge-whatever-their-total-and-800-mm-caps-the-cabinet-not-the-space.md)
decision 4 (by M-1, or by M-2 if F1a is withdrawn), and the notes listed under *Consequences*.
**Until it is Accepted, no record is struck:** the records it would overtake carry dated forward pointers only.

**Evidence tiers.** *[doc]* quoted from a file in this repository; *[plan]* a figure or a source reference the M8C plan
quotes (the architect read the tree at `4f85b970`; the scribe did not re-read the source unless it says so);
*[relayed]* the coordinator's relay of the owner's answer; *[owner-doc]* the owner's words as recorded in
`docs/OWNER_FIXES.md`; *[inf]* inference, with what would falsify it. **The scribe ran nothing and has no shell.** Every
count below is copied from the plan, and the census script is not in the tree.

## Context

**The report.** The owner, in `docs/OWNER_FIXES.md` (Fix 1): *"the generator adds a cabinet on all levels … wherever one
fits … Let it be added, and if user will want, will remove"*, for the line and the L; the U keeps its back-wall exception
[plan §1, quoting the owner-doc].

**The two rulings recorded in `OWNER_FIXES.md`, 2026-10-17 [owner-doc, lines 78–80]:**
- **Q-F1-1:** where no cabinet is narrow enough for a remainder, **keep the space empty**. No filler or end panel.
- **Q-F1-2:** the fill applies to **wall runs only**, not next to windows and doors.

**Q-2, where the fill stands [relayed, 2026-10-17], the owner's two sentences as the plan quotes them (§2.7):**

> *"between, only exception on very long walls, there is already a special rule check it"*

> *"in U shape if one wall is more than 4 meters (4000 mm) the wall with fridge should put the fridge 3 full cabinets
> from the middle wall, and same way the oven tower or the hob, 2-3 cabinets from middle wall."*

The coordinator relayed the answer as **(b), "between"**, with the long-wall exception. These are relayed words, not a
transcript.

**Q-7 [relayed selection, 2026-10-17]: the default, (a).** On a long U side wall whose fridge or far-wall tower is
counted from the corner and has tall pantries outboard of it, the fill stands between the counted body and the
pantries, and the pantries move to the wall's end. Where nothing stands beyond the counted body, the fill takes the
wall's end. (Selection of an option the architect wrote; not a quotation.)

**Q-8 [relayed, 2026-10-17], the answer to the hob part of the second sentence: no new rule.** The owner's words, as the
plan quotes them (§2.7):

> *"let's not introduce this change with cabinets 2-3 between hob and fridge, let it be like it is now, I will create
> presets and you will learn from those presets; this is the best approach, for now let's continue without this
> change."*

**So no hob-counting rule is built by this record, and no wave F2 exists.** The hob stays with ADR 0110 *N3 revised* 5's
back-wall packing. The owner's intent to derive placement rules from his own presets is a follow-up with a trigger and
no build (see *Follow-up*).

**Measurement [plan §2.1, the architect at `4f85b970`; the script is not in the tree; the fake probe reports declared
sizes, so seats are not measured].** A scratch Vitest file called `generateKitchen` over the grids below and derived the
delivered design's openings by the editor's own uncapped funnel. Free openings of 200 mm or more at base, wall and top:

| Grid (height) | Rooms | Refused | Rooms with a free opening at base, wall and top |
| --- | --- | --- | --- |
| Straight, wall A 1200–6000 every 10 mm (2600) | 481 | 0 | 205 at each level |
| L, A 900–6000 × B 1000–6000 every 50 mm (2600) | 10 403 | 432 | 7 398 at each level |
| U, A 2700–6000 every 100 mm × B, C 1000–6000 every 500 mm (2600) | 4 114 | 120 | 3 179 at each level |

Further rows (heights 2599, 2500 and 3000) are in plan §2.1. Over 14 998 rooms of the straight, L and U grids at 2600
(552 refused), **every free base-level opening ended exactly at its wall's free-run end, and none stood anywhere
else** [plan §2.1]. The wall and top rows above a free base are free too, because nothing stands below them. The only
rule that leaves a fillable gap is ADR 0110 A4's leftover rule; the upper and top rules leave nothing over a placed
base except on a large U's back wall [plan §2.1, *Conclusion*, tier measured + src]. Widths of the free base openings
(L at 50 mm, 2600): under 200, 3 688; 200–299, 2 858; 300–599, 6 916 [plan §2.1].

**The precedent already in the tree [plan, doc + src].** A U's back wall already fills a 300–599 mm remainder with one
`base-cabinet` of exactly that width at its high end (ADR 0110 N11.9; `u-composition.ts`, `withTheBackWallFill`). The
owner chose **"Back wall only"** (RQ25a) and **"Fill from 300 mm"** (RQ25b) on 2026-09-29. Both were scoped to the back
wall alone; the 2026-10-17 rulings are later and wider.

## Decisions

All are **proposed**; D5's placement (b) and Q-7 (a) are the owner's rulings, the rest is the architect's.

1. **D1 — What is filled.** After composition is planned, each wall's free-run remainder `r` is filled with **one
   `base-cabinet` built to exactly `r`**, provided `r ≥ F`: the L's A and B, the straight kitchen's A, the U's A, B and C.
   The wall row and the top row follow from the existing rules (ADR 0110 Amendment C / F2 and Amendment O9); nothing is
   filled where those rules place nothing (a large U's wall A at the wall and top rows; the top row below 2600 mm).
2. **D2 — The floor `F` is read from the catalogue, never written as a number.** It is the largest `minWidthMm` of the
   bodies the filled column carries, `base-cabinet` and `wall-cabinet`: both `HINGED_CABINET_MIN_WIDTH_MM` = 200
   (`catalog.ts:109`, confirmed by the scribe's grep; the other two lines the plan cites, `:460-461` and `:583-584`, were
   not re-read). It is threaded as `declaredColumnSizes` is (ADR 0102). **Where `r < F` the end stays bare, with no
   filler and no end panel** (Q-F1-1).
3. **D3 — The fill's width is `r` itself in whole millimetres**, not rounded down to 50. `base-cabinet` has a continuous
   200–800 bound; its 50 mm steps are the customer's stepper only (ADR 0035 d2, d8). *Rejected:* flooring to 50 as O10 does.
4. **D4 — Order: the absorbs first, then the fill.** E6 (tower) and O10 (fridge) run where they apply and are unchanged.
   Rooms where an absorb takes the whole remainder are byte-identical to HEAD.
5. **D5 — Where the fill stands: between the run and its end group, which moves to the wall's end** (Q-2 = (b), above).
   - The end group `G` is the contiguous group of **full-height bodies** that ends the planned run, by E7's predicate (a
     declared top above 1500 mm): the fridge, `tall-oven-tower`, `tall-pantry`. **`G` never contains a body whose place
     is counted from the corner** (ADR 0110 *N3 revised* 3 and 10, a U side wall over 3000 mm).
   - If `G` is not empty, the fill takes `[g, g + r]` and `G` moves outward by `r` to end at the run's end. That is O10's
     mechanism (`withTheFridgeMovedOut`) widened from one fridge to the group. If `G` is empty, the fill takes
     `[runEnd − r, runEnd]`.
   - On a long U fridge wall the counted fridge stays and the pantries outboard of it form `G` (Q-7 = (a)); likewise a
     counted far-wall tower.
   - **Recorded, not smoothed:** the fridge moves outward by `r` in every room where it ends the run and the fill
     stands, departing from E8 as O10 already does; the oven tower stands `r` further from the hob (E12.1); removing the
     fill no longer restores today's kitchen; the 100 mm slide reserve is never spent (D9).
6. **D6 — Composition must not join the fill's tile to a neighbouring planned tile.** Composition merges member-less
   columns whose total is at most 800 (ADR 0166 d4). A merged opening sends a `'fit'` body to the wrong width and makes
   generation throw. [plan, src for each mechanism; inf that each arm is reachable.] **The hazard is one millimetre wide:
   a remainder of exactly 200 mm, in two arms** (a non-door `'fit'` body inboard of the fridge; RQ17's lone U tower).
   - **M-1, recommended:** composition's merge declines to join two **planned** tiles; the shell hands it the boundaries
     it tiled, as a value beside the width limit (ADR 0166 d4's own form). The editor passes none. It is
     behaviour-free at HEAD **only if** F1a S0 counts zero planned-pair merges at HEAD [inf; falsified by a non-zero
     count]. It amends ADR 0166 d4, and ADR 0166 d6's four restated guards must be checked to agree.
   - **M-2, fallback, if S0 does not count 0:** in the two arms, at `F` = 200, the inboard `'fit'` body is planned 200
     wider (to 800), as E6 plans the module inboard of a tower. No separate fill stands there. That changes what is built
     in those rooms.
   - One pass for every fill, N11.9's included: U rooms N11.9 fills today keep their placements by geometry; their
     command order and placement ids may change.
7. **D7 — The U back wall keeps its exception, read as `isBackWallBaseOnly`.** On a large U (entered walls ≥ 10 000 mm)
   wall A's **base** row is filled (as N11.9 already does, from `F` now), and its wall and top rows stay empty except the
   hood and its top. On a U under 10 m wall A is filled at every level. N11.9's step id `wall-a-remainder:A` is kept.
8. **D8 — Wall runs only (Q-F1-2).** The room model has no windows or doors [plan, src: `DesignRoomFieldsSchema`,
   `design.ts:119-133`, not re-read], so the ruling has no code effect today. **Binding on a later wave:** whatever wave
   adds openings must exclude their segments from the fill.
9. **D9 — The slide reserve is never spent.** Walls B of an L and B and C of a U end 100 mm short of the wall (ADR 0110
   Amendment C / F7; ADR 0109 C and D). The fill ends at the **run's** end, never the wall's.

**The long-wall exception, as built [inf, from the owner's words and the code].** *"Very long walls"* is read as every
wall where N3r 3 or 10 counts the body from the corner: a U side wall over 3000 mm (`n` is 2 at 3001–4000 mm, 3 above).
The owner said *"more than 4 meters"*; the counted rule already starts at 3001. The L has no such rule, so (b) applies on
every L wall and every straight kitchen. **Falsified if** the owner says the exception should start at 4000 mm or apply
to the L.

**Readings this record builds that were not asked, each the architect's [inf], none an owner ruling** (plan §10):
- the floor of **200 mm** replaces RQ25b's *"Fill from 300 mm"* (the owner's Q-F1-1 says *"narrow enough"*; 200 is the
  catalogue's narrowest cabinet). Falsified if the owner says 300 stands;
- *"the middle (back) wall"* is read as the code's `isBackWallBaseOnly`, which is a U whose entered walls total 10 m or
  more, not every U. Falsified if the owner meant every U;
- the carousel's no-wrap-around (ADR 0003 4b amendment, not this record).

## Alternatives considered

- **Keep A4** (599 mm stays bare): the owner asked otherwise.
- **Fill only at 600 mm**: leaves the reported gaps.
- **Flooring the fill to 50 mm**: leaves up to 49 mm bare for no reason the owner gave (D3).
- **Growing the neighbour** (O10's mechanism beyond 300 mm): against Q-F1-1's *"a cabinet"*.
- **A filler panel**: refused (Q-F1-1).
- **Placement (a), at the run's end beyond the end group**: the owner chose (b) (Q-2).
- **D6's M-2, or reordering the inserts, in place of M-1.**
- **A post-composition insert outside the plan**: the upper loop would not see the fill and a second upper rule would be
  needed.
- **A hob-counting rule** (the hob 2–3 cabinets from the corner): refused by the owner (Q-8). It would also conflict with
  N3r 5's back-wall packing.

## Consequences

- **The price rises** by one `cabinet.base-cabinet`, one `cabinet.wall-cabinet` and, at 2600 mm and above, a second
  `cabinet.wall-cabinet`, each with its hardware line, for every filled wall. The owner asked for the cabinets. Prices
  are still placeholders. [plan §2.4]
- **Step 1's 1F list is unchanged**; the base fill counts under the existing *Depozitare* row, and the roles `upper` and
  `top` have no row [plan, src: `generation-model.ts:6`, `:148-157`, not re-read]. No new copy.
- **Above a full-height body nothing changes** (E7, O9), nor in a room too low for a top row. These stay the most
  numerous top-level gaps; L grid at 2600: 8 816 slots above fridges, 6 426 above towers, 8 750 above pantries
  [plan §2.1, measured]. Reported to the owner as information.
- **The run-end panel is vetoed where the fill reaches the wall** (ADR 0045 Amendment A).
- **Presets inherit the rule** through ADR 0109 Amendment E (every free end, at every level; Q-3 = every free end,
  relayed).
- **Test churn:** every assertion that encoded a bare end, a body count or a price the fill changes is updated, never
  deleted, with its reason in an ADR 0152 table ([ADR 0168](0168-the-owners-no-new-tests-is-option-c-for-m8c-the-existing-suites-are-updated-and-four-places-keep-a-committed-test.md)).
- **Stored designs** are never re-generated.
- **Dated notes, written now as forward pointers only** (the records are not struck while this one is Proposed): ADR 0110
  (A4, D2, E8, E12.1, H1, N11.9, and the sweep of N3 revised 3); ADR 0166 d4; ADR 0067 d2; ADR 0117 (d1, d4, d6,
  *Consequences*); ADR 0109 Amendment E; ADR 0120 (lines 78, 114, 438); ADR 0130 (line 31); a `SUPERSESSIONS.md` row.
  Wave F1b's close converts them when this record is Accepted.
- **Acceptance** is the plan's §6: F-1 to F-10 and DEVELOPMENT-SPEC §11 rows 28–31 [plan §6 lists 28–31; the F1b close
  line in §5 says 28–30; this record follows §6].

## Amendment A — F1b outcomes, 2026-10-17 (appended; nothing above is changed)

**Status note.** The record stays **Proposed**. The plan makes Accepted follow wave F1b's close, and that close is the
coordinator's call; it has not been made here. Code has since landed (`8023c880` domain, `b43a8e18` F1a, `e3818726`
web and adapter), so "Nothing in this record is built" in the status line above is no longer true; it is left as written
and corrected by this note.

1. **Owner ruling, 2026-10-17 [relayed, the owner's reply to the coordinator's question]:** *"yes, keep the lone fill
   and continue"*. A wall the composer left with no planned body still gets the fill: one base cabinet of the whole free
   run, with its wall and top cabinets by the usual rules. Evidence [logic review, executed]: L 1100x2200x2600 wall A
   (200 mm); U 3000x1500x1500x2600 walls B and C (500 mm); 316 of 2544 rooms on the L 100 mm grid and 682 of 3994 on the
   U 2600 grid.
2. **Consequence [F1b S2a report and logic review F4, reported].** A 200 mm top cabinet or 200 mm wall cabinet over a
   fill offers no alternatives in the replace list: wall-lift and open-shelf start at the 300 default floor, and
   `offersFor` returns the wall cabinet alone. `qa-c3s1-top-row`'s swap assertion is now conditional on the catalogue
   offering an alternative at that width.
3. **Consequence [inference].** Step 1F's *Depozitare* row reads *placed* in more rooms, because the fill is a
   storage-role step (plan §2.4). A comment in `apps/web/src/room/generation-model.ts` about a 900x2200 room reading
   "nu poate fi inclus" may be stale; **unverified**, backlog 260.
4. **Backlog recorded the same day:** 256 (mobile camera framing crops long-wall run ends), 257 (the form refuses a 6100
   wall), 258 (O10 and the fill untested together), 259 (e2e support comments).

## Amendment B — M8C outcomes from F1b to P9, 2026-10-18 (appended; nothing above is changed)

**Status note, 2026-10-18.** The record **stays Proposed**. The plan (§5, F1b *Close*) lists "ADR 0167 accepted" among
F1b's close items, but the plan's own banner and Amendment A above both say F1b's close and this record's acceptance are
**the coordinator's or owner's call**, and no record read by the scribe makes that call. Acceptance is therefore left
open here and in `STATUS.md`; whoever accepts it changes the status line and cites this note.

**Evidence tiers.** *[relayed]* the coordinator's brief to the scribe, 2026-10-18 (owner rulings and engineer figures as
relayed); *[src]* source-verified by an agent, relayed, not re-read by the scribe; *[inf]* inference. **The scribe ran
nothing.**

Outcomes after Amendment A, each as relayed:

1. **Lone fill: ruled** (Amendment A item 1, 2026-10-17). Restated for completeness.
2. **The end-group move is not applied to presets** [relayed, owner ruling 2026-10-17]. Tall blocks stay where the
   preset's author put them; D5's move of the end group concerns generation only.
3. **The row-end pass is removed** [relayed, owner: removals stay]. A column the owner removed in a preset is not
   refilled by a separate row-end pass.
4. **Taller-room tops** are added only if the preset's own columns carry tops [relayed].
5. **U presets that cross the 10 m back-wall line are not offered** [relayed]. An accepted cost, not a defect.
6. **Listing bound.** The 128 KiB bound on a preset's listing payload is enforced at save [relayed].
7. **Read limiter.** Preset reads have their own limiter, 1,200 an hour, a **provisional engineer figure** the owner can
   change [relayed]. A failed read answers **503** [relayed].
8. **Global cap.** 50 saves a day across all callers, **provisional** [relayed].
   *Correction, 2026-10-18: the figure of 50 above is superseded by 100 a day, the owner's decision [relayed]; still
   provisional. The constant is `PRESET_CREATIONS_PER_DAY_FIGURE`.*
9. **Image CSP.** The image path's CSP is enforced by the proxy for the exact path. **Source-verified on self-hosted
   Next 16.3.8; Vercel is unverified.** First-deploy check: `curl -sI` on a preset image URL [relayed, src].
10. **Generated name.** Rendered per locale from the stored facts, never stored (already in ADR 0112 Amendment A); the
    exact format awaits the owner's approval [relayed].
11. **P8 Select** copies the preset through the **existing mint path**, with **one attempt per preset id**. This departs
    from the wording of ADR 0139 decision 5 (one attempt per composition); **the owner is to confirm** [relayed].
    See the dated note on ADR 0139.

## Follow-up (recorded with its trigger, not built; ADR 0118's form)

**Learning placement rules from the owner's presets** [relayed, Q-8]. Consistent with ADR 0117 d3: taste enters through
presets, and a judgement call does not become a generator rule on its own. **Trigger:** the owner's library holds enough
presets of one shape to compare against what generation produces for the same rooms. **Then:** an architect's
measurement of where the owner's presets place the hob, the fridge and the tower against generation's output for the
same rooms; each candidate rule goes to the owner as a question and becomes a dated ADR only on his ruling. Nothing is
built for this in M8C and nothing here is a rule.

## Decision-record sweep

The plan's §2.5 table is the sweep. In summary: ADR 0110 A4, D2, N3r 3 (its bare remainder), N11.1, N11.9 / RQ25a / RQ25b
superseded for generation on acceptance; E8 and E12.1 departed from (D5); N3r 3, 4, 10 unchanged (counted bodies never
move); C / F2, E6, O10, D-revised 4, E7, O9, O4, N3r 11, C / F7 unchanged; ADR 0109 Amendment A and A3.2 inherit this
record (Amendment E); ADR 0067 d2 narrowed for generated kitchens (a remainder `≥ F` is filled by owner ruling; under
`F` it is still normal; *no filler* holds); ADR 0117 d1, d4 narrowed by an owner ruling under d7; ADR 0166 d4 amended by
M-1; ADR 0035 d2, d8, ADR 0033 and RQ26 followed.
