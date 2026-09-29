# ADR 0132 — Wall C is a world wall, and only the right corner is drawn in a reflection

Status: Accepted — M7B wave U0's logic review, 2026-09-29 (no blockers)
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
  a dated line.
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
