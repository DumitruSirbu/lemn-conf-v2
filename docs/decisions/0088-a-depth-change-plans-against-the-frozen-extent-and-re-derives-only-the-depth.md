# ADR 0088 — A depth change plans against the frozen extent and re-derives only the depth axis

Status: Accepted — **decision 1 amended 2026-09-06 by [ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decision 6.** This record is planned (wave 6K-i) and not implemented; read the amendment before writing it.
Date: 2026-09-06
Type: Decision (adjudication of ADR 0079's recorded finding)
Milestone: M6 — wave 6K-i, the finding [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md)
recorded and deliberately did not rule

## What was owed

ADR 0079's closing section, *"Finding, recorded and NOT ruled here: a depth change refused by two
ordinary deletes"*, records that deleting `p12` (`open-shelf-600`) and `p18` (`wall-2door-600-top`)
from `A|2.00` and then running any `setCabinetDepth` refuses `HEIGHT_EXCEEDS_LEVEL`, leaving the
shipped kitchen unable to change its own depth. It classifies nothing, names no cause beyond a guess,
and says explicitly: *"it is not wave 6K-c's, it is not this record's, and it needs its own
adjudication."* Wave 6K-i is that adjudication. This record is its ruling.

Six 6K siblings landed after ADR 0079 was written (6K-d, 6K-e, 6K-f, 6K-g, 6K-h, 6K-j). **None of
them subsumes it.** The refusal reproduces at `14cef90`, measured below.

## The measurement

Run at `14cef90` against the built `packages/configurator-domain/dist`, on `KITCHEN_L_DESIGN` with
the catalogue built by `buildKitchenLBodyCatalog`. **No store, no fake probe, no frozen map** — the
refusal is decided before any probe is asked anything, by `evaluateInsertFit` alone, which is why it
can be measured this cheaply and why the reproduction the finding attributed to the web package's
fake probe never needed one.

### The refusal

`A|2.00` holds three members: `p1` (`base-dishwasher-600`, `y0` 0, `h` 820), `p12` (`open-shelf-600`,
`y0` 1500, `h` 700) and `p18` (`wall-2door-600-top`, `y0` 2200, `h` 400). Deleting members and then
resolving the opening `rebuild` plans `p1` into:

| deleted from `A\|2.00` | `column.top` | vacated slot `h` | `evaluateInsertFit` on `p1` |
| --- | --- | --- | --- |
| — | 2.60 m | 860 mm | fit ok, `h` = 860 |
| `p12` | 2.60 m | 860 mm | fit ok, `h` = 860 |
| `p18` | 2.20 m | 860 mm | fit ok, `h` = 860 |
| **`p12` + `p18`** | **0.82 m** | **820 mm** | **`HEIGHT_EXCEEDS_LEVEL`, required 860, available 820** |

### The blast radius is wider than a depth change, and that is the part the finding did not have

The same opening resolution serves §5.3's swap and §9's offer list (`resolveInsertOpening` →
`openingFromPlacement`). On the same two deletes, `offersFor({ target: p1 })` returns **eight offers
and eight `HEIGHT_EXCEEDS_LEVEL` verdicts** where the untouched fixture returns eight offered rows.
Every base swap on that column is dead, not only the depth change.

### And a second symptom, which is ADR 0011 Gap D's own sentence

`recomputeVoids` over the same design publishes **no void at all** in `A|2.00`:

| deleted | voids published in `A\|2.00` |
| --- | --- |
| — | none (the column is full) |
| `p12` | `y0` 1500, `h` 700 |
| `p12` + `p18` | **none** |

The 700 mm opening the first delete freed **disappears when the second delete lands**. ADR 0011 Gap D
states this failure verbatim, in 2026-08-26's words: *"Deleting the top unit of a column recomputes
`top` down to the deleted body's bottom, so the 400 mm that was just freed produces no void at all."*

## Cause

`Column.top` is `Math.max` over the members' `y0 + h` (`void-engine.ts:582`). With `p12` and `p18`
gone, `A|2.00`'s tallest member is the 820 mm dishwasher niche, so the column's top collapses
2600 → 820. `deriveFreeSpans` runs from the column's floor to `column.top`, `findVacatedSlot` asks
`recomputeVoids` for the void `p1`'s removal would create, and gets an 820 mm base slot. §7 builds a
base body to the 860 mm worktop line while M2's seeded base cabinets record 820 (the carcass without
the counter) — the disagreement `openingFromPlacement`'s own doc comment is written about:
*"every seeded base cabinet would refuse every base row in its own swap list. The level slot is
860 mm either way, which is the sense in which it is unchanged."* When the target is the tallest
member of its column, the vacated slot silently degenerates to the target's own frame, which is
exactly the reading that comment forbids.

**Why only `setCabinetDepth` reaches it through the product.** Every other path reads the frozen map.
`publishedColumns` returns `input.frozen` unchanged on a delete (ADR 0011 Gap D), and
`projectFrozenMap` writes the surviving extent into `columnExtents` — measured, the stored entry for
`A|2.00` after the two deletes is
`{"wall":"A","alongMm":2000,"widthMm":600,"y0Mm":0,"topMm":2600,"depthMm":620,"depthFromBuildId":"base-dishwasher-600"}`,
with `topMm` 2600 intact. The one seam that discards it is
`set-cabinet-depth.ts:137`:

```ts
const columns = deriveColumns(records, {}, planning.room);
```

The `{}` is deliberate and its comment is right about *why* — §3.2's depth MAX is the fact the
command changes and re-deriving it is the point. What the comment does not say is that `{}` discards
`top`, `regions` and `w` with it. Those are the facts Gap D froze **because the placements no longer
imply them**, and ADR 0079's own store-side prose already states the axis split one package over:

> ADR 0011 Gap D freezes a column's extent so a delete frees space instead of shrinking the run to
> what is left. That argument is about the **along-wall and vertical** axes — the width a partial
> delete left behind is the customer's, and nothing can re-derive it. It says nothing about depth.

`atCurrentCabinetDepth` obeys that split exactly: it starts from `input.frozen` and rewrites `d` and
`depthFromBuildId` alone. `set-cabinet-depth.ts` re-derives all three axes, and the comment beside
`atCurrentCabinetDepth` even asserts the two agree — *"The domain command makes the same observation
one package over and re-derives for the same reason"*. They do not.

## Classification

**Implementation defect**, in `packages/configurator-domain/src/commands/set-cabinet-depth.ts`.

- **Not a contract gap.** The rule exists and is dated: ADR 0011 Gap D as narrowed 2026-08-26, and
  [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md) (M5 wave 5H), which added
  `columnExtents` for occupied columns precisely so that a column whose placements no longer imply
  its extent keeps it. ADR 0053's own context section reports the identical arithmetic from the
  reload direction: *"the column silently shrinks from 2600 mm to 860 mm and two usable openings
  vanish."* Nothing was unruled; one caller does not obey the ruling.
- **Not a test-fidelity problem.** It reproduces in the domain package alone, in `evaluateInsertFit`,
  with no probe and no store. ADR 0079 hedged its attribution — *"that attribution has not been
  independently re-measured here, because the reproduction needs the web package's fake probe"* —
  and the hedge can now be discharged: it does not.

**ADR 0079's suggested direction is superseded, and this extends that record rather than contradicting
it.** It reads: *"the 860/820 pair suggests the niche's own height rather than the depth axis."* The
pair is indeed the niche's recorded 820 against §7's 860, so the observation was right; the inference
was not. The niche's height is correct and shared by every seeded base cabinet. What is wrong is the
opening it is measured against.

## Decision

### 1. The planning map carries the frozen extent's vertical and along-wall axes, and re-derives the depth axis

> **Amended 2026-09-06 by [ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)
> decision 6.** This decision was written against a command that moved nothing along the wall. Wave 6J-c now
> slides wall B's run, so *carried* means **not re-derived from the members standing there** — it does not mean
> immune to the command's own move. Wave 6K-i builds its planning map from the frozen extents **as ADR 0090
> decision 2 moves them**, and runs **after** wave 6J-d. Taken literally as written below, this decision would
> restore the extents at the coordinates the run is leaving while the placements plan at the ones it is
> arriving at — the same defect ADR 0090 measured, one seam earlier and inside `evaluateInsertFit`.


`rebuildEveryBodyAt` builds its planning map from the design's own `emptyColumns` and `columnExtents`
for `top`, `regions`, `w` and the along-wall origin, and from the records at the new setting for `d`
and `depthFromBuildId`. This is `atCurrentCabinetDepth`'s split, applied to the map the command plans
against rather than to the map the store publishes afterwards.

**Neither operand alone is correct, and both halves are refuted by measurement rather than by
argument.** At the 700 mm setting, after the two deletes:

| planning map | `p1` | `p8`, `p10`, `p15`, `p16` (wall bodies) |
| --- | --- | --- |
| `{}` — today | **`HEIGHT_EXCEEDS_LEVEL`** | planned at `d` = 400 (correct) |
| the frozen extent restored wholesale | fit ok, `h` = 860, `d` = 720 | **planned at `d` = 330** |

330 mm is the *600 mm* kitchen's wall-map carcass inside a 700 mm kitchen — the
*"600 mm wall shell built, measured and persisted in a 700 mm kitchen"* that `planningDesign`'s doc
block and [ADR 0077](0077-a-joint-seated-body-declares-its-seat-and-is-never-measured-for-one.md)
decision 8 exist to prevent, and that wave 6K-h shipped the fix for. **A wave that cures the refusal
by passing the stored map through has re-opened 6K-h.**

`deriveColumns` cannot express the split as it stands: `addStoredColumnExtents` calls
`columns.set(extent.key, extent)`, replacing the derived column outright. The merge is therefore new
code, and decision 2 says where it may live.

### 2. The axis split has one author

The rule *"the vertical and along-wall axes are frozen, the depth axis is re-derived"* is now stated
in two places — `atCurrentCabinetDepth` in `apps/web` and the planning map in the domain — and it is
the same rule. Whichever way wave 6K-i writes it, a reader must be able to find one statement of it;
two implementations that agree today are what this project keeps finding parted later
(`findVacatedVoid`/`findVacatedSlot` and `deepestMember`'s two orders are the recorded instances).

**Not prescribed here beyond that**, because the two seams take different inputs — the store holds a
`ReadonlyMap<string, Column>` and re-answers it, the command holds a `Design` and builds one — and
the right shape is the implementer's to find. What is ruled is that the wave states which one it
chose and why, and that the criterion in the plan is structural rather than a promise.

### 3. The depth axis is value-preserving, and that is asserted, not assumed

For every column key the planning map holds today, the fixed map's `d` and `depthFromBuildId` are
**identical**. A surplus a delete left behind belongs to the frozen extent and must **not** enter the
planning map's depth: what the rebuilt body is built to is §3.2's MAX over what actually stands
there at the new setting, which is what `{}` gives today and what
[ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) decision 2 and ADR 0079
decision 2 rule for the republish that follows. This decision changes the vertical axis and nothing
else.

### 4. `Column.top` is not changed, and no floor is put under it

Three cures were available and two are refused by name.

**Refused: give `column.top` a floor at the top of the level its floor sits in.** It would cure the
refusal everywhere at once, including the hand-built designs that carry no frozen map. It is refused
because it changes what a column *is* for every reader in three packages, and it would make a column
holding one base cabinet publish wall-band and top-band openings it does not have — a column's
vertical extent is a recorded fact about a run, not a function of the level grid.

**Refused: make `openingFromPlacement` fall back to the level slot when the target is its column's
tallest member.** It cures the symptom at the one call site that shows it and leaves `recomputeVoids`
publishing no void for the space the delete freed, which is the second symptom above and the more
serious one — the customer loses 700 mm of wall space rather than one refusal. A cure that fixes the
refusal and not the void loss has fixed the smaller half.

**Accepted: decision 1.** The frozen extent already holds the right answer, in the document, and the
one caller that throws it away is the one that refuses.

### 5. `rederiveTouchedColumns` is adjacent, already documented, and out of this wave's scope

`void-engine.ts:1077` runs `deriveColumns(recordsAfter, {}, room)` and its doc block already names the
same loss: *"a re-derived key loses the load-time regions of members deleted earlier in the
session."* It is bounded to keys an insert or a resize moved a body through — never to a delete — so
it is a narrower door than this one, and it is disclosed rather than silent. **It is not fixed here
and it is not re-opened here.** Wave 6K-i's criteria include that it does not regress, so a wave that
happens to close it does so visibly.

## Sweep of the decision records

Per `docs/WORKFLOW.md`, *Sweep the decision records before deciding*. Grepped `docs/decisions/` for
`Gap D`, `HEIGHT_EXCEEDS_LEVEL`, `860`, `column.top` and `columnExtents`.

| Record | What it says | How it is settled |
| --- | --- | --- |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D, as narrowed 2026-08-26 | A column's **extent** is frozen because the placements no longer imply it; its live predicates are not. Names this exact symptom: deleting a column's top unit recomputes `top` down and the freed space produces no void. | **The rule this record enforces.** Not amended. The narrowing is what makes decision 1 an axis split rather than a wholesale carry. |
| [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md) | `columnExtents` carries the frozen extent of a column that still holds a member, because a partial delete's extent is lost otherwise. | **The rule this record enforces**, from the reload direction. Reports the same 2600 → 860 collapse. Not amended. |
| [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md) finding | Records the refusal, classifies nothing, guesses at the niche's own height, and defers to a wave. | **Adjudicated here.** Its suggested direction is superseded by measurement (see *Classification*); its decisions 1–10 are untouched. |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) decisions 2 and 3 | What a depth change re-answers on the **depth** axis. | **Untouched, and protected by decision 3.** This record changes no depth. |
| [ADR 0077](0077-a-joint-seated-body-declares-its-seat-and-is-never-measured-for-one.md) decision 8 / wave 6K-h | A depth change plans against the catalogue, not against the seats it is about to replace. | **Adjacent and load-bearing.** Decision 1's measurement shows a wholesale carry re-opens it; the anti-invariant in the plan pins it. |
| [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) decision 1 | *"Every body adapts, with no confirmation step and nothing left behind."* | **The product rule the refusal violates**, and the sentence ADR 0079's finding cites. Unchanged. |
| [ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md), [ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md) | Empty space is a first-class state and is the customer's, recorded in the document. | **Consistent.** The void loss above is the same failure they were written against, arriving through a re-derivation instead of through a projection. |
| [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md) | The clip/split/merge order over a published map. | **Untouched.** `deriveColumns` already runs clip → merge → `withCurrentFullHeightMembers` after the stored halves are restored, so a restored extent goes through the same pipeline the store's does. |

Nothing found in the sweep contradicts this decision. No record is superseded; ADR 0079's finding is
adjudicated and its inference corrected.

## Consequences

- **`hasFullHeightUnder` is unaffected and needs no clause.** `deriveColumns` re-answers it from the
  records after the stored halves are restored, which is ADR 0011's 2026-08-26 correction working as
  written.
- **The offer-list and swap symptom is not fixed by this wave and is not a defect through the
  product**, because both read the store's frozen map. It is recorded here so that a future caller
  deriving columns without a frozen map meets the measurement rather than rediscovering it.
- **`apps/web/tests/store/qa-6k-c-frozen-source.adversarial.test.ts`'s carried-debt block is wave
  6K-i's to delete**, exactly as its own header says: *"Whichever wave adjudicates ADR 0079's finding
  deletes this block."* Its 34-trail pin becomes false the moment the refusal is cured — it asserts
  that every refused trail carries `HEIGHT_EXCEEDS_LEVEL` and that the set is exactly those 34 — so
  the wave must delete it rather than let it go red, and the sweep it guarded must survive as an
  assertion that **nothing** is refused.
- **ADR 0079's amendment E stands as written.** The block was made a bounded pin rather than an
  `it.fails` because the quantity is a set; that reasoning is not disturbed by the set becoming
  empty.
