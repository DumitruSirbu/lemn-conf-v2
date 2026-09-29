# ADR 0110 — Generation inserts through the command path, starting from a shell of empty space, and the corner is structural data

Status: Accepted (**Amendment A, 2026-09-11** — the owner's answers to Q2 and Q3: the kitchen reads fridge → sink → preparation → hob-with-oven, its minimum is a sink and a hob, and at most 599 mm of any run is left empty; also corrects a false claim about ADR 0015 in the M7 plan; **Amendment B, 2026-09-11** — the shell is authored for its room: corner columns derived, free runs tiled with neutral depth sources, wall B planned against the deepest declared depth; **Amendment C, 2026-09-11** — the owner ruled F2 (upper cabinets and a hood), F3 (fridge first, then preparation) and F7 (keep the 100 mm wall-B reserve, an exception to the 599 mm rule); **Amendment D, 2026-09-11** — how a composed kitchen reaches its widths: insert, then `setWidth`, packed against the corner; Amendment B gains **B3a, 2026-09-11** — wall A's floor run stops short by the run-end panel's footprint; **Amendment D, revised 2026-09-11 (7D1 logic review R1.1)** — composition plans each row's widths first and the shell is tiled at exactly those boundaries; insert-then-`setWidth` is withdrawn except at a wall's free end; **Clarification, 2026-09-12** — core selection lets storage yield before a core role, then Amendment A4 refills every final remainder of at least 600 mm; **Correction, 2026-09-13** — odd physical spans plan to their whole-millimetre reachable end, correcting the 1699 witness's planned remainder from 99 to 98 mm without changing the 200 mm usable-remainder rule; **Amendment E, 2026-09-14, drafted for wave 7D3; reviewed and accepted 2026-09-15 by the coordinator with five presentation corrections applied and no ruling, threshold or measurement changed, E1–E13** — the owner's tall-unit and oven rules: symmetry is not a rule of composition; the full-height **block of up to three columns** stands at the free end of ~~wall A and nowhere else~~ **the suffix wall — the *"nowhere else"* was OVERTURNED by an owner ruling and the block follows the run onto wall B where wall B is wider; see Amendment I** — excluding the fridge, and is **one `tall-oven-tower` innermost plus up to two `tall-pantry` outboard** — at most one fridge column, at most one oven column, any number of door columns; the planner takes the largest block that fits, and the threshold follows the block size (**3300 / 3900 / 4500 mm** of wall A, measured); the hob's base follows the oven tower so a kitchen has exactly one oven and never zero; the outermost `'fit'` body absorbs the free-end remainder, which E12's order makes the block's own last column; no upper stands above a full-height body; **no oven ever stands beside the fridge — adjacency is barred, not proximity, and *"minimum have another cabinets between them"* satisfies it; a thermal constraint as well as a workflow one**, already satisfied by Amendment A1's reading order and asserted rather than gated; the generated fridge stays `fridge-free` and is not moved, A1's cooking order winning where the two disagree; **the top row stays excluded, now owner-confirmed**, its eventual replacement being taller uppers rather than a composed row; and new full-height body types wait for beta (backlog 66). E9's pantry deferral is **superseded within the day** by E12 and kept for its sequence; **Amendment F, 2026-09-15, wave 7D4's slice S0, F0–F14** — a long storage run is composed, not repeated: the owner's four statements of 2026-09-14; a four-step storage cycle `[base-3drawer, base-cabinet, base-panbank, base-cabinet]` whose even split is a consequence of its shape and **not a ratio constant**, advanced as **one sequence per kitchen across the corner** from wall B's free end, so wall B's slot count sets wall A's phase; the preparation cabinet becomes `base-3drawer`, amending **A1's *interim data* and not its order**, with *drawers before the hob* recorded as a preference the owner softened and the criterion it would have justified deleted; **this wave changes a body's identity and never its width**, on the inclusive 800 mm merge cap; **a module is identified by what composed it — never by its role and never by its width**, through one exported predicate, because a block column carries `role: "storage"` deliberately under E5 clause 2 and role-scoping is wrong on 32.8 % of placed rooms against correct output (**and the citation "E5.2" names a section E does not contain**); the catalogue's own `fronts` declaration stays the one authority for a drawer front; the wall row composes exactly what it composes today with **no lift and no open shelf generated**, the owner having priced the lift and declined it, and the top row's stretch-ceiling lift rule recorded and not built; the variety's measured **+8.6 %** so the choice is a knowing one; the dishwasher and the bottle cargo recorded and **deferred to wave 7D5**; a new leaf in `configurator-domain` must be exported from `src/index.ts` or the build emits nothing for it; and **two of the wave's criteria corrected — the one-declaration-site grep scoped to composed-body declaration sites, and the id-convention count replaced by a pinned site set**; **F15** closes the dangling citations by carrying the dropped-roles sentence's shape and naming where the owner's wording ruling lives. **Written after the slice it ratifies, which F0 records rather than conceals**; **Amendment G, 2026-09-16, G1–G8 — drawers are anchored to the work, not distributed by a pattern**: the owner corrected the cycle within a day of its acceptance — *"is not like in chess"* — and gave the placement rule directly, so **F3 and F4 are superseded and struck in place** while F1, F2, F5–F15 stand and **F6's provenance discriminator is untouched, because it names a slot's origin and never its body**. Drawer cabinets are anchored **between the sink and the hob**, ideally two; **everything after the hob and after the tall cabinets takes doors**, and so does everywhere else. **The ratio stops being a rule and becomes a consequence of the room**, which is what ADR 0117 asks for and what F3 reached only by argument — so **no criterion may assert a 3-and-3 proportion**, and four of wave 7D4's are withdrawn. Measured against the slots that exist: **a storage slot never stands between the sink and the hob on one wall** — there is exactly one module there and it is the preparation cabinet — so the rule reduces to *the preparation cabinet is a drawer* (already F5) plus *every storage slot is a door* (already today's output), and it composes **zero drawer storage cabinets in all 149 151 rooms that have storage**, at a **31.9 %** fleet-wide drawer share falling to **10–19 %** in long runs. **The *ideally two* is a width change and is never free** — a second module costs a storage cabinet in 45.1 % of rooms, a block column in 31.1 %, a core role in 15.6 %, and nothing in 0.0 % — so it is ruled to **one** pending the owner, and belongs to 7D5 if it is ever two. **`STORAGE_CYCLE` and `base-panbank`'s only caller die with F3**; the owner said twice the rule is not strict, so **G2 is a set of defaults and no criterion may assert it as an invariant**; **Amendment H, 2026-09-16, H1–H8 — the owner's run order, and the split between waves 7D4 and 7D5**: the owner gave the whole order rather than choosing between the coordinator's two candidate placements — **fridge → [door, if space] → sink → drawer [+ a second, if space] → hob → bottle cabinet → [a third drawer, if the run is long] → doors to fill → tall cabinets at the edge** — which **supersedes G2** and reconciles the two readings before it: *"after the hob, doors"* means **after the drawer group**, and the drawers are **one group astride the hob**. **Two of the order's five clauses are already built** — the fridge→sink stretch and the post-hob fill are wall B's and wall A's storage, doors today, **which answers Q-G1 in the affirmative from the owner's own mouth** — and the tall cabinets are Amendment E's block, so **the order adds exactly two modules, both width changes: a 300 mm bottle cabinet and a 600 mm second drawer**. Measured, the order gives **29.8 % drawers at the owner's own six-cabinet run** against G2's 16.7 %, and its residual shortfall falls in runs of 7 and 8 — **exactly the band the unmodelled third clause covers, so the gap is ours and not the rule's**. **G5's *"a second drawer cabinet is never free" is WITHDRAWN**: it displaces a storage slot one-for-one and the cabinet count does not change, so **Q-G3 dissolves** — the error was counting slots and calling the result a kitchen. The bottle cabinet is **free in 45.7 %** of rooms, moves Amendment E's block table **cleanly by +300** (3600/4200/4800), and **refutes D2.2's absorb-window warning by measurement** — 39 530 rooms in the window with and without it — which is struck rather than left standing. **7D4 keeps only the width-neutral part** (preparation and the first post-hob storage become drawer bodies, **1.31 drawers at run 6, and no criterion may claim it meets the proportion**) and **7D5 takes the order**, grouped by what re-baselines the run's arithmetic exactly as F-era D11 grouped the dishwasher and the cargo. **All three phrasings of this rule are recorded with their dates and none is smoothed away**; none of the three corrections was caught by a test or a review, only by asking; **Amendment I, 2026-09-17, written for wave 7D8 slice S1(a) and recording an owner ruling of 2026-09-16 — the block follows the run rather than the letter A, and A1's order survives its own mirror**: shown both measured arms, the owner chose **follow-the-run — 144 866 blocks with 47 175 on wall B and nobody losing one** — over **confinement to physical wall A — 97 691, costing 12 900 kitchens a block they have today**, so **Amendment E's E2 *"and nowhere else"* is OVERTURNED in its wall** while **E2's refusal of the corner end, and E3–E7 and E10–E13 entire, are untouched**. The engineering argument that reaches the same answer — E's stated reason was about *the free end the layout leaves*, not about the letter A (`tall-end-rule.ts:51-53`) — is **kept and explicitly demoted to a reason rather than a permission: the owner did not need it and the ruling does not rest on it** (ADR 0120 D2's lesson applied). On **Amendment A1 the verdict is deliberately split, against the wave plan's tidier "restated, not broken", which this record was asked to check rather than transcribe**: A1's **order** is **RESTATED** and unamended, on the owner's own *"sometimes the arrangement is in mirror, like hub, cabinets (drawers), sink, cabinets, fridge"*; A1's **second sentence** — *"on a left-corner L the run reads from wall B's free end"* — is **CORRECTED** to *the prefix wall's free end*, because it is stated unqualifiedly and is **false in 82 395 of 211 551 placed rooms** after the wave; and *"left to right as seen from inside the room"* is **narrowed to the direction *along the run*, which A1's own *"the fridge is not tied to a wall"* already pointed at**. The reader's rule: **a mirrored kitchen is not A1 violated; a run that does not read fridge → sink → preparation → hob in *either* direction is.** Q-7D8-2 — whether the rule may cost a cabinet — is **left open and not prejudged**; **Amendment N, 2026-09-29** — a U is composed by the owner's own arrangement (M7B Q-U3 (c)): fridge on the wider side wall, sink on the back wall, one run over three walls, a 10 m large-U threshold driving tall cabinets and a base-only back wall; ADR 0120 E not applied to a U; the owner answered all twelve residual questions the same day — the fridge and the one oven tower counted from the corner, E4 unchanged — and five more, RQ13–RQ17, were answered the same day: pantries between the fridge and the free end at every size, and a lone free-end tower stands; no owner question remains for U3)
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

> ~~**Narrowed 2026-09-29 by Amendment N3.8 (owner, M7B Q-U3, relayed):** in a U whose entered walls
> total 10 m or more, the generator may place two `tall-oven-tower` columns.~~ **Narrowing withdrawn
> the same day (Amendment N, RQ5, owner verbatim *"Place one, allow second and third"*): E4 stands for
> every shape, a U included.** The generator places one oven; a customer may add more in the editor.

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
  fridge and gave up the dishwasher. ~~**Where it lands in the ladder is the coordinator's derivation
  from that relation:** leftover storage, then the dishwasher, then the fridge, then the preparation
  cabinet; sink and hob never.~~ **Struck 2026-09-21, wave 7D5b S1 review: once the dishwasher is not
  a core role (Amendment M, M1), it is not on the core-role drop ladder at all — there is no rung for
  it to occupy.** **Every relative order C ruled is preserved and the new member is
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
**Both clear it**, and this is the one position D2.2 measured as surviving. ~~The unsafe case is a cargo
with nothing outboard of it, where its neighbour is the bare remainder — so 7D5 asserts the
neighbours, not the cargo.~~ **Superseded — see J7.** Wave 7D5 slice S1 ships a configuration in which
the bottle cabinet may itself stand last on its wall, with nothing outboard of it, and measurement
shows that case safe too.

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
**One cell of the table they were shown was wrong, and it is corrected at I1.1 below rather than
silently rewritten here — read the two together.**

| | blocks composed | on wall A | on wall B | kitchens that lose a block they have today |
| --- | ---: | ---: | ---: | ---: |
| **HEAD** | 110 591 (52.28 %) | 110 591 | 0 | — |
| **CHOSEN — the block follows the run** | **144 866 (68.48 %)** | 97 691 | **47 175 (22.3 % of placed)** | ~~**0**~~ **74** (I1.1) |
| **REFUSED — the block is confined to physical wall A** | 97 691 (46.18 %) | 97 691 | 0 | **12 900** |

**The ruling: the block follows the run and may stand on wall B.** It is the owner's, not the
coordinator's and not this record's. What they were choosing between was **144 866 blocks with
47 175 of them on wall B and ~~nobody losing one~~ 74 kitchens losing one**, against **97 691
confined and 12 900 kitchens losing a block they have today.**

### I1.1 — CORRECTION, 2026-09-17: 74 kitchens lose a block, not none. The ruling stands; the figure does not

**Written 2026-09-17 by the architect adjudicating wave 7D8 slice S2, whose implementation is in the
working tree and uncommitted at HEAD `355a15e`.** It is recorded here, in I1, because **this is the
section a later reader will quote**, and a correction kept anywhere else would not be read by the
person who needs it.

**What was told to the owner, and what is true.** The chosen arm was presented as *"nobody losing
one"*. **Measured on the 7D8 candidate: 74 kitchens lose a tall block they have today.** The
smallest reported witness is **3300 × 3310**. **[reported by the S2 implementer; not re-measured by
this record]**

**The 74 is not a new measurement, and this is the part that settles it: the number is forced by
this record's own table.** Nothing had to be swept to find it. [doc-quoted from the 7D8 plan, E3,
and arithmetic over the table above]

- HEAD composes **110 591** blocks, all on wall A.
- The chosen arm composes **97 691** on wall A — so **12 900** rooms lose the wall-A block they had.
- The plan's E3 states, in its own sentence, that **12 826** rooms *"would carry a block on wall B
  where HEAD carries one on wall A"*.
- **12 900 − 12 826 = 74.** Those 74 lose the block on A and gain none on B.

**So *"nobody losing one"* was contradicted by the two figures printed beside it.** It was not an
unmeasured claim and not an unlucky sweep; it was an inference — *the total went up, so no room went
down* — drawn over a set difference that the same table already decomposed. **A rising aggregate
never establishes a superset**, and that is the durable lesson here, not the 74.

**The mechanism, and it belongs to the companion ruling rather than to this one.** Wall B's corner
reach is **1000 mm** against wall A's **900 mm** (`lShellFloorRuns`; `wallLengthMm("A") = widthMm`,
`("B") = depthMm` — **[source-verified at `355a15e`]**). At **3300 × 3310** wall B is the wider
**entered** wall by 10 mm, so it becomes the suffix wall and carries the block; but its **free run**
is 3310 − 1000 = **2310 mm** where HEAD's wall-A free run was 3300 − 900 = **2400 mm**. The suffix
run loses 90 mm, the last 600 mm leftover module falls away, `freeEndStorageCount` drops below the
one-module floor E6.2 requires, and **the block is not planned at all** — E6.2's own `1 → 0` step,
reached from the other direction.

~~**Every one of the 74 therefore sits inside the population ADR 0120 Amendment E2 already ruled on**:
the rooms whose two entered lengths differ by less than the 100 mm gap between the two corner
reaches, where *wider by entered length* and *wider by free run* disagree.~~

> **CORRECTED 2026-09-17, measured by 7D8's logic review. The class claim above is false for 20 of
> the 74, and the mechanism is wrong for them too. The count is unchanged.**
>
> **54 of the 74** match the description above: their entered lengths differ by under 100 mm and
> their suffix free run is narrower, so `freeEndStorageCount` falls below the one-module floor. That
> half stands.
>
> **20 do not.** Their entered lengths differ by **110–300 mm** — well outside the 100 mm corner-reach
> gap — and their suffix free run is **wider**, not narrower. Witness **3300 × 3410**: `capB 2410 >
> capA 2400`, leftover 610, which is **one slot with a 10 mm remainder**, and `outermostColumnOf`
> (`tall-end-rule.ts:148-168`) refuses a single fixed-width tower that cannot absorb it. That is
> **ADR 0120 Amendment E6.2's `1 → 0` step**, not the one-module floor and not the corner reach.
>
> **What the correction does and does not touch.** The **count is still exactly 74**, the same rooms,
> smallest 3300 × 3310 and largest 3590 × 3600 — so **the owner's ruling, taken on 74 against 12 900,
> is untouched and is not re-put to them.** What was wrong is this record's account of *why*, and the
> word *"every"*, which would have made criterion 10's close-out line state a mechanism false in
> **27 %** of the set.
>
> **The error is the coordinator's and is the same one that produced the "nobody loses a block"
> figure it replaced**: reasoning from one worked example to a whole population instead of measuring
> the population. The first error was arithmetic over two figures already printed; this one was a
> mechanism inferred from the smallest witness and asserted of all 74. **A witness explains a class
> only once the class has been measured against it.** **That population is the
entered-length key's own consequence, recorded in the 7D8 plan's E1 as *"this ruling rather than a
bug in it"*.** The 74 are that recorded consequence showing up in the block rule. **They are not a
cost of the ruling recorded in this amendment**, which is about *which wall the block follows*; a
room whose suffix run is too short has no block wherever the block is allowed to stand.

**The ruling stands, and is not re-put to the owner. The reasons, in order of weight.**

1. **The comparison the owner made is untouched.** They chose between an arm costing **74** and an
   arm costing **12 900** — a factor of **174**. No correction of this size reorders the two, and
   putting it back would be asking the owner to re-affirm an answer that nothing has moved.
2. **The 74 are not attributable to what the owner was asked.** They are a consequence of the
   entered-length key, which is the architect's measured ruling (E1 / ADR 0120 Amendment E2) and was
   not before the owner. Re-putting *this* ruling would invite an answer to the wrong question.
3. **The refused arm does not avoid them.** Confinement keeps the block on physical wall A, which in
   a B-wider room carries the reading order's prefix and has no leftover modules to convert — which
   is the whole of its 12 900. **There was no arm on the table that cost zero**, and presenting one
   as though there were is precisely the error being corrected.

**And the owner is owed the correction as a notification.** *"Nobody"* is a qualitative promise, not
a rounding; a reader of I1 — including the owner — could reasonably have taken it as *no customer is
worse off*, and that is now false in 74 rooms. **The obligation discharged here is to make the record
true and to tell them; it is not to reopen the choice.** Wave 7D8's close-out carries the line, with
the witness.

**Nothing in the code is defective on this account and no fix is assigned.** S2's implementation
reproduced every other figure in the plan exactly, including criterion 5's zero field differences
across all 129 156 A-wider and equal rooms. **This is a defect of record, and the correcting edit is
this section.**

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

## Amendment J — 2026-09-21: wave 7D5 slice S1, the bottle cabinet ships, and Q-H6 is answered

**Written for wave 7D5 slice S1, before commit.** Amendment H (H1, H5) proposed the bottle cabinet
and its threshold table; this amendment records what slice S1 actually shipped, an owner ruling that
unblocks slice S2, a coordinator ruling on one population Amendment I's mirror opens, the restatement
of every earlier wave's assertion S1 touches, and one clause of the tall-end rule going dormant.

### J1 — Q-H6 = A: the second drawer cabinet is positional, not gated at *D* ≥ 6

**Owner ruling, 2026-09-21 (Q-H6, put by the coordinator as candidate A against candidate C at wave
7D5's E7.1):** the 600 mm `PAN_DRAWER_BASE_BUILD_ID` — two deep pan drawers immediately before the
hob — is placed **wherever it preserves every core role and every tall column**, not only where the
owner's *D* ≥ 6 proportion applies. **This unblocks slice S2**, which E7.1 had left waiting on this
choice. Measured at E7.1: candidate A fires in **71 956 rooms** under the shipped S1 bottle cabinet
(the plan's own pre-S1 figure was 84 291; S1's fix to the core-preserving population, J2 below, moves
it). Candidate C, the threshold-only reading, is refused per E7.1's own recommendation against
candidate B and remains unbuilt.

### J2 — slice S1 as shipped: the bottle cabinet's core-preserving rule, and a defect found and fixed before commit

**The rule.** The 300 mm `base-bottle-cargo` stands immediately after the hob in reading order
(Amendment H1's order, E3's conditional remedy), and is composed only where every core role the plan
would otherwise keep **stays on the wall it has without the bottle** — [ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md)
Amendment E's rule that the sink and the hob stand on the wider wall governs which wall that is.

**A logic review found the first implementation re-cut the core in 4 955 rooms** — the sink moved off
the wider wall when the bottle cabinet's width shifted the wall cut, with witnesses **1500×2800,
2861×2849, 2956×2824**. **Fixed before commit.**

**Census over the approved L rectangle at 10 mm / 2600 mm (QA test, measured):**

| | Rooms |
| --- | ---: |
| Swept | 256 011 |
| Placed (unchanged vs HEAD) | 245 211 |
| Bottle included | 220 266 |
| Bottle omitted | 24 945 |
| — would cost a core role | 15 445 |
| — would refuse the kitchen | 4 545 |
| — would re-cut the core (the found-and-fixed defect) | 4 955 |

**0 `minimumMet` / `dropped` differences against HEAD.** These figures **supersede the wave plan's
reconciliation numbers of 225 221 placed-with-bottle / 19 990 dropped**, which were taken before the
core-preserving fix and before this census.

### J3 — coordinator ruling on the reversed (prefix) wall: the bottle is tried only on the hob's wall, at the cost of one reversed-wall storage slot, and is omitted rather than retried elsewhere if it does not fit

**Coordinator ruling (option B), 2026-09-21 — marked as the coordinator's, not the owner's, and the
owner may overturn it.** Where the whole core stands on the reversed (prefix) wall under
[ADR 0110 Amendment I](#amendment-i--2026-09-17-the-block-follows-the-run-not-the-letter-a-and-a1s-order-survives-its-own-mirror)'s
mirror, the bottle cabinet is tried **only on the hob's wall**, immediately after the hob, **even at
the cost of one reversed-wall storage slot** — consistent with Amendment H1's order and with E3's
"costs one storage slot" outcome. **It is tried on the hob's wall only: if it does not fit there it is
omitted**, rather than being retried by falling back onto the other wall's corner or by breaking the
reading order.

**The population is empty in the approved range**: wave 7D8's finding that *"no room composes the
hob onto the reversed wall"* still holds after this wave. **7D8's 7b witness was restated** with
wider declared runs (wall A 900–5000, wall B 1000–5100) so that two storage slots return to the
witness and the descending-index subject is still discriminated — the witness's population was not
otherwise reachable at the approved policy's original bounds.

### J4 — earlier-wave restatements this wave's obligation reaches (`docs/WORKFLOW.md`: an unrecorded edit to an earlier wave's assertion is a defect)

Each of these is an edit to an assertion a prior wave shipped, restated rather than silently changed:

- **7D3 criterion 12** (`tall-end-composition.test.ts`): the storage count now excludes the bottle
  cabinet.
- **Tall-end block thresholds**: `tall-end-block.test.ts`'s 3300 / 3900 / 4500 mm move to
  **3600 / 4200 / 4800 mm**, matching Amendment H's H5 table.
- **7D2 cut rows**: 3299/3300 mm move to **3599/3600 mm**; the overhang allowance is **500 mm for the
  bottle cabinet only** (200 mm for every other body).
- **7D4 criterion 2**: its witnesses are restated, and the `wallBStorage` arm moves **58 → 59**.
- **7D4 predicate checks** now derive composed slots independently and exclude the bottle cabinet.
- **7D8 re-keyed witnesses**: the whole-with-3367×3506 witness is replaced by
  **3348×3831×2778** — the bottle takes its only wall-B slot in that room.
- **`drawer-rows.test.ts` witnesses**: **1500×3400 → 1500×4410**; **900×4700** loses its pantry
  column to the bottle cabinet.

### J5 — the tall-end block's `coreSurvivedWhole` clause is dormant, not retired

**Measured by the logic reviewer:** hard-wiring the tall-end block's clause 1 (`coreSurvivedWhole`)
true changes **0 plans** over the approved sweep and over a wider 8000×8000 grid. The arithmetic
reason: with 700/600/300 mm module widths, whenever the fridge is dropped the free-end wall has
under 600 mm left after the core plus the bottle cabinet, so the clause never has a case to discharge
where it would matter.

**Per [ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)
decision 1, a rule no test can fail is not a shipped rule.** The clause is recorded here as **dormant, not retired**: it stays in
code, and its trigger for revival is named so the next wave that reaches it does not have to
re-derive it — **S2's added 600 mm pan-drawer module changes the core's width, and the bottle
cabinet being omitted changes it again.** Wave S2 must re-measure the clause once it lands; the
qa-7d3 counter test that had witnessed the clause firing was removed as part of this wave, since it
witnessed a case the clause can no longer reach.

### J6 — the visible consequence: the reference room loses its oven tower

**The reference room's hob changes from `base-hob-2drawer` to `base-hob-oven`** — the bottle cabinet
takes the block's module (E3's "costs a block column" outcome) — and this recurs in **25 recorded
rooms (18 + 7 across the two recordings)**, each of which falls back from `base-hob-2drawer` to
`base-hob-oven` under this wave.

### J7 — H5's "unsafe case" sentence is superseded: the bottle may itself stand last on its wall

**Measured by the logic reviewer, 2026-09-21.** H5 asserted that a 300 mm cargo with nothing outboard
of it — its neighbour the bare remainder — is the unsafe case, and that 7D5 therefore asserts the
neighbours rather than the cargo. **Slice S1 ships a configuration where the bottle cabinet may stand
last on its wall**, relying on `plannedVoid` (`packages/configurator-domain/src/generation/generate-kitchen.ts:599`,
called at lines 408 and 504) matching on the same start and accepting a wider end, so that a trailing
run-end remainder merges with the bottle's own tile up to the inclusive 800 mm cap
([ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md)).

**Measured: 41 298 approved rooms place the bottle last with a remainder of 1–500 mm.**
`generateKitchen` was run over 1 050 kitchens covering those configurations at wall lengths 2200 /
2600 / 3000 mm: **0 throws, 0 bottles misplaced, 0 base width/position mismatches.** The body is
left-aligned in the merged opening, so **D2.2's sliver warning does not apply** to this case.

**H5's sentence is struck above rather than rewritten**, per this record's convention for superseded
prose (`docs/best-practices/documentation.md`). Nothing else in H5 — the cost table, the E-table
shift, or the caveat on sampling — is affected.

## Amendment K — 2026-09-21: wave 7D5 slice S2, the pan-drawer cabinet

**Written for wave 7D5 slice S2, before commit. ~~QA is still measuring the shipped figures, so K5's
population beyond the swept census is recorded as approved and dated rather than final.~~ Superseded
later on 2026-09-21: K5 now carries QA's measured figures, reproduced by an independent census model.**

### K1 — owner, Q-H6a (2026-09-21): the pan drawer takes the single remaining slot on the hob's wall, and D15.7's post-hob drawer is gone there

**Owner ruling.** Where the hob's wall has room for only one more cabinet, the pan drawer takes it,
and 7D4's post-hob `base-3drawer` slot (ADR 0110 Amendment H1, D15.7) is gone in that room. Put to the
owner by the coordinator as **A** (the pan drawer takes the slot) against **B** (keep the post-hob
drawer; the pan drawer stands only where both fit, a population of 431 rooms). **The owner chose A.**

### K2 — owner, Q-H6b (2026-09-21): where the pan drawer and the bottle cannot both stand, the pan drawer wins

**Owner ruling, verbatim:** *"this is a great example of maximaze the space usage, in this particualr
case bottles can be plased in the middle cabinet above the pan drawer and have a entire drawer that
can store a lot of kitchen catles."*

Raised by the logic reviewer: 35 580 rooms where the bottle cabinet (Amendment J) blocked a pan drawer
that would fit alone. **This supersedes J2's statement that slice S1's bottle decision is final**, and
changes S1's shipped census: the bottle now stands in **184 686** rooms rather than **220 266** (K5).

### K3 — coordinator ruling, owner may overturn: the pan drawer is decided first against the core alone; the S1 order governs where it is refused there

The pan drawer is decided **first, against the core alone**. Where it is refused at that stage, the S1
order applies unchanged: the bottle cabinet, then the pan drawer only where it costs that bottle
cabinet's kitchen nothing.

**Why (measured by the logic reviewer):** in every one of the **11 240** kitchens this rule reaches, the
whole core is kept, with one free module on the hob's wall and 310–500 mm spare; against the core alone
that stands a single oven tower with `base-hob-2drawer`. S1's bottle leaves a 10–200 mm remainder there,
so E6.2 steps the block from one column to none. K3's kitchen is therefore **pan drawer + bottle +
`base-hob-oven` with no tower**. The literal pan-drawer-first reading gives **bottle only**, also with no
tower. The core alone with a tower and `base-hob-2drawer` is **not available** under S1's rule (E3/J2,
kept by K4). Deciding the pan drawer against the core alone, before the bottle enters the arithmetic,
keeps both cabinets wherever the room has room for both. **K3 stays marked "owner may overturn."**

### K4 — owner, Q-H6c (2026-09-21): once the pan drawer stands, the bottle gives way rather than a tall column

**Owner ruling.** Once the pan drawer stands, the bottle cabinet gives way before a tall column does.
Put to the owner as pan drawer + all tall columns + no bottle, against pan drawer + bottle + one fewer
tall column (**24 140** rooms) — **the owner chose the former.**

Where no pan drawer stands, the slice S1 / Amendment E rule is unchanged: the bottle cabinet may still
cost a tall column there.

### K5 — measured by the implementer: the approved L rectangle at 10 mm / 2600 mm

- **256 011** swept, **245 211** placed.
- **Pan drawer 92 446** (one-slot 92 015 / two-slot 431, all 431 at wall A = 6000 mm). Both the pan
  drawer and the bottle stand together in **56 866** rooms.
- **Bottle 184 686.** Omitted **60 525** = Q-H6c (K4) 24 140 + Q-H6b (K2) 11 440 + core role 15 445 +
  re-cut 4 955 + refuse 4 545.
- **Differences vs `c67b4ee`:** 0 core-wall, 0 `minimumMet`/`dropped`, 0 rooms with fewer tall columns.
- **D15.7's post-hob drawer population (measured by QA):** the one-slot / two-slot split after
  Q-H6b/Q-H6c is **92 015 one-slot** and **431 two-slot**. The post-hob `base-3drawer` slot therefore
  stands in **431** approved rooms, all at wall A = 6000 mm.
- **QA's independent census (measured by QA):** pan drawer and bottle both **56 866**; pan drawer only
  **35 580**; bottle only **127 820**; neither **24 945** (sum **245 211**). The fallback (K3) fires in
  **11 240**. QA's independent census model agrees field-by-field with the planner on all 245 211 placed
  rooms.

### K6 — J1's "71 956" figure is struck

**Measured by the logic reviewer.** 71 956 is exactly reproduced only by a model that lets the bottle
and the pan drawer re-choose the wall cut, so core roles move walls — a model this wave does not ship.
Against shipped slice S1 it splits as 76 421 = 56 866 legal (K5) + 18 500 moving the sink off the wider
wall + 1 055 moving the preparation cabinet, all three of the latter forbidden by
[ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md)
Amendment E. **The figure put to the owner for Q-H6 was therefore about 26 % high.** The same figure is
struck at the same time in the M7 plan (`docs/milestones/M7-room-and-presets.md`, ~lines 8438 and 8460)
with a pointer back to this note.

### K7 — J5's `coreSurvivedWhole` clause is no longer dormant

**Measured by the implementer.** The tall-end block's clause 1 (`coreSurvivedWhole`, J5) now changes
**140** plans, all `dropped=fridge` with a pan drawer standing and no bottle, over wall A 900–3300 mm ×
wall B 1000–3400 mm.

- **Witness 900 × 3400:** sink, preparation, pan drawer, `base-hob-oven` on wall B.
- **With the clause forced true:** sink, preparation, hob, bottle.

QA is adding this witness (per [ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md)
decision 1). J5 above is left as written and carries a pointer to this note rather than being edited
in place.

**Measured by the logic reviewer, for the owner's information; no ruling needed.** All **1 400**
fridge-dropped kitchens with a pan drawer have **0 columns** and `base-hob-oven`. The **140** plans this
clause now changes differ from `c67b4ee` only by Q-H6b replacing the bottle with the pan drawer. QA
added the **900 × 3400** witness (`tests/generation/pan-drawer-before-the-hob.test.ts`).

### K8 — criterion 9 and D15.7: the physical wall-B arm empties, and coverage converts to a declared witness

**Coordinator adjudication.** Slice S2 empties D15.7's physical wall-B arm inside the approved policy
(26 975 → 0, K5/K1). The M7 plan's criterion 9 (~line 9047, 2026-09-16) posed *"retire the rule, or
reject the candidate"* for exactly this shape of finding; it is resolved by
[ADR 0123](0123-a-ruled-behaviour-whose-population-empties-keeps-its-branch-and-converts-its-sweep-coverage-into-a-declared-witness.md)'s
third route — **keep the branch, and convert its sweep coverage to a declared witness.** Wall B is
covered instead by the declared room **4100 × 6100**, which stands outside the approved policy and is
asserted as such by the tests that draw it.

[ADR 0123](0123-a-ruled-behaviour-whose-population-empties-keeps-its-branch-and-converts-its-sweep-coverage-into-a-declared-witness.md)
decision 3 reads coverage as **"never sought by widening a sweep."** Two tests do sweep a declared band
past the approved policy — `qa-7d8-the-run-follows-the-wider-wall.adversarial.test.ts` (~lines 459–470)
and `qa-7d4-composed-bodies.adversarial.test.ts` (~lines 368–370), over wall A 1600–4000 mm × wall B
6100–6300 mm — and each drawn room in that sweep asserts, in the test's own words, that it lies outside
the approved policy. **Adjudication: a declared, explicitly out-of-policy band satisfies decision 3's
intent**, because it cannot silently widen the admitted population — the band is named and flagged as
outside it, not folded into the swept range as if it were inside. Recorded here as a clarification of
ADR 0123, with the reciprocal one-line pointer placed in that record.

### K9 — earlier-wave restatements in slice S2, in J4's form

Listed as QA reported them; QA's own close-out entry restates them with final figures:

- **Retired guards:** `qa-7d4-body-choice.adversarial.test.ts` "plans the pan drawer into no module",
  `qa-7d4-composed-bodies.adversarial.test.ts` "generates no pan drawer before 7D5 S2".
- **Provenance helpers** identify the pan drawer by id.
- **`qa-7d3` gains a separate 600 mm pan-drawer branch.**
- **D15.7 witnesses moved** to 6000 × 4100 / 4100 × 6100.
- **Criterion 1 at 6300 × 4700 / 6300 × 5100** now reads a single post-hob drawer.
- **Three-arm floor:** wall A 300 → 40; the wall-B floor is removed in favour of the K8 declared
  witness.
- **`qa-7d8`:** 7b's declared runs widened by 600 mm; 7c's floor moves 2000 → 80 in-policy plus 100 over
  the declared band.
- **`qa-7d4-nothing-but-the-body-moved.adversarial.test.ts`:** 3348 × 3831 × 2778 re-pinned; arm floors
  pinned exact (91; `wallBStorage` 55).
- **The generate-kitchen resize witness** moved to 4401 × 1700 × 2000.
- **The recorded-plan classifier** widened.
- **7D3 criterion 12** restated a second time (the hob shift is now attributed to the pan drawer only).

**Further re-pins after Q-H6b/Q-H6c, measured by QA:**

- **`body-choice.test.ts` criterion 22 tally:** bottle 4 → 3, pan drawer 1 → 2 (3300 × 1600 drops its
  fridge, and Q-H6b stands the pan drawer).
- **`pan-drawer-before-the-hob.test.ts`:**
  - the reversed-wall 3399 mm tests now keep the pan drawer and omit the bottle;
  - new 3099 mm contrast;
  - the census is rewritten to model the pan drawer first, the fallback (K3), and Q-H6c (K4);
  - new witnesses: Q-H6b 3350 × 1700 / 1700 × 3600, Q-H6c 5100 × 1700 / 1700 × 5200, fallback
    3650 × 1700 / 1700 × 3800, and J5 900 × 3400 (K7).
- **`qa-7d5-bottle-cargo`:**
  - the census's bottle figure moves 220 266 → 184 686, with Q-H6b and Q-H6c omission categories;
  - the remainder-500 bottle-last merge is now unreachable in-policy at every ceiling (Q-H6b takes that
    room instead). The in-policy merge rows move to remainder 300 (3300 × 1700, 900 × 4100), and the
    500 mm cap is covered off-policy at a 2199 mm ceiling for plan and shell only (4100 × 1700,
    900 × 4900). This also qualifies J7's claim.
- **Recorded-plan classifier:** widened to admit a pan drawer without a bottle, with a new
  `assertThePanDrawerWasDecidedFirst` and a bound of modules lost ≤ 1 + pan drawers. Counts:
  - 7D5 recording: bottle 312 / pan drawer 210 / pan drawer only 78 / exact 90;
  - 7D8 recording: 18 / 57 / 11 / 7.
- **`qa-7d4-nothing-but` criteria 2 and 21:** pan-drawer-only rooms are compared after undoing exactly
  the ruled change (remove the pan drawer, move the hob and following modules back 600 mm, restore the
  outermost slot; swap the hood/upper pair back in the wall row). All undone plans and rows hash
  byte-for-byte to 7D3's recording.

## Amendment L — 2026-09-21: wave 7D5 slice S3, the threshold drawer

**Written for wave 7D5 slice S3, before commit.**

### L1 — owner, Q-H5 (2026-09-21): the third drawer, not a recount of the second

The question put to the owner: in kitchens with *D* ≥ 6 under the adopted reading — E1's *D* as
written, the preparation cabinet **not** counted — 15,986 of 245,211 placed rooms (6.5 %), is prep +
pan drawer the owner's *"2 are drawers"*, or does the owner want a third module? **The figure shown to
the owner in the question was the prep-counting reading instead** — 28,896 of the same population
(about 1 in 9) — which is the reading Q-H3a leaves open and not the one this amendment adopts.

**The owner chose "add a third drawer":** a 600 mm `base-3drawer` after the hob, following
Amendment H1's order — *"hub => bottle cabinets (if space for a large number of cabinets, the drawer
cabinet)"*.

**Offered alternatives, both refused:**

1. Prep + pan drawer, no change — recommended by the architect.
3. A drawer between the fridge and the sink — refused because it would overturn Amendment H2.

**The *D* reading the owner answered under, recorded as the coordinator's reading:** E1's *D* as
written, re-measured at S1/S2's HEAD (`17df3f5`) — `storage:` slots plus the drawer module in the group
astride the hob (i.e. the pan drawer counts, plus the threshold drawer once it exists); the
preparation cabinet does **not** count. **Q-H3a — whether the preparation cabinet counts — is thereby
answered implicitly as "no", as the coordinator's reading; the owner answered the kitchen the
coordinator described, not the counting question directly, and no agent may later quote this as the
owner's own words on Q-H3a.**

### L2 — owner (2026-09-21): the bottle is replaced only where removing it is what makes room for the drawer

**Quoted verbatim:**

> *"as I understand there is place to fit an entire drawer cabinet that has 600mm instead a bottle
> cabinet that has only 300. In this case drawer cabinet wins, but if there is enough place to have a
> bottle cabinet is should be kept and not replaced. You mentioned earlier a scenarion on narrow kitchen
> that if the bottle cabinet is removed a new drawer cabinet fits. This is the only scenarion when
> bottle cabinet should be replaced."*

**Consequence: a proposed K3 refinement — the pan drawer standing in the bottle's place wherever that
keeps the columns — is REJECTED.** The bottle cabinet gives way to the threshold drawer only in the
narrow-kitchen shape the owner names, not more broadly.

**A coordinator error is recorded plainly.** The coordinator first quoted this population to the owner
as approximately **490 rooms**. The actual figure, at `17df3f5`, is **34,220** placed rooms; 490 was
only the *D* ≥ 6 subset the coordinator was working from, misquoted as the whole.

**K3's fallback stands as shipped at `17df3f5`**, unedited by this amendment.

### L3 — owner (2026-09-21): the threshold drawer may cost at most one tall column

The threshold drawer may cost the kitchen at most one tall column. Where placing it would cost two
columns, the kitchen keeps its columns and gets no third drawer. In code:
`THRESHOLD_DRAWER_MOST_COLUMNS_IT_MAY_COST = 1`.

~~**This limit binds nowhere in the approved policy, measured.** It is witnessed instead by declared
runs on 6000 × 5000 × 2200: witness A at wall A 3350 mm and 3300 mm, witness B at wall A 4300 mm.~~
**Restated 2026-09-21, S3 close-out (L4's clean-code split and the branch below made this witness
worth re-measuring):** the implementer measured **2,397,024 declared runs** and found no fitting
candidate that would stand in the bottle's place at a cost of two columns; every refusal in that
sweep was a no-fit, never the one-column limit. The one-column limit only decides between candidates
2 and 3 below, and — measured — never on its own refuses a drawer that would otherwise fit, in any
run swept. **QA is re-witnessing this figure independently; its result is appended to L6.**

### L4 — the rule as built (implementer, source)

- **Coordinator ruling, 2026-09-21 — the removed "in the bottle's place, costing a column" branch is
  restored as a third candidate.** A logic review (measured) found it reachable on declared runs: at
  6000 × 5000 × 2200 with wall A 3350 and wall B 4300, "after the bottle" costs both columns while "in
  the bottle's place" costs only one — and the owner's L2 (*"if the bottle cabinet is removed a new
  drawer cabinet fits … the only scenario when bottle cabinet should be replaced"*) together with L3's
  one-column limit means the drawer takes the bottle's place there, not after it. **The order is now:**
  1. the bottle's place, at no cost;
  2. after the bottle, at ≤ 1 column;
  3. the bottle's place, at ≤ 1 column.
  It is **unreachable in the approved policy**: 0 differences over 1,792,077 rooms at 7 heights (logic
  reviewer, measured), and 0 differences over the approved L at 2200 / 2600 / 3900 (implementer,
  measured).
- **Id `threshold-drawer`, role `storage`.** It is not a composed slot; `isComposedStorageSlot` answers
  `false` for it.
- ~~**Two candidate branches that never fire were removed, per ADR 0093 decision 1:** "after the bottle
  at no cost" — structurally unreachable, because a run short of drawers has no slot after its hob —
  and "in the bottle's place, costing a column".~~ **Corrected above**: only "after the bottle at no
  cost" was removed, and it stays removed — structurally unreachable, because a run short of drawers
  has no slot after its hob. "In the bottle's place, costing a column" was wrongly removed alongside it
  and is restored as candidate 3.

### L4a — clean-code split, S3

`generation-priorities.ts` grew past its shape carrying the bottle, pan-drawer and threshold-drawer
decisions alongside core selection. S3 splits it in place, changing no behaviour: the new
`optional-run-items.ts` holds the bottle, pan-drawer and threshold-drawer decisions; the new (internal)
`run-layout.ts` holds the shared types and helpers those three use; `generation-priorities.ts` keeps
core selection, `builtPlan`, the tall-end block and spatial layout. **The public API is unchanged**:
**328** runtime export keys from `src/index.ts`, identical before and after the split, measured. The
three affordability checks — bottle, pan drawer, threshold drawer — are unified as one function,
`isAffordableWithinColumnBudget`, called with a budget of 0 for the pan drawer and the bottle and 1 for
the threshold drawer.

### L5 — measured by the implementer, approved L, 10 mm / 2600 mm, against `17df3f5`

- **245,211 placed, unchanged.**
- **Threshold drawer in 15,795 rooms.** The bottle gave way in **6,195** of them (all with columns
  kept). A tall column gave way (3 → 2) in **9,600**; of those, **5,700** keep the bottle and **3,900**
  had none.
- ***D* ≥ 6 rooms: 15,986; none still short** (of the threshold drawer, under the L1 reading).
- **Pan drawer 92,446, unchanged. Bottle 178,491** (was 184,686 after S2). **Both together: 50,671.**
- **Tall-column losses: exactly 9,600, all 3 → 2.** `minimumMet`, `dropped` and core-wall differences:
  **0**.
- **J5 live in 140**, as K7 records — unchanged by this slice.
- **Criterion 3/4 and E8.1's figures in the milestone are superseded by this measurement**; struck in
  place there with a pointer to this note.

**Wave close-out, 2026-09-21:** these figures are restated in the milestone's own
[7D5 close-out](../milestones/M7-room-and-presets.md#7d5-close-out--2026-09-21), which also records
the wave's commits, gates, visual gate and the S5/dishwasher hand-off to 7D5b.

### L6 — earlier-wave restatements in slice S3, measured by QA (comment tag `7D5 S3 / Q-H5`)

- **S2 census.** New `finished` totals: both drawers **50,671**; pan drawer only **41,775**; bottle
  only **127,820**; neither **24,945**. Threshold decisions: **6,195** take the bottle's place, **5,700**
  stand after the bottle for the cost of a column, **3,900** stand after the hob for the cost of a
  column. Per-room lists: empty. The 5200 × 5500 witness row moves to **4500 × 5500**.
- **S1 census.** Bottle **184,686 → 178,491**, with a new "threshold drawer took its place" category
  (**6,195**). The identity witness row moves from 4700 × 6000 to **4500 × 6000**; **4700 × 6000** is
  now pinned as a threshold-drawer room instead.
- **Recorded-plan classifier.** Now admits one threshold drawer. Arm counts: bottle **312 → 284**, pan
  without bottle **78 → 106**, threshold **40**, threshold without bottle **33**. **5** new mutation
  witnesses.
- **7D3 criterion 6.** Restated for the drawer's one-column cost: a false counterexample at
  4600 × 5200 × 2200 is fixed by counting the pan drawer's module.
- **`qa-7d3`.** The "1 → 0 only" column-loss sweep now also allows exactly one column lost where a
  threshold drawer arrives.
- **`qa-7d4` predicate.** The threshold drawer is identified by id, with a floor of ≥ 50 rooms.
- **`qa-7d4` criteria 6/7.** A third drawer body is allowed only when it is a ruled `threshold-drawer`,
  with a floor of ≥ 30 rooms.
- **`qa-7d4` criteria 2/21.** A new undo normalisation for the threshold drawer; undone plans hash
  byte-for-byte to 7D3.
- **Three-adapter parity (S2's, missed at the S2 commit).** Pan-drawer bodies must equal the plan's
  `pan-drawer` modules. The drawer-slot witness moves from 1500 × 3400 to **4100 × 6100** (K8's
  declared room). New: a K1 counter-case at 1500 × 3400, and a threshold-drawer render check at
  5100 × 4700.
- **Three-adapter 7D2 reference-room widths (S1's, missed at the S1 commit).** `base-hob-2drawer` and
  the tall-oven-tower rows become `base-hob-oven` rows under J6; the tower's width is checked at
  6300 × 4700.

**The 2,397,024-run witness for L3 (above) is QA's to re-witness independently; QA's figure, once
run, is appended here rather than superseding the implementer's.**

### L7 — a coordinator process error at S1 and S2, recorded plainly

The S1 (`c67b4ee`) and S2 (`17df3f5`) commits were each made after running only the domain suite. The
three-adapter suite was red at both commits — **1 test at S1, 4 more at S2** — found during S3's QA and
restated in L6 above rather than at the commit that broke them. Neither commit was pushed, so nothing
shared was ever broken. **Future slices run the repo-wide `pnpm check` before commit.**

## Amendment M — 2026-09-21: wave 7D5b, the dishwasher, and the oven principle

**Written before code, on the owner's explicit request that these rulings be recorded.** The plan
is [`docs/milestones/M7-room-and-presets.md`, *Wave 7D5b*](../milestones/M7-room-and-presets.md#wave-7d5b--the-plan-2026-09-21-measured-at-head-ec6aca9);
all figures below are quoted from that plan's E1–E8, measured over the approved L rectangle at
10 mm, identical at 2200 / 2600 / 3900 mm ceilings unless stated (**measured by the architect,
scratch `tsc` build of `packages/configurator-domain/src/` at `dd7a25b`, source-identical to
`ec6aca9`**). No code has been written for this wave; nothing here is *coordinator ruling* unless
labelled so.

**M1 — *owner ruling*, Q-DW3 ("Converted, with 1F row").** The dishwasher is a **storage-role**
conversion of an existing door cabinet, not a core role. This **reverses this record's own Amendment F12's
"core role"** statement (see Amendment F above). F12's *"+320 000 per kitchen"* and its
*"block table moves by one module"* are struck.

**M2 — *owner ruling*, Q-DW2 ("Dishwasher first").** The dishwasher is decided before the
threshold (third) drawer: core → pan drawer → bottle → **dishwasher** → threshold drawer. The
preparation cabinet, the pan drawer and the bottle stay ahead of the dishwasher — ***coordinator's
reading*** of the option text, which named only the third drawer. *D* (the drawer count the
threshold rule tests) excludes the dishwasher. Amendment D7's *"drawers have higher priority"* is
**narrowed** to this order. **Measured:** threshold drawers fall from **15,795 to 5,725** once the
dishwasher is decided first.

**M3 — *owner ruling*, the 1F label, approved in session.** Frame 1F gains a dishwasher row,
labelled **ro "Nișă mașină de spălat vase"** / **ru "Ниша для посудомоечной машины"** — the owner's
choice, over the short form, made in session. Status reuses the existing *inclus* / *nu poate fi
inclus* words. This **departs from the approved mockup** (five rows), so it is recorded under
[ADR 0104](0104-a-mockup-departure-is-recorded-not-silently-corrected.md) as a sixth row. The
storage row **excludes** the dishwasher. The visual gate must check the Russian label for
truncation at 390 px, in both status states.

**M4 — *coordinator ruling*.** This record's own Amendment F12 discrepancy — its stated
*"+320 000 per kitchen"* and *"block table moves by one module"* — is closed by M1's reversal; both
sentences are struck rather than silently edited.

**M5 — *coordinator ruling*.** The *"whenever it fits" about mechanisms* relay does not bind this
wave.

**M6 — *owner ruling*, restated verbatim.** *"in my particular kitchen 3.75 m one line…"* — the
owner's own kitchen, cited by the plan beside Amendment D7's 3700 mm record. See the plan's E6 for
the full witness: the owner's nearest room, **4650 × 1000**, reaches its dishwasher only through
M7's clause (c), the last resort, with the final kitchen *fridge · sink · dishwasher · 3-drawer ·
hob-with-oven · bottle*.

**M7 — *owner ruling*, Q-DW1.** Where no door cabinet stands free beside the sink, the dishwasher
may take, in order:

- **(e)** a drawer cabinet — only where **two or more** drawer cabinets exist. Owner, verbatim:
  *"when you have 3 even 2 drawert cabinets dishawasher can take place of one"*;
- **(b)** a pantry column;
- **(d)** the bottle cabinet;
- **(c)** the oven tower — **only as a last resort, and only where the hob then carries the oven**
  (`base-hob-oven`). Owner, verbatim: *"dishwasher should replace a oven tower if there is no place
  to keep both and only if hub is with oven."*

(c) was **first excluded** by this record's Amendment E (no second oven without the tower), and is
now **allowed** under these two conditions.

**M8 — *owner ruling* + *coordinator model*.** The drawer that goes under (e) is **"the one beside
the sink"** — the owner's own words, chosen from the preview *sink · DISHWASHER · pan-drawer ·
hob*. It is modelled **without a core-role loss**: the preparation role moves one module toward the
hob, onto the pan-drawer module's body (`base-panbank`), and the dishwasher takes the 3-drawer's
former module and its `base-dishwasher` body. This record's own Amendment D7 ("at least one drawer
cabinet always stays") and Amendment F5 (the preparation body) are **narrowed** accordingly: D7 to
"at least one drawer cabinet always stays after (e)", F5 to "in (e) rooms, the preparation body is
`base-panbank`".

**M9 — *coordinator model*, owner-seen.** (e)'s identity-only re-modelling (M8) is the
coordinator's construction; the owner saw and accepted its result (the preview), not its
mechanism. **Eligible rooms: 24,160** — 24,100 with exactly two drawer cabinets (preparation +
pan drawer) and 60 with three (plus a post-hob drawer slot); none with four.

**M10 — *coordinator ruling, owner may overturn***. Precedence among M7's trades: **(e) → (b) →
(d) → (c)**. Reason: keep the tall cabinets standing wherever a worktop trade (a pantry column or
the bottle) exists to take the dishwasher instead; (c) is placed last because it is the coordinator's
reading of the owner's *"no place to keep both"* — the tower goes only when nothing else can hold
the dishwasher. **Measured:** with (c) tried before (d), the total dishwasher count is unchanged
(196,621) but **2,600 more oven towers are lost** — 154,286 oven-tower rooms instead of 156,886.

**M11 — *owner ruling*, narrowed by the owner the same session.** Where standing the bottle cabinet
would remove the oven tower, leaving a bare gap the tower could have filled (e.g. **560 mm** in the
reference room **3560 × 2920**), the rule keeps the tower and drops the bottle instead. **Narrowed
by the owner:** this applies only where the tower is the kitchen's only oven **and** no pan drawer
depends on it. Owner, verbatim: *"if you have hub + oven you rarely need second oven, so oven tower
should b replaced, otherwise oven is a must in any kitche."* **Measured: 5,260 rooms change.** The
reference room ends *hob-2drawer · oven tower · 260 mm bare*; the 11,240 rooms where the bottle also
carries a pan drawer are unchanged. This **reverses** this record's own Amendment J6 (the reference
room's lost tower) in those 5,260 rooms, and **narrows** Amendment K3 (the after-the-bottle
fallback) only as far as this rule states — K3 itself is otherwise untouched.

**M12 — *owner principle*.** *"only one oven is not correct, at least one oven is correct, a
kitchen can have multiple ovens, but at least one is a must."*

- Generation's `assertExactlyOneOven` (`packages/configurator-domain/src/generation/generate-kitchen.ts:646-658`,
  called at `:383`) is **stricter** than this principle: it throws unless a generated kitchen
  carries **exactly one** oven. This is recorded as a **deliberate over-constraint**, kept because
  generation always composes exactly one oven by construction (this record's Amendment E4); the
  guard's real job is to catch zero ovens, a programming error.
- The editor (`validate-design.ts`, `src/commands/`, `src/queries/`) has **no oven-count rule of
  any kind** [source-verified: those paths return nothing to a search for "oven"], so a customer
  can reach a kitchen with **zero** ovens through the editor, which the owner's principle forbids.
  **This is out of scope for wave 7D5b**; it is recorded in `docs/BACKLOG.md`.

**Measured headline, final state after the full wave** (*measured by the architect, approved L,
10 mm, identical at 2200 / 2600 / 3900 mm*):

| | Final |
| --- | ---: |
| kitchens with a dishwasher | 196,621 (80.2 %) |
| — M1 (converted door cabinet) | 141,261 |
| — (e) | 24,160 |
| — (b) | 18,200 |
| — (d) | 2,600 |
| — (c) | 10,400 |
| kitchens without a dishwasher | 48,590 |
| oven-tower rooms | 156,886 |
| bottles | 173,691 |
| `base-panbank` bodies (pan drawers) | 92,446 |
| threshold drawers | 5,725 |

Invariant counters, all measured **0**: two dishwashers in one room, a kitchen with zero ovens, a
room whose oven count is not one, a room that loses its oven tower other than through (c), a (c)
room whose hob is not `base-hob-oven`, a missing preparation role not reported in `dropped`, a
remainder of 600 mm or more, *D* ≥ 6 short of drawers, a swap that leaves no drawer cabinet.

**M13 — owner ruling, 2026-09-21, wave 7D5b slice S1 review.** Shown two candidate placements for a
generated dishwasher relative to the sink and the corner cabinet:

- **140,206 of 165,421** S1 dishwashers stand **across the corner** from the sink — on the other
  wall, with the corner cabinet between them. Witness **1500 × 2800**: the two stand about 300 mm
  apart at right angles, and the open door reaches in front of the corner cabinet.
- Only **25,215** stand directly beside the sink on its own wall.

**The owner chose "Keep across the corner."** This **reconfirms this record's own F12** — *"either
side of the sink, across the corner counts"* — rather than narrowing it. **The visual gate's
criterion 11 must specifically check the open dishwasher door against the sink front and the corner
unit's own opening**, not merely against the corner assembly's footprint (risk 2 in the plan).

**M9 addition — recorded for wave 7D5b's logic review.** *D* (the drawer count the threshold rule
tests) keeps excluding the preparation cabinet in (e) rooms, because after (e)'s re-identification
the pan-drawer module carries **both** the preparation id/role and the `base-panbank` body — there is
only ever one drawer body standing there, not two. Re-keying *D* to count the preparation module a
second time by its role, rather than once by its body, would break E1's headline census (F12,
ADR 0121 decision 3: **a thing is identified by what it is**). The census's `base-panbank` count is
kept keyed **by body**, deliberately, and *D* is not re-derived from it.

**Correction — 2026-09-21, wave 7D5b slice S1 review.** Wherever this record or the wave plan asserts
that `dropped` is **empty** in the 24,160 (e) rooms, that is corrected to `dropped` is **unchanged
from S0b**. In **1,200** of the 24,160 (e) rooms, `dropped` is `["fridge"]`, carried over unchanged
from S0b's pre-state — (e) neither adds to nor clears it. The wording at this record's own E6
("`dropped` stays honest") is unaffected by this correction: honesty about an unchanged list is not a
claim that the list is empty.

**M14 — defect found and fixed before commit, wave 7D5b slice S2 review, 2026-09-21.** S2's first
build of trade **(d)** could also cost a composed door cabinet when the sink stood on the reversed
wall — not only the bottle it was meant to cost. **Found independently by two QA agents.** Declared
runs: **1,356**, over 6000 × 5000 and 5000 × 6000 at ceiling 2200 mm, run widths 0–8000 mm at 50 mm
steps. **0 approved rooms** — the defect never reached the approved L rectangle. Witness:
**6000 × 6000 × 2200**, run A **900**, run B **1800**.

**Fixed before commit by `givesUpExactlyTheRuledBody`**, which requires that every trade lose
**exactly** its ruled body, per wall — so (d) can no longer also take a door cabinet by accident.
**Measured after the fix: 0 defective runs**, and the approved L rectangle's census is unchanged.

**M15 — the (c)/(d) edge, measured, logic review, 2026-09-21.** At 1 mm: **3900 × 1700** is **(d)**
(`hob-2drawer · tower`, 0 bare); **3901–4100 × 1700** is **(c)** (`hob-oven · bottle`, 301–500 mm
bare). **Cause: Amendment E, decision E6.2's lone-tower 1 → 0 step.** With the bottle removed the
tower cannot absorb the resulting 10–200 mm gap on its own.

**The bare remainder is inherited, not new.** All **5,200** (c) rooms that keep the bottle already
carried that same remainder past the tower in slice S1's plan — e.g. S1's own **3900 × 1700**
(`bottle · tower · 300 mm bare`) and **4650 × 1000** (**350 mm**). **No owner question is needed.**
The owner's own reference room, **4650 × 1000**, sits inside this band.

**M16 — a copy coupling, logic review, 2026-09-21.** `room.compose.dishwasher` carries the same
wording as `catalog.entries.base-dishwasher` in both Romanian and Russian, but the copy lock guards
only the Romanian side, so the Russian pair can drift with no gate catching it. **Recorded as a known
coupling; not fixed in this wave.**

**Wave 7D5b shipped, 2026-09-21 — the close-out, gate figures and commit hashes are recorded in
[`docs/milestones/M7-room-and-presets.md`, *7D5b close-out — 2026-09-21*](../milestones/M7-room-and-presets.md#7d5b-close-out--2026-09-21),
not restated here.**

## Amendment N — 2026-09-29: how a U kitchen is composed (M7B Q-U3), from the owner's own arrangement

**Written before code, in M7B wave U0.** The plan is `docs/milestones/M7B-u-shaped-rooms.md`, *Owner
questions*, Q-U3, and *U0 measurements*. The owner answered on 2026-09-29 and the coordinator relayed
the answer. The owner chose **option (c), their own arrangement**. That is neither the plan's (a) nor
its (b), and the plan's lean towards (b) is withdrawn. Figures are **[measured]** by `u0-measure.mjs`
(kept by name in the U0 scratchpad; `tsc` build of `packages/configurator-domain/src` at `dd9f63a`).
They come from a **model** of the rules below, not from the generator. U3 must reproduce the model's
witnesses, or stop and report (U3-A3). Each rule is labelled *owner*, *owner (relayed)*, *derived*
(an inference from the owner's words, and a falsifier is named where one exists), or *default pending
RQn* (a residual owner question, listed in N6).

### N1 — the owner's words, 2026-09-29

Items 1, 2, 3 (first line) and 7 are verbatim, typos included, as relayed by the coordinator. Items
3 (follow-up), 4, 5 and 6 are **relayed selections of offered options**, not quotations.

1. *"Need to start from the edge wall (furniture wanted width on that wall) that is wider and paste
   there the fridge and already based on this go fo next sink , place for processing, hob, tall
   cabinets and so on. Such U shape kitchen are popular not apartments but in homes, and in this case
   the sink is placed in the middle wall because there is biggest propability to have window. I now we
   din't add windows and doors t o 3D model but just basic on statistic is like this. even there are a
   lot of place rarely are 2 fridges, can be a big one 2 doors (that we don't have) can be 2 ovens like
   2 near full heigh cabinets with ovens (but in that case no need to have 2 microwaves (we miss an oven
   cabinets wiithout microwave), so U shape is like 2 L shapes in mirror but only with one fridge, one
   sink and can be with 2 ovens but preferable with tall cabinet oven + microwavce because there is
   enought place. In this u shape need more drawer cabinets (more than 2, depending on width maybe 4-5,
   and tall cabinets at sides or if there in sum are near 10 liniear meters can be just standard
   cabinets , and on one wall only base cabinets in general, because is very expesive to add so much
   funriture. So ask more calrification questions if needed because in U shape is most diverse
   possible ways to add cabinets"*
2. On the hob: *"If i look at the U that is upside down , the top wall (middle one will potentially
   get the sink, the dishwasher near sink and prep, now if the fridge is on the right wall (remember
   looking upside down the U), the order should start from right (fridge, sink, dishwasher prep, hob,
   other cabinets, tall cabinets..... If the wall with firdge is really wide like more than 3 meters,
   the fridge is not at the edge but like more in the middle and after it tall cabinets from it till
   wall edge. If the wider wall is the left one (again U is update down) the everything starts with a
   frigde from left and next based on existing logic, and same rule if wall is very wide, place fridge
   more in the middle more near to sink (orpimization of movement)"*
3. On which wall is base-only: *"Depends on size"*. Relayed follow-up: **one "large U" threshold,
   A + B + C ≥ 10 m, drives all three size rules, and the base-only wall is the back wall (A).**
4. Tall cabinets, relayed selection: **"Big U: no tall needed"**. Below about 10 m of total run, tall
   cabinets go at the side-wall ends. At 10 m or more, standard base and upper cabinets are enough, and
   tall ones are optional.
5. Ovens, relayed selection: **"Two tall ovens+mw"**. In a large U, two tall oven+microwave cabinets are
   allowed, using what exists today. A tall oven-only cabinet does not exist, so it goes to the backlog
   as a catalogue gap and is **not added in M7B** (N5).
6. Drawers, relayed selection: **"Min 3, +1 per 2 m"**. That is at least three drawer units, plus one
   for every ~2 m of total run beyond the minimum, capped at 5. *"Beyond the minimum"* was left for the
   architect to define (N3.6).
7. The fridge on a fridge wall wider than 3 m. The coordinator's reading, *"1–2 tall cabinets between
   fridge and free end"*, was corrected by the owner, verbatim: *"1-2 full width cabinet (minimum 600
   mm)"*, then *"not tall, regular one base one, between fridge can be tall cabinets but prioritize the
   regular base ones"*.

On Q-U5, recorded verbatim at ADR 0132: *"… the rest should be independent one from another (as
mentioned on one wall will be frodge on another no)"*. **Wall C is composed on its own terms, never as
wall B's mirror.**

### N2 — the arrangement, read as one run *(derived; the coordinator's summary, checked against N1)*

One run over three walls, with one fridge and one sink:

> fridge wall's free end → [1–2 base cabinets, if that wall is over 3 m] → **fridge** → storage →
> *corner* → **sink → dishwasher → preparation → hob** → drawer and door cabinets → *corner* → the far
> side wall's storage → tall cabinets at its free end (below 10 m)

This is ADR 0110 A1's order (*fridge → sink → preparation → hob*), with M's dishwasher beside the sink
and H1's drawer group, **anchored differently**. In an L, the sink and hob follow the wider wall (ADR
0120 E). **In a U the sink is on the back wall whatever its length**, and the fridge is on the wider
*side* wall. **ADR 0120 E is therefore not applied to a U** (owner, N1.1–N1.2). It stands unchanged for
the L.

*"2 L shapes in mirror"* (N1.1) is read as a description of the shape's two corners, not as a
composition rule. The owner's next clause, *"but only with one fridge, one sink"*, and the Q-U5 answer
both rule out composing wall C as wall B's mirror *(derived)*.

### N3 — the rules, precisely

> **Revised 2026-09-29 by *N3 revised* below**, on the owner's answers to RQ1–RQ12. Items 2, 3, 6, 7,
> 8, 9 and 11 are restated there; **where the two differ, *N3 revised* governs.** This first draft is
> kept, not rewritten, so the reader sees what each answer moved.

1. **Large U** *(owner, relayed)*: `T = A + B + C` from the **entered** lengths (ADR 0120 E2's key)
   and `T ≥ 10 000 mm`. That one flag drives N3.7, N3.8 and N3.9.
2. **The fridge wall** *(owner)* is the wider side wall by entered length. **When B = C**, it is wall B
   *(default pending RQ2)*, which is the L's own tie rule, *"equal walls keep wall B as the prefix"*
   (`generation-priorities.ts:60-61` [source-verified]). The other side wall is the **far wall**.
3. **The fridge's place** *(owner)*. On a fridge wall of 3000 mm or less, the fridge stands at the free
   end, with any bare remainder beyond it at the free end (the L's convention). On a fridge wall over
   3000 mm, `k` full-width regular base cabinets (door body, 600 mm) stand between the fridge and the
   free end, and **`k = 1`** *(default pending RQ3; the owner said "1-2")*. Tall bodies there are
   allowed but never generated (*"prioritize the regular base ones"*). Storage modules fill between the
   fridge and the corner. If `k` modules plus the fridge do not fit, `k` falls. If the fridge alone
   does not fit, **the fridge is dropped** *(default pending RQ9)*, as the L's drop order drops it first.
4. **The back wall** *(owner)*. From the corner shared with the fridge wall, packed in order: sink,
   dishwasher, preparation, hob *(packing, rather than centring the sink under a likely window, is the
   default pending RQ12)*. **The sink must stand on wall A.** Above the walkway floor (ADR 0108 H2)
   wall A's free run is at least 896 mm, so it always does [measured].
5. **When the back wall runs out** *(default pending RQ4)*, the run continues round the far corner. The
   bodies that did not fit stand first on the far wall, in order. If they still do not fit, the
   dishwasher is dropped first and then the preparation cabinet. The sink and the hob are required
   (A2). The minimum kitchen this implies is ADR 0108 H3.
6. **Drawer units** *(owner, relayed; the definition is derived)*:
   `N(T) = min(5, 3 + floor(max(0, T − T_min) / 2000))`. Here `T_min` is the smallest total run an
   approved U can have: `A_min + 1000 + 1000`, which is **4700** with RQ1's default `A_min = 2700`. So
   *"beyond the minimum"* means *beyond the smallest U the product admits*:

   | Total run T (mm) | Drawer units |
   | --- | ---: |
   | 4700 – 6699 | 3 |
   | 6700 – 8699 | 4 |
   | 8700 and above (max 18 000) | 5 |

   A drawer unit is a `base-3drawer` or a `base-panbank`. The preparation cabinet counts as the first
   one, and `base-hob-2drawer` does not count *(default pending RQ6)*. Extra units take door storage
   slots in reading order, starting after the hob, which is H1's group astride the hob. They never
   displace a core body or the dishwasher. **`N` is a ceiling the room may not reach**: a room with too
   few slots gets fewer (measured in N4).
7. **Tall cabinets** *(owner, relayed)*. **Below 10 m**, Amendment E's block stands at the **far wall's
   free end**, capped at three columns, with E3 clauses 1, 3 and 4 and E6 unchanged. E3 clause 2 (*the
   hob on the block's wall*) is **not required in a U** *(default pending RQ11)*, because in a U the
   hob is normally on the back wall. **At 10 m or more**, no door (pantry) column is generated.
8. **Ovens** *(owner, relayed; placement is a default pending RQ5)*. **Below 10 m, E4 stands: exactly
   one oven.** **At 10 m or more, two `tall-oven-tower` columns** stand side by side at the far wall's
   free end, where the block would stand, and the hob is `base-hob-2drawer`. With one free module there
   is one tower. With none, the hob keeps its own oven, so E4's *"never zero"* holds. **E4's "never two"
   is narrowed for the large U by the owner's own ruling (N1.5).** E10 (no oven beside the fridge) holds
   by construction: the fridge is on the other side wall.
9. **The back wall is base-only in a large U** *(owner, relayed)*. At 10 m or more, no wall-row or
   top-row cabinet is generated on wall A. **The hood over the hob stays** *(default pending RQ7)*. The
   owner's reason was cost (*"very expesive to add so much funriture"*), and a hood is an appliance, not
   furniture. Below 10 m, the uppers follow Amendments C and E7 and 7D2's no-upper-over-a-corner-zone,
   at **both** corners.
10. **Unchanged** *(owner, earlier)*: decisions 1–2 (`insertBody` only); declared widths; leftover
    ≤ 599 mm per run end (A4); no upper over a full-height body (E7); a hood over the hob; E10.
11. **The L's optional items in a U** *(default pending RQ10)*. The pan drawer (K) counts as a drawer
    unit. The threshold drawer (L) is replaced by N3.6's count. The bottle (J) is tried after the drawer
    units, on the hob's wall, as in the L.

### N4 — what the rules produce, measured on the model

> **Superseded 2026-09-29 by N4′** (the model re-run on *N3 revised*). The figures below describe the
> first draft's defaults, including two towers and a fridge counted from the free end, and are kept
> only as the record of what the owner was shown.

The grid is A 2700–6000, B and C 1000–6000, step 100: 88 434 rooms at planning depth 600 and height
2600. Every default above is applied, with `k = 1`.

| Outcome | Rooms |
| --- | ---: |
| Composed / refused by the minimum kitchen (ADR 0108 H3) | 86 706 / 1 728 |
| Large U (T ≥ 10 m) / smaller | 63 475 / 23 231 |
| Fridge on its wall / dropped (the fridge wall cannot hold 700) | 85 184 / 1 522 |
| `k = 0` (fridge at the free end, or no fridge: 1 522 of these) / one base cabinet in (`k = 1`) | 14 346 / 72 360 |
| Dishwasher kept / dropped | 73 962 / 12 744 |
| Preparation kept / dropped | 81 738 / 4 968 |
| **Hob on the back wall / round the corner on the far wall** | **56 331 / 30 375** |
| Smaller U: no tall / oven tower / tower + 1 pantry / tower + 2 pantries | 20 171 / 2 380 / 676 / 4 |
| Large U: two oven towers / one / none (hob keeps its oven) | 40 450 / 11 229 / 11 796 |
| Drawer target reached, extra units after the hob only | 10 047 |
| Drawer target reached, extra units in any door slot | 53 038 |
| At least 3 drawer units, any door slot | 75 109 |
| Largest bare run end, fridge / back / far wall | 500 / 500 / 500 mm |

**With `k = 2` instead**, 6 112 rooms keep no module between the fridge and the corner, and rooms with
at least three drawer units fall from 75 109 to 68 149. **So `k = 1` is the default.**

**The drawer target is the finding.** With extra units allowed only after the hob, N(T) is reached in
**10 047 of 86 706** composed rooms. With any door slot allowed, 53 038 reach it. The owner's
*"more drawer cabinets (more than 2 …)"* therefore competes with the dishwasher, the tall block and the
two towers for the same modules. **RQ6 asks which of them yields.**

**Witnesses** for U3-A3, with bodies per wall read from the corner outward. "F" is the fridge wall, and
"far" is the other side wall.

| A / B / C | Predicted |
| --- | --- |
| 2700 / 1000 / 1000 | **Refused** (minimum kitchen) |
| 3000 / 1000 / 1000 | A: sink, hob. No fridge, dishwasher or preparation. No tall |
| 3600 / 2400 / 2000 | F = B: 1 storage, fridge (bare 100). A: sink, dishwasher, preparation. Far = C: hob (bare 400). No tall. 1 oven |
| 5000 / 4000 / 3000 | Large. F = B: 2 storage, fridge, 1 base (`k = 1`, bare 500). A: sink, dishwasher, preparation, hob, 1 storage (bare 200). Far = C: 1 storage, 2 oven towers (bare 200). No uppers on A |
| 6000 / 6000 / 6000 | Large. F = B (tie): 6 storage, fridge, 1 base (bare 100). A: sink, dishwasher, preparation, hob, 3 storage. Far = C: 6 storage, 2 oven towers (bare 200). 5 drawer units |

### N5 — the catalogue gap

There is no full-height oven column without a microwave. This is recorded as **backlog 91** and not
added in M7B (N1.5). ~~A large U's second tower is `tall-oven-tower` until that backlog item is
decided.~~ **2026-09-29, RQ5:** the generator places one tower. A second or third is the customer's,
and today it can only be a `tall-oven-tower`.

### N6 — residual owner questions RQ1–RQ12: **all answered 2026-09-29**

Asked with the defaults below, and answered the same day, relayed by the coordinator. **Free text is
verbatim, typos included. An option pick is marked *relayed selection* and is not a quotation.**

| # | Question | Default offered | Answer |
| --- | --- | --- | --- |
| RQ1 | Is wall A's approved U minimum 2696 exactly, or 2700? | 2700 | **2700** (relayed selection). ADR 0108 H2 |
| RQ2 | Which side wall takes the fridge when B = C? | Wall B | **Wall B** (relayed selection) |
| RQ3 | On a fridge wall over 3 m, one base cabinet or two between the fridge and the free end? | 1 | *"Two"* (relayed selection), **then superseded by the placement clarification**: *"Yes, both from corner"* (relayed selection). The count is taken **from the corner**, not from the free end |
| RQ4 | Back wall full: does the hob go round the corner, or do the dishwasher and preparation yield? | Round the corner | **Round the corner** (relayed selection) |
| RQ5 | Large U: place two oven towers, or place one and allow the second? Where? | Place two | Verbatim: *"Place one, allow second and third .... but if the wall have 6 meters same as with fridge place them 2-3 cabinets from corner, 3-4 meters width 2 cabinets, more than 4 meters 3 cabinets between"* |
| — | Placement clarification (the coordinator's framing, accepted) | — | *"Yes, both from corner"* (relayed selection). The fridge and the tall oven both stand after base cabinets counted **from the corner**: 2 on a 3–4 m wall, 3 over 4 m, and at the free end at 3 m or less |
| — | Tall cabinets below 10 m | — | Verbatim: *"on wide wall between fridge and wall edge (not corner but edge) can be and I think should be placed tall cabinets"*. This **supersedes N1.7's *"prioritize the regular base ones"*** for that gap |
| RQ6 | What counts as a drawer unit, and what yields? | 3-drawer and pan-drawer; the count yields | *"3-drawer + pan; count yields"* (relayed selection), **refined by RQ10** |
| RQ7 | Does a large U's base-only back wall carry the hood? | Yes | Verbatim: *"The hood over hob is mandatory, and we will generate a back wall with only base cabinets but there should be possible to add the middle and top once if needed"* |
| RQ8 | Refuse a U too small for sink + hob in this order? | Refuse | **Refuse** (relayed selection). ADR 0108 H3 |
| RQ9 | A fridge wall too short for the fridge? | Drop | **Try the other side wall first; drop only if neither fits** (relayed selection) |
| RQ10 | The L's bottle, pan drawer and threshold drawer in a U? | Pan counts; threshold replaced; bottle after | Verbatim: *"the bottle cabinets is near the cabinet that have the hob on right side if there is enough space, drawers are counter 3 and 2 drawers cabinets"*. **The threshold drawer was not addressed**, so its default stands, labelled as a default |
| RQ11 | Below 10 m, may the tall block stand when the hob is on the back wall? | Yes | **Yes** (relayed selection) |
| RQ12 | Sink packed from the fridge corner, or centred? | Packed | **Packed from the fridge corner** (relayed selection) |

### N3 revised — the rules as the RQ answers leave them (2026-09-29)

Labels as in N3. *"From the corner"* counts **base bodies standing between the corner's free-run
start and the unit**. A side wall's free run starts past the corner's reach (900 mm at the shell's
600 mm depth) and **stops 100 mm short of the wall's end**. That is the reserve wall B's run keeps for
a later 600 → 700 depth change, and **wall C keeps the same 100 mm** (`lShellFloorRuns`, measured per
corner; ADR 0108 H3). So a side wall's free run is `side − 1000`.

1. **Large U**: unchanged. `A + B + C ≥ 10 000` over the entered lengths.
2. **The fridge wall** *(owner, RQ2, RQ9)* is the wider side wall, or B when B = C. If the fridge does
   not fit there, it goes on the other side wall. It is dropped only if neither side wall holds it.
   **Measured: the fallback never fires on the approved grid (0 rooms)**, because a side wall too short
   for the fridge means the narrower one is too. It is a ruled branch with an empty population, so it
   is kept with a declared witness (ADR 0123).
3. **The fridge's place** *(owner, placement clarification)*. On a fridge wall of 3000 mm or less, the
   fridge stands at the free end, with door storage between it and the corner and any bare remainder
   beyond it. On a 3001–4000 mm wall, **2** base cabinets stand between the corner and the fridge. Over
   4000 mm, **3**. The boundaries *"3–4 m"* = 3001–4000 are *derived*. Where `n` cabinets plus the
   fridge do not fit, `n` falls.
4. **Between the fridge and the free end** *(owner, verbatim above)*. **Below 10 m**, this gap takes
   `tall-pantry` columns: 600 mm each, the outermost widened up to 800 mm to absorb the remainder (E6).
   A 400–599 mm gap takes one pantry at its own width, and a gap under 400 mm stays bare. ~~**At 10 m or
   more** it takes regular door base cabinets *(default pending RQ13)*.~~ **RQ13 (relayed selection,
   2026-09-29, *"Tall cabinets anyway"*): at 10 m or more too.** So N1.4's *"tall optional in a large U"*
   and item 10's *"no pantry generated in a large U"* are **narrowed to the far wall**. Pantries fill
   the fridge-to-free-end gap at every size, and a large U's far wall still gets its tower alone.
5. **The back wall** *(owner, RQ4, RQ12)*. Packed from the fridge corner: sink, dishwasher,
   preparation, hob. What does not fit continues round the far corner. If the run still does not fit,
   the dishwasher is dropped first and then the preparation cabinet.
6. **Drawer units** *(owner, RQ6, RQ10)*. `N(T)` as in N3.6, with `T_min = 4700` (RQ1). A drawer unit
   is a **3-drawer** (`base-3drawer`) or **2-drawer** cabinet. The catalogue's 2-drawer base is
   `base-panbank` (`carriesDrawers(2)`, `catalog.ts:743-748` [source-verified]), so **there is no
   catalogue gap here**. The preparation cabinet counts as the first unit. **`base-hob-2drawer` does
   not count** (RQ15, relayed selection). **The count yields** to the dishwasher, the fridge,
   the tower, the pantries ~~and the bottle~~. **2026-09-29, RQ21 (owner, N10): the bottle yields to
   the count, not the reverse.** Extra units take door slots after the hob, **and always before the
   tower (RQ19 (b), N10)**.
   **Adjudicated 2026-09-29, from U3a's stop-and-report (AC2/AC3).** *"After the hob"* means **in run
   order, across the far corner**: first wall A's door slots after the hob, then the far wall's door
   bases from the corner. The fridge wall is never used, because it stands before the sink. This is
   what N4′'s model computed. S3 confined the extras to wall A, and **that is the defect**. The
   placement is the architect's derivation, not an owner ruling, so it is put to the owner as
   **RQ18** (N6″). ~~Until then it is the default.~~ **The owner confirmed it the same day (RQ18 (a)).**
   ~~**Extra units are `base-3drawer`** *(derived, accepted from S3)*. The owner counted `base-panbank`
   as a unit but named no slot for it, … So no generated U places a pan drawer until RQ18 (b) says
   otherwise.~~ **Overturned 2026-09-29 by RQ18 (b), owner:** the preparation cabinet stays
   `base-3drawer`. The extras are `base-panbank` first, up to two, in the drawer slots nearest the hob
   (directly after the bottle, in run order), and the rest are `base-3drawer`:

   | Units the room gets (RQ19 (a); was `N`) | Preparation | `base-panbank` | `base-3drawer` extras |
   | ---: | :---: | ---: | ---: |
   | 2 (the count yielded) | 1 | 1 | 0 |
   | 3 | 1 | 1 | 1 |
   | 4 | 1 | 2 | 1 |
   | 5 | 1 | 2 | 2 |

   ~~When the count yields, the pan drawers are kept first. *(**Derived**, 2026-09-29, from RQ18 (b)'s
   "nearest the hob". A literal reading of the owner's "if 3 cabinets 1 pan drawer" gives a different
   split where the count yields, so it is put back to the owner as **RQ19 (a)**, non-blocking; this
   sentence is the default until then. See N9.1.)*~~ **RQ19 (a), answered by the owner 2026-09-29,
   verbatim: *"yes when 3 drawer cabinets need to be placed 1 is pan and 2 are 3 drawers cabinet"*.**
   The split is keyed on the drawer cabinets the room **actually gets** (the preparation plus the
   extras that found a slot), not on `N(T)`: 4 or more cabinets give 2 pan drawers, fewer give 1, and
   never more pan drawers than extras. The pan drawers stay nearest the hob. Built at `84bab2e`
   (`panDrawerCountFor`) [source-verified]; the developer measured 13 571 grid rooms changing split,
   all from 2 pan drawers to 1 pan drawer + 1 extra 3-drawer (the HEAD tally of 3-cabinet rooms is
   13 571 in N10's model too [measured]).
7. **The bottle** *(owner, RQ10)*: immediately beside the hob's cabinet when there is space. The
   owner's *"on right side"* is **the next cabinet after the hob along the run** (RQ16, relayed
   selection). **2026-09-29:** its width comes out of the remainder before A4's door fill, as in the L,
   so a bottle can leave a larger bare end than a door module would (≤ 599 mm, A4 still holds). A U
   plan may place the bottle in its own code rather than through `optional-run-items.ts`, provided the
   bottle's build id and width are read from `body-choice.ts` and the catalogue and are not restated
   (ADR 0102). **2026-09-29 (N9.3):** this holds on the far wall too, when the hob has gone round the
   corner. U3a S3 omitted the bottle there, and no record carries that omission, so it is a defect
   where nothing else competes for the space. Where a tall column stands after the hob on the far wall,
   the bottle waits on **RQ20**. **Narrowed 2026-09-29 by RQ20 and RQ21 (owner, N10):** the bottle
   still stands directly after the hob, on any wall, but only where it costs neither the tower, a
   pantry, nor a drawer unit the count still owes. *"Its width comes out of the remainder before A4's
   door fill"* holds only where no drawer unit is lost by it. Where one would be, the bottle drops
   (N10.3). The owner also accepted the mirror, drawers → bottle → hob (N10.1 item 5); the generator
   keeps RQ16's direction (N10.4).
8. **The threshold drawer** (L): replaced by `N(T)` *(default; RQ10 did not address it)*.
9. **The oven** *(owner, RQ5; E4 unchanged)*. **Every U gets exactly one generated oven**: one
   `tall-oven-tower` with `base-hob-2drawer`, or `base-hob-oven` with no tower. A customer may add a
   second or a third tower in the editor, which has no oven-count rule (backlog 70 [doc-quoted]).
10. **The tall layout, in full:**
    - **Fridge wall:** `n` base cabinets from the corner (item 3), then the fridge, then item 4's gap
      to the free end.
    - **Far wall:** the bodies that overflowed round the corner come first, then door storage up to
      `n` base bodies from the corner, with `n` from the far wall's own length by item 3's rule
      *(owner, RQ5)*. Overflowed bodies count toward `n`, and where they exceed it the tower follows
      them directly *(derived)*. Then the tower. **Below 10 m**, pantry columns stand outboard of it
      up to Amendment E's three-column block (E2, E12; RQ11: whichever wall the hob is on). E3
      clauses 1 (fridge and preparation kept) and 4 (height) still apply. **The far wall's
      non-tall run takes regular door base cabinets with uppers above them** (RQ14, relayed
      selection *"Base + uppers"*). The relay framed the question as *between the corner and the
      block*; N6′ had asked about *past the block*. Both spans are read as door bases with uppers
      *(derived)*. **At 10 m or more** the tower stands
      alone, with no pantry generated.
      **Widened 2026-09-29 (N10.3):** the far-wall bottle and every drawer extra on the far wall
      also stand before the tower, and count toward `n` as base bodies. Where they exceed `n`, the
      tower shifts outward. `n` becomes a floor, not the tower's exact place. For a far-wall hob,
      the drawers rest on RQ19 (b) (owner) and the bottle on RQ20's inferred reading. For a
      back-wall hob this is derived.
    - **A far wall of 3000 mm or less** takes the tower, or the block, at its free end, as in
      Amendment E. **A lone tower that cannot absorb the free end's remainder stands anyway, with that
      remainder (≤ 599 mm) bare beyond it** (RQ17, relayed selection, **ruled**). That departs, for a U
      only, from E6.2's *"that block is not planned at all"*. Under E6.2, the owner's *"place one"*
      would be lost in 17 335 more large rooms (N4′).
11. **The hood and the base-only back wall** *(owner, RQ7)*. The hood over the hob is **mandatory in
    every U**. In a large U, wall A's wall and top rows get **no generated body, and generation only**:
    the shell's wall-row and top-row voids on A remain, so the editor can insert there.
    **Source-verified:** generation places each upper by `insertBody` into the shell's wall-row void
    (`generate-kitchen.ts:393-410, 533-560`), so an upper that is not inserted leaves its void behind.
    **Inference, falsified by U3 criterion 6 and U7-A1:** the editor's ordinary insert reaches that
    void. **So no editor change is owed.** U3 owns the voids and the hood (criterion 6), and U7 owns
    the insert on screen.
12. Unchanged: N3.10 (`insertBody` only, widths, leftover ≤ 599 mm, E7, E10).

### N4′ — the revised rules, measured on the model

The model is `u0-measure-rq.mjs`, kept by name in the U0 scratchpad, on the same build and grid as N4
(88 434 rooms, depth 600, height 2600). Its output is `u0-measure-rq-towerbare.out`, which is run
with the RQ17 default, `TOWER_BARE=1`. `u0-measure-rq.out` holds the E6.2 alternative.

| Outcome | Rooms |
| --- | ---: |
| Composed / refused (ADR 0108 H3) | 86 706 / 1 728 |
| Fridge at the free end / 2 from the corner / 3 from the corner / on the other side wall / dropped | 12 824 / 17 320 / 55 040 / **0** / 1 522 |
| Pantries between the fridge and the free end: smaller U / large U (RQ13; re-measured with `RQ13_TALL=1`, output `u0-measure-rq-final.out`) | 8 882 of 23 231 / **60 558 of 63 475** |
| Hob on the back wall / round the corner | 56 331 / 30 375 |
| Large U tower: from the corner / at the free end / none | 29 936 / 21 743 / 11 796 (E6.2 instead: none 29 131) |
| Smaller U tower: at the free end (with 0 / 1 / 2 pantries) / from the corner (0 / 1) / none | 3 917 / 552 / 4 / 95 / 56 / 18 607 |
| Generated ovens per kitchen | exactly 1, always |
| Drawer target reached, extras after the hob / in any door slot; ≥ 3 units after the hob | 16 968 / ~~61 394~~ **47 091** (RQ13 takes the fridge wall's door slots); 41 448. **2026-09-29: not an oracle.** The model placed no bottle, so it overstated wall A's free slots, and U3a's AC3 counted differently (see the note under the witnesses) |
| Largest bare run end, fridge / back / far wall | 500 / 500 / 500 mm. **2026-09-29 (N9.2):** the plan measured 600 on the fridge wall, in 406 rooms that all drop the fridge. That is a plan defect, and the model's 500 stands |

**Witnesses** for U3-A3 (they replace N4's). Each wall reads from its corner outward:

| A / B / C | Predicted |
| --- | --- |
| 2700 / 1000 / 1000 | **Refused** |
| 3000 / 1000 / 1000 | No fridge (neither side wall holds it). A: sink, hob (`base-hob-oven`). No tower |
| 3600 / 2400 / 2000 | B: 1 storage, fridge (bare 100 **beyond the fridge, at the free end: N11.1**). A: sink, dishwasher, preparation. C: hob, ~~(bare 400)~~ **bottle (bare 100), N9.3**. No tower, `base-hob-oven` |
| 3600 / 3500 / 2200 | B: 2 base, fridge, 1 pantry. A: sink, dishwasher, preparation. C: hob, then the tower at the free end. `base-hob-2drawer` |
| 4000 / 4500 / 1200 | B: 3 base, fridge, 1 pantry (bare 400). A: sink, preparation, hob, ~~(dishwasher dropped; bare 400)~~ **bottle (bare 100)**; the dishwasher is dropped. C: empty (bare 200). No tower |
| 5000 / 4000 / 3000 | Large. B: 2 base, fridge, ~~1 door~~ **1 pantry** (bare 500, RQ13). A: sink, dishwasher, preparation, hob, ~~1 storage (bare 200)~~ **bottle (bare 500)**; no uppers, with voids. C: 2 storage **(both `base-panbank`, RQ18 (a), N9.1)**, tower (bare 200 beyond it, RQ17). **3 drawer units (the preparation and 2 on C) of `N(T)` = 5; the count yields.** ~~2 × `base-panbank`~~ **`base-panbank`, `base-3drawer` (RQ19 (a), `84bab2e`).** **Moves again under N10 (RQ21): A: sink, dishwasher, preparation, hob, `base-panbank` (bare 200), no bottle. C: `base-panbank`, `base-3drawer`, tower (bare 200). 4 drawer units** |
| 6000 / 6000 / 6000 | Large. B (tie): 3 base, fridge, ~~4 doors (bare 100)~~ **4 pantries, the outermost 700 (bare 0), RQ13**. A: sink, dishwasher, preparation, hob, ~~3 storage~~ **bottle, 2 × ~~`base-3drawer`~~ `base-panbank` (bare 300; RQ18 (b), 2026-09-29)**. C: 3 storage **(the first 2 are `base-3drawer`, RQ18)**, tower, 4 storage (bare 200). 5 drawer units **(the preparation, 2 on A, 2 on C)**. ~~**Moves again under N11.2 (the RQ23 default): A: sink, dishwasher, preparation, `base-hob-2drawer`, 2 × `base-panbank`, `base-3drawer` (bare 0), no bottle. C: `base-3drawer`, 2 × `base-cabinet`, tower, 4 × `base-cabinet` (bare 200). Still 5 drawer cabinets, 2 of them pan drawers**~~ **2026-09-29: RQ23 answered "Bottle + drawers" (N11.2), so this row does not move; it stands as N10 left it** |

**Corrected 2026-09-29 on U3a's stop-and-report (AC2).** Four witnesses matched. The three rows above
were **the model's error, except the 6000 drawer count, which is the plan's**. The model placed no
bottle (N4′ said so: it modelled neither the bottle nor the drawer bodies), so where a bottle fits,
the plan puts the bottle, 300 mm per S3, where the model put a door module or bare wall. That
explains 4000/4500/1200 (400 = 300 + 100) and 5000/4000/3000 (800 = 300 + 500, too little left for a
600 door). At 6000/6000/6000 the plan's 3 units come from confining the extras to wall A, which is
the defect ruled at *N3 revised* 6. Under RQ18's default the room has 5.

**Corrected again 2026-09-29, before U3a's QA (N9).** Two rows move. **5000/4000/3000:** the plan was
right and the row's text was stale. RQ18 (a) puts the extra drawer units on the far wall's first base
cabinets, and wall C's two bases are exactly those (N9.1). **3600/2400/2000:** the first correction
counted this row as a match, but the plan and the model agreed only because each had left the bottle
out. The model never placed one, and the plan omits it whenever the hob has gone round the corner
(N9.3). With 400 mm after the hob, a bottle fits. So the row is a model error, and the plan has a
defect.

**AC3's drawer tallies are not comparable yet.** The model's "≥ 3 units" counted the preparation.
The plan's figure of 0 means it did not count the preparation, or it counted wall A alone. U3a
re-runs AC3 with one definition: units = `base-3drawer` + `base-panbank` in the plan, the preparation
included. The fridge-position and tower-position splits are compared on a position field the plan
emits (bases from the corner, or free end), never on a heuristic.

### N6′ — residual questions RQ13–RQ17: **all answered 2026-09-29** (relayed selections)

| # | Question | Default offered | Answer |
| --- | --- | --- | --- |
| RQ13 | In a large U, what fills the gap between the fridge and the fridge wall's free end? | Regular door base cabinets | **"Tall cabinets anyway"**. This departs from the default: pantries at every size (*N3 revised* 4) |
| RQ14 | Far wall, below 10 m: door storage or pantries beside the block? | Door storage | **"Base + uppers"**. The owner first asked for an explanation of the question and chose after the coordinator gave one (*N3 revised* 10) |
| RQ15 | Does `base-hob-2drawer` count as a drawer unit? | No | **No** |
| RQ16 | The bottle's *"right side"* of the hob? | After the hob along the run | **The next cabinet after the hob along the run** |
| RQ17 | A lone free-end oven tower with a remainder it cannot absorb? | Stand, with the remainder bare | **Place the tower, and leave the gap bare** (ruled) |

~~**No residual owner question remains on U composition.** U3 waits on no owner answer.~~

### N6″ — one residual question raised by U3a's stop-and-report, 2026-09-29 *(**answered the same day**)*

| # | Question | Default |
| --- | --- | --- |
| RQ18 | (a) When wall A has no more room after the hob, do the extra drawer units (the 4th and 5th in a large U) continue round the corner onto the far wall's first base cabinets, or stay on the back wall, so the kitchen has fewer drawers but keeps them near the hob? (b) Should any of them be a pan-drawer (2-drawer) cabinet rather than a 3-drawer? | (a) **Continue round the corner** (*N3 revised* 6), which reaches 5 at 6000/6000/6000 where the back wall alone gives 3. (b) **All 3-drawer** |

**Answered 2026-09-29, relayed by the coordinator.** (a) **"Round the corner"** (relayed selection).
This matches the default. (b), verbatim: *"like if 3 cabinets 1 pan drawer 2 cabinets with 3 drawers
if 4+ 2 - pan drawers, rest 3 doors"*. A follow-up (relayed selection) confirmed that *"rest"* means
**3-drawer** cabinets, and that the pan drawers take the drawer slots **nearest the hob**, directly
after the bottle. The preparation cabinet stays `base-3drawer`. **This departs from default (b)** and
is recorded at *N3 revised* 6. ~~**No owner question remains on U composition.**~~ **2026-09-29: N9
raises two more, RQ19 and RQ20. Both are non-blocking, and their defaults are built.** **Both were
answered the same day, with a third, RQ21, and the answers are recorded at N10.**

~~**The owner's words leave this open.**~~ *(What follows was the question's framing before the answer.)* The owner asked for *"more drawer cabinets (more than 2,
depending on width maybe 4-5"* and ruled *"count yields"*, but never said where the extras stand. The
L's own drawer rule keeps them *"near"*, astride the hob (H1). **U3a is not blocked:** it builds the
default, and an answer of *"stay on the back wall"* is a one-lane change.

### N6‴ — the preparation cabinet, confirmed by the owner, 2026-09-29

The owner, unprompted, describing the U kitchen (verbatim, typos included): *"btw if there is place
the cavbinet between sink / dishwasher and hob will be great to be a 3 drawer to store there the
kitchen spoons, knifes used or food preparation"*.

This **confirms Amendment F5** (the preparation cabinet's body is `base-3drawer`) for the U shape,
rather than changing it. The code already does this — `generation-priorities.ts:93-95` — and the U
planner reads the same priorities table. Per RQ18 (N6″), the preparation cabinet is **drawer unit 1**
in the drawer count that RQ18's extras (`base-panbank`, then `base-3drawer`) are counted against. No
rule changes; this is an owner confirmation of existing, shipped behaviour.

### N7 — what this amendment does not change

The L and the straight kitchen are untouched: every rule above is scoped to `shape === "U"`, and
U3-A4 holds both byte-identical. Decisions 1–2 bind unchanged. The plan's Q-U3 options (a) and (b) are
withdrawn, and the (a)/(b) comparison was not measured, because the owner chose neither.

### N8 — sweep

| Record | Effect |
| --- | --- |
| This record, A1, A2, A4, H1 | **Kept.** The order along the run, the minimum kitchen, the leftover rule and the drawer group astride the hob all hold in a U. **A4's ≤ 599 mm fill applies to all three walls of a U, including wall A after the hob** — a coordinator correction (2026-09-29) of the implementer's first reading, which had confined it to walls B/C |
| This record, E3 clause 2 | **Not required in a U** (N3.7, pending RQ11); stands for the L |
| This record, E4 | ~~**Narrowed for the large U** by owner ruling (N3.8)~~ **Unchanged for every U (RQ5, 2026-09-29)** |
| This record, E6.2 | **Departed from for a U's lone free-end tower**, ruled by RQ17 (*N3 revised* 10) |
| This record, I (the block follows the run) | **Consistent**: the U's block stands at the run's far free end |
| This record, J, K, L | RQ10: the bottle sits beside the hob (side pending RQ16); a 2-drawer counts; the threshold drawer is replaced by default |
| [ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) E | **Not applied to a U** (N2); stands for the L |
| [ADR 0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) | Consistent. This is the owner's own baseline, not a preset |
| [ADR 0132](0132-wall-c-is-a-world-wall-and-only-the-right-corner-is-drawn-in-a-reflection.md) | Representation. Composition does not read which wall is drawn mirrored |
| [ADR 0108](0108-a-room-is-validated-against-policy-data-and-the-interim-policy-is-the-engines-own-limits.md) H | The minimum-kitchen predicate these rules imply |

### N9 — U3a's two open items, adjudicated before QA, 2026-09-29 (and a third, found doing it)

The coordinator asked for these rulings after the RQ18 fix (`44ad180`), before U3a's adversarial QA.
Figures are **[measured]** by the architect. `planUKitchenComposition` was built with `tsc` from
`packages/configurator-domain/src` at `58376f4` and swept over N4′'s grid: A 2700–6000, B and C
1000–6000, step 100, height 2600, runs from `uShellFloorRuns`. The sweep composes **86 706** rooms, as
N4′ does. Each claim is labelled *doc-quoted*, *source-verified* (this repository's source at
`58376f4`) or *inference*.

#### N9.1 — 5000 / 4000 / 3000: wall C's two bases are drawer units. The witness text was stale, and the plan is right

**Ruling.** The two door bases between wall C's corner and its free-end tower are `base-panbank`. The
room has 3 drawer units of `N(T)` = 5: the preparation and those two. The count yields. N4′'s row is
annotated, and the code does not change.

- *Doc-quoted.* RQ18 (a) asked whether the extra units *"continue round the corner onto the far
  wall's first base cabinets"* (N6″). The owner chose **"Round the corner"** (relayed selection).
  *N3 revised* 6 reads that as *"then the far wall's door bases from the corner"*.
- *Source-verified / measured.* Wall A has no door slot left after the hob: it ends with the bottle
  and 500 mm bare. Wall C's bases stand at 900–1500 and 1500–2100, then the tower at 2100–2700. They
  are the far wall's first base cabinets from the corner.
- *Doc-quoted.* The question, the answer and *N3 revised* 6 put no condition on the far wall's
  length. *N3 revised* 10's ≤ 3000 mm clause decides where the **tower** stands. It says nothing about
  the door bases.
- *Source-verified, then inference.* The two bases are the modules `towerAtTheFreeEnd` frees when a
  large U caps the block at one module (`u-tall-layout.ts:207-210`, `extraStorageCount`). That is how
  this code builds them. No owner answer and no record treats them as a separate category. F6 does
  separate a door module from a tall column, and the plan honours that by converting only
  `DOOR_BASE_BUILD_ID` bodies (`u-composition.ts:471`). No record separates one door module from
  another by the step that placed it.

**Alternative refused:** exclude a ≤ 3000 mm far wall's fill bases from RQ18 (a). No owner wording
supports that. It would also leave this room with one drawer unit, the preparation, against the
owner's *"Min 3"* (N1.6), while two door slots stand in the run after the hob.

**A second question the row exposes, put to the owner as RQ19 (a), non-blocking.** The plan gives
this room 2 pan drawers and no 3-drawer extra. It keys the split on `N(T)` = 5 and keeps the pan
drawers first when the count yields (*N3 revised* 6, derived from RQ18 (b)'s *"nearest the hob"*). The
owner's own words were *"if 3 cabinets 1 pan drawer 2 cabinets with 3 drawers if 4+ 2 - pan drawers"*.
Read against the number of drawer cabinets the room actually gets (3), they give 1 pan drawer and 1
extra 3-drawer. The owner's wording does not settle which count *"3 cabinets"* means. **The two
readings differ in 13 571 rooms [measured].** ~~The built default is the recorded sentence.~~
**Answered 2026-09-29 by the owner, verbatim: *"yes when 3 drawer cabinets need to be placed 1 is
pan and 2 are 3 drawers cabinet"***. That is the count the room gets. It is built at `84bab2e`
(*N3 revised* 6). N10's RQ21 then gives this room a fourth drawer unit on wall A (N10.6).

**RQ19 (b), non-blocking.** In **18 602 rooms [measured]**, at least one extra drawer unit stands on
the far side of the tall oven cabinet. The example is 2700/4000/4000, where wall C reads dishwasher,
preparation, hob, tower, `base-panbank`. It happens when the door slots between the hob and the tower
run out before the count does. In the example there are none, because the overflowed core already
exceeds `n` and the tower follows the hob directly (*N3 revised* 10). Those bases are the far wall's first base
cabinets after the hob in run order. So RQ18 (a) covers them *(inference: the owner chose more drawers
over drawers near the hob, but was not shown a tall cabinet between them)*. ~~The built default keeps
them.~~ **Answered 2026-09-29, owner: the drawers go between the hob and the tall oven, and the tower
shifts (N10.1 item 2).**

#### N9.2 — the fridge wall's 600 mm bare end is an implementation defect, together with a test-fidelity defect

**Ruling.** When the fridge is dropped, the plan leaves the fridge wall's whole free run empty. A4
forbids that whenever the run is 600 mm or more. **The fix:** the dropped fridge's wall is filled
from its corner with 600 mm door bases (`base-cabinet`), and the bare remainder, < 600 mm, is left
at the free end. These bases are never drawer units, because the fridge wall stands before the sink
in run order (*N3 revised* 6).

- *Doc-quoted.* A4: *"every bare run end of 600 mm or more receives 600 mm storage bases until less
  than 600 mm remains; the remainder, at most 599 mm, stays"*. The cap binds *"what the product
  proposes"*. N8: *"A4's ≤ 599 mm fill applies to all three walls of a U"*. U3a AC1: *"Every bare
  run end is < 600 mm"*. F7's exception does not apply, for two reasons. It concerns wall B's reserve
  beyond the run's end, while this 600 mm is inside the run (`remainderMm`). And it also occurs on
  wall C (3000/1000/1600), which F7 holds to 599 *"without exception"*. **The contract has no
  gap.**
- *Source-verified.* The dropped branch of `placedFridge` returns `bases: []` (`u-composition.ts:230-236`),
  and `planUKitchenComposition` then discards the fridge wall's bases (`:550-554`). `planUTallLayout`
  fills only the gap after a fridge (`u-tall-layout.ts:63-71`). Nothing else writes to that wall.
- *Measured.* 406 grid rooms have `remainderMm` = 600 on the fridge wall. **All 406 drop the fridge,
  and all 406 have an empty fridge wall.** An example is 2700/1600/1600: B's run is 900–1500, and
  nothing stands on it. At 10 mm resolution the bare end reaches 690 mm (3000/1690/1690, B). Any run
  shorter than the fridge's 700 mm width is left bare, so the bare end can reach 699 mm. The back wall
  and the far wall peak at 500 mm, as N4′ does.
- *Doc-quoted, the misreading behind it.* RQ9's **empty population** is the *other-side-wall
  fallback*: *"the fallback never fires on the approved grid (0 rooms)"* (*N3 revised* 2). **The drop
  is not empty.** It fires in **1 522 rooms** (N4′, and 1 522 measured at `58376f4`). The code and
  the tests conflate the two. `u-composition.ts:185` and `u-tall-layout.ts:39` call the drop *"RQ9's
  own empty-population branch"*. `u-tall-layout.property.test.ts:164-178` then **leaves the dropped
  fridge's wall out of the bare-run-end property** on that premise, so the property could not fail
  where the plan does. `u-tall-layout.property.test.ts:115` and `u-composition.property.test.ts:164`
  repeat the premise. **The defect is pre-existing, and the RQ18 fix did not cause it** (the
  implementer checked with `git stash`, per STATUS).
- *Derived.* The remainder goes at the free end. That is the far wall's own door fill when no tower
  stands (`doorFill`, `u-tall-layout.ts:369-385`, filled from `run.startMm`), and it is *N3 revised*
  3's convention of bare wall beyond the last body. **Alternative refused:** the remainder at the
  corner, which is `fridgeAtTheFreeEnd`'s convention. That exists to keep the fridge flush with the
  free end, and without a fridge nothing needs to be flush. **2026-09-29, N11.1:** this sentence
  described `fridgeAtTheFreeEnd`'s convention and did not rule on it. N11.1 rules it a defect: with a
  fridge too, the remainder goes beyond the fridge, at the free end.

#### N9.3 — found while adjudicating: the bottle is never placed when the hob has gone round the corner

**Ruling, in part.** This is an implementation defect wherever nothing else competes for the space
after the hob. Where a tall column competes, the contract has a gap, which is put to the owner as
RQ20.

- *Doc-quoted.* *N3 revised* 7: the bottle stands *"immediately beside the hob's cabinet when there
  is space"*, with *"its width [coming] out of the remainder before A4's door fill"*.
- *Source-verified.* `wallAFill` is the only place the plan puts a bottle, and it runs only when the
  core never left wall A (`u-composition.ts:547-549`). Its comment calls the far-wall omission *"a
  scope boundary"* (`:384-388`). **No record carries that boundary.** A grep of this ADR, the M7B
  plan, STATUS and BACKLOG finds nothing.
- *Measured.* The hob stands on the far wall in **30 375** rooms, and **none of them has a bottle**.
  They split three ways. In **6 021**, no tall column stands on that wall and 300 mm or more of run
  follows the hob. In **8 822**, 300 mm or more stands between the hob and a tall column. In **9 025**,
  the tall column follows the hob directly, so there is no space and no bottle is correct.
- **Ruled: the 6 021.** Everything after the hob on that wall is door storage or bare wall, so the
  bottle stands directly after the hob. Its 300 mm comes out of the remainder, and the door fill is
  redone on what is left (*N3 revised* 7, as written). Witness **3600/2400/2000** changes: C reads
  hob, bottle, bare 100 (N4′, corrected).
- **Not ruled: the 8 822.** Here the bottle lands between the hob and the tower. On a far wall over
  3000 mm, it either displaces a counted door base or pushes the tower along. *N3 revised*'s *"from
  the corner counts base bodies"* suggests the bottle counts toward `n` *(inference)*. On a far wall
  of 3000 mm or less, its 300 mm comes out of the leftover before the block and can cost the tower.
  The L's precedent is split. Without a pan drawer, the bottle may cost a tall column (Amendment J).
  With one, it gives way (K4). **So the owner decides (RQ20).** The built default is the plan's
  current behaviour: no bottle between the hob and a tall column on the far wall.
  **Answered 2026-09-29 (N10):** where it fits, the bottle goes directly after the hob and the tower
  shifts. Where it would cost the tower, or a drawer unit (RQ21), it is left out.

#### N9.4 — owner questions RQ19 and RQ20 (non-blocking; defaults built)

| # | Question, as it is to be put | Default built |
| --- | --- | --- |
| RQ19 (a) | *"A U kitchen sometimes has room for fewer drawer cabinets than its size calls for. Take a 5000 / 4000 / 3000 room. Its size calls for 5, and it has room for 3: the 3-drawer preparation cabinet plus 2 more. Today both extras are pan-drawer cabinets. That follows your 'if 4+, 2 pan drawers', counted by the room's size. Did you mean the count the room actually gets instead? Then 3 cabinets would be 1 pan drawer and one more 3-drawer."* The readings differ in 13 571 rooms | 2 pan drawers (by size), pan drawers kept first |
| RQ19 (b) | *"When the hob has gone round onto the side wall and the tall oven cabinet stands right after it, the extra drawer cabinets end up beyond the tall cabinet. For example: dishwasher, preparation, hob, tall oven, pan-drawer. Keep them there, or stop at the tall cabinet and have fewer drawers?"* 18 602 rooms | Keep them there |
| RQ20 | *"When the hob has gone round onto the side wall and a tall cabinet stands one or two cabinets after it, should the bottle cabinet go right after the hob? That moves the tall cabinet 300 mm along, and on a short wall it can cost a door cabinet or the tall oven cabinet itself. Or should that wall go without the bottle?"* 8 822 rooms | Without the bottle |

A different answer to any of the three changes one step in `u-composition.ts` or `u-tall-layout.ts`,
plus its witnesses. None of them moves a core body, the fridge, the oven count or a bare end past A4.
**U3a is not blocked**, which follows RQ18's precedent (N6″).

**All three were answered on 2026-09-29, and a fourth, RQ21, was raised and answered the same day.**
RQ19 (a) took the count the room gets, built at `84bab2e`. RQ19 (b) and RQ20 both depart from the
defaults above. **The answers, the rule they leave, and its measurement are at N10.** The *"Default
built"* column is history.

#### N9.5 — consequences

- **Code changes before U3a's QA:** N9.2 and N9.3's ruled part. The punch list is in the architect's
  report to the coordinator, 2026-09-29, and the M7B plan's U3a AC1 and AC2 carry the test changes.
- **AC3's regression pins do not change:** largest bare end 500 / 500 / 500 on the grid. After the
  N9.2 fix, the fridge wall must measure 500, not 600. That is expected and has not been measured.
- **U3b:** the dropped fridge's wall now carries door bases, so U3b's uppers loop meets side-wall door
  bases in fridge-less rooms. No new rule applies. The uppers follow Amendment C and E7 as on any door
  base.

### N10 — RQ19, RQ20 and RQ21 answered, and the rule that fits the hob's wall, 2026-09-29

The owner answered RQ19 and RQ20 (N9.4) on 2026-09-29, and the coordinator relayed the answers. The
coordinator then put a drop order to the owner, and the owner overturned it the same day (RQ21).
Figures are **[measured]** by the architect. The model is `n10-model.mjs`, kept by name in the
architect's scratchpad for this session, and its output is `n10-default.out`. The model runs over
`planUKitchenComposition` built with `tsc` from `packages/configurator-domain/src` at `84bab2e`, and
applies the rule below to each plan. The grid is N4′'s: A 2700–6000, B and C 1000–6000, step 100,
height 2600. Every claim is labelled *owner* (a verbatim quotation), *source-verified*,
*doc-quoted*, *derived*, or *inference*.

#### N10.1 — the owner's words, 2026-09-29

Quotations are verbatim, typos included, as relayed by the coordinator.

1. **RQ19 (a):** *"yes when 3 drawer cabinets need to be placed 1 is pan and 2 are 3 drawers
   cabinet"*. The split follows the count the room actually gets. Built at `84bab2e` (*N3 revised* 6).
2. **RQ19 (b):** the owner was shown `corner │ dishwasher │ 3-drawer prep │ HOB │ TALL OVEN │
   pan-drawer │ end` and answered *"you should place the drawer cabinet between hob and tall oven"*.
3. **RQ20:** the coordinator explained that a bottle directly after a far-wall hob moves the tall
   column 300 mm along, and that on a full wall it does not fit. The owner was shown `corner │
   dishwasher 600 │ prep 600 │ HOB 600 │ BOTTLE 300 │ TALL OVEN 600 │ ✗ doesn't fit` and answered
   *"in this particular case it can be without bottle cabinet"*. **Reading (inference):** where the
   bottle fits, it goes directly after the far-wall hob and the tall column shifts. Where it does not
   fit, there is no bottle. The falsifier is an owner answer that a far-wall hob never takes a bottle
   when a tall column stands on that wall.
4. **The oven:** the coordinator's proposed step read *"3. Never drop the tall oven, since it's the
   room's only oven"*, and the owner answered *"yes especially when its the only oven"*.
   **Owner-confirmed.**
5. **The bottle's side:** *"hob , bottle and after drawers, or drawers, bottle and after hob"*.
   **The coordinator's reading (inference):** the bottle always stands directly next to the hob, and
   the drawer extras stand on the bottle's far side. Either direction is acceptable.
6. **RQ21, what drops first:** *"extra drawers if there is no enoygth space for both drawers have
   priority, also priority have oven always"*. This **reverses** the coordinator's proposal, which
   was never built: extras first, down to three, and then the bottle. The owner's order is this: the
   tall oven is always kept, drawer units outrank the bottle, **so the bottle drops first**, and only
   then do the extra drawer units drop.

#### N10.2 — earlier dated records these answers reach, named rather than overridden silently

| Record | What it said | What changes, and on whose authority |
| --- | --- | --- |
| *N3 revised* 6 (2026-09-29) | *"The count yields to the dishwasher, the fridge, the tower, the pantries and the bottle"* | **Reversed for the bottle** by RQ21 (owner). The count now outranks the bottle. The other four stand, **pantries included** (see N10.7) |
| *N3 revised* 7 (2026-09-29) | The bottle's *"width comes out of the remainder before A4's door fill, as in the L"* | **Narrowed** by RQ21 (owner). The bottle takes its width first only where that costs no drawer unit the count still owes. The owner's words carry no wall, so the rule reaches wall A and a far wall without a tower too *(derived; the falsifier is an owner answer confining RQ21 to the tall oven's wall)*. The L already ranks its pan drawer above the bottle (K2, *"the pan drawer wins"* [doc-quoted]), so the U now follows the L more closely than before. **Wall A confirmed 2026-09-29 (owner, N10.9): "Drawer cabinet wins". RQ21 on wall A is owner-confirmed, no longer derived.** ~~The falsifier, an owner answer confining RQ21 to the tall oven's wall, did not occur.~~ The far-wall-without-a-tower half of the reach remains derived |
| *N3 revised* 10's derived clause, and RQ5 | Overflowed bodies count toward `n`, and the tower follows them where they exceed it. RQ5: *"2-3 cabinets from corner"* | **Widened.** The far-wall bottle and the far wall's drawer extras also stand before the tower, and the tower shifts. `n` becomes a floor, not an exact place. For a far-wall hob, the drawers are owner-backed: RQ19 (b) says *"between hob and tall oven"*. The bottle rests on RQ20's reading, which is an *inference* (N10.1 item 3). For a back-wall hob it is **derived** (N10.3 step 4) |
| N9.3 and N9.4, RQ20's default | *"No bottle between the hob and a tall column on the far wall"* | **Superseded** by RQ20 (owner) |
| N9.1 and N9.4, RQ19 (b)'s default | *"Keep them there"*, meaning extras beyond the tower | **Superseded** by RQ19 (b) (owner) |
| N6′ RQ16 (relayed selection) | *"The next cabinet after the hob along the run"* | **Widened** by N10.1 item 5 (owner): either side of the hob is acceptable. The generator keeps RQ16's direction (N10.4), so nothing built is overridden |
| J, J3 and J7 (the L) | Without a pan drawer, the L's bottle may cost a tall column | **Not carried into a U.** A U's bottle never costs the tower (N10.1 items 4 and 6). **The L is untouched** (N7) |
| E4 | Exactly one oven | **Unchanged.** Measured: no room gains or loses its tower (N10.5) |
| N1.6 (*"Min 3"*) and RQ6 (*"count yields"*) | Three drawer units at least, and the count yields | **Unchanged.** Extras never drop to make room for the bottle. Below `N(T)`, and below three, they drop only where the core, the tower or a pantry needs the space. The coordinator's *"down to the minimum of 3"* is read as that: the minimum is never given up for the bottle, and it is not a floor over the oven, which the owner ranks first (*inference*) |

#### N10.3 — the rule, precisely *(U only)*

**Run order** is *N3 revised* 6's order: wall A read from the fridge corner, then the far wall read
from its own corner. The fridge wall is never part of it. **Extras owed** is `X = N(T) − 1` when the
preparation cabinet stands, and `N(T)` when it has been dropped.

**Along the hob's wall, from the hob:** hob → **bottle** → **drawer extras** → plain door bases, only
to make up `n` → **the tower** → pantries (below 10 m) → door fill → bare end < 600 mm. With the hob
on wall A, the sequence runs round the far corner: hob → bottle → wall A's drawer extras → *corner*
→ the far wall's drawer extras → plain doors up to `n` → tower → pantries → door fill.

The decision order is also the priority order, first to last:

1. **The core run and the fridge wall do not change** (*N3 revised* 2–5). No body in this rule moves
   a core body, the fridge, or anything on the fridge wall.
2. **The tower** *(owner, N10.1 items 4 and 6)*. It stands exactly where it stands at `84bab2e`,
   meaning it stands if and only if it stands with no bottle and no extras on its wall
   (*N3 revised* 9–10, RQ17). Nothing placed after this step may remove it. So E4's one oven and the
   hob's build id never change.
3. **The pantries** *(doc-quoted: N3 revised 6, "the count yields to … the pantries"; for the bottle,
   derived from K4, "the bottle gives way rather than a tall column")*. The far wall keeps the pantry
   count it has at `84bab2e`, and no pantry is narrowed.
4. **The drawer extras** *(owner, RQ18 (a), RQ19 (b), RQ21)*. The largest count up to `X` that fits
   under steps 2 and 3. They take run order after the hob, and after the bottle if one stands: wall
   A's door slots first, then the far wall from its corner, **always before the tower**. The tower
   stands after `max(n, the base bodies before it)`. The overflowed core, the bottle and the extras
   each count as one base body *(doc-quoted: N3 revised's "'from the corner' counts base bodies")*.
   Counting the bottle or not gives byte-identical layouts in all 86 706 rooms [measured], so the
   choice cannot be seen on the grid. On a far wall of 3000 mm or less, the tower, or the block,
   stays at the free end (*N3 revised* 10, RQ17). The bottle and the extras come out of the span
   between the overflow and the block, and a large U still caps the block at the tower alone. **With
   a back-wall hob**, the extras that go past the far wall's `n` also stand before the tower rather
   than in the tail. That is *derived* from RQ19 (b)'s general wording, *"between hob and tall
   oven"*. The owner was shown only a far-wall hob, and the falsifier is an owner answer confining
   it to that case.
5. **The bottle** *(owner, RQ10, RQ16, RQ20, RQ21)*. It stands directly after the hob, on the hob's
   wall, when all three hold: (i) at least `bottleWidthMm` of run follows the hob on that wall;
   (ii) the tower and pantries still stand as in steps 2 and 3; (iii) the run's drawer-unit count is
   no lower than it would be without the bottle. Otherwise there is no bottle.
6. **Plain door fill and A4.** Whatever is left takes 600 mm door bases, and the bare remainder is
   under 600 mm.
7. **The split** *(owner, RQ19 (a))*. `panDrawerCountFor` over the cabinets the room actually gets,
   with the pan drawers nearest the hob in run order.

**So, when not everything fits:** the bottle drops first. Then the drawer extras drop, one at a time
from the tower side. The tower never drops. Pantries outrank both, by the dated N3r6 (N10.7).

**Interplay, stated so that nothing is widened by accident:**

- **A4:** every wall still ends with less than 600 mm bare (N10.5).
- ***N3 revised* 10, a far wall of 3000 mm or less:** the tower or block stays at the free end, and
  RQ17's bare remainder beyond a lone tower still applies. Only the span before the block changes.
- **The fridge wall:** untouched. Its doors are never drawer units and it never takes the bottle,
  because it stands before the sink in run order. A dropped fridge's wall keeps N9.2's door bases.
- **One oven (E4, *N3 revised* 9):** unchanged in every room, by step 2 and as measured.
- **`towerPosition`** still reports *N3 revised* 10's category: `n`, `"free-end"`, or none. It does
  not report the number of bodies that stand before the tower, so N4′'s tower tallies stand. The
  bodies before the tower are bounded by `max(n, overflow + bottle + far-wall extras)`, and never
  by `n` alone.

#### N10.4 — the mirror, drawers → bottle → hob: accepted, not generated

- **On the hob's own wall it fits nothing more** *(derived, a proof rather than a measurement)*.
  Steps 2 to 5 test a wall's fit on two things only: the widths standing on that wall, and the
  number of base bodies before the tower. The mirror reorders the same bodies on the same wall, so
  it changes neither. **It resolves 0 short-wall cases without a drop.** The model's fit test reads
  nothing else, so running it on the mirrored order would only repeat the proof, and it was not run.
- **Across the corner it would, if a corner body counted as "next to"** [measured]. In **9 531**
  far-wall-hob rooms there is no bottle while wall A's tail has 300 mm or more bare, and a bottle
  could stand there. A corner cabinet would then stand between the bottle and the hob. That breaks
  the owner's *"hob , bottle"* adjacency *(inference)*, so it is **not ruled**.
- **What the mirror would cost** *(derived)*. It puts bodies between the preparation cabinet and the
  hob. *N3 revised* 5 packs those two directly in sequence, and the owner described the preparation
  as the cabinet *"between sink / dishwasher and hob"* (N6‴). With a back-wall hob, the mirror also
  pushes the hob farther from the sink, and so round the corner in more rooms. That last part was
  not measured.
- **Ruling.** The generator keeps RQ16's direction: hob → bottle → drawers. The mirror stays
  acceptable to the owner for a kitchen the customer edits. No editor rule is needed, because the
  editor has no bottle-placement rule.

#### N10.5 — measured

N10.3 applied to every plan on N4′'s grid:

| Outcome | Rooms |
| --- | ---: |
| Composed (unchanged: N4′) / hob on the back wall / hob on the far wall | 86 706 / 56 331 / 30 375 |
| **Rooms whose plan changes** (wall A / far wall; some change on both) | **35 045** (13 608 / 22 301) |
| Far-wall hob with a tower: the bottle added / extras moved before the tower / both | 3 699 / 5 234 / 4 833 |
| Back-wall hob with a tower: extras moved before the tower / the bottle dropped / both | 7 671 / 8 705 / 864 |
| Back-wall hob, no tower: the bottle dropped (RQ21 on wall A) | 4 039 |
| **Rooms that lose or gain their tower** | **0 / 0** |
| Rooms with fewer drawer units than at `84bab2e` / with one more | **0** / 13 608 (the 13 608 that drop the bottle) |
| A drawer extra after the tower in run order: at `84bab2e` / under N10 | 18 602 (N9.1's figure) / **0** |
| Far wall over 3000 mm: bodies before the tower > `max(n, overflow)`: at `84bab2e` / under N10 | 0 / 21 059 |
| The bottle anywhere but directly after the hob | 0 |
| Pantries fewer / narrower | 0 / 0 |
| Far-wall hob, 300 mm or more after it, and still no bottle (the tower or a drawer takes the room) | 9 315 |
| Largest bare run end: wall A / fridge wall / far wall | 500 / 500 / 500 mm |
| Drawer cabinets per room (0 / 1 / 2 / 3 / 4 / 5): at `84bab2e` | 4 968 / 30 440 / 14 305 / 13 571 / 8 860 / 14 562 |
| Drawer cabinets per room (0 / 1 / 2 / 3 / 4 / 5): under N10 | 4 968 / 27 118 / 13 172 / 14 572 / 9 937 / 16 939 |

**No room loses its tall oven, and no room breaks an invariant** that N10.3 or U3a AC1 names.
Measured: one oven (no tower lost or gained), bare < 600 on every wall, the bottle directly after
the hob, and no pantry lost or narrowed. By the model's construction, not measured: drawer units
≤ `N(T)`, and no pantry on a large U's far wall (the model adds no pantry anywhere). **The fridge wall's largest bare end is 500 mm**, which is the pin N9.5 asked for
after N9.2. The fridge wall is read here at `84bab2e`, and this rule does not touch it.

#### N10.6 — witnesses

Each wall is read from its corner outward, as in N4′. **Of N4′'s seven rooms, only 5000 / 4000 /
3000 changes**, and its row is annotated. The other six measure unchanged. That includes 3600 /
3500 / 2200, which is now also RQ20's *"without bottle"* case: C has 1200 mm and holds the hob and
the tower. Rooms added:

| A / B / C | Rule shown | Predicted |
| --- | --- | --- |
| 5000 / 4000 / 3000 | RQ21 on wall A, with a free-end tower | A: sink, dishwasher, preparation, `base-hob-2drawer`, **`base-panbank`** (bare 200), no bottle. C: `base-panbank`, `base-3drawer`, tower (bare 200). **4 drawer cabinets** |
| 3000 / 4500 / 4500 | RQ20, RQ19 (b) and RQ19 (a) together | A: sink, dishwasher (bare 0). C: preparation, `base-hob-2drawer`, **bottle**, `base-panbank`, `base-3drawer`, tower (bare 200). Was: preparation, hob, `base-panbank`, tower, `base-3drawer` (bare 500) |
| 2700 / 4000 / 4000 | RQ19 (b), where the bottle cannot also fit (RQ21) | C: dishwasher, preparation, `base-hob-2drawer`, **`base-panbank`, tower** (bare 0). This is the RQ19 (b) example itself; it was hob, tower, `base-panbank` |
| 2700 / 3700 / 3700 | RQ20, where the bottle fits | C: dishwasher, preparation, `base-hob-2drawer`, **bottle**, tower (bare 0; was 300) |
| 4200 / 3400 / 3400 | Back-wall hob, extras before the tower *(derived)* | A: sink, dishwasher, preparation, `base-hob-2drawer` (bare 0). C: `base-panbank`, `base-panbank`, `base-3drawer`, **tower at 3 bodies** (`n` = 2; bare 0). Was: 2 × `base-panbank`, tower, `base-3drawer` |
| 4800 / 1000 / 1000 | RQ21 on wall A, no tower | A: sink, dishwasher, preparation, `base-hob-oven`, **`base-panbank`** (bare 0; was the bottle, bare 300). The fridge is dropped |
| 3600 / 2800 / 2800 | Pantries outrank both (N3r6), unchanged | C: `base-hob-2drawer`, tower, pantry (bare 0) |

#### N10.7 — left open, non-blocking; the built rule does not wait on either

> **Both answered 2026-09-29 — see N10.9.** Wall A: drawer cabinet wins (confirmed). Pantries: pantry
> wins (RQ22 closed). The bullets below are kept as written.

- **Pantries against drawer units** (*N3 revised* 6's *"yields to … the pantries"*, which stands).
  RQ21 did not mention pantries. The far wall has a pantry in only **676** grid rooms. If drawers and
  the bottle outranked pantries, **all 676** would lose one, and 587 more rooms would change. This
  is a candidate **RQ22**, for the coordinator to put or not.
- **RQ21's reach beyond the tall oven's wall** (N10.2, *N3 revised* 7). It is derived from the
  answer's unscoped wording, and it removes the bottle in 13 608 rooms, every one of them with the
  hob on the back wall. Each of those rooms gains a drawer unit, the witness 5000 / 4000 / 3000 among
  them.
  **The coordinator may want the owner to see that room before and after.**
- **A back-wall hob's extras before the tower** (N10.3 step 4, *derived*). This covers 8 535 rooms.

#### N10.8 — consequences and sweep

- **Code (U3a, before QA):** `u-composition.ts` and `u-tall-layout.ts` only. The punch list is in
  the architect's report to the coordinator, 2026-09-29, and the M7B plan's U3a AC1–AC3 carry the
  test changes. The L and the straight kitchen stay byte-identical (U3a AC4).
- **U3b:** no new rule. The generator inserts the plan's bodies. Uppers over a bottle or drawer base
  follow Amendment C and E7 as before.
- **Sweep:** the records in N10.2's table. N8 is otherwise unchanged. The L's J, K and L amendments
  are not touched.

#### N10.9 — two owner answers and the implementation, 2026-09-29 (appended; nothing above is erased)

Both answers were given through a multiple-choice question the coordinator wrote, so they are
**relayed selections**, not verbatim quotations.

- **Wall A (N10.7's second bullet).** Asked: *"Back wall, when after the hob there is room for either
  the 300 mm bottle or a 600 mm pan-drawer cabinet, but not both (13,608 room sizes, e.g.
  5000/4000/3000): which wins?"* The owner picked **"Drawer cabinet wins"**. RQ21 on wall A is now
  **owner-confirmed**. The 13,608 rooms of N10.7 stand as built. Still derived: RQ21's reach to a far
  wall without a tower.
- **Far-wall pantries (the candidate RQ22 of N10.7's first bullet).** Asked: *"Side wall with a tall
  pantry (676 room sizes): if there isn't room for both, which wins — the tall pantry or a drawer
  cabinet?"* The owner picked **"Pantry wins"**. This **confirms *N3 revised* 6's ranking**
  (pantries outrank the count). **RQ22 is closed as answered**; no rule changes.
- **Implemented at `3f53a62`** (*"the hob wall's fitting rule: drawers before the tower, bottle
  yields (N10)"*). Per the implementer's report, not re-run by the scribe: domain suite 250 files /
  5330 tests green. AC3's figures match the architect's model across all 86,706 grid rooms: 0 towers
  or pantries lost, 0 drawer extras after the tower (18,602 before), 13,608 rooms gain a drawer, and
  the largest bare end is 500 / 500 / 500. U3a's adversarial QA had not reported when this was written.

### N11 — U3a review round 1: four logic findings adjudicated, and the owner's wall-A answer, 2026-09-29

U3a's logic and clean-code reviews both returned *changes required*. This section rules on the logic
review's four findings and records the owner's answer to the wall-A question the second finding
raised. The clean-code findings are behaviour-free and are not ruled here; they are folded into the
M7B plan's U3a punch list (Dispatch B).

**How the figures were taken.** Figures are **[measured]** by the architect at `7de0bd8`. The domain
source is unchanged since `6527ba3`: `git diff --stat 6527ba3 7de0bd8 -- packages/configurator-domain`
is empty. The source was built with `tsc -p tsconfig.build.json` into the session scratchpad
(`n11/dom`). A patched copy (`n11/dom-n11`) applies the four rulings below, each behind its own
switch, so every figure belongs to one ruling. Everything ran through `rtk proxy node`.

The grid is N4′'s: A 2700–6000, B and C 1000–6000, step 100, height 2600, unless a figure says
otherwise. **The unpatched build reproduces every recorded pin**: 86 706 composed; towers by position
16 487 / 13 600 / 26 216 / 30 403; far-wall pantries 680, 449 200 mm; fridge-wall digest
`803680d6…4b34fe`; and the drawer histogram in N10.5's *under N10* row. So the harness and the test
suite read HEAD the same way.

Claims are labelled *owner* (verbatim), *relayed selection*, *doc-quoted*, *source-verified* (this
repository at `7de0bd8`), *derived*, or *inference*.

#### N11.1 — the fridge wall's bare remainder belongs beyond the fridge, not at the corner (logic finding 1: an implementation defect and a test-fidelity defect)

**Ruling.** This applies to a fridge wall of 3000 mm or less. Door storage stands from the corner,
the fridge stands directly after it, and the bare remainder (under 600 mm, A4) is left beyond the
fridge, at the free end. **That remainder stays bare.** No pantry and no door goes in it, whatever
its width. The counted case, `n` = 2 or 3, does not change.

- *Doc-quoted, the rule.* The record states it three times:
  - N3 item 3: *"the fridge stands at the free end, with any bare remainder beyond it at the free end
    (the L's convention)"*.
  - *N3 revised* 3: *"the fridge stands at the free end, with door storage between it and the corner
    and any bare remainder beyond it"*.
  - Amendment D2: *"on each wall the composed bodies are packed from the corner outward, and the
    leftover gathers at the wall's free end"*.
- *Source-verified, the L's convention.* `generation-priorities.ts:236-237` reads: *"Storage on the
  prefix wall stands nearest the corner … that makes the fridge [2100, 2800] while the free-end
  remainder stays beyond it"*. In the L, a fridge "at the free end" has always meant the last body
  before the free end, with the remainder beyond it.
- *Source-verified, the defect.* `fridgeAtTheFreeEnd` (`u-composition.ts:127-141`) starts the storage
  at `run.startMm + leftover.remainderMm` and stands the fridge flush with `run.endMm`. The remainder
  therefore sits between the corner and the first body. Example: in 4000/2000/2000, B's run is
  900–1900, the fridge stands at 1200–1900, and 300 mm is bare at the corner.
- *Source-verified, why the shell could not build it either.* The plan gives the shell widths only
  (`floorWidthsMmOf`, `u-composition.ts:977-986`). The shell tiles those widths from the span's
  corner-side start (`plannedFloorTiles`, `shell-design.ts:429-434`). Wall C reuses wall B's builder
  (`:796-803`). *Inference:* U3b would place 4000/2000/2000's fridge at 900–1600 whatever the plan
  said. U3b is not built yet, so this is inferred from the mechanism, not observed.
- **The reading refused.** The owner said *"If the wall with fridge is really wide like more than 3
  meters, the fridge is not at the edge"* (N1.2). So on a shorter wall the fridge **is** at the edge,
  and the built code honours that to the millimetre. The reading is refused for two reasons:
  - The record states the rule twice, and D2 once more, and each time "at the free end" allows a
    remainder under 600 mm beyond the fridge. The L has always done exactly this.
  - N9.2 described `fridgeAtTheFreeEnd`'s convention (*"That exists to keep the fridge flush with the
    free end"*) while refusing that convention for a dropped fridge's wall. N9.2 described it and did
    not rule on it. **N11.1 is the ruling**, and N9.2 carries a dated pointer to it.
- *Derived, why the remainder stays bare.* *N3 revised* 3 names this exact case and calls the
  remainder *bare*. *N3 revised* 4's pantry gap comes from the owner's *"on wide wall between fridge
  and wall edge"*, which is the wall over 3 m.
  - *Source-verified, in the U0 scratchpad:* N4′'s model placed nothing beyond a free-end fridge
    (`u0-measure-rq.mjs`, `unitOnSideWall`, `beyondMm: 0`). N4′'s pantry tallies assume that.
  - **The alternative was measured and refused:** filling a 400–599 mm remainder with a pantry would
    add a pantry beyond the fridge in **3 936** rooms.
- *Source-verified, the test-fidelity defect.* The tests pinned the planner, not the rule:
  - `tests/support/u-plan-invariants.ts:250` requires `fridge.endMm === run.endMm`. That is the
    planner's convention.
  - The witness helper compares `(role, buildId)` only, never a position
    (`u-composition.witnesses.test.ts:36-41`).
  - `u-tall-layout.property.test.ts:556-566` pins the fridge wall's digest as *"exactly what N10.3
    promises not to move"*. That froze the defect in place.
- *Measured.* **10 178** rooms change, all on the fridge wall. No other wall moves, and no tower,
  pantry, drawer count or bottle changes. The largest bare end stays 500 / 500 / 500. In the test's
  own format, the fridge-wall digest becomes
  `5d2962d48475ef6e7dde181952f0e692e109ba1ed8a827ad8e39c5b39ecfdfc2`.

#### N11.2 — the owner's answer: where a drawer fits right after the hob on wall A, it takes the place, and the bottle yields (logic finding 2)

**The question and the answer, 2026-09-29.** The coordinator asked this as a multiple choice, and
relayed the answer:

> *"Back wall, 600 mm free after the hob (4,599 room sizes, e.g. 4800/4400/4400). Today the bottle
> goes next to the hob, and the drawer cabinet that would have fit there moves round the corner onto
> the side wall — the room keeps the same number of drawers either way. Which do you want?"*

The owner selected **"Drawer by the hob"** (*pan-drawer right after the hob; the bottle is
dropped*). That is a *relayed selection*. The owner added a note, recorded here verbatim as relayed
(*owner*): *"if is exactly 600 drawer should have priority"*.

**Ruling.** The bottle stands directly after the hob only where both of these hold:

- it costs **the hob's own wall** none of the drawer units that wall would hold without it; and
- it costs the room none (RQ21, unchanged).

The decision point stays `bottleCostsNoDrawerUnit`. It now compares two counts: the hob's wall's and
the room's. For a far-wall hob, the hob's wall holds every extra, so the two counts are the same
count and nothing changes. Measured: 0 far-wall-hob rooms change.

- *Measured.* **4 599** rooms change, and every one has its hob on wall A. In all of them:
  - the bottle is dropped, and a drawer unit moves from the far wall onto wall A;
  - the room's drawer count does not change (the histogram is identical to N10.5's *under N10*
    row); and
  - no tower or pantry moves.

  The rooms split by how much of wall A's run is free after the hob:

  | Free after the hob | Rooms | Drawer extras on wall A, before → after | Example |
  | --- | ---: | --- | --- |
  | exactly 600 | 441 | 0 → 1 | 4800 / 4400 / 4400 |
  | 700 – 800 | 882 | 0 → 1 | 4900 / 4000 / 4000 |
  | 1200 – 1400 | 2 187 | 1 → 2 | 5400 / 3400 / 3400 |
  | 1800 | 1 089 | 2 → 3 | 6000 / 6000 / 6000 |

- **What is owner-backed and what is inferred.**
  - The **441** rooms at exactly 600 are the owner's own case.
  - **700–800** is the same shape: one drawer fits after the hob, but not a drawer and the bottle
    together. *Inference:* "exactly 600" is read as "room for the 600 mm drawer, and not for both".
  - **1200–1800** lies inside the population the question named (4 599), but outside the note's
    literal "exactly 600". This is *inference*, and it is the one part the note could undo.
- **RQ23 goes to the owner, non-blocking, and the default built is the whole class the question
  named.** *Derived:* the question describes one harm, a drawer that would stand on wall A pushed
  round the corner by the bottle, and that harm is the same in all four bands. A rule confined to
  600–899 would also give a longer wall A fewer drawers near the hob than a shorter one gets.
- **Where both fit, nothing changes.** The order hob → bottle → drawers (N10.1 item 5, RQ16) stands
  wherever the bottle costs wall A no drawer. With 900–1100 or 1500–1700 free after the hob, wall A
  holds the same drawers with the bottle or without it. Measured: 0 of those rooms change.
- *The earlier records this answer reaches, named rather than overridden silently:*

  | Record | What it said | What changes, and on whose authority |
  | --- | --- | --- |
  | *N3 revised* 7, and N10.2's row for it | The bottle's width comes out of the remainder only where that costs no drawer unit the count still owes | **Narrowed** by this answer (owner). Where the bottle would cost the hob's wall a drawer unit, it drops, even when the room's total would not fall |
  | N10.9, wall A (relayed selection) | "Drawer cabinet wins", where the room's drawer count would fall | **Consistent, and widened** by this answer (owner) from the room's count to the hob's wall's count |
  | N10.1 item 5, N10.4 (owner) | Hob → bottle → drawers | **Unchanged** wherever the bottle stands |
  | N4′'s 6000 / 6000 / 6000 witness | A: bottle, 2 × `base-panbank`. C: 2 × `base-3drawer` first | ~~**Moves** (N11.5); the row carries a dated note. It stays 5 drawer cabinets, 2 of them pan drawers~~ **Unchanged, by RQ23 (below)** |

**RQ23 (non-blocking; the default is built).** The question, as it is to be put: *"Back wall, with
1200–1800 mm free after the hob (3,276 room sizes, e.g. 5400/3400/3400). The bottle and one drawer
cabinet fit after the hob, but the bottle pushes a second drawer cabinet round the corner onto the
side wall. Today (the default): two drawer cabinets after the hob, and no bottle. Or: keep the
bottle, then one drawer cabinet, with the other drawer cabinet on the side wall?"* Either answer
changes only `bottleCostsNoDrawerUnit` and the three 1200–1800 witnesses.

**RQ23 answered, 2026-09-29 (relayed selection): "Bottle + drawers".** The option read *"with this
much space, keep the bottle next to the hob and put the drawers after it"*, previewed as `│ HOB │
BOTTLE 300 │ PAN 600 │ …`. **This departs from the default built above**, which is superseded. The
passages it overturns are kept as written: the 1200–1800 rows of the band table, the *"default built
is the whole class"* bullet, and the table row saying 6000/6000/6000 *moves*.

**The wall-A rule as answered** (the coordinator's combination of the two answers, relayed to the
developer the same day). On wall A, the bottle yields **only** when both hold:

- without the bottle, wall A holds at least one drawer unit after the hob; and
- with the bottle, it holds none.

RQ21's rule, that the bottle never costs the room a drawer unit, still applies. For a far-wall hob,
nothing changes. By the space free after the hob on wall A:

| Free after the hob | Outcome |
| --- | --- |
| 600 | drawer |
| 700–800 | drawer |
| 900–1100 | bottle + drawer |
| 1200–1800 | bottle + drawers |

*Owner-backed:* 600 (the note) and 1200–1800 (RQ23). *Unchanged from N10:* 900–1100, and every band
where the bottle stands. *Inference:* 700–800, the same shape as 600, as argued above.

**Re-measured** on the model with this rule, on N4′'s grid:

- **1 323** rooms change: 441 at exactly 600, and 882 at 700–800. Every one has its hob on wall A,
  drops the bottle, and moves one drawer unit from the far wall onto wall A.
- The rooms at 1200–1800 no longer change.
- The drawer histogram, the towers and the pantries are unchanged.

**Witnesses:**

- **4800 / 4400 / 4400** changes as N11.5 states.
- **5400 / 3400 / 3400** and **6000 / 6000 / 6000** do not move. They are pinned **unchanged**, as
  RQ23's own witnesses. The dated note on N4′'s 6000 row is struck.

**The records reached:**

- *N3 revised* 7 and N10.2 are narrowed only for wall A's 600–899 band.
- N10.9's *"Drawer cabinet wins"* is widened to that band only.
- N10.1 item 5 (hob → bottle → drawers) is **confirmed** by the owner for 900 mm and more.

#### N11.3 — the sink never leaves wall A (logic finding 3: an implementation defect)

**Ruling.** A back-wall pack in which the sink would not stand on wall A is refused, like any other
pack that does not fit. When every attempt is refused, the plan is `minimumMet: false`.

- *Doc-quoted.*
  - N3 item 4: *"The sink must stand on wall A."*
  - ADR 0108 H3: *"the sink stands on the back wall (A)"*. Its predicate: `freeA ≥ 1200`, or
    `freeA ≥ 600` and `freeFar ≥ 600`.
  - U3a AC1: *"The sink is the first body on wall A."*
  - *N3 revised* 5 restates the order and does not relax any of these.
- *Source-verified.* `packBackWallAndOverflow` (`u-composition.ts:341-351`) overflows whichever item
  does not fit, the first one included. At 2300/3000/3000 (freeA 500), the sink, the preparation and
  the hob stand on wall C, and the plan reports `minimumMet: true`.
- *Measured.*
  - On the approved grid (A ≥ 2700, so freeA ≥ 900), no room changes. The defect is unreachable
    there.
  - Sweep over the engine band: A 1800–3100 in steps of 50, plus A 2390–2410 and 2990–3010 in steps
    of 1, with B and C 1000–6000 in steps of 100. HEAD composes **33 462** rooms that H3 refuses, and
    in every one of them the sink is off wall A.
  - With the guard, the planner agrees with H3 in **every** sampled room.
  - The boundary: 2399/3000/3000 is refused, and 2400/3000/3000 composes with the sink at A 900–1500.
- **Fixed in U3a.** U3b's AC2 (*validator ⇔ generator*) is an "if and only if" over this planner, and
  the fix is one guard.

#### N11.4 — no generated tall column in a room lower than the column (logic finding 4: a contract gap, closed by E3 clause 4's own reason)

**Ruling.** E3 clause 4 applies to **every** generated full-height column in a U: the tower, the far
wall's pantries, **and the fridge-gap pantries**. Where the room is lower than
`declared.columnHeightMm`, the gap between the fridge and the free end takes A4's door bases
instead: 600 mm each, with a remainder under 600 mm left bare.

- *Doc-quoted, why this is a contract gap.*
  - E3 clause 4 states its own reason: *"it fires for the engine limits … and it is what stops a
    planned tower from being refused at insert time"*. That reason concerns the column's height, not
    its being a tower.
  - The fridge-gap pantry is the same 2200 mm column row (`declared.columnHeightMm`).
  - *N3 revised* 4 introduced these columns without restating a height clause, and *N3 revised* 10
    restates clause 4 only for the far wall. So the record never ruled on this; it is not an
    implementation choice.
- *Source-verified.* The far wall checks the room's height (`u-tall-layout.ts:180-181`). The fridge
  gap does not (`:79-87`, `:101-120`).
- *Derived, the fallback.* With no column allowed, A4 governs the gap: *"every bare run end of 600 mm
  or more receives 600 mm storage bases"*.
- *Measured.*
  - At height 2000 and at height 2199, HEAD gives **69 440** grid rooms a 2200 mm fridge-gap pantry.
    With the ruling, none, and every wall still ends with under 600 mm bare.
  - At height 2200, no room changes.
  - Unreachable under the approved policy (heights 2200–3900, ADR 0108 H1). Reachable under the
    engine limits, whose height floor is the top of the base row.
- **Fixed in U3a now.** It is the same file and one condition, and it means U3b's generator never
  meets an insert-time refusal it would have to plan around.
- **Not reached by this ruling:** the freestanding fridge (1850 mm, `catalog.ts:280`), which the L
  places under the same engine limits. That is a question for the L, and it is not ruled here.

#### N11.5 — the four rulings measured together, and the witnesses that change

~~With all four rulings applied, **14 771** grid rooms change: 10 178 on the fridge wall and 4 599 on
wall A and the far wall, with 6 rooms in both sets.~~ **2026-09-29, after RQ23 (N11.2):** with all
four rulings applied, **11 501** grid rooms change: 10 178 on the fridge wall only, and 1 323 on wall
A and the far wall. No room is in both sets.

These do not change:

- composed rooms: 86 706;
- towers by position: 16 487 / 13 600 / 26 216 / 30 403;
- far-wall pantries: 680, 449 200 mm;
- the drawer histogram: 4 968 / 27 118 / 13 172 / 14 572 / 9 937 / 16 939;
- the largest bare end: 500 / 500 / 500;
- exactly one oven in every plan; and
- the bottle, wherever it stands, directly after the hob.

**Whole-plan digests of the model.** Each digest covers every wall's `buildId@start-end`, ids
excluded, together with `minimumMet`. These are the targets Dispatch A must reproduce. A mismatch is
reported with its room, not fixed to match (7J A8).

| Sweep | Composed | N11 model | HEAD, same harness |
| --- | ---: | --- | --- |
| grid, h 2600 | 86 706 | ~~`76f0533699f69cb83821b5ef401239e0c861084ce5fb0326490d9162b5885005`~~ **`d7c86c26fffebdbe55dd5174e1dc98edd2a21458d5a389e512216eb9ef016b3b` (RQ23)** | `02c55d1a…09933` |
| grid, h 2199 | 86 706 | ~~`1008bf5d55419f4f6f1476a65563d6558280463174454d5af41503da3d15af07`~~ **`ae17976d6dc65b878d9ef5f04d207e8fe0168d4e78347c9041b298397dfa9bcb` (RQ23)** | `9f4e74fa…405f9` |
| engine band A 1800–2699 step 50, h 2600 | 12 150 (HEAD 30 402) | `5f833603d4e638c729faa98b3c302839c9874ff15716194a49c0079866a71a09` (RQ23 does not reach it) | `7d32b41e…f31ff` |

**2026-09-29: the struck digests are the pre-RQ23 model.** The bold ones are the architect's model
under RQ23's answer. **They are the model's, not yet the implementation's.** Once the developer
reports the digests their Dispatch A build produces, the implementation's are recorded here, beside
the model's:

- **If they match**, the row says so.
- **If they differ**, the difference is reported with its rooms and adjudicated (7J A8). The
  developer does not tune the code to match either set.

**The implementation, measured by the architect on 2026-09-29.** The measurement used a `tsc` build
of HEAD `91ae4d3`'s committed `packages/configurator-domain` (via `git archive`, so the uncommitted
U3b S1 work is excluded), in the same harness. **All three digests equal the model's RQ23 digests
above: h 2600 `d7c86c26…016b3b`, h 2199 `ae17976d…a9bcb`, engine band `5f833603…a71a09`.** The
implementation matches the model. N11.8 moves all three again.

**The witnesses.** Each wall is read from its corner. Positions are along-wall millimetres. Every
other N4′ and N10.6 witness measures unchanged.

| A / B / C | Ruling | Predicted |
| --- | --- | --- |
| 3600 / 2400 / 2000 | N11.1 | B: `base-cabinet` 900–1500, fridge 1500–2200, bare 100 beyond. A and C unchanged |
| 3600 / 2800 / 2800 | N11.1 | B: `base-cabinet` 900–1500, fridge 1500–2200, bare 500 beyond, no pantry. C unchanged |
| 4000 / 2000 / 2000 | N11.1 | B: fridge 900–1600, bare 300 beyond |
| 4800 / 4400 / 4400 | N11.2, exactly 600 | A: …, `base-hob-2drawer` 2700–3300, `base-panbank` 3300–3900 (bare 0, no bottle). C: `base-panbank`, `base-3drawer`, `base-3drawer`, tower 2700–3300, `base-cabinet` (bare 400). **Was** A: …, hob, bottle (bare 300); C: 2 × `base-panbank`, 2 × `base-3drawer`, tower |
| 5400 / 3400 / 3400 | N11.2, 1200 | ~~A: …, hob, 2 × `base-panbank` (bare 0). C: 2 × `base-3drawer`, tower 2100–2700, `base-cabinet`.~~ **RQ23: unchanged.** A: …, `base-hob-2drawer`, bottle, `base-panbank` (bare 300). C: `base-panbank`, 2 × `base-3drawer`, tower 2700–3300 |
| 6000 / 6000 / 6000 | N11.2, 1800 | ~~A: sink, dishwasher, preparation, `base-hob-2drawer`, 2 × `base-panbank`, `base-3drawer` (bare 0). C: `base-3drawer`, 2 × `base-cabinet`, tower at 2700–3300 (`n` = 3), 4 × `base-cabinet` (bare 200).~~ **RQ23: unchanged, as N10 left it.** A: …, hob, bottle, 2 × `base-panbank` (bare 300). C: 2 × `base-3drawer`, `base-cabinet`, tower, 4 × `base-cabinet` (bare 200) |
| 2399 / 3000 / 3000 | N11.3 | `minimumMet: false` (freeA 599) |
| 2400 / 3000 / 3000 | N11.3 | Composes: the sink at A 900–1500 (freeA 600); C: dishwasher, preparation, `base-hob-oven`. B, per N11.1: 2 × `base-cabinet` 900–2100, fridge 2100–2800 |
| 3600 / 3500 / 2200, h 2199 | N11.4 | B: 2 × `base-cabinet`, fridge 2100–2800, `base-cabinet` 2800–3400, no pantry. At h 2200, the pantry stands, as in N4′ |

#### N11.6 — found while adjudicating, for U3b: wall A's remainder at its low end cannot be built from widths alone

- *Measured.* After N11, **30 450** composed grid rooms have wall A's first body standing past the
  start of A's run. Every one of them has the fridge on wall C.
- *Doc-quoted, why the plan is right.* *N3 revised* 5 packs wall A *"from the fridge corner"*. With
  the fridge on C, the remainder therefore lands correctly at the B-corner end. **Superseded
  2026-09-29 by N11.8:** such a remainder cannot be built through `insertBody`, so it moves to wall
  A's high end. Example: in
  2700/1600/1700 the sink stands at A 1200–1800, with 900–1200 bare.
- *Source-verified, why the shell cannot reproduce it.* `wallAFreeRunTilesForU` tiles `floorWidthsMm.A`
  from `floorSpan.startMm` (`shell-design.ts:750-786`, through `plannedFloorTiles`, `:429-434`). The
  plan carries widths without an offset, so the shell would put that sink at 900–1500.
- **Classification: a contract gap between U3a's plan type and U3b's shell input.** It is not a U3a
  defect and is not fixed here. **U3b S1 owns it** (item 2, wiring `buildUShellDesign`), and the
  mechanism is U3b's choice: an offset carried in the plan, or tiling wall A from its far end.
- **The criterion U3b must meet:** every generated body's along-wall span equals the plan's, on all
  three walls.

#### N11.7 — consequences and sweep

- **Code.**
  - **Dispatch A** (U3a): `u-composition.ts` and `u-tall-layout.ts` only. The L and the straight
    kitchen stay byte-identical (U3a AC4).
  - **Dispatch B**, the clean-code refactor, follows it and must leave every N11.5 figure unchanged.
  - Both punch lists are in the M7B plan, under U3a.
- **Records reached:**

  | Record | Effect |
  | --- | --- |
  | N3 item 3, *N3 revised* 3 | Now built as written (N11.1) |
  | N9.2's description of `fridgeAtTheFreeEnd` | Superseded by N11.1; N9.2 carries a dated pointer |
  | *N3 revised* 7, N10.2 | Narrowed (N11.2) |
  | N10.9 | Widened to wall A's 600–899 band (N11.2, RQ23) |
  | N4′'s 6000 / 6000 / 6000 row | ~~Moves; the row carries a dated note~~ Unchanged after RQ23; the note is struck |
  | N3 item 4, ADR 0108 H3 | Now enforced (N11.3) |
  | E3 clause 4 | Reach widened to every generated column in a U (N11.4) |
  | U3b S1 item 2 | Gains N11.6's criterion |

  The L's records are not touched.
- **Owner:** ~~RQ23 is open and non-blocking. Its default is built.~~ RQ23 was answered on 2026-09-29, *"Bottle + drawers"* (N11.2). No owner question remains on U3a.

### N11.8 — U3b S1's stop: wall A's remainder goes to its high end, the right-hand end facing it, in every U. Owner question RQ24 is non-blocking

**What stopped S1.** The developer tried to build N11.6's criterion with a leading-gap field on the U
shell plan. That placed 65 868 of 86 706 composed grid rooms exactly, and **threw in 20 838**
(`plannedVoid`: *"no A opening covers [1000, 1600] at 0"*). Those are exactly the rooms where the
low-end gap plus the first body is ≤ 800 mm.

The cause:

- ADR 0046 merges adjacent empty columns up to 800 mm when they are derived, so the gap tile and
  the first body's tile become one column.
- `insertBody` seats a body at its column's **left** edge, which is ADR 0046's owner ruling of
  2026-09-01.
- So the body lands on the gap's side.

*Measured by the architect* at HEAD `91ae4d3`, with the committed domain built through `git archive`
into the session scratchpad (`u3b/gaps.mjs`, `u3b/digest.mjs`, run via `rtk proxy node`). This
**reproduces the developer's 20 838 exactly.**

- **31 329** composed grid rooms have a leading gap on wall A: 30 909 with the fridge on C, and 420
  with the fridge dropped and C its primary wall.
- By gap size: 100 mm, 10 419 rooms; 200 mm, 10 419; 300 mm, 3 849; 400 mm, 3 321; 500 mm, 3 321.
- All of the 100 and 200 mm gaps merge with a 600 mm body (**20 838**). The other **10 491** stand
  alone and place correctly today.

**Classification: a contract gap.** Two dated records meet in these rooms and cannot both hold
through `insertBody`:

- *N3 revised* 5 and RQ12 (a relayed selection): *"packed from the fridge corner"*. N11.6 derived
  from this that the remainder belongs at wall A's low end when the fridge is on C.
- ADR 0046, the owner: *"the LEFT edge of the span — the lower along-wall coordinate — always"*.
  The whenever-it-helps alternative was **rejected by the owner** because *"it would put the gap on a
  different side depending on a predicate the customer cannot see"*.

N11.6 missed this conflict when it called the plan right.

**Ruling (the default built; RQ24 below).** On every U, **wall A's bodies stand contiguous from wall
A's low end (the A∩B corner), and wall A's remainder, under 600 mm (A4), sits at its high end**:

- The run order is unchanged: from the fridge corner, sink first (*N3 revised* 5). With the fridge
  on C, the whole block is justified to the low end, and the gap stands between the sink and the
  A∩C corner.
- With the fridge on B, nothing moves, because the remainder is already at the high end.

The evidence:

- *Source-verified, and derived from it.* The remainder then sits where every `insertBody` split
  already puts one. `plannedFloorTiles` tiles the widths from the run start with the leftover last
  (`shell-design.ts:429-438`). A merge of the trailing gap with the last body's tile is harmless,
  because the body seats left and the gap stays right.
- **No shell field and no command change are needed**, and N11.6's criterion (generated spans equal
  the plan's) holds by construction.
- *Measured, on the modelled rule:* in all 86 706 grid rooms, every wall-A first body stands at A's
  run start, and A's largest remainder stays 500 mm.

**Alternatives refused:**

| Option | Why refused |
| --- | --- |
| **A**, reading wall A from its low end in every U | It puts the sink at the far corner, away from the fridge whenever the fridge is on C. That contradicts *N3 revised* 5's order, not just its gap |
| **B**, not recording sub-merge gaps | It breaks every free run being recorded whole (ADR 0044, 0046) |
| **C**, the first body absorbing the gap | It works only for fit-width bodies, and the span then differs from the plan |
| **D**, a right-anchored insert | It is a seating the editor does not have, which ADR 0046's owner ruling rejected. A generation-only primitive would also break decisions 1–2 and U3b AC5: generation writes only through the editor's own `insertBody` |
| Moving only the 20 838 merging rooms | The gap's side would depend on its width, which is the unpredictability ADR 0046's owner refused |

**What this departs from, named rather than overridden silently.**

- In the 31 329 fridge-on-C rooms, *N3 revised* 5's *"packed from the fridge corner"* (RQ12) now
  holds for the **order** but not for the **position**. The sink stands 100–500 mm from the A∩C
  corner rather than against it.
- RQ12's question was packing against centring under a window, and it did not ask about a gap of
  under 600 mm. **So this is put to the owner as RQ24, with the default built.**
- ADR 0046 is **applied, not amended**.
- N11.6's *"the plan is right"* is superseded (dated line there).

**Measured, the model's digests under N11.8** (N11.5's format; `u3b/digest.mjs`):

| Sweep | Rooms whose wall A moves | Digest |
| --- | ---: | --- |
| grid, h 2600 | 31 329 | `9e1c0fc8e0c839409372cdc3d38327a44556ca6f49b92fc943075bd606b4e626` |
| grid, h 2199 | 31 719 | `47a5e1727966066d93c562d4ca4c683b0a2e4c9036d2633f8121446222983d65` |
| engine band A 1800–2699 step 50, h 2600 | 4 950 | `d4a63e4d8370211ceb80495ffeeb8f5df8ae43f7ac4a2e82d602205df6a35c08` |

Only wall A positions move. Order, widths, remainders and the other walls are untouched. **The h 2600 and h 2199
digests are superseded by N11.9's (RQ25's fill). The engine-band digest stands.** The
implementation reports its own digests. A mismatch is reported with its rooms, never tuned to match
(7J A8).

**Witnesses:**

- **2700 / 1600 / 1700.** Fridge on C; A's run is 900–1800. The sink stands at A **900–1500** (was
  1200–1800), with 300 mm bare at 1500–1800. This case stands alone at HEAD.
- **3100 / 1000 / 1100.** The fridge and the preparation are dropped; C is the fridge's primary
  wall. A's run is 900–2200. It was `base-hob-oven` 1000–1600 and `base-sink` 1600–2200, with 100 mm
  bare at the B corner. That is a merging case, which throws in S1 today. **Under N11.8:**
  `base-hob-oven` 900–1500, `base-sink` 1500–2100, 100 mm bare at 2100–2200.

#### RQ24 — owner question (non-blocking; default (A) built)

**Answered 2026-09-29: "Right end (Recommended)" (relayed selection), with a note that became RQ25 (N11.9).**

> *"Back wall, when the fridge is on the right-hand side wall (31,329 room sizes, e.g. 2700 × 1600 ×
> 1700). The back-wall cabinets fill the wall except for a small bare gap of 100–500 mm (100 mm:
> 10,419 rooms; 200 mm: 10,419; 300 mm: 3,849; 400 mm: 3,321; 500 mm: 3,321). Where should the gap
> be?*
>
> *(A) Recommended: at the right end, between the sink and the right corner.*
> `│ left corner │ … drawers │ hob │ prep │ dishwasher │ sink │ gap │ right corner │ → fridge wall`
> *Every other gap the kitchen gets, and every gap the editor leaves when you remove or narrow a
> cabinet, is on the right too. So it always looks the same, and it needs no new rule.*
>
> *(B) At the left end, so the sink stays tight in the right corner next to the fridge.*
> `│ left corner │ gap │ … drawers │ hob │ prep │ dishwasher │ sink │ right corner │ → fridge wall`
> *This needs a special way of placing cabinets that the editor does not have. It goes against your
> 2026-09-01 rule that a cabinet always sits at the left of its space."*

**It does not block S1.** S1 builds (A).

An answer of (B) is not a one-line change. It reopens ADR 0046 for generation (a right-seated
insert, or an offset that survives the merge), and S1's plan change is reverted. It would be its
own wave, planned then.

#### N11.9 — RQ24 answered, and RQ25: a U back wall's remainder of 300 mm or more takes a door base (2026-09-29)

**The owner's answers, 2026-09-29, relayed by the coordinator.** Each was given by multiple choice.

1. **RQ24:** **"Right end (Recommended)"**, a *relayed selection*. The preview shown was `│ left
   corner │ drawers │ hob │ prep │ dishwasher │ sink │ GAP │ right corner │ → fridge wall`. N11.8's
   default is now owner-confirmed.
2. **The owner's note on that answer**, verbatim: *"and instead of gap 2 doors or 1 door cabinet
   (rule 1 door if less than 400mm)"*.
3. **Scope follow-up (RQ25a)**, a *relayed selection*. The question: *"Does that apply only to this
   back-wall gap, or to every leftover gap in a U (side walls' ends too)? Earlier the rule was 'let
   the edges empty' for gaps under 600."* The answer: **"Back wall only"**. The side walls' ends stay
   bare, as before.
4. **Tiny-gap follow-up (RQ25b)**, a *relayed selection*. The question: *"what if the gap is
   100–200 mm?"* The answer: **"Fill from 300 mm"**. A gap of 100–200 mm stays bare.

**The rule, for a U's wall A only (RQ25).** The rest of the plan is decided first, with nothing
changed: the core, the bottle, the drawer units and their conversion, and A4's 600 mm door fill.
Then wall A's remainder, `r` (< 600, at A's high end by N11.8), is treated as follows:

- **`r` ≥ 300:** it takes one `base-cabinet` of exactly `r`, standing at A's high end, and wall A's
  bare end becomes 0.
- **`r` < 300:** it stays bare.

What this departs from:

- It departs from A4's *"the remainder, at most 599 mm, stays"* and from Amendment D2's *"let the
  edges empty"*, **for a U's wall A only**, by the owner's RQ25.
- The side walls of a U, and every wall of an L or a straight kitchen, are untouched.

**The catalogue: every width exists, but the door count at 400–499 differs from the owner's note.**
*Source-verified at HEAD `91ae4d3`:*

- `base-cabinet` is one row with `widthFlex: "fit"` and a **continuous** bound of 200–800 mm
  (`HINGED_CABINET_WIDTHS`, `catalog.ts:151-180`). Its 50 mm `sizesMm` are only the customer's
  stepper. So **every whole-mm width from 300 to 599 is buildable, and no catalogue addition is
  needed**, including a 347 on the 1 mm grid.
- The door count follows the width through `TWO_DOOR_MIN_WIDTH_MM = 500` (`door-count.ts`):
  **200–499 has one door, 500–800 has two.** That is ADR 0035 decision 4, the owner, 2026-08-28:
  *"make it still 500 … and two doors start from 500"*.
- ADR 0033 makes the door count *"a consequence of the width, never a separate product to pick"*.
  So a 400 or 450 mm fill builds **one** door, where the note asks for two. The two owner rulings
  disagree for 400–499 only. At 300–399, both say one door, and at 500–599 both say two.
- **This is put to the owner as RQ26 (below).** The default is the catalogue as it stands.

**Fridge on B: the fill applies there too** (*derived*).

- RQ25a asked back wall against side walls, and did not ask about the fridge's side. Under N11.8,
  wall A's remainder is always at its high end.
- So "back wall only" reads as **every U's wall A**. The coordinator's gloss, "the back-wall gap next
  to the sink", describes the fridge-on-C picture the owner was shown.
- **Falsifier:** an owner answer restricting the fill to the fridge-on-C case. That would remove the
  11 001 fridge-on-B rooms below.

**Not a drawer unit, and last in the order** (*derived*).

- *N3 revised* 6 counts drawer units by build id (`base-3drawer`, `base-panbank`), so a
  `base-cabinet` fill is never one.
- The fill is added **after** `withDrawerUnitsAfterTheHob`. That function converts `base-cabinet`
  storage slots after the hob into drawer units (`u-drawer-units.ts:79`, source-verified). A fill
  added earlier could be converted into a drawer body of the wrong width.
- The fill decides nothing upstream. The bottle rule (RQ21, RQ23) and the drawer count read wall A's
  run **before** the fill, exactly as now.
- So the properties that read `remainderMm` for that purpose (U3a AC1 (c)(ii) and (c)(iii)) read
  `remainderMm` **plus the fill's width**.
- (c)(i)'s *"no plain `base-cabinet` after the hob"* exempts the fill: it is under 600 mm and can
  never hold a drawer unit.

*Measured on the model* (`u3b/rq25.mjs`, run with `rtk proxy node` over HEAD's committed planner
with N11.8 and RQ25 applied):

| Sweep | Rooms with a fill | 300 mm | 400 mm | 500 mm | Fridge on C / B / dropped | Digest |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| grid, h 2600 | **21 501** | 7 893 | 6 804 | 6 804 | 10 491 / 11 001 / 9 | `6046ca18decf8d32d2cb5d55f5300fe56aea38236d53fe60e5a09fa47f57475c` |
| grid, h 2199 | 23 013 | 8 685 | 7 164 | 7 164 | 11 235 / 11 769 / 9 | `43097f1c8ed0fe4fe6ff1a9fa37e8b470f76363c13b2e7ac999c35efa6aa9b0d` |
| engine band A 1800–2699 step 50 | 0 (A's remainder ≤ 250 there) | — | — | — | — | `d4a63e4d…df6a35c08` (= N11.8) |

- **The drawer histogram is unchanged** at h 2600: 4 968 / 27 118 / 13 172 / 14 572 / 9 937 / 16 939.
- 18 225 of the 21 501 fills are in rooms whose hob went round onto the far wall.
- **These digests supersede N11.8's at h 2600 and h 2199.** The implementation reports its own, and
  a mismatch is reported with its rooms (7J A8).

**Witnesses:**

- **2700 / 1600 / 1700.** Fridge on C. A's run is 900–1800, with the sink at 900–1500 (N11.8); the
  300 mm at 1500–1800 now takes a one-door `base-cabinet`, so A is bare 0.
- **3100 / 1000 / 1100.** The 100 mm stays bare (under 300).
- A 400 mm fill room and a 500 mm fill room, taken from the model's output: the implementer quotes
  one of each from its own sweep, and pins it.

#### RQ26 — owner question (non-blocking; default (A) built) — **ANSWERED 2026-09-29: "Two doors from 500 (Recommended)"**

**Answered 2026-09-29 (a relayed selection, not verbatim owner text): "Two doors from 500
(Recommended)"**, which is option (A). The 400–499 back-wall fill cabinet keeps one door, and ADR 0035
decision 4 stands unchanged. Nothing is owed by this question; the text below is kept as asked.

> *"A 400–499 mm cabinet: one door or two? You asked for the back-wall gap to get '2 doors or 1 door
> cabinet (1 door if less than 400mm)'. The catalogue follows your 2026-08-28 rule instead, which is
> that every hinged cabinet up to 499 mm has one door and two doors start from 500. With the gap
> filled, 6,804 room sizes get a 400 mm cabinet there.*
>
> *(A) Recommended: keep 'two doors from 500' everywhere. The gap cabinet at 400–499 has one door,
> exactly like the same cabinet you'd pick in the editor.*
>
> *(B) Two doors from 400, for every hinged cabinet in the catalogue, base and wall. Every
> 400–499 cabinet changes its doors, handles and price.*
>
> *(A cabinet whose door count differs from the catalogue only because the generator placed it is
> not offered: the same width would then be two different cabinets.)"*

**It does not block S1.** Under either answer the fill is a `base-cabinet` of the remainder's
width. (B) is a catalogue change (`TWO_DOOR_MIN_WIDTH_MM`, a dated amendment to ADR 0035 decision 4,
and the price book), not a composition change. It would be its own item.
