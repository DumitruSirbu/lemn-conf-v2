# ADR 0110 — Generation inserts through the command path, starting from a shell of empty space, and the corner is structural data

Status: Accepted (**Amendment A, 2026-09-11** — the owner's answers to Q2 and Q3: the kitchen reads fridge → sink → preparation → hob-with-oven, its minimum is a sink and a hob, and at most 599 mm of any run is left empty; also corrects a false claim about ADR 0015 in the M7 plan; **Amendment B, 2026-09-11** — the shell is authored for its room: corner columns derived, free runs tiled with neutral depth sources, wall B planned against the deepest declared depth; **Amendment C, 2026-09-11** — the owner ruled F2 (upper cabinets and a hood), F3 (fridge first, then preparation) and F7 (keep the 100 mm wall-B reserve, an exception to the 599 mm rule); **Amendment D, 2026-09-11** — how a composed kitchen reaches its widths: insert, then `setWidth`, packed against the corner; Amendment B gains **B3a, 2026-09-11** — wall A's floor run stops short by the run-end panel's footprint; **Amendment D, revised 2026-09-11 (7D1 logic review R1.1)** — composition plans each row's widths first and the shell is tiled at exactly those boundaries; insert-then-`setWidth` is withdrawn except at a wall's free end; **Clarification, 2026-09-12** — core selection lets storage yield before a core role, then Amendment A4 refills every final remainder of at least 600 mm; **Correction, 2026-09-13** — odd physical spans plan to their whole-millimetre reachable end, correcting the 1699 witness's planned remainder from 99 to 98 mm without changing the 200 mm usable-remainder rule; **Amendment E, 2026-09-14, drafted for wave 7D3; reviewed and accepted 2026-09-15 by the coordinator with five presentation corrections applied and no ruling, threshold or measurement changed, E1–E13** — the owner's tall-unit and oven rules: symmetry is not a rule of composition; the full-height **block of up to three columns** stands at the free end of ~~wall A and nowhere else~~ **the suffix wall — the *"nowhere else"* was OVERTURNED by an owner ruling and the block follows the run onto wall B where wall B is wider; see Amendment I** — excluding the fridge, and is **one `tall-oven-tower` innermost plus up to two `tall-pantry` outboard** — at most one fridge column, at most one oven column, any number of door columns; the planner takes the largest block that fits, and the threshold follows the block size (**3300 / 3900 / 4500 mm** of wall A, measured); the hob's base follows the oven tower so a kitchen has exactly one oven and never zero; the outermost `'fit'` body absorbs the free-end remainder, which E12's order makes the block's own last column; no upper stands above a full-height body; **no oven ever stands beside the fridge — adjacency is barred, not proximity, and *"minimum have another cabinets between them"* satisfies it; a thermal constraint as well as a workflow one**, already satisfied by Amendment A1's reading order and asserted rather than gated; the generated fridge stays `fridge-free` and is not moved, A1's cooking order winning where the two disagree; **the top row stays excluded, now owner-confirmed**, its eventual replacement being taller uppers rather than a composed row; and new full-height body types wait for beta (backlog 66). E9's pantry deferral is **superseded within the day** by E12 and kept for its sequence; **Amendment F, 2026-09-15, wave 7D4's slice S0, F0–F14** — a long storage run is composed, not repeated: the owner's four statements of 2026-09-14; a four-step storage cycle `[base-3drawer, base-cabinet, base-panbank, base-cabinet]` whose even split is a consequence of its shape and **not a ratio constant**, advanced as **one sequence per kitchen across the corner** from wall B's free end, so wall B's slot count sets wall A's phase; the preparation cabinet becomes `base-3drawer`, amending **A1's *interim data* and not its order**, with *drawers before the hob* recorded as a preference the owner softened and the criterion it would have justified deleted; **this wave changes a body's identity and never its width**, on the inclusive 800 mm merge cap; **a module is identified by what composed it — never by its role and never by its width**, through one exported predicate, because a block column carries `role: "storage"` deliberately under E5 clause 2 and role-scoping is wrong on 32.8 % of placed rooms against correct output (**and the citation "E5.2" names a section E does not contain**); the catalogue's own `fronts` declaration stays the one authority for a drawer front; the wall row composes exactly what it composes today with **no lift and no open shelf generated**, the owner having priced the lift and declined it, and the top row's stretch-ceiling lift rule recorded and not built; the variety's measured **+8.6 %** so the choice is a knowing one; the dishwasher and the bottle cargo recorded and **deferred to wave 7D5**; a new leaf in `configurator-domain` must be exported from `src/index.ts` or the build emits nothing for it; and **two of the wave's criteria corrected — the one-declaration-site grep scoped to composed-body declaration sites, and the id-convention count replaced by a pinned site set**; **F15** closes the dangling citations by carrying the dropped-roles sentence's shape and naming where the owner's wording ruling lives. **Written after the slice it ratifies, which F0 records rather than conceals**; **Amendment G, 2026-09-16, G1–G8 — drawers are anchored to the work, not distributed by a pattern**: the owner corrected the cycle within a day of its acceptance — *"is not like in chess"* — and gave the placement rule directly, so **F3 and F4 are superseded and struck in place** while F1, F2, F5–F15 stand and **F6's provenance discriminator is untouched, because it names a slot's origin and never its body**. Drawer cabinets are anchored **between the sink and the hob**, ideally two; **everything after the hob and after the tall cabinets takes doors**, and so does everywhere else. **The ratio stops being a rule and becomes a consequence of the room**, which is what ADR 0117 asks for and what F3 reached only by argument — so **no criterion may assert a 3-and-3 proportion**, and four of wave 7D4's are withdrawn. Measured against the slots that exist: **a storage slot never stands between the sink and the hob on one wall** — there is exactly one module there and it is the preparation cabinet — so the rule reduces to *the preparation cabinet is a drawer* (already F5) plus *every storage slot is a door* (already today's output), and it composes **zero drawer storage cabinets in all 149 151 rooms that have storage**, at a **31.9 %** fleet-wide drawer share falling to **10–19 %** in long runs. **The *ideally two* is a width change and is never free** — a second module costs a storage cabinet in 45.1 % of rooms, a block column in 31.1 %, a core role in 15.6 %, and nothing in 0.0 % — so it is ruled to **one** pending the owner, and belongs to 7D5 if it is ever two. **`STORAGE_CYCLE` and `base-panbank`'s only caller die with F3**; the owner said twice the rule is not strict, so **G2 is a set of defaults and no criterion may assert it as an invariant**; **Amendment H, 2026-09-16, H1–H8 — the owner's run order, and the split between waves 7D4 and 7D5**: the owner gave the whole order rather than choosing between the coordinator's two candidate placements — **fridge → [door, if space] → sink → drawer [+ a second, if space] → hob → bottle cabinet → [a third drawer, if the run is long] → doors to fill → tall cabinets at the edge** — which **supersedes G2** and reconciles the two readings before it: *"after the hob, doors"* means **after the drawer group**, and the drawers are **one group astride the hob**. **Two of the order's five clauses are already built** — the fridge→sink stretch and the post-hob fill are wall B's and wall A's storage, doors today, **which answers Q-G1 in the affirmative from the owner's own mouth** — and the tall cabinets are Amendment E's block, so **the order adds exactly two modules, both width changes: a 300 mm bottle cabinet and a 600 mm second drawer**. Measured, the order gives **29.8 % drawers at the owner's own six-cabinet run** against G2's 16.7 %, and its residual shortfall falls in runs of 7 and 8 — **exactly the band the unmodelled third clause covers, so the gap is ours and not the rule's**. **G5's *"a second drawer cabinet is never free" is WITHDRAWN**: it displaces a storage slot one-for-one and the cabinet count does not change, so **Q-G3 dissolves** — the error was counting slots and calling the result a kitchen. The bottle cabinet is **free in 45.7 %** of rooms, moves Amendment E's block table **cleanly by +300** (3600/4200/4800), and **refutes D2.2's absorb-window warning by measurement** — 39 530 rooms in the window with and without it — which is struck rather than left standing. **7D4 keeps only the width-neutral part** (preparation and the first post-hob storage become drawer bodies, **1.31 drawers at run 6, and no criterion may claim it meets the proportion**) and **7D5 takes the order**, grouped by what re-baselines the run's arithmetic exactly as F-era D11 grouped the dishwasher and the cargo. **All three phrasings of this rule are recorded with their dates and none is smoothed away**; none of the three corrections was caught by a test or a review, only by asking; **Amendment I, 2026-09-17, written for wave 7D8 slice S1(a) and recording an owner ruling of 2026-09-16 — the block follows the run rather than the letter A, and A1's order survives its own mirror**: shown both measured arms, the owner chose **follow-the-run — 144 866 blocks with 47 175 on wall B and nobody losing one** — over **confinement to physical wall A — 97 691, costing 12 900 kitchens a block they have today**, so **Amendment E's E2 *"and nowhere else"* is OVERTURNED in its wall** while **E2's refusal of the corner end, and E3–E7 and E10–E13 entire, are untouched**. The engineering argument that reaches the same answer — E's stated reason was about *the free end the layout leaves*, not about the letter A (`tall-end-rule.ts:51-53`) — is **kept and explicitly demoted to a reason rather than a permission: the owner did not need it and the ruling does not rest on it** (ADR 0120 D2's lesson applied). On **Amendment A1 the verdict is deliberately split, against the wave plan's tidier "restated, not broken", which this record was asked to check rather than transcribe**: A1's **order** is **RESTATED** and unamended, on the owner's own *"sometimes the arrangement is in mirror, like hub, cabinets (drawers), sink, cabinets, fridge"*; A1's **second sentence** — *"on a left-corner L the run reads from wall B's free end"* — is **CORRECTED** to *the prefix wall's free end*, because it is stated unqualifiedly and is **false in 82 395 of 211 551 placed rooms** after the wave; and *"left to right as seen from inside the room"* is **narrowed to the direction *along the run*, which A1's own *"the fridge is not tied to a wall"* already pointed at**. The reader's rule: **a mirrored kitchen is not A1 violated; a run that does not read fridge → sink → preparation → hob in *either* direction is.** Q-7D8-2 — whether the rule may cost a cabinet — is **left open and not prejudged**)
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

## Clarification — 2026-09-14: the generator does not insert corner bodies because the shell authors them

**Written because two true facts were connected into a false conclusion and reported to the owner as a
missing feature.** Nothing here changes a decision; decision 1 and Amendment B1 already say it. It is
recorded as prose a later reader will hit, because the misreading is an easy one and it has happened.

**The two true facts.** (i) The four corner rows — `base-corner-x-900`, `base-corner-return-320` and
the two wall returns — are **not insertable**: they are seeded, they declare no catalogue equivalent
because §13.1 rules a corner may not be swapped, `toInsertableBody` returns `undefined` for them and
`insertBody` answers `NOT_INSERTABLE`. (ii) Both composed runs **stop short of the corner**, starting
at 900 mm rather than at 0.

**The false conclusion drawn from them** was that a generated kitchen has no corner cabinet and passes
its worktop over roughly 600 × 600 mm of dead space.

**What is actually true, measured from `buildLShellDesign` across the approved policy — at
900 × 1000 × 2200, 3300 × 1700 × 2200, 3600 × 2920 × 2600 and 6300 × 5100 × 2600:** every shell holds
its corner assembly, and fact (ii) is the *evidence* for it — `floorRunStartMm` is defined as the
farthest along-wall edge of the structural pieces on that wall, so **a run starting at 900 is a run
starting where the corner cabinet ends.**

> **The sentence that prevents the repeat: the generator does not insert corner bodies because the
> shell authors them. That is the design, not a gap.**

**Two consequences worth stating in the same place.**

- **"Make the corner placeable" means "make it correctly sized", never "route it through
  `insertBody`".** A corner body spans **two walls**; the void and column model is **per wall**
  (`deriveColumnKeyAt`, `alongWallPosition`), and `findCornerOverlaps` exists to police exactly that
  case. Making a corner insertable would mean teaching the engine a two-wall footprint — far larger
  than making its size derived, and nothing any owner ruling asks for. Wave **7D6** derives the size
  and explicitly does not do this.
- **In the smallest rooms the corner is the first thing placed and the only thing that fits.** At
  900 × 1000 both runs are **zero length** and generation returns *minimum not met*. The honest
  sentence is therefore *"what there is no space for is the sink and the hob, after the corner has
  taken its 900 mm"* — never *"there is no space for a corner cabinet"*.

**And a standing caution for any wave that touches the corner's size:** `farthestCornerEdgeMm` is the
root of **two** owner-facing numbers today — the approved wall minima (ADR 0108 Amendment B, approved
by the owner personally) and 7A2's `ROOM_TOO_SMALL_FOR_KITCHEN`. **Of the two directions, the one
without an alarm is the dangerous one:** a reach that *grows* past an approved bound turns the guard
test red, which is what the guard is for; a reach that *shrinks* fails nothing and silently refuses
rooms the product could build.

**~~A third number — the validity of every stored design~~ — struck 2026-09-14 on the owner's
ruling:** *"there are no existing saved kitchens at the moment… until we'll not implement all the
milestones, and I will not explicitly mention that we move it to production, we are pretty safe to not
worry about existing kitchens."* Nothing is stored and nothing is in production, so
[ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md)'s marked-not-moved consequence
**cannot reach a customer**, and it must not be used to argue for caution. **Re-deriving this geometry
today costs no migration and no compatibility window.**

**It becomes a third number again at wave 7P2** — the owner's own *"a critical moment will be when I
will start to save presets"*. Presets are the first durable artefact the product will hold, so from
that wave the reach is load-bearing on stored data. **Treat it as a deadline: geometry that wants
re-deriving is re-derived before 7P2, not after.** Their ordering beyond that point: M8's review /
contact / share page, customer profiles, then a milestone for deployment, production readiness and a
security audit. The wave plans are `docs/milestones/M7-room-and-presets.md`, *Wave 7D6* and *7D7*.

## Amendment E — 2026-09-14: a tall unit stands at the free end of wall A, and the hob's oven follows it

**Status: drafted for wave 7D3 as its slice S0. Held 2026-09-14 on two questions the owner's
reference photographs raised; both are answered the same day, the hold is fully lifted, and the
tall-body supply question OQ-1 is answered too (E12) — `tall-pantry` is reinstated and a block of two
or three columns is composable from the catalogue as it stands. **No catalogue change is authorised
and wave 7D3 is dispatchable.** ~~One question remains open, **OQ-2**~~ — **OQ-2 was answered by the
owner on 2026-09-14 and is recorded as E13: the separator's kind follows where the oven is.** **No
question in this amendment is open.**

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
- **QT-2 — `tall-pantry` is not generated in this wave. SUPERSEDED the same day by E12** — E9 carries
  the supersession in full. ~~The owner was also offered *"later, with the long-run rework"* and chose
  the **plain deferral**, so the pantry is **open and unassigned**: it is not pre-assigned to the
  long-run wave, and a wave that generates one is overturning nothing but must first ask.~~ **The
  pantry is in wave 7D3**: under E12.1 it is the block's **door column**, and a block composes as one
  `tall-oven-tower` plus zero to two `tall-pantry`. The deferral is kept unedited above because it is
  the state of the question on the morning of 2026-09-14 and **the sequence is the point** — but a
  wave that reads it as live composes no pantry, and a block of two or three then has no door column
  and cannot be composed at all.

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
provided at least one cabinet stands between them.** **What is barred is ADJACENCY — a shared side
panel, two carcasses touching — and never proximity.** This is narrower than E10.1 as first drafted
and narrower than the withdrawn inference, and **it explains the photographs without calling them a
minority case**, which is why it is coherent rather than a softening: a separating carcass answers the
thermal reason **physically**, by breaking the conduction path, rather than by trading it against a
layout preference. **E10.1's two reasons stand unchanged, the thermal one first, and are still barred
from being traded away.**

> **The same sentence, in the owner's own words, three clauses later** — E13.5, 2026-09-14: *"i said
> that fridge should not be near oven but if they are not near then is not needed any special
> separator cabinet"*. **E10 and E13 say this in the same words deliberately**, so that a reader who
> lands on either cannot find a second, broader framing and adopt it. **Every loose phrasing of this
> rule — *"near"*, *"beside"*, *"the problem of having the oven near the fridge"* — is the same
> adjacency constraint, and none of them is a proximity rule.**

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

### E10.5 — does a base cabinet count as the separating cabinet? ~~Half of it the geometry settles; half of it is OQ-2~~ — **both halves answered by the owner in E13**

> **Answered 2026-09-14 (E13), and the geometry below turned out to predict the answer.** The owner
> ruled the same split this section derived: **a base cabinet is enough beside an oven under the hob,
> and is not enough beside an oven in a tall cabinet — there the separator must itself be tall.** The
> working below is kept because it is *why*, and because E13.4's minimum-width consequence is read off
> it.

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
the geometry does not answer whether that matters. ~~**It is stated as OQ-2 and not chosen.**~~ **The
owner chose, 2026-09-14: beside a tower the separator must itself be tall (E13).**

**It blocks nothing, and it is not reachable by this wave.** A generated kitchen never places a fridge
next-but-one to a tower: A1 fixes the fridge at a run's start, the block stands at wall A's free end,
and the measured minimum separation is **1800 mm — sink, preparation and hob**. E13's **branch 1**
becomes live only when a wave places a fridge **inside or beside a block**, which E10.4 permits in
principle and which nothing plans. **Recorded here so that wave does not re-derive it.**

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

### E13 — the separator's kind follows where the oven is: OQ-2, answered

**The owner, verbatim, 2026-09-14 — their own words, not a relay:**

> *"if oven is in tall cabinet than between fridge and that particular cabinet should be another tall
> cabinet, if the oven is under the hob being part of that cabinet with hob, than can be used any type
> tall or standard cabinet"*

**E13.1 — two branches, and the condition is *where the oven is*, never how wide the run is.**

| the oven is… | the separator between it and the fridge must be… |
| --- | --- |
| **in a tall cabinet** (`tall-oven-tower`) | **another tall cabinet.** Not a base cabinet, not a gap. |
| **under the hob**, part of the hob cabinet (`base-hob-oven`) | **any type — tall or standard.** |

**Do not flatten the two branches.** The owner distinguished them deliberately and the distinction is
**physical**: an oven under a worktop radiates within the base row, where a fridge's full height is
mostly *not*; an oven at chest height in a column radiates straight into the neighbouring column for
its whole depth. E10.1's thermal reason is the same in both branches — what changes is what it takes
to break the path.

**E13.2 — what this does to the existing record: it confirms, strengthens and relaxes, in that
order.** It **confirms** E10.4's rule that a fridge and an oven are never adjacent; it **strengthens**
branch 1 by constraining what the separator may *be*, where E10.4 only required that one exist; and it
**relaxes** branch 2 explicitly. **E10.5's open question is answered for both branches** — a base
cabinet is enough beside a hob-oven and is *not* enough beside a tower — and E10.5's measured geometry
is why: the tower's oven reaches above the 860 mm worktop line into the open backsplash band, which a
base cabinet does not cover, while the hob's oven sits entirely below it.

**E13.3 — what generation does today, and it is untouched.** In every kitchen this generator composes,
the oven under the hob is separated from `fridge-free` by the **sink and the preparation cabinet** —
two base cabinets, minimum 1800 mm. **That is branch 2, and branch 2 explicitly blesses it.** The
generator never places a fridge near a tower: the fridge stands where Amendment A1's reading order puts
it, at a run's start, and the block stands at wall A's free end (E2, E10.4.2). **So branch 1 is not
reachable by wave 7D3, no criterion changes, and no threshold moves.**

**E13.4 — the consequence for whichever wave first composes a fridge into a block, recorded now so it
is not rediscovered.** Branch 1 means a fridge column and an oven tower in one block imply a **third**
tall body between them — so such a block is **three columns minimum**, which by E3's measured table
needs **4500 mm of wall A** (5200 mm where wall B cannot hold the fridge). **Nothing in this record
adjusts a threshold on that basis**; it is stated as the consequence it is.

**E13.5 — the separator rule is conditional on proximity. ANSWERED by the owner, 2026-09-14 — their
own words, not a relay:**

> *"i said that fridge should not be near oven but if they are not near then is not needed any special
> separator cabinet"*

**The rule: E13.1's two branches govern only a fridge and an oven that are *near each other*. Where
they are not near — opposite ends of a run, with base cabinets between — no special separator cabinet
is required at all.** A tall separator is what makes **non-adjacency** true when the two would
otherwise touch; it is not a tax on every kitchen that contains both.

**This is the third time the same distinction has done real work, and E10 and E13 now say it in the
same words: what the owner refuses is ADJACENCY — a shared side panel — and never proximity.** The
earlier phrasing *"the problem of having the oven near the fridge"* (E10) was the loose form of this
same adjacency constraint, and E10.1 already carries the correction. **A later reader must not be able
to find two framings here and pick the broad one.**

> **The working that led to the question, kept because it is why the question was worth asking.** The
> broad reading — that any fridge and any oven in one kitchen need a tall cabinet between them — would
> have required **a tall cabinet mid-run in every kitchen that has both**, contradicting the owner's
> own *"not in the middle, but with the edges"* (E1, E2). That contradiction is what turned this from
> an implementation detail into a one-line question. ~~The wave that makes branch 1 reachable must put
> the specific case back to the owner.~~ **Struck: it has been put and answered. A record that asks
> for a ruling it already holds is worse than one that never asked.**

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
- ~~**No surface changes.** `generateKitchen` still has no production caller until wave 7F4, so none
  of this is visible in the app and none of it is provable by looking at it.~~ **Superseded
  2026-09-15: wave 7F4 has landed.** `apps/web/src/room/use-generation.ts` is the caller — its opening
  comment at `:3` names itself *"the generation algorithm's **first production caller**"* and it calls
  `generateKitchen` at `:395`. Everything Amendment E rules is now reachable from the app.
  - **E4's throw is reachable by a customer, not only by a developer.** E4 rules that a tower planned
    and then refused at insert time *"is a programming error and **throws**"*, and that ruling was made
    when a throw had no rendered path. It has one now: `composeKitchen` is the run's single error
    boundary and maps a throw to `{ outcome: "refused" }` (`use-generation.ts:384-390`), which drives
    frame 1F's **`failed` phase** and the customer-facing `room.compose.failed` notice. The hook says
    so itself at `:97` — *"`failed` covers both arms of criterion 35 — a `MINIMUM_NOT_MET` refusal and
    a throw"*.
  - **E4's ruling does not change, and for the reason it gives**: shipping a kitchen whose hob has
    drawers and whose oven does not exist is worse than a loud failure. What changes is only the claim
    that none of this is observable.
  - **So wave 7D3's QA owes a case for it.** A tower planned and then refused at insert time must be
    shown to surface as 1F's `failed` phase — never as a composed kitchen missing its oven, and never
    as a `composed` state carrying rows for a design that was discarded.

## Decision-record sweep — Amendment E

| Record | Standing after E |
| --- | --- |
| This ADR, **Amendment A1 / A2 / A4** | **Unchanged, and A1 explicitly wins over E2 where they disagree** (E8). The minimum kitchen stays a sink and a hob; the 599 mm leftover cap stands, and E6's absorb lowers a bare end to 0 mm, which it already permits. **Strengthened by E10:** A1's cooking order now carries a physical reason as well as an ergonomic one, and E2 is reclassified as A1's shape in an L-room rather than as an independent finding. **A1 is load-bearing for a thermal constraint** — a wave that re-orders a run must read E10 before touching it. |
| This ADR, **Amendment C** | **Extended, not altered.** The drop order and F7's reserve are untouched; C's *"never above the fridge"* becomes E7's derived rule, with the fridge as its witness. **C's top-row exclusion is now owner-confirmed** (E11) rather than inherited, and its eventual replacement is *taller uppers*, not a composed top row. |
| [0048](0048-the-pantry-column-is-the-one-resizable-column.md) — **the only row for 0048; read no other** | **Untouched, and now load-bearing.** The pantry is the one `'fit'` full-height row, so it both supplies the block's door columns (E12.1) and — standing outermost under E12.2 — dissolves E6's merge hazard. **Generation becomes its first automatic caller**, and its 400–800 bound plus its 500 mm door-count threshold are exercised at whatever width the free end gives it. Nothing in ADR 0048 changes; a wave that narrows that bound now changes generated kitchens. ~~A second row here read *"Untouched — E9 defers the pantry without ruling on it"*~~ — **struck 2026-09-15**: that was the pre-E12 reading, E12 reinstated the pantry the same day it was deferred, and a sweep table is what a later wave greps instead of reading the prose. |
| [0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md), second reading | **Unchanged, and its scope clarified by E12.3.** *"Minimum costs less"* governs which appliances and roles a kitchen gets; it does not mean a full-height run may never cost more than the cabinets it displaces. The owner chose the pantry with its ~808 000 against ~693 000 in front of them. |
| This ADR, **Clarification 2026-09-12** | **Unchanged.** E5 adds a third stage above the second and enters neither of the first two. |
| [0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md) | **Load-bearing for E8**, and the reason the cheaper kitchen is the free-standing fridge. |
| [0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md), [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | **Unchanged, and the cause of E6.** The merge is correct; E6 removes the empty tile it would merge with rather than capping the merge. |
| [0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) decision 3 | **Reused** for E3 clause 4: a 2200 mm body in a 2200 mm room fits. |
| [0101](0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md) | **Now reached in composition**: a generated tower is the first composed full-height member with recorded space above it. Nothing is composed into that space. |
| [0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md) | **Applied** to the tower's declared width and height. |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment B | **Unchanged.** No bound moves; E3 clause 4 reads the engine limits and changes neither policy. |
| [0109](0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md) | **Not reached.** Presets are recorded documents; this amendment governs generation only. Whether an owner-authored preset may contain a tall unit is unaffected — it may, because the owner authors it by hand. |

## Amendment F — 2026-09-15: a long storage run is composed, not repeated

**This record carries [ADR 0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)'s
pointer line, which that record's *Consequences* names as owed by this amendment**: generation is
responsible for a kitchen that is correct, complete and cheap; the owner's taste enters through a
preset. Every ruling below states which side of that line it falls on.

**Every claim in this amendment carries its evidence tier.** *Owner's words* — quoted verbatim from a
dated statement. *Source-verified* — re-read in the tree at HEAD while writing this, with the file and
line named. *Measured* — produced by a sweep against the built planner, with the sweep's population
stated; **measurements taken by the 7D4 planner on 2026-09-15 are marked as theirs and were not
re-run here**, because re-running one means building `dist/` in a tree that is frozen for review.
*Inference* — the coordinator's or the architect's derivation from the two above, never the owner's.

### F0 — this amendment was written after the code it governs, and says so

*(Dated for the day its rulings were made and the day S1 landed. The drafting session ran past
midnight into 2026-09-16; no ruling below was made on the later date.)*

The wave's plan makes Amendment F **slice S0** and rules that *"no other slice starts until it exists
and is reviewed"* (M7 plan, *Wave 7D4 — dispatchable punch list*, *Slices*). **S1 was dispatched
without it.** The S1 implementer found the omission themselves — `grep "Amendment F"` against this
file returned nothing — reported it rather than letting it surface at review, and proceeded only
because S1 composes no design: it adds one pure leaf and one export line, and no generated kitchen
changes. **The order was wrong, and the omission was the coordinator's rather than the implementer's.**

**What follows was therefore written with `packages/configurator-domain/src/generation/body-choice.ts`
already in the working tree**, and every clause below was checked against that file rather than
against the plan's draft of it. A record that concealed the order it was written in would be worth
less than one that admits it, because a reader who does not know the code came first cannot tell
which clauses are **rulings** and which are **ratifications**:

- **Rulings the code does not yet reach** — F1, F2, F3, F4, F5, F9, F10, F11, F12.
- **Ratifications of what S1 built, each saying so in its own text** — F6, F7, F8, F13.
- **Corrections of the plan's own criteria, made here because the implementer proved them
  unsatisfiable as written** — F14.

**The part of S0's rule that still has force:** no slice after S1 starts before this amendment is
reviewed. S2 is the slice that changes generated kitchens, and it has not started.

### F1 — the owner's words

*(Owner's words. Four statements, all 2026-09-14, transcribed as given including their typing. The
M7 plan reads each into numbered rules R1–R11; this record quotes them so the reading is checkable
against the source rather than against another reading.)*

**The first — the balance, the variety goal, and the cutlery reason:**

> *"drawers are often preffered and in many cases there are multiple drawers cabinets but if there is
> like space for 6 cabinets will be like 3 with drawers and 3 with doors. Clinets with money preffer
> drawers, those that what to spend less doors and this is logic but out goal is to use maximum
> cabonets types possible. the rule that dishasher is afetr sink is right but drawers often ar before
> hob, because during cutting and preparations you take from drawer the knife, spoon, forks and other
> kitchen cutlery"*

**The second — drawers before the hob is a preference, not a rule:**

> *"scan the before and after the oven and the hob. It's not a rule that it's always only before. But
> in majority of the cases, is before. But if the kitchen is white, you can have and before and after
> also drawers. It's not like a hard rule."*

**The third — the wall level, and the top row's stretch-ceiling reason** (quoted in full in the M7
plan; the two clauses this amendment rules on):

> *"here in Moldova people prefer to have closed cabinets. Meaning, very often, there are only door
> cabinets… The top level, not the middle, but the top level, in majority of the cases are lift
> cabinets, mainly because you lift them from down up… I use on the ceiling the extendable material
> that is easy to be damaged. So having the lift cabinet at the top level includes less risk for them
> to be damaged, because if I would use a door, by opening and closing it, the top corner of the door
> has a big probability to damage the material on the ceiling."*

**The fourth — where effort belongs:**

> *"People that don't have space, in majority of the cases, don't have money and prefer the modular
> kitchens like IKEA. People that came to manufacturers to do the custom made kitchens, in majority of
> the cases, they have much more space. And this scenario when they don't have space for all kitchen
> electronics and cabinets, it's very rare."*

**A fifth statement the same day withdrew the wall-row lift on cost, and is quoted at F9.**

### F2 — this wave changes a body's identity and never its width

**The ruling.** Every planned width, every slot count, every remainder, the surviving core and the
wall cut stay exactly what Amendments A–E produce. **Only `buildId` changes**, and only on the
modules the storage cycle composed and on the preparation role. Two rules follow, and they bind every
later wave that composes a body rather than only this one:

1. **Every generated base module stays on the 600 mm grid.**
2. **A body that cannot be built at its planned tile width is not generated.**

**This is derived from the engine, not from taste** *(source-verified at HEAD)*. The shell is tiled at
the plan's own boundaries and then merged: `widestBlockFrom` grows a run of adjacent empty columns
while the running total stays **at or under** `MAX_EMPTY_COLUMN_WIDTH_MM`
(`src/merge-empty-columns.ts:264-282`, breaking on `totalMm + candidate.widthMm > 800`), and the
constant is declared at `src/module-grid.ts:53`. **The cap is inclusive**: a pair summing to exactly
800 merges, 801 does not. A varied-width plan therefore loses its own tile boundaries before any body
is inserted, `plannedVoid`'s exact-`startMm` lookup then throws, and a discrete-width body that did
find an opening would be built centred with a sliver at each side.

**The bottle cargo is the worked case, and it is recorded here because the position is the *witness*
of the rule and not the rule** *(arithmetic source-verified from the cap above; the derived column
runs measured by the 7D4 planner, 2026-09-15)*:

| Planned run on wall A | What the merge does | Verdict |
| --- | --- | --- |
| a **300 mm** cargo between two 600s | `600 + 300 = 900 > 800` — neither neighbour can take it | **survives**; the planned boundary is intact |
| a **200 mm** cargo beside a 600 | `600 + 200 = 800`, and the cap is inclusive | **destroyed**; the hob's tile swallows it and `plannedVoid` throws |
| **two 300 mm cargos adjacent** | `300 + 300 = 600 ≤ 800` | **destroyed**; the pair merges into one 600 and the run re-tiles |
| a **300 mm** cargo at the free end | survives only while the leftover tile beside it is ≥ 500 | **conditional** |

**The general rule, and it is the thing to carry: a 300 mm bottle cargo survives if and only if both
its neighbours are at least 500 mm wide.** The owner's *"often just after the hob"* selects the same
slot from an unrelated premise — you reach for oil while cooking — and **two independent authorities
agreeing on one slot is the strongest form this rule can take.** A later reader who remembers only the
hob and generalises the placement will break the merge; the arithmetic is what must stop them.

**The three storage bodies' width bounds, stated as bounds and never as equivalence**
*(source-verified at HEAD, `src/catalog.ts`)*. All three declare `widthFlex: 'fit'` and all three
build at exactly 600, which is every width this generator plans. **They are not interchangeable below
it:** `base-3drawer` (`:734`) and `base-panbank` (`:744`) are plain `baseCabinet(…)` rows and inherit
`CABINETRY_WIDTHS` (`:193`, spread at `:605`), while `base-cabinet` (`:717-731`) overrides that with
`HINGED_CABINET_WIDTHS` and `minWidthMm: HINGED_CABINET_MIN_WIDTH_MM` = **200** (`:151`, `:177`) on
ADR 0026's mechanism. **So the drawer rows floor at 300 and the door row at 200.** It is harmless
today, because the leftover rule plans only whole 600 mm modules; it is the constraint a later wave
that plans a narrower storage module would break. *(`body-choice.ts`'s head comment calls every member
*"a plain `baseCabinet(…)` row"*, which is exact for the two drawer rows and imprecise for
`base-cabinet`. The operative half — `'fit'`, and 600 mm exactly — holds for all three. **S2 corrects
the sentence; it is not a defect, because nothing reads it.**)*

### F3 — the cycle, and why no ratio is written down

> **SUPERSEDED BY AMENDMENT G, 2026-09-16, by the owner.** *"Is not like one with drawers one with
> door, pretty often are 3 with drawers then 3 with doors — is not like in chess."* **The cycle was the
> coordinator's derivation from a proportion the owner gave; the owner has now given the placement rule
> directly, and a placement rule beats a derivation from a proportion.** F3 is **struck in place, not
> deleted**, because what changed is the ruling and not what the owner said — F1's words still stand
> and G1 is the next thing they said. **What survives F3 is its *reasoning*, and it survives intact:**
> no ratio constant is written down, and the split is a consequence rather than a target. Amendment G
> reaches that same end by a better route — the ratio now falls out of the room's own shape. **Read G3
> before building anything from the text below.**

```
[ base-3drawer , base-cabinet , base-panbank , base-cabinet ]
```

**There is no ratio constant, and writing one would be the defect.** *Half* is a consequence of the
cycle's shape rather than a number any module states. At every even slot count the split is exactly
even; at every odd count **drawers carry the extra**, because index 0 is a drawer and the owner names
drawers as the preferred option. Six slots give **three and three — the owner's own example, derived
rather than special-cased.** A fourth drawer row extends the cycle and the balance follows with no
figure edited. **Refused:** computing `floor(n / 2)` and distributing it — two authorities for one
fact, and the distribution step is where a run of identical cabinets comes back.

**Why the shape is four steps and not two.** [ADR 0033](0033-door-count-is-derived-from-width-not-declared.md)
merged `base-1door` and `base-2door` into one row whose door count follows its width, so the catalogue
holds **exactly one** door-front base body. The owner's *"maximum cabonets types possible"* therefore
cannot be answered inside the door half; it is answered in the drawer half, where three shallow
drawers and two deep pan drawers are genuinely different products. *(Measured by the 7D4 planner,
2026-09-15, by enumerating `buildKitchenLBodyCatalog` at base height: the **general storage** rows
buildable at 600 mm are exactly three.)*

**Balance governs; variety is maximised subject to it.** With one door body and two drawer bodies the
4-cycle reaches every available type while holding an exact even split, so the two goals **cannot
conflict in this catalogue** — that is measurable rather than philosophical. Stated for the catalogue
that will exist after backlog 66, and **not built for** ([ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)):
the balance is the one thing the owner put a number on. **The trigger is the arrival of a fourth
general storage row**, and the notification is a test going red, not a branch waiting for it.

**This clause is where [ADR 0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)
decision 4 must be read with its own §*Where the boundary is genuinely unclear* #1** *(source-verified
against 0117 at HEAD)*. 0117 forbids a criterion that asserts *"a ratio, a share or a frequency
band"*. A criterion of this wave asserts a **balance**, and a balance is a ratio. They do not conflict,
and 0117 says why itself: it names this exact pair — the owner's *"3 with drawers and 3 with doors"*
against their 20–30 % lift band — calls them *"formally identical"*, and records that the first is
being built and the second is not, on a discriminator that is **not cost**. **The rule, stated so it
can be applied: a criterion may assert a proportion that is a consequence of a composition the owner
ruled; it may not assert a proportion observed in the owner's practice.** A reviewer who flags the
balance criterion against 0117 decision 4 has found this paragraph, not a defect.

**The order within the cycle is the coordinator's derivation and the owner has not seen it.** The
owner gave ergonomic anchors — cutlery before the hob, oil after it — and a proportion; they never
gave an order for the storage run itself. **`Q-7D4-1` is open with the owner** (put 2026-09-15; the
7D4 dispatch also calls it *Q-D4-1* — one question, two names). It confirms the cycle's **starting
end**, not its shape, so **no slice waits for it and the wave is not blocked**; the amendment is built
on the stated default at F4 and the alternative costs one line at the leaf's caller plus a new pair of
phase witnesses.

### F4 — the sequence is per kitchen, and the phase carries across the corner

> **SUPERSEDED BY AMENDMENT G, 2026-09-16, with F3 and for the same reason.** There is no cycle left
> to advance, so there is no phase to carry. **Struck in place, not deleted.** Two things in it are
> **not** superseded and are carried into G by name: the **reading order across the corner** is
> Amendment A1's and is untouched; and `storageBodyAt`'s **index discipline** — a slot is addressed by
> a whole non-negative position — survives as the shape any per-slot answer takes. **What dies is the
> claim that a slot's body is a function of its index alone.** Under G it is a function of **where the
> slot stands relative to the sink and the hob**, which is a different question asked of a different
> input. **Read G3 and G4 before building anything from the text below.**
the storage sequence is: **wall B's storage from its free end toward the corner** — the reverse of
wall B's spatial array — then **wall A's storage from the corner toward its free end**, in spatial
order.

**Why per kitchen and not per wall.** The owner's number is a claim about a kitchen (*"if there is
like space for 6 cabinets"*), not about an engineering wall split the customer never sees; the corner
is always continuous worktop, so the L is one run that turns rather than two runs that meet; and a
per-wall restart gives three-and-three slots a **4 : 2 drawer majority**, contradicting the owner's own
example. **Refused: restarting the cycle on each wall.** Its one real advantage is stated rather than
hidden — it would make the body standing beside the hob deterministic.

**The default this amendment rules, pending Q-7D4-1:** the sequence starts at **wall B's free end**, so
index 0 stands beside the fridge. *(Measured by the 7D4 planner over 211 551 placed rooms: a drawer
body stands next to the fridge in **48.0 %** of them, and in **45.1 %** every cycle slot in the kitchen
is on wall B while wall A carries only the core and the tall block. Variety is visible on **both**
walls in only **19.1 %**.)*

**The accepted awkward boundary, ruled rather than discovered later: wall A's phase is set by wall B's
storage count.** Wall B storage even → wall A's first storage slot is a drawer body; odd → a door body.
**So lengthening wall B can change which body stands nearest the hob on wall A.** This is inherent in
any deterministic pattern over a single sequence, it is invisible within one kitchen, and **it is
asserted by name** so it is never mistaken for a defect. Witness pair, measured by the 7D4 planner:
**5700 × 4100** (wall B storage 4, even) and **5100 × 4700** (5, odd).

**Per-wall deviation is bounded.** A wall holding *m* of the sequence's slots takes `⌈m/2⌉` or `⌊m/2⌋`
drawer bodies, so **no wall is ever off half by more than one body**.

**One index map, and no other** *(the M7 plan's D13; ruled here so it is not re-derived)*. The cycle is
per kitchen and wall B's slots are consumed in the reverse of their spatial order, so:

```
bCount = wall B's cycle-slot count
storage:B:i  ->  sequence index  (bCount - 1 - i)   // i spatial, corner outward
storage:A:j  ->  sequence index  (bCount + j)       // j spatial, corner outward
```

**Must not:** a third call site; a sequence index recomputed outside the planner; **the wall-B
inversion expressed as a `reverse()` on the *placed* array**, which would leave the plan's ids
disagreeing with its bodies. **Read that last prohibition as covering wall A too**, where the
consequence is not a mis-ordered cycle but an **inverted tall block** — the oven tower outermost and
the absorbed width on the innermost column, which E12.2 forbids.

### F5 — the preparation cabinet is a drawer cabinet, and that is a default rather than an invariant

**Amendment A1's interim data is amended, not its order.** A1 already places a preparation cabinet
between the sink and the hob for the owner's own cooking-order reason, and calls its own body list
*interim data*. The owner has now named what that role's body should be — *"during cutting and
preparations you take from drawer the knife, spoon, forks and other kitchen cutlery"* — so the
preparation row's `buildId` becomes **`base-3drawer`**. **This adds no stage and no role.** The role's
width (600), its position, its `required: false` and its place in the drop order are all unchanged,
and both bodies are `'fit'`, so the change is width-neutral in exactly the way E4's hob substitution
was. **Must not:** a new *"drawers"* role inserted before the hob. A1 names one cabinet there and the
owner named what it should be.

**What the owner's second statement forbids, and it cost this wave a criterion that had already been
drafted.** *"It's not a rule that it's always only before… It's not like a hard rule."* So:

- **Permission and preference are separated.** *Preference:* where only one drawer bank fits, it goes
  before the hob — which is what the preparation role already is, so the default costs nothing.
  *Permission:* **a drawer body standing after the hob is correct, expected, and must not fail a
  test.**
- **No criterion may assert *"no drawer after the hob"*.** One of exactly that shape was drafted for
  this wave and **deleted, not weakened**. Re-adding it is a finding.
- **This composer already generates drawers after the hob**, in roughly half of all rooms: wall A's
  storage follows the hob and F4's phase puts a drawer body in its first slot whenever wall B's count
  is even. **Before the owner softened the rule this was a latent contradiction nobody had noticed**,
  and what caught it was asking — not a test, and not a re-reading of the composition.

**In 90.0 % of placed rooms the preparation cabinet is what stands immediately before the hob**
*(measured by the 7D4 planner)*. In 5.1 % it was dropped and the sink stands there; in **4.9 %** a
wall-B storage slot does, because the wall cut put the hob alone on wall A. **No rule is added for that
4.9 %** — it is a pre-existing consequence of A1's cut and is raised as a question rather than patched.

### F6 — a module is identified by what composed it: never by its role, and never by its width

**This is the amendment's most load-bearing clause, and it ratifies what S1 built.**

**After Amendment E the word *storage* has two referents inside one plan.** The cycle's slots carry
`role: "storage"`, and so do the full-height columns of the block at wall A's free end
(`src/generation/generation-priorities.ts:222-230`, `tallColumnItems`) *(source-verified at HEAD)*.

**The columns carry it deliberately, and the role must not be changed.** The reason is E5 clause 2 —
*the leftover fill is unchanged in count; the same free end yields the same number of 600 mm modules
and the identity of the free-end module changes* — applied to the row model a customer sees. **A
column stands exactly where the leftover rule was going to stand a storage cabinet, so what changed is
that module's identity and not the wall's plan.** *(Source-verified at HEAD, and this is the clause's
real footing: `apps/web/src/room/generation-model.ts` builds frame 1F's row set as
`GENERATION_PRIORITIES` plus **one aggregate storage row**, and `statusOfRoleIn` folds every step
carrying a role onto that role's single row (`:127-157`). `GENERATION_ROW_LABELS` is total over
`GenerationBaseRole` and a new member without a label is **a compile error**, not an unlabelled row
(`:60-72`). So a role of the block's own is a new row, a new message key and eight translations.)*

**A correction of citation, made rather than transcribed.** The 7D3 code comment and the 7D4 plan both
cite this as **"E5.2"**. **The string `E5.2` appears nowhere in Amendment E** *(source-verified: the
amendment's E5 is unnumbered prose with three clauses)*. The substance is E5's clause 2 and the
reading is sound; the **role** and the **row set** are the 7D3 implementer's derivation from it, not
E's words. **Amendment F now rules it directly**, so the convention has an authority of its own and
later readers stop chasing a section number that does not exist. *Existing citations of "E5.2" are
correct in substance and should be re-pointed at F6 as files are touched; none is wrong enough to
justify a sweep.*

**Why neither the role nor the width can discriminate, and both look as though they can** *(measured by
the 7D4 planner over 211 551 placed rooms of the approved L policy on a 10 mm grid at 2600 mm — wall A
900–6300, wall B 1000–5100, 222 351 swept; **not re-run while writing this amendment**)*:

| The rule, scoped by `role === "storage"` | Rooms it fails on, **against output that is correct** |
| --- | --- |
| no two adjacent storage slots share a build id | **69 491 — 32.8 %.** Every three-column block is `tall-oven-tower, tall-pantry, tall-pantry`; the outer two are adjacent and identical. Witness **4500 × 1700**. |
| no storage slot whose width is not 600 | **31 480 — 14.9 %.** E6.2's outermost column absorbs the free-end remainder and is planned at 600 + *r*, up to 800. Witness **3910 × 1700**, `column:A:1` at 610 mm. |
| distinct storage build ids = `min(3, slotCount)` | every room with a block and no cycle slot: two distinct ids against an expected zero |
| the drawer/door balance | `tall-pantry` is a door body and `tall-oven-tower` is neither; both would enter the count |

**Scoped by provenance instead, the same four rules pass on every one of the 211 551 placed rooms,
with zero failures.** *(Measured by the 7D4 planner.)* **The rules were right and only their subject
was wrong.**

**The failure therefore presents as a defect in a closed wave, and the first instinct will be to edit
7D3. It is the wrong one.** That is why this clause is a ruling and not a note.

**The ruling, in four parts:**

1. **Wherever a rule of this wave says *storage slot*, it means a module the storage cycle composed.**
   The block's columns are out of the cycle, out of the balance, out of the variety count and out of
   the adjacency check — and each rule says so in its own text rather than leaning on this paragraph.
2. **The discriminator is one exported predicate, declared once.** `isCycleStorageSlot` in
   `src/generation/body-choice.ts` is **the only thing in the repository that knows the `storage:` /
   `column:` id convention**. A reader that writes `id.startsWith("storage:")` for itself is one more
   reader of an undeclared contract, and is refused.
3. **The predicate takes a structural shape, not the planner's type.** S1 declares
   `ComposedModuleIdentity { readonly id: string }` rather than importing `PlannedGenerationBase`,
   which keeps the leaf's zero-import floor *(source-verified: `body-choice.ts` imports nothing)*.
   **Ratified**: a leaf that answers one question about one field should not depend on the module that
   asks it.
4. **The role does not change, and changing it would be the defect.** This wave must not *"fix"* the
   ambiguity by giving the block a role of its own; it fixes it by naming the subject precisely.
   **Must not:** a second discriminator anywhere, including a new field on `PlannedGenerationBase`.

**The family this belongs to, because it is one trap and not four.** *Identifying a thing by something
that correlates with what it is, rather than by what it is:* **shape** — the `column` band sweeping in
`fridge-free`, met three times in 7D3; **role** — the case above; **provenance held by convention** —
`storage:` as a bare string at each reader; **position** — the tower's innermost-ness, held by an array
index and a doc comment. **The correction is the same each time: name the thing, and let one module own
the name.**

### F7 — the leaf exports no drawer/door classifier, deliberately

**The catalogue's own `fronts.drawers` is the authority for what a row's front is**, exactly as it is
for a width. A classifier living beside the cycle would be the **second authority**
[ADR 0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
forbids: it would pass against a cycle picking the wrong products, because both sides of the assertion
would come from the same hand.

**Ratified as built** *(source-verified at HEAD)*: `base-3drawer` declares `fronts: carriesDrawers(3)`
and `base-panbank` `carriesDrawers(2)` (`src/catalog.ts:734-748`), while `base-cabinet` declares
`doorLeavesFollowWidth(…)` and no drawers (`:717-731`). S1's own suite classifies by reading
`entry.fronts.drawers > 0` off the catalogue and **throws** on a row that declares no front population
rather than reading it as zero drawers.

**The binding rule, and it is the reason this clause is a ruling rather than a description: the
balance property of slice S4 reads the catalogue.** It may not carry a hand-written list of drawer
rows, and it may not infer a front from a `kind`, a band or a handle edge — that last inference is
[ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md)'s recorded mistake.
**Must not:** a `isDrawerBody(buildId)` exported from `body-choice.ts`, in production or in a test
helper.

### F8 — the leaf writes no id

**`storagePriorities`' `Array.from` stays the one writer of `storage:{wall}:{n}`**, and the leaf stays
its one reader. The leaf declares the prefix it reads and nothing else: it does not format an id, does
not take a wall, and does not know how a run is laid out. **Two sites, one writing and one reading, is
the smallest shape this convention can have** — and F14 rules how that is guarded, because *"exactly
two"* turned out to be false in the tree.

### F9 — the wall row composes exactly what it composes today, and no lift is generated

**The rule** *(owner-ruled 2026-09-14; it replaced two earlier rulings the same day)*: every
middle-level upper is a `wall-cabinet`, the hood stands over the hob, nothing stands over the fridge or
over a full-height body, and **neither `wall-lift` nor `open-shelf` is ever generated.** That is the
shipped behaviour, so **this wave's only obligation to the wall row is to assert it** — no production
code changes for it.

**The sequence is recorded honestly, because it narrowed three times in one day and each step was the
owner's own.** They first described the wall level with proportions — doors the majority, lifts
20–30 %, open shelves under 5 % — and gave a **placement reason** for a lift above the sink: you wash
a plate and lift it straight up into the cabinet over the sink. Asked whether the band was observed,
they answered *"20-30% was a rough impression, not measured, clear statistic… is just my impression."*
Then, unprompted, they priced it and ruled it out:

> *"and lift is above the hob. And under it, in that cabinet, is the… how it's named. under it is
> incorporated hood. lift mechanism are very expensive. So for sure the default will be the doors."*

**None of the three contradicts the others, and a fourth statement explains all of them** — *"I will
add it, and we'll save it as a preset"*. **Read through ADR 0117 this is not a reversal at all:** the
lift was always a judgement call, and judgement calls enter through presets. **A description became an
admitted impression became a priced decision.** A reader who sees only the last step will not
understand why `wall-lift` appears nowhere in a plan that discusses it at length.

**What is ruled, and what is merely recorded:**

- **Ruled — `open-shelf` is never generated.** Under 5 % is below the level at which a default serves
  anybody, it is a **different product** rather than a variant (no front, `canFinish: false`, and it
  follows the kitchen's colour with no control of its own), and putting open storage into every kitchen
  is a taste decision made on the customer's behalf.
- **Ruled — no criterion asserts a ratio band**, for lifts or for open shelves. The band was an
  impression the owner withdrew as one, and 0117 decision 4 forbids deriving a rule from it.
- **Recorded as guidance, not as a target — the proportions themselves** (roughly 20–30 % lifts, under
  5 % open shelves). They describe the owner's practice and bind nothing.
- **Recorded and not built — the top row's lift rule.** The stretch-ceiling reason comes first, because
  it is physical and it survives the withdrawal above on its own: **a hinged door's top corner is
  likely to catch and damage a stretch ceiling on opening, and a lift opens upward and away.** The top
  row stays excluded (E11), so this is handed to whatever wave reinstates it. **Trigger:** the first
  wave that composes a top row.
- **Recorded because it is load-bearing elsewhere — a lift mechanism needs roughly 120–165 mm of
  clearance above the cabinet to swing up** (4.75–6.5 in, varying with door height). It constrains
  nothing now and it bites in the top-row hand-off, where the rule above asks for lifts against a
  ceiling. **It must not be lost with the withdrawn rule.**
- **Recorded as a catalogue gap, not a request — in the owner's practice the cabinet above the hob is
  a lift with the hood built inside it.** The product does not build that: `hood` is a body of its own
  and `wall-lift` carries no appliance. It belongs with backlog 66's tall-body gap.

**A wall row of identical `wall-cabinet`s is what the owner builds, not a failure to compose.** They
described the **base** run as varied and the **wall** run as doors — *"for sure the default will be the
doors"*. A later reviewer who counts identical uppers cites this paragraph rather than raising it.

**What the search found, recorded so nobody spends it again:** there is **no published statistic** on
lift-versus-hinged prevalence. What it did return is better than a number — hinged doors are the
industry baseline and lifts are specified by cabinet size, position and configuration (Blum's AVENTOS
range is organised exactly that way). **The trade's own logic is placement and the owner's final answer
is cost; neither is a proportion**, so the refusal to build a ratio rule is vindicated from two
directions.

### F10 — what the variety costs, so the choice is a knowing one

*(Derived by the 7D4 planner from the sample price book's own formulas, 2026-09-15; not run through the
pricing engine.)* At 600 mm: `base-cabinet` **396 000** minor with two leaves, `base-panbank`
**448 000**, `base-3drawer` **480 000**. **The eight storage slots of the largest approved room go from
3 168 000 to 3 440 000 minor — +8.6 %.** One `wall-lift` in place of a `wall-cabinet` would have cost
**+53 000** minor; it is recorded for the same reason, and it is not built.

**The number is in this record deliberately.** E12.3 treats the `tall-pantry` choice as knowing
*because the price was in front of the owner*, and this one has not been. **The owner's variety goal
costs money, and this amendment makes that visible rather than discovering it later.** If they push
back, F3 is the answer: the cycle holds no ratio constant, so a cheaper cycle is a one-line change
rather than a redesign. *(A confirmation is open with the owner; it does not gate any slice.)*

**This does not conflict with E-era *prefer the cheaper minimum*, and the reason is recorded rather
than assumed.** That principle governs **how many** bodies a kitchen gets — a second oven, a fridge
housing. **This amendment governs which body fills a slot that exists either way.** **A later wave that
reads the cheaper-minimum principle as covering body choice is overturning this paragraph and owes a
dated decision.**

### F11 — effort belongs in the long run, and the minimal kitchen stays deliberately simple

**The owner's fourth statement is a priority, not a rule.** People without space mostly buy modular
kitchens; people who come to a manufacturer for a custom kitchen mostly have space, so the
cannot-fit-everything scenario is *"very rare"*.

**Measured, and the measurement agrees with them** *(7D4 planner, over the same sweep)*: **4.9 % of
swept rooms are refused outright; of the placed, 86.6 % keep the full core, 8.3 % drop only the fridge,
and 5.1 % drop both the fridge and the preparation cabinet** — the sink-and-hob-only kitchen. **A
uniform sweep over-weights tiny rooms relative to a self-selected custom-kitchen customer, so the real
share is lower than the count.** Reported this way because an impression and a count are different
things and a record should say which it has.

**Where a choice arises between a rule that composes a 6300 mm wall well and one that handles a
1700 mm wall gracefully, the long wall wins.** Degradation stays correct and stays unsophisticated;
nothing tunes it. **The minimum kitchen is not reopened** — sink and hob stands (A2, ADR 0108
Amendment B). **This is recorded so the simplicity is not read later as an oversight:** a reader who
finds the thin-kitchen path plain and *"fixes"* it is undoing a deliberate decision with the owner's
reasoning behind it.

### F12 — recorded here, built in a later wave

**Two bodies change the run's arithmetic rather than a body's identity, and both go to wave 7D5**:
the **dishwasher** (600 mm) and the **bottle cargo** (300 mm). The rulings are the owner's and are
recorded where they were worked out; the wave that builds them is not this one.

- **The dishwasher is a core role, not a storage slot, and plumbing is why.** It drains into the sink's
  waste and takes the sink's supply, so the two carcasses have to abut; storage stands only at a run's
  ends, which is nowhere near the sink in most rooms.
- **Adjacency is a rule, not a preference** *(owner, 2026-09-14, on their second answer the same day,
  which binds; re-confirmed 2026-09-15)*: **either side of the sink, across the corner counts, and the
  fallback is omission rather than displacement** — *"it should not be near only if is totally
  missing"*. `fridge → sink → dishwasher → preparation → hob` remains a **permitted** layout; it is no
  longer *the* layout and nothing may assert it.
- **Frequency: generate one whenever it fits** *(owner-ruled 2026-09-14; recorded from a relay, not
  verbatim — they were offered "only in larger kitchens" and "never, the customer adds it" and took
  neither)*. **No new threshold:** the existing attempt ladder already computes *"whenever it fits"*.
- **The drop order gains a member and Amendment C's F3 is extended, not overturned.** The ruled
  relation is the owner's — **drawers beat the dishwasher**, and their own 3700 mm kitchen kept the
  fridge and gave up the dishwasher. **Where it lands in the ladder is the coordinator's derivation
  from that relation:** leftover storage, then the dishwasher, then the fridge, then the preparation
  cabinet; sink and hob never. **Every relative order C ruled is preserved and the new member is
  inserted between two of them**, which is what stops this from silently overturning an owner ruling.
- **One honest wrinkle.** Because the dishwasher takes a leftover module, the trade in an L with
  leftover *can* be a dishwasher against one storage drawer slot. **The owner's example is not that
  case** — their run was linear and full, so what they gave up was the preparation drawer. The rule is
  ranked against the cabinet they actually named.
- **It costs 320 000 minor per fitting kitchen**, and **it will move the block-threshold table by
  exactly one module.** Whoever builds it **restates** the affected assertion of 7D3 and records the
  restatement here; **a quietly edited 7D3 assertion is a finding, not a fix.**
- **The bottle cargo is recorded with its placement and its arithmetic** (F2). Two further reasons
  against generating one today, both source-verified in the tree: `src/catalog.ts:205-209` records that
  the cargo's exact member set is **not established** (backlog 2), and `sample-price-book.ts:109`
  records that its hardware is **knowingly under-priced**. So generating one puts an unestablished
  width and an admitted price gap into every kitchen that gets one. **Neither is a reason to lose the
  owner's rule**, which is why the placement is written down here.

**A discrepancy of record, flagged and not resolved here** *(source-verified in the M7 plan at HEAD)*.
The plan's D7 marks the ladder question **closed by the owner on 2026-09-14**, while the milestone's
wave table still lists it as **open and blocking 7D5**. **Both sentences are in the same document and
they cannot both be current.** It affects **no 7D4 slice**, so this amendment records the conflict
rather than picking a side: **7D5's coordinator rules on it before dispatching, and says which reading
they took.**

### F13 — a leaf alone cannot be orphaned: `src/index.ts` is part of every leaf slice in this package

**Ratifies an S1 change the plan did not anticipate, and the reason matters more than the change.**

`packages/configurator-domain/tsconfig.build.json` sets `"include": ["src/index.ts"]`, so the build
emits **only that file's import closure**. `packages/configurator-domain/tests/dist-module-graph.test.ts:75-89`
then asserts that **every** `src/**/*.ts` has a `dist` counterpart and that no source is newer than its
output. *(Both source-verified at HEAD.)* **A module nothing imports is therefore never emitted and the
suite fails** — measured by the S1 implementer as `dist is missing generation/body-choice.js`; not
re-run here, because doing so means building `dist/` in a tree frozen for review.

**So `src/index.ts` had to change, and not for the reason the plan gave.** The plan's file list permits
touching it *"exports only, if the new leaf's type is needed outside"*. **That premise is false and the
obligation is unconditional:** a new leaf under `src/` must be reachable from the entry point whether or
not anything outside the package wants it. S1's change is one line — `export * from
"./generation/body-choice.js";` *(source-verified)*.

**This binds every future slice in this package that adds a leaf before its caller**, which is a shape
this project deliberately favours. **The problem has occurred**, so recording it is not
[ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)
machinery for a hypothetical — it is the instruction that stops the next planner writing a
leaf-alone slice whose file list forbids the one edit that makes it build.

### F14 — two of wave 7D4's criteria could not pass as written, and the form each now takes

**Both were proved unsatisfiable by the S1 implementer against the tree, not argued.** Neither
correction weakens what the criterion was for; one narrows a subject and one **strengthens** a count.

**F14.1 — the one-declaration-site rule is scoped to *composed-body declaration sites*.**

The criterion required `base-cabinet` to appear as a literal in **exactly one module** under
`src/generation/`. **It is false at HEAD and this wave cannot make it true**
*(source-verified)*: `src/generation/shell-design.ts:105` declares
`const FLOOR_TILE_SOURCE = "base-cabinet"`, and `shell-design.ts` is in this wave's
**must-not-change** set.

**Verified before scoping it away, because if that literal reached a composed placement by any path the
criterion would be right and the wave wrong** *(source-verified, every site re-read at HEAD)*.
`FLOOR_TILE_SOURCE` is assigned only to `TileRun.source` (`:256`) and is consumed at exactly three
places: `tileDepthMm(run.source)` (`:395`, `:401-414`), which reads the row's **declared clearance**;
`depthFromBuildId: run.source` (`:396`), the **recorded depth source** ADR 0073 decision 8 requires of
a frozen extent; and `slideReserveMm` (`:346-360`), which passes it to `cabinetDepthRuleOf` to compute
wall B's chain shift. **All three produce an `EmptyColumn`** — recorded empty space. `buildLShellDesign`
places only the structural corner pieces. **No body named by that constant is ever placed**, and the
module's own comment at `:103-104` says as much: *"The neutral sources a tile's depth is read off…
Never a body the reference happened to stand there."*

**Ruled: the criterion's subject is the site that decides *which body a composed slot gets*. A
declared depth source is not one.** The scoped form, and it is **checkable rather than excused**:

1. **`body-choice.ts` is the only module under `src/generation/` that declares a composed storage
   body id** — `base-cabinet`, `base-3drawer`, `base-panbank`. `base-dishwasher` and
   `base-bottle-cargo` appear in no generation module at all.
2. **In `shell-design.ts` the literal `"base-cabinet"` occurs exactly once, on the line declaring
   `FLOOR_TILE_SOURCE`.** This is the exception, pinned rather than excluded: **a second occurrence in
   that file goes red**, so the file cannot quietly acquire a composed body under cover of the
   exemption. An exclusion by filename would have bought nothing.
3. **No file under `src/generation/` encodes the balance as a percentage, a ratio or a halving.**

**And a correction of the slice this belongs to.** The plan assigns this grep to **S1**. It cannot pass
there for a second reason the plan did not see: `generation-priorities.ts:34` still declares
`export const STORAGE_BUILD_ID = "base-cabinet"` at HEAD *(source-verified)*, and **S2 is the slice
that removes it.** **The grep is S2's.** S1 shipped no guard for it, which is correct and is recorded
here rather than read later as an omission.

**F14.2 — the id-convention guard pins the exact site set, which is strictly stronger than a count.**

The criterion required the literal `"storage:"` in **exactly two places in the repository**. **There is
a third** *(source-verified)*: `packages/configurator-domain/tests/generation/generate-kitchen.test.ts:241`
matches `base.id === "storage:A:0"` — a **whole-id equality**, not a parse — in a 7D2 test this wave is
forbidden to edit. **Editing it to make this wave's criterion pass is exactly the edited-assertion
defect the wave's own rules call a finding**, so the count was going to be wrong either way.

**Ruled: adopt the implementer's form.** The guard pins the **site set** in three assertions —
production is exactly `body-choice.ts` plus the one `Array.from` in `generation-priorities.ts`; tests
are exactly that one 7D2 file, **commented in place as a reported deviation with its reason**; anywhere
else is empty. The guard excludes **itself**, by resolved path rather than by basename, because it has
to spell the convention in order to count it.

**Why this is stronger and not a relaxation.** *Exactly two* passes if a site moves to a different file.
**The pinned set fails on a fourth reader, on a site that moves, and on a deviation that stops being
commented** — and the deviation is **recorded rather than laundered**. *(Considered and refused:
keeping the weaker count and editing the 7D2 test. It buys a shorter sentence and costs an owner-facing
rule — that a wave never edits a closed wave's assertion to make its own criterion pass.)*

**The guard's declared limit, stated because a guard that oversells itself is worse than none.** It
matches the convention as a **quoted prefix** — a string or template literal opening with `storage:`.
A reader that builds the prefix by concatenation or holds it in a variable is **not** caught. That is
accepted: the guard's purpose is to stop the ordinary copy of a string literal, which is how this
convention would actually spread, and the predicate is what makes copying unnecessary.

### F15 — the dropped-roles sentence, carried rather than newly decided

**This clause exists because four places in the tree cite *ADR 0110 Amendment F* for a rule about what
a customer is told when a role is dropped, and until this amendment existed the citation dangled.**
Writing F0–F14 without it would have been worse than the dangle: the citation would now resolve to a
document that says nothing about the thing it was cited for. *(Source-verified at HEAD:
`apps/web/src/room/room.module.css:721-723` names this record explicitly; the M7 plan's 7F4 message
table and its `Q7F4-1` both point here.)*

**The shape, and it is this record's because it is a rule about what composition reports:** the
dropped-roles sentence stands **in the state the screen already has**, carries **no per-role
explanation** and offers **no recovery flow**. The design's `dropped` list names roles and codes, never
sentences (decision 4, ADR 0095 decision 3), and the wording resolves in the message file.

**The wording was the owner's to rule and they ruled it on 2026-09-15, during wave 7F4a** — *the
sentence must say the wall sizes did not leave enough space* — together with two status labels
(*așezat* → **inclus**, *nu încape* → **nu poate fi inclus**). **The owner also asked whether the
algorithm could drop non-fitting cabinets by itself; it already does and has since 7D1, and they then
ruled that the report stays.** The current strings and their history live in the M7 plan's 7F4 section;
**they are not restated here, because a message file copied into an ADR is a second authority.**

**Nothing in F15 is decided by this amendment.** It records where the ruling is and closes the
citation. **A wave that changes the sentence's *shape* — adding a per-role reason or a recovery
action — is overturning this clause and owes a dated decision; a wave that changes its *wording* is
editing a message file.**

## Amendment G — 2026-09-16: drawers are anchored to the work, not distributed by a pattern

**Supersedes Amendment F's F3 and F4 within a day of their acceptance.** Both are struck in place
above. **F1, F2, F5, F6, F7, F8 and F9–F15 stand unchanged**, and F6 — *a module is identified by what
composed it* — is entirely unaffected: it names a slot's **origin**, never its **body**.

**Every claim carries its evidence tier**, as F did. *Owner's words* — verbatim from a dated
statement. *Source-verified* — re-read in the tree at HEAD (`e3041fb`) while writing this, file and
line named. *Measured* — a sweep against the built planner, population stated; **every measurement
below was taken for this amendment on 2026-09-16 from a scratchpad snapshot of `dist/` at `e3041fb`,
not carried from Amendment F.** *Inference* — the architect's or the coordinator's derivation.

### G1 — the owner's words

*(Owner's words, 2026-09-16, two messages. The first corrects the cycle unprompted.)*

> *"Is not like one with drawers one with door, pretty often are 3 with drawers then 3 with doors — is
> not like in chess."*

Asked where the drawer group sits and whether a long run re-alternates:

> *"yes drawers near the hob more, and we can make like groups or 2 or 3 like 2 with drawers 2 with
> doors and another 2 with drawers, I know this is hard and I don't want to make it very random but
> this is so particular to anyone's taste… so this is not a strict strict rule that it always in a
> specific order… do you need clear rules how to and where to add drawers cabinets and doors cabinets?
> if yes then **add where is enough space 2 cabinets width drawer ideally between sink and hob, and
> after the hob and tall cabinets add cabinets with doors**"*

**"Is not like in chess" is the whole of the correction.** The cycle alternated every slot; the owner
has never described a kitchen that does that, and said so as soon as they saw it.

### G2 — the rule, read as three clauses

*(Inference — the coordinator's reading of G1, reviewed by the architect and not disputed. The owner
has not confirmed this phrasing.)*

1. **Between the sink and the hob: drawer cabinets — ideally two, where there is space.**
2. **After the hob, and after the tall cabinets: door cabinets.**
3. **Everywhere else: door cabinets.**

**It is positional and ergonomic, not a pattern.** The drawer group is anchored to the preparation
zone, for the reason the owner has given three times in three different rulings — cutlery at the
preparation surface, oil beside the hob, plates over the sink. **Clause 3 is an inference the owner has
not confirmed**, and it governs wall B's storage, which is the stretch between the fridge and the sink;
it is put to them as **Q-G1**.

### G3 — the ratio stops being a rule and becomes a consequence, and that is the point

**Under F3 the split was a property of the *cycle*. Under G it is a property of the *room*.** A kitchen
whose run past the hob is long comes out mostly doors, because clause 2 says so. **The owner's earlier
*"3 with drawers and 3 with doors for six cabinets" is therefore no longer a guarantee** — it becomes a
thing that happens in rooms of a certain shape.

**They appear to want exactly that**, and said so twice in G1: *"this is not a strict strict rule"* and
*"this is so particular to anyone's taste"*. **So no criterion may assert a 3-and-3 proportion, and
every criterion that did is withdrawn** (M7 plan, wave 7D4, criteria 3, 4, 5 and 8).

**This is the shape [ADR 0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)
asks for, reached from the other side.** F3 argued that *half* was safe because it was a consequence of
a shape rather than a constant. **G does not need the argument**: there is no proportion anywhere,
because placement is derived from the work the customer does at the counter. **0117 §*unclear* #1 —
which named R1's proportion as the one being built — is thereby narrowed rather than contradicted: the
owner's proportion was a description of the result, and the rule they actually wanted was positional
all along.**

**One fact about F3 that should not be lost with it** *(measured, 211 551 placed rooms)*: the cycle's
aggregate drawer share across the whole approved policy was **60.0 % of storage slots, never 50 %**,
because the room distribution is dominated by short runs where *drawers carry the extra* (0 slots
29.5 %, 1 slot 18.1 %, 2 slots 15.2 %). **F3's "exactly half" was true per kitchen at even counts and
never true of the fleet.** Recorded so nobody restores the cycle believing it delivered a balance it
did not.

### G4 — what the rule produces against the slots that exist today, and it is the finding

*(Measured, sweep of the approved L policy on a 10 mm grid at 2600 mm: 222 351 rooms, 211 551 placed.)*

**A storage slot never stands between the sink and the hob when the two share a wall.** Measured:

| Where the sink and the hob stand | Rooms | What stands between them |
| --- | --- | --- |
| **Same wall — 169 431 (80.1 %)** | 162 231 (76.7 %) | **exactly one module, always the `preparation` cabinet** |
| | 7 200 (3.4 %) | **nothing** — preparation was dropped |
| | **0** | **two or more modules: never** |
| Different walls — 42 120 (19.9 %) | 24 120 (11.4 %) | a storage slot, but **across the corner** — not a preparation zone in any ergonomic sense (witness **1500 × 2800**) |

*(Source-verified, `generation-priorities.ts:22-32` at `e3041fb`: `GENERATION_PRIORITIES` declares
fridge, sink, **preparation**, hob. **One** module stands between the sink and the hob, by A1's reading
order, and storage stands only at a run's ends.)*

**So the rule, applied to the generator as it exists, reduces to two statements:**

- **clause 1 is satisfiable at exactly one cabinet** — the preparation slot — **which is F5, already
  ruled and already this wave's one-line change**;
- **clauses 2 and 3 make every storage slot a door cabinet**, which is **what the generator already
  does**.

**The measured consequence, stated plainly: the anchored rule composes zero drawer storage cabinets in
100 % of the 149 151 rooms that have any storage at all.** The only drawer body generation places is
the preparation cabinet, one per kitchen. Drawer share across storage plus preparation is **31.9 %**
fleet-wide, and it falls as the run lengthens — **12.8 % of placed rooms land in the 10–19 % band and
24.5 % in the 20–29 % band**, and those are the long-run rooms the owner cares most about.

**That is worth putting back to them and it is `Q-G2`**, because *"drawers are often preferred"* and a
generator that places one drawer cabinet per kitchen are hard to hold at the same time.

### G5 — the second drawer cabinet is a width change, and it is never free

**Clause 1 says *ideally two*. There is room for one.** A second costs 600 mm of wall A's core, and
this generator leaves no slack: Amendment A4 fills every run to within 599 mm.

*(Measured, same sweep: each room compared against the real plan of the same room with wall A 600 mm
shorter, which is exactly the capacity a second core module consumes.)*

| What a second drawer module between sink and hob costs | Rooms |
| --- | --- |
| **nothing** | **0 (0.0 %)** |
| one **storage** cabinet | 95 331 (45.1 %) |
| one **block column**, and with it part of the tall run | 65 760 (31.1 %) |
| a **core role** dropped — the fridge, or preparation itself | 33 000 (15.6 %) |
| wall A already below 1500 mm, outside the comparison | 17 460 (8.3 %) |

**The owner's *"where is enough space"* has no referent in this generator**, and that is the honest
thing to tell them: space is always already spent. **Their conditional is therefore not a condition but
a trade**, and only they can rule it — **`Q-G3`**.

**Corroboration from the owner's own kitchen, and it points at one** *(owner's words, 2026-09-14,
recorded at F-era D7)*: *"I had the fridge and after that the sink, the cabinet drawers, the hob, and
the tall cabinet"* — **one** drawer cabinet between their sink and their hob, in the kitchen they
actually live in. *(Inference: **ideally two** is aspirational for a larger kitchen than the one they
described, not a floor.)*

**Ruling, pending Q-G3: generation builds clause 1 at one drawer cabinet.** The second is a **width
change** — it moves the wall cut, the leftover count, the remainder and Amendment E's block-threshold
table — which is precisely the class of change that was moved out of wave 7D4 and into 7D5. **If the
owner rules for two, it is 7D5's and not 7D4's**, and it carries the trade above with it.

### G6 — the defaults are defaults, and the owner said so twice

**Nothing in G2 may be asserted as an invariant over every room.** The owner declined to promise it in
as many words — *"this is not a strict strict rule that it always in a specific order"*, *"I don't want
to make it very random but this is so particular to anyone's taste"*.

**This is the third category [ADR 0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)
§*unclear* #2 names** — a majority-case default that is neither a generator invariant nor a preset —
and it now has a third member beside *drawers before the hob* (F5) and *the bottle cargo after the hob*.
**A criterion may assert what the composer does; it may not assert that no other arrangement is
correct.** Concretely: a test may require the preparation cabinet to be a drawer body, and may not
require that no drawer body stands anywhere else, nor that a given room yields a given ratio.

### G7 — what survives in code, and what an implementer must delete

*(Source-verified against `body-choice.ts` at `e3041fb`.)*

**Survives, and must not be touched:**

- **`isCycleStorageSlot` and `CYCLE_STORAGE_ID_PREFIX`** — F6's provenance discriminator. **It names a
  slot's origin, not its body**, so the rule change does not reach it. Its head comment's measured
  figures (32.8 %, 14.9 %) are unaffected.
  *(**Renamed at 7D4's close-out, 2026-09-16, `6456a3b`: they ship as `isComposedStorageSlot` and
  `COMPOSED_STORAGE_ID_PREFIX`** — source-verified at HEAD, where the old spellings occur nowhere
  under `packages/`. The wording above and **Amendment F's F6 clause 2**, which names the predicate
  the same way, are left as dated text — *cycle* in this ADR frequently names **the rule this
  amendment deletes**, so a mechanical sweep would make the text read as though that rule shipped.
  Nothing else about the clause changes.)*
- **`DOOR_BASE_BUILD_ID` and `THREE_DRAWER_BASE_BUILD_ID`** — clause 2 needs the first and clause 1 the
  second.
- **`refuseASlotThatIsNotAWholePosition`'s index discipline**, and the zero-import dependency floor the
  leaf's head comment claims (F13's `src/index.ts` obligation with it).

**Dies:**

- **`STORAGE_CYCLE`** and every assertion of an alternating order.
- **`PAN_DRAWER_BASE_BUILD_ID`**, unless Q-G1 or Q-G2 gives the drawer group a second member —
  **`base-panbank` is now generated nowhere**, and a constant with no reader is dead configuration.
  **Keep it only if a question answers for it; do not keep it in case.**
- **`storageBodyAt(slotIndex)` in its current form.** Clause 2 makes a storage slot's body constant, so
  the function that answered *what stands at index i* has no varying answer left to give.

**The module's head comment is now wrong in its first three paragraphs** and is rewritten with the
leaf, not after it. **F6's paragraph in that comment is correct and stays.**

### G8 — what this does not change

- **Amendment A1's reading order**, and the single preparation slot in it. G changes a body's
  **identity**, not the order or the count. *(If Q-G3 rules for two drawer cabinets, **that** changes
  A1's interim data and owes its own dated clause.)*
- **F2** — a body's identity changes and never its width. `base-cabinet` and `base-3drawer` are both
  `'fit'` and both build at 600, so G is width-neutral in exactly the way F was.
- **F6, F9, F10, F11, F13, F14, F15**, and every one of Amendments A–E.
- **7D3's block.** Clause 2 names the cabinets *after* the tall units; the block's own columns are
  Amendment E's and G does not reach them. F6 is what keeps the two apart.

### Owner questions arising

> **All three are ANSWERED or DISSOLVED as of 2026-09-16 — see Amendment H.** **Q-G1: answered yes, by
> the owner, in their own run order** (*"Fridge (if space - door cabinet)"*), which confirms the
> recommendation below. **Q-G2: answered** — *"from 6 cabinets proportion should be 2 drawers and 4 with
> doors"*. **Q-G3: dissolved** — its premise was wrong; see H4.

- **Q-G1** — *does the stretch between the fridge and the sink take door cabinets?* G2 clause 3 is an
  **inference**. It governs wall B's storage, which is **64.2 %** of all storage slots. *Recommendation:
  yes, doors.* **Blocks nothing**: it is what the generator does today either way.
- **Q-G2** — *the anchored rule composes **one** drawer cabinet per kitchen and zero drawer storage
  cabinets. Is that the kitchen you want?* With the measured shares in front of them (31.9 % fleet-wide,
  10–19 % in the long runs the rule was written for). **This is the question worth their time.**
- **Q-G3** — *a second drawer cabinet between sink and hob costs a storage cabinet (45 %), a tall
  cabinet column (31 %) or the fridge (16 %). Which do you give up?* **Put the trade, not the
  condition** — *"where there is enough space"* has no referent here. **Blocks 7D5, not 7D4.**

## Amendment H — 2026-09-16: the owner's run order, and the split between 7D4 and 7D5

**Amendment G's G2 is superseded by H1 within the same day.** G's other clauses stand; **G6 (the
defaults are defaults) and G7 (what survives in code) are unchanged**, and **F6's provenance
discriminator is untouched for the third time running** — it names a slot's origin, never its body.

**Evidence tiers as in F and G.** Every measurement below was taken for this amendment on **2026-09-16**
from a scratchpad snapshot of `dist/`, verified byte-identical to
`packages/configurator-domain/src/generation/` and `catalog.ts` at HEAD `a70efc1`. Sweep: the approved L
policy on a 10 mm grid at 2600 mm — 222 351 rooms, **211 551 placed**.

### H1 — the owner's words, and the order

*(Owner's words, 2026-09-16, their third statement of this rule in three days.)*

> *"often drawer cabinets are near, in case there is not space then before and after cabinet with hob,
> i know i mentioned that after the hob is the bottles cabinet but it can be just after bottle cabinet
> and next already door cabinets like : Fridge (if space - door cabinet) => sink => drawer cabinetss (
> if space drawer cabinet) hub => bottle cabinets (if space for a large number of cabinets, the drawer
> cabinet) and after only door cabinets to fit spaces or tall cabinets instead of door but at the
> edge"*

**Read as an order** *(inference — the coordinator's reading, and the architect's structural check
below did not dispute it)*:

> **fridge → [door cabinet, if space] → sink → drawer cabinet [+ a second, if space] → hob → bottle
> cabinet → [a third drawer cabinet, if the run is long] → door cabinets to fill → tall cabinets at the
> far edge, instead of doors**

**The reconciliation, and it is what the previous two readings each missed.** *"Drawer cabinets are
near"* means near **each other**; *"before and after cabinet with hob"* puts them as **one group astride
the hob**. So *"drawers between sink and hob"* (G2 clause 1) and *"after the hob, doors"* (G2 clause 2)
were **both true of one arrangement** — *after the hob* means **after the drawer group**, not
immediately after the hob body. **Neither earlier reading was wrong; each described one end of one
group.**

### H2 — two of the order's five clauses are already built, and naming that halves the work

*(Source-verified against `generation-priorities.ts` and the composed spatial arrays at HEAD.)*

| Clause | What it actually is |
| --- | --- |
| *door cabinet between fridge and sink* | **Already exists and is already a door.** The run reads `fridge, [wall B storage…], CORNER, sink` — that stretch **is** wall B's storage, `base-cabinet` today. **No new slot.** **This answers Q-G1 in the affirmative, from the owner's own mouth.** |
| *door cabinets to fill, after* | **Already exists and is already a door** — wall A's storage after the hob. **No new slot.** |
| *tall cabinets at the edge instead of doors* | **Amendment E's block, shipped in 7D3.** Stated as part of one order rather than as a separate rule, which is a gain in presentation and not a change. |
| **bottle cabinet, right of the hob** | **New. A slot, 300 mm.** |
| **second drawer cabinet, left of the hob** | **New. A slot, 600 mm.** |

**So the order adds exactly two modules.** Both are **width** changes.

### H3 — what the order produces, measured

**With the second drawer added only where it displaces a storage slot** — never a tall column, never a
core role. *n* counts sink + preparation + hob + storage cabinets (see H7 on the denominator).

| Run *n* | Rooms | Drawers | **% of run** | One-third | 2nd drawer added | would cost a column or role |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 51 600 | 1.00 | **33.3 %** | 1.00 | 0.0 % | 37.2 % |
| 4 | 38 260 | 1.58 | **39.5 %** | 1.33 | 58.2 % | 29.3 % |
| 5 | 32 070 | 1.74 | **34.7 %** | 1.67 | 62.4 % | 29.9 % |
| **6 — the owner's own example** | 27 720 | **1.79** | **29.8 %** | **2.00** | **65.4 %** | **34.6 %** |
| 7 | 24 120 | 1.75 | 25.1 % | 2.33 | 60.2 % | 39.8 % |
| 8 | 17 480 | 1.83 | 22.9 % | 2.67 | 62.5 % | 37.5 % |
| 9 | 6 940 | 2.53 | 28.1 % | 3.00 | 100 % | 0.0 % |
| 10 | 2 520 | 3.00 | 30.0 % | 3.33 | 100 % | 0.0 % |

**At the owner's own example the order gives 29.8 % against one-third**, short by 0.21 of a cabinet.
Amendment G's rule gave **16.7 %** there, short by a whole one.

**Where it falls short, and the shortfall is evidence the rule is coherent rather than that it is
broken.** Runs of **7 and 8** give 25.1 % and 22.9 %. **That is exactly the band the owner's third
clause covers** — *"if space for a large number of cabinets, the drawer cabinet"* — **and that clause is
the one not modelled here, because its threshold is unset.** The gap and the unbuilt clause are in the
same rooms. **The deficiency is ours, not the rule's**, and a later reader must not treat the table as
evidence against the owner's order.

### H4 — a framing this record got wrong, withdrawn with its reason

> **WITHDRAWN: *"a second drawer cabinet is never free"*** (Amendment G5, and the 7D4 plan's D14.4).
> **It is true of capacity and misleading about the kitchen, and it was relayed to the owner in the
> misleading form.**

Adding a 600 mm drawer cabinet before the hob **displaces one storage slot**, so **the run's cabinet
count is unchanged**. **Nothing is lost.** A door cabinet at the run's far end becomes a drawer cabinet
beside the preparation zone — **which is precisely the swap the owner is asking for.** It is a genuine
loss only when it takes a **tall column** (34.6 % at run 6) or drops a **core role**.

**The error was counting slots and calling the result a kitchen.** G5's table measured capacity
correctly and then labelled the 45.1 % column *"costs a storage cabinet"*, which reads as a loss to
anyone who has not traced what replaces it. **A customer does not experience a door cabinet becoming a
drawer cabinet as a cost.** **Q-G3 is dissolved rather than answered**: it asked *which do you give up*,
and the answer is *nothing, in the majority case*.

**This is the general lesson and it is worth more than the correction:** a measurement of the plan's
internal quantities is not a measurement of the product, and **the translation between them is where a
true number becomes a false claim.**

### H5 — what the bottle cabinet costs, and one warning of Amendment E's is refuted

**Free in 45.7 % of placed rooms**, because Amendment A4 leaves up to 599 mm of run bare and a 300 mm
cabinet often fits in it. Costs a storage cabinet in 24.9 %, a block column in 17.5 %, a core role in
7.8 %.

**Amendment E's block-threshold table moves by exactly +300 mm**, measured at wall B 1700:

| | 1 column | 2 columns | 3 columns |
| --- | ---: | ---: | ---: |
| today | 3300 | 3900 | 4500 |
| **with the bottle cabinet** | **3600** | **4200** | **4800** |

**Derivable rather than re-measured** — the table follows the core's width, which is how E built it.

**The absorb-window warning is refuted by measurement and is struck.** The 7D4 plan's D2.2 warned that a
300 mm body *"shifts essentially every room into or out of 7D3's `(0, 200]` absorb window"* and called
it the wave's worst hazard. **Measured: 39 530 rooms fall in that window both with and without the
bottle cabinet.** Individual rooms move; **the aggregate exposure does not change at all**, because over
a uniform sweep a constant shift of wall A relabels which rooms land in the window without changing how
many. **So 7D5 owes a re-measurement, not a new hazard**, and D2.2's sentence must be struck rather than
left standing as a live warning.

**Merge-safe in this position.** D2.2's own rule is that a 300 mm cargo survives **iff both neighbours
are at least 500 mm**. Here they are the hob (600) and either a storage cabinet or a block column (600).
**Both clear it**, and this is the one position D2.2 measured as surviving. **The unsafe case is a cargo
with nothing outboard of it**, where its neighbour is the bare remainder — so **7D5 asserts the
neighbours, not the cargo.**

> **A caveat on this record's own arithmetic, stated so it is not later quoted as a finding.** The model
> behind H3 and H5 adds a module by shortening wall A by the same amount, so it cannot sample wall A
> below 1200 mm and its *placed* denominator falls from 211 551 to 199 221. **That is a sampling
> artefact, not 12 330 rooms becoming unbuildable.** The real refusal boundary does move by 300 mm at
> the bottom of the policy, and that is a separate and smaller question for 7D5.

### H6 — the split: 7D4 keeps what is width-neutral, 7D5 takes the order

**Ruled by the coordinator, 2026-09-16.**

- **7D4 builds only the width-neutral part**: the preparation cabinet becomes a drawer body (**F5**,
  already ruled), the first storage slot after the hob becomes a drawer body, and everything else stays
  a door cabinet. **No width, tile, remainder, cut or count moves**, so **F2 and the wave's criterion 2
  survive intact.** **Measured, this alone gives 1.31 drawers at run 6 — 21.8 %**, and **no criterion of
  7D4 may claim it meets the owner's proportion**, because it does not.
- **7D5 builds the order**: the bottle cabinet, the second drawer cabinet, the third drawer cabinet and
  its threshold, and the re-measured block table.

**This is not a deferral of an owner ruling, and the distinction is the reason.** The split is a
**grouping by what re-baselines the run's arithmetic**, which is exactly the argument **F-era D11** used
when it moved the dishwasher and the bottle cargo to 7D5. **The owner's order is the third member of
that same set and the largest.** Doing the width changes in one wave re-measures Amendment E's threshold
table **once instead of twice** — and H5 has already shown it moves cleanly by +300, which is the
evidence that it belongs with the other width work rather than alone.

**Why 7D4 is worth shipping small.** Without the width changes the order reaches only 1.31 drawers at
run 6, **because only 30.5 % of run-6 rooms have a post-hob storage slot at all** — 7D3's block takes
the free end. **That number is the justification for 7D5 existing**, and it is also why 7D4's own
contribution is honest but partial. **A small unblocked wave ships; a large blocked one does not.**

### H7 — the three phrasings, with their dates, unsmoothed

**The rule has been stated three times in three days and corrected twice. None of the three corrections
was caught by a test or by a review — each was caught by putting the rule back to the owner in the form
it was about to be built.**

| Date | The owner's words | Read as | How it failed |
| --- | --- | --- | --- |
| **2026-09-14** | *"if there is like space for 6 cabinets will be like 3 with drawers and 3 with doors"* | a **proportion**, built as a 4-step alternating cycle (F3) | **Rejected on sight** — *"is not like in chess"* — one day after acceptance. The proportion was an illustration inside a sentence about preference, not a rule. |
| **2026-09-16 (a)** | *"add where is enough space 2 cabinets width drawer ideally between sink and hob, and after the hob and tall cabinets add cabinets with doors"* | a **positional rule**, built as *preparation is the only drawer* (G2) | **The measurement drew the correction.** Reported back as one drawer per kitchen and **16.7 % at run 6**; the owner answered with a number. |
| **2026-09-16 (b)** | *"from 6 cabinets proportion should be 2 drawers and 4 with doors"* | a **proportion**, one third | Not wrong, but **underdetermined** — it did not say where the extras go, and the two candidate placements each contradicted a different owner statement. |
| **2026-09-16 (c)** | the run order quoted at **H1** | **a full run order** | **Standing.** It reconciles (a) and (b): one drawer group astride the hob. |

**Do not read this as the owner changing their mind three times.** It is **one rule, always positional,
described from three angles** — and an architect who twice built the angle rather than the rule. **The
2-and-4 proportion survives as a *consequence* of the order**, which is why it can be recorded without a
ratio constant anywhere, and why **no criterion asserts it** (G6 stands).

### H8 — open questions, all of them 7D5's

**None blocks 7D4.**

- **Q-H3 — the denominator.** What counts as one of the *"6 cabinets"*? The order names *fridge*,
  *sink*, *hob*, *bottle cabinet* and *tall cabinets* as distinct things, which is **evidence** that
  *cabinets* means the door-and-drawer cabinetry — **still an inference.** Measured means per kitchen:
  storage only **2.03**; plus preparation **2.98**; **plus sink and hob 4.98** *(used throughout this
  amendment)*; plus tall columns **6.27**.
- **Q-H4 — does `base-hob-2drawer` count toward the proportion?** It is a drawer front that Amendment E
  places for an **oven** reason in 52.3 % of rooms, not a storage one. **The order makes this sharper
  rather than softer**: the hob now sits *inside* the drawer group, so its two drawers are part of what
  the customer sees. **Counting it moves run 6 from 1.79 to 2.31 — from under the owner's number to
  over it.**
- **Q-H5 — the third drawer's threshold**, *"if space for a large number of cabinets"*. **Unset, and it
  is the whole of H3's remaining shortfall.** Candidate: from run 7 upward, which is where the gap
  opens. **Do not pick it. Measure what each candidate produces and put the numbers to the owner as
  consequences**, as was done for the second drawer.
- **Q-H6 — the second drawer's threshold**, *"if space"*. Candidate, and the one H3 is measured under:
  **add it wherever it displaces only a storage slot** — never a tall column, never a core role. Under
  that reading *space* means *the run has a cabinet to convert*, which is the only reading with a
  referent: the wall never has 600 mm spare.

## Amendment I — 2026-09-17: the block follows the run, not the letter A, and A1's order survives its own mirror

**Written 2026-09-17 for wave 7D8 slice S1(a), recording an owner ruling given 2026-09-16.** The two
dates are kept apart rather than collapsed: the ruling is the owner's and is dated when they gave it;
this record is the architect's and is dated when it was written. **Nothing here was backdated to the
ruling.**

**This amendment does two things and they are not the same kind of thing.** The first is an
**overturning**: Amendment E's *"and nowhere else"* falls to an owner ruling. The second is a
**correction with a survival**: Amendment A1's order stands and one sentence of A1 does not. **A
reader who takes both as "amended" and stops reading will get the second one wrong**, which is why
I5 spends more words on what survives than on what falls.

**Where the figures come from, stated before any of them is used.** Every count below is taken from
**wave 7D8's plan** (`docs/milestones/M7-room-and-presets.md`, sections E1, E3 and E6), which
measured them on 2026-09-16 against a `tsc` build of `packages/configurator-domain/src/` at
`8201915`, sweeping `APPROVED_ROOM_POLICY`'s L bounds at **10 mm** and keeping the **211 551** rooms
`planKitchenComposition` reports `minimumMet` for. **They were not re-measured for this record and
are not presented as if they had been** — this amendment's own warrant for them is
**doc-quoted from that plan**, and the plan's is **[measured]**. The source readings below were
re-read at HEAD **`5c915f8`** while writing (ADR 0119 decision 4); `git diff --name-only HEAD --
docs/ packages/` was empty at that moment, so the file-and-line pairs are HEAD's and not a working
tree's.

### I1 — The ruling, and the two arms the owner chose between

**The owner was shown both measured arms and chose the first.** [doc-quoted from the 7D8 plan, E3]

| | blocks composed | on wall A | on wall B | kitchens that lose a block they have today |
| --- | ---: | ---: | ---: | ---: |
| **HEAD** | 110 591 (52.28 %) | 110 591 | 0 | — |
| **CHOSEN — the block follows the run** | **144 866 (68.48 %)** | 97 691 | **47 175 (22.3 % of placed)** | **0** |
| **REFUSED — the block is confined to physical wall A** | 97 691 (46.18 %) | 97 691 | 0 | **12 900** |

**The ruling: the block follows the run and may stand on wall B.** It is the owner's, not the
coordinator's and not this record's. What they were choosing between was **144 866 blocks with
47 175 of them on wall B and nobody losing one**, against **97 691 confined and 12 900 kitchens
losing a block they have today.**

**The refused alternative is recorded with its cost, permanently and on purpose.** A later wave
reading only the shipped number would have no way to know confinement was considered, and would
re-derive it from Amendment E's letter as though nobody had looked. **12 900 is what looking cost.**

### I2 — Amendment E's *"and nowhere else"* is OVERTURNED

**The sentence being overturned, quoted at the line it stands on. [doc-quoted]** This record's
[Amendment E](#amendment-e--2026-09-14-a-tall-unit-stands-at-the-free-end-of-wall-a-and-the-hobs-oven-follows-it)
heads section **E2** *"a generated tall unit stands at the free end of wall A, and nowhere else"*
(line 576 at `5c915f8`), and E2's body argues it: *"So **wall A's free end is the only leftover end
an L run has**, and the rule has exactly one eligible site"* (line 585). **The Status line at the
head of this file carried the same words** and is struck there too.

**What replaces it.** A generated tall block stands at the free end of **the wall that carries the
reading order's suffix** — whichever physical wall that is. In every room where wall A is wider, or
the two are equal, that is wall A and the shipped picture is unchanged. In the **82 395** rooms
where wall B is wider it is wall B, and **47 175** of them compose a block there.

**E2's refusal of the *corner* end is untouched and is not what fell.** A run starts past the
structural corner, where the worktop turns; a 2200 mm column planted there walls the corner in and
interrupts the only continuous work surface an L has. **That half of E2 is confirmed by the field
photographs E records and by nothing this ruling touches.** What fell is only the identification of
*the free end* with *the letter A*.

### I3 — The engineering argument reaches the same answer, and it is kept and explicitly demoted

**There is an argument that the block *should* follow the run, and it is good.** Amendment E's
stated reason was never about wall A as a name: it was about **the free end the layout leaves**.
Wall B's spatial array is `[storage…, core reversed]`, so B's free end holds core bodies and has no
leftover modules to swap for columns. **The module says so at the parameter itself. [source-verified
at `5c915f8`]** — `packages/configurator-domain/src/generation/tall-end-rule.ts:51-53`:

> `/** E3 clause 2 with E2: wall A's free end is the only site an L run has, so a hob on wall B means`
> `*  no block and a hob that keeps its oven. */`

Re-keyed, that reason is true of whichever wall carries the **prefix**, and the block's site becomes
the **suffix** wall's free end. So following the run honours E's *intent* while confining it would be
a regression nobody asked for.

**And that argument is not the authority for this amendment.** The owner did not need it, was not
shown it, and **the ruling does not rest on it.** It is recorded as a **reason, never as a
permission** — the distinction ADR 0120 Amendment D2 had to learn the hard way about ADR 0045
Amendment A, where *"a recorded reason is not a second authority for the ruling it accompanies"*.
**If this argument were found tomorrow to be wrong, the ruling would stand unchanged**; if the
argument alone had been all there was, the amendment could not have been written, because an
architect may not overturn an owner ruling with a derivation. **The order matters: the owner ruled,
and then the engineering was found to agree.**

### I4 — What in Amendment E is untouched, listed so nothing is widened by accident

- **E4 — exactly one oven, never two and never zero.** Untouched. The substitution still keys on
  whether a tower is planned, not on which wall it stands against.
- **E5, E6 — the identity-not-count rule and the outermost body's absorb.** Untouched. E6's absorb is
  a fact about the block's outermost column, and the column does not learn which wall it is on.
- **E7 — no upper above a full-height body, read from the declared height.** Untouched, and it now
  applies on wall B in the rooms where a block stands there. **[inference, and the thing to check:**
  a wave that ships the block onto wall B without exercising E7 on a wall-B block has not tested the
  interaction. It is named here so it is not discovered by a screenshot.**]**
- **E10, E13 — adjacency between the fridge and the oven is barred; proximity is not.** Untouched
  **and load-bearing under the mirror**, because the mirrored run puts the same bodies in the same
  sequence with the same cabinets between them. The invariant is about the **run**, and the run is
  what is preserved.
- **E11 — the top row stays excluded.** Untouched.
- **E12 — the block is one `tall-oven-tower` innermost plus up to two `tall-pantry` outboard.**
  Untouched. Composition does not change; the wall it composes against does.
- **E3's thresholds — 3300 / 3900 / 4500 mm, moved to 3600 / 4200 / 4800 by Amendment H's bottle
  cabinet.** Untouched as numbers. **They are compared against the suffix wall's length rather than
  against wall A's**, which is a change in what is fed to the rule and not a change in the rule.
  Wave 7D8's criterion 12 holds `tall-end-rule.ts` to **a rename and a comment**: every threshold,
  width, body id and branch in that module is byte-identical, and the corrected comment must name
  *the free end the layout leaves* rather than wall A.

### I5 — Amendment A1: its order is restated, and one of its sentences is corrected

**This section does not say what wave 7D8's plan says, and the divergence is deliberate and is
flagged rather than absorbed.** The plan's **E4** concludes *"ADR 0110 Amendment A1's 'left to right
as seen from inside the room' is RESTATED, not broken"*. **That is right about A1's order and too
tidy about A1's second sentence.** This record was asked to check the claim rather than transcribe
it, and the honest verdict is a split one. The plan and the milestone owe a correction to match.

**A1 in full, quoted, because the split is between its two sentences. [doc-quoted, lines 122-126 at
`5c915f8`]**

> **A1. The layout order replaces decision 3's interim list.** Along the run, left to right as seen
> from inside the room: **fridge → sink → preparation cabinet → hob with the oven under it**, then
> storage. On a left-corner L the run reads from wall B's free end toward the corner and then along
> wall A from the corner outward — which is the reference kitchen's own order (fridge on wall B;
> sink, then hob, on wall A). The fridge is not tied to a wall: it stands wherever the order puts it.

**I5.1 — The order is RESTATED, and the owner's own words are the authority.** The sequence
**fridge → sink → preparation → hob-with-oven, then storage** is untouched by this wave in every
room. What the owner ruled in Q3 — *"a regular order on cooking, take something from fridge, wash,
then process on worktop… and after you cook on hub"* — is a statement about **what follows what**,
and reflecting a sequence does not change what follows what. **The owner said so themselves, in
their own sentence, which is the one to quote at the keying site rather than any reasoning about
it:**

> *"sometimes the arrangement is in mirror, like hub, cabinets (drawers), sink, cabinets, fridge"*

**Read what that sentence lists: hob first and fridge last** — the exact reverse of A1's written
direction, offered by the owner as a **normal** arrangement rather than an exception. It is the
owner narrowing their own earlier *"from left to right"*, by the only authority that could.

**I5.2 — A1's second sentence is CORRECTED, and it is not a quibble.** *"On a left-corner L the run
reads from wall B's free end toward the corner and then along wall A from the corner outward"* is
stated without qualification, about **a left-corner L** and not about *the reference kitchen* — the
reference kitchen appears in the clause after it, as corroboration. After this wave that sentence is
**false in 82 395 of 211 551 placed rooms (38.95 %)**, where the run reads from **wall A's** free end
toward the corner and out along **wall B**. **A reader taking A1 at its word would call those rooms a
defect.** So the sentence is superseded in part, and the amended reading is:

> On a left-corner L the run reads from the **prefix wall's** free end toward the corner and then
> along the **suffix wall** from the corner outward. Which wall carries the prefix is derived from
> the entered wall lengths (ADR 0120, this amendment's companion). Where wall A is the wider wall, or
> the two are equal, that is wall B's free end and A1's original sentence is what you see.

**I5.3 — *"left to right as seen from inside the room"* is narrowed, and the ambiguity is resolved
rather than left for the next reader to resolve differently.** The phrase has two readings and the
record has never distinguished them:

| reading | status after this amendment |
| --- | --- |
| **along the run** — the sequence you meet walking the worktop from one end to the other | **Untouched.** This is the reading that governs. |
| **as a direction in the room** — start at the left-hand end as you stand inside and move right | **Broken in the mirrored population**, and the owner's *"sometimes the arrangement is in mirror"* is what breaks it. |

**The governing reading is the first.** A1 fixes the order **along the run**; it does not fix which
end of the room the run begins at. **A1's own next sentence already pointed this way** — *"The fridge
is not tied to a wall: it stands wherever the order puts it"* — and so did the owner's Q3, which
opens *"fridge position is not mandatory on a specific wall"*. **What this amendment adds is that the
same freedom extends to the run's handedness, which A1 asserted and neither the owner's Q3 nor A1's
own reasoning ever required.**

**I5.4 — The rule for a later reader, stated as the two cases that look alike and are not.**

- **A mirrored kitchen is not A1 violated.** Finding `hob → preparation → sink → fridge` corner-outward
  and "fixing" it back to wall B is reintroducing the defect 7D8 exists to remove.
- **A kitchen whose run does not read fridge → sink → preparation → hob in *either* direction IS A1
  violated**, and no ruling in this amendment excuses it.

**I5.5 — The worked case, so the distinction has a witness rather than a definition.** A **900 × 3500**
room — ADR 0120 Amendment C2's own counterexample, where wall A at 900 mm has no free run at all and
all four bodies stand on wall B. **[doc-quoted from the 7D8 plan, E4]**

| | wall B, corner outward |
| --- | --- |
| **HEAD** | hob → preparation → sink → fridge |
| **after the re-keying** | fridge → sink → preparation → hob |

**Same bodies, same widths, same wall, opposite ends.** Neither is more compliant with the
wider-wall rule — what changes is **which end the cooking order starts at**, and that is exactly the
thing the owner was shown and accepted.

### I6 — What this amendment does not decide

- **It does not rule whether the wider-wall rule may cost a cabinet.** That is wave 7D8's **Q-7D8-2**,
  genuinely open, and this record neither answers it nor prejudges it. The wave is planned for *the
  ladder wins* — no preparation-cabinet drop — and if the owner rules the other way it is a new dated
  record, not a reading of this one.
- **It does not change which wall is wider or how that is computed.** That is the companion amendment
  at [ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md),
  and the two must be read together: this record says *the block follows the run*, that record says
  *what decides which wall the run starts on*.
- **It does not license a wave to ship before it exists.** Wave 7D8's criterion 10 carries the
  must-not in its surviving form: **no commit may put a column on wall B before this amendment has
  landed**, because until then the repository's own standing record reads *wall A … and nowhere else*.
  **A repository that ships against its own record has failed whether or not the change was
  authorised** (`AGENTS.md`).

### Alternatives considered — Amendment I

1. **Confine the block to physical wall A, keeping Amendment E's letter intact.** **Refused by the
   owner**, at a measured cost of **12 900 kitchens losing a block they have today** — a regression
   arriving as a side effect of a rule about sinks. Recorded rather than dropped, per criterion 10.
2. **Leave A1 and E alone and treat the mirrored runs as the defect.** That is HEAD: `PREFIX_WALL` is
   the literal `"B"` (`generation-priorities.ts:20`). It is the state ADR 0120 C2 measured as the
   **exact inverse** of the owner's rule whenever wall B is wider, and it is what 7D8 exists to fix.
3. **Record A1 as flatly "restated, not broken".** Refused. It is true of A1's order and false of
   A1's second sentence, and a record that is tidy about a sentence a reader will later quote is the
   failure this project keeps finding. **The coordinator asked for this to be checked rather than
   accepted, and this is what the check returned.**
4. **Record A1 as flatly "broken" or "overturned".** Also refused, and for the symmetric reason: it
   would put the **cooking order** — which nobody has questioned, which the owner restated the same
   day, and which E10's thermal rule leans on — into play. **The order and the handedness are two
   claims in one paragraph, and the amendment's whole job is to separate them.**
5. **Write one amendment covering both this record and ADR 0120.** Refused. They overturn different
   things by different authorities — an owner ruling here, a measured key there — and a reader
   arriving at either record must find its own answer in it.

### Decision-record sweep — Amendment I

| Record | What it says | Standing after I |
| --- | --- | --- |
| This ADR, **Amendment A1** | The layout order, and that on a left-corner L the run reads from wall B's free end. | **Split: the order is RESTATED and unamended; the run-start sentence is CORRECTED** and reads *prefix wall's free end* (I5.2). *"Left to right as seen from inside the room"* is **narrowed to the direction along the run** by the owner's own later sentence (I5.3). |
| This ADR, **Amendment A2, A3, A4** | Minimum kitchen, drop order, leftover rule. | **Untouched.** No room becomes buildable or unbuildable — `minimumMet` flips in 0 of 222 351 swept rooms. |
| This ADR, **Amendment C** | Uppers, the drop order, wall B's 100 mm reserve. | **Untouched.** The reserve is a fact about the wall the shell is planned against, not about which role stands there. |
| This ADR, **Amendment D / D revised** | Plan the row, tile the shell at its boundaries; wall B is laid out in reverse against the reading order. | **Untouched in mechanism and re-pointed in subject.** `isLaidOutInReverse` still names exactly one wall; which wall it names is derived rather than the constant `"B"`. |
| This ADR, **Amendment E — E2** | The block stands at wall A's free end *"and nowhere else"*. | **OVERTURNED in its wall, by the owner** (I1, I2). **Its refusal of the corner end stands.** |
| This ADR, **Amendment E — E3, E4, E5, E6, E7, E10–E13** | Thresholds, the one-oven rule, the absorb, the upper veto, adjacency, composition. | **Untouched** (I4). The thresholds are compared against the suffix wall's length; the numbers do not move. |
| This ADR, **Amendment F, G, H** | The storage composition and the owner's run order. | **Untouched.** They rule what stands *along* the run, which is the half the mirror preserves. H's bottle cabinet still moves E's block table by +300. |
| [0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) **Amendment C2** | `chooseWallCut` is keyed on wall identity; the wider-wall rule is not implemented; the record does not design the fix. | **Companion.** Its obligation is discharged by that record's own Amendment E of the same date, which names the key. |
| [0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) **Amendment D2** | A recorded *reason* is not a second authority for the ruling it accompanies. | **Applied directly** (I3). The engineering argument is kept and demoted, and the ruling is recorded as resting on the owner alone. |
| [0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) | Generation owes the cheap, correct baseline; taste enters through presets. | **Respected.** The block count rises because the rule reaches more rooms, not because a taste rule was added; and **12 900 kitchens keeping a body they have today is correctness, not taste.** |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | A foreseeable problem is recorded with its trigger and left unbuilt. | **Applied once** (I4, E7 on a wall-B block): named as the interaction to exercise, with **no machinery built for it**. |
| [0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md) | Re-read a cited fact at HEAD before asserting it. | **Applied to this amendment's own sources.** E2's *"nowhere else"*, A1's two sentences and `tall-end-rule.ts:51-53` were each re-read at `5c915f8` while writing, and **the split verdict in I5 exists only because A1 was read rather than quoted from the brief.** |
| [0121](0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md) | A thing is identified by what it is, never by what correlates with it. | **This amendment is that record's cure applied to a decision record rather than to code.** *Wall A* correlated with *the free end the layout leaves*; Amendment E wrote down the correlate. **A record can carry the defect as easily as a test can.** |

## Consequences of Amendment F

- **Wave 7D4 builds F2–F8** in slices S1 (the leaf, landed), S2 (the sequence and the preparation
  body), and S4 (the properties). **F9, F10 and F11 are asserted or recorded rather than composed** —
  the wall row's output does not change. **F12 is wave 7D5's.**
- **`base-3drawer` and `base-panbank` gain their first automatic callers.** Until now both existed only
  where a customer put one. Their fronts, handles and prices are now produced by a run rather than
  chosen. **A later wave that changes either row's front or handle declaration changes generated
  kitchens**, and the parity coverage this wave adds is the first that would notice.
- **`generateKitchen` has a production caller** (`apps/web/src/room/use-generation.ts`), so everything
  ruled here is reachable from the app — but **this wave has no visual gate**: it is provable in
  `configurator-domain` plus one `three-adapter` parity test. *"It looked right in the browser"* is not
  evidence here, in either direction.
- **The variety is visible in only about a quarter of kitchens on the cooking wall.** In roughly three
  kitchens in four the whole varied run stands on the fridge wall while the cooking wall carries only
  the core and the tall block *(F4)*. **That is the composition working, not a defect**, and it is the
  measured context for Q-7D4-1.
- **Every kitchen with a tall block loses wall A's run-end panel**, in **52.3 %** of placed rooms
  *(measured by the 7D4 planner)*. **This is an owner-ruled consequence of Amendment E and nothing in
  Amendment F moves the figure** — F2 changes which body fills a slot, never which rooms get a block.
  Recorded here so a later reader who notices the missing panel does not raise it against this wave.
- **Four open confirmations sit with the owner and none of them gates a slice**: the cycle's starting
  end (Q-7D4-1); the block's two identical tall door cabinets, which the variety rule does not reach
  and which **cannot** be answered inside this milestone because the catalogue has exactly one
  full-height door body (E12.4, backlog 66); three drawer fronts in a row at the cooking position,
  which two rules ruled on different days produce together and **the owner has never seen next to each
  other**; and F10's price. **The wave is owed confirmations, not rulings.**

## Decision-record sweep — Amendment F

| Record | Standing after F |
| --- | --- |
| This ADR, **Amendment A1** | **Amended in its data, not in its order** (F5). A1 calls its own body list *interim data*; the preparation cabinet's body becomes `base-3drawer` and every position, width and drop rank is untouched. **A1 remains load-bearing for E10's thermal rule** — a wave that re-orders a run still reads E10 first. |
| This ADR, **Amendment A2, A4** | **Unchanged.** The minimum kitchen is still a sink and a hob, and nothing this amendment composes can become a room prerequisite by any route. A4's leftover rule is read and not touched: it stays a pure `freeEndMm → {storageCount, remainderMm}` function and this wave changes **which body fills a slot**, never how many exist. |
| This ADR, **Amendment C** | **Extended, not altered.** The drop order and F7's wall-B reserve are untouched. C's uppers stand exactly as composed today (F9). The dishwasher's eventual insertion into the drop order preserves every relative order C ruled — **and it is 7D5's to land, with one discrepancy of record flagged at F12.** |
| This ADR, **Amendment D / D revised** | **Unchanged.** The row is planned and the shell tiled at its boundaries; F2 is that rule's consequence stated as a prohibition on varying a width. |
| This ADR, **Clarification 2026-09-12** | **Unchanged.** Storage yields during core selection and returns on final remainders; this amendment changes the identity of what returns and not when. |
| This ADR, **Amendment E — E5** | **Read directly, and its clause 2 is now the footing of F6.** E5's *identity changes, count does not* is why a block column carries the storage role. **The citation "E5.2" used in the 7D3 code comment and the 7D4 plan names a section that does not exist in E**; the substance is E5 clause 2 and F6 now rules it in its own words. |
| This ADR, **Amendment E — E6.2, E12.1, E12.2** | **Untouched and asserted unchanged.** The block's composition, its order (tower innermost) and the outermost column's absorbed width are 7D3's; **a rule of this wave going red on a block column is this wave's defect, not 7D3's** (F6). |
| This ADR, **Amendment E — E11, E12.4** | **Unchanged.** The top row stays excluded and new full-height rows wait for beta. F9 records the top row's lift rule with its trigger and builds nothing. |
| [0033](0033-door-count-is-derived-from-width-not-declared.md) | **Load-bearing, and it is why the cycle has four steps** (F3): one door-front base row by decision, so the variety goal is answered in the drawer half. |
| [0026](0026-the-width-floor-has-a-direction.md) | **Untouched, and its 200 mm floor is why `base-cabinet` alone declares `minWidthMm`** (F2). It is also the bottle cargo's own record, and the cargo is not generated here. |
| [0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md), [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | **Unchanged, and the whole of F2's safety argument.** The inclusive 800 mm cap is declared in `src/module-grid.ts` and applied in `merge-empty-columns.ts`; a plan that varies a tile width loses its own boundaries before any insert. |
| [0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) | **Untouched, and it is what F14.1 turns on.** `depthFromBuildId` records the row a recorded extent's depth came from; a declared depth source is not a composed body. |
| [0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md) | **Applied twice.** No generation-side width or price constant is checked against the catalogue (F2), and **no drawer/door classifier is written beside the cycle** — the catalogue's `fronts` declaration is the authority (F7). |
| [0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) | **Cited as the recorded mistake F7 forbids repeating**: inferring a front from a handle or a kind rather than reading the declaration. |
| [0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) | **Carried, and its pointer line is at the head of this amendment** — the obligation 0117's *Consequences* names as owed by Amendment F is discharged here. **Decision 4 and §*unclear* #1 are reconciled at F3**: a proportion that is a consequence of a ruled composition may be asserted; one observed in the owner's practice may not. **No criterion changes on 0117's strength**, as its decision 8 requires. |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | **Applied three times and its distinction respected.** A fourth storage row (F3), the top-row lift (F9) and the bottle cargo's placement (F2, F12) are recorded with their triggers and **nothing is built for any of them**. **F13 is the other side of the rule**: that problem *has occurred*, measured, so it is recorded as a fact rather than as an anticipation. |
| [0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md) | **Applied to this amendment's own sources.** Every file-and-line claim above was re-read at HEAD while writing; the "E5.2" citation (F6), the `shell-design.ts` exception (F14.1) and the third `"storage:"` site (F14.2) are three facts that would have been wrong if transcribed. |
| [0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) Amendment B | **Unchanged.** No bound moves, and the minimum kitchen is not reopened (F11). |
| [0109](0109-a-preset-is-a-recipe-document-and-is-listed-only-if-the-product-would-never-mark-it.md), [0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md) | **Not reached, and they are where the withdrawn lift goes.** A preset may carry any body the editor can insert, including `wall-lift` and `open-shelf`, which generation never produces (F9, ADR 0117 decision 6). |
| [0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md) | **Unchanged.** What a generated kitchen draws is still bounded by the catalogue, and no appliance is sold by this amendment. |
