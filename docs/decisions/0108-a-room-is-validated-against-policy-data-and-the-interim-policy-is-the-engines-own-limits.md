# ADR 0108 — A room is validated against policy data, and until the owner rules, the policy is the engine's own limits

Status: Accepted (**Amendment A, 2026-09-11** — the L wall minima hold the corner at every declared
cabinet depth, so wall B's is 1000, not 900; **Amendment B, 2026-09-11** — the owner approved the L
bounds: wall A 900–6300, wall B 1000–5100, ceiling 2200–3900, held as product data inside the
engine's limits; **Amendment C, 2026-09-11** — a coupled two-wall rule: the room must hold a sink and a hob, measured against the owner's *"900 ... 1500 ... ideally 2000"*; see the end; **Amendment D, 2026-09-11** — the owner approved straight walls 1200–6300 mm and ruled the coupled rule (F1, F6); **Amendment E, 2026-09-12** — the generated target is a 600 mm sink plus a 600 mm hob, correcting only C/D's derived 1160/2160 figures; manual 560 mm sinks remain legal; **Amendment F, 2026-09-18** — Amendment A ruling 1 is narrowed to the corner's floor widths at a `(depth, room)` argument, not the reference-sized far edge at a depth alone, and the approved 900/1000 are recorded as [ADR 0125](0125-the-corner-minima-stay-at-900-and-1000-as-a-deliberate-margin-above-what-the-engine-needs.md)'s deliberate margin above the derived 880/880 floor; **2026-09-21, decision 4's unit — see [ADR 0126](0126-the-rooms-lengths-are-typed-in-whole-millimetres.md)** — decision 4's rule (whole millimetres, parsed once at the form boundary, on the digit string) stands; only the displayed unit the parser reads changes, from metres to millimetres, by owner ruling, in wave 7F2 slice S1b; **Amendment G, 2026-09-24** — one maximum for every wall: a straight wall is 1200–6000 mm, superseding Amendment D's 6300, on the owner's Q-7J-1 ruling and wave 7J's measurement)
Date: 2026-09-11
Type: Decision
Milestone: M7 — wave 7A (architect's plan, `docs/milestones/M7-room-and-presets.md`)

## Context

M7 is the first phase in which a customer types the room. Frames 1B/1C and D1B/D1C ask for one
length per wall of the chosen shape plus the room height, and 1C refuses a value *"mai scurt decât
putem susține"* — with the reason and **without the limit**, because the limits are unapproved data.
The minimum and maximum wall lengths and room heights have been an open product question since
[ADR 0003](0003-design-reference-supersession.md)'s *Open questions* item 1 and
`docs/PRODUCT_REQUIREMENTS.md`'s *Remaining product data decisions* item 1. The M7 plan's *Risks*
section names the failure to avoid: *inventing a bound to make validation implementable*.

What the code already bounds, measured at `995ad03`:

- **The wire schema bounds the room a document may declare** — `MAX_ROOM_WIDTH_MM`,
  `MAX_ROOM_DEPTH_MM`, `MAX_ROOM_HEIGHT_MM` = 6300, 5100 and 3900 mm
  (`packages/configurator-domain/src/design-bounds.ts:36-38`), each the reference scene shell ×1.5.
  They are storage limits (review finding F2), not product rules, and `MAX_PLACEMENTS` and
  `MAX_DESIGN_BYTES` are derived from them (`design-bounds.ts:90-94`, `:192-196`).
- **Wall A's run is the room's `widthMm`, wall B's is its `depthMm`** — `wallLengthMm`
  (`queries/overflowing-placements.ts:45-50`), the one mapping ADR 0065 decision 5 fixes.
- **The L has exactly one corner assembly and it is structural** (ADR 0021): `base-corner-x-900` at
  wall A 0–900, and `base-corner-return-320`, `wall-corner-return-570` and
  `wall-corner-return-570-top` all ending at 900 on wall B
  (`fixtures/kitchen-l-design.ts:917-918, 923, 935`) ~~. An L wall shorter than that cannot hold its own
  corner.~~ **— at the fixture's 600 mm depth only.** *Corrected by Amendment A:* at 700 mm the three
  wall-B pieces stand at 680–1000 and 400–970, and wall A's is unchanged.
- **The lowest module line a cabinet stands under is 0.86 m** — `LEVELS[0]`
  (`module-grid.ts:16-20`).

## Decision

**1. One validator, and the policy is a parameter.** `validateRoomInput(input, policy)` in
`packages/configurator-domain`, pure and I/O-free. The policy is handed in, the way
[ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) decision 1
makes the price book *"a parameter, not an import"*; one composition root in `apps/web` imports the
policy the product runs on.

**2. The shape is judged first and alone.** A shape the policy does not list as buildable returns
exactly one issue, `SHAPE_NOT_BUILDABLE`, whatever the dimensions say — the plan's *"refused at this
screen with a human reason before any preset work begins"*. Otherwise every field is judged and
every issue is returned, in field order, so each field can carry its own reason.

**3. An issue is a field and a code, and nothing else — in particular, no number.** The mockups'
rule is that no limit is shown; the reliable way to keep that true is for the surface never to be
handed the limit. A refusal that carried `{ minMm }` would be one careless ICU argument away from
printing an unapproved bound. This is [ADR 0095](0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md)
decision 3 (codes, not sentences) with its parameters deliberately empty.

**4. Millimetres are whole or refused.** Parsing the displayed metres (*"3,60"*) is a form-boundary
job in `apps/web`, done once, on the digit string rather than by multiplying a float; the domain
re-checks integrality and refuses a non-integral value rather than rounding it
(`docs/best-practices/product-invariants.md`). The domain stays locale-free (ADR 0095 decision 3).

**5. Corner direction is carried and never read by validation.** The frames say *"nu se deduce din
lățimi"*. Flipping the direction cannot change any issue, and a valid room does not yet carry a
direction — what the direction does to the 3D kitchen is an open owner question (M7 plan, *Owner
questions*, Q6).

> **Note, 2026-09-23 — Q6 is answered.** The owner ruled on 2026-09-11 that a right-hand corner is
> the mirror image of the left-hand kitchen, and
> [ADR 0129](0129-a-right-hand-l-is-the-left-hand-design-drawn-in-a-reflection-and-the-reflection-is-a-per-group-primitive.md)
> (Proposed with wave 7I's plan) records what that means. *"Never read by validation"* stands; a
> valid room now **carries** the direction when it is right (ADR 0129 decisions 2–3).

**6. Until the owner rules, the policy is the engine's own limits, and it says so.** Each bound is
**derived at module load from an existing constant, never written as a literal**, and the policy
carries `approval: "interim-unapproved"`:

| Bound | Interim value | Source |
| --- | --- | --- |
| Buildable shapes | L only | the plan's scope; the engine has walls A and B only (`room-transforms.ts:34-49`) |
| L wall A minimum | 900 | far edge of the corner assembly on wall A (`p25`) — **at every declared depth (Amendment A)** |
| L wall B minimum | ~~900~~ **1000** | far edge of the corner assembly on wall B (`p26`, `p9`, `p21`) — **the largest over every declared depth, reached at 700 by `p26` (Amendment A)** |
| Wall A maximum | 6300 | `MAX_ROOM_WIDTH_MM` |
| Wall B maximum | 5100 | `MAX_ROOM_DEPTH_MM` |
| Height minimum | 860 | `LEVELS[0]`'s top — below it no cabinet stands at all |
| Height maximum | 3900 | `MAX_ROOM_HEIGHT_MM` |

**None of these is a product bound, and no surface, commit or record may call one approved.** The
owner's answer replaces the values as data; the mechanism does not move.

**7. An approved maximum may not exceed what a design can store.** A test holds every policy maximum
at or below the wire bound for the same axis. An owner maximum above 6300 / 5100 / 3900 therefore
lands as a deliberate change to `design-bounds.ts` — which moves `MAX_PLACEMENTS` and
`MAX_DESIGN_BYTES` with it — and never as a policy value the write seam then refuses.

**8. A valid L input maps onto the existing `DesignRoom`** — `{ shape: "L", widthMm: A, depthMm: B,
heightMm }` — through the same mapping `wallLengthMm` reads. No schema change.

## Alternatives considered

- **Use the mockup's example values, or pick plausible numbers.** Refused by name in the plan's
  *Risks*. The mockup's 3.60 × 2.40 × 2.60 is an example, and 0.45 m is the illustration of a
  refusal, not a threshold.
- **No minimum at all beyond positivity.** Honest, but it leaves the engine to build an L whose wall
  is shorter than its only corner assembly, which needs a blind-corner rule nobody has ruled. The
  derived interim keeps the engine inside what it can build without deciding anything for the owner.
- **Put the product bounds into `DesignRoomSchema`.** Rejected. The wire schema is what a stored
  document is *read* against, so a product bound there turns a later owner change — raising a
  minimum — into stored designs that no longer load: [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md)'s
  dead link. Product bounds judge what a customer may *enter*; storage bounds judge what a document
  may *say*. They stay separate, and decision 7 is the one link between them.
- **Parse the localised number in the domain.** Rejected: ADR 0095 decision 3 keeps the domain
  locale-free, and the decimal separator is presentation.
- **Stop at the first issue.** Rejected: frame 1C marks the field in error and leaves the others
  alone, which needs the whole list.

## Consequences

- The 1C state is reachable in the product today only for a wall below its corner assembly, a height
  below the base row, a value above storage, and non-numeric or non-whole input. That is the interim,
  stated; the owner's bounds make it the product's.
- The approval flag is load-bearing: the M7 plan's close-out cannot claim the room bounds as settled
  while it reads `interim-unapproved`.
- A later owner answer is a data edit plus the boundary tests that read the policy — no validator
  change.

## Decision-record sweep

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0003](0003-design-reference-supersession.md) *Open questions* 1 | Room bounds are unapproved; 1C shows the reason without the limit. | **Followed.** The mechanism ships; the numbers stay the owner's (decision 6). |
| [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | A load that refuses is a dead link. | **Why product bounds stay out of the wire schema** (alternatives). |
| [0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decisions 4–5, [0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) | The fit bound is each wall's own run and one-sided; leftover wall is normal. | **Untouched.** A room minimum is not a fit rule and says nothing about leftover wall. |
| [0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) decision 2 | The room is customer input and never a function of the depth setting. | **Followed.** Validation reads no depth. |
| [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 5b, [0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) | The 3600 × 2400 room correction is keyed at schema version ≤ 2, *"before M7 there is no room control"*. | **Consistent.** M7 writes the current version, so a customer who enters 3600 × 2400 is never corrected; wave 7E2 carries the adversarial test. |
| [0095](0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md) decision 3 | The domain publishes codes and parameters, never sentences. | **Followed, parameters deliberately empty** (decision 3). |
| `design-bounds.ts` review finding F2 | The room a document may declare is bounded so containment means something. | **Kept as the storage ceiling**; decision 7 ties policy maxima to it. |

## Amendment A — 2026-09-11: a wall minimum holds the corner at every declared depth, so wall B's is 1000

**Found by wave 7A's adversarial QA (finding Q1.1), classified as a contract gap** — not an
implementation defect, because the implementation derives the minima exactly as decision 6 and the
milestone's punch list said; and not a test-fidelity problem, because the failing test measures the
product state a customer can reach. **The contract was wrong**: decision 6 read the corner's far edge
off `KITCHEN_L_DESIGN`, which stands at one cabinet depth (600), while the reason it gives for the
minimum — *"a wall shorter than this cannot hold its own corner"* — has to hold at every depth the
editor then lets the customer choose.

**Measured, 2026-09-11**, on `KITCHEN_L_DESIGN` and on its `setCabinetDepth` result at each of
`declaredCabinetDepthsMm()`, far edge = `alongMm + widthMm / 2` of each structural corner placement:

| Wall | Piece | At 600 | At 700 |
| --- | --- | --- | --- |
| A | `p25` `base-corner-x-900` | 0–900 | 0–900 |
| B | `p26` `base-corner-return-320` | 580–900 | **680–1000** |
| B | `p9` `wall-corner-return-570` | 330–900 | 400–970 |
| B | `p21` `wall-corner-return-570-top` | 330–900 | 400–970 |

Wall A does not move: it is anchored at the corner and a deeper corner is taken out of wall B
(`along-wall-chain-shift.ts`, `WALL_THE_CORNER_IS_TAKEN_FROM`; ADR 0083 decision 1). Wall B's pieces
slide by the chain each declares — 100 mm on the base chain, 70 mm on the wall-map chain (ADR 0089).

**What the old minimum admitted.** A 900 × 900 L validated; `setCabinetDepth(700)` succeeded;
`findOverflowingPlacementIds` then returned `p21`, `p26` and `p9`, and the validator reported the
matching `PLACEMENT_PAST_WALL_END` and `COLUMN_EXTENT_PAST_WALL_END` marks. Every wall B from 900 to
999 behaves the same way. The corner is structural (ADR 0021) — no delete, no resize — so **no
cabinet edit clears the mark**. QA's framing is slightly too strong: ADR 0065 decision 1 does list
*"go back to the shallower depth"* as a remedy, and it works. But it means a room the product accepted
has one of its two offered depths permanently unusable without a mark on a body the customer never
chose — exactly what ADR 0083 decision 1 refused for the demo room when it chose 2920 so that the run
clears at both depths.

### The ruling

1. **Each L wall minimum is the largest far edge of that wall's structural corner pieces over every
   declared cabinet depth.** Interim values: **wall A 900, wall B 1000**. Decision 6's table above
   carries them.
2. **The derivation stays probe-free and literal-free.** For each depth in `declaredCabinetDepthsMm()`,
   a wall-B piece stands at `alongWallPositionAtMm({ placement, catalog, fromCabinetDepthMm:
   cabinetDepthMmOf(KITCHEN_L_DESIGN), toCabinetDepthMm: depth })` — the production reader
   `setCabinetDepth` itself uses (`commands/set-cabinet-depth.ts:473`) — and its far edge is that
   position plus half its width. A wall-A piece is unaffected by construction because the reader
   returns a wall-A coordinate unchanged. The policy may not call `setCabinetDepth`: it needs a probe,
   and the domain has none.
3. **The room is still never a function of the depth** (ADR 0083 decision 2), and `validateRoomInput`
   still reads no depth (decision 5 stays). The depth enters only the *derivation* of a constant, at
   module load, over the declared set — the room entered at Step 1 is judged against a bound that is
   already safe at whichever depth the customer later chooses.
4. **Owner question Q1's recommendation changes with it**: the side wall's recommended shortest length
   is 1000 mm, because the corner reaches 1000 mm along it with the deeper 700 mm cabinets.

### Alternatives considered

- **Keep 900 and state that the minimum holds at the reference depth only.** Rejected: it keeps a
  sentence in this record that is false at 700, and it lets the product accept rooms in which one of
  its own settings can only produce a mark nobody can clear by editing.
- **Judge the room against a minimum at the design's current depth.** Rejected: the room is entered
  before any depth is chosen, and a room bound that moves with the setting is ADR 0083 decision 2's
  refused shape.
- **Refuse 700 for rooms between 900 and 999.** Rejected: refusing the depth change is ruled out by
  ADR 0036 decision 5, and it would be a second rule where one bound suffices.

### What the fix does to QA's secondary finding

A mutation that derived wall B's minimum from wall A's corner survived because both were 900. After
this amendment they are 900 and 1000, so that mutation gives 900 for wall B and QA's
*"at a 700 mm cabinet depth, wall B's minimum reaches its structural corner's far edge"* fails on it.
The **reverse** mutation — wall A derived from wall B's corner, 1000 — would still pass a `≥` check
(1000 ≥ 900), which is why the implementer's own test asserts **equality** with the independently
measured value, not merely a floor (milestone, 7A criterion 7).

## Amendment B — 2026-09-11: the owner approved the L bounds, and they become product data held inside the engine's limits

**The ruling, verbatim** (owner, 2026-09-11, answering the M7 plan's Q1 with Amendment A's corrected
recommendation in front of them — wall A 900–6300, wall B 1000–5100, ceiling 2200–3900):

> *"1. Yes looks like good boundaries"*

So the product's L bounds are:

| Bound | Approved | Engine limit it must sit inside (decision 6 + Amendment A) |
| --- | --- | --- |
| Wall A | 900 – 6300 | 900 (corner reach, every declared depth) – 6300 (`MAX_ROOM_WIDTH_MM`) |
| Wall B | 1000 – 5100 | 1000 (corner reach, every declared depth) – 5100 (`MAX_ROOM_DEPTH_MM`) |
| Ceiling | **2200** – 3900 | **860** (`LEVELS[0]`'s top) – 3900 (`MAX_ROOM_HEIGHT_MM`) |

**Only the ceiling minimum differs from the engine's own limit.** 2200 is the top of the wall-cabinet
row (`LEVELS[1]`), which was the recommendation's reason; below it a kitchen has no upper cabinets.

### Decision B1 — approved bounds are literals of product data, guarded against the engine; the engine limits stay derived

Two objects, two jobs:

- **The approved policy** (`approval: "owner-approved"`) holds the six numbers as **named literals**,
  in a module of its own, with this amendment cited beside them. It is what the product's composition
  root hands the validator.
- **The engine's limits** stay exactly as decision 6 and Amendment A derive them — literal-free, from
  the corner reach at every declared depth, `LEVELS` and the wire bounds — and are renamed for what
  they now are (the interim object *was* the engine's limits; it is no longer interim). They are no
  longer the product's policy; they are the **floor and ceiling** any product policy must sit inside.
- **A guard test ties them**: every approved minimum is at or above the engine's minimum for the same
  field, every approved maximum at or below the engine's maximum (which is the wire bound, decision 7),
  every approved shape is one the engine can build, and every minimum is below its maximum. A second
  test pins the six approved values against this amendment's table, so an edit to the approved data is
  a visible, deliberate diff — the copy lock's role (ADR 0095 decision 2) for numbers.

**Why literals once approved, and not still derived.** The owner approved **numbers**, not formulas.
Derived, a later engineering change — a third declared depth that slides wall B's corner further, a
catalogue change to the corner, a moved wire bound — would silently change a bound a customer sees
and the owner ruled on, which is a product change without the owner. As literals guarded by the
derived floor, the same engineering change turns the guard red and sends the question back to the
owner, which is the direction this repository's rules run (ADR 0028: two numbers must not agree by
luck — here they are *required* to be ordered, and a test says so). And the ceiling minimum has no
engine derivation at all: 2200 is a product choice that happens to coincide with a module line;
deriving it from `LEVELS[1]` would bind a customer-facing bound to the module grid.

**Decision 6's "never written as a literal" is narrowed, not reversed.** It protected against a bound
*invented* to make validation implementable. An owner-approved number is the opposite case — it is
the thing decision 6 was waiting for — and it is written exactly once, in the approved policy, with
its provenance.

### Decision B2 — straight and U-shaped rooms stay refused until their own waves

The ruling covers the L. The approved policy lists **L only**, so `linear` and `U` keep returning
`SHAPE_NOT_BUILDABLE` until the waves that make them buildable land. Each of those waves proposes its
own bounds on the same principle — engine floor from what the shape must hold, storage maximum — and
puts them to the owner before its shape is added to the approved policy. Nothing here guesses them.

### What moves, measured

- **Ceiling minimum 860 → 2200 for the product.** Nothing in production reads 860 as a room bound: the
  only production reader is `validateRoomInput`, which reads its argument. Every fixture room stands at
  2600 (`fixtures/kitchen-l-design.ts:971`; `OVERFLOWING_…` and `NARROWED_…` spread it), inside the
  approved range. The room tests that use 860 or a 900 mm wall B exercise the **engine's limits** and
  the validator's mechanism, and keep doing so against the renamed engine object; tests whose subject
  is the product's policy run against the approved one.
- **The seeded room** (3560 × 2920 × 2600) validates under the approved policy; so does
  `NARROWED_ROOM_OVERFLOWING_DESIGN`'s (2800 × 2920 × 2600).

### A conflict this surfaces, reconciled in the re-plan rather than here

The owner's answer to Q3 (same day) makes **sink + hob** the minimum kitchen. The smallest approved L,
900 × 1000, cannot hold them: its corner base fills wall A (0–900) and leaves 100 mm of base run on
wall B at 600. **The bounds stand as approved**; *"this room cannot hold a sink and a hob"* is a
different, second refusal at Step 1, ~~answered by the composition engine rather than by the wall
bounds~~ — **refined by Amendment C: a coupled validator rule on both walls together, tied to the
composition engine by a property** — and specified in the M7 re-plan. It is not a reason to reopen the owner's numbers.

### Sweep for this amendment

| Record | What it says | How it is settled |
| --- | --- | --- |
| Decision 6 (this record) | Interim bounds derived, never literal, flagged unapproved. | **Narrowed** by B1: still true of the engine's limits; the product's bounds are now approved literals. |
| Amendment A (this record) | Wall minima hold the corner at every declared depth: A 900, B 1000. | **What the owner approved**, and the floor the guard holds the literals to. |
| Decision 7 (this record) | No policy maximum above the wire bound. | **Kept**, through the same guard. |
| [0003](0003-design-reference-supersession.md) *Open questions* 1 | Room bounds are unapproved. | **Closed for the L** by the owner's ruling; open for linear and U (B2). |
| [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | A load that refuses is a dead link. | **Unaffected**: the bounds stay out of `DesignRoomSchema`; stored rooms are never judged by them. |
| [0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) decision 1 | The demo room clears its run at both depths. | **Consistent**: the demo room is inside the approved range. |
| [0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md), [0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) | The fit bound is one-sided; leftover wall is normal. | **Untouched**: a room bound is not a fit rule. |
| [0095](0095-romanian-is-the-source-and-lives-in-message-files-and-the-domain-publishes-codes-not-sentences.md) decision 2 | Approved copy is pinned in one place so an edit is deliberate. | **The model for B1's pin test.** |
| The owner's Q3 answer, 2026-09-11 | A kitchen minimum is sink + hob. | **Not a conflict with the bounds**; a second Step 1 refusal, specified in the re-plan. |

## Amendment C — 2026-09-11: a coupled rule — the room must hold a sink and a hob — and what the owner's 1500 / 2000 hold

**The owner's words, verbatim from speech** (2026-09-11, answering the conflict Amendment B surfaced —
the smallest approved L cannot hold the minimum kitchen):

> *"When you have a wall that have only nine hundred millimeters, the second wall should have at 1500
> mm ideallu 2000mm"*

**The reading, checked against the geometry rather than assumed.** A coupled rule: when one wall is
at its minimum (the corner alone fits there), the other must be at least 1500 mm, ideally 2000 mm.

**Measured 2026-09-11** (catalogue widths from `resolveWidthRangesMm` at both declared depths; corner
edges from Amendment A's table):

| Body | Buildable widths |
| --- | --- |
| `base-sink` | 560–800 (width follows the opening, ADR 0017's 560 floor) |
| `base-hob-oven`, `base-hob-2drawer` | 600 only |
| `base-cabinet` (preparation, storage) | 200–800 |
| `fridge-free` / `tall-fridge-housing` | 700 / 600 |

With wall A at 900 its whole base run is the corner (`p25`, 0–900), so the kitchen must stand on
wall B, whose free base run starts at the corner's far edge — **900 at a 600 mm cabinet depth, 1000 at
700**:

| Wall B | Free base run at 600 / 700 | Holds |
| --- | --- | --- |
| 1500 | 600 / 500 | **a sink or a hob, not both**, at 600; **neither** at 700 (500 < 560) |
| 2000 | 1100 / 1000 | a sink or a hob plus a preparation cabinet; **not a sink and a hob** (they need 1160) |
| **2060 / 2160** | 1160 / 1160 | **the smallest wall B holding a 560 mm sink and a 600 mm hob**, at 600 / at 700 |
| 3400 / 3500 | 2500 / 2500 | the owner's ideal row at standard widths — fridge 700, sink 600, preparation 600, hob 600 |

**So the owner's numbers and the geometry disagree, and it is said plainly rather than smoothed:** at
1500 the room holds half of the minimum kitchen the owner ruled the same day, and at 2000 it still
cannot hold both. One possible source of the difference, recorded as a guess and not relied on: without
the reference kitchen's 320 mm corner return, wall B's run would start at the cabinet depth (≈ 600),
and 2000 would then hold a sink and a hob — the *"ideally"* figure fits that picture, the 1500 does not
fit any. The question goes back to the owner (milestone follow-up F6).

### The ruling, pending F6

1. **It is a two-wall rule, not a "900 → 1500" special case.** A room is valid only if the minimum
   kitchen fits its free base runs in the owner's order (ADR 0110 Amendment A1: the run reads from wall
   B's free end toward the corner, then along wall A): **both on wall B, both on wall A, or the sink on
   B and the hob on A**. With free runs `A − 900` and `B − 1000` (the corner reach at every declared
   depth, Amendment A) and the catalogue's own sink floor and hob width, that is: either run ≥ 1160,
   or wall B's ≥ 560 and wall A's ≥ 600. The symmetric case follows without a special rule: with wall B
   at 1000, wall A needs 2060.
2. **It lives in the validator, as a cross-field rule with its own code** — `ROOM_TOO_SMALL_FOR_KITCHEN`
   on a room-level field, no number, no wall marked red — because the owner stated it as a room rule
   and the customer should learn it on the dimensions screen, not after a composition. The widths it
   uses are handed in through the policy, derived in the engine's limits from the catalogue and the
   corner reach, so `validateRoomInput` still reads nothing but its arguments.
3. **One authority is kept by a test, not by hope**: a property ties the validator to the composition
   engine — the rule passes if and only if `generateKitchen` places a sink and a hob. The generator's
   *minimum not met* (ADR 0110 Amendment A2) stays as the backstop and becomes unreachable from Step 1.
4. ***"Ideally 2000"* belongs to composition, not to validation**: below the ideal, lower-priority
   items drop in F3's order. There is no second threshold.
5. **Not in wave 7A.** 7A commits with the per-field approved bounds; this rule lands in wave **7A2**,
   after 7D2, so its property can run against the real generator.
6. **Pending F6**, the interim is the rule above — it enforces the owner's own Q3 minimum. If the owner
   answers that a room may hold only a sink or only a hob, rule 1 relaxes to *either fits*, and the
   code changes in the policy's data, not in the validator.

**Linear, later (wave 7J):** the same rule on one run — at least 1160 with a 560 sink, 1200 at standard
widths, which is why F1 proposes 1200. **U (M7B):** the same rule across three runs, with two corners.

## Amendment D — 2026-09-11: the owner's answers to F1 and F6

**F1**, option chosen verbatim: **"Yes, 1200–6300 mm"**. A straight kitchen's wall is approved at
~~1200–6300 mm~~ **1200–6000 mm — maximum superseded by Amendment G (2026-09-24)** — 1200 being a 600 mm sink and a 600 mm hob, the owner's minimum kitchen (the engine's own
floor, with the sink at its 560 mm floor, is 1160, so the approved value sits inside it); ~~6300 is the
storage bound~~ **the maximum is the one every wall has, 6000 (Amendment G)**. It enters `APPROVED_ROOM_POLICY` **in wave 7J, not 7A2**: a shape's bounds in the
approved policy are what make `validateRoomInput` accept it (Amendment B, B2), and a straight room must
not validate before the wave that can build it lands. The same guard applies — approved values inside
the engine's derived linear limits.

**F6**, option chosen verbatim: **"Must hold sink + hob"**. Amendment C's rule is **owner-ruled, not
interim**: when one wall is 900 mm, the other must be at least 2160 mm, and in general the two free runs
must hold a sink and a hob in the owner's order (`ROOM_TOO_SMALL_FOR_KITCHEN`). Its figures enter
`APPROVED_ROOM_POLICY` as owner-approved data in wave 7A2, guarded against the engine's derived
figures as in Amendment B.

## Amendment E — 2026-09-12: 7A2 validates the generator's 600 mm sink, not the catalogue floor

**Found by wave 7D2 adversarial QA, finding Q1.1, and classified as a contract gap.** Amendments C
and D derived the future coupled-room predicate from `base-sink`'s **560 mm manually buildable
catalogue floor**. Wave 7D2 implements the separately recorded generated target in
[ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
Amendment D3: sink **600**, hob **600**. Criterion 7A2.3 already requires validation and generation
to agree, so the 560-based numbers could not satisfy their own authority.

**Ruling.** Preserve the owner's semantic decision verbatim — **"Must hold sink + hob"** — and
supersede only Amendments C/D's derived 1160/2160 figures for generated kitchens. With
`freeA = wallA - 900` and `freeB = wallB - 1000`, an L room passes when:

- `freeA >= 1200`, or
- `freeB >= 1200`, or
- `freeB >= 600 && freeA >= 600`.

The exact boundaries are therefore:

| Fixed run | Refuses | Accepts |
| --- | ---: | ---: |
| wall A = 900 | wall B = 2199 | wall B = 2200 |
| wall B = 1000 | wall A = 2099 | wall A = 2100 |
| wall A = 1500 | wall B = 1599 | wall B = 1600 |

In particular, **900 × 2160 refuses**. A manually edited design may still contain a 560 mm sink;
this amendment does not narrow the catalogue, `resolveWidthRangesMm`, insertion, resizing or stored
design validity. It changes only the generated-kitchen acceptance data that wave 7A2 adds.

**Options refused.** Keeping 1160 because the catalogue permits it would make the validator accept
a room where the real generator cannot meet the ruled minimum. Shrinking generation's sink to 560
would overturn ADR 0110 D3 and the shipped 7D2 layout without an owner ruling. Special-casing
900 × 2160 would preserve one stale example while leaving the general property false.

~~**Verification owed by 7A2.** Assert all three boundary pairs above and a property over the
approved L range: the coupled rule passes if and only if `generateKitchen` returns a design
containing both a sink and a hob.~~

## Implementation record — 2026-09-13: wave 7A2 shipped the coupled rule at `f97d621`

Amendment E is implemented as policy data. `APPROVED_ROOM_POLICY.minimumKitchen` carries the
owner-approved 600 mm sink, 600 mm hob and 900 / 1000 mm corner reaches with the gate enabled.
`ENGINE_ROOM_LIMITS` derives the same figures from generation priorities and corner geometry but
keeps the gate informational and disabled for the shell envelope. `validateRoomInput` applies the
coupled rule only after every field passes and then emits exactly
`{ field: "shape", code: "ROOM_TOO_SMALL_FOR_KITCHEN" }`. `LMinimumKitchen` is part of the public
domain API.

The three exact boundary pairs above, the 900 × 2160 refusal and the generated-kitchen equivalence
property all pass. The property follows the B→A order from Amendment C: both bodies on A, both on B,
or sink on B and hob on A. The catalogue's 560 mm manual sink floor remains legal.

## Amendment F — 2026-09-18: Amendment A ruling 1 is narrowed to the corner's floor widths at a `(depth, room)` argument, and the approved 900/1000 are recorded as ADR 0125's deliberate margin

**Owed by [ADR 0125](0125-the-corner-minima-stay-at-900-and-1000-as-a-deliberate-margin-above-what-the-engine-needs.md)'s
*Consequences* item 4, unblocked once Q-K1 was answered.** ADR 0125 named this amendment as owed by
"the wave that lands the derivation — wave 7D6 slice S2, or whichever commit actually implements
`cornerAssemblyWidthsMm`, `cornerFarEdgeMm` and `narrowestCornerReachMm`". That commit is `bf58f97`
(wave 7D6 S2); the margin the two functions leave open was pinned by `dcb67ce` (S3). This amendment
is written against HEAD `9ae586c` on `m7-room-and-presets`, with the values below read from that
code, not carried forward from the adjudication's estimate.

**Found by logic review finding SF1, 2026-09-18: Amendment A rulings 1 and 2, above, are false of
HEAD.** Ruling 1 said each L wall minimum is *"the largest far edge of that wall's structural corner
pieces over every declared cabinet depth"* — a statement about the **reference-sized** pieces stood
up in `KITCHEN_L_DESIGN`. Ruling 2 said the derivation reads a wall-B piece's position through
`alongWallPositionAtMm({…})`, the same reader `setCabinetDepth` uses. Neither is true of the code
that has stood since 7D6 S2 landed:

- **The reader that answers `ENGINE_ROOM_LIMITS`' corner question changed.** `farthestCornerEdgeMm`
  and its four helpers are gone. `narrowestCornerReachMm(wall)`
  (`packages/configurator-domain/src/corner-assembly-size.ts:175-190`) is `ENGINE_ROOM_LIMITS`' only
  corner reader (`room-policy.ts:97-98, 104-106, 144-145`) and takes **no depth and no room** —
  callers pass only `wall`.
- **`alongWallPositionAtMm` is not imported.** `room-policy.ts`'s import list
  (`room-policy.ts:12-25`) has no such name; the module that answers the wall minimum now imports
  `narrowestCornerReachMm` from `corner-assembly-size.ts` and nothing from `along-wall-chain-shift.ts`
  or the placement-position readers `setCabinetDepth` uses.
- **The values moved, 900/1000 → 880/880.** `narrowestCornerReachMm("A").wallMinimumMm` and
  `narrowestCornerReachMm("B").wallMinimumMm` are each **880**, asserted directly in
  `packages/configurator-domain/tests/corner-assembly-size.test.ts:702-711` and cited in this ADR's
  own head comment at `room-policy.ts:140-143`. `APPROVED_ROOM_POLICY`'s 900/1000 are unmoved.

**1. Ruling 1 is narrowed to the corner's floor widths, not the reference-sized ones, at a
`(depth, room)` argument.** The reference reading measured the far edge of pieces sized to the
*reference* kitchen (900 mm along each wall at 600 mm depth, ADR 0120's pre-Amendment-A shape). Since
[ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md)
Amendment A ("every cabinet is custom made, corners included") the corner the generator actually
builds is sized down to the room it stands in, so the binding case for a wall *minimum* — the
narrowest corner the product will ever build — is not the reference corner at all. The corrected
ruling: **each L wall minimum is the farthest reach of that wall's structural corner pieces, built at
their catalogue **floor** widths (`HINGED_CABINET_MIN_WIDTH_MM = 200`, `catalog.ts:151`, read through
`base-cabinet` and `wall-cabinet`'s own `minWidthMm` declarations at `catalog.ts:729, 905`), maximised
over every declared cabinet depth.** The floor, not the reference reach, is what a wall must clear to
hold a corner *at all* once the corner is allowed to shrink to fit.

The sizing this replaces takes a `(depth, room)` pair, not a depth alone — [ADR
0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md)
Amendment A's room-adapts-to-fact principle, carried here as `cornerAssemblyWidthsMm({ cabinetDepthMm,
room })` (`corner-assembly-size.ts:108-118`): **the room enters as a ceiling on each piece's width and
never as a target** — `min(the reference width, what the wall can still hold)`, floored at the
piece's own floor (`corner-assembly-size.ts:120-138`). `narrowestCornerReachMm(wall)` itself takes no
room because the wall-minimum question is answered at the floor, which is room-independent by
construction (`corner-assembly-size.ts:169-190`'s own head comment) — the room argument belongs to
the sizing function the wall minimum is derived *from the floor of*, not to the wall-minimum reader.

**Measured, at HEAD, why 880 on both walls.** `base-cabinet` and `wall-cabinet` each declare
`minWidthMm: HINGED_CABINET_MIN_WIDTH_MM = 200` (`catalog.ts:151, 729, 905`), read once at module load
by `corner-assembly-size.ts`'s `declaredWidthFloorMm` and refused rather than defaulted if a row ever
stops declaring one (`corner-assembly-size.ts:285-299`). Wall A carries the blind X-leg alone: its
floor width is `blindSpanMm(cabinetDepthMm) + 200`, where `blindSpanMm` is the base seat depth the
X-leg's return sits behind — **780 at 600 mm, 880 at 700 mm** — so wall A's reach maximises to **880**.
Wall B carries three pieces (base, wall, top); each piece's floor width is `200` and its near edge is
`max(baseSeatDepthMm(d), wallCarcassDepthMm(d))` depending on band, giving near edges of 580/330 at
600 mm and 680/400 at 700 mm — so the four reaches are `max(580+200, 680+200, 330+200, 400+200) =
880`. **Both walls' floor-reach is 880**, verified tight and attained by different pieces at
different depths — wall A's X-leg at 700 mm, wall B's base piece at 700 mm — in
`corner-assembly-size.test.ts:681-700`.

**2. The derivation stays probe-free and literal-free, through a different reader than the one
ruling 2 named.** Ruling 2's *"stands at `alongWallPositionAtMm({…})` — the production reader
`setCabinetDepth` itself uses"* described how Amendment A's own measurement was taken by hand against
the reference fixture, before this derivation existed as code. It is not what `narrowestCornerReachMm`
does. The corrected statement: `narrowestCornerReachMm` computes each piece's near edge with
`nearEdgeMm` (`corner-assembly-size.ts:226-234`) — pure arithmetic over `baseSeatDepthMm` and
`wallCarcassDepthMm`, the same catalogue functions `setCabinetDepth` itself calls, but never through
`setCabinetDepth`, a placement, or `alongWallPositionAtMm` — and adds `narrowestWidthMm`
(`:238-243`), the floor. No probe, no placement lookup, no import from `room/` (checked by
`corner-assembly-size.test.ts:713-719` and this file's own head comment at
`corner-assembly-size.ts:27-30`).

**3. The approved 900/1000 are retained above the derived 880/880 as ADR 0125's deliberate margin,
not this ADR's engineering finding.** `APPROVED_ROOM_POLICY`'s wall-A and wall-B minima stay 900 and
1000; `ENGINE_ROOM_LIMITS`' now read 880 and 880 (`room-policy.ts:97-98, 104-106`). The 20 mm and
120 mm gaps are not an oversight this amendment should close: the owner was asked directly whether to
lower the approved minima to the derived floor (Q-K1) and chose to keep 900/1000, recorded in
[ADR 0125](0125-the-corner-minima-stay-at-900-and-1000-as-a-deliberate-margin-above-what-the-engine-needs.md).
This ADR's own decision B1 guard (`expect(approved.minMm).toBeGreaterThanOrEqual(engine.minMm)`,
`tests/room/approved-room-policy.test.ts`) was written so a shrink of the engine's floor **past** the
approved bound turns the guard red — the loud direction. Under ADR 0125's ruling the approved bound
now sits *above* what the engine needs by a margin the owner chose on purpose, so the `>=` guard is
satisfied by an intentional gap, and the gap's size is asserted separately rather than left as an
inequality: 7D6 criterion 4′, against `RULED_WALL_MINIMUM_MARGIN_MM` (or whatever name the constant
carries once the rename ADR 0125 flags — but does not itself make — lands). This amendment records
the guard's changed meaning; it does not restate ADR 0125's arithmetic or reopen its ruling.

**4. A hazard the review found and this record is the only place it belongs: `ENGINE_ROOM_LIMITS` and
`APPROVED_ROOM_POLICY` now disagree about what `cornerReachMm` means.**
`ENGINE_ROOM_LIMITS.buildableShapes.L.minimumKitchen.cornerReachMm` reads `narrowestCornerReachMm`
directly (`room-policy.ts:103-106`) — the **narrowest** corner, 880/880. `APPROVED_ROOM_POLICY`'s same
field is the **reference** corner, 900/1000. The two objects' `cornerReachMm` fields now carry
different meanings under the same shape. **This is harmless today, for two independent reasons that
must both keep holding**: `ENGINE_ROOM_LIMITS.buildableShapes.L.minimumKitchen.isRequired` is `false`
(`room-policy.ts:100`), so `validateLRoom` never reads the engine object's `cornerReachMm` at all
(`validate-room.ts:117-124` reads only `bounds.walls.minimumKitchen`, and the policy handed to
production is `APPROVED_ROOM_POLICY`); and no test or production code compares the two objects'
`cornerReachMm` fields to each other. **The trigger that would turn this from a naming oddity into a
live bug:** anything that makes the engine object's `minimumKitchen.isRequired` true (there is
currently no code path that does), or any future test or reader that treats the two `cornerReachMm`
fields as the same quantity and compares them.

## What this amendment does not do

It does not move any literal in `approved-room-policy.ts` — ADR 0125 already ruled that question and
this amendment cites it rather than restating its arithmetic. It does not rename
`WALL_MINIMUM_MARGIN_OWED_ON_Q_K1_MM` or whatever constant carries the 20/120 mm gap; ADR 0125 names
that rename as owed to the commit that touches it, not to this record. It does not change
`ENGINE_ROOM_LIMITS.minimumKitchen.cornerReachMm`'s value or `isRequired` flag, and does not resolve
the naming disagreement in item 4 — it records the disagreement and its trigger, per this
repository's rule that a problem which has not occurred is recorded with its trigger and not built
for ([ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)).

## Decision-record sweep for this amendment

| Record | What it says | How it is settled here |
| --- | --- | --- |
| Amendment A, ruling 1 (this record) | Each L wall minimum is the largest far edge of the reference-sized corner pieces over every declared depth. | **Narrowed.** The binding case is the floor-width corner, room-independent, not the reference-sized one; the derivation's sizing function takes a `(depth, room)` pair, the wall-minimum reader itself takes neither. |
| Amendment A, ruling 2 (this record) | The derivation reads `alongWallPositionAtMm`, the `setCabinetDepth` reader. | **Corrected.** `narrowestCornerReachMm` reads no placement position at all; it computes near edges directly from `baseSeatDepthMm`/`wallCarcassDepthMm`. `alongWallPositionAtMm` is not imported by `room-policy.ts` or `corner-assembly-size.ts`. |
| [0125](0125-the-corner-minima-stay-at-900-and-1000-as-a-deliberate-margin-above-what-the-engine-needs.md) | Q-K1 answered: keep 900/1000 as a deliberate margin above the derived 880/880; this ADR 0108 amendment is owed by the wave that lands the derivation. | **This amendment.** The margin is cited, not re-derived; the rename it flags is left to the commit that makes it. |
| [0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) Amendment A | Every cabinet is custom made, corners included; the room enters sizing as a ceiling, never a target. | **Carried through** as `cornerAssemblyWidthsMm`'s `(depth, room)` argument, which is what makes the reference-sized reading in the original ruling 1 no longer the binding case. |
| Logic review finding SF1, 2026-09-18 | Amendment A rulings 1 and 2 are false of HEAD; the reader and the values both moved. | **This amendment**, written and checked against HEAD `9ae586c` rather than against the adjudication's estimate. |

## Amendment G — 2026-09-24: one maximum for every wall — a straight wall is 1200–6000 mm, superseding Amendment D's 6300

**The ruling, verbatim** (owner, 2026-09-23, answering Q-7J-1 — *does "lets stick to 6 now for each
of the wall" (ADR 0120 Amendment B2) cover a straight wall too?*):

> *"Max should be on any type of kitchen same, liniar, L-shape an u-shape, only if you say that
> liniar need more because instead of a corner cabinet it can fit a different full size cabinet and
> for algo that detect which cabinets to fill is easier to fill a wall with 6300 mm instead of 6000
> otherwise cap all walls on same max width"*

**G1 — The rule: one maximum for every wall of every shape, 6000 mm**, unless a measurement shows the
straight wall's fill needs more.

**G2 — The measurement, and it shows the opposite** (wave 7J plan, G6; `tsc` build of `src` at
`8cd084b`; the composer fed one wall as its suffix and an empty prefix):

| Straight wall | Mean bare end | Rooms with ≥ 300 mm bare | Bases at the top of the range |
| --- | --- | --- | --- |
| 1200–6000 (4801 rooms) | 174.4 mm | 800 | 6000: 10 bases, **0 mm bare** |
| 6001–6300 (300 rooms) | **350.5 mm** | 201 | 6300: 10 bases, **500 mm bare** |

No room above 6000 holds a body more than 6000 does. The owner's premise — a straight wall gains a
full-size cabinet where a corner stood — is already true at 6000: its free run is 6000 mm, against
the L's longest free run of 5100 mm at 6000 × 6000. **So G1's exception does not apply.**

**G3 — What changes.** Amendment D's *"1200–6300 mm"* is superseded for the maximum; its minimum
(1200, a 600 mm sink and a 600 mm hob) and its sequencing (the bounds enter `APPROVED_ROOM_POLICY` in
7J, not before the wave that builds the shape) stand. The approved straight wall is **1200–6000**,
held inside the engine's derived linear limits (1200 / 6300) by the same guard as the L (B1), and a
test holds the approved wall maxima of every stated shape equal. M7B's U inherits G1.

**Not re-asked.** The owner asked to be told only if 6300 was needed; it is not, so this is recorded
rather than put back to them. `approved-room-policy.test.ts`' pin and `is-shape-buildable.test.ts`'
*"1200–6300"* comment move with it in wave 7J S5.
