# ADR 0073 — A frozen extent records the body its depth came from, and a depth change re-asks that body

Status: Accepted
Date: 2026-09-04
Type: Decision + Finding
Milestone: M6 — new wave 6K-c; closes the residue wave 6K-a named and could not fix

## Context

Wave 6J-b shipped `setCabinetDepth`: the whole kitchen's cabinet depth becomes a command, and every
body that declares `follows: "cabinet-depth"` is rebuilt at the new setting
([ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) decision 1, through the normal command
path). Wave 6K-a made the web store follow it.

A defect was found and measured during 6K-a. After a depth change the store carried the **frozen
column extents** forward unchanged, so the map described the run at the depth the session *opened*
at — and because `projectFrozenMap` writes that map into `design.columnExtents`
([ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md)), the stale depth survived a
save and a reload. Nothing refuses it: `validateDesignForCatalog` asks containment on the along-wall
and vertical axes and never on depth, which ADR 0053 records as a deliberate omission with its own
measured reason.

6K-a fixed the part that can be fixed locally (`atCurrentCabinetDepth`, `apps/web/src/store/apply-command-result.ts`):
an extent whose column still has members is re-answered as the **MAX** of the frozen extent and what
its current members measure, never shrinking. Deeper-only is what keeps
[ADR 0011](0011-m3-insert-contract-gaps.md) Gap D intact — a plain re-derivation would collapse the
620 mm opening a delete freed under a wall run, which is the exact defect Gap D exists to stop.

**The residue this record rules on: a frozen extent with no member left to measure keeps the old
setting's depth.** Two shapes — a member-less column (`emptyColumns`) and an occupied column frozen
deeper than what still stands in it. Measured on a 600 → 700 change:

```
void A|1.30 : 0.6200 → 0.7200  fixed
void A|0.75 : 0.3300 → 0.3690  fixed  (see the finding below — this number is not the wall band deepening)
void A|2.00 : 0.6200 → 0.6200  RESIDUE
extents@2000: 620 → 620        RESIDUE
```

Nothing local can fix it. The body that froze the extent is gone, and the depth mapping is **per
chain, not a delta** — a base run goes 620 → 720 while a wall run goes 330 → 400.

## What the residue actually costs, stated precisely

The harm is narrower than "an insert builds at the old depth", and being precise about it is what
sizes the fix.

- **Always, in both directions: the space is drawn and saved at the old depth.** `Column.d` sets the
  column's across-wall origin (`d / 2`, `deriveColumns`) and stamps every `VoidRecord`, so a cleared
  slot in a 700 mm run is drawn as a 600 mm notch, is saved that way, and reloads that way.
- **The wall band only: it reaches what gets built.** `resolveDepthM` (`commands/insert-fit.ts`)
  floors the declared wall depth at the column's own clearance —
  `shallowerBuildDepthM(declaredM, buildToTheClearanceM(column.d))`. A member-less wall column frozen
  at 330 caps an inserted wall cabinet at 330 in a 700 mm kitchen where the map declares 400. That is
  [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)'s reported defect in mirror image: a
  re-inserted cabinet standing 70 mm out of line with its neighbours, visible on a handset.
- **The base, full-height, appliance and hood bands: it does not.** Their `occupiedDepth` is
  `finishesAtMm(...)` — a `wall-plane` declaration read off the catalogue, which 6H parameterised on
  the cabinet depth — so a body inserted into a stale-deep base column finishes at the *new*
  kitchen's depth regardless of what the opening claims. `resolveDepthM` hands those builders a depth
  they ignore (ADR 0018, ADR 0040).

## The option nobody raised, tested first: is the depth derivable from what a member-less column keeps?

It is not, and this is refused on measurement rather than on preference.

A member-less column retains `wall`, `w`, `top`, `regions` (collapsed to one `[y0, top]` interval by
the first save, ADR 0053) and `ry`; `x` and `z` are functions of `d` itself, and `hasFullHeightUnder`
is re-answered from *neighbouring* members and so says nothing about what stood in this column.
Measured on the shipped fixture through `deriveColumns` (2026-09-04):

| Key | `w` | floor | `top` | `d` | what supplied `d` |
| --- | --- | --- | --- | --- | --- |
| `B\|1.20` | 0.600 | 0.000 | 2.600 | **0.6380** | `tall-oven-tower-600` — the oven's and microwave's bars |
| `B\|1.80` | 0.600 | 0.000 | 2.600 | **0.6000** | `wall-2door-600-deep-top` over a 599 mm pantry |
| `A\|2.00` | 0.600 | 0.000 | 2.600 | **0.6200** | a base carcass |
| `B\|2.45` | 0.700 | 0.000 | 2.600 | **0.7420** | `fridge-free-700` — a machine, `manufactured-size` |

`B|1.20` and `B|1.80` are **identical on every field a member-less column retains** and differ in `d`
by 38 mm. So the depth is not a function of the retained geometry, and no derivation can be written.

The weaker question — *derive the chain rather than the number* — fails on the same table. `B|2.45`'s
742 mm came from a body declaring `follows: "manufactured-size"`, whose depth no setting may move
([ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md),
[ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md)); `A|2.00`'s 620 mm came
from cabinetry that must move. Geometry cannot tell those apart, and telling them apart is exactly
what `CabinetDepthRule` was created for — declared per entry, because inspecting the body does not
answer it ([ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md)).

**On [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 4, quoted only where it
bites.** It does not bite a value genuinely determined by retained geometry — that would not be two
numbers agreeing by luck, and the point is moot because the geometry does not determine it. It **does**
bite option (b) below, in ADR 0060 decision 2's own words: a build depth is *"a declared size, never a
measurement of what happens to stand there"*.

## Decision

**A frozen extent records the `buildId` whose clearance supplied its depth, and a depth change
re-asks that entry in the catalogue built at the new setting.**

1. **`EmptyColumn` and `StoredColumnExtent` gain one optional field, `depthFromBuildId`.** It is the
   `buildId` of the member that won §3.2's MAX when the extent was frozen. `deriveColumns` records it
   as it takes the MAX; `toEmptyColumn` writes it; `toColumnExtent` restores it. One field on one
   shape, because `StoredColumnExtentSchema` *is* `EmptyColumnSchema` (ADR 0053) and the two halves
   must not diverge.

   **A `buildId` rather than a band or a chain enum**, and the difference is load-bearing:

   - `Band` (`base | wall | top | column`) is one member's fact where the frozen depth is a MAX over a
     heterogeneous set, and `top` folds into `wall` for every reader that groups by band — so a band
     cannot even distinguish the four rows in the table above.
   - A chain enum would be a second statement of arithmetic the catalogue already owns
     (`baseFinishedDepthMm`, the wall map, `tallUnitFinishedDepthMm`, `hoodFinishedDepthMm`, the two
     corner variants, the pins, the machines), free to drift from it. ADR 0028's whole subject is two
     numbers that agreed until they did not.
   - A `buildId` is a key into the one map that already answers this, already parameterised on the
     cabinet depth by wave 6H.

2. **Re-answering is `occupiedDepthM` over the catalogue at the new depth, and nothing new.** For a
   recorded `buildId`, build the entry from `catalogAt(newDepthMm)` and read its `occupiedDepth`
   declaration — `finishesAtMm` answers directly, `shellPlusFrontMm` answers over the entry's own
   `frameDepthMm`, which is `deriveFrame`'s documented fallback for a placement with no measured seat
   (ADR 0011 Gap B). No new arithmetic is introduced anywhere.

   This gets the exceptions right without naming them: `fridge-free-700` stays 742 mm at every
   setting because `finishesAtMm(FREESTANDING_FRIDGE_FINISHED_DEPTH_MM)` is not a function of the
   depth, and ADR 0058's two pinned tops stay at 600 for the same reason. **An extent whose depth came
   from a body the setting does not move must not move either**, and that falls out of the
   declaration rather than being written down here.

3. **An extent that cannot be re-answered exactly is deepened to the column's declared build depth at
   the new setting, and never shallower.** Three cases reach this: a document written before this
   wave, a `buildId` the catalogue no longer holds, and a merged extent whose recorded source was
   lost. The rule is 6K-a's own MAX with `columnBuildDepthM({ cabinetDepthMm, hasFullHeightUnder })`
   as the second operand instead of a measurement — **the same deeper-only rule, one more operand**,
   not a new one. It closes the only case in *What the residue actually costs* that reaches a built
   body: a legacy cleared wall column frozen at 330 becomes 400 at 700 rather than capping an
   inserted cabinet below the map row. Everything it does not close is stated as a residual below.

4. **Not option (b) — "a member-less space follows the deepest run on its wall."** Rejected on two
   dated records, not on taste. It is a measurement of what happens to stand elsewhere, which ADR 0060
   decision 2 forbids in those words; and it makes one design answer two ways depending on which
   unrelated body was deleted, which is ADR 0011's 2026-08-26 correction — the correction that took
   `hasFullHeightUnder` out of the freeze precisely because *"which depth the customer got was decided
   by the route they took to the design, not by the design."*

5. **Not option (c) — "it stays put" — and this needs no owner.**
   [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5 records the owner's own
   words, and ADR 0055 states them as *"every body adapts, with no confirmation step and nothing left
   behind"* — reaffirmed literally when
   [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) withdrew ADR 0055's removal
   amendment. An empty space is a first-class state of the kitchen
   ([ADR 0043](0043-an-empty-space-of-any-width-is-a-legal-state.md)) and is recorded in the document
   as the customer's ([ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md)), so a
   cleared space that keeps the old kitchen's depth **is** something left behind. The outcome is
   already ruled; only the mechanism was open, which is the same split ADR 0036 made when it handed
   the mechanism to M6. Option (c) survives only as decision 3's bounded fallback, where it is the
   absence of recorded information rather than a product preference.

6. **No schema version bump.** `CURRENT_SCHEMA_VERSION` stays 5. The line is drawn in
   `migrate-design.ts`'s own words, and this lands on ADR 0053's side of it: *absent-field-absence owes
   no bump; a rewrite of stored values does.* A document without `depthFromBuildId` parses unchanged
   (`EmptyColumnSchema` is a `z.strictObject`, so the field is additive and its absence legal), loads
   with exactly today's geometry, and has **no stored value rewritten** — decision 3 changes what a
   *depth change* publishes, not what a *load* reads. The field arrives on the next save for every
   column the resolved map holds, exactly as `columnExtents` arrived under ADR 0053.

7. **Nothing is refused, at either seam.** An unrecognised `buildId`, or an absent field, falls to
   decision 3; it is never a validation failure. ADR 0052's rule governs: *"a `/d/{id}` share link is
   the one artefact this project hands to someone who cannot be asked to reload it"*, and a load that
   refuses is a dead link. What **is** refused, fail-closed at both seams, is a `depthFromBuildId` that
   is not a string of the shape the schema already accepts for a `buildId` — a malformed document, not
   an old one.

8. **The merge carries the shallowest member's source.** `mergeAdjacentEmptyColumns` already takes the
   shallowest member as the template for the merged envelope (`planBlock`), so the merged entry carries
   that member's `depthFromBuildId` and no new choice is made. A split writes the source to both halves;
   a resize and the wall-end clip move an extent without touching its depth, so the source travels
   unchanged. **The merge's 20 mm agreement tolerance is what makes this non-trivial** — 620 and 638 are
   within it, so a merged run genuinely can descend from two different sources, and taking the template's
   is the answer that matches the depth the envelope already took.

## Alternatives considered

- **Derive the band from the retained geometry.** The option that would have cost least. Refused on the
  measurement in the section above: `B|1.20` and `B|1.80` are identical on every retained field and
  38 mm apart in depth.
- **Record the cabinet depth the extent was frozen at, and scale.** It identifies a stale extent but
  cannot re-answer one: knowing 620 was frozen at 600 does not say whether it was cabinetry, a machine
  or a pin, and the mapping is per chain rather than a ratio.
- **Record the chain rather than the body.** Rejected under decision 1: a second statement of arithmetic
  the catalogue owns, free to drift from it.
- **Re-derive a member-less column's depth from a declared table keyed on its vertical extent** (floor
  at the base level → the base chain; floor at the wall level → the wall map). Attractive because it
  needs no field and answers every stored document. Rejected on measurement: applied to the shipped
  fixture it is correct for 7 of the 12 columns and wrong for 5 — `B|2.45` by 122 mm, `B|1.80` and
  `B|0.74` by 20, `B|1.20` by 18, `A|0.45` by 10 — so adopting it as the primary rule would change what
  a document draws *at the setting it already has*. It survives only in the deeper-only, never-shallower
  form decision 3 gives it.
- **Add a depth-containment clause to `validateDesignForCatalog` so a stale extent is refused.**
  Rejected, and ADR 0053 already measured why: 400 command sequences against the seeded kitchen produced
  10 documents whose members are legitimately deeper than the extent holding them, none hostile. A
  depth clause refuses documents the product itself writes.

## Records swept before deciding, and how each is settled

Per the owner's standing instruction, checked before ruling.

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D | A column's extent — `x`, `z`, `w`, `d`, `top`, `regions` — is frozen; re-deriving it from current records is what the freeze stops. | **Obeyed.** Every rule here is deeper-only or an exact re-answer of the *same* body; nothing re-derives an extent from what currently stands in it. The along-wall and vertical axes are untouched. |
| ADR 0011's 2026-08-26 correction | One design must not answer two ways depending on the route taken to it. | **The reason option (b) is refused**, and the reason `hasFullHeightUnder` cannot be pressed into service here: it is a fact about neighbours, re-answered per derivation. |
| [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 4 | A declaration, never a computation; two numbers must not agree by luck. | **Not cited against derivation** — a value determined by retained geometry would not be luck. Cited against option (b), and cited *for* decision 1's choice of a `buildId` over a second copy of the catalogue's arithmetic. |
| [ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md) | A member-less column is recorded because nothing can reconstruct it. | **Extended, not overturned.** Its depth is one more thing nothing can reconstruct; this record says so and records the one fact that makes it reconstructible. |
| [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md) | The frozen map is recorded whole, in two arrays partitioned by one predicate; no version bump for an optional additive field; containment proves nothing about depth. | **Followed on all three.** One field on the shared shape, no bump on the same argument, and the depth gap it names as deliberate is what this record closes at the command rather than at the validator. |
| [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | A load that refuses is a dead link. | **Decision 7.** Nothing here refuses a stored document. |
| [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) | A depth change migrates the stored design, through the normal command path; every body adapts, nothing left behind. | **Its "nothing left behind" is the clause that rules out option (c).** Its version-bump argument is the *contrast* case, not this one — decision 6. |
| [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md), [ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md), [ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) | A depth fact is declared per entry, never inferred from a kind or from geometry. | **The stance this record takes.** `depthFromBuildId` is a declaration; the exceptions fall out of the entries' own rules rather than being enumerated here. |
| [ADR 0059](0059-the-dishwasher-niche-declares-a-cabinet-depth-floor.md), [ADR 0056](0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md) | The 520 mm floor and the two declared depths. | No conflict. This record adds no depth to the map and no offered value to the control. |
| M6 owner section, *Cabinet depth* | The five M5 depth questions and their dated answers. | Question 4's outcome is ruled (ADR 0036 decision 5) and only the mechanism was open, which is what this record supplies. **No owner input is needed.** |

Nothing found in the sweep contradicts this decision.

## Finding, recorded because it is larger than the residue and was met while measuring it

**`resolveDepthM` still reads the module constant `WORKTOP_DEPTH_MM` (600), so at a 700 mm kitchen
every wall body is rebuilt to the 600 mm map row.** `commands/insert-fit.ts:834` passes
`cabinetDepthMm: WORKTOP_DEPTH_MM` to `columnBuildDepthM`; its own comment says *"until wave 6J gives
a design one of its own to carry"*, and wave 6J has now shipped without converting it.

The measurement in *Context* carries the fingerprint. `void A|0.75 : 0.3300 → 0.3690` is recorded as
*fixed*, and it is not: a wall run at 700 mm should measure `wallCarcassDepthMm(700) = 400`. The 369
is `330 + WALL_FRONT_ASSEMBLY_MM`, which is what you get when the rebuild is handed a build depth of
330 — the **600 mm** map row — and the fake probe seats the shell at exactly what it was asked for.

`apps/web/src/scene/kitchen-stage.tsx:102` hard-codes the same constant into `makeKit`, so the scene
is built at 600 whatever the design carries.

**Classified as an implementation defect against ADR 0055 decision 1, not a contract gap** — no
decision needs revising; two call sites were left on the pre-6J constant. It is recorded here rather
than ruled on because it is wave 6K-b's own work: the second reader is what gates 6K-b's
*"changing it visibly changes the model, not just a number"* criterion, and the first makes a 700 mm
kitchen's wall bodies wrong independently of anything this record decides.

## Consequences

- **Wave 6K-c implements this**, after 6K-b. It does **not** gate 6K-b — see the wave's own note in
  `docs/milestones/done/M6-price-and-global-settings.md`.
- **`MAX_DESIGN_BYTES` must be re-derived, not assumed.** ADR 0053's per-entry allowance is 128 bytes
  and a worst-case entry carrying `depthFromBuildId` reaches it: `wall-corner-return-570-top` is 26
  characters and the key plus quotes, colon and comma is 21 more. The allowance and the cap both move,
  by the same derived arithmetic ADR 0053 used, and a test pins the longest entry the schema can
  express rather than a hand-picked one.
- **`emptyColumns` and `columnExtents` keep their disjointness and every existing refusal.** The field
  is on the shared shape, so neither array gains a rule the other does not.
- **A residual, stated out loud, in ADR 0053's own idiom.** A document written before this wave whose
  cleared column was *deeper* than the declared build depth — a cleared base run, a cleared tall
  column, a cleared appliance slot — keeps that depth through a depth change. It is drawn and saved at
  the old setting's depth and nothing recovers it, because the fact was never recorded. It reaches no
  built body (see *What the residue actually costs*), and it self-corrects the moment any body is
  inserted into that column, since the extent then has a member to measure again.
- **A 600 → 700 → 600 round trip is no more reversible than ADR 0055 already says it is**, and this
  record does not make it so. An extent re-answered through decision 3's fallback does not return to
  where it started.

**Addendum, 2026-09-04 — nothing above is revised.** The finding's second call site,
`kitchen-stage.tsx:102`, is ruled on by
[ADR 0074](0074-the-scene-rebuilds-whole-at-a-depth-change.md), which also records a **third** call
site in the same family and against the same clause: the probe that measures a depth change holds a
kit at the depth being left, so the seats it writes are the old depth's. New wave 6K-e.

**Amendment, 2026-09-05 — one unstated invariant, supplied by
[ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md); nothing above is revised.**
Decision 1 records the winner of §3.2's MAX *"when the extent was frozen"* and says nothing about the
**second** place a MAX is taken: `atCurrentCabinetDepth` publishes a depth from one operand and
carried the recorded source across untouched, so a republished `d` and its `depthFromBuildId` could
part. Adversarial QA reached the parted state in **one** command on the untouched fixture — a depth change
publishing a depth its members explain, beside a source that does not — and measured 99 mm lost when a
later delete makes that record the only answer, saved and reloaded. ADR 0079 states the invariant — a
published depth and the source that explains it are written together, or the source is absent and
decision 3's fallback owns the depth — and rules the two things decision 1 left open once the winner
had a name: that the MAX is not decided below the millimetre the document records, and how a tie
between two declarations is broken. Decisions 2 and 3 are load-bearing in that ruling and neither
moves: decision 2's exact re-answer in **both** directions is what refutes a floor on the recorded
arm, and decision 3's fallback is refused as one. Wave 6K-c absorbs it and stays one wave.
