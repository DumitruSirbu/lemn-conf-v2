# ADR 0080 — An empty space follows the setting, and the fallback that answers for a lost one is not a ratchet

Status: Accepted
Date: 2026-09-05
Type: Decision (owner instruction) + Finding
Milestone: M6 — confirms wave 6K-c on its current scope; opens wave 6K-j

## The instruction, verbatim

Owner, 2026-09-05:

> "If you resize the kitchen to have seven hundred depth, you should operate with all the cabinets
> with this particular depth, including the empty spaces. When you decide to change the depth, let's
> say, from seven hundred to six hundred, everything — cabinets, empty spaces, everything — should
> change to six hundred depth. Already you decided the mechanism, but this is the requirement. So you
> don't keep all their depth in mind because there was earlier a cabinet deeper, and now this is
> missing and so on. You change globally the depth of the kitchen. Automatically, you change
> everything according to that depth."

It is a **reaffirmation of [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md)
decision 5**, extended to the one population that record did not name. There the owner said *"we need
to adapt all the depths of the cabinets — the base, the middle, and the top ones… automatically, we
will make them deeper"*, and ADR 0036 read it as *"depth follows the setting for every body, with no
confirmation step and nothing left behind"*. This instruction says the same of an **empty space**,
and adds the negative clause the earlier one did not have: a depth may not be carried across a
setting change because a body that is now gone was deeper.

The owner also says *"already you decided the mechanism"*, which is ADR 0036's own split between the
outcome (the owner's) and the mechanism (the project's), repeated. So this record does not re-open a
mechanism; it measures each mechanism already in the tree against the requirement and rules on the
one that fails it.

## Context — three rules are in scope and they are in three different states

| Rule | Where | State |
| --- | --- | --- |
| A depth change re-asks the body a frozen extent recorded, in the catalogue built at the new setting | [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) decision 2, [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md) decision 2 | **Uncommitted**, wave 6K-c, mid-close |
| The frozen number is carried forward verbatim and the MAX is deeper-only | wave 6K-a's `atCurrentCabinetDepth` | **Committed at HEAD**, replaced by the above |
| An extent that cannot be re-answered is deepened to `columnBuildDepthM` **and never shallower** | ADR 0073 decision 3 | **Uncommitted**, wave 6K-c |

The coordinator's reading routed the instruction at the first and second of these as one thing. They
are not one thing, and separating them is what decides this record.

## Measurement

Run in a copy of the working tree (production files unmodified in the repository), driving
`createConfiguratorStore` over the shipped fixture through `setCabinetDepth(700)` then
`setCabinetDepth(600)` then a save-and-reload, dumping every published `Column.d` and
`depthFromBuildId`. Three rules were measured: the tree as it stands (**6K-c**), the tree with
ADR 0073 decision 3's `Math.max` against `column.d` removed (**O1**, the instruction read as reaching
the fallback), and O1 with the surplus arm removed as well (**O2**, the instruction read as reaching
every arm).

**Current-schema documents — every column carries a recorded source, and every depth is already a
pure function of (source, setting).** 6K-c and O1 are **identical** on all of these; O2 is not.

| Scenario | Column | 6K-c and O1 | O2 |
| --- | --- | --- | --- |
| Untouched fixture, 600 → 700 → 600 | all 12 | returns to its start value, every column | same |
| Delete `p1` (the dishwasher base under a wall run) | `A\|2.00` | 620 → **720** → 620, source `base-dishwasher-600` throughout | 620 → **400** → **330** |
| Clear `A\|2.00` entirely (member-less base column) | `A\|2.00` | 620 → **720** → 620 | 620 → **400** → **330** |
| Clear `A\|0.30` (member-less wall column) | `A\|0.30` | 330 → **400** → 330, source `wall-2door-600` | same |
| Delete `p7` (the freestanding fridge) | `B\|2.45` | **742 at both settings**, source `fridge-free-700` | 742 → **600** → **600** |
| Untouched fixture | `B\|1.80` | 600 → **699** (`tall-pantry`) → 600 (`wall-2door-600-deep-top`) | same |

**Legacy documents — an extent saved with no `depthFromBuildId`.** This is the only population where
6K-c and O1 differ.

| Scenario | Column | 6K-c (shipping rule) | O1 (fallback made exact) |
| --- | --- | --- | --- |
| Cleared base slot under a wall run, frozen 620 | `A\|2.00` | 620 at 600 (**correct**), 620 at 700 (100 short of 720) | **330** at 600 (290 short), **400** at 700 (320 short) |
| Member-less base column, frozen 620 | `A\|2.00` | as above | as above |
| Member-less wall column, frozen 330 | `A\|0.30` | 400 at 700 (**correct**), then **400 at 600** — 70 mm proud of every wall body around it | 400 at 700, **330** at 600 (**correct**) |
| Fridge niche, frozen 742 | `B\|2.45` | **742 at both** (correct — a machine's depth follows no setting) | **600 at both** (142 short, and a `manufactured-size` depth made to follow the setting) |

Two further facts were measured because the ruling rests on them:

- **The two declared catalogues hold identical `buildId` sets.** `buildKitchenLBodyCatalog(600)` and
  `buildKitchenLBodyCatalog(700)`: symmetric difference empty. So *"a `buildId` the catalogue no
  longer holds"* — one of ADR 0073 decision 3's three inputs — is **unreachable across a depth
  change**.
- **No current-schema state reached in the measurement publishes a sourceless column.**
  `deriveColumns` records a source for every column it derives; the freeze, the merge, the split and
  the wall-end clip all carry it (ADR 0073 decision 8, ADR 0079 decisions 1 and 7). Absence
  originates in exactly one place: a stored document written before wave 6K-c.

## Decision

### 1. The instruction confirms wave 6K-c and condemns wave 6K-a, which 6K-c replaces

The coordinator's reading of the surplus arm — *"the 620 mm opening a deleted base cabinet left under
a wall run is preserved deeper-only, which is exactly keeping the depth in mind"* — is **true of what
is committed at HEAD and false of what is in the tree**. At HEAD the frozen *number* crosses the
setting change untouched: `A|2.00` reads 620 in a 700 mm kitchen. That is the owner's sentence, word
for word. Wave 6K-c is the wave that ends it, and the measurement above shows the result is a pure
function of (recorded source, setting) in both directions, with 620 → 720 → 620 and nothing
remembered between the legs.

**So the instruction is not an overturn of 6K-c. It is the requirement 6K-c was already built to.**
Nothing in ADR 0073 decisions 1, 2, 5, 6, 7 or 8, and nothing in ADR 0079, is revised.

### 2. What survives in that arm is not history, and the owner's words do not reach it

After decision 1 the surplus arm holds one thing only: `Math.max(frozen re-answered, what the members
measure now)`. That MAX is §3.2's own definition of a column — an opening may not be shallower than a
body standing in it — and it is the reason `B|1.80` publishes 699 while the pantry stands. Removing it
is option **O2**, and O2 is refused on its own measurement: a customer who deletes the dishwasher base
and then changes the depth loses 320 mm of the opening they just freed (720 → 400), and a customer who
deletes the fridge loses 142 mm of the niche (742 → 600). Both are irreversible — no rule can restore
a depth that was collapsed to the members. That is
[ADR 0011](0011-m3-insert-contract-gaps.md) Gap D's freed opening destroyed on the depth axis, and the
owner's instruction is about a space **following** the kitchen, not about a space **disappearing** from
it.

### 3. ADR 0073 decision 3's "never shallower" is **partly overturned**: it is a surplus rule, not a ratchet

One `Math.max` in `frozenDepthAtThisSetting` does two different jobs and only one of them is what the
owner refuses.

- **The ratchet — overturned.** A depth the fallback itself produced is held on the way back down. A
  member-less wall column with no recorded source is deepened 330 → 400 at 700 and then **stays 400 at
  600**, standing 70 mm proud of every wall body around it. Nothing produced that 400 except the rule
  itself, one setting ago. It is a depth kept in mind because of where the kitchen used to be, it is
  ADR 0028's defect in the mirror image ADR 0073 decision 3 cites in its own text, and it is the
  outcome ADR 0073 decision 5 and ADR 0079's amendment section A both refuse for the sourced arm. The
  instruction reaches it and it goes.
- **The surplus — not overturned.** An unsourced depth *deeper than the fallback could ever have
  produced* — a legacy cleared base slot at 620, a legacy fridge niche at 742 — is the absence of
  information, not a preference. Removing it (option **O1**) makes currently-correct answers wrong by
  a measured **290 mm** at the very setting the extent was frozen at, and makes a `manufactured-size`
  niche follow the setting, which [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md) and
  [ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md) decision 2 forbid.

**The reason O1 cannot be adopted is structural, not a preference between two numbers.**
`columnBuildDepthM` is a **build ceiling**: 330 or 400 with no full-height member under the opening,
600 or 700 with one. A base run's finished depth is 620 or 720, and the fallback cannot express it at
either setting. So "follow the setting exactly" is, for a base opening, an instruction to answer with
a number from the wall map. That is not the owner's *"change everything according to that depth"*; it
is a different opening.

### 4. The rule, stated so an implementer needs no second author

For an extent whose depth **cannot** be re-answered — `depthFromBuildId` absent, or naming an entry
the catalogue does not hold:

> Let `newM = columnBuildDepthM({ cabinetDepthMm: the setting the design now declares, hasFullHeightUnder })`
> and `atFreezeM = columnBuildDepthM({ cabinetDepthMm: the setting the design declared before this
> command, hasFullHeightUnder })`.
>
> - **If `column.d` is not deeper than `atFreezeM`, the answer is `newM` exactly, in both
>   directions, and it carries no source.** A depth the fallback itself produced follows the setting
>   like everything else.
> - **Otherwise `column.d` is a surplus no rule can re-answer.** The answer is
>   `Math.max(column.d, newM)`, carrying whatever source the column holds — ADR 0073 decision 3
>   unchanged, and ADR 0079 decision 2's *"a source survives exactly when the depth it explains
>   survives"* unchanged with it.
>
> The test is **not** *"is it deeper than the new answer"* — that is the ratchet. It is *"was it ever
> more than this rule could have produced"*.

Then, unchanged, `republishedDepth` takes the MAX of that answer and what the members measure, and
`atDepthM` publishes the winning operand whole.

**The predicate reads two fields of one document, not the session's history.** `column.d` and
`settings.cabinetDepthMm` are both on the design the command is mutating, so one document answers one
way whatever route reached it — ADR 0011's 2026-08-26 correction, satisfied by construction rather
than by care. A document at 600 carrying an unsourced 400 and a document at 700 carrying an unsourced
400 are two different documents and are entitled to two different answers.

**`hasFullHeightUnder` is the live predicate, asked once and used for both operands.** It can only
ever make this rule keep *more*: a deleted full-height member lowers `atFreezeM` from 600 to 330 and
so makes a frozen depth look like a surplus. Named here so a reviewer does not read the asymmetry as a
defect.

**A round trip through the fallback still does not return**, and this record does not make it. ADR
0073's consequence already says so. What changes is the direction it fails in: toward the setting the
customer is looking at, rather than away from it.

### 5. The population this reaches is closed, and that is why nothing else moves

An unsourced extent is written by no build from wave 6K-c onward, and the measurement shows the two
other inputs ADR 0073 decision 3 names are unreachable across a depth change (identical catalogue id
sets) or carry their source through (the merge, the split, the clip). So this rule governs documents
saved **before** 6K-c and nothing else.

[ADR 0038](0038-pre-release-no-stored-designs-no-migrations.md) rules that no migration is owed for
such a population, and its founding premise was measured false by
[ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) (5 rows, `schema_version` 1) — so the
class is small but not empty, and it is not migrated. **No migration is added here either**: the rule
answers correctly for those documents at read time, which is cheaper than rewriting them and is what
ADR 0052's *"a load that refuses is a dead link"* points at.

### 6. Nothing else moves

No schema change, no `CURRENT_SCHEMA_VERSION` bump, no new refusal at either seam, no change to
`MAX_DESIGN_BYTES`, no change to any published depth on any current-schema document. Measured: with
this rule applied, the only difference against wave 6K-c across the whole scenario set is the two
lines of `A|0.30`'s ratchet, and the full web suite is green (1 442 passed, 4 skipped, 0 failed).

### 7. Two things the instruction contradicts that the owner may not have intended

Reported rather than absorbed, because both are the owner's own earlier rulings.

- **"Everything becomes 600" is not literal, and three declared exceptions already say so.** A wall
  opening is 330 at 600 and 400 at 700 (ADR 0028's map, the head-clearance rule the owner decided on
  2026-08-26). A freestanding fridge is 742 at every setting (`manufactured-size`). ADR 0058's two
  pinned deep tops are 600 at every setting. This record reads the instruction as *each space follows
  the chain it belongs to at the new setting*, which is what `depthFromBuildId` already does and what
  makes those three exceptions fall out of the entries' own declarations. **If the owner means the
  exceptions too, that is a different and much larger instruction** — it would unpin ADR 0058, ADR
  0056 and the wall map — and it needs its own conversation, not this record.
- **A freed opening does get shallower on a decrease, and that is the requirement, not a defect.**
  `tall-pantry`'s opening is 699 at 700 and 599 at 600; a cleared dishwasher slot is 720 at 700 and
  620 at 600. ADR 0079's amendment section A ruled this before the instruction arrived, and the
  instruction's *"from seven hundred to six hundred, everything should change to six hundred"* is its
  confirmation.

## Alternatives considered

- **O1 — the fallback becomes `columnBuildDepthM` exactly, both directions.** The literal reading of
  the instruction's second half, and the one the coordinator's question 2 proposed. Refused on the
  measurement in the table above: 290 mm and 320 mm wrong on a legacy base opening, at both settings,
  and a `manufactured-size` niche made to follow the setting. It buys the ratchet fix that decision 4
  buys anyway, at a cost decision 4 does not pay.
- **O2 — drop the surplus arm as well, so a depth change re-derives every extent from its members.**
  Refused in decision 2, on 720 → 400 and 742 → 600 measured on **current-schema** documents. It is
  Gap D's freed opening deleted on the depth axis and it reaches every customer, not only legacy ones.
- **Leave ADR 0073 decision 3 exactly as it is and rule the instruction fully satisfied by 6K-c.**
  Defensible — the ratchet is legacy-only, and one could argue nothing the owner will ever see is
  wrong. Refused because the ratchet is the instruction's own sentence, the fix is three lines and a
  predicate, and it costs nothing measured. A rule that says *"follows the setting, except where a
  previous version of this rule already answered"* is the kind of exception that outlives the
  population it was written for.
- **Migrate the legacy population instead: rewrite an unsourced extent at load.** There is nothing to
  rewrite it *to* — the fact that would supply the source was never recorded, which is ADR 0073's own
  measured refusal (`B|1.20` and `B|1.80` identical on every retained field, 38 mm apart).
- **Record the setting an extent was frozen at, rather than comparing against the document's own
  declared setting.** A new persisted field for a fact the document already carries in
  `settings.cabinetDepthMm`, and ADR 0073 already refused a stored freeze-depth for a stronger reason
  (it identifies a stale extent but cannot re-answer one).

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D | Columns are frozen load-time state; recomputing them from mutated records deletes the feature — a deleted top unit produces **no void**, a cleared column **disappears**, and §10's *"delete the fridge, delete the unit above it, get one 700 × 2600 opening"* cannot happen. | **Untouched, and confirmed as an along-wall-and-vertical argument.** Both harms it enumerates are `top` and column existence; its signature flow is a width × height opening. The depth axis is named in the 2026-08-26 correction's field list and in no line of its reasoning, which is the split `atCurrentCabinetDepth`'s own doc comment already makes. Nothing here re-derives an extent on any axis. **O2 would have cost Gap D its depth axis entirely** — measured, 720 → 400 — which is why O2 is refused. |
| ADR 0011's 2026-08-26 correction | One design must not answer two ways depending on the route taken to it. | **Satisfied by construction**, decision 4: the surplus predicate reads `column.d` and the document's own `settings.cabinetDepthMm`, both fields of the design being mutated. |
| [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) | The wall map is 330 at 600 and 400 at 700; a declaration, never a computation; two numbers must not agree by luck. | **The ratchet is its defect in mirror image** — a 400 mm opening in a 600 mm kitchen — and is the reason decision 3 overturns that half. Its map is also why *"everything becomes 600"* cannot be read literally (decision 7). |
| [ADR 0036](0036-a-declared-dimension-is-the-finished-cabinet.md) decision 5 | The owner: every cabinet adapts automatically; depth follows the setting with **no confirmation step and nothing left behind**; the mechanism is the project's. | **This instruction is that ruling restated and extended to empty spaces.** The outcome/mechanism split is repeated in the owner's own *"already you decided the mechanism, but this is the requirement"*. |
| [ADR 0044](0044-an-empty-space-is-recorded-in-the-design-document.md) | A member-less column is recorded because nothing can reconstruct it; the space is the customer's. | **The reason O1 and O2 are refused where they shrink a freed opening.** A space the customer created is not the rule's to collapse. |
| [ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | A load that refuses is a dead link; 5 stored rows exist at `schema_version` 1. | **Decision 5.** Nothing here refuses a document, and the legacy population is answered at read time rather than migrated or rejected. |
| [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md) | The frozen map is recorded whole, in two arrays partitioned by one predicate; no bump for an absent optional field; containment proves nothing about depth. | **Untouched.** No shape changes, no stored value is rewritten, no depth clause is added to the validator. |
| [ADR 0055](0055-a-depth-change-migrates-the-stored-design.md) decision 1 | A depth change migrates the stored design through the normal command path; every body adapts, nothing left behind. | **The clause the ratchet violates**, for the one population where it still bites, and the clause decision 4 restores. |
| [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md), [ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md) decision 2 | A depth fact is declared per entry; a build depth is a declared size, never a measurement of what happens to stand there. | **ADR 0058 is what refutes O1**, exactly as it refuted the `columnBuildDepthM` floor in ADR 0079 decision 4: a 742 mm machine niche made to follow the setting is a pin unpinned. ADR 0060 decision 2 is why `columnBuildDepthM` stays a ceiling and is never asked to express a base run. |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) decisions 1, 2, 5, 6, 7, 8 | The recorded `buildId`, the exact re-answer, the refusal of *"it stays put"*, no bump, nothing refused, the merge's template. | **All confirmed by the instruction and none revised.** Decision 2's exact re-answer in both directions is precisely what the owner asks for, measured. |
| ADR 0073 decision 3 | An extent that cannot be re-answered is deepened to the declared build depth **and never shallower**. | **Partly overturned, decision 3 above.** The surplus half stands; the never-shallower half is dropped where `column.d` is not deeper than the build depth at the setting the design is leaving. |
| ADR 0073's stated residual | *"A pre-ADR-0073 cleared base column frozen at 620 stays 620."* | **Confirmed and re-scoped**, decision 5: it is a statement about documents written before wave 6K-c, not a standing product behaviour, and the measurement shows why keeping it is the least-wrong answer available. |
| [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md) decisions 1–9 and its amendment | The pairing invariant, the store's MAX naming its winner, no floor on the recorded arm, the millimetre epsilon, the tie-break, `isAllowedShrink`. | **All confirmed, none revised.** Its amendment section A already ruled the decrease the owner now confirms; its decision 4 already refused the `columnBuildDepthM` floor on the *recorded* arm, and decision 4 here keeps the fallback out of that arm. Decision 4's new arm needs one more `isAllowedShrink` case: a fallback-produced depth following the setting down. |
| [ADR 0038](0038-pre-release-no-stored-designs-no-migrations.md) | No migration is owed pre-release; code kept alive solely to read an older shape is dead code. | **Decision 5.** It licenses answering the legacy population at read time rather than migrating it, and it is the reason the fallback arm is not grown any further. |

Nothing found in the sweep contradicts this decision. Two things the **instruction** contradicts are
reported in decision 7 rather than resolved here.

## Consequences

- **Wave 6K-c closes on its current scope, unwidened.** Every criterion it carries is confirmed by
  this record; none is added to it.
- **New wave 6K-j** implements decision 4 — see
  `docs/milestones/M6-price-and-global-settings.md`. Three production lines and a predicate, measured
  in a copy of the tree: the only published depth that changes on the fixture is the ratchet.
- **ADR 0073's residual paragraph and wave 6K-c's residual sentence are re-scoped, not deleted.** The
  base column frozen at 620 still stays 620 and that is still the right answer; what changes is that
  the sentence names the population (documents written before 6K-c) rather than reading as a standing
  rule about empty spaces.
- **The closure is now a thing to assert rather than a thing to believe.** That no current-schema
  document reaches the fallback arm at all is what makes decision 5 true, and it holds only while
  every producer of a column carries a source. 6K-j pins it.
