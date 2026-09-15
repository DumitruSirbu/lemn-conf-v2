# ADR 0118 — A problem that has not occurred is recorded with its trigger, not built for

Status: Accepted (owner preference, 2026-09-15, given twice from opposite directions; the test, the
discriminator and the evidence are the architect's adjudication and are marked as such. **Overturns
nothing** — it records a way of deciding, not a decision)
Date: 2026-09-15
Type: Decision (owner preference + adjudication)
Milestone: Cross-cutting — raised in M7 waves 7P1 and 7P2, binding on every plan and wave from here

## Context

**The owner gave the same instruction twice in one day, from opposite directions, about two
unrelated mechanisms.** That is why this is a record rather than a note in a wave plan.

On retention, having just retired a cleanup job nobody had run yet:

> *"to try to solve conflicts that at the moment we shouldn't create in general, like removing a
> private configuration that is used somewhere as a preset source."*

On schema versioning, asked whether stored documents should support multiple versions concurrently:

> *"we try to solve an issue that we don't have… let's focus on the functionality, not on solving
> potential problems that we didn't have yet. So just keep it stupid simple."*

And, in the same answer, what to do instead:

> *"migration solve this. You can set default values where you introduce a new one or you can drop
> existing values when the new functionality don't use them already."*

### Why it needed a record rather than a line in the milestone

**Three plans in a single day grew obligations for problems that did not exist**, and the failure
mode is the interesting part: **it is not laziness, it is the opposite.** A good plan enumerates
future hazards — that is most of what planning is — and **each hazard, once written down, looks cheap
to pre-empt.** The cost is invisible at the moment of the decision and arrives later, as machinery
nobody can delete because nobody can prove the problem will never occur.

*(The diagnosis is the architect's; the four instances below are matters of record.)*

| What was nearly built | For what problem | What it actually cost |
| --- | --- | --- |
| **A named constant holding a retention horizon**, carrying the owner's *"lets say"* so it could be revised in one line | A retention period the owner then removed entirely | **Struck from M7 wave 7P1 ruling P11 as an obligation with no reader.** A constant nothing consults is dead configuration that still has to be understood by everyone who meets it. |
| **A preset-specific schema-versioning scheme** | Preset documents drifting from design documents | **Refused in 7P1 ruling P1, ratified by P14.** `migrateDesign` and `CURRENT_SCHEMA_VERSION` already solve it; a second scheme is a second strategy for a solved problem, and two version numbers that must agree is [ADR 0028](0028-wall-depth-is-derived-from-the-worktop.md)'s defect. |
| **An *unsupported* marker on a row, a *"this kitchen is too old"* screen, and a sweep to set the marker** | A stored document the current build cannot migrate | **Recorded as must-nots in 7P1 ruling P14.** No such document has ever existed: every version this build has written is inside the supported range. |
| **Teaching a 30-day cleanup job about presets** so it would not delete the library | The cleanup deleting owner-authored data | **Dissolved: the owner retired the job.** The conflict was real against a model that no longer exists — and the cheaper fix was not to have the conflict. |

## Decision

**1. The test, stated so it can be applied rather than admired: *has this problem occurred, or is it
merely foreseeable?*** A problem that has occurred — a defect, an incident, a failing gate, a
measured limit — is fixed. A problem that is merely foreseeable is **recorded with its trigger and
left unbuilt**.

**2. Recording an obligation with its trigger named is cheap and reversible. Building machinery for
it is neither.** This is the half a careless reader will drop, so it is stated as the second
decision rather than as a qualification. **This record is not a licence to ignore a hazard — it is an
instruction to write it down and stop.** A sentence of the form *"when X happens, do Y"* costs a line
and is deleted by deleting the line. A column, a flag, a screen, a constant or a scheduled job built
for the same X must be kept working, tested, migrated and explained **whether or not X ever
arrives** — and after enough time nobody remaining can say why it is there.

**3. A recorded obligation names its trigger, not its likelihood.** *"When a migration genuinely
cannot be written for a stored shape, build the refusal surface"* is a usable record. *"We may one
day need a refusal surface"* is not: it cannot be acted on and it cannot be closed. The worked
example is 7P1 ruling P14 — `refuseUnsupportedVersion` throws an `InvalidDesignError` today, is
unreachable because no stored document is outside the supported range, and **the trigger for
building anything better is a document that cannot be carried forward, not the possibility of one.**

**4. The discriminator, and without it this record argues against the best decision of the day:
anticipate when the cost of acting rises at a datable event; record and stop when it does not.**

The counter-example is **M7 wave 7P1 ruling P2's nullable wall columns**, changed for a linear preset
**that does not exist and cannot exist until wave 7J**. That was correct, and it was not correct
because the problem was foreseeable — **it was correct because the cost of fixing it rises at a
datable moment.** Wave 7P2 is the point at which the owner begins authoring presets, after which the
column holds their data and a change to it is a migration rather than an edit. The same reasoning
covers geometry that wants re-deriving before 7P2 (waves 7D6 and 7D7).

**So the question to ask of any anticipation is not *"might this happen?"* but *"does it get more
expensive on a date I can name?"*** If it does, act now and say which date. If it does not, record it
with its trigger. **Cost that rises continuously is not a datable event** and does not qualify; *"it
will be harder later because there will be more code"* is true of everything and licenses anything.

**5. What this does not touch.** Correctness, security and the invariants already recorded. A defect
is not a foreseeable problem. A security control for an attack nobody has yet attempted **is not
machinery for a hypothetical** — the threat model is the occurrence, which is why
[ADR 0019](0019-security-baseline-writes-throttling-retention.md)'s baseline and
[ADR 0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md) decision 2's
gate are untouched by this record and must not be argued against with it. **The distinction is that a
security control answers a capability an adversary already has; the machinery this record refuses
answers a state the system has never been in.**

**6. Where it binds.** Every plan and every wave. In practice it is a question for the architect
writing a punch list and the reviewer reading one: **for each obligation this plan creates, has the
problem occurred, and if not, is its trigger named and is anything being built?**

## Alternatives considered

- **Record it in the milestone plan and nowhere else.** *Rejected, and it is the reason this file
  exists.* Milestone plans are archived when a phase closes (`AGENTS.md`), and
  [ADR 0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md)
  rejected the same option for the same reason. **A preference that outlived three plans in one day
  will outlive M7.** It was recorded in M7 wave 7P1 as well, deliberately — that is where a planner
  meets it first — with this record as the durable copy.
- **Fold it into ADR 0117 as an amendment.** Rejected: 0117 allocates *product decisions* between
  generation and presets. This allocates *engineering work* between now and a trigger. They are
  siblings — one about where taste enters, one about when machinery does — and 0117 carries a pointer
  rather than absorbing it.
- **State it as "YAGNI" and cite the literature.** Rejected: a slogan is what a reader argues with.
  The owner's two quotations, the four instances that prompted them and decision 4's discriminator
  are checkable; *"you aren't gonna need it"* is a mood, and it is also the exact phrase someone will
  reach for to delete a security control or a guard.
- **Make cheapness the test — build anything small.** Rejected on this record's own evidence: every
  one of the four instances was small. A retention constant is one line. That is precisely why they
  were nearly built, and why size cannot be the discriminator.
- **Require an owner ruling before recording any obligation.** Rejected as the opposite failure: it
  makes writing a sentence as expensive as building the machinery, and the whole point of decision 2
  is that the two differ by orders of magnitude.

## Consequences

- **A wave plan may record any number of future hazards, and should.** What it may not do is ship a
  column, a flag, a screen, a constant or a job for one. **The plans are not asked to foresee less.**
- **A reviewer gains a standing question**, and it is symmetrical: *is this machinery for a problem
  that has occurred?* — and, in the other direction, *is this obligation recorded with a trigger, or
  only with a worry?*
- **An obligation with a named trigger is closeable.** When the trigger fires, the wave that meets it
  finds the reasoning already done. When the trigger is removed — as the retention horizon was — the
  obligation is struck rather than inherited.
- **This record will be misused if decision 4 is dropped**, and that is its own principal risk.
  Without the discriminator it argues against nullable wall columns, against re-deriving geometry
  before the freeze, and against every other correct anticipation in M7. **A reader citing this
  record to refuse a change must show that the change's cost does not rise at a nameable event.**
- **It costs one line in each future plan** — the trigger — and nothing else.

## Decision-record sweep

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0117](0117-generation-produces-the-cheap-correct-baseline-and-the-owners-taste-enters-through-presets.md) | Generation owes correctness; taste goes to presets; a judgement call does not become a generator rule. | **Sibling, untouched.** That record allocates product decisions; this allocates engineering work between now and a trigger. 0117 gains a pointer line. |
| [0019](0019-security-baseline-writes-throttling-retention.md) decision 7 | An abandoned design is deleted after 30 days by a nightly cron (scheduled M8, never built). | **Retired by owner ruling, 2026-09-15** — *"We can remove this rule of 30 days clearance."* Nothing is deleted automatically; a manual script for kitchens older than about a year is a later possibility and is explicitly *"not automatically"*. **That ADR owes its own dated amendment; this record is not it.** |
| [0019](0019-security-baseline-writes-throttling-retention.md) decisions 1–6, 8–11 | The write-token split, throttling, the security baseline. | **Untouched, and decision 5 above says why they cannot be argued against with this record.** |
| [0112](0112-the-preset-library-is-owner-authored-data-behind-a-server-side-gate.md) decision 2 | The authoring gate: a flag, an owner secret, a server-verified cookie. | **Untouched.** A gate answers a capability an adversary already has. |
| [0028](0028-wall-depth-is-derived-from-the-worktop.md), [0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md) | Two numbers must not agree by luck; a second authority is the defect laundered. | **Consistent, and the reason the preset-specific versioning scheme was refused** — it would have been a second version number to keep in step with the first. |
| [0038](0038-pre-release-no-stored-designs-no-migrations.md) | Its premise was measured false twice, each time after being carried forward unchecked. | **The mirror-image failure, and worth naming**: that record deferred work on a stale premise. This one refuses work on a premise nobody has tested either. **Both are answered by naming the trigger and re-checking it**, which is what decision 3 requires. |
| `AGENTS.md` | Milestone plans are archived when a phase closes. | **Why this is an ADR** (alternatives, first entry). |
