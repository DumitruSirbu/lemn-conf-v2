# M8C — Generation fills every free wall-run end, and the owner can save, list and use presets

> **STATUS: PLANNED, 2026-10-17; revised the same day on the owner's answers (§10, *Answered*). Nothing is built.**
> This is the plan (`docs/WORKFLOW.md`, step 1) for the two owner fixes in `docs/OWNER_FIXES.md` (Fix 1 and Fix 2).
> **Fix 3 (accounts, roles, dashboard) is not planned here**; it stays M8B's. Branch:
> `fix/empty-space-fill-and-preset-save`, cut from `main` at `4f85b970`.
>
> **Progress, 2026-10-17 [doc: git log; reports relayed].** F0, F1a and F1b S1/S2 are committed (`8023c880` domain,
> `b43a8e18` F1a, `e3818726` web and adapter). The logic review and the visual check are done, with the findings in
> ADR 0167 Amendment A and backlog 256 to 260. Remaining F1b obligations: run the e2e suite once before any push. **The e2e suite has not been run
> for F1b; no claim is made.** F1b's close and ADR 0167's acceptance are the coordinator's call.
>
> **Answered [relayed by the coordinator, 2026-10-17]:**
> - Q-1 = **C**.
> - Q-2 = **(b)**: *"between"*, with the long-wall exception (§2.7).
> - Q-3 = **refill every free end**.
> - Q-4 = **author on production**.
> - Q-5 = **the back wall's right end is its free end**.
> - Q-6 = **changed**: a Preview pop-up with a carousel, and no *Folosește* on the card (§3.6).
> - Q-7 = **the default, (a)**: the fill stands between a counted fridge or tower and its pantries, and the pantries
>   move to the wall's end.
> - Q-8 = **no new rule**: the hob stays as it is, and placement rules are to be learned later from the owner's
>   presets (§11a).
>
> **No owner question remains open.** The first dispatch is F0 (§5, *Order and first dispatch*).
>
> **Evidence tiers.** **[owner]** the owner's words, as recorded in `OWNER_FIXES.md` or relayed by the coordinator. **[src]** read in the tree at
> `4f85b970` by the architect. **[measured]** run by the architect at `4f85b970`, with the command in §2.1.
> **[doc]** quoted from a record. **[inf]** inference, with what would falsify it.

## 0. Numbering, and where M8C sits

- **M9 is taken** (delivery preparation, a stub), so this cannot be "M9" as `OWNER_FIXES.md` suggested.
- The repository's suffix convention puts owner-feedback rounds after their milestone: `M5B`, `M7B`, and
  `M7C-m7-feedback-fixes.md`. That file exists, but the README table does not list it (noted for the scribe, §12).
  `M8B` is customer profiles. **The next free number is M8C.**
- **Order, by the owner's ruling** [owner]: *"fixes first, then the preset milestone, then login / register /
  dashboard."* So M8C runs before M8B, although its letter is later. `milestones/README.md` should say so in its
  M8C row (§12).
- **M8 is not done** (`STATUS.md`, *What to do next*, 2026-10-17). M8C does not close M8's open items: the test audit
  (backlog 249), the `findSentReference` live run, 8T, and `pnpm ci:local` before a push. Those stay M8's.

## 1. The two requests, classified

| Fix | What the owner asked [owner] | Class | Why that class |
| --- | --- | --- | --- |
| 1 | *"the generator adds a cabinet on all levels … wherever one fits … Let it be added, and if user will want, will remove"*; line and L; the U keeps its back-wall exception | **Contract change**, not an implementation defect | The bare ends are the recorded rule working as written: ADR 0110 A4 (*"at most 599 mm … stays"*), ADR 0109 Amendment A (the owner's own Q2: *"maximum 599 … let the edges empty"*), ADR 0067 d2, ADR 0117. A new dated ADR must supersede them for generation (§2.6). |
| 2 | *"I need the button to save the preset, and after that, when I generate again, I should be able to see and select from the preset"* | **A deferred feature, revived** | ADR 0112 and 0109 decided it; ADR 0131 deferred it past M8 and set its revival trigger, *"the owner's direction to start the preset work"*. This is that direction. Two of the owner's rulings depart from ADR 0112 and need a dated amendment (§3.1). |

Neither is a test-fidelity problem.

---

## 2. Fix 1 — the free run end is filled at every level

### 2.1 Reproduction: what generation leaves bare today [measured]

**Method.** A scratch Vitest file outside the repository called `generateKitchen` with the domain's fake probe
(`tests/support/fake-probe.ts`) for each room on the grids below. It then derived the delivered design's openings by
the editor's own uncapped funnel (`derivePlacementRecords` → `deriveColumns` with no limit → `recomputeVoids`).
Each opening was classified by its level (`y0` 0, 1500 or 2200, or another floor) and by what stands under its span.
The run was:

```
node_modules/.bin/vitest run --root <scratch> --config <scratch>/vitest.config.mts
```

It was run from `packages/configurator-domain` at `4f85b970`: 38.4 s for the census, 31.4 s for each detail pass.
**The script is not in the tree.** F1a S0 re-creates it (§5, F1a). Under Q-1 = C it stays a quoted scratch
measurement; criterion F-1's committed property is separate. **The fake probe
reports declared sizes**, so seats are not measured here. Widths and positions are the domain's own.

| Grid (height) | Rooms | Refused (minimum not met) | Rooms with a **free** opening ≥ 200 mm at base, wall and top |
| --- | --- | --- | --- |
| Straight, wall A 1200–6000 every 10 mm (2600) | 481 | 0 | 205 at each level |
| Straight, the same lengths (2599) | 481 | 0 | 205 at base and wall level. The top row is too low to be filled: 2599 − 2200 = 399 < 400. |
| L, A 900–6000 × B 1000–6000 every 50 mm (2600) | 10 403 | 432 | 7 398 at each level |
| L, the same walls every 100 mm (2500) | 2 652 | 108 | 1 805 at base and wall level. There is no top opening at all, since 300 mm is not more than `MIN_SPAN` (ADR 0015). |
| L, the same walls every 100 mm (3000) | 2 652 | 108 | 1 805 at each level |
| U, A 2700–6000 every 100 mm × B, C 1000–6000 every 500 mm (2600) | 4 114 | 120 | 3 179 at each level |

**Widths of the free base openings** (one per wall where present, L at 50 mm, 2600):

| Width | Count | What the new rule does |
| --- | --- | --- |
| under 200 | 3 688 | Stays bare (Q-F1-1). |
| 200–299 | 2 858 | Filled: the floor is the catalogue's 200 (§2.5, RQ25b superseded). |
| 300–599 | 6 916 | Filled. |

Straight kitchens: 161 under 200, 125 at 200–299, 80 at 300–599.

**Where each one is, and what leaves it** [measured, detail pass over 14 998 rooms: the straight, L and U grids
above, at 2600; 552 refused]:

| Cause | Measured | Source of the rule |
| --- | --- | --- |
| **(a) The run-end remainder.** Every free base-level opening on every wall of every shape **ends exactly at its wall's free-run end**. No free base opening stands anywhere else: 0 found away from the run end. The wall row and the top row above it are free too, because nothing stands below them. | All of the free base openings | `leftover-rule.ts:4-24`: `planLeftover` fills with whole 600 mm modules and leaves the rest. `MAX_GENERATED_LEFTOVER_MM = 599` (ADR 0110 A4). `generate-kitchen.ts:460-493`: an upper is attempted only above a *planned* base (`isAnUpperOwedOver`, `upper-policy.ts:60-66`). `generate-kitchen.ts:656-694`: one top cabinet over each *placed upper* (Amendment O9). So no base means no upper, and no upper means no top. |
| (a′) **The edge the owner noticed.** The remainder lies beyond the run's **outermost body**. In the L grid that body was the fridge for 1 716 + 1 740 of the 300–599 openings, a tall column (tower or pantry) for 2 136 of them, and otherwise a base. | as stated | Prefix wall: storage stands nearest the corner, so the fridge ends the run (`generation-priorities.ts:215-235`). Suffix wall: the tall block stands at the free end (E2, I2; `tall-end-rule.ts`). E6 absorbs a remainder of 200 mm or less beside the tower (`tall-end-rule.ts:143-163`). O10 absorbs 50–299 beside the fridge, but only where a door cabinet stands inboard (`fridge-end-leftover.ts:57-76`). **What those two absorbs do not take is the gap at the edge.** |
| (b) Over a **full-height body** | L 2600: 8 816 slots of 700 mm above `fridge-free` (from y 1850). Top slots above `tall-oven-tower`: 6 426. Above `tall-pantry`: 8 750. | E7 (`upper-policy.ts:78-89`, a declared top above 1500 mm means no upper). O9 (no top over a column). **Unchanged by this plan**, per the brief (*"full-height bodies … unchanged"*); see §2.2, *Readings built*. |
| (c) A wall-only strip with no floor below | **0** in every grid | — |
| (d) An upper or top that was refused over a placed base | **0** on L, straight and U under 10 m | — |
| (e) A room below 2600 mm | The top row is absent or unfillable, as the grid rows above show | `hasRoomForATopRow` (`upper-policy.ts:46-48`). Unchanged. |
| (f) A **large U's back wall** (entered walls totalling at least 10 000 mm) | The wall and top rows over every wall-A base, and the 800 + 100 strips above both corners | `isBackWallBaseOnly` (`run-layout.ts:147-149`), N3 revised 11, O4, ADR 0166 d6 (Q-8U-2). Unchanged. |

**Conclusion [measured + src].** The owner's top-row gaps are cause (a) chained upward, plus (b). The 600 mm
leftover rule (A4) is the only rule that leaves a fillable gap. The upper and top rules then leave nothing over a
placed base, except on a large U's back wall. **So the fix is one rule at the base row.** The existing upper and top
rules fill the column above it, with no change to `upper-policy.ts`'s logic.

**A precedent already in the tree [src + doc].** A U's back wall already fills its remainder of 300–599 mm with one
`base-cabinet` of exactly that width, at its high end: `withTheBackWallFill`, `u-composition.ts:128-160`. That is
ADR 0110 N11.9. The owner chose **"Back wall only"** (RQ25a) and **"Fill from 300 mm"** (RQ25b) on 2026-09-29.
**The 2026-10-17 rulings supersede both**: every wall (*"all levels … line and L"*), and from the catalogue floor
(Q-F1-1: *"where no cabinet is narrow enough for a remainder, keep the space empty"*). The later dated ruling wins.
RQ25b's *"Fill from 300 mm"* was scoped to the back wall alone. ADR 0167 records the supersession by name (§2.5), so
it is not silent.

### 2.2 The rule (the decisions D1–D9)

- **D1. What is filled.** After composition is planned, each wall's free-run remainder `r` (`plan.remainderMm`) is
  filled with **one `base-cabinet` built to exactly `r`**, provided `r ≥ F`. That covers the L's A and B, the
  straight kitchen's A, and the U's A, B and C.
  - The wall row and the top row over it follow from the **existing** rules: Amendment C / F2 places a
    `wall-cabinet` of the same span, and O9 places the 400 mm top cabinet over it in a room with
    `hasRoomForATopRow`.
  - Nothing is filled where the current rules place nothing: wall A of a large U at the wall and top rows
    (`isOverABaseOnlyBackWall`), and the top row below 2600.
- **D2. The floor `F` is read from the catalogue, never written as a number.** `F` is the largest `minWidthMm` of the
  bodies the filled column carries: `base-cabinet` and `wall-cabinet`. Both are `HINGED_CABINET_MIN_WIDTH_MM` = 200
  (`catalog.ts:109`, `:460-461`, `:583-584`) [src]. It is threaded in the way `declaredColumnSizes` threads the
  tower's sizes (`generate-kitchen.ts:271-278`; ADR 0102: no second authority). **Where `r < F`, the end stays
  bare**, with no filler and no end panel (Q-F1-1) [owner].
- **D3. The fill's width is `r` itself, in whole millimetres, not rounded down to 50.** `base-cabinet` has a
  continuous 200–800 bound. Its 50 mm sizes are the customer's stepper only (ADR 0035 d2, d8; restated in N11.9)
  [doc]. Generation already builds such widths: E6's `600 + r`, and N11.9's exact `r`. *Rejected:* flooring to 50,
  as O10 does. That leaves up to 49 mm bare for no reason the owner gave, and O10's 50 mm steps are the owner's words
  for that one absorb only.
- **D4. Order: the absorbs first, then the fill.** E6 (the tower) and O10 (the fridge) run where they apply today and
  are unchanged. The fill reads only what they leave. **Rooms where an absorb takes the whole remainder are
  byte-identical to HEAD.**
- **D5. Where the fill stands: between the run and its end group, which moves to the wall's end.** This is the
  owner's Q-2 answer, (b), with the long-wall exception. [owner, relayed: *"between, only exception on very long
  walls, there is already a special rule check it"*.]
  - **The end group.** Let `G` be the contiguous group of **full-height bodies** that ends the planned run. A body
    is full-height by E7's own predicate: a declared top above 1500, so the fridge, `tall-oven-tower` and
    `tall-pantry`. **`G` never contains a body whose place is counted from the corner** (the long-wall exception,
    §2.7): the fridge of N3r 3, or the far-wall tower of N3r 10, at an `n` of 2 or 3.
  - **If `G` is not empty, with planned start `g`:** the fill takes `[g, g + r]`, and `G` moves outward by `r` to end
    at the run's end. That is O10's mechanism (`withTheFridgeMovedOut`, `fridge-end-leftover.ts:78-97`), widened
    from one fridge to the group.
  - **If `G` is empty,** because the run ends with a base or with a counted body, the fill takes
    `[runEnd − r, runEnd]`.
  - **What this reads, per wall [src, and the §2.1 detail pass for the populations]:**
    - On an **L's prefix wall**, whose run ends with the fridge, the order read from the free end becomes fridge,
      fill, then the run. That is H1's *"fridge → [door, if space] → sink"*.
    - On an **L's suffix wall**, or a **straight kitchen**, ending in the tall block, it becomes the run, the fill,
      then the block. That is H1's *"doors to fill → tall cabinets at the edge"*. A straight kitchen's fridge stands at
      the run's start, not its end [src: one wall carries the whole reading order].
    - On a **U side wall of 3000 mm or less**, the fridge and the tower stand at the free end, uncounted (N3r 3, 10),
      so they move.
    - On a **long U fridge wall** the counted fridge stays where it is, and the pantries outboard of it form `G`.
      The same holds for a counted far-wall tower with pantries outboard of it. The fill stands between the counted
      body and the pantries (Q-7 = (a), owner, 2026-10-17).
    - On a **U back wall, or a run that ends with a base,** the fill takes the run's end. That is N11.9's own place.
  - **Consequences, recorded rather than smoothed.**
    - The fridge moves outward by `r` in every room where it ends the run and the fill stands. That departs from E8
      (*"the generated fridge … is not moved"*), as O10 already does for its own window.
    - The oven tower stands `r` further from the hob, which E12.1 wants *"as near … as the block allows"*.
    - Removing the fill no longer restores today's kitchen. It leaves a free space between the run and the group.
    - The 100 mm slide reserve is still never spent (D9): `G` moves to the **run's** end.
- **D6. Composition must not join the fill's tile to a neighbouring planned tile.** Composition merges member-less
  columns whose total is at most 800 (ADR 0166 d4, `COMPOSITION_WIDTH_LIMIT_MM`). A merged opening sends a `'fit'`
  body to the wrong width, which makes generation throw (`generate-kitchen.ts:573-589`), or loses a body's planned
  start (`plannedVoid`, `:793-817`).
  - **Re-assessed per arm under (b)** [src for each mechanism; [inf] that each arm is reachable, which S0 measures]:

    | Arm | Its tiles | Merges when | Safe by an existing rule? |
    | --- | --- | --- | --- |
    | Fill and the fridge | `F` + 700 | never (≥ 900) | — |
    | Fill and a tower or pantry outboard | `F` + 600 | only at `F` = 200 | **Yes where E6 or the pantry-gap rule absorbs `r` ≤ 200** (`tall-end-rule.ts:143-163`; `u-tall-layout.ts:121-145`), so `F` ≥ 201. **No for RQ17's lone U tower**, which stands with its remainder bare (N3r 10), so `F` = 200 can meet it |
    | A `'fit'` 600 body inboard, then the fill | 600 + `F` | only at `F` = 200 | **Yes for a door cabinet inboard of the fridge** (O10 takes 50–299). **No for the sink, `base-3drawer` or `base-panbank` inboard of the fridge** (O10 does not apply) |
    | A fixed body inboard (hob 600, dishwasher 450, bottle 300), then the fill | `w` + `F` ≤ 800 | — | **Likely** [inf]: a fixed-set body appears to be seated flush left, with the rest split off as its own opening. The support is the §2.1 census: today a bottle at a run's end with 200–500 mm beyond it generates at its planned place. ADR 0166 d2 covers `'fit'` bodies only, and ADR 0110 E6 (written before 0166) says a fixed body in a wider opening is centred, so F1a S0 confirms it on a witness. M-1 covers this arm either way |
    | Fill at the run's end, beyond a `'fit'` 600 base | 600 + `F` | only at `F` = 200 | Yes, if the fill is inserted after D4's free-end step-back (`isFreeEndBody`, `:823-829`) |

  - **So the hazard is one millimetre wide**: a remainder of exactly 200 mm, in two arms. One is a non-door `'fit'`
    body inboard of the fridge. The other is the U's lone free-end tower.
  - **The mechanism, recommended (M-1):** composition's merge declines to join **two planned tiles**. The shell hands
    composition the boundaries it tiled, as a value beside the width limit (ADR 0166 d4's own form: *"the merge takes
    its width limit as a value"*). The editor passes none.
    - **Behaviour-free at HEAD if S0 confirms it.** Today every planned pair sums above 800. The one composition
      merge at HEAD is D4's planned tile and a leftover sliver, and a sliver is not a planned tile [inf: S0 counts
      the planned-pair merges at HEAD, and M-1 is taken only if that count is 0].
    - **It removes the hazard in every arm,** at the run's end as well, so no reordering of the inserts is needed.
    - **Cost:** it amends ADR 0166 d4. ADR 0166 d6 says the editor's fast screen restates four guards; a guard
      changed in one place and not the other is the defect class 0166 names.
  - **Fallback (M-2), if S0 finds M-1 is not behaviour-free:** in the two arms, at `F` = 200, the inboard `'fit'`
    body is planned 200 wider (to 800), as E6 plans the module inboard of a tower. No separate fill stands. That
    changes what is built in those rooms, so ADR 0167 names it.
  - **One pass for every fill, N11.9's included.** So a U room N11.9 fills today keeps its placements by geometry,
    though its command order and its placement ids may change (F-4 says so). *Rejected:* keeping N11.9's fills on
    their own path for byte-identity. That keeps two insert paths for one rule, against ADR 0102's intent.
- **D7. The U back wall keeps its exception, read as `isBackWallBaseOnly`.**
  - On a **large U** (entered walls ≥ 10 000 mm), wall A's **base** row is filled, as N11.9 already does from 300.
    Its wall and top rows stay empty except for the hood and its top.
  - On a **U under 10 m**, wall A is filled at every level.
  - **A note, not a question.** The owner said *"the middle (back) wall"* [owner], which reads like every U. The
    brief names `isBackWallBaseOnly`, the code's own exception, and this plan builds that. The owner is told in §10's
    *Readings built*.
  - **N11.9's own fill is folded into the general pass, so one rule fills the remainder (ADR 0102).** Its step id
    `wall-a-remainder:A` is kept for wall A. U rooms N11.9 already fills from 300 keep the same placements by
    geometry (D6).
- **Readings built, per the brief, not questions.** Above a full-height body nothing changes: the 700 mm slot above
  the fridge from y 1850, and the 400 mm top slot above a tower or pantry (E7, O9). Neither does a room too low for a
  top row. These are the most numerous top-level gaps left after the fix (L grid: 8 816 slots above fridges, 6 426
  above towers, 8 750 above pantries) [measured]. **They are reported to the owner as information in §10.**
- **D8. Wall runs only (Q-F1-2) [owner], and the room model has no windows or doors [src].** `DesignRoomFieldsSchema`
  (`design.ts:119-133`) holds a shape, three lengths, a height and a corner direction. So the ruling has **no code
  effect today**, and nothing is invented for it. The new ADR records it as a binding: whatever wave adds openings
  must exclude their segments from the fill.
- **D9. The slide reserve is never spent.** Wall B of an L and walls B and C of a U end 100 mm short of the wall
  (Amendment C / F7, ADR 0109 C, `lShellFloorRuns` / `uShellFloorRuns`) [doc + src]. The fill ends at the **run's**
  end, never at the wall's, so a later change to 700 mm marks nothing.

### 2.3 Coordinates, scaling and structural dependencies (`product-invariants.md`)

- **Anchor.** Along the wall the fill spans `[g, g + r]` in millimetres when an end group `G` moves (D5), and
  `[runEnd − r, runEnd]` otherwise. `runEnd` comes from the shape's floor-run function and is never recomputed.
  - The fill's base stands at `y0` 0; its upper at `WALL_ROW_Y0_MM` 1500, over the same span; its top cabinet at
    `TOP_ROW_Y0_MM` 2200, over the same span.
  - `G` keeps its own widths and its order. Each of its bodies shifts by exactly `+r` along the wall, and its outer
    face lands on `runEnd`. A counted body (§2.7) never moves.

  The back face is on the wall plane (§11 row 19). The seat is measured by the probe, through `insertBody` alone
  (ADR 0110 d2).
- **Scaling.** Width only, `r`, through the `'fit'` path (`insert-fit.ts:304-328`).
  - Heights are the catalogue's: base 860; upper 700; top cabinet 400 in its 2200–2600 opening (`heightFlex`).
  - Depth follows the cabinet depth (`FOLLOWS_CABINET_DEPTH`).
  - The door count follows the width: one door below 500, two from 500 (ADR 0033, 0035 d4, RQ26).
- **Structural dependencies.**
  - **The fridge's 750 mm slot and a tall column's 400 mm top slot move with their body.** They are derived openings
    above it (DEVELOPMENT-SPEC §3.3, §4), so nothing extra is recorded.
  - The run-end panel follows the run's last body. Where the run reaches the wall, the panel is vetoed (ADR 0045
    Amendment A, *"No panel when run hits wall"*). Where it stops short, the panel stands at the run's outer face and
    never past the wall (ADR 0083 d5, ADR 0065).
  - A top cabinet reads push-to-open by its slot (§13.1, §11 row 13).
  - No floor space is invented under a wall-only column (§11 row 18).
  - No opening appears in the backsplash zone (§11 row 17).

### 2.4 What else changes, and what does not

- **Price rises** by one `cabinet.base-cabinet`, one `cabinet.wall-cabinet` and, at 2600 mm and above, a second
  `cabinet.wall-cabinet`, each with its hardware line, for every filled wall. **The owner asked for the cabinets**, so
  the rise is not a question. QA quotes it on the witness rooms, as O9 did. The prices are still placeholders.
- **Step 1's 1F list.** The base fill is a `storage`-role step and counts under the existing *Depozitare* row. The
  upper and top fills have the roles `upper` and `top`, which have no row (`generation-model.ts:6`, `:148-157`)
  [src]. **No new copy.**
- **Changed by D5:** an uncounted end group (the fridge, the tall block, or the pantries) stands `r` further out.
- **Unchanged:** the reading order (A1, H1), with the fill read as *"door, if space"* or *"doors to fill"*; the cut;
  the tall block's size; every counted position (N3r 3, 10, §2.7); E6; O10; D4; the dishwasher; the bottle; the
  corner pieces; large-U wall A above the base row; the low-ceiling rule. Stored designs too: generation writes new
  designs only, and a stored design is never re-generated.

### 2.5 Decision-record sweep (Fix 1)

| Record | What it says | How it is settled |
| --- | --- | --- |
| ADR 0110 **A4** | At most 599 mm of a run stays bare; a remainder under 600 *"stays"* | **Superseded for generation** by ADR 0167: the bare end is at most `F − 1` |
| ADR 0109 **Amendment A** (the owner's Q2) and **A3.2** | *"maximum 599 … let the edges empty"*; adaptation refills with *"the leftover rule, shared with generation"* | Q2's *"let the edges empty"* is **superseded by the owner, 2026-10-17**. A3.2 inherits ADR 0167 at every free end and every level (Q-3, answered) |
| ADR 0110 **N11.9 / RQ25a / RQ25b** | Fill on the U back wall only, from 300 | **Overturned** by the owner, 2026-10-17: every wall, from `F` (Q-F1-1's *"narrower stays empty"*: the later dated ruling wins; RQ25b was scoped to the back wall alone) |
| ADR 0110 **D2** (*"let the edges empty"*), *N3 revised* 3's *"any bare remainder beyond it"*, N11.1 | Edges and side-wall remainders stay bare | **Superseded** with A4. N3r 3's counted positions stand (§2.7) |
| ADR 0110 **N3 revised 3, 4, 10** (counted from the corner; pantries to the free end; RQ17's lone tower) | The fridge is `n` bases from the corner, the far wall's tower likewise | **Unchanged: the long-wall exception** the owner pointed to (§2.7). A counted body is never moved by the fill |
| ADR 0110 **E8** (*"the generated fridge … is not moved"*) | The fridge's place is fixed | **Departed from** where an uncounted fridge ends its run and a fill stands (D5), as O10 already does. Dated note |
| ADR 0110 **E12.1** (the oven tower as near the hob as the block allows) | The tower is innermost in its block | **Unchanged within the block.** The block stands `r` further from the hob (D5). Dated note |
| ADR 0110 **C / F2** | An upper over every base, a hood over the hob, none over a column | **Unchanged**; reaches the fill |
| ADR 0110 **E2, I2, H1** (*"tall cabinets at the edge"*), **A1** | The block and the fridge end their runs | **Kept by D5**: they still end the run, and the fill is H1's *"door, if space"* or *"doors to fill"* |
| ADR 0110 **E6, O10, D-revised 4** | The absorbs, and the free-end resize | **Unchanged; they precede the fill** (D4). O10's move is widened to the end group (D5) |
| ADR 0110 **E7, O9, O4, N3r 11** | No upper over a column; top only over an upper; large-U wall A base-only | **Unchanged**, per the brief (§2.2, *Readings built*) |
| ADR 0110 **C / F7**, ADR 0109 **C / D (F7)** | The 100 mm reserve is kept | **Unchanged** (D9) |
| [ADR 0067](../decisions/0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) d2 | A remainder is *"the product working"*; no filler rule | **Narrowed for generated kitchens**: a remainder `≥ F` is filled by owner ruling; under `F` it is still normal. Its *"no filler"* holds (Q-F1-1) |
| [ADR 0117](../decisions/0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) d1, d4; *Consequences* (*"the generator will keep looking plain"*) | Cheap baseline; a taste rule must not enter the generator from a screenshot | **Narrowed by an owner ruling** under d7 (*"The route to change a refusal is an owner ruling"*). Dated note |
| ADR 0120 lines 78, 114, 438; ADR 0130 line 31 | Cite A4's 599 | Dated notes |
| [ADR 0166](../decisions/0166-adjacent-empty-spaces-merge-whatever-their-total-and-800-mm-caps-the-cabinet-not-the-space.md) d4 | Composition merges at 800, the limit passed as a value | **Amended by M-1** (D6): composition also passes the planned boundaries, and the merge never joins two planned tiles. The editor passes none. Behaviour-free at HEAD, if F1a S0 confirms it |
| ADR 0035 d2, d8; ADR 0033; RQ26 | Continuous width; door count follows width | **Followed** (D3) |

### 2.6 ADR 0167 (outline, for the scribe to write in F0 as *Proposed*)

**Title.** *Generation fills every free wall-run end that the narrowest catalogue cabinet fits, at every level its
column carries, and a narrower end stays bare.*

- **Context:**
  - the owner's words and the two rulings Q-F1-1 and Q-F1-2;
  - §2.1's measurement and its attribution table;
  - the N11.9 precedent.
- **Decisions:** D1–D9, as above.
- **Alternatives:**
  - keep A4;
  - fill only at 600 mm;
  - flooring to 50 mm;
  - growing the neighbour instead (O10's mechanism beyond 300; against Q-F1-1's *"a cabinet"*);
  - a filler panel (refused, Q-F1-1);
  - placement (a), at the run's end beyond the end group (the owner chose (b), Q-2);
  - D6's M-2, or reordering the inserts, in place of M-1;
  - a post-composition insert outside the plan (it would leave the upper loop blind to the fill and need a second
    upper rule).
- **Consequences:**
  - the price rise;
  - 1F unchanged;
  - the run-end panel vetoed where the fill reaches the wall;
  - the test churn (§4);
  - presets inherit the rule through ADR 0109 A3.2 (Q-3, answered: every free end, at every level);
  - the fridge and the tall block move outward (E8, E12.1).
- **Supersedes / amends:** the §2.5 table, as dated notes on 0110 (A4, D2, N3r 3's bare remainder, N11.9, E8,
  E12.1, H1), 0109 (A, A3.2), 0166 (d4, by M-1), 0067 (d2), 0117 (d1, *Consequences*), 0120, 0130, and a
  `SUPERSESSIONS.md` row.

### 2.7 The long-wall rule the owner pointed to, and the new sentence

**The owner, relayed, verbatim:**
- *"between, only exception on very long walls, there is already a special rule check it"*;
- *"in U shape if one wall is more than 4 meters (4000 mm) the wall with fridge should put the fridge 3 full cabinets
  from the middle wall, and same way the oven tower or the hob, 2-3 cabinets from middle wall."*

**The rule that exists: ADR 0110 *N3 revised* 3, 4 and 10, a U only [src + doc].**

| Part | What the code does at `4f85b970` | Where |
| --- | --- | --- |
| The "middle wall" | Wall A, the U's back wall. Counting starts at a side wall's **free-run start**: past the corner's 900 mm reach, and not counting the corner piece | ADR 0110 *N3 revised*, preamble; `uShellFloorRuns` |
| The length that decides | The side wall's **entered** length (`wallLengthMm(wall, room)`), not its free run (which is entered − 1000) | `u-fridge-wall.ts:150`, `u-tall-layout.ts:370` |
| The count `n` | `baseCountFromTheCorner`: **0** at 3000 mm or less; **2** at 3001–4000; **3** above 4000 | `run-layout.ts:151-166` |
| The fridge wall (the wider side wall, B on a tie) | `n` door bases of **600 mm** (`STORAGE_BODY_WIDTH_MM`) from the corner, then the fridge. `n` falls by one until both fit. At `n` = 0 the fridge stands at the free end (*"free-end"*), with door storage between it and the corner | `u-fridge-wall.ts:140-195` (`fridgeWallLayout`, `fridgeCountedFromTheCorner`) |
| Between the fridge and the free end | `tall-pantry` columns at every size (RQ13). The outermost is widened to at most 800 to take a remainder of up to 200. A whole gap of 400–599 takes one pantry; under 400 it stays bare | `u-tall-layout.ts:91-146` (N3r 4) |
| The far wall | The bodies that overflowed round the corner come first and count toward `n` **as bodies, whatever their width**, so `n` is a floor. Then door bases up to `n`, then the **oven tower**, then pantries below 10 m, then a door tail. A far wall of 3000 mm or less takes the tower or block at its free end; a lone tower stands anyway (RQ17) | `u-tall-layout.ts:352-420` (`towerCountedFromTheCorner`), N3r 10 |
| The hob | **No counted position.** It is packed on the back wall from the fridge corner (sink, dishwasher, preparation, hob) and, if the run is full, round the far corner, where it counts toward the tower's `n` | N3r 5; `u-back-wall-pack.ts` |
| The L | **No counted position exists.** The fridge ends the prefix wall and the block the suffix wall, at every length | `generation-priorities.ts:195-256`; ADR 0110 E2, I2 |

**Verdict on the new sentence:**
- **The fridge, "3 full cabinets" over 4000 mm: already built, as N3r 3.** On a fridge wall over 4000 mm, three
  600 mm door bases stand between the corner's reach and the fridge. The owner did not mention 3001–4000 mm, where
  today's count is 2 (N3r 3, the owner's own placement clarification of 2026-09-29). That stays unchanged.
- **The oven tower, "2–3 cabinets": already built, as N3r 10**, on the far wall: 2 at 3001–4000 mm, 3 above.
- **"Or the hob" is the one part that is not built.** Read literally, it is **a new generation rule**: a hob, or a
  hob carrying the oven where no tower stands, placed 2–3 cabinets from the corner.
  - It would conflict with N3r 5's back-wall packing, which puts the hob after the sink, dishwasher and preparation
    cabinet.
  - **Q-8, answered no (owner, 2026-10-17, relayed):** *"let's not introduce this change with cabinets 2-3 between hob and fridge, let it be like it is now, I will create presets and you will learn from those presets; this is the best approach, for now let's continue without this change."* **No hob-counting rule is
    built, and no wave F2 exists.** The hob stays with N3r 5's packing. The owner's intent to derive placement rules
    from his own presets is a follow-up (§11a), not a wave.
- **No conflict with Fix 1.** The fill never moves a counted body (D5). On a counted wall, the end group is the
  pantries outboard of the counted fridge or tower (Q-7 = (a)).

**The exception, as built [inf, from the owner's words and the code].** *"Very long walls"* is read as **every wall
where N3r 3 or 10 counts the body from the corner**: a U side wall over 3000 mm, where `n` is 2 or 3. The owner said
*"more than 4 meters"*, but the counted rule already starts at 3001. The L has no such rule, so **(b) applies on every
L wall and every straight kitchen.** This is reported to the owner in §10, under *Readings built*.

**So (b) is required wherever the run ends with an uncounted full-height group.** That covers:
- the L's fridge end and tall-block end;
- the straight kitchen's ends;
- a U side wall of 3000 mm or less;
- the pantries outboard of a counted U fridge or far-wall tower (Q-7 = (a)).

Elsewhere (a run ending with a base, the U back wall, a counted body with nothing outboard of it), the fill takes the
run's end, and (a) and (b) give the same kitchen.

---

## 3. Fix 2 — save a kitchen as a preset, list it on Step 1, preview it, use a copy

### 3.1 The rulings and the records they meet

| Point | Record | Owner, 2026-10-17 | Settled how |
| --- | --- | --- | --- |
| Gate | ADR 0112 d2: a feature flag **and** an owner secret | **No password, no switch, every environment, for now.** Launch-gate condition: removed, or replaced by `preset.create`, before the first public deploy [owner] | **Amendment A to 0112** suspends d2 until that gate. The security reviewer records it as an **accepted, time-boxed risk** |
| Button | ADR 0112 d2 bullet 3: *"the client never decides"* | The bottom of the editor, right side [owner] | **Kept:** the server's answer decides visibility through a swappable policy seam (§3.3), which login later replaces |
| Name | ADR 0112 d1: an optional typed name **per locale** | One typed name, optional; else one generated from **shape, size, finish colour** [owner] | **Amended:** the typed name is stored once and shown verbatim; the generated name is **rendered** per locale from stored fields, never stored |
| Copy-on-use | ADR 0131 §4 quotes it; 0112 lacks it | — | **Written into 0112 Amendment A** (ADR 0131's revival condition) |
| Where authored | `WORKFLOW.md`, *Nothing ships mid-milestone* (owner, 2026-08-27) | **Q-4, answered: deploy to production and author there** [relayed, 2026-10-17] | **The owner's own exception to the owner's own rule, for this deployment.** The production deployment is not public. ADR 0112 Amendment A records it with its date |
| Listing | ADR 0112 d5: read on the room page's server, *"no public list endpoint is added"* | — | **Amended, an engineering decision** (§3.5): one read route for one room's matches |
| Backup | ADR 0112 *Consequences*: *"wave 7P1 extends the export"*; ADR 0012: a new table needs *"a second, separately-scoped export"* | `OWNER_FIXES.md` says the table *"is part of the production backup like any other table"* | **That sentence is false at HEAD** [src]: `BACKUP_BLOB_PREFIX = "backups/designs/"` (`backup-designs.ts:15`). Wave P2 adds the second export **before authoring starts**, as ADR 0112's *Consequences* already decided |

### 3.2 Storage — migration `0011_create_presets.sql` (ADR 0112 d1, amended)

| Column | Type and check | Why |
| --- | --- | --- |
| `id` | `text` primary key, the design-id shape (`nanoid`) | ADR 0112 d1 |
| `shape` | `text`, in (`L`, `linear`, `U`) | Matching filters on it |
| `wall_a_mm`, `wall_b_mm`, `wall_c_mm`, `height_mm` | `integer`. B is null for `linear`; C is non-null only for `U` (a table check mirrors `DesignRoomSchema`) | The ±600 window is read in SQL; the room the preset was saved in |
| `design_document` | `jsonb`, an object, the stored design at the schema version it was read at | ADR 0112 d3, the snapshot |
| `typed_name` | `text` null, at most 80 characters | Q-F2 ruling; null means the generated name |
| `thumbnail` | `bytea`, not null, length checked | ADR 0112 d6. One image, used for the card and the preview (§3.6) |
| `thumbnail_type` | `text`, in (`image/webp`, `image/png`, `image/jpeg`) | Served back as declared |
| `status` | `text`, in (`published`, `hidden`), default `published` | ADR 0112 d1. **Hidden by the owner, in the console** |
| `created_at` | `timestamptz`, default `now()` | Order: newest first (0109 A4) |

- **No design id is stored.** A preset does not depend on the private design it came from (ADR 0131 §4, the
  7P2 plan's *"no design id on the record"*) [doc].
- **Grant: `GRANT SELECT, INSERT ON TABLE public.presets TO app_designs;`** and nothing else. No `UPDATE`, `DELETE`,
  `TRUNCATE`, `ALL`, `WITH GRANT OPTION`, or `PUBLIC` (ADR 0008, 0112 d1).
- **The owner applies it, preview first, then production**, per
  `runbooks/applying-a-table-migration-and-its-application-role-grant.md`. P1 adds a `0011` section in the `0010`
  section's form: the ledger reads **11**; the column and constraint counts; `pg_default_acl` before the grant; the
  privilege test's line quoted per environment; and a *Hiding one preset* procedure (owner credential,
  `update presets set status = 'hidden' where id = …`, read-back first), like *Revoking one frozen kitchen link*.
- **The migration runner applies every pending file in order** [src: `migration-plan.ts:15-38`, against the
  ledger]. **On production `0009`
  and `0010` are not applied yet** (`STATUS.md`, owner list, 2026-10-17). So applying `0011` there also applies those
  two, and **their grants are owed too**, in the runbook's sections for `0009` and `0010`. The code that reads `0010`
  answers 500 for an unknown share token until it is applied (runbook, `0010`). **So the order on production is
  `0009`, `0010`, `0011`, their grants, then the deploy.**

### 3.3 The save path — `POST /api/designs/{id}/preset`

- **Under `/api/designs/{id}/`, on purpose.** The write-token cookie is scoped to `Path=/api/designs/{id}`
  (`write-token.ts`; `app/[locale]/d/[id]/page.tsx:9-13`) [src].
  - So the route can require **the design's own write token and visitor** (ADR 0114 G4), exactly as
    `api/designs/[id]/share/route.ts` does.
  - Then a stranger who learns a design id cannot publish someone else's private kitchen.
  - **This is not a gate on authoring.** Anyone can mint a design (20 a day per network, ADR 0147) and save it. It
    only binds the snapshot to its author's browser.
- **The order, the share route's:**
  1. the cross-site refusal (`isCrossSiteRequest`);
  2. the credentials (write-token hash and visitor hash, both present);
  3. the policy seam (below);
  4. the **saves** limiter, which fails closed (ADR 0156);
  5. the bounded body (`read-body-with-limit.ts`);
  6. the stored design loaded through the repository, which validates and migrates it;
  7. the **revision check**;
  8. the domain refusals;
  9. the image check;
  10. the insert;
  11. `201 {id}`.

  Every credential refusal answers the byte-identical `designNotFoundResponse` (ADR 0114 G5's identity).
- **The body carries a design id, an optional name, the revision the editor shows as saved, and the image.**
  It never carries a document (ADR 0112 d3).
  - A revision that is not the stored one gets `409 PRESET_STALE` and no row, so the preset is the kitchen the owner
    is looking at.
  - The editor sends nothing while it holds an unsaved write (ADR 0158's rule: never shown as saved while the tab
    holds a write).
- **Refusals [ADR 0112 d4], from one I/O-free domain function** (`refusalOfPresetCandidate`, new under
  `configurator-domain/src/preset/`):
  - **zero validation findings of either severity**, through `validateDesignForCatalog` and
    `findOverflowingPlacementIds`, otherwise `PRESET_HAS_FINDINGS` with the first code;
  - **a sink and a hob**, otherwise `PRESET_MINIMUM_NOT_MET`. Read off the catalogue's declarations: `sink:
    CARRIES_SINK` and `carriesAccessoryKind: "induction_cooktop"`, never a build-id list (ADR 0121).
  - The dialog shows the reason in the owner's language, as a code mapped to a message key (ADR 0095 d3).
- **The image check** (`lib/server/preset/thumbnail-check.ts`):
  - magic bytes agree with the declared type (WebP, PNG or JPEG only);
  - at most **512 KiB**;
  - the dimensions read from the header equal the capture size (§3.6).

  Anything else gets `422 PRESET_IMAGE_REFUSED`. The image is never decoded to pixels on the server.
- **The name:** NFC, trimmed, at most 80 characters, and refused if it holds a control or bidi-override character.
  React renders it as text only.
- **The policy seam** (`lib/server/preset/preset-authoring-policy.ts`):
  - It has one function, which takes the request and answers whether this request may author presets.
  - The one implementation, **`ungatedUntilLaunch`**, answers yes and is named by one exported constant.
  - **The launch gate refuses while that constant is wired** (`pnpm gate:launch-placeholders`, the pattern ADR 0163
    used for the shop's number). That makes the owner's time box falsifiable.
  - Fix 3 replaces the implementation with `preset.create`, and the route does not change.
  - `GET /api/designs/{id}` answers `canAuthorPresets` beside `canWrite`, so the button follows the server
    (ADR 0112 d2 bullet 3).

### 3.4 The button, the dialog and the capture

- **Where.** Bottom-right of the editor's scene region on the phone and on desktop, inside the layout shell only
  (§10.1).
  - It must not cover the price bar, the sheet's pinned footer, the camera presets or the overflow warning.
  - Its touch target is at least 44 px (§10.1).
  - It is hidden while the bottom sheet is open on the phone, so it never sits under a finger meant for the sheet.
  - It is shown when `canWrite` and `canAuthorPresets` are both true. So it is **absent** in the share view, in the
    frozen view and in a read-only editor.
- **The dialog:**
  - an optional name field, its placeholder the generated name as it will read;
  - *Salvează ca preset* (copy drafted, the owner approves; ADR 0113's practice);
  - a refusal reason when one is returned;
  - a success state naming the preset.
- **The capture** (`scene/capture-scene-image.ts`):
  - one frame rendered at the **overview** camera preset, with the selection and void outlines hidden;
  - read from the canvas in the same task as `gl.render`, since `preserveDrawingBuffer` is not set (no capture code
    exists in `apps/web/src` today [src]);
  - encoded to WebP at **1280 × 960**, falling back to PNG or JPEG where the browser cannot encode WebP;
  - re-encoded smaller if it is over 512 KiB.

  **It is the same image the card and the preview show** (ADR 0112 d6, §13.3 q5: the thumbnail comes from the
  preset's own design).

### 3.5 Listing and matching (ADR 0109, amended)

- **Why a read route.** The room exists only in the client until *Continuă* (Step 1's sub-states; ADR 0127). Shipping
  every published snapshot in the room page is unbounded. So **`GET /api/presets?shape=…&a=…&b=…&c=…`** answers the
  **published** presets of that shape whose every saved wall is within **±600 mm inclusive** of the room's
  (0109 A2), newest first, **at most 8**.
  - Each item carries the summary, the snapshot and the image URL. **It never returns a hidden row and never a
    design id.**
  - The route is limited by the **reads** limiter, which fails open (ADR 0156), and carries no cookie, so it is
    cacheable for 60 s.
  - **This amends ADR 0112 d5** in the dated amendment, with its reason. The data is product data every customer is
    shown anyway.
- **`GET /api/presets/{id}/image`** serves the image with:
  - its stored type;
  - `X-Content-Type-Options: nosniff`;
  - `Content-Disposition: inline`;
  - `Cache-Control: public, max-age=31536000, immutable` (rows are insert-only).

  Same-origin, so the CSP's `img-src 'self' blob: data:` (`security-headers.ts:113`) admits it unchanged [src].
- **Evaluation runs in the browser, in Step 1's existing probe lease** (ADR 0110 d6, ADR 0076). Adaptation inserts
  through `insertBody`, which needs a probe. Evaluating one preset in the target room:
  1. Instantiate the snapshot in the entered room.
  2. A wall shorter than the preset's run loses **whole columns from its free end**, never a structural body, the
     sink or the hob (0109 A3.1, D/F4).
  3. A ceiling below a row drops that row, and a structural piece above the ceiling is not instantiated
     (0109 Amendment B, corrected).
  4. **Every** free end is refilled by generation's own rule, ADR 0167, at every level (A3.2; Q-3, answered).
     That includes a bare end the owner saved.
  5. The result must have **zero findings at its own depth and at every declared depth** (0109 C, through
     `setCabinetDepth`) and the minimum kitchen (A3.4).
  6. **If the corner assembly would be sized differently in the target room** (`cornerAssemblyWidthsMm` depends on
     the walls, 7D7), **the preset is not shown.** This is conservative, and nothing is narrowed (A5).
  7. A **U** whose back wall differs (Q-5, answered): **the back wall's right end is its free end.** Columns are
     removed or refilled there, as generation leaves its remainder there (N11.8). The right corner assembly and
     wall C move with the wall's end, and nothing else on wall A moves. Step 6 still applies to both corners.
- **One evaluation, list and use** (0109 d4): the card, the preview and *Select* all read the same evaluated design.
  *Select* writes it, and it is not evaluated again. Order follows 0109 A4: no change first, then fewer removed, then
  newest. There is no distance score (ADR 0067).
- **Fail open.** If the route fails, times out or the table is missing, or no candidate fits, Step 1 goes **straight
  to 1F composition, exactly as today**, with no customer-visible error. That is logged (`STATUS`'s
  never-a-dead-end rule; mockup frame 1F: *"utilizatorul primește întotdeauna un rezultat"*).
- **Bounded on the phone.** At most 8 candidates are evaluated, and the time is measured on the 390 × 844 profile
  as 7F4 measured generation [inf: the cost per adaptation is unmeasured].

### 3.6 The list, the preview and the copy

**Q-6, answered by the owner (2026-10-17, relayed):** *Preview opens a pop-up with a slider (an image carousel of the
matching presets), with previous and next navigation and a Select button that copies the preset into a new private
design and opens it in the 3D editor. There is no *Folosește* on the card; the card has Preview only.*

**This departs from the mockup and from a recorded decision, and both are recorded, not smoothed** [doc]:
- Frame 1E's note: *"Listă verticală, nu carusel: fiecare preset are propriul buton „Folosește" — nu mai e nevoie de
  un ecran de confirmare."*
- [ADR 0003](../decisions/0003-design-reference-supersession.md) 4b, *"Preset selection is a list with a per-card CTA,
  not a carousel"*.

The owner's ruling supersedes both for the preset chooser. Three records are owed: a dated **amendment to ADR 0003
4b**, a dated note on **ADR 0104** (the mockups are the chrome specification; this frame is departed from by ruling),
and a note on frame 1E's description, which **lives in ADR 0104's dated note**. The mockup file itself is not
edited (ADR 0104).

**A rejected direction, overridden by name.** `milestones/README.md`, *Cross-cutting rules*, lists *"pagination in a
chooser"* among the rejected directions. A Previous/Next carousel comes close to it. **The owner overrode it for the
Preview pop-up on 2026-10-17**, and the list on screen stays unpaginated. ADR 0003's amendment says so.

**Not reached by D5 either:** DEVELOPMENT-SPEC §13.2's *"auto-shifting a whole run"* is about the editor's resize. D5
moves a planned group while generating, before any customer sees it, with O10 as the precedent.

**What the change does not reach.** DEVELOPMENT-SPEC §13.1's *"filtered list, never pagination"* (ADR 0027) governs the
editor's catalogue offer list, not the preset chooser, and stays. Step 1 still shows **only the presets that fit**
(§9): the carousel holds exactly the cards the list holds.

- **1E, the list.** The vertical list stays; there is no carousel on the screen itself. Each card shows:
  - the image, the name, the counts (*"N corpuri · bază n · suspendate n"*);
  - the colour and handle;
  - *De la* and the price of the **adapted** design, computed by the editor's own price function, so it equals the
    editor's after *Select*;
  - the declared change (*"Ajustată … ca să intre pe peretele B"*, 0109 A3.3 and A5);
  - **one control, *Previzualizează*** (copy drafted). There is no *Folosește*, and the card itself selects nothing.

  Desktop follows 7L's line: D1E's four-up grid of the same cards, each with Preview only (ADR 0104 B).
- **The Preview pop-up, a carousel** [owner]:
  - It opens **on the tapped preset**.
  - Its slides are the list's presets, **in the list's order** (0109 A4).
  - Each slide shows the stored image at full size (no live 3D), its name, counts, price and declared change.
  - **Previous** and **Next** controls, each at least 44 px (§10.1). Swiping does the same on the phone, and the
    arrow keys on desktop. The position reads *"2 / 5"*.
  - **No wrap-around:** Previous is disabled on the first slide and Next on the last (a default, not asked).
  - **Select** acts on the slide on screen. Escape or the close control dismisses the pop-up, focus returns to the
    card that opened it, and focus is trapped while it is open.
  - With one preset, the pop-up shows one slide and no Previous or Next.
  - Images load on demand for the slide on screen and its two neighbours, so eight full-size images are never
    fetched at once on a phone [inf: the size per image is up to 512 KiB, §3.3].
- **Select (copy-on-use)** [ADR 0131 §4, owner 2026-09-15]: a new design is created through the existing mint and
  save (`createDesignCreationAttempt`, ADR 0111), with `presetId` set to the preset's id, then the editor opens on it.
  - The 20-a-day mint limit applies, as for generation.
  - **The preset row is never written** (no `UPDATE` grant exists).
  - The copy is an ordinary private design under its own write token.
- **Select copies the slide's own evaluation** (0109 d4): it writes exactly the design the slide shows, and does not
  evaluate again.
- **The copy owed to the owner's approval** (drafted in Romanian, translated to Russian, under ADR 0113's practice):
  the button, the dialog, the refusals, Preview, Previous, Next, the position and Select. Also the 1F notice *"Niciun preset gata făcut nu încape
  aici"*, which is now true only when nothing matched (ADR 0131, *Consequences*).

### 3.7 ADR 0112 Amendment A (outline, F0)

- **Copy-on-use:** ADR 0131 §4's quote, now part of this record.
- **d1, amended:** the columns of §3.2; no design id; the typed name stored once; the generated name rendered per
  locale from `shape`, the walls and the design's finish.
- **d2, suspended until the first public deploy** [owner]:
  - no flag, no secret;
  - the policy seam and the launch-gate refusal;
  - the time-boxed accepted risk, stated: *"anyone who can reach an environment can publish a preset onto every
    Step 1 screen in that environment's database"* [owner];
  - the M9 launch gate lists it.
- **d3, kept and sharpened:** the route under `/api/designs/{id}/`, the write-token and visitor credentials, and the
  revision check.
- **d4 and d6 kept;** d6's image is one 1280 × 960 capture.
- **d5, amended:** the read route of §3.5 and its bounds.
- **d7, kept:** security review on P1, P3, P4 and P6.
- **Consequences:**
  - the second, scoped export (ADR 0012);
  - *"M8's launch gate gains … the authoring flag's production value"* is replaced by *"the ungated policy is not
    wired"*.

**ADR 0109 Amendment E (outline, F0; Q-3 and Q-5 answered):** the refill reads ADR 0167 at every free end; a U's
back wall adapts at its right end; a
corner sized differently means the preset is not shown; the Preview carousel presents the one evaluation per preset (d4 holds).
**ADR 0003 4b, dated amendment, and ADR 0104, dated note:** the preset chooser becomes a list of cards with Preview
only, opening a carousel pop-up with Select, by the owner's ruling of 2026-10-17 (§3.6).

---

## 4. The owner's "no new tests", against `WORKFLOW.md` — the owner chose C (Q-1, 2026-10-17)

**The conflict, stated plainly.**
- The owner asked for implementation without writing new tests.
- `WORKFLOW.md` requires a paired regression test per behaviour change (*Scope discipline*). It makes adversarial QA
  the gate in front of review (*QA before review*, AGENTS.md rule 4), and runs a test audit at the milestone's close
  (ADR 0152 A).
- **This plan does not drop QA silently, and it does not override the owner silently either.** It offers three
  options and recommends one. **The owner chose C** [relayed, 2026-10-17]. In F0 the scribe records it as
  **ADR 0168**, with its date, the three alternatives and the reason. A deviation from WORKFLOW is a
  decision to record, not a shortcut (milestones README, banner).

**What holds in every option:**
- The existing suites must stay green.
- Every existing assertion that encoded a bare end, a body count or a price that the fill changes is **updated, never
  deleted to make a suite pass**. The reason is recorded in an ADR 0152 table in the hand-back: test, line, old value,
  new value, *"ADR 0167 D1"*. Every QA-owned pin moved is reported (the 8U round A and 8V S4 precedent).
- Adversarial QA **runs in every option** and still gates review. What changes is only whether its probes are
  committed.
- Review tiers are unchanged.

| Option | Implementers add tests? | QA's probes | What is lost | |
| --- | --- | --- | --- | --- |
| **A — WORKFLOW as written** | Yes, paired tests per slice | Committed (`qa-8c-*`) | Nothing | The default the rules require |
| **B — the owner's words, literally** | No new test files or cases | Run as **scratch measurements**: sweeps, sabotage in both directions (R6), browser runs. Quoted in the close-out, not committed | After the wave, **nothing in the gates would catch a regression** of the fill or of the save refusals. The milestone audit has no new tests to audit. The `0011` runbook's step 3–7 proof **cannot run**: it is a test in `application-role-privileges.test.ts` | |
| **C — recommended: B, with four exceptions where a gate or a runbook depends on a test** | Only these: (1) the `presets` arm of `application-role-privileges.test.ts` (the runbook's proof); (2) the save route's refusals (no credential, cross-site, stale revision, finding, no sink or hob, a wrong image); (3) **one committed property**, criterion F-1, *no free run-end opening `≥ F`*, over random rooms (`fast-check`), so Fix 1's acceptance stays falsifiable after the wave; (4) the e2e of the owner's loop (P9) against a **fake** preset repository | Scratch for everything else, quoted | Coverage of the UI details and of matching's edges stays in QA's reports only | |

**Chosen: C.** It keeps the owner's intent: no test-writing effort spent on the editor UI or the domain
details. It keeps the four places where removing a test removes a guarantee somebody relies on: the owner's own grant
proof, the security reviewer's accepted-risk write path, and the owner's acceptance loop.

---

## 5. Waves

**Every dispatch carries:**
- the discarding-git ban, by name (`git stash`, `git stash pop`, `git checkout -- .`, `git reset --hard`,
  `git clean`);
- one writing agent per tree (R2);
- the complete changed-file list first in the hand-back, and a bounded report (R7);
- *no row is deleted outside a harness's own teardown (ADR 0151)*;
- *no agent applies a migration or touches a variable on preview or production (AGENTS.md rule 1)*;
- *check the change against the intent of the ADRs named in your Reading, and stop on a conflict*;
- Q-1's answer, quoted, for what tests may be written.

**The owner's split.** First the fix (F0, F1a, F1b). Then the authoring group, so presets can be made (P1–P4, with
P2's backup before authoring starts). Then an owner checkpoint. Then the listing group (P5–P9). ~~F2 exists only if
Q-8's answer is *yes*.~~ **Withdrawn: Q-8 = no (2026-10-17).**

| Wave | Goal | Depends on | Tier | Production files (≈) |
| --- | --- | --- | --- | --- |
| **F0** | The records first: ADR 0167 *Proposed*; 0112 Amendment A; 0109 Amendment E; 0003 4b amendment; 0104 note; ADR 0168 (Q-1 = C) | — (Q-1 answered) | Coordinator-only (docs, scribe) | 0 |
| **F1a** | Composition's merge never joins two planned tiles (D6, M-1). **Behaviour-free at HEAD**, or it falls back to M-2 inside F1b | F0 | **Full** | 4 |
| **F1b** | Fix 1: the fill, the end group moved outward, counted bodies untouched (D1–D9) | F1a | **Full** + visual | 4 |
| **P1** | The `presets` table, its repository, the runbook section | F0 | **Full + security** | 4 |
| **P2** | The presets export, a second scoped export (ADR 0012) | P1 | **Full + security** | 4 |
| **P3** | The save route, the domain refusal, the image check, the policy seam, the launch-gate line | P1 | **Full + security** | 5 |
| **P4** | The button, the dialog, the capture, the generated name | P3 | **Light + visual + security reader on the upload** | 6 (said here) |
| — | **Owner checkpoint** (Q-4 = yes): migrations and grants, deploy to production, author presets there (§9) | F1b, P1–P4 | Owner | — |
| **P5** | Matching and adaptation in the domain (the refill at every free end; a U's back wall adapts at its right end) | F1b, P1 | **Full** | 4 |
| **P6** | The read route and the image route | P1, P5 | **Full + security** | 4 |
| **P7** | Step 1: candidates fetched and evaluated in the lease, failing open to 1F | P5, P6 | **Light** | 3 |
| **P8** | 1E cards with Preview only; the carousel pop-up; Select copies the preset and opens the editor | P7 | **Light + visual** (mobile-gated) | 5 |
| **P9** | The owner's loop end to end, desktop and 390 × 844; the milestone close (test audit) | P8 | QA-led + visual | 0 |

**Order and first dispatch.**
1. **F0**, the scribe (a dispatched agent, never the coordinator: `WORKFLOW.md`, *QA before review*). Its reading:
   §2.5–§2.7, §3.1, §3.6, §3.7, §4, §10, §11a and §12 of this plan; ADR 0003, 0067, 0104, 0109, 0110, 0112, 0117,
   0131 and 0166; `best-practices/documentation.md`.
   - It writes ADR 0167 and 0168 and the amendments and notes of §12.
   - It also updates `milestones/README.md`, `M9-delivery-preparation.md`, the M8 plan's *Launch gate* and
     `STATUS.md`.
   - Coordinator-only review tier: the coordinator checks the records against this plan and commits.
2. **F1a S0**, QA as a measurement agent. On a planned-pair merge count of 0, **F1a S1** goes to a domain developer;
   otherwise F1a is withdrawn and the plan is revised for M-2 first. Then F1a's QA, then review.
3. **F1b S1**, the domain developer. Then **F1b S2**, the web, adapter and e2e test updates. Then QA, review and
   visual.
4. **P1 → P2 → P3 → P4**, each with its own QA and review. Then the **owner checkpoint**.
5. **P5 → P6 → P7 → P8 → P9**, then the milestone close.

 F1a and F1b (domain `generation/`, `merge-empty-columns.ts`)
and P1 (persistence) touch no shared file. They may run in two worktrees (R2), but the owner asked for fixes first.
P5 needs F1b, since adaptation refills with its rule.

**File ownership.**
- Each production file has one owning wave.
- `generate-kitchen.ts` is touched by F1a (passing the planned boundaries) and F1b (the fill), sequentially.
- `ro.json` and `ru.json` are touched by P4 (`presetSave.*`) and P8 (`room.presets.*`) in disjoint leaves, never in
  flight together.
- `configurator-domain/src/index.ts` is touched by F1b (only if it exports), P3 and P5, sequentially.
- `persistence/src/index.ts` is touched by P1 and P2, sequentially.
- `lib/server/repository.ts` gains its getter in P3 and is only read after.
- `room-screen.tsx` and `use-generation.ts` belong to P7 alone.
- `configure-screen.tsx` belongs to P4 alone.

### F1a — composition never joins two planned tiles (Full)

| Slice | Owner of the files | Work (≤ 5 items) | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S0** | QA (measurement) | (1) Re-create §2.1's sweep at the base and record the **before** census: per shape, wall, level and width class. (2) **Count the planned-pair merges at HEAD**: two planned tiles joined by composition's merge, on the L, straight and U grids. **If the count is not 0, stop: M-1 is not behaviour-free, F1a is withdrawn, and F1b takes M-2.** (3) List the existing tests that assert a bare end, a remainder, a body count or a price of a generated kitchen: grep for `remainderMm`, `MAX_GENERATED_LEFTOVER_MM`, `planLeftover`, `599`, the recorded baselines `tests/generation/7d*-baseline.json`, and the e2e price figures. (4) Find witness rooms for each arm of D6's table at `r` = 200 and 201: a sink inboard of the fridge, a door cabinet inboard (O10), the dishwasher, the bottle, the hob, a tower with E6, RQ17's lone U tower, a counted U fridge with pantries, a run ending with a base, a large-U wall A at 200–299. (5) Find witnesses for the counted positions: fridge walls of 3000, 3001, 4000 and 4001 mm, and the same for the far wall | — | This plan §2.1, §2.2 (D5, D6), §2.7. ADR 0110 A4, C, D-revised 2 and 4, E6, N3r 3, 4, 10, N11.9, O9, O10; ADR 0166 d2, d4, d6. Source: `generation/` (whole), `merge-empty-columns.ts`, `void-engine.ts` (`deriveColumns`, `recomputeVoids`), `commands/reconcile-command-result.ts`, `tests/support/fake-probe.ts` |
| **S1** | Developer (domain) | (1) The merge takes a set of **planned boundaries** as a value beside its width limit, and declines to join two columns across one. (2) `deriveColumns` and the reconcile pass it through, where composition supplies it. (3) `generate-kitchen.ts` passes the shell's planned boundaries at every merge it runs: the first load, after each command, and replay. The editor passes none. (4) The editor's fast screen (ADR 0166 d6) is checked to agree. (5) Census byte-identical to S0's **before** | `merge-empty-columns.ts`; `void-engine.ts`; `commands/reconcile-command-result.ts`; `generation/generate-kitchen.ts` | §2.2 D6; ADR 0166 d4, d6 and criteria 15–17; ADR 0110 d2 and *D revised*; ADR 0102. Source: `merge-empty-columns.ts` (whole), `void-engine.ts:425-470`, `reconcile-command-result.ts`, `generate-kitchen.ts:736-791, 930-953` |

- **QA Reading:** §2.2 D6; ADR 0166 d4, d6, criteria 1, 2, 15–17; WORKFLOW R6; source: the S1 diff,
  `merge-empty-columns.ts`.
- **QA owes:**
  - the census byte-identical to S0's **before**, on every grid;
  - the editor's merge unchanged, through ADR 0166 criteria 1 and 2 re-run;
  - sabotage both ways: pass no boundaries, and the planted 600 + 200 pair must merge; pass the boundaries, and it
    must not.
- **Review: logic and clean-code in parallel.**
  - **Logic, Reading:** D6; ADR 0166 d4, d6; ADR 0110 *D revised*. *The questions:* can the editor's world ever
    receive boundaries? Does replay pass the same ones?
  - **Clean-code, Reading:** the diff; `engineering-conventions.md`; ADR 0166 d6 (the restated guards).

### F1b — the fill (Full)

| Slice | Owner of the files | Work (≤ 5 items) | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (domain) | (1) New `generation/free-end-fill.ts`: `withTheFreeEndsFilled(plan, { fillFloorMm, countedIds })`, generic over the L, straight and U plans (the `AbsorbablePlan` shape, `fridge-end-leftover.ts:32-38`). For each wall with `remainderMm ≥ floor`, it finds the end group `G` (E7's height predicate, never a counted body), plans the fill at `[g, g + r]` and shifts `G` by `+r`, or plans it at `[runEnd − r, runEnd]`. Floor widths and remainder are updated. (2) `generate-kitchen.ts`: apply it once in `planComposition`, after the plan, for every shape. The floor comes from `declaredFillFloorMm(catalog)`, read like `declaredColumnSizes`. The U plan's counted ids (its `fridgePosition` and `towerPosition`) are passed in. (3) `u-composition.ts`: retire `withTheBackWallFill`, keeping the step id `wall-a-remainder:A` for wall A's fill (D7). (4) `leftover-rule.ts`: re-document `MAX_GENERATED_LEFTOVER_MM` as the module rule's remainder (the bare end is now `< F`). (5) Update every domain test S0 listed that the change turns red, under the ADR 0152 table (§4). **If F1a was withdrawn, M-2 is built here instead, and the plan is revised first** | new `generation/free-end-fill.ts`; `generation/generate-kitchen.ts`; `generation/u-composition.ts`; `generation/leftover-rule.ts` | This plan §2.2–§2.7. ADR 0110 A1, A4, C/F2, C/F7, D-revised 4, E2, E6, E7, E8, E12.1, H1, N3r 3, 4, 10, N11.8, N11.9, O4, O9, O10; ADR 0109 C; ADR 0102; ADR 0166 d4 (as F1a left it); ADR 0035 d2, d8; ADR 0033. DEVELOPMENT-SPEC §5.2, §7, §11 rows 13, 17–20. Source: `generation/` (whole), `fridge-end-leftover.ts:78-132` (the move to widen), `catalog.ts:100-130, 440-600`, `commands/insert-fit.ts:279-337` |
| **S2** | Developer (web, adapter, e2e tests) | (1) Run the web, three-adapter and e2e suites at S1. (2) Update every assertion the fill turns red (1F rows, body counts, price figures, captured layouts) under the same table. (3) Report any red that D1 or D5 does **not** explain as a finding, without updating it | none expected; any production file touched is a stop-and-report | §4 of this plan; ADR 0152; `engineering-conventions.md`, *Three guards that look thorough and cannot fail*. Tests: `apps/web/tests/room/*`, the e2e specs S0 listed |

- **QA Reading:**
  - this plan §2 whole and §6 F-criteria;
  - ADR 0110 A4, C/F7, D-revised 4, E6, E8, H1, N3r 3, 4, 10, N11.9, O9, O10; ADR 0167 (*Proposed*); ADR 0152;
  - `engineering-conventions.md`, *Coverage an adversarial pass owes*; WORKFLOW R6;
  - source: the S1 diff, `void-engine.ts` (`deriveColumns`, `recomputeVoids`), `upper-policy.ts`, `u-fridge-wall.ts`,
    `u-tall-layout.ts`.
- **QA owes:**
  - the after census on the same grids, plus heights 2200, 2400, 2599, 2600 and 3900, and after `setCabinetDepth` to
    each declared depth;
  - the diff against the before census: only fills added and end groups shifted by `r`; every counted body at the
    same place; rooms with `r < F` or a full absorb byte-identical;
  - every D6 witness at `r` = 200 and 201 generates;
  - `replayGenerationLog` equal to the design;
  - sabotage both ways, reporting the mutants run and killed: delete the fill and the census must go red; move the
    floor to 199 or 201 and the boundary rooms must go red; let `G` include a counted body and the counted witnesses
    must go red; shift `G` by `r − 1` and F-5 must go red.
- **Review: logic and clean-code in parallel, after QA is green.**
  - **Logic, Reading:** §2.2–§2.7; ADR 0110 A1, A4, D-revised 4, E2, E8, E12.1, H1, N3r 3, 4, 10, N11.9, O10;
    ADR 0167; source `generate-kitchen.ts`, `free-end-fill.ts`, `u-composition.ts`, `u-fridge-wall.ts`.
    *The questions:* can a fill stand in the reserve, over a column, or below `F`? Can a counted body move? Does any
    absorb now see a smaller remainder? Does the run still read A1's order in one direction?
  - **Clean-code, Reading:** the full diff; `engineering-conventions.md`; ADR 0102 (one authority for the floor; one
    move rule shared with O10).
  - **Visual, Reading:** §2.3; `browser-and-visual-qa.md`. Captures at 390 × 844 and 1440 × 900 of the witness rooms,
    showing a fill inboard of a moved fridge and of a moved tall block, a counted U fridge unmoved, a U side wall, and
    a room at 2599 (no top). The captures are real, not
    computed (WORKFLOW, *Working conventions*).
- **Close:** ADR 0167 accepted, its dated notes (§2.5), DEVELOPMENT-SPEC §11 new rows 28–30 (§6), and `STATUS.md`.

### P1 — the `presets` table (Full + security)

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (persistence) | (1) `0011_create_presets.sql`, §3.2, with a header in the form of `0006`, `0008` and `0010`: apply before code, the grant is separate, the bytes are frozen. (2) `preset-repository.ts` on Neon: `insert`, `listPublishedNear(shape, walls, windowMm, limit)`, `loadImage(id)` (published only). (3) `fake-preset-repository.ts`. (4) Exports in `index.ts`. (5) The runbook section for `0011` (docs, not counted) and the privilege-test arm (Q-1 = C, exception 1) | new `migrations/0011_create_presets.sql`; new `preset-repository.ts`; new `fake-preset-repository.ts`; `index.ts` | This plan §3.2. ADR 0112 d1 (and Amendment A), 0008, 0020, 0042, 0096, 0145, 0146 B2, 0151, 0128. Source: `migrations/0006*.sql`, `0010*.sql`, `share-link-repository.ts`, `sent-kitchen-view-repository.ts`, `migration-safety.ts`, `retry-on-transient-failure.ts`. Tests: `tests/application-role-privileges.test.ts`. The runbook, whole; `environments-and-resources.md` |

- **QA Reading:** §3.2; ADR 0112 d1; ADR 0146 B2; source: the diff and `migration-safety.ts`.
  *What QA owes:* SQL that names a column the table lacks; the window at ±600 and ±601; null walls for `linear`;
  a hidden row never returned; a driver error never copied out of the package (ADR 0146).
- **Security, Reading:** §3.2; ADR 0008, 0112, 0146; `environments-and-resources.md`; source: the migration and the
  repository.
  *The questions:* what does a leaked `DATABASE_URL` read or write here? Is the grant exactly `SELECT, INSERT`?
  Can the list return a hidden row?
- **Logic and clean-code, one combined reviewer, Reading:** this plan §3.2; ADR 0112 d1 and Amendment A; ADR 0109 A2
  (the window the list query serves); `engineering-conventions.md`; source: the full diff,
  `share-link-repository.ts` (the house pattern). One reviewer is enough for a repository against a settled table;
  security is separate.

### P2 — the presets export (Full + security; before authoring, per ADR 0112 *Consequences*)

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (persistence + web server) | (1) `preset-row-source.ts`, a scoped `select` over `presets` alone. (2) `lib/server/backup-presets.ts` on its own prefix `backups/presets/`, with the same 14-day rotation. (3) `app/api/cron/backup-presets/route.ts` with `cron-auth.ts`. (4) The schedule beside `backup-designs`. (5) A restore runbook step (docs) | new `persistence/src/preset-row-source.ts`; `persistence/src/index.ts`; new `apps/web/src/lib/server/backup-presets.ts`; new `app/api/cron/backup-presets/route.ts` | ADR 0012 (*"a second, separately-scoped export"*), 0054. Source: `design-row-source.ts`, `backup-designs.ts`, `api/cron/backup-designs/`, `cron-auth.ts`; `runbooks/design-db-restore.md` |

- **QA Reading:** this plan §3.1 (the backup row), §6 P-16; ADR 0012, 0054; source: the diff, `backup-designs.ts`,
  `design-row-source.ts`. *What QA owes:* the `bytea` image round-trips byte-identically; the export never reads
  `designs` or any contact table; the rotation never deletes a `backups/designs/` object.
- **Security, Reading:** ADR 0012, 0054, 0146 B2; `environments-and-resources.md`; source: the diff, `cron-auth.ts`.
  *The questions:* is the cron authenticated as `backup-designs` is? Can the Blob path collide with
  `backups/designs/`? Does any value reach a log?
- **Logic and clean-code, one combined reviewer, Reading:** the diff; ADR 0012; `engineering-conventions.md`.

### P3 — the save path (Full + security)

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (domain) | (1) New `preset/preset-candidate.ts`: `refusalOfPresetCandidate(design, catalog)` and `presetRoomOf(design)`. (2) Its export | new `configurator-domain/src/preset/preset-candidate.ts`; `configurator-domain/src/index.ts` | §3.3. ADR 0112 d3, d4; ADR 0109 d3; ADR 0121; ADR 0092 d9 (the sink declared). Source: `validate-design.ts`, `queries/overflowing-placements.ts`, `catalog.ts` (`sink`, `carriesAccessoryKind`) |
| **S2** | Developer (web server) | (1) `app/api/designs/[id]/preset/route.ts`, in §3.3's order. (2) `lib/server/preset/thumbnail-check.ts`. (3) `lib/server/preset/preset-authoring-policy.ts` and the launch-gate line. (4) The repository getter in `lib/server/repository.ts`. (5) `GET /api/designs/{id}` answers `canAuthorPresets` | new `app/api/designs/[id]/preset/route.ts`; new `lib/server/preset/thumbnail-check.ts`; new `lib/server/preset/preset-authoring-policy.ts`; `lib/server/repository.ts`; `app/api/designs/[id]/route.ts` (plus the launch-gate script, counted as tooling) | §3.3. ADR 0112 (and Amendment A), 0114 G4 and G5, 0156 (saves limiter), 0158, 0163 (the launch-gate constant), 0019 (SEC-001). Source: `api/designs/[id]/share/route.ts` (the template), `api/designs/[id]/route.ts`, `cross-site-request.ts`, `read-body-with-limit.ts`, `write-token.ts`, `visitor.ts`, `rate-limit/` (the saves judge), `design-errors.ts`, `design-failure-log.ts` |

- **QA Reading:** §3.3; ADR 0114 G5, 0156, 0158; the S1 and S2 diffs; `share/route.ts`.
- **QA owes:**
  - every refusal in §3.3, and the not-found identity byte for byte;
  - a body carrying a `design` key is ignored;
  - a 512 KiB + 1 image, a PNG declared as WebP, a polyglot (GIF bytes, `image/png`), a header with 0 × 0 or
    65 535 × 65 535;
  - a name of 81 characters, U+202E, and NUL;
  - the stale revision;
  - the limiter refusing.
- **Security, Reading:** §3.3, §3.7; ADR 0112 d2 and its Amendment A, 0114 G4 and G5, 0146 B2, 0156, 0161 (CSP);
  `environments-and-resources.md`; the full diff.
  *The questions:* can anyone but the design's author publish **that** design? What exactly is the accepted risk,
  stated in one sentence for the record? Can the image become anything but an image? Does any value reach a log? Does
  the launch gate actually go red with the ungated policy wired (run it)?
- **Logic, Reading:** §3.3; ADR 0109 d3; ADR 0112 d4. *The question:* is the refusal the same rule as the review's
  *"nothing Lemnaria supplies"* (ADR 0148)? Name any difference.
- **Clean-code:** the full diff.

### P4 — the button, the dialog, the capture, the name (Light + visual + a security reader on the upload)

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (UI) | (1) `scene/capture-scene-image.ts` (§3.4). (2) `editor/save-as-preset.tsx`: the button and the dialog. (3) The mount in `configure-screen.tsx`, with its CSS. (4) `preset/preset-name.ts`: the generated name per locale (shape, walls, finish), shared with P8. (5) The leaves in `ro.json` and `ru.json`, as drafted for the owner's approval | new `scene/capture-scene-image.ts`; new `editor/save-as-preset.tsx`; `app/configurator/configure/configure-screen.tsx`, `configure.module.css`; new `preset/preset-name.ts`; `messages/ro.json`, `ru.json`. **Six entries, counting the two catalogues as one; within the limit's intent, said here; a mini-review follows** | §3.4, §3.6 (the name). ADR 0112 d2 bullet 3, d6; ADR 0104 d1 and d7; ADR 0113; ADR 0095 d3; ADR 0158. DEVELOPMENT-SPEC §10.1, §13.3 q5. Source: `configure-screen.tsx`, `configure.module.css`, `scene/kitchen-stage.tsx`, `scene/kitchen-canvas.tsx`, `camera-preset-store.ts`, `overflow-warning-layout.ts`, `hydrate-and-configure.tsx`. `browser-and-visual-qa.md` |

- **QA Reading:** this plan §3.3 (what P3 accepts), §3.4, §6 P-5, P-6, P-8; ADR 0112 d2 bullet 3, d6; ADR 0158;
  DEVELOPMENT-SPEC §6.4, §10.1, §13.3 q5; source: the S1 diff, `hydrate-and-configure.tsx`, `kitchen-stage.tsx`.
- **QA owes:**
  - the button is absent where `canWrite` or `canAuthorPresets` is false (the share view and the frozen view);
  - nothing is sent while a write is pending;
  - the capture contains no selection outline (compare against a capture with a selection);
  - Safari's WebP fallback;
  - the size bound.
- **Visual, Reading:** §3.4; frames 2A–2F in the mobile mockup; `browser-and-visual-qa.md`.
  Captures at 390 × 844 and 1440 × 900, sheet open and closed, in `ro` and `ru` (the longest leaf), with every overlap
  measured from the capture, never from a model.
- **Security reader (upload only), Reading:** this plan §3.3 (the image check), §3.4; ADR 0112 d6; ADR 0161; source:
  `capture-scene-image.ts`, `save-as-preset.tsx`, P3's `thumbnail-check.ts`. *The questions:* are the bytes the
  browser sends exactly what P3 checks? Is there a data URL in any log?
- **Combined reviewer (Light), Reading:** the full diff; `engineering-conventions.md`; ADR 0104 d1 and d7; ADR 0113.

### P5 — matching and adaptation (Full)

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S0** | Developer (domain), measurement | Instantiate each corner of the window (±600 on each wall, and ±601) for three owner-shaped fixtures (L, straight, U). Report what adaptation removes, what the refill adds, and how often the corner size differs. **Stop and report before S1 if a U case is not covered by Q-5's answer** | — | §3.5; ADR 0109 A2–A5, B, C, D; ADR 0110 N11.8; ADR 0132 d2; `corner-assembly-size.ts` |
| **S1** | Developer (domain) | (1) `preset/match-presets.ts`: shape and ±600 inclusive, the corner direction ignored (A2). (2) `preset/instantiate-preset.ts`: re-room, drop free-end columns (A3.1), drop rows above the ceiling (B), refill through `insertBody` with ADR 0167 (A3.2, Q-3). (3) `preset/evaluate-preset.ts`: one evaluation (d4), every-depth fit (C), the minimum kitchen, the declared changes, the order key (A4). (4) Exports | new `preset/match-presets.ts`, `instantiate-preset.ts`, `evaluate-preset.ts`; `configurator-domain/src/index.ts` | §3.5; ADR 0109 whole; ADR 0110 d2, d6, N11.8; ADR 0117 d6; ADR 0167; ADR 0076. Source: `generation/generate-kitchen.ts`, `free-end-fill.ts`, `commands/remove-placement.ts`, `commands/set-cabinet-depth.ts`, `corner-assembly-size.ts`, `validate-design.ts` |

- **QA Reading:** this plan §3.5, §6 P-10, P-11, P-15; ADR 0109 whole (A2–A5, B, C, D); ADR 0117 d6; ADR 0167;
  DEVELOPMENT-SPEC §9; `engineering-conventions.md`, *Coverage an adversarial pass owes*; source: the S1 diff,
  `corner-assembly-size.ts`, `commands/set-cabinet-depth.ts`.
- **QA owes:** the window as a property: shape equal and every wall within 600 means matched, else not, over random rooms
  (a scratch sweep under Q-1 = C, quoted; P5 adds no committed test). Also: never the sink, hob or a corner removed; zero findings
  at 600 and 700 on every shown evaluation; determinism.
- **Logic, Reading:** this plan §3.5; ADR 0109 whole; ADR 0117 d6; ADR 0110 N11.8; source: the S1 diff. *The
  question:* can adaptation re-derive a dropped body elsewhere (forbidden, 0117 d6)?
- **Clean-code, Reading:** the full diff; `engineering-conventions.md`; ADR 0102.

### P6 — the read routes (Full + security)

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (web server) | (1) `app/api/presets/route.ts` GET (§3.5). (2) `app/api/presets/[id]/image/route.ts` GET. (3) `lib/server/preset/preset-summary.ts`: row to wire, no design id, never hidden. (4) The reads limiter wired (fail open). (5) The 503 shape when the table is absent, which the client reads as *no presets* | new `app/api/presets/route.ts`; new `app/api/presets/[id]/image/route.ts`; new `lib/server/preset/preset-summary.ts`; `proxy.ts` only if the route list needs it (stop and report first) | §3.5; ADR 0112 d5 and Amendment A; ADR 0156 (reads fail open; pages counted in the interceptor); ADR 0161; ADR 0146. Source: `share/route.ts`, `rate-limit/judge-read-request.ts`, `security-headers.ts`, `proxy.ts` |

- **QA Reading:** this plan §3.5, §6 P-5, P-10, P-12; ADR 0112 d5 and Amendment A; ADR 0156; source: the diff,
  `share/route.ts`, `judge-read-request.ts`. *What QA owes:* a hidden row never listed; `shape=U` with no `c`; a
  non-integer, negative or overlong wall; the image's headers; cache behaviour; the table missing.
- **Security, Reading:** this plan §3.5, §3.7; ADR 0112 d5 and Amendment A, 0146 B2, 0156, 0161;
  `environments-and-resources.md`; source: the diff, `security-headers.ts`, `proxy.ts`. *The questions:* what does
  the list expose beyond what a card shows? Can a browser sniff the image as anything else? Can the image route serve
  anything but a stored image? Is a design id ever returned?
- **Logic and clean-code, one combined reviewer, Reading:** the diff; ADR 0109 A2, A4; `engineering-conventions.md`.
- **Note from the P1 security review (2026-10-18): the image's `max-age` must be short.** §3.5 gives the image route
  `Cache-Control: public, max-age=31536000, immutable`, on the premise that rows are insert-only. But the owner hides a
  preset by hand (runbook, *Hiding one preset*), and a hidden preset's image then stays at the CDN and in browsers for up
  to a year. P6 should choose a short `max-age` (the listing's 60 seconds is the precedent) with `stale-while-revalidate`
  at most that long, and drop `immutable`; the cost is one revalidation per card per minute. That amends §3.5's header
  list, which the scribe records. P6's own listing code must also read `PresetListing.unreadableCount` from the
  repository and log only that count when it is not zero (the repository keeps nothing of an unreadable row).

### P7 — Step 1 fetches and evaluates (Light)

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (UI) | (1) `room/use-presets.ts`: on *Continuă*, fetch, then evaluate in the generation lease, at most 8, with a timeout; any failure means none. (2) `use-generation.ts` and `room-screen.tsx`: 1D/1E inserted **before** the one entry call into composition (ADR 0131 §4); none means 1F exactly as today | new `room/use-presets.ts`; `room/use-generation.ts`; `room/room-screen.tsx` | §3.5, §3.6; ADR 0131 §4, 0111, 0127, 0110 d6, 0076, 0139. Source: `room/` (whole), `create-design.ts` |

- **QA Reading:** this plan §3.5 (*Fail open*, *Bounded on the phone*), §6 P-12; ADR 0076, 0110 d6, 0131 §4, 0139;
  DEVELOPMENT-SPEC §9, §10; source: the diff, `room/use-generation.ts`, `room/create-design.ts`. *What QA owes:* a
  route answering 500, timing out, or returning malformed JSON goes straight to 1F with no extra render of 1E; the
  lease is released on every path (ADR 0076's ledger); the time on the 390 × 844 profile, measured and quoted.
- **Reviewer (one, combined), Reading:** the diff; ADR 0076, 0111, 0131 §4; `engineering-conventions.md`.

### P8 — 1E cards with Preview, the carousel pop-up, Select (Light + visual; mobile-gated)

| Slice | Owner | Work | Production files | Reading |
| --- | --- | --- | --- | --- |
| **S1** | Developer (UI) | (1) `room/preset-list.tsx`: the 1E card as §3.6 revises the mockup. It has the image, name, counts, finish and handle, price and declared change, and **one *Previzualizează* control, with no *Folosește***. (2) `room/preset-carousel-dialog.tsx`: it opens on the tapped preset, slides in the list's order, has Previous and Next (disabled at the ends), swipe and arrow keys, a position *"n / N"*, lazy images (the slide on screen and its two neighbours), and focus trapped and returned. (3) Select on the slide on screen calls `createDesignCreationAttempt` with that slide's evaluated design and `presetId`, then opens the editor. (4) The CSS. (5) The leaves in `ro.json` and `ru.json` (Preview, Previous, Next, the position, Select) | new `room/preset-list.tsx`; new `room/preset-carousel-dialog.tsx`; `room/room.module.css`; `messages/ro.json`, `ru.json` | §3.6. ADR 0003 4b and its new amendment; ADR 0104 B and its new note; ADR 0109 d4, A3.3, A4, A5; ADR 0111; ADR 0113. DEVELOPMENT-SPEC §9, §10, §10.1. Frames 1D, 1E and D1E in both mockups, **read for the card's content and the chrome only; the CTA and the *"nu carusel"* note are superseded (§3.6)**. `browser-and-visual-qa.md` |

- **QA Reading:** this plan §3.6, §6 P-11, P-13, P-14; ADR 0003 4b (amended), ADR 0109 d4, A3.3, A4; ADR 0111;
  DEVELOPMENT-SPEC §9, §10.1, §12; source: the diff, `room/create-design.ts`, the editor's price function.
- **QA owes:**
  - the price on every slide equals the editor's after Select;
  - Select on slide *k* writes slide *k*'s design, never the opening slide's, including after Previous and Next and a
    swipe interrupted halfway;
  - Select twice makes one design (the attempt's one-row rule);
  - the preset row is unchanged after the copy is edited (read back);
  - one preset means no Previous or Next;
  - no card carries *Folosește* or selects on tap;
  - Escape and the close control return focus to the opening card;
  - at most three images are fetched at once.
- **Visual, Reading:** this plan §3.6; frames 1D, 1E and D1E in both mockups (with §3.6's departures); ADR 0104 B and
  its new note; DEVELOPMENT-SPEC §10, §10.1; `browser-and-visual-qa.md`. Captures at 390 × 844 and 1440 × 900, in
  `ro` and `ru`, with one, three and eight cards, an image missing, and the carousel on its first, a middle and its
  last slide.
- **Combined reviewer (Light), Reading:** the full diff; `engineering-conventions.md`; ADR 0113; ADR 0003 4b
  (amended).

### P9 — the owner's loop, and the close

- QA runs the loop: generate, adjust, save, regenerate in a room within the window, see the preset, Preview, Select,
  edit, and the preset is unchanged.
  - It runs on desktop and at 390 × 844, against a **fake** preset repository or the **test** database, **never
    preview's**: the role holds no `DELETE`, so a preset an e2e saved on preview would stay on its Step 1 (ADR 0151).
  - Under Q-1 = C it is committed as e2e (exception 4), and quoted.
- **Close:**
  - the M8C test audit (ADR 0152 Amendment A);
  - every acceptance criterion checked;
  - `STATUS.md`;
  - archive (WORKFLOW step 7).

---

## 6. Acceptance criteria

Each criterion names what must not happen, and its boundary.

**Fix 1 (F1)**

- **F-1. No free run-end opening ≥ `F`.** For every buildable room (L, straight, U; heights 2200–3900), the generated
  design, and the same design after `setCabinetDepth` to each declared depth, has **no member-less base-level
  opening of width ≥ `F`** on any free run.
  - Nor does it have a wall-row or top-row opening of width ≥ `F` over a placed body whose declared top is at or below
    1500.
  - **Two exceptions:** wall A of a large U at the wall and top rows; and the top row where `hasRoomForATopRow` is
    false.
  - The census fails naming the offending room. As a property it holds over random rooms.
- **F-2. Below the floor it stays bare.** A room whose remainder is `F − 1` has exactly that bare end at every level.
  At `F` it has a fill of `F` at every level its column carries.
  - Witnesses, which S0 measures: a straight 1400 (today it leaves `[1200, 1400]` bare [measured]) must gain a 200
    fill. A straight 1399 is expected to leave 199 bare [inf: the room was not in the 10 mm grid].
- **F-3. What must not happen:**
  - a fill narrower than `F`;
  - a fill in the 100 mm reserve (walls B, and C);
  - a fill over a full-height body;
  - a counted body moved (N3r 3, 10; §2.7), or any body moved other than the end group `G`, which moves by
    exactly `r` (D5);
  - a fill between two bodies of `G`, or beyond `G` where `G` is not empty;
  - a finding after `setCabinetDepth` to any declared depth;
  - a body past its wall (ADR 0065);
  - two ovens or none (E4);
  - a U without its hood (N3r 11).
- **F-4. Byte-identical where nothing is fillable.** Rooms whose remainder is under `F` after the absorbs give
  byte-identical designs and logs to HEAD, so O10 and E6 output is unchanged. U rooms N11.9 already fills from 300
  keep **the same placements by wall, along, `y0`, build id and width**. Their command order and placement ids may
  differ (D6).
- **F-5. The fill's geometry.**
  - Base, upper and top each span `[g, g + r]` where an end group moves, else `[runEnd − r, runEnd]`, at `y0` 0,
    1500 and 2200. Each body of `G` keeps its width and order and stands `+r` from its planned place, its outer
    face on `runEnd`.
  - A run read from its free end still reads A1's order in one direction. Witnesses: an L whose prefix wall ends
    with the fridge reads fridge, fill, then the rest; an L whose suffix ends in the block reads the rest, the fill,
    then the block.
  - The door count follows the width (§11 row 20). The top reads push-to-open by its slot (§11 row 13). The top is a
    `wall-cabinet` (§11 rows 4, 6).
  - No opening in the backsplash zone (§11 row 17). No floor space invented under a wall-only column (§11 row 18).
- **F-6. The `r` = 200 witnesses.** Every arm of D6's table at `r` = 200 and 201 generates without a throw, and every
  planned body ends at its planned width. That includes a sink inboard of the fridge, RQ17's lone U tower, and a
  `'fit'` base ending the run.
- **F-6a (F1a). Behaviour-free.** With the planned-boundary merge in place and no fill, the census is byte-identical
  to HEAD. The editor's merge is unchanged (ADR 0166 criteria 1, 2).
- **F-7. Replay and determinism.** `replayGenerationLog(log)` equals the design. The same input gives the same bytes.
- **F-8. The price** rises on the witness rooms by exactly the fill bodies' lines, quoted.
- **F-9. Visual.** The witness captures at 390 × 844 and 1440 × 900 show the fill's three bodies inboard of a moved
  fridge and of a moved tall block, a counted U fridge unmoved, and the run-end panel vetoed where the run
  reaches the wall.
- **F-10. Counted positions.** On U side walls of 3000, 3001, 4000 and 4001 mm, the fridge stands after 0, 2, 2 and
  3 door bases, and the far-wall tower likewise, exactly as at HEAD (N3r 3, 10). The witness is S0's.
- **DEVELOPMENT-SPEC §11 rows to add at close:**
  - 28: *"Generate a room whose run leaves 200–599 mm: one cabinet of exactly that width at base, wall and (≥ 2600)
    top, inboard of an end fridge or tall block, which stands at the wall's end"*;
  - 29: *"… leaves under 200 mm: it stays bare at every level"*;
  - 30: *"a large U's back wall: its base remainder is filled, its wall and top rows are not"*;
  - 31: *"a U fridge counted from the corner never moves for a fill"*.

**Fix 2 (P1–P9)**

- **P-1.** A save without the design's write token and visitor answers the byte-identical not-found response, and no
  row exists after.
- **P-2.** A cross-site save, an over-limit save (429; the limiter fails closed) and a stale revision (409) each
  leave no row.
- **P-3.** A stored design with **any** finding, or without a sink or a hob, is refused with its code. The owner sees
  the reason in `ro` and `ru`.
- **P-4.** The stored snapshot equals the stored document at the named revision, byte for byte. A body carrying a
  document changes nothing.
- **P-5.** The image is refused unless its magic bytes, type, size (≤ 512 KiB) and header dimensions agree. It is
  served with its stored type, `nosniff` and immutable caching, and the CSP admits it unchanged. It is captured from
  the preset's own design at the overview camera, which frames floor to ceiling (DEVELOPMENT-SPEC §13.3 q5, §6.4,
  §11 row 21): a card cannot promise a layout Select does not apply.
- **P-6.** The name is optional and stored once. Empty means the generated name renders in each locale (shape, walls,
  finish). A name over 80 characters, or holding a control or bidi-override character, is refused.
- **P-7.** `app_designs` holds exactly `SELECT, INSERT` on `presets`. Nothing goes through `PUBLIC`. The runbook's
  line is quoted per environment.
- **P-8.** The button is shown wherever the editor can write, in every environment, with no flag and no secret. It is
  absent in the share and frozen views. It overlaps nothing, measured on captures at 390 × 844 and 1440 × 900. It is
  one component in the layout shell, with a touch target of at least 44 px on the phone (DEVELOPMENT-SPEC §10.1).
- **P-9.** **The launch gate is red while the ungated policy is wired**: run, quoted.
- **P-10.** Step 1 shows a preset **iff** the shape is equal and every wall is within ±600 mm inclusive. 600 shows;
  601 does not. The corner direction is not a criterion. A hidden preset is never shown. A card is never shown that
  Select would refuse (DEVELOPMENT-SPEC §9, *Never offer what cannot be satisfied*; ADR 0109 d3).
- **P-11.** Every shown preset's evaluation has zero findings at every declared depth and holds a sink and a hob. Its
  card declares every change. Its price equals the editor's after Select, because both derive from the same
  placements (DEVELOPMENT-SPEC §12, *Price: derive from `placements`*).
- **P-12.** If the route fails, times out, the table is missing or nothing fits, Step 1 composes exactly as today,
  with no error shown. The flow is 1D, then 1E or 1F (DEVELOPMENT-SPEC §10). No dead end and no refusal reach the
  customer (§9).
- **P-13.** A card carries Preview only. Preview opens a carousel of the list's presets, in the list's order,
  starting at the tapped one. Each slide has the stored image (no live 3D), Previous and Next (disabled at the ends,
  absent for one preset, at least 44 px, §10.1), the position, and Select. Escape closes it and focus returns.
  ADR 0003 4b is amended, not ignored.
- **P-14.** Select on the slide on screen creates one new design (`presetId` set, DEVELOPMENT-SPEC §12; the document
  equal to **that slide's** evaluation, ADR 0109 d4) and opens it in the editor. The preset row is byte-identical
  after the copy is edited.
- **P-15.** The order is: no change, then fewer removed, then newest.
- **P-16 (P2).** The presets export runs apart from the designs export, on its own prefix. The image round-trips.
- **P-17 (P9).** The owner's loop passes on desktop and at 390 × 844 with no row written to preview or production.

## 7. Risks

1. **Composition's merge at `r` = 200** (D6). Under (b) it is reachable in two arms: a non-door `'fit'` body inboard
   of the fridge, and RQ17's lone U tower. M-1 (F1a) removes it if S0 finds no planned-pair merge at HEAD. Otherwise
   F1a is withdrawn and M-2 is built in F1b. Either way it is witnessed by F-6.
2. **The fridge and the tall block move** by up to 599 mm in many rooms (D5). Every room the §2.1 census counts with
   an uncounted fridge or block at its end and `r ≥ F` changes its layout, not only gains a cabinet. QA's diff must
   show that each change is exactly that move, and nothing else (F-3, F-5).
3. **The long-wall reading** (§2.7) is the architect's, from the owner's *"there is already a special rule"*. If the
   owner meant something else, D5's exception moves, and F1b's S1 must stop for it.
4. **Test churn hides a real defect.** Mitigated: each updated assertion carries its reason (§4), and S2 reports any
   red not explained by D1 instead of updating it.
5. **The price rises** about one cabinet column per filled wall. The owner asked for it, and the placeholder prices
   are unchanged.
6. **Ungated authoring on a reachable URL.** A Vercel deployment answers anyone who has its address [inf]. Accepted,
   time-boxed, and made falsifiable by P-9's launch-gate refusal.
7. **Production order.** `0009`, `0010` and `0011`, their grants, then the deploy (§3.2). Code before `0011` fails
   open on Step 1 and answers a save with an unavailable refusal. Code before `0010` breaks unknown share tokens
   (500).
8. **Presets are not backed up until P2.** Neon's PITR is 6 hours (milestones README). The library is owner work.
9. **Tests writing presets on preview** cannot clean up (no `DELETE`). Fake repository or test database only (P9).
10. **Capture differences:** iOS Safari's WebP encode and canvas size limits. Covered by the fallback and the size
   bound, checked on a real phone at the owner's hand check [inf].
11. **The phone's cost** of evaluating up to 8 adaptations, and of the carousel's full-size images. Both are bounded
    (8 candidates; 3 images at a time) and measured in P7 and P8 [inf].
12. **U adaptation at the back wall's right end** (Q-5) moves the right corner and wall C. The corner may be sized
    differently in the target room. Both are measured in P5 S0, and the rule of §3.5 step 6 holds: a corner sized
    differently means the preset is not shown.

## 8. Verification method

- **Gates, run by the coordinator and quoted** (`rtk proxy`, R9):
  - `pnpm --filter @lemnaria/configurator-domain test`;
  - the web, three-adapter and persistence suites;
  - e2e alone (a contention suspect first);
  - `pnpm format:check` whole-tree last;
  - `pnpm check` on the commit that closes the milestone;
  - `pnpm ci:local` on a clean tree before any push (R8);
  - `pnpm gate:launch-placeholders`, expected **red**, now for two reasons (Q3 and P-9).
- **Measurements:** §2.1's census re-run at F1a's base, after F1a (byte-identical) and after F1b, each diffed.
  The planned-pair merge count at HEAD (F1a S0). P5 S0's window measurement. Each quoted with
  its command and commit.
- **Database proof:** the owner's runbook run for `0011`, with the line `reached database "…" as role "app_designs"`
  quoted for preview and production.
- **Visual:** captures, never computed geometry (WORKFLOW, *Working conventions*). Then the owner's real-phone check
  of P4 and P8.

## 9. Owner-side steps

1. ~~Answer the open questions.~~ **All answered, 2026-10-17** (§10).
2. Approve the drafted copy of P4 and P8 (Romanian; the Russian re-signed).
3. **Before authoring (the checkpoint):**
   - apply `0009`, `0010`, `0011` and their grants, preview then production, per the runbook;
   - check the variables the editor's save path reads on Production (`DIGEST_SECRET`, `CLIENT_NETWORK_SOURCE`),
     add-only, never printed;
   - deploy the branch to production (Q-4);
   - author presets on the production URL, after F1b is deployed, so they carry the filled ends.
4. Hide a preset, when wanted, by the runbook's procedure.
5. At launch (M9): the ungated policy is removed or replaced by `preset.create`, so the launch gate turns green on
   that line.

## 10. Open questions for the owner

### Answered, 2026-10-17 [relayed by the coordinator]

| Question | Answer | Where it lands |
| --- | --- | --- |
| Q-1, the tests | **C** | §4; ADR 0168 |
| Q-2, where the fill stands | **(b), "between"**, *"only exception on very long walls, there is already a special rule"* | D5, D6, §2.7 |
| Q-3, the refill in an adapted preset | **Every free end, the generator's rule, every level** | §3.5 step 4; ADR 0109 Amendment E |
| Q-4, authoring on production | **Yes: deploy to production and author there** | §3.1; §9 |
| Q-5, a U preset whose back wall differs | **The back wall's right end is its free end** | §3.5 step 7 |
| Q-6, the card | **Changed:** the card has Preview only; Preview opens a carousel of the matching presets with Previous, Next and Select, which copies the preset and opens the editor | §3.6; P8; ADR 0003 4b amendment |
| Q-7, the fill on a long U side wall (a fridge or far-wall tower counted from the corner, tall pantries outboard of it) | **The default, (a): between the counted body and the pantries; the pantries move to the wall's end.** Measured population [the coarse U grid, 300–599 mm left beyond a pantry]: 116 walls on B and 124 on C under 10 m, 685 and 583 at 10 m or more. Where nothing stands beyond the counted body, the fill takes the wall's end | D5; §2.7; F-5, F-10 |
| Q-8, "or the hob" | **No new rule.** *"let's not introduce this change with cabinets 2-3 between hob and fridge, let it be like it is now, I will create presets and you will learn from those presets; this is the best approach, for now let's continue without this change."* | §2.7; §11a. No wave F2 |

### Still open

**None.** Every owner question is answered (the table above).

### Readings this plan builds, reported for information and not asked

Each follows your words, the brief or a later dated ruling. Say so if one is not what you meant.

- **The long-wall exception is your existing counted rule** (§2.7), on every U side wall where it counts the fridge
  or the tower from the corner. That starts above **3000 mm** (2 cabinets) and gives 3 above 4000 mm.
  - The wall that counts is the **entered** wall length, counted from where the corner piece ends, in 600 mm door
    cabinets on the fridge wall.
  - On the far wall, bodies that came round the corner count as cabinets whatever their width.
  - Your sentence about 4 m matches this rule, so **the fridge and tower part needs no change**.
  - **The L has no such rule**, so on every L wall and every straight kitchen the cabinet goes between the run and
    the fridge or tall cabinets, which move to the wall's end.
- **The narrowest gap that gets a cabinet is 200 mm**, the catalogue's narrowest cabinet (Q-F1-1). This supersedes
  your 2026-09-29 *"Fill from 300 mm"* (RQ25b), which was for a U's back wall alone. The L grid has 2 858 openings
  of 200–299 mm that this fills.
- **Above a full-height body nothing changes:** the 700 mm space above the fridge, and the 400 mm top slot above tall
  columns. These are now the most common top-level gaps: in the L grid, 8 816 above fridges, 6 426 above towers and
  8 750 above pantries.
- **The U's back-wall exception is the code's**: only a U whose walls total 10 m or more. Its back wall's base
  remainder is filled and its upper rows stay empty. A smaller U's back wall gets cabinets at every level.
- **The presets backup (P2) is built before you author**, as ADR 0112 decided. Neon keeps only 6 hours of history.
- **The carousel has no wrap-around**, and shows no Previous or Next for a single preset.

## 11. What this plan does not do

- **The hob is not counted from the corner** (Q-8 = no). Generation's placement rules are unchanged beyond Fix 1.

- Fix 3, `preset.create`, accounts, editing or reordering presets, the admin panel.
- A filler or end panel.
- Windows and doors.
- Any change to stored designs.
- M8's open items (§0).

## 11a. Follow-ups, not waves

- **Learning placement rules from the owner's presets** (owner, 2026-10-17, Q-8). The owner's words: *"I will create
  presets and you will learn from those presets"*.
  - This is consistent with ADR 0117 d3: taste enters through presets, and a judgement call does not become a
    generator rule on its own.
  - **Trigger:** the owner's library holds enough presets of one shape to compare against what generation produces
    for the same rooms.
  - **Then:** an architect's measurement of where the owner's presets place the hob, the fridge and the tower
    against generation's output for the same rooms. Each candidate rule goes to the owner as a question, and becomes a
    dated ADR only on his ruling.
  - Nothing is built for this in M8C, and nothing is recorded here as a rule. ADR 0118's form applies: recorded with
    its trigger, not built for.

## 12. For the scribe (not done here)

- F0, writing:
  - ADR 0167 (*Proposed*) from §2.6, with D5's (b), D6's M-1 and its M-2 fallback, and §2.7;
  - ADR 0112 Amendment A from §3.7, recording Q-4's production authoring with its date;
  - ADR 0109 Amendment E (Q-3 and Q-5 answered);
  - **ADR 0003 4b, a dated amendment** (Q-6: a carousel pop-up; no *Folosește*);
  - the ADR 0104 note on frame 1E;
  - ADR 0168 (Q-1 = C);
  - the dated notes listed in §2.5, including E8, E12.1 and ADR 0166 d4.
- The owner's two sentences of 2026-10-17 on Q-2, and his Q-8 answer, quoted verbatim in ADR 0167. Q-8 = no is
  recorded there, with §11a's follow-up and its trigger. Q-7 = (a) is recorded there as the owner's ruling.
- `milestones/README.md`: an M8C row, ordered before M8B by the owner's ruling. Also add the M7C row its table lacks
  (`M7C-m7-feedback-fixes.md` exists).
- `M9-delivery-preparation.md` and the M8 plan's *Launch gate*: the line *"the ungated save-as-preset policy is
  removed or replaced by `preset.create`; the launch gate checks it"*.
- `STATUS.md`: M8C planned, no owner question open; *What to do next* names F0, then F1a (§5, *Order and first
  dispatch*).
- `OWNER_FIXES.md` is the owner's record and is not edited. Its sentence on the presets backup (§3.1) is corrected
  here, not there.
