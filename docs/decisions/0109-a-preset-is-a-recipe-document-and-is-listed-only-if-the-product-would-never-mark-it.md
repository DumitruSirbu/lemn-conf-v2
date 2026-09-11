# ADR 0109 — A preset is a recipe document, and it is listed only if the product would never mark it

Status: Accepted
Date: 2026-09-11
Type: Decision
Milestone: M7 — waves 7B and 7C (architect's plan, `docs/milestones/M7-room-and-presets.md`)

## Context

Frames 1E/D1E list *"Bucătării care încap"*: only presets that fit, each with its own **Folosește**,
and no confirmation screen. `ARCHITECTURE_PROPOSAL.md` §5.2 (revised 2026-08-24) keeps one evaluator
for the list and the application, so a card shown as fitting cannot fail when chosen.
`docs/CONFIGURATION_MODEL.md` *Preset* (still in force) makes a preset *"a recipe that creates normal
placements"*, validated transactionally.

Three things the plan could not know when it was written, all measured at `995ad03`:

1. **The owner's statement of intent (M7 plan, 2026-09-03) has a point 3**: everything the product
   *proposes* must fit its walls, the demo included. [ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md)
   decision 6 then made the write seam **accept** an overflowing design as a *mark*
   (`PLACEMENT_PAST_WALL_END: "mark"`, `validate-design.ts:226-283`) while stating that *"the seeded
   fixture, a preset and M7's generation must not overflow at all. A mark is an acceptable outcome of
   a customer's edit and of nothing else."* So the write seam's own rule — no *fatal* finding — is
   the wrong fit rule for a preset.
2. **The availability seam named in the plan refuses the only real recipe.** The plan says to route
   preset application through `toInsertableBody`. That function returns `undefined` for every entry
   whose definition is not `insertable: true` (`catalog.ts:1311-1316`) — which is every seeded body
   of the reference kitchen, the one real recipe M7 has. And the single named predicate
   [ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) decision 2
   asked for was never named: two call sites still test the boolean inline (`catalog.ts:1316`,
   `:1479`).
3. **The depth question the plan inherited from M6 was already answered.** The plan's section *"A
   rule this phase owns, handed over by M6"* lists four options and says the chosen one amends ADR
   0055. [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) (the same date)
   replaced the question on the owner's words: nothing gives, a body past its wall is marked, ADR
   0055 stays unamended, and ADR 0055's removal amendment was withdrawn.

## Decision

**1. A preset is data: a recipe document.** A `PresetRecipe` carries an id, a message key for its
name (ADR 0095 — no Romanian in the domain), the shapes it supports, its declared cabinet depth (one
of [ADR 0056](0056-two-cabinet-depths-are-declared-and-the-control-reads-the-map.md)'s), its
whole-kitchen settings, and its placements authored from the corner exactly as `DesignPlacement`
(§12) authors them. The preset set is a parameter of the evaluator; one composition root imports it.

**2. M7's one real recipe is the reference kitchen, derived and not copied.** It is built from
`KITCHEN_L_PLACEMENTS` and the fixture's settings, so the demo and the preset cannot drift apart —
two copies agreeing by luck is [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)'s defect.
Every other recipe in M7 is a test fixture. **The mockups' four presets (Ozun clasic, Nistru
compact, Codru insulă, Buștean deschis) and their counts and prices are illustrations, not data**;
*Codru insulă* has an island, which nothing in the product models.

**3. A recipe fits a room if and only if its instantiated design would be neither refused nor
marked.** Instantiate it into the entered room → a `Design`. It fits when (a) the room's shape is
one it supports, (b) every body it names is available (decision 6), and (c)
`validateDesignForCatalog` returns **zero findings of either severity**. (c) is the owner's point 3
and ADR 0069 decision 6 made mechanical. The bound stays one-sided: bare wall at the end of a run
never disqualifies a recipe and never ranks it lower (ADR 0065 decision 4,
[ADR 0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) decision 2).

**4. The list and the application are one evaluation.** The list keeps each fitting evaluation,
including its instantiated design; **Folosește** writes that design, with `presetId` set to the
recipe id and the timestamps from the caller. Application does not evaluate again, so it has no
second opportunity to disagree with the card. An evaluation belongs to the room it was computed for;
changing the room discards the list.

**5. A recipe is evaluated at its own declared depth, and that settles the M6 hand-over.** The
customer may later choose the other depth in the editor (M6's control); if that makes a run pass its
wall, ADR 0065 decision 1 already rules the outcome — the depth changes, the body is marked, nothing
is narrowed, dropped or refused. That is a customer's edit, so a mark is acceptable (ADR 0069
decision 6). **No give-way rule is owed, ADR 0055 is not amended, and refusal stays ruled out**
([ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5). Nothing here is an
owner question.

**6. Availability is one named predicate, and it answers for the *type* a body belongs to.**
`catalog.ts` gains the predicate ADR 0062 decision 2 asked for, and `toInsertableBody` and
`resolveCatalogEquivalent` call it instead of testing the boolean inline. A build id's type is itself
when its entry is insertable, and its declared catalogue equivalent otherwise
([ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md)); the type is available when
the catalogue holds it as insertable. A seeded body that declares **no** equivalent — the four corner
bodies and the seeded hob, by declaration (`catalog.ts`, `resolveCatalogEquivalent`'s doc comment) —
has no type a manufacturer could switch off and is available whenever the catalogue holds it. A
recipe naming an unavailable body evaluates to *does not fit* with a code naming that build id, and
nothing is half-applied. **No flag, no data, no schema** — ADR 0062's limit holds.

**7. Interim order, pending the owner (M7 plan, Q2):** exact fits first, then fits after a declared
adjustment (wave 7C) by the smallest adjustment, then the recipe set's own order. There is no score
over the remainder and no *"nearest"* metric.

**8. Adjustment is not in wave 7B.** *"Fits after a ≤ 30 cm adjustment"* needs a rule for **what**
may be adjusted, which is the owner's (Q2). Until it is ruled, a recipe is listed only when it fits
unchanged, and no adapted card exists. The same question carries whether a preset's large remainder
is recorded as empty space the customer can fill (wave 7C).

## Alternatives considered

- **Fit = no fatal finding**, the write seam's rule. Rejected: it lists a preset the scene would then
  mark, which is precisely what the owner's point 3 forbids.
- **Instantiate presets through `insertBody`**, as generation does (ADR 0110). Rejected for presets:
  the reference kitchen's bodies are seeded and not insertable, and a recipe document is what §5.2 and
  *Preset* describe. A preset still has no privileged path — the document validator it passes is the
  write seam's own (`app/api/designs/[id]/route.ts:233-249`), held to the stricter zero-findings rule.
- **A nearest-room distance metric.** Rejected by ADR 0067: a metric that penalises leftover space
  prefers a preset that fills a wall it was never measured for over one that fits with room to spare.
- **Route availability through `toInsertableBody`, as the plan said.** Rejected: it refuses every
  seeded body by construction, so it would refuse the reference kitchen.
- **List a preset only if it fits at every declared depth.** Rejected: it invents a product rule, and
  the depth choice is the customer's edit, which ADR 0065 already governs.

## Consequences

- With one real recipe, most rooms will go to generation. The reference kitchen's furthest along-wall
  extents are 3500 mm on wall A and 2800 mm on wall B, and its top row reaches 2600 mm
  (`fixtures/kitchen-l-design.ts:907-935`), so a room below any of those is expected not to fit;
  wave 7B measures the exact boundary rather than trusting this reading. A useful 1E list needs the
  owner's recipes (Q4), which are data.
- The plan's depth-give section is superseded by decision 5 and is struck in place in the milestone.
- The plan's availability sentence is corrected by decision 6 and is struck in place in the
  milestone.

## Decision-record sweep

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md) decisions 1, 2, 4 | Nothing gives; a body past its wall is marked; ADR 0055 intact; the bound is one-sided. | **Governs decision 5; supersedes the M7 plan's hand-over section**, which predates it by hours and was never revised. |
| [0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) decision 6 | A mark is acceptable for a customer edit and nothing else; a preset must not overflow. | **Made mechanical** by decision 3's zero-findings rule. |
| [0055](0055-a-depth-change-migrates-the-stored-design.md) (+ withdrawn amendment) | A depth change migrates; every body adapts; nothing left behind. | **Unamended**, as ADR 0065 decision 2 states. |
| [0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5 | Refusing the depth change is ruled out. | **Not reopened.** |
| [0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md) decisions 2–3 | Name the availability predicate once; a preset must fail in a stated way if a type is disabled. | **Fulfilled** by decision 6, with the plan's `toInsertableBody` wording corrected. |
| [0021](0021-corner-returns-are-structural-in-data.md), [0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) | Corners are structural; a seeded body's catalogue identity is declared, never inferred. | **Followed**: availability reads the declared equivalent, and declares corners available by presence. |
| [0067](0067-leftover-wall-is-the-normal-case-and-the-price-is-a-floor.md) | Leftover wall is the normal case; no metric may penalise it. | **Followed** by decisions 3 and 7. |
| [0107](0107-appliances-are-drawn-and-not-sold-and-a-language-is-named-in-its-own-language.md) decision 3 | An entry the engine cannot satisfy is removed from its list, not greyed. | **Consistent**: frames 1E/D1E already show only presets that fit (*"Restul nu se afișează deloc"*). |
| [0028](0028-wall-depth-is-derived-from-the-worktop.md) | Two numbers must not agree by luck. | **Why the reference recipe is derived from the fixture** (decision 2). |
