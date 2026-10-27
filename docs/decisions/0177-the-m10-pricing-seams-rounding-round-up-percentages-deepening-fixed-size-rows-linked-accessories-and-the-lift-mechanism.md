# ADR 0177 — The M10 pricing seams: rounding, round-up, percentages, which cabinets deepen, fixed-size rows, linked accessories and the lift mechanism

Status: Accepted as the architect's rulings recorded by W0; **each is owner-visible and the owner may overrule it** (an overrule changes the named wave). A-19 and A-20 implement the owner's 2026-10-26 answers (OQ-4, OQ-5) on the coordinator's reading; the two flags **OQ-5a** and **OQ-4a** are open. **Nothing is built.**
Date: 2026-10-26
Type: Decision record (pricing seams)
Milestone: M10 — [`M10-price-dashboard.md`](../milestones/M10-price-dashboard.md) §5 and §4; W0

## Context

**Evidence tier.** Doc-quoted from the M10 plan: §5 (A-1 to A-8, A-19, A-20), §4 (S-6 to S-14, S-24, S-28 to S-30), §6.1
(the owner's 2026-10-26 rulings). The plan cites source at `3d4d892a` (for example `price-book.ts:13,15`,
`hardware-mechanisms.ts:27-29,36-46`, `cabinet-depth-rule.ts:57-60,134-140`); the scribe did not re-read those files and
ran nothing. Owner words are quoted as relayed by the coordinator, not as a verbatim transcript. Each A-row's reasoning
is **[inf]**. Mockup facts cite the frame id and the plan's line (`L<n>` in the `x-dc` script of
`Lemnaria Dashboard.dc.html`).

**No amount or percentage here is approved.** That includes 15 %, +30/35 %, +70 %, every anchor, step and hardware rate
(ADR 0001 decision 4; ADR 0100 decision 2). Every criterion that touches money asserts a rule, never a magnitude.

[ADR 0175](0175-a-cabinet-is-priced-by-an-anchor-at-its-default-width-plus-steps-widths-and-heights-round-up-to-50-mm-and-prices-round-to-10-lei.md)
left four seams open for the architect: which amount rounds to 10 lei, whether the door count follows the actual or the
rounded width, the height rounding, and the parser bound. The owner's answers of 2026-10-26 add a priced lift mechanism
(OQ-5), a lift door's hinge count (OQ-5, OQ-5a), linked accessories (OQ-4, OQ-4a) and the door count (OQ-6).

## Decisions

### A-1 — The rounding seam and the decomposition

Within one cabinet *i*: `b_i` is its exact priced amount (anchor and steps, or its size price); `m` the material
percentage; `d_i` the depth percentage if the cabinet deepens (A-6), otherwise 0; `r10(x)` rounds half-up to a multiple
of 1 000 bani, in integer arithmetic only. Three stages round:

| Stage | Formula |
| --- | --- |
| `c_i` | `r10(b_i)` |
| `cm_i` | `r10(b_i × (100 + m) / 100)` |
| `cmd_i` | `r10(b_i × (100 + m) × (100 + d_i) / 10 000)` |

| Line | Amount |
| --- | --- |
| cabinet line *i* | `c_i` |
| Material line | `Σ (cm_i − c_i)` |
| Depth line ("Adâncime 700 mm") | `Σ (cmd_i − cm_i)` |
| Hardware line | `r10(exact hardware)` |
| Each accessory line | `r10(exact amount)` |

- Every line is a multiple of 1 000 bani and the total is exactly the sum of the lines. One cabinet's three parts sum to
  `r10` of its exact combined price, which is what the D3 preview cell shows.
- The cross term `m × d` lands in the depth line. The material line is `m %` of the PAL cabinets **up to the per-cabinet
  10-lei rounding**; it is never asserted equal to `r10(m % × Σ b_i)`.
- **The mockup is internally inconsistent and is recorded rather than copied.** Frame C3 splits the lines additively
  (material on the PAL cabinets, depth also on the PAL cabinets, no cross term; 38 200 + 13 370 + 5 270 + 1 900 + 1 000
  = 59 740 [mock L784]). Frame D3's preview and ADR 0100's Amendment multiply (1 500 × 1.15 × 1.35 [mock L512]). This
  ruling governs and implements multiplication; **C3's figures are illustrative**.
- **A depth line exists if and only if** the design's depth is 700 and at least one manufacturer-supplied cabinet deepens.
  At 0 % it renders *inclus*. There is no depth line at 600.
- Rejected: per-line rounding of summed exact amounts (the preview and the customer's lines would disagree for one
  cabinet); rounding only the total (the lines would not add up); no rounding in the domain with presentation rounding
  (the breakdown would not add up).
- This **reverses "only presentation may round" (`price-book.ts:15`) at one named seam**, and settles ADR 0175
  decision 5's open seam and backlog 284. S-7 and S-11: the depth percentage multiplies the cabinet's **priced amount**
  (which already reflects round-up); "real width" in ADR 0100's Amendment is read as "the cabinet's own width, not the
  anchor width".

### A-2 — Round up

- Width: `w' = ⌈w / 50⌉ × 50`. With `k = (w' − anchorWidthMm) / 50`: when `k > 0` the price is `anchor + k × plusStep`;
  when `k < 0` it is `anchor − |k| × minusStep`.
- Height: `h' = ⌈h / 50⌉ × 50`, and the height term is `((h' − anchorHeightMm) / 50) × heightStep`, signed.
- `anchorWidthMm` and `anchorHeightMm` are **book data** on the formula, so the formula needs no catalogue. A book ×
  catalogue judgement (M2) keeps `anchorWidthMm` equal to the catalogue's declared default width.

### A-3 — Door count follows the actual built width (owner, OQ-6, 2026-10-26: "count the doors as it really has", relayed)

The door term is `(leaves(actualWidth) − leaves(anchorWidth)) × perExtraDoorLeaf`, signed. **Why [inf]:** ADR 0068
requires the carcass door step and the hardware hinge count to count leaves the same way, and hardware counts the built
body. The mockup's `base()` and `hwOf()` count at the rounded width [mock L510-511]; that would bill hinges on a door
that does not exist (a 480 mm body rounds to 500). This settles ADR 0175's first open question.

### A-4 — `PRICE_STEP_MM = 50`

Declared in `pricing/` as a pricing unit ("+ lei per 50 mm"), never imported or derived from the catalogue's width-step
constant (S-6). The comment at `price-book.ts:12-13` ("a body built at 575 is priced at 575") is rewritten in P1; the
seam test `pricing-seams.test.ts` is amended **by QA** to forbid importing the catalogue constant.

### A-5 — Percentages are whole numbers

- Depth: 0 to 100 (frame D2E [mock L852]). Material: 0 to `MAX_MATERIAL_PERCENT` = 200 **[inf; an architect's bound, not
  a business figure]**; PAL is fixed at 0. Negative values are refused.
- `MAX_PRICE_COEFFICIENT_MINOR` is **re-derived, not widened** (S-10): `Σ over MAX_PLACEMENTS cabinets of
  b_i × (100 + 200) × (100 + 100)` must stay a safe integer. The derivation is code over named constants and a test pins
  that the worst case is exact.
- **Re-ruled 2026-10-26 (P2):** the coefficient bound stays at the flat-form value for every book form; each cabinet's
  exact amount is capped at `MAX_CABINET_AMOUNT_MINOR = floor(MAX_SAFE_INTEGER / (MAX_PLACEMENTS × (100 +
  MAX_MATERIAL_PERCENT) × (100 + MAX_DEPTH_PERCENT)))`, derived in code and refused `INVALID_AMOUNT` above it; publish
  refuses any price above the cap. (The "A-7b" the coordinator cited is the M10 plan's §5 A-7b, "no buildable body may
  price at or below zero", ruled 2026-10-26 in the P1 review. It is a sibling publish check and is **not** a section of
  this record; the above-cap refusal is the P2 re-ruling's own.)

### A-6 — Which cabinets deepen

"Deepens" is a **measured** catalogue fact: the priced-as row's finished depth in the catalogue at 700 is greater than in
the catalogue at 600. It is never keyed on `depthFollowsSetting()` (which answers `true` for the wall corner returns
[plan S-12, citing `cabinet-depth-rule.ts:57-60,134-140`]), on a band or on a list of ids. Customer-supplied rows never
take the uplift. A parity test over every catalogue row asserts the set. ~~The ruling's expected set: base, tall, hob, sink
and the base corners deepen; wall rows and the wall corners do not (frame D3 draws wall corners at 320/320 [mock
L500-503]).~~ **Superseded 2026-10-26 by the owner's ruling below:** the measurement showed wall rows and wall corners
deepen (330 → 400), and frame D3's 320/320 is not what the catalogue measures. The expected set is now every
manufacturer-supplied row that measures deeper. **If the measurement disagrees with the expected set for any row, the wave
stops and reports; it edits neither side.**

**Owner ruling 2026-10-26: "Surcharge every deeper cabinet."** The measurement governs: every manufacturer-supplied row
whose priced-as row measures deeper takes the depth percentage, wall rows and wall corners included (330 → 400). The rule
is per priced-as row, so lifted-column tops that price as `wall-cabinet` take it too. The deepening set is computed by
`measureDeepeningRows(catalogAtShallow, catalogAtDeep)` and passed to `priceDesign` as `deepeningRows`. This supersedes
the "expected set" sentence above, which excluded wall rows and wall corners.

### A-7 — Fixed-size rows

`price-per-size` is priced at the smallest listed size ≥ the body's width (round up, as A-2). A width above every listed
size is refused with a new code, `NO_PRICE_FOR_SIZE`; it is never priced at 0 and never at the nearest size.

**Amendment 2026-10-27 (coordinator, relayed; the scribe ran nothing):** the six structural corner rules are
`price-per-size` with one entry keyed at the round-up of their built width to 50 mm (320 → 350, 570 → 600, 900 → 900; plan
P3-Q4, 2026-10-27), because per-size keys are on the 50 mm grid and the lookup rounds the body's width up first. Each built
body's price is unchanged, and frame D3G shows the built width.

### A-8 — Material ordering (settles S-5)

The book's `material.defaultTierId` is the **pricing fallback**, fixed at the PAL reference. With percentages whole and
≥ 0, PAL at 0 % is always cheapest, so the material group's `"refuse"` rule (ADR 0092 decision 12; `NegativeTierDeltaError`)
stays a genuine book fault. **That holds only together with A-9** ([ADR 0178](0178-the-m10-dashboard-storage-lifecycle-defaults-notice-seen-and-digest.md)):
the D9 new-kitchen default is a separate concept that never reaches the delta baseline.

### A-19 — Linked accessories (OQ-4; **the coordinator's reading, flagged OQ-4a**)

The owner, as relayed: "keep this link between accessory and a type of cabinet, and now we need only the functionality
of adding this link between them on creating a new accessory." **The reading that creating a new accessory linked to a
cabinet type is in scope is the coordinator's inference, not the owner's words.**

- The book gains `linkedAccessories: LinkedAccessoryRule[]`: `accessoryId`, `ruleId`, `linkedBuildId`, `perUnitMinor`,
  an authored Romanian `name` and an optional `description` (A-21 in ADR 0178).
- **Earning:** one unit per placement whose priced-as row (`resolveCatalogEquivalent`, as cabinet rules use) equals
  `linkedBuildId`. Quantity 0 means no line, as for the built-ins (`price-design.ts:646-653`).
- **Which rows may be linked:** any catalogue row the book prices that the manufacturer supplies. Customer-supplied rows
  (hood, free-standing fridge) are excluded. A link to a row the catalogue does not hold is refused by
  `judgeBookAgainstCatalog` (M4). Owner-visible.
- The two built-ins (`sinkProtectiveCover`, `dishDryingRack`) stay named fields with their code-defined earning rules
  (ADR 0070 decision 4), unchanged; D6 shows each link read-only (frame D6A shows the rack as "Dulap pentru chiuvetă ·
  câte 1" [mock L710]).
- Lines: `accessory:<accessoryId>`, after the built-ins, in book order, each rounded per A-1.
- **S-28, intent preserved and not overturned:** ADR 0062 seam 1 says an array "would let a book declare one nothing
  implements". The list holds rows of **one** implemented earning shape, so no entry can declare behaviour the code lacks.
- **If the owner meant only "show the existing link"**, P4b, M4 and U4c are dropped (OQ-4a).

### A-20 — The lift mechanism and the lift door's hinges (OQ-5; OQ-5a flagged)

The owner, as relayed: "you need to add pricing for lift up mechanisms, and every lift up have at least two hinges. But
if the door is wide, I think more than 500, let's say, there should be already three hinges. So everything should be
priced."

- `HardwareTier.perLiftMinor` is a fourth per-tier rate and `HardwareMechanismCounts.lifts` a fourth count (frame D4,
  "Mecanism rabatabil" [mock L689-690]). This supersedes ADR 0092 decision 8's "knowingly unpriced" lift arm and the
  "no fourth mechanism" of ADR 0070 decision 1 and `hardware-mechanisms.ts:27-29` (S-13, S-29).
- A **lift-up door** is a **declared** front property in the catalogue (`liftUp: true`), never keyed on a build id (ADR
  0068's population lesson). Each lift-up door counts **1 lift** and **2 hinges, or 3 when the door is wider than 500 mm**.
  For a lift-up door this width rule **replaces** the "taller than 900" height rule (S-30).
- **OQ-5a (open flag, blocks nothing): the boundary is built strict, `> 500`.** Reasons [inf]: the owner's words are "more
  than 500", and the existing height rule is strict (`hardware-mechanisms.ts:36-46`, "a 900 mm leaf takes two"). The
  door-**count** threshold is ≥ 500, so a 500 mm lift door has 2 hinges while a 500 mm hinged cabinet gets its second
  leaf. If the owner says "from 500", it is one comparison and its boundary test in P5.
- P5 first enumerates every front the catalogue declares as a lift or flap (`front-population.ts:67` mentions "the top
  box's flap"). **Only `wall-lift` is declared lift-up unless the owner names another**; any other candidate is reported,
  not priced. The `wall-lift` comment "lift mechanisms are out of ADR 0070's scope (decision 6)" (`catalog.ts:593-594`) and
  the `hardware-mechanisms.ts:27-29` comment are rewritten in P5.
- The ADR 0092 Amendment C quantifier for Hettich below Standard gains a lift term, derived from the declared rates and
  never restated.

### Other rows settled here

- **S-24:** no "current version" fallback inside pricing (`docs/CONFIGURATION_MODEL.md`, via ADR 0062 seam 3). Behaviour
  with no active version is ruled in ADR 0178 A-10.
- **S-25, S-26:** ADR 0035 decision 8 is carved out only for fixed-size rows (already in ADR 0175); the sample book stays
  invented and provisional (ADR 0001 decision 4). No change.
- **S-9 (height rounding):** ruled as A-2; owner-visible, not blocking.

## Alternatives considered

Stated beside each ruling above. Against the 2026-10-25 recommendations (M10 plan §6.1): OQ-4 reversed the
recommendation to defer adding accessories; OQ-5 priced the lift as recommended and ruled the hinge count; OQ-6 chose the
actual width.

## Consequences

- Waves P1 (anchored shapes, A-2 to A-4, A-7), P2 (percentages and the rounding seam, A-1, A-5), P3 (cut-over, A-8, A-6's
  parity test), P4b (A-19) and P5 (A-20) implement this record. Nothing is built.
- The cut-over retires `wholeKitchenMinor` (ADR 0092 Amendment of 2026-10-25) and the old linear formula shapes.
- Dated notes on ADRs 0068, 0070, 0092, 0100 and 0175 point here.
- Owner answers to OQ-5a and OQ-4a are recorded below as dated amendments.
