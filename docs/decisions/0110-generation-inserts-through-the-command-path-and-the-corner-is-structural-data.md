# ADR 0110 — Generation inserts through the command path, starting from a shell of empty space, and the corner is structural data

Status: Accepted (**Amendment A, 2026-09-11** — the owner's answers to Q2 and Q3: the kitchen reads fridge → sink → preparation → hob-with-oven, its minimum is a sink and a hob, and at most 599 mm of any run is left empty; also corrects a false claim about ADR 0015 in the M7 plan; **Amendment B, 2026-09-11** — the shell is authored for its room: corner columns derived, free runs tiled with neutral depth sources, wall B planned against the deepest declared depth; **Amendment C, 2026-09-11** — the owner ruled F2 (upper cabinets and a hood), F3 (fridge first, then preparation) and F7 (keep the 100 mm wall-B reserve, an exception to the 599 mm rule))
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
