# M5 waves 5G and 5H — the frozen map is bounded, and it is recorded whole

Planned 2026-09-02 from two owner decisions of the same day. Two waves appended to **M5**, which is
still open (5E is its last outstanding wave). Read `docs/STATUS.md` first; this file is the plan and
its reasoning, not the current state.

**Why waves of M5 rather than a new milestone.** The letters G and H are free — M5 runs A–F — where
`5C1`/`5C2` and every other short letter is already a shipped M5 or M5B wave, and a milestone whose
whole content is two waves buys a name collision and nothing else. Both waves also repair records
that are M5's own: Q5 is M5's open question, recorded in `M5-width.md` and in `ADR 0035` decision 7,
and the frozen map is what `M5-width.md` work item 4 (*column identity*) is about. M5B is closed and
archived, so nothing can be appended there.

**Sequencing: 5G, then 5H, then 5E.** Neither wave *blocks* 5E in the sense that 5E would fail
today — it would pass and then have to be re-run. 5G changes what the width stepper does at the end
of its range on the shipped kitchen, and 5E is the wave that photographs the width surface; that is
the same reason 5E was already held back once while M5B was changing that surface. 5H changes what
survives a reload, which 5E's signature flow exercises. Run both first and photograph once.

5G before 5H because 5G establishes the invariant *no empty column exceeds 800 mm*, which bounds the
extents 5H has to persist, and because 5G owns the schema version bump that 5H would otherwise have
to coordinate with.

---

## Wave 5G — 800 mm is the ceiling on any empty column

**Complete, 2026-09-02.** Decision: [ADR 0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md).
Verified: domain 1396, web 769 (+4 skipped), persistence 177; `pnpm ci:local` all gates PASS. Every
gate below applied. See `docs/STATUS.md`'s *M5 wave 5G* section for the full close-out.

### Goal

Close **Q5**, open since M5 and widened four times during M5B. `MERGE_CAP_MM = 800` bounds a merge
today; a shrink hands width back to a neighbouring empty column with no ceiling at all — measured at
900 mm in nine taps, and two taps since wave 5B8 made the pantry resizable (clear `B|2.45`, then
shrink `p6` to 400). Since wave 5B2 that oversized column **survives a reload**, and it publishes an
opening every `widthFlex: 'fit'` body refuses as `WIDTH_NOT_SUPPORTED`.

Owner, 2026-09-02: *"lets make 800 the maximum of any empty column"*. So `MERGE_CAP_MM` and the
bound a shrink's release needs are **one constant**, and Q5 closes.

### The shrink-overflow question, and the answer

When a shrink would free more width than the ceiling allows, three answers were available.

**Refuse the shrink.** Rejected, and not on cost — it contradicts a live ruling. ADR 0037's
*"a span wider than 800 mm may simply stay empty"* put exactly three options to the owner on
2026-08-28 — fill it with a combination, leave it, or **refuse the move that made it** — and the
answer was *"ok to have empty space left"*. Refusing here is that rejected third option arriving by
another route. It also makes the stepper one-way again beside a wide gap, which is what ADR 0043 and
ADR 0035 decision 7 exist to prevent, and `fundingScan` would answer it badly: with both sides
refusing, the scan falls through to `vacatedEmptySpace`, which mints a strip of its own.

**Corrected 2026-09-02 by the 5G logic review — the symptom is worse than this paragraph first
claimed, so the argument holds a fortiori.** It said the minted strip lands on the key the refusing
neighbour already holds, so the customer would read `COLUMN_KEY_COLLISION` for a width rule. Measured
on this plan's own 5G-1 route (a 700 mm gap right of `p6`, shrink by 200), the strip is
`[edge, edge + 200]` keyed at `edge + 100` while the refusing neighbour keys at `edge + 350` —
different buckets, so `refuseKeyCollision` passes and the map ends with **two overlapping empty
columns covering the same wall, which no validator refuses**. A wrong refusal the customer can read
is a bad outcome; a silently invalid map is a worse one.

**Cap it and strand the remainder.** Rejected as not representable. ADR 0046 rejected by name the
move that makes a void no column owns, and every consumer — `COLUMN_MISMATCH`, `deriveColumnKeyAt`,
the frozen map, ADR 0031's funding scan — is written against *an opening belongs to a column*.
Stranding means either silently losing wall or inventing a second kind of space.

**Split the freed span into two columns. Recommended.** The near column takes the width up to the
ceiling and the overflow becomes a new empty column beyond it. Three things make this the answer:

- It is **ADR 0046 part 1's own mechanism** at a second seam. `splitColumn` already turns one column
  into an occupied part and a remainder beside it; here the two parts are both empty.
- It **preserves ADR 0037 exactly.** The *space* is unchanged — same outer edges, same total width,
  same "may be left as it is". What changes is only how the space is decomposed into columns, which
  is precisely what ADR 0037 says a merge buys: *freedom over the number and position of cabinets in
  a span*. And it delivers backlog 2's option B shape (a run offered as several modules) rather than
  working against it.
- It is **stable and reversible.** The pair cannot re-merge — 800 + anything exceeds the cap, and
  `mergeAdjacentEmptyColumns`' greedy scan takes the widest contiguous run at or under it, so it
  leaves the 800 alone from either direction. And stepping back up *does* re-merge: a `+50` consumes
  the near column down to 750, the run totals under the cap again, and the merge that runs in
  `resolveColumns` after every command puts the space back as one column. Criterion 5G-2 asserts
  that round trip, because it is the property that stops the split from ratcheting.

The rule for which side gets the ceiling: **the column nearest the resized run fills first, and the
overflow lands beyond it.** Deterministic, and it matches ADR 0046 rule 1's reason for sorting —
one design, one picture, whatever order the customer's commands ran in.

### The migration problem — the highest risk in either decision, and its answer

**ADR 0038's premise is false, and this wave is where that surfaces.** ADR 0038 says no design has
ever been stored, and its own 2026-08-31 correction is about a stale premise used as a reason not to
look. Checked rather than inherited:

- `.env.local` sets `DATABASE_URL`, and `.env.example` defines that variable as **the application
  database** (`TEST_DATABASE_URL` is separately documented as *"must not be the application"* one,
  and `resolveTestDatabaseUrl()` refuses if they resolve to the same database — ADR 0006).
- `persistDesignChange` runs after **every successful command** (`configurator-store.ts:485`), and
  the first save mints a row through `POST /api/designs` (`fetch-configuration-repository.ts:231`).
- M5B's visual verifications asserted *"survives reload"* repeatedly, and a reload is `/d/{id}` —
  which only exists if a row was minted. Wave 5B4b's report records an 800 mm merged column
  surviving a reload at 390×844.

So rows exist in the application database. A stored document that loads today and stops loading
tomorrow is the DOM-001 shape whether or not anyone loves the design in it.

**Measured 2026-09-02, before 5G was dispatched**, against the `DATABASE_URL` in `.env.local`:

| | |
| --- | --- |
| `designs` rows | **5**, all `schema_version` **1** |
| rows carrying an `emptyColumns` key | **0** |
| `emptyColumns` entries wider than 800 mm | **0** |

**So the hazard is empty today, and the plan does not change because of it.** Two reasons. First,
`emptyColumns` is written only by a command that produces one — a shrink or a delete that frees a
span — and the M5B verification runs that asserted "survives reload" did so on designs whose empty
columns were created and read back inside the same session; the five surviving rows predate that
field or never exercised it. Second, and the reason this measurement is a comfort rather than a
licence: **the window opens the moment 5G ships.** Any shrink freeing more than 800 mm between now
and then mints exactly the row this migration exists to carry, and a shared `/d/{id}` link is the
one artefact this project hands to someone who cannot be asked to reload it.

The count is a fact about 2026-09-02, not an invariant. Re-run it if 5G is dispatched later than
this plan expects; **do not** treat a zero here as permission to skip the migration.

**The answer: normalise at load, refuse at write, under a schema version bump.** Concretely:

- `CURRENT_SCHEMA_VERSION` becomes **2** (`neon-configuration-repository.ts:12`).
- `MIGRATIONS` gains a real entry. `migrateFromV1` splits any `emptyColumns` entry wider than the
  ceiling into ceiling-sized pieces left to right — same arithmetic as the shrink split, same key
  derivation — **before** `assertDesignValidForCatalog` runs. This is the version-keyed hook
  `migrate-design.ts` was built for and has never used.
- `migrateFromV2` validates without normalising, so an oversized entry in a v2 document is a
  refusal (`EMPTY_COLUMN_WIDER_THAN_CAP`), at the load seam and at the API write seam both — DOM-001's
  rule that both seams refuse together.

Why normalise rather than refuse at load: the state is **executable**. A 900 mm empty column renders
correctly and merely refuses `'fit'` inserts; it is a legal document under a rule this wave
supersedes, not a document the domain cannot run. Refusing it would brick a share link to close a
bug that costs the customer nothing today. Clamping (dropping the overflow) silently deletes wall.
Grandfathering leaves the invariant unenforceable. Splitting keeps every millimetre, produces a map
that satisfies the new rule by construction, and is written back in the normalised shape on the next
save.

### Work items

1. **One constant, one home.** `MAX_EMPTY_COLUMN_WIDTH_MM = 800` moves to `module-grid.ts` — the
   dependency-free leaf 5B4b created after the `LEVEL_SNAP_M`-as-`NaN` cycle incident — and
   `merge-empty-columns.ts` reads it in place of `MERGE_CAP_MM`. Do not leave two 800s.
2. **The shrink splits at the ceiling.** `plan-width-funding.ts` computes the overflow;
   `apply-column-moves.ts` writes two frozen entries instead of one, each keyed per ADR 0046 rule 3
   from a single millimetre value (`frozenColumnKey`), and `refuseFractionalCentres` covers both.
3. **A tenth refusal code.** `EMPTY_COLUMN_WIDER_THAN_CAP` in `validate-design.ts`, at both seams.
4. **Schema version 2 and the v1 normalisation**, as above.
5. **No new copy.** The shrink still succeeds, so no sentence changes. The narrow overflow column
   shows ADR 0037's existing *"may be left as it is"* line, which 5D2c already ships.

### Acceptance criteria, each with the mutation that reddens it

Assume a criterion is vacuous until its mutant is named. **The seeded kitchen loads with zero empty
columns**, so every criterion below states its own setup taps; a criterion a fresh seeded load
satisfies is not a criterion.

| # | Criterion | Named mutant that must redden it | Status |
| --- | --- | --- | --- |
| **5G-1** | Wall B, two taps: clear `B|2.45` (`p7`, `p24`), then shrink `p6` 600 → 400. The map holds **exactly two** member-less columns, 800 and 100; both ≤ 800; the union's outer edges and total width equal the 900 mm free span before the split. | Remove the split branch so the neighbour absorbs all 900 — the count and the ≤ 800 assertions both fail. Second: set the ceiling to 900 — the count falls to one. | **PASS** |
| **5G-2** | From 5G-1's state, four `+50` presses return `p6` to 600 and the column map is **identical** to the one before the shrink: one member-less column, same key, same `x`/`z`/`w`/`d`/`top`/`min(regions)`. | Stop calling `mergeAdjacentEmptyColumns` in `resolveColumns`' resize branch — the map comes back as two columns and the equality fails. This is the anti-ratchet criterion. | **PASS** |
| **5G-3** | Property (`fast-check`, per `javascript-testing-expert`): over generated sequences of legal `remove`/`insertBody`/`setWidth` commands on the seeded design, after **every** command each member-less column has `w ≤ 800 + 1e-6`. The property must also assert its own reach: at least one generated sequence produced a pre-split free span **over** 800, counted and asserted, so a generator that never reaches the state fails loudly instead of passing. | Raise the split threshold to 1000 — a counterexample sequence appears. Second: delete the reach assertion and shrink the generator to two commands — the coverage assertion fails, proving the property was not passing vacuously. | **PASS** |
| **5G-4** | A v1 document holding a 900 mm `emptyColumns` entry **loads**, as two columns (800 + 100) whose union is the original span. The **same document declared v2** is refused by `assertDesignValidForCatalog` with `EMPTY_COLUMN_WIDER_THAN_CAP`, and `PUT /api/designs/{id}` refuses it with the same code. | Pass the v1 entry through unnormalised — the load throws `InvalidDesignError` instead of loading. Second: normalise in v2 as well — the two refusal assertions fail. This is the criterion that protects a stored share link. | **PASS — the write half was found vacuous by adversarial QA (the v2-refusal assertion was not exercised) and closed in-wave.** |
| **5G-5** | A design carrying a split pair round-trips: save, reload, and the column map and the published `voids` list are identical (keys, `x`/`z`/`w`/`d`/`top`, `min(regions)`, void ids). | Make `projectEmptyColumns` skip entries under 200 mm — the 100 mm overflow does not come back and the void list differs. | **PASS** |
| **5G-6** | Visual, 390×844, the 5G-1 route on screen: after the shrink there are **two** ghost boxes with a seam at the 800 mm edge; each returns its own id across a sweep of taps; the wide one accepts an 800 mm `base-cabinet`; the narrow one offers zero insertable rows and shows the *may be left as it is* sentence, not a *what to clear* one. Survives reload. Report the ids and the `openWMm` values, not the plan's wording. | Not a code mutant — the observation gate. It fails if the report cannot name the two ids and the two widths it measured. | **PASS.** Measured: two ghost boxes with a seam at 800 mm, ids and `openWMm` held across the tap sweep, 800 mm `base-cabinet` inserts into the wide one, the narrow one shows the *may be left as it is* sentence, both survive reload. The pair rejoins into one undivided 800 mm box with no seam once `p6` is grown back to 500 mm. |

**Stated up front, so it is not filed as a regression:** a >800 mm *span* remains legal and expected
(ADR 0037). What 5G forbids is a >800 mm **column**. QA meeting a 1000 mm gap rendered as 800 + 200
is meeting the rule working.

### Risk

**High**, the highest in either wave. It bumps a wire version, adds a refusal to both seams and
changes what a shipped, owner-facing control does at the end of its range. The specific failure to
watch for is a normalisation that produces a key colliding with an existing entry
(`EMPTY_COLUMN_KEY_COLLIDES_WITH_EMPTY_COLUMN`) — the seam writing a document its own validator
refuses, which is `refuseUnreproducibleKey`'s recorded failure mode in the other direction.

### Tier

**Full** — domain algebra, persistence, a schema version, both validation seams. **Security review
is triggered**: `validateDesignForCatalog` and `migrateDesign` are the DOM-001 / AV-3 surfaces, and a
migration that rewrites a caller-supplied array is a new attack shape (an oversized entry that splits
into many entries must not be able to exceed `MAX_EMPTY_COLUMNS` — assert it). Visual verification
required.

---

## Wave 5H — the frozen map is recorded whole

### Goal

Close **backlog 22**. ADR 0044 persists **member-less** columns only, so a column that still holds a
member but whose frozen extent its placements no longer imply diverges on reload. Two user-visible
routes:

- **Partial delete.** Delete `p7` while `p24` stands: in session, two openings, 700×860 and 700×350,
  span 1850. Reload and both are gone.
- **Clear then refill — the one that matters.** Clear `A|2.60`, insert an exact-fit 600 mm
  dishwasher, reload. The column silently shrinks from 2600 to 860 and two usable openings vanish.
  Three taps, a natural thing to do, and 1740 mm of a full-height column.

Both are the same mechanism: `projectEmptyColumns` skips any key a placement is filed under, so the
stored entry recording the 2600 mm extent is dropped, and the restored `top` comes from the members.

### The decision: widen by partition, not by re-scoping

ADR 0044 rejected *"store the whole frozen column map"* on the grounds that occupied columns are
*"already fully derivable from the placements"*. **That premise is false**, and backlog 22 is the
proof — an extent a delete or an insert froze is exactly what the placements no longer imply. A
recorded alternative is being overturned, so this needs a dated supersession rather than a quiet
widening (see the sweep).

**The wire gains a second array rather than the first one changing meaning.** `emptyColumns` keeps
its exact definition, and a new `columnExtents` carries the frozen extents of columns that **do**
hold a member. That single choice is what answers most of the questions this change raises:

- **The nine refusal codes 5B2a added are untouched**, in meaning and in code. They govern
  `emptyColumns`, whose contents are unchanged. Two new codes govern the new array.
- **`projectEmptyColumns`' "skip any occupied key" rule is untouched.** `projectColumnExtents` is its
  exact complement over the same predicate.
- **The disjointness proof is reused, not replaced** — see below.

### What replaces the disjointness proof

The load-bearing property today is that `deriveColumns`' two halves are provably disjoint: the
placement-derived map and the stored `emptyColumns`, disjoint because the projection skips occupied
keys, so `addStoredEmptyColumns`' `columns.set` can never overwrite and `refuseUnreproducibleKey`'s
key round-trip is sound. Half of that survives verbatim and half is replaced.

**Survives.** `emptyColumns` and `columnExtents` are partitioned by the *same* predicate
(`occupiedKeys.has(key)`), so they are disjoint from each other by construction, exactly as before,
and `refuseUnreproducibleKey` applies unchanged to both arrays. `projectColumnExtents` must be
written as the complement of `projectEmptyColumns` in one loop over the map, not as a second
independent scan, so the partition is a property of the code rather than of two agreeing authors.

**Replaced.** `columnExtents` entries deliberately land on keys the placements produced, so the
*union with the placement-derived map* is no longer disjoint, and
`addStoredEmptyColumns`' *"no key can collide here"* comment stops covering the second array. Its
replacement is **precedence plus containment**, and both halves have to be enforced:

1. **Precedence.** A stored `columnExtents` entry wins on the extent fields — `w`, `d`, `top`,
   `regions` — over the values the grouping derived. Membership, `wall` and `ry` still come from the
   placements, and `withCurrentFullHeightMembers` still runs afterwards, so ADR 0011's
   extent-frozen / live-predicates-re-answered boundary is honoured exactly as ADR 0044 honoured it.
2. **Containment, validated at both seams.** For each entry: at least one placement is filed under
   its key (`COLUMN_EXTENT_HAS_NO_MEMBER`), and **every** such placement lies inside the extent —
   `y0Mm ≤ min(member y0)`, `topMm ≥ max(member y0 + h)`, the along-wall footprint contains each
   member's, `depthMm ≥ max(occupiedDepthM)` (`COLUMN_EXTENT_EXCLUDES_MEMBER`). Together these make
   overwriting **monotone**: the stored extent can only ever be at least as large as the derived one,
   so a restore can widen a column and can never lose a member or publish an opening over a body.

That is a strictly stronger statement than the disjointness it replaces, because disjointness only
said the two halves never met. It also obeys ADR 0011 Gap D rather than overturning it: Gap D
forbids **re-deriving** an occupied column's extent from its current records, which is what the code
does today and what 5H stops doing.

### What it does to the wire and its caps

- **`MAX_COLUMN_EXTENTS = MAX_PLACEMENTS`** (168 today). Derived, not chosen: an entry is only legal
  on a key a placement is filed under, and there are at most `MAX_PLACEMENTS` placements. It does
  **not** share `MAX_EMPTY_COLUMNS`' budget, because that constant bounds *keys a wall can present*
  (1262) and this one is bounded by placements — the tighter of the two binds each array separately.
- **`MAX_EMPTY_COLUMNS` stays 1262** and its derivation comment stands unedited.
- **`MAX_DESIGN_BYTES` rises** by `MAX_COLUMN_EXTENTS × MAX_EMPTY_COLUMN_BYTES` = 168 × 128 =
  21 504 B, from 248 576 to **270 080**. The entry is the same six fields as an `EmptyColumn`, so the
  128 B allowance is reused rather than re-derived. Raising it is not optional: leaving it means the
  largest document the schema accepts is refused at the write seam, which is the exact failure
  ADR 0044's own byte-cap comment was written to prevent.
- **No version bump.** The array is optional and additive: a document without it loads exactly as it
  does today, occupied extents derived from the placements. That is a real backward-compatibility
  argument rather than a licence borrowed from ADR 0038 — old documents keep the old reload
  behaviour, new saves carry the map. Say so in the ADR, because ADR 0038 is being corrected in 5G
  and must not be cited here.
- **Criterion 4's exclusion is deleted.** `apps/web/tests/store/empty-columns-reload.test.ts:428-449`
  pins the divergence as red-when-fixed, and criterion 4's sweep excludes exactly the diverging set.
  After 5H nothing diverges, so the sweep becomes total over `columns.keys()` and the pinned test
  flips. Removing the exclusion **is** criterion 5H-3.

### Work items

1. `ColumnExtentSchema` and the optional `columnExtents` array on `DesignSchema`, bounded by
   `MAX_COLUMN_EXTENTS`; `MAX_DESIGN_BYTES` updated with its derivation.
2. `projectColumnExtents` in `void-engine.ts`, written as the complement of `projectEmptyColumns` in
   one pass; both called from `apply-command-result.ts`.
3. `deriveColumns` restores them over the grouped extents — after the grouping, **before**
   `mergeAdjacentEmptyColumns` and before `withCurrentFullHeightMembers`, for the ordering reason
   already recorded at that call site.
4. Two refusal codes and the containment check in `validate-design.ts`, at both seams.
5. Delete criterion 4's exclusion and make the reload sweep total.

### Acceptance criteria, each with the mutation that reddens it

| # | Criterion | Named mutant that must redden it |
| --- | --- | --- |
| **5H-1** | Backlog 22's three-tap route: clear `A|2.60`, insert an exact-fit 600 mm `base-dishwasher`, save, reload. The column's `top` is 2600 after the reload, and the wall (600×700) and top (600×400) openings above the body are present and selectable with the same void ids as before the save. | Drop `columnExtents` from the projection — `top` comes back 860 and both openings vanish. Second: restore the extents **before** the grouping instead of after — the placements overwrite them and the same assertions fail. |
| **5H-2** | Backlog 22's partial delete: delete `p7` with `p24` standing, save, reload. The two openings (700×860 and 700×350, span 1850) survive with identical geometry. | Same as 5H-1's first mutant. |
| **5H-3** | The reload sweep is **total**: it iterates `columns.keys()` with no exclusion list, and asserts extent equality for every key. Its fixture is the post-5H-1 design, not a fresh seeded load. | Skip the restore for occupied keys — red **only** because the fixture contains a cleared-then-refilled column. **Named vacuity risk:** on a fresh seeded load every column's extent already equals its members', so this criterion passes under every mutant unless its fixture is stated. State it in the dispatch. |
| **5H-4** | Containment is enforced, not assumed. A hand-built document whose `columnExtents` entry has `topMm` below a member's top is refused at **both** seams with `COLUMN_EXTENT_EXCLUDES_MEMBER`; one whose key holds no placement is refused with `COLUMN_EXTENT_HAS_NO_MEMBER`. | Delete either check — the load path throws out of `recomputeVoids` (or publishes an opening over a body) instead of returning a handled `InvalidDesignError`. This is the DOM-001 criterion. |
| **5H-5** | Property: over generated designs, every key of the frozen map appears in **exactly one** of `projectEmptyColumns` and `projectColumnExtents`, and their union is the map's key set. | Let `projectColumnExtents` include member-less keys too — "exactly one" fails on the first generated design with an empty column. This is the disjointness proof as a test. |
| **5H-6** | A document at `MAX_PLACEMENTS` placements, `MAX_EMPTY_COLUMNS` empty columns and `MAX_COLUMN_EXTENTS` extents serialises under `MAX_DESIGN_BYTES` and is accepted by the write seam. | Leave `MAX_DESIGN_BYTES` at 248 576 — the largest legal document is refused, which is the cap-left-behind failure ADR 0044 names. |
| **5H-7** | Visual, 390×844: 5H-1 on screen, before and after a real reload, reporting the void ids and the `openWMm`/`openHMm` of both openings each time. | The observation gate. It fails if the report cannot name what it measured on both sides of the reload. |

### Risk

**Medium-high.** One new optional field, but it reaches a derivation from a caller-supplied
document, which is the DOM-001 shape ADR 0044's own risk note rated medium-high for the same reason.
The specific failure to watch for is a stored extent **narrower** than its members slipping past
validation and publishing an opening over a body — 5H-4 is the criterion, and it is the one worth
attacking hardest.

### Tier

**Full** — persistence, wire format, both validation seams. **Security review is triggered**: a new
caller-supplied array reaching `deriveColumns`, plus a raised `MAX_DESIGN_BYTES` (SEC-002). Visual
verification required.

---

## The decision sweep (standing owner instruction, 2026-09-01)

Checked before either wave is dispatched. Two live records are genuinely overturned; one that reads
like a contradiction is not one.

### 5G — the ceiling on any empty column

| Record | What it says | Settled how |
| --- | --- | --- |
| **ADR 0037**, *"a span wider than 800 mm may simply stay empty"* | Owner, 2026-08-28: an opening no cabinet fits is *"ok to have empty space left"*; refusing the move that made it was put and rejected. | **Survives, and is the reason 5G splits rather than refuses.** The *space* is untouched — same edges, same width, still leavable. Only its decomposition into columns changes. Amend in place with a dated pointer so no reader takes the ceiling as reversing it. |
| **ADR 0043**, *a gap of any width is legal* | A gap has no floor; the owner decided a 50 mm gap is a legal state. | **Untouched.** The ceiling bounds a *column*, not a gap; a 1000 mm gap stays legal, carried as 800 + 200. Dated pointer, no supersession. |
| **ADR 0035 decision 7** | A shrink creates the empty space it needs, with no stated ceiling. | **Amended in place**, not superseded: shrinking still creates space, and the release is now bounded by the ceiling with the overflow split off. |
| **ADR 0046** | `MERGE_CAP_MM = 800` bounds a merge; *"one residual this record does not close"* and *"the >800 mm empty column from a shrink is untouched"*. | **Both close.** Amend with a dated pointer: the two caps become one constant, and its own *"if the cap ever moves to 600, only the constant moves"* now covers the shrink too. Its stale line reference to `void-engine.ts:744-751` should be corrected while there. |
| **ADR 0038**, *nothing has ever been stored* | No migration is ever owed until first release. | **Corrected — the premise is false.** Rows exist in the application database from M5B's own reload verifications (evidence above). Decisions 1–4 stand for *customer* data; what is withdrawn is the migration licence, in the same shape as this record's 2026-08-31 correction of a stale reachability premise. |
| **ADR 0044**, *"this record's cheapness expires with ADR 0038"* | The `emptyColumns` field was free because nothing was stored. | **The consequence fires.** Amend with a pointer to the ADR 0038 correction and to 5G's v1 normalisation. |
| **ADR 0031** | A growth consumes the adjacent empty column. | No conflict; the funding scan's growth arm is untouched. |
| **[ADR 0052](../decisions/0052-800-mm-is-the-ceiling-on-any-empty-column.md)** | Written 2026-09-02, wave complete. | *800 mm is the ceiling on any empty column, and a shrink that frees more splits it.* Records Q5's closure, the three options and why refusal contradicts ADR 0037, and the migration answer — including the logic review's correction of the refusal symptom and the odd-width 267×3 counterexample. |

### 5H — the frozen map recorded whole

| Record | What it says | Settled how |
| --- | --- | --- |
| **ADR 0044**, *Alternatives considered*, *"store the whole frozen column map"* | Rejected: occupied columns are *"already fully derivable from the placements"*. | **Superseded — the premise is false**, and backlog 22 is the proof. This is the sweep's most important finding: a recorded alternative is being overturned, so it needs an explicit dated supersession, not a widening in silence. |
| **ADR 0011 Gap D** | A column's extent is frozen; re-deriving an occupied column's extent from its current records is exactly what Gap D forbids. | **Obeyed, not overturned.** 5H *stops* re-deriving it. Gap D's own 2026-08-26 correction (extent frozen, live predicates re-answered) is honoured: `withCurrentFullHeightMembers` still runs after the restore. Dated pointer. |
| **ADR 0011**, `hasFullHeightUnder` correction, 2026-08-26 | One design must not have two answers by route. | **The precedent the backlog names**, and the shape of 5H's own record. |
| **ADR 0002** | Canonical-serialisation round-trip invariant. | No conflict; the invariant gains a case (5H-1). |
| **ADR 0046** | `projectEmptyColumns` takes the frozen map as an argument, so whichever map is canonical flows through without reopening the seam. | **Relied on.** `projectColumnExtents` takes the same argument and the post-merge decision of 2026-09-02 covers both arrays. |
| **DEVELOPMENT-SPEC §3.2 and §12** | Already carry ADR 0044's dated pointers. | Each gains a second pointer: the map is derived from the placements, the stored empty columns **and** the stored occupied extents. |
| **New: ADR 0053** | — | *The design document records the whole frozen map, in two disjoint arrays.* |

**Nothing in either wave contradicts something already shipped except the two rows marked
superseded.** The near-miss to name explicitly is ADR 0037: *"800 is the ceiling on any empty
column"* and *"a span wider than 800 may simply stay empty"* sound opposed and are not, and a reader
who conflates a span with a column will read 5G as reversing an owner decision.

## Verification method

`pnpm ci:local` (all nine gates) for both waves, plus — because backlog 24 is open and this is the
gap that let a red e2e suite sit unnoticed for six days — `pnpm --filter @lemnaria/web test:e2e`
**run and quoted** at each wave's close, not at the milestone's. §10's signature flow is directly in
5H's blast radius: it deletes the fridge, deletes the unit above it, and asserts the two openings
merge into one 700 × 2600 column, which is a frozen-extent claim across exactly the seam 5H changes.

Visual verification at 390×844 for both waves, reporting measured ids and dimensions rather than the
plan's wording.
