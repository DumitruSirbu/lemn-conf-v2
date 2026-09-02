# ADR 0053 — The design document records the whole frozen map, in two disjoint arrays

Status: Accepted
Date: 2026-09-02
Type: Decision
Milestone: M5 wave 5H — closes `docs/BACKLOG.md` entry 22

## Context

`docs/BACKLOG.md` entry 22, found by the 5B2b logic review and confirmed on screen by visual
verification on 2026-09-01. [ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md)
persists **member-less** columns only, so a column that still holds a member but whose frozen extent
its placements no longer imply loses that extent on reload. Two user-visible routes:

- **Partial delete.** Delete `p7` while `p24` stands above it: in session, two openings, 700×860 and
  700×350, span 1850 mm. Reload, and both are gone.
- **Clear then refill — the one that matters.** Clear `A|2.60`, insert an exact-fit 600 mm
  `base-dishwasher`, reload. The column silently shrinks from 2600 mm to 860 mm and two usable
  openings vanish. Three taps, a natural thing to do, and 1740 mm of a full-height column.

Both are the same mechanism: `projectEmptyColumns` skips any key a placement is filed under, so the
stored entry recording the 2600 mm extent is dropped, and the restored `top` comes from the members.

## Decision

**A second array, `columnExtents`, is added to `DesignSchema` alongside `emptyColumns`.** It carries
the frozen extents of columns that **do** hold a member, on precedence-plus-containment rather than
disjointness. `emptyColumns` keeps its exact ADR 0044 definition; `projectFrozenMap` partitions the
frozen map's keys into the two arrays in one pass over one predicate — `occupiedKeys.has(key)` —
rather than two independently written scans. `deriveColumns(records, stored: FrozenMapDocument = {})`
takes one named object, `{ emptyColumns, columnExtents }`, in place of the positional `emptyColumns`
array ADR 0044 added. No schema version bump: the field is optional and additive, so a document
without it loads exactly as it does today, occupied extents derived from the placements. **This is
not ADR 0038's licence** — that record's premise is corrected below, and citing it here would borrow
authority the wave does not need. It is an ordinary backward-compatibility argument: old documents
keep the old reload behaviour, new saves carry the map.

### What this replaces

[ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md)'s rejected alternative —
*"store the whole frozen column map"*, on the grounds that **"the occupied columns are already fully
derivable from the placements"** — is false, and backlog 22 is the proof. An extent a delete or an
insert froze is exactly what the placements no longer imply once a partial delete or a clear-then-
refill happens. That supersession was recorded during wave 5G, in ADR 0044's own struck-through
alternative and in `docs/decisions/README.md`'s Supersessions list; this record is where the
replacement rule actually lives.

### Precedence

**A stored extent wins over the placement-derived column**, on the whole of ADR 0011 Gap D's extent —
`wall`, `x`/`z`, `w`, `d`, `top`, `regions` — because `toColumnExtent` rebuilds the whole extent from
the stored entry, not a subset of its fields. Membership and `ry` still come from the placements, and
`hasFullHeightUnder` is still re-answered afterwards by `withCurrentFullHeightMembers`, so the
extent-frozen / live-predicates-re-answered boundary stays exactly where ADR 0011's 2026-08-26
correction put it. Gap D forbids **re-deriving** an occupied column's extent from its current records
— which is exactly what `deriveColumns` did on every reload before this wave, and what this wave
stops doing. It is obeyed more fully, not overturned.

### Containment is vertical only

**This is the record's most important paragraph.** Restoring a stored extent over an occupied column
is a real hazard — the extent could disagree with the members it now covers, in either direction —
and what makes the overwrite safe has to be proved, not assumed. `extentContains` asks two of an
extent's four fields:

```ts
function extentContains(extent: StoredColumnExtent, member: MemberSpan): boolean {
  return extent.y0Mm <= member.floorMm && extent.topMm >= member.topMm;
}
```

The floor is a **MIN** over the members and the top a **MAX**, so a stored extent that passes this
check can only ever hold *at least* as much vertical space as its own members stand in. A restore can
widen a column and can never lose the space a member occupies. That is what monotone containment
proves, and it is strictly stronger than the disjointness proof it replaces — disjointness only ever
said the two halves of the map never met.

**It proves nothing about width, depth, or any other column, and this is deliberate rather than an
oversight — both dropped clauses were considered and refused for measured reasons.**

- **The depth clause refuses documents the product itself writes.** ADR 0011 Gap D freezes `d`, and
  a resize rebuilds its members with freshly measured seats, so a member's occupied depth can grow
  past the extent that holds it while the extent stays where Gap D put it. Measured on the shipped
  kitchen: shrinking the pantry leaves `B|1.77` frozen at 600 mm deep holding a top box that occupies
  639 mm. A depth-containment clause would refuse that document outright. Swept: 400 command
  sequences against the seeded kitchen produced **10** such documents — an extent narrower in depth
  than a member it legitimately holds — none of them hostile, all of them ordinary use.
- **The along-wall clause's *stated* reason was wrong, and this is recorded as a correction rather
  than quietly fixed.** The `Math.min` at `void-engine.ts:441` that derives `Column.w` as the MIN
  over its members' widths is real, and it is real that a column is routinely narrower than a body it
  holds. But the specific instance first cited to justify dropping the clause — the seeded `A|1.30`
  measuring 500 mm wide while holding a 600 mm base — was not measured before it was written down.
  `A|1.30` is the 800 mm sink run: it measures **800 mm and holds three 800 mm members** (`p0`,
  `p11`, `p17`), not 500 holding 600. Re-swept properly: **zero** of the 400 command sequences above
  would have been refused by an along-wall containment clause. The clause is still refused, on the
  correct grounds — an extent narrower than its members along the wall is a state a partial delete
  can produce, and refusing it would refuse the document, not a hostile one — but the reason first
  offered for it was believed and repeated before it was measured, and that is worth a reader knowing
  rather than a silent correction.

Both are bounded from above by the room instead (`findExtentRoomIssues`, ADR 0044's existing room
bound extended to the new array), which stops an extent reaching across the wall or out through the
shell without constraining it against its own neighbours.

### What actually holds the keys apart: the overlap sweep

Containment is a **per-key** proof: it says an extent holds the members filed under its own key, and
says nothing about a key that isn't its own. `recomputeVoids` builds what a column publishes from
`membersByColumn.get(column.key)` — that column's own members and nothing else — so a stored extent
whose declared footprint reaches into a neighbouring key publishes openings straight through that
neighbour's bodies, selectable and insertable into, with every containment check passing because the
check never looked at that key.

**Without a separate sweep, a validated document published openings over real bodies.** Reproduced
three times independently — by the logic reviewer, by the security reviewer, and by adversarial QA —
each with a concrete input. QA's: an extent for `A|2.00` declaring `widthMm: 3200` is inside the
3600 mm wall and passes every per-key containment check, and the openings it publishes span
0.4–3.6 m of wall A — through eight placements standing in that reach, selectable and insertable
into over real cabinets. A second, independent example: an extent whose declared floor reaches down
through a neighbouring column's body passes because containment only asks about the extent's *own*
members. Either shape, once saved, makes the owner's own document unsaveable on the next command that
touches it — the validator that let the extent in refuses whatever the placements now imply.

**`findWallOverlaps` sweeps all three span kinds on a wall — placements, `emptyColumns` entries, and
`columnExtents` entries — sorted and swept per wall rather than compared pairwise, so an honest
document stays linear in its own size at the schema's caps.** An extent is exempted from the sweep
only against placements filed under its **own** key (`ownsTheMemberItOverlaps`) — holding those is
what the extent is for, and `extentContains` is what judges that pair. Every other pair, on any wall,
is compared. Three new refusal codes join the sweep: `COLUMN_EXTENT_OVERLAPS_PLACEMENT`,
`COLUMN_EXTENT_OVERLAPS_EMPTY_COLUMN`, `COLUMN_EXTENT_OVERLAPS_COLUMN_EXTENT` — plus the four
per-entry refusals below, seven codes in total for the new array.

**State plainly: the vertical containment pair is sufficient only together with the overlap sweep,
never alone.** An earlier framing of this wave's safety argument read "the room bounds every extent,
so nothing can reach far enough to cause harm" — that reading is false, and the counterexample is
exactly the `A|2.00` case above: 3600 mm of room against a neighbour 600 mm away. The room is four
orders of magnitude looser than a column's actual neighbours, and it was never a substitute for
checking those neighbours directly.

### The four per-entry refusals

- `COLUMN_EXTENT_HAS_NO_MEMBER` — the key holds no placement. A frozen extent with nothing under it
  is an `emptyColumns` entry wearing the wrong array's name, and the nine refusals that govern that
  array (including ADR 0052's width ceiling) would not be asked of it if it were let through here.
- `COLUMN_EXTENT_EXCLUDES_MEMBER` — a member fails the vertical containment check above.
- `COLUMN_EXTENT_KEY_COLLIDES_WITH_COLUMN_EXTENT` — two entries addressing one slot in the column
  map; `deriveColumns` would restore both and keep the last, so one recorded extent would not exist
  in the derivation.
- `COLUMN_EXTENT_OUTSIDE_ROOM` — the room bound, extended from `emptyColumns` to the new array.

Both seams validate: `validateDesignForCatalog` runs at the API write seam and the load/migration
seam alike, so a hand-edited or hostile document is refused wherever it arrives — DOM-001's rule
applied to a new field rather than re-learned.

## Why `MAX_EMPTY_COLUMN_WIDTH_MM` does not apply to an extent

ADR 0052's 800 mm ceiling governs `emptyColumns` and is deliberately **not** extended to
`columnExtents`. `A|0.45` holds `base-corner-x-900`, a 900 mm member, so its own extent is
legitimately 900 mm wide — a ceiling here would refuse the shipped kitchen on its first save under
this schema. ADR 0052's reason for the ceiling is a `'fit'` body refusing to insert into an opening
no cabinet fits; a `columnExtents` entry is never an insert target on its own terms, it is the record
of the space a real body already occupies. `max(member widths)` was considered and rejected too, for
a narrower but still real reason: Gap D freezes an extent while its members may since have become
narrower — the pantry case above, again — so a bound derived from current members would refuse the
extent the freeze exists to protect.

## The `regions` collapse

`toColumnExtent` writes one interval — `[y0Mm, topMm]` — where the frozen map's in-session `regions`
field can hold several, one per original member. **This wave is the first to make that collapse
apply to an occupied column.** ADR 0044 already recorded it for a member-less column; from this wave,
*every* column that has ever been saved and reloaded loses its interior region structure on the
reload, occupied or not. Verified inert for snapping: `resolveSnapY0M` (`insert-fit.ts`) feeds every
region start into its snap-candidate list, but `refuseHeight` runs first and `minY` is always a
candidate, so the restored and the in-session answer agree within `EXACT_MILLIMETRE_TOLERANCE_MM` —
proven with an occupied-column fixture carrying more than one member, not assumed from ADR 0044's
member-less proof.

## The ordering that is unfalsifiable

`deriveColumns` restores `columnExtents` **before** `mergeAdjacentEmptyColumns` and **before**
`withCurrentFullHeightMembers`. Merging before the full-height answer is not commutative in
principle: the merge can widen a column, and `hasFullHeightUnder` is a geometric along-wall overlap
computed over that column's width — so merging first and then asking the question can answer it
differently than asking first and merging second. **No reachable document distinguishes the two
orderings today.** Wall A carries no full-height body at all, so the question never has a live case
to disagree about there; on wall B, the tall runs (the pantry, the oven tower, the fridge housing)
partition the wall so completely that a member-less key only ever touches its tall neighbours, never
a base run wide enough to change the answer through a merge. Both facts are pinned by tests, so a
future wave that changes either — a full-height body reaching wall A, or a base run wide enough to
merge across a tall column's neighbour — turns them red rather than leaving the ordering's real
behaviour undiscovered. Recorded as unfalsifiable in the sense ADR 0048's shelf-pitch sentence was:
true of every state this product can reach, and not provable in general.

## The residual to state out loud

The first save of a legacy v1 document — one that predates this wave and has never carried
`columnExtents` — freezes whatever extents that document currently derives, **including any that
were already shrunk by backlog 22 before this wave shipped.** For a design that hit the bug this
record fixes and was saved again before the fix, that shrinkage is now recorded permanently the
moment it is next saved. This is correct behaviour under the decision above — the document has no
other extent to prefer — and it is unrecoverable: nothing in this wave, or in the document itself,
can tell a legitimately-800-mm column from one that used to be 2600 and lost it to the bug this
record closes.

## Gap D: obeyed more fully, not violated

[ADR 0011](0011-m3-insert-contract-gaps.md) Gap D forbids re-deriving an occupied column's extent
from its current records — that is exactly what `deriveColumns` did on every reload before this
wave, silently, and what this wave stops. `withCurrentFullHeightMembers` still runs after the restore
in every case, so the extent-frozen / live-predicate boundary the 2026-08-26 correction drew stays
exactly where it was drawn.

## Caps and security

- **`MAX_COLUMN_EXTENTS = MAX_PLACEMENTS`** (168 today), derived rather than chosen: an entry is only
  legal on a key a placement is filed under, and there are at most `MAX_PLACEMENTS` placements. It
  does not share `MAX_EMPTY_COLUMNS`' budget (1262, bounded by column-key granularity across a wall)
  — the two arrays are bounded by different things and each cap binds its own array.
- **`MAX_DESIGN_BYTES` rises from 248 576 to 270 080** — `168 × 512 + 1262 × 128 + 168 × 128 + 1024`,
  adding `MAX_COLUMN_EXTENTS × 128` (the same per-entry allowance `EmptyColumn` already uses, reused
  rather than re-derived) to ADR 0052's figure. Not raising it would refuse the largest document the
  schema itself now allows, at the write seam — the exact failure ADR 0044's own byte-cap comment
  exists to prevent.
- **Validation cost is bounded at ≤168×168 ≈ 28 000 comparisons** for the containment check
  (`MAX_COLUMN_EXTENTS × MAX_PLACEMENTS` in the worst case), negligible beside the sweep's existing
  ~1.02 million comparisons at the schema's full caps.
- **Both seams validate**, and neither can be bypassed: `validateDesignForCatalog` is the one
  function both the API `PUT`/`PATCH` route and the load/migration path call, so a hand-built
  `columnExtents` array reaching either surface is refused the same way DOM-001 already established
  for `emptyColumns`.

## Alternatives considered

**Widen `emptyColumns` itself to cover occupied columns too.** Rejected — it would break the
disjointness ADR 0044 built `deriveColumns`' `columns.set` on, force the nine existing refusal codes
to be reinterpreted for a case they were never written against, and give one array two different
safety arguments (disjointness for the empty case, containment for the occupied one) instead of one
array per argument.

**Refuse to freeze an occupied column's extent at all, and accept the reload divergence as ADR 0044
did.** Rejected — that is backlog 22 staying open, and the clear-then-refill route costs 1740 mm of a
full-height column on three ordinary taps.

**Infer the extent from `y0`/`top` of the widest historical span the placements could have occupied.**
Rejected without building it — it is a re-derivation from current records, precisely what Gap D
forbids, and it cannot recover a floor or top no current placement implies, which is the same failure
ADR 0044 already found in the member-less case.

## Records swept before deciding, and how each is settled

Per the owner's standing instruction of 2026-09-01, checked before implementing:

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md), *Alternatives considered*, "store the whole frozen column map" | Rejected: occupied columns are "already fully derivable from the placements". | **Superseded.** The premise is false, and backlog 22 is the measured proof. Struck through in place in ADR 0044 with a dated pointer to this record, added during wave 5G's planning. |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D | A column's extent is frozen at load; re-deriving an occupied column's extent from its current records is exactly what Gap D forbids. | **Obeyed, not overturned.** This wave stops the re-derivation Gap D always prohibited. `withCurrentFullHeightMembers` still runs after every restore. |
| [ADR 0011](0011-m3-insert-contract-gaps.md), `hasFullHeightUnder` correction, 2026-08-26 | One design must not have two answers depending on the route taken to reach a state. | The precedent this record's whole shape follows, and the reason the ordering section above is written down rather than left implicit. |
| [ADR 0002](0002-db-backed-shareable-persistence.md) | Canonical-serialisation round-trip invariant: parse, validate, re-serialise, and require identity with the stored canonical form. | No conflict; the invariant gains a case — a document carrying `columnExtents` round-trips under the same rule. The serialiser itself is key-generic and needs no change. |
| `DEVELOPMENT-SPEC.md` §3.2 | Already amended by ADR 0011 and ADR 0044 with dated pointers. | Gains a third pointer: the map is now derived from the placements, the stored `emptyColumns`, **and** the stored `columnExtents`. |
| `DEVELOPMENT-SPEC.md` §12 | The production `Design` shape, already narrower than the shipped one (`seatDepthMm`, `emptyColumns`). | Gains a dated pointer naming `columnExtents` as the third field the shipped shape carries beyond §12's recommended one. |
| [ADR 0038](0038-pre-release-no-stored-designs-no-migrations.md) | No design has ever been stored; a field added under this licence is free until first release. | **Not cited for this field's cheapness**, deliberately — ADR 0038's premise was corrected during wave 5G ([ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md): 5 rows exist, `schema_version` 1). This record's freedom from a version bump rests on the field being optional and additive, a backward-compatibility argument that holds regardless of what the database contains. |

Nothing found in the sweep contradicts the decision; the one row marked superseded is the sweep's
most important finding, and it is why this record exists rather than a quiet widening of ADR 0044.

## Consequences

- **The frozen map has a wire shape whole for the first time.** Two arrays, partitioned by one
  predicate, cover every key the in-session map can hold.
- **A stored `columnExtents` entry can now widen what a reload shows, never narrow it below what its
  own members require** — the containment proof's exact guarantee, and the one this record's title
  claim rests on.
- **It proves nothing about a column's width, depth, or its neighbours on the same wall.** The
  overlap sweep is what makes that safe in practice; containment alone is not sufficient, and this
  record says so as its own heading rather than as a footnote.
- **`regions` collapses to one interval for every column that survives a save and reload, occupied or
  not**, from this wave on. Verified inert for snapping.
- **Seven new refusal codes** join the nine ADR 0044 established: four per-entry
  (`COLUMN_EXTENT_HAS_NO_MEMBER`, `COLUMN_EXTENT_EXCLUDES_MEMBER`,
  `COLUMN_EXTENT_KEY_COLLIDES_WITH_COLUMN_EXTENT`, `COLUMN_EXTENT_OUTSIDE_ROOM`) and three from the
  overlap sweep (`COLUMN_EXTENT_OVERLAPS_PLACEMENT`, `COLUMN_EXTENT_OVERLAPS_EMPTY_COLUMN`,
  `COLUMN_EXTENT_OVERLAPS_COLUMN_EXTENT`).
- **`MAX_COLUMN_EXTENTS = 168`, `MAX_DESIGN_BYTES = 270 080`.** Both derived, not chosen.
- **No schema version bump.** The field is optional and additive.
- **A legacy document's first save under this wave freezes whatever it currently derives**, including
  an extent already shrunk by the bug this record fixes. Correct and unrecoverable.
- **The ordering of the restore relative to the merge and to `withCurrentFullHeightMembers` is
  unfalsifiable on any document this product can reach today**, and is pinned by tests rather than
  proved in general.
- **The next save of any legacy document is no longer a wire no-op.** `withFrozenMap`
  (`apply-command-result.ts`) writes `columnExtents` for every occupied column on the resolved map,
  not only the ones the triggering command touched, so the first command any pre-5H document
  receives — of any kind, unrelated to width or free space — adds one `columnExtents` entry per
  occupied column to what gets saved. ADR 0002 decision 20's round-trip invariant (load, validate,
  re-serialise, compare with **no** command run) is untouched by this, because nothing populates
  `columnExtents` on a bare load; what changes is that the next *save* is observable on the wire even
  when nothing about the kitchen changed.
