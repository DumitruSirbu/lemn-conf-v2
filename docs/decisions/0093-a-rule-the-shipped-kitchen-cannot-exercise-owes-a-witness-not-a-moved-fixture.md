# ADR 0093 — A rule the shipped kitchen cannot exercise owes a witness, not a moved fixture

Status: Accepted, **amended by its own Amendment A of 2026-09-07** (applies
[ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md)
decision 1 and [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md) decision 10 point 3;
**amends no other record**; opens wave 6X, and Amendment A opens wave 6X-a)

**Read Amendment A before relying on decision 3a, decision 4 or the 820 / 860 prose.** Decision 1,
decision 2, decision 3b, decision 5 and decision 6 are untouched by it.
Date: 2026-09-06
Type: Finding + Decision (adjudication of the witnessing question adversarial QA raised on wave 6K-i)
Milestone: M6 — opens wave 6X; wave 6K-i is unchanged and merges

## What was asked

Wave 6K-i makes `setCabinetDepth` plan against the frozen extent and re-derive only the depth axis
([ADR 0088](0088-a-depth-change-plans-against-the-frozen-extent-and-re-derives-only-the-depth.md)
decision 1, as [ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md)
decision 6 amends it). Decision 6 requires the planning map to be built from the frozen extents **as
ADR 0090 decision 2 moves them**, which is why the wave exported
`frozenExtentsSlidAlongTheWall` from `packages/configurator-domain/src/frozen-map-at-cabinet-depth.ts`.

Adversarial QA measured that **removing that slide is byte-identical over 284 delete × depth-sequence
trails and green across all 4 554 tests in the tree**, then established that the slide is
correct-but-unobservable rather than dead: without it the planning map is not identical but
*differently keyed*, and the divergence produces no output difference because wall B holds no body
whose rebuild can be refused by the collapsed top. QA proposed a seeded-fixture change to witness it
and asked whether that is owed.

The question ruled here: **does this project owe the fixture, or is "correct but unwitnessed by the
shipped kitchen" an acceptable resting state for a decision-6 rule?**

## What was measured

**By adversarial QA on wave 6K-i, quoted and not re-run here** (the branch lives in a worktree off
`main` at `2073b2a`): the 284 trails, the 4 554 green tests, the five wall-B extents landing at the
leaving coordinates when the slide is removed, and the structural account of why no output moves.

**By this record, from the source rather than from a run**, because the structural claim is decidable
by reading and a claim decidable by reading should not be relayed on trust. Wall B's five columns in
`packages/configurator-domain/src/fixtures/kitchen-l-design.ts`, with the reason each one cannot
witness decision 6:

| column at 600 | members | why it cannot witness |
| --- | --- | --- |
| `B\|0.615` | `p9` `wall-corner-return-570`, `p21` `wall-corner-return-570-top` | Both `STRUCTURAL_CORNER` (`canDelete: false`). No member can be removed, so no top can collapse. No ground body. |
| `B\|0.74` | `p26` `base-corner-return-320` (`y0` 0, `h` 820) | `STRUCTURAL_CORNER`, and the column's **only** member: its top is already 820 and there is nothing above it to delete. Four corner bodies carry no `catalogEquivalentId` — nothing in §7 builds them — so it is reseated, never rebuilt through a §7 row. |
| `B\|1.20` | `p5` `tall-oven-tower-600` (`y0` 0, `h` 2200), `p22` `wall-2door-600-deep-top` (pinned) | Delete `p22` and the top collapses 2600 → 2200. The survivor is 2200 tall and its rebuild is 2200. **Equality fits**, so nothing refuses. |
| `B\|1.80` | `p6` `tall-pantry-600` (`h` 2200), `p23` `wall-2door-600-deep-top` (pinned) | The same arithmetic, the same equality. |
| `B\|2.45` | `p7` `fridge-free-700` (`h` 1850, `IS_A_MANUFACTURED_SIZE`), `p24` `wall-2door-700-over-fridge` (pinned) | Delete `p24` and the top collapses 2600 → 1850, against an 1850 mm machine. Equality again, and the fridge's depth does not follow the setting at all. |

**The gap the divergence needs is the 820 / 860 one, and wall B has no instance of it.** ~~ADR 0088's
measurement is `A|2.00`: the seeded dishwasher niche **records 820**~~ — **CORRECTED 2026-09-07 by
Amendment A: `A|2.00` is the column ADR 0088 measured, and it is not the only one that carries the
gap. Four wall-A base rows record 820 — `p0` `base-sink-800` at `A|1.30`, `p1` `base-dishwasher-600`
at `A|2.00`, `p2` `base-hob-2drawer-600` at `A|2.60` and `p4` `base-drawer3-600` at `A|3.20`
(`packages/configurator-domain/src/fixtures/kitchen-l-design.ts:830,831,835,836`)** — M2's seeded base
rows record the carcass without the counter — while §7's base rows build to `WORKTOP_HEIGHT_MM = 860`
(`packages/configurator-domain/src/catalog.ts:268`). A column whose survivors imply 820 therefore
refuses a rebuild that needs 860. On wall B every ground body is either a 2200 mm column, an 1850 mm
machine, or a structural corner with no §7 row, so the survivor-implied top always equals what the
rebuild needs.

**Corroborated by 6K-i's own adversarial file**, which sweeps every single and paired delete at both
settings — 704 commands — and reports no refusal anywhere. QA's structural claim and that sweep agree.

**The route through the product does not close the gap either, and this corrects the obvious reply.**
"Delete `p5`, insert a base into `B|1.20`, delete `p22`" is reachable, and it does **not** produce a
witness: a body inserted through §7 records **860**, so its column's survivor-implied top is 860 and
the rebuild fits. Only a *seeded-style* row — a placement recording 820 against an 860 mm rebuild —
produces the refusal, and no shipped command writes one onto wall B. **A witness of the refusal is
therefore a declared document, not a reachable one**, and this record says so rather than letting the
wave discover it.

**What *is* reachable, and is the load-bearing correction to QA's framing.** The divergence does not
need a refusal to be asserted. On the shipped kitchen carrying its own projected frozen map, at 700
mm, the planning map's wall-B half is `B|0.69 B|0.84 B|1.30 B|1.90 B|2.55` with each column carrying
its **recorded** `y0`, `top` and `w`; built from un-slid extents the same map instead holds the five
leaving keys as member-less columns and the five arriving keys as purely derived ones. That is the
divergence QA measured, it is a fact about the shipped kitchen and no other document, and **it goes
red the instant the slide is removed.**

### ~~A second finding, met while measuring, and it strengthens the case~~ WITHDRAWN 2026-09-07 by Amendment A — the file has never been in this state, in any blob in this repository

**Kept in place, struck, because it is the finding Amendment A refutes**, and because the shape of
the mistake — a **paraphrase of code set in a code fence**, which every later reader took for a
quotation — is the amendment's own subject.

> ~~`plannedMapOf` in `packages/configurator-domain/tests/commands/qa-6k-i-planning-map.adversarial.test.ts`
> models the planning map as~~
>
> ~~```ts
> deriveColumnsOverFrozenExtents(records, deriveRecordedColumns(records, storedHalves), design.room)
> ```~~
>
> ~~where `records` are derived at the **target** setting and `storedHalves` are keyed at the setting
> being **left**. The production seam passes `deriveRecordedColumns` the *pre-command* records at the
> *previous* catalogue and then slides the result. So the test's model omits the slide and mixes two key
> spaces: it is faithful on wall A, where nothing moves, and is not the map the command builds on wall
> B. It passes because its only strict assertions are on `A|2.00` and its wall-B assertions are bounds
> rather than values.~~
>
> ~~**This is ADR 0088 decision 2's own failure shape — two authors for one map — inside the adversarial
> file written to guard it**, and it is why the tree can be green with the slide removed even where an
> adversarial test is looking straight at the seam. Classified below; the remedy is in wave 6X's work
> item 1.~~

**The measured account, which replaces it.** At `deb237f` the file already read the production slide
and already paired it with the pre-command records at the previous catalogue. The struck paragraph is
right that its **per-column** wall-B assertions are bounds, and that is part of why the misreading
was plausible; what it misses is that the member-less arm asserts an **exact count** against the
document's own `emptyColumns` length, under a comment naming in advance the very failure this section
accused the file of — *"a model that dropped the slide would pass every per-column assertion below
while iterating five wall-B runs' leaving-coordinate extents instead of the one column that genuinely
holds nothing. The count is what separates them."* The tree can be green with the slide removed **from
the command's call site** for a different and narrower reason: that file calls the *exported* function
itself, so a mutation confined to the call site never reaches it. See Amendment A.

## Classification

**A test-fidelity problem, and neither of the other two.**

- **Not an implementation defect.** The slide is correct, and its correctness is a derivation rather
  than an observation: ADR 0090 decision 2 rules that a frozen extent moves with the run it records,
  decision 6 rules that the planning map takes the extents as decision 2 moves them, and 6K-i does
  exactly that. Nothing in the tree is wrong.
- **Not a contract gap.** ADR 0090 decisions 2 and 6 state the rule completely, and decision 6 names
  the failure it exists to prevent. There is nothing left to decide about *what the code must do*.
- **A test-fidelity problem, in two parts.** The tree contains no assertion that can fail if the rule
  is removed, and the one adversarial file aimed at the seam models it in a way that cannot see it.

## Argued both ways, before deciding

**The case for owing it.** [ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md)
faced the structurally identical shape — an instrument that could not witness the claim it made — and
refused to let it rest, opening wave 6V rather than softening the claim. This project has stated the
underlying rule twice in its own words: [ADR 0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md)
decision 6's *"a criterion no test can fail is not a criterion"*, and
[ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md) decision 10 point 3, which is the
closer of the two and was written after **two** defects shipped through a green suite: *"Non-vacuity,
asserted rather than assumed … a check that cannot fail is the failure mode this project has now
shipped twice."* ADR 0090 decision 4b's own criterion carries the same requirement in the same
milestone — *"the criterion is that it drops **nothing** … with a non-vacuity case proving it can
drop"*. Decision 6 shipped with no such case. And the rule has a dedicated cross-module **export**
made for it alone: an export that no test can distinguish from its absence is one tidying pass from
deletion, with the amendment that motivated it silently undone.

**The case against.** Moving seeded geometry is not a free action —
[ADR 0051](0051-the-dishwasher-niche-wears-a-decor-door.md)'s `DeclaredStructuralChange` exists
because it is not, and its own amendment records QA moving a seeded `back_panel` 25 mm with the
parity suite still 71/71 green. Wave 6N-0 already moved this room once inside this milestone, on an
owner ruling ([ADR 0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md)),
and that record is explicit that the demo was moved 90 mm *away* from the measured kitchen with the
cost stated. A second change within one milestone whose stated reason is *"so a test can see
something"* is the apparatus voting on the product, which
[ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md)
decision 2 refuses by name: **a test instrument gets no vote on what the product looks like.**

**Both cases are right, about different objects.** The first is right that something is owed. The
second is right that the seeded kitchen is not the thing that owes it. They are only in tension if
the witness has to live in the demo, and it does not — which is what the measurement above settles
and what decision 2 below rules.

## ADR 0091 decision 1's three limbs, applied and answered

Applied to a case it was not written for, and that is stated rather than glossed: decision 1 governs
when an existing assertion may be **rewritten**, and here there is no assertion to rewrite. What it
governs by analogy is which *object* is permitted to move — the claim, or the instrument.

**Q1 — Whose claim is it? Delete it in your head; does any customer-visible or contract-level fact
change?** Delete the slide from the planning map rather than an assertion: **yes, at contract level.**
ADR 0090 decision 6 says in terms what the planning map must be built from, and decision 2 quantifies
over *every* wall-B column, not over the demo's five. Customer-visible: **not on any document reachable
from today's seed** (the measurement above), and reachable on a schema-valid document the load seam
accepts. Q1 answers **invariant**, so decision 1 gives no licence at all: the claim is not narrowed,
softened, or re-quantified. It stands at full strength and is owed a witness.

**Q2 — Is the premise still satisfiable by any product state the owner has ruled in?** The premise
that would have to survive for "unwitnessed is acceptable" to be admissible is *the shipped kitchen
exercises the rules the depth command states*. It is **false**, and every falsifying fact is a dated,
recorded ruling rather than a wave's code: [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md)
decision 2's two pinned deep tops, ADR 0090 Amendment A's measured `NOT_DELETABLE` on both `wall-map`
corner returns, and the freestanding fridge's `IS_A_MANUFACTURED_SIZE`. Under decision 1 that is a
premise **retired by the product**, and the remedy decision 1 prescribes for a retired premise is to
re-quantify the *instrument* — never the claim. **This is the limb that decides how**: the demo
kitchen is the wrong quantifier for this rule, by rulings the project has already made and will not
reopen to create a test case.

**Q3 — Does the rewrite preserve everything still true, and convert what became false into a live
obligation?** All three sub-limbs are dischargeable and are made mandatory in wave 6X:

- *Preserve over a narrower, derived quantifier.* Nothing existing is weakened; the new precondition
  that names why wall B cannot witness the rule is **derived by sweeping the fixture's own entries**
  through `cabinetDepthRuleOf` and `canDelete`, never restated as a hand list (ADR 0085 decision 3).
- *Assert the negation positively, by measurement, with its witness.* The divergence is asserted as
  two named key sets and a refusal with its two numbers, not as prose.
- *Carry the obligation as a named wave.* Wave 6X, planned at the end of this record.

## Decision

### 1. The witness is owed. A rule with no test that can fail if the rule is removed is not a shipped rule

Stated so it binds beyond this instance, and deliberately as a duty on the *rule* rather than on the
fixture:

> **A ruled behaviour that the tree cannot distinguish from its own absence is unshipped, whatever the
> code says. The obligation is discharged by an assertion that goes red when the behaviour is removed
> — never by the observation that the behaviour is derivable, and never by a comment.**

This is ADR 0079 decision 10 point 3 applied to a rule instead of to a predicate, and it is not new
policy: the project has required a non-vacuity case of every guard it has shipped this milestone
(ADR 0090 decision 4b, ADR 0091 decision 4b, ADR 0085 decision 6). Decision 6 of ADR 0090 was granted
an exception nobody asked for, because nothing measured that it had one until QA did.

**Correctness is not the question and is not in doubt.** The slide is right by derivation from
ADR 0090 decision 2. What is missing is falsifiability, and the two are different properties.

### 2. The witness is a design the test declares. The seeded kitchen does not move, and no owner input is needed

> **A criterion whose ability to fail depends on which bodies the demo kitchen happens to carry has an
> undeclared coupling. The fixture that makes a rule falsifiable is declared by the test that asserts
> it.**

That sentence is ADR 0090 Amendment B's own, transposed one axis. It ruled — against a wave whose
correctness silently depended on 6N-0's wider room — that the criterion *"is written against a room
narrow enough to trigger the cap, **declared in the test**, not against whichever width the fixture
happens to carry. That severs the coupling rather than documenting it."* The same reasoning decides
this: writing the witness into the demo would make decision 6's falsifiability a property of the demo,
recreating the coupling in the same milestone that refused it.

**The precedent is not one record but three, all inside this line of work.** ADR 0090 Amendment A
replaced 4b's non-vacuity case with *"a hand-built map"* precisely when no reachable document could
supply one. ADR 0080 decision 5 asserts over a legacy population no shipped seed produces. And wave
6K-i's own adversarial file already met a fixture that cannot witness a rule — the `w` arm, where every
column's members share a width — and answered it by **pinning the limitation as an executable
precondition**, with the comment *"the width arm is unfalsifiable on this fixture, and that is a fact
about the fixture."* **That answer is not overturned here; it is completed.** Pinning the limitation
is the right first half and it is not the whole obligation, because a pinned limitation says the
coverage is owed without supplying it.

**Consequently no owner input is required and none is invented.** The seeded design is the owner's —
6N-0's room move was owner-ruled — and this record does not touch it, so there is nothing to ask.

### 3. What "witnessed" means here, in two parts, because the two are reachable to different degrees

The wave delivers both, and the distinction is stated so a later reader does not collapse them.

**3a. The divergence, on the shipped kitchen — the primary criterion, and it is fully reachable.** At
700 mm on the demo carrying its own projected frozen map, the planning map's wall-B keys are the five
**arriving** coordinates, each carrying the recorded extent; built from un-slid extents, the same map
holds the five **leaving** keys as member-less columns and the five arriving keys purely derived. Two
measured key sets and their contents. This needs no new design at all. ~~It fails the moment
`frozenExtentsSlidAlongTheWall` leaves the planning map.~~ **CORRECTED 2026-09-07 by Amendment A: it
fails when the exported function stops sliding, and it does *not* fail when the function is left
intact and its call in `rebuildEveryBodyAt` is reverted to the identity — measured, 0 of 4. The two
mutations witness different things and the criterion now names which one each item answers to.**

**3b. The consequence, on a declared design — the non-vacuity case, and it is not reachable today.** A
wall-B column holding a placement that records 820 under a deletable member; delete the member; the
un-slid planning map plans the rebuild into an 820 mm slot and `evaluateInsertFit` refuses
`HEIGHT_EXCEEDS_LEVEL` at 860, exactly as `A|2.00` does, while the slid map fits it. **The wave states
that this document is not reachable from today's seed and why** — a §7 insert records 860, and no
command writes a seeded-style 820 row onto wall B — so nobody later reads it as a live customer defect.

Neither discharges the other. 3a proves the rule is doing something; 3b proves what it is protecting.

### 4. ~~The 6K-i adversarial file's second model of the planning map is corrected, not deleted~~ WITHDRAWN 2026-09-07 by Amendment A — the merged file was never in the described state

**The struck text is kept in place because it is the claim the amendment refutes, and because a
withdrawn decision that is deleted teaches nobody why it was made.**

> ~~`plannedMapOf` stays — an independent model is worth having — and stops being a *different* map: it
> reads the production slide rather than omitting it, and it is given the pre-command records the
> production seam gives `deriveRecordedColumns`, so its two operands share one key space. **ADR 0088
> decision 2 applies to a test as it applies to production code**: two implementations of one rule that
> agree today are what this project keeps finding parted later, and here they never agreed on wall B at
> all.~~
>
> ~~Its existing assertions must survive the correction **unchanged in what they assert** (ADR 0090
> decision 7, unamended and applied). A wall-A assertion that changes value under the fix is a finding,
> not a re-baseline.~~

**What is true instead**, and it is decidable by reading, so it is stated here rather than relayed:
at `deb237f` — 6K-i's own commit and the file's **first merged revision** — `plannedMapOf` already
wrapped its `frozen` operand in `frozenExtentsSlidAlongTheWall` and already derived it from
`heldRecords` at the *previous* catalogue, the same operand pair `heldRunAcrossTheCommand` gives
production (`packages/configurator-domain/src/commands/set-cabinet-depth.ts:301,307`). It shares one
key space, it reads the production slide, and no blob in this repository has ever held it in any other
state. **The described defect was a misreading of the merged file, and the snippet a paraphrase rather
than a quotation** — see Amendment A §1 and §2.

### 5. Wave 6K-i merges, and wave 6X is recorded before it merges

The condition ADR 0090 imposed on its own residue is imposed here and is the whole of it: *"the residue
is recorded with its measurement and a named wave **before** the merge, not after."* This record is
that recording.

- **6K-i is not held.** It closes a shipped kitchen that two ordinary deletes leave unable to change
  its depth. What it leaves open is a rule that is correct and unasserted. Holding the branch does not
  shrink the second and keeps the first shipped — the same comparison, in the same direction, that
  ADR 0090 made for 6J-d.
- **6K-i is not widened either.** It is in review, and this project's standing practice is that the
  tree is frozen while QA, review or visual agents are reading it. Adding a work item now reopens a
  review round to add a test that gates nothing.
- **6X does not gate any other wave** and is owed before M6 closes.

### 6. Nothing else moves

No production file changes. No fixture, no seeded placement, no room dimension, no catalogue entry,
no depth rule, no pin. No schema change, no `CURRENT_SCHEMA_VERSION` bump, no migration, no severity
change. **No golden map and no screenshot is invalidated** — see the accounting in wave 6X. ADR 0090
decisions 1–8 and both amendments stand exactly as written; ADR 0088 is untouched; ADR 0058's pins are
not unpinned to manufacture a witness.

## Alternatives considered

| Option | Why not |
| --- | --- |
| **Add a rebuildable seeded base body to wall B**, as QA proposed. | Decision 2. It makes decision 6's falsifiability a property of the demo — the undeclared coupling ADR 0090 Amendment B refused in this milestone — and it is the apparatus voting on the product (ADR 0091 decision 2). It also costs more than the coverage is worth: the golden maps in `apps/web/tests/store/cabinet-depth-frozen-source.test.ts` (a per-column depth map and a per-column millimetre map, every seeded column), the wall-B key list in `packages/configurator-domain/tests/commands/set-cabinet-depth.frozen-map.test.ts`, the pinned placement counts (`26` in three files, `704` commands in 6K-i's own sweep, `22` seeded build ids in three parity files, `22` on-screen bodies in the overflow viewport test), every price total and breakdown row, ADR 0083's wall-coverage figures, and every screenshot the visual gate reads. |
| **Unpin one of ADR 0058's deep tops, or make a wall-B corner deletable**, so an existing column can witness it. | A product rule changed to create a test case, which is decision 2's refusal at its sharpest. ADR 0058 decision 2 and ADR 0090 Amendment A's `NOT_DELETABLE` finding are both load-bearing elsewhere — the second is what makes rung 4 of the ladder safe. |
| **Accept it as unwitnessed and record a comment beside the export.** | Decision 1. A comment does not go red. This is ADR 0091 decision 1's third limb refused — *"carry the obligation forward as a named wave, not as a comment and not as a TODO"* — and it is the shape that let ADR 0079 ship two defects through a green suite. |
| **Fold the witness into wave 6K-i.** | Decision 5. 6K-i is in review; widening it reopens a review round for a test that gates nothing, and the freeze exists so that QA and review read one tree. |
| **Delete `frozenExtentsSlidAlongTheWall`'s use in the planning map**, since nothing observes it. | It is ADR 0090 decision 6, which was written *because* reading ADR 0088 decision 1 literally was measured to be wrong — restoring extents at the coordinates the run is leaving while the placements plan at the ones it is arriving at. Removing it re-opens an amendment on the ground that nothing tests it, which is the argument this record exists to refuse. |
| **Assert only the refusal (3b) and skip the shipped-kitchen divergence (3a).** | 3b is a declared document no seed produces; on its own it leaves the shipped kitchen with no assertion that the rule runs there at all. 3a is the reachable half and is the one that fails when the slide is removed from production. |
| **Assert only the fixture limitation (the `w`-arm shape) and stop.** | It is ADR 0091 decision 1's first limb performed alone — the shape that record names as laundering when it stands by itself. It says the coverage is owed without supplying it, and the coverage is cheap. |
| **Widen 6X to close backlog 51 (chain-homogeneity) while in the area.** | Different question, different seam, and ADR 0090 recorded it as needing its own adjudication — whether the state is reachable at all has not been measured. 6X asserts no new refusal and adds no production code. |

## Records swept before deciding, and how each is settled

Grepped `docs/decisions/` and `docs/BACKLOG.md` for `frozenExtentsSlidAlongTheWall`, `planning map`,
`non-vacuity`, `unfalsifiable`, `seeded fixture`, `DeclaredStructuralChange` and `witness`.

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decision 6 | The planning map is built from the frozen extents as decision 2 moves them; 6K-i is owed. | **Unamended and enforced.** This record adds the assertion that makes it falsifiable and changes nothing it says. |
| ADR 0090 decision 2 | One rule for both halves of the map: an extent slides on the chain the body it recorded declares. | **Untouched.** 3a asserts its result at the planning seam; no chain, ladder rung or coordinate is re-decided. |
| ADR 0090 decision 4b | A guard must prove it is not doing work, *"with a non-vacuity case proving it can drop"*. | **The governing precedent for decision 1**, followed rather than extended. Decision 6 was held to a weaker standard than 4b by omission, not by ruling. |
| ADR 0090 decision 7, as narrowed by Amendment B | An invariant edited to accommodate a defect is the defect laundered; an **anchor** may move and nothing else. | **Applied, not narrowed.** 6X edits no expected value anywhere. ~~Decision 4's correction of `plannedMapOf` must leave every existing assertion byte-identical in what it asserts.~~ **Moot from 2026-09-07: decision 4 is withdrawn and no correction is owed, so no assertion in that file is touched at all.** |
| ADR 0090 Amendment A | 4b's non-vacuity case *"can no longer be a legacy document … the wave supplies a hand-built map instead"*. | **The direct precedent for 3b.** A declared input is the project's own answer when no reachable document exercises a rule. |
| ADR 0090 Amendment B | A criterion is written against a room **the test declares**, because *"a wave whose correctness depends on another wave's room width has a coupling nobody declared"*. | **The direct precedent for decision 2**, transposed from the room to the placements. |
| ADR 0090 Amendment B addendum | The residue is recorded with its measurement and a named wave **before** the merge. | **The precedent for decision 5**, applied to this record's own timing. |
| [ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md) decision 1 | Three questions, answerable by reading code, deciding whether a claim or an instrument may move. | **Applied in full, in its own section above.** Q1 answers *invariant*; Q2 answers *the fixture is the retired premise*; Q3's three limbs are made mandatory in 6X. |
| ADR 0091 decision 2 | *"A test instrument gets no vote on what the product looks like."* | **The refusal of the seeded change**, and the reason no owner question is raised. |
| ADR 0091 decision 3 | A counter must not be rewritten in the diff its own output is the evidence for. | **Not engaged, and named so it is not misapplied.** 6X writes a new assertion about production code that already exists and is in review; it does not rewrite an instrument whose output is 6K-i's evidence. The reason 6X is its own wave is decision 5's freeze, not this. |
| [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md) decision 10, point 3 | *"Non-vacuity, asserted rather than assumed … a check that cannot fail is the failure mode this project has now shipped twice."* | **The closest precedent, and the one decision 1 generalises** from a predicate to a rule. |
| ADR 0079 decisions 1–2 | The pairing invariant: a depth and the body it came from travel together. | **Untouched.** No published depth and no recorded source moves. |
| [ADR 0088](0088-a-depth-change-plans-against-the-frozen-extent-and-re-derives-only-the-depth.md) decision 1 | The planning map carries the frozen extent's vertical and along-wall axes. | **Untouched**, in the form ADR 0090 decision 6 amends it to. This record asserts it; it does not restate it. |
| ADR 0088 decision 2 | The axis split has one author; two implementations that agree today part later. | ~~**Extended to a test file** by decision 4, on the record's own reasoning. `plannedMapOf` is the second author, and on wall B the two never agreed.~~ **CORRECTED 2026-09-07 by Amendment A.** The generalisation stands — a second implementation of a rule in a test is worth naming — but its example was wrong: `plannedMapOf` and the command agree on wall B and did so at the first merged revision. Nothing was extended, because nothing had parted. |
| ADR 0088 decision 3 | The depth axis is value-preserving, and that is asserted rather than assumed. | **Untouched and unengaged.** 6X asserts `y0`, `top`, `w` and keys; it moves no depth. |
| [ADR 0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) decision 6 | A criterion no test can fail is not a criterion; withdraw as stated and replace with strictly more falsifiable claims. | **Mirrored.** Here nothing is withdrawn — a claim that was never asserted is asserted for the first time — so the remedy is addition rather than replacement. |
| ADR 0085 decision 3 | Relevance is **observed, never declared**; a hand list is silent about what it was never shown. | **Binding on 6X work item 4.** The wall-B limitation is swept out of the fixture's own entries, never written as a list of five build ids. |
| [ADR 0058](0058-the-two-deep-top-cabinets-are-pinned.md) decision 2 | The depth question is declared per entry, never inferred from a band or a kind. | **Upheld and load-bearing in an unexpected direction**: the two pins are part of *why* wall B cannot witness the rule. Refused as a thing to undo for a test's benefit. |
| [ADR 0073](0073-a-frozen-extent-records-the-body-its-depth-came-from.md) | A frozen extent records `depthFromBuildId`. | **Untouched.** No field, no shape, no reading changes. |
| [ADR 0080](0080-an-empty-space-follows-the-setting-and-a-fallback-is-not-a-ratchet.md) decisions 4 and 5 | The ladder on the depth axis; the sourceless population is closed and answered at read time. | **Untouched, and cited as precedent** that this project asserts over populations no shipped seed produces. |
| [ADR 0053](0053-the-design-document-records-the-whole-frozen-map.md) | The document records the whole frozen map. | **Untouched.** 6X reads the map the product produces and writes none. |
| [ADR 0051](0051-the-dishwasher-niche-wears-a-decor-door.md) and its amendment | `DeclaredStructuralChange`: moving seeded geometry is declared, and QA proved a bad declaration can hide a 25 mm move at 71/71 green. | **Not engaged, because nothing seeded moves** — which is the point. It is the strongest statement of what the refused alternative would have cost. |
| [ADR 0083](0083-wall-coverage-is-the-runs-extent-and-the-finished-end-is-part-of-it.md) | Wall B is 2920, owner-ruled, chosen and not measured, pinned so nobody puts 2830 back. | **Untouched, and the reason a second seeded change this milestone deserves the scrutiny it got here.** |
| [ADR 0065](0065-a-body-past-the-end-of-its-wall-is-marked-not-moved.md), [ADR 0069](0069-past-the-wall-is-one-code-family-and-severity-is-declared-per-code.md) | Marks, the code family, and the wall-end clip's seam. | **Untouched.** 6X adds no code, no severity and no mark. |
| `docs/BACKLOG.md` **50** — the validator is blind to a cross-wall corner intersection | A reporting gap needing its own severity decision. | **No overlap.** It is a validator question at the load and write seams; 6X asserts a planning map inside one command and adds no code. |
| `docs/BACKLOG.md` **51** — column chain-homogeneity is unenforced | Named by ADR 0090 decision 3, reachability unmeasured, needs a refusal code or a catalogue sweep. | **Adjacent and deliberately not folded in.** It asks whether a *bad* document is reachable; 6X asks whether a *good* rule is asserted. Refused as scope above. |
| `docs/BACKLOG.md` **52** — a resize or an insert carries the wall-end cap into the recorded map | Direction ruled in ADR 0090's addendum; touches `setWidth` and `insertBody`. | **No overlap.** A different pair of commands and the published/recorded seam; 6X touches neither and must not be merged into it. |
| `docs/best-practices/product-invariants.md` | Geometry, dimensions and visual behaviour keep their stated structural dependencies. | **Honoured trivially.** No builder, no coordinate anchor, no scaling rule and no screenshot is reached; M1's fidelity gate is not engaged. |

**Nothing found in the sweep contradicts this record, and no record is amended or superseded.** One
earlier answer — 6K-i's `w`-arm pin — is completed rather than overturned, and that is said explicitly
in decision 2.

## Consequences

- **Wave 6K-i merges on its own gates**, unwidened and unheld, with its residue recorded here before
  the merge rather than after it.
- **Wave 6X is opened**, planned at the end of this record, ready to be pasted into
  `docs/milestones/done/M6-price-and-global-settings.md` by whoever holds that file. No backlog entry is
  created: the obligation is scheduled and owned, which is the line `docs/BACKLOG.md` draws.
- **The project has a rule for a case it had ruled only by example.** Decision 1 states what ADR 0079
  decision 10 and ADR 0090 decision 4b each said about one artefact: a behaviour the tree cannot
  distinguish from its own absence is unshipped. The next wave that exports a function for a rule
  applies it without re-litigation.
- ~~**A second author for the planning map is on record and owned.** `plannedMapOf` is corrected in 6X.
  Until then, an assertion made through it about wall B is an assertion about a map the command does
  not build, and a reader should not treat that file's wall-B blocks as coverage of decision 6.~~
  **WITHDRAWN 2026-09-07 by Amendment A.** `plannedMapOf` is a second *implementation* and always
  built the command's map; that file's wall-B blocks are coverage of decision 6 and should be read as
  such. What is true is narrower and is stated in Amendment A: because the file calls the **exported**
  function directly, it cannot see a mutation confined to the command's **call site**.
- **The demo kitchen's inability to exercise this rule becomes an executable statement rather than an
  absence.** After 6X, a fixture change that gives wall B a rebuildable seeded base body turns the
  precondition red and tells its author that decision 6's coverage has moved — which is the direction
  that wants noticing.
- **Nothing is owed to the owner.** The seeded design does not move, so there is no product change to
  approve. **The one thing that would need them**, recorded so it is not decided by an implementer:
  if wave 6X finds that criterion 3b cannot be expressed as a declared document at all — that the load
  seam or the schema refuses a wall-B column recording 820 under a §7 860 mm rebuild — then the only
  remaining witness for the *consequence* is a seeded change, and that is the owner's call and not
  this record's. **This is an open owner input, conditional and not yet triggered**; criterion 3a is
  unaffected either way and remains 6X's primary deliverable.
- **The manufacturer price dashboard ([ADR 0062](0062-a-manufacturer-price-dashboard-comes-after-m8-and-shapes-seams-now.md))
  is untouched**; no seam here is one of its.

---

## Wave 6X — the slide is witnessed by an assertion, not by a redecorated demo

**To be pasted into `docs/milestones/done/M6-price-and-global-settings.md` after wave 6V.** It is written
here because another agent holds the milestone file at the time of writing.

**Tier: test fidelity, domain package only. No production code, no fixture, no runner evidence.**

**Goal.** Give ADR 0090 decision 6 an assertion that goes red when `frozenExtentsSlidAlongTheWall` is
removed from `rebuildEveryBodyAt`'s planning map, supply the non-vacuity case that shows what the rule
protects, and pin — derived, not declared — why the shipped kitchen cannot be that assertion.

**Gates on 6K-i** being merged. It asserts 6K-i's seam and cannot be written before it lands. It gates
nothing itself and is owed before M6 closes.

**Why it is its own wave.** ADR 0093 decision 5: 6K-i is in review under the tree freeze, and widening
it reopens a review round for a test that gates nothing.

**Touches.** ~~`packages/configurator-domain/tests/commands/qa-6k-i-planning-map.adversarial.test.ts`
(work item 1) and~~ **one new test file** in
`packages/configurator-domain/tests/commands/` (items 2–5; the name is the wave's). **Narrowed
2026-09-07 (ADR 0093 Amendment A): work item 1 is withdrawn, so the 6K-i adversarial file is not
touched.** **No `src/` file in any package. No fixture. No `apps/web` file. No schema, no golden map,
no screenshot, no e2e spec, no parity ledger.**

**What this wave invalidates: nothing.** Stated as a list because the question was asked. No golden
map moves — `apps/web/tests/store/cabinet-depth-frozen-source.test.ts`'s two per-column maps and
`packages/configurator-domain/tests/commands/set-cabinet-depth.frozen-map.test.ts`'s wall-B key list
are untouched. No screenshot moves; the visual gate is not run and not re-baselined. No pinned count
moves — the 26 placements, the 704 commands, the 22 seeded build ids, the 22 on-screen bodies. No
price total, no wall-coverage figure, no parity declaration. **If any of these moves, the wave has
left its scope and stops.**

**~~Work item 1 — `plannedMapOf` stops being a second map.~~ WITHDRAWN 2026-09-07 (ADR 0093
Amendment A): the item was owed nothing and changed nothing.**

> ~~ADR 0093 decision 4. It reads `frozenExtentsSlidAlongTheWall` rather than omitting it, and it is
> given the pre-command records at the previous catalogue — the operands the production seam gives
> `deriveRecordedColumns` — so its two inputs share one key space. Every existing assertion in that
> file survives **unchanged in what it asserts**; a wall-A value that moves under this correction is a
> finding, not a re-baseline.~~

At `deb237f` — 6K-i's own commit and the file's first merged revision — `plannedMapOf` already wrapped
its `frozen` operand in `frozenExtentsSlidAlongTheWall` and already derived it from `heldRecords` at
the previous catalogue, the operands `heldRunAcrossTheCommand` gives production
(`packages/configurator-domain/src/commands/set-cabinet-depth.ts:301,307`). The only commit between
that and `HEAD` is `1116ae9`, a refactor into `planningOperandsOf` that preserved both operands, and a
sweep of all 3 337 blobs in the object database finds **only those two ever holding that path, both of
them sliding**. The described defect was a **misreading of the merged file**. **The wave touches
`qa-6k-i-planning-map.adversarial.test.ts` not at all**, and its `Touches` line above is narrowed to
the one new file accordingly.

**Work item 2 — the divergence on the shipped kitchen (ADR 0093 decision 3a).** On the seeded design
carrying its own projected frozen map, at 700 mm: the planning map's wall-B half, keyed at the
arriving coordinates and carrying the recorded extents, asserted against the same map built from
un-slid extents.

**Work item 3 — the consequence, on a declared design (ADR 0093 decision 3b).** A wall-B column
holding a placement that records 820 mm under a deletable member; the member deleted; the frozen map
projected the way the product projects it, never hand-written. Both planning maps built, both fits
evaluated through `evaluateInsertFit`.

**Work item 4 — the shipped kitchen's limitation, derived and pinned.** Why no wall-B column can
witness item 3, swept out of the fixture's own entries rather than listed.

**Work item 5 — the reachability boundary, stated as an assertion.** Item 3's document is not
reachable from today's seed, and the reason is a fact about §7 rather than an opinion.

**Acceptance criteria.** Each is falsifiable by a QA agent without reading this record's prose.

- **The wall-B planning-map keys at 700 are exactly `B|0.69`, `B|0.84`, `B|1.30`, `B|1.90`, `B|2.55`**,
  measured literals per setting, on the seeded design carrying its projected frozen map. Each of the
  five carries the **recorded** `y0Mm`, `topMm` and `w` from the document, not the derived column's —
  asserted per key with its own numbers, never as a set-membership check and never as a minimum over
  the five.
- **The same map built from the un-slid extents differs, and the difference is asserted by value, not
  by inequality.** It holds the five **leaving** keys `B|0.61`, `B|0.74`, `B|1.20`, `B|1.80`, `B|2.45`
  as member-less columns, and its five arriving keys carry the columns the records imply rather than
  the recorded extents — at least one of which differs from the recorded value, named with both
  numbers. **A criterion that only says "the two maps are not equal" does not discharge this**: the
  point is which coordinates the extents land on.
- **Wall A is unmoved between the two maps**, key for key and value for value. The slide is a wall-B
  fact and a wave that made wall A move has broken ADR 0090 decision 2's rung 1.
- **The un-slid planning map refuses a rebuild that the slid one fits**, on the declared design of
  item 3: `evaluateInsertFit` returns `HEIGHT_EXCEEDS_LEVEL` with **required 860 and available 820**
  against the un-slid map, and a fit at **860** against the slid one. Both numbers asserted. The
  design is built through `projectFrozenMap` over the pre-delete columns — the construction
  `set-cabinet-depth.plans-against-the-frozen-extent.test.ts` already uses — and **the entry is not
  hand-written**, for that file's own stated reason.
- **The full command agrees with the fit.** `setCabinetDepth(700)` on that design returns `ok` and the
  rebuilt body's height is 860, so the criterion is not resting on a fit evaluated outside the command
  that runs it.
- **Item 3's design is declared unreachable, by measurement.** A body inserted into a wall-B column
  through the §7 offer list records **860** and not 820 — asserted through the insert path, not stated
  in a comment — which is why the refusal cannot be reached from the seed. **A wave that finds it *is*
  reachable has found something better than this criterion and says so**, and ADR 0093's conditional
  owner input does not arise.
- **The limitation is derived from the fixture, never listed.** The wave sweeps the seeded design's
  wall-B members and asserts that every one of them is `canDelete: false`, or carries
  `IS_A_MANUFACTURED_SIZE` or a `pinnedAtFinishedDepthMm` rule, or has a rebuild height equal to its
  recorded height — with the count of members swept asserted to be non-zero and equal to its measured
  value. **A hand-written list of build ids fails this criterion** (ADR 0085 decision 3). It goes red
  the day wall B gains a column that could witness item 3, which is the direction that wants noticing.
- **Item 4's reason is pinned per member by id, and to *every* reason that applies — a four-arm
  histogram does not discharge it** (added 2026-09-07, ADR 0093 Amendment A). `whyItCannotWitness`
  returns on the first arm that matches, so `3 not deletable / 1 manufactured / 3 pinned / 2 rebuilds
  to the height it records` is a property of the **arm order** as much as of wall B: the three corner
  returns satisfy `not deletable` **and** `no catalogue equivalent`, `p7` satisfies two, and
  reordering the arms yields `0 / 1 / 3 / 2 / 3` from the same nine members. The criterion is that
  **each of the nine is asserted by id against the full set of reasons that exclude it.** The reason
  recorded for the three corner returns is **having no §7 row**, not deletability: a structural return
  is reseated and never fitted through a catalogue equivalent, so it could not refuse a rebuild
  whether or not anything could delete it. The totals may remain as a secondary assertion; they do not
  discharge this one.
- ~~**Every assertion in item 2 and item 4 fails when the slide is removed, and this is demonstrated.**
  QA reverts `frozenExtentsSlidAlongTheWall`'s call in `rebuildEveryBodyAt` to the identity, records
  which assertions go red and with what values, and restores it.~~ **CORRECTED 2026-09-07 (ADR 0093
  Amendment A): false as written — measured 0 of item 2's 4 and 0 of item 4's 2 — and not
  dischargeable by rewriting the tests.** Two mutations are run, and each item answers to the one
  that can reach it:
  - **The call-site mutation.** `frozenExtentsSlidAlongTheWall`'s call in `rebuildEveryBodyAt`
    reverted to the identity. **Item 3's assertions go red**, named and with their values, and they
    are the wave's witness for the **seam** — they are the only ones that route through
    `setCabinetDepth`. **A wave whose item 3 stays green under this mutation has not discharged its
    goal**; that is the whole of ADR 0093 decision 1.
  - **The export mutation.** The body of `frozenExtentsSlidAlongTheWall` itself neutered to the
    identity. **Item 2's assertions go red**, named and with their values, and they are the witness
    for the **export** — the artefact ADR 0090 decision 6 names and the reason it is exported at all.
  - **Item 2 is not required to go red under the call-site mutation, and must not be rewritten until
    it does.** It builds both planning maps inside the test from the operands the command builds them
    from, so no call-site mutation can reach it — and it cannot be routed through the command
    instead, because the command's output is **byte-identical** with the slide removed, which is the
    finding that opened this wave. Recording item 2 as a witness of the export rather than of the
    seam is the accurate description, not a weakening.
  - **Item 2 is nonetheless not a `docs/WORKFLOW.md` "both sides fed by the same source" guard, and
    that is asserted rather than assumed.** Its expected side is independent literals, each checked
    twice — once against the design document's own `columnExtents` entry and once against the
    planning map — so the document and the map must each agree with a third party rather than with
    each other.
  - **Item 4 goes red under neither mutation, by construction, and that is correct.** It sweeps the
    fixture's wall-B members and calls no slide at all. Its falsifiability is a **fixture** mutation
    — give wall B a deletable member that rebuilds taller than it records — and the criterion below
    is what binds it.
- **Nothing else in the tree moves under the call-site mutation, and that is recorded too.** QA
  reports the full red set. If a test outside this wave's file goes red, QA's byte-identity
  measurement was incomplete and the finding is reported rather than absorbed. **The export mutation
  is expected to move a great deal of the tree** — it is the rule's whole reach — and its red set is
  recorded as a count and a spread, not as a failure.
- **`pnpm check` green**, and `pnpm format:check` over the whole tree at the wave's end.

**Risks.**

- ~~**Item 1 can surface a real disagreement.** If correcting `plannedMapOf` changes a wall-A value the
  file asserts today, that is a finding about 6K-i and not a number to update — ADR 0090 decision 7
  binds, and the wave stops and reports.~~ **Moot 2026-09-07: item 1 is withdrawn.** The risk that
  replaces it is the one the withdrawal exposes — **a paraphrase of code set in a code fence inside a
  durable record, which every later reader takes for a quotation.** ADR 0093 Amendment A §2 states the
  rule: code in a record is copied from a named commit, and a described defect is reproduced from that
  commit before a wave is dispatched to fix it.
- **Item 3's declared design may be refused by a seam nobody expected** — the load seam, the schema, or
  a validator. If it cannot be expressed at all, item 3 is blocked and the wave delivers items 1, 2, 4
  and 5 in full, reports the blockage with the refusal code, and **does not substitute a seeded change**
  — that is the conditional owner input ADR 0093 records.
- **The temptation to assert the divergence as an inequality.** Two maps that differ is nearly free to
  write and nearly worthless: it stays green under a slide that moves the wrong distance. Every
  criterion above is a value for that reason.
- **Scope creep into backlog 51.** Chain-homogeneity is next door and is not this wave's; ADR 0090
  recorded it as needing its own adjudication, starting with whether the state is reachable.

---

## Amendment A — 2026-09-07: decision 4 is withdrawn as a misreading, the witness needs two mutations rather than one, and a record quotes the file it accuses

**Raised by adversarial QA on wave 6X**, which found that the wave's first work item was owed nothing
and that one of its acceptance criteria could not be met by any test it was allowed to write. Both
claims were re-measured here from the repository rather than accepted on relay, because both are
decidable by reading and this record has now been wrong once by not doing that.

**Nothing in decisions 1, 2, 3b, 5 or 6 changes.** The witness is still owed, it is still a design the
test declares, the seeded kitchen still does not move, and no production file moves. What changes is
one withdrawn finding, one false sentence about falsifiability, and three measured corrections.

### What was re-measured, and how

| Claim | Method | Result |
| --- | --- | --- |
| `plannedMapOf`'s shape at 6K-i's first merged revision | `git show deb237f:packages/configurator-domain/tests/commands/qa-6k-i-planning-map.adversarial.test.ts` | Already wraps `frozen` in `frozenExtentsSlidAlongTheWall`; already derives it from `heldRecords` at the previous catalogue |
| The same at `HEAD` | `git show HEAD:…` | Same operands, refactored into `planningOperandsOf` |
| Every revision of that file | `git log --oneline --all -- …` | Exactly two commits: `deb237f` and `1116ae9` |
| **Every blob ever written**, reachable or not | `git cat-file --batch-all-objects` over all **3 337** blobs, each one grepped | **Exactly two blobs have ever held that path** — `4521b539` (at `deb237f`) and `8f9162fc` (at `HEAD`) — **and both call `frozenExtentsSlidAlongTheWall`, twice each** |
| Where the ADR's snippet came from | the same sweep, grepped for `storedHalves` | **One blob in the entire object database: `6776662d`, this record itself.** The identifier has never existed in any source file in this repository |
| Whether the database had been pruned | `git fsck --dangling` | **31 dangling commits**, with WIP stashes back to 2026-08-25 — nothing has been aggressively pruned, so the sweep above is not an artefact of lost objects |
| Whether the file existed at `2073b2a` | `git cat-file -e 2073b2a:…` | Absent — `2073b2a` is the *base* the 6K-i branch was cut from, and `deb237f`'s parent |
| The 820 mm rows | `packages/configurator-domain/src/fixtures/kitchen-l-design.ts:830,831,835,836` | **Four** wall-A base rows, not one |

### 1. Decision 4 is withdrawn. The defect it records was never in a merged revision

`plannedMapOf` did not model the planning map without the slide, did not mix two key spaces, and did
not need correcting. At `deb237f` it passes `frozenExtentsSlidAlongTheWall` a `frozen` operand built
by `deriveRecordedColumns(heldRecords, …)` where `heldRecords` are the **pre-command** records at the
**previous** catalogue — operand for operand what `heldRunAcrossTheCommand` gives production
(`packages/configurator-domain/src/commands/set-cabinet-depth.ts:301,307`). One key space, one
author, from its first merged line.

**The accusation was also one the file had already anticipated.** Its member-less arm carries the
comment *"a model that dropped the slide would pass every per-column assertion below while iterating
five wall-B runs' leaving-coordinate extents instead of the one column that genuinely holds nothing.
The count is what separates them, and it is the document's own rather than a literal"* — and asserts
`memberLess.length` against the document's own `emptyColumns` length. That is an exact wall-B
assertion, so decision 4's supporting claim that *"its only strict assertions are on `A|2.00`"* is
false as well.

**The flawed form was a misreading of the merged file, and this record says so rather than leaving
it open.** The object-database sweep is what decides it: every blob ever written, reachable or not,
was enumerated and grepped, and **only two have ever held that path — both of which slide.** The
database has not been pruned (31 dangling commits, stashes back to 2026-08-25), so "the evidence was
collected" is not an available explanation. And `storedHalves` — the local identifier the snippet is
written around — exists in exactly one blob in the whole repository, this record. **An identifier that
was invented for the prose is the signature of a paraphrase, not of a quotation.**

Three things about the merged file account for how the misreading happened, and they are recorded
because they are what a later reader will want:

- The correct code passes `frozen` through a wrapper, so the operands `deriveRecordedColumns` receives
  are one call away from where a reader looks for them.
- **This record's other characterisations of the file are accurate**: its per-column wall-B
  assertions really are `toBeLessThanOrEqual` bounds rather than values, which is what made the
  surrounding paragraph read as though it had been checked.
- **The file discusses a slide-less model in prose, in a comment, right beside those bounds.** At
  `deb237f` line 296: *"a model that dropped the slide would pass every per-column assertion below
  while iterating five wall-B runs' leaving-coordinate extents instead of the one column that
  genuinely holds nothing."* Decision 4 ended up describing that hypothetical as if it were the code.

**The wave 6X commit `9e07da3` states as fact that the second model "was a pre-merge revision of that
file"; there is no such revision, and that sentence is corrected here.** The one thing no sweep can
falsify is an uncommitted edit in a since-removed worktree, because an uncommitted edit leaves no
object at all — that residual possibility is stated plainly and the amendment rests on what is
recoverable, which points one way.

**What is true, and is the narrower fact decision 4 was reaching for:** because that file calls the
**exported** `frozenExtentsSlidAlongTheWall` directly, a mutation confined to the command's **call
site** cannot reach it. That is a property of every in-test model of the seam, including wave 6X's
own item 2, and it is what correction 2 below is about.

### 2. A record that accuses a file quotes it, and names the commit the quotation came from

Stated so it binds beyond this instance:

> **Code in a record is a quotation or it is nothing. A paraphrase set in a code fence is
> indistinguishable from a quotation to every later reader, and a paraphrase that invents an
> identifier the file does not contain cannot be checked against the file at all. A finding about
> code names the commit it was read at, and its snippet is copied rather than reconstructed.**

**This is the mechanism that produced decision 4, and it is worth stating because nothing else would
have caught it.** The snippet reads as evidence: it is in a `ts` fence, it names real functions, and
its shape is a plausible model of the seam. Every reader of this record — including the wave that was
dispatched to fix it — treated it as the code. The only tell was `storedHalves`, a name the file never
had, and finding that tell required sweeping the object database rather than reading the record.

**Two consequences that are procedure, not prose.** A record that shows code cites it as
`git show <sha>:<path>` and copies the lines, and a plan that assigns a fix to a described defect is
only dispatched once that defect has been reproduced from the named commit. Wave 6X's work item 1 was
dispatched without that step and cost an implementer a round.

**What this is not.** It is not a worktree-drift failure, and it is deliberately not filed as one: the
history shows no unmerged copy of the file in any state other than the merged one, and attributing the
error to drift would blame a failure the record cannot show happened.

### 3. Decision 3a's falsifiability sentence is false, and the criterion becomes two mutations

Decision 3a claimed the shipped-kitchen divergence *"fails the moment `frozenExtentsSlidAlongTheWall`
leaves the planning map."* Measured against wave 6X as delivered (`9e07da3`), with the call in
`rebuildEveryBodyAt` reverted to the identity: **0 of item 2's 4 assertions go red, 0 of item 4's 2,
and only item 3's go red.**

**The reason is structural and is not a defect in the test.** Item 2 builds both planning maps inside
the test through `planningOperandsOf`, calling the exported function itself, so nothing done at the
command's call site can reach it. Item 4 sweeps the fixture and calls no slide at all.

**It is also not dischargeable by rewriting item 2 to route through the command.** The shipped
kitchen's command output is byte-identical with the slide removed — the measurement that created this
wave. An item 2 routed through `setCabinetDepth` would necessarily be green under the mutation, or it
would refute the premise the wave rests on.

**So the criterion is two mutations, and each item answers to the one that can reach it**, as
rewritten in the wave plan above:

| Mutation | What it tests | Which item must go red |
| --- | --- | --- |
| The **call in `rebuildEveryBodyAt`** reverted to the identity | that the command **uses** the rule | **Item 3**, and it is the seam's witness |
| The **exported function's body** neutered to the identity | that the rule **is** what ADR 0090 decision 6 says | **Item 2**, and it is the export's witness |
| A **fixture** change giving wall B a deletable member that rebuilds taller than it records | that the shipped kitchen still cannot witness item 3 | **Item 4**, and it is the fixture's own tripwire |

Neither of the first two discharges the other, and decision 1 is satisfied by the pair. **Item 2
witnesses the export rather than the seam, and saying so is the accurate description rather than a
concession** — ADR 0090 decision 6 names the exported function, so an assertion about the exported
function is an assertion about the rule.

**Item 2 is not a `docs/WORKFLOW.md` "both sides fed by the same source" guard, and the question was
asked and answered rather than waved past.** Its expected side is independent literals, and each is
checked twice: once against the design document's own `columnExtents` entry, once against the
planning map. The document and the map must each agree with a third party rather than with each
other, so nothing supplies both sides. It would be a tautology only if the expected values were read
back out of the map, and they are not.

### 4. The 820 / 860 gap is carried by four wall-A rows, not by the dishwasher niche alone

`A|2.00` is the column ADR 0088 measured, and this record read that as the only instance. Measured
from the fixture: **`p0` `base-sink-800` at `A|1.30`, `p1` `base-dishwasher-600` at `A|2.00`, `p2`
`base-hob-2drawer-600` at `A|2.60` and `p4` `base-drawer3-600` at `A|3.20` each record 820**
(`kitchen-l-design.ts:830,831,835,836`), and a depth change rewrites all four to 860.

**Nothing downstream of the error changes.** Wall B still holds no instance of the gap, item 3's
declared design is still owed, and decision 3b stands as written. The correction matters because a
reader who goes looking for "the 820 row" finds four, and because a criterion written against one row
would under-sweep.

### 5. Item 4's histogram is arm-order dependent, and its label for the corner returns is the wrong reason

`whyItCannotWitness` returns on the **first** arm that matches, so the asserted `3 not deletable / 1
manufactured / 3 pinned / 2 rebuilds to the height it records` is a fact about the predicate's arm
order as much as about wall B. The three corner returns satisfy `not deletable` **and** `no catalogue
equivalent`; `p7` satisfies two arms; reordering yields `0 / 1 / 3 / 2 / 3` from the same nine
members. A histogram that four different predicates can produce is not falsifiable for the reason it
was written.

**The reason that actually excludes the corner returns is the second one.** A structural return
carries no `catalogEquivalentId`, so it is reseated and never fitted through a §7 row — it could not
refuse a rebuild whether or not anything could delete it. This record's own table above says exactly
that about `B|0.74` and then the wave's test credited the wrong arm.

The criterion in the wave plan is now **per member, by id, against every reason that applies**, with
the totals kept only as a secondary assertion. QA's pinned reason set is the artefact that discharges
it.

### 6. A third weakening nothing catches: the swapped depth operands. Classification upheld, and a wave is owed

Adversarial QA measured that swapping `cabinetDepthMm` and `previousCabinetDepthMm` at the planning
call site slides a member-less extent 100 mm the **wrong way**, differs on 6 of 508 trails, and leaves
the whole tree green. Command output is byte-identical over all 508, so it is unobservable at the
boundary. QA classed it coverage residue rather than a defect.

**The classification stands.** It is not an implementation defect — production passes the operands the
right way round — and it is not a contract gap: ADR 0090 decision 2's ladder states which direction
each rung moves. It is a test-fidelity problem, which is what "coverage residue" names here. The
structural reason is worth recording: the swap reverses `fromCabinetDepthMm` / `toCabinetDepthMm` in
`alongWallQueryFor`, which only the **declared-chain** rungs read — an occupied extent moves by
`membersShiftMm` and is indifferent to the swap — so exactly the rungs with the least document
evidence behind them are the ones nothing asserts.

**But "coverage residue" does not mean nothing is owed, and decision 1 is the reason.** A ruled
behaviour the tree cannot distinguish from its own absence is unshipped; a ruled **direction** the
tree cannot distinguish from its own reverse is unshipped by the same sentence, one rung down. Wave
6X pays the debt for the slide's existence and not for its direction, and it cannot be widened to:
6X is delivered at `9e07da3` with QA at `4b0eec4`, and ADR 0090 Amendment B's addendum — *"the residue
is recorded with its measurement and a named wave before the merge"* — is the precedent for recording
it here and naming a wave rather than reopening a review round. **That wave is 6X-a**, planned below.
It gates nothing and is owed before M6 closes.

**Not folded into 6X, and not into backlog 51.** 6X's scope statement says the wave stops if anything
outside its list moves; adding a rung-direction witness after QA has read it is the widening decision
5 refused for 6K-i, in the same milestone.

### Records swept before amending

| Record | What it says | How it is settled |
| --- | --- | --- |
| [ADR 0090](0090-a-frozen-space-slides-with-its-run-and-follows-the-body-it-recorded.md) decisions 2 and 6 | The ladder, and the planning map built from the extents as decision 2 moves them | **Untouched.** No rung, chain or coordinate is re-decided; §6 asserts a direction decision 2 already states |
| ADR 0090 decision 7 / Amendment B | An invariant edited to accommodate a defect is the defect laundered | **Honoured.** No expected value in any existing test moves; work item 1's withdrawal removes the only edit that could have moved one |
| ADR 0090 Amendment B addendum | Residue is recorded with its measurement and a named wave | **The precedent for §6.** Applied to 6X's own residue as 6X applied it to 6K-i's |
| [ADR 0088](0088-a-depth-change-plans-against-the-frozen-extent-and-re-derives-only-the-depth.md) decision 2 | One author for the axis split | **Untouched as a rule; its example here was wrong.** The two implementations agreed from the first merged revision, so nothing had parted |
| [ADR 0085](0085-a-normalisations-guard-asks-what-the-normalisation-changes.md) decision 3 | Relevance is observed, never declared | **The governing precedent for §5.** A histogram four arm-orders can produce declares more than it observes |
| ADR 0085 decision 6 | A criterion no test can fail is not a criterion; withdraw as stated | **The governing precedent for §3.** The criterion is replaced by strictly more falsifiable claims, not softened |
| [ADR 0079](0079-a-republished-depth-names-the-body-it-came-from.md) decision 10 point 3 | Non-vacuity, asserted rather than assumed | **Upheld, and §6 is its next application** |
| [ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md) decision 3 | A counter must not be rewritten in the diff its own output is the evidence for | **Engaged and honoured.** This amendment corrects a record, not an instrument; wave 6X's tests are not rewritten to make its criteria true |
| This record's decisions 1, 2, 3b, 5, 6 | The witness is owed; the fixture is declared by the test; the consequence needs a declared design; 6K-i merges; nothing else moves | **All stand, unamended** |
| `docs/best-practices/product-invariants.md` | Structural dependencies of geometry and visuals | **Not engaged.** No builder, anchor, scaling rule or screenshot is reached |

**No earlier record is overturned by this amendment**, and the one thing that looked like an
overturning — decision 4 — is withdrawn as unfounded rather than reversed, because there was never a
state of the code for it to have ruled on.

### Consequences

- **Wave 6X keeps its goal and loses one work item.** Items 2–5 are delivered and stand; item 1 is
  withdrawn as owed nothing, and the wave's `Touches` narrows to the one new file.
- **6X's mutation criterion is now dischargeable**, in two mutations rather than one, and QA can
  report against it without arguing.
- **A rule about how code enters a record**, in §2, is the durable half of this amendment: a
  quotation with its commit, never a paraphrase in a code fence. It costs one line in a record and
  saves a dispatched round.
- **Wave 6X-a is opened** for the swapped-operand residue, below. No backlog entry: it is scheduled
  and owned.
- **Nothing is owed to the owner.** No seeded row, room, catalogue entry or price moves, and the
  conditional owner input decision 3b records still has not been triggered.

---

## Wave 6X-a — the ladder's direction is asserted, not only its existence

**To be pasted into `docs/milestones/done/M6-price-and-global-settings.md` after wave 6X.**

**Tier: test fidelity, domain package only. No production code, no fixture, no runner evidence.**

**Goal.** Give the declared-chain rungs of `frozenExtentsSlidAlongTheWall` an assertion that goes red
when the depth operands are swapped, so that a rung which moves an extent 100 mm the wrong way is
distinguishable from one that moves it right.

**Gates on 6X** being merged; it asserts the same seam and would collide in the same file's directory.
It gates nothing.

**Why it is its own wave.** ADR 0093 Amendment A §6, on ADR 0090 Amendment B addendum's rule: 6X is
delivered with QA read against it, and this is a rung 6X's scope statement does not cover.

**Touches.** One new test file in `packages/configurator-domain/tests/`. **No `src/` file. No fixture.
No `apps/web` file. No schema, no golden map, no screenshot, no e2e spec.**

**Work item 1 — a member-less extent's arriving coordinate, asserted by value.** On a design that
carries a member-less column — the shipped kitchen after the oven tower is deleted is one, and the
6K-i adversarial file already builds it — the slid extent's along-wall coordinate and key are asserted
as literals at both declared settings, in both directions.

**Work item 2 — the swap is demonstrated to be caught.** QA swaps `cabinetDepthMm` and
`previousCabinetDepthMm` at `rebuildEveryBodyAt`'s planning call site and at the exported function's
own operand read, records the red set for each, and restores both.

**Acceptance criteria.**

- **The member-less extent's arriving key and along-wall coordinate are asserted as literals**, per
  setting and per direction — never as "it moved", never as an inequality, and never as a bound.
- **The 100 mm the swap displaces is named with both numbers**: the coordinate the correct direction
  produces and the one the swap produces, so a rung that moves the right distance the wrong way is
  told apart from one that does not move.
- **Every new assertion goes red under the swap at the call site**, and QA records which and with what
  values. **A wave whose tests stay green under that swap has not discharged its goal.**
- **Occupied extents are asserted unchanged under the swap**, because they move by `membersShiftMm`
  and are indifferent to it. A wave that made an occupied extent move under the swap has found
  something else and reports it.
- **Wall A is unmoved**, key for key and value for value (ADR 0090 decision 2 rung 1).
- **Nothing outside this wave's file goes red under the swap**, and if something does, ADR 0093
  Amendment A §6's byte-identity measurement was incomplete and the finding is reported.
- **`pnpm check` green**, and `pnpm format:check` over the whole tree at the wave's end.

**Risks.**

- **The member-less document may be harder to build than the 6K-i file makes it look.** If it cannot
  be built without a seeded change, the wave stops and reports rather than moving the fixture — ADR
  0093 decision 2 binds unchanged.
- **Scope creep into the occupied rung.** Rung 1 is witnessed by wave 6X item 2 and is not re-asserted
  here beyond the indifference check above.
