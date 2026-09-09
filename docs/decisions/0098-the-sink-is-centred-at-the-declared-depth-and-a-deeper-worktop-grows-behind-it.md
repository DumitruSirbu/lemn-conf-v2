# ADR 0098 — The sink is centred on its worktop at the declared depth, and a deeper worktop grows behind it

Status: Accepted
Date: 2026-09-07
Type: Decision
Milestone: M6 — closes owner manual-feedback item 7, M6-AUD-007 and `docs/BACKLOG.md` entry 41

## Context

[ADR 0087](0087-the-hob-holds-its-reach-and-a-deeper-worktop-grows-behind-it.md) ruled the hob's
reach and **deliberately left the sink undecided**, in its own words:

> "**The sink base has the same class of defect and is left undecided, deliberately.** … The owner
> ruled on the hob and only the hob, and inventing the parallel ruling is exactly the silent product
> change this process exists to stop. Recorded as `docs/BACKLOG.md` entry 41."

The owner has now ruled, 2026-09-07:

> "It should be centered. And the gap should become bigger behind — so between the wall and the sink
> and faucet. Same principle as with hob."

This record is that parallel ruling, made rather than invented.

### What ships today, measured

`packages/three-adapter/src/kitchen-parts.ts:902-950`, the `sink: true` branch of `baseCabinet`.
Three literals in the depth axis and no derivation: the worktop is cut around an aperture of
half-depth `az = 0.2` centred on the cabinet's local origin; the sink assembly is added with
`sk.position.y` set and **no `z` at all**, so it sits at local `z = 0` at every depth; and inside
`builders["sink-faucet"]` the faucet group is seated at `-D/2 - 0.04 = -0.24` with a 48 mm
escutcheon radius, so its rearmost point is `-0.288`. The worktop around all of it *does* follow the
setting (`:385-387`).

Arithmetic over the declared constants — `counterDepthMm = cabinetDepth − 40 + 60`,
`worktopFrontMm = 20 + counterDepthMm / 2`, aperture 400 mm deep:

| Local `z`, millimetres | @600 | @700 |
| --- | --- | --- |
| worktop front edge — where the cook stands | +330 | +380 |
| worktop back edge — the wall plane | −290 | −340 |
| **worktop centre** | **+20** | **+20** |
| sink seat | 0 | 0 |
| aperture | −200 … +200 | −200 … +200 |
| **bowl front clearance** | **130** | **180** |
| bowl back edge to wall | 90 | 140 |
| faucet rearmost point | −288 | −288 |
| **faucet clearance to the wall** | **2** | **52** |

Those reproduce M6-AUD-007's measured 130 → 180 and 2 → 52 from the declarations alone.

**Note the worktop's centre is `+20` at both depths**, because `COUNTER_FORWARD_OFFSET_MM` and
`COUNTER_OVERHANG_MM` are constants that do not scale. The sink is therefore **20 mm rear of its
worktop's centre at both depths** — which is a coherent rule, just not the one the owner wants.

### The one place the owner's two sentences pull apart, and how it is resolved

"Centred" and "same principle as with hob" cannot both be literal at 700, and the difference is
50 mm:

- **Centred, read as a rule at every depth**, puts the seat at the worktop's centre — `+20` at both
  depths — giving a front clearance of 110 at 600 and **160** at 700. That splits the added 100 mm
  evenly, 50 in front and 50 behind. It is the option ADR 0087 explicitly **rejected for the hob**:
  *"it splits the 100 mm evenly and still costs the cook 25 mm of reach at 700, which is the thing
  the owner ruled against."*
- **The hob's principle** declares the clearance in **front** and derives the seat, so every added
  millimetre lands behind.

The owner's third sentence decides it: *"the gap should become bigger behind."* So **"centred" is the
ruling about where the sink sits at the declared default, and "same principle as with hob" is the
rule that carries it to every other depth.** Read that way the two sentences are one instruction and
nothing is discarded — and, as decision 3 shows, centring at 600 is *itself* what buys the rear gap
the owner asked for at 600, which no other reading achieves.

**One thing "centred" is not.** The sink is already centred across the cabinet's **width** —
`ax = 0.28` against a symmetric `w/2`. Nothing in this record moves it sideways.

## Decision

**1. The sink's clearance to the worktop's front edge is the declared fact. Its seat is derived from
it and from the declared cabinet depth, and is never written as a number.**

The hob's rule ([ADR 0087](0087-the-hob-holds-its-reach-and-a-deeper-worktop-grows-behind-it.md)
decision 1), applied one body over:

```
worktopFrontMm     = COUNTER_FORWARD_OFFSET_MM + counterDepthMm / 2
sinkSeatMm         = worktopFrontMm − SINK_FRONT_CLEARANCE_MM − SINK_APERTURE_DEPTH_MM / 2
```

Millimetres, divided once, never metres subtracted — M1's parity gate diffs at 1e-6 m and the metre
form does not survive IEEE-754 (`kitchen-parts.ts:357`).

**2. `SINK_FRONT_CLEARANCE_MM` is 110, and that number *is* "centred at the declared default".**

Its derivation is written beside it, so a reader re-checks it instead of trusting it (the remedy
shape [ADR 0059](0059-the-dishwasher-niche-declares-a-cabinet-depth-floor.md) established and
ADR 0087 reused):

```
SINK_FRONT_CLEARANCE_MM = (counterDepthMm(DEFAULT_CABINET_DEPTH_MM) − SINK_APERTURE_DEPTH_MM) / 2
                        = (620 − 400) / 2
                        = 110
```

At 600 that seats the sink at `330 − 110 − 200 = +20` — **exactly the worktop's centre**, which is
the owner's word. At 700 it seats it at `380 − 110 − 200 = +70`, and the whole 100 mm lands behind.

**3. The 600 mm kitchen moves, by 20 mm, and that is deliberate — this is the one place this record
departs from ADR 0087.**

ADR 0087 held itself to *"nothing moves by a micrometre at 600"* and could, because the hob's
existing literal already satisfied the ruling. **The sink's does not**: the owner asked for a bigger
rear gap, and at 600 the worktop's 620 mm is fully spent — 130 front + 400 aperture + 90 behind, of
which the faucet takes 88. There are **2 mm of slack**. Rear clearance at 600 can only come from
moving the sink forward, and "centred" is precisely the instruction to move it forward by 20 mm.

**This is therefore a deliberate re-baselining of M1's parity gate for `base-sink` and
`base-sink-800`, and it must be recorded as one in the wave's close-out** — not absorbed as a
rounding difference. No other body moves.

**4. What the customer gets, at both depths, stated so the owner can check it against what they
asked for.**

| Local `z`, millimetres | @600 today | **@600 ruled** | @700 today | **@700 ruled** |
| --- | --- | --- | --- | --- |
| sink seat | 0 | **+20** | 0 | **+70** |
| bowl front clearance | 130 | **110** | 180 | **110** |
| bowl back edge to wall | 90 | **110** | 140 | **210** |
| **faucet clearance to the wall** | **2** | **22** | **52** | **122** |

**Both asks are satisfied at both depths, and the answer to "is a bigger rear gap achievable at 600
without moving the front" is no — but the owner's own word for the fix is what supplies it.** At 600
the rear gap grows 2 → 22 mm and the front gives up 20 mm; at 700 it grows 52 → 122 mm and the front
gives up 70 mm against today, all of which is depth the customer only just added.

**5. The worktop cut and the sink assembly move as one, and no literal survives in the depth axis.**

The three `countertop_front` / `countertop_back` / `countertop_side` boxes are drawn from the same
`az` the aperture uses, and the `sink-faucet` builder repeats the aperture as its own `D = 0.4`. All
four must derive from one declared aperture depth and one declared clearance, or the bowl floats over
solid stone. `0.2`, `0.24` and `0.288` must not survive as depth-axis literals in this branch.

**The seat is applied where the assembly is composed onto the cabinet, not inside the builder.**
`builders["sink-faucet"]` is also offered standalone in the parts list (`{ id: "sink-faucet", label:
"Sink + faucet" }`), so a seat baked into the builder would move a body that has no worktop to be
measured against — the same split ADR 0087 decision 3 made for the standalone cooktop.

**6. The sink has a geometric floor of its own, it is 578 mm, and — unlike the hob's — it is *not*
protected by `MIN_CABINET_DEPTH_MM`.**

Derived from the constants, with `d` the cabinet depth:

```
faucetToWallMm(d) = seat − 288 − (worktopFrontMm − counterDepthMm)
                  = d − 578          (ruled)
                  = d / 2 − 298      (today)
```

At `d = 578` the faucet's escutcheon meets the wall plane; below it, the faucet — not the worktop —
becomes the back-most part of its own body, silently changing what that body occupies. The ruled
form **lowers** the floor from today's 596 to 578, so it is an improvement on both counts.

**But 578 is above `MIN_CABINET_DEPTH_MM` (520), which is the opposite of the hob's situation.**
ADR 0087's amendment found the hob's floor at 510 — ten below the declared minimum, so the minimum
protects it. Here the minimum does **not**: a depth of 550 would be legal against
`MIN_CABINET_DEPTH_MM` and would put the faucet through the wall. What protects the sink today is
only that `requireDeclaredCabinetDepthMm` refuses any depth off the declared map, and the map
declares 600 and 700. **Anyone declaring a third depth below 578 must re-read this decision**, and
the sweep in decision 7 is what makes that fail rather than ship.

**7. The gate asserts relations over the declared map, never a table of positions.**

A table of expected mesh positions passes just as well when every number in it is wrong together. The
acceptance criteria, falsifiable:

1. **Over every declared depth**, built through `makeKit({ cabinetDepthMm })`: the bowl's front
   clearance — worktop front edge to aperture front edge, off named meshes — is **identical at every
   depth** and equals `SINK_FRONT_CLEARANCE_MM`. Fails on today's code (130 against 180).
2. **Over every declared depth**: the faucet's rearmost point clears the worktop's back plane by
   `cabinetDepthMm − 578`, and that value is **strictly positive** at every declared depth. Fails on
   today's code at 600 (2 mm, against 22).
3. At 600 specifically, the aperture's centre and the worktop's centre coincide within 1 mm — the
   owner's "centred", as a literal at the one depth it is a ruling about.
4. The aperture's edges and the sink rim coincide within 1 mm **at every declared depth** — no gap,
   no overlap, no bowl over stone.
5. The sink rim is **never** the front-most mesh of its body and the faucet is **never** the
   back-most: `occupiedDepthM("base-sink")` and `baseFinishedDepthMm` are unchanged against `main` at
   every declared depth. This is ADR 0087 decision 5's corollary, and it is what keeps this a
   render-only change.
6. The same holds for the seeded `base-sink-800` **and** for a catalogue-inserted `base-sink` at
   three widths — both go through one `baseCabinet(w, { sink: true })`
   (`decomposed-bodies.ts:89`, `catalog-bodies.ts:105`), and a test covering only the seeded body
   proves nothing about the other.
7. The sweep is over `declaredCabinetDepthsMm()`, not over the literal pair, so a third declared
   depth extends it with no edit — and, per decision 6, a third depth below 578 **fails criterion 2**
   rather than shipping.

**8. Nothing is migrated and no schema version moves.** The sink is a child mesh inside a body the
kit builds at render time; no field of `Design` records it. The body's declared depth and its
recorded seat are unchanged, because the sink stays strictly inside the worktop's envelope at every
depth (criterion 5). This is the same disposition ADR 0087 decision 5 reached and for the same
reason.

## Alternatives considered

- **Front-aligned at the shipped 130 mm**, the literal transposition of the hob's rule with nothing
  moving at 600. **Rejected by the ruling**: it leaves the faucet 2 mm off the wall at 600, which is
  the half of the owner's ask that is *about* 600. It was the recommendation before the owner
  answered, and the owner's answer is what overturns it.
- **Centred at every depth** — the seat is the worktop's centre, `+20` at both. Rejected: it gives
  the front 50 mm at 700 that the owner asked to be given to the back, and it is the option ADR 0087
  rejected for the hob one screen away in the same file. Two appliances on one worktop following
  opposite rules is worse than either rule.
- **Shrink the aperture or the faucet's reach to buy rear clearance without moving the bowl.**
  Rejected on `docs/best-practices/product-invariants.md`: a sink bowl and a mixer tap are bought
  sizes, not cabinetry that scales.
- **Move the faucet forward independently of the bowl.** Rejected: the escutcheon sits on the rim's
  back flange, so the two are one assembly; separating them is a modelling change to satisfy an
  arithmetic constraint, which is backwards.
- **Amend ADR 0087 rather than write a new record.** Rejected, and the reason is decision 3: ADR 0087
  decision 1 holds the 600 mm kitchen still to the micrometre and this ruling deliberately moves it
  by 20 mm. Folding an exception into that record would make its own strongest invariant conditional.
  The two records are cross-referenced instead, and ADR 0087's "left undecided" clause is struck in
  place and pointed here.

## Consequences

- **The wave is `packages/three-adapter` only.** Nothing in the domain moves: the sink sits on the
  worktop, inside the counter's own footprint, so `base-sink`'s `occupiedDepth` declaration and its
  `frameDepthMm` are untouched. No store action, no surface, no stored field.
- **`docs/BACKLOG.md` entry 41 is ruled and closes when the wave ships**, not before. M6-AUD-007's
  remaining open input — *"the alignment choice is no longer open, but its exact 600 mm constant
  still is"* — is answered: 110 mm.
- **ADR 0087's parallel-ruling clause is struck in place** and its consequence about the sink
  *"staying 20 mm rear of its worktop's centre at both depths, which is a coherent rule and may well
  be the right one"* is now decided: it is not, by the owner.
- **The 600 mm re-baseline is the one thing the wave's close-out must state explicitly**, with the
  before/after figures from decision 4, so a parity-gate diff on `base-sink` reads as this decision
  and not as a regression.
- **A stale comment must go with the fix.** `kitchen-parts.ts:903` says *"countertop split around the
  sink aperture (0.70 × 0.36, centred)"* while the code builds 0.56 × 0.40. It is the comment a
  reader would trust when checking the arithmetic above.
- **The hob is untouched and must stay so.** `HOB_FRONT_CLEARANCE_MM` is 10 and this is 110; they are
  different appliances with different reasons and neither number may be derived from the other.
- **A third declared depth is now cheap for the hob and load-bearing for the sink.** Decision 6 is
  the reason: the hob's floor is below the declared minimum and the sink's is above it.
