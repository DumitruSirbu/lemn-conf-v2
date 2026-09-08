# ADR 0102 — A recorded source must explain its own depth, and a second authority written into a test is the defect laundered

Status: Accepted (**confirms [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md)
decision 10 point 2 unchanged and unnarrowed**; applies
[ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decision 7 and
[ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md)
decision 1; **amends [ADR 0101](0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md)**
by naming what it did not scope; **overturns nothing**)
Date: 2026-09-08
Type: Finding + Decision (adjudication)
Milestone: M6 — adjudicates the finding the item 8 implementer raised and refused to treat as
settled; opens a wave and records one owner question

## Context

Implementing ADR 0101, the item 8 wave's developer reported that ADR 0079 decision 10 point 2's
pairing invariant *"is false for a wall body over a full-height column, and ADR 0101 does not scope
it"*, and shipped a second authority in `apps/web/tests/support/frozen-source-invariant.ts` —
`sourceExplainsTheDepth` — that returns the number `resolveDepthM` would plan for a body rebuilt in
that column, offered only to a wall-band source in a column that lifts the head-clearance cap. The
same exemption was added to the document half, and `reAnswersOneBody` in
`qa-6k-c-frozen-source.adversarial.test.ts` was extended across ADR 0022's permanent swap. The
developer closed with *"this re-quantifies an instrument ADR 0101 did not rule on; I would not treat
it as settled."*

That judgement was correct, and this record settles it.

### Everything below was measured on 2026-09-08, at `ed12804`, not argued

Driven through the real commands — `removePlacement`, `insertBody`, `setCabinetDepth`,
`deriveColumns`, `projectFrozenMap` — with the domain's own `createFakeProbe`. Each line is a
verbatim reading, not a paraphrase.

**1. The reported pair reproduces exactly, on the shipped kitchen, after one ordinary command.**

```
SHIPPED (post ADR 0101)
  at load (600):                    []
  after setCabinetDepth(700):       ["B|1.90 d=700.0 src=wall-cabinet declares 400.0 at 700"]
  after setCabinetDepth(600):       ["B|1.80 d=600.0 src=wall-cabinet declares 330.0 at 600"]
```

The document carries the same pair, so it is saved and reloaded rather than being a session slip:
`{"wall":"B","alongMm":1900,…,"depthMm":700,"depthFromBuildId":"wall-cabinet"}`.

**2. The same kitchen on the catalogue as it stood *before* ADR 0101's wave — the two deep tops
pinned at a 600 mm finished depth, seated at 561 at every setting — does not violate it at either
setting.**

```
PRE ADR 0101 (pinned)
  at load (600):                    []
  after setCabinetDepth(700):       []   B|1.90 d=699.0 src=tall-pantry
  after setCabinetDepth(600):       []   B|1.80 d=600.0 src=wall-2door-600-deep-top
```

**3. It is nevertheless genuinely pre-existing, and reachable at 600 mm through three ordinary
commands on declarations ADR 0101 did not touch.** Delete `p23`; insert the offered `wall-cabinet`
into `B|1.80`'s `y0` 2.2 void — the offer list returns `wall-cabinet`, `wall-lift` and `open-shelf`
as *offered* there, so this is a customer's route and not an authored one; then **one**
`setCabinetDepth(700)`:

```
  after delete + insert @600:       []
  after ONE setCabinetDepth(700):   ["B|1.90 d=700.0 src=wall-cabinet declares 400.0 at 700"]
```

The same strings appear at both settings if an ordinary `wall-2door-600-top` is simply standing where
`p23` does. `git diff a453d11 ed12804` confirms the parts this uses are untouched by the wave:
`wall-2door-600-top`, `wall-cabinet` and `tall-pantry-600`'s rows, `commands/insert-fit.ts`,
`commands/set-cabinet-depth.ts`, `occupied-depth.ts` and `deriveColumns`. **The mechanism is wave
6I2's** (`resolveDepthM`'s `if (column.hasFullHeightUnder) return declaredM;`,
`commands/insert-fit.ts:835`), and it has been on `main` since 2026-09-04.

**4. The false pair is cashed as a customer-visible depth, and the wave moves the shipped kitchen
269 mm.** Four ordinary commands — 600 → 700, delete `p23`, delete `p6`, → 600 — with the same
catalogue difference and nothing else changed:

| Step | pre-ADR-0101 (pinned) | post-ADR-0101 (lifted) |
| --- | --- | --- |
| load @600 | `B\|1.80 d=600.0 src=wall-2door-600-deep-top` | `B\|1.80 d=600.0 src=wall-2door-600-deep-top` |
| after 700 | `B\|1.90 d=699.0 src=tall-pantry` | `B\|1.90 d=700.0 src=wall-cabinet` |
| after both deletes | `d=699.0` | `d=700.0` |
| **back at 600** | **`d=599.0 src=tall-pantry`** | **`d=330.0 src=wall-cabinet`** |

330 is wrong under **both** of `frozenDepthAtThisSetting`'s arms, which is what makes it a defect
rather than a matter of taste. The recorded-source arm produced it from a body that never declared
600 or 700. The sourceless arm would have kept 700 as a surplus (ADR 0080 decision 4: the extent is
deeper than `columnBuildDepthM({ 700, hasFullHeightUnder: false })` = 400, so deeper-only applies).
And the honest re-answer of the body that actually stood there is 599, which is what the product gave
before this wave. **The extent also ends up shallower than the 600 it was frozen at, which is wave
6K-c's own criterion — *"nothing shrinks, in any arm"* — violated.**

**5. The instrument stops being able to falsify production at exactly the column the defect lives
in.** `sourceExplainsTheDepth`'s second arm reads `depthM`, `hasFullHeightUnder`, `band` and
`cabinetDepthMm`, and **does not read `declaredM` at all**. So for any wall- or top-band source in a
lifted column whose `d` equals `columnBuildDepthMm(cabinetDepthMm, true)`, every source id passes,
including one declaring 330, one declaring 620, and one naming a body that was never there. In the
shipped kitchen that is one column at each setting — `B|1.80` at 600 (`B|1.20` is 638 and `B|2.45` is
742, so both stay inspected) and `B|1.90` at 700 — and it is the column the pair disagrees in.

### Classification

**An implementation defect, pre-existing, plus a test-fidelity problem introduced by this wave.**
Three parts, and they are not the same finding:

- **The defect is wave 6I2's, dated 2026-09-04.** `resolveDepthM` builds a wall body over a lifted
  column to `columnBuildDepthM`'s declared line, and `restoredColumns` (`void-engine.ts:668`) then
  records `depthFromBuildId: deepest.buildId` for a depth that member's entry does not declare. Two
  correct rules with nothing between them: the build side stopped reading the entry and the record
  side went on naming it.
- **ADR 0101's wave is a regression in *reach*, not the cause.** Measurement 4 is the whole of it: a
  state the shipped kitchen could not reach without a delete and an insert is now four ordinary
  commands from the demo, and it moves a published depth by 269 mm.
- **`sourceExplainsTheDepth` is the test-fidelity problem**, and it is the reason this needed an
  adjudication rather than a bug report.

**Not a contract gap.** ADR 0079 decision 10 point 2 states the rule; ADR 0080 decision 4 already
states the other half of it in production's own words — *"`columnBuildDepthM` is a declared size and
no body's declaration, so claiming one for it would be an invention"*. Nothing was missing from the
contract. `restoredColumns` simply does not obey it.

## Decision

### 1. ADR 0079 decision 10 point 2 is right. It is confirmed unchanged, and nothing in it is struck

The predicate is not narrower than its wording and must not be scoped:

> for every published column, either `depthFromBuildId` is absent or the catalogue does not hold it,
> or that entry's `occupiedDepthOfEntryM` at the design's own declared setting equals `Column.d`.

It is not a test convention. It is the **precondition of a production computation**:
`frozenDepthAtThisSetting` (`frozen-map-at-cabinet-depth.ts:391`) republishes a member-less extent as
`occupiedDepthOfEntryM(recorded)` and keeps that source id. Where the pair disagrees, that line
publishes a depth nothing in the kitchen ever had — measured at 330 above. **A predicate whose failure
is a wrong number on screen and in the database is an invariant, and an invariant is not re-quantified
to accommodate the code that breaks it.**

ADR 0079's own amendment (2026-09-05, part A) is the boundary that *does* exist and it is a different
one: a decrease is correct when it is *the same body's declaration at two settings* — 699 → 599 for
`tall-pantry`. That arm is untouched here. What ADR 0101's wave produced is not one body re-answering;
it is a body answering for a number it never declared.

**So decision 10 point 2 gets an amendment in ADR 0079 that records this violation and its date, and
no change to its text.** A dated record of where a rule is currently broken is not the same as
narrowing the rule, and this record refuses to let the two be confused.

### 2. `sourceExplainsTheDepth` is refused as a second authority, on rules this project already recorded

[ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decision 7:

> **An invariant edited to accommodate a defect is the defect laundered.**

[ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md)
decision 1 supplies the three questions that decide whether a rewrite is admissible, and this one
fails two of them. **It is not a close call, and the questions are answered by reading code:**

- **Q1 — whose claim is it?** *"Delete the assertion in your head: does any customer-visible or
  contract-level fact change?"* **Yes** — measurement 4. A published and saved column depth moves from
  599 to 330. So this is an **invariant**, and ADR 0091 decision 1 gives *"no licence at all"*.
- **Q2 — is the premise false because of a dated ruling, or because of a wave's code?** *"A premise
  that is false because of a wave's code is a defect and Q2 fails."* The falsifying fact here is wave
  6I2's `resolveDepthM`. **No dated decision has ever ruled that a body may be recorded as the source
  of a depth it does not declare** — and ADR 0080 decision 4 rules the opposite for the arm that
  already faced the question. Q2 fails.
- **Q3 — three limbs, of which the implementation has one.** It asserts a surviving true statement.
  It does **not** assert the negation of the retired premise positively and by measurement, and it
  carries **no named wave**. ADR 0091 says exactly this case: *"A rewrite that only performs the first
  of those three is the laundering ADR 0090 decision 7 forbids, whatever its justification."*

ADR 0091's corollary is the one that fits: *"When an instrument premise turns out to also be a product
claim … the two are separated and only the instrument half is re-quantified. The product half is never
weakened; it is promoted to a finding and a wave."* Here the product half is the whole of it.

> **The ruling: `sourceExplainsTheDepth` does not stand as an authority, and no reader of it may cite
> it as one.** Its second arm currently makes the check unable to inspect the one column the defect
> lives in (measurement 5), which is the failure an adversarial suite exists to prevent.

**It may remain on the tree, for one wave and no longer, only in the shape decision 3 sets.**

### 3. The admissible interim shape, and it is ADR 0091 decision 1 Q3's three limbs with nothing dropped

Because the wave is already implemented and the alternative is holding a branch that carries far more
than this, the exemption may stay **provisionally** — renamed so nobody reads it as a ruling, and
completed. Three work items, all three mandatory, and a wave that lands one or two of them has not met
this decision:

**(a) Narrow it so it cannot blind the check.** The exemption must be keyed on the **body that is
actually standing there**, never on a coincidence of numbers. Concretely: it may fire only where the
column's own deepest member carries the recorded `buildId` *and* that member's recorded seat is the
one `resolveDepthM`'s lifted arm produces — `columnBuildDepthMm({ cabinetDepthMm, hasFullHeightUnder:
true })` less the entry's declared front assembly. A column carrying a source no member has, or a
source whose seat is something else, then fails as it did before, and 6K-c's F1 shape stays
catchable in a lifted column.

**(b) Assert the negation positively, by measurement.** A test must pin, as a fact with its witness,
that `B|1.80` at 600 and `B|1.90` at 700 **do** carry a source that does not declare their depth, and
that the extent falls to 330 through the four commands in measurement 4. It goes red the day the
production fix lands, and this record is re-opened deliberately rather than by someone noticing. This
is the limb whose absence made the change laundering.

**(c) The obligation is a named wave, not a comment.** It is named in decision 4 and is a work item
before M6 closes.

**Renaming.** `sourceExplainsTheDepth` claims in its own name that the source explains the depth,
which in the second arm is precisely the false statement. It becomes something that says what it is —
`isExplainedOrIsTheKnownLiftedColumnDefect`, or any name whose reader cannot mistake it for a rule —
and its doc comment cites this record, not ADR 0079.

**The extension of `reAnswersOneBody` across ADR 0022's permanent swap is separate and stands.** A
seeded row rebuilt into its `catalogEquivalentId` genuinely is one body under two names; that is
ADR 0022's own ruling read correctly, it narrows nothing, and it would be needed even with the defect
fixed. It is recorded here so a later reader does not revert it along with the exemption.

### 4. The production fix, and the principle it is already owed

The wave is **6Y — a depth no entry declares carries no entry's name**, and its subject is
`restoredColumns` in `void-engine.ts`, not the test helper.

The principle is not new and is quoted from the code the fix has to agree with
(`frozen-map-at-cabinet-depth.ts`, ADR 0080 decision 4):

> `columnBuildDepthM` is a declared size and no body's declaration, so claiming one for it would be an
> invention.

`restoredColumns` claims one. `deriveColumns` records `deepest.buildId` unconditionally, including
where that member's occupied depth came from the column rather than from its own entry — which is
exactly the invention that sentence refuses, arriving through the other door.

**Two shapes are admissible and the wave's plan picks between them on measurement, not on taste:**

- **Record no source for a depth the lifted arm produced.** Cheapest and directly obeys the sentence
  above; the extent then falls to ADR 0080 decision 4's fallback, which measurement 4 shows keeps 700
  rather than 330. Note that ADR 0079's alternative (b) — *"drop the source when it stops explaining
  the depth"* — was **refused for the general case** on the ground that information the product holds
  would be thrown away. That refusal is not automatically binding here and must be re-argued rather
  than assumed either way: in this population there is no body whose declaration is the answer, so
  there may be nothing to throw away. **The wave states which it is, with the measurement.**
- **Record the member that *does* explain it** — the deepest member whose own declaration equals the
  column's depth, which in the measured case is `tall-pantry-600` at 599/699 and reproduces the
  pre-ADR-0101 behaviour exactly. This keeps information and needs a stated rule for the case where no
  member explains the depth.

**Two constraints on either shape, both falsifiable:**

- **ADR 0079 decision 9 binds.** *"No rule here changes a published depth, only the record beside
  it."* This wave **does** change published depths in at least one state (330 → something), so it owes
  the same discipline in the opposite direction: an enumerated list of every state whose published
  `Column.d` moves, each with its before and after, and a demonstration that the 600 mm kitchen as it
  loads is byte-identical.
- **The stale comment goes with it.** `frozenDepthAtThisSetting`'s doc comment still reads *"a
  `manufactured-size` machine and ADR 0058's two pinned tops declare `finishesAtMm` … so a column
  cleared of one does not move."* ADR 0101 removed that population. A file that argues from a fixture
  that no longer exists is how the next reader is misled.

### 5. What ADR 0101 did not scope, recorded there as an amendment

ADR 0101 ruled three questions the fix owed and got all three right. It did not reach a fourth,
because nobody had measured it: **that the wave moves the shipped kitchen into a population where a
pre-existing pairing defect is reachable, and moves a published depth by 269 mm in doing so.** Its
decision 4 — *"the 600 mm kitchen is byte-identical"* — is true **as the kitchen loads**, which is what
it says and what was checked. It is not true after four ordinary commands, and the difference between
"as it loads" and "in every reachable state" is the gap this record fills. Nothing in ADR 0101 is
struck.

### 6. Merging `fix/m6-remediation` to `main`

**Not blocked by the pre-existing defect — blocked by decision 3, and decision 3 is three edits in one
test-support file.**

The two halves are separated on purpose, because they have opposite answers:

- **The 6I2 defect does not block.** It is already on `main`, it is reachable there today through
  three ordinary commands, and holding this branch fixes nothing. `main` is not a release — nothing
  ships until every milestone is done — so merging exposes no customer, and the fix is wave 6Y's, which
  nobody has planned yet.
- **The laundered invariant does block, and cheaply.** Merging `sourceExplainsTheDepth` as written
  puts a second authority into `main` that ADR 0079 never ruled, blinds an adversarial check at the one
  column that matters, and does it in the exact shape ADR 0090 decision 7 and ADR 0091 decision 1
  refuse. That is the thing this project has agreed not to do.

> **The ruling: the branch merges as soon as decision 3's three limbs land in
> `apps/web/tests/support/frozen-source-invariant.ts` and the two suites that read it.** The block is
> one file and a witness test, not the branch's other hundred-odd. No production code changes to
> unblock the merge — wave 6Y is a separate wave with its own plan, QA and review, per
> `docs/WORKFLOW.md`.

Recorded plainly so tomorrow is not spent re-deriving it: **the answer to *"does this block merging"*
is yes, and the work to unblock it is decision 3, which is small and fully specified above.**

## Not decided here — one question for the owner

**A deep top loses 200 mm when the column beneath it is deleted, and nobody has ruled that trade.**
Measured, same four-command discipline as above:

```
POST ADR 0101   load @600: p23 seat 561.0
                after deleting the pantry (p6) @600: p23 seat 561.0
                after setCabinetDepth(700):          p23 seat 361.0   (a 400 mm finished top)

PRE  ADR 0101   … after setCabinetDepth(700):        p23 seat 561.0   (held by the pin)
```

Delete the pantry, keep the top, change the depth, and a cabinet the customer never touched goes from
600 mm finished to 400 mm. The rule producing it is correct and already ruled — ADR 0028 decision 5
and ADR 0060 decision 2: with no full-height member there is nothing to lean over, so §5.2's
head-clearance cap re-applies. What has never been decided is whether that is the **product** the owner
wants, and it became reachable only because ADR 0101 put the shipped tops on the lifted arm.

**This record does not decide it**, because it is a question about what the customer should see and
about a trade the owner has not made. The two candidate answers, so the owner is not asked to invent
one: *(a)* leave it — the cap is a head-clearance rule and there is now a worktop to lean over; *(b)*
a top that was built deep holds its depth until it is itself replaced, which needs a new declaration
and is not a small change. **Nothing in wave 6Y turns on the answer**, so 6Y is not held for it.

## Alternatives considered

- **Rule ADR 0079 decision 10 point 2 "right but narrower", and scope it to bodies whose seat the
  entry governs.** The shape the brief offered and the tempting one, since it would ratify the
  implementation with a stroke. **Rejected on measurement 4**: the population it would carve out is
  exactly the population where production publishes a wrong depth, so the "narrowing" would be a
  statement that the rule does not apply where it is being broken. ADR 0091 decision 1 Q1 answers
  *invariant*, and that ends it.
- **Revert `sourceExplainsTheDepth` tonight and hold the branch until wave 6Y lands.** The strictest
  reading of ADR 0090 decision 7, and it was seriously considered: reverting turns three store suites
  red, which is the honest signal. **Rejected as disproportionate** — it holds ~120 files of unrelated
  remediation against a defect that is already on `main`, and it produces no fix, only a red tree. The
  three limbs of decision 3 preserve everything the revert was protecting: the check regains its
  ability to fail, the breach is pinned positively, and the obligation becomes a wave.
- **Move the second authority into production — teach `frozenDepthAtThisSetting` to re-answer a
  lifted wall source through `columnBuildDepthM`.** Genuinely attractive: it puts the rule where there
  is one author, and the test then reads production rather than mirroring it. **Not rejected — deferred
  to wave 6Y as a third candidate**, because it is a change to a published depth in more states than
  the two shapes in decision 4 and needs the enumeration decision 4 requires before it can be chosen.
  It is recorded here so 6Y does not rediscover it.
- **Declare the deep tops' `occupiedDepth` as `wall-plane` `finishesAtMm(cabinetDepthMm)` so the
  entry's declaration equals the built depth and the pair agrees by construction.** It would close the
  shipped kitchen's case with one line. **Rejected**: it is ADR 0101's own rejected alternative wearing
  a new hat — these rows genuinely are `recorded-shell`, and it fixes nothing for the ordinary
  `wall-cabinet` that measurement 3 puts in the same column, which is where the defect actually lives.
- **Record it in `docs/BACKLOG.md` and rule nothing.** Rejected: the developer escalated precisely
  because a gate had been widened, and a widened gate that nobody rules on is how a gate stops looking.
  A backlog entry is written **as well** (entry 56), for the product half.
- **Treat the whole thing as ADR 0093's "a rule the shipped kitchen cannot exercise".** It looks
  adjacent and is not: 0093 is about a rule with no population, and this is a rule with a population
  that is failing it.

## Records swept before deciding, and how each is settled

| Record | What it says | Settled how |
| --- | --- | --- |
| [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md) decision 10 point 2 | The pairing invariant as a state predicate, in a shared helper the ordinary store suite calls. | **Confirmed, unchanged, unnarrowed** (decision 1). Given a dated amendment recording where it is currently violated. |
| ADR 0079 decision 9 | *"No rule here changes a published depth, only the record beside it."* | **Binds wave 6Y in the opposite direction** (decision 4): 6Y does move a published depth, so it owes the enumeration. |
| ADR 0079 amendment A (2026-09-05) | A decrease is correct where it is the same body's declaration at two settings. | **Untouched and distinguished.** That arm is `tall-pantry` 699 → 599 and is not what happens here. |
| ADR 0079 alternative (b), *drop the source when it stops explaining the depth* | Refused, because information the product holds would be thrown away. | **Named, not silently overturned** (decision 4). It is a candidate again only because in this population there may be no body whose declaration is the answer, and the wave must re-argue it rather than assume the old refusal or ignore it. |
| [ADR 0080](0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md) decision 4 | A depth `columnBuildDepthM` produced carries **no** source, because claiming one would be an invention. | **The principle the fix is already owed** (decision 4). `restoredColumns` violates it through the other door. |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) decisions 1, 2, 3 | The entry records the `buildId` whose clearance supplied its depth; a depth change re-asks it. | **Unchanged.** This record says the recorded id must be one that *can* be re-asked, which is decision 1's own premise. |
| [ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decision 7 | *"An invariant edited to accommodate a defect is the defect laundered."* | **Applied directly** (decision 2). Not narrowed. |
| [ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md) decision 1 | Three questions decide whether an instrument premise may be re-quantified; failing any one, ADR 0090 decision 7 binds. | **Applied in full and it fails Q1 and Q2** (decision 2). The implementer cited this record as licence; read to its own Q2 it is the refusal. |
| [ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md) decisions 1, 2 | A rule the tree cannot distinguish from its own absence is unshipped; the test declares its own witness. | **Obeyed and extended** (decision 3b). The exemption owes a witness that goes red when the defect is fixed, which is 0093's duty read in the other direction. |
| [ADR 0101](0101-a-lifted-columns-depth-is-declared-and-the-three-deep-tops-follow-the-setting.md) decisions 1–5 | The item 8 wave's three rulings, plus the 600 mm identity and ADR 0028 decision 5's struck clause. | **All stand.** Amended only by naming the fourth question it did not reach (decision 5). Its decision 4's *byte-identical at 600* is true as the kitchen loads and is not a claim about every reachable state. |
| [ADR 0060](0060-a-column-publishes-a-build-depth-beside-its-clearance.md) decisions 1, 2, 5 | A build depth is a declared size; the lift makes the declared line a target. | **Confirmed.** The build side is correct; the record beside it is not. |
| [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md) decisions 4, 5 | A declaration, never a computation; a full-height member lifts the cap. | **Confirmed.** Decision 5 is also what makes the owner question above a *ruled* behaviour rather than a defect. |
| [ADR 0022](0022-seeded-entries-declare-their-catalogue-equivalent.md) | A seeded entry declares its catalogue equivalent, and identity is never guessed. | **The reason `reAnswersOneBody`'s extension stands** (decision 3). |
| [ADR 0011](0011-m3-insert-contract-gaps.md) Gap D | A column's extent is frozen; `hasFullHeightUnder` is re-answered every derivation. | **Obeyed.** Measurement 4's deletes leave the extent frozen and only the predicate moves, which is why the wrong depth surfaces at the *next* depth change rather than at the delete. |

Nothing found in the sweep contradicts this decision, and nothing here overturns a dated ruling.

## Consequences

- **`fix/m6-remediation` merges after decision 3, not before.** Three limbs in
  `apps/web/tests/support/frozen-source-invariant.ts`, a rename, and a witness test. No production
  file changes to unblock the merge.
- **Wave 6Y is opened** — *a depth no entry declares carries no entry's name* — against
  `restoredColumns` in `packages/configurator-domain/src/void-engine.ts`, with ADR 0079 decision 9's
  enumeration as its first acceptance criterion and `frozenDepthAtThisSetting`'s stale pinned-tops
  comment as a work item that travels with it.
- **`docs/BACKLOG.md` entry 56** records the product half — the 269 mm shallower empty column — so the
  finding survives independently of whether 6Y is scheduled this milestone.
- **The three suites that read the helper** (`cabinet-depth-frozen-source.test.ts`,
  `qa-6k-c-frozen-source.adversarial.test.ts`, `cabinet-depth.test.ts`) are the whole blast radius of
  decision 3. `qa-6k-c`'s `isItsSourcesDeclaration` already routes through the shared predicate rather
  than restating it, which is ADR 0088 decision 2 obeyed, and it is why narrowing the predicate reaches
  both readers at once.
- **One owner question is written down and not decided**, above. It is not on 6Y's path.
- **Nothing here re-baselines M1's parity gate**, and nothing here moves the 600 mm kitchen as it
  loads. Both were checked against measurement 1's first line.
