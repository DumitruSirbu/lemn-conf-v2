# ADR 0110 — Generation inserts through the command path, starting from a shell of empty space, and the corner is structural data

Status: Accepted (**Amendment A, 2026-09-11** — the owner's answers to Q2 and Q3: the kitchen reads fridge → sink → preparation → hob-with-oven, its minimum is a sink and a hob, and at most 599 mm of any run is left empty; also corrects a false claim about ADR 0015 in the M7 plan; **Amendment B, 2026-09-11** — the shell is authored for its room: corner columns derived, free runs tiled with neutral depth sources, wall B planned against the deepest declared depth; **Amendment C, 2026-09-11** — the owner ruled F2 (upper cabinets and a hood), F3 (fridge first, then preparation) and F7 (keep the 100 mm wall-B reserve, an exception to the 599 mm rule); **Amendment D, 2026-09-11** — how a composed kitchen reaches its widths: insert, then `setWidth`, packed against the corner; Amendment B gains **B3a, 2026-09-11** — wall A's floor run stops short by the run-end panel's footprint; **Amendment D, revised 2026-09-11 (7D1 logic review R1.1)** — composition plans each row's widths first and the shell is tiled at exactly those boundaries; insert-then-`setWidth` is withdrawn except at a wall's free end; **Clarification, 2026-09-12** — core selection lets storage yield before a core role, then Amendment A4 refills every final remainder of at least 600 mm; **Correction, 2026-09-13** — odd physical spans plan to their whole-millimetre reachable end, correcting the 1699 witness's planned remainder from 99 to 98 mm without changing the 200 mm usable-remainder rule; **Amendment E, 2026-09-14, drafted for wave 7D3 and pending the coordinator's review, E1–E12** — the owner's tall-unit and oven rules: symmetry is not a rule of composition; the full-height **block of up to three columns** stands at the free end of wall A and nowhere else, excluding the fridge, and is **one `tall-oven-tower` innermost plus up to two `tall-pantry` outboard** — at most one fridge column, at most one oven column, any number of door columns; the planner takes the largest block that fits, and the threshold follows the block size (**3300 / 3900 / 4500 mm** of wall A, measured); the hob's base follows the oven tower so a kitchen has exactly one oven and never zero; the outermost `'fit'` body absorbs the free-end remainder, which E12's order makes the block's own last column; no upper stands above a full-height body; **no oven ever stands beside the fridge — adjacency is barred, not proximity, and *"minimum have another cabinets between them"* satisfies it; a thermal constraint as well as a workflow one**, already satisfied by Amendment A1's reading order and asserted rather than gated; the generated fridge stays `fridge-free` and is not moved, A1's cooking order winning where the two disagree; **the top row stays excluded, now owner-confirmed**, its eventual replacement being taller uppers rather than a composed row; and new full-height body types wait for beta (backlog 66). E9's pantry deferral is **superseded within the day** by E12 and kept for its sequence)
Date: 2026-09-11
Type: Decision
Milestone: M7 — waves 7D1 and 7D2 (architect's plan, `docs/milestones/M7-room-and-presets.md`)

## Context

When no preset fits, frames 1F/D1F compose a kitchen instead of dead-ending: items in priority
order, *"ce nu încape este scos și marcat, nu înghesuit"*. The M7 plan requires that **every
generated design is valid under the M2/M3 engine and that generation produces placements through the
same guards as manual insertion — no privileged path**. The owner's statement of intent (2026-09-03)
adds that the result must be *a functional kitchen* and must fit its walls.

What *"the same guards as manual insertion"* costs, measured at `995ad03`:

- **`insertBody` needs an opening, and a bare room has none.** Openings are derived from columns
  (`recomputeVoids`), and columns from placements plus the document's `emptyColumns` and
  `columnExtents` (ADR 0044, 0053). A design with no placements and no stored columns publishes no
  void, so there is nothing to insert into.
- **`insertBody` needs a `BodyProbe`** (`commands/insert-body.ts:59-93`), the port that measures a
  body built by the Three.js adapter (ADR 0011 Gap B; `body-probe.ts:37-41`). The web store only
  receives one once the scene has mounted (`attachBodyProbe`), and Step 1 has no scene.
- **The L's corner bodies cannot be inserted.** They are seeded and structural, not insertable
  (ADR 0021; `toInsertableBody`, `catalog.ts:1311-1316`), so no insert can place a corner.
- **Published openings already stop at the wall.** [ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)
  Amendment B: *"no opening past the wall is ever derived, drawn or offered"* — an insert cannot
  place a body past the end of its wall.

## Decision

**1. Generation starts from a shell design.** The shell holds the room, the cabinet depth, the L's
structural corner assembly — taken from the reference recipe (ADR 0109 decision 2), only the pieces
whose top fits under the room's height — and the frozen map of the empty space left on each wall,
split at [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md)'s 800 mm ceiling and capped at
the room height and at `LEVELS`' top. **The shell must itself pass `validateDesignForCatalog` with
zero findings** — including `RECORDED_SPAN_OVERLAPS_CORNER_BODY`, which is the validator's own check
that recorded space does not overlap the corner.

The recommended way to build it, left to the wave to confirm: the reference design with every
non-structural body removed **through `removePlacement`**, which records the space each removal
frees (ADR 0044), then fitted to the entered room's walls — so the shell is produced by existing
commands rather than by new frozen-map arithmetic.

**2. Every non-structural body is placed by `insertBody` and by nothing else.** The generator picks an
opening, a build id and a width; the command does the rest — the same published openings, the same
fit, band and width guards, the same split ([ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md)),
the same dependent re-plan ([ADR 0103](0103-a-standing-body-is-re-planned-when-something-is-inserted-beneath-it-and-a-delete-leaves-it-alone.md))
and the same measured seat. **The generator never writes a placement.** A refusal is the outcome
*"nu încape"* for that item: it is logged with its refusal code, nothing is retried at another size
unless the priority data declares a width range, and generation moves to the next item.

**3. The priorities are policy data.** The interim list is frame 1F's own, in its order — sink 600,
hob and oven 600, storage to fill the rest of the run, fridge — flagged `interim-unapproved`, with no
upper cabinets or hood until the owner rules (M7 plan, Q3). The owner's answer changes data, and
changes code only if it adds a rule the data cannot express (an adjacency, say).

**4. The output is the design and a step log.** The log lists every priority item once, in priority
order, as placed (with its build id) or not placed (with its refusal code). It is what 1F renders,
and it carries codes and ids, never sentences (ADR 0095 decision 3).

**5. A generated kitchen is held to the preset rule.** Zero validation findings of either severity
(ADR 0109 decision 3), no overflowing placement, and deterministic: the same room, priorities,
catalogue and `occurredAt` give the same design and log, byte for byte.

**6. It runs in the browser at Step 1 with a borrowed probe.** The domain function takes a
`BodyProbeFactory`; the web layer lends it a transient kit exactly as `kitchen-stage.tsx`'s factory
already does for a depth the scene is not standing at, released on every path
([ADR 0076](0076-a-probe-lease-is-a-scoped-borrow-and-the-store-publishes-no-probe.md)). Nothing
runs on the server, which has no kit.

## Alternatives considered

- **Compose placements directly and validate the document afterwards.** Rejected: it is the
  privileged path the plan forbids, and every inserted body's seat would be unmeasured — the defect
  ADR 0011 Gap B and §6.2 record twice.
- **Insert the corner through `insertBody`.** Impossible without making structural bodies insertable,
  which reverses ADR 0021.
- **Leave the corner empty (a blind corner).** A product change nobody has ruled. If the owner wants
  it, it is a change to the shell's data, not to the generator.
- **Generate on the server.** No kit exists there, and it would need `POST /api/designs` to accept a
  body, which widens the unauthenticated mint that SEC-001 already names (ADR 0019, 2026-08-31
  correction; ADR 0111).

## Consequences

- Step 1 builds a Three.js kit when it generates. Its cost on a phone is measured in wave 7F4, and
  its release is proven by a lease ledger, not assumed.
- A generated design is an ordinary design: the editor, price and share link treat it exactly as they
  treat any other, and M6-AUD-014's owner ruling (2026-09-09, `docs/STATUS.md`) — a design with no
  cabinets is valid and simply has no price — covers the degenerate case.
- A straight (linear) kitchen would need a different shell and nothing else, which is why the owner
  is asked about it (Q5) rather than told it is unbuildable.

## Decision-record sweep

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0011](0011-m3-insert-contract-gaps.md) Gap B, Gap D | An inserted body carries its measured seat; columns are frozen extents written by commands. | **Followed**: the generator inserts, so seats are measured and the map is written by the commands. |
| [0021](0021-corner-returns-are-structural-in-data.md) | Corners are structural: no replace, no delete, no insert. | **Followed**: the corner is shell data (decision 1). |
| [0043](0043-an-empty-space-of-any-width-is-a-legal-state.md), [0044](0044-an-empty-space-is-recorded-in-the-design-document.md), [0053](0053-the-design-document-records-the-whole-frozen-map.md) | Empty space of any width is legal and is recorded in the document. | **The shell is made of it**; leftover space after generation stays recorded and unreported. |
| [0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md), [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | An insert splits its column; no empty column exceeds 800 mm. | **Inherited through `insertBody`**, and the shell obeys the ceiling. |
| [0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) Amendment B | No opening past the wall is derived, drawn or offered. | **Why generation cannot overflow a wall by construction.** |
| [0076](0076-a-probe-lease-is-a-scoped-borrow-and-the-store-publishes-no-probe.md) | A probe is borrowed through a lease and released at the site that allocated it. | **Followed** (decision 6). |
| [0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md), [0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md), [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 6 | Never propose an overflow; leftover wall is normal. | **Decision 5.** |
| [0103](0103-a-standing-body-is-re-planned-when-something-is-inserted-beneath-it-and-a-delete-leaves-it-alone.md) | An insert re-plans bodies standing in the column it touched. | **Inherited**, not re-implemented. |
| [0019](0019-security-baseline-writes-throttling-retention.md) 2026-08-31 correction | `POST /api/designs` takes no request data; SEC-001 stays deferred and gated. | **Unchanged**: generation is client-side and needs no body on `POST`. |

## Amendment A — 2026-09-11: the owner's answers to Q2 and Q3

**The ruling on Q3, verbatim** (owner, 2026-09-11):

> *"3. fridge position is not mandatory on a specific wall but form left to right should be fridge,
> sink, and hub, this is a regular order on cooking, take something from fridge, wash, then process
> on worktop, thats why ideal between sink and hub to be a cabinet to have that preparation surface
> and after you cook on hub or oven unde the hub... but a kitchen minimum should have sink and hub"*

Q2's ruling is quoted in full at [ADR 0109](0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md)
Amendment A.

**A1. The layout order replaces decision 3's interim list.** Along the run, left to right as seen from
inside the room: **fridge → sink → preparation cabinet → hob with the oven under it**, then storage.
On a left-corner L the run reads from wall B's free end toward the corner and then along wall A from
the corner outward — which is the reference kitchen's own order (fridge on wall B; sink, then hob, on
wall A). The fridge is not tied to a wall: it stands wherever the order puts it. The interim data
is: fridge `fridge-free` 700 (as in the reference), sink `base-sink` 600, preparation `base-cabinet`
600, hob `base-hob-oven` 600, storage `base-cabinet` 600. All of it is data.

**A2. The minimum kitchen is a sink and a hob.** If generation cannot place both, it returns
*minimum not met* and **no design**; Step 1 goes back to the dimensions sub-state with a room-level
reason that carries no number. This is the second Step 1 refusal [ADR 0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
Amendment B anticipated: the owner-approved bounds admit rooms (a 900 × 1000 L, for one) that cannot
hold a kitchen, and the bounds stand.

**A3. What is dropped first on a short wall** — proposed, put to the owner as follow-up F3: storage
first, then the fridge (as frame 1F's own example drops it), then the preparation cabinet; the sink
and the hob never.

**A4. The leftover rule, shared with presets.** After the items are placed, every bare run end of
600 mm or more receives 600 mm storage bases until less than 600 mm remains; the remainder, at most
599 mm, stays as the recorded empty column `insertBody`'s split already leaves (ADR 0046). The 599 mm
cap binds **what the product proposes** — a generated kitchen or an adapted preset — and not a
customer's own edits, which may leave any gap (ADR 0043, 0067).

**A5. Upper cabinets and the hood are not yet ruled** (Q3(b) was not answered). The interim stays
base row only; the proposal — upper cabinets above the base run at the same widths, a hood over the
hob — is put to the owner as follow-up F2. It is a data change either way.

**A6. A correction the owner's answer exposed.** The M7 plan's owner question Q2(d) said *"stretches
under 300 mm stay invisible, as today"*, and its wave-7C criterion 3 said a remainder under 300 mm
*"publishes no opening (ADR 0015)"*. **Both were false.** [ADR 0015](0015-min-span-is-exclusive.md)'s
`MIN_SPAN_M` is a **vertical** threshold — a free span shorter than 300 mm in *height* is no opening
— and says nothing about width; since [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md)
an empty column of any width is legal and publishes its openings (backlog 25 records a 100 mm one
rendered at the frame edge). So the owner's *"empty column exact like after you remove the cabinets"*
is what the engine already does, and the space accepts what fits it: `base-cabinet` builds 200–800,
one door up to 600 (ADR 0030, 0033), `base-bottle-cargo` 200 and 300 (ADR 0026). Both false sentences
are struck in the milestone.

## Amendment B — 2026-09-11: how the shell is built, ruled on the 7D1 implementer's findings

The 7D1 implementer read the code before writing and reported seven premises of the punch list that
do not hold (milestone, *Adjudication 7D1-P*). Three of them change this record's decision 1.

**B1. Construction (a) — "the reference design with every non-structural body removed through
`removePlacement`" — is withdrawn.** Measured: `removePlacement` records nothing
(`commands/remove-placement.ts:74-93` filters placements; `withPlacements`, `command-result.ts:227`);
freed space survives only through the web store's frozen-map fall-through
(`apps/web/src/store/apply-command-result.ts:107-126`), so (a) would restate that order a second time
in the domain. It would also carry the reference kitchen's own column boundaries, full-height stacks
and **depth sources** into every generated kitchen — wall B's far space would record
`fridge-free-700` as the body its depth came from, in a room where no fridge ever stood — and it
would need a clip-and-re-key for shorter walls and borrowed sources for longer ones.

**B2. The shell is authored for its room, in two parts.**
- **The corner's own columns** are `deriveRecordedColumns` over the kept structural placements alone
  (the pieces whose top fits under the ceiling, decision 1) — derived, never tiled.
- **Every free run is tiled** with `splitEmptySpanAtCap` from the run's start to its planned end, each
  piece keyed from its own centre. A run's start is the far edge of the reference kitchen's structural
  pieces **on that wall in that band, over the full assembly** — a piece the ceiling excluded still
  reserves its footprint. That gives 900 for every band of wall B and for wall A's base band, and 0 for
  wall A's wall and top bands, where nothing structural stands above the corner base. Floor runs are
  full-height columns (`y0` 0, top `min(room height, LEVELS' top)`); wall A's run above the corner base
  is a wall-only column from `LEVELS[1]`'s start.
- **A tile's depth comes from a neutral declared source, never a borrowed one**: `base-cabinet` for a
  floor tile and `wall-cabinet` for a wall-only tile — the bodies composition itself fills them with —
  with the depth read through the existing reader (`occupiedDepthOfEntryM`) at the shell's cabinet
  depth. [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) requires a recorded
  extent to name the body its depth came from, and [ADR 0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
  requires that source to explain the depth. A fridge that never stood there explains nothing, and its
  pinned 742 mm would not follow the setting, as [ADR 0080](0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md)
  requires of an empty space. Corner columns keep their own declared sources and seats
  ([ADR 0077](0077-a-joint-seated-body-declares-its-seat-and-is-never-measured-for-one.md)). No tile has
  a full-height member under it, so [ADR 0101](0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md)'s
  lift does not arise.
- The document is canonicalised the way the depth command writes its own: `deriveRecordedColumns` →
  `projectFrozenMap` → `withFrozenMap`.

**B3. Wall B is planned against the deepest declared depth.** A wall-B tile slides with its source's
chain when the customer changes the depth ([ADR 0089](0089-the-along-wall-chain-is-kept-and-its-reader-is-the-depth-command.md);
`alongWallShiftMm`). Tiled to the wall's end, it — and anything composed into it — would pass the wall
at 700 and be marked. So each wall-B run's planned end is the wall's length **minus the chain shift to
the deepest declared depth**, read through `alongWallShiftMm` (100 mm on the base chain today).
Everything a composed kitchen or an adapted preset places there then still fits after any depth
change. It is [ADR 0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md)
Amendment A's principle and the precedent [ADR 0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md)
decision 1 set for the demo, whose room the owner held to clear its run at both depths; it amends
ADR 0109 decision 5 (that record's Amendment C). At 600 the reserve counts as bare wall under the
599 mm leftover rule, and it agrees with ADR 0108 Amendment C, whose wall-B free run is already
`B − 1000`.

> **B3a is superseded the same day by the owner's ruling on the panel itself** (ADR 0045 Amendment A,
> *"No panel when run hits wall"*): with the veto, a run flush to the wall simply has no panel, so the
> reserve below is removed in wave 7D1b, together with the veto that makes removing it safe. Struck,
> not deleted.

~~**B3a. Wall A's floor run ends short of the wall by the run-end panel's footprint — added
2026-09-11, 7D1 QA finding Q1.1 (a contract gap in B2, not an implementation defect).** B2 planned wall~~
~~A's floor run to the wall's own end, and ADR 0083 decision 5 counts the finished end panel as part of~~
~~wall A's occupied width: a base cabinet filling the last opening built flush to the wall, and the~~
~~panel then stood 19 mm past it (measured by QA: outer face at 3579 on a 3560 wall; the same across the~~
~~range). **Wall A's floor run's planned end is the wall's length less the panel's footprint** —~~
~~`RUN_END_PANEL_THICKNESS_M + RUN_END_PANEL_GAP_M` from `run-end-panel.ts`, 19 mm today, read from those~~
~~constants and never written as a number. Floor tiles are full-height, so the last 19 mm of wall A stay~~
~~unrecorded at every height. Wall B carries no finished end (ADR 0083 decision 5) and keeps B3's reserve~~
~~only. **Why the proposal must leave the room rather than the panel give way:** the owner's point 3 —~~
~~everything proposed must fit its walls — covers the finished end, which is a declared product element~~
~~(ADR 0045), and hiding it at the wall's end would change what is proposed in order to make it fit.~~
~~Whether a *customer's own* run reaching the wall should drop its panel is a separate product question~~
~~and is left open (backlog 64).~~

**B4. [ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)
Amendment B is untouched.** Its rule — a pass that derives its answer from the room may bound what is
published and may not rewrite what is recorded — protects a customer's recorded space from a
reversible setting. The shell holds no customer space yet and stands in a fixed room (ADR 0083
decision 2), which is the *"always past the end"* input 0090 B itself distinguishes. Under B2 nothing
is clipped at all. `clipEmptyColumnsAtWallEnd` is a published-face pass that keeps its key, and
**composition never applies it to a recorded face**; the implementer's re-key proposal is therefore
unnecessary and is not adopted.

**B5. The height cap moves to wave 7C.** Tiles are built at `min(room height, LEVELS' top)`, and corner
columns come from pieces that fit, so the shell needs no cap. The one shared helper is written where
it is first needed: 7C, capping a saved preset's recorded extents below a low ceiling.

## Amendment C — 2026-09-11: the owner's answers to F2, F3 and F7

**F2**, option chosen verbatim: **"Yes, uppers + hood"**. Amendment A5's interim (base row only) is
replaced: above every body of the base run the composed kitchen places a `wall-cabinet` of the same
width, and over the hob a `hood` of the hob's width instead — all through `insertBody` into the
wall-band openings (decision 2), never above the fridge (a column) and never in the top row. An upper
that cannot be placed is logged as not placed and removes nothing below it. The wall band (1500–2200 mm)
fits under every approved ceiling.

**F3**, option chosen verbatim: **"Fridge first, then prep"**. Amendment A3's proposal is ruled: on a
short wall the storage fill goes first, then the fridge, then the preparation cabinet; the sink and the
hob always stay.

**F7**, option chosen verbatim: **"Keep the 100 mm reserve"** — asked by the coordinator after the 7D1-P
adjudication. **Amendment B3 is owner-confirmed**: wall B's runs end at the wall's length less the chain
shift to the deepest declared depth, so a later change to 700 mm marks nothing. **It is a stated
exception to Amendment A4's 599 mm rule:** on wall B, at the shell's depth, the bare end may reach
599 mm plus that shift (699 today); after the change to the deepest depth it is at most 599 again.
Walls other than B are held to 599 without exception.

## Amendment D — 2026-09-11: how a composed kitchen reaches its widths — insert, then `setWidth`, packed against the corner

**Found by the 7D1 implementer.** Amendment A1's *"sink `base-sink` 600"* cannot come out of
`insertBody` alone: `base-sink` is `widthFlex: 'fit'`, so it takes its opening's width, and the shell's
tiling (Amendment B2, 800 mm first from the corner) makes the first opening on wall A — and on wall B
once its free run reaches 1700 — 800 wide. The same holds for the preparation and storage cabinets
(`base-cabinet`, also `'fit'`). The shell is wave 7D1's and frozen in its QA; the rule belongs to 7D2.

**D1. Option taken: insert, then `setWidth` to the target, both through the command path — not a
different tiling.** A different tiling would bake one kitchen's widths into the shell every other
consumer (the store, presets, the customer's own inserts) shares; the command path already does the
job, and it is what a customer would do by hand — insert into the space, then step the width down
(ADR 0035's bounded stepper; ADR 0031's funding). No privileged path, and the replay criterion covers
both commands.

**D2. The mechanics are deterministic, and they pack everything against the corner.** Measured in the
code and recorded in backlog 26: `insertBody` seats a body at its column's **left** edge — the lower
along-wall coordinate, the corner side — so an insert's remainder always lands on the far side
(`seatAlongColumn`, `insert-fit.ts:740`; ADR 0046's owner ruling). A shrink vacates to the **right**
first (`EMPTY_SPACE_ORDER` and `VACATED_SPACE_SIDE`, `plan-width-funding.ts:42, :148`), handing the
freed width to the neighbouring empty column on the far side, which ADR 0052's 800 mm ceiling then
splits. So: **on each wall the composed bodies are packed from the corner outward, and the leftover
gathers at the wall's free end** — exactly the owner's *"let the edges empty"*. On wall A that is the
reading order itself; on wall B, whose reading order runs from the free end *toward* the corner, the
wall-B items are inserted in **reverse** reading order, so the order read along the room is still
fridge → sink → preparation → hob. **Bases first, then their widths, then the uppers:** an upper
inserted over a column that already holds its base is centred in that column (`seatAlongColumn`'s
first branch) and, being `'fit'`, takes the column's width — so uppers and the hood match their bases
with no `setWidth` of their own.

**D3. The widths, and why each** (data, not code):

| Item | Entry | Width | Reason |
| --- | --- | --- | --- |
| Sink | `base-sink` | **600** | Frame 1F's *"Spălător · 600"*; the owner's *"600 ... the default width of majority of cabinets"* (Q2). |
| Preparation | `base-cabinet` | **600** | The same default; the owner asks for a preparation *surface*, not a width, and 600 is the one the owner named as the norm. |
| Hob with oven under | `base-hob-oven` | **600** | The catalogue builds it at 600 only; frame 1F's *"Plită și cuptor · 600"*; the owner's *"oven unde the hub"*. |
| Fridge | `fridge-free` | **700** | The reference kitchen's fridge. **Not** `tall-fridge-housing` (600): ADR 0107 decision 7 makes the housing joinery that keeps its price, so choosing it would add a priced tall cabinet to every composed kitchen the owner never asked for; `fridge-free` is drawn and not sold (ADR 0107 decision 2), so the estimate stays honest. **Owner-confirmed 2026-09-11:** *"lets have default freestanding (is more visible that exists)"* — a freestanding fridge shows the customer plainly that a fridge is there. |
| Storage fill | `base-cabinet` | **600** | ADR 0109 A3 / the leftover rule's own figure. |
| Uppers | `wall-cabinet` | the column's width | F2: *"same widths"* — follows from D2. |
| Hood | `hood` | the hob column's width (600) | F2; the hood is `'fit'`, 600–800. |

**D4. What the wave must verify, not assume.** That the far side is the free-end side on **both**
walls — `"right"` in the funding code and the left-edge seating are along-wall conventions, and wall
B's reading direction is the reverse of its along-wall direction. If on either wall a remainder or a
freed width lands between two composed bodies, the wave **stops and reports**; it does not compensate
with extra commands, because an interior gap produced by a rule nobody decided is a finding, not a
layout.

### Amendment D, revised — 2026-09-11: plan the row, then tile the shell at its boundaries (7D1 logic review R1.1)

**D2's central claim is false, and a reviewer showed it in the reference room.** Replaying composition
against the domain `dist/` with the store's own funnel between commands, on wall A from the corner:
the sink goes into `[900, 1700]` and is stepped to 600; the freed 200 mm joins the next tile and ADR
0052's ceiling splits it back to `[1500, 2300]` + `[2300, 2500]`; the preparation cabinet goes into
`[1500, 2300]` and is stepped to 600, leaving `[2100, 2500]`, 400 mm; and the hob (a fixed 600) does not
fit a 400 mm opening, so it lands at `[2500, 3100]`. **A 400 mm empty column stands between the
preparation cabinet and the hob** — against the owner's order (sink, preparation, hob, adjacent) and
against *"let the edges empty"*. **The cause is structural, not an ordering accident:** 400 + 800
exceeds the merge ceiling (ADR 0046, ADR 0052), so the seam the 800-first tiling left at 2500 never
re-joins, and every 800-capped tiling has such seams wherever a composed width does not land on them.

**Ruling: composition plans each wall's row as widths first, and the shell is tiled at exactly those
boundaries; every body is then placed by `insertBody` into its own column.**

1. **The plan is arithmetic over declared widths only**: the owner's order (Amendment A1), the drop
   order (Amendment C, F3), the minimum kitchen, the D3 widths, the leftover rule and wall B's reserve
   (B3, F7). It decides which items stand on which wall and where; it writes no placement.
2. **The shell is tiled at the plan's boundaries**: one empty column per planned body, at exactly its
   width, then the leftover split at the ceiling. Every composed width is between 600 and 800, so no two
   planned columns can merge (any adjacent pair is at least 1200 mm, over the 800 ceiling) and none
   exceeds the ceiling. The 7D1 builder gains an optional plan argument; without one it tiles 800-first
   as it does today.
3. **Each body is inserted into its own column.** A `'fit'` body takes exactly its planned width; a fixed
   body fits exactly. No remainder is produced inside the row, so no interior empty column can arise.
4. **`setWidth` survives in one place only: the free end.** ADR 0046's merge joins the last planned
   column with a leftover of 200 mm or less (600 + 200 ≤ 800). A `'fit'` body inserted there comes out
   wider than planned and is stepped back to its width; the freed width is vacated to the right
   (`VACATED_SPACE_SIDE`, `plan-width-funding.ts:148`), which at a wall's free end is the free end. A
   fixed body there leaves its remainder on the same side by its seating. Either way the leftover ends
   where the owner wants it.
5. **D1's reason for rejecting a different tiling is withdrawn.** It read *"a different tiling would
   bake one kitchen's widths into the shell every other consumer shares"* — but the shell is
   composition's private intermediate: presets are instantiated from their own documents, and the store
   only ever receives the composed design. ~~*"not a different tiling"*~~ — a planned tiling is the
   ruling.

**Options refused, and why.** *Re-splitting the whole contiguous empty run on every shrink* (the
reviewer's option a) or *funding from the far neighbour*: both change `setWidth` for every customer —
ADR 0031's funding and ADR 0046/0052's split and merge — and move the keys of empty columns nobody
touched (ADR 0053), to serve composition. *Allowing gaps and logging them* (option b): against the
owner's order and the 599 mm rule. *A different insertion order*: cannot remove seams the tiling fixed
in advance. *Narrow-first splitting through commands*: the only command that splits an empty column is
an insert, and a delete's freed space is recorded only by the store's frozen-map fall-through, which the
domain cannot call (7D1-P, P1).

**What stands:** every body by `insertBody`, the shell's structural corner and depth sources (B2), wall
B's reserve (B3), no clip on a recorded face (B4), D3's widths and the owner's order.

## Clarification — 2026-09-12: storage yields during core selection and returns on final remainders

**Raised by wave 7D2 logic review R1.1.** Amendment C says the drop order is storage, fridge,
preparation. Amendment A4 separately requires storage to fill every remainder of at least 600 mm.
Read as one irreversible list, those sentences would suppress storage after any core role was
dropped; read as independent stages, they produce the shipped planner. This clarification makes the
two-stage rule explicit and changes no owner decision.

1. **Select the surviving core first.** Candidate storage yields before the fridge, and the fridge
   yields before preparation. Sink and hob never yield. This stage chooses the core roles and the
   wall cut.
2. **Then recompute storage from the final per-wall remainders.** After the core and cut are fixed,
   Amendment A4 fills each final remainder with 600 mm storage while at least 600 mm remains. There
   is no persistent “storage was dropped” flag.
3. **The log's `dropped` list names omitted core roles only.** Storage fill is derived from the final
   remainder, so a candidate storage unit displaced while selecting the core is not a permanent
   omission.

Boundary witness: at wall A **2700** and wall B **1699**, the fridge yields; sink, preparation and
hob occupy wall A; one 600 mm storage cabinet occupies wall B; ~~the planned wall-B remainder is
99 mm (199 mm physical including the 100 mm depth reserve)~~ **corrected 2026-09-13: the planned
remainder is 98 mm, plus 1 unrecordable millimetre and the 100 mm depth reserve = 199 mm physical**.
Suppressing the refill would leave 799 mm of physical bare wall and violate F7's 699 mm
shallow-depth cap. The 1599/1600 and 1699/1700 wall-B pairs hold respectively the storage-fit and
core-selection transitions.

**Options refused.** A permanent no-storage flag contradicts Amendment A4 and the leftover rule.
Dropping a core role before candidate storage contradicts F3. Treating storage as a core role would
put it in `dropped` and make the result depend on an optional candidate count rather than the final
geometry.

## Correction — 2026-09-13: odd spans use the whole-millimetre reachable end

**Found by wave 7A2's implementation property as I1.1 and adjudicated as a pre-existing 7D2 defect,
not a new owner decision.** A 3501 × 1700 × 2200 room passed the coupled validator but generation
threw because shell planning compared a 201 mm physical remainder where the usable grid remainder
was 200 mm. On an odd physical span, placements and recorded columns use whole-millimetre centres;
the usable endpoint is therefore the greatest whole-millimetre end the grid can reach, not the raw
physical end.

`wholeMillimetreReachableEndMm` now supplies that endpoint to both shell tiling and
`lShellFloorRuns`. Exact wall-A and mirrored wall-B regressions hold the same rule: a usable
remainder of **200 mm** may merge with a 600 mm free-end body under the 800 mm column cap; 201 mm is
not a new allowance and no `<= 201` exception exists.

The clarification's transition pairs remain **1599/1600** and **1699/1700**, and the physical cap
does not move. Their corrected arithmetic is: at B=1599 the usable/planned span is 598 mm rather
than the physical 599; at B=1699 it is 698 mm, so after one 600 mm storage body the planned
remainder is 98 mm, with 1 unrecordable millimetre and the 100 mm reserve making 199 mm physical.

## Amendment E — 2026-09-14: a tall unit stands at the free end of wall A, and the hob's oven follows it

**Status: drafted for wave 7D3 as its slice S0. Held 2026-09-14 on two questions the owner's
reference photographs raised; both are answered the same day, the hold is fully lifted, and the
tall-body supply question OQ-1 is answered too (E12) — `tall-pantry` is reinstated and a block of two
or three columns is composable from the catalogue as it stands. **No catalogue change is authorised
and wave 7D3 is dispatchable.** One question remains open, **OQ-2**, which no wave can currently
reach: whether a *base* cabinet is enough between a fridge and a *tall* oven tower.

**Two coordinator inferences in this amendment were put to the owner rather than built on. One came
back confirmed and one came back wrong** — E10.4's *"the block excludes the fridge"*, withdrawn and
struck in place. Both had been marked as inferences at the moment they were written, which is the only
reason either was asked about; **the practice is the point, not the score.**

**A correction this record carries on its face, because the reversal is instructive.** On 2026-09-14
the coordinator read the owner's *no oven beside the fridge* answer (E10) as also refusing the
**contiguous full-height block**, and this amendment briefly said so: E2 stood at one module, E3's
threshold stayed at 3300 mm, and a figure of 3900 / 4500 mm was retired as *"not a number of this
record"*. **The owner then said the opposite** — *"You're right. Pretty often, the tall cabinets are
near. So two, three columns of tall cabinets are near."* — and the coordinator corrected themselves.
**The block reading is the ruling**; E2's *extent*, E3's threshold and E6's absorb are all revised
below, and 3900 / 4500 mm are reinstated as **measured** figures. What held through both readings —
E2's **site**, E4, E5, E7, E10's two reasons — is marked where it stands, so a reader can tell what
survived the reversal from what was written after it. *The record shows the reversal rather than
hiding it: an amendment that quietly agreed with itself would give the next reader no way to see that
this question was hard.*

Both questions the photographs raised, and where each landed:

1. **The full-height block — ANSWERED, for the block** (E2 revised, E3 revised, E6 revised). A block
   of **two or three adjacent full-height columns at a run end is the normal case**, not the minority
   one. It sits with E10 because **the fridge stays where Amendment A1's reading order puts it**, at a
   run's start, so no generated block holds one — ~~because the block excludes the fridge~~, an
   inference the owner withdrew the same day (E10.4).
2. **Wall cabinets to the ceiling — ANSWERED, against composing the top row** (E11). Amendment C's
   exclusion is **owner-confirmed**, with a stated reason and a stated eventual form that is *not* a
   top row. **The empty strip above the uppers is a deliberate deferral, not a defect.**

Amendment A ruled the layout order and the minimum kitchen; Amendment C ruled the uppers, the drop
order and wall B's reserve. This amendment rules the **third row the composition never touched**: the
full-height column. Until now only two levels were ever composed — bases at `y0 = 0` and uppers at a
hardcoded 1500 mm — and **no tall unit was generated at all**.

### Field corroboration — ten photographs of built kitchens, read 2026-09-14

The owner sent ten photographs of **eight distinct kitchens their company has actually built**; the
coordinator read them. **Photographs are evidence, not a ruling** — nothing below decides anything,
and where a photograph and an owner ruling disagree the ruling governs. They are recorded because
**E2 was derived from code geometry alone**, and a derivation that turns out to match eight built
kitchens is worth more than the derivation by itself.

| Observed in the built kitchens | What it corroborates |
| --- | --- |
| Full-height columns sit at run **ends**, never mid-run. | **E2's siting**, independently of the spatial-order argument it was derived from. |
| **The corner is always continuous worktop**; no column ever turns it. | **E2's refusal of the corner end** — which this draft argued from the worktop's continuity and which the field now confirms is how these kitchens are actually built. |
| Sink and hob are always separated by worktop. | **Amendment A1's preparation cabinet between them**, unchanged and now observed. |
| Where a tall column carries microwave-over-oven the hob has **drawers** beneath it; where there is no such column the **oven sits under the hob**. | **E4, in both directions** — including the half the owner's sentence left unstated. The rule is not a preference; it is what these builders do. |

Amendment A ruled the layout order and the minimum kitchen; Amendment C ruled the uppers, the drop
order and wall B's reserve. This amendment rules the **third row the composition never touched**: the
full-height column. Until now only two levels were ever composed — bases at `y0 = 0` and uppers at a
hardcoded 1500 mm — and **no tall unit was generated at all**.

### The owner's words, 2026-09-14

> *"Let's start without any Symmetry. So the tall cabinets should be added also, but at the sides…
> not in the middle, but with the edges. So if you have, let's say, tall cabinet with oven and
> microwave, in this case maybe you don't need to use the hob with microwave because you'll have not
> the hob microwave but hob with oven. In this case you'll have two ovens and maybe don't need… let's
> focus on the minimum that can be added in the kitchen, because always it means that it will cost
> less. So if you will add the tall cabinet with oven and microwave, in this case you will choose hob
> with drawers. In case that you don't have this tall cabinet with oven and microwave, we add the hob
> with the oven, not with the drawers. If you'll have space, we insert the tall cabinets, especially
> it's useful when the kitchen have more than, I think, four or five meters — four, five thousand
> millimeters. Less, you'll not have space to make… to put these tall cabinets, only maybe to cover
> something. But in majority of the cases these tall cabinets are used at the edges."*

**Two further owner rulings the same day (QT-1 and QT-2)**, given through the coordinator and
**recorded from the coordinator's relay rather than verbatim** — the distinction matters, because no
agent may later quote them as the owner's own sentences:

- **QT-1 — the generated fridge stays `fridge-free`; `tall-fridge-housing` does not replace it.** The
  owner accepted all three reasons put to them, and **was offered the opposite reading explicitly —
  that they might have meant a built-in fridge — and did not take it.** So the free-standing fridge is
  settled rather than merely unexamined.
- **QT-2 — `tall-pantry` is not generated in this wave.** The owner was also offered *"later, with the
  long-run rework"* and chose the **plain deferral**, so the pantry is **open and unassigned**: it is
  not pre-assigned to the long-run wave, and a wave that generates one is overturning nothing but must
  first ask.

**Three rulings by the coordinator (QT-3, QT-4, QT-5)**, marked as such below, on questions the
architect raised while planning and which are engineering consequences of the owner's rules rather
than new product choices.

### E1 — symmetry is not a rule of composition, and never was

*"Let's start without any Symmetry."* Nothing under `src/generation/` has ever mentioned symmetry;
this is a **confirmation, not a removal**, and it is recorded so that a later wave does not introduce
one believing it was always intended. A generated kitchen is composed from a reading order and a
leftover rule, and from nothing that balances one end against the other.

### E2 — a generated tall unit stands at the free end of wall A, and nowhere else

*"at the sides… not in the middle, but with the edges."* **Which end that is was not a choice**: it
follows from the spatial order Amendment D revised already fixed.

- Wall B's order is `[storage…, reverse(reading prefix)]`, so **storage stands at wall B's corner end**
  and the reading prefix — the fridge, when wall B holds it — at its free end.
- Wall A's order is `[reading suffix…, storage…]`, so **storage stands at wall A's free end**.

So **wall A's free end is the only leftover end an L run has**, and the rule has exactly one eligible
site. The corner end is refused on its own merits as well: a run starts past the structural corner,
where the worktop turns and the two runs meet, and a 2200 mm column planted there walls the corner in
and interrupts the only continuous work surface the L has.

The picture this produces is the owner's: **a large generated L carries one full-height body at each
outer edge — the fridge at wall B's free end, the oven tower at wall A's — and none between them.**

**Confirmed 2026-09-14 by the ruling in E10, and reclassified by it.** E2 was derived from the code's
spatial order and was, at the time it was written, a finding about the engine that happened to match
what the owner asked for. E10 makes it **a consequence of Amendment A1**: the oven must not stand
beside the fridge, and the cooking order fridge → sink → preparation → hob/oven governs placement. The
two full-height groups at the two outer edges with the whole kitchen between them **are that order
laid out along the L** — E2 is not merely compatible with A1, it is A1's shape in an L-room.

**E2.2 — the extent is a block of up to three columns, revised 2026-09-14.** The **site above is
unchanged and is what held through the reversal**; what changes is how much of the run it takes.
Owner, verbatim: *"You're right. Pretty often, the tall cabinets are near. So two, three columns of
tall cabinets are near. Your instinct is right."*

- **The block is up to three adjacent full-height columns at wall A's free end**, outermost first,
  taking the outermost modules of that wall's leftover.
- **The block this wave composes holds no fridge — because Amendment A1 places the fridge and E8/QT-5
  does not move it**, so it stands where the reading order puts it (a run's start) and the block
  stands at wall A's free end. ~~Because E10.4 excludes the fridge from a block~~ — **that reason is
  withdrawn**: the owner's narrower rule (E10.4) permits a fridge and an oven in one block with a
  column between them. **The shape is unchanged; only its justification is, and the new one is a
  standing owner ruling rather than an inference.**
- **The planner takes the largest block that fits: `min(3, leftover modules available)`**, with one
  exception at size 1 (E6.2). Three is the owner's own *"two, three columns"* and is the one number
  this rule states; the rest is the run's arithmetic. **Revised 2026-09-14 by E12**, which reinstates
  `tall-pantry` and so removes the supply term that briefly made this `min(…, bodies available)` and
  pinned it to 1.
- **A block is never two ovens.** E4 binds inside the block exactly as it binds across the kitchen:
  at most one `tall-oven-tower` stands in it. E12 states the full composition.
- **Measured distribution** over the 228 347-room sample of the approved policy: **no block in
  114 976 rooms, one column in 16 910, two in 25 367, three in 71 094** — so a block stands in 58 % of
  rooms and most of those take all three columns.
- **A larger block can never displace a core role, by construction.** The block is drawn from wall A's
  **leftover** modules, which are computed after the core is placed and after `chooseWallCut` has
  chosen the wall split; the cut chooser never sees the block. So no room that qualifies for one
  column fails for two — it simply has fewer modules and takes a smaller block. Confirmed empirically:
  sweeping wall A millimetre by millimetre, **block size never decreases except for the single
  1 → 0 case E6.2 names** (111 occurrences in the sweep, all of that one shape).

**QT-4, ruled by the coordinator:** where the wall cut puts the **hob on wall B** (about 8 % of rooms
in the approved policy, measured), **no tower is generated and the hob keeps its oven.** This is
correct rather than a gap: wall B's leftover is at the corner end, which E2 forbids, and a tower on
wall A while the hob is on wall B would put the oven **round the corner from the cooking position**
*and* take the oven out from under the hob — both worse than the shipped kitchen. Also ruled: a tower
separated from the hob by one or two storage cabinets **is acceptable**. The owner said *at the
edges*, not *beside the hob*; the edge is the rule, and the two coincide only when the leftover is
exactly one module.

### E3 — the threshold is derived from what the run must hold, and the spoken number is confirmed by it

*"if you'll have space… four, five thousand millimeters."* **The figure is not encoded.** A tower is
planned when, and only when, all four hold:

1. **The full core survived** — `dropped` is empty: fridge, sink, preparation cabinet and hob are all
   present. A kitchen that had to give up its fridge has no business gaining a second oven; this is
   the owner's *"focus on the minimum… it will cost less"* stated as a precondition.
2. **The hob stands on wall A** (E2).
3. **Wall A's post-core leftover yields at least one whole 600 mm storage module** — the tower takes a
   module the leftover rule was going to place anyway, at the free end.
4. **The room is at least as tall as the column body it is planned into** (2200 mm). The approved
   policy floor is already 2200 and equality fits ([ADR 0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md)
   decision 3), so this clause never fires for a customer's room — it fires for the engine limits,
   which admit 860 mm, and it is what stops a planned tower from being refused at insert time.

**QT-3, ruled by the coordinator: adopt the derived rule.** Its witness, measured: **3300 × 1700**
plans wall A as `[600, 600, 600, 600]` — sink, preparation, hob and exactly one spare module — and
qualifies; **3299 × 1700** plans `[600, 600, 600]` with a 598 mm remainder and does not. That is
**3300 mm on the cooking wall and 5000 mm of wall A + wall B together**, which **confirms the owner's
"four or five thousand" within 200 mm without hardcoding either number** — and the boundary moves by
itself when a declared width changes.

**Refused:** a literal 4000 or 5000 mm on a wall. It would refuse a tower in the 3300 × 1700 kitchen
that demonstrably holds one and accept one in a 4200 mm wall B that holds no hob — a number answering
a different question from the one asked. Also refused: *"any leftover module gets a tower"*, which
would put a second oven in a kitchen that had just dropped its fridge for want of space.

**Revised 2026-09-14: the threshold is a function of the block size, and 3900 / 4500 mm are
reinstated as measured figures.** They were briefly retired while the block reading was thought to be
refused; the owner's correction reinstates them. Clause 3 reads **at least `N` whole modules**, where
`N` is E2.2's block size, and the boundary is therefore:

| Block | Minimum wall A | with wall B | Minimum wall A when wall B is too short to hold the fridge |
| --- | --- | --- | --- |
| 1 column | **3300 mm** | ≥ 1700 mm | **4000 mm** (B < 1700; the fridge joins wall A at the corner) |
| 2 columns | **3900 mm** | ≥ 1700 mm | **4600 mm** |
| 3 columns | **4500 mm** | ≥ 1700 mm | **5200 mm** |

Measured against the built planner, not computed by hand: each row is the smallest wall A at which the
full core survives and wall A's leftover yields that many modules, and the columns differ by exactly
one module's 600 mm. **The owner's spoken *"four or five thousand"* now lands on the two- and
three-column rows rather than below them** — 3900 and 4500 are inside the sentence, where the
single-column 3300 sat under it. That is corroboration for the block reading, arrived at from the
run's own arithmetic; it is **not** a reason to encode 4000 or 5000, which stays refused for the
reason below.

**There is no single threshold — there is this table, and the planner takes the largest block that
fits.** Each row is a boundary in its own right: below 3300 mm no block, at 3300 one column, at 3900
two, at 4500 three. **Each number was measured against the built planner** (the smallest wall A at
which the full core survives and wall A's leftover yields that many modules), and they are the same
figures that had been floated in discussion and then wrongly retired — arrived at here independently
and recorded as measurements.

### E4 — exactly one oven: never two, and never zero

*"In this case you'll have two ovens… so if you will add the tall cabinet with oven and microwave, in
this case you will choose hob with drawers. In case that you don't have this tall cabinet… we add the
hob with the oven."*

**The hob's build id is `base-hob-2drawer` if and only if the plan contains a `tall-oven-tower`; it is
`base-hob-oven` otherwise.** Both bodies are discrete 600 mm and nothing else, so the substitution is
width-, tile- and remainder-neutral: it changes no planned width and nothing in the shell.

**The unstated half of the owner's rule is the dangerous one, and it is ruled here explicitly: never
*zero* ovens.** The sentence guards against two; a substitution that fires while the tower is not
actually placed produces a kitchen with no oven anywhere, which is worse, and which no test of *"not
two"* would catch. **A tower that is planned and then refused at insert time is a programming error
and throws**, on the precedent already in the module (a refused free-end resize throws). Logging it
*not placed* and carrying on would ship a kitchen whose hob has drawers and whose oven does not exist.

### E5 — the substitution is not a degradation, and the two must not fight

The 2026-09-12 *Clarification* reads composition as two stages: select the surviving core (storage
yields, then the fridge, then preparation; sink and hob never), then refill each final remainder with
storage. **The tower is a third stage over the second, and it never enters the first.**

1. **Core selection is untouched.** The tower is not in `GENERATION_PRIORITIES`, never competes with
   the fridge or the preparation cabinet, and **cannot cause a role to be dropped**. For any room, the
   surviving core, the `dropped` list and the wall cut are what they were before this amendment.
2. **The leftover fill is unchanged in count.** The same free end is handed to the same rule and
   yields the same number of 600 mm modules; the **identity** of the free-end module changes.
3. **The substitution reads the finished plan, in one place** — the same function that decided the
   tower decides the hob's build id. There is no second site and no *"a tower was considered"* flag.

Amendment A4's leftover rule, Amendment C's drop order and F7's wall-B reserve are **unchanged**, and
the minimum kitchen is still a sink and a hob: **a tower is never a room prerequisite**, by any route.

### E6 — the tower's opening is exactly 600 mm, and the module inboard of it absorbs the remainder

A full-height body is **fixed** at 600 mm, and a fixed-width body dropped into a wider opening is
built at its own width and **centred** — the same branch that puts a 600 mm hood in a 700 mm slot.
Measured: at 4000 × 3000 the last wall-A floor void is **700 mm**, because the final 600 mm tile
merged with the 100 mm remainder under [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md)'s
cap (ADR 0046). A tower there would sit **50 mm off each edge** — not at the edge, and two bare
stretches where the rule allows one. The window is `0 < remainder ≤ 200` and covers **34 % of eligible
rooms** in a 228 347-room sample, so it is not a corner case.

**Ruled: the module immediately inboard of the tower is planned at `600 + remainder`** — inside
`base-cabinet`'s own 200–800 range and inside ADR 0052's ceiling — so the composed run reaches wall A's
reachable end exactly, no empty tile is left to merge with, and the tower's opening is exactly 600 mm.
The wall's bare end becomes 0 mm, which A4 permits (599 is a maximum) and which the run already
produces whenever the remainder divides evenly. Measured: the resulting shell reports **zero**
`validateDesignForCatalog` findings.

**Where there is no inboard module to absorb it** — a single leftover module, 7 % of eligible rooms —
**no tower is planned** and the wall composes exactly as it did before. **Refused:** refusing a tower
across the whole window (loses a third of eligible kitchens for an internal reason a customer cannot
see); placing the tower one module inboard so a `'fit'` body takes the free end (contradicts E2 for
the engine's convenience); resizing the tower (it is `fixedWidth`, and `setWidth` refuses it).

**E6.2 — re-derived 2026-09-14 for a block of `N`, and it is a re-derivation and not an edit.** Three
things change and one does not:

- **The exposed tile is still only the outermost one.** Two adjacent 600 mm tiles sum to 1200 and
  never merge under the 800 mm cap, so a block of two or three is exposed at its free-end face alone,
  exactly as a single column is. **The hazard does not grow with `N`.**
- **The absorbing body is the outermost `'fit'` body of the run, and E12's order makes that the block's
  own last column.** `tall-pantry` is the one `'fit'` full-height row (400–800, ADR 0048), and E12
  puts the oven tower **innermost** with the door columns outboard — so in every block of two or three
  the outermost body is a pantry, which takes a `600 + r` opening (at most 800) **by being planned at
  that width**, exactly as a fit body takes its tile. **No absorb, no reduction, no N + 1 arithmetic.**
- **Only the tower-alone block still needs E6's original absorb**, because a lone `tall-oven-tower` is
  `fixedWidth` and the outermost body is then a column. There the remainder goes to the last
  `base-cabinet` inboard of it, and where there is none the block is not placed. **This is the one
  place the block size can fall as the room grows** — from one column to none, across the 200 mm
  window — and it is stated rather than smoothed: measured by sweeping wall A millimetre by
  millimetre, **every** such dip is of that single shape (111 in the sweep, all `1 → 0`), and no
  two-or-three-column block ever shrinks.
- **A prediction corrected by the measurement.** It was predicted that the *"nothing inboard to
  absorb it"* fallback would *"get more common as the block grows"*. In absolute terms it does **not**:
  8 454 rooms at `N = 1`, 8 456 at `N = 2`, 8 455 at `N = 3` — a boundary ring that moves outward
  without changing size, whose **share** rises only because the eligible population shrinks (6.9 %,
  8.8 %, 11.9 %). Under E12's ordering the question is moot for `N ≥ 2` anyway. **The measurement is
  recorded, and so is the fact that the prediction was wrong in mechanism.**

### E7 — no upper stands above a full-height body, and the rule reads the body, not a role name

Amendment C placed a `wall-cabinet` above every base and a `hood` above the hob, **never above the
fridge**. That exclusion is written today as a skip on the role *name*. A tower reaching 2200 mm has
no opening in the wall band above it either, and a second name in that skip is one more place to
forget. **Ruled: an upper is attempted above a base only where the body's declared top is at or below
the wall row's floor**, read from the catalogue entry's declared height. The fridge keeps its exact
present behaviour and is the witness that the derivation is right. The top row (2200–2600) stays
uncomposed, as before; the space above a placed tower is an ordinary recorded column
([ADR 0101](0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md)).

### E8 — the generated fridge stays `fridge-free`, and it is not moved

**QT-1, ruled by the owner: no.** `tall-fridge-housing` does not replace `fridge-free` at an end.
Three reasons, all pointing the same way:

- **Cost.** Under [ADR 0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md)
  a free-standing fridge is the customer's own appliance and is priced at **zero**; the housing is
  joinery and carries a price. The swap is therefore the **more expensive** kitchen — against the
  owner's *"minimum… will cost less"*, which is the whole reason the tall-unit rules exist.
- **Product.** A housing is the niche an **integrated** fridge sits in, which the customer would then
  have to buy. The free-standing one is furniture they already own.
- **Geometry.** The housing is 600 mm against the fridge's 700 mm, so the swap hands 100 mm back to
  the bare end for no gain.

**QT-5, ruled by the coordinator: the fridge is not moved, and the conflict is recorded rather than
resolved by side effect.** In rooms where wall B is too short to hold the fridge — measured at
3400 × 1600 — the reading order puts it on **wall A, against the corner**: a full-height body in the
middle of the L run, which E2 reads against. **Amendment A1's cooking order wins.** It is the owner's
own ruling, given for a stated reason (*"take something from fridge, wash, then process on
worktop"*), and the fridge is the one full-height body that order names; moving it to a free end would
break the order to satisfy a rule that was about **adding** tall cabinets, not about relocating the
ones the order already places. **This amendment does not overturn an owner ruling as a side effect of
a different one.** If the fridge should move in those rooms, that is a change to A1, with its own
question to the owner and its own wave. *A conflict written down is a decision; the same conflict
discovered later is a defect.*

**Narrowed 2026-09-14 by E10, and the question it raised is answered.** E10's *no oven beside the
fridge* could have forbidden a tower in exactly these rooms; it does not. Measured, the fridge on
wall A's corner end and the tower on wall A's free end are never adjacent — sink, preparation and hob
always stand between them, minimum 1800 mm (E10.3). So what E2 reads against here is the fridge's
**position** alone, not any adjacency the owner has ruled out, and **the tower is planned in these
rooms normally**. A1 still wins on the position, and the tension is still worth its record — but it
is a smaller one than it looked when it was written.

### E9 — `tall-pantry` is open and unassigned — **SUPERSEDED the same day by E12**

> **Superseded 2026-09-14 by the owner** — *"add pantry and other cabinets let for later, adding new
> cabinets will be like after having the beta testing… lets focus now on building algorithm"*. **The
> pantry is in wave 7D3.** E9 is kept and not edited away, because the sequence is the point: the
> deferral below was given when a tall unit meant **one** 600 mm column, before the block reading
> existed and before anyone knew a block would need a second body. Read E9 as the state of the
> question on the morning of 2026-09-14, and **E12 as the ruling**.

**QT-2, ruled by the owner: not in this wave**, and **not assigned to a later one**. Unlike the oven
tower it answers no rule — there is no duplicated appliance to avoid — and at 600 mm it prices above
the `base-cabinet` + `wall-cabinet` pair it would replace, against the same *"minimum costs less"*.
It is also [ADR 0048](0048-the-pantry-column-is-the-one-resizable-column.md)'s one resizable column,
so **where** it may stand is a different rule from the tower's fixed 600. A wave that generates one
overturns nothing, but must ask first.

**Noted 2026-09-14, and it is why OQ-1 exists.** This deferral was given **before** the block reading
did, when a tall unit meant one 600 mm column. E2.2's block needs two or three bodies and the
catalogue can supply one, so the deferral and the block cannot both stand as written. **E9 is not
narrowed or reinterpreted here** — the question goes back to the owner (OQ-1), who may lift it, keep
it, or answer it a third way by adding a plain full-height storage row instead.

### E10 — the oven is never adjacent to the fridge, and the cooking order is why

**The owner, verbatim, 2026-09-14** — their own words, not a relay:

> *"What is the problem of having the oven near the fridge? Fridge consume much more electricity
> because oven will emit a lot of heat. Plus, like I said, the order of cooking is, like, you're
> taking from fridge something, you wash, you cut, you prepare, and you go to the hob or to the oven.
> In this way, if you'll put oven and after that the fridge, yeah, it's… it also used in this way. But
> in this case, you'll take from the fridge the towel on the right side, go to the sink that in the
> left side, then return back to the oven on the right side. So it's done like this for sometimes, but
> in majority of the cases, we need just to keep the order of the cabinets and electronics."*

**E10.1 — no oven stands *beside* the fridge: what is forbidden is ADJACENCY, not proximity.**
*(Narrowed 2026-09-14 by the owner's own ruling in E10.4 — **at least one cabinet between them
satisfies it.** The scope is narrower; the authority is not weaker, and neither reason below moves.)*
The two reasons are independent and both are the owner's.

1. **Thermal, and it is a physical constraint, not an aesthetic one.** *"Fridge consume much more
   electricity because oven will emit a lot of heat."* An oven radiating into a fridge's side raises
   that fridge's consumption for as long as the kitchen exists. **This reason must not be traded away
   by a later wave that reads E10 as a workflow preference**: a layout argument can be answered with
   another layout argument, and this one cannot. It is written first here for that reason.
2. **The cooking order.** *"take… from fridge…, you wash, you cut, you prepare, and you go to the hob
   or to the oven."* Putting the oven beside the fridge forces the customer to double back — the
   owner's own example: *"take from the fridge… on the right side, go to the sink that in the left
   side, then return back to the oven on the right side."*

**E10.2 — the contiguous *fridge-and-oven* pairing is the minority case and is not generated.** The
owner acknowledges it is *"done like this for sometimes"* and rules that *"in majority of the cases,
we need just to keep the order of the cabinets and electronics."*

> **Corrected 2026-09-14, the same day.** E10.2 was first written as *"the contiguous full-height
> **block** is the minority case"*, and on that reading E2 and E3 were said to stand unchanged. **That
> was too wide a reading of this ruling and it is withdrawn.** What the owner refuses here is **one
> adjacency — oven beside fridge — and not grouping.** See E10.4.

**E10.4 — the separator rule, and an inference withdrawn.**

> ~~**How the two rulings reconcile: the block excludes the fridge.** The block stands at one end and
> `fridge-free` at the opposite end, with the cooking order between them.~~ **WITHDRAWN 2026-09-14 —
> it was the coordinator's inference, not a ruling, and the owner replaced it with a narrower rule of
> their own.** It is struck rather than deleted because it was acted on for part of a day and because
> the way it was withdrawn is the point: it had been marked, in this record, as *"the one place where
> this amendment rests on inference rather than on a ruling"* and as something that **must not be
> hardened into a settled reading**. It was put to the owner instead, and it turned out to be wrong.

**The contradiction that prompted it.** The reference photographs show a **fridge beside an oven
tower** — precisely what E10.1 appeared to forbid. The owner was shown that contradiction directly and
offered three readings: the rule governs and the photographs are the minority case (the coordinator's
inference above); the photographs govern and adjacency is fine; or a column always separates the two
inside a block. **They chose none of the three**, and ruled, verbatim:

> *"or minimum have another cabinets between them"*

**E10.4.1 — the rule: the fridge and the oven may stand in the same run, and even in the same block,
provided at least one cabinet stands between them.** What is barred is the **shared side panel** — two
carcasses touching — and not nearness. This is narrower than E10.1 as first drafted and narrower than
the withdrawn inference, and **it explains the photographs without calling them a minority case**,
which is why it is coherent rather than a softening: a separating carcass answers the thermal reason
**physically**, by breaking the conduction path, rather than by trading it against a layout preference.
**E10.1's two reasons stand unchanged, the thermal one first, and are still barred from being traded
away.**

**E10.4.2 — what it changes for composition: nothing this wave does, and the reason is now a better
one.** A block may contain both a fridge column and the oven column with a door column between them;
**wave 7D3 still composes no such block, because Amendment A1 places the fridge and E8/QT-5 rules that
this wave does not move it** — the fridge stands where the reading order puts it, at a run's start,
and the block stands at wall A's free end. **The block's composition is therefore what E12.1 says it
is because of A1, not because of the withdrawn inference.** Nothing that was measured changes.

**E10.3 — the rule is already satisfied structurally, so it is an invariant to assert and not a new
planning gate.** Worked through and measured before being written, because a redundant gate is a
second authority. **Under E10.4's narrower rule every measurement below holds *a fortiori*:** the
reading order delivers **two or three cabinets** between the fridge and any oven where the rule asks
for **one**, so nothing measured changes and the margin is wider than the rule requires.

- The **oven tower** is only ever placed at wall A's free end (E2). The **fridge** is the reading
  order's first item, so it stands either at wall B's free end — a different wall, and no tower is ever
  planned on wall B — or, when wall B is too short to hold it, at wall A's **corner** end.
- In that second case **the sink, the preparation cabinet and the hob always stand between them**: the
  fridge is only ever on wall A when the whole reading order is on wall A, and a tower requires the
  full core to have survived (E3 clause 1), so nothing can be dropped out from between them.
- Measured over a 228 347-room sample of the approved policy: **16 604 rooms put the fridge on wall A
  *and* qualify for a tower, and in none of them are the two adjacent.** The **minimum separation is
  1800 mm** — exactly sink + preparation + hob — with the tightest case at 4000 × 1077.
- The same holds for the oven **under the hob**: the hob is never adjacent to the fridge anywhere in
  the sample (0 of 228 347), because the drop order removes the fridge before the preparation cabinet,
  so a surviving fridge always has both the sink and the preparation cabinet after it.

**Witness room, measured — 4000 × 1600:** wall A composes `fridge[900–1600] sink[1600–2200]
preparation[2200–2800] hob[2800–3400] storage[3400–4000]`, and it is the free-end storage at
3400–4000 that becomes the tower. **That is the cooking order laid out left to right along one wall,
ending at the oven, 1800 mm clear of the fridge** — which is both E10's rules and Amendment A1, in one
room. **So the tower is permitted in the rooms where the fridge stands against the corner**, and the
QT-5 tension recorded in E8 is narrower than it looked: what E2 reads against there is the fridge's
*position*, not any adjacency this ruling forbids.

**Consequence for wave 7D3:** no new clause in the planner, and **a property that asserts at least one
placed body stands between any placed fridge and any placed oven — tower or hob-with-oven — along the
run, on either wall and across the corner.** The assertion is **the owner's rule, not a distance and
not a non-adjacency-by-construction argument**, so a future wave that legitimately places the two two
columns apart inside a block still passes it. It is worth asserting precisely *because* it is free
today: it is bought by Amendment A1's reading order, and a later wave that re-orders a run (7D4) or
puts a fridge in a block would otherwise break a physical constraint with no test to notice.

### E10.5 — does a base cabinet count as the separating cabinet? Half of it the geometry settles; half of it is OQ-2

The owner said *"another cabinets"* without qualifying, so the question was worked out from the heat
path rather than the module count, as asked. **It splits in two, and only one half needs anyone.**

**Settled, and already owner-ruled: between the fridge and an oven *under the hob*, a base cabinet is
sufficient.** Amendment A1's reading order is fridge → sink → **preparation cabinet** → hob, so the
product has always put **two base cabinets** between a fridge and the oven beneath the hob — that is
the arrangement the owner ruled for their own cooking-order reason, and it is what the reference
photographs show. The geometry agrees with the ruling: `base-hob-oven`'s oven sits **entirely below
the worktop line**, in the same 0–860 mm band the separating base carcasses occupy, so the separator
covers the oven's full height and the conduction path is broken along all of it. **Nothing to decide.**

**Not settled: between the fridge and a *tall oven tower*, whether a base cabinet alone suffices.**
Measured, the tower's oven does **not** sit in the base band. `OVEN_TOWER_DOOR_BAND_HEIGHTS_MM` is
`[500, 500]` in a 2200 mm frame — *"one under the oven, one over the microwave"* — so the appliances
occupy the middle of the column, the oven beginning above the lower 500 mm leaf and reaching above the
860 mm worktop line. A base cabinet between them therefore covers only the oven's **lower part**, and
above it:

- **860–1500 mm is the backsplash gap, which is open air** — `recomputeVoids` never subdivides it
  (ADR 0015's vertical threshold, the *"no fallback"* rule), so nothing stands there at all;
- **1500–2200 mm is the wall row**, and a `wall-cabinet` is 330–400 mm deep against the fridge's 742
  and the tower's 638 — so even where an upper stands, the front third of the two bodies still faces
  across open air.

So a base cabinet plus an upper is **not** a continuous barrier at the tower oven's own height, and
the geometry does not answer whether that matters. **It is stated as OQ-2 and not chosen.**

**It blocks nothing, and it is not reachable by this wave.** A generated kitchen never places a fridge
next-but-one to a tower: A1 fixes the fridge at a run's start, the block stands at wall A's free end,
and the measured minimum separation is **1800 mm — sink, preparation and hob**. OQ-2 becomes live only
when a wave places a fridge **inside or beside a block**, which E10.4 now permits in principle and
which nothing plans. **Recorded here so that wave does not re-derive it.**

### E11 — the top row stays excluded, and that is now the owner's own ruling

**The owner, verbatim, 2026-09-14**, answering whether wall cabinets should run to the ceiling as they
do in seven of the eight photographed kitchens:

> *"This topic… in majority of the cases, it's still the ceiling. But this ceiling, in majority of the
> cases, is different. So somewhere is two thousand five hundred, somewhere is three thousand
> millimetres height. And in this case, let's stick to what we have now. Get some feedback. And after
> that, we can make them higher. So the middle and the top cabinets to be just higher. But now let's
> keep like it is."*

**E11.1 — Amendment C's exclusion is unchanged and is now owner-confirmed** rather than inherited.
Composition places no body in the top row (2200–2600), and a generated kitchen keeps the empty strip
above its uppers. **This is a deliberate deferral with a stated reason, not an oversight and not a
defect** — which matters because the *Field corroboration* table above records that seven of eight
built kitchens do run to the ceiling, and **that observation must not be read by a later wave as a
standing defect against the generator.**

**E11.2 — the reason is ceiling variance, and it is a better reason than "not yet".** *"this ceiling,
in majority of the cases, is different… somewhere is two thousand five hundred, somewhere is three
thousand"*. A band sized for one ceiling is wrong for another, so the owner wants feedback from the
built product before committing to a rule.

**E11.3 — the eventual fix is taller uppers, not a composed top row, and the difference is
material.** The owner's form is *"the middle and the top cabinets to be just higher"* — **the wall
cabinets themselves grow**, rather than a second row being composed above them. One changes a band's
height as a function of the room; the other adds a body. **Whoever plans that wave starts from "make
the uppers taller as a function of the room height", not from "compose 2200–2600"**, and this clause
exists so they start from the owner's design rather than from the obvious one.

**E11.4 — the precedent this sets for photographs.** The *Field corroboration* table opens by saying
photographs are evidence and not a ruling, and that where a photograph and a ruling disagree the
ruling governs. **E11 is that case, and it went the way the rule said it would**: seven of eight
photographs showed uppers to the ceiling, a written exclusion said otherwise, and the owner's ruling —
not the photographs — settled it.

### E12 — what a block is made of, and in what order

**The owner, verbatim, 2026-09-14**, on a block's composition:

> *"I think it's always only one incorporated fridge… in majority of the cases, you have only one
> column or one tall cabinet with oven and microwave, and you can have multiple cabinets, tall
> cabinets with doors. Because under the doors, you can just have the shelves and different
> organizers."*

and, answering the supply question (OQ-1) in the same exchange:

> *"add pantry and other cabinets let for later, adding new cabinets will be like after having the
> beta testing… lets focus now on building algorithm"*

**E12.1 — the composition rule.** In one block: **at most one fridge column**, **at most one
oven-and-microwave column**, and **any number of door columns**. Mapped onto the catalogue as it
stands — `tall-oven-tower` is the oven-and-microwave column, `tall-pantry` is the door column
(*"under the doors… shelves and different organizers"*), and **the fridge column does not arise in a
generated kitchen because Amendment A1 places `fridge-free` and this wave does not move it**
(E10.4.2) — *not* because a block may not hold one, which E10.4 now permits with a column between.
So a generated block is **one `tall-oven-tower` plus zero to two `tall-pantry`**, and **OQ-1 is
answered without a catalogue change: none is needed and none is authorised.**

**E12.2 — the order inside the block: the oven tower innermost, the door columns outboard.** *The
coordinator's ruling, on two reasons the owner did not have to state*:

1. **The oven belongs as near the cooking zone as the block allows.** The block sits beyond the hob,
   so putting the tower at its inboard face keeps the oven closest to the hob and the door columns
   beyond it.
2. **It dissolves E6's merge hazard for every block of two or three.** The outermost body is then a
   `'fit'` pantry, which takes a `600 + r` opening by being planned at that width. The alternative
   ordering would put a `fixedWidth` column outermost and would need the absorb, the `N + 1` module
   bookkeeping, and a block that shrinks as the room grows. **The ergonomic reason and the engineering
   one point the same way**, which is why this is ruled rather than asked.

**E12.3 — the cost tension is resolved by the owner, knowingly, and the two rulings are not in
conflict.** `tall-pantry` prices at roughly **808 000 minor** against roughly **693 000** for the
`base-cabinet` + `wall-cabinet` pair it replaces, and that figure was put to the owner when they
deferred it in E9. They have now chosen the pantry with the number in front of them. **So E5/R5's
*"minimum costs less"* governs which appliances and roles a kitchen gets — it is the reason a kitchen
does not gain a second oven, a fridge housing, or a role it dropped for fit — and it does *not* mean a
full-height run may never cost more than the cabinets it displaces.** Recorded because the two
rulings read as contradictory otherwise, and a later reader would pick one.

**E12.4 — new tall body types wait for beta.** *"adding new cabinets will be like after having the
beta testing"*. The catalogue's three full-height rows are what composition has; the notable gap in
the industry taxonomy — a **broom / utility unit** with one tall internal space rather than shelves,
and behind it pull-out and internal-drawer larders and a compact housing — is recorded as
`docs/backlog/open.md` entry **66**, gated on beta feedback. **It is not part of wave 7D3 and is not
planned.**

### OQ-2 — open, blocking nothing: is a base cabinet enough between a fridge and a *tall* oven tower?

**Not put to the owner now**, on their own instruction — *"lets focus now on building algorithm"* —
and because no wave can reach it. The geometry above is the finding; the question is whether the
owner's *"another cabinets"* means **any** cabinet or, where both bodies are full height, **another
full-height column**. The natural moment to ask is the wave that first composes a fridge into a block.

### OQ-1 — ANSWERED 2026-09-14 by E12. A block needed two or three tall bodies and the catalogue appeared to have one

**Kept as written, with its answer at the top, because the arithmetic below is what made the question
worth asking and it is still the reason the pantry is in.** The owner reinstated `tall-pantry`
(E12), so the block composes from the catalogue as it stands. The third possibility this question
raised — a plain full-height storage row rather than a fitted pantry — was **not** taken: the owner
chose the pantry the catalogue already has and deferred new bodies to after beta (E12.4).

**The arithmetic.** The catalogue holds exactly three full-height rows — `tall-oven-tower`,
`tall-fridge-housing` and `tall-pantry`. Of the three:

- `tall-oven-tower` — **one per kitchen**, and no more: E4 forbids two ovens.
- `tall-fridge-housing` — **ruled out by the owner on cost** (E8/QT-1).
- `tall-pantry` — **deferred by the owner**, *"not in this wave"*, and left unassigned (E9/QT-2).

**That leaves one usable tall body, so a two-column block cannot be composed at all and a three-column
block is two bodies short.** The block reading and the two standing rulings are therefore not
jointly satisfiable today. **It is entirely possible the pantry deferral was made without knowing a
block would need it** — E9 was answered before the block reading existed — so this is put back to the
owner rather than resolved by reading E9 narrowly.

**A possibility the owner should be offered, because it changes what kind of answer this needs.** What
stands beside the appliance column in the reference photographs may be **plain full-height storage
rather than a fitted pantry** — a cupboard with shelves, not ADR 0048's two-tier pantry with its
door-count rule. If so the answer is a **catalogue addition** (a new full-height storage row) and not
a composition rule, and neither E9's deferral nor E8's cost ruling needs reopening at all.

~~**Until it is answered, E2.2's block size is 1 and generation composes a single
`tall-oven-tower`.**~~ **Superseded within the day by E12:** the block size is
`min(3, leftover modules)` and wave 7D3 composes one `tall-oven-tower` plus up to two `tall-pantry`.

## Consequences of Amendment E

- **Wave 7D3** builds E1–E7 and E12 and asserts E10 (`docs/milestones/M7-room-and-presets.md`,
  *Wave 7D3 — dispatchable punch list*): one new pure leaf for the rule, the planner's free-end substitution and absorb, and the
  command module's third role plus E7's derived suppression. `leftover-rule.ts`, `shell-design.ts`,
  the commands, the void engine, the validator, the catalogue, the price book and `room/**` are
  read-only to it. The declared 600 mm and 2200 mm are **read from the catalogue entry**: a
  generation-side constant checked against the catalogue in a test is the second authority
  [ADR 0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
  forbids, not a safeguard.
- **Three identical cabinets fewer.** At the largest approved room the composition produced eleven
  identical 600 mm `base-cabinet`s with an identical `wall-cabinet` above each (measured at
  6300 × 5100); a three-column block replaces **three** of them — ~~exactly one~~, which was true only
  while the block was thought to be a single column. **Wave 7D4 — *a long storage run is composed, not
  repeated*** is approved for the rest, needs an owner ruling it does not yet have (which bodies, in
  what proportion and in what order), and cannot run beside 7D3.
- **What a customer may still do is unchanged.** These rules bind **what the product proposes**, as
  A4 does. A customer may insert a second oven by hand, and nothing marks it.
- **No surface changes.** `generateKitchen` still has no production caller until wave 7F4, so none of
  this is visible in the app and none of it is provable by looking at it.

## Decision-record sweep — Amendment E

| Record | Standing after E |
| --- | --- |
| This ADR, **Amendment A1 / A2 / A4** | **Unchanged, and A1 explicitly wins over E2 where they disagree** (E8). The minimum kitchen stays a sink and a hob; the 599 mm leftover cap stands, and E6's absorb lowers a bare end to 0 mm, which it already permits. **Strengthened by E10:** A1's cooking order now carries a physical reason as well as an ergonomic one, and E2 is reclassified as A1's shape in an L-room rather than as an independent finding. **A1 is load-bearing for a thermal constraint** — a wave that re-orders a run must read E10 before touching it. |
| This ADR, **Amendment C** | **Extended, not altered.** The drop order and F7's reserve are untouched; C's *"never above the fridge"* becomes E7's derived rule, with the fridge as its witness. **C's top-row exclusion is now owner-confirmed** (E11) rather than inherited, and its eventual replacement is *taller uppers*, not a composed top row. |
| [0048](0048-the-pantry-column-is-the-one-resizable-column.md), second reading | **Untouched, and now load-bearing.** The pantry is the one `'fit'` full-height row, so it both supplies the block's door columns (E12.1) and — standing outermost under E12.2 — dissolves E6's merge hazard. **Generation becomes its first automatic caller**, and its 400–800 bound plus its 500 mm door-count threshold are exercised at whatever width the free end gives it. Nothing in ADR 0048 changes; a wave that narrows that bound now changes generated kitchens. |
| [0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md), second reading | **Unchanged, and its scope clarified by E12.3.** *"Minimum costs less"* governs which appliances and roles a kitchen gets; it does not mean a full-height run may never cost more than the cabinets it displaces. The owner chose the pantry with its ~808 000 against ~693 000 in front of them. |
| This ADR, **Clarification 2026-09-12** | **Unchanged.** E5 adds a third stage above the second and enters neither of the first two. |
| [0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md) | **Load-bearing for E8**, and the reason the cheaper kitchen is the free-standing fridge. |
| [0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md), [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | **Unchanged, and the cause of E6.** The merge is correct; E6 removes the empty tile it would merge with rather than capping the merge. |
| [0048](0048-the-pantry-column-is-the-one-resizable-column.md) | **Untouched** — E9 defers the pantry without ruling on it. |
| [0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) decision 3 | **Reused** for E3 clause 4: a 2200 mm body in a 2200 mm room fits. |
| [0101](0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md) | **Now reached in composition**: a generated tower is the first composed full-height member with recorded space above it. Nothing is composed into that space. |
| [0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md) | **Applied** to the tower's declared width and height. |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment B | **Unchanged.** No bound moves; E3 clause 4 reads the engine limits and changes neither policy. |
| [0109](0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md) | **Not reached.** Presets are recorded documents; this amendment governs generation only. Whether an owner-authored preset may contain a tall unit is unaffected — it may, because the owner authors it by hand. |
