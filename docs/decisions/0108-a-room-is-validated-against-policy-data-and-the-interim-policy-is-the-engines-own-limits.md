# ADR 0108 — A room is validated against policy data, and until the owner rules, the policy is the engine's own limits

Status: Accepted
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
  (`fixtures/kitchen-l-design.ts:917-918, 923, 935`). An L wall shorter than that cannot hold its own
  corner.
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

**6. Until the owner rules, the policy is the engine's own limits, and it says so.** Each bound is
**derived at module load from an existing constant, never written as a literal**, and the policy
carries `approval: "interim-unapproved"`:

| Bound | Interim value | Source |
| --- | --- | --- |
| Buildable shapes | L only | the plan's scope; the engine has walls A and B only (`room-transforms.ts:34-49`) |
| L wall A minimum | 900 | far edge of the corner assembly on wall A (`p25`) |
| L wall B minimum | 900 | far edge of the corner assembly on wall B (`p26`, `p9`, `p21`) |
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
