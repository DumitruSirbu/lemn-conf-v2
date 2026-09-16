# ADR 0121 — A thing is identified by what it is, never by what correlates with it, and the discriminating case is the one nobody screenshots

Status: Accepted (adjudication. **Extends [ADR 0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md)
decision 7 and supersedes nothing** — 0119 named this family in a coda, from its own drafting, and
said *"naming the family is worth more than the instance"*. This record takes it at its word: it
promotes the family from a coda to a record and gives it an authoring-time test. 0119 decision 7
stands unchanged and is not restated here)
Date: 2026-09-16
Type: Decision (adjudication)
Milestone: M7 — raised across waves 7D3, 7D4, 7D7 and ADR 0120 Amendment C. Cross-cutting from here

**Measured against `9258fa3`.** Every instance below was re-read at that commit or in the history
reachable from it, not taken from the brief that commissioned this record. **Two of the brief's
figures were wrong and are corrected in place**; a third claim could not be verified from the
repository and is marked as reported.

## Context

**One sentence: a thing is identified by something that merely correlates with what it is — its
shape, its role, its position, its id, its provenance-by-accident, its encoding — and the check that
was supposed to catch the difference cannot distinguish the two.**

M7 wave 7D3's reviewer named four forms of this on 2026-09-15, and that enumeration is the direct
ancestor of this record — *"they are one trap, not four"*, at
`docs/milestones/M7-room-and-presets.md:7481-7489`. **[doc-quoted]** What that note could not yet see
is that the trap is not confined to identifying a *cabinet*. Two more forms appeared within a day, and
one of them is not about identity in the tree at all: it is a file's **encoding**.

### The instances

| # | The key that was used | The thing it was meant to identify | How it was caught |
| --- | --- | --- | --- |
| 1 | wall **A** | the **wider** wall | measured, on instruction, after a reasoned answer |
| 2 | `storage:A:0` | the slot **after the hob in reading order** | the plan's author, re-reading the definition |
| 3 | `id === THREE_DRAWER_BASE_BUILD_ID` | **a drawer was composed** | QA, in its own work |
| 4 | `buildId === base-3drawer` | **a drawer stands in a composed slot** | a reviewer, reading past the passing suite |
| 5 | git's binary sniff | **this file is not source** | a reviewer, reading the bytes |
| 6 | ``/["'`]storage:/`` | **a module reads the id convention** | implementers, when the guard fired |

**1 — `chooseWallCut` is keyed on wall identity and the owner's rule is about wall width. [measured,
source-verified]** Recorded in
[ADR 0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md)
Amendment C2. The rule is *sink and hob on the wider wall, fridge on the narrower*.
`generation-priorities.ts:123-140` computes `preferred = kept[0]?.role === "fridge" ? 1 : 0` and sorts
the feasible cuts by distance from it; `capacities` enters only as the feasibility filter
`sumWidths(...) <= capacities.B && sumWidths(...) <= capacities.A`. **There is no comparison of A's
length to B's anywhere in the module.** Swept over the 8 615 accepted rooms the policy and
`minimumMet` both admit: the aggregate says *sink on the wider wall* **83.5 %**. Split by which wall
is actually wider, *hob on the wider wall* is **100.0 %** where A is wider and **21.2 %** where B is,
and the fridge is on the narrower wall in **0.0 %** of the **2 760** B-wider rooms that have one —
**the exact inverse of the rule, in 39 % of the accepted range.**

**2 — `storage:A:0` standing in for *the slot after the hob*. [doc-quoted]** Milestone D15.7. Position
standing in for reading order. The two definitions **agree at run 6 and differ only at runs 4 and 5**,
and D15.3's headline figure is the same under either — *"which is exactly why this was nearly
missed"*. The spatial reading is wrong in **6 660 rooms**, and the milestone records what would have
shipped: *"nothing else in this wave goes red when it is — the count, the widths and the provenance
all stay correct while the drawer stands at the wrong end of the kitchen."* **Caught in planning, by
the author of the plan, re-reading its own definition.**

**3 — two guards that asked the question in the defendant's own words. [doc-quoted, `d89a3b6`]** Wave
7D4 S4, QA's own finding F3. Two guards written to prove a drawer gets composed asked whether a body's
id equals `THREE_DRAWER_BASE_BUILD_ID` — **and the sabotage under test moves that very constant to
`"base-cabinet"`.** The filter then matched every door cabinet and the guard passed over a kitchen
composing no drawer at all. The parity file passed **12/12** the same way, its front counts read back
from the catalogue row each body was drawn from, self-consistent whatever the composer chose. **Found
by QA in its own work and reported rather than buried in a clean table.** The strengthened form is
mutation-verified: the identical sabotage now turns **7 domain and 3 parity tests red where it turned
none**.

**4 — a parity suite selecting storage bodies by build id. [measured, `9258fa3`]** 7D4's clean-code
review, finding 1. `storageBodiesIn` selected by build id, and the preparation module now carries
`base-3drawer`, so **every "a drawer exists" assertion was satisfied by preparation alone.** Measured
before the fix: with `drawerSlot` forced to `undefined` — the wave's central rule deleted outright —
**the file passed 15/15 while the domain suite went 8 red.** Measured after, same sabotage: **4 failed
/ 12 passed.** Both directions reproduced independently by the coordinator. **The reference room was
kept and re-justified as the counter-case**, precisely because it stands no drawer in a composed slot
at all.

**5 — one NUL byte making a source file binary to git. [source-verified, `a51d6ef`]** A literal NUL
where an escape sequence was meant, at line 260 of
`packages/configurator-domain/tests/generation/qa-7d4-body-choice.adversarial.test.ts`, pre-existing at
`7816634`. Git classified the file as binary, so every diff rendered *"Binary files differ"* and every
grep reported *"Binary file … matches"*. **`00152b8` changed 93 lines and deleted 136 in that file —
229 lines — and no one read the change**, not the implementer's reviewer and not the coordinator; the
repo-wide convention greps this project uses as gates **stepped over it silently and reported
success**. The commit that fixed it also withdraws a claim in `00152b8`'s own message: *"Diff read for
scaffolding"* — for this file that could not have been true. **The file identified as binary by one
byte was source, and the test inside it asserts that a provenance predicate answers by provenance and
by nothing that correlates with it.**

**6 — a convention guard that cannot tell a use from a mention. [source-verified, one half reported]**
`body-choice.test.ts:234` is ``const CONVENTION_IN_A_LITERAL = /["'`]storage:/``, and its own doc
comment calls that *"the prefix opening a string or a template"* — the backtick arm is there for
template literals. Executed against a doc comment containing `` `storage:A:0` `` in Markdown
backticks, **it matches**; against the object key `{ storage: 1 }` it does not; against
`"storage:" + w` it does. So a module that merely *discusses* the convention in prose is counted as a
module that *reads* it. `9258fa3`'s message records one implementer hitting this (*"pnpm test failed
once on criterion 22's guard"*). **The brief reports two implementers this wave; the repository
records one, and the second is carried here as reported rather than verified. [reported]**

**A seventh, live in the tree today and admissible only because a second assertion carries the
rule. [doc-quoted]** [ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md)
Amendment A, written the same day, calls its own case *"the type specimen"*:
`expect([DOOR_BASE_BUILD_ID, THREE_DRAWER_BASE_BUILD_ID]).toContain(base.buildId)` **passes whether
one slot takes the drawer or every slot does, which is the whole of what the ruling decided.** A
widened clause reads as an authority for the property it names while being unable to distinguish it.
It is admissible there **only** because `drawer-rows.test.ts:316-328` asserts set equality against
`slotsAfterTheHob(plan).slice(0, 1)`, so both *too many* and *too few* go red.

### Why this is not a testing-discipline problem

**The failure is not that the answer is wrong. It is that the answer is well-formed** — 0119 decision
7's observation, and it holds for every instance above. A build id exists. A slot id exists. A suite
reports 15/15. A grep reports a match. A sweep returns 83.5 %, a plausible percentage in range.
**Nothing in the shape of any of those results says it is about something else.** They are not caught
by looking harder at the output, which is why *"write better tests"* is not the remedy and why a
checklist item on a reviewer would not have found them.

## Decision

### 1. The family is one defect, and it now has six named forms

**Identifying a thing by something that correlates with what it is, rather than by what it is.** The
four forms 7D3's reviewer named, plus two found since:

| Form | The correlate | Instance |
| --- | --- | --- |
| **shape** | the `column` band, swept as `fridge-free` | 7D3, three times |
| **role** | `role === "storage"` sweeping in block columns — 32.8 % and 14.9 % of rooms | D12 |
| **provenance by convention** | `storage:` as a bare string repeated at each reader | criterion 22 |
| **position** | the tower's innermost-ness, held by an index and a doc comment | risk 16 |
| **identity** *(new)* | **wall A standing for the wider wall** | instance 1 |
| **encoding** *(new)* | **one NUL byte standing for "not source"** | instance 5 |

**The correction is the same for the first five: name the thing, and let one module own the name.**
The sixth is different in kind and is why the family had to be re-recorded rather than left in a
milestone risk: **the key was not chosen by anyone.** No author decided to identify source files by
the absence of a NUL byte; a tool did, silently, and every downstream gate inherited it. **A correlate
you did not choose is still a correlate, and it is the harder half** — you cannot re-read a decision
nobody made.

### 2. The authoring-time test: write the key and the thing as two sentences, and look at the nouns

**Cost: ten seconds. It catches instances 1, 2 and 4.** Write what the rule says and what the code
keys on, each as one sentence, and compare the nouns.

- *"The fridge goes on the narrower wall"* against *"the fridge goes on wall B"* — **`wall` and
  `width` are different nouns.** That is the whole of instance 1, visible without a sweep.
- *"The drawer goes in the slot after the hob"* against *"the drawer goes in `storage:A:0`"* —
  **`after` and `A:0` are different nouns.**
- *"A drawer was composed"* against *"a body carries `base-3drawer`"* — **`composed` and `carries` are
  different verbs, and preparation is what lives in the gap.**

**When the nouns differ, you are keying on a correlate.** That is not automatically wrong — sometimes
the correlate is the only thing available — but it is the point at which decision 3 becomes owed, and
it must be written down at the keying site rather than left for a reader to notice.

### 3. The cheap falsification, and it has two directions — most waves run only one

A mutation test is not enough by itself, because the ordinary sabotage moves the thing **and** the
correlate together, and a red result then tells you nothing about which one the check saw. **Aim the
sabotage at the joint:**

**(a) Remove the behaviour and leave the correlate standing. The check must go red.** Instance 4's
measurement is exactly this and it is the reason the defect was found: `drawerSlot` forced to
`undefined` with `base-3drawer` still on preparation → **15/15 green**. **[measured]**

**(b) Move the correlate and leave the behaviour standing. The check must stay green.** Instance 3
failed this: the sabotage moved `THREE_DRAWER_BASE_BUILD_ID` to `"base-cabinet"` and the guard,
asking *"does this id equal the constant?"*, **followed it**. A check that moves with its correlate is
keyed on the correlate, and the sabotage that finds it is the one that changes the correlate while
holding the product fixed.

**A suite that runs only (a)'s usual form — delete the rule, watch something go red somewhere — has
not tested the joint.** Run both, and name in the wave record which sabotage discharged which
direction.

### 4. The expected value comes from outside the producer

**QA's own phrase for instance 3 is the one to keep: *a test that asks the question in the defendant's
own words*.** The parity file's front counts were read back from the catalogue row each body was drawn
from, so it was self-consistent **whatever the composer chose** — it passed 12/12 while asserting
nothing. The remedy shipped in 7D4 is the general one: **assert the two constants differ**, and check
the post-hob body draws exactly **3 drawer fronts and 0 door leaves** using literal numbers sourced
outside the composer's choice.

**The test: if the producer changed its mind, would the expectation change with it?** If yes, the
expectation is a mirror.

### 5. A rule stated in a quantity is measured **split by that quantity**, and the split is named and sized

**The brief's candidate lesson, and it survives adjudication: the discriminating case is the one
nobody screenshots.** Instance 1's aggregate passed at **83.5 %** because the typical room has A
wider; the rooms that discriminate are **39 % of the accepted range** and are never the demo. Instance
4's reference room was chosen **because** it looked representative — and it is the same room that,
re-justified as a counter-case, now catches the defect. **The property that made it a bad sample and
the property that makes it a good witness are the same property.**

So:

1. **An aggregate is not evidence for a rule stated in a quantity.** *"Sink on the wider wall, 83.5 %"*
   is a number about a population, not a measurement of the rule. **Report the split, always, in the
   variable the rule names.**
2. **Name the discriminating sub-population and give its size**, so a reader can tell whether it was
   sampled at all. *"3 335 of 8 615 rooms have B wider"* is checkable; *"we tested a range of rooms"*
   is not. This is 7D3's finding 6 in a second dress — a clause was deletable with the suite green
   *including* a property demanding ≥ 100 samples in its arm, because **the discriminating sub-case was
   234 rooms in 2.34 M**.
3. **A rule keyed on a quantity cannot be 100 % on one side of that quantity's split and 21.2 % on the
   other.** Where a split is that lopsided, the rule is keyed on something else, and the split says so
   before any code is read.

### 6. Where a **mention** is itself the hazard, say so at the check — "strip the comments" is not the general remedy

**This is the refinement 0119 decision 7 does not yet carry, and the repository already holds both
answers, deliberately, sixty lines apart in one file. [source-verified]**

- `body-choice.test.ts:349-351` **includes** ids spelled in a comment's backticks, and says why: *"a
  body id named in prose beside code that composes it is exactly how a second declaration site
  starts."* Here **the mention is the defect.**
- `body-choice.test.ts:401-412` **strips** comments before scanning, and says why: *"every generation
  source discusses at length the proportion it refuses to encode … a guard that read the prose would
  go red on the record of the ruling it exists to enforce."* Here **the mention is the evidence that
  the rule was obeyed.**

**Both are right.** So the question a convention scanner owes is not *"does it see mentions?"* but
**"is a mention of this thing itself a defect?"** — and the answer is written at the check, in one
line, so the next reader inherits a decision instead of an accident. Instance 6 is the case where the
question was never asked: the regex's doc comment says *"string or template"*, which is a decision
about **template literals**, and its reach into Markdown backticks in doc comments **is a side effect
of the same character**. Nothing in the file records a choice either way.

### 7. Where the effort goes — and the honest reading is narrower than the pattern suggests

**The pattern in the evidence, restated precisely: three of six were caught by the author of the
thing** (2, 3, and the reporting in 6); **two by a reviewer who declined to trust a rendering** (4 and
5 — one read past a passing suite, one read the bytes instead of the diff); **one by measuring a claim
that had been answered by reasoning** (1). **[measured]**

**Six is far too small a sample for a rate, and this record does not claim one.** What it claims is a
**structural** reason, which does not depend on the count:

**This defect is invisible in the artefact.** The code reads correctly, the test passes, the diff
looks right. What is missing is the **gap between the intent and the key** — and the intent lives in
one place only, which is either the author's head or a written definition. A reviewer holding
`storageBodiesIn(buildId)` and nothing else has nothing to compare it *against*. The author
re-reading D15.7 has the definition.

**So the two halves are the same act, not two different virtues: compare the artefact to something
outside it.** The author compares to the written definition; the reviewer compares to the bytes; the
coordinator compares to a measurement. **Nobody caught one of these by looking harder at the thing in
front of them**, and that is the finding.

Two consequences, and the second matters more:

1. **Effort goes into making the key stateable beside the thing**, so that something outside the
   artefact exists for a reviewer to reach. One line at the keying site — *what this check claims to
   discriminate* — is what turns an invisible defect into a falsifiable claim. Instance 3's fix is the
   shape: **assert that the two constants differ.**
2. **Do not route this family to reviewers as another checklist item.** A reviewer who has only the
   artefact **cannot** see it, and adding the item would manufacture the appearance of a control while
   changing nothing — which is this record's own subject, applied to itself.

### 8. The one live instance, and it is still unowned

**`chooseWallCut` is the family's only currently-shipping, customer-visible member. [measured at
`9258fa3`]** ADR 0120 Amendment C2 classified it — **contract gap, not implementation defect**:
`chooseWallCut` does exactly what ADR 0110 Amendment A1's reading order specified, and that
specification never mentioned width. Amendment D's survival table, written later the same day, still
records it as *"Untouched. … Still an obligation with no home."*

**This record does not assign it a wave and does not design the fix** — that is the coordinator's and
the milestone's. It adds one thing to the obligation C2 already states: **any fix owes a test split by
which wall is wider, with the B-wider population named and sized, per decision 5.** An aggregate over
the accepted range would have passed the broken code at 83.5 %.

## What this does not ask for

- **No new gate, no linter, no scanner.** Refused under
  [ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md),
  and the refusal is load-bearing rather than polite: a tool that flags *"this check may be keyed on a
  correlate"* would fire on every predicate in the tree, be silenced within a day, and then **be cited
  as a control that exists**. **Trigger, recorded and not built for:** a wave where the same family
  recurs *after* decisions 2–5 were applied and recorded in its plan. Nothing until then.
- **Not a ban on correlates.** A correlate is often all that is available, and instance 4's fix still
  reaches the slot through a **filter** over the log step's planned id — named `isCycleStorageSlot` at
  `9258fa3`, **and a rename to `isComposedStorageSlot` is in the working tree unlanded as this record
  is written** (ADR 0119 decision 3: the fact and the change that ends it, in one sentence). The duty
  is to know a correlate is one, write that down, and discharge decision 3.
- **Not more tests.** Instance 4 had fifteen. Instance 3's parity file had twelve. **Both were full
  suites passing for the wrong reason**; neither was short of assertions.
- **Not a re-audit of the tree.** Decisions 2–5 apply to what a wave is **about to author**. A sweep
  for historical instances is the opposite failure and would find hundreds of harmless ones.

## Alternatives considered

- **Amend ADR 0119 instead of writing a new record.** *Rejected, and the reasoning is the point.* 0119
  governs **citations** — what a reader asserts from memory about this repository. This record governs
  **code and tests** — what an author keys a check on. Folding six code instances into a record about
  evidence-handling would blur a record whose value is a sharp test, exactly as 0119 itself refused to
  be folded into 0118. **0119 decision 7 is the licence for this record, not its home:** it says
  naming the family is worth more than the instance, and a coda inside a record about citations is not
  a place a wave planning a geometry change will look.
- **Leave it in the milestone's risk 16.** *Rejected.* That enumeration is good and is this record's
  direct ancestor, but it is scoped to identifying a **cabinet** in wave 7D4, and M7's plan is archived
  when the phase closes — after which `AGENTS.md:16` says it **must not be read**. Two of the six forms
  (identity, encoding) are outside its scope entirely.
- **State it as "prefer explicit predicates over string conventions".** *Rejected as the lesson that
  would not have caught four of the six.* Instances 1, 2, 5 and the 0091 specimen involve no string
  convention at all — a sort key, an array index, a byte, and a two-element `toContain`.
- **Make the reviewer's checklist longer.** *Rejected*, with its reasoning kept in decision 7: a
  reviewer holding only the artefact cannot see this class, so the item would be a control in name
  only.
- **Require every guard to carry a mutation-test result.** *Rejected as too broad and self-defeating.*
  Decision 3 is owed **where decision 2's noun test says a correlate is in use** — which is a small
  set, chosen at authoring time, rather than every assertion in four packages.

## Consequences

- **A wave plan that keys a check on a correlate names it**, and its acceptance criteria name the
  sabotage that discharges decision 3, in both directions.
- **A measurement of a rule stated in a quantity is reported split by that quantity**, with the
  discriminating sub-population named and sized. An aggregate alone is not admissible as evidence for
  such a rule.
- **A convention scanner records whether a mention is a defect or evidence**, in one line at the
  check. The two existing answers in `body-choice.test.ts` are the worked examples.
- **`chooseWallCut` remains an open obligation with no wave**, now carrying a stated test requirement.
- **This record is itself subject to ADR 0119 decision 4.** Its instances are dated 2026-09-15 and
  2026-09-16 and measured at `9258fa3`; a later reader treats the table as history, and re-reads
  `generation-priorities.ts` before asserting instance 1 is still live.

## Decision-record sweep

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0119](0119-a-remembered-fact-about-this-repository-is-a-claim-to-recheck-and-true-at-head-is-not-true-at-the-end-of-the-milestone.md) decision 7 | A check must be able to tell a thing from a mention of it — *and that is a family, not an instance*. | **Extended, not superseded, and the extension is named.** 0119 states the family and its five precedents; this record supplies the **authoring-time** test (decisions 2–5) and **refines the mention half** (decision 6): stripping mentions is not the general remedy, because sometimes the mention *is* the defect. 0119 d7's text stands unchanged. |
| [0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md) decision 1 | *"A ruled behaviour that the tree cannot distinguish from its own absence is unshipped, whatever the code says."* | **The parent proposition, and this record is its converse.** 0093 asks whether the **behaviour** can be distinguished from its absence; this asks whether the **check** can be distinguished from a check of something else. Instance 4 fails both at once: the rule was deleted outright and the suite went 15/15 green. **0093's obligation is discharged only by a sabotage that holds the correlate fixed** — decision 3(a) is the missing half of how to run it. |
| [0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md) Amendment A | A retired product claim is **moved**, and widening in place is inadmissible without a pointer to where the invariant now lives. | **Consistent, same-day, and it names this family as its reason:** *"a widened clause reads as an authority for the property it names while being unable to distinguish it."* That amendment governs **how a claim is retired**; this record governs **how a key is chosen**. Its `toContain` specimen is carried above as the seventh instance. |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | A problem that has not occurred is recorded with its trigger, not built for. | **Sibling and licence, exactly as for 0119.** The problem has occurred **six times in two days**, so this record is not refused by 0118; and the scanner alternative **is** refused by it, with a trigger named. |
| [0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md) decision 2 | A second authority in a test is the defect laundered. | **The nearest relative among the code records, and decision 4 is its generalisation.** A front count read back from the catalogue row the body was drawn from is not merely a second authority — it is **the producer's own answer**, which is why the file was self-consistent whatever the composer chose. |
| [0120](0120-the-room-is-a-fact-and-the-kitchen-adapts-to-it-and-coverage-is-negotiable-where-dimensions-are-not.md) Amendments C2, D | `chooseWallCut` does not implement the wider-wall rule; measured; *"an obligation with no home"*. | **Unchanged and not re-decided.** The classification stands as C2 made it (contract gap). This record adds the split-measurement requirement to the fix and nothing else — **no wave is assigned here.** |
| `docs/milestones/M7-room-and-presets.md:7481-7489` | Four forms of one mistake — shape, role, provenance-by-convention, position. *"They are one trap, not four."* | **The direct ancestor, promoted to a record before the milestone is archived.** Two forms added (**identity**, **encoding**), and the correction *"name the thing, and let one module own the name"* is kept verbatim for the first five. |
