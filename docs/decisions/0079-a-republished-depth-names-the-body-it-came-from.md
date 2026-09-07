# ADR 0079 — A republished depth names the body it came from, and §3.2's MAX is not decided below the millimetre

Status: Accepted (**Amendment 2026-09-05** — the anti-invariant's boundary and the tie-break's
undeclared arm; **Amendment 2026-09-08** — decision 10 point 2 **confirmed unchanged**, with the
production defect currently violating it named, per
[ADR 0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md).
Nothing in this record is struck.)
Date: 2026-09-05
Type: Decision + Finding
Milestone: M6 — wave 6K-c's own residue, found by adversarial QA before the wave was committed

## Context

[ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) gave a frozen extent one new
field, `depthFromBuildId`, and a depth change one new rule: re-ask that entry in the catalogue built
at the new setting. Wave 6K-c implements it. Adversarial QA swept the uncommitted diff and produced
two failing shapes, both on disk and both re-run for this record on 2026-09-05:

- `apps/web/tests/store/qa-6k-c-frozen-source.adversarial.test.ts` — 21 pass, **4 fail**.
- `packages/configurator-domain/tests/qa-6k-c-frozen-source.adversarial.test.ts` — 30 pass, **1 fail**.

**F1 is reached in ONE command, and the four-step sequence is how it is _observed_.** Measured by QA
on 2026-09-05, after this record's first draft, and it changes the diagnosis rather than the ruling: a
single `setCabinetDepth(700)` on the untouched shipped fixture mints a disagreeing record. `B|1.80`'s
extent froze at the pinned top's 600; the surviving `tall-pantry` measures 699 at the deeper setting;
`republishedDepthM` takes the **fully explained** arm and publishes `measured.d = 699`; `atDepthM`
carries `depthFromBuildId` across untouched. **699 is the right depth while the pantry stands** —
what is wrong is the record, and the record is what answers once the pantry is gone. `projectFrozenMap`
saves the disagreeing pair, so it reloads that way.

Exhaustively over every three-step sequence from the fixture across sixteen step kinds there are
**exactly two such pairs, both on `B|1.80`, and the drift runs both ways**: one records a source
declaring shallower than `d` (600 against 699), the other deeper (600 against 599).

**The loss, on the same column** — a tall pantry under one of ADR 0058's two pinned deep tops, in four
ordinary commands:

```
start                          d 600.0   source wall-2door-600-deep-top
delete p23 (the pinned top)    d 600.0   source wall-2door-600-deep-top
setCabinetDepth(700)           d 699.0   source wall-2door-600-deep-top   <- the pair parts here
delete the pantry              d 699.0   source wall-2door-600-deep-top
setCabinetDepth(600) or (700)  d 600.0   -- 99 mm gone
```

The state after step 4 is a legal non-refused document — one command away from the loss on a stored
share link. The measured failures are `expected 0.6000000000000001 to be greater than or equal to
0.699` and, on the saved document, `expected 600 to be greater than or equal to 699`; QA's four-step
sweep (4 096 sequences) finds four distinct trails. Step 2 is where the record parts; steps 3 and 4
only believe it.

**F2, on the catalogue** — `deepestMember` reduces with a strict `>` on metre floats, so an exact tie
is decided by document order. QA's test fails with `expected 'base-corner-return-320' to be
'hood-600'`: one design, two orders, two recorded sources.

Measured over the whole catalogue at both declared settings for this record:

| Shape                      | Count     | Do the two rows part at the other setting?             |
| -------------------------- | --------- | ------------------------------------------------------ |
| Exact float ties at 600    | 121 pairs | **None.** The recorded id differs; the depth does not. |
| Pairs one ULP apart at 600 | 26 pairs  | **4 do**, and they are the harmful ones.               |

The four are `base-corner-return-320` and `hood-600` and `hood` (0.6 exactly, and 0.7 at the deeper
setting) against `wall-2door-600-deep-top` and `wall-2door-700-over-fridge` (0.6000000000000001 at
**both** settings, ADR 0058's pins). The gap is `1.11e-16` m. It is not a tie under `>`, so the pinned
row wins by an ULP and the recorded source is decided by floating-point accumulation in
`occupiedDepthFromSeat`'s `recorded-shell` arm (`0.561 + 0.039`), where the `wall-plane` arm returns
an exact `0.6`. The consequence at 700 is 100 mm.

**The document cannot express the difference that decides it.** `toEmptyColumn` persists
`depthMm: exactMillimetresOf("depthMm", column.d, key)` — the whole millimetre, tolerance 1e-3 mm. A
`0.6000000000000001` column is saved as `600`. The MAX is being decided six orders of magnitude below
the finest number the product can record.

## Classification, on the records' own text

**F1 is a contract gap in ADR 0073, surfacing as an implementation defect against wave 6K-c's own
stated acceptance criterion.** Both halves are true and the pair is what sizes the fix.

- **The criterion is stated and is violated.** `docs/milestones/M6-price-and-global-settings.md`,
  wave 6K-c: _"no sequence of commands makes a frozen extent shallower than it was frozen at"_. QA's
  sequence does. The diff is not shippable as it stands.
- **The rule that would meet it is not stated anywhere.** ADR 0073 decision 1 defines the field as the
  `buildId` that won §3.2's MAX _"when the extent was frozen"_, and decisions 2 and 3 rule what a
  depth change **re-answers**. No decision rules what happens to the _source_ when a depth change
  publishes a `d` from the other operand. `atCurrentCabinetDepth` takes 6K-a's MAX over the frozen
  extent and what the members measure, publishes the winner's depth through `atDepthM`, and carries
  the old `depthFromBuildId` across untouched. After step 2 above the recorded source no longer
  explains the recorded depth: 699 came from the pantry and `wall-2door-600-deep-top` declares 600 at
  every setting. Step 3 then freezes an already-parted pair; step 4 believes the source.

The defect is therefore **not** the missing floor on the recorded arm. It is that a `Column.d` and a
`Column.depthFromBuildId` can be written by two different authors.

**F2 is a contract gap of the same wave**, not a defect against a shipped rule. At HEAD the MAX is
`Math.max(...members.map(occupiedDepthM))` — a number with no winner, no tie to break and no order to
depend on. `deepestMember` is new in this diff, and naming the winner is what made an ordering
question exist. ADR 0073 decision 1 introduced the need and did not rule the predicate.

**Neither reaches a shipped wave.** `depthFromBuildId` appears in no committed file: `git show
HEAD:packages/configurator-domain/src/void-engine.ts` and `HEAD:apps/web/src/store/apply-command-result.ts`
both contain zero occurrences. Wave 6K-a's surplus arm publishes a `d` no current member explains —
that is its ruled behaviour — but there was no source beside it to disagree with. **Nothing committed
is amended by this record.**

## Decision

### 1. A depth and the source that explains it are published together, or the source is absent

**The pairing invariant, stated because ADR 0073 assumed it without writing it down:** wherever a
`Column.d` is written, `depthFromBuildId` names the body whose declaration produced _that_ number at
the setting the design then declares — or it is absent, and absence means ADR 0073 decision 3's
fallback owns the depth and no body is claimed for it.

This is decision 1's own sentence — _"the MAX is taken by naming its winner ... so the depth and the
body it came from cannot be two separate authors"_ — applied to the **second** place a MAX is taken.
`deriveColumns` already obeys it by construction. So do `mergeAdjacentEmptyColumns` (the shallowest
member's whole column is the template, depth and source together), `splitOversizedEmptyColumns` (both
halves), `clipEmptyColumnsAtWallEnd` (width only) and the stored-extent restore. `atCurrentCabinetDepth`
is the only writer that parts them.

**Absence is a first-class answer, not a hole.** A legacy extent re-answered through decision 3 takes
a depth from `columnBuildDepthM`, which is a declared size and not any body's declaration; recording a
source for it would be the invention ADR 0073 refused. It stays absent and the next depth change
re-applies the fallback.

### 2. `atCurrentCabinetDepth` re-records the source to the winner of its own MAX

Option (a) of the three the coordinator raised, and the cost the question attached to it does not
arise. `republishedDepthM` chooses between two operands and **both are sourced**:

- the _measured_ operand is `deriveColumns(records, {}, room).get(key)`, which carries
  `depthFromBuildId` for every column it derives (decision 1 of ADR 0073, already implemented);
- the _frozen_ operand carries its own recorded source, or none.

So there is no "depth no single member explains" to invent a rule for. The rule in one sentence:
**a source survives exactly when the depth it explains survives.** A depth taken from anywhere else
carries whatever source explains its new origin, or none.

That makes `frozenDepthAtThisSettingM` return a pair as well, from three producers and no fourth: the
recorded entry re-answered (source = that entry), `columnBuildDepthM` (no source — a declared size is
no body's declaration), and the frozen `column.d` where it wins the fallback's own MAX (the column's
own source, carried unchanged, **including one the catalogue no longer holds**). The last case is why
the rule is stated as survival rather than as "keep what is there": a legacy wall column deepened 330
→ 400 by the fallback must **not** keep an id declaring 330, or an F1-shaped lie is written for the
day that id returns to the catalogue.

Concretely:

- **Fully explained by its members** — the published depth is `measured.d`, so the published source is
  the measured column's. This matters even when the frozen source is present and looks right: at a new
  setting a _different_ member can win the MAX, and the source must move with the depth.
- **Carrying a surplus** — `Math.max(frozen, measured.d)`. The winning operand supplies both numbers.
  Where they are equal within `FROZEN_SURPLUS_EPSILON_M`, the measured operand wins and supplies the
  source, because a member standing there is the better claim on a depth the members explain.
- **Member-less** — the frozen answer, with its own source carried across unchanged, or absent when
  the decision 3 fallback produced it.

**This is not the re-derivation `Column.depthFromBuildId`'s doc comment forbids**, and the difference
is exact: the comment refuses a source re-derived from the current members _while the depth is not_.
Here the source moves **only when the depth it explains was itself taken from those members**. The pair
travels or neither does. ADR 0011's 2026-08-26 correction is untouched — nothing here is re-answered
per derivation; a frozen depth keeps a frozen source.

### 3. `atDepthM` cannot be called without saying which body the depth came from

The cheap half of option (c), scoped to the one seam that broke. `atDepthM(column, depthM)` takes a
published pair — the depth and the source, the source optional — instead of a bare number, so a store
that writes a depth without stating its origin does not compile. Option (c) in full (a `FrozenDepth`
value object on `Column` and `EmptyColumn`) is refused below: it is a rewrite of every reader of
`column.d` in three packages to prevent a mistake one signature already prevents.

### 4. The recorded arm gets no floor, in either of the two shapes proposed

**`Math.max(query.column.d, occupiedDepthOfEntryM(recorded))` is refuted by measurement, not only by
argument.** Applied in a detached worktree it greens F1's three floor assertions and turns two
currently-green tests red — full web suite 3 failed, 1 428 passed, 4 skipped:

```
x returns to the deleted body's shallower declaration on a decrease   expected 0.72 to be close to 0.62
x returns a recorded surplus to where it started across a round trip  expected 0.72 to be close to 0.62
```

`A|2.00` cleared of `base-dishwasher-600`, taken 600 -> 700 -> 600, is pinned at **720 mm at the
600 mm setting**. The mechanism: `frozenDepthAtThisSettingM`'s result feeds `Math.max(frozen, measured.d)`, so a floor at `column.d` is
a ratchet — the published depth can never fall below the depth already published, at any later
setting. The decrease is not collateral damage to be traded away: it is what "an exact re-answer of
the same body" _means_, and it is the only thing decision 2 buys over 6K-a and over decision 3's
fallback.

**And it repairs nothing.** The floor makes the wrong number survive; it does not make the record
true. The disagreeing pair is minted one command in, by the _fully explained_ arm, which no floor on
the recorded arm is even reached by.

**`Math.max(occupiedDepthOfEntryM(recorded), columnBuildDepthM(newSetting))` is refused too**, and it
is worth naming because it looks safer — both operands follow the setting, so the decrease still
decreases. It unpins ADR 0058 through the back door: a column cleared of a pinned deep top over a tall
run has `hasFullHeightUnder`, so `columnBuildDepthM(700)` is the cabinet-depth line, 700, and the
extent that decision 2 requires to stay at 600 moves to 700. Decision 3's fallback is for extents with
**no** recorded source, and it stays there.

The floor F1 needs is not on the re-answer at all. It is decision 1's pairing, which stops a depth
whose source has parted from it reaching the re-answer in the first place.

### 5. §3.2's MAX is not decided below the millimetre the document records

`deepestMember` compares two declared depths, each a sum of declared millimetres divided by 1000. A
difference smaller than the millimetre `toEmptyColumn` persists is arithmetic noise, not depth, and
the MAX must not be decided inside that band. The comparison carries a float epsilon of the band
`FROZEN_SURPLUS_EPSILON_M` and `MODULE_LINE_EPSILON_M` already occupy — nine orders of magnitude below
`FIT_TOLERANCE_M`, six above the ULPs measured above — with its derivation written beside it, as
[ADR 0015](0015-min-span-is-exclusive.md) requires of any epsilon that is not manufacturing slack.

**Not fixed in `occupiedDepthFromSeat`.** Summing in millimetres and converting once would make the
`recorded-shell` arm exact and kill all 26 pairs at the source, but it moves `Column.d` by ULPs
product-wide for a cosmetic gain, and it does not survive the case it would exist for: a seat that
arrives from a probe measurement is not on an exact millimetre in the first place. The comparison is
what must be robust, not the value.

**The epsilon's transitivity is a claim, not an assumption.** A reduce over an epsilon comparison is
not a total order in general. It is one here because every real difference between two declared
occupied depths is at least 1 mm — six orders of magnitude above the epsilon — and that is asserted by
sweeping every catalogue pair at every declared setting for a gap that is either zero or greater than
1e-6 m, not left to the reader.

### 6. The tie is broken by what the tied entries declare, and the last key is a byte order

Rounding the noise away makes ties **more** common and, for the first time, consequential: the four
pairs in _Context_ become ties that part at the other setting. The order is:

1. **Deeper wins**, at the millimetre (decision 5).
2. **A member whose depth follows the setting beats one whose does not** — `depthFollowsSetting` over
   the entry's own declared `CabinetDepthRule`, which the record must carry the way it already carries
   `occupiedDepth`. This is not a preference invented here: when two bodies filled the same space and
   one of them tracks the kitchen, recording the pinned one is precisely the _"it stays put"_ outcome
   ADR 0073 decision 5 already refused for this whole class, on ADR 0055's _"every body adapts, with
   no confirmation step and nothing left behind"_.
3. **The byte order of `buildId`** — [ADR 0063](0063-a-group-is-listed-row-major-height-before-position.md)'s
   own last key, a byte comparison and never `localeCompare`, for the reason that record gives: these
   are opaque persisted strings. It is a formality that makes the order total, and its
   **unobservability is asserted rather than hoped for**: two members that reach it declare the same
   depth at every setting `declaredCabinetDepthsMm()` offers, so which one is recorded cannot change
   any answer. Two rows that reach key 3 and then part turn that test red, and this record is amended
   rather than the test relaxed.

Key 2 is what the four measured pairs need, and key 3 is what `base-corner-return-320` against
`hood-600` needs — both follow the setting, both answer 0.6 and 0.7, and QA's failing test asks only
that one design does not save two ways.

### 7. The merge's leftmost-wins tie stands, and is now load-bearing

`planBlock`'s shallowest-member reduce takes the first of two equal depths, and its members are sorted
by along-wall coordinate before the scan — ADR 0046 rule 1's own sort, taken _"so that one design is
one picture whatever order the customer's commands ran in"_. The tie is therefore already
deterministic and derived from geometry rather than from document order, and it needs no change. What
changes is that it now decides a `depthFromBuildId` as well as a depth, so ADR 0073 decision 8's
"shallowest member's source" is read as **the leftmost of the shallowest**, stated here so a later
reader does not discover the order-dependence and treat it as a defect.

### 8. Nothing else moves

No schema change, no `CURRENT_SCHEMA_VERSION` bump, no new refusal at either seam, no change to
`MAX_DESIGN_BYTES`. Decision 6 changes which `buildId` a _derivation_ records; it rewrites no stored
value, and ADR 0073 decision 6's line — _absent-field-absence owes no bump; a rewrite of stored values
does_ — is unmoved. A document written before wave 6K-c still loads to byte-identical geometry.

### 9. No rule here changes a published depth, only the record beside it

**QA's framing is adopted as a constraint on the fix.** The 699 is correct; it is the record that is
false, and a rule that changed what gets published would be repairing the wrong half — it would make
`B|1.80` draw and save a 600 mm space with a 699 mm pantry standing in it.

The falsifiable form, and it is cheap: for the shipped fixture at both declared settings, every
`Column.d` the store publishes is **identical before and after this wave**. The one admitted exception
is decision 6, which can change which of two tied members wins and therefore `d` by at most one ULP —
bounded, and below the millimetre the document records, so the _saved_ `depthMm` is identical without
exception. Anything else is this wave publishing a different kitchen, which it has no mandate to do.

### 10. What makes the invariant checkable, since two defects have now passed a green suite

Neither 6K-c defect was caught by anything: `cabinet-depth-frozen-source.test.ts`, `cabinet-depth.test.ts`
and the `it.fails` guard this wave just flipped all pass clean under the refuted floor, so the
regression would have shipped green. Being true is not enough; three things make it checkable, and
they are ordered by how little they depend on someone remembering.

1. **Unrepresentable at the seam that broke it.** `republishedDepthM` returns the **winning operand**,
   not a number, and both operands are pairs (decisions 2 and 3). A depth from one operand and a
   source from the other cannot be assembled, so the specific mistake is a compile error rather than a
   test. This is the only one of the three that survives a future author who does not read this record.
2. **A state predicate, asserted after every command rather than as the outcome of a transition.**
   Both 6K defects are invisible to a transition assertion: after a depth change the published depth
   was _right_, and only the record was wrong. QA's `unexplainedColumns` is the predicate — for every
   published column, either `depthFromBuildId` is absent or the catalogue does not hold it, or that
   entry's `occupiedDepthOfEntryM` at the design's own declared setting equals `Column.d`. It belongs
   in a **shared helper the ordinary store suite calls**, not only in the adversarial file, so a test
   that drives the store gets the check without its author knowing this record exists.
3. **Non-vacuity, asserted rather than assumed.** The predicate holds trivially over a map with no
   sources, or with sources the catalogue does not hold, and both are reachable states. So the suite
   asserts that it holds on the shipped kitchen **as it loads** (QA's own first assertion), that it
   inspects a non-zero number of columns carrying known sources, and that the pre-fix code violates it
   — a check that cannot fail is the failure mode this project has now shipped twice.

**Not a refusal at the persistence seam.** `toEmptyColumn` is where a disagreeing pair enters the
document and is the obvious place to fail closed, in the company of `refuseUnreproducibleKey` and
`exactMillimetresOf`. Refused: the check needs `occupiedDepthOfEntryM` at the design's declared depth,
and the frozen-map writer holds no catalogue and no setting. Threading both into the void engine to
re-derive a fact the store already holds is a larger seam than point 1 closes for free.

## Alternatives considered

- **Option (b): drop the source when it stops explaining the depth, and fall to decision 3.** The
  cheapest fix and it does satisfy the anti-invariant — the fallback has the floor. Refused because it
  loses information the product already holds: after F1's step 2 the pantry is standing there and
  explains 699 exactly, so there is a right answer to record and (b) throws it away. It also makes the
  field decay — every depth change strips the source from any column whose members grew — so ADR 0073's
  stated residual spreads with use instead of shrinking.
- **Option (c) in full: `Column.d` and its source become one inseparable value.** The strongest
  guarantee and the largest change: every reader of `column.d` in the domain, the store and the
  three-adapter. Decision 3 takes its guarantee at the one seam that has ever broken the pair, and the
  full form stays available if a second writer ever appears.
- **Give the recorded arm a floor.** Two shapes, both refuted in decision 4 — one by a passing test,
  one by ADR 0058.
- **Thread the catalogue at every declared setting into `deriveColumns` and rank ties on the vector of
  declarations.** The most principled tie-break: two bodies tie only if they declare the same depth at
  every setting, and then the choice is provably unobservable. Refused on cost and on direction:
  `deriveColumns` is called from both packages and from most of the suite, and giving a geometry
  derivation a dependency on settings the design is not at is a larger seam than the question needs.
  Decision 6 key 2 reaches the same answer for every pair measured, from a declaration the entry
  already makes.
- **Break the tie on `buildId` alone.** It happens to give the right answer for all four measured pairs
  — `hood-600` and `base-corner-return-320` both sort before `wall-2door-600-deep-top`. That is luck,
  and ADR 0028 decision 4's whole subject is two numbers that agreed until they did not. The alphabet
  survives only as key 3, under bodies that cannot disagree.

## Records swept before deciding, and how each is settled

| Record                                                                                                                                                                                                                           | What it says                                                                                                                                                                                                                               | Settled how                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) decisions 1, 2, 3, 8                                                                                                                                    | The entry records the `buildId` that won §3.2's MAX when the extent was frozen; a depth change re-asks it; an extent that cannot be re-answered is deepened to the declared build depth; the merge carries the shallowest member's source. | **Extended, nothing overturned.** Decision 1's principle is applied to the store's MAX (decision 2 here); decision 2's exact re-answer in both directions is what refutes the naive floor; decision 3's fallback stays where it is and is refused as a floor on the recorded arm; decision 8 is read as _leftmost of the shallowest_. |
| ADR 0073 decision 5                                                                                                                                                                                                              | _"It stays put"_ is refused: an empty space that keeps the old kitchen's depth is something left behind.                                                                                                                                   | **The derivation of decision 6 key 2.** Preferring the pinned member of a tie is that refused outcome, arrived at through a comparator.                                                                                                                                                                                               |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D                                                                                                                                                                                | A column's extent is frozen; re-deriving it from current records is what the freeze stops.                                                                                                                                                 | **Obeyed.** The source moves only where the depth beside it was taken from the members; a frozen depth keeps its frozen source. The along-wall and vertical axes are untouched.                                                                                                                                                       |
| ADR 0011's 2026-08-26 correction                                                                                                                                                                                                 | One design must not answer two ways depending on the route taken to it.                                                                                                                                                                    | **The reason F2 is a defect at all** — two document orders, two saved documents — and the constraint decision 6's order is built to satisfy.                                                                                                                                                                                          |
| [ADR 0015](0015-min-span-is-exclusive.md)                                                                                                                                                                                        | An epsilon exists so a comparison does not flip on floating-point accumulation, and must never be confused with a fit tolerance.                                                                                                           | **Decision 5 follows it**, including the naming discipline: the constant states its derivation and its distance from `FIT_TOLERANCE_M`.                                                                                                                                                                                               |
| [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 4                                                                                                                                                            | A declaration, never a computation; two numbers must not agree by luck.                                                                                                                                                                    | **Cited against `buildId`-alone as key 1** — that answer is luck — and satisfied by keys 1 and 2, which read declarations.                                                                                                                                                                                                            |
| [ADR 0046](0046-adjacent-empty-columns-merge-under-a-cap-and-an-insert-splits-its-column.md) rule 1                                                                                                                              | The capped merge is greedy over the run **sorted by along-wall coordinate**, so one design is one picture whatever order the commands ran in.                                                                                              | **Decision 7.** The merge's tie is already order-independent; only its new consequence is recorded.                                                                                                                                                                                                                                   |
| [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md), [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md)                                                                                              | A load that refuses is a dead link; the frozen map is one shape in two arrays; no bump for an additive optional field.                                                                                                                     | **Untouched.** Nothing here refuses a document, changes a shape or rewrites a stored value.                                                                                                                                                                                                                                           |
| [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md), [ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md) decision 2, [ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) | A depth fact is declared per entry; a build depth is a declared size, never a measurement of what happens to stand there.                                                                                                                  | **ADR 0058 is what refutes the `columnBuildDepthM` floor** in decision 4. Decision 6 key 2 reads `CabinetDepthRule`, a declaration, and infers nothing from a kind or a band.                                                                                                                                                         |
| [ADR 0063](0063-a-group-is-listed-row-major-height-before-position.md)                                                                                                                                                           | A comparator's last key is a byte comparison of an opaque persisted id, and totality rests on that key.                                                                                                                                    | **The precedent decision 6 key 3 follows**, including _"a byte comparison rather than `localeCompare`"_.                                                                                                                                                                                                                              |
| [ADR 0077](0077-a-joint-seated-body-declares-its-seat-and-is-never-measured-for-one.md) addendum                                                                                                                                 | A depth change planned against a `Column.d` derived from the seats it was replacing.                                                                                                                                                       | **Adjacent and already shipped (6K-h).** The clause it fixed is about which depth the _rebuild_ plans against; this record is about which depth the _frozen map_ republishes. No overlap and no contradiction.                                                                                                                        |
| Wave 6K-c's criterion, _"nothing shrinks, in any arm"_                                                                                                                                                                           | No sequence of commands makes a frozen extent shallower than it was frozen at.                                                                                                                                                             | **The criterion F1 violates**, kept verbatim; this record supplies the rule that meets it.                                                                                                                                                                                                                                            |

Nothing found in the sweep contradicts this decision.

## Finding, recorded and NOT ruled here: a depth change refused by two ordinary deletes

QA's sweep collected three refusals beside the four shrinks, and they are a different subject.
**Delete `p12` (`open-shelf-600`) and `p18` (`wall-2door-600-top`) from `A|2.00`, then any
`setCabinetDepth`, and the command is refused `HEIGHT_EXCEEDS_LEVEL`** — the rebuild plans the
dishwasher niche at 860 mm against the base level's 820. The shipped kitchen is then unable to change
its own depth at all, which ADR 0055 decision 1's _"every body adapts"_ does not admit.

QA reports it reproduces with `depthFromBuildId` stripped, with both frozen-map arrays empty, and on a
hand-built design that never went through the store. The refusals are real — they were re-run for this
record from the store — and that attribution has **not** been independently re-measured here, because
the reproduction needs the web package's fake probe. `HEIGHT_EXCEEDS_LEVEL` appears in no decision
record. **It is not wave 6K-c's, it is not this record's, and it needs its own adjudication**: it is a
defect in what `setCabinetDepth` plans, in the same family as ADR 0077's addendum and wave 6K-h, and
the 860/820 pair suggests the niche's own height rather than the depth axis.

## Consequences

- **Wave 6K-c stays one wave and absorbs both findings.** F1 is store-only and F2 is domain-only; no
  contract crosses the package boundary, no signature changes between them, and the wave already
  touches both packages. Splitting would put two halves of one QA report through two review passes on
  one uncommitted diff.
- **`PlacementRecord` gains `depthRule`, copied off the definition** exactly as `occupiedDepth` is —
  one line in `derivePlacementRecords`, and the only new domain surface either finding needs.
- **Two of QA's tests become the wave's criteria** rather than being re-authored: the four-step sweep
  and the order-independence test. Both are on disk and both must go green without their assertions
  being weakened.
- **The pairing invariant is asserted directly, not through its symptoms.** For every column the store
  publishes: either `depthFromBuildId` is absent, or `occupiedDepthOfEntryM` of that entry at the
  design's declared depth equals `Column.d`. It is a property of _every_ state, which is why it catches
  the 6K family of state-triggered defects that transition tests have twice missed.
- **A 600 → 700 → 600 round trip is more reversible than ADR 0073 left it**, for the one shape decision
  2 adds: an extent whose depth was re-measured from its members now carries the source that explains
  it, so the return leg re-answers the same body instead of a stale one. ADR 0073's statement about the
  fallback arm is unchanged — an extent re-answered through decision 3 still does not return.

## Amendment, 2026-09-05 — the anti-invariant's boundary, and the tie-break's undeclared arm

Ruled after the implementation landed, on three red store tests. **Nothing above is revised**; two
things above are given a boundary they were stated without.

### A. The decrease to 599 is correct, and the anti-invariant as written over-states the criterion

The measured trail on `B|1.80` after the fix ends `depth 600 -> 599.0, src tall-pantry`, and the two
`>= freedM` assertions fail there. They should. `tall-pantry` declares **599 at 600 and 699 at 700**,
measured; the 699 the delete froze and the 599 it becomes are the same body's declaration at the two
settings, which is ADR 0073 decision 2's re-answer, in the direction decision 4 above refused to trade
away.

Three grounds, none of them the convenience of a red test going green:

- **On a decrease, everything gets shallower.** The pantry beside it goes 699 -> 599, the base run 720
  -> 620, the wall map 400 -> 330. An opening held at 699 in a 600 mm kitchen would stand 99 mm proud
  of every body around it — ADR 0028's defect in the mirror image ADR 0073 decision 3 already cites,
  arriving through an invariant instead of through a constant.
- **Held-still is the outcome ADR 0073 decision 5 refused**, on ADR 0036 decision 5's record of the
  owner's own words and ADR 0055's *"every body adapts, with no confirmation step and nothing left
  behind"*. An empty space is a first-class state (ADR 0043) recorded as the customer's (ADR 0044); a
  cleared space that keeps the deeper kitchen's depth is something left behind, whichever direction
  the setting moved.
- **Nothing is lost, and that is measurable rather than argued.** The opening is a pure function of
  (recorded source, setting): 599 at 600, 699 at 700, in either order and any number of times. The
  customer who returns to 700 gets the 699 back. This is the *same* shape as decision 2's ruled
  `base-dishwasher-600` case (620/720) — the only difference is which setting the freeze happened at,
  and that is not a difference the re-answer can see or should.

**What would have been a defect, and is not this:** a depth that changes without the setting changing,
or one that does not come back when the setting does. Neither happens here.

### B. The assertion that replaces `>= freedM`, and why it is not the old test with its failing case carved out

**QA already wrote the correct predicate; it is in the same file, one `describe` away.** The four-step
sweep does not assert `>= freedM` — it asserts *no shrink except an allowed one*, and `isAllowedShrink`
names the two: the members standing there explain the new depth, or `reAnswersOneBody` — the recorded
source is unchanged and the depth is that source's declaration at **both** the setting it left and the
setting it took. The two `B|1.80` example tests assert a blunter thing than the sweep beside them, and
the sweep is the one that matches every record. So the replacement is not a new assertion invented to
fit an implementation: it is the file's own, applied to its own examples.

**The proof that it is not a carve-out is required, not asserted.** The replacement must go **red
against the pre-fix code**, and that must be demonstrated by running it there, not reasoned about. It
does, and the reason is exact: pre-fix, `B|1.80` went 699 -> 600 carrying `wall-2door-600-deep-top`,
which declares 600 at every setting — so `was.isItsSourcesDeclaration` is **false** at 699 (the source
never declared 699), `reAnswersOneBody` fails, and the shrink is a violation. Post-fix the source is
`tall-pantry`, both ends are its declaration, and it is allowed. A predicate that distinguishes those
two on the same column and the same numbers is not a weakened one.

**The milestone's criterion is amended to say this**, rather than leaving a reader to reconcile
*"nothing shrinks, in any arm"* with a ruled shrink. The old wording already scoped itself — *"still
620 mm after a command that is **not** a depth change, and is 720 mm after one"* — and the amendment
makes the depth-change case explicit instead of implicit.

### C. No owner decision is needed, and here is the one that would need one

The outcome is ruled and only the mechanism was ever open — ADR 0073 decision 5's own split, and this
is the same product question one level down. Asking again would be asking the owner to re-rule ADR
0036 decision 5 and ADR 0055 for the empty-space case, which ADR 0073 decision 5 has already done in
their words. The behaviour is recorded here in customer terms so a later objection has a dated record
to land on: **a freed opening is as deep as the body that freed it would be in the kitchen the
customer is now looking at.**

What *would* need the owner is the opposite answer — "a freed opening never gets shallower, even when
the kitchen does" — because that is new product behaviour contradicting three records, and it would
need a boundary on decision 2 that no record has. It is not being adopted, so nothing is blocked.

### D. The tie-break does not abstain on an undeclared `CabinetDepthRule`

Key 2 reads the rule through `cabinetDepthRuleOf`, which **throws** for an entry that declares
nothing, exactly as `occupiedDepthM` throws three lines away in the same function for the sibling
declaration. Abstaining and falling to key 3 is refused on the module's own words:
`cabinet-depth-rule.ts` states *"There is deliberately no arm meaning 'unknown' and no default"*, and
an abstention is that arm with key 3 as its default. It also reintroduces the defect this record
exists to close, one level up: which source gets recorded would depend on **which catalogue assembled
the map** rather than on the design — ADR 0011's 2026-08-26 correction, in the route it warns about.

**The reason given for abstaining is a misreading of decision 8, and the line is already drawn.**
Decision 8's *"no new refusal at either seam"* is about **stored documents** — ADR 0052's dead link.
A `BodyCatalog` assembled without a declaration is a programming error in that catalogue, not a
customer's document, and ADR 0073 decision 7 draws exactly this line when it refuses a malformed
`depthFromBuildId` while accepting an absent one: *"a malformed document, not an old one"*.

**The throw is unreachable for every catalogue the product builds, and a test must pin why.**
`buildKitchenLBodyCatalog` calls `refuseUndeclaredDepthRules` over **both** populations as it
assembles the map, so a shipped or seeded row that declares nothing never reaches a placement. The
void engine's own field comment already promises this outcome — *"refused by the same function at the
first wave that reads a rule off it"* — and this is that wave. The assertion to add names the
dependency, so that deleting the assembly gate turns something red here rather than nowhere.

**Read at the comparator, not resolved onto the record.** `PlacementRecord` carries `depthRule` raw,
the way it carries `occupiedDepth` raw, and the resolution happens where the fact is consulted. The
alternative — resolving for every member as each column is derived — is fail-closed a step earlier and
is refused on scope: eight test files build catalogue entries with an `occupiedDepth` and no
`depthRule`, several of them driving `deriveColumns`, so it widens that function's contract for every
caller in the tree. Consulting the fact where it decides something leaves them green unless one of
their fixtures actually ties at the millimetre — and a fixture that ties while declaring nothing is a
catalogue that has not been thought about, which is what ADR 0058 decision 2 wants surfaced.

### E. The third red test is a carried debt, and it must be bounded rather than expected

`never leaves a depth change refused by a sequence of ordinary commands` is the `HEIGHT_EXCEEDS_LEVEL`
finding above, and wave 6K-c **closes with it carried**: it reproduces without this wave's field, it is
older than this wave, and holding 6K-c for it would hold a closed defect behind an unadjudicated one.

**Not as an `it.fails`.** That records *"this is broken"* and not *"this is broken exactly this much"*
— the assertion is a count, so an `it.fails` keeps passing if the measured trails become more. The
test asserts the **measured set**: every refusal collected by the sweep carries code
`HEIGHT_EXCEEDS_LEVEL` and the set of trails is exactly the thirty-four measured, naming this record's
finding and the wave that will own it. A thirty-fifth trail, or a refusal of another code, turns it red
the day it appears. That is a debt with a boundary and a tripwire, which is what distinguishes a
carried defect from one nobody owns.

Thirty-four is the closure of one defect over the sweep alphabet, not thirty-four defects. `STEPS` is
8 — two depths, plus three keys × two delete kinds — so the four-step sweep over an alphabet of 4 runs
8⁴ = 4,096 sequences. The trails split into 2 three-step and 32 four-step. The 2 are the finding's own
minimal reproduction, `[deleteA200, deleteA200, depth]`, once at each setting. The 32 are 16 × 2: the
third position may be any of the 6 non-depth steps at any of 3 positions, which is 18, minus 2 for the
collapse where the extra step is itself the `A|2.00` delete (a third such delete is a no-op — the
member is already gone), giving 16 distinct three-prefixes, at each of the 2 depths. All 34 carry
`HEIGHT_EXCEEDS_LEVEL` and all 34 contain the minimal reproduction.

**Correction, 2026-09-05.** This section originally named the trail count as three. The shipped test
(`apps/web/tests/store/qa-6k-c-frozen-source.adversarial.test.ts:771`) asserts thirty-four, and that is
the measured set — nothing grew and nothing regressed. The "three" was read off
`refusals.slice(0, 3)` in an earlier draft of the assertion (test file's own note,
`qa-6k-c-frozen-source.adversarial.test.ts:764-765`), which reported only a slice of the sorted list
rather than the set; this section documented the slice, not the defect. The arithmetic above and the
bound itself are unaffected — the record was undercounting its own evidence, not overstating the debt.


## Amendment, 2026-09-08 — decision 10 point 2 is confirmed, and where it is currently violated

Ruled in [ADR 0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md),
after the item 8 wave (ADR 0101) reported the predicate false for a wall body over a full-height
column. **Nothing above is revised, narrowed or struck.** This amendment exists so that a reader who
finds the invariant failing on the tree does not conclude that the invariant was wrong.

### The predicate stands, unchanged and unscoped

> for every published column, either `depthFromBuildId` is absent or the catalogue does not hold it,
> or that entry's `occupiedDepthOfEntryM` at the design's own declared setting equals `Column.d`.

It is not a test convention and it is not narrower than its wording. It is the **precondition of a
production computation**: `frozenDepthAtThisSetting`
(`packages/configurator-domain/src/frozen-map-at-cabinet-depth.ts:391`) republishes a member-less
extent as `occupiedDepthOfEntryM(recorded)` and keeps that source id, so where the pair disagrees that
line publishes a depth nothing in the kitchen ever had. ADR 0102 measured it: **330 mm on a column that
had been 700, on the shipped kitchen, through four ordinary commands.**

### Where it is violated today, and by what

**Wave 6I2, since 2026-09-04.** `resolveDepthM` (`commands/insert-fit.ts:835`) builds a wall body over
a lifted column to `columnBuildDepthM`'s declared line and never to the entry's `frameDepthMm`, while
`restoredColumns` (`void-engine.ts:668`) goes on recording `depthFromBuildId: deepest.buildId` for that
depth. Two correct rules with nothing between them.

Reproduced by ADR 0102 in three ordinary commands on declarations ADR 0101 never touched — delete
`p23`, insert the offered `wall-cabinet` into `B|1.80`'s `y0` 2.2 void, one `setCabinetDepth(700)`:

```
after ONE setCabinetDepth(700):  ["B|1.90 d=700.0 src=wall-cabinet declares 400.0 at 700"]
```

**It is pre-existing.** The same kitchen on the pre-ADR-0101 catalogue, with the deep tops pinned,
answers `[]` at both settings. ADR 0101's wave did not create the defect; it moved the shipped kitchen
into the population that reaches it.

### The rule ADR 0102 adds, stated here because this is the record a reader lands on

**A depth that `columnBuildDepthM` produced carries no body's name.** That is ADR 0080 decision 4's own
sentence — *"claiming one for it would be an invention"* — and `restoredColumns` breaks it through the
other door. The fix is wave **6Y**, against `restoredColumns` and not against this predicate, and
decision 9 above (*"no rule here changes a published depth, only the record beside it"*) binds it in
the opposite direction: 6Y **does** move a published depth, so it owes an enumeration of every state
that moves.

### And what may not be done about it

A second authority added to the shared helper so that the disagreeing state reads as legal is refused
by name in ADR 0102 decision 2, on
[ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decision 7
(*"an invariant edited to accommodate a defect is the defect laundered"*) and
[ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md)
decision 1, whose Q1 answers *invariant* and whose Q2 fails because the falsifying fact is a wave's
code rather than a dated ruling. `apps/web/tests/support/frozen-source-invariant.ts` carries such an
exemption at the time of writing; ADR 0102 decision 3 sets the only shape in which it may remain, and
for one wave only.
