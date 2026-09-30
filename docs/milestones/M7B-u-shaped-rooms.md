# M7B — U-shaped rooms

> **STATUS: PLANNED — plan written 2026-09-29; no wave dispatched.** Confirmed as its own milestone
> by the owner on 2026-09-11 (*"Yeah let make separate"*), between M7 (closed 2026-09-29) and M8.
> Summary: `docs/STATUS.md`.
>
> **Next: wave U0** — the census, the measurements the owner questions need, ADR 0132, and putting
> Q-U1…Q-U5 to the owner. U0 changes no production file. Four owner questions gate U3 and U6 only;
> U1, U2, U4 and U5 can proceed on their interims because nothing a customer can reach changes
> until U6 (see *Why nothing is reachable before U6*).
>
> **2026-09-29, wave U0 (uncommitted, awaiting its logic review):** the owner answered Q-U1…Q-U5
> before U0's measurements (relayed; recorded at ADR 0108 H, ADR 0110 N, ADR 0104 C, ADR 0132). U0's
> census, measurements and ADR 0132 (*Proposed*) are below (*U0 census*, *U0 measurements*). Q-U3 was
> answered with the owner's own arrangement, which leaves **twelve residual questions (ADR 0110 N6,
> RQ1–RQ12), each with a default; U3 is not dispatched until they are answered or their defaults
> accepted**, and U6 waits on RQ1 and RQ8. **Later the same day the owner answered RQ1–RQ12** (ADR
> 0110 N6, ADR 0108 H2–H3); ADR 0132 is **Accepted** on the logic review. **U6 no longer waits on the
> owner; U3 waits on RQ13–RQ17** (N6′) or their defaults. **RQ13–RQ17 were answered later the same
> day (N6′). No wave waits on the owner**, and U3's re-cut is the architect's to make before
> dispatch.

Status: planned. Depends on M7 (closed). Blocks M8 (M8's review groups by wall → band → order).
Reference: mockup frames 1A and 1B (`docs/design/mockups/Lemnaria Configurator Mobil.dc.html`);
`DEVELOPMENT-SPEC.md` §2, §3, §4, §6.1, §6.2, §6.4, §11, §13.3 q4; `SPEC.md` *Corner base + lazy
susan*, *L-shape kitchen scene*. Code read at **`5fbcad7`** (branch `m7-room-and-presets`, M7's
archival commit; no production file differs from `a989a85`).

**Wave ids are `U0`…`U7`, not `7B…`**: `7B` is already an M7 wave id (the preset search wave,
deferred past M8 by [ADR 0131](../decisions/0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md)),
and a second meaning for it would make every `git log` grep ambiguous. Commit subjects read
`M7B wave U<n> …` so `git log --oneline -i --grep='^M7B wave'` audits them
(`docs/best-practices/documentation.md`, *Auditing the wave commits*).

## Goal

A customer who picks *În formă de U* types three wall lengths and the room height, and gets a
composed U-shaped kitchen in the editor — two structural corners, a third wall, the same command
path, rules and guards as the L — that they can edit, reload and share on a phone and on desktop.

## Scope

**In.** The stored U room and wall C; the second (right-hand) corner assembly, built on
[ADR 0129](../decisions/0129-a-right-hand-l-is-the-left-hand-design-drawn-in-a-reflection-and-the-reflection-is-a-per-group-primitive.md)'s
per-group reflection primitive; the U shell and its bounds; composition across three walls (by the
owner's ruling, Q-U3); the void engine, commands, validation, depth change and frozen map on wall C;
the 3D shell, picking, cameras, lights, selection outline and overflow mark for a U; Step 1 turning
the U card live; the editor, price breakdown, share view and capture route carrying wall C; the
mobile gate and the desktop line. Two backlog items this milestone makes customer-reachable are
adopted: **72** (wide-U facing labels overlap in the plan preview) and **76** (the walls a shape has
are enumerated twice in `apps/web/src/room`).

**Out.** Presets for any shape (ADR 0131); islands (owner, Q5: *"all kitchen shapes (exluding
island)"*); door and window obstacles; re-expressing the right-hand L as walls A + C (D3 below);
any change to `LEVELS` (M7 re-plan: *"`LEVELS` are manufacturing heights and stay constants for
every wall"*); M8's review screen (it inherits wall C, see *What M7B hands M8*).

### Why nothing is reachable before U6

`isShapeBuildable` reads the approved policy's keys and nothing else (`room/room-policy.ts`, the
function at the end of the module), and `validateRoomInput` refuses a U with `SHAPE_NOT_BUILDABLE`
(`room/validate-room.ts:92`). So until U6 adds U's owner-approved bounds to `APPROVED_ROOM_POLICY`,
no customer can create a U design through Step 1, whatever U1–U5 build. This is
[ADR 0116](../decisions/0116-a-type-that-refuses-an-undesigned-shape-is-a-guard-and-the-cast-that-witnesses-it-is-confined-to-a-test.md)
decision 1 and ADR 0108 Amendment D's sequencing, kept exactly as wave 7J kept them for the
straight kitchen. It is also why a late owner answer blocks only U3 and U6.

**One caveat, stated rather than hidden:** a U *document* becomes storable at U1 (the schema
widens). The write seam is `PUT`/`PATCH /api/designs/{id}` (`route.ts:107, 114`) with a body the
domain validates, and M7's
visitor rules (ADR 0114) bound who may write which design. A hand-crafted U document written
between U1 and U6 would be a well-formed design the product itself cannot yet produce — the same
status a hand-crafted wall-B body in a straight document has today (ADR 0130 D3). U1's security
reviewer confirms this reading; it is not a new surface in kind.

## Ground truth

Tiers: **[src]** read at `5fbcad7`; **[doc]** quoted from a record; **[inf]** inference, owed a
measurement or a test. **Nothing below is [meas]** — no measurement was executed for this plan;
U0 owns every number the owner questions need.

| # | Fact | Tier |
| --- | --- | --- |
| G1 | The stored document has two walls and two shapes: `DesignWallSchema = z.enum(["A", "B"])` (`design.ts:48`), `DesignRoomShapeSchema = z.enum(["L", "linear"])` (`:51`); `DesignRoomSchema` is `{ shape, widthMm, depthMm, heightMm, cornerDirection? }`, strict (`:144-155`). | [src] |
| G2 | The room-input layer already models a U: `RoomShape = "linear" \| "L" \| "U"` (`room/validate-room.ts:12`), `URoomInput` carries wall A, B, C, height and direction (`:35-42`), `RoomField` includes `wallC`. `validateRoomInput` refuses it (`:92`); `BuildableShapes` declares `L?` and `linear?` only (`room/room-policy.ts`). | [src] |
| G3 | Wall transforms are static and room-free: `WallId = "A" \| "B"` (`room-transforms.ts:7`), `WALL_TRANSFORMS` fixes both walls' origin at `(0,0,0)` (`:34-49`), and `deriveCabinetWorldTransform` takes no room. A wall at `x = W` cannot be expressed without either a room argument or a reflected frame. | [src] |
| G4 | `wallLengthMm`: A → `widthMm`; B → `0` for a straight room, else `depthMm` (`queries/overflowing-placements.ts:50-56`). | [src] |
| G5 | Two-wall sites, a **seed list, not a census**: `void-engine.ts:594` (`rotated = wall === "B"`); `module-grid.ts:68` (column key prefix), `:83`, `:93` (along helpers); `validate-design.ts:617-625` (`reachesPastRoomAcrossWall`), `:917` (`findCornerOverlaps`, origin corner only); `design-bounds.ts:96` (two wall runs), `:146` (`WALL_COUNT = 2`); `along-wall-chain-shift.ts:52` (`WALL_THE_CORNER_IS_TAKEN_FROM = "B"`); `queries/design-projection.ts:70` (`WALL_DISPLAY_RANK = { A: 0, B: 1 }`); `run-end-panel.ts:119, 132, 146` (wall A only); `generation-priorities.ts:77-82` (two-wall reading order), `:256` (`["A", "B"]`); `generate-kitchen.ts:155-186` (shape dispatch, linear vs L); `shell-design.ts:304` (`ROOM_NOT_L`). The full count is **unmeasured** — U0 S1. | [src]; count [inf] |
| G6 | `cornerDirectionOf` answers `"left"` for any shape but L (`room/corner-direction.ts:14-17`), so a U reads left today whatever it stores. | [src] |
| G7 | The adapter's reflection: `applyCornerDirection(group, direction)` sets the sign of a `Group`'s `scale.x` and refuses a leaf (`three-adapter/src/corner-direction.ts:27-39`); the editor applies it to the stage root (`apps/web/src/scene/kitchen-stage.tsx:309-311`). Its record says *"On one group — M7B's corner — it mirrors that group alone"* (ADR 0129 D4). | [src] + [doc] |
| G8 | The shell draws `floor`, `wall_back`, `wall_left`, the run-end panel and `backsplash_wall_a` only (`kitchen-shell.ts:31-47`); wall B's plane is hidden for a straight room (`:123`, `:199`); the drawn-room signature is `drawnRoomSignature(room)` (`:152`). | [src] |
| G9 | Cameras: `CameraPresetId = "overview" \| "wallA" \| "wallB"` (`stage.ts:252`); `targetInRoom` frames wall B at `[0, eye, depth/2]`; a straight room drops `wallB`. Lights: key at `[4, 7, 5]`, fill at `[-5, 3, -4]` (`stage.ts:107-108`), both `DirectionalLight`. | [src] |
| G10 | A `DirectionalLight` lights along the vector from its position to its target (the origin by default), so a front facing −X — where wall C's fronts would face — receives **no key light** at `[4, 7, 5]`. | [inf] — three.js semantics, not read in `node_modules` for this plan; U4 captures it |
| G11 | Step 1 already carries a U: `requiredFieldsFor("U")` is `wallA, wallB, wallC, height` (`apps/web/src/room/room-url-state.ts:243-249`); the URL writes `wallC` and `direction` (`:135-141`); the plan preview draws wall C (`plan-preview-model.ts:215-219`) and mirrors the whole drawing for `right` (`:189-199`), so a right-hand U draws wall B on the right. `room.wallLabel.wallC` exists (`messages/ro.json:57`). | [src] |
| G12 | Three U-blocking sites in `apps/web/src`: `room-url-state.ts:114-118` throws *"Domain accepted a room shape without a DesignRoom mapping"* for a U at 1D; `roomHrefFromDesignRoom` maps L and linear only (`:150-167`); `crossesOnScreen` knows walls A and B only (`i18n/content.ts:287-295`). `configure.cameraPresets` has `overview`, `wallA`, `wallB` leaves only (`messages/ro.json:16-19`). | [src] |
| G13 | Frame 1A draws *În formă de U · Trei pereți*; frame 1B's note: *"Toggle-ul apare doar pentru L și U"*. **No frame draws a U's dimensions, its 1C or its 1F**; the 1B form's third field shipped in M7 (7F1/7F2) without one. | [doc] (mockup `:87-88`, `:186`) |
| G14 | `as BuildableShapes` casts left for M7B: **7 expressions in 6 test files** (`packages/configurator-domain/tests/room/is-shape-buildable.test.ts:45, 92`; five web files under `apps/web/tests/room/`), each owed deletion when U's type widens (ADR 0116 Amendment A2). | [src] (`git grep`) |
| G15 | No SQL migration (`0001`–`0006`) constrains a design's shape, walls or document size; the only size bound is `MAX_DESIGN_BYTES`, read by `PUT /api/designs/[id]` (`apps/web/src/app/api/designs/[id]/route.ts:205`). | [src] |
| G16 | `MAX_PLACEMENTS` is `Σ floor(run / 200) × 3` over the wall runs, 186 today (`design-bounds.ts:118-133`). A third 6300 mm run would make it 279 and `MAX_EMPTY_COLUMNS` 1893. | [src]; 279 / 1893 [inf], arithmetic U1 re-derives |
| G17 | The composer is two-walled: a prefix wall read in reverse, a suffix wall, one cut (`chooseWallCut`), keyed on the wider entered wall (ADR 0120 Amendment E). ADR 0110 carries thirteen lettered amendments (A–M) of composition rules written against two walls. | [src] + [doc] |

## Decision-record sweep

Swept 2026-09-29 for `U`, `U-shape`, `wall C`, `wallC`, `M7B`, `third wall`, `two corners`,
`cornerDirection`, `applyCornerDirection`, `WALL_THE_CORNER_IS_TAKEN_FROM` over `docs/decisions/`,
`docs/design/`, `docs/backlog/`, `docs/ARCHITECTURE_PROPOSAL.md` and the archived M7 plan's U
sections (read by section, not whole).

| Record | What it says | Effect on M7B |
| --- | --- | --- |
| [0003](../decisions/0003-design-reference-supersession.md) row *Wall C and U-shaped layout logic*, *Open questions* 14 | The reference models walls A and B only; when U returns, with which recipes and per-wall data. | **Answered by this milestone**: no recipe (ADR 0131), composition only; per-wall data is transform, length and corner reach (M7 re-plan). |
| [0021](../decisions/0021-corner-returns-are-structural-in-data.md), [0066](../decisions/0066-the-wall-corner-returns-get-their-own-kinds-and-names.md) | Corner pieces are structural: no replace, delete or insert; their own kinds. | **Applies to both corners** (D4). |
| [0025](../decisions/0025-the-corner-base-legs-seat-on-the-l-joint.md) | The X-leg seats at −0.020 (§11 row 19's named exception). | **Holds mirrored** at the right corner (U4-A1). |
| [0065](../decisions/0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) d5, [0130](../decisions/0130-a-straight-kitchen-is-the-composers-run-on-one-wall-with-no-corner.md) D3 | Each wall's own run bounds it; a wall a shape lacks has run 0, and a stray body is marked, not refused. | **Extended** to wall C (D6). |
| [0089](../decisions/0089-the-along-wall-chain-is-kept-and-its-reader-is-the-depth-command.md) | A depth change slides wall B's chain; the 30 mm upper-row residue is the product's answer. | **Extended** to wall C (D9); the residue is not closed. |
| [0105](../decisions/0105-the-e2e-job-splits-by-playwright-project-rather-than-raising-its-ceiling-again.md) | The e2e job splits by project rather than raising its ceiling. | U7 reports what it adds against it. |
| [0108](../decisions/0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) B2, C, G | U stays refused until its wave puts bounds to the owner; *"U (M7B): the same rule across three runs, with two corners"*; one maximum, 6000, for every wall of every shape — *"M7B's U inherits G1"*. | **B2 followed** (Q-U1). C's sentence is the **architect's**, not an owner ruling — its exact form waits on Q-U3. **G is settled and not re-asked**: every U wall's maximum is 6000. |
| [0110](../decisions/0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md) decisions 1–2, A–M | The command path; the owner's order and every composition rule. | **Decisions 1–2 bind unchanged.** Every amendment is two-walled; how each reads on three walls is Q-U3's consequence, recorded as ADR 0110 Amendment N. |
| [0116](../decisions/0116-a-type-that-refuses-an-undesigned-shape-is-a-guard-and-the-cast-that-witnesses-it-is-confined-to-a-test.md) + A | The type widens in the wave that designs the shape; `U` casts remain and name M7B. | **Discharged in U2 (type) and U6 (casts)**, `BuildableShapes`, engine limits, approved policy and validator widening together per decision 1. |
| [0117](../decisions/0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) | Generation is the cheap correct baseline; taste enters through presets. | **The frame for Q-U3's recommendation.** |
| [0118](../decisions/0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | Record an unmet problem with its trigger. | Q-U5, D11, D14's triggers. |
| [0120](../decisions/0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) B2, C1, D1–D3, E | 6000 per wall; the entered number is the run to furnish; no panel at a run's end; draw the kitchen, not the room; sink and hob on the wider wall. | **Applied** (D10–D12); E's wider-wall rule is an input to Q-U3, not a decided answer for three walls. |
| [0121](../decisions/0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md) | Identify a thing by what it is. | Which corner a piece belongs to is a domain query, never a position the adapter reads (D4). |
| [0125](../decisions/0125-the-corner-minima-stay-at-900-and-1000-as-a-deliberate-margin-above-what-the-engine-needs.md) | Approved corner minima 900 / 1000 keep a margin over the engine's 880 / 880. | **The margin carries to both corners** (Q-U1's proposal). |
| [0129](../decisions/0129-a-right-hand-l-is-the-left-hand-design-drawn-in-a-reflection-and-the-reflection-is-a-per-group-primitive.md) | Domain canonical, mirror is presentation; one primitive, settable on the root or one corner group; *"whether a right corner becomes walls A + C is M7B's question"*; outline `DoubleSide` exception. | **The foundation** (D2, D4). Its deferred question is **answered by D3: no**. |
| [0131](../decisions/0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md) | Presets deferred past M8; every shape goes dimensions → 1F. | **Followed**: no U preset. |
| M7 re-plan, *What U means for stored documents* (archived plan `:1467-1480`) | Widening walls and shape is additive; storage bounds grow on purpose; the right-hand L question is M7B's. | **Followed** (D1, D3, D8). |

No record says the opposite of anything below. **Two records are close enough to need care:**
ADR 0129's rejected alternative names *"wall C"* among domain-side mirrors it refused — that
refusal was about representing a **right-hand L**, and D2 keeps it (D3); a U needs a wall C
because it has a third wall of placements. And ADR 0108 C's *"the same rule across three runs"* is
worded like a ruling and is not one.

## Proposed decisions

**These are the architect's proposals, owed to ADR 0132 in U0**, which may revise any of them on
U0's census and measurements (a revision is a dated line in ADR 0132, not a silent edit here).
Owner-decided matters are in *Owner questions*, not here.

- **D1 — The stored U.** A U room is `{ shape: "U", widthMm: A, depthMm: B, wallCMm: C, heightMm,
  cornerDirection? }`; `DesignWallSchema` gains `"C"`; `DesignRoomShapeSchema` gains `"U"`.
  `wallCMm` is present **iff** the shape is U (a schema refinement). Additive — every stored L and
  straight document parses unchanged, and no schema version bump is owed (ADR 0053's argument, the
  M7 re-plan); the hazard runs backward only (an older build refuses a U), the same no-rollback note
  `DesignSettingsSchema.finish` carries. *Rejected:* a `walls: {A, B, C}` record (rewrites every
  document's bytes and every reader); folding C into `depthMm` (loses C). The key's name is
  ADR 0132's to confirm. **Settled 2026-09-29 (ADR 0132 d6):** the key is `wallCMm`; a U refuses
  `cornerDirection: "right"` at the schema (Q-U4 (b)); `"left"` and absence stay valid.
- **D2 — Wall C lives in a canonical frame: its mirror twin's.** A wall-C placement's `alongMm` is
  measured from the A∩C corner, and every domain frame for a wall-C body is the frame its twin on
  wall B would have (across-wall coordinate from `x = 0`). World `x ↦ W − x` is applied in **one
  domain function** (for the rare consumer that needs world coordinates across the room) and in the
  adapter's **one reflected group** (D4). This is ADR 0129 D1's doctrine one level down: the column,
  void, fit, width, merge, frozen-map and depth-chain algebra of M2–M6 reads wall C exactly as it
  reads wall B, and nothing keyed on +along forks. *Alternative (α):* a world wall C with a
  room-dependent transform (`origin.x = W`, fronts −X), which draws every wall-C body unmirrored but
  forks every across-wall site (G5's `originOnWall`, occupied depth, corner overlap, chain shift)
  into a third arm. **ADR 0132 chooses on U0's measured fork counts for both**; D2 is the starting
  hypothesis because it is the one the recorded doctrine points at. [inf]
  ~~β~~ **Corrected 2026-09-29 (U0; ADR 0132 d1): α — wall C is a world wall** (origin `(W,0,0)`,
  tangent `+Z`, fronts `−X`, yaw `−π/2`). The owner's Q-U5 ruling makes wall C independent and
  unmirrored, and the census finds wall C's along (`+z`) shared with wall B under both
  representations, so β's advantage does not exist; α-only forks 6, β-only 6 rows / 7 changes, 22
  owed under both (*U0 census*).
- **D3 — A right-hand L stays a reflected left L.** It is not re-expressed as walls A + C: no
  version-keyed migration arm, no second representation of one kitchen, every stored right-hand
  document byte-identical. This answers the question ADR 0129 left to M7B.
- **D4 — The right corner is the left corner reflected in `x = W/2`.** The same four build ids
  (`base-corner-x-900`, `base-corner-return-320`, `wall-corner-return-570`,
  `wall-corner-return-570-top`), structural, priced as they are today; the X-leg on wall A at the
  right end, the three returns on wall C at the along values the left returns have on wall B. **Which
  corner a structural placement belongs to is a domain query** (proposed `cornerOf(placement, room)`),
  never a position the adapter compares (ADR 0121). The adapter draws the right corner's pieces and
  every wall-C body inside one group reflected in `x = W/2` with `applyCornerDirection` — ADR 0129
  D4's *"on one group"*, used as it was built to be. No new catalogue entry, no new price.
  **Corrected 2026-09-29 (U0; ADR 0132 d2):** the domain places the right corner's pieces in world
  frames (α); the adapter draws **each of the four in its own wrapper group reflected about the
  piece's own origin**, not one group in `x = W/2` — that plane is ADR 0129's rejected room-centre
  line. Every other wall-C body is drawn unmirrored (Q-U5).
- **D5 — Two corners on one wall A.** Each corner is sized by the existing rule (largest even
  whole-millimetre width ≤ the reference, above the one-door floor; `corner-assembly-size.ts`) against
  its own side wall; wall A carries both X-legs, which never overlap. **An odd `W` gives up its
  millimetre where ADR 0132 says** — the right X-leg's centre `W − width/2` is a half millimetre for
  an odd `W` and `cornerAlongWallCentreMm` refuses it, so the rule must be chosen, not discovered
  (7D1-P's P3 gives the precedent: the odd millimetre goes at the far end). [src] + [inf]
  **Corrected 2026-09-29 (U0 measured; ADR 0132 d4):** the premise is false — corner widths are
  always even, so `W − width/2` is whole for every whole `W` (0 half-millimetre centres over 16 964
  rooms per depth); the odd millimetre lands in wall A's free run, which the shell already tiles.
  **New finding:** the two X-legs overlap for A 1760–1799, so the U's engine floor on wall A is
  **1800**, not 1760.
- **D6 — Wall lengths.** `wallLengthMm("C")` is `wallCMm` for a U and `0` for an L or a straight
  room (ADR 0130 D3's rule extended: a wall-C body in a document without one is marked, not
  refused).
- **D7 — The domain owns which walls a shape has.** A proposed `wallsOf(shape)`:
  `linear → [A]`, `L → [A, B]`, `U → [A, B, C]`. `requiredFieldsFor` and the plan preview's
  `DRAWABLE_WALLS` derive from it (backlog 76, adopted).
- **D8 — Storage bounds grow deliberately.** A third wall run in `design-bounds.ts` (`WALL_COUNT`
  3; `MAX_PLACEMENTS`, `MAX_EMPTY_COLUMNS`, `MAX_DESIGN_BYTES` re-derived, not chosen). The write
  seam's body cap moves on purpose (M7 re-plan), and U1's security reviewer sees it.
- **D9 — Depth change on a U.** The corner is taken from wall B **and** wall C
  (`WALL_THE_CORNER_IS_TAKEN_FROM` becomes the shape's set of corner-taking walls); wall C's chain
  slides by exactly what wall B's slides; generated corner widths stay frozen (ADR 0089); the 30 mm
  top-row residue appears on wall C as on wall B and is not closed.
- **D10 — Across-room bounds.** A wall-B or wall-C body's reach across the room is bounded by wall
  A's run; a wall-A body's by the drawn floor's depth, `max(B, C)`. Opposite side runs are never
  corner partners in `findCornerOverlaps`; whether they may approach each other is Q-U2. [inf] —
  ADR 0132 confirms against `validate-design.ts:617-625`.
- **D11 — No run-end panel on a U.** Both ends of wall A are corners, so `runEndPanelSeatM` answers
  none for every U; the free ends of B and C stay unpanelled (ADR 0120 D2). **Trigger** (ADR 0118):
  the owner objects on seeing a U.
- **D12 — The 3D shell.** Wall C's plane at `x = W`, fronts −X, length `C + CORNER_OVERHANG_M`
  (the overhang runs past the A∩C corner as it does past A∩B); floor depth `max(B, C)` plus the
  overhang; backsplash on wall A only — parity with the L, not a new rule; the drawn-room signature
  includes the shape and `wallCMm`. `kitchen-parts.ts` and `reference/` are not touched.
- **D13 — Cameras.** A U offers `overview`, `wallA`, `wallB`, `wallC`; `wallC` is `wallB` reflected
  in `x = W/2` with `C` in place of `B`; `overview` is re-framed to hold three runs floor to ceiling
  (§6.4's WHY). §11 row 21 holds from all four.
  **Revised 2026-09-29 (ADR 0132 Amendment A, on U4 QA's RED):**
  - ~~*"`overview` is re-framed to hold three runs"*~~ is **withdrawn**. A 390 × 844 frustum is
    about 1.62 m wide at the preset distance.
  - **A U's overview** stands on the centre line `x = W/2`, in the U's open side, at the reference
    elevation and the kitchen-derived distance. It faces every run's fronts, frames every run's top
    row vertically (row 21), and holds wall A's middle horizontally.
  - **`wallB` and `wallC`** keep the distance and the direction. Any run whose body zone the eye
    stands in or behind is cut away: not drawn and not pickable. Row 21 is met by each wall's own
    preset, and it is a **click**, so occlusion counts.
- **D14 — Lights.** G10 predicts wall C's fronts get no key light. ADR 0132 chooses, on U4's
  captures, between accepting it, moving a U's key onto the room's centre line, and a second key
  mirrored for wall C. *Not* chosen here: it is a visual judgement that needs pixels.
- **D15 — Screen words on wall C.** `crossesOnScreen` gains wall C, **derived by projecting +along
  through the `wallC` camera** as ADR 0129 Amendment (b) did for A and B, not assumed. The predicted
  answer — C crosses iff the direction is right — is [inf] until that test exists.
  **Re-predicted 2026-09-29 (ADR 0132 d7):** a U has no right-hand variant (Q-U4 (b)), so the
  prediction is *wall C never crosses*; still [inf] until U5-A5.
- **D16 — Step 1.** The U card turns live only by gaining bounds in `APPROVED_ROOM_POLICY` (ADR 0116
  decision 1); `BuildableShapes.U`, `ENGINE_ROOM_LIMITS.U` and `validateRoomInput`'s U arm widen in
  U2, the approved literals in U6. U has no preset (ADR 0131): 1D goes straight to 1F composition.
  **Added 2026-09-29 (Q-U4 (b); ADR 0104 C, ADR 0132 d8):** Step 1 hides the toggle for a U; a U
  never carries a direction; the preview draws a U unmirrored.
- **D17 — Composition** goes through `insertBody` and nothing else (ADR 0110 decisions 1–2), keeps
  every rule that is not about *which wall* (drop order, widths, leftover ≤ 599 mm, exactly one
  oven, no oven beside the fridge, no upper over a full-height body or a corner zone, a hood over the
  hob), and distributes the owner's order across three walls **as Q-U3 rules**. Recorded as ADR 0110
  Amendment N. **Recorded 2026-09-29:** the owner's arrangement (Q-U3 (c)), ADR 0110 N3 and *N3
  revised*; ~~D17's *"exactly one oven"* is narrowed for a large U (N3.8)~~ **D17's *"exactly one
  oven"* stands for every U (RQ5, same day: the generator places one tower, a customer may add
  more).**

## Owner questions

Put to the owner **in U0, with U0's measured tables in front of them** — the M7 re-plan's reason
M7B exists at all is that *"its bounds need the owner, and the question is only answerable once the
shape exists on screen"* (archived plan `:1458-1459`). Nothing here guesses an answer. Each answer is
recorded verbatim (or marked *relayed*, `documentation.md`), dated, in the record named.

**Q-U1 — The U's bounds.** *Blocks U6.* Recorded in ADR 0108 Amendment H.

- *Proposed:* **wall A (the back) 1800–6000 mm**, **walls B and C 1000–6000 mm each**, **height
  2200–3900 mm**. Wall A holds both corners, so its minimum is two of the L's approved 900; each side
  wall takes a corner's reach, so each takes the L's approved wall-B 1000. Both keep ADR 0125's margin
  over the engine (880 per corner reach, so an engine floor of 1760 on A). **The maxima are not a
  question** — ADR 0108 Amendment G's *"Max should be on any type of kitchen same, liniar, L-shape
  an u-shape"* already rules 6000 for every U wall.
- *And:* the owner's *"a kitchen minimum should have sink and hub"* (Q3) and F6's *"Must hold sink +
  hob"* are stated of any kitchen, so a U inherits the minimum-kitchen rule. **Its exact predicate
  depends on Q-U3** (which walls may carry the sink and the hob) and is shown to the owner as
  measured boundary pairs, as ADR 0108 Amendment E did for the L.
- *Until answered:* engine limits only, derived (U2); no U validates in the product.
- **Answered 2026-09-29 (relayed selection): the proposal as written** — A 1800–6000, B and C
  1000–6000, height 2200–3900. A's 1800 is raised by Q-U2 (ADR 0108 H1–H2). The minimum-kitchen
  predicate is ADR 0108 H3 (sink on the back wall; A ≥ 3000 or the far side wall ≥ 1600).

**Q-U2 — The walkway between the two side runs.** *Blocks U6.* Recorded in ADR 0108 Amendment H.

In a U, wall A's run is the distance between the side walls, so at A = 1800 mm the two side runs'
fronts stand much closer than a person needs to work between them (U0 measures the clear floor at
600 and 700 mm cabinet depth from `occupiedDepthOfEntryM` — no figure is asserted here).

- *(a)* No walkway rule: A's minimum is the two corners' reach only.
- *(b)* A stated minimum clear gap between the facing runs, held **at the deepest cabinet depth the
  editor offers** (ADR 0108 Amendment A's precedent: a minimum holds at every declared depth, so a
  later depth change cannot make an accepted room invalid). This raises A's minimum by a measured
  amount. U0 tabulates A's resulting minimum for a range of gaps so the owner picks a number; **this
  plan proposes no number**, because none is backed by a reference or an owner statement.
- *Recommended:* (b), with the owner's number. A U whose sides nearly touch is a room the product
  would build and nobody can use.
- *Until answered:* (a), engine-side only; unreachable until U6.
- **Answered 2026-09-29 (relayed selection): (b), 1200 mm.** Measured (*U0 measurements*, M1): the
  deepest floor body is `base-hob-oven` at 748 mm (700 depth), so **wall A ≥ 2696**; RQ1 (relayed
  selection, same day): **the approved literal is 2700** (ADR 0108 H2).

**Q-U3 — How a U kitchen is composed.** *Blocks U3.* Recorded in ADR 0110 Amendment N.

The owner's order is *fridge → sink → preparation → hob → … → tall cabinets at the edge*, with sink
and hob on the wider wall and the fridge on the narrower (ADR 0110 A1, H; ADR 0120 E). Every rule is
written for two walls and one cut.

- *(a) One run around the U.* The order reads from the free end of one side wall, along the back
  wall, to the free end of the other; the fridge end on the narrower side wall, sink and hob where
  the wider-wall rule puts them, the tall block at the far free end. The composer gains a second cut.
- *(b) The L's composer on two walls, storage on the third.* The back wall and the wider side wall
  are composed exactly as an L is today; the narrower side wall gets base storage and uppers under the
  leftover rule. Nearly every existing rule and test applies unchanged.
- *(c)* The owner states a different arrangement.
- *Recommended:* U0 measures (a) and (b) over the Q-U1 range — how many rooms place the fridge,
  the sink and hob, the tall block; bare run ends; which walls carry what — and the owner chooses
  from those numbers. The architect's lean is **(b)**, on ADR 0117 (*"generation produces the cheap
  correct baseline"*), with (a) available later as an amendment; the lean is not a decision.
- *Until answered:* U3 is not dispatched.
- **Answered 2026-09-29: (c), the owner's own arrangement** — verbatim and relayed parts at ADR 0110
  N1; rules N3; measured N4; **twelve residual questions N6 (RQ1–RQ12), each with a default**. The
  (a)/(b) comparison was not measured: the owner chose neither. U3 is not dispatched until the RQs
  are answered or their defaults accepted. **RQ1–RQ12 answered 2026-09-29** (N6); rules revised (*N3
  revised*), re-measured (N4′); **five new residual questions RQ13–RQ17** (N6′), **answered the same day**.

**Q-U4 — What the corner-direction toggle means on a U.** *Blocks U5's Step 1 wording only.*
**(2026-09-29: answered (b) below; it now also drives U1 S1's schema refusal of `cornerDirection:
"right"` on a U — ADR 0132 d6.)*
Recorded in ADR 0132. A U has two corners, but frame 1B's note says the toggle appears for L and U,
and the shipped 2D preview mirrors a whole U (G11) — a right-hand U draws wall B on the right.

- *(a) Keep it: it mirrors the whole U* (what ships in 2D today). Since composition keys on the typed
  lengths, the toggle then decides only which physical side wall B stands on.
- *(b) Hide it for a U* (departs from frame 1B's note, so it needs the owner under ADR 0104).
- *(c) Keep it, and give it a product meaning*: which side the run's fridge end starts from,
  independently of the lengths.
- *Recommended:* (a) — it is the mockup's behaviour and adds no rule. *Until answered:* (a); the
  validator carries the direction for a U and `cornerDirectionOf` returns it.
- **Answered 2026-09-29 (relayed selection): (b), hide it for a U** — ADR 0104 Amendment C (a
  departure from frame 1B's note); engine consequences ADR 0132 d8: no right-hand U exists.

**Q-U5 — Mirrored cabinets on wall C (a confirmation; blocks nothing).** Under D2 and D4, in
**every** U — left-hand included — wall C's cabinets and the right corner are drawn as the mirror
image of wall B's and the left corner's: hinge sides, handle sides and appliance controls reflect.
This is the owner's own Q6 wording (*"this mirroring especially of corner cabinet will help in
building the U shape kitchens"*) carried to wall C, and ADR 0129 D9 already accepts mirrored
appliances. *Interim and recommended:* mirrored. **Trigger** (ADR 0118): the owner objects on seeing
a U — the remedy is then an un-mirroring wrapper per wall-C body in the adapter, not a domain change.
**Answered 2026-09-29 — the premise REJECTED** (verbatim, relayed): *"In U shape is not like the left
and right are mirrored only the corner cabinets, the rest should be independent one from another (as
mentioned on one wall will be frodge on another no)"*. Only the right corner is mirrored; wall C is
composed independently and drawn unmirrored. Recorded at ADR 0132 (d1, d2), which chooses α on it.

**Not asked, recorded instead:** no new 1C suggestion for a U (the straight-room suggestion keeps its
shape-independent gate, `room-issue-model.ts`, `validatesAsStraightRoom`); unpanelled free ends of
B and C (D11); no uppers over either corner zone (ADR 0110 7D2 c. 14, kept).

## The 3D contract for a U

Per `docs/best-practices/product-invariants.md` and `SPEC.md`'s element format. Every item is owed a
test or a capture in U4.

| Element | Coordinate anchor | Scaling rule | Structural dependency |
| --- | --- | --- | --- |
| **World** | Origin on the floor at the A∩B corner; +Y up; wall A along +X, both side walls along +Z (unchanged, `DEVELOPMENT-SPEC.md` §2). | Metres in the scene, whole millimetres in the document; a non-integral value refused, never rounded. | — |
| **Wall C** | Plane `x = W` (`W` = `widthMm` in metres), fronts face −X, world yaw −π/2; along = world `z`, from the A∩C corner. ~~Domain frames are the wall-B twin's (D2); world `x = W − x_canonical`.~~ **2026-09-29 (ADR 0132 d1): domain frames are world frames (α).** | Plane length `C + CORNER_OVERHANG_M`, height `H`. | Hidden for L and straight; never removed from the shell (7H in-place resize, kit ownership). |
| **Right corner X-leg** | On wall A, far edge at `W` ~~(less the odd millimetre per D5); reflected in `x = W/2` from the left X-leg's canonical build~~ **exactly (2026-09-29, ADR 0132 d4: no odd millimetre reaches a corner); centred at `W − w/2`, drawn in its own wrapper group mirrored about its own origin (d2).** | Width from the corner rule (D5), frozen after generation (ADR 0089). | Plinth recess from its **own** `LD` only (`SPEC.md`'s *"the one that broke before"*); seats at −0.020 (ADR 0025, row 19 mirrored); its worktop covers the A∩C corner. |
| **Right corner returns** | On wall C at the along values the corner rule gives for the L room `(W, C)`; each drawn in its own mirrored wrapper group (2026-09-29, ADR 0132 d2). | As the left returns; widths frozen. | The base return's worktop **butts** the X-leg's slab — no two stone volumes interpenetrate, no coplanar faces. |
| **Wall-C cabinets** | Back face on wall C's plane at 0.000 (row 19), ~~inside the reflected group~~ **drawn unmirrored at their world frames (2026-09-29, Q-U5; ADR 0132 d1).** | Each body's own `SPEC.md` rule; appliances, sinks and handles fixed size. | Every host dependency of the L (cut worktop and open frame under a sink, open bands in an oven tower) holds unmirrored-in-kind: the reflection moves geometry, it may not drop a part. |
| **Reflection parity** | ~~At most two reflections compose — the root (right-hand U) and the right-hand group — so a wall-C body's world determinant is negative in a left-hand U and positive in a right-hand one.~~ **Corrected 2026-09-29 (Q-U4 (b), Q-U5; ADR 0132 d2, d8): no U is right-handed, so no root reflection; every wall-C body has determinant +1; exactly the four right-corner pieces have −1, each through its own wrapper.** | — | Face winding left to the renderer (ADR 0129 D5); `DoubleSide` only on the selection outline (ADR 0129 Amendment (a)); `applyCornerDirection` never on a leaf. |

## Waves

| Wave | Goal | Tier | Visual | Depends on | Owner input |
| --- | --- | --- | --- | --- | --- |
| **U0** | Census, measurements, ADR 0132, owner questions put | Light (one logic reviewer on ADR 0132 and the census) | No | — | Q-U1…Q-U5 answered 2026-09-29; raises RQ1–RQ12 |
| **U1** | The stored U and wall C in the domain; no shape validates | **Full** + security (S2) | No | U0 (ADR 0132 accepted) | — |
| **U2** | The right corner, the U shell, engine limits, depth change | **Full** | No | U1 | — |
| ~~**U3**~~ | ~~Composing a U across three walls~~ **Split 2026-09-29 into U3a and U3b (R8)** | | | | |
| **U3a** — **Done 2026-09-29, closed at `38d6be7`** (see *U3a close-out*) | The U plan: a pure three-wall composition plan, no insert | **Full** | No | U2; Q-U3, RQ1–RQ17 (answered) | — ~~**2026-09-29: RQ18 open (drawer placement), non-blocking, default built**~~ **RQ18 answered 2026-09-29: round the corner; pan drawers first (ADR 0110 *N3 revised* 6)**. ~~**RQ19, RQ20 raised 2026-09-29 (ADR 0110 N9.4): non-blocking, defaults built**~~ **RQ19, RQ20 and RQ21 answered 2026-09-29 (ADR 0110 N10). ~~RQ19 (a) is built at `84bab2e`; RQ19 (b), RQ20 and RQ21 are owed before QA~~ RQ19 (a) was built at `84bab2e`; RQ19 (b), RQ20 and RQ21 at `3f53a62`; N11 at `27e28da`; RQ18–RQ23 are answered** |
| **U3b** — **Done 2026-09-30** (S0 `939a6ed`, S1 `2e028ac`, S2 `5bf8582`, S3 `b0cf2cc`, QA `8775b7c`, plus a comment fix commit (`5fb03ed`); see *U3b close-out*) | Generating a U: dispatch, uppers and hood, the minimum kitchen | **Full** | No | U3a | — |
| **U4** — **Done 2026-09-29, closed at `7f129fa`** (see *U4 close-out*; AC2, AC4 [visual], AC5 and the D14 light rig deferred to U5 AC9–AC11) | Drawing a U: shell, ~~reflected group~~ right-corner wrappers, picking, cameras, lights | **Full** | **Yes** | U2 | ~~Q-U5 (non-blocking)~~ none — Q-U5 answered 2026-09-29 (ADR 0132 d1–d2) |
| **U5** — **Done 2026-09-30, closed at `8a30dbb`** (S0 `664eee6`, S1 merge `739f9e2`, S2 merge `2001c55`, QA `0166e7a`, QA fixes merge `93e2a2b`, review fixes merge `8a30dbb`; see *U5 close-out*) | The editor and Step 1 carry a U (behind a test witness policy) | Light | **Yes** | U2, U4 | Q-U4 (wording) |
| **U6** | The switch: U's approved bounds; the card goes live; casts deleted | **Full** | No | ~~U3~~ U3b (2026-09-29), U4, U5; **Q-U1, Q-U2, RQ1, RQ8** (all answered 2026-09-29) | — |
| **U7** — **re-planned 2026-09-30** (see *U7 — the plan*) | Mobile gate, desktop line, e2e, captures — the phase gate | Light (S1–S3); S4 coordinator-only | **Yes** | U6 (QA and review closed) | Q-U7-1, Q-U7-2 (non-blocking); Q-U7-3 (blocks S4 (2) only) |

Order **U0 → U1 → U2 → {U3 ∥ U4} → U5 → U6 → U7**. **2026-09-29: U3 is U3a → U3b, so the order is
U0 → U1 → U2 → {U3a → U3b ∥ U4} → U5 → U6 → U7.** U3 (domain) and U4 (adapter) touch disjoint
packages and may run in parallel **only in separate worktrees** (`WORKFLOW.md` R2; worktree bases per
`agent-coordination.md`). QA gates review in every wave; the tree is frozen for every measurement (R1).

**Branch.** `m7b-u-shaped-rooms`, created when U1 starts from M7's tip or from `main` once M7's pull
request merges — the coordinator records which in the U1 close-out — pushed early and merged to
`main` through GitHub (`WORKFLOW.md`, *A milestone's branch is kept, pushed, and merged on GitHub*).

**2026-09-29: `m7-room-and-presets` carries three M7B docs commits above its M7 tip.** `dd9f63a`
(plan), `3e76ea6` and `5462a6c` (U0) were made on `m7-room-and-presets` before `m7b-u-shaped-rooms`
was branched from it at `5462a6c`. So the local M7 branch holds those 3 commits above `5fbcad7` (the
commit the M7B plan was read at, and M7's true tip), while origin's `m7-room-and-presets` is at
`8e7b59f`. The coordinator offered to move the local M7 branch back to `5fbcad7`. **The owner said:
"keep like this."** Consequence: pushing `m7-room-and-presets` as it stands would carry the M7B docs
commits into M7's pull request.

---

### Wave U0 — census, measurements, decisions (no production code)

**Goal.** Replace every [inf] above that a later wave depends on with a count or a measurement, write
ADR 0132, and put the owner questions with numbers. **Exit:** ADR 0132 accepted; each owner question
answered or carrying its interim; the later waves' reading lists corrected against the census.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S1 census** | (1) Every production site under `packages/*/src` and `apps/web/src` naming a wall letter, `DesignWall`/`WallId`, a shape literal, `rotated`, `depthMm` read as a wall, or a camera preset id; (2) the grep commands, run as `rtk proxy` (R9), quoted with their counts; (3) each site classified: *along-only* / *across or world* / *shape dispatch* / *display*; (4) each site's cost under D2 (β) and under α; (5) appended here as *U0 census* | none | §*Ground truth* G1–G17; D2; ADR 0129 (decision, alternatives, Amendment); `module-grid.ts`, `void-engine.ts:560-660`, `validate-design.ts:600-640, 900-960`, `along-wall-chain-shift.ts`, `corner-assembly-size.ts` |
| **S2 measurements** | (1) A `tsc` build of `packages/configurator-domain/src` at the wave base into the scratchpad (never the checked-in `dist`); (2) models of Q-U3 (a) and (b) over the Q-U1 candidate range, per-room outcome tables; (3) the minimum-kitchen predicate each option implies, with boundary pairs; (4) the clear floor between facing side runs at 600 and 700 for Q-U2; (5) wall A's odd-millimetre cases for D5 | none (scratchpad script, kept by name) | Q-U1–Q-U3; ADR 0108 A, C, E, G; ADR 0110 A1, A4, D2, E, H, I, M; ADR 0120 E; 7J's G5–G7 method (archived plan `:4061-4081`); `generation-priorities.ts`, `run-layout.ts`, `tall-end-rule.ts`, `occupied-depth.ts` |
| **S3 ADR 0132** | (1) Settle D1–D16 with the census's numbers (β or α; the U room key; the odd millimetre; across-room bounds; lights left open for U4); (2) its own sweep table; (3) ADR 0129 pointer *"the right-hand L question is answered by ADR 0132"*; (4) `decisions/README.md` index row | none (docs) | This plan's D-rows and sweep; ADR 0129, 0130, 0116, 0120; `documentation.md` |
| **S4 owner packet** | (1) Q-U1–Q-U5 with S2's tables; (2) answers recorded: ADR 0108 Amendment H, ADR 0110 Amendment N, ADR 0132; (3) this plan's D-rows and wave criteria corrected by dated line where an answer moves them | none (docs) | *Owner questions*; `documentation.md`, *A rule the owner described in conversation is not yet an invariant* |

- **Reading, logic reviewer:** this plan end to end; the census and S2's tables; ADR 0132's draft;
  ADR 0129, 0130, 0108 (B2, C, E, G), 0110 decisions 1–2.

**Acceptance criteria.**

1. **The census is reproducible.** Every count quotes the command that produced it; a reviewer
   re-running the commands gets the same counts. A site found later that the census missed is a U0
   finding recorded against it, not silently added to a later wave.
2. **Every owner-packet figure traces** to S2's script output at a named commit. No figure is
   estimated (R4).
3. **ADR 0132 exists, is Accepted after review, and decides** every D-row marked *ADR 0132's*,
   naming its alternatives and the measured fork counts behind β-vs-α.
4. **Each owner question is answered and recorded, or carries its interim**, and blocks exactly its
   named wave.
5. **Must not:** any change under `packages/*/src`, `apps/web/src` or any test directory
   (`git diff <base> --stat` over them is empty).

### U0 census — 2026-09-29, at `dd9f63a`

**Method.** The commands are in the U0 scratchpad script `u0-census.sh`, which is kept by name. It is
run from the repository root through `rtk proxy` (R9), over
`packages/configurator-domain/src packages/persistence/src packages/three-adapter/src apps/web/src`
with the paths **expanded by the shell**. A quoted `'packages/*/src'` pathspec matches nothing and
silently gives **0**, which happened once during this census and was caught before any count was
used. Headline counts (lines / files), condensed to three per line with values unchanged:

```
rtk proxy bash u0-census.sh
-w DesignWall: 85 / 18            -w WallId: 7 / 2               -w rotated: 13 / 8
-w RoomShape: 46 / 9              -w DesignRoomShape: 1 / 1      -w cornerDirection: 50 / 12
-w WALL_THE_CORNER_IS_TAKEN_FROM: 8 / 3                          -w wallLengthMm: 24 / 11
-w CameraPresetId: 13 / 4         -E "[ABC]": 96 / 22            -E "(L|linear|U)": 52 / 19
-E \.depthMm: 27 / 13             -E "(wallA|wallB|wallC|overview)": 67 / 12
files: 55
```

One extra grep looked for coordinate reads that carry no wall literal:
`rtk proxy git grep -n -E -e '(frame|position|record|column|member|origin|transform)\.(x|z)([^a-zA-Z]|$)' -- packages/configurator-domain/src`
(~~24~~ **27 lines** — corrected 2026-09-29 on U0's logic review, re-run with the same command). The adapter's frame readers were found with
`rtk proxy git grep -n -E -e 'frame\.(x|z|ry)|\.ry\b|yawRadians|rotation\.y' -- packages/three-adapter/src apps/web/src`.

**Classes:** *along* = reads only the along-wall coordinate; *across* = reads the across-wall or
world coordinate; *dispatch* = branches on shape or wall; *display* = words, ranks, cameras or copy;
*none* = not a wall site. **Cost:** *both* = a C or U arm is owed under α and under β; *0* = no
change; *α* / *β* = a fork only that representation needs.

| # | Site | Class | α | β |
| --- | --- | --- | --- | --- |
| U1 | `design.ts:48, 51` — wall and shape enums | dispatch | both | both |
| U2 | `room-transforms.ts:7, 34-49, 55-80` — `WallId`, `WALL_TRANSFORMS` | across | **α**: the C transform takes `W` | 0 (C reuses B's) |
| U3 | `void-engine.ts:545-546, 594, 613-615` — `rotated`, column key | along | both | both |
| U4 | `module-grid.ts:68` — key prefix; **a C body keys `A\|` today and collides with wall A** | along | both | both |
| U5 | 10 along-only expressions: `module-grid.ts:83, 93`; `commands/along-wall.ts:9`; `insert-fit.ts:105, 147`; `generate-kitchen.ts:670`; `merge-empty-columns.ts:146, 415`; `split-oversized-empty-columns.ts:143`; `void-engine.ts:1261` | along | 0 | 0 |
| U6 | `merge-empty-columns.ts:331` — `?? "A"` fallback | along | 0 | 0 |
| U7 | `queries/overflowing-placements.ts:50-56` — `wallLengthMm` | dispatch | both | both |
| U8 | Readers through `wallLengthMm`: `clip-empty-columns-at-wall-end.ts:86, 108`; `overflowing-placements.ts:35`; `validate-design.ts:1231` | along | 0 | 0 |
| U9 | `void-engine.ts:644-651` — `originOnWall` | across | **α**: C arm `x = W − centre` | 0 |
| U10 | `void-engine.ts:567` — `deriveFrame` → transform | across | **α**: pass the room | 0 |
| U11 | `void-engine.ts:1131` — `toColumnExtent` → transform | across | **α**: pass the room | 0 |
| U12 | `frozen-map-at-cabinet-depth.ts:508-520` — `atDepthM` → transform (**not in the plan's seed list, G5**) | across | **α**: pass the room | 0 |
| U13 | `validate-design.ts:617-625` — `reachesPastRoomAcrossWall` (the wall-A arm reads `max(B, C)`; the non-A arm is already right for C) | across | both | both |
| U14 | `validate-design.ts:917-960` — `findCornerOverlaps`, gaining the A∩C corner | across | both | both |
| U15 | `along-wall-chain-shift.ts:52, 127, 258` — the corner-taking wall becomes a set | dispatch | both | both |
| U16 | `corner-assembly-size.ts:63-68, 149, 295` — the right corner's pieces | dispatch | both | both |
| U17 | `run-end-panel.ts:121, 132, 146` — none for a U | dispatch | both | both |
| U18 | `generation/shell-design.ts:169-187, 321, 449-548` — the U shell | dispatch | both | both |
| U19 | `generation-priorities.ts:77-82, 256, 322`; `run-layout.ts:50-62` — composition | dispatch | both | both (β's reuse of B's algebra is void under Q-U5) |
| U20 | `generate-kitchen.ts:155-186` — shell and runs dispatch | dispatch | both | both |
| U21 | `room/room-policy.ts:113-121`; `room/validate-room.ts`; `room/corner-direction.ts`; `index.ts` | dispatch | both | both |
| U22 | `queries/design-projection.ts:70` — `WALL_DISPLAY_RANK` | display | both | both |
| U23 | Type positions only: `command-result.ts:37`; `describe-selection.ts:35`; `insert-fit.ts:74`; `validate-design.ts:704, 891`; `merge-empty-columns.ts:82, 181`; `void-engine.ts:383, 427, 526`; `corner-assembly-size.ts:52-119` | none | 0 | 0 |
| U24 | `fixtures/kitchen-l-design.ts` (29 literals); `migrate-design.ts:217, 278` | none | 0 | 0 |
| U25 | *(new)* the one canonical→world projection (plan D2) | across | — | **β** |
| U26 | `three-adapter/src/scene-sync.ts:181-182, 294-297` — mount at `frame.x/z/ry` | across | **α**: a wrapper per right-corner piece | **β**: a reflected group, **plus an unmirroring wrapper per body** (Q-U5) — 2 changes |
| U27 | `kitchen-shell.ts:31-47, 123, 153, 163, 188, 199` — wall C's plane | across | both | both |
| U28 | `void-mesh.ts:70` | across | 0 | **β** |
| U29 | `overflow-mark.ts` | across | 0 | **β** |
| U30 | `selection-outline.ts` | across | 0 (`DoubleSide` already covers the four −1 pieces) | **β** |
| U31 | `picking.ts` | across | 0 (verify the climb through a wrapper) | **β** |
| U32 | `stage.ts:252, 271-273, 339, 394-403` (cameras), `:107-108` (lights) | display | both | both |
| U33 | `kitchen-parts.ts:854-867` — reference corner widths | none | 0 | 0 |
| U34 | `apps/web/src/i18n/content.ts:288-295` — `crossesOnScreen` | display | both | both |
| U35 | `panel/panel-model.ts:1230-1318` — width note, follows U34 | display | both | both |
| U36 | `room/room-url-state.ts:114-118, 150-167, 192` | dispatch | both | both |
| U37 | `room/plan-preview-model.ts:202-219, 388-429, 722` (backlog 72, 76) | display | both | both |
| U38 | `room-draft.ts`, `room-query-sync.ts`, `room-screen.tsx`, `shape-picker.tsx`, `dimensions-form.tsx`, `generation-steps.tsx:240-254`, `room-issue-model.ts:94`, `price/starting-price.ts` — already U-aware (G11); the toggle is hidden (Q-U4) | dispatch | both | both |
| U39 | `messages/ro.json`, `ru.json`, `ro.d.json.ts` — the `wallC` camera leaf | display | both | both |
| U40 | `scene/camera-preset-store.ts`, `scene/scene-view.ts`, `configure-screen.tsx`, `three-adapter/src/index.ts` — typed preset ids | display | 0 | 0 |
| U41 | `rotated` meaning cookie rotation or appearing in a comment: `api/designs/[id]/route.ts:165`, `api/designs/route.ts:70`, `lib/server/visitor.ts:107`, `persistence/create-design-lock.ts:46`, `neon-configuration-repository.ts:105`, `void-mesh.ts:29`, `kitchen-parts.ts:2375` | none | 0 | 0 |

**Totals:** 41 rows, **22 owed under both, 8 no change, 6 α-only (U2, U9–U12, U26), 6 β-only rows
carrying 7 changes (U25, U26 ×2, U28–U31)**. The decision on these numbers is ADR 0132 decision 1.

**Findings against the plan's seed list (G5):** U4's collision, where a C body keys `A|` and would
collide with wall A; U12, which the seed list omitted and U1 S3 now lists; and the plan's claim that
*"occupied depth"* forks under α, which it does not, because it is a distance and not a coordinate.

### U0 measurements — 2026-09-29, `tsc` build of `src` at `dd9f63a`

The build is `npx tsc --project tsconfig.build.json --outDir <scratchpad>/domain-dd9f63a`, exit 0,
never the checked-in `dist`. The script is `u0-measure.mjs`, kept by name in the U0 scratchpad, and
was run as `rtk proxy node u0-measure.mjs`. Output excerpted: some lines are omitted and none is
altered. The full output is `u0-measure.out` beside the script:

```
## M1 walkway
depth 600: deepest floor body fridge-free-700 742 mm -> wall A min 2684; worktop line 620 mm -> 2440
depth 700: deepest floor body base-hob-oven 748 mm -> wall A min 2696; worktop line 720 mm -> 2640
held at every declared depth: wall A >= 2696

## M2 corners (engine range A 1760..6000, B/C 880..6000, step 1 on A)
depth 600: rooms 16964, X-leg overlaps 160, half-mm right X-leg centres 0, odd wall-A free runs 8480, min free run -40
depth 700: rooms 16964, X-leg overlaps 160, half-mm right X-leg centres 0, odd wall-A free runs 8480, min free run -40
witness 2701 x 1000 @600: A/base=900 B/base=320 B/wall=570 B/top=570

## M4 minimum kitchen (sink on A; hob on A or on the far = narrower side wall)
B=C=1000: smallest accepting A = 3000 (A=2999 refuses: true)
B=C=1599: smallest accepting A = 3000 (A=2999 refuses: true)
B=C=1600: smallest accepting A = 2400 (A=2399 refuses: true)
A=2700, B=6000 (fridge wall): smallest accepting C = 1600 (C=1599 refuses: true)
A=2999, B=6000 (fridge wall): smallest accepting C = 1600 (C=1599 refuses: true)
refused by the predicate on the step-100 grid: 1728 of 88434
```

M3, the composition model of the owner's arrangement with every residual default, and its `k = 2`
variant, are tabulated at ADR 0110 **N4** together with the witnesses. The drawer table is at **N3.6**.
The Q-U3 (a)/(b) comparison the slice table named was **dropped**, because the owner chose (c). **The
model is not the generator.** It models the core run, the fridge offset, the tall rule, the ovens and
the drawer count at planning depth 600. It does not model uppers, the bottle, the pan drawer or the
threshold drawer. U3-A3 holds the generator to its witnesses.

**What this closes and what it leaves.** Q-U1…Q-U5 are answered (relayed; see each question). ADR
0132 is written and is *Proposed* until the logic review accepts it. **RQ1–RQ12** (ADR 0110 N6) are
open with defaults. They gate U3, and RQ1 and RQ8 also gate U6. U1, U2, U4 and U5 do not wait on
them. **Later on 2026-09-29 the owner answered all twelve** (ADR 0110 N6; ADR 0108 H2, H3), and ADR
0132 was accepted on the logic review. The model was re-run on the revised rules
(`u0-measure-rq.mjs`, ADR 0110 N4′). ~~**RQ13–RQ17** (N6′) now gate U3 alone~~ **RQ13–RQ17 were answered the same day (N6′), so U3 waits on
no owner answer either**, and U6 waits on no owner
answer.

---

### Wave U1 — the stored U and wall C (domain; no shape validates)

**Goal.** A U document and wall-C placements are representable, bounded, validated and derived
through the void engine under ADR 0132's representation — and nothing a customer can reach changes.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S1 schema and wall identity** | (1) `"C"` wall, `"U"` shape, the U room key with its iff-refinement (D1); (2) `WallId` widened; (3) `wallLengthMm("C")` (D6); (4) `wallsOf(shape)` (D7), exported; (5) `cornerDirectionOf` per Q-U4's interim | `design.ts`, `room-transforms.ts`, `queries/overflowing-placements.ts`, `room/corner-direction.ts`, one new `room/walls-of-shape.ts`; `index.ts` | D1, D3, D6, D7; ADR 0132; ADR 0053, 0065 d5, 0129 D2, 0130 D3; `design.test.ts`, `overflowing-placements*.test.ts`, `corner-direction.test.ts` |
| **S2 storage bounds** | (1) Third wall run and `WALL_COUNT` (D8); (2) `MAX_*` re-derived; (3) confirm no `migrate-design.ts` arm is owed; (4) a max-packed U parses under the cap; (5) the route's 413 still fires one byte over | `design-bounds.ts` (+ `migrate-design.ts` only if S2 finds an arm owed) | D8; G15, G16; ADR 0019 (SEC-002), 0053, 0124; `design-bounds.test.ts`, `qa-5h.adversarial.test.ts`, the route's size-limit tests |
| **S3 geometry on wall C** | (1) Column keys `C\|…`; (2) wall-C **world** frames (α, ADR 0132 d1 — 2026-09-29): the C transform takes `W`; (3) ~~the one world-projection function~~ its three callers pass the room (census U10–U12); (4) along/origin helpers wall-aware (`originOnWall`'s C arm); (5) fit reads wall C | `module-grid.ts`, `void-engine.ts`, `room-transforms.ts`, **`frozen-map-at-cabinet-depth.ts` (added 2026-09-29, census U12)**, `commands/along-wall.ts`, `commands/insert-fit.ts` | D2, D10; U0 census rows for these files; `DEVELOPMENT-SPEC.md` §3, §4; ADR 0031, 0046, 0052 |
| **S4 validation and display** | (1) Across-room bounds (D10); (2) `findCornerOverlaps` at A∩C; (3) opposite side runs never corner partners; (4) `WALL_DISPLAY_RANK` gains C; (5) `endsPastWall` on C | `validate-design.ts`, `queries/design-projection.ts` | D4, D10; ADR 0069, 0090 B; `validate-design*.test.ts` |

- **Reading, QA:** this wave's rows and criteria; ADR 0132; `engineering-conventions.md`, *Coverage
  an adversarial pass owes*; skill `javascript-testing-expert` (fast-check); the slice diff.
- **Reading, logic reviewer:** D1–D10; ADR 0132, 0053, 0065, 0069, 0089, 0129, 0130; the wave diff
  with `void-engine.ts`.
- **Reading, clean-code reviewer:** the slice table; `engineering-conventions.md`; the wave diff.
- **Reading, security reviewer (S2 only):** D8; ADR 0019's SEC-002 section; ADR 0114's write rules;
  `apps/web/src/app/api/designs/[id]/route.ts`; *Why nothing is reachable before U6*'s caveat.

**Acceptance criteria.**

1. **[met]** **The L and the straight kitchen are byte-identical.** Every recorded generation baseline
   and every L or straight design the product generates serialises exactly as at the wave base;
   `git diff <base> -- packages/three-adapter/src/kitchen-parts.ts packages/three-adapter/reference/`
   is empty. **[unit] + [parity]** — QA: 18,203 L/straight rooms compared base vs tip, 0 mismatches;
   the `kitchen-parts.ts`/`reference/` diff is empty.
2. **[met]** **Old documents still load** (*property*): every document valid at the wave base — the
   fixture corpus plus generated L and straight rooms — parses and validates with identical findings
   after. **[prop]** — QA: 13,628 old documents identical.
3. **[met]** **The schema's shape.** A U with its C key parses; a U without it, and an L or straight
   room with it, are refused at the schema. A wall-C placement in an L or straight document is
   **marked** overflowing, never refused (D6). **[unit]**
4. **[met]** **`wallsOf`** is exactly `[A]`, `[A, B]`, `[A, B, C]`; `wallLengthMm` follows D6 for all
   nine (shape, wall) pairs. **[unit]**
5. **[met]** **Storage.** The re-derived `MAX_PLACEMENTS`, `MAX_EMPTY_COLUMNS` and `MAX_DESIGN_BYTES`
   are reported with the before/after figures from the test run, not from G16's arithmetic; a U packed
   to `MAX_PLACEMENTS` with the narrowest catalogue body across three walls and three bands serialises
   under `MAX_DESIGN_BYTES` and parses; the write route answers 413 at one byte over. **[unit]** —
   shipped: `MAX_PLACEMENTS` 186→279, `MAX_EMPTY_COLUMNS` 1262→1893, `MAX_COLUMN_EXTENTS` 186→279,
   `MAX_DESIGN_BYTES` 349,656→523,972 (`7e3b99d`).
6. **[met]** **Mirror equivariance** (*property*; ~~under β~~ **under α, 2026-09-29: `mirror` also maps
   world `x ↦ W − x`; it covers validation and voids only, never composition, which the owner ruled
   independent (Q-U5)**): with `mirror(D)` swapping walls B ↔ C and sending
   a wall-A centre `a` to `W − a`, for generated U designs `validateDesignForCatalog(mirror(D))` equals
   the mirror of `D`'s findings and `recomputeVoids(mirror(D))` the mirror of `D`'s voids. `mirror` is
   a reviewed test utility. **Sabotage both ways (R6):** break the C arm of one S3 helper → red; move
   an unrelated wall-A body → green. **[prop]** — QA: 1000 runs, `mirrorUDesign` reviewed, sabotage
   both ways confirmed. **Logic review R1.3 (2026-09-29): the property ran on arbitrary U documents
   and a restated fixture, not generated U kitchens — owed a re-run on real U shells in U2-A2.**
7. **[met]** **The right corner is checked like the left.** A recorded span on wall C overlapping a
   body at the A∩C corner reports `RECORDED_SPAN_OVERLAPS_CORNER_BODY` exactly where its wall-B twin
   does at A∩B; B and C spans never compare against each other. **[unit]** — **Logic review R1.4
   (2026-09-29, disagreement, not a bug):** the A∩C sweep also runs on L/straight documents, where a
   stray wall-C span can produce an extra mark-severity finding; AC2 is not at risk. Gating the sweep
   on `wallsOf` is optional and recorded, not done.
8. **[met]** **Wall C keys never collide** with wall B's at the same along value; §11 rows 1, 17 and
   18 hold on wall C with no UI. **[unit]**
9. **[met]** **Must not:** `isShapeBuildable("U", APPROVED_ROOM_POLICY)` is true (checked at every
   commit); `cornerDirection` is read anywhere but `cornerDirectionOf`; a product bound enters
   `DesignRoomSchema` (ADR 0108 alternatives). **[unit] + [review]**

### U1 close-out — 2026-09-29, at `836a4f3`

**Shipped.** The U room and wall C are representable, bounded, validated and derived through the void
engine under ADR 0132's representation (α, wall C a world wall); nothing a customer can reach changes
(`isShapeBuildable("U", …)` is still false). Commits, in order, all with hooks: S1 schema and wall
identity `f1d4813` (also carries three `apps/web` data arms forward from U5 S1 so web stays green:
`SHAPE_SHORT_MESSAGE_KEY.U`, `DESIGN_ROOM_LENGTHS.U`, `display-order-convergence`); S2 storage bounds
`7e3b99d`; S3 wall C's world geometry `54501bb`; S4 validation and display `c25e5a4`; QA tests
`c45cbdb`; review round 1 fixes `836a4f3`.

**Deviation.** S3 touched 6 production files — `module-grid.ts`, `void-engine.ts`, `room-transforms.ts`,
`frozen-map-at-cabinet-depth.ts`, `commands/along-wall.ts`, `commands/insert-fit.ts` — one over the
plan's 5-file limit; the plan named `frozen-map-at-cabinet-depth.ts` as a 2026-09-29 addition from the
U0 census (row U12), and the dispatch recorded the overage rather than splitting the slice.

**Verification.** Tier Full plus security on S2, as the wave table names. QA: AC1 18,203 L/straight
rooms compared base vs tip, 0 mismatches, `kitchen-parts.ts`/`reference/` diff empty; AC2 13,628 old
documents identical; AC6 a mirror-equivariance property, 1000 runs, reviewed `mirrorUDesign` utility,
sabotage both ways confirmed. No production defect found. Coordinator verification at `836a4f3`: domain
238 files / 5116 tests passed, three-adapter 98 / 3642, persistence 33 / 730, web 269 / 4760;
`kitchen-parts`/`reference` diff against wave base `0e6d332` is 0 bytes. `pnpm ci:local` has not been
run; it runs before the branch's first push (not yet pushed).

**Reviews.** Logic: approve. R1.1 (rename `widthM` → `roomWidthM`) and R1.2 (the one-reader scan allows
`design.ts` exactly once) fixed in `836a4f3`. R1.3 and R1.4 are notes, not defects — carried above at
their criteria and owed to **U2-A2** (R1.3) or left optional (R1.4). Clean-code: approve, C1.1 (a
shared `assertGeneratedOnTwoWalls` helper) fixed in `836a4f3`. Security: pass, three findings, none
blocking — recorded in `docs/BACKLOG.md`/`docs/backlog/open.md` entries 92–94: S1.1 (Low, the largest
storable row grows to 523,972 bytes, ADR 0019 SEC-001/DB-002's accepted risk should be re-measured at
M8's launch gate), S1.2 (Low, an optional per-shape empty-column count check, not built), S1.3 (Info,
the 12-mechanisms-per-body pricing assumption predates this wave, still undeclared as a constant).

**Documentation updated.** This close-out section and the criteria checkmarks above; `docs/STATUS.md`
*What to do next* and the M7B summary bullet; `docs/BACKLOG.md` and `docs/backlog/open.md` (entries
92–95).

**Deferred work.** Wall C's frozen-map/depth-change behaviour (D9) stays pinned by an `it.fails`, owed
to **U2 S3**. AC6's re-run on generated U shells is owed to **U2-A2** (R1.3). The A∩C sweep's optional
`wallsOf` gate is unscheduled (R1.4, backlog 95). M8's launch gate owes a re-measure of the per-row
storage budget (backlog 92).

---

### Wave U2 — the right corner, the U shell, engine limits

**Goal.** A U shell with two structural corners exists, validates with zero findings across the
engine's U range, survives a depth change, and `validateRoomInput` can map a U — under a test
witness policy only.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S1 the right corner** | (1) Corner sizing for two corners sharing wall A (D5); (2) the right corner's placements (D4); (3) `cornerOf`; (4) the odd-millimetre rule; (5) run-end panel answers none for a U (D11) | `corner-assembly-size.ts`, `run-end-panel.ts`, `index.ts` | D4, D5, D11; ADR 0021, 0025, 0066, 0120 A, 0125, 0132; 7D6/7D7's criteria (archived plan, by section); `SPEC.md` *Corner base* |
| **S2 the U shell and limits** | (1) `buildUShellDesign` + `uShellFloorRuns`, sharing the tiling helpers (ADR 0130 D5's pattern); (2) `UWallBounds`, `BuildableShapes.U`; (3) `ENGINE_ROOM_LIMITS.U`, derived and literal-free; (4) `validateRoomInput`'s U arm and mapping (D1); (5) generation's shape dispatch refuses a U cleanly until U3 | `generation/shell-design.ts`, `room/room-policy.ts`, `room/validate-room.ts`, `generation/generate-kitchen.ts` (dispatch only) | D1, D5, D16; ADR 0108 decisions 2–8, B1, B2; ADR 0110 decision 1, B; ADR 0116 decision 1; ADR 0130 D5; `shell-design.ts:1-140, 270-320, 500-560` |
| **S3 depth change on a U** | (1) The corner-taking walls per shape (D9); (2) wall C's chain slides; (3) the frozen map at a depth change reads wall C | `along-wall-chain-shift.ts`, `frozen-map-at-cabinet-depth.ts` | D9; ADR 0073, 0088, 0089, 0090, 0097; `along-wall-chain-shift.ts` header |

- **Reading, QA:** as U1, plus ADR 0089 and the 7D6/7D7 criteria; the slice diff.
- **Reading, logic reviewer:** D4, D5, D9, D11, D16; ADR 0021, 0025, 0089, 0108 (B, E), 0110 (B),
  0116, 0120 A, 0125, 0132; the wave diff.
- **Reading, clean-code reviewer:** the slice table; `engineering-conventions.md`; the wave diff.

**Acceptance criteria.**

1. **[met]** **The right corner mirrors the left** (*property*, engine U range): the right corner's four
   placements carry the left's build ids, and equal the left corner computed for the room with B and
   C swapped, reflected in `x = W/2`. The two X-legs never overlap; the right X-leg's far edge is `W`,
   ~~less at most the odd millimetre ADR 0132 places~~ **exactly (2026-09-29, ADR 0132 d4)**. No
   half-millimetre centre anywhere. `ENGINE_ROOM_LIMITS.U.wallA.minMm` is 1800, derived from the two
   X-legs' reference widths. **[prop]** — QA green; review R1.1 (2026-09-29) found `cornerOf`
   misreported an approved L's only corner as "right" at wall A ≤ 900 mm even length, fixed in
   `7140eee` (any non-U room now answers "left"; regression test at 880/900/901).
2. **[met]** **The shell** (*property*, ≥ 200 samples over the engine U range plus every boundary): zero
   `validateDesignForCatalog` findings of either severity; every empty column ≤ 800 mm; floor and
   wall-only tiles on each of A, B and C cover their runs with no gap and no overlap; nothing recorded
   over either corner zone. **[prop]** — the implementer found and fixed a 1 mm mid-wall gap for an
   odd wall A during S2.
3. **[met]** **Depth change** (600 → 700 on U shells): wall C's placements slide by exactly what wall B's do
   in the room with B and C swapped; wall A does not move; corner widths are frozen; the 30 mm
   top-row residue is present on both side walls. **[unit] + [prop]** — `cornerTakingWallsOf` (S3,
   `5e53682`); the round-2 logic review accepted that there is no direct `slideReserveMm` wall-C test
   because it is private and unreachable — **owed to U3** once its composer builds a wall-C run.
4. **[met]** **No run-end panel** for any U: `runEndPanelSeatM` answers none (*property* over the range); the
   L's and the straight room's answers are unchanged. **[prop]** — review R1.4 made this an explicit
   `shape === "U"` guard in `runEndPanelSeatM` (`7140eee`).
5. **[met]** **Engine limits and mapping.** `ENGINE_ROOM_LIMITS.U` holds no literal (a test reads its sources);
   under a witness policy stating U, a valid U input maps to D1's shape and its issues name only
   `shape`, `wallA`, `wallB`, `wallC` or `height`, with **no number in any issue**; the approved policy
   still refuses a U. **[unit]**
6. **[met]** **The L and the straight kitchen are byte-identical** (U1-A1 re-run); `buildLShellDesign` still
   refuses a U with `ROOM_NOT_L`. **[unit]** — QA: 18,203 compared, 0 mismatches; 13,628 old documents
   identical.

### U2 close-out — 2026-09-29, at `7140eee`

**Shipped.** A U shell with two structural corners exists, validates with zero findings across the
engine's U range, survives a depth change, and `validateRoomInput` maps a U — under a test witness
policy only (`isShapeBuildable("U", …)` still false; the approved policy is unchanged). Commits, in
order, all with hooks: S1 the right corner (synthesized L room `(W, C)`; wall B relabelled to wall C;
X-leg at `W − leftCentre`; `cornerOf`; `twoCornersWallAMinimumMm` = 1800) `c14abb4`; S2 the U shell and
engine limits (`buildUShellDesign`; wall C reuses wall B's tiling plus F7's 100 mm reserve;
`ENGINE_ROOM_LIMITS.U` derived; `validateRoomInput` gains a U arm; `generateKitchen` refuses a U) `065658f`;
S3 depth change (`cornerTakingWallsOf`; wall C slides the way wall B does) `5e53682`; QA tests
`7efbf2b`; review round-1 fixes `7140eee`.

**Verification.** Tier Full. QA: oracles were self-mirror through `mirrorUDesign`, 200 samples plus
about 80 boundary rooms. AC6 byte identity: 18,203 compared, 0 mismatches; old documents 13,628
identical. No production defect found by QA. Coordinator verification at `7140eee`: domain 243 files /
5238 tests (built fresh); three-adapter 98 / 3642; persistence 33 / 730; web 269 / 4760; the
`kitchen-parts`/`reference` diff against wave base `8e3cf5c` is 0 bytes. `pnpm ci:local` has not been
run; it runs before the branch's first push (not yet pushed).

**Reviews.** Round 1, logic — changes required, all fixed in `7140eee`:
- **R1.1 (High, a real defect QA missed).** `cornerOf` reported an approved L's only corner as "right"
  at wall A ≤ 900 mm, even length. The customer can reach this (min 900), and U4 would have mirrored
  it. Fixed: any room that is not a U answers "left". A regression test covers 880/900/901.
- **R1.2.** `isShapeBuildable` accepted prototype-named tags — predates U2; fixed with `Object.hasOwn`.
- **R1.3.** Two sources of truth for corner-taking walls: `WALL_THE_CORNER_IS_TAKEN_FROM` retired from
  the exports; `ownsTheCorner` and `slideReserveMm` now read `cornerTakingWallsOf`. Discharges ADR 0132
  d7.
- **R1.4.** D11 is now an explicit `shape === "U"` guard in `runEndPanelSeatM`.
- **R1.5.** A comment fix.

Round 1, clean-code — changes required, fixed in `7140eee`: C1.1 one shared `roomForTheRightCorner`;
C1.2 and C1.3 shorter shell functions; C1.4 one `apps/web/tests/support/fabricated-u-policy.ts`.

**Round 2 logic review: approve, no findings.** One accepted gap: there is no direct `slideReserveMm`
wall-C test, because it is private and unreachable. **Owed to U3** — a direct test, once its composer
builds a wall-C run.

**Documentation updated.** This close-out section and the criteria checkmarks above (AC1–AC6);
`docs/STATUS.md` *What to do next* and the M7B summary bullet; `docs/backlog/open.md` and
`docs/BACKLOG.md` entry 94, closed — AC6's mirror property now runs on real `buildUShellDesign`
outputs, zero findings, voids mirroring, which discharges backlog 94 (R1.3 from U1).

**Deferred work.** The direct `slideReserveMm` wall-C unit test, owed to **U3** once its composer
builds a wall-C run (round-2 review's accepted gap).

---

### U3a close-out — 2026-09-29, at `38d6be7`

**Shipped.** `planUKitchenComposition`, a pure three-wall U plan; it inserts nothing and nothing calls
it from `generateKitchen`. Commits, in order, on `m7b-u-shaped-rooms`, not pushed: S1 `d3db323`, S2
`9ca72bb`, S3 `e443ed2`; RQ18 fix `44ad180`; N9 fixes `711d3d0`; RQ19 (a) `84bab2e`; N10 fitting rule
`3f53a62`; QA `79f84ca` and its guard fix `6527ba3`; N11 fix `27e28da`; QA round 2 `76392f0`; B0
invariant `0b1ef7e`; clean-code refactor `38d6be7`. Architect documents: `10212fd`, `5055cf8`,
`b0f6e83`, `458cbaa` (ADR 0110 N9, N10, N11).

**Owner answers recorded.** RQ18–RQ23; the tall oven is always kept; wall A "Drawer cabinet wins";
far-wall "Pantry wins"; RQ23 "Bottle + drawers". The two selections named in quotes are relayed
selections, not verbatim owner text.

**Verification.** Tier Full. QA round 1 green at `79f84ca`, round 2 green at `76392f0`, 0 production
defects in each. Coordinator's own run at `38d6be7`: domain 253 files / 5407 tests green; the
L/straight digest `3ed0b98c…3fd1` is unchanged (AC4); the plan digests are byte-identical across the
refactor. Grid: 86,706 rooms composed, largest bare end 500/500/500, drawer histogram
4968/27118/13172/14572/9937/16939. **Implementer-reported, not re-run by the scribe:** three-adapter
108 / 4038 and web 269 / 4760 green. `pnpm ci:local` has not been run; the branch is not pushed.

**Reviews.**
- Logic, round 1: changes required, 4 findings, all ruled in ADR 0110 N11 and fixed (`27e28da`).
- Logic, round 2: approve, with one test-coverage minor, fixed in `0b1ef7e`.
- Clean-code, round 1: changes required (Dispatch B's refactor, `38d6be7`).
- Clean-code, round 2: approve with minors, deferred as below.

**Deviations, with rationale.** U3 was split into U3a and U3b (R8) on 2026-09-29. The N9, N10 and N11
rulings each changed behaviour after the first slices shipped, because owner answers RQ18–RQ23 and the
logic review's round-1 findings arrived mid-wave; each is recorded in ADR 0110 and its tests were
re-pinned rather than the code tuned to a model.

**Documentation updated.** This close-out, the wave table row and the stale U3a row text above;
`docs/STATUS.md` (M7B phase-table row, *What is open right now*, and a new RESUME HERE block replacing
U3a's in-progress one); ADR 0110 N9–N11 by the architect (commits above).

**Deferred work.**
- **U3b S0, in progress:** test fixtures, `u-core-priorities.ts`, one placement helper, the single
  run-direction fact, a `FridgeWallLayout` union, the `cornerOf` comment reflow, and the
  `bottleWidthMm` = 300 pin.
- **U6:** the literal `2700`/`1000` in `APPROVED_U_FLOOR_MM` (a recorded minor, not in S0).
- **U3b S1 (N11.6):** in 30,450 rooms with the fridge on C, wall A's remainder sits at its low end.
  The plan carries only widths, so U3b's generated positions must equal the plan's. The criterion is
  in U3b AC1. **Resolved 2026-09-29 by ADR 0110 N11.8:** wall A's remainder moves to its high end in
  every U (31 329 rooms at HEAD). Owner question RQ24 is non-blocking, with default (A) built.

---

### U4 close-out — 2026-09-29, at `7f129fa`

**Shipped.** The adapter draws a U: the shell with wall C, the right corner's four wrappers, picking
through a wrapper, cameras (`wallC`, a U overview), and a cutaway of the walls the eye stands in or
behind (`cutawayWallsFor`, `applyCutaway`), which survives a sync. Not pushed. Commits, in order, all
2026-09-29 on `m7b-u-shaped-rooms`: S1 `a638f0a`, S2 `a090398`, S3 `b3c9e10`, merged at `7de0bd8`; QA
round 1 `e223e44` (RED: the camera eye stood behind the opposite wall in narrow Us); adjudication
`ab6d285` (ADR 0132 Amendment A); fix `e752ac3`, merged at `df91e82`; QA round 2 `60d4875` (RED: wall A
was not cut); fix `cde76ea`, merged at `9178de8`; review-round-2 adjudication `4eb5058` (ADR 0132 A8);
round 3 `4a0d63c`, merged at `91ae4d3`; QA round 3 `9263a70` (RED: a U's recorded cut was re-applied to an
L); round 4 `2a13d4f`, merged at `7f129fa`.

**Verification.** Tier Full. Coordinator's run at `7f129fa`: the three-adapter suite, 112 files and 4090
tests green. **Implementer-reported, not re-run by the scribe:** web 269 files / 4760 tests green.
Logic review round 3: "minor concerns"; the round-2 blocker is resolved, with 0 sight lines crossing an
uncut zone over 223,686 room-depth cases. `pnpm ci:local` has not been run; the branch is not pushed.

**Reviews.**
- Review round 2: logic BLOCKER (A2's run bound; ruled a contract defect, ADR 0132 A8.1), clean-code
  approve with 2 must-fix items.
- Review round 3: logic "minor concerns" (findings 1–3 below); clean-code approve with minors.

**Owner answers recorded.** Q-U4-cam: "Hide them" (already in ADR 0132 A8.3).

**Deviations, with rationale.** The reflected-group design was replaced by right-corner wrappers (ADR
0132 d1–d2). Two QA REDs and one blocker changed the camera contract mid-wave (ADR 0132 Amendment A, A8),
and the run bound in A2 was withdrawn. U4's visual criteria and the D14 light rig were not built or
captured, because no U reaches a web surface before U5 (A8.5).

**Documentation updated.** This close-out and the wave-table row; U5 S2 (5) and S0 text below;
`docs/STATUS.md`; ADR 0132 A8.2 (dated widening) and new A8.7; ADR 0110 N11.9 (RQ26 answered).

**Deferred work, with owners.**
1. **U5 S2 (5) is widened** (logic finding 1, MEDIUM): the web recomputes `cutawayWallsFor` and calls
   `applyCutaway` on every camera change, every change of `designRoom` or `cabinetDepthMm`, every new
   `stage`, and after mounting an overlay. Owner: U5 S2.
2. **`room: designRoom` to `syncVoidMeshes`** at `kitchen-stage.tsx:359`; consider making `room` required
   on `syncVoidMeshes` and `applyRecordedCutaway`. Owner: U5 S0 and S2.
3. **Known limits (ADR 0132 A8.7), LOW:** the cut rule ignores eye height (bound by
   `eye.y < KITCHEN_TOP_M` if orbit reports arrive); in the engine band (W < 1.91 m) `wallA` cuts C, not
   customer-reachable. Owner: none until reported.
4. **U5 S0 clean-up:** see U5 S0 item (6).
5. **Visual items** (AC2, AC4 [visual], AC5, D14): U5 AC9–AC11, unchanged.

---

### U3b close-out — 2026-09-30

**Shipped.** `generateKitchen` composes a U through `insertBody` alone, with the hood and the back-wall
voids, and Step 1's minimum-kitchen gate agrees with it. Not pushed. Commits, in order, on
`m7b-u-shaped-rooms`:
- **S0 `939a6ed`:** behaviour-free apart from the deviation below. Shared U test fixtures,
  `u-core-priorities.ts`, one `placedInSequence`, `WallAReadingDirection`, the `FridgeWallLayout` union,
  the `bottleWidthMm` pin.
- **S1 `2e028ac`:** `generateKitchen` composes a U. N11.8's justification (`justifiedToTheLowEnd`) and
  N11.9's back-wall fill (`withTheBackWallFill`).
- **S2 `5bf8582`:** uppers and hood, `upper-policy.ts`.
- **S3 `b0cf2cc`:** `UMinimumKitchen` and the H3 gate in `validateURoom`.
- **QA `8775b7c`:** green, 0 production defects.
- **Comment and test-name fix:** comment fix commit (`5fb03ed`).

**Verification.** Tier Full. Domain suite 268 files / 5533 tests, from QA's run (not re-run by the
scribe). Measured, as reported to the scribe by the coordinator:
- Plan digests equal N11.9's model: h 2600 `6046ca18…`, h 2199 `43097f1c…`, engine band `d4a63e4d…`.
  The L/straight digest `3ed0b98c…3fd1` is unchanged (AC4).
- Grid: 86,706 rooms composed and 1,728 refused (= H3); every span matches the plan on all three walls;
  21,501 fills.
- QA: 97,868 boundary rooms, gate ⇔ generator, 0 mismatches.
- Logic reviewer: 4,356 generated U rooms, 0 throws, 120 refusals (= H3); the hood over the hob in every
  U; no upper outside a floor run or over a body taller than 1500 mm; a large U's wall A has only the
  hood.

`pnpm ci:local` has not been run; the branch is not pushed.

**Reviews.**
- Logic: approve, 4 minors.
- Clean-code: approve, with minors. Findings 1–2 (stale comments) are fixed in the comment fix commit.
  Findings 3–7 are deferred (below).

**Deviations, with rationale.**
- **S0 was not test-only.** The plan said `tests/support/u-room.ts`, test-only, no count change. What
  shipped is `u-plan-fixtures.ts`, some production refactor, and +1 test. No rationale
  was handed to the scribe beyond the fact; the coordinator may add one.
- **Four criterion corrections**, recorded under *Dated plan corrections, 2026-09-30* in Wave U3b:
  AC6 and S2 item (2); AC1's R6 clause; the S1 note on `slideReserveMm`; the S0 row.

**Documentation updated.** This close-out and the wave-table row; U3b's dated corrections; U5 AC6;
`docs/STATUS.md`; `docs/BACKLOG.md` and `docs/backlog/open.md` (entries 96 and 97).

**Deferred work, with owners.**
1. **Owner U6, as a named S0-style test-support item (clean-code findings 3–7):**
   - shared oracle constants for H3's figures;
   - `WALL_ROW_FLOOR_MM`, `LARGE_U_TOTAL_MM` and `isLargeURoom` are duplicated;
   - `?? 0` on `wallCMm` in `slide-reserve-wall-c.test.ts`;
   - the long support helpers `floorFindings`, `upperFindings`, `owedUpperFindings` and
     `wallCabinetVerdictsOnWallA`;
   - `generate-kitchen.ts`: four shape probes and its 857 lines;
   - `justifiedToTheLowEnd`'s home and the `wall-a-remainder:A` id constant.
2. **Backlog 96** (the engine's minimum-kitchen figures omit the 100 mm reserve): latent; U6 brings the
   approved 1000.
3. **Backlog 97** (generation below the 2200 ceiling floor throws): unreachable under approved heights.

---

### U5 progress — 2026-09-30 (superseded by *U5 close-out* below)

~~U5 in progress: S0 merged at `664eee6`, S1 at `739f9e2` (web 273 files / 4824 tests), S2 in a worktree;
AC6 corrected to two leaves per locale; S1's visual-review items were desktop 900–1180 px label overlap
and marked-wall labels (about 117 px of reason text) not guaranteed apart; QA, review and the visual pass
still owed.~~ **All of it is resolved; see the close-out below.** The AC6 correction stands (AC6 below).

---

### U5 close-out — 2026-09-30, at `8a30dbb`

**Shipped.** The editor and Step 1 carry a U, proved under a witness policy; the card is not live (U6).
Not pushed. Commits, in order, on `m7b-u-shaped-rooms`:
- **S0** `7dfa6de` (merge `664eee6`).
- **S1** `baeac9d` and `b4bfd8b` (merge `739f9e2`).
- **S2** `9424831` (merge `2001c55`).
- **QA** `0166e7a`: e2e through a PUT-seeded U, Playwright `20 passed`.
- **QA fixes** `55aee23` (merge `93e2a2b`): marked facing labels never overlap; 4 stale U e2e tests
  restated per Q-U4 (b); the `linear-flow` chip-count race.
- **Review fixes** `212b49a` (merge `8a30dbb`): label width guarded by a glyph-advance table,
  `PLAN_LABEL_REASON_MAX_EM = 11.7`, plus a new "beneath" arrangement; `carriesCornerDirection(shape)` in
  the domain and `ONE_HANDED_SHAPES` deleted; the circular `(C, right)` projection cases labelled as
  derived; `RoomScreen` passes `policy` through to the URL parse and `draftStateOf`, with a new 1A→1F U
  walk under the witness policy; the `hydrate-and-configure.tsx` comment corrected.

**Verification.** Tier Light. Measured by the coordinator at `8a30dbb`: web 279 files / 4887 tests,
domain 269 files / 5542 tests. **Implementer-reported, not re-run by the scribe:** three-adapter 4091;
full e2e `540 passed, 2 skipped, 0 failed`. `pnpm ci:local` has not been run; the branch is not pushed.

**QA.** The U e2e route needs no production seam: PUT accepts a U, because the write path checks schema
and catalogue, not room policy. 0 overlaps in 714 real-page label pairs at 900–1180 px. All findings
resolved (`55aee23`).

**Reviews.**
- **Logic:** minor concerns, no blocker. Findings 1–4 fixed in `212b49a`. Findings 5–6 are recorded
  below: 5 is the unreachable arm; 6 is U6's slice and AC text (dated lines in Wave U6 and U7).
- **Visual** (AC verdicts): AC9 PASS. AC10 PASS for 3000³, 4500/3000/3600 and 6000³ at both viewports;
  on the phone overview, wall A's middle fills the frame and B/C are slivers, as revised by D13 / ADR
  0132 A. AC7 PASS for Step 1: 18 screenshots pixel-identical to pre-M7B `dd9f63a`; the editor was
  compared by inspection only. Labels pass; one ru clip at 900 px, fixed in `212b49a`.
- **AC11 / D14 lights: KEEP the rig** (ADR 0132 Amendment B). Wall-C fronts measure about 3.6% darker
  than wall B's (RGB 212 against 220; base fronts the same, both viewports). `stage.ts` does not change.
  The owner was informed and did not object. This discharges "U6 does not start without it".

**Deviations, with rationale.**
- AC11 changed nothing in the rig: the measurement did not justify a mirrored key light (shadow cost, risk
  to the L, about 4% gain).
- 4 U e2e tests written before Q-U4 were restated, not deleted (Q-U4 (b): no toggle, no direction).

**Known limit, kept.** The `crossesOnScreen (C, right)` arm is unreachable in the product (a U is always
left-hand). It is kept and documented.

**Documentation updated.** This close-out and the wave-table row; U6's slice text and AC2, U7's AC3 and
a new e2e line (dated below); ADR 0132 Amendment B; `docs/STATUS.md`; `docs/BACKLOG.md` and
`docs/backlog/open.md` (entries 98–100).

**Deferred work, with owners.**
1. **U6:** the four dated lines below (S1 (1), AC2, an e2e; U7 AC3 restated).
2. **Backlog 98** (seeded-L flash on reload; a latent cross-request store write): not a U6 blocker; no
   owner.
3. **Backlog 99** (plan-preview label fit, three known limits): needs a copy or layout decision; no owner.
4. **Backlog 100** (six orphan test-database rows): the owner decides.

---

### Wave U3 — composing a U (blocked on Q-U3) — **superseded 2026-09-29 by Waves U3a and U3b below**

**Goal.** `generateKitchen` composes a U by the owner's Q-U3 ruling, through `insertBody` alone,
and Step 1's minimum-kitchen gate agrees with it. **The slice table is provisional**: Q-U3 (b)
touches far fewer files than (a); the architect re-cuts it after the answer, by dated line.
~~**2026-09-29:** Q-U3 was answered (c) — ADR 0110 N. The re-cut is owed **after RQ1–RQ12** (N6); R8
applies (a three-wall run with two cuts is closer to (a) than (b)), so expect U3 to split. Criterion 1's
*"exactly one oven"* reads **N3.8** (two towers in a large U); criterion 3's witnesses are N4's.~~
**2026-09-29, revised on the RQ answers:** Q-U3 (c) and RQ1–RQ12 are answered (ADR 0110 N, *N3
revised*). The re-cut ~~is owed after **RQ13–RQ17** (N6′) or their defaults~~ **waits on no owner answer: RQ13–RQ17
were answered the same day (N6′)**; R8 applies, so expect U3 to
split. Criterion 1's *"exactly one oven"* **stands for every U** (RQ5: the generator places one tower;
E4 unchanged). Criterion 3's witnesses are **N4′**'s. **Added criterion (RQ7):** in a large U the
hood stands over the hob, and wall A's wall and top rows carry **voids and no body**, so the editor
can insert middle and top units there.

**Re-cut 2026-09-29 (after U1 and U2 closed; every owner answer is in ADR 0110 N, *N3 revised*, N6
and N6′).** The table below and the criteria under it are **superseded by Waves U3a and U3b**, which
follow this section. They are kept for history. Each old criterion is re-homed as its dated line
says.

**Why two waves (R8).** The first reason is size: the owner's arrangement is a new composer (N2), not
a third wall added to the L's prefix-and-suffix cut, and it has twelve rules (*N3 revised* 1–12)
across roughly nine production files, well over one wave's limits. The second is the stop rule. N4′'s
witnesses are a *model*, and 7J A8's stop-and-report rule is cheapest to apply to a **pure plan**,
before any `insertBody`, shell or upper is involved. **U3a** ends when the plan reproduces N4′.
**U3b** wires that plan into `generateKitchen`. Each wave has its own QA and review, and U3b does not
start until U3a is committed. **The L's composer is not edited for the U** (`generation-priorities.ts`
keeps `TwoWallDispatch`, `run-layout.ts:12-16`). The U planner is a sibling that reuses the leaves:
`planLeftover`, `planTallEndBlock`, the dishwasher leaf, and `body-choice.ts`'s ids.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S1 the composer** | (1) The reading order over three walls per Q-U3; (2) the cut(s); (3) tall block, dishwasher, bottle, pan and threshold drawers per ADR 0110 Amendment N; (4) the plan's per-wall widths | `generation/generation-priorities.ts`, `generation/run-layout.ts`, `generation/tall-end-rule.ts`, `generation/dishwasher-beside-the-sink.ts`, `generation/optional-run-items.ts` | Q-U3's record; ADR 0110 A1, A4, D2, E, F, G, H, I, J–M, N; ADR 0120 E; U0 S2's model |
| **S2 generation dispatch** | (1) `shellRunsFor`, `buildShellFor`, `isFreeEndBody`, `replayGenerationLog` for a U; (2) uppers and hood; nothing over either corner zone | `generation/generate-kitchen.ts` | D17; ADR 0110 decisions 1–6, 7D2 c. 14; backlog 63 |
| **S3 the minimum kitchen** | (1) `UMinimumKitchen` in the policy types and engine limits; (2) the U predicate in `validateRoomInput`; (3) validator ⇔ generator property | `room/room-policy.ts`, `room/validate-room.ts` | Q-U1's record; ADR 0108 C, E and its implementation record |

- **Reading, QA:** Q-U3's ruling; ADR 0110 Amendment N; 7J's composition criteria (archived plan
  `:4214-4237`) as the pattern; `engineering-conventions.md`; skill `javascript-testing-expert`.
- **Reading, logic reviewer:** ADR 0110 (A1, D2, E, I, M, N), 0108 (C, E, H), 0117, 0120 E; the wave
  diff with `generation-priorities.ts`.
- **Reading, clean-code reviewer:** the slice table; `engineering-conventions.md`; the wave diff.

**Acceptance criteria.**

1. **Composition** (*property*, ≥ 200 samples over the Q-U1 range — the engine range if Q-U1 is
   unanswered — at h 2200, 2600, 3900, plus every boundary Q-U1/Q-U2 name): zero findings, no
   overflowing placement; deterministic (same room and `occurredAt` → byte-identical design and
   log); the log replays to the design; exactly one oven; no oven adjacent to the fridge; no upper
   over a full-height body or over either corner zone; a hood over the hob; each run's bare end
   < 600 mm except where an owner-ruled reserve applies; the along-path order matches Q-U3's ruling.
   **[prop]**
2. **Validator ⇔ generator** (7A2's form): over the approved U range, ≥ 200 samples plus the exact
   boundary pairs recorded in ADR 0108 Amendment H, the minimum-kitchen gate passes **iff**
   `generateKitchen` places a sink and a hob. **[prop]**
3. **Witnesses.** The U rooms U0 S2 modelled compose, through `generateKitchen`, to the bodies S2
   predicted. **If the generator measures otherwise, stop and report** — S2 was a model (7J A8's
   rule). **[unit]**
4. **The L and the straight kitchen are byte-identical** against every recorded baseline. **[unit]**
5. **Must not:** a generated body written other than by `insertBody` (ADR 0110 decision 2);
   `cornerDirection` read by generation (ADR 0129 D1). **[review] + [unit]**
6. **Added 2026-09-29 (RQ7, RQ5; ADR 0110 *N3 revised*).** Every U carries a hood over its hob. In a
   large U, wall A's wall and top rows hold **voids and no body**, and each void accepts a
   `wall-cabinet` insert through `insertBody`. Every U has **exactly one** oven: one `tall-oven-tower`
   with `base-hob-2drawer`, or `base-hob-oven` with no tower. The fridge and the tower stand at
   *N3 revised*'s count of base bodies from the corner. **[prop] + [unit]**

---

### Wave U3a — the U plan (pure; no insert) — cut 2026-09-29

**Goal.** A pure function `planUKitchenComposition(room, runs, columns)` returns a three-wall plan
(bases per wall, floor widths per wall, remainders, dropped roles, `minimumMet`) under ADR 0110 *N3
revised* 1–10, and it reproduces N4′'s witnesses. It inserts nothing and nothing calls it from
`generateKitchen` yet, so the L and the straight kitchen cannot move.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S1 the core run** | (1) A three-wall plan type (`UKitchenCompositionPlan`, `Record<DesignWall, …>` over A, B, C; the L's `TwoWallDispatch` untouched). (2) The fridge wall: the wider side wall, B when B = C, the other side wall if the fridge does not fit, dropped only if neither fits (*N3r* 2; RQ2, RQ9). The RQ9 branch is kept with a declared witness (ADR 0123) because its population measures 0. (3) The fridge after `n` bases **counted from the corner**: free end if the wall is ≤ 3000, 2 bases for 3001–4000, 3 bases above 4000, and `n` falls when it does not fit (*N3r* 3). (4) The back wall packed from the fridge corner: sink, dishwasher, preparation, hob. Overflow continues round the far corner. The dishwasher is dropped first, then the preparation (*N3r* 5; RQ4, RQ12). (5) `LARGE_U_TOTAL_MM` (10 000) is a named owner constant with its provenance (*N3r* 1) | new `generation/u-composition.ts`; `generation/run-layout.ts` (the plan type only) | ADR 0110 N1, N2, *N3 revised* 1–3, 5, N6; A1, A2, A4; ADR 0120 E (not applied to a U, N2); ADR 0123; `uShellFloorRuns` (`shell-design.ts:806-830`); `generation-priorities.ts:40-165` as the pattern, not an edit site |
| **S2 the tall layout and the oven** | (1) The fridge-to-free-end gap takes `tall-pantry` columns at every size: 600 mm each, the outermost widened up to 800; a 400–599 gap takes one pantry at its width; under 400 stays bare (*N3r* 4; RQ13). (2) The far wall: overflowed bodies, then door bases up to `n` from the corner. Overflowed bodies count toward `n`, and the tower follows them directly where they exceed it. Then **one** `tall-oven-tower`. Below 10 m, pantries stand outboard up to a three-column block (E2, E12, E3 clauses 1 and 4; RQ11). At 10 m or more the tower stands alone. The rest of the run is door bases (*N3r* 10; RQ5, RQ14). (3) A far wall ≤ 3000 takes the tower or block at its free end. **A lone tower stands with its remainder, ≤ 599 mm, bare** (RQ17), departing from E6.2 **for a U only**. `planTallEndBlock`'s L behaviour does not change. (4) Exactly one generated oven: the tower with `base-hob-2drawer`, or `base-hob-oven` (*N3r* 9; E4) | new `generation/u-tall-layout.ts`; `generation/tall-end-rule.ts` (only if a U-only option is needed, with an L byte-identity test); `generation/u-composition.ts` | *N3 revised* 4, 9, 10; N6′ RQ13, RQ14, RQ17; ADR 0110 E2, E3, E4, E6, E12, I; `tall-end-rule.ts` whole (197 lines) |
| **S3 drawers, dishwasher, bottle** | (1) Drawer units: `N(T) = min(5, 3 + ⌊max(0, T − 4700) / 2000⌋)`, counting `base-3drawer` and `base-panbank` only. The preparation cabinet is the first unit, and `base-hob-2drawer` does not count (RQ15). Extras take door slots after the hob. The count yields (*N3r* 6; RQ6, RQ10). Key it on the two owner-named build ids as data (ADR 0121), not on a general drawer classifier, which F7 declines. (2) The dishwasher beside the sink (M1), through the existing leaf, and (e)'s drawer swap if that reaches a U. (3) The bottle on **the next cabinet after the hob along the run**, when there is space (*N3r* 7; RQ16). (4) The threshold drawer is replaced by `N(T)` (*N3r* 8, labelled a default). (5) The pan drawer counts as a drawer unit | `generation/u-composition.ts`; `generation/dishwasher-beside-the-sink.ts` (only if its across-the-corner adjacency must read a second corner); `generation/optional-run-items.ts` (bottle placement reused, U arm only) | *N3 revised* 6–8; N6 RQ6, RQ10; N6′ RQ15, RQ16; ADR 0110 F5, F7, H1, J, K, L, M1, M2; `body-choice.ts`; `dishwasher-beside-the-sink.ts:1-130` |
| **N10 fix (2026-09-29, before QA)** | (1) Drawer extras stand **before the tower**, and the tower shifts: `max(n, bodies before it)`, where the far-wall bottle and extras count as base bodies. The tower stays at the free end of a far wall ≤ 3000 (N10.3 step 4; RQ19 (b)). (2) The bottle stands directly after a far-wall hob even when a tower stands on that wall, but only if the tower and the pantries still stand (N10.3 step 5; RQ20). (3) On every wall, the bottle drops whenever it would lower the run's drawer-unit count (RQ21): wall A's fill and the no-tower far wall included. (4) The tower's existence and the pantry count are decided before either, as at `84bab2e`, and never undone (N10.3 steps 2–3). (5) Tests per AC1 (a)–(e), AC2's added rooms, and AC3's pins | `generation/u-composition.ts`; `generation/u-tall-layout.ts` | ADR 0110 N10 (all of it), *N3 revised* 6, 7, 10, N9.3; `u-composition.ts` whole; `u-tall-layout.ts:130-330` |
| **N11 Dispatch A — review round 1's behaviour fixes (2026-09-29).** Tier **Full**: QA re-runs adversarially on N11, then the logic reviewer's round 2, scoped to N11. The clean-code round 2 waits for Dispatch B | **(A1) N11.1, the fridge wall.** On a fridge wall of 3000 mm or less (`fridgeAtTheFreeEnd`, `u-composition.ts:127-141`), storage stands from `run.startMm`, the fridge directly after it, and the remainder beyond it. That remainder takes **no** fridge-gap body: the pantry gap exists only at a counted position (`n` ≥ 1). **Tests:** rewrite `fridgePlaceFindings` (`tests/support/u-plan-invariants.ts:235-257`) from *N3 revised* 3, not from the planner. In the free-end case, the fridge wall's bodies are contiguous from `run.startMm`, the fridge is last, and `run.endMm − fridge.endMm` < 600 with nothing beyond it. Scope the 400 mm gap finding (`:229-231`) to counted positions. Pin **positions** on the fridge wall for 3600/2400/2000, 3600/2800/2800 and 4000/2000/2000. **(A2) N11.2, the bottle on wall A** (**as RQ23 answered it, 2026-09-29**). On wall A, the bottle yields only when, without it, wall A holds at least one drawer unit after the hob and, with it, none; RQ21's room-count rule still applies. `runAfterAWallAHob`'s result carries wall A's count. **Tests:** 4800/4400/4400 changes. 5400/3400/3400 and 6000/6000/6000 are pinned **unchanged**, as RQ23's witnesses. AC1 (c)(iii). The arm floors in AC1's *N11* block. **(A3) N11.3, the sink.** Refuse a pack whose sink would leave wall A (`packBackWallAndOverflow`, `:341-351`). **Tests:** 2399/3000/3000 refused, 2400/3000/3000 composed; the H3 property (AC1, N11). **(A4) N11.4, the height.** Where `room.heightMm < declared.columnHeightMm`, the fridge gap takes A4's door bases, not pantries (`planUTallLayout`, `u-tall-layout.ts:79-87`). **Tests:** 3600/3500/2200 at h 2199 and at h 2200; the height property (AC1, N11). **(A5) AC3's pins.** In `RECORDED_AT_84BAB2E` (`u-tall-layout.property.test.ts:556-566`), the fridge-wall digest becomes N11.1's value, and its comment says why: N11.1 moved the fridge wall in 10 178 rooms. Every other field stays. Report the three N11.5 whole-plan digests, reproduced from a `tsc` build of the fix. A mismatch is stop-and-report (7J A8), never fix-to-match. **Every item needs R6 sabotage:** revert the one fix, and its tests go red | `generation/u-composition.ts`; `generation/u-tall-layout.ts` | ADR 0110 **N11 (all of it)**, *N3 revised* 3–7, N10.3, E3; ADR 0108 H3; `u-composition.ts` whole; `u-tall-layout.ts:75-150`; `tests/support/u-plan-invariants.ts`; `u-tall-layout.property.test.ts:540-720`; `u-composition.witnesses.test.ts`; this wave's AC1–AC3 *N11* blocks |
| **N11 Dispatch B — review round 1's clean-code refactor (2026-09-29)**, after A is green and committed. **No behaviour change.** Tier: the clean-code reviewer's round 2 only, with no QA. The coordinator verifies byte-identity (AC6). **About 8 production files, over the ~5 limit; named here as `docs/WORKFLOW.md` requires.** Three are carved out of one file, and two are comment-only, so the review round is the mini-review | **(B1) Split `u-composition.ts`.** `u-fridge-wall.ts` gets the fridge wall's choice and placement and a dropped fridge's door fill. `u-back-wall-pack.ts` gets the lanes, the pack and the attempts table. `u-drawer-units.ts` gets the drawer target, the split, the conversion, run order, and N10.3's fit of the run after the hob, including `bottleCostsNoDrawerUnit`. `u-composition.ts` keeps `planUKitchenComposition`, the attempt's assembly, the tall-layout input, floor widths and remainders. `index.ts`'s export surface does not change. **(B2) Every function ≤ 20 lines.** This covers `planUKitchenComposition`, `composeTheAttempt`, `packBackWallAndOverflow`, `withDrawerUnitsAfterTheHob`, `wallAFill`, `towerAtTheFreeEnd`, `towerCountedFromTheCorner` and `farWallLayout`. `backWallAttempts` becomes a `const` table whose rows carry `hasPreparation`, and `dropped` is derived from it, which retires `attemptIndex >= 2` and `< 2`. **(B3) One base constructor.** `plannedBaseAt` and `doorBasesFrom` in `run-layout.ts` replace the ~8 duplicated `UPlannedGenerationBase` literals: `storageBase` ×2, `doorBaseWithId`, `fridgeBase`, `columnBase`, `wallAFill`'s two, the pack's, and `placeBodiesBeforeTheTower`'s. Name the constants: the side wall's 3000 mm (one constant, used twice), `Math.min(5, …)`, `/ 2000`, and the pantry loop's `2` (= `MAX_TALL_BLOCK_COLUMNS − 1`). Add one `enteredTotalMm(room)` shared by `isLargeU` and `drawerTargetFor`. **(B4) Comments and names.** Remove commit hashes from code and test comments (say "the layout with nothing added"). `RECORDED_AT_84BAB2E` becomes a named pin whose doc cites ADR 0110 N10.5 and N11.5. Fix the stale or false comments: `u-tall-layout.ts:441-443` (an orphan doc; delete it); `:8-13` (the leaf edit also exported `HOB_WITHOUT_ITS_OWN_OVEN_BUILD_ID`); `tall-end-rule.ts:29-33`; `u-composition.ts:1-5, 143-145, 306-316` (the slice framing); `index.ts:314-318`. Remove `withRQ17Override`'s dead terms (two inputs that are always true there). Renames: `blockStorageCountMm` → `blockStorageCount`; `UBodyBeforeTheTower` → a name true on both walls (e.g. `UBodyAfterTheHob`). **Added 2026-09-29 (ADR 0132 A6):** `cornerOf`'s doc (`corner-assembly-size.ts:280-300`) gains one sentence saying that wall C is answered `"right"` before the shape is read, because only the A∩C corner stands on wall C. Comment only; one more file, comment only. **Deferred:** the test-fixture consolidation (`uRoom`, `planFor` and `basesOn` in 9 files, and the helpers `u-tall-layout.property.test.ts` redefines) goes to **U3b S0** below. B's evidence of byte-identity is an unchanged test suite, and rewriting nine test files in the same dispatch would remove that control | `generation/u-composition.ts`; new `generation/u-fridge-wall.ts`, `generation/u-back-wall-pack.ts`, `generation/u-drawer-units.ts`; `generation/u-tall-layout.ts`; `generation/run-layout.ts`; `generation/tall-end-rule.ts`, `index.ts` and `corner-assembly-size.ts` (comments only) | The clean-code review's round-1 findings; `engineering-conventions.md`; ADR 0110 N11.5 (the figures that must not move); `u-composition.ts`, `u-tall-layout.ts` and `run-layout.ts` whole |

- **Reading, QA:** this wave's rows and criteria; ADR 0110 N (N1–N6′, especially *N3 revised* and
  N4′); `u0-measure-rq.mjs` as the model the witnesses came from (scratchpad; the witnesses are
  quoted in N4′); `engineering-conventions.md`, *Coverage an adversarial pass owes*; skill
  `javascript-testing-expert`; the slice diff.
- **Reading, logic reviewer:** ADR 0110 A1, A2, A4, E2–E6, E12, F7, H1, I, J–M, N (all of it); ADR 0120
  E; ADR 0123; ADR 0132; the wave diff with `generation-priorities.ts`, which is the L's composer, for
  comparison.
- **Reading, clean-code reviewer:** the slice table; `engineering-conventions.md`; the wave diff.
- **Reading, N11 round 2 (2026-09-29).**
  - **QA, after Dispatch A:** ADR 0110 N11; the AC1–AC3 *N11* blocks below;
    `tests/support/u-plan-invariants.ts`; skill `javascript-testing-expert`; Dispatch A's diff.
  - **Logic reviewer, after A:** ADR 0110 N11, *N3 revised* 3–7, N10.3, E3; ADR 0108 H3;
    `generation-priorities.ts:220-260` for the L's fridge convention; Dispatch A's diff; your own
    round-1 findings.
  - **Clean-code reviewer, after Dispatch B:** your round-1 findings; `engineering-conventions.md`;
    AC6; Dispatch B's diff.

**Acceptance criteria.**

1. **The rules hold** (*property*: ≥ 200 samples over A 2700–6000 and B, C 1000–6000, at h 2200,
   2600 and 3900, plus the boundaries 3000/3001, 4000/4001, T = 9999/10 000, B = C, and RQ9's declared
   witness). The fridge stands on *N3r* 2's wall at *N3r* 3's count from the corner. The sink is the
   first body on wall A. The back-wall and overflow order is sink, dishwasher, preparation, hob. Every
   plan has exactly one oven. The tower stands at its count from the corner. No pantry on the far wall
   of a large U. A pantry or bare gap between the fridge and the free end at every size. Drawer units
   ≤ `N(T)`, with `base-hob-2drawer` never counted. The bottle is directly after the hob when it
   stands. Every bare run end is < 600 mm, RQ17's lone-tower remainder
   (≤ 599) included. The plan is deterministic. **[prop]**
   **2026-09-29 (ADR 0110 N9.2, N9.3):** "every bare run end" covers **all three walls, including a
   dropped fridge's wall**. The shipped property left that wall out on a false premise: the drop is
   1 522 rooms, not RQ9's empty population. That exclusion is withdrawn. So that the property actually
   visits the drop band, ≥ 200 of its samples are drawn with both side walls in 1000–1699. **Added:**
   where the hob stands on the far wall, no tall column stands on that wall, and ≥ 300 mm of run
   follows the hob, the next body after the hob is the bottle. ~~Where a tall column follows the hob on
   the far wall, no bottle stands between them (RQ20's default).~~
   **2026-09-29 (ADR 0110 N10.3; RQ19 (b), RQ20, RQ21 answered).** The RQ20-default clause is
   withdrawn. The tower clause *"stands at its count from the corner"* becomes the bound below. Each
   of these is a **[prop]** over the same sampled range:
   - **(a) No drawer extra after the tower.** In run order (wall A from the fridge corner, then the
     far wall from its corner), no `base-3drawer` or `base-panbank` other than the preparation cabinet
     stands after the `tall-oven-tower`.
   - **(b) The bottle stands directly after the hob.** Where a `base-bottle-cargo` stands, it is on
     the hob's wall, and its near edge is the hob's far edge in run direction. This holds on either
     wall, with or without a tower.
   - **(c) The bottle never costs a drawer unit (RQ21).** In every plan with fewer drawer cabinets
     than `N(T)`: (i) no plain `base-cabinet` stands after the hob in run order; (ii) on the bottle's
     wall, `remainderMm` + `bottleWidthMm` + every widened pantry's width over 600 is < 600.
   - **(d) The tower's bound.** On a far wall over 3000 mm, the number of bodies before the tower is at
     most `max(n, overflowed core + bottle on that wall + drawer extras on that wall)`. Every body
     before it is overflowed core, the bottle, a drawer extra, or a plain door. A plain door appears
     only when the room already has `N(T)` drawer cabinets. A far wall of 3000 mm or less keeps the
     tower or block at its free end, and nothing stands beyond the block except RQ17's bare remainder.
   - **(e) Must not:** a room lose its tower, or gain one, relative to the same room at `84bab2e`
     (AC3's pin); a pantry lost or narrowed on the far wall; any body on the fridge wall change.
   - **Arm floors.** The sweep's fixed grid counts each arm and holds it ≥ 1: far-wall hob with a tower
     and a bottle; far-wall hob with a tower and no bottle because the tower or a drawer takes the room;
     back-wall hob that drops the bottle for a drawer (RQ21); back-wall hob with drawer extras past `n`
     before the tower. This way a property cannot pass by landing only on arms nobody changed.
   **2026-09-29 (ADR 0110 N11, review round 1; Dispatch A).** Each item below is a **[prop]** over the
   same sampled range unless it says otherwise, and each one is R6-sabotaged: revert its fix, and it
   goes red.
   - **(f) The fridge's place (N11.1).** This replaces `fridgePlaceFindings`' free-end clause, which
     tested the planner rather than the rule. On a fridge wall of 3000 mm or less:
     - the wall's bodies are contiguous from `run.startMm`, door bases first and the fridge last;
     - `run.endMm − fridge.endMm` is < 600, and nothing stands beyond the fridge;
     - the fridge gap's pantry clause (*"a gap of 400 mm or more takes a pantry"*) applies only at a
       counted position.

     **Must not:** a bare gap between a side wall's corner-side run start and its first body.
   - **(c)(iii) The bottle never leaves wall A without a drawer (N11.2, as RQ23 answered it).**
     Where the bottle stands on wall A, either wall A holds at least one drawer extra after it, or
     wall A's `remainderMm` + `bottleWidthMm` is < 600.
     ~~Where the bottle stands on wall A and any drawer extra stands on the far wall, wall A's
     `remainderMm` + `bottleWidthMm` is < 600.~~ That was the pre-RQ23 default.
     **Arm floors:**
     - at least one room at exactly 600 free after the hob, and at least one at 700–800, drops the
       bottle;
     - at least one room at 900–1100 keeps the bottle with one drawer after it;
     - at least one room at 1200–1800 keeps the bottle with two or more drawers after it.
   - **(g) The sink stands on wall A (N11.3).** Swept over A 1800–3100 and B, C 1000–6000, with
     ≥ 200 samples, of which ≥ 50 have `freeA` < 600:
     - `minimumMet` holds **iff** ADR 0108 H3's predicate does (`freeA ≥ 1200`, or `freeA ≥ 600`
       and the far wall's free run ≥ 600, with the far wall being the narrower side wall, C on a
       tie);
     - every composed plan's sink is on wall A.
   - **(h) No tall column in a room lower than it (N11.4).** Swept at h from the engine floor to 2199,
     and at 2200, 2600 and 3900:
     - no `tall-pantry` or `tall-oven-tower` stands in a plan whose room is lower than
       `declared.columnHeightMm`;
     - every wall still ends with under 600 mm bare.
2. **Witnesses** (N4′'s seven rooms, `u0-measure-rq.mjs` with `RQ13_TALL=1 TOWER_BARE=1`): the plan's
   bodies per wall, in order, equal N4′'s predicted rows, and 2700 / 1000 / 1000 is `minimumMet:
   false`. **If the plan measures otherwise, stop and report** before U3b. N4′ was a model (7J A8's
   rule), and the architect decides whether the model or the rule is wrong. **[unit]**
   **Adjudicated 2026-09-29 (the stop fired at S3, `e443ed2`):** 4 of 7 rooms matched. 4000/4500/1200
   and 5000/4000/3000 were **model** errors: the model placed no bottle. N4′'s rows are corrected by a
   dated line (ADR 0110 N4′). The 6000/6000/6000 drawer count is a **rule** defect: extras were
   confined to wall A, while *N3 revised* 6 takes them in run order across the far corner. The code
   changes, and the room expects 5 units under RQ18's default. Re-run against the corrected rows.
   **RQ18 answered 2026-09-29:** round the corner, confirmed. The extras are `base-panbank` first, up
   to two, nearest the hob, and the rest are `base-3drawer` (*N3 revised* 6's table). So 6000/6000/6000
   is A: bottle, 2 × `base-panbank`; C: 2 × `base-3drawer` first. **The code must stop placing only
   `base-3drawer` extras.**
   **Adjudicated again 2026-09-29, before QA (ADR 0110 N9):** **5000/4000/3000** is right as built.
   Wall C's two bases are `base-panbank` under RQ18 (a), so the witness text was stale and is now
   annotated. The room has 3 drawer units of `N(T)` = 5. **3600/2400/2000** changes: C reads hob,
   bottle, bare 100. It had "matched" only because the model and the plan both left the bottle out
   (N9.3). **The fridge wall's 600 mm bare end is a plan defect** (N9.2): a dropped fridge's wall is
   left empty. Both fixes land before U3a QA. After them, AC2 must match 7 of 7 corrected rows, and
   AC3's pin of largest bare 500 / 500 / 500 must hold. Neither has been measured yet.
   **2026-09-29, RQ19 (a) (`84bab2e`):** 5000/4000/3000's wall C is `base-panbank`, `base-3drawer`,
   tower. **2026-09-29, ADR 0110 N10.6 (RQ19 (b), RQ20, RQ21):** among N4′'s seven, only **5000 /
   4000 / 3000** moves again. It becomes A: sink, dishwasher, preparation, `base-hob-2drawer`,
   `base-panbank` (bare 200, **no bottle**); C: `base-panbank`, `base-3drawer`, tower (bare 200), with
   4 drawer cabinets. The architect's model measured the other six unchanged. **Six rooms are
   added**, each pinned wall by wall exactly as N10.6 predicts: 3000/4500/4500, 2700/4000/4000,
   2700/3700/3700, 4200/3400/3400, 4800/1000/1000, 3600/2800/2800 (and 3600/3500/2200, already a
   witness, now pinned as RQ20's *"without bottle"* case). The drawer-split test's 3-cabinet
   witness, 5000/4000/3000, now has 4 cabinets, so that test moves to **3000 / 4500 / 4500**
   (preparation, 1 `base-panbank`, 1 `base-3drawer`). The stop-and-report rule applies to these rows
   as to N4′'s.
   **2026-09-29, owner answers and build (ADR 0110 N10.9).** Wall A's RQ21 is owner-confirmed
   (*"Drawer cabinet wins"*, relayed selection); far-wall pantries outrank drawer cabinets (*"Pantry
   wins"*, relayed), so RQ22 is closed and N3r6's ranking stands. N10 is implemented at `3f53a62`;
   domain 250 files / 5330 tests green per the implementer, AC3 matches the model over all 86,706 grid
   rooms (0 towers or pantries lost, 0 drawer extras after the tower against 18,602 before, 13,608
   rooms gain a drawer, largest bare end 500 / 500 / 500). Adversarial QA was still running.
   **2026-09-29, review round 1 (ADR 0110 N11.5).** **Nine rows**, each pinned **with positions**
   wall by wall, exactly as N11.5's table predicts:
   - 3600/2400/2000, 3600/2800/2800 and 4000/2000/2000: the fridge wall (N11.1);
   - 4800/4400/4400: the bottle yields on wall A (N11.2).
   - 5400/3400/3400 and 6000/6000/6000: pinned **unchanged**, with positions, as RQ23's "Bottle +
     drawers" witnesses (2026-09-29).
   - 2399/3000/3000 refused and 2400/3000/3000 composed (N11.3);
   - 3600/3500/2200 at h 2199 against h 2200 (N11.4).

   The drawer-split witness 6000/6000/6000 keeps 2 `base-panbank` and 3 `base-3drawer`. Every other
   row measures unchanged. **The witness helper must compare `startMm` and `endMm` on the rows N11
   moves.** It compared `(role, buildId)` only, and that is how N11.1 passed unseen.
3. **The model's tallies**, as a regression and not an oracle: over N4′'s step-100 grid, the plan's
   counts for fridge position, hob wall, tower position and pantries equal N4′'s table, or every
   difference is reported with its room. **[unit] + [report]**
   **2026-09-29:** the drawer and position tallies are re-run on one definition (N4′'s note): units =
   `base-3drawer` + `base-panbank`, the preparation included, and positions read from a field the plan
   emits. The bottle-affected bare and drawer figures are not held to N4′. The exact matches (composed
   86 706 / refused 1 728, fridge 3-from-corner / other-side / dropped, hob wall, large-U no-tower,
   one oven, max bare 500) stand as regression pins.
   **2026-09-29 (ADR 0110 N10.5), after the N10 change:** (i) **the tower tallies do not move.**
   Rooms with a tower, split by `towerPosition` (`n`, free end, none), equal the same tallies taken
   at `84bab2e` before the change. The implementer measures both and quotes them. (ii) The largest
   bare end is 500 / 500 / 500 on wall A / fridge wall / far wall. (iii) The drawer-cabinet
   histogram, 0–5, equals N10.5's *under N10* row: 4 968 / 27 118 / 13 172 / 14 572 / 9 937 /
   16 939. (iv) No room has fewer drawer cabinets than at `84bab2e`. (v) Zero rooms have a drawer
   extra after the tower, down from 18 602. Items (iii) and (v) come from a model, so a difference is
   reported with its room rather than fixed to match (7J A8).
   **2026-09-29, review round 1 (ADR 0110 N11.5), after Dispatch A:**
   - (i)–(v) above hold unchanged, including the tower tallies 16 487 / 13 600 / 26 216 / 30 403, the
     far wall's pantries (680, 449 200 mm) and the drawer histogram.
   - (vi) The fridge-wall digest is
     `5d2962d48475ef6e7dde181952f0e692e109ba1ed8a827ad8e39c5b39ecfdfc2`.
   - (vii) Against the implementer's own HEAD-versus-fix comparison, after RQ23: **11 501** rooms
     change, namely 10 178 on the fridge wall only, 1 323 on wall A and the far wall, and none in
     both. ~~14 771 (10 178, 4 599 and 6 in both)~~ was the pre-RQ23 figure.
   - (viii) The implementer **reports** the three whole-plan digests their build produces.
     - The architect records them in N11.5 beside the model's RQ23 digests.
     - A mismatch is adjudicated with its rooms.
     - The code is never tuned to match the model, nor the superseded pre-RQ23 digests.

   A mismatch is reported with its room, never fixed to match (7J A8).
4. **The L and the straight kitchen are byte-identical**: U1-A1's re-run, plus
   `planKitchenComposition`'s output over its recorded baselines. **[unit]**
5. **Must not:** any edit to `generation-priorities.ts`; `cornerDirection` read; a wall letter compared
   inside the U planner other than through the fridge-wall and far-wall roles it computes (ADR 0110
   I's lesson on role versus letter). **[review]**
6. **Dispatch B is byte-identical** (added 2026-09-29, review round 1). The coordinator builds
   Dispatch A's commit and Dispatch B's commit with `tsc` into a scratchpad, and compares:
   - N11.5's three sweeps, digested **with ids included** (stricter than N11.5's id-free digests),
     over every `UKitchenCompositionPlan` field: `bases`, `floorWidthsMm`, `remainderMm`, `dropped`,
     `minimumMet`, `fridgePosition` and `towerPosition`;
   - AC4's L and straight baselines.

   All must be identical. The domain suite passes with **no test changed except B4's comment and
   pin-name edits**; `git diff --stat` over `tests/` shows only those. `index.ts`'s export surface is
   unchanged. **Must not:** any figure in N11.5 move. **[unit] + [report]**

### Wave U3b — generating a U — cut 2026-09-29

**Dated plan corrections, 2026-09-30, at close (recorded so no criterion edit goes unrecorded):**
1. **AC6 and S2 item (2).** No generated body except the hood (RQ7, *N3 revised* 11); every void at
   least a `wall-cabinet`'s minimum width accepts one; narrower voids stand only at the corner strips
   or over wall A's bare end (< 300 mm), since ADR 0043/0046 make such voids legal.
2. **AC1's R6 clause** ("Moving the fill before the drawer conversion changes the histogram")
   cannot hold: the conversion takes the first `extraCount` door bases in run order, and the count is
   unchanged. The ordering is guarded instead by the 5400/3400/3400 witness (the fill pinned as a
   `base-cabinet` at 4200–4500) and by the span-equality test. 1,695 grid rooms would expose it.
3. **S1 note.** Wall C's `slideReserveMm` is exercised through wall B's builder on the mirrored room.
   The test asserts the absolute `wallCMm − 100`, so it is direct (the logic reviewer confirmed).
4. **S0 row.** The text below says `tests/support/u-room.ts`, test-only, no count change. What shipped
   is `u-plan-fixtures.ts`, some production refactor, and +1 test (deviation; see the close-out).

**U3b S0, test-only, before S1 (added 2026-09-29, deferred from U3a Dispatch B).** One
`tests/support/u-room.ts` exports `uRoom`, `planFor`, `basesOn` and `bodiesOn`. It replaces their
nine private copies, and `u-tall-layout.property.test.ts` stops redefining what
`tests/support/u-plan-invariants.ts` already exports. The tier is coordinator-only: no production
file changes, and the suite's test count and results do not change. U3b's own generation tests are
then written against the shared module.

**Goal.** `generateKitchen` composes a U from U3a's plan, through `insertBody` alone, onto
`buildUShellDesign`. Every U gets its hood, and a large U's back wall keeps its upper voids. Step 1's
minimum-kitchen gate agrees with the generator.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S1 dispatch** | (1) Retire `refuseAGeneratedU` (`generate-kitchen.ts:262-270`). (2) `shellRunsFor` → `uShellFloorRuns`, and `buildShellFor` → `buildUShellDesign` with `compositionPlan.floorWidthsMm` over A, B and C. **Revised 2026-09-29 (ADR 0110 N11.8, on S1's stop):**
- The U plan justifies wall A's bodies to A's low end, with run order unchanged. A's remainder then always sits at A's high end, and the widths tile from the run start exactly as the L's do.
- **No `wallALeadingGapMm` field**, and no command change. The developer's leading-gap field is withdrawn.
- The plan change is one post-pass in the U planner (`u-back-wall-pack.ts` or `u-composition.ts`, the developer's choice). U3a's invariant *"wall A's first body at A's run start; A's remainder at its high end"* goes into `tests/support/u-plan-invariants.ts`.
- **Widened 2026-09-29 (ADR 0110 N11.9, RQ24 and RQ25 answered).** The same post-pass, as its **last** step, after `withDrawerUnitsAfterTheHob`, gives wall A's remainder `r` one `base-cabinet` of exactly `r` when 300 ≤ `r` < 600. Under 300 stays bare.
  - This applies on **every** U's wall A, whichever wall holds the fridge.
  - The fill is never a drawer unit, and never a drawer slot.
  - Its door count is the catalogue's (`deriveDoorCount`; RQ26 is open, non-blocking).
  - `remainderMm.A` and `floorWidthsMm.A` report the post-fill plan.
  - `u-plan-invariants.ts` gains *"wall A's bare end < 300; a wall-A fill only at A's high end, 300–599 wide"*. AC1 (c)(i) exempts the fill, and (c)(ii) and (c)(iii) read `remainderMm.A` plus the fill's width. (3) `isFreeEndBody` for both side walls' free ends. (4) `replayGenerationLog` replays a U. (5) **The owed direct `slideReserveMm` wall-C test** (U2 close-out, round-2 review's accepted gap), written against the first composed wall-C run: wall C's run ends 100 mm short of `wallCMm`, exactly as wall B's does in the room with B and C swapped | `generation/generate-kitchen.ts`; `generation/shell-design.ts` (~~only if `UShellCompositionPlan` needs a field~~ **no new field, N11.8**); `generation/u-back-wall-pack.ts` or `u-composition.ts` (N11.8's post-pass) | **ADR 0110 N11.8 and ADR 0046 (the left-seat owner ruling it applies);** U2 close-out; ADR 0110 decisions 1–6, B, D (revised), **N11.6 (wall A's low-end remainder; U3b AC1)**; ADR 0108 H3 (the 100 mm reserve); `generate-kitchen.ts:140-230, 480-560, 680-799`; `shell-design.ts:575-640, 800-830` |
| **S2 uppers and the hood** | (1) **The hood is mandatory over the hob in every U** (*N3r* 11; RQ7). (2) In a large U, **no generated body in wall A's wall or top rows**, and the shell's voids there remain. (3) Uppers over the far wall's door bases (RQ14) and over the back wall below 10 m. **(2026-09-29, N11.9)** This includes wall A's 300–599 mm remainder fill, which is a door base like any other. `wall-cabinet` shares the hinged 200–800 bound (`catalog.ts:143-180`), so its upper matches its width. (4) No upper over a full-height body (E7) or over **either** corner zone (7D2 c. 14; backlog 63's class at A∩C) | `generation/generate-kitchen.ts` (the upper loop, `:393-410`); a new leaf `generation/upper-policy.ts` if the loop needs one, to keep `generate-kitchen.ts` from growing | *N3 revised* 11; N6 RQ7; N6′ RQ14; ADR 0110 C, E7, 7D2 c. 14; backlog 63; `generate-kitchen.ts:380-560` |
| **S3 the minimum kitchen** | (1) **`UMinimumKitchen` lands here**: the policy type on `UWallBounds`, and `ENGINE_ROOM_LIMITS.U.minimumKitchen` derived with no literal. Correct `room-policy.ts:76-78`'s comment, which names *"U3 S3"* (R1.5), to this slice. The approved literals enter at **U6**, not here. (2) `validateRoomInput`'s U predicate (ADR 0108 H3): `freeA ≥ 1200`, or `freeA ≥ 600` and the narrower side wall's (C when B = C) `free ≥ 600`, with `freeA = A − 1800` and `free = side − 1000`, the 1000 including the 100 mm reserve. It returns `ROOM_TOO_SMALL_FOR_KITCHEN` on the room field, with no number (RQ8). (3) The validator ⇔ generator property | `room/room-policy.ts`; `room/validate-room.ts` | ADR 0108 C, E, *Implementation record*, H2–H5; RQ1, RQ8; ADR 0116 decision 1; `room-policy.ts:60-100`; `validate-room.ts` whole |

- **Reading, QA:** this wave's rows and criteria; U3a's close-out; ADR 0110 *N3 revised* 11, N4′;
  ADR 0108 H3; 7J's composition criteria (archived plan `:4214-4237`) as the pattern;
  `engineering-conventions.md`; skill `javascript-testing-expert`; the slice diff.
- **Reading, logic reviewer:** ADR 0110 decisions 1–6, C, E7, N; ADR 0108 C, E, H; ADR 0116; ADR 0117;
  the U2 close-out's owed test; the wave diff with `generate-kitchen.ts`.
- **Reading, clean-code reviewer:** the slice table; `engineering-conventions.md`; the wave diff.

**Acceptance criteria.** These are old U3 criteria 1–6, re-homed 2026-09-29, plus the owed test.

1. **Composition** (old criterion 1; *property*, ≥ 200 samples over the approved-shaped U range under
   a witness policy, at h 2200, 2600 and 3900, plus H3's boundary pairs): zero findings and no
   overflowing placement. Deterministic, and the log replays to the design. Exactly one oven. No oven
   beside the fridge. No upper over a full-height body or either corner zone. A hood over the hob.
   Bare run ends < 600 mm. The body order along the path equals U3a's plan. **[prop]**
   **2026-09-29 (ADR 0110 N11.6).** Not only the order: **every generated body's along-wall span
   equals the plan's `startMm`/`endMm`, on all three walls.**
   - Why order is not enough: 30 450 grid rooms (every one with the fridge on wall C) plan wall A's
     remainder at its **low** end. `floorWidthsMm` carries no offset, and `plannedFloorTiles` tiles
     from the span's start.
   - So S1 item 2 must carry the offset or tile wall A from its far end; the choice is S1's.
   - Witness: 2700/1600/1700, where the sink stands at A 1200–1800.
   - R6: tile from the span's start, and this criterion goes red.

   **Revised 2026-09-29 (ADR 0110 N11.8).** The plan now justifies wall A to its low end, so the
   witnesses become:
   - 2700/1600/1700: the sink at A **900–1500**, with 300 mm bare at the A∩C end;
   - 3100/1000/1100 (a merging case): `base-hob-oven` 900–1500, `base-sink` 1500–2100, 100 mm bare.

   Added:
   - **every approved grid room (A 2700–6000, B and C 1000–6000, step 100, h 2600) generates
     without a throw**, and with zero span mismatch against its plan on all three walls. The 20 838
     rooms that threw are the regression population;
   - the whole-plan digests equal ~~N11.8's~~ **N11.9's** model (h 2600 `6046ca18…f57475c`, h 2199
     `43097f1c…6aa9b0d`, engine band `d4a63e4d…df6a35c08`), or each difference is reported with its
     room (7J A8);
   - **(N11.9, RQ25)** in the 21 501 grid rooms whose wall A remainder is 300–599 mm, a
     `base-cabinet` of exactly that width stands at A's high end, and wall A's bare end is 0.
     Elsewhere wall A's bare end is under 300. The side walls' bare ends are unchanged. The drawer
     histogram is unchanged. 2700/1600/1700: a one-door `base-cabinet` at A 1500–1800. Pin one
     400 mm and one 500 mm fill room from the sweep. R6: drop the fill, and these go red. Move the
     fill before the drawer conversion, and the histogram changes;
   - R6: put wall A's remainder back at its low end, and the grid throws again.
2. **Validator ⇔ generator** (old criterion 2): over the same range plus H3's boundary pairs
   (2999/3000 at B = C = 1000 and 1599; C 1599/1600 at A 2700 and 2999, B = 6000), the gate passes
   **iff** `generateKitchen` places a sink and a hob. **[prop]**
3. **Witnesses** (old criterion 3): N4′'s seven rooms, through `generateKitchen`, place the bodies U3a
   criterion 2 fixed. **If the generator measures otherwise, stop and report** (7J A8). **[unit]**
4. **The L and the straight kitchen are byte-identical** (old criterion 4). **[unit]**
5. **Must not** (old criterion 5): a generated body written other than by `insertBody`;
   `cornerDirection` read by generation; `isShapeBuildable("U", APPROVED_ROOM_POLICY)` true.
   **[review] + [unit]**
6. **Hood and back-wall voids** (old criterion 6; RQ7): every U has a hood over its hob. In a large U,
   wall A's wall and top rows hold voids and no body, and each accepts a `wall-cabinet` through
   `insertBody`. **[prop] + [unit]**
7. **The owed `slideReserveMm` wall-C test** (U2 close-out): a composed wall-C run ends exactly 100 mm
   short of `wallCMm`, equal to wall B's in the swapped room. Sabotage (R6): drop the reserve for C,
   and the test goes red. **[unit]**

---

### Wave U4 — drawing a U (adapter)

**Goal.** A U design draws to *The 3D contract for a U*: wall C, ~~the reflected right-hand group~~
**the right corner's four wrappers**, picking, outline, overflow mark, cameras and lights — correct at
~~both reflection parities~~ **the two parities a U has (a wall-C body, +1; a right-corner piece, −1),
2026-09-29** — captured.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S1 the shell** | (1) Wall C's plane (D12); (2) floor depth `max(B, C)`; (3) signature includes shape and C; (4) no run-end panel on a U | `kitchen-shell.ts` | D11, D12; G8; 7H and 7J close-outs (archived plan, by section); ADR 0120 D2–D3 |
| **S2 the right corner's wrappers** | ~~(1) Wall-C bodies and right-corner pieces (by `cornerOf`) in one group reflected in `x = W/2`; (2) void meshes likewise~~ **2026-09-29 (ADR 0132 d1–d2): (1) the four right-corner pieces (by `cornerOf`) each in a wrapper group mirrored by `applyCornerDirection`; (2) wall-C bodies and voids drawn at their world frames, unmirrored**; (3) overflow mark and selection outline on wall C and on a mirrored corner piece; (4) picking climbs through a wrapper | `scene-sync.ts`, `selection-outline.ts`, `picking.ts` (~~`void-mesh.ts`, `overflow-mark.ts`~~: no change under α — census U28, U29) | **2026-09-29, from U2 as shipped:** `cornerOf(placement, room, catalog)` takes a **catalogue** (the adapter passes the one it builds with). It answers `undefined` for a non-corner body, `"left"` for wall B ~~and for any room that is not a U~~ **and for wall A outside a U** (R1.1, `7140eee`), `"right"` for wall C **in any shape, answered before the shape is read (corrected 2026-09-29, ADR 0132 A6)**, and on wall A of a U it answers by `alongMm` against `W / 2`. The right corner's placements are U2's: `rightCornerAssemblyWidthsMm` and `roomForTheRightCorner`, with the X-leg at `W − leftCentre` (`c14abb4`). The corner-taking walls are read through `cornerTakingWallsOf`, not the retired `WALL_THE_CORNER_IS_TAKEN_FROM`. D2, D4; ADR 0129 D4–D7 + Amendment (a); `DEVELOPMENT-SPEC.md` §6.1, §6.2; `corner-direction.ts`; the 7I QA findings (archived plan, *7I close-out*) |
| **S3 cameras and lights** | (1) `wallC` preset (D13); (2) `overview` for three runs; (3) ~~the light rig per ADR 0132 after captures (D14)~~ **moved to U5 (AC11), 2026-09-29, ADR 0132 A8.5**; (4) exports | `stage.ts`, `index.ts` | D13, D14; G9, G10; §6.4; §11 row 21; backlog 16; 7J R5 |

- **Reading, QA:** *The 3D contract for a U*; D2, D4, D11–D14; ADR 0129 + Amendment; skill
  `lemnaria-3d-reference`; `browser-and-visual-qa.md`; the slice diff.

**U4 fix — the cameras, after QA's RED (2026-09-29, ADR 0132 Amendment A).** One developer
dispatch, `packages/three-adapter` only. Tier **Full**, because the change is anchored to §11
rows 2, 21 and 22: QA, then logic and clean-code review.

| Item | What | Production files | Acceptance tests |
| --- | --- | --- | --- |
| **F1 the U overview** | The U overview stands at `x = W/2`, looking along −z. Its target, distance and elevation stay as they are, taken from the reference's angle as now. An L's and a straight room's presets stay **byte-identical**: compare their triples against HEAD for the seeded room and the L/straight rooms `stage.test.ts` samples | `stage.ts` | AC4 (c) and (d), overview clauses; `stage.u-cameras.test.ts`'s overview block rewritten to AC4 |
| **F2 the cut set** | A pure `cutawayWallsFor(eye, room, cabinetDepthMm): readonly DesignWall[]`. It returns the U's walls whose body zone the eye stands in or behind, within that wall's run (ADR 0132 A2). Body zone = the deepest floor body at that depth, **read through `occupiedDepthOfEntryM`, never a literal 742**, plus 7H's `CLEARANCE_M` (0.05). It returns `[]` for an L or a straight room. Exported from `index.ts` | `stage.ts` (or a new leaf `cutaway.ts`); `index.ts` | QA's 16 eye tests, **restated**: *"the eye is in front of both side walls, **or** the wall it stands behind or in is in `cutawayWallsFor`"*. The 4 `overview` and 4 `wallA` cases stay literal and must return `[]`. Plus a property over the approved U range: every preset's eye is outside every drawn run's zone |
| **F3 applying it** | `applyCutaway(solidsRoot, voidsRoot, walls)` sets `visible = false` on every object keyed to a cut wall's placement or void: body, void mesh, overflow mark, selection outline. It restores them when the wall leaves the set. Idempotent; no rebuild and no dispose. The right X-leg is on wall A and is never cut by a wall-C cut | `scene-sync.ts` (or `cutaway.ts`) | Apply then restore gives identical `visible` flags on every object. Nothing keyed to wall C is visible under `["C"]` |
| **F4 picking skips what is not drawn** | `pick` passes over any hit whose object or an ancestor has `visible === false`, and continues to the next hit, then to the voids. The hidden push-to-open handles (§6.5) are the known existing case, and their door behind is the same placement | `picking.ts` | **QA's click test becomes the acceptance test, with the same expectation** (3000³, `wallB`, selects `b-top`), with `applyCutaway(cutawayWallsFor(eye))` applied first. Added: its `wallC` mirror, 2700/1600/1600 (behind the plane) and 4500/3000/3600 (inside the zone). Regressions: §11 row 2, row 22, a click on a push-to-open top-row door. R6: remove the filter, and the click test goes red |
| **F5 tests to the new AC4** | `stage.u-cameras.test.ts` asserts AC4 (c) as reworded. It drops no existing clause except the overview's *"holds three runs"* | — | AC4 as reworded |

- **Reading, developer:** ADR 0132 Amendment A; D13 (revised); AC4 (revised); `DEVELOPMENT-SPEC.md`
  §6.4, §6.5, §11 rows 2, 21, 22; `stage.ts:250-462`; `picking.ts`; `scene-sync.ts`; QA's
  `qa-u4-preset-eye-in-the-u.adversarial.test.ts`; `qa-7h-preset-stands-clear.adversarial.test.ts`
  (its header); `stage.u-cameras.test.ts`; ADR 0108 H2 (the deepest floor body).
- **Reading, QA:** the same list, the fix diff, skill `lemnaria-3d-reference`, and
  `browser-and-visual-qa.md`.
- **Reading, reviewers:** as the U4 lines above, plus ADR 0132 Amendment A.
- **Not in this dispatch:** the web calling `applyCutaway` on every camera change (U5 S2 item (5)).
  Owner question Q-U4-cam is non-blocking; default (A), hide, is what F3 builds. **Answered
  2026-09-29: "Hide them" (ADR 0132 A8.3).**

**U4 round 3, after review round 2 (2026-09-29, ADR 0132 A8).** One developer dispatch,
`packages/three-adapter` only. Tier: the **logic** reviewer's round 3, scoped to A8.1 and A8.2,
after QA. The clean-code reviewer re-checks R3.3–R3.5 in the same round.

| Item | What | Production files | Acceptance tests |
| --- | --- | --- | --- |
| **R3.1 — BLOCKER: no run bound** (A8.1) | `cutawayWallsFor` cuts a U's wall whenever the eye stands in or behind its body zone. The along bound (`isLevelWithRun`) is deleted for all three walls. | `cutaway.ts` | **Regressions:** 2700/1600/2400 from `wallC`, with an upper and then a tall column at B's free end: the click selects C's top-row body. The mirror 2700/2400/1600 from `wallB`. **Restated QA pins:** `qa-u4-fix-cutaway.adversarial.test.ts:140-171` (past the run's end, the wall is still cut); `qa-u4-fix-cutaway-wall-a` (an eye behind A and in B's zone cuts both). **Property** (≥ 200 samples over the approved U range): from `wallB` and `wallC`, the line to the subject's top row at its middle, ± 0.4 m and ± 0.8 m (within the run) crosses no uncut wall's zone box. **Pins:** `wallA` and the overview cut nothing over the approved range; at A = 1900 `wallA` cuts C, and at A = 2000 it cuts nothing (the engine band, A8.1). R6: restore the bound, and the regressions go red |
| **R3.2 — the cutaway survives a sync** (A8.2) | `applyCutaway` records the cut set on the shared parent. `syncSolidBodies` and `syncVoidMeshes` apply it to what they mount, before returning. | `cutaway.ts`, `scene-sync.ts` | With `["C"]` applied, a `syncVoidMeshes` (as after a delete) and a `syncSolidBodies` leave every wall-C object invisible and unpickable. With `[]` applied, they leave everything drawn. R6: remove the re-apply, and the tests go red |
| **R3.3 — presets** (review round 2, low 5 and optional) | `targetInRoom` takes only the three reference ids: a narrowed type, so the `wallC` arm cannot exist. `wallCPresetsOf` shares one `reflectAbout` with the reflection it performs. | `stage.ts` | `targetInRoom`'s parameter type excludes `wallC`, so `tsc` refuses the arm. Every existing preset test stays green |
| **R3.4 — one source for each constant** (clean-code must-fix) | `U_WALLS` comes from the domain's `wallsOf("U")`. `EYE_CLEARANCE_M` is **one exported source constant**, imported by `tests/cutaway.test.ts:45` and `qa-7h-preset-stands-clear.adversarial.test.ts:67`. QA's `ZONE_M` (0.742, 0.748) stays, commented as a **deliberate independent pin** of ADR 0108 H2's measured values. | `cutaway.ts`, `index.ts` | `git grep -n "0.05"` over the adapter's cutaway tests finds only the import. The suite is unchanged |
| **R3.5 — the `cornerOf` guard, and the hash names** (A8.4; clean-code optional) | A test: a wall-B or wall-C corner record whose `frame.x` would read the other way on wall A still wraps by its wall. Rename `shell-recorded-at-30a4ea1.ts` and `SHELLS_AT_30A4EA1` to what they record, and drop the `db9c402` hashes from `kitchen-shell.ts:531,603` (comments). | `kitchen-shell.ts` (comments only) | The guard test. R6: make `cornerOf` read `alongMm` on B, and it goes red |

- **Deferred to U5 S0:** the two catalogue-at-depth caches (a `Map` in `cutaway`, a `WeakMap` in
  `right-corner-wrapper`); `mirroredPieceTest` and the boolean flags in `scene-sync.ts`; the U4 test
  files' helper duplication; and splitting the 1 051-line `qa-u4-drawing-a-u.adversarial.test.ts`.
  All are behaviour-free, and U5 S0 already touches `right-corner-wrapper.ts` (A8.4).
- **Reading, developer:** ADR 0132 A2 and A8; AC4 (restated); `cutaway.ts`; `scene-sync.ts:78-170`;
  `stage.ts:360-460`; `right-corner-wrapper.ts:27-72`; `corner-assembly-size.ts:275-312`; the two QA
  cutaway files; the logic reviewer's `eye.mjs`, `click.mjs`, `sweep.mjs` and `sweep-tall.mjs` (the
  session scratchpad).
- **Reading, QA and the logic reviewer:** the same list, plus the round-3 diff.
- **Reading, logic reviewer:** D2, D4, D12–D14; ADR 0025, 0121, 0129, 0132; §6.1, §6.2, §11 rows 2,
  19, 21, 22; the wave diff.
- **Reading, clean-code reviewer:** the slice table; `engineering-conventions.md`; the wave diff.
- **Reading, visual reviewer:** *The 3D contract for a U*; D12–D14; skill `lemnaria-3d-reference`;
  `browser-and-visual-qa.md`; the 7H and 7I close-outs' *not a bug* lists; the capture set.

**Acceptance criteria.**

1. **Anchors, with the real probe** over a generated U sample (~~U3's~~ **U3b's, 2026-09-29**, or U2's
   `buildUShellDesign` shells with bodies inserted if U3b has not landed; the four corner pieces are
   already present in every U2 shell): every wall-C body's back face on wall C's plane at 0.000; the right
   X-leg at −0.020 (ADR 0025 mirrored); no two bodies intersect; no two stone volumes interpenetrate
   at the A∩C corner; the right X-leg's plinth recess reads its own `LD` only. **[unit] + [parity]**
2. **Reflection parity is captured, not only asserted.** ~~In a left-hand and a right-hand U~~
   **(2026-09-29: a U has one hand; the two parities are a wall-C body, +1, and a right-corner piece,
   −1):** a wall-C door front paints non-zero pixels; the selection outline on a wall-C body **and on
   the right X-leg** paints red pixels comparable to its wall-B / left twin (7I's 0-pixel class); a
   wall-C void mesh is visible; **a wall-C body's hinge and handle sides are its own, not wall B's
   reflected (Q-U5).** **[visual]** **2026-09-29: not captured in U4, because no U reaches a web
   surface before U5. It moves to U5 AC9 (ADR 0132 A8.5).**
3. **Picking on wall C** and on a right-corner piece (~~both parities~~ 2026-09-29: the two parities of criterion 2): §11 row 2 (the base slot of a cleared column selects the base
   slot) and row 22 (delete, then click another cabinet, selects it). No `Mesh`, `Line` or `Points` in
   the scene has a negative scale component (a test walks the graph). **[unit] + [e2e-able]**
4. ~~**Cameras.** `cameraPresetsForRoom(U)` ids are `[overview, wallA, wallB, wallC]`; L and straight
   are unchanged; `wallC` equals `wallB` reflected in `x = W/2` with C for B; at 390 × 844 the top
   row of every wall projects inside the viewport from all four presets for the minimum, a middle and
   the maximum U (§11 row 21). **[unit] + [visual]**~~ **Reworded 2026-09-29 (ADR 0132 A4).** The old
   wording cannot be met: at 390 × 844 the frustum is about 1.62 m wide at the preset distance.
   **Cameras:**
   - **(a)** A U's preset ids are `[overview, wallA, wallB, wallC]`. An L's and a straight room's
     presets are **byte-identical** to HEAD.
   - **(b)** `wallC` is `wallB` reflected in `x = W/2`, with C in place of B.
   - **(c) Row 21, the framing.** At 390 × 844, over five rooms — the engine's minimum U,
     2700/1600/1600, 3000/3000/3000, 4500/3000/3600 and the maximum — plus a ≥ 200-sample sweep of
     the approved U range:
     - each of `wallA`, `wallB` and `wallC` projects its **own** wall's top row, at that wall's
       middle, inside the viewport, ≥ 44 px thick and on screen horizontally;
     - the overview projects **every** wall's top row inside the viewport vertically, ≥ 44 px, and
       wall A's middle on screen horizontally.
   - **(d) Row 21, the click.** This is 7H's rule, restated for a U by ADR 0132 A2. From every
     preset, with `applyCutaway(cutawayWallsFor(eye))` applied, a ray from the eye to the centre of
     the top-row body's front, at the preset's own wall's middle, **picks that body**. Also:
     - no drawn body contains any preset's eye;
     - the overview and `wallA` cut nothing away ~~;~~ **over the approved U range. In the engine
       band only, at W < 1.91 m, `wallA`'s eye stands in wall C's zone and C is cut: the rule
       working, not an exception (2026-09-29, ADR 0132 A8.1);**
     - every run's fronts face the overview's eye;
     - **(2026-09-29, A8.1)** a wall is cut whenever the eye is in or behind its zone, wherever
       along the wall. From `wallB` and `wallC`, no line to the subject's top row (middle, ± 0.4 m,
       ± 0.8 m) crosses an uncut zone.
   - **(e) Must not:**
     - a requirement that every wall be held horizontally from every preset;
     - a cutaway in an L or a straight room;
     - a cut-away body or void returned by `pick`;
     - a room term in `PRESET_DISTANCE_M`.

   **[unit] + [prop] + [visual]** **2026-09-29: the `[visual]` half is not captured in U4. It moves
   to U5 AC10 (ADR 0132 A8.5). The unit and property halves stay U4's.**
5. **Lights**: a captured comparison of a wall-C front against its wall-B twin in a symmetric U,
   judged by the visual reviewer, and ADR 0132 records the choice D14 left open. **[visual]**
   **2026-09-29: not built or captured in U4. It moves to U5 AC11, with S3 (3). D14's choice is owed
   by U5's close, and U6 depends on it (ADR 0132 A8.5).**
6. **Shell**: wall C visible only for a U; floor depth `max(B, C) + overhang`; switching between an
   L and a U at equal `W × D × H` redraws. **[unit]**
7. **Must not:** `DoubleSide` on any body material; a second reflection primitive;
   `applyCornerDirection` on a leaf; any diff to `kitchen-parts.ts` or `reference/`. **[review]**

---

### Wave U5 — the editor and Step 1 carry a U (behind a test witness policy)

**Goal.** Every web surface that names walls or rooms handles a U, proved under a witness policy
stating U — so U6 can turn the card live with a policy line and nothing else.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S0 carried from U4 (2026-09-29, ADR 0132 A8.4). Light tier: behaviour-free apart from one record field** | (1) `derivePlacementRecords` carries `corner` (`cornerOf`'s answer) on every `PlacementRecord`; (2) the adapter's right-corner wrapper reads `record.corner`, and `placementStandingFor` is deleted; (3) one catalogue-at-depth cache, replacing `cutaway`'s `Map` and `right-corner-wrapper`'s `WeakMap`; (4) `scene-sync.ts`'s `mirroredPieceTest` and its boolean flags split into named functions; (5) the U4 test files' shared helpers go to one support module, and the 1 051-line `qa-u4-drawing-a-u.adversarial.test.ts` is split by subject; **(6) added 2026-09-29 at U4's close (ADR 0132 A8.7):** `mirroredPieceTest`'s flags (with 4); the U4 test-helper duplication (`OCCURRED_AT`, `PHONE`, `acceptedU`, `recordsOf`, mount helpers) lands before any new `qa-u4-*` file; `ZONE_M` re-declared unlabelled at `qa-u4-round3-cutaway.adversarial.test.ts:46`; the vague prose at `kitchen-shell.ts:~604`; the unchecked `userData` casts (`wallOf`, `CUT_WALLS_KEY`); the `EYE_CLEARANCE_M` public export, kept only if the web reads it; `room` made required on `syncVoidMeshes` and `applyRecordedCutaway` | `void-engine.ts` (domain, `derivePlacementRecords`), `right-corner-wrapper.ts`, `cutaway.ts`, `scene-sync.ts`, `kitchen-shell.ts` (prose), `index.ts` | ADR 0132 A8.4, A8.7; ADR 0121; the U4 round-2 clean-code findings |
| **S1 Step 1** | (1) Delete the 1D U throw; (2) `roomHrefFromDesignRoom` and `parsedRoomLengthsOf` for a U (wall C; ~~direction per Q-U4~~ **no direction: the toggle is hidden for a U and a `direction` on a U URL is ignored, the preview unmirrored — Q-U4 (b), 2026-09-29**); (3) 1F's summary from `wallsOf`; (4) `requiredFieldsFor` and `DRAWABLE_WALLS` from `wallsOf` (backlog 76); (5) facing labels never overlap (backlog 72) | `room/room-url-state.ts`, `room/generation-steps.tsx`, `room/plan-preview-model.ts` | G11, G12; D7, D16; Q-U4's record; ADR 0116 + A, 0126, 0127, 0104 B; backlog 72, 76 |
| **S2 the editor** | (1) `crossesOnScreen` for C, by projection (D15); (2) the width-step note follows it; (3) camera chip leaf `configure.cameraPresets.wallC`, ro/ru, lock and golden manifest; (4) the capture route accepts `wallC`; **(5) added 2026-09-29 (ADR 0132 A2): the scene applies `applyCutaway(cutawayWallsFor(camera.position, room, depth))` on every camera change, preset ease and orbit alike, before the next pick. e2e: in 3000/3000/3000 on `Perete B`, a tap on wall B's top row selects it; after orbiting back to the overview, wall C draws again.** **Widened 2026-09-29 (A8.2, A8.3): it re-applies also after mounting the selection outline or an overflow mark, before the next render or pick. When the cut set comes to include the selected body's or void's wall, the selection is cleared and the panel closes. The e2e adds: on `Perete B`, delete a wall-B body, then tap B's top row, and it selects; select a wall-C body from the overview, tap `Perete B`, and the panel closes.** **Widened again 2026-09-29, at U4's close (A8.2, A8.7): one effect, keyed on the camera, `designRoom`, `cabinetDepthMm`, `stage` and the controls' change event, recomputes `cutawayWallsFor` and calls `applyCutaway`, and it also runs after mounting an overlay (outline or mark). A depth change rebuilds the stage with no record while `reseatHoldingCamera` holds the camera still, and an in-place U resize re-applies a record computed for the old W. The e2e adds: on `Perete B`, switch the depth, then tap B's top row. `kitchen-stage.tsx:359` passes `room: designRoom` to `syncVoidMeshes`.** | `i18n/content.ts`, `panel/panel-model.ts`, `messages/ro.json`, `messages/ru.json` (+ generated `ro.d.json.ts`), `app/internal/scene-shot/shot-request.ts` | D13, D15; ADR 0129 Amendment (b); ADR 0095, 0113; `qa-7i-screen-side.adversarial.test.ts` |

- **Reading, QA:** G11, G12; D7, D13, D15, D16; ADR 0116 + A; `browser-and-visual-qa.md`; the slice
  diff.
- **Reading, combined reviewer:** the slice table; D15; ADR 0095, 0113, 0116, 0129 Amendment (b);
  `engineering-conventions.md`; the wave diff.
- **Reading, visual reviewer:** backlog 72; the plan preview at phone and desktop metrics; 7L S6's
  byte-identical mobile control method.

**Acceptance criteria.**

1. **Round trip** (*property*, any valid U room under the witness policy): room → URL → parse →
   the same room, ~~direction included~~ **with no direction; a U URL carrying `direction=right` parses to
   the same left U, and no toggle renders for a U (2026-09-29, Q-U4 (b))**; `roomHrefFromDesignRoom` → parse → the same room. **[prop]**
2. **1D and 1F**: a valid U reaches 1D without throwing; 1F's summary shows A, B, C and height, read
   through `wallsOf`; the L and straight summaries are unchanged. **[dom]**
3. **One enumeration**: `requiredFieldsFor` and the preview's walls derive from `wallsOf`; a test
   fails if a shape is added to one and not the other (backlog 76 closed). **[unit]**
4. **Facing labels** (*property*, U lengths across the Q-U1 range, phone and desktop metrics): the
   label boxes of walls B and C never intersect (backlog 72 closed); `"B · 24002400 mm"` is
   unreachable. **[prop] + [visual]**
5. **Screen words**: an adapter test projects +along through the `wallC` camera at both directions and
   the web's `crossesOnScreen` agrees on all six (wall, direction) pairs; A and B are unchanged.
   **[unit]**
6. **Copy**: exactly one new leaf per locale; the copy lock and golden manifest move by exactly it;
   its provenance recorded as drafted (no frame supplies it). **[unit] + [review]**
   **Corrected 2026-09-30 (coordinator's ruling):** two leaves per locale in U5, not one: the `wallC`
   camera chip (shipped in U4 S3, `b3c9e10`) and `room.compose.roomSummaryU` (U5 S1, `b4bfd8b`).
   Both are numeric format with no new words, provenance drafted.
7. **The phone is unmoved** for L and straight: 7L S6's byte-identical mobile control, re-run.
   **[visual]**
8. **Must not:** a component under `apps/web/src/room` compares a shape to `"U"` outside the named
   sites (the ADR 0116 A1 form: *the screen asks the domain*); `isShapeBuildable("U", APPROVED)` true.
   **[review]**
9. **Reflection parity, captured** (moved from U4 AC2, 2026-09-29, ADR 0132 A8.5). U4 AC2's
   checklist, captured through the capture route: a wall-C door front paints; the outline on a wall-C
   body and on the right X-leg paints, comparably to its left twins; a wall-C void is visible; the
   hinge and handle sides are wall C's own. **[visual]**
10. **Cameras, captured** (moved from U4 AC4's `[visual]` half). At 390 × 844 and at desktop, over
    U4 AC4's five rooms: each wall preset shows its own wall's top row, with the opposite run cut
    away where A2 cuts it, and nothing drawn in front of the subject. The overview faces every run's
    fronts. **[visual]**
11. **Lights, decided** (moved from U4 AC5 and S3 (3), D14). A captured comparison of a wall-C front
    against its wall-B twin in a symmetric U, judged by the visual reviewer. ADR 0132 records D14's
    choice by a dated line, and if the choice changes the rig, `stage.ts` changes in this wave. **Owed
    by U5's close; U6 does not start without it.** **[visual]**
    **Closed 2026-09-30: keep the rig; ADR 0132 Amendment B. `stage.ts` does not change.**

---

### Wave U6 — the switch

**Goal.** U's owner-approved bounds enter `APPROVED_ROOM_POLICY`, the U card continues, and every
"U is refused" assertion is restated or retired on the record.

**Depends on (2026-09-29, ADR 0132 A8.5):** U5 AC9–AC11 closed, D14's choice among them. The U card
does not go live on a lighting nobody has seen.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S0 census** (no production) | In a throwaway worktree at the wave base, apply S1's policy line alone; run domain and web unit suites; list every red and every e2e assertion naming a U refusal; classify each *restate in S1* or *defect — back to its wave*. Table appended here, **written live** (7J's F2 lesson) | none | 7J's S0 census and its two *removed, no replacement* rows (archived plan `:4165-4183`); `agent-coordination.md` (worktree bases) |
| **S1 the switch** | (1) `U` bounds in `APPROVED_ROOM_POLICY` + pins + the approved ⊆ engine guard **(dated 2026-09-30, U5 logic finding 6: with `minimumKitchen.isRequired: true` and H4's 1800 / 1000 reaches, guarded against the engine's. The engine's own flag is false, so copying the engine's shape without flipping it would admit rooms the generator refuses with `MINIMUM_NOT_MET`)**; (2) every wall maximum equal across shapes (Amendment G's test extended); (3) S0's restatements, each citing its row; (4) the seven `as BuildableShapes` casts deleted (G14) | `room/approved-room-policy.ts` | Q-U1, Q-U2 records (ADR 0108 H); ADR 0108 B1, G; ADR 0116 A2; S0's table |

- **Reading, QA:** S0's table; ADR 0108 H; ADR 0116 + A; the slice diff; per-commit sequencing check.
- **Reading, logic reviewer:** ADR 0108 (B1, G, H), 0116; S0's table; the wave diff.
- **Reading, clean-code reviewer:** the slice table; the wave diff.

**Acceptance criteria.**

1. **Sequencing**: `isShapeBuildable("U", APPROVED_ROOM_POLICY)` is false at every M7B commit before
   S1's (checked per commit). **[QA]**
2. **Bounds**, each at its approved value (**wall A's minimum is 2700 — RQ1, ADR 0108 H2, 2026-09-29**): min − 1 → `WALL_TOO_SHORT`, min and max accepted,
   max + 1 → `WALL_TOO_LONG`, for A, B and C; the minimum-kitchen and walkway boundary pairs
   recorded in ADR 0108 Amendment H; no number in any issue; the approved literals pinned and held
   inside `ENGINE_ROOM_LIMITS.U`; all shapes' wall maxima equal. **[unit]**
   **Dated 2026-09-30 (U5 logic finding 6; checked against ADR 0108 H3's table and its RQ8 note):
   2700/1000/1000 → `ROOM_TOO_SMALL_FOR_KITCHEN`; 3000/1000/1000 and 2700/1600/1600 accepted.**
   **An e2e walks 1A→1D→1F for a U once the approved policy carries it (U6 or U7).**
3. **The census closes**: every S0 red is either restated (citing its row) or a defect sent back; a
   row with no replacement is justified in the table, not left silent. **[review]**
4. **Casts**: `git grep "as BuildableShapes"` returns nothing under `packages/` or `apps/`. **[review]**
5. **The card continues** with no component edit: *În formă de U* → *Continuă* → 1B. **[dom]**

### U6 S0 census — 2026-09-30, at `ad63a8b`

**Method (observed).** A worktree at `ad63a8b`, S1's policy line applied alone and uncommitted, then
reverted (`git diff HEAD` empty afterwards): a `U` entry in `APPROVED_ROOM_POLICY` with wall A 2700–6000,
walls B and C 1000–6000, and `minimumKitchen` `{ isRequired: true, sinkWidthMm: 600, hobWidthMm: 600,
cornerReachMm: { wallA: 1800, sideWall: 1000 } }` (ADR 0108 H1–H4, RQ1 and RQ8; the 600 mm widths are
the L's, Amendment E). Domain, web and three-adapter unit suites ran through `rtk proxy pnpm run test`.
e2e was **not run** (no database credentials): its rows come from a static grep of `apps/web/tests/e2e`
and are **source-verified, not measured**.

A direct probe of the built domain with the line applied reproduced ADR 0108 H3's table exactly: 2699/3000/3000
`WALL_TOO_SHORT` on A; 2700/1000/1000, 2999/1000/1000 and 2999/6000/1599 `ROOM_TOO_SMALL_FOR_KITCHEN`;
3000/1000/1000, 2700/1600/1600 and 2999/6000/1600 accepted; 6001 `WALL_TOO_LONG` on A and on C; 999 on B
`WALL_TOO_SHORT`.

| Suite | Result with the line applied |
| --- | --- |
| `packages/configurator-domain` | 13 failed, 5529 passed (5542), 11 of 269 files. **8 are switch reds (D1–D8).** 5 are timeouts (below) |
| `apps/web` | **39 failed**, 4848 passed (4887), 16 of 279 files (W1–W39) |
| `packages/three-adapter` | 0 failed, 4091 passed (117 files) |
| e2e | not run; 11 refusal rows (E1–E11) and 8 layout witnesses to verify (V1–V8) |

**Five domain timeouts are not switch reds.** `composed-floor-is-recorded-whole.adversarial.test.ts:127`
(5 s), `qa-7d3-tall-end-block.adversarial.test.ts:463` (10 s), `qa-7d4-composed-bodies.adversarial.test.ts:360`
(5 s), `qa-u3b-generating-a-u.adversarial.test.ts:128` (5 s) and `shell-design.adversarial.test.ts:1266` (10 s)
timed out in the full run (75 s of wall clock for 608 s of cumulative test time). Re-run alone with
`--no-file-parallelism` and the line still applied, all five passed (the isolated run's only red was D7). Whether
they also time out at the base under the same load was **not measured**.

**Classes.** 54 *restate in S1* (D 8, W 39, E 7), 4 *removed, no replacement* (E3, E4, E5, E9), **0 defects,
back to its wave**. Every red is a test pinning "a U is refused" or "a U's fields are not judged", which B2's
sequencing and H4 end on purpose (ADR 0108 B2: a U stays refused until its wave; H4: `isShapeBuildable("U",
APPROVED_ROOM_POLICY)` stays false until U6). No red exposed a wrong verdict: every U the policy now accepts
or refuses is the one H3 predicts. Two facts shape how the web rows restate:

- After S1 **no shape is refused by `APPROVED_ROOM_POLICY`**, so `room-shape-refusal` cannot draw in the
  shipped app. Each web row that needs a refusal restates onto a fabricated policy that states no U (ADR 0116 A2:
  a fabrication is confined to a test), for which `POLICY_BUILDING_NOTHING` and `policyAlsoStating` already exist.
- A U's fields **are** judged now, so a wall C can carry a field reason and a plan mark.

**Cites, abbreviated in the table.** **B2→H4**: ADR 0108 B2 ended by H4 and this wave's S1 (1). **H**: ADR 0108
H1–H3 (bounds, walkway, the predicate). **116**: ADR 0116 A2 (a fabricated policy lives in a test) and A3. **G**:
ADR 0108 G. **S1(n)**: this wave's S1 item n. **AC**: this wave's criteria.

**Domain reds** (`packages/configurator-domain/tests/`, line of the test, the failing assertion in brackets).

| # | Test | What it asserts | Class | Cites |
| --- | --- | --- | --- | --- |
| D1 | `qa-m7b-u2.adversarial.test.ts:641` [653] | a U 3000/2000/2500 at h 2600 under the approved policy is `SHAPE_NOT_BUILDABLE` on `shape`; observed `ok: true` | restate in S1: the verdict becomes acceptance, with H3's boundary pairs beside it | B2→H4; S1(1); AC2 |
| D2 | `room/approved-room-policy.test.ts:202` [206] | the approved shapes are exactly `["L","linear"]` | restate in S1: `["L","U","linear"]`, and the approved ⊆ engine guard and the G maxima test gain the U | B1; G; S1(1),(2) |
| D3 | `room/is-shape-buildable.test.ts:51` [56] | the shapes the approved policy builds equal `SHAPES_WITH_APPROVED_BOUNDS` (`["linear","L"]`); its own failure text says a wave that adds a shape edits that list | restate in S1: add `"U"` | 116 A3; the file's own note; S1(3) |
| D4 | `room/is-shape-buildable.test.ts:78` [79] | `isShapeBuildable("U", APPROVED)` is false and true under `policyAlsoStating("U")` | restate in S1: the "reads the policy" contrast moves to a policy stating no U | 116 A2; B2→H4 |
| D5 | `room/minimum-kitchen.adversarial.test.ts:192` [193] | a U with `wallA` undefined, B −1, C ∞, height 0 is `SHAPE_NOT_BUILDABLE` alone; observed four field issues (wallA `VALUE_MISSING`, wallB `WALL_TOO_SHORT`, wallC `VALUE_NOT_WHOLE_MILLIMETRES`, height `HEIGHT_TOO_LOW`) and no shape issue | restate in S1: a U is judged field by field, as the test just below does for linear (7J S5) | B2→H4; S1(3) |
| D6 | `room/u-minimum-kitchen.test.ts:106` [107] | "leaves a U unbuildable under the approved policy, whose literals enter at U6" | restate in S1: the literals are pinned and the U is buildable | H1–H4; S1(1); AC2 |
| D7 | `generation/qa-u3b-generating-a-u.adversarial.test.ts:155` [156] | "keeps a U off the approved policy until U6" | restate in S1: as D6, or retire it in favour of AC1's per-commit check | B2→H4; AC1 |
| D8 | `generation/tall-end-composition.test.ts:739` [745] | `APPROVED_ROOM_POLICY` `toEqual` a fixed snapshot of L, linear and heights; observed the added `U` entry equals H's literals exactly | restate in S1: add the U to the snapshot | H1–H4; S1(1) |

**Web reds** (`apps/web/tests/room/`, line of the test, the failing assertion in brackets). "Fabricated" means a
policy that states no U.

| # | Test | What it asserts | Class | Cites |
| --- | --- | --- | --- | --- |
| W1 | `one-c-surfaces.test.ts:125` [130] | a chip moved to U mid-burst makes `isShapeRefused` true at once | restate in S1: fabricated | B2→H4; 116 |
| W2 | `plan-preview-model-marking.test.ts:415` [418], corner left | no wall of a U is marked, however far out of range, because a U is refused on its shape | restate in S1: a U's marks are its field issues, wall C included (the sibling test at :422 already marks C by id) | H; S1(3) |
| W3 | `plan-preview-model-marking.test.ts:415` [418], corner right | as W2 | restate in S1 | H; S1(3) |
| W4 | `qa-7f1-d45-convergence.adversarial.test.ts:1097` [1103] | the approved shapes are `["L","linear"]`, and a fully answered U URL gets no way on | restate in S1: the premise line gains `"U"`, the hostile-query subject moves to fabricated | B2→H4; 116 |
| W5 | `qa-7f1-url-seam.adversarial.test.ts:437` [456] | a U's walls fill from the URL and round-trip, and Continue is disabled; only the last line is red | restate in S1: Continue is enabled | B2→H4; AC5 |
| W6 | `qa-7f2-s1b-millimetres.adversarial.dom.test.ts:205` [210], ro | an old U link (4000/2400/2180, h 2700) refills as millimetres and lands on 1C ("a shape the policy refuses") | restate in S1: 1D; the refill subject is unchanged | H; B2→H4 |
| W7 | `qa-7f2-s1b-millimetres.adversarial.dom.test.ts:205` [210], ru | as W6 | restate in S1 | H; B2→H4 |
| W8 | `qa-7f2-s2-red-wall.adversarial.test.ts:438` [439] | a U's marked walls are empty for any typed room | restate in S1: as W2 | H; S1(3) |
| W9 | `qa-7f2-s3-one-c.adversarial.dom.test.ts:579` [583] | choosing the U chip outside a burst shows 1C's note (a room refused by shape alone) | restate in S1: fabricated | B2→H4; 116 |
| W10 | `qa-7f2-s4-shape-refusal.adversarial.dom.test.ts:410` [413], an empty U | refused on the first frame: refusal shown once, no field marked, no suggestion, Continue disabled | restate in S1: fabricated | B2→H4; 116 |
| W11 | same, a filled U | as W10 | restate in S1: fabricated | B2→H4; 116 |
| W12 | same, a U with every field out of range | as W10. Under the approved policy this URL is now three field refusals, covered by W2 and W8's restatement | restate in S1: fabricated | B2→H4; H |
| W13 | same, a U with unreadable and repeated fields | as W10 | restate in S1: fabricated | B2→H4; 116 |
| W14 | `qa-7f2-s4-shape-refusal.adversarial.dom.test.ts:425` [431] | a Back that lands on a U while an L is typed is refused, and clears on the way back | restate in S1: fabricated | B2→H4; 116 |
| W15 | same file `:502` [511] | the refusal region empties and refills in place on U, L, U | restate in S1: fabricated | B2→H4; 116 |
| W16 | same file `:514` [530] | one tap from a valid L whose walls fill a U changes the refusal and the note regions; observed none change | restate in S1: fabricated | B2→H4; 116 |
| W17 | same file `:536` [543] | a tap to an empty U changes only the refusal region; observed none | restate in S1: fabricated | B2→H4; 116 |
| W18 | same file `:561` [119] | the Russian refusal sentence draws once under the chips for a filled U | restate in S1: fabricated | B2→H4; 116 |
| W19 | `qa-7f2-s5-incomplete-plan.adversarial.dom.test.ts:398` [401] | a filled U (0.8/7/0.05, h 1.5) draws three bars and the refusal, and the 1C note alone | restate in S1: the refusal claim moves to fabricated. The same room under the approved policy carries three field reasons | B2→H4; H |
| W20 | `qa-7f2-s5-incomplete-plan.adversarial.test.ts:407` [407] | a U's shape refusal stands alone: no field reason, no marked wall, plan drawn or empty | restate in S1: as W19 | B2→H4; H |
| W21 | `room-issue-model.test.ts:538` [543] | the shapes the approved policy refuses are `["U"]`; observed `[]` | restate in S1: `[]`. The `ROOM_SHAPES` sweep at :526 still carries the general claim and passes | B2→H4 |
| W22 | `room-issue-model.test.ts:557` [569] | a U 2200/2000/2000 at h 2500 is 1C with no field reason and a shape refusal; observed one field reason (wallA) | restate in S1: 1C from wall A's `WALL_TOO_SHORT`, no shape refusal | H1 |
| W23 | `room-issue-model.test.ts:629` [635] | "suggests nothing for a refused U shape"; observed `isLinearSuggested: true` for that room | restate in S1: the suggestion follows its shape-independent gate. See the flag below | plan, *Owner questions* (dated line "no new 1C suggestion for a U"); `validatesAsStraightRoom` |
| W24 | `room-one-c.dom.test.ts:690` [692] | Continue is inactive for a filled U (substate 1C) | restate in S1: 1D, Continue active | B2→H4; AC5 |
| W25 | `room-one-c.dom.test.ts:806` [809] | the note shows for a room refused by shape alone (a U) | restate in S1: fabricated | B2→H4; 116 |
| W26 | `room-screen.dom.test.ts:394` [403] | choosing the U card records it and Continue stays disabled | restate in S1: Continue is enabled. This is AC5 | B2→H4; AC5 |
| W27 | `room-screen.dom.test.ts:642` [223] | the cards' group is described by the refusal while U is chosen | restate in S1: fabricated | B2→H4; 116 |
| W28 | `room-screen.dom.test.ts:701` [710] | a chip to U and back shows the refusal in the region that was already there | restate in S1: fabricated | B2→H4; 116 |
| W29 | `room-screen.dom.test.ts:729` [223] | only the chosen chip is described by the refusal | restate in S1: fabricated | B2→H4; 116 |
| W30 | `room-screen.dom.test.ts:759` [760] | a filled U shows the refusal and the note and no room reason (substate 1C) | restate in S1: fabricated | B2→H4; 116 |
| W31 | `room-screen.dom.test.ts:785` [223], ro | the refusal's words carry no digit, code, unit, internal reason or shape name | restate in S1: fabricated (the catalogue leaf is unchanged) | B2→H4; 116 |
| W32 | `room-screen.dom.test.ts:785` [223], ru | as W31 | restate in S1: fabricated | B2→H4; 116 |
| W33 | `room-screen.dom.test.ts:854` [859] | every code 1C can carry has a witness; `SHAPE_NOT_BUILDABLE`'s is a filled U | restate in S1: its witness renders under fabricated, so the exhaustiveness check stays | B2→H4; 116 |
| W34 | `room-screen.dom.test.ts:867` [871] | at 1C the suggestion matches the real gate for each witness, under the approved policy | restate in S1: the `SHAPE_NOT_BUILDABLE` row under fabricated | B2→H4; 116 |
| W35 | `room-screen.dom.test.ts:889` [891] | a refused U at 1C keeps three chips and no corner toggle, and L brings the toggle back | restate in S1: fabricated | B2→H4; 116 |
| W36 | `room-screen.u-witness.dom.test.ts:147` [191] | the walk 1A, 1B, 1D, 1F under the witness policy, ending on `isShapeBuildable("U", APPROVED) === false`; only that last line is red | restate in S1: drop or invert the last line. The screen-policy claim stands | B2→H4; 116 |
| W37 | `room-screen.u-witness.dom.test.ts:194` [197] | the same URL under the approved policy stays at 1C | restate in S1: the contrast policy is fabricated | B2→H4; 116 |
| W38 | `room-url-state.test.ts:451` [455] | a fully parsed U is 1C with `SHAPE_NOT_BUILDABLE` and marked field `shape`; observed 1D | restate in S1: 1D with the input, the refusal witness under fabricated | B2→H4; 116 |
| W39 | `step-one-carries-a-u.test.ts:143` [152] | "is still refused by shape under the approved policy" | restate in S1: invert, as the file's other tests already reach 1D under the witness | B2→H4 |

**e2e rows (static, not run).** Each names a U refusal, or asserts on the refusal region only a U could draw.

| # | Test | What it asserts | Class | Cites |
| --- | --- | --- | --- | --- |
| E1 | `room-desktop-line.desktop.e2e.spec.ts:390` (the U half, 406–408) | the U card shows `room-shape-refusal` and Continue is disabled; the Continue-geometry half is unaffected | restate in S1: U chosen, no refusal, Continue enabled | B2→H4; AC5 |
| E2 | `mobile-gate.e2e.spec.ts:123`, the step "1A — U refused, L taken" (125–128) | tapping the U card shows the refusal and disables Continue, then L clears it | restate in S1: U taken and Continue enabled, then L | B2→H4; AC5 |
| E3 | `qa-7f2-s4-shape-refusal.adversarial.e2e.spec.ts:70` | the refusal under the 1A U card has the frame's colours | **removed, no replacement.** No card, chip or URL in the shipped app draws that region once all three shapes build, and a seam to draw it is barred. Its tokens are measured on 1C's reasons at `:30`, the same `.screen` scope | B2→H4; S1 |
| E4 | `qa-7f2-s4-shape-refusal.adversarial.e2e.spec.ts:120` (the `shape=U` half, from 133) | a U's refusal at 1B costs one gap; the L half asserts the empty region costs nothing | **removed, no replacement** for the U half; the L half stays. Same reason as E3 | B2→H4; S1 |
| E5 | `qa-7f2-s4-shape-refusal.adversarial.e2e.spec.ts:154` | 1A under a refused U card clips neither its note nor any target | **removed, no replacement.** Same reason as E3. 1A with a shape chosen is measured at `:92` | B2→H4; S1 |
| E6 | `qa-7f2-s4-shape-refusal.adversarial.e2e.spec.ts:195` (test at 202), an empty and a filled U | every control is 44 px and nothing scrolls sideways "under its refusal" | restate in S1: the same 44 px scan on a U at 1B and 1D, no refusal expected. The filled U (3.6/2.4/2.4) is now 1D | B2→H4; H |
| E7 | `room-length-fields-fit.e2e.spec.ts:151` (witnesses `:127-131` and `:141-145`) | "a U room at 1C's worst case" shows `[REFUSAL, NOTE]`, and "a U room at 1B" shows `[REFUSAL]` | restate in S1: 1C's worst case shows the three field reasons and the note; the 1B witness drops `REFUSAL` and may join `SHAPES_FITTING_AT_ONE_B` once measured | B2→H4; H |
| E8 | `room-length-fields-fit.e2e.spec.ts:172` | the three unreadable sentences and the refusal of a U can be reached; the refusal is awaited at 176 and `mustScroll` is true (919 px in 709 measured under the refusal) | restate in S1: no `REFUSAL` wait, and re-measure whether the column still scrolls | B2→H4 |
| E9 | `room-length-fields-fit.e2e.spec.ts:248` | 1A's column holds the refusal under the U card without clipping | **removed, no replacement.** Same reason as E3 | B2→H4; S1 |
| E10 | `qa-7f2-s3-one-c.adversarial.e2e.spec.ts:114`, the `U` entry of `ONE_B_AND_ONE_C` (106–110) | at 1C a U's status region costs one gap; its `oneC` is 3.6/2.4/2.4, h 2.6, "1C on its shape" | restate in S1: that URL is now 1D and the test would wait for a note that is gone. `oneC` becomes a U with a real field reason, and `holdsItsFieldsAtOneB` is re-measured | H |
| E11 | `qa-7f2-s5b-unreadable.adversarial.e2e.spec.ts:144` | "three explained walls under its refusal": the column scrolls (`scrollHeight > clientHeight`, measured 919 in 709) | restate in S1: drop the words and re-measure the scroll pin | B2→H4; H |

**e2e layout witnesses to verify** (they name no refusal, but measure a column the refusal region used to occupy, or
land a U on 1D where it landed on 1C). Any of these may go red in the first e2e run and is then a restate, not a defect.

- **V1** `qa-7f2-s3-one-c.adversarial.e2e.spec.ts:52` (U at `WORST_CASE.U`, 0.8/0.8/0.8 at h 2): still 1C by its fields; compares 1C's touch targets with 1B's.
- **V2** `qa-7f2-s5-incomplete-plan.adversarial.e2e.spec.ts:85`: its comment names the refusal, and typing wall C 1200 on a 3.6/2.4 U now reaches 1D.
- **V3** `qa-7f2-s5b-unreadable.adversarial.e2e.spec.ts:59`, `:86`, `:102`, `:118`, `:275`, `:304` (each opens `A_VALID_U`, `:21`): the U starts at 1D, not 1C.
- **V4** `room-desktop-line.desktop.e2e.spec.ts:419` (`ONE_B_STATES`, "a U room", 161–175; its comment says "the refused U").
- **V5** `room-desktop-line.desktop.e2e.spec.ts:486` (`FITTED_ROOMS`, "a U room" 3/2.5/2, at `:220`): now 1D.
- **V6** `room-desktop-line.desktop.e2e.spec.ts:941` (criterion 16, `linear`, `L`, `U` at 1B).
- **V7** `room-desktop-line.desktop.e2e.spec.ts:983` (criterion 17, "1B, a U room").
- **V8** `room-length-fields-fit.e2e.spec.ts:72` (help targets for each shape at 1B, U included).

**Flags for the coordinator.**

1. **W23 is the one product-visible consequence.** A U whose wall A is below 2700 mm but whose wall A and
   height validate as a straight room now gets *"a straight kitchen would fit"* at 1C. The plan records "no new 1C
   suggestion for a U (the straight-room suggestion keeps its shape-independent gate)". I read that as keeping
   the gate as is, so W23 restates. If the owner meant a U gets none, that is a production change and a new decision,
   not a test edit.
2. **The refusal region becomes dead in the product.** After S1 only a fabricated policy reaches
   `room-shape-refusal` and the `room.issue.shapeNotBuildable` leaf. Removing them touches the copy lock and the
   golden hashes (ADR 0113), so this census does not; the four *removed* e2e rows are the only cost of leaving them.
3. **The cast count is one, not seven.** `git grep "as BuildableShapes"` under `packages/` and `apps/` returns a
   single expression: `apps/web/tests/room/qa-7f2-s1-issue-model.adversarial.test.ts:653` (its doc at `:642`, the
   import at `:23`). ADR 0116 A2 counted seven at `8cd084b`; 7J deleted the linear ones. S1 item (4) and AC4 say "the
   seven", and both mean this one. That test's U branch borrows the L's bounds (`[shape, lBounds]`), which S1 makes
   unnecessary. Whether `Object.fromEntries` then types without a cast is not tried here.
   **Dated 2026-09-30, at U6 S1: the count is one, and S1 item (4)'s and AC4's "seven" read as one.** The helper now
   spreads each stated shape's own typed entry instead of `Object.fromEntries` (whether that could have typed without
   the cast was not tried), and `git grep "as BuildableShapes"` under `packages/` and `apps/` finds nothing.
4. **Green tests that S1 may retire, not reds:** the fabricated U policies `U_WITNESS_POLICY`
   (`packages/configurator-domain/tests/support/u-witness-policy.ts`), `policyStatingU` and
   `approvedUWallBoundsStandIn` (`apps/web/tests/support/fabricated-u-policy.ts`), and the four `policyAlsoStating("U")`
   copies. Their `interim-unapproved` or `isRequired: false` values now differ from the approved policy's.
   `tests/room/room-screen.dom.test.ts:428` ("enables U against a policy that states its bounds") passes and
   is now vacuous. Stale comments: `apps/web/tests/e2e/support/u-design.ts:3`, `room-desktop-line.desktop.e2e.spec.ts:161`.
   **Dated 2026-09-30, at U6 S1: retired.** `U_WITNESS_POLICY` went, and its file became
   `tests/support/u-gate-verdict.ts` (the gate verdict under the approved policy). `policyStatingU`,
   `approvedUWallBoundsStandIn` and the four `policyAlsoStating("U")` copies went, and their file became
   `apps/web/tests/support/policy-without-u.ts` (the approved policy without its U, for the refusal's tests).
   The vacuous test at `:428` was replaced by the AC5 test and a fabricated-arm test; the stale comments are fixed.
5. **No test now pins the approved U's guard.** `POLICY_FIELDS` in `approved-room-policy.test.ts` lists the L's
   walls A and B, the height and the straight wall A only, and the storability property at `:442` draws L rooms
   only (`approvedRoomInput`, `:420`). So S1 (1) and (2) add tests for the U, not only edits.

---

### Wave U7 — the mobile gate, the desktop line, captures (the phase gate)

**Goal.** Prove the whole U path on a phone first (the gate), then on desktop, with captures.

> **Re-planned 2026-09-30 by the architect, at `45b3a61` (U6 S1 merged; U6's QA still running).** The
> plan in *U7 — the plan (2026-09-30)* below replaces the slice table and the criteria under
> *Superseded U7 plan (kept as the record)*. Every dated line that pointed at U7 is carried into the
> new criteria, and each one is cited where it lands.

### U7 — the plan (2026-09-30)

**What "the gate" is, in one sentence.** It is 7K's pattern, taken from the archived M7 plan's *Wave
7K* D3 and D4 as a pattern only: **the U journeys earlier waves wrote, inherited unchanged, plus one
new touch-driven spec and its desktop twin that close the gaps they leave, plus a capture pass on a
production build.** It is not a rewrite of any of them.

**This is a test-writing and capture wave.** No production file changes. A defect U7 finds goes back
to the wave that owns the surface, under that wave's tier. It is not fixed here.

- **Tier: Light** for S1–S3: adversarial QA, then one combined reviewer.
- **Visual: yes, the phase gate.** A visual reviewer walks the capture list on a production build.
- **S4 is coordinator-only** (docs and git), except for S4 (3), the ADR the architect writes.

#### U7-G — ground truth

Tiers: **[src]** read in the tree at `45b3a61`; **[doc]** quoted from a record; **[git]** from a git
command run for this plan; **[inf]** inference, owed a measurement. No suite was run for this plan.

| # | Fact | Tier |
| --- | --- | --- |
| G1 | **The inherited U journeys.** `u-flow.e2e.spec.ts` and `u-flow.desktop.e2e.spec.ts` share `support/u-flow.ts`. They drive 1A → the U card → 1B → 1D → 1F → the editor at 4500/3000/3600, and cover the reload at the room query and at `/d/{id}`, the four camera chips, and the back link. **They click, they never tap** (the 1D reload and the back link are read, then followed). They were written by U6 S1 to AC2's dated line (*"an e2e walks 1A→1D→1F for a U once the approved policy carries it (U6 or U7)"*). `qa-u5-cutaway.adversarial{,.desktop}.e2e.spec.ts` (with `support/qa-u5-cutaway.ts` and `u-cutaway-scene.ts`) and U5's QA e2e run through a U seeded by `PUT` (`support/u-design.ts`), not through Step 1 | [src] |
| G2 | **The touch helpers exist.** `support/step-one-by-touch.ts` (a `test` fixture, `typeDigits`, `readStoredDesign`, `recordPageErrors`, `findBaseRowTapTarget`); `support/canvas-taps.ts` (`tapCanvas`); `support/u-cutaway-scene.ts` (`tapScene`, `selectedId`, `chooseCabinetDepth`); `support/seeded-design.ts` (`issueShareLink`, `openSharedDesign`). `mobile-gate.e2e.spec.ts` has 18 `.tap(` calls | [src] |
| G3 | **Full e2e at U6 S1's merge: 537 passed, 2 skipped, 0 failed** (the coordinator's dispatch; not re-run here). CI's e2e job is split by Playwright project, `mobile` and `desktop` (ADR 0105), with **`timeout-minutes: 45` per leg** (`ci.yml:265`). CI runs on pull requests to `main`, pushes to `main` and manual `workflow_dispatch` (`ci.yml:10-18`). **The e2e job is skipped on pull requests** (`ci.yml:289`, `if: github.event_name != 'pull_request'`), so a PR's checks never include it. A branch gets runner e2e only by a manual dispatch. The coordinator's token was refused that with HTTP 403, and the owner agreed on 2026-09-17 to trigger it by hand from the Actions tab (STATUS, *CI*). **No runner run of the e2e job is recorded for M7 or M7B.** `main`'s last recorded run (`34580253814`, `995ad03`) failed on `e2e (desktop)` (STATUS). The last runner figures, in `ci.yml`'s own comment, are 28.6 minutes (mobile) and 19.4 (desktop), for a smaller suite | [doc] + [src] |
| G4 | **M7 is not on `main`.** `git merge-base --is-ancestor 5fbcad7 origin/main` is false. `origin/main` is at `995ad03` (M6B's merge, PR #8). `origin/m7-room-and-presets` (`8e7b59f`) **is an ancestor of** `origin/m7b-u-shaped-rooms`. So a pull request from M7B into `main` carries all of M7 unless M7's merges first. `gh pr list` answered `HTTP 401: Bad credentials`, so **whether M7's PR exists is not known** | [git] |
| G5 | **The smallest accepted U** (U5 logic finding 6, U6 AC2's dated line, checked against ADR 0108 H3): 2700/1000/1000 is refused (`ROOM_TOO_SMALL_FOR_KITCHEN`); **3000/1000/1000 and 2700/1600/1600 are accepted**. H3's predicate has two minimal corners: the shortest wall A (2700 with side walls ≥ 1600) and the shortest side walls (1000 with A ≥ 3000) | [doc] |
| G6 | **U5's visual review did not verify** (the coordinator's list): the editor's byte-identical control for L and straight; a production build; AC10's other two rooms (the engine minimum and 2700/1600/1600); a single-door wall-C cabinet's hinge side; real touch targets. U5 AC7 was proved for Step 1 only (18 screenshots pixel-identical to `dd9f63a`); the editor was compared by inspection | [doc] |
| G7 | **The capture route renders its own stage**, not a customer's design. `/internal/scene-shot` takes `view=wallC` since U5 (`shot-request.ts:36-45`), but it frames the room the stage holds. **So U captures go through the editor at `/d/{id}` on a design composed through Step 1**, as 7I's and 7J's captures did (`support/qa-7i-captures.ts`, `qa-7j-straight-captures.ts`) | [src] |
| G8 | **Backlog 98:** a reload of `/d/{id}` renders the seeded L (3 chips) before the loaded design, for about 130 ms in dev, for every non-L design. It pre-dates M7B. `u-flow.ts` already waits for four chips through a retrying assertion for this reason (`expectCameraPresetButtons`). There is also a latent cross-request store write on the server | [doc] + [src] |
| G9 | **Backlog 96, 97, 99, 100** (`docs/backlog/open.md:1952-2000`). 96: the engine's minimum-kitchen figures omit the 100 mm reserve; U6 brought the approved figure. 97: generation throws below 2200 mm; unreachable under approved heights. 99: plan-preview label fit, three known limits. 100: six orphan rows in the test database; the owner decides | [doc] |
| G10 | **The refusal region is dead in the shipped product** (U6 S0, flag 2). `room-shape-refusal` and `room.issue.shapeNotBuildable` draw only under a fabricated policy. Removing them moves the copy lock and the golden manifest (ADR 0113) | [doc] |
| G11 | **"No new 1C suggestion for a U" lives only in this plan** (*Owner questions*, *Not asked, recorded instead*). U6 S0's W23 kept the straight-room suggestion's shape-independent gate: a U whose A is under 2700, but which validates as a straight room, is told *"a straight kitchen would fit"*. No ADR records this | [src] |

#### U7-D — decisions *(the architect, 2026-09-30)*

- **D1 — "The smallest accepted U" is both of H3's minimal corners, 2700/1600/1600 and
  3000/1000/1000** (G5). Either alone would leave the other corner's geometry uncaptured: the
  narrowest walkway, or the fridge dropped with bare side walls.
- **D2 — The engine minimum leaves the visual list** (G6, AC10's other room). Under the approved
  policy no customer reaches it (A < 2700 is refused). Its framing is proved by U4 AC4 (c) and (d) at
  unit level, which stay. **Rejected:** seeding it through `PUT` for a capture. It would be a picture
  of a room the product never shows.
- **D3 — Inherit, do not rewrite** (7K D3's rule). `u-flow*`, `qa-u5-cutaway*` and U5's `PUT`-seeded
  specs are unchanged. **Rejected:** converting `u-flow`'s `.click()` to `.tap()`. A click journey
  beside a touch journey is itself coverage, since ADR 0023 found the two differ in this product.
- **D4 — One new journey, two specs, one support module.** `u-gate.e2e.spec.ts` (mobile, by touch)
  and `u-gate.desktop.e2e.spec.ts` (desktop, by click) both run `support/u-gate.ts`, the pattern of
  `u-flow` and `linear-flow`. The journey reuses G2's helpers **by import and never by copy**.
- **D5 — Backlog 98 is measured, not gated, in U7.** The gate asserts the restored end state, with
  four chips, the same design id and the same stored document. It also **reports** how long the L
  state is visible on each reload. Its fix is not U7's: it is pre-existing and crosses shapes. Its
  owner is **Q-U7-1**.
- **D6 — Backlog 99 is probed, not fixed, in U7.** The capture list includes the Russian 1C of a U
  with marked walls at 390 × 844. If an overflow shows in the product, the visual reviewer **stops
  and reports**. The remedy is a copy or layout decision for the owner, and U7 does not choose it.
- **D7 — The security reviewer's notes are backlog candidates, not U7 work.** The js-yaml and
  vitest advisories are dev-only and ship nothing. Node's own bundled undici is a runtime version
  (Vercel and CI), not a dependency this repository pins; `565dd54` already pins the one it does, under
  `@vercel/blob`. The scribe files them at S4, owned by the pre-launch security pass (STATUS,
  *Pre-launch, after M7*).

#### U7 slices

**Order:** U6 closed (QA and review) → S1 → S2 → S3 → S4. S1 and S2 may run in one dispatch if the
shared support module lands first. **S3 needs the tree frozen for the whole capture run**
(`browser-and-visual-qa.md`, *The tree a verifier measures must not move under it*): no QA, no
implementer and no scribe writes to it while S3 runs.

| Slice | Must-fix items (≤ 5) | Files | Reading |
| --- | --- | --- | --- |
| **S1 — the mobile gate, by touch** | (1) **Step 1 by touch.** 1A → *În formă de U* → 1B. Three fields, no corner toggle. Type **2700/1000/1000** and reach **1C** with the room-level reason (`ROOM_TOO_SMALL_FOR_KITCHEN`), no digit in any reason. Correct wall B and wall C to **1600** by erasing and typing, and reach **1D**; then *Continuă* → 1F → the editor at `/d/{id}`. The step pill reads 1 of 4, then 2. **No pathname between 1D and 1F** (`recordCommittedPathnames`). (2) **The chip row.** Four camera chips, each ≥ 44 × 44 CSS px, with no horizontal overflow at 390. The `wallC` chip frames wall C. (3) **Wall-C edits by touch**, in a middle U composed through Step 1 (4500/3000/3600), from the `wallC` preset: tap a wall-C base, and the readout's selection is that body. Replace it (the panel's swap list): the same id, the new build id. Delete it: the freed opening is a void. Tap that void and insert a base. Step its width once. Change the cabinet depth 600 → 700: every wall-C body's back face stays on wall C's plane, and wall C's run starts where the corner rule puts it at 700 (read from the scene readout). (4) **The large U (RQ7).** Compose **6000/6000/6000** through Step 1: wall A carries a hood and no generated upper. Tap wall A's wall-row void above a base and insert a `wall-cabinet`: accepted. (5) **Persistence and the share view.** Reload at the room query (1D, same fields) and at `/d/{id}`: after the reload, `readStoredDesign` equals the stored document before it, and the chips are 4. **Report** each reload's L-flash duration (D5). Issue a share link: `/s/{token}` draws the same bodies (the scene readout's ids and build ids equal the editor's) with 4 chips. **Every minted row is deleted in `afterAll`, and the run reports minted = deleted** | new `apps/web/tests/e2e/u-gate.e2e.spec.ts`, `support/u-gate.ts`; no production file | this slice's AC1 and AC5; G1, G2, G5, G8; `mobile-gate.e2e.spec.ts` and `step-one-by-touch.ts` as the pattern; `u-flow.ts`; `u-cutaway-scene.ts`; ADR 0023; ADR 0006 (row cleanup); ADR 0132 A2 and A8 (the cutaway from `wallC`); ADR 0110 *N3 revised* 11 (RQ7) |
| **S2 — the desktop line** | (1) `u-gate.desktop.e2e.spec.ts` runs S1's journey at 1440 × 900 through **D1B, D1C, D1F**. D1C shows the room reason for 2700/1000/1000 and the desktop suggestion rules exactly as the phone does. D1F's static plan aside draws three walls. (2) Every S1 assertion except touch-specific ones (items 1–5, by click). (3) **The phone is untouched by it:** S1's run and S3's phone frames are taken at the same commit before and after S2 lands, and are identical. (4) **ADR 0105's budget:** the local minutes each leg adds are reported, and a leg projected past 40 of its 45 minutes is flagged for S4 (6) before it reaches a runner | new `u-gate.desktop.e2e.spec.ts` | AC2, AC6; `room-desktop-line.desktop.e2e.spec.ts` (7L's pattern); ADR 0104 B, C; ADR 0105 |
| **S3 — captures and the visual pass** (the tree frozen) | (1) **A production build** (`pnpm --filter @lemnaria/web build`, then `next start`). **Evidence is written outside the repository**, and the console is read for every frame (`browser-and-visual-qa.md`, the trap). (2) **The capture matrix** below: the core rooms at every preset and both viewports, and the targeted frames, each with the checklist verdict. (3) **The byte-identical control for L and straight**, in the editor, against `dd9f63a` (G6; 7L S6's method): the same frames at both commits, compared pixel for pixel. Any differing pixel is a finding, explained or sent back. (4) **Real touch targets**: the reviewer confirms S1's 44 px measures on the rendered page, at 390 × 844, in both locales. (5) **Backlog 99 probe (D6):** the Russian 1C of a U with marked walls, at 390 × 844. If it overflows, stop and report | captures outside the repo; a capture spec only if QA writes one (`qa-u7-*`) | AC3, AC4; the capture list; *The 3D contract for a U*; ADR 0132 A, A8, B; ADR 0110 N11.8–N11.9; the 7H, 7I, 7J and U5 close-outs' *not a bug* lists; `browser-and-visual-qa.md` whole |
| **S4 — the phase close** (coordinator-only, and the architect for (3)) | (1) **Gates.** Whole-tree `pnpm format:check` last, then `pnpm ci:local` green on a clean tree. Push. (2) **Runner evidence and the pull request.** The `ci` workflow is dispatched by hand on `m7b-u-shaped-rooms` from the Actions tab, **by the owner** (G3), and every job goes green, both e2e legs included. Then the pull request into `main` on GitHub, in the order Q-U7-3 decides, with its PR checks green. The PR's checks do not include e2e, which is why the dispatch comes first (G3, G4). (3) **Durable reasoning.** The architect writes the dated ADR for G11: "a U gets no 1C suggestion of its own; the straight-room suggestion keeps its shape-independent gate", as ADR 0116 Amendment B or ADR 0108 I, whichever the sweep finds holds the suggestion rule. It checks that every rule this plan alone states is in an ADR. (4) **The milestone close-out** here: shipped, verification, deviations, deferrals with owners. Then STATUS: M7B → **Done**, *What is open right now* and *What to do next* rewritten to point at M8. (5) **The archive** (`WORKFLOW.md` step 7): `git mv` this plan to `docs/milestones/done/` with the stop-reading banner. Add a row in `done/README.md` naming the live knowledge: ADR 0108 H, ADR 0110 N (N1–N11.9), ADR 0129, ADR 0132 (A, A8, B), ADR 0116 A, ADR 0104 C. The scribe updates backlog: 96 (U6 landed the approved figure; the engine gate stays off), 98 and 100 (per Q-U7-1 and Q-U7-2), 99 (S3's probe result), and D7's security candidates. Scratch artefacts are removed | docs; git; GitHub | `WORKFLOW.md` step 7 and *A milestone's branch is kept, pushed, and merged on GitHub*; `documentation.md`; `ci-and-local-gates.md`; this plan's close-outs |

**Reading lines.**

- **QA (S1, S2):** this section; the specs and `support/u-gate.ts`; G1–G5; ADR 0105;
  `browser-and-visual-qa.md`; skill `javascript-testing-expert` for the reload loop's bound.
- **Combined reviewer (S1, S2):** the specs; `browser-and-visual-qa.md`; `engineering-conventions.md`;
  D3 and D4.
- **Visual reviewer (S3):** the capture list and its checklist; *The 3D contract for a U*; ADR 0132 A,
  A8 and B; ADR 0110 N11.8–N11.9; the 7H, 7I, 7J and U5 *not a bug* lists; `browser-and-visual-qa.md`
  whole.

#### U7 capture list *(S3; both viewports unless a row says otherwise; `ro` unless it says `ru`)*

Viewports: **390 × 844** (the gate; the `mobile` project's device, touch) and **1440 × 900** (the
line). Every frame is taken in the editor on a design composed **through Step 1** (G7), on a
production build, with evidence written outside the repository.

**Core matrix — 4 rooms × 4 presets × 2 viewports = 32 frames.**

| Room | Why | Presets |
| --- | --- | --- |
| **R1 2700/1600/1600, h 2600** | The smallest accepted U by wall A (D1): the narrowest walkway. The fridge is on B (a tie) | `overview`, `wallA`, `wallB`, `wallC` |
| **R2 3000/1000/1000, h 2600** | The smallest accepted U by side walls (D1): the fridge dropped, and the side walls bare or door-filled (N9.2) | the same |
| **R3 4500/3000/3600, h 2600** | The middle U, the one `u-flow` composes. The fridge is on C, so wall A reads from the right corner (N11.8) | the same |
| **R4 6000/6000/6000, h 3900** | The maximum, and a large U: wall A base-only with its hood (RQ7), and the tallest room | the same |

**The checklist for every core frame:**

- wall C's plane is present;
- fronts face the room;
- no corner piece floats;
- the right corner reads as the left's mirror;
- nothing is drawn past a wall's end;
- the top row is visible from each wall's own preset, and vertically from the overview (U4 AC4);
- from a side preset, the opposite run is cut away wherever A2 and A8.1 cut it, and nothing drawn
  stands between the eye and the subject;
- the overview faces every run's fronts (ADR 0132 A3);
- a hood stands over every hob;
- R4 has no upper on wall A;
- the console shows no page error.

**Targeted frames — 31.**

| # | Frame | Viewports | What it proves |
| --- | --- | --- | --- |
| T1 | **2700/1600/1700**, `wallA` | both (2) | The fridge on C: the sink at A's left run, and **a one-door 300 mm `base-cabinet` between the sink and the right corner, with no bare gap** (N11.8, N11.9) |
| T2 | **R3, a single-door (300–499) base on wall C beside its wall-B twin**, `wallC` and `wallB` | both (4) | Wall C's hinge and handle sides are its own, not wall B's reflected (Q-U5; G6) |
| T3 | **R3, the selection outline** on a wall-C body and on the right X-leg, `wallC` | 390 (2) | 7I's 0-pixel class on the only −1 bodies, now through the real flow (R3) |
| T4 | **R4, a `wall-cabinet` inserted above a base on wall A**, `wallA` | both (2) | RQ7: the void accepts an upper, and it sits flush |
| T5 | **R3 after depth 600 → 700**, `wallC` | both (2) | Wall C slides, backs stay on the plane, and the right corner re-seats |
| T6 | **Step 1 for a U:** 1B (three fields, no toggle), 1C for 2700/1000/1000, 1D, and 1F; on desktop D1B, D1C, D1F | 390 in `ro` and `ru` (8); desktop in `ro` and `ru` (6) | Labels fit; one reason per state; no digit (Q-U4 (b); ADR 0104 B) |
| T7 | **The Russian 1C of a U with wall B and wall C marked** | 390, `ru` (1) | Backlog 99's probe (D6) |
| T8 | **The share view `/s/{token}`** of R3, `overview` | both (2) | The same U, read-only |
| T9 | **The four-chip row**, in `ro` and `ru` | 390 (2) | Real touch targets (G6), none clipped |

**The byte-identical control — 10 frame pairs** (S3 (3)): an L (3700/3400/2600, the L room `stage.u-cameras.test.ts` samples)
at `overview`, `wallA` and `wallB`, and a straight room at `overview` and `wallA`, at both viewports.
Each is taken at `dd9f63a` and at the U7 commit and compared pixel for pixel. A difference is
explained by a dated record or sent back.

#### U7 acceptance criteria

1. **The mobile gate** (S1, 390 × 844, **by touch**). Everything in S1 (1)–(5) holds, asserted
   through retrying assertions and never a snapshot `count()` (G8). This carries the superseded AC1,
   and U6 AC2's dated e2e line, now by touch. **Must not:** a pathname between 1D and 1F; a digit in
   a 1C reason; a corner toggle for a U; a minted row left behind; a page error. **[e2e]**
2. **The desktop line** (S2, 1440 × 900). The same journey through D1B, D1C and D1F, by click. The
   phone's S1 run and phone frames are identical before and after S2 lands. **[e2e]**
3. **The captures** (S3). Every core and targeted frame in the capture list, **inspected**, with the
   checklist verdict per frame recorded in the close-out. The engine minimum is out, by D2. **A frame
   that fails is a finding**, returned to the owning wave, and the phase stays open until it is
   closed. **[visual]**
4. **The byte-identical control** (S3 (3)). All 10 pairs are pixel-identical, or each difference is
   explained by a dated record. **[visual] + [measured]**
5. **Persistence hygiene.** Across S1, S2 and S3, rows minted equal rows deleted, reported from the
   run. The six rows of backlog 100 are **not** touched (add-only; Q-U7-2). **[e2e] + [report]**
6. **The e2e budget** (R6). Minutes added per leg are reported, and on the **dispatched** runner run
   (S4 (2)) **each leg finishes inside `timeout-minutes: 45`**. A leg that would not is split by project or shard (ADR 0105's
   direction), never given a raised ceiling. **[gate]**
7. **The gates.** Whole-tree `pnpm format:check` last; `pnpm ci:local` green on a clean tree; the
   branch pushed; the owner-dispatched `ci` run on the branch green, every job, e2e included; the
   pull request's own checks green. **[gate]**
8. **Must not:**
   - a production file changed in U7;
   - an inherited spec rewritten (D3);
   - a test helper copied rather than imported (D4);
   - a defect fixed inside U7 rather than in its owning wave;
   - M7B declared closed with any criterion 1–7 unmet.

   **[review]**

#### What closes the phase

M7B closes when U7's criteria 1–8 are met and S4 (1)–(5) are done:

- gates green: the owner-dispatched runner run green, e2e included, and the PR's checks green;
- G11 recorded in an ADR;
- the close-out written, and STATUS saying **Done**;
- the plan archived with its banner and its `done/README.md` row;
- backlog updated, and scratch removed.

The pull request merges into `main` **through GitHub** (`WORKFLOW.md`, owner rule 2026-09-07). The
merge itself is the owner's click and is not a criterion. Until M7's own PR is resolved (G4, Q-U7-3),
M7B's PR cannot be a reviewable unit of M7B alone.

#### Owed before M7B can close, which no wave owned until now

| Item | Owner | Where |
| --- | --- | --- |
| The ADR for "no new 1C suggestion for a U" (G11) | architect | S4 (3) |
| Runner evidence for the e2e job, which has not run for M7 or M7B and never runs on a PR (G3) | **the owner** (the Actions-tab dispatch; the coordinator's token gets HTTP 403); then the coordinator reads the run | S4 (2), AC6, AC7 |
| M7's pull request into `main`, and its order relative to M7B's (G4) | the owner (Q-U7-3); then the coordinator | S4 (2) |
| Backlog 96's entry: U6 landed the approved figure, and the engine gate stays off | scribe | S4 (5) |
| Backlog 98 (the reload flash) and its security side note | the owner (Q-U7-1); default M8's first wave | S4 (5) |
| Backlog 100 (six orphan rows) | the owner (Q-U7-2) | S4 (5) |
| The security reviewer's advisories (D7) | the pre-launch security pass, filed by the scribe | S4 (5) |
| The dead refusal region (G10) | **Kept, not owed**: it is the refusal any future shape without bounds would draw; removing it moves the copy lock. Filed as a backlog note by the scribe | S4 (5) |
| U6's QA and review, which are still running | coordinator | before S1 |

#### Owner questions (U7)

**Q-U7-1 — The reload flash (backlog 98). Non-blocking; default (A).**

> *"When you reload a saved kitchen that isn't the standard L (a U, or a straight one), the page shows
> the standard L for a split second before your kitchen appears. It has been like this since before
> the U work, and it never changes what is saved. When should we fix it? (A) Recommended: right after
> the U-shaped rooms are merged, as the first job of the next milestone (the review screen), which
> works in the same part of the app. (B) Now, before the U-shaped rooms are merged. That adds a wave
> which changes how every saved kitchen loads."*

**Q-U7-2 — Six leftover test rows (backlog 100). Non-blocking; default (A).**

> *"A test run left six practice kitchens in the test database. Their ids were lost, so they can only
> be found by the time they were made. (A) Recommended: leave them. They are harmless, and a delete by
> time window could remove something else in that shared test database. (B) Delete them, found by the
> run's time window, after you confirm the list we show you."*

**Q-U7-3 — How the M7 and M7B work reaches `main`. Blocks only S4 (2), not S1–S3; default (A).**

> *"The room-screen work (M7) and the U-shaped rooms (M7B) are both still off the main branch, and
> M7B sits on top of M7. (A) Recommended: merge M7's pull request first, then open M7B's, so each is
> reviewed as its own piece. (B) One pull request carrying both. (C) Open M7B's pull request against
> M7's branch now, and merge them in order."*

**Q-U7-4 — An action, not a choice, needed at S4 (2).**

> *"When the U work is ready to merge, please press 'Run workflow' on the `ci` workflow for the branch
> `m7b-u-shaped-rooms`, in GitHub's Actions tab. The browser tests only run that way (a pull request
> skips them), and our access token isn't allowed to start it."*

### Superseded U7 plan (kept as the record)

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S1 mobile e2e** | The flow in criterion 1 at 390 × 844, touch | e2e spec only | `browser-and-visual-qa.md`; ADR 0105; 7K's mobile spec as the pattern |
| **S2 desktop e2e** | The same flow at 1440 × 900 through D1B, D1C, D1F | e2e spec only | 7L's desktop spec; ADR 0104 B |
| **S3 captures** | Criterion 3's matrix | capture route only | The 7I S4 capture route; *The 3D contract for a U* |

- **Reading, QA:** this wave's criteria; the specs; ADR 0105.
- **Reading, combined reviewer:** the specs; `browser-and-visual-qa.md`.
- **Reading, visual reviewer:** *The 3D contract for a U*; the capture matrix; the 7H/7I/7J
  close-outs' *not a bug* lists.

**Acceptance criteria.**

1. **Mobile** (390 × 844, touch): 1A *În formă de U* → 1B (three fields; ~~the toggle per Q-U4~~ **no toggle, Q-U4 (b), 2026-09-29**) → 1C
   for a U below its minimum (a field or room reason, no number) → corrected → 1D → 1F → the editor at
   `/d/{id}`; select a wall-C body; replace it; delete it; insert into the freed wall-C opening; step
   its width; change the cabinet depth 600 → 700 and see wall C slide; reload on the room query and on
   `/d/{id}` restores; the share view draws the same U. **Added 2026-09-29 (RQ7):** on a large U,
   insert a wall cabinet above a base on wall A. **[e2e]**
2. **Desktop** (1440 × 900): the same flow; the phone captures of criterion 3 unchanged by it. **[e2e]**
3. **Captures** (**dated 2026-09-30: "Q-U1 minimum" is restated as "the smallest accepted U"**): {Q-U1 minimum, a middle U, the maximum} × ~~{left, right} ×~~ {`overview`, `wallA`,
   `wallB`, `wallC`} × {mobile, desktop}. **2026-09-29: `{left, right}` is removed. A U has one hand
   (ADR 0132 d8, Q-U4 (b)).** Checklist per frame: wall C's plane present; fronts face the room; no
   floating corner piece; the right corner reads as the left's mirror; nothing past a wall's end;
   the top row visible ~~.~~ **from each wall's own preset, and vertically from the overview (U4
   AC4); from a side preset, the opposite run cut away where A2 cuts it (ADR 0132 A8.1).**
   **[visual]**
4. **Gates**: whole-tree `pnpm format:check` last; `pnpm ci:local` green on a clean tree (R8); the
   e2e additions reported against ADR 0105's ceiling. **[gate]**

## Risks

- **R1 — A shared-helper change moves the L.** Every wave re-runs the byte-identity criterion
  against the recorded baselines; the L is the regression surface, not the U.
- ~~**R2 — A canonical frame read as a world coordinate** (β's specific hazard): a consumer treats a
  wall-C frame as world `x`. Mitigated by one projection function, U1-A6's mirror equivariance with
  sabotage both ways, and a reviewer grep for `frame.x` reads outside the named sites.~~
  **R2, restated 2026-09-29 (α, ADR 0132 d1): a wall-C world frame computed without the room.** A
  transform caller that does not pass `W` puts wall C at `x = 0`, on top of wall B. Mitigated by U1-A6
  (mirror equivariance over validation and voids, sabotage both ways) and a reviewer grep that every
  caller of the wall-C transform (census U10–U12) passes the room.
- ~~**R3 — Nested reflections reintroduce 7I's invisible-outline class** at the other parity. U4-A2
  captures both parities; a mesh-only assertion is not accepted.~~
  **R3, restated 2026-09-29:** there is no nested reflection (no U is right-handed, ADR 0132 d8). The
  risk is 7I's class on **the four right-corner pieces**, the only −1 bodies in a U. U4-A2 captures an
  outline on the right X-leg; a mesh-only assertion is not accepted. **2026-09-29: the capture
  moves to U5 AC9 (ADR 0132 A8.5).**
- **R4 — Wall C is unlit by the key light** (G10, [inf]). ~~U4-A5~~ **U5 AC11 (2026-09-29, ADR 0132
  A8.5)** decides it on pixels, by U5's close. U6 depends on it.
- **R5 — The byte cap grows** at a public write seam. U1 S2 carries a security reviewer; the 413 test
  is re-run at the new cap.
- **R6 — The e2e suite grows past what ADR 0105 budgeted.** U7 reports minutes added; a split, not a
  ceiling raise, is ADR 0105's direction.
- **R7 — Owner answers arrive late.** U1, U2, U4, U5 proceed on interims because nothing is reachable
  before U6; U3 and U6 wait. A wave built on an interim that an answer later moves re-plans the delta
  by dated line.
- **R8 — Composition on three walls is the milestone's cost centre** (G17: thirteen amendments of
  two-wall rules). Q-U3 (b) contains it; if the owner chooses (a), U3 is expected to split into more
  than one wave and the architect re-plans it before dispatch.
- **R9 — A wide U frames poorly** (7J's R5 materialised at 6000; backlog 16's right end of wall A).
  U4-A4 captures min, middle and max; a remedy is a preset target, not a geometry change.
- **R10 — The odd millimetre at the right corner** (D5): a rule found by a failing centre rather than
  chosen. U0 S2 measures, ADR 0132 decides, U2-A1 asserts.
- **R11 — "Removed, no replacement" at the switch** (7J's two S0 rows). U6 S0 is written live; QA
  diffs assertions, not counts.

## Verification

Per `docs/WORKFLOW.md`, every wave: plan → implement → adversarial QA (gates review) → review at the
named tier → coordinator verification → commit → scribe. Specifically for M7B:

- **Properties run with `fast-check`** (skill `javascript-testing-expert`) wherever a criterion says
  *property*, with a stated sample count and the named boundaries added as explicit cases.
- **Sabotage in both directions (R6)** for U1-A6, U2-A1, U2-A3, U3-A1, U3-A2 and U4-A3: remove the
  behaviour → red; move an unrelated correlate → green. A sabotage against an already-red suite is not
  a measurement.
- **Measurements run against a `tsc` build of `src` at a named commit**, never the checked-in `dist`,
  and every figure a record carries names its script and commit.
- **Visual claims need captures** at 390 × 844 (the gate) and 1440 × 900 (the line); a model of the
  rendering is not evidence about it (`WORKFLOW.md`, *Working conventions*).
- **Output that is asserted runs through `rtk proxy`** (R9); counts are copied from command output.
- **Each wave closes in `docs/STATUS.md`** on its commit (`WORKFLOW.md`, *A wave is complete only
  once `STATUS.md` says so*); the phase closes only when U7's criteria are met, then archives
  (step 7) with ADR 0132 and ADR 0108 H / 0110 N carrying the durable reasoning.

## What M7B hands M8

- M8's review screen groups wall → band → order; `WALL_DISPLAY_RANK` gains C in U1, so the review
  lists wall C third and M8 plans against three walls from the start (the M7 re-plan's reason 4 for
  this order).
- The contact submission's configuration snapshot is the `Design`; it carries `wallCMm` for a U.
- Nothing in M7B touches customer profiles, the contact form, or `SEC-001`.
