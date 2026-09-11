# ADR 0110 — Generation inserts through the command path, starting from a shell of empty space, and the corner is structural data

Status: Accepted
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
