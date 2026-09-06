# ADR 0089 — `alongWallPositionFollows` is kept and its reader is the depth command, not the descoped bars

Status: Accepted
Date: 2026-09-06
Type: Decision (adjudication; extends [ADR 0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md)'s finding)
Milestone: M6 — wave 6J-c; closes `docs/BACKLOG.md` entry 47

## What was asked

`docs/BACKLOG.md` entry 47, *"`alongWallPositionFollows` has a validator and no consumer — NEEDS AN
ARCHITECT RULING"*, records the coordinator's own lean: **delete the field**, on the ground that the
surface which might have consumed it — the wall-coverage bars, waves 6N-b and 6N-c — was descoped by
the owner on 2026-09-05 (*"skip it in general for now… on mobile it will take a lot of place and
there is already too many things on screen"*).

The measurement behind the lean is correct. `cabinetDepthRuleOf`
(`packages/configurator-domain/src/cabinet-depth-rule.ts:137`) throws
`UndeclaredCabinetDepthRuleError` unless `alongWallPositionFollows` is `"base-formula"` or
`"wall-map"`, and **nothing in `src/` anywhere branches on which of the two it is**. The field is a
presence test used to detect an undeclared rule, and outside that function it appears only in tests.

**The ruling is: keep it, and give it the reader wave 6J-c already plans. The premise behind the lean
is wrong — the bars were never its consumer.**

## Why the descoping does not reach it

The bars would have **displayed** a coverage percentage. `alongWallPositionFollows` decides
**geometry**: by how much each wall-B placement slides along wall B when the cabinet depth changes,
because a deeper wall-A corner body consumes more of wall B. ADR 0083 decision 5 and wave 6N-b are
about the first; ADR 0083's *Finding* is about the second, and the wave table's own row for 6J-c has
said so since it was written: *"and it gates nothing, **6N included**."*

The record the backlog entry should have been read against is **ADR 0083, not ADR 0072**. ADR 0072 is
price-book versioning and does not mention the field; it was cited in the dispatch that produced this
ruling and it does not touch the subject. The record that introduced the field is wave 6J-a's commit
`c8ba3af`, whose message states the intent directly: *"`AlongWallDepthChain` becomes a required field
on every `CabinetDepthRule` arm, so which chain moves a body — the base formula or the wall map — is
declared per entry."* Its acceptance criterion in `docs/milestones/M6-price-and-global-settings.md`
is explicit that a reader was owed in the same wave: *"This wave is where it gains a production
reader, so it is where declaring it stops being a rename."* The declaration shipped and the reader
did not. That is the unmet criterion ADR 0083 found and 6J-c closes.

## The measurement — the field is load-bearing, and the two literals carry different numbers

Measured at `14cef90` against the built `packages/configurator-domain/dist`, comparing
`buildKitchenLBodyCatalog(600)` and `(700)`. A wall-A body at the corner occupies, in wall B's
along-wall coordinate, the interval `[0, frameDepthMm]`; a wall-B body's near edge is
`alongMm − widthMm / 2`.

| chain | wall-A corner body it stands against | frame depth 600 → 700 | wall-B body | its near edge | headroom at 600 | at 700 |
| --- | --- | --- | --- | --- | --- | --- |
| `base-formula` | `base-corner-x-900` | 560 → 660 | `base-corner-return-320` (`p26`) | 580 | **+20 mm** | **−80 mm** |
| `wall-map` | the wall-band carcass (`wall-2door-600` et al.) | 291 → 361 | `wall-corner-return-570` (`p9`), `-top` (`p21`) | 330 | **+39 mm** | **−31 mm** |

Two independent facts fall out, and both are the reason the field exists:

1. **At 700 mm the shipped demo kitchen does not compose.** Two wall-B bodies are driven into wall
   A's run at the corner — 80 mm on the base band, 31 mm on the wall band. Wave 6I's review measured
   the same failure independently, in built meshes: *"at 700 the reference room did not compose —
   carcasses through walls, worktops intersecting, upper corner returns overlapping by 70 mm."*
   `validateDesignForCatalog` returns `[]` on the 700 design (ADR 0083, measured), because it checks
   room containment and column extents and not cross-wall corner intersection, so **nothing in the
   product reports this today**.
2. **The two literals are two different deltas — +100 mm and +70 mm.** A single uniform shift is
   wrong for one of the two chains by 30 mm, and 6J-c's own criteria already pin the resulting
   30 mm gap in wall B's top row at 700 (`p21` ends at 970 where `p22` starts at 1000) as a thing to
   assert rather than smooth away. The field is not a label on one behaviour; it is the selector
   between two.

The independent arithmetic above reproduces ADR 0083's figures exactly (*"20 mm and 39 mm of headroom
at 600, consumed and then some at 700"*), from the catalogue rather than from that record.

## Decision

### 1. The field is kept, and it is kept because a wave will read it — not as a deliberate unread declaration

Of the three options put, the third — *keep it as a declaration deliberately, and record what makes it
worth carrying unread* — is **refused**, and should not be recorded as the outcome. This project's
own stance is that a declaration nothing reads is the failure mode (ADR 0058, ADR 0061, and
`cabinet-depth-rule.ts`'s own head comment: *"a body that holds still because somebody wrote 600 down
is indistinguishable, six months later, from a body that holds still because somebody forgot to
parameterise it"*). Carrying it unread on purpose would make it exactly the thing that comment
warns about.

It is kept because **the reader is owed, named, planned and scheduled**: wave 6J-c, in
`docs/milestones/M6-price-and-global-settings.md`, with its goal, its two touched production files
and eight falsifiable criteria already written. The gap is that the reader has not been implemented,
not that nobody knows what it is.

### 2. Deleting the field is refused, and what it would cost is specific

Deleting `alongWallPositionFollows` would delete the only recorded statement, anywhere in `src/`, of
which of two corner chains moves a given body. Wave 6A3 held that rule as a `buildId` prefix inside
`tests/queries/overflowing-placements.test.ts`, and wave 6J-a retired the prefix precisely because a
hand-kept copy living only in a test is the failure. A deletion would send the rule back there —
`seededDesignAt` in that file still holds the model — or require it to be re-derived from `kind` or
from an id, which ADR 0061 ruled insufficient by measurement.

It would also leave M6 shipping a depth control whose 700 mm setting produces a kitchen with two
carcass intersections at the corner, with nothing in the product reporting them.

### 3. Wave 6J-c stands exactly as planned, with one criterion added

No criterion in 6J-c's plan is changed and none is removed. One is added, because this adjudication
is what makes it checkable:

- **At 700 mm, no wall-B placement's near edge sits inside wall A's corner reach**, asserted per
  chain with the two arms measured separately: `base-formula` against `base-corner-x-900`'s frame
  depth and `wall-map` against the wall-band carcass's. A single total is not enough — the two arms
  differ by 30 mm, and a sweep that lands on only one of them certifies nothing about the other
  (`docs/WORKFLOW.md`, *A predicate over a band is suspect*, on the minimum count per arm).

6J-c remains **unblocked, gating nothing, and not part of 6N**. The descoping of 6N-b and 6N-c
changes nothing about it.

### 4. Backlog entry 47 is closed by this record

It asked for an architect's ruling and it has one. It should be moved to the resolved list naming
this ADR and wave 6J-c, not deleted.

## Sweep of the decision records

Per `docs/WORKFLOW.md`, *Sweep the decision records before deciding*. Grepped `docs/decisions/`,
`docs/milestones/` and `docs/BACKLOG.md` for `alongWallPositionFollows`, `AlongWallDepthChain`,
`base-formula` and `wall-map`.

| Record | What it says | How it is settled |
| --- | --- | --- |
| [ADR 0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md), *Finding* | The chain has no production reader, so 2900 is a geometry the product does not build; 6J-a's own criterion is unmet; classified **contract gap with an implementation defect attached**; *"Wave 6J-c below closes it."* | **Extended, not contradicted.** This record adjudicates the option the coordinator raised afterwards (delete it) and re-confirms 6J-c against a fresh measurement. |
| [ADR 0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) decision 1 (owner) | Wall B is 2920 mm, fixed and never depth-dependent. | **Untouched.** Its note that wall B reads 120 mm free at both depths *"until the chain gains its reader"* is the state 6J-c ends. |
| Owner ruling 2026-09-05 dropping 6N-b and 6N-c | The wall-coverage bars are skipped: *"on mobile it will take a lot of place."* | **Not in conflict.** It removes a display surface. The chain is geometry, and 6J-c's row already recorded that 6N does not gate it. |
| [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md), [ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) | A per-entry fact is declared and read, never inferred from a band, a kind or an id; an undeclared entry throws. | **The frame for decision 1.** They are the reason "keep it deliberately unread" is refused rather than chosen. |
| M6 wave 6J-a's criterion (`c8ba3af`) | *"This wave is where it gains a production reader, so it is where declaring it stops being a rename."* | **Still unmet, and still owed to 6J-c.** Not restated as met. |
| [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md), [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) | Every body adapts to a depth change; a body past its wall's end is **marked**, not moved back. | **Both preserved by 6J-c's existing criteria.** The chain moves bodies because the corner consumed wall, and anything that then passes the end is marked. |
| [ADR 0072](0072-price-book-versioning-is-deferred-to-the-manufacturer-dashboard.md) | Price-book versioning is deferred. | **Does not touch this subject.** Cited in the dispatch; recorded here so the next reader does not go looking. |

Nothing found in the sweep contradicts this decision, and no record is superseded.

## Consequences

- **Every catalogue entry keeps a mandatory `alongWallPositionFollows`.** The maintenance cost the
  backlog entry names is real and is accepted for the length of one wave; it stops being unpaid the
  moment 6J-c lands.
- **Until 6J-c lands, the 700 mm setting produces two corner intersections in the seeded kitchen**,
  measured above at 80 mm and 31 mm. This is a named interim under `docs/WORKFLOW.md`'s *Nothing
  ships mid-milestone*, not a reason to stop a wave — but it is a **defect**, not merely an
  incomplete surface, so it must not be described as an acceptable interim state and must be closed
  before M6 does.
- **`seededDesignAt` in `tests/queries/overflowing-placements.test.ts` remains the only statement of
  the chain's arithmetic**, and 6J-c's existing criterion still requires deleting it once the
  command does the work. Nothing here licenses a second copy in the meantime.
