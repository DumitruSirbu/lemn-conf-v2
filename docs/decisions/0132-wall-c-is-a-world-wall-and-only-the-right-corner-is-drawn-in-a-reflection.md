# ADR 0132 — Wall C is a world wall, and only the right corner is drawn in a reflection

Status: Accepted — M7B wave U0's logic review, 2026-09-29 (no blockers). **Amendment A, 2026-09-29:**
a U's side-wall presets cut away the run their eye stands in, and its overview looks in from the open
side on the centre line (U4 QA). **A8, 2026-09-29:** A2's run bound withdrawn; the cutaway survives a sync; Q-U4-cam answered "Hide them"; D14 owed by U5's close
Date: 2026-09-29
Type: Finding + Decision (architect), on owner rulings of 2026-09-29 relayed by the coordinator
Milestone: M7B, wave U0 (`docs/milestones/M7B-u-shaped-rooms.md`, *Wave U0*, *U0 census*, *U0
measurements*)

**How to read the citations.** Source lines are read at `dd9f63a` (branch `m7-room-and-presets`),
where no production file differs from `5fbcad7`, the commit the M7B plan was read at. Every
load-bearing claim is labelled **[doc-quoted]**, **[source-verified]** (read or `git grep`ped at
`dd9f63a`), **[measured]** (by `u0-census.sh` or `u0-measure.mjs`, which are kept in the U0
scratchpad by name, against a `tsc` build of `packages/configurator-domain/src` at `dd9f63a`), or
**[inference]**. An inference always says what would falsify it.

## Context

The M7B plan proposed D1–D17 and left several of them to this record. The main one was D2: how wall C,
the third wall a U adds, is represented. The plan's lead hypothesis was **β**. Under β, a wall-C
placement is recorded in the frame its mirror twin on wall B would have, and the reflection in
`x = W/2` happens in one domain projection and in one reflected adapter group. The alternative was
**α**: wall C gets its own world transform at `x = W`, with fronts facing −X. The plan picked β as its
starting point for two reasons. The recorded doctrine points at it (ADR 0129 D1: the domain is
canonical and the mirror is presentation). And β looked cheaper because *"nothing keyed on +along
forks"* [doc-quoted, plan D2].

**The owner rejected β's premise on 2026-09-29, answering Q-U5.** Verbatim, relayed by the
coordinator:

> *"In U shape is not like the left and right are mirrored only the corner cabinets, the rest should
> be independent one from another (as mentioned on one wall will be frodge on another no)"*

So only the right-hand corner is the left corner's mirror image. Every other wall-C cabinet is laid out
on its own terms (ADR 0110 Amendment N) and drawn as built: true hinge sides, true handle sides and
true appliance controls.

The owner also answered **Q-U4** the same day with **(b): hide the corner-direction toggle for a U**.
The ruling is recorded in [ADR 0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md)
Amendment C, because it departs from frame 1B's note. What it means for the engine is recorded here, in
decision 8.

## Decision-record sweep

| Record | What it says | Effect here |
| --- | --- | --- |
| [0129](0129-a-right-hand-l-is-the-left-hand-design-drawn-in-a-reflection-and-the-reflection-is-a-per-group-primitive.md) D1, D4, D5, Amendment (a) | The domain is canonical and the mirror is presentation. One primitive, on a `Group` only. Face winding is left to the renderer. The selection outline is `DoubleSide`. | **Kept.** D1's *"canonical"* was about **a right-hand L**, and it is untouched (decision 3). The right corner uses D4's primitive on groups (decision 2). |
| 0129, *Alternatives considered* | *"Reflect about the room's centre line. Rejected: the plane moves with every resize"*; *"whether a right corner becomes walls A + C is M7B's question"* | **The plan's D4 fell into the rejected alternative.** D4 proposed one group reflected in `x = W/2`, and that is the same plane. Decision 2 reflects each piece about its own origin instead. The deferred question is **answered: no** (decision 3). |
| [0130](0130-a-straight-kitchen-is-the-composers-run-on-one-wall-with-no-corner.md) D3 | A wall that a shape lacks has run 0, and a stray body on it is marked, not refused | **Extended to wall C** (decision 5). |
| [0116](0116-a-type-that-refuses-an-undesigned-shape-is-a-guard-and-the-cast-that-witnesses-it-is-confined-to-a-test.md) decision 1 + A2 | A type widens in the wave that designs the shape. The `U` casts name M7B. | Unchanged: U2 widens the type and U6 removes the casts. |
| [0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) A, D2 | The corner is sized to the room as a ceiling and never a target. No panel at a run's end. | Applied to both corners (decisions 4 and 7). |
| [0121](0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md) | Identify a thing by what it is | `cornerOf` is a domain query. The adapter never compares positions (decision 2). |
| [0125](0125-the-corner-minima-stay-at-900-and-1000-as-a-deliberate-margin-above-what-the-engine-needs.md) | The approved 900 / 1000 sit above the engine's 880 / 880 | Decision 4 finds that a **U's** engine floor on wall A is not 2 × 880. |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment H | The U's bounds, walkway and minimum kitchen | This record's figures feed it. The bounds themselves are decided there, not here. |
| [0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md) Amendment N | How a U is composed | This record decides representation only. Composition is decided in N. |
| [0104](0104-the-mockups-are-the-chrome-specification-and-the-strips-own-row-is-withdrawn.md) Amendment C | Q-U4: the toggle is hidden for a U | its engine consequences are decision 8 here. |
| M7B plan D1–D17 | The architect's proposals | Each one is settled below and corrected in the plan by a dated line. |

## Decision

### 1. Wall C is a world wall (α). The census is why.

A wall-C placement's `alongMm` is measured from the A∩C corner. **In world space that is `+z`, the
same direction wall B's along runs** [source-verified: `room-transforms.ts:40-47` gives wall B tangent
`(0,0,1)`]. Wall C's transform has origin `(W, 0, 0)`, tangent `+Z`, front normal `−X` and yaw `−π/2`.
A wall-C frame is a world frame, exactly as wall A's and wall B's are.

**The measured census (`M7B-u-shaped-rooms.md`, *U0 census*, 41 rows over 55 files):**

| Cost | Rows | What they are |
| --- | --- | --- |
| A wall-C or U arm is owed **under either representation** | 22 | Schema and shape dispatch, column keys, the corner-taking set, both corners, depth change, validation, shell, cameras, web and copy |
| No change under either | 8 | Along-only readers (**10 expressions** of the form `wall === "A" ? x : z`; wall C falls into the `z` arm, which is correct under both), type positions, typed camera-id consumers, fixtures, and 7 false `rotated` hits |
| **α only** | 6 | The wall-C transform needs `W` (`room-transforms.ts`) and its three callers: `void-engine.ts:567` (placements), `:1131` (restored empty columns) and `frozen-map-at-cabinet-depth.ts:510`. Plus `originOnWall` (`void-engine.ts:644-651`) and the per-piece corner wrapper in `scene-sync.ts` |
| **β only** | 6 rows, 7 changes | The canonical→world projection function. Wall-C bodies inside a reflected group (`scene-sync.ts`) **plus an un-mirroring wrapper per body to satisfy Q-U5**. `void-mesh.ts`, `overflow-mark.ts`, `selection-outline.ts` and `picking.ts` inside the reflected group |

**The four cost rows sum to 42 against 41 census rows**, because U26 (`scene-sync.ts`) is counted once as α-only and once as β-only: it is one site with a different change under each. (Noted on U0's logic review, 2026-09-29.) **[measured]** for the rows and counts. The headline grep counts (`u0-census.sh` at `dd9f63a`) are:
`"[ABC]"` 96 lines in 22 files; `DesignWall` 85 in 18; `WallId` 7 in 2; `rotated` 13 in 8 (7 of them
false); shape literals `"(L|linear|U)"` 52 in 19; `RoomShape` 46 in 9; `cornerDirection` 50 in 12;
`WALL_THE_CORNER_IS_TAKEN_FROM` 8 in 3; `wallLengthMm` 24 in 11; `\.depthMm` 27 in 13; camera ids
67 in 12; `CameraPresetId` 13 in 4.

**Why α, when the counts are close to a tie.** The counts are 6 against 6–7. The counts alone do not
decide it, and this record does not pretend they do. Five reasons do decide it:

1. **The plan's case for β is refuted by the census.** β's advantage was that the column, void, fit,
   width, merge, frozen-map and depth-chain algebra reads wall C as it reads wall B. Under α that is
   **equally true**. Wall C's along runs `+z` from its corner, as wall B's does, so every along-keyed
   site is unchanged under both (the 10 along-only expressions above) [measured]. The plan listed
   *"occupied depth, corner overlap, chain shift"* as α forks. The census places occupied depth in
   neither column, because it is a distance and not a coordinate. It places corner overlap and chain
   shift in **both** columns, because each needs a wall-C arm whatever the representation.
2. **Q-U5 turns β into two reflections that cancel.** Under β, every wall-C body passes through the
   reflected group and then, for the owner, back through its own un-mirroring wrapper. Its world
   placement is then exactly α's. A reflection conjugated with `S` turns `R(θ)` into `R(−θ)`, so
   `S·R(π/2)·S = R(−π/2)` [inference; falsified by a U4 test comparing the two matrices]. That is two
   transforms whose only job is to undo each other, on every wall-C body.
3. **β reflects about a plane that moves with the room.** A group reflected in `x = W/2` is ADR 0129's
   rejected *"reflect about the room's centre line"*, for the same reason it was rejected: 7H's
   in-place resize would have to keep it in step [doc-quoted, ADR 0129 *Alternatives*].
4. **β carries a hazard α does not.** The plan's R2 is a canonical wall-C frame read as a world
   coordinate. Under α no such frame exists.
5. **α's forks are all in the domain**, where U1's properties and sabotage reach them. β's extra forks
   are all in the adapter, which is the 7I class: in wave 7I a mirrored scene painted **0 red outline
   pixels** that no mesh assertion caught [doc-quoted, ADR 0129 Amendment (a)].

### 2. The right corner is the left corner, each piece mirrored about its own origin

The right corner has the same four build ids as the left (`base-corner-x-900`,
`base-corner-return-320`, `wall-corner-return-570`, `wall-corner-return-570-top`). They are structural,
priced as today, and have no new catalogue entry. **The domain places them in world frames under
decision 1.** The X-leg sits on wall A, centred at `W − w/2`. The three returns sit on wall C, at the
along values the corner rule gives for the L room `(W, C)` [source-verified: `corner-assembly-size.ts`
takes a room and a wall and nothing else].

**The adapter draws each of the four inside its own wrapper `Group`, mirrored with
`applyCornerDirection`.** That is a reflection in the wrapper's local X about the piece's own origin.
Because the plane is each piece's own centre, it does not move with the room. That is ADR 0129 D4's
*"on one group … it mirrors that group alone"*, used for four groups.

- It is equivalent to reflecting the left corner in `x = W/2`: `S·R(θ) = R(−θ)·S`, and the piece is
  centred on its frame origin along its width [inference; **falsified** if a corner builder is not
  centred in local X. U4-A1's real probe checks the footprint].
- **Which corner a piece belongs to is a domain query**, `cornerOf(placement, room)` (ADR 0121). The
  adapter reads the answer and never compares positions.
- **The U has no right-hand variant** (decision 8). So the four right-corner pieces are the only
  bodies with a negative world determinant in any U. The outline's `DoubleSide` exception (ADR 0129
  Amendment (a)) already covers them, and **no body material gains `DoubleSide`**.

### 3. A right-hand L stays a reflected left L

This is the plan's D3, confirmed. The right-hand L is not re-expressed as walls A + C: there is no
migration arm, and every stored right-hand document stays byte-identical. This answers the question
ADR 0129 left to M7B.

### 4. The odd millimetre needs no rule, and the U's engine floor on wall A is 1800, not 1760

This finding supersedes the plan's D5.

- **The plan's premise is false** [measured, M2: the engine U range, A 1760–6000 at 1 mm, four side
  lengths, both depths, 16 964 rooms per depth]. It reported **0** half-millimetre right-X-leg centres.
  The corner rule builds every width even (`corner-assembly-size.ts:137-156`, *"largest even
  whole-millimetre width"*), so `W − w/2` is whole for every whole `W`. For an odd `W`, the odd
  millimetre falls in **wall A's free run between the two X-legs** (8 480 of 16 964 rooms have an odd
  free run). That is the same class as an odd L's wall-A run, which the shell already tiles to the
  greatest reachable whole-millimetre end (ADR 0110 *Correction — 2026-09-13* [doc-quoted]).
- **The two X-legs overlap below A = 1800** [measured: 160 of 16 964 rooms per depth, all in A
  1760–1799, minimum free run −40]. Each X-leg's ceiling is the whole of wall A
  (`widthInRoomMm`, `:144-156`), so both reach 900 whenever A ≥ 900. **`ENGINE_ROOM_LIMITS.U.wallA.min`
  is derived as the sum of the two X-legs' reference widths (1800), not as twice the narrowest reach
  (1760).** *Rejected:* capping each X-leg at `A/2`. That is a new sizing rule, and no approved room
  could reach it: the walkway puts wall A's approved floor at 2696 or above (ADR 0108 H).

### 5. Wall lengths and walls per shape: the plan's D6 and D7, confirmed

`wallLengthMm("C")` is `wallCMm` for a U and `0` for an L or a straight room. A wall-C body in a
document with no wall C is marked, not refused. `wallsOf(shape)` returns exactly `[A]`, `[A, B]` or
`[A, B, C]`, and `requiredFieldsFor` and the plan preview derive from it (backlog 76).

### 6. The stored U: the plan's D1 and D8, confirmed, with one refinement from decision 8

A U room is `{ shape: "U", widthMm, depthMm, wallCMm, heightMm }`. **The key is `wallCMm`**, matching
the URL's `wallC` field and the `room.wallLabel.wallC` leaf [source-verified, G11]. `wallCMm` is present
**iff** the shape is U. **A U carries no `cornerDirection: "right"`**: the schema refuses it on a U,
because the product never writes one (decision 8). `"left"` and absence stay valid, since refusing a
truthful `"left"` is what ADR 0129 rejected. No schema version is needed (ADR 0053).
`DesignWallSchema` gains `"C"`. The storage bounds are re-derived for three runs (D8, U1 S2), not
chosen.

### 7. The rest of the plan's D-rows, settled

- **D9 (depth change): confirmed.** `WALL_THE_CORNER_IS_TAKEN_FROM` becomes the shape's set of
  corner-taking walls: `{B}` for an L and `{B, C}` for a U. Wall C's chain slides by what wall B's
  would slide in the room with B and C swapped. Corner widths stay frozen, and the 30 mm top-row
  residue stays open (ADR 0089).
- **D10 (bounds across the room): confirmed with one change.** A wall-B or wall-C body's reach across
  the room is bounded by wall A's run. A wall-A body's reach is bounded by the drawn floor's depth,
  `max(B, C)`. `reachesPastRoomAcrossWall`'s wall-A arm therefore reads `max(B, C)` for a U; its
  non-A arm is already correct for C [source-verified, `validate-design.ts:617-625`].
  `findCornerOverlaps` gains the A∩C corner, where it reads wall A's along as `W − alongMm`. The two
  side runs are never corner partners. **The walkway is a room rule, not a design-validation rule**
  (ADR 0108 H).
- **D11 (no run-end panel): confirmed.** It carries its ADR 0118 trigger: the owner objects on seeing a
  U.
- **D12 (shell): confirmed.** Wall C's plane is at `x = W`. The floor depth is `max(B, C)` plus the
  overhang, the backsplash is on wall A only, and the drawn-room signature includes the shape and
  `wallCMm`.
- **D13 (cameras): confirmed.** A U offers `overview`, `wallA`, `wallB` and `wallC`, and `wallC` is
  computed per room.
- **D14 (lights): left open, as planned.** U4's captures decide it, and the choice is recorded here by
  a dated line. **2026-09-30: keep the rig; see Amendment B.**
- **D15 (screen words): re-predicted.** A U is always left-hand (decision 8). Wall C's `+along`
  (`+z`) projects screen-right through a camera looking `+X` [inference: `(1,0,0) × (0,1,0) = (0,0,1)`].
  So wall C's side words **do not cross** in any U. **Falsified** by U5-A5's projection test, which
  remains the authority.
- **D17 (composition): moved to ADR 0110 Amendment N.**

### 8. What hiding the toggle means for the engine (Q-U4 (b); the ruling is at ADR 0104 C)

- **No right-hand U exists.** Step 1 shows no toggle for a U. The URL's `direction` is neither written
  nor read for a U (U5 S1). `validateRoomInput` returns a U with no `cornerDirection`.
  `cornerDirectionOf` already answers `"left"` for any shape but L [source-verified, G6].
- **The plan preview does not mirror a U.** The shipped preview mirrors a whole U for `right` (G11). A
  `direction=right` URL with shape U is read as left. That is a U5 criterion.
- **The plan's *"reflection parity"* row collapses to one case.** Wall-C bodies have determinant +1.
  The four right-corner pieces have −1 (decision 2). No U is drawn under a root reflection.

## Alternatives considered

- **β, the plan's hypothesis.** Rejected on decision 1's five reasons. The owner's Q-U5 removes its
  only structural benefit, and the census shows the along algebra is shared under α too.
- **One right-corner group reflected in `x = W/2`** (the plan's D4). Rejected: it is ADR 0129's
  rejected room-centre plane.
- **A group at `x = W` with `scale.x = −1`, holding the left corner's canonical coordinates.** This
  gives the right placement with a plane that tracks wall C. Rejected: it needs canonical coordinates
  for the right corner, which is a second representation of four placements that decision 1 stores as
  world frames.
- **Drawing the right-corner pieces unmirrored.** Rejected: the owner said *"only the corner cabinets"*
  are mirrored, and an unmirrored X-leg puts its blind span at the wrong end of wall A.
- **Capping each X-leg at `A/2`.** Rejected in decision 4.
- **Keeping the toggle for a U** (Q-U4 (a) or (c)). Rejected by the owner (ADR 0104 C).

## Consequences

- **U1 S3's file list gains `frozen-map-at-cabinet-depth.ts`** (an α-only census row the plan did not
  list), and its item (2) reads *"wall-C world frames (α)"*. U1-A6's mirror property stays, over
  validation and voids only. It is not over composition, because the owner ruled the walls independent.
- **U4 S2 shrinks.** `void-mesh.ts` and `overflow-mark.ts` leave its list. `scene-sync.ts` gains the
  per-piece corner wrapper. `picking.ts` and `selection-outline.ts` are verified against a negative
  determinant on the four corner pieces only.
- **U2 S2's derived engine floor on wall A is 1800** (decision 4).
- ADR 0129 gains a pointer: its deferred question is answered here.
- **Trigger** (ADR 0118): the owner objects to the right corner's mirrored pieces on seeing a U. The
  remedy is then an unmirrored build of those four pieces, an adapter change only.

## Amendment A — 2026-09-29: a U's cameras. The side-wall presets cut away the run they stand in, and the overview looks in from the open side

**Why this amendment exists.** U4's adversarial QA returned **RED** at `e223e44`:
`packages/three-adapter/tests/qa-u4-preset-eye-in-the-u.adversarial.test.ts` has 17 tests, and 7 of
them fail. The architect ran it at `458cbaa`, through `rtk proxy npx vitest run`, and got the same
7 failures. The file is QA's, uncommitted.

**What QA found.** The `wallB` preset's eye stands where a U's wall C and its cabinets are, and
`wallC`'s eye stands in wall B's run the same way. In a 3000 × 3000 × 3000 U, a click from `wallB`
aimed at wall B's top-row body selects a wall-C cabinet instead.

The architect's own measurements use `cameraPresetsForRoom` from the adapter's `dist/` build (built
by the pre-commit hook at `458cbaa`, from source unchanged since `b3c9e10`). They cover
**88 434** rooms: A 2700–6000, B and C 1000–6000, step 100. Scripts: the session scratchpad's
`u4/eyes.mjs` and `u4/overview.mjs`, run with `rtk proxy node`.

Claims are labelled *doc-quoted*, *source-verified* (at `458cbaa`), *measured*, *derived*, or
*inference*.

### A1 — the defect, and a second one QA's sweep did not reach

- *Source-verified.* The preset distance has no room term. `PRESET_DISTANCE_M` is
  `(KITCHEN_TOP_M / 2 / tan 22.5°) × 1.35` = 4.237 m (`stage.ts:314-315`). Along the reference
  `wallB` direction (0.979, 0.170, 0.110), that puts the eye at x = 4.149 m whatever the room is.
  `wallC` is its reflection, at x = W − 4.149.
- *Measured.* The `wallB` eye stands **behind wall C's plane**, within C's run, in **29 265**
  rooms. It stands **inside wall C's body zone** (the deepest floor body, 742 mm at depth 600, plus
  7H's 50 mm clearance) in another **15 608**. `wallC` mirrors both figures.
- *Measured, a second defect QA did not test.* The U overview keeps the L's viewing direction,
  which looks in from the +x, +z quadrant. An L is open on both of those sides; a U is open on +z
  only. So the overview's eye stands at x = W/2 + 2.095, and **wall C's base fronts face away from
  it in 72 828 rooms** (its upper fronts in 57 222). The customer sees the backs and ends of wall C's
  cabinets. The overview "passes" QA's test only because QA asked where the eye stands, not which
  way the fronts face.
- *Measured, what the overview shows horizontally.* On a coarser sample of 5 292 rooms, at
  390 × 844, the current overview leaves wall A's middle off screen in 3 264 rooms, wall C's middle
  in all 5 292, and wall B's in 4 511.

### A2 — the rule for the side-wall presets: keep the distance, and cut away the run the eye stands in

**Ruling.** A U's `wallB` and `wallC` presets keep the kitchen-derived distance and the reference
direction, unchanged. The fix is a cutaway:

- **Which runs are cut away.** In a U, any wall whose **body zone** the camera's eye stands in or
  behind, within that wall's run, is cut away. The body zone is the deepest floor body the
  catalogue builds at the design's cabinet depth (`occupiedDepthOfEntryM`, ADR 0108 H2's measure),
  plus 7H's 50 mm clearance.
- **What "cut away" means.** That run's bodies, voids, overflow marks and outline are **not drawn
  and not pickable** for as long as the eye is there.
- **It reads where the camera is, not which preset it is,** so an orbit gets the same answer as a
  preset. The configure screen's `OrbitControls` are unconstrained (`kitchen-canvas.tsx:54`,
  source-verified), which is why this matters.
- **An L and a straight room never cut anything away.**

*The evidence:*

- *Doc-quoted.*
  - §11 row 21: *"Top row reachable from all 3 camera presets | projects well inside the
    viewport"*. "Reachable" is a click, so occlusion counts.
  - §6.4: *"all must frame floor to ceiling or the top row becomes unclickable"*.
  - D13: *"§11 row 21 holds from all four"*.
- *Source-verified.* The distance carries no room term on purpose (`stage.ts:304-312`): *"A distance
  derived from the room's length would pull back as the wall grew and take the row with it"*. Keeping
  the distance keeps row 21's pixel budget exactly as the L has it.
- *Source-verified: where 7H's rule comes from, and what it is for.* The eye-in-the-room rule is a
  test's statement (the header of `qa-7h-preset-stands-clear.adversarial.test.ts`). No ADR records
  it. Its stated purpose is that the customer never sees *"the inside of a carcass"* or looks at the
  back of a wall, and that nothing stands between the eye and its subject.
  - The cutaway meets that purpose: the only run the eye could be inside, or look through, is not
    drawn.
  - The rule is therefore **restated for a U**: *no drawn body contains the eye or stands between
    the eye and its subject*. An L's presets keep the literal form, since they never stand in a run.

*The alternatives, refused:*

- **(b) Clamp the eye inside the walkway.** *Derived from the constants above.* In a 2700 mm U, the
  eye can stand at most x = 1.908 m, that is 1.948 m from wall B. At 45° vertical, the frame there is
  1.61 m tall and, at 390 × 844, 0.75 m wide. Centred at 1.3 m, it runs 0.49–2.11 m, so **the top
  row (2.2–2.6 m) is out of frame** and row 21 breaks. Raising the target loses the base row instead.
- **(c) Look in obliquely from the U's open side.** *Inference.* The fridge wall's free end carries
  tall pantries at every size (ADR 0110 *N3 revised* 4), and the far wall often carries the tower.
  From the open side, those columns stand in front of the rest of the wall. That is §6.4's own
  *"known unsolved"* class, *"wall-B columns seen edge-on"*.
- **(d) A widened field of view or a steep overhead view.** *Derived.* Holding 0–2.6 m from 1.9 m
  away needs roughly an 85° vertical field. From overhead, the fronts foreshorten to about 0.45 of
  their height, and the uppers hide the base fronts. Both trade a small defect for a visible
  distortion.

### A3 — the U overview looks in from the open side, on the centre line

**Ruling.** A U's overview:

- keeps its target (W/2, KITCHEN_TOP/2, floorDepth/2), the kitchen-derived distance and the
  reference elevation (17.6°);
- stands on the room's centre line, **x = W/2**, looking in along −z.

*Derived:* the U's only open side is +z. So its eye stands in the U's open side, every run's fronts
face it, and nothing is cut away. An L and a straight room keep exactly the preset they have.

*Measured,* on the 5 292-room sample at 390 × 844:

- every wall's top row lies inside the viewport vertically, at **62.7 px or more** (row 21 needs
  44);
- wall A's middle is on screen horizontally in **every** room;
- wall B's and wall C's middles are off screen horizontally in every room, which is no worse than
  now.

### A4 — what "every top row from every preset" can mean on a phone

*Derived.* At the 4.237 m distance, a 45° vertical field and 390 × 844, the frame is about 3.5 m
tall and **1.62 m wide** at the target. No preset can hold a whole wall of up to 6 m horizontally,
and no overview can hold three walls. So D13's *"overview … holds three runs"* and U4 AC4's
*"the top row of every wall … from all four presets"* **are withdrawn as written.** Their
replacements are in the M7B plan's U4 AC4 and D13, both dated today:

- each wall's preset makes its own wall's top row tap-sized and **clickable**, at the wall's middle;
- the overview frames every top row vertically, faces every run's fronts, and holds wall A's middle.

### A5 — owner question Q-U4-cam (non-blocking; the default is built)

The question, as it is to be put:

> *"In a U-shaped kitchen, when you tap 'Wall B' (or 'Wall C'), the camera stands where the opposite
> side wall's cabinets are, so those cabinets would block the view. Which do you want? (A) Hide the
> opposite wall's cabinets while you look at this wall. They come back in the other views.
> (B) Show them faint and see-through. Either way they cannot be clicked from this view."*

**Default: (A), and it is built.** It needs no transparent material and no sorting, and it cannot
look like a rendering fault. (B) is additive: a material state on the same cut set, with the same
tests. A third option, standing closer inside the room, is **not offered**, because it breaks §11
row 21 (A2 (b)).

### A6 — `cornerOf`'s wording, reconciled

- *Source-verified* (`corner-assembly-size.ts:301-312`): `cornerOf` answers `"right"` for a wall-C
  corner piece **before** it reads the shape. Wall C shares a corner with wall A only at A∩C, so
  that answer is right whatever the shape.
- The M7B plan's U4 S2 text, *"`"left"` … for any room that is not a U"*, was wrong about wall C.
  **It is corrected to match the code.**
- The domain comment is accurate but leaves the order implicit. It gains one sentence in U3a
  Dispatch B (B4, comment only).
- *Not verified:* whether the domain admits a wall-C placement outside a U. The adapter wraps
  nothing outside a U, per QA, so nothing depends on the answer.

### A7 — consequences

- The punch list is in the M7B plan's U4 section: *U4 fix*, five items, adapter only.
- The web applies the cutaway on every camera change. That is added as U5 S2 item (5).
- **Triggers:**
  - The owner answers Q-U4-cam with (B).
  - An L's orbit behind wall A or B is reported as a defect. The same cutaway would then be
    extended to the L, which today is deliberately untouched.

### A8 — U4 review, round 2 (2026-09-29): A2's run bound is withdrawn, the cutaway survives a sync, and D14 moves to U5

The U4 fix's round 2 was merged at `9178de8`. HEAD is `38d6be7`. The logic review returned a
**blocker**; the clean-code review approved with two must-fix items. Figures are **[measured]** by
the architect against the adapter's `dist/` build of HEAD, over A1's grid (88 434 rooms), with the
engine band A 1800–2600 (23 409 rooms) added. Scripts: the session scratchpad's `u4r3/sweep.mjs`,
`u4r3/sweep-engine.mjs` and `u4r3/extra.mjs`, all run with `rtk proxy node`. They use the
reviewer's segment-against-box test, and reproduce the reviewer's figures exactly.

#### A8.1 — the blocker: A2 tested where the eye is, not what the sight line crosses. **The run bound is withdrawn**

**The case.** In a 2700/1600/2400 U, the `wallC` eye is at (−1.449, 2.020, 1.666). That is behind
B's plane, but 66 mm past the end of B's 1.6 m run, so A2's *"within that wall's run"* cut nothing.
The ray to wall C's top-row middle then crosses B's zone at z ≈ 1.50 m, inside B's run, and a body
at B's free end takes the click.

*Measured at HEAD:*

| Where the click is lost | Rooms, per side preset | Across both presets |
| --- | ---: | ---: |
| to an upper at the other side wall's free end | 1 109 | 2 218 |
| to a tall column there | 1 425 | 2 850 |

Tall columns at the free end are the normal case: ADR 0110 *N3 revised* 4 puts pantries there. So
AC4(d), §11 row 21, and A2's own restated rule (*"no drawn body … stands between the eye and its
subject"*) all fail. **A2 is a contract defect in its own wording, not a coding slip.** The bound's
stated reason, *"beyond either end the room is open, and an eye there looks in over nothing"*, is
false as soon as a sight line enters the run at an angle.

**Ruling.** A wall of a U is cut away whenever the eye stands in or behind its body zone, **wherever
along the wall the eye is**. The run bound (round 2's `0 ≤ along ≤ length`) is withdrawn for all
three walls.

*Derived.* If the eye stands in or behind a run's body zone, it is at or behind that run's fronts.
From there it can see only that run's backs, ends and carcass interiors, whatever its position along
the wall. Cutting that run therefore never removes a front the customer could have used.

Two alternatives were considered:

- **Testing the sight line to the orbit target.** Refused. It tests one ray. A frame is about 1.6 m
  wide, and rays to its edges can cross a zone that the centre ray misses.
- **Extending the bound by "the eye's reach".** This is the same rule with a parameter the room does
  not supply.

*Measured with the rule (the model's copy of it):*

- On A1's grid and on the engine band, **no** click is lost to an upper or a tall column, from
  either side preset.
- **No** top-row point at the middle ± 0.4 m or ± 0.8 m (within the run) has its line cross an
  uncut side zone. At HEAD, 2 491 rooms per preset have one.
- Cut sets change for 29 900 of the 353 736 preset evaluations on A1's grid (4 presets per room).
  All of them are side presets.
- **`wallA` and the overview cut nothing anywhere in the approved range**, so this is unchanged.
- **Stated because it does change, in the engine band only:** at A = 1800 and 1900 (W < 1.91 m),
  `wallA`'s eye, at x = W/2 + 0.163, stands inside wall C's zone, and C is cut. That is the rule
  working: the eye is inside where C's cabinets are. At HEAD, `wallA` already cut something in 1 938
  engine-band rooms.

AC4(d) is restated to say so.

**Tests this changes.**

- `qa-u4-fix-cutaway.adversarial.test.ts:140-171` (*"not a millimetre past it"*). Past the run's
  end, the wall is still cut.
- Round 2's `qa-u4-fix-cutaway-wall-a` pins. An eye behind wall A that is also in B's zone now cuts
  both.

#### A8.2 — A7's "every camera change" was too narrow: the cut set must survive a sync

*Source-verified.* The logic reviewer reports that `syncVoidMeshes` replaces the whole void set, so
a delete on `Perete B` brings wall C's voids back until the camera moves. A7 and U5 S2 (5) named
only camera changes.

**Ruling.** No object keyed to a cut wall is drawn or picked, whatever mounted it and whenever.
Responsibility follows who mounts what:

- **The adapter** mounts bodies (`syncSolidBodies`) and voids (`syncVoidMeshes`). Each of them
  applies the cut set that the last `applyCutaway` recorded on the same parent, before returning.
  This is U4 round 3.
- **The web** mounts the selection outline and overflow marks. It re-applies after mounting either
  of them, and on every camera change, before the next render or pick. This is U5 S2 (5), and its
  e2e is extended with a delete on `Perete B`, then a tap on B's top row.

**Widened 2026-09-29, at U4's close (logic review round 3, finding 1, MEDIUM).** The web also
rebuilds the stage, and two cases break "whenever" (*inference from the review's
report; U5's e2e is what falsifies it*): a depth change rebuilds the stage with no record while
`reseatHoldingCamera` holds the camera still, and an in-place U resize re-applies a record computed for
the old W. So U5 S2 (5) recomputes `cutawayWallsFor` and calls `applyCutaway` on **every camera change,
every change of `designRoom` or `cabinetDepthMm`, every new `stage`, and after mounting an overlay
(outline or mark)**. Suggested form: one effect keyed on all of these plus the controls' change event.
The e2e adds: on `Perete B`, switch the depth, then tap B's top row.

#### A8.3 — Q-U4-cam answered, and a selection does not outlive its cut-away body

**Owner, 2026-09-29, relayed by the coordinator:** Q-U4-cam answered **"Hide them"** (a *relayed
selection*). That is option (A), the default A5 built. A5's question is closed.

**Ruling, on the logic review's low finding.** When the cut set comes to include the wall of the
selected body or void, **the selection is cleared**, and the panel closes with it.

*Derived.*

- A selection is a pick result (§6.1), and a cut-away object is never picked (A2).
- A panel acting on a cabinet the customer cannot see, such as delete, replace or width, acts
  unseen.

This is not put to the owner. It follows from *"Hide them"*: a hidden cabinet is not an editable
one. The selection state is the web's, so the item is in U5 S2 (5).

#### A8.4 — `cornerOf` from a rebuilt placement: sound today, fixed properly in U5 S0

*Source-verified.* `placementStandingFor` (`right-corner-wrapper.ts:61-72`) fills `alongMm` from
`frame.x` for every wall. On walls B and C, `frame.x` is across the wall, not along it. It is sound
today only because `cornerOf` answers B and C by wall before it reads `alongMm`
(`corner-assembly-size.ts:301-312`).

**Ruling.**

- **U4 round 3 adds a guard test.** A wall-B or wall-C corner record whose `frame.x` would read the
  other way on wall A still wraps by its wall.
- **The fix goes to U5 S0.** `derivePlacementRecords` carries `corner` on the record (domain), the
  adapter reads it, and `placementStandingFor` is deleted. It is a domain change, and U4 is
  adapter-only.

#### A8.5 — the visual criteria and D14 move to U5, and U6 depends on them

**Unbuilt or uncaptured at U4's close:**

- U4 AC2 (parity captured);
- AC4's `[visual]` clause;
- AC5 and S3 (3), the light rig (D14).

No U reaches a web surface before U5, whose S2 (4) is what lets the capture route take `wallC`. So
all of them become U5 acceptance criteria.

**D14's choice is owed by U5's close. U6 depends on it:** the U card does not go live on a lighting
choice nobody has seen. R3 and R4 in the M7B plan are repointed to U5.

#### A8.7 — U4 close-out (2026-09-29, at `7f129fa`): deferrals and known limits

*Source: the round-3 logic and clean-code reviews, relayed by the coordinator.* Q-U4-cam's answer,
"Hide them", is already recorded in A8.3.

**Known limits beside A8.1** (logic finding 2, LOW). Neither is fixed in U4.

- The cut rule ignores eye height. An overhead orbit above a side run cuts it. If orbit reports arrive,
  bound the cut by `eye.y < KITCHEN_TOP_M`.
- In the engine band (W < 1.91 m), the `wallA` eye cuts C although it is about 137 mm in front of C's
  600 mm fronts. That band is not customer-reachable.

**Owed to U5.**

- **S2 (5), widened** (A8.2's dated line above).
- **`room: designRoom` at `kitchen-stage.tsx:359`** (clean-code R1, logic finding 3): U5 passes it to
  `syncVoidMeshes`. U5 S0 also considers making `room` required on `syncVoidMeshes` and
  `applyRecordedCutaway`.
- **S0 clean-up:** the two catalogue-at-depth caches; `mirroredPieceTest` and its boolean flags; the U4
  test-helper duplication (`OCCURRED_AT`, `PHONE`, `acceptedU`, `recordsOf`, mount helpers), landing
  before any new `qa-u4-*` file; splitting the 1,051-line `qa-u4-drawing-a-u.adversarial.test.ts`;
  `ZONE_M` re-declared unlabelled at `qa-u4-round3-cutaway.adversarial.test.ts:46`; the vague prose at
  `kitchen-shell.ts:~604`; the unchecked `userData` casts (`wallOf`, `CUT_WALLS_KEY`); the
  `EYE_CLEARANCE_M` public export, kept only if the web reads it; and A8.4's `record.corner`.
- **A8.5's visual items** stay in U5: AC2, AC4 [visual], AC5, and the D14 light rig (U5 AC9–AC11).

#### A8.6 — sweep

| Record | Effect |
| --- | --- |
| A2 | The run bound is withdrawn (A8.1) |
| A5 | Answered: "Hide them" (A8.3) |
| A7 | Widened to every mount (A8.2) |
| D14 | Owed by U5's close (A8.5) |
| M7B U4 AC4(d) | Restated (A8.1) |
| M7B U5 S2 (5) | Widened (A8.2, A8.3) |
| M7B U7 AC3 | `{left, right}` removed, because a U has one hand (decision 8) |

## Amendment B — 2026-09-30: D14 (lights) decided at U5's close: keep the rig

*Source: the U5 visual reviewer's measured capture, relayed by the coordinator; the scribe did not
re-measure. Evidence tier: the measurement is reviewer-reported, the judgement is the reviewer's.*

- **D14 — keep; decided at U5 close on the visual reviewer's measured capture; the owner was informed
  and did not object.** The coordinator informed the owner. This is not an owner ruling on the lighting,
  and it is recorded as relayed.
- **The measurement.** Wall-C fronts are about 3.6% darker than wall B's (RGB 212 against 220; base
  fronts the same), at both viewports. They read as one white kitchen.
- **Alternative considered and rejected.** A mirrored key light would add shadow cost and risk changing
  the L, for about 4% gain. So `stage.ts` does not change.
- **Consequence.** A8.5's condition, "D14's choice is owed by U5's close; U6 does not start without it",
  is discharged. U5 AC11 is closed on this record. Trigger to revisit (the scribe's proposal, not a ruling): a customer or the owner reports
  wall C as dim (ADR 0118's form).

| Record | Effect |
| --- | --- |
| D14 (decision 7) | Decided: keep the rig (Amendment B) |
| A8.5, A8.6 | The "owed by U5's close" line is discharged |
