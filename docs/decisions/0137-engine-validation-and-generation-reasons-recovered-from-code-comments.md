# ADR 0137 — Engine, validation and generation: reasons recovered from code comments

Status: Accepted
Date: 2026-10-06
Type: Finding (recovered reasons; no behaviour changes)
Milestone: Cross-cutting; filed under ADR 0136 decision 3

**Why this record exists.** [ADR 0136](0136-code-and-test-comments-carry-only-what-nothing-else-can-and-history-lives-in-the-records.md)
decision 3 says a load-bearing reason found only in a code comment is filed in an ADR after the
stripping pass, so the comment can shrink to a pointer. Each decision below is one such reason, in the
domain's engine, validator and generation code. **Evidence tier for every decision: recovered from a
code comment on 2026-10-06, not re-measured.** Figures are quoted from the pre-pass comment text and
are not restated as fresh measurements. Where the comment gave no reason, the decision says so. Cite as
`see ADR 0137 decision N`. Two further engine reasons were filed as an addendum to
[ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) (items 1 and 2).

## Decision 1 — `VOID_KIND` is one spelling of an id, and two paths render it as different words

- **Rule.** `VOID_KIND` (`"void"`) is the one spelling of the *id*, not of the word. §9's selection
  publishes `EMPTY_SLOT_LABEL` → `catalog.emptySlot` (*"Spațiu liber"*), while §5.2's refusals build
  `kindLabel(VOID_KIND)` → `catalog.unknownKind` (*"Dulap"*). The divergence is recorded and not fixed.
- **Why it is latent.** The only refusal that ever names a void is `COLUMN_MISMATCH` (through
  `openingLabel`), and it fires only when `lookup.columns.get(opening.col)` misses. Voids and columns
  are derived together from the same design, so a miss is an internal invariant break rather than a
  flow a customer walks.
- **Where.** `packages/configurator-domain/src/void-engine.ts` (`VOID_KIND`);
  `queries/describe-selection.ts`; `commands/insert-fit.ts`.

## Decision 2 — the planning map deliberately omits the free-ground clip

- **Rule.** `deriveColumnsOverFrozenExtents` does **not** run `clipEmptyColumnsToFreeGround`. A wave
  that makes the pass remove a column from this map "owes this line a change".
- **Why.** ADR 0090 decision 4b added the pass because a *slide* can leave a member-less extent standing
  on ground a placement now occupies. `frozenMapAtCabinetDepth` ends in it; the load path does not, but
  never slides, so it never has the input the pass was written for. The planning map is input rather
  than a published face: an overlap here is refused by `evaluateInsertFit`, the seam that decides,
  rather than silently published.
- **Figure, quoted from the comment.** Across "all 704 delete×depth scenarios the wave was swept
  over" the pass removes **0** columns from this map. (This is a different claim from the 704 commands
  in [ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md).)
- **Sibling.** The same split for the map the command *publishes* is `atCurrentCabinetDepth` in
  `frozen-map-at-cabinet-depth.ts`: a planning map takes §3.2's MAX over what stands there now, a
  published map keeps the surplus a delete left behind.
- **Where.** `void-engine.ts` (`deriveColumnsOverFrozenExtents`).

## Decision 3 — the full-height lift is same-wall only, and one corner shape is a known gap

- **Rule.** `isFullHeightUnder` asks of every full-height member **on the same wall** by overlap along
  the wall (not column membership). A wall-B cabinet in the inside corner is never lifted by a wall-A
  run standing physically beneath it, because both walls originate at (0, 0, 0).
- **Why it is accepted.** The comment says it is unreachable today: every wall-B corner column is
  330 mm deep, so the cap it keeps is a no-op. It becomes reachable once a wall-B column exceeds 400 mm
  with no full-height wall-B member of its own. A corner special case was "considered and rejected as
  not worth its cost; revisit it if that shape ever ships".
- **Evidence note.** Searched `docs/decisions/` and `docs/backlog/` on 2026-10-06 for the gap; no
  existing record states it. [ADR 0011](0011-m3-insert-contract-gaps.md) and
  [ADR 0103](0103-a-standing-body-is-re-planned-when-something-is-inserted-beneath-it-and-a-delete-leaves-it-alone.md)
  record the overlap-not-membership predicate only.
- **Where.** `void-engine.ts` (`isFullHeightUnder`).

## Decision 4 — a shrink must record its strip at every height the run stood at; a growth is left alone

- **Rule.** `recordsTheStripAShrinkHandsOver` (in `plan-width-funding.ts`) requires the empty column a
  shrink hands its strip to to cover every band the resized run stood at (`coversBand`, a union over the
  column's regions). A growth is not checked.
- **Why (shrink).** A column is a span along the wall *and* a vertical extent; a resize moves a boundary
  in both. Where the empty column stands at other heights, the width is conserved and the **floor is
  lost**: that part of the strip belongs to no placement, no recorded empty column and no derived void.
  The comment's measurement, quoted: on a 1550×1600 L the built wall A shipped `base-corner-x-900[0,900]`,
  50 mm of nothing, then `base-sink[950,1550]`, where the plan puts the sink at `[900,1500]` — the
  free-end shrink funded itself from a wall-row-only empty column at `[800,900]` whose only region is
  1.5–2.6 m. Reachable on the shipped reference kitchen with two ordinary deletes and one step
  (`set-width.records-the-strip-it-hands-over.test.ts`), so the repair belongs to this command.
- **Why (growth left alone).** "A scope decision rather than a claim that it is safe." The mirror case
  exists, but refusing it would withdraw an operation customers have today (growing a wall cabinet into
  the opening beside it; the comment counts nine assertions across six files that spend it), and
  whether "refuse the growth" or "accept the sliver" is right is a product question.
- **Asked of the selected column.** The check runs on the column the scan already selected, not as part
  of `findAdjacentEmptyColumn`'s filter: filtering would let a narrower abutting column win where the
  widest fails the band, and which abutting column a resize spends is a product question this does not
  reopen (`byFundingCapacity`). Both bands come from the frozen map.
- **Related, recorded.** ADR 0031, ADR 0035 decision 7 (a shrink always has `vacatedEmptySpace` to fall
  back on).
- **Where.** `packages/configurator-domain/src/commands/plan-width-funding.ts`.

## Decision 5 — the wall-end clip lands on the whole-millimetre grid by parity

- **Rule.** `widestOnTheGrid` returns the widest column that fits the slack and has the **same parity
  as the recorded width**, holding the near edge. It gives up at most one millimetre of a published
  opening.
- **Why.** The near edge is `centre − width / 2` (whole when the width is even, a half millimetre when
  odd); the clipped centre is `nearEdge + clipped / 2`. Both are whole exactly when the clipped width
  has the same parity as the recorded one.
- **What it replaces.** A decline whose stated justification was false ("every catalogue width is even,
  so a member-less column of an even width never puts this off the grid by itself"). The comment's
  measurement: on the shipped, even 3560 mm wall A, an even column `alongMm 1782 widthMm 3558` has its
  near edge at 3, wants a clip of 3557, and was published whole — 1 mm past the end of its wall, with
  `recomputeVoids` publishing an opening through it. That broke ADR 0069's owner ruling (*"never"*),
  repeated in ADR 0090 Amendment B (*"no opening past the wall is ever derived, drawn or offered"*).
- **Why not a decline.** This pass's two siblings decline into a state a *validator* still refuses;
  there is no validator between here and the offer list. `landsOnWholeMillimetres` is left to the two
  callers whose "no" has an answer: the width command's `NON_INTEGER_MILLIMETRES` and the v1
  migration's untouched entry. What remains of the decline is a column no document could carry, and a
  column the wall covers by a single millimetre of the wrong parity.
- **Where.** `packages/configurator-domain/src/clip-empty-columns-at-wall-end.ts`
  (`widestOnTheGrid`, `planClip`).

## Decision 6 — two epsilons, and the shipped-kitchen columns that make merge and vacated-void rules non-obvious

- **Rule (vacated void).** `MODULE_LINE_EPSILON_M` (`1e-9`) is float slack, **not** manufacturing slack:
  it is deliberately nine orders of magnitude smaller than `FIT_TOLERANCE_M`
  ([ADR 0015](0015-min-span-is-exclusive.md) records what happens when a fit tolerance is used where a
  float epsilon belongs).
- **Why.** A slot's height is a difference of module lines and accumulates error; the comment's worked
  case: the 1.50 → 2.20 slot measures `0.7000000000000002`, so its computed top can sit a few ULPs above
  the line it came from. Without the epsilon a body standing at exactly 2.20 reads as inside the slot
  that ends at 2.20 and the level below swallows the delete.
- **Rule (merge).** Seeded columns overlap, so a run whose members merely touch at their edges can
  still enclose ground a third column's member stands on; and a merged centre can land in a 10 mm key
  bucket another column owns, in which case the merge **declines rather than nudging the key** (a nudged
  key puts the space somewhere the customer did not free).
- **Figures, quoted from the comments.** `A|0.45`'s 900 mm corner base spans 0–900 across both `A|0.30`
  and `A|0.75`; on wall B `p9` spans 330–900 under `p26`'s 580–900; two cleared wall columns spanning
  0–900 would key as `A|0.45`, the corner base's own column, and overwrite it in the map.
- **Related, recorded.** ADR 0011 (the geometric-not-membership correction to `hasFullHeightUnder`,
  2026-08-26).
- **Where.** `packages/configurator-domain/src/queries/vacated-void.ts`;
  `merge-empty-columns.ts`.

## Decision 7 — a straight room reaches the composer as one wall beside an empty, zero-capacity wall B

- **Rule.** `shellRunsFor` hands the composer a straight room as the one wall's run beside an empty,
  zero-capacity wall B. `planKitchenComposition` never branches on the shape.
- **Why.** "A wall with no capacity cuts the reading order at 0 by the same `fitsAcrossTheCorner`
  arithmetic an L's own narrow prefix wall already uses."
- **Related, recorded.** [ADR 0130](0130-a-straight-kitchen-is-the-composers-run-on-one-wall-with-no-corner.md)
  decision 3 (`wallLengthMm("B", linear) = 0`) and decision 5 (the L's composer with the one wall as the
  suffix and an empty prefix). ADR 0130's status is **Proposed**; this decision is the mechanism the
  code relies on and does not change that status. The comment's earlier citation ("ADR 0130 D5/D6")
  points at decisions 5 and 6 there; decision 6 is *no corner, no direction*, so the substance sits in
  decisions 3 and 5.
- **Where.** `packages/configurator-domain/src/generation/generate-kitchen.ts` (`shellRunsFor`).

## Consequences

- Code comments at the symbols named above may shrink to `see ADR 0137 decision N`.
- Nothing here changes behaviour. Decision 3's gap stays open, recorded with its stated trigger.
