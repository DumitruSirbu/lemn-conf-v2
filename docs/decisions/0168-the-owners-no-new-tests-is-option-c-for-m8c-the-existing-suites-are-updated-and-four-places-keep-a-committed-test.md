# ADR 0168 — The owner's "no new tests" is option C for M8C: the existing suites are updated, and four places keep a committed test

Status: **Accepted — 2026-10-17**, on the owner's answer **"C"** to the M8C plan's Q-1 [relayed by the coordinator; a
selection of an option the architect wrote, not a quotation]. **Scope: the waves of M8C only.** This is not a standing
amendment of `docs/WORKFLOW.md`'s paired-test rule.
Date: 2026-10-17
Type: Decision (owner ruling, relayed)
Milestone: M8C (plan: [`milestones/M8C-generation-fill-and-preset-authoring.md`](../milestones/M8C-generation-fill-and-preset-authoring.md), §4)

**Evidence tiers.** *[doc]* quoted from this repository; *[plan]* what the M8C plan §4 states; *[relayed]* the
coordinator's relay of the owner's answer; *[inf]* inference. The scribe ran nothing and has no shell.

## Context

The owner asked for the M8C fixes to be implemented without writing new tests [plan §4: *"The owner asked for
implementation without writing new tests"*; the owner's own words are not quoted in the plan]. `docs/WORKFLOW.md`
requires a paired regression test per behaviour change (*Scope discipline*), makes adversarial QA the gate in front of
review (*QA before review*, AGENTS.md rule 4), and runs a test audit at a milestone's close
([ADR 0152](0152-a-test-is-kept-only-if-it-can-fail-for-the-reason-its-title-names-and-is-deleted-only-on-evidence.md)
Amendment A) [plan §4, doc]. The plan did not drop QA silently or override the owner silently: it offered three options
and recommended one. **The owner chose C** [relayed].

## Decision

**Option C: B (the owner's words, literally), with four exceptions where a gate or a runbook depends on a test.** [plan §4]

**What holds in every option, and therefore here:**
- the existing suites stay green;
- every existing assertion that encoded a bare end, a body count or a price that the fill changes is **updated, never
  deleted to make a suite pass**, and the reason is recorded in an ADR 0152 table in the hand-back (test, line, old
  value, new value, *"ADR 0167 D1"*); every QA-owned pin moved is reported (the 8U round A and 8V S4 precedent);
- adversarial QA **runs** and still gates review; what changes is only whether its probes are committed;
- review tiers are unchanged.

**The four committed exceptions:**
1. the `presets` arm of `application-role-privileges.test.ts` (the runbook's proof);
2. the save route's refusals: no credential, cross-site, stale revision, a finding, no sink or hob, a wrong image;
3. **one committed property**, criterion F-1 (no free run-end opening `≥ F`) over random rooms with `fast-check`, so Fix
   1's acceptance stays falsifiable after the wave;
4. the e2e of the owner's loop (wave P9), against a **fake** preset repository.

**Everything else is scratch:** QA's sweeps, sabotage in both directions (WORKFLOW R6) and browser runs are run and
**quoted in the close-out, not committed**.

## Alternatives considered

| Option | Implementers add tests? | QA's probes | What is lost |
| --- | --- | --- | --- |
| **A — WORKFLOW as written** | Yes, paired tests per slice | Committed (`qa-8c-*`) | Nothing. The default the rules require |
| **B — the owner's words, literally** | No new test files or cases | Scratch measurements, quoted | After the wave nothing in the gates would catch a regression of the fill or of the save refusals; the milestone audit has no new tests to audit; the `0011` runbook's step 3–7 proof cannot run (it is a test in `application-role-privileges.test.ts`) |
| **C — chosen** | Only the four above | Scratch for everything else, quoted | Coverage of the UI details and of matching's edges stays in QA's reports only |

Reason for C [plan §4]: it keeps the owner's intent (no test-writing effort on the editor UI or the domain details) and
keeps the four places where removing a test removes a guarantee somebody relies on: the owner's own grant proof, the
security reviewer's accepted-risk write path, and the owner's acceptance loop.

## Consequences

- A deviation from WORKFLOW is a decision to record, not a shortcut (milestones README, banner); this is that record.
- **Known cost, accepted by the owner's choice:** the UI of P4 and P8, matching and adaptation (P5), the read routes (P6)
  and the fill's details (other than F-1) have no committed test after M8C. Their evidence is scratch measurement
  quoted in each close-out. At M8C's close the test audit has the four exceptions and the updated existing tests to
  audit [inf: from the plan's §4 table; falsified if a later wave adds tests by another ruling].
- Every dispatch of an M8C wave quotes this answer for what tests may be written (plan §5).
- Records that cite a paired test for M8C behaviour (ADR 0167's F-criteria) are read with this scope.
