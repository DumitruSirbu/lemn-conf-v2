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
> owner; U3 waits on RQ13–RQ17** (N6′) or their defaults.

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
  revised*), re-measured (N4′); **five new residual questions RQ13–RQ17** (N6′) gate U3.

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
| **U3** | Composing a U across three walls | **Full** | No | U2; **Q-U3**, **RQ1–RQ12** (all answered 2026-09-29); **RQ13–RQ17** | ADR 0110 N6′'s residual questions, or their defaults accepted |
| **U4** | Drawing a U: shell, ~~reflected group~~ right-corner wrappers, picking, cameras, lights | **Full** | **Yes** | U2 | ~~Q-U5 (non-blocking)~~ none — Q-U5 answered 2026-09-29 (ADR 0132 d1–d2) |
| **U5** | The editor and Step 1 carry a U (behind a test witness policy) | Light | **Yes** | U2, U4 | Q-U4 (wording) |
| **U6** | The switch: U's approved bounds; the card goes live; casts deleted | **Full** | No | U3, U4, U5; **Q-U1, Q-U2, RQ1, RQ8** (all answered 2026-09-29) | — |
| **U7** | Mobile gate, desktop line, e2e, captures — the phase gate | Light | **Yes** | U6 | — |

Order **U0 → U1 → U2 → {U3 ∥ U4} → U5 → U6 → U7**. U3 (domain) and U4 (adapter) touch disjoint
packages and may run in parallel **only in separate worktrees** (`WORKFLOW.md` R2; worktree bases per
`agent-coordination.md`). QA gates review in every wave; the tree is frozen for every measurement (R1).

**Branch.** `m7b-u-shaped-rooms`, created when U1 starts from M7's tip or from `main` once M7's pull
request merges — the coordinator records which in the U1 close-out — pushed early and merged to
`main` through GitHub (`WORKFLOW.md`, *A milestone's branch is kept, pushed, and merged on GitHub*).

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
(`u0-measure-rq.mjs`, ADR 0110 N4′). **RQ13–RQ17** (N6′) now gate U3 alone, and U6 waits on no owner
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

1. **The L and the straight kitchen are byte-identical.** Every recorded generation baseline and
   every L or straight design the product generates serialises exactly as at the wave base;
   `git diff <base> -- packages/three-adapter/src/kitchen-parts.ts packages/three-adapter/reference/`
   is empty. **[unit] + [parity]**
2. **Old documents still load** (*property*): every document valid at the wave base — the fixture
   corpus plus generated L and straight rooms — parses and validates with identical findings after.
   **[prop]**
3. **The schema's shape.** A U with its C key parses; a U without it, and an L or straight room
   with it, are refused at the schema. A wall-C placement in an L or straight document is **marked**
   overflowing, never refused (D6). **[unit]**
4. **`wallsOf`** is exactly `[A]`, `[A, B]`, `[A, B, C]`; `wallLengthMm` follows D6 for all nine
   (shape, wall) pairs. **[unit]**
5. **Storage.** The re-derived `MAX_PLACEMENTS`, `MAX_EMPTY_COLUMNS` and `MAX_DESIGN_BYTES` are
   reported with the before/after figures from the test run, not from G16's arithmetic; a U packed to
   `MAX_PLACEMENTS` with the narrowest catalogue body across three walls and three bands serialises
   under `MAX_DESIGN_BYTES` and parses; the write route answers 413 at one byte over. **[unit]**
6. **Mirror equivariance** (*property*; ~~under β~~ **under α, 2026-09-29: `mirror` also maps world `x ↦ W − x`; it covers validation and voids only, never composition, which the owner ruled independent (Q-U5)**): with `mirror(D)` swapping walls B ↔ C and sending
   a wall-A centre `a` to `W − a`, for generated U designs `validateDesignForCatalog(mirror(D))` equals
   the mirror of `D`'s findings and `recomputeVoids(mirror(D))` the mirror of `D`'s voids. `mirror` is
   a reviewed test utility. **Sabotage both ways (R6):** break the C arm of one S3 helper → red; move
   an unrelated wall-A body → green. **[prop]**
7. **The right corner is checked like the left.** A recorded span on wall C overlapping a body at the
   A∩C corner reports `RECORDED_SPAN_OVERLAPS_CORNER_BODY` exactly where its wall-B twin does at A∩B;
   B and C spans never compare against each other. **[unit]**
8. **Wall C keys never collide** with wall B's at the same along value; §11 rows 1, 17 and 18 hold on
   wall C with no UI. **[unit]**
9. **Must not:** `isShapeBuildable("U", APPROVED_ROOM_POLICY)` is true (checked at every commit);
   `cornerDirection` is read anywhere but `cornerDirectionOf`; a product bound enters
   `DesignRoomSchema` (ADR 0108 alternatives). **[unit] + [review]**

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

1. **The right corner mirrors the left** (*property*, engine U range): the right corner's four
   placements carry the left's build ids, and equal the left corner computed for the room with B and
   C swapped, reflected in `x = W/2`. The two X-legs never overlap; the right X-leg's far edge is `W`,
   ~~less at most the odd millimetre ADR 0132 places~~ **exactly (2026-09-29, ADR 0132 d4)**. No
   half-millimetre centre anywhere. `ENGINE_ROOM_LIMITS.U.wallA.minMm` is 1800, derived from the two
   X-legs' reference widths. **[prop]**
2. **The shell** (*property*, ≥ 200 samples over the engine U range plus every boundary): zero
   `validateDesignForCatalog` findings of either severity; every empty column ≤ 800 mm; floor and
   wall-only tiles on each of A, B and C cover their runs with no gap and no overlap; nothing recorded
   over either corner zone. **[prop]**
3. **Depth change** (600 → 700 on U shells): wall C's placements slide by exactly what wall B's do
   in the room with B and C swapped; wall A does not move; corner widths are frozen; the 30 mm
   top-row residue is present on both side walls. **[unit] + [prop]**
4. **No run-end panel** for any U: `runEndPanelSeatM` answers none (*property* over the range); the
   L's and the straight room's answers are unchanged. **[prop]**
5. **Engine limits and mapping.** `ENGINE_ROOM_LIMITS.U` holds no literal (a test reads its sources);
   under a witness policy stating U, a valid U input maps to D1's shape and its issues name only
   `shape`, `wallA`, `wallB`, `wallC` or `height`, with **no number in any issue**; the approved policy
   still refuses a U. **[unit]**
6. **The L and the straight kitchen are byte-identical** (U1-A1 re-run); `buildLShellDesign` still
   refuses a U with `ROOM_NOT_L`. **[unit]**

---

### Wave U3 — composing a U (blocked on Q-U3)

**Goal.** `generateKitchen` composes a U by the owner's Q-U3 ruling, through `insertBody` alone,
and Step 1's minimum-kitchen gate agrees with it. **The slice table is provisional**: Q-U3 (b)
touches far fewer files than (a); the architect re-cuts it after the answer, by dated line.
~~**2026-09-29:** Q-U3 was answered (c) — ADR 0110 N. The re-cut is owed **after RQ1–RQ12** (N6); R8
applies (a three-wall run with two cuts is closer to (a) than (b)), so expect U3 to split. Criterion 1's
*"exactly one oven"* reads **N3.8** (two towers in a large U); criterion 3's witnesses are N4's.~~
**2026-09-29, revised on the RQ answers:** Q-U3 (c) and RQ1–RQ12 are answered (ADR 0110 N, *N3
revised*). The re-cut is owed after **RQ13–RQ17** (N6′) or their defaults; R8 applies, so expect U3 to
split. Criterion 1's *"exactly one oven"* **stands for every U** (RQ5: the generator places one tower;
E4 unchanged). Criterion 3's witnesses are **N4′**'s. **Added criterion (RQ7):** in a large U the
hood stands over the hob, and wall A's wall and top rows carry **voids and no body**, so the editor
can insert middle and top units there.

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

### Wave U4 — drawing a U (adapter)

**Goal.** A U design draws to *The 3D contract for a U*: wall C, the reflected right-hand group,
picking, outline, overflow mark, cameras and lights — correct at both reflection parities, captured.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S1 the shell** | (1) Wall C's plane (D12); (2) floor depth `max(B, C)`; (3) signature includes shape and C; (4) no run-end panel on a U | `kitchen-shell.ts` | D11, D12; G8; 7H and 7J close-outs (archived plan, by section); ADR 0120 D2–D3 |
| **S2 the right corner's wrappers** | ~~(1) Wall-C bodies and right-corner pieces (by `cornerOf`) in one group reflected in `x = W/2`; (2) void meshes likewise~~ **2026-09-29 (ADR 0132 d1–d2): (1) the four right-corner pieces (by `cornerOf`) each in a wrapper group mirrored by `applyCornerDirection`; (2) wall-C bodies and voids drawn at their world frames, unmirrored**; (3) overflow mark and selection outline on wall C and on a mirrored corner piece; (4) picking climbs through a wrapper | `scene-sync.ts`, `selection-outline.ts`, `picking.ts` (~~`void-mesh.ts`, `overflow-mark.ts`~~: no change under α — census U28, U29) | D2, D4; ADR 0129 D4–D7 + Amendment (a); `DEVELOPMENT-SPEC.md` §6.1, §6.2; `corner-direction.ts`; the 7I QA findings (archived plan, *7I close-out*) |
| **S3 cameras and lights** | (1) `wallC` preset (D13); (2) `overview` for three runs; (3) the light rig per ADR 0132 after captures (D14); (4) exports | `stage.ts`, `index.ts` | D13, D14; G9, G10; §6.4; §11 row 21; backlog 16; 7J R5 |

- **Reading, QA:** *The 3D contract for a U*; D2, D4, D11–D14; ADR 0129 + Amendment; skill
  `lemnaria-3d-reference`; `browser-and-visual-qa.md`; the slice diff.
- **Reading, logic reviewer:** D2, D4, D12–D14; ADR 0025, 0121, 0129, 0132; §6.1, §6.2, §11 rows 2,
  19, 21, 22; the wave diff.
- **Reading, clean-code reviewer:** the slice table; `engineering-conventions.md`; the wave diff.
- **Reading, visual reviewer:** *The 3D contract for a U*; D12–D14; skill `lemnaria-3d-reference`;
  `browser-and-visual-qa.md`; the 7H and 7I close-outs' *not a bug* lists; the capture set.

**Acceptance criteria.**

1. **Anchors, with the real probe** over a generated U sample (U3's, or U2's shells with bodies
   inserted if U3 has not landed): every wall-C body's back face on wall C's plane at 0.000; the right
   X-leg at −0.020 (ADR 0025 mirrored); no two bodies intersect; no two stone volumes interpenetrate
   at the A∩C corner; the right X-leg's plinth recess reads its own `LD` only. **[unit] + [parity]**
2. **Reflection parity is captured, not only asserted.** ~~In a left-hand and a right-hand U~~
   **(2026-09-29: a U has one hand; the two parities are a wall-C body, +1, and a right-corner piece,
   −1):** a wall-C door front paints non-zero pixels; the selection outline on a wall-C body **and on
   the right X-leg** paints red pixels comparable to its wall-B / left twin (7I's 0-pixel class); a
   wall-C void mesh is visible; **a wall-C body's hinge and handle sides are its own, not wall B's
   reflected (Q-U5).** **[visual]**
3. **Picking on wall C** and on a right-corner piece (~~both parities~~ 2026-09-29: the two parities of criterion 2): §11 row 2 (the base slot of a cleared column selects the base
   slot) and row 22 (delete, then click another cabinet, selects it). No `Mesh`, `Line` or `Points` in
   the scene has a negative scale component (a test walks the graph). **[unit] + [e2e-able]**
4. **Cameras.** `cameraPresetsForRoom(U)` ids are `[overview, wallA, wallB, wallC]`; L and straight
   are unchanged; `wallC` equals `wallB` reflected in `x = W/2` with C for B; at 390 × 844 the top
   row of every wall projects inside the viewport from all four presets for the minimum, a middle and
   the maximum U (§11 row 21). **[unit] + [visual]**
5. **Lights**: a captured comparison of a wall-C front against its wall-B twin in a symmetric U,
   judged by the visual reviewer, and ADR 0132 records the choice D14 left open. **[visual]**
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
| **S1 Step 1** | (1) Delete the 1D U throw; (2) `roomHrefFromDesignRoom` and `parsedRoomLengthsOf` for a U (wall C; ~~direction per Q-U4~~ **no direction: the toggle is hidden for a U and a `direction` on a U URL is ignored, the preview unmirrored — Q-U4 (b), 2026-09-29**); (3) 1F's summary from `wallsOf`; (4) `requiredFieldsFor` and `DRAWABLE_WALLS` from `wallsOf` (backlog 76); (5) facing labels never overlap (backlog 72) | `room/room-url-state.ts`, `room/generation-steps.tsx`, `room/plan-preview-model.ts` | G11, G12; D7, D16; Q-U4's record; ADR 0116 + A, 0126, 0127, 0104 B; backlog 72, 76 |
| **S2 the editor** | (1) `crossesOnScreen` for C, by projection (D15); (2) the width-step note follows it; (3) camera chip leaf `configure.cameraPresets.wallC`, ro/ru, lock and golden manifest; (4) the capture route accepts `wallC` | `i18n/content.ts`, `panel/panel-model.ts`, `messages/ro.json`, `messages/ru.json` (+ generated `ro.d.json.ts`), `app/internal/scene-shot/shot-request.ts` | D13, D15; ADR 0129 Amendment (b); ADR 0095, 0113; `qa-7i-screen-side.adversarial.test.ts` |

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
7. **The phone is unmoved** for L and straight: 7L S6's byte-identical mobile control, re-run.
   **[visual]**
8. **Must not:** a component under `apps/web/src/room` compares a shape to `"U"` outside the named
   sites (the ADR 0116 A1 form: *the screen asks the domain*); `isShapeBuildable("U", APPROVED)` true.
   **[review]**

---

### Wave U6 — the switch

**Goal.** U's owner-approved bounds enter `APPROVED_ROOM_POLICY`, the U card continues, and every
"U is refused" assertion is restated or retired on the record.

| Slice | Must-fix items (≤ 5) | Production files | Reading |
| --- | --- | --- | --- |
| **S0 census** (no production) | In a throwaway worktree at the wave base, apply S1's policy line alone; run domain and web unit suites; list every red and every e2e assertion naming a U refusal; classify each *restate in S1* or *defect — back to its wave*. Table appended here, **written live** (7J's F2 lesson) | none | 7J's S0 census and its two *removed, no replacement* rows (archived plan `:4165-4183`); `agent-coordination.md` (worktree bases) |
| **S1 the switch** | (1) `U` bounds in `APPROVED_ROOM_POLICY` + pins + the approved ⊆ engine guard; (2) every wall maximum equal across shapes (Amendment G's test extended); (3) S0's restatements, each citing its row; (4) the seven `as BuildableShapes` casts deleted (G14) | `room/approved-room-policy.ts` | Q-U1, Q-U2 records (ADR 0108 H); ADR 0108 B1, G; ADR 0116 A2; S0's table |

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
3. **The census closes**: every S0 red is either restated (citing its row) or a defect sent back; a
   row with no replacement is justified in the table, not left silent. **[review]**
4. **Casts**: `git grep "as BuildableShapes"` returns nothing under `packages/` or `apps/`. **[review]**
5. **The card continues** with no component edit: *În formă de U* → *Continuă* → 1B. **[dom]**

---

### Wave U7 — the mobile gate, the desktop line, captures (the phase gate)

**Goal.** Prove the whole U path on a phone first (the gate), then on desktop, with captures.

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
3. **Captures**: {Q-U1 minimum, a middle U, the maximum} × {left, right} × {`overview`, `wallA`,
   `wallB`, `wallC`} × {mobile, desktop}. Checklist per frame: wall C's plane present; fronts face the
   room; no floating corner piece; the right corner reads as the left's mirror; nothing past a wall's
   end; the top row visible. **[visual]**
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
  outline on the right X-leg; a mesh-only assertion is not accepted.
- **R4 — Wall C is unlit by the key light** (G10, [inf]). U4-A5 decides it on pixels.
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
