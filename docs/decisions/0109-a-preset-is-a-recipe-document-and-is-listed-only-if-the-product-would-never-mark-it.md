# ADR 0109 — A preset is a recipe document, and it is listed only if the product would never mark it

Status: Accepted (**Amendment A, 2026-09-11** — the owner's answers to Q2 and Q4: the library is owner-authored data and starts empty; a preset matches within ±600 mm per wall and is adapted by removing cabinets from the free ends, never by narrowing; decision 8's threshold is retired; **Amendment B, 2026-09-11** — a ceiling under a preset's tallest body drops the rows above it as a declared adaptation; **Amendment C, 2026-09-11** — a proposal must fit at every declared depth, amending decision 5; **Amendment D, 2026-09-11** — the owner confirmed the edge adaptation (F4) and the every-depth fit with its wall-B reserve (F7))
Date: 2026-09-11
Type: Decision
Milestone: M7 — waves 7B and 7C (architect's plan, `docs/milestones/M7-room-and-presets.md`)

**Pointer, 2026-09-14 — why the library exists at all:**
[ADR 0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)
rules the division of labour between generation and presets — generation produces a correct, cheap
baseline, and the owner's taste enters through presets. It is the authority on **which** decisions
belong to a preset rather than to a generator rule; this record stays the authority on **what** a
preset is. Waves 7B and 7C read it before deciding anything an adaptation drops.

**Pointer, 2026-09-29 — its waves are past M8.**
[ADR 0131](0131-the-preset-story-is-deferred-past-m8-and-every-room-goes-from-its-dimensions-straight-to-composition.md)
records that 7B and 7C moved past M8 with the rest of the preset story (coordinator, 2026-09-15). They
moved by derivation: matching searches a library that does not exist until the owner authors one.
Nothing here is struck. The rules stand, unbuilt, and M7 closed without them.

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

## Amendment A — 2026-09-11: the owner's answers to Q2 and Q4

**The rulings, verbatim** (owner, 2026-09-11):

> *"2. if you mean how much empty space can remain if is not possible to fit ideally all cabinets I
> will say maximum 599, why? because this is the default with of majority of cabinets. In that
> empoty space you have limited options like cabinet with one door 599-350, bottle cargo 300 and that
> all. So we can be more permissive and try to fix exactly what fits and let the edges empty for user
> to play with resizez or insettion of another cabinets. WHat should be in that empoty space? the
> posibility to insert a cabinet and it should look like a empty column exact like after you remove
> the cabinets"*

> *"4. [...] c) you start to generate a preset (we don't have now presets) d) I make adjustments and
> save the preset e) later if I insert nearly similar walls confioguration and width +- 600 mm, you
> show me the preset so I am able to choose it"* (in full in [ADR 0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md))

**A1. The library is owner-authored data and starts empty** ([ADR 0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md)).
~~Decision 2's *"M7's one real recipe is the reference kitchen"*~~ — **amended**: the reference kitchen
stays a fixture the evaluator is tested against, and is **not** published as a preset. Recipes are no
longer modules handed in by a composition root; they are rows read from the library. Decisions 1, 3,
4, 5 and 6 stand unchanged; decision 3's zero-findings rule now applies **after** adaptation.

**A2. A preset matches a room when the shape is the same and every wall is within ±600 mm of the
length the preset was saved in, inclusive.** Once wave 7I lands, a left-corner preset also serves a
right-corner room: the domain is canonical and the mirror is presentation, so corner direction is not
a match criterion.

**A3. A matched preset is adapted by the owner's own rule — fit exactly what fits, leave the edges
empty.**

1. **A wall shorter than the preset's run loses whole columns from that run's free end** — the end
   away from the corner (a straight wall's far end) — until the run fits. Never a structural body,
   never the sink, never the hob. If the run still does not fit, the preset is not shown.
2. **Then the leftover rule, shared with generation** ([ADR 0110](0110-generation-inserts-through-the-command-path-and-the-corner-is-structural-data.md)
   Amendment A): any bare run end of 600 mm or more receives 600 mm storage bases until less than
   600 mm remains; what remains — at most 599 mm — is recorded as an empty column the customer can
   insert into, the same kind of space a removed cabinet leaves (ADR 0044, 0053).
3. **The card declares every change** — cabinets removed and storage added, per wall. Never silent
   (`ARCHITECTURE_PROPOSAL.md` §4.4, *"automatic adjustments are named and declared"*).
4. **The result is held to decision 3** — zero findings of either severity — **and to the minimum
   kitchen** (a sink and a hob, owner Q3). A preset that cannot keep both is not shown.

Part 2's *"fill with 600 mm storage"* is the architect's reading of *"maximum 599 ... because this is
the default width of majority of cabinets"* and is put to the owner to confirm (milestone follow-up
F4); the build proceeds on it.

**A4. Order among shown presets** ~~(decision 7)~~ — **amended**: presets needing no change first,
then those with fewer cabinets removed, then the library's own order, newest first. Still no score
over the remainder and no distance metric (ADR 0067); the ±600 window is a filter, not a ranking.

**A5. Decision 8 is retired.** The owner did not rule a narrowing adjustment; they replaced it with
A3. The *"≤ 30 cm"* threshold and the idea of narrowing a preset's cabinets are withdrawn, and so is
the plan's wave-7C narrowing arm. The mockup's *"Ajustată −20 cm ca să intre pe peretele B"* becomes a
declaration of what A3 changed, with its wording drafted under [ADR 0113](0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md).

**A6. Why this does not reopen the owner's point 3.** ±600 is a match window, not a fit rule: a preset
larger than the room is **adapted until it fits or not shown**, so nothing proposed ever passes its
wall.

## Amendment B — 2026-09-11: a ceiling below a preset's tallest body

**Found by wave 7A's QA as a forward risk (Q2.2).** The approved ceiling minimum is 2200 (ADR 0108
Amendment B), and the reference kitchen's top row stands 2200–2600: `KITCHEN_L_DESIGN` in a room of
2200 or 2599 gives ten `PLACEMENT_ABOVE_ROOM` refusals, and at 2600 none. Any preset with a top row
meets the same thing in every room under 2600.

**Ruling: the rows above the ceiling are dropped as a declared adaptation — not a refusal of the whole
preset.** It is the owner's Q2 rule applied vertically — *"fit exactly what fits and let the edges
empty"* — and it keeps the owner's library useful in the common 2.4–2.5 m rooms. Concretely, in wave
7C: ~~every body whose top is above the room height is removed through `removePlacement`, the recorded
space it leaves is capped at the room height by one helper that the composition shell (wave 7D1) uses
as well — so no recorded extent rises above the room —~~ **corrected the same day, below** — and the
card declares the removed row.

> **Correction — 2026-09-11, found by wave 7A's logic review.** `removePlacement` cannot remove every
> such body: the top-row corner return `p21` (`wall-corner-return-570-top`, 2200–2600) is structural
> with `canDelete: false`, so the command refuses it as `NOT_DELETABLE`
> (`commands/remove-placement.ts:41-50`) — correctly, since a customer must never delete a corner
> (ADR 0021). The reviewer's run of a corner-only design at 900 × 1000 × 2200 reports
> `PLACEMENT_ABOVE_ROOM` on `p21` and `COLUMN_EXTENT_ABOVE_ROOM` on the corner's 1500–2600 recorded
> space, at both depths. **The corrected rule has two arms:** (1) a **non-structural** body above the
> ceiling is removed through `removePlacement`, as before; (2) a **structural** piece above the
> ceiling is **not instantiated** — the same selection rule the composition shell uses (ADR 0110
> decision 1: only the corner pieces whose top fits under the ceiling), applied when the preset is
> instantiated for the room, never as a command. Then **every** recorded extent — `emptyColumns` and
> `columnExtents` alike, the corner's own column included — is capped at the room height by the one
> shared helper. Nothing else in this amendment changes. The
sink and the hob are base bodies and are never affected. Decision 4 still holds — the list and the
application are one evaluation — so a preset listed with a dropped row applies with exactly that row
dropped.

*Rejected:* hiding every preset with a top row from rooms under 2600 — correct under decision 3, but it
empties the library for most real rooms, and refusing where the owner's rule says adapt is the less
faithful reading. *Rejected:* keeping the top row and letting it be marked — marks are for customers'
edits only (ADR 0069 decision 6).

**Generation meets no such case**: its shell caps recorded space at `min(room height, 2600)`, so a top
row is never offered below 2600 (ADR 0110 decision 1).

## Amendment C — 2026-09-11: a proposal fits at every declared depth

~~Decision 5's *"A recipe is evaluated at its own declared depth"*~~, as the whole rule, is
**amended**: a preset is evaluated at its declared depth **and must also fit at every other declared
depth**. A customer's later depth change is still their own edit (ADR 0069 decision 6), but a
proposal the product's own second setting would push past its wall is not one the owner's point 3 —
*"this should always fit the existing walls, including demo"* — permits, and the owner held the demo
to exactly this (ADR 0083 decision 1). Concretely: wave 7B checks it probe-free, through the
production chain reader — every wall-B placement's extent at each declared depth
(`alongWallPositionAtMm`) ends at or before the wall — and wave 7C also takes the adapted design
through `setCabinetDepth` to every declared depth and requires zero findings. Composition gets the
same guarantee by construction (ADR 0110 Amendment B3). Nothing gives at a depth change; the product
simply stops proposing a kitchen that a depth change would push past its wall.

## Amendment D — 2026-09-11: the owner's answers to F4 and F7

**F4**, option chosen verbatim: **"Yes, drop from free ends"**. Amendment A3's reading is the owner's
rule, no longer the architect's: a preset in a smaller room loses whole cabinets from each wall's free
end — never the sink, the hob or the corner — any bare stretch of 600 mm or more gets a 600 mm storage
cabinet, and the card states the change.

**F7**, option chosen verbatim: **"Keep the 100 mm reserve"**. Amendment C is **owner-confirmed**: an
adapted preset, like a composed kitchen, must still fit after a change to the deepest declared depth,
so on wall B its planned end is the wall's length less the chain shift. **The stated exception to A3's
599 mm:** on wall B, measured at the preset's own depth, the bare end may reach 599 mm plus that shift
(699 today); at the deepest depth it is at most 599 again.
