# ADR 0119 — A remembered fact about this repository is a claim to re-check, and "true at HEAD" is not "true at the end of the milestone"

Status: Accepted (adjudication; the eight instances are matters of record, six of them the
coordinator's own and reported by them. **Overturns nothing** — it records how evidence is handled,
not what was decided)
Date: 2026-09-15
Type: Decision (adjudication)
Milestone: Cross-cutting — binding on every plan, review, QA report and decision record

**This record passes [ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md)'s
own test, which is why it exists rather than being refused by it.** The problem has **occurred, eight
times in two days**, and is not foreseeable-in-principle. 0118 refuses machinery for a state the
system has never been in; this is a rule about a failure that keeps happening.

## Context

**Eight claims were asserted from memory and were wrong. Every one was true when it was first
learned.** Six are the coordinator's, reported by them; two are the architect's, found in this
record's own drafting. None came from carelessness about the repository — they came from **re-using a
fact without re-checking it**.

| Claimed | Actually | Whose |
| --- | --- | --- |
| `POST /api/designs` hardcodes the saved design | It is the **mint seed**; wave 7E2 `PUT`s the real document before navigating | coordinator |
| Wave 7H *"has no plan at all"* | A full punch list existed — **only its wave-table row had been read** | coordinator |
| *"No stored designs exist"* | **Five rows**, measured 2026-09-02 ([ADR 0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md)) | coordinator |
| ADR 0110 Amendment F *"is owed by 7D3"* | It is **7D4's** slice S0; 7D3 owed Amendment E, which exists | coordinator |
| *"Gate O2 is still the owner's"* | **Closed 2026-09-11**; [ADR 0113](0113-step-1-copy-is-approved-as-drafted-and-enters-the-copy-lock-in-the-wave-that-adds-it.md) decision 3 approves the Russian with the Romanian | coordinator |
| ADR 0118's *"milestone plans are archived when a phase closes"* | `AGENTS.md:16` is stronger — a Done milestone **"must not be read"** | architect |
| *"The 0019 amendment is in HEAD"* | Half of it was. A grep for the heading matched **a pointer quoting the heading**, inside the half that had landed | architect |
| *"Done — two files"*, acted on as a description of the tree | True when sent. The two writes landed seconds apart and the commit fell between them, taking **half an amendment** and leaving ADR 0019 at HEAD pointing at a section that was not there | coordinator |

**The count is eight, counted on 2026-09-15 while writing this record — and it was "five" in the
brief that commissioned it, then "seven" an hour later.** That is not sloppiness in the brief; it is
decision 4 demonstrating itself before the record was finished. **A count is a measurement with a
timestamp**, and a reader should treat this table as *what had happened by the afternoon of
2026-09-15*, not as a total.

**The fifth reached the owner** and nearly shipped a comment telling readers an approval was pending
that they had already given. **The seventh is in this record deliberately**: the check that produced
it was a verification performed *for this very ADR's subject*, and it still nearly passed a broken
state as correct.

### Why this is not a discipline problem

A remembered fact is **cheap to state and expensive to doubt**, and in a repository that moves this
fast the ones that feel most settled are the oldest — which is exactly the property that makes them
most likely to have moved. *"No stored designs exist"* was true at the start of the project, was
repeated for weeks, and had been false by measurement for thirteen days when it was last asserted.
**The feeling of settledness is evidence of age, not of truth.**

## Decision

**1. A remembered fact about this repository is a claim to re-check, not a fact to cite.** Before it
enters a plan, a review, a QA report, a decision record or a message to the owner, it is re-read at
HEAD. This is cheap — seconds — and it is the whole of the rule.

**2. Check hardest what feels settled.** *(The counter-intuitive half, and the one the evidence
actually supports.)* Every instance above felt certain to the person asserting it; none was a fact
being guessed at. **So "I am sure of this" is not a reason to skip the check — it is the condition
under which the check pays.** A fact you are unsure of gets looked up anyway.

**3. "True at HEAD" and "true at the end of this milestone" are different claims, and a written
milestone plan makes the difference knowable.** Verifying at HEAD is necessary and **not
sufficient**. Before relying on a fact, ask whether a **scheduled wave** ends it.

The worked case: *"a design id grants a read to anyone holding it"* is true at HEAD, was verified,
and wave **7E3b** — already planned, in the same milestone — is what ends it. A plan citing the
verified version without naming the scheduled change is **correct today and misleading for exactly
as long as it matters.** M7 wave 7P1's ruling P3 states it in the form this decision asks for: the
fact, and the wave that ends it, in the same sentence.

**4. A citation carries when it was checked, and against what.** A file-and-line reference with a
commit — *"re-read at `9240d4f`"* — is checkable. The same reference without one **looks** verified
whether or not it still is, and **the third person to quote it will not re-check.** This is why
decision records in this repository state their measurement commit, and why a wave plan's ground
truth names the tree it was measured against.

**5. A report about a working tree describes a moment, and the burden is on the READER of it, not
the writer.** *(The eighth instance, and the direction matters — the coordinator asked for it to be
stated this way round, against their own interest.)* *"Done — two files"* was true when it was sent
and false when it was acted on, because the two writes landed seconds apart and the commit fell
between them. **The fix is not that every report carries a timestamp.** A message is asynchronous by
construction: **the writer cannot report a moment that outlasts the message**, however carefully they
word it. **So whoever acts on such a report re-reads the tree first** — `git status` before
`git add`, and a look at what is actually staged before committing. The same asymmetry as decision 1:
the person about to *act* on a fact owns checking it.

**6. A fact that cannot be checked is marked with the reason it cannot be, not hedged.** *"True when
last measured on this date, unmeasurable from here because it needs a credential no agent holds,
re-measurable only by someone who holds it"* is a usable claim: a reader knows its age, its status
and who can settle it. **"Unverified" is not** — it says nothing about whether checking is possible,
expensive or forbidden, and it reads as an apology rather than as information.

**7. A check must be able to tell a thing from a mention of it — and that is a family, not an
instance.** *(From this record's own drafting; both agents hit the same pair independently.)*
Grepping for a heading matched a **pointer quoting that heading**, and the hit read as confirmation
that the section existed. It generalises immediately: **a grep for a constant finds the comment that
names it; a grep for a function finds its own doc line; a grep for a heading finds its
cross-reference.** Read the region, or search for something only the real thing can contain.

**A second shape of the same failure, met while correcting this very record:** raising the count
above left five stale *"seven"*s behind, and the phrase search for them **missed one because Markdown
had wrapped it across two lines.** A grep for a phrase cannot find a phrase that is not on one line.
**So a check that reports nothing has told you nothing until you know it could have reported
something** — here, a word-boundary search for the bare number found what the phrase search could
not.

**The family is the one this project keeps meeting: *a check that cannot distinguish the property it
claims to hold*.** Named here because naming the family is worth more than the instance, and because
the same shape already has four dated precedents in this repository — none of which were recognised
as relatives until now:

- **A ledger row is not a schema.** [ADR 0020](0020-a-migration-file-is-not-an-applied-migration.md)
  decision 2 and [ADR 0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md)
  decision 1: *"level"* is claimed only after reading `information_schema` back.
- **A column's name is not its type.** `revision` present but nullable is a migration half applied,
  and a name-only reading calls it level while every save fails.
- **A green suite is not an executed one.** M7 wave 7T exists because five live database suites gate
  on a variable CI never sets — **passing by never running**.
- **A passing gate is not a passing gate when a filter sits in front of it.** The standing rule to use
  `rtk proxy` when the output text is the signal.

**So the question to ask of any check is not "did it pass?" but "could it have failed for the reason
I care about?"** A check that cannot fail that way is a ritual, and it is more dangerous than no
check, because it is reported as evidence.

## What this does not ask for

- **Not re-reading everything.** Only what is about to be **asserted**. A plan that reads forty files
  cites six.
- **Not distrusting the record.** ADRs and milestone plans are the evidence; the rule is that a
  memory **of** one is not a substitute for it, and that a record's own claims about code carry the
  commit they were measured at (decision 4).
- **Not slower work.** Seven of the eight instances would have cost one `grep`. The fifth cost a
  correction to the owner, and the seventh would have committed a decision record that pointed at a
  section that was not there.

## The positive case, because the discipline is visible when it works

Three from this record's own drafting, on 2026-09-15, kept so the rule is not defined only by its
absence:

- **A re-read strengthened an argument.** ADR 0118 cited *"milestone plans are archived when a phase
  closes"*; `AGENTS.md:16` actually says a Done milestone **must not be read**, which is a materially
  stronger reason for that ADR to exist than the one it had. **Remembering could not have produced
  it.**
- **An unmeasurable claim was marked with its structural reason** rather than hedged (decision 5),
  naming the credential required and who could settle it.
- **An ADR states when its citations were verified** (decision 4), because a citation reused hours
  later looks verified whether or not it is.

## Alternatives considered

- **Leave it as a working habit.** Rejected: it was a working habit, and it failed eight times in two
  days across two different agents. **A habit nothing records is a habit that decays when the day
  gets long**, which is when these all happened.
- **Fold it into ADR 0118.** *Rejected, and the reasoning is worth keeping:* 0118 says *do not build
  for a problem that has not occurred*; this says *re-check what you cite*. **Different
  propositions**, and folding this evidence in would have blurred a record whose value is a sharp
  test. **0118's test is also what licenses this record** — the problem has occurred.
- **Require a citation for every assertion.** Rejected as the opposite failure: it makes ordinary
  prose unwritable and would be abandoned within a day. The rule is scoped to facts **about this
  repository** that a reader would act on.
- **Automate it — a linter over file-and-line citations in docs.** Rejected **for now, and recorded
  with its trigger** under ADR 0118: line numbers drift constantly and the tool would cry wolf until
  nobody read it. **Trigger: a citation-checking pass that finds stale references faster than a
  human re-read does.** Nothing is built.

## Consequences

- **Reviews gain one question**, symmetrical with 0118's: *is this asserted from memory, and is there
  a scheduled wave that ends it?*
- **A decision record names its measurement commit.** ADR 0118 does; this one does; later records are
  expected to.
- **A fact stated to the owner is re-checked first.** The fifth instance is why this consequence is
  stated separately from the rest.
- **This record will itself go stale**, and decision 4 applies to it: its eight instances are dated,
  and a reader in six months should treat the table as history rather than as current practice.

## Decision-record sweep

| Record | What it says | How it is settled here |
| --- | --- | --- |
| [0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | A problem that has not occurred is recorded with its trigger, not built for. | **Sibling and licence.** This record passes its test — the problem occurred eight times — and the automation alternative above is refused under it, with a trigger named. |
| [0038](0038-pre-release-no-stored-designs-no-migrations.md) | Its premise was carried forward unchecked and measured false **twice**, each correction saying so in the same words. | **The founding instance, and it corrected itself in exactly this record's terms**: *"a deferral justified by reachability is only as good as the last time somebody re-checked the surfaces."* This ADR generalises that sentence from one premise to every cited fact. |
| [0052](0052-800-mm-is-the-ceiling-on-any-empty-column.md) | Five `designs` rows exist, `schema_version` 1, measured 2026-09-02. | **The measurement that falsified ADR 0038's headline**, and the third instance's correct value. |
| [0102](0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md) | A recorded source must explain its depth; a second authority is the defect laundered. | **Consistent, and the nearest relative**: both are about evidence that looks authoritative and is not. That record governs *code*; this one governs *citations*. |
| [0096](0096-the-deployed-schema-is-proved-by-a-gate-and-production-was-never-in-the-runners-path.md) decision 1 | A ledger row is evidence about what the runner did, never about the schema; *"level"* is claimed only after reading the schema back. | **The same rule, already accepted for databases.** This record applies it to prose: **a memory of a fact is evidence about what you once read, never about the tree.** |
| `AGENTS.md:16` | A Done milestone is archived and **must not be read**. | **Re-read at `69a9d11`** — and the sixth instance is that this ADR's sibling first cited it in a weaker form. |
