# ADR 0123 — A ruled behaviour whose discriminating population is emptied by a later wave keeps its branch, and its sweep coverage converts to a declared witness

Status: Accepted (adjudication; generalises a ruling made inside M7 wave 7D8's adjudication, "Finding
B — P6b is empty", 2026-09-17)
Type: Decision (adjudication)
Milestone: M7 — raised by wave 7D8, binding on any wave whose re-keying empties an earlier wave's
discriminating population

## Context

Wave 7D8 re-keyed `generation-priorities.ts`'s prefix/suffix wall assignment from the literal
constant `PREFIX_WALL = "B"` to a value derived from the entered wall lengths. That re-keying is
correct and is the whole of what the wave was for.

It had a side effect nobody in the wave's plan had reasoned about until the coordinator raised it as
a stop condition: wave 7D4's rule — *the first storage slot after the hob, in the reading order, takes
`base-3drawer`* (ADR 0110 Amendment H1, D15.7) — is implemented through a function,
`firstStorageSlotAfterTheHob`, with two branches. One branch is taken when the hob stands on the
suffix wall; the other, a **descending** index path reached only through the **prefix** branch, is
taken when it does not. At HEAD, before 7D8, `PREFIX_WALL` was the literal `"B"`, and criterion 1's own
measurement — the hob stands on the wider wall in 100.00% of both arms, zero exceptions — means the
hob **always** stands on the suffix wall in the range `APPROVED_ROOM_POLICY` admits. The prefix branch
was therefore never reachable by a swept room even at HEAD; wave 7D8 did not create that unreachability,
it only exposed it, because before the re-key *"wall B"* and *"the prefix branch"* named the same set
by coincidence — `PREFIX_WALL` **was** `"B"` — and 7D8's own re-key is what makes them refer to two
different things for the first time.

7D8's own criterion 7, as planned, read: *"the assertion names P6's size and fails if that arm is
empty."* Discharging that criterion literally would have meant either (a) treating a zero-count
population as a failed wave, when the wave's own criterion 1 is what empties it and criterion 1 is
correct, or (b) quietly deleting the branch the zero count belongs to, on the reasoning that dead code
may be removed. Both are wrong, and the 7D8 adjudication (`docs/milestones/M7-room-and-presets.md`,
*7D8 adjudication — S2's stop conditions*, Finding B) worked out why in detail specific to that module.
This record extracts the general rule, because — as that adjudication itself said — it "generalises
beyond 7D8 and beyond `generation-priorities.ts`," and a rule that lives only in one milestone plan has
a shelf life `AGENTS.md` and `docs/WORKFLOW.md` both warn about.

## The distinction this record exists to keep separate

Two things read as the same failure from a sweep floor alone — *"this arm now measures 0 where it used
to measure something"* — and they call for opposite repairs.

| | what it looks like | what it actually is | the repair |
| --- | --- | --- | --- |
| **A stale instrument** | a floor reads 0 | the population did not empty; the thing counting it stopped counting the right thing | **repair the instrument.** The floor itself is not lowered — once repaired it must read non-zero again, and if it does not, that is a new finding |
| **An emptied population** | a floor reads 0 | the population genuinely emptied, because an earlier wave's own correct rule (here, criterion 1 with zero exceptions) makes the branch unreachable under the admitted input range | **re-site the coverage** — see Decision below |

7D8 had one of each, in the same module, discovered together, and the adjudication's own table
(*"the governing rule, so the two are never confused again"*) is the source this record promotes. A
check that cannot tell the two apart will do the wrong thing to at least one of them.

## Decision

**A ruled behaviour whose discriminating population is emptied by a later wave keeps its branch, and
converts its sweep coverage into a declared witness. Neither a floor that reads 0 because the
instrument is stale, nor one that reads 0 because the population emptied, is ever relaxed to 0.**

1. **The branch is kept, never deleted, solely because its measured population went to zero.** Three
   reasons, none of them specific to 7D8's module:
   - **Deleting it narrows the rule it was written to prove**, not merely the code path. In 7D8's case,
     collapsing `firstStorageSlotAfterTheHob` to the suffix wall's first slot would silently narrow ADR
     0110 Amendment H1's ruled *"first slot after the hob, in the reading order"* to *"first slot on the
     hob's own wall"* — the exact confusion the rule exists to prevent, re-introduced by deleting the
     code that keeps the two apart.
   - **Emptiness from bounds is a coincidence of policy, not a property of the rule**, and policy bounds
     move independently of the rule that happens to sit inside them at the moment they are measured. A
     later wave that widens the very bounds that emptied the population (in 7D8's case, anything that
     lets the hob leave the suffix wall) would, against a deleted branch, silently stand a body at the
     wrong end with no count, width, remainder, cut, provenance or digest moving to say so — exactly the
     "silent reversal" class this milestone ranked its highest risk for a reason.
   - **ADR 0118 governs the converse of this, and does not license deleting here.** 0118 forbids
     *building* for a problem that has not occurred. An already-shipped, already-ruled branch whose
     discriminating population shrank to zero is not a problem that has not occurred — it is ruled
     behaviour whose witness went stale. 0118's discipline is about restraint before building; this
     record is about honesty after a population moves.
2. **ADR 0093 decision 1 applies without amendment**, restated at the point it binds: *"a ruled
   behaviour that the tree cannot distinguish from its own absence is unshipped, whatever the code
   says."* An emptied population makes that true again for a rule that was witnessed when it shipped,
   so the obligation reopens rather than lapses — the rule does not get to keep a coverage credential
   earned against a population it no longer has.
3. **The remedy is the one ADR 0093 decisions 2 and 3b already supply: a design the test declares**, at
   the unit boundary, never sought by widening a sweep and never discharged by a comment. The test
   states, in its own words, that the arm is unreachable from the current admitted range and why — so a
   later reader does not file it as a live customer defect, and a later wave that changes the bounds
   knows exactly which test to re-examine.
4. **A sweep floor that reads 0 for either reason is never simply lowered to 0.** A floor lowered to
   accommodate an empty reading treats "we stopped testing this" as equivalent to "there is nothing
   here to test," and the two are never the same fact. The floor is either repaired (stale instrument)
   or replaced by the declared witness (emptied population) — the number 0 never becomes the new
   contract.

## What this does not decide

This record does not decide whether any *particular* population is stale-instrument or
genuinely-emptied — that is a measurement question, answered case by case exactly as 7D8's adjudication
answered it for P6a (physical wall B — the instrument was stale, repaired) against P6b (the prefix
branch — the population had genuinely emptied, re-sited to a declared witness at
`drawer-rows.test.ts`). It supplies the test for telling the two apart and the two remedies; it does
not supply the answer for a future instance.

## Alternatives considered

**Fail the wave when a criterion's named population reads zero, unconditionally.** Rejected: it would
have failed 7D8 on its own success (criterion 1, hob on the wider wall, zero exceptions) rather than on
a defect, and would make every future wave that correctly narrows a population look like a regression.

**Delete a branch once its sweep coverage reads zero.** Rejected in Decision 1 above; this is the
option Finding B in 7D8's adjudication considered and refused, for the reasons restated there.

**Lower the floor to 0 and record a comment.** Rejected under ADR 0093 decision 1: a comment does not
go red, and a lowered floor is indistinguishable from "no rule here" to the next sabotage run.

## Consequences

- **A wave that re-keys or otherwise moves a policy boundary must check every downstream rule's
  discriminating population before treating a zero reading as either a pass or a failure.** This is
  now a named check rather than something each wave has to re-derive from first principles.
- **`docs/decisions/0093-...md` decisions 1, 2 and 3b are the mechanism this record routes to.** This
  record adds the trigger — a population emptying under a *later* wave's own correct rule — and the
  distinction from a stale instrument; it does not restate 0093's construction.
- **`ADR 0118` is distinguished rather than contradicted**: 0118 is about not building ahead of a
  problem; this record is about not deleting behind one.

## Records swept before deciding, and how each is settled

| Record | What it says | How it is settled |
| --- | --- | --- |
| [ADR 0093](0093-a-rule-the-shipped-kitchen-cannot-exercise-owes-a-witness-not-a-moved-fixture.md) decision 1 | A ruled behaviour the tree cannot distinguish from its own absence is unshipped. | **Applied, not amended.** This record names the trigger under which decision 1 reopens for a rule that was witnessed at ship time. |
| ADR 0093 decisions 2 and 3b | The witness is a design the test declares, never sought by widening a sweep. | **The supplied remedy, cited rather than restated.** |
| [ADR 0091](0091-an-instruments-premise-is-re-quantified-and-the-product-claim-inside-it-becomes-a-wave.md) Amendment A | No assertion of a ruled behaviour may be weakened when re-planning around it. | **Corroborates.** Lowering a floor to 0 would be exactly the weakening Amendment A forbids. |
| [ADR 0118](0118-a-problem-that-has-not-occurred-is-recorded-with-its-trigger-and-not-built-for.md) | A foreseeable, not-yet-occurred problem is recorded with its trigger and left unbuilt. | **Distinguished, not applied.** 0118 is about restraint before building; here the behaviour already shipped and the question is whether to delete it, which 0118 does not address. |
| [ADR 0121](0121-a-thing-is-identified-by-what-it-is-and-the-discriminating-case-is-the-one-nobody-screenshots.md) | A thing is identified by what it is, not by what correlates with it. | **The instance this record's "stale instrument" row is**: *"on wall B"* and *"reached through the prefix branch"* correlated by coincidence at HEAD and diverged the moment the correlate moved. |
| M7 wave 7D8's adjudication, *Finding B* | The specific ruling this record generalises. | **Source.** This record is that finding's durable form, per the adjudication's own closing note that an ADR was owed and not written there. |

## Where the live instance is

The concrete instance — `firstStorageSlotAfterTheHob`'s descending-index path in
`packages/configurator-domain/src/generation/generation-priorities.ts`, and the declared witness added
for it in `packages/configurator-domain/tests/generation/drawer-rows.test.ts` — is 7D8 slice S3's, and
is recorded in `docs/milestones/M7-room-and-presets.md`'s 7D8 close-out. This record states the general
rule; it does not restate that instance's line numbers, which belong to the milestone file and the
code.
