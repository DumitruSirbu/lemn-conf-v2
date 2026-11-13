# ADR 0070 — Hardware is priced per mechanism, not per handle, and the tiers are named suppliers

Status: Accepted
Date: 2026-09-04
Type: Decision
Milestone: M6 — closes the open question at wave 6G on what a hardware tier counts

## Context

Wave 6G shipped with an open question, recorded both at the wave and in the milestone's *Open
questions gating this phase*: **what does a hardware tier count when it prices hinges and
slides — leaves, bands, or cabinets — and is `deriveDoorCount` the right source?**
[ADR 0068](0068-price-steps-at-the-door-count-and-follows-height.md) put a second consumer on the
same count and warned the two must not disagree.

What shipped in the meantime is narrower than the question. `HardwareTier.perCabinetHandleMinor`
(`price-book.ts`) prices the tier **per cabinet handle** — the same quantity
[ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) decision 2 declared
for the handle line itself, reused rather than answered separately. That was a placeholder, not a
ruling on hinges and slides; no wave decided hardware should be priced by counting handles.

The owner priced the question directly on 2026-09-04, gathering retail figures from two Chișinău
suppliers (recorded here as **dask-centru** and **sebas** — supplier price sheets held outside this
repository, not files in it) and pricing the seeded kitchen at each of three tiers.

## Decision

**1. Hardware is priced per mechanism, and there are three kinds of mechanism — never per handle.**

- **Hinges** — 2 per door leaf, and **3 when the door is taller than 900 mm**.
- **Drawer runners** — 2 mechanisms per drawer. The drawer's *size* does not change the mechanism
  count; the drawer *count* does — a 2-drawer cabinet is cheaper than a 3-drawer one on this line.
- **Push-to-open** — 1 mechanism per door and per drawer, and only where the cabinet has no handle
  (`handle: "push"`).

A handle and a mechanism are different cost drivers, which is exactly what
[ADR 0068](0068-price-steps-at-the-door-count-and-follows-height.md) already named for the
door-count step: a handle, a set of hinges or slides, and a processing margin are three different
things, priced in three different places. The hardware tier prices the middle one.

**2. A corner cabinet carries one handle per level**, never one per opening. A corner is sometimes
built with two openings and would then carry two handles counted naively; the product stays at one
per level, matching the existing structural treatment of corner bodies
([ADR 0021](0021-corner-returns-are-structural-in-data.md),
[ADR 0025](0025-the-corner-base-legs-seat-on-the-l-joint.md)).

**3. The three tiers are DTC Standard, Blum and Hettich.** **DTC Standard has no soft-close** —
this is a functional difference the customer feels on every door, not only a price difference, and
the tier's description must say so rather than reading as a cheaper version of the same mechanism.

**4. Two sink-specific extras, both retail-priced, both out of the customer's choice.**

- An **aluminium protective cover** against humidity and leaks, mounted on the sink base:
  **≈200 MDL**. Always present — it is protection, not an option, so it is never toggled off.
- A **dish drying rack** above the sink: **≈400 MDL**. **Not drawn in 3D, and must not be** —
  the geometry stays untouched; this is a price line with no mesh. Included by default where a wall
  cabinet sits above the sink. Making it selectable is a later wave's work, not this decision's.
- **The rack's position is a derived fact, not a catalogue row.** Measured on the seeded design: the
  sink base is on wall A, spanning along-wall 900–1700, and **two** cabinets sit exactly above it — a
  wall cabinet at `y0` 1500 and a top box at `y0` 2200. The rule is therefore **the lowest wall-band
  cabinet whose along-wall extent overlaps the sink's span** — not "any cabinet above the sink", which
  would double-bill both, and not "the highest", which would land the rack near the ceiling.

**5. Prices are retail.** The amounts below are shelf prices at Chișinău suppliers; margin sits on
top of them and is not part of this record.

**6. Out of scope, recorded so it is not rediscovered.** Bi-fold doors that open vertically as a pair
are limited to particular brands' mechanisms (Blum among them). No such cabinet exists in the
catalogue, and the owner put the mechanism out of scope rather than picking a brand for a product
that is not built.

## The measured prices — provisional sample amounts, not commercial figures

All Chișinău retail, gathered 2026-09-04. Sources: **dask-centru**, **sebas**. **Blum was
cross-checked across both suppliers and agreed within 3%** (74.00 vs 76.00 MDL) — the only figure
here with two independent sources.

Hinges, standard applied, soft-close, mounting plate included:

| Tier | Price per hinge (MDL) |
| --- | --- |
| DTC Standard (**no soft-close**) | 17.00–18.20 |
| DTC PRO soft-close | 41.00–43.00 |
| Blum Clip Top Blumotion | 74.00–76.00 |
| Hettich Sensys | 85.00 |

Drawers, per drawer:

| Tier | Price per drawer (MDL) |
| --- | --- |
| DTC concealed 3D full-extension runners | 305–465 |
| DTC Tandembox-style complete box | 640 |
| Hettich Quadro V6 full extension | 600–652 |
| Blum undermount full-extension runners | 576–836 |
| Blum Tandembox M complete box | 837 |

**Accepted, not resolved: Hettich's drawer figure is understated.** Quadro V6 is **runners only**,
while the DTC and Blum figures above are complete boxes — box sides included. The Hettich number is
therefore missing a cost the other two carry. The owner's ruling was explicit — *"for Hettich use it
as it is"* — so this is a known, accepted imprecision in the sample data, not an oversight to fix
before recording it.

## Why this justifies wave 6G's design over a flat per-tier figure

Priced on the seeded kitchen — **74 hinges, 5 drawers**, derived from the real catalogue and the
builders' own door-band heights:

| Tier | Hinges | Drawers | Sink extras | Total |
| --- | --- | --- | --- | --- |
| DTC Standard | 1 300 | 3 200 | 600 | ~5 100 MDL |
| Hettich | 6 290 | 3 130 | 600 | ~10 020 MDL |
| Blum | 5 550 | 4 185 | 600 | ~10 335 MDL |

**Hettich is the dearer tier on hinges and the cheaper one on drawers, so it lands 3% below Blum
rather than between Blum and DTC.** This kitchen is hinge-dominated — 74 hinges against 5 drawers —
and a drawer-heavy kitchen would swap the two tiers' order. That is a direct, measured argument for
wave 6G's design: price the whole design at each tier, rather than a flat per-tier figure that would
be quietly wrong for any kitchen whose door/drawer mix differs from the one it was calibrated on.

## What the code cannot do yet — the implementation gap this decision leaves open

Verified against the tree on 2026-09-04, not inherited from the brief that proposed them:

- **`carriesHandles(n)` is one number for two different things.** `base-3drawer` declares
  `carriesHandles(3)` and `base-sink` declares `carriesHandles(2)` (`catalog.ts`), and nothing in the
  declaration distinguishes a door leaf from a drawer. Decision 1 needs the two counted separately —
  hinges by door leaf, runners by drawer — so this field must split into a door count and a drawer
  count before the hinge and runner rules can be built.
- **Door height is unreachable from the domain, which is where pricing lives** (§12: the domain has
  no meshes). Confirmed: no catalogue entry in `catalog.ts` declares a per-band door height, and
  `heightMm` where it exists is the placement's overall frame height, not a door band's. The 900 mm
  rule needs the band heights, and those are hard-coded in the adapter's builder —
  `packages/three-adapter/src/kitchen-parts.ts:1905`'s `tallPantry` declares door bands of **1290 mm
  and 790 mm**, while the body's own frame height is 2200. A naive read of the frame height would put
  3 hinges on a 790 mm door. Door band heights must become a declared catalogue fact, exactly as
  [ADR 0061](0061-a-cabinet-handle-is-declared-and-an-appliance-bar-is-not-one.md) made handle counts
  declared rather than counted from meshes, with the same kind of three-adapter parity gate holding
  the declaration to what the builder actually draws.
- **A third gap, found while verifying the above two: the shipped hardware tier's own quantity basis
  is now superseded by decision 1.** `HardwareTier.perCabinetHandleMinor` and
  `perCabinetHandleAmount` (`price-book.ts`, `price-design.ts`) price the tier by multiplying a rate
  by the **cabinet handle count** — the same count ADR 0061 decision 2 declared for the handle line.
  That was 6G's placeholder answer to the open question this record closes, and decision 1 answers it
  differently: hardware has no per-handle relationship at all once push-to-open cabinets exist, since
  a push-to-open door carries a mechanism and no handle. Whichever wave implements this decision
  replaces the book's hardware shape — quantity basis, tier data and the query's read of it move
  together, not independently.

None of this is scheduled by this record. It is left here so the wave that builds decision 1 does not
rediscover it, in the same spirit `docs/BACKLOG.md`'s entries are recorded before they are worked.

## Alternatives considered

- **Keep pricing hardware per cabinet handle**, extending 6G's shipped shape. Rejected by the owner's
  own reasoning: a handle, a door mechanism and a processing margin are three different cost drivers
  (also the premise of [ADR 0068](0068-price-steps-at-the-door-count-and-follows-height.md)), and a
  push-to-open cabinet has mechanisms with no handle to count them against.
- **A flat per-kitchen delta per tier**, independent of the actual door/drawer mix. Rejected — the
  measured table above shows it would rank Hettich and Blum in the wrong order for any kitchen whose
  mix differs from the seeded one.
- **Exclude or re-derive the Hettich drawer figure** to make it comparable to the complete-box prices.
  Rejected — the owner accepted the imprecision explicitly rather than asking for a corrected number.
- **A selectable dish rack**, since it is priced but not drawn. Rejected for this phase — the owner
  scoped it as included-by-default now, selectable later.

## Consequences

- The M6 milestone's *Open questions gating this phase* entry on the hardware tier's counting basis
  is marked answered by this record.
- Wave 6G's per-design, measured-delta approach is now justified with real magnitudes, not only
  defended in principle against a flat figure.
- Two catalogue-declaration gaps are recorded as owed to whichever wave implements this decision:
  splitting `carriesHandles` into door and drawer counts, and declaring per-band door heights with a
  parity gate. Neither is scheduled here.
- The shipped `HardwareTier.perCabinetHandleMinor` shape no longer matches the pricing model this
  record states and must be replaced, not extended, by the implementing wave.
- No commercial figure is asserted anywhere by this record. The tables above are sample amounts from
  named suppliers, gathered outside the shipped price book, and must not be typed into
  `sample-price-book.ts` without the wave that also rebuilds the quantity basis they depend on
  ([ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md)).
- The bi-fold vertical-opening mechanism stays out of the catalogue and out of scope; recorded so a
  later session does not open it looking for a decision that was never asked for.

## Amendment — 2026-10-26: a fourth mechanism (lift), and linked accessories beside the two built-ins

**Evidence tier: owner answers of 2026-10-26, coordinator-relayed (words as relayed, not a verbatim transcript);
doc-quoted from `docs/milestones/M10-price-dashboard.md` §4 (S-14, S-29, S-30) and §5 (A-19, A-20). Nothing is built.**

- **Decision 1 ("three kinds of mechanism") and decision 6 (vertical-opening mechanisms out of scope): superseded for the
  lift-up door.** Owner (OQ-5): "you need to add pricing for lift up mechanisms, and every lift up have at least two
  hinges. But if the door is wide, I think more than 500, let's say, there should be already three hinges." A lift
  mechanism is a **fourth** per-tier rate; a lift-up door counts one lift and 2 hinges, or 3 when wider than 500 mm (the
  hinge rule above, "taller than 900", does not apply to it). The boundary is built strict; OQ-5a is an open owner flag.
  The **bi-fold pair** that opens vertically stays out of scope: this amendment prices the lift-up door the catalogue
  declares, not that product. Record: [ADR 0177](0177-the-m10-pricing-seams-rounding-round-up-percentages-deepening-fixed-size-rows-linked-accessories-and-the-lift-mechanism.md) A-20.
- **Decision 4 (two sink-specific extras): extended.** The two extras keep their code-defined rules, unchanged and still
  not selectable. Beside them the book gains **linked accessories**: a manufacturer-created accessory linked to a
  cabinet type, one unit per placement of that type (owner OQ-4: "keep this link between accessory and a type of
  cabinet … on creating a new accessory"). That creating one is in scope is the coordinator's reading, **flagged OQ-4a**.
  ADR 0177 A-19.
- The amounts in this record remain sample amounts and are not approved.
