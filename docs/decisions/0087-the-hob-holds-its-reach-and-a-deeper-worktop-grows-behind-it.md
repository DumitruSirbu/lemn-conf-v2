# ADR 0087 — The hob holds its reach to the cook, and a deeper worktop grows behind it

Status: Accepted (its "the sink is left undecided" consequence is settled 2026-09-07 -> [0098](0098-the-sink-is-centred-at-the-declared-depth-and-a-deeper-worktop-grows-behind-it.md))
Date: 2026-09-05
Type: Decision + Finding
Milestone: M6 — answers wave 6I's unraised product question; schedules wave 6U

## Context

M6 wave 6I closed on 2026-09-03 with one acceptance criterion that was an instruction rather than a
claim (`docs/milestones/done/M6-price-and-global-settings.md`, wave 6I, *What the wave deliberately does
not do*):

> **`HOB_FORWARD_OFFSET_M = 0.06` is the one literal the seat sweep left.** The hob follows its
> cabinet's seat, so its clearance to the worktop's front edge grows from 10 mm at 600 to 60 mm at
> 700. It intersects nothing and crosses no wall, so it is **not a composition defect** — it is an
> appliance sitting further back on a deeper worktop, and whether that is right is a product question
> nobody has answered. Do not derive it into a formula and do not leave it inherited: **raise it.**

It was never raised. Searching all of `docs/` for `HOB_FORWARD_OFFSET` returns that sentence and
nothing else — no backlog entry, no *Not established* question, no decision record. The M6
certification audit found it on 2026-09-05, two waves after the depth control shipped.

The constant is `packages/three-adapter/src/kitchen-parts.ts:958`, read at `:992`
(`seatHobOnWorktop`, which serves both hob-bearing catalogue bodies) and at `:2101` (the seeded
room's standalone cooktop over `p2`'s base).

### What ships today, measured

Built through `makeKit({ cabinetDepthMm })` at both depths ADR 0056 declares, read off named meshes
in each body's own local frame (metres; `+z` faces the customer, `z = −seat/2` is the wall plane):

| Local `z` | at 600 | at 700 | moves |
| --- | --- | --- | --- |
| worktop back edge — the wall plane | −0.290 | −0.340 | −50 |
| carcass shell front | 0.280 | 0.330 | +50 |
| drawer / door front face | 0.298 | 0.348 | +50 |
| drawer handle bar, front of | 0.319 | 0.369 | +50 |
| `oven_front` fascia (`base-hob-oven`) | 0.291 | 0.341 | +50 |
| **`cooktop_glass` front** | **0.320** | **0.320** | **0** |
| worktop front edge | 0.330 | 0.380 | +50 |

Everything in the body follows the cabinet-depth setting except the hob, which does not move at all
in its own body's frame. Four consequences fall straight out of that table, and each of them is a
relationship a customer looks at:

- **Clearance to the worktop's front edge: 10 mm at 600, 60 mm at 700.** This is the number the
  audit reported and it is confirmed.
- **The hob's front edge crosses behind the cabinet fronts.** At 600 it stands 22 mm proud of the
  drawer front face and 1 mm proud of the handle bars. At 700 it sits **28 mm behind the drawer
  front face and 49 mm behind the handle bars** — the appliance recedes past the plane of the
  cabinet it is mounted on.
- **`base-hob-oven` splays.** The oven fascia already follows the front, because
  `OVEN_FORWARD_OFFSET_M` is derived from `carcassFrontM`. So the hob stands 29 mm proud of its own
  oven at 600 and **21 mm behind it at 700** — a 50 mm disagreement between two appliances in one
  cabinet.
- **The hood stops sitting over the hob.** Measured in the built room, `hood_canopy` spans
  z 0.100–0.600 at 600 and 0.200–0.700 at 700 (ADR 0039 hangs it at the front, so it moves +100 from
  the wall). `cooktop_glass` spans 0.090–0.610 and 0.140–0.660. **At 600 the two are concentric to
  10 mm; at 700 the extraction is offset 60 mm forward of the pan.**
  `docs/design/DEVELOPMENT-SPEC.md` line 610 names that relationship in as many words — *"Positions
  carry meaning — sink under the window, hob under the hood, dishwasher beside the sink."*

And the number the owner actually cares about: the **back burner ring centres** sit at local
z = −0.090 in the hob's own group. Their distance to the worktop's front edge — the edge the cook
stands at — is **420 mm at 600 and 470 mm at 700**.

### The owner's ruling, 2026-09-05

> "the gap (space) should be not in front but between wall and hob. It should be aligned to cabinets
> fronts because when you cook you should use easy the back hob circles in same way as it was 600 mm
> worktop"

Three things, in order of how load-bearing they are: the clearance in **front** of the hob is
constant; every millimetre of added depth appears **behind** it, between the hob and the wall; and
the **reason** is reach — the back burners must be no further from the cook at 700 than they are at
600.

## The sweep of earlier records, and how each is settled

Done before deciding, because this project's rule is that a dated record is not silently overturned.
**Nothing here rules the hob's placement**, so this is the first record on it rather than a second.

- **[ADR 0027](0027-the-hob-is-part-of-the-cabinet.md) decision 3** is the only record that names
  the number. It says the hob's local seat is *"the worktop line, 60 mm forward of the carcass
  centre — read straight off `buildKitchen()`'s own placement of the seeded cooktop"*. That is a
  statement about **where 0.06 came from**, made when the kit held one cabinet depth by
  construction; it is not a ruling that 60 mm forward of the carcass centre is right at every depth,
  and it could not have been. **Its value at 600 is preserved here to the micrometre** (see decision
  2), so nothing it asserts about the shipped kitchen changes. The clause naming the carcass centre
  as the datum is struck in place there and pointed here.
- **[ADR 0039](0039-the-hood-is-a-standard-depth-hung-at-the-front.md)** is the nearest thing to an
  opposite ruling and turns out to be the **same** ruling on the body above. A hood is a
  manufactured size that does not follow the setting, is **hung at the front**, and leaves the gap
  **behind it, against the wall** — decided by the owner in almost the same words used here. It is
  not overturned, it is extended downward: the measurement above shows hood and hob only stay
  concentric if both follow the front, so ADR 0039 was already half of this decision and has been
  waiting for the other half since 2026-08-28.
- **[ADR 0039](0039-the-hood-is-a-standard-depth-hung-at-the-front.md) decision 2's datum** is the
  one place the two could still disagree. The owner confirmed there that *"the front"* means the
  cabinet-depth line and **not** the worktop's 620 — *"yes not from 620 but from 600 that corresponds
  to cabinets margin fronts"* — while this ruling's own measurement is stated against the worktop's
  edge. Decision 2 below resolves that, and the resolution is that it does not matter: **the two
  datums are a fixed distance apart at every declared depth**, so they name the same seat.
- **[ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decision 4** — a depth is a
  declaration, never a computation, and an undeclared one throws. Settled: **untouched, and not what
  this record is about.** The cabinet depth still arrives from ADR 0056's declared map, unchanged.
  What is derived here is a *position inside a body whose depth is already declared*, which is the
  same arithmetic `OVEN_FORWARD_OFFSET_M` and `HOOD_SEAT_OFFSET_M` already do. No map row is
  interpolated and no new depth is invented.
- **[ADR 0055](0055-a-depth-change-migrates-the-stored-design.md)** — a depth change migrates the
  stored design. Settled: **no migration is owed**, and it is measured rather than assumed. See
  decision 5.
- **[ADR 0056](0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md)** — two
  declared depths, and the control reads the map. Settled: it supplies the population the gate
  sweeps, and a third row would extend the sweep with no other change.
- **[ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md)** — the two deep tops are **pinned**, by
  a declared per-entry exception. Settled, and the distinction matters: **this record creates no
  pin.** ADR 0058 holds a *cabinet's finished depth* still against the setting. Here the appliance's
  own **dimensions** are fixed (a 590 × 520 glass plate is a manufactured size —
  `docs/best-practices/product-invariants.md`) while **where it is mounted follows the setting**,
  which is exactly the split `OVEN_FRONT_PAST_WORKTOP_MM`'s comment in `catalog.ts` already draws for
  the oven. Fixed size, moving mount. Nothing is pinned and no entry declares an exception.
- **[ADR 0059](0059-the-dishwasher-niche-declares-a-cabinet-depth-floor.md)** — the 520 mm floor.
  Settled: a different axis entirely, and unreachable from either declared depth. Its **remedy
  shape** is the one copied here — a constant declared with the arithmetic that produced it written
  next to it, so a reader can re-check the number instead of trusting it.
- **[ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md) decision 2** — a build
  depth is a declared size, never a measurement of what happens to stand there. Settled: it is the
  mechanism this record applies one level down, inside a body rather than over a column.
- **[ADR 0038](0038-pre-release-no-stored-designs-no-migrations.md)** and
  **[ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md)** — five `designs` rows exist.
  Relevant to decision 5 and disposed of there.

## Decision

**1. The hob's clearance to the front is the declared fact. Its seat is derived from it and from the
declared cabinet depth, and is never written as a number.**

One constant — the front clearance that ships today, **10 mm** — with its arithmetic beside it, in
`kitchen-parts.ts`:

```
worktopFrontMm  = COUNTER_FORWARD_OFFSET_MM + (cabinetDepthMm − BASE_FRONT_OVERHANG_MM
                                               + COUNTER_OVERHANG_MM) / 2
hobSeatMm       = worktopFrontMm − HOB_FRONT_CLEARANCE_MM − HOB_DEPTH_MM / 2
```

At 600 that is `330 − 10 − 260 = 60` — **exactly the literal it replaces**, which is why the shipped
kitchen does not move and M1's parity gate needs no re-baselining. At 700 it is `380 − 10 − 260 =
110`, and the whole 100 mm of added depth lands behind the hob: the gap to the wall goes from 90 mm
to 190 mm, and nothing in front of the hob changes at all.

The arithmetic is done in **millimetres and divided once**, for the reason `makeKit` already states
at `kitchen-parts.ts:357`: `0.6 − 0.04` is `0.5599999999999999` and M1's gate diffs at 1e-6 m.

**2. The datum is the worktop's front edge, and naming it costs nothing — measured, not argued.**

The three candidates for *"the front"* — the worktop's front edge (`cabinetDepth/2 + 30`), the
cabinet front assembly's outer face (`cabinetDepth/2 − 20 + 39`) and the carcass front
(`cabinetDepth/2 − 20`) — **all move by exactly +50 mm per +100 mm of cabinet depth**, because the
counter overhang and the front assembly are constants that do not scale (ADR 0036 decision 3 puts the
worktop outside geometry and price; `FRONT_ASSEMBLY_D` is a door plus a bar). So the derived seat is
**numerically identical whichever is named**, at every declared depth.

That dissolves the one place ADR 0039 and this ruling could have pulled apart. The worktop's edge is
named because it is what the owner's stated reason is measured from — the cook stands at it — and
because the domain already declares that *a base run finishes at its worktop's front edge*
(`baseFinishedDepthMm`, `catalog.ts`). The owner's own phrase, *"aligned to cabinets fronts"*, is
**also satisfied by the same seat and that is a measured fact rather than a compromise**: against the
drawer-front plane the hob stands 22 mm proud at 600 and 22 mm proud at 700, and against the handle
bars 1 mm proud at both.

**3. The wrong call site is made unwriteable, not merely documented.**

Three separate things, because a comment is not a guard and this project's recurring defect is a
gate that passes because it is not looking:

- **No depth-independent value survives.** The seat is computed inside `makeKit` from the
  depth-parameterised locals, in the shape `HOOD_SEAT_OFFSET_M` and `OVEN_FORWARD_OFFSET_M` already
  use. After the wave there is no metre constant for a future reader to copy, and a literal
  reintroduced there fails the gate below at 700 rather than at code review.
- **One seat, read by both sites.** `seatHobOnWorktop` serves both catalogue bodies and the seeded
  room's standalone cooktop at `:2101` composes the same value onto its cabinet's seat. The room
  site **must not** parent the hob to its cabinet to get there: the reference room draws them as
  siblings and `kitchen-parts.decomposition.parity.test.ts` diffs child by child.
- **A gate that sweeps ADR 0056's declared depths and asserts a relation, not a table.** The shape
  `cabinet-depth-sweep.parity.test.ts` already uses. A table of expected positions passes just as
  well if every number in it is wrong together; a relation between two meshes measured in the same
  built kit does not.

**4. The invariant, in the owner's own terms, so a test can fail on it.**

> **The distance from the worktop's front edge to the hob's back burner centres is the same at every
> declared cabinet depth: 420 mm.**

It is falsifiable, it sweeps the depth map rather than checking one case, it is read off named
geometry (`countertop` and `burner_ring`) rather than off the constant under test, and **it fails on
today's code** — 420 at 600 against 470 at 700. It is also literally what the owner asked for:
*"you should use easy the back hob circles in same way as it was 600 mm worktop."*

**5. This is a defect, not a change, and no stored document is migrated.**

600 mm is the default and ships correctly; only 700 is wrong, and 700 became reachable when wave 6K
shipped the control. So it is a defect in reach — correct at the shipped depth, wrong at the other,
which is the exact class `room-composition.parity.test.ts` was written for.

**Nothing is migrated, and that is measured rather than assumed.** The hob is a child mesh inside a
body the kit builds at render time; no field of `Design` records it. The only stored facts that could
have been affected are the body's own depth and seat, and neither moves: `base-hob-2drawer`'s
bounding extent is the **worktop's**, −0.290–0.330 at 600 and −0.340–0.380 at 700, both before and
after, because the hob stays 10 mm inside it; `base-hob-oven`'s front is its **oven bar** at 0.358 /
0.408. `baseFinishedDepthMm` (620 / 720) and `hobOvenBaseFinishedDepthMm` (648 / 748) are unchanged,
so `occupied-depth.parity.test.ts` holds with its declarations untouched and no schema version moves.

**The corollary is a constraint on the fix**: the hob must stay strictly behind the worktop's front
edge at every depth. A "clearance" of zero would make the appliance the front-most mesh of its own
body and silently change what the domain declares that body finishes at.

## Alternatives considered

- **Leave it and record the growing gap as accepted, the way ADR 0058 accepted `p23`'s 99 mm step.**
  Rejected by the ruling, and it does not survive the measurement either: ADR 0058's step is a
  recess between two *cabinets* with nothing between them, where this puts an appliance behind the
  plane of the cabinet it is mounted on, offsets the extraction from the pan, and splays two
  appliances inside one body.
- **Centre the hob in its worktop.** The rule the sink base actually follows today (see the
  consequences). Rejected: it splits the 100 mm evenly and still costs the cook 25 mm of reach at
  700, which is the thing the owner ruled against.
- **Give the hob its own declared depth that follows the setting**, so its front and back both track.
  Rejected on `docs/best-practices/product-invariants.md`: a 590 × 520 induction plate is a bought
  appliance and a 620 mm-deep one is not manufactured. This is the same rejection ADR 0039 made for
  the hood's depth.
- **Align the hob's front flush with the worktop's front edge** — zero clearance, the most literal
  reading of *"aligned to cabinets fronts"*. Rejected twice over: it moves the shipped 600 mm kitchen
  by 10 mm against M1's parity gate, and it makes the appliance the front-most mesh of its body, which
  is the constraint decision 5 names.
- **Pin the hob's seat per catalogue entry**, in ADR 0058's declared-exception shape. Rejected: a pin
  says a value does **not** follow the setting, and this seat does. Declaring an exception for a body
  that has none is how the exception population stops being greppable, which is ADR 0058 decision 2's
  own reasoning read the other way.

## Consequences

- **Wave 6U owns the fix** — `docs/milestones/done/M6-price-and-global-settings.md`. It is
  `packages/three-adapter` only, and it lands after 6Q. It is independent of every open M6 wave: no
  domain declaration, no store action, no surface and no stored field changes.
- **Wave 6I's criterion is answered rather than dropped.** It is marked in place at the criterion,
  per `docs/WORKFLOW.md`'s rule, and pointed here. 6I's own judgement stands and is worth preserving:
  it was right that this is not a composition defect and right to refuse to derive it on its own
  authority. What it was wrong about is only that it never asked.
- **Two shipped gates could not have caught this, and a third class is needed.**
  `cabinet-depth-sweep.parity.test.ts` measures each body's finished **envelope**, which the worktop
  defines and the hob never reaches; `room-composition.parity.test.ts` measures **bodies against
  walls and neighbours**, and the hob intersects nothing. Neither asks where a part sits **inside**
  the body that contains it. That is the assertion wave 6U adds, and it is the reason the defect
  survived a wave whose whole subject was depth parameterisation.
- **The sink base has the same class of defect and is left undecided, deliberately.** Measured on
  `base-sink` at both depths: the sink rim, bowl, drain and the entire faucet assembly are
  **byte-identical** at 600 and 700 while the worktop grows fore and aft around them, so the bowl's
  front rim sits 130 mm behind the worktop's front edge at 600 and **180 mm at 700**, and the faucet
  goes from 2 mm off the worktop's back edge to 52 mm. Nothing intersects and nothing floats — ~~the
  sink stays 20 mm rear of its worktop's centre at both depths, which is a coherent rule and may well
  be the right one for a sink.~~ **The owner ruled on the hob and only the hob**, and inventing the
  parallel ruling is exactly the silent product change this process exists to stop. Recorded as
  `docs/BACKLOG.md` entry 41.

  **Decided 2026-09-07 — [ADR 0098](0098-the-sink-is-centred-at-the-declared-depth-and-a-deeper-worktop-grows-behind-it.md).**
  The owner ruled the sink centred, with the added depth behind it. The measurements above stand;
  what is struck is the suggestion that 20 mm rear of centre may be the right rule — it is not. Note
  that ADR 0098 **moves the 600 mm kitchen by 20 mm**, which this record's decision 1 deliberately
  refused to do for the hob; the two bodies differ because the hob's shipped literal already
  satisfied its ruling and the sink's does not.
- **The hood is not touched, and must not be.** `HOOD_SEAT_OFFSET_M = cabinetDepthM − HOOD_DEPTH_M /
  2` is already correct under ADR 0039; the hood-over-hob alignment is restored entirely by moving
  the hob. Measured after the fix: hob 0.190–0.710 against hood canopy 0.200–0.700 at 700 — the same
  10 mm inset on each side as at 600.
- **`base-hob-oven`'s oven, its filler panel and the tower's microwave are already correct and must
  not move.** `OVEN_FORWARD_OFFSET_M` and `MICROWAVE_FORWARD_OFFSET_M` are both derived from
  `carcassFrontM`, and `ovenFillerFront` measures its band off the oven that was just built. The
  50 mm splay between hob and oven fascia closes because the hob moves to where the oven already is,
  not the other way round.
- **A third declared depth extends the sweep and changes nothing else.** The seat is arithmetic over
  whatever `cabinetDepthMm` the kit is built at, so ADR 0056 decision 3's "one data row" cost is
  unaffected.

## Amendment — 2026-09-06: the hob's own floor, found while verifying wave 6U

Wave 6U shipped (`38d5cad`) implementing decision 1's derived seat. While verifying it, QA measured a
limit nobody had documented: **the hob has its own geometric floor, and it is 510 mm — ten below the
520 mm dishwasher floor `MIN_CABINET_DEPTH_MM` already declares.** It is not a defect, because it is
unreachable: `requireDeclaredCabinetDepthMm` (`packages/configurator-domain/src/worktop-depth.ts`)
throws below 520 and throws on any cabinet depth off the declared map, so no path in the product can
build a kit below 510. It is recorded because a derived seat with an undocumented floor of its own is
exactly the shape that bites the day someone declares a new depth.

**The derivation, read off `kitchen-parts.ts`'s own constants** (`HOB_DEPTH_MM = 520`,
`HOB_FRONT_CLEARANCE_MM = 10`, `COUNTER_OVERHANG_MM = 60`, `BASE_FRONT_OVERHANG_MM = 40`):

```
hobFloorMm = HOB_DEPTH_MM + HOB_FRONT_CLEARANCE_MM − COUNTER_OVERHANG_MM + BASE_FRONT_OVERHANG_MM
           = 520 + 10 − 60 + 40
           = 510
```

Below `hobFloorMm`, the hob's own back edge crosses the worktop's back plane and the hob — not the
worktop — becomes the back-most mesh of its own body, silently changing what that body occupies.
**Measured**: at cabinet depth 510 the hob's back edge sits flush with the worktop's back edge; at
**509** it crosses (`hobBack` at −245 against `wtBack` at −244, both local `z`, millimetres) and the
body's occupied extent exceeds what `base-cabinet`'s own declaration says it finishes at.

**The 520 mm coincidence is a coincidence, not a shared limit, and it is worth stating so nobody
later assumes one design decision protects the other.** `HOB_DEPTH_MM` is 520 and
`MIN_CABINET_DEPTH_MM` is 520, and `docs/BACKLOG.md` entry 19 independently named 520 as where the
dishwasher's decor door meets its own appliance — three appearances of the same number with three
different causes. QA measured both gaps as functions of cabinet depth `d`: the dishwasher's clearance
is `(d − 40) / 2 − 240` (ADR 0059); the hob's is `d − 510` (this amendment). **No term is shared
between the two formulas.** Two independent limits ten millimetres apart, and **the dishwasher's is
the binding one** — the declared 520 mm floor protects the hob with exactly 10 mm to spare, by luck
rather than by design. No hob/dishwasher geometric interaction exists at any declared depth.

**Consequence.** No code change is owed: the floor is unreachable and stays unreachable as long as
`requireDeclaredCabinetDepthMm`'s 520 mm minimum stands. If a future depth below 520 is ever proposed,
this amendment — not the dishwasher floor — is what must be re-checked, because the two limits do not
move together.
