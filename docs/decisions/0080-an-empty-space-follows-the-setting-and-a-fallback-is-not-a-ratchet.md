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

## Amendment, 2026-09-05 — decision 4's predicate is an equality, not a bound

Ruled after wave 6K-j's implementation landed, on adversarial QA's two files
(`apps/web/tests/store/qa-6k-j-fallback-rule.adversarial.test.ts`,
`qa-6k-j-closure.adversarial.test.ts`), re-run for this amendment on 2026-09-05. **Decisions 1, 2, 3,
5, 6 and 7 are unrevised.** Decision 4's rule is corrected in one operator, and one sentence it makes
about that rule is withdrawn and replaced by the same sentence made true.

### A. The finding, upheld: the asymmetry runs both ways, and `hasFullHeightUnder` is not the cause

Decision 4 says *"`hasFullHeightUnder` … can only ever make this rule keep more"*, and the wave's
criterion and `apply-command-result.ts`'s comment repeat it. **It is false**, and QA's failing
assertion is `expected 600 to be close to 620`. The falling direction is the only one the sentence
considered: a deleted full-height member lowers the freeze-time ceiling 600 → 330 and a frozen depth
that sat on it becomes a surplus. The **rising** direction was not considered and is reachable — an
inserted `tall-pantry` at `widthFlex: "fit"` spans 1300–2100 and overlaps `A|2.00`, and
`isFullHeightUnder` is asked by overlap rather than by membership, so a member-less 620 mm slot reads
`true`. The ceiling rises 400 → 700, a genuine 620 falls under it, and the rule reads it as its own
previous answer and follows the setting to 600.

**Classified as a contract gap in this record, not an implementation defect.** The implementation is
faithful to decision 4 line for line; decision 4 is what is wrong.

### B. The root cause is the operator, and the coordinator's diagnosis is half right

The reading offered — *a fact about the current state used to reconstruct a freeze-time ceiling, which
is ADR 0011's 2026-08-26 correction in its own shape* — is right about the danger and **wrong about
where the defect is**. `hasFullHeightUnder` is not what breaks; `<=` is.

**Every depth this rule publishes is either `columnBuildDepthM` exactly, or a surplus strictly above
it.** The follow arm returns `declaredM` unchanged, and the surplus arm returns `max(column.d,
declaredM)`, which is `declaredM` exactly when `declaredM` wins. So *"a depth this rule itself could
have published at the setting being left"* is an **equality**. Written as `d - atFreezeM <= ε`, it
additionally swallows every depth **below** the ceiling — and that is F1 whole: a raised ceiling
swallowing a 620 that no version of this rule ever published.

The two forms differ on exactly one shape: `declaredM < column.d < atFreezeM`, which is a decrease
whose frozen depth lies strictly between the two ceilings. Below `declaredM` the surplus arm's own MAX
returns `declaredM` anyway, so the answers coincide; above `atFreezeM` both call it a surplus.

### C. The rule, corrected

> Decision 4's first bullet reads: **if `column.d` equals `atFreezeM` within
> `FROZEN_SURPLUS_EPSILON_M`, the answer is `newM` exactly, in both directions, and it carries no
> source.** Otherwise it is a surplus and ADR 0073 decision 3 is unchanged.

In the code this is `Math.abs(query.column.d - atFreezeM) <= FROZEN_SURPLUS_EPSILON_M`. The float
band is already justified where it stands and QA already pins the reason it is safe (*"publishes the
ceiling bit-for-bit, so the next call subtracts to exactly zero"*).

**The withdrawn sentence returns as a theorem instead of an assumption.** With an equality, a
`hasFullHeightUnder` that flipped between the freeze and now makes the comparison **fail**, and a
failed comparison routes to the surplus arm, which keeps `max(column.d, newM)`. So the asymmetry
genuinely runs one way — *"it can only ever make this rule keep more"* — and now it is true in both
directions of the flip rather than in one:

- `true → false`: a 600 published under the lifted arm meets a 330 ceiling, is read as a surplus, and
  is kept.
- `false → true`: a 400 published under the capped arm meets a 700 ceiling, is read as a surplus, and
  is deepened to 600 by the MAX. Deeper, never shallower.

### D. None of the three candidates raised, and why each fails

- **Take the ceiling that keeps more — `min` of the two `hasFullHeightUnder` readings.** It is not a
  third option: `columnBuildDepthM` is 330/400 with the predicate false and 600/700 with it true, so
  the `min` **is** the capped arm, and this candidate is identical to the next one.
- **Drop `hasFullHeightUnder` from the freeze-time operand.** It **reintroduces the ratchet for every
  full-height column**, which is the defect this wave exists to end: a member-less column reading
  `true` takes the fallback's 700 at the deeper setting, and against a capped freeze-time ceiling of
  400 that 700 is read as a surplus and held at the 600 mm setting — 100 mm proud, the owner's own
  sentence, one column over.
- **Record the freeze-time reading.** Refused twice. It is a persisted field, which decision 6 and
  wave 6K-j both forbid; and it re-freezes the live predicate ADR 0011's 2026-08-26 correction
  deliberately unfroze, whose stated reason is that *"which depth the customer got was decided by the
  route they took to the design, not by the design"*. A frozen `hasFullHeightUnder` is that defect
  restored for the sake of a rule that does not need it.

### E. The finding's size, re-measured — QA's 99 mm is against a baseline that is itself wrong

Reported because it changes what the owner is told, not to diminish the finding.

QA sizes the loss against *"ADR 0073 decision 3 as 6K-c ships it"*. On the column the 99 mm figure
comes from, that baseline is 100 mm wrong. Measured over **every deletable placement** on the shipped
fixture across four states each — QA's own closure sweep, re-run under both rules on 2026-09-05, with
the *sourced twin* as the truth:

| Entry | truth (sourced) | 6K-c | 6K-j |
| --- | --- | --- | --- |
| `delete p23 @600 B\|1.80` | 599 | **700** | **600** |
| `delete p23 @reload B\|1.80` | 599 | **700** | **600** |
| the other 8 entries | — | identical | identical |

So on this sweep 6K-j is **never worse than 6K-c and is 101 mm better on two entries**, and the
delta set is 10 entries under both rules and under the corrected predicate as well — the correction
changes nothing the fixture reaches. The genuine F1 harm is the **20 mm** on QA's own failing
example, where a legacy depth is a base run's 620 under a column that now reads full-height, and
section C closes it. **A cleared `tall-pantry` niche following the setting to 600 is not a 99 mm
loss** — the sourced answer is 599, and the 699 it is measured against is the stale depth this whole
family of records exists to end.

### F. F2 — the ratchet already written into a document survives the load, and the owner is told

Upheld, and it is **declared behaviour rather than a defect**: decision 4's own sentence — *"a
document at 600 carrying an unsourced 400 and a document at 700 carrying an unsourced 400 are two
different documents and get two different answers"* — licenses it, and a rule that re-answered an
extent on load would be ADR 0055 decision 1's *"depth is never re-derived on load"* and ADR 0011
Gap D at once.

**But no criterion of the wave states it, and it materially shrinks what the wave delivers**, so it
is written here in customer terms and the coordinator is right that the owner should hear one
sentence: *a kitchen saved under the old rule with a 400 mm opening in a 600 mm run still shows that
opening on the next load, and follows the setting only after the depth is changed and changed back.*
The wave owes a criterion asserting it — QA's two tests already are it — not a fix.

### G. F3 — the closure is under **descent**, not by date, and decision 5's sentence is corrected

Decision 5 says *"an unsourced extent is written by no build from wave 6K-c onward"*, and
`apply-command-result.ts` repeats it as *"every column any build since then publishes carries a
source"*. **False of this build, by design:** decision 4's follow arm publishes a depth with **no**
source — ADR 0079 decision 2 requires exactly that, since `columnBuildDepthM` is no body's
declaration — and `projectFrozenMap` writes it into the document, which reaches the arm again on the
next load.

Corrected, and the corrected sentence is narrower rather than weaker:

> The population is **documents descended from one written before wave 6K-c**, closed under descent
> rather than by date. No document whose columns all carry sources ever enters this arm, and a
> document that is already in it stays in it — but the arm converges: its answer is
> `columnBuildDepthM` at the design's own setting, which follows the setting in both directions, so a
> descendant is no worse off than its ancestor and is not accumulating error.

Decision 5's conclusion is unaffected: no current-schema document *enters* the arm, which is what
makes the ruling legacy-only. It is the phrase *"nothing new enters this arm"* that overstated, by
conflating entering with remaining.

### H. F4 — the headline criterion is scenario-bound and is withdrawn

*"Exactly one published depth changes"* and *"every other column, on every scenario, is
byte-identical"* were measured over six chosen scenarios. Broadened to every deletable placement the
legacy-versus-sourced delta is **10 entries across 6 columns**, including shallower legacy answers. The
criterion is not true as written and is not made true by section C.

**Replaced by a shape, which no scenario set bounds**: a legacy document may differ from its sourced
twin **only where the missing source is the whole point** — a chain `columnBuildDepthM` cannot express,
which is a base or corner run's 620/720 and 630/730 — and **never on a wall column at any setting**,
because the wall map is exactly what the fallback can express. The difference set is written out whole
rather than counted, since a count is what hid a slice once already (wave 6K-c's 2026-09-05
correction). QA's sweep is that criterion and needs no re-authoring.

### I. What may and may not be re-authored in QA's files

Section C turns QA's F1 assertion green and turns **two** of its siblings red, and both are
characterisations of the `<=` rule rather than of a defect: *"answers with the new ceiling below the
ceiling it is leaving"* asserts the swallowing directly, and *"collapses every legacy depth up to the
700 ceiling"* is the defect stated as a property. Re-authoring them to the corrected boundary is
legitimate; deleting them is not, and neither is relaxing the assertion that found the defect.

**The replacements must go red against the `<=` code**, demonstrated by running them there. The
boundary they pin is the new one: the arms switch at `column.d === atFreezeM` and at nothing else, so
a depth one millimetre either side of the ceiling it is leaving is a surplus, and only the ceiling
itself follows the setting.

Measured with the corrected predicate on 2026-09-05: QA's F1 test green, the closure sweep's delta set
unchanged at the same 10 entries, and the full web suite **1 477 passed, 4 skipped, 1 failed** — the
one failure being the characterisation named above, which section I requires re-authoring rather than
weakening.

## Second amendment, 2026-09-05 — the shape criterion enumerated chains, and the hazard it hid is exactly two entries

Ruled on logic review of wave 6K-j (*matches intent, no blocker*), which independently re-derived the
difference set over 22 deletable placements × 4 states and reproduced QA's snapshot. Re-measured here
on 2026-09-05 before ruling; the harness reproduces the same 10 entries. **Nothing in decisions 1–7 or
in the first amendment's sections A–I moves, except the two sentences named below.**

### J. The shape criterion is withdrawn a second time, and this time the phrasing is the defect

The first amendment replaced *"exactly one published depth changes"* — withdrawn for being bounded by
six chosen scenarios — with *"a legacy document may differ from its sourced twin only where the missing
source is the whole point, which is a base or corner run's 620/720 and 630/730."* **That enumeration is
false, and its own snapshot contradicts it.** Measured:

| entry | truth | legacy | chain that explains it |
| --- | --- | --- | --- |
| `delete p5 @700 B\|1.20` | 738 | 638 | `tall-oven-tower-600`, 638/738 — a tall run, not a base or corner one |
| `delete p23 @700 B\|1.80` | 699 | 700 | `tall-pantry`, 599/699 |
| `delete p23 @600 / @reload B\|1.80` | 599 | 600 | `tall-pantry` — **at the shallower setting**, not the deeper one |
| `delete p2 @600 / @reload A\|2.60` | 620 | 600 | `base-hob-2drawer-600` at the shallower setting |

The catalogue holds at least five chains the ceiling cannot express — 620/720, 630/730, 638/738,
648/748, 599/699 — plus the fridge's 742 and ADR 0058's pinned 600/600. **The criterion was written
from a scenario set, which is the mistake the criterion it replaced was withdrawn for.** Recorded as a
process finding, not only a content one: a shape stated by listing its instances is a scenario set
wearing a different word, and this record made that mistake twice in one day.

**Replaced by the reviewer's form, with one qualifier added:**

> A legacy document **never differs from its sourced twin where `columnBuildDepthM` could have
> expressed the sourced answer at _both_ declared settings.** Everywhere else it may differ, and the
> difference set is written out whole rather than counted.

No chain is named, so a catalogue change cannot age it out. Measured over the same 22 × 4 sweep:
**1 046 agreeing states, of which 264 are ceiling-expressible at both settings** — so the predicate is
non-vacuous — and **0 violations**: no state that is expressible-at-both differs, and all 10
differences carry a source the ceiling cannot express.

**The qualifier "at both settings" is load-bearing and is section K's subject.** Without it the
criterion is *false* for an entry that sits on the ceiling at one setting and off it at the other,
because the follow arm takes such a depth from the setting where it agrees to the setting where it
does not. There are exactly two such entries and they are ADR 0058's pins.

### K. The wall-column claim is true and its stated reason was false; the hazard set is exactly two

The first amendment justified *"never on a wall column, at any setting"* with *"the wall map is exactly
what the fallback can express."* **False of ADR 0058's two pins**, which are wall-family entries
declaring **600 at both settings** rather than 330/400.

Swept over the whole catalogue at both declared settings, for both readings of `hasFullHeightUnder`,
for entries that sit on `columnBuildDepthM` at one setting and off it at the other:

```
HAZARD ENTRIES 2
  wall-2door-600-deep-top     declared 600/600   ceiling (full) 600/700
  wall-2door-700-over-fridge  declared 600/600   ceiling (full) 600/700
```

**Exactly two, catalogue-wide, and they are the two ADR 0058 pins.** The consequence if one is reached:
a member-less column frozen at 600 reading `hasFullHeightUnder: true` sits exactly on
`columnBuildDepthM(600, true)`, the equality reads it as this rule's own answer, and it follows the
setting to **700** — 100 mm proud of a pinned depth.

**Ruled: restate the reason at entry level *and* assert the hazard at catalogue level.** Not as *"every
wall-family entry but the two pins declares the map"* — that is a second statement of the map, which
ADR 0028 decision 4 forbids, and it names the wrong population, since the hazard is not about the wall
family but about any entry that sits on a ceiling at one setting only. The assertion is the hazard
predicate itself, and it goes red the day a third entry joins the set.

**Why it is unreachable today, stated so the next person adding an entry knows what they are near.**
Measured on the fixture: `B|1.80` is the only column whose recorded source is a pin
(`wall-2door-600-deep-top`), and it holds `p6:tall-pantry-600:column` — a full-height member — so the
column is never member-less while that pin is its recorded depth. `wall-2door-700-over-fridge` never
wins its column's MAX at all, because `B|2.45` is the fridge's 742. **That is fixture-bounded safety,
and it is recorded as such rather than as a structural guarantee.** It becomes reachable the moment a
member-less column's recorded depth is one of those two 600s while the column reads
`hasFullHeightUnder: true` — a pinned deep top left alone in a column that a full-height body overlaps,
or a new entry declaring the same depth at both settings.

**It is not a 6K-j regression**, and that follows from the rule rather than from a run: with an
unsourced 600 and a `true` reading, ADR 0073 decision 3's MAX gives `max(600, 700) = 700` at the deeper
setting under 6K-c as well, and then holds 700 at the shallower one. This wave reaches the same 700 and
does not ratchet it. The pin is 100 mm proud under both rules; only 6K-j lets it come back.

### L. The 20 mm is closed in one direction, not around the round trip

The first amendment's *"section C closes it"* (section E) overstates, and the sentence is corrected.
Measured on the F1 shape — the cleared dishwasher slot holding an unsourced 620 with an inserted
`tall-pantry` overlapping it, so `hasFullHeightUnder` is `true`:

```
stored at 700 holding 620,  → 600 → 700 :   620 → 620 → 700    (both rules)
stored at 600 holding 620,  → 700 → 600 → 700 :
    this wave   620 → 700 → 600 → 700
    6K-c        620 → 700 → 700 → 700
```

**Reached from 600 the 620 is destroyed on the up-leg, under both rules**, by ADR 0073 decision 3's own
MAX: `max(620, columnBuildDepthM(700, true) = 700)` is 700, and the 620's identity is gone before this
wave's predicate is consulted again. Section C closes the **down-leg from a document stored at the
deeper setting**, which is the direction QA's failing assertion measured; it does not restore a depth an
earlier up-leg already replaced.

**Confirmed as the accepted trade, not reopened.** The deepening on the up-leg is decision 3's, and it
is what closes the only case in ADR 0073's residue that reaches a **built** body — a legacy wall column
frozen at 330 capping an inserted cabinet 70 mm shallower than its neighbours. Trading it away to
preserve a 620 is option O1, refused in decision 3 on 290 mm. Against the customer's 620 this wave's
600 is **20 mm** out and 6K-c's 700 is **80 mm** out, so the wave is four times closer at the setting
the customer is looking at, and — unlike 6K-c — it returns to 700 when the kitchen does.

### M. What each of the three changes

| Finding | Classification | Change |
| --- | --- | --- |
| The shape criterion enumerates chains | **Documentation defect in this record and in the wave's criteria.** No code is wrong. | Section J: the enumeration is withdrawn and replaced by the expressible-at-both-settings form, with its non-vacuity and violation count measured. |
| The wall-column reason is false | **Documentation defect plus a missing assertion.** The claim is true; the reason is not, and nothing pins the set that makes it true. | Section K: the reason is restated at entry level, and the catalogue-level hazard assertion is added to the wave. Fixture-bounded safety is named as such. |
| The round trip keeps 20 mm less | **Confirmed as the ruled trade**, not a defect and not reopened. | Section L: section E's *"section C closes it"* is corrected to name the direction it closes. |
