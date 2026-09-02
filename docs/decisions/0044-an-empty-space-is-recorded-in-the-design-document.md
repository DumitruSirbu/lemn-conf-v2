# ADR 0044 — An empty space is recorded in the design document, not re-guessed at load

Status: Accepted (one alternative superseded, one premise corrected)
Date: 2026-09-01
Type: Decision
Milestone: M5B — Manual UX remediation, wave 5B2; prerequisite for [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md)

> **Superseded in part by [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md)**
> (the rejected "store the whole frozen column map" alternative is adopted, narrower, as a second
> array for occupied columns) **and corrected by [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md)**
> ("no design has ever been stored" is false; 5 rows measured). The core decision — `emptyColumns` is
> persisted rather than re-guessed — stands.

## Context

The owner reported, 2026-09-01: shrink a 600 mm column to 450, reload, and the 150 mm strip is gone.
The shrink is permanent and the width cannot be given back.

What is true in the code:

- `Design` carries `room`, `presetId` and `placements`, and nothing else
  (`packages/configurator-domain/src/design.ts`, `DesignSchema`).
- At load, `deriveGeometry` (`apps/web/src/store/configurator-store.ts:259-264`) builds the column
  map with `deriveColumns(records)`, which groups **placements** by column key and throws for a
  member-less column (`packages/configurator-domain/src/void-engine.ts:425-428`). An empty column
  therefore **cannot exist at load**.
- In-session an empty column exists only in the frozen map, which is carried forward by
  `resolveColumns` (`apps/web/src/store/apply-command-result.ts:104-112`) and moved by
  `moveFrozenColumns` (`commands/apply-column-moves.ts:186-206`). None of that is persisted.

So [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D freezes a column's extent precisely so a
cleared run keeps the opening it just freed — and a save discards the freeze. One document renders
two ways depending on whether the customer reloaded, which is the same failure Gap D's own
`hasFullHeightUnder` correction was written about, in the other direction.

It matters more now than when it was first reachable. [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md)
decision 7 makes a shrink *create* an empty column, so the ordinary act of resizing produces the
state that does not survive; and [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md)
has just made a gap of any width legal, which multiplies the number of such states a design can hold.

## Decision

**An empty space is part of the design document.** `DesignSchema` gains an optional
`emptyColumns` array: for each, the wall, the along-wall centre, the width, the floor and top of its
frozen extent, and its depth — whole millimetres, bounded exactly as every other coordinate is.
`deriveColumns` adds them to the map it builds from the placements.

**Nothing is migrated and no version is bumped.** [ADR 0038](0038-pre-release-no-stored-designs-no-migrations.md):
the project is pre-release, no design has ever been stored, so the field is free. A document with no
`emptyColumns` key loads exactly as it does today. **That licence expires at first release**, and
after it this field is a schema change like any other.

**The array is validated at both seams.** `validateDesignForCatalog` refuses an empty column that
overlaps a placement or another empty column, at the API write seam and at the load seam.

## Alternatives considered

**Synthesise empty columns at load from the unoccupied spans between adjacent columns.** Rejected,
and not because it costs more — it costs less. It cannot recover the two facts that make a frozen
extent worth freezing. A **fully cleared** column has no member anywhere in the document, so nothing
says how tall it was: `deriveFreeSpans` (`void-engine.ts:692-705`) needs `min(regions[].start)` and
`column.top`, and synthesis would have to guess both from the neighbours. §10's signature flow is
where the guess shows: clear the fridge column, get one 700 × 2600 opening subdivided into three
level slots; reload, and a neighbour-derived `top` gives something else. Synthesis is also a
re-derivation of an extent from current state, which is the exact thing ADR 0011 Gap D exists to
forbid — so it is not a cheaper version of this decision, it is a weaker rule wearing its clothes.

~~**Store the whole frozen column map.** Rejected: the occupied columns are already fully derivable
from the placements, and storing a derivable fact is how two authors for one question start. Only
the columns with no member of their own are unrecoverable, and only those are stored.~~
**Superseded 2026-09-02 by [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md)
(M5 wave 5H), which closes backlog 22.** The premise — "occupied columns are already fully derivable
from the placements" — is false: an extent a delete or an insert froze is exactly what the placements
no longer imply once a partial delete or a clear-then-refill happens, and backlog 22 is the measured
proof (in session: a partial delete loses two openings on reload; a clear-then-refill silently shrinks
a 2600 mm column to 860). ADR 0053's mechanism is narrower than the rejection it replaces: a *second
array*, `columnExtents`, carrying only the frozen extents of columns that still hold a member, on
precedence-plus-containment rather than disjointness — and the containment half is vertical only,
made safe against neighbouring columns by a separate overlap sweep, not by containment alone. See
ADR 0053 for the full mechanism.

**Refuse to leave a gap at all, so nothing needs storing.** Rejected — it is ADR 0043 reversed,
decided by the owner one day earlier.

## Records swept before deciding, and how each is settled

Per the owner's standing instruction of 2026-09-01, *"when we take a decission need to check if
earlier it was opposite or ambiguious in another ADRs"*:

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D | A column's extent is frozen at load; a cleared run must keep the opening it freed. | **This record is Gap D's missing half, not a departure from it.** Gap D froze the extent in memory; persisting it is what makes the freeze survive the only event that was silently discarding it. Nothing in Gap D is superseded. |
| [ADR 0011](0011-m3-insert-contract-gaps.md), `hasFullHeightUnder` correction | A column's *live* fields are re-answered on every derivation; only the extent is frozen. | **No conflict, and the boundary is honoured.** `emptyColumns` stores extent fields only. `hasFullHeightUnder` is still re-answered by `withCurrentFullHeightMembers` over the loaded map, empty columns included. |
| [ADR 0038](0038-pre-release-no-stored-designs-no-migrations.md) | Pre-release; nothing stored; no migration owed. Its correction of 2026-08-31 warns that an unbounded schema field was a live defect at two real seams. | **Relied on for the cheapness, and obeyed for the danger.** The field is bounded and validated at both seams — that correction is exactly why the validation is part of this decision rather than a follow-up. |
| [ADR 0002](0002-db-backed-shareable-persistence.md) | One `jsonb` document per design; canonical-serialisation round-trip invariant. | **No conflict; the invariant gains a case.** Round-tripping a design carrying `emptyColumns` is an acceptance criterion of the wave. **Corrected 2026-09-02 by [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md):** `withFrozenMap`'s own comment reads "an untouched document is not rewritten", true for `emptyColumns` because it is set only when non-empty — but `columnExtents` is populated for **every** occupied column on the resolved map, not only the ones a command just touched, so the very next command a legacy document receives, however unrelated, adds a `columnExtents` entry per occupied column to its wire form. The invariant in ADR 0002 decision 20 (load, validate, re-serialise, compare to the stored canonical form with **no** command run) is untouched — nothing writes `columnExtents` on a bare load. What changes is that the *next save*, of any kind, is no longer a no-op on the wire for a document that has never carried the field. |
| [ADR 0031](0031-a-resize-moves-a-whole-column-into-adjacent-empty-space.md) | A resize is funded by an adjacent empty column, which is a frozen extent moved by `moveFrozenColumns`. | **Depends on this record to work across a reload.** ADR 0031 is unchanged; without this, its funding column exists only until the customer reloads. |
| [ADR 0035](0035-width-is-a-bounded-stepper-not-a-menu-of-sizes.md) decision 7 | A shrink creates the empty column it needs. | **Depends on this record.** Untouched; it is the path that makes the defect ordinary rather than rare. |
| [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md), *Still open* | Names this defect explicitly and defers it to a wave of its own: *"the gaps this decision makes legal are the gaps that reload has to carry."* | **This is that wave.** ADR 0043's *"Nothing about persistence changes"* line is scoped to its own change — the removal of a refusal — and is not a claim that persistence is correct. No amendment needed; the pointer is added. |
| `DEVELOPMENT-SPEC.md` §12, production model | The `Design` shape, with `placements` and no empty columns. | **Amended with a dated pointer here.** §12 is titled *recommended* and its schema is already narrower than the shipped one (`seatDepthMm` is absent from it too). |
| `DEVELOPMENT-SPEC.md` §3.2 | *"derived once at load from the seeded placement set"*. | **Amended with a dated pointer.** After this record the map is derived from the placements **and** the stored empty columns. The freeze is unchanged. |

Nothing found in the sweep contradicts the decision. The one record that came close — ADR 0043's
*"Nothing about persistence changes"* — is about that record's own scope and says so in the same
document's *Still open* section.

## Consequences

- **The frozen map has a wire shape for the first time.** It is deliberately not the whole map: only
  the columns with no member, which are exactly the ones nothing else can reconstruct.
- **Two seams gain a new refusal.** An overlapping empty column is a document the domain cannot
  execute, and DOM-001's lesson is that such a document must be refused at the write seam and at the
  load seam, not at one of them.
- **A stale array is now possible and must be reconciled.** An empty column overlapping a placement
  can only arrive from a hand-edited or hostile document, because every command writes both halves
  together; the validation is what makes that a refusal rather than a derivation throwing.
- **The array is capped**, like `MAX_PLACEMENTS`, so derivation stays linear in a hostile document.
- **[ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md)
  cannot ship without this.** A merged or split empty column that vanishes on reload is worth
  nothing, and the merge is the feature the owner asked for.
- ~~**This record's cheapness expires with ADR 0038, at first release.** Whoever re-reads ADR 0038
  before launch owns this field too.~~ **Corrected 2026-09-02 by [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md):**
  ADR 0038's premise — that no design has ever been stored — is itself false, measured rather than
  argued: 5 `designs` rows exist, all `schema_version` 1. None carries `emptyColumns`, so this field's
  free ride held in fact for those five rows, but the expiry is not an event still waiting for first
  release; it is a premise that has now been re-checked and found already untrue in one respect. Read
  this bullet as "already re-measured, still clean for this field" rather than "not yet due."

## Verified against what shipped — 5B2a, 2026-09-01

**Nine refusal codes**, not a round number chosen in advance: `EMPTY_COLUMN_INVERTED`,
`EMPTY_COLUMN_BEFORE_WALL_START`, `EMPTY_COLUMN_PAST_WALL_END`, `EMPTY_COLUMN_ABOVE_ROOM`,
`EMPTY_COLUMN_DEEPER_THAN_ROOM`, `EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT`,
`EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN`, `EMPTY_COLUMN_OVERLAPS_PLACEMENT`,
`EMPTY_COLUMN_OVERLAPS_EMPTY_COLUMN` (`validate-design.ts`).

**`MAX_EMPTY_COLUMNS = 1262`, not the 684 first proposed.** The Context section's "bounded exactly
as every other coordinate is" turned out to admit two different derivations, and the one that
shipped is neither the width-floor reading nor security's own alternative of 228. What binds the
count is **column-key granularity**: `deriveColumnKeyAt` renders a metre value with `toFixed(2)`, so
two centres less than 10 mm apart address one key. `(6300 / 10 + 1) × 2 = 1262`
(`design-bounds.ts`). `MAX_DESIGN_BYTES` follows at 248 576 B.

**`regions` is deliberately not on the wire, and the consequence is named rather than left implicit.**
`EmptyColumnSchema` carries `y0Mm`/`topMm` — one region per empty column — not the frozen map's full
`regions` array. A column cleared of two stacked bodies round-trips as a single region rather than
its original two, because `deriveFreeSpans` (`void-engine.ts:692-705`) only ever reads
`min(regions[].start)` and `top`. This is why the milestone's acceptance criteria 3 and 4 were
corrected on 2026-09-01 to compare the observable answer — `voids`, plus `key`/`wall`/`x`/`z`/`w`/`d`/
`ry`/`top` and `min(regions)` — rather than the stored shape: deep equality of `regions` including
order is unsatisfiable by this wire shape, not a bug in it.

## Verified against what shipped — 5B2b, 2026-09-01

**The projection refuses rather than rounds.** `projectEmptyColumns` refuses a sub-millimetre centre
outright rather than rounding it — rounding would collapse two distinct map keys into one and hand
`EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN`/`EMPTY_COLUMN_KEY_COLLIDES_WITH_PLACEMENT` a document
the projection itself produced, refusing its own honest output.

**Key uniqueness is owned by the projection itself, not by validation after the fact.** 5B2a deleted
the silent-drop branch `deriveColumns` used to have, which reverses the direction of a collision: a
stored `emptyColumns` entry now **overwrites** the placements' column at derivation rather than being
dropped, and `deriveColumns` is pure with no validator inside it. So `projectEmptyColumns` has to be
correct by construction — it cannot rely on a downstream check to catch a bad key.

**`resolveSnapY0M` was proven inert, not assumed.** `insert-fit.ts:632` feeds every region start into
the snap-candidate list, and a restored column carries fewer regions than an in-session one (one
region instead of several, per this record's own *"`regions` is deliberately not on the wire"*
consequence above). Proven rather than assumed: `minY` is always a candidate and survives both
filters because `refuseHeight` runs first, so both the restored and the in-session answer lie within
ε = 1e-6 m of each other — which is exactly `EXACT_MILLIMETRE_TOLERANCE_MM` — and can never move a
persisted millimetre.

**A stated boundary, not a gap in this wave's scope.** The projection is collision-free **by key**,
which says nothing about **geometric** overlap. Two 50 mm entries 6 mm apart are distinct keys whose
spans intersect; `validateDesignForCatalog` refuses that document, and no command reaches it —
unreachable through the product, but a boundary this record should state rather than let readers
assume the key check subsumes it.
